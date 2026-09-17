// src/service-worker.js
// KxTill PWA service worker — Workbox powered.

/* eslint-disable no-restricted-globals */

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  StaleWhileRevalidate,
  NetworkFirst,
  CacheFirst,
} from 'workbox-strategies';

clientsClaim();
self.skipWaiting();

// ---- Precache build assets ----
precacheAndRoute(self.__WB_MANIFEST, {
  // Ignore URL params for matching precached entries.
  ignoreURLParametersMatching: [/.*/],
});

// ---- App shell fallback ----
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
const navigationRoute = new NavigationRoute(
  createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html'),
  {
    denylist: [
      // Skip SW-served internals.
      new RegExp('^/_'),
      // Skip files with extensions (assets, images, etc.).
      fileExtensionRegexp,
      // Skip API calls.
      new RegExp('^/api/'),
    ],
  }
);
registerRoute(navigationRoute);

// ---- API: Network-first with short timeout ----
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'kxtill-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  })
);

// ---- Images: Cache-first (they rarely change) ----
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'kxtill-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---- Fonts: Cache-first, long-lived ----
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'kxtill-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---- JS/CSS: Stale-while-revalidate ----
registerRoute(
  ({ request }) =>
    request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({
    cacheName: 'kxtill-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---- Messages from the page ----
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* eslint-enable no-restricted-globals */