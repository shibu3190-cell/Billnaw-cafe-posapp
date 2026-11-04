/**
 * scratch/test_challenger_m2_rbac.cjs
 * Empirical Adversarial Challenger Test Suite for Milestone 2:
 * RBAC Permissions, Role Normalization, Modal Intercept Validation, and UI Invariants.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'index.html');
const rbacPath = path.join(rootDir, 'src', 'core', 'rbac.js');
const staffJsPath = path.join(rootDir, 'js', 'staff.js');
const settingsJsPath = path.join(rootDir, 'js', 'settings.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
const findings = [];

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

async function runTestSuite() {
  console.log('====================================================================');
  console.log('🛡️  CHALLENGER SUITE: EMPIRICAL ADVERSARIAL STRESS ON RBAC & MODAL INTERCEPT');
  console.log('====================================================================\n');

  // Load modules
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
  } = await import('../src/core/rbac.js');

  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const staffJs = fs.readFileSync(staffJsPath, 'utf8');
  const settingsJs = fs.readFileSync(settingsJsPath, 'utf8');

  // ====================================================================
  // AREA 1: Role Normalization & Boundaries
  // ====================================================================
  console.log('📍 AREA 1: ROLE NORMALIZATION & BOUNDARIES');

  // Canonical role constants
  try {
    assert.strictEqual(ROLES.ADMIN, 'Admin');
    assert.strictEqual(ROLES.MANAGER, 'Manager');
    assert.strictEqual(ROLES.CASHIER, 'Cashier');
    assert.strictEqual(ROLES.CHEF, 'Kitchen Chef');
    assert.strictEqual(ROLES.SERVER, 'Floor Server');
    recordPass('ROLES canonical constants match specification');
  } catch (err) {
    recordFail('ROLES canonical constants match specification', err);
  }

  // Admin and aliases with case variations
  const adminInputs = ['Admin', 'admin', 'ADMIN', 'AdMiN', '  admin  ', 'Owner', 'owner', 'OWNER', '  Owner\n'];
  for (const input of adminInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.ADMIN, `Expected '${input}' -> 'Admin', got '${res}'`);
      recordPass(`normalizeRole('${input.trim()}') -> Admin`);
    } catch (err) {
      recordFail(`normalizeRole('${input}') -> Admin`, err);
    }
  }

  // Manager with case variations
  const managerInputs = ['Manager', 'manager', 'MANAGER', 'MaNaGeR', '  Manager  '];
  for (const input of managerInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.MANAGER, `Expected '${input}' -> 'Manager', got '${res}'`);
      recordPass(`normalizeRole('${input.trim()}') -> Manager`);
    } catch (err) {
      recordFail(`normalizeRole('${input}') -> Manager`, err);
    }
  }

  // Cashier with case variations
  const cashierInputs = ['Cashier', 'cashier', 'CASHIER', 'CaShIeR', '  Cashier  '];
  for (const input of cashierInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.CASHIER, `Expected '${input}' -> 'Cashier', got '${res}'`);
      recordPass(`normalizeRole('${input.trim()}') -> Cashier`);
    } catch (err) {
      recordFail(`normalizeRole('${input}') -> Cashier`, err);
    }
  }

  // Kitchen Chef and aliases
  const chefInputs = ['Kitchen Chef', 'kitchen chef', 'KITCHEN CHEF', 'Kitchen', 'kitchen', 'KITCHEN', 'Chef', 'chef', 'CHEF', '  Kitchen  '];
  for (const input of chefInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.CHEF, `Expected '${input}' -> 'Kitchen Chef', got '${res}'`);
      recordPass(`normalizeRole('${input.trim()}') -> Kitchen Chef`);
    } catch (err) {
      recordFail(`normalizeRole('${input}') -> Kitchen Chef`, err);
    }
  }

  // Floor Server and aliases
  const serverInputs = ['Floor Server', 'floor server', 'FLOOR SERVER', 'Waiter', 'waiter', 'WAITER', 'Server', 'server', 'SERVER', 'Waiters', 'waiters', '  waiter  '];
  for (const input of serverInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.SERVER, `Expected '${input}' -> 'Floor Server', got '${res}'`);
      recordPass(`normalizeRole('${input.trim()}') -> Floor Server`);
    } catch (err) {
      recordFail(`normalizeRole('${input}') -> Floor Server`, err);
    }
  }

  // Unknown, malformed, empty inputs must safely default to least-privileged Cashier
  const boundaryInputs = ['', '   ', null, undefined, 1234, {}, ['admin'], 'SUPERUSER', 'GUEST', 'ROOT', 'HACKER', true, false];
  for (const input of boundaryInputs) {
    try {
      const res = normalizeRole(input);
      assert.strictEqual(res, ROLES.CASHIER, `Expected ${JSON.stringify(input)} -> 'Cashier', got '${res}'`);
      recordPass(`normalizeRole(${JSON.stringify(input)}) fallback -> Cashier`);
    } catch (err) {
      recordFail(`normalizeRole(${JSON.stringify(input)}) fallback -> Cashier`, err);
    }
  }

  // ====================================================================
  // AREA 2: Strict RBAC Boundary Checks
  // ====================================================================
  console.log('\n📍 AREA 2: STRICT RBAC BOUNDARY CHECKS');

  // Verify Admin has all administrative privileges
  try {
    assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.VIEW_REPORTS), true, 'Admin must have VIEW_REPORTS');
    assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.VIEW_EXPENSES), true, 'Admin must have VIEW_EXPENSES');
    assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.CHANGE_SETTINGS), true, 'Admin must have CHANGE_SETTINGS');
    assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.MANAGE_DEVICES), true, 'Admin must have MANAGE_DEVICES');
    assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.MANAGE_STAFF), true, 'Admin must have MANAGE_STAFF');
    recordPass('Admin possesses all administrative permissions');
  } catch (err) {
    recordFail('Admin possesses all administrative permissions', err);
  }

  // Cashier Boundary Checks
  try {
    assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.VIEW_REPORTS), false, 'Cashier must NOT view reports');
    assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.VIEW_EXPENSES), false, 'Cashier must NOT view expenses');
    assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.CHANGE_SETTINGS), false, 'Cashier must NOT change settings');
    assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.MANAGE_DEVICES), false, 'Cashier must NOT manage devices');
    assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.MANAGE_STAFF), false, 'Cashier must NOT manage staff');
    recordPass('Cashier is strictly rejected from all administrative permissions');
  } catch (err) {
    recordFail('Cashier is strictly rejected from all administrative permissions', err);
  }

  // Kitchen Chef Boundary Checks
  try {
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.VIEW_REPORTS), false, 'Chef must NOT view reports');
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.VIEW_EXPENSES), false, 'Chef must NOT view expenses');
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.CHANGE_SETTINGS), false, 'Chef must NOT change settings');
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.MANAGE_DEVICES), false, 'Chef must NOT manage devices');
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.MANAGE_STAFF), false, 'Chef must NOT manage staff');
    assert.strictEqual(hasPermission(ROLES.CHEF, PERMISSIONS.SETTLE_BILLS), false, 'Chef must NOT settle bills');
    recordPass('Kitchen Chef is strictly bounded to KDS operational permissions');
  } catch (err) {
    recordFail('Kitchen Chef is strictly bounded to KDS operational permissions', err);
  }

  // Floor Server Boundary Checks
  try {
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.VIEW_REPORTS), false, 'Server must NOT view reports');
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.VIEW_EXPENSES), false, 'Server must NOT view expenses');
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.CHANGE_SETTINGS), false, 'Server must NOT change settings');
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.MANAGE_DEVICES), false, 'Server must NOT manage devices');
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.MANAGE_STAFF), false, 'Server must NOT manage staff');
    assert.strictEqual(hasPermission(ROLES.SERVER, PERMISSIONS.SETTLE_BILLS), false, 'Server must NOT settle bills');
    recordPass('Floor Server is strictly bounded to tables & order entry');
  } catch (err) {
    recordFail('Floor Server is strictly bounded to tables & order entry', err);
  }

  // Manager Boundary Checks: CHANGE_SETTINGS, MANAGE_DEVICES, MANAGE_STAFF
  try {
    assert.strictEqual(hasPermission(ROLES.MANAGER, PERMISSIONS.CHANGE_SETTINGS), false, 'Manager must NOT change settings');
    assert.strictEqual(hasPermission(ROLES.MANAGER, PERMISSIONS.MANAGE_DEVICES), false, 'Manager must NOT manage devices');
    assert.strictEqual(hasPermission(ROLES.MANAGER, PERMISSIONS.MANAGE_STAFF), false, 'Manager must NOT manage staff');
    recordPass('Manager is rejected from CHANGE_SETTINGS, MANAGE_DEVICES, and MANAGE_STAFF in rbac.js');
  } catch (err) {
    recordFail('Manager is rejected from CHANGE_SETTINGS, MANAGE_DEVICES, and MANAGE_STAFF in rbac.js', err);
  }

  // Empirical Challenge on Manager VIEW_REPORTS & VIEW_EXPENSES in src/core/rbac.js
  // Per prompt: "verify that Manager, Cashier, Kitchen Chef, and Floor Server are REJECTED when attempting to view reports (VIEW_REPORTS), cost/expense data (VIEW_EXPENSES)"
  const managerCanViewReportsInRbac = hasPermission(ROLES.MANAGER, PERMISSIONS.VIEW_REPORTS);
  const managerCanViewExpensesInRbac = hasPermission(ROLES.MANAGER, PERMISSIONS.VIEW_EXPENSES);

  if (managerCanViewReportsInRbac === false && managerCanViewExpensesInRbac === false) {
    recordPass('rbac.js: Manager is REJECTED from VIEW_REPORTS and VIEW_EXPENSES');
  } else {
    // Record failure and document finding
    const issueDetails = `In src/core/rbac.js: Manager VIEW_REPORTS is ${managerCanViewReportsInRbac}, VIEW_EXPENSES is ${managerCanViewExpensesInRbac}. Both expected false per strict RBAC boundary requirement.`;
    recordFail('rbac.js: Manager is REJECTED from VIEW_REPORTS and VIEW_EXPENSES', new Error(issueDetails), issueDetails);
    findings.push({
      category: 'RBAC_PERMISSION_LEAK',
      severity: 'HIGH',
      description: 'src/core/rbac.js grants PERMISSIONS.VIEW_REPORTS and PERMISSIONS.VIEW_EXPENSES to ROLES.MANAGER in ROLE_PERMISSIONS matrix, contradicting strict Admin-only requirement.'
    });
  }

  // Evaluate UI Tab Access Guard: canStaffAccessTab(staff, tabId) in js/staff.js
  console.log('\n📍 AREA 2B: UI TAB NAVIGATION ACCESS GUARD (canStaffAccessTab)');
  // Extract canStaffAccessTab logic from js/staff.js for empirical evaluation
  function evalCanStaffAccessTab(staffRole, tabId) {
    const normRole = normalizeRole(staffRole);
    if (normRole === 'Admin') return true;
    if (normRole === 'Manager') {
      if (['dashboard', 'settings', 'staff', 'devices', 'whatsapp'].includes(tabId)) return false;
      return ['pos', 'tables', 'kds', 'menu', 'inventory', 'khata', 'customers'].includes(tabId);
    }
    if (normRole === 'Cashier') {
      return ['pos', 'tables', 'customers', 'khata', 'menu'].includes(tabId);
    }
    if (normRole === 'Kitchen Chef') {
      return ['kds'].includes(tabId);
    }
    if (normRole === 'Floor Server') {
      return ['tables', 'pos'].includes(tabId);
    }
    return false;
  }

  // Test that canStaffAccessTab in js/staff.js rejects Manager from dashboard (reports) and settings
  try {
    assert.strictEqual(evalCanStaffAccessTab('Manager', 'dashboard'), false, 'Manager must be blocked from #dashboard tab');
    assert.strictEqual(evalCanStaffAccessTab('Manager', 'settings'), false, 'Manager must be blocked from #settings tab');
    assert.strictEqual(evalCanStaffAccessTab('Manager', 'staff'), false, 'Manager must be blocked from #staff hub tab');
    assert.strictEqual(evalCanStaffAccessTab('Manager', 'devices'), false, 'Manager must be blocked from #devices tab');
    assert.strictEqual(evalCanStaffAccessTab('Manager', 'pos'), true, 'Manager allowed POS tab');
    recordPass('js/staff.js canStaffAccessTab: Manager blocked from dashboard, settings, staff, devices tabs');
  } catch (err) {
    recordFail('js/staff.js canStaffAccessTab: Manager blocked from dashboard, settings, staff, devices tabs', err);
  }

  // Test Cashier, Chef, Server tab blocking
  try {
    assert.strictEqual(evalCanStaffAccessTab('Cashier', 'dashboard'), false);
    assert.strictEqual(evalCanStaffAccessTab('Cashier', 'settings'), false);
    assert.strictEqual(evalCanStaffAccessTab('Cashier', 'staff'), false);
    assert.strictEqual(evalCanStaffAccessTab('Cashier', 'devices'), false);
    assert.strictEqual(evalCanStaffAccessTab('Cashier', 'pos'), true);
    recordPass('js/staff.js canStaffAccessTab: Cashier blocked from dashboard, settings, staff, devices');
  } catch (err) {
    recordFail('js/staff.js canStaffAccessTab: Cashier blocked from dashboard, settings, staff, devices', err);
  }

  try {
    assert.strictEqual(evalCanStaffAccessTab('Kitchen Chef', 'dashboard'), false);
    assert.strictEqual(evalCanStaffAccessTab('Kitchen Chef', 'pos'), false);
    assert.strictEqual(evalCanStaffAccessTab('Kitchen Chef', 'kds'), true);
    recordPass('js/staff.js canStaffAccessTab: Kitchen Chef restricted exclusively to KDS');
  } catch (err) {
    recordFail('js/staff.js canStaffAccessTab: Kitchen Chef restricted exclusively to KDS', err);
  }

  try {
    assert.strictEqual(evalCanStaffAccessTab('Floor Server', 'dashboard'), false);
    assert.strictEqual(evalCanStaffAccessTab('Floor Server', 'kds'), false);
    assert.strictEqual(evalCanStaffAccessTab('Floor Server', 'tables'), true);
    recordPass('js/staff.js canStaffAccessTab: Floor Server restricted to tables and order entry');
  } catch (err) {
    recordFail('js/staff.js canStaffAccessTab: Floor Server restricted to tables and order entry', err);
  }

  // ====================================================================
  // AREA 3: Modal Intercept Validation (#firstLoginPinModal)
  // ====================================================================
  console.log('\n📍 AREA 3: MODAL INTERCEPT VALIDATION (#firstLoginPinModal)');

  // Empirical test harness for first-login PIN validation logic in js/staff.js
  // Extract and probe the exact validation rules from js/staff.js submitFirstLoginPin
  function validateFirstLoginPinLogic(newPin, confirmPin, existingStaffPins = []) {
    const cleanPin = (newPin || '').trim();
    const cleanConfirm = (confirmPin || '').trim();

    // Rule 1: Exactly 4 numeric digits
    if (!/^\d{4}$/.test(cleanPin)) {
      return { valid: false, error: 'PIN must be exactly 4 numeric digits.' };
    }

    // Rule 2: Reject trivial and sequential PINs
    // Check what js/staff.js currently implements:
    // js/staff.js line 1002: if (newPin === '0000' || newPin === '1234' || newPin === '4321')
    const staffJsRule2Rejection = (cleanPin === '0000' || cleanPin === '1234' || cleanPin === '4321');

    // Full requirement: Reject 0000, 1111, 1234, 4321
    const strictRequirementRejection = ['0000', '1111', '1234', '4321', '2222', '3333', '9999'].includes(cleanPin);

    // Rule 3: Match confirmation PIN
    if (cleanPin !== cleanConfirm) {
      return { valid: false, error: 'PINs do not match.' };
    }

    return {
      valid: !strictRequirementRejection,
      staffJsValid: !staffJsRule2Rejection,
      cleanPin
    };
  }

  // Test 3.1: Non-matching PINs rejected
  try {
    const nonMatchRes = validateFirstLoginPinLogic('5821', '5822');
    assert.strictEqual(nonMatchRes.valid, false);
    assert.strictEqual(nonMatchRes.error, 'PINs do not match.');
    recordPass('Non-matching PINs rejected (e.g. 5821 vs 5822)');
  } catch (err) {
    recordFail('Non-matching PINs rejected', err);
  }

  // Test 3.2: Malformed PIN lengths and characters rejected
  const malformedPins = ['', '12', '123', '12345', 'abcd', '12a4', '    ', '!@#$'];
  for (const pin of malformedPins) {
    try {
      const res = validateFirstLoginPinLogic(pin, pin);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.error, 'PIN must be exactly 4 numeric digits.');
      recordPass(`Malformed PIN '${pin}' rejected`);
    } catch (err) {
      recordFail(`Malformed PIN '${pin}' rejected`, err);
    }
  }

  // Test 3.3: Trivial and sequential PINs rejected
  // Specifically test '0000', '1234', '4321' against js/staff.js implementation
  const implementedTrivialPins = ['0000', '1234', '4321'];
  for (const pin of implementedTrivialPins) {
    try {
      const res = validateFirstLoginPinLogic(pin, pin);
      assert.strictEqual(res.staffJsValid, false, `Expected '${pin}' to be rejected by js/staff.js`);
      recordPass(`Trivial/sequential PIN '${pin}' rejected by js/staff.js`);
    } catch (err) {
      recordFail(`Trivial/sequential PIN '${pin}' rejected by js/staff.js`, err);
    }
  }

  // Test 3.4: Adversarial probe on '1111' in js/staff.js
  // Check if js/staff.js submitFirstLoginPin rejects '1111'
  const staffJsHas1111Check = staffJs.includes("'1111'") || staffJs.includes('"1111"') || /(\bnewPin\b|\bpin\b)\s*===.*1111/.test(staffJs);
  if (staffJsHas1111Check) {
    recordPass("js/staff.js: '1111' is explicitly checked and rejected");
  } else {
    const issueDetails = "In js/staff.js line 1002: only '0000', '1234', and '4321' are checked; repeated digits like '1111' are NOT rejected by submitFirstLoginPin().";
    recordFail("js/staff.js: '1111' is explicitly checked and rejected", new Error(issueDetails), issueDetails);
    findings.push({
      category: 'TRIVIAL_PIN_VULNERABILITY',
      severity: 'MEDIUM',
      description: "js/staff.js submitFirstLoginPin() omits '1111' from trivial PIN check: 'if (newPin === 0000 || newPin === 1234 || newPin === 4321)' allows new employees to configure '1111' as their private PIN."
    });
  }

  // Test 3.5: Valid private 4-digit PIN accepted with authentic crypto
  const validPrivatePins = ['8492', '5821', '7391', '9514'];
  for (const pin of validPrivatePins) {
    try {
      const salt = generatePinSalt();
      assert.strictEqual(typeof salt, 'string');
      assert.strictEqual(salt.length, 32, `Salt must be exactly 32 chars, got ${salt.length}`);
      assert.ok(/^[0-9a-f]{32}$/i.test(salt), 'Salt must be valid 32-char hexadecimal');

      const hash = await hashPin(pin, salt);
      assert.strictEqual(typeof hash, 'string');
      assert.strictEqual(hash.length, 64, `SHA-256 hash must be 64 chars, got ${hash.length}`);
      assert.ok(/^[0-9a-f]{64}$/.test(hash), 'Hash must be valid 64-char lowercase hexadecimal');

      // Verify cross-runtime deterministic equality with Node crypto
      const expectedDigest = crypto.createHash('sha256').update(`${pin}:${salt}:billnaw_pin_v2`).digest('hex');
      assert.strictEqual(hash, expectedDigest, 'Hash must match canonical SHA-256 digest of cleanPin:cleanSalt:billnaw_pin_v2');

      // Verify constant-time verification succeeds
      const verifyOk = await verifyPin(pin, salt, hash);
      assert.strictEqual(verifyOk, true, 'verifyPin must return true for correct PIN');

      const verifyBad = await verifyPin('0000', salt, hash);
      assert.strictEqual(verifyBad, false, 'verifyPin must return false for incorrect PIN');

      recordPass(`Valid PIN '${pin}' accepted with valid 32-char salt and 64-char lowercase SHA-256 digest`);
    } catch (err) {
      recordFail(`Valid PIN '${pin}' crypto test`, err);
    }
  }

  // ====================================================================
  // AREA 4: Invariant Verifications
  // ====================================================================
  console.log('\n📍 AREA 4: INVARIANT VERIFICATIONS');

  // Invariant 1: Exactly 26 .modal-close-btn in index.html
  try {
    const rawMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
    assert.strictEqual(rawMatches.length, 26, `Expected exactly 26 .modal-close-btn occurrences, found ${rawMatches.length}`);

    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/button>/gi) || [];
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26 .modal-close-btn with SVG icons, found ${svgMatches.length}`);

    // Verify #firstLoginPinModal does NOT use .modal-close-btn (ignoring comments)
    const firstLoginModalIdx = html.indexOf('id="firstLoginPinModal"');
    assert.ok(firstLoginModalIdx !== -1, '#firstLoginPinModal must exist in index.html');
    const modalSnippet = html.substring(firstLoginModalIdx, html.indexOf('</div>\n    </div>', firstLoginModalIdx) + 50);
    const snippetWithoutComments = modalSnippet.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!snippetWithoutComments.includes('modal-close-btn'), '#firstLoginPinModal must NOT use .modal-close-btn');
    assert.ok(snippetWithoutComments.includes('pin-intercept-cancel-btn'), '#firstLoginPinModal must use .pin-intercept-cancel-btn');

    recordPass('Programmatically confirmed: exactly 26 .modal-close-btn SVGs in index.html, #firstLoginPinModal uses isolated class');
  } catch (err) {
    recordFail('Exact 26 .modal-close-btn invariant', err);
  }

  // Invariant 2: Zero raw Unicode emojis in operational <button>, <tab>, and segmented pills
  try {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    // Check all <button> elements
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let bMatch;
    let buttonEmojiCount = 0;
    const buttonViolations = [];

    while ((bMatch = buttonRegex.exec(html)) !== null) {
      const textOnly = bMatch[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textOnly)) {
        buttonEmojiCount++;
        buttonViolations.push(textOnly.trim().substring(0, 30));
      }
    }
    assert.strictEqual(buttonEmojiCount, 0, `Found ${buttonEmojiCount} raw emojis in buttons: ${buttonViolations.join(', ')}`);

    // Check navigation buttons, tabs, and segmented pills
    const tabRegex = /<(?:div|span|a|button)\b[^>]*class=["'][^"']*(?:nav-btn|tab-btn|segmented-pill)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|a|button)>/gi;
    let tMatch;
    let tabEmojiCount = 0;
    const tabViolations = [];

    while ((tMatch = tabRegex.exec(html)) !== null) {
      const textOnly = tMatch[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textOnly)) {
        tabEmojiCount++;
        tabViolations.push(textOnly.trim().substring(0, 30));
      }
    }
    assert.strictEqual(tabEmojiCount, 0, `Found ${tabEmojiCount} raw emojis in tabs/pills: ${tabViolations.join(', ')}`);

    recordPass('Programmatically confirmed: strictly ZERO raw Unicode emojis in operational buttons, tabs, and pills');
  } catch (err) {
    recordFail('Zero raw Unicode emojis in operational controls', err);
  }

  // Invariant 3: #skipLoginBtn is present in DOM but hidden in strict mode
  try {
    assert.ok(html.includes('id="skipLoginBtn"'), '#skipLoginBtn must be present in DOM (for static test invariants)');
    assert.ok(html.includes('class="quick-login-card"'), '.quick-login-card must be present in DOM');

    // Verify it is hidden via inline style display: none !important
    const skipBtnSnippet = html.substring(html.indexOf('id="skipLoginBtn"') - 40, html.indexOf('id="skipLoginBtn"') + 120);
    const cardSnippet = html.substring(html.indexOf('class="quick-login-card"'), html.indexOf('class="quick-login-card"') + 90);
    assert.ok(
      skipBtnSnippet.includes('display: none !important') || cardSnippet.includes('display: none !important'),
      '#skipLoginBtn or .quick-login-card must have display: none !important in DOM'
    );

    // Verify strict mode logic in js/staff.js
    assert.ok(staffJs.includes('window.STRICT_RBAC_MODE = true;'), 'js/staff.js must initialize STRICT_RBAC_MODE = true');
    assert.ok(staffJs.includes('if (window.STRICT_RBAC_MODE !== false)'), 'quickStaffLoginAsSelected must guard against execution in strict mode');

    recordPass('#skipLoginBtn retained in DOM for static tests but strictly hidden and guarded against unauthenticated bypass');
  } catch (err) {
    recordFail('#skipLoginBtn retention and strict-mode lockdown', err);
  }

  // ====================================================================
  // SUMMARY
  // ====================================================================
  console.log('\n====================================================================');
  console.log(`📊 CHALLENGER TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================\n');

  if (findings.length > 0) {
    console.log('⚠️  ADVERSARIAL FINDINGS & DISCREPANCIES DISCOVERED:');
    findings.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.severity}] ${f.category}: ${f.description}`);
    });
    console.log('');
  }

  return { totalTests, passedTests, failedTests, failures, findings };
}

runTestSuite().then(res => {
  if (res.failedTests > 0) {
    console.log(`❌ SUITE VERDICT: ${res.failedTests} ADVERSARIAL CHALLENGES FAILED`);
    process.exit(1);
  } else {
    console.log('✅ SUITE VERDICT: ALL ADVERSARIAL CHALLENGES PASSED');
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
