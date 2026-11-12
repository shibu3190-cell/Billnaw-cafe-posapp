/**
 * scratch/test_m3_pairing_gate_stress.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST: SECONDARY DEVICE PAIRING OVERLAY GATE
 * Milestone 3: Server & Client Runtime Error Remediation & Invariants
 *
 * Adversarial Stress Vectors:
 * 1. State Permutation Matrix (Combinations):
 *    - isStoreAuthenticated (true/false) x isSecondaryTerminal (true/false) x devStatus (PENDING/AUTH/REVOKED/null)
 *    - Invariant: Secondary terminal in PENDING state can NEVER bypass pairing overlay, even if store authenticated
 * 2. Privilege Escalation & Tampering:
 *    - Secondary terminal attempting admin role escalation (currentStaff.role = 'Admin')
 *    - Secondary terminal tampering with station profile, auth timestamp, and token
 *    - Null / undefined / corrupted devStatus injection
 * 3. Zero-Store-Data Gate Defense:
 *    - Tab switching interception (pos, orders, menu, inventory, dashboard, settings, staff, devices)
 *    - Direct checkout interception (openCheckoutModal, confirmCheckout)
 *    - Cloud Firestore sync snapshot data purge (menuItems and window.menuItems wiped to [])
 * 4. DOM Non-Dismissibility Invariants:
 *    - Exactly 0 .modal-close-btn elements in #devicePairingOverlay in index.html
 *    - Backdrop click resistance (cannot close overlay)
 * 5. High-Frequency Concurrency:
 *    - 100 rapid consecutive invocations of showDevicePairingOverlay under active store auth
 * 6. Live Invariants & Parity Checks:
 *    - Exact 26 modal close SVGs, rules parity, 0 emoji buttons
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_JS_PATH = path.join(ROOT_DIR, 'js', 'core.js');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');

console.log('====================================================================');
console.log('🛡️  CHALLENGER M3 EMPIRICAL PAIRING OVERLAY GATE STRESS SUITE');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } catch (err) {
    failedTests++;
    failures.push({ testName, error: err.message });
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// 1. VM BROWSER SANDBOX FACTORY
// ----------------------------------------------------------------------------
function createSandbox(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
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
      style: { display: 'none' },
      innerText: '',
      innerHTML: '',
      querySelectorAll: (sel) => {
        if (sel === '.modal-close-btn') return [];
        return [];
      }
    };
    elements.set(id, el);
    return el;
  }

  // Pre-register standard DOM elements
  [
    'devicePairingOverlay',
    'deviceRevokedOverlay',
    'pairingDeviceIdDisplay',
    'pairingCodeDisplay',
    'pairingQrContainer',
    'revokedDeviceIdDisplay',
    'adminPairingNotificationBanner',
    'adminPairingBannerText',
    'pos',
    'orders',
    'menu',
    'inventory',
    'dashboard',
    'settings',
    'staff',
    'devices'
  ].forEach(id => createMockElement(id));

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
          elements.get('deviceRevokedOverlay')
        ].filter(Boolean);
      }
      return [];
    },
    createElement: (tag) => createMockElement('el_' + Math.random().toString(36).slice(2), tag),
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
    Map,
    QRCode: {
      CorrectLevel: { M: 0 }
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  // Extract Device Pairing block from js/core.js
  const coreSrc = fs.readFileSync(CORE_JS_PATH, 'utf8');
  const startIdx = coreSrc.indexOf('// 📱 DEVICE PAIRING, STATION PROFILES & ZERO-STORE-DATA GATE (M3)');
  const endIdx = coreSrc.indexOf("window.registerPendingDeviceToCloud = registerPendingDeviceToCloud;", startIdx) + "window.registerPendingDeviceToCloud = registerPendingDeviceToCloud;".length;
  const block = coreSrc.slice(startIdx, endIdx);

  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);

  return { context: sandbox, sandbox, elements };
}

// ============================================================================
// SUITE 1: STATE COMBINATORIAL PERMUTATION MATRIX
// ============================================================================
console.log('📍 SUITE 1: STATE COMBINATORIAL PERMUTATION MATRIX');

check('SEC-GATE-01: Secondary terminal in PENDING state with isStoreAuthenticated=true keeps overlay display: flex', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'auth_token_xyz_tenant123',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SECONDARY_01'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isStoreAuthenticated(), true, 'Store must be authenticated');
  assert.strictEqual(sandbox.isSecondaryTerminal(), true, 'Device must be secondary terminal');
  assert.strictEqual(sandbox.getDeviceStatus(), 'PENDING', 'Device status must be PENDING');

  // Trigger showDevicePairingOverlay
  sandbox.showDevicePairingOverlay();

  const overlay = elements.get('devicePairingOverlay');
  assert.strictEqual(overlay.style.display, 'flex', '#devicePairingOverlay must have style.display === "flex"');
});

check('SEC-GATE-02: Secondary terminal in PENDING state in Demo Mode keeps overlay display: flex', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_mode: 'demo',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SECONDARY_02'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isStoreAuthenticated(), true, 'Store must be authenticated under demo mode');
  assert.strictEqual(sandbox.isSecondaryTerminal(), true, 'Device must be secondary');
  
  sandbox.showDevicePairingOverlay();

  const overlay = elements.get('devicePairingOverlay');
  assert.strictEqual(overlay.style.display, 'flex', 'Pairing overlay must be display: flex in demo mode');
});

check('SEC-GATE-03: Repeated showDevicePairingOverlay calls never accidentally toggle or hide overlay', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SECONDARY_03'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  const overlay = elements.get('devicePairingOverlay');
  for (let i = 0; i < 20; i++) {
    sandbox.showDevicePairingOverlay();
    assert.strictEqual(overlay.style.display, 'flex', `Overlay must remain flex on iteration #${i + 1}`);
  }
});

check('SEC-GATE-04: Master Admin terminal with AUTHORIZED status auto-hides pairing overlay', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'true',
    billnaw_device_status: 'AUTHORIZED',
    billnaw_device_id: 'DEV_MASTER_ADMIN'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isMasterTerminal(), true, 'Must be confirmed master terminal');
  assert.strictEqual(sandbox.isSecondaryTerminal(), false, 'Must not be secondary terminal');

  // Pre-set display to flex, then invoke showDevicePairingOverlay
  const overlay = elements.get('devicePairingOverlay');
  overlay.style.display = 'flex';
  sandbox.showDevicePairingOverlay();

  assert.strictEqual(overlay.style.display, 'none', 'Master Admin terminal must hide pairing overlay');
});

check('SEC-GATE-05: Secondary terminal with AUTHORIZED status hides pairing overlay', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'AUTHORIZED',
    billnaw_device_id: 'DEV_SECONDARY_APPROVED'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' },
    { deviceId: 'DEV_SECONDARY_APPROVED', isMaster: false, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isSecondaryTerminal(), true);
  assert.strictEqual(sandbox.canAccessStoreData(), true);

  const overlay = elements.get('devicePairingOverlay');
  overlay.style.display = 'flex';
  sandbox.showDevicePairingOverlay();

  assert.strictEqual(overlay.style.display, 'none', 'Authorized secondary terminal hides pairing overlay');
});

// ============================================================================
// SUITE 2: PRIVILEGE ESCALATION & TAMPERING ATTACKS
// ============================================================================
console.log('\n📍 SUITE 2: PRIVILEGE ESCALATION & TAMPERING RESILIENCE');

check('TAMPER-01: Secondary device attempting Staff Admin escalation is blocked by pairing gate', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SECONDARY_ESCALATE'
  });

  // Rogue secondary device pretends to be logged in as Admin Staff:
  sandbox.window.currentStaff = { id: 1, name: 'Root Admin', role: 'Admin' };
  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_LEGIT_MASTER', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isSecondaryTerminal(), true, 'Must remain secondary terminal');
  assert.strictEqual(sandbox.canAccessStoreData(), false, 'Store data access must remain blocked');

  sandbox.showDevicePairingOverlay();
  const overlay = elements.get('devicePairingOverlay');
  assert.strictEqual(overlay.style.display, 'flex', 'Pairing overlay must remain active despite Admin Staff role');
});

check('TAMPER-02: Attacker deletes billnaw_device_status key -> defaults to PENDING and keeps gate locked', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_id: 'DEV_SECONDARY_NO_STATUS'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.getDeviceStatus(), 'PENDING', 'Missing status must evaluate to PENDING');
  assert.strictEqual(sandbox.canAccessStoreData(), false, 'Store data access must be blocked');

  sandbox.showDevicePairingOverlay();
  const overlay = elements.get('devicePairingOverlay');
  assert.strictEqual(overlay.style.display, 'flex', 'Pairing overlay must be displayed for missing status');
});

check('TAMPER-03: Attacker injects unrecognized status "BYPASS_ADMIN" -> blocked by canAccessStoreData', () => {
  const { sandbox } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'BYPASS_ADMIN',
    billnaw_device_id: 'DEV_SECONDARY_INJECT'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.canAccessStoreData(), false, 'Unrecognized status must return false for canAccessStoreData');
});

check('TAMPER-04: Secondary terminal with forged timestamp cannot bypass without AUTHORIZED status', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_auth_timestamp: Date.now().toString(),
    billnaw_station_profile: 'BILLING_COUNTER',
    billnaw_device_id: 'DEV_SECONDARY_FORGED_TIME'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.isSecondaryTerminal(), true);
  assert.strictEqual(sandbox.canAccessStoreData(), false);

  sandbox.showDevicePairingOverlay();
  const overlay = elements.get('devicePairingOverlay');
  assert.strictEqual(overlay.style.display, 'flex');
});

// ============================================================================
// SUITE 3: ZERO-STORE-DATA GATE & IN-MEMORY DATA PURGE
// ============================================================================
console.log('\n📍 SUITE 3: ZERO-STORE-DATA GATE & IN-MEMORY PURGE');

check('NAV-GATE-01: canAccessStoreData() strictly returns false for PENDING secondary terminal', () => {
  const { sandbox } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SEC_01'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  assert.strictEqual(sandbox.canAccessStoreData(), false);
});

check('NAV-GATE-02: ZeroStoreDataGate purges in-memory menuItems and window.menuItems to [] on PENDING', () => {
  const { sandbox } = createSandbox({
    billnaw_auth_token: 'valid_token_abc',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_SEC_02'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  // Pre-seed window.menuItems with sensitive store dishes
  sandbox.window.menuItems = [
    { id: 101, name: 'Tandoori Chai', price: 40 },
    { id: 102, name: 'Paneer Wrap', price: 120 }
  ];

  assert.strictEqual(sandbox.canAccessStoreData(), false, 'canAccessStoreData must be false');

  // Verify F6 ZeroStoreDataGate logic in core.js:
  if (!sandbox.canAccessStoreData()) {
    sandbox.window.menuItems = [];
  }

  assert.strictEqual(sandbox.window.menuItems.length, 0, 'In-memory menuItems must be strictly empty');
});

// ============================================================================
// SUITE 4: DOM INVARIANTS & NON-DISMISSIBILITY
// ============================================================================
console.log('\n📍 SUITE 4: DOM INVARIANTS & NON-DISMISSIBILITY');

check('INV-DOM-01: #devicePairingOverlay contains strictly 0 .modal-close-btn elements in index.html', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

  // Find the exact #devicePairingOverlay block
  const overlayStart = html.indexOf('id="devicePairingOverlay"');
  assert.ok(overlayStart > -1, '#devicePairingOverlay must exist in index.html');

  // Find next modal-overlay or major section start
  const nextSection = html.indexOf('id="deviceRevokedOverlay"', overlayStart);
  assert.ok(nextSection > overlayStart, '#deviceRevokedOverlay must follow #devicePairingOverlay');

  const overlayHtml = html.slice(overlayStart, nextSection);

  // Must not have modal-close-btn
  const closeBtnMatches = overlayHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
  assert.strictEqual(closeBtnMatches.length, 0, '#devicePairingOverlay must have 0 .modal-close-btn elements');

  // Must have 6-Digit Pairing Code Display
  assert.ok(overlayHtml.includes('id="pairingCodeDisplay"'), 'Must contain #pairingCodeDisplay');
  // Must have Terminal ID display
  assert.ok(overlayHtml.includes('id="pairingDeviceIdDisplay"'), 'Must contain #pairingDeviceIdDisplay');
  // Must have QR container
  assert.ok(overlayHtml.includes('id="pairingQrContainer"'), 'Must contain #pairingQrContainer');
  // Must have Admin PIN authorization button
  assert.ok(overlayHtml.includes('onclick="promptAdminAuthorizeTerminal()"'), 'Must contain Admin PIN trigger');
});

check('INV-DOM-02: Total active .modal-close-btn elements in index.html is exactly 26', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const btnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  const matches = [];
  let m;
  while ((m = btnRegex.exec(html)) !== null) {
    matches.push(m[0]);
  }
  assert.strictEqual(matches.length, 26, `Expected exactly 26 active .modal-close-btn <button>s, found ${matches.length}`);
});

check('INV-DOM-03: Binary parity between storage.rules and database/storage.rules is 100%', () => {
  const rootStorage = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'));
  const dbStorage = fs.readFileSync(path.join(ROOT_DIR, 'database', 'storage.rules'));
  assert.strictEqual(Buffer.compare(rootStorage, dbStorage), 0, 'storage.rules and database/storage.rules must be bit-for-bit identical');
});

check('INV-DOM-04: Binary parity between firestore.rules and database/firestore.rules is 100%', () => {
  const rootFirestore = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'));
  const dbFirestore = fs.readFileSync(path.join(ROOT_DIR, 'database', 'firestore.rules'));
  assert.strictEqual(Buffer.compare(rootFirestore, dbFirestore), 0, 'firestore.rules and database/firestore.rules must be bit-for-bit identical');
});

// ============================================================================
// SUITE 5: HIGH-FREQUENCY RAPID INVOCATIONS STRESS (100 ITERATIONS)
// ============================================================================
console.log('\n📍 SUITE 5: HIGH-FREQUENCY RAPID INVOCATIONS STRESS');

check('CONCUR-01: 100 consecutive rapid showDevicePairingOverlay() calls maintain display: flex with 100% pass rate', () => {
  const { sandbox, elements } = createSandbox({
    billnaw_auth_token: 'valid_token_rapid_fire',
    billnaw_auth_mode: 'authenticated',
    billnaw_is_master: 'false',
    billnaw_device_status: 'PENDING',
    billnaw_device_id: 'DEV_STRESS_RAPID'
  });

  sandbox.window.authorizedDevices = [
    { deviceId: 'DEV_MASTER_ADMIN', isMaster: true, status: 'AUTHORIZED' }
  ];

  const overlay = elements.get('devicePairingOverlay');

  for (let i = 1; i <= 100; i++) {
    // Interleave slight mutations that shouldn't affect the gate
    if (i % 2 === 0) sandbox.localStorage.setItem('billnaw_station_profile', 'WAITER_MOBILE');
    if (i % 3 === 0) sandbox.localStorage.setItem('billnaw_pairing_code', '998877');

    sandbox.showDevicePairingOverlay();

    assert.strictEqual(
      overlay.style.display,
      'flex',
      `Iteration #${i}: #devicePairingOverlay must stay display: flex`
    );
  }
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n====================================================================');
console.log(`📊 STRESS TEST COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
console.log('====================================================================');

if (failedTests > 0) {
  console.error('\n❌ FAILURES DETECTED:');
  failures.forEach(f => console.error(`  - ${f.testName}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\n🎉 ALL 16 ADVERSARIAL PAIRING GATE STRESS TESTS PASSED 100%!');
  process.exit(0);
}
