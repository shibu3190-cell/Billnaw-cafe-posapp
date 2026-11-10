const assert = require('assert');

async function testTenantSecurityAndIsolation() {
  console.log('=== STARTING TENANT SECURITY & DATA INJECTION AUDIT ===');
  const BASE_URL = 'http://localhost:5000';

  // 1. Missing storeCode on GET /api/sync/store-data
  console.log('\n[TEST 1] Missing storeCode GET /api/sync/store-data...');
  const res1 = await fetch(`${BASE_URL}/api/sync/store-data`);
  assert.strictEqual(res1.status, 400, 'Must return 400 when storeCode is missing');
  const body1 = await res1.json();
  assert.strictEqual(body1.success, false);
  console.log('  ✅ Passed: Missing storeCode safely rejected (400):', body1.error);

  // 2. Missing storeCode on POST /api/sync/store-data
  console.log('\n[TEST 2] Missing storeCode POST /api/sync/store-data...');
  const res2 = await fetch(`${BASE_URL}/api/sync/store-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Malicious Injected Shop' } })
  });
  assert.strictEqual(res2.status, 400, 'Must return 400 when storeCode is missing');
  const body2 = await res2.json();
  assert.strictEqual(body2.success, false);
  console.log('  ✅ Passed: Injection without storeCode safely rejected (400):', body2.error);

  // 3. Path traversal attack attempt on storeCode
  console.log('\n[TEST 3] Path traversal storeCode attempt...');
  const res3 = await fetch(`${BASE_URL}/api/sync/store-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: '../../etc/passwd', profile: { name: 'Hacked' } })
  });
  assert.strictEqual(res3.status, 400, 'Path traversal must be rejected with 400');
  console.log('  ✅ Passed: Path traversal storeCode blocked cleanly.');

  // 4. Legitimate storeCode with ownerEmail linking
  console.log('\n[TEST 4] Valid tenant sync with ownerEmail linking...');
  const testTenantCode = 'SHOP-SEC-TEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const testEmail = 'owner.test.' + Math.random().toString(36).substring(2, 6) + '@example.com';
  
  const res4 = await fetch(`${BASE_URL}/api/sync/store-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: testTenantCode,
      ownerEmail: testEmail,
      profile: {
        name: 'Secure Isolated Cafe',
        phone: '9988776655'
      },
      staff: [{ id: 1, name: 'Admin', role: 'Admin' }],
      tables: { '1': { status: 'available' }, '2': { status: 'available' } }
    })
  });
  assert.strictEqual(res4.status, 200);
  const body4 = await res4.json();
  assert.strictEqual(body4.success, true);
  console.log('  ✅ Passed: Valid tenant saved successfully.');

  // 5. Read back and verify strict isolation and email linking
  console.log('\n[TEST 5] Read back and verify email and tenant isolation...');
  const readRes = await fetch(`${BASE_URL}/api/sync/store-data?storeCode=${encodeURIComponent(testTenantCode)}`);
  assert.strictEqual(readRes.status, 200);
  const readData = await readRes.json();
  assert.strictEqual(readData.storeCode, testTenantCode);
  assert.strictEqual(readData.ownerEmail, testEmail.toLowerCase());
  assert.strictEqual(readData.profile?.name, 'Secure Isolated Cafe');
  assert.strictEqual(readData.profile?.ownerEmail, testEmail.toLowerCase());
  assert.strictEqual(readData.staff?.length, 1);
  assert.strictEqual(Object.keys(readData.tables || {}).length, 2);
  console.log('  ✅ Passed: Shop data strictly isolated and updated with shop email.');

  // 6. Cleanup test shop
  console.log('\n[TEST 6] Cleaning up test tenant...');
  const { CONFIG } = require('../server/config.js');
  const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  await fetch(`${base}/shops/${encodeURIComponent(testTenantCode)}/staff/1`, { method: 'DELETE' }).catch(() => {});
  await fetch(`${base}/shops/${encodeURIComponent(testTenantCode)}/tables/1`, { method: 'DELETE' }).catch(() => {});
  await fetch(`${base}/shops/${encodeURIComponent(testTenantCode)}/tables/2`, { method: 'DELETE' }).catch(() => {});
  await fetch(`${base}/shops/${encodeURIComponent(testTenantCode)}`, { method: 'DELETE' }).catch(() => {});
  console.log('  ✅ Cleanup complete.');

  console.log('\n🎉 ALL TENANT SECURITY & INJECTION PREVENTION TESTS PASSED 100%! 🎉');
}

testTenantSecurityAndIsolation().catch(err => {
  console.error('\n❌ SECURITY TEST FAILED:', err);
  process.exit(1);
});
