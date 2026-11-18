const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
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
