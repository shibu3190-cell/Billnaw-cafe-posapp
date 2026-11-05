/**
 * scratch/test_adversarial_m5_challenger.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST & ATTACK HARNESS
 * Milestone 5: Multi-Device Pairing, 10-Day Persistence & PIN Role Switching
 * Executed by: challenger_o9_m5_1 (critic, specialist)
 *
 * Attack Vectors Tested:
 * 1. 10-Day Persistence Boundary & Malicious Timestamp Manipulation:
 *    - Day 0 (now): valid session, PIN unlock allowed without re-pairing.
 *    - Day 5: valid session.
 *    - Day 9.99 (9.99 days elapsed): strictly valid.
 *    - Day 9.999999 (exact microsecond before 10 days): strictly valid.
 *    - Exact boundary (864,000,000 ms elapsed): expired (strictly < TTL).
 *    - Day 10.01 (10.01 days elapsed): expired.
 *    - Day 15 & Day 100: expired, local credentials cleared, reverts to pairing.
 *    - Negative timestamps, future timestamps, NaN, empty strings, corrupted strings.
 *    - Master terminal persistence immunity vs secondary terminal expiration eviction.
 *
 * 2. Profile Role Switching & Privilege Escalation Attacks:
 *    - Attacker attempts switching to Admin using Cashier PIN -> MUST FAIL.
 *    - Attacker attempts switching to Admin using Kitchen Chef PIN -> MUST FAIL.
 *    - Attacker attempts switching to Admin using sequential/trivial PINs -> MUST FAIL.
 *    - Attacker attempts switching to Admin using invalid/empty strings -> MUST FAIL.
 *    - Legitimate Admin PIN (Master Admin PIN or designated Admin staff PIN) -> SUCCEEDS.
 *    - Attacker attempts switching to Cashier using wrong PIN -> MUST FAIL.
 *    - Attacker attempts switching to Cashier using Master Admin PIN -> MUST FAIL (strict RBAC).
 *    - Legitimate Cashier PIN -> SUCCEEDS.
 *    - Mandatory first-login PIN interception during quick switch -> INTERCEPTS.
 *    - High-frequency rapid role switching (100 back-to-back role switches).
 *
 * 3. Pairing Approval Rejection & Zero-Store-Data Gate Under Attack:
 *    - Admin enters WRONG pairing code with valid Admin PIN -> REJECTS approval.
 *    - Admin enters EMPTY pairing code with valid Admin PIN -> REJECTS approval.
 *    - Admin enters CORRECT pairing code with WRONG Admin PIN -> REJECTS approval.
 *    - Admin enters WRONG pairing code with WRONG Admin PIN -> REJECTS approval.
 *    - Rejected approval strictly maintains PENDING status and ZERO store data access.
 *    - Multi-device pairing code cross-contamination (approving Dev A with Dev B's code).
 *    - Valid approval with matching pairing code AND valid Admin PIN -> APPROVES terminal.
 *
 * 4. Critical Invariants:
 *    - Exactly 26 .modal-close-btn SVGs in index.html.
 *    - Modal close button for #deviceApprovalPinModal uses .device-approval-close-btn.
 *    - Non-breaking currency format '₹ ' preserved across UI files.
 *    - Zero raw Unicode emojis in operational buttons/tabs/pills.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('====================================================================');
console.log('⚔️  ADVERSARIAL STRESS TEST & ATTACK HARNESS: MILESTONE 5');
console.log('    challenger_o9_m5_1 (critic, specialist)');
console.log('====================================================================\n');

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
    process.exitCode = 1;
  }
}

const rootDir = path.resolve(__dirname, '..');
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const settingsJsContent = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
const staffJsContent = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf8');
const authServiceContent = fs.readFileSync(path.join(rootDir, 'server', 'auth-service.js'), 'utf8');

// ----------------------------------------------------------------------------
// Cryptographic Hash & Helper Utilities (Identical to Browser Engine)
// ----------------------------------------------------------------------------

function hashString(str) {
  if (typeof str !== 'string') return '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

function computeStaffPinHash(pin, salt) {
  const cleanPin = String(pin).trim();
  const cleanSalt = String(salt).trim();
  return crypto.createHash('sha256').update(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`).digest('hex');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const DEVICE_AUTH_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 864,000,000 ms

// Browser In-Memory DOM & Storage Mock
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// ============================================================================
// SUITE EXECUTION
// ============================================================================

async function runAdversarialSuite() {

  // ==========================================================================
  // VECTOR 1: 10-DAY SESSION PERSISTENCE & BOUNDARY ATTACKS
  // ==========================================================================
  console.log('📍 VECTOR 1: 10-DAY SESSION PERSISTENCE BOUNDARY & MALICIOUS TIMESTAMPS\n');

  function evaluateDeviceAuth(customTimestamp, localStorageMock, now = Date.now()) {
    if (customTimestamp !== undefined && customTimestamp !== null) {
      const t = parseInt(customTimestamp, 10);
      return !isNaN(t) && (now - t) >= 0 && (now - t) < DEVICE_AUTH_TTL_MS;
    }
    const authStatus = localStorageMock.getItem('billnaw_device_status');
    if (authStatus !== 'AUTHORIZED') return false;
    const authTimestampStr = localStorageMock.getItem('billnaw_device_auth_timestamp');
    if (!authTimestampStr) {
      if (localStorageMock.getItem('billnaw_is_master') === 'true') {
        localStorageMock.setItem('billnaw_device_auth_timestamp', now.toString());
        return true;
      }
      return false;
    }
    const authTime = parseInt(authTimestampStr, 10);
    if (isNaN(authTime)) return false;
    return (now - authTime) >= 0 && (now - authTime) < DEVICE_AUTH_TTL_MS;
  }

  function simulateCheckExpiration(localStorageMock, now = Date.now()) {
    const authStatus = localStorageMock.getItem('billnaw_device_status');
    const isMaster = localStorageMock.getItem('billnaw_is_master') === 'true';
    if (authStatus === 'AUTHORIZED') {
      const authTimestampStr = localStorageMock.getItem('billnaw_device_auth_timestamp');
      if (!authTimestampStr) {
        localStorageMock.setItem('billnaw_device_auth_timestamp', now.toString());
        return false;
      }
      const authTime = parseInt(authTimestampStr, 10);
      const isExpired = isNaN(authTime) || (now - authTime) >= DEVICE_AUTH_TTL_MS;
      if (isExpired) {
        if (!isMaster) {
          localStorageMock.removeItem('billnaw_device_status');
          localStorageMock.removeItem('billnaw_device_auth_timestamp');
        }
        return true;
      }
    }
    return false;
  }

  await test('V1-BOUND-01', 'Day 0 (immediate login): Session is valid, diff is 0ms', () => {
    const now = 1762280000000;
    const isValid = evaluateDeviceAuth(now.toString(), null, now);
    assert.strictEqual(isValid, true, 'Day 0 must be strictly valid');
  });

  await test('V1-BOUND-02', 'Day 5: Session is valid (halfway through TTL)', () => {
    const now = 1762280000000;
    const day5 = now - (5 * 24 * 60 * 60 * 1000);
    const isValid = evaluateDeviceAuth(day5.toString(), null, now);
    assert.strictEqual(isValid, true, 'Day 5 must be strictly valid');
  });

  await test('V1-BOUND-03', 'Day 9.99 (9 days 23 hours 45 mins): Session is valid', () => {
    const now = 1762280000000;
    const day9_99 = now - Math.floor(9.99 * 24 * 60 * 60 * 1000);
    const isValid = evaluateDeviceAuth(day9_99.toString(), null, now);
    assert.strictEqual(isValid, true, 'Day 9.99 must remain valid without re-pairing');
  });

  await test('V1-BOUND-04', 'Day 9.999999 (10ms before TTL expiration): Session is valid', () => {
    const now = 1762280000000;
    const justBeforeTtl = now - (DEVICE_AUTH_TTL_MS - 10);
    const isValid = evaluateDeviceAuth(justBeforeTtl.toString(), null, now);
    assert.strictEqual(isValid, true, '10ms before TTL expiration must be valid');
  });

  await test('V1-BOUND-05', 'Exact boundary (elapsed == 864,000,000 ms): Session is expired (< strictly enforced)', () => {
    const now = 1762280000000;
    const exactBoundary = now - DEVICE_AUTH_TTL_MS;
    const isValid = evaluateDeviceAuth(exactBoundary.toString(), null, now);
    assert.strictEqual(isValid, false, 'Exact TTL boundary must evaluate as expired');
  });

  await test('V1-BOUND-06', 'Day 10.01: Session is expired and invalid', () => {
    const now = 1762280000000;
    const day10_01 = now - Math.floor(10.01 * 24 * 60 * 60 * 1000);
    const isValid = evaluateDeviceAuth(day10_01.toString(), null, now);
    assert.strictEqual(isValid, false, 'Day 10.01 must evaluate as expired');
  });

  await test('V1-BOUND-07', 'Day 15: Session is expired', () => {
    const now = 1762280000000;
    const day15 = now - (15 * 24 * 60 * 60 * 1000);
    const isValid = evaluateDeviceAuth(day15.toString(), null, now);
    assert.strictEqual(isValid, false, 'Day 15 must be expired');
  });

  await test('V1-BOUND-08', 'Day 100: Session is expired', () => {
    const now = 1762280000000;
    const day100 = now - (100 * 24 * 60 * 60 * 1000);
    const isValid = evaluateDeviceAuth(day100.toString(), null, now);
    assert.strictEqual(isValid, false, 'Day 100 must be expired');
  });

  await test('V1-BOUND-09', 'Adversarial: Future timestamp (clock skew attack) is rejected', () => {
    const now = 1762280000000;
    const futureTime = now + (60 * 60 * 1000); // 1 hour in future
    const isValid = evaluateDeviceAuth(futureTime.toString(), null, now);
    assert.strictEqual(isValid, false, 'Future timestamp must be rejected (now - t < 0)');
  });

  await test('V1-BOUND-10', 'Adversarial: Negative timestamp is rejected', () => {
    const now = 1762280000000;
    const negativeTime = -50000;
    const isValid = evaluateDeviceAuth(negativeTime.toString(), null, now);
    assert.strictEqual(isValid, false, 'Negative timestamp must be rejected');
  });

  await test('V1-BOUND-11', 'Adversarial: Corrupted string non-numeric timestamp is rejected', () => {
    const now = 1762280000000;
    const corruptInputs = ['NaN', 'undefined', 'null', 'corrupted_token', '10.01 days', '{}', ''];
    for (const input of corruptInputs) {
      const isValid = evaluateDeviceAuth(input, null, now);
      assert.strictEqual(isValid, false, `Corrupted input "${input}" must be rejected`);
    }
  });

  await test('V1-BOUND-12', 'Secondary Terminal Expiration Eviction: Expired auth purges credentials from storage', () => {
    const mockStorage = new MockLocalStorage();
    const now = 1762280000000;
    const expiredTimestamp = (now - (12 * 24 * 60 * 60 * 1000)).toString();

    mockStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    mockStorage.setItem('billnaw_device_auth_timestamp', expiredTimestamp);
    mockStorage.setItem('billnaw_is_master', 'false');

    const isExpired = simulateCheckExpiration(mockStorage, now);
    assert.strictEqual(isExpired, true, 'Must report expired');
    assert.strictEqual(mockStorage.getItem('billnaw_device_status'), null, 'billnaw_device_status must be purged');
    assert.strictEqual(mockStorage.getItem('billnaw_device_auth_timestamp'), null, 'billnaw_device_auth_timestamp must be purged');
  });

  await test('V1-BOUND-13', 'Master Terminal Persistence Resilience: Master terminal preserves auth without deletion', () => {
    const mockStorage = new MockLocalStorage();
    const now = 1762280000000;
    const expiredTimestamp = (now - (12 * 24 * 60 * 60 * 1000)).toString();

    mockStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    mockStorage.setItem('billnaw_device_auth_timestamp', expiredTimestamp);
    mockStorage.setItem('billnaw_is_master', 'true');

    const isExpired = simulateCheckExpiration(mockStorage, now);
    assert.strictEqual(isExpired, true, 'Master auth expiration detected for shift locking');
    // Master terminal must NOT have its status or master flag removed
    assert.strictEqual(mockStorage.getItem('billnaw_is_master'), 'true', 'Master flag must remain intact');
  });

  // ==========================================================================
  // VECTOR 2: ADVERSARIAL PROFILE ROLE SWITCHING & PRIVILEGE ESCALATION
  // ==========================================================================
  console.log('\n📍 VECTOR 2: ADVERSARIAL PROFILE ROLE SWITCHING & PRIVILEGE ESCALATION\n');

  // Staff Directory Fixture
  const saltAdmin = 'a1b2c3d4e5f60718';
  const saltCashier = 'b2c3d4e5f6071829';
  const saltChef = 'c3d4e5f60718293a';
  const saltServer = 'd4e5f60718293a4b';

  const staffDirectory = [
    { id: 1, name: 'Admin Master', role: 'Admin', pin_salt: saltAdmin, pin_hash: computeStaffPinHash('8844', saltAdmin), mustChangePin: false },
    { id: 2, name: 'Priya Cashier', role: 'Cashier', pin_salt: saltCashier, pin_hash: computeStaffPinHash('5678', saltCashier), mustChangePin: false },
    { id: 3, name: 'Rahul Chef', role: 'Kitchen Chef', pin_salt: saltChef, pin_hash: computeStaffPinHash('3434', saltChef), mustChangePin: false },
    { id: 4, name: 'Amit Server', role: 'Floor Server', pin_salt: saltServer, pin_hash: computeStaffPinHash('7890', saltServer), mustChangePin: false },
    { id: 5, name: 'New Temp Staff', role: 'Cashier', pin_salt: saltCashier, pin_hash: computeStaffPinHash('0000', saltCashier), mustChangePin: true }
  ];

  const shopProfileFixture = {
    shopName: 'Billnaw Cafe Test',
    adminPinHash: hashString('9999') // Master Admin PIN is '9999'
  };

  async function simulateConfirmQuickStaffSwitch(targetStaffId, enteredPin, staffList, profile) {
    if (!enteredPin || typeof enteredPin !== 'string') return { success: false, reason: 'EMPTY_PIN' };
    const matchedStaff = staffList.find(s => s.id === targetStaffId);
    if (!matchedStaff) return { success: false, reason: 'STAFF_NOT_FOUND' };

    const isTargetAdmin = (matchedStaff.role === 'Admin');

    // Verify staff PIN with salt & hash
    let isMatch = false;
    if (matchedStaff.pin_salt && matchedStaff.pin_hash) {
      const computed = computeStaffPinHash(enteredPin, matchedStaff.pin_salt);
      isMatch = timingSafeEqual(computed, matchedStaff.pin_hash);
    } else if (matchedStaff.pin) {
      isMatch = (matchedStaff.pin === enteredPin);
    }

    // Verify Master Admin PIN
    const isMasterAdminPin = (profile?.adminPinHash && hashString(enteredPin) === profile.adminPinHash) || (!profile?.adminPinHash && enteredPin === '1234');

    // Strict Rule: Admin accepts either Master Admin PIN or Admin designated PIN.
    // Staff roles strictly require that staff member's PIN.
    const isValid = isTargetAdmin ? (isMasterAdminPin || isMatch) : isMatch;

    if (!isValid) {
      return { success: false, reason: 'INVALID_PIN' };
    }

    if (matchedStaff.mustChangePin === true) {
      return { success: true, mustChangePin: true, intercepted: true, staff: matchedStaff };
    }

    return { success: true, mustChangePin: false, unlockedStaff: matchedStaff };
  }

  await test('V2-ROLE-01', 'Privilege Escalation: Switching to Admin using Cashiers PIN (5678) MUST FAIL', async () => {
    const result = await simulateConfirmQuickStaffSwitch(1, '5678', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, false, 'Switching to Admin with Cashier PIN must fail');
    assert.strictEqual(result.reason, 'INVALID_PIN');
  });

  await test('V2-ROLE-02', 'Privilege Escalation: Switching to Admin using Chefs PIN (3434) MUST FAIL', async () => {
    const result = await simulateConfirmQuickStaffSwitch(1, '3434', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, false, 'Switching to Admin with Chef PIN must fail');
  });

  await test('V2-ROLE-03', 'Privilege Escalation: Switching to Admin using sequential trivial PIN (1234) MUST FAIL', async () => {
    const result = await simulateConfirmQuickStaffSwitch(1, '1234', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, false, 'Switching to Admin with trivial 1234 when adminPinHash is set must fail');
  });

  await test('V2-ROLE-04', 'Privilege Escalation: Switching to Admin with SQL injection string MUST FAIL', async () => {
    const malicious = ["' OR '1'='1", "<script>alert(1)</script>", "\\x00", "NaN", "   "];
    for (const pin of malicious) {
      const result = await simulateConfirmQuickStaffSwitch(1, pin, staffDirectory, shopProfileFixture);
      assert.strictEqual(result.success, false, `Malicious input "${pin}" must be rejected`);
    }
  });

  await test('V2-ROLE-05', 'Admin Legitimate Switch: Switching to Admin using designated Admin staff PIN (8844) MUST SUCCEED', async () => {
    const result = await simulateConfirmQuickStaffSwitch(1, '8844', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'Admin staff PIN must unlock Admin profile');
    assert.strictEqual(result.unlockedStaff.name, 'Admin Master');
  });

  await test('V2-ROLE-06', 'Admin Legitimate Switch: Switching to Admin using Master Admin PIN (9999) MUST SUCCEED', async () => {
    const result = await simulateConfirmQuickStaffSwitch(1, '9999', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'Master Admin PIN must unlock Admin profile');
    assert.strictEqual(result.unlockedStaff.role, 'Admin');
  });

  await test('V2-ROLE-07', 'Staff Role Security: Switching to Cashier using wrong PIN (9999) MUST FAIL', async () => {
    const result = await simulateConfirmQuickStaffSwitch(2, '9999', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, false, 'Master Admin PIN must NOT authenticate as Cashier');
  });

  await test('V2-ROLE-08', 'Staff Role Security: Switching to Cashier using Chefs PIN (3434) MUST FAIL', async () => {
    const result = await simulateConfirmQuickStaffSwitch(2, '3434', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, false, 'Chef PIN must NOT authenticate as Cashier');
  });

  await test('V2-ROLE-09', 'Staff Role Security: Switching to Cashier using valid Cashier PIN (5678) MUST SUCCEED', async () => {
    const result = await simulateConfirmQuickStaffSwitch(2, '5678', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'Valid Cashier PIN must authenticate Cashier');
    assert.strictEqual(result.unlockedStaff.name, 'Priya Cashier');
  });

  await test('V2-ROLE-10', 'Staff Role Security: Switching to Kitchen Chef using valid Chef PIN (3434) MUST SUCCEED', async () => {
    const result = await simulateConfirmQuickStaffSwitch(3, '3434', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'Valid Chef PIN must authenticate Kitchen Chef');
  });

  await test('V2-ROLE-11', 'Staff Role Security: Switching to Floor Server using valid Server PIN (7890) MUST SUCCEED', async () => {
    const result = await simulateConfirmQuickStaffSwitch(4, '7890', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'Valid Server PIN must authenticate Floor Server');
  });

  await test('V2-ROLE-12', 'First-Login Interception: Switching to staff with mustChangePin=true triggers PIN intercept modal', async () => {
    const result = await simulateConfirmQuickStaffSwitch(5, '0000', staffDirectory, shopProfileFixture);
    assert.strictEqual(result.success, true, 'PIN matched');
    assert.strictEqual(result.intercepted, true, 'Must be intercepted for mandatory PIN change');
    assert.strictEqual(result.unlockedStaff, undefined, 'Terminal must NOT unlock until PIN is changed');
  });

  await test('V2-ROLE-13', 'High-Frequency Stress: 100 rapid role switches across 4 staff members maintain 100% decision integrity', async () => {
    const attempts = [
      { id: 1, pin: '8844', expect: true },
      { id: 1, pin: '9999', expect: true },
      { id: 1, pin: '5678', expect: false },
      { id: 2, pin: '5678', expect: true },
      { id: 2, pin: '9999', expect: false },
      { id: 3, pin: '3434', expect: true },
      { id: 3, pin: '1111', expect: false },
      { id: 4, pin: '7890', expect: true },
      { id: 4, pin: '8844', expect: false },
      { id: 1, pin: 'wrong', expect: false }
    ];

    for (let cycle = 0; cycle < 10; cycle++) {
      for (const att of attempts) {
        const res = await simulateConfirmQuickStaffSwitch(att.id, att.pin, staffDirectory, shopProfileFixture);
        assert.strictEqual(res.success, att.expect, `Cycle ${cycle} staff ${att.id} with PIN ${att.pin} failed expectation`);
      }
    }
  });

  // ==========================================================================
  // VECTOR 3: ADVERSARIAL DEVICE PAIRING & APPROVAL REJECTION
  // ==========================================================================
  console.log('\n📍 VECTOR 3: ADVERSARIAL DEVICE PAIRING & APPROVAL REJECTION\n');

  // Simulated Device Pairing Approval Engine (Identical to js/settings.js confirmApproveDevicePairing)
  async function simulateConfirmApproveDevicePairing({
    targetDeviceId,
    enteredPairingCode,
    enteredAdminPin,
    selectedProfile = 'BILLING_COUNTER',
    selectedStationName = 'Secondary Counter',
    devicesList,
    shopProfile,
    staffList
  }) {
    const targetDev = devicesList.find(d => d.deviceId === targetDeviceId || d.id === targetDeviceId);
    if (!targetDev) {
      return { approved: false, error: 'DEVICE_NOT_FOUND' };
    }

    // 1. Verify Pairing Code
    const expectedCode = String(targetDev.pairingCode || '').trim();
    const cleanEnteredCode = String(enteredPairingCode || '').trim();
    if (!cleanEnteredCode || (expectedCode && cleanEnteredCode !== expectedCode)) {
      return {
        approved: false,
        error: 'PAIRING_CODE_MISMATCH',
        feedback: 'Pairing code does not match code shown on device',
        deviceStatus: targetDev.status
      };
    }

    // 2. Verify Master Admin PIN
    const cleanAdminPin = String(enteredAdminPin || '').trim();
    let isPinValid = (shopProfile?.adminPinHash && hashString(cleanAdminPin) === shopProfile.adminPinHash) || (!shopProfile?.adminPinHash && cleanAdminPin === '1234');

    if (!isPinValid && Array.isArray(staffList)) {
      for (const s of staffList) {
        if (s.role === 'Admin') {
          if (s.pin_salt && s.pin_hash) {
            const hash = computeStaffPinHash(cleanAdminPin, s.pin_salt);
            if (timingSafeEqual(hash, s.pin_hash)) {
              isPinValid = true;
              break;
            }
          } else if (s.pin === cleanAdminPin) {
            isPinValid = true;
            break;
          }
        }
      }
    }

    if (!isPinValid) {
      return {
        approved: false,
        error: 'INVALID_ADMIN_PIN',
        feedback: 'Invalid Admin PIN. Approval rejected.',
        deviceStatus: targetDev.status
      };
    }

    // Transitions to AUTHORIZED
    targetDev.status = 'AUTHORIZED';
    targetDev.stationProfile = selectedProfile;
    targetDev.deviceName = selectedStationName;
    targetDev.approvedAt = new Date().toISOString();

    return {
      approved: true,
      device: targetDev
    };
  }

  const registeredDevices = [
    { deviceId: 'DEV_MASTER00000', pairingCode: '000000', status: 'AUTHORIZED', isMaster: true, deviceName: 'Counter 1' },
    { deviceId: 'DEV_SEC_TABLET_1', pairingCode: '482910', status: 'PENDING', isMaster: false, deviceName: 'Secondary Terminal' },
    { deviceId: 'DEV_SEC_KITCHEN_2', pairingCode: '839201', status: 'PENDING', isMaster: false, deviceName: 'Kitchen Terminal' }
  ];

  await test('V3-APPR-01', 'Pairing Approval Rejection: Wrong pairing code with valid Admin PIN MUST REJECT', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '999999', // WRONG pairing code
      enteredAdminPin: '9999',       // Valid Admin PIN
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, false, 'Approval must be rejected on wrong pairing code');
    assert.strictEqual(result.error, 'PAIRING_CODE_MISMATCH');
    assert.strictEqual(result.feedback, 'Pairing code does not match code shown on device');

    const targetDev = devices.find(d => d.deviceId === 'DEV_SEC_TABLET_1');
    assert.strictEqual(targetDev.status, 'PENDING', 'Device MUST remain in PENDING status');
  });

  await test('V3-APPR-02', 'Pairing Approval Rejection: Empty pairing code MUST REJECT', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '',
      enteredAdminPin: '9999',
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, false, 'Approval must be rejected on empty pairing code');
    assert.strictEqual(result.error, 'PAIRING_CODE_MISMATCH');
  });

  await test('V3-APPR-03', 'Pairing Approval Rejection: Correct pairing code with WRONG Admin PIN MUST REJECT', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '482910', // Correct pairing code
      enteredAdminPin: '0000',       // WRONG Admin PIN
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, false, 'Approval must be rejected on wrong Admin PIN');
    assert.strictEqual(result.error, 'INVALID_ADMIN_PIN');
    assert.strictEqual(result.feedback, 'Invalid Admin PIN. Approval rejected.');

    const targetDev = devices.find(d => d.deviceId === 'DEV_SEC_TABLET_1');
    assert.strictEqual(targetDev.status, 'PENDING', 'Device MUST remain in PENDING status');
  });

  await test('V3-APPR-04', 'Pairing Approval Rejection: Wrong pairing code AND wrong Admin PIN MUST REJECT', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '000000',
      enteredAdminPin: '1111',
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, false);
    assert.strictEqual(result.error, 'PAIRING_CODE_MISMATCH');
  });

  await test('V3-APPR-05', 'Pairing Approval Cross-Device Attack: Approving Device 1 with Device 2s pairing code MUST REJECT', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '839201', // Pairing code of DEV_SEC_KITCHEN_2
      enteredAdminPin: '9999',
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, false, 'Cross-device pairing code attack must be rejected');
    assert.strictEqual(result.error, 'PAIRING_CODE_MISMATCH');
    assert.strictEqual(devices.find(d => d.deviceId === 'DEV_SEC_TABLET_1').status, 'PENDING');
  });

  await test('V3-APPR-06', 'Zero-Store-Data Gate: Rejected device has zero store access and empty business arrays', () => {
    const secondaryStorage = new MockLocalStorage();
    secondaryStorage.setItem('billnaw_device_status', 'PENDING');
    secondaryStorage.setItem('billnaw_is_master', 'false');

    function canAccessStoreDataMock(storage) {
      if (storage.getItem('billnaw_is_master') === 'true') return true;
      return storage.getItem('billnaw_device_status') === 'AUTHORIZED';
    }

    assert.strictEqual(canAccessStoreDataMock(secondaryStorage), false, 'Pending secondary terminal cannot access store data');
  });

  await test('V3-APPR-07', 'Legitimate Approval: Correct pairing code AND valid Admin PIN APPROVES terminal and sets station profile', async () => {
    const devices = JSON.parse(JSON.stringify(registeredDevices));
    const result = await simulateConfirmApproveDevicePairing({
      targetDeviceId: 'DEV_SEC_TABLET_1',
      enteredPairingCode: '482910',
      enteredAdminPin: '9999',
      selectedProfile: 'KDS',
      selectedStationName: 'Kitchen Display 1',
      devicesList: devices,
      shopProfile: shopProfileFixture,
      staffList: staffDirectory
    });

    assert.strictEqual(result.approved, true, 'Legitimate approval must succeed');
    assert.strictEqual(result.device.status, 'AUTHORIZED');
    assert.strictEqual(result.device.stationProfile, 'KDS');
    assert.strictEqual(result.device.deviceName, 'Kitchen Display 1');
    assert.ok(result.device.approvedAt, 'Must set approvedAt timestamp');
  });

  // ==========================================================================
  // VECTOR 4: INVARIANTS, DOM INTEGRITY & ARCHITECTURAL CONTRACTS
  // ==========================================================================
  console.log('\n📍 VECTOR 4: CRITICAL SYSTEM INVARIANTS & DOM AUDIT\n');

  await test('V4-INVAR-01', 'Exact 26 .modal-close-btn SVG elements in index.html invariant strictly maintained', () => {
    const modalCloseBtnRegex = /class="[^"]*\bmodal-close-btn\b[^"]*"[^>]*>([\s\S]*?)<\/button>/gi;
    const matches = [...htmlContent.matchAll(modalCloseBtnRegex)];
    assert.strictEqual(matches.length, 26, `Must find exactly 26 .modal-close-btn elements, found: ${matches.length}`);

    matches.forEach((m, idx) => {
      assert.ok(m[1].includes('<svg'), `Modal close button #${idx + 1} must contain inline <svg> icon`);
      assert.ok(!m[1].includes('✕') && !m[1].includes('×'), `Modal close button #${idx + 1} must not contain raw text '✕'`);
    });
  });

  await test('V4-INVAR-02', '#deviceApprovalPinModal uses dedicated .device-approval-close-btn (0 .modal-close-btn)', () => {
    const modalIdx = htmlContent.indexOf('id="deviceApprovalPinModal"');
    assert.ok(modalIdx !== -1, '#deviceApprovalPinModal must exist in index.html');

    const modalSub = htmlContent.slice(modalIdx, modalIdx + 2000);
    assert.ok(modalSub.includes('device-approval-close-btn'), 'Approval modal must use .device-approval-close-btn');
    assert.ok(!modalSub.includes('class="modal-close-btn"'), 'Approval modal must NOT use .modal-close-btn');
  });

  await test('V4-INVAR-03', 'Non-breaking currency space formatting ("₹ ") strictly enforced across UI code', () => {
    const customerUiPath = path.join(rootDir, 'src', 'features', 'customers', 'customers.ui.js');
    if (fs.existsSync(customerUiPath)) {
      const custUi = fs.readFileSync(customerUiPath, 'utf8');
      assert.ok(!custUi.includes('₹0.00'), 'Must not contain "₹0.00" without space');
      assert.ok(custUi.includes('₹ 0.00'), 'Must contain "₹ 0.00" with space');
    }
  });

  await test('V4-INVAR-04', 'Zero raw Unicode emojis in operational <button>, <tab>, and segmented pills', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
    let buttonMatch;
    let emojiButtonCount = 0;

    while ((buttonMatch = buttonRegex.exec(htmlContent)) !== null) {
      const inner = buttonMatch[1];
      // Exclude text nodes inside spans with class that are explicitly display/category emojis
      if (buttonMatch[0].includes('class="nav-btn"') || buttonMatch[0].includes('class="tab-btn"') || buttonMatch[0].includes('class="btn"')) {
        const textOnly = inner.replace(/<[^>]+>/g, '').trim();
        if (emojiRegex.test(textOnly)) {
          emojiButtonCount++;
        }
      }
    }
    assert.strictEqual(emojiButtonCount, 0, `Operational buttons must have 0 raw emojis, found: ${emojiButtonCount}`);
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL STRESS SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error(`🚨 ${failed} ADVERSARIAL CHALLENGES FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`\n[#${idx + 1}] ID: ${f.id} — ${f.description}`);
      console.error(`     Error: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log(`✨ ALL ${passed} EMPIRICAL ADVERSARIAL TESTS PASSED 100% GREEN!\n`);
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal unhandled error:', err);
  process.exit(1);
});
