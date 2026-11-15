/**
 * Optional Firebase Cloud Functions (2nd Gen) for Blaze Plan deployments.
 * Note: The web frontend already executes these exact atomic invariants inside
 * Firestore `runTransaction()` enforced by `firestore.rules`, so the app works
 * even on the free Firebase Spark Plan without deploying Cloud Functions.
 *
 * If you upgrade to Firebase Blaze and prefer server-only code generation:
 * 1. `npm --prefix functions install firebase-admin firebase-functions`
 * 2. `firebase deploy --only functions`
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('node:crypto');

initializeApp();

const DB_ID = 'ai-studio-quickbookbykiran-476dca03-cd47-421b-8654-39026cc817b1';
const ADMIN_PHONE = '+919099592283';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generate8CharCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

exports.approvePaymentAndGenerateCode = onCall(async (request) => {
  if (!request.auth || request.auth.token.phone_number !== ADMIN_PHONE) {
    throw new HttpsError('permission-denied', 'Only admin +919099592283 can approve payments.');
  }
  const { requestId, adminNote = '', subjectId = 'all' } = request.data || {};
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw new HttpsError('invalid-argument', 'requestId is required.');
  }

  const db = getFirestore(DB_ID);
  const reqRef = db.collection('payment_requests').doc(requestId.trim());

  const assignedCode = await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Payment request not found.');
    }
    const reqData = reqSnap.data();
    if (reqData.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Payment request already processed.');
    }

    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generate8CharCode();
      const candidateSnap = await tx.get(db.collection('access_codes').doc(candidate));
      if (!candidateSnap.exists) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new HttpsError('internal', 'Failed to allocate unique code. Try again.');
    }

    const codeRef = db.collection('access_codes').doc(code);
    tx.set(codeRef, {
      code,
      requestId: reqRef.id,
      userName: reqData.studentName || '',
      mobileNumber: reqData.mobileNumber || '',
      amountRupees: Number(reqData.amountRupees || 0),
      batchName: `UPI ₹${reqData.amountRupees || 0}`,
      subjectId,
      source: 'upi_payment',
      status: 'unused',
      isUsed: false,
      usedAt: null,
      usedBy: null,
      usedByUserId: '',
      usedByMobile: '',
      usedByName: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(reqRef, {
      status: 'approved',
      assignedCode: code,
      subjectId,
      adminNote: String(adminNote || '').slice(0, 200),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return code;
  });

  return { code: assignedCode };
});
