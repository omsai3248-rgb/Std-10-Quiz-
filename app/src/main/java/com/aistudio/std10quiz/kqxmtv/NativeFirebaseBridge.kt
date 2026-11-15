package com.aistudio.std10quiz.kqxmtv

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.tasks.Task
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val ADMIN_OWNER_EMAIL = "omsai3248@gmail.com"
private const val ADMIN_PHONE_E164 = "+919099592283"
private const val CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

class NativeFirebaseBridge(
    private val activity: ComponentActivity,
    private val webView: WebView
) {
    private val appContext = activity.applicationContext
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(
        getOptionalStringResource("firestore_database_id").ifBlank { "(default)" }
    )
    private val auth: FirebaseAuth = Firebase.auth
    private val credentialManager: CredentialManager = CredentialManager.create(activity)
    private val secureRandom = SecureRandom()

    private fun getOptionalStringResource(name: String): String {
        val resId = appContext.resources.getIdentifier(name, "string", appContext.packageName)
        return if (resId != 0) runCatching { appContext.getString(resId) }.getOrDefault("") else ""
    }

    private val publicListeners = mutableListOf<ListenerRegistration>()
    private val myPaymentListeners = mutableListOf<ListenerRegistration>()
    private val adminListeners = mutableListOf<ListenerRegistration>()
    @Volatile
    private var lastPaymentIdsJson: String = "[]"

    private val authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        emitAuthState(firebaseAuth.currentUser)
        refreshPaymentListenersInternal()
    }

    fun attach() {
        auth.addAuthStateListener(authStateListener)
        emitAuthState(auth.currentUser)
        attemptAutoSignIn()
    }

    fun detach() {
        auth.removeAuthStateListener(authStateListener)
        stopPublicListeners()
        stopAdminListeners()
    }

    private fun attemptAutoSignIn() {
        if (auth.currentUser != null) return
        val clientId = getOptionalStringResource("default_web_client_id")
        if (clientId.isBlank()) return
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(true)
            .setServerClientId(clientId)
            .setAutoSelectEnabled(true)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(googleIdOption).build()

        activity.lifecycleScope.launch {
            try {
                val result = credentialManager.getCredential(activity, request)
                val credential = result.credential
                if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                    val firebaseCred = GoogleAuthProvider.getCredential(idToken, null)
                    auth.signInWithCredential(firebaseCred).awaitResult()
                }
            } catch (_: Exception) {
                // Silent auto-sign-in is optional; interactive sign-in remains available
            }
        }
    }

    @JavascriptInterface
    fun hasNativeFirebase(): Boolean = true

    @JavascriptInterface
    fun getFirebaseConfigSummary(): String {
        val projectId = getOptionalStringResource("project_id")
        val dbId = getOptionalStringResource("firestore_database_id")
        return JSONObject().apply {
            put("projectId", projectId)
            put("databaseId", dbId)
        }.toString()
    }

    @JavascriptInterface
    fun getCurrentAuthUser(): String = serializeUser(auth.currentUser)?.toString() ?: "null"

    @JavascriptInterface
    fun requestGoogleSignIn(callId: String) {
        val clientId = getOptionalStringResource("default_web_client_id")
        if (clientId.isBlank()) {
            resolveCallError(callId, "Google Sign-In configuration missing: default_web_client_id not found")
            return
        }

        val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = clientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(signInOption).build()

        activity.lifecycleScope.launch {
            try {
                val result = credentialManager.getCredential(activity, request)
                val credential = result.credential
                if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                    val authCred = GoogleAuthProvider.getCredential(googleCred.idToken, null)
                    val authResult = auth.signInWithCredential(authCred).awaitResult()
                    val signedEmail = authResult.user?.email?.trim()?.lowercase().orEmpty()
                    if (signedEmail != ADMIN_OWNER_EMAIL) {
                        withContext(NonCancellable) {
                            runCatching { credentialManager.clearCredentialState(ClearCredentialStateRequest()) }
                            auth.signOut()
                        }
                        resolveCallError(callId, "ONLY_ADMIN_GOOGLE_EMAIL")
                        return@launch
                    }
                    resolveCallSuccess(callId, serializeUser(authResult.user)?.toString() ?: "{}")
                } else {
                    resolveCallError(callId, "Unexpected credential type")
                }
            } catch (e: GetCredentialCancellationException) {
                Log.w("Auth", "Google Sign-In flow cancelled or dismissed: ${e.message}", e)
                resolveCallError(callId, "SIGN_IN_CANCELLED")
            } catch (e: Exception) {
                Log.e("Auth", "Google Sign-In failed", e)
                resolveCallError(callId, e.localizedMessage ?: "Sign in failed")
            }
        }
    }

    @JavascriptInterface
    fun signOutGoogle(callId: String) {
        activity.lifecycleScope.launch {
            withContext(NonCancellable) {
                try {
                    credentialManager.clearCredentialState(ClearCredentialStateRequest())
                } catch (e: Exception) {
                    Log.w("Auth", "Failed to clear credential state: ${e.message}")
                } finally {
                    auth.signOut()
                }
            }
            resolveCallSuccess(callId, "true")
        }
    }

    @JavascriptInterface
    fun submitPaymentRequest(callId: String, payloadJson: String) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            try {
                val obj = JSONObject(payloadJson)
                val uid = obj.getString("uid")
                val requestId = obj.getString("requestId")
                val studentName = obj.getString("studentName")
                val mobileNumber = obj.getString("mobileNumber")
                val amountRupees = obj.getInt("amountRupees")
                val upiId = obj.getString("upiId")
                val upiTransactionRef = obj.getString("upiTransactionRef")
                val utrNormalized = obj.getString("utrNormalized")
                val screenshotBase64 = obj.getString("screenshotBase64")
                val subjectId = obj.optString("subjectId", "all")

                val utrRef = db.collection("utr_locks").document(utrNormalized)
                val reqRef = db.collection("payment_requests").document(requestId)

                val preCheck = utrRef.get().awaitResult()
                if (preCheck.exists()) {
                    resolveCallError(callId, "DUPLICATE_UTR")
                    return@launch
                }

                db.runTransaction { tx ->
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
        activity.lifecycleScope.launch(Dispatchers.IO) {
            val obj = JSONObject(payloadJson)
            val cleanCode = obj.getString("cleanCode")
            val uid = obj.getString("uid")
            val cleanName = obj.getString("cleanName")
            val cleanMobile = obj.getString("cleanMobile")
            val deviceInfo = obj.optString("deviceInfo", "Android App")
            val expectedSubjectId = obj.optString("expectedSubjectId", "")
            val codeRef = db.collection("access_codes").document(cleanCode)

            try {
                val resObj = db.runTransaction { tx ->
                    val snap = tx.get(codeRef)
                    if (!snap.exists()) throw IllegalStateException("CODE_NOT_FOUND")
                    val status = snap.getString("status").orEmpty()
                    val isUsed = snap.getBoolean("isUsed") == true
                    if (status == "used" || isUsed) throw IllegalStateException("CODE_ALREADY_USED")

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

                    val usedBy = mapOf(
                        "uid" to uid,
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
                            "usedByUserId" to uid,
                            "usedByMobile" to cleanMobile,
                            "usedByName" to cleanName,
                            "updatedAt" to FieldValue.serverTimestamp(),
                        )
                    )

                    JSONObject().apply {
                        put("code", cleanCode)
                        put("subjectId", codeSub)
                        put("amountRupees", (snap.getLong("amountRupees") ?: 0L).toInt())
                    }
                }.awaitResult()

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
        activity.runOnUiThread {
            stopPublicListeners()

            val releaseReg = db.collection("app_config").document("release")
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
            publicListeners.add(releaseReg)

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
        val idsSnapshot = lastPaymentIdsJson
        activity.runOnUiThread {
            myPaymentListeners.forEach { it.remove() }
            myPaymentListeners.clear()

            val uid = auth.currentUser?.uid
            if (uid != null) {
                val myPayReg = db.collection("payment_requests")
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

            val ids = mutableListOf<String>()
            runCatching {
                val arr = JSONArray(idsSnapshot)
                for (i in 0 until arr.length()) {
                    val id = arr.optString(i)
                    if (Regex("^pay_[a-f0-9]{32}$").matches(id)) ids.add(id)
                }
            }
            if (ids.isEmpty()) {
                emitToJs("window.__onNativeMyPayments", "[]")
                return@runOnUiThread
            }

            val byId = linkedMapOf<String, JSONObject>()
            ids.distinct().take(25).forEach { payId ->
                val reg = db.collection("payment_requests").document(payId)
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
        activity.runOnUiThread {
            stopAdminListeners()
            if (!isCurrentUserAdmin()) return@runOnUiThread

            val payReg = db.collection("payment_requests")
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

            val codeReg = db.collection("access_codes")
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
        }
    }

    @JavascriptInterface
    fun stopAdminListeners() {
        activity.runOnUiThread {
            adminListeners.forEach { it.remove() }
            adminListeners.clear()
        }
    }

    @JavascriptInterface
    fun approvePayment(callId: String, payloadJson: String) {
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
            val reqRef = db.collection("payment_requests").document(requestId)

            try {
                val chosenCode = db.runTransaction { tx ->
                    val reqSnap = tx.get(reqRef)
                    if (!reqSnap.exists()) throw IllegalStateException("Payment request not found")
                    if (reqSnap.getString("status") != "pending") throw IllegalStateException("ALREADY_PROCESSED")

                    var uniqueCode = ""
                    for (attempt in 0 until 10) {
                        val candidate = generate8CharCode()
                        val candSnap = tx.get(db.collection("access_codes").document(candidate))
                        if (!candSnap.exists()) {
                            uniqueCode = candidate
                            break
                        }
                    }
                    if (uniqueCode.isEmpty()) throw IllegalStateException("Failed to generate unique code")

                    val amount = (reqSnap.getLong("amountRupees") ?: 24L).toInt()
                    val codeRef = db.collection("access_codes").document(uniqueCode)
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
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val requestId = obj.getString("requestId")
            val adminNote = obj.getString("adminNote")
            val reqRef = db.collection("payment_requests").document(requestId)
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
                    val batch = db.batch()
                    chunk.forEach { code ->
                        val ref = db.collection("access_codes").document(code)
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
        activity.lifecycleScope.launch(Dispatchers.IO) {
            if (!isCurrentUserAdmin()) {
                resolveCallError(callId, "Authentication session not ready.")
                return@launch
            }
            val obj = JSONObject(payloadJson)
            val repo = obj.getString("githubOwnerRepo").take(120)
            val notes = obj.getString("releaseNotes").take(300)
            val ref = db.collection("app_config").document("release")
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

    private fun isCurrentUserAdmin(): Boolean {
        val user = auth.currentUser ?: return false
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
        activity.runOnUiThread {
            webView.evaluateJavascript("if (typeof $fnPath === 'function') { $fnPath($argsExpr); }", null)
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
