/**
 * scratch/test_phase3_core_backbone.cjs
 * Comprehensive Verification Suite for Phase 3: Core Backbone, Security Rules & Server Functions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('====================================================================');
console.log('🚀 RUNNING PHASE 3: CORE BACKBONE & SECURITY VERIFICATION SUITE');
console.log('====================================================================\n');

let passCount = 0;
let failCount = 0;

function pass(name) {
  passCount++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name, err) {
  failCount++;
  console.error(`  ❌ FAIL: ${name}`, err);
}

async function runTests() {
  // ---------------------------------------------------------------
  // 1. Error Handler Verification
  // ---------------------------------------------------------------
  console.log('📍 SECTION 1: ERROR HANDLER ENVELOPE (error-handler.js)');
  try {
    const { successResult, errorResult, parseError, safeExecute } = await import('../src/core/error-handler.js');

    const s = successResult({ billId: 101 }, true);
    assert.deepStrictEqual(s.data, { billId: 101 });
    assert.strictEqual(s.error, null);
    assert.strictEqual(s.offlineQueued, true);
    pass('successResult returns standard { data, error, offlineQueued: true }');

    const e = errorResult('AUTH_INVALID_PIN', 'Wrong PIN');
    assert.strictEqual(e.data, null);
    assert.strictEqual(e.error.code, 'AUTH_INVALID_PIN');
    assert.strictEqual(e.error.message, 'Wrong PIN');
    assert.strictEqual(e.offlineQueued, false);
    pass('errorResult returns standard envelope with error code and message');

    const parsedOffline = parseError(new Error('client is offline'));
    assert.strictEqual(parsedOffline.code, 'OFFLINE_CACHE_ACTIVE');
    pass('parseError maps offline network error to OFFLINE_CACHE_ACTIVE');

    const safeRes = await safeExecute(async () => 'OK', 'test');
    assert.strictEqual(safeRes.data, 'OK');
    assert.strictEqual(safeRes.error, null);
    pass('safeExecute wraps successful promises cleanly');

    const safeErr = await safeExecute(async () => { throw new Error('Boom'); }, 'test');
    assert.strictEqual(safeErr.data, null);
    assert.strictEqual(safeErr.error.message, 'Boom');
    pass('safeExecute catches thrown exceptions without crashing');
  } catch (err) {
    fail('SECTION 1: Error Handler', err);
  }

  // ---------------------------------------------------------------
  // 2. Multi-Tenant Config Verification
  // ---------------------------------------------------------------
  console.log('\n📍 SECTION 2: CONFIG & TENANT CONTEXT (config.js)');
  try {
    const { getActiveCafeId, setActiveCafeId, getActiveTerminalId, setActiveTerminalId, APP_CONSTANTS } = await import('../src/core/config.js');

    setActiveCafeId('cafe_test_ballygunge_01');
    assert.strictEqual(getActiveCafeId(), 'cafe_test_ballygunge_01');
    pass('setActiveCafeId sets and retrieves scoped tenant cafe_id');

    setActiveTerminalId('t2');
    assert.strictEqual(getActiveTerminalId(), 'T2');
    pass('setActiveTerminalId uppercases terminal identifier (T2)');

    assert.strictEqual(APP_CONSTANTS.DEFAULT_GST_RATE, 5);
    assert.strictEqual(APP_CONSTANTS.MAX_TABLES, 60);
    assert.strictEqual(APP_CONSTANTS.UNPAID_ALERT_MINUTES, 15);
    pass('APP_CONSTANTS contains required operational parameters');
  } catch (err) {
    fail('SECTION 2: Config', err);
  }

  // ---------------------------------------------------------------
  // 3. Cryptographic RBAC & Salted SHA-256 PIN Verification
  // ---------------------------------------------------------------
  console.log('\n📍 SECTION 3: RBAC & SALTED SHA-256 PIN HASHING (rbac.js)');
  try {
    const { hashPin, generatePinSalt, verifyPin, authenticateStaffPin, hasPermission, ROLES, PERMISSIONS } = await import('../src/core/rbac.js');

    const salt = generatePinSalt();
    assert.strictEqual(salt.length, 32);
    pass('generatePinSalt produces 32-character hex salt');

    const hash1 = await hashPin('4321', salt);
    const hash2 = await hashPin('4321', salt);
    const hashDiff = await hashPin('9999', salt);
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
    assert.notStrictEqual(hash1, hashDiff);
    pass('hashPin produces deterministic 64-char SHA-256 hash');

    const isMatch = await verifyPin('4321', salt, hash1);
    const isMismatch = await verifyPin('0000', salt, hash1);
    assert.strictEqual(isMatch, true);
    assert.strictEqual(isMismatch, false);
    pass('verifyPin validates correct PIN and rejects incorrect PIN');

    const staffList = [
      {
        id: 'stf_01',
        name: 'Jane Cashier',
        role: ROLES.CASHIER,
        pin_salt: salt,
        pin_hash: hash1,
        status: 'ACTIVE'
      }
    ];

    const authRes = await authenticateStaffPin('4321', staffList);
    assert.strictEqual(authRes.error, null);
    assert.strictEqual(authRes.data.name, 'Jane Cashier');
    assert.strictEqual(authRes.data.role, ROLES.CASHIER);
    pass('authenticateStaffPin authenticates active staff by salted SHA-256 PIN');

    const wrongPinRes = await authenticateStaffPin('1111', staffList);
    assert.strictEqual(wrongPinRes.data, null);
    assert.strictEqual(wrongPinRes.error.code, 'AUTH_INVALID_PIN');
    pass('authenticateStaffPin rejects incorrect PIN with AUTH_INVALID_PIN');

    assert.strictEqual(hasPermission({ role: ROLES.ADMIN }, PERMISSIONS.VOID_INVOICE), true);
    assert.strictEqual(hasPermission({ role: ROLES.CASHIER }, PERMISSIONS.VOID_INVOICE), false);
    assert.strictEqual(hasPermission({ role: ROLES.MANAGER }, PERMISSIONS.APPLY_DISCOUNT), true);
    pass('hasPermission validates role permissions matrix accurately');
  } catch (err) {
    fail('SECTION 3: RBAC', err);
  }

  // ---------------------------------------------------------------
  // 4. Platform Bridge & Hardware Bridge
  // ---------------------------------------------------------------
  console.log('\n📍 SECTION 4: PLATFORM DETECTION & THERMAL PRINTER BRIDGE (platform-bridge.js)');
  try {
    const { detectPlatform, PLATFORMS, ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');

    const platform = detectPlatform();
    assert.strictEqual(platform, PLATFORMS.PWA_BROWSER);
    pass('detectPlatform resolves PWA_BROWSER in standard web environment');

    const mockInvoice = {
      bill_no: 'BN-T1-261027-0001',
      final_total_paise: 25000,
      created_at: new Date().toISOString(),
      items: [
        { name: 'Cold Coffee', qty: 2, item_subtotal_paise: 20000 },
        { name: 'Veg Sandwich', qty: 1, item_subtotal_paise: 5000 }
      ]
    };

    const escPosBytes = ThermalPrinterBridge.generateEscPosCommands(mockInvoice);
    assert.ok(escPosBytes instanceof Uint8Array);
    assert.ok(escPosBytes.length > 50);
    // Check ESC @ initialization bytes (0x1B, 0x40)
    assert.strictEqual(escPosBytes[0], 0x1B);
    assert.strictEqual(escPosBytes[1], 0x40);
    pass('generateEscPosCommands generates valid ESC/POS byte sequence for thermal printer');
  } catch (err) {
    fail('SECTION 4: Platform Bridge', err);
  }

  // ---------------------------------------------------------------
  // 5. Database Firestore Rules Multi-Tenant Security Check
  // ---------------------------------------------------------------
  console.log('\n📍 SECTION 5: FIRESTORE SECURITY RULES ANTI-TAMPERING AUDIT');
  try {
    const rulesContent = fs.readFileSync(path.resolve(__dirname, '../database/firestore.rules'), 'utf8');

    assert.ok(rulesContent.includes('/cafes/{cafeId}'), 'Rules contain /cafes/{cafeId} root hierarchy');
    pass('Rules scope documents under /cafes/{cafeId}');

    assert.ok(rulesContent.includes('match /invoices/{invoiceId}'), 'Rules define /invoices/{invoiceId} subcollection');
    assert.ok(rulesContent.includes('allow delete: if false;'), 'Invoice deletion is strictly forbidden (allow delete: if false;)');
    pass('Anti-Tampering Invariant: Settled invoices have allow delete: if false;');

    assert.ok(rulesContent.includes('request.resource.data.status == \'VOID\''), 'Invoice update requires VOID status');
    assert.ok(rulesContent.includes('request.resource.data.void_audit.void_reason is string'), 'Invoice VOID requires mandatory void_reason');
    pass('Anti-Tampering Invariant: Invoice VOID requires mandatory audit trail fields');

    assert.ok(rulesContent.includes('match /tables/{tableId}'), 'Rules support row-level /tables/{tableId} concurrency');
    pass('Individual tables /tables/{tableId} scoped cleanly');
  } catch (err) {
    fail('SECTION 5: Security Rules', err);
  }

  // ---------------------------------------------------------------
  // 6. Serverless Cloud Functions OTP & Sheets Relay
  // ---------------------------------------------------------------
  console.log('\n📍 SECTION 6: SERVERLESS FUNCTIONS (database/server-functions/index.js)');
  try {
    const { handleVerifyOtp } = await import('../database/server-functions/index.js');

    const resMissing = handleVerifyOtp({ email: 'unknown@cafe.com', otp: '123456' });
    assert.strictEqual(resMissing.success, false);
    assert.ok(resMissing.error.includes('No active code'));
    pass('handleVerifyOtp rejects unrequested or non-existent OTP codes');
  } catch (err) {
    fail('SECTION 6: Serverless Functions', err);
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 PHASE 3 AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('====================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
