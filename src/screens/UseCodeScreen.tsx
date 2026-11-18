import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Folder,
  History,
  IndianRupee,
  KeyRound,
  Lock,
  Monitor,
  Radio,
  Trophy,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { std10SubjectMetas } from '../data/curriculum/std10Curriculum';
import { AppUpdateFooterCard } from '../components/AppUpdateComponents';
import { SubjectPaymentModal } from '../components/SubjectPaymentModal';
import { useTranslation } from '../i18n/translations';
import type { SyncStatusSnapshot } from '../services/syncManager';
import {
  ALL_SUBJECT_IDS,
  PRICE_ALL_SUBJECTS,
  PRICE_SINGLE_SUBJECT,
  displayPaymentTransactionRef,
  getSubjectDisplayName,
  resolvePaymentSubjectId,
  type PaymentRequest,
  type QuizAttempt,
  type SubjectId,
} from '../types/models';
import { formatTimestampLabel, resolvePaymentImageSrc } from '../utils/imageUtils';

interface UseCodeScreenProps {
  studentName: string;
  studentMobile: string;
  syncStatus?: SyncStatusSnapshot;
  unlockedSubjects: string[];
  myPayments: PaymentRequest[];
  recentAttempts: QuizAttempt[];
  prefilledCode?: string;
  isBusy: boolean;
  onSubmitPayment: (params: {
    studentName: string;
    mobileNumber: string;
    amountRupees: number;
    upiTransactionRef?: string;
    imageBlob: Blob;
    fallbackBase64: string;
    subjectId: string;
  }) => Promise<string | undefined>;
  onRedeemCode: (params: {
    code: string;
    name: string;
    mobile: string;
    expectedSubjectId?: string;
  }) => Promise<{ code: string; subjectId: string } | undefined>;
  onOpenSubject: (subjectId: SubjectId) => void;
  onOpenDisplaySettings?: () => void;
  onNotify?: (message: string, isError?: boolean) => void;
  currentVersionName?: string;
  currentVersionCode?: number;
  isCheckingUpdate?: boolean;
  hasAvailableUpdate?: boolean;
  latestVersionName?: string;
  onCheckUpdateClick?: () => void;
  onOpenUpdateModal?: () => void;
}

export const UseCodeScreen: React.FC<UseCodeScreenProps> = ({
  studentName,
  studentMobile,
  syncStatus,
  unlockedSubjects,
  myPayments,
  recentAttempts,
  prefilledCode = '',
  isBusy,
  onSubmitPayment,
  onRedeemCode,
  onOpenSubject,
  onOpenDisplaySettings,
  onNotify,
  currentVersionName = '1.0.0',
  currentVersionCode = 1,
  isCheckingUpdate = false,
  hasAvailableUpdate = false,
  latestVersionName = '',
  onCheckUpdateClick,
  onOpenUpdateModal,
}) => {
  const { lang, t } = useTranslation();
  const {
    useNavigationRail,
    useSplitLayout,
    isLargeScreen,
    isTvOrSmartBoard,
    gridColumns,
    screenProfileLabel,
  } = useAdaptiveDisplay();

  const [unlockModalState, setUnlockModalState] = useState<{
    isOpen: boolean;
    mode: 'pay' | 'code';
    code: string;
  }>({
    isOpen: false,
    mode: 'pay',
    code: prefilledCode,
  });

  const hasSubjectAccess = (subjectId: SubjectId): boolean => {
    return unlockedSubjects.includes('all') || unlockedSubjects.includes(subjectId);
  };

  const allUnlocked = ALL_SUBJECT_IDS.every((id) => hasSubjectAccess(id));
  const anyUnlocked = ALL_SUBJECT_IDS.some((id) => hasSubjectAccess(id));

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onNotify?.(`${t.payUpiCopied}: ${code}`);
    } catch {
      onNotify?.(code);
    }
  };

  const hasSideActivity = !allUnlocked || myPayments.length > 0 || recentAttempts.length > 0;
  const containerMaxCls = isLargeScreen ? 'max-w-[1480px] px-4 sm:px-6' : 'max-w-2xl px-3 sm:px-4';
  const subjectGridCls =
    gridColumns === 3 && !hasSideActivity
      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
      : gridColumns >= 2
        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
        : 'space-y-3.5';

  return (
    <div className={`${containerMaxCls} mx-auto py-5 space-y-5`}>
      {/* Offline / Quota Protection Notice */}
      {syncStatus && (!syncStatus.isOnline || syncStatus.errorKind === 'quota') && (
        <div className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03]/70 border border-[#F59E0B]/40 p-3 flex items-start gap-2.5 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
          <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {!syncStatus.isOnline ? t.offlineModeBanner : t.quotaCooldownBanner}
          </span>
        </div>
      )}

      <div
        className={
          useNavigationRail
            ? 'grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-start'
            : ''
        }
      >
        {/* Adaptive Left Navigation Rail for Tablets (Landscape), Android TV & Smart Boards */}
        {useNavigationRail && (
          <aside className="sticky top-28 rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 shadow-sm space-y-2">
            <p className="px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] truncate">
              {screenProfileLabel}
            </p>
            <a
              href="#subjects-section"
              className="w-full min-h-[48px] px-3 rounded-xl bg-[#DBEAFE]/70 dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] text-xs font-extrabold flex items-center gap-2.5"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>{t.subjectsHeader}</span>
            </a>
            {!allUnlocked && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setUnlockModalState({ isOpen: true, mode: 'pay', code: prefilledCode })
                  }
                  className="w-full min-h-[48px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <IndianRupee className="h-4 w-4 shrink-0 text-[#D97706]" />
                  <span>{t.payTabLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUnlockModalState({ isOpen: true, mode: 'code', code: prefilledCode })
                  }
                  className="w-full min-h-[48px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 shrink-0 text-[#047857]" />
                  <span>{t.codeTabLabel}</span>
                </button>
              </>
            )}
            {onOpenDisplaySettings && (
              <button
                type="button"
                onClick={onOpenDisplaySettings}
                className="w-full min-h-[48px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2.5 text-left cursor-pointer"
              >
                <Monitor className="h-4 w-4 shrink-0 text-[#1E3A8A] dark:text-[#93C5FD]" />
                <span>{t.displaySettingsTitle}</span>
              </button>
            )}
          </aside>
        )}

        <div
          className={
            useSplitLayout && hasSideActivity
              ? 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start'
              : 'space-y-5'
          }
        >
          {/* Quiz Platform Hero / Subject Folders */}
          <section
            id="subjects-section"
            className={`${useSplitLayout && hasSideActivity ? 'xl:col-span-8' : ''} space-y-3.5`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold">{t.unlockedContentTitle}</h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                  {t.unlockedContentSubtitle}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
                  allUnlocked
                    ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                    : anyUnlocked
                      ? 'bg-[#DBEAFE] text-[#1E3A8A] dark:bg-[#1E3A5F] dark:text-[#DBEAFE]'
                      : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]'
                }`}
              >
                {allUnlocked
                  ? t.unlockedBadge
                  : anyUnlocked
                    ? t.partialUnlockedBadge
                    : t.lockedBadge}
              </span>
            </div>

            {/* All Subjects ₹49 Quick Unlock Strip (shown inline on smaller screens, in supporting pane on wide) */}
            {!allUnlocked && !useSplitLayout && (
              <div className="rounded-2xl bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A]/70 dark:from-[#451A03] dark:to-[#78350F]/60 border border-[#F59E0B]/35 p-4 text-[#92400E] dark:text-[#FDE68A] space-y-2.5">
                <div className="space-y-0.5">
                  <h3 className="text-sm sm:text-base font-extrabold">{t.unlockAllBannerTitle}</h3>
                  <p className="text-xs opacity-90">{t.unlockAllBannerDesc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModalState({ isOpen: true, mode: 'pay', code: prefilledCode })
                    }
                    className="min-h-[44px] px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <IndianRupee className="h-3.5 w-3.5" />
                    <span>
                      {lang === 'en'
                        ? `Pay ₹${PRICE_ALL_SUBJECTS} via UPI`
                        : `₹${PRICE_ALL_SUBJECTS} UPI પેમેન્ટ કરો`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModalState({ isOpen: true, mode: 'code', code: prefilledCode })
                    }
                    className="min-h-[44px] px-3.5 rounded-xl bg-white/85 dark:bg-black/30 hover:bg-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>{t.codeTabLabel}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Subject Folders Responsive Grid */}
            <div className={subjectGridCls}>
              {std10SubjectMetas.map((subject) => {
                const access = hasSubjectAccess(subject.id);
                return (
                  <div key={subject.id} className="w-full flex flex-col">
                    <div
                      className="ml-4 self-start inline-flex items-center gap-1.5 rounded-t-xl px-3.5 py-1 text-white text-xs font-bold"
                      style={{ backgroundColor: subject.accentHex }}
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span>{subject.englishSubtitle}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenSubject(subject.id)}
                      className={`w-full flex-1 text-left rounded-tr-2xl rounded-b-2xl rounded-tl-md bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm hover:shadow-md transition-all ${
                        isTvOrSmartBoard ? 'p-4.5 gap-4' : 'p-3.5 gap-3.5'
                      } flex items-center cursor-pointer`}
                    >
                      <div className="relative w-22 h-18 sm:w-28 sm:h-20 rounded-xl overflow-hidden shrink-0">
                        <img
                          src={subject.imageUrl}
                          alt={subject.title}
                          className="w-full h-full object-cover"
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(180deg, ${subject.accentHex}10 0%, ${subject.accentHex}75 100%)`,
                          }}
                        />
                        <div className="absolute top-1.5 right-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 p-1 shadow">
                          {access ? (
                            <CheckCircle2 className="h-4 w-4 text-[#047857] dark:text-[#6EE7B7]" />
                          ) : (
                            <Lock className="h-4 w-4" style={{ color: subject.accentHex }} />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-base sm:text-lg font-bold truncate">
                            {lang === 'en' ? `${subject.englishSubtitle} (${subject.title})` : subject.title}
                          </h4>
                          {!access && (
                            <span className="shrink-0 rounded-md bg-[#FEF3C7] dark:bg-[#451A03] text-[#92400E] dark:text-[#FDE68A] px-2 py-0.5 text-[11px] font-extrabold tabular-nums">
                              ₹{PRICE_SINGLE_SUBJECT}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] line-clamp-2">
                          {subject.description}
                        </p>
                        <span
                          className="inline-block rounded-md px-2 py-0.5 text-xs font-bold tabular-nums"
                          style={{
                            backgroundColor: `${subject.accentHex}1F`,
                            color: subject.accentHex,
                          }}
                        >
                          {subject.chapterCount} / {subject.questionCount} {t.chaptersAndQuestions}
                        </span>
                      </div>

                      <ArrowRight className="h-5 w-5 shrink-0" style={{ color: subject.accentHex }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Supporting Side Pane (wide screens) or stacked sections (compact screens) */}
          <div
            className={`${useSplitLayout && hasSideActivity ? 'xl:col-span-4 space-y-4' : 'space-y-5'}`}
          >
            {!allUnlocked && useSplitLayout && (
              <div className="rounded-2xl bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A]/70 dark:from-[#451A03] dark:to-[#78350F]/60 border border-[#F59E0B]/35 p-4 text-[#92400E] dark:text-[#FDE68A] space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold">{t.unlockAllBannerTitle}</h3>
                  <p className="text-xs opacity-90">{t.unlockAllBannerDesc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModalState({ isOpen: true, mode: 'pay', code: prefilledCode })
                    }
                    className="min-h-[48px] flex-1 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <IndianRupee className="h-4 w-4" />
                    <span>
                      {lang === 'en'
                        ? `Pay ₹${PRICE_ALL_SUBJECTS} via UPI`
                        : `₹${PRICE_ALL_SUBJECTS} UPI પેમેન્ટ`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModalState({ isOpen: true, mode: 'code', code: prefilledCode })
                    }
                    className="min-h-[48px] px-4 rounded-xl bg-white/90 dark:bg-black/30 hover:bg-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>{t.codeTabLabel}</span>
                  </button>
                </div>
              </div>
            )}

      {/* Live Submitted Payment Status (appears when user has submitted any screenshot) */}
      {myPayments.length > 0 && (
        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold">{t.myRequestsTitle}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] text-[#064E3B] dark:text-[#D1FAE5] px-2.5 py-0.5 text-[11px] font-bold">
              <Radio className="h-3 w-3 animate-pulse" />
              <span>{t.liveBadge}</span>
            </span>
          </div>

          <div className="space-y-2.5">
            {myPayments.map((req) => {
              const thumbUrl = resolvePaymentImageSrc(req);
              const subName = getSubjectDisplayName(resolvePaymentSubjectId(req), lang);
              return (
                <div
                  key={req.id}
                  className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {thumbUrl && (
                        <img
                          src={thumbUrl}
                          alt={t.zoomModalTitle}
                          className="h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-extrabold truncate">
                          ₹{req.amountRupees} • {subName}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                          {displayPaymentTransactionRef(req)
                            ? `UTR: ${displayPaymentTransactionRef(req)} • `
                            : ''}
                          {formatTimestampLabel(req.createdAt, lang)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${
                        req.status === 'approved'
                          ? 'bg-[#D1FAE5] text-[#064E3B]'
                          : req.status === 'rejected'
                            ? 'bg-[#FEE2E2] text-[#7F1D1D]'
                            : 'bg-[#FEF3C7] text-[#92400E]'
                      }`}
                    >
                      {req.status === 'approved'
                        ? t.statusApproved
                        : req.status === 'rejected'
                          ? t.statusRejected
                          : t.statusPending}
                    </span>
                  </div>

                  {req.status === 'pending' && (
                    <div className="rounded-xl bg-[#FEF3C7]/60 dark:bg-[#451A03]/60 px-3 py-2 flex items-center gap-2 text-xs font-semibold text-[#92400E] dark:text-[#FDE68A]">
                      <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                      <span>{t.waitingApprovalLive}</span>
                    </div>
                  )}

                  {req.status === 'rejected' && (
                    <div className="rounded-xl bg-[#FEE2E2]/70 dark:bg-[#7F1D1D]/50 px-3 py-2 flex items-start gap-2 text-xs font-semibold text-[#7F1D1D] dark:text-[#FEE2E2]">
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {t.adminNoteLabel} {req.adminNote || t.statusRejected}
                      </span>
                    </div>
                  )}

                  {req.status === 'approved' && req.assignedCode && (
                    <div className="rounded-xl bg-[#D1FAE5] dark:bg-[#064E3B] p-3 flex flex-wrap items-center justify-between gap-2 text-[#064E3B] dark:text-[#D1FAE5]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                        <span className="text-base font-extrabold font-mono tracking-widest">
                          {req.assignedCode}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyCode(req.assignedCode)}
                          className="h-9 px-2.5 rounded-lg bg-white/80 dark:bg-black/30 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{t.copyCode}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setUnlockModalState({
                              isOpen: true,
                              mode: 'code',
                              code: req.assignedCode,
                            })
                          }
                          className="h-9 px-3 rounded-lg bg-[#047857] text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>{t.useThisCodeBtn}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Quiz Results */}
      {recentAttempts.length > 0 && (
        <section className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-[#1E3A8A] dark:text-[#93C5FD]" />
            <h3 className="text-base font-bold">{t.recentAttemptsTitle}</h3>
          </div>
          <div className="space-y-2">
            {recentAttempts.slice(0, 5).map((attempt) => (
              <div
                key={attempt.id}
                className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Trophy className="h-4.5 w-4.5 text-[#D97706] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold truncate">
                      {attempt.subjectTitle} • {attempt.chapterTitle}
                    </p>
                    <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] tabular-nums">
                      {attempt.score}/{attempt.totalQuestions} • {attempt.timeTakenSeconds}s
                    </p>
                  </div>
                </div>
                <span className="rounded-lg bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2.5 py-1 text-xs font-bold tabular-nums">
                  {attempt.percentage}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {onCheckUpdateClick && (
        <AppUpdateFooterCard
          currentVersionName={currentVersionName}
          currentVersionCode={currentVersionCode}
          isCheckingUpdate={isCheckingUpdate}
          hasAvailableUpdate={hasAvailableUpdate}
          latestVersionName={latestVersionName}
          onCheckUpdateClick={onCheckUpdateClick}
          onOpenUpdateModal={onOpenUpdateModal}
        />
      )}

      <SubjectPaymentModal
        isOpen={unlockModalState.isOpen}
        defaultSubjectId="all"
        initialMode={unlockModalState.mode}
        initialCode={unlockModalState.code}
        studentName={studentName}
        studentMobile={studentMobile}
        myPayments={myPayments}
        isBusy={isBusy}
        onClose={() => setUnlockModalState((prev) => ({ ...prev, isOpen: false }))}
        onSubmitPayment={onSubmitPayment}
        onRedeemCode={onRedeemCode}
        onNotify={onNotify}
      />
          </div>
        </div>
      </div>
    </div>
  );
};
