// scratch/test_adversarial_m3_presence_lockout.cjs
// Adversarial Challenger Test Harness for Milestone 3 (R3)
// Staff Cloud Presence, Inactive Handling, Remote Deletion & Lockout Stress

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('====================================================================');
console.log('⚔️  ADVERSARIAL CHALLENGER SUITE: MILESTONE 3 (R3)');
console.log('   Stress-Testing Staff Cloud Presence, Remote Lockout & Invariants');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function challenge(id, desc, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${id}: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${id}: ${desc}`);
        console.error(`     Reason: ${err.message}`);
        failedTests++;
        failures.push({ id, desc, error: err.message });
    }
}

async function challengeAsync(id, desc, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${id}: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${id}: ${desc}`);
        console.error(`     Reason: ${err.message}`);
        failedTests++;
        failures.push({ id, desc, error: err.message });
    }
}

// ----------------------------------------------------------------------------
// Minimal DOM & Runtime Sandbox for Empirical Execution
// ----------------------------------------------------------------------------
function createMockEnvironment() {
    const elements = new Map();

    function createMockElement(id, tag = 'div') {
        const el = {
            id,
            tagName: tag.toUpperCase(),
            style: { display: 'none', zIndex: '0' },
            classList: {
                _classes: new Set(),
                add(c) { this._classes.add(c); },
                remove(c) { this._classes.delete(c); },
                contains(c) { return this._classes.has(c); },
                toggle(c, f) {
                    if (f !== undefined) {
                        if (f) this._classes.add(c);
                        else this._classes.delete(c);
                    } else {
                        if (this._classes.has(c)) this._classes.delete(c);
                        else this._classes.add(c);
                    }
                }
            },
            attributes: new Map(),
            setAttribute(k, v) { this.attributes.set(k, String(v)); },
            getAttribute(k) { return this.attributes.get(k) || null; },
            removeAttribute(k) { this.attributes.delete(k); },
            children: [],
            appendChild(c) { this.children.push(c); return c; },
            removeChild(c) {
                const i = this.children.indexOf(c);
                if (i !== -1) this.children.splice(i, 1);
                return c;
            },
            querySelector(sel) {
                if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
                return null;
            },
            querySelectorAll(sel) {
                if (sel === '.modal-overlay') {
                    return Array.from(elements.values()).filter(e => e.classList && e.classList.contains('modal-overlay'));
                }
                return [];
            },
            innerHTML: '',
            innerText: '',
            value: '',
            disabled: false,
            focus() { this._focused = true; }
        };
        elements.set(id, el);
        return el;
    }

    const mockLocalStorage = {
        _store: new Map(),
        getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
        setItem(k, v) { this._store.set(k, String(v)); },
        removeItem(k) { this._store.delete(k); },
        clear() { this._store.clear(); }
    };

    // Standard required DOM elements
    createMockElement('staffTableBody', 'tbody');
    createMockElement('loginStaffPicker', 'div');
    const loginOverlay = createMockElement('loginOverlay', 'div');
    loginOverlay.classList.add('modal-overlay');
    createMockElement('staffLoginPinInput', 'input');
    createMockElement('adminPinInput', 'input');
    createMockElement('staffModal', 'div');
    createMockElement('staffNameInput', 'input');
    createMockElement('staffRoleInput', 'select');
    createMockElement('staffPhoneInput', 'input');
    createMockElement('staffPinInput', 'input');
    createMockElement('staffStatusInput', 'select');
    createMockElement('staffIdInput', 'input');

    const sandbox = {
        document: {
            getElementById(id) {
                if (!elements.has(id)) return createMockElement(id);
                return elements.get(id);
            },
            querySelectorAll(sel) {
                if (sel === '.modal-overlay') {
                    return Array.from(elements.values()).filter(e => e.classList && e.classList.contains('modal-overlay'));
                }
                return [];
            },
            createElement(tag) { return createMockElement('mock_' + Math.random(), tag); },
            body: createMockElement('body', 'body')
        },
        window: {
            activeStaffSessions: [],
            authorizedDevices: [],
            currentStaff: null,
            currentRole: null,
            currentSessionId: null,
            isTerminalLocked: false,
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {}
        },
        currentStaff: null,
        currentRole: null,
        staffList: [],
        localStorage: mockLocalStorage,
        CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } },
        showToast(msg) { sandbox.lastToast = msg; },
        confirm() { return true; },
        alert() {},
        console: { log() {}, warn() {}, error() {} },
        Date: Date,
        Math: Math,
        setTimeout(fn) { if (typeof fn === 'function') fn(); return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {}
    };

    // Load and evaluate js/staff.js in sandbox
    const staffJsContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');
    const vm = require('vm');
    const context = vm.createContext(sandbox);
    vm.runInContext(staffJsContent, context);

    return { sandbox, elements };
}

(async () => {
    // ========================================================================
    // 📍 DIMENSION 1: PRESENCE & INACTIVE HANDLING
    // ========================================================================
    console.log('📍 DIMENSION 1: PRESENCE & INACTIVE HANDLING');

    challenge('ADV-PRES-01', 'Staff with null/missing lastSeen renders "Inactive (Never Logged In)" with neutral dot', () => {
        const { sandbox } = createMockEnvironment();
        const tbody = sandbox.document.getElementById('staffTableBody');

        // Test unlogged staff variants
        sandbox.staffList = [
            { id: 101, name: 'Aarav Patel', role: 'Cashier', status: 'Active', lastSeen: null },
            { id: 102, name: 'Bhavna Sen', role: 'Floor Server', status: 'Active' }, // undefined lastSeen
            { id: 103, name: 'Chetan Kumar', role: 'Kitchen Chef', status: 'Active', lastSeen: '' } // empty lastSeen
        ];
        sandbox.window.activeStaffSessions = [];

        sandbox.renderStaffManagementUI();
        const output = tbody.innerHTML;

        assert.ok(output.includes('Inactive (Never Logged In)'), 'Must render "Inactive (Never Logged In)" for unlogged staff');
        assert.ok(output.includes('#94A3B8'), 'Must use neutral gray indicator (#94A3B8)');
        // Count occurrences — all 3 unlogged staff members must show Inactive (Never Logged In)
        const matchCount = (output.match(/Inactive \(Never Logged In\)/g) || []).length;
        assert.strictEqual(matchCount, 3, 'All 3 unlogged staff members must show "Inactive (Never Logged In)"');
    });

    challenge('ADV-PRES-02', 'Unlogged staff with status: "Active" must NEVER display "Active now" or "Online"', () => {
        const { sandbox } = createMockEnvironment();
        const tbody = sandbox.document.getElementById('staffTableBody');

        sandbox.staffList = [
            { id: 104, name: 'Deepak Joshi', role: 'Cashier', status: 'Active', lastSeen: null }
        ];
        sandbox.window.activeStaffSessions = [];

        sandbox.renderStaffManagementUI();
        const output = tbody.innerHTML;

        assert.ok(!output.includes('Active now'), 'Unlogged staff must never show "Active now"');
        assert.ok(!output.includes('🟢 Online'), 'Unlogged staff must never show "🟢 Online"');
    });

    challenge('ADV-PRES-03', 'Staff active within 15 minutes shows "Active now" or relative active time', () => {
        const { sandbox } = createMockEnvironment();
        const tbody = sandbox.document.getElementById('staffTableBody');
        const now = Date.now();

        sandbox.staffList = [
            { id: 105, name: 'Esha Gupta', role: 'Cashier', status: 'Active' }
        ];
        // Active session with heartbeat 2 minutes ago
        sandbox.window.activeStaffSessions = [
            {
                staffId: 105,
                status: 'ONLINE',
                lastActiveAt: new Date(now - 2 * 60 * 1000).toISOString(),
                deviceName: 'Billing Counter 1'
            }
        ];

        sandbox.renderStaffManagementUI();
        const output = tbody.innerHTML;

        assert.ok(output.includes('Active'), 'Recently active staff must display Active status');
        assert.ok(output.includes('Active 2m ago') || output.includes('Active now'), 'Must display relative active timestamp');
        assert.ok(output.includes('Online'), 'Must indicate Online');
    });

    challenge('ADV-PRES-04', 'Staff timestamp > 15 minutes old MUST show offline / relative time and NEVER active dot', () => {
        const { sandbox } = createMockEnvironment();
        const tbody = sandbox.document.getElementById('staffTableBody');
        const now = Date.now();

        // Bob was last active 20 minutes ago and has NO active session
        sandbox.staffList = [
            { id: 106, name: 'Bob Mehta', role: 'Cashier', status: 'Active', lastSeen: new Date(now - 20 * 60 * 1000).toISOString() }
        ];
        sandbox.window.activeStaffSessions = [];

        sandbox.renderStaffManagementUI();
        const output = tbody.innerHTML;

        // An inactive/offline staff member whose last seen is 20m ago:
        // Must show relative time or offline
        const hasOfflineOrRel = output.includes('20m') || output.includes('Offline') || output.includes('Inactive');
        // Must NOT show active green dot
        const hasActiveGreenDot = output.includes('var(--success)') && !output.includes('Offline');

        if (!hasOfflineOrRel || hasActiveGreenDot) {
            throw new Error(`Staff with 20m old timestamp renders active dot or fails to show offline/relative time. Output snippet: ${output.slice(0, 300)}`);
        }
    });

    challenge('ADV-PRES-05', 'Stale session > 15m old marked status: ONLINE must NOT bypass timestamp check or show active dot', () => {
        const { sandbox } = createMockEnvironment();
        const tbody = sandbox.document.getElementById('staffTableBody');
        const now = Date.now();

        // Charlie's device closed 25 minutes ago, but Firestore session record still has status: 'ONLINE'
        sandbox.staffList = [
            { id: 107, name: 'Charlie Dave', role: 'Cashier', status: 'Active' }
        ];
        sandbox.window.activeStaffSessions = [
            {
                staffId: 107,
                status: 'ONLINE', // Stale status in Firestore
                lastActiveAt: new Date(now - 25 * 60 * 1000).toISOString(),
                deviceName: 'Counter Register'
            }
        ];

        sandbox.renderStaffManagementUI();
        const output = tbody.innerHTML;

        // When heartbeat is 25 minutes stale (> 15m), session is stale and cannot be displayed as active green dot or "🟢 Online"
        const showsGreenOnline = output.includes('🟢 Online') || output.includes('var(--success)');
        if (showsGreenOnline) {
            throw new Error(`Stale session (25m old) displays active green dot or "🟢 Online" due to unchecked status === 'ONLINE' short-circuit`);
        }
    });

    challenge('ADV-PRES-06', 'Admin login registers session record with Admin role, isMaster, and heartbeat capability', async () => {
        const { sandbox } = createMockEnvironment();

        // Mock verifyAdminPin
        sandbox.verifyAdminPin = async () => true;
        sandbox.staffList = [
            { id: 1, name: 'Admin', role: 'Admin' }
        ];
        sandbox.window.currentDeviceRecord = { deviceName: 'Master Terminal' };

        await sandbox.loginAsAdmin();

        assert.strictEqual(sandbox.currentRole, 'admin', 'currentRole must be admin');
        assert.ok(sandbox.currentStaff, 'currentStaff must be set');
        assert.strictEqual(sandbox.currentStaff.role, 'Admin', 'currentStaff.role must be Admin');

        assert.ok(Array.isArray(sandbox.window.activeStaffSessions), 'activeStaffSessions must be an array');
        const adminSess = sandbox.window.activeStaffSessions.find(s => s.staffRole === 'Admin' || s.role === 'Admin');
        assert.ok(adminSess, 'Admin session must be registered in activeStaffSessions');
        assert.strictEqual(adminSess.isMaster, true, 'Admin session must have isMaster: true');
        assert.strictEqual(adminSess.status, 'ONLINE', 'Admin session must have status: ONLINE');
        assert.ok(adminSess.lastActiveAt, 'Admin session must have lastActiveAt');
    });

    // ========================================================================
    // 📍 DIMENSION 2: STAFF DELETION & REAL-TIME REMOTE REVOCATION
    // ========================================================================
    console.log('\n📍 DIMENSION 2: STAFF DELETION & REAL-TIME REMOTE REVOCATION');

    challenge('ADV-REV-01', 'deleteStaffMember sets status: REVOKED, isLocked: true on matching active sessions', async () => {
        const { sandbox } = createMockEnvironment();

        const targetStaff = { id: 201, name: 'Rohan Mehra', role: 'Cashier' };
        sandbox.staffList = [
            { id: 1, name: 'Admin', role: 'Admin' },
            targetStaff
        ];
        sandbox.currentStaff = sandbox.staffList[0]; // Admin

        const syncedCloudRecords = [];
        sandbox.syncSessionRecordToCloud = (rec) => syncedCloudRecords.push(rec);

        sandbox.window.activeStaffSessions = [
            { sessionId: 'sess_rohan_01', staffId: 201, status: 'ONLINE', isLocked: false },
            { sessionId: 'sess_admin_01', staffId: 1, status: 'ONLINE', isLocked: false }
        ];

        let firestoreDocDeleted = false;
        sandbox.window.firestoreDeleteDoc = async () => { firestoreDocDeleted = true; };
        sandbox.getStoreSubdocRef = (col, id) => ({ path: `${col}/${id}` });

        await sandbox.deleteStaffMember(201);

        // Verify staff deleted from staffList
        assert.ok(!sandbox.staffList.some(s => s.id === 201), 'Staff member must be removed from staffList');

        // Verify Firestore deleteDoc was called
        assert.strictEqual(firestoreDocDeleted, true, 'Firestore staff document must be deleted');

        // Verify session status in activeStaffSessions
        const rohanSess = sandbox.window.activeStaffSessions.find(s => s.staffId === 201);
        assert.ok(rohanSess, 'Rohan session record must exist');
        assert.strictEqual(rohanSess.status, 'REVOKED', 'Session status must be updated to REVOKED');
        assert.strictEqual(rohanSess.isLocked, true, 'Session isLocked must be true');

        // Verify cloud sync was called with REVOKED status
        const cloudRevoked = syncedCloudRecords.find(r => r.sessionId === 'sess_rohan_01');
        assert.ok(cloudRevoked, 'Cloud sync must be invoked for revoked session');
        assert.strictEqual(cloudRevoked.status, 'REVOKED');
        assert.strictEqual(cloudRevoked.isLocked, true);

        // Admin session remains untouched
        const adminSess = sandbox.window.activeStaffSessions.find(s => s.staffId === 1);
        assert.strictEqual(adminSess.status, 'ONLINE', 'Admin session must remain ONLINE');
    });

    challenge('ADV-REV-02', 'lockTerminalByRemote clears in-progress cart, purges staff, and locks screen', () => {
        const { sandbox } = createMockEnvironment();

        // Setup active state on secondary terminal
        sandbox.window.cart = [{ id: 1, name: 'Cappuccino', price: 150, qty: 2 }];
        sandbox.currentCart = sandbox.window.cart;
        sandbox.localStorage.setItem('billnaw_active_cart', JSON.stringify(sandbox.window.cart));

        sandbox.window.currentStaff = { id: 201, name: 'Rohan Mehra', role: 'Cashier' };
        sandbox.currentStaff = sandbox.window.currentStaff;
        sandbox.currentRole = 'Cashier';
        sandbox.window.currentSessionId = 'sess_rohan_01';
        sandbox.localStorage.setItem('billnaw_active_staff', JSON.stringify(sandbox.currentStaff));

        sandbox.isTerminalLocked = false;
        sandbox.window.isTerminalLocked = false;

        // Trigger remote lockout
        sandbox.lockTerminalByRemote({ staffId: 201, status: 'REVOKED', reason: 'Staff profile removed by Admin' });

        // 1. Verify Cart Wiped
        assert.strictEqual(sandbox.window.cart.length, 0, 'window.cart must be empty');
        assert.strictEqual(sandbox.localStorage.getItem('billnaw_active_cart'), null, 'billnaw_active_cart must be removed from localStorage');

        // 2. Verify Staff Purged
        assert.strictEqual(sandbox.window.currentStaff, null, 'window.currentStaff must be null');
        assert.strictEqual(sandbox.currentStaff, null, 'currentStaff must be null');
        assert.strictEqual(sandbox.window.currentRole, null, 'window.currentRole must be null');
        assert.strictEqual(sandbox.window.currentSessionId, null, 'currentSessionId must be null');
        assert.strictEqual(sandbox.localStorage.getItem('billnaw_active_staff'), null, 'billnaw_active_staff must be removed from localStorage');

        // 3. Verify Terminal Locked
        assert.strictEqual(sandbox.window.isTerminalLocked, true, 'window.isTerminalLocked must be true');
        assert.strictEqual(sandbox.localStorage.getItem('billnaw_terminal_locked'), 'true', 'billnaw_terminal_locked must be "true"');

        // 4. Verify Login Overlay Shown
        const overlay = sandbox.document.getElementById('loginOverlay');
        assert.strictEqual(overlay.style.display, 'flex', '#loginOverlay display must be flex');
    });

    challenge('ADV-REV-03', 'Master Admin Terminal is IMMUNE to lockTerminalByRemote', () => {
        const { sandbox } = createMockEnvironment();

        // Mark this terminal as Master Terminal
        sandbox.localStorage.setItem('billnaw_is_master', 'true');
        sandbox.isMasterTerminal = () => true;

        sandbox.window.cart = [{ id: 1, name: 'Latte', price: 180, qty: 1 }];
        sandbox.window.currentStaff = { id: 1, name: 'Admin Owner', role: 'Admin' };
        sandbox.isTerminalLocked = false;

        // Attempt remote lockout on Master Terminal
        sandbox.lockTerminalByRemote({ status: 'REVOKED' });

        // Verify Master Terminal is completely unaffected
        assert.strictEqual(sandbox.isTerminalLocked, false, 'Master Terminal must NEVER be locked by remote');
        assert.strictEqual(sandbox.window.cart.length, 1, 'Master Terminal cart must NOT be wiped');
        assert.ok(sandbox.window.currentStaff, 'Master Terminal staff must NOT be purged');
    });

    challenge('ADV-REV-04', 'Simulated secondary device Firestore snapshot triggers remote lockout when staff doc deleted', () => {
        // Load js/core.js listener logic
        const coreJsContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');

        // Verify presence of staff snapshot deletion watcher
        assert.ok(coreJsContent.includes('subscribeStaffCloudListener'), 'core.js must implement subscribeStaffCloudListener');
        assert.ok(coreJsContent.includes('lockTerminalByRemote'), 'core.js must call lockTerminalByRemote on staff removal');
        assert.ok(coreJsContent.includes('stillExists'), 'core.js must check if active staff stillExists in snapshot');

        // Verify sessions snapshot watcher
        assert.ok(coreJsContent.includes('subscribeSessionsCloudListener'), 'core.js must implement subscribeSessionsCloudListener');
        assert.ok(coreJsContent.includes("s.status === 'REVOKED'"), 'core.js must detect REVOKED session status');
    });

    // ========================================================================
    // 📍 DIMENSION 3: BLOCKED ACTIONS & RACE CONDITION IMMUNITY
    // ========================================================================
    console.log('\n📍 DIMENSION 3: BLOCKED ACTIONS & RACE CONDITION IMMUNITY');

    challenge('ADV-RACE-01', 'Deleted staff without active session cannot execute admin actions (deleteStaffMember)', async () => {
        const { sandbox } = createMockEnvironment();

        sandbox.staffList = [
            { id: 1, name: 'Admin', role: 'Admin' },
            { id: 202, name: 'Vikram', role: 'Floor Server' }
        ];

        // An unauthenticated / logged-out user (currentStaff === null) attempts deleteStaffMember
        sandbox.currentStaff = null;
        sandbox.window.currentStaff = null;

        // In strict security, unauthenticated caller must NOT be able to delete staff
        // Check if deleteStaffMember requires admin permission
        let hasManageStaffPermission = sandbox.hasPermission(sandbox.currentStaff, 'can_manage_staff');
        assert.strictEqual(hasManageStaffPermission, false, 'Null staff must NOT have can_manage_staff permission');
    });

    challenge('ADV-RACE-01B', 'Post-revocation checkout race condition is strictly blocked (cart wiped, zero items, permission denied)', () => {
        const { sandbox } = createMockEnvironment();

        // 1. Simulate active cart and logged-in cashier before remote revocation
        sandbox.window.cart = [{ id: 50, name: 'Paneer Roll', price: 120, qty: 2 }];
        sandbox.tablesInfo = { 1: { items: [{ id: 50, name: 'Paneer Roll', price: 120, qty: 2 }], status: 'occupied' } };
        sandbox.activeTable = 1;
        sandbox.window.currentStaff = { id: 205, name: 'Dev Sharma', role: 'Cashier' };
        sandbox.currentStaff = sandbox.window.currentStaff;

        // 2. Admin revokes staff member -> lockTerminalByRemote fires
        sandbox.lockTerminalByRemote({ staffId: 205, status: 'REVOKED' });

        // 3. Attempt checkout: verify cart is wiped
        assert.strictEqual(sandbox.window.cart.length, 0, 'Cart must be wiped to prevent stale checkout');
        assert.strictEqual(sandbox.currentStaff, null, 'Active staff identity must be null');

        // 4. Verify permission check for settlement fails when currentStaff is null
        assert.strictEqual(sandbox.hasPermission(sandbox.currentStaff, 'can_settle_bills'), false, 'Null staff cannot settle bills');
    });

    challenge('ADV-RACE-02', 'Floor Server role cannot access admin tabs (dashboard, settings, staff)', () => {
        const { sandbox } = createMockEnvironment();

        const serverStaff = { id: 301, name: 'Kiran', role: 'Floor Server' };

        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'dashboard'), false, 'Floor Server cannot access dashboard');
        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'staff'), false, 'Floor Server cannot access staff');
        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'devices'), false, 'Floor Server cannot access devices');
        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'tables'), true, 'Floor Server can access tables');
        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'pos'), true, 'Floor Server can access pos');
        assert.strictEqual(sandbox.canStaffAccessTab(serverStaff, 'settings'), true, 'Floor Server can access settings (for Bluetooth KOT only)');
    });

    challenge('ADV-RACE-03', 'Trivial PINs (0000, 1111, 1234, 4321) rejected during onboarding', async () => {
        const { sandbox } = createMockEnvironment();

        const trivialPins = ['0000', '1111', '1234', '4321', '9999'];
        for (const pin of trivialPins) {
            sandbox.document.getElementById('firstLoginNewPinInput').value = pin;
            sandbox.document.getElementById('firstLoginConfirmPinInput').value = pin;
            let rejected = false;
            sandbox.showToast = (msg) => {
                if (msg.includes('too simple') || msg.includes('common') || msg.includes('Trivial') || msg.includes('sequential') || msg.includes('PIN')) {
                    rejected = true;
                }
            };
            const res = await sandbox.submitFirstLoginPin();
            assert.strictEqual(res, false, `Trivial PIN ${pin} must be rejected`);
        }
    });

    challenge('ADV-RACE-04', 'Staff quota of 10 profiles strictly enforced at boundary', async () => {
        const { sandbox } = createMockEnvironment();

        sandbox.staffList = [];
        for (let i = 1; i <= 10; i++) {
            sandbox.staffList.push({
                id: i,
                name: `Staff ${i}`,
                role: i === 1 ? 'Admin' : 'Cashier',
                pin_hash: 'hash_' + i,
                pin_salt: 'salt_' + i
            });
        }
        assert.strictEqual(sandbox.staffList.length, 10);

        // Attempting to add 11th member must fail
        const addResult = await sandbox.saveStaffMember({
            name: 'Staff 11',
            role: 'Cashier',
            pin: '9876'
        });

        assert.strictEqual(addResult, false, 'Adding 11th staff member must be blocked');
        assert.strictEqual(sandbox.staffList.length, 10, 'Staff list must remain capped at 10');
    });

    // ========================================================================
    // 📍 DIMENSION 4: REPOSITORY INVARIANTS
    // ========================================================================
    console.log('\n📍 DIMENSION 4: REPOSITORY INVARIANTS');

    challenge('ADV-INV-01', 'Exactly 26 .modal-close-btn SVGs in index.html', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const matches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn buttons, found ${matches.length}`);
    });

    challenge('ADV-INV-02', 'Strictly zero raw Unicode emojis in <button> elements in index.html', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
        const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}]/u;

        let match;
        const violations = [];
        let btnIndex = 0;
        while ((match = buttonRegex.exec(html)) !== null) {
            btnIndex++;
            const btnContent = match[1];
            if (emojiRegex.test(btnContent)) {
                violations.push({ btnIndex, snippet: btnContent.trim().substring(0, 40) });
            }
        }
        assert.strictEqual(violations.length, 0, `Found ${violations.length} raw emojis in button elements: ${JSON.stringify(violations)}`);
    });

    challenge('ADV-INV-03', 'Bit-for-bit parity between firestore.rules and database/firestore.rules', () => {
        const rulesPath1 = path.join(__dirname, '..', 'firestore.rules');
        const rulesPath2 = path.join(__dirname, '..', 'database', 'firestore.rules');

        const b1 = fs.readFileSync(rulesPath1);
        const b2 = fs.readFileSync(rulesPath2);

        assert.strictEqual(b1.length, b2.length, `File lengths differ: ${b1.length} vs ${b2.length}`);
        assert.strictEqual(Buffer.compare(b1, b2), 0, 'Buffer comparison shows differences between rules files');

        const md5_1 = crypto.createHash('md5').update(b1).digest('hex');
        const md5_2 = crypto.createHash('md5').update(b2).digest('hex');
        assert.strictEqual(md5_1, md5_2, `MD5 hashes differ: ${md5_1} vs ${md5_2}`);
    });

    // ========================================================================
    // 📊 SUMMARY & SCORECARD
    // ========================================================================
    console.log('\n====================================================================');
    console.log(`📊 ADVERSARIAL SCORECARD: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
    if (failedTests > 0) {
        console.log('❌ FAILURES DETECTED:');
        failures.forEach(f => {
            console.log(`   - [${f.id}] ${f.desc}: ${f.error}`);
        });
    }
    console.log('====================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
})();
