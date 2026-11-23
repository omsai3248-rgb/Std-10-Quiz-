import React from 'react';
import { MathRichText } from './MathRichText';

export interface MatchingColumnItem {
  label: string;
  text: string;
}

export interface ParsedMatchingQuestion {
  header: string;
  colATitle: string;
  colBTitle: string;
  colA: MatchingColumnItem[];
  colB: MatchingColumnItem[];
}

const SECTION_A_REGEX = /^(વિભાગ|Column)\s*A(?:\s*\(([^)]+)\))?\s*:\s*(.+)$/i;
const SECTION_B_REGEX = /^(વિભાગ|Column)\s*B(?:\s*\(([^)]+)\))?\s*:\s*(.+)$/i;
const LEFT_ITEM_PREFIX_REGEX = /^(\d+[.)])\s*(.+)$/;
const RIGHT_ITEM_PREFIX_REGEX = /^(\([^)]+\)|[a-zA-Z][.)])\s*(.+)$/;

function parseSectionItems(raw: string, side: 'left' | 'right'): MatchingColumnItem[] {
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, idx) => {
      if (side === 'left') {
        const match = part.match(LEFT_ITEM_PREFIX_REGEX);
        if (match) {
          return { label: match[1], text: match[2].trim() };
        }
        return { label: `${idx + 1}.`, text: part };
      }
      const match = part.match(RIGHT_ITEM_PREFIX_REGEX);
      if (match) {
        return { label: match[1], text: match[2].trim() };
      }
      const fallbackLetter = String.fromCharCode(97 + idx);
      return { label: `(${fallbackLetter})`, text: part };
    });
}

/**
 * Parses matching-pair ("જોડકા") questions into structured Table columns
 * when the question text contains explicit "વિભાગ A:" / "Column A:" and "વિભાગ B:" / "Column B:" rows.
 */
export function parseMatchingPairQuestion(questionText: string): ParsedMatchingQuestion | null {
  const lines = questionText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const secAIdx = lines.findIndex((line) => SECTION_A_REGEX.test(line));
  const secBIdx = lines.findIndex((line) => SECTION_B_REGEX.test(line));
  if (secAIdx === -1 || secBIdx === -1 || secBIdx <= secAIdx) return null;

  const matchA = lines[secAIdx].match(SECTION_A_REGEX);
  const matchB = lines[secBIdx].match(SECTION_B_REGEX);
  if (!matchA || !matchB) return null;

  const isEnglishColumn = matchA[1].toLowerCase() === 'column';
  const colA = parseSectionItems(matchA[3], 'left');
  const colB = parseSectionItems(matchB[3], 'right');
  if (colA.length === 0 || colB.length === 0) return null;

  const headerLines = lines.slice(0, secAIdx);
  const header =
    headerLines.join(' ').trim() ||
    (isEnglishColumn
      ? 'Match the language functions with proper sentences:'
      : 'નીચેના જોડકા જોડો:');

  const colATitle = isEnglishColumn
    ? matchA[2]?.trim()
      ? `Column A (${matchA[2].trim()})`
      : 'Column A'
    : matchA[2]?.trim()
      ? `‘અ’ (${matchA[2].trim()})`
      : 'વિભાગ A';

  const colBTitle = isEnglishColumn
    ? matchB[2]?.trim()
      ? `Column B (${matchB[2].trim()})`
      : 'Column B'
    : matchB[2]?.trim()
      ? `‘બ’ (${matchB[2].trim()})`
      : 'વિભાગ B';

  return {
    header,
    colATitle,
    colBTitle,
    colA,
    colB,
  };
}

interface MatchingTableCardProps {
  parsed: ParsedMatchingQuestion;
  isLargeScreen?: boolean;
  plainText?: boolean;
}

export const MatchingTableCard: React.FC<MatchingTableCardProps> = ({
  parsed,
  isLargeScreen = false,
  plainText = false,
}) => {
  const rowCount = Math.max(parsed.colA.length, parsed.colB.length);

  return (
    <div className="space-y-3">
      <div
        className={`${
          isLargeScreen ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
        } font-semibold leading-relaxed text-[#0F172A] dark:text-[#F8FAFC]`}
      >
        <MathRichText text={parsed.header} plainText={plainText} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]/75 shadow-xs">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#DBEAFE]/80 dark:bg-[#1E3A5F]/90 border-b border-[#CBD5E1] dark:border-[#334155]">
              <th
                scope="col"
                className="w-[52%] px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-extrabold text-[#1E3A8A] dark:text-[#DBEAFE]"
              >
                {parsed.colATitle}
              </th>
              <th
                scope="col"
                className="w-[48%] px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-extrabold text-[#1E3A8A] dark:text-[#DBEAFE] border-l border-[#CBD5E1] dark:border-[#334155]"
              >
                {parsed.colBTitle}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#334155]">
            {Array.from({ length: rowCount }).map((_, idx) => {
              const left = parsed.colA[idx];
              const right = parsed.colB[idx];
              return (
                <tr
                  key={idx}
                  className={
                    idx % 2 === 0
                      ? 'bg-white dark:bg-[#1E293B]'
                      : 'bg-[#F8FAFC]/90 dark:bg-[#162032]'
                  }
                >
                  <td className="px-3 sm:px-4 py-2.5 align-top text-xs sm:text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                    {left ? (
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-[#DBEAFE] dark:bg-[#1E3A5F] text-[#1E3A8A] dark:text-[#93C5FD] text-xs font-extrabold shrink-0 mt-0.5 tabular-nums">
                          {left.label}
                        </span>
                        <span className="leading-relaxed">
                          <MathRichText text={left.text} plainText={plainText} />
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 align-top text-xs sm:text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] border-l border-[#E2E8F0] dark:border-[#334155]">
                    {right ? (
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md bg-[#E0E7FF] dark:bg-[#312E81] text-[#3730A3] dark:text-[#C7D2FE] text-xs font-extrabold shrink-0 mt-0.5">
                          {right.label}
                        </span>
                        <span className="leading-relaxed">
                          <MathRichText text={right.text} plainText={plainText} />
                        </span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
