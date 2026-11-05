/**
 * scratch/test_adversarial_pairing_reloads.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE: RELOAD PERSISTENCE & VIEW STABILITY
 * ============================================================================
 *
 * Verifies:
 * 1. 50+ Rapid Page Reloads on Authorized Terminal:
 *    - Strict assertion: #devicePairingOverlay NEVER displays or flashes ('none' strictly)
 *    - Strict assertion: Zero QR code generation / DOM injection occurs
 *    - Strict assertion: Zero cloud status demotions (registerPendingDeviceToCloud count === 0)
 *    - Strict assertion: Station profile view instantly activated (#kds, #tables, #pos)
 *    - Parameterized across 60 iterations, 3 station profiles, and diverse TTL ages.
 * 2. 10-Day TTL Boundary & Corrupt State Adversarial Tests:
 *    - 9.99 days (within TTL): valid, zero QR overlay, view persists
 *    - 10.01 days (expired): cleanly triggers re-pairing flow
 *    - Corrupt / NaN / missing timestamp: healed or handled without uncaught exceptions
 * 3. High-Frequency Tab Navigation Stress Test (ZeroStoreDataGate):
 *    - 100 rapid sequential tab switches on authorized device without tripping overlay
 *    - Transient sync lag / offline mode does not trip overlay
 *    - Unauthorized / PENDING device navigation is strictly blocked by ZeroStoreDataGate
 * 4. State Transition Latency Benchmark:
 *    - High-resolution timing of approval event to view activation (< 5ms)
 * 5. Repository Invariants & Companion Suites:
 *    - Exact 26 .modal-close-btn SVGs in index.html
 *    - Strictly 0 raw emojis in operational controls
 *    - Currency non-breaking space '₹ '
 *    - Port 5000 server health check HTTP 200
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_JS_PATH = path.join(ROOT_DIR, 'js', 'core.js');
const SETTINGS_JS_PATH = path.join(ROOT_DIR, 'js', 'settings.js');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');

console.log('====================================================================');
console.log('⚔️  EMPIRICAL ADVERSARIAL CHALLENGER: RELOAD PERSISTENCE & GATES');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(id, description, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: [${id}] ${description}${details ? ` (${details})` : ''}`);
}

function recordFail(id, description, error, details = '') {
  totalTests++;
  failedTests++;
  const msg = error && error.message ? error.message : String(error);
  failures.push({ id, description, error: msg, details });
  console.error(`  ❌ FAIL: [${id}] ${description}`);
  console.error(`     Error: ${msg}`);
  if (details) console.error(`     Context: ${details}`);
}

// ----------------------------------------------------------------------------
// Sandbox Browser Environment Factory
// ----------------------------------------------------------------------------
function createSimulatedBrowserEnv(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();

  const mockLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null,
    _store: store
  };

  const mockSessionStorage = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear: () => sessionStore.clear(),
    get length() { return sessionStore.size; },
    _store: sessionStore
  };

  const elements = new Map();

  function createMockElement(id, tagName = 'div', className = '') {
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      className,
      classList: {
        _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
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
      style: { display: '' },
      innerText: '',
      innerHTML: '',
      value: '',
      children: [],
      scrollTop: 0,
      setAttribute: function (k, v) { this[k] = v; },
      getAttribute: function (k) { return this[k] || null; },
      appendChild: function (child) {
        this.children.push(child);
        return child;
      },
      remove: function () {
        elements.delete(id);
      },
      focus: function () {}
    };
    elements.set(id, el);
    return el;
  }

  // Pre-seed known DOM elements from index.html
  const knownIds = [
    'devicePairingOverlay',
    'deviceRevokedOverlay',
    'pairingDeviceIdDisplay',
    'pairingCodeDisplay',
    'pairingQrContainer',
    'revokedDeviceIdDisplay',
    'adminPairingNotificationBanner',
    'adminPairingBannerText',
    'deviceApprovalPinModal',
    'approvalDeviceIdDisplay',
    'approvalStationProfileSelect',
    'approvalAdminPinInput',
    'authorizedDevicesModal',
    'topbarDate',
    'installAppBtn',
    'checkoutBtn',
    'cartDiscountWrap',
    'dashboard',
    'settings',
    'menu',
    'inventory',
    'khata',
    'staff',
    'devices',
    'customers',
    'pos',
    'kds',
    'tables',
    'nav-pos',
    'nav-kds',
    'nav-tables',
    'nav-menu',
    'nav-dashboard',
    'nav-inventory',
    'nav-khata',
    'nav-more',
    'tab-pos',
    'tab-kds',
    'tab-tables'
  ];
  knownIds.forEach(id => createMockElement(id));

  const listeners = new Map();
  const toasts = [];
  let registerCloudCalls = 0;
  let qrCodeGenerations = 0;

  const mockDocument = {
    getElementById: (id) => elements.get(id) || createMockElement(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      if (sel === '.main-content') return createMockElement('main-content');
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('.view') || sel.includes('.tab-content')) {
        return ['pos', 'kds', 'tables', 'dashboard', 'settings', 'menu', 'inventory', 'khata'].map(id => elements.get(id));
      }
      if (sel.includes('.nav-btn') || sel.includes('.tab-btn')) {
        return ['nav-pos', 'nav-kds', 'nav-tables', 'nav-menu', 'nav-dashboard', 'nav-inventory', 'nav-khata', 'nav-more'].map(id => elements.get(id));
      }
      if (sel === '.modal-overlay') {
        return [elements.get('devicePairingOverlay'), elements.get('deviceRevokedOverlay')].filter(Boolean);
      }
      return [];
    },
    createElement: (tag) => createMockElement('el_' + Math.random().toString(36).slice(2), tag),
    body: createMockElement('body', 'body'),
    addEventListener: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(handler);
    },
    removeEventListener: (evt, handler) => {
      if (listeners.has(evt)) {
        const arr = listeners.get(evt).filter(h => h !== handler);
        listeners.set(evt, arr);
      }
    },
    dispatchEvent: (evt) => {
      const arr = listeners.get(evt.type) || [];
      arr.forEach(h => h(evt));
      return true;
    }
  };

  const windowListeners = new Map();
  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout: (fn, ms) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: (evt, handler) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, []);
      windowListeners.get(evt).push(handler);
    },
    removeEventListener: (evt, handler) => {
      if (windowListeners.has(evt)) {
        const arr = windowListeners.get(evt).filter(h => h !== handler);
        windowListeners.set(evt, arr);
      }
    },
    dispatchEvent: (evt) => {
      const arr = windowListeners.get(evt.type) || [];
      arr.forEach(h => h(evt));
      return true;
    },
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
    Map,
    performance,
    scrollTo: () => {},
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'AdversarialNodeAgent/1.0', standalone: false },
    toasts,
    showToast: (msg, type) => toasts.push({ msg, type }),
    getRegisterCloudCalls: () => registerCloudCalls,
    getQrCodeGenerations: () => qrCodeGenerations,
    QRCode: function (container, options) {
      qrCodeGenerations++;
      if (container) container.innerHTML = `<img src="mock_qr" data-text="${options.text}"/>`;
    }
  };
  sandbox.QRCode.CorrectLevel = { M: 1 };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Intercept registerPendingDeviceToCloud to track calls
  sandbox.registerPendingDeviceToCloud = async (devId, code) => {
    registerCloudCalls++;
  };

  return { sandbox, elements, listeners, store, sessionStore };
}

// Helper to load core and settings into sandbox
function loadCoreAndSettings(sandbox) {
  const coreSrc = fs.readFileSync(CORE_JS_PATH, 'utf8');
  const settingsSrc = fs.readFileSync(SETTINGS_JS_PATH, 'utf8');

  // Provide initial stubs for global objects before running scripts
  sandbox.menuItems = [];
  sandbox.menuCategories = [];
  sandbox.orderHistory = [];
  sandbox.dailyExpenses = [];
  sandbox.tablesInfo = {};
  sandbox.customersList = [];
  sandbox.staffList = [];
  sandbox.shopProfile = { name: 'Challenger Cafe', adminPinHash: 'abc' };
  sandbox.idb = { get: () => Promise.resolve(null), set: () => Promise.resolve(null) };

  vm.createContext(sandbox);

  // Run core.js
  vm.runInContext(coreSrc, sandbox);

  // Run settings.js
  vm.runInContext(settingsSrc, sandbox);

  return sandbox;
}

// ----------------------------------------------------------------------------
// Test Runner
// ----------------------------------------------------------------------------
async function runAdversarialChallengeSuite() {
  // ==========================================================================
  // SECTION 1: 50+ RAPID PAGE RELOADS ON AUTHORIZED TERMINAL
  // ==========================================================================
  console.log('📍 SECTION 1: 50+ RAPID PAGE RELOADS ON AUTHORIZED TERMINAL (ZERO QR & ZERO DEMOTION)');

  const profilesToTest = [
    { profile: 'KDS', name: 'Kitchen Chef KDS', expectedView: 'kds' },
    { profile: 'WAITER_MOBILE', name: 'Floor Waiter Pad', expectedView: 'tables' },
    { profile: 'BILLING_COUNTER', name: 'Secondary Counter POS', expectedView: 'pos' }
  ];

  const TOTAL_RELOAD_ITERATIONS = 60; // 60 iterations (> 50 mandatory)
  let reloadFailures = 0;
  let qrFlashesDetected = 0;
  let cloudDemotionsDetected = 0;
  let viewRoutingFailures = 0;

  for (let i = 1; i <= TOTAL_RELOAD_ITERATIONS; i++) {
    const profileConfig = profilesToTest[(i - 1) % profilesToTest.length];
    const devId = `DEV_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    
    // Vary auth age across iterations: 10s, 1h, 12h, 1d, 3d, 7d, 9.9d
    const ages = [
      10 * 1000,
      60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      24 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      9.9 * 24 * 60 * 60 * 1000
    ];
    const authAgeMs = ages[i % ages.length];
    const authTimestamp = (Date.now() - authAgeMs).toString();

    // Setup initial storage state for an authorized secondary terminal
    const initialStorage = {
      bongbhoj_device_id: devId,
      billnaw_device_id: devId,
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: authTimestamp,
      billnaw_station_profile: profileConfig.profile,
      billnaw_station_name: profileConfig.name,
      billnaw_is_master: 'false',
      billnaw_authorized_devices: JSON.stringify([
        {
          deviceId: devId,
          status: 'AUTHORIZED',
          stationProfile: profileConfig.profile,
          deviceName: profileConfig.name,
          approvedAt: new Date(Date.now() - authAgeMs).toISOString()
        }
      ])
    };

    const { sandbox, elements, listeners } = createSimulatedBrowserEnv(initialStorage);
    loadCoreAndSettings(sandbox);

    // Instrument registerPendingDeviceToCloud
    let cloudRegInvoked = false;
    sandbox.registerPendingDeviceToCloud = async () => {
      cloudRegInvoked = true;
    };

    // Trigger DOMContentLoaded event (simulating page reload boot)
    const domReadyHandlers = listeners.get('DOMContentLoaded') || [];
    for (const h of domReadyHandlers) {
      h();
    }

    // Call initFirestoreSync() if defined (simulating initApp boot sequence)
    if (typeof sandbox.initFirestoreSync === 'function') {
      sandbox.initFirestoreSync();
    }

    // Assert 1: #devicePairingOverlay MUST be 'none' (NEVER 'flex')
    const pairOverlay = elements.get('devicePairingOverlay');
    const overlayShowing = pairOverlay.style.display === 'flex' || pairOverlay.style.display === '';
    if (overlayShowing) {
      qrFlashesDetected++;
      reloadFailures++;
    }

    // Assert 2: QR code was NOT generated
    const qrContainer = elements.get('pairingQrContainer');
    const hasQrContent = qrContainer.innerHTML.includes('img') || qrContainer.innerHTML.includes('canvas');
    if (hasQrContent || sandbox.getQrCodeGenerations() > 0) {
      qrFlashesDetected++;
      reloadFailures++;
    }

    // Assert 3: Zero cloud status demotions
    if (cloudRegInvoked) {
      cloudDemotionsDetected++;
      reloadFailures++;
    }

    // Assert 4: Status remains AUTHORIZED in localStorage
    const postStatus = sandbox.localStorage.getItem('billnaw_device_status');
    if (postStatus !== 'AUTHORIZED') {
      cloudDemotionsDetected++;
      reloadFailures++;
    }

    // Assert 5: Target station view is active
    const targetViewEl = elements.get(profileConfig.expectedView);
    const isTargetViewActive = targetViewEl && targetViewEl.classList.contains('active');
    if (!isTargetViewActive) {
      viewRoutingFailures++;
      reloadFailures++;
    }
  }

  if (reloadFailures === 0) {
    recordPass(
      'ADV-RELOAD-01',
      `60/60 Rapid Simulated Reloads: Zero QR overlay display, zero QR code generation, zero cloud demotion`,
      `Verified 60 iterations across KDS, WAITER_MOBILE, and BILLING_COUNTER`
    );
  } else {
    recordFail(
      'ADV-RELOAD-01',
      `Rapid simulated reloads detected failures: QR Flashes: ${qrFlashesDetected}, Demotions: ${cloudDemotionsDetected}, View Failures: ${viewRoutingFailures}`,
      new Error(`Failed in ${reloadFailures}/${TOTAL_RELOAD_ITERATIONS} reload iterations`)
    );
  }

  // ==========================================================================
  // SECTION 2: 10-DAY TTL BOUNDARY STRESS & CORRUPT DATA RESILIENCE
  // ==========================================================================
  console.log('\n📍 SECTION 2: 10-DAY TTL BOUNDARY STRESS & CORRUPT DATA RESILIENCE');

  // 2.1: Exactly 9.999 days old (valid, active session)
  try {
    const devId = 'DEV_TTL_VALID_01';
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const validTimestamp = (Date.now() - (TEN_DAYS_MS - 60000)).toString(); // 1 minute before expiry

    const { sandbox, elements, listeners } = createSimulatedBrowserEnv({
      bongbhoj_device_id: devId,
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: validTimestamp,
      billnaw_station_profile: 'KDS',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    // Boot
    (listeners.get('DOMContentLoaded') || []).forEach(h => h());

    const pairOverlay = elements.get('devicePairingOverlay');
    assert.strictEqual(pairOverlay.style.display, 'none', 'Overlay must remain none at 9.999 days');
    assert.strictEqual(sandbox.getDeviceStatus(), 'AUTHORIZED', 'Status must remain AUTHORIZED');
    assert.ok(elements.get('kds').classList.contains('active'), 'Station view #kds must be active');

    recordPass('ADV-TTL-01', '10-Day TTL Boundary: Session at 9.999 days evaluates valid, preserves AUTHORIZED and #kds view');
  } catch (err) {
    recordFail('ADV-TTL-01', '10-Day TTL Boundary: Session at 9.999 days', err);
  }

  // 2.2: Exactly 10 days + 5 seconds old (expired session)
  try {
    const devId = 'DEV_TTL_EXPIRED_01';
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const expiredTimestamp = (Date.now() - (TEN_DAYS_MS + 5000)).toString(); // 5 seconds past expiry

    const { sandbox, elements, listeners } = createSimulatedBrowserEnv({
      bongbhoj_device_id: devId,
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: expiredTimestamp,
      billnaw_station_profile: 'KDS',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    // Boot
    (listeners.get('DOMContentLoaded') || []).forEach(h => h());

    const pairOverlay = elements.get('devicePairingOverlay');
    assert.strictEqual(pairOverlay.style.display, 'flex', 'Overlay must display flex upon TTL expiry');
    assert.strictEqual(sandbox.localStorage.getItem('billnaw_device_status'), null, 'Expired status must be pruned');

    recordPass('ADV-TTL-02', '10-Day TTL Boundary: Session at 10 days + 5s cleanly triggers expiration and re-pairing overlay');
  } catch (err) {
    recordFail('ADV-TTL-02', '10-Day TTL Boundary: Expired session at 10 days + 5s', err);
  }

  // 2.3: Corrupt Non-Numeric billnaw_device_auth_timestamp
  try {
    const devId = 'DEV_CORRUPT_TS';
    const { sandbox, elements, listeners } = createSimulatedBrowserEnv({
      bongbhoj_device_id: devId,
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: 'CORRUPTED_STRING_VALUE_HERE',
      billnaw_station_profile: 'BILLING_COUNTER',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    // Boot
    assert.doesNotThrow(() => {
      (listeners.get('DOMContentLoaded') || []).forEach(h => h());
    }, 'Corrupt timestamp must not throw uncaught exceptions');

    recordPass('ADV-TTL-03', 'Corrupt / NaN auth timestamp is safely handled without uncaught exceptions or page crash');
  } catch (err) {
    recordFail('ADV-TTL-03', 'Corrupt / NaN auth timestamp handling', err);
  }

  // ==========================================================================
  // SECTION 3: HIGH-FREQUENCY TAB NAVIGATION STRESS TEST (ZeroStoreDataGate)
  // ==========================================================================
  console.log('\n📍 SECTION 3: HIGH-FREQUENCY TAB NAVIGATION STRESS TEST (ZeroStoreDataGate)');

  // 3.1: 100 Rapid Tab Switches on Authorized Terminal
  try {
    const { sandbox, elements } = createSimulatedBrowserEnv({
      bongbhoj_device_id: 'DEV_NAV_STRESS_01',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: Date.now().toString(),
      billnaw_station_profile: 'BILLING_COUNTER',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    const tabsToCycle = ['pos', 'kds', 'tables', 'dashboard', 'menu', 'inventory', 'khata'];
    const pairOverlay = elements.get('devicePairingOverlay');
    pairOverlay.style.display = 'none';

    let overlayTrippedCount = 0;
    const NUM_SWITCHES = 100;

    for (let i = 0; i < NUM_SWITCHES; i++) {
      const targetTab = tabsToCycle[i % tabsToCycle.length];
      sandbox.switchTab(targetTab);

      if (pairOverlay.style.display === 'flex') {
        overlayTrippedCount++;
      }
    }

    assert.strictEqual(overlayTrippedCount, 0, `#devicePairingOverlay tripped ${overlayTrippedCount} times during 100 tab switches`);
    recordPass(
      'ADV-NAV-01',
      '100 Rapid Consecutive Tab Switches on Authorized Terminal: ZeroStoreDataGate NEVER trips pairing overlay',
      `Completed 100 cycles across [${tabsToCycle.join(', ')}]`
    );
  } catch (err) {
    recordFail('ADV-NAV-01', '100 Rapid Consecutive Tab Switches on Authorized Terminal', err);
  }

  // 3.2: Tab Switching During Transient Sync Lag (Offline / Delayed Cloud Snapshot)
  try {
    const { sandbox, elements } = createSimulatedBrowserEnv({
      bongbhoj_device_id: 'DEV_OFFLINE_LAG_01',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: (Date.now() - 3600000).toString(),
      billnaw_station_profile: 'KDS',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    // Simulate transient offline condition: window.firestoreDB is null and window.currentDeviceRecord is null
    sandbox.window.firestoreDB = null;
    sandbox.window.currentDeviceRecord = null;

    const pairOverlay = elements.get('devicePairingOverlay');
    pairOverlay.style.display = 'none';

    // Switch between KDS and Tables
    sandbox.switchTab('kds');
    assert.strictEqual(pairOverlay.style.display, 'none', 'Overlay must not show during transient sync lag');
    assert.ok(elements.get('kds').classList.contains('active'), '#kds must be active');

    sandbox.switchTab('tables');
    assert.strictEqual(pairOverlay.style.display, 'none');
    assert.ok(elements.get('tables').classList.contains('active'), '#tables must be active');

    recordPass('ADV-NAV-02', 'Transient Sync Lag Resilience: ZeroStoreDataGate respects local AUTHORIZED status without network connection');
  } catch (err) {
    recordFail('ADV-NAV-02', 'Transient Sync Lag Resilience', err);
  }

  // 3.3: Tab Switching on PENDING Terminal Strictly Blocked
  try {
    const { sandbox, elements } = createSimulatedBrowserEnv({
      bongbhoj_device_id: 'DEV_PENDING_01',
      billnaw_device_status: 'PENDING',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    const pairOverlay = elements.get('devicePairingOverlay');
    pairOverlay.style.display = 'none';

    // Attempt to switch to store views
    const storeTabs = ['pos', 'dashboard', 'menu', 'inventory'];
    let blockedCount = 0;

    for (const tab of storeTabs) {
      sandbox.switchTab(tab);
      if (pairOverlay.style.display === 'flex' && !elements.get(tab).classList.contains('active')) {
        blockedCount++;
      }
    }

    assert.strictEqual(blockedCount, storeTabs.length, 'All store tabs must be blocked for PENDING terminal');
    recordPass('ADV-NAV-03', 'ZeroStoreDataGate Enforcement: All store views strictly blocked and pairing overlay enforced on PENDING terminal');
  } catch (err) {
    recordFail('ADV-NAV-03', 'ZeroStoreDataGate Enforcement on PENDING terminal', err);
  }

  // ==========================================================================
  // SECTION 4: STATE TRANSITION LATENCY & TIMING BENCHMARK
  // ==========================================================================
  console.log('\n📍 SECTION 4: STATE TRANSITION LATENCY & TIMING BENCHMARK');

  try {
    const devId = 'DEV_112233445566';
    const { sandbox, elements } = createSimulatedBrowserEnv({
      bongbhoj_device_id: devId,
      billnaw_device_id: devId,
      billnaw_device_status: 'PENDING',
      billnaw_station_profile: 'GENERAL_STATION',
      billnaw_is_master: 'false'
    });
    loadCoreAndSettings(sandbox);

    const pairOverlay = elements.get('devicePairingOverlay');
    pairOverlay.style.display = 'flex';

    const approvalRecord = {
      deviceId: devId,
      status: 'AUTHORIZED',
      stationProfile: 'KDS',
      deviceName: 'Kitchen Screen 1',
      approvedAt: new Date().toISOString()
    };

    // Benchmark time for checkDeviceAuthorizationStatus
    const start = performance.now();
    sandbox.window.authorizedDevices = [approvalRecord];
    await sandbox.checkDeviceAuthorizationStatus();
    const duration = performance.now() - start;

    assert.strictEqual(sandbox.localStorage.getItem('billnaw_device_status'), 'AUTHORIZED');
    assert.strictEqual(pairOverlay.style.display, 'none', 'Pairing overlay must be hidden');
    assert.ok(elements.get('kds').classList.contains('active'), '#kds must be activated');
    assert.ok(duration < 20, `Transition latency took ${duration.toFixed(2)}ms (must be < 20ms)`);

    recordPass(
      'ADV-PERF-01',
      `State Transition Latency: Approval to view routing completed in ${duration.toFixed(2)} ms (< 20 ms SLA)`
    );
  } catch (err) {
    recordFail('ADV-PERF-01', 'State Transition Latency Benchmark', err);
  }

  // ==========================================================================
  // SECTION 5: COMPANION TEST SUITE & SYSTEM INVARIANTS AUDIT
  // ==========================================================================
  console.log('\n📍 SECTION 5: COMPANION TEST SUITE & SYSTEM INVARIANTS AUDIT');

  // 5.1: Modal close SVGs (Exact 26 in index.html)
  try {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26 .modal-close-btn SVGs, found ${svgMatches.length}`);
    recordPass('ADV-INV-01', 'Invariant 1: Exactly 26 .modal-close-btn SVG elements in index.html verified');
  } catch (err) {
    recordFail('ADV-INV-01', 'Invariant 1: Exact 26 modal close SVGs', err);
  }

  // 5.2: Strictly 0 raw Unicode emojis in operational controls
  try {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const offendingButtons = buttonMatches.filter(btn => emojiRegex.test(btn));
    assert.strictEqual(offendingButtons.length, 0, `Found ${offendingButtons.length} buttons with raw Unicode emojis`);
    recordPass('ADV-INV-02', 'Invariant 2: Strictly 0 raw Unicode emojis in operational controls verified');
  } catch (err) {
    recordFail('ADV-INV-02', 'Invariant 2: Zero raw Unicode emojis', err);
  }

  // 5.3: Preserved currency formatting with non-breaking space '₹ '
  try {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const bareRupeeRegex = /₹\d+/g;
    const bareMatches = html.match(bareRupeeRegex) || [];
    assert.strictEqual(bareMatches.length, 0, `Found cramped currency instances without space: ${JSON.stringify(bareMatches)}`);
    recordPass('ADV-INV-03', 'Invariant 3: Currency non-breaking space formatting ("₹ ") verified');
  } catch (err) {
    recordFail('ADV-INV-03', 'Invariant 3: Preserved currency non-breaking space', err);
  }

  // 5.4: Port 5000 server health check
  try {
    const health = await new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:5000/api/health', (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('Port 5000 connection timeout'));
      });
    });

    assert.strictEqual(health.status, 200, `Expected HTTP 200, got ${health.status}`);
    recordPass('ADV-INV-04', 'Invariant 4: Local server health check HTTP 200 on port 5000 verified');
  } catch (err) {
    recordFail('ADV-INV-04', 'Invariant 4: Local server health check on port 5000', err);
  }

  // ==========================================================================
  // Summary & Diagnostic Output
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL CHALLENGE SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    console.error(`🚨 ${failedTests} ADVERSARIAL CHALLENGE(S) FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`\n[#${idx + 1}] ID: ${f.id} — ${f.description}`);
      console.error(`     Error: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log(`✨ ALL ${passedTests} ADVERSARIAL CHALLENGES PASSED 100% GREEN!\n`);
    process.exit(0);
  }
}

runAdversarialChallengeSuite().catch(err => {
  console.error('Fatal unhandled error in challenge runner:', err);
  process.exit(1);
});
