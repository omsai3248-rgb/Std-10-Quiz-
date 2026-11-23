/* Quick Quiz Web Service Worker — Auto-Update & Safe Offline Cache */
const BUILD_STAMP = '__QUICK_QUIZ_SW_STAMP__';
const CACHE_PREFIX = 'quick-quiz-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_STAMP}`;

const CORE_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/fonts/anek_gujarati.ttf',
  '/images/ic_app_logo.png',
  '/images/ic_app_logo_192.png',
];

self.addEventListener('install', (event) => {
  // Never force-evict active tabs silently; wait until user taps "Update Now"
  // unless there is no active controller yet (very first install).
  const isFirstInstall = !self.registration || !self.registration.active;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of CORE_PRECACHE_URLS) {
        try {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (res && res.ok) {
            await cache.put(url, res);
          }
        } catch {
          // Ignore individual optional asset failure during install
        }
      }
      if (isFirstInstall) {
        await self.skipWaiting();
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SW_SKIP_WAITING') {
    const port = event.ports && event.ports[0];
    (async () => {
      if (port) {
        port.postMessage({ type: 'SW_PROGRESS', progressPercent: 60 });
      }
      try {
        await self.skipWaiting();
      } catch {
        // Ignore skipWaiting failure
      }
      if (port) {
        port.postMessage({ type: 'SW_ACTIVATING', progressPercent: 98 });
      }
    })();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only handle same-origin HTTP(S) requests; never intercept Firebase/Google/GitHub APIs
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).catch(() => caches.match(req))
    );
    return;
  }

  // Navigation requests: network-first with index.html offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return caches.match('/');
        }
      })()
    );
    return;
  }

  // Hashed Vite assets & bundled fonts/images: cache-first, populate on miss
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/images/')
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      })()
    );
  }
});

// =========================================================================
// Web Push Notification Delivery & Deep-Link Click Routing (Closed/Background Tabs)
// =========================================================================

self.addEventListener('push', (event) => {
  if (!event) return;
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    const text = event.data ? event.data.text() : '';
    payload = { notification: { title: 'Quick Quiz', body: text } };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || 'Quick Quiz';
  const body = notif.body || data.body || 'નવી સૂચના ઉપલબ્ધ છે.';
  const targetRoute = data.targetRoute || (data.type === 'app_update' ? 'app_update' : 'home');
  const broadcastId = data.broadcastId || data.releaseId || data.notifId || '';
  const tag = notif.tag || (broadcastId ? `qq_push_${broadcastId}` : `qq_push_${title.slice(0, 24)}`);
  const deepLinkUrl =
    data.url ||
    `/?pushRoute=${encodeURIComponent(targetRoute)}${broadcastId ? `&broadcastId=${encodeURIComponent(broadcastId)}` : ''}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: notif.icon || '/images/ic_app_logo_192.png?v=2',
      badge: notif.badge || '/images/ic_app_logo_192.png?v=2',
      tag,
      renotify: false,
      vibrate: [220, 110, 220],
      requireInteraction: false,
      data: {
        ...data,
        targetRoute,
        broadcastId,
        url: deepLinkUrl,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetRoute = data.targetRoute || 'home';
  const broadcastId = data.broadcastId || data.releaseId || '';
  const targetUrl =
    data.url ||
    `/?pushRoute=${encodeURIComponent(targetRoute)}${broadcastId ? `&broadcastId=${encodeURIComponent(broadcastId)}` : ''}`;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'QUICK_QUIZ_NOTIFICATION_CLICK',
            targetRoute,
            broadcastId,
            broadcastTitle: data.title || '',
            broadcastBody: data.body || '',
            broadcastCategory: data.category || '',
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

