const { handler } = require('../netlify/functions/api.js');
const assert = require('assert');

async function runTests() {
  console.log('Testing handler path resolution with fixed Netlify rewrite handling...');

  // Test 1: Netlify rewrite with rawUrl
  const res1 = await handler({
    httpMethod: 'GET',
    path: '/.netlify/functions/api',
    rawUrl: 'https://test-site.netlify.app/api/version',
    headers: {}
  }, {});
  console.log('Test 1 (rawUrl):', res1.statusCode, res1.body);
  const data1 = JSON.parse(res1.body);
  assert.strictEqual(res1.statusCode, 200);
  assert.strictEqual(data1.version, '1.0.0');

  // Test 2: Netlify rewrite with x-nf-original-url
  const res2 = await handler({
    httpMethod: 'GET',
    path: '/.netlify/functions/api',
    headers: { 'x-nf-original-url': '/api/version' }
  }, {});
  console.log('Test 2 (x-nf-original-url):', res2.statusCode, res2.body);
  const data2 = JSON.parse(res2.body);
  assert.strictEqual(res2.statusCode, 200);
  assert.strictEqual(data2.version, '1.0.0');

  // Test 3: Direct /api/version path
  const res3 = await handler({
    httpMethod: 'GET',
    path: '/api/version',
    headers: {}
  }, {});
  console.log('Test 3 (direct /api/version):', res3.statusCode, res3.body);
  const data3 = JSON.parse(res3.body);
  assert.strictEqual(res3.statusCode, 200);
  assert.strictEqual(data3.version, '1.0.0');

  // Test 4: /.netlify/functions/api/version path
  const res4 = await handler({
    httpMethod: 'GET',
    path: '/.netlify/functions/api/version',
    headers: {}
  }, {});
  console.log('Test 4 (direct functions path):', res4.statusCode, res4.body);
  const data4 = JSON.parse(res4.body);
  assert.strictEqual(res4.statusCode, 200);
  assert.strictEqual(data4.version, '1.0.0');

  // Test 5: /api/gemini/status with x-nf-original-url
  const res5 = await handler({
    httpMethod: 'GET',
    path: '/.netlify/functions/api',
    rawUrl: 'https://test-site.netlify.app/api/gemini/status',
    headers: { 'x-nf-original-url': '/api/gemini/status' }
  }, {});
  console.log('Test 5 (gemini status):', res5.statusCode, res5.body);
  const data5 = JSON.parse(res5.body);
  assert.strictEqual(res5.statusCode, 200);
  assert.strictEqual(data5.operational, true);

  // Test 6: /api/auth/validate-device POST with rewrite
  const res6 = await handler({
    httpMethod: 'POST',
    path: '/.netlify/functions/api',
    rawUrl: 'https://test-site.netlify.app/api/auth/validate-device',
    headers: { 'x-nf-original-url': '/api/auth/validate-device' },
    body: JSON.stringify({ deviceId: 'dev_test' })
  }, {});
  console.log('Test 6 (validate-device POST):', res6.statusCode, res6.body);
  const data6 = JSON.parse(res6.body);
  assert.strictEqual(res6.statusCode, 200);
  assert.strictEqual(data6.success, true);

  // Test 7: /api/health
  const res7 = await handler({
    httpMethod: 'GET',
    path: '/.netlify/functions/api',
    rawUrl: 'https://test-site.netlify.app/api/health',
    headers: { 'x-nf-original-url': '/api/health' }
  }, {});
  console.log('Test 7 (health):', res7.statusCode, res7.body);
  assert.strictEqual(res7.statusCode, 200);

  console.log('\n🎉 ALL NETLIFY SERVERLESS ROUTING TESTS PASSED 100%!');
}

runTests().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
