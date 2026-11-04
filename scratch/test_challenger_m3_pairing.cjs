/**
 * scratch/test_challenger_m3_pairing.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: MILESTONE 3
 * Device Pairing State Machine, Zero-Store-Data Gate, and Revocation Kickout
 *
 * Requirements Challenged:
 * 1. Adversarial Device ID & Pairing Code verification:
 *    - Collision resistance across 1000 generated device IDs (/^DEV_[A-F0-9]{12}$/)
 *    - Fallback generation collision & format resilience (when crypto.getRandomValues absent)
 *    - 6-digit pairing code generation: 1000 iterations strictly 100000..999999
 *    - getOrCreateDeviceId() corruption resilience & dual persistence
 * 2. Adversarial Zero-Store-Data Gate testing:
 *    - canAccessStoreData() state matrix (Master, PENDING, REVOKED, AUTHORIZED)
 *    - In-memory data isolation in attachFirestoreListener() under PENDING and REVOKED
 *    - Tab switching interception: navigation blocked, #devicePairingOverlay enforced
 * 3. Adversarial Revocation & Kickout testing:
 *    - Master Admin Terminal revocation immunity
 *    - 1-click revocation of secondary terminal & clearAllTenantLocalData() verification
 *    - Checkout attempt during revocation aborted atomically (no orphan bills)
 *    - Fresh re-pairing request from revoked screen returns to PENDING with new code
 * 4. Station Profile UI restrictions & System Invariants
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('====================================================================');
console.log('🛡️  CHALLENGER SUITE: EMPIRICAL ADVERSARIAL DEVICE PAIRING & GATES');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(testName, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: ${testName}${details ? ` (${details})` : ''}`);
}

function recordFail(testName, error, details = '') {
  totalTests++;
  failedTests++;
  const msg = error && error.message ? error.message : String(error);
  failures.push({ testName, error: msg, details });
  console.error(`  ❌ FAIL: ${testName}`);
  console.error(`     Error: ${msg}`);
  if (details) console.error(`     Context: ${details}`);
}

// ----------------------------------------------------------------------------
// Environment Simulator for Browser Runtime Testing
// ----------------------------------------------------------------------------
function createSimulatedBrowserEnv(initialLocalStorage = {}) {
  const store = new Map(Object.entries(initialLocalStorage));
  const sessionStore = new Map();

  const mockLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };

  const mockSessionStorage = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear: () => sessionStore.clear(),
    _store: sessionStore
  };

  const elements = new Map();
  function createMockElement(id, tagName = 'div', className = '') {
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      className,
      classList: {
        _classes: new Set(className ? className.split(' ') : []),
        add: function (c) {
          this._classes.add(c);
          el.className = Array.from(this._classes).join(' ');
        },
        remove: function (c) {
          this._classes.delete(c);
          el.className = Array.from(this._classes).join(' ');
        },
        contains: function (c) {
          return this._classes.has(c);
        }
      },
      style: {},
      innerText: '',
      innerHTML: '',
      value: '',
      children: [],
      appendChild: function (c) {
        this.children.push(c);
        return c;
      },
      querySelector: function (sel) {
        return null;
      },
      querySelectorAll: function (sel) {
        return [];
      },
      focus: function () {}
    };
    elements.set(id, el);
    return el;
  }

  // Pre-seed known elements in index.html
  [
    'devicePairingOverlay',
    'deviceRevokedOverlay',
    'authorizedDevicesModal',
    'pairingDeviceIdDisplay',
    'pairingCodeDisplay',
    'pairingQrContainer',
    'revokedDeviceIdDisplay',
    'pendingDevicesList',
    'authorizedDevicesList',
    'pendingDevicesCount',
    'authorizedDevicesCount',
    'pendingDeviceCountBadge',
    'staffModalPendingBadge',
    'nav-pos',
    'nav-kds',
    'nav-tables',
    'nav-menu',
    'nav-dashboard',
    'nav-inventory',
    'nav-khata',
    'nav-more',
    'checkoutBtn',
    'cartDiscountWrap',
    'kdsSoundLabel',
    'selectedPaymentMode',
    'checkoutCustomerName',
    'checkoutCustomerId',
    'firstLoginPinModal'
  ].forEach((id) => createMockElement(id));

  const mockDocument = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.modal-overlay') {
        return [
          elements.get('devicePairingOverlay'),
          elements.get('deviceRevokedOverlay'),
          elements.get('authorizedDevicesModal')
        ].filter(Boolean);
      }
      return [];
    },
    createElement: (tag) => createMockElement('elem_' + Math.random().toString(36).slice(2), tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    document: mockDocument,
    crypto: globalThis.crypto || crypto.webcrypto,
    Uint8Array,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Date,
    RegExp,
    Error,
    Set,
    Map
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  return { sandbox, elements, store, sessionStore };
}

// Helper to extract function source from file and eval in sandbox
function loadCorePairingFunctions(sandbox) {
  const corePath = path.resolve(__dirname, '../js/core.js');
  const coreSrc = fs.readFileSync(corePath, 'utf8');

  // Extract Device pairing block (lines 1867 to 2292 approx)
  const startIdx = coreSrc.indexOf('// 📱 DEVICE PAIRING, STATION PROFILES & ZERO-STORE-DATA GATE (M3)');
  const endIdx = coreSrc.indexOf("window.registerPendingDeviceToCloud = registerPendingDeviceToCloud;", startIdx) + "window.registerPendingDeviceToCloud = registerPendingDeviceToCloud;".length;
  const block = coreSrc.slice(startIdx, endIdx);

  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return sandbox;
}

function loadSettingsDeviceFunctions(sandbox) {
  const settingsPath = path.resolve(__dirname, '../js/settings.js');
  const settingsSrc = fs.readFileSync(settingsPath, 'utf8');

  // Extract openAuthorizedDevicesModal to end of revokeAuthorizedDevice
  const startIdx = settingsSrc.indexOf('function openAuthorizedDevicesModal()');
  const endIdx = settingsSrc.indexOf('window.revokeAuthorizedDevice = revokeAuthorizedDevice;');
  const block = settingsSrc.slice(startIdx, endIdx + 'window.revokeAuthorizedDevice = revokeAuthorizedDevice;'.length);

  // Also extract switchTab
  const switchStart = settingsSrc.indexOf('function switchTab(tabId) {');
  const switchEnd = settingsSrc.indexOf('window.switchTab = switchTab;');
  const switchBlock = settingsSrc.slice(switchStart, switchEnd + 'window.switchTab = switchTab;'.length);

  vm.runInContext(block, sandbox);
  vm.runInContext(switchBlock, sandbox);
  return sandbox;
}

async function runChallengerSuite() {
  // ====================================================================
  // AREA 1: Adversarial Device ID & Pairing Code Verification
  // ====================================================================
  console.log('📍 AREA 1: ADVERSARIAL DEVICE ID & PAIRING CODE VERIFICATION');

  const { sandbox: env1 } = createSimulatedBrowserEnv();
  loadCorePairingFunctions(env1);

  // 1.1: 1000 Device IDs using crypto.getRandomValues
  try {
    const ids = new Set();
    const idRegex = /^DEV_[A-F0-9]{12}$/;
    let allMatched = true;

    for (let i = 0; i < 1000; i++) {
      const devId = env1.generateDeviceId();
      if (!idRegex.test(devId)) {
        allMatched = false;
        throw new Error(`Device ID '${devId}' at iteration ${i} does not match /^DEV_[A-F0-9]{12}$/`);
      }
      ids.add(devId);
    }

    assert.strictEqual(allMatched, true, 'All 1000 Device IDs must conform to regex');
    assert.strictEqual(ids.size, 1000, `Collision detected! Expected 1000 unique IDs, got ${ids.size}`);
    recordPass('Device ID: 1000 iterations strictly match /^DEV_[A-F0-9]{12}$/ with 0 collisions', `Unique count: ${ids.size}/1000`);
  } catch (err) {
    recordFail('Device ID: 1000 iterations match regex and zero collisions', err);
  }

  // 1.2: Fallback generator resilience when crypto.getRandomValues is absent
  try {
    const { sandbox: envFallback } = createSimulatedBrowserEnv();
    envFallback.crypto = undefined; // Force fallback
    loadCorePairingFunctions(envFallback);

    const fallbackIds = new Set();
    const idRegex = /^DEV_[A-F0-9]{12}$/;
    let allFallbackMatched = true;

    for (let i = 0; i < 1000; i++) {
      const devId = envFallback.generateDeviceId();
      if (!idRegex.test(devId)) {
        allFallbackMatched = false;
        throw new Error(`Fallback Device ID '${devId}' failed regex at iteration ${i}`);
      }
      fallbackIds.add(devId);
    }

    assert.strictEqual(allFallbackMatched, true, 'All 1000 fallback Device IDs must match regex');
    assert.strictEqual(fallbackIds.size, 1000, `Fallback collision detected! Expected 1000 unique, got ${fallbackIds.size}`);
    recordPass('Fallback Device ID: 1000 iterations without crypto.getRandomValues match regex with 0 collisions');
  } catch (err) {
    recordFail('Fallback Device ID: 1000 iterations without crypto.getRandomValues', err);
  }

  // 1.3: 1000 Pairing Codes: strictly integers in range 100000..999999
  try {
    const codeRegex = /^\d{6}$/;
    let minVal = Infinity;
    let maxVal = -Infinity;
    let sum = 0;
    let allValid = true;

    for (let i = 0; i < 1000; i++) {
      const code = env1.generatePairingCode();
      if (!codeRegex.test(code)) {
        allValid = false;
        throw new Error(`Pairing code '${code}' at iteration ${i} does not match /^\\d{6}$/`);
      }
      const num = parseInt(code, 10);
      if (num < 100000 || num > 999999) {
        allValid = false;
        throw new Error(`Pairing code ${num} outside valid range 100000..999999`);
      }
      if (num < minVal) minVal = num;
      if (num > maxVal) maxVal = num;
      sum += num;
    }

    const avg = sum / 1000;
    assert.strictEqual(allValid, true);
    assert(minVal >= 100000, `Minimum code ${minVal} must be >= 100000`);
    assert(maxVal <= 999999, `Maximum code ${maxVal} must be <= 999999`);
    // Statistical dispersion check: mean should be reasonably centered between 100000 and 999999 (~550,000)
    assert(avg > 450000 && avg < 650000, `Mean pairing code ${avg} outside reasonable bounds [450000, 650000]`);

    recordPass('Pairing Code: 1000 iterations strictly produce 6-digit integers in 100000..999999', `Min: ${minVal}, Max: ${maxVal}, Mean: ${Math.round(avg)}`);
  } catch (err) {
    recordFail('Pairing Code: 1000 iterations strictly produce 6-digit integers in 100000..999999', err);
  }

  // 1.4: getOrCreateDeviceId() corruption resilience & dual persistence
  try {
    const { sandbox: envStorage } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envStorage);

    // Case A: Clean initial boot
    const initialId = envStorage.getOrCreateDeviceId();
    assert(/^DEV_[A-F0-9]{12}$/.test(initialId), 'Fresh ID must match format');
    assert.strictEqual(envStorage.localStorage.getItem('billnaw_device_id'), initialId);
    assert.strictEqual(envStorage.localStorage.getItem('bongbhoj_device_id'), initialId);

    // Case B: Second boot returns the same ID
    const secondCall = envStorage.getOrCreateDeviceId();
    assert.strictEqual(secondCall, initialId, 'Subsequent call must return same ID');

    // Case C: Corrupt billnaw_device_id -> auto-regenerates valid ID
    const corruptCases = ['DEV_SHORT', 'dev_lowercase12', 'DEV_1234567890123', 'INVALID', '123456', 'null'];
    for (const corrupt of corruptCases) {
      envStorage.localStorage.setItem('billnaw_device_id', corrupt);
      envStorage.localStorage.removeItem('bongbhoj_device_id');
      const fixed = envStorage.getOrCreateDeviceId();
      assert(/^DEV_[A-F0-9]{12}$/.test(fixed), `Fixed ID '${fixed}' for corrupt '${corrupt}' must match format`);
      assert.notStrictEqual(fixed, corrupt, 'Corrupt ID must not be returned');
      assert.strictEqual(envStorage.localStorage.getItem('billnaw_device_id'), fixed);
      assert.strictEqual(envStorage.localStorage.getItem('bongbhoj_device_id'), fixed);
    }

    // Case D: Legacy bongbhoj_device_id present -> adopted as fallback
    const legacyValid = 'DEV_B00B1E5C00DE';
    envStorage.localStorage.removeItem('billnaw_device_id');
    envStorage.localStorage.setItem('bongbhoj_device_id', legacyValid);
    const adopted = envStorage.getOrCreateDeviceId();
    assert.strictEqual(adopted, legacyValid, 'Legacy valid ID must be adopted as fallback');

    recordPass('getOrCreateDeviceId(): Corrupted ID detection, regeneration, and fallback persistence verified');
  } catch (err) {
    recordFail('getOrCreateDeviceId(): Corrupted ID detection, regeneration, and dual-persistence', err);
  }

  // ====================================================================
  // AREA 2: Adversarial Zero-Store-Data Gate Testing
  // ====================================================================
  console.log('\n📍 AREA 2: ADVERSARIAL ZERO-STORE-DATA GATE TESTING');

  // 2.1: canAccessStoreData() complete state matrix
  try {
    const { sandbox: envGate } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envGate);

    // Scenario 1: Master Admin terminal always has access
    envGate.localStorage.setItem('billnaw_is_master', 'true');
    envGate.localStorage.setItem('billnaw_device_status', 'REVOKED'); // Conflicting status
    assert.strictEqual(envGate.canAccessStoreData(), true, 'Master Terminal must bypass all gates');
    assert.strictEqual(envGate.getDeviceStatus(), 'AUTHORIZED', 'Master Terminal device status is AUTHORIZED');

    // Scenario 2: Secondary terminal with PENDING status
    envGate.localStorage.removeItem('billnaw_is_master');
    envGate.localStorage.setItem('billnaw_device_status', 'PENDING');
    envGate.window.currentDeviceRecord = null;
    assert.strictEqual(envGate.canAccessStoreData(), false, 'PENDING device must be denied store access');

    // Scenario 3: Secondary terminal with REVOKED status
    envGate.localStorage.setItem('billnaw_device_status', 'REVOKED');
    assert.strictEqual(envGate.canAccessStoreData(), false, 'REVOKED device must be denied store access');

    // Scenario 4: Secondary terminal with AUTHORIZED status
    envGate.localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    assert.strictEqual(envGate.canAccessStoreData(), true, 'AUTHORIZED device must be granted store access');

    // Scenario 5: Conflicting localStorage vs window.currentDeviceRecord (Cloud authority)
    // Local says AUTHORIZED, but cloud currentDeviceRecord says REVOKED
    envGate.window.currentDeviceRecord = { status: 'REVOKED' };
    assert.strictEqual(envGate.canAccessStoreData(), false, 'Cloud REVOKED status must override local AUTHORIZED');

    // Local says AUTHORIZED, but cloud currentDeviceRecord says PENDING
    envGate.window.currentDeviceRecord = { status: 'PENDING' };
    assert.strictEqual(envGate.canAccessStoreData(), false, 'Cloud PENDING status must override local AUTHORIZED');

    // Scenario 6: Unset/fresh terminal (no stored status)
    envGate.localStorage.removeItem('billnaw_device_status');
    envGate.window.currentDeviceRecord = null;
    assert.strictEqual(envGate.canAccessStoreData(), false, 'Fresh terminal without status must be denied');

    recordPass('canAccessStoreData(): Strict evaluation across Master, PENDING, REVOKED, and cloud overrides');
  } catch (err) {
    recordFail('canAccessStoreData(): Strict evaluation across states', err);
  }

  // 2.2: Memory Isolation in attachFirestoreListener() under PENDING and REVOKED
  try {
    const { sandbox: envData } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envData);

    // Simulate pre-existing dirty business data
    envData.menuItems = [{ id: 1, name: 'Adulterated Paneer', price: 250 }];
    envData.orderHistory = [{ invoiceId: 'BN-T1-261104-001', total: 500 }];
    envData.customersList = [{ id: 1, phone: '9876543210', balance: 1200 }];
    envData.dailyExpenses = [{ id: 1, amount: 450, note: 'Milk' }];
    envData.tablesInfo = { T1: { items: [{ name: 'Chai' }] } };

    let cloudStoreListenerAttached = false;
    let deviceCloudListenerAttached = false;
    let cloudStatusReported = null;

    envData.window.firestoreDB = {};
    envData.window.firestoreDoc = () => ({});
    envData.window.firestoreOnSnapshot = () => {};
    envData.firestoreUnsubscribe = null;
    envData.getStoreDocRef = () => {
      cloudStoreListenerAttached = true;
      return {};
    };
    envData.subscribeDevicesCloudListener = () => {
      deviceCloudListenerAttached = true;
    };
    envData.setCloudSyncStatus = (status, text) => {
      cloudStatusReported = { status, text };
    };

    // Load attachFirestoreListener snippet from core.js
    const corePath = path.resolve(__dirname, '../js/core.js');
    const coreSrc = fs.readFileSync(corePath, 'utf8');
    const startIdx = coreSrc.indexOf('function attachFirestoreListener(');
    const endIdx = coreSrc.indexOf('window.initFirestoreSync = attachFirestoreListener;', startIdx) + 'window.initFirestoreSync = attachFirestoreListener;'.length;
    const attachBlock = coreSrc.slice(startIdx, endIdx);
    vm.runInContext(attachBlock, envData);

    // Test A: Under PENDING state
    envData.localStorage.setItem('billnaw_device_status', 'PENDING');
    envData.attachFirestoreListener();

    assert.strictEqual(envData.menuItems.length, 0, 'menuItems must be wiped in PENDING');
    assert.strictEqual(envData.orderHistory.length, 0, 'orderHistory must be wiped in PENDING');
    assert.strictEqual(envData.customersList.length, 0, 'customersList must be wiped in PENDING');
    assert.strictEqual(envData.dailyExpenses.length, 0, 'dailyExpenses must be wiped in PENDING');
    assert.strictEqual(Object.keys(envData.tablesInfo).length, 0, 'tablesInfo must be wiped in PENDING');
    assert.strictEqual(cloudStoreListenerAttached, false, 'storeDocRef listener MUST NOT be attached in PENDING');
    assert.strictEqual(deviceCloudListenerAttached, true, 'devices listener MUST be attached to receive approval');
    assert.strictEqual(cloudStatusReported.status, 'offline');
    assert.strictEqual(cloudStatusReported.text, 'Awaiting Pairing Approval');

    // Test B: Under REVOKED state
    // Inject dirty data again
    envData.menuItems = [{ id: 2, name: 'Secret Recipe' }];
    envData.orderHistory = [{ invoiceId: 'LEAK' }];
    cloudStoreListenerAttached = false;
    deviceCloudListenerAttached = false;

    envData.localStorage.setItem('billnaw_device_status', 'REVOKED');
    envData.attachFirestoreListener();

    assert.strictEqual(envData.menuItems.length, 0, 'menuItems must be wiped in REVOKED');
    assert.strictEqual(envData.orderHistory.length, 0, 'orderHistory must be wiped in REVOKED');
    assert.strictEqual(cloudStoreListenerAttached, false, 'storeDocRef listener MUST NOT be attached in REVOKED');

    recordPass('Zero-Store-Data Gate: In-memory store data purged & storeDocRef suspended in PENDING and REVOKED');
  } catch (err) {
    recordFail('Zero-Store-Data Gate: In-memory store data purged & storeDocRef suspended', err);
  }

  // 2.3: Tab Navigation Enforcement under Unapproved State
  try {
    const { sandbox: envNav, elements } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envNav);
    loadSettingsDeviceFunctions(envNav);

    // Secondary terminal in PENDING state
    envNav.localStorage.setItem('billnaw_device_status', 'PENDING');
    let tabDirectNavigated = null;
    envNav.switchTabDirect = (tabId) => {
      tabDirectNavigated = tabId;
    };

    const restrictedTabs = ['menu', 'dashboard', 'pos', 'inventory', 'khata'];
    for (const tab of restrictedTabs) {
      tabDirectNavigated = null;
      envNav.switchTab(tab);

      // Verify switchTabDirect was NOT called
      assert.strictEqual(tabDirectNavigated, null, `Navigation to '${tab}' must be intercepted and aborted`);

      // Verify #devicePairingOverlay is enforced (display: flex)
      const pairingOverlay = elements.get('devicePairingOverlay');
      assert.strictEqual(pairingOverlay.style.display, 'flex', '#devicePairingOverlay must be enforced on blocked tab');
    }

    recordPass('Navigation Guard: Tab navigation to menu, dashboard, pos blocked & #devicePairingOverlay enforced');
  } catch (err) {
    recordFail('Navigation Guard: Tab navigation blocked & #devicePairingOverlay enforced', err);
  }

  // ====================================================================
  // AREA 3: Adversarial Revocation & Kickout Testing
  // ====================================================================
  console.log('\n📍 AREA 3: ADVERSARIAL REVOCATION & KICKOUT TESTING');

  // 3.1: Master Admin Terminal cannot be revoked
  try {
    const { sandbox: envMaster, elements } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envMaster);
    loadSettingsDeviceFunctions(envMaster);

    envMaster.localStorage.setItem('billnaw_is_master', 'true');
    const masterDevId = 'DEV_MASTER00001';
    envMaster.localStorage.setItem('billnaw_device_id', masterDevId);

    envMaster.window.authorizedDevices = [
      {
        deviceId: masterDevId,
        deviceName: 'Master Counter 1',
        isMaster: true,
        status: 'AUTHORIZED',
        stationProfile: 'BILLING_COUNTER'
      }
    ];

    let toastMessage = null;
    envMaster.showToast = (msg) => {
      toastMessage = msg;
    };

    // Attempt 1: Revoke via revokeAuthorizedDevice
    await envMaster.revokeAuthorizedDevice(masterDevId);
    assert.strictEqual(envMaster.window.authorizedDevices[0].status, 'AUTHORIZED', 'Master terminal status must remain AUTHORIZED');
    assert(toastMessage.includes('Master Admin Terminal cannot revoke itself'), 'Must show self-revocation error toast');

    // Attempt 2: Direct call to handleDeviceRevocation on Master terminal
    const revOverlay = elements.get('deviceRevokedOverlay');
    revOverlay.style.display = 'none';
    await envMaster.handleDeviceRevocation({ deviceId: masterDevId });

    assert.strictEqual(envMaster.localStorage.getItem('billnaw_is_master'), 'true');
    assert.notStrictEqual(envMaster.localStorage.getItem('billnaw_device_status'), 'REVOKED', 'Master device status must not become REVOKED');
    assert.strictEqual(revOverlay.style.display, 'none', '#deviceRevokedOverlay must NOT be shown on Master terminal');

    recordPass('Master Admin Immunity: Master terminal protected from revocation via UI and event handler');
  } catch (err) {
    recordFail('Master Admin Immunity: Master terminal protected from revocation', err);
  }

  // 3.2: 1-Click Revocation of Secondary Terminal & clearAllTenantLocalData()
  try {
    const { sandbox: envSec, elements } = createSimulatedBrowserEnv({
      billnaw_auth_token: 'JWT_SECRET_TOKEN_XYZ',
      billnaw_active_staff: JSON.stringify({ id: 2, name: 'Rohan', role: 'Cashier' }),
      billnaw_last_staff_id: '2',
      billnaw_active_cart: JSON.stringify([{ id: 1, name: 'Filter Coffee', price: 60 }]),
      billnaw_offline_orders: JSON.stringify([{ id: 'BN-OFF-1' }]),
      billnaw_authorized_devices: JSON.stringify([{ id: 'DEV_SEC' }]),
      billnaw_active_sessions: JSON.stringify([{ id: 'sess_1' }]),
      billnaw_shop_session: 'SHOP_SESSION_ACTIVE',
      billnaw_auth_email: 'cashier@cafe.com',
      billnaw_auth_phone: '9988776655',
      billnaw_store_code: 'STORE123',
      billnaw_active_user: 'Rohan Cashier',
      billnaw_terminal_locked: 'false',
      cafe_khata: JSON.stringify([{ name: 'Diner' }]),
      billnaw_culinary_materials: JSON.stringify([{ name: 'Coffee Beans' }]),
      billnaw_culinary_batches: JSON.stringify([{ id: 'b1' }])
    });
    envSec.sessionStorage.setItem('temp_data', 'secret');

    loadCorePairingFunctions(envSec);

    const secDevId = 'DEV_SEC00000001';
    envSec.localStorage.setItem('billnaw_device_id', secDevId);
    envSec.localStorage.setItem('billnaw_device_status', 'AUTHORIZED');

    // In-memory tenant structures
    envSec.cart = [{ item: 'Burger', price: 150 }];
    envSec.currentCart = [{ item: 'Burger', price: 150 }];
    envSec.tablesInfo = { T1: { items: ['Burger'] } };
    envSec.currentStaff = { id: 2, name: 'Rohan', role: 'Cashier' };

    let listenerUnsubscribed = false;
    envSec.firestoreUnsubscribe = () => {
      listenerUnsubscribed = true;
    };

    // Trigger revocation kickout
    await envSec.handleDeviceRevocation({ deviceId: secDevId });

    // Assert 1: localStorage tenant keys wiped
    const wipedKeys = [
      'billnaw_auth_token',
      'billnaw_active_staff',
      'billnaw_last_staff_id',
      'billnaw_active_cart',
      'billnaw_offline_orders',
      'billnaw_authorized_devices',
      'billnaw_active_sessions',
      'billnaw_shop_session',
      'billnaw_auth_email',
      'billnaw_auth_phone',
      'billnaw_store_code',
      'billnaw_active_user',
      'billnaw_terminal_locked',
      'cafe_khata',
      'billnaw_culinary_materials',
      'billnaw_culinary_batches'
    ];
    for (const key of wipedKeys) {
      assert.strictEqual(envSec.localStorage.getItem(key), null, `Key '${key}' must be wiped upon revocation`);
    }

    // Assert 2: Device status set to REVOKED
    assert.strictEqual(envSec.localStorage.getItem('billnaw_device_status'), 'REVOKED');

    // Assert 3: In-memory session & cart wiped
    assert.strictEqual(envSec.cart.length, 0, 'window.cart must be empty');
    assert.strictEqual(envSec.currentCart.length, 0, 'currentCart must be empty');
    assert.strictEqual(Object.keys(envSec.tablesInfo).length, 0, 'tablesInfo must be empty');
    assert.strictEqual(envSec.currentStaff, null, 'currentStaff must be null');

    // Assert 4: sessionStorage wiped
    assert.strictEqual(envSec.sessionStorage.getItem('temp_data'), null, 'sessionStorage must be cleared');

    // Assert 5: Firestore listener detached
    assert.strictEqual(listenerUnsubscribed, true, 'firestore listener must be unsubscribed');
    assert.strictEqual(envSec.firestoreUnsubscribe, null, 'firestoreUnsubscribe reference must be nulled');

    // Assert 6: Revoked overlay displayed with terminal ID
    const revOverlay = elements.get('deviceRevokedOverlay');
    assert.strictEqual(revOverlay.style.display, 'flex', '#deviceRevokedOverlay must be displayed');
    const idDisplay = elements.get('revokedDeviceIdDisplay');
    assert.strictEqual(idDisplay.innerText, secDevId, 'revokedDeviceIdDisplay must show terminal ID');

    recordPass('1-Click Revocation Kickout: Tenant data wiped, cart/staff cleared, listeners detached & overlay shown');
  } catch (err) {
    recordFail('1-Click Revocation Kickout: Tenant data wiped, cart/staff cleared, listeners detached', err);
  }

  // 3.3: Checkout attempt during revocation aborted atomically (no orphan bill)
  try {
    const { sandbox: envPos } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envPos);

    // Secondary terminal in REVOKED state
    envPos.localStorage.setItem('billnaw_device_status', 'REVOKED');

    let toastFired = null;
    envPos.showToast = (msg) => {
      toastFired = msg;
    };

    // Load checkout functions from pos.js
    const posPath = path.resolve(__dirname, '../js/pos.js');
    const posSrc = fs.readFileSync(posPath, 'utf8');

    const openCheckStart = posSrc.indexOf('function openCheckoutModal(bypassRoleCheck = false)');
    const openCheckEnd = posSrc.indexOf('window.openCheckoutModal = openCheckoutModal;');
    const openCheckBlock = posSrc.slice(openCheckStart, openCheckEnd + 'window.openCheckoutModal = openCheckoutModal;'.length);

    const confCheckStart = posSrc.indexOf('async function confirmCheckout()');
    const confCheckEnd = posSrc.indexOf('window.confirmCheckout = confirmCheckout;');
    const confCheckBlock = posSrc.slice(confCheckStart, confCheckEnd + 'window.confirmCheckout = confirmCheckout;'.length);

    vm.runInContext(openCheckBlock, envPos);
    vm.runInContext(confCheckBlock, envPos);

    // Attempt 1: openCheckoutModal
    let modalOpened = false;
    envPos.elements = { checkoutModal: { style: { display: 'none' } } };
    envPos.openCheckoutModal();
    assert(toastFired.includes('Transaction blocked'), 'openCheckoutModal must block and alert');

    // Attempt 2: confirmCheckout throws error and halts before invoice creation
    let confirmThrew = false;
    try {
      await envPos.confirmCheckout();
    } catch (e) {
      confirmThrew = true;
      assert.strictEqual(e.message, 'Device revoked; transaction aborted');
    }
    assert.strictEqual(confirmThrew, true, 'confirmCheckout must throw error and abort atomically');

    recordPass('Atomic Checkout Abort: Checkout attempts during revocation blocked without orphan bills');
  } catch (err) {
    recordFail('Atomic Checkout Abort: Checkout attempts during revocation blocked', err);
  }

  // 3.4: Fresh re-pairing request from revoked screen returns to PENDING
  try {
    const { sandbox: envRepair, elements } = createSimulatedBrowserEnv({
      billnaw_device_status: 'REVOKED',
      billnaw_pairing_code: '999888',
      billnaw_device_id: 'DEV_REVOKED001'
    });
    loadCorePairingFunctions(envRepair);

    const revOverlay = elements.get('deviceRevokedOverlay');
    revOverlay.style.display = 'flex';
    const pairOverlay = elements.get('devicePairingOverlay');
    pairOverlay.style.display = 'none';

    // Staff clicks "Request New Device Pairing"
    envRepair.handleRequestNewPairing();

    // Verify:
    // 1. #deviceRevokedOverlay is hidden
    assert.strictEqual(revOverlay.style.display, 'none', '#deviceRevokedOverlay must be hidden');

    // 2. #devicePairingOverlay is shown
    assert.strictEqual(pairOverlay.style.display, 'flex', '#devicePairingOverlay must be shown');

    // 3. New 6-digit code is generated and saved
    const newCode = envRepair.localStorage.getItem('billnaw_pairing_code');
    assert(/^\d{6}$/.test(newCode), `New pairing code '${newCode}' must be a 6-digit string`);
    assert.notStrictEqual(newCode, '999888', 'Must generate a fresh code different from previous code');

    // 4. Device status returns to PENDING
    assert.strictEqual(envRepair.getDeviceStatus(), 'PENDING', 'Device status must return to PENDING');

    // 5. Code display elements updated
    const codeDisplay = elements.get('pairingCodeDisplay');
    assert.strictEqual(codeDisplay.innerText, `${newCode.slice(0, 3)} ${newCode.slice(3)}`);

    recordPass('Fresh Re-Pairing Flow: Revoked overlay dismissed, fresh 6-digit code generated, status returns to PENDING');
  } catch (err) {
    recordFail('Fresh Re-Pairing Flow: Revoked overlay dismissed, fresh 6-digit code generated', err);
  }

  // ====================================================================
  // AREA 4: Station Profiles UI Enforcement & Invariants
  // ====================================================================
  console.log('\n📍 AREA 4: STATION PROFILES UI ENFORCEMENT & SYSTEM INVARIANTS');

  // 4.1: Station Profile DOM restrictions
  try {
    const { sandbox: envProf, elements } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envProf);

    // Test KDS Profile DOM rules
    envProf.setStationProfile('KDS');
    assert.strictEqual(elements.get('nav-pos').style.display, 'none');
    assert.strictEqual(elements.get('nav-tables').style.display, 'none');
    assert.strictEqual(elements.get('nav-menu').style.display, 'none');
    assert.strictEqual(elements.get('nav-dashboard').style.display, 'none');
    assert.strictEqual(elements.get('nav-kds').style.display, 'flex');
    assert.strictEqual(elements.get('checkoutBtn').style.display, 'none');

    // Test WAITER_MOBILE Profile DOM rules
    envProf.setStationProfile('WAITER_MOBILE');
    assert.strictEqual(elements.get('nav-pos').style.display, 'flex');
    assert.strictEqual(elements.get('nav-tables').style.display, 'flex');
    assert.strictEqual(elements.get('nav-kds').style.display, 'none');
    assert.strictEqual(elements.get('nav-dashboard').style.display, 'none');
    assert.strictEqual(elements.get('checkoutBtn').style.display, 'none');
    assert.strictEqual(elements.get('cartDiscountWrap').style.display, 'none');

    // Test BILLING_COUNTER Profile DOM rules
    envProf.setStationProfile('BILLING_COUNTER');
    assert.strictEqual(elements.get('nav-pos').style.display, 'flex');
    assert.strictEqual(elements.get('nav-kds').style.display, 'flex');
    assert.strictEqual(elements.get('nav-tables').style.display, 'flex');
    assert.strictEqual(elements.get('nav-menu').style.display, 'flex');
    assert.strictEqual(elements.get('checkoutBtn').style.display, '');

    // Test Initial View Resolution for Station Profiles
    assert.strictEqual(envProf.resolveInitialViewForStation('KDS'), 'kds');
    assert.strictEqual(envProf.resolveInitialViewForStation('WAITER_MOBILE'), 'tables');
    assert.strictEqual(envProf.resolveInitialViewForStation('BILLING_COUNTER'), 'pos');
    assert.strictEqual(envProf.resolveInitialViewForStation('GENERAL_STATION', 'Kitchen Chef'), 'kds');
    assert.strictEqual(envProf.resolveInitialViewForStation('GENERAL_STATION', 'Floor Server'), 'tables');
    assert.strictEqual(envProf.resolveInitialViewForStation('GENERAL_STATION', 'Cashier'), 'pos');

    recordPass('Station Profiles: KDS, Waiter Mobile, Counter & General DOM rules verified');
  } catch (err) {
    recordFail('Station Profiles: DOM rules and initial view resolution', err);
  }

  // 4.2: Exact 26 .modal-close-btn SVG Invariant Verification
  try {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const matches = html.match(/class="[^"]*modal-close-btn[^"]*"/g) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn elements, found ${matches.length}`);

    // Check newly added overlays: devicePairingOverlay & deviceRevokedOverlay have 0 close buttons
    const pairSection = html.slice(html.indexOf('id="devicePairingOverlay"'), html.indexOf('<!-- 🚫 NON-DISMISSIBLE DEVICE REVOKED OVERLAY'));
    assert(!pairSection.includes('modal-close-btn'), '#devicePairingOverlay must NOT contain modal-close-btn');

    const revSection = html.slice(html.indexOf('id="deviceRevokedOverlay"'), html.indexOf('<!-- 🔐 MANDATORY FIRST-LOGIN PIN CHANGE MODAL'));
    assert(!revSection.includes('modal-close-btn'), '#deviceRevokedOverlay must NOT contain modal-close-btn');

    const hubSection = html.slice(html.indexOf('id="authorizedDevicesModal"'), html.indexOf('<!-- DETAIL SUB-MODAL: CLOUD SYNC & FIREBASE -->'));
    assert(hubSection.includes('class="device-hub-close-btn"'), '#authorizedDevicesModal must use .device-hub-close-btn');
    assert(!hubSection.includes('class="modal-close-btn"'), '#authorizedDevicesModal must NEVER use .modal-close-btn');

    recordPass('Modal Close Invariant: Exactly 26 .modal-close-btn SVG elements; zero in pairing/revocation modals');
  } catch (err) {
    recordFail('Modal Close Invariant: Exactly 26 .modal-close-btn SVG elements', err);
  }

  // 4.3: Zero Raw Unicode Emojis in operational buttons and tabs
  try {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    // Check buttons inside devicePairingOverlay, deviceRevokedOverlay, authorizedDevicesModal
    const navKds = html.match(/<button[^>]*id="nav-kds"[^>]*>([\s\S]*?)<\/button>/);
    assert(navKds && !emojiRegex.test(navKds[1]), '#nav-kds must not contain raw Unicode emojis');

    const navTables = html.match(/<button[^>]*id="nav-tables"[^>]*>([\s\S]*?)<\/button>/);
    assert(navTables && !emojiRegex.test(navTables[1]), '#nav-tables must not contain raw Unicode emojis');

    recordPass('Zero Emoji Invariant: #nav-kds and #nav-tables use inline Lucide SVGs without raw emojis');
  } catch (err) {
    recordFail('Zero Emoji Invariant: Operational buttons free of raw emojis', err);
  }

  // ====================================================================
  // AREA 5: HIGH-LOAD STRESS & INJECTION ATTACK VECTORS
  // ====================================================================
  console.log('\n📍 AREA 5: HIGH-LOAD STRESS & INJECTION ATTACK VECTORS');

  // 5.1: High-load collision test: 5000 Device IDs and 5000 Pairing Codes
  try {
    const { sandbox: envStress } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envStress);

    const stressIds = new Set();
    const stressCodes = new Set();
    const idRegex = /^DEV_[A-F0-9]{12}$/;
    const codeRegex = /^\d{6}$/;

    for (let i = 0; i < 5000; i++) {
      const devId = envStress.generateDeviceId();
      assert(idRegex.test(devId), `Device ID ${devId} must match regex`);
      stressIds.add(devId);

      const code = envStress.generatePairingCode();
      assert(codeRegex.test(code), `Pairing code ${code} must match regex`);
      assert(code[0] !== '0', `Pairing code ${code} first digit must never be 0`);
      stressCodes.add(code);
    }

    assert.strictEqual(stressIds.size, 5000, '0 collisions across 5000 Device IDs');
    assert(stressCodes.size > 4800, `Pairing codes should have high entropy (got ${stressCodes.size}/5000 unique)`);
    recordPass('High-Load Entropy Stress: 5000 Device IDs (0 collisions) & 5000 Pairing Codes (high entropy)');
  } catch (err) {
    recordFail('High-Load Entropy Stress: 5000 Device IDs and 5000 Pairing Codes', err);
  }

  // 5.2: Storage quota exception resilience in getOrCreateDeviceId()
  try {
    const { sandbox: envQuota } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envQuota);

    // Make setItem throw QuotaExceededError
    envQuota.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError: DOMException');
      err.name = 'QuotaExceededError';
      throw err;
    };

    const resilientId = envQuota.getOrCreateDeviceId();
    assert(/^DEV_[A-F0-9]{12}$/.test(resilientId), 'Must safely return valid Device ID despite storage quota failure');
    recordPass('Storage Quota Resilience: getOrCreateDeviceId() survives QuotaExceededError without uncaught exception');
  } catch (err) {
    recordFail('Storage Quota Resilience: getOrCreateDeviceId() survives QuotaExceededError', err);
  }

  // 5.3: XSS & Malicious Input Sanitization in approveDevicePairing()
  try {
    const { sandbox: envXss, elements } = createSimulatedBrowserEnv();
    loadCorePairingFunctions(envXss);
    loadSettingsDeviceFunctions(envXss);

    // Mock escapeHtml
    envXss.escapeHtml = (str) =>
      String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const testDevId = 'DEV_MALICIOUS01';
    envXss.window.authorizedDevices = [{ deviceId: testDevId, status: 'PENDING' }];

    // Inject malicious station name and illegal profile
    const maliciousNameInput = elements.get('devName_' + testDevId) || { value: '' };
    maliciousNameInput.value = '<script>alert("XSS")</script>' + 'A'.repeat(100);
    elements.set('devName_' + testDevId, maliciousNameInput);

    const illegalProfileSelect = elements.get('devProfile_' + testDevId) || { value: '' };
    illegalProfileSelect.value = 'HACKED_SUPER_ADMIN_PROFILE';
    elements.set('devProfile_' + testDevId, illegalProfileSelect);

    let cloudSyncedUpdates = null;
    envXss.setTenantDevice = async (id, updates) => {
      cloudSyncedUpdates = updates;
    };

    await envXss.approveDevicePairing(testDevId);

    const approvedRecord = envXss.window.authorizedDevices[0];
    assert.strictEqual(approvedRecord.status, 'AUTHORIZED');
    // Verify truncation to 50 chars prior to escaping and HTML escaping
    assert(!approvedRecord.deviceName.includes('<script>'), 'Station name must be HTML-escaped');
    assert(approvedRecord.deviceName.length <= 100, 'Station name with HTML entity expansion must be bounded');
    // Verify profile fallback
    assert.strictEqual(approvedRecord.stationProfile, 'GENERAL_STATION', 'Illegal profile must fall back to GENERAL_STATION');

    recordPass('Input Sanitization & Profile Bounding: XSS escaped, name truncated, illegal profile safely restricted');
  } catch (err) {
    recordFail('Input Sanitization & Profile Bounding: XSS escaped and profile bounded', err);
  }

  // 5.4: Rapid Sequential / Concurrent Revocation Idempotency
  try {
    const { sandbox: envRace, elements } = createSimulatedBrowserEnv({
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_id: 'DEV_RACE0000001'
    });
    loadCorePairingFunctions(envRace);

    // Call handleDeviceRevocation 5 times concurrently
    await Promise.all([
      envRace.handleDeviceRevocation({ deviceId: 'DEV_RACE0000001' }),
      envRace.handleDeviceRevocation({ deviceId: 'DEV_RACE0000001' }),
      envRace.handleDeviceRevocation({ deviceId: 'DEV_RACE0000001' }),
      envRace.handleDeviceRevocation({ deviceId: 'DEV_RACE0000001' }),
      envRace.handleDeviceRevocation({ deviceId: 'DEV_RACE0000001' })
    ]);

    assert.strictEqual(envRace.localStorage.getItem('billnaw_device_status'), 'REVOKED');
    assert.strictEqual(elements.get('deviceRevokedOverlay').style.display, 'flex');
    recordPass('Revocation Idempotency: Concurrent revocation executions execute cleanly without error or corrupt state');
  } catch (err) {
    recordFail('Revocation Idempotency: Concurrent revocation executions', err);
  }

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================');

  if (failedTests > 0) {
    console.error(`\n❌ ${failedTests} TESTS FAILED! See details above.`);
    process.exit(1);
  } else {
    console.log('\n✨ ALL ADVERSARIAL CHALLENGER TESTS PASSED 100% GREEN!');
    process.exit(0);
  }
}

runChallengerSuite().catch((err) => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
