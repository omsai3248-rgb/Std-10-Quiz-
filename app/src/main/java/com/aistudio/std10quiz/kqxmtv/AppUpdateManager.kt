package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.storage.storage
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class ApkInspectionResult(
    val fileName: String,
    val stagedFilePath: String,
    val fileSizeBytes: Long,
    val packageName: String,
    val versionName: String,
    val versionCode: Long,
    val apkSha256: String,
    val signingCertSha256: String,
    val signingCertSha1: String,
    val packageMatches: Boolean,
    val signatureMatches: Boolean,
    val isUpgradeOverInstalled: Boolean
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("fileName", fileName)
        put("stagedFilePath", stagedFilePath)
        put("fileSizeBytes", fileSizeBytes)
        put("packageName", packageName)
        put("versionName", versionName)
        put("versionCode", versionCode)
        put("apkSha256", apkSha256)
        put("signingCertSha256", signingCertSha256)
        put("signingCertSha1", signingCertSha1)
        put("packageMatches", packageMatches)
        put("signatureMatches", signatureMatches)
        put("isUpgradeOverInstalled", isUpgradeOverInstalled)
    }
}

object AppUpdateManager {
    private const val UPDATES_DIR_NAME = "updates"
    private const val STAGED_UPLOAD_FILE = "staged_admin_upload.apk"
    private const val PREFS_NAME = "std10_app_update_prefs"
    private const val KEY_PENDING_INSTALL_APK = "pending_install_apk_path"

    fun getUpdatesDir(context: Context): File =
        File(context.cacheDir, UPDATES_DIR_NAME).apply { mkdirs() }

    fun getInstalledAppInfo(context: Context): JSONObject {
        val pm = context.packageManager
        val pkgName = context.packageName
        val pkgInfo = getInstalledPackageInfoWithCerts(pm, pkgName)
        val versionName = pkgInfo?.versionName.orEmpty().ifBlank { "1.0.0" }
        val versionCode = if (pkgInfo != null) PackageInfoCompat.getLongVersionCode(pkgInfo) else 1L
        val (sha256, sha1) = extractCertFingerprints(pkgInfo)
        val canInstall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            pm.canRequestPackageInstalls()
        } else {
            true
        }
        return JSONObject().apply {
            put("packageName", pkgName)
            put("versionName", versionName)
            put("versionCode", versionCode)
            put("signingCertSha256", sha256)
            put("signingCertSha1", sha1)
            put("canRequestPackageInstalls", canInstall)
        }
    }

    fun inspectPickedApkUri(context: Context, uri: Uri): ApkInspectionResult {
        val updatesDir = getUpdatesDir(context)
        val stagedFile = File(updatesDir, STAGED_UPLOAD_FILE)
        val tempFile = File(updatesDir, "${STAGED_UPLOAD_FILE}.tmp")

        val resolver = context.contentResolver
        var displayName = "update.apk"
        runCatching {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) {
                        val name = cursor.getString(idx).orEmpty().trim()
                        if (name.isNotBlank()) displayName = name
                    }
                }
            }
        }

        val input = resolver.openInputStream(uri)
            ?: throw IllegalStateException("Selected APK file could not be opened.")
        input.use { inStream ->
            FileOutputStream(tempFile).use { outStream ->
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val read = inStream.read(buf)
                    if (read <= 0) break
                    outStream.write(buf, 0, read)
                }
            }
        }
        if (stagedFile.exists()) stagedFile.delete()
        if (!tempFile.renameTo(stagedFile)) {
            tempFile.copyTo(stagedFile, overwrite = true)
            tempFile.delete()
        }

        return inspectLocalApkFile(context, stagedFile, displayName)
    }

    fun inspectLocalApkFile(
        context: Context,
        apkFile: File,
        explicitFileName: String? = null
    ): ApkInspectionResult {
        if (!apkFile.exists() || apkFile.length() <= 0L) {
            throw IllegalStateException("APK file is empty or missing.")
        }
        val pm = context.packageManager
        val archiveInfo = getArchivePackageInfoWithCerts(pm, apkFile.absolutePath)
            ?: throw IllegalStateException("Invalid APK file: unable to parse Android package archive.")

        val installedInfo = getInstalledPackageInfoWithCerts(pm, context.packageName)
        val installedCode = if (installedInfo != null) PackageInfoCompat.getLongVersionCode(installedInfo) else 1L
        val installedVersionName = installedInfo?.versionName.orEmpty().ifBlank { "1.0.0" }
        val (installedSha256, _) = extractCertFingerprints(installedInfo)

        val archivePkg = archiveInfo.packageName.orEmpty().trim()
        val archiveVerName = archiveInfo.versionName.orEmpty().ifBlank { "1.0.0" }
        val archiveVerCode = PackageInfoCompat.getLongVersionCode(archiveInfo)
        val (archiveSha256, archiveSha1) = extractCertFingerprints(archiveInfo)
        val apkFileSha256 = computeFileSha256Hex(apkFile)

        val pkgMatches = archivePkg == context.packageName
        val certMatches = if (installedSha256.isNotBlank() && archiveSha256.isNotBlank()) {
            installedSha256.equals(archiveSha256, ignoreCase = true)
        } else {
            archiveSha256.isNotBlank()
        }
        val isUpgrade = archiveVerCode > installedCode ||
            (archiveVerCode == installedCode && compareVersionNames(archiveVerName, installedVersionName) > 0)

        val cleanName = (explicitFileName ?: apkFile.name)
            .replace(Regex("[^a-zA-Z0-9._-]"), "_")
            .let { if (it.endsWith(".apk", ignoreCase = true)) it else "$it.apk" }
            .take(150)

        return ApkInspectionResult(
            fileName = cleanName,
            stagedFilePath = apkFile.absolutePath,
            fileSizeBytes = apkFile.length(),
            packageName = archivePkg,
            versionName = archiveVerName,
            versionCode = archiveVerCode,
            apkSha256 = apkFileSha256,
            signingCertSha256 = archiveSha256,
            signingCertSha1 = archiveSha1,
            packageMatches = pkgMatches,
            signatureMatches = certMatches,
            isUpgradeOverInstalled = isUpgrade
        )
    }

    suspend fun uploadStagedApkToFirebaseStorage(
        context: Context,
        stagedFilePath: String,
        storageFileName: String,
        onProgress: (percent: Int, bytesTransferred: Long, totalBytes: Long) -> Unit
    ): Pair<String, String> {
        val file = File(stagedFilePath)
        if (!file.exists() || file.length() <= 0L) {
            throw IllegalStateException("Staged APK file not found. Please pick the APK again.")
        }
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(context)
        }
        val safeName = storageFileName
            .replace(Regex("[^a-zA-Z0-9._-]"), "_")
            .let { if (it.endsWith(".apk", ignoreCase = true)) it else "$it.apk" }
            .take(140)
        val storagePath = "app_releases/$safeName"
        val storageRef = Firebase.storage.reference.child(storagePath)
        val metadata = storageMetadata {
            contentType = "application/vnd.android.package-archive"
        }

        val downloadUrl = suspendCancellableCoroutine<String> { cont ->
            val uploadTask = storageRef.putFile(Uri.fromFile(file), metadata)
            uploadTask.addOnProgressListener { snap ->
                val total = if (snap.totalByteCount > 0L) snap.totalByteCount else file.length()
                val pct = if (total > 0L) {
                    ((snap.bytesTransferred * 100L) / total).toInt().coerceIn(0, 99)
                } else 0
                onProgress(pct, snap.bytesTransferred, total)
            }
            uploadTask.addOnSuccessListener {
                storageRef.downloadUrl
                    .addOnSuccessListener { uri ->
                        onProgress(100, file.length(), file.length())
                        if (cont.isActive) cont.resume(uri.toString())
                    }
                    .addOnFailureListener { err ->
                        if (cont.isActive) cont.resumeWithException(err)
                    }
            }
            uploadTask.addOnFailureListener { err ->
                if (cont.isActive) cont.resumeWithException(err)
            }
            cont.invokeOnCancellation {
                uploadTask.cancel()
            }
        }
        return downloadUrl to storagePath
    }

    fun downloadAndVerifyUpdateApk(
        context: Context,
        downloadUrl: String,
        versionName: String,
        versionCode: Long,
        expectedSha256: String,
        expectedCertSha256: String,
        onProgress: (percent: Int, bytesDownloaded: Long, totalBytes: Long) -> Unit
    ): File {
        val cleanUrl = downloadUrl.trim()
        if (!cleanUrl.startsWith("https://", ignoreCase = true)) {
            throw IllegalArgumentException("Invalid APK download URL (HTTPS required).")
        }

        val updatesDir = getUpdatesDir(context)
        // Clean old APK files to prevent cache bloat while preserving app user data/sessions
        updatesDir.listFiles()?.forEach { old ->
            if (old.name.startsWith("update_v") && (old.name.endsWith(".apk") || old.name.endsWith(".part"))) {
                old.delete()
            }
        }

        val safeVer = versionName.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(24)
        val targetFile = File(updatesDir, "update_v${safeVer}_c${versionCode}.apk")
        val partFile = File(updatesDir, "${targetFile.name}.part")

        var currentUrl = cleanUrl
        var connection: HttpURLConnection? = null
        var redirects = 0
        while (redirects < 8) {
            val conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 20_000
                readTimeout = 30_000
                requestMethod = "GET"
                setRequestProperty("User-Agent", "QuickQuiz-Android/${Build.VERSION.RELEASE}")
                setRequestProperty("Accept", "application/octet-stream, */*")
            }
            conn.connect()
            val code = conn.responseCode
            if (code in setOf(HttpURLConnection.HTTP_MOVED_PERM, HttpURLConnection.HTTP_MOVED_TEMP, 303, 307, 308)) {
                val nextLoc = conn.getHeaderField("Location").orEmpty()
                conn.disconnect()
                if (nextLoc.isBlank()) throw IllegalStateException("Redirect location missing.")
                currentUrl = URL(URL(currentUrl), nextLoc).toString()
                redirects++
                continue
            }
            if (code !in 200..299) {
                conn.disconnect()
                throw IllegalStateException("APK download failed (HTTP $code). Please retry.")
            }
            connection = conn
            break
        }

        val activeConn = connection ?: throw IllegalStateException("Too many redirects downloading APK.")
        try {
            val totalBytes = activeConn.contentLengthLong.coerceAtLeast(0L)
            var downloaded = 0L
            var lastEmitMs = 0L
            var lastPct = -1

            activeConn.inputStream.use { input ->
                FileOutputStream(partFile).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        val pct = if (totalBytes > 0L) {
                            ((downloaded * 100L) / totalBytes).toInt().coerceIn(0, 99)
                        } else {
                            ((downloaded / (256L * 1024L)) % 95L).toInt().coerceIn(5, 95)
                        }
                        val now = System.currentTimeMillis()
                        if ((pct != lastPct && now - lastEmitMs >= 100L) || now - lastEmitMs >= 250L || pct == 99) {
                            lastPct = pct
                            lastEmitMs = now
                            onProgress(pct, downloaded, totalBytes)
                        }
                    }
                }
            }
            onProgress(100, downloaded, if (totalBytes > 0L) totalBytes else downloaded)
        } finally {
            activeConn.disconnect()
        }

        if (targetFile.exists()) targetFile.delete()
        if (!partFile.renameTo(targetFile)) {
            partFile.copyTo(targetFile, overwrite = true)
            partFile.delete()
        }

        val inspected = try {
            inspectLocalApkFile(context, targetFile)
        } catch (err: Exception) {
            targetFile.delete()
            throw err
        }

        if (!inspected.packageMatches) {
            targetFile.delete()
            throw IllegalStateException(
                "Security check failed: APK package (${inspected.packageName}) does not match ${context.packageName}."
            )
        }
        if (!inspected.signatureMatches) {
            targetFile.delete()
            throw IllegalStateException(
                "Security check failed: APK signing certificate does not match installed app."
            )
        }
        if (expectedCertSha256.isNotBlank() &&
            !expectedCertSha256.equals(inspected.signingCertSha256, ignoreCase = true)
        ) {
            targetFile.delete()
            throw IllegalStateException(
                "Security check failed: APK certificate mismatch against published release."
            )
        }
        if (expectedSha256.isNotBlank() &&
            !expectedSha256.equals(inspected.apkSha256, ignoreCase = true)
        ) {
            targetFile.delete()
            throw IllegalStateException(
                "Download integrity check failed (SHA-256 mismatch). Please retry."
            )
        }

        val installedInfo = getInstalledPackageInfoWithCerts(context.packageManager, context.packageName)
        val installedCode = if (installedInfo != null) PackageInfoCompat.getLongVersionCode(installedInfo) else 1L
        val installedVersionName = installedInfo?.versionName.orEmpty().ifBlank { "1.0.0" }
        val validUpgrade = inspected.versionCode >= installedCode &&
            (inspected.versionCode > installedCode ||
                compareVersionNames(inspected.versionName, installedVersionName) >= 0)
        if (!validUpgrade) {
            targetFile.delete()
            throw IllegalStateException(
                "Downloaded APK version (${inspected.versionName} / ${inspected.versionCode}) is older than installed ($installedVersionName / $installedCode)."
            )
        }

        return targetFile
    }

    fun savePendingInstallApkPath(context: Context, path: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_PENDING_INSTALL_APK, path)
            .apply()
    }

    fun consumePendingInstallApkPath(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val path = prefs.getString(KEY_PENDING_INSTALL_APK, null).orEmpty()
        if (path.isNotBlank()) {
            prefs.edit().remove(KEY_PENDING_INSTALL_APK).apply()
        }
        return path
    }

    fun canRequestPackageInstalls(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun launchSystemInstaller(context: Context, apkFile: File) {
        if (!apkFile.exists() || apkFile.length() <= 0L) {
            throw IllegalStateException("Downloaded APK not found. Please download again.")
        }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun getInstalledPackageInfoWithCerts(pm: PackageManager, pkgName: String): PackageInfo? {
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageInfo(pkgName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(pkgName, PackageManager.GET_SIGNATURES)
            }
        }.getOrNull()
    }

    private fun getArchivePackageInfoWithCerts(pm: PackageManager, apkPath: String): PackageInfo? {
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES)
            }
        }.getOrNull()
    }

    private fun extractCertFingerprints(pkgInfo: PackageInfo?): Pair<String, String> {
        if (pkgInfo == null) return "" to ""
        val certBytes = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signingInfo = pkgInfo.signingInfo
                val sigs = if (signingInfo?.hasMultipleSigners() == true) {
                    signingInfo.apkContentsSigners
                } else {
                    signingInfo?.signingCertificateHistory
                }
                sigs?.firstOrNull()?.toByteArray()
            } else {
                @Suppress("DEPRECATION")
                pkgInfo.signatures?.firstOrNull()?.toByteArray()
            }
        }.getOrNull() ?: return "" to ""

        val sha256 = runCatching {
            MessageDigest.getInstance("SHA-256").digest(certBytes).joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
        val sha1 = runCatching {
            MessageDigest.getInstance("SHA-1").digest(certBytes).joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
        return sha256 to sha1
    }

    private fun computeFileSha256Hex(file: File): String {
        return runCatching {
            val md = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { fis ->
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val read = fis.read(buf)
                    if (read <= 0) break
                    md.update(buf, 0, read)
                }
            }
            md.digest().joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
    }

    fun compareVersionNames(a: String, b: String): Int {
        val partsA = Regex("\\d+").findAll(a.trim()).mapNotNull { it.value.toIntOrNull() }.toList()
        val partsB = Regex("\\d+").findAll(b.trim()).mapNotNull { it.value.toIntOrNull() }.toList()
        val maxLen = maxOf(partsA.size, partsB.size)
        for (i in 0 until maxLen) {
            val va = partsA.getOrElse(i) { 0 }
            val vb = partsB.getOrElse(i) { 0 }
            if (va != vb) return va.compareTo(vb)
        }
        return 0
    }
}
