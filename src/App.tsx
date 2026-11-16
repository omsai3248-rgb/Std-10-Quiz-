import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  getCachedChapter,
  getCachedSubject,
  loadSubjectWithChapters,
} from './data/curriculum/std10Curriculum';
import { TopNavHeader, type PublicTabId } from './components/TopNavHeader';
import { UpdateAvailableModal } from './components/AppUpdateComponents';
import { useTranslation } from './i18n/translations';
import { StudentMobileLoginScreen } from './screens/StudentMobileLoginScreen';
import { UseCodeScreen } from './screens/UseCodeScreen';
import type { AdminLiveAlert } from './screens/AdminPanelScreen';
import { quizAudioPlayer } from './services/audioPlayer';
import { extractReadableErrorMessage } from './services/firestoreErrorHandler';
import {
  adminUnlockStudentDevice,
  approvePaymentAndAssignCode,
  deleteAccessCodeAdmin,
  deletePaymentRequestAdmin,
  deleteStudentAdmin,
  forceRefreshNativeAdminListeners,
  generateBulkAccessCodes,
  generateDirectCodeForMobile,
  getCurrentDeviceIdentity,
  getNativeActiveStudentSnapshot,
  getStudentDocId,
  hasNativeFirebaseBridge,
  isAdminAccount,
  loadMyPaymentRequestIds,
  loginStudentWithDeviceLock,
  observeAdminSessionDevice,
  observeAllAccessCodes,
  observeAllPaymentRequests,
  observeAllStudents,
  observeAppAuthState,
  observeMyPaymentRequests,
  observeMyQuizAttempts,
  observePaymentRequestsByIds,
  observeReleaseConfig,
  observeStudentProfile,
  recordQuizAttempt,
  redeemAccessCodePublic,
  rejectPaymentRequest,
  releaseStudentDeviceLock,
  saveMyPaymentRequestId,
  saveReleaseConfig,
  setNativeActiveStudentMobile,
  signOutAdminSession,
  submitPaymentRequest,
  toggleStudentQuizAccess,
  updateStudentSubjectAccess,
  verifyActiveSessionOnResume,
  type AdminPasscodeAuthResult,
  type AppAuthUser,
  type DirectMobileCodeResult,
} from './services/quizRepository';
import {
  APP_VERSION_NAME,
  fetchLatestRelease,
  sanitizeOwnerRepo,
} from './services/githubUpdateChecker';
import {
  ALL_SUBJECT_IDS,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type AccessCode,
  type ActionBanner,
  type AppReleaseConfig,
  type GitHubReleaseInfo,
  type PaymentRequest,
  type QuizAttempt,
  type QuizSubject,
  type StudentProfile,
  type SubjectId,
} from './types/models';
import { buildPaymentApprovalWhatsAppHref, launchExternalUrl } from './utils/imageUtils';

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
  }

  let paymentIds = loadMyPaymentRequestIds(meta.mobile);
  if (nativeSnapshot && nativeMobile === meta.mobile && nativeSnapshot.paymentRequestIds?.length) {
    nativeSnapshot.paymentRequestIds.forEach((pid) => {
      if (/^pay_[a-f0-9]{32}$/.test(pid)) {
        paymentIds = saveMyPaymentRequestId(pid, meta.mobile);
      }
    });
  }

  return {
    meta,
    unlocked: Array.from(unlockedSet),
    paymentIds,
    nativeSnapshot:
      nativeSnapshot && nativeMobile === meta.mobile ? nativeSnapshot : null,
  };
}

export const App: React.FC = () => {
  const { lang, t } = useTranslation();

  const [initialSession] = useState(loadInitialStudentSession);
  const [authUser, setAuthUser] = useState<AppAuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

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
  const [myAttempts, setMyAttempts] = useState<QuizAttempt[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRequest[]>([]);
  const [allCodes, setAllCodes] = useState<AccessCode[]>([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [releaseConfig, setReleaseConfig] = useState<AppReleaseConfig | null>(null);

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
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const lastCheckedConfigKeyRef = useRef<string>('');
  const deviceClaimedForStudentRef = useRef<string>('');
  const lastStudentTakeoverAtRef = useRef<number>(0);
  const lastAdminTakeoverAtRef = useRef<number>(0);
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const knownUsedCodesRef = useRef<Set<string> | null>(null);
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const langRef = useRef(lang);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const isStudentLoggedIn = useMemo(
    () => savedUserMeta.name.trim().length > 0 && /^[0-9]{10}$/.test(savedUserMeta.mobile),
    [savedUserMeta]
  );

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
        knownPendingIdsRef.current = null;
        knownUsedCodesRef.current = null;
      } else {
        setAuthUser(user);
      }
      setAuthInitialized(true);
    });
    return () => unsub();
  }, []);

  const isFirebaseAdmin = useMemo(() => {
    if (!authUser) return false;
    return isAdminAccount(authUser.phoneNumber ?? '', authUser.email ?? '');
  }, [authUser]);

  const isAdmin = isFirebaseAdmin;

  const studentDocId = useMemo(() => {
    if (isStudentLoggedIn) {
      return getStudentDocId(savedUserMeta.mobile);
    }
    if (authUser && !isFirebaseAdmin) {
      return authUser.uid;
    }
    return '';
  }, [authUser, isFirebaseAdmin, isStudentLoggedIn, savedUserMeta.mobile]);

  const clearLocalStudentSession = useCallback((noticeMessage?: string, isErrorNotice = true) => {
    deviceClaimedForStudentRef.current = '';
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
    if (noticeMessage) {
      setBanner({ isError: isErrorNotice, message: noticeMessage });
    }
  }, []);

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
      deviceClaimedForStudentRef.current = '';
      return;
    }

    const unsubProfile = observeStudentProfile(
      studentDocId,
      (profile) => setStudent(profile),
      () => {}
    );
    const unsubAttempts = observeMyQuizAttempts(studentDocId, setMyAttempts);

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

  // 3. Admin live collection listeners (attached once per Admin session or explicit sync)
  useEffect(() => {
    if (!isFirebaseAdmin) {
      knownPendingIdsRef.current = null;
      knownUsedCodesRef.current = null;
      setAllPayments([]);
      setAllCodes([]);
      setAllStudents([]);
      setReleaseConfig(null);
      setAvailableUpdate(null);
      return;
    }

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
      observeReleaseConfig(setReleaseConfig),
      observeAllStudents(setAllStudents, onAdminListenerError),

      observeAllPaymentRequests((items) => {
        setAllPayments(items);
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
  }, [isFirebaseAdmin, syncVersion]);

  // 4. Sync restored Firestore student details & enforce strict 1-device session watchdog
  useEffect(() => {
    if (!isStudentLoggedIn || !student || !studentDocId) return;
    if ((student.id || student.userId) !== studentDocId) return;

    // Keep local unlocked subjects & name & payment IDs synced with remote profile
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

    // Single-device lock enforcement
    const myDeviceId = getCurrentDeviceIdentity().deviceId;
    const remoteDeviceId = (student.activeDeviceId ?? '').trim();
    const withinTakeoverGrace = Date.now() - lastStudentTakeoverAtRef.current < 4500;

    if (remoteDeviceId && remoteDeviceId !== myDeviceId) {
      if (withinTakeoverGrace) {
        return;
      }
      clearLocalStudentSession(t.deviceKickedOutMsg, true);
      return;
    }

    if (remoteDeviceId === myDeviceId) {
      deviceClaimedForStudentRef.current = studentDocId;
      return;
    }

    // remoteDeviceId is empty: either Admin force-unlocked this device OR legacy session needs to claim lock once
    if (deviceClaimedForStudentRef.current === studentDocId) {
      clearLocalStudentSession(t.deviceKickedOutMsg, true);
      return;
    }

    deviceClaimedForStudentRef.current = studentDocId;
    lastStudentTakeoverAtRef.current = Date.now();
    void loginStudentWithDeviceLock({
      mobileNumber: savedUserMeta.mobile,
      fullName: student.fullName || savedUserMeta.name,
    }).catch(() => {});
  }, [
    clearLocalStudentSession,
    isStudentLoggedIn,
    savedUserMeta.mobile,
    savedUserMeta.name,
    student,
    studentDocId,
    t.deviceKickedOutMsg,
  ]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const effectiveGithubRepo = useMemo(
    () => sanitizeOwnerRepo(releaseConfig?.githubOwnerRepo ?? ''),
    [releaseConfig]
  );
  const releaseConfigKey = useMemo(
    () => `${effectiveGithubRepo}|${releaseConfig?.updatedAt?.seconds ?? 0}`,
    [effectiveGithubRepo, releaseConfig?.updatedAt?.seconds]
  );

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (!isAdmin || !effectiveGithubRepo) return;
      if (!manual && lastCheckedConfigKeyRef.current === releaseConfigKey) return;
      lastCheckedConfigKeyRef.current = releaseConfigKey;

      setIsCheckingUpdate(true);
      try {
        const release = await fetchLatestRelease(effectiveGithubRepo, APP_VERSION_NAME);
        if (release.isUpdateAvailable) {
          setAvailableUpdate(release);
        } else if (manual) {
          setBanner({
            isError: false,
            message: `App is up to date (v${APP_VERSION_NAME}).`,
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
    [effectiveGithubRepo, isAdmin, releaseConfigKey]
  );

  // Live update notification & automatic check is strictly for Admin only
  useEffect(() => {
    if (isAdmin && effectiveGithubRepo) {
      void checkForUpdates(false);
    }
  }, [isAdmin, effectiveGithubRepo, checkForUpdates]);

  const persistUserMeta = (name: string, mobile: string) => {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
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
    setLocalUnlockedSubjects(loadSavedUnlockedSubjects(cleanMobile));
    setMyPaymentIds(loadMyPaymentRequestIds(cleanMobile));
  };

  const handleStudentLogin = async (name: string, mobile: string) => {
    const cleanName = name.trim().slice(0, 60);
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!/^[0-9]{10}$/.test(cleanMobile)) throw new Error('INVALID_MOBILE');

    const profile = await loginStudentWithDeviceLock({
      mobileNumber: cleanMobile,
      fullName: cleanName,
    });

    const effectiveName = (profile.fullName || cleanName).trim().slice(0, 60);
    if (!effectiveName) throw new Error('INVALID_NAME');

    lastStudentTakeoverAtRef.current = Date.now();
    deviceClaimedForStudentRef.current = profile.id || getStudentDocId(cleanMobile);
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
    const mob = savedUserMeta.mobile;
    clearLocalStudentSession();
    if (/^[0-9]{10}$/.test(mob)) {
      void releaseStudentDeviceLock(mob).catch(() => {});
    }
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

  const handleSaveGithubRepo = async (repo: string, notes: string) => {
    setIsBusy(true);
    try {
      await saveReleaseConfig(repo, notes);
      setBanner({
        isError: false,
        message:
          lang === 'en' ? 'Update settings saved.' : 'અપડેટ સેટિંગ્સ સેવ થઈ ગયા છે.',
      });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Save failed'),
      });
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

  const handleUnlockStudentDevice = async (st: StudentProfile) => {
    setIsBusy(true);
    try {
      await adminUnlockStudentDevice(st);
      setBanner({
        isError: false,
        message: `${st.fullName || st.mobileNumber} — ${t.unlockDeviceSuccess}`,
      });
    } catch (err) {
      setBanner({ isError: true, message: formatAppError(err, 'Unlock failed') });
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

  const handleAdminSignOut = useCallback(
    async (noticeMessage?: string, isErrorNotice = true) => {
      try {
        await signOutAdminSession().catch(() => {});
        setAuthUser(null);
        setApprovedConfirmation(null);
        setRoute({ name: 'public', tab: 'quiz' });
        if (noticeMessage) {
          setBanner({ isError: isErrorNotice, message: noticeMessage });
        }
      } catch (err) {
        setBanner({
          isError: true,
          message: formatAppError(err, 'Sign out error'),
        });
      }
    },
    [formatAppError]
  );

  const handleAdminLoginSuccess = (result: AdminPasscodeAuthResult) => {
    lastAdminTakeoverAtRef.current = Date.now();
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

  // Enforce single-device session for Admin (if Admin signs in on another device, sign out here automatically)
  useEffect(() => {
    if (!isFirebaseAdmin) return;
    const unsub = observeAdminSessionDevice((remoteDeviceId) => {
      const cleanRemote = (remoteDeviceId ?? '').trim();
      const myDeviceId = getCurrentDeviceIdentity().deviceId;
      if (
        cleanRemote &&
        cleanRemote !== myDeviceId &&
        Date.now() - lastAdminTakeoverAtRef.current > 4500
      ) {
        void handleAdminSignOut(t.deviceKickedOutMsg, true);
      }
    });
    return () => unsub();
  }, [handleAdminSignOut, isFirebaseAdmin, t.deviceKickedOutMsg]);

  // Verify active device session immediately when returning to the app
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isStudentLoggedIn && !isFirebaseAdmin) return;
      void verifyActiveSessionOnResume(
        isStudentLoggedIn ? studentDocId : undefined,
        isFirebaseAdmin
      ).then((res) => {
        const myDeviceId = getCurrentDeviceIdentity().deviceId;
        if (res.studentProfile && isStudentLoggedIn) {
          const remoteDev = (res.studentProfile.activeDeviceId ?? '').trim();
          if (
            remoteDev &&
            remoteDev !== myDeviceId &&
            Date.now() - lastStudentTakeoverAtRef.current > 4500
          ) {
            clearLocalStudentSession(t.deviceKickedOutMsg, true);
          }
        }
        if (
          res.adminDeviceId &&
          isFirebaseAdmin &&
          res.adminDeviceId !== myDeviceId &&
          Date.now() - lastAdminTakeoverAtRef.current > 4500
        ) {
          void handleAdminSignOut(t.deviceKickedOutMsg, true);
        }
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [
    clearLocalStudentSession,
    handleAdminSignOut,
    isFirebaseAdmin,
    isStudentLoggedIn,
    studentDocId,
    t.deviceKickedOutMsg,
  ]);

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
          effectiveGithubRepo={effectiveGithubRepo}
          currentVersionName={APP_VERSION_NAME}
          isBusy={isBusy}
          isCheckingUpdate={isCheckingUpdate}
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
          onSaveGithubRepo={(repo, notes) => void handleSaveGithubRepo(repo, notes)}
          onTestUpdateCheck={() => void checkForUpdates(true)}
          onDeletePayment={handleDeletePayment}
          onDeleteCode={handleDeleteCode}
          onUnlockStudentDevice={handleUnlockStudentDevice}
          onDeleteStudent={handleDeleteStudent}
          onNotify={(msg) => setBanner({ isError: false, message: msg })}
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
            studentName={savedUserMeta.name}
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
                previousTotalQuizzes: student?.totalQuizzesTaken ?? 0,
                previousBestScore: student?.bestScorePercent ?? 0,
              }).catch(() => {});
            }}
            onExit={() => setRoute({ name: 'subject', subjectId: subject.id })}
          />
        </Suspense>
      );
    }
  } else {
    const pendingBadge = allPayments.filter((p) => p.status === 'pending').length;

    bodyNode = (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col">
        <TopNavHeader
          activeTab="quiz"
          isStudentLoggedIn={isStudentLoggedIn}
          studentName={savedUserMeta.name}
          studentMobile={savedUserMeta.mobile}
          isAdmin={isAdmin}
          adminBadgeCount={liveAlerts.length || pendingBadge}
          isDarkTheme={isDarkTheme}
          onSelectTab={(tab) => setRoute({ name: 'public', tab })}
          onStudentLogout={handleStudentLogout}
          onToggleTheme={() => setIsDarkTheme((prev) => !prev)}
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
              studentName={savedUserMeta.name}
              studentMobile={savedUserMeta.mobile}
              unlockedSubjects={effectiveUnlockedSubjects}
              myPayments={myPayments}
              recentAttempts={myAttempts}
              prefilledCode={prefilledCode}
              isBusy={isBusy}
              onSubmitPayment={handleSubmitPayment}
              onRedeemCode={handleRedeemCode}
              onOpenSubject={(subjectId) => setRoute({ name: 'subject', subjectId })}
              onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <>
      {bodyNode}

      {banner && (
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

      {isAdmin && availableUpdate && (
        <UpdateAvailableModal
          release={availableUpdate}
          currentVersionName={APP_VERSION_NAME}
          onDismiss={() => setAvailableUpdate(null)}
        />
      )}
    </>
  );
};

export default App;
