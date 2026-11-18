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
