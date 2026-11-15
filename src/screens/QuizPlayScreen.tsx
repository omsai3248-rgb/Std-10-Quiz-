import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LayoutGrid,
  Lightbulb,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { MathRichText } from '../components/MathRichText';
import { PolynomialGraphCard } from '../components/PolynomialGraphCard';
import { quizAudioPlayer } from '../services/audioPlayer';
import type { QuizChapter, QuizSubject } from '../types/models';

interface QuizPlayScreenProps {
  subject: QuizSubject;
  chapter: QuizChapter;
  onQuizCompleted: (score: number, total: number, elapsedSeconds: number) => void;
  onExit: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const QuizPlayScreen: React.FC<QuizPlayScreenProps> = ({
  subject,
  chapter,
  onQuizCompleted,
  onExit,
}) => {
  const questions = chapter.questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showNavigatorDialog, setShowNavigatorDialog] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      quizAudioPlayer.stopCurrent();
    };
  }, []);

  useEffect(() => {
    if (isFinished) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFinished, chapter.id]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  const { liveCorrectCount, liveWrongCount } = useMemo(() => {
    const entries = Object.entries(selectedAnswers);
    let correct = 0;
    for (const [qIdxStr, ansIdx] of entries) {
      const q = questions[Number(qIdxStr)];
      if (q && q.correctIndex === ansIdx) correct++;
    }
    return {
      liveCorrectCount: correct,
      liveWrongCount: entries.length - correct,
    };
  }, [selectedAnswers, questions]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  const handleSelectOption = (idx: number) => {
    const question = questions[currentIndex];
    if (!question || selectedAnswers[currentIndex] !== undefined) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: idx }));
    if (!isMuted) {
      if (idx === question.correctIndex) {
        quizAudioPlayer.playCorrectChime();
      } else {
        quizAudioPlayer.playWrongSiren();
      }
    }
  };

  const handleNextOrFinish = () => {
    quizAudioPlayer.stopCurrent();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      const correctCount = questions.reduce((count, q, i) => {
        return selectedAnswers[i] === q.correctIndex ? count + 1 : count;
      }, 0);
      setIsFinished(true);
      onQuizCompleted(correctCount, questions.length, elapsedSeconds);
    }
  };

  const handleReplay = () => {
    quizAudioPlayer.stopCurrent();
    setSelectedAnswers({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsFinished(false);
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-base font-semibold">આ પ્રકરણમાં હજી કોઈ પ્રશ્ન ઉમેરાયા નથી.</p>
        <button
          type="button"
          onClick={onExit}
          className="px-5 py-2.5 rounded-xl bg-[#1E3A8A] text-white text-sm font-semibold cursor-pointer"
        >
          ફોલ્ડરમાં જાઓ
        </button>
      </div>
    );
  }

  const question = questions[currentIndex];
  const chosenOption = selectedAnswers[currentIndex];
  const isAnswered = chosenOption !== undefined;
  const isUserCorrect = chosenOption === question.correctIndex;
  const progressPercent = Math.round(((currentIndex + 1) * 100) / questions.length);

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className="max-w-[720px] mx-auto px-3 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                quizAudioPlayer.stopCurrent();
                onExit();
              }}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              aria-label="બહાર નીકળો"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold truncate">{chapter.title}</h1>
              <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] truncate">
                {subject.title} • {chapter.chapterNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-lg bg-[#DCFCE7] dark:bg-[#14532D] text-[#14532D] dark:text-[#DCFCE7] px-2 py-1 text-xs font-bold tabular-nums">
              ✓{liveCorrectCount} ✕{liveWrongCount}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE] px-2 py-1 text-xs font-bold tabular-nums">
              <Timer className="h-3.5 w-3.5" />
              <span>{formattedTime}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (nextMuted) quizAudioPlayer.stopCurrent();
              }}
              aria-label={isMuted ? 'અવાજ ચાલુ કરો' : 'અવાજ બંધ કરો'}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div ref={contentScrollRef} className="flex-1 overflow-y-auto">
        {!isFinished ? (
          <main className="max-w-[720px] mx-auto px-4 py-5 space-y-3.5">
            {/* Navigator & Progress */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowNavigatorDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#DBEAFE]/80 dark:bg-[#1E3A5F]/80 text-[#1E3A8A] dark:text-[#93C5FD] px-3 py-1.5 text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer tabular-nums"
              >
                <LayoutGrid className="h-4 w-4" />
                <span>
                  પ્રશ્ન {currentIndex + 1} / {questions.length}
                </span>
              </button>
              <span className="text-xs font-medium text-[#475569] dark:text-[#94A3B8] tabular-nums">
                {progressPercent}% • {chapter.questionTypeLabel}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1E3A8A] dark:bg-[#60A5FA] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Question Card */}
            <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] shadow-sm p-5 space-y-3">
              <div className="text-base sm:text-lg font-semibold leading-relaxed text-[#0F172A] dark:text-[#F8FAFC]">
                <MathRichText text={question.questionText} />
              </div>
              {question.graphPattern && (
                <PolynomialGraphCard pattern={question.graphPattern} />
              )}
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {question.options.map((optionText, idx) => {
                const isSelected = chosenOption === idx;
                const isCorrect = idx === question.correctIndex;

                let borderCls = 'border-[#CBD5E1] dark:border-[#334155]';
                let bgCls = 'bg-white dark:bg-[#1E293B] hover:border-[#1E3A8A]/60';
                let textCls = 'text-[#0F172A] dark:text-[#F8FAFC]';
                let badgeCls =
                  'bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#DBEAFE]';

                if (isAnswered) {
                  if (isCorrect) {
                    borderCls = 'border-2 border-[#16A34A]';
                    bgCls = 'bg-[#DCFCE7] dark:bg-[#14532D]';
                    textCls = 'text-[#14532D] dark:text-[#DCFCE7] font-semibold';
                    badgeCls = 'bg-[#16A34A] text-white';
                  } else if (isSelected) {
                    borderCls = 'border-2 border-[#DC2626]';
                    bgCls = 'bg-[#FEE2E2] dark:bg-[#7F1D1D]';
                    textCls = 'text-[#7F1D1D] dark:text-[#FEE2E2] font-semibold';
                    badgeCls = 'bg-[#DC2626] text-white';
                  } else {
                    borderCls = 'border-[#E2E8F0] dark:border-[#334155] opacity-75';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full text-left rounded-xl border ${borderCls} ${bgCls} px-3.5 py-3.5 flex items-center gap-3 transition-all ${
                      !isAnswered ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <span
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${badgeCls}`}
                    >
                      {OPTION_LABELS[idx] ?? idx + 1}
                    </span>
                    <span className={`flex-1 text-sm sm:text-base ${textCls}`}>
                      <MathRichText text={optionText} />
                    </span>
                    {isAnswered && isCorrect && (
                      <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0" />
                    )}
                    {isAnswered && isSelected && !isCorrect && (
                      <XCircle className="h-5 w-5 text-[#DC2626] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Step-by-step Explanation */}
            {isAnswered && (
              <div
                className={`rounded-xl border p-4 space-y-2 ${
                  isUserCorrect
                    ? 'bg-[#DCFCE7]/75 dark:bg-[#14532D]/70 border-[#16A34A]/50'
                    : 'bg-[#FEE2E2]/65 dark:bg-[#7F1D1D]/65 border-[#DC2626]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isUserCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0" />
                  ) : (
                    <Lightbulb className="h-5 w-5 text-[#DC2626] shrink-0" />
                  )}
                  <h4
                    className={`text-sm font-bold ${
                      isUserCorrect
                        ? 'text-[#14532D] dark:text-[#DCFCE7]'
                        : 'text-[#7F1D1D] dark:text-[#FEE2E2]'
                    }`}
                  >
                    {isUserCorrect
                      ? 'સાચો જવાબ! (+1)'
                      : `ખોટો જવાબ! સાચો વિકલ્પ ${OPTION_LABELS[question.correctIndex] ?? ''} છે`}
                  </h4>
                </div>

                <p className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  સમજૂતી (બધા સ્ટેપ સાથે):
                </p>

                <div className="space-y-1.5 text-sm text-[#0F172A] dark:text-[#F1F5F9]">
                  {question.explanation
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((stepLine, sIdx) => (
                      <div key={sIdx}>
                        <MathRichText text={stepLine} />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2.5 pt-1 pb-6">
              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    quizAudioPlayer.stopCurrent();
                    setCurrentIndex((prev) => prev - 1);
                  }}
                  className="h-12 px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-sm font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>પાછળ</span>
                </button>
              )}
              <button
                type="button"
                disabled={!isAnswered}
                onClick={handleNextOrFinish}
                className="flex-1 h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] dark:bg-[#2563EB] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-45 cursor-pointer"
              >
                <span>
                  {currentIndex < questions.length - 1 ? 'આગળનો પ્રશ્ન' : 'પરિણામ જુઓ'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </main>
        ) : (
          /* Result Summary Screen */
          <main className="max-w-[600px] mx-auto px-4 py-8 space-y-5">
            {(() => {
              const correctCount = questions.reduce(
                (cnt, q, i) => (selectedAnswers[i] === q.correctIndex ? cnt + 1 : cnt),
                0
              );
              const percent =
                questions.length > 0 ? Math.floor((correctCount * 100) / questions.length) : 0;
              const headline =
                percent >= 80
                  ? 'શાનદાર પ્રદર્શન!'
                  : percent >= 50
                    ? 'સારો પ્રયાસ!'
                    : 'વધુ મહાવરો કરો!';

              return (
                <>
                  <div className="rounded-3xl bg-[#DBEAFE] dark:bg-[#1E3A5F] p-7 text-center space-y-2.5">
                    <Trophy className="h-16 w-16 text-[#D97706] dark:text-[#FCD34D] mx-auto" />
                    <h2 className="text-2xl font-bold text-[#1E3A8A] dark:text-[#DBEAFE]">
                      {headline}
                    </h2>
                    <p className="text-xl font-extrabold text-[#1E3A8A] dark:text-white tabular-nums">
                      {correctCount} / {questions.length} સાચા જવાબ ({percent}%)
                    </p>
                    <p className="text-sm text-[#1E3A8A]/80 dark:text-[#DBEAFE]/80 tabular-nums">
                      લાગેલો સમય: {elapsedSeconds} સેકન્ડ
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      ફરી ક્વિઝ રમો
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        quizAudioPlayer.stopCurrent();
                        onExit();
                      }}
                      className="h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold transition-colors cursor-pointer"
                    >
                      ફોલ્ડરમાં જાઓ
                    </button>
                  </div>
                </>
              );
            })()}
          </main>
        )}
      </div>

      {/* Question Navigator Modal */}
      {showNavigatorDialog && !isFinished && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold">
              પ્રશ્ન પસંદ કરો ({questions.length} પ્રશ્નો)
            </h3>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-72 overflow-y-auto p-1">
              {questions.map((q, index) => {
                const ans = selectedAnswers[index];
                const isCur = index === currentIndex;
                let tileCls =
                  'bg-[#EFF4FA] dark:bg-[#0F172A] text-[#475569] dark:text-[#94A3B8]';
                if (ans !== undefined) {
                  tileCls =
                    ans === q.correctIndex
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-[#DC2626] text-white';
                }
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      quizAudioPlayer.stopCurrent();
                      setCurrentIndex(index);
                      setShowNavigatorDialog(false);
                    }}
                    className={`h-11 rounded-lg text-sm font-bold tabular-nums transition-transform hover:scale-105 cursor-pointer ${tileCls} ${
                      isCur ? 'ring-2 ring-[#1E3A8A] dark:ring-[#60A5FA]' : ''
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNavigatorDialog(false)}
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
