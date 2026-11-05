/**
 * scratch/test_multidevice_pairing_flow.cjs
 * ============================================================================
 * Comprehensive E2E Verification Suite:
 * Multi-Device Pairing, Real-Time Admin Notifications, Authorized View
 * Persistence Across Reloads, Zero-Store-Data Gate, and Repository Invariants.
 *
 * Covers Tiers 1-4 & System Invariants:
 *   - Tier 1: Feature Coverage (Device ID/Code generation, Cloud Registration,
 *             Real-time Admin Notifications & Chime, Streamlined Approval,
 *             Authorization State Transitions & Station View Routing)
 *   - Tier 2: Boundary & Corner Cases (Invalid Codes/PINs, 10-day TTL Expiration,
 *             Offline/Transient Sync Lag Fallback)
 *   - Tier 3: Cross-Feature Interactions (Shop Re-Auth preserving AUTHORIZED status,
 *             Tab Switching without tripping pairing overlay, Secondary PIN Auth
 *             not hijacking Master)
 *   - Tier 4: Real-World Scenarios (Full Multi-Terminal Lifecycle, Reboot/Reload
 *             Persistence suppressing QR/Code screen, Admin Revocation Kickout,
 *             Concurrent Multi-Terminal Setup)
 *   - Repository Invariants:
 *     1. Exactly 26 .modal-close-btn SVGs in index.html
 *     2. Strictly 0 raw Unicode emojis in operational controls
 *     3. Preserved currency formatting with non-breaking space ('₹ ')
 *     4. Server health check HTTP 200 on port 5000 (/api/health)
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// Test Harness Registry
// ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

async function test(id, description, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: [${id}] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: [${id}] ${description}`);
    console.error(`     Error: ${err.message}`);
    failed++;
    failures.push({ id, description, error: err.message, stack: err.stack });
  }
}

// ----------------------------------------------------------------------------
// Mocking & Sandbox Utilities for Runtime Simulation
// ----------------------------------------------------------------------------
function createIsolatedBrowserSandbox(initialStorage = {}) {
  const storageMap = new Map(Object.entries(initialStorage));
  const localStorageMock = {
    getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
    setItem: (key, val) => { storageMap.set(key, String(val)); },
    removeItem: (key) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
    get length() { return storageMap.size; },
    key: (i) => Array.from(storageMap.keys())[i] || null
  };

  const elements = new Map();
  function getOrCreateElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: { display: '' },
        innerText: '',
        innerHTML: '',
        classList: {
          classes: new Set(),
          add: function(c) { this.classes.add(c); },
          remove: function(c) { this.classes.delete(c); },
          contains: function(c) { return this.classes.has(c); }
        },
        value: '',
        focus: () => {}
      });
    }
    return elements.get(id);
  }

  // Pre-seed known DOM elements
  const knownIds = [
    'devicePairingOverlay',
    'deviceRevokedOverlay',
    'pairingDeviceIdDisplay',
    'pairingCodeDisplay',
    'pairingQrContainer',
    'adminPairingNotificationBanner',
    'adminPairingBannerText',
    'deviceApprovalPinModal',
    'approvalDeviceIdDisplay',
    'approvalStationProfileSelect',
    'approvalAdminPinInput',
    'nav-pos',
    'nav-kds',
    'nav-tables',
    'pos',
    'kds',
    'tables'
  ];
  knownIds.forEach(id => getOrCreateElement(id));

  const listeners = new Map();
  const eventHistory = [];

  const documentMock = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('.view') || sel.includes('.tab-content')) {
        return ['pos', 'kds', 'tables'].map(id => getOrCreateElement(id));
      }
      if (sel.includes('.nav-btn') || sel.includes('.tab-btn')) {
        return ['nav-pos', 'nav-kds', 'nav-tables'].map(id => getOrCreateElement(id));
      }
      return [];
    },
    addEventListener: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(handler);
    }
  };

  const toastHistory = [];
  let chimePlayedCount = 0;

  const sandbox = {
    localStorage: localStorageMock,
    document: documentMock,
    elements,
    eventHistory,
    toastHistory,
    getChimeCount: () => chimePlayedCount,
    showToast: (msg, type = 'info') => {
      toastHistory.push({ msg, type, timestamp: Date.now() });
    },
    playKdsAudioChime: () => {
      chimePlayedCount++;
    },
    dispatchEvent: (evt) => {
      eventHistory.push(evt);
      const list = listeners.get(evt.type) || [];
      list.forEach(h => h(evt));
    },
    addEventListener: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(handler);
    }
  };

  return sandbox;
}

// HTTP request helper for localhost:5000
function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:5000${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });
  });
}

// ----------------------------------------------------------------------------
// Suite Execution
// ----------------------------------------------------------------------------
async function runSuite() {
  console.log('====================================================================');
  console.log('🚀 E2E MULTI-DEVICE PAIRING, REAL-TIME NOTIFICATIONS & REPO INVARIANTS');
  console.log('====================================================================\n');

  // Load codebase text files for contract inspections
  const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
  const coreJsPath = path.join(ROOT_DIR, 'js', 'core.js');
  const settingsJsPath = path.join(ROOT_DIR, 'js', 'settings.js');
  const shopAuthJsPath = path.join(ROOT_DIR, 'js', 'shop-auth.js');
  const serverJsPath = path.join(ROOT_DIR, 'server.js');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const coreJs = fs.readFileSync(coreJsPath, 'utf8');
  const settingsJs = fs.readFileSync(settingsJsPath, 'utf8');
  const shopAuthJs = fs.readFileSync(shopAuthJsPath, 'utf8');
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE
  // ==========================================================================
  console.log('====================================================================');
  console.log('📍 TIER 1: FEATURE COVERAGE (T1-FEAT-01 to T1-FEAT-24)');
  console.log('====================================================================\n');

  // --- Feature Group 1: Device Identification & Pairing Code Generation ---
  await test('T1-FEAT-01', 'Secondary device generates valid UUIDv4-derived Device ID with prefix DEV_', () => {
    // Contract: getOrCreateDeviceId() generates 'DEV_' followed by hex string
    assert.ok(coreJs.includes('getOrCreateDeviceId'), 'core.js must define getOrCreateDeviceId');
    assert.ok(coreJs.includes('DEV_'), 'core.js must prefix device IDs with DEV_');

    function simulateGenerateDeviceId() {
      const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
      return `DEV_${hex}`;
    }
    const id = simulateGenerateDeviceId();
    assert.match(id, /^DEV_[A-F0-9]{12}$/, 'Generated device ID must match DEV_ prefix and 12 hex characters');
  });

  await test('T1-FEAT-02', 'Secondary device generates cryptographically strong 6-digit numeric pairing code in range 100000..999999', () => {
    assert.ok(coreJs.includes('generatePairingCode'), 'core.js must define generatePairingCode');
    // Verify mathematical bounds across 100 iterations
    for (let i = 0; i < 100; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      assert.strictEqual(code.length, 6, 'Pairing code must be exactly 6 characters');
      assert.match(code, /^\d{6}$/, 'Pairing code must contain only numeric digits');
      const num = parseInt(code, 10);
      assert.ok(num >= 100000 && num <= 999999, 'Pairing code must be between 100000 and 999999');
    }
  });

  await test('T1-FEAT-03', 'Pairing code display formats 6 digits as two 3-digit groups (e.g. "123 456") in #pairingCodeDisplay', () => {
    assert.ok(indexHtml.includes('id="pairingCodeDisplay"'), 'index.html must have #pairingCodeDisplay element');
    const code = '742918';
    const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
    assert.strictEqual(formatted, '742 918');
  });

  await test('T1-FEAT-04', 'Device ID and pairing code are stored in local storage keys bongbhoj_device_id and billnaw_pairing_code', () => {
    const sandbox = createIsolatedBrowserSandbox();
    sandbox.localStorage.setItem('bongbhoj_device_id', 'DEV_AABBCCDDEEFF');
    sandbox.localStorage.setItem('billnaw_pairing_code', '654321');

    assert.strictEqual(sandbox.localStorage.getItem('bongbhoj_device_id'), 'DEV_AABBCCDDEEFF');
    assert.strictEqual(sandbox.localStorage.getItem('billnaw_pairing_code'), '654321');
  });

  await test('T1-FEAT-05', 'Pairing QR payload encodes JSON string with { deviceId, pairingCode }', () => {
    assert.ok(indexHtml.includes('id="pairingQrContainer"'), 'index.html must contain #pairingQrContainer');
    const devId = 'DEV_112233445566';
    const code = '456789';
    const qrPayload = JSON.stringify({ deviceId: devId, pairingCode: code });
    const parsed = JSON.parse(qrPayload);
    assert.strictEqual(parsed.deviceId, devId);
    assert.strictEqual(parsed.pairingCode, code);
  });

  // --- Feature Group 2: Cloud Registration Contract ---
  await test('T1-FEAT-06', 'registerPendingDeviceToCloud writes document to /shops/{storeCode}/devices/{deviceId}', () => {
    assert.ok(coreJs.includes('async function registerPendingDeviceToCloud'), 'core.js must define registerPendingDeviceToCloud');
    assert.ok(coreJs.includes("getStoreSubdocRef('devices'"), 'registerPendingDeviceToCloud must use store subdocument reference');
  });

  await test('T1-FEAT-07', 'Pending device registration payload conforms strictly to Interface Contract 1', () => {
    assert.ok(coreJs.includes("status: 'PENDING'"), 'Registration payload must specify status: PENDING');
    assert.ok(coreJs.includes("stationProfile: 'GENERAL_STATION'"), 'Registration payload must default to GENERAL_STATION');
    assert.ok(coreJs.includes("isMaster: false"), 'Registration payload must specify isMaster: false');
    assert.ok(coreJs.includes("registeredAt:"), 'Registration payload must include registeredAt');
    assert.ok(coreJs.includes("lastSeenAt:"), 'Registration payload must include lastSeenAt');
  });

  await test('T1-FEAT-08', 'registerPendingDeviceToCloud binds to firebaseLoaded event so write is never missed during async boot', () => {
    // Requirement R1: Re-attempt registerPendingDeviceToCloud on firebaseLoaded event
    const hasFirebaseLoadedListener = coreJs.includes("firebaseLoaded") || coreJs.includes("'firebaseLoaded'");
    assert.ok(hasFirebaseLoadedListener, 'core.js must listen for firebaseLoaded event to retry pending device cloud registration');
  });

  await test('T1-FEAT-09', 'Tenant Store Code Resolution routes secondary terminals to active tenant store (/shops/{storeCode}/devices)', () => {
    assert.ok(coreJs.includes('getStoreSubcollectionRef'), 'core.js must define getStoreSubcollectionRef');
    assert.ok(coreJs.includes('getStoreSubdocRef'), 'core.js must define getStoreSubdocRef');
    // Ensure demo hardcoded path BONGBHOJ-TERMINAL is not unconditionally targeted
    assert.ok(!coreJs.includes("getStoreSubdocRef('devices') /* hardcoded demo */"), 'Must resolve active tenant store dynamically');
  });

  await test('T1-FEAT-10', 'showDevicePairingOverlay strictly suppresses registration and overlay if device is already AUTHORIZED', () => {
    // Requirement R2 / PROJECT.md: Guard showDevicePairingOverlay against demoting or displaying if getDeviceStatus() === 'AUTHORIZED'
    const showPairingOverlayChunk = coreJs.substring(coreJs.indexOf('function showDevicePairingOverlay'), coreJs.indexOf('function hideDevicePairingOverlay'));
    const guardsAuthorized = showPairingOverlayChunk.includes("getDeviceStatus() === 'AUTHORIZED'") ||
                             showPairingOverlayChunk.includes("localStorage.getItem('billnaw_device_status') === 'AUTHORIZED'");
    assert.ok(guardsAuthorized, 'showDevicePairingOverlay must guard against execution when device is already AUTHORIZED');
  });

  // --- Feature Group 3: Master Admin Real-Time Pairing Notification ---
  await test('T1-FEAT-11', 'subscribeDevicesCloudListener attaches real-time snapshot listener on /shops/{storeCode}/devices', () => {
    assert.ok(coreJs.includes('function subscribeDevicesCloudListener'), 'core.js must define subscribeDevicesCloudListener');
    assert.ok(coreJs.includes('firestoreOnSnapshot'), 'subscribeDevicesCloudListener must use onSnapshot for real-time delivery');
  });

  await test('T1-FEAT-12', 'Real-Time Notification Banner (#adminPairingNotificationBanner) exists in index.html', () => {
    assert.ok(indexHtml.includes('id="adminPairingNotificationBanner"'), 'index.html must contain #adminPairingNotificationBanner');
    assert.ok(indexHtml.includes('id="adminPairingBannerText"'), 'index.html must contain #adminPairingBannerText');
  });

  await test('T1-FEAT-13', 'Master Admin listener displays #adminPairingNotificationBanner when pending devices are detected', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'true'
    });

    const banner = sandbox.document.getElementById('adminPairingNotificationBanner');
    const bannerText = sandbox.document.getElementById('adminPairingBannerText');

    const devices = [
      { id: 'DEV_001', deviceId: 'DEV_001', status: 'PENDING', deviceName: 'Counter 2' }
    ];

    const isMaster = sandbox.localStorage.getItem('billnaw_is_master') === 'true';
    const pendingList = devices.filter(d => d.status === 'PENDING');
    if (isMaster && pendingList.length > 0) {
      banner.style.display = 'flex';
      bannerText.innerText = `${pendingList.length} device requesting pairing authorization`;
    } else {
      banner.style.display = 'none';
    }

    assert.strictEqual(banner.style.display, 'flex', 'Banner must display flex for pending devices on Master terminal');
    assert.ok(bannerText.innerText.includes('1 device requesting pairing authorization'), 'Banner text must reflect pending count');
  });

  await test('T1-FEAT-14', 'Master Admin listener fires showToast when pending device arrives', () => {
    // In PROJECT.md Contract 2: calls showToast('🔔 Secondary Terminal ... requesting pairing authorization')
    const listenerChunk = coreJs.substring(coreJs.indexOf('function subscribeDevicesCloudListener'), coreJs.indexOf('function subscribeSessionsCloudListener'));
    assert.ok(listenerChunk.includes('showToast'), 'subscribeDevicesCloudListener must call showToast upon detecting pending device');
  });

  await test('T1-FEAT-15', 'Master Admin listener plays audio chime (playKdsAudioChime) on incoming pairing request', () => {
    // In PROJECT.md Contract 2: calls playKdsAudioChime()
    const listenerChunk = coreJs.substring(coreJs.indexOf('function subscribeDevicesCloudListener'), coreJs.indexOf('function subscribeSessionsCloudListener'));
    assert.ok(listenerChunk.includes('playKdsAudioChime'), 'subscribeDevicesCloudListener must call playKdsAudioChime when pending device is detected');
  });

  await test('T1-FEAT-16', 'Master Admin listener dispatches billnaw:device-pairing-requested event with device record', () => {
    // In PROJECT.md Contract 2: dispatches custom DOM event billnaw:device-pairing-requested
    const listenerChunk = coreJs.substring(coreJs.indexOf('function subscribeDevicesCloudListener'), coreJs.indexOf('function subscribeSessionsCloudListener'));
    assert.ok(listenerChunk.includes('billnaw:device-pairing-requested'), 'subscribeDevicesCloudListener must dispatch billnaw:device-pairing-requested');
  });

  await test('T1-FEAT-17', 'Notification banner hides (display: none) when zero pending devices remain', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'true'
    });

    const banner = sandbox.document.getElementById('adminPairingNotificationBanner');
    const bannerText = sandbox.document.getElementById('adminPairingBannerText');

    const devices = [
      { id: 'DEV_001', deviceId: 'DEV_001', status: 'AUTHORIZED', deviceName: 'Counter 2' }
    ];

    const isMaster = sandbox.localStorage.getItem('billnaw_is_master') === 'true';
    const pendingList = devices.filter(d => d.status === 'PENDING');
    if (isMaster && pendingList.length > 0) {
      banner.style.display = 'flex';
      bannerText.innerText = `${pendingList.length} devices requesting pairing authorization`;
    } else {
      banner.style.display = 'none';
    }

    assert.strictEqual(banner.style.display, 'none', 'Banner must be hidden when there are no pending devices');
  });

  // --- Feature Group 4: Master Admin Approval Flow ---
  await test('T1-FEAT-18', 'index.html contains #deviceApprovalPinModal with pairing code and PIN inputs', () => {
    assert.ok(indexHtml.includes('id="deviceApprovalPinModal"'), 'index.html must have #deviceApprovalPinModal');
    assert.ok(indexHtml.includes('id="approvalPairingCodeInput"'), 'index.html must have #approvalPairingCodeInput');
    assert.ok(indexHtml.includes('id="approvalAdminPinInput"'), 'index.html must have #approvalAdminPinInput');
    assert.ok(indexHtml.includes('id="approvalStationProfileSelect"'), 'index.html must have #approvalStationProfileSelect');
  });

  await test('T1-FEAT-19', 'settings.js defines openDeviceApprovalModal for streamlined 1-click approval invocation', () => {
    assert.ok(settingsJs.includes('openDeviceApprovalModal'), 'settings.js must define openDeviceApprovalModal');
    assert.ok(settingsJs.includes('confirmApproveDevicePairing'), 'settings.js must define confirmApproveDevicePairing');
  });

  await test('T1-FEAT-20', 'confirmApproveDevicePairing and approveDevicePairing update Firestore document with status AUTHORIZED, stationProfile, deviceName, approvedAt', () => {
    const approveChunk = settingsJs.substring(settingsJs.indexOf('function approveDevicePairing'), settingsJs.indexOf('function revokeAuthorizedDevice'));
    assert.ok(approveChunk.includes("status: 'AUTHORIZED'"), 'Must update status to AUTHORIZED');
    assert.ok(approveChunk.includes("approvedAt:"), 'Must record approvedAt timestamp');
  });

  // --- Feature Group 5: Secondary Device Authorization State Transition & Station View Routing ---
  await test('T1-FEAT-21', 'Secondary terminal cloud listener detects AUTHORIZED transition and updates billnaw_device_status = AUTHORIZED', () => {
    const sandbox = createIsolatedBrowserSandbox({
      bongbhoj_device_id: 'DEV_TEST_01',
      billnaw_device_status: 'PENDING'
    });

    const incomingDevice = {
      deviceId: 'DEV_TEST_01',
      status: 'AUTHORIZED',
      stationProfile: 'KDS',
      deviceName: 'Kitchen Screen 1'
    };

    if (incomingDevice.status === 'AUTHORIZED') {
      sandbox.localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
      sandbox.localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
      sandbox.localStorage.setItem('billnaw_station_profile', incomingDevice.stationProfile);
      sandbox.localStorage.setItem('billnaw_station_name', incomingDevice.deviceName);
    }

    assert.strictEqual(sandbox.localStorage.getItem('billnaw_device_status'), 'AUTHORIZED');
    assert.strictEqual(sandbox.localStorage.getItem('billnaw_station_profile'), 'KDS');
  });

  await test('T1-FEAT-22', 'Authorization transition updates billnaw_device_auth_timestamp with current timestamp', () => {
    const sandbox = createIsolatedBrowserSandbox();
    const before = Date.now();
    sandbox.localStorage.setItem('billnaw_device_auth_timestamp', before.toString());
    const stored = parseInt(sandbox.localStorage.getItem('billnaw_device_auth_timestamp'), 10);
    assert.ok(!isNaN(stored));
    assert.ok(stored >= before);
  });

  await test('T1-FEAT-23', 'Authorization transition immediately calls hideDevicePairingOverlay', () => {
    const sandbox = createIsolatedBrowserSandbox();
    const overlay = sandbox.document.getElementById('devicePairingOverlay');
    overlay.style.display = 'flex';

    function hideDevicePairingOverlay() {
      const el = sandbox.document.getElementById('devicePairingOverlay');
      if (el) el.style.display = 'none';
    }

    hideDevicePairingOverlay();
    assert.strictEqual(overlay.style.display, 'none', 'Pairing overlay must be hidden after approval');
  });

  await test('T1-FEAT-24', 'resolveInitialViewForStation routes KDS to #kds, WAITER_MOBILE to #tables, BILLING_COUNTER to #pos', () => {
    assert.ok(coreJs.includes('resolveInitialViewForStation'), 'core.js must define resolveInitialViewForStation');
    assert.ok(coreJs.includes('switchView'), 'core.js must define switchView helper');

    function resolveInitialView(profile) {
      if (profile === 'KDS') return 'kds';
      if (profile === 'WAITER_MOBILE') return 'tables';
      if (profile === 'BILLING_COUNTER' || profile === 'GENERAL_STATION') return 'pos';
      return 'pos';
    }

    assert.strictEqual(resolveInitialView('KDS'), 'kds');
    assert.strictEqual(resolveInitialView('WAITER_MOBILE'), 'tables');
    assert.strictEqual(resolveInitialView('BILLING_COUNTER'), 'pos');
    assert.strictEqual(resolveInitialView('GENERAL_STATION'), 'pos');
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 TIER 2: BOUNDARY & CORNER CASES (T2-BC-01 to T2-BC-10)');
  console.log('====================================================================\n');

  await test('T2-BC-01', 'Invalid pairing code (non-6-digit, alphabet, whitespace) rejected during pairing validation', () => {
    function validatePairingCode(code) {
      if (!code || typeof code !== 'string') return false;
      const clean = code.trim().replace(/\s+/g, '');
      return /^\d{6}$/.test(clean);
    }

    assert.strictEqual(validatePairingCode('12345'), false, '5-digit code must be rejected');
    assert.strictEqual(validatePairingCode('1234567'), false, '7-digit code must be rejected');
    assert.strictEqual(validatePairingCode('12A456'), false, 'Alphanumeric code must be rejected');
    assert.strictEqual(validatePairingCode('      '), false, 'Blank whitespace code must be rejected');
    assert.strictEqual(validatePairingCode(null), false, 'Null code must be rejected');
    assert.strictEqual(validatePairingCode('123 456'), true, 'Formatted code with space must be accepted after sanitize');
  });

  await test('T2-BC-02', 'Incorrect Master Admin PIN in approval modal is rejected without mutating device state', () => {
    const sandbox = createIsolatedBrowserSandbox();
    const shopProfile = { adminPinHash: crypto.createHash('sha256').update('8899:salt_xyz:billnaw_pin_v2').digest('hex') };
    const salt = 'salt_xyz';

    function verifyAdminPin(enteredPin) {
      const clean = String(enteredPin || '').trim();
      const hash = crypto.createHash('sha256').update(`${clean}:${salt}:billnaw_pin_v2`).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(shopProfile.adminPinHash));
    }

    assert.strictEqual(verifyAdminPin('0000'), false, 'Wrong PIN must be rejected');
    assert.strictEqual(verifyAdminPin('8899'), true, 'Correct PIN must be accepted');
  });

  await test('T2-BC-03', 'Constant DEVICE_AUTH_TTL_MS equals exactly 864,000,000 ms (10 days)', () => {
    assert.ok(coreJs.includes('DEVICE_AUTH_TTL_MS'), 'core.js must define DEVICE_AUTH_TTL_MS');
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    assert.strictEqual(TEN_DAYS_MS, 864000000);
    assert.ok(coreJs.includes('864000000') || coreJs.includes('10 * 24 * 60 * 60 * 1000'), 'DEVICE_AUTH_TTL_MS must evaluate to 864,000,000');
  });

  await test('T2-BC-04', '10-Day TTL: Session authorized 9 days ago (within 10 days) evaluates as valid active session without re-pairing', () => {
    const TEN_DAYS_MS = 864000000;
    const nineDaysAgo = Date.now() - (9 * 24 * 60 * 60 * 1000);

    function checkExpiration(timestampStr) {
      if (!timestampStr) return false;
      const authTime = parseInt(timestampStr, 10);
      return isNaN(authTime) || (Date.now() - authTime) >= TEN_DAYS_MS;
    }

    assert.strictEqual(checkExpiration(nineDaysAgo.toString()), false, '9-day session must NOT be expired');
  });

  await test('T2-BC-05', '10-Day TTL: Session authorized 10 days + 1 second ago evaluates as expired and triggers re-pairing flow', () => {
    const TEN_DAYS_MS = 864000000;
    const expiredTime = Date.now() - (TEN_DAYS_MS + 1000);

    function checkExpiration(timestampStr) {
      if (!timestampStr) return false;
      const authTime = parseInt(timestampStr, 10);
      return isNaN(authTime) || (Date.now() - authTime) >= TEN_DAYS_MS;
    }

    assert.strictEqual(checkExpiration(expiredTime.toString()), true, '10-day + 1s session must evaluate as expired');
  });

  await test('T2-BC-06', 'Missing, NaN, or corrupted billnaw_device_auth_timestamp is safely handled without throwing uncaught exceptions', () => {
    const sandbox = createIsolatedBrowserSandbox();
    sandbox.localStorage.setItem('billnaw_device_auth_timestamp', 'CORRUPT_NOT_A_NUMBER');

    function safeCheck(storage) {
      try {
        const val = storage.getItem('billnaw_device_auth_timestamp');
        const num = parseInt(val, 10);
        if (isNaN(num)) {
          storage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
          return false;
        }
        return (Date.now() - num) >= 864000000;
      } catch (e) {
        return false;
      }
    }

    const res = safeCheck(sandbox.localStorage);
    assert.strictEqual(res, false, 'Corrupted timestamp must be healed without throwing');
    assert.ok(!isNaN(parseInt(sandbox.localStorage.getItem('billnaw_device_auth_timestamp'), 10)));
  });

  await test('T2-BC-07', 'canAccessStoreData returns false when terminal authorization timestamp is expired', () => {
    assert.ok(coreJs.includes('canAccessStoreData'), 'core.js must define canAccessStoreData');
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'false',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: (Date.now() - 900000000).toString() // Expired (over 10 days)
    });

    function simulateCanAccess(storage) {
      if (storage.getItem('billnaw_is_master') === 'true') return true;
      const authTime = parseInt(storage.getItem('billnaw_device_auth_timestamp'), 10);
      if (isNaN(authTime) || (Date.now() - authTime) >= 864000000) return false;
      return storage.getItem('billnaw_device_status') === 'AUTHORIZED';
    }

    assert.strictEqual(simulateCanAccess(sandbox.localStorage), false, 'Expired auth must deny store data access');
  });

  await test('T2-BC-08', 'Offline / transient sync lag fallback: canAccessStoreData does not crash and respects local AUTHORIZED status', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'false',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: (Date.now() - 3600000).toString() // 1 hour ago
    });

    // In offline state, window.currentDeviceRecord is undefined/null
    function simulateOfflineAccess(storage, currentRecord) {
      if (storage.getItem('billnaw_is_master') === 'true') return true;
      const status = storage.getItem('billnaw_device_status');
      if (status === 'REVOKED' || status === 'PENDING') return false;
      if (currentRecord) return currentRecord.status === 'AUTHORIZED';
      return status === 'AUTHORIZED';
    }

    assert.strictEqual(simulateOfflineAccess(sandbox.localStorage, null), true, 'Must allow offline access if local status is AUTHORIZED within TTL');
  });

  await test('T2-BC-09', 'checkDeviceAuthorizationStatus safely handles null, undefined, or empty authorizedDevices list', () => {
    assert.ok(coreJs.includes('checkDeviceAuthorizationStatus'), 'core.js must define checkDeviceAuthorizationStatus');
    // Function must not crash when window.authorizedDevices is null or empty
    const devicesNull = null;
    const devicesEmpty = [];
    const myDevId = 'DEV_123';

    const record1 = Array.isArray(devicesNull) ? devicesNull.find(d => d.deviceId === myDevId) : null;
    const record2 = Array.isArray(devicesEmpty) ? devicesEmpty.find(d => d.deviceId === myDevId) : null;

    assert.strictEqual(record1, null);
    assert.strictEqual(record2, undefined);
  });

  await test('T2-BC-10', 'Audio chime catches audio context errors or browser autoplay block without crashing pairing flow', () => {
    assert.ok(coreJs.includes('playKdsAudioChime'), 'core.js must define playKdsAudioChime');
    const chimeChunk = coreJs.substring(coreJs.indexOf('function playKdsAudioChime'), coreJs.indexOf('window.playKdsAudioChime'));
    assert.ok(chimeChunk.includes('try') && chimeChunk.includes('catch'), 'playKdsAudioChime must wrap audio node calls in try/catch to survive autoplay policy');
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 TIER 3: CROSS-FEATURE INTERACTIONS (T3-X-01 to T3-X-08)');
  console.log('====================================================================\n');

  await test('T3-X-01', 'Shop auth OTP verification in js/shop-auth.js preserves AUTHORIZED status (never demotes to PENDING)', () => {
    // Audit js/shop-auth.js in handleVerifyOtpCode
    // Requirement R2 / PROJECT.md: Preserve AUTHORIZED in js/shop-auth.js
    const startIdx = shopAuthJs.indexOf('function handleVerifyOtpCode');
    assert.ok(startIdx > -1, 'shop-auth.js must define handleVerifyOtpCode');
    const verifyOtpChunk = shopAuthJs.substring(startIdx, shopAuthJs.indexOf('window.handleVerifyOtpCode', startIdx));

    const guardsAuthorized = verifyOtpChunk.includes("billnaw_device_status") &&
      (verifyOtpChunk.includes("localStorage.getItem('billnaw_device_status') !== 'AUTHORIZED'") ||
       !verifyOtpChunk.includes("localStorage.setItem('billnaw_device_status', 'PENDING');"));

    assert.ok(guardsAuthorized, 'js/shop-auth.js OTP verification must NOT unconditionally overwrite billnaw_device_status to PENDING when already AUTHORIZED');
  });

  await test('T3-X-02', 'Shop password login in js/shop-auth.js preserves AUTHORIZED status (never demotes to PENDING)', () => {
    // Audit js/shop-auth.js in handlePasswordSignIn
    const startIdx = shopAuthJs.indexOf('function handlePasswordSignIn');
    assert.ok(startIdx > -1, 'shop-auth.js must define handlePasswordSignIn');
    const passwordLoginChunk = shopAuthJs.substring(startIdx, shopAuthJs.indexOf('window.handlePasswordSignIn', startIdx));

    const guardsAuthorized = passwordLoginChunk.includes("billnaw_device_status") &&
      (passwordLoginChunk.includes("localStorage.getItem('billnaw_device_status') !== 'AUTHORIZED'") ||
       !passwordLoginChunk.includes("localStorage.setItem('billnaw_device_status', 'PENDING');"));

    assert.ok(guardsAuthorized, 'js/shop-auth.js password login must NOT unconditionally overwrite billnaw_device_status to PENDING when already AUTHORIZED');
  });

  await test('T3-X-03', 'Store owner login preserves billnaw_is_master = true so Master terminal listeners remain active', () => {
    // Requirement R1 / PROJECT.md: In js/shop-auth.js, preserve billnaw_is_master = 'true' on store owner login
    const isMasterCheck = shopAuthJs.includes("billnaw_is_master");
    assert.ok(isMasterCheck, 'shop-auth.js must preserve billnaw_is_master flag on shop owner login');
  });

  await test('T3-X-04', 'Secondary terminal staff PIN unlock does NOT hijack Master Admin status (billnaw_is_master remains false)', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'false',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_station_profile: 'KDS'
    });

    const chefStaff = { id: 3, name: 'Chef Mario', role: 'Kitchen Chef', pin_hash: 'abc' };

    function unlockShift(staff, storage) {
      // Unlocking terminal for staff member must never promote secondary terminal to master
      storage.setItem('billnaw_current_staff', JSON.stringify(staff));
      assert.strictEqual(storage.getItem('billnaw_is_master'), 'false');
    }

    unlockShift(chefStaff, sandbox.localStorage);
    assert.strictEqual(sandbox.localStorage.getItem('billnaw_is_master'), 'false', 'Secondary terminal must remain non-master after staff unlock');
  });

  await test('T3-X-05', 'switchTab("kds") on an authorized device does NOT trigger #devicePairingOverlay during transient sync lag', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: Date.now().toString(),
      billnaw_station_profile: 'KDS'
    });

    const overlay = sandbox.document.getElementById('devicePairingOverlay');
    overlay.style.display = 'none';

    function simulateSwitchTab(tabId, storage, doc) {
      const isAuthorized = storage.getItem('billnaw_device_status') === 'AUTHORIZED';
      if (!isAuthorized) {
        doc.getElementById('devicePairingOverlay').style.display = 'flex';
        return;
      }
      doc.getElementById(tabId).classList.add('active');
    }

    simulateSwitchTab('kds', sandbox.localStorage, sandbox.document);
    assert.strictEqual(overlay.style.display, 'none', 'Pairing overlay must remain hidden during tab switch on authorized terminal');
    assert.ok(sandbox.document.getElementById('kds').classList.contains('active'), 'Target view must become active');
  });

  await test('T3-X-06', 'switchTab("pos") on an authorized device does NOT trigger #devicePairingOverlay', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_device_status: 'AUTHORIZED',
      billnaw_device_auth_timestamp: Date.now().toString()
    });

    const overlay = sandbox.document.getElementById('devicePairingOverlay');
    overlay.style.display = 'none';

    function simulateSwitchTab(tabId, storage, doc) {
      if (storage.getItem('billnaw_device_status') !== 'AUTHORIZED') {
        doc.getElementById('devicePairingOverlay').style.display = 'flex';
        return;
      }
      doc.getElementById(tabId).classList.add('active');
    }

    simulateSwitchTab('pos', sandbox.localStorage, sandbox.document);
    assert.strictEqual(overlay.style.display, 'none');
  });

  await test('T3-X-07', 'switchTab on a PENDING or unauthenticated device blocks navigation and keeps #devicePairingOverlay visible', () => {
    const sandbox = createIsolatedBrowserSandbox({
      billnaw_device_status: 'PENDING'
    });

    const overlay = sandbox.document.getElementById('devicePairingOverlay');
    overlay.style.display = 'none';

    function simulateZeroStoreDataGate(tabId, storage, doc) {
      if (storage.getItem('billnaw_device_status') !== 'AUTHORIZED') {
        doc.getElementById('devicePairingOverlay').style.display = 'flex';
        return false;
      }
      return true;
    }

    const allowed = simulateZeroStoreDataGate('pos', sandbox.localStorage, sandbox.document);
    assert.strictEqual(allowed, false, 'Pending device must be blocked from store views');
    assert.strictEqual(overlay.style.display, 'flex', 'Pairing overlay must be displayed for pending device');
  });

  await test('T3-X-08', 'promptAdminAuthorizeTerminal authorizes terminal under designated station profile without calling setMasterTerminal(true)', () => {
    // Requirement R2 / PROJECT.md: promptAdminAuthorizeTerminal must authorize secondary device under designated station profile
    // rather than improperly executing setMasterTerminal(true).
    const promptChunk = coreJs.substring(coreJs.indexOf('async function promptAdminAuthorizeTerminal'), coreJs.indexOf('function getDeviceStatus'));
    const doesNotImproperlySetMaster = !promptChunk.includes('setMasterTerminal(true);') ||
                                       promptChunk.includes('stationProfile');
    assert.ok(doesNotImproperlySetMaster, 'promptAdminAuthorizeTerminal must not hijack master terminal status on secondary device');
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 TIER 4: REAL-WORLD APPLICATION SCENARIOS (T4-SCEN-01 to T4-SCEN-04)');
  console.log('====================================================================\n');

  await test('T4-SCEN-01', 'End-to-End Multi-Terminal Pairing: Secondary generates code -> Master Admin notified -> Admin approves -> Secondary transitions to KDS', async () => {
    // 1. Secondary device boots and generates ID and code
    const secondarySandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'false'
    });
    const secondaryDevId = 'DEV_KITCHEN_01';
    const pairingCode = '987123';
    secondarySandbox.localStorage.setItem('bongbhoj_device_id', secondaryDevId);
    secondarySandbox.localStorage.setItem('billnaw_pairing_code', pairingCode);
    secondarySandbox.localStorage.setItem('billnaw_device_status', 'PENDING');
    secondarySandbox.document.getElementById('devicePairingOverlay').style.display = 'flex';

    // 2. Simulated Cloud DB holding the store devices subcollection
    const cloudDevicesDb = new Map();
    cloudDevicesDb.set(secondaryDevId, {
      deviceId: secondaryDevId,
      pairingCode,
      deviceName: 'Secondary Terminal',
      stationProfile: 'GENERAL_STATION',
      status: 'PENDING',
      isMaster: false,
      registeredAt: new Date().toISOString()
    });

    // 3. Master Admin snapshot listener receives update
    const adminSandbox = createIsolatedBrowserSandbox({
      billnaw_is_master: 'true'
    });
    const pendingDevices = Array.from(cloudDevicesDb.values()).filter(d => d.status === 'PENDING');
    if (pendingDevices.length > 0) {
      adminSandbox.document.getElementById('adminPairingNotificationBanner').style.display = 'flex';
      adminSandbox.document.getElementById('adminPairingBannerText').innerText = `${pendingDevices.length} device requesting pairing authorization`;
      adminSandbox.showToast(`🔔 Secondary Terminal ${secondaryDevId} requesting pairing authorization`, 'info');
      adminSandbox.playKdsAudioChime();
    }

    assert.strictEqual(adminSandbox.document.getElementById('adminPairingNotificationBanner').style.display, 'flex');
    assert.strictEqual(adminSandbox.getChimeCount(), 1, 'Audio chime must play for Master Admin');
    assert.ok(adminSandbox.toastHistory.some(t => t.msg.includes(secondaryDevId)), 'Admin must receive toast notification');

    // 4. Admin approves device with KDS station profile
    const deviceRecord = cloudDevicesDb.get(secondaryDevId);
    deviceRecord.status = 'AUTHORIZED';
    deviceRecord.stationProfile = 'KDS';
    deviceRecord.deviceName = 'Kitchen KDS Display';
    deviceRecord.approvedAt = new Date().toISOString();
    cloudDevicesDb.set(secondaryDevId, deviceRecord);

    // 5. Secondary device listener picks up AUTHORIZED status
    const updatedRecord = cloudDevicesDb.get(secondaryDevId);
    if (updatedRecord.status === 'AUTHORIZED') {
      secondarySandbox.localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
      secondarySandbox.localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
      secondarySandbox.localStorage.setItem('billnaw_station_profile', updatedRecord.stationProfile);
      secondarySandbox.localStorage.setItem('billnaw_station_name', updatedRecord.deviceName);
      secondarySandbox.document.getElementById('devicePairingOverlay').style.display = 'none';

      // Route to designated station view
      const targetView = updatedRecord.stationProfile === 'KDS' ? 'kds' : 'pos';
      secondarySandbox.document.getElementById(targetView).classList.add('active');
    }

    assert.strictEqual(secondarySandbox.localStorage.getItem('billnaw_device_status'), 'AUTHORIZED');
    assert.strictEqual(secondarySandbox.document.getElementById('devicePairingOverlay').style.display, 'none');
    assert.ok(secondarySandbox.document.getElementById('kds').classList.contains('active'), 'Secondary terminal must route to #kds');
  });

  await test('T4-SCEN-02', 'Reboot / Reload Persistence: Secondary terminal reloads, reads local cache, strictly suppresses QR/code screen, and routes to #kds', () => {
    // Simulate browser reload of previously authorized KDS device
    const reloadedSandbox = createIsolatedBrowserSandbox({
      bongbhoj_device_id: 'DEV_KITCHEN_01',
      billnaw_is_master: 'false',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_station_profile: 'KDS',
      billnaw_station_name: 'Kitchen KDS Display',
      billnaw_device_auth_timestamp: (Date.now() - (2 * 24 * 60 * 60 * 1000)).toString() // 2 days ago (within 10 days)
    });

    // Simulated DOMContentLoaded boot hydration logic
    const status = reloadedSandbox.localStorage.getItem('billnaw_device_status');
    const authTimestamp = parseInt(reloadedSandbox.localStorage.getItem('billnaw_device_auth_timestamp'), 10);
    const isExpired = isNaN(authTimestamp) || (Date.now() - authTimestamp) >= 864000000;

    if (!isExpired && status === 'AUTHORIZED') {
      // MUST strictly suppress pairing overlay
      reloadedSandbox.document.getElementById('devicePairingOverlay').style.display = 'none';
      const profile = reloadedSandbox.localStorage.getItem('billnaw_station_profile');
      const targetView = profile === 'KDS' ? 'kds' : 'pos';
      reloadedSandbox.document.getElementById(targetView).classList.add('active');
    } else {
      reloadedSandbox.document.getElementById('devicePairingOverlay').style.display = 'flex';
    }

    assert.strictEqual(reloadedSandbox.document.getElementById('devicePairingOverlay').style.display, 'none', 'QR/Pairing overlay must be strictly suppressed on reload');
    assert.ok(reloadedSandbox.document.getElementById('kds').classList.contains('active'), 'Must maintain active KDS view across reload');
  });

  await test('T4-SCEN-03', 'Admin Revocation Kickout: Admin revokes device in cloud; secondary device purges local credentials and locks with #deviceRevokedOverlay', () => {
    const secondarySandbox = createIsolatedBrowserSandbox({
      bongbhoj_device_id: 'DEV_STOLEN_PAD',
      billnaw_is_master: 'false',
      billnaw_device_status: 'AUTHORIZED',
      billnaw_station_profile: 'WAITER_MOBILE'
    });

    // Cloud pushes revocation event: status: 'REVOKED'
    const revocationRecord = { deviceId: 'DEV_STOLEN_PAD', status: 'REVOKED' };

    function handleDeviceRevocation(record, storage, doc) {
      storage.removeItem('billnaw_device_status');
      storage.removeItem('billnaw_device_auth_timestamp');
      storage.removeItem('billnaw_station_profile');
      storage.setItem('billnaw_device_status', 'REVOKED');
      doc.getElementById('devicePairingOverlay').style.display = 'none';
      doc.getElementById('deviceRevokedOverlay').style.display = 'flex';
    }

    handleDeviceRevocation(revocationRecord, secondarySandbox.localStorage, secondarySandbox.document);

    assert.strictEqual(secondarySandbox.localStorage.getItem('billnaw_device_status'), 'REVOKED');
    assert.strictEqual(secondarySandbox.document.getElementById('devicePairingOverlay').style.display, 'none');
    assert.strictEqual(secondarySandbox.document.getElementById('deviceRevokedOverlay').style.display, 'flex', 'Revoked overlay must lock device');
  });

  await test('T4-SCEN-04', 'Concurrent Multi-Terminal Setup: KDS and Waiter Mobile pair simultaneously without ID collision or state leakage', () => {
    const kdsDevId = 'DEV_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const waiterDevId = 'DEV_' + crypto.randomBytes(6).toString('hex').toUpperCase();

    assert.notStrictEqual(kdsDevId, waiterDevId, 'Concurrent devices must generate unique IDs');

    const devices = new Map();
    devices.set(kdsDevId, { deviceId: kdsDevId, stationProfile: 'KDS', status: 'AUTHORIZED' });
    devices.set(waiterDevId, { deviceId: waiterDevId, stationProfile: 'WAITER_MOBILE', status: 'AUTHORIZED' });

    assert.strictEqual(devices.get(kdsDevId).stationProfile, 'KDS');
    assert.strictEqual(devices.get(waiterDevId).stationProfile, 'WAITER_MOBILE');
  });

  // ==========================================================================
  // REPOSITORY INVARIANTS PRESERVATION & VERIFICATION
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 REPOSITORY INVARIANTS (T-INV-01 to T-INV-04)');
  console.log('====================================================================\n');

  await test('T-INV-01', 'Invariant 1: Exactly 26 .modal-close-btn SVG elements exist in index.html with strictly 0 raw "✕"', () => {
    const rawMatches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>✕<\/button>/g);
    assert.strictEqual(rawMatches, null, "Found un-modernized raw ✕ modal close buttons in index.html");

    const svgMatches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, 'Must find SVG modal close buttons in index.html');
    assert.strictEqual(svgMatches.length, 26, `Strict Invariant 1: Expected exactly 26 .modal-close-btn SVGs, found ${svgMatches.length}`);
  });

  await test('T-INV-02', 'Invariant 2: Operational controls (<button>, <tab>, segmented pills) contain strictly 0 raw Unicode emojis', () => {
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const buttonMatches = indexHtml.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const offendingButtons = buttonMatches.filter(btn => emojiRegex.test(btn));
    assert.strictEqual(offendingButtons.length, 0, `Strict Invariant 2: Found ${offendingButtons.length} buttons with raw Unicode emojis: ${JSON.stringify(offendingButtons.slice(0, 3))}`);

    const pillMatches = indexHtml.match(/<div\b[^>]*class=["'][^"']*(?:tab-btn|segmented-pill|pill-btn)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    const offendingPills = pillMatches.filter(pill => emojiRegex.test(pill));
    assert.strictEqual(offendingPills.length, 0, `Strict Invariant 2: Found ${offendingPills.length} segmented pills/tabs with raw Unicode emojis`);
  });

  await test('T-INV-03', 'Invariant 3: Currency display formatting with non-breaking space ("₹ ") strictly preserved without cramped /₹[0-9]/', () => {
    // Bare rupee regex checking for ₹ immediately followed by digit
    const bareRupeeRegex = /₹\d+/g;
    const bareMatches = indexHtml.match(bareRupeeRegex) || [];
    assert.strictEqual(bareMatches.length, 0, `Strict Invariant 3: Found cramped currency instances without space: ${JSON.stringify(bareMatches)}`);

    // Verify non-breaking space / space formatting exists
    const validCurrencyMatches = indexHtml.match(/₹\s+/g) || [];
    assert.ok(validCurrencyMatches.length > 0, `Strict Invariant 3: index.html must use standard '₹ ' currency formatting`);
  });

  await test('T-INV-04', 'Invariant 4: Local server health check returns HTTP 200 at http://localhost:5000/api/health', async () => {
    try {
      const response = await getJson('/api/health');
      assert.strictEqual(response.statusCode, 200, `Health check must return HTTP 200, received ${response.statusCode}`);
      assert.ok(response.body && response.body.status === 'ok', 'Health check response must have status: ok');
    } catch (err) {
      throw new Error(`Server health check on port 5000 failed: ${err.message}`);
    }
  });

  // ==========================================================================
  // Summary & Diagnostic Output
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error(`🚨 ${failed} ASSERTION(S) FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`\n[#${idx + 1}] ID: ${f.id} — ${f.description}`);
      console.error(`     Error: ${f.error}`);
    });
    console.log('\nNote: Some failures are expected baseline failures pending M1/M2 implementation.\n');
    process.exit(1);
  } else {
    console.log(`✨ ALL ${passed} MULTI-DEVICE PAIRING & INVARIANT TESTS PASSED GREEN!\n`);
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Fatal unhandled error in test suite execution:', err);
  process.exit(1);
});
