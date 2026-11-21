package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
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
    private const val STAGED_DIR_NAME = "release_stage"
    private const val STAGED_UPLOAD_FILE = "staged_release.bin"

    private fun getStageDir(context: Context): File =
        File(context.cacheDir, STAGED_DIR_NAME).apply { mkdirs() }

    fun getInstalledAppInfo(context: Context): JSONObject {
        val pm = context.packageManager
        val pkgName = context.packageName
        val pkgInfo = getInstalledPackageInfoWithCerts(pm, pkgName)
        val versionName = pkgInfo?.versionName.orEmpty().ifBlank { "1.0.0" }
        val versionCode = if (pkgInfo != null) PackageInfoCompat.getLongVersionCode(pkgInfo) else 1L
        val (sha256, sha1) = extractCertFingerprints(pkgInfo)
        return JSONObject().apply {
            put("packageName", pkgName)
            put("versionName", versionName)
            put("versionCode", versionCode)
            put("signingCertSha256", sha256)
            put("signingCertSha1", sha1)
            put("canRequestPackageInstalls", false)
        }
    }

    /**
     * Google Play Protect & Play Policy compliant update flow:
     * Opens the verified HTTPS release / store URL in the user's browser via Intent.ACTION_VIEW
     * without declaring REQUEST_INSTALL_PACKAGES or downloading/executing APK binaries in-app.
     */
    fun openTrustedUpdateUrl(context: Context, downloadUrl: String) {
        val cleanUrl = downloadUrl.trim()
        val uri = Uri.parse(cleanUrl)
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.host.isNullOrBlank()) {
            throw IllegalArgumentException("Invalid update link (HTTPS required).")
        }
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    fun inspectPickedApkUri(context: Context, uri: Uri): ApkInspectionResult {
        val stageDir = getStageDir(context)
        val stagedFile = File(stageDir, STAGED_UPLOAD_FILE)
        val tempFile = File(stageDir, "${STAGED_UPLOAD_FILE}.tmp")

        val resolver = context.contentResolver
        var displayName = "release.apk"
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
            ?: throw IllegalStateException("Selected release file could not be opened.")
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
            throw IllegalStateException("Release file is empty or missing.")
        }
        val pm = context.packageManager
        val archiveInfo = getArchivePackageInfoWithCerts(pm, apkFile.absolutePath)
            ?: throw IllegalStateException("Invalid release archive.")

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
            throw IllegalStateException("Staged release file not found. Please pick the file again.")
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
            contentType = "application/octet-stream"
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
