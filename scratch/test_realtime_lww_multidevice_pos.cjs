/**
 * Comprehensive Verification Suite:
 * Real-Time Multi-Device POS Sync (Last-Edit-Wins), Role + Admin PIN Menu Management,
 * Table-Wise KOT / Delta KOT, Bluetooth-Aware Billing, Forgot Password OTP, and Firestore 429 Resilience.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('====================================================================');
  console.log('🚀 MULTI-DEVICE REAL-TIME LWW POS SYNC & KOT/BILLING VERIFICATION');
  console.log('====================================================================\n');

  const syncService = await import('../server/sync-service.js');
  const authService = await import('../server/auth-service.js');
  const rbacModule = await import('../src/core/rbac.js');

  const {
    syncStoreToFirestoreREST,
    getStoreFromFirestoreREST,
    jsonToFirestoreFields,
    firestoreValueToJson
  } = syncService;
  const {
    createSignedAuthToken,
    verifyTenantAuthorization,
    verifyEndpointAccess,
    requestPasswordResetOtp,
    resetPasswordWithOtp,
    loginWithPassword
  } = authService;
  const { ROLES, PERMISSIONS, hasPermission } = rbacModule;

  const coreSrc = fs.readFileSync(path.resolve(__dirname, '../js/core.js'), 'utf8');
  const posSrc = fs.readFileSync(path.resolve(__dirname, '../js/pos.js'), 'utf8');
  const menuSrc = fs.readFileSync(path.resolve(__dirname, '../js/menu.js'), 'utf8');
  const staffSrc = fs.readFileSync(path.resolve(__dirname, '../js/staff.js'), 'utf8');
  const settingsSrc = fs.readFileSync(path.resolve(__dirname, '../js/settings.js'), 'utf8');

  const originalFetch = global.fetch;

  try {
    // =========================================================================
    // SECTION 1: MENU ITEM ADD / EDIT / DELETE BY ADMIN, CASHIER & FLOOR STAFF (PIN)
    // =========================================================================
    console.log('📍 SECTION 1: ROLE & ADMIN-PIN MENU MANAGEMENT + LWW MENU SYNC');

    test('MENU-01: Admin, Manager, and Cashier hold MANAGE_MENU & VIEW_TABLES in RBAC and Backend', () => {
      assert.strictEqual(hasPermission(ROLES.ADMIN, PERMISSIONS.MANAGE_MENU), true);
      assert.strictEqual(hasPermission(ROLES.MANAGER, PERMISSIONS.MANAGE_MENU), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.MANAGE_MENU), true);
      assert.strictEqual(hasPermission(ROLES.CASHIER, PERMISSIONS.VIEW_TABLES), true);

      const cashierToken = createSignedAuthToken({ storeCode: 'SHOP_LWW_01', email: 'c@shop.com', role: 'Cashier' });
      const cashierAuth = verifyTenantAuthorization({ token: cashierToken, targetStoreCode: 'SHOP_LWW_01', allowGracefulMigration: false });
      const menuCheck = verifyEndpointAccess({
        authResult: cashierAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Cashier' } },
        requiredPermission: 'manage_menu'
      });
      assert.strictEqual(menuCheck.allowed, true, 'Cashier must be permitted to manage_menu on backend');
    });

    test('MENU-02: Floor Staff with 4-digit Admin PIN unlocks Menu management scoped to Cashier (never Admin escalation) and clears on lock/switch', () => {
      assert(staffSrc.includes("if (spotOverrideGrantMenuSession && authorizingManager && normalizeRole(authorizingManager.role) === 'Admin')"), 'confirmSpotManagerOverride must scope menu PIN session strictly to Admin PIN & grantMenuSession');
      assert(staffSrc.includes("sessionStorage.removeItem('billnaw_admin_pin_auth_until');"), 'unlockTerminal/lockTerminal/logoutStaff must clear PIN auth');
      assert(menuSrc.includes("sessionStorage.getItem('billnaw_admin_pin_auth_until')"), 'canCurrentStaffManageMenu must honor Admin PIN session');
      assert(coreSrc.includes("? 'Cashier'"), 'billnawFetch must scope PIN elevation to Cashier (manage_menu), never Admin');
      assert(settingsSrc.includes("grantMenuSession: tabId === 'menu'"), 'switchTab(menu) override must unlock menu session');
    });

    await asyncTest('MENU-03: Re-adding a deleted item strips its ID/Name from deletedMenuIds & deletedMenuNames tombstones', async () => {
      let lastPatchedRoot = null;
      global.fetch = async (url, opts = {}) => {
        if (opts.method === 'PATCH' && url.includes('/shops/SHOP_MENU_LWW?') && !url.includes('/menu_meta')) {
          lastPatchedRoot = JSON.parse(opts.body).fields;
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      const res = await syncStoreToFirestoreREST('SHOP_MENU_LWW', {
        menu: [
          { id: 'item_101', name: 'Masala Chai', price: 25, updatedAt: 2000 },
          { id: 'item_102', name: 'Cold Coffee', price: 90, updatedAt: 2000 }
        ],
        deletedMenuIds: ['item_101', 'item_999'],
        deletedMenuNames: ['masala chai', 'old burger'],
        menuVersion: 2000
      });

      assert.strictEqual(res.success, true);
      const patchedDeletedIds = firestoreValueToJson(lastPatchedRoot.deletedMenuIds);
      const patchedDeletedNames = firestoreValueToJson(lastPatchedRoot.deletedMenuNames);
      assert.deepStrictEqual(patchedDeletedIds, ['item_999'], 'Active item_101 must be stripped from deletedMenuIds');
      assert.deepStrictEqual(patchedDeletedNames, ['old burger'], 'Active masala chai must be stripped from deletedMenuNames');
    });

    test('MENU-04: Client handleRemoteFirestoreUpdate reconciles per-item menu edits via Last-Edit-Wins (updatedAt)', () => {
      assert(coreSrc.includes('const lTs = _parseMenuTs(lm?.updatedAt);'), 'handleRemoteFirestoreUpdate must parse local updatedAt');
      assert(coreSrc.includes('const rTs = _parseMenuTs(rm?.updatedAt);'), 'handleRemoteFirestoreUpdate must parse remote updatedAt');
      assert(coreSrc.includes('if (lm && lTs > 0 && lTs > rTs)'), 'Newer local item edit must win over older or un-timestamped remote snapshot');
    });

    // =========================================================================
    // SECTION 2: TABLE-WISE ORDER REAL-TIME SYNC ACROSS DEVICES (LAST EDIT WINS)
    // =========================================================================
    console.log('\n📍 SECTION 2: TABLE-WISE ORDER REAL-TIME SYNC (LAST EDIT WINS)');

    await asyncTest('TABLE-01: Concurrent multi-device table edits obey Last-Edit-Wins (updatedAt), block un-timestamped boot wipes & preserve KOT print counts', async () => {
      let existingFirestoreTables = {
        '4': {
          id: '4',
          name: 'Table 4',
          status: 'kot',
          occupied: true,
          updatedAt: 2000,
          items: [
            { id: 'i1', name: 'Cappuccino', price: 120, qty: 3, qtyKotPrinted: 2 },
            { id: 'i2', name: 'Croissant', price: 80, qty: 1, qtyKotPrinted: 1 }
          ],
          kotPrintedMap: { i1: 2, Cappuccino: 2, i2: 1, Croissant: 1 }
        }
      };
      let patchedTables = null;

      global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ fields: jsonToFirestoreFields({ tables: existingFirestoreTables }) })
          };
        }
        if (method === 'PATCH' && url.includes('/shops/SHOP_TBL_LWW?') && !url.includes('/tables/')) {
          const body = JSON.parse(opts.body);
          patchedTables = firestoreValueToJson(body.fields.tables);
          existingFirestoreTables = patchedTables;
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      // Case A0: Un-timestamped empty boot slot ({ items: [], status: 'empty' }) from a newly booted device must NOT wipe Table 4
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': { items: [], status: 'empty', savedTime: null, lastReminder: null }
        }
      });
      assert.strictEqual(patchedTables['4'].items.length, 2, 'Un-timestamped boot slot must NOT wipe active cloud order');

      // Case A: Stale packet from Device A (updatedAt: 1500 < existing 2000) arrives with old qty=1
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': {
            id: '4',
            name: 'Table 4',
            status: 'occupied',
            occupied: true,
            updatedAt: 1500,
            items: [{ id: 'i1', name: 'Cappuccino', price: 120, qty: 1, qtyKotPrinted: 0 }]
          }
        }
      });
      assert.strictEqual(patchedTables['4'].items.length, 2, 'Stale packet (t=1500) must NOT overwrite newer order (t=2000)');
      assert.strictEqual(patchedTables['4'].items[0].qty, 3, 'Newer qty=3 must be preserved');
      assert.strictEqual(patchedTables['4'].items[0].qtyKotPrinted, 2, 'KOT printed count must be preserved');

      // Case B: Newer edit from Device B (updatedAt: 3000 > existing 2000) adds Brownie and increments Cappuccino to 4
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': {
            id: '4',
            name: 'Table 4',
            status: 'occupied',
            occupied: true,
            updatedAt: 3000,
            items: [
              { id: 'i1', name: 'Cappuccino', price: 120, qty: 4, qtyKotPrinted: 2 },
              { id: 'i2', name: 'Croissant', price: 80, qty: 1, qtyKotPrinted: 1 },
              { id: 'i3', name: 'Walnut Brownie', price: 150, qty: 2, qtyKotPrinted: 0 }
            ]
          }
        }
      });
      assert.strictEqual(patchedTables['4'].items.length, 3, 'Newer edit (t=3000) must win and add 3rd item');
      assert.strictEqual(patchedTables['4'].items[0].qty, 4, 'Newer qty=4 must win');
      assert.strictEqual(patchedTables['4'].items[0].qtyKotPrinted, 2, 'Previously printed KOT qty=2 must be retained');
      assert.strictEqual(patchedTables['4'].status, 'kot', 'Table status remains kot while items have printed KOTs');

      // Case C: Cashier settles/clears Table 4 at clearedAt: 4000
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': {
            id: '4',
            name: 'Table 4',
            status: 'empty',
            occupied: false,
            items: [],
            kotPrintedMap: {},
            updatedAt: 4000,
            clearedAt: 4000
          }
        }
      });
      assert.strictEqual(patchedTables['4'].status, 'empty');
      assert.strictEqual(patchedTables['4'].items.length, 0);

      // Case D: Delayed/offline packet from before settlement (updatedAt: 3500 <= clearedAt: 4000) OR un-timestamped packet arrives
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': {
            id: '4',
            name: 'Table 4',
            status: 'kot',
            occupied: true,
            updatedAt: 3500,
            items: [{ id: 'i1', name: 'Cappuccino', price: 120, qty: 4, qtyKotPrinted: 2 }]
          }
        }
      });
      assert.strictEqual(patchedTables['4'].status, 'empty', 'Stale pre-settlement packet (t=3500 <= clearedAt=4000) must NOT resurrect settled table');
      assert.strictEqual(patchedTables['4'].items.length, 0);

      // Case E: Fresh order on Table 4 after settlement (updatedAt: 5000 > clearedAt: 4000)
      await syncStoreToFirestoreREST('SHOP_TBL_LWW', {
        tables: {
          '4': {
            id: '4',
            name: 'Table 4',
            status: 'occupied',
            occupied: true,
            updatedAt: 5000,
            items: [{ id: 'i9', name: 'Espresso', price: 90, qty: 1, qtyKotPrinted: 0 }]
          }
        }
      });
      assert.strictEqual(patchedTables['4'].status, 'occupied', 'New order (t=5000 > clearedAt=4000) opens Table 4 cleanly');
      assert.strictEqual(patchedTables['4'].items.length, 1);
      assert.strictEqual(patchedTables['4'].items[0].name, 'Espresso');
    });

    test('TABLE-02: Non-Admin dispatchBackendStoreSync strips queued Admin/Menu fields & skips 401/403 retry queue poisoning', () => {
      assert(coreSrc.includes('delete finalPayload.staff;'), 'dispatchBackendStoreSync must strip staff for non-Admin operational sync');
      assert(coreSrc.includes('delete finalPayload.menu;'), 'dispatchBackendStoreSync must strip menu when !canSyncMenu');
      assert(coreSrc.includes('else if (res && (res.status === 401 || res.status === 403))'), 'dispatchBackendStoreSync must not enqueue 401/403 responses into offline retry queue');
    });

    // =========================================================================
    // SECTION 3: TABLE-WISE KOT & DELTA KOT + BLUETOOTH PRINTER ROUTING
    // =========================================================================
    console.log('\n📍 SECTION 3: TABLE-WISE KOT, DELTA KOT & BLUETOOTH PRINTER ROUTING');

    test('KOT-01: Table-wise KOT delta tracking & single/dual Bluetooth printer readiness', () => {
      assert(posSrc.includes('function computeKotDelta(tableId)'), 'computeKotDelta delta calculator must exist in js/pos.js');
      assert(posSrc.includes('function markTableKotItemsPrinted(tableId)'), 'markTableKotItemsPrinted must exist in js/pos.js');
      assert(posSrc.includes('const slot1 = bridge?.printers?.printer1 || window.posPrinters?.printer1;'), 'isKitchenPrinterConnected must support single-printer Bluetooth (printer1)');
      assert(posSrc.includes("const fallbackSlot = kotSlot === 'printer2' ? 'printer1' : 'printer2';"), 'processCloudKotJob must fallback between printer2 and printer1');
    });

    // =========================================================================
    // SECTION 4: BILLING BY CASHIER, ADMIN, OR BLUETOOTH-CONNECTED TERMINAL
    // =========================================================================
    console.log('\n📍 SECTION 4: BILLING BY CASHIER, ADMIN, OR BLUETOOTH-CONNECTED DEVICE');

    test('BILL-01: isBluetoothPrinterConnected unlocks direct checkout & billing alerts on any Bluetooth-paired device', () => {
      assert(posSrc.includes('function isBluetoothPrinterConnected()'), 'isBluetoothPrinterConnected helper must exist in js/pos.js');
      assert(posSrc.includes('window.isBluetoothPrinterConnected = isBluetoothPrinterConnected;'), 'isBluetoothPrinterConnected must be exposed globally');
      assert(posSrc.includes('const isBleConnected = isBluetoothPrinterConnected();'), 'openCheckoutModal must check isBleConnected');
      assert(posSrc.includes('const canSettle = isBleConnected ||'), 'openCheckoutModal must allow privileged roles or Bluetooth-connected device');
      assert(coreSrc.includes("if (typeof isBluetoothPrinterConnected === 'function' && isBluetoothPrinterConnected()) return true;"), 'isBillingAlertEligibleRole must return true when Bluetooth printer is connected');
    });

    // =========================================================================
    // SECTION 5: FIRESTORE 429 QUOTA FALLBACK & RECOVERY + FORGOT PASSWORD OTP
    // =========================================================================
    console.log('\n📍 SECTION 5: FIRESTORE 429 QUOTA RECOVERY & FORGOT PASSWORD OTP');

    await asyncTest('QUOTA-01: syncStoreToFirestoreREST & getStoreFromFirestoreREST preserve 100% LWW state during 429 and flush dirty fields on 200 recovery', async () => {
      let firestoreOnline = false;
      let recoveredFirestoreFields = {};

      global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (!firestoreOnline) {
          return {
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: { code: 429, message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } })
          };
        }
        if (method === 'PATCH' && url.includes('/shops/SHOP_QUOTA_429?') && !url.includes('/tables/') && !url.includes('/menu_meta')) {
          const body = JSON.parse(opts.body);
          recoveredFirestoreFields = { ...recoveredFirestoreFields, ...(body.fields || {}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ fields: recoveredFirestoreFields }),
          text: async () => ''
        };
      };

      const syncRes = await syncStoreToFirestoreREST('SHOP_QUOTA_429', {
        menu: [{ id: 'm1', name: 'Filter Coffee', price: 60, updatedAt: 9000 }],
        menuVersion: 9000,
        tables: {
          '2': {
            id: '2',
            name: 'Table 2',
            status: 'kot',
            occupied: true,
            updatedAt: 9500,
            items: [{ id: 'm1', name: 'Filter Coffee', price: 60, qty: 2, qtyKotPrinted: 2 }]
          }
        }
      });

      assert.strictEqual(syncRes.success, true, 'Sync must succeed via server LWW cache when Firestore returns 429');
      assert.strictEqual(syncRes.quotaFallback, true);

      const getRes = await getStoreFromFirestoreREST('SHOP_QUOTA_429');
      assert.strictEqual(getRes.success, true, 'GET store must return cached LWW state when Firestore is 429');
      assert.strictEqual(getRes.menu.length, 1);
      assert.strictEqual(getRes.menu[0].name, 'Filter Coffee');

      // Now Firestore recovers (200 OK) and a device sends a partial table update: cached menu MUST be flushed too!
      firestoreOnline = true;
      const recoveryRes = await syncStoreToFirestoreREST('SHOP_QUOTA_429', {
        tables: {
          '2': {
            id: '2',
            name: 'Table 2',
            status: 'empty',
            occupied: false,
            items: [],
            updatedAt: 10000,
            clearedAt: 10000
          }
        }
      });
      assert.strictEqual(recoveryRes.success, true);
      const afterRecoveryGet = await getStoreFromFirestoreREST('SHOP_QUOTA_429');
      assert.strictEqual(afterRecoveryGet.menu.length, 1, 'Cached menu from 429 window must be flushed to Firestore on first 200 recovery');
      assert.strictEqual(afterRecoveryGet.menu[0].name, 'Filter Coffee');
      assert.strictEqual(afterRecoveryGet.tables['2'].status, 'empty');
    });

    test('AUTH-PW-01: Forgot Password OTP flow resets password without altering existing shop data', () => {
      const otpReq = requestPasswordResetOtp('audit_pwreset@billnawcafe.com');
      assert.strictEqual(otpReq.status, 200);
      assert(otpReq.data.devOtp, 'Synthetic test account must receive devOtp');

      const resetRes = resetPasswordWithOtp('audit_pwreset@billnawcafe.com', otpReq.data.devOtp, 'NewStrongPass99!');
      assert.strictEqual(resetRes.status, 200);
      assert.strictEqual(resetRes.data.success, true);

      const loginRes = loginWithPassword({ email: 'audit_pwreset@billnawcafe.com', password: 'NewStrongPass99!' });
      assert.strictEqual(loginRes.status, 200);
      assert.strictEqual(loginRes.data.success, true);
    });
  } finally {
    global.fetch = originalFetch;
    const cacheFile = path.resolve(process.cwd(), 'data', 'stores_state_cache.json');
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        delete raw.SHOP_VER_TEST;
        delete raw.SHOP_IT2_SYNC;
        delete raw.SHOP_TABLES_MERGE;
        delete raw.SHOP_NET_01;
        delete raw.SHOP_SYNC_RBAC;
        delete raw.SHOP_MENU_LWW;
        delete raw.SHOP_TBL_LWW;
        delete raw.SHOP_QUOTA_429;
        if (Object.keys(raw).length === 0) {
          fs.unlinkSync(cacheFile);
        } else {
          fs.writeFileSync(cacheFile, JSON.stringify(raw), 'utf8');
        }
      }
    } catch (_) {}
  }

  console.log('\n====================================================================');
  console.log(`🎯 LWW MULTI-DEVICE POS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
