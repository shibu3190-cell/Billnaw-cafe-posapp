// scratch/test_cloud_dual_path_and_listeners.cjs
// Automated verification suite for Milestone 1 Cloud & Security Backbone

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passCount = 0;
let failCount = 0;

function pass(name) {
  console.log(`  ✅ PASS: ${name}`);
  passCount++;
}

function fail(name, err) {
  console.error(`  ❌ FAIL: ${name}`, err);
  failCount++;
}

async function runTests() {
  console.log('====================================================================');
  console.log('🚀 RUNNING CLOUD BACKBONE, DUAL-PATH & LISTENER VERIFICATION SUITE');
  console.log('====================================================================\n');

  // 1. Dual-Path Tenant Resolution
  console.log('📍 SECTION 1: DUAL-PATH RESOLUTION & PATH GENERATION (src/core/db-client.js)');
  try {
    const {
      resolveTenantRoot,
      getTenantPath,
      getShopPath,
      getCafePath,
      getDbClient,
      subscribeDevices,
      subscribeSessions,
      subscribeStaff,
      setTenantDevice,
      setTenantSession,
      setTenantStaffMember
    } = await import('../src/core/db-client.js');

    assert.strictEqual(resolveTenantRoot('SHOP-BILLNAW-01'), 'shops');
    assert.strictEqual(resolveTenantRoot('shop_downtown'), 'shops');
    assert.strictEqual(resolveTenantRoot('CLIENT-PRO-01'), 'clients');
    assert.strictEqual(resolveTenantRoot('BONGBHOJ-TERMINAL'), 'clients');
    assert.strictEqual(resolveTenantRoot('cafe_billnaw_kolkata_01'), 'cafes');
    assert.strictEqual(resolveTenantRoot(''), 'cafes');
    pass('resolveTenantRoot correctly maps tenant IDs to root collections');

    assert.strictEqual(getTenantPath('devices', 'SHOP-BILLNAW-01'), 'shops/SHOP-BILLNAW-01/devices');
    assert.strictEqual(getTenantPath('sessions', 'cafe_billnaw_kolkata_01'), 'cafes/cafe_billnaw_kolkata_01/sessions');
    assert.strictEqual(getTenantPath('staff', 'BONGBHOJ-TERMINAL'), 'clients/BONGBHOJ-TERMINAL/staff');
    assert.strictEqual(getTenantPath('', 'SHOP-BILLNAW-01'), 'shops/SHOP-BILLNAW-01');
    assert.strictEqual(getShopPath('devices', 'TEST_SHOP'), 'shops/TEST_SHOP/devices');
    assert.strictEqual(getCafePath('tables', 'TEST_CAFE'), 'cafes/TEST_CAFE/tables');
    pass('getTenantPath, getShopPath, getCafePath generate compliant dual-path collection URIs');

    // 2. Real-Time Snapshot Listener Subscriptions on In-Memory Store
    console.log('\n📍 SECTION 2: REAL-TIME SUBSCRIBER NOTIFICATIONS ON IN-MEMORY STORE');
    let devicesReceived = null;
    let sessionsReceived = null;
    let staffReceived = null;

    const unsubDevices = await subscribeDevices((docs) => {
      devicesReceived = docs;
    }, null, 'SHOP-BILLNAW-01');

    const unsubSessions = await subscribeSessions((docs) => {
      sessionsReceived = docs;
    }, null, 'SHOP-BILLNAW-01');

    const unsubStaff = await subscribeStaff((docs) => {
      staffReceived = docs;
    }, null, 'SHOP-BILLNAW-01');

    assert.ok(Array.isArray(devicesReceived), 'Initial devices subscriber received array');
    assert.ok(Array.isArray(sessionsReceived), 'Initial sessions subscriber received array');
    assert.ok(Array.isArray(staffReceived), 'Initial staff subscriber received array');
    pass('Subscribers attach and receive initial snapshot envelopes');

    // Write device record
    await setTenantDevice('DEV-TEST-001', {
      deviceId: 'DEV-TEST-001',
      deviceName: 'Counter 2',
      stationProfile: 'BILLING_COUNTER',
      status: 'APPROVED',
      isMaster: false
    }, 'SHOP-BILLNAW-01');

    assert.ok(devicesReceived.some(d => d.deviceId === 'DEV-TEST-001' && d.deviceName === 'Counter 2'), 'Subscriber notified of device addition');
    pass('Device subscriber receives real-time updates upon setTenantDevice');

    // Write session record
    await setTenantSession('sess_001', {
      sessionId: 'sess_001',
      staffId: 2,
      staffName: 'Priya',
      status: 'ONLINE'
    }, 'SHOP-BILLNAW-01');

    assert.ok(sessionsReceived.some(s => s.sessionId === 'sess_001' && s.staffName === 'Priya'), 'Subscriber notified of session creation');
    pass('Session subscriber receives real-time updates upon setTenantSession');

    // Write staff record
    await setTenantStaffMember(2, {
      id: 2,
      name: 'Priya Sharma',
      role: 'Cashier',
      status: 'Active'
    }, 'SHOP-BILLNAW-01');

    assert.ok(staffReceived.some(st => String(st.id) === '2' && st.name === 'Priya Sharma'), 'Subscriber notified of staff update');
    pass('Staff subscriber receives real-time updates upon setTenantStaffMember');

    // Clean up subscriptions
    unsubDevices();
    unsubSessions();
    unsubStaff();
    pass('Unsubscribe functions execute cleanly');
  } catch (err) {
    fail('SECTION 1 & 2: db-client.js', err);
  }

  // 3. Client Core JS Integration Check
  console.log('\n📍 SECTION 3: JS/CORE.JS CLOUD SYNC & DUAL-PATH RESOLUTION');
  try {
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    };
    global.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    };
    global.localStorage = {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    };
    global.CustomEvent = class {
      constructor(type, init) {
        this.type = type;
        this.detail = init ? init.detail : null;
      }
    };

    require('../js/core.js');

    assert.strictEqual(typeof global.window.getStoreCollectionName, 'function');
    assert.strictEqual(global.window.getStoreCollectionName('SHOP-BILLNAW-01'), 'shops');
    assert.strictEqual(global.window.getStoreCollectionName('cafe_billnaw_kolkata_01'), 'cafes');
    assert.strictEqual(global.window.getStoreCollectionName('BONGBHOJ-TERMINAL'), 'clients');
    pass('js/core.js getStoreCollectionName cleanly supports shops, cafes, and legacy clients');

    assert.strictEqual(typeof global.window.subscribeDevicesCloudListener, 'function');
    assert.strictEqual(typeof global.window.subscribeSessionsCloudListener, 'function');
    assert.strictEqual(typeof global.window.subscribeStaffCloudListener, 'function');
    assert.strictEqual(typeof global.window.syncDeviceRecordToCloud, 'function');
    assert.strictEqual(typeof global.window.syncSessionRecordToCloud, 'function');
    assert.strictEqual(typeof global.window.syncStaffRecordToCloud, 'function');
    pass('js/core.js defines real-time cloud sync listeners and sync methods on window');
  } catch (err) {
    fail('SECTION 3: js/core.js', err);
  }

  // 4. Firestore Security Rules Anti-Tampering & Invariants Check
  console.log('\n📍 SECTION 4: FIRESTORE SECURITY RULES INTEGRITY & INVARIANTS');
  try {
    const rulesPaths = [
      path.resolve(__dirname, '../firestore.rules'),
      path.resolve(__dirname, '../database/firestore.rules')
    ];

    for (const rPath of rulesPaths) {
      const content = fs.readFileSync(rPath, 'utf8');
      assert.ok(content.includes('/cafes/{cafeId}'), `${rPath} contains /cafes/{cafeId}`);
      assert.ok(content.includes('/shops/{shopId}'), `${rPath} contains /shops/{shopId}`);
      assert.ok(content.includes('/clients/{clientId}'), `${rPath} contains /clients/{clientId}`);
      assert.ok(content.includes('isValidTenant(id)'), `${rPath} defines isValidTenant(id)`);
      assert.ok(content.includes('match /invoices/{invoiceId}'), `${rPath} defines /invoices/{invoiceId}`);
      assert.ok(content.includes('allow delete: if false;'), `${rPath} forbids invoice deletion`);
      assert.ok(content.includes("request.resource.data.status == 'VOID'"), `${rPath} requires VOID status on update`);
      assert.ok(content.includes('request.resource.data.void_audit.void_reason is string'), `${rPath} mandates void_reason`);
      assert.ok(content.includes('match /tables/{tableId}'), `${rPath} defines /tables/{tableId}`);
      assert.ok(content.includes('match /devices/{deviceId}'), `${rPath} defines /devices/{deviceId}`);
      assert.ok(content.includes('match /sessions/{sessionId}'), `${rPath} defines /sessions/{sessionId}`);
      assert.ok(content.includes('match /staff/{staffId}'), `${rPath} defines /staff/{staffId}`);
      assert.ok(content.includes('match /kot/{kotId}'), `${rPath} defines /kot/{kotId}`);
    }
    pass('Both firestore.rules and database/firestore.rules contain all required invariants & subcollections');
  } catch (err) {
    fail('SECTION 4: Security Rules Integrity', err);
  }

  // 5. Remote Live Firestore Endpoint Verification (403 Fixed Verification)
  console.log('\n📍 SECTION 5: REMOTE FIRESTORE REST 403-FREE PERMISSION VERIFICATION');
  try {
    const base = 'https://firestore.googleapis.com/v1/projects/abhi-pro-cafe-pos/databases/ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda/documents';
    const shopRes = await fetch(base + '/shops/SHOP-BILLNAW-01').then(r => r.json());
    const cafeRes = await fetch(base + '/cafes/cafe_billnaw_kolkata_01').then(r => r.json());

    // Both should NOT return 403 PERMISSION_DENIED
    assert.notStrictEqual(shopRes?.error?.code, 403, 'Remote /shops must not return 403 PERMISSION_DENIED');
    assert.notStrictEqual(cafeRes?.error?.code, 403, 'Remote /cafes must not return 403 PERMISSION_DENIED');
    pass('Active Firestore remote database permits terminal access without 403 Permission Denied');
  } catch (err) {
    fail('SECTION 5: Remote Firestore Verification', err);
  }

  // Summary
  console.log('\n====================================================================');
  console.log(`🎯 VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('====================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
