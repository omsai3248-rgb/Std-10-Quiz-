import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { X } from 'lucide-react';
import { auth } from './firebase';
import { findChapter, findSubject } from './data/curriculum/std10Curriculum';
import { TopNavHeader, type PublicTabId } from './components/TopNavHeader';
import { UpdateAvailableModal } from './components/AppUpdateComponents';
import { useTranslation } from './i18n/translations';
import { StudentMobileLoginScreen } from './screens/StudentMobileLoginScreen';
import { UseCodeScreen } from './screens/UseCodeScreen';
import { AdminPhoneLoginScreen } from './screens/AdminPhoneLoginScreen';
import { AdminPanelScreen, type AdminLiveAlert } from './screens/AdminPanelScreen';
import { SubjectChaptersScreen } from './screens/SubjectChaptersScreen';
import { QuizPlayScreen } from './screens/QuizPlayScreen';
import { quizAudioPlayer } from './services/audioPlayer';
import { extractReadableErrorMessage } from './services/firestoreErrorHandler';
import {
  approvePaymentAndAssignCode,
  generateBulkAccessCodes,
  isAdminAccount,
  loadMyPaymentRequestIds,
  observeAllAccessCodes,
  observeAllPaymentRequests,
  observeMyPaymentRequests,
  observeMyQuizAttempts,
  observePaymentRequestsByIds,
  observeReleaseConfig,
  observeStudentProfile,
  recordQuizAttempt,
  redeemAccessCodePublic,
  rejectPaymentRequest,
  saveMyPaymentRequestId,
  saveReleaseConfig,
  submitPaymentRequest,
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
  type StudentProfile,
  type SubjectId,
} from './types/models';
import { buildPaymentApprovalWhatsAppHref, launchExternalUrl } from './utils/imageUtils';

type AppRoute =
  | { name: 'public'; tab: PublicTabId }
  | { name: 'subject'; subjectId: SubjectId }
  | { name: 'quiz'; subjectId: SubjectId; chapterId: string };

const LOCAL_UNLOCKS_KEY = 'std10_unlocked_subjects_v2';
const LOCAL_USER_META_KEY = 'std10_public_user_meta_v2';

function loadSavedUnlockedSubjects(mobileNumber = ''): string[] {
  const cleanMob = mobileNumber.replace(/\D/g, '').slice(-10);
  const scopedKey = cleanMob ? `${LOCAL_UNLOCKS_KEY}_${cleanMob}` : LOCAL_UNLOCKS_KEY;
  try {
    const raw =
      localStorage.getItem(scopedKey) ??
      (cleanMob ? localStorage.getItem(LOCAL_UNLOCKS_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function loadSavedUserMeta(): { name: string; mobile: string } {
  try {
    const raw = localStorage.getItem(LOCAL_USER_META_KEY);
    if (!raw) return { name: '', mobile: '' };
    const parsed = JSON.parse(raw) as { name?: string; mobile?: string };
    return {
      name: (parsed.name ?? '').trim(),
      mobile: (parsed.mobile ?? '').replace(/\D/g, '').slice(0, 10),
    };
  } catch {
    return { name: '', mobile: '' };
  }
}

export const App: React.FC = () => {
  const { lang, t } = useTranslation();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [savedUserMeta, setSavedUserMeta] = useState<{ name: string; mobile: string }>(
    loadSavedUserMeta
  );
  const [localUnlockedSubjects, setLocalUnlockedSubjects] = useState<string[]>(() =>
    loadSavedUnlockedSubjects(loadSavedUserMeta().mobile)
  );
  const [myPaymentIds, setMyPaymentIds] = useState<string[]>(() =>
    loadMyPaymentRequestIds(loadSavedUserMeta().mobile)
  );
  const [prefilledCode] = useState('');

  const [myPayments, setMyPayments] = useState<PaymentRequest[]>([]);
  const [myAttempts, setMyAttempts] = useState<QuizAttempt[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRequest[]>([]);
  const [allCodes, setAllCodes] = useState<AccessCode[]>([]);
  const [releaseConfig, setReleaseConfig] = useState<AppReleaseConfig | null>(null);

  const [syncVersion, setSyncVersion] = useState(0);
  const [route, setRoute] = useState<AppRoute>({ name: 'public', tab: 'quiz' });
  const [isBusy, setIsBusy] = useState(false);
  const [banner, setBanner] = useState<ActionBanner | null>(null);
  const [lastGeneratedBatch, setLastGeneratedBatch] = useState<string[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<AdminLiveAlert[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [approvedConfirmation, setApprovedConfirmation] = useState<PaymentRequest | null>(null);

  const [availableUpdate, setAvailableUpdate] = useState<GitHubReleaseInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const lastCheckedConfigKeyRef = useRef<string>('');
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

  // Observe Firebase Auth state (used for Admin Phone OTP +919099592283); public students log in
  // via their mobile number locally and submit/redeem directly using persistent cryptographic IDs.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAuthUser(null);
        setStudent(null);
        setMyAttempts([]);
        setAllPayments([]);
        setAllCodes([]);
        knownPendingIdsRef.current = null;
        knownUsedCodesRef.current = null;
      } else {
        setAuthUser(user);
      }
      setAuthInitialized(true);
    });
    return () => unsub();
  }, []);

  const isAdmin = useMemo(() => {
    if (!authUser) return false;
    return isAdminAccount(authUser.phoneNumber ?? '');
  }, [authUser]);

  const effectiveUnlockedSubjects = useMemo(() => {
    const set = new Set<string>(localUnlockedSubjects);
    if (student?.hasQuizAccess) {
      set.add('all');
      ALL_SUBJECT_IDS.forEach((s) => set.add(s));
    }
    student?.unlockedSubjects?.forEach((s) => set.add(s));
    return Array.from(set);
  }, [localUnlockedSubjects, student]);

  // Realtime Firestore listeners
  useEffect(() => {
    if (!isAdmin) {
      knownPendingIdsRef.current = null;
      knownUsedCodesRef.current = null;
      setAllPayments([]);
      setAllCodes([]);
    }

    const unsubs = [observeReleaseConfig(setReleaseConfig)];

    if (authUser) {
      unsubs.push(
        observeStudentProfile(
          authUser.uid,
          (profile) => setStudent(profile),
          () => {}
        ),
        observeMyPaymentRequests(authUser.uid, (items) => {
          setMyPayments(items);
        }),
        observeMyQuizAttempts(authUser.uid, setMyAttempts)
      );
    } else {
      unsubs.push(observePaymentRequestsByIds(myPaymentIds, setMyPayments));
    }

    if (isAdmin) {
      const onAdminListenerError = (err: unknown) => {
        setBanner({
          isError: true,
          message: extractReadableErrorMessage(err, langRef.current),
        });
      };

      unsubs.push(
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
        }, onAdminListenerError)
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authUser, isAdmin, myPaymentIds, syncVersion]);

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
      if (!effectiveGithubRepo) return;
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
    [effectiveGithubRepo, releaseConfigKey]
  );

  const persistUserMeta = (name: string, mobile: string) => {
    const cleanMobile = mobile.replace(/\D/g, '').slice(0, 10);
    const next = { name: name.trim().slice(0, 60), mobile: cleanMobile };
    setSavedUserMeta(next);
    try {
      localStorage.setItem(LOCAL_USER_META_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
    setLocalUnlockedSubjects(loadSavedUnlockedSubjects(cleanMobile));
    setMyPaymentIds(loadMyPaymentRequestIds(cleanMobile));
  };

  const handleStudentLogin = (name: string, mobile: string) => {
    persistUserMeta(name, mobile);
    setRoute({ name: 'public', tab: 'quiz' });
  };

  const handleStudentLogout = () => {
    const empty = { name: '', mobile: '' };
    setSavedUserMeta(empty);
    setLocalUnlockedSubjects([]);
    setMyPaymentIds([]);
    setMyPayments([]);
    try {
      localStorage.removeItem(LOCAL_USER_META_KEY);
    } catch {
      // Ignore
    }
    setRoute({ name: 'public', tab: 'quiz' });
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
    upiTransactionRef: string;
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
    if (!isAdmin) return;
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
      // Immediately launch WhatsApp with the student's details & generated code
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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
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

  const handleSaveGithubRepo = async (repo: string, notes: string) => {
    if (!isAdmin) return;
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

  const handleAdminSignOut = async () => {
    try {
      await signOut(auth);
      setApprovedConfirmation(null);
      setRoute({ name: 'public', tab: 'quiz' });
    } catch (err) {
      setBanner({
        isError: true,
        message: formatAppError(err, 'Sign out error'),
      });
    }
  };

  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] flex flex-col items-center justify-center gap-3 text-[#0F172A] dark:text-[#F8FAFC]">
        <div className="h-9 w-9 rounded-full border-3 border-[#1E3A8A] border-t-transparent animate-spin" />
        <p className="text-sm font-semibold">{t.loadingApp}</p>
      </div>
    );
  }

  let bodyNode: React.ReactNode;

  if (route.name === 'public' && route.tab === 'admin' && isAdmin) {
    bodyNode = (
      <AdminPanelScreen
        payments={allPayments}
        accessCodes={allCodes}
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
        onForceSync={() => setSyncVersion((v) => v + 1)}
        onToggleSound={() => setIsSoundEnabled((prev) => !prev)}
        onClearAlerts={() => setLiveAlerts([])}
        onSignOut={() => void handleAdminSignOut()}
        onGenerateBulkCodes={(c, b, s) => void handleGenerateBulkCodes(c, b, s)}
        onApprovePayment={(r, n, s) => void handleApprovePayment(r, n, s)}
        onRejectPayment={(r, reason) => void handleRejectPayment(r, reason)}
        onSaveGithubRepo={(repo, notes) => void handleSaveGithubRepo(repo, notes)}
        onTestUpdateCheck={() => void checkForUpdates(true)}
        onNotify={(msg) => setBanner({ isError: false, message: msg })}
      />
    );
  } else if (route.name === 'subject' && isStudentLoggedIn) {
    const subject = findSubject(route.subjectId);
    if (!subject) {
      bodyNode = null;
    } else {
      const hasAccess =
        effectiveUnlockedSubjects.includes('all') ||
        effectiveUnlockedSubjects.includes(subject.id);
      bodyNode = (
        <SubjectChaptersScreen
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
      );
    }
  } else if (route.name === 'quiz' && isStudentLoggedIn) {
    const subject = findSubject(route.subjectId);
    const chapter = findChapter(route.subjectId, route.chapterId);
    if (!subject || !chapter) {
      bodyNode = null;
    } else {
      bodyNode = (
        <QuizPlayScreen
          subject={subject}
          chapter={chapter}
          onQuizCompleted={(score, total, elapsedSeconds) => {
            void recordQuizAttempt({
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
      );
    }
  } else {
    const activeTab: PublicTabId = route.name === 'public' ? route.tab : 'quiz';
    const pendingBadge = allPayments.filter((p) => p.status === 'pending').length;

    bodyNode = (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col">
        <TopNavHeader
          activeTab={activeTab}
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
          {activeTab === 'quiz' && !isStudentLoggedIn && (
            <StudentMobileLoginScreen
              initialName={savedUserMeta.name}
              initialMobile={savedUserMeta.mobile}
              onLoginSuccess={handleStudentLogin}
              onOpenAdminLogin={() => setRoute({ name: 'public', tab: 'admin' })}
            />
          )}

          {activeTab === 'quiz' && isStudentLoggedIn && (
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
              onOpenSubject={(sub) => setRoute({ name: 'subject', subjectId: sub.id })}
              onNotify={(msg, isErr) => setBanner({ isError: Boolean(isErr), message: msg })}
            />
          )}

          {activeTab === 'admin' && !isAdmin && (
            <AdminPhoneLoginScreen
              onAdminAuthenticated={() => {
                setBanner({
                  isError: false,
                  message:
                    lang === 'en'
                      ? 'Admin authenticated (+91 9099592283)'
                      : 'એડમિન લૉગિન સફળ (+91 9099592283)',
                });
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

      {availableUpdate && (
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
