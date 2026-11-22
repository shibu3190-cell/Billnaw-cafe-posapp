/**
 * Phase 3 Production Security Hardening Verification Suite:
 * - P3-01: Zero hardcoded JWT_SECRET or tenant PIN hashes in netlify.toml, server/config.js, server/sync-service.js
 * - P3-02: Strict fail-closed auth (allowGracefulMigration = false) across all /api/sync/* endpoints on Express & Netlify
 * - P3-03: Dynamic getAuthTokenSecret() env resolution & CSPRNG ephemeral fallback (never leaked public string)
 * - P3-04: subscribeStaffCloudListener live role/name/PIN sync, active-staff RBAC refresh & tenant-scoped new-staff hydration (blocking orphaned/cross-tenant/leaked docs)
 * - P3-05: Live production shops (SHOP_ABHIJITMODAK & SHOP_BAPI92HALDER) read-only integrity without hardcoded staff fallbacks
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const LEAKED_SECRET_PREFIX = '0d39e4a18c195441866480868bada4fa';

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function makeStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => { store.clear(); }
    };
}

let passed = 0;
let failed = 0;

async function runTest(id, name, fn) {
    try {
        await fn();
        console.log(`✅ [PASS] ${id}: ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${id}: ${name}`);
        console.error('   ', err && err.stack ? err.stack : err);
        failed++;
    }
}

async function main() {
    console.log('====================================================================');
    console.log('🔐 PHASE 3: PRODUCTION SECURITY HARDENING VERIFICATION');
    console.log('====================================================================\n');

    // =========================================================================
    // P3-01: Zero hardcoded secrets or tenant PIN hashes in source/config
    // =========================================================================
    await runTest('P3-01', 'Zero hardcoded JWT_SECRET or tenant PIN hashes in netlify.toml, server/config.js, server/sync-service.js', async () => {
        const netlifyToml = read('netlify.toml');
        const configJs = read('server/config.js');
        const syncServiceJs = read('server/sync-service.js');
        const envExample = read('.env.example');

        assert.ok(!netlifyToml.includes(LEAKED_SECRET_PREFIX), 'netlify.toml MUST NOT contain hardcoded JWT_SECRET');
        assert.ok(!/^\s*JWT_SECRET\s*=/m.test(netlifyToml), 'netlify.toml MUST NOT define JWT_SECRET inline');
        assert.ok(!netlifyToml.includes('SECRETS_SCAN_ENABLED = "false"'), 'netlify.toml MUST NOT disable Netlify secrets scanning');

        assert.ok(!configJs.includes(LEAKED_SECRET_PREFIX), 'server/config.js MUST NOT contain hardcoded fallback JWT secret');
        assert.ok(configJs.includes('get jwtSecret()'), 'server/config.js should read jwtSecret dynamically from env');

        assert.ok(!syncServiceJs.includes('GENUINE_ABHIJIT_STAFF'), 'server/sync-service.js MUST NOT contain hardcoded GENUINE_ABHIJIT_STAFF');
        assert.ok(!syncServiceJs.includes('8c0a1dd483dbd4deda3d166eda111798'), 'server/sync-service.js MUST NOT contain hardcoded PIN hashes');
        assert.ok(!syncServiceJs.includes('pinSalt:'), 'server/sync-service.js MUST NOT contain hardcoded pinSalt values');
        assert.ok(syncServiceJs.includes('BAPI_QUARANTINE_STAFF_IDS'), 'BAPI_QUARANTINE_STAFF_IDS quarantine guard must remain intact');

        assert.ok(envExample.includes('JWT_SECRET='), '.env.example must document JWT_SECRET');
        assert.ok(envExample.includes('ALLOW_GRACEFUL_AUTH_MIGRATION=false'), '.env.example must document strict auth default');
    });

    // =========================================================================
    // P3-02: Strict fail-closed auth (allowGracefulMigration = false)
    // =========================================================================
    await runTest('P3-02', 'Strict fail-closed auth rejects unauthenticated /api/sync/* calls with 401 (Express & Netlify)', async () => {
        const authMod = await import('../server/auth-service.js');
        const netlifyApi = await import('../netlify/functions/api.js');

        // Default verifyTenantAuthorization must fail closed when no token is provided
        const defaultUnauth = authMod.verifyTenantAuthorization({
            token: null,
            targetStoreCode: 'SHOP_STRICT_DEFAULT'
        });
        assert.strictEqual(defaultUnauth.authorized, false, 'verifyTenantAuthorization must default allowGracefulMigration to false');
        assert.strictEqual(defaultUnauth.status, 401);
        assert.strictEqual(defaultUnauth.refreshedToken, undefined, 'Strict mode must never mint refreshedToken for unauthenticated callers');

        // All 6 Netlify /api/sync/* endpoints must return 401 when unauthenticated
        const syncRoutes = [
            { method: 'GET', path: '/api/sync/store-data', qs: { storeCode: 'SHOP_VICTIM_P3' } },
            { method: 'GET', path: '/api/sync/invoices', qs: { storeCode: 'SHOP_VICTIM_P3' } },
            { method: 'GET', path: '/api/sync/reports', qs: { storeCode: 'SHOP_VICTIM_P3' } },
            { method: 'POST', path: '/api/sync/store-data', body: { storeCode: 'SHOP_VICTIM_P3', tables: {} } },
            { method: 'POST', path: '/api/sync/staff', body: { storeCode: 'SHOP_VICTIM_P3', staff: [] } },
            { method: 'POST', path: '/api/sync/staff/delete', body: { storeCode: 'SHOP_VICTIM_P3', staffId: '1' } }
        ];

        const prevFlag = process.env.ALLOW_GRACEFUL_AUTH_MIGRATION;
        delete process.env.ALLOW_GRACEFUL_AUTH_MIGRATION;
        try {
            for (const route of syncRoutes) {
                const res = await netlifyApi.handler({
                    httpMethod: route.method,
                    path: route.path,
                    queryStringParameters: route.qs || {},
                    headers: { 'content-type': 'application/json' },
                    body: route.body ? JSON.stringify(route.body) : undefined
                });
                assert.strictEqual(res.statusCode, 401, `${route.method} ${route.path} MUST reject unauthenticated request with 401, got ${res.statusCode}`);
                assert.ok(!res.headers['x-refreshed-token'], `${route.method} ${route.path} MUST NOT mint x-refreshed-token on 401`);
            }
        } finally {
            if (prevFlag !== undefined) process.env.ALLOW_GRACEFUL_AUTH_MIGRATION = prevFlag;
        }

        // Static parity verification on Express server.js
        const serverCode = read('server.js');
        assert.ok(serverCode.includes('function checkTenantAuth(req, res, targetStoreCode, allowGracefulMigration = false'), 'server.js checkTenantAuth must default to false');
        assert.ok(!/checkTenantAuth\([^)]*,\s*true\s*\)/.test(serverCode), 'server.js must have ZERO hardcoded checkTenantAuth(..., true) calls');
        const netlifyCode = read('netlify/functions/api.js');
        assert.ok(!netlifyCode.includes('allowGracefulMigration: true'), 'netlify/functions/api.js must have ZERO hardcoded allowGracefulMigration: true calls');
    });

    // =========================================================================
    // P3-03: Dynamic getAuthTokenSecret() & CSPRNG ephemeral fallback
    // =========================================================================
    await runTest('P3-03', 'Dynamic getAuthTokenSecret() reads env dynamically and uses CSPRNG fallback when unset', async () => {
        const authMod = await import('../server/auth-service.js');
        const { CONFIG } = await import('../server/config.js');

        const savedEnv = {
            JWT_SECRET: process.env.JWT_SECRET,
            SESSION_SECRET: process.env.SESSION_SECRET,
            OTP_TICKET_SECRET: process.env.OTP_TICKET_SECRET,
            AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET
        };
        try {
            delete process.env.JWT_SECRET;
            delete process.env.SESSION_SECRET;
            delete process.env.OTP_TICKET_SECRET;
            delete process.env.AUTH_TOKEN_SECRET;

            assert.strictEqual(CONFIG.jwtSecret, '', 'CONFIG.jwtSecret must return empty string when env vars are unset');
            const ephemeralSecret = authMod.getAuthTokenSecret();
            assert.ok(typeof ephemeralSecret === 'string' && ephemeralSecret.length === 64, 'Ephemeral CSPRNG secret must be 64-char hex');
            assert.notStrictEqual(ephemeralSecret.slice(0, 32), LEAKED_SECRET_PREFIX, 'Ephemeral secret must never match leaked secret');

            process.env.JWT_SECRET = 'phase3_custom_test_secret_9876543210abcdef';
            assert.strictEqual(CONFIG.jwtSecret, 'phase3_custom_test_secret_9876543210abcdef');
            assert.strictEqual(authMod.getAuthTokenSecret(), 'phase3_custom_test_secret_9876543210abcdef');

            const tok = authMod.createSignedAuthToken({ storeCode: 'SHOP_P3_JWT', role: 'Admin' });
            const verified = authMod.verifySignedAuthToken(tok);
            assert.strictEqual(verified.valid, true, 'Token signed with dynamic JWT_SECRET must verify cleanly');
            assert.strictEqual(verified.payload.storeCode, 'SHOP_P3_JWT');
        } finally {
            for (const [k, v] of Object.entries(savedEnv)) {
                if (v === undefined) delete process.env[k];
                else process.env[k] = v;
            }
        }
    });

    // =========================================================================
    // P3-04: subscribeStaffCloudListener live role/name/PIN sync & tenant-scoped new staff
    // =========================================================================
    await runTest('P3-04', 'subscribeStaffCloudListener syncs role/name/PIN, refreshes active RBAC & hydrates tenant-scoped new staff', async () => {
        const coreCode = read('js/core.js');
        let capturedSnapshotCb = null;
        let restrictionsRefreshed = 0;
        let permissionsEnforced = 0;
        let cachedProfileRole = null;

        const sandbox = {
            window: {},
            document: {
                getElementById: () => null,
                querySelector: () => null,
                querySelectorAll: () => [],
                addEventListener: () => {},
                body: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
            },
            navigator: { onLine: true, userAgent: 'node-test' },
            location: { href: 'http://localhost:5000/', origin: 'http://localhost:5000', pathname: '/', search: '', hash: '' },
            localStorage: makeStorage({ billnaw_store_code: 'SHOP_P3_LIVE' }),
            sessionStorage: makeStorage(),
            idb: { get: async () => null, set: () => {}, clear: () => {} },
            console,
            setTimeout: () => 0,
            clearTimeout: () => {},
            setInterval: () => 0,
            clearInterval: () => {},
            Date, Math, JSON, Number, Array, Object, String, Map, Set, Promise, RegExp, Error, URL, URLSearchParams,
            CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
            dispatchEvent: () => true,
            fetch: async () => ({ ok: true, json: async () => ({}) }),
            firestoreDB: {},
            firestoreCollection: () => ({ path: 'shops/SHOP_P3_LIVE/staff' }),
            firestoreDoc: () => ({}),
            firestoreOnSnapshot: (ref, cb) => {
                capturedSnapshotCb = cb;
                return () => {};
            },
            buildStaffAccessProfile: (s) => ({
                role: s.role,
                permissions: s.role === 'Cashier' ? { canCheckout: true } : { canCheckout: false },
                allowedTabs: s.role === 'Cashier' ? ['pos', 'tables', 'reports'] : ['pos', 'tables']
            }),
            cacheStaffAccessProfile: (s) => {
                cachedProfileRole = s.role;
                sandbox.currentStaff = { ...sandbox.currentStaff, ...s };
                sandbox.window.currentStaff = sandbox.currentStaff;
                return { role: s.role };
            },
            applyStationProfileRestrictions: () => { restrictionsRefreshed++; },
            enforcePermissions: () => { permissionsEnforced++; },
            renderStaffManagementUI: () => {},
            renderLoginStaffPicker: () => {},
            renderStaffList: () => {},
            renderAvatarPicker: () => {}
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        sandbox.addEventListener = () => {};

        vm.createContext(sandbox);
        vm.runInContext(coreCode, sandbox, { filename: 'js/core.js' });

        // Attach spies AFTER core.js defines its own applyStationProfileRestrictions
        sandbox.applyStationProfileRestrictions = () => { restrictionsRefreshed++; };
        sandbox.window.applyStationProfileRestrictions = sandbox.applyStationProfileRestrictions;
        sandbox.enforcePermissions = () => { permissionsEnforced++; };
        sandbox.window.enforcePermissions = sandbox.enforcePermissions;

        // Seed initial authoritative roster & active Floor Server staff
        vm.runInContext(`
            shopProfile = { name: 'P3 Cafe', storeCode: 'SHOP_P3_LIVE' };
            myClientID = 'SHOP_P3_LIVE';
            staffList = [
                { id: '1', name: 'Owner', role: 'Admin', status: 'Active' },
                { id: '201', name: 'Ravi', role: 'Floor Server', status: 'Active', pinHash: 'oldhash' }
            ];
            window.staffList = staffList;
            currentStaff = { id: '201', name: 'Ravi', role: 'Floor Server' };
            window.currentStaff = currentStaff;
            subscribeStaffCloudListener('SHOP_P3_LIVE');
        `, sandbox);

        assert.ok(typeof capturedSnapshotCb === 'function', 'subscribeStaffCloudListener must attach firestoreOnSnapshot callback');

        // Emit snapshot containing:
        // 1. Existing staff 201 promoted from Floor Server -> Cashier + renamed
        // 2. Brand-new tenant-scoped staff 305 (storeCode matches SHOP_P3_LIVE, non-Admin) -> MUST BE ADDED
        // 3. Unscoped orphaned doc 999 (no storeCode) -> MUST BE REJECTED
        // 4. Cross-tenant doc 888 (wrong storeCode: SHOP_OTHER) -> MUST BE REJECTED
        // 5. Inactive subdoc 777 -> MUST BE REJECTED
        // 6. Rogue Admin self-injection 666 -> MUST BE REJECTED
        const mockDocs = [
            { id: '201', data: () => ({ id: '201', name: 'Ravi Kumar', role: 'Cashier', status: 'Active', pinHash: 'oldhash', storeCode: 'SHOP_P3_LIVE' }) },
            { id: '305', data: () => ({ id: '305', name: 'New Priya', role: 'Manager', status: 'Active', storeCode: 'SHOP_P3_LIVE' }) },
            { id: '999', data: () => ({ id: '999', name: 'Orphan Phantom', role: 'Cashier', status: 'Active' }) },
            { id: '888', data: () => ({ id: '888', name: 'Cross Tenant', role: 'Cashier', status: 'Active', storeCode: 'SHOP_OTHER' }) },
            { id: '777', data: () => ({ id: '777', name: 'Inactive Staff', role: 'Cashier', status: 'Inactive', storeCode: 'SHOP_P3_LIVE' }) },
            { id: '666', data: () => ({ id: '666', name: 'Rogue Admin', role: 'Admin', status: 'Active', storeCode: 'SHOP_P3_LIVE' }) }
        ];
        capturedSnapshotCb({ forEach: (fn) => mockDocs.forEach(fn) });

        const updatedRoster = sandbox.window.staffList;
        const ravi = updatedRoster.find(s => String(s.id) === '201');
        const priya = updatedRoster.find(s => String(s.id) === '305');
        const orphan = updatedRoster.find(s => String(s.id) === '999');
        const crossTenant = updatedRoster.find(s => String(s.id) === '888');
        const inactiveStaff = updatedRoster.find(s => String(s.id) === '777');
        const rogueAdmin = updatedRoster.find(s => String(s.id) === '666');

        assert.ok(ravi && ravi.role === 'Cashier' && ravi.name === 'Ravi Kumar', 'Existing staff role & name change MUST sync live via subcollection');
        assert.strictEqual(ravi.permissions?.canCheckout, true, 'Role change must recompute canonical permissions');
        assert.strictEqual(cachedProfileRole, 'Cashier', 'Active logged-in staff role change must refresh cached access profile');
        assert.ok(restrictionsRefreshed >= 1 && permissionsEnforced >= 1, 'Active staff role change must refresh RBAC UI restrictions immediately');

        assert.ok(priya && priya.name === 'New Priya' && priya.role === 'Manager', 'Newly created tenant-scoped staff subdoc MUST hydrate into staffList');
        assert.strictEqual(orphan, undefined, 'Unscoped legacy/orphan subdoc MUST NOT inject into staffList');
        assert.strictEqual(crossTenant, undefined, 'Cross-tenant subdoc MUST NOT inject into staffList');
        assert.strictEqual(inactiveStaff, undefined, 'Inactive staff subdoc MUST NOT inject into staffList');
        assert.strictEqual(rogueAdmin, undefined, 'Privileged Admin subdoc MUST NOT self-inject outside root store document');

        // Also verify existing non-Admin staff cannot self-escalate to Admin via subcollection doc
        capturedSnapshotCb({
            forEach: (fn) => [{ id: '201', data: () => ({ id: '201', name: 'Ravi Kumar', role: 'Admin', status: 'Active', storeCode: 'SHOP_P3_LIVE' }) }].forEach(fn)
        });
        assert.strictEqual(sandbox.window.staffList.find(s => String(s.id) === '201').role, 'Cashier', 'Subcollection doc MUST NOT escalate non-Admin to Admin');
    });

    // =========================================================================
    // P3-05: Live production shops read-only integrity (no hardcoded fallback)
    // =========================================================================
    await runTest('P3-05', 'Live production shops SHOP_ABHIJITMODAK & SHOP_BAPI92HALDER remain 100% intact without hardcoded staff hashes', async () => {
        const { getStoreFromFirestoreREST, BAPI_QUARANTINE_STAFF_IDS } = await import('../server/sync-service.js');

        const abhi = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
        assert.strictEqual(abhi.success, true, 'SHOP_ABHIJITMODAK read must succeed');
        assert.strictEqual(abhi.staff.length, 6, `SHOP_ABHIJITMODAK must still load all 6 staff from Firestore, got ${abhi.staff.length}`);
        for (const qId of BAPI_QUARANTINE_STAFF_IDS) {
            assert.ok(!abhi.staff.some(s => String(s.id) === qId), `Quarantined ID ${qId} must not appear in SHOP_ABHIJITMODAK`);
        }

        const bapi = await getStoreFromFirestoreREST('SHOP_BAPI92HALDER');
        assert.strictEqual(bapi.success, true, 'SHOP_BAPI92HALDER read must succeed');
        assert.ok(Array.isArray(bapi.staff) && bapi.staff.length >= 8, 'SHOP_BAPI92HALDER staff must remain intact');
    });

    // =========================================================================
    // P3-06: Operational Polish (Clean new-shop defaults, salted signup PIN, explicit clearUpiId/clearLogo)
    // =========================================================================
    await runTest('P3-06', 'New-shop clean defaults, salted signup admin PIN (no plaintext pin) & explicit clearUpiId/clearLogo sync', async () => {
        const { createDefaultShopDocument } = await import('../server/auth-service.js');
        const { syncStoreToFirestoreREST } = await import('../server/sync-service.js');

        // 1. Clean new-shop defaults & zero plaintext PIN on staff[0]
        const newShop = createDefaultShopDocument('SHOP_CLEAN_NEW', 'Fresh Roast', 'owner@freshroast.in', 'uid_fr', '7890', { isExistingLogin: false });
        assert.strictEqual(newShop.profile.address, '', 'New shop address must default empty (no dummy Kolkata address)');
        assert.strictEqual(newShop.profile.phone, '', 'New shop phone must default empty');
        assert.strictEqual(newShop.profile.fssai, '', 'New shop fssai must default empty');
        assert.strictEqual(newShop.profile.gstin, '', 'New shop gstin must default empty');
        assert.strictEqual(newShop.profile.upiId, '', 'New shop upiId must default empty');
        assert.strictEqual(newShop.profile.showQr, false, 'New shop showQr must default false until UPI is configured');
        assert.strictEqual(newShop.profile.gstMode, 'inclusive');
        assert.strictEqual(newShop.profile.defaultGstRate, 5);
        assert.strictEqual(newShop.staff[0].pin, undefined, 'Signup staff[0] MUST NOT store plaintext pin');
        assert.ok(newShop.staff[0].pinSalt && newShop.staff[0].pinSalt.length === 32, 'Signup staff[0] must store 32-char hex pinSalt');
        assert.ok(newShop.staff[0].pinHash && newShop.staff[0].pinHash.length === 64, 'Signup staff[0] must store SHA-256 pinHash');
        assert.strictEqual(newShop.staff[0].pinHash, newShop.staff[0].pin_hash, 'pinHash and pin_hash must match');

        // 2. Explicit clearUpiId / clearLogo vs partial-update preservation on server sync
        const origFetch = global.fetch;
        let storedProfile = { name: 'Demo Cafe', upiId: 'old@upi', logo: 'data:image/jpeg;base64,OLD', showQr: true };
        global.fetch = async (url, opts = {}) => {
            if (opts.method === 'PATCH') {
                const body = JSON.parse(opts.body);
                const pf = body.fields?.profile?.mapValue?.fields || {};
                storedProfile = {
                    name: pf.name?.stringValue ?? storedProfile.name,
                    upiId: pf.upiId?.stringValue ?? '',
                    logo: pf.logo?.stringValue ?? '',
                    clearUpiId: pf.clearUpiId?.booleanValue ?? false,
                    clearLogo: pf.clearLogo?.booleanValue ?? false
                };
                return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    fields: {
                        storeCode: { stringValue: 'SHOP_CLEAR_TEST' },
                        profile: {
                            mapValue: {
                                fields: {
                                    name: { stringValue: storedProfile.name },
                                    upiId: { stringValue: storedProfile.upiId },
                                    logo: { stringValue: storedProfile.logo }
                                }
                            }
                        }
                    }
                }),
                text: async () => '{}'
            };
        };
        try {
            // Partial update omitting upiId/logo MUST preserve existing values
            await syncStoreToFirestoreREST('SHOP_CLEAR_TEST', { profile: { name: 'Demo Cafe Renamed' } });
            assert.strictEqual(storedProfile.upiId, 'old@upi', 'Partial update without clearUpiId must preserve upiId');
            assert.strictEqual(storedProfile.logo, 'data:image/jpeg;base64,OLD', 'Partial update without clearLogo must preserve logo');

            // Explicit clearUpiId + clearLogo MUST clear both to empty string
            await syncStoreToFirestoreREST('SHOP_CLEAR_TEST', { profile: { name: 'Demo Cafe Renamed', upiId: '', clearUpiId: true, logo: '', clearLogo: true } });
            assert.strictEqual(storedProfile.upiId, '', 'Explicit clearUpiId:true must clear upiId to empty string');
            assert.strictEqual(storedProfile.logo, '', 'Explicit clearLogo:true must clear logo to empty string');

            // Setting new upiId & logo afterward must reset clear flags and persist new values
            await syncStoreToFirestoreREST('SHOP_CLEAR_TEST', { profile: { name: 'Demo Cafe Renamed', upiId: 'fresh@upi', logo: 'data:image/jpeg;base64,NEW' } });
            assert.strictEqual(storedProfile.upiId, 'fresh@upi', 'Setting new upiId after clear must persist cleanly');
            assert.strictEqual(storedProfile.logo, 'data:image/jpeg;base64,NEW', 'Setting new logo after clear must persist cleanly');
            assert.strictEqual(storedProfile.clearUpiId, false, 'clearUpiId must reset to false once a new upiId is saved');
            assert.strictEqual(storedProfile.clearLogo, false, 'clearLogo must reset to false once a new logo is saved');
        } finally {
            global.fetch = origFetch;
        }
    });

    console.log('\n====================================================================');
    console.log(`Phase 3 Summary: ${passed} passed, ${failed} failed`);
    console.log('====================================================================');
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
