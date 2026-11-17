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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'std10-test-'));
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
      `--outfile=${outFile}`,
    ],
    { stdio: 'pipe' }
  );
  return import(pathToFileURL(outFile).href);
}

const syncManager = await bundleTsModule('src/services/syncManager.ts', 'syncManager.mjs');
const driveSync = await bundleTsModule('src/services/googleDriveSync.ts', 'googleDriveSync.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('classifyFirestoreError classifies quota, network, permission, and unknown', () => {
  assert.equal(syncManager.classifyFirestoreError(new Error('RESOURCE_EXHAUSTED: Quota exceeded')), 'quota');
  assert.equal(syncManager.classifyFirestoreError(new Error('QUOTA_EXCEEDED')), 'quota');
  assert.equal(
    syncManager.classifyFirestoreError(new Error('Failed to get document because the client is offline.')),
    'network'
  );
  assert.equal(syncManager.classifyFirestoreError(new Error('DEADLINE_EXCEEDED')), 'network');
  assert.equal(
    syncManager.classifyFirestoreError(new Error('Missing or insufficient permissions')),
    'permission'
  );
  assert.equal(syncManager.classifyFirestoreError(new Error('Something unexpected')), 'unknown');
});

test('enqueueSyncOperation deduplicates by opKey and preserves single record', () => {
  globalThis.localStorage.clear();
  syncManager.setOnlineState(true);
  syncManager.clearQuotaCooldown();

  syncManager.enqueueSyncOperation('quiz_attempt', 'attempt:abc123', { score: 8 });
  syncManager.enqueueSyncOperation('quiz_attempt', 'attempt:abc123', { score: 9 });
  syncManager.enqueueSyncOperation('student_profile_sync', 'profile:mob_9876543210', { fullName: 'Aarav' });

  const q = syncManager.loadSyncQueue();
  assert.equal(q.length, 2);
  const attemptOp = q.find((x) => x.opKey === 'attempt:abc123');
  assert.equal(attemptOp.payload.score, 9);
  assert.equal(syncManager.getSyncStatus().pendingSyncCount, 2);
});

test('flushSyncQueue retries with backoff, marks failed at MAX_SYNC_RETRIES, and resets cleanly', async () => {
  globalThis.localStorage.clear();
  syncManager.setOnlineState(true);
  syncManager.clearQuotaCooldown();

  syncManager.enqueueSyncOperation('quiz_attempt', 'attempt:retry1', { score: 7 });

  // Fail 3 times -> still pending
  for (let i = 0; i < 3; i += 1) {
    const res = await syncManager.flushSyncQueue(
      async () => {
        throw new Error('Transient server error');
      },
      { forceDue: true }
    );
    assert.equal(res.synced, 0);
    assert.equal(res.remaining, 1);
    assert.equal(res.failed, 0);
  }

  // 4th attempt hits MAX_SYNC_RETRIES (4) -> transitions to failed
  const fourth = await syncManager.flushSyncQueue(
    async () => {
      throw new Error('Transient server error');
    },
    { forceDue: true }
  );
  assert.equal(fourth.failed, 1);
  assert.equal(fourth.remaining, 0);

  // Reset and succeed
  const resetCount = syncManager.resetFailedOperationsForRetry();
  assert.equal(resetCount, 1);
  const final = await syncManager.flushSyncQueue(async () => {}, { forceDue: true });
  assert.equal(final.synced, 1);
  assert.equal(final.failed, 0);
  assert.equal(final.remaining, 0);
});

test('flushSyncQueue immediately fails non-retryable DUPLICATE_UTR and halts batch on quota', async () => {
  globalThis.localStorage.clear();
  syncManager.setOnlineState(true);
  syncManager.clearQuotaCooldown();

  syncManager.enqueueSyncOperation('payment_submit', 'pay:dup', { amount: 24 });
  const dupRes = await syncManager.flushSyncQueue(
    async () => {
      throw new Error('DUPLICATE_UTR');
    },
    { forceDue: true }
  );
  assert.equal(dupRes.failed, 1);
  assert.equal(dupRes.remaining, 0);

  globalThis.localStorage.clear();
  syncManager.clearQuotaCooldown();
  syncManager.enqueueSyncOperation('quiz_attempt', 'attempt:q1', { score: 10 });
  syncManager.enqueueSyncOperation('quiz_attempt', 'attempt:q2', { score: 9 });

  let execCalls = 0;
  const quotaRes = await syncManager.flushSyncQueue(
    async () => {
      execCalls += 1;
      throw new Error('RESOURCE_EXHAUSTED');
    },
    { forceDue: true }
  );
  assert.equal(execCalls, 1);
  assert.equal(quotaRes.remaining, 2);
  assert.equal(syncManager.isQuotaCooldownActive(), true);
});

test('mergeRecordsByIdNewer keeps newer records and mergeStudentProfilesConflictSafe preserves unlocks', () => {
  const existing = [
    { id: '1', updatedAt: { seconds: 100, nanoseconds: 0 }, createdAt: null, val: 'old' },
    { id: '2', updatedAt: { seconds: 200, nanoseconds: 0 }, createdAt: null, val: 'newer_local' },
  ];
  const incoming = [
    { id: '1', updatedAt: { seconds: 150, nanoseconds: 0 }, createdAt: null, val: 'newer_remote' },
    { id: '2', updatedAt: { seconds: 180, nanoseconds: 0 }, createdAt: null, val: 'stale_remote' },
    { id: '3', updatedAt: { seconds: 90, nanoseconds: 0 }, createdAt: null, val: 'paginated' },
  ];
  const merged = syncManager.mergeRecordsByIdNewer(existing, incoming);
  const byId = Object.fromEntries(merged.map((x) => [x.id, x]));
  assert.equal(byId['1'].val, 'newer_remote');
  assert.equal(byId['2'].val, 'newer_local');
  assert.equal(byId['3'].val, 'paginated');

  const combined = syncManager.mergeStudentProfilesConflictSafe(
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
      bestScorePercent: 75,
      unlockedSubjects: ['maths'],
      paymentRequestIds: ['pay_1'],
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
      redeemedCode: 'CODE1234',
      paymentStatus: 'approved',
      totalQuizzesTaken: 4,
      bestScorePercent: 90,
      unlockedSubjects: ['science', 'social_science'],
      paymentRequestIds: ['pay_2'],
      createdAt: null,
      updatedAt: null,
    }
  );
  assert.equal(combined.hasQuizAccess, true);
  assert.ok(combined.unlockedSubjects.includes('all'));
  assert.equal(combined.totalQuizzesTaken, 4);
  assert.equal(combined.bestScorePercent, 90);
  assert.equal(combined.redeemedCode, 'CODE1234');
});

test('mergeStudentDriveBackups unions unlocked subjects, attempts, and computes deterministic signature', () => {
  const driveRemote = {
    version: 1,
    appId: 'std10_gujarati_quiz',
    gmail: 'student@gmail.com',
    uid: 'gmail_student_at_gmail_com',
    updatedAtMs: 1_000,
    lastSyncedDevice: 'Pixel',
    profile: {
      fullName: 'Riya',
      mobileNumber: '9898989898',
      email: 'student@gmail.com',
      standard: 'ધોરણ 10',
      hasQuizAccess: false,
      redeemedCode: 'AAAA1111',
      paymentStatus: 'approved',
      totalQuizzesTaken: 1,
      bestScorePercent: 80,
      unlockedSubjects: ['maths'],
      paymentRequestIds: ['pay_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    },
    attempts: [
      {
        id: 'att_1',
        userId: 'gmail_student_at_gmail_com',
        subjectId: 'maths',
        subjectTitle: 'ગણિત',
        chapterTitle: 'Ch 1',
        score: 8,
        totalQuestions: 10,
        percentage: 80,
        timeTakenSeconds: 40,
        createdAtMs: 900,
      },
    ],
    paymentsSummary: [],
  };

  const localNewer = {
    ...driveRemote,
    updatedAtMs: 2_000,
    lastSyncedDevice: 'Chrome Web',
    profile: {
      ...driveRemote.profile,
      unlockedSubjects: ['science'],
      totalQuizzesTaken: 1,
      bestScorePercent: 90,
    },
    attempts: [
      {
        id: 'att_2',
        userId: 'gmail_student_at_gmail_com',
        subjectId: 'science',
        subjectTitle: 'વિજ્ઞાન',
        chapterTitle: 'Ch 2',
        score: 9,
        totalQuestions: 10,
        percentage: 90,
        timeTakenSeconds: 35,
        createdAtMs: 1_800,
      },
    ],
  };

  const merged = driveSync.mergeStudentDriveBackups(driveRemote, localNewer);
  assert.ok(merged);
  assert.equal(merged.attempts.length, 2);
  assert.ok(merged.profile.unlockedSubjects.includes('maths'));
  assert.ok(merged.profile.unlockedSubjects.includes('science'));
  assert.equal(merged.profile.totalQuizzesTaken, 2);
  assert.equal(merged.profile.bestScorePercent, 90);
  assert.equal(merged.profile.mobileNumber, '9898989898');

  const sig1 = driveSync.computeBackupSignature(merged);
  const sig2 = driveSync.computeBackupSignature({ ...merged, updatedAtMs: merged.updatedAtMs + 5000 });
  assert.equal(sig1, sig2);
});
