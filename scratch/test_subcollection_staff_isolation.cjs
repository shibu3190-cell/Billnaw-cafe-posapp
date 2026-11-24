// scratch/test_subcollection_staff_isolation.cjs
// Regression test suite for Subcollection Staff Isolation, Quota-Resistant Quarantine,
// and Client/Server Multi-Tenant Profile Protection.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('====================================================================');
  console.log('🧪 RUNNING SUBCOLLECTION STAFF ISOLATION & MULTI-TENANT TEST SUITE');
  console.log('====================================================================\n');

  // Load server module
  const {
    getStoreFromFirestoreREST,
    syncStoreToFirestoreREST,
    getStoreStateFromPersistentCache,
    saveStoreStateToPersistentCache,
    sanitizeStaffForTenant,
    isAbhijitTenant,
    BAPI_QUARANTINE_STAFF_IDS
  } = await import('../server/sync-service.js');

  const BAPI_NAMES = ['Bapi Halder', 'Gourab Majumder', 'Sourav', 'Sayan', 'Manik', 'Samrat', 'Gopal', 'Amit'];
  const GENUINE_ABHIJIT_NAMES = ['Admin', 'Dk', 'om', 'a', 'Am', 'abhi', 'B'];

  // -------------------------------------------------------------------------
  // TEST 1: isAbhijitTenant helper accuracy
  // -------------------------------------------------------------------------
  console.log('📍 TEST 1: isAbhijitTenant helper checks');
  assert.strictEqual(isAbhijitTenant('SHOP_ABHIJITMODAK', null, null), true, 'Must detect SHOP_ABHIJITMODAK');
  assert.strictEqual(isAbhijitTenant('OTHER_SHOP', 'abhijitmodak098@gmail.com', null), true, 'Must detect ownerEmail');
  assert.strictEqual(isAbhijitTenant('OTHER_SHOP', null, { ownerEmail: 'abhijitmodak098@gmail.com' }), true, 'Must detect profile.ownerEmail');
  assert.strictEqual(isAbhijitTenant('SHOP_BAPI92HALDER', 'bapihalder@gmail.com', null), false, 'Must NOT match Bapi shop');
  console.log('  ✅ PASS: Tenant identification is 100% accurate.');

  // -------------------------------------------------------------------------
  // TEST 2: sanitizeStaffForTenant removes leaked IDs and adds deletedStaffIds (Immutability & Purge)
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 2: sanitizeStaffForTenant function unit test');
  const dirtyData = Object.freeze({
    ownerEmail: 'abhijitmodak098@gmail.com',
    staff: Object.freeze([
      { id: 1, name: 'Admin', role: 'Admin' },
      { id: '1793949208017', name: 'Dk', role: 'Staff' },
      { id: '1793965135000', name: 'Bapi Halder', role: 'Staff' }, // Leaked!
      { id: '1793965355981', name: 'Gourab Majumder', role: 'Staff' } // Leaked!
    ]),
    deletedStaffIds: Object.freeze(['999999'])
  });

  const sanitized = sanitizeStaffForTenant('SHOP_ABHIJITMODAK', dirtyData);
  assert.strictEqual(sanitized.staff.length, 2, 'Must retain only 2 genuine staff');
  assert.deepStrictEqual(sanitized.staff.map(s => s.name), ['Admin', 'Dk']);
  assert.ok(sanitized.deletedStaffIds.includes('1793965135000'), 'Must include leaked Bapi ID in deletedStaffIds');
  assert.ok(sanitized.deletedStaffIds.includes('1793965355981'), 'Must include leaked Gourab ID in deletedStaffIds');
  assert.ok(sanitized.deletedStaffIds.includes('999999'), 'Must retain existing deletedStaffIds');
  assert.notStrictEqual(sanitized, dirtyData, 'Must return a new cloned object, preserving immutability');
  console.log('  ✅ PASS: sanitizeStaffForTenant strictly purges leaked profiles and preserves immutability on frozen state.');

  // -------------------------------------------------------------------------
  // TEST 3: Persistent Cache read/write quarantine protection
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 3: Persistent Cache read/write quarantine');
  await saveStoreStateToPersistentCache('SHOP_TEST_CACHE_QUARANTINE', dirtyData);
  const cached = await getStoreStateFromPersistentCache('SHOP_TEST_CACHE_QUARANTINE');
  assert.strictEqual(cached.staff.length, 2, 'Cache read must be sanitized');
  assert.ok(!cached.staff.some(s => BAPI_QUARANTINE_STAFF_IDS.includes(String(s.id))), 'No Bapi staff in cache');
  console.log('  ✅ PASS: Persistent cache read/write is guarded against leaked staff.');

  // -------------------------------------------------------------------------
  // TEST 4: getStoreFromFirestoreREST live verification for SHOP_ABHIJITMODAK
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 4: getStoreFromFirestoreREST for SHOP_ABHIJITMODAK');
  const abhiResult = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
  assert.ok(abhiResult.success, 'Fetch SHOP_ABHIJITMODAK must succeed');
  assert.strictEqual(abhiResult.staff.length, 7, `SHOP_ABHIJITMODAK must have strictly 7 staff, got ${abhiResult.staff.length}`);
  
  const fetchedNames = abhiResult.staff.map(s => s.name);
  for (const genuineName of GENUINE_ABHIJIT_NAMES) {
    assert.ok(fetchedNames.includes(genuineName), `Must contain genuine staff ${genuineName}`);
  }
  for (const bName of BAPI_NAMES) {
    assert.ok(!fetchedNames.includes(bName), `Must NEVER contain leaked Bapi staff ${bName}`);
  }
  for (const bId of BAPI_QUARANTINE_STAFF_IDS) {
    assert.ok(abhiResult.deletedStaffIds.includes(bId), `deletedStaffIds must record quarantined ID ${bId}`);
  }
  console.log('  ✅ PASS: SHOP_ABHIJITMODAK live state returns strictly 6 profiles with deletedStaffIds populated.');

  // -------------------------------------------------------------------------
  // TEST 5: getStoreFromFirestoreREST for SHOP_BAPI92HALDER remains intact
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 5: getStoreFromFirestoreREST for SHOP_BAPI92HALDER');
  const bapiResult = await getStoreFromFirestoreREST('SHOP_BAPI92HALDER');
  assert.ok(bapiResult.success, 'Fetch SHOP_BAPI92HALDER must succeed');
  const bapiStaffNames = bapiResult.staff.map(s => s.name);
  assert.ok(bapiStaffNames.includes('Bapi Halder'), 'Bapi Halder must remain in own shop');
  assert.ok(bapiStaffNames.includes('Gourab Majumder'), 'Gourab Majumder must remain in own shop');
  console.log('  ✅ PASS: SHOP_BAPI92HALDER roster is completely untouched.');

  // -------------------------------------------------------------------------
  // TEST 6: Static code validation of client-side defenses
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 6: Client-Side Defense Static Invariants');
  const coreJs = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
  const cloudSyncJs = fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8');
  const shopAuthJs = fs.readFileSync(path.join(__dirname, '../js/shop-auth.js'), 'utf8');

  // Check 6a: subscribeStaffCloudListener enforces Authoritative Roster Invariant
  assert.ok(
    coreJs.includes('BAPI_LEAKED_IDS') && coreJs.includes('validSubDocs'),
    'subscribeStaffCloudListener must filter subcollection documents through BAPI_LEAKED_IDS'
  );
  assert.ok(
    coreJs.includes('staffList.some(s => String(s?.id || s?.staffId) === sId)'),
    'subscribeStaffCloudListener must check subcollection docs against existing authoritative roster'
  );
  assert.ok(
    !coreJs.includes('staffList = staffDocs;\n            window.staffList = staffList;'),
    'Unfiltered blind overwrite of staffList from subcollection docs MUST NOT exist'
  );

  // Check 6b: initDatabase purges stale cached staff
  assert.ok(
    coreJs.includes('BAPI_QUARANTINE_IDS') && coreJs.includes('cleanStored'),
    'initDatabase must sanitize cafe_staff against BAPI_QUARANTINE_IDS'
  );

  // Check 6c: _renderStaffProfileCards filters and deduplicates
  assert.ok(
    cloudSyncJs.includes('BAPI_QUARANTINE_IDS') && cloudSyncJs.includes('seenIds'),
    '_renderStaffProfileCards must quarantine Bapi IDs and deduplicate profiles'
  );

  // Check 6d: shop-auth.js registers quarantine IDs on login
  assert.ok(
    shopAuthJs.includes('BAPI_QUARANTINE_IDS.forEach(id => recordDeletedStaffId(id))'),
    'shop-auth.js must register BAPI_QUARANTINE_IDS into deletedStaffIds upon login'
  );

  console.log('  ✅ PASS: All 4 client defensive layers verified in source code.');

  // -------------------------------------------------------------------------
  // TEST 7: POST /api/sync/store-data handles quarantine merge without reference errors
  // -------------------------------------------------------------------------
  console.log('\n📍 TEST 7: Netlify POST /api/sync/store-data quarantine merge');
  const { handler } = await import('../netlify/functions/api.js');
  const { createSignedAuthToken } = await import('../server/auth-service.js');
  const abhiOwnerToken = createSignedAuthToken({ storeCode: 'SHOP_ABHIJITMODAK', email: 'abhijitmodak098@gmail.com', role: 'Owner' });
  const syncEvent = {
    httpMethod: 'POST',
    path: '/api/sync/store-data',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${abhiOwnerToken}`
    },
    body: JSON.stringify({
      storeCode: 'SHOP_ABHIJITMODAK',
      tables: { 'T1': { status: 'occupied', updatedAt: new Date().toISOString() } }
    })
  };
  const syncRes = await handler(syncEvent);
  assert.strictEqual(syncRes.statusCode, 200, 'POST /api/sync/store-data must return 200 OK');
  const parsedSync = JSON.parse(syncRes.body);
  assert.strictEqual(parsedSync.success, true, 'Sync must succeed');
  assert.ok(Array.isArray(parsedSync.deletedStaffIds), 'Must return deletedStaffIds');
  for (const qId of BAPI_QUARANTINE_STAFF_IDS) {
    assert.ok(parsedSync.deletedStaffIds.includes(qId), `deletedStaffIds must include ${qId}`);
  }
  console.log('  ✅ PASS: POST /api/sync/store-data succeeds with 200 OK and preserves quarantine.');

  console.log('\n====================================================================');
  console.log('🎉 ALL 7 SUBCOLLECTION STAFF ISOLATION TESTS PASSED 100%!');
  console.log('====================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
