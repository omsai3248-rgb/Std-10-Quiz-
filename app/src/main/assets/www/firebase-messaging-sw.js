/* Quick Quiz Firebase Cloud Messaging Background Service Worker */
/* Handles real-time Web Push notifications when browser tab is closed or backgrounded. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDZ4WZ_p1guyUjbed1r79wsIB_Ry0-2LsA',
  authDomain: 'cobalt-heuristic-lbcxw.firebaseapp.com',
  projectId: 'cobalt-heuristic-lbcxw',
  storageBucket: 'cobalt-heuristic-lbcxw.firebasestorage.app',
  messagingSenderId: '284259719803',
  appId: '1:284259719803:web:5aad7165c2ba3e0d8160de',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload?.notification || {};
  const data = payload?.data || {};
  const title = notif.title || data.title || 'Quick Quiz';
  const body = notif.body || data.body || 'નવી સૂચના ઉપલબ્ધ છે.';
  const targetRoute = data.targetRoute || (data.type === 'app_update' ? 'app_update' : 'home');
  const broadcastId = data.broadcastId || data.releaseId || data.notifId || '';
  const tag = broadcastId ? `qq_fcm_${broadcastId}` : `qq_fcm_${title.slice(0, 24)}`;
  const url = `/?pushRoute=${encodeURIComponent(targetRoute)}${broadcastId ? `&broadcastId=${encodeURIComponent(broadcastId)}` : ''}`;

  return self.registration.showNotification(title, {
    body,
    icon: '/images/ic_app_logo_192.png',
    badge: '/images/ic_app_logo_192.png',
    tag,
    renotify: false,
    vibrate: [220, 110, 220],
    data: {
      ...data,
      targetRoute,
      broadcastId,
      url,
    },
  });
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
