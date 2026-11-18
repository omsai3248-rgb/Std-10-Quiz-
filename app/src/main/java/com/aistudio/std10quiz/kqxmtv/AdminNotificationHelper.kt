package com.aistudio.std10quiz.kqxmtv

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.UUID

object AdminNotificationHelper {
    const val CHANNEL_ADMIN_ALERTS = "admin_alerts_high"
    const val CHANNEL_ADMIN_CHAT = "admin_chat_messages"
    const val CHANNEL_APP_UPDATES = "app_updates_high"

    const val EXTRA_TARGET_ROUTE = "extra_target_route"
    const val EXTRA_CHAT_ID = "extra_chat_id"
    const val EXTRA_SENDER_UID = "extra_sender_uid"
    const val EXTRA_NOTIF_ID = "extra_notif_id"
    const val EXTRA_REFERENCE_ID = "extra_reference_id"

    private const val PREFS_NAME = "std10_admin_fcm_prefs"
    private const val KEY_IS_ADMIN_ACTIVE = "is_admin_active"
    private const val KEY_ADMIN_UID = "admin_uid"
    private const val KEY_ADMIN_EMAIL = "admin_email"
    private const val KEY_ADMIN_NAME = "admin_name"
    private const val KEY_ADMIN_PREFS_JSON = "admin_notif_prefs_json"
    private const val KEY_FCM_TOKEN = "fcm_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_PENDING_DEEP_LINK = "pending_deep_link_json"

    private val shownKeys: MutableSet<String> =
        Collections.synchronizedSet(linkedSetOf<String>())

    private val VIBRATION_PATTERN = longArrayOf(0L, 220L, 110L, 220L)

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttrs = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()

        val alertsChannel = NotificationChannel(
            CHANNEL_ADMIN_ALERTS,
            "Admin Activity Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Heads-up alerts for registrations, payments, codes, and quiz activity"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(soundUri, audioAttrs)
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }

        val chatChannel = NotificationChannel(
            CHANNEL_ADMIN_CHAT,
            "Admin Personal Messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "WhatsApp-style heads-up personal messages from fellow Admins"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(soundUri, audioAttrs)
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }

        val updatesChannel = NotificationChannel(
            CHANNEL_APP_UPDATES,
            "App Updates",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Heads-up notifications when a new version of Std 10 Quiz is available"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(soundUri, audioAttrs)
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        nm.createNotificationChannel(alertsChannel)
        nm.createNotificationChannel(chatChannel)
        nm.createNotificationChannel(updatesChannel)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
    }

    fun getOrCreateDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY_DEVICE_ID, null).orEmpty().trim()
        if (existing.isNotBlank()) return existing
        val created = "and_${UUID.randomUUID().toString().replace("-", "").take(16)}"
        prefs.edit().putString(KEY_DEVICE_ID, created).apply()
        return created
    }

    fun saveAdminSessionState(
        context: Context,
        isAdminActive: Boolean,
        adminUid: String,
        adminEmail: String,
        adminName: String,
        prefsJson: String
    ) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_IS_ADMIN_ACTIVE, isAdminActive)
            .putString(KEY_ADMIN_UID, adminUid)
            .putString(KEY_ADMIN_EMAIL, adminEmail)
            .putString(KEY_ADMIN_NAME, adminName)
            .putString(KEY_ADMIN_PREFS_JSON, prefsJson)
            .apply()
    }

    fun clearAdminSessionState(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_IS_ADMIN_ACTIVE, false)
            .remove(KEY_ADMIN_UID)
            .remove(KEY_ADMIN_EMAIL)
            .remove(KEY_ADMIN_NAME)
            .remove(KEY_PENDING_DEEP_LINK)
            .apply()
    }

    fun isAdminSessionActive(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_IS_ADMIN_ACTIVE, false)
    }

    fun getSavedAdminUid(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ADMIN_UID, "").orEmpty()
    }

    fun getSavedAdminEmail(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ADMIN_EMAIL, "").orEmpty()
    }

    fun getSavedAdminName(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ADMIN_NAME, "").orEmpty()
    }

    fun updateNotificationPrefsJson(context: Context, prefsJson: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_ADMIN_PREFS_JSON, prefsJson)
            .apply()
    }

    fun isCategoryEnabled(context: Context, category: String): Boolean {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ADMIN_PREFS_JSON, null).orEmpty()
        if (raw.isBlank()) return true
        val prefKey = when (category) {
            "registration" -> "registrations"
            "login" -> "logins"
            "payment" -> "payments"
            "code_redeem" -> "codeRedemptions"
            "quiz_activity" -> "quizActivity"
            "data_update" -> "dataUpdates"
            "admin_chat" -> "adminChat"
            else -> return true
        }
        return runCatching {
            JSONObject(raw).optBoolean(prefKey, true)
        }.getOrDefault(true)
    }

    fun saveFcmToken(context: Context, token: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_FCM_TOKEN, token)
            .apply()
    }

    fun getSavedFcmToken(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_FCM_TOKEN, "").orEmpty()
    }

    fun extractDeepLinkFromIntent(intent: Intent?): JSONObject? {
        if (intent == null) return null
        val targetRoute = intent.getStringExtra(EXTRA_TARGET_ROUTE)
            ?: intent.getStringExtra("targetRoute")
            ?: return null
        if (targetRoute.isBlank()) return null
        return JSONObject().apply {
            put("targetRoute", targetRoute)
            put("chatId", intent.getStringExtra(EXTRA_CHAT_ID) ?: intent.getStringExtra("chatId").orEmpty())
            put("senderUid", intent.getStringExtra(EXTRA_SENDER_UID) ?: intent.getStringExtra("senderUid").orEmpty())
            put("notifId", intent.getStringExtra(EXTRA_NOTIF_ID) ?: intent.getStringExtra("notifId").orEmpty())
            put("referenceId", intent.getStringExtra(EXTRA_REFERENCE_ID) ?: intent.getStringExtra("referenceId").orEmpty())
        }
    }

    fun savePendingDeepLink(context: Context, json: JSONObject) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_PENDING_DEEP_LINK, json.toString())
            .apply()
    }

    fun consumePendingDeepLink(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_PENDING_DEEP_LINK, null).orEmpty()
        if (raw.isNotBlank()) {
            prefs.edit().remove(KEY_PENDING_DEEP_LINK).apply()
        }
        return raw.ifBlank { "null" }
    }

    private fun markDedupeShown(dedupeKey: String): Boolean {
        if (dedupeKey.isBlank()) return true
        synchronized(shownKeys) {
            if (shownKeys.contains(dedupeKey)) return false
            if (shownKeys.size > 200) {
                val iter = shownKeys.iterator()
                if (iter.hasNext()) {
                    iter.next()
                    iter.remove()
                }
            }
            shownKeys.add(dedupeKey)
            return true
        }
    }

    fun showAdminActivityNotification(
        context: Context,
        notifId: String,
        category: String,
        title: String,
        body: String,
        targetRoute: String,
        referenceId: String
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        if (!isCategoryEnabled(context, category)) return
        if (!markDedupeShown("act_$notifId")) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, targetRoute.ifBlank { "admin_notifications" })
            putExtra(EXTRA_NOTIF_ID, notifId)
            putExtra(EXTRA_REFERENCE_ID, referenceId)
        }
        val reqCode = (notifId.ifBlank { title + System.currentTimeMillis() }).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val publicFallback = NotificationCompat.Builder(context, CHANNEL_ADMIN_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle("ધોરણ 10 Admin Alert")
            .setContentText("નવી Admin સૂચના આવી છે.")
            .build()

        val notification = NotificationCompat.Builder(context, CHANNEL_ADMIN_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(0xFF075E54.toInt())
            .setContentTitle(title.ifBlank { "Admin સૂચના" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicFallback)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(reqCode, notification)
        }.onFailure { err ->
            Log.w("AdminNotification", "Unable to post activity notification", err)
        }
    }

    fun showAppUpdateNotification(
        context: Context,
        releaseId: String,
        appName: String,
        versionName: String,
        versionCode: Long,
        title: String,
        body: String,
        isMandatory: Boolean
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        val dedupeKey = "appupd_${releaseId.ifBlank { "${versionName}_$versionCode" }}"
        if (!markDedupeShown(dedupeKey)) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, "app_update")
            putExtra(EXTRA_NOTIF_ID, releaseId)
            putExtra(EXTRA_REFERENCE_ID, releaseId)
        }
        val reqCode = ("app_update_${versionCode}_$versionName").hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val resolvedAppName = appName.ifBlank { context.getString(R.string.app_name) }
        val resolvedTitle = title.ifBlank {
            if (isMandatory) {
                "$resolvedAppName • જરૂરી અપડેટ v$versionName"
            } else {
                "$resolvedAppName • નવું અપડેટ v$versionName"
            }
        }
        val resolvedBody = body.ifBlank {
            "નવું વર્ઝન v$versionName ઉપલબ્ધ છે. અહીં ટચ કરીને એપની અંદરથી તરત અપડેટ કરો."
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_APP_UPDATES)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(0xFF1E3A8A.toInt())
            .setSubText(resolvedAppName)
            .setContentTitle(resolvedTitle)
            .setContentText(resolvedBody)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(resolvedTitle)
                    .bigText(resolvedBody)
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(reqCode, notification)
        }.onFailure { err ->
            Log.w("AdminNotification", "Unable to post app update notification", err)
        }
    }

    fun showAdminChatNotification(
        context: Context,
        chatId: String,
        messageId: String,
        senderUid: String,
        senderName: String,
        senderPhotoUrl: String,
        text: String,
        timestampMs: Long
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        if (!isCategoryEnabled(context, "admin_chat")) return
        if (!markDedupeShown("chat_$messageId")) return

        val avatarBitmap = if (senderPhotoUrl.startsWith("https://")) {
            fetchCircularBitmap(senderPhotoUrl)
        } else {
            null
        }

        val senderPersonBuilder = Person.Builder()
            .setKey(senderUid)
            .setName(senderName.ifBlank { "Admin" })
        if (avatarBitmap != null) {
            senderPersonBuilder.setIcon(IconCompat.createWithBitmap(avatarBitmap))
        }
        val senderPerson = senderPersonBuilder.build()

        val meName = getSavedAdminName(context).ifBlank { "You" }
        val mePerson = Person.Builder()
            .setKey(getSavedAdminUid(context).ifBlank { "me" })
            .setName(meName)
            .build()

        val messagingStyle = NotificationCompat.MessagingStyle(mePerson)
            .setConversationTitle(senderName.ifBlank { "Admin Chat" })
            .addMessage(text, if (timestampMs > 0L) timestampMs else System.currentTimeMillis(), senderPerson)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, "admin_chat")
            putExtra(EXTRA_CHAT_ID, chatId)
            putExtra(EXTRA_SENDER_UID, senderUid)
            putExtra(EXTRA_NOTIF_ID, messageId)
        }
        val reqCode = chatId.hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val publicFallback = NotificationCompat.Builder(context, CHANNEL_ADMIN_CHAT)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle("Admin Personal Message")
            .setContentText("નવો Admin સંદેશ આવ્યો છે.")
            .build()

        val builder = NotificationCompat.Builder(context, CHANNEL_ADMIN_CHAT)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(0xFF008069.toInt())
            .setStyle(messagingStyle)
            .setContentTitle(senderName.ifBlank { "Admin Message" })
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicFallback)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap)
        }

        runCatching {
            NotificationManagerCompat.from(context).notify(reqCode, builder.build())
        }.onFailure { err ->
            Log.w("AdminNotification", "Unable to post chat notification", err)
        }
    }

    private fun fetchCircularBitmap(urlStr: String): Bitmap? {
        return runCatching {
            val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                connectTimeout = 2_500
                readTimeout = 2_500
                doInput = true
            }
            conn.connect()
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return@runCatching null
            val raw = conn.inputStream.use { BitmapFactory.decodeStream(it) } ?: return@runCatching null
            val size = 128
            val scaled = Bitmap.createScaledBitmap(raw, size, size, true)
            val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(output)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val rect = Rect(0, 0, size, size)
            canvas.drawARGB(0, 0, 0, 0)
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            canvas.drawBitmap(scaled, rect, rect, paint)
            output
        }.getOrNull()
    }
}
