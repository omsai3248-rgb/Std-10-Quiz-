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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickquiz-voice-test-'));
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

const voiceMod = await bundleTsModule('src/services/gujaratiVoicePlayer.ts', 'gujaratiVoicePlayer.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('contains all joyful & empathetic Gujarati teacher phrases (6 correct + 6 wrong)', () => {
  assert.deepEqual(Array.from(voiceMod.GUJARATI_CORRECT_PHRASES), [
    'અરે વાહ! એકદમ સાચો જવાબ!',
    'શાબાશ! ખૂબ સરસ!',
    'ઉત્તમ! આગળ વધો!',
    'અભિનંદન! તમે સાચા છો!',
    'ખૂબ સરસ બેટા! તારી તૈયારી જોરદાર છે!',
    'વાહ! આ જ રીતે મહેનત ચાલુ રાખો!',
  ]);

  assert.deepEqual(Array.from(voiceMod.GUJARATI_WRONG_PHRASES), [
    'કોઈ વાંધો નહીં! ફરી પ્રયત્ન કરો.',
    'નિરાશ ન થશો! તમે કરી શકશો.',
    'ભૂલમાંથી જ શીખવાનું છે.',
    'હિંમત ન હારશો!',
    'ચાલો, આપણે આની સરળ સમજૂતી સમજી લઈએ.',
    'ધ્યાનથી વાંચો, આગળનો જવાબ જરૂર સાચો પડશે!',
  ]);
});

test('NonRepeatingPhraseTracker never repeats the same phrase consecutively', () => {
  const tracker = new voiceMod.NonRepeatingPhraseTracker();

  let prevCorrect = '';
  for (let i = 0; i < 60; i++) {
    const { phrase } = tracker.pick(true, () => (i % 2 === 0 ? 0 : Math.random()));
    assert.ok(voiceMod.GUJARATI_CORRECT_PHRASES.includes(phrase));
    assert.notEqual(phrase, prevCorrect, `Correct phrase repeated consecutively: ${phrase}`);
    prevCorrect = phrase;
  }

  let prevWrong = '';
  for (let i = 0; i < 60; i++) {
    const { phrase } = tracker.pick(false, () => (i % 3 === 0 ? 0 : Math.random()));
    assert.ok(voiceMod.GUJARATI_WRONG_PHRASES.includes(phrase));
    assert.notEqual(phrase, prevWrong, `Wrong phrase repeated consecutively: ${phrase}`);
    prevWrong = phrase;
  }
});

test('Natural Human Voice speaks only right/wrong feedback, supports Female/Male toggle, and removes explanation voice', () => {
  const spokenCalls = [];
  const prefetchedCalls = [];
  let stoppedCalled = 0;
  let storedGender = 'female';

  globalThis.window = {
    setTimeout: (fn, delay = 0) => {
      if (typeof fn === 'function' && Number(delay) === 0) fn();
      return 1;
    },
    clearTimeout: () => {},
    AndroidTtsBridge: {
      isReady: () => true,
      isGujaratiAvailable: () => true,
      isHumanVoiceSupported: () => true,
      getVoiceGender: () => storedGender,
      setVoiceGender: (g) => {
        storedGender = g;
      },
      speakNaturalChunk: (uttId, text, gender, tone, rate) => {
        spokenCalls.push({ uttId, text, gender, tone, rate });
      },
      prefetchNaturalChunk: (text, gender, tone) => {
        prefetchedCalls.push({ text, gender, tone });
      },
      pause: () => {},
      resume: () => {},
      stop: () => {
        stoppedCalled += 1;
      },
    },
  };

  try {
    assert.equal(typeof voiceMod.gujaratiVoicePlayer.playExplanationOnly, 'undefined');
    assert.equal(typeof voiceMod.gujaratiVoicePlayer.playAnswerFeedbackAndExplanation, 'undefined');

    voiceMod.gujaratiVoicePlayer.setVoiceEnabled(false);
    const mutedPhrase = voiceMod.gujaratiVoicePlayer.playAnswerFeedback(true, 0);
    assert.ok(voiceMod.GUJARATI_CORRECT_PHRASES.includes(mutedPhrase));
    assert.equal(spokenCalls.length, 0);
    assert.equal(voiceMod.gujaratiVoicePlayer.getSnapshot().status, 'idle');

    // Enable voice & test Female/Male toggle
    voiceMod.gujaratiVoicePlayer.setVoiceEnabled(true);
    voiceMod.gujaratiVoicePlayer.setVoiceGender('male');
    assert.equal(voiceMod.gujaratiVoicePlayer.getSnapshot().voiceGender, 'male');
    assert.equal(storedGender, 'male');

    voiceMod.gujaratiVoicePlayer.warmupFeedbackVoices();
    assert.equal(prefetchedCalls.length, 2);

    // Trigger answer feedback ONLY (1 chunk: feedback)
    const spokenPhrase = voiceMod.gujaratiVoicePlayer.playAnswerFeedback(false, 0);
    assert.ok(voiceMod.GUJARATI_WRONG_PHRASES.includes(spokenPhrase));
    assert.equal(spokenCalls.length, 1);
    assert.equal(spokenCalls[0].tone, 'feedback_wrong');
    assert.equal(spokenCalls[0].gender, 'male');
    assert.equal(voiceMod.gujaratiVoicePlayer.getSnapshot().totalChunks, 1);

    voiceMod.gujaratiVoicePlayer.stop();
    assert.ok(stoppedCalled >= 1);
    assert.equal(voiceMod.gujaratiVoicePlayer.getSnapshot().status, 'idle');
  } finally {
    delete globalThis.window;
  }
});


