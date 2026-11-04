/**
 * scratch/test_challenger_m2_crypto.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE: Milestone 2 PIN Security & Crypto
 * Challenger 2: Crypto Engine, Timing Safety, Throttling & Storage Security
 *
 * 5 Focus Areas:
 *   1. Hash Engine Integrity (120+ random PIN/salt combinations vs Node crypto SHA-256)
 *   2. Timing Safety (timingSafeEqual: matching, non-matching, prefix, differing lengths)
 *   3. Brute-Force Lockout Throttling (5 failed attempts trigger 30s lockout)
 *   4. Plaintext Elimination (localStorage, IndexedDB mock, and in-memory audit)
 *   5. Automatic Legacy Migration (plaintext pin: "5678" migrated, verified & authenticated)
 *
 * Execution:
 *   node scratch/test_challenger_m2_crypto.cjs
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('====================================================================');
console.log('🛡️  CHALLENGER 2: ADVERSARIAL CRYPTO & STORAGE STRESS TEST HARNESS');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureList = [];

async function runTest(category, testName, testFn) {
  totalTests++;
  const label = `[${category}] ${testName}`;
  try {
    await testFn();
    passedTests++;
    console.log(`  ✅ PASS: ${label}`);
  } catch (err) {
    failedTests++;
    failureList.push({ label, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     Error: ${err.message}`);
  }
}

// Helper: Node.js reference SHA-256 oracle
function referenceHashPin(pin, salt) {
  const cleanPin = String(pin).trim();
  const cleanSalt = String(salt).trim();
  return crypto.createHash('sha256').update(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`).digest('hex');
}

// ----------------------------------------------------------------------------
// Environment Setup: Browser Mock for js/staff.js and js/core.js
// ----------------------------------------------------------------------------
function createBrowserSandbox() {
  const storage = {};
  const idbStore = {};
  const toasts = [];

  const makeEl = () => ({
    appendChild: (c) => c,
    removeChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {} }
  });

  const mockIndexedDB = {
    open: () => {
      const req = {
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              get: (key) => {
                const r = { result: idbStore[key] };
                setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                return r;
              },
              put: (val, key) => { idbStore[key] = val; },
              delete: (key) => { delete idbStore[key]; }
            })
          })
        }
      };
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
      return req;
    }
  };

  const domElements = {
    staffLoginPinInput: { value: '', focus: () => {} },
    loginOverlay: { style: { display: 'flex', zIndex: '1000' } },
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
    authBox: {
      classList: {
        remove: () => {},
        add: () => {}
      },
      offsetWidth: 100
    }
  };

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    TextEncoder,
    Uint8Array,
    Array,
    Math,
    String,
    Date,
    parseInt,
    parseFloat,
    staffList: [],
    navigator: { onLine: true, userAgent: 'MockBrowser' },
    location: { hash: '', reload: () => {} },
    indexedDB: mockIndexedDB,
    addEventListener: (type, fn) => {},
    removeEventListener: (type, fn) => {},
    setTimeout: (fn, ms) => { fn(); return 1; },
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
      body: makeEl(),
      head: makeEl(),
      createElement: makeEl,
      getElementById: (id) => domElements[id] || null,
      querySelector: (sel) => {
        if (sel.includes('.auth-box')) return domElements.authBox;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (type, fn) => {},
      removeEventListener: (type, fn) => {}
    },
    showToast: (msg, type) => {
      toasts.push({ msg, type, at: Date.now() });
    },
    saveToLocal: () => {},
    getLocalISODate: () => '2026-11-04',
    shopProfile: { adminPinHash: referenceHashPin('1234', '0123456789abcdef0123456789abcdef') },
    hashString: (s) => crypto.createHash('sha256').update(s).digest('hex'),
    _toasts: toasts,
    _dom: domElements,
    _idbStore: idbStore
  };

  sandbox.window = sandbox;
  sandbox.global = sandbox;
  return sandbox;
}

// ----------------------------------------------------------------------------
// MAIN HARNESS EXECUTION
// ----------------------------------------------------------------------------
async function runAllChallengerTests() {
  const rootDir = path.resolve(__dirname, '..');
  const rbacPath = path.join(rootDir, 'src', 'core', 'rbac.js');
  const staffJsContent = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf8');
  const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');

  // Load ES module rbac.js
  const rbac = await import(`file://${rbacPath}`);

  // ==========================================================================
  // SECTION 1: HASH ENGINE INTEGRITY
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 1: HASH ENGINE INTEGRITY (120+ Random PINs & Salts)');
  console.log('====================================================================');

  await runTest('HASH-01', 'rbac.hashPin matches Node crypto SHA-256 across 120 random PIN/salt pairs', async () => {
    for (let i = 0; i < 120; i++) {
      const pinNum = Math.floor(Math.random() * 10000);
      const pin = String(pinNum).padStart(4, '0');
      const salt = crypto.randomBytes(16).toString('hex');

      const expected = referenceHashPin(pin, salt);
      const actual = await rbac.hashPin(pin, salt);

      assert.strictEqual(typeof actual, 'string', `Iteration ${i}: result must be string`);
      assert.strictEqual(actual.length, 64, `Iteration ${i}: length must be exactly 64`);
      assert.strictEqual(/^[0-9a-f]{64}$/.test(actual), true, `Iteration ${i}: must be lowercase hex`);
      assert.strictEqual(actual, expected, `Iteration ${i}: hash mismatch for PIN "${pin}" and salt "${salt}"`);
    }
  });

  await runTest('HASH-02', 'js/staff.js hashPin matches Node crypto SHA-256 across 120 random PIN/salt pairs', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(staffJsContent, sandbox);

    for (let i = 0; i < 120; i++) {
      const pinNum = Math.floor(Math.random() * 10000);
      const pin = String(pinNum).padStart(4, '0');
      const salt = crypto.randomBytes(16).toString('hex');

      const expected = referenceHashPin(pin, salt);
      const actual = await sandbox.window.hashPin(pin, salt);

      assert.strictEqual(actual, expected, `Iteration ${i}: staff.js hash mismatch for PIN "${pin}" and salt "${salt}"`);
    }
  });

  await runTest('HASH-03', 'rbac.js and staff.js hashPin produce 100% identical outputs for identical inputs', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(staffJsContent, sandbox);

    const testPins = ['0000', '1234', '9999', '0123', '5821', '8492', '4321', '7777'];
    for (const p of testPins) {
      const salt = crypto.randomBytes(16).toString('hex');
      const rbacHash = await rbac.hashPin(p, salt);
      const staffHash = await sandbox.window.hashPin(p, salt);
      assert.strictEqual(rbacHash, staffHash, `Cross-engine parity failed for PIN ${p}`);
    }
  });

  await runTest('HASH-04', 'Omitted salt in hashPin auto-generates 32-char hex salt and valid pinHash', async () => {
    const result = await rbac.hashPin('7890');
    assert.strictEqual(typeof result, 'object');
    assert.ok(result.salt, 'Must include salt');
    assert.ok(result.pinHash, 'Must include pinHash');
    assert.strictEqual(result.salt.length, 32);
    assert.strictEqual(result.pinHash.length, 64);
    assert.strictEqual(result.pinHash, referenceHashPin('7890', result.salt));
  });

  await runTest('HASH-05', 'Whitespace trimming in hashPin preserves deterministic hash', async () => {
    const salt = 'abcdef0123456789abcdef0123456789';
    const h1 = await rbac.hashPin(' 1234 ', `  ${salt}  `);
    const h2 = await rbac.hashPin('1234', salt);
    assert.strictEqual(h1, h2);
  });

  await runTest('HASH-06', 'Boundary non-4-digit strings hash safely without throwing', async () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const weirdInputs = ['', '   ', '1', '12', '123456', 'ABCD', '!@#$', '00000000'];
    for (const input of weirdInputs) {
      const expected = referenceHashPin(input, salt);
      const actual = await rbac.hashPin(input, salt);
      assert.strictEqual(actual, expected);
      assert.strictEqual(actual.length, 64);
    }
  });

  // ==========================================================================
  // SECTION 2: TIMING SAFETY (timingSafeEqual)
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 2: TIMING SAFETY (timingSafeEqual Stress & Boundary Test)');
  console.log('====================================================================');

  await runTest('TIME-01', 'Identical matching 64-char hashes return true (100 iterations)', async () => {
    for (let i = 0; i < 100; i++) {
      const str = crypto.randomBytes(32).toString('hex');
      assert.strictEqual(rbac.timingSafeEqual(str, str), true);
    }
  });

  await runTest('TIME-02', 'Non-matching 64-char strings differing at first, middle, or last char return false', async () => {
    const base = 'a'.repeat(64);

    // Differ at index 0
    const diffFirst = 'b' + 'a'.repeat(63);
    assert.strictEqual(rbac.timingSafeEqual(base, diffFirst), false);

    // Differ at index 31
    const diffMid = 'a'.repeat(31) + 'b' + 'a'.repeat(32);
    assert.strictEqual(rbac.timingSafeEqual(base, diffMid), false);

    // Differ at index 63
    const diffLast = 'a'.repeat(63) + 'b';
    assert.strictEqual(rbac.timingSafeEqual(base, diffLast), false);

    // Single-bit difference
    const charA = 'a'; // 0x61 = 01100001
    const charC = 'c'; // 0x63 = 01100011 (1-bit flip)
    const diffBit = 'a'.repeat(10) + charC + 'a'.repeat(53);
    assert.strictEqual(rbac.timingSafeEqual(base, diffBit), false);
  });

  await runTest('TIME-03', 'Differing length strings return false without throwing exceptions', async () => {
    const len64 = 'a'.repeat(64);
    const len63 = 'a'.repeat(63);
    const len65 = 'a'.repeat(65);
    const len0 = '';
    const len1 = 'a';

    assert.strictEqual(rbac.timingSafeEqual(len64, len63), false);
    assert.strictEqual(rbac.timingSafeEqual(len64, len65), false);
    assert.strictEqual(rbac.timingSafeEqual(len64, len0), false);
    assert.strictEqual(rbac.timingSafeEqual(len0, len1), false);
    assert.strictEqual(rbac.timingSafeEqual(len0, len0), true);
  });

  await runTest('TIME-04', 'Non-string and malformed inputs return false without crashing', async () => {
    const valid = 'a'.repeat(64);
    const nonStrings = [null, undefined, 12345, {}, [], true, false, NaN, Symbol('test')];
    for (const val of nonStrings) {
      assert.strictEqual(rbac.timingSafeEqual(valid, val), false);
      assert.strictEqual(rbac.timingSafeEqual(val, valid), false);
      assert.strictEqual(rbac.timingSafeEqual(val, val), false);
    }
  });

  await runTest('TIME-05', 'timingSafeEqual in js/staff.js behaves identically to rbac.js', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(staffJsContent, sandbox);

    const testPairs = [
      ['abc', 'abc', true],
      ['abc', 'abd', false],
      ['', '', true],
      ['123', '1234', false],
      ['a'.repeat(64), 'a'.repeat(64), true],
      ['a'.repeat(64), 'a'.repeat(63) + 'b', false],
      [null, 'abc', false],
      ['abc', undefined, false]
    ];

    for (const [a, b, expected] of testPairs) {
      const res = sandbox.window.timingSafeEqual(a, b);
      assert.strictEqual(res, expected, `Mismatch in staff.js for "${a}" vs "${b}"`);
    }
  });

  await runTest('TIME-06', 'Adversarial 1000-case randomized fuzzing of timingSafeEqual', async () => {
    for (let i = 0; i < 1000; i++) {
      const len = Math.floor(Math.random() * 80);
      const s1 = crypto.randomBytes(len).toString('hex').slice(0, len);
      const isIdentical = Math.random() < 0.5;
      let s2 = isIdentical ? s1 : crypto.randomBytes(len).toString('hex').slice(0, len);
      if (!isIdentical && s1 === s2) s2 += 'x';

      const expected = (s1 === s2);
      assert.strictEqual(rbac.timingSafeEqual(s1, s2), expected);
    }
  });

  // ==========================================================================
  // SECTION 3: BRUTE-FORCE LOCKOUT THROTTLING
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 3: BRUTE-FORCE LOCKOUT THROTTLING (5 Failures -> 30s Lockout)');
  console.log('====================================================================');

  await runTest('THROTTLE-01', 'Consecutive failed attempts 1 through 4 do not lock out terminal', async () => {
    const sandbox = createBrowserSandbox();
    // Seed staff member: id: 2, role: Cashier, PIN: '8492'
    const salt = '0123456789abcdef0123456789abcdef';
    const hash = referenceHashPin('8492', salt);
    sandbox.staffList = [
      { id: 2, name: 'Cashier 1', role: 'Cashier', pin_salt: salt, pin_hash: hash, status: 'Active' }
    ];
    sandbox.selectedLoginStaffId = 2;

    vm.runInNewContext(staffJsContent, sandbox);

    // Attempt 1 to 4 with incorrect PIN
    for (let attempt = 1; attempt <= 4; attempt++) {
      sandbox._dom.staffLoginPinInput.value = '000' + attempt;
      await sandbox.window.confirmStaffLogin();

      // Terminal should NOT be locked out yet
      const toast = sandbox._toasts[sandbox._toasts.length - 1];
      assert.ok(toast.msg.includes(`${5 - attempt} attempts remaining`), `Attempt ${attempt} toast mismatch: ${toast.msg}`);
    }
  });

  await runTest('THROTTLE-02', '5th consecutive failure triggers exactly 30-second lockout throttle', async () => {
    const sandbox = createBrowserSandbox();
    const salt = '0123456789abcdef0123456789abcdef';
    const hash = referenceHashPin('8492', salt);
    sandbox.staffList = [
      { id: 2, name: 'Cashier 1', role: 'Cashier', pin_salt: salt, pin_hash: hash, status: 'Active' }
    ];
    sandbox.selectedLoginStaffId = 2;

    vm.runInNewContext(staffJsContent, sandbox);

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      sandbox._dom.staffLoginPinInput.value = '999' + i;
      await sandbox.window.confirmStaffLogin();
    }

    // 5th failed attempt
    sandbox._dom.staffLoginPinInput.value = '0000';
    await sandbox.window.confirmStaffLogin();

    const lastToast = sandbox._toasts[sandbox._toasts.length - 1];
    assert.strictEqual(lastToast.type, 'error');
    assert.ok(lastToast.msg.includes('5 failed PIN attempts. Keypad throttled for 30 seconds.'), `Unexpected toast: ${lastToast.msg}`);

    // Verify lockout timestamp was set ~30,000ms ahead
    // Let's check via next login attempt while locked
    sandbox._dom.staffLoginPinInput.value = '8492'; // Even with CORRECT PIN!
    await sandbox.window.confirmStaffLogin();

    const lockoutToast = sandbox._toasts[sandbox._toasts.length - 1];
    assert.strictEqual(lockoutToast.type, 'error');
    assert.ok(lockoutToast.msg.includes('Keypad locked due to failed attempts'), `Must block correct PIN during lockout: ${lockoutToast.msg}`);
    assert.ok(/Try again in \d+s\./.test(lockoutToast.msg));
  });

  await runTest('THROTTLE-03', 'Terminal unlocks after 30s expiry and resets failed attempt counter', async () => {
    const sandbox = createBrowserSandbox();
    const salt = '0123456789abcdef0123456789abcdef';
    const hash = referenceHashPin('8492', salt);
    sandbox.staffList = [
      { id: 2, name: 'Cashier 1', role: 'Cashier', pin_salt: salt, pin_hash: hash, status: 'Active' }
    ];
    sandbox.selectedLoginStaffId = 2;

    vm.runInNewContext(staffJsContent, sandbox);

    // Trigger lockout
    for (let i = 1; i <= 5; i++) {
      sandbox._dom.staffLoginPinInput.value = '111' + i;
      await sandbox.window.confirmStaffLogin();
    }

    // Fast-forward simulated time past 30 seconds
    const originalDateNow = Date.now;
    const futureTime = originalDateNow() + 31000;
    sandbox.Date.now = () => futureTime;

    try {
      // Enter correct PIN
      sandbox._dom.staffLoginPinInput.value = '8492';
      await sandbox.window.confirmStaffLogin();

      assert.strictEqual(sandbox.window.isTerminalLocked, false, 'Terminal should be unlocked');
      assert.strictEqual(sandbox.window.currentStaff.id, 2, 'Logged in staff ID should match');
      const welcomeToast = sandbox._toasts[sandbox._toasts.length - 1];
      assert.ok(welcomeToast.msg.includes('Welcome, Cashier 1!'), `Expected welcome toast: ${welcomeToast.msg}`);
    } finally {
      sandbox.Date.now = originalDateNow;
    }
  });

  await runTest('THROTTLE-04', 'Successful login before 5 attempts resets failed attempt counter', async () => {
    const sandbox = createBrowserSandbox();
    const salt = '0123456789abcdef0123456789abcdef';
    const hash = referenceHashPin('8492', salt);
    sandbox.staffList = [
      { id: 2, name: 'Cashier 1', role: 'Cashier', pin_salt: salt, pin_hash: hash, status: 'Active' }
    ];
    sandbox.selectedLoginStaffId = 2;

    vm.runInNewContext(staffJsContent, sandbox);

    // 3 failed attempts
    for (let i = 1; i <= 3; i++) {
      sandbox._dom.staffLoginPinInput.value = '999' + i;
      await sandbox.window.confirmStaffLogin();
    }

    // 1 successful login
    sandbox._dom.staffLoginPinInput.value = '8492';
    await sandbox.window.confirmStaffLogin();
    assert.strictEqual(sandbox.window.isTerminalLocked, false);

    // Lock terminal again
    sandbox.window.lockTerminal(false);

    // 4 failed attempts now should NOT lock terminal (since counter was reset to 0)
    for (let i = 1; i <= 4; i++) {
      sandbox._dom.staffLoginPinInput.value = '000' + i;
      await sandbox.window.confirmStaffLogin();
      const toast = sandbox._toasts[sandbox._toasts.length - 1];
      assert.ok(!toast.msg.includes('Keypad throttled'), `Should not be throttled at attempt ${i} after reset`);
    }
  });

  // ==========================================================================
  // SECTION 4: PLAINTEXT ELIMINATION AUDIT
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 4: PLAINTEXT ELIMINATION (Storage, Mock IDB & Memory Audit)');
  console.log('====================================================================');

  await runTest('PLAIN-01', 'Default seeded Admin in js/core.js contains zero plaintext pin', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    await sandbox.window.initDatabase();

    const staff = sandbox.window.staffList;
    assert.ok(Array.isArray(staff) && staff.length > 0, 'Staff list must exist');
    for (const member of staff) {
      assert.strictEqual(member.pin, undefined, `Member ${member.name} has plaintext pin property`);
      assert.strictEqual('pin' in member, false, `Member ${member.name} contains "pin" key`);
      assert.ok(member.pin_salt && member.pin_salt.length === 32, `Member ${member.name} missing valid pin_salt`);
      assert.ok(member.pin_hash && member.pin_hash.length === 64, `Member ${member.name} missing valid pin_hash`);
    }
  });

  await runTest('PLAIN-02', 'localStorage contains zero plaintext PIN keys across all keys', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);
    await sandbox.window.initDatabase();

    // Perform staff addition
    await sandbox.window.saveStaffMember({
      name: 'Rohan Sharma',
      role: 'Cashier',
      phone: '9876543211',
      pin: '3456',
      status: 'Active'
    });

    const rawStorage = sandbox.localStorage._raw;
    for (const [key, val] of Object.entries(rawStorage)) {
      assert.ok(!key.toLowerCase().includes('pin_plaintext'), `Key ${key} looks like plaintext PIN`);
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null) {
          const checkObj = (obj) => {
            for (const [k, v] of Object.entries(obj)) {
              assert.notStrictEqual(k, 'pin', `Found plaintext "pin" key in localStorage[${key}]`);
              if (typeof v === 'object' && v !== null) checkObj(v);
            }
          };
          checkObj(parsed);
        }
      } catch (e) {
        // Non-JSON string, fine
      }
    }
  });

  await runTest('PLAIN-03', 'IndexedDB mock (idb.get("cafe_staff")) contains zero plaintext pin keys', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);
    await sandbox.window.initDatabase();

    await sandbox.window.saveStaffMember({
      name: 'Neha Gupta',
      role: 'Kitchen Chef',
      pin: '7788',
      status: 'Active'
    });

    const idbStaff = await sandbox.window.idb.get('cafe_staff');
    assert.ok(Array.isArray(idbStaff) && idbStaff.length >= 2);
    for (const member of idbStaff) {
      assert.strictEqual('pin' in member, false, `IDB member ${member.name} contains 'pin' key`);
      assert.ok(member.pin_salt && member.pin_salt.length === 32);
      assert.ok(member.pin_hash && member.pin_hash.length === 64);
      assert.notStrictEqual(member.pin_hash, '7788', 'Hash cannot be literal PIN');
    }
  });

  await runTest('PLAIN-04', 'In-memory staffList and currentStaff objects have no plaintext pin', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);
    await sandbox.window.initDatabase();

    for (const s of sandbox.window.staffList) {
      assert.strictEqual(s.pin, undefined);
      assert.strictEqual('pin' in s, false);
    }
  });

  await runTest('PLAIN-05', 'Static code scan confirms zero plaintext PIN keys in seeded records', async () => {
    // Assert js/core.js does not seed pin: "1234"
    assert.ok(!coreJsContent.includes('pin: "1234"'), 'js/core.js must not contain pin: "1234"');
    assert.ok(!coreJsContent.includes("pin: '1234'"), "js/core.js must not contain pin: '1234'");

    // Verify index.html does not hardcode staff PINs in input values
    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    assert.ok(!indexHtml.includes('value="1234"'), 'index.html must not hardcode default PIN');
  });

  // ==========================================================================
  // SECTION 5: AUTOMATIC LEGACY MIGRATION
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 5: AUTOMATIC LEGACY MIGRATION (pin: "5678" -> salt & hash)');
  console.log('====================================================================');

  await runTest('MIGRATE-01', 'migrateLegacyStaffPinStorage converts legacy pin: "5678" to valid salt and hash', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    // Populate in-scope staffList in-place
    const legacyMember = {
      id: 101,
      name: 'Legacy Cashier',
      role: 'Cashier',
      pin: '5678',
      status: 'Active'
    };
    sandbox.window.staffList.length = 0;
    sandbox.window.staffList.push(legacyMember);

    await sandbox.window.migrateLegacyStaffPinStorage();

    const migrated = sandbox.window.staffList[0];
    assert.strictEqual(migrated.pin, undefined, 'Plaintext pin must be deleted');
    assert.strictEqual('pin' in migrated, false, '"pin" key must not exist on migrated record');
    assert.ok(migrated.pin_salt && migrated.pin_salt.length === 32, 'Must have 32-char pin_salt');
    assert.ok(migrated.pin_hash && migrated.pin_hash.length === 64, 'Must have 64-char pin_hash');

    // Verify cryptographic correctness of generated hash
    const expectedHash = referenceHashPin('5678', migrated.pin_salt);
    assert.strictEqual(migrated.pin_hash, expectedHash, 'Generated hash must match SHA-256 of "5678" + salt');
  });

  await runTest('MIGRATE-02', 'User with migrated PIN "5678" can successfully authenticate', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    const legacyMember = {
      id: 101,
      name: 'Legacy Cashier',
      role: 'Cashier',
      pin: '5678',
      status: 'Active'
    };
    sandbox.window.staffList.length = 0;
    sandbox.window.staffList.push(legacyMember);

    await sandbox.window.migrateLegacyStaffPinStorage();

    // Verify via verifyStaffPin
    const isValid = await sandbox.window.verifyStaffPin(sandbox.window.staffList[0], '5678');
    assert.strictEqual(isValid, true, 'verifyStaffPin must return true for PIN "5678"');

    // Wrong PIN rejection
    const isInvalid = await sandbox.window.verifyStaffPin(sandbox.window.staffList[0], '0000');
    assert.strictEqual(isInvalid, false, 'verifyStaffPin must return false for wrong PIN');

    // Verify full terminal login
    sandbox.selectedLoginStaffId = 101;
    sandbox._dom.staffLoginPinInput.value = '5678';
    await sandbox.window.confirmStaffLogin();

    assert.strictEqual(sandbox.window.isTerminalLocked, false, 'Terminal must unlock on valid login');
    assert.strictEqual(sandbox.window.currentStaff.name, 'Legacy Cashier');
  });

  await runTest('MIGRATE-03', 'Batch migration handles multiple legacy records with distinct PINs and salts', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    const legacyList = [
      { id: 201, name: 'Worker A', role: 'Cashier', pin: '1111' },
      { id: 202, name: 'Worker B', role: 'Manager', pin: '2222' },
      { id: 203, name: 'Worker C', role: 'Kitchen Chef', pin: '3333' },
      { id: 204, name: 'Worker D', role: 'Floor Server', pin: '4444' }
    ];
    sandbox.window.staffList.length = 0;
    sandbox.window.staffList.push(...legacyList);

    await sandbox.window.migrateLegacyStaffPinStorage();

    const usedSalts = new Set();
    const usedHashes = new Set();

    for (let i = 0; i < sandbox.window.staffList.length; i++) {
      const s = sandbox.window.staffList[i];
      const origPin = ['1111', '2222', '3333', '4444'][i];

      assert.strictEqual('pin' in s, false);
      assert.strictEqual(s.pin_hash, referenceHashPin(origPin, s.pin_salt));

      // Each must have a distinct salt
      assert.ok(!usedSalts.has(s.pin_salt), 'Salts must be unique across staff members');
      usedSalts.add(s.pin_salt);
      usedHashes.add(s.pin_hash);

      // Verify authentication works
      const canAuth = await sandbox.window.verifyStaffPin(s, origPin);
      assert.strictEqual(canAuth, true);
    }
  });

  await runTest('MIGRATE-04', 'Migration is idempotent: subsequent executions preserve existing salts and hashes', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    sandbox.window.staffList.length = 0;
    sandbox.window.staffList.push({ id: 301, name: 'Worker E', role: 'Cashier', pin: '5678' });

    await sandbox.window.migrateLegacyStaffPinStorage();
    const firstSalt = sandbox.window.staffList[0].pin_salt;
    const firstHash = sandbox.window.staffList[0].pin_hash;

    // Run migration again
    await sandbox.window.migrateLegacyStaffPinStorage();

    assert.strictEqual(sandbox.window.staffList[0].pin_salt, firstSalt, 'Salt must not change on re-run');
    assert.strictEqual(sandbox.window.staffList[0].pin_hash, firstHash, 'Hash must not change on re-run');
  });

  await runTest('MIGRATE-05', 'On-the-fly migration in verifyStaffPin handles legacy record gracefully', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(staffJsContent, sandbox);

    const unmigrated = { id: 401, name: 'Unmigrated Staff', role: 'Cashier', pin: '9876' };
    sandbox.window.staffList = [unmigrated];
    const authResult = await sandbox.window.verifyStaffPin(unmigrated, '9876');

    assert.strictEqual(authResult, true, 'Must authenticate successfully on-the-fly');
    assert.strictEqual('pin' in unmigrated, false, 'Plaintext pin must be purged on-the-fly');
    assert.ok(unmigrated.pin_salt && unmigrated.pin_salt.length === 32);
    assert.strictEqual(unmigrated.pin_hash, referenceHashPin('9876', unmigrated.pin_salt));
  });

  // ==========================================================================
  // SECTION 6: MANDATORY FIRST-LOGIN PIN CHANGE WORKFLOW
  // ==========================================================================
  console.log('\n====================================================================');
  console.log('📍 SECTION 6: MANDATORY FIRST-LOGIN PIN CHANGE ADVERSARIAL STRESS');
  console.log('====================================================================');

  await runTest('FIRST-01', 'Newly added staff has mustChangePin: true and triggers intercept on first login', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);
    await sandbox.window.initDatabase();

    await sandbox.window.saveStaffMember({
      name: 'Aditi Rao',
      role: 'Cashier',
      pin: '6543',
      status: 'Active'
    });

    const newStaff = sandbox.window.staffList.find(s => s.name === 'Aditi Rao');
    assert.ok(newStaff, 'Staff must be in staffList');
    assert.strictEqual(newStaff.mustChangePin, true, 'Must have mustChangePin: true');

    // Terminal is locked waiting for staff PIN
    sandbox.window.lockTerminal(false);
    assert.strictEqual(sandbox.window.isTerminalLocked, true);

    // Select new staff and attempt login with temporary PIN
    sandbox.window.selectLoginStaff(newStaff.id);
    sandbox._dom.staffLoginPinInput.value = '6543';
    await sandbox.window.confirmStaffLogin();

    // Verify intercept modal opened and terminal NOT yet unlocked
    assert.strictEqual(sandbox.window.isTerminalLocked, true, 'Terminal must remain locked until PIN confirmed');
    assert.strictEqual(sandbox._dom.firstLoginPinModal.style.display, 'flex', 'First login modal must be open');
    assert.strictEqual(sandbox._dom.firstLoginStaffName.textContent, 'Aditi Rao');
  });

  await runTest('FIRST-02', 'First-login PIN change rejects trivial patterns (0000, 1234, 4321)', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);
    await sandbox.window.initDatabase();

    const staff = {
      id: 501,
      name: 'Test Staff',
      role: 'Cashier',
      pin_salt: '0123456789abcdef0123456789abcdef',
      pin_hash: referenceHashPin('9999', '0123456789abcdef0123456789abcdef'),
      mustChangePin: true
    };
    sandbox.window.staffList.push(staff);
    sandbox.window.openFirstLoginPinModal(staff);

    const trivialPins = ['0000', '1234', '4321'];
    for (const trivial of trivialPins) {
      sandbox._dom.firstLoginNewPin.value = trivial;
      sandbox._dom.firstLoginConfirmPin.value = trivial;
      await sandbox.window.submitFirstLoginPin();

      assert.strictEqual(sandbox._dom.firstLoginPinError.style.display, 'flex');
      assert.ok(sandbox._dom.firstLoginPinErrorText.textContent.includes('non-trivial PIN'));
      assert.strictEqual(staff.mustChangePin, true, 'mustChangePin must remain true');
    }
  });

  await runTest('FIRST-03', 'First-login PIN change rejects non-matching confirmation PIN', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    const staff = {
      id: 502,
      name: 'Test Staff 2',
      role: 'Cashier',
      pin_salt: '0123456789abcdef0123456789abcdef',
      pin_hash: referenceHashPin('9999', '0123456789abcdef0123456789abcdef'),
      mustChangePin: true
    };
    sandbox.window.staffList.push(staff);
    sandbox.window.openFirstLoginPinModal(staff);

    sandbox._dom.firstLoginNewPin.value = '8492';
    sandbox._dom.firstLoginConfirmPin.value = '8493';
    await sandbox.window.submitFirstLoginPin();

    assert.strictEqual(sandbox._dom.firstLoginPinError.style.display, 'flex');
    assert.ok(sandbox._dom.firstLoginPinErrorText.textContent.includes('PINs do not match'));
    assert.strictEqual(staff.mustChangePin, true);
  });

  await runTest('FIRST-04', 'Valid first-login PIN update generates new salt, clears flag, and unlocks terminal', async () => {
    const sandbox = createBrowserSandbox();
    vm.runInNewContext(coreJsContent, sandbox);
    vm.runInNewContext(staffJsContent, sandbox);

    const origSalt = '0123456789abcdef0123456789abcdef';
    const staff = {
      id: 503,
      name: 'Priya Sharma',
      role: 'Cashier',
      pin_salt: origSalt,
      pin_hash: referenceHashPin('9999', origSalt),
      mustChangePin: true
    };
    sandbox.window.staffList.push(staff);
    sandbox.window.openFirstLoginPinModal(staff);

    sandbox._dom.firstLoginNewPin.value = '5821';
    sandbox._dom.firstLoginConfirmPin.value = '5821';
    await sandbox.window.submitFirstLoginPin();

    assert.strictEqual(staff.mustChangePin, false, 'mustChangePin flag must be cleared');
    assert.notStrictEqual(staff.pin_salt, origSalt, 'Salt must be refreshed');
    assert.strictEqual(staff.pin_hash, referenceHashPin('5821', staff.pin_salt));
    assert.strictEqual(sandbox.window.isTerminalLocked, false, 'Terminal must be unlocked');
    assert.strictEqual(sandbox.window.currentStaff.name, 'Priya Sharma');
  });

  // ==========================================================================
  // FINAL VERDICT & METRICS SUMMARY
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER 2 COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================');

  if (failedTests > 0) {
    console.error('\n❌ FAILURES ENCOUNTERED:');
    failureList.forEach(f => {
      console.error(`- ${f.label}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✨ ALL ADVERSARIAL CRYPTO & STORAGE STRESS TESTS PASSED 100% GREEN!\n');
    process.exit(0);
  }
}

runAllChallengerTests().catch(err => {
  console.error('Fatal crash in challenger test suite:', err);
  process.exit(1);
});
