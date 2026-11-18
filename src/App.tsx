import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, X } from 'lucide-react';
import {
  getCachedChapter,
  getCachedSubject,
  loadSubjectWithChapters,
} from './data/curriculum/std10Curriculum';
import { TopNavHeader, type PublicTabId } from './components/TopNavHeader';
import { UpdateAvailableModal } from './components/AppUpdateComponents';
import { DisplaySettingsModal } from './components/DisplaySettingsModal';
import { AdaptiveDisplayProvider } from './context/AdaptiveDisplayContext';
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
  ADMIN_PAGE_SIZE,
  approvePaymentAndAssignCode,
  deleteAccessCodeAdmin,
  deleteAdminNotificationItem,
  deleteAppReleaseRecord,
  deletePaymentRequestAdmin,
  deleteStudentAdmin,
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
  observeReleaseConfig,
  observeStudentProfile,
  observeUpdateNotifications,
  pauseNativeAdminListeners,
  publishFirebaseAppUpdate,
  recordQuizAttempt,
  redeemAccessCodePublic,
  rejectPaymentRequest,
  removeAdminInviteByEmail,
  requestAppNotificationPermission,
  resumeNativeAdminListeners,
  saveMyPaymentRequestId,
  sendAdminChatMessage,
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
  APP_VERSION_NAME,
  fetchLatestRelease,
  isNewerVersion,
  sanitizeOwnerRepo,
} from './services/githubUpdateChecker';
import {
  ALL_SUBJECT_IDS,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type AccessCode,
  type ActionBanner,
  type AdminChatMessage,
  type AdminChatThread,
  type AdminDeepLinkPayload,
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
  type QuizAttempt,
  type QuizSubject,
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
  const [isBusy, setIsBusy] = useState(false);
  const [banner, setBanner] = useState<ActionBanner | null>(null);
  const [lastGeneratedBatch, setLastGeneratedBatch] = useState<string[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<AdminLiveAlert[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [approvedConfirmation, setApprovedConfirmation] = useState<PaymentRequest | null>(null);

  const [availableUpdate, setAvailableUpdate] = useState<GitHubReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [dismissedOptionalVersionKey, setDismissedOptionalVersionKey] = useState<string>('');
  const [updateNotifications, setUpdateNotifications] = useState<UpdateNotificationRecord[]>([]);
  const [installedAppInfo] = useState<InstalledAppInfo | null>(() => getNativeInstalledAppInfo());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Admin Notifications Center, Push Permission & 1-to-1 Messaging
  const [adminSelectedTab, setAdminSelectedTab] = useState<AdminTabId>('requests');
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
  const [bannerTargetAction, setBannerTargetAction] = useState<{
    tab: AdminTabId;
    chatId?: string;
  } | null>(null);

  const lastCheckedConfigKeyRef = useRef<string>('');
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const knownUsedCodesRef = useRef<Set<string> | null>(null);
  const knownNotifIdsRef = useRef<Set<string> | null>(null);
  const knownChatSigRef = useRef<Map<string, string> | null>(null);
  const hasAutoRequestedPushRef = useRef(false);
  const pendingDeepLinkRef = useRef<AdminDeepLinkPayload | null>(null);
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

  const applyAdminDeepLink = useCallback(
    (payload: AdminDeepLinkPayload) => {
      setRoute({ name: 'public', tab: 'admin' });
      switch (payload.targetRoute) {
        case 'admin_chat': {
          setAdminSelectedTab('chat');
          const resolvedChatId =
            payload.chatId?.trim() ||
            (payload.senderUid && authUser?.uid
              ? getAdminChatId(authUser.uid, payload.senderUid)
              : '');
          if (resolvedChatId) {
            setActiveAdminChatId(resolvedChatId);
            void markAdminChatMessagesRead(resolvedChatId);
          }
          break;
        }
        case 'admin_requests':
          setAdminSelectedTab('requests');
          break;
        case 'admin_codes':
          setAdminSelectedTab('used_codes');
          break;
        case 'admin_students':
          setAdminSelectedTab('students');
          break;
        case 'admin_updates':
          setAdminSelectedTab('updates');
          break;
        default:
          setAdminSelectedTab('notifications');
          break;
      }
      if (payload.notifId) {
        void markAdminNotificationAsRead(payload.notifId).catch(() => {});
      }
    },
    [authUser?.uid]
  );

  // Observe public App Release Config & Update Notification History for ALL users
  useEffect(() => {
    const unsubConfig = observeReleaseConfig(setReleaseConfig);
    const unsubNotifs = observeUpdateNotifications(setUpdateNotifications);
    return () => {
      unsubConfig();
      unsubNotifs();
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

  // Sync Admin Profile + FCM Token, Notification Center, Multi-Admin Directory & 1-to-1 Chat Listeners
  useEffect(() => {
    if (!hasNativeFirebaseBridge()) return undefined;
    const unsubPerm = subscribeNativeNotificationPermission((status) => {
      setNotificationPermissionStatus(status);
    });
    const unsubDeepLink = subscribeNativeAdminDeepLink((payload) => {
      if (payload.targetRoute === 'app_update') {
        setIsUpdateModalOpen(true);
        return;
      }
      if (isFirebaseAdmin) {
        applyAdminDeepLink(payload);
      } else {
        pendingDeepLinkRef.current = payload;
      }
    });
    const initialDeepLink = consumeNativePendingDeepLink();
    if (initialDeepLink) {
      if (initialDeepLink.targetRoute === 'app_update') {
        setIsUpdateModalOpen(true);
      } else {
        pendingDeepLinkRef.current = initialDeepLink;
      }
    }
    return () => {
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
        setHasMoreCodes(codes.length >= ADMIN_PAGE_SIZE);
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

  const currentVersionName = installedAppInfo?.versionName || APP_VERSION_NAME;
  const currentVersionCode = installedAppInfo?.versionCode || 1;

  const effectiveGithubRepo = useMemo(
    () => sanitizeOwnerRepo(releaseConfig?.githubOwnerRepo ?? ''),
    [releaseConfig]
  );

  const firebaseAvailableUpdate = useMemo<GitHubReleaseInfo | null>(() => {
    const apkUrl = releaseConfig?.apkDownloadUrl?.trim() ?? '';
    const remoteVerName = releaseConfig?.latestVersionName?.trim() ?? '';
    const remoteVerCode = Number(releaseConfig?.latestVersionCode ?? 0);
    if (!apkUrl.startsWith('https://') || !remoteVerName) return null;

    const isUpdateNewer =
      remoteVerCode > currentVersionCode ||
      (remoteVerCode === currentVersionCode && isNewerVersion(remoteVerName, currentVersionName));
    if (!isUpdateNewer) return null;

    return {
      tagName: `v${remoteVerName}`,
      versionName: remoteVerName,
      versionCode: remoteVerCode || currentVersionCode + 1,
      releaseTitle: releaseConfig?.updateTitle?.trim() || `ધોરણ 10 ક્વિઝ v${remoteVerName}`,
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
  }, [currentVersionCode, currentVersionName, installedAppInfo?.packageName, releaseConfig]);

  useEffect(() => {
    if (!firebaseAvailableUpdate) return;
    setAvailableUpdate(firebaseAvailableUpdate);
    const key = `${firebaseAvailableUpdate.versionName}_${firebaseAvailableUpdate.versionCode ?? 0}`;
    if (firebaseAvailableUpdate.isMandatory) {
      setIsUpdateModalOpen(true);
    } else if (dismissedOptionalVersionKey !== key) {
      setIsUpdateModalOpen(true);
    }
  }, [dismissedOptionalVersionKey, firebaseAvailableUpdate]);

  const releaseConfigKey = useMemo(
    () => `${effectiveGithubRepo}|${releaseConfig?.updatedAt?.seconds ?? 0}`,
    [effectiveGithubRepo, releaseConfig?.updatedAt?.seconds]
  );

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (firebaseAvailableUpdate) {
        setAvailableUpdate(firebaseAvailableUpdate);
        if (manual) {
          setIsUpdateModalOpen(true);
        }
        return;
      }

      if (!effectiveGithubRepo) {
        if (manual) {
          setBanner({
            isError: false,
            message: `${t.appUpdateUpToDateMsg} (v${currentVersionName})`,
          });
        }
        return;
      }

      if (!manual && lastCheckedConfigKeyRef.current === releaseConfigKey) return;
      lastCheckedConfigKeyRef.current = releaseConfigKey;

      setIsCheckingUpdate(true);
      try {
        const release = await fetchLatestRelease(effectiveGithubRepo, currentVersionName);
        if (release.isUpdateAvailable) {
          setAvailableUpdate({ ...release, source: 'github' });
          setIsUpdateModalOpen(true);
        } else if (manual) {
          setBanner({
            isError: false,
            message: `${t.appUpdateUpToDateMsg} (v${currentVersionName})`,
          });
        }
      } catch (err) {
        if (manual) {
          setBanner({
            isError: true,
            message: err instanceof Error ? err.message : 'Update check failed.',
          });
        }
      } finally {
        setIsCheckingUpdate(false);
      }
    },
    [
      currentVersionName,
      effectiveGithubRepo,
      firebaseAvailableUpdate,
      releaseConfigKey,
      t.appUpdateUpToDateMsg,
    ]
  );

  useEffect(() => {
    if (!firebaseAvailableUpdate && effectiveGithubRepo) {
      void checkForUpdates(false);
    }
  }, [checkForUpdates, effectiveGithubRepo, firebaseAvailableUpdate]);

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

  const handleGenerateBulkCodes = async (count: number, batchName: string, subjectId: string) => {
    setIsBusy(true);
    try {
      const codes = await generateBulkAccessCodes(count, batchName, subjectId);
      setLastGeneratedBatch(codes);
      setBanner({
        isError: false,
        message: `${codes.length} ${getSubjectDisplayName(subjectId, lang)} codes generated`,
      });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Code generation error'),
      });
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
      const res = await loadMoreAdminCodes(lastCursor, ADMIN_PAGE_SIZE);
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
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] flex flex-col items-center justify-center gap-3 text-[#0F172A] dark:text-[#F8FAFC]">
        <div className="h-9 w-9 rounded-full border-3 border-[#1E3A8A] border-t-transparent animate-spin" />
        <p className="text-sm font-semibold">{t.loadingApp}</p>
      </div>
    );
  }

  const routeSpinner = (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] flex flex-col items-center justify-center gap-3 text-[#0F172A] dark:text-[#F8FAFC]">
      <div className="h-9 w-9 rounded-full border-3 border-[#1E3A8A] border-t-transparent animate-spin" />
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
          onGenerateBulkCodes={(c, b, s) => void handleGenerateBulkCodes(c, b, s)}
          onGenerateDirectCode={handleGenerateDirectCode}
          onApprovePayment={(r, n, s) => void handleApprovePayment(r, n, s)}
          onRejectPayment={(r, reason) => void handleRejectPayment(r, reason)}
          onToggleStudentAccess={(st, grant) => void handleToggleStudentAccess(st, grant)}
          onUpdateStudentSubjectAccess={(st, subId, grant) =>
            void handleUpdateStudentSubjectAccess(st, subId, grant)
          }
          onPublishAppUpdate={handlePublishAppUpdate}
          onDeleteReleaseHistory={handleDeleteReleaseHistory}
          onTestUpdateCheck={() => void checkForUpdates(true)}
          onDeletePayment={handleDeletePayment}
          onDeleteCode={handleDeleteCode}
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
      bodyNode = (
        <Suspense fallback={routeSpinner}>
          <LazySubjectChaptersScreen
            subject={subject}
            hasQuizAccess={hasAccess}
            studentName={effectiveStudentName}
            studentMobile={savedUserMeta.mobile}
            myPayments={myPayments}
            isBusy={isBusy}
            onBack={() => setRoute({ name: 'public', tab: 'quiz' })}
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
    const chapter =
      subject?.chapters.find((c) => c.id === route.chapterId) ??
      getCachedChapter(route.subjectId, route.chapterId);
    if (!subject || !chapter) {
      bodyNode = routeSpinner;
    } else {
      bodyNode = (
        <Suspense fallback={routeSpinner}>
          <LazyQuizPlayScreen
            subject={subject}
            chapter={chapter}
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
            onExit={() => setRoute({ name: 'subject', subjectId: subject.id })}
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
        />

        <main className="flex-1 pb-14">
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

  return (
    <>
      {bodyNode}

      {banner && isAdmin && (
        <div
          className="fixed top-3 inset-x-0 z-[70] flex justify-center px-3 pt-[env(safe-area-inset-top)] pointer-events-none"
          data-testid="admin_top_popup"
        >
          <div
            role="alert"
            aria-live="assertive"
            className={`admin-top-popup pointer-events-auto max-w-md w-full rounded-2xl p-3.5 shadow-2xl backdrop-blur-md border-2 flex items-start gap-3 ${
              banner.isError
                ? 'bg-[#FEF2F2]/95 dark:bg-[#450A0A]/95 text-[#7F1D1D] dark:text-[#FEE2E2] border-[#DC2626]'
                : 'bg-white/95 dark:bg-[#0F172A]/95 text-[#0F172A] dark:text-[#F8FAFC] border-[#1E3A8A] dark:border-[#3B82F6]'
            }`}
          >
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                banner.isError
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-[#1E3A8A] dark:bg-[#2563EB] text-white'
              }`}
            >
              {banner.isError ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <BellRing className="h-4 w-4 animate-bounce" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
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
              <p className="text-xs sm:text-sm font-bold leading-snug break-words">
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
                  className="mt-1 inline-flex items-center rounded-lg bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white px-2.5 py-1 text-[11px] font-extrabold cursor-pointer"
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
              className="h-9 w-9 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {banner && !isAdmin && (
        <div className="fixed bottom-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div
            role="status"
            className={`pointer-events-auto max-w-lg w-full rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold border ${
              banner.isError
                ? 'bg-[#FEE2E2] text-[#7F1D1D] border-[#DC2626]/40 dark:bg-[#7F1D1D] dark:text-[#FEE2E2]'
                : 'bg-[#0F172A] text-white border-slate-700 dark:bg-[#1E3A8A]'
            }`}
          >
            <span>{banner.message}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              aria-label={t.closeBtn}
              className="p-1 rounded-lg hover:bg-black/15 cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isUpdateModalOpen && availableUpdate && (
        <UpdateAvailableModal
          release={availableUpdate}
          currentVersionName={currentVersionName}
          currentVersionCode={currentVersionCode}
          updateHistory={updateNotifications}
          onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
          onDismiss={() => {
            if (!availableUpdate.isMandatory) {
              setDismissedOptionalVersionKey(
                `${availableUpdate.versionName}_${availableUpdate.versionCode ?? 0}`
              );
              setIsUpdateModalOpen(false);
            }
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
