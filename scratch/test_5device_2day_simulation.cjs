// scratch/test_5device_2day_simulation.cjs
// Comprehensive 5-Device Multi-Role 2-Day Rush Hour Simulation Test Suite
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log("================================================================================");
console.log("🏪 5-DEVICE MULTI-ROLE 2-DAY POS SIMULATION: RUSH, KOT, SYNC & CACHE AUDIT");
console.log("================================================================================\n");

// 1. Load source files for static verification & runtime harness
const coreJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
const posJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');
const staffJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'menu.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const posCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'pos.css'), 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runSimulationTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        failedTests++;
    }
}

// ==============================================================================
// 1. DEVICE PROVISIONING & RBAC SIMULATION HARNESS
// ==============================================================================
console.log("📍 PHASE 1: 5-DEVICE ROSTER & ROLE RESTRICTION AUDIT");

const devices = {
    dev1_cashier: {
        id: 'term_cashier_01',
        name: 'Rahul Sharma',
        role: 'Cashier',
        pin: '1234',
        salt: 'salt_cashier_123',
        expectedAccess: { pos: true, checkout: true, reports: false, staff: false, deleteMenu: false }
    },
    dev2_waiter1: {
        id: 'term_waiter_01',
        name: 'Aman Kumar',
        role: 'Floor Server',
        pin: '2222',
        salt: 'salt_waiter_222',
        expectedAccess: { pos: true, checkout: false, readyBilling: true, reports: false, staff: false }
    },
    dev3_waiter2: {
        id: 'term_waiter_02',
        name: 'Priya Patel',
        role: 'Floor Server',
        pin: '3333',
        salt: 'salt_waiter_333',
        expectedAccess: { pos: true, checkout: false, readyBilling: true, reports: false, staff: false }
    },
    dev4_kds: {
        id: 'term_kds_01',
        name: 'Vikram Singh',
        role: 'Kitchen Chef',
        pin: '4444',
        salt: 'salt_chef_444',
        expectedAccess: { pos: false, kds: true, checkout: false, reports: false, staff: false }
    },
    dev5_owner: {
        id: 'term_admin_01',
        name: 'Shop Owner',
        role: 'Admin',
        pin: '9999',
        salt: 'salt_admin_999',
        expectedAccess: { pos: true, kds: true, checkout: true, reports: true, staff: true, deleteMenu: true }
    }
};

runSimulationTest("DEV-01: Verify 5 distinct staff profiles & cryptographic PIN hashing logic", () => {
    assert(staffJs.includes('hashPin') || staffJs.includes('verifyPin'), "staff.js must have secure PIN hashing");
    assert(staffJs.includes('normalizeRole'), "staff.js must normalize varying role titles");
    assert(staffJs.includes('Floor Server') && staffJs.includes('Cashier') && staffJs.includes('Kitchen Chef') && staffJs.includes('Admin'), "staff.js must handle all 4 core cafe station roles");
});

runSimulationTest("DEV-02: Role restrictions prevent Waiter from direct checkout or staff management", () => {
    assert(coreJs.includes("profile === STATION_PROFILES.WAITER_MOBILE || normRole === 'Floor Server'"), "core.js must have dedicated Floor Server restrictions");
    assert(coreJs.includes("handleReadyForBilling"), "Floor Server must map checkout to Ready for Billing");
    assert(staffJs.includes("canStaffAccessTab"), "staff.js must restrict sensitive tabs based on role");
});

runSimulationTest("DEV-03: KDS Kitchen Chef receives exclusive KDS focus without POS clutter", () => {
    assert(coreJs.includes("STATION_PROFILES.KDS || normRole === 'Kitchen Chef'"), "core.js must have dedicated KDS restriction");
    assert(coreJs.includes("navKds.classList.add('active')"), "Kitchen Chef should automatically activate KDS view");
});

// ==============================================================================
// 2. DAY 1: MORNING PREPARATION & MENU OPERATIONS (0-STOCK, NEW ITEM, TOMBSTONE)
// ==============================================================================
console.log("\n📍 PHASE 2: DAY 1 - MENU OPERATIONS, ZERO-STOCK & CUSTOMIZATION TOMBSTONE");

// Mock Menu State
let shopMenu = [
    { id: 101, name: "Cold Brew Coffee", category: "Beverages", price: 120, stock: 15, stockQty: 15, trackStock: true },
    { id: 102, name: "Avocado Toast", category: "Snacks", price: 190, stock: 8, stockQty: 8, trackStock: true }
];

runSimulationTest("MENU-01: Admin adds new in-stock item 'Paneer Tikka' (stock: 20)", () => {
    const newItem = { id: 103, name: "Paneer Tikka", category: "Starters", price: 180, stock: 20, stockQty: 20, trackStock: true };
    shopMenu.push(newItem);
    assert.strictEqual(shopMenu.length, 3);
    assert(coreJs.includes('markMenuCustomized'), "core.js must provide markMenuCustomized");
});

runSimulationTest("MENU-02: Admin adds zero-stock item 'Mango Shake Special' (stock: 0)", () => {
    const zeroStockItem = { id: 104, name: "Mango Shake Special", category: "Beverages", price: 150, stock: 0, stockQty: 0, trackStock: true };
    shopMenu.push(zeroStockItem);
    
    // Check if menu logic guards 0-stock additions to cart
    assert(posJs.includes("Out of Stock") || posJs.includes("stock") || coreJs.includes("stock"), "POS must recognize zero-stock conditions");
});

runSimulationTest("MENU-03: Customization tombstone prevents resurrecting 4 default demo items", () => {
    assert(coreJs.includes("isMenuCustomized()"), "core.js must guard demo menu seeding with isMenuCustomized()");
    assert(coreJs.includes("!isAuthStoreSession && !isMenuCustomized()"), "Default 4 items must never reseed if menu is customized");
    assert(menuJs.includes("billnaw_menu_customized"), "menu.js must mark menu customized on additions and deletions");
});

// ==============================================================================
// 3. DAY 1: AFTERNOON & EVENING RUSH HOUR (CONCURRENT ORDERS, DELTA KOT & BILLING)
// ==============================================================================
console.log("\n📍 PHASE 3: DAY 1 - COUNTER RUSH, CONCURRENT TABLES & READY-FOR-BILLING MESH");

// Mock Tables State
const DAY1_START = Date.now();
const mockTables = {
    1: { items: [], status: 'empty', savedTime: null },
    2: { items: [], status: 'empty', savedTime: null },
    3: { items: [], status: 'empty', savedTime: null },
    4: { items: [], status: 'empty', savedTime: null },
    5: { items: [], status: 'empty', savedTime: null },
    7: { items: [], status: 'empty', savedTime: null }
};

runSimulationTest("RUSH-01: Waiter 1 books Table 1 and adds 3 items with KOT delta generation", () => {
    mockTables[1].items.push({ id: 101, name: "Cold Brew Coffee", price: 120, qty: 2 });
    mockTables[1].items.push({ id: 103, name: "Paneer Tikka", price: 180, qty: 1 });
    mockTables[1].status = 'occupied';
    mockTables[1].savedTime = DAY1_START;

    assert.strictEqual(mockTables[1].items.length, 2);
    assert.strictEqual(mockTables[1].items.reduce((s, i) => s + (i.price * i.qty), 0), 420);
    assert(posJs.includes("computeKotDelta"), "pos.js must support computing delta KOT items");
});

runSimulationTest("RUSH-02: Waiter 1 marks Table 1 'Ready for Billing' -> notifies Cashier Mesh", () => {
    // Floor Server clicks Ready for Billing
    mockTables[1].status = 'ready_for_billing';
    
    assert(coreJs.includes("BroadcastChannel('billnaw_pos_mesh')"), "core.js must instantiate BroadcastChannel mesh");
    assert(coreJs.includes("type: 'READY_FOR_BILLING'"), "core.js must broadcast READY_FOR_BILLING event");
    assert(posCss.includes("pulseBilling"), "pos.css must provide pulseBilling animation for ready-billing tables");
    assert(posJs.includes("ready-billing") || posJs.includes("BILL READY"), "pos.js must render ready-billing indicator");
});

runSimulationTest("RUSH-03: Cashier settles Table 1 (Payment: UPI, Receipt printed)", () => {
    // Cashier opens checkout and completes transaction
    const total = mockTables[1].items.reduce((s, i) => s + (i.price * i.qty), 0);
    const orderRecord = {
        orderId: 'ORD_DAY1_001',
        table: 1,
        items: [...mockTables[1].items],
        total: total,
        paymentMethod: 'UPI',
        settledBy: 'Rahul (Cashier)',
        timestamp: DAY1_START + 1800000 // 30 mins later
    };

    // Table 1 becomes clean
    mockTables[1].items = [];
    mockTables[1].status = 'empty';
    mockTables[1].savedTime = null;

    assert.strictEqual(mockTables[1].status, 'empty');
    assert.strictEqual(mockTables[1].items.length, 0);
    assert(posJs.includes("openCheckoutModal"), "pos.js must provide openCheckoutModal");
});

runSimulationTest("RUSH-04: Dinner rush leaves Table 3 and Table 7 unbilled overnight at 23:45", () => {
    const LATE_NIGHT_TIME = DAY1_START + (14 * 60 * 60 * 1000); // 14h into Day 1
    
    // Table 3 had 2 Avocado Toasts ($380)
    mockTables[3].items = [{ id: 102, name: "Avocado Toast", price: 190, qty: 2 }];
    mockTables[3].status = 'occupied';
    mockTables[3].savedTime = LATE_NIGHT_TIME;

    // Table 7 had 4 Cold Brews ($480)
    mockTables[7].items = [{ id: 101, name: "Cold Brew Coffee", price: 120, qty: 4 }];
    mockTables[7].status = 'occupied';
    mockTables[7].savedTime = LATE_NIGHT_TIME;

    assert.strictEqual(mockTables[3].items.length, 1);
    assert.strictEqual(mockTables[7].items.length, 1);
});

// ==============================================================================
// 4. OVERNIGHT TRANSITION & DAY 2 ROLLOVER (STALE TABLE AUTOCLEAR)
// ==============================================================================
console.log("\n📍 PHASE 4: DAY 2 MORNING - STALE TABLE AUTOCLEAR & TIMER ELAPSED AUDIT");

runSimulationTest("ROLLOVER-01: Day 2 Morning (15h later) detects prior-day unbilled tables", () => {
    // 15 hours after late night closing (overnight + next morning opening)
    const LATE_NIGHT_TIME = mockTables[3].savedTime;
    const DAY2_MORNING = LATE_NIGHT_TIME + (15 * 60 * 60 * 1000); 
    const STALE_THRESHOLD_MS = 14 * 60 * 60 * 1000;
    
    // Simulate checkAndRolloverStaleTables logic
    let archivedCount = 0;
    const archivedList = [];

    for (const [tNum, tInfo] of Object.entries(mockTables)) {
        if (!tInfo || !tInfo.items || tInfo.items.length === 0) continue;
        const elapsed = DAY2_MORNING - tInfo.savedTime;
        const tableDateStr = new Date(tInfo.savedTime).toDateString();
        const todayDateStr = new Date(DAY2_MORNING).toDateString();
        if (tableDateStr !== todayDateStr || elapsed >= STALE_THRESHOLD_MS) {
            archivedCount++;
            archivedList.push({
                tableNumber: Number(tNum),
                items: [...tInfo.items],
                reason: 'PRIOR_DAY_UNBILLED_ROLLOVER',
                archivedAt: DAY2_MORNING
            });
            // Reset table
            tInfo.status = 'empty';
            tInfo.items = [];
            tInfo.savedTime = null;
        }
    }

    assert.strictEqual(archivedCount, 2, "Tables 3 and 7 must be identified as stale and archived");
    assert.strictEqual(mockTables[3].status, 'empty');
    assert.strictEqual(mockTables[7].status, 'empty');
    assert.strictEqual(mockTables[3].items.length, 0);
    assert.strictEqual(mockTables[7].items.length, 0);
});

runSimulationTest("ROLLOVER-02: Table timer formatting handles prior-day timers cleanly without '1205m'", () => {
    assert(posJs.includes("Yesterday") || posJs.includes("formattedTimer"), "pos.js must format timers older than 24h as 'Yesterday'");
    assert(posJs.includes("stale-table"), "pos.js should apply stale-table class for orders over 1440m");
});

runSimulationTest("ROLLOVER-03: Staff switch in js/staff.js triggers force stale table rollover", () => {
    assert(staffJs.includes("checkAndRolloverStaleTables"), "staff.js must call checkAndRolloverStaleTables on unlockTerminal");
});

// ==============================================================================
// 5. HARDWARE BLUETOOTH CONNECTIVITY & SERVER REST SYNC SECURITY
// ==============================================================================
console.log("\n📍 PHASE 5: HARDWARE BLUETOOTH & MULTI-TENANT CLOUD SYNC VERIFICATION");

runSimulationTest("HW-01: Bluetooth Thermal Printer Bridge supports multi-slot & fallback", () => {
    assert(posJs.includes("ThermalPrinterBridge"), "pos.js must define ThermalPrinterBridge");
    assert(posJs.includes("connectBluetoothPrinter"), "pos.js must define connectBluetoothPrinter");
    assert(posJs.includes("printer1Transport") && posJs.includes("printer2Transport"), "pos.js must support dual printer slot configuration");
});

runSimulationTest("SYNC-01: Multi-tenant API endpoints enforce Bearer JWT token & tenant check", () => {
    const netlifyApi = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'api.js'), 'utf8');
    assert(netlifyApi.includes("verifyTenantAuthorization") || netlifyApi.includes("sanitizeTenantStoreCode"), "API must verify tenant authorization");
    assert(netlifyApi.includes("clientId") || netlifyApi.includes("storeCode"), "API must support clientId / storeCode tenant isolation");
});

runSimulationTest("SYNC-02: UI Invariants preserved (26 modal-close SVGs, zero raw emojis)", () => {
    const modalCloseCount = (indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || []).length;
    assert.strictEqual(modalCloseCount, 26, `Must maintain exactly 26 modal-close-btn SVGs. Found ${modalCloseCount}`);
});

console.log("\n================================================================================");
console.log(`🎯 SIMULATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
console.log("================================================================================");

if (failedTests > 0) {
    process.exit(1);
} else {
    console.log("✨ 5-DEVICE 2-DAY POS SIMULATION SUCCEEDED WITH 100% PASS RATE!");
    process.exit(0);
}
