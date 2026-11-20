import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('AndroidManifest declares OPEN_QUICK_QUIZ_NOTIFICATION clickAction filter and stays Play Protect compliant', () => {
  const manifest = read('app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<action android:name="OPEN_QUICK_QUIZ_NOTIFICATION" \/>/);
  assert.match(manifest, /<category android:name="android\.intent\.category\.DEFAULT" \/>/);
  assert.match(manifest, /android:name="com\.google\.firebase\.messaging\.default_notification_channel_id"/);
  assert.match(manifest, /android:value="admin_alerts_high"/);
  assert.doesNotMatch(manifest, /REQUEST_INSTALL_PACKAGES/);
});

test('Cloud Functions send hybrid notification + android.notification + data payloads for closed-app delivery', () => {
  const fnCode = read('functions/index.js');

  // Verify onStudentCreated targets admin_students with new login title
  assert.match(fnCode, /exports\.onStudentCreated\s*=\s*onDocumentCreated/);
  assert.match(fnCode, /નવો વિદ્યાર્થી લૉગિન:/);
  assert.match(fnCode, /targetRoute:\s*"admin_students"/);

  // Verify onAdminNotificationCreated uses hybrid notification + android.notification + clickAction
  const adminNotifSection = fnCode.slice(
    fnCode.indexOf('exports.onAdminNotificationCreated'),
    fnCode.indexOf('exports.onAdminChatMessageCreated')
  );
  assert.match(adminNotifSection, /notification:\s*\{[\s\S]*?title,[\s\S]*?body,/);
  assert.match(adminNotifSection, /channelId:\s*"admin_alerts_high"/);
  assert.match(adminNotifSection, /notificationPriority:\s*"PRIORITY_MAX"/);
  assert.match(adminNotifSection, /clickAction:\s*"OPEN_QUICK_QUIZ_NOTIFICATION"/);
  assert.match(adminNotifSection, /type:\s*"admin_activity"/);
  assert.match(adminNotifSection, /targetRoute,/);
  assert.match(adminNotifSection, /referenceId,/);

  // Verify onAdminChatMessageCreated uses hybrid notification + android.notification + clickAction
  const adminChatSection = fnCode.slice(
    fnCode.indexOf('exports.onAdminChatMessageCreated'),
    fnCode.indexOf('exports.onAppReleaseCreated')
  );
  assert.match(adminChatSection, /notification:\s*\{[\s\S]*?title:\s*senderName,/);
  assert.match(adminChatSection, /channelId:\s*"admin_chat_messages"/);
  assert.match(adminChatSection, /clickAction:\s*"OPEN_QUICK_QUIZ_NOTIFICATION"/);
  assert.match(adminChatSection, /targetRoute:\s*"admin_chat"/);
});

test('NativeFirebaseBridge logs student notifications without failing ref.get() and re-syncs admin FCM token on permission grant', () => {
  const bridge = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/NativeFirebaseBridge.kt');

  const permIdx = bridge.indexOf('fun onNotificationPermissionResult(');
  const permSlice = bridge.slice(permIdx, permIdx + 600);
  assert.match(permSlice, /syncPublicDeviceFcmRegistration\(\)/);
  assert.match(permSlice, /syncCurrentAdminFcmTokenIfSignedIn\(\)/);

  const logIdx = bridge.indexOf('fun logAdminNotificationEvent(');
  const logSlice = bridge.slice(logIdx, logIdx + 1800);
  assert.doesNotMatch(logSlice, /ref\.get\(\)/);
  assert.match(logSlice, /ref\.set\(/);
});

test('AdminNotificationHelper extracts closed-app FCM extras including actorName, actorMobile, and targetRoute fallbacks', () => {
  const helper = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/AdminNotificationHelper.kt');
  assert.match(helper, /const val EXTRA_ACTOR_NAME = "extra_actor_name"/);
  assert.match(helper, /const val EXTRA_ACTOR_MOBILE = "extra_actor_mobile"/);
  assert.match(helper, /"registration",\s*"login",\s*"quiz_activity"\s*->\s*"admin_students"/);
  assert.match(helper, /"payment"\s*->\s*"admin_requests"/);
  assert.match(helper, /"code_redeem"\s*->\s*"admin_codes"/);
  assert.match(helper, /put\("actorName",\s*actorName\)/);
  assert.match(helper, /put\("actorMobile",\s*actorMobile\)/);
});

test('App.tsx and AdminTabs.tsx route cold-start Admin notifications directly to matching tab and highlight focused record', () => {
  const appTsx = read('src/App.tsx');
  assert.match(appTsx, /const \[focusedAdminTarget, setFocusedAdminTarget\]/);
  assert.match(appTsx, /const resolveAdminTabFromPayload/);
  assert.match(appTsx, /focusedTarget=\{focusedAdminTarget\}/);

  const adminTabs = read('src/screens/AdminTabs.tsx');
  assert.match(adminTabs, /data-testid="admin_focused_notification_banner"/);
  assert.match(adminTabs, /focused_student_card/);
  assert.match(adminTabs, /નોટિફિકેશનમાંથી ખુલ્યું/);
});
