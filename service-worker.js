// billnaw POS - Service Worker v2.5.0
const CACHE_VERSION = 'billnaw-pos-v2.5.0-' + Date.now();
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/core.js',
    './js/staff.js',
    './js/pos.js',
    './js/menu.js',
    './js/customers.js',
    './js/dashboard.js',
    './js/settings.js',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_VERSION) {
                        console.log('[SW] Clearing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim()).then(() => {
            // Broadcast update event to all active client windows
            return self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'DEPLOY_CACHE_UPDATED', version: CACHE_VERSION });
                });
            });
        })
    );
});

// Network-first for fresh deployment delivery with robust offline cache fallback
self.addEventListener('fetch', event => {
    // Bypass non-GET and API routes from SW cache
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_VERSION).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data && event.data.action === 'clearCache') {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    }
});
