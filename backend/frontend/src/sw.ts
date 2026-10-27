/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Precache static assets (manifest injected by vite-plugin-pwa); ignore ?city=&brgy= so shared links load offline
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/] });

// SPA routes (/report, /admin, ...) fall back to the cached app shell when offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Cache Google Fonts stylesheets
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Cache Google Fonts webfont files
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// --- Push Notifications ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; url?: string; tag?: string };
  try {
    data = event.data.json();
  } catch {
    data = { body: event.data.text() };
  }

  const title = data.title || 'Brownout Alert';
  const options: NotificationOptions = {
    body: data.body || 'New brownout schedule posted for your area.',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'brownout-alert',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only open pages on this site, whatever the push payload says
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          const navigated = client.url === url ? client : await client.navigate(url).catch(() => null);
          return (navigated ?? client).focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
