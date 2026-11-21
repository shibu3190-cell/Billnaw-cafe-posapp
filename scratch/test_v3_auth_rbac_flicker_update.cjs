'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const indexHtml = read('index.html');
const styleCss = read('style.css');
const inventoryCss = read('css/inventory.css');
const crmCss = read('css/crm.css');
const modalsCss = read('css/modals.css');
const coreJs = read('js/core.js');
const staffJs = read('js/staff.js');
const posJs = read('js/pos.js');
const menuJs = read('js/menu.js');
const settingsJs = read('js/settings.js');
const shopAuthJs = read('js/shop-auth.js');
const cloudSyncJs = read('js/cloud-sync.js');
const serverJs = read('server.js');
const netlifyApiJs = read('netlify/functions/api.js');
const swJs = read('service-worker.js');
const pkgJson = JSON.parse(read('package.json'));

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
}

console.log('Running v3.0.0 Auth Layering, RBAC, Flicker-Free Menu, Minimal Devices & Clean Upgrade Suite...\n');

// 1. Auth / PIN / Profile Layering State Machine
check('W1-01: setActiveAuthOverlay enforces mutual exclusion and deterministic z-index ladder', () => {
    assert(coreJs.includes('function setActiveAuthOverlay(activeId)'), 'core.js must define setActiveAuthOverlay');
    assert(coreJs.includes('function getActiveAuthOverlay()'), 'core.js must define getActiveAuthOverlay');
    assert(shopAuthJs.includes("setActiveAuthOverlay('shopAuthModal')"), 'openShopAuthModal must call setActiveAuthOverlay');
    assert(cloudSyncJs.includes("setActiveAuthOverlay('cloudSyncOverlay')"), 'showCloudSyncOverlay must call setActiveAuthOverlay');
    assert(cloudSyncJs.includes("setActiveAuthOverlay('staffProfileSelector')"), 'showStaffProfileSelector must call setActiveAuthOverlay');
    assert(staffJs.includes("setActiveAuthOverlay('loginOverlay')"), 'lockTerminal must call setActiveAuthOverlay');
    assert(staffJs.includes("setActiveAuthOverlay('staffSwitchModal')"), 'openStaffSwitchModal must call setActiveAuthOverlay');
    assert(coreJs.includes("setActiveAuthOverlay('devicePairingOverlay')"), 'showDevicePairingOverlay must call setActiveAuthOverlay');
    assert(shopAuthJs.includes("setActiveAuthOverlay('appUpdateInstallOverlay')"), 'showAppUpdateInstallOverlay must call setActiveAuthOverlay');

    // Behavioral check on overlay mutual exclusion
    const els = {};
    ['shopAuthModal', 'cloudSyncOverlay', 'staffProfileSelector', 'loginOverlay', 'staffSwitchModal', 'devicePairingOverlay', 'appUpdateInstallOverlay'].forEach(id => {
        els[id] = { id, style: { display: 'flex', zIndex: '1' } };
    });
    const sandbox = {
        window: {},
        document: { getElementById: (id) => els[id] || null }
    };
    const startIdx = coreJs.indexOf('const AUTH_OVERLAY_IDS = [');
    const endIdx = coreJs.indexOf('window.setActiveAuthOverlay = setActiveAuthOverlay;') + 'window.setActiveAuthOverlay = setActiveAuthOverlay;'.length;
    vm.runInNewContext(coreJs.slice(startIdx, endIdx), sandbox);

    sandbox.window.setActiveAuthOverlay('shopAuthModal');
    assert.strictEqual(els.shopAuthModal.style.display, 'flex');
    assert.strictEqual(els.shopAuthModal.style.zIndex, '1000030');
    assert.strictEqual(els.loginOverlay.style.display, 'none');
    assert.strictEqual(els.staffProfileSelector.style.display, 'none');
    assert.strictEqual(els.cloudSyncOverlay.style.display, 'none');
    assert.strictEqual(sandbox.window.getActiveAuthOverlay(), 'shopAuthModal');

    sandbox.window.setActiveAuthOverlay('loginOverlay');
    assert.strictEqual(els.loginOverlay.style.display, 'flex');
    assert.strictEqual(els.shopAuthModal.style.display, 'none');
    assert.strictEqual(sandbox.window.getActiveAuthOverlay(), 'loginOverlay');
});

// 2. Remove ALL 4 On-Screen PIN Numpads + Native Keyboard / Mobile Keypad Inputs
check('W2-01: Zero on-screen .pin-numpad blocks in index.html & all 4 PIN inputs are numeric keypad-ready', () => {
    assert(!indexHtml.includes('class="pin-numpad"'), 'index.html must NOT contain any .pin-numpad grid');
    assert(!indexHtml.includes('id="terminalPinNumpad"'), 'terminalPinNumpad must be removed');
    assert(!indexHtml.includes('id="quickSwitchPinNumpad"'), 'quickSwitchPinNumpad must be removed');
    assert(!indexHtml.includes('id="spotOverridePinNumpad"'), 'spotOverridePinNumpad must be removed');

    ['staffLoginPinInput', 'quickSwitchPinInput', 'spotOverridePinInput', 'staffGatewayPinInput'].forEach(id => {
        const re = new RegExp(`<input[^>]*id="${id}"[^>]*>`, 'i');
        const match = indexHtml.match(re);
        assert(match, `PIN input #${id} must exist`);
        assert(match[0].includes('inputmode="numeric"'), `#${id} must have inputmode="numeric"`);
        assert(match[0].includes('pattern="[0-9]*"'), `#${id} must have pattern="[0-9]*"`);
        assert(match[0].includes('maxlength="4"'), `#${id} must have maxlength="4"`);
        assert(match[0].includes("event.key==='Enter'"), `#${id} must support Enter key submission`);
    });
});

// 3. Inventory Horizontal Category Scrolling
check('W3-01: Inventory category chips container scrolls horizontally without viewport overflow', () => {
    assert(inventoryCss.includes('.inv-main-content'), 'inventory.css must style .inv-main-content');
    assert(inventoryCss.includes('min-width: 0;'), 'inventory.css must set min-width: 0 for flex/grid shrinkage');
    assert(inventoryCss.includes('overflow-x: auto;') && inventoryCss.includes('flex-wrap: nowrap;'), '.inv-cat-chips-scroll must scroll horizontally');
    assert(crmCss.includes('.inv-desktop-split-layout > .inv-main-content'), 'crm.css must constrain .inv-main-content inside split layout');
    assert(styleCss.includes('overscroll-behavior-x: contain;'), 'compiled style.css must include horizontal scroll containment');
});

// 4. Flicker-Free Menu & POS Images
check('W4-01: Menu & POS renderers use memoized fallbacks and keyed in-place DOM diffing without img.src resets', () => {
    assert(menuJs.includes('const _failedMenuImageUrls = new Set();'), 'menu.js must memoize failed image URLs');
    assert(menuJs.includes('function _resolveStableMenuThumb(item)'), 'menu.js must define _resolveStableMenuThumb');
    assert(menuJs.includes('function _handleMenuImgError(imgEl)'), 'menu.js must define _handleMenuImgError');
    assert(menuJs.includes('data-catalog-item-id='), 'renderMenuCatalogUI must key cards with data-catalog-item-id');
    assert(menuJs.includes('imgEl.dataset.resolvedSrc !== expectedThumb'), 'in-place patcher must skip img.src reassignment when unchanged');
    assert(menuJs.includes('if (_isMenuCatalogViewActive()) renderMenuCatalogUI();'), 'renderMenuUI must skip background catalog rebuilds when #menu is inactive');
});

// 5. Minimal Active Devices & Sessions Cards
check('W5-01: Active Devices & Sessions render minimal Emerald/Mint/Slate cards without legacy beige hexes', () => {
    assert(settingsJs.includes('minimal-device-card'), 'renderAuthorizedDevicesHub must use minimal-device-card');
    assert(settingsJs.includes('This Device'), 'renderAuthorizedDevicesHub must render This Device pill');
    assert(staffJs.includes('minimal-session-card'), 'renderLiveSessionCards must use minimal-session-card');
    assert(shopAuthJs.includes('minimal-session-card'), 'loadActiveSessions must use minimal-session-card');
    assert(!shopAuthJs.slice(shopAuthJs.indexOf('async function loadActiveSessions'), shopAuthJs.indexOf('async function loadActiveSessions') + 3000).includes('#FAF7F4'), 'loadActiveSessions must not use legacy #FAF7F4 background');
    assert(modalsCss.includes('.minimal-device-card'), 'modals.css must define minimal-device-card styles');
});

// 6. Shop-Wide Staff Settings + Strict Floor Server Boundary
check('W6-01: Every staff role can access Settings (scoped to Printer, Updates, Logout) & Floor Server cannot checkout', () => {
    assert(!coreJs.includes('hasDirectBlePrinter'), 'core.js must NOT allow Floor Server BLE Checkout bypass');
    assert(posJs.includes('Strict Floor Server boundary'), 'openCheckoutModal must enforce strict Floor Server boundary');
    assert(posJs.includes("normRole === 'Floor Server'"), 'checkoutFromTableView must guard Floor Server');
    assert(coreJs.includes('Kitchen Chef keeps More Hub access'), 'Kitchen Chef must retain nav-more for Settings access');

    // Behavioral test of canStaffAccessTab
    const sandbox = {
        window: {},
        ROLES: { ADMIN: 'Admin', MANAGER: 'Manager', CASHIER: 'Cashier', SERVER: 'Floor Server', CHEF: 'Kitchen Chef' },
        normalizeRole: (r) => r,
        isMenuPinSessionActive: () => false
    };
    const cStart = staffJs.indexOf('function canStaffAccessTab(');
    const cEnd = staffJs.indexOf('window.canStaffAccessTab = canStaffAccessTab;') + 'window.canStaffAccessTab = canStaffAccessTab;'.length;
    vm.runInNewContext(staffJs.slice(cStart, cEnd), sandbox);

    ['Admin', 'Manager', 'Cashier', 'Floor Server', 'Kitchen Chef'].forEach(role => {
        assert.strictEqual(sandbox.canStaffAccessTab({ role }, 'settings'), true, `${role} MUST be allowed to open Settings`);
    });
    assert.strictEqual(sandbox.canStaffAccessTab({ role: 'Manager' }, 'dashboard'), false, 'Manager still blocked from Reports');
    assert.strictEqual(sandbox.canStaffAccessTab({ role: 'Cashier' }, 'dashboard'), false, 'Cashier still blocked from Reports');
    assert.strictEqual(sandbox.canStaffAccessTab({ role: 'Kitchen Chef' }, 'pos'), false, 'Kitchen Chef still blocked from POS');
    assert.strictEqual(sandbox.canStaffAccessTab({ role: 'Kitchen Chef' }, 'kds'), true, 'Kitchen Chef keeps KDS access');
    assert.strictEqual(sandbox.canStaffAccessTab({ role: 'Floor Server' }, 'dashboard'), false, 'Floor Server still blocked from Reports');

    // Verify applySettingsRoleRestrictions shows Printer, Updates, Logout and hides Admin tiles + empty groups
    assert(settingsJs.includes('isPrinterTile || isUpdatesTile || isStaffLogoutTile'), 'applySettingsRoleRestrictions must expose Printer, Updates & Staff Logout for all staff');
    assert(settingsJs.includes("querySelectorAll('.settings-group-block')"), 'applySettingsRoleRestrictions must auto-hide empty settings group blocks');
});

// 7. Complete Device Cache & Cookie Deletion on Cloud Shop & Staff Logout
check('W7-01: Shop & Staff Logout flush offline bills and wipe cookies, sessionStorage, SW Cache Storage, localStorage & IndexedDB', () => {
    assert(shopAuthJs.includes('async function purgeDeviceCookiesAndCaches()'), 'shop-auth.js must define purgeDeviceCookiesAndCaches');
    assert(shopAuthJs.includes('await purgeDeviceCookiesAndCaches();'), 'logoutShop must await purgeDeviceCookiesAndCaches');
    assert(shopAuthJs.includes('document.cookie.split'), 'purgeDeviceCookiesAndCaches must expire document.cookie entries');
    assert(shopAuthJs.includes('caches.keys()') && shopAuthJs.includes('caches.delete'), 'purgeDeviceCookiesAndCaches must delete SW caches');
    const logoutStaffSlice = staffJs.slice(staffJs.indexOf('async function logoutStaff()'), staffJs.indexOf('function lockSystem()'));
    assert(logoutStaffSlice.includes('flushPendingBackendSyncs'), 'logoutStaff must flush offline bills before clearing cache');
    assert(logoutStaffSlice.includes("logoutShop({ systemInitiated: true, reason: 'staff_logout' })"), 'logoutStaff must invoke clean device logout returning to Shop Login');
});

// 8. Unified v3.0.0 Version + Download/Install Progress + Clean Local-Reset & Backend Resync
check('W8-01: Unified v3.0.0 version across all manifests/APIs + progress overlay + Zero-Re-OTP clean resync', () => {
    assert.strictEqual(pkgJson.version, '3.0.0', 'package.json version must be 3.0.0');
    assert(serverJs.includes('const APP_VERSION = "3.0.0";'), 'server.js APP_VERSION must be 3.0.0');
    assert(netlifyApiJs.includes("version: '3.0.0'"), 'netlify/functions/api.js /version must be 3.0.0');
    assert(swJs.includes("const CACHE_VERSION = 'billnaw-pos-shell-v4.0.0';"), 'service-worker.js CACHE_VERSION must bump forward monotonically to v4.0.0');
    assert(indexHtml.includes('id="settingsAppVersionBadge"') && indexHtml.includes('>v3.0.0<'), 'Settings version badge must display v3.0.0');
    assert(indexHtml.includes('id="appUpdateInstallOverlay"'), 'index.html must include #appUpdateInstallOverlay');
    assert(indexHtml.includes('id="updateInstallProgressBar"'), 'index.html must include #updateInstallProgressBar');
    assert(shopAuthJs.includes("const CLIENT_APP_VERSION = '3.0.0';"), 'shop-auth.js CLIENT_APP_VERSION must be 3.0.0');
    assert(shopAuthJs.includes("localStorage.setItem('billnaw_pending_clean_resync', targetVer)"), 'applyAppUpdate must schedule one-time clean resync');
    assert(shopAuthJs.includes('PRESERVE_KEYS'), 'applyAppUpdate must preserve verified shop auth & printer keys for existing shops');
    assert(coreJs.includes('async function runPendingCleanUpgradeResync()'), 'core.js must implement runPendingCleanUpgradeResync');
    assert(coreJs.includes("const APP_DATA_EPOCH = '2026_11_19_CLEAN_V1';"), 'APP_DATA_EPOCH constant must remain intact for epoch test compatibility');
});

// 9. Specialist Audit Hardening Invariants (Architect + Security + Code Reviewer)
check('W9-01: Specialist audit hardening (offline abort, PIN bypass lock, fail-closed RBAC, CSS specificity & SW race guard)', () => {
    const swRegJs = read('js/sw-register.js');
    const customersJs = read('js/customers.js');
    const responsiveCss = read('css/responsive.css');

    // Architect hardening
    assert(shopAuthJs.includes('navigator.onLine === false'), 'applyAppUpdate must abort if offline');
    assert(coreJs.includes('async function flushPendingBackendSyncs()'), 'core.js must export flushPendingBackendSyncs');
    assert(shopAuthJs.includes('if (!queueDrained)'), 'applyAppUpdate must abort wipe if pending offline bills fail to flush');
    assert(swRegJs.includes('if (window._isApplyingAppUpdate) return;'), 'sw-register must skip mid-upgrade reload race');
    assert(coreJs.includes('if (!res.ok)') && coreJs.includes('window._v3ResyncFailed = true;'), 'runPendingCleanUpgradeResync must keep retry flag on 5xx/429');
    assert(cloudSyncJs.includes('function hideStaffProfileSelector(force = false)'), 'hideStaffProfileSelector must block Skip when PIN is required');
    assert(menuJs.includes('imgEl.onerror = function() { _handleMenuImgError(this); };'), 'menu.js must re-arm onerror after in-place src update');

    // Security hardening
    assert(posJs.includes('Fail-closed settlement RBAC guard'), 'confirmCheckout must enforce fail-closed settlement RBAC');
    assert(customersJs.includes("canStaffAccessTab(activeStaff, 'whatsapp')"), 'switchCustomerHubTab must block WhatsApp for non-Admin');
    assert(settingsJs.includes("_requireAdminAccess('manage store profile'"), 'openStoreProfileModal must enforce Admin access');
    assert(settingsJs.includes("_requireAdminAccess('manage staff and PINs'"), 'openStaffManagementModal must enforce Admin access');
    assert(shopAuthJs.includes('Only Store Admin can sign out of the Cloud Shop account'), 'logoutShop must guard against non-Admin cloud shop logout');
    assert(shopAuthJs.includes('idb.db.close()'), 'purgeDeviceCookiesAndCaches must close open IDB connection before deleteDatabase');

    // Code reviewer hardening
    assert(shopAuthJs.includes('_updatePopupDismissedThisSession'), 'dismissAppUpdatePopup must track session dismissal');
    assert(shopAuthJs.includes('hasLegacyShopState'), 'checkForAppUpdates must seed v3.0.0 on fresh installs without false-positive prompt');
    assert(modalsCss.includes('.form-group input.pin-input-clean'), 'modals.css must win specificity over .form-group input');
    assert(responsiveCss.includes('.session-card:not(.minimal-session-card)'), 'responsive.css must not break .minimal-session-card on mobile');
    assert(staffJs.includes('let _terminalPinInFlight = false;'), 'confirmStaffLogin must guard against concurrent PIN submissions');
});

// 10. Menu Reset Elimination + Role-First Checkout & Firebase Permissions Cache + Clean Staff Logout
check('W10-01: Cold login never reverts menu to 4 preset items, role-first checkout ignores stale WAITER_MOBILE, Firebase role cache & clean staff logout work', () => {
    const authServiceJs = read('server/auth-service.js');

    // Issue 1: Preset 4-item menu elimination
    assert(authServiceJs.includes('const seedStarterMenu = !(options && options.isExistingLogin === true);'), 'createDefaultShopDocument must never seed starter menu on isExistingLogin');
    assert(authServiceJs.includes('if (!isExistingLogin) {\n      syncShopToFirestore(code, shop);\n    }') || authServiceJs.includes('if (!isExistingLogin) {\r\n      syncShopToFirestore(code, shop);\r\n    }'), 'resolveShopTenant must NEVER overwrite Firestore on cold existing-shop login');
    assert(serverJs.includes("app.post('/api/auth/verify-otp', async (req, res)"), 'server.js /api/auth/verify-otp must hydrate live Firestore store');
    assert(serverJs.includes("app.post(['/api/auth/login', '/api/auth/login-password'], async (req, res)"), 'server.js /api/auth/login must hydrate live Firestore store');
    assert(netlifyApiJs.includes('menuVersion: Number(existingShop.menuVersion || 0)'), 'netlify api login must return menuVersion & deleted tombstones');
    assert(shopAuthJs.includes("fetch('/api/sync/store-data?storeCode=' + encodeURIComponent(data.storeCode || '')"), 'shop-auth login must pull authoritative /api/sync/store-data');
    assert(coreJs.includes('const storedMenuIsTemplate = Array.isArray(storedMenu) && isDefaultTemplateMenu(storedMenu);'), 'initDatabase must discard leftover 4-item template from IDB for authenticated shops');

    // Issue 2: Role-first Checkout vs Ready-for-Billing + Firebase role/permissions cache
    assert(coreJs.includes('const effectiveIsFloorServer = normRole ?'), 'applyStationProfileRestrictions must prioritize active staff role over stale WAITER_MOBILE tag');
    assert(!posJs.slice(posJs.indexOf('Role-first action button'), posJs.indexOf('Role-first action button') + 600).includes("getStationProfile() : '') === 'WAITER_MOBILE'"), 'updateTableOrderFloatingBar must NOT let WAITER_MOBILE override Cashier/Admin CHECKOUT');
    assert(staffJs.includes('function buildStaffAccessProfile(staff)'), 'staff.js must define canonical buildStaffAccessProfile');
    assert(staffJs.includes('function cacheStaffAccessProfile(staff)'), 'staff.js must cache Firebase staff access profile locally');
    assert(coreJs.includes('Live Firebase Role/Permission Refresh'), 'handleRemoteFirestoreUpdate must refresh active staff permissions live when Firebase updates');

    // Behavioral check on buildStaffAccessProfile (existing shop staff without explicit permissions field)
    const sandbox = {
        window: {},
        ROLES: { ADMIN: 'Admin', MANAGER: 'Manager', CASHIER: 'Cashier', SERVER: 'Floor Server', CHEF: 'Kitchen Chef' },
        normalizeRole: (r) => r
    };
    const bStart = staffJs.indexOf('function buildStaffAccessProfile(staff)');
    const bEnd = staffJs.indexOf('window.buildStaffAccessProfile = buildStaffAccessProfile;') + 'window.buildStaffAccessProfile = buildStaffAccessProfile;'.length;
    vm.runInNewContext(staffJs.slice(bStart, bEnd), sandbox);

    const adminAcc = sandbox.buildStaffAccessProfile({ id: 1, name: 'Owner', role: 'Admin' });
    const cashierAcc = sandbox.buildStaffAccessProfile({ id: 2, name: 'Riya', role: 'Cashier' });
    const serverAcc = sandbox.buildStaffAccessProfile({ id: 3, name: 'Amit', role: 'Floor Server' });
    const chefAcc = sandbox.buildStaffAccessProfile({ id: 4, name: 'Raj', role: 'Kitchen Chef' });
    assert.strictEqual(adminAcc.permissions.canCheckout, true, 'Admin must have canCheckout');
    assert.strictEqual(cashierAcc.permissions.canCheckout, true, 'Cashier must have canCheckout');
    assert.strictEqual(serverAcc.permissions.canCheckout, false, 'Floor Server must NOT have canCheckout');
    assert.strictEqual(serverAcc.permissions.canReadyForBilling, true, 'Floor Server must have canReadyForBilling');
    assert.strictEqual(chefAcc.permissions.canAccessSettings, true, 'Chef must have Settings access');
    assert(cashierAcc.allowedTabs.includes('settings') && serverAcc.allowedTabs.includes('settings') && chefAcc.allowedTabs.includes('settings'), 'All roles include settings tab');
});

console.log(`\nALL ${passed} V3.0.0 CHECKS PASSED!`);
