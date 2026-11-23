package com.aistudio.std10quiz.kqxmtv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-registers WorkManager background notification sync immediately after device reboot
 * or app update so Admin activity alerts and public notifications work even before the
 * user manually re-opens the app.
 */
class BootAndUpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val appCtx = context.applicationContext
            AdminNotificationHelper.ensureChannels(appCtx)
            AdminBackgroundNotificationWorker.ensurePeriodicScheduled(appCtx)
            AdminBackgroundNotificationWorker.enqueueImmediateCheck(appCtx)
        }
    }
}
