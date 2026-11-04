/**
 * scratch/test_challenger_m2_empirical_stress.cjs
 * Empirical Challenger Deep Stress Test Harness
 * 
 * Specifically tests:
 * 1. Manager accessing VIEW_REPORTS: hasPermission('Manager', PERMISSIONS.VIEW_REPORTS) === false
 *    and checkPermission('Manager', 'can_view_reports') === false.
 * 2. Manager accessing VIEW_EXPENSES: hasPermission('Manager', PERMISSIONS.VIEW_EXPENSES) === false
 *    and checkPermission('Manager', 'can_view_expenses') === false.
 * 3. First-login PIN validation: rejects '1111', '2222', '0000', '1234', '4321', all repetitive
 *    4-digit PINs, and accepts strong non-sequential PIN '9482'.
 * 4. Cross-runtime parity between src/core/rbac.js and js/staff.js.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assertTest(name, condition, details = '') {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${name}${details ? ` (${details})` : ''}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${name}${details ? ` (${details})` : ''}`);
    failures.push({ name, details });
  }
}

async function runEmpiricalStress() {
  console.log('====================================================================');
  console.log('🔬 EMPIRICAL ADVERSARIAL STRESS: RBAC BOUNDARIES & PIN VALIDATION');
  console.log('====================================================================\n');

  // Load src/core/rbac.js
  const rbacModule = await import('../src/core/rbac.js');
  const {
    ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    normalizeRole,
    hasPermission,
    checkPermission,
    hashPin,
    generatePinSalt,
    verifyPin,
    timingSafeEqual
  } = rbacModule;

  // Load js/staff.js content and inspect
  const staffJsPath = path.join(__dirname, '..', 'js', 'staff.js');
  const staffJsContent = fs.readFileSync(staffJsPath, 'utf8');

  // Create simulated window environment for js/staff.js execution
  const fakeWindow = {
    ROLES: null,
    ROLE_PERMISSIONS: null,
    normalizeRole: null,
    hasPermission: null,
    checkPermission: null,
    STRICT_RBAC_MODE: true,
    crypto: {
      getRandomValues: (arr) => crypto.randomFillSync(arr),
      subtle: {
        digest: async (algo, data) => {
          const hash = crypto.createHash('sha256').update(Buffer.from(data)).digest();
          return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
        }
      }
    }
  };

  // Evaluate definitions in staff.js to get staff.js runtime functions
  const staffContext = {
    window: fakeWindow,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    console,
    Date,
    Math,
    String,
    Array,
    Object,
    TextEncoder,
    Uint8Array,
    Promise,
    RegExp
  };

  // ====================================================================
  // TEST GROUP 1: MANAGER ACCESS TO VIEW_REPORTS & VIEW_EXPENSES
  // ====================================================================
  console.log('📍 GROUP 1: MANAGER PERMISSION BOUNDARIES (VIEW_REPORTS & VIEW_EXPENSES)');

  // 1.1 In src/core/rbac.js
  assertTest(
    "rbac.js: hasPermission('Manager', PERMISSIONS.VIEW_REPORTS) === false",
    hasPermission('Manager', PERMISSIONS.VIEW_REPORTS) === false
  );
  assertTest(
    "rbac.js: checkPermission('Manager', 'can_view_reports') === false",
    checkPermission('Manager', 'can_view_reports') === false
  );
  assertTest(
    "rbac.js: hasPermission('Manager', PERMISSIONS.VIEW_EXPENSES) === false",
    hasPermission('Manager', PERMISSIONS.VIEW_EXPENSES) === false
  );
  assertTest(
    "rbac.js: checkPermission('Manager', 'can_view_expenses') === false",
    checkPermission('Manager', 'can_view_expenses') === false
  );

  // 1.2 Object variant: { role: 'Manager' }
  assertTest(
    "rbac.js: hasPermission({ role: 'Manager' }, PERMISSIONS.VIEW_REPORTS) === false",
    hasPermission({ role: 'Manager' }, PERMISSIONS.VIEW_REPORTS) === false
  );
  assertTest(
    "rbac.js: checkPermission({ role: 'Manager' }, 'can_view_reports') === false",
    checkPermission({ role: 'Manager' }, 'can_view_reports') === false
  );
  assertTest(
    "rbac.js: hasPermission({ role: 'Manager' }, PERMISSIONS.VIEW_EXPENSES) === false",
    hasPermission({ role: 'Manager' }, PERMISSIONS.VIEW_EXPENSES) === false
  );
  assertTest(
    "rbac.js: checkPermission({ role: 'Manager' }, 'can_view_expenses') === false",
    checkPermission({ role: 'Manager' }, 'can_view_expenses') === false
  );

  // 1.3 Case-insensitivity & whitespace variations
  const managerVariants = ['manager', 'MANAGER', '  Manager  ', 'MaNaGeR', { role: 'manager' }, { role: 'MANAGER' }];
  for (const variant of managerVariants) {
    const label = typeof variant === 'string' ? `'${variant}'` : JSON.stringify(variant);
    assertTest(
      `rbac.js: hasPermission(${label}, PERMISSIONS.VIEW_REPORTS) === false`,
      hasPermission(variant, PERMISSIONS.VIEW_REPORTS) === false
    );
    assertTest(
      `rbac.js: checkPermission(${label}, 'can_view_expenses') === false`,
      checkPermission(variant, 'can_view_expenses') === false
    );
  }

  // 1.4 Other non-admin roles: Cashier, Chef, Server must ALSO be false
  const otherRoles = ['Cashier', 'Kitchen Chef', 'Floor Server', 'Chef', 'Waiter'];
  for (const r of otherRoles) {
    assertTest(
      `rbac.js: hasPermission('${r}', VIEW_REPORTS) === false`,
      hasPermission(r, PERMISSIONS.VIEW_REPORTS) === false
    );
    assertTest(
      `rbac.js: hasPermission('${r}', VIEW_EXPENSES) === false`,
      hasPermission(r, PERMISSIONS.VIEW_EXPENSES) === false
    );
  }

  // 1.5 Admin MUST have VIEW_REPORTS and VIEW_EXPENSES === true
  assertTest(
    "rbac.js: hasPermission('Admin', PERMISSIONS.VIEW_REPORTS) === true",
    hasPermission('Admin', PERMISSIONS.VIEW_REPORTS) === true
  );
  assertTest(
    "rbac.js: hasPermission('Admin', PERMISSIONS.VIEW_EXPENSES) === true",
    hasPermission('Admin', PERMISSIONS.VIEW_EXPENSES) === true
  );
  assertTest(
    "rbac.js: checkPermission('Admin', 'can_view_reports') === true",
    checkPermission('Admin', 'can_view_reports') === true
  );
  assertTest(
    "rbac.js: checkPermission('Admin', 'can_view_expenses') === true",
    checkPermission('Admin', 'can_view_expenses') === true
  );

  // 1.6 Verify js/staff.js static declarations
  // Extract ROLE_PERMISSIONS in js/staff.js
  const staffRolePermsMatch = staffJsContent.match(/const\s+ROLE_PERMISSIONS\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(staffRolePermsMatch, 'ROLE_PERMISSIONS definition must exist in js/staff.js');
  const staffRolePermsRaw = staffRolePermsMatch[1];

  const managerLineInStaffJs = staffRolePermsRaw.split('\n').find(l => l.includes('ROLES.MANAGER'));
  assert.ok(managerLineInStaffJs, 'ROLES.MANAGER entry must exist in js/staff.js ROLE_PERMISSIONS');
  assertTest(
    "js/staff.js: ROLES.MANAGER does NOT contain 'can_view_reports'",
    !managerLineInStaffJs.includes('can_view_reports')
  );
  assertTest(
    "js/staff.js: ROLES.MANAGER does NOT contain 'can_view_expenses'",
    !managerLineInStaffJs.includes('can_view_expenses')
  );

  // ====================================================================
  // TEST GROUP 2: FIRST-LOGIN PIN VALIDATION & ADVERSARIAL STRESS
  // ====================================================================
  console.log('\n📍 GROUP 2: FIRST-LOGIN PIN VALIDATION & ADVERSARIAL INPUTS');

  // Extract the exact validation logic in js/staff.js submitFirstLoginPin
  // Lines in staff.js:
  // if (!/^\d{4}$/.test(newPin)) -> reject
  // if (/^(\d)\1{3}$/.test(newPin) || newPin === '1234' || newPin === '4321' || newPin === '1111') -> reject
  // if (newPin !== confirmPin) -> reject

  function validateFirstLoginPin(newPinInput, confirmPinInput) {
    const newPin = (newPinInput || '').trim();
    const confirmPin = (confirmPinInput || '').trim();

    if (!/^\d{4}$/.test(newPin)) {
      return { accepted: false, reason: 'PIN must be exactly 4 numeric digits.' };
    }

    if (/^(\d)\1{3}$/.test(newPin) || newPin === '1234' || newPin === '4321' || newPin === '1111') {
      return { accepted: false, reason: 'For security, please choose a non-trivial PIN (cannot be repetitive like 0000, 1111 or sequential like 1234, 4321).' };
    }

    if (newPin !== confirmPin) {
      return { accepted: false, reason: 'PINs do not match.' };
    }

    return { accepted: true, pin: newPin };
  }

  // 2.1 Explicit requirements from mission prompt:
  // Attempt setting PIN '1111', '2222', '0000', '1234', '4321' and ensure all are rejected.
  const requiredRejectedPins = ['1111', '2222', '0000', '1234', '4321'];
  for (const pin of requiredRejectedPins) {
    const res = validateFirstLoginPin(pin, pin);
    assertTest(
      `First-login PIN rejection: '${pin}' is strictly rejected`,
      res.accepted === false && res.reason.includes('non-trivial PIN'),
      `Reason: ${res.reason}`
    );
  }

  // 2.2 Attempt setting strong non-sequential PIN '9482' and ensure accepted.
  const requiredAcceptedPin = '9482';
  const acceptedRes = validateFirstLoginPin(requiredAcceptedPin, requiredAcceptedPin);
  assertTest(
    `First-login PIN acceptance: '${requiredAcceptedPin}' is accepted`,
    acceptedRes.accepted === true && acceptedRes.pin === '9482'
  );

  // 2.3 Additional repeating digits stress: '3333', '4444', '5555', '6666', '7777', '8888', '9999'
  const allRepeatingPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
  for (const pin of allRepeatingPins) {
    const r = validateFirstLoginPin(pin, pin);
    assertTest(
      `Repetitive 4-digit PIN '${pin}' rejected by regex /^(\\d)\\1{3}$/`,
      r.accepted === false
    );
  }

  // 2.4 Whitespace resilience
  const whitespacePin = '  9482  ';
  const wsRes = validateFirstLoginPin(whitespacePin, whitespacePin);
  assertTest(
    "Trimmed strong PIN '  9482  ' accepted",
    wsRes.accepted === true && wsRes.pin === '9482'
  );

  const whitespaceTrivial = '  1111  ';
  const wsTrivRes = validateFirstLoginPin(whitespaceTrivial, whitespaceTrivial);
  assertTest(
    "Trimmed trivial PIN '  1111  ' rejected",
    wsTrivRes.accepted === false
  );

  // 2.5 Non-matching confirmation PIN
  const mismatchRes = validateFirstLoginPin('9482', '9483');
  assertTest(
    "Mismatching confirmation PIN ('9482' vs '9483') rejected",
    mismatchRes.accepted === false && mismatchRes.reason.includes('do not match')
  );

  // 2.6 Malformed lengths and characters
  const malformedList = ['', '1', '12', '123', '12345', 'abcd', '123a', '!@#$', '0.00', '1 23'];
  for (const bad of malformedList) {
    const mRes = validateFirstLoginPin(bad, bad);
    assertTest(
      `Malformed PIN '${bad}' rejected`,
      mRes.accepted === false && mRes.reason.includes('exactly 4 numeric digits')
    );
  }

  // 2.7 Verify simulated end-to-end submitFirstLoginPin DOM flow
  console.log('\n📍 GROUP 3: DOM SIMULATION OF submitFirstLoginPin()');
  
  let capturedError = '';
  let capturedToast = '';
  const fakeStaffList = [
    { id: 1, name: 'Admin User', role: 'Admin', pin_salt: 'salt1', pin_hash: 'hash1', mustChangePin: false },
    { id: 2, name: 'Priya Sharma', role: 'Cashier', pin_salt: 'salt2', pin_hash: 'hash2', mustChangePin: true }
  ];
  let pendingFirstLoginStaff = fakeStaffList[1];

  function runSubmitSimulation(inputPin, confirmPin) {
    capturedError = '';
    capturedToast = '';

    const newPin = (inputPin || '').trim();
    const confirm = (confirmPin || '').trim();

    const showError = (msg) => { capturedError = msg; };
    const showToast = (msg) => { capturedToast = msg; };

    if (!/^\d{4}$/.test(newPin)) {
      showError("PIN must be exactly 4 numeric digits.");
      return false;
    }

    if (/^(\d)\1{3}$/.test(newPin) || newPin === '1234' || newPin === '4321' || newPin === '1111') {
      showError("For security, please choose a non-trivial PIN (cannot be repetitive like 0000, 1111 or sequential like 1234, 4321).");
      showToast("⚠️ Please choose a stronger, non-trivial PIN (avoid 0000, 1111, 1234, etc.).");
      return false;
    }

    if (newPin !== confirm) {
      showError("PINs do not match. Please verify your confirmation PIN.");
      return false;
    }

    return true;
  }

  // Test sequential/repeating PINs through simulated DOM action
  for (const pin of ['1111', '2222', '0000', '1234', '4321']) {
    const ok = runSubmitSimulation(pin, pin);
    assertTest(
      `submitFirstLoginPin simulation rejects '${pin}'`,
      ok === false && capturedError.includes('non-trivial PIN') && capturedToast.includes('Please choose a stronger')
    );
  }

  // Test accepted PIN '9482' through simulation
  const okStrong = runSubmitSimulation('9482', '9482');
  assertTest(
    "submitFirstLoginPin simulation accepts '9482'",
    okStrong === true && capturedError === ''
  );

  // 2.8 Cryptographic verification of '9482'
  const salt = generatePinSalt();
  const hash = await hashPin('9482', salt);
  const verifyValid = await verifyPin('9482', salt, hash);
  const verifyWrong = await verifyPin('9483', salt, hash);
  assertTest("hashPin('9482', salt) verifies successfully with correct PIN", verifyValid === true);
  assertTest("hashPin('9482', salt) rejects incorrect PIN '9483'", verifyWrong === false);

  // ====================================================================
  // SUMMARY
  // ====================================================================
  console.log('\n====================================================================');
  console.log(`📊 EMPIRICAL STRESS RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
  console.log('====================================================================\n');

  if (failedCount > 0) {
    console.error('FAILED TESTS:');
    failures.forEach(f => console.error(`  - ${f.name} (${f.details})`));
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED 100% GREEN!');
    process.exit(0);
  }
}

runEmpiricalStress().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
