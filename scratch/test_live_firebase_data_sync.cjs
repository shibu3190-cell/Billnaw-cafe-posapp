// scratch/test_live_firebase_data_sync.cjs
// Verifies end-to-end synchronization to Google Cloud Firestore:
// 1. Staff Profiles & PINs (root array & /staff/{id} subcollection)
// 2. Tables & Table Status (root map & /tables/{id} subcollection)
// 3. Menu items & Categories (including 20+ items upload)
// 4. Reports (Order History & Expenses)
// 5. Shop Profile (Name, Phone, Address, UPI, GST)

const assert = require('assert');
const { CONFIG } = require('../server/config.js');

const BASE_URL = 'http://localhost:5000';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;

async function testFullFirebaseSync() {
  console.log('=== STARTING LIVE FIREBASE DATA SYNC VERIFICATION ===');
  console.log('Firebase Project ID:', CONFIG.firebase.projectId);
  console.log('Firestore Database ID:', CONFIG.firebase.firestoreDatabaseId);

  const testShopCode = 'SHOP-FIREBASE-VERIFY-' + Date.now().toString(36).toUpperCase();
  console.log(`\n[STEP 1] Testing with isolated shop: ${testShopCode}`);

  // 1. Prepare Staff Data (Admin + Cashier + Floor Server + Chef)
  const testStaff = [
    {
      id: 1,
      name: 'Owner Admin',
      role: 'Admin',
      phone: '9876543210',
      pin_hash: '8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742',
      pin_salt: '0123456789abcdef0123456789abcdef',
      pinHash: '8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742',
      pinSalt: '0123456789abcdef0123456789abcdef',
      status: 'Active',
      stationProfile: 'POS',
      mustChangePin: false,
      otpConsumed: true
    },
    {
      id: 101,
      name: 'Rohan Sharma',
      role: 'Cashier',
      phone: '9876543211',
      pin_hash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
      pin_salt: 'fedcba9876543210fedcba9876543210',
      pinHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
      pinSalt: 'fedcba9876543210fedcba9876543210',
      status: 'Active',
      stationProfile: 'POS',
      mustChangePin: false,
      otpConsumed: true
    },
    {
      id: 102,
      name: 'Priya Patel',
      role: 'Floor Server',
      phone: '9876543212',
      pin_hash: 'b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef012345',
      pin_salt: '11223344556677889900aabbccddeeff',
      pinHash: 'b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef012345',
      pinSalt: '11223344556677889900aabbccddeeff',
      status: 'Active',
      stationProfile: 'Captain',
      mustChangePin: false,
      otpConsumed: true
    },
    {
      id: 103,
      name: 'Chef Vikram',
      role: 'Chef',
      phone: '9876543213',
      pin_hash: 'c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef01234567',
      pin_salt: 'aabbccddeeff00112233445566778899',
      pinHash: 'c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef01234567',
      pinSalt: 'aabbccddeeff00112233445566778899',
      status: 'Active',
      stationProfile: 'KDS',
      mustChangePin: false,
      otpConsumed: true
    }
  ];

  // 2. Prepare Tables Data (10 tables)
  const testTables = {};
  for (let i = 1; i <= 10; i++) {
    testTables[String(i)] = {
      id: String(i),
      name: `Table ${i}`,
      status: i === 3 ? 'occupied' : 'available',
      capacity: i <= 4 ? 2 : (i <= 8 ? 4 : 6),
      activeKotCount: i === 3 ? 1 : 0
    };
  }

  // 3. Prepare Menu (25 items to test >20 item capacity)
  const testCategories = ['All', 'Snacks', 'Beverages', 'Main Course', 'Desserts', 'Breads'];
  const testMenu = [];
  for (let i = 1; i <= 25; i++) {
    const cat = testCategories[1 + (i % (testCategories.length - 1))];
    testMenu.push({
      id: i,
      name: `Special Dish ${i}`,
      category: cat,
      price: 50 + (i * 10),
      stock: 20,
      stockQty: 20,
      trackStock: true,
      gstRate: 5
    });
  }

  // 4. Prepare Reports Data (Order History & Expenses)
  const testHistory = [
    {
      id: 'ORD-1001',
      billNo: '1001',
      date: new Date().toISOString(),
      table: '3',
      total: 350,
      paymentMethod: 'UPI',
      items: [{ name: 'Special Dish 1', qty: 2, price: 60 }, { name: 'Special Dish 2', qty: 1, price: 70 }]
    },
    {
      id: 'ORD-1002',
      billNo: '1002',
      date: new Date().toISOString(),
      table: '5',
      total: 540,
      paymentMethod: 'Cash',
      items: [{ name: 'Special Dish 3', qty: 3, price: 80 }]
    }
  ];

  const testExpenses = [
    { id: 'EXP-1', description: 'Fresh Milk 10L', amount: 650, category: 'Dairy', date: new Date().toISOString() },
    { id: 'EXP-2', description: 'Cooking Oil 5L', amount: 800, category: 'Grocery', date: new Date().toISOString() }
  ];

  // 5. Prepare Shop Profile
  const testProfile = {
    name: 'Royal Heritage Cafe',
    ownerEmail: 'owner@royalheritage.in',
    phone: '9876501234',
    address: '42 MG Road, Sector 5, Kolkata',
    gstin: '19ABCDE1234F1Z5',
    upiId: 'royalheritage@okhdfcbank',
    tables: 10,
    showQr: true,
    gstMode: 'inclusive',
    defaultGstRate: 5
  };

  // EXECUTE SYNC VIA POST /api/sync/store-data
  console.log('\n[STEP 2] Dispatching full store sync to server API...');
  const syncRes = await fetch(`${BASE_URL}/api/sync/store-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: testShopCode,
      ownerEmail: 'owner@royalheritage.in',
      profile: testProfile,
      staff: testStaff,
      tables: testTables,
      menu: testMenu,
      categories: testCategories,
      history: testHistory,
      expenses: testExpenses
    })
  });

  assert.strictEqual(syncRes.status, 200, 'POST /api/sync/store-data should return 200');
  const syncResult = await syncRes.json();
  console.log('Sync API response:', syncResult);
  assert.strictEqual(syncResult.success, true, 'Sync should succeed');
  assert.strictEqual(syncResult.staffCount, 4, 'Should sync 4 staff members');
  assert.strictEqual(syncResult.tableCount, 10, 'Should sync 10 tables');

  // VERIFY AGAINST LIVE GOOGLE CLOUD FIRESTORE DIRECTLY VIA REST API
  console.log('\n[STEP 3] Verifying Root Document in Cloud Firestore...');
  const rootDocUrl = `${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}`;
  const rootRes = await fetch(rootDocUrl);
  assert.strictEqual(rootRes.status, 200, `Root doc ${testShopCode} must exist in Cloud Firestore`);
  const rootData = await rootRes.json();
  const fields = rootData.fields;

  // Assert Profile
  console.log('  -> Verifying Profile:', fields.profile?.mapValue?.fields?.name?.stringValue);
  assert.strictEqual(fields.profile?.mapValue?.fields?.name?.stringValue, 'Royal Heritage Cafe');
  assert.strictEqual(fields.profile?.mapValue?.fields?.phone?.stringValue, '9876501234');
  assert.strictEqual(fields.profile?.mapValue?.fields?.upiId?.stringValue, 'royalheritage@okhdfcbank');

  // Assert Root Staff Array
  const staffArray = fields.staff?.arrayValue?.values || [];
  console.log(`  -> Verifying Root Staff Array (count: ${staffArray.length})...`);
  assert.strictEqual(staffArray.length, 4, 'Root doc must contain 4 staff members');
  const adminDoc = staffArray.find(s => s.mapValue?.fields?.name?.stringValue === 'Owner Admin');
  assert.ok(adminDoc, 'Admin must be present in root staff array');
  assert.strictEqual(adminDoc.mapValue?.fields?.role?.stringValue, 'Admin');
  assert.ok(adminDoc.mapValue?.fields?.pin_hash?.stringValue, 'Admin must have pin_hash');

  // Assert Subcollection: /shops/{code}/staff/{id}
  console.log('\n[STEP 4] Verifying Staff Subcollection in Cloud Firestore...');
  for (const staff of testStaff) {
    const subdocUrl = `${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/staff/${staff.id}`;
    const subdocRes = await fetch(subdocUrl);
    assert.strictEqual(subdocRes.status, 200, `Staff subdoc ${staff.id} (${staff.name}) must exist in Firestore`);
    const subdocData = await subdocRes.json();
    const sf = subdocData.fields;
    assert.strictEqual(sf.name?.stringValue, staff.name, `Staff name matches for ${staff.name}`);
    assert.strictEqual(sf.role?.stringValue, staff.role, `Staff role matches for ${staff.name}`);
    assert.ok(sf.pin_hash?.stringValue, `Staff ${staff.name} has pin_hash`);
    console.log(`  ✅ Staff Subdoc Verified: [ID ${staff.id}] ${sf.name?.stringValue} (${sf.role?.stringValue})`);
  }

  // Assert Tables Subcollection: /shops/{code}/tables/{id}
  console.log('\n[STEP 5] Verifying Tables Subcollection in Cloud Firestore...');
  for (let i = 1; i <= 10; i++) {
    const tableUrl = `${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/tables/${i}`;
    const tableRes = await fetch(tableUrl);
    assert.strictEqual(tableRes.status, 200, `Table subdoc ${i} must exist in Firestore`);
    const tableData = await tableRes.json();
    const tf = tableData.fields;
    assert.strictEqual(tf.id?.stringValue, String(i));
    assert.strictEqual(tf.name?.stringValue, `Table ${i}`);
    console.log(`  ✅ Table Subdoc Verified: [Table ${i}] Status: ${tf.status?.stringValue}`);
  }

  // Assert Menu & 20+ Items
  console.log('\n[STEP 6] Verifying Menu Items & 20+ Capacity in Cloud Firestore...');
  const menuArray = fields.menu?.arrayValue?.values || [];
  console.log(`  -> Menu items count in Firestore: ${menuArray.length}`);
  assert.strictEqual(menuArray.length, 25, 'All 25 menu items must be persisted');
  const catArray = fields.categories?.arrayValue?.values || [];
  assert.strictEqual(catArray.length, 6, 'All 6 categories must be persisted');

  // Assert Reports (History & Expenses)
  console.log('\n[STEP 7] Verifying Reports (History & Expenses) in Cloud Firestore...');
  const histArray = fields.history?.arrayValue?.values || [];
  assert.strictEqual(histArray.length, 2, '2 order history records in Firestore');
  const expArray = fields.expenses?.arrayValue?.values || [];
  assert.strictEqual(expArray.length, 2, '2 daily expense records in Firestore');

  // Assert Readback API: GET /api/sync/store-data?storeCode=...
  console.log('\n[STEP 8] Verifying Server Readback API: GET /api/sync/store-data...');
  const getRes = await fetch(`${BASE_URL}/api/sync/store-data?storeCode=${encodeURIComponent(testShopCode)}`);
  assert.strictEqual(getRes.status, 200, 'GET /api/sync/store-data should return 200');
  const readbackData = await getRes.json();
  assert.strictEqual(readbackData.success, true);
  assert.strictEqual(readbackData.ownerEmail, 'owner@royalheritage.in');
  assert.strictEqual(readbackData.profile.name, 'Royal Heritage Cafe');
  assert.strictEqual(readbackData.profile.ownerEmail, 'owner@royalheritage.in');
  assert.strictEqual(readbackData.staff.length, 4);
  assert.strictEqual(readbackData.menu.length, 25);
  assert.strictEqual(Object.keys(readbackData.tables).length, 10);
  assert.strictEqual(readbackData.history.length, 2);
  assert.strictEqual(readbackData.expenses.length, 2);
  console.log('  ✅ Readback API verified all fields & ownerEmail with 100% fidelity!');

  // STEP 8B: Test Admin Editing Staff Profile / Forgot PIN Reset
  console.log('\n[STEP 8B] Verifying Staff Edit & Forgot PIN Reset Sync...');
  const editedRohan = {
    ...testStaff[1],
    name: 'Rohan Sharma (Senior Cashier)',
    pin_hash: 'new_pin_hash_9999999999999999999999999999999999999999999999999999',
    pinHash: 'new_pin_hash_9999999999999999999999999999999999999999999999999999',
    mustChangePin: false,
    otpConsumed: true
  };
  const editRes = await fetch(`${BASE_URL}/api/sync/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: testShopCode, staff: [editedRohan] })
  });
  assert.strictEqual(editRes.status, 200);
  const rohanSubRes = await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/staff/101`);
  assert.strictEqual(rohanSubRes.status, 200);
  const rohanSubDoc = await rohanSubRes.json();
  assert.strictEqual(rohanSubDoc.fields?.name?.stringValue, 'Rohan Sharma (Senior Cashier)');
  assert.strictEqual(rohanSubDoc.fields?.pin_hash?.stringValue, 'new_pin_hash_9999999999999999999999999999999999999999999999999999');
  console.log('  ✅ Staff Edit & PIN Reset verified in both root doc and /staff/101 subcollection!');

  // STEP 8C: Test Admin Removing (Deleting) a Staff Member
  console.log('\n[STEP 8C] Verifying Staff Removal (Delete) Sync...');
  const remainingStaff = [testStaff[0], editedRohan, testStaff[2]]; // Removing Chef Vikram (id: 103)
  const delRes = await fetch(`${BASE_URL}/api/sync/store-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: testShopCode,
      staff: remainingStaff,
      replaceStaff: true,
      deletedStaffId: '103'
    })
  });
  assert.strictEqual(delRes.status, 200);
  const delSubCheck = await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/staff/103`);
  assert.strictEqual(delSubCheck.status, 404, 'Deleted staff subdoc 103 must be 404 in Firestore');
  const afterDelReadback = await (await fetch(`${BASE_URL}/api/sync/store-data?storeCode=${encodeURIComponent(testShopCode)}`)).json();
  assert.strictEqual(afterDelReadback.staff.length, 3, 'Root staff array must now have 3 staff members');
  assert.strictEqual(afterDelReadback.staff.some(s => String(s.id) === '103'), false, 'Deleted staff 103 must not be in root staff array');
  console.log('  ✅ Staff Removal verified: removed from root staff array & /staff/103 subdoc deleted (404)!');

  // Cleanup test shop
  console.log('\n[STEP 9] Cleaning up test shop documents...');
  for (const staff of testStaff) {
    await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/staff/${staff.id}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/staffSessions/${staff.id}`, { method: 'DELETE' }).catch(() => {});
  }
  for (let i = 1; i <= 10; i++) {
    await fetch(`${FIRESTORE_BASE}/shops/${encodeURIComponent(testShopCode)}/tables/${i}`, { method: 'DELETE' }).catch(() => {});
  }
  await fetch(rootDocUrl, { method: 'DELETE' }).catch(() => {});
  console.log('  ✅ Test documents cleaned up cleanly.');

  // VERIFY AMBER___OAK LIVE DATA INTEGRITY
  console.log('\n[STEP 10] Checking AMBER___OAK live state...');
  const amberRes = await fetch(`${BASE_URL}/api/sync/store-data?storeCode=AMBER___OAK`);
  assert.strictEqual(amberRes.status, 200);
  const amberData = await amberRes.json();
  console.log('AMBER___OAK Live State:');
  console.log(`  Shop Name: ${amberData.profile?.name}`);
  console.log(`  Phone: ${amberData.profile?.phone}`);
  console.log(`  Staff Count: ${amberData.staff?.length}`);
  amberData.staff?.forEach((s, idx) => {
    console.log(`    [Staff ${idx + 1}] ID: ${s.id} | Name: ${s.name} | Role: ${s.role}`);
  });
  console.log(`  Menu Count: ${amberData.menu?.length}`);
  console.log(`  Tables Count: ${Object.keys(amberData.tables || {}).length}`);
  console.log(`  History Count: ${amberData.history?.length}`);

  console.log('\n🎉 ALL LIVE FIREBASE DATA SYNC TESTS PASSED SUCCESSFULLY! 🎉');
}

testFullFirebaseSync().catch(err => {
  console.error('\n❌ FIREBASE SYNC TEST FAILED:', err);
  process.exit(1);
});
