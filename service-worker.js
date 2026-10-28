/**
 * service-worker.js
 * Billnaw Cafe POS - Zero-Data-Loss Service Worker v3.0.0
 * 
 * Strict Architecture Invariants:
 * 1. Cache Storage is strictly isolated to static application shell code.
 * 2. Persistent business databases (Firestore persistentLocalCache & IndexedDB) are NEVER cleared or manipulated by the SW.
 * 3. Stale-While-Revalidate caching strategy ensures instant offline boot while updating assets in the background.
 * 4. All API mutations (/api/*) and Firebase/Firestore requests bypass CacheStorage completely.
 */

const CACHE_VERSION = 'billnaw-pos-shell-v3.0.0';

const STATIC_SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './app.js',
  './icon-192.png',
  './icon-512.png',

  // Core Infrastructure
  './src/core/config.js',
  './src/core/db-client.js',
  './src/core/auth-guard.js',
  './src/core/rbac.js',
  './src/core/error-handler.js',
  './src/core/db-migrator.js',
  './src/core/platform-bridge.js',

  // Shared Design & Utils
  './src/shared/styles/tokens.css',
  './src/shared/styles/base.css',
  './src/shared/utils/currency.js',
  './src/shared/utils/gst-calculator.js',
  './src/shared/utils/invoice-id.js',
  './src/shared/components/modal.js',
  './src/shared/components/toast.js',
  './src/shared/components/pin-pad-modal.js',
  './src/shared/components/data-table.js',
  './src/shared/components/skeleton.js',

  // Feature Services
  './src/features/billing/billing.service.js',
  './src/features/tables/tables.service.js',
  './src/features/kot/kot.service.js',
  './src/features/menu/menu.service.js',
  './src/features/inventory/inventory.service.js',
  './src/features/customers/customers.service.js',
  './src/features/reports/reports.service.js',
  './src/features/settings/settings.service.js',
  './src/features/auth/auth.service.js',

  // Legacy Modules for Backward Compatibility
  './js/core.js',
  './js/pos.js',
  './js/menu.js',
  './js/customers.js',
  './js/dashboard.js',
  './js/staff.js',
  './js/settings.js',
  './js/marketing_inventory.js',
  './js/culinary_inventory.js'
];

// Install Phase: Pre-cache static shell without premature activation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log(`[SW] Pre-caching static application shell (${CACHE_VERSION})...`);
      return Promise.allSettled(
        STATIC_SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Pre-cache skipped for optional asset: ${url}`, err.message);
          })
        )
      );
    })
  );
});

// Activate Phase: Clean up previous shell caches, preserve IndexedDB, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            console.log('[SW] Purging outdated shell cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
    .then(() => self.clients.claim())
    .then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'DEPLOY_CACHE_UPDATED',
            version: CACHE_VERSION,
            timestamp: Date.now()
          });
        });
      });
    })
  );
});

// Fetch Phase: Stale-While-Revalidate for static shell; Network-only for mutations & APIs
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Strictly bypass non-GET requests (mutations, orders, batch syncs)
  if (req.method !== 'GET') {
    return;
  }

  // 2. Strictly bypass API endpoints and external cloud databases
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com')
  ) {
    return;
  }

  // 3. Stale-While-Revalidate for food photography (/uploads/food-images/*)
  if (url.pathname.startsWith('/uploads/food-images/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) => {
        return cache.match(req).then((cachedResponse) => {
          const fetchPromise = fetch(req)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(req, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. Stale-While-Revalidate for static assets
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch((networkErr) => {
            if (cachedResponse) return cachedResponse;

            if (req.headers.get('accept')?.includes('text/html')) {
              return cache.match('./index.html') || cache.match('/index.html');
            }

            throw networkErr;
          });

        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Message Bus: Inter-process coordination with UI layer
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.action === 'skipWaiting' || event.data.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting requested by UI');
    self.skipWaiting();
  }

  if (event.data.action === 'clearCache' || event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clear cache requested');
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
