import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Copy,
  ExternalLink,
  IndianRupee,
  KeyRound,
  Lock,
  LockOpen,
  Play,
  Upload,
} from 'lucide-react';
import { ADMIN_UPI_ID, ADMIN_UPI_NAME } from '../services/quizRepository';
import { buildUpiPaymentHref } from '../utils/imageUtils';
import type { QuizChapter, QuizSubject } from '../types/models';

interface SubjectChaptersScreenProps {
  subject: QuizSubject;
  hasQuizAccess: boolean;
  studentMobile?: string;
  isBusy?: boolean;
  onBack: () => void;
  onStartChapterQuiz: (chapter: QuizChapter) => void;
  onRedeemCode: (code: string, onUnlocked: () => void) => void;
  onOpenUnlock: () => void;
  onNotify?: (message: string) => void;
}

export const SubjectChaptersScreen: React.FC<SubjectChaptersScreenProps> = ({
  subject,
  hasQuizAccess,
  studentMobile = '',
  isBusy = false,
  onBack,
  onStartChapterQuiz,
  onRedeemCode,
  onOpenUnlock,
  onNotify,
}) => {
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const totalQuestions = subject.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(ADMIN_UPI_ID);
      onNotify?.('UPI ID કોપી થઈ ગયો');
    } catch {
      onNotify?.(`UPI ID: ${ADMIN_UPI_ID}`);
    }
  };

  const handleRedeem = () => {
    const cleaned = codeInput.trim();
    if (cleaned.length < 4) {
      setLocalError('કૃપા કરીને માન્ય એક્સેસ કોડ દાખલ કરો.');
      return;
    }
    setLocalError(null);
    onRedeemCode(cleaned, () => {
      setShowUnlockDialog(false);
    });
  };

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
                    setShowUnlockDialog(true);
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
                        {chapter.isFreeUnlocked ? 'ફ્રી અનલૉક' : 'લૉક'}
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

      {/* Folder Unlock Modal */}
      {showUnlockDialog && !hasQuizAccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-bold">{subject.title} ફોલ્ડર અનલૉક કરો</h3>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
              એડમિન પેનલમાં આપેલ એક્સેસ કોડ નાખો એટલે આ ફોલ્ડરના બધા લૉક પ્રશ્નો એક સાથે અનલૉક થઈ જશે.
            </p>

            {/* Step 1: Access Code */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <KeyRound className="h-4 w-4 text-[#1E3A8A] dark:text-[#93C5FD]" />
                <span>૧. એક્સેસ કોડ નાખો</span>
              </div>
              <input
                type="text"
                maxLength={32}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase().slice(0, 32));
                  setLocalError(null);
                }}
                placeholder="એક્સેસ કોડ (ઉદા. STD10-XXXXXX)"
                className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#FAF9F5] dark:bg-[#0F172A] px-3 text-sm font-semibold tracking-wide outline-none focus:border-[#1E3A8A]"
              />
              {localError && <p className="text-xs text-red-600 dark:text-red-400">{localError}</p>}
              <button
                type="button"
                disabled={isBusy}
                onClick={handleRedeem}
                className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isBusy ? 'ચકાસણી થાય છે...' : 'કોડથી બધા પ્રશ્નો અનલૉક કરો'}
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* Step 2: UPI Payment */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <IndianRupee className="h-4 w-4 text-[#D97706] dark:text-[#FCD34D]" />
                <span>૨. કોડ ન હોય તો ₹24 UPI પેમેન્ટ કરો</span>
              </div>
              <div className="rounded-xl bg-[#FEF3C7] dark:bg-[#451A03] p-3 text-[#92400E] dark:text-[#FDE68A] space-y-1.5">
                <p className="text-xs font-bold">નામ: {ADMIN_UPI_NAME}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">UPI: {ADMIN_UPI_ID}</span>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="p-1.5 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
                    title="UPI ID કોપી કરો"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs font-bold">રકમ: ₹24</p>
              </div>

              <a
                href={buildUpiPaymentHref(ADMIN_UPI_ID, ADMIN_UPI_NAME, 24, studentMobile)}
                className="w-full h-11 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>એક ક્લિકમાં ₹24 UPI એપમાં ચૂકવો</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowUnlockDialog(false);
                  onOpenUnlock();
                }}
                className="w-full h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>પેમેન્ટ સ્ક્રીનશોટ મોકલો</span>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowUnlockDialog(false)}
                className="px-4 py-2 text-sm font-semibold text-[#1E3A8A] dark:text-[#93C5FD] hover:underline cursor-pointer"
              >
                બંધ કરો
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
