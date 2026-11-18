import type { QuizChapter, QuizQuestion, QuizSubject } from '../../types/models';

export const BOARD_MOCK_QUESTION_COUNT = 24;

/**
 * Extracts all 1..24 board question slot numbers represented by a chapter's `chapterNumber`.
 * Handles single labels like "પ્રશ્ન 1" and merged ranges like "પ્રશ્ન 21/22" or "પ્રશ્ન 23-24".
 */
export function parseChapterSlotNumbers(chapterNumber: string): number[] {
  const matches = chapterNumber.match(/\d+/g);
  if (!matches || matches.length === 0) return [];
  const nums = matches.map((m) => Number(m)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 24);
  if (nums.length === 2 && /[/-]/.test(chapterNumber)) {
    const start = Math.min(nums[0], nums[1]);
    const end = Math.max(nums[0], nums[1]);
    const range: number[] = [];
    for (let s = start; s <= end; s++) {
      range.push(s);
    }
    return range;
  }
  return Array.from(new Set(nums));
}

const LEADING_QUESTION_NUMBER_REGEX = /^\s*\d+\)\s*/;

export function normalizeMockQuestionText(rawText: string, slotNumber: number): string {
  const trimmed = rawText.trim();
  if (LEADING_QUESTION_NUMBER_REGEX.test(trimmed)) {
    return trimmed.replace(LEADING_QUESTION_NUMBER_REGEX, `${slotNumber}) `);
  }
  return `${slotNumber}) ${trimmed}`;
}

/**
 * Builds an ordered 1..24 Board Exam Mock Test for a subject folder.
 * Every slot i in 1..24 picks 1 random question from that slot's chapter,
 * keeps questions strictly in 1 -> 24 sequential order, and avoids duplicates
 * in merged multi-slot chapters (e.g. પ્રશ્ન 21/22, પ્રશ્ન 23/24).
 */
export function buildBoardExamMockTestChapter(
  subject: QuizSubject,
  rng: () => number = Math.random
): QuizChapter {
  const slotMap = new Map<number, Array<{ chapter: QuizChapter; question: QuizQuestion }>>();
  for (let slot = 1; slot <= BOARD_MOCK_QUESTION_COUNT; slot++) {
    slotMap.set(slot, []);
  }

  for (const chapter of subject.chapters) {
    if (chapter.isMockTest) continue;
    const slots = parseChapterSlotNumbers(chapter.chapterNumber);
    for (const slot of slots) {
      const bucket = slotMap.get(slot);
      if (!bucket) continue;
      for (const question of chapter.questions) {
        bucket.push({ chapter, question });
      }
    }
  }

  const usedQuestionIds = new Set<string>();
  const mockQuestions: QuizQuestion[] = [];

  for (let slot = 1; slot <= BOARD_MOCK_QUESTION_COUNT; slot++) {
    const allCandidates = slotMap.get(slot) ?? [];
    if (allCandidates.length === 0) continue;

    const unusedCandidates = allCandidates.filter((item) => !usedQuestionIds.has(item.question.id));
    const pool = unusedCandidates.length > 0 ? unusedCandidates : allCandidates;
    const pickedIdx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    const picked = pool[pickedIdx];
    usedQuestionIds.add(picked.question.id);

    mockQuestions.push({
      ...picked.question,
      id: `mock_${subject.id}_slot_${slot}_${picked.question.id}`,
      options: [...picked.question.options],
      questionText: normalizeMockQuestionText(picked.question.questionText, slot),
      sourceLabel: `બોર્ડ ક્રમ ${slot}/${BOARD_MOCK_QUESTION_COUNT} • ${picked.chapter.title}`,
    });
  }

  return {
    id: `mock_test_${subject.id}`,
    subjectId: subject.id,
    chapterNumber: 'પ્રશ્ન 1 થી 24',
    title: 'બોર્ડ પરીક્ષા મોક ટેસ્ટ',
    subtitle: `${subject.title} • દર વખતે પ્રશ્ન 1 થી 24 ક્રમમાં નવા રેન્ડમ પ્રશ્નો`,
    questions: mockQuestions,
    questionTypeLabel: 'બોર્ડ મોક ટેસ્ટ (24 ગુણ)',
    isFreeUnlocked: false,
    isMockTest: true,
  };
}
