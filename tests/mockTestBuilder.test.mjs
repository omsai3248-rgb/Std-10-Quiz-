import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
  };
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'std10-mock-test-'));
const esbuildBin = path.resolve('node_modules/.bin/esbuild');

function bundleTsModule(entryRelPath, outName) {
  const outFile = path.join(tmpDir, outName);
  execFileSync(
    esbuildBin,
    [
      path.resolve(entryRelPath),
      '--bundle',
      '--format=esm',
      '--platform=browser',
      '--loader:.tsx=tsx',
      `--outfile=${outFile}`,
    ],
    { stdio: 'pipe' }
  );
  return import(pathToFileURL(outFile).href);
}

const curriculumMod = await bundleTsModule('src/data/curriculum/std10Curriculum.ts', 'std10Curriculum.mjs');
const mockBuilderMod = await bundleTsModule('src/data/curriculum/mockTestBuilder.ts', 'mockTestBuilder.mjs');
const matchingParserMod = await bundleTsModule(
  'src/components/MatchingTableCard.tsx',
  'matchingTableCard.mjs'
);
const syncManagerMod = await bundleTsModule('src/services/syncManager.ts', 'syncManager.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('parseChapterSlotNumbers parses single and merged board question slots accurately', () => {
  assert.deepEqual(mockBuilderMod.parseChapterSlotNumbers('પ્રશ્ન 1'), [1]);
  assert.deepEqual(mockBuilderMod.parseChapterSlotNumbers('પ્રશ્ન 21/22'), [21, 22]);
  assert.deepEqual(mockBuilderMod.parseChapterSlotNumbers('પ્રશ્ન 23-24'), [23, 24]);
});

test('buildBoardExamMockTestChapter builds strictly ordered 1..24 questions for maths, science, and social_science with no duplicates', async () => {
  for (const subjectId of ['maths', 'science', 'social_science']) {
    const subject = await curriculumMod.loadSubjectWithChapters(subjectId);
    const mockChapter = mockBuilderMod.buildBoardExamMockTestChapter(subject);

    assert.equal(mockChapter.isMockTest, true);
    assert.equal(mockChapter.id, `mock_test_${subjectId}`);
    assert.equal(
      mockChapter.questions.length,
      24,
      `${subjectId} mock test must contain exactly 24 questions`
    );

    const underlyingIds = new Set();
    mockChapter.questions.forEach((q, idx) => {
      const slotNum = idx + 1;
      assert.ok(
        q.questionText.startsWith(`${slotNum}) `),
        `${subjectId} question #${slotNum} should start with "${slotNum}) ", got: ${q.questionText.slice(0, 30)}`
      );
      const rawId = q.id.replace(`mock_${subjectId}_slot_${slotNum}_`, '');
      assert.equal(
        underlyingIds.has(rawId),
        false,
        `${subjectId} should not pick duplicate underlying question ${rawId} across slots`
      );
      underlyingIds.add(rawId);
    });
  }
});

test('buildBoardExamMockTestChapter picks different random questions across runs while staying in 1..24 order', async () => {
  const maths = await curriculumMod.loadSubjectWithChapters('maths');
  const seenSignatures = new Set();
  for (let run = 0; run < 6; run++) {
    const mock = mockBuilderMod.buildBoardExamMockTestChapter(maths);
    const sig = mock.questions.map((q, idx) => q.id.replace(`mock_maths_slot_${idx + 1}_`, '')).join(',');
    seenSignatures.add(sig);
    mock.questions.forEach((q, idx) => {
      assert.ok(q.questionText.startsWith(`${idx + 1}) `));
    });
  }
  assert.ok(seenSignatures.size >= 2, 'Multiple mock runs should produce randomized question selections');
});

test('parseMatchingPairQuestion parses all Science Jodka (21/22 and 23/24) questions cleanly into Table columns, even after 1..24 renumbering', async () => {
  const science = await curriculumMod.loadSubjectWithChapters('science');
  const jodkaChapters = science.chapters.filter(
    (ch) => ch.chapterNumber.includes('21') || ch.chapterNumber.includes('23')
  );
  assert.ok(jodkaChapters.length >= 2);

  for (const ch of jodkaChapters) {
    for (const q of ch.questions) {
      const parsedRaw = matchingParserMod.parseMatchingPairQuestion(q.questionText);
      assert.ok(parsedRaw, `Expected ${q.id} to parse as matching table`);
      assert.ok(parsedRaw.colA.length >= 2, `${q.id} colA should have >= 2 rows`);
      assert.ok(parsedRaw.colB.length >= 2, `${q.id} colB should have >= 2 rows`);

      const slot = ch.chapterNumber.includes('21') ? 21 : 23;
      const normalizedText = mockBuilderMod.normalizeMockQuestionText(q.questionText, slot);
      const parsedNormalized = matchingParserMod.parseMatchingPairQuestion(normalizedText);
      assert.ok(parsedNormalized, `Expected normalized mock ${q.id} to parse as matching table`);
      assert.ok(parsedNormalized.header.startsWith(`${slot}) `));
      assert.equal(parsedNormalized.colA.length, parsedRaw.colA.length);
      assert.equal(parsedNormalized.colB.length, parsedRaw.colB.length);
    }
  }
});

test('mergeStudentProfilesConflictSafe preserves union of freeMockUsedSubjects across devices/offline merges', () => {
  const combined = syncManagerMod.mergeStudentProfilesConflictSafe(
    {
      id: 'mob_1',
      userId: 'mob_1',
      fullName: 'Dev',
      mobileNumber: '9876543210',
      email: '',
      standard: 'ધોરણ 10',
      hasQuizAccess: false,
      redeemedCode: '',
      paymentStatus: 'none',
      totalQuizzesTaken: 1,
      bestScorePercent: 70,
      unlockedSubjects: [],
      freeMockUsedSubjects: ['maths'],
      paymentRequestIds: [],
      createdAt: null,
      updatedAt: null,
    },
    {
      id: 'mob_1',
      userId: 'mob_1',
      fullName: 'Dev',
      mobileNumber: '9876543210',
      email: '',
      standard: 'ધોરણ 10',
      hasQuizAccess: false,
      redeemedCode: '',
      paymentStatus: 'none',
      totalQuizzesTaken: 2,
      bestScorePercent: 80,
      unlockedSubjects: [],
      freeMockUsedSubjects: ['science'],
      paymentRequestIds: [],
      createdAt: null,
      updatedAt: null,
    }
  );
  assert.deepEqual(combined.freeMockUsedSubjects.sort(), ['maths', 'science']);
});

test('Gujarati curriculum has 2 sub-folders (Vibhag A+B combined & Vyakaran separate), 30 chapters, 602 complete MCQs, and valid Jodka tables', async () => {
  const gujarati = await curriculumMod.loadSubjectWithChapters('gujarati');
  assert.equal(gujarati.id, 'gujarati');
  assert.equal(gujarati.chapters.length, 30);

  const vibhagAB = gujarati.chapters.filter((c) => c.folderGroupId === 'guj_vibhag_ab');
  const vyakaran = gujarati.chapters.filter((c) => c.folderGroupId === 'guj_vyakaran');
  assert.equal(vibhagAB.length, 10, 'Vibhag A + B combined folder should contain 10 question folders');
  assert.equal(vyakaran.length, 20, 'Vyakaran folder should contain 20 question folders (Q33-Q52)');

  const totalQuestions = gujarati.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
  assert.equal(totalQuestions, 602, 'Gujarati subject should contain all 602 PDF questions');

  const seenIds = new Set();
  let matchingParsedCount = 0;

  for (const ch of gujarati.chapters) {
    assert.ok(ch.chapterNumber.trim().length > 0);
    assert.ok(ch.title.trim().length > 0);
    assert.ok(ch.questions.length > 0);

    for (const q of ch.questions) {
      assert.equal(seenIds.has(q.id), false, `Duplicate question id: ${q.id}`);
      seenIds.add(q.id);
      assert.ok(q.questionText.trim().length > 0, `Empty questionText in ${q.id}`);
      assert.ok(
        q.options.length >= 3 && q.options.length <= 4,
        `${q.id} must have 3 or 4 MCQ options, got ${q.options.length}`
      );
      assert.ok(
        Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length,
        `Invalid correctIndex in ${q.id}`
      );
      for (const opt of q.options) {
        assert.ok(opt.trim().length > 0, `Empty option in ${q.id}`);
      }
      assert.ok(q.explanation.trim().length > 10, `Missing explanation in ${q.id}`);

      if (q.questionText.includes('વિભાગ A')) {
        const parsed = matchingParserMod.parseMatchingPairQuestion(q.questionText);
        assert.ok(parsed, `Expected Gujarati Jodka ${q.id} to parse cleanly into table columns`);
        assert.ok(parsed.colA.length >= 2, `${q.id} colA should have >= 2 items`);
        assert.ok(parsed.colB.length >= 3, `${q.id} colB should have >= 3 items`);
        matchingParsedCount += 1;
      }
    }
  }

  assert.equal(matchingParsedCount, 16, 'Expected 7 Vibhag A + 7 Vibhag B + 2 Q45 Jodka tables');

  const mock = mockBuilderMod.buildBoardExamMockTestChapter(gujarati);
  assert.equal(mock.isMockTest, true);
  assert.equal(mock.questions.length, 30);
  mock.questions.forEach((q, idx) => {
    assert.ok(q.questionText.startsWith(`${idx + 1}) `));
  });
});

test('Hindi curriculum has 11 Section C Vyakaran folders (Q29-Q45), 158 complete MCQs with explanations, and ordered 17-question board mock test', async () => {
  const hindi = await curriculumMod.loadSubjectWithChapters('hindi');
  assert.equal(hindi.id, 'hindi');
  assert.equal(hindi.chapters.length, 11);

  const expectedChapterCounts = [
    ['प्रश्न क्र. 29', 4],
    ['प्रश्न क्र. 30', 10],
    ['प्रश्न क्र. 31', 21],
    ['प्रश्न क्र. 32', 4],
    ['प्रश्न क्र. 33', 13],
    ['प्रश्न क्र. 34, 35', 22],
    ['प्रश्न क्र. 36, 37', 19],
    ['प्रश्न क्र. 38, 39', 19],
    ['प्रश्न क्र. 40, 41', 13],
    ['प्रश्न क्र. 42, 43', 19],
    ['प्रश्न क्र. 44, 45', 14],
  ];

  const totalQuestions = hindi.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
  assert.equal(totalQuestions, 158, 'Hindi subject should contain all 158 PDF questions');

  const seenIds = new Set();
  hindi.chapters.forEach((ch, idx) => {
    const [expectedNum, expectedLen] = expectedChapterCounts[idx];
    assert.equal(ch.chapterNumber, expectedNum);
    assert.equal(ch.questions.length, expectedLen, `Mismatch in ${ch.id}`);
    assert.ok(ch.title.startsWith(`${idx + 1}. `));

    ch.questions.forEach((q, qIdx) => {
      assert.equal(seenIds.has(q.id), false, `Duplicate question id: ${q.id}`);
      seenIds.add(q.id);
      assert.ok(
        q.questionText.startsWith(`${qIdx + 1}) `),
        `Question order mismatch in ${q.id}: ${q.questionText}`
      );
      assert.equal(q.options.length, 3, `${q.id} should preserve all 3 PDF options`);
      assert.ok(
        Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length,
        `Invalid correctIndex in ${q.id}`
      );
      for (const opt of q.options) {
        assert.ok(opt.trim().length > 0, `Empty option in ${q.id}`);
      }
      assert.ok(q.explanation.trim().length > 15, `Missing Hindi explanation in ${q.id}`);
    });
  });

  const mock = mockBuilderMod.buildBoardExamMockTestChapter(hindi);
  assert.equal(mock.isMockTest, true);
  assert.equal(mock.questions.length, 17, 'Hindi Section C mock test should have 17 questions (Q29-Q45)');
  mock.questions.forEach((q, idx) => {
    assert.ok(q.questionText.startsWith(`${29 + idx}) `), `Expected Q${29 + idx}, got ${q.questionText}`);
  });
});

test('English subject is placed 4th and satisfies all 6 PDF quiz rules across 10 sections (434 items) and board mock test', async () => {
  const subjectIds = curriculumMod.std10SubjectMetas.map((m) => m.id);
  assert.equal(subjectIds[3], 'english', `English must be 4th subject (index 3), got: ${subjectIds.join(', ')}`);

  const english = await curriculumMod.loadSubjectWithChapters('english');
  assert.equal(english.id, 'english');
  assert.equal(english.chapters.length, 10);

  const expectedSections = [
    ['eng_q12_15', 48],
    ['eng_q33_35', 15],
    ['eng_q36_38', 46],
    ['eng_q39_41', 46],
    ['eng_q42', 45],
    ['eng_q43_45', 48],
    ['eng_q46', 45],
    ['eng_q47_49', 48],
    ['eng_q50', 45],
    ['eng_q53_55', 48],
  ];

  const totalQuestions = english.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
  assert.equal(totalQuestions, 434, 'English subject should contain all 434 PDF questions');

  const seenIds = new Set();
  english.chapters.forEach((ch, idx) => {
    const [expectedId, expectedLen] = expectedSections[idx];
    assert.equal(ch.id, expectedId, `Expected chapter ${expectedId} at index ${idx}, got ${ch.id}`);
    assert.equal(ch.questions.length, expectedLen, `Question count mismatch in ${ch.id}`);
    assert.ok(ch.chapterNumber.trim().length > 0);
    assert.ok(ch.title.trim().length > 0);

    for (const q of ch.questions) {
      assert.equal(seenIds.has(q.id), false, `Duplicate English question id: ${q.id}`);
      seenIds.add(q.id);
      assert.ok(q.questionText.trim().length > 0, `Empty questionText in ${q.id}`);
      assert.ok(q.explanation.trim().length > 10, `Missing explanation in ${q.id}`);

      if (ch.id === 'eng_q12_15') {
        // Rule 1: Exactly 2 options (True, False)
        assert.deepEqual(q.options, ['True', 'False'], `${q.id} must have exactly ['True', 'False']`);
        assert.ok(q.correctIndex === 0 || q.correctIndex === 1, `Invalid correctIndex in ${q.id}`);
      } else if (ch.id === 'eng_q33_35') {
        // Rule 2: Column A & Column B table + 4 MCQ options
        const parsed = matchingParserMod.parseMatchingPairQuestion(q.questionText);
        assert.ok(parsed, `Expected ${q.id} to parse into Column A / Column B table`);
        assert.equal(parsed.colA.length, 3, `${q.id} Column A must have 3 rows`);
        assert.equal(parsed.colB.length, 4, `${q.id} Column B must have 4 rows`);
        assert.equal(q.options.length, 4, `${q.id} must have 4 MCQ options`);
        assert.ok(q.correctIndex >= 0 && q.correctIndex < 4, `Invalid correctIndex in ${q.id}`);
      } else if (
        ch.id === 'eng_q36_38' ||
        ch.id === 'eng_q39_41' ||
        ch.id === 'eng_q43_45' ||
        ch.id === 'eng_q53_55'
      ) {
        // Rule 3: Exact 4 MCQ options from PDF
        assert.equal(q.options.length, 4, `${q.id} must have 4 MCQ options`);
        assert.ok(q.correctIndex >= 0 && q.correctIndex < 4, `Invalid correctIndex in ${q.id}`);
        for (const opt of q.options) {
          assert.ok(opt.trim().length > 0, `Empty option in ${q.id}`);
        }
        if (ch.id === 'eng_q53_55') {
          assert.ok(
            q.questionText.includes('[[u]]') && q.questionText.includes('[[/u]]'),
            `${q.id} should include [[u]]...[[/u]] underline markup`
          );
        }
      } else if (ch.id === 'eng_q42') {
        // Rule 4: Tap-to-Fill with 3 bracketed word buttons
        assert.equal(q.questionMode, 'tap_fill_bank', `${q.id} must use tap_fill_bank mode`);
        assert.ok(Array.isArray(q.wordBank) && q.wordBank.length === 3, `${q.id} must have 3 word bank buttons`);
        assert.ok(Array.isArray(q.blanks) && q.blanks.length === 3, `${q.id} must have 3 blanks`);
        q.blanks.forEach((blank, bIdx) => {
          const token = `{{${bIdx}}}`;
          assert.ok(q.questionText.includes(token), `${q.id} questionText missing ${token}`);
          assert.ok(
            q.wordBank.includes(blank.correctAnswer),
            `${q.id} blank ${bIdx + 1} answer "${blank.correctAnswer}" not in word bank [${q.wordBank.join(', ')}]`
          );
        });
      } else if (ch.id === 'eng_q46' || ch.id === 'eng_q50') {
        // Rule 5: Per-blank Tap-to-Fill with 3 options per blank
        assert.equal(q.questionMode, 'tap_fill_per_blank', `${q.id} must use tap_fill_per_blank mode`);
        assert.ok(Array.isArray(q.blanks) && q.blanks.length >= 2, `${q.id} must have blanks`);
        if (ch.id === 'eng_q46') {
          assert.ok(Array.isArray(q.dialogueLines) && q.dialogueLines.length >= 2, `${q.id} must include dialogueLines`);
        }
        q.blanks.forEach((blank, bIdx) => {
          const token = `{{${bIdx}}}`;
          assert.ok(q.questionText.includes(token), `${q.id} questionText missing ${token}`);
          assert.equal(blank.options.length, 3, `${q.id} blank ${bIdx + 1} must have exactly 3 options`);
          assert.ok(
            blank.options.includes(blank.correctAnswer),
            `${q.id} blank ${bIdx + 1} answer "${blank.correctAnswer}" not found in options [${blank.options.join(', ')}]`
          );
        });
      } else if (ch.id === 'eng_q47_49') {
        // Rule 6: 3 joined-sentence options from the 3 bracketed conjunctions
        assert.equal(q.options.length, 3, `${q.id} must have 3 joined-sentence options`);
        assert.ok(q.correctIndex >= 0 && q.correctIndex < 3, `Invalid correctIndex in ${q.id}`);
        for (const opt of q.options) {
          assert.ok(opt.trim().length > 10, `Joined sentence option too short in ${q.id}: ${opt}`);
        }
      }
    }
  });

  const mock = mockBuilderMod.buildBoardExamMockTestChapter(english);
  assert.equal(mock.isMockTest, true);
  assert.equal(mock.id, 'mock_test_english');
  assert.equal(mock.questions.length, 23, `English mock test should have 23 items across Sections A, C & D, got ${mock.questions.length}`);
});



