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
import android.graphics.RectF
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object AdminNotificationHelper {
    const val CHANNEL_GENERAL_PUSH = "quick_quiz_push_high"
    const val CHANNEL_ADMIN_ALERTS = "admin_alerts_high"
    const val CHANNEL_ADMIN_CHAT = "admin_chat_messages"
    const val CHANNEL_APP_UPDATES = "app_updates_high"

    const val EXTRA_TARGET_ROUTE = "extra_target_route"
    const val EXTRA_CHAT_ID = "extra_chat_id"
    const val EXTRA_SENDER_UID = "extra_sender_uid"
    const val EXTRA_NOTIF_ID = "extra_notif_id"
    const val EXTRA_REFERENCE_ID = "extra_reference_id"
    const val EXTRA_ACTOR_NAME = "extra_actor_name"
    const val EXTRA_ACTOR_MOBILE = "extra_actor_mobile"
    const val EXTRA_BROADCAST_CATEGORY = "extra_broadcast_category"
    const val EXTRA_BROADCAST_TITLE = "extra_broadcast_title"
    const val EXTRA_BROADCAST_BODY = "extra_broadcast_body"
    const val EXTRA_UPDATE_VERSION_NAME = "extra_update_version_name"
    const val EXTRA_UPDATE_VERSION_CODE = "extra_update_version_code"
    const val EXTRA_UPDATE_TITLE = "extra_update_title"
    const val EXTRA_UPDATE_BODY = "extra_update_body"
    const val EXTRA_UPDATE_APK_URL = "extra_update_apk_url"
    const val EXTRA_UPDATE_MANDATORY = "extra_update_mandatory"

    private const val PREFS_NAME = "std10_admin_fcm_prefs"
    private const val KEY_IS_ADMIN_ACTIVE = "is_admin_active"
    private const val KEY_ADMIN_UID = "admin_uid"
    private const val KEY_ADMIN_EMAIL = "admin_email"
    private const val KEY_ADMIN_NAME = "admin_name"
    private const val KEY_ADMIN_PREFS_JSON = "admin_notif_prefs_json"
    private const val KEY_FCM_TOKEN = "fcm_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_PENDING_DEEP_LINK = "pending_deep_link_json"
    private const val KEY_SHOWN_DEDUPE_KEYS = "shown_dedupe_keys_v2"
    private const val MAX_PERSISTED_DEDUPE_KEYS = 250

    private val dedupeLock = Any()
    private var shownKeysLoaded = false
    private val shownKeys: LinkedHashSet<String> = linkedSetOf()

    @Volatile
    private var cachedAppLogoBitmap: Bitmap? = null

    private val VIBRATION_PATTERN = longArrayOf(0L, 220L, 110L, 220L)

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttrs = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()

        val generalPushChannel = NotificationChannel(
            CHANNEL_GENERAL_PUSH,
            "Quick Quiz Alerts & Exam Notices",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Real-time WhatsApp-style banners for exam notices, admin announcements, and study alerts"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(soundUri, audioAttrs)
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

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
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
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
            description = "Heads-up notifications when a new version of Quick Quiz is available"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(soundUri, audioAttrs)
            setShowBadge(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        nm.createNotificationChannel(generalPushChannel)
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

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        return runCatching {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(context.packageName) == true
        }.getOrDefault(false)
    }

    fun openNotificationSettings(context: Context) {
        runCatching {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }.onFailure { err ->
            Log.w("AdminNotification", "Unable to open notification settings", err)
        }
    }

    fun openBatteryOptimizationSettings(context: Context) {
        val opened = runCatching {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        }.getOrDefault(false)
        if (!opened) {
            runCatching {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            }
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

    /**
     * Purges any previously persisted `subscribeToTopic("app_updates")` entries from
     * FirebaseMessaging's SharedPreferences queue so GMS does not keep retrying a failed
     * `INVALID_PARAMETERS` topic sync RPC (`E/FirebaseMessaging: Failed to sync topics`).
     * Push notifications are delivered via direct multicast in Cloud Functions instead.
     */
    fun clearStaleFcmTopicQueue(context: Context) {
        runCatching {
            val gmsPrefs = context.getSharedPreferences("com.google.android.gms.appid", Context.MODE_PRIVATE)
            val rawQueue = gmsPrefs.getString("topic_operation_queue", null) ?: return
            val remaining = rawQueue.split(',')
                .map { it.trim() }
                .filter { entry ->
                    entry.isNotEmpty() &&
                        !entry.endsWith("!app_updates") &&
                        !entry.endsWith("!/topics/app_updates")
                }
            val editor = gmsPrefs.edit()
            if (remaining.isEmpty()) {
                editor.remove("topic_operation_queue")
            } else {
                editor.putString("topic_operation_queue", remaining.joinToString(","))
            }
            editor.apply()
        }
    }

    /**
     * Extracts deep-link routing data from BOTH:
     * 1) In-app / FCM-service-built PendingIntents (typed extras)
     * 2) Terminated/background system-tray FCM notifications tapped by the user
     *    (where Google Play Services delivers every `data` payload key as a String extra).
     */
    fun extractDeepLinkFromIntent(intent: Intent?): JSONObject? {
        if (intent == null) return null
        val extras = intent.extras ?: return null
        val pushType = intent.getStringExtra("type").orEmpty().trim()
        val broadcastCategory = (intent.getStringExtra(EXTRA_BROADCAST_CATEGORY)
            ?: intent.getStringExtra("category")).orEmpty().trim()
        val rawRoute = intent.getStringExtra(EXTRA_TARGET_ROUTE)
            ?: intent.getStringExtra("targetRoute")
            ?: when (pushType) {
                "app_update" -> "app_update"
                "push_broadcast" -> "home"
                "admin_chat" -> "admin_chat"
                "admin_activity" -> when (broadcastCategory) {
                    "registration", "login", "quiz_activity" -> "admin_students"
                    "payment" -> "admin_requests"
                    "code_redeem" -> "admin_codes"
                    "admin_chat" -> "admin_chat"
                    else -> "admin_notifications"
                }
                else -> null
            }
            ?: return null
        val targetRoute = rawRoute.trim()
        if (targetRoute.isBlank()) return null

        val broadcastId = intent.getStringExtra("broadcastId").orEmpty()
        val notifId = (intent.getStringExtra(EXTRA_NOTIF_ID)
            ?: intent.getStringExtra("notifId")
            ?: intent.getStringExtra("messageId")
            ?: intent.getStringExtra("releaseId")
            ?: broadcastId).orEmpty()
        val referenceId = (intent.getStringExtra(EXTRA_REFERENCE_ID)
            ?: intent.getStringExtra("referenceId")
            ?: intent.getStringExtra("releaseId")
            ?: broadcastId).orEmpty()
        val actorName = (intent.getStringExtra(EXTRA_ACTOR_NAME)
            ?: intent.getStringExtra("actorName")
            ?: intent.getStringExtra("senderName")).orEmpty().trim()
        val actorMobile = (intent.getStringExtra(EXTRA_ACTOR_MOBILE)
            ?: intent.getStringExtra("actorMobile")).orEmpty().trim()

        val verCode: Long = when {
            intent.hasExtra(EXTRA_UPDATE_VERSION_CODE) -> intent.getLongExtra(EXTRA_UPDATE_VERSION_CODE, 0L)
            extras.containsKey("versionCode") -> {
                val raw = extras.get("versionCode")
                when (raw) {
                    is Number -> raw.toLong()
                    is String -> raw.toLongOrNull() ?: 0L
                    else -> 0L
                }
            }
            else -> 0L
        }

        val hasMandatory = intent.hasExtra(EXTRA_UPDATE_MANDATORY) || extras.containsKey("isMandatory")
        val isMandatory: Boolean = when {
            intent.hasExtra(EXTRA_UPDATE_MANDATORY) -> intent.getBooleanExtra(EXTRA_UPDATE_MANDATORY, false)
            extras.containsKey("isMandatory") -> {
                val raw = extras.get("isMandatory")
                when (raw) {
                    is Boolean -> raw
                    is String -> raw.equals("true", ignoreCase = true)
                    else -> false
                }
            }
            else -> false
        }

        val broadcastTitle = intent.getStringExtra(EXTRA_BROADCAST_TITLE)
            ?: intent.getStringExtra(EXTRA_UPDATE_TITLE)
            ?: intent.getStringExtra("title").orEmpty()
        val broadcastBody = intent.getStringExtra(EXTRA_BROADCAST_BODY)
            ?: intent.getStringExtra(EXTRA_UPDATE_BODY)
            ?: intent.getStringExtra("body")
            ?: intent.getStringExtra("text").orEmpty()

        return JSONObject().apply {
            put("targetRoute", targetRoute)
            put("chatId", intent.getStringExtra(EXTRA_CHAT_ID) ?: intent.getStringExtra("chatId").orEmpty())
            put("senderUid", intent.getStringExtra(EXTRA_SENDER_UID) ?: intent.getStringExtra("senderUid").orEmpty())
            put("notifId", notifId)
            put("referenceId", referenceId)
            if (broadcastId.isNotBlank()) put("broadcastId", broadcastId)
            if (broadcastCategory.isNotBlank()) {
                put("category", broadcastCategory)
                put("broadcastCategory", broadcastCategory)
            }
            if (actorName.isNotBlank()) put("actorName", actorName)
            if (actorMobile.isNotBlank()) put("actorMobile", actorMobile)
            if (broadcastTitle.isNotBlank()) {
                put("broadcastTitle", broadcastTitle)
                put("updateTitle", broadcastTitle)
            }
            if (broadcastBody.isNotBlank()) {
                put("broadcastBody", broadcastBody)
                put("releaseNotes", broadcastBody)
            }
            val verName = intent.getStringExtra(EXTRA_UPDATE_VERSION_NAME)
                ?: intent.getStringExtra("versionName").orEmpty()
            if (verName.isNotBlank()) put("versionName", verName)
            if (verCode > 0L) put("versionCode", verCode)
            val apkUrl = intent.getStringExtra(EXTRA_UPDATE_APK_URL)
                ?: intent.getStringExtra("apkDownloadUrl").orEmpty()
            if (apkUrl.isNotBlank()) put("apkDownloadUrl", apkUrl)
            if (hasMandatory) {
                put("isMandatory", isMandatory)
            }
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

    /**
     * Persists shown notification dedupe keys in SharedPreferences so the exact same
     * notification is NEVER displayed twice — even after the app is force-closed or restarted.
     */
    fun markDedupeShown(context: Context, dedupeKey: String): Boolean {
        val clean = dedupeKey.trim()
        if (clean.isBlank()) return true
        synchronized(dedupeLock) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!shownKeysLoaded) {
                shownKeysLoaded = true
                runCatching {
                    val saved = prefs.getString(KEY_SHOWN_DEDUPE_KEYS, null).orEmpty()
                    if (saved.startsWith("[")) {
                        val arr = JSONArray(saved)
                        for (i in 0 until arr.length()) {
                            val item = arr.optString(i).trim()
                            if (item.isNotBlank()) shownKeys.add(item)
                        }
                    }
                }
            }
            if (shownKeys.contains(clean)) return false
            while (shownKeys.size >= MAX_PERSISTED_DEDUPE_KEYS) {
                val iter = shownKeys.iterator()
                if (iter.hasNext()) {
                    iter.next()
                    iter.remove()
                } else {
                    break
                }
            }
            shownKeys.add(clean)
            val arr = JSONArray()
            shownKeys.forEach { arr.put(it) }
            prefs.edit().putString(KEY_SHOWN_DEDUPE_KEYS, arr.toString()).apply()
            return true
        }
    }

    private fun getAppLogoBitmap(context: Context): Bitmap? {
        cachedAppLogoBitmap?.let { if (!it.isRecycled) return it }
        return runCatching {
            val opts = BitmapFactory.Options().apply { inScaled = false }
            val raw = BitmapFactory.decodeResource(context.resources, R.drawable.ic_app_logo, opts)
                ?: return@runCatching null
            val size = 192
            val scaled = Bitmap.createScaledBitmap(raw, size, size, true)
            val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(output)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
            val rect = Rect(0, 0, size, size)
            val rectF = RectF(rect)
            canvas.drawARGB(0, 0, 0, 0)
            canvas.drawRoundRect(rectF, 42f, 42f, paint)
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            canvas.drawBitmap(scaled, rect, rect, paint)
            if (scaled != raw && !scaled.isRecycled) scaled.recycle()
            cachedAppLogoBitmap = output
            output
        }.getOrNull()
    }

    /**
     * WhatsApp-style heads-up notification for Admin broadcasts, Exam Notices, and Announcements.
     * Delivered to ALL opted-in users across foreground, background, and terminated states.
     */
    fun showPushBroadcastNotification(
        context: Context,
        broadcastId: String,
        category: String,
        title: String,
        body: String,
        targetRoute: String,
        referenceId: String = ""
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        val cleanId = broadcastId.trim().ifBlank { "${category}_${title.hashCode()}_${body.hashCode()}" }
        if (!markDedupeShown(context, "broadcast_$cleanId")) return

        val resolvedRoute = targetRoute.trim().ifBlank {
            if (category == "app_update") "app_update" else "home"
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            action = "OPEN_QUICK_QUIZ_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, resolvedRoute)
            putExtra(EXTRA_NOTIF_ID, cleanId)
            putExtra(EXTRA_REFERENCE_ID, referenceId.ifBlank { cleanId })
            putExtra("broadcastId", cleanId)
            putExtra(EXTRA_BROADCAST_CATEGORY, category)
            putExtra(EXTRA_BROADCAST_TITLE, title)
            putExtra(EXTRA_BROADCAST_BODY, body)
        }
        val reqCode = ("broadcast_$cleanId").hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val appName = context.getString(R.string.app_name)
        val channelId = if (category == "app_update") CHANNEL_APP_UPDATES else CHANNEL_GENERAL_PUSH
        val accentColor = when (category) {
            "exam_notice" -> 0xFFB45309.toInt()
            "app_update" -> 0xFF1E3A8A.toInt()
            else -> 0xFF008069.toInt()
        }
        val subTextLabel = when (category) {
            "exam_notice" -> "$appName • પરીક્ષા સૂચના"
            "app_update" -> "$appName • અપડેટ"
            else -> appName
        }

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(accentColor)
            .setSubText(subTextLabel)
            .setContentTitle(title.ifBlank { appName })
            .setContentText(body)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(title.ifBlank { appName })
                    .bigText(body)
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)

        getAppLogoBitmap(context)?.let { builder.setLargeIcon(it) }

        runCatching {
            NotificationManagerCompat.from(context).notify("broadcast_$cleanId", reqCode, builder.build())
        }.onFailure { err ->
            Log.w("AdminNotification", "Unable to post push broadcast notification", err)
        }
    }

    fun showAdminActivityNotification(
        context: Context,
        notifId: String,
        category: String,
        title: String,
        body: String,
        targetRoute: String,
        referenceId: String,
        actorName: String = "",
        actorMobile: String = ""
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        if (!isCategoryEnabled(context, category)) return
        if (!markDedupeShown(context, "act_$notifId")) return

        val resolvedRoute = targetRoute.trim().ifBlank {
            when (category) {
                "registration", "login", "quiz_activity" -> "admin_students"
                "payment" -> "admin_requests"
                "code_redeem" -> "admin_codes"
                "admin_chat" -> "admin_chat"
                else -> "admin_notifications"
            }
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            action = "OPEN_QUICK_QUIZ_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, resolvedRoute)
            putExtra(EXTRA_NOTIF_ID, notifId)
            putExtra(EXTRA_REFERENCE_ID, referenceId)
            putExtra(EXTRA_BROADCAST_CATEGORY, category)
            putExtra(EXTRA_BROADCAST_TITLE, title)
            putExtra(EXTRA_BROADCAST_BODY, body)
            if (actorName.isNotBlank()) putExtra(EXTRA_ACTOR_NAME, actorName)
            if (actorMobile.isNotBlank()) putExtra(EXTRA_ACTOR_MOBILE, actorMobile)
        }
        val reqCode = (notifId.ifBlank { title + System.currentTimeMillis() }).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val appName = context.getString(R.string.app_name)
        val builder = NotificationCompat.Builder(context, CHANNEL_ADMIN_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(0xFF0F172A.toInt())
            .setSubText("$appName • Admin")
            .setContentTitle(title.ifBlank { "Admin સૂચના" })
            .setContentText(body)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(title.ifBlank { "Admin સૂચના" })
                    .bigText(body)
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)

        getAppLogoBitmap(context)?.let { builder.setLargeIcon(it) }

        runCatching {
            NotificationManagerCompat.from(context).notify("act_$notifId", reqCode, builder.build())
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
        isMandatory: Boolean,
        apkDownloadUrl: String = ""
    ) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return
        val dedupeKey = "appupd_${releaseId.ifBlank { "${versionName}_$versionCode" }}"
        if (!markDedupeShown(context, dedupeKey)) return

        val intent = Intent(context, MainActivity::class.java).apply {
            action = "OPEN_QUICK_QUIZ_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_TARGET_ROUTE, "app_update")
            putExtra(EXTRA_NOTIF_ID, releaseId)
            putExtra(EXTRA_REFERENCE_ID, releaseId)
            putExtra(EXTRA_UPDATE_VERSION_NAME, versionName)
            putExtra(EXTRA_UPDATE_VERSION_CODE, versionCode)
            putExtra(EXTRA_UPDATE_TITLE, title)
            putExtra(EXTRA_UPDATE_BODY, body)
            putExtra(EXTRA_UPDATE_APK_URL, apkDownloadUrl)
            putExtra(EXTRA_UPDATE_MANDATORY, isMandatory)
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

        val builder = NotificationCompat.Builder(context, CHANNEL_APP_UPDATES)
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
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)

        getAppLogoBitmap(context)?.let { builder.setLargeIcon(it) }

        runCatching {
            NotificationManagerCompat.from(context).notify(dedupeKey, reqCode, builder.build())
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
        if (!markDedupeShown(context, "chat_$messageId")) return

        val avatarBitmap = if (senderPhotoUrl.startsWith("https://")) {
            fetchCircularBitmap(senderPhotoUrl)
        } else {
            null
        } ?: getAppLogoBitmap(context)

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
            action = "OPEN_QUICK_QUIZ_NOTIFICATION"
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

        val appName = context.getString(R.string.app_name)
        val publicFallback = NotificationCompat.Builder(context, CHANNEL_ADMIN_CHAT)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle("$appName • Admin Message")
            .setContentText("નવો Admin સંદેશ આવ્યો છે.")
            .build()

        val builder = NotificationCompat.Builder(context, CHANNEL_ADMIN_CHAT)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(0xFF008069.toInt())
            .setSubText(appName)
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
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap)
        }

        runCatching {
            NotificationManagerCompat.from(context).notify("chat_$chatId", reqCode, builder.build())
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
