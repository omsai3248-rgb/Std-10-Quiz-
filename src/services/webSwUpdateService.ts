import type { AppUpdateProgressEvent, GitHubReleaseInfo } from '../types/models';
import {
  APP_BUILD_COMMIT_SHA,
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  isReleaseVersionNewer,
} from './githubUpdateChecker';
import { hasNativeFirebaseBridge } from './nativeFirebaseBridge';

export interface WebVersionManifest {
  appName?: string;
  versionName?: string;
  versionCode?: number;
  githubOwnerRepo?: string;
  commitSha?: string;
  releaseNotes?: string;
  builtAt?: string;
}

type SwUpdateListener = (release: GitHubReleaseInfo | null) => void;

const listeners = new Set<SwUpdateListener>();
let activeRegistration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let latestWebRelease: GitHubReleaseInfo | null = null;
let initialized = false;

export function isWebServiceWorkerSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (hasNativeFirebaseBridge()) return false;
  if (window.location.hostname === 'appassets.androidplatform.net') return false;
  if (!window.location.protocol.startsWith('http')) return false;
  return 'serviceWorker' in navigator;
}

function notifyListeners(): void {
  listeners.forEach((cb) => cb(latestWebRelease));
}

function buildWebUpdateInfo(
  manifest?: WebVersionManifest | null,
  fallbackNotes = ''
): GitHubReleaseInfo {
  const versionName = (manifest?.versionName ?? '').trim() || APP_VERSION_NAME;
  const versionCode =
    typeof manifest?.versionCode === 'number' && manifest.versionCode >= 1
      ? manifest.versionCode
      : APP_VERSION_CODE + 1;
  const notes =
    (manifest?.releaseNotes ?? '').trim() ||
    fallbackNotes ||
    'નવું Web વર્ઝન તૈયાર છે. અપડેટ કરવાથી તમારો જૂનો ડેટા અને લૉગિન સુરક્ષિત રહેશે.';
  return {
    tagName: `v${versionName}`,
    versionName,
    versionCode,
    releaseTitle: `Quick Quiz v${versionName}`,
    releaseNotes: notes,
    apkDownloadUrl: '',
    htmlUrl: typeof window !== 'undefined' ? window.location.origin : '',
    apkSizeBytes: 0,
    isMandatory: false,
    source: 'web_sw',
    isUpdateAvailable: true,
  };
}

export async function fetchLocalWebVersionManifest(): Promise<WebVersionManifest | null> {
  if (typeof window === 'undefined') return null;
  if (hasNativeFirebaseBridge() || window.location.hostname === 'appassets.androidplatform.net') {
    return null;
  }
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as WebVersionManifest;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export async function initWebServiceWorkerUpdater(): Promise<void> {
  if (initialized || !isWebServiceWorkerSupported()) return;
  initialized = true;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    activeRegistration = registration;

    const inspectWaiting = async (worker: ServiceWorker | null) => {
      if (!worker) return;
      waitingWorker = worker;
      const manifest = await fetchLocalWebVersionManifest();
      latestWebRelease = buildWebUpdateInfo(manifest);
      notifyListeners();
    };

    if (registration.waiting) {
      await inspectWaiting(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          void inspectWaiting(installing);
        }
      });
    });
  } catch {
    // Non-fatal in dev mode or restricted browser environments
  }
}

export function subscribeWebSwUpdates(cb: SwUpdateListener): () => void {
  listeners.add(cb);
  cb(latestWebRelease);
  return () => {
    listeners.delete(cb);
  };
}

export async function checkWebSwForUpdateNow(
  currentVersionName = APP_VERSION_NAME,
  currentVersionCode = APP_VERSION_CODE
): Promise<GitHubReleaseInfo | null> {
  if (!isWebServiceWorkerSupported()) return null;

  if (activeRegistration) {
    await activeRegistration.update().catch(() => {});
    if (activeRegistration.waiting) {
      waitingWorker = activeRegistration.waiting;
    }
  }

  const manifest = await fetchLocalWebVersionManifest();
  const hasWaiting = Boolean(waitingWorker || activeRegistration?.waiting);
  const remoteName = (manifest?.versionName ?? '').trim();
  const remoteCode = typeof manifest?.versionCode === 'number' ? manifest.versionCode : undefined;
  const shaChanged = Boolean(
    manifest?.commitSha &&
      APP_BUILD_COMMIT_SHA &&
      manifest.commitSha !== APP_BUILD_COMMIT_SHA
  );

  const isManifestNewer = Boolean(
    manifest &&
      remoteName &&
      (isReleaseVersionNewer(remoteName, remoteCode, currentVersionName, currentVersionCode) ||
        shaChanged)
  );

  if (hasWaiting || isManifestNewer) {
    latestWebRelease = buildWebUpdateInfo(manifest);
    notifyListeners();
    return latestWebRelease;
  }

  return null;
}

export async function applyWebSwUpdateWithProgress(
  onProgress: (evt: AppUpdateProgressEvent) => void
): Promise<void> {
  if (!isWebServiceWorkerSupported()) {
    window.location.reload();
    return;
  }

  onProgress({
    status: 'downloading',
    progressPercent: 12,
    bytesDownloaded: 0,
    totalBytes: 100,
    message: '',
  });

  const reg =
    activeRegistration ??
    (await navigator.serviceWorker.getRegistration('/').catch(() => undefined)) ??
    null;

  if (reg) {
    await reg.update().catch(() => {});
  }

  const targetWorker = waitingWorker || reg?.waiting || null;

  if (!targetWorker) {
    // Wait briefly in case installing worker is finishing, otherwise clean cache reload
    onProgress({
      status: 'downloading',
      progressPercent: 60,
      bytesDownloaded: 60,
      totalBytes: 100,
      message: '',
    });
    await new Promise((r) => setTimeout(r, 250));
    onProgress({
      status: 'installing',
      progressPercent: 100,
      bytesDownloaded: 100,
      totalBytes: 100,
      message: '',
    });
    await new Promise((r) => setTimeout(r, 200));
    window.location.reload();
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      onProgress({
        status: 'installing',
        progressPercent: 100,
        bytesDownloaded: 100,
        totalBytes: 100,
        message: '',
      });
      resolve();
    };

    const onControllerChange = () => finish();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const msg = event.data as { type?: string; progressPercent?: number } | null;
      if (msg?.type === 'SW_PROGRESS') {
        onProgress({
          status: 'downloading',
          progressPercent: Math.max(15, Math.min(95, Number(msg.progressPercent ?? 50))),
          bytesDownloaded: Number(msg.progressPercent ?? 50),
          totalBytes: 100,
          message: '',
        });
      } else if (msg?.type === 'SW_ACTIVATING') {
        onProgress({
          status: 'installing',
          progressPercent: 98,
          bytesDownloaded: 98,
          totalBytes: 100,
          message: '',
        });
      }
    };

    targetWorker.postMessage({ type: 'SW_SKIP_WAITING' }, [channel.port2]);
    window.setTimeout(finish, 3000);
  });

  window.location.reload();
}
