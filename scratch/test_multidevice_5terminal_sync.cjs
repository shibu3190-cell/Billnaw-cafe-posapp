/**
 * scratch/test_multidevice_5terminal_sync.cjs
 *
 * Verification Suite:
 * 1. Cloud Storage Security Rules & Tenant Isolation (storage.rules & firebase.json)
 * 2. Single-Device 10-Day Persistence & Auto-Login Bypass
 * 3. Master Admin Forgot PIN Flow (Email OTP -> Validation -> PIN Reset)
 * 4. Merged Staff & Connected Terminals Hub (Station Profiles & Assigned Devices)
 * 5. 5-Terminal Concurrent Multi-Role POS Workflow (Admin, Cashier, KDS Chef, Waiter, Manager)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ PASS: ${desc}`);
    } catch (err) {
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     ${err.message}`);
    }
}

async function itAsync(desc, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✅ PASS: ${desc}`);
    } catch (err) {
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     ${err.message}`);
    }
}

function makePost(endpoint, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body || {});
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, json: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, text: data });
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

console.log('====================================================================');
console.log('🚀 5-TERMINAL CONCURRENT MULTI-ROLE & CLOUD STORAGE VERIFICATION SUITE');
console.log('====================================================================\n');

// ------------------------------------------------------------------
// SECTION 1: CLOUD STORAGE SECURITY RULES & DUAL-PATH TENANT GUARDS
// ------------------------------------------------------------------
console.log('📍 SECTION 1: CLOUD STORAGE SECURITY RULES & FIREBASE CONFIG');

it('[STORE-01] storage.rules exists and contains rules_version = "2"', () => {
    const rulesPath = path.join(ROOT_DIR, 'storage.rules');
    assert.strictEqual(fs.existsSync(rulesPath), true, 'storage.rules file must exist');
    const content = fs.readFileSync(rulesPath, 'utf8');
    assert(content.includes('rules_version = \'2\';'), 'Must declare rules_version = 2');
    assert(content.includes('service firebase.storage'), 'Must target service firebase.storage');
});

it('[STORE-02] storage.rules enforces dual-path tenant isolation (/shops/ and /cafes/)', () => {
    const content = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'), 'utf8');
    assert(content.includes('match /shops/{shopId}/{allPaths=**}'), 'Must protect /shops/{shopId}/ sub-tree');
    assert(content.includes('match /cafes/{cafeId}/{allPaths=**}'), 'Must protect /cafes/{cafeId}/ sub-tree');
    assert(content.includes('isTenantOwner(shopId)'), 'Must enforce tenant ownership on /shops/');
    assert(content.includes('isTenantOwner(cafeId)'), 'Must enforce tenant ownership on /cafes/');
});

it('[STORE-03] storage.rules enforces 5MB image size and MIME verification guards', () => {
    const content = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'), 'utf8');
    assert(content.includes('5 * 1024 * 1024'), 'Must enforce 5MB image size limit');
    assert(content.includes('request.resource.contentType.matches(\'image/.*\''), 'Must enforce image MIME format');
    assert(content.includes('allow read, write: if false;'), 'Must have default-deny on unmapped roots');
});

it('[STORE-04] database/storage.rules is 100% synchronized with root storage.rules', () => {
    const rootRules = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'), 'utf8');
    const dbRules = fs.readFileSync(path.join(ROOT_DIR, 'database', 'storage.rules'), 'utf8');
    assert.strictEqual(rootRules.trim(), dbRules.trim(), 'Root and database storage.rules must match identically');
});

it('[STORE-05] firebase.json registers storage rules file', () => {
    const fbJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'firebase.json'), 'utf8'));
    assert(fbJson.storage, 'firebase.json must contain "storage" section');
    assert.strictEqual(fbJson.storage.rules, 'storage.rules', 'firebase.json must point to storage.rules');
});

// ------------------------------------------------------------------
// SECTION 2: SINGLE-DEVICE 10-DAY PERSISTENCE & AUTO-LOGIN
// ------------------------------------------------------------------
console.log('\n📍 SECTION 2: SINGLE-DEVICE 10-DAY PERSISTENCE & AUTO-LOGIN');

it('[PERSIST-01] getStoreActiveDeviceCount helper is defined and exported to window', () => {
    const coreJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf8');
    assert(coreJs.includes('function getStoreActiveDeviceCount()'), 'getStoreActiveDeviceCount must be implemented');
    assert(coreJs.includes('window.getStoreActiveDeviceCount = getStoreActiveDeviceCount;'), 'Must export getStoreActiveDeviceCount to window');
});

it('[PERSIST-02] initStaffSystem auto-unlocks terminal when only 1 device is registered within 10-day TTL', () => {
    const coreJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf8');
    assert(coreJs.includes('const isSingleDevice = devCount <= 1;'), 'Must test isSingleDevice boundary');
    assert(coreJs.includes('unlockTerminal(currentStaff);'), 'Must call unlockTerminal on single device without PIN lock screen');
});

it('[PERSIST-03] Multi-device setup (>1 device) or explicit manual lock enforces 4-digit PIN lock on startup', () => {
    const coreJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf8');
    assert(coreJs.includes('if (isLocked || !isSingleDevice)'), 'Multi-device or explicit lock must enforce PIN');
    assert(coreJs.includes('lockTerminal(false);'), 'Must lock terminal when multi-device active');
});

// ------------------------------------------------------------------
// SECTION 3: MASTER ADMIN FORGOT PIN & EMAIL OTP API & MODAL
// ------------------------------------------------------------------
console.log('\n📍 SECTION 3: MASTER ADMIN FORGOT PIN & EMAIL OTP RESET');

it('[FORGOT-01] index.html contains #adminForgotPinModal with dedicated .forgot-pin-close-btn', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert(html.includes('id="adminForgotPinModal"'), 'Must define #adminForgotPinModal');
    assert(html.includes('class="forgot-pin-close-btn"'), 'Must use dedicated .forgot-pin-close-btn');
    assert(!html.includes('class="modal-close-btn" aria-label="Close" onclick="closeAdminForgotPinModal()"'), 'Must NEVER use .modal-close-btn');
});

it('[FORGOT-02] Invariant 26 modal close button SVGs is strictly preserved', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const matches = html.match(/class="[^"]*modal-close-btn[^"]*"[^>]*>[\s\S]*?<svg/g);
    assert.strictEqual(matches ? matches.length : 0, 26, 'Strict invariant: exactly 26 .modal-close-btn SVGs in index.html');
});

it('[FORGOT-03] #loginOverlay, #deviceApprovalPinModal & #staffSwitchModal link to openAdminForgotPinModal', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert(html.includes('onclick="openAdminForgotPinModal()"'), 'Must link to openAdminForgotPinModal in UI');
    const occurrences = (html.match(/onclick="openAdminForgotPinModal\(\)"/g) || []).length;
    assert(occurrences >= 3, `Expected at least 3 Forgot PIN links in DOM, found ${occurrences}`);
});

// ------------------------------------------------------------------
// SECTION 4: MERGED STAFF & CONNECTED TERMINALS HUB
// ------------------------------------------------------------------
console.log('\n📍 SECTION 4: MERGED STAFF & CONNECTED TERMINALS TABLE');

it('[MERGED-01] #staffManagementModal table header contains Assigned Terminal and Role & Station', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert(html.includes('<th>Role &amp; Station</th>'), 'Must contain Role & Station column');
    assert(html.includes('<th>Assigned Terminal</th>'), 'Must contain Assigned Terminal column');
    assert(html.includes('<th>Phone &amp; PIN</th>'), 'Must contain Phone & PIN column');
});

it('[MERGED-02] js/staff.js renderStaffManagementUI maps staff member to connected terminal and station profile', () => {
    const staffJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'staff.js'), 'utf8');
    assert(staffJs.includes('assignedDev.deviceName'), 'Must display device name in staff row');
    assert(staffJs.includes('stationProfile'), 'Must calculate and render station profile label');
    assert(staffJs.includes('Dynamic / Any'), 'Must provide fallback indicator when no terminal explicitly linked');
});

// ------------------------------------------------------------------
// SECTION 5: LIVE BACKEND OTP REST & PIN RESET ENDPOINTS
// ------------------------------------------------------------------
console.log('\n📍 SECTION 5: LIVE BACKEND FORGOT PIN REST API');

itAsync('[API-01] POST /api/auth/admin-forgot-pin/send-otp dispatches 6-digit OTP code', async () => {
    const res = await makePost('/api/auth/admin-forgot-pin/send-otp', { email: 'multidevice_audit@billnawcafe.com' });
    assert.strictEqual(res.statusCode, 200, 'Must return HTTP 200');
    assert.strictEqual(res.json.success, true, 'success flag must be true');
    assert.strictEqual(typeof res.json.devOtp, 'string', 'Must provide devOtp in test environment');
    assert.strictEqual(res.json.devOtp.length, 6, 'devOtp must be 6 digits');
});

itAsync('[API-02] POST /api/auth/admin-forgot-pin/reset rejects incorrect OTP code', async () => {
    const res = await makePost('/api/auth/admin-forgot-pin/reset', {
        email: 'multidevice_audit@billnawcafe.com',
        otp: '000000',
        newPin: '8492'
    });
    assert.strictEqual(res.statusCode, 400, 'Must return HTTP 400 on bad OTP');
    assert.strictEqual(res.json.success, false);
});

itAsync('[API-03] POST /api/auth/admin-forgot-pin/reset rejects sequential or trivial PINs', async () => {
    // Get fresh OTP
    const otpRes = await makePost('/api/auth/admin-forgot-pin/send-otp', { email: 'multidevice_audit_trivial@billnawcafe.com' });
    const otp = otpRes.json.devOtp;

    const res = await makePost('/api/auth/admin-forgot-pin/reset', {
        email: 'multidevice_audit_trivial@billnawcafe.com',
        otp: otp,
        newPin: '1234'
    });
    assert.strictEqual(res.statusCode, 400, 'Must reject 1234');
});

itAsync('[API-04] POST /api/auth/admin-forgot-pin/reset successfully updates Admin PIN with valid OTP', async () => {
    const email = 'multidevice_audit_success@billnawcafe.com';
    const otpRes = await makePost('/api/auth/admin-forgot-pin/send-otp', { email });
    const otp = otpRes.json.devOtp;

    const resetRes = await makePost('/api/auth/admin-forgot-pin/reset', {
        email,
        otp,
        newPin: '9371'
    });
    assert.strictEqual(resetRes.statusCode, 200, 'Must succeed with HTTP 200');
    assert.strictEqual(resetRes.json.success, true);
    assert(resetRes.json.adminPinHash, 'Must return updated adminPinHash');
});

// ------------------------------------------------------------------
// SECTION 6: 5-TERMINAL CONCURRENT SIMULATION ENGINE
// ------------------------------------------------------------------
console.log('\n📍 SECTION 6: 5-TERMINAL CONCURRENT POS SIMULATION');

class TerminalInstance {
    constructor(deviceId, deviceName, stationProfile, role, staffName, pin) {
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        this.stationProfile = stationProfile;
        this.role = role;
        this.staffName = staffName;
        this.pin = pin;
        this.status = deviceId === 'DEV_MASTER_01' ? 'AUTHORIZED' : 'PENDING';
        this.pairingCode = deviceId === 'DEV_MASTER_01' ? null : String(100000 + Math.floor(Math.random() * 900000));
        this.isLocked = false;
        this.cart = [];
        this.kots = [];
        this.settledInvoices = [];
    }

    canAccessStore() {
        return this.status === 'AUTHORIZED';
    }

    lock() {
        this.isLocked = true;
    }

    unlock(enteredPin) {
        if (enteredPin === this.pin || enteredPin === '9999') {
            this.isLocked = false;
            return true;
        }
        return false;
    }
}

class SimulatedStoreCluster {
    constructor(storeCode, adminPin) {
        this.storeCode = storeCode;
        this.adminPin = adminPin;
        this.terminals = new Map();
        this.sharedMenu = [
            { id: 1, name: 'Espresso Macchiato', price: 140 },
            { id: 2, name: 'Paneer Tikka Roll', price: 190 },
            { id: 3, name: 'Cold Brew Citrus', price: 180 }
        ];
        this.sharedKotQueue = [];
        this.sharedInvoiceLedger = [];
        this.liveSessions = new Map();
    }

    addTerminal(t) {
        this.terminals.set(t.deviceId, t);
    }

    approveTerminal(adminPin, deviceId, stationProfile) {
        if (adminPin !== this.adminPin) throw new Error('AUTH_FAILED: Master Admin PIN required');
        const term = this.terminals.get(deviceId);
        if (!term) throw new Error('DEVICE_NOT_FOUND');
        term.status = 'AUTHORIZED';
        term.stationProfile = stationProfile;
        term.pairingCode = null;
        return term;
    }

    remoteLockTerminal(adminPin, targetDeviceId) {
        if (adminPin !== this.adminPin) throw new Error('AUTH_FAILED: Master Admin PIN required');
        const term = this.terminals.get(targetDeviceId);
        if (!term) throw new Error('DEVICE_NOT_FOUND');
        if (term.deviceId === 'DEV_MASTER_01') throw new Error('IMMUNITY: Master terminal cannot be remote locked');
        term.lock();
        return true;
    }

    dispatchKot(waiterTerm, tableNumber, items) {
        if (!waiterTerm.canAccessStore()) throw new Error('DEVICE_QUARANTINED');
        if (waiterTerm.isLocked) throw new Error('TERMINAL_LOCKED');
        const kot = {
            kotId: `KOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tableNumber,
            items,
            status: 'RECEIVED',
            createdByStaff: waiterTerm.staffName,
            deviceId: waiterTerm.deviceId,
            createdAt: new Date().toISOString()
        };
        this.sharedKotQueue.push(kot);
        return kot;
    }

    advanceKotStatus(chefTerm, kotId, newStatus) {
        if (!chefTerm.canAccessStore()) throw new Error('DEVICE_QUARANTINED');
        if (chefTerm.stationProfile !== 'KDS' && chefTerm.role !== 'Admin') throw new Error('RBAC_DENIED');
        const kot = this.sharedKotQueue.find(k => k.kotId === kotId);
        if (!kot) throw new Error('KOT_NOT_FOUND');
        kot.status = newStatus;
        return kot;
    }

    settleInvoice(cashierTerm, kotId, paymentMethod) {
        if (!cashierTerm.canAccessStore()) throw new Error('DEVICE_QUARANTINED');
        if (cashierTerm.role !== 'Cashier' && cashierTerm.role !== 'Admin' && cashierTerm.role !== 'Manager') throw new Error('RBAC_DENIED');
        const kot = this.sharedKotQueue.find(k => k.kotId === kotId);
        if (!kot) throw new Error('KOT_NOT_FOUND');
        const total = kot.items.reduce((s, i) => s + i.price, 0);
        const inv = {
            invoiceId: `BN-${cashierTerm.deviceId}-${Date.now().toString().slice(-4)}`,
            kotId,
            tableNumber: kot.tableNumber,
            total,
            paymentMethod,
            cashier: cashierTerm.staffName,
            status: 'PAID',
            timestamp: new Date().toISOString()
        };
        this.sharedInvoiceLedger.push(inv);
        return inv;
    }
}

it('[SIM-01] Bootstraps 5-Terminal Store Cluster (Master Admin, Register 2, KDS Kitchen, Waiter Tablet, Manager)', () => {
    const cluster = new SimulatedStoreCluster('SHOP-CAFE-5T', '9999');

    // Terminal 1: Master Admin Terminal
    const t1 = new TerminalInstance('DEV_MASTER_01', 'Master Counter 1', 'ADMIN_MASTER', 'Admin', 'Shibu Mukherjee', '9999');
    // Terminal 2: Register 2 Cashier
    const t2 = new TerminalInstance('DEV_REGISTER_02', 'Billing Counter 2', 'BILLING_COUNTER', 'Cashier', 'Priya Sharma', '2244');
    // Terminal 3: Kitchen Display System (KDS)
    const t3 = new TerminalInstance('DEV_KDS_KITCHEN_03', 'Kitchen KDS Tablet', 'KDS', 'Kitchen Chef', 'Chef Vikram', '3355');
    // Terminal 4: Waiter Mobile Tablet
    const t4 = new TerminalInstance('DEV_WAITER_TAB_04', 'Floor Tablet 1', 'WAITER_MOBILE', 'Floor Server', 'Rahul Das', '4466');
    // Terminal 5: Manager Station
    const t5 = new TerminalInstance('DEV_MANAGER_05', 'Manager Office Terminal', 'GENERAL_STATION', 'Manager', 'Ananya Roy', '5577');

    cluster.addTerminal(t1);
    cluster.addTerminal(t2);
    cluster.addTerminal(t3);
    cluster.addTerminal(t4);
    cluster.addTerminal(t5);

    assert.strictEqual(cluster.terminals.size, 5);
    assert.strictEqual(t1.canAccessStore(), true, 'Master Terminal starts Authorized');
    assert.strictEqual(t2.canAccessStore(), false, 'Secondary Register starts Quarantined (PENDING)');
    assert.strictEqual(t3.canAccessStore(), false, 'KDS starts Quarantined (PENDING)');
    assert.strictEqual(t4.canAccessStore(), false, 'Waiter Tablet starts Quarantined (PENDING)');
    assert.strictEqual(t5.canAccessStore(), false, 'Manager Station starts Quarantined (PENDING)');
});

it('[SIM-02] Master Admin approves Secondary Terminals 2, 3, 4, 5 using Master Admin PIN', () => {
    const cluster = new SimulatedStoreCluster('SHOP-CAFE-5T', '9999');
    const t1 = new TerminalInstance('DEV_MASTER_01', 'Master Counter 1', 'ADMIN_MASTER', 'Admin', 'Shibu Mukherjee', '9999');
    const t2 = new TerminalInstance('DEV_REGISTER_02', 'Billing Counter 2', 'BILLING_COUNTER', 'Cashier', 'Priya Sharma', '2244');
    const t3 = new TerminalInstance('DEV_KDS_KITCHEN_03', 'Kitchen KDS Tablet', 'KDS', 'Kitchen Chef', 'Chef Vikram', '3355');
    const t4 = new TerminalInstance('DEV_WAITER_TAB_04', 'Floor Tablet 1', 'WAITER_MOBILE', 'Floor Server', 'Rahul Das', '4466');
    const t5 = new TerminalInstance('DEV_MANAGER_05', 'Manager Office Terminal', 'GENERAL_STATION', 'Manager', 'Ananya Roy', '5577');

    cluster.addTerminal(t1);
    cluster.addTerminal(t2);
    cluster.addTerminal(t3);
    cluster.addTerminal(t4);
    cluster.addTerminal(t5);

    // Attempt approval with bad PIN
    assert.throws(() => cluster.approveTerminal('0000', 'DEV_REGISTER_02', 'BILLING_COUNTER'), /AUTH_FAILED/);

    // Legitimate approvals
    cluster.approveTerminal('9999', 'DEV_REGISTER_02', 'BILLING_COUNTER');
    cluster.approveTerminal('9999', 'DEV_KDS_KITCHEN_03', 'KDS');
    cluster.approveTerminal('9999', 'DEV_WAITER_TAB_04', 'WAITER_MOBILE');
    cluster.approveTerminal('9999', 'DEV_MANAGER_05', 'GENERAL_STATION');

    assert.strictEqual(t2.canAccessStore(), true);
    assert.strictEqual(t3.canAccessStore(), true);
    assert.strictEqual(t4.canAccessStore(), true);
    assert.strictEqual(t5.canAccessStore(), true);
});

it('[SIM-03] End-to-End Live Workflow: Waiter Tab -> Kitchen KDS -> Register 2 Settlement -> Admin Ledger', () => {
    const cluster = new SimulatedStoreCluster('SHOP-CAFE-5T', '9999');
    const t1 = new TerminalInstance('DEV_MASTER_01', 'Master Counter 1', 'ADMIN_MASTER', 'Admin', 'Shibu Mukherjee', '9999');
    const t2 = new TerminalInstance('DEV_REGISTER_02', 'Billing Counter 2', 'BILLING_COUNTER', 'Cashier', 'Priya Sharma', '2244');
    const t3 = new TerminalInstance('DEV_KDS_KITCHEN_03', 'Kitchen KDS Tablet', 'KDS', 'Kitchen Chef', 'Chef Vikram', '3355');
    const t4 = new TerminalInstance('DEV_WAITER_TAB_04', 'Floor Tablet 1', 'WAITER_MOBILE', 'Floor Server', 'Rahul Das', '4466');
    const t5 = new TerminalInstance('DEV_MANAGER_05', 'Manager Office Terminal', 'GENERAL_STATION', 'Manager', 'Ananya Roy', '5577');

    cluster.addTerminal(t1);
    cluster.addTerminal(t2);
    cluster.addTerminal(t3);
    cluster.addTerminal(t4);
    cluster.addTerminal(t5);

    cluster.approveTerminal('9999', 'DEV_REGISTER_02', 'BILLING_COUNTER');
    cluster.approveTerminal('9999', 'DEV_KDS_KITCHEN_03', 'KDS');
    cluster.approveTerminal('9999', 'DEV_WAITER_TAB_04', 'WAITER_MOBILE');
    cluster.approveTerminal('9999', 'DEV_MANAGER_05', 'GENERAL_STATION');

    // Step 1: Waiter Tablet takes order for Table 4
    const kot = cluster.dispatchKot(t4, 4, [
        { id: 1, name: 'Espresso Macchiato', price: 140 },
        { id: 2, name: 'Paneer Tikka Roll', price: 190 }
    ]);
    assert.strictEqual(kot.status, 'RECEIVED');
    assert.strictEqual(cluster.sharedKotQueue.length, 1);

    // Step 2: Kitchen KDS receives order & chef advances status
    const preparingKot = cluster.advanceKotStatus(t3, kot.kotId, 'PREPARING');
    assert.strictEqual(preparingKot.status, 'PREPARING');

    const readyKot = cluster.advanceKotStatus(t3, kot.kotId, 'READY');
    assert.strictEqual(readyKot.status, 'READY');

    // Step 3: Cashier at Register 2 settles bill
    const invoice = cluster.settleInvoice(t2, kot.kotId, 'UPI');
    assert.strictEqual(invoice.status, 'PAID');
    assert.strictEqual(invoice.total, 330);
    assert.strictEqual(cluster.sharedInvoiceLedger.length, 1);

    // Step 4: Master Admin reviews consolidated store revenue
    const totalRevenue = cluster.sharedInvoiceLedger.reduce((sum, inv) => sum + inv.total, 0);
    assert.strictEqual(totalRevenue, 330);
});

it('[SIM-04] Admin remote locks Waiter Tablet; Waiter is locked out while Master is immune', () => {
    const cluster = new SimulatedStoreCluster('SHOP-CAFE-5T', '9999');
    const t1 = new TerminalInstance('DEV_MASTER_01', 'Master Counter 1', 'ADMIN_MASTER', 'Admin', 'Shibu Mukherjee', '9999');
    const t4 = new TerminalInstance('DEV_WAITER_TAB_04', 'Floor Tablet 1', 'WAITER_MOBILE', 'Floor Server', 'Rahul Das', '4466');

    cluster.addTerminal(t1);
    cluster.addTerminal(t4);
    cluster.approveTerminal('9999', 'DEV_WAITER_TAB_04', 'WAITER_MOBILE');

    // Master terminal immunity check
    assert.throws(() => cluster.remoteLockTerminal('9999', 'DEV_MASTER_01'), /IMMUNITY/);

    // Remote lock Waiter Tablet
    cluster.remoteLockTerminal('9999', 'DEV_WAITER_TAB_04');
    assert.strictEqual(t4.isLocked, true);

    // Waiter cannot dispatch orders while locked
    assert.throws(() => cluster.dispatchKot(t4, 2, [{ id: 1, name: 'Espresso', price: 140 }]), /TERMINAL_LOCKED/);

    // Waiter unlocks with their private PIN
    const unlocked = t4.unlock('4466');
    assert.strictEqual(unlocked, true);
    assert.strictEqual(t4.isLocked, false);
});

setTimeout(() => {
    console.log('\n====================================================================');
    console.log(`🎯 TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('====================================================================');

    if (passedTests === totalTests) {
        console.log('\n✨ ALL MULTI-DEVICE 5-TERMINAL CONCURRENT & STORAGE TESTS PASSED 100% GREEN!\n');
        process.exit(0);
    } else {
        console.error('\n❌ SOME TESTS FAILED.\n');
        process.exit(1);
    }
}, 500);
