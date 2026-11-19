const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("crypto");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

initializeApp();

const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  "ai-studio-android-10-d59bf62d-e241-4e4c-b4b1-c61279a58cd9";
const REGION = process.env.FUNCTION_REGION || "asia-south1";

const db = getFirestore(undefined, FIRESTORE_DATABASE_ID);
const messaging = getMessaging();

const CATEGORY_TO_PREF_KEY = {
  registration: "registrations",
  login: "logins",
  payment: "payments",
  code_redeem: "codeRedemptions",
  quiz_activity: "quizActivity",
  data_update: "dataUpdates",
  admin_chat: "adminChat",
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/mismatched-credential",
]);

function safeString(value, maxLen = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

/**
 * Creates a deterministic Admin notification document so client logs + server triggers
 * never generate duplicate notifications for the same activity.
 */
async function createDeterministicNotification(notifId, payload) {
  const cleanId = notifId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const now = FieldValue.serverTimestamp();
  try {
    await db.collection("admin_notifications").doc(cleanId).create({
      category: payload.category,
      title: safeString(payload.title, 120),
      body: safeString(payload.body, 400),
      actorName: safeString(payload.actorName, 80),
      actorMobile: safeString(payload.actorMobile, 15),
      actorId: safeString(payload.actorId, 128),
      targetRoute: payload.targetRoute || "admin_notifications",
      referenceId: safeString(payload.referenceId, 128),
      isRead: false,
      readBy: [],
      pushDispatched: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // Code 6 = ALREADY_EXISTS (created atomically by client or earlier invocation)
    if (err && (err.code === 6 || String(err.message || "").includes("ALREADY_EXISTS"))) {
      return;
    }
    throw err;
  }
}

async function pruneFailedTokens(tokenDocs, responses) {
  const deletions = [];
  responses.forEach((resp, idx) => {
    if (!resp.success && resp.error && INVALID_TOKEN_CODES.has(resp.error.code)) {
      const docRef = tokenDocs[idx]?.ref;
      if (docRef) {
        deletions.push(docRef.delete().catch(() => null));
      }
    }
  });
  if (deletions.length > 0) {
    await Promise.all(deletions);
  }
}

// 1. Student registration notification
exports.onStudentCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "students/{userId}",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const userId = event.params.userId;
    const name = safeString(data.fullName, 60) || "Student";
    const mobile = safeString(data.mobileNumber, 15);
    await createDeterministicNotification(`reg_${userId}`, {
      category: "registration",
      title: "નવું વિદ્યાર્થી રજિસ્ટ્રેશન",
      body: mobile
        ? `${name} (${mobile}) એ નવું એકાઉન્ટ બનાવ્યું.`
        : `${name} એ નવું એકાઉન્ટ બનાવ્યું.`,
      actorName: name,
      actorMobile: mobile,
      actorId: userId,
      targetRoute: "admin_students",
      referenceId: userId,
    });
  }
);

// 2. Payment request submitted
exports.onPaymentRequestCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "payment_requests/{requestId}",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const requestId = event.params.requestId;
    const name = safeString(data.studentName, 60) || "Student";
    const mobile = safeString(data.mobileNumber, 15);
    const amount = Number(data.amountRupees || 0);
    await createDeterministicNotification(`pay_${requestId}`, {
      category: "payment",
      title: `નવી પેમેન્ટ વિનંતી ₹${amount}`,
      body: `${name} (${mobile}) તરફથી ₹${amount} ની UPI ચકાસણી વિનંતી આવી છે.`,
      actorName: name,
      actorMobile: mobile,
      actorId: safeString(data.userId, 128),
      targetRoute: "admin_requests",
      referenceId: requestId,
    });
  }
);

// 3. Payment request status update
exports.onPaymentRequestUpdated = onDocumentUpdated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "payment_requests/{requestId}",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after || before.status === after.status) return;
    const requestId = event.params.requestId;
    const name = safeString(after.studentName, 60) || "Student";
    const mobile = safeString(after.mobileNumber, 15);
    const statusLabel = after.status === "approved" ? "મંજૂર" : "નામંજૂર";
    await createDeterministicNotification(`payupd_${requestId}_${after.status}`, {
      category: "data_update",
      title: `પેમેન્ટ ${statusLabel}`,
      body: `${name} (${mobile}) ની પેમેન્ટ વિનંતી ${statusLabel} કરવામાં આવી.`,
      actorName: name,
      actorMobile: mobile,
      actorId: safeString(after.userId, 128),
      targetRoute: "admin_requests",
      referenceId: requestId,
    });
  }
);

// 4. Access code redeemed
exports.onAccessCodeRedeemed = onDocumentUpdated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "access_codes/{codeId}",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.isUsed === true || after.isUsed !== true) return;
    const codeId = event.params.codeId;
    const name = safeString(after.usedByName || after.userName, 60) || "Student";
    const mobile = safeString(after.usedByMobile || after.mobileNumber, 15);
    await createDeterministicNotification(`redeem_${codeId}`, {
      category: "code_redeem",
      title: `કોડ રિડીમ થયો (${codeId})`,
      body: `${name}${mobile ? ` (${mobile})` : ""} એ કોડ ${codeId} અનલૉક કર્યો.`,
      actorName: name,
      actorMobile: mobile,
      actorId: safeString(after.usedByUserId, 128),
      targetRoute: "admin_codes",
      referenceId: codeId,
    });
  }
);

// 5. Quiz attempt completed
exports.onQuizAttemptCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "students/{userId}/quiz_attempts/{attemptId}",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const userId = event.params.userId;
    const attemptId = event.params.attemptId;
    const subjectTitle = safeString(data.subjectTitle, 50) || "ક્વિઝ";
    const percentage = Number(data.percentage || 0);
    await createDeterministicNotification(`quiz_${attemptId}`, {
      category: "quiz_activity",
      title: `નવું ક્વિઝ પરિણામ (${percentage}%)`,
      body: `${subjectTitle} — ${safeString(data.chapterTitle, 60)} (${data.score}/${data.totalQuestions})`,
      actorName: userId,
      actorMobile: "",
      actorId: userId,
      targetRoute: "admin_students",
      referenceId: attemptId,
    });
  }
);

// 6. App configuration updated
exports.onAppConfigWritten = onDocumentWritten(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "app_config/{configId}",
  },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return;
    const configId = event.params.configId;
    const version = Date.now();
    await createDeterministicNotification(`cfg_${configId}_${version}`, {
      category: "data_update",
      title: "એપ સેટિંગ્સ અપડેટ",
      body: `એપ કોન્ફિગ (${configId}) અપડેટ કરવામાં આવ્યું.`,
      actorName: "Admin",
      actorMobile: "",
      actorId: configId,
      targetRoute: "admin_updates",
      referenceId: configId,
    });
  }
);

// 7. Push Dispatcher for Admin Notification Center events
exports.onAdminNotificationCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "admin_notifications/{notifId}",
  },
  async (event) => {
    const snap = event.data;
    const data = snap?.data();
    if (!snap || !data || data.pushDispatched === true) return;

    const prefKey = CATEGORY_TO_PREF_KEY[data.category] || "dataUpdates";
    const [adminsSnap, tokensSnap] = await Promise.all([
      db.collection("admins").where("isActive", "==", true).get(),
      db.collection("admin_fcm_tokens").where("enabled", "==", true).get(),
    ]);

    const allowedAdminUids = new Set();
    adminsSnap.forEach((docSnap) => {
      const adminData = docSnap.data();
      const prefs = adminData.notificationPrefs || {};
      if (prefs[prefKey] !== false) {
        allowedAdminUids.add(docSnap.id);
      }
    });

    const targetTokenDocs = [];
    const tokens = [];
    tokensSnap.forEach((docSnap) => {
      const tokenData = docSnap.data();
      if (!tokenData.token) return;
      // Send if admin opted in or if admin directory hasn't been synced yet for that UID
      if (allowedAdminUids.size === 0 || allowedAdminUids.has(tokenData.adminUid)) {
        targetTokenDocs.push(docSnap);
        tokens.push(tokenData.token);
      }
    });

    if (tokens.length === 0) {
      await snap.ref.update({ pushDispatched: true, updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    const notifId = event.params.notifId;
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        type: "admin_activity",
        notifId,
        category: safeString(data.category, 40),
        title: safeString(data.title, 120),
        body: safeString(data.body, 400),
        actorName: safeString(data.actorName, 80),
        actorMobile: safeString(data.actorMobile, 15),
        targetRoute: safeString(data.targetRoute, 60) || "admin_notifications",
        referenceId: safeString(data.referenceId, 128),
        timestampMs: String(Date.now()),
      },
      android: {
        priority: "high",
        ttl: 3600 * 1000,
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          title: safeString(data.title, 120),
          body: safeString(data.body, 400),
        },
      },
    });

    logger.info("Dispatched admin notification push", {
      notifId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    await pruneFailedTokens(targetTokenDocs, response.responses);
    await snap.ref.update({ pushDispatched: true, updatedAt: FieldValue.serverTimestamp() });
  }
);

// 8. Push Dispatcher + Delivered Status for 1-to-1 Admin Personal Chat Messages
exports.onAdminChatMessageCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "admin_chats/{chatId}/messages/{messageId}",
  },
  async (event) => {
    const snap = event.data;
    const msg = snap?.data();
    if (!snap || !msg || !msg.recipientUid) return;

    const { chatId, messageId } = event.params;
    const [recipientAdminDoc, recipientTokensSnap] = await Promise.all([
      db.collection("admins").doc(msg.recipientUid).get(),
      db
        .collection("admin_fcm_tokens")
        .where("adminUid", "==", msg.recipientUid)
        .where("enabled", "==", true)
        .get(),
    ]);

    const recipientAdmin = recipientAdminDoc.exists ? recipientAdminDoc.data() : null;
    if (recipientAdmin && recipientAdmin.isActive === false) return;
    if (recipientAdmin && recipientAdmin.notificationPrefs && recipientAdmin.notificationPrefs.adminChat === false) {
      return;
    }

    const tokenDocs = [];
    const tokens = [];
    recipientTokensSnap.forEach((docSnap) => {
      const t = docSnap.data()?.token;
      if (t) {
        tokenDocs.push(docSnap);
        tokens.push(t);
      }
    });

    if (tokens.length === 0) return;

    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        type: "admin_chat",
        chatId,
        messageId,
        senderUid: safeString(msg.senderUid, 128),
        senderName: safeString(msg.senderName, 80) || "Admin",
        senderPhotoUrl: safeString(msg.senderPhotoUrl, 500),
        text: safeString(msg.text, 500),
        targetRoute: "admin_chat",
        timestampMs: String(Date.now()),
      },
      android: {
        priority: "high",
        ttl: 86400 * 1000,
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          title: safeString(msg.senderName, 80) || "Admin Message",
          body: safeString(msg.text, 400),
        },
      },
    });

    await pruneFailedTokens(tokenDocs, response.responses);

    if (response.successCount > 0 && msg.status === "sent") {
      const now = FieldValue.serverTimestamp();
      await Promise.all([
        snap.ref.update({
          status: "delivered",
          deliveredAt: now,
          updatedAt: now,
        }),
        db.collection("admin_chats").doc(chatId).update({
          lastMessageStatus: "delivered",
          updatedAt: now,
        }).catch(() => null),
      ]);
    }
  }
);

// 9. App Update Push Broadcaster (notifies ALL registered devices & logs notification history)
exports.onAppReleaseCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "app_releases/{releaseId}",
  },
  async (event) => {
    const release = event.data?.data();
    if (!release) return;
    const releaseId = event.params.releaseId;

    const appName = "Quick Quiz";
    const versionName = safeString(release.versionName, 32) || "1.0.1";
    const versionCode = Number(release.versionCode || 1);
    const isMandatory = release.isMandatory === true;
    const updateTitle =
      safeString(release.updateTitle, 120) ||
      `${appName} v${versionName} ${isMandatory ? "(જરૂરી અપડેટ)" : "નવું અપડેટ"}`;
    const body =
      safeString(release.releaseNotes, 400) ||
      `નવું વર્ઝન v${versionName} ઉપલબ્ધ છે. એપની અંદરથી તરત અપડેટ કરો.`;
    const apkDownloadUrl = safeString(release.apkDownloadUrl, 2000);
    const apkSha256 = safeString(release.apkSha256, 64);
    const signingCertSha256 = safeString(release.signingCertSha256, 64);
    const packageName = safeString(release.packageName, 120) || "com.aistudio.std10quiz.kqxmtv";
    const dedupeTag = `appupd_${releaseId}`;

    const dataPayload = {
      type: "app_update",
      releaseId,
      appName,
      versionName,
      versionCode: String(versionCode),
      title: updateTitle,
      body,
      isMandatory: isMandatory ? "true" : "false",
      apkDownloadUrl,
      apkSha256,
      signingCertSha256,
      packageName,
      targetRoute: "app_update",
      referenceId: releaseId,
      timestampMs: String(Date.now()),
    };

    const androidPayload = {
      priority: "high",
      ttl: 86400 * 7 * 1000,
      collapseKey: dedupeTag,
      notification: {
        title: `${appName} • ${updateTitle}`,
        body,
        channelId: "app_updates_high",
        sound: "default",
        defaultSound: true,
        defaultVibrateTimings: true,
        notificationPriority: "PRIORITY_MAX",
        visibility: "PUBLIC",
        tag: dedupeTag,
        clickAction: "OPEN_QUICK_QUIZ_NOTIFICATION",
      },
    };

    const webpushPayload = {
      headers: { Urgency: "high" },
      notification: {
        title: `${appName} • ${updateTitle}`,
        body,
        icon: "/images/ic_app_logo_192.png",
        badge: "/images/ic_app_logo_192.png",
        tag: dedupeTag,
        renotify: false,
        vibrate: [220, 110, 220],
        data: {
          type: "app_update",
          targetRoute: "app_update",
          releaseId,
          url: `/?pushRoute=app_update&releaseId=${encodeURIComponent(releaseId)}`,
        },
      },
      fcmOptions: {
        link: `/?pushRoute=app_update&releaseId=${encodeURIComponent(releaseId)}`,
      },
    };

    // Dispatch directly to all opted-in (permission-granted) device tokens in chunks of 450
    let tokenSuccessCount = 0;
    try {
      const deviceTokensSnap = await db
        .collection("device_fcm_tokens")
        .where("enabled", "==", true)
        .get();

      const targetDocs = [];
      const tokens = [];
      const seenTokens = new Set();
      deviceTokensSnap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d || !d.token || seenTokens.has(d.token)) return;
        seenTokens.add(d.token);
        targetDocs.push(docSnap);
        tokens.push(d.token);
      });

      for (let i = 0; i < tokens.length; i += 450) {
        const chunkTokens = tokens.slice(i, i + 450);
        const chunkDocs = targetDocs.slice(i, i + 450);
        const resp = await messaging.sendEachForMulticast({
          tokens: chunkTokens,
          notification: {
            title: `${appName} • ${updateTitle}`,
            body,
          },
          data: dataPayload,
          android: androidPayload,
          webpush: webpushPayload,
        });
        tokenSuccessCount += resp.successCount;
        await pruneFailedTokens(chunkDocs, resp.responses);
      }
    } catch (err) {
      logger.warn("Direct device token fan-out failed", err);
    }

    // Store / update deterministic user-facing notification history record
    const now = FieldValue.serverTimestamp();
    await db
      .collection("update_notifications")
      .doc(releaseId)
      .set(
        {
          releaseId,
          appName,
          versionName,
          versionCode,
          title: updateTitle,
          body,
          isMandatory,
          apkDownloadUrl,
          targetRoute: "app_update",
          pushDispatched: true,
          recipientCount: tokenSuccessCount,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

    await createDeterministicNotification(`appupd_${releaseId}`, {
      category: "data_update",
      title: `નવું એપ અપડેટ v${versionName} પબ્લિશ થયું`,
      body: `${updateTitle} (${isMandatory ? "Mandatory" : "Optional"}) — ${tokenSuccessCount} ડિવાઇસને નોટિફિકેશન મોકલાયું.`,
      actorName: "Admin",
      actorMobile: "",
      actorId: safeString(release.publishedByUid, 128),
      targetRoute: "admin_updates",
      referenceId: releaseId,
    });
  }
);

// 10. GitHub CI Main-Branch Push Webhook -> automatically registers release & broadcasts closed-app FCM push
exports.onGitHubReleasePush = onRequest(
  {
    region: REGION,
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const configuredSecret = (process.env.GITHUB_RELEASE_WEBHOOK_SECRET || "").trim();
    if (!configuredSecret) {
      res.status(503).json({ error: "GITHUB_RELEASE_WEBHOOK_SECRET is not configured" });
      return;
    }

    const authHeader = String(req.headers.authorization || "");
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const providedBuf = Buffer.from(bearerToken, "utf8");
    const expectedBuf = Buffer.from(configuredSecret, "utf8");
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const versionName = safeString(body.versionName, 32);
    const versionCode = Number(body.versionCode || 0);
    const apkDownloadUrl = safeString(body.apkDownloadUrl, 2000);
    if (!versionName || !Number.isFinite(versionCode) || versionCode < 1 || !apkDownloadUrl.startsWith("https://")) {
      res.status(400).json({ error: "Invalid release payload" });
      return;
    }

    const releaseTitle = safeString(body.releaseTitle || `Quick Quiz v${versionName}`, 120);
    const releaseNotes = safeString(body.releaseNotes, 1000) || `નવું વર્ઝન v${versionName} ઉપલબ્ધ છે.`;
    const apkFileName = safeString(body.apkFileName || "Std10-Quiz.apk", 160);
    const apkSizeBytes = Math.max(1, Math.min(262144000, Number(body.apkSizeBytes || 0)));
    const apkSha256 = safeString(body.apkSha256, 64);
    const signingCertSha256 = safeString(body.signingCertSha256, 64);
    const packageName = safeString(body.packageName || "com.aistudio.std10quiz.kqxmtv", 120);
    const githubOwnerRepo = safeString(body.githubOwnerRepo, 120);
    const isMandatory = body.isMandatory === true;
    const releaseId = `gh_${versionCode}_${safeString(String(body.commitSha || Date.now()), 12)}`;
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.set(
      db.collection("app_releases").doc(releaseId),
      {
        versionName,
        versionCode,
        updateTitle: releaseTitle,
        releaseNotes,
        apkDownloadUrl,
        apkStoragePath: `github_releases/${releaseId}/${apkFileName}`,
        apkFileName,
        apkSizeBytes,
        apkSha256,
        signingCertSha256,
        packageName,
        isMandatory,
        publishedByUid: "github_actions_ci",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      db.collection("app_config").doc("release"),
      {
        githubOwnerRepo,
        releaseNotes,
        latestVersionName: versionName,
        latestVersionCode: versionCode,
        updateTitle: releaseTitle,
        apkDownloadUrl,
        apkStoragePath: `github_releases/${releaseId}/${apkFileName}`,
        apkFileName,
        apkSizeBytes,
        apkSha256,
        signingCertSha256,
        packageName,
        isMandatory,
        publishedByUid: "github_actions_ci",
        publishedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    await batch.commit();

    res.status(200).json({ ok: true, releaseId, versionName, versionCode });
  }
);

// 11. Real-Time Push Broadcast Dispatcher (Admin Messages, Exam Notices, App Update Alerts)
// Sends WhatsApp-style high-priority FCM notifications to ALL opted-in user devices
// across Foreground, Background, and Completely Closed (Terminated) states.
exports.onPushBroadcastCreated = onDocumentCreated(
  {
    region: REGION,
    database: FIRESTORE_DATABASE_ID,
    document: "push_broadcasts/{broadcastId}",
  },
  async (event) => {
    const snap = event.data;
    const data = snap?.data();
    if (!snap || !data || data.pushDispatched === true) return;

    const broadcastId = event.params.broadcastId;
    const appName = "Quick Quiz";
    const category = safeString(data.category, 40) || "admin_message";
    const title = safeString(data.title, 120) || appName;
    const body = safeString(data.body, 600);
    const targetRoute = safeString(data.targetRoute, 60) || (category === "app_update" ? "app_update" : "home");
    const referenceId = safeString(data.referenceId, 128) || broadcastId;
    if (!body) return;

    const dedupeTag = `broadcast_${broadcastId}`;
    const channelId = category === "app_update" ? "app_updates_high" : "quick_quiz_push_high";
    const categoryPrefix =
      category === "exam_notice"
        ? "પરીક્ષા સૂચના"
        : category === "app_update"
          ? "નવું અપડેટ"
          : appName;
    const displayTitle = title.includes(appName) ? title : `${categoryPrefix} • ${title}`;
    const deepLinkUrl = `/?pushRoute=${encodeURIComponent(targetRoute)}&broadcastId=${encodeURIComponent(broadcastId)}`;

    const deviceTokensSnap = await db
      .collection("device_fcm_tokens")
      .where("enabled", "==", true)
      .get();

    const targetDocs = [];
    const tokens = [];
    const seenTokens = new Set();
    deviceTokensSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (!d || !d.token || seenTokens.has(d.token)) return;
      seenTokens.add(d.token);
      targetDocs.push(docSnap);
      tokens.push(d.token);
    });

    let successCount = 0;
    for (let i = 0; i < tokens.length; i += 450) {
      const chunkTokens = tokens.slice(i, i + 450);
      const chunkDocs = targetDocs.slice(i, i + 450);
      const resp = await messaging.sendEachForMulticast({
        tokens: chunkTokens,
        notification: {
          title: displayTitle,
          body,
        },
        data: {
          type: "push_broadcast",
          broadcastId,
          category,
          title,
          body,
          targetRoute,
          referenceId,
          appName,
          timestampMs: String(Date.now()),
        },
        android: {
          priority: "high",
          ttl: 86400 * 3 * 1000,
          collapseKey: dedupeTag,
          notification: {
            title: displayTitle,
            body,
            channelId,
            sound: "default",
            defaultSound: true,
            defaultVibrateTimings: true,
            notificationPriority: "PRIORITY_MAX",
            visibility: "PUBLIC",
            tag: dedupeTag,
            clickAction: "OPEN_QUICK_QUIZ_NOTIFICATION",
          },
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
          notification: {
            title: displayTitle,
            body,
            icon: "/images/ic_app_logo_192.png",
            badge: "/images/ic_app_logo_192.png",
            tag: dedupeTag,
            renotify: false,
            vibrate: [220, 110, 220],
            data: {
              type: "push_broadcast",
              broadcastId,
              category,
              targetRoute,
              referenceId,
              url: deepLinkUrl,
            },
          },
          fcmOptions: {
            link: deepLinkUrl,
          },
        },
      });
      successCount += resp.successCount;
      await pruneFailedTokens(chunkDocs, resp.responses);
    }

    logger.info("Dispatched public push broadcast", {
      broadcastId,
      category,
      targetRoute,
      totalOptedInTokens: tokens.length,
      successCount,
    });

    await snap.ref.update({
      pushDispatched: true,
      recipientCount: successCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
);

// 12. Authenticated Admin HTTPS Endpoint to trigger a real-time push broadcast directly
exports.sendAdminPushNotification = onRequest(
  {
    region: REGION,
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const authHeader = String(req.headers.authorization || "");
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!idToken) {
      res.status(401).json({ error: "Missing Firebase ID token" });
      return;
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(idToken);
    } catch {
      res.status(401).json({ error: "Invalid Firebase ID token" });
      return;
    }

    const email = String(decoded.email || "").toLowerCase();
    const isSuper =
      decoded.phone_number === "+919099592283" ||
      email === "admin9099592283@std10quiz.app" ||
      (email === "omsai3248@gmail.com" && decoded.email_verified === true);
    let isAuthorizedAdmin = isSuper;
    if (!isAuthorizedAdmin) {
      const [adminDoc, inviteDoc] = await Promise.all([
        db.collection("admins").doc(decoded.uid).get(),
        email && decoded.email_verified === true
          ? db.collection("admin_invites").doc(email).get()
          : Promise.resolve({ exists: false }),
      ]);
      isAuthorizedAdmin = adminDoc.exists || inviteDoc.exists;
    }

    if (!isAuthorizedAdmin) {
      res.status(403).json({ error: "Admin authorization required" });
      return;
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const rawCategory = safeString(payload.category, 40);
    const category = ["admin_message", "exam_notice", "app_update"].includes(rawCategory)
      ? rawCategory
      : "admin_message";
    const title = safeString(payload.title, 120);
    const body = safeString(payload.body, 600);
    if (!title || !body) {
      res.status(400).json({ error: "title and body are required" });
      return;
    }
    const rawRoute = safeString(payload.targetRoute, 60);
    const allowedRoutes = [
      "home",
      "mock_test",
      "app_update",
      "subject_maths",
      "subject_science",
      "subject_social_science",
    ];
    const targetRoute = allowedRoutes.includes(rawRoute) ? rawRoute : "home";
    const referenceId = safeString(payload.referenceId, 128);
    const broadcastId = `bcast_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const now = FieldValue.serverTimestamp();

    await db.collection("push_broadcasts").doc(broadcastId).set({
      category,
      title,
      body,
      targetRoute,
      referenceId,
      senderUid: decoded.uid,
      senderName: safeString(decoded.name || email.split("@")[0] || "Quick Quiz Admin", 80),
      pushDispatched: false,
      recipientCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    res.status(200).json({ ok: true, broadcastId });
  }
);
