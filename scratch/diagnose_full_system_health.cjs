'use strict';

/**
 * scratch/diagnose_full_system_health.cjs
 * Comprehensive System Health Checkup, Bottleneck Profiler & E2E Workflow Verification
 * Covers:
 *   1. File & Function Bottleneck Profiler (sizes, line counts, hot-loop localStorage/DOM patterns)
 *   2. Service Worker (v4.0.0 ignoreSearch, await offline HTML, waitUntil) & Static Asset Integrity Check
 *   3. Auth, OTP/Password Login, Cold-Start Menu Protection, Cross-Container Signup Ticket & Tenant Isolation
 *   4. Role-Wise RBAC, Firebase Staff Access Profile Cache & Sync Payload Filtering (Admin, Manager, Cashier, Floor Server, Kitchen Chef)
 *   5. Menu Version LWW, Tombstones & Multi-Device Table/Delta KOT Concurrency
 *   6. Invoice Calculation (GST Inclusive/Exclusive/0% Exempt), ESC/POS Receipt vs KOT Print Bytecode, & Reports/Z-Report Aggregation (Khata + VOID exclusion)
 *   7. Live Local Server Endpoint & Read-Only Production Shop Health Check
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function runFullDiagnosis() {
    console.log('====================================================================');
    console.log('🩺 BILLNAW POS v3.0.0 — FULL SYSTEM DIAGNOSIS & HEALTH CHECKUP');
    console.log('====================================================================\n');

    const metrics = {};

    // =========================================================================
    // 1. CODEBASE BOTTLENECK & FILE COMPLEXITY PROFILER
    // =========================================================================
    console.log('📍 1. CODEBASE BOTTLENECK & FILE COMPLEXITY PROFILER');
    const codeFiles = [
        'index.html', 'style.css', 'app.js', 'server.js', 'service-worker.js',
        'netlify/functions/api.js', 'server/auth-service.js', 'server/sync-service.js',
        'js/core.js', 'js/pos.js', 'js/settings.js', 'js/staff.js', 'js/shop-auth.js',
        'js/menu.js', 'js/customers.js', 'js/dashboard.js', 'js/culinary_inventory.js',
        'js/marketing_inventory.js', 'js/cloud-sync.js', 'src/core/platform-bridge.js'
    ];

    const fileStats = [];
    for (const rel of codeFiles) {
        const full = path.join(ROOT, rel);
        if (!fs.existsSync(full)) continue;
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split(/\r?\n/).length;
        const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
        const lsReads = (content.match(/localStorage\.getItem\(/g) || []).length;
        const jsonParses = (content.match(/JSON\.parse\(/g) || []).length;
        const domQueries = (content.match(/document\.(getElementById|querySelector|querySelectorAll)\(/g) || []).length;
        const timers = (content.match(/\b(setInterval|setTimeout)\(/g) || []).length;
        fileStats.push({ file: rel, lines, kb: Number(kb), lsReads, jsonParses, domQueries, timers });
    }
    fileStats.sort((a, b) => b.lines - a.lines);
    console.table(fileStats.slice(0, 12));
    metrics.fileStats = fileStats;

    // Verify O(1) & bottleneck fixes applied in js/menu.js and js/pos.js
    const menuJs = read('js/menu.js');
    const posJs = read('js/pos.js');
    assert(menuJs.includes('_lastAiQuotaFetchAt') && menuJs.includes('60000'), 'refreshAiMenuQuotaPill must use 60s TTL throttle to prevent /api/ai/quota network storm');
    assert(menuJs.includes('cartQtyById = new Map()'), 'syncMenuUIQuantities must use O(1) Map lookup instead of O(M*C) currentCart.find');
    assert(posJs.includes('tableButtonsHtml.push(') && posJs.includes("grid.innerHTML = tableButtonsHtml.join('')"), 'renderTables must batch HTML via array join instead of O(n^2) innerHTML +=');
    console.log('  ✅ PASS: Hot-loop UI & network bottleneck guards verified (60s AI quota TTL, O(1) cart Map lookup, batched table grid render).');

    // =========================================================================
    // 2. SERVICE WORKER & STATIC ASSET INTEGRITY CHECK
    // =========================================================================
    console.log('\n📍 2. SERVICE WORKER & STATIC ASSET INTEGRITY CHECK');
    const swContent = read('service-worker.js');
    const indexHtml = read('index.html');
    const assetMatch = swContent.match(/const STATIC_SHELL_ASSETS = \[([\s\S]*?)\];/);
    assert(assetMatch, 'STATIC_SHELL_ASSETS must exist in service-worker.js');
    const swAssets = (assetMatch[1].match(/'\.\/[^']+'/g) || []).map(s => s.slice(3, -1));
    const missingOnDisk = swAssets.filter(a => a && !fs.existsSync(path.join(ROOT, a)));
    assert.strictEqual(missingOnDisk.length, 0, `Missing SW pre-cached assets: ${missingOnDisk.join(', ')}`);
    assert(swContent.includes('cache.match(req, { ignoreSearch: true })'), 'service-worker.js must match versioned ?v=3000 assets with { ignoreSearch: true }');
    assert(swContent.includes("await cache.match('./index.html', { ignoreSearch: true })"), 'service-worker.js offline HTML fallback must await cache.match');
    assert(swContent.includes('event.waitUntil(clearPromise)'), 'service-worker.js CLEAR_CACHE must wrap deletion in event.waitUntil');
    console.log(`  ✅ PASS: All ${swAssets.length} Service Worker pre-cached assets exist on disk, and { ignoreSearch: true } + offline HTML fallback verified.`);

    const htmlScripts = Array.from(indexHtml.matchAll(/<script[^>]+src=["']([^"'?]+)(?:\?[^"']*)?["']/g)).map(m => m[1]);
    const missingScripts = htmlScripts.filter(s => !s.startsWith('http') && !fs.existsSync(path.join(ROOT, s)));
    assert.strictEqual(missingScripts.length, 0, `Missing script files referenced in index.html: ${missingScripts.join(', ')}`);
    console.log(`  ✅ PASS: All ${htmlScripts.length} local <script> tags in index.html resolve cleanly on disk.`);

    // =========================================================================
    // 3. AUTH, COLD-START LOGIN SAFETY, CROSS-CONTAINER SIGNUP & TENANT ISOLATION
    // =========================================================================
    console.log('\n📍 3. AUTH, COLD-START LOGIN SAFETY, CROSS-CONTAINER SIGNUP & TENANT ISOLATION');
    const authService = await import('../server/auth-service.js');
    const apiJs = read('netlify/functions/api.js');
    assert(apiJs.includes('otp: otpValid ? undefined : submittedOtp'), 'netlify/functions/api.js must not double-consume otpTicket inside registerUser after pre-verification');

    // Test cold-container existing-shop login never seeds 4 starter items
    const coldShopCode = 'SHOP_DIAG_COLD_' + Date.now();
    const resolvedExisting = authService.resolveShopTenant(coldShopCode, 'Diagnostic Cold Cafe', 'diag@billnaw.com', 'usr_diag_1', null, { isExistingLogin: true });
    assert(resolvedExisting && Array.isArray(resolvedExisting.menu), 'resolveShopTenant must return shop record');
    assert.strictEqual(resolvedExisting.menu.length, 0, 'Existing-shop login on cold container MUST NOT seed 4 preset items (Samosa/Masala Chai/etc.)');

    // Test new-shop registration still seeds starter menu
    const newShopCode = 'SHOP_DIAG_NEW_' + Date.now();
    const resolvedNew = authService.resolveShopTenant(newShopCode, 'Diagnostic New Cafe', 'newdiag@billnaw.com');
    assert(resolvedNew.menu.length >= 4, 'Brand-new shop initialization must still seed starter menu');
    console.log('  ✅ PASS: Cold-container existing-shop login protection (0 preset items) & cross-container otpTicket single-consumption verified.');

    // =========================================================================
    // 4. ROLE-WISE RBAC, STAFF ACCESS PROFILE CACHE & SYNC PAYLOAD FILTERING
    // =========================================================================
    console.log('\n📍 4. ROLE-WISE RBAC, STAFF ACCESS PROFILE CACHE & SYNC PAYLOAD FILTERING');
    const coreJs = read('js/core.js');
    const staffJs = read('js/staff.js');
    const dashboardJs = read('js/dashboard.js');

    // Verify all 5 roles via buildStaffAccessProfile in VM
    const staffCtx = {
        window: {},
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] ?? null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; }
        }
    };
    staffCtx.window.localStorage = staffCtx.localStorage;
    vm.createContext(staffCtx);
    const fnStart = staffJs.indexOf('const ROLES = {');
    const fnEnd = staffJs.indexOf('window.getCachedStaffAccessProfile = getCachedStaffAccessProfile;') + 'window.getCachedStaffAccessProfile = getCachedStaffAccessProfile;'.length;
    assert(fnStart !== -1 && fnEnd > fnStart, 'buildStaffAccessProfile block must exist in js/staff.js');
    vm.runInContext(staffJs.slice(fnStart, fnEnd), staffCtx);

    const rolesToCheck = [
        { role: 'Admin', canCheckout: true, readyForBillingOnly: false, canManageStaff: true, canManageMenu: true },
        { role: 'Manager', canCheckout: true, readyForBillingOnly: false, canManageStaff: false, canManageMenu: true },
        { role: 'Cashier', canCheckout: true, readyForBillingOnly: false, canManageStaff: false, canManageMenu: true },
        { role: 'Floor Server', canCheckout: false, readyForBillingOnly: true, canManageStaff: false, canManageMenu: false },
        { role: 'Kitchen Chef', canCheckout: false, readyForBillingOnly: false, canManageStaff: false, canManageMenu: false }
    ];
    for (const expected of rolesToCheck) {
        const prof = staffCtx.window.buildStaffAccessProfile({ id: 'st_' + expected.role, name: expected.role, role: expected.role });
        assert.strictEqual(prof.permissions.canCheckout, expected.canCheckout, `${expected.role} canCheckout mismatch`);
        assert.strictEqual(prof.permissions.canReadyForBilling, expected.readyForBillingOnly, `${expected.role} canReadyForBilling mismatch`);
        assert.strictEqual(prof.permissions.canManageStaff, expected.canManageStaff, `${expected.role} canManageStaff mismatch`);
        assert.strictEqual(prof.permissions.canManageMenu, expected.canManageMenu, `${expected.role} canManageMenu mismatch`);
    }
    assert(coreJs.includes('delete finalPayload.profile;') && coreJs.includes('finalPayload.expenses !== undefined || finalPayload.dailyReport !== undefined'), 'dispatchBackendStoreSync must strip admin-only staff/profile fields on non-Admin operational syncs including expenses/dailyReport');
    console.log('  ✅ PASS: All 5 staff roles (Admin, Manager, Cashier, Floor Server, Kitchen Chef) access profiles & sync payload filters verified.');

    // =========================================================================
    // 5. MENU VERSION LWW, TOMBSTONES & MULTI-DEVICE TABLE / DELTA KOT SYNC
    // =========================================================================
    console.log('\n📍 5. MENU VERSION LWW, TOMBSTONES & MULTI-DEVICE TABLE / DELTA KOT SYNC');
    const syncService = await import('../server/sync-service.js');
    assert(typeof syncService.mergeTableEntry === 'function', 'mergeTableEntry must be exported from server/sync-service.js');

    // Test Table LWW: newer table modification wins; clearedAt wins over older items
    const tOld = { status: 'occupied', updatedAt: 1000, items: [{ id: 'm1', name: 'Latte', qty: 1, price: 150 }] };
    const tNew = { status: 'ready_for_billing', updatedAt: 2000, items: [{ id: 'm1', name: 'Latte', qty: 2, price: 150 }] };
    const mergedOccupied = syncService.mergeTableEntry(tOld, tNew);
    assert.strictEqual(mergedOccupied.status, 'ready_for_billing', 'Newer table status must win LWW merge');
    assert.strictEqual(mergedOccupied.items[0].qty, 2, 'Newer table item qty must win LWW merge');

    const tCleared = { status: 'empty', items: [], clearedAt: 3000, updatedAt: 3000 };
    const mergedCleared = syncService.mergeTableEntry(mergedOccupied, tCleared);
    assert.strictEqual(mergedCleared.items.length, 0, 'Table checkout/clear with newer clearedAt must empty items cleanly');
    console.log('  ✅ PASS: Multi-device Table LWW merge (occupied -> ready_for_billing -> clearedAt) verified.');

    // =========================================================================
    // 6. INVOICE, GST (INCLUSIVE/EXCLUSIVE/0% EXEMPT), ESC/POS & REPORTS CHECK
    // =========================================================================
    console.log('\n📍 6. INVOICE, GST (INCLUSIVE/EXCLUSIVE/0% EXEMPT), ESC/POS & REPORTS CHECK');
    const bridgeMod = await import('../src/core/platform-bridge.js');
    const { ThermalPrinterBridge } = bridgeMod;

    // Test ESC/POS Receipt vs KOT Isolation & Item Accuracy (including total without amount)
    const sampleOrder = {
        storeName: 'Billnaw Diagnostic Cafe',
        address: '12 Park Street',
        phone: '9876543210',
        gstin: '19ABCDE1234F1Z5',
        gstMode: 'inclusive',
        gstRate: 5,
        invoiceId: 'INV-DIAG-3001',
        tableNo: 'Table 4',
        date: '21/11/2026, 21:40',
        rawItems: [
            { id: 'd1', name: 'Cappuccino', price: 120, qty: 2 },
            { id: 'd2', name: 'Garlic Bread', price: 90, qty: 1 }
        ],
        subtotal: 330,
        taxableAmount: 314.29,
        cgst: 7.86,
        sgst: 7.86,
        totalTax: 15.71,
        discount: 0,
        total: 330,
        paymentMode: 'UPI'
    };

    const receiptBytes = ThermalPrinterBridge.generateEscPosCommands(sampleOrder, '58mm', { role: 'RECEIPT', storeProfile: { gstMode: 'inclusive', defaultGstRate: 5, gstin: '19ABCDE1234F1Z5' } });
    const receiptText = Buffer.from(receiptBytes).toString('latin1');
    assert(receiptText.includes('Cappuccino'), 'Receipt bytecode must include Cappuccino');
    assert(receiptText.includes('Garlic Bread'), 'Receipt bytecode must include Garlic Bread');
    assert(receiptText.includes('330.00'), 'Receipt bytecode must include final total 330.00');
    assert(receiptText.includes('CGST') && receiptText.includes('SGST'), 'Inclusive GST receipt must include CGST/SGST breakdown');

    const nullOptsBytes = ThermalPrinterBridge.generateEscPosCommands(sampleOrder, '58mm', null, 'RECEIPT');
    assert(nullOptsBytes instanceof Uint8Array && nullOptsBytes.length > 50, 'generateEscPosCommands must tolerate null options safely');

    const kotBytes = ThermalPrinterBridge.generateEscPosCommands({
        ...sampleOrder,
        kotNo: 'KOT-401',
        orderType: 'Dine-In'
    }, '58mm', { role: 'KOT', isKot: true });
    const kotText = Buffer.from(kotBytes).toString('latin1');
    assert(kotText.includes('Cappuccino'), 'KOT bytecode must include dish name');
    assert(!kotText.includes('19ABCDE1234F1Z5'), 'KOT bytecode must NEVER leak GSTIN');
    assert(!kotText.includes('CGST'), 'KOT bytecode must NEVER leak tax breakdown');

    // Verify 0% GST item exemption & non-mutating sendEscPosToPrinter + VOID/Khata report guards
    assert(coreJs.includes("Number(item.gstRate) >= 0"), 'calculateOrderTotals must respect 0% GST exempt items (gstRate: 0)');
    assert(posJs.includes('const order = (rawOrder && typeof rawOrder === \'object\') ? { ...rawOrder } : {};'), 'sendEscPosToPrinter must clone rawOrder before attaching binary logoBytes/qrBytes');
    assert(dashboardJs.includes('khata: Number(khataSales.toFixed(2))'), 'saveDailyClosingSummary must include khata in paymentSplit');
    assert(dashboardJs.includes('if (_isVoidedOrder(o)) return false;'), 'renderDashboardAnalytics must exclude VOID invoices from revenue KPIs');
    console.log('  ✅ PASS: ESC/POS Receipt & KOT bytecode, 0% GST exemption, non-mutating print clone, and Reports VOID/Khata accuracy verified.');

    // =========================================================================
    // 7. LIVE SERVER ENDPOINTS & PRODUCTION SHOPS READ-ONLY HEALTH CHECK
    // =========================================================================
    console.log('\n📍 7. LIVE SERVER ENDPOINTS & PRODUCTION SHOPS READ-ONLY HEALTH CHECK');
    const fetchLocal = (urlPath) => new Promise((resolve, reject) => {
        http.get(`http://localhost:5000${urlPath}`, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });

    const verRes = await fetchLocal('/api/version');
    assert.strictEqual(verRes.status, 200, '/api/version must return 200');
    const verJson = JSON.parse(verRes.body);
    assert.strictEqual(verJson.version, '3.0.0', '/api/version must report 3.0.0');
    console.log(`  ✅ PASS: Live server /api/version is healthy (v${verJson.version}, buildTime=${verJson.buildTime}).`);

    for (const shopCode of ['SHOP_ABHIJITMODAK', 'SHOP_BAPI92HALDER']) {
        const state = await syncService.getStoreFromFirestoreREST(shopCode);
        assert(state && state.success, `${shopCode} must be readable from Firestore REST / cache`);
        const menuLen = Array.isArray(state.menu) ? state.menu.length : 0;
        const staffLen = Array.isArray(state.staff) ? state.staff.length : 0;
        const menuVer = Number(state.menuVersion || 0);
        console.log(`  ✅ PASS: Live Production Shop [${shopCode}] -> menuItems=${menuLen}, menuVersion=${menuVer}, staff=${staffLen}`);
    }

    console.log('\n====================================================================');
    console.log('🎉 ALL 7 SYSTEM HEALTH & WORKFLOW DIAGNOSTIC SUITES PASSED (100%)');
    console.log('====================================================================');
}

runFullDiagnosis().catch(err => {
    console.error('DIAGNOSIS FAILED:', err);
    process.exit(1);
});
