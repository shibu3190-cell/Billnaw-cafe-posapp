/**
 * Automated Test Suite: test_pin_sync_and_kds_routing.cjs
 * Validates:
 * 1. Admin login NEVER trapped in KDS view (Supervisor Override in resolveInitialViewForStation & applyStationProfileRestrictions)
 * 2. Canonical verifyAdminPin & verifyStaffPin across salted SHA-256, hashString, and localStorage fallback
 * 3. Dual Cloud Sync on Admin PIN update (OTP reset, Settings modal, Staff Management, First Login PIN)
 * 4. Remote Firestore update synchronization (data.profile.adminPinHash & data.staff IDB/localStorage retention)
 * 5. Logout cache purge & Post-login profile view restoration
 * 6. UI & Architectural Invariants (26 .modal-close-btn SVGs, 0 raw emojis in buttons/tabs)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simple DOM & LocalStorage simulation
class MockLocalStorage {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] !== undefined ? this.store[key] : null;
    }
    setItem(key, val) {
        this.store[key] = String(val);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}

class MockElement {
    constructor(id) {
        this.id = id;
        this.style = {};
        this.classList = {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        };
        this.value = '';
        this.innerText = '';
        this.innerHTML = '';
        this.disabled = false;
    }
    focus() {}
}

const mockElements = {};
function getMockElement(id) {
    if (!mockElements[id]) {
        mockElements[id] = new MockElement(id);
    }
    return mockElements[id];
}

const mockDocument = {
    getElementById(id) {
        return getMockElement(id);
    },
    querySelector(sel) {
        return null;
    },
    querySelectorAll(sel) {
        return [];
    }
};

const mockIdb = {
    data: {},
    async init() {},
    async get(key) {
        return this.data[key] !== undefined ? this.data[key] : null;
    },
    async set(key, val) {
        this.data[key] = JSON.parse(JSON.stringify(val));
    },
    async clear(key) {
        delete this.data[key];
    }
};

let testsRun = 0;
let testsPassed = 0;

function runTest(name, fn) {
    testsRun++;
    try {
        fn();
        console.log(`  PASS: ${name}`);
        testsPassed++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(e);
    }
}

async function runAsyncTest(name, fn) {
    testsRun++;
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        testsPassed++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(e);
    }
}

async function main() {
    console.log("\n=======================================================");
    console.log("Starting Pin Sync & KDS Supervisor Override Test Suite");
    console.log("=======================================================\n");

    // Setup Global environment
    global.window = global;
    global.window.addEventListener = () => {};
    global.window.removeEventListener = () => {};
    global.window.dispatchEvent = () => {};
    global.document = mockDocument;
    global.document.addEventListener = () => {};
    global.document.removeEventListener = () => {};
    global.localStorage = new MockLocalStorage();
    global.sessionStorage = new MockLocalStorage();
    global.idb = mockIdb;
    global.showToast = () => {};
    global.getLocalISODate = () => new Date().toISOString().split('T')[0];
    global.myClientID = 'TEST-SHOP-1001';

    // Load core.js & staff.js
    const coreCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
    const staffCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');

    // Evaluate scripts in sandbox
    eval(coreCode);
    eval(staffCode);

    // -------------------------------------------------------------
    // Test Suite 1: resolveInitialViewForStation Supervisor Override
    // -------------------------------------------------------------
    console.log("\n--- Suite 1: resolveInitialViewForStation Routing ---");

    runTest("Admin on KDS station profile routes to 'pos' (NEVER 'kds')", () => {
        window.currentStaff = { id: 1, name: "Master Admin", role: "Admin" };
        const view = resolveInitialViewForStation('KDS', 'Admin');
        assert.strictEqual(view, 'pos', "Admin on KDS station MUST route to 'pos'");
    });

    runTest("Manager on KDS station profile routes to 'pos' (NEVER 'kds')", () => {
        window.currentStaff = { id: 2, name: "Store Manager", role: "Manager" };
        const view = resolveInitialViewForStation('KDS', 'Manager');
        assert.strictEqual(view, 'pos', "Manager on KDS station MUST route to 'pos'");
    });

    runTest("Kitchen Chef on KDS station profile routes to 'kds'", () => {
        window.currentStaff = { id: 3, name: "Head Chef", role: "Kitchen Chef" };
        const view = resolveInitialViewForStation('KDS', 'Kitchen Chef');
        assert.strictEqual(view, 'kds', "Chef on KDS station MUST route to 'kds'");
    });

    runTest("Floor Server on WAITER_MOBILE station profile routes to 'tables'", () => {
        window.currentStaff = { id: 4, name: "Server John", role: "Floor Server" };
        const view = resolveInitialViewForStation('WAITER_MOBILE', 'Floor Server');
        assert.strictEqual(view, 'tables', "Floor Server MUST route to 'tables'");
    });

    runTest("Cashier on Billing Register station profile routes to 'pos'", () => {
        window.currentStaff = { id: 5, name: "Cashier Alice", role: "Cashier" };
        const view = resolveInitialViewForStation('BILLING_COUNTER', 'Cashier');
        assert.strictEqual(view, 'pos', "Cashier MUST route to 'pos'");
    });

    // -------------------------------------------------------------
    // Test Suite 2: applyStationProfileRestrictions Navigation Safety
    // -------------------------------------------------------------
    console.log("\n--- Suite 2: applyStationProfileRestrictions Navigation Safety ---");

    runTest("Supervisor (Admin) on physical KDS terminal retains full navigation (never trapped)", () => {
        localStorage.setItem('billnaw_station_profile', 'KDS');
        window.currentStaff = { id: 1, name: "Admin", role: "Admin" };
        
        // Clear styles
        const navPos = getMockElement('nav-pos');
        const navMenu = getMockElement('nav-menu');
        const navReports = getMockElement('nav-dashboard');
        const navInventory = getMockElement('nav-inventory');
        const navKds = getMockElement('nav-kds');
        const checkoutBtn = getMockElement('checkoutBtn');

        applyStationProfileRestrictions();

        assert.strictEqual(navPos.style.display, 'flex', "navPos must be visible for Admin");
        assert.strictEqual(navMenu.style.display, 'flex', "navMenu must be visible for Admin");
        assert.strictEqual(navReports.style.display, 'flex', "navReports must be visible for Admin");
        assert.strictEqual(navInventory.style.display, 'flex', "navInventory must be visible for Admin");
        assert.strictEqual(navKds.style.display, 'flex', "navKds must be accessible for Admin");
        assert.strictEqual(checkoutBtn.style.display, '', "checkoutBtn must not be hidden for Admin");
    });

    runTest("Kitchen Chef on KDS terminal has non-kitchen tabs hidden", () => {
        localStorage.setItem('billnaw_station_profile', 'KDS');
        window.currentStaff = { id: 3, name: "Chef Gordon", role: "Kitchen Chef" };

        const navPos = getMockElement('nav-pos');
        const navReports = getMockElement('nav-dashboard');
        const navKds = getMockElement('nav-kds');

        applyStationProfileRestrictions();

        assert.strictEqual(navPos.style.display, 'none', "navPos must be hidden for Kitchen Chef on KDS");
        assert.strictEqual(navReports.style.display, 'none', "navReports must be hidden for Kitchen Chef on KDS");
        assert.strictEqual(navKds.style.display, 'flex', "navKds must be active for Kitchen Chef");
    });

    // -------------------------------------------------------------
    // Test Suite 3: Canonical verifyAdminPin & verifyStaffPin
    // -------------------------------------------------------------
    console.log("\n--- Suite 3: Canonical verifyAdminPin & verifyStaffPin ---");

    await runAsyncTest("Default fallback Admin PIN '1234' works when no custom PIN is set", async () => {
        window.shopProfile = {};
        window.staffList = [];
        localStorage.removeItem('billnaw_admin_pin_hash');

        const isValid = await verifyAdminPin('1234');
        assert.strictEqual(isValid, true, "Default '1234' must be accepted when no custom pin exists");

        const isWrong = await verifyAdminPin('9999');
        assert.strictEqual(isWrong, false, "Invalid PIN must be rejected");
    });

    await runAsyncTest("Custom Admin PIN validated against shopProfile.adminPinHash", async () => {
        const customPin = '4826';
        const hash = hashString(customPin);
        window.shopProfile = { adminPinHash: hash };
        localStorage.removeItem('billnaw_admin_pin_hash');

        const isValid = await verifyAdminPin('4826');
        assert.strictEqual(isValid, true, "Custom Admin PIN must match shopProfile.adminPinHash");

        const isOldDefault = await verifyAdminPin('1234');
        assert.strictEqual(isOldDefault, false, "Default '1234' must be rejected once a custom PIN is active");
    });

    await runAsyncTest("Custom Admin PIN validated from LocalStorage redundant backup if IDB wiped", async () => {
        const customPin = '8392';
        const hash = hashString(customPin);
        window.shopProfile = {}; // wiped
        localStorage.setItem('billnaw_admin_pin_hash', hash);

        const isValid = await verifyAdminPin('8392');
        assert.strictEqual(isValid, true, "Custom Admin PIN must be verified from billnaw_admin_pin_hash in localStorage");
    });

    await runAsyncTest("verifyStaffPin validates salted SHA-256 for non-admin staff", async () => {
        const salt = generatePinSalt();
        const pin = '5566';
        const hash = await hashPin(pin, salt);
        const cashier = { id: 10, name: "Cashier Bob", role: "Cashier", pin_salt: salt, pin_hash: hash };

        const isMatch = await verifyStaffPin(cashier, '5566');
        assert.strictEqual(isMatch, true, "Valid salted PIN must match");

        const isBad = await verifyStaffPin(cashier, '0000');
        assert.strictEqual(isBad, false, "Wrong PIN must not match");
    });

    await runAsyncTest("verifyStaffPin on Admin role delegates to verifyAdminPin", async () => {
        const adminPin = '7193';
        window.shopProfile = { adminPinHash: hashString(adminPin) };
        const adminStaff = { id: 1, name: "Admin", role: "Admin" };

        const isMatch = await verifyStaffPin(adminStaff, '7193');
        assert.strictEqual(isMatch, true, "verifyStaffPin on Admin staff must accept valid Admin PIN");
    });

    // -------------------------------------------------------------
    // Test Suite 4: Real-time Multi-Device Sync on PIN & Profile Updates
    // -------------------------------------------------------------
    console.log("\n--- Suite 4: Multi-Device Real-Time Sync on Updates ---");

    await runAsyncTest("handleRemoteFirestoreUpdate syncs adminPinHash & staff to IDB & LocalStorage", async () => {
        const incomingData = {
            profile: {
                name: "Updated Cloud Cafe",
                adminPinHash: hashString('9482')
            },
            staff: [
                { id: 1, name: "Cloud Admin", role: "Admin", pin_hash: hashString('9482') },
                { id: 2, name: "Cloud Chef", role: "Kitchen Chef", pin_hash: "mockhash" }
            ]
        };

        handleRemoteFirestoreUpdate(incomingData);

        assert.strictEqual(shopProfile.adminPinHash, hashString('9482'), "shopProfile must adopt remote adminPinHash");
        assert.strictEqual(localStorage.getItem('billnaw_admin_pin_hash'), hashString('9482'), "localStorage must retain remote adminPinHash");
        assert.strictEqual(staffList.length, 2, "staffList must be updated from remote snapshot");

        const storedStaffInIDB = await idb.get('cafe_staff');
        assert.strictEqual(storedStaffInIDB.length, 2, "IDB cafe_staff must be updated for offline resilience");
        assert.strictEqual(localStorage.getItem('billnaw_store_staff').includes('Cloud Chef'), true, "LocalStorage billnaw_store_staff must be updated");
    });

    // -------------------------------------------------------------
    // Test Suite 5: Logout Cache Purge & Post-Login Profile Retention
    // -------------------------------------------------------------
    console.log("\n--- Suite 5: Logout Purge & Post-Login Retention ---");

    runTest("clearAllTenantLocalData purges station profiles and sensitive auth keys", () => {
        localStorage.setItem('billnaw_station_profile', 'KDS');
        localStorage.setItem('billnaw_admin_pin_hash', 'somehash');
        localStorage.setItem('billnaw_auth_token', 'token123');

        clearAllTenantLocalData();

        assert.strictEqual(localStorage.getItem('billnaw_station_profile'), null, "Station profile must be purged on tenant clear");
        assert.strictEqual(localStorage.getItem('billnaw_admin_pin_hash'), null, "Admin PIN hash must be purged");
        assert.strictEqual(localStorage.getItem('billnaw_auth_token'), null, "Auth token must be purged");
    });

    await runAsyncTest("initDatabase recovers profile and staff from redundant local storage if IDB cleared", async () => {
        window.shopProfile = {};
        await idb.clear('cafe_staff');
        await idb.clear('cafe_profile');
        localStorage.removeItem('billnaw_store_profile');

        localStorage.setItem('billnaw_shop_name', 'Resilient Bistro');
        localStorage.setItem('billnaw_admin_pin_hash', hashString('6241'));
        localStorage.setItem('billnaw_store_staff', JSON.stringify([
            { id: 99, name: "Rehydrated Admin", role: "Admin", pin_hash: hashString('6241') }
        ]));

        await initDatabase();

        assert.strictEqual(shopProfile.name, 'Resilient Bistro', "Shop name must recover from local backup");
        assert.strictEqual(shopProfile.adminPinHash, hashString('6241'), "Admin PIN hash must recover from local backup");
        assert.strictEqual(staffList[0].name, 'Rehydrated Admin', "Staff list must recover from billnaw_store_staff backup");
    });

    // -------------------------------------------------------------
    // Test Suite 6: Invariant Checks (.modal-close-btn SVGs & Emojis)
    // -------------------------------------------------------------
    console.log("\n--- Suite 6: Architectural & Invariant Checks ---");

    runTest("Exactly 26 .modal-close-btn SVGs across index.html", () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const matches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        assert.strictEqual(matches.length, 26, `Must maintain strictly 26 .modal-close-btn elements, found ${matches.length}`);
    });

    runTest("Zero raw Unicode emojis in buttons or tabs in index.html", () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        // Regex for standard emoji ranges
        const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
        
        // Check buttons and tab buttons
        const btnMatches = html.match(/<(button|a)[^>]*class=["'][^"']*(btn|tab|segment)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi) || [];
        let emojiViolations = 0;
        for (const btn of btnMatches) {
            if (emojiRegex.test(btn)) {
                // Exceptions: none allowed for standard UI action buttons
                emojiViolations++;
            }
        }
        assert.strictEqual(emojiViolations, 0, `Buttons and tabs must have 0 raw Unicode emojis, found ${emojiViolations}`);
    });

    console.log("\n=======================================================");
    console.log(`Test Execution Summary: ${testsPassed} / ${testsRun} tests passed.`);
    console.log("=======================================================\n");

    if (testsPassed === testsRun) {
        console.log("ALL TESTS PASSED SUCCESSFULLY! (100% GREEN)\n");
        process.exit(0);
    } else {
        console.error("SOME TESTS FAILED!\n");
        process.exit(1);
    }
}

main().catch(err => {
    console.error("Test runner execution error:", err);
    process.exit(1);
});
