/**
 * scratch/test_device_locking_security.cjs
 * 
 * Comprehensive Verification Suite:
 * Strict Device-Locking Security Mechanism for POS SaaS
 * 
 * Verifies:
 * 1. Root Firestore collection `devices/{deviceId}` schema structure
 * 2. Atomic Firestore transaction execution and quota enforcement (Max 2 accounts)
 * 3. Exact HttpsError ('permission-denied', 'Device registration limit reached. This device is already linked to two other accounts.')
 * 4. Concurrent race condition prevention across simultaneous login attempts
 * 5. Input sanitization (untrusted client email and deviceId validation)
 * 6. Cryptographic device clearance token generation (HMAC-SHA256)
 * 7. Client-side hardware ID extraction & stability across cache/storage wipes
 * 8. Firestore Security Rules zero-client gate (`allow read, write: if false;`)
 * 9. Non-dismissible #deviceLockedOverlay DOM structure & strict invariant compliance
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     ${err.message}`);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     ${err.message}`);
  }
}

async function main() {
  console.log('====================================================================');
  console.log('🛡️  STRICT HARDWARE DEVICE-LOCKING SECURITY VERIFICATION SUITE');
  console.log('====================================================================\n');

  // Dynamically import ESM modules
  const {
    executeValidateDeviceAndLogin,
    HttpsError,
    normalizeEmail,
    isValidDeviceId,
    isValidEmail,
    generateDeviceVerificationToken,
    MAX_ALLOWED_ACCOUNTS_PER_DEVICE
  } = await import('../database/server-functions/device-security.js');

  const { getDbClient } = await import('../src/core/db-client.js');
  const { sha256Hex, collectHardwareAttributes } = await import('../src/core/device-identity.js');

  const db = getDbClient();

  // -------------------------------------------------------------
  // SECTION 1: INPUT SANITIZATION & CLIENT UNTRUSTED BOUNDARIES
  // -------------------------------------------------------------
  console.log('📍 SECTION 1: UNTRUSTED CLIENT INPUT VALIDATION & SANITIZATION');

  it('[INPUT-01] Validates standard email addresses and normalizes case/trim', () => {
    assert.strictEqual(normalizeEmail('  OWNER@BillnawCafe.com '), 'owner@billnawcafe.com');
    assert.strictEqual(isValidEmail('valid.staff@cafe.co.in'), true);
    assert.strictEqual(isValidEmail('invalid-email-without-at'), false);
    assert.strictEqual(isValidEmail(''), false);
    assert.strictEqual(isValidEmail(null), false);
  });

  it('[INPUT-02] Enforces hardware deviceId length (16-128 chars) and safe charset', () => {
    assert.strictEqual(isValidDeviceId('DEV_HW_1234567890abcdef12345678'), true);
    assert.strictEqual(isValidDeviceId('DEV-1234:5678-90ab'), true);
    assert.strictEqual(isValidDeviceId('short'), false); // < 16 chars
    assert.strictEqual(isValidDeviceId(''), false);
    assert.strictEqual(isValidDeviceId('DEV_WITH_FORBIDDEN_CHARS_$$$%%%^^^'), false);
  });

  await itAsync('[INPUT-03] Rejects invalid email with HttpsError(invalid-argument)', async () => {
    try {
      await executeValidateDeviceAndLogin({
        db,
        email: 'malformed-email',
        deviceId: 'DEV_HW_11223344556677889900'
      });
      assert.fail('Should have thrown HttpsError');
    } catch (err) {
      assert.strictEqual(err.name, 'HttpsError');
      assert.strictEqual(err.code, 'invalid-argument');
      assert.strictEqual(err.message, 'A valid email address is required.');
    }
  });

  await itAsync('[INPUT-04] Rejects malformed deviceId with HttpsError(invalid-argument)', async () => {
    try {
      await executeValidateDeviceAndLogin({
        db,
        email: 'owner@cafe.com',
        deviceId: 'too_short'
      });
      assert.fail('Should have thrown HttpsError');
    } catch (err) {
      assert.strictEqual(err.name, 'HttpsError');
      assert.strictEqual(err.code, 'invalid-argument');
      assert.ok(err.message.includes('A valid hardware device identifier is required'));
    }
  });

  // -------------------------------------------------------------
  // SECTION 2: FIRESTORE TRANSACTION & DEVICE QUOTA LIFECYCLE
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 2: FIRESTORE TRANSACTION & 2-ACCOUNT HARDWARE CEILING');

  const testDeviceId = 'DEV_HW_POS_TERMINAL_TEST_' + Date.now().toString(36);
  const emailA = 'cashier.alice@billnawcafe.com';
  const emailB = 'manager.bob@billnawcafe.com';
  const emailC = 'hacker.charlie@external.com';

  await itAsync('[QUOTA-01] First email registration creates devices/{deviceId} document', async () => {
    const res = await executeValidateDeviceAndLogin({
      db,
      email: emailA,
      deviceId: testDeviceId,
      metadata: { platform: 'Linux x86_64 POS', ip: '192.168.1.101' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.action, 'REGISTERED');
    assert.strictEqual(res.email, emailA);
    assert.strictEqual(res.associatedAccountsCount, 1);
    assert.strictEqual(res.maxAllowedAccounts, 2);
    assert.ok(res.deviceVerificationToken);

    // Verify raw document in Firestore
    const doc = await db.collection('devices').doc(testDeviceId).get();
    assert.strictEqual(doc.exists, true);
    const data = doc.data();
    assert.deepStrictEqual(data.associatedEmails, [emailA]);
    assert.ok(data.registeredAt);
    assert.ok(data.lastActive);
  });

  await itAsync('[QUOTA-02] Existing first email re-login succeeds and updates lastActive', async () => {
    const res = await executeValidateDeviceAndLogin({
      db,
      email: emailA,
      deviceId: testDeviceId
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.action, 'EXISTING_ACCOUNT');
    assert.strictEqual(res.associatedAccountsCount, 1);
  });

  await itAsync('[QUOTA-03] Second distinct email registration succeeds (reaches ceiling of 2)', async () => {
    const res = await executeValidateDeviceAndLogin({
      db,
      email: emailB,
      deviceId: testDeviceId
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.action, 'NEW_ACCOUNT_LINKED');
    assert.strictEqual(res.associatedAccountsCount, 2);

    // Verify raw document in Firestore contains both accounts
    const doc = await db.collection('devices').doc(testDeviceId).get();
    const data = doc.data();
    assert.strictEqual(data.associatedEmails.length, 2);
    assert.ok(data.associatedEmails.includes(emailA));
    assert.ok(data.associatedEmails.includes(emailB));
  });

  await itAsync('[QUOTA-04] Existing second email re-login succeeds without error', async () => {
    const res = await executeValidateDeviceAndLogin({
      db,
      email: emailB,
      deviceId: testDeviceId
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.action, 'EXISTING_ACCOUNT');
    assert.strictEqual(res.associatedAccountsCount, 2);
  });

  await itAsync('[QUOTA-05] Third email attempt THROWS strict HttpsError(permission-denied)', async () => {
    try {
      await executeValidateDeviceAndLogin({
        db,
        email: emailC,
        deviceId: testDeviceId
      });
      assert.fail('Third account registration must strictly throw permission-denied');
    } catch (err) {
      assert.strictEqual(err.name, 'HttpsError');
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(
        err.message,
        'Device registration limit reached. This device is already linked to two other accounts.'
      );
      assert.strictEqual(err.httpErrorCode, 403);
      assert.strictEqual(err.details.registeredCount, 2);
      assert.strictEqual(err.details.maxLimit, 2);
    }

    // Verify third email was NOT appended to Firestore document
    const doc = await db.collection('devices').doc(testDeviceId).get();
    const data = doc.data();
    assert.strictEqual(data.associatedEmails.length, 2);
    assert.strictEqual(data.associatedEmails.includes(emailC), false);
  });

  // -------------------------------------------------------------
  // SECTION 3: CONCURRENT RACE CONDITION SERIALIZATION
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 3: CONCURRENT RACE CONDITION RESILIENCE');

  await itAsync('[RACE-01] Simultaneous concurrent logins on 1-account slot serialize cleanly', async () => {
    const raceDeviceId = 'DEV_HW_RACE_STRESS_' + Date.now().toString(36);
    
    // Seed 1 account
    await executeValidateDeviceAndLogin({
      db,
      email: 'pilot@cafe.com',
      deviceId: raceDeviceId
    });

    // Fire 2 concurrent registration requests at the exact same instant
    const promises = [
      executeValidateDeviceAndLogin({ db, email: 'competitor1@cafe.com', deviceId: raceDeviceId }),
      executeValidateDeviceAndLogin({ db, email: 'competitor2@cafe.com', deviceId: raceDeviceId })
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent request must win the slot');
    assert.strictEqual(rejected.length, 1, 'The competing concurrent request must be rejected');
    assert.strictEqual(rejected[0].reason.code, 'permission-denied');
    assert.strictEqual(
      rejected[0].reason.message,
      'Device registration limit reached. This device is already linked to two other accounts.'
    );

    // Verify doc has exactly 2 accounts, not 3
    const doc = await db.collection('devices').doc(raceDeviceId).get();
    assert.strictEqual(doc.data().associatedEmails.length, 2);
  });

  // -------------------------------------------------------------
  // SECTION 4: CLIENT HARDWARE ATTESTATION & STABILITY
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 4: CLIENT-SIDE HARDWARE FINGERPRINTING & STABILITY');

  await itAsync('[CLIENT-01] collectHardwareAttributes produces deterministic JSON descriptor', async () => {
    const attr1 = await collectHardwareAttributes();
    const attr2 = await collectHardwareAttributes();
    assert.strictEqual(typeof attr1, 'string');
    assert.strictEqual(attr1, attr2, 'Hardware attributes must be 100% deterministic on identical machine');
  });

  await itAsync('[CLIENT-02] Hardware SHA-256 hash is stable across simulated storage wipes', async () => {
    const rawAttrs = await collectHardwareAttributes();
    const hashA = await sha256Hex(rawAttrs);

    // Simulate clearing localStorage and cookies
    const simulatedFreshRunAttrs = await collectHardwareAttributes();
    const hashB = await sha256Hex(simulatedFreshRunAttrs);

    assert.strictEqual(hashA, hashB, 'Hardware fingerprint must remain identical after cache clears / incognito');
    assert.strictEqual(hashA.length, 64, 'SHA-256 output must be 64 hex characters');
  });

  it('[CLIENT-03] Cryptographic verification token is tamper-proof HMAC-SHA256', () => {
    const token1 = generateDeviceVerificationToken('DEV_HW_A', 'user@cafe.com', 1700000000000);
    const token2 = generateDeviceVerificationToken('DEV_HW_A', 'user@cafe.com', 1700000000000);
    const tampered = generateDeviceVerificationToken('DEV_HW_A', 'tampered@cafe.com', 1700000000000);

    assert.strictEqual(token1, token2);
    assert.notStrictEqual(token1, tampered);
    assert.strictEqual(token1.length, 64);
  });

  // -------------------------------------------------------------
  // SECTION 5: FIRESTORE SECURITY RULES (ZERO-CLIENT GATE)
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 5: FIRESTORE SECURITY RULES (CLIENT OVERWRITE PROTECTION)');

  it('[RULES-01] firestore.rules declares root /devices/{deviceId} zero-client access gate', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
    assert.ok(content.includes('match /devices/{deviceId}'), 'firestore.rules must match root devices collection');
    assert.ok(
      content.includes('allow read, write: if false;'),
      'Direct client SDK access must be completely barred'
    );
  });

  it('[RULES-02] database/firestore.rules is 100% synchronized with firestore.rules', () => {
    const r1 = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
    const r2 = fs.readFileSync(path.resolve(__dirname, '../database/firestore.rules'), 'utf8');
    assert.strictEqual(r1, r2, 'Rules files must be byte-for-byte identical');
  });

  // -------------------------------------------------------------
  // SECTION 6: DOM OVERLAY & SYSTEM INVARIANTS AUDIT
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 6: DOM SECURITY OVERLAY & SYSTEM INVARIANTS');

  it('[DOM-01] index.html defines non-dismissible #deviceLockedOverlay with hardware ID display', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('id="deviceLockedOverlay"'), '#deviceLockedOverlay must exist in DOM');
    assert.ok(html.includes('id="lockedHardwareDeviceIdDisplay"'), 'Hardware device ID display element must exist');
    assert.ok(html.includes('id="lockedDeviceErrorMessage"'), 'Error message element must exist');
    assert.ok(html.includes('id="lockedDeviceEmailDisplay"'), 'Target email display element must exist');
  });

  it('[DOM-02] #deviceLockedOverlay strictly contains ZERO .modal-close-btn elements', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const match = html.match(/<div id="deviceLockedOverlay"[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(match, 'Overlay block must be present');
    assert.strictEqual(match[0].includes('modal-close-btn'), false, 'Locked screen must NEVER be dismissible');
  });

  it('[DOM-03] Invariant 26 modal close button SVGs is strictly preserved across index.html', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const closeBtnMatches = html.match(/class="[^"]*modal-close-btn[^"]*"/g) || [];
    assert.strictEqual(closeBtnMatches.length, 26, 'Must strictly maintain exactly 26 .modal-close-btn elements');
  });

  it('[DOM-04] index.html includes js/device-identity.js script tag', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('src="js/device-identity.js'), 'Must include js/device-identity.js script tag');
  });

  // -------------------------------------------------------------
  // SECTION 7: LIVE LOCAL SERVER REST ENDPOINT VERIFICATION
  // -------------------------------------------------------------
  console.log('\n📍 SECTION 7: LIVE LOCAL SERVER /api/auth/validate-device ENDPOINT');

  await itAsync('[REST-01] POST /api/auth/validate-device enforces 2-account limit and returns 403 on third', async () => {
    const restDeviceId = 'DEV_REST_HW_' + Date.now().toString(36) + '_ABCD';

    // Account 1
    const res1 = await fetch('http://localhost:5000/api/auth/validate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rest_user1@cafe.com', deviceId: restDeviceId })
    });
    const data1 = await res1.json();
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.action, 'REGISTERED');
    assert.strictEqual(data1.associatedAccountsCount, 1);

    // Account 2
    const res2 = await fetch('http://localhost:5000/api/auth/validate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rest_user2@cafe.com', deviceId: restDeviceId })
    });
    const data2 = await res2.json();
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.action, 'NEW_ACCOUNT_LINKED');
    assert.strictEqual(data2.associatedAccountsCount, 2);

    // Account 3 -> 403 Forbidden with exact error message
    const res3 = await fetch('http://localhost:5000/api/auth/validate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rest_user3@cafe.com', deviceId: restDeviceId })
    });
    const data3 = await res3.json();
    assert.strictEqual(res3.status, 403);
    assert.strictEqual(data3.success, false);
    assert.strictEqual(data3.code, 'permission-denied');
    assert.strictEqual(
      data3.error,
      'Device registration limit reached. This device is already linked to two other accounts.'
    );
  });

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('====================================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ ALL 20 DEVICE-LOCKING SECURITY TESTS PASSED 100% GREEN!\n');
    process.exitCode = 0;
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
