// scratch/test_login_otp_resilience.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('====================================================');
  console.log('🔐 LOGIN OTP RESILIENCE & CREDENTIALS AUDIT');
  console.log('====================================================\n');

  // 1. Verify netlify/functions/api.js has valid fallback credentials
  console.log('📍 CHECK 1: Netlify Functions SMTP Fallback Configuration');
  const apiJs = fs.readFileSync(path.join(__dirname, '../netlify/functions/api.js'), 'utf8');
  assert.ok(apiJs.includes('aurgocpkzydyzoie'), 'api.js must include SMTP_PASS fallback app password');
  assert.ok(apiJs.includes('shibu3190@gmail.com'), 'api.js must include SMTP_USER default');
  console.log('  ✅ PASS: netlify/functions/api.js has valid fallback Gmail credentials');

  // 2. Verify server/config.js has valid fallback credentials
  console.log('\n📍 CHECK 2: server/config.js Email Configuration');
  const configJs = fs.readFileSync(path.join(__dirname, '../server/config.js'), 'utf8');
  assert.ok(configJs.includes('aurgocpkzydyzoie'), 'config.js must include SMTP_PASS fallback app password');
  console.log('  ✅ PASS: server/config.js has valid fallback SMTP credentials');

  // 3. Verify database/server-functions/index.js has fallback
  console.log('\n📍 CHECK 3: database/server-functions/index.js Configuration');
  const dbIndexJs = fs.readFileSync(path.join(__dirname, '../database/server-functions/index.js'), 'utf8');
  assert.ok(dbIndexJs.includes('aurgocpkzydyzoie'), 'database/server-functions/index.js must include fallback password');
  console.log('  ✅ PASS: database/server-functions/index.js has valid fallback credentials');

  // 4. Verify index.html contains Change Email link & Password Sign-in option inside #otpInputSection
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

  // 6. Test handler dispatch with real credentials
  console.log('\n📍 CHECK 6: Live Netlify Handler Execution with bapi92halder@gmail.com');
  const { handler } = await import('../netlify/functions/api.js');
  const res = await handler({
    httpMethod: 'POST',
    path: '/api/auth/send-otp',
    body: JSON.stringify({ email: 'bapi92halder@gmail.com', purpose: 'login' })
  }, {});
  
  assert.strictEqual(res.statusCode, 200, 'send-otp must succeed with status 200');
  const data = JSON.parse(res.body);
  assert.strictEqual(data.success, true, 'send-otp response data.success must be true');
  assert.strictEqual(data.realEmailDispatched, true, 'realEmailDispatched must be true');
  console.log('  ✅ PASS: Live Netlify handler successfully dispatched OTP email to bapi92halder@gmail.com');

  console.log('\n====================================================');
  console.log('🎯 ALL 6 LOGIN OTP RESILIENCE CHECKS PASSED 100%!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
