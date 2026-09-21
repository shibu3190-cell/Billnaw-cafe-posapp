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
        if (typeof updateAllUI === 'function') {
            updateAllUI();
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
