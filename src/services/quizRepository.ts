import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import {
  ALL_SUBJECT_IDS,
  getSubjectDisplayName,
  resolveCodeSubjectId,
  resolvePaymentSubjectId,
  type AccessCode,
  type AccessCodeUsedBy,
  type AppReleaseConfig,
  type PaymentRequest,
  type QuizAttempt,
  type StudentProfile,
  type SubjectId,
} from '../types/models';
import { getDeviceBrowserInfo } from '../utils/imageUtils';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

export const COLLECTION_STUDENTS = 'students';
export const SUBCOLLECTION_QUIZ_ATTEMPTS = 'quiz_attempts';
export const COLLECTION_ACCESS_CODES = 'access_codes';
export const COLLECTION_PAYMENT_REQUESTS = 'payment_requests';
export const COLLECTION_UTR_LOCKS = 'utr_locks';
export const COLLECTION_APP_CONFIG = 'app_config';
export const DOC_RELEASE_CONFIG = 'release';

export const ADMIN_UPI_ID = '9099592283@upi';
export const ADMIN_UPI_NAME = 'KATRIYA KIRANKUMAR RAMESHBHAI';
export const ADMIN_PHONE_TEN_DIGITS = '9099592283';
export const ADMIN_PHONE_E164 = '+919099592283';

const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function isAdminAccount(authPhone = ''): boolean {
  const clean = (authPhone ?? '').trim();
  if (clean === ADMIN_PHONE_E164) return true;
  const digits = clean.replace(/\D/g, '').slice(-10);
  return digits === ADMIN_PHONE_TEN_DIGITS && clean.startsWith('+91');
}

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Authentication session not ready. Please wait a moment and try again.');
  }
  return uid;
}

export function generateUnique8CharCode(): string {
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CODE_CHARSET[arr[i] % CODE_CHARSET.length];
  }
  return out;
}

function generateId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${hex}`;
}

export function normalizeUtrId(rawUtr: string): string {
  return rawUtr.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

function timestampSortValue(ts: Timestamp | null | undefined): number {
  return ts ? ts.seconds : Number.MAX_SAFE_INTEGER;
}

export function observeStudentProfile(
  userId: string,
  onData: (profile: StudentProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, COLLECTION_STUDENTS, userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        id: snap.id,
        userId: String(d.userId ?? snap.id),
        fullName: String(d.fullName ?? ''),
        mobileNumber: String(d.mobileNumber ?? ''),
        email: String(d.email ?? ''),
        standard: String(d.standard ?? 'ધોરણ 10'),
        hasQuizAccess: Boolean(d.hasQuizAccess),
        redeemedCode: String(d.redeemedCode ?? ''),
        paymentStatus: (d.paymentStatus as StudentProfile['paymentStatus']) ?? 'none',
        totalQuizzesTaken: Number(d.totalQuizzesTaken ?? 0),
        bestScorePercent: Number(d.bestScorePercent ?? 0),
        unlockedSubjects: Array.isArray(d.unlockedSubjects)
          ? d.unlockedSubjects.map((x) => String(x))
          : [],
        createdAt: d.createdAt ?? null,
        updatedAt: d.updatedAt ?? null,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, ref.path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function registerOrUpdateStudentProfile(
  fullName: string,
  mobileNumber: string,
  email = ''
): Promise<void> {
  const uid = requireUserId();
  const trimmedName = fullName.trim();
  const cleanMobile = mobileNumber.replace(/\D/g, '');
  if (!trimmedName || trimmedName.length > 60) {
    throw new Error('INVALID_NAME');
  }
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }

  const canUseAdminMobile = isAdminAccount(auth.currentUser?.phoneNumber ?? '');
  if (cleanMobile === ADMIN_PHONE_TEN_DIGITS && !canUseAdminMobile) {
    throw new Error('RESERVED_ADMIN_MOBILE');
  }

  const ref = doc(db, COLLECTION_STUDENTS, uid);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        userId: uid,
        fullName: trimmedName.slice(0, 60),
        mobileNumber: cleanMobile,
        email: email.slice(0, 120),
        standard: 'ધોરણ 10',
        hasQuizAccess: false,
        redeemedCode: '',
        paymentStatus: 'none',
        totalQuizzesTaken: 0,
        bestScorePercent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        fullName: trimmedName.slice(0, 60),
        mobileNumber: cleanMobile,
        email: email.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ref.path);
  }
}

export async function submitPaymentRequest(params: {
  studentName: string;
  mobileNumber: string;
  amountRupees: number;
  upiTransactionRef: string;
  imageBlob: Blob;
  fallbackBase64: string;
  subjectId?: string;
}): Promise<string> {
  const uid = requireUserId();
  const cleanName = params.studentName.trim().slice(0, 60);
  const cleanMobile = params.mobileNumber.replace(/\D/g, '');
  const cleanAmount = Math.round(Number(params.amountRupees));
  const rawUtr = params.upiTransactionRef.trim().slice(0, 64);
  const utrNormalized = normalizeUtrId(rawUtr);
  const normalizedSubject = ALL_SUBJECT_IDS.includes(params.subjectId as SubjectId)
    ? (params.subjectId as SubjectId)
    : 'all';

  if (!cleanName) throw new Error('INVALID_NAME');
  if (!/^[0-9]{10}$/.test(cleanMobile)) throw new Error('INVALID_MOBILE');
  if (!Number.isFinite(cleanAmount) || cleanAmount < 1 || cleanAmount > 100000) {
    throw new Error('INVALID_AMOUNT');
  }
  if (utrNormalized.length < 4) throw new Error('INVALID_UTR');
  if (!params.fallbackBase64 && params.imageBlob.size === 0) {
    throw new Error('SCREENSHOT_REQUIRED');
  }

  // Fast pre-check for duplicate UTR
  const utrLockRef = doc(db, COLLECTION_UTR_LOCKS, utrNormalized);
  const existingLock = await getDoc(utrLockRef);
  if (existingLock.exists()) {
    throw new Error('DUPLICATE_UTR');
  }

  const requestId = generateId('pay');
  const screenshotPath = `payment_screenshots/${uid}/${requestId}.jpg`;
  let screenshotUrl = '';

  // Upload to Firebase Storage (with 8s timeout + compressed Firestore thumbnail fallback)
  try {
    const fileRef = storageRef(storage, screenshotPath);
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(fileRef, params.imageBlob, {
        contentType: 'image/jpeg',
      });
      return await getDownloadURL(snapshot.ref);
    })();
    const timeoutPromise = new Promise<string>((_, reject) => {
      window.setTimeout(() => reject(new Error('Storage upload timeout')), 8000);
    });
    screenshotUrl = await Promise.race([uploadPromise, timeoutPromise]);
  } catch (storageErr) {
    console.warn('Firebase Storage upload fell back to compressed Firestore thumbnail:', storageErr);
    screenshotUrl = '';
  }

  const screenshotBase64 = screenshotUrl ? '' : params.fallbackBase64.slice(0, 440_000);
  if (!screenshotUrl && !screenshotBase64) {
    throw new Error('SCREENSHOT_REQUIRED');
  }

  const reqRef = doc(db, COLLECTION_PAYMENT_REQUESTS, requestId);

  try {
    await runTransaction(db, async (tx) => {
      const lockSnap = await tx.get(utrLockRef);
      if (lockSnap.exists()) {
        throw new Error('DUPLICATE_UTR');
      }

      tx.set(utrLockRef, {
        utrNormalized,
        requestId,
        createdAt: serverTimestamp(),
      });

      tx.set(reqRef, {
        userId: uid,
        studentName: cleanName,
        mobileNumber: cleanMobile,
        amountRupees: cleanAmount,
        upiId: ADMIN_UPI_ID,
        upiTransactionRef: rawUtr,
        utrNormalized,
        screenshotUrl,
        screenshotPath: screenshotUrl ? screenshotPath : '',
        screenshotBase64,
        status: 'pending',
        assignedCode: '',
        adminNote: '',
        subjectId: normalizedSubject,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return requestId;
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_UTR') {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
    if (errMsg.includes('already exists') || errMsg.includes('permission')) {
      // Re-check if UTR lock collided concurrently
      try {
        const checkAfter = await getDoc(utrLockRef);
        if (checkAfter.exists()) {
          throw new Error('DUPLICATE_UTR');
        }
      } catch (innerErr) {
        if (innerErr instanceof Error && innerErr.message === 'DUPLICATE_UTR') {
          throw innerErr;
        }
      }
    }
    handleFirestoreError(error, OperationType.CREATE, reqRef.path);
  }
}

export async function approvePaymentAndAssignCode(params: {
  paymentRequest: PaymentRequest;
  adminNote?: string;
  approvedSubjectId?: string;
}): Promise<string> {
  requireUserId();
  const {
    paymentRequest,
    adminNote = '',
    approvedSubjectId = resolvePaymentSubjectId(paymentRequest),
  } = params;

  const normalizedSubject = ALL_SUBJECT_IDS.includes(approvedSubjectId as SubjectId)
    ? approvedSubjectId
    : 'all';
  const reqRef = doc(db, COLLECTION_PAYMENT_REQUESTS, paymentRequest.id);

  try {
    const assignedCode = await runTransaction(db, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('Payment request not found');
      }
      const reqData = reqSnap.data();
      if (reqData.status !== 'pending') {
        throw new Error('ALREADY_PROCESSED');
      }

      // Generate unique 8-character alphanumeric code with transaction collision check
      let chosenCode = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateUnique8CharCode();
        const candidateRef = doc(db, COLLECTION_ACCESS_CODES, candidate);
        const candidateSnap = await tx.get(candidateRef);
        if (!candidateSnap.exists()) {
          chosenCode = candidate;
          break;
        }
      }
      if (!chosenCode) {
        throw new Error('Failed to generate unique 8-character code.');
      }

      const codeRef = doc(db, COLLECTION_ACCESS_CODES, chosenCode);
      const amount = Math.max(0, Math.round(Number(reqData.amountRupees ?? paymentRequest.amountRupees ?? 24)));
      const noteText = adminNote.trim() || `₹${amount} Approved (${getSubjectDisplayName(normalizedSubject)})`;

      tx.set(codeRef, {
        code: chosenCode,
        requestId: paymentRequest.id,
        userName: String(reqData.studentName ?? paymentRequest.studentName).slice(0, 60),
        mobileNumber: String(reqData.mobileNumber ?? paymentRequest.mobileNumber).slice(0, 15),
        amountRupees: amount,
        batchName: `${getSubjectDisplayName(normalizedSubject)} • ₹${amount}`.slice(0, 60),
        status: 'unused',
        isUsed: false,
        usedAt: null,
        usedBy: null,
        usedByUserId: '',
        usedByMobile: '',
        usedByName: '',
        source: 'upi_payment',
        subjectId: normalizedSubject,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(reqRef, {
        status: 'approved',
        assignedCode: chosenCode,
        subjectId: normalizedSubject,
        adminNote: noteText.slice(0, 200),
        updatedAt: serverTimestamp(),
      });

      return chosenCode;
    });

    return assignedCode;
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_PROCESSED') {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, reqRef.path);
  }
}

export async function rejectPaymentRequest(
  paymentRequest: PaymentRequest,
  adminNote: string
): Promise<void> {
  requireUserId();
  const reqRef = doc(db, COLLECTION_PAYMENT_REQUESTS, paymentRequest.id);
  try {
    await updateDoc(reqRef, {
      status: 'rejected',
      adminNote: (adminNote.trim() || 'પેમેન્ટ વિગત અથવા સ્ક્રીનશોટ અમાન્ય છે / Invalid payment proof').slice(0, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, reqRef.path);
  }
}

export async function redeemAccessCodePublic(params: {
  rawCode: string;
  userName: string;
  mobileNumber: string;
  expectedSubjectId?: string;
}): Promise<{ code: string; subjectId: string; amountRupees: number }> {
  const uid = requireUserId();
  const cleanCode = params.rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cleanName = params.userName.trim().slice(0, 60);
  const cleanMobile = params.mobileNumber.replace(/\D/g, '');

  if (!/^[A-Z0-9_-]{4,32}$/.test(cleanCode)) {
    throw new Error('INVALID_CODE_FORMAT');
  }
  if (!cleanName) {
    throw new Error('INVALID_NAME');
  }
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }

  const deviceInfo = getDeviceBrowserInfo();
  const codeRef = doc(db, COLLECTION_ACCESS_CODES, cleanCode);

  try {
    const result = await runTransaction(db, async (tx) => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists()) {
        throw new Error('CODE_NOT_FOUND');
      }
      const d = codeSnap.data();
      if (d.status === 'used' || d.isUsed === true) {
        throw new Error('CODE_ALREADY_USED');
      }

      const codeSubjectId = resolveCodeSubjectId(
        cleanCode,
        String(d.batchName ?? ''),
        String(d.subjectId ?? '')
      );
      if (
        params.expectedSubjectId &&
        params.expectedSubjectId !== 'all' &&
        codeSubjectId !== 'all' &&
        codeSubjectId !== params.expectedSubjectId
      ) {
        throw new Error(`SUBJECT_MISMATCH:${codeSubjectId}`);
      }

      const usedByPayload: AccessCodeUsedBy = {
        uid,
        name: cleanName,
        mobile: cleanMobile,
        deviceInfo: deviceInfo || 'Web Browser',
      };

      tx.update(codeRef, {
        status: 'used',
        isUsed: true,
        usedAt: serverTimestamp(),
        usedBy: usedByPayload,
        usedByUserId: uid,
        usedByMobile: cleanMobile,
        usedByName: cleanName,
        updatedAt: serverTimestamp(),
      });

      return {
        code: cleanCode,
        subjectId: codeSubjectId,
        amountRupees: Number(d.amountRupees ?? 0),
      };
    });

    // Best-effort sync to student profile so quiz attempt tracking works cleanly
    try {
      const studentRef = doc(db, COLLECTION_STUDENTS, uid);
      const stSnap = await getDoc(studentRef);
      const unlockedSet = new Set<string>(
        stSnap.exists() && Array.isArray(stSnap.data().unlockedSubjects)
          ? stSnap.data().unlockedSubjects.map((x: unknown) => String(x))
          : []
      );
      if (result.subjectId === 'all') {
        unlockedSet.add('all');
        ALL_SUBJECT_IDS.forEach((s) => unlockedSet.add(s));
      } else {
        unlockedSet.add(result.subjectId);
      }
      const hasFull =
        unlockedSet.has('all') || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s));

      if (stSnap.exists()) {
        await updateDoc(studentRef, {
          fullName: cleanName,
          mobileNumber: cleanMobile === ADMIN_PHONE_TEN_DIGITS ? stSnap.data().mobileNumber : cleanMobile,
          hasQuizAccess: hasFull,
          redeemedCode: result.code,
          unlockedSubjects: Array.from(unlockedSet),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal: access is already persisted permanently in access_codes & local cache
    }

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'CODE_NOT_FOUND' ||
        error.message === 'CODE_ALREADY_USED' ||
        error.message === 'INVALID_CODE_FORMAT' ||
        error.message === 'INVALID_NAME' ||
        error.message === 'INVALID_MOBILE' ||
        error.message.startsWith('SUBJECT_MISMATCH:'))
    ) {
      throw error;
    }
    // Check permission error on already-used code read
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission')) {
      throw new Error('CODE_ALREADY_USED');
    }
    handleFirestoreError(error, OperationType.UPDATE, codeRef.path);
  }
}

export async function generateBulkAccessCodes(
  count: number,
  batchName: string,
  subjectId = 'all'
): Promise<string[]> {
  requireUserId();
  if (count < 1 || count > 500) {
    throw new Error('Can generate 1 to 500 codes per batch.');
  }

  const normalizedSubject = ALL_SUBJECT_IDS.includes(subjectId as SubjectId) ? subjectId : 'all';
  const subjectLabel = getSubjectDisplayName(normalizedSubject);
  const cleanBatch = (batchName.trim() || `${subjectLabel} Batch`).slice(0, 60);

  const generated: string[] = [];
  const seen = new Set<string>();
  while (generated.length < count) {
    const code = generateUnique8CharCode();
    if (!seen.has(code)) {
      seen.add(code);
      generated.push(code);
    }
  }

  try {
    for (let i = 0; i < generated.length; i += 400) {
      const chunk = generated.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const code of chunk) {
        const ref = doc(db, COLLECTION_ACCESS_CODES, code);
        batch.set(ref, {
          code,
          requestId: '',
          userName: '',
          mobileNumber: '',
          amountRupees: 0,
          batchName: cleanBatch,
          status: 'unused',
          isUsed: false,
          usedAt: null,
          usedBy: null,
          usedByUserId: '',
          usedByMobile: '',
          usedByName: '',
          source: 'book',
          subjectId: normalizedSubject,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return generated;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_ACCESS_CODES);
  }
}

function mapPaymentDoc(id: string, d: Record<string, unknown>): PaymentRequest {
  return {
    id,
    userId: String(d.userId ?? ''),
    studentName: String(d.studentName ?? ''),
    mobileNumber: String(d.mobileNumber ?? ''),
    amountRupees: Number(d.amountRupees ?? 24),
    upiId: String(d.upiId ?? ADMIN_UPI_ID),
    upiTransactionRef: String(d.upiTransactionRef ?? ''),
    utrNormalized: String(d.utrNormalized ?? ''),
    screenshotUrl: String(d.screenshotUrl ?? ''),
    screenshotPath: String(d.screenshotPath ?? ''),
    screenshotBase64: String(d.screenshotBase64 ?? ''),
    status: (d.status as PaymentRequest['status']) ?? 'pending',
    assignedCode: String(d.assignedCode ?? ''),
    adminNote: String(d.adminNote ?? ''),
    subjectId: typeof d.subjectId === 'string' ? d.subjectId : undefined,
    createdAt: (d.createdAt as PaymentRequest['createdAt']) ?? null,
    updatedAt: (d.updatedAt as PaymentRequest['updatedAt']) ?? null,
  };
}

function mapAccessCodeDoc(id: string, d: Record<string, unknown>): AccessCode {
  const isUsed = Boolean(d.isUsed) || d.status === 'used';
  const rawUsedBy = d.usedBy as Record<string, unknown> | null | undefined;
  const usedBy: AccessCodeUsedBy | null = rawUsedBy
    ? {
        uid: String(rawUsedBy.uid ?? ''),
        name: String(rawUsedBy.name ?? d.usedByName ?? ''),
        mobile: String(rawUsedBy.mobile ?? d.usedByMobile ?? ''),
        deviceInfo: String(rawUsedBy.deviceInfo ?? ''),
      }
    : isUsed && (d.usedByName || d.usedByMobile)
      ? {
          uid: String(d.usedByUserId ?? ''),
          name: String(d.usedByName ?? ''),
          mobile: String(d.usedByMobile ?? ''),
          deviceInfo: '',
        }
      : null;

  return {
    id,
    code: String(d.code ?? id),
    requestId: String(d.requestId ?? ''),
    userName: String(d.userName ?? ''),
    mobileNumber: String(d.mobileNumber ?? ''),
    amountRupees: Number(d.amountRupees ?? 0),
    batchName: String(d.batchName ?? ''),
    status: (d.status === 'used' || isUsed) ? 'used' : 'unused',
    isUsed,
    usedAt: (d.usedAt as AccessCode['usedAt']) ?? null,
    usedBy,
    usedByUserId: String(d.usedByUserId ?? ''),
    usedByMobile: String(d.usedByMobile ?? ''),
    usedByName: String(d.usedByName ?? ''),
    source: (d.source as AccessCode['source']) ?? 'upi_payment',
    subjectId: typeof d.subjectId === 'string' ? d.subjectId : undefined,
    createdAt: (d.createdAt as AccessCode['createdAt']) ?? null,
    updatedAt: (d.updatedAt as AccessCode['updatedAt']) ?? null,
  };
}

export function observeMyPaymentRequests(
  userId: string,
  onData: (list: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION_PAYMENT_REQUESTS), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapPaymentDoc(d.id, d.data()))
        .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_PAYMENT_REQUESTS);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function observeMyQuizAttempts(
  userId: string,
  onData: (list: QuizAttempt[]) => void
): Unsubscribe {
  const colRef = collection(db, COLLECTION_STUDENTS, userId, SUBCOLLECTION_QUIZ_ATTEMPTS);
  return onSnapshot(
    colRef,
    (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: String(d.userId ?? userId),
            subjectId: String(d.subjectId ?? 'maths') as SubjectId,
            subjectTitle: String(d.subjectTitle ?? ''),
            chapterTitle: String(d.chapterTitle ?? ''),
            score: Number(d.score ?? 0),
            totalQuestions: Number(d.totalQuestions ?? 0),
            percentage: Number(d.percentage ?? 0),
            timeTakenSeconds: Number(d.timeTakenSeconds ?? 0),
            createdAt: d.createdAt ?? null,
          } satisfies QuizAttempt;
        })
        .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colRef.path);
      } catch {
        onData([]);
      }
    }
  );
}

export async function recordQuizAttempt(params: {
  subjectId: SubjectId;
  subjectTitle: string;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  previousTotalQuizzes: number;
  previousBestScore: number;
}): Promise<void> {
  const uid = requireUserId();
  const {
    subjectId,
    subjectTitle,
    chapterTitle,
    score,
    totalQuestions,
    timeTakenSeconds,
    previousTotalQuizzes,
    previousBestScore,
  } = params;
  const percentage = totalQuestions > 0 ? Math.floor((score * 100) / totalQuestions) : 0;
  const attemptId = generateId('att');
  const attemptRef = doc(db, COLLECTION_STUDENTS, uid, SUBCOLLECTION_QUIZ_ATTEMPTS, attemptId);
  const studentRef = doc(db, COLLECTION_STUDENTS, uid);

  const stSnap = await getDoc(studentRef);
  if (!stSnap.exists()) return;

  try {
    const batch = writeBatch(db);
    batch.set(attemptRef, {
      userId: uid,
      subjectId,
      subjectTitle: subjectTitle.slice(0, 50),
      chapterTitle: chapterTitle.slice(0, 100),
      score,
      totalQuestions,
      percentage,
      timeTakenSeconds: Math.max(0, Math.min(7200, timeTakenSeconds)),
      createdAt: serverTimestamp(),
    });
    batch.update(studentRef, {
      totalQuizzesTaken: previousTotalQuizzes + 1,
      bestScorePercent: Math.max(previousBestScore, percentage),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, attemptRef.path);
  }
}

export function observeAllStudents(
  onData: (list: StudentProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, COLLECTION_STUDENTS);
  return onSnapshot(
    colRef,
    (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: String(d.userId ?? docSnap.id),
            fullName: String(d.fullName ?? ''),
            mobileNumber: String(d.mobileNumber ?? ''),
            email: String(d.email ?? ''),
            standard: String(d.standard ?? 'ધોરણ 10'),
            hasQuizAccess: Boolean(d.hasQuizAccess),
            redeemedCode: String(d.redeemedCode ?? ''),
            paymentStatus: (d.paymentStatus as StudentProfile['paymentStatus']) ?? 'none',
            totalQuizzesTaken: Number(d.totalQuizzesTaken ?? 0),
            bestScorePercent: Number(d.bestScorePercent ?? 0),
            unlockedSubjects: Array.isArray(d.unlockedSubjects)
              ? d.unlockedSubjects.map((x) => String(x))
              : [],
            createdAt: d.createdAt ?? null,
            updatedAt: d.updatedAt ?? null,
          } satisfies StudentProfile;
        })
        .sort(
          (a, b) =>
            timestampSortValue(b.updatedAt ?? b.createdAt) -
            timestampSortValue(a.updatedAt ?? a.createdAt)
        );
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_STUDENTS);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function observeAllPaymentRequests(
  onData: (list: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, COLLECTION_PAYMENT_REQUESTS);
  return onSnapshot(
    colRef,
    (snap) => {
      const items = snap.docs
        .map((d) => mapPaymentDoc(d.id, d.data()))
        .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_PAYMENT_REQUESTS);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function observeAllAccessCodes(
  onData: (list: AccessCode[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, COLLECTION_ACCESS_CODES);
  return onSnapshot(
    colRef,
    (snap) => {
      const items = snap.docs
        .map((docSnap) => mapAccessCodeDoc(docSnap.id, docSnap.data()))
        .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_ACCESS_CODES);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function toggleStudentQuizAccess(
  student: StudentProfile,
  grantAccess: boolean
): Promise<void> {
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, student.userId);
  try {
    if (grantAccess) {
      await updateDoc(studentRef, {
        hasQuizAccess: true,
        unlockedSubjects: ['all', ...ALL_SUBJECT_IDS],
        redeemedCode: student.redeemedCode || 'ADMIN-GRANTED',
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(studentRef, {
        hasQuizAccess: false,
        unlockedSubjects: [],
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, studentRef.path);
  }
}

export async function updateStudentSubjectAccess(
  student: StudentProfile,
  subjectId: SubjectId,
  grantAccess: boolean
): Promise<void> {
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, student.userId);
  const currentSet = new Set<string>(
    student.hasQuizAccess ? ALL_SUBJECT_IDS : student.unlockedSubjects.filter((s) => s !== 'all')
  );
  if (grantAccess) {
    currentSet.add(subjectId);
  } else {
    currentSet.delete(subjectId);
  }
  const hasFullAccess = ALL_SUBJECT_IDS.every((s) => currentSet.has(s));
  const nextSubjects = hasFullAccess ? ['all', ...ALL_SUBJECT_IDS] : Array.from(currentSet);
  try {
    await updateDoc(studentRef, {
      hasQuizAccess: hasFullAccess,
      unlockedSubjects: nextSubjects,
      redeemedCode:
        nextSubjects.length > 0 ? student.redeemedCode || 'ADMIN-GRANTED' : student.redeemedCode,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, studentRef.path);
  }
}

export function observeReleaseConfig(onData: (cfg: AppReleaseConfig | null) => void): Unsubscribe {
  const ref = doc(db, COLLECTION_APP_CONFIG, DOC_RELEASE_CONFIG);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        id: snap.id,
        githubOwnerRepo: String(d.githubOwnerRepo ?? ''),
        releaseNotes: String(d.releaseNotes ?? ''),
        updatedAt: d.updatedAt ?? null,
      });
    },
    () => {
      onData(null);
    }
  );
}

export async function saveReleaseConfig(
  githubOwnerRepo: string,
  releaseNotes: string
): Promise<void> {
  requireUserId();
  const ref = doc(db, COLLECTION_APP_CONFIG, DOC_RELEASE_CONFIG);
  try {
    await setDoc(ref, {
      githubOwnerRepo: githubOwnerRepo.trim().slice(0, 120),
      releaseNotes: releaseNotes.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ref.path);
  }
}
