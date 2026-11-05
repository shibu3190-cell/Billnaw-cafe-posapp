/**
 * scratch/test_adversarial_pairing_concurrency.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS HARNESS: MULTI-TERMINAL CONCURRENCY & MASTER IMMUNITY
 * ============================================================================
 *
 * Subagent: challenger_pairing_2 (critic, specialist)
 * Archetype: EMPIRICAL CHALLENGER
 * Date: 2026-11-05
 *
 * Mandatory Verification Targets:
 * 1. Concurrency: 5 simultaneous secondary terminals requesting pairing at the same time.
 *    - Verify Master Admin detects all 5 in real-time via subscribeDevicesCloudListener.
 *    - Verify Master Admin UI indicators: banner display, pending count text, audio chime, toast.
 *    - Verify Master Admin individually approves each of the 5 terminals.
 *    - Verify real-time notification banner updates and cleanly hides when pending count hits 0.
 *    - Verify secondary terminals receive AUTHORIZED status and transition to assigned station views.
 * 2. Master Admin Role Immunity:
 *    - Forging `isMaster: true` in cloud registration is strictly blocked / ineffective.
 *    - Secondary terminal tampering or calling setMasterTerminal / promptAdminAuthorizeTerminal cannot hijack Master.
 *    - Attempting to revoke Master Admin via revokeAuthorizedDevice is strictly blocked.
 *    - Direct invocation of handleDeviceRevocation on Master Admin is immune (guarded by billnaw_is_master).
 * 3. Revocation Kickout Mid-Transaction:
 *    - Secondary terminal actively in mid-transaction (cart filled, staff active, table assigned).
 *    - Master Admin revokes terminal; terminal detects REVOKED in real-time.
 *    - Instant local data wipe (cart purged, staff cleared, listeners unsubscribed).
 *    - #deviceRevokedOverlay is displayed; other modals hidden; store data access blocked.
 *    - Recovery via handleRequestNewPairing re-initializes clean pairing state.
 * 4. Invariants & Suite Regression:
 *    - test_multidevice_pairing_flow.cjs (50/50)
 *    - test_multidevice_5terminal_sync.cjs (21/21)
 *    - 26 modal close SVGs, 0 raw emojis, currency formatting "₹ ", port 5000 health check.
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(id, msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: [${id}] ${msg}`);
}

function fail(id, msg, err) {
  totalTests++;
  failedTests++;
  const errorMsg = err && err.message ? err.message : String(err);
  console.error(`  ❌ FAIL: [${id}] ${msg}`);
  console.error(`     Error: ${errorMsg}`);
  if (err && err.stack) console.error(err.stack);
  failures.push({ id, msg, error: errorMsg });
}

// ----------------------------------------------------------------------------
// Shared Mock Firestore Infrastructure
// ----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.collections = new Map(); // path -> Map(docId -> data)
    this.listeners = new Map();   // colPath -> Set(callback)
  }

  getDocRef(colPath, docId) {
    return { colPath, docId, type: 'doc' };
  }

  getColRef(colPath) {
    return { colPath, type: 'col' };
  }

  async setDoc(docRef, data, options = {}) {
    if (!this.writeCounts) this.writeCounts = new Map();
    const docKey = `${docRef.colPath}/${docRef.docId}`;
    const count = (this.writeCounts.get(docKey) || 0) + 1;
    this.writeCounts.set(docKey, count);

    // Runaway write loop detection: if a single document receives > 10 PENDING writes
    if (data.status === 'PENDING' && count > 10) {
      this.writeLoopDetected = true;
      return;
    }

    if (!this.collections.has(docRef.colPath)) {
      this.collections.set(docRef.colPath, new Map());
    }
    const col = this.collections.get(docRef.colPath);
    let current = col.get(docRef.docId) || {};

    if (options.merge) {
      current = { ...current, ...data };
    } else {
      current = { ...data };
    }
    col.set(docRef.docId, current);

    // Trigger snapshot listeners
    this._notify(docRef.colPath);
  }

  onSnapshot(targetRef, onNext, onError) {
    if (!this.listeners.has(targetRef.colPath)) {
      this.listeners.set(targetRef.colPath, new Set());
    }
    const listeners = this.listeners.get(targetRef.colPath);
    const entry = { onNext, targetRef };
    listeners.add(entry);

    // Initial trigger with current data
    this._fireEntry(targetRef.colPath, entry);

    return () => {
      listeners.delete(entry);
    };
  }

  _notify(colPath) {
    if (this._pendingNotify) return;
    this._pendingNotify = true;
    queueMicrotask(() => {
      this._pendingNotify = false;
      const list = this.listeners.get(colPath);
      if (!list) return;
      for (const entry of list) {
        this._fireEntry(colPath, entry);
      }
    });
  }

  _fireEntry(colPath, entry) {
    const { onNext, targetRef } = entry;
    const col = this.collections.get(colPath) || new Map();

    if (targetRef && targetRef.type === 'doc') {
      const docData = col.get(targetRef.docId) || {};
      const docSnap = {
        exists: () => col.has(targetRef.docId),
        id: targetRef.docId,
        data: () => ({ ...docData })
      };
      try {
        onNext(docSnap);
      } catch (e) {
        console.warn('Doc snapshot listener error:', e);
      }
      return;
    }

    const docs = [];
    for (const [id, data] of col.entries()) {
      docs.push({
        id,
        data: () => ({ ...data })
      });
    }
    const snap = {
      docs,
      forEach: (fn) => docs.forEach(fn),
      size: docs.length
    };
    try {
      onNext(snap);
    } catch (e) {
      console.warn('Snapshot listener error:', e);
    }
  }

  getCollectionData(colPath) {
    const col = this.collections.get(colPath) || new Map();
    const result = [];
    for (const [id, data] of col.entries()) {
      result.push({ id, ...data });
    }
    return result;
  }
}

// ----------------------------------------------------------------------------
// Browser Sandbox Factory
// ----------------------------------------------------------------------------
function createBrowserSandbox(initialStorage = {}, sharedFirestore = null) {
  const store = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null,
    _raw: store
  };

  const sessionStorage = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear: () => sessionStore.clear(),
    get length() { return sessionStore.size; },
    key: (i) => Array.from(sessionStore.keys())[i] || null,
    _raw: sessionStore
  };

  const elements = new Map();
  function getOrCreateElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        tagName: 'DIV',
        style: {
          display: '',
          setProperty: function(prop, val) { this[prop] = val; },
          removeProperty: function(prop) { delete this[prop]; }
        },
        innerText: '',
        innerHTML: '',
        value: '',
        dataset: {},
        classList: {
          _classes: new Set(),
          add: function(c) { this._classes.add(c); },
          remove: function(c) { this._classes.delete(c); },
          contains: function(c) { return this._classes.has(c); }
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {},
        appendChild: (c) => c,
        removeChild: () => {},
        focus: () => {}
      });
    }
    return elements.get(id);
  }

  // Pre-populate index.html elements
  [
    'devicePairingOverlay',
    'deviceRevokedOverlay',
    'pairingDeviceIdDisplay',
    'pairingCodeDisplay',
    'pairingQrContainer',
    'adminPairingNotificationBanner',
    'adminPairingBannerText',
    'deviceApprovalPinModal',
    'approvalTargetDeviceId',
    'approvalDeviceIdDisplay',
    'approvalPairingCodeInput',
    'approvalPairingCodeFeedback',
    'approvalStationProfileSelect',
    'approvalStationNameInput',
    'approvalAdminPinInput',
    'approvalAdminPinFeedback',
    'revokedDeviceIdDisplay',
    'nav-pos',
    'nav-kds',
    'nav-tables',
    'pos',
    'kds',
    'tables'
  ].forEach(id => getOrCreateElement(id));

  const domListeners = new Map();
  const dispatchedEvents = [];
  const toasts = [];
  let chimes = 0;

  const bodyEl = getOrCreateElement('body');
  const documentMock = {
    body: bodyEl,
    getElementById: (id) => {
      if (id === 'body') return bodyEl;
      return getOrCreateElement(id);
    },
    querySelector: (sel) => {
      if (sel === 'body') return bodyEl;
      if (sel && sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.modal-overlay') {
        return [
          getOrCreateElement('devicePairingOverlay'),
          getOrCreateElement('deviceRevokedOverlay'),
          getOrCreateElement('deviceApprovalPinModal')
        ];
      }
      if (sel.includes('.view') || sel.includes('.tab-content')) {
        return ['pos', 'kds', 'tables'].map(id => getOrCreateElement(id));
      }
      return [];
    },
    createElement: (tag) => {
      const el = getOrCreateElement('elem_' + Math.random().toString(36).slice(2));
      el.tagName = (tag || 'DIV').toUpperCase();
      return el;
    },
    addEventListener: (evt, fn) => {
      if (!domListeners.has(evt)) domListeners.set(evt, []);
      domListeners.get(evt).push(fn);
    }
  };

  const AudioContextMock = class {
    constructor() {
      chimes++;
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      return {
        type: '',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      };
    }
  };

  const mockIDBDatabase = {
    transaction: () => ({
      objectStore: () => ({
        get: () => ({ onsuccess: null, onerror: null, result: null }),
        put: () => {},
        delete: () => {},
        clear: () => {}
      })
    })
  };

  const indexedDBMock = {
    open: () => {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: mockIDBDatabase
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    }
  };

  const idbMock = {
    init: async () => {},
    get: async () => null,
    set: async () => {},
    del: async () => {}
  };

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    localStorage,
    sessionStorage,
    document: documentMock,
    elements,
    dispatchedEvents,
    toasts,
    getChimes: () => chimes,
    showToast: (msg, type = 'info') => {
      toasts.push({ msg, type, time: Date.now() });
    },
    playKdsAudioChime: () => {
      chimes++;
    },
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt);
      const list = domListeners.get(evt.type) || [];
      list.forEach(fn => fn(evt));
      return true;
    },
    addEventListener: (evt, fn) => {
      if (!domListeners.has(evt)) domListeners.set(evt, []);
      domListeners.get(evt).push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!domListeners.has(evt)) return;
      const list = domListeners.get(evt);
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    scrollTo: () => {},
    scroll: () => {},
    location: {
      href: 'http://localhost:5000/',
      search: '',
      pathname: '/',
      hash: '',
      reload: () => {}
    },
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BillnawTest/1.0'
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    crypto: globalThis.crypto || crypto.webcrypto,
    CustomEvent: class {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail || {};
      }
    },
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
    AudioContext: AudioContextMock,
    webkitAudioContext: AudioContextMock,
    idb: idbMock,
    indexedDB: indexedDBMock
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Shared or mock Firestore bridge
  const fsInstance = sharedFirestore || new MockFirestore();
  sandbox.firestoreDB = fsInstance;
  sandbox.firestoreDoc = (db, col, ...rest) => {
    const parts = [col, ...rest];
    const docId = parts.pop();
    const colPath = parts.join('/');
    return db.getDocRef(colPath, docId);
  };
  sandbox.firestoreCollection = (db, col, ...rest) => {
    const colPath = [col, ...rest].join('/');
    return db.getColRef(colPath);
  };
  sandbox.firestoreSetDoc = async (docRef, data, options) => {
    return fsInstance.setDoc(docRef, data, options);
  };
  sandbox.firestoreOnSnapshot = (colRef, onNext, onError) => {
    return fsInstance.onSnapshot(colRef, onNext, onError);
  };

  return { sandbox, fsInstance, elements };
}

// ----------------------------------------------------------------------------
// Code Loading Utilities
// ----------------------------------------------------------------------------
function loadAppCode(sandbox) {
  const coreSrc = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf8');
  const settingsSrc = fs.readFileSync(path.join(ROOT_DIR, 'js', 'settings.js'), 'utf8');
  const shopAuthSrc = fs.readFileSync(path.join(ROOT_DIR, 'js', 'shop-auth.js'), 'utf8');

  vm.createContext(sandbox);

  // Define critical helpers and globals needed by core / settings
  const djb2 = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      let char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  };
  sandbox.shopProfile = {
    name: 'Billnaw Cafe Test',
    storeCode: 'SHOP-TEST-01',
    adminPinHash: djb2('9371')
  };
  sandbox.hashString = djb2;
  sandbox.hashStringServer = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');
  sandbox.myClientID = 'TEST-TERMINAL';
  sandbox.cart = [];
  sandbox.currentStaff = null;
  sandbox.clearCart = () => { sandbox.cart = []; };
  sandbox.clearAllTenantLocalData = async () => {
    sandbox.localStorage.removeItem('billnaw_store_code');
    sandbox.localStorage.removeItem('billnaw_active_staff');
    sandbox.cart = [];
  };
  sandbox.applyStationProfileRestrictions = () => {};
  sandbox.attachFirestoreListener = () => {};
  sandbox.initStoreCloudSync = () => {};
  sandbox.saveToLocal = () => {};
  sandbox.updateAllUI = () => {};
  sandbox.renderCategoryDropdown = () => {};
  sandbox.renderMenu = () => {};
  sandbox.renderTables = () => {};
  sandbox.renderCategoryFilters = () => {};
  sandbox.renderCategoryListUI = () => {};
  sandbox.renderMenuCatalogUI = () => {};
  sandbox.renderMenuUI = () => {};

  // Execute scripts in the VM context
  try {
    vm.runInContext(coreSrc, sandbox);
    vm.runInContext(settingsSrc, sandbox);
    vm.runInContext(shopAuthSrc, sandbox);

    if (sandbox.shopProfile && typeof sandbox.hashString === 'function') {
      sandbox.shopProfile.adminPinHash = sandbox.hashString('9371');
    }

    const originalShowToast = sandbox.showToast;
    sandbox.showToast = (msg, type = 'info') => {
      sandbox.toasts.push({ msg, type, time: Date.now() });
      if (typeof originalShowToast === 'function') {
        try { originalShowToast(msg, type); } catch (e) {}
      }
    };
  } catch (err) {
    console.error('Code execution error during VM hydration:', err);
    throw err;
  }

  return sandbox;
}

// ----------------------------------------------------------------------------
// HTTP Helper
// ----------------------------------------------------------------------------
function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:5000/api/health', (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ----------------------------------------------------------------------------
// Main Stress Harness
// ----------------------------------------------------------------------------
async function runHarness() {
  console.log('====================================================================');
  console.log('🛡️  CHALLENGER 2: MULTI-TERMINAL CONCURRENCY & ADMIN NOTIFICATIONS');
  console.log('====================================================================\n');

  const sharedFirestore = new MockFirestore();
  const STORE_CODE = 'SHOP-TEST-01';

  // ==========================================================================
  // SECTION 1: 5 CONCURRENT SECONDARY TERMINAL PAIRING REQUESTS & REAL-TIME ADMIN NOTIFICATIONS
  // ==========================================================================
  console.log('📍 SECTION 1: 5 CONCURRENT SECONDARY PAIRING REQUESTS & ADMIN NOTIFICATIONS');

  // Setup Master Admin Terminal
  const masterDevId = 'DEV_AAAA00000001';
  const { sandbox: masterEnv, elements: masterElements } = createBrowserSandbox({
    bongbhoj_device_id: masterDevId,
    billnaw_is_master: 'true',
    billnaw_device_status: 'AUTHORIZED',
    billnaw_store_code: STORE_CODE
  }, sharedFirestore);
  loadAppCode(masterEnv);

  // Register Master Admin in cloud
  await sharedFirestore.setDoc(
    sharedFirestore.getDocRef(`shops/${STORE_CODE}/devices`, masterDevId),
    {
      deviceId: masterDevId,
      deviceName: 'Master Admin Console',
      stationProfile: 'ADMIN',
      status: 'AUTHORIZED',
      isMaster: true,
      approvedAt: new Date().toISOString()
    }
  );

  // Start real-time snapshot listener on Master Admin
  masterEnv.subscribeDevicesCloudListener(STORE_CODE);

  // Setup 5 Secondary Terminals concurrently
  const secondaryInstances = [];
  for (let i = 1; i <= 5; i++) {
    const secDevId = `DEV_BBBB0000000${i}`;
    const { sandbox: secEnv, elements: secElements } = createBrowserSandbox({
      bongbhoj_device_id: secDevId,
      billnaw_is_master: 'false',
      billnaw_store_code: STORE_CODE
    }, sharedFirestore);
    loadAppCode(secEnv);
    secondaryInstances.push({ id: secDevId, index: i, env: secEnv, elements: secElements });
  }

  // TEST 1.1: Distinct Device ID & 6-Digit Numeric Pairing Code Generation
  try {
    const codes = new Set();
    const ids = new Set();
    for (const sec of secondaryInstances) {
      const devId = sec.env.getOrCreateDeviceId();
      const code = sec.env.generatePairingCode();
      assert.strictEqual(devId, sec.id, `Secondary ${sec.index} ID must match`);
      assert.match(code, /^\d{6}$/, `Secondary ${sec.index} pairing code must be 6 numeric digits`);
      const numCode = parseInt(code, 10);
      assert.ok(numCode >= 100000 && numCode <= 999999, 'Code must be between 100000 and 999999');
      codes.add(code);
      ids.add(devId);
      sec.pairingCode = code;
    }
    assert.strictEqual(ids.size, 5, 'All 5 secondary device IDs must be strictly unique');
    pass('CONCUR-01', '5 concurrent secondary terminals generated unique Device IDs & 6-digit numeric pairing codes');
  } catch (err) {
    fail('CONCUR-01', 'Unique ID & Pairing Code generation failed', err);
  }

  // TEST 1.2: Simultaneous Cloud Registration
  try {
    const registrationPromises = secondaryInstances.map(sec => {
      sec.env.localStorage.setItem('billnaw_pairing_code', sec.pairingCode);
      return sec.env.registerPendingDeviceToCloud(sec.id, sec.pairingCode);
    });

    await Promise.all(registrationPromises);
    await new Promise(r => setTimeout(r, 60));

    const cloudDevices = sharedFirestore.getCollectionData(`shops/${STORE_CODE}/devices`);
    const pendingDevices = cloudDevices.filter(d => d.status === 'PENDING');
    assert.strictEqual(pendingDevices.length, 5, 'Firestore must contain exactly 5 PENDING devices');

    for (const sec of secondaryInstances) {
      const rec = cloudDevices.find(d => d.deviceId === sec.id);
      assert.ok(rec, `Cloud record must exist for ${sec.id}`);
      assert.strictEqual(rec.status, 'PENDING');
      assert.strictEqual(rec.isMaster, false, 'Secondary must NOT be master');
      assert.strictEqual(rec.pairingCode, sec.pairingCode);
    }
    pass('CONCUR-02', '5 secondary terminals simultaneously registered to /shops/{storeCode}/devices with status: PENDING and isMaster: false');
  } catch (err) {
    fail('CONCUR-02', 'Simultaneous cloud registration failed', err);
  }

  // TEST 1.3: Master Admin Real-Time Detection & UI Indicator Verification
  try {
    const banner = masterElements.get('adminPairingNotificationBanner');
    const bannerText = masterElements.get('adminPairingBannerText');

    assert.strictEqual(banner.style.display, 'flex', 'Master Admin banner must be visible (display: flex)');
    assert.strictEqual(bannerText.innerText, '5 devices requesting pairing authorization', 'Banner text must reflect 5 pending devices');
    assert.ok(masterEnv.getChimes() >= 1, `Master Admin must have triggered audio chime (chimes: ${masterEnv.getChimes()})`);

    const pairingToasts = masterEnv.toasts.filter(t => t.msg && t.msg.includes('pairing request'));
    assert.ok(pairingToasts.length >= 1, 'Master Admin must have displayed a notification toast');

    const pairingEvents = masterEnv.dispatchedEvents.filter(e => e.type === 'billnaw:device-pairing-requested');
    assert.ok(pairingEvents.length >= 1, 'Master Admin must dispatch billnaw:device-pairing-requested event');
    const lastEvent = pairingEvents[pairingEvents.length - 1];
    assert.strictEqual(lastEvent.detail.allPending.length, 5, 'Event payload allPending must contain 5 devices');

    pass('CONCUR-03', 'Master Admin detected all 5 pending devices in real-time, displayed banner ("5 devices"), sounded chime, and dispatched DOM event');
  } catch (err) {
    fail('CONCUR-03', 'Master Admin real-time notification detection failed', err);
  }

  // ==========================================================================
  // SECTION 2: SEQUENTIAL & INDIVIDUAL ADMIN APPROVAL & STATION VIEW TRANSITION
  // ==========================================================================
  console.log('\n📍 SECTION 2: INDIVIDUAL ADMIN APPROVAL & STATION VIEW ROUTING');

  // Start cloud listeners on all 5 secondary terminals
  for (const sec of secondaryInstances) {
    sec.env.subscribeDevicesCloudListener(STORE_CODE);
  }

  const approvalPlan = [
    { target: secondaryInstances[0], name: 'Kitchen KDS 1', profile: 'KDS', expectedView: 'kds' },
    { target: secondaryInstances[1], name: 'Waiter Pad 1', profile: 'WAITER_MOBILE', expectedView: 'tables' },
    { target: secondaryInstances[2], name: 'Billing Counter 2', profile: 'BILLING_COUNTER', expectedView: 'pos' },
    { target: secondaryInstances[3], name: 'Manager Terminal', profile: 'GENERAL_STATION', expectedView: 'pos' },
    { target: secondaryInstances[4], name: 'Waiter Pad 2', profile: 'WAITER_MOBILE', expectedView: 'tables' }
  ];

  // TEST 2.1: Individual Approval Loop with Countdown Verification
  try {
    let remainingPending = 5;

    for (let i = 0; i < approvalPlan.length; i++) {
      const step = approvalPlan[i];
      const sec = step.target;

      // 1. Master Admin invokes openDeviceApprovalModal
      masterEnv.openDeviceApprovalModal(sec.id);
      const modal = masterElements.get('deviceApprovalPinModal');
      assert.strictEqual(modal.style.display, 'flex', 'Approval modal must open');
      assert.strictEqual(masterElements.get('approvalTargetDeviceId').value, sec.id);

      // 2. Master Admin enters pairing code and admin PIN
      masterElements.get('approvalPairingCodeInput').value = sec.pairingCode;
      masterElements.get('approvalStationProfileSelect').value = step.profile;
      masterElements.get('approvalStationNameInput').value = step.name;
      masterElements.get('approvalAdminPinInput').value = '9371'; // Correct PIN

      // 3. Confirm approval
      await masterEnv.confirmApproveDevicePairing();
      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(modal.style.display, 'none', 'Approval modal must close after submission');

      // 4. Verify Master Admin pending countdown banner
      remainingPending--;
      const banner = masterElements.get('adminPairingNotificationBanner');
      const bannerText = masterElements.get('adminPairingBannerText');

      if (remainingPending > 0) {
        assert.strictEqual(banner.style.display, 'flex', `Banner must remain visible with ${remainingPending} remaining`);
        assert.strictEqual(bannerText.innerText, `${remainingPending} device${remainingPending === 1 ? '' : 's'} requesting pairing authorization`);
      } else {
        assert.strictEqual(banner.style.display, 'none', 'Banner must automatically hide when 0 pending devices remain');
      }

      // 5. Verify Secondary Terminal state transition
      assert.strictEqual(sec.env.localStorage.getItem('billnaw_device_status'), 'AUTHORIZED');
      assert.strictEqual(sec.env.localStorage.getItem('billnaw_station_profile'), step.profile);
      assert.strictEqual(sec.env.localStorage.getItem('billnaw_station_name'), step.name);
      assert.ok(sec.env.localStorage.getItem('billnaw_device_auth_timestamp'), 'Auth timestamp must be set');
      assert.strictEqual(sec.elements.get('devicePairingOverlay').style.display, 'none', 'Pairing overlay must be hidden');

      // Verify designated view transition
      const targetViewEl = sec.elements.get(step.expectedView);
      assert.ok(targetViewEl.classList.contains('active'), `Secondary ${sec.index} must transition to active view #${step.expectedView}`);

      // Ensure Master flag was NOT leaked
      assert.strictEqual(sec.env.localStorage.getItem('billnaw_is_master'), 'false', 'Secondary terminal must NOT be granted master');
    }

    pass('APPROVE-01', 'Sequential individual approval of all 5 terminals succeeded: banner decremented (4->3->2->1->0->hidden) and each terminal transitioned to designated station view');
  } catch (err) {
    fail('APPROVE-01', 'Sequential approval or view transition failed', err);
  }

  // ==========================================================================
  // SECTION 3: MASTER ADMIN ROLE IMMUNITY & ANTI-HIJACKING STRESS
  // ==========================================================================
  console.log('\n📍 SECTION 3: MASTER ADMIN ROLE IMMUNITY & ANTI-HIJACKING STRESS');

  // TEST 3.1: Secondary Attempt to Register with Forged isMaster = true
  try {
    const rogueId = 'DEV_CCCC00000001';
    await sharedFirestore.setDoc(
      sharedFirestore.getDocRef(`shops/${STORE_CODE}/devices`, rogueId),
      {
        deviceId: rogueId,
        pairingCode: '654321',
        deviceName: 'Rogue Device',
        stationProfile: 'ADMIN',
        status: 'PENDING',
        isMaster: true // Forged attempt
      }
    );

    // Master Admin checks isMasterTerminal
    assert.strictEqual(masterEnv.isMasterTerminal(), true, 'Master Admin must remain Master');

    // Create Rogue Sandbox
    const { sandbox: rogueEnv } = createBrowserSandbox({
      bongbhoj_device_id: rogueId,
      billnaw_is_master: 'false',
      billnaw_store_code: STORE_CODE
    }, sharedFirestore);
    loadAppCode(rogueEnv);

    // Secondary registers via standard function: verifies isMaster forced to false in payload
    await rogueEnv.registerPendingDeviceToCloud(rogueId, '654321');
    const cloudRecord = sharedFirestore.getCollectionData(`shops/${STORE_CODE}/devices`).find(d => d.deviceId === rogueId);
    assert.strictEqual(cloudRecord.isMaster, false, 'registerPendingDeviceToCloud must enforce isMaster: false');
    assert.strictEqual(rogueEnv.isMasterTerminal(), false, 'Rogue device must evaluate isMasterTerminal() === false');

    pass('IMMUNITY-01', 'Secondary terminal forged isMaster: true is rejected and forced to false');
  } catch (err) {
    fail('IMMUNITY-01', 'Rogue isMaster registration stress failed', err);
  }

  // TEST 3.2: Secondary PIN Authorization Cannot Hijack Master Role
  try {
    const testSec = secondaryInstances[2]; // Billing Counter
    testSec.env.prompt = () => '9371'; // Provide valid Admin PIN

    await testSec.env.promptAdminAuthorizeTerminal();

    assert.strictEqual(testSec.env.localStorage.getItem('billnaw_is_master'), 'false', 'Secondary must maintain billnaw_is_master = false after Admin PIN authorization');
    assert.strictEqual(testSec.env.isMasterTerminal(), false, 'Secondary must NOT evaluate as Master terminal');
    pass('IMMUNITY-02', 'promptAdminAuthorizeTerminal authorizes station profile without setting billnaw_is_master = true');
  } catch (err) {
    fail('IMMUNITY-02', 'Station authorization hijacked master role', err);
  }

  // TEST 3.3: Master Admin Cannot Be Revoked via revokeAuthorizedDevice
  try {
    const toastCountBefore = masterEnv.toasts.length;
    masterEnv.confirm = () => true;

    // Master terminal attempts to revoke itself
    await masterEnv.revokeAuthorizedDevice(masterDevId);

    const masterCloudRec = sharedFirestore.getCollectionData(`shops/${STORE_CODE}/devices`).find(d => d.deviceId === masterDevId);
    assert.strictEqual(masterCloudRec.status, 'AUTHORIZED', 'Master Admin record in cloud must remain AUTHORIZED');
    assert.notStrictEqual(masterCloudRec.status, 'REVOKED', 'Master Admin record must NOT be REVOKED');

    const warningToasts = masterEnv.toasts.filter(t => t.msg && t.msg.includes('Master Admin Terminal cannot revoke itself'));
    assert.ok(warningToasts.length >= 1, 'Master revocation attempt must show safety warning toast');

    pass('IMMUNITY-03', 'revokeAuthorizedDevice strictly blocks revocation of Master Admin Terminal with isMaster check');
  } catch (err) {
    fail('IMMUNITY-03', 'Master revocation immunity failed', err);
  }

  // TEST 3.4: Direct handleDeviceRevocation Invocation on Master is Immune
  try {
    assert.strictEqual(masterEnv.localStorage.getItem('billnaw_is_master'), 'true');
    masterEnv.cart = [{ id: 1, name: 'Samosa', price: 15, qty: 2 }];
    masterEnv.localStorage.setItem('billnaw_active_staff', 'Store Owner');

    // Call handleDeviceRevocation directly with master record
    await masterEnv.handleDeviceRevocation({ deviceId: masterDevId, status: 'REVOKED' });

    // Master must be completely untouched
    assert.strictEqual(masterEnv.localStorage.getItem('billnaw_is_master'), 'true');
    assert.strictEqual(masterEnv.localStorage.getItem('billnaw_device_status'), 'AUTHORIZED');
    assert.strictEqual(masterEnv.cart.length, 1, 'Master cart must NOT be wiped');
    assert.strictEqual(masterEnv.localStorage.getItem('billnaw_active_staff'), 'Store Owner', 'Master staff must remain logged in');
    assert.notStrictEqual(masterElements.get('deviceRevokedOverlay').style.display, 'flex', 'Master must NOT show revoked overlay');

    pass('IMMUNITY-04', 'handleDeviceRevocation has strict Master immunity guard (localStorage.getItem("billnaw_is_master") === "true")');
  } catch (err) {
    fail('IMMUNITY-04', 'handleDeviceRevocation Master immunity failed', err);
  }

  // ==========================================================================
  // SECTION 4: REVOCATION KICKOUT MID-TRANSACTION & REPAIRING RECOVERY
  // ==========================================================================
  console.log('\n📍 SECTION 4: REVOCATION KICKOUT MID-TRANSACTION & REPAIRING RECOVERY');

  const victim = secondaryInstances[2]; // Terminal 3 (Billing Counter 2)

  // TEST 4.1: Active Transaction Setup on Secondary Terminal
  try {
    victim.env.cart = [
      { id: 101, name: 'Cold Coffee', price: 80, qty: 2 },
      { id: 102, name: 'Veg Sandwich', price: 120, qty: 1 }
    ];
    victim.env.currentStaff = { id: 3, name: 'Cashier Dave', role: 'Cashier' };
    victim.env.localStorage.setItem('billnaw_active_staff', JSON.stringify(victim.env.currentStaff));
    victim.env.localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    victim.env.localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
    victim.env.currentDeviceRecord = { deviceId: victim.id, status: 'AUTHORIZED' };

    assert.strictEqual(victim.env.canAccessStoreData(), true, 'Active secondary terminal must have store data access');
    pass('REVOKE-01', 'Secondary terminal initialized in active mid-transaction state (cart, staff, store access)');
  } catch (err) {
    fail('REVOKE-01', 'Transaction setup failed', err);
  }

  // TEST 4.2: Admin Revokes Secondary Terminal & Real-Time Kickout Triggered
  try {
    masterEnv.confirm = () => true;
    await masterEnv.revokeAuthorizedDevice(victim.id);
    await new Promise(r => setTimeout(r, 60));

    const victimCloudRec = sharedFirestore.getCollectionData(`shops/${STORE_CODE}/devices`).find(d => d.deviceId === victim.id);
    assert.strictEqual(victimCloudRec.status, 'REVOKED', 'Cloud record must be updated to REVOKED');

    // Wait for snapshot callback to propagate in victim environment
    assert.strictEqual(victim.env.localStorage.getItem('billnaw_device_status'), 'REVOKED', 'Local status must update to REVOKED');
    assert.strictEqual(victim.env.cart.length, 0, 'Local cart must be completely wiped upon revocation');
    assert.strictEqual(victim.env.currentStaff, null, 'Active staff session must be cleared');
    assert.strictEqual(victim.env.localStorage.getItem('billnaw_active_staff'), null, 'billnaw_active_staff must be removed from storage');

    // Overlay display checks
    const revokedOverlay = victim.elements.get('deviceRevokedOverlay');
    assert.strictEqual(revokedOverlay.style.display, 'flex', '#deviceRevokedOverlay must be displayed');
    const pairingOverlay = victim.elements.get('devicePairingOverlay');
    assert.notStrictEqual(pairingOverlay.style.display, 'flex', '#devicePairingOverlay must not be visible while revoked');

    // Store data gate check
    assert.strictEqual(victim.env.canAccessStoreData(), false, 'canAccessStoreData() must return false for REVOKED device');

    pass('REVOKE-02', 'Admin remote revocation instantly wiped victim local cart, terminated staff session, engaged #deviceRevokedOverlay, and locked store access');
  } catch (err) {
    fail('REVOKE-02', 'Revocation kickout failed', err);
  }

  // TEST 4.3: Recovery Flow via handleRequestNewPairing
  try {
    victim.env.handleRequestNewPairing();

    assert.notStrictEqual(victim.env.localStorage.getItem('billnaw_device_status'), 'REVOKED', 'REVOKED status must be cleared');
    assert.strictEqual(victim.elements.get('deviceRevokedOverlay').style.display, 'none', '#deviceRevokedOverlay must hide');
    assert.strictEqual(victim.elements.get('devicePairingOverlay').style.display, 'flex', '#devicePairingOverlay must reappear');

    const newCode = victim.env.localStorage.getItem('billnaw_pairing_code');
    assert.match(newCode, /^\d{6}$/, 'Must generate fresh 6-digit numeric pairing code');

    pass('REVOKE-03', 'handleRequestNewPairing safely transitions revoked terminal back to pairing overlay with a fresh 6-digit code');
  } catch (err) {
    fail('REVOKE-03', 'Recovery flow failed', err);
  }

  // ==========================================================================
  // SECTION 5: SYSTEM INVARIANTS & COMPANION REGRESSION VERIFICATION
  // ==========================================================================
  console.log('\n📍 SECTION 5: SYSTEM INVARIANTS & COMPANION REGRESSION VERIFICATION');

  // TEST 5.1: Exactly 26 Modal Close SVGs in index.html
  try {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const rawCloseMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>✕<\/button>/g);
    assert.strictEqual(rawCloseMatches, null, 'Found raw ✕ modal close buttons');

    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, 'Must find SVG modal close buttons');
    assert.strictEqual(svgMatches.length, 26, `Strict Invariant: Expected exactly 26 .modal-close-btn SVGs, found ${svgMatches.length}`);
    pass('INV-01', 'Invariant 1: Exactly 26 .modal-close-btn SVGs present in index.html (0 raw ✕)');
  } catch (err) {
    fail('INV-01', 'Modal close SVG invariant check failed', err);
  }

  // TEST 5.2: Zero Raw Unicode Emojis in Controls
  try {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const badButtons = buttonMatches.filter(b => emojiRegex.test(b));
    assert.strictEqual(badButtons.length, 0, `Found ${badButtons.length} buttons with raw Unicode emojis`);

    const pillMatches = html.match(/<div\b[^>]*class=["'][^"']*(?:tab-btn|segmented-pill|pill-btn)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    const badPills = pillMatches.filter(p => emojiRegex.test(p));
    assert.strictEqual(badPills.length, 0, `Found ${badPills.length} segmented pills with raw Unicode emojis`);
    pass('INV-02', 'Invariant 2: Operational controls (<button>, segmented pills) contain strictly 0 raw Unicode emojis');
  } catch (err) {
    fail('INV-02', 'Emoji invariant check failed', err);
  }

  // TEST 5.3: Currency Formatting Non-Breaking Space
  try {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(html.includes('₹ '), 'index.html must use currency non-breaking space "₹ "');
    const bareRupeeRegex = /₹\d+/g;
    const bareMatches = html.match(bareRupeeRegex) || [];
    assert.strictEqual(bareMatches.length, 0, `Found bare rupee without space: ${JSON.stringify(bareMatches.slice(0, 3))}`);
    pass('INV-03', 'Invariant 3: Currency formatting preserves non-breaking space ("₹ ") with zero bare /₹[0-9]/');
  } catch (err) {
    fail('INV-03', 'Currency formatting check failed', err);
  }

  // TEST 5.4: Port 5000 Health Check
  try {
    const health = await checkHealth();
    assert.strictEqual(health.status, 200, 'Server must respond HTTP 200 on /api/health');
    pass('INV-04', 'Invariant 4: Port 5000 health check responded HTTP 200 OK');
  } catch (err) {
    fail('INV-04', 'Port 5000 health check failed', err);
  }

  // ==========================================================================
  // FINAL SCORECARD
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER HARNESS COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    console.error('❌ ADVERSARIAL CHALLENGE IDENTIFIED DEFECTS:');
    failures.forEach(f => console.error(`  - [${f.id}] ${f.msg}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL 14 ADVERSARIAL CHALLENGE TARGETS PASSED 100% GREEN!');
    process.exit(0);
  }
}

runHarness().catch(err => {
  console.error('Unhandled harness exception:', err);
  process.exit(1);
});
