// ============================================================
// 🚀 APP.JS - Main Application Entry Point & Orchestration
// ============================================================

// Global script loader provided authoritatively by js/core.js


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
async function logoutShop() {
    if (typeof window.logoutShopCloudAccount === 'function' && window.logoutShopCloudAccount !== logoutShop) {
        return window.logoutShopCloudAccount();
    }

    const activeToken = localStorage.getItem('billnaw_auth_token');
    const activeEmail = localStorage.getItem('billnaw_auth_email');

    // 1. Unsubscribe from real-time Firestore listeners
    if (typeof window.detachFirestoreListener === 'function') {
        window.detachFirestoreListener();
    }
    if (typeof window.unsubscribeFirestoreListeners === 'function') {
        window.unsubscribeFirestoreListeners();
    }

    // 2. Notify backend to purge session and active OTP
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

    // 3. Sign out of Firebase Auth
    if (window.auth && typeof window.firebaseSignOut === 'function') {
        try {
            await window.firebaseSignOut(window.auth).catch(() => {});
        } catch (e) {}
    }
    window.currentAuthUser = null;

    // 4. Wipe tenant data from storage and IndexedDB
    try {
        if (typeof clearAllTenantLocalData === 'function') {
            await clearAllTenantLocalData();
        } else {
            localStorage.removeItem('billnaw_shop_session');
            localStorage.removeItem('billnaw_auth_token');
            localStorage.removeItem('billnaw_auth_email');
            localStorage.removeItem('billnaw_active_user');
            localStorage.removeItem('billnaw_auth_mode');
            localStorage.removeItem('billnaw_last_staff_id');
            localStorage.removeItem('billnaw_active_staff');
            localStorage.removeItem('billnaw_terminal_locked');
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear();
            }
        }
    } catch (e) {}

    // 5. Reset in-memory reactive state
    window.currentStaff = null;
    window.currentRole = null;
    if (typeof staffList !== 'undefined') staffList = [];
    if (typeof tablesInfo !== 'undefined') tablesInfo = [];
    if (typeof orderHistory !== 'undefined') orderHistory = [];
    if (typeof customersList !== 'undefined') customersList = [];
    if (typeof dailyExpenses !== 'undefined') dailyExpenses = [];

    if (typeof resetLoginOtpView === 'function') resetLoginOtpView();
    if (typeof resetSignupOtpView === 'function') resetSignupOtpView();

    updateCloudStoreTopbar(null, false, 'unauthenticated');
    if (typeof updateShopAuthUI === 'function') {
        updateShopAuthUI();
    }
    if (typeof showToast === 'function') {
        showToast('Logged out of cloud shop. Session destroyed.', 'info');
    }
    if (typeof openShopAuthModal === 'function') {
        openShopAuthModal(true);
    }
    if (typeof window !== 'undefined' && window.location) {
        setTimeout(() => {
            window.location.replace(window.location.origin + window.location.pathname + '?auth=login');
        }, 80);
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

        // Mandatory First-Device Registration & Strict Auth Gate:
        const hasAuthLoginParam = window.location.search && window.location.search.includes('auth=login');
        const activeToken = localStorage.getItem('billnaw_auth_token') || sessionStorage.getItem('billnaw_auth_token');
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const isAuth = activeToken && authMode === 'authenticated';
        const isDemo = authMode === 'demo';

        if ((hasAuthLoginParam || (!isAuth && !isDemo)) && typeof openShopAuthModal === 'function') {
            setTimeout(() => {
                const actOverlay = document.getElementById('activationOverlay');
                const isActivationShowing = actOverlay && actOverlay.style.display !== 'none';
                if (!isActivationShowing) {
                    openShopAuthModal(true);
                    if (!isAuth && !isDemo && !hasAuthLoginParam && typeof switchShopAuthTab === 'function') {
                        switchShopAuthTab('signup');
                    }
                    if (hasAuthLoginParam) {
                        try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e) {}
                    }
                }
            }, 60);
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
