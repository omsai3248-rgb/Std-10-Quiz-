package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Task
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.Timestamp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.Source
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Date
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * 100% FREE Firebase Spark-Plan compatible background notification sync worker.
 *
 * Uses Android Jetpack WorkManager (zero Blaze plan, zero Cloud Functions required,
 * zero extra dangerous permissions, Play Protect compliant) to check Firestore for:
 *  1) Unread Admin Activity Alerts (new user logins, registrations, payments, codes)
 *  2) Unread Admin Personal Chat messages
 *  3) Public Push Broadcasts & App Update Releases
 * even when the app is completely CLOSED (swiped away) or after device reboot.
 */
class AdminBackgroundNotificationWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        if (!AdminNotificationHelper.hasNotificationPermission(applicationContext)) {
            return Result.success()
        }

        val db = getNamedFirestore(applicationContext) ?: return Result.success()
        initializeWatermarksIfNeeded(applicationContext)

        // 1. Admin Activity & Chat Alerts (only when Admin Google session is active)
        val user = runCatching { Firebase.auth.currentUser }.getOrNull()
        if (user != null && AdminNotificationHelper.isAdminSessionActive(applicationContext)) {
            pollAdminNotifications(db, user.uid)
            pollAdminChats(db, user.uid)
        }

        // 2. Public Push Broadcasts & App Update alerts for all opted-in devices
        pollPublicBroadcasts(db)
        pollAppUpdateNotifications(db)

        return Result.success()
    }

    private suspend fun pollAdminNotifications(db: FirebaseFirestore, currentUid: String) {
        runCatching {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastMs = prefs.getLong(KEY_LAST_ADMIN_NOTIF_MS, System.currentTimeMillis())
            val snap = withTimeoutOrNull(10_000L) {
                db.collection("admin_notifications")
                    .whereGreaterThan("createdAt", Timestamp(Date(lastMs)))
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .limit(10)
                    .get(Source.SERVER)
                    .awaitTask()
            } ?: return

            var newestMs = lastMs
            // Show oldest-to-newest so notification tray order matches arrival order
            val docs = snap.documents.reversed()
            for (doc in docs) {
                val createdMs = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L
                if (createdMs > newestMs) {
                    newestMs = createdMs
                }
                val isRead = doc.getBoolean("isRead") == true
                val readBy = (doc.get("readBy") as? List<*>)?.mapNotNull { it as? String }.orEmpty()
                if (isRead || currentUid in readBy) continue

                val category = doc.getString("category").orEmpty().ifBlank { "data_update" }
                val title = doc.getString("title").orEmpty()
                val body = doc.getString("body").orEmpty()
                if (title.isBlank() && body.isBlank()) continue

                AdminNotificationHelper.showAdminActivityNotification(
                    context = applicationContext,
                    notifId = doc.id,
                    category = category,
                    title = title,
                    body = body,
                    targetRoute = doc.getString("targetRoute").orEmpty(),
                    referenceId = doc.getString("referenceId").orEmpty(),
                    actorName = doc.getString("actorName").orEmpty(),
                    actorMobile = doc.getString("actorMobile").orEmpty()
                )
            }
            if (newestMs > lastMs) {
                prefs.edit().putLong(KEY_LAST_ADMIN_NOTIF_MS, newestMs).apply()
            }
        }.onFailure { err ->
            Log.w(TAG, "Background pollAdminNotifications skipped: ${err.localizedMessage}")
        }
    }

    private suspend fun pollAdminChats(db: FirebaseFirestore, currentUid: String) {
        runCatching {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastMs = prefs.getLong(KEY_LAST_ADMIN_CHAT_MS, System.currentTimeMillis())
            val snap = withTimeoutOrNull(10_000L) {
                db.collection("admin_chats")
                    .whereArrayContains("participants", currentUid)
                    .limit(15)
                    .get(Source.SERVER)
                    .awaitTask()
            } ?: return

            var newestMs = lastMs
            for (doc in snap.documents) {
                val lastMsgMs = doc.getTimestamp("lastMessageAt")?.toDate()?.time ?: 0L
                if (lastMsgMs <= lastMs) continue
                if (lastMsgMs > newestMs) newestMs = lastMsgMs

                val senderUid = doc.getString("lastMessageSenderUid").orEmpty()
                if (senderUid.isBlank() || senderUid == currentUid) continue

                val unreadMap = doc.get("unreadCounts") as? Map<*, *>
                val unreadCount = (unreadMap?.get(currentUid) as? Number)?.toLong() ?: 0L
                if (unreadCount <= 0L) continue

                val senderName = doc.getString("lastMessageSenderName").orEmpty().ifBlank { "Admin" }
                val text = doc.getString("lastMessageText").orEmpty()
                if (text.isBlank()) continue

                val participantMeta = doc.get("participantMeta") as? Map<*, *>
                val senderMeta = participantMeta?.get(senderUid) as? Map<*, *>
                val senderPhotoUrl = (senderMeta?.get("photoUrl") as? String).orEmpty()

                AdminNotificationHelper.showAdminChatNotification(
                    context = applicationContext,
                    chatId = doc.id,
                    messageId = "${doc.id}_$lastMsgMs",
                    senderUid = senderUid,
                    senderName = senderName,
                    senderPhotoUrl = senderPhotoUrl,
                    text = text,
                    timestampMs = lastMsgMs
                )
            }
            if (newestMs > lastMs) {
                prefs.edit().putLong(KEY_LAST_ADMIN_CHAT_MS, newestMs).apply()
            }
        }.onFailure { err ->
            Log.w(TAG, "Background pollAdminChats skipped: ${err.localizedMessage}")
        }
    }

    private suspend fun pollPublicBroadcasts(db: FirebaseFirestore) {
        runCatching {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastMs = prefs.getLong(KEY_LAST_BROADCAST_MS, System.currentTimeMillis())
            val snap = withTimeoutOrNull(10_000L) {
                db.collection("push_broadcasts")
                    .whereGreaterThan("createdAt", Timestamp(Date(lastMs)))
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .limit(5)
                    .get(Source.SERVER)
                    .awaitTask()
            } ?: return

            var newestMs = lastMs
            for (doc in snap.documents.reversed()) {
                val createdMs = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L
                if (createdMs > newestMs) newestMs = createdMs
                val title = doc.getString("title").orEmpty()
                val body = doc.getString("body").orEmpty()
                if (title.isBlank() && body.isBlank()) continue

                AdminNotificationHelper.showPushBroadcastNotification(
                    context = applicationContext,
                    broadcastId = doc.id,
                    category = doc.getString("category").orEmpty().ifBlank { "admin_message" },
                    title = title,
                    body = body,
                    targetRoute = doc.getString("targetRoute").orEmpty().ifBlank { "home" },
                    referenceId = doc.getString("referenceId").orEmpty().ifBlank { doc.id }
                )
            }
            if (newestMs > lastMs) {
                prefs.edit().putLong(KEY_LAST_BROADCAST_MS, newestMs).apply()
            }
        }.onFailure { err ->
            Log.w(TAG, "Background pollPublicBroadcasts skipped: ${err.localizedMessage}")
        }
    }

    private suspend fun pollAppUpdateNotifications(db: FirebaseFirestore) {
        runCatching {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastMs = prefs.getLong(KEY_LAST_UPDATE_MS, System.currentTimeMillis())
            val installedVersionCode = runCatching {
                val pkgInfo = applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0)
                PackageInfoCompat.getLongVersionCode(pkgInfo)
            }.getOrDefault(1L)

            val snap = withTimeoutOrNull(10_000L) {
                db.collection("update_notifications")
                    .whereGreaterThan("createdAt", Timestamp(Date(lastMs)))
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .limit(2)
                    .get(Source.SERVER)
                    .awaitTask()
            } ?: return

            var newestMs = lastMs
            for (doc in snap.documents.reversed()) {
                val createdMs = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0L
                if (createdMs > newestMs) newestMs = createdMs
                val remoteCode = doc.getLong("versionCode") ?: 0L
                if (remoteCode <= installedVersionCode) continue

                AdminNotificationHelper.showAppUpdateNotification(
                    context = applicationContext,
                    releaseId = doc.getString("releaseId").orEmpty().ifBlank { doc.id },
                    appName = doc.getString("appName").orEmpty().ifBlank { applicationContext.getString(R.string.app_name) },
                    versionName = doc.getString("versionName").orEmpty().ifBlank { "1.0.1" },
                    versionCode = remoteCode,
                    title = doc.getString("title").orEmpty(),
                    body = doc.getString("body").orEmpty(),
                    isMandatory = doc.getBoolean("isMandatory") == true,
                    apkDownloadUrl = doc.getString("apkDownloadUrl").orEmpty()
                )
            }
            if (newestMs > lastMs) {
                prefs.edit().putLong(KEY_LAST_UPDATE_MS, newestMs).apply()
            }
        }.onFailure { err ->
            Log.w(TAG, "Background pollAppUpdateNotifications skipped: ${err.localizedMessage}")
        }
    }

    companion object {
        private const val TAG = "AdminBgNotifWorker"
        private const val PREFS_NAME = "std10_bg_poll_prefs"
        private const val KEY_LAST_ADMIN_NOTIF_MS = "last_admin_notif_ms"
        private const val KEY_LAST_ADMIN_CHAT_MS = "last_admin_chat_ms"
        private const val KEY_LAST_BROADCAST_MS = "last_broadcast_ms"
        private const val KEY_LAST_UPDATE_MS = "last_update_ms"

        private const val WORK_NAME_PERIODIC = "quick_quiz_bg_notif_periodic"
        private const val WORK_NAME_QUICK_1 = "quick_quiz_bg_notif_quick_1"
        private const val WORK_NAME_QUICK_2 = "quick_quiz_bg_notif_quick_2"

        fun initializeWatermarksIfNeeded(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val editor = prefs.edit()
            var changed = false
            if (prefs.getLong(KEY_LAST_ADMIN_NOTIF_MS, 0L) == 0L) {
                editor.putLong(KEY_LAST_ADMIN_NOTIF_MS, now)
                changed = true
            }
            if (prefs.getLong(KEY_LAST_ADMIN_CHAT_MS, 0L) == 0L) {
                editor.putLong(KEY_LAST_ADMIN_CHAT_MS, now)
                changed = true
            }
            if (prefs.getLong(KEY_LAST_BROADCAST_MS, 0L) == 0L) {
                editor.putLong(KEY_LAST_BROADCAST_MS, now)
                changed = true
            }
            if (prefs.getLong(KEY_LAST_UPDATE_MS, 0L) == 0L) {
                editor.putLong(KEY_LAST_UPDATE_MS, now)
                changed = true
            }
            if (changed) editor.apply()
        }

        fun advanceAdminNotifWatermark(context: Context, timestampMs: Long) {
            if (timestampMs <= 0L) return
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val current = prefs.getLong(KEY_LAST_ADMIN_NOTIF_MS, 0L)
            if (timestampMs > current) {
                prefs.edit().putLong(KEY_LAST_ADMIN_NOTIF_MS, timestampMs).apply()
            }
        }

        fun ensurePeriodicScheduled(context: Context) {
            runCatching {
                initializeWatermarksIfNeeded(context)
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
                val periodicRequest = PeriodicWorkRequestBuilder<AdminBackgroundNotificationWorker>(
                    15L,
                    TimeUnit.MINUTES
                )
                    .setConstraints(constraints)
                    .build()
                WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                    WORK_NAME_PERIODIC,
                    ExistingPeriodicWorkPolicy.KEEP,
                    periodicRequest
                )
            }.onFailure { err ->
                Log.w(TAG, "Unable to schedule periodic background notification worker", err)
            }
        }

        fun scheduleQuickBackgroundCheck(context: Context) {
            runCatching {
                if (!AdminNotificationHelper.hasNotificationPermission(context)) return
                initializeWatermarksIfNeeded(context)
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
                val wm = WorkManager.getInstance(context.applicationContext)

                val quick1 = OneTimeWorkRequestBuilder<AdminBackgroundNotificationWorker>()
                    .setInitialDelay(2L, TimeUnit.MINUTES)
                    .setConstraints(constraints)
                    .build()
                wm.enqueueUniqueWork(WORK_NAME_QUICK_1, ExistingWorkPolicy.REPLACE, quick1)

                val quick2 = OneTimeWorkRequestBuilder<AdminBackgroundNotificationWorker>()
                    .setInitialDelay(7L, TimeUnit.MINUTES)
                    .setConstraints(constraints)
                    .build()
                wm.enqueueUniqueWork(WORK_NAME_QUICK_2, ExistingWorkPolicy.REPLACE, quick2)
            }.onFailure { err ->
                Log.w(TAG, "Unable to schedule quick background notification check", err)
            }
        }

        private fun getNamedFirestore(context: Context): FirebaseFirestore? {
            return runCatching {
                configureAppCheck(context, null)
                val dbId = context.getString(R.string.firestore_database_id)
                if (dbId.isBlank()) return@runCatching null
                FirebaseFirestore.getInstance(FirebaseApp.getInstance(), dbId)
            }.getOrNull()
        }

        private suspend fun <T> Task<T>.awaitTask(): T = suspendCancellableCoroutine { cont ->
            addOnSuccessListener { result ->
                if (cont.isActive) cont.resume(result)
            }
            addOnFailureListener { exc ->
                if (cont.isActive) cont.resumeWithException(exc)
            }
            addOnCanceledListener {
                if (cont.isActive) cont.cancel()
            }
        }
    }
}
