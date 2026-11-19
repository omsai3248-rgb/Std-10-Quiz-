import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db } from '../firebase';
import { APP_VERSION_CODE, APP_VERSION_NAME } from './githubUpdateChecker';
import { hasNativeFirebaseBridge } from './nativeFirebaseBridge';
import type { AdminDeepLinkPayload } from '../types/models';

const WEB_DEVICE_ID_KEY = 'qq_web_push_device_id_v1';
const WEB_SHOWN_DEDUPE_KEY = 'qq_web_push_shown_ids_v1';
const MAX_WEB_DEDUPE_IDS = 150;

let foregroundListenerInitialized = false;

function getOrCreateWebDeviceId(): string {
  try {
    const existing = localStorage.getItem(WEB_DEVICE_ID_KEY)?.trim() ?? '';
    if (existing.length >= 10) return existing;
    const rand =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const created = `web_${rand}`;
    localStorage.setItem(WEB_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `web_${Date.now().toString(16)}`;
  }
}

export function markWebNotificationDedupeShown(dedupeKey: string): boolean {
  const clean = dedupeKey.trim();
  if (!clean) return true;
  try {
    const raw = localStorage.getItem(WEB_SHOWN_DEDUPE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (list.includes(clean)) return false;
    const next = [...list, clean].slice(-MAX_WEB_DEDUPE_IDS);
    localStorage.setItem(WEB_SHOWN_DEDUPE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

function getCurrentWebVersion(): { appVersion: string; versionCode: number } {
  const appVersion = (APP_VERSION_NAME || '1.0.0').trim().slice(0, 32) || '1.0.0';
  const versionCode = Number.isFinite(APP_VERSION_CODE) && APP_VERSION_CODE >= 1
    ? Math.floor(APP_VERSION_CODE)
    : 1;
  return { appVersion, versionCode };
}

function getWebVapidKey(): string {
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return String(metaEnv?.VITE_FIREBASE_VAPID_KEY ?? '').trim();
}

/**
 * Registers or updates this browser's real FCM Web Push token in `device_fcm_tokens/{webDeviceId}`.
 * Strictly permission-gated: `enabled` is set to `true` ONLY when `Notification.permission === 'granted'`.
 */
export async function syncWebPushTokenRegistration(forceAttempt = false): Promise<boolean> {
  if (typeof window === 'undefined' || hasNativeFirebaseBridge()) return false;
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false;

  const isGranted = Notification.permission === 'granted';
  if (!isGranted && !forceAttempt) {
    return false;
  }

  try {
    const supported = await isSupported();
    if (!supported) return false;

    const vapidKey = getWebVapidKey();
    const swReg = await navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' })
      .catch(() => navigator.serviceWorker.ready);

    const messaging = getMessaging(app);
    setupWebForegroundPushListener(messaging);

    if (!isGranted) {
      return false;
    }

    const token = await getToken(messaging, {
      ...(vapidKey ? { vapidKey } : {}),
      serviceWorkerRegistration: swReg,
    }).catch(() => '');

    if (!token || token.length < 20) return false;

    const deviceId = getOrCreateWebDeviceId();
    const { appVersion, versionCode } = getCurrentWebVersion();
    const tokenRef = doc(db, 'device_fcm_tokens', deviceId);
    const existing = await getDoc(tokenRef).catch(() => null);
    const payload: Record<string, unknown> = {
      deviceId,
      token: token.slice(0, 512),
      platform: 'web',
      appVersion,
      versionCode,
      topicSubscribed: false,
      enabled: isGranted,
      updatedAt: serverTimestamp(),
    };
    if (!existing || !existing.exists()) {
      payload.createdAt = serverTimestamp();
    }
    await setDoc(tokenRef, payload, { merge: true });
    return true;
  } catch {
    return false;
  }
}

function setupWebForegroundPushListener(messaging: ReturnType<typeof getMessaging>): void {
  if (foregroundListenerInitialized) return;
  foregroundListenerInitialized = true;

  onMessage(messaging, (payload) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const data = payload.data ?? {};
    const title = payload.notification?.title || data.title || 'Quick Quiz';
    const body = payload.notification?.body || data.body || '';
    const broadcastId = data.broadcastId || data.releaseId || data.notifId || '';
    const dedupeKey = broadcastId
      ? `web_push_${broadcastId}`
      : `web_push_${title}_${body.slice(0, 40)}`;
    if (!markWebNotificationDedupeShown(dedupeKey)) return;

    const targetRoute = (data.targetRoute ||
      (data.type === 'app_update' ? 'app_update' : 'home')) as AdminDeepLinkPayload['targetRoute'];

    try {
      const notif = new Notification(title, {
        body,
        icon: '/images/ic_app_logo_192.png',
        badge: '/images/ic_app_logo_192.png',
        tag: dedupeKey,
      });
      notif.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent<AdminDeepLinkPayload>('quick-quiz:push-deeplink', {
            detail: {
              targetRoute,
              broadcastId,
              broadcastCategory: data.category,
              broadcastTitle: title,
              broadcastBody: body,
              referenceId: data.referenceId || broadcastId,
            },
          })
        );
      };
    } catch {
      // Ignore if browser blocks Notification constructor in favor of ServiceWorkerRegistration
    }
  });
}

/**
 * Extracts a deep-link payload if the user opened the Web app by tapping a closed-tab
 * Service Worker push notification (`/?pushRoute=...&broadcastId=...`).
 */
export function consumeWebUrlPushDeepLink(): AdminDeepLinkPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const pushRoute = url.searchParams.get('pushRoute')?.trim() ?? '';
    if (!pushRoute) return null;
    const broadcastId = url.searchParams.get('broadcastId')?.trim() ?? '';
    const releaseId = url.searchParams.get('releaseId')?.trim() ?? '';
    url.searchParams.delete('pushRoute');
    url.searchParams.delete('broadcastId');
    url.searchParams.delete('releaseId');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return {
      targetRoute: pushRoute as AdminDeepLinkPayload['targetRoute'],
      broadcastId: broadcastId || undefined,
      referenceId: broadcastId || releaseId || undefined,
    };
  } catch {
    return null;
  }
}
