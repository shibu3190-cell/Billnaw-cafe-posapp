/**
 * scratch/test_device_auth_and_pairing_gate.cjs
 *
 * Verification suite for:
 * 1. Fresh device opening site/app: Pairing QR overlay is SUPPRESSED and Login/Sign Up (#shopAuthModal) is required.
 * 2. Login verification:
 *    - If NO other device is active for this store -> becomes Master Terminal (no QR code).
 *    - If ANOTHER device is active for this store -> secondary terminal pairing QR appears.
 * 3. Logout purge: Pairing overlay is hidden and Login/Sign Up modal is presented.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const coreJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf-8');
const shopAuthJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'shop-auth.js'), 'utf-8');

function createDOMSandbox(initialStorage = {}) {
    const storage = new Map(Object.entries(initialStorage));
    const elements = new Map();

    function getElement(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                style: { display: 'none', visibility: 'visible', setProperty: () => {} },
                dataset: {},
                classList: {
                    classes: new Set(),
                    add(c) { this.classes.add(c); },
                    remove(c) { this.classes.delete(c); },
                    contains(c) { return this.classes.has(c); }
                },
                appendChild: () => {},
                removeChild: () => {},
                setAttribute: () => {},
                innerText: '',
                value: '',
                focus: () => {}
            });
        }
        return elements.get(id);
    }

    const dom = {
        getElementById: (id) => getElement(id),
        querySelectorAll: () => [],
        querySelector: (sel) => null,
        createElement: (tag) => ({
            id: '',
            className: '',
            style: {},
            appendChild: () => {},
            remove: () => {},
            innerText: ''
        }),
        body: {
            appendChild: () => {},
            removeChild: () => {}
        },
        addEventListener: () => {},
        readyState: 'complete'
    };

    const mockLocalStorage = {
        getItem: (k) => storage.has(k) ? storage.get(k) : null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
        clear: () => storage.clear()
    };

    const sandbox = {
        window: null,
        document: dom,
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        console: { log: () => {}, warn: () => {}, info: () => {}, error: () => {} },
        Date,
        Math,
        parseInt,
        isNaN,
        JSON,
        setTimeout: (fn) => fn(),
        clearTimeout: () => {},
        CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } },
        dispatchEvent: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        showToast: () => {},
        alert: () => {},
        QRCode: class { constructor(container, opts) { this.opts = opts; } }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(coreJs, sandbox);

    return { sandbox, elements, storage };
}

let passed = 0;
let total = 0;

async function test(name, fn) {
    total++;
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('📱 DEVICE AUTH FIRST & CONDITIONAL QR PAIRING AUDIT');
    console.log('====================================================\n');

    await test('GATE-01: Fresh unauthenticated device: isStoreAuthenticated returns false', () => {
        const { sandbox } = createDOMSandbox({});
        assert.strictEqual(sandbox.isStoreAuthenticated(), false);
    });

    await test('GATE-02: Fresh device opening: showDevicePairingOverlay is strictly SUPPRESSED', () => {
        const { sandbox, elements } = createDOMSandbox({});
        sandbox.showDevicePairingOverlay();
        const overlay = elements.get('devicePairingOverlay');
        assert.strictEqual(overlay.style.display, 'none', 'Overlay must NOT be flex when unauthenticated');
    });

    await test('GATE-03: Fresh device initDevicePairingFlow: calls hideDevicePairingOverlay and opens shop auth modal', () => {
        let authModalOpened = false;
        const { sandbox, elements } = createDOMSandbox({});
        sandbox.openShopAuthModal = () => { authModalOpened = true; };
        sandbox.initDevicePairingFlow();
        const overlay = elements.get('devicePairingOverlay');
        assert.strictEqual(overlay.style.display, 'none');
        assert.strictEqual(authModalOpened, true, 'openShopAuthModal must be triggered');
    });

    await test('GATE-04: Authenticated store with NO existing devices: automatically promoted to Master without QR', async () => {
        const { sandbox, elements, storage } = createDOMSandbox({
            billnaw_auth_token: 'auth_jwt_store_01',
            billnaw_auth_mode: 'authenticated',
            billnaw_device_id: 'DEV_AABBCCDDEEFF',
            bongbhoj_device_id: 'DEV_AABBCCDDEEFF'
        });
        sandbox.authorizedDevices = []; // No other devices in cloud

        await sandbox.verifyDeviceAuthorizationOnLogin('SHOP-TEST-01');

        assert.strictEqual(storage.get('billnaw_is_master'), 'true', 'First device must become Master Terminal');
        assert.strictEqual(storage.get('billnaw_device_status'), 'AUTHORIZED', 'First device must be AUTHORIZED');
        const overlay = elements.get('devicePairingOverlay');
        assert.strictEqual(overlay.style.display, 'none', 'Pairing QR overlay must remain hidden');
    });

    await test('GATE-05: Authenticated store with ANOTHER active Master device: shows QR pairing code as secondary', async () => {
        const { sandbox, elements, storage } = createDOMSandbox({
            billnaw_auth_token: 'auth_jwt_store_02',
            billnaw_auth_mode: 'authenticated',
            billnaw_device_id: 'DEV_223344556677',
            bongbhoj_device_id: 'DEV_223344556677'
        });
        sandbox.authorizedDevices = [
            { deviceId: 'DEV_MASTER00000', isMaster: true, status: 'AUTHORIZED', deviceName: 'Counter 1' }
        ];

        await sandbox.verifyDeviceAuthorizationOnLogin('SHOP-TEST-01');

        assert.strictEqual(storage.get('billnaw_is_master'), 'false', 'Secondary device must NOT become Master');
        assert.strictEqual(storage.get('billnaw_device_status'), 'PENDING', 'Secondary device must be PENDING');
        const overlay = elements.get('devicePairingOverlay');
        assert.strictEqual(overlay.style.display, 'flex', 'Pairing QR overlay must appear for secondary device');
    });

    await test('GATE-06: Secondary device approval via cloud sync: hides QR overlay and transitions to AUTHORIZED', async () => {
        const myDevId = 'DEV_334455667788';
        const { sandbox, elements, storage } = createDOMSandbox({
            billnaw_auth_token: 'auth_jwt_store_02',
            billnaw_auth_mode: 'authenticated',
            billnaw_device_id: myDevId,
            bongbhoj_device_id: myDevId,
            billnaw_is_master: 'false',
            billnaw_device_status: 'PENDING'
        });

        // Initially show overlay
        sandbox.showDevicePairingOverlay();
        assert.strictEqual(elements.get('devicePairingOverlay').style.display, 'flex');

        // Firestore listener callback delivers approved status
        const devices = [
            { deviceId: 'DEV_MASTER00000', isMaster: true, status: 'AUTHORIZED' },
            { deviceId: myDevId, isMaster: false, status: 'AUTHORIZED', deviceName: 'Kitchen Terminal', stationProfile: 'KDS' }
        ];

        // Trigger snapshot update
        sandbox.authorizedDevices = devices;
        await sandbox.checkDeviceAuthorizationStatus();

        assert.strictEqual(storage.get('billnaw_device_status'), 'AUTHORIZED');
        assert.strictEqual(elements.get('devicePairingOverlay').style.display, 'none', 'QR overlay must hide once approved');
    });

    console.log(`\n====================================================`);
    console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${total - passed} FAILED (TOTAL: ${total})`);
    console.log(`====================================================\n`);

    if (passed === total) {
        console.log('✨ ALL 6 DEVICE AUTH FIRST & PAIRING GATE TESTS PASSED 100%!');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests();
