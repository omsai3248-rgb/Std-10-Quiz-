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

test("Admin (+919099592283) can approve payment + create permanent 8-char code, and codes can NEVER be deleted", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("payment_requests").doc("pay_1").set(makePaymentPayload(ALICE_UID));
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

  // Even admin cannot delete a generated code (permanent storage)
  await assertFails(adminDb.collection("access_codes").doc(code).delete());
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
