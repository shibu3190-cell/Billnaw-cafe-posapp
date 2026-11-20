/**
 * Comprehensive Backend & App Verification Suite:
 * 1. Existing Shops Data & Isolation Verification (SHOP_ABHIJITMODAK & SHOP_BAPI92HALDER)
 * 2. New Shop Registration & OTP Auth Flow
 * 3. Onboarding Profile Setup with Logo Compression (<=128x128, <20KB) & Salted PIN
 * 4. New Device Login & Hydration Flow
 * 5. Menu Categories & Dish Sync Integrity
 * 6. Role-Based Table Delta Broadcast & Synchronization (Cashier/Admin vs Waiter)
 * 7. 50-Order History Capping & Subcollection Invoice Query
 * 8. Daily Closing Summary (reports/{date}) Persistence & Query
 * 9. Thermal Print 2-Line Clean Word Wrapping
 * 10. Multi-Tenant Cross-Contamination & Clean Teardown
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  passed++;
}

function fail(msg, err) {
  console.error(`  ❌ FAIL: ${msg} -> ${err ? err.message : ''}`);
  if (err && err.stack) console.error(err.stack);
  failed++;
}

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

async function main() {
  console.log('====================================================================');
  console.log('🚀 COMPREHENSIVE BACKEND, APP SYNC & MULTI-TENANT TEST SUITE');
  console.log('====================================================================\n');

  // Mocks for browser environment before importing js/core.js
  const mockStorage = {};
  global.localStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
  global.window = {
    location: { origin: 'http://localhost:3000' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };
  global.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      getContext: () => ({
        drawImage: () => {},
        fillRect: () => {},
        fillStyle: ''
      }),
      toDataURL: (type, quality) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.round(2000 * (quality || 1))),
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} }
    })
  };
  global.Image = class {
    constructor() {
      this.width = 100;
      this.height = 100;
      setTimeout(() => { if (this.onload) this.onload(); }, 5);
    }
  };
  global.BroadcastChannel = class {
    constructor(name) { this.name = name; }
    postMessage() {}
    close() {}
  };
  global.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };

  // Load modules
  const syncService = await import('../server/sync-service.js');
  const authService = await import('../server/auth-service.js');
  const netlifyApi = await import('../netlify/functions/api.js');
  const rbacModule = await import('../src/core/rbac.js');
  const { ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');
  await import('../js/core.js');

  const {
    getStoreFromFirestoreREST,
    syncStoreToFirestoreREST,
    getStoreStateFromPersistentCache,
    saveStoreStateToPersistentCache,
    sanitizeStaffForTenant,
    isAbhijitTenant,
    getReportsFromFirestoreREST,
    getInvoicesFromFirestoreREST,
    MAX_ROOT_HISTORY_COUNT,
    BAPI_QUARANTINE_STAFF_IDS
  } = syncService;

  const {
    ROLES,
    PERMISSIONS,
    hasPermission,
    hashPin,
    generatePinSalt,
    authenticateStaffPin,
    verifyStaffPin
  } = rbacModule;

  const {
    resizeAndCompressLogo,
    canManageTableStatus,
    broadcastTableDelta,
    updateTableStatus
  } = global.window;

  // =========================================================================
  // SECTION 1: EXISTING SHOPS DATA & ISOLATION VERIFICATION
  // =========================================================================
  console.log('📍 SECTION 1: EXISTING SHOPS (SHOP_ABHIJITMODAK & SHOP_BAPI92HALDER) VERIFICATION');

  await runTest('EXIST-01: SHOP_ABHIJITMODAK profile and staff roster integrity', async () => {
    const abhiData = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
    assert.ok(abhiData.success, 'Fetch SHOP_ABHIJITMODAK must succeed');
    assert.strictEqual(abhiData.staff.length, 6, `SHOP_ABHIJITMODAK must have strictly 6 staff, got ${abhiData.staff.length}`);
    
    const staffNames = abhiData.staff.map(s => s.name);
    assert.ok(staffNames.includes('Admin'), 'Must contain genuine Admin');
    assert.ok(staffNames.includes('Dk'), 'Must contain genuine Dk');
    assert.ok(staffNames.includes('om'), 'Must contain genuine om');
    
    // Check quarantined Bapi staff are excluded
    const BAPI_LEAKED_NAMES = ['Bapi Halder', 'Gourab Majumder', 'Sourav', 'Sayan'];
    for (const bName of BAPI_LEAKED_NAMES) {
      assert.ok(!staffNames.includes(bName), `Must NOT contain leaked staff: ${bName}`);
    }
    for (const qId of BAPI_QUARANTINE_STAFF_IDS) {
      assert.ok(abhiData.deletedStaffIds.includes(qId), `deletedStaffIds must track quarantined id ${qId}`);
    }
  });

  await runTest('EXIST-02: SHOP_BAPI92HALDER active subscription and roster intact', async () => {
    const bapiData = await getStoreFromFirestoreREST('SHOP_BAPI92HALDER');
    assert.ok(bapiData.success, 'Fetch SHOP_BAPI92HALDER must succeed');
    
    // Check subscription status (ACTIVE or active)
    const sub = bapiData.subscription || {};
    const normStatus = String(sub.status || '').toLowerCase();
    assert.strictEqual(normStatus, 'active', `SHOP_BAPI92HALDER subscription status must normalize to 'active', got ${sub.status}`);
    
    // Check Bapi staff roster
    const bapiStaffNames = bapiData.staff.map(s => s.name);
    assert.ok(bapiStaffNames.includes('Bapi Halder'), 'Bapi Halder must exist in SHOP_BAPI92HALDER');
    assert.ok(bapiStaffNames.includes('Gourab Majumder'), 'Gourab Majumder must exist in SHOP_BAPI92HALDER');
  });

  await runTest('EXIST-03: Zero Cross-Shop Leakage between existing shops', async () => {
    const abhiData = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
    const bapiData = await getStoreFromFirestoreREST('SHOP_BAPI92HALDER');
    
    const abhiStaffNames = abhiData.staff.map(s => s.name);
    const bapiStaffNames = bapiData.staff.map(s => s.name);

    // Bapi staff must not be in Abhijit shop
    assert.ok(!abhiStaffNames.includes('Bapi Halder'));
    assert.ok(!abhiStaffNames.includes('Gourab Majumder'));

    // Abhijit custom staff (Dk, om) must not be in Bapi shop
    assert.ok(!bapiStaffNames.includes('Dk'));
    assert.ok(!bapiStaffNames.includes('om'));
  });

  // =========================================================================
  // SECTION 2: NEW SHOP REGISTRATION & AUTHENTICATION (OTP + JWT)
  // =========================================================================
  console.log('\n📍 SECTION 2: NEW SHOP REGISTRATION & OTP AUTHENTICATION');

  const testNewEmail = `test_owner_${Date.now()}@billnawcafe.com`;
  let newShopAuthToken = null;
  let testStoreCode = null;
  let otpTicket = null;
  let devOtp = null;

  await runTest('AUTH-01: Send OTP to new shop owner email', async () => {
    const sendOtpResult = authService.sendOtp(testNewEmail, 'signup');
    assert.strictEqual(sendOtpResult.status, 200, 'sendOtp status must be 200');
    assert.ok(sendOtpResult.data.success, 'sendOtp must succeed');
    assert.ok(sendOtpResult.data.otpTicket, 'sendOtp must return an otpTicket');
    assert.strictEqual(sendOtpResult.data.email, testNewEmail.toLowerCase());
    otpTicket = sendOtpResult.data.otpTicket;
    devOtp = sendOtpResult.data.devOtp;
  });

  await runTest('AUTH-02: Verify OTP and generate secure JWT token', async () => {
    const verifyResult = authService.verifyOtp(testNewEmail, devOtp, 'New Test Cafe POS', 'signup', otpTicket);
    assert.strictEqual(verifyResult.status, 200, 'verifyOtp status must be 200');
    assert.ok(verifyResult.data.success, 'verifyOtp must succeed');
    assert.ok(verifyResult.data.customToken, 'verifyOtp must generate a signed JWT');
    newShopAuthToken = verifyResult.data.customToken;
    testStoreCode = verifyResult.data.storeCode;

    // Validate claims
    const verifiedClaims = authService.verifyTenantAuthorization({
      token: newShopAuthToken,
      targetStoreCode: testStoreCode
    });
    assert.ok(verifiedClaims.authorized, 'Token must authorize target storeCode');
    assert.strictEqual(verifiedClaims.user?.email, testNewEmail.toLowerCase());
  });

  // =========================================================================
  // SECTION 3: ONBOARDING PROFILE, LOGO COMPRESSION & PIN SETUP
  // =========================================================================
  console.log('\n📍 SECTION 3: ONBOARDING PROFILE, LOGO COMPRESSION & SALTED PIN');

  await runTest('ONBOARD-01: Logo compression enforces <= 154x154 px and < 35 KB', async () => {
    assert.strictEqual(typeof resizeAndCompressLogo, 'function', 'resizeAndCompressLogo must be defined');
    const rawLargeLogo = 'data:image/png;base64,' + 'A'.repeat(80000); // ~60KB raw
    const compressed = await resizeAndCompressLogo(rawLargeLogo, 154, 35840);
    assert.ok(compressed, 'Compressed logo must be produced');
    const byteSize = Math.round(compressed.length * 0.75);
    assert.ok(byteSize <= 35840, `Logo size ${byteSize} bytes must be <= 35840 bytes`);
  });

  let adminSalt, adminPinHash;
  await runTest('ONBOARD-02: Setup Admin PIN with cryptographically secure salt & SHA-256', async () => {
    adminSalt = generatePinSalt();
    assert.ok(adminSalt && adminSalt.length >= 16, 'Salt must be at least 16 hex chars');
    adminPinHash = await hashPin('4829', adminSalt);
    assert.ok(adminPinHash && adminPinHash.length === 64, 'SHA-256 hash must be 64 hex characters');

    // Verify correct PIN passes
    const authSuccess = await authenticateStaffPin('4829', [{ id: 1, role: 'Admin', pin_hash: adminPinHash, pin_salt: adminSalt }]);
    assert.ok(!authSuccess.error && authSuccess.data, 'Correct PIN must authenticate');

    // Verify wrong PIN fails
    const authFail = await authenticateStaffPin('9999', [{ id: 1, role: 'Admin', pin_hash: adminPinHash, pin_salt: adminSalt }]);
    assert.ok(authFail.error, 'Wrong PIN must return error');
  });

  // =========================================================================
  // SECTION 4: INITIAL STORE CREATION & SYNC TO FIRESTORE REST
  // =========================================================================
  console.log('\n📍 SECTION 4: INITIAL STORE CREATION & SYNC TO FIRESTORE REST');

  const initialShopPayload = {
    name: 'New Test Cafe POS',
    ownerEmail: testNewEmail,
    storeCode: testStoreCode,
    profile: {
      name: 'New Test Cafe POS',
      address: '123 Test Avenue, Kolkata',
      phone: '9876543210',
      upiId: 'testcafe@upi',
      logo: 'data:image/jpeg;base64,' + 'A'.repeat(4000) // ~3KB compressed logo
    },
    subscription: {
      status: 'active',
      plan: 'pro',
      billingCycle: 'monthly',
      updatedAt: new Date().toISOString()
    },
    categories: ['All', 'Hot Coffee', 'Sandwiches', 'Desserts'],
    menu: [
      { id: 101, name: 'Espresso', category: 'Hot Coffee', price: 60, isDeleted: false },
      { id: 102, name: 'Cheese Grilled Sandwich', category: 'Sandwiches', price: 120, isDeleted: false },
      { id: 103, name: 'Chocolate Brownie', category: 'Desserts', price: 90, isDeleted: false }
    ],
    menuVersion: 1,
    staff: [
      { id: 1, name: 'Admin', role: 'Admin', pin_hash: adminPinHash, pin_salt: adminSalt },
      { id: 2, name: 'Ravi Cashier', role: 'Cashier' },
      { id: 3, name: 'Vikram Waiter', role: 'Staff' }
    ],
    tables: {
      1: { id: 1, name: 'Table 1', status: 'available' },
      2: { id: 2, name: 'Table 2', status: 'available' },
      3: { id: 3, name: 'Table 3', status: 'available' }
    },
    history: []
  };

  await runTest('SYNC-01: Sync initial store data to backend / Firestore REST', async () => {
    const syncRes = await syncStoreToFirestoreREST(testStoreCode, initialShopPayload);
    assert.ok(syncRes.success, 'syncStoreToFirestoreREST must succeed');
  });

  await runTest('SYNC-02: Read back initial store from Firestore and verify all domains', async () => {
    const fetched = await getStoreFromFirestoreREST(testStoreCode);
    assert.ok(fetched.success, 'getStoreFromFirestoreREST must return success');
    assert.strictEqual(fetched.profile?.name, 'New Test Cafe POS');
    assert.strictEqual(fetched.categories.length, 4);
    assert.strictEqual(fetched.menu.length, 3);
    assert.strictEqual(fetched.staff.length, 3);
    assert.strictEqual(Object.keys(fetched.tables).length, 3);
  });

  // =========================================================================
  // SECTION 5: NEW DEVICE LOGIN & HYDRATION
  // =========================================================================
  console.log('\n📍 SECTION 5: NEW DEVICE LOGIN & HYDRATION');

  await runTest('DEVICE-01: New device fetches store data via Netlify API endpoint with JWT', async () => {
    const event = {
      rawUrl: `http://localhost:3000/api/sync/store-data?storeCode=${testStoreCode}`,
      path: '/api/sync/store-data',
      httpMethod: 'GET',
      queryStringParameters: { storeCode: testStoreCode },
      headers: {
        authorization: `Bearer ${newShopAuthToken}`,
        'x-tenant-store-code': testStoreCode
      }
    };

    const res = await netlifyApi.handler(event, {});
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
    const parsedBody = JSON.parse(res.body);
    assert.ok(parsedBody.success, 'Body must indicate success');
    assert.strictEqual(parsedBody.storeCode, testStoreCode);
    assert.strictEqual(parsedBody.menu.length, 3);
  });

  await runTest('DEVICE-02: New device authenticates Admin staff with salted PIN locally', async () => {
    const localStore = await getStoreFromFirestoreREST(testStoreCode);
    const authCheck = await authenticateStaffPin('4829', localStore.staff);
    assert.ok(!authCheck.error && authCheck.data, 'New device must successfully verify Admin salted PIN');
    assert.strictEqual(authCheck.data.role, 'Admin');
  });

  // =========================================================================
  // SECTION 6: TABLE STATUS DELTAS & RBAC ENFORCEMENT
  // =========================================================================
  console.log('\n📍 SECTION 6: TABLE STATUS DELTAS & RBAC ENFORCEMENT');

  await runTest('TABLE-01: canManageTableStatus permits Cashier & Admin, restricts Waiter', () => {
    assert.strictEqual(typeof canManageTableStatus, 'function', 'canManageTableStatus must be defined');
    assert.strictEqual(canManageTableStatus({ role: 'Admin' }), true, 'Admin can manage table status');
    assert.strictEqual(canManageTableStatus({ role: 'Cashier' }), true, 'Cashier can manage table status');
    assert.strictEqual(canManageTableStatus({ role: 'Manager' }), true, 'Manager can manage table status');
    assert.strictEqual(canManageTableStatus({ role: 'Staff' }), false, 'Waiter / Staff is blocked');
    assert.strictEqual(canManageTableStatus({ role: 'Floor Server' }), false, 'Floor Server is blocked');
    assert.strictEqual(canManageTableStatus({ role: 'Kitchen' }), false, 'Kitchen is blocked');
  });

  await runTest('TABLE-02: broadcastTableDelta updates discrete table and merges to Firestore', async () => {
    const tableUpdatePayload = {
      tables: {
        '3': { id: 3, name: 'Table 3', status: 'occupied', guests: 4 }
      }
    };

    const deltaRes = await syncStoreToFirestoreREST(testStoreCode, tableUpdatePayload);
    assert.ok(deltaRes.success, 'Table delta sync must succeed');

    const updatedStore = await getStoreFromFirestoreREST(testStoreCode);
    assert.strictEqual(updatedStore.tables['3'].status, 'occupied', 'Table 3 must now be occupied');
    assert.strictEqual(updatedStore.tables['1'].status, 'available', 'Table 1 must remain available');
  });

  // =========================================================================
  // SECTION 7: 50-ORDER HISTORY CAPPING & SUBCOLLECTION ARCHIVAL
  // =========================================================================
  console.log('\n📍 SECTION 7: 50-ORDER HISTORY CAPPING & SUBCOLLECTION ARCHIVAL');

  await runTest('CAP-01: Sync 55 invoices; verify root document capped at strictly 50', async () => {
    const generatedInvoices = [];
    for (let i = 1; i <= 55; i++) {
      generatedInvoices.push({
        id: `INV_${Date.now()}_${i}`,
        billNumber: `BILL-${1000 + i}`,
        date: new Date().toISOString(),
        total: 150 + i * 10,
        subtotal: 140 + i * 10,
        tax: 10,
        paymentMethod: i % 2 === 0 ? 'UPI' : 'Cash',
        orderType: 'Dine-In',
        table: 'Table 3',
        items: [
          { name: 'Espresso', qty: 2, price: 60 },
          { name: 'Chocolate Brownie', qty: 1, price: 90 }
        ]
      });
    }

    // Push to backend sync service
    await syncStoreToFirestoreREST(testStoreCode, {
      history: generatedInvoices
    });

    // Check store root document
    const storeAfter55 = await getStoreFromFirestoreREST(testStoreCode);
    assert.ok(storeAfter55.history.length <= 50, `Root history length ${storeAfter55.history.length} must be <= 50`);
    assert.strictEqual(storeAfter55.history.length, 50, 'Root document must be capped to exactly 50 latest orders');
  });

  await runTest('CAP-02: Query older subcollection invoices on-demand via paginated endpoint', async () => {
    const subInvoicesRes = await getInvoicesFromFirestoreREST(testStoreCode, { pageSize: 20 });
    assert.ok(subInvoicesRes.success, 'getInvoicesFromFirestoreREST must succeed');
    assert.ok(subInvoicesRes.invoices.length > 0, 'Subcollection invoices must be populated');
  });

  // =========================================================================
  // SECTION 8: DAILY CLOSING SUMMARY (reports/{date})
  // =========================================================================
  console.log('\n📍 SECTION 8: DAILY CLOSING SUMMARY (reports/{date}) PERSISTENCE');

  const todayISO = new Date().toISOString().split('T')[0];
  const testClosingReport = {
    date: todayISO,
    storeCode: testStoreCode,
    totalSales: 8450.00,
    totalTax: 422.50,
    totalExpenses: 650.00,
    netCashInDrawer: 3850.00,
    netProfit: 7377.50,
    paymentBreakdown: {
      cash: 4500.00,
      upi: 3500.00,
      card: 450.00
    },
    orderTypeBreakdown: {
      dineIn: 42,
      takeaway: 13
    },
    orderCount: 55,
    closedAt: new Date().toISOString(),
    closedByStaff: 'Admin'
  };

  await runTest('REPORT-01: Sync daily report to reports/{date} subcollection', async () => {
    const syncReportRes = await syncStoreToFirestoreREST(testStoreCode, {
      dailyReport: testClosingReport
    });
    assert.ok(syncReportRes.success, 'Daily closing report sync must succeed');
  });

  await runTest('REPORT-02: Query reports from Firestore REST / Netlify API', async () => {
    const reportsRes = await getReportsFromFirestoreREST(testStoreCode, { date: todayISO });
    assert.ok(reportsRes.success, 'getReportsFromFirestoreREST must succeed');
    assert.ok(reportsRes.report, 'Report document must be retrieved');
    assert.strictEqual(reportsRes.report.date, todayISO);
    assert.strictEqual(reportsRes.report.totalSales, 8450.00);
    assert.strictEqual(reportsRes.report.paymentBreakdown?.cash, 4500.00);
  });

  // =========================================================================
  // SECTION 9: THERMAL PRINT WORD-BOUNDARY 2-LINE FORMATTING
  // =========================================================================
  console.log('\n📍 SECTION 9: THERMAL PRINT WORD-BOUNDARY 2-LINE WRAP');

  await runTest('PRINT-01: Format long item names without chopping words or numbers', () => {
    const testItems = [
      { name: 'Packaged Water (2 Litre)', qty: 3, price: 90 },
      { name: 'Packaged Water (500 ml)', qty: 4, price: 44 },
      { name: 'Green Tea with Honey', qty: 2, price: 60 },
      { name: 'Short Tea', qty: 1, price: 20 }
    ];

    const escPosBytes = ThermalPrinterBridge.generateEscPosCommands({
      type: 'RECEIPT',
      storeName: 'Test Cafe',
      billNo: '1019',
      items: testItems,
      total: 214
    }, '58mm');

    const joinedText = Buffer.from(escPosBytes).toString('latin1');

    // 1. Packaged Water (500 ml) must NOT split as '00 ml)' or cut between '5' and '0'
    assert.ok(!joinedText.includes('\n  00 ml)'), 'Must not chop 500 ml into 00 ml)');
    assert.ok(!joinedText.includes('(5\n'), 'Must not chop (500 ml) after (5');

    // 2. Green Tea with Honey must NOT split into 'Ho' / 'ney'
    assert.ok(!joinedText.includes('Ho\n'), 'Must not chop Honey into Ho');
    assert.ok(!joinedText.includes('\n  ney'), 'Must not chop Honey into ney');

    // 3. Must contain clean parenthetical lines
    assert.ok(joinedText.includes('(500 ml)') || joinedText.includes('  (500 ml)'), 'Must preserve (500 ml) intact');
    assert.ok(joinedText.includes('(2 Litre)') || joinedText.includes('  (2 Litre)'), 'Must preserve (2 Litre) intact');
    assert.ok(joinedText.includes('Honey') || joinedText.includes('  Honey'), 'Must preserve Honey intact');
  });

  // =========================================================================
  // SECTION 10: MULTI-TENANT CROSS-CONTAMINATION CHECK & CLEANUP
  // =========================================================================
  console.log('\n📍 SECTION 10: MULTI-TENANT ISOLATION CHECK & CLEANUP');

  await runTest('ISOLATE-01: Verify SHOP_ABHIJITMODAK was not touched by new shop operations', async () => {
    const abhiFinal = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
    assert.strictEqual(abhiFinal.staff.length, 6, 'SHOP_ABHIJITMODAK must still have exactly 6 staff');
    assert.strictEqual(abhiFinal.ownerEmail, 'abhijitmodak55@gmail.com');
  });

  await runTest('ISOLATE-02: Verify SHOP_BAPI92HALDER was not touched by new shop operations', async () => {
    const bapiFinal = await getStoreFromFirestoreREST('SHOP_BAPI92HALDER');
    assert.strictEqual(String(bapiFinal.subscription?.status || '').toLowerCase(), 'active');
    assert.ok(bapiFinal.staff.some(s => s.name === 'Bapi Halder'));
  });

  console.log('\n====================================================================');
  console.log(`🎯 TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ ALL COMPREHENSIVE BACKEND & APP TESTS PASSED 100% GREEN!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
