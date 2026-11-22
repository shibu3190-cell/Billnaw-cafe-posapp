/**
 * Regression Test Suite: Post-Login Mandatory Staff Profile & 4-Digit PIN Prompt
 * Reproduces and verifies the fix for the 250ms hideCloudSyncOverlay() race condition
 * that caused showStaffProfileSelector() to abort silently after OTP/Password login.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function makeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        clear: () => { map.clear(); }
    };
}

function makeEl(id, extra = {}) {
    return {
        id,
        style: { display: 'none', zIndex: '' },
        innerHTML: '',
        innerText: '',
        value: '',
        placeholder: '',
        dataset: {},
        focused: false,
        focus() { this.focused = true; },
        querySelector: () => null,
        querySelectorAll: () => [],
        ...extra
    };
}

let passed = 0;
let failed = 0;

async function runTest(id, name, fn) {
    try {
        await fn();
        console.log(`✅ [PASS] ${id}: ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${id}: ${name}`);
        console.error('   ', err && err.stack ? err.stack : err);
        failed++;
    }
}

async function main() {
    console.log('====================================================================');
    console.log('🔐 POST-LOGIN PROFILE SELECTOR & PIN PROMPT VERIFICATION');
    console.log('====================================================================\n');

    const cloudSyncCode = read('js/cloud-sync.js');
    const coreCode = read('js/core.js');
    const shopAuthCode = read('js/shop-auth.js');

    // Shared helper to build DOM + overlay state machine
    function buildCloudSyncSandbox(ls) {
        const skipBtn = makeEl('skipStaffBtn');
        skipBtn.style.display = 'inline-block';
        const pinPromptP = { innerHTML: '' };
        const staffPinEntryWrap = makeEl('staffPinEntryWrap', {
            querySelector: (sel) => (sel === 'p' ? pinPromptP : null)
        });
        const staffProfileSelector = makeEl('staffProfileSelector', {
            querySelector: (sel) => (sel.includes('hideStaffProfileSelector') ? skipBtn : null)
        });
        const elements = {
            shopAuthModal: makeEl('shopAuthModal'),
            appUpdateInstallOverlay: makeEl('appUpdateInstallOverlay'),
            cloudSyncOverlay: makeEl('cloudSyncOverlay'),
            devicePairingOverlay: makeEl('devicePairingOverlay'),
            staffProfileSelector,
            loginOverlay: makeEl('loginOverlay'),
            staffSwitchModal: makeEl('staffSwitchModal'),
            staffSelectorShopName: makeEl('staffSelectorShopName'),
            staffProfileGrid: makeEl('staffProfileGrid'),
            staffPinEntryWrap,
            staffPinName: makeEl('staffPinName'),
            staffGatewayPinInput: makeEl('staffGatewayPinInput'),
            cloudSyncBar: makeEl('cloudSyncBar'),
            cloudSyncPct: makeEl('cloudSyncPct'),
            cloudSyncStatus: makeEl('cloudSyncStatus')
        };

        const AUTH_OVERLAY_IDS = [
            'appUpdateInstallOverlay',
            'cloudSyncOverlay',
            'shopAuthModal',
            'devicePairingOverlay',
            'staffProfileSelector',
            'loginOverlay',
            'staffSwitchModal'
        ];

        const timers = [];
        const sb = {
            window: {},
            addEventListener: () => {},
            document: {
                getElementById: (id) => elements[id] || null,
                createElement: (tag) => makeEl(tag),
                body: { appendChild: (el) => { if (el.id) elements[el.id] = el; } },
                querySelectorAll: () => [],
                addEventListener: () => {}
            },
            localStorage: ls,
            sessionStorage: makeStorage(),
            console,
            setTimeout: (fn, ms) => {
                const handle = { fn, ms, cleared: false };
                timers.push(handle);
                return handle;
            },
            clearTimeout: (handle) => {
                if (handle) handle.cleared = true;
            },
            Date, Math, JSON, Number, Array, Object, String, Map, Set, Promise, encodeURIComponent, decodeURIComponent,
            getActiveAuthOverlay: () => {
                for (const id of AUTH_OVERLAY_IDS) {
                    const el = elements[id];
                    if (el && el.style.display && el.style.display !== 'none') return id;
                }
                return null;
            },
            setActiveAuthOverlay: (activeId) => {
                AUTH_OVERLAY_IDS.forEach((id) => {
                    const el = elements[id];
                    if (!el) return;
                    el.style.display = (id === activeId) ? 'flex' : 'none';
                });
            },
            shopProfile: { name: 'Billnaw', storeCode: 'SHOP_TEST_LOGIN' },
            staffList: [
                { id: 1, name: 'Store Owner', role: 'Admin', status: 'Active' },
                { id: '201', name: 'Dk', role: 'Floor Server', status: 'Active' },
                { id: '202', name: 'Am', role: 'Cashier', status: 'Active' }
            ],
            verifyAdminPin: async (pin) => pin === '1234',
            verifyStaffPin: async (staff, pin) => (String(staff.id) === '202' && pin === '4567'),
            buildStaffAccessProfile: (s) => ({
                id: s.id,
                name: s.name,
                role: s.role,
                permissions: { canCheckout: s.role === 'Cashier' || s.role === 'Admin' },
                allowedTabs: ['pos', 'tables']
            }),
            showToast: () => {},
            updateStaffTopbarDisplay: () => {},
            applyStationProfileRestrictions: () => {},
            enforcePermissions: () => {},
            updateAllUI: () => {}
        };
        sb.window = sb;
        sb.globalThis = sb;
        sb.window.staffList = sb.staffList;
        sb.window.shopProfile = sb.shopProfile;
        vm.createContext(sb);
        vm.runInContext(cloudSyncCode, sb, { filename: 'js/cloud-sync.js' });
        return { sb, elements, skipBtn, timers };
    }

    // =========================================================================
    // PL-01: CloudSync -> Profile Selector Handoff (Zero 250ms Race)
    // =========================================================================
    await runTest('PL-01', 'hideCloudSyncOverlay() + showStaffProfileSelector() opens profile screen immediately with Skip hidden', async () => {
        const ls = makeStorage({ billnaw_terminal_locked: 'true' });
        const { sb, elements, skipBtn } = buildCloudSyncSandbox(ls);

        // Simulate post-login sequence with non-immediate hideCloudSyncOverlay()
        sb.showCloudSyncOverlay('Syncing...');
        assert.strictEqual(sb.getActiveAuthOverlay(), 'cloudSyncOverlay');

        sb.hideCloudSyncOverlay(); // Previously left cloudSyncOverlay display:'flex' for 250ms!
        sb.showStaffProfileSelector('Billnaw');

        assert.strictEqual(elements.cloudSyncOverlay.style.display, 'none', 'cloudSyncOverlay must hide immediately when handing off to staffProfileSelector');
        assert.strictEqual(elements.staffProfileSelector.style.display, 'flex', 'staffProfileSelector MUST be visible after login');
        assert.strictEqual(sb.getActiveAuthOverlay(), 'staffProfileSelector');
        assert.strictEqual(skipBtn.style.display, 'none', 'Skip button must stay hidden until PIN is verified');
        assert.ok(elements.staffProfileGrid.innerHTML.includes('Dk') && elements.staffProfileGrid.innerHTML.includes('Am'), 'All shop staff profiles must render');

        // Also test explicit immediate hide + fromCloudSync option (used in js/shop-auth.js)
        sb.showCloudSyncOverlay('Syncing again...');
        sb.hideCloudSyncOverlay(true);
        sb.showStaffProfileSelector('Billnaw', { fromCloudSync: true });
        assert.strictEqual(elements.staffProfileSelector.style.display, 'flex');
        assert.strictEqual(sb.getActiveAuthOverlay(), 'staffProfileSelector');
    });

    // =========================================================================
    // PL-02: Select Profile -> Enter Wrong PIN (stays locked) -> Enter Valid PIN (unlocks)
    // =========================================================================
    await runTest('PL-02', 'Selecting profile opens PIN input, rejects wrong PIN, and unlocks with valid 4-digit PIN', async () => {
        const ls = makeStorage({ billnaw_terminal_locked: 'true' });
        const { sb, elements } = buildCloudSyncSandbox(ls);

        sb.showStaffProfileSelector('Billnaw', { fromCloudSync: true });
        sb.onStaffProfileSelected('202', encodeURIComponent('Am'), encodeURIComponent('Cashier'));
        assert.strictEqual(elements.staffPinEntryWrap.style.display, 'block', 'PIN entry panel must open when profile is clicked');
        assert.strictEqual(elements.staffGatewayPinInput.focused, true, 'PIN input must auto-focus for keyboard/mobile keypad');

        // Wrong PIN must keep overlay open and terminal locked
        elements.staffGatewayPinInput.value = '9999';
        await sb.confirmStaffProfilePin();
        assert.strictEqual(elements.staffProfileSelector.style.display, 'flex', 'Wrong PIN must keep staffProfileSelector open');
        assert.strictEqual(ls.getItem('billnaw_terminal_locked'), 'true');
        assert.strictEqual(ls.getItem('billnaw_pin_verified_at'), null);

        // Correct PIN unlocks profile and hides selector
        elements.staffGatewayPinInput.value = '4567';
        await sb.confirmStaffProfilePin();
        assert.strictEqual(elements.staffProfileSelector.style.display, 'none', 'Valid PIN must close staffProfileSelector');
        assert.strictEqual(ls.getItem('billnaw_terminal_locked'), null, 'Valid PIN must clear billnaw_terminal_locked');
        assert.ok(Number(ls.getItem('billnaw_pin_verified_at')) > 0, 'Valid PIN must stamp billnaw_pin_verified_at');
        assert.strictEqual(sb.window.currentStaff.name, 'Am');
        assert.strictEqual(sb.window.currentStaff.role, 'Cashier');
    });

    // =========================================================================
    // PL-03: Reload Before Entering PIN Still Prompts Profile Selector
    // =========================================================================
    await runTest('PL-03', 'initStaffSystem() prompts showStaffProfileSelector on reload if authenticated terminal has not verified PIN', async () => {
        let profileSelectorCalls = 0;
        const ls = makeStorage({
            billnaw_auth_mode: 'authenticated',
            billnaw_auth_token: 'fake.jwt.token',
            billnaw_store_code: 'SHOP_TEST_LOGIN',
            billnaw_device_status: 'AUTHORIZED',
            billnaw_terminal_locked: 'true'
        });

        const sandbox = {
            window: {},
            document: {
                getElementById: () => null,
                querySelector: () => null,
                querySelectorAll: () => [],
                addEventListener: () => {},
                body: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
            },
            navigator: { onLine: true, userAgent: 'node-test' },
            location: { href: 'http://localhost:5000/', origin: 'http://localhost:5000', pathname: '/', search: '', hash: '' },
            localStorage: ls,
            sessionStorage: makeStorage(),
            idb: { get: async () => null, set: () => {}, clear: () => {} },
            console,
            setTimeout: () => 0,
            clearTimeout: () => {},
            setInterval: () => 0,
            clearInterval: () => {},
            Date, Math, JSON, Number, Array, Object, String, Map, Set, Promise, RegExp, Error, URL, URLSearchParams,
            CustomEvent: class CustomEvent { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
            dispatchEvent: () => true,
            fetch: async () => ({ ok: true, json: async () => ({}) }),
            showStaffProfileSelector: () => { profileSelectorCalls++; },
            lockTerminal: () => {}
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        sandbox.addEventListener = () => {};

        vm.createContext(sandbox);
        vm.runInContext(coreCode, sandbox, { filename: 'js/core.js' });

        // Simulate reload right after shop login before any staff profile was unlocked
        sandbox.showStaffProfileSelector = () => { profileSelectorCalls++; };
        sandbox.window.showStaffProfileSelector = sandbox.showStaffProfileSelector;
        vm.runInContext(`
            shopProfile = { name: 'Billnaw', storeCode: 'SHOP_TEST_LOGIN' };
            currentStaff = null;
            window.currentStaff = null;
            initStaffSystem();
        `, sandbox);

        assert.strictEqual(profileSelectorCalls, 1, 'Reloading before PIN verification MUST open showStaffProfileSelector');
    });

    // =========================================================================
    // PL-04: Higher-Priority Overlays Still Block Flicker
    // =========================================================================
    await runTest('PL-04', 'showStaffProfileSelector still yields to shopAuthModal, appUpdateInstallOverlay & devicePairingOverlay', async () => {
        const ls = makeStorage({ billnaw_terminal_locked: 'true' });
        const { sb, elements } = buildCloudSyncSandbox(ls);

        for (const blocker of ['shopAuthModal', 'appUpdateInstallOverlay', 'devicePairingOverlay']) {
            sb.setActiveAuthOverlay(blocker);
            sb.showStaffProfileSelector('Billnaw', { fromCloudSync: true });
            assert.strictEqual(sb.getActiveAuthOverlay(), blocker, `showStaffProfileSelector must NEVER interrupt ${blocker}`);
            assert.strictEqual(elements.staffProfileSelector.style.display, 'none');
        }
    });

    // =========================================================================
    // PL-05: Static Wiring Across OTP Login, Password Login & Signup
    // =========================================================================
    await runTest('PL-05', 'All 3 auth entry points in js/shop-auth.js lock terminal, hide cloudSync immediately & call showStaffProfileSelector', async () => {
        const immediateHideMatches = shopAuthCode.match(/hideCloudSyncOverlay\(true\)/g) || [];
        const fromCloudSyncMatches = shopAuthCode.match(/showStaffProfileSelector\([^)]*fromCloudSync:\s*true/g) || [];
        const terminalLockMatches = shopAuthCode.match(/localStorage\.setItem\('billnaw_terminal_locked',\s*'true'\)/g) || [];
        assert.ok(immediateHideMatches.length >= 2, `Expected >=2 immediate hideCloudSyncOverlay(true) calls in js/shop-auth.js, got ${immediateHideMatches.length}`);
        assert.ok(fromCloudSyncMatches.length >= 2, `Expected >=2 showStaffProfileSelector(..., { fromCloudSync: true }) calls, got ${fromCloudSyncMatches.length}`);
        assert.ok(terminalLockMatches.length >= 3, `Expected >=3 billnaw_terminal_locked='true' guards (OTP login, Password login, Signup), got ${terminalLockMatches.length}`);
    });

    console.log('\n====================================================================');
    console.log(`Post-Login Profile & PIN Summary: ${passed} passed, ${failed} failed`);
    console.log('====================================================================');
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
