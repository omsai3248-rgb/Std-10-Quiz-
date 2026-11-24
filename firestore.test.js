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

test("Unauthenticated user cannot list any collection or read non-UUID/student/user/used docs", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("payment_requests").get());
  await assertFails(unauthDb.collection("payment_requests").doc("pay_1").get());
  await assertFails(unauthDb.collection("access_codes").get());
  await assertFails(unauthDb.collection("utr_locks").get());
  await assertFails(unauthDb.collection("students").get());
  await assertFails(unauthDb.collection("students").doc("some_uid").get());
  await assertFails(unauthDb.collection("students").doc("mob_9876543210").get());
  await assertFails(unauthDb.collection("users").get());
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
  await assertFails(unauthDb.collection("mobile_number_locks").get());
  await assertFails(unauthDb.collection("mobile_number_locks").doc("9876543210").get());
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

async function linkGoogleUserMobile(db, uid, mobile10, name = "Aarav Patel", email = "aarav@example.com", now = new Date()) {
  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    uid,
    name,
    email,
    photoURL: "https://example.com/photo.jpg",
    mobileNumber: `+91${mobile10}`,
    mobileVerified: false,
    createdAt: now,
    lastLoginAt: now,
  });
  batch.set(db.collection("mobile_number_locks").doc(mobile10), {
    uid,
    mobileNumber: `+91${mobile10}`,
    createdAt: now,
  });
  await assertSucceeds(batch.commit());
}

test("Authenticated Google student (mob_9876543210) persists profile, unlocks only via valid transaction, saves quiz attempts, and is isolated from other users", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID, { email: "aarav@example.com", email_verified: true }).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID, { email: "bob@example.com", email_verified: true }).firestore();
  const studentId = "mob_9876543210";
  const now = new Date();

  // Unauthenticated user cannot create student profile
  await assertFails(
    unauthDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Unauth",
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

  // Alice links her mobile number atomically via users/{uid} + mobile_number_locks/{mobile10}
  await linkGoogleUserMobile(aliceDb, ALICE_UID, "9876543210", "Aarav Patel", "aarav@example.com", now);

  // Cannot create profile with pre-unlocked quiz access or reserved admin number
  await assertFails(
    aliceDb.collection("students").doc(studentId).set({
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
    aliceDb.collection("students").doc("mob_9099592283").set({
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

  // Valid initial locked student profile creation succeeds for owner Alice
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Aarav Patel",
      mobileNumber: "9876543210",
      email: "aarav@example.com",
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

  // Bob CANNOT read or update Alice's student profile
  await assertFails(bobDb.collection("students").doc(studentId).get());
  await assertFails(
    bobDb.collection("students").doc(studentId).update({
      fullName: "Hijacked",
      updatedAt: now,
    })
  );

  // Cannot record quiz attempt before subject is unlocked
  await assertFails(
    aliceDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_1").set({
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
    aliceDb.collection("students").doc(studentId).update({
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

  const redeemBatch = aliceDb.batch();
  redeemBatch.update(aliceDb.collection("access_codes").doc(code), {
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
  redeemBatch.update(aliceDb.collection("students").doc(studentId), {
    hasQuizAccess: false,
    redeemedCode: code,
    unlockedSubjects: ["maths"],
    updatedAt: now,
  });
  await assertSucceeds(redeemBatch.commit());

  // Now student Alice CAN record a quiz attempt for unlocked subject 'maths', but NOT locked 'science'
  const attBatch = aliceDb.batch();
  attBatch.set(aliceDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_1"), {
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
  attBatch.update(aliceDb.collection("students").doc(studentId), {
    totalQuizzesTaken: 1,
    bestScorePercent: 90,
    updatedAt: now,
  });
  await assertSucceeds(attBatch.commit());

  // Bob CANNOT read or inject attempts into Alice's quiz history
  await assertFails(bobDb.collection("students").doc(studentId).collection("quiz_attempts").get());
  await assertFails(
    bobDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_evil").set({
      userId: studentId,
      subjectId: "maths",
      subjectTitle: "ગણિત",
      chapterTitle: "Ch 1",
      score: 10,
      totalQuestions: 10,
      percentage: 100,
      timeTakenSeconds: 10,
      createdAt: now,
    })
  );

  await assertFails(
    aliceDb.collection("students").doc(studentId).collection("quiz_attempts").doc("att_2").set({
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

test("New device login by same authenticated Google owner takes over single-device session while admin_sessions is strictly admin-only", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID, { email: "gguu@example.com", email_verified: true }).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const studentId = "mob_9998668886";
  const now = new Date();

  await linkGoogleUserMobile(aliceDb, ALICE_UID, "9998668886", "Gguu", "gguu@example.com", now);

  // Device 1 creates & claims session
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Gguu",
      mobileNumber: "9998668886",
      email: "gguu@example.com",
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

  // Device 2 (same Google account) logs in -> SUCCEEDS and takes over activeDeviceId
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).update({
      fullName: "Gguu",
      activeDeviceId: "and_device_two",
      activeDeviceName: "Pixel 8",
      updatedAt: now,
    })
  );

  // Device takeover still cannot forge hasQuizAccess or unlockedSubjects
  await assertFails(
    aliceDb.collection("students").doc(studentId).update({
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
    aliceDb.collection("students").doc(studentId).update({
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

test("App Update system: only Admin can publish releases/configs/notifications; public can read updates & register own device FCM token without listing others", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const now = new Date();

  const releasePayload = {
    versionName: "1.0.2",
    versionCode: 2,
    updateTitle: "બોર્ડ ક્વિઝ અને સ્પીડ અપડેટ v1.0.2",
    releaseNotes: "ગણિતના નવા પ્રશ્નો અને ઝડપી પર્ફોર્મન્સ ઉમેરાયા છે.",
    apkDownloadUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/app_releases%2Fstd10_v1.0.2.apk?alt=media",
    apkStoragePath: "app_releases/std10_v1.0.2.apk",
    apkFileName: "std10_v1.0.2.apk",
    apkSizeBytes: 18450000,
    apkSha256: "a".repeat(64),
    signingCertSha256: "b".repeat(64),
    packageName: "com.aistudio.std10quiz.kqxmtv",
    isMandatory: false,
    publishedByUid: ADMIN_UID,
    createdAt: now,
    updatedAt: now,
  };

  // Non-admin cannot publish release, update app_config/release, or create update_notifications
  await assertFails(aliceDb.collection("app_releases").doc("rel_2").set(releasePayload));
  await assertFails(
    unauthDb.collection("app_config").doc("release").set({
      releaseNotes: "Fake update",
      latestVersionName: "9.9.9",
      apkDownloadUrl: "https://evil.example.com/fake.apk",
      updatedAt: now,
    })
  );

  // Admin publishes release + app_config/release + update_notifications history
  await assertSucceeds(adminDb.collection("app_releases").doc("rel_2").set(releasePayload));
  await assertSucceeds(
    adminDb.collection("app_config").doc("release").set({
      githubOwnerRepo: "",
      releaseNotes: releasePayload.releaseNotes,
      latestVersionName: "1.0.2",
      latestVersionCode: 2,
      updateTitle: releasePayload.updateTitle,
      apkDownloadUrl: releasePayload.apkDownloadUrl,
      apkStoragePath: releasePayload.apkStoragePath,
      apkFileName: releasePayload.apkFileName,
      apkSizeBytes: releasePayload.apkSizeBytes,
      apkSha256: releasePayload.apkSha256,
      signingCertSha256: releasePayload.signingCertSha256,
      packageName: releasePayload.packageName,
      isMandatory: false,
      publishedByUid: ADMIN_UID,
      publishedAt: now,
      updatedAt: now,
    })
  );
  await assertSucceeds(
    adminDb.collection("update_notifications").doc("rel_2").set({
      releaseId: "rel_2",
      appName: "ધોરણ 10 ક્વિઝ",
      versionName: "1.0.2",
      versionCode: 2,
      title: releasePayload.updateTitle,
      body: releasePayload.releaseNotes,
      isMandatory: false,
      apkDownloadUrl: releasePayload.apkDownloadUrl,
      targetRoute: "app_update",
      pushDispatched: true,
      recipientCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Public user can read release config, release history, and update notification history
  await assertSucceeds(unauthDb.collection("app_config").doc("release").get());
  await assertSucceeds(unauthDb.collection("app_releases").get());
  await assertSucceeds(unauthDb.collection("update_notifications").get());

  // Device FCM token: device can register/update its own token, CANNOT list other devices
  const devId = "and_device_0123456789";
  await assertSucceeds(
    unauthDb.collection("device_fcm_tokens").doc(devId).set({
      deviceId: devId,
      token: "fcm_public_device_token_1234567890_xyz",
      platform: "android",
      appVersion: "1.0.0",
      versionCode: 1,
      topicSubscribed: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(unauthDb.collection("device_fcm_tokens").get());
  await assertSucceeds(adminDb.collection("device_fcm_tokens").get());
  await assertSucceeds(adminDb.collection("device_fcm_tokens").doc(devId).delete());
});

test("Board Mock Test: student freeMockUsedSubjects must start empty, grows monotonically, and cannot forge access", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID, { email: "mock@example.com", email_verified: true }).firestore();
  const studentId = "mob_9123456789";
  const now = new Date();

  await linkGoogleUserMobile(aliceDb, ALICE_UID, "9123456789", "Mock Student", "mock@example.com", now);

  // Cannot create student with pre-populated freeMockUsedSubjects
  await assertFails(
    aliceDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Mock Student",
      mobileNumber: "9123456789",
      email: "mock@example.com",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      freeMockUsedSubjects: ["maths"],
      paymentRequestIds: [],
      createdAt: now,
      updatedAt: now,
    })
  );

  // Valid creation with empty freeMockUsedSubjects succeeds
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).set({
      userId: studentId,
      fullName: "Mock Student",
      mobileNumber: "9123456789",
      email: "mock@example.com",
      standard: "ધોરણ 10",
      hasQuizAccess: false,
      redeemedCode: "",
      paymentStatus: "none",
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      freeMockUsedSubjects: [],
      paymentRequestIds: [],
      createdAt: now,
      updatedAt: now,
    })
  );

  // Student can record free mock usage per folder
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).update({
      freeMockUsedSubjects: ["science"],
      updatedAt: now,
    })
  );
  await assertSucceeds(
    aliceDb.collection("students").doc(studentId).update({
      freeMockUsedSubjects: ["science", "maths", "english"],
      updatedAt: now,
    })
  );

  // Student CANNOT remove an already-used folder to reset free mock quota
  await assertFails(
    aliceDb.collection("students").doc(studentId).update({
      freeMockUsedSubjects: ["maths"],
      updatedAt: now,
    })
  );

  // Student CANNOT pass invalid subject IDs or piggyback hasQuizAccess
  await assertFails(
    aliceDb.collection("students").doc(studentId).update({
      freeMockUsedSubjects: ["science", "maths", "all"],
      updatedAt: now,
    })
  );
  await assertFails(
    aliceDb.collection("students").doc(studentId).update({
      freeMockUsedSubjects: ["science", "maths", "social_science"],
      hasQuizAccess: true,
      updatedAt: now,
    })
  );
});

test("Push Broadcasts & permission-gated FCM tokens: only Admins can create/manage broadcasts; students read publicly & toggle own enabled flag", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
    phone_number: ADMIN_PHONE,
  }).firestore();
  const now = new Date();

  const validBroadcast = {
    category: "exam_notice",
    title: "બોર્ડ પરીક્ષા મોક ટેસ્ટ સૂચના",
    body: "આજે રાત્રે 8 વાગ્યે ગણિત અને વિજ્ઞાનનો લાઇવ મોક ટેસ્ટ ઉપલબ્ધ છે.",
    targetRoute: "mock_test",
    referenceId: "exam_2026_01",
    senderUid: ADMIN_UID,
    senderName: "Quick Quiz Admin",
    pushDispatched: false,
    recipientCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Unauthenticated & non-admin users CANNOT create broadcasts
  await assertFails(unauthDb.collection("push_broadcasts").doc("bcast_1").set(validBroadcast));
  await assertFails(
    aliceDb.collection("push_broadcasts").doc("bcast_1").set({
      ...validBroadcast,
      senderUid: ALICE_UID,
    })
  );

  // Admin cannot spoof senderUid, forge pushDispatched=true, or pass invalid category/route
  await assertFails(
    adminDb.collection("push_broadcasts").doc("bcast_spoof").set({
      ...validBroadcast,
      senderUid: "other_uid",
    })
  );
  await assertFails(
    adminDb.collection("push_broadcasts").doc("bcast_forged").set({
      ...validBroadcast,
      pushDispatched: true,
    })
  );
  await assertFails(
    adminDb.collection("push_broadcasts").doc("bcast_badcat").set({
      ...validBroadcast,
      category: "promo_spam",
    })
  );
  await assertFails(
    adminDb.collection("push_broadcasts").doc("bcast_badroute").set({
      ...validBroadcast,
      targetRoute: "admin_requests",
    })
  );

  // Admin creates valid broadcast
  await assertSucceeds(adminDb.collection("push_broadcasts").doc("bcast_1").set(validBroadcast));

  // Public & student users CAN read broadcasts, CANNOT update or delete
  await assertSucceeds(unauthDb.collection("push_broadcasts").doc("bcast_1").get());
  await assertSucceeds(unauthDb.collection("push_broadcasts").get());
  await assertFails(
    aliceDb.collection("push_broadcasts").doc("bcast_1").update({
      title: "Tampered",
      updatedAt: now,
    })
  );
  await assertFails(aliceDb.collection("push_broadcasts").doc("bcast_1").delete());

  // Admin CAN update & delete broadcast
  await assertSucceeds(
    adminDb.collection("push_broadcasts").doc("bcast_1").update({
      title: "બોર્ડ પરીક્ષા મોક ટેસ્ટ (અપડેટેડ)",
      updatedAt: now,
    })
  );
  await assertSucceeds(adminDb.collection("push_broadcasts").doc("bcast_1").delete());

  // Permission-gated device_fcm_tokens: device registers with enabled=false until permission granted, then flips to true
  const devId = "and_perm_gate_123456";
  await assertSucceeds(
    unauthDb.collection("device_fcm_tokens").doc(devId).set({
      deviceId: devId,
      token: "fcm_token_permission_gated_1234567890",
      platform: "android",
      appVersion: "1.0.1",
      versionCode: 2,
      topicSubscribed: false,
      enabled: false,
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertSucceeds(
    unauthDb.collection("device_fcm_tokens").doc(devId).update({
      enabled: true,
      updatedAt: now,
    })
  );
});

test("Google Sign-In /users/{uid} + Server-side Duplicate Mobile Lock: enforces UID isolation, mobileVerified=false, duplicate rejection, and existing data preservation", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID, { email: "alice@gmail.com", email_verified: true }).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID, { email: "bob@gmail.com", email_verified: true }).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, { phone_number: ADMIN_PHONE }).firestore();
  const now = new Date();

  // Seed pre-existing student unlocks & quiz history (must survive without reset!)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("students").doc("mob_9825012345").set({
      userId: "mob_9825012345",
      fullName: "Existing Student",
      mobileNumber: "9825012345",
      email: "",
      standard: "ધોરણ 10",
      hasQuizAccess: true,
      redeemedCode: "ALL88990",
      paymentStatus: "approved",
      totalQuizzesTaken: 12,
      bestScorePercent: 95,
      unlockedSubjects: ["all"],
      paymentRequestIds: [],
      createdAt: now,
      updatedAt: now,
    });
    await db.collection("students").doc("mob_9825012345").collection("quiz_attempts").doc("old_att_1").set({
      userId: "mob_9825012345",
      subjectId: "maths",
      subjectTitle: "ગણિત",
      chapterTitle: "Ch 1",
      score: 19,
      totalQuestions: 20,
      percentage: 95,
      timeTakenSeconds: 110,
      createdAt: now,
    });
  });

  // 1. Alice cannot forge mobileVerified=true on initial profile create
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).set({
      uid: ALICE_UID,
      name: "Alice Patel",
      email: "alice@gmail.com",
      photoURL: "https://example.com/a.jpg",
      mobileNumber: "",
      mobileVerified: true,
      createdAt: now,
      lastLoginAt: now,
    })
  );

  // 2. Alice creates initial Google profile with mobileNumber="" and mobileVerified=false
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).set({
      uid: ALICE_UID,
      name: "Alice Patel",
      email: "alice@gmail.com",
      photoURL: "https://example.com/a.jpg",
      mobileNumber: "",
      mobileVerified: false,
      createdAt: now,
      lastLoginAt: now,
    })
  );

  // 3. Alice cannot read/write Bob's profile, and Bob cannot read/write Alice's profile
  await assertFails(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(bobDb.collection("users").get());
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).update({
      name: "Hacked",
      lastLoginAt: now,
    })
  );

  // 4. Alice cannot set mobileNumber in /users/{uid} WITHOUT creating the atomic /mobile_number_locks/{mobile10}
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      mobileNumber: "+919825012345",
      lastLoginAt: now,
    })
  );

  // 5. Alice cannot forge mobileVerified=true on update
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      mobileVerified: true,
      lastLoginAt: now,
    })
  );

  // 6. Alice links +919825012345 atomically with mobile_number_locks/9825012345 -> SUCCEEDS
  const aliceLinkBatch = aliceDb.batch();
  aliceLinkBatch.set(aliceDb.collection("mobile_number_locks").doc("9825012345"), {
    uid: ALICE_UID,
    mobileNumber: "+919825012345",
    createdAt: now,
  });
  aliceLinkBatch.update(aliceDb.collection("users").doc(ALICE_UID), {
    mobileNumber: "+919825012345",
    lastLoginAt: now,
  });
  await assertSucceeds(aliceLinkBatch.commit());

  // 7. Existing student unlocks & quiz history are IMMEDIATELY preserved and readable by Alice!
  await assertSucceeds(aliceDb.collection("students").doc("mob_9825012345").get());
  await assertSucceeds(aliceDb.collection("students").doc("mob_9825012345").collection("quiz_attempts").get());

  // 8. Bob creates his own initial profile, then tries to link Alice's SAME mobile 9825012345 -> SERVER-SIDE REJECTED!
  await assertSucceeds(
    bobDb.collection("users").doc(BOB_UID).set({
      uid: BOB_UID,
      name: "Bob Shah",
      email: "bob@gmail.com",
      photoURL: "",
      mobileNumber: "",
      mobileVerified: false,
      createdAt: now,
      lastLoginAt: now,
    })
  );

  const bobDupBatch = bobDb.batch();
  bobDupBatch.set(bobDb.collection("mobile_number_locks").doc("9825012345"), {
    uid: BOB_UID,
    mobileNumber: "+919825012345",
    createdAt: now,
  });
  bobDupBatch.update(bobDb.collection("users").doc(BOB_UID), {
    mobileNumber: "+919825012345",
    lastLoginAt: now,
  });
  await assertFails(bobDupBatch.commit());

  // Bob also cannot read Alice's preserved student profile or quiz history, and cannot list locks
  await assertFails(bobDb.collection("students").doc("mob_9825012345").get());
  await assertFails(bobDb.collection("students").doc("mob_9825012345").collection("quiz_attempts").get());
  await assertFails(bobDb.collection("mobile_number_locks").get());
  await assertFails(unauthDb.collection("students").doc("mob_9825012345").get());

  // 9. Alice cannot overwrite her linked mobile number to hijack another number, but CAN update lastLoginAt/name
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).update({
      name: "Alice K. Patel",
      lastLoginAt: now,
    })
  );
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      mobileNumber: "+919900112233",
      lastLoginAt: now,
    })
  );

  // 10. Admin can read users & locks directory
  await assertSucceeds(adminDb.collection("users").get());
  await assertSucceeds(adminDb.collection("mobile_number_locks").get());
});

