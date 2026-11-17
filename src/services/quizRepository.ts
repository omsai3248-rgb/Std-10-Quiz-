import {
  Timestamp,
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
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db, googleProvider, storage, studentGoogleProvider } from '../firebase';
import {
  DEFAULT_WEB_OAUTH_CLIENT_ID,
  clearDriveAccessToken,
  deserializeBackupAttempt,
  fetchGoogleUserInfo,
  getStoredDriveAccessToken,
  loadGmailSessionMeta,
  loadLocalGmailBackup,
  loadStudentDataFromDrive,
  mergeStudentDriveBackups,
  normalizeGmail,
  requestGoogleDriveAccessTokenViaGis,
  saveGmailSessionMeta,
  saveLocalGmailBackup,
  saveStudentDataToDrive,
  storeDriveAccessToken,
  verifyDriveTokenHasAccess,
  type GmailStudentSessionMeta,
  type StudentDriveBackupData,
} from './googleDriveSync';
import {
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getNativeActiveStudentSnapshot,
  getNativeCurrentAuthUser,
  hasNativeFirebaseBridge,
  invokeNativeBridgeCall,
  loadMoreNativeAdminCollection,
  notifyNativeAuthUser,
  pauseNativeAdminListeners,
  resetNativeAdminSessionDeviceCache,
  resumeNativeAdminListeners,
  setNativeActiveStudentMobile,
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

export const ADMIN_PAGE_SIZE = 25;
const RESUME_SESSION_THROTTLE_MS = 60_000;
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export {
  forceRefreshNativeAdminListeners,
  getActiveFirebaseSummary,
  getCurrentDeviceIdentity,
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
  if (!canHitServer()) return;
  requireUserId();
  const ref = doc(db, COLLECTION_ADMIN_SESSIONS, DOC_ADMIN_SESSION_PRIMARY);
  try {
    await setDoc(ref, {
      activeDeviceId: deviceId,
      activeDeviceName: deviceName,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('claimAdminSessionDevice deferred:', err);
  }
}

export function observeAdminSessionDevice(onDeviceId: (deviceId: string) => void): Unsubscribe {
  if (hasNativeFirebaseBridge()) {
    return subscribeNativeAdminSessionDevice(onDeviceId);
  }
  if (!canHitServer()) {
    return () => {};
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

let lastWebResumeCheckAtMs = 0;

export async function verifyActiveSessionOnResume(
  studentId?: string,
  isAdminActive = false,
  force = false
): Promise<{
  studentProfile?: StudentProfile | null;
  adminDeviceId?: string;
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

  const out: { studentProfile?: StudentProfile | null; adminDeviceId?: string } = {};
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
  if (isAdminActive && Date.now() - lastWebAdminClaimAtMs >= 4000) {
    try {
      const snap = await getDocFromServer(doc(db, COLLECTION_ADMIN_SESSIONS, DOC_ADMIN_SESSION_PRIMARY));
      if (snap.exists()) {
        out.adminDeviceId = String(snap.data().activeDeviceId ?? '').trim();
        markServerSyncSuccess();
      }
    } catch (err) {
      markServerSyncError(err);
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

export interface StudentGmailSignInResult {
  session: GmailStudentSessionMeta;
  accessToken: string | null;
  backup: StudentDriveBackupData | null;
  driveFileId: string;
}

function getConfiguredWebOAuthClientId(): string {
  const fromCfg =
    typeof firebaseConfig === 'object' && firebaseConfig && 'oAuthClientId' in firebaseConfig
      ? String((firebaseConfig as { oAuthClientId?: string }).oAuthClientId ?? '').trim()
      : '';
  return fromCfg || DEFAULT_WEB_OAUTH_CLIENT_ID;
}

export async function signInStudentWithGmail(): Promise<StudentGmailSignInResult> {
  const clientId = getConfiguredWebOAuthClientId();

  let accessToken: string | null = null;
  let expiresIn = 3300;
  let uid = '';
  let email = '';
  let displayName = '';
  let photoUrl = '';

  // Primary Web path: Google Identity Services token flow with drive.file + profile + email scopes.
  // This requests Drive permission in one consent screen and works cleanly on any authorized Web origin.
  try {
    const tokenRes = await requestGoogleDriveAccessTokenViaGis({
      clientId,
      prompt: 'select_account',
    });
    accessToken = tokenRes.accessToken;
    expiresIn = tokenRes.expiresIn;

    const info = await fetchGoogleUserInfo(accessToken);
    email = normalizeGmail(info.email);
    uid = info.sub ? `gmail_${info.sub}` : `gmail_${email.replace(/[^a-z0-9]/g, '_')}`;
    displayName = info.name || email.split('@')[0] || 'Student';
    photoUrl = info.picture;
  } catch (gisErr) {
    const gisMsg = gisErr instanceof Error ? gisErr.message : String(gisErr ?? '');
    if (gisMsg === 'SIGN_IN_CANCELLED') {
      throw gisErr;
    }

    // Fallback path: Firebase Auth Google Popup (if GIS script couldn't load or popup needed Firebase fallback)
    try {
      const cred = await signInWithPopup(auth, studentGoogleProvider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      accessToken = oauthCred?.accessToken ?? null;
      email = normalizeGmail(cred.user.email ?? '');
      uid = `gmail_${cred.user.uid}`;
      displayName = (cred.user.displayName ?? email.split('@')[0] ?? 'Student').slice(0, 60);
      photoUrl = cred.user.photoURL ?? '';
      if (accessToken) {
        const hasDrive = await verifyDriveTokenHasAccess(accessToken);
        if (!hasDrive) {
          accessToken = null;
        }
      }
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr ?? '');
      if (fbMsg.toLowerCase().includes('popup-closed') || fbMsg.toLowerCase().includes('cancelled')) {
        throw new Error('SIGN_IN_CANCELLED');
      }
      throw gisErr;
    }
  }

  if (!email) {
    throw new Error('GOOGLE_EMAIL_MISSING');
  }

  if (accessToken) {
    storeDriveAccessToken(accessToken, email, expiresIn);
  }

  const session: GmailStudentSessionMeta = {
    uid,
    email,
    displayName: displayName.slice(0, 60),
    photoUrl,
  };
  saveGmailSessionMeta(session);

  const localBackup = loadLocalGmailBackup(email);
  let remoteDriveBackup: StudentDriveBackupData | null = null;
  let driveFileId = '';

  if (accessToken && canHitServer()) {
    try {
      const loaded = await loadStudentDataFromDrive(accessToken, email);
      remoteDriveBackup = loaded.data;
      driveFileId = loaded.fileId;
    } catch (err) {
      console.warn('Initial Google Drive load fallback to local cache:', err);
    }
  }

  let mergedBackup = mergeStudentDriveBackups(localBackup, remoteDriveBackup);

  // If the restored backup has a linked 10-digit mobile number, reconcile any server-side unlocks once
  const linkedMobile = mergedBackup?.profile.mobileNumber?.replace(/\D/g, '').slice(-10) ?? '';
  if (/^[0-9]{10}$/.test(linkedMobile) && canHitServer()) {
    try {
      const remoteProfile = await lookupStudentByMobile(linkedMobile);
      if (remoteProfile && mergedBackup) {
        const mergedUnlocked = Array.from(
          new Set([
            ...(mergedBackup.profile.unlockedSubjects ?? []),
            ...(remoteProfile.unlockedSubjects ?? []),
            ...(remoteProfile.hasQuizAccess ? ['all', ...ALL_SUBJECT_IDS] : []),
          ])
        );
        const hasFull =
          remoteProfile.hasQuizAccess ||
          mergedBackup.profile.hasQuizAccess ||
          mergedUnlocked.includes('all') ||
          ALL_SUBJECT_IDS.every((s) => mergedUnlocked.includes(s));

        mergedBackup = {
          ...mergedBackup,
          profile: {
            ...mergedBackup.profile,
            fullName: mergedBackup.profile.fullName || remoteProfile.fullName,
            hasQuizAccess: hasFull,
            redeemedCode: remoteProfile.redeemedCode || mergedBackup.profile.redeemedCode,
            paymentStatus:
              remoteProfile.paymentStatus !== 'none'
                ? remoteProfile.paymentStatus
                : mergedBackup.profile.paymentStatus,
            totalQuizzesTaken: Math.max(
              mergedBackup.profile.totalQuizzesTaken,
              remoteProfile.totalQuizzesTaken
            ),
            bestScorePercent: Math.max(
              mergedBackup.profile.bestScorePercent,
              remoteProfile.bestScorePercent
            ),
            unlockedSubjects: hasFull
              ? ['all', ...ALL_SUBJECT_IDS]
              : mergedUnlocked.slice(0, 10),
            paymentRequestIds: Array.from(
              new Set([
                ...(mergedBackup.profile.paymentRequestIds ?? []),
                ...(remoteProfile.paymentRequestIds ?? []),
              ])
            ).slice(0, 25),
          },
        };
      }
    } catch {
      // Non-fatal
    }
  }

  if (!mergedBackup) {
    mergedBackup = {
      version: 1,
      appId: 'std10_gujarati_quiz',
      gmail: email,
      uid,
      updatedAtMs: Date.now(),
      lastSyncedDevice: getCurrentDeviceIdentity().deviceName,
      profile: {
        fullName: session.displayName || 'Student',
        mobileNumber: '',
        email,
        standard: 'ધોરણ 10',
        hasQuizAccess: false,
        redeemedCode: '',
        paymentStatus: 'none',
        totalQuizzesTaken: 0,
        bestScorePercent: 0,
        unlockedSubjects: [],
        paymentRequestIds: [],
      },
      attempts: [],
      paymentsSummary: [],
    };
  }

  saveLocalGmailBackup(mergedBackup);

  // Sync merged state back to Google Drive so Drive always holds the freshest copy
  if (accessToken && (!remoteDriveBackup || localBackup)) {
    try {
      const saved = await saveStudentDataToDrive(accessToken, mergedBackup, {
        knownFileId: driveFileId,
      });
      driveFileId = saved.fileId;
    } catch {
      // Local backup is already safe; Drive will retry on next action/reconnect
    }
  }

  return {
    session,
    accessToken,
    backup: mergedBackup,
    driveFileId,
  };
}

export async function reconnectStudentDriveToken(gmail: string): Promise<string | null> {
  const cleanEmail = normalizeGmail(gmail);
  if (!cleanEmail) return null;
  const existing = getStoredDriveAccessToken(cleanEmail);
  if (existing) return existing;

  const clientId = getConfiguredWebOAuthClientId();
  const tokenRes = await requestGoogleDriveAccessTokenViaGis({
    clientId,
    loginHint: cleanEmail,
    prompt: 'consent',
  });
  storeDriveAccessToken(tokenRes.accessToken, cleanEmail, tokenRes.expiresIn);
  return tokenRes.accessToken;
}

export async function signOutStudentGmail(): Promise<void> {
  clearDriveAccessToken();
  saveGmailSessionMeta(null);
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

export async function loginStudentWithDeviceLock(params: {
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

  if (!canHitServer()) {
    const backup = loadWebStudentBackup(studentId);
    if (backup) {
      const effectiveName = cleanName || backup.fullName || 'Student';
      const restored: StudentProfile = {
        ...backup,
        fullName: effectiveName,
        email: cleanEmail || backup.email || '',
        activeDeviceId: deviceId,
        activeDeviceName: deviceName,
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
      paymentRequestIds: [],
      activeDeviceId: deviceId,
      activeDeviceName: deviceName,
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
      deviceId,
      deviceName,
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
          email: cleanEmail,
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
      const existingEmail = String(d.email ?? '').trim();
      const effectiveName = cleanName || existingName || 'Student';
      const effectiveEmail = cleanEmail || existingEmail;
      const needsUpdate =
        existingDeviceId !== deviceId ||
        existingDeviceName !== deviceName ||
        (cleanName.length > 0 && cleanName !== existingName) ||
        (cleanEmail.length > 0 && cleanEmail !== existingEmail);

      if (needsUpdate) {
        tx.update(ref, {
          fullName: effectiveName,
          email: effectiveEmail,
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        ...mapStudentDoc(snap.id, d),
        fullName: effectiveName,
        email: effectiveEmail,
        activeDeviceId: deviceId,
        activeDeviceName: deviceName,
        isReturningUser: true,
      };
    });

    knownSyncedStudentIds.add(studentId);
    saveWebStudentBackup(profile, false);
    markServerSyncSuccess();
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
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
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
          activeDeviceId: deviceId,
          activeDeviceName: deviceName,
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
          deviceId,
          deviceName,
        });
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
    saveWebStudentBackup(
      { ...existingBackup, activeDeviceId: '', activeDeviceName: '' },
      Boolean(existingBackup.pendingServerSync)
    );
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

  if (!canHitServer()) return;
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
  // Gmail-only session before a mobile number is linked lives locally + in Google Drive
  if (userId.startsWith('gmail_') && !hasNativeFirebaseBridge()) {
    const gmailMeta = loadGmailSessionMeta();
    const localBackup = gmailMeta ? loadLocalGmailBackup(gmailMeta.email) : null;
    if (localBackup) {
      onData({
        id: userId,
        userId,
        fullName: localBackup.profile.fullName,
        mobileNumber: localBackup.profile.mobileNumber,
        email: localBackup.profile.email,
        standard: localBackup.profile.standard,
        hasQuizAccess: localBackup.profile.hasQuizAccess,
        redeemedCode: localBackup.profile.redeemedCode,
        paymentStatus: localBackup.profile.paymentStatus,
        totalQuizzesTaken: localBackup.profile.totalQuizzesTaken,
        bestScorePercent: localBackup.profile.bestScorePercent,
        unlockedSubjects: localBackup.profile.unlockedSubjects,
        paymentRequestIds: localBackup.profile.paymentRequestIds,
        createdAt: null,
        updatedAt: null,
      });
    }
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
        const gmailEmail = loadGmailSessionMeta()?.email ?? '';
        if (!stSnap.exists()) {
          await setDoc(stRef, {
            userId: studentId,
            fullName: cleanName,
            mobileNumber: cleanMobile,
            email: gmailEmail,
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
  const gmailEmail = loadGmailSessionMeta()?.email ?? '';

  const ensureStudentExistsWeb = async () => {
    if (!canSyncStudent) return;
    const existingStudent = await getDoc(studentRef);
    if (!existingStudent.exists()) {
      await setDoc(studentRef, {
        userId: studentId,
        fullName: cleanName,
        mobileNumber: cleanMobile,
        email: gmailEmail,
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
    markServerSyncError(error);
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
        const candidate = generateUnique8CharCode();
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

  // Always hydrate from local/Gmail cache immediately
  const cached = loadCachedMyAttempts(userId);
  const gmailMeta = loadGmailSessionMeta();
  const gmailBackup = gmailMeta ? loadLocalGmailBackup(gmailMeta.email) : null;
  if (gmailBackup && gmailBackup.attempts.length > 0) {
    const deserialized = gmailBackup.attempts.map(deserializeBackupAttempt);
    onData(mergeRecordsByIdNewer(deserialized, cached).slice(0, 20));
  } else if (cached.length > 0) {
    onData(cached);
  }

  if (userId.startsWith('gmail_') && !hasNativeFirebaseBridge()) {
    return () => {};
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
  const uid = studentId?.trim() || auth.currentUser?.uid || loadGmailSessionMeta()?.uid || '';
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

  // If Gmail-only ID (without mobile doc yet), persistence happens via local cache + Google Drive
  if (uid.startsWith('gmail_') && !hasNativeFirebaseBridge()) {
    return localAttempt;
  }

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
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(ADMIN_PAGE_SIZE));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => mapAccessCodeDoc(docSnap.id, docSnap.data()));
      const merged = mergeRecordsByIdNewer(loadCachedAdminCodes(), items, (x) => x.code);
      merged.sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
      saveCachedAdminCodes(merged);
      if (!snap.metadata.fromCache) {
        markServerSyncSuccess();
        saveCollectionLastSyncMs(COLLECTION_ACCESS_CODES, Date.now());
      }
      onData(merged);
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
  pageSize = ADMIN_PAGE_SIZE
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
      case 'student_profile_sync': {
        await loginStudentWithDeviceLock({
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
      case 'admin_unlock_device': {
        requireUserId();
        const studentId = String(p.studentId ?? '');
        await updateDoc(doc(db, COLLECTION_STUDENTS, studentId), {
          activeDeviceId: '',
          activeDeviceName: '',
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
  const cleanNotes = releaseNotes.trim().slice(0, 300);
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
    await setDoc(ref, {
      githubOwnerRepo: cleanRepo,
      releaseNotes: cleanNotes,
      updatedAt: serverTimestamp(),
    });
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

export async function adminUnlockStudentDevice(student: StudentProfile): Promise<void> {
  const studentId = (student.id || student.userId).trim();
  if (!studentId || !student.activeDeviceId) return;
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
  if (!canHitServer()) {
    enqueueSyncOperation('admin_unlock_device', `unlock_${studentId}`, { studentId });
    return;
  }
  const studentRef = doc(db, COLLECTION_STUDENTS, studentId);
  try {
    await updateDoc(studentRef, {
      activeDeviceId: '',
      activeDeviceName: '',
      updatedAt: serverTimestamp(),
    });
    markServerSyncSuccess();
  } catch (error) {
    const kind = markServerSyncError(error);
    if (kind === 'network' || kind === 'quota') {
      enqueueSyncOperation('admin_unlock_device', `unlock_${studentId}`, { studentId });
    }
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
