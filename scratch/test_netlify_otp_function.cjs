// scratch/test_netlify_otp_function.cjs
const assert = require('assert');

async function runTests() {
  console.log('Testing Netlify serverless function handler...');
  const { handler } = await import('../netlify/functions/api.js');

  // 1. Test /health
  const healthRes = await handler({
    httpMethod: 'GET',
    path: '/api/health',
    body: null
  }, {});
  assert.strictEqual(healthRes.statusCode, 200, 'Health endpoint must return 200');
  const healthData = JSON.parse(healthRes.body);
  assert.strictEqual(healthData.status, 'ok');
  console.log('✅ GET /api/health passed:', healthData);

  // 2. Test /config/client
  const configRes = await handler({
    httpMethod: 'GET',
    path: '/api/config/client',
    body: null
  }, {});
  assert.strictEqual(configRes.statusCode, 200, 'Config endpoint must return 200');
  const configData = JSON.parse(configRes.body);
  assert.strictEqual(configData.projectId, 'abhi-pro-cafe-pos');
  console.log('✅ GET /api/config/client passed');

  // 3. Test Invalid email rejection
  const invalidRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/send-otp',
    body: JSON.stringify({ email: 'not-an-email' })
  }, {});
  assert.strictEqual(invalidRes.statusCode, 400);
  console.log('✅ Invalid email rejected with 400');

  // 4. Test Send OTP to verified test address
  const testEmail = 'shibu3190@gmail.com';
  console.log(`Sending real OTP email to ${testEmail}...`);
  const sendRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/send-otp',
    body: JSON.stringify({ email: testEmail, purpose: 'login' })
  }, {});
  console.log('send-otp response status:', sendRes.statusCode);
  const sendData = JSON.parse(sendRes.body);
  console.log('send-otp response data:', sendData);
  assert.strictEqual(sendRes.statusCode, 200, 'Send OTP must succeed with 200');
  assert.strictEqual(sendData.success, true);
  assert.strictEqual(sendData.realEmailDispatched, true);

  // 5. Verify Firestore has the OTP stored
  const proj = 'abhi-pro-cafe-pos';
  const dbId = 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda';
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${proj}/databases/${dbId}/documents/clients/_auth/otp/${encodeURIComponent(testEmail)}`;
  const fsRes = await fetch(firestoreUrl);
  assert.strictEqual(fsRes.status, 200, 'Firestore OTP document must exist');
  const fsDoc = await fsRes.json();
  const storedOtp = fsDoc.fields.otp.stringValue;
  console.log('✅ Firestore OTP document found! Stored OTP is:', storedOtp);
  assert.match(storedOtp, /^\d{6}$/);

  // 6. Test Verify OTP with wrong code
  const wrongRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/verify-otp',
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  }, {});
  assert.strictEqual(wrongRes.statusCode, 400);
  const wrongData = JSON.parse(wrongRes.body);
  assert.strictEqual(wrongData.success, false);
  console.log('✅ Wrong OTP rejected with 400:', wrongData.error);

  // 7. Test Verify OTP with correct code
  const correctRes = await handler({
    httpMethod: 'POST',
    path: '/api/auth/verify-otp',
    body: JSON.stringify({ email: testEmail, otp: storedOtp, shopName: 'Bengal Treats' })
  }, {});
  assert.strictEqual(correctRes.statusCode, 200);
  const correctData = JSON.parse(correctRes.body);
  assert.strictEqual(correctData.success, true);
  assert.ok(correctData.token, 'Token must be issued');
  assert.strictEqual(correctData.storeCode, 'BENGAL_TREATS');
  console.log('✅ Correct OTP verified with 200:', correctData);

  // 8. Confirm document was deleted from Firestore upon verification
  const fsAfterRes = await fetch(firestoreUrl);
  assert.strictEqual(fsAfterRes.status, 404, 'Firestore OTP document must be deleted after use');
  console.log('✅ Firestore OTP document cleanly deleted post-verification');

  console.log('\n🎉 ALL NETLIFY SERVERLESS FUNCTION TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
