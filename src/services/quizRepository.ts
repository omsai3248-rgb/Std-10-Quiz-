import {
  Timestamp,
  arrayUnion,
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
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, db, googleProvider, storage } from '../firebase';
import {
  addNativeAdminInvite,
  deleteNativeAdminNotification,
  deleteNativePushBroadcast,
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getNativeActiveStudentSnapshot,
  getNativeCurrentAuthUser,
  getNativeNotificationPermissionStatus,
  hasNativeFirebaseBridge,
  invokeNativeBridgeCall,
  loadMoreNativeAdminCollection,
  logNativeAdminNotificationEvent,
  markAllNativeAdminNotificationsRead,
  markNativeAdminNotificationRead,
  markNativeChatMessagesRead,
  notifyNativeAuthUser,
  openNativeNotificationSettings,
  pauseNativeAdminListeners,
  publishNativeAppUpdate,
  removeNativeAdminInvite,
  requestNativeNotificationPermission,
  resumeNativeAdminListeners,
  sendNativeAdminChatMessage,
  sendNativePushBroadcast,
  setNativeActiveStudentMobile,
  subscribeNativeAdminChatMessages,
  subscribeNativeAdminChats,
  subscribeNativeAdminDirectory,
  subscribeNativeAdminInvites,
  subscribeNativeAdminNotifications,
  subscribeNativeAllCodes,
  subscribeNativeAllPayments,
  subscribeNativeAllStudents,
  subscribeNativeApkUploadProgress,
  subscribeNativeAuthState,
  subscribeNativeMyAttempts,
  subscribeNativeMyPayments,
  subscribeNativePushBroadcasts,
  subscribeNativeReleaseConfig,
  subscribeNativeStudentProfile,
  subscribeNativeUpdateNotifications,
  syncNativeAdminProfileAndFcmToken,
  triggerNativeActiveSessionCheck,
  updateNativeAdminNotificationPrefs,
  type AppAuthUser,
} from './nativeFirebaseBridge';
import {
  classifyFirestoreError,
  enqueueSyncOperation,
  flushSyncQueue,
  isQuotaCooldownActive,
  loadCachedAdminCodes,
  loadCachedAdminPayments,
  loadCachedAdminStudents,
  loadCachedMyAttempts,
  markServerSyncError,
  markServerSyncSuccess,
  mergeRecordsByIdNewer,
  saveCachedAdminCodes,
  saveCachedAdminPayments,
  saveCachedAdminStudents,
  saveCachedMyAttempts,
  saveCollectionLastSyncMs,
  setLiveSyncState,
  type QueuedSyncOperation,
} from './syncManager';
import {
  ALL_SUBJECT_IDS,
  DEFAULT_ADMIN_NOTIFICATION_PREFS,
  getDefaultPrefix,
  getFixedPlanPrice,
  getSubjectDisplayName,
  resolveCodeSubjectId,
  resolvePaymentSubjectId,
  type AccessCode,
  type AccessCodeUsedBy,
  type AdminChatMessage,
  type AdminChatParticipantMeta,
  type AdminChatThread,
  type AdminInvite,
  type AdminNotificationCategory,
  type AdminNotificationItem,
  type AdminNotificationPrefs,
  type AdminNotificationRoute,
  type AdminUser,
  type AppReleaseConfig,
  type AppReleaseRecord,
  type ChatMessageStatus,
  type PaymentRequest,
  type PushBroadcastCategory,
  type PushBroadcastRecord,
  type PushBroadcastTargetRoute,
  type PublishAppUpdateInput,
  type QuizAttempt,
  type SendPushBroadcastInput,
  type StudentProfile,
  type SubjectId,
  type UpdateNotificationRecord,
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
export const COLLECTION_APP_RELEASES = 'app_releases';
export const COLLECTION_UPDATE_NOTIFICATIONS = 'update_notifications';

export const ADMIN_UPI_ID = '9099592283@upi';
export const ADMIN_UPI_NAME = 'KATRIYA KIRANKUMAR RAMESHBHAI';
export const ADMIN_PHONE_TEN_DIGITS = '9099592283';
export const ADMIN_PHONE_E164 = '+919099592283';
export const ADMIN_AUTH_EMAIL = 'admin9099592283@std10quiz.app';
export const ADMIN_OWNER_EMAIL = 'omsai3248@gmail.com';
export const ADMIN_PASSCODE = 'kkkk';

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_CODES_PAGE_SIZE = 600;
const RESUME_SESSION_THROTTLE_MS = 60_000;
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export {
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getNativeActiveStudentSnapshot,
  hasNativeFirebaseBridge,
  pauseNativeAdminListeners,
  resumeNativeAdminListeners,
  setNativeActiveStudentMobile,
  type AppAuthUser,
};

function isOfflineBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function canHitServer(): boolean {
  return !isOfflineBrowser() && !isQuotaCooldownActive();
}

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
      displayName: user.displayName ?? '',
      photoUrl: user.photoURL ?? '',
    });
  });
}

export async function signOutAdminSession(): Promise<void> {
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.signOutGoogle?.(callId);
    });
    return;
  }
  await signOut(auth);
}

let lastWebResumeCheckAtMs = 0;

export async function verifyActiveSessionOnResume(
  studentId?: string,
  force = false
): Promise<{
  studentProfile?: StudentProfile | null;
}> {
  if (hasNativeFirebaseBridge()) {
    triggerNativeActiveSessionCheck();
    return {};
  }
  const now = Date.now();
  if (!force && now - lastWebResumeCheckAtMs < RESUME_SESSION_THROTTLE_MS) {
    return {};
  }
  if (!canHitServer()) {
    return {};
  }
  lastWebResumeCheckAtMs = now;

  const out: { studentProfile?: StudentProfile | null } = {};
  if (studentId?.trim() && studentId.trim().startsWith('mob_')) {
    try {
      const snap = await getDocFromServer(doc(db, COLLECTION_STUDENTS, studentId.trim()));
      if (snap.exists()) {
        const mapped = mapStudentDoc(snap.id, snap.data());
        saveWebStudentBackup(mapped, false);
        out.studentProfile = mapped;
        markServerSyncSuccess();
      }
    } catch (err) {
      markServerSyncError(err);
    }
  }
  return out;
}

const verifiedMultiAdminEmails = new Set<string>([ADMIN_OWNER_EMAIL, ADMIN_AUTH_EMAIL]);

export function registerVerifiedAdminEmail(email = ''): void {
  const clean = email.trim().toLowerCase();
  if (clean) verifiedMultiAdminEmails.add(clean);
}

export function isSuperAdminEmail(email = ''): boolean {
  const clean = email.trim().toLowerCase();
  return clean === ADMIN_OWNER_EMAIL || clean === ADMIN_AUTH_EMAIL;
}

export function isAdminAccount(authPhone = '', authEmail = ''): boolean {
  const cleanEmail = (authEmail ?? '').trim().toLowerCase();
  if (cleanEmail && verifiedMultiAdminEmails.has(cleanEmail)) return true;
  const clean = (authPhone ?? '').trim();
  if (clean === ADMIN_PHONE_E164) return true;
  const digits = clean.replace(/\D/g, '').slice(-10);
  return digits === ADMIN_PHONE_TEN_DIGITS && clean.startsWith('+91');
}

async function verifyAuthorizedAdminWeb(uid: string, email: string, emailVerified: boolean): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === ADMIN_OWNER_EMAIL || cleanEmail === ADMIN_AUTH_EMAIL) {
    verifiedMultiAdminEmails.add(cleanEmail);
    return true;
  }
  if (!emailVerified || !cleanEmail) return false;
  try {
    const adminDoc = await getDoc(doc(db, 'admins', uid));
    if (adminDoc.exists() && adminDoc.data().isActive !== false) {
      verifiedMultiAdminEmails.add(cleanEmail);
      return true;
    }
    const inviteDoc = await getDoc(doc(db, 'admin_invites', cleanEmail));
    if (inviteDoc.exists()) {
      verifiedMultiAdminEmails.add(cleanEmail);
      return true;
    }
  } catch {
    // Ignore permission error if uninvited
  }
  return false;
}

export async function signInAdminWithGoogle(): Promise<AppAuthUser> {
  if (hasNativeFirebaseBridge()) {
    const user = await invokeNativeBridgeCall<AppAuthUser>((callId) => {
      window.AndroidFirebaseBridge?.requestGoogleSignIn?.(callId);
    });
    if (user && user.uid) {
      if (user.email) registerVerifiedAdminEmail(user.email);
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
    const ok = await verifyAuthorizedAdminWeb(
      cred.user.uid,
      email,
      Boolean(cred.user.emailVerified)
    );
    if (!ok) {
      await signOut(auth);
      throw new Error('ONLY_ADMIN_GOOGLE_EMAIL');
    }
    return {
      uid: cred.user.uid,
      email: cred.user.email ?? '',
      phoneNumber: cred.user.phoneNumber ?? '',
      emailVerified: Boolean(cred.user.emailVerified),
      displayName: cred.user.displayName ?? '',
      photoUrl: cred.user.photoURL ?? '',
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

export function generateUnique8CharCode(subjectId = 'all'): string {
  const prefix = getDefaultPrefix(subjectId);
  const arr = new Uint32Array(5);
  crypto.getRandomValues(arr);
  let out = prefix;
  for (let i = 0; i < 5; i++) {
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
    freeMockUsedSubjects: Array.isArray(d.freeMockUsedSubjects)
      ? d.freeMockUsedSubjects.map((x) => String(x))
      : [],
    paymentRequestIds: Array.isArray(d.paymentRequestIds)
      ? d.paymentRequestIds.map((x) => String(x))
      : [],
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
  const localBackup = loadWebStudentBackup(studentId);
  if (!canHitServer()) {
    return localBackup;
  }
  try {
    const snap = await getDoc(doc(db, COLLECTION_STUDENTS, studentId));
    if (!snap.exists()) return localBackup;
    const mapped = mapStudentDoc(snap.id, snap.data());
    saveWebStudentBackup(mapped, false);
    return mapped;
  } catch {
    return localBackup;
  }
}

export async function loginStudentByMobile(params: {
  mobileNumber: string;
  fullName?: string;
  email?: string;
}): Promise<StudentProfile> {
  const cleanMobile = params.mobileNumber.replace(/\D/g, '').slice(-10);
  const cleanName = (params.fullName ?? '').trim().slice(0, 60);
  const cleanEmail = (params.email ?? '').trim().slice(0, 120);
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

  if (hasNativeFirebaseBridge()) {
    const profile = await invokeNativeBridgeCall<StudentProfile>((callId) => {
      window.AndroidFirebaseBridge?.loginStudentByMobile?.(
        callId,
        JSON.stringify({
          mobileNumber: cleanMobile,
          fullName: cleanName,
        })
      );
    });
    const stId = profile.id || getStudentDocId(cleanMobile);
    knownSyncedStudentIds.add(stId);
    const stName = profile.fullName || cleanName || 'Student';
    if (profile.isReturningUser) {
      void logAdminActivityNotification({
        notifId: `login_${stId}_${Math.floor(Date.now() / 60_000)}`,
        category: 'login',
        title: `વિદ્યાર્થી લૉગિન: ${stName}`,
        body: `+91 ${cleanMobile} એપમાં લૉગિન થયા છે.`,
        actorName: stName,
        actorMobile: cleanMobile,
        actorId: stId,
        targetRoute: 'admin_students',
        referenceId: stId,
      });
    } else {
      void logAdminActivityNotification({
        notifId: `reg_${stId}`,
        category: 'registration',
        title: `નવો વિદ્યાર્થી: ${stName}`,
        body: `+91 ${cleanMobile} • નવું રજિસ્ટ્રેશન થયું છે.`,
        actorName: stName,
        actorMobile: cleanMobile,
        actorId: stId,
        targetRoute: 'admin_students',
        referenceId: stId,
      });
    }
    return profile;
  }

  const studentId = getStudentDocId(cleanMobile);
  const ref = doc(db, COLLECTION_STUDENTS, studentId);

  if (!canHitServer()) {
    const backup = loadWebStudentBackup(studentId);
    if (backup) {
      const effectiveName = cleanName || backup.fullName || 'Student';
      const restored: StudentProfile = {
        ...backup,
        fullName: effectiveName,
        email: cleanEmail || backup.email || '',
        isReturningUser: !backup.pendingServerSync,
      };
      saveWebStudentBackup(restored, Boolean(backup.pendingServerSync));
      return restored;
    }
    if (!cleanName) throw new Error('NAME_REQUIRED_FOR_NEW_USER');
    const localProfile: StudentProfile = {
      id: studentId,
      userId: studentId,
      fullName: cleanName,
      mobileNumber: cleanMobile,
      email: cleanEmail,
      standard: 'ધોરણ 10',
      hasQuizAccess: false,
      redeemedCode: '',
      paymentStatus: 'none',
      totalQuizzesTaken: 0,
      bestScorePercent: 0,
      unlockedSubjects: [],
      freeMockUsedSubjects: [],
      paymentRequestIds: [],
      isReturningUser: false,
      createdAt: null,
      updatedAt: null,
    };
    saveWebStudentBackup(localProfile, true);
    enqueueSyncOperation('student_profile_sync', `profile_${studentId}`, {
      studentId,
      fullName: cleanName,
      mobileNumber: cleanMobile,
      email: cleanEmail,
    });
    return localProfile;
  }

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
          email: cleanEmail,
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          freeMockUsedSubjects: [],
          paymentRequestIds: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          id: studentId,
          userId: studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: cleanEmail,
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          freeMockUsedSubjects: [],
          paymentRequestIds: [],
          isReturningUser: false,
          createdAt: null,
          updatedAt: null,
        } satisfies StudentProfile;
      }

      const d = snap.data();
      const existingName = String(d.fullName ?? '').trim();
      const existingEmail = String(d.email ?? '').trim();
      const effectiveName = cleanName || existingName || 'Student';
      const effectiveEmail = cleanEmail || existingEmail;
      const needsUpdate =
        (cleanName.length > 0 && cleanName !== existingName) ||
        (cleanEmail.length > 0 && cleanEmail !== existingEmail);

      if (needsUpdate) {
        tx.update(ref, {
          fullName: effectiveName,
          email: effectiveEmail,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        ...mapStudentDoc(snap.id, d),
        fullName: effectiveName,
        email: effectiveEmail,
        isReturningUser: true,
      };
    });

    knownSyncedStudentIds.add(studentId);
    saveWebStudentBackup(profile, false);
    markServerSyncSuccess();
    if (profile.isReturningUser) {
      void logAdminActivityNotification({
        notifId: `login_${studentId}_${Math.floor(Date.now() / 60_000)}`,
        category: 'login',
        title: `વિદ્યાર્થી લૉગિન: ${profile.fullName}`,
        body: `+91 ${cleanMobile} એપમાં લૉગિન થયા છે.`,
        actorName: profile.fullName,
        actorMobile: cleanMobile,
        actorId: studentId,
        targetRoute: 'admin_students',
        referenceId: studentId,
      });
    } else {
      void logAdminActivityNotification({
        notifId: `reg_${studentId}`,
        category: 'registration',
        title: `નવો વિદ્યાર્થી: ${profile.fullName}`,
        body: `+91 ${cleanMobile} • નવું રજિસ્ટ્રેશન થયું છે.`,
        actorName: profile.fullName,
        actorMobile: cleanMobile,
        actorId: studentId,
        targetRoute: 'admin_students',
        referenceId: studentId,
      });
    }
    return profile;
  } catch (error) {
    if (error instanceof Error && error.message === 'NAME_REQUIRED_FOR_NEW_USER') {
      throw error;
    }
    const kind = markServerSyncError(error);
    if (kind === 'quota' || kind === 'network' || kind === 'unknown') {
      const backup = loadWebStudentBackup(studentId);
      if (backup) {
        const effectiveName = cleanName || backup.fullName || 'Student';
        const restored: StudentProfile = {
          ...backup,
          fullName: effectiveName,
          email: cleanEmail || backup.email || '',
          isReturningUser: !backup.pendingServerSync,
        };
        saveWebStudentBackup(restored, Boolean(backup.pendingServerSync));
        return restored;
      }
      if (!isOfflineBrowser()) {
        if (!cleanName) throw new Error('NAME_REQUIRED_FOR_NEW_USER');
        const fallbackProfile: StudentProfile = {
          id: studentId,
          userId: studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: cleanEmail,
          standard: 'ધોરણ 10',
          hasQuizAccess: false,
          redeemedCode: '',
          paymentStatus: 'none',
          totalQuizzesTaken: 0,
          bestScorePercent: 0,
          unlockedSubjects: [],
          paymentRequestIds: [],
          isReturningUser: false,
          createdAt: null,
          updatedAt: null,
        };
        saveWebStudentBackup(fallbackProfile, true);
        enqueueSyncOperation('student_profile_sync', `profile_${studentId}`, {
          studentId,
          fullName: cleanName,
          mobileNumber: cleanMobile,
          email: cleanEmail,
        });
        return fallbackProfile;
      }
    }
    handleFirestoreError(error, OperationType.WRITE, ref.path);
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
  const cachedBackup = loadWebStudentBackup(userId);
  if (cachedBackup) {
    onData(cachedBackup);
  }
  if (!canHitServer()) {
    return () => {};
  }
  const ref = doc(db, COLLECTION_STUDENTS, userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        knownSyncedStudentIds.delete(userId);
        if (!cachedBackup) onData(null);
        return;
      }
      knownSyncedStudentIds.add(userId);
      const mapped = mapStudentDoc(snap.id, snap.data());
      saveWebStudentBackup(mapped, false);
      if (!snap.metadata.fromCache) {
        markServerSyncSuccess();
      }
      onData(mapped);
    },
    (error) => {
      markServerSyncError(error);
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
  const cached = loadWebStudentBackup(studentId);
  if (
    cached &&
    !cached.pendingServerSync &&
    cached.fullName === trimmedName &&
    cached.email === email.slice(0, 120)
  ) {
    return studentId;
  }

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
        freeMockUsedSubjects: [],
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
    markServerSyncSuccess();
    return studentId;
  } catch (error) {
    markServerSyncError(error);
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
    void logAdminActivityNotification({
      notifId: `pay_${requestId}`,
      category: 'payment',
      title: `નવી પેમેન્ટ વિનંતી: ${cleanName}`,
      body: `₹${cleanAmount} (${getSubjectDisplayName(normalizedSubject)}) • +91 ${cleanMobile}`,
      actorName: cleanName,
      actorMobile: cleanMobile,
      actorId: studentId,
      targetRoute: 'admin_requests',
      referenceId: requestId,
    });
    return requestId;
  }

  const utrLockRef = doc(db, COLLECTION_UTR_LOCKS, utrNormalized);
  const screenshotPath = `payment_screenshots/${uid}/${requestId}.jpg`;
  let screenshotUrl = '';

  if (isSignedInSession && canHitServer()) {
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
    markServerSyncSuccess();
    void logAdminActivityNotification({
      notifId: `pay_${requestId}`,
      category: 'payment',
      title: `નવી પેમેન્ટ વિનંતી: ${cleanName}`,
      body: `₹${cleanAmount} (${getSubjectDisplayName(normalizedSubject)}) • +91 ${cleanMobile}`,
      actorName: cleanName,
      actorMobile: cleanMobile,
      actorId: studentId,
      targetRoute: 'admin_requests',
      referenceId: requestId,
    });
    return requestId;
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_UTR') {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
    if (errMsg.includes('already exists') || errMsg.includes('permission')) {
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
    markServerSyncError(error);
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

      let chosenCode = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateUnique8CharCode(normalizedSubject);
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

    markServerSyncSuccess();
    return assignedCode;
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_PROCESSED') {
      throw error;
    }
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.UPDATE, reqRef.path);
  }
}

export async function rejectPaymentRequest(
  paymentRequest: PaymentRequest,
  adminNote: string
): Promise<void> {
  const cleanNote = (adminNote.trim() || 'પેમેન્ટ વિગત અથવા સ્ક્રીનશોટ અમાન્ય છે / Invalid payment proof').slice(0, 200);
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.rejectPayment?.(
        callId,
        JSON.stringify({
          requestId: paymentRequest.id,
          adminNote: cleanNote,
        })
      );
    });
    return;
  }

  requireUserId();
  if (!canHitServer()) {
    enqueueSyncOperation('admin_reject_payment', `reject_${paymentRequest.id}`, {
      requestId: paymentRequest.id,
      adminNote: cleanNote,
    });
    return;
  }
  const reqRef = doc(db, COLLECTION_PAYMENT_REQUESTS, paymentRequest.id);
  try {
    await updateDoc(reqRef, {
      status: 'rejected',
      adminNote: cleanNote,
      updatedAt: serverTimestamp(),
    });
    markServerSyncSuccess();
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota') {
      enqueueSyncOperation('admin_reject_payment', `reject_${paymentRequest.id}`, {
        requestId: paymentRequest.id,
        adminNote: cleanNote,
      });
    }
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
    const res = await invokeNativeBridgeCall<{ code: string; subjectId: string; amountRupees: number }>(
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
    void logAdminActivityNotification({
      notifId: `redeem_${res.code}`,
      category: 'code_redeem',
      title: `કોડ વપરાયો: ${res.code}`,
      body: `${cleanName} (+91 ${cleanMobile}) • ${getSubjectDisplayName(res.subjectId)}`,
      actorName: cleanName,
      actorMobile: cleanMobile,
      actorId: studentId,
      targetRoute: 'admin_codes',
      referenceId: res.code,
    });
    return res;
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

          const nextUnlocked = Array.from(unlockedSet).slice(0, 10);
          tx.update(studentRef, {
            hasQuizAccess: hasFull,
            redeemedCode: cleanCode,
            unlockedSubjects: nextUnlocked,
            updatedAt: serverTimestamp(),
          });

          const existingBackup = loadWebStudentBackup(studentId);
          if (existingBackup) {
            saveWebStudentBackup(
              {
                ...existingBackup,
                hasQuizAccess: hasFull,
                redeemedCode: cleanCode,
                unlockedSubjects: nextUnlocked,
              },
              false
            );
          }
        }

        markServerSyncSuccess();
        return {
          code: cleanCode,
          subjectId: codeSubjectId,
          amountRupees: Number(d.amountRupees ?? 0),
        };
      });

    try {
      const result = await executeRedeemTx();
      void logAdminActivityNotification({
        notifId: `redeem_${result.code}`,
        category: 'code_redeem',
        title: `કોડ વપરાયો: ${result.code}`,
        body: `${cleanName} (+91 ${cleanMobile}) • ${getSubjectDisplayName(result.subjectId)}`,
        actorName: cleanName,
        actorMobile: cleanMobile,
        actorId: studentId,
        targetRoute: 'admin_codes',
        referenceId: result.code,
      });
      return result;
    } catch (innerErr) {
      if (innerErr instanceof Error && innerErr.message === 'STUDENT_DOC_MISSING_RETRY') {
        await ensureStudentExistsWeb();
        const result = await executeRedeemTx();
        void logAdminActivityNotification({
          notifId: `redeem_${result.code}`,
          category: 'code_redeem',
          title: `કોડ વપરાયો: ${result.code}`,
          body: `${cleanName} (+91 ${cleanMobile}) • ${getSubjectDisplayName(result.subjectId)}`,
          actorName: cleanName,
          actorMobile: cleanMobile,
          actorId: studentId,
          targetRoute: 'admin_codes',
          referenceId: result.code,
        });
        return result;
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
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.UPDATE, codeRef.path);
  }
}

export async function generateBulkAccessCodes(
  count: number,
  batchName: string,
  subjectId = 'all'
): Promise<string[]> {
  const safeCount = Math.floor(Number(count));
  if (!Number.isFinite(safeCount) || safeCount < 1) {
    throw new Error('Please enter at least 1 code to generate.');
  }

  const normalizedSubject = ALL_SUBJECT_IDS.includes(subjectId as SubjectId) ? subjectId : 'all';
  const subjectLabel = getSubjectDisplayName(normalizedSubject);
  const cleanBatch = (batchName.trim() || `${subjectLabel} Batch`).slice(0, 60);

  if (hasNativeFirebaseBridge()) {
    return invokeNativeBridgeCall<string[]>((callId) => {
      window.AndroidFirebaseBridge?.generateBulkCodes?.(
        callId,
        JSON.stringify({ count: safeCount, batchName: cleanBatch, subjectId: normalizedSubject })
      );
    });
  }

  requireUserId();

  const generated: string[] = [];
  const seen = new Set<string>();
  while (generated.length < safeCount) {
    const code = generateUnique8CharCode(normalizedSubject);
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
    markServerSyncSuccess();
    return generated;
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_ACCESS_CODES);
  }
}

export interface DirectMobileCodeResult {
  code: string;
  mobileNumber: string;
  userName: string;
  subjectId: string;
  amountRupees: number;
}

export async function generateDirectCodeForMobile(params: {
  mobileNumber: string;
  userName?: string;
  subjectId?: string;
}): Promise<DirectMobileCodeResult> {
  const cleanMobile = params.mobileNumber.replace(/\D/g, '').slice(-10);
  if (!/^[0-9]{10}$/.test(cleanMobile)) {
    throw new Error('INVALID_MOBILE');
  }
  const rawName = (params.userName ?? '').trim().slice(0, 60);
  const normalizedSubject = ALL_SUBJECT_IDS.includes(params.subjectId as SubjectId)
    ? (params.subjectId as SubjectId)
    : 'all';

  if (hasNativeFirebaseBridge()) {
    return invokeNativeBridgeCall<DirectMobileCodeResult>((callId) => {
      window.AndroidFirebaseBridge?.generateDirectCodeForMobile?.(
        callId,
        JSON.stringify({
          mobileNumber: cleanMobile,
          userName: rawName,
          subjectId: normalizedSubject,
        })
      );
    });
  }

  requireUserId();
  const amountRupees = getFixedPlanPrice(normalizedSubject);
  const batchLabel = `${getSubjectDisplayName(normalizedSubject)} • ₹${amountRupees}`.slice(0, 60);

  let effectiveName = rawName;
  if (!effectiveName) {
    const cachedStudent = loadCachedAdminStudents().find(
      (s) => s.mobileNumber.replace(/\D/g, '').slice(-10) === cleanMobile
    );
    if (cachedStudent?.fullName) {
      effectiveName = cachedStudent.fullName.trim().slice(0, 60);
    } else {
      try {
        const stSnap = await getDoc(doc(db, COLLECTION_STUDENTS, `mob_${cleanMobile}`));
        if (stSnap.exists()) {
          effectiveName = String(stSnap.data().fullName ?? '').trim().slice(0, 60);
        }
      } catch {
        // Ignore optional name lookup errors
      }
    }
  }
  if (!effectiveName) effectiveName = 'Student';

  try {
    const chosenCode = await runTransaction(db, async (tx) => {
      let chosen = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateUnique8CharCode(normalizedSubject);
        const candRef = doc(db, COLLECTION_ACCESS_CODES, candidate);
        const candSnap = await tx.get(candRef);
        if (!candSnap.exists()) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) {
        throw new Error('Failed to generate unique 8-character code.');
      }

      const codeRef = doc(db, COLLECTION_ACCESS_CODES, chosen);
      tx.set(codeRef, {
        code: chosen,
        requestId: 'ADMIN-DIRECT',
        userName: effectiveName,
        mobileNumber: cleanMobile,
        amountRupees,
        batchName: batchLabel,
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
      return chosen;
    });

    markServerSyncSuccess();
    return {
      code: chosenCode,
      mobileNumber: cleanMobile,
      userName: effectiveName,
      subjectId: normalizedSubject,
      amountRupees,
    };
  } catch (error) {
    markServerSyncError(error);
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
  if (!canHitServer()) {
    return () => {};
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
      markServerSyncError(error);
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
  if (!canHitServer()) {
    return () => {};
  }

  // Cap live individual listeners to 5 recent IDs to save Firestore reads
  const trackedIds = validIds.slice(0, 5);
  const byId = new Map<string, PaymentRequest>();
  const emitSorted = () => {
    const items = Array.from(byId.values()).sort(
      (a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt)
    );
    onData(items);
  };

  const unsubs = trackedIds.map((id) => {
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
        // Ignore transient single-doc listener error
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

  // Hydrate from local cache immediately so offline / returning views render instantly
  const cached = loadCachedMyAttempts(userId);
  if (cached.length > 0) {
    onData(cached);
  }

  if (hasNativeFirebaseBridge()) {
    return subscribeNativeMyAttempts(userId, onData);
  }
  if (!canHitServer()) {
    return () => {};
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
      saveCachedMyAttempts(userId, items);
      onData(items);
    },
    (error) => {
      markServerSyncError(error);
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
}): Promise<QuizAttempt | null> {
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
  if (!uid) return null;

  const percentage = totalQuestions > 0 ? Math.floor((score * 100) / totalQuestions) : 0;
  const safeElapsed = Math.max(0, Math.min(7200, Math.round(timeTakenSeconds)));
  const attemptId = generateId('att');
  const nowSec = Math.floor(Date.now() / 1000);

  const localAttempt: QuizAttempt = {
    id: attemptId,
    userId: uid,
    subjectId,
    subjectTitle: subjectTitle.slice(0, 50),
    chapterTitle: chapterTitle.slice(0, 100),
    score,
    totalQuestions,
    percentage,
    timeTakenSeconds: safeElapsed,
    createdAt: {
      seconds: nowSec,
      nanoseconds: 0,
      toDate: () => new Date(nowSec * 1000),
      toMillis: () => nowSec * 1000,
    } as QuizAttempt['createdAt'],
  };

  // Immediately cache locally so quiz result is never lost even offline / quota exceeded
  const existingCached = loadCachedMyAttempts(uid);
  saveCachedMyAttempts(uid, [localAttempt, ...existingCached].slice(0, 20));

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
          timeTakenSeconds: safeElapsed,
        })
      );
    }).catch(() => {});
    void logAdminActivityNotification({
      notifId: `quiz_${attemptId}`,
      category: 'quiz_activity',
      title: `ક્વિઝ પૂર્ણ: ${subjectTitle}`,
      body: `${chapterTitle} • સ્કોર ${score}/${totalQuestions} (${percentage}%)`,
      actorName: '',
      actorMobile: uid.startsWith('mob_') ? uid.slice(4) : '',
      actorId: uid,
      targetRoute: 'admin_students',
      referenceId: attemptId,
    });
    return localAttempt;
  }

  const enqueueAttempt = () => {
    enqueueSyncOperation('quiz_attempt', `att_${uid}_${attemptId}`, {
      studentId: uid,
      attemptId,
      subjectId,
      subjectTitle: subjectTitle.slice(0, 50),
      chapterTitle: chapterTitle.slice(0, 100),
      score,
      totalQuestions,
      percentage,
      timeTakenSeconds: safeElapsed,
      previousTotalQuizzes,
      previousBestScore,
    });
  };

  if (!canHitServer()) {
    enqueueAttempt();
    return localAttempt;
  }

  const attemptRef = doc(db, COLLECTION_STUDENTS, uid, SUBCOLLECTION_QUIZ_ATTEMPTS, attemptId);
  const studentRef = doc(db, COLLECTION_STUDENTS, uid);

  try {
    await executeIdempotentQuizAttemptWrite({
      studentId: uid,
      attemptId,
      subjectId,
      subjectTitle: subjectTitle.slice(0, 50),
      chapterTitle: chapterTitle.slice(0, 100),
      score,
      totalQuestions,
      percentage,
      timeTakenSeconds: safeElapsed,
      previousTotalQuizzes,
      previousBestScore,
    });
    markServerSyncSuccess();
    void logAdminActivityNotification({
      notifId: `quiz_${attemptId}`,
      category: 'quiz_activity',
      title: `ક્વિઝ પૂર્ણ: ${subjectTitle}`,
      body: `${chapterTitle} • સ્કોર ${score}/${totalQuestions} (${percentage}%)`,
      actorName: '',
      actorMobile: uid.startsWith('mob_') ? uid.slice(4) : '',
      actorId: uid,
      targetRoute: 'admin_students',
      referenceId: attemptId,
    });
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota' || kind === 'unknown') {
      enqueueAttempt();
    } else {
      console.warn('recordQuizAttempt deferred:', error, attemptRef.path, studentRef.path);
    }
  }
  return localAttempt;
}

async function executeIdempotentQuizAttemptWrite(payload: {
  studentId: string;
  attemptId: string;
  subjectId: SubjectId;
  subjectTitle: string;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  previousTotalQuizzes: number;
  previousBestScore: number;
}): Promise<void> {
  const attemptRef = doc(
    db,
    COLLECTION_STUDENTS,
    payload.studentId,
    SUBCOLLECTION_QUIZ_ATTEMPTS,
    payload.attemptId
  );
  const studentRef = doc(db, COLLECTION_STUDENTS, payload.studentId);

  await runTransaction(db, async (tx) => {
    const [stSnap, attSnap] = await Promise.all([tx.get(studentRef), tx.get(attemptRef)]);
    if (!stSnap.exists() || attSnap.exists()) return;

    const currentTotal = Number(stSnap.data().totalQuizzesTaken ?? payload.previousTotalQuizzes);
    const currentBest = Number(stSnap.data().bestScorePercent ?? payload.previousBestScore);

    tx.set(attemptRef, {
      userId: payload.studentId,
      subjectId: payload.subjectId,
      subjectTitle: payload.subjectTitle.slice(0, 50),
      chapterTitle: payload.chapterTitle.slice(0, 100),
      score: payload.score,
      totalQuestions: payload.totalQuestions,
      percentage: payload.percentage,
      timeTakenSeconds: payload.timeTakenSeconds,
      createdAt: serverTimestamp(),
    });
    tx.update(studentRef, {
      totalQuizzesTaken: currentTotal + 1,
      bestScorePercent: Math.max(currentBest, payload.percentage),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function markFreeMockTestUsed(
  studentId: string,
  subjectId: SubjectId
): Promise<void> {
  const uid = studentId.trim();
  if (!uid || !ALL_SUBJECT_IDS.includes(subjectId)) return;

  const backup = loadWebStudentBackup(uid);
  if (backup) {
    const merged = Array.from(new Set([...(backup.freeMockUsedSubjects ?? []), subjectId])).slice(0, 3);
    saveWebStudentBackup({ ...backup, freeMockUsedSubjects: merged }, Boolean(backup.pendingServerSync));
  }

  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.markFreeMockTestUsed?.(
        callId,
        JSON.stringify({ studentId: uid, subjectId })
      );
    }).catch(() => {});
    return;
  }

  const enqueueUsed = () => {
    enqueueSyncOperation('free_mock_used', `freemock_${uid}_${subjectId}`, {
      studentId: uid,
      subjectId,
    });
  };

  if (!canHitServer()) {
    enqueueUsed();
    return;
  }

  try {
    await updateDoc(doc(db, COLLECTION_STUDENTS, uid), {
      freeMockUsedSubjects: arrayUnion(subjectId),
      updatedAt: serverTimestamp(),
    });
    markServerSyncSuccess();
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota' || kind === 'unknown') {
      enqueueUsed();
    }
  }
}

export function observeAllStudents(
  onData: (list: StudentProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAllStudents(onData, onError);
  }
  const cached = loadCachedAdminStudents();
  if (cached.length > 0) {
    onData(cached);
  }
  if (!canHitServer()) {
    setLiveSyncState('paused');
    return () => {};
  }
  setLiveSyncState('active');
  const colRef = collection(db, COLLECTION_STUDENTS);
  const q = query(colRef, orderBy('updatedAt', 'desc'), limit(ADMIN_PAGE_SIZE));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => mapStudentDoc(docSnap.id, docSnap.data()));
      const merged = mergeRecordsByIdNewer(loadCachedAdminStudents(), items);
      merged.sort((a, b) => timestampSortValue(b.updatedAt) - timestampSortValue(a.updatedAt));
      saveCachedAdminStudents(merged);
      if (!snap.metadata.fromCache) {
        markServerSyncSuccess();
        saveCollectionLastSyncMs(COLLECTION_STUDENTS, Date.now());
      }
      onData(merged);
    },
    (error) => {
      markServerSyncError(error);
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
  const cached = loadCachedAdminPayments();
  if (cached.length > 0) {
    onData(cached);
  }
  if (!canHitServer()) {
    setLiveSyncState('paused');
    return () => {};
  }
  setLiveSyncState('active');
  const colRef = collection(db, COLLECTION_PAYMENT_REQUESTS);
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(ADMIN_PAGE_SIZE));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => mapPaymentDoc(d.id, d.data()));
      const merged = mergeRecordsByIdNewer(loadCachedAdminPayments(), items);
      merged.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      saveCachedAdminPayments(merged);
      if (!snap.metadata.fromCache) {
        markServerSyncSuccess();
        saveCollectionLastSyncMs(COLLECTION_PAYMENT_REQUESTS, Date.now());
      }
      onData(merged);
    },
    (error) => {
      markServerSyncError(error);
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
  const cached = loadCachedAdminCodes();
  if (cached.length > 0) {
    onData(cached);
  }
  if (!canHitServer()) {
    setLiveSyncState('paused');
    return () => {};
  }
  setLiveSyncState('active');
  const colRef = collection(db, COLLECTION_ACCESS_CODES);
  const q = query(colRef, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => mapAccessCodeDoc(docSnap.id, docSnap.data()));
      items.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      saveCachedAdminCodes(items);
      if (!snap.metadata.fromCache) {
        markServerSyncSuccess();
        saveCollectionLastSyncMs(COLLECTION_ACCESS_CODES, Date.now());
      }
      onData(items);
    },
    (error) => {
      markServerSyncError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_ACCESS_CODES);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function loadMoreAdminPayments(
  cursorCreatedAt: Timestamp | null,
  pageSize = ADMIN_PAGE_SIZE
): Promise<{ items: PaymentRequest[]; hasMore: boolean }> {
  if (!cursorCreatedAt) return { items: [], hasMore: false };
  if (hasNativeFirebaseBridge()) {
    const rows = await loadMoreNativeAdminCollection<PaymentRequest>(
      'payment_requests',
      cursorCreatedAt.seconds
    );
    return { items: rows, hasMore: rows.length >= pageSize };
  }
  if (!canHitServer()) return { items: [], hasMore: false };
  const q = query(
    collection(db, COLLECTION_PAYMENT_REQUESTS),
    orderBy('createdAt', 'desc'),
    startAfter(cursorCreatedAt),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapPaymentDoc(d.id, d.data()));
  const merged = mergeRecordsByIdNewer(loadCachedAdminPayments(), items);
  merged.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
  saveCachedAdminPayments(merged);
  markServerSyncSuccess();
  return { items, hasMore: snap.docs.length >= pageSize };
}

export async function loadMoreAdminCodes(
  cursorCreatedAt: Timestamp | null,
  pageSize = ADMIN_CODES_PAGE_SIZE
): Promise<{ items: AccessCode[]; hasMore: boolean }> {
  if (!cursorCreatedAt) return { items: [], hasMore: false };
  if (hasNativeFirebaseBridge()) {
    const rows = await loadMoreNativeAdminCollection<AccessCode>(
      'access_codes',
      cursorCreatedAt.seconds
    );
    return { items: rows, hasMore: rows.length >= pageSize };
  }
  if (!canHitServer()) return { items: [], hasMore: false };
  const q = query(
    collection(db, COLLECTION_ACCESS_CODES),
    orderBy('createdAt', 'desc'),
    startAfter(cursorCreatedAt),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapAccessCodeDoc(d.id, d.data()));
  const merged = mergeRecordsByIdNewer(loadCachedAdminCodes(), items, (x) => x.code);
  merged.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
  saveCachedAdminCodes(merged);
  markServerSyncSuccess();
  return { items, hasMore: snap.docs.length >= pageSize };
}

export async function loadMoreAdminStudents(
  cursorUpdatedAt: Timestamp | null,
  pageSize = ADMIN_PAGE_SIZE
): Promise<{ items: StudentProfile[]; hasMore: boolean }> {
  if (!cursorUpdatedAt) return { items: [], hasMore: false };
  if (hasNativeFirebaseBridge()) {
    const rows = await loadMoreNativeAdminCollection<StudentProfile>(
      'students',
      cursorUpdatedAt.seconds
    );
    return { items: rows, hasMore: rows.length >= pageSize };
  }
  if (!canHitServer()) return { items: [], hasMore: false };
  const q = query(
    collection(db, COLLECTION_STUDENTS),
    orderBy('updatedAt', 'desc'),
    startAfter(cursorUpdatedAt),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapStudentDoc(d.id, d.data()));
  const merged = mergeRecordsByIdNewer(loadCachedAdminStudents(), items);
  merged.sort((a, b) => timestampSortValue(b.updatedAt) - timestampSortValue(a.updatedAt));
  saveCachedAdminStudents(merged);
  markServerSyncSuccess();
  return { items, hasMore: snap.docs.length >= pageSize };
}

export async function syncAdminDeltaSince(sinceMs: number): Promise<void> {
  if (hasNativeFirebaseBridge() || !canHitServer() || !auth.currentUser || sinceMs <= 0) {
    return;
  }
  const ts = Timestamp.fromMillis(Math.max(0, sinceMs - 5_000));
  try {
    const [paySnap, codeSnap, stSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTION_PAYMENT_REQUESTS), where('updatedAt', '>', ts), limit(50))),
      getDocs(query(collection(db, COLLECTION_ACCESS_CODES), where('updatedAt', '>', ts), limit(50))),
      getDocs(query(collection(db, COLLECTION_STUDENTS), where('updatedAt', '>', ts), limit(50))),
    ]);
    if (!paySnap.empty) {
      const merged = mergeRecordsByIdNewer(
        loadCachedAdminPayments(),
        paySnap.docs.map((d) => mapPaymentDoc(d.id, d.data()))
      );
      saveCachedAdminPayments(merged);
    }
    if (!codeSnap.empty) {
      const merged = mergeRecordsByIdNewer(
        loadCachedAdminCodes(),
        codeSnap.docs.map((d) => mapAccessCodeDoc(d.id, d.data())),
        (x) => x.code
      );
      saveCachedAdminCodes(merged);
    }
    if (!stSnap.empty) {
      const merged = mergeRecordsByIdNewer(
        loadCachedAdminStudents(),
        stSnap.docs.map((d) => mapStudentDoc(d.id, d.data()))
      );
      saveCachedAdminStudents(merged);
    }
    markServerSyncSuccess();
  } catch (err) {
    markServerSyncError(err);
  }
}

export async function flushPendingSyncOperations(options: { forceDue?: boolean } = {}): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (hasNativeFirebaseBridge()) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  return flushSyncQueue(async (op: QueuedSyncOperation) => {
    const p = op.payload;
    switch (op.type) {
      case 'quiz_attempt': {
        await executeIdempotentQuizAttemptWrite({
          studentId: String(p.studentId ?? ''),
          attemptId: String(p.attemptId ?? ''),
          subjectId: String(p.subjectId ?? 'maths') as SubjectId,
          subjectTitle: String(p.subjectTitle ?? ''),
          chapterTitle: String(p.chapterTitle ?? ''),
          score: Number(p.score ?? 0),
          totalQuestions: Number(p.totalQuestions ?? 0),
          percentage: Number(p.percentage ?? 0),
          timeTakenSeconds: Number(p.timeTakenSeconds ?? 0),
          previousTotalQuizzes: Number(p.previousTotalQuizzes ?? 0),
          previousBestScore: Number(p.previousBestScore ?? 0),
        });
        break;
      }
      case 'free_mock_used': {
        const uid = String(p.studentId ?? '').trim();
        const subId = String(p.subjectId ?? '').trim() as SubjectId;
        if (uid && ALL_SUBJECT_IDS.includes(subId)) {
          await updateDoc(doc(db, COLLECTION_STUDENTS, uid), {
            freeMockUsedSubjects: arrayUnion(subId),
            updatedAt: serverTimestamp(),
          });
        }
        break;
      }
      case 'student_profile_sync': {
        await loginStudentByMobile({
          mobileNumber: String(p.mobileNumber ?? ''),
          fullName: String(p.fullName ?? ''),
          email: String(p.email ?? ''),
        });
        break;
      }
      case 'admin_toggle_access': {
        requireUserId();
        const studentId = String(p.studentId ?? '');
        const grantAccess = Boolean(p.grantAccess);
        const redeemedCode = String(p.redeemedCode ?? '');
        await updateDoc(doc(db, COLLECTION_STUDENTS, studentId), {
          hasQuizAccess: grantAccess,
          unlockedSubjects: grantAccess ? ['all', ...ALL_SUBJECT_IDS] : [],
          ...(grantAccess ? { redeemedCode: redeemedCode || 'ADMIN-GRANTED' } : {}),
          updatedAt: serverTimestamp(),
        });
        break;
      }
      case 'admin_reject_payment': {
        requireUserId();
        const requestId = String(p.requestId ?? '');
        const adminNote = String(p.adminNote ?? '');
        await updateDoc(doc(db, COLLECTION_PAYMENT_REQUESTS, requestId), {
          status: 'rejected',
          adminNote: adminNote.slice(0, 200),
          updatedAt: serverTimestamp(),
        });
        break;
      }
      case 'admin_release_config': {
        requireUserId();
        await setDoc(doc(db, COLLECTION_APP_CONFIG, DOC_RELEASE_CONFIG), {
          githubOwnerRepo: String(p.githubOwnerRepo ?? '').slice(0, 120),
          releaseNotes: String(p.releaseNotes ?? '').slice(0, 300),
          updatedAt: serverTimestamp(),
        });
        break;
      }
      default:
        break;
    }
  }, options);
}

export async function toggleStudentQuizAccess(
  student: StudentProfile,
  grantAccess: boolean
): Promise<void> {
  if (student.hasQuizAccess === grantAccess && (grantAccess ? student.unlockedSubjects.includes('all') : student.unlockedSubjects.length === 0)) {
    return;
  }
  const studentId = (student.id || student.userId).trim();
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.toggleStudentQuizAccess?.(
        callId,
        JSON.stringify({
          studentId,
          grantAccess,
          redeemedCode: student.redeemedCode || '',
        })
      );
    });
    return;
  }
  requireUserId();
  if (!canHitServer()) {
    enqueueSyncOperation('admin_toggle_access', `toggle_${studentId}`, {
      studentId,
      grantAccess,
      redeemedCode: student.redeemedCode || '',
    });
    return;
  }
  const studentRef = doc(db, COLLECTION_STUDENTS, studentId);
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
    markServerSyncSuccess();
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota') {
      enqueueSyncOperation('admin_toggle_access', `toggle_${studentId}`, {
        studentId,
        grantAccess,
        redeemedCode: student.redeemedCode || '',
      });
    }
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
  const alreadyHas = currentSet.has(subjectId);
  if (alreadyHas === grantAccess) return;

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
    markServerSyncSuccess();
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.UPDATE, studentRef.path);
  }
}

export function observeReleaseConfig(onData: (cfg: AppReleaseConfig | null) => void): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeReleaseConfig(onData);
  }
  if (!canHitServer()) {
    return () => {};
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
        latestVersionName: String(d.latestVersionName ?? ''),
        latestVersionCode: Number(d.latestVersionCode ?? 0),
        updateTitle: String(d.updateTitle ?? ''),
        apkDownloadUrl: String(d.apkDownloadUrl ?? ''),
        apkStoragePath: String(d.apkStoragePath ?? ''),
        apkFileName: String(d.apkFileName ?? ''),
        apkSizeBytes: Number(d.apkSizeBytes ?? 0),
        apkSha256: String(d.apkSha256 ?? ''),
        signingCertSha256: String(d.signingCertSha256 ?? ''),
        packageName: String(d.packageName ?? ''),
        isMandatory: Boolean(d.isMandatory),
        publishedByUid: String(d.publishedByUid ?? ''),
        publishedAt: d.publishedAt ?? null,
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
  const cleanRepo = githubOwnerRepo.trim().slice(0, 120);
  const cleanNotes = releaseNotes.trim().slice(0, 1000);
  if (hasNativeFirebaseBridge()) {
    await invokeNativeBridgeCall((callId) => {
      window.AndroidFirebaseBridge?.saveReleaseConfig?.(
        callId,
        JSON.stringify({
          githubOwnerRepo: cleanRepo,
          releaseNotes: cleanNotes,
        })
      );
    });
    return;
  }
  requireUserId();
  if (!canHitServer()) {
    enqueueSyncOperation('admin_release_config', 'release_config', {
      githubOwnerRepo: cleanRepo,
      releaseNotes: cleanNotes,
    });
    return;
  }
  const ref = doc(db, COLLECTION_APP_CONFIG, DOC_RELEASE_CONFIG);
  try {
    await setDoc(
      ref,
      {
        githubOwnerRepo: cleanRepo,
        releaseNotes: cleanNotes,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    markServerSyncSuccess();
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota') {
      enqueueSyncOperation('admin_release_config', 'release_config', {
        githubOwnerRepo: cleanRepo,
        releaseNotes: cleanNotes,
      });
    }
    handleFirestoreError(error, OperationType.WRITE, ref.path);
  }
}

export function observeUpdateNotifications(
  onData: (list: UpdateNotificationRecord[]) => void
): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeUpdateNotifications(onData);
  }
  if (!canHitServer()) {
    return () => {};
  }
  const q = query(
    collection(db, COLLECTION_UPDATE_NOTIFICATIONS),
    orderBy('createdAt', 'desc'),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            releaseId: String(data.releaseId ?? d.id),
            appName: String(data.appName ?? 'Quick Quiz'),
            versionName: String(data.versionName ?? ''),
            versionCode: Number(data.versionCode ?? 1),
            title: String(data.title ?? ''),
            body: String(data.body ?? ''),
            isMandatory: Boolean(data.isMandatory),
            apkDownloadUrl: String(data.apkDownloadUrl ?? ''),
            targetRoute: 'app_update',
            pushDispatched: Boolean(data.pushDispatched),
            recipientCount: Number(data.recipientCount ?? 0),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        })
      );
    },
    () => {
      onData([]);
    }
  );
}

export function observeAppReleases(onData: (list: AppReleaseRecord[]) => void): Unsubscribe {
  if (!canHitServer()) return () => {};
  const q = query(
    collection(db, COLLECTION_APP_RELEASES),
    orderBy('createdAt', 'desc'),
    limit(15)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            versionName: String(data.versionName ?? ''),
            versionCode: Number(data.versionCode ?? 1),
            updateTitle: String(data.updateTitle ?? ''),
            releaseNotes: String(data.releaseNotes ?? ''),
            apkDownloadUrl: String(data.apkDownloadUrl ?? ''),
            apkStoragePath: String(data.apkStoragePath ?? ''),
            apkFileName: String(data.apkFileName ?? ''),
            apkSizeBytes: Number(data.apkSizeBytes ?? 0),
            apkSha256: String(data.apkSha256 ?? ''),
            signingCertSha256: String(data.signingCertSha256 ?? ''),
            packageName: String(data.packageName ?? ''),
            isMandatory: Boolean(data.isMandatory),
            publishedByUid: String(data.publishedByUid ?? ''),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        })
      );
    },
    () => {
      onData([]);
    }
  );
}

async function computeWebFileSha256Hex(file: File): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

export async function publishFirebaseAppUpdate(
  input: PublishAppUpdateInput
): Promise<{ releaseId: string; apkDownloadUrl: string; versionName: string; versionCode: number }> {
  const cleanVersionName = input.versionName.trim().slice(0, 32);
  const cleanVersionCode = Math.max(1, Math.min(1_000_000, Math.floor(input.versionCode)));
  const cleanTitle = (input.updateTitle.trim() || `Quick Quiz v${cleanVersionName}`).slice(0, 120);
  const cleanNotes = (input.releaseNotes.trim() || `નવું વર્ઝન v${cleanVersionName} ઉપલબ્ધ છે.`).slice(
    0,
    1000
  );

  if (!cleanVersionName) {
    throw new Error('Version number is required.');
  }

  if (hasNativeFirebaseBridge() && input.stagedFilePath) {
    const unsubProgress = input.onUploadProgress
      ? subscribeNativeApkUploadProgress((evt) => {
          input.onUploadProgress?.(
            evt.progressPercent ?? 0,
            evt.bytesTransferred ?? 0,
            evt.totalBytes ?? 0
          );
        })
      : () => {};
    try {
      return await publishNativeAppUpdate({
        stagedFilePath: input.stagedFilePath,
        versionName: cleanVersionName,
        versionCode: cleanVersionCode,
        updateTitle: cleanTitle,
        releaseNotes: cleanNotes,
        isMandatory: input.isMandatory,
        apkDownloadUrl: input.apkDownloadUrl,
        apkStoragePath: input.apkStoragePath,
        apkFileName: input.apkFileName,
        apkSizeBytes: input.apkSizeBytes,
        apkSha256: input.apkSha256,
        signingCertSha256: input.signingCertSha256,
        packageName: input.packageName,
        githubOwnerRepo: input.githubOwnerRepo,
      });
    } finally {
      unsubProgress();
    }
  }

  const user = auth.currentUser;
  if (!user) throw new Error('Admin sign-in is required to publish updates.');

  let apkDownloadUrl = (input.apkDownloadUrl ?? '').trim().slice(0, 2000);
  let apkStoragePath = (input.apkStoragePath ?? '').trim().slice(0, 300);
  let apkFileName = (input.apkFileName ?? '').trim().slice(0, 160);
  let apkSizeBytes = Number(input.apkSizeBytes ?? 0);
  let apkSha256 = (input.apkSha256 ?? '').trim().slice(0, 64);
  const signingCertSha256 = (input.signingCertSha256 ?? '').trim().slice(0, 64);
  const packageName = (input.packageName?.trim() || 'com.aistudio.std10quiz.kqxmtv').slice(0, 120);

  if (input.file) {
    const file = input.file;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      throw new Error('Please choose a valid .apk file.');
    }
    if (file.size <= 0 || file.size >= 250 * 1024 * 1024) {
      throw new Error('APK size must be between 1 byte and 250 MB.');
    }
    const safeVersionSlug = cleanVersionName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageFileName = `std10quiz_v${safeVersionSlug}_c${cleanVersionCode}_${Date.now()}.apk`;
    apkStoragePath = `app_releases/${storageFileName}`;
    apkFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
    apkSizeBytes = file.size;
    apkSha256 = await computeWebFileSha256Hex(file);

    const ref = storageRef(storage, apkStoragePath);
    const task = uploadBytesResumable(ref, file, {
      contentType: 'application/vnd.android.package-archive',
    });

    apkDownloadUrl = await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => {
          const total = snap.totalBytes > 0 ? snap.totalBytes : file.size;
          const pct = total > 0 ? Math.min(99, Math.round((snap.bytesTransferred * 100) / total)) : 0;
          input.onUploadProgress?.(pct, snap.bytesTransferred, total);
        },
        (err) => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            input.onUploadProgress?.(100, file.size, file.size);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  if (!apkDownloadUrl.startsWith('https://') || apkSizeBytes <= 0) {
    throw new Error('Please upload an APK file first.');
  }

  const releaseId = `rel_${cleanVersionCode}_${Date.now()}`;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(doc(db, COLLECTION_APP_RELEASES, releaseId), {
    versionName: cleanVersionName,
    versionCode: cleanVersionCode,
    updateTitle: cleanTitle,
    releaseNotes: cleanNotes,
    apkDownloadUrl,
    apkStoragePath: apkStoragePath || `app_releases/${apkFileName}`,
    apkFileName: apkFileName || `std10quiz_v${cleanVersionName}.apk`,
    apkSizeBytes,
    apkSha256,
    signingCertSha256,
    packageName,
    isMandatory: Boolean(input.isMandatory),
    publishedByUid: user.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(
    doc(db, COLLECTION_APP_CONFIG, DOC_RELEASE_CONFIG),
    {
      githubOwnerRepo: (input.githubOwnerRepo ?? '').trim().slice(0, 120),
      releaseNotes: cleanNotes,
      latestVersionName: cleanVersionName,
      latestVersionCode: cleanVersionCode,
      updateTitle: cleanTitle,
      apkDownloadUrl,
      apkStoragePath: apkStoragePath || `app_releases/${apkFileName}`,
      apkFileName: apkFileName || `std10quiz_v${cleanVersionName}.apk`,
      apkSizeBytes,
      apkSha256,
      signingCertSha256,
      packageName,
      isMandatory: Boolean(input.isMandatory),
      publishedByUid: user.uid,
      publishedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(doc(db, COLLECTION_UPDATE_NOTIFICATIONS, releaseId), {
    releaseId,
    appName: 'Quick Quiz',
    versionName: cleanVersionName,
    versionCode: cleanVersionCode,
    title: cleanTitle,
    body: cleanNotes,
    isMandatory: Boolean(input.isMandatory),
    apkDownloadUrl,
    targetRoute: 'app_update',
    pushDispatched: false,
    recipientCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await batch.commit();
  markServerSyncSuccess();
  return {
    releaseId,
    apkDownloadUrl,
    versionName: cleanVersionName,
    versionCode: cleanVersionCode,
  };
}

export async function deleteAppReleaseRecord(releaseId: string): Promise<void> {
  const cleanId = releaseId.trim();
  if (!cleanId) return;
  if (!hasNativeFirebaseBridge()) {
    requireUserId();
  }
  await deleteDoc(doc(db, COLLECTION_APP_RELEASES, cleanId)).catch(() => {});
  await deleteDoc(doc(db, COLLECTION_UPDATE_NOTIFICATIONS, cleanId)).catch(() => {});
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
    saveCachedAdminPayments(loadCachedAdminPayments().filter((p) => p.id !== req.id));
    markServerSyncSuccess();
  } catch (error) {
    markServerSyncError(error);
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
    saveCachedAdminCodes(loadCachedAdminCodes().filter((c) => c.code !== cleanCode));
    markServerSyncSuccess();
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.DELETE, codeRef.path);
  }
}

export async function fetchAccessCodesByBatchAdmin(batchName: string): Promise<AccessCode[]> {
  const cleanBatch = batchName.trim();
  if (!cleanBatch) return [];

  if (hasNativeFirebaseBridge()) {
    const items = await invokeNativeBridgeCall<AccessCode[]>((callId) => {
      window.AndroidFirebaseBridge?.fetchCodesByBatch?.(
        callId,
        JSON.stringify({ batchName: cleanBatch })
      );
    });
    const list = Array.isArray(items) ? items : [];
    list.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
    return list;
  }

  requireUserId();
  try {
    const q = query(
      collection(db, COLLECTION_ACCESS_CODES),
      where('batchName', '==', cleanBatch)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => mapAccessCodeDoc(d.id, d.data()));
    items.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
    if (items.length > 0) {
      const merged = mergeRecordsByIdNewer(loadCachedAdminCodes(), items, (x) => x.code);
      merged.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      saveCachedAdminCodes(merged);
    }
    markServerSyncSuccess();
    return items;
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.LIST, COLLECTION_ACCESS_CODES);
  }
}

export interface DeleteUnusedCodesResult {
  deletedCount: number;
  deletedCodes: string[];
}

export async function deleteUnusedAccessCodesAdmin(
  batchName?: string
): Promise<DeleteUnusedCodesResult> {
  const cleanBatch = (batchName ?? '').trim();

  if (hasNativeFirebaseBridge()) {
    const res = await invokeNativeBridgeCall<DeleteUnusedCodesResult>((callId) => {
      window.AndroidFirebaseBridge?.deleteUnusedAccessCodes?.(
        callId,
        JSON.stringify({ batchName: cleanBatch })
      );
    });
    return {
      deletedCount: Number(res?.deletedCount ?? 0),
      deletedCodes: Array.isArray(res?.deletedCodes) ? res.deletedCodes : [],
    };
  }

  requireUserId();
  const isDirectUntaggedOnly = cleanBatch === '__direct_untagged__';
  try {
    const q =
      cleanBatch && !isDirectUntaggedOnly
        ? query(collection(db, COLLECTION_ACCESS_CODES), where('batchName', '==', cleanBatch))
        : query(collection(db, COLLECTION_ACCESS_CODES), where('isUsed', '==', false));

    const snap = await getDocs(q);
    const unusedDocs = snap.docs.filter((docSnap) => {
      const data = docSnap.data();
      const isUsed = data.isUsed === true;
      const status = String(data.status ?? '').toLowerCase();
      const docBatch = String(data.batchName ?? '').trim();
      return !isUsed && status !== 'used' && (!isDirectUntaggedOnly || docBatch.length === 0);
    });

    const deletedCodes: string[] = [];
    for (let i = 0; i < unusedDocs.length; i += 400) {
      const chunk = unusedDocs.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const docSnap of chunk) {
        batch.delete(docSnap.ref);
        deletedCodes.push(String(docSnap.data().code ?? docSnap.id));
      }
      await batch.commit();
    }

    if (deletedCodes.length > 0) {
      const deletedSet = new Set(deletedCodes);
      saveCachedAdminCodes(loadCachedAdminCodes().filter((c) => !deletedSet.has(c.code)));
    }
    markServerSyncSuccess();
    return {
      deletedCount: deletedCodes.length,
      deletedCodes,
    };
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.DELETE, COLLECTION_ACCESS_CODES);
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
    saveCachedAdminStudents(
      loadCachedAdminStudents().filter((s) => (s.id || s.userId) !== studentId)
    );
    markServerSyncSuccess();
  } catch (error) {
    markServerSyncError(error);
    handleFirestoreError(error, OperationType.DELETE, studentRef.path);
  }
}

export { classifyFirestoreError };

// ============================================================================
// Notification Center, Push Permission, Multi-Admin & 1-to-1 Admin Messaging
// ============================================================================

export const COLLECTION_ADMINS = 'admins';
export const COLLECTION_ADMIN_INVITES = 'admin_invites';
export const COLLECTION_ADMIN_NOTIFICATIONS = 'admin_notifications';
export const COLLECTION_ADMIN_CHATS = 'admin_chats';
export const COLLECTION_PUSH_BROADCASTS = 'push_broadcasts';
export const SUBCOLLECTION_CHAT_MESSAGES = 'messages';

export function getAdminChatId(uidA: string, uidB: string): string {
  return [uidA.trim(), uidB.trim()]
    .sort()
    .join('__')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getNotificationPermissionState(): 'granted' | 'denied' | 'default' {
  if (hasNativeFirebaseBridge()) {
    return getNativeNotificationPermissionStatus();
  }
  if (typeof Notification !== 'undefined') {
    return Notification.permission;
  }
  return 'default';
}

export async function requestAppNotificationPermission(): Promise<'granted' | 'denied'> {
  if (hasNativeFirebaseBridge()) {
    return requestNativeNotificationPermission();
  }
  if (typeof Notification !== 'undefined') {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      return 'granted';
    }
    return 'denied';
  }
  return 'denied';
}

export function openAppNotificationSettings(): void {
  if (hasNativeFirebaseBridge()) {
    openNativeNotificationSettings();
  }
}

export function observePushBroadcasts(
  onData: (items: PushBroadcastRecord[]) => void
): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativePushBroadcasts(onData);
  }
  const q = query(
    collection(db, COLLECTION_PUSH_BROADCASTS),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: PushBroadcastRecord[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const rawCategory = String(d.category ?? 'admin_message');
        const category: PushBroadcastCategory =
          rawCategory === 'exam_notice' || rawCategory === 'app_update'
            ? rawCategory
            : 'admin_message';
        const rawRoute = String(d.targetRoute ?? 'home');
        const allowedRoutes: PushBroadcastTargetRoute[] = [
          'home',
          'mock_test',
          'app_update',
          'subject_maths',
          'subject_science',
          'subject_social_science',
          'subject_gujarati',
          'subject_hindi',
        ];
        const targetRoute: PushBroadcastTargetRoute = allowedRoutes.includes(
          rawRoute as PushBroadcastTargetRoute
        )
          ? (rawRoute as PushBroadcastTargetRoute)
          : 'home';
        return {
          id: docSnap.id,
          category,
          title: String(d.title ?? ''),
          body: String(d.body ?? ''),
          targetRoute,
          referenceId: String(d.referenceId ?? ''),
          senderUid: String(d.senderUid ?? ''),
          senderName: String(d.senderName ?? 'Quick Quiz Admin'),
          pushDispatched: Boolean(d.pushDispatched),
          recipientCount: Number(d.recipientCount ?? 0),
          createdAt: (d.createdAt as Timestamp | null) ?? null,
          updatedAt: (d.updatedAt as Timestamp | null) ?? null,
        };
      });
      onData(list);
    },
    () => {
      onData([]);
    }
  );
}

export async function sendPushBroadcastNotification(
  input: SendPushBroadcastInput
): Promise<string> {
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 600);
  if (!title || !body) {
    throw new Error('શીર્ષક અને સંદેશ બંને જરૂરી છે.');
  }
  const payload: SendPushBroadcastInput = {
    category: input.category,
    title,
    body,
    targetRoute: input.targetRoute,
    referenceId: (input.referenceId ?? '').trim().slice(0, 128),
  };
  if (hasNativeFirebaseBridge()) {
    return sendNativePushBroadcast(payload);
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Admin login required.');
  }
  const broadcastId = `bcast_${Date.now()}_${randomHex32().slice(0, 6)}`;
  const senderName = (
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'Quick Quiz Admin'
  ).slice(0, 80);
  await setDoc(doc(db, COLLECTION_PUSH_BROADCASTS, broadcastId), {
    category: payload.category,
    title: payload.title,
    body: payload.body,
    targetRoute: payload.targetRoute,
    referenceId: payload.referenceId ?? '',
    senderUid: user.uid,
    senderName,
    pushDispatched: false,
    recipientCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return broadcastId;
}

export async function deletePushBroadcastNotification(broadcastId: string): Promise<void> {
  const cleanId = broadcastId.trim();
  if (!cleanId) return;
  if (hasNativeFirebaseBridge()) {
    await deleteNativePushBroadcast(cleanId);
    return;
  }
  requireUserId();
  await deleteDoc(doc(db, COLLECTION_PUSH_BROADCASTS, cleanId));
}

export async function syncAdminProfileAndPushToken(): Promise<AdminUser | null> {
  if (hasNativeFirebaseBridge()) {
    return syncNativeAdminProfileAndFcmToken();
  }
  const user = auth.currentUser;
  if (!user) return null;
  const email = (user.email ?? '').trim().toLowerCase().slice(0, 120);
  const displayName = (user.displayName || email.split('@')[0] || 'Admin').slice(0, 80);
  const photoUrl = (user.photoURL ?? '').slice(0, 500);
  const isSuper = isSuperAdminEmail(email);
  const adminRef = doc(db, COLLECTION_ADMINS, user.uid);
  const existing = await getDoc(adminRef).catch(() => null);
  const prefs: AdminNotificationPrefs = existing?.exists()
    ? normalizeNotificationPrefs(existing.data().notificationPrefs)
    : { ...DEFAULT_ADMIN_NOTIFICATION_PREFS };

  if (!existing || !existing.exists()) {
    await setDoc(adminRef, {
      uid: user.uid,
      email,
      displayName,
      photoUrl,
      role: isSuper ? 'super_admin' : 'admin',
      isActive: true,
      notificationPrefs: prefs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(adminRef, {
      email,
      displayName,
      photoUrl,
      updatedAt: serverTimestamp(),
    });
  }

  return {
    uid: user.uid,
    email,
    displayName,
    photoUrl,
    role: isSuper ? 'super_admin' : 'admin',
    isActive: true,
    notificationPrefs: prefs,
    fcmTokenRegistered: false,
    createdAt: null,
    updatedAt: null,
  };
}

export async function updateAdminNotificationPrefs(prefs: AdminNotificationPrefs): Promise<void> {
  if (hasNativeFirebaseBridge()) {
    await updateNativeAdminNotificationPrefs(prefs);
    return;
  }
  const uid = requireUserId();
  await updateDoc(doc(db, COLLECTION_ADMINS, uid), {
    notificationPrefs: normalizeNotificationPrefs(prefs),
    updatedAt: serverTimestamp(),
  });
}

export async function inviteAdminByEmail(email: string, displayName: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase().slice(0, 120);
  const cleanName = (displayName.trim() || cleanEmail.split('@')[0] || 'Co-Admin').slice(0, 80);
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (hasNativeFirebaseBridge()) {
    await addNativeAdminInvite(cleanEmail, cleanName);
    return;
  }
  const uid = requireUserId();
  await setDoc(doc(db, COLLECTION_ADMIN_INVITES, cleanEmail), {
    email: cleanEmail,
    displayName: cleanName,
    addedByUid: uid,
    createdAt: serverTimestamp(),
  });
}

export async function removeAdminInviteByEmail(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  if (hasNativeFirebaseBridge()) {
    await removeNativeAdminInvite(cleanEmail);
    return;
  }
  requireUserId();
  await deleteDoc(doc(db, COLLECTION_ADMIN_INVITES, cleanEmail));
}

export async function logAdminActivityNotification(params: {
  notifId?: string;
  category: AdminNotificationCategory;
  title: string;
  body: string;
  actorName?: string;
  actorMobile?: string;
  actorId?: string;
  targetRoute?: AdminNotificationRoute;
  referenceId?: string;
}): Promise<void> {
  if (hasNativeFirebaseBridge()) {
    await logNativeAdminNotificationEvent(params);
    return;
  }
  if (!canHitServer()) return;
  const cleanId =
    params.notifId?.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) ||
    `evt_${randomHex32().slice(0, 20)}`;
  const ref = doc(db, COLLECTION_ADMIN_NOTIFICATIONS, cleanId);
  try {
    await setDoc(ref, {
      category: params.category,
      title: (params.title || 'નવી સૂચના').slice(0, 120),
      body: (params.body || 'એપ અપડેટ').slice(0, 400),
      actorName: (params.actorName ?? '').slice(0, 80),
      actorMobile: (params.actorMobile ?? '').slice(0, 15),
      actorId: (params.actorId ?? '').slice(0, 128),
      targetRoute: params.targetRoute ?? 'admin_notifications',
      referenceId: (params.referenceId ?? '').slice(0, 128),
      isRead: false,
      readBy: [],
      pushDispatched: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal: e.g. deterministic doc already exists or offline
  }
}

function normalizeNotificationPrefs(raw: unknown): AdminNotificationPrefs {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    registrations: obj.registrations !== false,
    logins: obj.logins !== false,
    payments: obj.payments !== false,
    codeRedemptions: obj.codeRedemptions !== false,
    quizActivity: obj.quizActivity !== false,
    dataUpdates: obj.dataUpdates !== false,
    adminChat: obj.adminChat !== false,
  };
}

function mapAdminUserDoc(id: string, d: Record<string, unknown>): AdminUser {
  const email = String(d.email ?? '').trim().toLowerCase();
  return {
    uid: String(d.uid ?? id),
    email,
    displayName: String(d.displayName ?? email.split('@')[0] ?? 'Admin'),
    photoUrl: String(d.photoUrl ?? ''),
    role: d.role === 'super_admin' || isSuperAdminEmail(email) ? 'super_admin' : 'admin',
    isActive: d.isActive !== false,
    notificationPrefs: normalizeNotificationPrefs(d.notificationPrefs),
    createdAt: (d.createdAt as AdminUser['createdAt']) ?? null,
    updatedAt: (d.updatedAt as AdminUser['updatedAt']) ?? null,
  };
}

function mapAdminNotificationDoc(id: string, d: Record<string, unknown>): AdminNotificationItem {
  return {
    id,
    category: (d.category as AdminNotificationCategory) ?? 'data_update',
    title: String(d.title ?? ''),
    body: String(d.body ?? ''),
    actorName: String(d.actorName ?? ''),
    actorMobile: String(d.actorMobile ?? ''),
    actorId: String(d.actorId ?? ''),
    targetRoute: (d.targetRoute as AdminNotificationRoute) ?? 'admin_notifications',
    referenceId: String(d.referenceId ?? ''),
    isRead: Boolean(d.isRead),
    readBy: Array.isArray(d.readBy) ? d.readBy.map((x) => String(x)) : [],
    pushDispatched: Boolean(d.pushDispatched),
    createdAt: (d.createdAt as AdminNotificationItem['createdAt']) ?? null,
    updatedAt: (d.updatedAt as AdminNotificationItem['updatedAt']) ?? null,
  };
}

function mapAdminChatDoc(id: string, d: Record<string, unknown>): AdminChatThread {
  const rawMeta = (d.participantMeta && typeof d.participantMeta === 'object'
    ? d.participantMeta
    : {}) as Record<string, Record<string, unknown>>;
  const participantMeta: Record<string, AdminChatParticipantMeta> = {};
  Object.entries(rawMeta).forEach(([uid, val]) => {
    participantMeta[uid] = {
      displayName: String(val?.displayName ?? 'Admin'),
      photoUrl: String(val?.photoUrl ?? ''),
    };
  });

  const rawUnread = (d.unreadCounts && typeof d.unreadCounts === 'object'
    ? d.unreadCounts
    : {}) as Record<string, unknown>;
  const unreadCounts: Record<string, number> = {};
  Object.entries(rawUnread).forEach(([uid, val]) => {
    unreadCounts[uid] = Number(val ?? 0);
  });

  return {
    id,
    participants: Array.isArray(d.participants) ? d.participants.map((x) => String(x)) : [],
    participantMeta,
    lastMessageText: String(d.lastMessageText ?? ''),
    lastMessageSenderUid: String(d.lastMessageSenderUid ?? ''),
    lastMessageSenderName: String(d.lastMessageSenderName ?? ''),
    lastMessageStatus: (d.lastMessageStatus as ChatMessageStatus) ?? 'sent',
    lastMessageAt: (d.lastMessageAt as AdminChatThread['lastMessageAt']) ?? null,
    unreadCounts,
    createdAt: (d.createdAt as AdminChatThread['createdAt']) ?? null,
    updatedAt: (d.updatedAt as AdminChatThread['updatedAt']) ?? null,
  };
}

function mapAdminChatMessageDoc(id: string, d: Record<string, unknown>): AdminChatMessage {
  return {
    id,
    chatId: String(d.chatId ?? ''),
    senderUid: String(d.senderUid ?? ''),
    senderName: String(d.senderName ?? 'Admin'),
    senderPhotoUrl: String(d.senderPhotoUrl ?? ''),
    recipientUid: String(d.recipientUid ?? ''),
    participantUids: Array.isArray(d.participantUids)
      ? d.participantUids.map((x) => String(x))
      : [],
    text: String(d.text ?? ''),
    status: (d.status as ChatMessageStatus) ?? 'sent',
    deliveredAt: (d.deliveredAt as AdminChatMessage['deliveredAt']) ?? null,
    readAt: (d.readAt as AdminChatMessage['readAt']) ?? null,
    createdAt: (d.createdAt as AdminChatMessage['createdAt']) ?? null,
    updatedAt: (d.updatedAt as AdminChatMessage['updatedAt']) ?? null,
  };
}

export function observeAdminDirectory(onData: (list: AdminUser[]) => void): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminDirectory((list) => {
      list.forEach((u) => {
        if (u.isActive && u.email) registerVerifiedAdminEmail(u.email);
      });
      onData(list);
    });
  }
  if (!canHitServer()) return () => {};
  return onSnapshot(
    collection(db, COLLECTION_ADMINS),
    (snap) => {
      const list = snap.docs.map((d) => mapAdminUserDoc(d.id, d.data()));
      list.forEach((u) => {
        if (u.isActive && u.email) registerVerifiedAdminEmail(u.email);
      });
      onData(list);
    },
    () => {}
  );
}

export function observeAdminInvites(
  isSuper: boolean,
  onData: (list: AdminInvite[]) => void
): Unsubscribe {
  if (!isSuper) {
    onData([]);
    return () => {};
  }
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminInvites(onData);
  }
  if (!canHitServer()) return () => {};
  const q = query(collection(db, COLLECTION_ADMIN_INVITES), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          email: String(d.data().email ?? d.id),
          displayName: String(d.data().displayName ?? ''),
          addedByUid: String(d.data().addedByUid ?? ''),
          createdAt: (d.data().createdAt as AdminInvite['createdAt']) ?? null,
        }))
      );
    },
    () => {}
  );
}

export function observeAdminNotifications(
  onData: (list: AdminNotificationItem[]) => void
): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminNotifications(onData);
  }
  if (!canHitServer()) return () => {};
  const q = query(
    collection(db, COLLECTION_ADMIN_NOTIFICATIONS),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapAdminNotificationDoc(d.id, d.data())));
    },
    () => {}
  );
}

export async function markAdminNotificationAsRead(notifId: string): Promise<void> {
  if (!notifId.trim()) return;
  if (hasNativeFirebaseBridge()) {
    await markNativeAdminNotificationRead(notifId);
    return;
  }
  const uid = requireUserId();
  await updateDoc(doc(db, COLLECTION_ADMIN_NOTIFICATIONS, notifId.trim()), {
    isRead: true,
    readBy: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function markAllAdminNotificationsAsRead(): Promise<void> {
  if (hasNativeFirebaseBridge()) {
    await markAllNativeAdminNotificationsRead();
    return;
  }
  const uid = requireUserId();
  const snap = await getDocs(
    query(
      collection(db, COLLECTION_ADMIN_NOTIFICATIONS),
      where('isRead', '==', false),
      limit(100)
    )
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      isRead: true,
      readBy: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function deleteAdminNotificationItem(notifId: string): Promise<void> {
  if (!notifId.trim()) return;
  if (hasNativeFirebaseBridge()) {
    await deleteNativeAdminNotification(notifId);
    return;
  }
  requireUserId();
  await deleteDoc(doc(db, COLLECTION_ADMIN_NOTIFICATIONS, notifId.trim()));
}

export function observeAdminChats(
  myUid: string,
  onData: (list: AdminChatThread[]) => void
): Unsubscribe {
  if (!myUid.trim()) {
    onData([]);
    return () => {};
  }
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminChats(onData);
  }
  if (!canHitServer()) return () => {};
  const q = query(
    collection(db, COLLECTION_ADMIN_CHATS),
    where('participants', 'array-contains', myUid),
    orderBy('lastMessageAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapAdminChatDoc(d.id, d.data())));
    },
    () => {}
  );
}

export function observeAdminChatMessages(
  chatId: string,
  myUid: string,
  onData: (list: AdminChatMessage[]) => void
): Unsubscribe {
  if (!chatId.trim() || !myUid.trim()) {
    onData([]);
    return () => {};
  }
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminChatMessages(chatId, onData);
  }
  if (!canHitServer()) return () => {};
  const q = query(
    collection(db, COLLECTION_ADMIN_CHATS, chatId, SUBCOLLECTION_CHAT_MESSAGES),
    where('participantUids', 'array-contains', myUid),
    orderBy('createdAt', 'asc'),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => mapAdminChatMessageDoc(d.id, d.data()));
      onData(items);

      // Mark any incoming 'sent' messages as 'delivered'
      const toDeliver = snap.docs.filter(
        (d) => d.data().recipientUid === myUid && d.data().status === 'sent'
      );
      if (toDeliver.length > 0) {
        const batch = writeBatch(db);
        const now = serverTimestamp();
        toDeliver.forEach((d) => {
          batch.update(d.ref, { status: 'delivered', deliveredAt: now, updatedAt: now });
        });
        batch.commit().catch(() => {});
      }
    },
    () => {}
  );
}

export async function sendAdminChatMessage(params: {
  recipientUid: string;
  recipientName: string;
  recipientPhotoUrl?: string;
  text: string;
}): Promise<{ chatId: string; messageId: string }> {
  const cleanText = params.text.trim().slice(0, 2000);
  if (!params.recipientUid.trim() || !cleanText) {
    throw new Error('EMPTY_MESSAGE');
  }
  if (hasNativeFirebaseBridge()) {
    return sendNativeAdminChatMessage({
      recipientUid: params.recipientUid.trim(),
      recipientName: params.recipientName.trim(),
      recipientPhotoUrl: (params.recipientPhotoUrl ?? '').trim(),
      text: cleanText,
    });
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication session not ready.');
  const recipientUid = params.recipientUid.trim();
  const participants = [user.uid, recipientUid].sort();
  const chatId = getAdminChatId(user.uid, recipientUid);
  const myName = (user.displayName || user.email?.split('@')[0] || 'Admin').slice(0, 80);
  const myPhoto = (user.photoURL ?? '').slice(0, 500);
  const recipientName = (params.recipientName.trim() || 'Admin').slice(0, 80);
  const recipientPhoto = (params.recipientPhotoUrl ?? '').trim().slice(0, 500);

  const chatRef = doc(db, COLLECTION_ADMIN_CHATS, chatId);
  const msgId = `msg_${Date.now()}_${randomHex32().slice(0, 8)}`;
  const msgRef = doc(db, COLLECTION_ADMIN_CHATS, chatId, SUBCOLLECTION_CHAT_MESSAGES, msgId);

  const existingChat = await getDoc(chatRef).catch(() => null);
  const existingUnread = Number(existingChat?.data()?.unreadCounts?.[recipientUid] ?? 0);
  const now = serverTimestamp();
  const chatPayload = {
    participants,
    participantMeta: {
      [user.uid]: { displayName: myName, photoUrl: myPhoto },
      [recipientUid]: { displayName: recipientName, photoUrl: recipientPhoto },
    },
    lastMessageText: cleanText.slice(0, 500),
    lastMessageSenderUid: user.uid,
    lastMessageSenderName: myName,
    lastMessageStatus: 'sent',
    lastMessageAt: now,
    unreadCounts: {
      [user.uid]: 0,
      [recipientUid]: existingUnread + 1,
    },
    updatedAt: now,
  };

  if (!existingChat || !existingChat.exists()) {
    await setDoc(chatRef, { ...chatPayload, createdAt: now });
  } else {
    await updateDoc(chatRef, chatPayload);
  }

  await setDoc(msgRef, {
    chatId,
    senderUid: user.uid,
    senderName: myName,
    senderPhotoUrl: myPhoto,
    recipientUid,
    participantUids: participants,
    text: cleanText,
    status: 'sent',
    createdAt: now,
    updatedAt: now,
  });

  return { chatId, messageId: msgId };
}

export async function markAdminChatMessagesRead(chatId: string): Promise<void> {
  if (!chatId.trim()) return;
  if (hasNativeFirebaseBridge()) {
    await markNativeChatMessagesRead(chatId);
    return;
  }
  const user = auth.currentUser;
  if (!user) return;
  const chatRef = doc(db, COLLECTION_ADMIN_CHATS, chatId.trim());
  const msgsSnap = await getDocs(
    query(
      collection(db, COLLECTION_ADMIN_CHATS, chatId.trim(), SUBCOLLECTION_CHAT_MESSAGES),
      where('participantUids', 'array-contains', user.uid),
      where('recipientUid', '==', user.uid),
      limit(100)
    )
  );

  const batch = writeBatch(db);
  const now = serverTimestamp();
  let hasChanges = false;
  msgsSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.status !== 'read') {
      hasChanges = true;
      batch.update(d.ref, {
        status: 'read',
        ...(data.deliveredAt ? {} : { deliveredAt: now }),
        readAt: now,
        updatedAt: now,
      });
    }
  });

  const chatSnap = await getDoc(chatRef).catch(() => null);
  if (chatSnap && chatSnap.exists()) {
    const data = chatSnap.data();
    const unreadCounts = { ...(data.unreadCounts ?? {}), [user.uid]: 0 };
    const hadUnread = Number(data.unreadCounts?.[user.uid] ?? 0) > 0;
    const chatUpdates: Record<string, FieldValue | string | Record<string, number>> = {
      unreadCounts,
      updatedAt: now,
    };
    if (data.lastMessageSenderUid !== user.uid && data.lastMessageStatus !== 'read') {
      chatUpdates.lastMessageStatus = 'read';
      hasChanges = true;
    }
    if (hadUnread || hasChanges) {
      batch.update(chatRef, chatUpdates);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await batch.commit();
  }
}

