import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
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
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, db, googleProvider, storage } from '../firebase';
import {
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getNativeCurrentAuthUser,
  hasNativeFirebaseBridge,
  invokeNativeBridgeCall,
  notifyNativeAuthUser,
  resetNativeAdminSessionDeviceCache,
  subscribeNativeAdminSessionDevice,
  subscribeNativeAllCodes,
  subscribeNativeAllPayments,
  subscribeNativeAllStudents,
  subscribeNativeAuthState,
  subscribeNativeMyAttempts,
  subscribeNativeMyPayments,
  subscribeNativeReleaseConfig,
  subscribeNativeStudentProfile,
  triggerNativeActiveSessionCheck,
  type AppAuthUser,
} from './nativeFirebaseBridge';
import {
  ALL_SUBJECT_IDS,
  getFixedPlanPrice,
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
import { getCurrentDeviceIdentity, getDeviceBrowserInfo } from '../utils/imageUtils';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

export const COLLECTION_STUDENTS = 'students';
export const SUBCOLLECTION_QUIZ_ATTEMPTS = 'quiz_attempts';
export const COLLECTION_ACCESS_CODES = 'access_codes';
export const COLLECTION_PAYMENT_REQUESTS = 'payment_requests';
export const COLLECTION_UTR_LOCKS = 'utr_locks';
export const COLLECTION_APP_CONFIG = 'app_config';
export const COLLECTION_ADMIN_SESSIONS = 'admin_sessions';
export const DOC_RELEASE_CONFIG = 'release';
export const DOC_ADMIN_SESSION_PRIMARY = 'primary';

export const ADMIN_UPI_ID = '9099592283@upi';
export const ADMIN_UPI_NAME = 'KATRIYA KIRANKUMAR RAMESHBHAI';
export const ADMIN_PHONE_TEN_DIGITS = '9099592283';
export const ADMIN_PHONE_E164 = '+919099592283';
export const ADMIN_AUTH_EMAIL = 'admin9099592283@std10quiz.app';
export const ADMIN_OWNER_EMAIL = 'omsai3248@gmail.com';
export const ADMIN_PASSCODE = 'Kiran@0602';

const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export {
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getCurrentDeviceIdentity,
  hasNativeFirebaseBridge,
  type AppAuthUser,
};

export function observeAppAuthState(cb: (user: AppAuthUser | null) => void): () => void {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAuthState(cb);
  }
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cb(null);
      return;
    }
    cb({
      uid: user.uid,
      email: user.email ?? '',
      phoneNumber: user.phoneNumber ?? '',
      emailVerified: Boolean(user.emailVerified),
    });
  });
}

export async function signOutAdminSession(): Promise<void> {
  resetNativeAdminSessionDeviceCache();
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.signOutGoogle?.(callId);
    });
    return;
  }
  await signOut(auth);
}

let lastWebAdminClaimAtMs = 0;

export async function claimAdminSessionDevice(): Promise<void> {
  const { deviceId, deviceName } = getCurrentDeviceIdentity();
  lastWebAdminClaimAtMs = Date.now();
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.claimAdminSessionDevice?.(
        callId,
        JSON.stringify({ deviceId, deviceName })
      );
    });
    return;
  }
  requireUserId();
  const ref = doc(db, COLLECTION_ADMIN_SESSIONS, DOC_ADMIN_SESSION_PRIMARY);
  try {
    await setDoc(ref, {
      activeDeviceId: deviceId,
      activeDeviceName: deviceName,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Allow admin panel entry even if quota/offline temporarily blocks session write
    console.warn('claimAdminSessionDevice deferred:', err);
  }
}

export function observeAdminSessionDevice(onDeviceId: (deviceId: string) => void): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminSessionDevice(onDeviceId);
  }
  const ref = doc(db, COLLECTION_ADMIN_SESSIONS, DOC_ADMIN_SESSION_PRIMARY);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const remoteDeviceId = String(snap.data().activeDeviceId ?? '').trim();
      const myDeviceId = getCurrentDeviceIdentity().deviceId;
      const withinClaimWindow = Date.now() - lastWebAdminClaimAtMs < 4500;
      if (snap.metadata.fromCache && withinClaimWindow && remoteDeviceId && remoteDeviceId !== myDeviceId) {
        return;
      }
      onDeviceId(remoteDeviceId);
    },
    () => {
      // Non-fatal
    }
  );
}

export async function verifyActiveSessionOnResume(studentId?: string, isAdminActive = false): Promise<{
  studentProfile?: StudentProfile | null;
  adminDeviceId?: string;
}> {
  if (hasNativeFirebaseBridge()) {
    triggerNativeActiveSessionCheck();
    return {};
  }
  const out: { studentProfile?: StudentProfile | null; adminDeviceId?: string } = {};
  if (studentId?.trim()) {
    try {
      const snap = await getDocFromServer(doc(db, COLLECTION_STUDENTS, studentId.trim()));
      if (snap.exists()) {
        const mapped = mapStudentDoc(snap.id, snap.data());
        saveWebStudentBackup(mapped, false);
        out.studentProfile = mapped;
      }
    } catch {
      // Offline / quota fallback: listener handles live state
    }
  }
  if (isAdminActive && Date.now() - lastWebAdminClaimAtMs >= 4000) {
    try {
      const snap = await getDocFromServer(doc(db, COLLECTION_ADMIN_SESSIONS, DOC_ADMIN_SESSION_PRIMARY));
      if (snap.exists()) {
        out.adminDeviceId = String(snap.data().activeDeviceId ?? '').trim();
      }
    } catch {
      // Ignore
    }
  }
  return out;
}

export function isAdminAccount(authPhone = '', authEmail = ''): boolean {
  const cleanEmail = (authEmail ?? '').trim().toLowerCase();
  if (cleanEmail === ADMIN_AUTH_EMAIL || cleanEmail === ADMIN_OWNER_EMAIL) return true;
  const clean = (authPhone ?? '').trim();
  if (clean === ADMIN_PHONE_E164) return true;
  const digits = clean.replace(/\D/g, '').slice(-10);
  return digits === ADMIN_PHONE_TEN_DIGITS && clean.startsWith('+91');
}

export async function signInAdminWithGoogle(): Promise<AppAuthUser> {
  if (hasNativeFirebaseBridge()) {
    const user = await invokeNativeBridgeCall<AppAuthUser>((callId) => {
      window.AndroidFirebaseBridge?.requestGoogleSignIn?.(callId);
    });
    if (user && user.uid) {
      notifyNativeAuthUser(user);
    }
    return user;
  }
  if (typeof window !== 'undefined' && Boolean(window.AndroidBridge)) {
    throw new Error('NATIVE_FIREBASE_MISSING');
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const email = (cred.user.email ?? '').trim().toLowerCase();
    if (email !== ADMIN_OWNER_EMAIL) {
      await signOut(auth);
      throw new Error('ONLY_ADMIN_GOOGLE_EMAIL');
    }
    return {
      uid: cred.user.uid,
      email: cred.user.email ?? '',
      phoneNumber: cred.user.phoneNumber ?? '',
      emailVerified: Boolean(cred.user.emailVerified),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    const lower = msg.toLowerCase();
    if (msg === 'ONLY_ADMIN_GOOGLE_EMAIL') throw err;
    if (lower.includes('popup-closed') || lower.includes('cancelled')) {
      throw new Error('SIGN_IN_CANCELLED');
    }
    if (
      lower.includes('action is invalid') ||
      lower.includes('unauthorized-domain') ||
      lower.includes('operation-not-allowed') ||
      lower.includes('operation-not-supported') ||
      lower.includes('popup-blocked')
    ) {
      throw new Error('GOOGLE_SIGNIN_CONFIG_ERROR');
    }
    throw err;
  }
}

export interface AdminPasscodeAuthResult {
  mode: 'firebase';
  user: AppAuthUser;
}

export async function signInAsAdminWithPasscode(
  phoneInput: string,
  passwordInput: string
): Promise<AdminPasscodeAuthResult> {
  const cleanDigits = phoneInput.replace(/\D/g, '').slice(-10);
  if (cleanDigits !== ADMIN_PHONE_TEN_DIGITS) {
    throw new Error('ONLY_ADMIN_NUMBER');
  }
  if (passwordInput !== ADMIN_PASSCODE) {
    throw new Error('INVALID_ADMIN_PASSWORD');
  }

  if (hasNativeFirebaseBridge()) {
    const current = getNativeCurrentAuthUser();
    if (current && isAdminAccount(current.phoneNumber, current.email)) {
      return { mode: 'firebase', user: current };
    }
    const signedUser = await signInAdminWithGoogle();
    return { mode: 'firebase', user: signedUser };
  }

  if (
    auth.currentUser &&
    isAdminAccount(auth.currentUser.phoneNumber ?? '', auth.currentUser.email ?? '')
  ) {
    return {
      mode: 'firebase',
      user: {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? '',
        phoneNumber: auth.currentUser.phoneNumber ?? '',
        emailVerified: Boolean(auth.currentUser.emailVerified),
      },
    };
  }

  const signedUser = await signInAdminWithGoogle();
  return { mode: 'firebase', user: signedUser };
}

const PUBLIC_VISITOR_UID_KEY = 'std10_public_visitor_uid_v1';
const MY_PAYMENT_IDS_KEY = 'std10_my_payment_ids_v1';
let memoryPublicVisitorId = '';
const knownSyncedStudentIds = new Set<string>();

function randomHex32(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').toLowerCase();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getStudentDocId(mobileOrUid: string): string {
  const digits = mobileOrUid.replace(/\D/g, '').slice(-10);
  if (/^[0-9]{10}$/.test(digits) && digits !== ADMIN_PHONE_TEN_DIGITS) {
    return `mob_${digits}`;
  }
  return mobileOrUid.trim();
}

export function getOrCreatePublicVisitorId(): string {
  const signedInUid = hasNativeFirebaseBridge()
    ? getNativeCurrentAuthUser()?.uid
    : auth.currentUser?.uid;
  if (signedInUid) return signedInUid;

  try {
    const existing = localStorage.getItem(PUBLIC_VISITOR_UID_KEY) ?? '';
    if (/^pub_[a-f0-9]{32}$/.test(existing)) {
      memoryPublicVisitorId = existing;
      return existing;
    }
    const created = `pub_${randomHex32()}`;
    localStorage.setItem(PUBLIC_VISITOR_UID_KEY, created);
    memoryPublicVisitorId = created;
    return created;
  } catch {
    if (!memoryPublicVisitorId) {
      memoryPublicVisitorId = `pub_${randomHex32()}`;
    }
    return memoryPublicVisitorId;
  }
}

export function loadMyPaymentRequestIds(mobileNumber = ''): string[] {
  const cleanMob = mobileNumber.replace(/\D/g, '').slice(-10);
  const key = cleanMob ? `${MY_PAYMENT_IDS_KEY}_${cleanMob}` : MY_PAYMENT_IDS_KEY;
  try {
    const raw = localStorage.getItem(key) ?? (cleanMob ? localStorage.getItem(MY_PAYMENT_IDS_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x))
      .filter((id) => /^pay_[a-f0-9]{32}$/.test(id))
      .slice(0, 25);
  } catch {
    return [];
  }
}

export function saveMyPaymentRequestId(requestId: string, mobileNumber = ''): string[] {
  const cleanMob = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!/^pay_[a-f0-9]{32}$/.test(requestId)) {
    return loadMyPaymentRequestIds(cleanMob);
  }
  const key = cleanMob ? `${MY_PAYMENT_IDS_KEY}_${cleanMob}` : MY_PAYMENT_IDS_KEY;
  const next = [
    requestId,
    ...loadMyPaymentRequestIds(cleanMob).filter((id) => id !== requestId),
  ].slice(0, 25);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
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
  return `${prefix}_${randomHex32()}`;
}

export function normalizeUtrId(rawUtr: string): string {
  return rawUtr.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

function timestampSortValue(ts: Timestamp | null | undefined): number {
  return ts ? ts.seconds : Number.MAX_SAFE_INTEGER;
}

function mapStudentDoc(id: string, d: Record<string, unknown>): StudentProfile {
  return {
    id,
    userId: String(d.userId ?? id),
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
    paymentRequestIds: Array.isArray(d.paymentRequestIds)
      ? d.paymentRequestIds.map((x) => String(x))
      : [],
    activeDeviceId: String(d.activeDeviceId ?? ''),
    activeDeviceName: String(d.activeDeviceName ?? ''),
    createdAt: (d.createdAt as StudentProfile['createdAt']) ?? null,
    updatedAt: (d.updatedAt as StudentProfile['updatedAt']) ?? null,
  };
}

const LOCAL_STUDENT_BACKUP_PREFIX = 'std10_student_backup_v1_';

function saveWebStudentBackup(profile: StudentProfile, pendingSync = false): void {
  try {
    if (!profile.id) return;
    localStorage.setItem(
      `${LOCAL_STUDENT_BACKUP_PREFIX}${profile.id}`,
      JSON.stringify({ ...profile, pendingServerSync: pendingSync })
    );
  } catch {
    // Ignore storage errors
  }
}

function loadWebStudentBackup(studentId: string): (StudentProfile & { pendingServerSync?: boolean }) | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STUDENT_BACKUP_PREFIX}${studentId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StudentProfile & { pendingServerSync?: boolean };
  } catch {
    return null;
  }
}

export async function lookupStudentByMobile(mobileNumber: string): Promise<StudentProfile | null> {
  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!/^[0-9]{10}$/.test(cleanMobile) || cleanMobile === ADMIN_PHONE_TEN_DIGITS) {
    return null;
  }
  if (hasNativeFirebaseBridge()) {
    try {
      const res = await invokeNativeBridgeCall<StudentProfile | null>((callId) => {
        window.AndroidFirebaseBridge?.lookupStudentProfile?.(callId, cleanMobile);
      });
      return res ?? null;
    } catch {
      return null;
    }
  }
  const studentId = getStudentDocId(cleanMobile);
  try {
    const snap = await getDoc(doc(db, COLLECTION_STUDENTS, studentId));
    if (!snap.exists()) return loadWebStudentBackup(studentId);
    const mapped = mapStudentDoc(snap.id, snap.data());
    saveWebStudentBackup(mapped, false);
    return mapped;
  } catch {
    return loadWebStudentBackup(studentId);
  }
}

export async function loginStudentWithDeviceLock(params: {
  mobileNumber: string;
  fullName?: string;
}): Promise<StudentProfile> {
  const cleanMobile = params.mobileNumber.replace(/\D/g, '').slice(-10);
  const cleanName = (params.fullName ?? '').trim().slice(0, 60);
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }
  const currentUser = hasNativeFirebaseBridge() ? getNativeCurrentAuthUser() : auth.currentUser;
  const canUseAdminMobile = isAdminAccount(
    currentUser?.phoneNumber ?? '',
    currentUser?.email ?? ''
  );
  if (cleanMobile === ADMIN_PHONE_TEN_DIGITS && !canUseAdminMobile) {
    throw new Error('RESERVED_ADMIN_MOBILE');
  }

  const { deviceId, deviceName } = getCurrentDeviceIdentity();

  if (hasNativeFirebaseBridge()) {
    const profile = await invokeNativeBridgeCall<StudentProfile>((callId) => {
      window.AndroidFirebaseBridge?.loginStudentWithDeviceLock?.(
        callId,
        JSON.stringify({
          mobileNumber: cleanMobile,
          fullName: cleanName,
          deviceId,
          deviceName,
        })
      );
    });
    knownSyncedStudentIds.add(profile.id || getStudentDocId(cleanMobile));
    return profile;
  }

  const studentId = getStudentDocId(cleanMobile);
  const ref = doc(db, COLLECTION_STUDENTS, studentId);

  try {
    const profile = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        if (!cleanName) {
          throw new Error('NAME_REQUIRED_FOR_NEW_USER');
        }
        tx.set(ref, {
          userId: studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: '',
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          paymentRequestIds: [],
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          id: studentId,
          userId: studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: '',
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          paymentRequestIds: [],
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          isReturningUser: false,
          createdAt: null,
          updatedAt: null,
        } satisfies StudentProfile;
      }

      const d = snap.data();
      const existingDeviceId = String(d.activeDeviceId ?? '').trim();
      const existingDeviceName = String(d.activeDeviceName ?? '').trim();
      const existingName = String(d.fullName ?? '').trim();
      const effectiveName = cleanName || existingName || 'Student';
      const needsUpdate =
        existingDeviceId !== deviceId ||
        existingDeviceName !== deviceName ||
        (cleanName.length > 0 && cleanName !== existingName);

      if (needsUpdate) {
        tx.update(ref, {
          fullName: effectiveName,
          email: String(d.email ?? ''),
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        ...mapStudentDoc(snap.id, d),
        fullName: effectiveName,
        activeDeviceId: deviceId,
        activeDeviceName: deviceName,
        isReturningUser: true,
      };
    });

    knownSyncedStudentIds.add(studentId);
    saveWebStudentBackup(profile, false);
    return profile;
  } catch (error) {
    if (error instanceof Error && error.message === 'NAME_REQUIRED_FOR_NEW_USER') {
      throw error;
    }
    const lower = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      lower.includes('resource-exhausted') ||
      lower.includes('resource_exhausted') ||
      lower.includes('quota') ||
      lower.includes('unavailable') ||
      lower.includes('offline') ||
      lower.includes('failed-precondition')
    ) {
      const backup = loadWebStudentBackup(studentId);
      if (backup) {
        const effectiveName = cleanName || backup.fullName || 'Student';
        const restored: StudentProfile = {
          ...backup,
          fullName: effectiveName,
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          isReturningUser: !backup.pendingServerSync,
        };
        saveWebStudentBackup(restored, Boolean(backup.pendingServerSync));
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          void updateDoc(ref, {
            fullName: effectiveName,
            activeDeviceId: deviceId,
            activeDeviceName: deviceName,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        return restored;
      }
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        if (!cleanName) throw new Error('NAME_REQUIRED_FOR_NEW_USER');
        const fallbackProfile: StudentProfile = {
          id: studentId,
          userId: studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: '',
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          paymentRequestIds: [],
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          isReturningUser: false,
          createdAt: null,
          updatedAt: null,
        };
        saveWebStudentBackup(fallbackProfile, true);
        return fallbackProfile;
      }
    }
    handleFirestoreError(error, OperationType.WRITE, ref.path);
  }
}

export async function releaseStudentDeviceLock(mobileNumber: string): Promise<void> {
  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!/^[0-9]{10}$/.test(cleanMobile) || cleanMobile === ADMIN_PHONE_TEN_DIGITS) {
    return;
  }
  const { deviceId } = getCurrentDeviceIdentity();
  const studentId = getStudentDocId(cleanMobile);
  const existingBackup = loadWebStudentBackup(studentId);
  if (existingBackup) {
    saveWebStudentBackup({ ...existingBackup, activeDeviceId: '', activeDeviceName: '' }, Boolean(existingBackup.pendingServerSync));
  }

  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.releaseStudentDeviceLock?.(
        callId,
        JSON.stringify({ mobileNumber: cleanMobile, deviceId })
      );
    }).catch(() => {});
    return;
  }

  const ref = doc(db, COLLECTION_STUDENTS, studentId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const existingDeviceId = String(snap.data().activeDeviceId ?? '').trim();
      if (!existingDeviceId || existingDeviceId === deviceId) {
        tx.update(ref, {
          activeDeviceId: '',
          activeDeviceName: '',
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch {
    // Best effort on logout; do not block local sign-out
  }
}

export function observeStudentProfile(
  userId: string,
  onData: (profile: StudentProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!userId.trim()) {
    onData(null);
    return () => {};
  }
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeStudentProfile(userId, onData);
  }
  const ref = doc(db, COLLECTION_STUDENTS, userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        knownSyncedStudentIds.delete(userId);
        onData(null);
        return;
      }
      knownSyncedStudentIds.add(userId);
      onData(mapStudentDoc(snap.id, snap.data()));
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
): Promise<string> {
  const trimmedName = fullName.trim().slice(0, 60);
  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!trimmedName) {
    throw new Error('INVALID_NAME');
  }
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }

  const currentUser = hasNativeFirebaseBridge() ? getNativeCurrentAuthUser() : auth.currentUser;
  const canUseAdminMobile = isAdminAccount(
    currentUser?.phoneNumber ?? '',
    currentUser?.email ?? ''
  );
  if (cleanMobile === ADMIN_PHONE_TEN_DIGITS && !canUseAdminMobile) {
    throw new Error('RESERVED_ADMIN_MOBILE');
  }

  const studentId = getStudentDocId(cleanMobile);

  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall<string>((callId) => {
      window.AndroidFirebaseBridge?.registerOrUpdateStudentProfile?.(
        callId,
        JSON.stringify({
          studentId,
          fullName: trimmedName,
          mobileNumber: cleanMobile,
          email: email.slice(0, 120),
        })
      );
    });
    return studentId;
  }

  if (typeof window !== 'undefined' && Boolean(window.AndroidBridge)) {
    return studentId;
  }

  const ref = doc(db, COLLECTION_STUDENTS, studentId);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        userId: studentId,
        fullName: trimmedName,
        mobileNumber: cleanMobile,
        email: email.slice(0, 120),
        standard: 'ધોરણ 10',
        hasQuizAccess: false,
        redeemedCode: '',
        paymentStatus: 'none',
        totalQuizzesTaken: 0,
        bestScorePercent: 0,
        unlockedSubjects: [],
        paymentRequestIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevData = existing.data();
      if (
        String(prevData.fullName ?? '') !== trimmedName ||
        String(prevData.email ?? '') !== email.slice(0, 120)
      ) {
        await updateDoc(ref, {
          fullName: trimmedName,
          email: email.slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      }
    }
    knownSyncedStudentIds.add(studentId);
    return studentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ref.path);
  }
}

export async function submitPaymentRequest(params: {
  studentName: string;
  mobileNumber: string;
  amountRupees?: number;
  upiTransactionRef?: string;
  imageBlob: Blob;
  fallbackBase64: string;
  subjectId?: string;
}): Promise<string> {
  const cleanName = params.studentName.trim().slice(0, 60);
  const cleanMobile = params.mobileNumber.replace(/\D/g, '').slice(-10);
  const studentId = getStudentDocId(cleanMobile);
  const requestId = generateId('pay');
  const autoRef = `SS-${requestId.slice(4, 14).toUpperCase()}`;
  const rawUtr = (params.upiTransactionRef ?? '').trim().slice(0, 64) || autoRef;
  const utrNormalized = normalizeUtrId(rawUtr) || autoRef;
  const normalizedSubject = ALL_SUBJECT_IDS.includes(params.subjectId as SubjectId)
    ? (params.subjectId as SubjectId)
    : 'all';
  // Enforce fixed plan pricing: ₹49 for all subjects, ₹24 for a single subject
  const cleanAmount = getFixedPlanPrice(normalizedSubject);

  if (!cleanName) throw new Error('INVALID_NAME');
  if (!/^[0-9]{10}$/.test(cleanMobile)) throw new Error('INVALID_MOBILE');
  if (!params.fallbackBase64 && params.imageBlob.size === 0) {
    throw new Error('SCREENSHOT_REQUIRED');
  }

  const uid = studentId.startsWith('mob_') ? studentId : getOrCreatePublicVisitorId();
  const isSignedInSession = Boolean(auth.currentUser?.uid);

  if (hasNativeFirebaseBridge()) {
    const screenshotBase64 = params.fallbackBase64.slice(0, 440_000);
    if (!screenshotBase64) {
      throw new Error('SCREENSHOT_REQUIRED');
    }
    await invokeNativeBridgeCall<string>((callId) => {
      window.AndroidFirebaseBridge?.submitPaymentRequest?.(
        callId,
        JSON.stringify({
          uid,
          studentId,
          requestId,
          studentName: cleanName,
          mobileNumber: cleanMobile,
          amountRupees: cleanAmount,
          upiId: ADMIN_UPI_ID,
          upiTransactionRef: rawUtr,
          utrNormalized,
          screenshotBase64,
          subjectId: normalizedSubject,
        })
      );
    });
    saveMyPaymentRequestId(requestId, cleanMobile);
    return requestId;
  }

  const utrLockRef = doc(db, COLLECTION_UTR_LOCKS, utrNormalized);
  const screenshotPath = `payment_screenshots/${uid}/${requestId}.jpg`;
  let screenshotUrl = '';

  // Storage requires an authenticated Firebase session; for unauthenticated public submissions,
  // store the compressed JPEG directly in Firestore so submission completes immediately without timeout.
  if (isSignedInSession) {
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

    if (studentId.startsWith('mob_')) {
      try {
        const stRef = doc(db, COLLECTION_STUDENTS, studentId);
        const stSnap = await getDoc(stRef);
        if (!stSnap.exists()) {
          await setDoc(stRef, {
            userId: studentId,
            fullName: cleanName,
            mobileNumber: cleanMobile,
            email: '',
            standard: 'ધોરણ 10',
            hasQuizAccess: false,
            redeemedCode: '',
            paymentStatus: 'none',
            totalQuizzesTaken: 0,
            bestScorePercent: 0,
            unlockedSubjects: [],
            paymentRequestIds: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const existingIds = stSnap.exists() && Array.isArray(stSnap.data().paymentRequestIds)
          ? stSnap.data().paymentRequestIds.map((x: unknown) => String(x))
          : [];
        const nextIds = [requestId, ...existingIds.filter((id: string) => id !== requestId)].slice(0, 25);
        await updateDoc(stRef, {
          paymentStatus: 'pending',
          paymentRequestIds: nextIds,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal: payment request & local ID cache already persisted
      }
    }

    saveMyPaymentRequestId(requestId, cleanMobile);
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
  const {
    paymentRequest,
    adminNote = '',
    approvedSubjectId = resolvePaymentSubjectId(paymentRequest),
  } = params;

  const normalizedSubject = ALL_SUBJECT_IDS.includes(approvedSubjectId as SubjectId)
    ? approvedSubjectId
    : 'all';

  if (hasNativeFirebaseBridge()) {
    const amount = Math.max(0, Math.round(Number(paymentRequest.amountRupees ?? 24)));
    const noteText = adminNote.trim() || `₹${amount} Approved (${getSubjectDisplayName(normalizedSubject)})`;
    return invokeNativeBridgeCall<string>((callId) => {
      window.AndroidFirebaseBridge?.approvePayment?.(
        callId,
        JSON.stringify({
          requestId: paymentRequest.id,
          subjectId: normalizedSubject,
          batchName: `${getSubjectDisplayName(normalizedSubject)} • ₹${amount}`,
          adminNote: noteText,
        })
      );
    });
  }

  requireUserId();
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
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.rejectPayment?.(
        callId,
        JSON.stringify({
          requestId: paymentRequest.id,
          adminNote: adminNote.trim() || 'પેમેન્ટ વિગત અથવા સ્ક્રીનશોટ અમાન્ય છે / Invalid payment proof',
        })
      );
    });
    return;
  }

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
  const cleanCode = params.rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cleanName = params.userName.trim().slice(0, 60);
  const cleanMobile = params.mobileNumber.replace(/\D/g, '').slice(-10);

  if (!/^[A-Z0-9_-]{4,32}$/.test(cleanCode)) {
    throw new Error('INVALID_CODE_FORMAT');
  }
  if (!cleanName) {
    throw new Error('INVALID_NAME');
  }
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }

  const studentId = getStudentDocId(cleanMobile);
  const canSyncStudent = studentId.startsWith('mob_') && studentId !== 'mob_9099592283';
  const uid = canSyncStudent ? studentId : getOrCreatePublicVisitorId();
  const deviceInfo = getDeviceBrowserInfo();

  if (hasNativeFirebaseBridge()) {
    return invokeNativeBridgeCall<{ code: string; subjectId: string; amountRupees: number }>(
      (callId) => {
        window.AndroidFirebaseBridge?.redeemAccessCode?.(
          callId,
          JSON.stringify({
            cleanCode,
            uid,
            studentId,
            cleanName,
            cleanMobile,
            deviceInfo: deviceInfo || 'Android App',
            expectedSubjectId: params.expectedSubjectId ?? '',
          })
        );
      }
    );
  }

  const codeRef = doc(db, COLLECTION_ACCESS_CODES, cleanCode);
  const studentRef = doc(db, COLLECTION_STUDENTS, studentId);

  const ensureStudentExistsWeb = async () => {
    if (!canSyncStudent) return;
    const existingStudent = await getDoc(studentRef);
    if (!existingStudent.exists()) {
      await setDoc(studentRef, {
        userId: studentId,
        fullName: cleanName,
        mobileNumber: cleanMobile,
        email: '',
        standard: 'ધોરણ 10',
        hasQuizAccess: false,
        redeemedCode: '',
        paymentStatus: 'none',
        totalQuizzesTaken: 0,
        bestScorePercent: 0,
        unlockedSubjects: [],
        paymentRequestIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    knownSyncedStudentIds.add(studentId);
  };

  try {
    if (canSyncStudent && !knownSyncedStudentIds.has(studentId)) {
      await ensureStudentExistsWeb();
    }

    const executeRedeemTx = () =>
      runTransaction(db, async (tx) => {
        const [codeSnap, stSnap] = await Promise.all([
          tx.get(codeRef),
          canSyncStudent ? tx.get(studentRef) : Promise.resolve(null),
        ]);
        if (!codeSnap.exists()) {
          throw new Error('CODE_NOT_FOUND');
        }
        const d = codeSnap.data();
        if (d.status === 'used' || d.isUsed === true) {
          throw new Error('CODE_ALREADY_USED');
        }
        if (canSyncStudent && (!stSnap || !stSnap.exists())) {
          knownSyncedStudentIds.delete(studentId);
          throw new Error('STUDENT_DOC_MISSING_RETRY');
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

        if (canSyncStudent && stSnap && stSnap.exists()) {
          const unlockedSet = new Set<string>(
            Array.isArray(stSnap.data().unlockedSubjects)
              ? stSnap.data().unlockedSubjects.map((x: unknown) => String(x))
              : []
          );
          if (codeSubjectId === 'all') {
            unlockedSet.add('all');
            ALL_SUBJECT_IDS.forEach((s) => unlockedSet.add(s));
          } else {
            unlockedSet.add(codeSubjectId);
          }
          const hasFull =
            unlockedSet.has('all') || ALL_SUBJECT_IDS.every((s) => unlockedSet.has(s));

          tx.update(studentRef, {
            hasQuizAccess: hasFull,
            redeemedCode: cleanCode,
            unlockedSubjects: Array.from(unlockedSet).slice(0, 10),
            updatedAt: serverTimestamp(),
          });
        }

        return {
          code: cleanCode,
          subjectId: codeSubjectId,
          amountRupees: Number(d.amountRupees ?? 0),
        };
      });

    try {
      return await executeRedeemTx();
    } catch (innerErr) {
      if (innerErr instanceof Error && innerErr.message === 'STUDENT_DOC_MISSING_RETRY') {
        await ensureStudentExistsWeb();
        return await executeRedeemTx();
      }
      throw innerErr;
    }
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
  if (count < 1 || count > 500) {
    throw new Error('Can generate 1 to 500 codes per batch.');
  }

  const normalizedSubject = ALL_SUBJECT_IDS.includes(subjectId as SubjectId) ? subjectId : 'all';
  const subjectLabel = getSubjectDisplayName(normalizedSubject);
  const cleanBatch = (batchName.trim() || `${subjectLabel} Batch`).slice(0, 60);

  if (hasNativeFirebaseBridge()) {
    return invokeNativeBridgeCall<string[]>((callId) => {
      window.AndroidFirebaseBridge?.generateBulkCodes?.(
        callId,
        JSON.stringify({ count, batchName: cleanBatch, subjectId: normalizedSubject })
      );
    });
  }

  requireUserId();

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
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeMyPayments([], onData);
  }
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

export function observePaymentRequestsByIds(
  requestIds: string[],
  onData: (list: PaymentRequest[]) => void
): Unsubscribe {
  const validIds = Array.from(new Set(requestIds)).filter((id) => /^pay_[a-f0-9]{32}$/.test(id));
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeMyPayments(validIds, onData);
  }
  if (validIds.length === 0) {
    onData([]);
    return () => {};
  }

  const byId = new Map<string, PaymentRequest>();
  const emitSorted = () => {
    const items = Array.from(byId.values()).sort(
      (a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt)
    );
    onData(items);
  };

  const unsubs = validIds.map((id) => {
    const ref = doc(db, COLLECTION_PAYMENT_REQUESTS, id);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          byId.set(id, mapPaymentDoc(snap.id, snap.data()));
        } else {
          byId.delete(id);
        }
        emitSorted();
      },
      () => {
        // Ignore transient or denied single-doc listener error for unauthenticated guest
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function observeMyQuizAttempts(
  userId: string,
  onData: (list: QuizAttempt[]) => void
): Unsubscribe {
  if (!userId.trim()) {
    onData([]);
    return () => {};
  }
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeMyAttempts(userId, onData);
  }
  const colRef = collection(db, COLLECTION_STUDENTS, userId, SUBCOLLECTION_QUIZ_ATTEMPTS);
  const attemptsQuery = query(colRef, orderBy('createdAt', 'desc'), limit(15));
  return onSnapshot(
    attemptsQuery,
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
  studentId?: string;
  subjectId: SubjectId;
  subjectTitle: string;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  previousTotalQuizzes: number;
  previousBestScore: number;
}): Promise<void> {
  const {
    studentId,
    subjectId,
    subjectTitle,
    chapterTitle,
    score,
    totalQuestions,
    timeTakenSeconds,
    previousTotalQuizzes,
    previousBestScore,
  } = params;
  const uid = studentId?.trim() || auth.currentUser?.uid || '';
  if (!uid) return;
  const percentage = totalQuestions > 0 ? Math.floor((score * 100) / totalQuestions) : 0;
  const attemptId = generateId('att');

  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.recordQuizAttempt?.(
        callId,
        JSON.stringify({
          studentId: uid,
          attemptId,
          subjectId,
          subjectTitle: subjectTitle.slice(0, 50),
          chapterTitle: chapterTitle.slice(0, 100),
          score,
          totalQuestions,
          timeTakenSeconds: Math.max(0, Math.min(7200, timeTakenSeconds)),
        })
      );
    });
    return;
  }

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
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAllStudents(onData, onError);
  }
  const colRef = collection(db, COLLECTION_STUDENTS);
  const q = query(colRef, orderBy('updatedAt', 'desc'), limit(150));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => mapStudentDoc(docSnap.id, docSnap.data()));
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
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAllPayments(onData, onError);
  }
  const colRef = collection(db, COLLECTION_PAYMENT_REQUESTS);
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => mapPaymentDoc(d.id, d.data()));
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
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAllCodes(onData, onError);
  }
  const colRef = collection(db, COLLECTION_ACCESS_CODES);
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(150));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => mapAccessCodeDoc(docSnap.id, docSnap.data()));
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
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.toggleStudentQuizAccess?.(
        callId,
        JSON.stringify({
          studentId: student.id || student.userId,
          grantAccess,
          redeemedCode: student.redeemedCode || '',
        })
      );
    });
    return;
  }
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, student.id || student.userId);
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
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.updateStudentSubjectAccess?.(
        callId,
        JSON.stringify({
          studentId: student.id || student.userId,
          subjectId,
          grantAccess,
        })
      );
    });
    return;
  }
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, student.id || student.userId);
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
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeReleaseConfig(onData);
  }
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
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.saveReleaseConfig?.(
        callId,
        JSON.stringify({
          githubOwnerRepo: githubOwnerRepo.trim().slice(0, 120),
          releaseNotes: releaseNotes.trim().slice(0, 300),
        })
      );
    });
    return;
  }
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

export async function deletePaymentRequestAdmin(req: PaymentRequest): Promise<void> {
  const utrNorm = req.utrNormalized?.trim() || normalizeUtrId(req.upiTransactionRef || '');
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.deletePaymentRequest?.(
        callId,
        JSON.stringify({ requestId: req.id, utrNormalized: utrNorm })
      );
    });
    return;
  }
  requireUserId();
  const reqRef = doc(db, COLLECTION_PAYMENT_REQUESTS, req.id);
  try {
    const batch = writeBatch(db);
    batch.delete(reqRef);
    if (/^[A-Z0-9_-]{4,64}$/.test(utrNorm)) {
      batch.delete(doc(db, COLLECTION_UTR_LOCKS, utrNorm));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, reqRef.path);
  }
}

export async function deleteAccessCodeAdmin(code: string): Promise<void> {
  const cleanCode = code.trim();
  if (!cleanCode) return;
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.deleteAccessCode?.(
        callId,
        JSON.stringify({ code: cleanCode })
      );
    });
    return;
  }
  requireUserId();
  const codeRef = doc(db, COLLECTION_ACCESS_CODES, cleanCode);
  try {
    await deleteDoc(codeRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, codeRef.path);
  }
}

export async function adminUnlockStudentDevice(student: StudentProfile): Promise<void> {
  const studentId = (student.id || student.userId).trim();
  if (!studentId) return;
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.adminUnlockStudentDevice?.(
        callId,
        JSON.stringify({ studentId })
      );
    });
    return;
  }
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, studentId);
  try {
    await updateDoc(studentRef, {
      activeDeviceId: '',
      activeDeviceName: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, studentRef.path);
  }
}

export async function deleteStudentAdmin(student: StudentProfile): Promise<void> {
  const studentId = (student.id || student.userId).trim();
  if (!studentId) return;
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.deleteStudent?.(
        callId,
        JSON.stringify({ studentId })
      );
    });
    knownSyncedStudentIds.delete(studentId);
    return;
  }
  requireUserId();
  const studentRef = doc(db, COLLECTION_STUDENTS, studentId);
  try {
    const attemptsSnap = await getDocs(
      collection(db, COLLECTION_STUDENTS, studentId, SUBCOLLECTION_QUIZ_ATTEMPTS)
    );
    const attemptRefs = attemptsSnap.docs.map((d) => d.ref);
    if (attemptRefs.length === 0) {
      await deleteDoc(studentRef);
    } else {
      for (let i = 0; i < attemptRefs.length; i += 400) {
        const chunk = attemptRefs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((r) => batch.delete(r));
        if (i + 400 >= attemptRefs.length) {
          batch.delete(studentRef);
        }
        await batch.commit();
      }
    }
    knownSyncedStudentIds.delete(studentId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, studentRef.path);
  }
}
