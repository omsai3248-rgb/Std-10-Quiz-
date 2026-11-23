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
  if (subject.id === 'gujarati') {
    const eligibleChapters = subject.chapters.filter((c) => !c.isMockTest && c.questions.length > 0);
    const totalCount = eligibleChapters.length;
    const mockQuestions: QuizQuestion[] = eligibleChapters.map((chapter, idx) => {
      const pickedIdx = Math.min(
        chapter.questions.length - 1,
        Math.floor(rng() * chapter.questions.length)
      );
      const picked = chapter.questions[pickedIdx];
      return {
        ...picked,
        id: `mock_gujarati_ch_${idx + 1}_${picked.id}`,
        options: [...picked.options],
        questionText: normalizeMockQuestionText(picked.questionText, idx + 1),
        sourceLabel: `${chapter.chapterNumber} (${idx + 1}/${totalCount}) • ${chapter.title}`,
      };
    });

    return {
      id: `mock_test_${subject.id}`,
      subjectId: subject.id,
      chapterNumber: 'વિભાગ A, B અને C (વ્યાકરણ)',
      title: 'બોર્ડ પરીક્ષા મોક ટેસ્ટ',
      subtitle: `${subject.title} • દરેક વખતે વિભાગ A, B અને વ્યાકરણના ${totalCount} પ્રશ્ન વિભાગમાંથી નવા રેન્ડમ પ્રશ્નો`,
      questions: mockQuestions,
      questionTypeLabel: `બોર્ડ મોક ટેસ્ટ (${totalCount} પ્રશ્નો)`,
      isFreeUnlocked: false,
      isMockTest: true,
    };
  }

  if (subject.id === 'hindi') {
    const eligibleChapters = subject.chapters.filter((c) => !c.isMockTest && c.questions.length > 0);
    const mockQuestions: QuizQuestion[] = [];

    for (const chapter of eligibleChapters) {
      const slotNumbers = (chapter.chapterNumber.match(/\d+/g) ?? [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n));
      const slotsToPick = slotNumbers.length > 0 ? slotNumbers : [mockQuestions.length + 29];
      const usedLocal = new Set<string>();

      for (const slotNum of slotsToPick) {
        const unused = chapter.questions.filter((q) => !usedLocal.has(q.id));
        const pool = unused.length > 0 ? unused : chapter.questions;
        const pickedIdx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
        const picked = pool[pickedIdx];
        usedLocal.add(picked.id);

        mockQuestions.push({
          ...picked,
          id: `mock_hindi_q${slotNum}_${picked.id}`,
          options: [...picked.options],
          questionText: normalizeMockQuestionText(picked.questionText, slotNum),
          sourceLabel: `प्रश्न क्र. ${slotNum} • ${chapter.title}`,
        });
      }
    }

    return {
      id: `mock_test_${subject.id}`,
      subjectId: subject.id,
      chapterNumber: 'विभाग - C • प्रश्न क्र. 29 से 45',
      title: 'બોર્ડ પરીક્ષા મોક ટેસ્ટ (विभाग - C व्याकरण)',
      subtitle: `${subject.title} • દરેક વખતે પ્રશ્ન ક્ર. 29 થી 45 ક્રમમાં નવા રેન્ડમ વ્યાકરણ પ્રશ્નો (18 ગુણ)`,
      questions: mockQuestions,
      questionTypeLabel: `બોર્ડ મોક ટેસ્ટ (${mockQuestions.length} પ્રશ્નો • 18 ગુણ)`,
      isFreeUnlocked: false,
      isMockTest: true,
    };
  }

  if (subject.id === 'english') {
    const englishBlueprint: Array<{ chapterId: string; count: number; slotLabels: string[] }> = [
      { chapterId: 'eng_q12_15', count: 4, slotLabels: ['Q.12', 'Q.13', 'Q.14', 'Q.15'] },
      { chapterId: 'eng_q33_35', count: 1, slotLabels: ['Q.33–35'] },
      { chapterId: 'eng_q36_38', count: 3, slotLabels: ['Q.36', 'Q.37', 'Q.38'] },
      { chapterId: 'eng_q39_41', count: 3, slotLabels: ['Q.39', 'Q.40', 'Q.41'] },
      { chapterId: 'eng_q42', count: 1, slotLabels: ['Q.42'] },
      { chapterId: 'eng_q43_45', count: 3, slotLabels: ['Q.43', 'Q.44', 'Q.45'] },
      { chapterId: 'eng_q46', count: 1, slotLabels: ['Q.46'] },
      { chapterId: 'eng_q47_49', count: 3, slotLabels: ['Q.47', 'Q.48', 'Q.49'] },
      { chapterId: 'eng_q50', count: 1, slotLabels: ['Q.50'] },
      { chapterId: 'eng_q53_55', count: 3, slotLabels: ['Q.53', 'Q.54', 'Q.55'] },
    ];

    const chapterById = new Map(subject.chapters.map((c) => [c.id, c]));
    const mockQuestions: QuizQuestion[] = [];

    for (const slot of englishBlueprint) {
      const ch = chapterById.get(slot.chapterId);
      if (!ch || ch.questions.length === 0) continue;
      const usedLocal = new Set<string>();
      for (let i = 0; i < slot.count; i++) {
        const unused = ch.questions.filter((q) => !usedLocal.has(q.id));
        const pool = unused.length > 0 ? unused : ch.questions;
        const pickedIdx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
        const picked = pool[pickedIdx];
        usedLocal.add(picked.id);

        const label = slot.slotLabels[i] ?? ch.chapterNumber;
        mockQuestions.push({
          ...picked,
          id: `mock_english_${slot.chapterId}_${i}_${picked.id}`,
          options: [...picked.options],
          wordBank: picked.wordBank ? [...picked.wordBank] : undefined,
          blanks: picked.blanks ? picked.blanks.map((b) => ({ ...b, options: [...b.options] })) : undefined,
          dialogueLines: picked.dialogueLines ? picked.dialogueLines.map((d) => ({ ...d })) : undefined,
          sourceLabel: `${label} • ${ch.title}`,
        });
      }
    }

    return {
      id: `mock_test_${subject.id}`,
      subjectId: subject.id,
      chapterNumber: 'Section A, C & D • Q.12 to Q.55',
      title: 'બોર્ડ પરીક્ષા મોક ટેસ્ટ (English SL)',
      subtitle: `${subject.title} • દરેક વખતે Q.12 થી Q.55 ક્રમમાં નવા રેન્ડમ પ્રશ્નો (True/False, Table, MCQ & Tap-to-Fill)`,
      questions: mockQuestions,
      questionTypeLabel: `બોર્ડ મોક ટેસ્ટ (${mockQuestions.length} પ્રશ્નો)`,
      isFreeUnlocked: false,
      isMockTest: true,
    };
  }

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
