import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './i18n/translations';
import './index.css';
import { initWebServiceWorkerUpdater } from './services/webSwUpdateService';

void initWebServiceWorkerUpdater();

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  (window as Window & { __QQ_APP_MOUNTED__?: boolean }).__QQ_APP_MOUNTED__ = true;
}
