import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readText(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('AndroidManifest configures POST_NOTIFICATIONS, VIBRATE, high-priority default channel, and notification click intent filter', () => {
  const manifest = readText('app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /android\.permission\.VIBRATE/);
  assert.match(
    manifest,
    /com\.google\.firebase\.messaging\.default_notification_channel_id[\s\S]*quick_quiz_push_high/
  );
  assert.match(manifest, /OPEN_QUICK_QUIZ_NOTIFICATION/);
});

test('AdminNotificationHelper enforces WhatsApp-style heads-up channel, persistent deduplication, Quick Quiz logo, and terminated String-extra deep-links', () => {
  const helper = readText('app/src/main/java/com/aistudio/std10quiz/kqxmtv/AdminNotificationHelper.kt');
  assert.match(helper, /CHANNEL_GENERAL_PUSH\s*=\s*"quick_quiz_push_high"/);
  assert.match(helper, /IMPORTANCE_HIGH/);
  assert.match(helper, /KEY_SHOWN_DEDUPE_KEYS/);
  assert.match(helper, /R\.drawable\.ic_app_logo/);
  assert.match(helper, /setLargeIcon/);
  assert.match(helper, /Quick Quiz/);
  assert.match(helper, /fun showPushBroadcastNotification/);
  assert.match(helper, /OPEN_QUICK_QUIZ_NOTIFICATION/);
  assert.match(helper, /fun extractDeepLinkFromIntent/);
  assert.match(helper, /getStringExtra\("broadcastId"\)/);
});

test('QuizFirebaseMessagingService and NativeFirebaseBridge strictly gate FCM token registration behind notification permission', () => {
  const fcmService = readText('app/src/main/java/com/aistudio/std10quiz/kqxmtv/QuizFirebaseMessagingService.kt');
  const bridge = readText('app/src/main/java/com/aistudio/std10quiz/kqxmtv/NativeFirebaseBridge.kt');

  assert.match(fcmService, /hasNotificationPermission/);
  assert.match(fcmService, /"push_broadcast"/);
  assert.match(fcmService, /"app_update"/);
  assert.doesNotMatch(fcmService, /"enabled"\s+to\s+true/);

  assert.match(bridge, /"enabled"\s+to\s+AdminNotificationHelper\.hasNotificationPermission/);
  assert.doesNotMatch(bridge, /"enabled"\s+to\s+true/);
  assert.match(bridge, /fun openNotificationSettings/);
  assert.match(bridge, /fun sendPushBroadcast/);
  assert.match(bridge, /fun deletePushBroadcast/);
  assert.match(bridge, /__onNativePushBroadcasts/);
});

test('Cloud Functions broadcast hybrid notification+data FCM payloads only to permission-enabled devices with Quick Quiz branding', () => {
  const functionsCode = readText('functions/index.js');
  assert.match(functionsCode, /exports\.onPushBroadcastCreated/);
  assert.match(functionsCode, /exports\.sendAdminPushNotification/);
  assert.match(functionsCode, /exports\.onAppReleaseCreated/);
  assert.match(functionsCode, /Quick Quiz/);
  assert.match(functionsCode, /where\("enabled", "==", true\)/);
  assert.match(functionsCode, /OPEN_QUICK_QUIZ_NOTIFICATION/);
  assert.match(functionsCode, /PRIORITY_MAX/);
  assert.match(functionsCode, /quick_quiz_push_high/);
});

test('Web Service Workers handle background push notifications with Quick Quiz logo, vibration, deduplication tag, and deep-link click routing', () => {
  const sw = readText('public/sw.js');
  const fcmSw = readText('public/firebase-messaging-sw.js');

  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /ic_app_logo_192\.png/);
  assert.match(sw, /vibrate:/);
  assert.match(sw, /QUICK_QUIZ_NOTIFICATION_CLICK/);

  assert.match(fcmSw, /onBackgroundMessage/);
  assert.match(fcmSw, /ic_app_logo_192\.png/);
  assert.match(fcmSw, /vibrate:/);
  assert.match(fcmSw, /pushRoute/);
});
