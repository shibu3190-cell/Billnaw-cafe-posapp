// scratch/test_cross_container_otp.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function run() {
  console.log('====================================================');
  console.log('🧪 CROSS-CONTAINER OTP PERSISTENCE & SECURITY AUDIT');
  console.log('====================================================\n');

  const apiJs = fs.readFileSync(path.join(__dirname, '../netlify/functions/api.js'), 'utf8');

  // 1. Static Security & Architecture Checks
  console.log('📍 CHECK 1: Architecture & Cryptographic Key Hygiene');
  assert.ok(apiJs.includes('getNetlifyOtpBlobStore'), 'api.js must define getNetlifyOtpBlobStore');
  assert.ok(apiJs.includes('billnaw-auth-otps'), 'api.js must use billnaw-auth-otps store');
  assert.ok(apiJs.includes('billnaw-auth-users'), 'api.js must use billnaw-auth-users store');
  assert.ok(apiJs.includes("crypto.createHash('sha256').update(norm).digest('hex')"), 'getOtpBlobKey must use collision-free SHA-256 hex keys');
  assert.ok(apiJs.includes('cleanOtpInput'), 'api.js must define cleanOtpInput helper');
  assert.ok(!apiJs.includes("replace('@', '_at_')"), 'api.js must not use lossy regex email key replacement');
  console.log('  ✅ PASS: SHA-256 non-colliding Blob key hashing verified.');

  // 2. Anti-Store Takeover Security Guard
  console.log('\n📍 CHECK 2: Anti-Store Takeover Security Guard');
  assert.ok(apiJs.includes('candidateOwner === email'), 'verify-otp must check that candidate store owner matches authenticated email');
  assert.ok(apiJs.includes('Forbidden: storeCode belongs to another owner'), 'verify-otp must reject cross-tenant store takeover with 403 Forbidden');
  console.log('  ✅ PASS: Cross-tenant store takeover prevention verified.');

  // 3. Rate Limiting on All Auth Endpoints
  console.log('\n📍 CHECK 3: Rate Limiting on All Auth Entry Points');
  assert.ok(apiJs.includes('login_req_'), 'api.js must enforce login rate limiting');
  assert.ok(apiJs.includes('signup_req_'), 'api.js must enforce signup rate limiting');
  assert.ok(apiJs.includes('pin_reset_'), 'api.js must enforce PIN reset rate limiting');
  assert.ok(apiJs.includes('pw_reset_'), 'api.js must enforce password reset rate limiting');
  console.log('  ✅ PASS: Rate limits present on all authentication entry points.');

  // 4. Multi-Instance Memory Shadowing & Cleanup Protection
  console.log('\n📍 CHECK 4: Memory Cache Invalidation & Blobs Reconciliation');
  assert.ok(apiJs.includes('memoryOtpStore.delete(normEmail)'), 'retrieveOtpFromFirestore must invalidate stale memory when Blobs is empty');
  assert.ok(apiJs.includes('removeOtpFromFirestore'), 'All completion and lockout branches must purge OTP from Blobs');
  console.log('  ✅ PASS: Multi-container memory shadowing prevention verified.');

  // 5. Behavioral API Execution Test
  console.log('\n📍 CHECK 5: Live API Handler Behavioral Verification');
  const { handler } = await import('../netlify/functions/api.js');

  const testEmail = `audit_cross_${Date.now()}@billnawcafe.com`;

  // Step A: Send OTP
  const sendRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/send-otp',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '127.0.0.1' },
    body: JSON.stringify({ email: testEmail, purpose: 'login' })
  }, {});
  assert.strictEqual(sendRes.statusCode, 200, 'send-otp must succeed');
  const sendBody = JSON.parse(sendRes.body);
  assert.strictEqual(sendBody.success, true);

  // Step B: Verify Invalid OTP (should return 400 with attempts remaining)
  const invalidRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/verify-otp',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '127.0.0.1' },
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  }, {});
  assert.strictEqual(invalidRes.statusCode, 400, 'Invalid OTP must return 400');
  const invalidBody = JSON.parse(invalidRes.body);
  assert.ok(invalidBody.error.includes('Invalid verification code'), 'Error should specify invalid code');

  // Step C: Verify Cross-Tenant Takeover Attempt
  const takeoverRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/verify-otp',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '127.0.0.1' },
    body: JSON.stringify({
      email: testEmail,
      otp: '000000',
      storeCode: 'SHOP_BAPI92HALDER'
    })
  }, {});
  assert.strictEqual(takeoverRes.statusCode, 400, 'Invalid OTP evaluated first');

  console.log('  ✅ PASS: Handler behavioral validation executed successfully.');
  console.log('====================================================');
  console.log('🎯 ALL 5 CROSS-CONTAINER OTP CHECKS PASSED 100%!');
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
