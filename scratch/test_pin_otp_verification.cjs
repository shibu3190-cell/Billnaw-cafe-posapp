// scratch/test_pin_otp_verification.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
process.env.NODE_ENV = 'test';

async function run() {
  console.log('====================================================');
  console.log('🧪 PIN OTP VERIFICATION & MULTI-CONTAINER RESILIENCE');
  console.log('====================================================\n');

  const { handler, generateOtpTicket, verifyOtpTicket } = await import('../netlify/functions/api.js');

  const storeOwnerEmail = 'bapi92halder@gmail.com';
  const storeCode = 'SHOP_BAPI92HALDER';
  const testIp = '127.0.0.99';

  // ---------------------------------------------------------------
  // CHECK 1: POST /api/auth/admin-forgot-pin/send-otp
  // ---------------------------------------------------------------
  console.log('📍 CHECK 1: POST /api/auth/admin-forgot-pin/send-otp');
  let sendRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/admin-forgot-pin/send-otp',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
    body: JSON.stringify({ email: storeOwnerEmail, storeCode })
  }, {});

  if (sendRes.statusCode === 429) {
    const errData = JSON.parse(sendRes.body);
    const waitMs = ((errData.retryAfter || 2) + 1) * 1000;
    console.log(`[Cooldown notice] Waiting ${waitMs}ms for OTP resend cooldown...`);
    await new Promise(r => setTimeout(r, waitMs));
    sendRes = await handler({
      httpMethod: 'POST',
      path: '/api/auth/admin-forgot-pin/send-otp',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
      body: JSON.stringify({ email: storeOwnerEmail, storeCode })
    }, {});
  }

  assert.strictEqual(sendRes.statusCode, 200, 'send-otp must return 200');
  const sendData = JSON.parse(sendRes.body);
  assert.strictEqual(sendData.success, true, 'send-otp must succeed');
  assert.strictEqual(sendData.email, storeOwnerEmail, 'send-otp must echo back normalized email');
  assert.ok(sendData.otpTicket, 'send-otp must return an otpTicket for multi-container resilience');
  console.log('  ✅ PASS: send-otp dispatched, echoed email, and generated otpTicket.');

  const ticketPayload = JSON.parse(Buffer.from(sendData.otpTicket, 'base64url').toString('utf8'));
  assert.strictEqual(ticketPayload.email, storeOwnerEmail);
  assert.strictEqual(ticketPayload.purpose, 'admin-pin-reset');

  // Let's test checking with an invalid OTP (wrong 6-digit code)
  console.log('\n📍 CHECK 2: Rejection of Invalid 6-digit Code');
  const badOtpRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/admin-forgot-pin/reset',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
    body: JSON.stringify({
      email: storeOwnerEmail,
      otp: '999999',
      newPin: '5829',
      storeCode,
      otpTicket: sendData.otpTicket
    })
  }, {});
  assert.strictEqual(badOtpRes.statusCode, 400, 'Bad OTP must return 400');
  const badOtpData = JSON.parse(badOtpRes.body);
  assert.strictEqual(badOtpData.success, false);
  console.log('  ✅ PASS: Bad OTP code correctly rejected.');

  // Let's test rejection of trivial PINs (1234, 0000, 1111)
  console.log('\n📍 CHECK 3: Rejection of Trivial PINs (1234, 0000, 1111)');
  const trivialPinRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/admin-forgot-pin/reset',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
    body: JSON.stringify({
      email: storeOwnerEmail,
      otp: '123456',
      newPin: '1234',
      storeCode,
      otpTicket: sendData.otpTicket
    })
  }, {});
  assert.strictEqual(trivialPinRes.statusCode, 400, 'Trivial PIN must return 400');
  const trivialData = JSON.parse(trivialPinRes.body);
  assert.ok(trivialData.error.includes('non-trivial PIN'), 'Error message must describe non-trivial PIN requirement');
  console.log('  ✅ PASS: Trivial PIN rejected.');

  // ---------------------------------------------------------------
  // CHECK 4: Multi-Container Simulation with Container Memory Wiped
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 4: Multi-Container Isolated Node Reset');
  assert.strictEqual(typeof generateOtpTicket, 'function', 'api.js must export generateOtpTicket');
  assert.strictEqual(typeof verifyOtpTicket, 'function', 'api.js must export verifyOtpTicket');

  // Unit verify with dedicated ticket
  const unitCheckTicket = generateOtpTicket(storeOwnerEmail, '112233', 'admin-pin-reset');
  assert.ok(verifyOtpTicket(storeOwnerEmail, '112233', 'admin-pin-reset', unitCheckTicket), 'Ticket verification helper must validate authentic ticket');
  assert.strictEqual(verifyOtpTicket(storeOwnerEmail, '999999', 'admin-pin-reset', unitCheckTicket), false, 'Ticket verification must reject incorrect OTP');

  // Fresh ticket for handler reset test
  const freshOtp = '748291';
  const freshTicket = generateOtpTicket(storeOwnerEmail, freshOtp, 'admin-pin-reset');

  const resetSuccessRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/admin-forgot-pin/reset',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
    body: JSON.stringify({
      email: storeOwnerEmail,
      otp: freshOtp,
      newPin: '8520',
      storeCode,
      otpTicket: freshTicket,
      role: 'Admin'
    })
  }, {});

  if (resetSuccessRes.statusCode !== 200) {
    console.log('RESET ERROR RESPONSE:', resetSuccessRes.statusCode, resetSuccessRes.body);
  }

  assert.strictEqual(resetSuccessRes.statusCode, 200, 'Valid reset with ticket must succeed with 200');
  const resetSuccessData = JSON.parse(resetSuccessRes.body);
  assert.strictEqual(resetSuccessData.success, true);
  assert.ok(resetSuccessData.adminPinHash, 'Response must include updated adminPinHash');
  assert.ok(resetSuccessData.pinSalt, 'Response must include cryptographic salt');
  console.log('  ✅ PASS: Multi-container reset succeeded with valid cryptographic ticket.');

  // ---------------------------------------------------------------
  // CHECK 5: Replay / Single-Use Prevention
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 5: Single-Use Replay Prevention');
  const replayRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/admin-forgot-pin/reset',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': testIp },
    body: JSON.stringify({
      email: storeOwnerEmail,
      otp: freshOtp,
      newPin: '9630',
      storeCode,
      otpTicket: freshTicket,
      role: 'Admin'
    })
  }, {});
  assert.strictEqual(replayRes.statusCode, 400, 'Replayed reset must be rejected with 400');
  console.log('  ✅ PASS: Consumed ticket successfully blocked from replay.');

  console.log('\n====================================================');
  console.log('🎯 ALL 5 PIN OTP VERIFICATION CHECKS PASSED 100%!');
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
