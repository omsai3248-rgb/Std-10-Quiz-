import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  IndianRupee,
  KeyRound,
  Lock,
  LockOpen,
  Play,
  Sparkles,
} from 'lucide-react';
import { useAdaptiveDisplay } from '../context/AdaptiveDisplayContext';
import { SubjectPaymentModal } from '../components/SubjectPaymentModal';
import { useTranslation } from '../i18n/translations';
import {
  PRICE_ALL_SUBJECTS,
  PRICE_SINGLE_SUBJECT,
  type PaymentRequest,
  type QuizChapter,
  type QuizSubject,
} from '../types/models';

interface SubjectChaptersScreenProps {
  subject: QuizSubject;
  hasQuizAccess: boolean;
  hasUsedFreeMock: boolean;
  studentName: string;
  studentMobile: string;
  myPayments: PaymentRequest[];
  isBusy?: boolean;
  initialModalMode?: 'pay' | 'code' | null;
  onConsumeInitialModalMode?: () => void;
  onBack: () => void;
  onStartMockTest: () => void;
  onStartChapterQuiz: (chapter: QuizChapter) => void;
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
  onNotify?: (message: string, isError?: boolean) => void;
}

export const SubjectChaptersScreen: React.FC<SubjectChaptersScreenProps> = ({
  subject,
  hasQuizAccess,
  hasUsedFreeMock,
  studentName,
  studentMobile,
  myPayments,
  isBusy = false,
  initialModalMode = null,
  onConsumeInitialModalMode,
  onBack,
  onStartMockTest,
  onStartChapterQuiz,
  onSubmitPayment,
  onRedeemCode,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const { useSplitLayout, isLargeScreen, isTvOrSmartBoard, gridColumns } = useAdaptiveDisplay();
  const [modalMode, setModalMode] = useState<'pay' | 'code' | null>(null);

  useEffect(() => {
    if (initialModalMode && !hasQuizAccess) {
      setModalMode(initialModalMode);
      onConsumeInitialModalMode?.();
    } else if (initialModalMode) {
      onConsumeInitialModalMode?.();
    }
  }, [hasQuizAccess, initialModalMode, onConsumeInitialModalMode]);

  const totalQuestions = subject.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
  const containerMaxCls = isLargeScreen ? 'max-w-[1480px] px-4 sm:px-6' : 'max-w-[720px] px-3 sm:px-4';
  const isMockUnlocked = hasQuizAccess || !hasUsedFreeMock;

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className={`${containerMaxCls} mx-auto h-16 flex items-center gap-2`}>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="પાછા જાઓ"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold leading-tight">{subject.title}</h1>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
              {subject.englishSubtitle}
            </p>
          </div>
        </div>
      </header>

      <main
        className={`${containerMaxCls} mx-auto py-5 ${
          useSplitLayout
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
            : 'space-y-3.5'
        }`}
      >
        <div className={useSplitLayout ? 'lg:col-span-4 lg:sticky lg:top-20 space-y-3.5' : 'space-y-3.5'}>
          {/* Subject Hero Banner */}
          <div className={`relative ${useSplitLayout ? 'h-48 sm:h-56' : 'h-36 sm:h-40'} rounded-2xl overflow-hidden shadow-sm`}>
            <img
              src={subject.imageUrl}
              alt={subject.title}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${subject.accentHex}E6 0%, ${subject.accentHex}59 100%)`,
              }}
            />
            <div className="absolute inset-0 p-5 flex flex-col justify-center gap-1.5">
              <h2 className="text-xl sm:text-2xl font-bold text-white">{subject.title} ફોલ્ડર</h2>
              <p className="text-xs sm:text-sm text-white/90 max-w-md">{subject.description}</p>
              <span className="self-start rounded-md bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 tabular-nums">
                કુલ {subject.chapters.length} પ્રશ્ન વિભાગ • {totalQuestions} પ્રશ્નો
              </span>
            </div>
          </div>

          {/* In-Subject Unlock Banner (Single ₹24 / All ₹49 via UPI) */}
          {!hasQuizAccess && (
            <div className="rounded-2xl bg-[#FEF3C7] dark:bg-[#451A03] border border-[#F59E0B]/35 p-4 text-[#92400E] dark:text-[#FDE68A] space-y-2.5">
              <p className="text-xs sm:text-sm font-extrabold">
                {lang === 'en'
                  ? `Unlock ${subject.englishSubtitle} (₹${PRICE_SINGLE_SUBJECT} Fix) or All Subjects (₹${PRICE_ALL_SUBJECTS} Fix)`
                  : `${subject.title} અનલૉક કરો ફક્ત ₹${PRICE_SINGLE_SUBJECT} (Fix) અથવા બધા વિષયો ₹${PRICE_ALL_SUBJECTS} (Fix)`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModalMode('pay')}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span>{t.payTabLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('code')}
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/85 dark:bg-black/30 hover:bg-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{t.codeTabLabel}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chapters Responsive Grid */}
        <div
          className={`${useSplitLayout ? 'lg:col-span-8' : ''} ${
            gridColumns >= 2
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3.5'
              : 'space-y-3'
          }`}
        >
          {/* Board Exam Mock Test Card at the very top of every subject folder */}
          <button
            type="button"
            data-testid="board_mock_test_card"
            onClick={() => {
              if (isMockUnlocked) {
                onStartMockTest();
              } else {
                setModalMode('pay');
              }
            }}
            className={`${
              gridColumns >= 2 ? 'col-span-full' : ''
            } w-full text-left rounded-2xl border-2 shadow-sm hover:shadow-md transition-all ${
              isTvOrSmartBoard ? 'p-5 gap-4' : 'p-4 sm:p-5 gap-3.5'
            } flex items-center cursor-pointer ${
              isMockUnlocked
                ? 'bg-gradient-to-r from-[#EEF2FF] via-[#E0E7FF]/70 to-white dark:from-[#1E293B] dark:via-[#1E3A5F]/65 dark:to-[#1E293B] border-[#1E3A8A]/40 dark:border-[#60A5FA]/50'
                : 'bg-[#FFFBEB] dark:bg-[#1E293B] border-[#F59E0B]/45 dark:border-[#F59E0B]/40'
            }`}
          >
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-xs"
              style={{
                backgroundColor: isMockUnlocked ? subject.accentHex : '#D97706',
              }}
            >
              {isMockUnlocked ? (
                <Award className="h-7 w-7 text-white" />
              ) : (
                <Lock className="h-6 w-6 text-white" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
                  style={{ backgroundColor: subject.accentHex }}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>પ્રશ્ન 1 થી 24 (ક્રમમાં)</span>
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${
                    hasQuizAccess
                      ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                      : !hasUsedFreeMock
                        ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                        : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]'
                  }`}
                >
                  {hasQuizAccess
                    ? 'અનલિમિટેડ મોક ટેસ્ટ'
                    : !hasUsedFreeMock
                      ? '૧ મોક ટેસ્ટ ફ્રી'
                      : `ફ્રી મોક ટેસ્ટ પૂર્ણ • લૉક (₹${PRICE_SINGLE_SUBJECT} / ₹${PRICE_ALL_SUBJECTS})`}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                બોર્ડ પરીક્ષા મોક ટેસ્ટ
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
                {hasQuizAccess
                  ? 'દરેક વખતે પ્રશ્ન 1 થી 24 ક્રમમાં નવા રેન્ડમ પ્રશ્નો • અનલિમિટેડ પ્રેક્ટિસ'
                  : !hasUsedFreeMock
                    ? 'પ્રશ્ન 1 થી 24 ક્રમમાં નવા રેન્ડમ પ્રશ્નો • આ ફોલ્ડરમાં ૧ મોક ટેસ્ટ ફ્રી આપો'
                    : 'તમારો ૧ ફ્રી મોક ટેસ્ટ પૂર્ણ થઈ ગયો છે • અનલિમિટેડ માટે ફોલ્ડર અનલૉક કરો'}
              </p>
            </div>

            {isMockUnlocked ? (
              <Play className="h-7 w-7 shrink-0" style={{ color: subject.accentHex }} />
            ) : (
              <Lock className="h-6 w-6 shrink-0 text-[#D97706]" />
            )}
          </button>

          {subject.chapters.map((chapter) => {
            const isChapterUnlocked = hasQuizAccess || Boolean(chapter.isFreeUnlocked);
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => {
                  if (isChapterUnlocked) {
                    onStartChapterQuiz(chapter);
                  } else {
                    setModalMode('pay');
                  }
                }}
                className={`w-full h-full text-left rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm hover:shadow-md transition-all ${
                  isTvOrSmartBoard ? 'p-4.5 gap-4' : 'p-4 gap-3.5'
                } flex items-center cursor-pointer`}
              >
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isChapterUnlocked ? `${subject.accentHex}24` : undefined,
                  }}
                >
                  {hasQuizAccess ? (
                    <BookOpen className="h-5 w-5" style={{ color: subject.accentHex }} />
                  ) : chapter.isFreeUnlocked ? (
                    <LockOpen className="h-5 w-5" style={{ color: subject.accentHex }} />
                  ) : (
                    <Lock className="h-5 w-5 text-slate-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-bold" style={{ color: subject.accentHex }}>
                    {chapter.chapterNumber}
                  </p>
                  <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    {chapter.title}
                  </h3>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] line-clamp-2">
                    {chapter.subtitle}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="rounded-md bg-[#EFF4FA] dark:bg-[#0F172A] text-[#475569] dark:text-[#94A3B8] px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                      {chapter.questions.length} પ્રશ્નો • {chapter.questionTypeLabel}
                    </span>
                    {!hasQuizAccess && (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          chapter.isFreeUnlocked
                            ? 'bg-[#D1FAE5] text-[#064E3B] dark:bg-[#064E3B] dark:text-[#D1FAE5]'
                            : 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]'
                        }`}
                      >
                        {chapter.isFreeUnlocked
                          ? 'ફ્રી અનલૉક'
                          : `લૉક • ₹${PRICE_SINGLE_SUBJECT} / ₹${PRICE_ALL_SUBJECTS}`}
                      </span>
                    )}
                  </div>
                </div>

                {isChapterUnlocked ? (
                  <Play className="h-6 w-6 shrink-0" style={{ color: subject.accentHex }} />
                ) : (
                  <Lock className="h-5 w-5 shrink-0 text-slate-400" />
                )}
              </button>
            );
          })}
        </div>
      </main>

      <SubjectPaymentModal
        isOpen={modalMode !== null && !hasQuizAccess}
        defaultSubjectId={subject.id}
        initialMode={modalMode ?? 'pay'}
        studentName={studentName}
        studentMobile={studentMobile}
        myPayments={myPayments}
        isBusy={isBusy}
        onClose={() => setModalMode(null)}
        onSubmitPayment={onSubmitPayment}
        onRedeemCode={onRedeemCode}
        onNotify={onNotify}
      />
    </div>
  );
};
