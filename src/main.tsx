import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './i18n/translations';
import './index.css';
import { initWebServiceWorkerUpdater } from './services/webSwUpdateService';

void initWebServiceWorkerUpdater();

type BootWindow = Window & {
  __QQ_APP_MOUNTED__?: boolean;
};

type MountNotifierBridge = {
  notifyAppMounted?: () => void;
};

function notifyNativeBootMounted(): void {
  const w = window as BootWindow;
  w.__QQ_APP_MOUNTED__ = true;
  try {
    const bridge = (w as unknown as { AndroidBridge?: MountNotifierBridge }).AndroidBridge;
    bridge?.notifyAppMounted?.();
  } catch {
    // Ignore when running outside Android WebView
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
    (window as BootWindow).__QQ_APP_MOUNTED__ = true;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        notifyNativeBootMounted();
      });
    } else {
      notifyNativeBootMounted();
    }
  } catch (err) {
    const msgEl = document.getElementById('qq-boot-msg');
    const btnEl = document.getElementById('qq-boot-retry');
    const detail = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    if (msgEl) {
      msgEl.textContent = `એપ લોડ થવામાં સમસ્યા આવી. (${detail.slice(0, 120)})`;
    }
    if (btnEl) {
      btnEl.style.display = 'inline-block';
    }
    console.error('Failed to mount Quick Quiz root:', err);
  }
}
