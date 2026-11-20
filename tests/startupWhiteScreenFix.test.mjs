import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relPath) => fs.readFileSync(path.resolve(relPath), 'utf8');

test('MainActivity uses Box + MATCH_PARENT WebView instead of ConstraintLayout + TRANSPARENT WebView', () => {
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt');
  assert.doesNotMatch(kt, /import androidx\.constraintlayout\.compose\.ConstraintLayout/);
  assert.doesNotMatch(kt, /setBackgroundColor\(android\.graphics\.Color\.TRANSPARENT\)/);
  assert.match(kt, /ViewGroup\.LayoutParams\.MATCH_PARENT/);
  assert.match(kt, /WebView\(activity\)/);
  assert.match(kt, /WindowInsets\.safeDrawing/);
});

test('MainActivity invalidates WebView cache on every APK reinstall via lastUpdateTime + LOAD_NO_CACHE', () => {
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt');
  assert.match(kt, /pkgInfo\.lastUpdateTime/);
  assert.match(kt, /WebSettings\.LOAD_NO_CACHE/);
  assert.match(kt, /notFoundAssetResponse\(\)/);
});

test('MainActivity verifies React mount via notifyAppMounted + watchdog + native reload recovery UI', () => {
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/MainActivity.kt');
  assert.match(kt, /fun notifyAppMounted\(\)/);
  assert.match(kt, /override fun onReceivedError\(/);
  assert.match(kt, /__QQ_APP_MOUNTED__/);
  assert.match(kt, /startup_reload_button/);
  assert.match(kt, /activeWebViewRef\?\.onResume\(\)/);
});

test('Web entry notifies AndroidBridge on mount, cleans stale SW on appassets host, and skips Web IndexedDB in APK', () => {
  const mainTsx = read('src/main.tsx');
  const indexHtml = read('index.html');
  const firebaseTs = read('src/firebase.ts');

  assert.match(mainTsx, /notifyAppMounted\?\.\(\)/);
  assert.match(mainTsx, /__QQ_APP_MOUNTED__/);
  assert.match(indexHtml, /appassets\.androidplatform\.net/);
  assert.match(indexHtml, /getRegistrations/);
  assert.match(firebaseTs, /isRunningInsideAndroidApk/);
});
