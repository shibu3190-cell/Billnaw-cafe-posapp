if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Track whether a SW was already controlling this page before registration.
        // Prevents first-time visitors from suffering a redundant full-page reload when SW claims the tab,
        // then flips to true once controlled so future deployments still auto-reload long-running POS tabs.
        let hadController = Boolean(navigator.serviceWorker.controller);

        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                console.log('[SW] ServiceWorker registered with scope:', reg.scope);
                reg.update().catch(() => {});
                if (reg.waiting && hadController) {
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

        // Auto-refresh ONLY when upgrading from an existing SW controller (skip first install & mid-upgrade)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController) {
                hadController = Boolean(navigator.serviceWorker.controller);
                return;
            }
            if (window._isApplyingAppUpdate) return;
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
