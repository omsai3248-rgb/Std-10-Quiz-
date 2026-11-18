import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickquiz-audio-test-'));
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

const audioMod = await bundleTsModule('src/services/audioPlayer.ts', 'audioPlayer.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function installMockAudioContext() {
  const createdOscillators = [];
  const createdGains = [];
  let bufferCalls = 0;
  let bufferSourceCalls = 0;

  class MockAudioContext {
    constructor() {
      this.currentTime = 10;
      this.state = 'running';
      this.destination = { kind: 'destination' };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      const freqEvents = [];
      const osc = {
        type: 'sine',
        frequency: {
          setValueAtTime: (value, time) => {
            freqEvents.push({ value, time });
          },
        },
        connect: () => {},
        disconnect: () => {},
        start: (t) => {
          osc.startedAt = t;
        },
        stop: (t) => {
          osc.stoppedAt = t;
        },
        freqEvents,
      };
      createdOscillators.push(osc);
      return osc;
    }
    createGain() {
      const ramps = [];
      const g = {
        gain: {
          setValueAtTime: (value, time) => ramps.push({ kind: 'set', value, time }),
          linearRampToValueAtTime: (value, time) => ramps.push({ kind: 'linear', value, time }),
          exponentialRampToValueAtTime: (value, time) => ramps.push({ kind: 'exp', value, time }),
        },
        connect: () => {},
        disconnect: () => {},
        ramps,
      };
      createdGains.push(g);
      return g;
    }
    createBuffer() {
      bufferCalls += 1;
      return {};
    }
    createBufferSource() {
      bufferSourceCalls += 1;
      return { connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {} };
    }
  }

  globalThis.window = {
    AudioContext: MockAudioContext,
    setTimeout: () => 1,
    clearTimeout: () => {},
  };

  return {
    createdOscillators,
    createdGains,
    getBufferCalls: () => bufferCalls,
    getBufferSourceCalls: () => bufferSourceCalls,
  };
}

test('Right and wrong answer sounds are ultra-short, soft, and clearly distinct without siren buffers', () => {
  assert.ok(audioMod.CORRECT_SOUND_DURATION_SEC <= 0.15);
  assert.ok(audioMod.WRONG_SOUND_DURATION_SEC <= 0.15);
  assert.ok(audioMod.CORRECT_SOUND_PEAK_GAIN <= 0.1);
  assert.ok(audioMod.WRONG_SOUND_PEAK_GAIN <= 0.1);

  const mock = installMockAudioContext();
  try {
    const player = new audioMod.QuizAudioPlayer();

    // Correct sound: soft ascending sine chime (~110ms)
    player.playCorrectChime();
    assert.equal(mock.createdOscillators.length, 1);
    const correctOsc = mock.createdOscillators[0];
    assert.equal(correctOsc.type, 'sine');
    assert.equal(correctOsc.freqEvents.length, 2);
    assert.ok(
      correctOsc.freqEvents[1].value > correctOsc.freqEvents[0].value,
      'Correct chime should ascend in pitch'
    );
    const correctDuration = correctOsc.stoppedAt - correctOsc.startedAt;
    assert.ok(correctDuration > 0 && correctDuration <= 0.15, `Correct duration too long: ${correctDuration}`);

    // Wrong sound: soft descending gentle low sine tone (~120ms), NO siren buffer
    player.playWrongSiren();
    assert.equal(mock.createdOscillators.length, 2);
    const wrongOsc = mock.createdOscillators[1];
    assert.equal(wrongOsc.type, 'sine');
    assert.equal(wrongOsc.freqEvents.length, 2);
    assert.ok(
      wrongOsc.freqEvents[1].value < wrongOsc.freqEvents[0].value,
      'Wrong tone should gently descend in pitch'
    );
    const wrongDuration = wrongOsc.stoppedAt - wrongOsc.startedAt;
    assert.ok(wrongDuration > 0 && wrongDuration <= 0.15, `Wrong duration too long: ${wrongDuration}`);

    assert.equal(mock.getBufferCalls(), 0);
    assert.equal(mock.getBufferSourceCalls(), 0);
  } finally {
    delete globalThis.window;
  }
});

test('QuizPlayScreen removes male/female voice feedback controls while keeping sound mute toggle', () => {
  const quizPlaySource = fs.readFileSync(path.resolve('src/screens/QuizPlayScreen.tsx'), 'utf8');
  assert.equal(quizPlaySource.includes('gujaratiVoicePlayer'), false);
  assert.equal(quizPlaySource.includes('gujarati_voice_gender_btn'), false);
  assert.equal(quizPlaySource.includes('gujarati_voice_toggle_btn'), false);
  assert.equal(quizPlaySource.includes('quiz_sound_toggle_btn'), true);
});

test('MainActivity unconditionally applies WindowInsets.safeDrawing so top buttons never overlap Android status bar', () => {
  const mainActivitySource = fs.readFileSync(
    path.resolve('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt'),
    'utf8'
  );
  assert.equal(mainActivitySource.includes('contentWindowInsets = WindowInsets.safeDrawing'), true);
  assert.equal(mainActivitySource.includes('AndroidTtsBridge'), false);
  assert.equal(
    mainActivitySource.includes('if (displaySettings.isFullScreen) WindowInsets.ime'),
    false
  );
});
