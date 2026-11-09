/**
 * E2E Verification Suite:
 * 1. Random PIN / Temporary OTP creation with selective role (Cashier, Manager, Floor Server, Kitchen Chef, Admin)
 *    and multi-tier DB persistence (localStorage, IndexedDB, Firestore root doc /shops/{shopId}.staff AND subcollection /shops/{shopId}/staff/{id}).
 * 2. First-login PIN creation by staff (#firstLoginPinModal -> submitFirstLoginPin) preserving selective role and stationProfile,
 *    consuming initialOtp, setting mustChangePin: false, and syncing to both Firestore root doc and subcollection.
 * 3. Admin PIN reset via Edit Staff modal (random temporary OTP re-arms mustChangePin: true for staff).
 * 4. Forgot PIN flow (/api/auth/admin-forgot-pin/send-otp & /reset + submitAdminForgotPinReset) for both Admin and selective staff roles
 *    saving updated salted SHA-256 PIN to backend auth_store, local DB, and Cloud Firestore with selective role preserved.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

async function runTests() {
    console.log('🧪 Starting PIN Creation, Staff Onboarding & Selective-Role Forgot-PIN DB Sync Verification...');

    // 1. Setup Mock DOM, LocalStorage, IndexedDB, and Cloud Firestore
    const storageMap = new Map();
    const idbMap = new Map();
    const firestoreRootDocs = new Map();
    const firestoreSubDocs = new Map(); // key: `${col}/${docId}/${subcol}/${subId}`

    const elements = new Map();
    function getOrCreateEl(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                value: '',
                innerText: '',
                textContent: '',
                innerHTML: '',
                className: '',
                disabled: false,
                style: { display: 'none', opacity: '1' },
                classList: {
                    _set: new Set(),
                    add(c) { this._set.add(c); },
                    remove(c) { this._set.delete(c); },
                    contains(c) { return this._set.has(c); }
                },
                focus() {},
                querySelector() { return null; },
                querySelectorAll() { return []; }
            });
        }
        return elements.get(id);
    }

    const toasts = [];
    const sandbox = {
        console,
        setTimeout: (fn) => { fn(); return 1; },
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        Date,
        Math,
        JSON,
        String,
        Number,
        Boolean,
        Array,
        Object,
        RegExp,
        Map,
        Set,
        Promise,
        Error,
        TextEncoder,
        Uint8Array,
        crypto: crypto.webcrypto,
        localStorage: {
            getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
            setItem: (k, v) => storageMap.set(k, String(v)),
            removeItem: (k) => storageMap.delete(k)
        },
        idb: {
            get: async (k) => idbMap.get(k),
            set: async (k, v) => { idbMap.set(k, JSON.parse(JSON.stringify(v))); return true; }
        },
        document: {
            getElementById: (id) => getOrCreateEl(id),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            visibilityState: 'visible'
        },
        navigator: {
            userAgent: 'Mozilla/5.0 NodeTest',
            platform: 'Win32'
        },
        CustomEvent: class CustomEvent {
            constructor(name, opts) { this.type = name; this.detail = opts?.detail; }
        },
        showToast: (msg, type) => { toasts.push({ msg, type }); },
        saveToLocal: () => {},
        persistProfile: () => {
            storageMap.set('billnaw_store_profile', JSON.stringify(sandbox.shopProfile));
        },
        getLocalISODate: () => '2026-11-08',
        hashString: (str) => {
            if (!str) return '';
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                let char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
        },
        escapeHtml: (s) => String(s || ''),
        switchView: () => {},
        switchTab: () => {},
        updateProfileVisuals: () => {},
        applyStationProfileRestrictions: () => {},
        staffList: [
            { id: 1, name: 'Store Owner', role: 'Admin', stationProfile: 'ADMIN_MASTER', status: 'Active' }
        ],
        shopProfile: {
            storeCode: 'SHOP-PIN-TEST-01',
            name: 'Pin Test Cafe',
            ownerEmail: 'owner_selftest@billnawcafe.com',
            adminPinHash: ''
        },
        currentStaff: { id: 1, name: 'Store Owner', role: 'Admin' },
        currentRole: 'admin',
        selectedLoginStaffId: 1,
        myClientID: 'SHOP-PIN-TEST-01'
    };

    // Mock Firestore bindings in sandbox
    sandbox.firestoreDB = { name: 'mock-firestore' };
    sandbox.firestoreDoc = (db, col, docId, subcol, subId) => {
        if (subcol && subId) {
            return { type: 'subdoc', path: `${col}/${docId}/${subcol}/${subId}`, col, docId, subcol, subId };
        }
        return { type: 'rootdoc', path: `${col}/${docId}`, col, docId };
    };
    sandbox.firestoreSetDoc = async (ref, data, opts) => {
        const clone = JSON.parse(JSON.stringify(data));
        if (ref.type === 'rootdoc') {
            const prev = firestoreRootDocs.get(ref.path) || {};
            firestoreRootDocs.set(ref.path, opts?.merge ? { ...prev, ...clone } : clone);
        } else if (ref.type === 'subdoc') {
            const prev = firestoreSubDocs.get(ref.path) || {};
            firestoreSubDocs.set(ref.path, opts?.merge ? { ...prev, ...clone } : clone);
        }
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    // Load core.js helpers (getActiveStoreIdentifier, getStoreCollectionName, getStoreDocRef, getStoreSubdocRef, syncStaffRecordToCloud, persistStaffToFirestore)
    sandbox.getActiveStoreIdentifier = () => sandbox.shopProfile.storeCode || 'SHOP-PIN-TEST-01';
    sandbox.getStoreCollectionName = () => 'shops';
    sandbox.getStoreDocRef = () => sandbox.firestoreDoc(sandbox.firestoreDB, 'shops', sandbox.getActiveStoreIdentifier());
    sandbox.getStoreSubdocRef = (subcol, id) => sandbox.firestoreDoc(sandbox.firestoreDB, 'shops', sandbox.getActiveStoreIdentifier(), subcol, String(id));
    sandbox.syncStaffRecordToCloud = async (staffRecord) => {
        if (!staffRecord || !staffRecord.id) return;
        await sandbox.idb.set('cafe_staff', sandbox.staffList);
        const subRef = sandbox.getStoreSubdocRef('staff', String(staffRecord.id));
        await sandbox.firestoreSetDoc(subRef, { ...staffRecord, updatedAt: new Date().toISOString() }, { merge: true });
    };
    sandbox.persistStaffToFirestore = (newStaff = null) => {
        sandbox.idb.set('cafe_staff', sandbox.staffList);
        sandbox.localStorage.setItem('billnaw_store_staff', JSON.stringify(sandbox.staffList));
        const storeDocRef = sandbox.getStoreDocRef();
        sandbox.firestoreSetDoc(storeDocRef, { staff: sandbox.staffList, updatedAt: new Date().toISOString() }, { merge: true });
        if (newStaff && (newStaff.id || newStaff.staffId)) {
            sandbox.syncStaffRecordToCloud(newStaff);
        } else if (Array.isArray(sandbox.staffList)) {
            sandbox.staffList.forEach(s => {
                if (s && s.id) sandbox.syncStaffRecordToCloud(s);
            });
        }
    };

    // Execute js/staff.js in sandbox
    const staffJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(staffJsCode, sandbox);

    // Initialize Admin PIN to 8520
    await sandbox.saveStaffMember({ id: 1, name: 'Store Owner', role: 'Admin', pin: '8520', mustChangePin: false });

    // =========================================================================
    // TEST 1: Create 4 Selective-Role Staff Profiles with Random PINs
    // =========================================================================
    console.log('  ➜ Test 1: Random PIN creation across selective roles (Cashier, Manager, Floor Server, Kitchen Chef)...');
    const rolesToTest = [
        { name: 'Priya Das', role: 'Cashier', expectedStation: 'BILLING_COUNTER' },
        { name: 'Arjun Roy', role: 'Manager', expectedStation: 'BILLING_COUNTER' },
        { name: 'Rahul Sen', role: 'Floor Server', expectedStation: 'WAITER_MOBILE' },
        { name: 'Chef Kabir', role: 'Kitchen Chef', expectedStation: 'KDS' }
    ];

    const assignedRandomPins = new Map();

    for (const spec of rolesToTest) {
        sandbox.openAddStaffModal();
        const randomPin = getOrCreateEl('staffPinInput').value;
        assert.match(randomPin, /^\d{4}$/, `Random PIN "${randomPin}" should be 4 digits`);
        assert.ok(!/^(\d)\1{3}$/.test(randomPin) && randomPin !== '1234' && randomPin !== '4321', `Random PIN "${randomPin}" must be non-trivial`);

        getOrCreateEl('staffNameInput').value = spec.name;
        getOrCreateEl('staffRoleInput').value = spec.role;
        getOrCreateEl('staffPhoneInput').value = '9830011223';

        const ok = await sandbox.saveStaffMember();
        assert.strictEqual(ok, true, `saveStaffMember should succeed for ${spec.name} (${spec.role})`);

        const created = sandbox.staffList.find(s => s.name === spec.name);
        assert.ok(created, `Staff ${spec.name} should be in staffList`);
        assert.strictEqual(created.role, spec.role, `Selective role must be ${spec.role}`);
        assert.strictEqual(created.stationProfile, spec.expectedStation, `Station profile for ${spec.role} must be ${spec.expectedStation}`);
        assert.strictEqual(created.mustChangePin, true, `New staff ${spec.name} must have mustChangePin=true`);
        assert.strictEqual(created.otpConsumed, false, `New staff ${spec.name} must have otpConsumed=false`);
        assert.strictEqual(created.initialOtp, randomPin, `initialOtp should store temporary random PIN`);
        assert.strictEqual(created.pin, undefined, `Plaintext pin field must be deleted`);
        assert.ok(created.pin_salt && created.pin_hash, `Salted SHA-256 credentials must be generated`);

        // Verify Firestore root doc AND subcollection doc
        const rootDoc = firestoreRootDocs.get('shops/SHOP-PIN-TEST-01');
        assert.ok(rootDoc && Array.isArray(rootDoc.staff), 'Root Firestore doc should contain staff array');
        const rootStaff = rootDoc.staff.find(s => String(s.id) === String(created.id));
        assert.ok(rootStaff, `Root Firestore staff array should contain ${spec.name}`);
        assert.strictEqual(rootStaff.role, spec.role);

        const subDoc = firestoreSubDocs.get(`shops/SHOP-PIN-TEST-01/staff/${created.id}`);
        assert.ok(subDoc, `Firestore subcollection /shops/SHOP-PIN-TEST-01/staff/${created.id} must be written`);
        assert.strictEqual(subDoc.role, spec.role, `Subcollection doc role must match ${spec.role}`);
        assert.strictEqual(subDoc.stationProfile, spec.expectedStation);
        assert.strictEqual(subDoc.mustChangePin, true);

        assignedRandomPins.set(created.id, { randomPin, spec });
    }
    console.log('    ✅ All 4 selective roles created with random PINs and synced to LocalStorage, IDB, Root Firestore & Subcollection.');

    // =========================================================================
    // TEST 2: First-Login PIN Creation by Staff for Every Selective Role
    // =========================================================================
    console.log('  ➜ Test 2: First-login temporary PIN intercept -> staff creates private PIN -> selective role & DB sync verified...');
    const newPrivatePins = ['2580', '3691', '4702', '5813'];
    let pinIdx = 0;

    for (const [staffId, { randomPin, spec }] of assignedRandomPins.entries()) {
        const privatePin = newPrivatePins[pinIdx++];

        // Lock terminal & enter random temporary PIN
        sandbox.lockTerminal(false);
        sandbox.selectLoginStaff(staffId);
        getOrCreateEl('staffLoginPinInput').value = randomPin;
        await sandbox.confirmStaffLogin();

        // Verify #firstLoginPinModal intercepted login
        assert.strictEqual(getOrCreateEl('firstLoginPinModal').style.display, 'flex', `First login modal must open for ${spec.name}`);
        assert.strictEqual(getOrCreateEl('firstLoginStaffName').textContent, spec.name);
        assert.strictEqual(getOrCreateEl('firstLoginStaffRole').textContent, spec.role);

        // Staff enters new private 4-digit PIN
        getOrCreateEl('firstLoginNewPin').value = privatePin;
        getOrCreateEl('firstLoginConfirmPin').value = privatePin;
        await sandbox.submitFirstLoginPin();

        // Verify modal closed and terminal unlocked with selective role
        assert.strictEqual(getOrCreateEl('firstLoginPinModal').style.display, 'none', 'First login modal should close after submit');
        assert.strictEqual(sandbox.isTerminalLocked, false, 'Terminal should be unlocked');
        assert.strictEqual(String(sandbox.currentStaff.id), String(staffId));
        assert.strictEqual(sandbox.currentStaff.role, spec.role, `Active staff role after first-login PIN creation must be ${spec.role}`);

        // Verify updated staff record in staffList, root Firestore, and subcollection Firestore
        const updatedStaff = sandbox.staffList.find(s => String(s.id) === String(staffId));
        assert.strictEqual(updatedStaff.mustChangePin, false, 'mustChangePin must be false after private PIN creation');
        assert.strictEqual(updatedStaff.otpConsumed, true, 'otpConsumed must be true');
        assert.strictEqual(updatedStaff.initialOtp, undefined, 'initialOtp must be cleared');
        assert.strictEqual(updatedStaff.role, spec.role, 'Role must remain strictly intact');
        assert.strictEqual(updatedStaff.stationProfile, spec.expectedStation, 'stationProfile must remain strictly intact');

        // Verify old random PIN no longer works and new private PIN works
        const oldPinValid = await sandbox.verifyStaffPin(updatedStaff, randomPin);
        const newPinValid = await sandbox.verifyStaffPin(updatedStaff, privatePin);
        assert.strictEqual(oldPinValid, false, 'Old temporary random PIN must be invalidated');
        assert.strictEqual(newPinValid, true, 'New private PIN must verify accurately');

        // Verify both Firestore tiers updated
        const rootStaff = firestoreRootDocs.get('shops/SHOP-PIN-TEST-01').staff.find(s => String(s.id) === String(staffId));
        const subStaff = firestoreSubDocs.get(`shops/SHOP-PIN-TEST-01/staff/${staffId}`);
        assert.strictEqual(rootStaff.mustChangePin, false, 'Root Firestore staff must have mustChangePin=false');
        assert.strictEqual(rootStaff.pin_hash, updatedStaff.pin_hash, 'Root Firestore pin_hash must match');
        assert.strictEqual(subStaff.mustChangePin, false, 'Subcollection Firestore staff must have mustChangePin=false');
        assert.strictEqual(subStaff.pin_hash, updatedStaff.pin_hash, 'Subcollection Firestore pin_hash must match');
        assert.strictEqual(subStaff.role, spec.role, 'Subcollection Firestore role must match selective role');
    }
    console.log('    ✅ First-login private PIN creation verified across all selective roles with dual Firestore sync.');

    // =========================================================================
    // TEST 3: Admin Re-Assigns Random Temporary PIN in Edit Staff Modal
    // =========================================================================
    console.log('  ➜ Test 3: Admin resets a staff member PIN via Edit Staff modal -> re-arms mustChangePin=true...');
    const waiterStaff = sandbox.staffList.find(s => s.role === 'Floor Server');
    sandbox.openEditStaffModal(waiterStaff.id);
    const resetTempPin = sandbox.generateSecureUniqueStaffPin();
    getOrCreateEl('staffPinInput').value = resetTempPin;
    await sandbox.saveStaffMember();

    const editedWaiter = sandbox.staffList.find(s => String(s.id) === String(waiterStaff.id));
    assert.strictEqual(editedWaiter.role, 'Floor Server', 'Edited staff role must remain Floor Server');
    assert.strictEqual(editedWaiter.mustChangePin, true, 'Re-assigning temporary PIN to staff in Edit modal must re-arm mustChangePin=true');
    assert.strictEqual(editedWaiter.otpConsumed, false, 'otpConsumed must be reset to false');
    assert.strictEqual(editedWaiter.initialOtp, resetTempPin);
    console.log('    ✅ Edit Staff PIN reset properly re-arms first-login private PIN creation.');

    // =========================================================================
    // TEST 4: Forgot PIN Flow with Backend Auth Service & Selective Role DB Sync
    // =========================================================================
    console.log('  ➜ Test 4: Forgot PIN OTP & Reset for Selective Role (Floor Server) AND Master Admin...');
    const authService = await import('../server/auth-service.js');

    // Hook sandbox.fetch to route /api/auth/admin-forgot-pin/* to real authService functions
    sandbox.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body || '{}');
        if (url === '/api/auth/admin-forgot-pin/send-otp') {
            const res = authService.requestAdminPinResetOtp(body.email, body.storeCode);
            return { json: async () => res.data };
        }
        if (url === '/api/auth/admin-forgot-pin/reset') {
            const res = authService.resetAdminPinWithOtp(
                body.email,
                body.otp,
                body.newPin,
                body.storeCode,
                body.staffId,
                body.staffName,
                body.role
            );
            return { json: async () => res.data };
        }
        throw new Error('Unexpected URL: ' + url);
    };

    // 4A. Reset PIN for Floor Server (Rahul Sen) via Forgot PIN Modal
    sandbox.openAdminForgotPinModal(waiterStaff.id);
    const selectEl = getOrCreateEl('forgotPinStaffSelect');
    assert.ok(selectEl.innerHTML.includes('Rahul Sen (Floor Server)'), 'Forgot PIN selector must list Rahul Sen (Floor Server)');
    selectEl.value = String(waiterStaff.id);

    getOrCreateEl('forgotPinEmailInput').value = 'owner_selftest@billnawcafe.com';
    await sandbox.submitAdminForgotPinOtpRequest();

    const otpCode1 = getOrCreateEl('forgotPinOtpInput').value;
    assert.match(otpCode1, /^\d{6}$/, '6-digit devOtp should be populated');

    getOrCreateEl('forgotPinNewPinInput').value = '7391';
    getOrCreateEl('forgotPinConfirmPinInput').value = '7391';
    await sandbox.submitAdminForgotPinReset();

    const waiterAfterForgot = sandbox.staffList.find(s => String(s.id) === String(waiterStaff.id));
    assert.strictEqual(waiterAfterForgot.role, 'Floor Server', 'Selective role Floor Server must be preserved after Forgot PIN reset');
    assert.strictEqual(waiterAfterForgot.stationProfile, 'WAITER_MOBILE', 'stationProfile WAITER_MOBILE must be preserved');
    assert.strictEqual(waiterAfterForgot.mustChangePin, false, 'mustChangePin should be false after direct Forgot PIN reset');
    assert.strictEqual(await sandbox.verifyStaffPin(waiterAfterForgot, '7391'), true, 'New PIN 7391 must verify for Floor Server');
    assert.strictEqual(sandbox.currentStaff.role, 'Floor Server', 'Terminal should unlock directly with Floor Server role');

    const waiterSubDoc = firestoreSubDocs.get(`shops/SHOP-PIN-TEST-01/staff/${waiterStaff.id}`);
    assert.strictEqual(waiterSubDoc.role, 'Floor Server');
    assert.strictEqual(waiterSubDoc.pin_hash, waiterAfterForgot.pin_hash);

    // 4B. Reset PIN for Master Admin via Forgot PIN Modal
    // Clear OTP cooldown by using a second test owner email
    sandbox.openAdminForgotPinModal(1);
    selectEl.value = '1';
    getOrCreateEl('forgotPinEmailInput').value = 'admin_selftest@billnawcafe.com';
    await sandbox.submitAdminForgotPinOtpRequest();

    const otpCode2 = getOrCreateEl('forgotPinOtpInput').value;
    assert.match(otpCode2, /^\d{6}$/, '6-digit devOtp should be populated for Admin');

    getOrCreateEl('forgotPinNewPinInput').value = '9462';
    getOrCreateEl('forgotPinConfirmPinInput').value = '9462';
    await sandbox.submitAdminForgotPinReset();

    const adminAfterForgot = sandbox.staffList.find(s => String(s.id) === '1');
    assert.strictEqual(adminAfterForgot.role, 'Admin', 'Admin role must be preserved');
    assert.strictEqual(await sandbox.verifyAdminPin('9462'), true, 'verifyAdminPin must accept new Admin PIN 9462');
    assert.strictEqual(await sandbox.verifyStaffPin(adminAfterForgot, '9462'), true, 'verifyStaffPin must accept new Admin PIN 9462');
    assert.strictEqual(sandbox.currentStaff.role, 'Admin', 'Terminal should unlock as Admin');

    console.log('    ✅ Forgot PIN flow verified for both selective staff role (Floor Server) and Master Admin!');
    console.log('\n🎉 ALL PIN CREATION, FIRST-LOGIN ONBOARDING & SELECTIVE-ROLE FORGOT-PIN DB SYNC TESTS PASSED!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
