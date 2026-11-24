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

const CACHE_VERSION = 'billnaw-pos-shell-v4.1.0';
const ASSET_VER = '3002';

// Core boot shell cached eagerly in small batches matching index.html ?v= query strings
// so even the very first warm reload hits CacheStorage in 0ms without 304 round-trips
const CRITICAL_BOOT_ASSETS = [
  './',
  './index.html',
  `./style.css?v=${ASSET_VER}`,
  './manifest.json',
  `./js/defensive-stubs.js?v=${ASSET_VER}`,
  `./js/firebase-init.js?v=${ASSET_VER}`,
  `./js/sw-register.js?v=${ASSET_VER}`,
  `./js/device-identity.js?v=${ASSET_VER}`,
  `./js/core.js?v=${ASSET_VER}`,
  `./js/staff.js?v=${ASSET_VER}`,
  `./js/pos.js?v=${ASSET_VER}`,
  `./js/menu.js?v=${ASSET_VER}`,
  `./js/customers.js?v=${ASSET_VER}`,
  `./js/dashboard.js?v=${ASSET_VER}`,
  `./js/marketing_inventory.js?v=${ASSET_VER}`,
  `./js/culinary_inventory.js?v=${ASSET_VER}`,
  `./js/settings.js?v=${ASSET_VER}`,
  `./app.js?v=${ASSET_VER}`,
  `./js/shop-auth.js?v=${ASSET_VER}`,
  `./js/cloud-sync.js?v=${ASSET_VER}`,
  `./js/feature-controllers.js?v=${ASSET_VER}`
];

const STATIC_SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './app.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico',

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

  // Feature Services & Modular UI
  './src/features/billing/billing.service.js',
  './src/features/tables/tables.service.js',
  './src/features/tables/tables.ui.js',
  './src/features/kot/kot.service.js',
  './src/features/kot/kot.ui.js',
  './src/features/menu/menu.service.js',
  './src/features/inventory/inventory.service.js',
  './src/features/customers/customers.service.js',
  './src/features/reports/reports.service.js',
  './src/features/settings/settings.service.js',
  './src/features/auth/auth.service.js',

  // Extracted Modular Application Controllers
  './js/defensive-stubs.js',
  './js/firebase-init.js',
  './js/sw-register.js',
  './js/device-identity.js',
  './js/shop-auth.js',
  './js/feature-controllers.js',

  // Legacy Modules for Backward Compatibility
  './js/core.js',
  './js/pos.js',
  './js/menu.js',
  './js/customers.js',
  './js/dashboard.js',
  './js/staff.js',
  './js/settings.js',
  './js/marketing_inventory.js',
  './js/culinary_inventory.js',
  './js/cloud-sync.js'
];

// Helper: Pre-cache in small concurrent batches using cache:'no-cache' for unversioned paths
// so stale HTTP disk cache never poisons a brand-new SW deployment
async function precacheInBatches(cache, urls, batchSize = 4) {
  for (let i = 0; i < urls.length; i += batchSize) {
    const slice = urls.slice(i, i + batchSize);
    await Promise.allSettled(
      slice.map(async (url) => {
        try {
          const hasVer = url.includes('?v=');
          const req = hasVer ? new Request(url) : new Request(url, { cache: 'no-cache' });
          const res = await fetch(req);
          if (res && res.status === 200) {
            await cache.put(url, res);
          }
        } catch (err) {
          console.warn(`[SW] Pre-cache skipped for optional asset: ${url}`, err.message);
        }
      })
    );
  }
}

// Install Phase: Pre-cache critical boot shell + deduplicated /src/* modules in gentle batches
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      console.log(`[SW] Pre-caching application shell (${CACHE_VERSION})...`);
      await precacheInBatches(cache, CRITICAL_BOOT_ASSETS, 4);
      // Deduplicate by base path (strip ?v=...) so we never double-download versioned JS/CSS files
      const criticalBasePaths = new Set(CRITICAL_BOOT_ASSETS.map((u) => u.split('?')[0]));
      const secondaryAssets = STATIC_SHELL_ASSETS.filter((u) => !criticalBasePaths.has(u.split('?')[0]));
      await precacheInBatches(cache, secondaryAssets, 4);
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

  // 4. Smart caching for static assets:
  //    - HTML documents: Network-First with fast 1200ms cache fallback (fresh deploys on WiFi, instant boot on slow 3G)
  //    - Versioned/static JS & CSS: True Stale-While-Revalidate (0ms cache hit + background refresh; exact ?v= query match)
  const isHtmlDocument =
    req.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');
  const isVersionedScriptOrStyle =
    Boolean(url.search) &&
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));
  const isCodeAsset =
    isHtmlDocument ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => {
      // Exact query match for versioned ?v= assets so v3001 never serves stale v3000
      const matchOpts = isVersionedScriptOrStyle ? { ignoreSearch: false } : { ignoreSearch: true };
      return cache.match(req, matchOpts).then((cachedResponse) => {
        // Fast path: versioned ?v= JS/CSS already cached in this shell version is immutable -> 0ms hit, zero network waste
        if (isCodeAsset && isVersionedScriptOrStyle && cachedResponse) {
          return cachedResponse;
        }

        // For unversioned code assets (HTML & /src/* modules), bypass HTTP disk cache on network fetch
        // so SWR revalidation always pulls fresh deploys from origin.
        const networkReq = (isCodeAsset && !isVersionedScriptOrStyle)
          ? new Request(req, { cache: 'no-cache' })
          : req;

        const fetchPromise = fetch(networkReq)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(async (networkErr) => {
            if (cachedResponse) return cachedResponse;

            // Offline fallback: match ignoring query string if exact versioned entry wasn't cached yet
            const looseMatch = await cache.match(req, { ignoreSearch: true });
            if (looseMatch) return looseMatch;

            if (req.headers.get('accept')?.includes('text/html')) {
              const fallbackHtml = (await cache.match('./index.html', { ignoreSearch: true })) || (await cache.match('/index.html', { ignoreSearch: true }));
              if (fallbackHtml) return fallbackHtml;
            }

            throw networkErr;
          });

        if (isCodeAsset) {
          if (isHtmlDocument) {
            // Network-First with fast 1200ms fallback to cached HTML so slow 3G never stalls
            if (cachedResponse) {
              const timeoutFallback = new Promise((resolve) => {
                setTimeout(() => resolve(cachedResponse), 1200);
              });
              event.waitUntil(fetchPromise.catch(() => {}));
              return Promise.race([fetchPromise, timeoutFallback]);
            }
            return fetchPromise;
          }
          // True Stale-While-Revalidate for unversioned JS & CSS: serve cached immediately, update in background
          if (cachedResponse) {
            event.waitUntil(fetchPromise.catch(() => {}));
            return cachedResponse;
          }
          return fetchPromise;
        }
        if (cachedResponse) {
          event.waitUntil(fetchPromise.catch(() => {}));
          return cachedResponse;
        }
        return fetchPromise;
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
    const clearPromise = caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(clearPromise);
    }
  }
});
