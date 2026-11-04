/**
 * scratch/test_m2_adversarial_lockout_migration.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS: LOCKOUT THROTTLING & MIGRATION
 * Challenger 2: Deep Stress & Boundary Verification for Milestone 2 Iteration 2
 *
 * Scenarios:
 *   Part A: Brute-Force Lockout Throttling Under Adversarial Attacks
 *     [ADV-LOCK-01] Cross-Avatar attack: 4 failures on Staff A + 1 failure on Staff B triggers terminal lockout
 *     [ADV-LOCK-02] Lockout wall: Correct PIN entered at t=15s during active lockout is strictly rejected
 *     [ADV-LOCK-03] Precision millisecond boundary: t=29,900ms is blocked, t=30,100ms unlocks successfully
 *     [ADV-LOCK-04] Rapid burst fuzzing: 50 rapid-fire incorrect inputs keep terminal strictly locked
 *     [ADV-LOCK-05] Empty and whitespace inputs show prompt without penalizing failure counter
 *     [ADV-LOCK-06] Counter reset integrity: 4 failures followed by 1 success resets counter to 0
 *     [ADV-LOCK-07] Multi-cycle endurance: 3 consecutive lockout-expiry-unlock cycles maintain full integrity
 *     [ADV-LOCK-08] UI telemetry & tactile feedback: auth-box pin-shake animation triggers on bad PIN
 *
 *   Part B: Automatic Legacy Migration Deep Stress & Edge Cases
 *     [ADV-MIGR-01] Diverse PIN types: string, numeric 1234, leading-zero "0123", whitespace padded " 8492 "
 *     [ADV-MIGR-02] Dual-naming contract: pin_salt === pinSalt and pin_hash === pinHash on all migrated records
 *     [ADV-MIGR-03] Idempotency stress: 50 back-to-back migration passes cause zero hash mutations or salt drift
 *     [ADV-MIGR-04] On-the-fly verifyStaffPin migration resilience with immediate authentication & invalid PIN denial
 *     [ADV-MIGR-05] Corrupted/malformed records: missing pin and pin_hash handled safely without uncaught exceptions
 *     [ADV-MIGR-06] Large fleet migration: 100 legacy staff members migrated concurrently with 100 unique salts
 *
 *   Part C: Trivial PIN Hardening & Error Text Preservation
 *     [ADV-TRIV-01] All 10 repetitive 4-digit PINs (0000..9999) rejected with "non-trivial PIN" error text
 *     [ADV-TRIV-02] Sequential PINs 1234 and 4321 rejected with "non-trivial PIN" error text
 *     [ADV-TRIV-03] Non-trivial PINs (5821, 8492, 1984, 2026, 7391) accepted with refreshed salt and hash
 *
 * Execution:
 *   node scratch/test_m2_adversarial_lockout_migration.cjs
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('====================================================================');
console.log('🔥 ADV-STRESS: BRUTE-FORCE LOCKOUT & LEGACY MIGRATION ENGINE');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

function refHash(pin, salt) {
  const p = String(pin).trim();
  const s = String(salt).trim();
  return crypto.createHash('sha256').update(`${p}:${s}:billnaw_pin_v2`).digest('hex');
}

function buildSandbox() {
  const storage = {};
  const idbStore = {};
  const toasts = [];
  const classesAdded = [];

  const mockAuthBox = {
    classList: {
      add: (cls) => classesAdded.push({ action: 'add', cls, at: Date.now() }),
      remove: (cls) => classesAdded.push({ action: 'remove', cls, at: Date.now() })
    },
    offsetWidth: 120
  };

  const domElements = {
    staffLoginPinInput: { value: '', focus: () => {} },
    loginOverlay: { style: { display: 'flex' } },
    firstLoginPinModal: { style: { display: 'none' } },
    firstLoginStaffName: { textContent: '' },
    firstLoginStaffRole: { textContent: '', className: '' },
    firstLoginStaffAvatar: { textContent: '' },
    firstLoginNewPin: { value: '', focus: () => {} },
    firstLoginConfirmPin: { value: '', focus: () => {} },
    firstLoginPinError: { style: { display: 'none' } },
    firstLoginPinErrorText: { textContent: '' },
    staffTableBody: { innerHTML: '' },
    activeStaffName: { innerHTML: '' },
    slideStaffName: { innerText: '' },
    popoverStaffName: { innerText: '' },
    staffModal: { style: { display: 'none' } },
    staffModalTitle: { innerText: '' },
    staffIdInput: { value: '' },
    staffNameInput: { value: '' },
    staffRoleInput: { value: 'Cashier' },
    staffPhoneInput: { value: '' },
    staffPinInput: { value: '', placeholder: '' },
    staffStatusInput: { value: 'Active' },
    authBox: mockAuthBox
  };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    TextEncoder,
    Uint8Array,
    Array,
    Math,
    String,
    Date,
    parseInt,
    parseFloat,
    staffList: [],
    navigator: { onLine: true, userAgent: 'AdvSandbox' },
    location: { hash: '', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn, ms) => {
      // Synchronous immediate execution or controllable
      fn();
      return 1;
    },
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
      _raw: storage
    },
    idb: {
      get: async (k) => idbStore[k],
      set: async (k, v) => { idbStore[k] = JSON.parse(JSON.stringify(v)); },
      delete: async (k) => { delete idbStore[k]; },
      _raw: idbStore
    },
    crypto: {
      getRandomValues: (arr) => crypto.randomFillSync(arr),
      subtle: {
        digest: async (algo, data) => {
          if (algo === 'SHA-256') {
            const buf = crypto.createHash('sha256').update(data).digest();
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          }
          throw new Error('Unsupported algorithm');
        }
      }
    },
    document: {
      body: { appendChild: () => {}, removeChild: () => {} },
      head: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
      getElementById: (id) => domElements[id] || null,
      querySelector: (sel) => {
        if (sel.includes('.auth-box')) return mockAuthBox;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    showToast: (msg, type) => {
      toasts.push({ msg, type, at: Date.now() });
    },
    saveToLocal: () => {},
    shopProfile: { adminPinHash: refHash('1234', '0123456789abcdef0123456789abcdef') },
    hashString: (s) => crypto.createHash('sha256').update(s).digest('hex'),
    _toasts: toasts,
    _dom: domElements,
    _classesAdded: classesAdded
  };

  sandbox.window = sandbox;
  sandbox.global = sandbox;
  return sandbox;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const staffJs = fs.readFileSync(path.join(root, 'js', 'staff.js'), 'utf8');
  const coreJs = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');

  // ==========================================================================
  // PART A: BRUTE-FORCE LOCKOUT THROTTLING UNDER ADVERSARIAL ATTACKS
  // ==========================================================================
  console.log('📍 PART A: BRUTE-FORCE LOCKOUT THROTTLING UNDER ADVERSARIAL ATTACKS');

  await test('[ADV-LOCK-01] Cross-Avatar attack: 4 failures on Staff A + 1 failure on Staff B triggers terminal lockout', async () => {
    const sb = buildSandbox();
    const saltA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const saltB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    sb.staffList = [
      { id: 10, name: 'Staff Alpha', role: 'Cashier', pin_salt: saltA, pin_hash: refHash('1122', saltA) },
      { id: 20, name: 'Staff Beta', role: 'Cashier', pin_salt: saltB, pin_hash: refHash('3344', saltB) }
    ];
    vm.runInNewContext(staffJs, sb);

    // 4 failed attempts on Staff Alpha
    sb.window.selectLoginStaff(10);
    for (let i = 1; i <= 4; i++) {
      sb._dom.staffLoginPinInput.value = '999' + i;
      await sb.window.confirmStaffLogin();
      assert.strictEqual(sb.window.isTerminalLocked, false);
    }

    // Attacker switches avatar to Staff Beta to try to bypass attempt counter
    sb.window.selectLoginStaff(20);
    sb._dom.staffLoginPinInput.value = '9999';
    await sb.window.confirmStaffLogin();

    // Must trigger 30s lockout immediately (5th failure across terminal)
    const toast = sb._toasts[sb._toasts.length - 1];
    assert.strictEqual(toast.type, 'error');
    assert.ok(toast.msg.includes('5 failed PIN attempts. Keypad throttled for 30 seconds.'));
  });

  await test('[ADV-LOCK-02] Lockout wall: Correct PIN entered at t=15s during active lockout is strictly rejected', async () => {
    const sb = buildSandbox();
    const salt = 'cccccccccccccccccccccccccccccccc';
    sb.staffList = [
      { id: 30, name: 'Staff Gamma', role: 'Cashier', pin_salt: salt, pin_hash: refHash('7823', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(30);

    // Cause lockout (5 failures)
    for (let i = 0; i < 5; i++) {
      sb._dom.staffLoginPinInput.value = '000' + i;
      await sb.window.confirmStaffLogin();
    }

    // Simulate t = 15 seconds after lockout (still 15s remaining)
    const baseNow = Date.now();
    sb.Date.now = () => baseNow + 15000;

    // Attacker enters the CORRECT PIN '7823'
    sb._dom.staffLoginPinInput.value = '7823';
    await sb.window.confirmStaffLogin();

    // Must be rejected with lockout notice, terminal must remain locked
    assert.strictEqual(sb.window.isTerminalLocked, false); // has not logged in
    assert.strictEqual(sb.window.currentStaff, undefined);
    const toast = sb._toasts[sb._toasts.length - 1];
    assert.strictEqual(toast.type, 'error');
    assert.ok(toast.msg.includes('Keypad locked due to failed attempts'));
    assert.ok(toast.msg.includes('15s'));
  });

  await test('[ADV-LOCK-03] Precision millisecond boundary: t=29,900ms is blocked, t=30,100ms unlocks successfully', async () => {
    const sb = buildSandbox();
    const salt = 'dddddddddddddddddddddddddddddddd';
    sb.staffList = [
      { id: 40, name: 'Staff Delta', role: 'Cashier', pin_salt: salt, pin_hash: refHash('9461', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(40);

    const baseNow = Date.now();
    let simulatedNow = baseNow;
    sb.Date.now = () => simulatedNow;

    // 5 failures at t = 0 -> lockout until t + 30,000ms
    for (let i = 0; i < 5; i++) {
      sb._dom.staffLoginPinInput.value = '111' + i;
      await sb.window.confirmStaffLogin();
    }

    // Test at t = 29,900ms (100ms before expiry)
    simulatedNow = baseNow + 29900;
    sb._dom.staffLoginPinInput.value = '9461';
    await sb.window.confirmStaffLogin();
    assert.strictEqual(sb.window.currentStaff, undefined, 'Must reject at t=29,900ms');
    let toast = sb._toasts[sb._toasts.length - 1];
    assert.ok(toast.msg.includes('Keypad locked due to failed attempts'));

    // Test at t = 30,100ms (100ms after expiry)
    simulatedNow = baseNow + 30100;
    sb._dom.staffLoginPinInput.value = '9461';
    await sb.window.confirmStaffLogin();
    assert.ok(sb.window.currentStaff, 'Must unlock at t=30,100ms');
    assert.strictEqual(sb.window.currentStaff.id, 40);
  });

  await test('[ADV-LOCK-04] Rapid burst fuzzing: 50 rapid-fire incorrect inputs keep terminal strictly locked', async () => {
    const sb = buildSandbox();
    const salt = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    sb.staffList = [
      { id: 50, name: 'Staff Epsilon', role: 'Cashier', pin_salt: salt, pin_hash: refHash('5291', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(50);

    // Send 50 rapid fire random PINs
    for (let i = 0; i < 50; i++) {
      sb._dom.staffLoginPinInput.value = String(Math.floor(Math.random() * 9000 + 1000));
      await sb.window.confirmStaffLogin();
    }

    // Terminal must not have logged in
    assert.strictEqual(sb.window.currentStaff, undefined);
    const lastToast = sb._toasts[sb._toasts.length - 1];
    assert.strictEqual(lastToast.type, 'error');
    assert.ok(lastToast.msg.includes('Keypad locked due to failed attempts'));
  });

  await test('[ADV-LOCK-05] Empty and whitespace inputs show prompt without penalizing failure counter', async () => {
    const sb = buildSandbox();
    const salt = 'ffffffffffffffffffffffffffffffff';
    sb.staffList = [
      { id: 60, name: 'Staff Zeta', role: 'Cashier', pin_salt: salt, pin_hash: refHash('8201', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(60);

    // Try 10 empty/whitespace attempts
    const empties = ['', ' ', '   ', '\t', '\n'];
    for (const emptyVal of empties) {
      sb._dom.staffLoginPinInput.value = emptyVal;
      await sb.window.confirmStaffLogin();
      const toast = sb._toasts[sb._toasts.length - 1];
      assert.strictEqual(toast.msg, 'Please enter your 4-digit PIN.');
    }

    // Now attempt 4 failed inputs: should still have 4 attempts counted, not locked yet!
    for (let i = 1; i <= 4; i++) {
      sb._dom.staffLoginPinInput.value = '000' + i;
      await sb.window.confirmStaffLogin();
      const toast = sb._toasts[sb._toasts.length - 1];
      assert.ok(toast.msg.includes(`${5 - i} attempts remaining`));
    }
  });

  await test('[ADV-LOCK-06] Counter reset integrity: 4 failures followed by 1 success resets counter to 0', async () => {
    const sb = buildSandbox();
    const salt = '01230123012301230123012301230123';
    sb.staffList = [
      { id: 70, name: 'Staff Eta', role: 'Cashier', pin_salt: salt, pin_hash: refHash('3141', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(70);

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      sb._dom.staffLoginPinInput.value = '999' + i;
      await sb.window.confirmStaffLogin();
    }

    // 1 successful login
    sb._dom.staffLoginPinInput.value = '3141';
    await sb.window.confirmStaffLogin();
    assert.strictEqual(sb.window.currentStaff.id, 70);

    // Staff member locks terminal (e.g. stepping away from counter)
    sb.window.lockTerminal(false);
    assert.strictEqual(sb.window.isTerminalLocked, true);

    // Another 4 failed attempts must be allowed without triggering lockout
    sb.window.selectLoginStaff(70);
    for (let i = 1; i <= 4; i++) {
      sb._dom.staffLoginPinInput.value = '888' + i;
      await sb.window.confirmStaffLogin();
      const toast = sb._toasts[sb._toasts.length - 1];
      assert.ok(!toast.msg.includes('Keypad throttled'), `Attempt ${i} should not be throttled`);
    }
  });

  await test('[ADV-LOCK-07] Multi-cycle endurance: 3 consecutive lockout-expiry-unlock cycles maintain full integrity', async () => {
    const sb = buildSandbox();
    const salt = '45674567456745674567456745674567';
    sb.staffList = [
      { id: 80, name: 'Staff Theta', role: 'Cashier', pin_salt: salt, pin_hash: refHash('2718', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(80);

    let currentTime = Date.now();
    sb.Date.now = () => currentTime;

    for (let cycle = 1; cycle <= 3; cycle++) {
      // 5 failures trigger lockout (avoid '1234' which matches admin PIN)
      for (let i = 1; i <= 5; i++) {
        sb._dom.staffLoginPinInput.value = '990' + i;
        await sb.window.confirmStaffLogin();
      }

      // Confirm lockout is active
      const lockToast = sb._toasts[sb._toasts.length - 1];
      if (!lockToast || !lockToast.msg.includes('Keypad throttled for 30 seconds.')) {
        throw new Error(`Cycle ${cycle} expected throttle toast, but got: ${JSON.stringify(lockToast)} (total toasts: ${sb._toasts.length})`);
      }

      // Advance time by 31 seconds
      currentTime += 31000;

      // Unlock with correct PIN
      sb._dom.staffLoginPinInput.value = '2718';
      await sb.window.confirmStaffLogin();
      assert.strictEqual(sb.window.currentStaff.id, 80, `Cycle ${cycle} unlock failed`);

      // Lock terminal for next cycle
      sb.window.lockTerminal(false);
    }
  });

  await test('[ADV-LOCK-08] UI telemetry & tactile feedback: auth-box pin-shake animation triggers on bad PIN', async () => {
    const sb = buildSandbox();
    const salt = '89018901890189018901890189018901';
    sb.staffList = [
      { id: 90, name: 'Staff Iota', role: 'Cashier', pin_salt: salt, pin_hash: refHash('1618', salt) }
    ];
    vm.runInNewContext(staffJs, sb);
    sb.window.selectLoginStaff(90);

    sb._dom.staffLoginPinInput.value = '9999';
    await sb.window.confirmStaffLogin();

    // Verify pin-shake class was added
    const shakeAdded = sb._classesAdded.some(c => c.action === 'add' && c.cls === 'pin-shake');
    assert.strictEqual(shakeAdded, true, 'Must add pin-shake class on failed PIN entry');
  });

  // ==========================================================================
  // PART B: AUTOMATIC LEGACY MIGRATION DEEP STRESS & EDGE CASES
  // ==========================================================================
  console.log('\n📍 PART B: AUTOMATIC LEGACY MIGRATION DEEP STRESS & EDGE CASES');

  await test('[ADV-MIGR-01] Diverse PIN types: string, numeric 1234, leading-zero "0123", whitespace padded " 8492 "', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(coreJs, sb);
    vm.runInNewContext(staffJs, sb);

    sb.window.staffList.length = 0;
    sb.window.staffList.push(
      { id: 101, name: 'Staff Numeric', role: 'Cashier', pin: 1234 },
      { id: 102, name: 'Staff LeadingZero', role: 'Cashier', pin: '0123' },
      { id: 103, name: 'Staff Whitespace', role: 'Cashier', pin: '  8492  ' },
      { id: 104, name: 'Staff String', role: 'Cashier', pin: '6543' }
    );

    await sb.window.migrateLegacyStaffPinStorage();

    const m1 = sb.window.staffList.find(s => s.id === 101);
    const m2 = sb.window.staffList.find(s => s.id === 102);
    const m3 = sb.window.staffList.find(s => s.id === 103);
    const m4 = sb.window.staffList.find(s => s.id === 104);

    // Verify all plaintext pins are eliminated
    for (const m of [m1, m2, m3, m4]) {
      assert.strictEqual('pin' in m, false);
      assert.strictEqual(m.pin, undefined);
      assert.strictEqual(m.pin_salt.length, 32);
      assert.strictEqual(m.pin_hash.length, 64);
    }

    // Verify SHA-256 hashes against oracle
    assert.strictEqual(m1.pin_hash, refHash('1234', m1.pin_salt));
    assert.strictEqual(m2.pin_hash, refHash('0123', m2.pin_salt));
    assert.strictEqual(m3.pin_hash, refHash('8492', m3.pin_salt));
    assert.strictEqual(m4.pin_hash, refHash('6543', m4.pin_salt));

    // Verify authentication succeeds for each
    assert.strictEqual(await sb.window.verifyStaffPin(m1, '1234'), true);
    assert.strictEqual(await sb.window.verifyStaffPin(m2, '0123'), true);
    assert.strictEqual(await sb.window.verifyStaffPin(m3, '8492'), true);
    assert.strictEqual(await sb.window.verifyStaffPin(m4, '6543'), true);
  });

  await test('[ADV-MIGR-02] Dual-naming contract: pin_salt === pinSalt and pin_hash === pinHash on all migrated records', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(coreJs, sb);
    vm.runInNewContext(staffJs, sb);

    sb.window.staffList.length = 0;
    sb.window.staffList.push(
      { id: 201, name: 'Staff Dual', role: 'Manager', pin: '7410' }
    );

    await sb.window.migrateLegacyStaffPinStorage();
    const staff = sb.window.staffList[0];

    assert.strictEqual(staff.pin_salt, staff.pinSalt, 'pin_salt must equal pinSalt');
    assert.strictEqual(staff.pin_hash, staff.pinHash, 'pin_hash must equal pinHash');
  });

  await test('[ADV-MIGR-03] Idempotency stress: 50 back-to-back migration passes cause zero hash mutations or salt drift', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(coreJs, sb);
    vm.runInNewContext(staffJs, sb);

    sb.window.staffList.length = 0;
    sb.window.staffList.push(
      { id: 301, name: 'Staff S1', role: 'Cashier', pin: '9182' },
      { id: 302, name: 'Staff S2', role: 'Floor Server', pin: '3721' }
    );

    // Pass 1: performs migration
    await sb.window.migrateLegacyStaffPinStorage();

    const snapshot = sb.window.staffList.map(s => ({
      id: s.id,
      salt: s.pin_salt,
      hash: s.pin_hash
    }));

    // Run passes 2 through 50
    for (let p = 2; p <= 50; p++) {
      await sb.window.migrateLegacyStaffPinStorage();
      for (let i = 0; i < snapshot.length; i++) {
        const current = sb.window.staffList[i];
        assert.strictEqual(current.pin_salt, snapshot[i].salt, `Pass ${p}: Salt mutated on staff ${current.id}`);
        assert.strictEqual(current.pin_hash, snapshot[i].hash, `Pass ${p}: Hash mutated on staff ${current.id}`);
      }
    }
  });

  await test('[ADV-MIGR-04] On-the-fly verifyStaffPin migration resilience with immediate authentication & invalid PIN denial', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(staffJs, sb);

    const legacyUser = { id: 401, name: 'OnTheFly User', role: 'Cashier', pin: '4920' };
    sb.window.staffList = [legacyUser];

    // 1. Wrong PIN check: should migrate on-the-fly, but return FALSE for bad PIN
    const wrongAuth = await sb.window.verifyStaffPin(legacyUser, '0000');
    assert.strictEqual(wrongAuth, false, 'Must deny incorrect PIN');
    assert.strictEqual('pin' in legacyUser, false, 'Plaintext pin must be purged even on failed attempt');
    assert.ok(legacyUser.pin_salt && legacyUser.pin_hash);

    // 2. Correct PIN check: should authenticate with the newly generated hash
    const correctAuth = await sb.window.verifyStaffPin(legacyUser, '4920');
    assert.strictEqual(correctAuth, true, 'Must accept correct PIN after on-the-fly migration');
  });

  await test('[ADV-MIGR-05] Corrupted/malformed records: missing pin and pin_hash handled safely without uncaught exceptions', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(coreJs, sb);
    vm.runInNewContext(staffJs, sb);

    sb.window.staffList.length = 0;
    sb.window.staffList.push(
      {},
      { id: 501 },
      { id: 502, name: 'Corrupted Staff' },
      { id: 503, pin_hash: 'abc' }, // missing salt
      { id: 504, pin_salt: 'xyz' }, // missing hash
      { id: 505, pin: '' }          // empty string pin
    );

    // Should not throw
    let didThrow = false;
    try {
      await sb.window.migrateLegacyStaffPinStorage();
    } catch (e) {
      didThrow = true;
    }
    assert.strictEqual(didThrow, false, 'migrateLegacyStaffPinStorage must never crash on malformed records');

    // verifyStaffPin on malformed record should return false safely
    const res1 = await sb.window.verifyStaffPin(null, '1234');
    const res2 = await sb.window.verifyStaffPin({}, '1234');
    const res3 = await sb.window.verifyStaffPin({ id: 501 }, '1234');
    const res4 = await sb.window.verifyStaffPin({ id: 503, pin_hash: 'abc' }, '1234');
    assert.strictEqual(res1, false);
    assert.strictEqual(res2, false);
    assert.strictEqual(res3, false);
    assert.strictEqual(res4, false);
  });

  await test('[ADV-MIGR-06] Large fleet migration: 100 legacy staff members migrated concurrently with 100 unique salts', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(coreJs, sb);
    vm.runInNewContext(staffJs, sb);

    const fleet = [];
    for (let i = 1; i <= 100; i++) {
      fleet.push({
        id: 1000 + i,
        name: `Fleet Staff ${i}`,
        role: 'Cashier',
        pin: String(1000 + (i % 9000))
      });
    }
    sb.window.staffList.length = 0;
    sb.window.staffList.push(...fleet);

    await sb.window.migrateLegacyStaffPinStorage();

    assert.strictEqual(sb.window.staffList.length, 100);
    const salts = new Set();
    for (const member of sb.window.staffList) {
      assert.strictEqual('pin' in member, false);
      assert.strictEqual(member.pin_salt.length, 32);
      assert.strictEqual(member.pin_hash.length, 64);
      salts.add(member.pin_salt);
    }
    assert.strictEqual(salts.size, 100, 'All 100 salts must be completely unique');
  });

  // ==========================================================================
  // PART C: TRIVIAL PIN HARDENING & ERROR TEXT PRESERVATION
  // ==========================================================================
  console.log('\n📍 PART C: TRIVIAL PIN HARDENING & ERROR TEXT PRESERVATION');

  await test('[ADV-TRIV-01] All 10 repetitive 4-digit PINs (0000..9999) rejected with "non-trivial PIN" error text', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(staffJs, sb);

    const staff = {
      id: 701,
      name: 'Tester Repetitive',
      role: 'Cashier',
      pin_salt: '11111111111111111111111111111111',
      pin_hash: refHash('9999', '11111111111111111111111111111111'),
      mustChangePin: true
    };
    sb.window.staffList = [staff];
    sb.window.openFirstLoginPinModal(staff);

    const repetitivePins = [
      '0000', '1111', '2222', '3333', '4444',
      '5555', '6666', '7777', '8888', '9999'
    ];

    for (const repPin of repetitivePins) {
      sb._dom.firstLoginNewPin.value = repPin;
      sb._dom.firstLoginConfirmPin.value = repPin;
      await sb.window.submitFirstLoginPin();

      assert.strictEqual(sb._dom.firstLoginPinError.style.display, 'flex');
      assert.ok(
        sb._dom.firstLoginPinErrorText.textContent.includes('non-trivial PIN'),
        `PIN ${repPin} failed to include "non-trivial PIN" in error: "${sb._dom.firstLoginPinErrorText.textContent}"`
      );
      assert.strictEqual(staff.mustChangePin, true, `PIN ${repPin} should not clear mustChangePin`);
    }
  });

  await test('[ADV-TRIV-02] Sequential PINs 1234 and 4321 rejected with "non-trivial PIN" error text', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(staffJs, sb);

    const staff = {
      id: 702,
      name: 'Tester Sequential',
      role: 'Cashier',
      pin_salt: '22222222222222222222222222222222',
      pin_hash: refHash('9999', '22222222222222222222222222222222'),
      mustChangePin: true
    };
    sb.window.staffList = [staff];
    sb.window.openFirstLoginPinModal(staff);

    for (const seqPin of ['1234', '4321']) {
      sb._dom.firstLoginNewPin.value = seqPin;
      sb._dom.firstLoginConfirmPin.value = seqPin;
      await sb.window.submitFirstLoginPin();

      assert.strictEqual(sb._dom.firstLoginPinError.style.display, 'flex');
      assert.ok(
        sb._dom.firstLoginPinErrorText.textContent.includes('non-trivial PIN'),
        `PIN ${seqPin} failed to include "non-trivial PIN"`
      );
      assert.strictEqual(staff.mustChangePin, true);
    }
  });

  await test('[ADV-TRIV-03] Non-trivial PINs (5821, 8492, 1984, 2026, 7391) accepted with refreshed salt and hash', async () => {
    const sb = buildSandbox();
    vm.runInNewContext(staffJs, sb);

    const validPins = ['5821', '8492', '1984', '2026', '7391'];

    for (let idx = 0; idx < validPins.length; idx++) {
      const pin = validPins[idx];
      const origSalt = '33333333333333333333333333333333';
      const staff = {
        id: 800 + idx,
        name: `Staff Valid ${idx}`,
        role: 'Cashier',
        pin_salt: origSalt,
        pin_hash: refHash('9999', origSalt),
        mustChangePin: true
      };
      sb.window.staffList = [staff];
      sb.window.openFirstLoginPinModal(staff);

      sb._dom.firstLoginNewPin.value = pin;
      sb._dom.firstLoginConfirmPin.value = pin;
      await sb.window.submitFirstLoginPin();

      assert.strictEqual(staff.mustChangePin, false, `Valid PIN ${pin} must clear mustChangePin`);
      assert.notStrictEqual(staff.pin_salt, origSalt, `Valid PIN ${pin} must generate fresh salt`);
      assert.strictEqual(staff.pin_hash, refHash(pin, staff.pin_salt), `Valid PIN ${pin} hash must match`);
    }
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADV-STRESS COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================');

  if (failedTests > 0) {
    console.error('\n❌ FAILURES:');
    failures.forEach(f => console.error(`- ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('\n✨ ALL ADVERSARIAL STRESS & MIGRATION TESTS PASSED 100% GREEN!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
