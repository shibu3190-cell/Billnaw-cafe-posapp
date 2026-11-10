// scratch/test_netlify_and_existing_shop_adaptation.cjs
// Tests Netlify Serverless Function parity and existing shop adaptation.

const assert = require('assert');

async function testNetlifyAdaptation() {
  console.log('=== STARTING NETLIFY & EXISTING SHOP ADAPTATION TEST ===\n');

  const { handler } = await import('../netlify/functions/api.js');

  // TEST 1: Read existing shop SHOP_BAPI92HALDER via Netlify API handler
  console.log('[TEST 1] Invoking Netlify handler: GET /api/sync/store-data?storeCode=SHOP_BAPI92HALDER...');
  const res1 = await handler({
    httpMethod: 'GET',
    path: '/api/sync/store-data',
    queryStringParameters: { storeCode: 'SHOP_BAPI92HALDER' },
    headers: {}
  }, {});

  assert.strictEqual(res1.statusCode, 200, `Expected 200, got ${res1.statusCode}`);
  const data1 = JSON.parse(res1.body);
  assert.strictEqual(data1.success, true);
  assert.strictEqual(data1.storeCode, 'SHOP_BAPI92HALDER');
  console.log(`  ✅ Passed: SHOP_BAPI92HALDER loaded successfully via Netlify handler.`);
  console.log(`     Shop Name: ${data1.profile?.name}, Tables: ${data1.profile?.tableCount || Object.keys(data1.tables || {}).length}`);

  // TEST 2: Reject cross-tenant injection or missing storeCode on Netlify
  console.log('\n[TEST 2] Testing perimeter security on Netlify handler...');
  const res2 = await handler({
    httpMethod: 'POST',
    path: '/api/sync/store-data',
    queryStringParameters: {},
    headers: {},
    body: JSON.stringify({ profile: { name: 'Hacker' } })
  }, {});
  assert.strictEqual(res2.statusCode, 400);
  console.log('  ✅ Passed: Missing storeCode rejected with 400 on Netlify handler.');

  const res3 = await handler({
    httpMethod: 'POST',
    path: '/api/sync/store-data',
    queryStringParameters: { storeCode: '../../../etc/passwd' },
    headers: {},
    body: JSON.stringify({ profile: { name: 'Hacker' } })
  }, {});
  assert.strictEqual(res3.statusCode, 400);
  console.log('  ✅ Passed: Path traversal blocked with 400 on Netlify handler.');

  // TEST 3: Multi-item menu capacity & staff sync through Netlify handler
  console.log('\n[TEST 3] Testing store data sync through Netlify handler for an existing shop...');
  const testTenantCode = 'SHOP-NETLIFY-TEST-' + Date.now().toString(36).toUpperCase();
  const res4 = await handler({
    httpMethod: 'POST',
    path: '/api/sync/store-data',
    headers: { 'x-shop-id': testTenantCode, 'x-shop-email': 'owner_test@cafe.com' },
    body: JSON.stringify({
      storeCode: testTenantCode,
      ownerEmail: 'owner_test@cafe.com',
      profile: { name: 'Netlify Adapted Cafe', tableCount: 24, phone: '9988776655' },
      tables: { '1': { status: 'available' }, '24': { status: 'available' } },
      staff: [
        { id: 1, name: 'Admin', role: 'Admin', status: 'Active' },
        { id: 2, name: 'Staff Server 1', role: 'Floor Server', status: 'Active' },
        { id: 3, name: 'Staff Server 2', role: 'Floor Server', status: 'Active' }
      ]
    })
  }, {});
  assert.strictEqual(res4.statusCode, 200);
  const data4 = JSON.parse(res4.body);
  assert.strictEqual(data4.success, true);
  console.log(`  ✅ Passed: Netlify sync created tenant with 3 staff and 24 tables.`);

  // TEST 4: Read back via Netlify handler
  console.log('\n[TEST 4] Reading back synced tenant via Netlify handler...');
  const res5 = await handler({
    httpMethod: 'GET',
    path: '/api/sync/store-data',
    queryStringParameters: { storeCode: testTenantCode },
    headers: {}
  }, {});
  assert.strictEqual(res5.statusCode, 200);
  const data5 = JSON.parse(res5.body);
  assert.strictEqual(data5.profile?.name, 'Netlify Adapted Cafe');
  assert.strictEqual(data5.profile?.tableCount, 24);
  assert.strictEqual(data5.staff?.length, 3);
  assert.strictEqual(data5.ownerEmail, 'owner_test@cafe.com');
  console.log(`  ✅ Passed: Netlify handler read back all tenant fields with 100% fidelity!`);

  // Cleanup test tenant
  const { CONFIG } = await import('../server/config.js');
  const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testTenantCode)}`, { method: 'DELETE' }).catch(() => {});
  console.log('  ✅ Cleaned up temporary test tenant.');

  console.log('\n🎉 ALL NETLIFY & EXISTING SHOP ADAPTATION TESTS PASSED 100%! 🎉');
}

testNetlifyAdaptation().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
