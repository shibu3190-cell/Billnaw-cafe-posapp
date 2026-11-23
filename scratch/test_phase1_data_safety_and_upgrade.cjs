'use strict';

/**
 * scratch/test_phase1_data_safety_and_upgrade.cjs
 * Behavioral & contract verification for Phase 1:
 *   - P1-01: Strictly monotonic server menuVersion (no downgrade, no v+1 collision) + client adoption
 *   - P1-02: Cold-container fail-closed partial table merge via Firestore dot-path field mask (tables.<tId>)
 *   - P1-03: Canonical /invoices/{docId} parity (id || billNo) & persistent lastBillNo across 10-day pruner
 *   - P1-04: applyAppUpdate stale session stripping + storeCode-scoped queue guard + _v3ResyncFailed epoch guard
 *   - P1-05: Unified CafePOS_DB v2 schema (6 stores) + awaited IDB writes + onversionchange + queue-generation safety
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function run() {
    console.log('====================================================================');
    console.log('🛡️ PHASE 1: DATA SAFETY & EXISTING SHOP UPGRADE VERIFICATION');
    console.log('====================================================================\n');

    const syncService = await import('../server/sync-service.js');
    const coreJs = read('js/core.js');
    const posJs = read('js/pos.js');
    const shopAuthJs = read('js/shop-auth.js');
    const dbMigratorJs = read('src/core/db-migrator.js');

    // -------------------------------------------------------------------------
    // P1-01: Strictly Monotonic Server menuVersion (Live Mock Fetch Behavioral Test)
    // -------------------------------------------------------------------------
    const origFetch = global.fetch;
    try {
        const mockCode = 'SHOP_P1_MONO_' + Date.now();
        let cloudMenuVer = 1795339806973;
        const patchLog = [];

        global.fetch = async (url, opts = {}) => {
            const u = String(url);
            if (!opts.method || opts.method === 'GET') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        fields: {
                            menuVersion: { integerValue: String(cloudMenuVer) },
                            tables: { mapValue: { fields: { '1': { mapValue: { fields: { status: { stringValue: 'occupied' } } } } } } }
                        }
                    })
                };
            }
            if (opts.method === 'PATCH') {
                const bodyObj = opts.body ? JSON.parse(opts.body) : {};
                patchLog.push({ url: u, body: bodyObj });
                if (bodyObj?.fields?.menuVersion?.integerValue) {
                    cloudMenuVer = Number(bodyObj.fields.menuVersion.integerValue);
                }
                return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
        };

        // 1a. Stale un-updated device sends menuVersion: 6 against existing shop at 1795339806973
        const res1 = await syncService.syncStoreToFirestoreREST(mockCode, {
            menu: [{ id: 'm1', name: 'Espresso', price: 120 }],
            menuVersion: 6
        });
        assert.strictEqual(res1.success, true, 'Sync must succeed');
        assert.strictEqual(res1.staleMenuRejected, true, 'Stale device v6 MUST NOT overwrite cloud menu');
        assert.strictEqual(res1.cloudMenuVersion, 1795339806973, 'Cloud version 1795339806973 must be preserved');

        // 1b. Concurrent admin sends same version 1795339806973 -> must advance to 1795339806974
        const res2 = await syncService.syncStoreToFirestoreREST(mockCode, {
            menu: [{ id: 'm1', name: 'Espresso', price: 130 }],
            menuVersion: 1795339806973
        });
        assert.strictEqual(res2.menuVersion, 1795339806974, 'Same-version concurrent edit must advance monotonically to 1795339806974');

        // 1c. Client adopts server-returned menuVersion & reconcileExistingShopCloudSync sends menuVersion
        assert(coreJs.includes('if (respJson && Number.isFinite(Number(respJson.menuVersion)) && Number(respJson.menuVersion) > 0)'), 'dispatchBackendStoreSync must adopt server-returned menuVersion');
        assert(coreJs.includes('menuVersion: safeMenuToSend ? currentMenuVer : undefined'), 'reconcileExistingShopCloudSync must include menuVersion when syncing menu');
        console.log('  ✅ PASS: P1-01 — Strictly monotonic menuVersion (no downgrade, no v+1 collision, client adoption verified).');

        // ---------------------------------------------------------------------
        // P1-02: Cold-Container Fail-Closed Partial Table Merge (Dot-Path Mask)
        // ---------------------------------------------------------------------
        const coldTableShop = 'SHOP_P1_COLDTBL_' + Date.now();
        let capturedTablePatchUrl = '';
        global.fetch = async (url, opts = {}) => {
            const u = String(url);
            if (!opts.method || opts.method === 'GET') {
                // Simulate cold-container GET failure (503 Service Unavailable)
                return { ok: false, status: 503, text: async () => 'Service Unavailable' };
            }
            if (opts.method === 'PATCH' && u.includes(`/shops/${coldTableShop}?`)) {
                capturedTablePatchUrl = u;
                return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
        };

        const tblRes = await syncService.syncStoreToFirestoreREST(coldTableShop, {
            tables: { '4': { status: 'occupied', updatedAt: Date.now(), items: [{ id: 'i1', name: 'Latte', qty: 1, price: 150 }] } }
        });
        assert.strictEqual(tblRes.success, true, 'Cold-container single-table patch must succeed');
        assert(capturedTablePatchUrl.includes('updateMask.fieldPaths=tables.4'), `Expected per-table dot-path mask tables.4, got: ${capturedTablePatchUrl}`);
        assert(!capturedTablePatchUrl.includes('updateMask.fieldPaths=tables&') && !capturedTablePatchUrl.endsWith('updateMask.fieldPaths=tables'), 'Must NOT overwrite entire tables map when GET rootUrl failed on cold container');
        console.log('  ✅ PASS: P1-02 — Cold-container partial table sync uses dot-path mask (tables.4) without wiping other tables.');
    } finally {
        global.fetch = origFetch;
    }

    // -------------------------------------------------------------------------
    // P1-03: Canonical /invoices/{docId} Parity & Persistent lastBillNo Across 10-Day Pruner
    // -------------------------------------------------------------------------
    assert(coreJs.includes("const rawId = String(newOrder.id || newOrder.billNo || '').trim();"), 'persistHistoryFirebase must match server canonical docId priority (id || billNo)');
    assert(coreJs.includes('function recordHighestBillNumber('), 'js/core.js must define recordHighestBillNumber');
    assert(coreJs.includes('if (order && order._isCloudArchive === true) return true;'), '10-day pruner must preserve explicitly loaded cloud archive invoices');
    assert(posJs.includes("localStorage.getItem('billnaw_last_bill_no')") && posJs.includes('persistedLastBillNo + 1'), 'confirmCheckout must honor persisted billnaw_last_bill_no so 10-day pruning never resets billNo');

    // Behavioral VM test of recordHighestBillNumber
    const billCtx = {
        window: {},
        shopProfile: { startInvoiceNo: 1001 },
        localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } }
    };
    vm.createContext(billCtx);
    const recStart = coreJs.indexOf('function recordHighestBillNumber(');
    const recEnd = coreJs.indexOf('window.recordHighestBillNumber = recordHighestBillNumber;') + 'window.recordHighestBillNumber = recordHighestBillNumber;'.length;
    vm.runInContext(coreJs.slice(recStart, recEnd), billCtx);
    const highest = billCtx.window.recordHighestBillNumber([{ billNo: 1042 }, { billNo: 'BILL-1099' }, { billNo: 1050 }]);
    assert.strictEqual(highest, 1099, 'recordHighestBillNumber must extract numeric max across numeric & prefixed billNos');
    assert.strictEqual(billCtx.localStorage.getItem('billnaw_last_bill_no'), '1099', 'billnaw_last_bill_no must persist in localStorage');
    assert.strictEqual(billCtx.shopProfile.lastBillNo, 1099, 'shopProfile.lastBillNo must update');
    console.log('  ✅ PASS: P1-03 — Canonical /invoices/{docId} parity & persistent lastBillNo watermark verified.');

    // -------------------------------------------------------------------------
    // P1-04: applyAppUpdate Stale Session Strip, Scoped Queue & _v3ResyncFailed Guard
    // -------------------------------------------------------------------------
    assert(shopAuthJs.includes('const { menu, staff, tables, history, categories, expenses, customers, ...cleanShopMeta } = sessParsed.shop;'), 'applyAppUpdate must strip stale embedded menu/staff/tables/history from preserved billnaw_shop_session');
    assert(shopAuthJs.includes("'billnaw_last_bill_no'"), 'applyAppUpdate must preserve billnaw_last_bill_no across upgrades');
    assert(shopAuthJs.includes('hasActiveStorePending'), 'applyAppUpdate offline queue guard must be scoped to active storeCode');
    assert(coreJs.includes('typeof window.clearAllTenantLocalData === \'function\''), 'core.js revocation & resync rejection must await canonical window.clearAllTenantLocalData');
    assert(coreJs.includes('!(typeof window !== \'undefined\' && window._v3ResyncFailed)'), 'initDatabase must skip destructive epoch purge when _v3ResyncFailed is true');
    console.log('  ✅ PASS: P1-04 — applyAppUpdate stale session strip, active-store queue scope & _v3ResyncFailed epoch guard verified.');

    // -------------------------------------------------------------------------
    // P1-05: Unified CafePOS_DB v2 Schema, Awaited IDB Transactions & Queue-Gen Guard
    // -------------------------------------------------------------------------
    for (const storeName of ['store', 'orders', 'kot_records', 'menu_items', 'offline_sync_queue', 'local_settings']) {
        assert(coreJs.includes(`'${storeName}'`), `js/core.js CafePOS_DB must create '${storeName}' store`);
        assert(dbMigratorJs.includes(`'${storeName}'`), `src/core/db-migrator.js CafePOS_DB must create '${storeName}' store`);
    }
    assert(coreJs.includes('this.db.onversionchange = () =>'), 'js/core.js idb must register onversionchange handler');
    assert(dbMigratorJs.includes('dbInstance.onversionchange = () =>'), 'src/core/db-migrator.js must register onversionchange handler');
    assert(coreJs.includes('tx.oncomplete = () => resolve(true);') && coreJs.includes('del: async function(key)'), 'js/core.js idb must await tx.oncomplete and expose idb.del alias');
    assert(coreJs.includes('_syncQueueGenByStore') && coreJs.includes('if (latestGen === dispatchGen)'), 'dispatchBackendStoreSync must guard offline queue clear with generation counter');
    console.log('  ✅ PASS: P1-05 — Unified CafePOS_DB v2 schema (6 stores), awaited IDB writes, onversionchange & queue-gen guard verified.');

    console.log('\n====================================================================');
    console.log('🎉 ALL 5 PHASE 1 DATA SAFETY & UPGRADE SUITES PASSED (100%)');
    console.log('====================================================================');
}

run().catch(err => {
    console.error('PHASE 1 TEST FAILED:', err);
    process.exit(1);
});
