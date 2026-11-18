// scratch/test_login_otp_resilience.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Ensure local .env is loaded for tests if available
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch (e) {}

async function runTests() {
  console.log('====================================================');
  console.log('🔐 LOGIN OTP RESILIENCE & CREDENTIALS AUDIT');
  console.log('====================================================\n');

  // 1. Verify netlify/functions/api.js does NOT contain hardcoded secrets and reads from process.env
  console.log('📍 CHECK 1: Netlify Functions SMTP Configuration & Secret Hygiene');
  const apiJs = fs.readFileSync(path.join(__dirname, '../netlify/functions/api.js'), 'utf8');
  assert.ok(!apiJs.includes('aurgocpkzydyzoie'), 'api.js must NOT contain hardcoded plain password');
  assert.ok(apiJs.includes('process.env.SMTP_PASS'), 'api.js must read SMTP_PASS from process.env');
  assert.ok(apiJs.includes('removeOtpFromFirestore'), 'api.js must define removeOtpFromFirestore for error cleanup');
  console.log('  ✅ PASS: netlify/functions/api.js reads SMTP credentials from env without hardcoded secrets');

  // 2. Verify server/config.js has no hardcoded secrets
  console.log('\n📍 CHECK 2: server/config.js Email Configuration & Secret Hygiene');
  const configJs = fs.readFileSync(path.join(__dirname, '../server/config.js'), 'utf8');
  assert.ok(!configJs.includes('aurgocpkzydyzoie'), 'config.js must NOT contain hardcoded plain password');
  assert.ok(configJs.includes('process.env.SMTP_PASS'), 'config.js must read SMTP_PASS from process.env');
  console.log('  ✅ PASS: server/config.js reads SMTP credentials from env without hardcoded secrets');

  // 3. Verify database/server-functions/index.js has no hardcoded secrets
  console.log('\n📍 CHECK 3: database/server-functions/index.js Configuration');
  const dbIndexJs = fs.readFileSync(path.join(__dirname, '../database/server-functions/index.js'), 'utf8');
  assert.ok(!dbIndexJs.includes('aurgocpkzydyzoie'), 'database/server-functions/index.js must NOT contain hardcoded plain password');
  assert.ok(dbIndexJs.includes('otpMemoryCache.delete(email)'), 'database/server-functions/index.js must clean cache on failure');
  console.log('  ✅ PASS: database/server-functions/index.js cleans cache and has no hardcoded secrets');

  // 4. Verify index.html contains Change Email link & Password Sign-in option
  console.log('\n📍 CHECK 4: index.html OTP UI Controls');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('resetLoginOtpView()'), 'index.html must offer resetLoginOtpView()');
  assert.ok(indexHtml.includes('toggleLoginAuthMode(\'password\')'), 'index.html must offer toggleLoginAuthMode to password');
  
  // Verify modal close button invariant
  const modalCloseMatches = (indexHtml.match(/class="[^"]*modal-close-btn[^"]*"/g) || []).length;
  assert.strictEqual(modalCloseMatches, 26, `Must have exactly 26 modal-close-btn, found ${modalCloseMatches}`);
  console.log('  ✅ PASS: Invariant 26 modal close buttons preserved');

  // Verify zero raw emojis inside buttons
  const buttonTags = indexHtml.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const emojiButtons = buttonTags.filter(b => emojiRegex.test(b));
  assert.strictEqual(emojiButtons.length, 0, `Buttons with emojis found: ${emojiButtons.length}`);
  console.log('  ✅ PASS: Zero raw emojis inside buttons preserved');

  // 5. Verify js/shop-auth.js resilience logic
  console.log('\n📍 CHECK 5: js/shop-auth.js Functionality');
  const authJs = fs.readFileSync(path.join(__dirname, '../js/shop-auth.js'), 'utf8');
  assert.ok(authJs.includes('handleSendOtpCode'), 'js/shop-auth.js must define handleSendOtpCode');
  assert.ok(authJs.includes('handleResendOtpCode'), 'js/shop-auth.js must define handleResendOtpCode');
  assert.ok(authJs.includes('resetLoginOtpView'), 'js/shop-auth.js must define resetLoginOtpView');
  console.log('  ✅ PASS: js/shop-auth.js defines required auth handlers');

  // 6. Test handler dispatch & error-cleanup resilience
  console.log('\n📍 CHECK 6: Netlify Handler /api/auth/send-otp Execution & Error-Cleanup Resilience');
  const { handler } = await import('../netlify/functions/api.js');
  const res = await handler({
    httpMethod: 'POST',
    path: '/api/auth/send-otp',
    body: JSON.stringify({ email: 'bapi92halder@gmail.com', purpose: 'login' })
  }, {});

  const data = JSON.parse(res.body);
  if (res.statusCode === 200) {
    assert.strictEqual(data.success, true, 'send-otp response data.success must be true');
    assert.strictEqual(data.realEmailDispatched, true, 'realEmailDispatched must be true');
    console.log('  ✅ PASS: Live Netlify handler dispatched OTP email to bapi92halder@gmail.com');
  } else {
    assert.strictEqual(res.statusCode, 500, 'When SMTP fails in CI/local, status must be 500 (not 429)');
    assert.ok(!String(data.error || '').includes('PLAIN'), 'Error message must be sanitized (never expose raw PLAIN auth internals)');
    // Verify immediate retry is NOT blocked by 60-second cooldown (cache was cleaned up on failure)
    const retryRes = await handler({
      httpMethod: 'POST',
      path: '/api/auth/send-otp',
      body: JSON.stringify({ email: 'bapi92halder@gmail.com', purpose: 'login' })
    }, {});
    assert.notStrictEqual(retryRes.statusCode, 429, 'Failed OTP dispatch must clean cache so immediate retry is not rate-limited by 60s cooldown');
    console.log('  ✅ PASS: Netlify handler sanitized SMTP error and cleaned OTP cache for immediate retry');
  }

  console.log('\n====================================================');
  console.log('🎯 ALL 6 LOGIN OTP RESILIENCE CHECKS PASSED 100%!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
