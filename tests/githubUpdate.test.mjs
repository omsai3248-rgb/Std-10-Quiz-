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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'std10-update-test-'));
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

const updater = await bundleTsModule('src/services/githubUpdateChecker.ts', 'githubUpdateChecker.mjs');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('sanitizeOwnerRepo and repo preference persistence work reliably', () => {
  globalThis.localStorage.clear();
  assert.equal(updater.sanitizeOwnerRepo('user/quick-quiz'), 'user/quick-quiz');
  assert.equal(updater.sanitizeOwnerRepo('https://github.com/user/quick-quiz.git'), 'user/quick-quiz');
  assert.equal(updater.sanitizeOwnerRepo(' /user/quick-quiz/ '), 'user/quick-quiz');
  assert.equal(updater.sanitizeOwnerRepo('invalid repo name'), '');

  updater.saveGithubOwnerRepoPreference('https://github.com/gujboard/std10-quiz.git');
  assert.equal(updater.loadSavedGithubOwnerRepo(), 'gujboard/std10-quiz');
  assert.equal(updater.resolveEffectiveGithubRepo(''), 'gujboard/std10-quiz');
  assert.equal(updater.resolveEffectiveGithubRepo('custom/repo'), 'custom/repo');
});

test('version comparison and release metadata parsing handle versionCode and sha256 comments', () => {
  assert.equal(updater.isNewerVersion('1.0.2', '1.0.1'), true);
  assert.equal(updater.isNewerVersion('v1.1.0', '1.0.99'), true);
  assert.equal(updater.isNewerVersion('1.0.1', '1.0.1'), false);
  assert.equal(updater.isNewerVersion('1.0.0', '1.0.1'), false);

  const rawBody = [
    '- Fixed mock test timer',
    '- Added auto update banner',
    '<!-- versionCode:42 -->',
    '<!-- apkSha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef -->',
  ].join('\n');

  assert.equal(updater.parseVersionCodeFromRelease('v1.0.42', 'Quick Quiz v1.0.42 (Build #42)', rawBody), 42);
  assert.equal(
    updater.parseSha256FromReleaseNotes(rawBody),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  );
  assert.equal(
    updater.stripReleaseMetadataComments(rawBody),
    '- Fixed mock test timer\n- Added auto update banner'
  );

  assert.equal(updater.isReleaseVersionNewer('1.0.42', 42, '1.0.41', 41), true);
  assert.equal(updater.isReleaseVersionNewer('1.0.42', 42, '1.0.42', 42), false);
  assert.equal(updater.isReleaseVersionNewer('1.0.40', 40, '1.0.42', 42), false);
});

test('chooseNewestAvailableUpdate returns null when up-to-date and selects highest valid update', () => {
  const upToDate = updater.chooseNewestAvailableUpdate(
    [
      {
        tagName: 'v1.0.5',
        versionName: '1.0.5',
        versionCode: 5,
        releaseTitle: 'v1.0.5',
        releaseNotes: 'Same version',
        apkDownloadUrl: 'https://example.com/app.apk',
        htmlUrl: '',
        source: 'github',
        isUpdateAvailable: true,
      },
    ],
    '1.0.5',
    5
  );
  assert.equal(upToDate, null);

  const winner = updater.chooseNewestAvailableUpdate(
    [
      {
        tagName: 'v1.0.6',
        versionName: '1.0.6',
        versionCode: 6,
        releaseTitle: 'v1.0.6',
        releaseNotes: 'Firebase older',
        apkDownloadUrl: 'https://example.com/old.apk',
        htmlUrl: '',
        source: 'firebase',
        isUpdateAvailable: true,
      },
      {
        tagName: 'v1.0.7',
        versionName: '1.0.7',
        versionCode: 7,
        releaseTitle: 'v1.0.7',
        releaseNotes: 'Web SW',
        apkDownloadUrl: '',
        htmlUrl: '',
        source: 'web_sw',
        isUpdateAvailable: true,
      },
      {
        tagName: 'v1.0.7',
        versionName: '1.0.7',
        versionCode: 7,
        releaseTitle: 'v1.0.7',
        releaseNotes: 'GitHub Release with APK',
        apkDownloadUrl: 'https://github.com/a/b/releases/download/v1.0.7/Std10-Quiz.apk',
        htmlUrl: '',
        source: 'github',
        isUpdateAvailable: true,
      },
    ],
    '1.0.5',
    5
  );
  assert.ok(winner);
  assert.equal(winner.versionCode, 7);
  assert.equal(winner.source, 'github');
});

test('fetchLatestRelease parses GitHub Releases API and falls back to version.json on rate limit', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /api\.github\.com\/repos\/demo\/quiz\/releases\/latest/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v1.0.10',
          name: 'Quick Quiz v1.0.10',
          body: '- Faster quiz loading\n<!-- versionCode:10 -->',
          html_url: 'https://github.com/demo/quiz/releases/tag/v1.0.10',
          assets: [
            {
              name: 'Std10-Quiz.apk',
              browser_download_url: 'https://github.com/demo/quiz/releases/download/v1.0.10/Std10-Quiz.apk',
              size: 12582912,
            },
          ],
        }),
      };
    };

    const res = await updater.fetchLatestRelease('demo/quiz', '1.0.9', 9);
    assert.equal(res.isUpdateAvailable, true);
    assert.equal(res.versionName, '1.0.10');
    assert.equal(res.versionCode, 10);
    assert.equal(res.releaseNotes, '- Faster quiz loading');
    assert.equal(res.apkSizeBytes, 12582912);

    const sameRes = await updater.fetchLatestRelease('demo/quiz', '1.0.10', 10);
    assert.equal(sameRes.isUpdateAvailable, false);

    // Rate limit 403 -> fallback to version.json asset
    globalThis.fetch = async (url) => {
      if (String(url).includes('api.github.com')) {
        return { ok: false, status: 403 };
      }
      assert.match(String(url), /releases\/latest\/download\/version\.json/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          versionName: '1.0.12',
          versionCode: 12,
          releaseTitle: 'Quick Quiz v1.0.12',
          releaseNotes: '- CDN fallback release note',
          apkDownloadUrl: 'https://github.com/demo/quiz/releases/download/v1.0.12/Std10-Quiz.apk',
          apkSizeBytes: 13000000,
        }),
      };
    };

    const fallbackRes = await updater.fetchLatestRelease('demo/quiz', '1.0.10', 10);
    assert.equal(fallbackRes.isUpdateAvailable, true);
    assert.equal(fallbackRes.versionName, '1.0.12');
    assert.equal(fallbackRes.versionCode, 12);
    assert.equal(fallbackRes.releaseNotes, '- CDN fallback release note');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AppUpdateComponents and App toast/notification render full-screen 100dvh x 100vw zero-scroll responsive update UI across Mobile Portrait, Landscape, Tablet, and Smart TV', () => {
  const source = fs.readFileSync(path.resolve('src/components/AppUpdateComponents.tsx'), 'utf8');
  assert.equal(source.includes('update-screen-root'), true);
  assert.equal(source.includes('update-screen-shell'), true);
  assert.equal(source.includes('data-testid="update_progress_panel"'), true);
  assert.equal(source.includes('data-testid="update_progress_percent"'), true);
  assert.equal(source.includes('grid grid-cols-2 gap-2.5 sm:gap-3.5 shrink-0'), true);
  assert.equal(source.includes('const [showHistory, setShowHistory] = useState(false);'), true);
  assert.equal(source.includes('w-full h-auto rounded-2xl bg-white dark:bg-[#0F172A]'), true);
  assert.equal(source.includes('whitespace-normal break-words'), true);
  assert.equal(source.includes('isTvOrSmartBoard'), true);
  assert.equal(source.includes('fixed inset-0 z-[90]'), false);
  assert.equal(source.includes('backdrop-blur'), false);
  assert.equal(source.includes('max-h-[82dvh]'), false);
  assert.equal(source.includes('max-h-[90vh]'), false);
  assert.equal(source.includes('max-h-36'), false);
  assert.equal(source.includes('max-h-28'), false);
  assert.equal(source.includes('line-clamp-2'), false);

  const cssSource = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.equal(cssSource.includes('.update-screen-root'), true);
  assert.equal(cssSource.includes('width: 100vw;'), true);
  assert.equal(cssSource.includes('height: 100dvh;'), true);
  assert.equal(cssSource.includes('@media (orientation: landscape)'), true);

  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.equal(appSource.includes('const isShowingFullScreenUpdate = Boolean(isUpdateModalOpen && availableUpdate);'), true);
  assert.equal(appSource.includes('data-testid="admin_top_popup"'), true);
  assert.equal(appSource.includes('data-testid="app_status_toast"'), true);
  assert.equal(appSource.includes('w-full h-auto rounded-2xl shadow-2xl'), true);
  assert.equal(appSource.includes('max-h-[65dvh]'), false);
  assert.equal(appSource.includes('min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed'), true);
});

test('Android manifest, updater, and build comply with Google Play Protect (no REQUEST_INSTALL_PACKAGES or in-app APK dropper)', () => {
  const manifest = fs.readFileSync(path.resolve('app/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(manifest.includes('REQUEST_INSTALL_PACKAGES'), false);
  assert.equal(manifest.includes('usesCleartextTraffic="false"'), true);

  const mainActivity = fs.readFileSync(
    path.resolve('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt'),
    'utf8'
  );
  assert.equal(mainActivity.includes('ACTION_MANAGE_UNKNOWN_APP_SOURCES'), false);
  assert.equal(mainActivity.includes('application/vnd.android.package-archive'), false);
  assert.equal(mainActivity.includes('component = null'), true);
  assert.equal(mainActivity.includes('selector = null'), true);

  const updateMgr = fs.readFileSync(
    path.resolve('app/src/main/java/com/aistudio/std10quiz/kqxmtv/AppUpdateManager.kt'),
    'utf8'
  );
  assert.equal(updateMgr.includes('application/vnd.android.package-archive'), false);
  assert.equal(updateMgr.includes('canRequestPackageInstalls()'), false);
  assert.equal(updateMgr.includes('Intent.CATEGORY_BROWSABLE'), true);

  const viteConfig = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
  assert.equal(viteConfig.includes("path.resolve(__dirname, 'dist', 'assets', 'aistudio')"), true);
});

test('GitHub CI workflow, README, and updater provide a single permanent latest APK direct download link', () => {
  assert.equal(
    updater.buildPermanentLatestApkUrl('omsai3248-rgb/Quick-book'),
    'https://github.com/omsai3248-rgb/Quick-book/releases/latest/download/Quick-Quiz-Latest.apk'
  );
  assert.equal(
    updater.buildPermanentLatestApkUrl('https://github.com/omsai3248-rgb/Quick-book.git'),
    'https://github.com/omsai3248-rgb/Quick-book/releases/latest/download/Quick-Quiz-Latest.apk'
  );

  const ciYml = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
  assert.equal(ciYml.includes('build-artifacts/Quick-Quiz-Latest.apk'), true);
  assert.equal(
    ciYml.includes('https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/Quick-Quiz-Latest.apk'),
    true
  );
  assert.equal(ciYml.includes('--latest'), true);
  assert.equal(ciYml.includes('GITHUB_STEP_SUMMARY'), true);

  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  assert.equal(
    readme.includes('https://github.com/omsai3248-rgb/Quick-book/releases/latest/download/Quick-Quiz-Latest.apk'),
    true
  );
});

test('Installed APK update popup and WebView prevent blank white screens after new APK releases', () => {
  const mainActivity = fs.readFileSync(
    path.resolve('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt'),
    'utf8'
  );
  assert.equal(mainActivity.includes('Cache-Control'), true);
  assert.equal(mainActivity.includes('no-store, no-cache, must-revalidate'), true);
  assert.equal(mainActivity.includes('KEY_LAST_WEBVIEW_INSTALL_STAMP'), true);
  assert.equal(mainActivity.includes('pkgInfo.lastUpdateTime'), true);
  assert.equal(mainActivity.includes('clearCache(true)'), true);
  assert.equal(mainActivity.includes('override fun onRenderProcessGone'), true);

  const cssSource = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.equal(cssSource.includes('position: fixed;'), true);
  assert.equal(cssSource.includes('inset: 0;'), true);
  assert.equal(cssSource.includes('z-index: 90;'), true);
  assert.equal(cssSource.includes('height: 100%;'), true);
  assert.equal(cssSource.includes('min-height: 100%;'), true);
  assert.equal(cssSource.includes('.update-screen-header-inner'), true);

  const modalSource = fs.readFileSync(path.resolve('src/components/AppUpdateComponents.tsx'), 'utf8');
  assert.equal(modalSource.includes('export class UpdateModalErrorBoundary'), true);
  assert.equal(modalSource.includes('update-screen-header-inner'), true);

  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.equal(appSource.includes('<UpdateModalErrorBoundary'), true);
  assert.equal(appSource.includes('autoShownVersionKeyRef'), true);
  assert.equal(appSource.includes('authInitializedRef'), true);
  assert.equal(appSource.includes('<div aria-hidden={isShowingFullScreenUpdate ? true : undefined}>'), true);
});




