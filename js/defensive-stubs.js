// 🛡️ Global Defensive Stubs & Fallback Handlers
// Prevents ReferenceError exceptions during offline cache transitions or before modular scripts finish loading
if (typeof document !== 'undefined') {
    window._domContentLoadedFired = document.readyState === 'complete';
    document.addEventListener('DOMContentLoaded', function() {
        window._domContentLoadedFired = true;
    }, { once: true });
}
window.openAuthorizedDevicesModal = function() {
    if (typeof hasPermission === 'function' && typeof currentStaff !== 'undefined' && currentStaff) {
        if (!hasPermission(currentStaff, 'can_manage_devices') && (!currentStaff.role || currentStaff.role.toLowerCase() !== 'admin')) {
            if (typeof showToast === 'function') showToast('Permission denied: Admin access required to manage devices.');
            return;
        }
    }
    const modal = document.getElementById('authorizedDevicesModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof renderAuthorizedDevicesHub === 'function') renderAuthorizedDevicesHub();
    }
};
window.closeAuthorizedDevicesModal = function() {
    const modal = document.getElementById('authorizedDevicesModal');
    if (modal) modal.style.display = 'none';
};
window.toggleKdsSound = function() {
    const disabled = localStorage.getItem('billnaw_kds_chime_disabled') === 'true';
    localStorage.setItem('billnaw_kds_chime_disabled', (!disabled) ? 'true' : 'false');
    const label = document.getElementById('kdsSoundLabel');
    if (label) label.innerText = !disabled ? 'Chime: OFF' : 'Chime: ON';
    if (disabled && typeof playKdsAudioChime === 'function') playKdsAudioChime();
};
window.openStatementModal = function() {
    if (typeof checkFloorServerModalBlock === 'function' && checkFloorServerModalBlock('statementModal')) return;
    if (typeof currentStaff !== 'undefined' && currentStaff && currentStaff.role) {
        const norm = (typeof normalizeRole === 'function') ? normalizeRole(currentStaff.role) : currentStaff.role;
        if (norm !== 'Admin') {
            if (typeof showToast === 'function') showToast('Admin authorization required to view statements.', 'error');
            return;
        }
    }
    const modal = document.getElementById('statementModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof renderStatements === 'function') renderStatements();
    }
};
window.closeStatementModal = function() {
    const modal = document.getElementById('statementModal');
    if (modal) modal.style.display = 'none';
};
window.openSwitchStoreModal = function() {
    if (typeof checkFloorServerModalBlock === 'function' && checkFloorServerModalBlock('switchStoreModal')) return;
    const modal = document.getElementById('switchStoreModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('targetStoreCodeInput');
        if (input) {
            input.value = (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || localStorage.getItem('bongbhoj_client_id') || '';
            setTimeout(() => input.focus(), 60);
        }
    }
};
window.confirmSwitchShopCode = async function() {
    if (typeof checkFloorServerModalBlock === 'function' && checkFloorServerModalBlock('switchStoreModal')) return;
    const input = document.getElementById('targetStoreCodeInput');
    const newCode = (input ? input.value : '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(newCode)) {
        if (typeof showToast === 'function') showToast('Please enter a valid Shop Store Code (3-64 chars).', 'error');
        return;
    }
    const activeToken = localStorage.getItem('billnaw_auth_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('billnaw_auth_token') : null);
    if (!activeToken || localStorage.getItem('billnaw_auth_mode') !== 'authenticated') {
        if (typeof showToast === 'function') showToast('Please sign in before switching stores.', 'error');
        if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
        return;
    }
    const modal = document.getElementById('switchStoreModal');
    if (modal) modal.style.display = 'none';
    if (typeof switchActiveShopCloudStore === 'function') {
        await switchActiveShopCloudStore(newCode);
    } else {
        if (typeof showToast === 'function') showToast('Store switcher is initializing. Please try again.', 'warning');
    }
};
window.forceCheckAppUpdate = async function() {
    if (typeof showToast === 'function') showToast('Checking for updates & clearing cache...', 'info');
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if (navigator.serviceWorker) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.update();
                if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        }
    } catch (e) {
        console.warn('forceCheckAppUpdate warning:', e);
    }
    if (typeof showToast === 'function') showToast('App cache purged! Reloading latest version...', 'success');
    setTimeout(() => {
        window.location.reload(true);
    }, 300);
};
window.openRestockExpenseModal = function(matId) {
    if (window.culinaryInventory && typeof window.culinaryInventory.openRestockModal === 'function') {
        window.culinaryInventory.openRestockModal(matId);
    } else if (typeof openRestockModal === 'function') {
        openRestockModal(matId);
    } else if (typeof showToast === 'function') {
        showToast('Opening restock...', 'info');
    }
};
window.closeInventoryHubSubView = function() {
    const el = document.getElementById('inventoryDetailedSubView');
    if (el) el.style.display = 'none';
};
window.generateSecureUniqueStaffPin = function() {
    const trivial = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);
    let pin;
    let count = 0;
    do {
        pin = String(Math.floor(1000 + Math.random() * 9000));
        count++;
        if (count > 200) break;
    } while (
        trivial.has(pin) ||
        /^(\d)\1{3}$/.test(pin) ||
        (typeof staffList !== 'undefined' && Array.isArray(staffList) && staffList.some(s => s.pin === pin))
    );
    return pin;
};
window.promptAdminAuthorizeTerminal = async function() {
    const pin = prompt("Enter 4-Digit Admin PIN to authorize this terminal:");
    if (!pin) return;
    const cleanPin = pin.trim();
    const hasStoredAdminPin = Boolean(
        (typeof shopProfile !== 'undefined' && shopProfile?.adminPinHash) ||
        localStorage.getItem('billnaw_admin_pin_hash') ||
        (typeof staffList !== 'undefined' && Array.isArray(staffList) && staffList.some(s => s && s.role === 'Admin' && (s.pin_hash || s.pinHash || s.pin)))
    );
    let isAdminPin = false;
    if (typeof verifyAdminPin === 'function') {
        isAdminPin = await verifyAdminPin(cleanPin);
    } else {
        const storedHash = (typeof shopProfile !== 'undefined' && shopProfile?.adminPinHash) || localStorage.getItem('billnaw_admin_pin_hash');
        if (storedHash && typeof hashString === 'function' && hashString(cleanPin) === storedHash) {
            isAdminPin = true;
        } else if (!hasStoredAdminPin && cleanPin === '1234') {
            isAdminPin = true;
        }
    }
    if (!isAdminPin && typeof staffList !== 'undefined' && Array.isArray(staffList)) {
        for (const s of staffList) {
            if (s && s.role === 'Admin') {
                if (typeof verifyStaffPin === 'function' && await verifyStaffPin(s, cleanPin)) {
                    isAdminPin = true;
                    break;
                } else if (s.pin && s.pin === cleanPin) {
                    isAdminPin = true;
                    break;
                }
            }
        }
    }

    if (isAdminPin) {
        if (typeof setMasterTerminal === 'function') setMasterTerminal(true);
        else {
            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        }
        const overlay = document.getElementById('devicePairingOverlay');
        if (overlay) overlay.style.display = 'none';
        if (typeof showToast === 'function') showToast('Terminal Authorized as Master Admin Terminal!', 'success');
        if (typeof initStoreCloudSync === 'function') initStoreCloudSync();
        else setTimeout(() => window.location.reload(), 300);
    } else {
        if (typeof showToast === 'function') showToast('Incorrect Admin PIN.', 'error');
    }
};
window.openAdminForgotPinModal = function() {
    const modal = document.getElementById('adminForgotPinModal');
    if (modal) {
        modal.style.display = 'flex';
        const emailInput = document.getElementById('forgotPinEmailInput');
        if (emailInput) {
            emailInput.value = (typeof shopProfile !== 'undefined' && (shopProfile?.ownerEmail || shopProfile?.email)) ||
                localStorage.getItem('billnaw_owner_email') || '';
            setTimeout(() => emailInput.focus(), 60);
        }
        const s1 = document.getElementById('forgotPinStep1');
        const s2 = document.getElementById('forgotPinStep2');
        if (s1) s1.style.display = 'block';
        if (s2) s2.style.display = 'none';
    }
};
window.closeAdminForgotPinModal = function() {
    const modal = document.getElementById('adminForgotPinModal');
    if (modal) modal.style.display = 'none';
    const fb1 = document.getElementById('forgotPinStep1Feedback');
    const fb2 = document.getElementById('forgotPinFeedback');
    if (fb1) fb1.innerHTML = '';
    if (fb2) fb2.innerHTML = '';
};
