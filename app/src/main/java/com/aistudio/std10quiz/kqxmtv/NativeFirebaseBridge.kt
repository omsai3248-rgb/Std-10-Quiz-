package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.content.pm.PackageInfoCompat
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
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
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Collections
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val ADMIN_OWNER_EMAIL = "omsai3248@gmail.com"
private const val ADMIN_PHONE_E164 = "+919099592283"
private const val CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
private const val EXPECTED_DEBUG_CERT_SHA1 = "7c60102b8ecb85ffd89e24d3c22066150631b33d"

class NativeFirebaseBridge(
    private val activity: ComponentActivity,
    private val webView: WebView,
    private val onRequestPostNotificationsPermission: () -> Unit = {},
    private val onLaunchApkPicker: () -> Unit = {}
) {
    private val appContext = activity.applicationContext
    private val secureRandom = SecureRandom()
    private val verifiedAdminUids: MutableSet<String> = Collections.synchronizedSet(hashSetOf())
    @Volatile
    private var pendingNotificationPermissionCallId: String? = null
    @Volatile
    private var pendingApkPickCallId: String? = null
    @Volatile
    private var adminDirectoryReg: ListenerRegistration? = null
    @Volatile
    private var adminInvitesReg: ListenerRegistration? = null
    @Volatile
    private var adminNotificationsReg: ListenerRegistration? = null
    @Volatile
    private var adminChatsReg: ListenerRegistration? = null
    @Volatile
    private var activeChatMessagesReg: ListenerRegistration? = null
    @Volatile
    private var activeChatThreadId: String = ""
    @Volatile
    private var initialAdminNotifsSnapshotDone = false
    @Volatile
    private var initialAdminChatsSnapshotDone = false
    private val lastSeenChatMsgIds: MutableMap<String, String> = Collections.synchronizedMap(hashMapOf())
    @Volatile
    private var pendingInstallApkFile: File? = null
    @Volatile
    private var awaitingInstallPermission: Boolean = false
    @Volatile
    private var activeUpdateDownloadJob: Job? = null

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
        runCatching {
            val instance = FirebaseFirestore.getInstance(FirebaseApp.getInstance(), dbId)
            runCatching {
                instance.firestoreSettings = firestoreSettings {
                    setLocalCacheSettings(
                        persistentCacheSettings {
                            setSizeBytes(100L * 1024 * 1024)
                        }
                    )
                }
            }
            instance
        }
            .onFailure { Log.e("NativeFirebase", "Firestore init failed", it) }
            .getOrNull()
    }


    private fun isExplicitQuotaError(err: Throwable?): Boolean {
        if (err is FirebaseFirestoreException && err.code == FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED) {
            return true
        }
        val msg = err?.message.orEmpty().lowercase()
        return msg.contains("resource_exhausted") || msg.contains("quota")
    }

    private fun markQuotaDegradedIfApplicable(err: Throwable?) {
        if (isExplicitQuotaError(err)) {
            serverQuotaDegradedUntilMs = System.currentTimeMillis() + 5L * 60L * 1000L
            emitNativeSyncState(
                serverConnected = false,
                liveSyncActive = false,
                errorKind = "quota",
                quotaCooldownUntilMs = serverQuotaDegradedUntilMs,
                lastErrorMessage = err?.localizedMessage.orEmpty()
            )
        }
    }

    private fun isQuotaOrOfflineException(err: Throwable?): Boolean {
        markQuotaDegradedIfApplicable(err)
        if (err is FirebaseFirestoreException) {
            return err.code == FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED ||
                err.code == FirebaseFirestoreException.Code.UNAVAILABLE ||
                err.code == FirebaseFirestoreException.Code.DEADLINE_EXCEEDED
        }
        val msg = err?.message.orEmpty().lowercase()
        return msg.contains("resource_exhausted") ||
            msg.contains("quota") ||
            msg.contains("unavailable") ||
            msg.contains("offline") ||
            msg.contains("deadline_exceeded")
    }

    private fun isInternetConnected(): Boolean {
        return runCatching {
            val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return@runCatching true
            val network = cm.activeNetwork ?: return@runCatching false
            val caps = cm.getNetworkCapabilities(network) ?: return@runCatching false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && (
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                )
        }.getOrDefault(true)
    }

    private fun saveLocalStudentBackup(
        profileJson: JSONObject,
        pendingSync: Boolean = false,
        markActive: Boolean = true
    ) {
        runCatching {
            val studentId = profileJson.optString("id").ifBlank { profileJson.optString("userId") }.trim()
            if (studentId.isBlank()) return
            val copy = JSONObject(profileJson.toString()).apply {
                put("pendingServerSync", pendingSync)
            }
            val editor = appContext.getSharedPreferences("std10_student_backup_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString(studentId, copy.toString())
            if (markActive) {
                editor.putString("active_student_id", studentId)
            }
            editor.apply()
        }
    }

    private fun loadLocalStudentBackup(studentId: String): JSONObject? {
        if (studentId.isBlank()) return null
        return runCatching {
            val raw = appContext.getSharedPreferences("std10_student_backup_prefs", Context.MODE_PRIVATE)
                .getString(studentId, null) ?: return null
            JSONObject(raw)
        }.getOrNull()
    }


    @JavascriptInterface
    fun setActiveStudentMobile(mobileOrId: String) {
        runCatching {
            val prefs = appContext.getSharedPreferences("std10_student_backup_prefs", Context.MODE_PRIVATE)
            val clean = mobileOrId.trim()
            if (clean.isBlank()) {
                prefs.edit().remove("active_student_id").apply()
                return
            }
            val digits = clean.replace(Regex("\\D"), "").takeLast(10)
            val studentId = if (Regex("^[0-9]{10}$").matches(digits)) "mob_$digits" else clean
            prefs.edit().putString("active_student_id", studentId).apply()
        }
    }

    @JavascriptInterface
    fun getActiveStudentSnapshot(): String {
        return runCatching {
            val prefs = appContext.getSharedPreferences("std10_student_backup_prefs", Context.MODE_PRIVATE)
            val activeId = prefs.getString("active_student_id", null).orEmpty().trim()
            if (activeId.isBlank()) return "null"
            prefs.getString(activeId, null) ?: "null"
        }.getOrDefault("null")
    }

    private fun saveAdminListBackup(key: String, jsonArrayString: String) {
        runCatching {
            appContext.getSharedPreferences("std10_admin_cache_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString(key, jsonArrayString)
                .apply()
        }
    }

    private fun loadAdminListBackup(key: String): String {
        return runCatching {
            appContext.getSharedPreferences("std10_admin_cache_prefs", Context.MODE_PRIVATE)
                .getString(key, "[]") ?: "[]"
        }.getOrDefault("[]")
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
    @Volatile
    private var serverQuotaDegradedUntilMs: Long = 0L

    private val publicListeners = mutableListOf<ListenerRegistration>()
    private val myPaymentListeners = mutableListOf<ListenerRegistration>()
    private val studentListeners = mutableListOf<ListenerRegistration>()
    private val adminListeners = mutableListOf<ListenerRegistration>()
    @Volatile
    private var adminListenersActive = false
    @Volatile
    private var currentStudentListenerId: String = ""
    @Volatile
    private var lastResumeCheckMs: Long = 0L
    @Volatile
    private var lastPaymentIdsJson: String = "[]"
    @Volatile
    private var networkCallbackRegistered = false
    private val codeSnapshotSeq = AtomicLong(0L)

    private val connectivityCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            emitNetworkAndSyncSnapshot()
        }

        override fun onLost(network: Network) {
            emitNetworkAndSyncSnapshot()
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            emitNetworkAndSyncSnapshot()
        }
    }

    private fun emitNetworkAndSyncSnapshot() {
        val online = isInternetConnected()
        emitToJs("window.__onNativeNetworkStateChanged", if (online) "true" else "false")
        val inQuotaCooldown = System.currentTimeMillis() < serverQuotaDegradedUntilMs
        emitNativeSyncState(
            serverConnected = online && !inQuotaCooldown,
            liveSyncActive = adminListenersActive && online && !inQuotaCooldown,
            errorKind = when {
                !online -> "network"
                inQuotaCooldown -> "quota"
                else -> "none"
            },
            quotaCooldownUntilMs = if (inQuotaCooldown) serverQuotaDegradedUntilMs else 0L
        )
    }

    private fun emitNativeSyncState(
        serverConnected: Boolean,
        liveSyncActive: Boolean,
        lastSyncAtMs: Long? = null,
        errorKind: String? = null,
        quotaCooldownUntilMs: Long? = null,
        lastErrorMessage: String? = null
    ) {
        val json = JSONObject().apply {
            put("isOnline", isInternetConnected())
            put("serverConnected", serverConnected)
            put("liveSyncState", if (liveSyncActive) "active" else "paused")
            if (lastSyncAtMs != null && lastSyncAtMs > 0L) {
                put("lastSyncAtMs", lastSyncAtMs)
            }
            if (!errorKind.isNullOrBlank()) {
                put("errorKind", errorKind)
            }
            if (quotaCooldownUntilMs != null) {
                put("quotaCooldownUntilMs", quotaCooldownUntilMs)
            }
            if (lastErrorMessage != null) {
                put("lastErrorMessage", lastErrorMessage)
            }
        }
        emitToJs("window.__onNativeSyncState", json.toString())
    }

    private val authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        if (!isAttached) return@AuthStateListener
        emitAuthState(firebaseAuth.currentUser)
        refreshPaymentListenersInternal()
    }

    private val resumeLifecycleObserver = object : DefaultLifecycleObserver {
        override fun onResume(owner: LifecycleOwner) {
            verifyActiveSessionInternal()
        }
    }

    fun attach() {
        isAttached = true
        runCatching { activity.lifecycle.addObserver(resumeLifecycleObserver) }
        runCatching {
            val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            if (cm != null && !networkCallbackRegistered) {
                val request = NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                cm.registerNetworkCallback(request, connectivityCallback)
                networkCallbackRegistered = true
            }
        }
        emitNetworkAndSyncSnapshot()
        val localAuth = auth ?: return
        if (db == null) return
        runCatching { localAuth.addAuthStateListener(authStateListener) }
        emitAuthState(localAuth.currentUser)
        syncPublicDeviceFcmRegistration()
        attemptAutoSignInWhenResumed()
    }

    fun detach() {
        isAttached = false
        runCatching { activity.lifecycle.removeObserver(resumeLifecycleObserver) }
        runCatching {
            if (networkCallbackRegistered) {
                val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                cm?.unregisterNetworkCallback(connectivityCallback)
                networkCallbackRegistered = false
            }
        }
        runCatching { auth?.removeAuthStateListener(authStateListener) }
        stopPublicListeners()
        stopStudentListeners()
        stopAdminListeners()
        stopAdminNotificationsAndChatListeners()
        stopAdminChatThreadListener()
        activeUpdateDownloadJob?.cancel()
        activeUpdateDownloadJob = null
    }

    fun onHostActivityResumed() {
        if (!awaitingInstallPermission) return
        val apk = pendingInstallApkFile
        awaitingInstallPermission = false
        if (apk == null || !apk.exists()) return
        val apkLen = apk.length()
        if (AppUpdateManager.canRequestPackageInstalls(appContext)) {
            emitUpdateProgress("installing", 100, apkLen, apkLen, "")
            runCatching {
                AppUpdateManager.launchPackageInstaller(activity, apk)
            }.onFailure { err ->
                val msg = err.localizedMessage ?: "Unable to launch package installer."
                emitUpdateProgress("error", 0, 0L, 0L, msg)
            }
        } else {
            emitUpdateProgress(
                "permission_denied",
                100,
                apkLen,
                apkLen,
                "Please enable 'Allow from this source' to install the update."
            )
        }
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
                    val signedUser = signed.user
                    if (!verifyAuthorizedAdminSuspended(signedUser)) {
                        runCatching { localAuth.signOut() }
                    } else {
                        emitAuthState(signedUser)
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
                    val signedUser = authResult.user
                    if (!verifyAuthorizedAdminSuspended(signedUser)) {
                        withContext(NonCancellable) {
                            runCatching { creds.clearCredentialState(ClearCredentialStateRequest()) }
                            localAuth.signOut()
                        }
                        emitAuthState(null)
                        resolveCallError(callId, "ONLY_ADMIN_GOOGLE_EMAIL")
                        return@launch
                    }
                    emitAuthState(signedUser)
                    resolveCallSuccess(callId, serializeUser(signedUser)?.toString() ?: "{}")
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
                runCatching {
                    val uid = auth?.currentUser?.uid
                    val localDb = db
                    if (!uid.isNullOrBlank() && localDb != null) {
                        val deviceId = AdminNotificationHelper.getOrCreateDeviceId(appContext)
                        withTimeoutOrNull(3_000L) {
                            localDb.collection("admin_fcm_tokens").document("${uid}_$deviceId").delete().awaitResult()
                        }
                    }
                }
                AdminNotificationHelper.clearAdminSessionState(appContext)
                stopAdminNotificationsAndChatListeners()
                stopAdminChatThreadListener()
                stopAdminListeners()
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
    fun lookupStudentProfile(callId: String, mobileNumber: String) {
        val localDb = db ?: run {
            resolveCallSuccess(callId, "null")
            return
        }
        val cleanMobile = mobileNumber.replace(Regex("\\D"), "").takeLast(10)
        if (!Regex("^[0-9]{10}$").matches(cleanMobile) || cleanMobile == "9099592283") {
            resolveCallSuccess(callId, "null")
            return
        }
        val studentId = "mob_$cleanMobile"
        activity.lifecycleScope.launch(Dispatchers.IO) {
            val ref = localDb.collection("students").document(studentId)
            val cachedSnap = runCatching { ref.get(Source.CACHE).awaitResult() }.getOrNull()
            if (cachedSnap != null && cachedSnap.exists()) {
                val json = serializeStudent(cachedSnap)
                saveLocalStudentBackup(json, pendingSync = false)
                resolveCallSuccess(callId, json.toString())
                return@launch
            }
            val backup = loadLocalStudentBackup(studentId)
            val isDegraded = System.currentTimeMillis() < serverQuotaDegradedUntilMs || !isInternetConnected()
            if (isDegraded) {
                resolveCallSuccess(callId, backup?.toString() ?: "null")
                return@launch
            }
            val serverSnap = try {
                withTimeoutOrNull(3_000L) { ref.get().awaitResult() }
            } catch (e: Throwable) {
                markQuotaDegradedIfApplicable(e)
                null
            }
            if (serverSnap != null && serverSnap.exists()) {
                val json = serializeStudent(serverSnap)
                saveLocalStudentBackup(json, pendingSync = false)
                resolveCallSuccess(callId, json.toString())
            } else {
                resolveCallSuccess(callId, backup?.toString() ?: "null")
            }
        }
    }

    private fun buildNewStudentJson(
        studentId: String,
        fullName: String,
        cleanMobile: String
    ): JSONObject = JSONObject().apply {
        put("id", studentId)
        put("userId", studentId)
        put("fullName", fullName)
        put("mobileNumber", cleanMobile)
        put("email", "")
        put("standard", "ધોરણ 10")
        put("hasQuizAccess", false)
        put("redeemedCode", "")
        put("paymentStatus", "none")
        put("totalQuizzesTaken", 0)
        put("bestScorePercent", 0)
        put("unlockedSubjects", JSONArray())
        put("freeMockUsedSubjects", JSONArray())
        put("paymentRequestIds", JSONArray())
        put("isReturningUser", false)
    }

    private suspend fun resolveLoginFromLocalOrQuotaFallback(
        callId: String,
        ref: com.google.firebase.firestore.DocumentReference,
        studentId: String,
        cleanMobile: String,
        fullNameInput: String,
        online: Boolean
    ) {
        val cachedSnap = runCatching { ref.get(Source.CACHE).awaitResult() }.getOrNull()
        if (cachedSnap != null && cachedSnap.exists()) {
            val existingName = cachedSnap.getString("fullName").orEmpty().trim()
            val effectiveName = fullNameInput.ifBlank { existingName }.ifBlank { "Student" }
            val json = serializeStudent(cachedSnap).apply {
                put("fullName", effectiveName)
                put("isReturningUser", true)
            }
            saveLocalStudentBackup(json, pendingSync = false)
            if (online && fullNameInput.isNotBlank() && fullNameInput != existingName) {
                activity.lifecycleScope.launch(Dispatchers.IO) {
                    runCatching {
                        withTimeoutOrNull(4_000L) {
                            ref.update(
                                mapOf(
                                    "fullName" to effectiveName,
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                )
                            ).awaitResult()
                        }
                    }
                }
            }
            resolveCallSuccess(callId, json.toString())
            return
        }

        val backup = loadLocalStudentBackup(studentId)
        if (backup != null) {
            val existingBackupName = backup.optString("fullName", "").trim()
            val effectiveName = fullNameInput.ifBlank { existingBackupName }.ifBlank { "Student" }
            backup.put("fullName", effectiveName)
            backup.put("isReturningUser", !backup.optBoolean("pendingServerSync", false))
            saveLocalStudentBackup(backup, pendingSync = backup.optBoolean("pendingServerSync", false))
            if (online && !backup.optBoolean("pendingServerSync", false) && fullNameInput.isNotBlank() && fullNameInput != existingBackupName) {
                activity.lifecycleScope.launch(Dispatchers.IO) {
                    runCatching {
                        withTimeoutOrNull(4_000L) {
                            ref.update(
                                mapOf(
                                    "fullName" to effectiveName,
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                )
                            ).awaitResult()
                        }
                    }
                }
            }
            resolveCallSuccess(callId, backup.toString())
            return
        }

        if (!online) {
            resolveCallError(callId, "Network unavailable")
            return
        }

        if (fullNameInput.isBlank()) {
            resolveCallError(callId, "NAME_REQUIRED_FOR_NEW_USER")
            return
        }

        // Device IS online, but Firestore daily free quota is exhausted or server timed out:
        // Create a local session so new users can enter without blocking on quota.
        // Background sync reconciles automatically as soon as server quota recovers.
        val localProfile = buildNewStudentJson(
            studentId = studentId,
            fullName = fullNameInput,
            cleanMobile = cleanMobile
        )
        saveLocalStudentBackup(localProfile, pendingSync = true)
        resolveCallSuccess(callId, localProfile.toString())
    }

    @JavascriptInterface
    fun loginStudentByMobile(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val cleanMobile = obj.getString("mobileNumber").replace(Regex("\\D"), "").takeLast(10)
                val fullNameInput = obj.optString("fullName", "").trim().take(60)

                if (!Regex("^[0-9]{10}$").matches(cleanMobile)) {
                    resolveCallError(callId, "INVALID_MOBILE")
                    return@launch
                }
                if (cleanMobile == "9099592283" && !isCurrentUserAdmin()) {
                    resolveCallError(callId, "RESERVED_ADMIN_MOBILE")
                    return@launch
                }

                val studentId = "mob_$cleanMobile"
                val ref = localDb.collection("students").document(studentId)
                val online = isInternetConnected()
                val quotaDegraded = System.currentTimeMillis() < serverQuotaDegradedUntilMs

                if (!online || quotaDegraded) {
                    resolveLoginFromLocalOrQuotaFallback(
                        callId = callId,
                        ref = ref,
                        studentId = studentId,
                        cleanMobile = cleanMobile,
                        fullNameInput = fullNameInput,
                        online = online
                    )
                    return@launch
                }

                try {
                    val resultJson = withTimeoutOrNull(6_000L) {
                        localDb.runTransaction { tx ->
                            val snap = tx.get(ref)
                            if (!snap.exists()) {
                                if (fullNameInput.isBlank()) {
                                    throw IllegalStateException("NAME_REQUIRED_FOR_NEW_USER")
                                }
                                tx.set(
                                    ref,
                                    mapOf(
                                        "userId" to studentId,
                                        "fullName" to fullNameInput,
                                        "mobileNumber" to cleanMobile,
                                        "email" to "",
                                        "standard" to "ધોરણ 10",
                                        "hasQuizAccess" to false,
                                        "redeemedCode" to "",
                                        "paymentStatus" to "none",
                                        "totalQuizzesTaken" to 0,
                                        "bestScorePercent" to 0,
                                        "unlockedSubjects" to emptyList<String>(),
                                        "freeMockUsedSubjects" to emptyList<String>(),
                                        "paymentRequestIds" to emptyList<String>(),
                                        "createdAt" to FieldValue.serverTimestamp(),
                                        "updatedAt" to FieldValue.serverTimestamp(),
                                    )
                                )
                                buildNewStudentJson(
                                    studentId = studentId,
                                    fullName = fullNameInput,
                                    cleanMobile = cleanMobile
                                )
                            } else {
                                val existingName = snap.getString("fullName").orEmpty().trim()
                                val effectiveName = fullNameInput.ifBlank { existingName }.ifBlank { "Student" }
                                val needsUpdate = fullNameInput.isNotBlank() && fullNameInput != existingName
                                if (needsUpdate) {
                                    tx.update(
                                        ref,
                                        mapOf(
                                            "fullName" to effectiveName,
                                            "email" to snap.getString("email").orEmpty(),
                                            "updatedAt" to FieldValue.serverTimestamp(),
                                        )
                                    )
                                }
                                serializeStudent(snap).apply {
                                    put("fullName", effectiveName)
                                    put("isReturningUser", true)
                                }
                            }
                        }.awaitResult()
                    }

                    if (resultJson != null) {
                        saveLocalStudentBackup(resultJson, pendingSync = false)
                        resolveCallSuccess(callId, resultJson.toString())
                        return@launch
                    }

                    // Transaction timed out (e.g. quota retry backoff or slow server)
                    if (online) {
                        serverQuotaDegradedUntilMs = System.currentTimeMillis() + 90L * 1000L
                    }
                    resolveLoginFromLocalOrQuotaFallback(
                        callId = callId,
                        ref = ref,
                        studentId = studentId,
                        cleanMobile = cleanMobile,
                        fullNameInput = fullNameInput,
                        online = online
                    )
                } catch (e: IllegalStateException) {
                    val msg = e.message.orEmpty()
                    if (msg == "NAME_REQUIRED_FOR_NEW_USER") {
                        resolveCallError(callId, msg)
                    } else {
                        throw e
                    }
                } catch (e: FirebaseFirestoreException) {
                    if (isQuotaOrOfflineException(e)) {
                        resolveLoginFromLocalOrQuotaFallback(
                            callId = callId,
                            ref = ref,
                            studentId = studentId,
                            cleanMobile = cleanMobile,
                            fullNameInput = fullNameInput,
                            online = online
                        )
                        return@launch
                    }
                    handleFirestoreError(e, OperationType.WRITE, ref.path)
                    resolveCallError(callId, e.localizedMessage ?: "Login failed")
                }
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Login failed")
            }
        }
    }

    @JavascriptInterface
    fun startStudentListeners(studentId: String) {
        val cleanId = studentId.trim()
        val localDb = db ?: return
        activity.runOnUiThread {
            if (cleanId.isBlank()) {
                stopStudentListeners()
                emitToJs("window.__onNativeStudentProfile", "null")
                emitToJs("window.__onNativeMyAttempts", "[]")
                return@runOnUiThread
            }
            if (currentStudentListenerId == cleanId && studentListeners.isNotEmpty()) {
                return@runOnUiThread
            }
            stopStudentListeners()
            currentStudentListenerId = cleanId

            val studentDocRef = localDb.collection("students").document(cleanId)
            val profileReg = studentDocRef
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.GET, "students/$cleanId")
                        if (isQuotaOrOfflineException(error)) {
                            activity.lifecycleScope.launch(Dispatchers.IO) {
                                val cached = runCatching { studentDocRef.get(Source.CACHE).awaitResult() }.getOrNull()
                                if (cached != null && cached.exists()) {
                                    val json = serializeStudent(cached)
                                    saveLocalStudentBackup(json, pendingSync = false)
                                    emitToJs("window.__onNativeStudentProfile", json.toString())
                                } else {
                                    loadLocalStudentBackup(cleanId)?.let { backup ->
                                        emitToJs("window.__onNativeStudentProfile", backup.toString())
                                    }
                                }
                            }
                        }
                        return@addSnapshotListener
                    }
                    if (snap != null && snap.exists()) {
                        val json = serializeStudent(snap)
                        saveLocalStudentBackup(json, pendingSync = false)
                        emitToJs("window.__onNativeStudentProfile", json.toString())
                    } else {
                        val backup = loadLocalStudentBackup(cleanId)
                        if (backup != null && backup.optBoolean("pendingServerSync", false) && isInternetConnected()) {
                            activity.lifecycleScope.launch(Dispatchers.IO) {
                                val mobile = backup.optString("mobileNumber", "").trim()
                                val name = backup.optString("fullName", "").trim().ifBlank { "Student" }
                                if (Regex("^[0-9]{10}$").matches(mobile)) {
                                    runCatching {
                                        studentDocRef.set(
                                            mapOf(
                                                "userId" to cleanId,
                                                "fullName" to name.take(60),
                                                "mobileNumber" to mobile,
                                                "email" to "",
                                                "standard" to "ધોરણ 10",
                                                "hasQuizAccess" to false,
                                                "redeemedCode" to "",
                                                "paymentStatus" to "none",
                                                "totalQuizzesTaken" to 0,
                                                "bestScorePercent" to 0,
                                                "unlockedSubjects" to emptyList<String>(),
                                                "freeMockUsedSubjects" to emptyList<String>(),
                                                "paymentRequestIds" to emptyList<String>(),
                                                "createdAt" to FieldValue.serverTimestamp(),
                                                "updatedAt" to FieldValue.serverTimestamp(),
                                            )
                                        ).awaitResult()
                                        saveLocalStudentBackup(backup, pendingSync = false)
                                    }
                                }
                            }
                            emitToJs("window.__onNativeStudentProfile", backup.toString())
                        } else {
                            emitToJs("window.__onNativeStudentProfile", "null")
                        }
                    }
                }
            studentListeners.add(profileReg)

            val attemptsQuery = studentDocRef
                .collection("quiz_attempts")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(15)
            val attemptsReg = attemptsQuery
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "students/$cleanId/quiz_attempts")
                        if (isQuotaOrOfflineException(error)) {
                            activity.lifecycleScope.launch(Dispatchers.IO) {
                                val cached = runCatching { attemptsQuery.get(Source.CACHE).awaitResult() }.getOrNull()
                                val arr = JSONArray()
                                cached?.documents?.forEach { arr.put(serializeAttempt(it, cleanId)) }
                                emitToJs("window.__onNativeMyAttempts", arr.toString())
                            }
                        }
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents?.forEach { arr.put(serializeAttempt(it, cleanId)) }
                    emitToJs("window.__onNativeMyAttempts", arr.toString())
                }
            studentListeners.add(attemptsReg)
        }
    }

    @JavascriptInterface
    fun stopStudentListeners() {
        activity.runOnUiThread {
            currentStudentListenerId = ""
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
                val cachedSnap = runCatching { studentRef.get(Source.CACHE).awaitResult() }.getOrNull()
                val stSnap = if (cachedSnap != null && cachedSnap.exists()) {
                    cachedSnap
                } else if (System.currentTimeMillis() < serverQuotaDegradedUntilMs || !isInternetConnected()) {
                    null
                } else {
                    try {
                        withTimeoutOrNull(3_000L) { studentRef.get().awaitResult() }
                    } catch (e: Throwable) {
                        markQuotaDegradedIfApplicable(e)
                        null
                    }
                }

                val backup = if (stSnap == null || !stSnap.exists()) loadLocalStudentBackup(studentId) else null
                if ((stSnap == null || !stSnap.exists()) && backup == null) {
                    resolveCallSuccess(callId, "false")
                    return@launch
                }

                val prevTotal = if (stSnap != null && stSnap.exists()) {
                    (stSnap.getLong("totalQuizzesTaken") ?: 0L).toInt()
                } else {
                    backup?.optInt("totalQuizzesTaken", 0) ?: 0
                }
                val prevBest = if (stSnap != null && stSnap.exists()) {
                    (stSnap.getLong("bestScorePercent") ?: 0L).toInt()
                } else {
                    backup?.optInt("bestScorePercent", 0) ?: 0
                }
                val nextTotal = prevTotal + 1
                val nextBest = maxOf(prevBest, percentage)

                if (backup != null) {
                    backup.put("totalQuizzesTaken", nextTotal)
                    backup.put("bestScorePercent", nextBest)
                    saveLocalStudentBackup(backup, pendingSync = backup.optBoolean("pendingServerSync", false))
                }

                if (stSnap != null && stSnap.exists()) {
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
                            "totalQuizzesTaken" to nextTotal,
                            "bestScorePercent" to nextBest,
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )
                    withTimeoutOrNull(4_000L) {
                        runCatching { batch.commit().awaitResult() }
                    }
                }
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.CREATE, "quiz_attempts")
                resolveCallError(callId, e.localizedMessage ?: "Failed to record quiz attempt")
            }
        }
    }

    @JavascriptInterface
    fun markFreeMockTestUsed(callId: String, payloadJson: String) {
        val obj = runCatching { JSONObject(payloadJson) }.getOrNull()
        val studentId = obj?.optString("studentId", "").orEmpty().trim()
        val subjectId = obj?.optString("subjectId", "").orEmpty().trim()
        if (studentId.isBlank() || subjectId !in listOf("maths", "science", "social_science", "gujarati", "hindi")) {
            resolveCallSuccess(callId, "false")
            return
        }

        // Persist locally immediately so the 1-free-mock limit holds even offline
        val backup = loadLocalStudentBackup(studentId)
        if (backup != null) {
            val prevArr = backup.optJSONArray("freeMockUsedSubjects") ?: JSONArray()
            val mergedSet = linkedSetOf<String>()
            for (i in 0 until prevArr.length()) {
                val item = prevArr.optString(i, "").trim()
                if (item.isNotBlank()) mergedSet.add(item)
            }
            mergedSet.add(subjectId)
            backup.put("freeMockUsedSubjects", JSONArray(mergedSet.toList()))
            saveLocalStudentBackup(backup, pendingSync = backup.optBoolean("pendingServerSync", false))
        }

        val localDb = db
        if (localDb == null || !isInternetConnected() || System.currentTimeMillis() < serverQuotaDegradedUntilMs) {
            resolveCallSuccess(callId, "true")
            return
        }

        activity.lifecycleScope.launch(Dispatchers.IO) {
            val ref = localDb.collection("students").document(studentId)
            runCatching {
                withTimeoutOrNull(4_000L) {
                    ref.update(
                        mapOf(
                            "freeMockUsedSubjects" to FieldValue.arrayUnion(subjectId),
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    ).awaitResult()
                }
            }.onFailure { err ->
                markQuotaDegradedIfApplicable(err)
            }
            resolveCallSuccess(callId, "true")
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
                val autoRef = "SS-${requestId.removePrefix("pay_").take(10).uppercase()}"
                val upiTransactionRef = obj.optString("upiTransactionRef", "").trim().ifBlank { autoRef }
                val utrNormalized = obj.optString("utrNormalized", "").trim().ifBlank { autoRef }
                val screenshotBase64 = obj.getString("screenshotBase64")
                val subjectId = obj.optString("subjectId", "all")

                val utrRef = localDb.collection("utr_locks").document(utrNormalized)
                val reqRef = localDb.collection("payment_requests").document(requestId)

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
                        val stSnap = runCatching { stRef.get(Source.CACHE).awaitResult() }.getOrNull()
                            ?.takeIf { it.exists() }
                            ?: stRef.get().awaitResult()
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
                    val upperCode = cleanCode.trim().uppercase()
                    val codeSub = when {
                        rawSub in listOf("maths", "science", "social_science", "gujarati", "hindi", "all") -> rawSub
                        upperCode.startsWith("MAT") || upperCode.startsWith("MTH") -> "maths"
                        upperCode.startsWith("SCI") -> "science"
                        upperCode.startsWith("SOC") || upperCode.startsWith("SS-") -> "social_science"
                        upperCode.startsWith("GUJ") -> "gujarati"
                        upperCode.startsWith("HIN") -> "hindi"
                        upperCode.startsWith("ALL") -> "all"
                        batchName.contains("maths") -> "maths"
                        batchName.contains("gujarati") || batchName.contains("ગુજરાતી") -> "gujarati"
                        batchName.contains("hindi") || batchName.contains("હિન્દી") || batchName.contains("हिन्दी") || batchName.contains("हिंदी") -> "hindi"
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
                            unlockedSet.addAll(listOf("maths", "science", "social_science", "gujarati", "hindi"))
                        } else {
                            unlockedSet.add(codeSub)
                        }
                        val hasFull = unlockedSet.contains("all") ||
                            listOf("maths", "science", "social_science", "gujarati", "hindi").all { unlockedSet.contains(it) }
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

                if (canSyncStudent) {
                    runCatching {
                        val unlockedCodeSub = resObj.optString("subjectId", "all")
                        val existingBackup = loadLocalStudentBackup(studentId) ?: buildNewStudentJson(
                            studentId = studentId,
                            fullName = cleanName.take(60),
                            cleanMobile = cleanMobile
                        )
                        val unlockedSet = linkedSetOf<String>()
                        val existingArr = existingBackup.optJSONArray("unlockedSubjects")
                        if (existingArr != null) {
                            for (i in 0 until existingArr.length()) {
                                val s = existingArr.optString(i).trim()
                                if (s.isNotBlank()) unlockedSet.add(s)
                            }
                        }
                        if (unlockedCodeSub == "all") {
                            unlockedSet.add("all")
                            unlockedSet.addAll(listOf("maths", "science", "social_science", "gujarati", "hindi"))
                        } else if (unlockedCodeSub.isNotBlank()) {
                            unlockedSet.add(unlockedCodeSub)
                        }
                        val hasFull = unlockedSet.contains("all") ||
                            listOf("maths", "science", "social_science", "gujarati", "hindi").all { unlockedSet.contains(it) }
                        val nextArr = JSONArray().apply {
                            unlockedSet.take(10).forEach { put(it) }
                        }
                        existingBackup.put("hasQuizAccess", hasFull)
                        existingBackup.put("redeemedCode", cleanCode)
                        existingBackup.put("unlockedSubjects", nextArr)
                        saveLocalStudentBackup(existingBackup, pendingSync = false, markActive = true)
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
        val localDb = db ?: return
        activity.runOnUiThread {
            stopPublicListeners()
            refreshPaymentListenersInternal(paymentIdsJson)

            val releaseReg = localDb.collection("app_config").document("release")
                .addSnapshotListener { snap, error ->
                    if (error != null) return@addSnapshotListener
                    if (snap != null && snap.exists()) {
                        emitToJs("window.__onNativeReleaseConfig", serializeReleaseConfig(snap).toString())
                    } else {
                        emitToJs("window.__onNativeReleaseConfig", "null")
                    }
                }
            publicListeners.add(releaseReg)

            val updateNotifReg = localDb.collection("update_notifications")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(25)
                .addSnapshotListener { snap, error ->
                    if (error != null) return@addSnapshotListener
                    val arr = JSONArray()
                    snap?.documents?.forEach { arr.put(serializeUpdateNotification(it)) }
                    emitToJs("window.__onNativeUpdateNotifications", arr.toString())
                }
            publicListeners.add(updateNotifReg)
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
            ids.distinct().take(5).forEach { payId ->
                val docRef = localDb.collection("payment_requests").document(payId)
                val reg = docRef
                    .addSnapshotListener { snap, error ->
                        if (error != null) {
                            if (isQuotaOrOfflineException(error)) {
                                activity.lifecycleScope.launch(Dispatchers.IO) {
                                    val cached = runCatching { docRef.get(Source.CACHE).awaitResult() }.getOrNull()
                                    if (cached != null && cached.exists()) {
                                        byId[payId] = serializePayment(cached)
                                        val sorted = byId.values.sortedByDescending {
                                            it.optJSONObject("createdAt")?.optLong("seconds") ?: Long.MAX_VALUE
                                        }
                                        val out = JSONArray()
                                        sorted.forEach { out.put(it) }
                                        emitToJs("window.__onNativeMyPayments", out.toString())
                                    }
                                }
                            }
                            return@addSnapshotListener
                        }
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

    private fun emitAdminCachedData(localDb: FirebaseFirestore) {
        val payQuery = localDb.collection("payment_requests")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(25)
        val codeQuery = localDb.collection("access_codes")
            .orderBy("createdAt", Query.Direction.DESCENDING)
        val studentsQuery = localDb.collection("students")
            .orderBy("updatedAt", Query.Direction.DESCENDING)
            .limit(25)

        activity.lifecycleScope.launch(Dispatchers.IO) {
            val payCache = runCatching { payQuery.get(Source.CACHE).awaitResult() }.getOrNull()
            if (payCache != null && !payCache.isEmpty) {
                val arr = JSONArray()
                payCache.documents.forEach { arr.put(serializePayment(it)) }
                val jsonStr = arr.toString()
                saveAdminListBackup("all_payments", jsonStr)
                emitToJs("window.__onNativeAllPayments", jsonStr)
            } else {
                emitToJs("window.__onNativeAllPayments", loadAdminListBackup("all_payments"))
            }

            val codeCache = runCatching { codeQuery.get(Source.CACHE).awaitResult() }.getOrNull()
            if (codeCache != null && !codeCache.isEmpty) {
                val seq = codeSnapshotSeq.incrementAndGet()
                emitAllCodesChunked(codeCache.documents, seq)
            } else {
                emitToJs("window.__onNativeAllCodes", loadAdminListBackup("all_codes"))
            }

            val stCache = runCatching { studentsQuery.get(Source.CACHE).awaitResult() }.getOrNull()
            if (stCache != null && !stCache.isEmpty) {
                val arr = JSONArray()
                stCache.documents.forEach { arr.put(serializeStudent(it)) }
                val jsonStr = arr.toString()
                saveAdminListBackup("all_students", jsonStr)
                emitToJs("window.__onNativeAllStudents", jsonStr)
            } else {
                emitToJs("window.__onNativeAllStudents", loadAdminListBackup("all_students"))
            }
        }
    }

    private fun pauseAdminListenersOnQuota(localDb: FirebaseFirestore) {
        serverQuotaDegradedUntilMs = System.currentTimeMillis() + 5L * 60L * 1000L
        emitAdminCachedData(localDb)
        activity.runOnUiThread {
            adminListenersActive = false
            adminListeners.forEach { it.remove() }
            adminListeners.clear()
            emitNativeSyncState(
                serverConnected = false,
                liveSyncActive = false,
                errorKind = "quota",
                quotaCooldownUntilMs = serverQuotaDegradedUntilMs,
                lastErrorMessage = "Firestore quota limit reached"
            )
        }
    }

    @JavascriptInterface
    fun forceRefreshAdminListeners() {
        serverQuotaDegradedUntilMs = 0L
        activity.runOnUiThread {
            adminListenersActive = false
            startAdminListeners()
        }
    }

    @JavascriptInterface
    fun pauseAdminListeners() {
        activity.runOnUiThread {
            adminListenersActive = false
            adminListeners.forEach { it.remove() }
            adminListeners.clear()
            val online = isInternetConnected()
            val inQuota = System.currentTimeMillis() < serverQuotaDegradedUntilMs
            emitNativeSyncState(
                serverConnected = online && !inQuota,
                liveSyncActive = false,
                errorKind = if (!online) "network" else if (inQuota) "quota" else "none",
                quotaCooldownUntilMs = if (inQuota) serverQuotaDegradedUntilMs else 0L
            )
        }
    }

    @JavascriptInterface
    fun resumeAdminListeners() {
        activity.runOnUiThread {
            if (isCurrentUserAdmin()) {
                startAdminListeners()
            }
        }
    }

    @JavascriptInterface
    fun loadMoreAdminCollection(callId: String, collectionName: String, cursorSeconds: Long) {
        val localDb = db ?: run {
            resolveCallSuccess(callId, "[]")
            return
        }
        if (!isInternetConnected() || System.currentTimeMillis() < serverQuotaDegradedUntilMs) {
            resolveCallSuccess(callId, "[]")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            try {
                val cursorTs = Timestamp(cursorSeconds, 0)
                val orderField = if (collectionName == "students") "updatedAt" else "createdAt"
                val pageLimit = if (collectionName == "access_codes") 1000L else 25L
                val snap = withTimeoutOrNull(12_000L) {
                    localDb.collection(collectionName)
                        .orderBy(orderField, Query.Direction.DESCENDING)
                        .startAfter(cursorTs)
                        .limit(pageLimit)
                        .get()
                        .awaitResult()
                }
                if (snap == null) {
                    resolveCallSuccess(callId, "[]")
                    return@launch
                }
                val arr = JSONArray()
                snap.documents.forEach { doc ->
                    when (collectionName) {
                        "payment_requests" -> arr.put(serializePayment(doc))
                        "access_codes" -> arr.put(serializeAccessCode(doc))
                        "students" -> arr.put(serializeStudent(doc))
                    }
                }
                emitNativeSyncState(
                    serverConnected = true,
                    liveSyncActive = adminListenersActive,
                    lastSyncAtMs = System.currentTimeMillis(),
                    errorKind = "none",
                    quotaCooldownUntilMs = 0L,
                    lastErrorMessage = ""
                )
                resolveCallSuccess(callId, arr.toString())
            } catch (e: Exception) {
                markQuotaDegradedIfApplicable(e)
                handleFirestoreError(e, OperationType.LIST, collectionName)
                resolveCallError(callId, e.localizedMessage ?: "Failed to load more items")
            }
        }
    }

    @JavascriptInterface
    fun startAdminListeners() {
        val localDb = db ?: return
        activity.runOnUiThread {
            if (!isCurrentUserAdmin()) {
                stopAdminListeners()
                return@runOnUiThread
            }
            if (adminListenersActive && adminListeners.isNotEmpty()) {
                return@runOnUiThread
            }
            adminListeners.forEach { it.remove() }
            adminListeners.clear()

            // Immediately display cached data so Admin screen loads instantaneously
            emitAdminCachedData(localDb)

            if (!isInternetConnected() || System.currentTimeMillis() < serverQuotaDegradedUntilMs) {
                adminListenersActive = false
                emitNetworkAndSyncSnapshot()
                return@runOnUiThread
            }

            adminListenersActive = true
            emitNativeSyncState(
                serverConnected = true,
                liveSyncActive = true,
                errorKind = "none",
                quotaCooldownUntilMs = 0L
            )

            val payQuery = localDb.collection("payment_requests")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(25)
            val payReg = payQuery
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "payment_requests")
                        if (isQuotaOrOfflineException(error)) {
                            pauseAdminListenersOnQuota(localDb)
                        } else {
                            emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        }
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents?.forEach { arr.put(serializePayment(it)) }
                    val jsonStr = arr.toString()
                    saveAdminListBackup("all_payments", jsonStr)
                    emitToJs("window.__onNativeAllPayments", jsonStr)
                    if (snap != null && !snap.metadata.isFromCache) {
                        emitNativeSyncState(
                            serverConnected = true,
                            liveSyncActive = adminListenersActive,
                            lastSyncAtMs = System.currentTimeMillis(),
                            errorKind = "none",
                            quotaCooldownUntilMs = 0L,
                            lastErrorMessage = ""
                        )
                    }
                }
            adminListeners.add(payReg)

            val codeQuery = localDb.collection("access_codes")
                .orderBy("createdAt", Query.Direction.DESCENDING)
            val codeReg = codeQuery
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "access_codes")
                        if (isQuotaOrOfflineException(error)) {
                            pauseAdminListenersOnQuota(localDb)
                        } else {
                            emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        }
                        return@addSnapshotListener
                    }
                    val docs = snap?.documents ?: emptyList()
                    val isFromServer = snap != null && !snap.metadata.isFromCache
                    val seq = codeSnapshotSeq.incrementAndGet()
                    activity.lifecycleScope.launch(Dispatchers.IO) {
                        emitAllCodesChunked(docs, seq)
                        if (isFromServer) {
                            emitNativeSyncState(
                                serverConnected = true,
                                liveSyncActive = adminListenersActive,
                                lastSyncAtMs = System.currentTimeMillis(),
                                errorKind = "none",
                                quotaCooldownUntilMs = 0L,
                                lastErrorMessage = ""
                            )
                        }
                    }
                }
            adminListeners.add(codeReg)

            val studentsQuery = localDb.collection("students")
                .orderBy("updatedAt", Query.Direction.DESCENDING)
                .limit(25)
            val studentsReg = studentsQuery
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        handleFirestoreError(error, OperationType.LIST, "students")
                        if (isQuotaOrOfflineException(error)) {
                            pauseAdminListenersOnQuota(localDb)
                        } else {
                            emitToJs("window.__onNativeAdminError", JSONObject.quote(error.localizedMessage ?: "Permission denied"))
                        }
                        return@addSnapshotListener
                    }
                    val arr = JSONArray()
                    snap?.documents?.forEach { arr.put(serializeStudent(it)) }
                    val jsonStr = arr.toString()
                    saveAdminListBackup("all_students", jsonStr)
                    emitToJs("window.__onNativeAllStudents", jsonStr)
                    if (snap != null && !snap.metadata.isFromCache) {
                        emitNativeSyncState(
                            serverConnected = true,
                            liveSyncActive = adminListenersActive,
                            lastSyncAtMs = System.currentTimeMillis(),
                            errorKind = "none",
                            quotaCooldownUntilMs = 0L,
                            lastErrorMessage = ""
                        )
                    }
                }
            adminListeners.add(studentsReg)

            val releaseReg = localDb.collection("app_config").document("release")
                .addSnapshotListener { snap, error ->
                    if (error != null) return@addSnapshotListener
                    if (snap != null && snap.exists()) {
                        emitToJs("window.__onNativeReleaseConfig", serializeReleaseConfig(snap).toString())
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
            adminListenersActive = false
            adminListeners.forEach { it.remove() }
            adminListeners.clear()
            val online = isInternetConnected()
            val inQuota = System.currentTimeMillis() < serverQuotaDegradedUntilMs
            emitNativeSyncState(
                serverConnected = online && !inQuota,
                liveSyncActive = false,
                errorKind = if (!online) "network" else if (inQuota) "quota" else "none",
                quotaCooldownUntilMs = if (inQuota) serverQuotaDegradedUntilMs else 0L
            )
        }
    }

    @JavascriptInterface
    fun verifyActiveSessionNow() {
        verifyActiveSessionInternal()
    }

    private fun verifyActiveSessionInternal() {
        if (!isAttached) return
        val localDb = db ?: return
        val now = System.currentTimeMillis()
        if (now - lastResumeCheckMs < 60_000L) return
        if (!isInternetConnected() || now < serverQuotaDegradedUntilMs) return
        lastResumeCheckMs = now

        val studentId = currentStudentListenerId

        if (studentId.isNotBlank()) {
            activity.lifecycleScope.launch(Dispatchers.IO) {
                runCatching {
                    withTimeoutOrNull(4_000L) {
                        localDb.collection("students").document(studentId).get(Source.SERVER).awaitResult()
                    }
                }.onSuccess { snap ->
                    if (snap != null && snap.exists()) {
                        val json = serializeStudent(snap)
                        saveLocalStudentBackup(json, pendingSync = false)
                        emitToJs("window.__onNativeStudentProfile", json.toString())
                    }
                }.onFailure { markQuotaDegradedIfApplicable(it) }
            }
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
                        val candidate = generate8CharCode(subjectId)
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
            val count = obj.getInt("count").coerceAtLeast(1)
            val batchName = obj.getString("batchName").take(60)
            val subjectId = obj.getString("subjectId")

            val codes = linkedSetOf<String>()
            while (codes.size < count) {
                codes.add(generate8CharCode(subjectId))
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
    fun generateDirectCodeForMobile(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            try {
                val obj = JSONObject(payloadJson)
                val cleanMobile = obj.getString("mobileNumber").replace(Regex("\\D"), "").takeLast(10)
                if (!Regex("^[0-9]{10}$").matches(cleanMobile)) {
                    resolveCallError(callId, "INVALID_MOBILE")
                    return@launch
                }
                val rawName = obj.optString("userName", "").trim().take(60)
                val rawSub = obj.optString("subjectId", "all").trim()
                val subjectId = if (rawSub in listOf("maths", "science", "social_science", "gujarati", "hindi", "all")) rawSub else "all"
                val amountRupees = if (subjectId == "all") 49 else 24
                val subjectLabel = when (subjectId) {
                    "maths" -> "ગણિત (Maths)"
                    "science" -> "વિજ્ઞાન (Science)"
                    "social_science" -> "સામાજિક વિજ્ઞાન (SS)"
                    "gujarati" -> "ગુજરાતી (Gujarati)"
                    "hindi" -> "હિન્દી (Hindi)"
                    else -> "બધા વિષયો (All)"
                }
                val batchLabel = "$subjectLabel • ₹$amountRupees".take(60)

                val effectiveName = if (rawName.isNotBlank()) {
                    rawName
                } else {
                    val stSnap = runCatching {
                        withTimeoutOrNull(2_500L) {
                            localDb.collection("students").document("mob_$cleanMobile").get().awaitResult()
                        }
                    }.getOrNull()
                    stSnap?.getString("fullName")?.trim()?.take(60)?.ifBlank { "Student" } ?: "Student"
                }

                val chosenCode = localDb.runTransaction { tx ->
                    var uniqueCode = ""
                    for (attempt in 0 until 10) {
                        val candidate = generate8CharCode(subjectId)
                        val candSnap = tx.get(localDb.collection("access_codes").document(candidate))
                        if (!candSnap.exists()) {
                            uniqueCode = candidate
                            break
                        }
                    }
                    if (uniqueCode.isEmpty()) {
                        throw IllegalStateException("Failed to generate unique code")
                    }
                    val codeRef = localDb.collection("access_codes").document(uniqueCode)
                    tx.set(
                        codeRef,
                        mapOf(
                            "code" to uniqueCode,
                            "requestId" to "ADMIN-DIRECT",
                            "userName" to effectiveName,
                            "mobileNumber" to cleanMobile,
                            "amountRupees" to amountRupees,
                            "batchName" to batchLabel,
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
                    uniqueCode
                }.awaitResult()

                val resJson = JSONObject().apply {
                    put("code", chosenCode)
                    put("mobileNumber", cleanMobile)
                    put("userName", effectiveName)
                    put("subjectId", subjectId)
                    put("amountRupees", amountRupees)
                }
                resolveCallSuccess(callId, resJson.toString())
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.CREATE, "access_codes")
                resolveCallError(callId, e.localizedMessage ?: "Direct code generation failed")
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
            val repo = obj.optString("githubOwnerRepo", "").take(120)
            val notes = obj.optString("releaseNotes", "").take(1000)
            val ref = localDb.collection("app_config").document("release")
            try {
                val updates = hashMapOf<String, Any>(
                    "githubOwnerRepo" to repo,
                    "releaseNotes" to notes,
                    "updatedAt" to FieldValue.serverTimestamp(),
                )
                ref.set(updates, SetOptions.merge()).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.WRITE, ref.path)
                resolveCallError(callId, e.localizedMessage ?: "Save failed")
            }
        }
    }

    // =========================================================================
    // In-App App Update Manager (Admin APK Publish + User In-App Download/Install)
    // =========================================================================

    private fun syncPublicDeviceFcmRegistration() {
        if (!ensureFirebaseInitialized()) return
        val localDb = db ?: return
        activity.lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                AdminNotificationHelper.clearStaleFcmTopicQueue(appContext)
                val gmsStatus = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(appContext)
                if (gmsStatus != ConnectionResult.SUCCESS) {
                    return@launch
                }
                val token = withTimeoutOrNull(4_500L) {
                    FirebaseMessaging.getInstance().token.awaitResult()
                }.orEmpty()
                if (token.length >= 20) {
                    AdminNotificationHelper.saveFcmToken(appContext, token)
                    val deviceId = AdminNotificationHelper.getOrCreateDeviceId(appContext)
                    val actualPkgInfo = runCatching {
                        appContext.packageManager.getPackageInfo(appContext.packageName, 0)
                    }.getOrNull()
                    val appVersion = actualPkgInfo?.versionName.orEmpty().ifBlank { "1.0.0" }.take(32)
                    val versionCode = if (actualPkgInfo != null) {
                        PackageInfoCompat.getLongVersionCode(actualPkgInfo).coerceAtLeast(1L)
                    } else 1L

                    val docRef = localDb.collection("device_fcm_tokens").document(deviceId)
                    val existing = runCatching {
                        withTimeoutOrNull(2_500L) { docRef.get().awaitResult() }
                    }.getOrNull()
                    val payload = hashMapOf<String, Any>(
                        "deviceId" to deviceId,
                        "token" to token.take(512),
                        "platform" to "android",
                        "appVersion" to appVersion,
                        "versionCode" to versionCode,
                        "topicSubscribed" to false,
                        "enabled" to true,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                    if (existing == null || !existing.exists()) {
                        payload["createdAt"] = FieldValue.serverTimestamp()
                        docRef.set(payload).awaitResult()
                    } else {
                        docRef.set(payload, SetOptions.merge()).awaitResult()
                    }
                }
            }.onFailure { err ->
                Log.w("NativeFirebase", "Public device FCM sync deferred", err)
            }
        }
    }

    @JavascriptInterface
    fun getInstalledAppInfo(): String {
        return runCatching { AppUpdateManager.getInstalledAppInfo(appContext).toString() }
            .getOrDefault("{}")
    }

    @JavascriptInterface
    fun pickAndInspectApkFile(callId: String) {
        pendingApkPickCallId = callId
        activity.runOnUiThread {
            onLaunchApkPicker()
        }
    }

    fun onApkFilePickedResult(uri: Uri?) {
        val callId = pendingApkPickCallId ?: return
        pendingApkPickCallId = null
        if (uri == null) {
            resolveCallError(callId, "PICK_CANCELLED")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val inspected = AppUpdateManager.inspectPickedApkUri(appContext, uri)
                resolveCallSuccess(callId, inspected.toJson().toString())
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to inspect selected APK")
            }
        }
    }

    @JavascriptInterface
    fun publishAppUpdate(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Admin Google login required.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!verifyAuthorizedAdminSuspended(user)) {
                    resolveCallError(callId, "ONLY_ADMIN_GOOGLE_EMAIL")
                    return@launch
                }
                val obj = JSONObject(payloadJson)
                val stagedFilePath = obj.optString("stagedFilePath", "").trim()
                val versionName = obj.optString("versionName", "1.0.1").trim().ifBlank { "1.0.1" }.take(32)
                val versionCode = obj.optLong("versionCode", 2L).coerceIn(1L, 1_000_000L)
                val updateTitle = obj.optString("updateTitle", "").trim()
                    .ifBlank { "Quick Quiz v$versionName" }
                    .take(120)
                val releaseNotes = obj.optString("releaseNotes", "").trim().take(1000)
                val isMandatory = obj.optBoolean("isMandatory", false)
                val githubOwnerRepo = obj.optString("githubOwnerRepo", "").trim().take(120)

                var apkDownloadUrl = obj.optString("apkDownloadUrl", "").trim().take(2000)
                var apkStoragePath = obj.optString("apkStoragePath", "").trim().take(300)
                var apkFileName = obj.optString("apkFileName", "").trim().take(160)
                var apkSizeBytes = obj.optLong("apkSizeBytes", 0L).coerceIn(0L, 262_144_000L)
                var apkSha256 = obj.optString("apkSha256", "").trim().take(64)
                var signingCertSha256 = obj.optString("signingCertSha256", "").trim().take(64)
                var packageName = obj.optString("packageName", appContext.packageName).trim().take(120)

                if (stagedFilePath.isNotBlank()) {
                    val stageRoot = File(appContext.cacheDir, "release_stage").canonicalFile
                    val targetFile = File(stagedFilePath).canonicalFile
                    if (!targetFile.path.startsWith(stageRoot.path + File.separator)) {
                        resolveCallError(callId, "Invalid staged release file path.")
                        return@launch
                    }
                    val inspected = AppUpdateManager.inspectLocalApkFile(appContext, targetFile, apkFileName.ifBlank { null })
                    if (!inspected.packageMatches) {
                        resolveCallError(
                            callId,
                            "APK package name (${inspected.packageName}) must match ${appContext.packageName}."
                        )
                        return@launch
                    }
                    if (!inspected.signatureMatches) {
                        resolveCallError(
                            callId,
                            "APK signing certificate does not match the installed app certificate."
                        )
                        return@launch
                    }
                    val targetStorageName = "std10quiz_v${versionName.replace(Regex("[^a-zA-Z0-9._-]"), "_")}_c${versionCode}_${System.currentTimeMillis()}.apk"
                    val (uploadedUrl, uploadedPath) = AppUpdateManager.uploadStagedApkToFirebaseStorage(
                        context = appContext,
                        stagedFilePath = stagedFilePath,
                        storageFileName = targetStorageName
                    ) { pct, transferred, total ->
                        val evt = JSONObject().apply {
                            put("status", "uploading")
                            put("progressPercent", pct)
                            put("bytesTransferred", transferred)
                            put("totalBytes", total)
                        }
                        emitToJs("window.__onNativeApkUploadProgress", evt.toString())
                    }
                    apkDownloadUrl = uploadedUrl
                    apkStoragePath = uploadedPath
                    apkFileName = inspected.fileName
                    apkSizeBytes = inspected.fileSizeBytes
                    apkSha256 = inspected.apkSha256
                    signingCertSha256 = inspected.signingCertSha256
                    packageName = inspected.packageName
                }

                if (!apkDownloadUrl.startsWith("https://", ignoreCase = true) || apkSizeBytes <= 0L) {
                    resolveCallError(callId, "Please select and upload a valid APK file first.")
                    return@launch
                }

                val releaseId = "rel_${versionCode}_${System.currentTimeMillis()}"
                val now = FieldValue.serverTimestamp()

                val releaseDoc = hashMapOf<String, Any>(
                    "versionName" to versionName,
                    "versionCode" to versionCode,
                    "updateTitle" to updateTitle,
                    "releaseNotes" to releaseNotes.ifBlank { "નવું વર્ઝન v$versionName ઉપલબ્ધ છે." },
                    "apkDownloadUrl" to apkDownloadUrl,
                    "apkStoragePath" to apkStoragePath.ifBlank { "app_releases/$apkFileName" },
                    "apkFileName" to apkFileName.ifBlank { "std10quiz_v$versionName.apk" },
                    "apkSizeBytes" to apkSizeBytes,
                    "apkSha256" to apkSha256,
                    "signingCertSha256" to signingCertSha256,
                    "packageName" to packageName.ifBlank { appContext.packageName },
                    "isMandatory" to isMandatory,
                    "publishedByUid" to user.uid,
                    "createdAt" to now,
                    "updatedAt" to now
                )

                val configDoc = hashMapOf<String, Any>(
                    "githubOwnerRepo" to githubOwnerRepo,
                    "releaseNotes" to releaseNotes.ifBlank { "નવું વર્ઝન v$versionName ઉપલબ્ધ છે." },
                    "latestVersionName" to versionName,
                    "latestVersionCode" to versionCode,
                    "updateTitle" to updateTitle,
                    "apkDownloadUrl" to apkDownloadUrl,
                    "apkStoragePath" to apkStoragePath.ifBlank { "app_releases/$apkFileName" },
                    "apkFileName" to apkFileName.ifBlank { "std10quiz_v$versionName.apk" },
                    "apkSizeBytes" to apkSizeBytes,
                    "apkSha256" to apkSha256,
                    "signingCertSha256" to signingCertSha256,
                    "packageName" to packageName.ifBlank { appContext.packageName },
                    "isMandatory" to isMandatory,
                    "publishedByUid" to user.uid,
                    "publishedAt" to now,
                    "updatedAt" to now
                )

                val notifDoc = hashMapOf<String, Any>(
                    "releaseId" to releaseId,
                    "appName" to appContext.getString(R.string.app_name).take(80),
                    "versionName" to versionName,
                    "versionCode" to versionCode,
                    "title" to updateTitle,
                    "body" to releaseNotes.ifBlank { "નવું વર્ઝન v$versionName ઉપલબ્ધ છે. એપની અંદરથી તરત અપડેટ કરો." },
                    "isMandatory" to isMandatory,
                    "apkDownloadUrl" to apkDownloadUrl,
                    "targetRoute" to "app_update",
                    "pushDispatched" to false,
                    "recipientCount" to 0,
                    "createdAt" to now,
                    "updatedAt" to now
                )

                val batch = localDb.batch()
                batch.set(localDb.collection("app_releases").document(releaseId), releaseDoc)
                batch.set(localDb.collection("app_config").document("release"), configDoc)
                batch.set(localDb.collection("update_notifications").document(releaseId), notifDoc)
                batch.commit().awaitResult()

                val res = JSONObject().apply {
                    put("releaseId", releaseId)
                    put("apkDownloadUrl", apkDownloadUrl)
                    put("versionName", versionName)
                    put("versionCode", versionCode)
                }
                resolveCallSuccess(callId, res.toString())
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.WRITE, "app_releases")
                resolveCallError(callId, e.localizedMessage ?: "Failed to publish update")
            }
        }
    }

    @JavascriptInterface
    fun downloadAndInstallAppUpdate(callId: String, payloadJson: String) {
        activeUpdateDownloadJob?.cancel()
        activeUpdateDownloadJob = activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val downloadUrl = obj.getString("apkDownloadUrl").trim()
                val versionName = obj.optString("versionName", "latest").trim()
                val expectedSizeBytes = obj.optLong("apkSizeBytes", 0L)
                val expectedSha256 = obj.optString("apkSha256", "").trim()
                val expectedCertSha256 = obj.optString("signingCertSha256", "").trim()

                emitUpdateProgress("downloading", 1, 0L, expectedSizeBytes, "")

                val verifiedApk = AppUpdateManager.downloadAndVerifyApkInApp(
                    context = appContext,
                    downloadUrl = downloadUrl,
                    versionName = versionName,
                    expectedSizeBytes = expectedSizeBytes,
                    expectedSha256 = expectedSha256,
                    expectedSigningCertSha256 = expectedCertSha256,
                    onProgress = { pct, downloaded, total ->
                        emitUpdateProgress("downloading", pct, downloaded, total, "")
                    },
                    onVerifying = { finalSize ->
                        emitUpdateProgress("verifying", 99, finalSize, finalSize, "")
                    }
                )

                pendingInstallApkFile = verifiedApk
                val finalSize = verifiedApk.length()

                withContext(Dispatchers.Main) {
                    if (!AppUpdateManager.canRequestPackageInstalls(appContext)) {
                        awaitingInstallPermission = true
                        emitUpdateProgress("permission_required", 100, finalSize, finalSize, "")
                        AppUpdateManager.openUnknownSourcesPermissionSettings(activity)
                        resolveCallSuccess(
                            callId,
                            JSONObject().apply { put("status", "permission_required") }.toString()
                        )
                    } else {
                        awaitingInstallPermission = false
                        emitUpdateProgress("installing", 100, finalSize, finalSize, "")
                        AppUpdateManager.launchPackageInstaller(activity, verifiedApk)
                        resolveCallSuccess(
                            callId,
                            JSONObject().apply { put("status", "installing") }.toString()
                        )
                    }
                }
            } catch (ce: CancellationException) {
                throw ce
            } catch (e: Exception) {
                val msg = e.localizedMessage ?: "Unable to download update APK."
                emitUpdateProgress("error", 0, 0L, 0L, msg)
                resolveCallError(callId, msg)
            }
        }
    }

    @JavascriptInterface
    fun retryInstallPendingApk(callId: String) {
        val apk = pendingInstallApkFile
        if (apk == null || !apk.exists()) {
            emitUpdateProgress("error", 0, 0L, 0L, "Downloaded update file not found. Please tap Update Now again.")
            resolveCallError(callId, "NO_PENDING_APK")
            return
        }
        val apkLen = apk.length()
        activity.lifecycleScope.launch(Dispatchers.Main) {
            try {
                if (!AppUpdateManager.canRequestPackageInstalls(appContext)) {
                    awaitingInstallPermission = true
                    emitUpdateProgress("permission_required", 100, apkLen, apkLen, "")
                    AppUpdateManager.openUnknownSourcesPermissionSettings(activity)
                    resolveCallSuccess(
                        callId,
                        JSONObject().apply { put("status", "permission_required") }.toString()
                    )
                } else {
                    awaitingInstallPermission = false
                    emitUpdateProgress("installing", 100, apkLen, apkLen, "")
                    AppUpdateManager.launchPackageInstaller(activity, apk)
                    resolveCallSuccess(
                        callId,
                        JSONObject().apply { put("status", "installing") }.toString()
                    )
                }
            } catch (e: Exception) {
                val msg = e.localizedMessage ?: "Unable to open package installer."
                emitUpdateProgress("error", 0, 0L, 0L, msg)
                resolveCallError(callId, msg)
            }
        }
    }

    private fun emitUpdateProgress(
        status: String,
        progressPercent: Int,
        bytesDownloaded: Long,
        totalBytes: Long,
        message: String
    ) {
        val evt = JSONObject().apply {
            put("status", status)
            put("progressPercent", progressPercent)
            put("bytesDownloaded", bytesDownloaded)
            put("totalBytes", totalBytes)
            put("message", message)
        }
        emitToJs("window.__onNativeAppUpdateProgress", evt.toString())
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
                            "unlockedSubjects" to listOf("all", "maths", "science", "social_science", "gujarati", "hindi"),
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
                val allSubs = listOf("maths", "science", "social_science", "gujarati", "hindi")
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
    fun fetchCodesByBatch(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            try {
                val obj = JSONObject(payloadJson)
                val batchName = obj.optString("batchName", "").trim()
                val snap = if (batchName.isNotBlank()) {
                    localDb.collection("access_codes")
                        .whereEqualTo("batchName", batchName)
                        .get()
                        .awaitResult()
                } else {
                    localDb.collection("access_codes")
                        .orderBy("createdAt", Query.Direction.DESCENDING)
                        .get()
                        .awaitResult()
                }
                val arr = JSONArray()
                snap.documents.forEach { arr.put(serializeAccessCode(it)) }
                resolveCallSuccess(callId, arr.toString())
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.LIST, "access_codes")
                resolveCallError(callId, e.localizedMessage ?: "Failed to fetch batch codes")
            }
        }
    }

    @JavascriptInterface
    fun deleteUnusedAccessCodes(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            try {
                val obj = if (payloadJson.isNotBlank()) JSONObject(payloadJson) else JSONObject()
                val batchName = obj.optString("batchName", "").trim()

                val isDirectUntaggedOnly = batchName == "__direct_untagged__"
                val snap = if (batchName.isNotBlank() && !isDirectUntaggedOnly) {
                    localDb.collection("access_codes")
                        .whereEqualTo("batchName", batchName)
                        .get()
                        .awaitResult()
                } else {
                    localDb.collection("access_codes")
                        .whereEqualTo("isUsed", false)
                        .get()
                        .awaitResult()
                }

                val unusedDocs = snap.documents.filter { doc ->
                    val isUsed = doc.getBoolean("isUsed") == true
                    val status = doc.getString("status").orEmpty().lowercase()
                    val docBatch = doc.getString("batchName").orEmpty().trim()
                    !isUsed && status != "used" && (!isDirectUntaggedOnly || docBatch.isBlank())
                }

                val deletedCodesArr = JSONArray()
                unusedDocs.chunked(400).forEach { chunk ->
                    val batch = localDb.batch()
                    chunk.forEach { doc ->
                        batch.delete(doc.reference)
                        deletedCodesArr.put(doc.getString("code") ?: doc.id)
                    }
                    batch.commit().awaitResult()
                }

                val res = JSONObject().apply {
                    put("deletedCount", unusedDocs.size)
                    put("deletedCodes", deletedCodesArr)
                }
                resolveCallSuccess(callId, res.toString())
            } catch (e: Exception) {
                handleFirestoreError(e, OperationType.DELETE, "access_codes")
                resolveCallError(callId, e.localizedMessage ?: "Failed to delete unused access codes")
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

    private fun isSuperAdminUser(user: FirebaseUser?): Boolean {
        if (user == null) return false
        val email = user.email?.trim()?.lowercase().orEmpty()
        if (email == ADMIN_OWNER_EMAIL && user.isEmailVerified) return true
        return user.phoneNumber == ADMIN_PHONE_E164
    }

    private fun isCurrentUserAdmin(): Boolean {
        val user = auth?.currentUser ?: return false
        if (isSuperAdminUser(user)) return true
        if (verifiedAdminUids.contains(user.uid)) return true
        return AdminNotificationHelper.isAdminSessionActive(appContext) &&
            AdminNotificationHelper.getSavedAdminUid(appContext) == user.uid
    }

    private suspend fun verifyAuthorizedAdminSuspended(user: FirebaseUser?): Boolean {
        if (user == null) return false
        if (isSuperAdminUser(user)) {
            verifiedAdminUids.add(user.uid)
            return true
        }
        val localDb = db ?: return false
        val adminSnap = runCatching {
            withTimeoutOrNull(3_500L) {
                localDb.collection("admins").document(user.uid).get().awaitResult()
            }
        }.getOrNull()
        if (adminSnap != null && adminSnap.exists() && adminSnap.getBoolean("isActive") != false) {
            verifiedAdminUids.add(user.uid)
            return true
        }
        val email = user.email?.trim()?.lowercase().orEmpty()
        if (email.isNotBlank() && user.isEmailVerified) {
            val inviteSnap = runCatching {
                withTimeoutOrNull(3_500L) {
                    localDb.collection("admin_invites").document(email).get().awaitResult()
                }
            }.getOrNull()
            if (inviteSnap != null && inviteSnap.exists()) {
                verifiedAdminUids.add(user.uid)
                return true
            }
        }
        return false
    }

    // =========================================================================
    // Notifications, FCM Tokens, Multi-Admin & 1-to-1 Admin Personal Messaging
    // =========================================================================

    @JavascriptInterface
    fun getNotificationPermissionStatus(): String {
        return if (AdminNotificationHelper.hasNotificationPermission(appContext)) "granted" else "denied"
    }

    @JavascriptInterface
    fun requestNotificationPermission(callId: String) {
        if (AdminNotificationHelper.hasNotificationPermission(appContext)) {
            resolveCallSuccess(callId, JSONObject.quote("granted"))
            return
        }
        pendingNotificationPermissionCallId = callId
        activity.runOnUiThread {
            onRequestPostNotificationsPermission()
        }
    }

    @JavascriptInterface
    fun openNotificationSettings() {
        activity.runOnUiThread {
            AdminNotificationHelper.openNotificationSettings(activity)
        }
    }

    @JavascriptInterface
    fun openBatteryOptimizationSettings() {
        activity.runOnUiThread {
            AdminNotificationHelper.openBatteryOptimizationSettings(activity)
        }
    }

    @JavascriptInterface
    fun isIgnoringBatteryOptimizations(): Boolean {
        return AdminNotificationHelper.isIgnoringBatteryOptimizations(appContext)
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        val status = if (granted) "granted" else "denied"
        pendingNotificationPermissionCallId?.let { callId ->
            pendingNotificationPermissionCallId = null
            resolveCallSuccess(callId, JSONObject.quote(status))
        }
        if (granted) {
            syncPublicDeviceFcmRegistration()
            syncCurrentAdminFcmTokenIfSignedIn()
            AdminBackgroundNotificationWorker.ensurePeriodicScheduled(appContext)
            AdminBackgroundNotificationWorker.scheduleAdminFollowUpChain(appContext)
        }
        emitToJs("window.__onNativeNotificationPermissionChanged", JSONObject.quote(status))
    }

    private fun syncCurrentAdminFcmTokenIfSignedIn() {
        val localDb = db ?: return
        val user = auth?.currentUser ?: return
        activity.lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                if (!AdminNotificationHelper.isAdminSessionActive(appContext) && !verifyAuthorizedAdminSuspended(user)) {
                    return@runCatching
                }
                val token = withTimeoutOrNull(4_500L) {
                    FirebaseMessaging.getInstance().token.awaitResult()
                }.orEmpty()
                if (token.length < 20) return@runCatching

                AdminNotificationHelper.saveFcmToken(appContext, token)
                val deviceId = AdminNotificationHelper.getOrCreateDeviceId(appContext)
                val tokenDocId = "${user.uid}_$deviceId"
                val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android Device" }.take(120)
                val appVersion = runCatching {
                    appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName.orEmpty().ifBlank { "1.0.0" }
                }.getOrDefault("1.0.0").take(32)
                val email = (user.email ?: AdminNotificationHelper.getSavedAdminEmail(appContext)).trim().lowercase().take(120)
                val displayName = (user.displayName?.takeIf { it.isNotBlank() }
                    ?: AdminNotificationHelper.getSavedAdminName(appContext).ifBlank { email.substringBefore('@').ifBlank { "Admin" } }).take(80)

                val tokenRef = localDb.collection("admin_fcm_tokens").document(tokenDocId)
                val existingToken = runCatching {
                    withTimeoutOrNull(2_500L) { tokenRef.get().awaitResult() }
                }.getOrNull()
                val tokenPayload = hashMapOf<String, Any>(
                    "adminUid" to user.uid,
                    "adminEmail" to email,
                    "adminName" to displayName,
                    "token" to token,
                    "platform" to "android",
                    "deviceId" to deviceId,
                    "deviceName" to deviceName,
                    "appVersion" to appVersion,
                    "enabled" to true,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                if (existingToken == null || !existingToken.exists()) {
                    tokenPayload["createdAt"] = FieldValue.serverTimestamp()
                    tokenRef.set(tokenPayload).awaitResult()
                } else {
                    tokenRef.set(tokenPayload, SetOptions.merge()).awaitResult()
                }
            }.onFailure { err ->
                Log.w("NativeFirebase", "syncCurrentAdminFcmTokenIfSignedIn failed", err)
            }
        }
    }

    @JavascriptInterface
    fun consumePendingDeepLink(): String {
        return AdminNotificationHelper.consumePendingDeepLink(appContext)
    }

    fun emitPendingDeepLink() {
        val raw = AdminNotificationHelper.consumePendingDeepLink(appContext)
        if (raw != "null" && raw.isNotBlank()) {
            emitToJs("window.__onNativeAdminDeepLink", raw)
        }
    }

    @JavascriptInterface
    fun syncAdminProfileAndFcmToken(callId: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Admin Google login required.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!verifyAuthorizedAdminSuspended(user)) {
                    resolveCallError(callId, "ONLY_ADMIN_GOOGLE_EMAIL")
                    return@launch
                }
                val isSuper = isSuperAdminUser(user)
                val adminRef = localDb.collection("admins").document(user.uid)
                val existingSnap = runCatching {
                    withTimeoutOrNull(3_000L) { adminRef.get().awaitResult() }
                }.getOrNull()

                val defaultPrefs = mapOf(
                    "registrations" to true,
                    "logins" to true,
                    "payments" to true,
                    "codeRedemptions" to true,
                    "quizActivity" to true,
                    "dataUpdates" to true,
                    "adminChat" to true
                )

                val displayName = (user.displayName?.takeIf { it.isNotBlank() }
                    ?: user.email?.substringBefore('@')
                    ?: "Admin").take(80)
                val email = user.email.orEmpty().trim().lowercase().take(120)
                val photoUrl = user.photoUrl?.toString().orEmpty().take(500)

                val prefsMap: Map<String, Boolean> = if (existingSnap != null && existingSnap.exists()) {
                    val rawPrefs = existingSnap.get("notificationPrefs") as? Map<*, *>
                    defaultPrefs.mapValues { (k, defVal) ->
                        (rawPrefs?.get(k) as? Boolean) ?: defVal
                    }
                } else {
                    defaultPrefs
                }

                if (existingSnap == null || !existingSnap.exists()) {
                    adminRef.set(
                        mapOf(
                            "uid" to user.uid,
                            "email" to email,
                            "displayName" to displayName,
                            "photoUrl" to photoUrl,
                            "role" to if (isSuper) "super_admin" else "admin",
                            "isActive" to true,
                            "notificationPrefs" to prefsMap,
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp()
                        )
                    ).awaitResult()
                } else {
                    adminRef.update(
                        mapOf(
                            "email" to email,
                            "displayName" to displayName,
                            "photoUrl" to photoUrl,
                            "updatedAt" to FieldValue.serverTimestamp()
                        )
                    ).awaitResult()
                }

                val prefsJsonObj = JSONObject()
                prefsMap.forEach { (k, v) -> prefsJsonObj.put(k, v) }
                AdminNotificationHelper.saveAdminSessionState(
                    context = appContext,
                    isAdminActive = true,
                    adminUid = user.uid,
                    adminEmail = email,
                    adminName = displayName,
                    prefsJson = prefsJsonObj.toString()
                )
                AdminBackgroundNotificationWorker.ensurePeriodicScheduled(appContext)
                AdminBackgroundNotificationWorker.scheduleAdminFollowUpChain(appContext)

                var fcmTokenRegistered = false
                val token = runCatching {
                    withTimeoutOrNull(4_500L) {
                        FirebaseMessaging.getInstance().token.awaitResult()
                    }
                }.getOrNull().orEmpty()

                if (token.length >= 20) {
                    AdminNotificationHelper.saveFcmToken(appContext, token)
                    val deviceId = AdminNotificationHelper.getOrCreateDeviceId(appContext)
                    val tokenDocId = "${user.uid}_$deviceId"
                    val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android Device" }.take(120)
                    val appVersion = runCatching {
                        appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName.orEmpty().ifBlank { "1.0.0" }
                    }.getOrDefault("1.0.0").take(32)

                    val tokenRef = localDb.collection("admin_fcm_tokens").document(tokenDocId)
                    val existingToken = runCatching {
                        withTimeoutOrNull(2_500L) { tokenRef.get().awaitResult() }
                    }.getOrNull()
                    val tokenPayload = hashMapOf<String, Any>(
                        "adminUid" to user.uid,
                        "adminEmail" to email,
                        "adminName" to displayName,
                        "token" to token,
                        "platform" to "android",
                        "deviceId" to deviceId,
                        "deviceName" to deviceName,
                        "appVersion" to appVersion,
                        "enabled" to true,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                    if (existingToken == null || !existingToken.exists()) {
                        tokenPayload["createdAt"] = FieldValue.serverTimestamp()
                        tokenRef.set(tokenPayload).awaitResult()
                    } else {
                        tokenRef.set(tokenPayload, SetOptions.merge()).awaitResult()
                    }
                    fcmTokenRegistered = true
                }

                val res = JSONObject().apply {
                    put("uid", user.uid)
                    put("email", email)
                    put("displayName", displayName)
                    put("photoUrl", photoUrl)
                    put("role", if (isSuper) "super_admin" else "admin")
                    put("isActive", true)
                    put("notificationPrefs", prefsJsonObj)
                    put("fcmTokenRegistered", fcmTokenRegistered)
                }
                resolveCallSuccess(callId, res.toString())
            } catch (e: Exception) {
                Log.w("NativeFirebase", "syncAdminProfileAndFcmToken failed", e)
                resolveCallError(callId, e.localizedMessage ?: "Failed to sync Admin profile & FCM token")
            }
        }
    }

    @JavascriptInterface
    fun updateAdminNotificationPrefs(callId: String, prefsJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!verifyAuthorizedAdminSuspended(user)) {
                    resolveCallError(callId, "Admin authorization required.")
                    return@launch
                }
                val obj = JSONObject(prefsJson)
                val normalized = mapOf(
                    "registrations" to obj.optBoolean("registrations", true),
                    "logins" to obj.optBoolean("logins", true),
                    "payments" to obj.optBoolean("payments", true),
                    "codeRedemptions" to obj.optBoolean("codeRedemptions", true),
                    "quizActivity" to obj.optBoolean("quizActivity", true),
                    "dataUpdates" to obj.optBoolean("dataUpdates", true),
                    "adminChat" to obj.optBoolean("adminChat", true)
                )
                localDb.collection("admins").document(user.uid).update(
                    mapOf(
                        "notificationPrefs" to normalized,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).awaitResult()
                val cacheObj = JSONObject()
                normalized.forEach { (k, v) -> cacheObj.put(k, v) }
                AdminNotificationHelper.updateNotificationPrefsJson(appContext, cacheObj.toString())
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to save preferences")
            }
        }
    }

    @JavascriptInterface
    fun addAdminInvite(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!isSuperAdminUser(user)) {
                    resolveCallError(callId, "Only Super Admin can invite other Admins.")
                    return@launch
                }
                val obj = JSONObject(payloadJson)
                val email = obj.getString("email").trim().lowercase().take(120)
                val displayName = obj.optString("displayName", email.substringBefore('@')).trim().ifBlank { "Co-Admin" }.take(80)
                if (!Regex("^[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}$").matches(email)) {
                    resolveCallError(callId, "Invalid email address")
                    return@launch
                }
                localDb.collection("admin_invites").document(email).set(
                    mapOf(
                        "email" to email,
                        "displayName" to displayName,
                        "addedByUid" to user.uid,
                        "createdAt" to FieldValue.serverTimestamp()
                    )
                ).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to invite Admin")
            }
        }
    }

    @JavascriptInterface
    fun removeAdminInvite(callId: String, emailRaw: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!isSuperAdminUser(user)) {
                    resolveCallError(callId, "Only Super Admin can remove Admins.")
                    return@launch
                }
                val email = emailRaw.trim().lowercase()
                localDb.collection("admin_invites").document(email).delete().awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to remove Admin invite")
            }
        }
    }

    @JavascriptInterface
    fun logAdminNotificationEvent(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallSuccess(callId, "true")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val rawId = obj.optString("notifId", "").trim().replace(Regex("[^a-zA-Z0-9_-]"), "_").take(120)
                val notifId = rawId.ifBlank { "evt_${UUID.randomUUID().toString().replace("-", "").take(20)}" }
                val category = obj.optString("category", "data_update")
                val validCategory = if (category in listOf("registration", "login", "payment", "code_redeem", "quiz_activity", "data_update", "admin_chat")) category else "data_update"
                val targetRoute = obj.optString("targetRoute", "admin_notifications")
                val validRoute = if (targetRoute in listOf("admin_requests", "admin_codes", "admin_students", "admin_updates", "admin_notifications")) targetRoute else "admin_notifications"
                val ref = localDb.collection("admin_notifications").document(notifId)
                // Direct create write (non-admin students have allow create but NOT allow get on admin_notifications)
                ref.set(
                    mapOf(
                        "category" to validCategory,
                        "title" to obj.optString("title", "નવી સૂચના").ifBlank { "નવી સૂચના" }.take(120),
                        "body" to obj.optString("body", "").ifBlank { "એપ અપડેટ" }.take(400),
                        "actorName" to obj.optString("actorName", "").take(80),
                        "actorMobile" to obj.optString("actorMobile", "").take(15),
                        "actorId" to obj.optString("actorId", "").take(128),
                        "targetRoute" to validRoute,
                        "referenceId" to obj.optString("referenceId", "").take(128),
                        "isRead" to false,
                        "readBy" to emptyList<String>(),
                        "pushDispatched" to false,
                        "createdAt" to FieldValue.serverTimestamp(),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).awaitResult()
                resolveCallSuccess(callId, JSONObject.quote(notifId))
            } catch (_: Exception) {
                // Non-fatal if deterministic notification doc already exists or device is offline
                resolveCallSuccess(callId, "\"skipped\"")
            }
        }
    }

    @JavascriptInterface
    fun startAdminNotificationsAndChatListeners() {
        val localDb = db ?: return
        val user = auth?.currentUser ?: return
        activity.runOnUiThread {
            if (!isCurrentUserAdmin()) return@runOnUiThread
            stopAdminNotificationsAndChatListeners()
            initialAdminNotifsSnapshotDone = false
            initialAdminChatsSnapshotDone = false

            adminDirectoryReg = localDb.collection("admins")
                .addSnapshotListener { snap, error ->
                    if (error != null) return@addSnapshotListener
                    val arr = JSONArray()
                    snap?.documents?.forEach { arr.put(serializeAdminUser(it)) }
                    emitToJs("window.__onNativeAdminDirectory", arr.toString())
                }

            if (isSuperAdminUser(user)) {
                adminInvitesReg = localDb.collection("admin_invites")
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .addSnapshotListener { snap, error ->
                        if (error != null) return@addSnapshotListener
                        val arr = JSONArray()
                        snap?.documents?.forEach { doc ->
                            arr.put(
                                JSONObject().apply {
                                    put("email", doc.getString("email") ?: doc.id)
                                    put("displayName", doc.getString("displayName").orEmpty())
                                    put("addedByUid", doc.getString("addedByUid").orEmpty())
                                    put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
                                }
                            )
                        }
                        emitToJs("window.__onNativeAdminInvites", arr.toString())
                    }
            }

            adminNotificationsReg = localDb.collection("admin_notifications")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(80)
                .addSnapshotListener { snap, error ->
                    if (error != null || snap == null) return@addSnapshotListener
                    val arr = JSONArray()
                    snap.documents.forEach { arr.put(serializeAdminNotification(it)) }
                    val jsonStr = arr.toString()
                    saveAdminListBackup("admin_notifications", jsonStr)
                    emitToJs("window.__onNativeAdminNotifications", jsonStr)

                    if (initialAdminNotifsSnapshotDone && !snap.metadata.isFromCache) {
                        snap.documentChanges.forEach { change ->
                            if (change.type == com.google.firebase.firestore.DocumentChange.Type.ADDED) {
                                val doc = change.document
                                val createdMs = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L
                                if (createdMs > 0L) {
                                    AdminBackgroundNotificationWorker.advanceAdminNotifWatermark(appContext, createdMs)
                                }
                                val isRead = doc.getBoolean("isRead") == true
                                if (!isRead) {
                                    AdminNotificationHelper.showAdminActivityNotification(
                                        context = appContext,
                                        notifId = doc.id,
                                        category = doc.getString("category").orEmpty(),
                                        title = doc.getString("title").orEmpty(),
                                        body = doc.getString("body").orEmpty(),
                                        targetRoute = doc.getString("targetRoute").orEmpty(),
                                        referenceId = doc.getString("referenceId").orEmpty(),
                                        actorName = doc.getString("actorName").orEmpty(),
                                        actorMobile = doc.getString("actorMobile").orEmpty()
                                    )
                                }
                            }
                        }
                    }
                    if (!snap.metadata.isFromCache) {
                        initialAdminNotifsSnapshotDone = true
                    }
                }

            adminChatsReg = localDb.collection("admin_chats")
                .whereArrayContains("participants", user.uid)
                .orderBy("lastMessageAt", Query.Direction.DESCENDING)
                .limit(40)
                .addSnapshotListener { snap, error ->
                    if (error != null || snap == null) return@addSnapshotListener
                    val arr = JSONArray()
                    snap.documents.forEach { doc ->
                        arr.put(serializeAdminChat(doc))
                        val chatId = doc.id
                        val lastSender = doc.getString("lastMessageSenderUid").orEmpty()
                        val lastStatus = doc.getString("lastMessageStatus").orEmpty()
                        val lastAtMs = doc.getTimestamp("lastMessageAt")?.toDate()?.time ?: 0L
                        if (lastAtMs > 0L) {
                            AdminBackgroundNotificationWorker.advanceAdminChatWatermark(appContext, lastAtMs)
                        }
                        val sig = "${lastSender}_$lastAtMs"
                        val prevSig = lastSeenChatMsgIds[chatId]
                        if (initialAdminChatsSnapshotDone && prevSig != sig && lastSender.isNotBlank() && lastSender != user.uid) {
                            val lastText = doc.getString("lastMessageText").orEmpty()
                            val senderName = doc.getString("lastMessageSenderName").orEmpty().ifBlank { "Admin" }
                            val rawMeta = doc.get("participantMeta") as? Map<*, *>
                            val senderMeta = rawMeta?.get(lastSender) as? Map<*, *>
                            val senderPhoto = senderMeta?.get("photoUrl")?.toString().orEmpty()
                            AdminNotificationHelper.showAdminChatNotification(
                                context = appContext,
                                chatId = chatId,
                                messageId = "${chatId}_$lastAtMs",
                                senderUid = lastSender,
                                senderName = senderName,
                                senderPhotoUrl = senderPhoto,
                                text = lastText,
                                timestampMs = lastAtMs
                            )
                            if (lastStatus == "sent") {
                                markIncomingChatDeliveredInternal(localDb, chatId, user.uid)
                            }
                        }
                        lastSeenChatMsgIds[chatId] = sig
                    }
                    emitToJs("window.__onNativeAdminChats", arr.toString())
                    if (!snap.metadata.isFromCache) {
                        initialAdminChatsSnapshotDone = true
                    }
                }
        }
    }

    private fun markIncomingChatDeliveredInternal(localDb: FirebaseFirestore, chatId: String, myUid: String) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val pending = localDb.collection("admin_chats").document(chatId)
                    .collection("messages")
                    .whereArrayContains("participantUids", myUid)
                    .whereEqualTo("recipientUid", myUid)
                    .whereEqualTo("status", "sent")
                    .limit(20)
                    .get()
                    .awaitResult()
                if (pending.isEmpty) return@runCatching
                val batch = localDb.batch()
                val now = FieldValue.serverTimestamp()
                pending.documents.forEach { doc ->
                    batch.update(
                        doc.reference,
                        mapOf("status" to "delivered", "deliveredAt" to now, "updatedAt" to now)
                    )
                }
                batch.update(
                    localDb.collection("admin_chats").document(chatId),
                    mapOf("lastMessageStatus" to "delivered", "updatedAt" to now)
                )
                batch.commit().awaitResult()
            }
        }
    }

    @JavascriptInterface
    fun stopAdminNotificationsAndChatListeners() {
        activity.runOnUiThread {
            adminDirectoryReg?.remove()
            adminDirectoryReg = null
            adminInvitesReg?.remove()
            adminInvitesReg = null
            adminNotificationsReg?.remove()
            adminNotificationsReg = null
            adminChatsReg?.remove()
            adminChatsReg = null
        }
    }

    @JavascriptInterface
    fun markAdminNotificationRead(callId: String, notifId: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val ref = localDb.collection("admin_notifications").document(notifId.trim())
                ref.update(
                    mapOf(
                        "isRead" to true,
                        "readBy" to FieldValue.arrayUnion(user.uid),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to mark read")
            }
        }
    }

    @JavascriptInterface
    fun markAllAdminNotificationsRead(callId: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val unreadSnap = localDb.collection("admin_notifications")
                    .whereEqualTo("isRead", false)
                    .limit(100)
                    .get()
                    .awaitResult()
                if (!unreadSnap.isEmpty) {
                    val batch = localDb.batch()
                    val now = FieldValue.serverTimestamp()
                    unreadSnap.documents.forEach { doc ->
                        batch.update(
                            doc.reference,
                            mapOf(
                                "isRead" to true,
                                "readBy" to FieldValue.arrayUnion(user.uid),
                                "updatedAt" to now
                            )
                        )
                    }
                    batch.commit().awaitResult()
                }
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to mark all read")
            }
        }
    }

    @JavascriptInterface
    fun deleteAdminNotification(callId: String, notifId: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!isCurrentUserAdmin()) {
                    resolveCallError(callId, "Admin authorization required.")
                    return@launch
                }
                localDb.collection("admin_notifications").document(notifId.trim()).delete().awaitResult()
                resolveCallSuccess(callId, "true")
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to delete notification")
            }
        }
    }

    @JavascriptInterface
    fun startAdminChatThreadListener(chatId: String) {
        val localDb = db ?: return
        val user = auth?.currentUser ?: return
        val cleanChatId = chatId.trim()
        activity.runOnUiThread {
            if (cleanChatId.isBlank()) {
                stopAdminChatThreadListener()
                emitToJs("window.__onNativeAdminChatMessages", "[]")
                return@runOnUiThread
            }
            if (activeChatThreadId == cleanChatId && activeChatMessagesReg != null) {
                return@runOnUiThread
            }
            stopAdminChatThreadListener()
            activeChatThreadId = cleanChatId
            activeChatMessagesReg = localDb.collection("admin_chats").document(cleanChatId)
                .collection("messages")
                .whereArrayContains("participantUids", user.uid)
                .orderBy("createdAt", Query.Direction.ASCENDING)
                .limit(120)
                .addSnapshotListener { snap, error ->
                    if (error != null || snap == null) return@addSnapshotListener
                    val arr = JSONArray()
                    snap.documents.forEach { arr.put(serializeAdminChatMessage(it)) }
                    emitToJs("window.__onNativeAdminChatMessages", arr.toString())
                }
        }
    }

    @JavascriptInterface
    fun stopAdminChatThreadListener() {
        activity.runOnUiThread {
            activeChatMessagesReg?.remove()
            activeChatMessagesReg = null
            activeChatThreadId = ""
        }
    }

    @JavascriptInterface
    fun sendAdminChatMessage(callId: String, payloadJson: String) {
        val localDb = db ?: run {
            resolveCallError(callId, "Native Firebase is not initialized.")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallError(callId, "Authentication session not ready.")
            return
        }
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!verifyAuthorizedAdminSuspended(user)) {
                    resolveCallError(callId, "Admin authorization required.")
                    return@launch
                }
                val obj = JSONObject(payloadJson)
                val recipientUid = obj.getString("recipientUid").trim()
                val recipientName = obj.optString("recipientName", "Admin").trim().take(80)
                val recipientPhoto = obj.optString("recipientPhotoUrl", "").trim().take(500)
                val text = obj.getString("text").trim().take(2000)
                if (recipientUid.isBlank() || recipientUid == user.uid || text.isBlank()) {
                    resolveCallError(callId, "Invalid recipient or empty message")
                    return@launch
                }
                val participants = listOf(user.uid, recipientUid).sorted()
                val chatId = participants.joinToString("__").replace(Regex("[^a-zA-Z0-9_-]"), "_")
                val myName = (user.displayName?.takeIf { it.isNotBlank() } ?: user.email?.substringBefore('@') ?: "Admin").take(80)
                val myPhoto = user.photoUrl?.toString().orEmpty().take(500)
                val chatRef = localDb.collection("admin_chats").document(chatId)
                val msgId = "msg_${System.currentTimeMillis()}_${UUID.randomUUID().toString().replace("-", "").take(8)}"
                val msgRef = chatRef.collection("messages").document(msgId)

                val existingChat = runCatching {
                    withTimeoutOrNull(2_500L) { chatRef.get().awaitResult() }
                }.getOrNull()
                val existingUnreadMap = (existingChat?.get("unreadCounts") as? Map<*, *>)
                val recipientUnread = ((existingUnreadMap?.get(recipientUid) as? Number)?.toLong() ?: 0L) + 1L

                val now = FieldValue.serverTimestamp()
                val participantMeta = mapOf(
                    user.uid to mapOf("displayName" to myName, "photoUrl" to myPhoto),
                    recipientUid to mapOf("displayName" to recipientName, "photoUrl" to recipientPhoto)
                )
                val chatPayload = hashMapOf<String, Any>(
                    "participants" to participants,
                    "participantMeta" to participantMeta,
                    "lastMessageText" to text.take(500),
                    "lastMessageSenderUid" to user.uid,
                    "lastMessageSenderName" to myName,
                    "lastMessageStatus" to "sent",
                    "lastMessageAt" to now,
                    "unreadCounts" to mapOf(user.uid to 0L, recipientUid to recipientUnread),
                    "updatedAt" to now
                )
                if (existingChat == null || !existingChat.exists()) {
                    chatPayload["createdAt"] = now
                    chatRef.set(chatPayload).awaitResult()
                } else {
                    chatRef.update(chatPayload).awaitResult()
                }

                msgRef.set(
                    mapOf(
                        "chatId" to chatId,
                        "senderUid" to user.uid,
                        "senderName" to myName,
                        "senderPhotoUrl" to myPhoto,
                        "recipientUid" to recipientUid,
                        "participantUids" to participants,
                        "text" to text,
                        "status" to "sent",
                        "createdAt" to now,
                        "updatedAt" to now
                    )
                ).awaitResult()

                val res = JSONObject().apply {
                    put("chatId", chatId)
                    put("messageId", msgId)
                }
                resolveCallSuccess(callId, res.toString())
            } catch (e: Exception) {
                resolveCallError(callId, e.localizedMessage ?: "Failed to send message")
            }
        }
    }

    @JavascriptInterface
    fun markChatMessagesRead(callId: String, chatIdRaw: String) {
        val localDb = db ?: run {
            resolveCallSuccess(callId, "true")
            return
        }
        val user = auth?.currentUser ?: run {
            resolveCallSuccess(callId, "true")
            return
        }
        val chatId = chatIdRaw.trim()
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val chatRef = localDb.collection("admin_chats").document(chatId)
                val msgsSnap = chatRef.collection("messages")
                    .whereArrayContains("participantUids", user.uid)
                    .whereEqualTo("recipientUid", user.uid)
                    .limit(100)
                    .get()
                    .awaitResult()

                val batch = localDb.batch()
                val now = FieldValue.serverTimestamp()
                var hasChanges = false
                msgsSnap.documents.forEach { doc ->
                    val status = doc.getString("status").orEmpty()
                    if (status != "read") {
                        hasChanges = true
                        val updates = hashMapOf<String, Any>(
                            "status" to "read",
                            "readAt" to now,
                            "updatedAt" to now
                        )
                        if (doc.get("deliveredAt") == null) {
                            updates["deliveredAt"] = now
                        }
                        batch.update(doc.reference, updates)
                    }
                }

                val chatSnap = runCatching { chatRef.get().awaitResult() }.getOrNull()
                if (chatSnap != null && chatSnap.exists()) {
                    val unreadMap = (chatSnap.get("unreadCounts") as? Map<*, *>)
                    val nextUnread = hashMapOf<String, Long>()
                    unreadMap?.forEach { (k, v) ->
                        k?.toString()?.let { uid ->
                            nextUnread[uid] = (v as? Number)?.toLong() ?: 0L
                        }
                    }
                    val hadUnread = (nextUnread[user.uid] ?: 0L) > 0L
                    nextUnread[user.uid] = 0L
                    val lastSender = chatSnap.getString("lastMessageSenderUid").orEmpty()
                    val chatUpdates = hashMapOf<String, Any>(
                        "unreadCounts" to nextUnread,
                        "updatedAt" to now
                    )
                    if (lastSender != user.uid && chatSnap.getString("lastMessageStatus") != "read") {
                        chatUpdates["lastMessageStatus"] = "read"
                        hasChanges = true
                    }
                    if (hadUnread || hasChanges) {
                        batch.update(chatRef, chatUpdates)
                        hasChanges = true
                    }
                }
                if (hasChanges) {
                    batch.commit().awaitResult()
                }
                resolveCallSuccess(callId, "true")
            } catch (_: Exception) {
                resolveCallSuccess(callId, "false")
            }
        }
    }

    private fun serializeAdminUser(doc: DocumentSnapshot): JSONObject {
        val rawPrefs = doc.get("notificationPrefs") as? Map<*, *>
        val prefsObj = JSONObject().apply {
            put("registrations", (rawPrefs?.get("registrations") as? Boolean) ?: true)
            put("logins", (rawPrefs?.get("logins") as? Boolean) ?: true)
            put("payments", (rawPrefs?.get("payments") as? Boolean) ?: true)
            put("codeRedemptions", (rawPrefs?.get("codeRedemptions") as? Boolean) ?: true)
            put("quizActivity", (rawPrefs?.get("quizActivity") as? Boolean) ?: true)
            put("dataUpdates", (rawPrefs?.get("dataUpdates") as? Boolean) ?: true)
            put("adminChat", (rawPrefs?.get("adminChat") as? Boolean) ?: true)
        }
        return JSONObject().apply {
            put("uid", doc.getString("uid") ?: doc.id)
            put("email", doc.getString("email").orEmpty())
            put("displayName", doc.getString("displayName").orEmpty())
            put("photoUrl", doc.getString("photoUrl").orEmpty())
            put("role", doc.getString("role") ?: "admin")
            put("isActive", doc.getBoolean("isActive") != false)
            put("notificationPrefs", prefsObj)
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeAdminNotification(doc: DocumentSnapshot): JSONObject {
        val readByArr = JSONArray().apply {
            (doc.get("readBy") as? List<*>)?.forEach { item ->
                item?.toString()?.let { put(it) }
            }
        }
        return JSONObject().apply {
            put("id", doc.id)
            put("category", doc.getString("category") ?: "data_update")
            put("title", doc.getString("title").orEmpty())
            put("body", doc.getString("body").orEmpty())
            put("actorName", doc.getString("actorName").orEmpty())
            put("actorMobile", doc.getString("actorMobile").orEmpty())
            put("actorId", doc.getString("actorId").orEmpty())
            put("targetRoute", doc.getString("targetRoute") ?: "admin_notifications")
            put("referenceId", doc.getString("referenceId").orEmpty())
            put("isRead", doc.getBoolean("isRead") == true)
            put("readBy", readByArr)
            put("pushDispatched", doc.getBoolean("pushDispatched") == true)
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeAdminChat(doc: DocumentSnapshot): JSONObject {
        val participantsArr = JSONArray().apply {
            (doc.get("participants") as? List<*>)?.forEach { item ->
                item?.toString()?.let { put(it) }
            }
        }
        val unreadObj = JSONObject()
        (doc.get("unreadCounts") as? Map<*, *>)?.forEach { (k, v) ->
            k?.toString()?.let { unreadObj.put(it, (v as? Number)?.toInt() ?: 0) }
        }
        val metaObj = JSONObject()
        (doc.get("participantMeta") as? Map<*, *>)?.forEach { (k, v) ->
            val key = k?.toString() ?: return@forEach
            val valMap = v as? Map<*, *> ?: return@forEach
            metaObj.put(
                key,
                JSONObject().apply {
                    put("displayName", valMap["displayName"]?.toString().orEmpty())
                    put("photoUrl", valMap["photoUrl"]?.toString().orEmpty())
                }
            )
        }
        return JSONObject().apply {
            put("id", doc.id)
            put("participants", participantsArr)
            put("participantMeta", metaObj)
            put("lastMessageText", doc.getString("lastMessageText").orEmpty())
            put("lastMessageSenderUid", doc.getString("lastMessageSenderUid").orEmpty())
            put("lastMessageSenderName", doc.getString("lastMessageSenderName").orEmpty())
            put("lastMessageStatus", doc.getString("lastMessageStatus") ?: "sent")
            put("lastMessageAt", serializeTimestamp(doc.getTimestamp("lastMessageAt")))
            put("unreadCounts", unreadObj)
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeAdminChatMessage(doc: DocumentSnapshot): JSONObject {
        val partArr = JSONArray().apply {
            (doc.get("participantUids") as? List<*>)?.forEach { item ->
                item?.toString()?.let { put(it) }
            }
        }
        return JSONObject().apply {
            put("id", doc.id)
            put("chatId", doc.getString("chatId").orEmpty())
            put("senderUid", doc.getString("senderUid").orEmpty())
            put("senderName", doc.getString("senderName").orEmpty())
            put("senderPhotoUrl", doc.getString("senderPhotoUrl").orEmpty())
            put("recipientUid", doc.getString("recipientUid").orEmpty())
            put("participantUids", partArr)
            put("text", doc.getString("text").orEmpty())
            put("status", doc.getString("status") ?: "sent")
            put("deliveredAt", serializeTimestamp(doc.getTimestamp("deliveredAt")))
            put("readAt", serializeTimestamp(doc.getTimestamp("readAt")))
            put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
            put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
        }
    }

    private fun serializeReleaseConfig(doc: DocumentSnapshot): JSONObject = JSONObject().apply {
        put("id", doc.id)
        put("githubOwnerRepo", doc.getString("githubOwnerRepo").orEmpty())
        put("releaseNotes", doc.getString("releaseNotes").orEmpty())
        put("latestVersionName", doc.getString("latestVersionName").orEmpty())
        put("latestVersionCode", (doc.getLong("latestVersionCode") ?: 0L).toInt())
        put("updateTitle", doc.getString("updateTitle").orEmpty())
        put("apkDownloadUrl", doc.getString("apkDownloadUrl").orEmpty())
        put("apkStoragePath", doc.getString("apkStoragePath").orEmpty())
        put("apkFileName", doc.getString("apkFileName").orEmpty())
        put("apkSizeBytes", doc.getLong("apkSizeBytes") ?: 0L)
        put("apkSha256", doc.getString("apkSha256").orEmpty())
        put("signingCertSha256", doc.getString("signingCertSha256").orEmpty())
        put("packageName", doc.getString("packageName").orEmpty())
        put("isMandatory", doc.getBoolean("isMandatory") == true)
        put("publishedByUid", doc.getString("publishedByUid").orEmpty())
        put("publishedAt", serializeTimestamp(doc.getTimestamp("publishedAt")))
        put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
    }

    private fun serializeUpdateNotification(doc: DocumentSnapshot): JSONObject = JSONObject().apply {
        put("id", doc.id)
        put("releaseId", doc.getString("releaseId") ?: doc.id)
        put("appName", doc.getString("appName").orEmpty())
        put("versionName", doc.getString("versionName").orEmpty())
        put("versionCode", (doc.getLong("versionCode") ?: 0L).toInt())
        put("title", doc.getString("title").orEmpty())
        put("body", doc.getString("body").orEmpty())
        put("isMandatory", doc.getBoolean("isMandatory") == true)
        put("apkDownloadUrl", doc.getString("apkDownloadUrl").orEmpty())
        put("targetRoute", doc.getString("targetRoute") ?: "app_update")
        put("pushDispatched", doc.getBoolean("pushDispatched") == true)
        put("recipientCount", (doc.getLong("recipientCount") ?: 0L).toInt())
        put("createdAt", serializeTimestamp(doc.getTimestamp("createdAt")))
        put("updatedAt", serializeTimestamp(doc.getTimestamp("updatedAt")))
    }

    private fun getSubjectCodePrefix(subjectId: String): String =
        when (subjectId.trim().lowercase()) {
            "maths" -> "MAT"
            "science" -> "SCI"
            "social_science" -> "SOC"
            "gujarati" -> "GUJ"
            "hindi" -> "HIN"
            else -> "ALL"
        }

    private fun generate8CharCode(subjectId: String = "all"): String = buildString(8) {
        append(getSubjectCodePrefix(subjectId))
        repeat(5) {
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
            put("photoUrl", user.photoUrl?.toString() ?: "")
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
        val freeMockArr = JSONArray().apply {
            (doc.get("freeMockUsedSubjects") as? List<*>)?.forEach { item ->
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
            put("freeMockUsedSubjects", freeMockArr)
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

    private fun emitAllCodesChunked(docs: List<DocumentSnapshot>, streamSeq: Long) {
        if (!isAttached || streamSeq != codeSnapshotSeq.get()) return
        val chunkSize = 500
        if (docs.size <= chunkSize) {
            val arr = JSONArray()
            docs.forEach { arr.put(serializeAccessCode(it)) }
            if (streamSeq != codeSnapshotSeq.get()) return
            val jsonStr = arr.toString()
            saveAdminListBackup("all_codes", jsonStr)
            emitToJs("window.__onNativeAllCodes", jsonStr)
            return
        }

        // Save a safe bounded SharedPreferences cold-fallback snapshot (Firestore persistent disk cache holds ALL docs)
        val backupArr = JSONArray()
        docs.take(chunkSize).forEach { backupArr.put(serializeAccessCode(it)) }
        saveAdminListBackup("all_codes", backupArr.toString())

        if (streamSeq != codeSnapshotSeq.get()) return
        emitToJs("window.__onNativeAllCodesChunkStart", "$streamSeq, ${docs.size}")
        for (start in docs.indices step chunkSize) {
            if (!isAttached || streamSeq != codeSnapshotSeq.get()) return
            val end = minOf(start + chunkSize, docs.size)
            val chunkArr = JSONArray()
            for (i in start until end) {
                chunkArr.put(serializeAccessCode(docs[i]))
            }
            emitToJs("window.__onNativeAllCodesChunk", "$streamSeq, ${chunkArr.toString()}")
        }
        if (!isAttached || streamSeq != codeSnapshotSeq.get()) return
        emitToJs("window.__onNativeAllCodesChunkEnd", "$streamSeq")
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
