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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'std10-adaptive-test-'));
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

const adaptive = await bundleTsModule('src/services/adaptiveDisplay.ts', 'adaptiveDisplay.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('classifies 5-inch and 6.5-inch mobile phones accurately', () => {
  const phone5 = adaptive.classifyAdaptiveDisplay({
    widthDp: 360,
    heightDp: 640,
    density: 2,
    diagonalInches: 5.0,
    hasTouchscreen: true,
  });
  assert.equal(phone5.deviceType, 'mobile_phone');
  assert.equal(phone5.windowSizeClass, 'compact');
  assert.equal(phone5.screenProfileId, 'phone_5');
  assert.equal(phone5.effectiveOrientation, 'portrait');
  assert.equal(phone5.useNavigationRail, false);
  assert.equal(phone5.useSplitLayout, false);
  assert.equal(phone5.useSplitQuizCockpit, false);
  assert.equal(phone5.gridColumns, 1);

  const phone65 = adaptive.classifyAdaptiveDisplay({
    widthDp: 412,
    heightDp: 915,
    density: 2.625,
    diagonalInches: 6.5,
    hasTouchscreen: true,
  });
  assert.equal(phone65.deviceType, 'mobile_phone');
  assert.equal(phone65.windowSizeClass, 'compact');
  assert.equal(phone65.screenProfileId, 'phone_6_5');
  assert.equal(phone65.fontScale, 1.0);
});

test('classifies 8-inch and 10-inch tablets in portrait and landscape', () => {
  const tablet8Portrait = adaptive.classifyAdaptiveDisplay({
    widthDp: 800,
    heightDp: 1280,
    density: 1.5,
    diagonalInches: 8.0,
    smallestWidthDp: 720,
    hasTouchscreen: true,
  });
  assert.equal(tablet8Portrait.deviceType, 'tablet');
  assert.equal(tablet8Portrait.windowSizeClass, 'medium');
  assert.equal(tablet8Portrait.screenProfileId, 'tablet_8');
  assert.equal(tablet8Portrait.effectiveOrientation, 'portrait');
  assert.equal(tablet8Portrait.gridColumns, 2);

  const tablet10Landscape = adaptive.classifyAdaptiveDisplay({
    widthDp: 1280,
    heightDp: 800,
    density: 2,
    diagonalInches: 10.1,
    smallestWidthDp: 800,
    hasTouchscreen: true,
  });
  assert.equal(tablet10Landscape.deviceType, 'tablet');
  assert.equal(tablet10Landscape.windowSizeClass, 'large');
  assert.equal(tablet10Landscape.screenProfileId, 'tablet_10');
  assert.equal(tablet10Landscape.effectiveOrientation, 'landscape');
  assert.equal(tablet10Landscape.useNavigationRail, true);
  assert.equal(tablet10Landscape.useSplitLayout, true);
  assert.equal(tablet10Landscape.useSplitQuizCockpit, true);
  assert.equal(tablet10Landscape.gridColumns, 3);
});

test('classifies 32-inch and 43-inch Android Smart TVs with auto-landscape & remote navigation', () => {
  const tv32 = adaptive.classifyAdaptiveDisplay({
    widthDp: 960,
    heightDp: 540,
    widthPx: 1366,
    heightPx: 768,
    diagonalInches: 32,
    isTelevision: true,
    hasLeanback: true,
    hasTouchscreen: false,
  });
  assert.equal(tv32.deviceType, 'android_tv');
  assert.equal(tv32.screenProfileId, 'tv_32');
  assert.equal(tv32.isTvOrSmartBoard, true);
  assert.equal(tv32.isRemoteNavigable, true);
  assert.equal(tv32.effectiveOrientation, 'landscape');
  assert.equal(tv32.useNavigationRail, true);
  assert.equal(tv32.useSplitQuizCockpit, true);
  assert.ok(tv32.fontScale >= 1.18);

  const tv43 = adaptive.classifyAdaptiveDisplay({
    widthDp: 1920,
    heightDp: 1080,
    widthPx: 1920,
    heightPx: 1080,
    diagonalInches: 43,
    isTelevision: true,
    hasLeanback: true,
    hasTouchscreen: false,
  });
  assert.equal(tv43.deviceType, 'android_tv');
  assert.equal(tv43.screenProfileId, 'tv_43');
  assert.equal(tv43.windowSizeClass, 'xlarge');
  assert.equal(tv43.fontScale, 1.24);
});

test('classifies 55, 65, 75, and 86-inch Interactive Smart Boards cleanly', () => {
  const sizes = [
    { diag: 55, w: 1280, h: 720, pxW: 1920, pxH: 1080, id: 'smartboard_55', minScale: 1.18 },
    { diag: 65, w: 1600, h: 900, pxW: 1920, pxH: 1080, id: 'smartboard_65', minScale: 1.24 },
    { diag: 75, w: 1920, h: 1080, pxW: 3840, pxH: 2160, id: 'smartboard_75', minScale: 1.28 },
    { diag: 86, w: 2560, h: 1440, pxW: 3840, pxH: 2160, id: 'smartboard_86', minScale: 1.32 },
  ];

  for (const s of sizes) {
    const board = adaptive.classifyAdaptiveDisplay({
      widthDp: s.w,
      heightDp: s.h,
      widthPx: s.pxW,
      heightPx: s.pxH,
      diagonalInches: s.diag,
      hasTouchscreen: true,
    });
    assert.equal(board.deviceType, 'smart_board');
    assert.equal(board.screenProfileId, s.id);
    assert.equal(board.isTvOrSmartBoard, true);
    assert.equal(board.effectiveOrientation, 'landscape');
    assert.equal(board.useNavigationRail, true);
    assert.equal(board.useSplitLayout, true);
    assert.equal(board.useSplitQuizCockpit, true);
    assert.equal(board.gridColumns, 3);
    assert.ok(board.fontScale >= s.minScale);
  }
});

test('handles foldable hinge postures, landscape monitors, and display settings overrides', () => {
  const bookFoldable = adaptive.classifyAdaptiveDisplay({
    widthDp: 780,
    heightDp: 820,
    diagonalInches: 7.6,
    isFoldable: true,
    hingePosture: 'book',
    hasTouchscreen: true,
  });
  assert.equal(bookFoldable.deviceType, 'foldable');
  assert.equal(bookFoldable.hingePosture, 'book');
  assert.equal(bookFoldable.useSplitLayout, true);
  assert.equal(bookFoldable.useSplitQuizCockpit, true);

  const tabletopFoldable = adaptive.classifyAdaptiveDisplay({
    widthDp: 780,
    heightDp: 820,
    diagonalInches: 7.6,
    isFoldable: true,
    hingePosture: 'tabletop',
    hasTouchscreen: true,
  });
  assert.equal(tabletopFoldable.hingePosture, 'tabletop');
  assert.equal(tabletopFoldable.useSplitQuizCockpit, true);

  const monitor = adaptive.classifyAdaptiveDisplay({
    widthDp: 1440,
    heightDp: 900,
    diagonalInches: 24,
    hasTouchscreen: false,
    isTelevision: false,
  });
  assert.equal(monitor.deviceType, 'landscape_monitor');
  assert.equal(monitor.isRemoteNavigable, true);

  // Forced Portrait & Full Screen Mode on tablet
  const forcedPortrait = adaptive.classifyAdaptiveDisplay(
    {
      widthDp: 1280,
      heightDp: 800,
      diagonalInches: 10,
      smallestWidthDp: 800,
      hasTouchscreen: true,
    },
    { displayMode: 'portrait', isFullScreen: true }
  );
  assert.equal(forcedPortrait.effectiveOrientation, 'portrait');
  assert.equal(forcedPortrait.isFullScreen, true);
  assert.equal(forcedPortrait.displayMode, 'portrait');
  assert.equal(forcedPortrait.useNavigationRail, false);

  // Forced Landscape on 6.5" phone
  const forcedLandscape = adaptive.classifyAdaptiveDisplay(
    {
      widthDp: 412,
      heightDp: 915,
      diagonalInches: 6.5,
      hasTouchscreen: true,
    },
    { displayMode: 'landscape', isFullScreen: false }
  );
  assert.equal(forcedLandscape.effectiveOrientation, 'landscape');
  assert.equal(forcedLandscape.useSplitQuizCockpit, true);

  // Settings persistence round-trip
  adaptive.persistDisplaySettings({ displayMode: 'landscape', isFullScreen: true });
  const loaded = adaptive.loadSavedDisplaySettings();
  assert.deepEqual(loaded, { displayMode: 'landscape', isFullScreen: true });
});
