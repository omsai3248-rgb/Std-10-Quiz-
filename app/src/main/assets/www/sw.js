/* Quick Quiz Web Service Worker — Auto-Update & Safe Offline Cache */
const BUILD_STAMP = '1.0.0-c1-local';
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
      try {
        const cache = await caches.open(CACHE_NAME);
        const urls = Array.isArray(data.extraUrls) && data.extraUrls.length > 0
          ? Array.from(new Set([...CORE_PRECACHE_URLS, ...data.extraUrls]))
          : CORE_PRECACHE_URLS;
        const total = urls.length;
        for (let i = 0; i < total; i += 1) {
          const url = urls[i];
          try {
            const res = await fetch(new Request(url, { cache: 'reload' }));
            if (res && res.ok) {
              await cache.put(url, res);
            }
          } catch {
            // Continue precaching remaining shell files
          }
          const pct = Math.min(92, Math.round(((i + 1) / total) * 85) + 5);
          if (port) {
            port.postMessage({ type: 'SW_PROGRESS', progressPercent: pct });
          }
        }
      } catch {
        // Ignore cache error and still activate
      }
      await self.skipWaiting();
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
