// ============================================================
// 🚀 APP.JS - Main Application Entry Point & Orchestration
// ============================================================

// Global Dynamic script loader for lazy-loading heavy vendor libraries (Chart.js, PDF.js, etc.)
window.loadedScripts = window.loadedScripts || {};
function loadLazyScript(src) {
    if (window.loadedScripts[src]) return window.loadedScripts[src];
    window.loadedScripts[src] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
    return window.loadedScripts[src];
}
window.loadLazyScript = loadLazyScript;

// Global Keyboard Shortcut Handlers
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        dismissTopModal();
        return;
    }

    if (event.key === 'Enter') {
        const activeId = document.activeElement ? document.activeElement.id : '';
        if (!activeId) return;
        if (activeId === 'activationKeyInput' && typeof activateSoftware === 'function') { activateSoftware(); document.activeElement.blur(); }
        if (activeId === 'adminPinInput' && typeof loginAsAdmin === 'function') { loginAsAdmin(); document.activeElement.blur(); }
        if (activeId === 'newCategoryName' && typeof addCategory === 'function') { addCategory(); }
        if (['newItemName', 'newItemPrice', 'newItemGst', 'newItemStock'].includes(activeId) && typeof addMenuItem === 'function') { 
            addMenuItem(); 
            const nameEl = document.getElementById('newItemName');
            if (nameEl) nameEl.focus(); 
        }
        if (['expenseName', 'expenseCost'].includes(activeId) && typeof addExpense === 'function') { 
            addExpense(); 
            const expEl = document.getElementById('expenseName');
            if (expEl) expEl.focus(); 
        }
        if (['checkoutCustomerName', 'checkoutBillerName'].includes(activeId) && typeof confirmCheckout === 'function') { 
            if (document.getElementById('checkoutModal') && document.getElementById('checkoutModal').style.display !== 'none') confirmCheckout(); 
        }
        if (['editCustomerName', 'editBillerName'].includes(activeId) && typeof saveEditedOrder === 'function') { 
            if (document.getElementById('editOrderModal') && document.getElementById('editOrderModal').style.display !== 'none') saveEditedOrder(); 
        }
        if (activeId === 'menuSearchInput') { document.activeElement.blur(); }
        if (['shopNameInput', 'shopAddressInput', 'fssaiInput', 'gstinInput', 'tableCountInput', 'startInvoiceInput', 'adminPinSetup', 'openAiKeyInput', 'upiIdInput'].includes(activeId)) { 
            if (typeof saveSettings === 'function') saveSettings(); 
            document.activeElement.blur(); 
        }
    }
});

// Dynamic Top Modal Dismissal (Clean hierarchy stack resolution)
function dismissTopModal() {
    const overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter(el => {
        if (!el || el.id === 'activationOverlay' || el.id === 'loginOverlay' || el.id === 'shopAuthModal') return false;
        if (el.style.display === 'none') return false;
        const comp = window.getComputedStyle(el);
        return comp.display !== 'none' && comp.visibility !== 'hidden';
    });
    if (overlays.length === 0) return false;
    
    // Sort by computed zIndex descending
    overlays.sort((a, b) => {
        const zA = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
        const zB = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
        return zB - zA;
    });
    
    const topModal = overlays[0];
    const closeBtn = topModal.querySelector('.modal-close-btn');
    if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
    } else {
        topModal.style.display = 'none';
    }
    return true;
}
window.dismissTopModal = dismissTopModal;

// Modal Backdrop Click Dismissal
document.addEventListener('click', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
        if (e.target.id === 'activationOverlay' || e.target.id === 'loginOverlay' || e.target.id === 'shopAuthModal') return;
        const closeBtn = e.target.querySelector('.modal-close-btn');
        if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
        } else {
            e.target.style.display = 'none';
        }
    }
});

// Topbar Cloud Auth & Shop Branding Orchestration
function updateCloudStoreTopbar(ownerEmailOrShopName = null, isOnline = null, mode = null) {
    try {
        const authMode = mode || localStorage.getItem('billnaw_auth_mode') || 'guest';
        const topbarShopName = document.getElementById('topbarShopName');
        const authStatusEl = document.getElementById('topbarAuthStatus');
        const cloudBtn = document.getElementById('topbarCloudAuthBtn');
        const activeStoreCode = localStorage.getItem('billnaw_store_code');

        if (topbarShopName) {
            if (typeof shopProfile !== 'undefined' && shopProfile.name && shopProfile.name !== 'billnaw') {
                topbarShopName.innerText = shopProfile.name;
            } else if (ownerEmailOrShopName && !ownerEmailOrShopName.includes('@')) {
                topbarShopName.innerText = ownerEmailOrShopName;
            }
        }

        if (authStatusEl) {
            if (authMode === 'authenticated') {
                authStatusEl.innerText = 'Cloud Store ✓';
                if (cloudBtn) {
                    cloudBtn.classList.add('authenticated');
                    const label = ownerEmailOrShopName || activeStoreCode || 'Active Cloud';
                    cloudBtn.title = `Cloud Store Connected: ${label} (Click to manage)`;
                }
            } else if (authMode === 'demo') {
                authStatusEl.innerText = 'Demo POS';
                if (cloudBtn) {
                    cloudBtn.classList.remove('authenticated');
                    cloudBtn.title = 'Demo POS Mode (Click to Sign In / Connect Cloud)';
                }
            } else {
                authStatusEl.innerText = 'Cloud Shop';
                if (cloudBtn) {
                    cloudBtn.classList.remove('authenticated');
                    cloudBtn.title = 'Shop Cloud Account & Fast Sign In';
                }
            }
        }
    } catch (e) {
        console.warn("Error updating cloud store topbar:", e);
    }
}
window.updateCloudStoreTopbar = updateCloudStoreTopbar;

// Restore saved cloud shop session from localStorage
function restoreShopSession() {
    try {
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const sessionRaw = localStorage.getItem('billnaw_shop_session');
        if (authMode === 'authenticated' && sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session) {
                if (session.storeCode) {
                    localStorage.setItem('billnaw_store_code', session.storeCode);
                    if (typeof myClientID !== 'undefined') myClientID = session.storeCode;
                }
                if (session.shop && session.shop.name && typeof shopProfile !== 'undefined') {
                    shopProfile.name = session.shop.name;
                }
                // Re-authenticate Firebase Custom Token if window.auth is ready and token is signed by Google Service Account (RS256)
                if (session.customToken && window.auth && typeof window.firebaseSignInWithCustomToken === 'function') {
                    const isGoogleToken = typeof window.isGoogleFirebaseCustomToken === 'function' 
                        ? window.isGoogleFirebaseCustomToken(session.customToken)
                        : (function(t) {
                            try {
                                const parts = String(t).split('.');
                                if (parts.length !== 3) return false;
                                const h = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
                                return h && h.alg === 'RS256';
                            } catch(e) { return false; }
                        })(session.customToken);

                    if (isGoogleToken) {
                        window.firebaseSignInWithCustomToken(window.auth, session.customToken).catch(() => {
                            console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                        });
                    } else {
                        console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                    }
                }
                updateCloudStoreTopbar(session.user?.email || session.shop?.name || session.storeCode, true);
            }
        } else if (authMode === 'demo') {
            updateCloudStoreTopbar(null, false, 'demo');
        }
    } catch (e) {
        console.warn("Failed to restore shop session:", e);
    }
}
window.restoreShopSession = restoreShopSession;

// Sign out of Cloud Shop and return to Demo POS / Auth screen
function logoutShop() {
    if (typeof window.logoutShopCloudAccount === 'function' && window.logoutShopCloudAccount !== logoutShop) {
        return window.logoutShopCloudAccount();
    }

    const activeToken = localStorage.getItem('billnaw_auth_token');
    const activeEmail = localStorage.getItem('billnaw_auth_email');

    // Notify backend to purge session and active OTP
    try {
        if (typeof fetch === 'function') {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                },
                body: JSON.stringify({ token: activeToken, email: activeEmail })
            }).catch(() => {});
        }
    } catch (e) {}

    if (window.auth && typeof window.firebaseSignOut === 'function') {
        try {
            window.firebaseSignOut(window.auth).catch(() => {});
        } catch (e) {}
    }
    window.currentAuthUser = null;
    try {
        localStorage.removeItem('billnaw_shop_session');
        localStorage.removeItem('billnaw_auth_token');
        localStorage.removeItem('billnaw_auth_email');
        localStorage.removeItem('billnaw_active_user');
        localStorage.setItem('billnaw_auth_mode', 'demo');
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
    } catch (e) {}

    if (typeof resetLoginOtpView === 'function') resetLoginOtpView();
    if (typeof resetSignupOtpView === 'function') resetSignupOtpView();

    updateCloudStoreTopbar(null, false, 'demo');
    if (typeof updateShopAuthUI === 'function') {
        updateShopAuthUI();
    }
    if (typeof showToast === 'function') {
        showToast('Logged out of cloud shop. Session destroyed.', 'info');
    }
    if (typeof openShopAuthModal === 'function') {
        openShopAuthModal();
    }
    if (typeof window !== 'undefined' && window.location) {
        setTimeout(() => {
            window.location.replace(window.location.origin + window.location.pathname + '?auth=login');
        }, 120);
    }
}
window.logoutShop = logoutShop;
window.logoutShopCloudAccount = logoutShop;

// App Bootstrap Initialization
async function initApp() {
    try {
        if (typeof initDatabase === 'function') {
            await initDatabase();
        }
        if (typeof initStaffSystem === 'function') {
            initStaffSystem();
        }
        if (typeof initFirestoreSync === 'function') {
            initFirestoreSync();
        }
        if (typeof restoreShopSession === 'function') {
            restoreShopSession();
        }
        if (typeof updateCloudStoreTopbar === 'function') {
            updateCloudStoreTopbar();
        }
        if (typeof updateAllUI === 'function') {
            updateAllUI();
        }
        if (typeof renderVoiceHistoryChips === 'function') {
            renderVoiceHistoryChips();
        }
        if (typeof renderInventoryTelemetryUI === 'function') {
            renderInventoryTelemetryUI();
        }

        // Present Shop Auth Modal if query string contains ?auth=login
        const hasAuthLoginParam = window.location.search && window.location.search.includes('auth=login');

        if (hasAuthLoginParam && typeof openShopAuthModal === 'function') {
            setTimeout(() => {
                const actOverlay = document.getElementById('activationOverlay');
                const logOverlay = document.getElementById('loginOverlay');
                const isActivationShowing = actOverlay && actOverlay.style.display !== 'none';
                const isLoginShowing = logOverlay && logOverlay.style.display !== 'none';
                if (!isActivationShowing && !isLoginShowing) {
                    openShopAuthModal(true);
                    if (hasAuthLoginParam) {
                        try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e) {}
                    }
                }
            }, 120);
        }
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

// Kick off initialization on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
