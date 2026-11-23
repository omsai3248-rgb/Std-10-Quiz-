import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AccessCode,
  AdminChatMessage,
  AdminChatThread,
  AdminDeepLinkPayload,
  AdminInvite,
  AdminNotificationItem,
  AdminNotificationPrefs,
  AdminUser,
  AppReleaseConfig,
  AppUpdateProgressEvent,
  InspectedApkMetadata,
  InstalledAppInfo,
  PaymentRequest,
  PushBroadcastRecord,
  QuizAttempt,
  SendPushBroadcastInput,
  StudentProfile,
  UpdateNotificationRecord,
} from '../types/models';
import {
  applyNativeSyncSnapshot,
  setLiveSyncState,
  setOnlineState,
  type SyncStatusSnapshot,
} from './syncManager';

export interface AppAuthUser {
  uid: string;
  email: string;
  phoneNumber: string;
  emailVerified: boolean;
  displayName?: string;
  photoUrl?: string;
}

interface AndroidFirebaseBridgeApi {
  hasNativeFirebase?: () => boolean;
  getFirebaseConfigSummary?: () => string;
  getCurrentAuthUser?: () => string;
  requestGoogleSignIn?: (callId: string) => void;
  signOutGoogle?: (callId: string) => void;
  lookupStudentProfile?: (callId: string, mobileNumber: string) => void;
  loginStudentByMobile?: (callId: string, payloadJson: string) => void;
  registerOrUpdateStudentProfile?: (callId: string, payloadJson: string) => void;
  startStudentListeners?: (studentId: string) => void;
  stopStudentListeners?: () => void;
  recordQuizAttempt?: (callId: string, payloadJson: string) => void;
  markFreeMockTestUsed?: (callId: string, payloadJson: string) => void;
  submitPaymentRequest?: (callId: string, payloadJson: string) => void;
  redeemAccessCode?: (callId: string, payloadJson: string) => void;
  startPublicListeners?: (paymentIdsJson: string) => void;
  updateMyPaymentIds?: (paymentIdsJson: string) => void;
  stopPublicListeners?: () => void;
  forceRefreshAdminListeners?: () => void;
  startAdminListeners?: () => void;
  stopAdminListeners?: () => void;
  approvePayment?: (callId: string, payloadJson: string) => void;
  rejectPayment?: (callId: string, payloadJson: string) => void;
  generateBulkCodes?: (callId: string, payloadJson: string) => void;
  saveReleaseConfig?: (callId: string, payloadJson: string) => void;
  toggleStudentQuizAccess?: (callId: string, payloadJson: string) => void;
  updateStudentSubjectAccess?: (callId: string, payloadJson: string) => void;
  deletePaymentRequest?: (callId: string, payloadJson: string) => void;
  deleteAccessCode?: (callId: string, payloadJson: string) => void;
  fetchCodesByBatch?: (callId: string, payloadJson: string) => void;
  deleteUnusedAccessCodes?: (callId: string, payloadJson: string) => void;
  deleteStudent?: (callId: string, payloadJson: string) => void;
  generateDirectCodeForMobile?: (callId: string, payloadJson: string) => void;
  setActiveStudentMobile?: (mobileOrId: string) => void;
  getActiveStudentSnapshot?: () => string;
  verifyActiveSessionNow?: () => void;
  pauseAdminListeners?: () => void;
  resumeAdminListeners?: () => void;
  loadMoreAdminCollection?: (callId: string, collectionName: string, cursorSeconds: number) => void;
  getNotificationPermissionStatus?: () => string;
  requestNotificationPermission?: (callId: string) => void;
  openNotificationSettings?: () => void;
  openBatteryOptimizationSettings?: () => void;
  isIgnoringBatteryOptimizations?: () => boolean;
  sendPushBroadcast?: (callId: string, payloadJson: string) => void;
  deletePushBroadcast?: (callId: string, broadcastId: string) => void;
  consumePendingDeepLink?: () => string;
  syncAdminProfileAndFcmToken?: (callId: string) => void;
  updateAdminNotificationPrefs?: (callId: string, prefsJson: string) => void;
  addAdminInvite?: (callId: string, payloadJson: string) => void;
  removeAdminInvite?: (callId: string, emailRaw: string) => void;
  logAdminNotificationEvent?: (callId: string, payloadJson: string) => void;
  startAdminNotificationsAndChatListeners?: () => void;
  stopAdminNotificationsAndChatListeners?: () => void;
  markAdminNotificationRead?: (callId: string, notifId: string) => void;
  markAllAdminNotificationsRead?: (callId: string) => void;
  deleteAdminNotification?: (callId: string, notifId: string) => void;
  startAdminChatThreadListener?: (chatId: string) => void;
  stopAdminChatThreadListener?: () => void;
  sendAdminChatMessage?: (callId: string, payloadJson: string) => void;
  markChatMessagesRead?: (callId: string, chatIdRaw: string) => void;
  getInstalledAppInfo?: () => string;
  pickAndInspectApkFile?: (callId: string) => void;
  publishAppUpdate?: (callId: string, payloadJson: string) => void;
  downloadAndInstallAppUpdate?: (callId: string, payloadJson: string) => void;
  retryInstallPendingApk?: (callId: string) => void;
}

declare global {
  interface Window {
    AndroidFirebaseBridge?: AndroidFirebaseBridgeApi;
    __resolveNativeFirebaseCall?: (callId: string, ok: boolean, payload: unknown) => void;
    __onNativeAuthStateChanged?: (user: AppAuthUser | null) => void;
    __onNativeReleaseConfig?: (cfg: AppReleaseConfig | null) => void;
    __onNativeUpdateNotifications?: (list: UpdateNotificationRecord[]) => void;
    __onNativePushBroadcasts?: (list: PushBroadcastRecord[]) => void;
    __onNativeApkUploadProgress?: (evt: AppUpdateProgressEvent) => void;
    __onNativeAppUpdateProgress?: (evt: AppUpdateProgressEvent) => void;
    __onNativeMyPayments?: (list: PaymentRequest[]) => void;
    __onNativeStudentProfile?: (profile: StudentProfile | null) => void;
    __onNativeMyAttempts?: (list: QuizAttempt[]) => void;
    __onNativeAllPayments?: (list: PaymentRequest[]) => void;
    __onNativeAllCodes?: (list: AccessCode[]) => void;
    __onNativeAllCodesChunkStart?: (streamId: number, totalCount: number) => void;
    __onNativeAllCodesChunk?: (streamId: number, chunk: AccessCode[]) => void;
    __onNativeAllCodesChunkEnd?: (streamId: number) => void;
    __onNativeAllStudents?: (list: StudentProfile[]) => void;
    __onNativeAdminError?: (message: string) => void;
    __onNativeSyncState?: (state: Partial<SyncStatusSnapshot>) => void;
    __onNativeNetworkStateChanged?: (isOnline: boolean) => void;
    __onNativeNotificationPermissionChanged?: (status: string) => void;
    __onNativeAdminDeepLink?: (payload: AdminDeepLinkPayload) => void;
    __onNativeAdminDirectory?: (list: AdminUser[]) => void;
    __onNativeAdminInvites?: (list: AdminInvite[]) => void;
    __onNativeAdminNotifications?: (list: AdminNotificationItem[]) => void;
    __onNativeAdminChats?: (list: AdminChatThread[]) => void;
    __onNativeAdminChatMessages?: (list: AdminChatMessage[]) => void;
  }
}

export function hasNativeFirebaseBridge(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.AndroidFirebaseBridge?.hasNativeFirebase?.())
  );
}

export function getNativeActiveStudentSnapshot(): StudentProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.AndroidFirebaseBridge?.getActiveStudentSnapshot?.();
    if (!raw || raw === 'null') return null;
    const parsed = JSON.parse(raw) as StudentProfile | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.mobileNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setNativeActiveStudentMobile(mobileOrId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.AndroidFirebaseBridge?.setActiveStudentMobile?.(mobileOrId);
  } catch {
    // Ignore bridge error
  }
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
const updateNotificationListeners = new Set<(list: UpdateNotificationRecord[]) => void>();
const pushBroadcastListeners = new Set<(list: PushBroadcastRecord[]) => void>();
const apkUploadProgressListeners = new Set<(evt: AppUpdateProgressEvent) => void>();
const appUpdateProgressListeners = new Set<(evt: AppUpdateProgressEvent) => void>();
const myPaymentListeners = new Set<(list: PaymentRequest[]) => void>();
const studentProfileListeners = new Set<(profile: StudentProfile | null) => void>();
const myAttemptListeners = new Set<(list: QuizAttempt[]) => void>();
const allPaymentListeners = new Set<(list: PaymentRequest[]) => void>();
const allCodeListeners = new Set<(list: AccessCode[]) => void>();
const allStudentListeners = new Set<(list: StudentProfile[]) => void>();
const adminErrorListeners = new Set<(err: Error) => void>();
const adminDirectoryListeners = new Set<(list: AdminUser[]) => void>();
const adminInvitesListeners = new Set<(list: AdminInvite[]) => void>();
const adminNotifListeners = new Set<(list: AdminNotificationItem[]) => void>();
const adminChatsListeners = new Set<(list: AdminChatThread[]) => void>();
const adminChatMessageListeners = new Set<(list: AdminChatMessage[]) => void>();
const notifPermissionListeners = new Set<(status: 'granted' | 'denied') => void>();
const adminDeepLinkListeners = new Set<(payload: AdminDeepLinkPayload) => void>();

let latestAuthUser: AppAuthUser | null | undefined;
let latestReleaseConfig: AppReleaseConfig | null | undefined;
let latestUpdateNotifications: UpdateNotificationRecord[] | undefined;
let latestPushBroadcasts: PushBroadcastRecord[] | undefined;
let latestMyPayments: PaymentRequest[] | undefined;
let latestStudentProfile: StudentProfile | null | undefined;
let latestMyAttempts: QuizAttempt[] | undefined;
let latestAllPayments: PaymentRequest[] | undefined;
let latestAllCodes: AccessCode[] | undefined;
let activeAllCodesStreamId = 0;
let pendingAllCodesChunks: AccessCode[] = [];
let latestAllStudents: StudentProfile[] | undefined;
let latestAdminDirectory: AdminUser[] | undefined;
let latestAdminInvites: AdminInvite[] | undefined;
let latestAdminNotifications: AdminNotificationItem[] | undefined;
let latestAdminChats: AdminChatThread[] | undefined;
let latestAdminChatMessages: AdminChatMessage[] | undefined;

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
    if (!user) {
      latestAdminDirectory = undefined;
      latestAdminInvites = undefined;
      latestAdminNotifications = undefined;
      latestAdminChats = undefined;
      latestAdminChatMessages = undefined;
    }
    authListeners.forEach((cb) => cb(latestAuthUser ?? null));
  };

  window.__onNativeReleaseConfig = (cfg) => {
    latestReleaseConfig = cfg ?? null;
    releaseListeners.forEach((cb) => cb(latestReleaseConfig ?? null));
  };

  window.__onNativeUpdateNotifications = (list) => {
    latestUpdateNotifications = Array.isArray(list) ? list : [];
    updateNotificationListeners.forEach((cb) => cb(latestUpdateNotifications!));
  };

  window.__onNativePushBroadcasts = (list) => {
    latestPushBroadcasts = Array.isArray(list) ? list : [];
    pushBroadcastListeners.forEach((cb) => cb(latestPushBroadcasts!));
  };

  window.__onNativeApkUploadProgress = (evt) => {
    if (evt && typeof evt === 'object') {
      apkUploadProgressListeners.forEach((cb) => cb(evt));
    }
  };

  window.__onNativeAppUpdateProgress = (evt) => {
    if (evt && typeof evt === 'object') {
      appUpdateProgressListeners.forEach((cb) => cb(evt));
    }
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
    activeAllCodesStreamId = 0;
    pendingAllCodesChunks = [];
    latestAllCodes = Array.isArray(list) ? list : [];
    allCodeListeners.forEach((cb) => cb(latestAllCodes!));
  };

  window.__onNativeAllCodesChunkStart = (streamId) => {
    activeAllCodesStreamId = Number(streamId) || 0;
    pendingAllCodesChunks = [];
  };

  window.__onNativeAllCodesChunk = (streamId, chunk) => {
    if (Number(streamId) !== activeAllCodesStreamId || !Array.isArray(chunk)) return;
    for (let i = 0; i < chunk.length; i++) {
      pendingAllCodesChunks.push(chunk[i]);
    }
  };

  window.__onNativeAllCodesChunkEnd = (streamId) => {
    if (Number(streamId) !== activeAllCodesStreamId) return;
    latestAllCodes = pendingAllCodesChunks;
    pendingAllCodesChunks = [];
    activeAllCodesStreamId = 0;
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

  window.__onNativeSyncState = (patch) => {
    if (patch && typeof patch === 'object') {
      applyNativeSyncSnapshot(patch);
    }
  };

  window.__onNativeNetworkStateChanged = (online) => {
    setOnlineState(Boolean(online));
  };

  window.__onNativeNotificationPermissionChanged = (status) => {
    const norm = status === 'granted' ? 'granted' : 'denied';
    notifPermissionListeners.forEach((cb) => cb(norm));
  };

  window.__onNativeAdminDeepLink = (payload) => {
    if (payload && typeof payload === 'object' && payload.targetRoute) {
      adminDeepLinkListeners.forEach((cb) => cb(payload));
    }
  };

  window.__onNativeAdminDirectory = (list) => {
    latestAdminDirectory = Array.isArray(list) ? list : [];
    adminDirectoryListeners.forEach((cb) => cb(latestAdminDirectory!));
  };

  window.__onNativeAdminInvites = (list) => {
    latestAdminInvites = Array.isArray(list) ? list : [];
    adminInvitesListeners.forEach((cb) => cb(latestAdminInvites!));
  };

  window.__onNativeAdminNotifications = (list) => {
    latestAdminNotifications = Array.isArray(list) ? list : [];
    adminNotifListeners.forEach((cb) => cb(latestAdminNotifications!));
  };

  window.__onNativeAdminChats = (list) => {
    latestAdminChats = Array.isArray(list) ? list : [];
    adminChatsListeners.forEach((cb) => cb(latestAdminChats!));
  };

  window.__onNativeAdminChatMessages = (list) => {
    latestAdminChatMessages = Array.isArray(list) ? list : [];
    adminChatMessageListeners.forEach((cb) => cb(latestAdminChatMessages!));
  };
}

export function invokeNativeBridgeCall<T>(
  invoker: (callId: string) => void,
  timeoutMs = 0
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callId = `nat_${++callSeq}_${Date.now()}`;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (timerId !== undefined) {
        clearTimeout(timerId);
        timerId = undefined;
      }
    };
    pendingCalls.set(callId, {
      resolve: (val) => {
        clearTimer();
        resolve(val as T);
      },
      reject: (err) => {
        clearTimer();
        reject(err);
      },
    });
    if (timeoutMs > 0) {
      timerId = setTimeout(() => {
        const entry = pendingCalls.get(callId);
        if (!entry) return;
        pendingCalls.delete(callId);
        entry.reject(new Error('Operation timed out. Please try again.'));
      }, timeoutMs);
    }
    try {
      invoker(callId);
    } catch (err) {
      clearTimer();
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

export function notifyNativeAuthUser(user: AppAuthUser | null): void {
  latestAuthUser = user;
  authListeners.forEach((cb) => cb(user));
}

export function subscribeNativeAuthState(cb: (user: AppAuthUser | null) => void): () => void {
  authListeners.add(cb);
  cb(getNativeCurrentAuthUser());
  return () => {
    authListeners.delete(cb);
  };
}

let publicListenersStarted = false;
let lastPublicPaymentIdsJson = '[]';
let adminListenersStarted = false;
let activeStudentId = '';

function ensureNativePublicListenersStarted(paymentIdsJson?: string): void {
  if (paymentIdsJson !== undefined) {
    lastPublicPaymentIdsJson = paymentIdsJson;
  }
  if (!publicListenersStarted) {
    publicListenersStarted = true;
    window.AndroidFirebaseBridge?.startPublicListeners?.(lastPublicPaymentIdsJson);
  } else if (paymentIdsJson !== undefined) {
    window.AndroidFirebaseBridge?.updateMyPaymentIds?.(lastPublicPaymentIdsJson);
  }
}

function ensureNativeAdminListenersStarted(): void {
  if (adminListenersStarted) return;
  adminListenersStarted = true;
  window.AndroidFirebaseBridge?.startAdminListeners?.();
}

function maybeStopNativeAdminListeners(): void {
  if (
    allPaymentListeners.size === 0 &&
    allCodeListeners.size === 0 &&
    allStudentListeners.size === 0
  ) {
    adminListenersStarted = false;
    setLiveSyncState('paused');
    window.AndroidFirebaseBridge?.stopAdminListeners?.();
  }
}

let lastNativeForceRefreshAt = 0;

export function forceRefreshNativeAdminListeners(): void {
  const now = Date.now();
  if (now - lastNativeForceRefreshAt < 3500) return;
  lastNativeForceRefreshAt = now;
  adminListenersStarted = true;
  window.AndroidFirebaseBridge?.forceRefreshAdminListeners?.();
}

export function pauseNativeAdminListeners(): void {
  if (!adminListenersStarted) return;
  adminListenersStarted = false;
  setLiveSyncState('paused');
  window.AndroidFirebaseBridge?.pauseAdminListeners?.();
}

export function resumeNativeAdminListeners(): void {
  if (adminListenersStarted) return;
  adminListenersStarted = true;
  window.AndroidFirebaseBridge?.resumeAdminListeners?.();
}

export async function loadMoreNativeAdminCollection<T>(
  collectionName: 'payment_requests' | 'access_codes' | 'students',
  cursorSeconds: number
): Promise<T[]> {
  return invokeNativeBridgeCall<T[]>((callId) => {
    window.AndroidFirebaseBridge?.loadMoreAdminCollection?.(
      callId,
      collectionName,
      cursorSeconds
    );
  });
}

export function subscribeNativeReleaseConfig(
  cb: (cfg: AppReleaseConfig | null) => void
): () => void {
  releaseListeners.add(cb);
  if (latestReleaseConfig !== undefined) cb(latestReleaseConfig);
  ensureNativePublicListenersStarted();
  return () => {
    releaseListeners.delete(cb);
  };
}

export function subscribeNativeUpdateNotifications(
  cb: (list: UpdateNotificationRecord[]) => void
): () => void {
  updateNotificationListeners.add(cb);
  if (latestUpdateNotifications !== undefined) cb(latestUpdateNotifications);
  ensureNativePublicListenersStarted();
  return () => {
    updateNotificationListeners.delete(cb);
  };
}

export function subscribeNativePushBroadcasts(
  cb: (list: PushBroadcastRecord[]) => void
): () => void {
  pushBroadcastListeners.add(cb);
  if (latestPushBroadcasts !== undefined) cb(latestPushBroadcasts);
  ensureNativePublicListenersStarted();
  return () => {
    pushBroadcastListeners.delete(cb);
  };
}

export function subscribeNativeApkUploadProgress(
  cb: (evt: AppUpdateProgressEvent) => void
): () => void {
  apkUploadProgressListeners.add(cb);
  return () => {
    apkUploadProgressListeners.delete(cb);
  };
}

export function subscribeNativeAppUpdateProgress(
  cb: (evt: AppUpdateProgressEvent) => void
): () => void {
  appUpdateProgressListeners.add(cb);
  return () => {
    appUpdateProgressListeners.delete(cb);
  };
}

export function triggerNativeActiveSessionCheck(): void {
  window.AndroidFirebaseBridge?.verifyActiveSessionNow?.();
}

export function subscribeNativeMyPayments(
  paymentIds: string[],
  cb: (list: PaymentRequest[]) => void
): () => void {
  myPaymentListeners.add(cb);
  if (latestMyPayments !== undefined) cb(latestMyPayments);
  const idsJson = JSON.stringify(paymentIds);
  ensureNativePublicListenersStarted(idsJson);
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
  ensureNativeAdminListenersStarted();
  return () => {
    allPaymentListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    maybeStopNativeAdminListeners();
  };
}

export function subscribeNativeAllCodes(
  cb: (list: AccessCode[]) => void,
  onError?: (err: Error) => void
): () => void {
  allCodeListeners.add(cb);
  if (onError) adminErrorListeners.add(onError);
  if (latestAllCodes !== undefined) cb(latestAllCodes);
  ensureNativeAdminListenersStarted();
  return () => {
    allCodeListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    maybeStopNativeAdminListeners();
  };
}

export function subscribeNativeAllStudents(
  cb: (list: StudentProfile[]) => void,
  onError?: (err: Error) => void
): () => void {
  allStudentListeners.add(cb);
  if (onError) adminErrorListeners.add(onError);
  if (latestAllStudents !== undefined) cb(latestAllStudents);
  ensureNativeAdminListenersStarted();
  return () => {
    allStudentListeners.delete(cb);
    if (onError) adminErrorListeners.delete(onError);
    maybeStopNativeAdminListeners();
  };
}

// =========================================================================
// Native Notification Center, FCM Push, Multi-Admin & 1-to-1 Chat Bridges
// =========================================================================

let adminMessagingListenersStarted = false;
let activeNativeChatThreadId = '';

function ensureNativeMessagingListenersStarted(): void {
  if (adminMessagingListenersStarted) return;
  adminMessagingListenersStarted = true;
  window.AndroidFirebaseBridge?.startAdminNotificationsAndChatListeners?.();
}

function maybeStopNativeMessagingListeners(): void {
  if (
    adminDirectoryListeners.size === 0 &&
    adminInvitesListeners.size === 0 &&
    adminNotifListeners.size === 0 &&
    adminChatsListeners.size === 0
  ) {
    adminMessagingListenersStarted = false;
    window.AndroidFirebaseBridge?.stopAdminNotificationsAndChatListeners?.();
  }
}

export function getNativeNotificationPermissionStatus(): 'granted' | 'denied' {
  if (!hasNativeFirebaseBridge()) return 'granted';
  try {
    return window.AndroidFirebaseBridge?.getNotificationPermissionStatus?.() === 'granted'
      ? 'granted'
      : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestNativeNotificationPermission(): Promise<'granted' | 'denied'> {
  if (!hasNativeFirebaseBridge()) return 'granted';
  const status = await invokeNativeBridgeCall<string>((callId) => {
    window.AndroidFirebaseBridge?.requestNotificationPermission?.(callId);
  });
  return status === 'granted' ? 'granted' : 'denied';
}

export function openNativeNotificationSettings(): void {
  if (!hasNativeFirebaseBridge()) return;
  window.AndroidFirebaseBridge?.openNotificationSettings?.();
}

export function openNativeBatteryOptimizationSettings(): void {
  if (!hasNativeFirebaseBridge()) return;
  window.AndroidFirebaseBridge?.openBatteryOptimizationSettings?.();
}

export function isNativeIgnoringBatteryOptimizations(): boolean {
  if (!hasNativeFirebaseBridge()) return true;
  try {
    return window.AndroidFirebaseBridge?.isIgnoringBatteryOptimizations?.() === true;
  } catch {
    return false;
  }
}

export async function sendNativePushBroadcast(payload: SendPushBroadcastInput): Promise<string> {
  return invokeNativeBridgeCall<string>((callId) => {
    window.AndroidFirebaseBridge?.sendPushBroadcast?.(callId, JSON.stringify(payload));
  });
}

export async function deleteNativePushBroadcast(broadcastId: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.deletePushBroadcast?.(callId, broadcastId);
  });
}

export function subscribeNativeNotificationPermission(
  cb: (status: 'granted' | 'denied') => void
): () => void {
  notifPermissionListeners.add(cb);
  return () => {
    notifPermissionListeners.delete(cb);
  };
}

export function consumeNativePendingDeepLink(): AdminDeepLinkPayload | null {
  if (!hasNativeFirebaseBridge()) return null;
  try {
    const raw = window.AndroidFirebaseBridge?.consumePendingDeepLink?.();
    if (!raw || raw === 'null') return null;
    const parsed = JSON.parse(raw) as AdminDeepLinkPayload | null;
    return parsed?.targetRoute ? parsed : null;
  } catch {
    return null;
  }
}

export function subscribeNativeAdminDeepLink(
  cb: (payload: AdminDeepLinkPayload) => void
): () => void {
  adminDeepLinkListeners.add(cb);
  return () => {
    adminDeepLinkListeners.delete(cb);
  };
}

export async function syncNativeAdminProfileAndFcmToken(): Promise<AdminUser> {
  return invokeNativeBridgeCall<AdminUser>((callId) => {
    window.AndroidFirebaseBridge?.syncAdminProfileAndFcmToken?.(callId);
  });
}

export async function updateNativeAdminNotificationPrefs(
  prefs: AdminNotificationPrefs
): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.updateAdminNotificationPrefs?.(callId, JSON.stringify(prefs));
  });
}

export async function addNativeAdminInvite(email: string, displayName: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.addAdminInvite?.(
      callId,
      JSON.stringify({ email, displayName })
    );
  });
}

export async function removeNativeAdminInvite(email: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.removeAdminInvite?.(callId, email);
  });
}

export async function logNativeAdminNotificationEvent(payload: {
  notifId?: string;
  category: string;
  title: string;
  body: string;
  actorName?: string;
  actorMobile?: string;
  actorId?: string;
  targetRoute?: string;
  referenceId?: string;
}): Promise<void> {
  if (!hasNativeFirebaseBridge()) return;
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.logAdminNotificationEvent?.(callId, JSON.stringify(payload));
  }).catch(() => {});
}

export function subscribeNativeAdminDirectory(
  cb: (list: AdminUser[]) => void
): () => void {
  adminDirectoryListeners.add(cb);
  if (latestAdminDirectory !== undefined) cb(latestAdminDirectory);
  ensureNativeMessagingListenersStarted();
  return () => {
    adminDirectoryListeners.delete(cb);
    maybeStopNativeMessagingListeners();
  };
}

export function subscribeNativeAdminInvites(
  cb: (list: AdminInvite[]) => void
): () => void {
  adminInvitesListeners.add(cb);
  if (latestAdminInvites !== undefined) cb(latestAdminInvites);
  ensureNativeMessagingListenersStarted();
  return () => {
    adminInvitesListeners.delete(cb);
    maybeStopNativeMessagingListeners();
  };
}

export function subscribeNativeAdminNotifications(
  cb: (list: AdminNotificationItem[]) => void
): () => void {
  adminNotifListeners.add(cb);
  if (latestAdminNotifications !== undefined) cb(latestAdminNotifications);
  ensureNativeMessagingListenersStarted();
  return () => {
    adminNotifListeners.delete(cb);
    maybeStopNativeMessagingListeners();
  };
}

export function subscribeNativeAdminChats(
  cb: (list: AdminChatThread[]) => void
): () => void {
  adminChatsListeners.add(cb);
  if (latestAdminChats !== undefined) cb(latestAdminChats);
  ensureNativeMessagingListenersStarted();
  return () => {
    adminChatsListeners.delete(cb);
    maybeStopNativeMessagingListeners();
  };
}

export function subscribeNativeAdminChatMessages(
  chatId: string,
  cb: (list: AdminChatMessage[]) => void
): () => void {
  if (!chatId.trim()) {
    cb([]);
    return () => {};
  }
  if (activeNativeChatThreadId !== chatId) {
    latestAdminChatMessages = undefined;
    activeNativeChatThreadId = chatId;
    window.AndroidFirebaseBridge?.startAdminChatThreadListener?.(chatId);
  }
  adminChatMessageListeners.add(cb);
  if (latestAdminChatMessages !== undefined) cb(latestAdminChatMessages);
  return () => {
    adminChatMessageListeners.delete(cb);
    if (adminChatMessageListeners.size === 0) {
      activeNativeChatThreadId = '';
      latestAdminChatMessages = undefined;
      window.AndroidFirebaseBridge?.stopAdminChatThreadListener?.();
    }
  };
}

export async function markNativeAdminNotificationRead(notifId: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.markAdminNotificationRead?.(callId, notifId);
  });
}

export async function markAllNativeAdminNotificationsRead(): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.markAllAdminNotificationsRead?.(callId);
  });
}

export async function deleteNativeAdminNotification(notifId: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.deleteAdminNotification?.(callId, notifId);
  });
}

export async function sendNativeAdminChatMessage(payload: {
  recipientUid: string;
  recipientName: string;
  recipientPhotoUrl?: string;
  text: string;
}): Promise<{ chatId: string; messageId: string }> {
  return invokeNativeBridgeCall<{ chatId: string; messageId: string }>((callId) => {
    window.AndroidFirebaseBridge?.sendAdminChatMessage?.(callId, JSON.stringify(payload));
  });
}

export async function markNativeChatMessagesRead(chatId: string): Promise<void> {
  await invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.markChatMessagesRead?.(callId, chatId);
  });
}

// =========================================================================
// Native In-App App Update Bridge Calls
// =========================================================================

export function getNativeInstalledAppInfo(): InstalledAppInfo | null {
  if (!hasNativeFirebaseBridge()) return null;
  try {
    const raw = window.AndroidFirebaseBridge?.getInstalledAppInfo?.();
    if (!raw || raw === '{}') return null;
    const parsed = JSON.parse(raw) as InstalledAppInfo;
    return parsed?.packageName ? parsed : null;
  } catch {
    return null;
  }
}

export async function pickAndInspectNativeApk(): Promise<InspectedApkMetadata> {
  return invokeNativeBridgeCall<InspectedApkMetadata>((callId) => {
    window.AndroidFirebaseBridge?.pickAndInspectApkFile?.(callId);
  });
}

export async function publishNativeAppUpdate(payload: {
  stagedFilePath?: string;
  versionName: string;
  versionCode: number;
  updateTitle: string;
  releaseNotes: string;
  isMandatory: boolean;
  apkDownloadUrl?: string;
  apkStoragePath?: string;
  apkFileName?: string;
  apkSizeBytes?: number;
  apkSha256?: string;
  signingCertSha256?: string;
  packageName?: string;
  githubOwnerRepo?: string;
}): Promise<{ releaseId: string; apkDownloadUrl: string; versionName: string; versionCode: number }> {
  return invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.publishAppUpdate?.(callId, JSON.stringify(payload));
  });
}

export async function downloadAndInstallNativeAppUpdate(payload: {
  apkDownloadUrl: string;
  versionName: string;
  versionCode: number;
  apkSizeBytes?: number;
  apkSha256?: string;
  signingCertSha256?: string;
}): Promise<{ status: string }> {
  return invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.downloadAndInstallAppUpdate?.(callId, JSON.stringify(payload));
  }, 300000);
}

export async function retryNativePendingApkInstall(): Promise<{ status: string }> {
  return invokeNativeBridgeCall((callId) => {
    window.AndroidFirebaseBridge?.retryInstallPendingApk?.(callId);
  });
}


