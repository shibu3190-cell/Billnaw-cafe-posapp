if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                console.log('[SW] ServiceWorker registered with scope:', reg.scope);
                reg.update().catch(() => {});
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                // Check for SW updates periodically
                setInterval(() => {
                    reg.update().catch(() => {});
                }, 10 * 60 * 1000);
            })
            .catch(err => {
                console.warn('[SW] Registration failed:', err);
            });

        // Auto-refresh when new deployment service worker takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                console.log('[SW] New deployment detected, refreshing for latest version...');
                window.location.reload();
            }
        });

        // Receive messages from SW
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'DEPLOY_CACHE_UPDATED') {
                console.log('[SW] Deploy cache updated to:', event.data.version);
            }
        });
    });
}
