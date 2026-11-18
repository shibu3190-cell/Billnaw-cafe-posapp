// scratch/test_m1_backend_parity_and_security.cjs
// Comprehensive Unit & Integration Verification Suite for Milestone M1:
// Backend Parity, Auth/RBAC Hardening, Sync Service Merge & Endpoint Gating

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');

process.env.NODE_ENV = 'test';

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

function sendHttp(port, method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Valid minimal 1x1 PNG (67 bytes) and JPEG header bytes
const VALID_PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]).toString('base64');

const VALID_JPEG_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
]).toString('base64');

async function runSuite() {
  console.log('====================================================================');
  console.log('🛡️  M1 BACKEND PARITY, AUTH/RBAC & SYNC SERVICE VERIFICATION SUITE');
  console.log('====================================================================\n');

  const syncService = await import('../server/sync-service.js');
  const authService = await import('../server/auth-service.js');
  const netlifyApi = await import('../netlify/functions/api.js');
  const { app } = await import('../server.js');

  const {
    syncStoreToFirestoreREST,
    deleteStaffFromFirestoreREST,
    getStoreFromFirestoreREST,
    jsonToFirestoreFields,
    firestoreValueToJson
  } = syncService;
  const {
    createSignedAuthToken,
    verifySignedAuthToken,
    verifyTenantAuthorization,
    verifyEndpointAccess,
    sendOtp,
    verifyOtp,
    loginWithPassword,
    setAuthUserRecord,
    hashPassword,
    requestAdminPinResetOtp,
    resetAdminPinWithOtp,
    getShopRecord,
    revokeSession,
    resetAuthStore
  } = authService;

  const originalFetch = global.fetch;
  const createdUploadFiles = [];
  const uploadsFoodDir = path.resolve(__dirname, '../uploads/food-images');
  const uploadsReportsDir = path.resolve(__dirname, '../uploads/reports');

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // =========================================================================
    // SECTION 1: sync-service.js (R1.5, root PATCH error, deletedStaffIds, tables merge)
    // =========================================================================
    console.log('📍 SECTION 1: SYNC SERVICE HARDENING & TABLES MERGE');

    await asyncTest('SYNC-01 (R1.5): menuVersion rejects empty string, whitespace, Infinity, -Infinity, NaN, negative', async () => {
      const patchedPayloads = [];
      global.fetch = async (url, opts = {}) => {
        if (opts.method === 'PATCH' && !url.includes('/staff') && !url.includes('/tables')) {
          patchedPayloads.push(JSON.parse(opts.body));
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      for (const badVer of ['', '   ', Infinity, -Infinity, NaN, -1, 'abc']) {
        const res = await syncStoreToFirestoreREST('SHOP_VER_TEST', { menu: [], menuVersion: badVer });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.syncedFields.includes('menuVersion'), false, `Bad menuVersion ${String(badVer)} must not be patched`);
      }

      for (const goodVer of [0, '0', 1, '42']) {
        const res = await syncStoreToFirestoreREST('SHOP_VER_TEST', { menu: [], menuVersion: goodVer });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.syncedFields.includes('menuVersion'), true, `Valid menuVersion ${String(goodVer)} must be patched`);
      }

      const lastPatch = patchedPayloads[patchedPayloads.length - 1];
      assert.strictEqual(firestoreValueToJson(lastPatch.fields.menuVersion), 42);
    });

    await asyncTest('SYNC-02: Root PATCH failure (HTTP 403/500 or network throw) aborts subcollection writes & surfaces failure', async () => {
      const calls = [];
      global.fetch = async (url, opts = {}) => {
        calls.push({ url, method: opts.method || 'GET' });
        if (opts.method === 'PATCH') {
          return { ok: false, status: 403, text: async () => 'Permission denied' };
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }) };
      };

      const res403 = await syncStoreToFirestoreREST('SHOP_FAIL_403', {
        staff: [{ id: '1', name: 'A', role: 'Cashier' }],
        tables: { '1': { items: [{ id: 1, name: 'Tea', qty: 1 }], status: 'occupied' } },
        deletedStaffId: '99'
      });
      assert.strictEqual(res403.success, false);
      assert.strictEqual(res403.status, 403);
      assert(res403.error.includes('Permission denied'));
      // Only GET root + PATCH root should run; zero /staff/ or /tables/ or DELETE calls
      assert.strictEqual(calls.some(c => c.url.includes('/staff') || c.url.includes('/tables') || c.method === 'DELETE'), false);

      // Network throw
      global.fetch = async () => { throw new Error('ECONNREFUSED'); };
      const resErr = await syncStoreToFirestoreREST('SHOP_FAIL_NET', { menu: [] });
      assert.strictEqual(resErr.success, false);
      assert.strictEqual(resErr.status, 502);
      assert(resErr.error.includes('ECONNREFUSED'));
    });

    await asyncTest('SYNC-03: deletedStaffIds array + deletedStaffId deduplicate, filter staff, delete subdocs, revoke sessions & return in GET', async () => {
      const calls = [];
      let lastRootPatchFields = null;
      global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: jsonToFirestoreFields({
                staff: [
                  { id: '1', name: 'Owner', role: 'Admin' },
                  { id: '2', name: 'Old Cashier', role: 'Cashier' },
                  { id: '3', name: 'Old Chef', role: 'Kitchen Chef' }
                ],
                deletedStaffIds: ['2', '3']
              })
            })
          };
        }
        if (method === 'PATCH' && !url.includes('/staff') && !url.includes('/tables') && !url.includes('/staffSessions')) {
          lastRootPatchFields = JSON.parse(opts.body).fields;
        }
        return { ok: true, status: 200, text: async () => '' };
      };

      const res = await syncStoreToFirestoreREST('SHOP_STAFF_DEL', {
        staff: [
          { id: '1', name: 'Owner', role: 'Admin' },
          { id: '2', name: 'Old Cashier', role: 'Cashier' },
          { id: '4', name: 'New Waiter', role: 'Floor Server' }
        ],
        replaceStaff: false,
        deletedStaffId: '2',
        deletedStaffIds: ['2', '3']
      });

      assert.strictEqual(res.success, true);
      const patchedStaff = firestoreValueToJson(lastRootPatchFields.staff);
      const patchedDeleted = firestoreValueToJson(lastRootPatchFields.deletedStaffIds);
      assert.deepStrictEqual(patchedStaff.map(s => s.id), ['1', '4']);
      assert.deepStrictEqual(patchedDeleted.sort(), ['2', '3']);
      assert.strictEqual(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/staff/2')), true);
      assert.strictEqual(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/staff/3')), true);
      assert.strictEqual(calls.some(c => c.method === 'PATCH' && c.url.endsWith('/staffSessions/2')), true);
      assert.strictEqual(calls.some(c => c.method === 'PATCH' && c.url.endsWith('/staffSessions/3')), true);

      // replaceStaff: true must also filter deletedStaffIds
      calls.length = 0;
      await syncStoreToFirestoreREST('SHOP_STAFF_DEL', {
        staff: [{ id: '1', name: 'Owner' }, { id: '3', name: 'Ghost' }],
        replaceStaff: true,
        deletedStaffIds: ['3']
      });
      const replacePatchedStaff = firestoreValueToJson(lastRootPatchFields.staff);
      assert.deepStrictEqual(replacePatchedStaff.map(s => s.id), ['1']);

      // getStoreFromFirestoreREST returns deletedStaffIds
      const getRes = await getStoreFromFirestoreREST('SHOP_STAFF_DEL');
      assert.strictEqual(getRes.success, true);
      assert.deepStrictEqual(getRes.deletedStaffIds, ['2', '3']);
    });

    await asyncTest('SYNC-04: Concurrent tables merge preserves sibling tables, Math.max kotPrintedMap/qtyKotPrinted clamped to qty, honors explicit resets', async () => {
      const calls = [];
      let rootTablesPatched = null;
      const existingFirestoreTables = {
        '1': {
          id: '1',
          status: 'kot',
          items: [{ id: 'item_tea', name: 'Tea', qty: 2, qtyKotPrinted: 2 }],
          kotPrintedMap: { item_tea: 2, Tea: 2 }
        },
        '2': {
          id: '2',
          status: 'occupied',
          items: [{ id: 'item_samosa', name: 'Samosa', qty: 3, qtyKotPrinted: 0 }],
          kotPrintedMap: {}
        },
        '3': {
          id: '3',
          status: 'kot',
          items: [{ id: 'item_coffee', name: 'Coffee', qty: 1, qtyKotPrinted: 1 }],
          kotPrintedMap: { item_coffee: 1, Coffee: 1 },
          updatedAt: '2026-11-18T05:00:00.000Z'
        }
      };

      global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: jsonToFirestoreFields({ tables: existingFirestoreTables })
            })
          };
        }
        if (method === 'PATCH' && !url.includes('/tables/')) {
          rootTablesPatched = firestoreValueToJson(JSON.parse(opts.body).fields.tables);
        }
        return { ok: true, status: 200, text: async () => '' };
      };

      // Update Table 1 (add qty, stale qtyKotPrinted: 0, status: 'occupied'), clear Table 3 explicitly; omit Table 2
      const res = await syncStoreToFirestoreREST('SHOP_TABLES_MERGE', {
        tables: {
          '1': {
            status: 'occupied',
            items: [{ id: 'item_tea', name: 'Tea', qty: 3, qtyKotPrinted: 0 }],
            kotPrintedMap: {}
          },
          '3': {
            status: 'empty',
            occupied: false,
            items: [],
            updatedAt: '2026-11-18T05:05:00.000Z'
          }
        }
      });

      assert.strictEqual(res.success, true);
      // Table 2 preserved untouched on root doc!
      assert.strictEqual(rootTablesPatched['2'].items[0].name, 'Samosa');
      assert.strictEqual(rootTablesPatched['2'].items[0].qty, 3);
      // Table 1 preserves kotPrintedMap / qtyKotPrinted = 2 and status = 'kot'
      assert.strictEqual(rootTablesPatched['1'].items[0].qtyKotPrinted, 2);
      assert.strictEqual(rootTablesPatched['1'].kotPrintedMap.item_tea, 2);
      assert.strictEqual(rootTablesPatched['1'].status, 'kot');
      // Table 3 cleared explicitly
      assert.deepStrictEqual(rootTablesPatched['3'].items, []);
      assert.deepStrictEqual(rootTablesPatched['3'].kotPrintedMap, {});
      assert.strictEqual(rootTablesPatched['3'].status, 'empty');
      // Step 3 subdoc PATCHes only ran for '1' and '3', NOT sibling '2'
      assert.strictEqual(calls.some(c => c.url.endsWith('/tables/1') && c.method === 'PATCH'), true);
      assert.strictEqual(calls.some(c => c.url.endsWith('/tables/3') && c.method === 'PATCH'), true);
      assert.strictEqual(calls.some(c => c.url.endsWith('/tables/2') && c.method === 'PATCH'), false);
      // Verify clamping: if existing had qtyKotPrinted: 5 and incoming reduced qty to 2 -> clamped to 2
      existingFirestoreTables['1'].items[0].qtyKotPrinted = 5;
      existingFirestoreTables['1'].kotPrintedMap.item_tea = 5;
      await syncStoreToFirestoreREST('SHOP_TABLES_MERGE', {
        tables: {
          '1': { status: 'kot', items: [{ id: 'item_tea', name: 'Tea', qty: 2, qtyKotPrinted: 1 }] }
        }
      });
      assert.strictEqual(rootTablesPatched['1'].items[0].qtyKotPrinted, 2);
      assert.strictEqual(rootTablesPatched['1'].kotPrintedMap.item_tea, 2);

      // Minimal GET mock fallback (offline/404)
      global.fetch = async (url, opts = {}) => {
        if (!opts.method || opts.method === 'GET') throw new Error('Offline');
        return { ok: true, status: 200, text: async () => '' };
      };
      const offlineRes = await syncStoreToFirestoreREST('SHOP_TABLES_MERGE', {
        tables: { '1': { status: 'occupied', items: [{ id: 1, name: 'Tea', qty: 1 }] } }
      });
      assert.strictEqual(offlineRes.success, true);
    });

    // =========================================================================
    // SECTION 2: auth-service.js (verifyEndpointAccess, sessionStore role, revokeSession)
    // =========================================================================
    console.log('\n📍 SECTION 2: AUTH-SERVICE RBAC & SESSION HARDENING');

    test('AUTH-01: verifyEndpointAccess blocks vertical & lateral escalation via x-staff-role and missing role fails closed', () => {
      const waiterToken = createSignedAuthToken({ storeCode: 'SHOP_RBAC', email: 'w@t.com', role: 'Floor Server' });
      const waiterAuth = verifyTenantAuthorization({ token: waiterToken, targetStoreCode: 'SHOP_RBAC', allowGracefulMigration: false });
      const vertEsc = verifyEndpointAccess({
        authResult: waiterAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Owner' } },
        requiredPermission: 'manage_staff'
      });
      assert.strictEqual(vertEsc.allowed, false);
      assert.strictEqual(vertEsc.status, 403);

      const cashierToken = createSignedAuthToken({ storeCode: 'SHOP_RBAC', email: 'c@t.com', role: 'Cashier' });
      const cashierAuth = verifyTenantAuthorization({ token: cashierToken, targetStoreCode: 'SHOP_RBAC', allowGracefulMigration: false });
      const latEsc1 = verifyEndpointAccess({
        authResult: cashierAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Floor Server' } },
        requiredPermission: 'dispatch_kot'
      });
      assert.strictEqual(latEsc1.allowed, false);
      assert.strictEqual(latEsc1.status, 403);

      const mgrToken = createSignedAuthToken({ storeCode: 'SHOP_RBAC', email: 'm@t.com', role: 'Manager' });
      const mgrAuth = verifyTenantAuthorization({ token: mgrToken, targetStoreCode: 'SHOP_RBAC', allowGracefulMigration: false });
      const latEsc2 = verifyEndpointAccess({
        authResult: mgrAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Kitchen Chef' } },
        requiredPermission: 'view_kds'
      });
      assert.strictEqual(latEsc2.allowed, false);
      assert.strictEqual(latEsc2.status, 403);

      // Owner terminal downgraded to Floor Server
      const ownerToken = createSignedAuthToken({ storeCode: 'SHOP_RBAC', email: 'o@t.com', role: 'Owner' });
      const ownerAuth = verifyTenantAuthorization({ token: ownerToken, targetStoreCode: 'SHOP_RBAC', allowGracefulMigration: false });
      const downgradeDeny = verifyEndpointAccess({
        authResult: ownerAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Floor Server' } },
        requiredPermission: 'manage_staff'
      });
      assert.strictEqual(downgradeDeny.allowed, false);
      assert.strictEqual(downgradeDeny.status, 403);

      const downgradeAllow = verifyEndpointAccess({
        authResult: ownerAuth,
        eventOrReq: { headers: { 'x-staff-role': 'Floor Server' } },
        requiredPermission: 'take_orders'
      });
      assert.strictEqual(downgradeAllow.allowed, true);
      assert.strictEqual(downgradeAllow.role, 'Floor Server');

      // Missing user role (non-migrated) defaults to Cashier, NEVER Owner
      const missingRoleCheck = verifyEndpointAccess({
        authResult: { authorized: true, user: { storeCode: 'SHOP_RBAC' } },
        requiredPermission: 'manage_staff'
      });
      assert.strictEqual(missingRoleCheck.allowed, false);
      assert.strictEqual(missingRoleCheck.status, 403);

      // Unauthenticated fails closed with 401
      const noAuthCheck = verifyEndpointAccess({ authResult: null, requiredPermission: 'take_orders' });
      assert.strictEqual(noAuthCheck.allowed, false);
      assert.strictEqual(noAuthCheck.status, 401);
    });

    test('AUTH-02: sessionStore persists role and revokeSession enforces targetStoreCode isolation', () => {
      resetAuthStore();
      const otp1 = sendOtp('audit_owner_a@billnawcafe.com');
      const v1 = verifyOtp('audit_owner_a@billnawcafe.com', otp1.data.devOtp, 'Shop Alpha');
      const sessA = v1.data.token;
      const storeA = v1.data.storeCode;

      const authA = verifyTenantAuthorization({ token: sessA, targetStoreCode: storeA, allowGracefulMigration: false });
      assert.strictEqual(authA.authorized, true);
      assert.strictEqual(authA.user.role, 'Owner');

      // Cross-tenant revokeSession must return 403
      const crossRev = revokeSession(sessA, 'SHOP_OTHER_99');
      assert.strictEqual(crossRev.status, 403);
      // Same-tenant revokeSession succeeds
      const okRev = revokeSession(sessA, storeA);
      assert.strictEqual(okRev.status, 200);
    });

    // =========================================================================
    // SECTION 3: NETLIFY PARITY (R1.1, Subscription, Login/Signup, PIN Reset, Food Images)
    // =========================================================================
    console.log('\n📍 SECTION 3: NETLIFY PARITY & SERVERLESS SECURITY');

    await asyncTest('NET-PAR-01 (R1.1): Netlify /sync/store-data & /sync/staff forward menu/staff tombstones and enforce field RBAC', async () => {
      let patchedFields = null;
      global.fetch = async (url, opts = {}) => {
        if (opts.method === 'PATCH' && url.includes('/shops/SHOP_NET_01?') && !url.includes('/staff') && !url.includes('/tables')) {
          patchedFields = JSON.parse(opts.body).fields;
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_NET_01', email: 'o@net.com', role: 'Owner' });
      const res = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/sync/store-data',
        headers: { authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({
          storeCode: 'SHOP_NET_01',
          menu: [{ id: 'm1', name: 'Tea', price: 10 }],
          deletedMenuIds: ['m2'],
          deletedMenuNames: ['old tea'],
          menuVersion: 7,
          deletedStaffIds: ['stf_9']
        })
      }, {});
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(firestoreValueToJson(patchedFields.deletedMenuIds), ['m2']);
      assert.deepStrictEqual(firestoreValueToJson(patchedFields.deletedMenuNames), ['old tea']);
      assert.strictEqual(firestoreValueToJson(patchedFields.menuVersion), 7);
      assert.deepStrictEqual(firestoreValueToJson(patchedFields.deletedStaffIds), ['stf_9']);

      // Floor Server blocked from mutating staff/menu on /sync/store-data, but ALLOWED to persistTables ({ tables, profile })
      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_NET_01', email: 'w@net.com', role: 'Floor Server' });
      const waiterStaffBlock = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/sync/store-data',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ storeCode: 'SHOP_NET_01', staff: [] })
      }, {});
      assert.strictEqual(waiterStaffBlock.statusCode, 403);

      const waiterMenuBlock = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/sync/store-data',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ storeCode: 'SHOP_NET_01', menuVersion: 8 })
      }, {});
      assert.strictEqual(waiterMenuBlock.statusCode, 403);

      const waiterTablesOk = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/sync/store-data',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ storeCode: 'SHOP_NET_01', tables: { '1': { items: [], status: 'empty' } }, profile: { name: 'Cafe' } })
      }, {});
      assert.strictEqual(waiterTablesOk.statusCode, 200);

      // OPTIONS CORS headers include x-staff-role, x-session-token, etc.
      const opt = await netlifyApi.handler({ httpMethod: 'OPTIONS', path: '/api/sync/store-data' }, {});
      const allowHeaders = opt.headers['Access-Control-Allow-Headers'].toLowerCase();
      for (const h of ['x-staff-role', 'x-staff-id', 'x-session-token', 'x-gemini-api-key', 'x-api-key']) {
        assert(allowHeaders.includes(h), `CORS must allow ${h}`);
      }
    });

    await asyncTest('NET-PAR-02: Netlify /subscription/manage enforces strict auth even without shopId & uses 2-arg updateShopSubscription', async () => {
      global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });

      // Unauthenticated without shopId (email only) -> 401
      const unauthRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/subscription/manage',
        body: JSON.stringify({ email: 'owner@test.com', action: 'PAUSED' })
      }, {});
      assert.strictEqual(unauthRes.statusCode, 401);

      // Floor Server -> 403
      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_TEST_SUB1', email: 'w@sub.com', role: 'Floor Server' });
      const waiterRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/subscription/manage',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ shopId: 'SHOP_TEST_SUB1', action: 'PAUSED' })
      }, {});
      assert.strictEqual(waiterRes.statusCode, 403);

      // Cross-tenant via email only (shopId omitted) -> 403
      const attackerTok = createSignedAuthToken({ storeCode: 'SHOP_TEST_ATTACKER', email: 'attacker@sub.com', role: 'Owner' });
      const crossEmailRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/subscription/manage',
        headers: { authorization: `Bearer ${attackerTok}` },
        body: JSON.stringify({ email: 'victim@sub.com', action: 'REVOKED' })
      }, {});
      assert.strictEqual(crossEmailRes.statusCode, 403);

      // Valid Owner PAUSED -> 200, status === 'PAUSED'
      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_TEST_SUB1', email: 'owner@sub.com', role: 'Owner' });
      const okRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/subscription/manage',
        headers: { authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ shopId: 'SHOP_TEST_SUB1', action: 'PAUSED', reason: 'Maintenance' })
      }, {});
      assert.strictEqual(okRes.statusCode, 200);
      const okData = JSON.parse(okRes.body);
      assert.strictEqual(okData.status, 'PAUSED');
      assert.strictEqual(okData.subscription.status, 'PAUSED');
      assert.strictEqual(okData.subscription.statusReason, 'Maintenance');
    });

    await asyncTest('NET-PAR-03: Netlify /auth/login verifies PBKDF2 password & cold-start Firestore fallback (no arbitrary JWT)', async () => {
      const firestoreUsers = new Map();
      global.fetch = async (url, opts = {}) => {
        if (url.includes('/clients/_auth/users/')) {
          const key = decodeURIComponent(url.split('/clients/_auth/users/')[1]);
          if (opts.method === 'PATCH') {
            firestoreUsers.set(key, JSON.parse(opts.body).fields);
            return { ok: true, status: 200, text: async () => '' };
          }
          if (firestoreUsers.has(key)) {
            return { ok: true, status: 200, json: async () => ({ fields: firestoreUsers.get(key) }) };
          }
          return { ok: false, status: 404, text: async () => 'Not found' };
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      // Arbitrary password for unknown email -> 401
      const badLogin = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/login',
        body: JSON.stringify({ email: 'hacker@evil.com', password: 'any_random_password' })
      }, {});
      assert.strictEqual(badLogin.statusCode, 401);

      // Demo account with wrong password -> 401
      const badDemo = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/login',
        body: JSON.stringify({ email: 'demo@billnawcafe.com', password: 'WrongPassword!' })
      }, {});
      assert.strictEqual(badDemo.statusCode, 401);

      // Demo account with right password -> 200 + JWT
      const okDemo = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/login',
        body: JSON.stringify({ email: 'demo@billnawcafe.com', password: 'Password123!' })
      }, {});
      assert.strictEqual(okDemo.statusCode, 200);
      assert.strictEqual(JSON.parse(okDemo.body).token.split('.').length, 3);

      // Signup then cold-start resetAuthStore() + login via Firestore fallback
      const signupEmail = `coldstart_${Date.now()}@billnawcafe.com`;
      const signupRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/signup',
        body: JSON.stringify({
          firstName: 'Asha',
          shopName: 'Asha Cafe',
          email: signupEmail,
          phone: '9876543210',
          password: 'SecretPass99!',
          confirmPassword: 'SecretPass99!',
          adminPin: '4829'
        })
      }, {});
      assert.strictEqual(signupRes.statusCode, 200);
      assert(firestoreUsers.has(signupEmail), 'Signup must persist hashed user to Firestore');

      // Simulate cold start wiping in-memory userStore
      resetAuthStore();

      const coldWrong = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/login',
        body: JSON.stringify({ email: signupEmail, password: 'WrongPassword' })
      }, {});
      assert.strictEqual(coldWrong.statusCode, 401);

      const coldRight = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/login',
        body: JSON.stringify({ email: signupEmail, password: 'SecretPass99!' })
      }, {});
      assert.strictEqual(coldRight.statusCode, 200);
      assert.strictEqual(JSON.parse(coldRight.body).user.email, signupEmail);
    });

    await asyncTest('NET-PAR-04: Netlify /auth/admin-forgot-pin/reset enforces non-trivial 4-digit PIN, 3-attempt lockout & v2 salted hash', async () => {
      const otpStoreMock = new Map();
      global.fetch = async (url, opts = {}) => {
        if (url.includes('/clients/_auth/otp/')) {
          const key = decodeURIComponent(url.split('/clients/_auth/otp/')[1]);
          if (opts.method === 'PATCH') {
            otpStoreMock.set(key, JSON.parse(opts.body).fields);
            return { ok: true, status: 200, text: async () => '' };
          }
          if (opts.method === 'DELETE') {
            otpStoreMock.delete(key);
            return { ok: true, status: 200 };
          }
          if (otpStoreMock.has(key)) {
            return { ok: true, status: 200, json: async () => ({ fields: otpStoreMock.get(key) }) };
          }
          return { ok: false, status: 404, text: async () => '' };
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      const pinEmail = `pin_reset_${Date.now()}@billnawcafe.com`;
      // Seed valid OTP in Firestore mock (to avoid needing SMTP)
      otpStoreMock.set(pinEmail, {
        otp: { stringValue: '654321' },
        email: { stringValue: pinEmail },
        purpose: { stringValue: 'admin-pin-reset' },
        createdAt: { integerValue: String(Date.now()) },
        expiresAt: { integerValue: String(Date.now() + 600000) },
        attempts: { integerValue: '0' }
      });

      // Reject trivial PIN '1234' & 6-digit PIN '123456'
      const trivRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '654321', newPin: '1234' })
      }, {});
      assert.strictEqual(trivRes.statusCode, 400);

      const sixDigitRes = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '654321', newPin: '123456' })
      }, {});
      assert.strictEqual(sixDigitRes.statusCode, 400);

      // 3 wrong OTP attempts -> 3rd triggers 429 lockout
      const a1 = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '111111', newPin: '4829' })
      }, {});
      assert.strictEqual(a1.statusCode, 400);
      const a2 = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '222222', newPin: '4829' })
      }, {});
      assert.strictEqual(a2.statusCode, 400);
      const a3 = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '333333', newPin: '4829' })
      }, {});
      assert.strictEqual(a3.statusCode, 429);

      // Re-seed valid OTP and succeed
      otpStoreMock.set(pinEmail, {
        otp: { stringValue: '654321' },
        email: { stringValue: pinEmail },
        purpose: { stringValue: 'admin-pin-reset' },
        createdAt: { integerValue: String(Date.now()) },
        expiresAt: { integerValue: String(Date.now() + 600000) },
        attempts: { integerValue: '0' }
      });
      const okPin = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: pinEmail, otp: '654321', newPin: '4829', storeCode: 'SHOP_PIN_01' })
      }, {});
      assert.strictEqual(okPin.statusCode, 200);
      const pinData = JSON.parse(okPin.body);
      assert.strictEqual(pinData.pinSalt.length, 32);
      const expectedSalted = crypto.createHash('sha256').update(`4829:${pinData.pinSalt}:billnaw_pin_v2`).digest('hex');
      assert.strictEqual(pinData.pinHash, expectedSalted);
    });

    await asyncTest('NET-PAR-05: Netlify /food-images/save & /upload enforce auth, RBAC, 3MB cap, and magic bytes', async () => {
      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_IMG', email: 'o@img.com', role: 'Owner' });
      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_IMG', email: 'w@img.com', role: 'Floor Server' });

      const unauth = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/food-images/save',
        body: JSON.stringify({ dishId: 'd1', base64Data: VALID_PNG_BASE64 })
      }, {});
      assert.strictEqual(unauth.statusCode, 401);

      const waiter = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/food-images/upload',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ dishId: 'd1', base64Data: VALID_PNG_BASE64 })
      }, {});
      assert.strictEqual(waiter.statusCode, 403);

      const htmlPayload = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
      const badMagic = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/food-images/save',
        headers: { authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ dishId: 'd1', base64Data: `data:image/png;base64,${htmlPayload}` })
      }, {});
      assert.strictEqual(badMagic.statusCode, 400);

      const tooBig = Buffer.alloc(3 * 1024 * 1024 + 10, 0x41).toString('base64');
      const bigRes = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/food-images/save',
        headers: { authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ dishId: 'd1', base64Data: tooBig })
      }, {});
      assert.strictEqual(bigRes.statusCode, 413);

      const okRes = await netlifyApi.handler({
        httpMethod: 'POST', path: '/api/food-images/save',
        headers: { authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ dishId: 'd1', base64Data: VALID_PNG_BASE64 })
      }, {});
      assert.strictEqual(okRes.statusCode, 200);
      assert(JSON.parse(okRes.body).url.startsWith('data:image/png;base64,'));
    });

    // =========================================================================
    // SECTION 4: EXPRESS GATING, REPORTS HARDENING & CROSS-TENANT ISOLATION
    // =========================================================================
    console.log('\n📍 SECTION 4: EXPRESS GATED ENDPOINTS & REPORTS HARDENING');

    await asyncTest('EXP-01: Sync endpoints return HTTP 500 on root PATCH failure (so res.ok === false)', async () => {
      global.fetch = async (url, opts = {}) => {
        if (opts.method === 'PATCH') return { ok: false, status: 500, text: async () => 'Firestore down' };
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };
      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_SYNC', email: 'o@exp.com', role: 'Owner' });
      const res = await sendHttp(port, 'POST', '/api/sync/store-data', {
        storeCode: 'SHOP_EXP_SYNC',
        menu: [{ id: 1, name: 'Tea', price: 10 }]
      }, { authorization: `Bearer ${ownerTok}` });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.success, false);
    });

    await asyncTest('EXP-02: Food images /save, /upload, DELETE enforce auth, RBAC, 3MB cap, magic bytes & path confinement', async () => {
      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_IMG', email: 'o@exp.com', role: 'Owner' });
      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_IMG', email: 'w@exp.com', role: 'Floor Server' });

      assert.strictEqual((await sendHttp(port, 'POST', '/api/food-images/save', { dishId: '1', base64Data: VALID_JPEG_BASE64 })).status, 401);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/food-images/upload', { dishId: '1', base64Data: VALID_JPEG_BASE64 }, { authorization: `Bearer ${waiterTok}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'DELETE', '/api/food-images/test.jpg', null)).status, 401);

      const htmlB64 = Buffer.from('<svg onload=alert(1)>').toString('base64');
      assert.strictEqual((await sendHttp(port, 'POST', '/api/food-images/save', { dishId: '1', base64Data: htmlB64 }, { authorization: `Bearer ${ownerTok}` })).status, 400);

      const bigB64 = Buffer.alloc(3 * 1024 * 1024 + 16, 0xff).toString('base64');
      assert.strictEqual((await sendHttp(port, 'POST', '/api/food-images/save', { dishId: '1', base64Data: bigB64 }, { authorization: `Bearer ${ownerTok}` })).status, 413);

      const okSave = await sendHttp(port, 'POST', '/api/food-images/save', { dishId: 'd_test', base64Data: VALID_PNG_BASE64 }, { authorization: `Bearer ${ownerTok}` });
      assert.strictEqual(okSave.status, 200);
      assert(okSave.body.image.filename.endsWith('.png'));
      createdUploadFiles.push(path.join(uploadsFoodDir, okSave.body.image.filename));

      const delOk = await sendHttp(port, 'DELETE', `/api/food-images/${okSave.body.image.filename}`, null, { authorization: `Bearer ${ownerTok}` });
      assert.strictEqual(delOk.status, 200);
    });

    await asyncTest('EXP-03: Newly gated admin, device, session & reset routes block unauth (401), Waiter (403) & cross-tenant (403)', async () => {
      global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' });

      const ownerA = createSignedAuthToken({ storeCode: 'SHOP_TENANT_A', email: 'a@test.com', role: 'Owner' });
      const waiterA = createSignedAuthToken({ storeCode: 'SHOP_TENANT_A', email: 'w@test.com', role: 'Floor Server' });
      const ownerB = createSignedAuthToken({ storeCode: 'SHOP_TENANT_B', email: 'b@test.com', role: 'Owner' });
      const superTok = createSignedAuthToken({ storeCode: 'PLATFORM', email: 'sa@test.com', role: 'SuperAdmin' });

      const gatedChecks = [
        ['POST', '/api/admin/client-quota', { shopId: 'SHOP_TENANT_A', aiMonthlyLimit: 50 }],
        ['POST', '/api/admin/clear-cache', { storeCode: 'SHOP_TENANT_A' }],
        ['POST', '/api/devices/revoke', { storeCode: 'SHOP_TENANT_A', deviceId: 'DEV_1' }],
        ['POST', '/api/devices/resume', { storeCode: 'SHOP_TENANT_A', deviceId: 'DEV_1' }],
        ['GET', '/api/auth/sessions?storeCode=SHOP_TENANT_A', null],
        ['POST', '/api/auth/sessions/revoke', { storeCode: 'SHOP_TENANT_A', token: 'fake' }],
        ['POST', '/api/store/reset-data', { storeCode: 'SHOP_TENANT_A' }],
        ['POST', '/api/admin/maintenance/purge', { dryRun: true }]
      ];

      for (const [m, p, b] of gatedChecks) {
        const r401 = await sendHttp(port, m, p, b);
        assert.strictEqual(r401.status, 401, `Unauth ${m} ${p} must return 401, got ${r401.status}`);
        const r403w = await sendHttp(port, m, p, b, { authorization: `Bearer ${waiterA}` });
        assert.strictEqual(r403w.status, 403, `Waiter ${m} ${p} must return 403, got ${r403w.status}`);
      }

      // Cross-tenant Owner B targeting Shop A
      assert.strictEqual((await sendHttp(port, 'POST', '/api/admin/client-quota', { shopId: 'SHOP_TENANT_A', aiMonthlyLimit: 50 }, { authorization: `Bearer ${ownerB}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/devices/revoke', { storeCode: 'SHOP_TENANT_A', deviceId: 'DEV_1' }, { authorization: `Bearer ${ownerB}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/store/reset-data', { storeCode: 'SHOP_TENANT_A' }, { authorization: `Bearer ${ownerB}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'GET', '/api/auth/sessions?storeCode=SHOP_TENANT_A', null, { authorization: `Bearer ${ownerB}` })).status, 403);

      // Missing storeCode on devices/revoke -> 400 (no 'default' fallback)
      assert.strictEqual((await sendHttp(port, 'POST', '/api/devices/revoke', { deviceId: 'DEV_1' }, { authorization: `Bearer ${ownerA}` })).status, 400);

      // maintenance/purge rejects regular Owner (403), allows SuperAdmin (200), rejects bad now (400)
      assert.strictEqual((await sendHttp(port, 'POST', '/api/admin/maintenance/purge', { dryRun: true }, { authorization: `Bearer ${ownerA}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/admin/maintenance/purge', { dryRun: true }, { authorization: `Bearer ${superTok}` })).status, 200);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/admin/maintenance/purge', { dryRun: true, now: 'not-a-date' }, { authorization: `Bearer ${superTok}` })).status, 400);

      // Sessions listing redacts raw token & sessions/revoke ignores req.body.token as caller auth
      resetAuthStore();
      const otpA = sendOtp('audit_sess_a@billnawcafe.com');
      const vA = verifyOtp('audit_sess_a@billnawcafe.com', otpA.data.devOtp, 'Shop Sess A');
      const tokA = vA.data.token;
      const scA = vA.data.storeCode;

      const listRes = await sendHttp(port, 'GET', `/api/auth/sessions?storeCode=${scA}`, null, { authorization: `Bearer ${tokA}` });
      assert.strictEqual(listRes.status, 200);
      assert(listRes.body.sessions.length >= 1);
      assert.strictEqual(listRes.body.sessions[0].token, undefined, 'Raw token must be redacted from GET /api/auth/sessions');
      assert(listRes.body.sessions[0].maskedToken, 'maskedToken must be present');

      // Attacker sending target token in req.body.token without Authorization header -> 401 (NOT self-authenticated!)
      const bodyTokenSpoof = await sendHttp(port, 'POST', '/api/auth/sessions/revoke', { token: tokA });
      assert.strictEqual(bodyTokenSpoof.status, 401);

      // Cross-tenant Owner B trying to revoke Shop A session -> 403
      const crossRev = await sendHttp(port, 'POST', '/api/auth/sessions/revoke', { token: tokA }, { authorization: `Bearer ${ownerB}` });
      assert.strictEqual(crossRev.status, 403);
    });

    await asyncTest('EXP-04: /api/reports/generate-statement & /download/:token enforce auth, real data (no BN-SAMPLE-01) & CRLF sanitization', async () => {
      global.fetch = async (url) => {
        if (url.includes('SHOP_REP_A')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: jsonToFirestoreFields({
                history: [
                  { id: 'INV-101', date: '2026-11-10', total: 150, tax: 7.5, status: 'SETTLED', items: [{ name: 'Chai', qty: 2 }] },
                  { id: 'INV-102', date: '2026-11-11', total: 999, status: 'VOID', items: [{ name: 'Voided', qty: 1 }] }
                ]
              })
            })
          };
        }
        return { ok: false, status: 404, text: async () => '' };
      };

      const ownerA = createSignedAuthToken({ storeCode: 'SHOP_REP_A', email: 'a@rep.com', role: 'Owner' });
      const waiterA = createSignedAuthToken({ storeCode: 'SHOP_REP_A', email: 'w@rep.com', role: 'Floor Server' });
      const ownerB = createSignedAuthToken({ storeCode: 'SHOP_REP_B', email: 'b@rep.com', role: 'Owner' });

      assert.strictEqual((await sendHttp(port, 'POST', '/api/reports/generate-statement', { storeCode: 'SHOP_REP_A' })).status, 401);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/reports/generate-statement', { storeCode: 'SHOP_REP_A' }, { authorization: `Bearer ${waiterA}` })).status, 403);
      assert.strictEqual((await sendHttp(port, 'POST', '/api/reports/generate-statement', { storeCode: 'SHOP_REP_A' }, { authorization: `Bearer ${ownerB}` })).status, 403);

      const genRes = await sendHttp(port, 'POST', '/api/reports/generate-statement', {
        storeCode: 'SHOP_REP_A',
        startDate: '2026-11-01',
        endDate: '2026-11-30'
      }, { authorization: `Bearer ${ownerA}` });
      assert.strictEqual(genRes.status, 200);
      assert.strictEqual(genRes.body.totalRecords, 1, 'Only non-void INV-101 should be included');
      assert.strictEqual(genRes.body.token.length, 64, '256-bit random token');
      createdUploadFiles.push(path.join(uploadsReportsDir, `${genRes.body.token}_${genRes.body.filename}`));

      // Download unauthenticated -> 401
      assert.strictEqual((await sendHttp(port, 'GET', `/api/reports/download/${genRes.body.token}`)).status, 401);
      // Download cross-tenant -> 403
      assert.strictEqual((await sendHttp(port, 'GET', `/api/reports/download/${genRes.body.token}`, null, { authorization: `Bearer ${ownerB}` })).status, 403);

      // Download with CRLF + quote + traversal injection in ?filename=
      const evilName = encodeURIComponent('../../evil.exe"\r\nSet-Cookie:hack=1');
      const dlRes = await sendHttp(
        port,
        'GET',
        `/api/reports/download/${genRes.body.token}?filename=${evilName}&authToken=${encodeURIComponent(ownerA)}`
      );
      assert.strictEqual(dlRes.status, 200);
      const disp = dlRes.headers['content-disposition'];
      assert(!disp.includes('\r') && !disp.includes('\n'), 'CRLF must be stripped');
      assert(disp.endsWith('.csv"'), 'Extension must remain .csv');
      assert(!dlRes.raw.includes('BN-SAMPLE-01'), 'Must NOT contain hardcoded BN-SAMPLE-01');
      assert(dlRes.raw.includes('INV-101'), 'Must contain real settled invoice INV-101');
      assert(!dlRes.raw.includes('INV-102'), 'Must exclude VOID invoice INV-102');
    });

    // =========================================================================
    // SECTION 5: ITERATION 2 SECURITY, SYNC & PARITY REGRESSIONS
    // =========================================================================
    console.log('\n📍 SECTION 5: ITERATION 2 REGRESSIONS (SUBSCRIPTION, PIN TAKEOVER, JWT, SYNC, REPORTS)');

    await asyncTest('IT2-01: Express POST /api/subscription/manage rejects unauth (401, no x-refreshed-token), Waiter (403) & cross-tenant (403), allows Owner (200)', async () => {
      global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });

      // Unauthenticated -> 401 and NO x-refreshed-token
      const unauthShop = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopId: 'SHOP_EXP_SUB1',
        action: 'REVOKED'
      });
      assert.strictEqual(unauthShop.status, 401);
      assert.strictEqual(unauthShop.headers['x-refreshed-token'], undefined);

      const unauthEmail = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopEmail: 'victim@subexp.com',
        action: 'REVOKED'
      });
      assert.strictEqual(unauthEmail.status, 401);
      assert.strictEqual(unauthEmail.headers['x-refreshed-token'], undefined);

      // Floor Server -> 403
      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_SUB1', email: 'w@subexp.com', role: 'Floor Server' });
      const waiterRes = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopId: 'SHOP_EXP_SUB1',
        action: 'PAUSED'
      }, { authorization: `Bearer ${waiterTok}` });
      assert.strictEqual(waiterRes.status, 403);

      // Cross-tenant Owner (shopId mismatch) -> 403
      const attackerTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_ATTACKER', email: 'attacker@subexp.com', role: 'Owner' });
      const crossShop = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopId: 'SHOP_EXP_SUB1',
        action: 'REVOKED'
      }, { authorization: `Bearer ${attackerTok}` });
      assert.strictEqual(crossShop.status, 403);

      // Cross-tenant Owner (shopId omitted, email only) -> 403
      const crossEmail = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopEmail: 'victim@subexp.com',
        action: 'REVOKED'
      }, { authorization: `Bearer ${attackerTok}` });
      assert.strictEqual(crossEmail.status, 403);

      // Valid Owner -> 200
      const ownerTok = createSignedAuthToken({ storeCode: 'SHOP_EXP_SUB1', email: 'owner@subexp.com', role: 'Owner' });
      const okRes = await sendHttp(port, 'POST', '/api/subscription/manage', {
        shopId: 'SHOP_EXP_SUB1',
        action: 'PAUSED',
        reason: 'Scheduled pause'
      }, { authorization: `Bearer ${ownerTok}` });
      assert.strictEqual(okRes.status, 200);
      assert.strictEqual(okRes.body.status, 'PAUSED');
    });

    await asyncTest('IT2-02: Cross-tenant /admin-forgot-pin/reset (403) & wrong-purpose OTP (400) blocked on both Netlify & Express', async () => {
      // 1. Netlify: victim shop owned by victim@cafe.com; attacker@evil.com uses their own admin-pin-reset OTP -> 403 & ownerEmail preserved
      const victimStoreCode = 'SHOP_VICTIM_PIN';
      const victimOwnerEmail = 'victim@cafe.com';
      const attackerEmail = 'attacker@evil.com';
      const otpStoreMock = new Map();
      const victimShopData = {
        ownerEmail: victimOwnerEmail,
        profile: { name: 'Victim Cafe', ownerEmail: victimOwnerEmail, adminPinHash: 'orig_hash' },
        staff: [{ id: 1, name: 'Victim Owner', role: 'Admin', pinHash: 'orig_pin_hash' }]
      };
      let victimPatched = false;
      global.fetch = async (url, opts = {}) => {
        if (url.includes('/clients/_auth/otp/')) {
          const key = decodeURIComponent(url.split('/clients/_auth/otp/')[1]);
          if (opts.method === 'PATCH') {
            otpStoreMock.set(key, JSON.parse(opts.body).fields);
            return { ok: true, status: 200, text: async () => '' };
          }
          if (opts.method === 'DELETE') {
            otpStoreMock.delete(key);
            return { ok: true, status: 200 };
          }
          if (otpStoreMock.has(key)) {
            return { ok: true, status: 200, json: async () => ({ fields: otpStoreMock.get(key) }) };
          }
          return { ok: false, status: 404, text: async () => '' };
        }
        if (url.includes(victimStoreCode)) {
          if (opts.method === 'PATCH') {
            victimPatched = true;
            return { ok: true, status: 200, text: async () => '' };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ fields: jsonToFirestoreFields(victimShopData) })
          };
        }
        return { ok: false, status: 404, text: async () => '' };
      };

      // Wrong-purpose OTP ('login') on Netlify -> 400
      otpStoreMock.set(victimOwnerEmail, {
        otp: { stringValue: '112233' },
        email: { stringValue: victimOwnerEmail },
        purpose: { stringValue: 'login' },
        createdAt: { integerValue: String(Date.now()) },
        expiresAt: { integerValue: String(Date.now() + 600000) },
        attempts: { integerValue: '0' }
      });
      const wrongPurposeNet = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: victimOwnerEmail, otp: '112233', newPin: '4927', storeCode: victimStoreCode })
      }, {});
      assert.strictEqual(wrongPurposeNet.statusCode, 400);

      // Attacker valid admin-pin-reset OTP targeting victimStoreCode -> 403 & zero Firestore mutation
      otpStoreMock.set(attackerEmail, {
        otp: { stringValue: '778899' },
        email: { stringValue: attackerEmail },
        purpose: { stringValue: 'admin-pin-reset' },
        createdAt: { integerValue: String(Date.now()) },
        expiresAt: { integerValue: String(Date.now() + 600000) },
        attempts: { integerValue: '0' }
      });
      const hijackNet = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/auth/admin-forgot-pin/reset',
        body: JSON.stringify({ email: attackerEmail, otp: '778899', newPin: '9876', storeCode: victimStoreCode })
      }, {});
      assert.strictEqual(hijackNet.statusCode, 403);
      assert.strictEqual(victimPatched, false, 'Victim shop must NOT be patched on cross-tenant PIN reset');

      // 2. Express: auth-service shopStore & HTTP route
      resetAuthStore();
      const loginOtp = sendOtp('express_victim@billnawcafe.com', 'login');
      const vLogin = verifyOtp('express_victim@billnawcafe.com', loginOtp.data.devOtp, 'Express Victim Shop');
      const expVictimCode = vLogin.data.storeCode;

      // Wrong-purpose ('login') OTP -> 400
      const expLoginOtp2 = sendOtp('express_victim2@billnawcafe.com', 'login');
      const wrongPurposeExp = await sendHttp(port, 'POST', '/api/auth/admin-forgot-pin/reset', {
        email: 'express_victim2@billnawcafe.com',
        otp: expLoginOtp2.data.devOtp,
        newPin: '4927',
        storeCode: expVictimCode
      });
      assert.strictEqual(wrongPurposeExp.status, 400);

      // Attacker targeting expVictimCode -> 403 and ownerEmail preserved
      const atkOtp = requestAdminPinResetOtp('attacker_exp@billnawcafe.com', expVictimCode);
      const hijackExp = await sendHttp(port, 'POST', '/api/auth/admin-forgot-pin/reset', {
        email: 'attacker_exp@billnawcafe.com',
        otp: atkOtp.data.devOtp,
        newPin: '9876',
        storeCode: expVictimCode
      });
      assert.strictEqual(hijackExp.status, 403);
      assert.strictEqual(getShopRecord(expVictimCode).ownerEmail, 'express_victim@billnawcafe.com');
    });

    test('IT2-03: customToken preserves Floor Server role & verifyTenantAuthorization rejects empty tokenStore JWT', () => {
      resetAuthStore();
      const salt = crypto.randomBytes(16).toString('hex');
      const pwHash = hashPassword('WaiterPass1!', salt);
      setAuthUserRecord({
        uid: 'usr_waiter_it2',
        email: 'waiter_it2@billnawcafe.com',
        firstName: 'Waiter',
        shopName: 'Role Check Cafe',
        storeCode: 'SHOP_ROLE_CHK',
        passwordHash: pwHash,
        salt,
        role: 'Floor Server'
      });

      const loginRes = loginWithPassword({ email: 'waiter_it2@billnawcafe.com', password: 'WaiterPass1!' });
      assert.strictEqual(loginRes.status, 200);
      const decodedLoginCustom = verifySignedAuthToken(loginRes.data.customToken);
      assert.strictEqual(decodedLoginCustom.valid, true);
      assert.strictEqual(decodedLoginCustom.payload.role, 'Floor Server', 'loginWithPassword customToken must NOT escalate to Owner');

      const otpRes = sendOtp('waiter_it2@billnawcafe.com', 'login');
      const vOtpRes = verifyOtp('waiter_it2@billnawcafe.com', otpRes.data.devOtp);
      assert.strictEqual(vOtpRes.status, 200);
      const decodedOtpCustom = verifySignedAuthToken(vOtpRes.data.customToken);
      assert.strictEqual(decodedOtpCustom.valid, true);
      assert.strictEqual(decodedOtpCustom.payload.role, 'Floor Server', 'verifyOtp customToken must NOT escalate to Owner');

      // Empty storeCode JWT for non-SuperAdmin must be rejected (403) when targetStoreCode is set
      const emptyStoreJwt = createSignedAuthToken({ storeCode: '', email: 'nostore@t.com', role: 'Owner' });
      const emptyStoreAuth = verifyTenantAuthorization({ token: emptyStoreJwt, targetStoreCode: 'SHOP_TARGET', allowGracefulMigration: false });
      assert.strictEqual(emptyStoreAuth.authorized, false);
      assert.strictEqual(emptyStoreAuth.status, 403);

      // Lowercase 'superadmin' is normalized to SuperAdmin
      const lowerSuperJwt = createSignedAuthToken({ storeCode: '', email: 'sa@t.com', role: 'superadmin' });
      const superAuth = verifyTenantAuthorization({ token: lowerSuperJwt, targetStoreCode: 'SHOP_TARGET', allowGracefulMigration: false });
      assert.strictEqual(superAuth.authorized, true);
    });

    await asyncTest('IT2-04: sync-service preserves deletedStaffIds on replaceStaff+deletedStaffId, resets omitted-items tables & prunes kotPrintedMap', async () => {
      let patchedRootFields = null;
      let getCount = 0;
      const firestoreState = {
        deletedStaffIds: ['s0_prev'],
        staff: [{ id: 's1', name: 'Keep' }, { id: 's2', name: 'Remove' }],
        tables: {
          '1': {
            id: '1',
            status: 'kot',
            items: [
              { id: 'i1', name: 'Tea', qty: 1, qtyKotPrinted: 1 },
              { id: 'i2', name: 'Burger', qty: 1, qtyKotPrinted: 1 }
            ],
            kotPrintedMap: { i1: 1, Tea: 1, i2: 1, Burger: 1 }
          },
          '2': {
            id: '2',
            status: 'kot',
            items: [{ id: 'i3', name: 'Pasta', qty: 2, qtyKotPrinted: 2 }],
            kotPrintedMap: { i3: 2, Pasta: 2 }
          }
        }
      };

      global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') {
          getCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ fields: jsonToFirestoreFields(firestoreState) })
          };
        }
        if (method === 'PATCH' && !url.includes('/staff') && !url.includes('/tables')) {
          patchedRootFields = JSON.parse(opts.body).fields;
        }
        return { ok: true, status: 200, text: async () => '' };
      };

      // 1. replaceStaff: true + deletedStaffId: 's2' must fetch root and preserve 's0_prev'
      await syncStoreToFirestoreREST('SHOP_IT2_SYNC', {
        staff: [{ id: 's1', name: 'Keep' }],
        replaceStaff: true,
        deletedStaffId: 's2'
      });
      assert(getCount >= 1, 'Must GET root doc for deletedStaffId merge');
      assert.deepStrictEqual(firestoreValueToJson(patchedRootFields.deletedStaffIds).sort(), ['s0_prev', 's2']);

      // 2. deleteStaffFromFirestoreREST also preserves 's0_prev'
      patchedRootFields = null;
      await deleteStaffFromFirestoreREST('SHOP_IT2_SYNC', 's2', [{ id: 's1', name: 'Keep' }]);
      assert.deepStrictEqual(firestoreValueToJson(patchedRootFields.deletedStaffIds).sort(), ['s0_prev', 's2']);

      // 3. Table 2 reset WITHOUT items key ({ status: 'empty', occupied: false }) + Table 1 removing Burger (prunes kotPrintedMap)
      await syncStoreToFirestoreREST('SHOP_IT2_SYNC', {
        tables: {
          '1': {
            status: 'kot',
            items: [{ id: 'i1', name: 'Tea', qty: 1, qtyKotPrinted: 1 }],
            kotPrintedMap: { i1: 1, Tea: 1 }
          },
          '2': { status: 'empty', occupied: false }
        }
      });
      const tablesAfter = firestoreValueToJson(patchedRootFields.tables);
      assert.deepStrictEqual(tablesAfter['2'].items, [], 'Table 2 with omitted items & occupied:false must clear items');
      assert.deepStrictEqual(tablesAfter['2'].kotPrintedMap, {}, 'Table 2 must clear kotPrintedMap');
      assert.strictEqual(tablesAfter['1'].kotPrintedMap.Burger, undefined, 'Removed Burger must be pruned from kotPrintedMap');
      assert.strictEqual(tablesAfter['1'].kotPrintedMap.i2, undefined, 'Removed i2 must be pruned from kotPrintedMap');
      assert.strictEqual(tablesAfter['1'].kotPrintedMap.Tea, 1);
    });

    await asyncTest('IT2-05: /sync/store-data blocks Kitchen Chef & sensitive profile/ownerEmail tampering while preserving Floor Server persistTables', async () => {
      let lastPatched = null;
      global.fetch = async (url, opts = {}) => {
        if (opts.method === 'PATCH' && !url.includes('/tables/')) {
          lastPatched = JSON.parse(opts.body).fields;
        }
        return { ok: true, status: 200, json: async () => ({ fields: {} }), text: async () => '' };
      };

      const waiterTok = createSignedAuthToken({ storeCode: 'SHOP_SYNC_RBAC', email: 'w@sr.com', role: 'Floor Server' });
      const chefTok = createSignedAuthToken({ storeCode: 'SHOP_SYNC_RBAC', email: 'c@sr.com', role: 'Kitchen Chef' });

      // Floor Server persistTables ({ tables, profile, ownerEmail }) -> 200, but ownerEmail & profile NOT patched
      lastPatched = null;
      const waiterExpRes = await sendHttp(port, 'POST', '/api/sync/store-data', {
        storeCode: 'SHOP_SYNC_RBAC',
        ownerEmail: 'evil@hijack.com',
        profile: { name: 'Cafe', adminPinHash: 'evil_hash' },
        tables: { '1': { status: 'occupied', items: [{ id: 1, name: 'Chai', qty: 1 }] } }
      }, { authorization: `Bearer ${waiterTok}` });
      assert.strictEqual(waiterExpRes.status, 200);
      assert.strictEqual(lastPatched.ownerEmail, undefined, 'Floor Server must NOT patch ownerEmail');
      assert.strictEqual(lastPatched.profile, undefined, 'Floor Server must NOT patch profile');

      // Floor Server attempting pure ownerEmail/profile mutation -> 403 (Express + Netlify)
      assert.strictEqual((await sendHttp(port, 'POST', '/api/sync/store-data', {
        storeCode: 'SHOP_SYNC_RBAC',
        ownerEmail: 'evil@hijack.com'
      }, { authorization: `Bearer ${waiterTok}` })).status, 403);
      assert.strictEqual((await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/sync/store-data',
        headers: { authorization: `Bearer ${waiterTok}` },
        body: JSON.stringify({ storeCode: 'SHOP_SYNC_RBAC', profile: { adminPinHash: 'evil' } })
      }, {})).statusCode, 403);

      // Kitchen Chef blocked from tables/history/expenses/customers -> 403 (Express + Netlify)
      for (const badBody of [
        { storeCode: 'SHOP_SYNC_RBAC', tables: { '1': { status: 'empty' } } },
        { storeCode: 'SHOP_SYNC_RBAC', history: [] },
        { storeCode: 'SHOP_SYNC_RBAC', expenses: [] },
        { storeCode: 'SHOP_SYNC_RBAC', customers: [] }
      ]) {
        assert.strictEqual((await sendHttp(port, 'POST', '/api/sync/store-data', badBody, { authorization: `Bearer ${chefTok}` })).status, 403);
        assert.strictEqual((await netlifyApi.handler({
          httpMethod: 'POST',
          path: '/api/sync/store-data',
          headers: { authorization: `Bearer ${chefTok}` },
          body: JSON.stringify(badBody)
        }, {})).statusCode, 403);
      }
    });

    await asyncTest('IT2-06: Same-day endDate & Netlify GET /api/reports/download/:token parity', async () => {
      global.fetch = async (url) => {
        if (url.includes('SHOP_REP_IT2')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              fields: jsonToFirestoreFields({
                history: [
                  { id: 'INV-SAMEDAY', createdAt: '2026-11-10T14:30:00.000Z', total: 250, tax: 12.5, status: 'SETTLED', items: [{ name: 'Latte', qty: 1 }] }
                ]
              })
            })
          };
        }
        return { ok: false, status: 404, text: async () => '' };
      };

      const ownerA = createSignedAuthToken({ storeCode: 'SHOP_REP_IT2', email: 'a@rep2.com', role: 'Owner' });
      const waiterA = createSignedAuthToken({ storeCode: 'SHOP_REP_IT2', email: 'w@rep2.com', role: 'Floor Server' });
      const ownerB = createSignedAuthToken({ storeCode: 'SHOP_REP_OTHER', email: 'b@rep2.com', role: 'Owner' });

      // Express same-day endDate includes 14:30:00Z
      const expGen = await sendHttp(port, 'POST', '/api/reports/generate-statement', {
        storeCode: 'SHOP_REP_IT2',
        startDate: '2026-11-10',
        endDate: '2026-11-10'
      }, { authorization: `Bearer ${ownerA}` });
      assert.strictEqual(expGen.status, 200);
      assert.strictEqual(expGen.body.totalRecords, 1);
      createdUploadFiles.push(path.join(uploadsReportsDir, `${expGen.body.token}_${expGen.body.filename}`));

      // Netlify same-day endDate + downloadUrl + GET /reports/download/:token
      const netGen = await netlifyApi.handler({
        httpMethod: 'POST',
        path: '/api/reports/generate-statement',
        headers: { authorization: `Bearer ${ownerA}` },
        body: JSON.stringify({ storeCode: 'SHOP_REP_IT2', startDate: '2026-11-10', endDate: '2026-11-10' })
      }, {});
      assert.strictEqual(netGen.statusCode, 200);
      const netData = JSON.parse(netGen.body);
      assert.strictEqual(netData.totalRecords, 1);
      assert(netData.downloadUrl && netData.downloadUrl.includes(`/api/reports/download/${netData.token}`));

      // Netlify download auth/RBAC/tenant checks + CRLF sanitization
      const netDl401 = await netlifyApi.handler({
        httpMethod: 'GET',
        path: `/api/reports/download/${netData.token}`
      }, {});
      assert.strictEqual(netDl401.statusCode, 401);

      const netDl403w = await netlifyApi.handler({
        httpMethod: 'GET',
        path: `/api/reports/download/${netData.token}`,
        headers: { authorization: `Bearer ${waiterA}` }
      }, {});
      assert.strictEqual(netDl403w.statusCode, 403);

      const netDl403x = await netlifyApi.handler({
        httpMethod: 'GET',
        path: `/api/reports/download/${netData.token}`,
        headers: { authorization: `Bearer ${ownerB}` }
      }, {});
      assert.strictEqual(netDl403x.statusCode, 403);

      const netDl200 = await netlifyApi.handler({
        httpMethod: 'GET',
        path: `/api/reports/download/${netData.token}`,
        queryStringParameters: { filename: '../../bad"\r\nX-Test:1', authToken: ownerA }
      }, {});
      assert.strictEqual(netDl200.statusCode, 200);
      const disp = netDl200.headers['Content-Disposition'];
      assert(!disp.includes('\r') && !disp.includes('\n'));
      assert(disp.endsWith('.csv"'));
      assert(netDl200.body.includes('INV-SAMEDAY'));
    });
  } finally {
    global.fetch = originalFetch;
    server.close();
    // Clean up any temporary upload/report files created during test
    for (const f of createdUploadFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
  }

  console.log('\n====================================================================');
  console.log(`🎯 M1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch((err) => {
  console.error('Fatal M1 test suite error:', err);
  process.exit(1);
});
