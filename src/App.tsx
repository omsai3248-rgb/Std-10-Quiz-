import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, BellOff, BellRing, Settings, X } from 'lucide-react';
import {
  getCachedChapter,
  getCachedSubject,
  loadSubjectWithChapters,
} from './data/curriculum/std10Curriculum';
import { buildBoardExamMockTestChapter } from './data/curriculum/mockTestBuilder';
import { TopNavHeader, type PublicTabId } from './components/TopNavHeader';
import {
  UpdateAvailableBanner,
  UpdateAvailableModal,
  UpdateModalErrorBoundary,
} from './components/AppUpdateComponents';
import { DisplaySettingsModal } from './components/DisplaySettingsModal';
import { AdaptiveDisplayProvider, useAdaptiveDisplay } from './context/AdaptiveDisplayContext';
import { useTranslation } from './i18n/translations';
import { StudentMobileLoginScreen } from './screens/StudentMobileLoginScreen';
import { UseCodeScreen } from './screens/UseCodeScreen';
import type { AdminLiveAlert, AdminTabId } from './screens/AdminPanelScreen';
import { useTvRemoteNavigation } from './utils/tvNavigation';
import { quizAudioPlayer } from './services/audioPlayer';
import { extractReadableErrorMessage } from './services/firestoreErrorHandler';
import {
  consumeNativePendingDeepLink,
  getNativeInstalledAppInfo,
  subscribeNativeAdminDeepLink,
  subscribeNativeNotificationPermission,
} from './services/nativeFirebaseBridge';
import {
  ADMIN_CODES_PAGE_SIZE,
  ADMIN_PAGE_SIZE,
  approvePaymentAndAssignCode,
  deleteAccessCodeAdmin,
  deleteAdminNotificationItem,
  deleteAppReleaseRecord,
  deletePaymentRequestAdmin,
  deletePushBroadcastNotification,
  deleteStudentAdmin,
  deleteUnusedAccessCodesAdmin,
  fetchAccessCodesByBatchAdmin,
  flushPendingSyncOperations,
  forceRefreshNativeAdminListeners,
  generateBulkAccessCodes,
  generateDirectCodeForMobile,
  getAdminChatId,
  getNativeActiveStudentSnapshot,
  getNotificationPermissionState,
  getStudentDocId,
  hasNativeFirebaseBridge,
  inviteAdminByEmail,
  isAdminAccount,
  isSuperAdminEmail,
  loadMoreAdminCodes,
  loadMoreAdminPayments,
  loadMoreAdminStudents,
  loadMyPaymentRequestIds,
  loginStudentByMobile,
  markAdminChatMessagesRead,
  markAdminNotificationAsRead,
  markAllAdminNotificationsAsRead,
  markFreeMockTestUsed,
  observeAdminChatMessages,
  observeAdminChats,
  observeAdminDirectory,
  observeAdminInvites,
  observeAdminNotifications,
  observeAllAccessCodes,
  observeAllPaymentRequests,
  observeAllStudents,
  observeAppAuthState,
  observeMyPaymentRequests,
  observeMyQuizAttempts,
  observePaymentRequestsByIds,
  observePushBroadcasts,
  observeReleaseConfig,
  observeStudentProfile,
  observeUpdateNotifications,
  openAppNotificationSettings,
  pauseNativeAdminListeners,
  publishFirebaseAppUpdate,
  recordQuizAttempt,
  redeemAccessCodePublic,
  rejectPaymentRequest,
  removeAdminInviteByEmail,
  requestAppNotificationPermission,
  resumeNativeAdminListeners,
  saveMyPaymentRequestId,
  saveReleaseConfig,
  sendAdminChatMessage,
  sendPushBroadcastNotification,
  setNativeActiveStudentMobile,
  signOutAdminSession,
  submitPaymentRequest,
  syncAdminDeltaSince,
  syncAdminProfileAndPushToken,
  toggleStudentQuizAccess,
  updateAdminNotificationPrefs,
  updateStudentSubjectAccess,
  verifyActiveSessionOnResume,
  type AdminPasscodeAuthResult,
  type AppAuthUser,
  type DirectMobileCodeResult,
} from './services/quizRepository';
import {
  getSyncStatus,
  loadCachedMyAttempts,
  mergeStudentProfilesConflictSafe,
  setLiveSyncState,
  setOnlineState,
  subscribeSyncStatus,
  type SyncStatusSnapshot,
} from './services/syncManager';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  buildPermanentLatestApkUrl,
  chooseNewestAvailableUpdate,
  fetchLatestRelease,
  isReleaseVersionNewer,
  resolveEffectiveGithubRepo,
  sanitizeOwnerRepo,
  saveGithubOwnerRepoPreference,
} from './services/githubUpdateChecker';
import {
  checkWebSwForUpdateNow,
  subscribeWebSwUpdates,
} from './services/webSwUpdateService';
import {
  ALL_SUBJECT_IDS,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type AccessCode,
  type ActionBanner,
  type AdminChatMessage,
  type AdminChatThread,
  type AdminDeepLinkPayload,
  type AdminFocusedTarget,
  type AdminInvite,
  type AdminNotificationCategory,
  type AdminNotificationItem,
  type AdminNotificationPrefs,
  type AdminUser,
  type AppReleaseConfig,
  type GitHubReleaseInfo,
  type InstalledAppInfo,
  type PaymentRequest,
  type PublishAppUpdateInput,
  type PushBroadcastRecord,
  type QuizAttempt,
  type QuizChapter,
  type QuizSubject,
  type SendPushBroadcastInput,
  type StudentProfile,
  type SubjectId,
  type UpdateNotificationRecord,
} from './types/models';
import {
  buildPaymentApprovalWhatsAppHref,
  launchExternalUrl,
  normalizeIndianMobileInput,
} from './utils/imageUtils';

const LazyAdminPanelScreen = lazy(() =>
  import('./screens/AdminPanelScreen').then((m) => ({ default: m.AdminPanelScreen }))
);
const LazySubjectChaptersScreen = lazy(() =>
  import('./screens/SubjectChaptersScreen').then((m) => ({ default: m.SubjectChaptersScreen }))
);
const LazyQuizPlayScreen = lazy(() =>
  import('./screens/QuizPlayScreen').then((m) => ({ default: m.QuizPlayScreen }))
);

type AppRoute =
  | { name: 'public'; tab: PublicTabId }
  | { name: 'subject'; subjectId: SubjectId }
  | { name: 'quiz'; subjectId: SubjectId; chapterId: string };

const LOCAL_UNLOCKS_KEY = 'std10_unlocked_subjects_v2';
const LEGACY_UNLOCKS_KEY = 'std10_unlocked_subjects_v1';
const LOCAL_FREE_MOCK_KEY = 'std10_free_mock_used_v1';
const LOCAL_USER_META_KEY = 'std10_public_user_meta_v2';
const LEGACY_USER_META_KEY = 'std10_public_user_meta_v1';

function loadSavedUnlockedSubjects(mobileNumber = ''): string[] {
  const cleanMob = mobileNumber.replace(/\D/g, '').slice(-10);
  const scopedKey = cleanMob ? `${LOCAL_UNLOCKS_KEY}_${cleanMob}` : LOCAL_UNLOCKS_KEY;
  try {
    const raw =
      localStorage.getItem(scopedKey) ??
      (cleanMob ? localStorage.getItem(`${LEGACY_UNLOCKS_KEY}_${cleanMob}`) : null) ??
      localStorage.getItem(LOCAL_UNLOCKS_KEY) ??
      localStorage.getItem(LEGACY_UNLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function loadSavedFreeMockUsedSubjects(mobileNumber = ''): string[] {
  const cleanMob = mobileNumber.replace(/\D/g, '').slice(-10);
  const scopedKey = cleanMob ? `${LOCAL_FREE_MOCK_KEY}_${cleanMob}` : LOCAL_FREE_MOCK_KEY;
  try {
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((x) => String(x)).filter((s) => ALL_SUBJECT_IDS.includes(s as SubjectId))
      : [];
  } catch {
    return [];
  }
}

function loadSavedUserMeta(): { name: string; mobile: string } {
  try {
    const raw =
      localStorage.getItem(LOCAL_USER_META_KEY) ??
      localStorage.getItem(LEGACY_USER_META_KEY);
    if (!raw) return { name: '', mobile: '' };
    const parsed = JSON.parse(raw) as { name?: string; mobile?: string };
    return {
      name: (parsed.name ?? '').trim(),
      mobile: (parsed.mobile ?? '').replace(/\D/g, '').slice(-10),
    };
  } catch {
    return { name: '', mobile: '' };
  }
}

function loadInitialStudentSession(): {
  meta: { name: string; mobile: string };
  unlocked: string[];
  freeMockUsed: string[];
  paymentIds: string[];
  initialAttempts: QuizAttempt[];
  nativeSnapshot: StudentProfile | null;
} {
  const webMeta = loadSavedUserMeta();
  const nativeSnapshot = getNativeActiveStudentSnapshot();
  const nativeMobile = (nativeSnapshot?.mobileNumber ?? '').replace(/\D/g, '').slice(-10);
  const nativeName = (nativeSnapshot?.fullName ?? '').trim().slice(0, 60);

  const effectiveMobile = /^[0-9]{10}$/.test(webMeta.mobile) ? webMeta.mobile : nativeMobile;
  const effectiveName = webMeta.name || nativeName;

  const meta = {
    name: effectiveName,
    mobile: /^[0-9]{10}$/.test(effectiveMobile) ? effectiveMobile : '',
  };

  if (meta.name && meta.mobile) {
    try {
      localStorage.setItem(LOCAL_USER_META_KEY, JSON.stringify(meta));
    } catch {
      // Ignore
    }
    setNativeActiveStudentMobile(meta.mobile);
  }

  const unlockedSet = new Set<string>(loadSavedUnlockedSubjects(meta.mobile));
  if (nativeSnapshot && nativeMobile === meta.mobile) {
    (nativeSnapshot.unlockedSubjects ?? []).forEach((s) => unlockedSet.add(String(s)));
    if (nativeSnapshot.hasQuizAccess) {
      unlockedSet.add('all');
      ALL_SUBJECT_IDS.forEach((s) => unlockedSet.add(s));
    }
  }
  if (unlockedSet.size > 0 && meta.mobile) {
    try {
      localStorage.setItem(
        `${LOCAL_UNLOCKS_KEY}_${meta.mobile}`,
        JSON.stringify(Array.from(unlockedSet))
      );
    } catch {
      // Ignore
    }
  }

  const freeMockUsedSet = new Set<string>(loadSavedFreeMockUsedSubjects(meta.mobile));
  if (nativeSnapshot && nativeMobile === meta.mobile) {
    (nativeSnapshot.freeMockUsedSubjects ?? []).forEach((s) => {
      if (ALL_SUBJECT_IDS.includes(s as SubjectId)) freeMockUsedSet.add(String(s));
    });
  }
  if (freeMockUsedSet.size > 0 && meta.mobile) {
    try {
      localStorage.setItem(
        `${LOCAL_FREE_MOCK_KEY}_${meta.mobile}`,
        JSON.stringify(Array.from(freeMockUsedSet))
      );
    } catch {
      // Ignore
    }
  }

  let paymentIds = loadMyPaymentRequestIds(meta.mobile);
  if (nativeSnapshot && nativeMobile === meta.mobile && nativeSnapshot.paymentRequestIds?.length) {
    nativeSnapshot.paymentRequestIds.forEach((pid) => {
      if (/^pay_[a-f0-9]{32}$/.test(pid)) {
        paymentIds = saveMyPaymentRequestId(pid, meta.mobile);
      }
    });
  }

  const resolvedDocId = meta.mobile ? getStudentDocId(meta.mobile) : '';
  const initialAttempts = resolvedDocId ? loadCachedMyAttempts(resolvedDocId).slice(0, 20) : [];

  const hydratedSnapshot: StudentProfile | null =
    nativeSnapshot && nativeMobile === meta.mobile ? nativeSnapshot : null;

  return {
    meta,
    unlocked: Array.from(unlockedSet),
    freeMockUsed: Array.from(freeMockUsedSet),
    paymentIds,
    initialAttempts,
    nativeSnapshot: hydratedSnapshot,
  };
}

const AppContent: React.FC = () => {
  const { lang, t } = useTranslation();
  useTvRemoteNavigation(true);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);

  const [initialSession] = useState(loadInitialStudentSession);
  const [authUser, setAuthUser] = useState<AppAuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(getSyncStatus);
  const [isDocumentVisible, setIsDocumentVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
  );

  const [student, setStudent] = useState<StudentProfile | null>(initialSession.nativeSnapshot);
  const [savedUserMeta, setSavedUserMeta] = useState<{ name: string; mobile: string }>(
    initialSession.meta
  );
  const [localUnlockedSubjects, setLocalUnlockedSubjects] = useState<string[]>(
    initialSession.unlocked
  );
  const [localFreeMockUsedSubjects, setLocalFreeMockUsedSubjects] = useState<string[]>(
    initialSession.freeMockUsed
  );
  const [myPaymentIds, setMyPaymentIds] = useState<string[]>(initialSession.paymentIds);
  const [prefilledCode] = useState('');

  const [myPayments, setMyPayments] = useState<PaymentRequest[]>([]);
  const [myAttempts, setMyAttempts] = useState<QuizAttempt[]>(initialSession.initialAttempts);
  const [allPayments, setAllPayments] = useState<PaymentRequest[]>([]);
  const [allCodes, setAllCodes] = useState<AccessCode[]>([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [releaseConfig, setReleaseConfig] = useState<AppReleaseConfig | null>(null);

  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [hasMoreCodes, setHasMoreCodes] = useState(false);
  const [hasMoreStudents, setHasMoreStudents] = useState(false);
  const [isLoadingMorePayments, setIsLoadingMorePayments] = useState(false);
  const [isLoadingMoreCodes, setIsLoadingMoreCodes] = useState(false);
  const [isLoadingMoreStudents, setIsLoadingMoreStudents] = useState(false);

  const [syncVersion, setSyncVersion] = useState(0);
  const [route, setRoute] = useState<AppRoute>({ name: 'public', tab: 'quiz' });
  const [loadedSubjects, setLoadedSubjects] = useState<Partial<Record<SubjectId, QuizSubject>>>({});
  const [activeMockChapter, setActiveMockChapter] = useState<QuizChapter | null>(null);
  const [pendingSubjectUnlockModal, setPendingSubjectUnlockModal] = useState<'pay' | 'code' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const { isLargeScreen, isTvOrSmartBoard } = useAdaptiveDisplay();
  const [banner, setBanner] = useState<ActionBanner | null>(null);
  const [lastGeneratedBatch, setLastGeneratedBatch] = useState<string[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<AdminLiveAlert[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [approvedConfirmation, setApprovedConfirmation] = useState<PaymentRequest | null>(null);

  const [githubAvailableUpdate, setGithubAvailableUpdate] = useState<GitHubReleaseInfo | null>(null);
  const [webSwAvailableUpdate, setWebSwAvailableUpdate] = useState<GitHubReleaseInfo | null>(null);
  const [deepLinkUpdateFallback, setDeepLinkUpdateFallback] = useState<GitHubReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [dismissedOptionalVersionKey, setDismissedOptionalVersionKey] = useState<string>('');
  const [updateNotifications, setUpdateNotifications] = useState<UpdateNotificationRecord[]>([]);
  const [installedAppInfo] = useState<InstalledAppInfo | null>(() => getNativeInstalledAppInfo());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Admin Notifications Center, Push Permission & 1-to-1 Messaging
  const [adminSelectedTab, setAdminSelectedTab] = useState<AdminTabId>('requests');
  const [focusedAdminTarget, setFocusedAdminTarget] = useState<AdminFocusedTarget | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [adminDirectory, setAdminDirectory] = useState<AdminUser[]>([]);
  const [adminInvites, setAdminInvites] = useState<AdminInvite[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([]);
  const [adminChats, setAdminChats] = useState<AdminChatThread[]>([]);
  const [activeAdminChatId, setActiveAdminChatId] = useState('');
  const [activeAdminChatMessages, setActiveAdminChatMessages] = useState<AdminChatMessage[]>([]);
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<
    'granted' | 'denied' | 'default'
  >(() => getNotificationPermissionState());
  const [pushBroadcasts, setPushBroadcasts] = useState<PushBroadcastRecord[]>([]);
  const [dismissedNotifPrompt, setDismissedNotifPrompt] = useState(false);
  const [bannerTargetAction, setBannerTargetAction] = useState<{
    tab: AdminTabId;
    chatId?: string;
  } | null>(null);

  const lastCheckedConfigKeyRef = useRef<string>('');
  const lastUpdateCheckAtRef = useRef<number>(0);
  const checkInFlightRef = useRef<boolean>(false);
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const knownUsedCodesRef = useRef<Set<string> | null>(null);
  const knownNotifIdsRef = useRef<Set<string> | null>(null);
  const knownChatSigRef = useRef<Map<string, string> | null>(null);
  const hasAutoRequestedPushRef = useRef(false);
  const pendingDeepLinkRef = useRef<AdminDeepLinkPayload | null>(null);
  const handlePublicPushDeepLinkRef = useRef<(payload: AdminDeepLinkPayload) => void>(() => {});
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const langRef = useRef(lang);
  const currentNotificationPrefsRef = useRef<AdminNotificationPrefs | null>(null);
  const activeAdminChatIdRef = useRef(activeAdminChatId);
  const adminSelectedTabRef = useRef(adminSelectedTab);
  const routeRef = useRef(route);
  const isDocumentVisibleRef = useRef(isDocumentVisible);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    activeAdminChatIdRef.current = activeAdminChatId;
  }, [activeAdminChatId]);

  useEffect(() => {
    adminSelectedTabRef.current = adminSelectedTab;
  }, [adminSelectedTab]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    isDocumentVisibleRef.current = isDocumentVisible;
  }, [isDocumentVisible]);

  const hasValidMobile = useMemo(
    () => /^[0-9]{10}$/.test(savedUserMeta.mobile),
    [savedUserMeta.mobile]
  );

  const isStudentLoggedIn = useMemo(
    () => savedUserMeta.name.trim().length > 0 && hasValidMobile,
    [hasValidMobile, savedUserMeta.name]
  );

  const effectiveStudentName = useMemo(() => savedUserMeta.name.trim(), [savedUserMeta.name]);

  const formatAppError = useCallback(
    (err: unknown, fallback?: string): string => {
      const msg = err instanceof Error ? err.message : '';
      switch (msg) {
        case 'INVALID_NAME':
          return t.errInvalidName;
        case 'INVALID_MOBILE':
          return t.errInvalidMobile;
        case 'INVALID_AMOUNT':
          return t.errInvalidAmount;
        case 'INVALID_UTR':
          return t.errInvalidUtr;
        case 'SCREENSHOT_REQUIRED':
          return t.errScreenshotRequired;
        case 'DUPLICATE_UTR':
          return t.errDuplicateUtr;
        case 'INVALID_CODE_FORMAT':
          return t.errInvalidCodeFormat;
        case 'CODE_NOT_FOUND':
          return t.errCodeNotFound;
        case 'CODE_ALREADY_USED':
          return t.errCodeAlreadyUsed;
        case 'ALREADY_PROCESSED':
          return t.errAlreadyApproved;
        default: {
          if (msg.startsWith('SUBJECT_MISMATCH:')) {
            const codeSub = msg.split(':')[1] ?? 'all';
            const subName = getSubjectDisplayName(codeSub, lang);
            return lang === 'en'
              ? `This code is valid for ${subName}.`
              : `આ કોડ ${subName} માટે છે.`;
          }
          const readable = extractReadableErrorMessage(err, lang);
          return readable || fallback || t.errCodeNotFound;
        }
      }
    },
    [lang, t]
  );

  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('std10_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkTheme);
    try {
      localStorage.setItem('std10_theme', isDarkTheme ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [isDarkTheme]);

  // Observe Firebase Auth state (native Credential Manager Google Sign-In on APK or Web Firebase Auth on browser).
  useEffect(() => {
    const unsub = observeAppAuthState((user) => {
      if (!user) {
        setAuthUser(null);
        setAllPayments([]);
        setAllCodes([]);
        setAllStudents([]);
        setAdminProfile(null);
        setAdminDirectory([]);
        setAdminInvites([]);
        setAdminNotifications([]);
        setAdminChats([]);
        setActiveAdminChatId('');
        setActiveAdminChatMessages([]);
        knownPendingIdsRef.current = null;
        knownUsedCodesRef.current = null;
        knownNotifIdsRef.current = null;
        knownChatSigRef.current = null;
      } else {
        setAuthUser(user);
      }
      setAuthInitialized(true);
    });
    return () => unsub();
  }, []);

  const isFirebaseAdmin = useMemo(() => {
    if (!authUser) return false;
    if (isAdminAccount(authUser.phoneNumber ?? '', authUser.email ?? '')) return true;
    if (adminProfile?.isActive) return true;
    return adminDirectory.some((a) => a.uid === authUser.uid && a.isActive);
  }, [adminDirectory, adminProfile, authUser]);

  const isSuperAdmin = useMemo(() => {
    if (!authUser) return false;
    return isSuperAdminEmail(authUser.email ?? '') || adminProfile?.role === 'super_admin';
  }, [adminProfile?.role, authUser]);

  const isAdmin = isFirebaseAdmin;

  const currentNotificationPrefs = useMemo<AdminNotificationPrefs | null>(() => {
    if (!authUser) return null;
    const fromDir = adminDirectory.find((a) => a.uid === authUser.uid);
    return fromDir?.notificationPrefs ?? adminProfile?.notificationPrefs ?? null;
  }, [adminDirectory, adminProfile, authUser]);

  useEffect(() => {
    currentNotificationPrefsRef.current = currentNotificationPrefs;
  }, [currentNotificationPrefs]);

  const resolveAdminTabFromPayload = useCallback((payload: AdminDeepLinkPayload): AdminTabId => {
    switch (payload.targetRoute) {
      case 'admin_chat':
        return 'chat';
      case 'admin_requests':
        return 'requests';
      case 'admin_codes':
        return 'used_codes';
      case 'admin_students':
        return 'students';
      case 'admin_updates':
        return 'updates';
      default: {
        const cat = String(payload.category ?? payload.broadcastCategory ?? '').trim();
        if (cat === 'registration' || cat === 'login' || cat === 'quiz_activity') return 'students';
        if (cat === 'payment') return 'requests';
        if (cat === 'code_redeem') return 'used_codes';
        if (cat === 'admin_chat') return 'chat';
        return 'notifications';
      }
    }
  }, []);

  const applyAdminDeepLink = useCallback(
    (payload: AdminDeepLinkPayload) => {
      const targetTab = resolveAdminTabFromPayload(payload);
      setRoute({ name: 'public', tab: 'admin' });
      setAdminSelectedTab(targetTab);

      if (targetTab === 'chat') {
        setFocusedAdminTarget(null);
        const resolvedChatId =
          payload.chatId?.trim() ||
          (payload.senderUid && authUser?.uid
            ? getAdminChatId(authUser.uid, payload.senderUid)
            : '');
        if (resolvedChatId) {
          setActiveAdminChatId(resolvedChatId);
          void markAdminChatMessagesRead(resolvedChatId);
        }
      } else if (
        payload.referenceId?.trim() ||
        payload.actorMobile?.trim() ||
        payload.actorName?.trim() ||
        payload.broadcastTitle?.trim()
      ) {
        setFocusedAdminTarget({
          tab: targetTab,
          referenceId: payload.referenceId?.trim() || undefined,
          actorName: payload.actorName?.trim() || undefined,
          actorMobile: payload.actorMobile?.trim() || undefined,
          category: String(payload.category ?? payload.broadcastCategory ?? '').trim() || undefined,
          title: payload.broadcastTitle?.trim() || payload.updateTitle?.trim() || undefined,
          body: payload.broadcastBody?.trim() || payload.releaseNotes?.trim() || undefined,
          notifId: payload.notifId?.trim() || undefined,
        });
      } else {
        setFocusedAdminTarget(null);
      }

      if (payload.notifId && authUser?.uid) {
        void markAdminNotificationAsRead(payload.notifId).catch(() => {});
      }
    },
    [authUser?.uid, resolveAdminTabFromPayload]
  );

  // Observe public App Release Config, Update History & Push Broadcasts for ALL users
  useEffect(() => {
    const unsubConfig = observeReleaseConfig(setReleaseConfig);
    const unsubNotifs = observeUpdateNotifications(setUpdateNotifications);
    const unsubBroadcasts = observePushBroadcasts(setPushBroadcasts);
    return () => {
      unsubConfig();
      unsubNotifs();
      unsubBroadcasts();
    };
  }, []);

  // Request Android 13+ notification permission cleanly on logged-in student devices too
  useEffect(() => {
    if (
      isStudentLoggedIn &&
      hasNativeFirebaseBridge() &&
      getNotificationPermissionState() !== 'granted' &&
      !hasAutoRequestedPushRef.current
    ) {
      hasAutoRequestedPushRef.current = true;
      void requestAppNotificationPermission()
        .then((status) => setNotificationPermissionStatus(status))
        .catch(() => {});
    }
  }, [isStudentLoggedIn]);

  // Subscribe to Web Service Worker update notifications (browser / PWA only)
  useEffect(() => {
    return subscribeWebSwUpdates((swRelease) => {
      setWebSwAvailableUpdate(swRelease);
    });
  }, []);

  const currentVersionName = installedAppInfo?.versionName || APP_VERSION_NAME;
  const currentVersionCode = installedAppInfo?.versionCode || APP_VERSION_CODE || 1;

  const handleIncomingAppUpdateDeepLink = useCallback(
    (payload: AdminDeepLinkPayload) => {
      const remoteName = (payload.versionName ?? '').replace(/^v/i, '').trim();
      const remoteCode = payload.versionCode;
      if (
        remoteName &&
        isReleaseVersionNewer(remoteName, remoteCode, currentVersionName, currentVersionCode)
      ) {
        const key = `${remoteName}_${remoteCode ?? 0}`;
        setDismissedOptionalVersionKey((prev) => (prev === key ? '' : prev));
        setDeepLinkUpdateFallback({
          tagName: `v${remoteName}`,
          versionName: remoteName,
          versionCode: remoteCode,
          releaseTitle: payload.updateTitle?.trim() || `Quick Quiz v${remoteName}`,
          releaseNotes: payload.releaseNotes?.trim() || '',
          apkDownloadUrl: (payload.apkDownloadUrl ?? '').trim(),
          htmlUrl: '',
          apkSizeBytes: 0,
          isMandatory: Boolean(payload.isMandatory),
          source: 'firebase',
          isUpdateAvailable: true,
        });
        setIsUpdateModalOpen(true);
      } else if (!remoteName && payload.apkDownloadUrl?.trim()) {
        const fallbackCode = currentVersionCode + 1;
        const key = `${currentVersionName}_${fallbackCode}`;
        setDismissedOptionalVersionKey((prev) => (prev === key ? '' : prev));
        setDeepLinkUpdateFallback({
          tagName: '',
          versionName: currentVersionName,
          versionCode: fallbackCode,
          releaseTitle: payload.updateTitle?.trim() || t.appUpdateAvailableTitle,
          releaseNotes: payload.releaseNotes?.trim() || '',
          apkDownloadUrl: payload.apkDownloadUrl.trim(),
          htmlUrl: '',
          apkSizeBytes: 0,
          isMandatory: Boolean(payload.isMandatory),
          source: 'firebase',
          isUpdateAvailable: true,
        });
        setIsUpdateModalOpen(true);
      }
      lastUpdateCheckAtRef.current = 0;
    },
    [currentVersionCode, currentVersionName, t.appUpdateAvailableTitle]
  );

  // Sync Native Push Permission + Deep-Link Routing (App Update, Public Push Broadcasts, Admin Alerts)
  useEffect(() => {
    const isPublicPushRoute = (r: AdminDeepLinkPayload['targetRoute']): boolean =>
      r === 'app_update' ||
      r === 'home' ||
      r === 'mock_test' ||
      r === 'subject_maths' ||
      r === 'subject_science' ||
      r === 'subject_social_science' ||
      r === 'subject_gujarati' ||
      r === 'subject_hindi';

    const routeIncomingDeepLink = (payload: AdminDeepLinkPayload) => {
      if (isPublicPushRoute(payload.targetRoute)) {
        handlePublicPushDeepLinkRef.current(payload);
        return;
      }
      // Immediately route to Admin screen + matching tab even during cold start before Auth hydrates
      applyAdminDeepLink(payload);
      if (!isFirebaseAdmin) {
        pendingDeepLinkRef.current = payload;
      }
    };

    const onWebPushDeepLink = (event: Event) => {
      const detail = (event as CustomEvent<AdminDeepLinkPayload>).detail;
      if (detail) {
        routeIncomingDeepLink(detail);
      }
    };
    window.addEventListener('quick-quiz:push-deeplink', onWebPushDeepLink);

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; payload?: Record<string, unknown> } | null;
      if (msg?.type !== 'QUICK_QUIZ_NOTIFICATION_CLICK' || !msg.payload) return;
      const rawRoute = String(msg.payload.targetRoute ?? 'home').trim();
      const targetRoute = rawRoute as AdminDeepLinkPayload['targetRoute'];
      routeIncomingDeepLink({
        targetRoute,
        broadcastId: String(msg.payload.broadcastId ?? ''),
        broadcastCategory: String(msg.payload.category ?? ''),
        broadcastTitle: String(msg.payload.title ?? ''),
        broadcastBody: String(msg.payload.body ?? ''),
        versionName: String(msg.payload.versionName ?? ''),
        apkDownloadUrl: String(msg.payload.apkDownloadUrl ?? ''),
        releaseNotes: String(msg.payload.releaseNotes ?? ''),
        updateTitle: String(msg.payload.title ?? ''),
        isMandatory: msg.payload.isMandatory === true || msg.payload.isMandatory === 'true',
      });
    };
    let swListenerAttached = false;
    const canUseWebServiceWorker =
      !hasNativeFirebaseBridge() &&
      typeof window !== 'undefined' &&
      window.location.hostname !== 'appassets.androidplatform.net' &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator;

    if (canUseWebServiceWorker) {
      try {
        if (navigator.serviceWorker && typeof navigator.serviceWorker.addEventListener === 'function') {
          navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
          swListenerAttached = true;
        }
      } catch {
        // Ignore restricted WebView / browser ServiceWorker SecurityError
      }
    }

    const cleanupWebListeners = () => {
      window.removeEventListener('quick-quiz:push-deeplink', onWebPushDeepLink);
      if (swListenerAttached) {
        try {
          navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
        } catch {
          // Ignore cleanup error
        }
      }
    };

    if (!hasNativeFirebaseBridge()) {
      return cleanupWebListeners;
    }

    const unsubPerm = subscribeNativeNotificationPermission((status) => {
      setNotificationPermissionStatus(status);
    });
    const unsubDeepLink = subscribeNativeAdminDeepLink(routeIncomingDeepLink);
    const initialDeepLink = consumeNativePendingDeepLink();
    if (initialDeepLink) {
      routeIncomingDeepLink(initialDeepLink);
    }
    return () => {
      cleanupWebListeners();
      unsubPerm();
      unsubDeepLink();
    };
  }, [applyAdminDeepLink, isFirebaseAdmin]);

  useEffect(() => {
    if (!isFirebaseAdmin || !authUser?.uid) return undefined;

    if (pendingDeepLinkRef.current) {
      const pending = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      applyAdminDeepLink(pending);
    }

    void syncAdminProfileAndPushToken()
      .then((profile) => {
        if (profile) setAdminProfile(profile);
      })
      .catch(() => {});

    if (
      hasNativeFirebaseBridge() &&
      getNotificationPermissionState() !== 'granted' &&
      !hasAutoRequestedPushRef.current
    ) {
      hasAutoRequestedPushRef.current = true;
      void requestAppNotificationPermission()
        .then((status) => setNotificationPermissionStatus(status))
        .catch(() => {});
    }

    const unsubs = [
      observeAdminDirectory(setAdminDirectory),
      observeAdminInvites(isSuperAdmin, setAdminInvites),
      observeAdminNotifications((items) => {
        setAdminNotifications(items);
        const ids = new Set(items.map((n) => n.id));
        if (knownNotifIdsRef.current === null) {
          knownNotifIdsRef.current = ids;
          return;
        }
        const newlyAdded = items.filter((n) => !knownNotifIdsRef.current?.has(n.id));
        knownNotifIdsRef.current = ids;
          if (newlyAdded.length > 0) {
          const latest = newlyAdded[0];
          const prefs = currentNotificationPrefsRef.current;
          const catPrefMap: Record<AdminNotificationCategory, keyof AdminNotificationPrefs> = {
            registration: 'registrations',
            login: 'logins',
            payment: 'payments',
            code_redeem: 'codeRedemptions',
            quiz_activity: 'quizActivity',
            data_update: 'dataUpdates',
            admin_chat: 'adminChat',
          };
          const prefKey = catPrefMap[latest.category];
          const allowed = prefs ? prefs[prefKey] !== false : true;
          if (allowed && !latest.isRead) {
            if (isSoundEnabledRef.current) quizAudioPlayer.playAdminAlertChime();
            const targetTabMap: Record<string, AdminTabId> = {
              admin_requests: 'requests',
              admin_codes: 'used_codes',
              admin_students: 'students',
              admin_updates: 'updates',
              admin_notifications: 'notifications',
            };
            setBannerTargetAction({
              tab: targetTabMap[latest.targetRoute] ?? 'notifications',
            });
            setBanner({
              isError: false,
              message: `${latest.title} — ${latest.body}`,
            });
          }
        }
      }),
      observeAdminChats(authUser.uid, (chats) => {
        setAdminChats(chats);
        const nextMap = new Map<string, string>();
        chats.forEach((c) => {
          const sig = `${c.lastMessageSenderUid}_${c.lastMessageAt?.seconds ?? 0}`;
          nextMap.set(c.id, sig);
        });
        if (knownChatSigRef.current === null) {
          knownChatSigRef.current = nextMap;
          return;
        }
        const incomingChat = chats.find((c) => {
          const prevSig = knownChatSigRef.current?.get(c.id);
          const curSig = nextMap.get(c.id);
          return (
            curSig &&
            prevSig !== curSig &&
            c.lastMessageSenderUid &&
            c.lastMessageSenderUid !== authUser.uid
          );
        });
        knownChatSigRef.current = nextMap;

        if (incomingChat) {
          const prefs = currentNotificationPrefsRef.current;
          const allowed = prefs ? prefs.adminChat !== false : true;
          const curRoute = routeRef.current;
          const alreadyViewingThisThread =
            curRoute.name === 'public' &&
            curRoute.tab === 'admin' &&
            adminSelectedTabRef.current === 'chat' &&
            activeAdminChatIdRef.current === incomingChat.id &&
            isDocumentVisibleRef.current;
          if (allowed && !alreadyViewingThisThread) {
            if (isSoundEnabledRef.current) quizAudioPlayer.playAdminAlertChime();
            setBannerTargetAction({ tab: 'chat', chatId: incomingChat.id });
            setBanner({
              isError: false,
              message: `💬 ${incomingChat.lastMessageSenderName || 'Admin'}: ${incomingChat.lastMessageText}`,
            });
          }
        }
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [applyAdminDeepLink, authUser?.uid, isFirebaseAdmin, isSuperAdmin]);

  useEffect(() => {
    if (!isFirebaseAdmin || !authUser?.uid || !activeAdminChatId) {
      setActiveAdminChatMessages([]);
      return undefined;
    }
    return observeAdminChatMessages(
      activeAdminChatId,
      authUser.uid,
      setActiveAdminChatMessages
    );
  }, [activeAdminChatId, authUser?.uid, isFirebaseAdmin]);

  const studentDocId = useMemo(() => {
    if (hasValidMobile) {
      return getStudentDocId(savedUserMeta.mobile);
    }
    if (authUser && !isFirebaseAdmin) {
      return authUser.uid;
    }
    return '';
  }, [authUser, hasValidMobile, isFirebaseAdmin, savedUserMeta.mobile]);

  const clearLocalStudentSession = useCallback(() => {
    setSavedUserMeta({ name: '', mobile: '' });
    setStudent(null);
    setMyAttempts([]);
    setLocalUnlockedSubjects([]);
    setLocalFreeMockUsedSubjects([]);
    setActiveMockChapter(null);
    setPendingSubjectUnlockModal(null);
    setMyPaymentIds([]);
    setMyPayments([]);
    setNativeActiveStudentMobile('');
    try {
      localStorage.removeItem(LOCAL_USER_META_KEY);
      localStorage.removeItem(LEGACY_USER_META_KEY);
    } catch {
      // Ignore
    }
    setRoute({ name: 'public', tab: 'quiz' });
  }, []);

  // Subscribe to global Smart Live Sync telemetry
  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  // Monitor Online/Offline transitions and auto-flush pending Firestore updates
  useEffect(() => {
    const onOnline = () => {
      setOnlineState(true);
      void flushPendingSyncOperations();
      if (isFirebaseAdmin) {
        const lastMs = getSyncStatus().lastSyncAtMs ?? 0;
        if (lastMs > 0) {
          void syncAdminDeltaSince(lastMs);
        }
      }
    };
    const onOffline = () => {
      setOnlineState(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setOnlineState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isFirebaseAdmin]);

  // Dynamically load heavy chapter question banks only when a subject or quiz route is active
  const activeSubjectId: SubjectId | null =
    route.name === 'subject' || route.name === 'quiz' ? route.subjectId : null;

  useEffect(() => {
    if (!activeSubjectId) return;
    if (loadedSubjects[activeSubjectId] || getCachedSubject(activeSubjectId)) {
      const cached = getCachedSubject(activeSubjectId);
      if (cached && !loadedSubjects[activeSubjectId]) {
        setLoadedSubjects((prev) => ({ ...prev, [activeSubjectId]: cached }));
      }
      return;
    }
    let cancelled = false;
    void loadSubjectWithChapters(activeSubjectId)
      .then((subject) => {
        if (!cancelled) {
          setLoadedSubjects((prev) => ({ ...prev, [activeSubjectId]: subject }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBanner({ isError: true, message: extractReadableErrorMessage(err, langRef.current) });
          setRoute({ name: 'public', tab: 'quiz' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSubjectId, loadedSubjects]);

  const mergedPaymentIds = useMemo(() => {
    const set = new Set<string>(myPaymentIds);
    student?.paymentRequestIds?.forEach((id) => {
      if (/^pay_[a-f0-9]{32}$/.test(id)) set.add(id);
    });
    return Array.from(set).slice(0, 25);
  }, [myPaymentIds, student?.paymentRequestIds]);

  // Ensure activeMockChapter is stably built if entering a mock quiz route directly
  useEffect(() => {
    if (route.name !== 'quiz') return;
    if (route.chapterId !== `mock_test_${route.subjectId}`) return;
    const subject = loadedSubjects[route.subjectId] ?? getCachedSubject(route.subjectId);
    if (!subject) return;
    if (activeMockChapter?.subjectId === subject.id) return;
    setActiveMockChapter(buildBoardExamMockTestChapter(subject));
  }, [activeMockChapter?.subjectId, loadedSubjects, route]);

  const effectiveUnlockedSubjects = useMemo(() => {
    if (student) {
      const set = new Set<string>(student.unlockedSubjects ?? []);
      if (student.hasQuizAccess) {
        set.add('all');
        ALL_SUBJECT_IDS.forEach((s) => set.add(s));
      }
      return Array.from(set);
    }
    return localUnlockedSubjects;
  }, [localUnlockedSubjects, student]);

  const effectiveFreeMockUsedSubjects = useMemo(
    () =>
      Array.from(
        new Set([...localFreeMockUsedSubjects, ...(student?.freeMockUsedSubjects ?? [])])
      ),
    [localFreeMockUsedSubjects, student?.freeMockUsedSubjects]
  );

  const mergedPaymentIdsKey = mergedPaymentIds.join(',');
  const authUserUid = authUser?.uid ?? '';

  // 1. Student profile & recent attempts listener (only re-runs if studentDocId changes)
  useEffect(() => {
    if (!studentDocId) {
      setStudent(null);
      setMyAttempts([]);
      return;
    }

    const unsubProfile = observeStudentProfile(
      studentDocId,
      (profile) => {
        if (!profile) return;
        setStudent((prev) => mergeStudentProfilesConflictSafe(profile, prev));
      },
      () => {}
    );
    const unsubAttempts = observeMyQuizAttempts(studentDocId, (remoteAttempts) => {
      setMyAttempts((prev) => {
        const map = new Map<string, QuizAttempt>();
        [...remoteAttempts, ...prev].forEach((a) => {
          if (a?.id && !map.has(a.id)) map.set(a.id, a);
        });
        return Array.from(map.values())
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
          .slice(0, 20);
      });
    });

    return () => {
      unsubProfile();
      unsubAttempts();
    };
  }, [studentDocId]);

  // 2. Payment request status listeners (decoupled from admin and profile updates)
  useEffect(() => {
    const ids = mergedPaymentIdsKey ? mergedPaymentIdsKey.split(',').filter(Boolean) : [];
    if (ids.length > 0) {
      return observePaymentRequestsByIds(ids, setMyPayments);
    }
    if (authUserUid && !isFirebaseAdmin) {
      return observeMyPaymentRequests(authUserUid, setMyPayments);
    }
    setMyPayments([]);
    return undefined;
  }, [authUserUid, isFirebaseAdmin, mergedPaymentIdsKey]);

  const isAdminPanelVisible =
    isFirebaseAdmin && route.name === 'public' && route.tab === 'admin' && isDocumentVisible;

  // 3. Admin live collection listeners — active ONLY when Admin Panel is visible in foreground
  useEffect(() => {
    if (!isFirebaseAdmin) {
      knownPendingIdsRef.current = null;
      knownUsedCodesRef.current = null;
      setAllPayments([]);
      setAllCodes([]);
      setAllStudents([]);
      setLiveSyncState('paused');
      return;
    }

    if (!isAdminPanelVisible) {
      setLiveSyncState('paused');
      if (hasNativeFirebaseBridge()) {
        pauseNativeAdminListeners();
      }
      return;
    }

    if (hasNativeFirebaseBridge()) {
      resumeNativeAdminListeners();
    }
    setLiveSyncState('active');

    const onAdminListenerError = (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err ?? '');
      const lower = raw.toLowerCase();
      if (
        raw === 'QUOTA_EXCEEDED' ||
        lower.includes('resource_exhausted') ||
        lower.includes('resource-exhausted') ||
        lower.includes('quota')
      ) {
        return;
      }
      setBanner({
        isError: true,
        message: extractReadableErrorMessage(err, langRef.current),
      });
    };

    const unsubs = [
      observeAllStudents((list) => {
        setAllStudents(list);
        setHasMoreStudents(list.length >= ADMIN_PAGE_SIZE);
      }, onAdminListenerError),

      observeAllPaymentRequests((items) => {
        setAllPayments(items);
        setHasMorePayments(items.length >= ADMIN_PAGE_SIZE);
        const pendingItems = items.filter((p) => p.status === 'pending');
        const pendingIds = new Set(pendingItems.map((p) => p.id));

        if (knownPendingIdsRef.current === null) {
          knownPendingIdsRef.current = pendingIds;
        } else {
          const newlyArrived = pendingItems.filter((p) => !knownPendingIdsRef.current?.has(p.id));
          knownPendingIdsRef.current = pendingIds;

          if (newlyArrived.length > 0) {
            if (isSoundEnabledRef.current) quizAudioPlayer.playAdminAlertChime();
            const latest = newlyArrived[0];
            const currentLang = langRef.current;
            setBanner({
              isError: false,
              message:
                currentLang === 'en'
                  ? `New Payment Request: ${latest.studentName} (₹${latest.amountRupees})`
                  : `નવી પેમેન્ટ વિનંતી: ${latest.studentName} (₹${latest.amountRupees})`,
            });
            setLiveAlerts((prev) => [
              ...newlyArrived.map((req) => ({
                id: `pay_${req.id}_${Date.now()}`,
                kind: 'new_payment' as const,
                title:
                  currentLang === 'en'
                    ? `New Payment: ${req.studentName} (₹${req.amountRupees})`
                    : `નવું પેમેન્ટ: ${req.studentName} (₹${req.amountRupees})`,
                detail: `+91 ${req.mobileNumber} • UTR: ${req.upiTransactionRef}`,
                timestampLabel: new Date().toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })),
              ...prev.slice(0, 29),
            ]);
          }
        }
      }, onAdminListenerError),

      observeAllAccessCodes((codes) => {
        setAllCodes(codes);
        setHasMoreCodes(false);
        const usedItems = codes.filter((c) => c.status === 'used' || c.isUsed);
        const usedCodeSet = new Set(usedItems.map((c) => c.code));

        if (knownUsedCodesRef.current === null) {
          knownUsedCodesRef.current = usedCodeSet;
        } else {
          const newlyUsed = usedItems.filter((c) => !knownUsedCodesRef.current?.has(c.code));
          knownUsedCodesRef.current = usedCodeSet;

          if (newlyUsed.length > 0) {
            if (isSoundEnabledRef.current) quizAudioPlayer.playAdminAlertChime();
            const latest = newlyUsed[0];
            const usedName = latest.usedBy?.name || latest.usedByName || 'User';
            const usedMob = latest.usedBy?.mobile || latest.usedByMobile || '';
            const currentLang = langRef.current;
            setBanner({
              isError: false,
              message:
                currentLang === 'en'
                  ? `Code Used Live: ${latest.code} by ${usedName} (+91 ${usedMob})`
                  : `કોડ હમણાં વપરાયો: ${latest.code} • ${usedName} (+91 ${usedMob})`,
            });
            setLiveAlerts((prev) => [
              ...newlyUsed.map((c) => ({
                id: `use_${c.code}_${Date.now()}`,
                kind: 'code_used' as const,
                title:
                  currentLang === 'en'
                    ? `Code Used: ${c.code}`
                    : `કોડ વપરાયો: ${c.code}`,
                detail: `${c.usedBy?.name || c.usedByName} (+91 ${c.usedBy?.mobile || c.usedByMobile})`,
                timestampLabel: new Date().toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })),
              ...prev.slice(0, 29),
            ]);
          }
        }
      }, onAdminListenerError),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isAdminPanelVisible, isFirebaseAdmin, syncVersion]);

  // 4. Sync restored Firestore student details cleanly across any number of logged-in devices
  useEffect(() => {
    if (!hasValidMobile || !student || !studentDocId || !studentDocId.startsWith('mob_')) return;
    if ((student.id || student.userId) !== studentDocId) return;

    if (student.fullName.trim() && student.fullName.trim() !== savedUserMeta.name) {
      const syncedMeta = { name: student.fullName.trim().slice(0, 60), mobile: savedUserMeta.mobile };
      setSavedUserMeta(syncedMeta);
      try {
        localStorage.setItem(LOCAL_USER_META_KEY, JSON.stringify(syncedMeta));
      } catch {
        // Ignore
      }
    }

    const remoteSubjects = new Set<string>(student.unlockedSubjects ?? []);
    if (student.hasQuizAccess) {
      remoteSubjects.add('all');
      ALL_SUBJECT_IDS.forEach((s) => remoteSubjects.add(s));
    }
    if (remoteSubjects.size > 0) {
      const arr = Array.from(remoteSubjects);
      setLocalUnlockedSubjects(arr);
      try {
        localStorage.setItem(`${LOCAL_UNLOCKS_KEY}_${savedUserMeta.mobile}`, JSON.stringify(arr));
      } catch {
        // Ignore
      }
    }

    const remoteFreeMock = (student.freeMockUsedSubjects ?? []).filter((s) =>
      ALL_SUBJECT_IDS.includes(s as SubjectId)
    );
    if (remoteFreeMock.length > 0) {
      setLocalFreeMockUsedSubjects((prev) => {
        const merged = Array.from(new Set([...prev, ...remoteFreeMock]));
        if (merged.length === prev.length && merged.every((x, i) => x === prev[i])) {
          return prev;
        }
        try {
          localStorage.setItem(`${LOCAL_FREE_MOCK_KEY}_${savedUserMeta.mobile}`, JSON.stringify(merged));
        } catch {
          // Ignore
        }
        return merged;
      });
    }

    if (student.paymentRequestIds && student.paymentRequestIds.length > 0) {
      student.paymentRequestIds.forEach((pid) => {
        if (/^pay_[a-f0-9]{32}$/.test(pid)) {
          const next = saveMyPaymentRequestId(pid, savedUserMeta.mobile);
          setMyPaymentIds(next);
        }
      });
    }
  }, [
    hasValidMobile,
    savedUserMeta.mobile,
    savedUserMeta.name,
    student,
    studentDocId,
  ]);

  useEffect(() => {
    if (!banner) return;
    const timeoutMs = isAdmin ? 6500 : 5000;
    const timer = window.setTimeout(() => {
      setBanner(null);
      setBannerTargetAction(null);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [banner, isAdmin]);

  const configuredGithubRepo = useMemo(
    () => sanitizeOwnerRepo(releaseConfig?.githubOwnerRepo ?? ''),
    [releaseConfig?.githubOwnerRepo]
  );

  useEffect(() => {
    if (configuredGithubRepo) {
      saveGithubOwnerRepoPreference(configuredGithubRepo);
    }
  }, [configuredGithubRepo]);

  const effectiveGithubRepo = useMemo(
    () => resolveEffectiveGithubRepo(configuredGithubRepo),
    [configuredGithubRepo]
  );

  const firebaseAvailableUpdate = useMemo<GitHubReleaseInfo | null>(() => {
    const rawApkUrl = releaseConfig?.apkDownloadUrl?.trim() ?? '';
    const apkUrl = rawApkUrl.startsWith('https://')
      ? rawApkUrl
      : buildPermanentLatestApkUrl(effectiveGithubRepo);
    const remoteVerName = releaseConfig?.latestVersionName?.trim() ?? '';
    const remoteVerCode = Number(releaseConfig?.latestVersionCode ?? 0);
    if (!apkUrl.startsWith('https://') || !remoteVerName) return null;

    if (!isReleaseVersionNewer(remoteVerName, remoteVerCode, currentVersionName, currentVersionCode)) {
      return null;
    }

    return {
      tagName: `v${remoteVerName}`,
      versionName: remoteVerName,
      versionCode: remoteVerCode || currentVersionCode + 1,
      releaseTitle: releaseConfig?.updateTitle?.trim() || `Quick Quiz v${remoteVerName}`,
      releaseNotes: releaseConfig?.releaseNotes?.trim() || '',
      apkDownloadUrl: apkUrl,
      htmlUrl: '',
      apkSizeBytes: Number(releaseConfig?.apkSizeBytes ?? 0),
      apkSha256: releaseConfig?.apkSha256 ?? '',
      signingCertSha256: releaseConfig?.signingCertSha256 ?? '',
      packageName: releaseConfig?.packageName ?? installedAppInfo?.packageName ?? '',
      isMandatory: Boolean(releaseConfig?.isMandatory),
      source: 'firebase',
      isUpdateAvailable: true,
    };
  }, [
    currentVersionCode,
    currentVersionName,
    effectiveGithubRepo,
    installedAppInfo?.packageName,
    releaseConfig,
  ]);

  const notifAvailableUpdate = useMemo<GitHubReleaseInfo | null>(() => {
    const latestNotif = updateNotifications[0];
    if (!latestNotif) return null;
    const remoteVerName = latestNotif.versionName?.trim() ?? '';
    const remoteVerCode = Number(latestNotif.versionCode ?? 0);
    const rawApkUrl = latestNotif.apkDownloadUrl?.trim() ?? '';
    const apkUrl = rawApkUrl.startsWith('https://')
      ? rawApkUrl
      : buildPermanentLatestApkUrl(effectiveGithubRepo);
    if (!apkUrl.startsWith('https://') || !remoteVerName) return null;
    if (!isReleaseVersionNewer(remoteVerName, remoteVerCode, currentVersionName, currentVersionCode)) {
      return null;
    }
    return {
      tagName: `v${remoteVerName}`,
      versionName: remoteVerName,
      versionCode: remoteVerCode || currentVersionCode + 1,
      releaseTitle: latestNotif.title?.trim() || `Quick Quiz v${remoteVerName}`,
      releaseNotes: latestNotif.body?.trim() || '',
      apkDownloadUrl: apkUrl,
      htmlUrl: '',
      apkSizeBytes: 0,
      isMandatory: Boolean(latestNotif.isMandatory),
      source: 'firebase',
      isUpdateAvailable: true,
    };
  }, [currentVersionCode, currentVersionName, effectiveGithubRepo, updateNotifications]);

  const bestCandidateUpdate = useMemo(
    () =>
      chooseNewestAvailableUpdate(
        [firebaseAvailableUpdate, notifAvailableUpdate, githubAvailableUpdate, webSwAvailableUpdate],
        currentVersionName,
        currentVersionCode
      ),
    [
      currentVersionCode,
      currentVersionName,
      firebaseAvailableUpdate,
      githubAvailableUpdate,
      notifAvailableUpdate,
      webSwAvailableUpdate,
    ]
  );

  const availableUpdate = bestCandidateUpdate ?? deepLinkUpdateFallback;

  const releaseConfigKey = useMemo(
    () =>
      `${effectiveGithubRepo}|${releaseConfig?.updatedAt?.seconds ?? 0}|${releaseConfig?.latestVersionCode ?? 0}|${updateNotifications[0]?.id ?? ''}`,
    [
      effectiveGithubRepo,
      releaseConfig?.latestVersionCode,
      releaseConfig?.updatedAt?.seconds,
      updateNotifications,
    ]
  );

  const firebaseAvailableUpdateRef = useRef<GitHubReleaseInfo | null>(firebaseAvailableUpdate);
  const notifAvailableUpdateRef = useRef<GitHubReleaseInfo | null>(notifAvailableUpdate);
  const webSwAvailableUpdateRef = useRef<GitHubReleaseInfo | null>(webSwAvailableUpdate);
  const deepLinkUpdateFallbackRef = useRef<GitHubReleaseInfo | null>(deepLinkUpdateFallback);
  const dismissedOptionalVersionKeyRef = useRef<string>(dismissedOptionalVersionKey);
  const releaseConfigKeyRef = useRef<string>(releaseConfigKey);
  const autoShownVersionKeyRef = useRef<string>('');
  const authInitializedRef = useRef<boolean>(authInitialized);

  useEffect(() => {
    firebaseAvailableUpdateRef.current = firebaseAvailableUpdate;
  }, [firebaseAvailableUpdate]);

  useEffect(() => {
    notifAvailableUpdateRef.current = notifAvailableUpdate;
  }, [notifAvailableUpdate]);

  useEffect(() => {
    webSwAvailableUpdateRef.current = webSwAvailableUpdate;
  }, [webSwAvailableUpdate]);

  useEffect(() => {
    deepLinkUpdateFallbackRef.current = deepLinkUpdateFallback;
  }, [deepLinkUpdateFallback]);

  useEffect(() => {
    dismissedOptionalVersionKeyRef.current = dismissedOptionalVersionKey;
  }, [dismissedOptionalVersionKey]);

  useEffect(() => {
    releaseConfigKeyRef.current = releaseConfigKey;
  }, [releaseConfigKey]);

  useEffect(() => {
    authInitializedRef.current = authInitialized;
  }, [authInitialized]);

  const checkForUpdates = useCallback(
    async (manual = false, force = false, repoOverride?: string) => {
      if (checkInFlightRef.current) return;

      const repoToCheck = sanitizeOwnerRepo(repoOverride ?? '') || effectiveGithubRepo;
      const now = Date.now();
      const currentConfigKey = releaseConfigKeyRef.current;
      const configChanged = lastCheckedConfigKeyRef.current !== currentConfigKey;

      if (!manual && !force && !configChanged && now - lastUpdateCheckAtRef.current < 120_000) {
        return;
      }

      lastCheckedConfigKeyRef.current = currentConfigKey;
      lastUpdateCheckAtRef.current = now;
      checkInFlightRef.current = true;
      setIsCheckingUpdate(true);

      try {
        const timeoutErrPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Update check timed out.')), 11_000);
        });

        const [ghResult, swResult] = await Promise.race([
          Promise.all([
            repoToCheck
              ? fetchLatestRelease(repoToCheck, currentVersionName, currentVersionCode).catch((err) => {
                  if (manual) throw err;
                  return null;
                })
              : Promise.resolve(null),
            checkWebSwForUpdateNow(currentVersionName, currentVersionCode).catch(() => null),
          ]),
          timeoutErrPromise,
        ]);

        const nextGithub =
          ghResult && ghResult.isUpdateAvailable ? { ...ghResult, source: 'github' as const } : null;
        setGithubAvailableUpdate(nextGithub);
        if (swResult) {
          setWebSwAvailableUpdate(swResult);
        }

        const winner = chooseNewestAvailableUpdate(
          [
            firebaseAvailableUpdateRef.current,
            notifAvailableUpdateRef.current,
            nextGithub,
            swResult ?? webSwAvailableUpdateRef.current,
          ],
          currentVersionName,
          currentVersionCode
        );

        if (winner) {
          setDeepLinkUpdateFallback(null);
          const versionKey = `${winner.versionName}_${winner.versionCode ?? 0}`;
          const isDismissedOptional =
            !winner.isMandatory && dismissedOptionalVersionKeyRef.current === versionKey;
          if (
            manual ||
            (authInitializedRef.current &&
              (winner.isMandatory ||
                (!isDismissedOptional &&
                  routeRef.current.name !== 'quiz' &&
                  autoShownVersionKeyRef.current !== versionKey)))
          ) {
            autoShownVersionKeyRef.current = versionKey;
            setIsUpdateModalOpen(true);
          }
        } else {
          // Preserve a valid push-notification update payload if user tapped one and API returned nothing newer
          const activeDeepLink = deepLinkUpdateFallbackRef.current;
          const keepDeepLink = Boolean(
            activeDeepLink &&
              activeDeepLink.apkDownloadUrl?.startsWith('https://') &&
              isReleaseVersionNewer(
                activeDeepLink.versionName,
                activeDeepLink.versionCode,
                currentVersionName,
                currentVersionCode
              )
          );
          if (!keepDeepLink) {
            setDeepLinkUpdateFallback(null);
            setIsUpdateModalOpen(false);
          }
          if (manual && !keepDeepLink) {
            setBanner({
              isError: false,
              message: `${t.appUpdateUpToDateMsg} (v${currentVersionName})`,
            });
          }
        }
      } catch (err) {
        if (manual) {
          setBanner({
            isError: true,
            message: err instanceof Error ? err.message : 'Update check failed.',
          });
        }
      } finally {
        checkInFlightRef.current = false;
        setIsCheckingUpdate(false);
      }
    },
    [
      currentVersionCode,
      currentVersionName,
      effectiveGithubRepo,
      t.appUpdateUpToDateMsg,
    ]
  );

  // Auto-present update modal cleanly once per version after app initialization, or clear stale dialogs
  useEffect(() => {
    if (!availableUpdate) {
      setIsUpdateModalOpen(false);
      return;
    }
    if (!authInitialized) return;
    const key = `${availableUpdate.versionName}_${availableUpdate.versionCode ?? 0}`;
    if (availableUpdate.isMandatory) {
      autoShownVersionKeyRef.current = key;
      setIsUpdateModalOpen(true);
    } else if (
      dismissedOptionalVersionKey !== key &&
      autoShownVersionKeyRef.current !== key &&
      route.name !== 'quiz'
    ) {
      autoShownVersionKeyRef.current = key;
      setIsUpdateModalOpen(true);
    }
  }, [authInitialized, availableUpdate, dismissedOptionalVersionKey, route.name]);

  // Re-check once when Firestore release config or update notifications change after startup
  useEffect(() => {
    if (lastCheckedConfigKeyRef.current && lastCheckedConfigKeyRef.current !== releaseConfigKey) {
      void checkForUpdates(false, false);
    }
  }, [checkForUpdates, releaseConfigKey]);

  // Automatic update check on startup, foreground resume, and 15-minute intervals
  useEffect(() => {
    void checkForUpdates(false, true);

    const onResumeCheck = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates(false, false);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates(false, true);
      }
    }, 15 * 60 * 1000);

    document.addEventListener('visibilitychange', onResumeCheck);
    window.addEventListener('focus', onResumeCheck);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResumeCheck);
      window.removeEventListener('focus', onResumeCheck);
    };
  }, [checkForUpdates]);

  const handleSaveGithubRepo = useCallback(
    async (repo: string) => {
      const cleanRepo = sanitizeOwnerRepo(repo);
      saveGithubOwnerRepoPreference(cleanRepo);
      setIsBusy(true);
      try {
        await saveReleaseConfig(cleanRepo, releaseConfig?.releaseNotes ?? '');
        if (cleanRepo) {
          void checkForUpdates(true, true, cleanRepo);
        }
      } catch (err) {
        setBanner({
          isError: true,
          message: formatAppError(err, 'Save failed'),
        });
        throw err;
      } finally {
        setIsBusy(false);
      }
    },
    [checkForUpdates, formatAppError, releaseConfig?.releaseNotes]
  );

  const persistUserMeta = useCallback((name: string, mobile: string) => {
    const cleanMobile = normalizeIndianMobileInput(mobile);
    const next = { name: name.trim().slice(0, 60), mobile: cleanMobile };
    setSavedUserMeta(next);
    if (cleanMobile) {
      setNativeActiveStudentMobile(cleanMobile);
    }
    try {
      localStorage.setItem(LOCAL_USER_META_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
    if (cleanMobile) {
      setLocalUnlockedSubjects((prev) =>
        Array.from(new Set([...prev, ...loadSavedUnlockedSubjects(cleanMobile)]))
      );
      setLocalFreeMockUsedSubjects((prev) =>
        Array.from(new Set([...prev, ...loadSavedFreeMockUsedSubjects(cleanMobile)]))
      );
      setMyPaymentIds((prev) =>
        Array.from(new Set([...prev, ...loadMyPaymentRequestIds(cleanMobile)])).slice(0, 25)
      );
    }
  }, []);

  const handleStudentLogin = async (name: string, mobile: string) => {
    const cleanName = name.trim().slice(0, 60);
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!/^[0-9]{10}$/.test(cleanMobile)) throw new Error('INVALID_MOBILE');

    const profile = await loginStudentByMobile({
      mobileNumber: cleanMobile,
      fullName: cleanName,
    });

    const effectiveName = (profile.fullName || cleanName).trim().slice(0, 60);
    if (!effectiveName) throw new Error('INVALID_NAME');

    setStudent(profile);
    persistUserMeta(effectiveName, cleanMobile);

    const restoredSubjects = new Set<string>(profile.unlockedSubjects ?? []);
    if (profile.hasQuizAccess) {
      restoredSubjects.add('all');
      ALL_SUBJECT_IDS.forEach((s) => restoredSubjects.add(s));
    }
    if (restoredSubjects.size > 0) {
      const arr = Array.from(restoredSubjects);
      setLocalUnlockedSubjects(arr);
      try {
        localStorage.setItem(`${LOCAL_UNLOCKS_KEY}_${cleanMobile}`, JSON.stringify(arr));
      } catch {
        // Ignore
      }
    }

    const restoredFreeMock = Array.from(
      new Set([
        ...loadSavedFreeMockUsedSubjects(cleanMobile),
        ...(profile.freeMockUsedSubjects ?? []).filter((s) =>
          ALL_SUBJECT_IDS.includes(s as SubjectId)
        ),
      ])
    );
    setLocalFreeMockUsedSubjects(restoredFreeMock);
    if (restoredFreeMock.length > 0) {
      try {
        localStorage.setItem(`${LOCAL_FREE_MOCK_KEY}_${cleanMobile}`, JSON.stringify(restoredFreeMock));
      } catch {
        // Ignore
      }
    }

    if (profile.paymentRequestIds && profile.paymentRequestIds.length > 0) {
      let latestIds = loadMyPaymentRequestIds(cleanMobile);
      profile.paymentRequestIds.forEach((pid) => {
        if (/^pay_[a-f0-9]{32}$/.test(pid)) {
          latestIds = saveMyPaymentRequestId(pid, cleanMobile);
        }
      });
      setMyPaymentIds(latestIds);
    }

    setRoute({ name: 'public', tab: 'quiz' });
    if (profile.isReturningUser) {
      setBanner({
        isError: false,
        message: `${effectiveName} — ${t.returningWelcomeMsg}`,
      });
    }
  };

  const handleStudentLogout = () => {
    clearLocalStudentSession();
  };

  const persistUnlockedSubject = (subjectId: string, mobile = savedUserMeta.mobile) => {
    const cleanMob = mobile.replace(/\D/g, '').slice(-10);
    const scopedKey = cleanMob ? `${LOCAL_UNLOCKS_KEY}_${cleanMob}` : LOCAL_UNLOCKS_KEY;
    setLocalUnlockedSubjects((prev) => {
      const next = new Set(prev);
      if (subjectId === 'all') {
        next.add('all');
        ALL_SUBJECT_IDS.forEach((s) => next.add(s));
      } else {
        next.add(subjectId);
      }
      const arr = Array.from(next);
      try {
        localStorage.setItem(scopedKey, JSON.stringify(arr));
      } catch {
        // Ignore
      }
      return arr;
    });
  };

  const handleConsumeFreeMockTest = useCallback(
    (subjectId: SubjectId) => {
      const cleanMob = savedUserMeta.mobile.replace(/\D/g, '').slice(-10);
      setLocalFreeMockUsedSubjects((prev) => {
        const next = Array.from(new Set([...prev, subjectId]));
        if (cleanMob) {
          try {
            localStorage.setItem(`${LOCAL_FREE_MOCK_KEY}_${cleanMob}`, JSON.stringify(next));
          } catch {
            // Ignore
          }
        }
        return next;
      });
      setStudent((prev) =>
        prev
          ? {
              ...prev,
              freeMockUsedSubjects: Array.from(
                new Set([...(prev.freeMockUsedSubjects ?? []), subjectId])
              ),
            }
          : prev
      );
      if (studentDocId) {
        void markFreeMockTestUsed(studentDocId, subjectId).catch(() => {});
      }
    },
    [savedUserMeta.mobile, studentDocId]
  );

  const startSubjectMockTest = useCallback((subject: QuizSubject) => {
    const mockCh = buildBoardExamMockTestChapter(subject);
    setActiveMockChapter(mockCh);
    setRoute({ name: 'quiz', subjectId: subject.id, chapterId: mockCh.id });
  }, []);

  const handlePublicPushDeepLink = useCallback(
    (payload: AdminDeepLinkPayload) => {
      const target = payload.targetRoute;
      if (target === 'app_update') {
        handleIncomingAppUpdateDeepLink(payload);
        if (availableUpdate?.isUpdateAvailable) {
          setIsUpdateModalOpen(true);
        } else {
          void checkForUpdates(true);
        }
        return;
      }

      if (
        target === 'subject_maths' ||
        target === 'subject_science' ||
        target === 'subject_social_science' ||
        target === 'subject_gujarati' ||
        target === 'subject_hindi'
      ) {
        const subjectId: SubjectId =
          target === 'subject_maths'
            ? 'maths'
            : target === 'subject_science'
              ? 'science'
              : target === 'subject_gujarati'
                ? 'gujarati'
                : target === 'subject_hindi'
                  ? 'hindi'
                  : 'social_science';
        if (isStudentLoggedIn) {
          setRoute({ name: 'subject', subjectId });
        } else {
          setRoute({ name: 'public', tab: 'quiz' });
        }
        if (payload.broadcastTitle || payload.broadcastBody) {
          setBanner({
            isError: false,
            message: [payload.broadcastTitle, payload.broadcastBody].filter(Boolean).join('\n'),
          });
        }
        return;
      }

      if (target === 'mock_test') {
        if (isStudentLoggedIn) {
          const cached = loadedSubjects.maths ?? getCachedSubject('maths');
          if (cached) {
            startSubjectMockTest(cached);
          } else {
            setRoute({ name: 'subject', subjectId: 'maths' });
            void loadSubjectWithChapters('maths')
              .then((sub) => {
                if (sub) {
                  setLoadedSubjects((prev) => ({ ...prev, maths: sub }));
                  startSubjectMockTest(sub);
                }
              })
              .catch(() => {});
          }
        } else {
          setRoute({ name: 'public', tab: 'quiz' });
        }
        if (payload.broadcastTitle || payload.broadcastBody) {
          setBanner({
            isError: false,
            message: [payload.broadcastTitle, payload.broadcastBody].filter(Boolean).join('\n'),
          });
        }
        return;
      }

      // Default 'home' push broadcast click -> open Home + announcement banner
      setRoute({ name: 'public', tab: 'quiz' });
      if (payload.broadcastTitle || payload.broadcastBody) {
        setBanner({
          isError: false,
          message: [payload.broadcastTitle, payload.broadcastBody].filter(Boolean).join('\n'),
        });
      }
    },
    [
      availableUpdate?.isUpdateAvailable,
      checkForUpdates,
      handleIncomingAppUpdateDeepLink,
      isStudentLoggedIn,
      loadedSubjects.maths,
      startSubjectMockTest,
    ]
  );

  useEffect(() => {
    handlePublicPushDeepLinkRef.current = handlePublicPushDeepLink;
  }, [handlePublicPushDeepLink]);

  const handleRequestNotificationsWithFeedback = useCallback(async () => {
    const status = await requestAppNotificationPermission();
    setNotificationPermissionStatus(status);
    if (status === 'granted') {
      setDismissedNotifPrompt(true);
      setBanner({
        isError: false,
        message: 'Real-Time Push Notifications ચાલુ થઈ ગઈ છે! એપ બંધ હશે ત્યારે પણ સૂચના મળશે.',
      });
    } else if (status === 'denied') {
      setBanner({
        isError: true,
        message: hasNativeFirebaseBridge()
          ? 'Notification Permission બંધ છે. કૃપા કરીને Settings માંથી Notifications ચાલુ કરો.'
          : 'બ્રાઉઝરમાં Notification Permission બંધ છે. બ્રાઉઝર Settings માંથી Allow કરો.',
      });
    }
  }, []);

  const handleSendPushBroadcast = useCallback(async (input: SendPushBroadcastInput) => {
    await sendPushBroadcastNotification(input);
    setBanner({
      isError: false,
      message: `Push Notification સફળતાપૂર્વક મોકલાઈ ગઈ છે: "${input.title}"`,
    });
  }, []);

  const handleDeletePushBroadcast = useCallback(
    async (broadcastId: string) => {
      try {
        await deletePushBroadcastNotification(broadcastId);
        setBanner({
          isError: false,
          message: 'Push Notification ઇતિહાસમાંથી દૂર કરી દેવાઈ છે.',
        });
      } catch (err) {
        setBanner({ isError: true, message: formatAppError(err, 'Delete failed') });
      }
    },
    [formatAppError]
  );

  const handleSubmitPayment = async (params: {
    studentName: string;
    mobileNumber: string;
    amountRupees: number;
    upiTransactionRef?: string;
    imageBlob: Blob;
    fallbackBase64: string;
    subjectId: string;
  }): Promise<string | undefined> => {
    setIsBusy(true);
    setBanner(null);
    persistUserMeta(params.studentName, params.mobileNumber);
    try {
      const reqId = await submitPaymentRequest(params);
      setMyPaymentIds(saveMyPaymentRequestId(reqId, params.mobileNumber));
      setBanner({ isError: false, message: t.requestSentTitle });
      return reqId;
    } finally {
      setIsBusy(false);
    }
  };

  const handleRedeemCode = async (params: {
    code: string;
    name: string;
    mobile: string;
    expectedSubjectId?: string;
  }): Promise<{ code: string; subjectId: string } | undefined> => {
    setIsBusy(true);
    setBanner(null);
    persistUserMeta(params.name, params.mobile);
    try {
      const res = await redeemAccessCodePublic({
        rawCode: params.code,
        userName: params.name,
        mobileNumber: params.mobile,
        expectedSubjectId: params.expectedSubjectId,
      });
      persistUnlockedSubject(res.subjectId, params.mobile);
      setBanner({
        isError: false,
        message: `${t.codeSuccessTitle} (${res.code})`,
      });
      return res;
    } finally {
      setIsBusy(false);
    }
  };

  const handleApprovePayment = async (
    req: PaymentRequest,
    adminNote: string,
    subjectId: string
  ) => {
    setIsBusy(true);
    setBanner(null);
    const resolvedSub = subjectId || resolvePaymentSubjectId(req);
    try {
      const code = await approvePaymentAndAssignCode({
        paymentRequest: req,
        adminNote,
        approvedSubjectId: resolvedSub,
      });
      const approvedReq: PaymentRequest = {
        ...req,
        status: 'approved',
        assignedCode: code,
        subjectId: resolvedSub,
        adminNote: adminNote.trim() || req.adminNote,
      };
      setApprovedConfirmation(approvedReq);
      setBanner({
        isError: false,
        message:
          lang === 'en'
            ? `Approved! Generated 8-char code: ${code}`
            : `મંજૂર! 8-અક્ષરનો કોડ જનરેટ થયો: ${code}`,
      });
      launchExternalUrl(buildPaymentApprovalWhatsAppHref(approvedReq, lang));
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Approval failed'),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRejectPayment = async (req: PaymentRequest, reason: string) => {
    setIsBusy(true);
    setBanner(null);
    try {
      await rejectPaymentRequest(req, reason);
      setBanner({ isError: false, message: t.statusRejected });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Reject failed'),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateBulkCodes = async (
    count: number,
    batchName: string,
    subjectId: string
  ): Promise<{ batchName: string; codes: string[] } | null> => {
    setIsBusy(true);
    try {
      const normalizedSubject = ALL_SUBJECT_IDS.includes(subjectId as SubjectId)
        ? (subjectId as SubjectId)
        : 'all';
      const cleanBatch = (
        batchName.trim() || `${getSubjectDisplayName(normalizedSubject)} Batch`
      ).slice(0, 60);
      const codes = await generateBulkAccessCodes(count, cleanBatch, normalizedSubject);
      setLastGeneratedBatch(codes);

      const nowSec = Math.floor(Date.now() / 1000);
      const optimisticTs = {
        seconds: nowSec,
        nanoseconds: 0,
        toMillis: () => nowSec * 1000,
        toDate: () => new Date(nowSec * 1000),
      } as unknown as AccessCode['createdAt'];

      const optimisticRecords: AccessCode[] = codes.map((code) => ({
        id: code,
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
        createdAt: optimisticTs,
        updatedAt: optimisticTs,
      }));

      setAllCodes((prev) => {
        const seen = new Set(optimisticRecords.map((c) => c.code));
        return [...optimisticRecords, ...prev.filter((c) => !seen.has(c.code))];
      });

      setBanner({
        isError: false,
        message:
          lang === 'en'
            ? `${codes.length} codes generated in folder "${cleanBatch}"`
            : `"${cleanBatch}" ફોલ્ડરમાં ${codes.length} નવા કોડ બની ગયા છે`,
      });
      return { batchName: cleanBatch, codes };
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Code generation error'),
      });
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const handleFetchBatchCodes = async (batchName: string): Promise<AccessCode[]> => {
    try {
      const batchItems = await fetchAccessCodesByBatchAdmin(batchName);
      if (batchItems.length > 0) {
        setAllCodes((prev) => {
          const batchSet = new Set(batchItems.map((c) => c.code));
          return [...batchItems, ...prev.filter((c) => !batchSet.has(c.code))];
        });
      }
      return batchItems;
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Failed to load batch codes'),
      });
      return [];
    }
  };

  const handleDeleteUnusedCodes = async (batchName?: string): Promise<number> => {
    setIsBusy(true);
    try {
      const res = await deleteUnusedAccessCodesAdmin(batchName);
      if (res.deletedCodes.length > 0) {
        const deletedSet = new Set(res.deletedCodes);
        setAllCodes((prev) => prev.filter((c) => !deletedSet.has(c.code)));
        setLastGeneratedBatch((prev) => prev.filter((code) => !deletedSet.has(code)));
      }
      setBanner({
        isError: false,
        message:
          res.deletedCount > 0
            ? lang === 'en'
              ? `Deleted ${res.deletedCount} unused codes (used codes kept safe)`
              : `${res.deletedCount} ન વપરાયેલા કોડ ડિલીટ થઈ ગયા (વપરાયેલા કોડ સુરક્ષિત છે)`
            : lang === 'en'
              ? 'No unused codes found to delete'
              : 'ડિલીટ કરવા માટે કોઈ ન વપરાયેલા કોડ નથી',
      });
      return res.deletedCount;
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Delete unused codes failed'),
      });
      return 0;
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateDirectCode = async (params: {
    mobileNumber: string;
    userName?: string;
    subjectId: string;
  }): Promise<DirectMobileCodeResult> => {
    setIsBusy(true);
    setBanner(null);
    try {
      const result = await generateDirectCodeForMobile(params);
      setBanner({
        isError: false,
        message:
          lang === 'en'
            ? `Code ${result.code} created for +91 ${result.mobileNumber}`
            : `+91 ${result.mobileNumber} માટે કોડ ${result.code} તૈયાર છે`,
      });
      return result;
    } catch (err) {
      const msg = formatAppError(err, 'Direct code generation failed');
      setBanner({ isError: true, message: msg });
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleStudentAccess = async (st: StudentProfile, grantAccess: boolean) => {
    setIsBusy(true);
    try {
      await toggleStudentQuizAccess(st, grantAccess);
      setBanner({
        isError: false,
        message:
          lang === 'en'
            ? `Updated access for ${st.fullName}`
            : `${st.fullName} માટે એક્સેસ અપડેટ થયું`,
      });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Update failed'),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateStudentSubjectAccess = async (
    st: StudentProfile,
    subjectId: SubjectId,
    grantAccess: boolean
  ) => {
    setIsBusy(true);
    try {
      await updateStudentSubjectAccess(st, subjectId, grantAccess);
      setBanner({
        isError: false,
        message:
          lang === 'en'
            ? `${st.fullName} • ${getSubjectDisplayName(subjectId, lang)} updated`
            : `${st.fullName} • ${getSubjectDisplayName(subjectId, lang)} અપડેટ થયું`,
      });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Update failed'),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublishAppUpdate = async (input: PublishAppUpdateInput) => {
    setIsBusy(true);
    setBanner(null);
    try {
      const result = await publishFirebaseAppUpdate(input);
      setBanner({
        isError: false,
        message: t.adminUpdatePublishedSuccess,
      });
      return result;
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Publish failed'),
      });
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteReleaseHistory = async (releaseId: string) => {
    setIsBusy(true);
    try {
      await deleteAppReleaseRecord(releaseId);
      setBanner({ isError: false, message: t.deleteSuccessMsg });
    } catch (err) {
      setBanner({ isError: true, message: formatAppError(err, 'Delete failed') });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePayment = async (req: PaymentRequest) => {
    setIsBusy(true);
    try {
      await deletePaymentRequestAdmin(req);
      setBanner({ isError: false, message: t.deleteSuccessMsg });
    } catch (err) {
      setBanner({ isError: true, message: formatAppError(err, 'Delete failed') });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteCode = async (item: AccessCode) => {
    setIsBusy(true);
    try {
      await deleteAccessCodeAdmin(item.code);
      setBanner({ isError: false, message: t.deleteSuccessMsg });
    } catch (err) {
      setBanner({ isError: true, message: formatAppError(err, 'Delete failed') });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteStudent = async (st: StudentProfile) => {
    setIsBusy(true);
    try {
      await deleteStudentAdmin(st);
      setBanner({ isError: false, message: t.deleteSuccessMsg });
    } catch (err) {
      setBanner({ isError: true, message: formatAppError(err, 'Delete failed') });
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdminSignOut = useCallback(async () => {
    try {
      await signOutAdminSession().catch(() => {});
      setAuthUser(null);
      setApprovedConfirmation(null);
      setRoute({ name: 'public', tab: 'quiz' });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Sign out error'),
      });
    }
  }, [formatAppError]);

  const handleAdminLoginSuccess = (result: AdminPasscodeAuthResult) => {
    setAuthUser(result.user);
    setSyncVersion((v) => v + 1);
    setRoute({ name: 'public', tab: 'admin' });
    setBanner({
      isError: false,
      message:
        lang === 'en'
          ? 'Admin Panel connected live!'
          : 'એડમિન પેનલ લાઇવ ખુલી ગઈ છે!',
    });
  };

  // Track document visibility + refresh student profile unlocks on resume (throttled inside repository)
  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState !== 'hidden';
      setIsDocumentVisible(visible);
      if (!visible) return;
      if (!hasValidMobile) return;
      void verifyActiveSessionOnResume(studentDocId);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [hasValidMobile, studentDocId]);

  const handleLoadMorePayments = async () => {
    if (isLoadingMorePayments || allPayments.length === 0) return;
    const lastCursor = allPayments[allPayments.length - 1]?.createdAt ?? null;
    if (!lastCursor) {
      setHasMorePayments(false);
      return;
    }
    setIsLoadingMorePayments(true);
    try {
      const res = await loadMoreAdminPayments(lastCursor, ADMIN_PAGE_SIZE);
      if (res.items.length > 0) {
        setAllPayments((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...res.items.filter((x) => !seen.has(x.id))];
        });
      }
      setHasMorePayments(res.hasMore);
    } finally {
      setIsLoadingMorePayments(false);
    }
  };

  const handleLoadMoreCodes = async () => {
    if (isLoadingMoreCodes || allCodes.length === 0) return;
    const lastCursor = allCodes[allCodes.length - 1]?.createdAt ?? null;
    if (!lastCursor) {
      setHasMoreCodes(false);
      return;
    }
    setIsLoadingMoreCodes(true);
    try {
      const res = await loadMoreAdminCodes(lastCursor, ADMIN_CODES_PAGE_SIZE);
      if (res.items.length > 0) {
        setAllCodes((prev) => {
          const seen = new Set(prev.map((x) => x.code));
          return [...prev, ...res.items.filter((x) => !seen.has(x.code))];
        });
      }
      setHasMoreCodes(res.hasMore);
    } finally {
      setIsLoadingMoreCodes(false);
    }
  };

  const handleLoadMoreStudents = async () => {
    if (isLoadingMoreStudents || allStudents.length === 0) return;
    const lastCursor = allStudents[allStudents.length - 1]?.updatedAt ?? null;
    if (!lastCursor) {
      setHasMoreStudents(false);
      return;
    }
    setIsLoadingMoreStudents(true);
    try {
      const res = await loadMoreAdminStudents(lastCursor, ADMIN_PAGE_SIZE);
      if (res.items.length > 0) {
        setAllStudents((prev) => {
          const seen = new Set(prev.map((x) => x.id || x.userId));
          return [...prev, ...res.items.filter((x) => !seen.has(x.id || x.userId))];
        });
      }
      setHasMoreStudents(res.hasMore);
    } finally {
      setIsLoadingMoreStudents(false);
    }
  };

  const handleAdminSyncNow = async () => {
    const res = await flushPendingSyncOperations({ forceDue: true });
    if (hasNativeFirebaseBridge()) {
      forceRefreshNativeAdminListeners();
    } else {
      await syncAdminDeltaSince(syncStatus.lastSyncAtMs ?? 0);
      setSyncVersion((v) => v + 1);
    }
    setBanner({
      isError: false,
      message:
        lang === 'en'
          ? `Sync finished (${res.synced} uploaded, ${res.remaining} pending)`
          : `સિંક પૂર્ણ (${res.synced} અપલોડ, ${res.remaining} બાકી)`,
    });
  };

  if (!authInitialized) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center gap-4 p-6 text-white">
        <img
          src="/images/ic_app_logo.png"
          alt="Quick Quiz"
          className="h-32 w-32 object-contain rounded-2xl"
        />
        <h1 className="text-2xl font-extrabold tracking-wide text-[#FACC15]">Quick Quiz</h1>
        <div className="h-8 w-8 rounded-full border-3 border-[#FACC15] border-t-transparent animate-spin" />
        <p className="text-sm font-semibold text-slate-300">{t.loadingApp}</p>
      </div>
    );
  }

  const routeSpinner = (
    <div className="min-h-[100dvh] bg-[#FAF9F5] dark:bg-[#0B1120] flex flex-col items-center justify-center gap-3 text-[#0F172A] dark:text-[#F8FAFC]">
      <img
        src="/images/ic_app_logo.png"
        alt="Quick Quiz"
        className="h-20 w-20 object-contain rounded-2xl bg-black p-1"
      />
      <div className="h-8 w-8 rounded-full border-3 border-[#1E3A8A] border-t-transparent animate-spin" />
      <p className="text-sm font-semibold">{t.loadingApp}</p>
    </div>
  );

  let bodyNode: React.ReactNode;

  if (route.name === 'public' && route.tab === 'admin' && isAdmin) {
    bodyNode = (
      <Suspense fallback={routeSpinner}>
        <LazyAdminPanelScreen
          payments={allPayments}
          accessCodes={allCodes}
          students={allStudents}
          lastGeneratedBatch={lastGeneratedBatch}
          liveAlerts={liveAlerts}
          isSoundEnabled={isSoundEnabled}
          releaseConfig={releaseConfig}
          installedAppInfo={installedAppInfo}
          updateNotifications={updateNotifications}
          currentVersionName={currentVersionName}
          currentVersionCode={currentVersionCode}
          isBusy={isBusy}
          isCheckingUpdate={isCheckingUpdate}
          syncStatus={syncStatus}
          hasMorePayments={hasMorePayments}
          isLoadingMorePayments={isLoadingMorePayments}
          onLoadMorePayments={() => void handleLoadMorePayments()}
          hasMoreCodes={hasMoreCodes}
          isLoadingMoreCodes={isLoadingMoreCodes}
          onLoadMoreCodes={() => void handleLoadMoreCodes()}
          hasMoreStudents={hasMoreStudents}
          isLoadingMoreStudents={isLoadingMoreStudents}
          onLoadMoreStudents={() => void handleLoadMoreStudents()}
          approvedConfirmation={approvedConfirmation}
          onDismissApprovedConfirmation={() => setApprovedConfirmation(null)}
          onBackToPublic={() => setRoute({ name: 'public', tab: 'quiz' })}
          onForceSync={() => {
            if (hasNativeFirebaseBridge()) {
              forceRefreshNativeAdminListeners();
            } else {
              setSyncVersion((v) => v + 1);
            }
          }}
          onSyncNow={() => void handleAdminSyncNow()}
          onToggleSound={() => setIsSoundEnabled((prev) => !prev)}
          onClearAlerts={() => setLiveAlerts([])}
          onSignOut={() => void handleAdminSignOut()}
          onGenerateBulkCodes={handleGenerateBulkCodes}
          onGenerateDirectCode={handleGenerateDirectCode}
          onApprovePayment={(r, n, s) => void handleApprovePayment(r, n, s)}
          onRejectPayment={(r, reason) => void handleRejectPayment(r, reason)}
          onToggleStudentAccess={(st, grant) => void handleToggleStudentAccess(st, grant)}
          onUpdateStudentSubjectAccess={(st, subId, grant) =>
            void handleUpdateStudentSubjectAccess(st, subId, grant)
          }
          onPublishAppUpdate={handlePublishAppUpdate}
          onDeleteReleaseHistory={handleDeleteReleaseHistory}
          onSaveGithubRepo={handleSaveGithubRepo}
          onTestUpdateCheck={() => void checkForUpdates(true, true)}
          onDeletePayment={handleDeletePayment}
          onDeleteCode={handleDeleteCode}
          onDeleteUnusedCodes={handleDeleteUnusedCodes}
          onFetchBatchCodes={handleFetchBatchCodes}
          onDeleteStudent={handleDeleteStudent}
          onOpenDisplaySettings={() => setShowDisplaySettings(true)}
          onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
          currentAdminUid={authUser?.uid ?? ''}
          currentAdminEmail={authUser?.email ?? ''}
          isSuperAdmin={isSuperAdmin}
          adminDirectory={adminDirectory}
          adminInvites={adminInvites}
          adminNotifications={adminNotifications}
          adminChats={adminChats}
          notificationPrefs={currentNotificationPrefs}
          notificationPermissionStatus={notificationPermissionStatus}
          activeChatId={activeAdminChatId}
          activeChatMessages={activeAdminChatMessages}
          controlledTab={adminSelectedTab}
          onSelectTab={setAdminSelectedTab}
          onSelectChat={setActiveAdminChatId}
          onRequestNotificationPermission={async () => {
            const st = await requestAppNotificationPermission();
            setNotificationPermissionStatus(st);
          }}
          onUpdateNotificationPrefs={async (next) => {
            try {
              await updateAdminNotificationPrefs(next);
            } catch (err) {
              setBanner({ isError: true, message: formatAppError(err, 'Save failed') });
            }
          }}
          onMarkNotificationRead={async (nid) => {
            await markAdminNotificationAsRead(nid).catch(() => {});
          }}
          onMarkAllNotificationsRead={async () => {
            await markAllAdminNotificationsAsRead().catch(() => {});
          }}
          onDeleteNotification={async (nid) => {
            await deleteAdminNotificationItem(nid).catch(() => {});
          }}
          onSendChatMessage={async (payload) => {
            try {
              const sent = await sendAdminChatMessage(payload);
              if (sent.chatId && activeAdminChatId !== sent.chatId) {
                setActiveAdminChatId(sent.chatId);
              }
            } catch (err) {
              setBanner({ isError: true, message: formatAppError(err, 'Failed to send') });
              throw err;
            }
          }}
          onMarkChatRead={async (cid) => {
            await markAdminChatMessagesRead(cid).catch(() => {});
          }}
          onInviteAdmin={async (email, displayName) => {
            await inviteAdminByEmail(email, displayName);
          }}
          onRemoveAdminInvite={async (email) => {
            await removeAdminInviteByEmail(email).catch((err) => {
              setBanner({ isError: true, message: formatAppError(err, 'Remove failed') });
            });
          }}
          pushBroadcasts={pushBroadcasts}
          onOpenNotificationSettings={openAppNotificationSettings}
          onSendPushBroadcast={handleSendPushBroadcast}
          onDeletePushBroadcast={handleDeletePushBroadcast}
          focusedTarget={focusedAdminTarget}
          onClearFocusedTarget={() => setFocusedAdminTarget(null)}
          onFocusNotificationTarget={setFocusedAdminTarget}
        />
      </Suspense>
    );
  } else if (route.name === 'subject' && isStudentLoggedIn) {
    const subject = loadedSubjects[route.subjectId] ?? getCachedSubject(route.subjectId);
    if (!subject) {
      bodyNode = routeSpinner;
    } else {
      const hasAccess =
        effectiveUnlockedSubjects.includes('all') ||
        effectiveUnlockedSubjects.includes(subject.id);
      const hasUsedFreeMock = effectiveFreeMockUsedSubjects.includes(subject.id);
      bodyNode = (
        <Suspense fallback={routeSpinner}>
          <LazySubjectChaptersScreen
            subject={subject}
            hasQuizAccess={hasAccess}
            hasUsedFreeMock={hasUsedFreeMock}
            studentName={effectiveStudentName}
            studentMobile={savedUserMeta.mobile}
            myPayments={myPayments}
            isBusy={isBusy}
            initialModalMode={pendingSubjectUnlockModal}
            onConsumeInitialModalMode={() => setPendingSubjectUnlockModal(null)}
            onBack={() => setRoute({ name: 'public', tab: 'quiz' })}
            onStartMockTest={() => startSubjectMockTest(subject)}
            onStartChapterQuiz={(ch) =>
              setRoute({ name: 'quiz', subjectId: subject.id, chapterId: ch.id })
            }
            onSubmitPayment={handleSubmitPayment}
            onRedeemCode={handleRedeemCode}
            onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
          />
        </Suspense>
      );
    }
  } else if (route.name === 'quiz' && isStudentLoggedIn) {
    const subject = loadedSubjects[route.subjectId] ?? getCachedSubject(route.subjectId);
    const isMockRoute = route.chapterId === `mock_test_${route.subjectId}`;
    const chapter = isMockRoute
      ? activeMockChapter?.subjectId === route.subjectId
        ? activeMockChapter
        : undefined
      : subject?.chapters.find((c) => c.id === route.chapterId) ??
        getCachedChapter(route.subjectId, route.chapterId);
    if (!subject || !chapter) {
      bodyNode = routeSpinner;
    } else {
      const hasFolderAccess =
        effectiveUnlockedSubjects.includes('all') ||
        effectiveUnlockedSubjects.includes(subject.id);
      bodyNode = (
        <Suspense fallback={routeSpinner}>
          <LazyQuizPlayScreen
            subject={subject}
            chapter={chapter}
            hasFolderAccess={hasFolderAccess}
            onConsumeFreeMockTest={() => handleConsumeFreeMockTest(subject.id)}
            onRebuildMockTest={() => setActiveMockChapter(buildBoardExamMockTestChapter(subject))}
            onRequestUnlockForMockTest={() => {
              setActiveMockChapter(null);
              setPendingSubjectUnlockModal('pay');
              setRoute({ name: 'subject', subjectId: subject.id });
            }}
            onQuizCompleted={(score, total, elapsedSeconds) => {
              void recordQuizAttempt({
                studentId: studentDocId,
                subjectId: subject.id,
                subjectTitle: subject.title,
                chapterTitle: chapter.title,
                score,
                totalQuestions: total,
                timeTakenSeconds: elapsedSeconds,
                previousTotalQuizzes: student?.totalQuizzesTaken ?? myAttempts.length,
                previousBestScore: student?.bestScorePercent ?? 0,
              })
                .then((attempt) => {
                  if (attempt) {
                    setMyAttempts((prev) => [attempt, ...prev.filter((a) => a.id !== attempt.id)].slice(0, 20));
                    const pct = attempt.percentage;
                    setStudent((prev) =>
                      prev
                        ? {
                            ...prev,
                            totalQuizzesTaken: prev.totalQuizzesTaken + 1,
                            bestScorePercent: Math.max(prev.bestScorePercent, pct),
                          }
                        : prev
                    );
                  }
                })
                .catch(() => {});
            }}
            onExit={() => {
              setActiveMockChapter(null);
              setRoute({ name: 'subject', subjectId: subject.id });
            }}
          />
        </Suspense>
      );
    }
  } else {
    const pendingBadge = allPayments.filter((p) => p.status === 'pending').length;
    const unreadNotifBadge = adminNotifications.filter(
      (n) => !n.isRead && (!authUser?.uid || !n.readBy.includes(authUser.uid))
    ).length;
    const unreadChatBadge = adminChats.reduce(
      (sum, c) => sum + (authUser?.uid ? Number(c.unreadCounts?.[authUser.uid] ?? 0) : 0),
      0
    );

    bodyNode = (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col">
        <TopNavHeader
          activeTab="quiz"
          isStudentLoggedIn={isStudentLoggedIn}
          studentName={effectiveStudentName}
          studentMobile={savedUserMeta.mobile}
          isAdmin={isAdmin}
          adminBadgeCount={unreadNotifBadge + unreadChatBadge + pendingBadge || liveAlerts.length}
          isDarkTheme={isDarkTheme}
          onSelectTab={(tab) => setRoute({ name: 'public', tab })}
          onStudentLogout={handleStudentLogout}
          onToggleTheme={() => setIsDarkTheme((prev) => !prev)}
          onOpenDisplaySettings={() => setShowDisplaySettings(true)}
          notificationPermissionStatus={notificationPermissionStatus}
          pushBroadcastCount={pushBroadcasts.length}
          onOpenNotifications={() => {
            if (notificationPermissionStatus !== 'granted') {
              void handleRequestNotificationsWithFeedback();
            } else if (pushBroadcasts[0]) {
              setBanner({
                isError: false,
                message: [pushBroadcasts[0].title, pushBroadcasts[0].body].filter(Boolean).join('\n'),
              });
            }
          }}
        />

        <main className="flex-1 pb-14">
          {isStudentLoggedIn &&
            notificationPermissionStatus !== 'granted' &&
            !dismissedNotifPrompt && (
              <div
                data-testid="student_push_permission_strip"
                className="max-w-4xl mx-auto px-3 sm:px-4 pt-3"
              >
                <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <BellOff className="h-4 w-4" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100 leading-snug">
                      પરીક્ષા સૂચના, Admin સંદેશા અને App Update મેળવવા Notifications ચાલુ કરો.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid="student_strip_enable_notif_btn"
                      onClick={() => void handleRequestNotificationsWithFeedback()}
                      className="min-h-[40px] px-3 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      <span>ચાલુ કરો</span>
                    </button>
                    {hasNativeFirebaseBridge() && notificationPermissionStatus === 'denied' && (
                      <button
                        type="button"
                        data-testid="student_strip_open_settings_btn"
                        onClick={openAppNotificationSettings}
                        className="min-h-[40px] px-2.5 rounded-xl border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>Settings</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t.closeBtn}
                      onClick={() => setDismissedNotifPrompt(true)}
                      className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-amber-200/60 dark:hover:bg-amber-900/50 flex items-center justify-center cursor-pointer"
                    >
                      <X className="h-4 w-4 text-amber-900 dark:text-amber-200" />
                    </button>
                  </div>
                </div>
              </div>
            )}

          {!isStudentLoggedIn ? (
            <StudentMobileLoginScreen
              initialName={savedUserMeta.name}
              initialMobile={savedUserMeta.mobile}
              onLoginSuccess={handleStudentLogin}
              onAdminAuthenticated={handleAdminLoginSuccess}
            />
          ) : (
            <UseCodeScreen
              studentName={effectiveStudentName}
              studentMobile={savedUserMeta.mobile}
              syncStatus={syncStatus}
              unlockedSubjects={effectiveUnlockedSubjects}
              myPayments={myPayments}
              recentAttempts={myAttempts}
              prefilledCode={prefilledCode}
              isBusy={isBusy}
              onSubmitPayment={handleSubmitPayment}
              onRedeemCode={handleRedeemCode}
              onOpenSubject={(subjectId) => setRoute({ name: 'subject', subjectId })}
              onOpenDisplaySettings={() => setShowDisplaySettings(true)}
              onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
              currentVersionName={currentVersionName}
              currentVersionCode={currentVersionCode}
              isCheckingUpdate={isCheckingUpdate}
              hasAvailableUpdate={Boolean(availableUpdate?.isUpdateAvailable)}
              latestVersionName={availableUpdate?.versionName ?? ''}
              onCheckUpdateClick={() => void checkForUpdates(true)}
              onOpenUpdateModal={() => {
                if (availableUpdate) {
                  setIsUpdateModalOpen(true);
                } else {
                  void checkForUpdates(true);
                }
              }}
            />
          )}
        </main>
      </div>
    );
  }

  const isShowingFullScreenUpdate = Boolean(isUpdateModalOpen && availableUpdate);
  const dismissUpdateModalSafely = () => {
    if (availableUpdate) {
      setDismissedOptionalVersionKey(
        `${availableUpdate.versionName}_${availableUpdate.versionCode ?? 0}`
      );
    }
    setIsUpdateModalOpen(false);
  };

  return (
    <>
      <div aria-hidden={isShowingFullScreenUpdate ? true : undefined}>
        {bodyNode}
      </div>

      {isShowingFullScreenUpdate && availableUpdate && (
        <UpdateModalErrorBoundary onErrorFallback={dismissUpdateModalSafely}>
          <UpdateAvailableModal
            release={availableUpdate}
            currentVersionName={currentVersionName}
            currentVersionCode={currentVersionCode}
            updateHistory={updateNotifications}
            onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
            onDismiss={() => {
              if (!availableUpdate.isMandatory) {
                dismissUpdateModalSafely();
              }
            }}
          />
        </UpdateModalErrorBoundary>
      )}

      {banner && isAdmin && (
        <div
          className="fixed top-0 inset-x-0 z-[95] flex justify-center px-3 sm:px-6 pt-[max(env(safe-area-inset-top),0.75rem)] pointer-events-none"
          data-testid="admin_top_popup"
        >
          <div
            role="alert"
            aria-live="assertive"
            className={`admin-top-popup pointer-events-auto ${
              isTvOrSmartBoard ? 'max-w-3xl p-5' : isLargeScreen ? 'max-w-xl p-4' : 'max-w-lg p-3.5 sm:p-4'
            } w-full h-auto rounded-2xl shadow-2xl border-2 flex items-start gap-3 ${
              banner.isError
                ? 'bg-[#FEF2F2] dark:bg-[#450A0A] text-[#7F1D1D] dark:text-[#FEE2E2] border-[#DC2626]'
                : 'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border-[#1E3A8A] dark:border-[#3B82F6]'
            }`}
          >
            <div
              className={`${
                isTvOrSmartBoard ? 'h-11 w-11' : 'h-9 w-9 sm:h-10 sm:w-10'
              } rounded-xl flex items-center justify-center shrink-0 ${
                banner.isError
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-[#1E3A8A] dark:bg-[#2563EB] text-white'
              }`}
            >
              {banner.isError ? (
                <AlertTriangle className={isTvOrSmartBoard ? 'h-5 w-5' : 'h-4 w-4'} />
              ) : (
                <BellRing className={`${isTvOrSmartBoard ? 'h-5 w-5' : 'h-4 w-4'} animate-bounce`} />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 ${
                    isTvOrSmartBoard ? 'text-xs' : 'text-[10px] sm:text-xs'
                  } font-extrabold uppercase tracking-wide ${
                    banner.isError
                      ? 'bg-[#FEE2E2] dark:bg-[#7F1D1D] text-[#991B1B] dark:text-[#FECACA]'
                      : 'bg-[#DBEAFE] dark:bg-[#1E3A8A] text-[#1E3A8A] dark:text-[#DBEAFE]'
                  }`}
                >
                  {banner.isError
                    ? lang === 'en'
                      ? 'Admin Alert'
                      : 'એડમિન એલર્ટ'
                    : lang === 'en'
                      ? 'Admin Notification'
                      : 'એડમિન મેસેજ'}
                </span>
              </div>
              <p
                className={`${
                  isTvOrSmartBoard
                    ? 'text-base sm:text-lg'
                    : isLargeScreen
                      ? 'text-sm sm:text-base'
                      : 'text-xs sm:text-sm'
                } font-bold leading-relaxed whitespace-pre-line break-words`}
              >
                {banner.message}
              </p>
              {(route.name !== 'public' || route.tab !== 'admin' || bannerTargetAction) && (
                <button
                  type="button"
                  onClick={() => {
                    setRoute({ name: 'public', tab: 'admin' });
                    if (bannerTargetAction) {
                      setAdminSelectedTab(bannerTargetAction.tab);
                      if (bannerTargetAction.chatId) {
                        setActiveAdminChatId(bannerTargetAction.chatId);
                      }
                      setBannerTargetAction(null);
                    }
                    setBanner(null);
                  }}
                  className={`mt-1 inline-flex items-center rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white ${
                    isTvOrSmartBoard ? 'min-h-[48px] px-4 text-sm' : 'min-h-[40px] px-3 text-xs'
                  } font-extrabold cursor-pointer`}
                >
                  {bannerTargetAction?.tab === 'chat'
                    ? lang === 'en'
                      ? 'Reply in Chat'
                      : 'ચેટમાં જવાબ આપો'
                    : lang === 'en'
                      ? 'Open Admin Panel'
                      : 'એડમિન પેનલ ખોલો'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setBannerTargetAction(null);
                setBanner(null);
              }}
              aria-label={t.closeBtn}
              className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {banner && !isAdmin && (
        <div
          className="fixed bottom-0 inset-x-0 z-[95] flex justify-center px-3 sm:px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pointer-events-none"
          data-testid="app_status_toast"
        >
          <div
            role="status"
            className={`pointer-events-auto ${
              isTvOrSmartBoard ? 'max-w-3xl px-5 py-4 text-base sm:text-lg' : isLargeScreen ? 'max-w-2xl px-4 py-3.5 text-sm sm:text-base' : 'max-w-xl px-4 py-3.5 text-sm sm:text-base'
            } w-full h-auto rounded-2xl shadow-2xl flex items-start justify-between gap-3 font-semibold border-2 ${
              banner.isError
                ? 'bg-[#FEE2E2] text-[#7F1D1D] border-[#DC2626] dark:bg-[#7F1D1D] dark:text-[#FEE2E2]'
                : 'bg-[#0F172A] text-white border-slate-700 dark:bg-[#1E3A8A] dark:border-[#3B82F6]'
            }`}
          >
            <span className="min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed">
              {banner.message}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              aria-label={t.closeBtn}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/15 cursor-pointer shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {availableUpdate &&
        !isShowingFullScreenUpdate &&
        route.name === 'quiz' &&
        !availableUpdate.isMandatory &&
        dismissedOptionalVersionKey !==
          `${availableUpdate.versionName}_${availableUpdate.versionCode ?? 0}` && (
          <UpdateAvailableBanner
            release={availableUpdate}
            onUpdateNow={() => setIsUpdateModalOpen(true)}
            onUpdateLater={() => {
              setDismissedOptionalVersionKey(
                `${availableUpdate.versionName}_${availableUpdate.versionCode ?? 0}`
              );
            }}
          />
        )}

      <DisplaySettingsModal
        isOpen={showDisplaySettings}
        onClose={() => setShowDisplaySettings(false)}
      />
    </>
  );
};

export const App: React.FC = () => (
  <AdaptiveDisplayProvider>
    <AppContent />
  </AdaptiveDisplayProvider>
);

export default App;
