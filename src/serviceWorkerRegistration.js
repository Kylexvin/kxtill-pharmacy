// src/serviceWorkerRegistration.js
// Robust CRA service worker registration helper for KxTill PWA.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

// Track registration globally so we can expose an update trigger.
let swRegistration = null;

export function register(config) {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return;
  }

  const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
  if (publicUrl.origin !== window.location.origin) {
    // Service worker won't work if PUBLIC_URL is on a different origin.
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    if (isLocalhost) {
      checkValidServiceWorker(swUrl, config);
      navigator.serviceWorker.ready.then(() => {
        console.log(
          '[KxTill SW] App is being served cache-first by a service worker. ' +
            'Visit https://cra.link/PWA to learn more.'
        );
      });
    } else {
      registerValidSW(swUrl, config);
    }
  });

  // Auto-reload when the user accepts an update (via config.onUpdate).
  let refreshing = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      swRegistration = registration;

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) return;

        installingWorker.onstatechange = () => {
          if (installingWorker.state !== 'installed') return;

          if (navigator.serviceWorker.controller) {
            console.log('[KxTill SW] New content is available; please refresh.');

            if (config?.onUpdate) {
              config.onUpdate(registration);
            }
          } else {
            console.log('[KxTill SW] Content is cached for offline use.');

            if (config?.onSuccess) {
              config.onSuccess(registration);
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('[KxTill SW] Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log(
        '[KxTill SW] No internet connection found. App is running in offline mode.'
      );
    });
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => console.error('[KxTill SW]', error.message));
}

/**
 * Imperatively trigger an SW update check.
 * Returns a promise that resolves to true if an update was found.
 */
export function promptForUpdate() {
  if (!swRegistration) return Promise.resolve(false);
  return swRegistration.update().then(() => true).catch(() => false);
}

/**
 * Tell the waiting SW to skip waiting and activate immediately.
 * Combined with the `controllerchange` listener above, this reloads the page.
 */
export function activateWaitingSW() {
  if (!swRegistration?.waiting) return;
  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
}