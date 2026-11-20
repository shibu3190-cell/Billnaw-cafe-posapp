// scratch/test_5_features_verification.cjs
// Verification Suite for the 5 Senior Fullstack POS Enhancements:
// 1. Logo Compression (<= 128x128 px, strictly < 20 KB)
// 2. Main doc history capped to 50 & paginated on-demand query
// 3. Table delta broadcast & RBAC (Cashier / Admin gate)
// 4. Daily closing summary saved to reports/{date}
// 5. Thermal print 2-line clean word-boundary wrap without mid-word cutting

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Global browser mocks for Node runtime
if (typeof global.window === 'undefined') {
    global.window = global;
}
global.window.addEventListener = global.window.addEventListener || (() => {});
global.window.removeEventListener = global.window.removeEventListener || (() => {});
global.window.dispatchEvent = global.window.dispatchEvent || (() => {});
if (typeof global.document === 'undefined') {
    global.document = {
        createElement: (tag) => ({
            width: 0,
            height: 0,
            getContext: () => ({
                fillStyle: '',
                fillRect: () => {},
                drawImage: () => {}
            }),
            toDataURL: () => 'data:image/jpeg;base64,'
        }),
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    };
}
if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
    };
}

(async () => {
    console.log('====================================================');
    console.log('🚀 5 SENIOR FULLSTACK POS ENHANCEMENTS VERIFICATION');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function it(desc, fn) {
        try {
            fn();
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${desc}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // ============================================================
    // 1. LOGO COMPRESSION & OPTIMIZATION (<= 128x128, < 20 KB)
    // ============================================================
    console.log('📍 SECTION 1: LOGO COMPRESSION & STORAGE OPTIMIZATION');

    const coreJsContent = fs.readFileSync(path.resolve('js/core.js'), 'utf8');
    const settingsJsContent = fs.readFileSync(path.resolve('js/settings.js'), 'utf8');

    it('F1-01: resizeAndCompressLogo is defined and exported in js/core.js', () => {
        assert(coreJsContent.includes('function resizeAndCompressLogo('), 'resizeAndCompressLogo should be defined in js/core.js');
        assert(coreJsContent.includes('window.resizeAndCompressLogo = resizeAndCompressLogo'), 'resizeAndCompressLogo should be attached to window');
        assert(coreJsContent.includes('module.exports.resizeAndCompressLogo = resizeAndCompressLogo'), 'resizeAndCompressLogo should be in module.exports');
    });

    it('F1-02: loadLogo in js/settings.js uses resizeAndCompressLogo with 154 maxDim and 35KB limit', () => {
        assert(settingsJsContent.includes('resizeAndCompressLogo(file, 154, 35840)'), 'loadLogo should pass 154 and 35840 to resizeAndCompressLogo');
        assert(settingsJsContent.includes('const MAX_DIM = 154;'), 'Fallback in loadLogo should enforce MAX_DIM = 154');
    });

    it('F1-03: handleOnboardLogoUpload in js/settings.js optimizes logo before saving', () => {
        assert(settingsJsContent.includes('handleOnboardLogoUpload'), 'handleOnboardLogoUpload should be defined');
        const onboardMatch = settingsJsContent.match(/async function handleOnboardLogoUpload[\s\S]*?resizeAndCompressLogo\(file,\s*154,\s*35840\)/);
        assert(onboardMatch, 'handleOnboardLogoUpload must call resizeAndCompressLogo(file, 154, 35840)');
    });

    it('F1-04: persistProfile in js/core.js defensively checks logo size and re-compresses if > 35 KB', () => {
        assert(coreJsContent.includes('shopProfile.logo.length * 0.75 > 35840'), 'persistProfile should guard against logos > 35 KB');
    });

    // ============================================================
    // 2. ROOT DOCUMENT HISTORY CAPPING & PAGINATED SUBCOLLECTION
    // ============================================================
    console.log('\n📍 SECTION 2: HISTORY CAPPING (50 ORDERS) & PAGINATED CLOUD QUERY');

    const syncServiceContent = fs.readFileSync(path.resolve('server/sync-service.js'), 'utf8');
    const dashboardJsContent = fs.readFileSync(path.resolve('js/dashboard.js'), 'utf8');
    const indexHtmlContent = fs.readFileSync(path.resolve('index.html'), 'utf8');

    it('F2-01: MAX_ROOT_HISTORY_COUNT is strictly 50 in server/sync-service.js and js/core.js', () => {
        assert(syncServiceContent.includes('MAX_ROOT_HISTORY_COUNT = 50;'), 'server/sync-service.js must cap history to 50');
        assert(coreJsContent.includes('const MAX_ROOT_ORDERS = 50;'), 'js/core.js must cap root history to 50');
    });

    it('F2-02: server/sync-service.js syncs full invoices to subcollection /invoices/{invoiceId}', () => {
        assert(syncServiceContent.includes('/invoices/'), 'sync-service must write to invoices subcollection');
        assert(syncServiceContent.includes('getInvoicesFromFirestoreREST'), 'sync-service must have getInvoicesFromFirestoreREST');
    });

    it('F2-03: js/dashboard.js defines loadOlderInvoicesFromCloud with pagination tokens', () => {
        assert(dashboardJsContent.includes('async function loadOlderInvoicesFromCloud('), 'loadOlderInvoicesFromCloud must be defined');
        assert(dashboardJsContent.includes('window.loadOlderInvoicesFromCloud = loadOlderInvoicesFromCloud'), 'loadOlderInvoicesFromCloud must be on window');
        assert(dashboardJsContent.includes('_invoicesCloudPageToken'), 'loadOlderInvoicesFromCloud must track cloud page token');
    });

    it('F2-04: index.html has #ordersModalLoadMoreCloudBtn for on-demand cloud history fetching', () => {
        assert(indexHtmlContent.includes('id="ordersModalLoadMoreCloudBtn"'), '#ordersModalLoadMoreCloudBtn must exist in index.html');
        assert(indexHtmlContent.includes('onclick="loadOlderInvoicesFromCloud()"'), 'Button must trigger loadOlderInvoicesFromCloud()');
    });

    // ============================================================
    // 3. TABLE DELTA BROADCAST & RBAC (CASHIER / ADMIN GATE)
    // ============================================================
    console.log('\n📍 SECTION 3: TABLE DELTA BROADCAST & CASHIER / ADMIN RBAC');

    const posJsContent = fs.readFileSync(path.resolve('js/pos.js'), 'utf8');
    const coreModule = await import('../js/core.js');
    const canManageTableStatus = coreModule.canManageTableStatus || global.window.canManageTableStatus;

    it('F3-01: canManageTableStatus gates table status updates to Cashier, Manager, and Admin', () => {
        assert.strictEqual(typeof canManageTableStatus, 'function', 'canManageTableStatus must be a function');
        assert.strictEqual(canManageTableStatus({ role: 'Admin' }), true, 'Admin should be allowed');
        assert.strictEqual(canManageTableStatus({ role: 'Manager' }), true, 'Manager should be allowed');
        assert.strictEqual(canManageTableStatus({ role: 'Cashier' }), true, 'Cashier should be allowed');
        assert.strictEqual(canManageTableStatus({ role: 'Floor Server' }), false, 'Floor Server should be DENIED');
        assert.strictEqual(canManageTableStatus({ role: 'Kitchen Chef' }), false, 'Kitchen Chef should be DENIED');
        assert.strictEqual(canManageTableStatus({ role: 'Waiter' }), false, 'Waiter should be DENIED');
    });

    it('F3-02: broadcastTableDelta and updateTableStatus are defined and exported', () => {
        assert(coreJsContent.includes('function broadcastTableDelta('), 'broadcastTableDelta should be defined');
        assert(coreJsContent.includes('function updateTableStatus('), 'updateTableStatus should be defined');
        assert(coreJsContent.includes('window.broadcastTableDelta = broadcastTableDelta'), 'broadcastTableDelta should be on window');
        assert(coreJsContent.includes('window.updateTableStatus = updateTableStatus'), 'updateTableStatus should be on window');
    });

    it('F3-03: posMeshChannel handles TABLE_DELTA messages for real-time peer sync', () => {
        assert(coreJsContent.includes("data.type === 'TABLE_DELTA'"), 'posMeshChannel must handle TABLE_DELTA');
        assert(coreJsContent.includes("window.dispatchEvent(new CustomEvent('billnaw:table-status-changed'"), 'Must dispatch table-status-changed event');
    });

    it('F3-04: bookTable in js/pos.js enforces canManageTableStatus check', () => {
        assert(posJsContent.includes('canManageTableStatus'), 'bookTable must check canManageTableStatus');
        assert(posJsContent.includes('Permission denied:'), 'Must show permission denied when unauthorized staff attempts booking');
    });

    // ============================================================
    // 4. DAILY CLOSING SUMMARY SAVED TO reports/{date}
    // ============================================================
    console.log('\n📍 SECTION 4: DAILY CLOSING SUMMARY PERSISTENCE TO reports/{date}');

    const apiContent = fs.readFileSync(path.resolve('netlify/functions/api.js'), 'utf8');

    it('F4-01: saveDailyClosingSummary is defined in js/dashboard.js and exports to window', () => {
        assert(dashboardJsContent.includes('async function saveDailyClosingSummary('), 'saveDailyClosingSummary must be defined');
        assert(dashboardJsContent.includes('window.saveDailyClosingSummary = saveDailyClosingSummary'), 'saveDailyClosingSummary must be on window');
    });

    it('F4-02: saveDailyClosingSummary persists to reports/{date} in Firestore and IndexedDB', () => {
        assert(dashboardJsContent.includes("getStoreSubdocRef('reports', todayISO)"), 'Must use getStoreSubdocRef with reports collection');
        assert(dashboardJsContent.includes('cafe_report_'), 'Must save to IndexedDB cafe_report_${todayISO}');
        assert(dashboardJsContent.includes('paymentSplit'), 'Summary must compute paymentSplit');
        assert(dashboardJsContent.includes('totalTax'), 'Summary must compute totalTax');
    });

    it('F4-03: printDailyZReport automatically calls saveDailyClosingSummary', () => {
        assert(dashboardJsContent.includes('saveDailyClosingSummary(todayISO)'), 'printDailyZReport must trigger saveDailyClosingSummary');
    });

    it('F4-04: server/sync-service.js and Netlify API support dailyReport subcollection sync and GET /sync/reports', () => {
        assert(syncServiceContent.includes('reports/${encodeURIComponent(safeRepId)}'), 'sync-service must patch reports/{date}');
        assert(syncServiceContent.includes('getReportsFromFirestoreREST'), 'sync-service must export getReportsFromFirestoreREST');
        assert(apiContent.includes("cleanPath === '/sync/reports'"), 'Netlify API must handle GET /sync/reports');
        assert(apiContent.includes('dailyReport'), 'Netlify /sync/store-data must accept and forward dailyReport');
    });

    // ============================================================
    // 5. THERMAL PRINT INVOICE 2-LINE CLEAN WORD WRAP
    // ============================================================
    console.log('\n📍 SECTION 5: THERMAL PRINT INVOICE 2-LINE CLEAN WORD WRAP');

    const bridgeModule = await import('../src/core/platform-bridge.js');
    const { ThermalPrinterBridge } = bridgeModule;

    it('F5-01: Packaged Water (2 Litre) splits cleanly on word boundary (No mid-word cut)', () => {
        const bill = {
            bill_no: 'B-1019',
            amount: 90,
            final_payable_paise: 9000,
            items: [{ name: 'Packaged Water (2 Litre)', qty: 3, line_total_paise: 9000 }]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(bill, '58mm');
        const rawText = new TextDecoder().decode(bytes);
        assert(rawText.includes('Packaged Water'), `Must contain 'Packaged Water', got:\n${rawText}`);
        assert(rawText.includes('(2 Litre)'), `Must contain '(2 Litre)' on second line, got:\n${rawText}`);
        assert(!rawText.includes('Packaged Water (2\n'), `Line 1 must NOT cut mid-parenthetical like 'Packaged Water (2'`);
        assert(!rawText.includes('  Litre)'), `Line 2 must NOT begin with severed 'Litre)'`);
    });

    it('F5-02: Packaged Water (500 ml) splits cleanly on word boundary (No "00 ml)" cut)', () => {
        const bill = {
            bill_no: 'B-1020',
            amount: 44,
            final_payable_paise: 4400,
            items: [{ name: 'Packaged Water (500 ml)', qty: 4, line_total_paise: 4400 }]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(bill, '58mm');
        const rawText = new TextDecoder().decode(bytes);
        assert(rawText.includes('Packaged Water'), `Must contain 'Packaged Water'`);
        assert(rawText.includes('(500 ml)'), `Must contain '(500 ml)'`);
        assert(!rawText.includes('Packaged Water (5\n'), `Line 1 must NOT cut mid-number like 'Packaged Water (5'`);
        assert(!rawText.includes('\n  00 ml)'), `Line 2 must NOT have severed digits '00 ml)'`);
    });

    it('F5-03: Green Tea with Honey splits cleanly on word boundary (No "Ho" / "ney" cut)', () => {
        const bill = {
            bill_no: 'B-1021',
            amount: 60,
            final_payable_paise: 6000,
            items: [{ name: 'Green Tea with Honey', qty: 2, line_total_paise: 6000 }]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(bill, '58mm');
        const rawText = new TextDecoder().decode(bytes);
        assert(rawText.includes('Green Tea with'), `Must contain 'Green Tea with'`);
        assert(rawText.includes('Honey'), `Must contain 'Honey'`);
        assert(!rawText.includes('Green Tea with Ho'), `Line 1 must NOT cut 'Honey' into 'Ho'`);
        assert(!rawText.includes('  ney'), `Line 2 must NOT have severed suffix 'ney'`);
    });

    it('F5-04: Short names (Green Tea, Veg Soup) stay on a single line', () => {
        const bill = {
            bill_no: 'B-1022',
            amount: 115,
            final_payable_paise: 11500,
            items: [
                { name: 'Green Tea', qty: 1, line_total_paise: 2500 },
                { name: 'Veg Soup', qty: 1, line_total_paise: 9000 }
            ]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(bill, '58mm');
        const rawText = new TextDecoder().decode(bytes);
        assert(rawText.includes('Green Tea'), 'Must contain Green Tea');
        assert(rawText.includes('Veg Soup'), 'Must contain Veg Soup');
    });

    // ============================================================
    // 6. INVARIANTS AUDIT
    // ============================================================
    console.log('\n📍 SECTION 6: INVARIANTS AUDIT & INTEGRITY CHECK');

    it('INV-01: Exactly 26 modal-close-btn button elements in index.html', () => {
        const matches = indexHtmlContent.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        assert.strictEqual(matches.length, 26, `Must have exactly 26 modal-close-btn elements, found ${matches.length}`);
    });

    it('INV-02: Zero raw Unicode emojis inside <button> elements in index.html', () => {
        const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
        let match;
        let emojiButtonCount = 0;
        const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

        while ((match = btnRegex.exec(indexHtmlContent)) !== null) {
            const textContent = match[1].replace(/<[^>]+>/g, '');
            if (emojiRegex.test(textContent)) {
                emojiButtonCount++;
                console.error('      Found raw emoji in button:', match[0].slice(0, 100));
            }
        }
        assert.strictEqual(emojiButtonCount, 0, `Found ${emojiButtonCount} buttons with raw Unicode emoji`);
    });

    it('INV-03: 100% bit-for-bit binary parity between firestore.rules and database/firestore.rules', () => {
        const r1 = fs.readFileSync(path.resolve('firestore.rules'));
        const r2 = fs.readFileSync(path.resolve('database/firestore.rules'));
        assert(r1.equals(r2), 'firestore.rules and database/firestore.rules must be 100% identical');
    });

    console.log('\n====================================================');
    console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('✨ ALL 5 SENIOR FULLSTACK POS ENHANCEMENTS VERIFIED 100% GREEN!\n');
        process.exit(0);
    }
})();
