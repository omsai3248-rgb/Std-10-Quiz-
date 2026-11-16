package com.aistudio.std10quiz.kqxmtv

import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.tasks.Task
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val ADMIN_OWNER_EMAIL = "omsai3248@gmail.com"
private const val ADMIN_PHONE_E164 = "+919099592283"
private const val CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
private const val EXPECTED_DEBUG_CERT_SHA1 = "7c60102b8ecb85ffd89e24d3c22066150631b33d"

class NativeFirebaseBridge(
    private val activity: ComponentActivity,
    private val webView: WebView
) {
    private val appContext = activity.applicationContext
    private val secureRandom = SecureRandom()

    private fun getOptionalStringResource(name: String): String {
        val resId = appContext.resources.getIdentifier(name, "string", appContext.packageName)
        return if (resId != 0) runCatching { appContext.getString(resId) }.getOrDefault("") else ""
    }

    private fun getApkSigningSha1Hex(): String {
        return runCatching {
            val pm = appContext.packageManager
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val pkgInfo = pm.getPackageInfo(appContext.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val signingInfo = pkgInfo.signingInfo
                if (signingInfo?.hasMultipleSigners() == true) {
                    signingInfo.apkContentsSigners
                } else {
                    signingInfo?.signingCertificateHistory
                }
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(appContext.packageName, PackageManager.GET_SIGNATURES).signatures
            }
            val certBytes = signatures?.firstOrNull()?.toByteArray() ?: return@runCatching ""
            val digest = MessageDigest.getInstance("SHA-1").digest(certBytes)
            digest.joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
    }

    private fun formatSha1Colons(hex: String): String {
        return hex.uppercase().chunked(2).joinToString(":")
    }

    private fun isGoogleConfigFailureMessage(msg: String): Boolean {
        return msg.contains("action is invalid", ignoreCase = true) ||
            msg.contains("developer", ignoreCase = true) ||
            msg.contains("configured", ignoreCase = true) ||
            msg.contains("provider", ignoreCase = true) ||
            msg.contains("authorized", ignoreCase = true) ||
            msg.contains("sync account", ignoreCase = true) ||
            msg.contains("10:") ||
            msg.contains("16:") ||
            msg.contains("28444") ||
            msg.contains("28436") ||
            msg.contains("28433")
    }

    private fun ensureFirebaseInitialized(): Boolean {
        val existing = runCatching { FirebaseApp.getApps(appContext) }.getOrNull()
        if (!existing.isNullOrEmpty()) return true
        return runCatching { FirebaseApp.initializeApp(appContext) != null }.getOrDefault(false)
    }

    private val db: FirebaseFirestore? by lazy {
        if (!ensureFirebaseInitialized()) return@lazy null
        val dbId = runCatching { appContext.getString(R.string.firestore_database_id) }.getOrDefault("")
        if (dbId.isBlank()) {
            Log.e("NativeFirebase", "firestore_database_id missing in resources")
            return@lazy null
        }
        runCatching { FirebaseFirestore.getInstance(FirebaseApp.getInstance(), dbId) }
            .onFailure { Log.e("NativeFirebase", "Firestore init failed", it) }
            .getOrNull()
    }

    private val auth: FirebaseAuth? by lazy {
        if (!ensureFirebaseInitialized()) return@lazy null
        runCatching { Firebase.auth }
            .onFailure { Log.e("NativeFirebase", "Auth init failed", it) }
            .getOrNull()
    }

    private val credentialManager: CredentialManager? by lazy {
        runCatching { CredentialManager.create(activity) }
            .onFailure { Log.e("NativeFirebase", "CredentialManager init failed", it) }
            .getOrNull()
    }

    private val isNativeReady: Boolean
        get() = db != null && auth != null

    @Volatile
    private var isAttached = false
    @Volatile
    private var autoSignInAttempted = false

    private val publicListeners = mutableListOf<ListenerRegistration>()
    private val myPaymentListeners = mutableListOf<ListenerRegistration>()
    private val studentListeners = mutableListOf<ListenerRegistration>()
    private val adminListeners = mutableListOf<ListenerRegistration>()
    @Volatile
    private var lastPaymentIdsJson: String = "[]"

    private val authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        if (!isAttached) return@AuthStateListener
        emitAuthState(firebaseAuth.currentUser)
        refreshPaymentListenersInternal()
    }

    fun attach() {
        isAttached = true
        val localAuth = auth ?: return
        if (db == null) return
        runCatching { localAuth.addAuthStateListener(authStateListener) }
        emitAuthState(localAuth.currentUser)
        attemptAutoSignInWhenResumed()
    }

    fun detach() {
        isAttached = false
        runCatching { auth?.removeAuthStateListener(authStateListener) }
        stopPublicListeners()
        stopStudentListeners()
        stopAdminListeners()
    }

    private fun attemptAutoSignInWhenResumed() {
        if (autoSignInAttempted) return
        val localAuth = auth ?: return
        if (localAuth.currentUser != null) return
        val clientId = getOptionalStringResource("default_web_client_id")
        if (clientId.isBlank()) return
        autoSignInAttempted = true

        activity.lifecycleScope.launch {
            try {
                if (localAuth.currentUser != null || !isAttached) return@launch
                val creds = CredentialManager.create(activity)
                val googleIdOption = GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(true)
                    .setServerClientId(clientId)
                    .setAutoSelectEnabled(true)
                    .build()
                val request = GetCredentialRequest.Builder().addCredentialOption(googleIdOption).build()
                val result = creds.getCredential(activity, request)
                val credential = result.credential
                if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                    val firebaseCred = GoogleAuthProvider.getCredential(idToken, null)
                    val signed = localAuth.signInWithCredential(firebaseCred).awaitResult()
                    val email = signed.user?.email?.trim()?.lowercase().orEmpty()
                    if (email != ADMIN_OWNER_EMAIL) {
                        runCatching { localAuth.signOut() }
                    } else {
                        emitAuthState(signed.user)
                    }
                }
            } catch (_: Throwable) {
                // Silent auto-sign-in is optional; interactive sign-in remains available
            }
        }
    }

    @JavascriptInterface
    fun hasNativeFirebase(): Boolean = isNativeReady

    @JavascriptInterface
    fun getFirebaseConfigSummary(): String {
        val projectId = getOptionalStringResource("project_id")
        val dbId = runCatching { appContext.getString(R.string.firestore_database_id) }.getOrDefault("")
        return JSONObject().apply {
            put("projectId", projectId)
            put("databaseId", dbId)
        }.toString()
    }

    @JavascriptInterface
    fun getCurrentAuthUser(): String = serializeUser(auth?.currentUser)?.toString() ?: "null"

    @JavascriptInterface
    fun requestGoogleSignIn(callId: String) {
        val localAuth = auth
        if (localAuth == null || credentialManager == null) {
            resolveCallError(callId, "NATIVE_FIREBASE_MISSING")
            return
        }
        val clientId = getOptionalStringResource("default_web_client_id")
        if (clientId.isBlank()) {
            resolveCallError(callId, "GOOGLE_SIGNIN_CONFIG_ERROR")
            return
        }

        activity.lifecycleScope.launch {
            try {
                val creds = CredentialManager.create(activity)
                val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = clientId).build()
                val request = GetCredentialRequest.Builder().addCredentialOption(signInOption).build()
                val result = try {
                    creds.getCredential(activity, request)
                } catch (cancelErr: GetCredentialCancellationException) {
                    throw cancelErr
                } catch (primaryErr: Throwable) {
                    Log.w("Auth", "Primary GetSignInWithGoogleOption failed (${primaryErr.javaClass.simpleName}): ${primaryErr.message}")
                    val fallbackOption = GetGoogleIdOption.Builder()
                        .setFilterByAuthorizedAccounts(false)
                        .setServerClientId(clientId)
                        .build()
                    val fallbackRequest = GetCredentialRequest.Builder()
                        .addCredentialOption(fallbackOption)
                        .build()
                    creds.getCredential(activity, fallbackRequest)
                }
                val credential = result.credential
                if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                    val authCred = GoogleAuthProvider.getCredential(googleCred.idToken, null)
                    val authResult = localAuth.signInWithCredential(authCred).awaitResult()
                    val signedEmail = authResult.user?.email?.trim()?.lowercase().orEmpty()
                    if (signedEmail != ADMIN_OWNER_EMAIL) {
                        withContext(NonCancellable) {
                            runCatching { creds.clearCredentialState(ClearCredentialStateRequest()) }
                            localAuth.signOut()
                        }
                        emitAuthState(null)
                        resolveCallError(callId, "ONLY_ADMIN_GOOGLE_EMAIL")
                        return@launch
                    }
                    emitAuthState(authResult.user)
                    resolveCallSuccess(callId, serializeUser(authResult.user)?.toString() ?: "{}")
                } else {
                    resolveCallError(callId, "Unexpected credential type")
                }
            } catch (e: GetCredentialCancellationException) {
                Log.w("Auth", "Google Sign-In flow cancelled or dismissed: ${e.message}", e)
                val apkSha1 = getApkSigningSha1Hex()
                val msg = e.localizedMessage.orEmpty()
                when {
                    apkSha1.isNotBlank() && apkSha1 != EXPECTED_DEBUG_CERT_SHA1 -> {
                        resolveCallError(callId, "GOOGLE_SIGNIN_SHA1_MISMATCH:${formatSha1Colons(apkSha1)}")
                    }
                    isGoogleConfigFailureMessage(msg) -> {
                        resolveCallError(callId, "GOOGLE_SIGNIN_CONFIG_ERROR")
                    }
                    else -> {
                        resolveCallError(callId, "SIGN_IN_CANCELLED")
                    }
                }
            } catch (e: NoCredentialException) {
                Log.w("Auth", "No Google credentials found on device: ${e.message}", e)
                val apkSha1 = getApkSigningSha1Hex()
                if (apkSha1.isNotBlank() && apkSha1 != EXPECTED_DEBUG_CERT_SHA1) {
                    resolveCallError(callId, "GOOGLE_SIGNIN_SHA1_MISMATCH:${formatSha1Colons(apkSha1)}")
                } else {
                    resolveCallError(callId, "NO_GOOGLE_CREDENTIAL")
                }
            } catch (e: Throwable) {
                Log.e("Auth", "Google Sign-In failed (${e.javaClass.simpleName}): ${e.message}", e)
                val apkSha1 = getApkSigningSha1Hex()
                val msg = e.localizedMessage.orEmpty()
                when {
                    apkSha1.isNotBlank() && apkSha1 != EXPECTED_DEBUG_CERT_SHA1 -> {
                        resolveCallError(callId, "GOOGLE_SIGNIN_SHA1_MISMATCH:${formatSha1Colons(apkSha1)}")
                    }
                    isGoogleConfigFailureMessage(msg) -> {
                        resolveCallError(callId, "GOOGLE_SIGNIN_CONFIG_ERROR")
                    }
                    else -> {
                        resolveCallError(callId, msg.ifBlank { "Sign in failed" })
                    }
                }
            }
        }
    }

    @JavascriptInterface
    fun signOutGoogle(callId: String) {
        activity.lifecycleScope.launch {
            withContext(NonCancellable) {
                try {
                    credentialManager?.clearCredentialState(ClearCredentialStateRequest())
                } catch (e: Throwable) {
                    Log.w("Auth", "Failed to clear credential state: ${e.message}")
                } finally {
                    runCatching { auth?.signOut() }
                }
            }
            resolveCallSuccess(callId, "true")
        }
    }

    @JavascriptInterface
    fun registerOrUpdateStudentProfile(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val studentId = obj.getString("studentId").trim()
                val fullName = obj.getString("fullName").trim().take(60)
                val mobileNumber = obj.getString("mobileNumber").trim()
                val email = obj.optString("email", "").take(120)

                if (studentId.isBlank() || fullName.isBlank() || !Regex("^[0-9]{10}$").matches(mobileNumber)) {
                    resolveCallError(callId, "INVALID_MOBILE")
                    return@launch
                }
                if (mobileNumber == "9099592283" && !isCurrentUserAdmin()) {
                    resolveCallError(callId, "RESERVED_ADMIN_MOBILE")
                    return@launch
                }

                val ref = localDb.collection("students").document(studentId)
                val cachedSnap = runCatching { ref.get(Source.CACHE).awaitResult() }.getOrNull()
                if (cachedSnap != null && cachedSnap.exists()) {
                    val sameName = cachedSnap.getString("fullName").orEmpty() == fullName
                    val sameEmail = cachedSnap.getString("email").orEmpty() == email
                    if (sameName && sameEmail) {
                        resolveCallSuccess(callId, JSONObject.quote(studentId))
                        return@launch
                    }
                }

                val snap = cachedSnap?.takeIf { it.exists() } ?: try {
                    withTimeoutOrNull(4_500L) { ref.get().awaitResult() }
                        ?: runCatching { ref.get(Source.CACHE).awaitResult() }.getOrNull()
                } catch (e: FirebaseFirestoreException) {
                    if (e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) throw e
                    runCatching { ref.get(Source.CACHE).awaitResult() }.getOrNull()
                }

                val writeTask = if (snap == null || !snap.exists()) {
                    ref.set(
                        mapOf(
                            "userId" to studentId,
                            "fullName" to fullName,
                            "mobileNumber" to mobileNumber,
                            "email" to email,
                            "standard" to "ધોરણ 10",
                            "hasQuizAccess" to false,
                            "redeemedCode" to "",
                            "paymentStatus" to "none",
                            "totalQuizzesTaken" to 0,
                            "bestScorePercent" to 0,
                            "unlockedSubjects" to emptyList<String>(),
                            "paymentRequestIds" to emptyList<String>(),
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                } else {
                    ref.update(
                        mapOf(
                            "fullName" to fullName,
                            "email" to email,
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                }

                try {
                    withTimeoutOrNull(3_500L) { writeTask.awaitResult() }
                } catch (e: FirebaseFirestoreException) {
                    if (e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) throw e
                    // Transient UNAVAILABLE / offline errors stay queued in Firestore persistent cache
                }
                resolveCallSuccess(callId, JSONObject.quote(studentId))
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.WRITE, "students")
                resolveCallError(callId, e.localizedMessage ?: "Failed to save student profile")
            }
        }
    }

    @JavascriptInterface
    fun startStudentListeners(studentId: String) {
        val cleanId = studentId.trim()
        val localDb = db ?: return
        activity.runOnUiThread {
            stopStudentListeners()
            if (cleanId.isBlank()) {
                emitToJs("window.__onNativeStudentProfile", "null")
                emitToJs("window.__onNativeMyAttempts", "[]")
                return@runOnUiThread
            }

            val profileReg = localDb.collection("students").document(cleanId)
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.GET, "students/$cleanId")
                        emitToJs("window.__onNativeStudentProfile", "null")
                        return@addSnapshotListener
                    }
                    if (snap != null && snap.exists()) {
                        emitToJs("window.__onNativeStudentProfile", serializeStudent(snap).toString())
                    } else {
                        emitToJs("window.__onNativeStudentProfile", "null")
                    }
                }
            studentListeners.add(profileReg)

            val attemptsReg = localDb.collection("students").document(cleanId)
                .collection("quiz_attempts")
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "students/$cleanId/quiz_attempts")
                        emitToJs("window.__onNativeMyAttempts", "[]")
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents
                        ?.sortedByDescending { it.getTimestamp("createdAt")?.seconds ?: Long.MAX_VALUE }
                        ?.forEach { arr.put(serializeAttempt(it, cleanId)) }
                    emitToJs("window.__onNativeMyAttempts", arr.toString())
                }
            studentListeners.add(attemptsReg)
        }
    }

    @JavascriptInterface
    fun stopStudentListeners() {
        activity.runOnUiThread {
            studentListeners.forEach { it.remove() }
            studentListeners.clear()
        }
    }

    @JavascriptInterface
    fun recordQuizAttempt(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val studentId = obj.getString("studentId").trim()
                val attemptId = obj.getString("attemptId").trim()
                val subjectId = obj.getString("subjectId").trim()
                val subjectTitle = obj.getString("subjectTitle").take(50)
                val chapterTitle = obj.getString("chapterTitle").take(100)
                val score = obj.getInt("score").coerceAtLeast(0)
                val totalQuestions = obj.getInt("totalQuestions").coerceIn(1, 100)
                val safeScore = score.coerceAtMost(totalQuestions)
                val percentage = ((safeScore * 100) / totalQuestions).coerceIn(0, 100)
                val timeTakenSeconds = obj.getInt("timeTakenSeconds").coerceIn(0, 7200)

                val studentRef = localDb.collection("students").document(studentId)
                val stSnap = studentRef.get().awaitResult()
                if (!stSnap.exists()) {
                    resolveCallSuccess(callId, "false")
                    return@launch
                }

                val prevTotal = (stSnap.getLong("totalQuizzesTaken") ?: 0L).toInt()
                val prevBest = (stSnap.getLong("bestScorePercent") ?: 0L).toInt()
                val attemptRef = studentRef.collection("quiz_attempts").document(attemptId)

                val batch = localDb.batch()
                batch.set(
                    attemptRef,
                    mapOf(
                        "userId" to studentId,
                        "subjectId" to subjectId,
                        "subjectTitle" to subjectTitle,
                        "chapterTitle" to chapterTitle,
                        "score" to safeScore,
                        "totalQuestions" to totalQuestions,
                        "percentage" to percentage,
                        "timeTakenSeconds" to timeTakenSeconds,
                        "createdAt" to FieldValue.serverTimestamp(),
                    )
                )
                batch.update(
                    studentRef,
                    mapOf(
                        "totalQuizzesTaken" to (prevTotal + 1),
                        "bestScorePercent" to maxOf(prevBest, percentage),
                        "updatedAt" to FieldValue.serverTimestamp(),
                    )
                )
                batch.commit().awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.CREATE, "quiz_attempts")
                resolveCallError(callId, e.localizedMessage ?: "Failed to record quiz attempt")
            }
        }
    }

    @JavascriptInterface
    fun submitPaymentRequest(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val uid = obj.getString("uid")
                val studentId = obj.optString("studentId", "").trim()
                val requestId = obj.getString("requestId")
                val studentName = obj.getString("studentName")
                val mobileNumber = obj.getString("mobileNumber")
                val amountRupees = obj.getInt("amountRupees")
                val upiId = obj.getString("upiId")
                val upiTransactionRef = obj.getString("upiTransactionRef")
                val utrNormalized = obj.getString("utrNormalized")
                val screenshotBase64 = obj.getString("screenshotBase64")
                val subjectId = obj.optString("subjectId", "all")

                val utrRef = localDb.collection("utr_locks").document(utrNormalized)
                val reqRef = localDb.collection("payment_requests").document(requestId)

                val preCheck = utrRef.get().awaitResult()
                if (preCheck.exists()) {
                    resolveCallError(callId, "DUPLICATE_UTR")
                    return@launch
                }

                localDb.runTransaction { tx ->
                    val lockSnap = tx.get(utrRef)
                    if (lockSnap.exists()) {
                        throw IllegalStateException("DUPLICATE_UTR")
                    }
                    tx.set(
                        utrRef,
                        mapOf(
                            "utrNormalized" to utrNormalized,
                            "requestId" to requestId,
                            "createdAt" to FieldValue.serverTimestamp(),
                        )
                    )
                    tx.set(
                        reqRef,
                        mapOf(
                            "userId" to uid,
                            "studentName" to studentName,
                            "mobileNumber" to mobileNumber,
                            "amountRupees" to amountRupees,
                            "upiId" to upiId,
                            "upiTransactionRef" to upiTransactionRef,
                            "utrNormalized" to utrNormalized,
                            "screenshotUrl" to "",
                            "screenshotPath" to "",
                            "screenshotBase64" to screenshotBase64,
                            "status" to "pending",
                            "assignedCode" to "",
                            "adminNote" to "",
                            "subjectId" to subjectId,
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                }.awaitResult()

                // Link payment request ID to the student document in Firestore (best-effort)
                val effectiveStudentId = studentId.ifBlank { uid }
                if (effectiveStudentId.startsWith("mob_") && effectiveStudentId != "mob_9099592283") {
                    runCatching {
                        val stRef = localDb.collection("students").document(effectiveStudentId)
                        val stSnap = stRef.get().awaitResult()
                        if (!stSnap.exists()) {
                            stRef.set(
                                mapOf(
                                    "userId" to effectiveStudentId,
                                    "fullName" to studentName.take(60),
                                    "mobileNumber" to mobileNumber,
                                    "email" to "",
                                    "standard" to "ધોરણ 10",
                                    "hasQuizAccess" to false,
                                    "redeemedCode" to "",
                                    "paymentStatus" to "none",
                                    "totalQuizzesTaken" to 0,
                                    "bestScorePercent" to 0,
                                    "unlockedSubjects" to emptyList<String>(),
                                    "paymentRequestIds" to emptyList<String>(),
                                    "createdAt" to FieldValue.serverTimestamp(),
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                )
                            ).awaitResult()
                        }
                        val existingIds = (stSnap.get("paymentRequestIds") as? List<*>)
                            ?.mapNotNull { it?.toString() }
                            .orEmpty()
                        val nextIds = (listOf(requestId) + existingIds.filter { it != requestId }).take(25)
                        stRef.update(
                            mapOf(
                                "paymentStatus" to "pending",
                                "paymentRequestIds" to nextIds,
                                "updatedAt" to FieldValue.serverTimestamp(),
                            )
                        ).awaitResult()
                    }
                }

                resolveCallSuccess(callId, JSONObject.quote(requestId))
            } catch (e: Exception) {
                val msg = e.message.orEmpty()
                if (msg == "DUPLICATE_UTR") {
                    resolveCallError(callId, "DUPLICATE_UTR")
                } else {
                    handleFirestoreError(e, OperationType.CREATE, "payment_requests")
                    resolveCallError(callId, e.localizedMessage ?: "Payment submit failed")
                }
            }
        }
    }

    @JavascriptInterface
    fun redeemAccessCode(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            val obj = JSONObject(payloadJson)
            val cleanCode = obj.getString("cleanCode")
            val uid = obj.getString("uid")
            val studentId = obj.optString("studentId", "").trim().ifBlank { uid }
            val cleanName = obj.getString("cleanName")
            val cleanMobile = obj.getString("cleanMobile")
            val deviceInfo = obj.optString("deviceInfo", "Android App")
            val expectedSubjectId = obj.optString("expectedSubjectId", "")
            val codeRef = localDb.collection("access_codes").document(cleanCode)
            val canSyncStudent = studentId.startsWith("mob_") && studentId != "mob_9099592283"
            val studentRef = localDb.collection("students").document(studentId)

            try {
                suspend fun ensureStudentDocExists() {
                    val serverStudent = studentRef.get().awaitResult()
                    if (!serverStudent.exists()) {
                        studentRef.set(
                            mapOf(
                                "userId" to studentId,
                                "fullName" to cleanName.take(60),
                                "mobileNumber" to cleanMobile,
                                "email" to "",
                                "standard" to "ધોરણ 10",
                                "hasQuizAccess" to false,
                                "redeemedCode" to "",
                                "paymentStatus" to "none",
                                "totalQuizzesTaken" to 0,
                                "bestScorePercent" to 0,
                                "unlockedSubjects" to emptyList<String>(),
                                "paymentRequestIds" to emptyList<String>(),
                                "createdAt" to FieldValue.serverTimestamp(),
                                "updatedAt" to FieldValue.serverTimestamp(),
                            )
                        ).awaitResult()
                    }
                }

                if (canSyncStudent) {
                    val cachedStudent = runCatching { studentRef.get(Source.CACHE).awaitResult() }.getOrNull()
                    if (cachedStudent == null || !cachedStudent.exists()) {
                        ensureStudentDocExists()
                    }
                }

                suspend fun runRedeemTx(): JSONObject = localDb.runTransaction { tx ->
                    val snap = tx.get(codeRef)
                    val stSnap = if (canSyncStudent) tx.get(studentRef) else null
                    if (!snap.exists()) throw IllegalStateException("CODE_NOT_FOUND")
                    val status = snap.getString("status").orEmpty()
                    val isUsed = snap.getBoolean("isUsed") == true
                    if (status == "used" || isUsed) throw IllegalStateException("CODE_ALREADY_USED")
                    if (canSyncStudent && (stSnap == null || !stSnap.exists())) {
                        throw IllegalStateException("STUDENT_DOC_MISSING_RETRY")
                    }

                    val rawSub = snap.getString("subjectId").orEmpty()
                    val batchName = snap.getString("batchName").orEmpty().lowercase()
                    val codeSub = when {
                        rawSub in listOf("maths", "science", "social_science", "all") -> rawSub
                        batchName.contains("maths") -> "maths"
                        batchName.contains("science") && !batchName.contains("social") -> "science"
                        batchName.contains("social") -> "social_science"
                        else -> "all"
                    }

                    if (expectedSubjectId.isNotBlank() &&
                        expectedSubjectId != "all" &&
                        codeSub != "all" &&
                        codeSub != expectedSubjectId
                    ) {
                        throw IllegalStateException("SUBJECT_MISMATCH:$codeSub")
                    }

                    val effectiveUid = if (canSyncStudent) studentId else uid
                    val usedBy = mapOf(
                        "uid" to effectiveUid,
                        "name" to cleanName,
                        "mobile" to cleanMobile,
                        "deviceInfo" to deviceInfo.take(200),
                    )
                    tx.update(
                        codeRef,
                        mapOf(
                            "status" to "used",
                            "isUsed" to true,
                            "usedAt" to FieldValue.serverTimestamp(),
                            "usedBy" to usedBy,
                            "usedByUserId" to effectiveUid,
                            "usedByMobile" to cleanMobile,
                            "usedByName" to cleanName,
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )

                    if (canSyncStudent && stSnap != null && stSnap.exists()) {
                        val unlockedSet = linkedSetOf<String>()
                        (stSnap.get("unlockedSubjects") as? List<*>)?.forEach { item ->
                            item?.toString()?.takeIf { it.isNotBlank() }?.let { unlockedSet.add(it) }
                        }
                        if (codeSub == "all") {
                            unlockedSet.add("all")
                            unlockedSet.addAll(listOf("maths", "science", "social_science"))
                        } else {
                            unlockedSet.add(codeSub)
                        }
                        val hasFull = unlockedSet.contains("all") ||
                            listOf("maths", "science", "social_science").all { unlockedSet.contains(it) }
                        tx.update(
                            studentRef,
                            mapOf(
                                "hasQuizAccess" to hasFull,
                                "redeemedCode" to cleanCode,
                                "unlockedSubjects" to unlockedSet.toList().take(10),
                                "updatedAt" to FieldValue.serverTimestamp(),
                            )
                        )
                    }

                    JSONObject().apply {
                        put("code", cleanCode)
                        put("subjectId", codeSub)
                        put("amountRupees", (snap.getLong("amountRupees") ?: 0L).toInt())
                    }
                }.awaitResult()

                val resObj = try {
                    runRedeemTx()
                } catch (missingErr: IllegalStateException) {
                    if (missingErr.message == "STUDENT_DOC_MISSING_RETRY" && canSyncStudent) {
                        ensureStudentDocExists()
                        runRedeemTx()
                    } else {
                        throw missingErr
                    }
                }

                resolveCallSuccess(callId, resObj.toString())
            } catch (e: Exception) {
                val msg = e.message.orEmpty()
                if (msg == "CODE_NOT_FOUND" || msg == "CODE_ALREADY_USED" || msg.startsWith("SUBJECT_MISMATCH:")) {
                    resolveCallError(callId, msg)
                } else {
                    handleFirestoreError(e, OperationType.UPDATE, codeRef.path)
                    if (msg.contains("PERMISSION_DENIED", ignoreCase = true)) {
                        resolveCallError(callId, "CODE_ALREADY_USED")
                    } else {
                        resolveCallError(callId, e.localizedMessage ?: "Code validation failed")
                    }
                }
            }
        }
    }

    @JavascriptInterface
    fun startPublicListeners(paymentIdsJson: String) {
        if (db == null) return
        activity.runOnUiThread {
            stopPublicListeners()
            refreshPaymentListenersInternal(paymentIdsJson)
        }
    }

    @JavascriptInterface
    fun updateMyPaymentIds(paymentIdsJson: String) {
        refreshPaymentListenersInternal(paymentIdsJson)
    }

    private fun refreshPaymentListenersInternal(paymentIdsJson: String? = null) {
        if (paymentIdsJson != null) {
            lastPaymentIdsJson = paymentIdsJson
        }
        val localDb = db ?: return
        val idsSnapshot = lastPaymentIdsJson
        activity.runOnUiThread {
            myPaymentListeners.forEach { it.remove() }
            myPaymentListeners.clear()

            val ids = mutableListOf<String>()
            runCatching {
                val arr = JSONArray(idsSnapshot)
                for (i in 0 until arr.length()) {
                    val id = arr.optString(i)
                    if (Regex("^pay_[a-f0-9]{32}$").matches(id)) ids.add(id)
                }
            }

            if (ids.isEmpty()) {
                val uid = auth?.currentUser?.uid
                if (uid != null && !isCurrentUserAdmin()) {
                    val myPayReg = localDb.collection("payment_requests")
                        .whereEqualTo("userId", uid)
                        .addSnapshotListener { snap, error ->
                            if (error != null) {
                                handleFirestoreError(error, OperationType.LIST, "payment_requests")
                                return@addSnapshotListener
                            }
                            val arr = JSONArray()
                            snap?.documents
                                ?.sortedByDescending { it.getTimestamp("createdAt")?.seconds ?: Long.MAX_VALUE }
                                ?.forEach { arr.put(serializePayment(it)) }
                            emitToJs("window.__onNativeMyPayments", arr.toString())
                        }
                    myPaymentListeners.add(myPayReg)
                    return@runOnUiThread
                }
                emitToJs("window.__onNativeMyPayments", "[]")
                return@runOnUiThread
            }

            val byId = linkedMapOf<String, JSONObject>()
            ids.distinct().take(25).forEach { payId ->
                val reg = localDb.collection("payment_requests").document(payId)
                    .addSnapshotListener { snap, error ->
                        if (error != null) return@addSnapshotListener
                        if (snap != null && snap.exists()) {
                            byId[payId] = serializePayment(snap)
                        } else {
                            byId.remove(payId)
                        }
                        val sorted = byId.values.sortedByDescending {
                            it.optJSONObject("createdAt")?.optLong("seconds") ?: Long.MAX_VALUE
                        }
                        val out = JSONArray()
                        sorted.forEach { out.put(it) }
                        emitToJs("window.__onNativeMyPayments", out.toString())
                    }
                myPaymentListeners.add(reg)
            }
        }
    }

    @JavascriptInterface
    fun stopPublicListeners() {
        activity.runOnUiThread {
            publicListeners.forEach { it.remove() }
            publicListeners.clear()
            myPaymentListeners.forEach { it.remove() }
            myPaymentListeners.clear()
        }
    }

    @JavascriptInterface
    fun startAdminListeners() {
        val localDb = db ?: return
        activity.runOnUiThread {
            stopAdminListeners()
            if (!isCurrentUserAdmin()) return@runOnUiThread

            val payReg = localDb.collection("payment_requests")
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "payment_requests")
                        emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents
                        ?.sortedByDescending { it.getTimestamp("createdAt")?.seconds ?: Long.MAX_VALUE }
                        ?.forEach { arr.put(serializePayment(it)) }
                    emitToJs("window.__onNativeAllPayments", arr.toString())
                }
            adminListeners.add(payReg)

            val codeReg = localDb.collection("access_codes")
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "access_codes")
                        emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents
                        ?.sortedByDescending { it.getTimestamp("createdAt")?.seconds ?: Long.MAX_VALUE }
                        ?.forEach { arr.put(serializeAccessCode(it)) }
                    emitToJs("window.__onNativeAllCodes", arr.toString())
                }
            adminListeners.add(codeReg)

            val studentsReg = localDb.collection("students")
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "students")
                        emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents
                        ?.sortedByDescending {
                            (it.getTimestamp("updatedAt") ?: it.getTimestamp("createdAt"))?.seconds ?: Long.MAX_VALUE
                        }
                        ?.forEach { arr.put(serializeStudent(it)) }
                    emitToJs("window.__onNativeAllStudents", arr.toString())
                }
            adminListeners.add(studentsReg)

            val releaseReg = localDb.collection("app_config").document("release")
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        emitToJs("window.__onNativeReleaseConfig", "null")
                        return@addSnapshotListener
                    }
                    if (snap != null && snap.exists()) {
                        val json = JSONObject().apply {
                            put("id", snap.id)
                            put("githubOwnerRepo", snap.getString("githubOwnerRepo").orEmpty())
                            put("releaseNotes", snap.getString("releaseNotes").orEmpty())
                            put("updatedAt", serializeTimestamp(snap.getTimestamp("updatedAt")))
                        }.toString()
                        emitToJs("window.__onNativeReleaseConfig", json)
                    } else {
                        emitToJs("window.__onNativeReleaseConfig", "null")
                    }
                }
            adminListeners.add(releaseReg)
        }
    }

    @JavascriptInterface
    fun stopAdminListeners() {
        activity.runOnUiThread {
            adminListeners.forEach { it.remove() }
            adminListeners.clear()
            emitToJs("window.__onNativeReleaseConfig", "null")
        }
    }

    @JavascriptInterface
    fun approvePayment(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val requestId = obj.getString("requestId")
            val subjectId = obj.getString("subjectId")
            val batchLabel = obj.getString("batchName")
            val adminNote = obj.getString("adminNote")
            val reqRef = localDb.collection("payment_requests").document(requestId)

            try {
                val chosenCode = localDb.runTransaction { tx ->
                    val reqSnap = tx.get(reqRef)
                    if (!reqSnap.exists()) throw IllegalStateException("Payment request not found")
                    if (reqSnap.getString("status") != "pending") throw IllegalStateException("ALREADY_PROCESSED")

                    var uniqueCode = ""
                    for (attempt in 0 until 10) {
                        val candidate = generate8CharCode()
                        val candSnap = tx.get(localDb.collection("access_codes").document(candidate))
                        if (!candSnap.exists()) {
                            uniqueCode = candidate
                            break
                        }
                    }
                    if (uniqueCode.isEmpty()) throw IllegalStateException("Failed to generate unique code")

                    val amount = (reqSnap.getLong("amountRupees") ?: 24L).toInt()
                    val codeRef = localDb.collection("access_codes").document(uniqueCode)
                    tx.set(
                        codeRef,
                        mapOf(
                            "code" to uniqueCode,
                            "requestId" to requestId,
                            "userName" to reqSnap.getString("studentName").orEmpty().take(60),
                            "mobileNumber" to reqSnap.getString("mobileNumber").orEmpty().take(15),
                            "amountRupees" to amount,
                            "batchName" to batchLabel.take(60),
                            "status" to "unused",
                            "isUsed" to false,
                            "usedAt" to null,
                            "usedBy" to null,
                            "usedByUserId" to "",
                            "usedByMobile" to "",
                            "usedByName" to "",
                            "source" to "upi_payment",
                            "subjectId" to subjectId,
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                    tx.update(
                        reqRef,
                        mapOf(
                            "status" to "approved",
                            "assignedCode" to uniqueCode,
                            "subjectId" to subjectId,
                            "adminNote" to adminNote.take(200),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                    uniqueCode
                }.awaitResult()

                resolveCallSuccess(callId, JSONObject.quote(chosenCode))
            } catch (e: Exception) {
                if (e.message == "ALREADY_PROCESSED") {
                    resolveCallError(callId, "ALREADY_PROCESSED")
                } else {
                    handleFirestoreError(e, OperationType.UPDATE, reqRef.path)
                    resolveCallError(callId, e.localizedMessage ?: "Approval failed")
                }
            }
        }
    }

    @JavascriptInterface
    fun rejectPayment(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val requestId = obj.getString("requestId")
            val adminNote = obj.getString("adminNote")
            val reqRef = localDb.collection("payment_requests").document(requestId)
            try {
                reqRef.update(
                    mapOf(
                        "status" to "rejected",
                        "adminNote" to adminNote.take(200),
                        "updatedAt" to FieldValue.serverTimestamp(),
                    )
                ).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.UPDATE, reqRef.path)
                resolveCallError(callId, e.localizedMessage ?: "Reject failed")
            }
        }
    }

    @JavascriptInterface
    fun generateBulkCodes(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val count = obj.getInt("count").coerceIn(1, 500)
            val batchName = obj.getString("batchName").take(60)
            val subjectId = obj.getString("subjectId")

            val codes = linkedSetOf<String>()
            while (codes.size < count) {
                codes.add(generate8CharCode())
            }
            val codeList = codes.toList()

            try {
                codeList.chunked(400).forEach { chunk ->
                    val batch = localDb.batch()
                    chunk.forEach { code ->
                        val ref = localDb.collection("access_codes").document(code)
                        batch.set(
                            ref,
                            mapOf(
                                "code" to code,
                                "requestId" to "",
                                "userName" to "",
                                "mobileNumber" to "",
                                "amountRupees" to 0,
                                "batchName" to batchName,
                                "status" to "unused",
                                "isUsed" to false,
                                "usedAt" to null,
                                "usedBy" to null,
                                "usedByUserId" to "",
                                "usedByMobile" to "",
                                "usedByName" to "",
                                "source" to "book",
                                "subjectId" to subjectId,
                                "createdAt" to FieldValue.serverTimestamp(),
                                "updatedAt" to FieldValue.serverTimestamp(),
                            )
                        )
                    }
                    batch.commit().awaitResult()
                }
                resolveCallSuccess(callId, JSONArray(codeList).toString())
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.CREATE, "access_codes")
                resolveCallError(callId, e.localizedMessage ?: "Code generation failed")
            }
        }
    }

    @JavascriptInterface
    fun saveReleaseConfig(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val repo = obj.getString("githubOwnerRepo").take(120)
            val notes = obj.getString("releaseNotes").take(300)
            val ref = localDb.collection("app_config").document("release")
            try {
                ref.set(
                    mapOf(
                        "githubOwnerRepo" to repo,
                        "releaseNotes" to notes,
                        "updatedAt" to FieldValue.serverTimestamp(),
                    )
                ).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.WRITE, ref.path)
                resolveCallError(callId, e.localizedMessage ?: "Save failed")
            }
        }
    }

    @JavascriptInterface
    fun toggleStudentQuizAccess(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val studentId = obj.getString("studentId")
            val grantAccess = obj.getBoolean("grantAccess")
            val existingCode = obj.optString("redeemedCode", "")
            val ref = localDb.collection("students").document(studentId)
            try {
                if (grantAccess) {
                    ref.update(
                        mapOf(
                            "hasQuizAccess" to true,
                            "unlockedSubjects" to listOf("all", "maths", "science", "social_science"),
                            "redeemedCode" to existingCode.ifBlank { "ADMIN-GRANTED" },
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    ).awaitResult()
                } else {
                    ref.update(
                        mapOf(
                            "hasQuizAccess" to false,
                            "unlockedSubjects" to emptyList<String>(),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    ).awaitResult()
                }
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.UPDATE, ref.path)
                resolveCallError(callId, e.localizedMessage ?: "Failed to update access")
            }
        }
    }

    @JavascriptInterface
    fun updateStudentSubjectAccess(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val studentId = obj.getString("studentId")
            val subjectId = obj.getString("subjectId")
            val grantAccess = obj.getBoolean("grantAccess")
            val ref = localDb.collection("students").document(studentId)
            try {
                val snap = ref.get().awaitResult()
                val allSubs = listOf("maths", "science", "social_science")
                val currentSet = linkedSetOf<String>()
                if (snap.getBoolean("hasQuizAccess") == true) {
                    currentSet.addAll(allSubs)
                } else {
                    (snap.get("unlockedSubjects") as? List<*>)?.forEach { item ->
                        val s = item?.toString().orEmpty()
                        if (s.isNotBlank() && s != "all") currentSet.add(s)
                    }
                }
                if (grantAccess) currentSet.add(subjectId) else currentSet.remove(subjectId)
                val hasFullAccess = allSubs.all { currentSet.contains(it) }
                val nextSubjects = if (hasFullAccess) listOf("all") + allSubs else currentSet.toList()
                val existingCode = snap.getString("redeemedCode").orEmpty()
                ref.update(
                    mapOf(
                        "hasQuizAccess" to hasFullAccess,
                        "unlockedSubjects" to nextSubjects,
                        "redeemedCode" to if (nextSubjects.isNotEmpty()) existingCode.ifBlank { "ADMIN-GRANTED" } else existingCode,
                        "updatedAt" to FieldValue.serverTimestamp(),
                    )
                ).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.UPDATE, ref.path)
                resolveCallError(callId, e.localizedMessage ?: "Failed to update subject access")
            }
        }
    }

    @JavascriptInterface
    fun deletePaymentRequest(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val requestId = obj.getString("requestId").trim()
            var utrNormalized = obj.optString("utrNormalized", "").trim()
            val reqRef = localDb.collection("payment_requests").document(requestId)
            try {
                if (utrNormalized.isBlank()) {
                    val snap = runCatching { reqRef.get().awaitResult() }.getOrNull()
                    utrNormalized = snap?.getString("utrNormalized").orEmpty().trim()
                }
                val batch = localDb.batch()
                batch.delete(reqRef)
                if (Regex("^[A-Z0-9_-]{4,64}$").matches(utrNormalized)) {
                    batch.delete(localDb.collection("utr_locks").document(utrNormalized))
                }
                batch.commit().awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.DELETE, reqRef.path)
                resolveCallError(callId, e.localizedMessage ?: "Failed to delete payment request")
            }
        }
    }

    @JavascriptInterface
    fun deleteAccessCode(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val code = obj.getString("code").trim()
            val codeRef = localDb.collection("access_codes").document(code)
            try {
                codeRef.delete().awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.DELETE, codeRef.path)
                resolveCallError(callId, e.localizedMessage ?: "Failed to delete access code")
            }
        }
    }

    @JavascriptInterface
    fun deleteStudent(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val studentId = obj.getString("studentId").trim()
            val studentRef = localDb.collection("students").document(studentId)
            try {
                val attemptsSnap = studentRef.collection("quiz_attempts").get().awaitResult()
                val attemptRefs = attemptsSnap.documents.map { it.reference }
                if (attemptRefs.isEmpty()) {
                    studentRef.delete().awaitResult()
                } else {
                    val chunks = attemptRefs.chunked(400)
                    chunks.forEachIndexed { idx, chunk ->
                        val batch = localDb.batch()
                        chunk.forEach { batch.delete(it) }
                        if (idx == chunks.lastIndex) {
                            batch.delete(studentRef)
                        }
                        batch.commit().awaitResult()
                    }
                }
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.DELETE, studentRef.path)
                resolveCallError(callId, e.localizedMessage ?: "Failed to delete student")
            }
        }
    }

    private fun isCurrentUserAdmin(): Boolean {
        val user = auth?.currentUser ?: return false
        val email = user.email?.trim()?.lowercase().orEmpty()
        if (email == ADMIN_OWNER_EMAIL && user.isEmailVerified) return true
        return user.phoneNumber == ADMIN_PHONE_E164
    }

    private fun generate8CharCode(): String = buildString(8) {
        repeat(8) {
            append(CODE_CHARSET[secureRandom.nextInt(CODE_CHARSET.length)])
        }
    }

    private fun emitAuthState(user: FirebaseUser?) {
        val json = serializeUser(user)?.toString() ?: "null"
        emitToJs("window.__onNativeAuthStateChanged", json)
    }

    private fun serializeUser(user: FirebaseUser?): JSONObject? {
        if (user == null) return null
        return JSONObject().apply {
            put("uid", user.uid)
            put("email", user.email ?: "")
            put("phoneNumber", user.phoneNumber ?: "")
            put("emailVerified", user.isEmailVerified)
            put("displayName", user.displayName ?: "")
        }
    }

    private fun serializeTimestamp(ts: Timestamp?): Any {
        if (ts == null) return JSONObject.NULL
        return JSONObject().apply {
            put("seconds", ts.seconds)
            put("nanoseconds", ts.nanoseconds)
        }
    }

    private fun serializePayment(doc: DocumentSnapshot): JSONObject = JSONObject().apply {
        put("id", doc.id)
        put("userId", doc.getString("userId").orEmpty())
        put("studentName", doc.getString("studentName").orEmpty())
        put("mobileNumber", doc.getString("mobileNumber").orEmpty())
        put("amountRupees", (doc.getLong("amountRupees") ?: 24L).toInt())
        put("upiId", doc.getString("upiId").orEmpty())
        put("upiTransactionRef", doc.getString("upiTransactionRef").orEmpty())
        put("utrNormalized", doc.getString("utrNormalized").orEmpty())
        put("screenshotUrl", doc.getString("screenshotUrl").orEmpty())
        put("screenshotPath", doc.getString("screenshotPath").orEmpty())
        put("screenshotBase64", doc.getString("screenshotBase64").orEmpty())
        put("status", doc.getString("status") ?: "pending")
        put("assignedCode", doc.getString("assignedCode").orEmpty())
        put("adminNote", doc.getString("adminNote").orEmpty())
        put("subjectId", doc.getString("subjectId") ?: JSONObject.NULL)
        put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
        put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
    }

    private fun serializeAccessCode(doc: DocumentSnapshot): JSONObject {
        val rawUsedBy = doc.get("usedBy") as? Map<*, *>
        val usedByJson = if (rawUsedBy != null) {
            JSONObject().apply {
                put("uid", rawUsedBy["uid"]?.toString().orEmpty())
                put("name", rawUsedBy["name"]?.toString().orEmpty())
                put("mobile", rawUsedBy["mobile"]?.toString().orEmpty())
                put("deviceInfo", rawUsedBy["deviceInfo"]?.toString().orEmpty())
            }
        } else {
            JSONObject.NULL
        }
        return JSONObject().apply {
            put("id", doc.id)
            put("code", doc.getString("code") ?: doc.id)
            put("requestId", doc.getString("requestId").orEmpty())
            put("userName", doc.getString("userName").orEmpty())
            put("mobileNumber", doc.getString("mobileNumber").orEmpty())
            put("amountRupees", (doc.getLong("amountRupees") ?: 0L).toInt())
            put("batchName", doc.getString("batchName").orEmpty())
            put("status", doc.getString("status") ?: "unused")
            put("isUsed", doc.getBoolean("isUsed") == true)
            put("usedAt", serializeTimestamp(doc.getTimestamp("usedAt")))
            put("usedBy", usedByJson)
            put("usedByUserId", doc.getString("usedByUserId").orEmpty())
            put("usedByMobile", doc.getString("usedByMobile").orEmpty())
            put("usedByName", doc.getString("usedByName").orEmpty())
            put("source", doc.getString("source") ?: "upi_payment")
            put("subjectId", doc.getString("subjectId") ?: JSONObject.NULL)
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeStudent(doc: DocumentSnapshot): JSONObject {
        val unlockedArr = JSONArray().apply {
            (doc.get("unlockedSubjects") as? List<*>)?.forEach { item ->
                item?.toString()?.let { put(it) }
            }
        }
        val payIdsArr = JSONArray().apply {
            (doc.get("paymentRequestIds") as? List<*>)?.forEach { item ->
                item?.toString()?.let { put(it) }
            }
        }
        return JSONObject().apply {
            put("id", doc.id)
            put("userId", doc.getString("userId") ?: doc.id)
            put("fullName", doc.getString("fullName").orEmpty())
            put("mobileNumber", doc.getString("mobileNumber").orEmpty())
            put("email", doc.getString("email").orEmpty())
            put("standard", doc.getString("standard") ?: "ધોરણ 10")
            put("hasQuizAccess", doc.getBoolean("hasQuizAccess") == true)
            put("redeemedCode", doc.getString("redeemedCode").orEmpty())
            put("paymentStatus", doc.getString("paymentStatus") ?: "none")
            put("totalQuizzesTaken", (doc.getLong("totalQuizzesTaken") ?: 0L).toInt())
            put("bestScorePercent", (doc.getLong("bestScorePercent") ?: 0L).toInt())
            put("unlockedSubjects", unlockedArr)
            put("paymentRequestIds", payIdsArr)
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeAttempt(doc: DocumentSnapshot, fallbackUserId: String): JSONObject = JSONObject().apply {
        put("id", doc.id)
        put("userId", doc.getString("userId") ?: fallbackUserId)
        put("subjectId", doc.getString("subjectId") ?: "maths")
        put("subjectTitle", doc.getString("subjectTitle").orEmpty())
        put("chapterTitle", doc.getString("chapterTitle").orEmpty())
        put("score", (doc.getLong("score") ?: 0L).toInt())
        put("totalQuestions", (doc.getLong("totalQuestions") ?: 0L).toInt())
        put("percentage", (doc.getLong("percentage") ?: 0L).toInt())
        put("timeTakenSeconds", (doc.getLong("timeTakenSeconds") ?: 0L).toInt())
        put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
    }

    private fun resolveCallSuccess(callId: String, jsonLiteral: String) {
        emitToJs("window.__resolveNativeFirebaseCall", "${JSONObject.quote(callId)}, true, $jsonLiteral")
    }

    private fun resolveCallError(callId: String, errorMsg: String) {
        emitToJs(
            "window.__resolveNativeFirebaseCall",
            "${JSONObject.quote(callId)}, false, ${JSONObject.quote(errorMsg)}"
        )
    }

    private fun emitToJs(fnPath: String, argsExpr: String) {
        if (!isAttached) return
        activity.runOnUiThread {
            if (!isAttached) return@runOnUiThread
            runCatching {
                webView.evaluateJavascript("if (typeof $fnPath === 'function') { $fnPath($argsExpr); }", null)
            }
        }
    }
}

private suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { result ->
        if (cont.isActive) cont.resume(result)
    }
    addOnFailureListener { err ->
        if (cont.isActive) cont.resumeWithException(err)
    }
    addOnCanceledListener {
        cont.cancel()
    }
}
