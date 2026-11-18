package com.aistudio.std10quiz.kqxmtv

import android.content.Context
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class QuizFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        AdminNotificationHelper.saveFcmToken(applicationContext, token)
        runCatching {
            FirebaseMessaging.getInstance().subscribeToTopic("app_updates")
        }
        persistPublicDeviceFcmToken(applicationContext, token, topicSubscribed = true)
        persistRefreshedTokenIfAdminSignedIn(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val type = data["type"].orEmpty()

        // 1. App Update notifications are delivered to ALL registered users (foreground/background/killed)
        if (type == "app_update") {
            val releaseId = data["releaseId"].orEmpty().ifBlank { data["referenceId"].orEmpty() }
            val appName = data["appName"].orEmpty().ifBlank { applicationContext.getString(R.string.app_name) }
            val versionName = data["versionName"].orEmpty().ifBlank { "1.0.1" }
            val versionCode = data["versionCode"]?.toLongOrNull() ?: 1L
            val title = data["title"].orEmpty().ifBlank { message.notification?.title.orEmpty() }
            val body = data["body"].orEmpty().ifBlank { message.notification?.body.orEmpty() }
            val isMandatory = data["isMandatory"] == "true"

            AdminNotificationHelper.showAppUpdateNotification(
                context = applicationContext,
                releaseId = releaseId,
                appName = appName,
                versionName = versionName,
                versionCode = versionCode,
                title = title,
                body = body,
                isMandatory = isMandatory
            )
            return
        }

        // 2. Ensure device still has an active Admin session before displaying Admin notifications
        if (!AdminNotificationHelper.isAdminSessionActive(applicationContext) && Firebase.auth.currentUser == null) {
            return
        }

        if (type == "admin_chat") {
            val chatId = data["chatId"].orEmpty()
            val messageId = data["messageId"].orEmpty()
            val senderUid = data["senderUid"].orEmpty()
            val senderName = data["senderName"].orEmpty().ifBlank { message.notification?.title.orEmpty() }
            val senderPhotoUrl = data["senderPhotoUrl"].orEmpty()
            val text = data["text"].orEmpty().ifBlank { message.notification?.body.orEmpty() }
            val tsMs = data["timestampMs"]?.toLongOrNull() ?: System.currentTimeMillis()

            // Avoid alerting sender on their own outgoing message
            val currentUid = Firebase.auth.currentUser?.uid ?: AdminNotificationHelper.getSavedAdminUid(applicationContext)
            if (currentUid.isNotBlank() && senderUid == currentUid) {
                return
            }

            // Mark incoming message as delivered in Firestore immediately if authenticated
            if (chatId.isNotBlank() && messageId.isNotBlank()) {
                markIncomingMessageDelivered(chatId, messageId)
            }

            AdminNotificationHelper.showAdminChatNotification(
                context = applicationContext,
                chatId = chatId,
                messageId = messageId.ifBlank { "${chatId}_$tsMs" },
                senderUid = senderUid,
                senderName = senderName,
                senderPhotoUrl = senderPhotoUrl,
                text = text,
                timestampMs = tsMs
            )
            return
        }

        val notifId = data["notifId"].orEmpty().ifBlank { "fcm_${System.currentTimeMillis()}" }
        val category = data["category"].orEmpty().ifBlank { "data_update" }
        val title = data["title"].orEmpty().ifBlank { message.notification?.title.orEmpty() }
        val body = data["body"].orEmpty().ifBlank { message.notification?.body.orEmpty() }
        val targetRoute = data["targetRoute"].orEmpty().ifBlank { "admin_notifications" }
        val referenceId = data["referenceId"].orEmpty()

        if (title.isBlank() && body.isBlank()) return

        AdminNotificationHelper.showAdminActivityNotification(
            context = applicationContext,
            notifId = notifId,
            category = category,
            title = title,
            body = body,
            targetRoute = targetRoute,
            referenceId = referenceId
        )
    }

    private fun getNamedFirestore(): FirebaseFirestore? {
        return runCatching {
            val dbId = applicationContext.getString(R.string.firestore_database_id)
            if (dbId.isBlank()) return@runCatching null
            FirebaseFirestore.getInstance(FirebaseApp.getInstance(), dbId)
        }.getOrNull()
    }

    private fun markIncomingMessageDelivered(chatId: String, messageId: String) {
        runCatching {
            val user = Firebase.auth.currentUser ?: return
            val db = getNamedFirestore() ?: return
            val msgRef = db.collection("admin_chats").document(chatId)
                .collection("messages").document(messageId)
            msgRef.get().addOnSuccessListener { snap ->
                if (snap.exists() && snap.getString("recipientUid") == user.uid && snap.getString("status") == "sent") {
                    val now = FieldValue.serverTimestamp()
                    msgRef.update(
                        mapOf(
                            "status" to "delivered",
                            "deliveredAt" to now,
                            "updatedAt" to now,
                        )
                    )
                    db.collection("admin_chats").document(chatId).update(
                        mapOf(
                            "lastMessageStatus" to "delivered",
                            "updatedAt" to now,
                        )
                    )
                }
            }
        }.onFailure { err ->
            Log.w("QuizFcmService", "Failed to update delivered status", err)
        }
    }

    private fun persistPublicDeviceFcmToken(context: Context, token: String, topicSubscribed: Boolean) {
        if (token.length < 20) return
        runCatching {
            val db = getNamedFirestore() ?: return
            val deviceId = AdminNotificationHelper.getOrCreateDeviceId(context)
            val pkgInfo = runCatching {
                context.packageManager.getPackageInfo(context.packageName, 0)
            }.getOrNull()
            val appVersion = pkgInfo?.versionName.orEmpty().ifBlank { "1.0.0" }.take(32)
            val versionCode = if (pkgInfo != null) PackageInfoCompat.getLongVersionCode(pkgInfo).coerceAtLeast(1L) else 1L

            val docRef = db.collection("device_fcm_tokens").document(deviceId)
            docRef.get().addOnSuccessListener { snap ->
                val payload = hashMapOf<String, Any>(
                    "deviceId" to deviceId,
                    "token" to token.take(512),
                    "platform" to "android",
                    "appVersion" to appVersion,
                    "versionCode" to versionCode,
                    "topicSubscribed" to topicSubscribed,
                    "enabled" to true,
                    "updatedAt" to FieldValue.serverTimestamp(),
                )
                if (!snap.exists()) {
                    payload["createdAt"] = FieldValue.serverTimestamp()
                    docRef.set(payload)
                } else {
                    docRef.set(payload, SetOptions.merge())
                }
            }
        }.onFailure { err ->
            Log.w("QuizFcmService", "Failed to persist public device FCM token", err)
        }
    }

    private fun persistRefreshedTokenIfAdminSignedIn(token: String) {
        runCatching {
            if (!AdminNotificationHelper.isAdminSessionActive(applicationContext)) return
            val user = Firebase.auth.currentUser ?: return
            val db = getNamedFirestore() ?: return
            val deviceId = AdminNotificationHelper.getOrCreateDeviceId(applicationContext)
            val docId = "${user.uid}_$deviceId"
            val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim().take(120)
            val appVersion = runCatching {
                packageManager.getPackageInfo(packageName, 0).versionName.orEmpty().ifBlank { "1.0.0" }
            }.getOrDefault("1.0.0")

            val payload = hashMapOf(
                "adminUid" to user.uid,
                "adminEmail" to (user.email ?: AdminNotificationHelper.getSavedAdminEmail(applicationContext)).take(120),
                "adminName" to (user.displayName ?: AdminNotificationHelper.getSavedAdminName(applicationContext).ifBlank { "Admin" }).take(80),
                "token" to token,
                "platform" to "android",
                "deviceId" to deviceId,
                "deviceName" to deviceName,
                "appVersion" to appVersion.take(32),
                "enabled" to true,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            val docRef = db.collection("admin_fcm_tokens").document(docId)
            docRef.get().addOnSuccessListener { snap ->
                if (!snap.exists()) {
                    payload["createdAt"] = FieldValue.serverTimestamp()
                    docRef.set(payload)
                } else {
                    docRef.set(payload, SetOptions.merge())
                }
            }
        }.onFailure { err ->
            Log.w("QuizFcmService", "Failed to persist refreshed FCM token", err)
        }
    }
}
