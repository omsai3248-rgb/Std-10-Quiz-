import { createRequire } from "node:module";
import { test, before, after, beforeEach } from "node:test";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = (() => {
  try {
    return require("@firebase/rules-unit-testing");
  } catch {
    return require("/usr/local/lib/node_modules/@firebase/rules-unit-testing");
  }
})();

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_uid_101";
const BOB_UID = "bob_uid_202";
const ADMIN_UID = "admin_phone_uid";
const ADMIN_PHONE = "+919099592283";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function makePaymentPayload(uid, utr = "UTR123456789", overrides = {}) {
  const now = new Date();
  return {
    userId: uid,
    studentName: "Aarav Patel",
    mobileNumber: "9876543210",
    amountRupees: 24,
    upiId: "9099592283@upi",
    upiTransactionRef: utr,
    utrNormalized: utr.trim().toUpperCase(),
    screenshotUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/proof.jpg",
    screenshotPath: `payment_screenshots/${uid}/pay_1.jpg`,
    screenshotBase64: "",
    status: "pending",
    assignedCode: "",
    adminNote: "",
    subjectId: "all",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCodePayload(code, overrides = {}) {
  const now = new Date();
  return {
    code,
    requestId: "pay_1",
    userName: "Aarav Patel",
    mobileNumber: "9876543210",
    amountRupees: 24,
    batchName: "All Subjects • ₹24",
    status: "unused",
    isUsed: false,
    usedAt: null,
    usedBy: null,
    usedByUserId: "",
    usedByMobile: "",
    usedByName: "",
    source: "upi_payment",
    subjectId: "all",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user cannot list any collection or read non-UUID/student/used docs", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("payment_requests").get());
  await assertFails(unauthDb.collection("payment_requests").doc("pay_1").get());
  await assertFails(unauthDb.collection("access_codes").get());
  await assertFails(unauthDb.collection("utr_locks").get());
  await assertFails(unauthDb.collection("students").get());
  await assertFails(unauthDb.collection("students").doc("some_uid").get());
});

test("Public visitor (without Anonymous Auth) can submit payment with cryptographic UUIDs and redeem unused code once", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const pubUid = "pub_0123456789abcdef0123456789abcdef";
  const payId = "pay_fedcba9876543210fedcba9876543210";
  const utr = "UTR77665544";
  const now = new Date();

  const batch = unauthDb.batch();
  batch.set(unauthDb.collection("utr_locks").doc(utr), {
    utrNormalized: utr,
    requestId: payId,
    createdAt: now,
  });
  batch.set(
    unauthDb.collection("payment_requests").doc(payId),
    makePaymentPayload(pubUid, utr, { createdAt: now, updatedAt: now })
  );
  await assertSucceeds(batch.commit());
  await assertSucceeds(unauthDb.collection("payment_requests").doc(payId).get());

  // Unauthenticated visitor CANNOT approve their own payment
  await assertFails(
    unauthDb.collection("payment_requests").doc(payId).update({
      status: "approved",
      assignedCode: "K7M9P2X4",
      updatedAt: new Date(),
    })
  );

  // Unauthenticated visitor CAN redeem an unused code once using pub_ UUID
  const code = "P9Q8R7S6";
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("access_codes").doc(code).set(makeCodePayload(code));
  });
  await assertSucceeds(
    unauthDb.collection("access_codes").doc(code).update({
      status: "used",
      isUsed: true,
      usedAt: now,
      usedBy: {
        uid: pubUid,
        name: "Public Student",
        mobile: "9876543210",
        deviceInfo: "Android WebView",
      },
      usedByUserId: pubUid,
      usedByName: "Public Student",
      usedByMobile: "9876543210",
      updatedAt: now,
    })
  );
  // Already-used code cannot be read or reused unauthenticated
  await assertFails(unauthDb.collection("access_codes").doc(code).get());
});

test("Public user (anonymous/signed-in) can create payment_requests atomically with utr_locks and read only their own", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const now = new Date();
  const utr = "UTR99887766";

  const batch = aliceDb.batch();
  batch.set(aliceDb.collection("utr_locks").doc(utr), {
    utrNormalized: utr,
    requestId: "pay_alice_1",
    createdAt: now,
  });
  batch.set(
    aliceDb.collection("payment_requests").doc("pay_alice_1"),
    makePaymentPayload(ALICE_UID, utr, { createdAt: now, updatedAt: now })
  );
  await assertSucceeds(batch.commit());

  // Reading own request succeeds
  await assertSucceeds(aliceDb.collection("payment_requests").doc("pay_alice_1").get());
  await assertSucceeds(
    aliceDb.collection("payment_requests").where("userId", "==", ALICE_UID).get()
  );

  // Another user Bob CANNOT read Alice's payment request
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(bobDb.collection("payment_requests").doc("pay_alice_1").get());
  await assertFails(bobDb.collection("payment_requests").get());
});

test("Duplicate UTR ID is rejected by Firestore rules", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const now = new Date();
  const utr = "UTR55551111";

  const batch1 = aliceDb.batch();
  batch1.set(aliceDb.collection("utr_locks").doc(utr), {
    utrNormalized: utr,
    requestId: "pay_a1",
    createdAt: now,
  });
  batch1.set(
    aliceDb.collection("payment_requests").doc("pay_a1"),
    makePaymentPayload(ALICE_UID, utr, { createdAt: now, updatedAt: now })
  );
  await assertSucceeds(batch1.commit());

  // Bob attempts to reuse same UTR -> must fail
  const batch2 = bobDb.batch();
  batch2.set(bobDb.collection("utr_locks").doc(utr), {
    utrNormalized: utr,
    requestId: "pay_b1",
    createdAt: now,
  });
  batch2.set(
    bobDb.collection("payment_requests").doc("pay_b1"),
    makePaymentPayload(BOB_UID, utr, { createdAt: now, updatedAt: now })
  );
  await assertFails(batch2.commit());
});

test("Only authorized admin (+919099592283, admin9099592283@std10quiz.app, or verified omsai3248@gmail.com) is admin", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("payment_requests").doc("pay_1").set(makePaymentPayload(ALICE_UID));
  });

  const wrongPhoneDb = testEnv.authenticatedContext("other_phone", {
    phone_number: "+919876543210",
  }).firestore();
  const wrongEmailDb = testEnv.authenticatedContext("other_email", {
    email: "random_user@gmail.com",
    email_verified: true,
  }).firestore();
  const unverifiedOwnerDb = testEnv.authenticatedContext("unverified_owner", {
    email: "omsai3248@gmail.com",
    email_verified: false,
  }).firestore();

  await assertFails(wrongPhoneDb.collection("payment_requests").get());
  await assertFails(wrongEmailDb.collection("payment_requests").get());
  await assertFails(unverifiedOwnerDb.collection("payment_requests").get());
  await assertFails(
    wrongPhoneDb.collection("access_codes").doc("K7M9P2X4").set(makeCodePayload("K7M9P2X4"))
  );
  await assertFails(
    wrongEmailDb.collection("access_codes").doc("K7M9P2X4").set(makeCodePayload("K7M9P2X4"))
  );

  // Admin (+919099592283 phone, admin9099592283@std10quiz.app, or verified omsai3248@gmail.com) succeeds
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  await assertSucceeds(adminDb.collection("payment_requests").get());

  const adminEmailDb = testEnv.authenticatedContext("admin_email_uid", {
    email: "admin9099592283@std10quiz.app",
  }).firestore();
  await assertSucceeds(adminEmailDb.collection("payment_requests").get());

  const verifiedOwnerDb = testEnv.authenticatedContext("owner_google_uid", {
    email: "omsai3248@gmail.com",
    email_verified: true,
  }).firestore();
  await assertSucceeds(verifiedOwnerDb.collection("payment_requests").get());
});

test("Admin (+919099592283) can approve payment + create 8-char code, and only admin can delete requests/locks/codes/students", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("utr_locks").doc("UTR123456789").set({
      utrNormalized: "UTR123456789",
      requestId: "pay_1",
      createdAt: new Date(),
    });
    await db.collection("payment_requests").doc("pay_1").set(makePaymentPayload(ALICE_UID));
    await db.collection("students").doc("mob_9876543210").set({
      userId: "mob_9876543210",
      fullName: "Aarav Patel",
      mobileNumber: "9876543210",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      paymentRequestIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const now = new Date();
  const code = "K7M9P2X4";

  const batch = adminDb.batch();
  batch.set(
    adminDb.collection("access_codes").doc(code),
    makeCodePayload(code, { requestId: "pay_1", createdAt: now, updatedAt: now })
  );
  batch.update(adminDb.collection("payment_requests").doc("pay_1"), {
    status: "approved",
    assignedCode: code,
    adminNote: "Approved",
    updatedAt: now,
  });
  await assertSucceeds(batch.commit());

  // Non-admin & unauthenticated CANNOT delete codes, payment requests, UTR locks, or students
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(aliceDb.collection("access_codes").doc(code).delete());
  await assertFails(unauthDb.collection("access_codes").doc(code).delete());
  await assertFails(aliceDb.collection("payment_requests").doc("pay_1").delete());
  await assertFails(aliceDb.collection("utr_locks").doc("UTR123456789").delete());
  await assertFails(aliceDb.collection("students").doc("mob_9876543210").delete());

  // Admin CAN delete access codes, payment requests + UTR lock, and students
  await assertSucceeds(adminDb.collection("access_codes").doc(code).delete());
  const delReqBatch = adminDb.batch();
  delReqBatch.delete(adminDb.collection("payment_requests").doc("pay_1"));
  delReqBatch.delete(adminDb.collection("utr_locks").doc("UTR123456789"));
  await assertSucceeds(delReqBatch.commit());
  await assertSucceeds(adminDb.collection("students").doc("mob_9876543210").delete());
});

test("Public user can redeem an unused code once with usedBy + deviceInfo, and reuse is strictly blocked", async () => {
  const code = "W4R8T2Y6";
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("access_codes").doc(code).set(makeCodePayload(code));
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  // Public user cannot list all codes
  await assertFails(aliceDb.collection("access_codes").get());
  // Public user can read unused code
  await assertSucceeds(aliceDb.collection("access_codes").doc(code).get());

  // Atomic one-time redemption succeeds
  const now = new Date();
  await assertSucceeds(
    aliceDb.collection("access_codes").doc(code).update({
      status: "used",
      isUsed: true,
      usedAt: now,
      usedBy: {
        uid: ALICE_UID,
        name: "Aarav Patel",
        mobile: "9876543210",
        deviceInfo: "Chrome • Android • 390x844",
      },
      usedByUserId: ALICE_UID,
      usedByName: "Aarav Patel",
      usedByMobile: "9876543210",
      updatedAt: now,
    })
  );

  // Another user Bob cannot read or reuse Alice's already-used code
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(bobDb.collection("access_codes").doc(code).get());
  await assertFails(
    bobDb.collection("access_codes").doc(code).update({
      status: "used",
      isUsed: true,
      usedAt: new Date(),
      usedBy: {
        uid: BOB_UID,
        name: "Bob",
        mobile: "9123456789",
        deviceInfo: "Firefox • Windows",
      },
      usedByUserId: BOB_UID,
      usedByName: "Bob",
      usedByMobile: "9123456789",
      updatedAt: new Date(),
    })
  );
});

test("Mobile student (mob_9876543210) persists profile, links paymentRequestIds, unlocks only via valid transaction, and saves quiz attempts", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const studentId = "mob_9876543210";
  const now = new Date();

  // Cannot create profile with pre-unlocked quiz access or reserved admin number
  await assertFails(
    unauthDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Hacker",
      mobileNumber: "9876543210",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: true,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: ["all"],
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(
    unauthDb.collection("students").doc("mob_9099592283").set({
      userId: "mob_9099592283",
      fullName: "Fake Admin",
      mobileNumber: "9099592283",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Valid initial locked student profile creation succeeds
  await assertSucceeds(
    unauthDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Aarav Patel",
      mobileNumber: "9876543210",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      paymentRequestIds: [],
      createdAt: now,
      updatedAt: now,
    })
  );

  // Cannot record quiz attempt before subject is unlocked
  await assertFails(
    unauthDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_1").set({
      userId: studentId,
      subjectId: "maths",
      subjectTitle: "ગણિત",
      chapterTitle: "Ch 1",
      score: 8,
      totalQuestions: 10,
      percentage: 80,
      timeTakenSeconds: 45,
      createdAt: now,
    })
  );

  // Cannot self-unlock without redeeming a real unused access_code in the same transaction
  await assertFails(
    unauthDb.collection("students").doc(studentId).update({
      hasQuizAccess: true,
      redeemedCode: "FAKECODE",
      unlockedSubjects: ["all"],
      updatedAt: now,
    })
  );

  // Seed unused code & redeem atomically + update student profile in same transaction/batch
  const code = "M7N8P9Q2";
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("access_codes").doc(code).set(
      makeCodePayload(code, { subjectId: "maths", amountRupees: 24 })
    );
  });

  const redeemBatch = unauthDb.batch();
  redeemBatch.update(unauthDb.collection("access_codes").doc(code), {
    status: "used",
    isUsed: true,
    usedAt: now,
    usedBy: {
      uid: studentId,
      name: "Aarav Patel",
      mobile: "9876543210",
      deviceInfo: "Android App",
    },
    usedByUserId: studentId,
    usedByName: "Aarav Patel",
    usedByMobile: "9876543210",
    updatedAt: now,
  });
  redeemBatch.update(unauthDb.collection("students").doc(studentId), {
    hasQuizAccess: false,
    redeemedCode: code,
    unlockedSubjects: ["maths"],
    updatedAt: now,
  });
  await assertSucceeds(redeemBatch.commit());

  // Now student CAN record a quiz attempt for unlocked subject 'maths', but NOT locked 'science'
  const attBatch = unauthDb.batch();
  attBatch.set(unauthDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_1"), {
    userId: studentId,
    subjectId: "maths",
    subjectTitle: "ગણિત",
    chapterTitle: "Ch 1",
    score: 9,
    totalQuestions: 10,
    percentage: 90,
    timeTakenSeconds: 42,
    createdAt: now,
  });
  attBatch.update(unauthDb.collection("students").doc(studentId), {
    totalQuizzesTaken: 1,
    bestScorePercent: 90,
    updatedAt: now,
  });
  await assertSucceeds(attBatch.commit());

  await assertFails(
    unauthDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_2").set({
      userId: studentId,
      subjectId: "science",
      subjectTitle: "વિજ્ઞાન",
      chapterTitle: "Ch 1",
      score: 5,
      totalQuestions: 10,
      percentage: 50,
      timeTakenSeconds: 30,
      createdAt: now,
    })
  );
});

test("New device login takes over single-device session (forcing old device auto-logout) while admin_sessions is strictly admin-only", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const studentId = "mob_9998668886";
  const now = new Date();

  // Device 1 creates & claims session
  await assertSucceeds(
    unauthDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Gguu",
      mobileNumber: "9998668886",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      paymentRequestIds: [],
      activeDeviceId: "and_device_one",
      activeDeviceName: "Samsung Galaxy A54",
      createdAt: now,
      updatedAt: now,
    })
  );

  // Device 2 logs in with the SAME mobile -> SUCCEEDS and takes over activeDeviceId (kicking Device 1 out)
  await assertSucceeds(
    unauthDb.collection("students").doc(studentId).update({
      fullName: "Gguu",
      activeDeviceId: "and_device_two",
      activeDeviceName: "Pixel 8",
      updatedAt: now,
    })
  );

  // Device takeover still cannot forge hasQuizAccess or unlockedSubjects
  await assertFails(
    unauthDb.collection("students").doc(studentId).update({
      fullName: "Gguu",
      activeDeviceId: "and_device_three",
      activeDeviceName: "Pixel 9",
      hasQuizAccess: true,
      updatedAt: now,
    })
  );

  // Admin can force-unlock Device 2
  await assertSucceeds(
    adminDb.collection("students").doc(studentId).update({
      activeDeviceId: "",
      activeDeviceName: "",
      updatedAt: now,
    })
  );

  // Device 1 can log in again after Admin unlock or takeover
  await assertSucceeds(
    unauthDb.collection("students").doc(studentId).update({
      fullName: "Gguu",
      activeDeviceId: "and_device_one",
      activeDeviceName: "Samsung Galaxy A54",
      updatedAt: now,
    })
  );

  // Admin single-device session document is writable/readable ONLY by Admin
  await assertFails(
    unauthDb.collection("admin_sessions").doc("primary").set({
      activeDeviceId: "evil_dev",
      activeDeviceName: "Evil",
      updatedAt: now,
    })
  );
  await assertFails(
    aliceDb.collection("admin_sessions").doc("primary").get()
  );
  await assertSucceeds(
    adminDb.collection("admin_sessions").doc("primary").set({
      activeDeviceId: "admin_dev_one",
      activeDeviceName: "Admin Phone 1",
      updatedAt: now,
    })
  );
  await assertSucceeds(
    adminDb.collection("admin_sessions").doc("primary").set({
      activeDeviceId: "admin_dev_two",
      activeDeviceName: "Admin Phone 2",
      updatedAt: now,
    })
  );
  await assertFails(
    adminDb.collection("admin_sessions").doc("primary").delete()
  );
});

function makeDefaultNotifPrefs(overrides = {}) {
  return {
    registrations: true,
    logins: true,
    payments: true,
    codeRedemptions: true,
    quizActivity: true,
    dataUpdates: true,
    adminChat: true,
    ...overrides,
  };
}

test("Multi-admin invites & /admins directory: Super Admin invites verified second admin; unverified email_verified=false is rejected", async () => {
  const superAdminDb = testEnv.authenticatedContext("super_admin_uid", {
    email: "omsai3248@gmail.com",
    email_verified: true,
  }).firestore();

  const secondAdminEmail = "co.admin@example.com";
  const secondAdminUid = "co_admin_uid_2";
  const thirdUserDb = testEnv.authenticatedContext("random_uid", {
    email: "random@example.com",
    email_verified: true,
  }).firestore();
  const unverifiedInvitedDb = testEnv.authenticatedContext("spoof_uid", {
    email: secondAdminEmail,
    email_verified: false,
  }).firestore();
  const now = new Date();

  // Random user cannot create invites
  await assertFails(
    thirdUserDb.collection("admin_invites").doc(secondAdminEmail).set({
      email: secondAdminEmail,
      displayName: "Co Admin",
      addedByUid: "random_uid",
      createdAt: now,
    })
  );

  // Super Admin creates invite for co.admin@example.com
  await assertSucceeds(
    superAdminDb.collection("admin_invites").doc(secondAdminEmail).set({
      email: secondAdminEmail,
      displayName: "Co Admin",
      addedByUid: "super_admin_uid",
      createdAt: now,
    })
  );

  // Unverified spoof attempt is rejected
  await assertFails(unverifiedInvitedDb.collection("admin_notifications").get());
  await assertFails(
    unverifiedInvitedDb.collection("admins").doc("spoof_uid").set({
      uid: "spoof_uid",
      email: secondAdminEmail,
      displayName: "Spoof",
      photoUrl: "",
      role: "admin",
      isActive: true,
      notificationPrefs: makeDefaultNotifPrefs(),
      createdAt: now,
      updatedAt: now,
    })
  );

  // Verified invited Admin creates their /admins profile (cannot self-promote to super_admin)
  const secondAdminDb = testEnv.authenticatedContext(secondAdminUid, {
    email: secondAdminEmail,
    email_verified: true,
  }).firestore();

  await assertFails(
    secondAdminDb.collection("admins").doc(secondAdminUid).set({
      uid: secondAdminUid,
      email: secondAdminEmail,
      displayName: "Co Admin",
      photoUrl: "",
      role: "super_admin",
      isActive: true,
      notificationPrefs: makeDefaultNotifPrefs(),
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    secondAdminDb.collection("admins").doc(secondAdminUid).set({
      uid: secondAdminUid,
      email: secondAdminEmail,
      displayName: "Co Admin",
      photoUrl: "https://example.com/avatar.jpg",
      role: "admin",
      isActive: true,
      notificationPrefs: makeDefaultNotifPrefs(),
      createdAt: now,
      updatedAt: now,
    })
  );

  // Invited Admin can update own notificationPrefs, read notifications, etc.
  await assertSucceeds(
    secondAdminDb.collection("admins").doc(secondAdminUid).update({
      notificationPrefs: makeDefaultNotifPrefs({ quizActivity: false }),
      updatedAt: now,
    })
  );
  await assertSucceeds(secondAdminDb.collection("admin_notifications").get());
});

test("Admin FCM tokens: each admin manages only their own device token; non-admins are denied", async () => {
  const superAdminDb = testEnv.authenticatedContext("super_admin_uid", {
    email: "omsai3248@gmail.com",
    email_verified: true,
  }).firestore();
  const secondAdminUid = "co_admin_uid_2";
  const now = new Date();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("admins").doc(secondAdminUid).set({
      uid: secondAdminUid,
      email: "co.admin@example.com",
      displayName: "Co Admin",
      photoUrl: "",
      role: "admin",
      isActive: true,
      notificationPrefs: makeDefaultNotifPrefs(),
      createdAt: now,
      updatedAt: now,
    });
  });

  const secondAdminDb = testEnv.authenticatedContext(secondAdminUid, {
    email: "co.admin@example.com",
    email_verified: true,
  }).firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

  const tokenPayload = {
    adminUid: secondAdminUid,
    adminEmail: "co.admin@example.com",
    adminName: "Co Admin",
    token: "fcm_token_example_1234567890_abcdef",
    platform: "android",
    deviceId: "and_dev_1",
    deviceName: "Pixel 8",
    appVersion: "1.0.0",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  // Non-admin rejected
  await assertFails(
    aliceDb.collection("admin_fcm_tokens").doc(`${ALICE_UID}_dev1`).set({
      ...tokenPayload,
      adminUid: ALICE_UID,
    })
  );

  // Second admin registers own token
  await assertSucceeds(
    secondAdminDb.collection("admin_fcm_tokens").doc(`${secondAdminUid}_and_dev_1`).set(tokenPayload)
  );

  // Second admin CANNOT overwrite super admin's token doc
  await assertFails(
    secondAdminDb.collection("admin_fcm_tokens").doc("super_admin_uid_dev").set({
      ...tokenPayload,
      adminUid: "super_admin_uid",
    })
  );

  // Super Admin can read tokens & second admin can delete own token on logout
  await assertSucceeds(superAdminDb.collection("admin_fcm_tokens").get());
  await assertSucceeds(
    secondAdminDb.collection("admin_fcm_tokens").doc(`${secondAdminUid}_and_dev_1`).delete()
  );
});

test("Admin Notifications: student activity creates unread notifications; only admins read, mark read, or delete", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const now = new Date();

  const notifDoc = {
    category: "registration",
    title: "નવું રજિસ્ટ્રેશન",
    body: "Aarav Patel (9876543210) એ નવું એકાઉન્ટ બનાવ્યું.",
    actorName: "Aarav Patel",
    actorMobile: "9876543210",
    actorId: "mob_9876543210",
    targetRoute: "admin_students",
    referenceId: "mob_9876543210",
    isRead: false,
    readBy: [],
    pushDispatched: false,
    createdAt: now,
    updatedAt: now,
  };

  // Public student activity can create unread notification
  await assertSucceeds(
    unauthDb.collection("admin_notifications").doc("notif_reg_1").set(notifDoc)
  );

  // Non-admin CANNOT forge admin_chat notification, read, mark read, or delete
  await assertFails(
    aliceDb.collection("admin_notifications").doc("notif_chat_spoof").set({
      ...notifDoc,
      category: "admin_chat",
    })
  );
  await assertFails(unauthDb.collection("admin_notifications").get());
  await assertFails(aliceDb.collection("admin_notifications").doc("notif_reg_1").get());
  await assertFails(
    aliceDb.collection("admin_notifications").doc("notif_reg_1").update({
      isRead: true,
      readBy: [ALICE_UID],
      updatedAt: now,
    })
  );
  await assertFails(aliceDb.collection("admin_notifications").doc("notif_reg_1").delete());

  // Admin can list, mark read, and delete
  await assertSucceeds(adminDb.collection("admin_notifications").get());
  await assertSucceeds(
    adminDb.collection("admin_notifications").doc("notif_reg_1").update({
      isRead: true,
      readBy: [ADMIN_UID],
      updatedAt: now,
    })
  );
  await assertSucceeds(adminDb.collection("admin_notifications").doc("notif_reg_1").delete());
});

test("Admin Personal Messaging: 1-to-1 chat & messages strictly restricted to the 2 participant admins with delivery/read receipt progression", async () => {
  const adminAUid = "admin_a_uid";
  const adminBUid = "admin_b_uid";
  const adminCUid = "admin_c_uid";
  const now = new Date();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, email, name] of [
      [adminAUid, "a@example.com", "Admin A"],
      [adminBUid, "b@example.com", "Admin B"],
      [adminCUid, "c@example.com", "Admin C"],
    ]) {
      await db.collection("admins").doc(uid).set({
        uid,
        email,
        displayName: name,
        photoUrl: "",
        role: "admin",
        isActive: true,
        notificationPrefs: makeDefaultNotifPrefs(),
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const adminADb = testEnv.authenticatedContext(adminAUid, { email: "a@example.com", email_verified: true }).firestore();
  const adminBDb = testEnv.authenticatedContext(adminBUid, { email: "b@example.com", email_verified: true }).firestore();
  const adminCDb = testEnv.authenticatedContext(adminCUid, { email: "c@example.com", email_verified: true }).firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

  const chatId = "admin_a_uid__admin_b_uid";
  const chatDoc = {
    participants: [adminAUid, adminBUid],
    participantMeta: {
      [adminAUid]: { displayName: "Admin A", photoUrl: "" },
      [adminBUid]: { displayName: "Admin B", photoUrl: "" },
    },
    lastMessageText: "Hello Admin B",
    lastMessageSenderUid: adminAUid,
    lastMessageSenderName: "Admin A",
    lastMessageStatus: "sent",
    lastMessageAt: now,
    unreadCounts: { [adminAUid]: 0, [adminBUid]: 1 },
    createdAt: now,
    updatedAt: now,
  };

  // Non-admin & uninvolved Admin C cannot create/read A<->B chat
  await assertFails(aliceDb.collection("admin_chats").doc(chatId).set(chatDoc));
  await assertSucceeds(adminADb.collection("admin_chats").doc(chatId).set(chatDoc));
  await assertFails(adminCDb.collection("admin_chats").doc(chatId).get());

  // Admin A sends message in chat
  const msgDoc = {
    chatId,
    senderUid: adminAUid,
    senderName: "Admin A",
    senderPhotoUrl: "",
    recipientUid: adminBUid,
    participantUids: [adminAUid, adminBUid],
    text: "Check pending payment from Raj.",
    status: "sent",
    createdAt: now,
    updatedAt: now,
  };
  await assertSucceeds(
    adminADb.collection("admin_chats").doc(chatId).collection("messages").doc("msg_1").set(msgDoc)
  );

  // Admin C cannot read A<->B messages (unfiltered list or querying A's chat messages)
  await assertFails(
    adminCDb.collection("admin_chats").doc(chatId).collection("messages").doc("msg_1").get()
  );
  await assertFails(
    adminCDb.collection("admin_chats").doc(chatId).collection("messages").get()
  );
  await assertFails(
    adminCDb.collection("admin_chats").doc(chatId).collection("messages").where("participantUids", "array-contains", adminAUid).get()
  );

  // Sender (Admin A) CANNOT fake recipient's delivered/read receipt or edit message text
  await assertFails(
    adminADb.collection("admin_chats").doc(chatId).collection("messages").doc("msg_1").update({
      status: "read",
      readAt: now,
      updatedAt: now,
    })
  );

  // Recipient (Admin B) CAN read and advance status sent -> delivered -> read
  await assertSucceeds(
    adminBDb.collection("admin_chats").doc(chatId).collection("messages").where("participantUids", "array-contains", adminBUid).get()
  );
  await assertSucceeds(
    adminBDb.collection("admin_chats").doc(chatId).collection("messages").doc("msg_1").update({
      status: "delivered",
      deliveredAt: now,
      updatedAt: now,
    })
  );
  await assertSucceeds(
    adminBDb.collection("admin_chats").doc(chatId).collection("messages").doc("msg_1").update({
      status: "read",
      readAt: now,
      updatedAt: now,
    })
  );
});

