import React from 'react';
import { Check, CheckCircle2, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import type { QuizQuestion } from '../types/models';

const BLANK_TOKEN_REGEX = /(\{\{\d+\}\})/g;

export function isTapFillQuestion(question: QuizQuestion): boolean {
  return (
    question.questionMode === 'tap_fill_bank' ||
    question.questionMode === 'tap_fill_per_blank'
  );
}

export function getExpectedBlankAnswers(question: QuizQuestion): string[] {
  if (!question.blanks || question.blanks.length === 0) return [];
  return question.blanks.map((b) => b.correctAnswer);
}

export function normalizeBlankValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isBlankAnswerCorrect(
  userValue: string | null | undefined,
  expectedValue: string
): boolean {
  return normalizeBlankValue(userValue) === normalizeBlankValue(expectedValue);
}

interface TapToFillParagraphCardProps {
  question: QuizQuestion;
  selections: Array<string | null>;
  activeBlankIndex: number;
  isSubmitted: boolean;
  isLargeScreen?: boolean;
  onSelectBlankSlot: (blankIdx: number) => void;
}

export const TapToFillParagraphCard: React.FC<TapToFillParagraphCardProps> = ({
  question,
  selections,
  activeBlankIndex,
  isSubmitted,
  isLargeScreen = false,
  onSelectBlankSlot,
}) => {
  const blanks = question.blanks ?? [];
  const parts = question.questionText.split(BLANK_TOKEN_REGEX);

  return (
    <div className="space-y-3.5">
      {/* Optional Dialogue Block for Q.46 Indirect Narration */}
      {question.dialogueLines && question.dialogueLines.length > 0 && (
        <div
          data-testid="indirect_dialogue_box"
          className="rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A]/80 border-l-4 border-[#0F766E] dark:border-[#2DD4BF] border-y border-r border-[#CBD5E1] dark:border-[#334155] px-3.5 py-3 space-y-1.5"
        >
          {question.dialogueLines.map((line, idx) => (
            <p
              key={idx}
              className={`${
                isLargeScreen ? 'text-base' : 'text-sm sm:text-[15px]'
              } leading-relaxed text-[#0F172A] dark:text-[#F1F5F9]`}
            >
              <span className="font-extrabold text-[#0F766E] dark:text-[#5EEAD4]">
                {line.speaker}:
              </span>{' '}
              <span>{line.text}</span>
            </p>
          ))}
        </div>
      )}

      {/* Interactive Paragraph with Inline Tap-to-Fill Blanks */}
      <div
        data-testid="tap_fill_paragraph"
        className={`${
          isLargeScreen ? 'text-lg sm:text-xl' : 'text-[15px] sm:text-lg'
        } font-medium leading-[2.25] text-[#0F172A] dark:text-[#F8FAFC]`}
      >
        {parts.map((part, idx) => {
          const match = part.match(/^\{\{(\d+)\}\}$/);
          if (!match) {
            return <React.Fragment key={`txt_${idx}`}>{part}</React.Fragment>;
          }

          const blankIdx = Number(match[1]);
          const chosen = selections[blankIdx] ?? null;
          const expected = blanks[blankIdx]?.correctAnswer ?? '';
          const isActive = !isSubmitted && activeBlankIndex === blankIdx;

          if (isSubmitted) {
            const correct = isBlankAnswerCorrect(chosen, expected);
            if (correct) {
              return (
                <span
                  key={`b_${blankIdx}`}
                  data-testid={`tap_blank_result_${blankIdx}`}
                  className="inline-flex items-center gap-1 mx-1 px-2.5 py-0.5 rounded-lg bg-[#DCFCE7] dark:bg-[#14532D] border border-[#16A34A] text-[#14532D] dark:text-[#DCFCE7] font-bold align-baseline text-[0.94em]"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>{chosen}</span>
                </span>
              );
            }
            return (
              <span
                key={`b_${blankIdx}`}
                data-testid={`tap_blank_result_${blankIdx}`}
                className="inline-flex flex-wrap items-center gap-1 mx-1 align-baseline text-[0.94em]"
              >
                <span className="px-2 py-0.5 rounded-lg bg-[#FEE2E2] dark:bg-[#7F1D1D] border border-[#DC2626] text-[#991B1B] dark:text-[#FECACA] line-through font-semibold">
                  {chosen || '___'}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-[#DCFCE7] dark:bg-[#14532D] border border-[#16A34A] text-[#14532D] dark:text-[#DCFCE7] font-bold">
                  {expected}
                </span>
              </span>
            );
          }

          return (
            <button
              key={`b_${blankIdx}`}
              type="button"
              data-testid={`tap_blank_slot_${blankIdx}`}
              onClick={() => onSelectBlankSlot(blankIdx)}
              className={`inline-flex items-center gap-1.5 mx-1 px-2.5 py-0.5 min-h-[36px] rounded-lg align-baseline transition-all cursor-pointer font-bold text-[0.95em] ${
                chosen
                  ? isActive
                    ? 'bg-[#0F766E] text-white ring-2 ring-[#14B8A6] ring-offset-2 dark:ring-offset-[#1E293B]'
                    : 'bg-[#1E3A8A] dark:bg-[#2563EB] text-white hover:opacity-90'
                  : isActive
                    ? 'bg-[#CCFBF1] dark:bg-[#134E4A] border-2 border-[#0F766E] dark:border-[#2DD4BF] text-[#0F766E] dark:text-[#99F6E4] shadow-xs'
                    : 'bg-[#F1F5F9] dark:bg-[#0F172A] border-2 border-dashed border-[#94A3B8] dark:border-[#475569] text-[#475569] dark:text-[#94A3B8] hover:border-[#0F766E]'
              }`}
              title={
                chosen && question.questionMode === 'tap_fill_bank'
                  ? 'ખાલી કરવા ક્લિક કરો'
                  : `ખાલી જગ્યા ${blankIdx + 1}`
              }
            >
              <span
                className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[11px] font-extrabold tabular-nums ${
                  chosen
                    ? 'bg-white/25 text-white'
                    : isActive
                      ? 'bg-[#0F766E] text-white'
                      : 'bg-[#CBD5E1]/70 dark:bg-[#334155] text-[#334155] dark:text-[#CBD5E1]'
                }`}
              >
                {blankIdx + 1}
              </span>
              <span>{chosen ?? '________'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface TapToFillControlsPanelProps {
  question: QuizQuestion;
  selections: Array<string | null>;
  activeBlankIndex: number;
  isSubmitted: boolean;
  isTvOrSmartBoard?: boolean;
  onSelectBlankSlot: (blankIdx: number) => void;
  onPickWordFromBank: (word: string) => void;
  onPickPerBlankOption: (blankIdx: number, option: string) => void;
  onResetBlanks: () => void;
  onSubmitBlanks: () => void;
}

export const TapToFillControlsPanel: React.FC<TapToFillControlsPanelProps> = ({
  question,
  selections,
  activeBlankIndex,
  isSubmitted,
  isTvOrSmartBoard = false,
  onSelectBlankSlot,
  onPickWordFromBank,
  onPickPerBlankOption,
  onResetBlanks,
  onSubmitBlanks,
}) => {
  const blanks = question.blanks ?? [];
  const totalBlanks = blanks.length;
  const filledCount = selections.filter((v) => v !== null && v.trim().length > 0).length;
  const allFilled = totalBlanks > 0 && filledCount === totalBlanks;

  if (isSubmitted) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-3.5 space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#475569] dark:text-[#94A3B8]">
          દરેક ખાલી જગ્યાનું પરિણામ
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {blanks.map((spec, idx) => {
            const chosen = selections[idx] ?? '';
            const ok = isBlankAnswerCorrect(chosen, spec.correctAnswer);
            return (
              <div
                key={idx}
                className={`rounded-lg px-3 py-2 border flex items-center justify-between gap-2 text-xs sm:text-sm ${
                  ok
                    ? 'bg-[#DCFCE7]/70 dark:bg-[#14532D]/60 border-[#16A34A]/50 text-[#14532D] dark:text-[#DCFCE7]'
                    : 'bg-[#FEE2E2]/70 dark:bg-[#7F1D1D]/60 border-[#DC2626]/50 text-[#7F1D1D] dark:text-[#FEE2E2]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-extrabold tabular-nums">({idx + 1})</span>
                  {ok ? (
                    <span className="font-bold truncate">{spec.correctAnswer}</span>
                  ) : (
                    <span className="truncate">
                      <span className="line-through opacity-75 mr-1.5">{chosen || '—'}</span>
                      <span className="font-extrabold text-[#15803D] dark:text-[#86EFAC]">
                        → {spec.correctAnswer}
                      </span>
                    </span>
                  )}
                </div>
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#DC2626] shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isWordBankMode = question.questionMode === 'tap_fill_bank';
  const currentBlankSpec = blanks[activeBlankIndex] ?? blanks[0];
  const activeOptions = isWordBankMode
    ? question.wordBank ?? []
    : currentBlankSpec?.options ?? [];

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] p-4 space-y-3.5 shadow-xs">
      {/* Blank Selector Stepper Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {blanks.map((_, idx) => {
            const isFilled = Boolean(selections[idx]);
            const isAct = idx === activeBlankIndex;
            return (
              <button
                key={idx}
                type="button"
                data-testid={`blank_tab_${idx}`}
                onClick={() => onSelectBlankSlot(idx)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer tabular-nums ${
                  isAct
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : isFilled
                      ? 'bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD]'
                      : 'bg-[#F1F5F9] dark:bg-[#0F172A] text-[#475569] dark:text-[#94A3B8] border border-[#CBD5E1] dark:border-[#334155]'
                }`}
              >
                <span>ખાલી જગ્યા {idx + 1}</span>
                {isFilled && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>

        {filledCount > 0 && (
          <button
            type="button"
            data-testid="tap_fill_reset_btn"
            onClick={onResetBlanks}
            className="min-h-[38px] px-2.5 rounded-lg text-xs font-bold text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>રીસેટ</span>
          </button>
        )}
      </div>

      {/* Helper Prompt */}
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#0F766E] dark:text-[#5EEAD4]">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          {isWordBankMode
            ? `ખાલી જગ્યા ${activeBlankIndex + 1} ભરવા નીચેના 3 શબ્દોમાંથી ક્લિક કરો:`
            : `ખાલી જગ્યા ${activeBlankIndex + 1} માટે કૌંસના 3 વિકલ્પમાંથી પસંદ કરો:`}
        </span>
      </div>

      {/* Exactly 3 Tap-to-Fill Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {activeOptions.map((word, optIdx) => {
          const placedBlankIndex = isWordBankMode
            ? selections.findIndex((s) => s === word)
            : selections[activeBlankIndex] === word
              ? activeBlankIndex
              : -1;
          const isUsed = placedBlankIndex !== -1;

          return (
            <button
              key={`${word}_${optIdx}`}
              type="button"
              data-testid={`tap_fill_option_${optIdx}`}
              onClick={() => {
                if (isWordBankMode) {
                  onPickWordFromBank(word);
                } else {
                  onPickPerBlankOption(activeBlankIndex, word);
                }
              }}
              className={`${
                isTvOrSmartBoard ? 'min-h-[58px]' : 'min-h-[50px]'
              } px-4 py-2.5 rounded-xl border-2 text-sm sm:text-base font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isUsed
                  ? isWordBankMode
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A5F]/50 border-[#93C5FD] dark:border-[#3B82F6]/50 text-[#1E40AF] dark:text-[#93C5FD]'
                    : 'bg-[#0F766E] border-[#0F766E] text-white shadow-xs'
                  : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-[#475569] hover:border-[#0F766E] hover:bg-[#F0FDFA] dark:hover:bg-[#134E4A]/40 text-[#0F172A] dark:text-[#F8FAFC]'
              }`}
            >
              <span>{word}</span>
              {isUsed && isWordBankMode && (
                <span className="rounded-md bg-[#1E3A8A] text-white text-[10px] font-extrabold px-1.5 py-0.5 tabular-nums">
                  #{placedBlankIndex + 1}
                </span>
              )}
              {isUsed && !isWordBankMode && <Check className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Submit Check Answer Button */}
      <button
        type="button"
        data-testid="tap_fill_check_btn"
        disabled={!allFilled}
        onClick={onSubmitBlanks}
        className={`w-full ${
          isTvOrSmartBoard ? 'min-h-[54px]' : 'min-h-[48px]'
        } rounded-xl bg-[#0F766E] hover:bg-[#115E59] disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-500 dark:disabled:text-slate-400 text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed`}
      >
        <CheckCircle2 className="h-5 w-5" />
        <span>
          {allFilled
            ? 'જવાબ ચકાસો (Check Answer)'
            : `બધી ${totalBlanks} ખાલી જગ્યા ભરો (${filledCount}/${totalBlanks})`}
        </span>
      </button>
    </div>
  );
};
