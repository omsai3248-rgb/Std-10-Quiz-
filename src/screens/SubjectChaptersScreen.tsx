import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  IndianRupee,
  KeyRound,
  Lock,
  LockOpen,
  Play,
} from 'lucide-react';
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
  studentName: string;
  studentMobile: string;
  myPayments: PaymentRequest[];
  isBusy?: boolean;
  onBack: () => void;
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
  studentName,
  studentMobile,
  myPayments,
  isBusy = false,
  onBack,
  onStartChapterQuiz,
  onSubmitPayment,
  onRedeemCode,
  onNotify,
}) => {
  const { lang, t } = useTranslation();
  const [modalMode, setModalMode] = useState<'pay' | 'code' | null>(null);

  const totalQuestions = subject.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className="max-w-[720px] mx-auto px-3 h-16 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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

      <main className="max-w-[720px] mx-auto px-4 py-5 space-y-3.5">
        {/* Subject Hero Banner */}
        <div className="relative h-36 sm:h-40 rounded-2xl overflow-hidden shadow-sm">
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
                className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <IndianRupee className="h-3.5 w-3.5" />
                <span>{t.payTabLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setModalMode('code')}
                className="h-9 px-3.5 rounded-xl bg-white/85 dark:bg-black/30 hover:bg-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t.codeTabLabel}</span>
              </button>
            </div>
          </div>
        )}

        {/* Chapters List */}
        <div className="space-y-3">
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
                className="w-full text-left rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm hover:shadow-md transition-shadow p-4 flex items-center gap-3.5 cursor-pointer"
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
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{chapter.subtitle}</p>
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
