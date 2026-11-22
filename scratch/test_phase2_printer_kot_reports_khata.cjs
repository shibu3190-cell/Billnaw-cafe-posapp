/**
 * Phase 2 Verification Suite:
 * - P2-01: Printer stale status reset, USB/Serial/Network slot-2 routing, KOT double-width ESC/POS wrapping
 * - P2-02: KOT Cloud Print Relay fallthrough via skipBrowserFallback
 * - P2-03: Dashboard CSV filters (VOID/custom/pay/type/search/subtotal=0), Z-Report Khata/VOID, saveEditedOrder GST+discount recalculation, live menuItems category lookup
 * - P2-04: Khata demo-seed guard for authenticated shops, bidirectional Khata cloud sync (client + REST + server + Netlify), customer updatedAt & balanceDue persistence, #tableOrderFloatingBar fix
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function makeStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => { store.clear(); },
        _dump: () => Object.fromEntries(store.entries())
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

function loadPlatformBridgeInSandbox(sandbox) {
    const rawCode = read('src/core/platform-bridge.js');
    const vmCode = rawCode
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/^export\s+default\s+/gm, '')
        .replace(/^export\s+(?=(?:const|let|var|function|async|class)\b)/gm, '');
    sandbox.successResult = (data, meta = {}) => ({ success: true, data, ...meta });
    sandbox.errorResult = (code, message, meta = {}) => ({ success: false, error: { code, message }, code, ...meta });
    vm.createContext(sandbox);
    vm.runInContext(vmCode, sandbox, { filename: 'src/core/platform-bridge.js' });
    return sandbox.ThermalPrinterBridge || sandbox.window.ThermalPrinterBridge;
}

async function main() {
    // =========================================================================
    // P2-01: Printer stale status reset, slot-2 USB/Serial/Network routing, KOT wrapping
    // =========================================================================
    await runTest('P2-01', 'Printer status reset on reload, USB/Serial/Network printer2 routing & KOT dCols wrapping', async () => {
        const ls = makeStorage({
            billnaw_printers_config: JSON.stringify({
                printer1: {
                    name: 'Counter BLE',
                    transport: 'BLUETOOTH',
                    status: 'CONNECTED',
                    paperWidth: '58mm',
                    role: 'RECEIPT',
                    deviceName: 'MPT-II'
                },
                printer2: {
                    name: 'Kitchen USB',
                    transport: 'USB',
                    status: 'CONNECTED',
                    paperWidth: '80mm',
                    role: 'KOT',
                    deviceName: 'XP-80C'
                }
            })
        });

        const sandbox = {
            window: {},
            addEventListener: () => {},
            document: {
                getElementById: () => null,
                querySelectorAll: () => [],
                addEventListener: () => {}
            },
            navigator: {},
            localStorage: ls,
            sessionStorage: makeStorage(),
            TextEncoder,
            TextDecoder,
            Uint8Array,
            console,
            setTimeout,
            clearTimeout,
            Date,
            Math,
            JSON,
            Promise,
            showToast: () => {}
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        const bridge = loadPlatformBridgeInSandbox(sandbox);
        assert.ok(bridge, 'ThermalPrinterBridge should be defined');

        const loaded = bridge.loadPrinterSettings();
        assert.strictEqual(loaded.printer1.status, 'DISCONNECTED', 'Volatile BLUETOOTH status must reset to DISCONNECTED on reload without handle');
        assert.strictEqual(loaded.printer2.status, 'DISCONNECTED', 'Volatile USB status must reset to DISCONNECTED on reload without handle');

        // Non-volatile NETWORK printer should keep CONNECTED status on reload
        ls.setItem('billnaw_printers_config', JSON.stringify({
            printer1: { name: 'Counter LAN', transport: 'NETWORK', host: '192.168.1.10', port: 9100, status: 'CONNECTED', paperWidth: '80mm', role: 'RECEIPT' },
            printer2: { name: 'Kitchen LAN', transport: 'NETWORK', host: '192.168.1.20', port: 9100, status: 'CONNECTED', paperWidth: '80mm', role: 'KOT' }
        }));
        const loadedLan = bridge.loadPrinterSettings();
        assert.strictEqual(loadedLan.printer1.status, 'CONNECTED', 'NETWORK printer status should remain CONNECTED across reloads');
        assert.strictEqual(loadedLan.printer2.status, 'CONNECTED', 'NETWORK printer2 status should remain CONNECTED across reloads');

        // Verify routePrintJob routes KOT to printer2 when printer2 is NETWORK (host configured)
        const dispatchedSlots = [];
        const origDispatch = bridge.dispatchToPrinterSlot.bind(bridge);
        bridge.dispatchToPrinterSlot = async (slot, bytes, opts) => {
            dispatchedSlots.push({ slot, opts });
            return { success: true, data: { printed: true, method: 'NETWORK_RAW', slot } };
        };

        const kotOrder = {
            billNo: 'KOT-99',
            table: 'T4',
            items: [{ name: 'Chicken Tandoori Platter Deluxe Special', qty: 2, price: 320 }]
        };
        const resLan = await bridge.routePrintJob(kotOrder, { role: 'KOT', paperWidth: '58mm', skipBrowserFallback: true });
        assert.strictEqual(resLan.success, true);
        assert.strictEqual(dispatchedSlots[0].slot, 'printer2', 'KOT must route to printer2 when printer2 has a NETWORK host');
        assert.strictEqual(dispatchedSlots[0].opts.skipBrowserFallback, true, 'skipBrowserFallback must forward to dispatchToPrinterSlot');

        // Verify printer2 USB handle also routes to printer2
        ls.setItem('billnaw_printers_config', JSON.stringify({
            printer1: { name: 'Counter', transport: 'BLUETOOTH', status: 'DISCONNECTED', paperWidth: '58mm', role: 'RECEIPT' },
            printer2: { name: 'Kitchen USB', transport: 'USB', status: 'DISCONNECTED', paperWidth: '58mm', role: 'KOT' }
        }));
        bridge.loadPrinterSettings();
        bridge.printers.printer2.device = { opened: true };
        dispatchedSlots.length = 0;
        await bridge.routePrintJob(kotOrder, { role: 'KOT', paperWidth: '58mm' });
        assert.strictEqual(dispatchedSlots[0].slot, 'printer2', 'KOT must route to printer2 when USB device handle is present');

        // Verify ESC/POS KOT double-width line wrapping at dCols (16 for 58mm)
        bridge.dispatchToPrinterSlot = origDispatch;
        const escBytes = bridge.generateEscPosCommands(kotOrder, { role: 'KOT', paperWidth: '58mm' });
        const decoded = new TextDecoder('latin1').decode(escBytes);
        const itemLines = decoded.split('\n').filter(l => l.includes('Chicken') || l.includes('Tandoori') || l.includes('Platter') || l.includes('Deluxe') || l.includes('Special'));
        assert.ok(itemLines.length >= 2, `Expected 58mm double-width KOT item to wrap across multiple lines, got: ${JSON.stringify(itemLines)}`);
        for (const line of itemLines) {
            const clean = line.replace(/[\x00-\x1f]/g, '');
            assert.ok(clean.length <= 16, `58mm double-width KOT line exceeded 16 chars (${clean.length}): "${clean}"`);
        }
    });

    // =========================================================================
    // P2-02: KOT Cloud Print Relay fallthrough (skipBrowserFallback)
    // =========================================================================
    await runTest('P2-02', 'skipBrowserFallback returns PRINTER_UNAVAILABLE so KOT reaches Cloud Print Relay', async () => {
        let browserFallbackCalled = false;
        const sandbox = {
            window: {},
            addEventListener: () => {},
            document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
            navigator: {},
            localStorage: makeStorage(),
            sessionStorage: makeStorage(),
            TextEncoder,
            TextDecoder,
            Uint8Array,
            console,
            setTimeout,
            clearTimeout,
            Date,
            Math,
            JSON,
            Promise,
            showToast: () => {},
            executeHtmlPrint: () => { browserFallbackCalled = true; }
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        const bridge = loadPlatformBridgeInSandbox(sandbox);
        const resKot = await bridge.routePrintJob(
            { billNo: 'KOT-101', table: 'T1', items: [{ name: 'Masala Chai', qty: 2, price: 30 }] },
            { role: 'KOT', paperWidth: '58mm', skipBrowserFallback: true }
        );
        assert.strictEqual(resKot.success, false, 'KOT with skipBrowserFallback=true and no hardware must return success:false');
        assert.strictEqual(resKot.error?.code || resKot.code, 'PRINTER_UNAVAILABLE', `Expected PRINTER_UNAVAILABLE, got ${JSON.stringify(resKot)}`);
        assert.strictEqual(browserFallbackCalled, false, 'Browser fallback must NOT fire when skipBrowserFallback is true');

        // Without skipBrowserFallback (standard RECEIPT), fallback should return BROWSER_DIALOG
        const resReceipt = await bridge.routePrintJob(
            { billNo: '101', table: 'T1', items: [{ name: 'Masala Chai', qty: 2, price: 30 }], total: 60 },
            { role: 'RECEIPT', paperWidth: '58mm' }
        );
        assert.strictEqual(resReceipt.success, true, 'RECEIPT without hardware should still fall back cleanly');
        assert.strictEqual(resReceipt.data?.method || resReceipt.method, 'BROWSER_DIALOG', `Expected BROWSER_DIALOG, got ${JSON.stringify(resReceipt)}`);

        // Static check on js/pos.js sendKotToPrinter integration
        const posCode = read('js/pos.js');
        assert.ok(posCode.includes('skipBrowserFallback: canUseCloudRelay'), 'sendKotToPrinter must pass skipBrowserFallback: canUseCloudRelay');
        assert.ok(posCode.includes("executeHtmlPrint('print-kot')"), 'sendKotToPrinter must keep HTML fallback if Cloud Relay fails');
    });

    // =========================================================================
    // P2-03: Dashboard CSV filters, Z-Report Khata/VOID, saveEditedOrder, menuItems category
    // =========================================================================
    await runTest('P2-03', 'Dashboard CSV export, Z-Report Khata/VOID, saveEditedOrder GST+discount & live menuItems category', async () => {
        const dashCode = read('js/dashboard.js');
        let capturedCsvText = '';
        let capturedPrintHtml = '';
        let historyPersisted = 0;

        const mockDom = {
            reportCustomStartDate: { value: '2026-11-20' },
            reportCustomEndDate: { value: '2026-11-22' },
            dashPayModeFilter: { value: 'all' },
            dashOrderTypeFilter: { value: 'all' },
            dashSearchInput: { value: '' },
            editOrderModal: { style: { display: 'flex' } },
            editOrderId: { value: '101' },
            editOrderType: { value: 'Dine-In' },
            editSelectedPaymentMode: { value: 'UPI' },
            editCustomerName: { value: 'Ananya' },
            editBillerName: { value: 'Cashier 1' }
        };

        const sampleOrders = [
            {
                id: 101,
                billNo: '1001',
                date: '2026-11-21, 10:00 AM',
                filterDate: '2026-11-21',
                orderType: 'Dine-In',
                table: 'T1',
                paymentMode: 'Cash',
                subtotal: 200,
                tax: 10,
                amount: 210,
                status: 'PAID',
                items: [{ name: 'Cappuccino', qty: 1, price: 200 }]
            },
            {
                id: 'ORD-2',
                billNo: '1002',
                date: '2026-11-21, 11:00 AM',
                filterDate: '2026-11-21',
                orderType: 'Takeaway',
                table: 'Takeaway',
                paymentMode: 'Khata',
                subtotal: 0,
                tax: 0,
                amount: 150,
                status: 'PAID',
                items: [{ name: 'Cold Brew', qty: 1, price: 150 }]
            },
            {
                id: 'ORD-VOID',
                billNo: '1003',
                date: '2026-11-21, 12:00 PM',
                filterDate: '2026-11-21',
                orderType: 'Dine-In',
                table: 'T2',
                paymentMode: 'Cash',
                subtotal: 999,
                tax: 50,
                amount: 1049,
                status: 'VOID',
                items: [{ name: 'Voided Dish', qty: 1, price: 999 }]
            },
            {
                id: 'ORD-OLD',
                billNo: '999',
                date: '2026-11-10, 09:00 AM',
                filterDate: '2026-11-10',
                orderType: 'Dine-In',
                table: 'T3',
                paymentMode: 'UPI',
                subtotal: 500,
                tax: 25,
                amount: 525,
                status: 'PAID',
                items: [{ name: 'Old Order', qty: 1, price: 500 }]
            }
        ];

        const sandbox = {
            window: {},
            addEventListener: () => {},
            document: {
                getElementById: (id) => mockDom[id] || null,
                createElement: (tag) => ({
                    tagName: tag,
                    style: {},
                    href: '',
                    download: '',
                    click: () => {},
                    setAttribute: () => {},
                    contentWindow: {
                        focus: () => {},
                        print: () => {},
                        document: {
                            open: () => {},
                            write: (html) => { capturedPrintHtml = html; },
                            close: () => {}
                        }
                    }
                }),
                body: { appendChild: () => {}, removeChild: () => {} },
                querySelectorAll: () => [],
                addEventListener: () => {}
            },
            Blob: class FakeBlob {
                constructor(parts) { capturedCsvText = parts.join(''); }
            },
            URL: {
                createObjectURL: () => 'blob:mock',
                revokeObjectURL: () => {}
            },
            localStorage: makeStorage(),
            sessionStorage: makeStorage(),
            console,
            Date,
            Math,
            JSON,
            Number,
            Array,
            Object,
            String,
            Set,
            Map,
            shopProfile: { name: 'Billnaw Cafe', gstRate: 5, gstMode: 'exclusive', enableGst: true },
            menuItems: [
                { id: 1, name: 'Cappuccino', category: 'Hot Coffee', price: 200 },
                { id: 2, name: 'Cold Brew', category: 'Iced Coffee', price: 150 }
            ],
            orderHistory: JSON.parse(JSON.stringify(sampleOrders)),
            dailyExpenses: [],
            getLocalISODate: () => '2026-11-21',
            getLocalISOMonth: () => '2026-11',
            getOrderFilterDate: (o) => o.filterDate || '2026-11-21',
            getExpenseFilterDate: (e) => e.filterDate || '2026-11-21',
            calculateOrderTotals: (items, discount) => {
                const grossSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 1), 0);
                let discountAmount = 0;
                if (discount && discount.type === 'percent') {
                    discountAmount = Number(((grossSubtotal * Number(discount.value || 0)) / 100).toFixed(2));
                }
                const subtotal = Number((grossSubtotal - discountAmount).toFixed(2));
                const totalTax = Number((subtotal * 0.05).toFixed(2));
                return { grossSubtotal, discountAmount, subtotal, totalTax, gstMode: 'exclusive', finalTotal: Number((subtotal + totalTax).toFixed(2)) };
            },
            setTimeout: () => 0,
            clearTimeout: () => {},
            persistHistoryFirebase: () => { historyPersisted++; },
            saveToLocal: () => {},
            renderDashboard: () => {},
            renderDashboardAnalytics: () => {},
            renderSalesReport: () => {},
            showToast: () => {}
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(dashCode, sandbox, { filename: 'js/dashboard.js' });

        // 1. Live menuItems category lookup
        assert.strictEqual(sandbox.getCategoryForDishName('Cappuccino'), 'Hot Coffee', 'getCategoryForDishName must read live menuItems');
        assert.strictEqual(sandbox.getCategoryForDishName('Cold Brew'), 'Iced Coffee');

        // 2. CSV export excludes VOID & out-of-range, keeps subtotal===0 as 0.00
        vm.runInContext(`currentDashboardRange = 'custom';`, sandbox);
        sandbox.exportFilteredSalesCSV();
        assert.ok(capturedCsvText.includes('1001'), 'CSV must include in-range PAID bill 1001');
        assert.ok(capturedCsvText.includes('1002'), 'CSV must include in-range Khata bill 1002');
        assert.ok(!capturedCsvText.includes('1003'), 'CSV must exclude VOID bill 1003');
        assert.ok(!capturedCsvText.includes('999'), 'CSV must exclude out-of-range bill 999');
        assert.ok(capturedCsvText.includes(',0.00,0.00,150.00'), 'CSV must format subtotal===0 cleanly as 0.00 instead of falling back to amount');

        // 3. CSV export honors payment mode filter
        mockDom.dashPayModeFilter.value = 'Khata';
        capturedCsvText = '';
        sandbox.exportFilteredSalesCSV();
        assert.ok(capturedCsvText.includes('1002'), 'CSV Khata filter must include bill 1002');
        assert.ok(!capturedCsvText.includes('1001'), 'CSV Khata filter must exclude Cash bill 1001');

        // 4. Z-Report excludes VOID and prints Khata (Credit)
        sandbox.printDailyZReport();
        assert.ok(capturedPrintHtml.includes('Khata (Credit)'), 'Z-Report must display Khata (Credit) row when Khata sales > 0');
        assert.ok(capturedPrintHtml.includes('150.00'), 'Z-Report must show Khata amount 150.00');
        assert.ok(!capturedPrintHtml.includes('1049'), 'Z-Report must exclude VOID order 1049 from totals');
        assert.ok(capturedPrintHtml.includes('360.00'), 'Z-Report gross sales should be 210 + 150 = 360.00 (excluding VOID)');

        // 5. saveEditedOrder recalculates GST & discount and stamps numeric updatedAt
        sandbox.orderHistory[0].discount = { type: 'percent', value: 10 };
        vm.runInContext(`
            currentEditingOrderItems = [{ name: 'Cappuccino', qty: 2, price: 200 }];
            saveEditedOrder();
        `, sandbox);
        const edited = sandbox.orderHistory[0];
        // 2 * 200 = 400 gross, 10% discount = 40 -> 360 subtotal, 5% GST = 18 -> 378 total
        assert.strictEqual(edited.grossSubtotal, 400, `Expected grossSubtotal 400, got ${edited.grossSubtotal}`);
        assert.strictEqual(edited.discountAmount, 40, `Expected discountAmount 40, got ${edited.discountAmount}`);
        assert.strictEqual(edited.subtotal, 360, `Expected subtotal 360, got ${edited.subtotal}`);
        assert.strictEqual(edited.tax, 18, `Expected tax 18, got ${edited.tax}`);
        assert.strictEqual(edited.amount, 378, `Expected amount 378, got ${edited.amount}`);
        assert.strictEqual(typeof edited.updatedAt, 'number', 'saveEditedOrder must stamp numeric updatedAt');
        assert.strictEqual(typeof edited.editedAt, 'number', 'saveEditedOrder must stamp numeric editedAt');
        assert.ok(historyPersisted >= 1, 'saveEditedOrder must persist updated history to cloud');
    });

    // =========================================================================
    // P2-04: Khata demo-seed guard, cloud sync (client + server), customer balanceDue & #tableOrderFloatingBar
    // =========================================================================
    await runTest('P2-04', 'Khata demo-seed guard, bidirectional cloud sync, customer balance persistence & #tableOrderFloatingBar', async () => {
        const custCode = read('js/customers.js');

        // Part A: Authenticated shop must NOT receive fake demo Khata entries
        const authLs = makeStorage({ billnaw_shop_session: JSON.stringify({ storeCode: 'SHOP_TEST_P2' }) });
        const cloudSyncCalls = [];
        const firestoreWrites = [];
        const customerPersists = [];

        const makeCustomerSandbox = (ls, isAuth) => {
            const sb = {
                window: {},
                document: {
                    getElementById: () => null,
                    querySelectorAll: () => [],
                    addEventListener: () => {}
                },
                localStorage: ls,
                sessionStorage: makeStorage(),
                idb: {
                    get: async () => null,
                    set: () => {}
                },
                customersList: [
                    { id: 501, name: 'Suman Roy', phone: '9000011111', balanceDue: 500, visits: 2, totalSpent: 1000 }
                ],
                orderHistory: [],
                shopProfile: { name: 'Test Shop', storeCode: 'SHOP_TEST_P2' },
                isStoreAuthenticated: () => isAuth,
                getStoreDocRef: () => ({ path: 'shops/SHOP_TEST_P2' }),
                firestoreDB: {},
                firestoreDoc: () => ({}),
                firestoreSetDoc: async (ref, data) => { firestoreWrites.push({ ref, data }); },
                dispatchBackendStoreSync: (payload) => { cloudSyncCalls.push(payload); },
                persistCustomersFirebase: (c) => { customerPersists.push(c); },
                showToast: () => {},
                setTimeout: () => 0,
                clearTimeout: () => {},
                console,
                Date,
                Math,
                JSON,
                Number,
                Array,
                Object,
                String,
                Map,
                Set,
                Promise
            };
            sb.window = sb;
            sb.globalThis = sb;
            vm.createContext(sb);
            vm.runInContext(custCode, sb, { filename: 'js/customers.js' });
            return sb;
        };

        const authSb = makeCustomerSandbox(authLs, true);
        await authSb.initKhataEngine();
        assert.strictEqual(authSb.khataList.length, 0, 'Authenticated live shop MUST initialize empty khataList (no Rajesh Kumar fake entries)');

        // Part B: Unauthenticated demo mode still gets seeded demo entries without cloud sync
        const demoSb = makeCustomerSandbox(makeStorage(), false);
        await demoSb.initKhataEngine();
        assert.strictEqual(demoSb.khataList.length, 4, 'Unauthenticated demo mode should still seed 4 demo Khata entries');
        assert.strictEqual(cloudSyncCalls.length, 0, 'Demo seeding must NOT trigger cloud sync');

        // Part C: Applying remote Khata snapshot merges entries without echo cloud sync
        const remoteEntry = {
            id: 'KHATA-501',
            type: 'customer',
            entityId: 501,
            name: 'Suman Roy',
            phone: '9000011111',
            amount: 500,
            balanceDue: 500,
            dueDate: '2026-12-01',
            status: 'Pending',
            updatedAt: 1700000000000
        };
        authSb.applyRemoteKhataSync([remoteEntry]);
        assert.strictEqual(authSb.khataList.length, 1, 'applyRemoteKhataSync must merge remote Khata entries');
        assert.strictEqual(cloudSyncCalls.length, 0, 'applyRemoteKhataSync must pass skipCloud:true to avoid write loops');

        // Part D: recordKhataPayment updates balance, stamps updatedAt, persists customer & syncs Khata to cloud
        const rec = authSb.recordKhataPayment('KHATA-501', 200, 'UPI', 'Partial');
        assert.ok(rec, 'recordKhataPayment should return payment record');
        assert.strictEqual(authSb.khataList[0].balanceDue, 300, 'Khata balanceDue should decrement from 500 to 300');
        assert.strictEqual(typeof authSb.khataList[0].updatedAt, 'number', 'Khata entry must have numeric updatedAt');
        assert.strictEqual(authSb.customersList[0].balanceDue, 300, 'Linked customer balanceDue should decrement to 300');
        assert.strictEqual(typeof authSb.customersList[0].updatedAt, 'number', 'Linked customer must have numeric updatedAt');
        assert.strictEqual(customerPersists.length, 1, 'recordKhataPayment must call persistCustomersFirebase(cust)');
        assert.strictEqual(cloudSyncCalls.length, 1, 'persistKhata must dispatchBackendStoreSync({ khata })');
        assert.strictEqual(cloudSyncCalls[0].khata[0].balanceDue, 300);
        assert.strictEqual(firestoreWrites.length, 1, 'persistKhata must write { khata } to Firestore');

        // Part E: Older remote snapshot must NOT overwrite newer local payment
        authSb.applyRemoteKhataSync([{ ...remoteEntry, balanceDue: 500, updatedAt: 1699999999000 }]);
        assert.strictEqual(authSb.khataList[0].balanceDue, 300, 'Older remote snapshot must not clobber newer local Khata payment');

        // Part F: Server sync-service.js REST write + read supports khata
        const syncMod = await import('../server/sync-service.js');
        const origFetch = global.fetch;
        let patchedBody = null;
        let patchedUrl = '';
        global.fetch = async (url, opts = {}) => {
            if (opts.method === 'PATCH') {
                patchedUrl = url;
                patchedBody = JSON.parse(opts.body);
                return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    fields: {
                        storeCode: { stringValue: 'SHOP_P2_KHATA_TEST' },
                        khata: patchedBody?.fields?.khata || { arrayValue: { values: [] } },
                        updatedAt: { stringValue: new Date().toISOString() }
                    }
                }),
                text: async () => '{}'
            };
        };
        try {
            const syncRes = await syncMod.syncStoreToFirestoreREST('SHOP_P2_KHATA_TEST', {
                khata: [{ id: 'KHATA-501', name: 'Suman Roy', balanceDue: 300 }]
            });
            assert.strictEqual(syncRes.success, true, 'syncStoreToFirestoreREST must succeed for khata payload');
            assert.ok(patchedUrl.includes('updateMask.fieldPaths=khata'), 'Firestore PATCH must include khata in updateMask');
            assert.ok(patchedBody?.fields?.khata, 'Firestore PATCH body must contain khata field');

            const getRes = await syncMod.getStoreFromFirestoreREST('SHOP_P2_KHATA_TEST');
            assert.strictEqual(getRes.success, true);
            assert.ok(Array.isArray(getRes.khata) && getRes.khata.length === 1 && getRes.khata[0].id === 'KHATA-501', 'getStoreFromFirestoreREST must return khata array');
        } finally {
            global.fetch = origFetch;
        }

        // Part G: Verify core.js, server.js, netlify/functions/api.js, pos.js wiring
        const coreCode = read('js/core.js');
        assert.ok(!coreCode.includes("getElementById('tablesOrderFloatingBar')"), 'Typo tablesOrderFloatingBar must be fixed in js/core.js');
        assert.ok(coreCode.includes("getElementById('tableOrderFloatingBar')"), 'js/core.js must query #tableOrderFloatingBar');
        assert.ok(coreCode.includes('if (Array.isArray(data.khata))'), 'handleRemoteFirestoreUpdate must sync data.khata');
        assert.ok(coreCode.includes('finalPayload.khata !== undefined'), 'dispatchBackendStoreSync must include khata in operational fields');

        const serverCode = read('server.js');
        const netlifyCode = read('netlify/functions/api.js');
        assert.ok(serverCode.includes('customers, khata, kots'), 'server.js /api/sync/store-data must destructure and forward khata');
        assert.ok(netlifyCode.includes('customers, khata, kots'), 'netlify/functions/api.js /api/sync/store-data must destructure and forward khata');

        const posCode = read('js/pos.js');
        assert.ok(posCode.includes('matchedCustomer.updatedAt = Date.now()'), 'confirmCheckout must stamp updatedAt on matchedCustomer');
        assert.ok(posCode.includes('persistKhata(currentKhata)'), 'POS Khata checkout must pass currentKhata into persistKhata');
    });

    // =========================================================================
    // P2-05: Code-Reviewer Hardening (Cross-tenant Khata reset, soft-delete tombstones, server LWW merge, Floor Server RBAC, legacy rate/discountAmount)
    // =========================================================================
    await runTest('P2-05', 'Cross-tenant resetKhataState, soft-delete tombstones, server LWW khata merge, Floor Server 403 RBAC & legacy rate/discountAmount', async () => {
        const custCode = read('js/customers.js');
        const coreCode = read('js/core.js');
        const shopAuthCode = read('js/shop-auth.js');
        const serverCode = read('server.js');
        const netlifyCode = read('netlify/functions/api.js');

        // 1. resetKhataState wired in all tenant wipe / logout / zero-store-gate paths & login hydration passes khata
        assert.ok(coreCode.includes('window.resetKhataState'), 'js/core.js must invoke window.resetKhataState on tenant clear/switch/zero-store gate');
        assert.ok(shopAuthCode.includes('window.resetKhataState'), 'js/shop-auth.js must invoke window.resetKhataState on clear/logout');
        assert.ok(shopAuthCode.includes('khata: sourceShop.khata'), 'js/shop-auth.js login hydration must pass khata: sourceShop.khata');

        // 2. Floor Server RBAC blocks khata writes on both server.js & netlify/functions/api.js
        assert.ok(serverCode.includes("if (khata !== undefined)") && serverCode.includes("requiredPermission: 'settle_bills'"), 'server.js must gate khata on settle_bills');
        assert.ok(netlifyCode.includes("if (khata !== undefined)") && netlifyCode.includes("requiredPermission: 'settle_bills'"), 'netlify/functions/api.js must gate khata on settle_bills');

        const authService = await import('../server/auth-service.js');
        const floorServerCheck = authService.verifyEndpointAccess({
            authResult: { authorized: true, user: { storeCode: 'SHOP_TEST', role: 'Floor Server' } },
            eventOrReq: { headers: { 'x-staff-role': 'Floor Server' } },
            requiredPermission: 'settle_bills'
        });
        assert.strictEqual(floorServerCheck.allowed, false, 'Floor Server MUST be blocked from settle_bills (khata sync)');
        assert.strictEqual(floorServerCheck.status, 403, 'Floor Server khata block must return HTTP 403');
        const cashierCheck = authService.verifyEndpointAccess({
            authResult: { authorized: true, user: { storeCode: 'SHOP_TEST', role: 'Cashier' } },
            eventOrReq: { headers: { 'x-staff-role': 'Cashier' } },
            requiredPermission: 'settle_bills'
        });
        assert.strictEqual(cashierCheck.allowed, true, 'Cashier MUST be allowed settle_bills (khata sync)');

        // 3. Soft-delete tombstone + resetKhataState prevents cross-tenant leakage & deletion resurrection
        const sb = {
            window: {},
            document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
            localStorage: makeStorage({ billnaw_shop_session: JSON.stringify({ storeCode: 'SHOP_A' }) }),
            sessionStorage: makeStorage(),
            idb: { get: async () => null, set: () => {} },
            customersList: [],
            orderHistory: [],
            shopProfile: { name: 'Shop A', storeCode: 'SHOP_A' },
            isStoreAuthenticated: () => true,
            confirm: () => true,
            showToast: () => {},
            setTimeout: () => 0,
            clearTimeout: () => {},
            console, Date, Math, JSON, Number, Array, Object, String, Map, Set, Promise
        };
        sb.window = sb;
        sb.globalThis = sb;
        vm.createContext(sb);
        vm.runInContext(custCode, sb, { filename: 'js/customers.js' });

        sb.applyRemoteKhataSync([{ id: 'K-DEL', type: 'customer', name: 'A', amount: 100, balanceDue: 100, updatedAt: 1000 }]);
        sb.deleteKhataEntry('K-DEL');
        assert.strictEqual(sb.khataList[0].isDeleted, true, 'deleteKhataEntry must create soft-delete tombstone');
        // Older remote snapshot must NOT resurrect soft-deleted entry
        sb.applyRemoteKhataSync([{ id: 'K-DEL', type: 'customer', name: 'A', amount: 100, balanceDue: 100, updatedAt: 1000 }]);
        assert.strictEqual(sb.khataList[0].isDeleted, true, 'Older remote snapshot must not resurrect soft-deleted Khata entry');
        // Tenant switch reset clears lexical khataList completely
        sb.resetKhataState();
        assert.strictEqual(sb.khataList.length, 0, 'resetKhataState must clear in-memory khataList on tenant switch');
        sb.applyRemoteKhataSync([{ id: 'K-SHOP-B', type: 'customer', name: 'Shop B Cust', amount: 250, balanceDue: 250, updatedAt: 2000 }]);
        assert.strictEqual(sb.khataList.length, 1, 'Shop B must only see Shop B Khata entries (zero leakage from Shop A)');
        assert.strictEqual(sb.khataList[0].id, 'K-SHOP-B');

        // 4. Server-side LWW khata merge prevents stale offline client from overwriting newer payment
        const syncMod = await import('../server/sync-service.js');
        const origFetch = global.fetch;
        let patchedKhata = null;
        global.fetch = async (url, opts = {}) => {
            if (opts.method === 'PATCH') {
                const body = JSON.parse(opts.body);
                patchedKhata = body.fields.khata;
                return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    fields: {
                        storeCode: { stringValue: 'SHOP_LWW_KHATA' },
                        khata: {
                            arrayValue: {
                                values: [{
                                    mapValue: {
                                        fields: {
                                            id: { stringValue: 'K-1' },
                                            balanceDue: { integerValue: '100' },
                                            updatedAt: { integerValue: '5000' }
                                        }
                                    }
                                }]
                            }
                        }
                    }
                }),
                text: async () => '{}'
            };
        };
        try {
            const res = await syncMod.syncStoreToFirestoreREST('SHOP_LWW_KHATA', {
                khata: [{ id: 'K-1', balanceDue: 500, updatedAt: 1000 }]
            });
            assert.strictEqual(res.success, true);
            const mergedFirst = patchedKhata?.arrayValue?.values?.[0]?.mapValue?.fields;
            assert.strictEqual(Number(mergedFirst?.balanceDue?.integerValue || mergedFirst?.balanceDue?.doubleValue), 100, 'Server LWW must preserve newer balanceDue=100 over stale offline balanceDue=500');
        } finally {
            global.fetch = origFetch;
        }

        // 5. saveEditedOrder handles legacy rate/item_name + discountAmount-only orders
        const dashCode = read('js/dashboard.js');
        assert.ok(dashCode.includes('i.price ?? i.rate ?? i.unitPrice'), 'saveEditedOrder must normalize legacy price/rate/unitPrice');
        assert.ok(dashCode.includes("type: 'fixed', value: Number(order.discountAmount)"), 'saveEditedOrder must preserve legacy discountAmount-only discounts');
    });

    console.log(`\nPhase 2 Summary: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
