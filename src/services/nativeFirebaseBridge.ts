import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AccessCode,
  AppReleaseConfig,
  PaymentRequest,
  QuizAttempt,
  StudentProfile,
} from '../types/models';

export interface AppAuthUser {
  uid: string;
  email: string;
  phoneNumber: string;
  emailVerified: boolean;
}

interface AndroidFirebaseBridgeApi {
  hasNativeFirebase?: () => boolean;
  getFirebaseConfigSummary?: () => string;
  getCurrentAuthUser?: () => string;
  requestGoogleSignIn?: (callId: string) => void;
  signOutGoogle?: (callId: string) => void;
  registerOrUpdateStudentProfile?: (callId: string, payloadJson: string) => void;
  startStudentListeners?: (studentId: string) => void;
  stopStudentListeners?: () => void;
  recordQuizAttempt?: (callId: string, payloadJson: string) => void;
  submitPaymentRequest?: (callId: string, payloadJson: string) => void;
  redeemAccessCode?: (callId: string, payloadJson: string) => void;
  startPublicListeners?: (paymentIdsJson: string) => void;
  updateMyPaymentIds?: (paymentIdsJson: string) => void;
  stopPublicListeners?: () => void;
  startAdminListeners?: () => void;
  stopAdminListeners?: () => void;
  approvePayment?: (callId: string, payloadJson: string) => void;
  rejectPayment?: (callId: string, payloadJson: string) => void;
  generateBulkCodes?: (callId: string, payloadJson: string) => void;
  saveReleaseConfig?: (callId: string, payloadJson: string) => void;
  toggleStudentQuizAccess?: (callId: string, payloadJson: string) => void;
  updateStudentSubjectAccess?: (callId: string, payloadJson: string) => void;
}

declare global {
  interface Window {
    AndroidFirebaseBridge?: AndroidFirebaseBridgeApi;
    __resolveNativeFirebaseCall?: (callId: string, ok: boolean, payload: unknown) => void;
    __onNativeAuthStateChanged?: (user: AppAuthUser | null) => void;
    __onNativeReleaseConfig?: (cfg: AppReleaseConfig | null) => void;
    __onNativeMyPayments?: (list: PaymentRequest[]) => void;
    __onNativeStudentProfile?: (profile: StudentProfile | null) => void;
    __onNativeMyAttempts?: (list: QuizAttempt[]) => void;
    __onNativeAllPayments?: (list: PaymentRequest[]) => void;
    __onNativeAllCodes?: (list: AccessCode[]) => void;
    __onNativeAllStudents?: (list: StudentProfile[]) => void;
    __onNativeAdminError?: (message: string) => void;
  }
}

export function hasNativeFirebaseBridge(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.AndroidFirebaseBridge?.hasNativeFirebase?.())
  );
}

export function getActiveFirebaseSummary(): { projectId: string; databaseId: string } {
  if (hasNativeFirebaseBridge()) {
    try {
      const raw = window.AndroidFirebaseBridge?.getFirebaseConfigSummary?.();
      if (raw) {
        const parsed = JSON.parse(raw) as { projectId?: string; databaseId?: string };
        if (parsed.projectId || parsed.databaseId) {
          return {
            projectId: parsed.projectId || 'gen-lang-client-0958586856',
            databaseId: parsed.databaseId || '',
          };
        }
      }
    } catch {
      // Fallback below
    }
  }
  return {
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
  };
}

let callSeq = 0;
const pendingCalls = new Map<
  string,
  { resolve: (val: unknown) => void; reject: (err: Error) => void }
>();

const authListeners = new Set<(user: AppAuthUser | null) => void>();
const releaseListeners = new Set<(cfg: AppReleaseConfig | null) => void>();
const myPaymentListeners = new Set<(list: PaymentRequest[]) => void>();
const studentProfileListeners = new Set<(profile: StudentProfile | null) => void>();
const myAttemptListeners = new Set<(list: QuizAttempt[]) => void>();
const allPaymentListeners = new Set<(list: PaymentRequest[]) => void>();
const allCodeListeners = new Set<(list: AccessCode[]) => void>();
const allStudentListeners = new Set<(list: StudentProfile[]) => void>();
const adminErrorListeners = new Set<(err: Error) => void>();

let latestAuthUser: AppAuthUser | null | undefined;
let latestReleaseConfig: AppReleaseConfig | null | undefined;
let latestMyPayments: PaymentRequest[] | undefined;
let latestStudentProfile: StudentProfile | null | undefined;
let latestMyAttempts: QuizAttempt[] | undefined;
let latestAllPayments: PaymentRequest[] | undefined;
let latestAllCodes: AccessCode[] | undefined;
let latestAllStudents: StudentProfile[] | undefined;

if (typeof window !== 'undefined') {
  window.__resolveNativeFirebaseCall = (callId, ok, payload) => {
    const entry = pendingCalls.get(callId);
    if (!entry) return;
    pendingCalls.delete(callId);
    if (ok) {
      entry.resolve(payload);
    } else {
      entry.reject(new Error(typeof payload === 'string' ? payload : String(payload ?? 'Native error')));
    }
  };

  window.__onNativeAuthStateChanged = (user) => {
    latestAuthUser = user ?? null;
    authListeners.forEach((cb) => cb(latestAuthUser ?? null));
  };

  window.__onNativeReleaseConfig = (cfg) => {
    latestReleaseConfig = cfg ?? null;
    releaseListeners.forEach((cb) => cb(latestReleaseConfig ?? null));
  };

  window.__onNativeMyPayments = (list) => {
    latestMyPayments = Array.isArray(list) ? list : [];
    myPaymentListeners.forEach((cb) => cb(latestMyPayments!));
  };

  window.__onNativeStudentProfile = (profile) => {
    latestStudentProfile = profile ?? null;
    studentProfileListeners.forEach((cb) => cb(latestStudentProfile ?? null));
  };

  window.__onNativeMyAttempts = (list) => {
    latestMyAttempts = Array.isArray(list) ? list : [];
    myAttemptListeners.forEach((cb) => cb(latestMyAttempts!));
  };

  window.__onNativeAllPayments = (list) => {
    latestAllPayments = Array.isArray(list) ? list : [];
    allPaymentListeners.forEach((cb) => cb(latestAllPayments!));
  };

  window.__onNativeAllCodes = (list) => {
    latestAllCodes = Array.isArray(list) ? list : [];
    allCodeListeners.forEach((cb) => cb(latestAllCodes!));
  };

  window.__onNativeAllStudents = (list) => {
    latestAllStudents = Array.isArray(list) ? list : [];
    allStudentListeners.forEach((cb) => cb(latestAllStudents!));
  };

  window.__onNativeAdminError = (msg) => {
    const err = new Error(msg || 'Permission denied');
    adminErrorListeners.forEach((cb) => cb(err));
  };
}

export function invokeNativeBridgeCall<T>(
  invoker: (callId: string) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callId = `nat_${++callSeq}_${Date.now()}`;
    pendingCalls.set(callId, {
      resolve: (val) => resolve(val as T),
      reject,
    });
    try {
      invoker(callId);
    } catch (err) {
      pendingCalls.delete(callId);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function getNativeCurrentAuthUser(): AppAuthUser | null {
  if (!hasNativeFirebaseBridge()) return null;
  if (latestAuthUser !== undefined) return latestAuthUser;
  try {
    const raw = window.AndroidFirebaseBridge?.getCurrentAuthUser?.();
    if (!raw || raw === 'null') return null;
    latestAuthUser = JSON.parse(raw) as AppAuthUser;
    return latestAuthUser;
  } catch {
    return null;
  }
}

export function subscribeNativeAuthState(cb: (user: AppAuthUser | null) => void): () => void {
  authListeners.add(cb);
  cb(getNativeCurrentAuthUser());
  return () => {
    authListeners.delete(cb);
  };
}

let publicListenersStarted = false;
let activeStudentId = '';

export function subscribeNativeReleaseConfig(
  cb: (cfg: AppReleaseConfig | null) => void
): () => void {
  releaseListeners.add(cb);
  if (latestReleaseConfig !== undefined) cb(latestReleaseConfig);
  if (!publicListenersStarted) {
    publicListenersStarted = true;
    window.AndroidFirebaseBridge?.startPublicListeners?.('[]');
  }
  return () => {
    releaseListeners.delete(cb);
  };
}

export function subscribeNativeMyPayments(
  paymentIds: string[],
  cb: (list: PaymentRequest[]) => void
): () => void {
  myPaymentListeners.add(cb);
  if (latestMyPayments !== undefined) cb(latestMyPayments);
  const idsJson = JSON.stringify(paymentIds);
  if (!publicListenersStarted) {
    publicListenersStarted = true;
    window.AndroidFirebaseBridge?.startPublicListeners?.(idsJson);
  } else {
    window.AndroidFirebaseBridge?.updateMyPaymentIds?.(idsJson);
  }
  return () => {
    myPaymentListeners.delete(cb);
  };
}

export function subscribeNativeStudentProfile(
  studentId: string,
  cb: (profile: StudentProfile | null) => void
): () => void {
  if (activeStudentId !== studentId) {
    latestStudentProfile = undefined;
    latestMyAttempts = undefined;
    activeStudentId = studentId;
    window.AndroidFirebaseBridge?.startStudentListeners?.(studentId);
  }
  studentProfileListeners.add(cb);
  if (latestStudentProfile !== undefined) cb(latestStudentProfile);
  return () => {
    studentProfileListeners.delete(cb);
    if (studentProfileListeners.size === 0 && myAttemptListeners.size === 0) {
      activeStudentId = '';
      window.AndroidFirebaseBridge?.stopStudentListeners?.();
    }
  };
}

export function subscribeNativeMyAttempts(
  studentId: string,
  cb: (list: QuizAttempt[]) => void
): () => void {
  if (activeStudentId !== studentId) {
    latestStudentProfile = undefined;
    latestMyAttempts = undefined;
    activeStudentId = studentId;
    window.AndroidFirebaseBridge?.startStudentListeners?.(studentId);
  }
  myAttemptListeners.add(cb);
  if (latestMyAttempts !== undefined) cb(latestMyAttempts);
  return () => {
    myAttemptListeners.delete(cb);
    if (studentProfileListeners.size === 0 && myAttemptListeners.size === 0) {
      activeStudentId = '';
      window.AndroidFirebaseBridge?.stopStudentListeners?.();
    }
  };
}

export function subscribeNativeAllPayments(
  cb: (list: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  allPaymentListeners.add(cb);
  if (onError) adminErrorListeners.add(onError);
  if (latestAllPayments !== undefined) cb(latestAllPayments);
  window.AndroidFirebaseBridge?.startAdminListeners?.();
  return () => {
    allPaymentListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    if (
      allPaymentListeners.size === 0 &&
      allCodeListeners.size === 0 &&
      allStudentListeners.size === 0
    ) {
      window.AndroidFirebaseBridge?.stopAdminListeners?.();
    }
  };
}

export function subscribeNativeAllCodes(
  cb: (list: AccessCode[]) => void,
  onError?: (err: Error) => void
): () => void {
  allCodeListeners.add(cb);
  if (onError) adminErrorListeners.add(onError);
  if (latestAllCodes !== undefined) cb(latestAllCodes);
  window.AndroidFirebaseBridge?.startAdminListeners?.();
  return () => {
    allCodeListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    if (
      allPaymentListeners.size === 0 &&
      allCodeListeners.size === 0 &&
      allStudentListeners.size === 0
    ) {
      window.AndroidFirebaseBridge?.stopAdminListeners?.();
    }
  };
}

export function subscribeNativeAllStudents(
  cb: (list: StudentProfile[]) => void,
  onError?: (err: Error) => void
): () => void {
  allStudentListeners.add(cb);
  if (onError) adminErrorListeners.add(onError);
  if (latestAllStudents !== undefined) cb(latestAllStudents);
  window.AndroidFirebaseBridge?.startAdminListeners?.();
  return () => {
    allStudentListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    if (
      allPaymentListeners.size === 0 &&
      allCodeListeners.size === 0 &&
      allStudentListeners.size === 0
    ) {
      window.AndroidFirebaseBridge?.stopAdminListeners?.();
    }
  };
}
