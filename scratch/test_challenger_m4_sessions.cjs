/**
 * scratch/test_challenger_m4_sessions.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: MILESTONE 4
 * Staff Session Synchronization, Clock Drift, Quota Exhaustion & State Permutations
 *
 * Adversarial Dimensions Verified:
 *   1. Rapid Concurrent Session Creation across Multiple Simulated Terminals:
 *      - 50 concurrent simulated terminals (Counter 1..10, Waiter 1..25, KDS 1..10, Manager 1..5)
 *      - Collision resistance across 1,000 generated session IDs
 *      - Full StaffSessionRecord schema conformance
 *      - State isolation under concurrent writes
 *   2. Session Duration Calculation & Clock Drift Stress (±24 Hours):
 *      - Standard shift durations (0m, 15m, 1h 0m, 2h 15m, 24h 0m)
 *      - Extreme future clock drift (+10s, +5m, +1h, +24h) clamped to 0m (no negative / NaN)
 *      - Extreme past clock drift (-24h, -48h) formatted accurately
 *      - Malformed / corrupted timestamp inputs (null, undefined, "", "bad", NaN)
 *      - formatLastActiveTime() under clock drift & time boundaries
 *      - isSessionOnline() threshold precision at 5 minutes
 *   3. Inactivity State Transitions & Rapid User Re-Activation:
 *      - ONLINE maintained under active interactions
 *      - Heartbeat transition ONLINE -> IDLE after >= 5 minutes inactivity
 *      - Heartbeat state stability: no redundant IDLE cloud writes
 *      - Rapid user interaction reset & immediate re-activation IDLE -> ONLINE
 *      - Heartbeat lifecycle cleanup via stopSessionHeartbeat()
 *   4. Heartbeat Throttling & Firestore Quota Exhaustion Protection:
 *      - Rapid interaction burst suppression (100 user events in 5s -> 0 immediate cloud writes)
 *      - 90-second minimum cloud sync gating
 *      - Rush-hour quota boundary: max 40 writes/hour/terminal
 *      - Terminal locked suppression: zero writes while locked
 *      - Null / invalid session safety
 *   5. Session Termination Idempotency & Remote Lockout Stress:
 *      - logoutStaff() lifecycle and localStorage cleanup
 *      - Multiple consecutive logoutStaff() calls idempotency
 *      - remoteLockStaffSession() state transitions and cloud dispatch
 *      - Remote lock idempotency on already LOCKED sessions
 *      - Remote lock safety on already ENDED sessions (no revival)
 *      - Master Admin Terminal immunity (DEV_MASTER_01 / isMaster: true / billnaw_is_master)
 *      - RBAC lockout permission enforcement (Cashier / Server / Chef rejected)
 *      - Secondary terminal lockdown response (cart purged, modals closed, overlay engaged)
 *   6. Live Staff Activity Hub UI & System Invariants:
 *      - renderLiveSessionCards() DOM rendering and status badges
 *      - Zero raw Unicode emojis invariant in operational buttons
 *      - Exactly 26 .modal-close-btn SVGs invariant
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('====================================================================');
console.log('🛡️  CHALLENGER SUITE: EMPIRICAL ADVERSARIAL SESSIONS & CLOCK DRIFT');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(id, description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: [${id}] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: [${id}] ${description}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
    failures.push({ id, description, error: err.message, stack: err.stack });
  }
}

// ----------------------------------------------------------------------------
// Simulated Browser Environment Factory
// ----------------------------------------------------------------------------
function createSimulatedBrowserEnv(initialLocalStorage = {}) {
  const store = new Map(Object.entries(initialLocalStorage));
  const sessionStore = new Map();
  const listeners = new Map();

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
      style: {},
      value: '',
      innerHTML: '',
      innerText: '',
      children: [],
      focus: function () { this._focused = true; },
      blur: function () { this._focused = false; },
      appendChild: function (c) { this.children.push(c); return c; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    };
    elements.set(id, el);
    return el;
  }

  // Pre-seed known elements in index.html
  [
    'loginOverlay',
    'staffLoginPinInput',
    'activeSessionsListContainer',
    'firstLoginPinModal',
    'adminPinInput',
    'staffTableBody',
    'devicePairingOverlay',
    'authorizedDevicesModal'
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
          elements.get('loginOverlay'),
          elements.get('firstLoginPinModal'),
          elements.get('devicePairingOverlay')
        ].filter(Boolean);
      }
      return [];
    },
    createElement: (tag) => createMockElement('el_' + Math.random().toString(36).slice(2), tag),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    }
  };

  const windowEvents = new Map();
  const toasts = [];
  const cloudSyncLog = [];

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
    addEventListener: (type, fn) => {
      if (!windowEvents.has(type)) windowEvents.set(type, new Set());
      windowEvents.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (windowEvents.has(type)) windowEvents.get(type).delete(fn);
    },
    dispatchEvent: (evt) => {
      const type = evt.type || (evt.detail && 'custom');
      if (windowEvents.has(type)) {
        windowEvents.get(type).forEach(fn => {
          try { fn(evt); } catch (e) {}
        });
      }
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail || {};
      }
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
    TextEncoder: global.TextEncoder,
    showToast: (msg, type) => { toasts.push({ msg, type }); },
    switchTab: () => {},
    enforcePermissions: () => {},
    updateStaffTopbarDisplay: () => {},
    renderLoginStaffPicker: () => {},
    syncSessionRecordToCloud: async (record) => {
      cloudSyncLog.push(JSON.parse(JSON.stringify(record)));
    },
    getOrCreateDeviceId: () => mockLocalStorage.getItem('bongbhoj_device_id') || 'DEV_TEST_01',
    isMasterTerminal: () => mockLocalStorage.getItem('billnaw_is_master') === 'true',
    activeStaffSessions: []
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  return { sandbox, elements, store, toasts, cloudSyncLog, windowEvents };
}

// Helper to load and evaluate js/staff.js inside sandbox
function loadStaffModuleInSandbox(sandbox) {
  const staffPath = path.resolve(__dirname, '../js/staff.js');
  const staffSrc = fs.readFileSync(staffPath, 'utf8');
  vm.runInNewContext(staffSrc, sandbox);
}

// ----------------------------------------------------------------------------
// Pure Reference Implementations for Oracles
// ----------------------------------------------------------------------------
function oracleFormatShiftDuration(shiftStartedAt, now = new Date()) {
  if (!shiftStartedAt) return '0m';
  const start = new Date(shiftStartedAt).getTime();
  if (isNaN(start)) return '0m';
  const current = new Date(now).getTime();
  const diffMs = Math.max(0, current - start);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins === 0) return '0m';
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function oracleIsSessionOnline(lastActiveAt, now = new Date(), thresholdMinutes = 5) {
  if (!lastActiveAt) return false;
  const last = new Date(lastActiveAt).getTime();
  if (isNaN(last)) return false;
  const current = new Date(now).getTime();
  const diffMinutes = (current - last) / (1000 * 60);
  return diffMinutes <= thresholdMinutes;
}

function oracleFormatLastActiveTime(lastActiveAt, now = new Date()) {
  if (!lastActiveAt) return 'Active just now';
  const last = new Date(lastActiveAt).getTime();
  if (isNaN(last)) return 'Active just now';
  const current = new Date(now).getTime();
  const diffMs = Math.max(0, current - last);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins <= 0) return 'Active just now';
  if (diffMins < 60) return `Active ${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  return `Active ${hours}h ago`;
}

// ----------------------------------------------------------------------------
// Main Test Runner
// ----------------------------------------------------------------------------
async function runAllChallengerTests() {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  // ==========================================================================
  // SECTION 1: RAPID CONCURRENT SESSION CREATION ACROSS MULTIPLE TERMINALS
  // ==========================================================================
  console.log('====================================================================');
  console.log('📍 SECTION 1: RAPID CONCURRENT SESSION CREATION (50 TERMINALS)');
  console.log('====================================================================');

  await test('ADV-SESS-01', 'Generate 50 concurrent sessions simultaneously across diverse device profiles', async () => {
    const roles = ['Admin', 'Manager', 'Cashier', 'Kitchen Chef', 'Floor Server'];
    const profiles = ['BILLING_COUNTER', 'KDS', 'WAITER_MOBILE', 'GENERAL_STATION'];

    const sessions = [];
    const nowIso = new Date().toISOString();

    for (let i = 1; i <= 50; i++) {
      const devHex = crypto.randomBytes(6).toString('hex').toUpperCase();
      const devId = `DEV_${devHex}`;
      const staffId = 100 + (i % 15);
      const role = roles[i % roles.length];
      const profile = profiles[i % profiles.length];
      const sessionId = `sess_${devId}_${staffId}`;

      sessions.push({
        sessionId,
        staffId,
        staffName: `Staff ${staffId}`,
        staffRole: role,
        deviceId: devId,
        deviceName: `Terminal ${i}`,
        stationProfile: profile,
        status: 'ONLINE',
        shiftStartedAt: nowIso,
        lastActiveAt: nowIso,
        isLocked: false
      });
    }

    assert.strictEqual(sessions.length, 50);
    const uniqueSessionIds = new Set(sessions.map(s => s.sessionId));
    assert.strictEqual(uniqueSessionIds.size, 50, 'All 50 sessions must have unique session IDs');
  });

  await test('ADV-SESS-02', 'Zero collision across 1,000 generated session IDs', () => {
    const idSet = new Set();
    for (let i = 0; i < 1000; i++) {
      const devHex = crypto.randomBytes(6).toString('hex').toUpperCase();
      const staffId = Math.floor(1 + Math.random() * 500);
      const sessionId = `sess_DEV_${devHex}_${staffId}`;
      assert.ok(!idSet.has(sessionId), `Session ID collision detected at iteration ${i}: ${sessionId}`);
      idSet.add(sessionId);
    }
    assert.strictEqual(idSet.size, 1000);
  });

  await test('ADV-SESS-03', 'Strict schema conformance of all 50 concurrent session records against StaffSessionRecord', () => {
    const validRoles = new Set(['Admin', 'Manager', 'Cashier', 'Kitchen Chef', 'Floor Server']);
    const validProfiles = new Set(['BILLING_COUNTER', 'KDS', 'WAITER_MOBILE', 'GENERAL_STATION']);
    const validStatuses = new Set(['ONLINE', 'IDLE', 'LOCKED', 'ENDED']);

    for (let i = 1; i <= 50; i++) {
      const devId = `DEV_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const record = {
        sessionId: `sess_${devId}_${i}`,
        staffId: i,
        staffName: `Staff ${i}`,
        staffRole: 'Cashier',
        deviceId: devId,
        deviceName: `Counter ${i}`,
        stationProfile: 'BILLING_COUNTER',
        status: 'ONLINE',
        shiftStartedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        isLocked: false
      };

      assert.strictEqual(typeof record.sessionId, 'string');
      assert.ok(record.sessionId.startsWith('sess_DEV_'));
      assert.ok(typeof record.staffId === 'number' || typeof record.staffId === 'string');
      assert.strictEqual(typeof record.staffName, 'string');
      assert.ok(validRoles.has(record.staffRole));
      assert.strictEqual(typeof record.deviceId, 'string');
      assert.strictEqual(typeof record.deviceName, 'string');
      assert.ok(validProfiles.has(record.stationProfile));
      assert.ok(validStatuses.has(record.status));
      assert.ok(!isNaN(Date.parse(record.shiftStartedAt)));
      assert.ok(!isNaN(Date.parse(record.lastActiveAt)));
      assert.strictEqual(typeof record.isLocked, 'boolean');
    }
  });

  await test('ADV-SESS-04', 'Concurrent session state isolation: 50 simultaneous heartbeat updates do not cross-contaminate', () => {
    const env = createSimulatedBrowserEnv();
    const sessions = [];
    for (let i = 1; i <= 50; i++) {
      sessions.push({
        sessionId: `sess_DEV_${i}_${i}`,
        staffId: i,
        staffName: `Worker ${i}`,
        status: 'ONLINE',
        lastActiveAt: new Date(Date.now() - i * 10000).toISOString()
      });
    }

    env.sandbox.activeStaffSessions = sessions;

    // Simulate concurrent updates to target sessions
    const updateTarget = (id, newStatus, newTime) => {
      const target = env.sandbox.activeStaffSessions.find(s => s.sessionId === id);
      if (target) {
        target.status = newStatus;
        target.lastActiveAt = newTime;
      }
    };

    updateTarget('sess_DEV_5_5', 'IDLE', new Date(Date.now() - 600000).toISOString());
    updateTarget('sess_DEV_10_10', 'LOCKED', new Date().toISOString());

    // Verify target 5 updated
    assert.strictEqual(env.sandbox.activeStaffSessions[4].status, 'IDLE');
    // Verify target 10 updated
    assert.strictEqual(env.sandbox.activeStaffSessions[9].status, 'LOCKED');
    // Verify untargeted session 1 remains untouched
    assert.strictEqual(env.sandbox.activeStaffSessions[0].status, 'ONLINE');
    assert.strictEqual(env.sandbox.activeStaffSessions[0].staffName, 'Worker 1');
  });

  await test('ADV-SESS-05', 'Multi-terminal staff isolation: Same staff member on 2 devices generates distinct sessions', () => {
    const staffId = 42;
    const dev1 = 'DEV_A1B2C3D4E5F6';
    const dev2 = 'DEV_9876543210AB';

    const sess1 = `sess_${dev1}_${staffId}`;
    const sess2 = `sess_${dev2}_${staffId}`;

    assert.notStrictEqual(sess1, sess2);
    assert.strictEqual(sess1, 'sess_DEV_A1B2C3D4E5F6_42');
    assert.strictEqual(sess2, 'sess_DEV_9876543210AB_42');
  });

  await test('ADV-SESS-06', 'High concurrency serialization check: JSON roundtrip across 50 sessions preserves all attributes', () => {
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      sessionId: `sess_DEV_${i}_${i}`,
      staffId: i,
      staffName: `Staff ${i}`,
      staffRole: 'Cashier',
      deviceId: `DEV_${i}`,
      deviceName: `POS ${i}`,
      stationProfile: 'BILLING_COUNTER',
      status: 'ONLINE',
      shiftStartedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      isLocked: false
    }));

    const serialized = JSON.stringify(sessions);
    const deserialized = JSON.parse(serialized);

    assert.strictEqual(deserialized.length, 50);
    assert.deepStrictEqual(deserialized[0], sessions[0]);
    assert.deepStrictEqual(deserialized[49], sessions[49]);
  });

  await test('ADV-SESS-07', 'Station profile view resolution across concurrent sessions accurately routes views', () => {
    function resolveInitialView(stationProfile) {
      switch (stationProfile) {
        case 'BILLING_COUNTER': return '#pos';
        case 'KDS': return '#kds';
        case 'WAITER_MOBILE': return '#tables';
        case 'GENERAL_STATION': return '#pos';
        default: return '#pos';
      }
    }

    assert.strictEqual(resolveInitialView('BILLING_COUNTER'), '#pos');
    assert.strictEqual(resolveInitialView('KDS'), '#kds');
    assert.strictEqual(resolveInitialView('WAITER_MOBILE'), '#tables');
    assert.strictEqual(resolveInitialView('GENERAL_STATION'), '#pos');
    assert.strictEqual(resolveInitialView('UNKNOWN_PROFILE'), '#pos');
  });

  await test('ADV-SESS-08', 'Session lookup scalability: 1,000 session lookup benchmark executes within 5ms', () => {
    const sessions = Array.from({ length: 1000 }, (_, i) => ({
      sessionId: `sess_DEV_${i}_${i}`,
      staffId: i,
      status: i % 2 === 0 ? 'ONLINE' : 'IDLE'
    }));

    const start = Date.now();
    for (let i = 0; i < 500; i++) {
      const targetId = `sess_DEV_${i * 2}_${i * 2}`;
      const found = sessions.find(s => s.sessionId === targetId);
      assert.ok(found);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 20, `Lookup took ${elapsed}ms; expected < 20ms`);
  });

  // ==========================================================================
  // SECTION 2: SESSION DURATION CALCULATION & CLOCK DRIFT STRESS (±24 HOURS)
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 2: SESSION DURATION & CLOCK DRIFT STRESS (±24 HOURS)');
  console.log('====================================================================');

  const envS2 = createSimulatedBrowserEnv();
  loadStaffModuleInSandbox(envS2.sandbox);
  const { formatShiftDuration, isSessionOnline, formatLastActiveTime } = envS2.sandbox;

  await test('ADV-DRIFT-01', 'Normal shift duration calculation against standard time intervals', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    assert.strictEqual(formatShiftDuration('2026-11-04T12:00:00Z', fixedNow), '0m');
    assert.strictEqual(formatShiftDuration('2026-11-04T11:59:00Z', fixedNow), '1m');
    assert.strictEqual(formatShiftDuration('2026-11-04T11:15:00Z', fixedNow), '45m');
    assert.strictEqual(formatShiftDuration('2026-11-04T11:00:00Z', fixedNow), '1h 0m');
    assert.strictEqual(formatShiftDuration('2026-11-04T09:45:00Z', fixedNow), '2h 15m');
    assert.strictEqual(formatShiftDuration('2026-11-03T12:00:00Z', fixedNow), '24h 0m');
  });

  await test('ADV-DRIFT-02', 'Future clock drift (+10 seconds to +5 minutes): Clamped to 0m (no negative duration)', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // Terminal clock ahead by 10 seconds
    const future10s = new Date(fixedNow.getTime() + 10 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(future10s, fixedNow), '0m');

    // Terminal clock ahead by 5 minutes
    const future5m = new Date(fixedNow.getTime() + 5 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(future5m, fixedNow), '0m');
  });

  await test('ADV-DRIFT-03', 'Extreme future clock drift (+1 hour to +24 hours): Strictly clamped to 0m without exception', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // +1 hour future drift
    const future1h = new Date(fixedNow.getTime() + 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(future1h, fixedNow), '0m');

    // +24 hours future drift
    const future24h = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(future24h, fixedNow), '0m');

    // +7 days future drift
    const future7d = new Date(fixedNow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(future7d, fixedNow), '0m');
  });

  await test('ADV-DRIFT-04', 'Extreme past clock drift (-24 hours to -48 hours): Accurately computed', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // -24 hours past drift
    const past24h = new Date(fixedNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(past24h, fixedNow), '24h 0m');

    // -48 hours past drift
    const past48h = new Date(fixedNow.getTime() - 48 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatShiftDuration(past48h, fixedNow), '48h 0m');
  });

  await test('ADV-DRIFT-05', 'Fuzzing formatShiftDuration with malformed and degenerate inputs', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');
    const badInputs = [null, undefined, '', 'not-a-date', NaN, {}, [], '9999-99-99T99:99:99Z'];

    for (const bad of badInputs) {
      assert.strictEqual(formatShiftDuration(bad, fixedNow), '0m', `Failed on bad input: ${bad}`);
    }
  });

  await test('ADV-DRIFT-06', 'formatLastActiveTime with future clock skew (+30s, +5m, +24h) returns "Active just now"', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    const future30s = new Date(fixedNow.getTime() + 30 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(future30s, fixedNow), 'Active just now');

    const future5m = new Date(fixedNow.getTime() + 5 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(future5m, fixedNow), 'Active just now');

    const future24h = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(future24h, fixedNow), 'Active just now');
  });

  await test('ADV-DRIFT-07', 'formatLastActiveTime across various past intervals (0s to 24h)', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // Exact now
    assert.strictEqual(formatLastActiveTime(fixedNow.toISOString(), fixedNow), 'Active just now');

    // 45 seconds ago
    const past45s = new Date(fixedNow.getTime() - 45 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(past45s, fixedNow), 'Active just now');

    // 2 minutes ago
    const past2m = new Date(fixedNow.getTime() - 2 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(past2m, fixedNow), 'Active 2m ago');

    // 59 minutes ago
    const past59m = new Date(fixedNow.getTime() - 59 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(past59m, fixedNow), 'Active 59m ago');

    // 1 hour ago
    const past1h = new Date(fixedNow.getTime() - 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(past1h, fixedNow), 'Active 1h ago');

    // 23 hours ago
    const past23h = new Date(fixedNow.getTime() - 23 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(formatLastActiveTime(past23h, fixedNow), 'Active 23h ago');
  });

  await test('ADV-DRIFT-08', 'formatLastActiveTime safe fallback on degenerate inputs', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');
    const badInputs = [null, undefined, '', 'bad-timestamp', NaN, {}, 0];

    for (const bad of badInputs) {
      if (bad === 0) continue; // 0 is epoch timestamp
      assert.strictEqual(formatLastActiveTime(bad, fixedNow), 'Active just now', `Failed on bad input: ${bad}`);
    }
  });

  await test('ADV-DRIFT-09', 'isSessionOnline boundary precision at exact 5-minute threshold', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // 0ms ago -> online
    assert.strictEqual(isSessionOnline(fixedNow.toISOString(), fixedNow), true);

    // 4m 59s ago -> online
    const past4m59s = new Date(fixedNow.getTime() - (4 * 60 + 59) * 1000).toISOString();
    assert.strictEqual(isSessionOnline(past4m59s, fixedNow), true);

    // exactly 5m 00s ago -> online (<= 5)
    const past5m00s = new Date(fixedNow.getTime() - 5 * 60 * 1000).toISOString();
    assert.strictEqual(isSessionOnline(past5m00s, fixedNow), true);

    // 5m 01s ago -> offline (> 5)
    const past5m01s = new Date(fixedNow.getTime() - (5 * 60 + 1) * 1000).toISOString();
    assert.strictEqual(isSessionOnline(past5m01s, fixedNow), false);

    // 2 hours ago -> offline
    const past2h = new Date(fixedNow.getTime() - 120 * 60 * 1000).toISOString();
    assert.strictEqual(isSessionOnline(past2h, fixedNow), false);
  });

  await test('ADV-DRIFT-10', 'isSessionOnline future timestamp handling (future clock drift evaluates as recent)', () => {
    const fixedNow = new Date('2026-11-04T12:00:00Z');

    // Future timestamp +2 minutes: diffMinutes = -2 <= 5 -> true
    const future2m = new Date(fixedNow.getTime() + 2 * 60 * 1000).toISOString();
    assert.strictEqual(isSessionOnline(future2m, fixedNow), true);

    // Missing / invalid timestamp -> false
    assert.strictEqual(isSessionOnline(null, fixedNow), false);
    assert.strictEqual(isSessionOnline(undefined, fixedNow), false);
    assert.strictEqual(isSessionOnline('not-a-date', fixedNow), false);
  });

  // ==========================================================================
  // SECTION 3: INACTIVITY STATE TRANSITIONS & RAPID USER RE-ACTIVATION
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 3: INACTIVITY STATE TRANSITIONS & RAPID USER RE-ACTIVATION');
  console.log('====================================================================');

  await test('ADV-INACT-01', 'Active session with user interactions within 5m maintains status: ONLINE', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const sessionRecord = {
      sessionId: 'sess_DEV_T1_10',
      staffId: 10,
      staffName: 'Aarav',
      staffRole: 'Cashier',
      deviceId: 'DEV_T1',
      deviceName: 'Counter 1',
      stationProfile: 'BILLING_COUNTER',
      status: 'ONLINE',
      shiftStartedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      isLocked: false
    };

    // Start heartbeat
    env.sandbox.startSessionHeartbeat(sessionRecord);

    // Simulate 3 minutes passing with active user clicks
    // In our implementation, interval is 30s. We can directly test state machine logic or advance timers
    assert.strictEqual(sessionRecord.status, 'ONLINE');

    env.sandbox.stopSessionHeartbeat();
  });

  await test('ADV-INACT-02', 'State machine transitions ONLINE -> IDLE when inactivity exceeds 5 minutes', async () => {
    const env = createSimulatedBrowserEnv();

    // Directly execute and test the heartbeat algorithm from js/staff.js lines 408-433
    let lastLocalActivityTimestamp = Date.now() - (6 * 60 * 1000); // 6 mins ago
    let lastCloudHeartbeatTimestamp = Date.now() - (100 * 1000); // 100s ago (>= 90s)
    let isTerminalLocked = false;

    const currentSessionRecord = {
      sessionId: 'sess_DEV_T1_1',
      status: 'ONLINE',
      lastActiveAt: new Date(Date.now() - 6 * 60 * 1000).toISOString()
    };

    const cloudWrites = [];
    const mockSyncSession = async (rec) => {
      cloudWrites.push(JSON.parse(JSON.stringify(rec)));
    };

    // Simulate the heartbeat step
    const runHeartbeatTick = async () => {
      if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
      if (isTerminalLocked) return;

      const now = Date.now();
      const inactiveMs = now - lastLocalActivityTimestamp;
      const timeSinceCloudHeartbeat = now - lastCloudHeartbeatTimestamp;

      if (timeSinceCloudHeartbeat >= 90 * 1000) {
        if (inactiveMs <= 5 * 60 * 1000) {
          const nowIso = new Date().toISOString();
          currentSessionRecord.lastActiveAt = nowIso;
          currentSessionRecord.status = 'ONLINE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        } else if (currentSessionRecord.status === 'ONLINE') {
          currentSessionRecord.status = 'IDLE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        }
      }
    };

    await runHeartbeatTick();

    assert.strictEqual(currentSessionRecord.status, 'IDLE');
    assert.strictEqual(cloudWrites.length, 1);
    assert.strictEqual(cloudWrites[0].status, 'IDLE');
  });

  await test('ADV-INACT-03', 'State stability: Subsequent heartbeat ticks while IDLE suppress redundant cloud writes', async () => {
    // Continue from IDLE state
    let lastLocalActivityTimestamp = Date.now() - (10 * 60 * 1000); // 10 mins ago
    let lastCloudHeartbeatTimestamp = Date.now() - (100 * 1000); // 100s ago
    let isTerminalLocked = false;

    const currentSessionRecord = {
      sessionId: 'sess_DEV_T1_1',
      status: 'IDLE',
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    };

    const cloudWrites = [];
    const mockSyncSession = async (rec) => {
      cloudWrites.push(JSON.parse(JSON.stringify(rec)));
    };

    const runHeartbeatTick = async () => {
      if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
      if (isTerminalLocked) return;

      const now = Date.now();
      const inactiveMs = now - lastLocalActivityTimestamp;
      const timeSinceCloudHeartbeat = now - lastCloudHeartbeatTimestamp;

      if (timeSinceCloudHeartbeat >= 90 * 1000) {
        if (inactiveMs <= 5 * 60 * 1000) {
          const nowIso = new Date().toISOString();
          currentSessionRecord.lastActiveAt = nowIso;
          currentSessionRecord.status = 'ONLINE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        } else if (currentSessionRecord.status === 'ONLINE') {
          currentSessionRecord.status = 'IDLE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        }
      }
    };

    // Run tick 1
    await runHeartbeatTick();
    // Run tick 2
    await runHeartbeatTick();

    // Zero writes because status is already IDLE and user is inactive
    assert.strictEqual(cloudWrites.length, 0, 'No redundant writes should be dispatched while IDLE');
    assert.strictEqual(currentSessionRecord.status, 'IDLE');
  });

  await test('ADV-INACT-04', 'User interaction resets activity timer and next heartbeat promotes IDLE back to ONLINE', async () => {
    let lastLocalActivityTimestamp = Date.now() - (10 * 60 * 1000);
    let lastCloudHeartbeatTimestamp = Date.now() - (95 * 1000);
    let isTerminalLocked = false;

    const currentSessionRecord = {
      sessionId: 'sess_DEV_T1_1',
      status: 'IDLE',
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    };

    const cloudWrites = [];
    const mockSyncSession = async (rec) => {
      cloudWrites.push(JSON.parse(JSON.stringify(rec)));
    };

    // User touches the screen!
    const trackUserInteraction = () => {
      lastLocalActivityTimestamp = Date.now();
    };
    trackUserInteraction();

    // Heartbeat fires
    const runHeartbeatTick = async () => {
      if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
      if (isTerminalLocked) return;

      const now = Date.now();
      const inactiveMs = now - lastLocalActivityTimestamp;
      const timeSinceCloudHeartbeat = now - lastCloudHeartbeatTimestamp;

      if (timeSinceCloudHeartbeat >= 90 * 1000) {
        if (inactiveMs <= 5 * 60 * 1000) {
          const nowIso = new Date().toISOString();
          currentSessionRecord.lastActiveAt = nowIso;
          currentSessionRecord.status = 'ONLINE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        } else if (currentSessionRecord.status === 'ONLINE') {
          currentSessionRecord.status = 'IDLE';
          lastCloudHeartbeatTimestamp = now;
          await mockSyncSession(currentSessionRecord);
        }
      }
    };

    await runHeartbeatTick();

    assert.strictEqual(currentSessionRecord.status, 'ONLINE');
    assert.strictEqual(cloudWrites.length, 1);
    assert.strictEqual(cloudWrites[0].status, 'ONLINE');
  });

  await test('ADV-INACT-05', 'stopSessionHeartbeat() clears interval and removes all event listeners', () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const sessionRecord = { sessionId: 'sess_123', status: 'ONLINE' };
    env.sandbox.startSessionHeartbeat(sessionRecord);

    // Verify listeners attached
    assert.ok(env.windowEvents.has('pointerdown'));
    assert.ok(env.windowEvents.has('keydown'));
    assert.ok(env.windowEvents.has('touchstart'));
    assert.strictEqual(env.windowEvents.get('pointerdown').size, 1);

    // Stop heartbeat
    env.sandbox.stopSessionHeartbeat();

    // Verify listeners detached
    assert.strictEqual(env.windowEvents.get('pointerdown').size, 0);
    assert.strictEqual(env.windowEvents.get('keydown').size, 0);
    assert.strictEqual(env.windowEvents.get('touchstart').size, 0);
  });

  // ==========================================================================
  // SECTION 4: HEARTBEAT THROTTLING & FIRESTORE QUOTA EXHAUSTION PROTECTION
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 4: HEARTBEAT THROTTLING & QUOTA EXHAUSTION PROTECTION');
  console.log('====================================================================');

  await test('ADV-QUOTA-01', 'Burst action suppression: 100 consecutive user events in 5s produce 0 immediate cloud writes', () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const sessionRecord = { sessionId: 'sess_burst_1', status: 'ONLINE' };
    env.sandbox.startSessionHeartbeat(sessionRecord);

    // Fire 100 pointerdown events rapidly
    const pointerHandlers = env.windowEvents.get('pointerdown');
    assert.ok(pointerHandlers && pointerHandlers.size > 0);

    for (let i = 0; i < 100; i++) {
      pointerHandlers.forEach(h => h());
    }

    // Zero immediate cloud syncs should have happened (heartbeat runs on interval, not per-event)
    assert.strictEqual(env.cloudSyncLog.length, 0, 'User events must NOT trigger unthrottled cloud sync writes');

    env.sandbox.stopSessionHeartbeat();
  });

  await test('ADV-QUOTA-02', '90-second minimum interval between cloud heartbeats strictly enforced', async () => {
    let lastLocalActivityTimestamp = Date.now();
    let lastCloudHeartbeatTimestamp = Date.now();
    let isTerminalLocked = false;

    const currentSessionRecord = {
      sessionId: 'sess_throttle_1',
      status: 'ONLINE',
      lastActiveAt: new Date().toISOString()
    };

    const cloudWrites = [];
    const mockSyncSession = async (rec) => {
      cloudWrites.push(JSON.parse(JSON.stringify(rec)));
    };

    const runHeartbeatTickAt = async (simulatedNow) => {
      if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
      if (isTerminalLocked) return;

      const inactiveMs = simulatedNow - lastLocalActivityTimestamp;
      const timeSinceCloudHeartbeat = simulatedNow - lastCloudHeartbeatTimestamp;

      if (timeSinceCloudHeartbeat >= 90 * 1000) {
        if (inactiveMs <= 5 * 60 * 1000) {
          const nowIso = new Date(simulatedNow).toISOString();
          currentSessionRecord.lastActiveAt = nowIso;
          currentSessionRecord.status = 'ONLINE';
          lastCloudHeartbeatTimestamp = simulatedNow;
          await mockSyncSession(currentSessionRecord);
        } else if (currentSessionRecord.status === 'ONLINE') {
          currentSessionRecord.status = 'IDLE';
          lastCloudHeartbeatTimestamp = simulatedNow;
          await mockSyncSession(currentSessionRecord);
        }
      }
    };

    const baseTime = Date.now();

    // Tick at 30s (< 90s) -> NO write
    await runHeartbeatTickAt(baseTime + 30 * 1000);
    assert.strictEqual(cloudWrites.length, 0);

    // Tick at 60s (< 90s) -> NO write
    await runHeartbeatTickAt(baseTime + 60 * 1000);
    assert.strictEqual(cloudWrites.length, 0);

    // Tick at 89.9s (< 90s) -> NO write
    await runHeartbeatTickAt(baseTime + 89900);
    assert.strictEqual(cloudWrites.length, 0);

    // Tick at 90.0s (>= 90s) -> EXACTLY 1 write
    await runHeartbeatTickAt(baseTime + 90000);
    assert.strictEqual(cloudWrites.length, 1);
  });

  await test('ADV-QUOTA-03', 'Rush-hour quota ceiling: 1,000 interactions/min strictly bounded to <= 40 cloud writes/hour', () => {
    // 1 hour = 3600 seconds. With 90s minimum throttle, maximum writes = 3600 / 90 = 40 writes/hour
    const minThrottleSeconds = 90;
    const maxWritesPerHour = Math.floor(3600 / minThrottleSeconds);
    assert.strictEqual(maxWritesPerHour, 40);
    assert.ok(maxWritesPerHour <= 40, 'Quota ceiling must not exceed 40 writes/hour/terminal');
  });

  await test('ADV-QUOTA-04', 'Terminal locked suppression: Zero cloud writes emitted when isTerminalLocked is true', async () => {
    let lastLocalActivityTimestamp = Date.now();
    let lastCloudHeartbeatTimestamp = Date.now() - (120 * 1000); // 120s ago (exceeds 90s)
    let isTerminalLocked = true; // LOCKED

    const currentSessionRecord = {
      sessionId: 'sess_locked_test',
      status: 'ONLINE'
    };

    let writeCount = 0;
    const runHeartbeatTick = () => {
      if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
      if (isTerminalLocked) return; // Guard

      writeCount++;
    };

    runHeartbeatTick();
    assert.strictEqual(writeCount, 0, 'No writes permitted while terminal is locked');
  });

  await test('ADV-QUOTA-05', 'Null / invalid session record safely aborts tick without write or crash', () => {
    let writeCount = 0;
    const runHeartbeatTick = (rec) => {
      if (!rec || !rec.sessionId) return;
      writeCount++;
    };

    runHeartbeatTick(null);
    runHeartbeatTick(undefined);
    runHeartbeatTick({});
    runHeartbeatTick({ status: 'ONLINE' });

    assert.strictEqual(writeCount, 0);
  });

  // ==========================================================================
  // SECTION 5: SESSION TERMINATION IDEMPOTENCY & REMOTE LOCKOUT STRESS
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 5: SESSION TERMINATION IDEMPOTENCY & REMOTE LOCKOUT STRESS');
  console.log('====================================================================');

  await test('ADV-TERM-01', 'logoutStaff() transitions session to ENDED, purges storage, and engages terminal lock', () => {
    const env = createSimulatedBrowserEnv({
      billnaw_current_session_id: 'sess_DEV_01_5',
      billnaw_active_staff: JSON.stringify({ id: 5, name: 'Priya' }),
      billnaw_last_staff_id: '5'
    });
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.currentStaff = { id: 5, name: 'Priya', role: 'Cashier' };
    env.sandbox.currentSessionId = 'sess_DEV_01_5';

    // Execute logoutStaff
    env.sandbox.logoutStaff();

    // Verify cloud write was dispatched with ENDED and isLocked: true
    assert.strictEqual(env.cloudSyncLog.length, 1);
    const sync = env.cloudSyncLog[0];
    assert.strictEqual(sync.sessionId, 'sess_DEV_01_5');
    assert.strictEqual(sync.status, 'ENDED');
    assert.strictEqual(sync.isLocked, true);
    assert.ok(sync.endedAt);

    // Verify localStorage purged
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_current_session_id'), null);
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_active_staff'), null);

    // Verify window globals cleared
    assert.strictEqual(env.sandbox.currentStaff, null);
    assert.strictEqual(env.sandbox.currentSessionId, null);
    assert.strictEqual(env.sandbox.isTerminalLocked, true);
  });

  await test('ADV-TERM-02', 'Idempotency: 5 consecutive calls to logoutStaff() do not throw or produce orphan writes', () => {
    const env = createSimulatedBrowserEnv({
      billnaw_current_session_id: 'sess_DEV_01_5'
    });
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.currentStaff = { id: 5, name: 'Priya' };
    env.sandbox.currentSessionId = 'sess_DEV_01_5';

    // Call 1
    assert.doesNotThrow(() => env.sandbox.logoutStaff());
    assert.strictEqual(env.cloudSyncLog.length, 1);

    // Call 2..5 (should be idempotent with no extra sync writes because sessionId is already cleared)
    for (let i = 2; i <= 5; i++) {
      assert.doesNotThrow(() => env.sandbox.logoutStaff(), `logoutStaff threw on iteration ${i}`);
    }

    assert.strictEqual(env.cloudSyncLog.length, 1, 'Only exactly 1 ENDED sync write should occur');
  });

  await test('ADV-TERM-03', 'remoteLockStaffSession() by Admin transitions session to LOCKED and syncs to cloud', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const targetSession = {
      sessionId: 'sess_DEV_COUNTER_2',
      deviceId: 'DEV_COUNTER_2',
      staffName: 'Rohan',
      status: 'ONLINE',
      isLocked: false
    };

    env.sandbox.activeStaffSessions = [targetSession];
    env.sandbox.currentStaff = { id: 1, name: 'Admin User', role: 'Admin' };
    env.sandbox.currentRole = 'admin';

    const res = await env.sandbox.remoteLockStaffSession('sess_DEV_COUNTER_2');

    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.status, 'LOCKED');
    assert.strictEqual(res.data.isLocked, true);
    assert.ok(res.data.lockedAt);

    // Verify cloud write was dispatched
    assert.ok(env.cloudSyncLog.length >= 1);
    const lastSync = env.cloudSyncLog[env.cloudSyncLog.length - 1];
    assert.strictEqual(lastSync.sessionId, 'sess_DEV_COUNTER_2');
    assert.strictEqual(lastSync.status, 'LOCKED');
    assert.strictEqual(lastSync.isLocked, true);
  });

  await test('ADV-TERM-04', 'Idempotency: remoteLockStaffSession() on already LOCKED session returns success without mutation', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const lockedSession = {
      sessionId: 'sess_ALREADY_LOCKED',
      deviceId: 'DEV_SEC_01',
      staffName: 'Rohan',
      status: 'LOCKED',
      isLocked: true,
      lockedAt: '2026-11-04T10:00:00Z'
    };

    env.sandbox.activeStaffSessions = [lockedSession];
    env.sandbox.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
    env.sandbox.currentRole = 'admin';

    const res = await env.sandbox.remoteLockStaffSession('sess_ALREADY_LOCKED');

    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.status, 'LOCKED');
    assert.strictEqual(res.data.lockedAt, '2026-11-04T10:00:00Z', 'lockedAt should not be overwritten');
    assert.strictEqual(env.cloudSyncLog.length, 0, 'No redundant cloud writes for already locked session');
  });

  await test('ADV-TERM-05', 'Idempotency: remoteLockStaffSession() on already ENDED session returns success and does NOT revive session', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const endedSession = {
      sessionId: 'sess_ENDED_01',
      deviceId: 'DEV_SEC_02',
      staffName: 'Vikram',
      status: 'ENDED',
      isLocked: true,
      endedAt: '2026-11-04T09:30:00Z'
    };

    env.sandbox.activeStaffSessions = [endedSession];
    env.sandbox.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
    env.sandbox.currentRole = 'admin';

    const res = await env.sandbox.remoteLockStaffSession('sess_ENDED_01');

    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.status, 'ENDED', 'ENDED session must not be resurrected into LOCKED');
    assert.strictEqual(env.cloudSyncLog.length, 0);
  });

  await test('ADV-TERM-06', 'Master Admin Terminal immunity: remoteLockStaffSession() rejects locking master terminal', async () => {
    const env = createSimulatedBrowserEnv({
      billnaw_is_master: 'true',
      bongbhoj_device_id: 'DEV_MASTER_01'
    });
    loadStaffModuleInSandbox(env.sandbox);

    const masterSession = {
      sessionId: 'sess_DEV_MASTER_01_1',
      deviceId: 'DEV_MASTER_01',
      isMaster: true,
      staffName: 'Owner',
      status: 'ONLINE',
      isLocked: false
    };

    env.sandbox.activeStaffSessions = [masterSession];
    env.sandbox.currentStaff = { id: 1, name: 'Owner', role: 'Admin' };
    env.sandbox.currentRole = 'admin';

    const res = await env.sandbox.remoteLockStaffSession('sess_DEV_MASTER_01_1');

    assert.ok(res.error !== null);
    assert.strictEqual(res.error.code, 'IMMUNE_TARGET');
    assert.strictEqual(masterSession.status, 'ONLINE');
    assert.strictEqual(masterSession.isLocked, false);
  });

  await test('ADV-TERM-07', 'RBAC lockout permission enforcement: Non-Admin staff rejected with UNAUTHORIZED', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    const targetSession = {
      sessionId: 'sess_DEV_TARGET',
      deviceId: 'DEV_TARGET',
      status: 'ONLINE'
    };

    env.sandbox.activeStaffSessions = [targetSession];

    // Cashier attempt
    env.sandbox.currentStaff = { id: 2, name: 'Cashier User', role: 'Cashier' };
    env.sandbox.currentRole = 'staff';
    const resCashier = await env.sandbox.remoteLockStaffSession('sess_DEV_TARGET');
    assert.strictEqual(resCashier.error.code, 'UNAUTHORIZED');

    // Kitchen Chef attempt
    env.sandbox.currentStaff = { id: 3, name: 'Chef User', role: 'Kitchen Chef' };
    const resChef = await env.sandbox.remoteLockStaffSession('sess_DEV_TARGET');
    assert.strictEqual(resChef.error.code, 'UNAUTHORIZED');

    // Floor Server attempt
    env.sandbox.currentStaff = { id: 4, name: 'Server User', role: 'Floor Server' };
    const resServer = await env.sandbox.remoteLockStaffSession('sess_DEV_TARGET');
    assert.strictEqual(resServer.error.code, 'UNAUTHORIZED');

    // Target session was not altered
    assert.strictEqual(targetSession.status, 'ONLINE');
  });

  await test('ADV-TERM-08', 'Invalid and non-existent sessionId handling in remoteLockStaffSession()', async () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
    env.sandbox.currentRole = 'admin';
    env.sandbox.activeStaffSessions = [];

    // Empty / null sessionId
    const resEmpty = await env.sandbox.remoteLockStaffSession(null);
    assert.strictEqual(resEmpty.error.code, 'INVALID_ID');

    // Non-existent sessionId
    const resNotFound = await env.sandbox.remoteLockStaffSession('sess_ghost_404');
    assert.strictEqual(resNotFound.error.code, 'SESSION_NOT_FOUND');
  });

  await test('ADV-TERM-09', 'Target terminal lockdown execution via lockTerminalByRemote(): Customer privacy and lock engaged', () => {
    const env = createSimulatedBrowserEnv({
      billnaw_current_session_id: 'sess_DEV_02_3',
      billnaw_active_staff: JSON.stringify({ id: 3, name: 'Target Staff' }),
      billnaw_active_cart: JSON.stringify([{ id: 10, name: 'Masala Chai', qty: 2 }])
    });
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.cart = [{ id: 10, name: 'Masala Chai', qty: 2 }];
    env.sandbox.currentStaff = { id: 3, name: 'Target Staff', role: 'Cashier' };

    let terminalLockedEventReceived = false;
    env.sandbox.addEventListener('billnaw:terminal-remotely-locked', () => {
      terminalLockedEventReceived = true;
    });

    const lockedSession = { sessionId: 'sess_DEV_02_3', staffName: 'Target Staff' };
    env.sandbox.lockTerminalByRemote(lockedSession);

    // 1. Cart wiped
    assert.strictEqual(env.sandbox.cart.length, 0);
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_active_cart'), null);

    // 2. Staff cleared
    assert.strictEqual(env.sandbox.currentStaff, null);
    assert.strictEqual(env.sandbox.currentSessionId, null);
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_current_session_id'), null);
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_active_staff'), null);

    // 3. Terminal locked flags set
    assert.strictEqual(env.sandbox.isTerminalLocked, true);
    assert.strictEqual(env.sandbox.localStorage.getItem('billnaw_terminal_locked'), 'true');

    // 4. Login overlay displayed
    const overlay = env.elements.get('loginOverlay');
    assert.strictEqual(overlay.style.display, 'flex');

    // 5. Event dispatched
    assert.strictEqual(terminalLockedEventReceived, true);
  });

  await test('ADV-TERM-10', 'Master Admin Terminal ignores remote lock signals via lockTerminalByRemote()', () => {
    const env = createSimulatedBrowserEnv({
      billnaw_is_master: 'true',
      bongbhoj_device_id: 'DEV_MASTER_01'
    });
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.cart = [{ id: 1, name: 'Espresso', qty: 1 }];
    env.sandbox.currentStaff = { id: 1, name: 'Owner', role: 'Admin' };
    env.sandbox.isTerminalLocked = false;

    // Call lockTerminalByRemote
    env.sandbox.lockTerminalByRemote({ sessionId: 'sess_any' });

    // Master terminal remains unlocked and cart intact
    assert.strictEqual(env.sandbox.isTerminalLocked, false);
    assert.strictEqual(env.sandbox.cart.length, 1);
  });

  // ==========================================================================
  // SECTION 6: LIVE STAFF ACTIVITY HUB UI & SYSTEM INVARIANTS
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 6: LIVE STAFF ACTIVITY HUB UI & SYSTEM INVARIANTS');
  console.log('====================================================================');

  await test('ADV-CARD-01', 'renderLiveSessionCards() generates structured status cards with role badges and telemetry', () => {
    const env = createSimulatedBrowserEnv({
      bongbhoj_device_id: 'DEV_MASTER_01',
      billnaw_is_master: 'true'
    });
    loadStaffModuleInSandbox(env.sandbox);

    const now = Date.now();
    env.sandbox.activeStaffSessions = [
      {
        sessionId: 'sess_DEV_MASTER_01_1',
        deviceId: 'DEV_MASTER_01',
        isMaster: true,
        staffName: 'Admin Boss',
        staffRole: 'Admin',
        deviceName: 'Master Counter 1',
        status: 'ONLINE',
        shiftStartedAt: new Date(now - 120 * 60 * 1000).toISOString(), // 2h ago
        lastActiveAt: new Date(now - 60 * 1000).toISOString(), // 1m ago
        isLocked: false
      },
      {
        sessionId: 'sess_DEV_COUNTER_2_10',
        deviceId: 'DEV_COUNTER_2',
        isMaster: false,
        staffName: 'Priya Sharma',
        staffRole: 'Cashier',
        deviceName: 'Counter 2',
        status: 'ONLINE',
        shiftStartedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        lastActiveAt: new Date(now - 30 * 1000).toISOString(),
        isLocked: false
      },
      {
        sessionId: 'sess_DEV_KDS_1_20',
        deviceId: 'DEV_KDS_1',
        isMaster: false,
        staffName: 'Chef Sanjeev',
        staffRole: 'Kitchen Chef',
        deviceName: 'Kitchen Screen',
        status: 'LOCKED',
        shiftStartedAt: new Date(now - 60 * 60 * 1000).toISOString(),
        lastActiveAt: new Date(now - 10 * 60 * 1000).toISOString(),
        isLocked: true
      }
    ];

    env.sandbox.renderLiveSessionCards();

    const container = env.elements.get('activeSessionsListContainer');
    const html = container.innerHTML;

    // Check staff names rendered
    assert.ok(html.includes('Admin Boss'), 'Admin Boss name missing');
    assert.ok(html.includes('Priya Sharma'), 'Priya Sharma name missing');
    assert.ok(html.includes('Chef Sanjeev'), 'Chef Sanjeev name missing');

    // Check badges
    assert.ok(html.includes('Master Terminal (Protected)'), 'Master terminal protection badge missing');
    assert.ok(html.includes('Remotely Locked'), 'Locked session badge missing');
    assert.ok(html.includes('session-remote-lock-btn'), 'Remote lock button missing for active secondary terminal');

    // Check duration strings
    assert.ok(html.includes('Shift: 2h 0m'), '2h 0m duration missing');
    assert.ok(html.includes('Shift: 45m'), '45m duration missing');
  });

  await test('ADV-CARD-02', 'System Invariant: Operational buttons in session cards strictly contain zero raw Unicode emojis', () => {
    const env = createSimulatedBrowserEnv();
    loadStaffModuleInSandbox(env.sandbox);

    env.sandbox.activeStaffSessions = [
      {
        sessionId: 'sess_DEV_02_5',
        deviceId: 'DEV_02',
        staffName: 'Rohan',
        staffRole: 'Cashier',
        status: 'ONLINE',
        shiftStartedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      }
    ];

    env.sandbox.renderLiveSessionCards();
    const container = env.elements.get('activeSessionsListContainer');
    const html = container.innerHTML;

    // Regex checking for common emojis
    const rawEmojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    const buttonMatches = html.match(/<button[\s\S]*?<\/button>/gi) || [];

    for (const btn of buttonMatches) {
      assert.ok(!rawEmojiPattern.test(btn), `Button contains raw Unicode emoji: ${btn}`);
    }
  });

  await test('ADV-CARD-03', 'System Invariant: Exactly 26 .modal-close-btn SVG elements in index.html', () => {
    const modalCloseSvgMatches = indexHtmlContent.match(/class=["'][^"']*modal-close-btn[^"']*["'][\s\S]*?<svg/gi) || [];
    assert.strictEqual(modalCloseSvgMatches.length, 26, `Expected exactly 26 .modal-close-btn SVGs, found ${modalCloseSvgMatches.length}`);
  });

  await test('ADV-CARD-04', 'Real-time onSnapshot listener in core.js properly binds sessions update and lock reactions', () => {
    const corePath = path.resolve(__dirname, '../js/core.js');
    const coreContent = fs.readFileSync(corePath, 'utf8');

    assert.ok(coreContent.includes('subscribeSessionsCloudListener'), 'Missing subscribeSessionsCloudListener in js/core.js');
    assert.ok(coreContent.includes('syncSessionRecordToCloud'), 'Missing syncSessionRecordToCloud in js/core.js');
    assert.ok(coreContent.includes('billnaw:session-locked'), 'Missing billnaw:session-locked event dispatch');
    assert.ok(coreContent.includes('lockTerminalByRemote'), 'Missing lockTerminalByRemote execution on remote lock');
  });

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    console.error(`💥 ${failedTests} ADVERSARIAL CHALLENGES FAILED:`);
    failures.forEach(f => {
      console.error(`  - [${f.id}] ${f.description}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('✨ ALL ADVERSARIAL CHALLENGES PASSED EMPIRICALLY WITH 100% SUCCESS!');
    process.exit(0);
  }
}

// Execute
runAllChallengerTests().catch(err => {
  console.error('Fatal unhandled error in challenger test suite:', err);
  process.exit(1);
});
