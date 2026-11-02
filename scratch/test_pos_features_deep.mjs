// scratch/test_pos_features_deep.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = 9255;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_pos_test_' + Date.now());

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cdpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        }).on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
        this.consoleErrors = [];
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onmessage = evt => {
            const data = JSON.parse(evt.data);
            if (data.id && this.callbacks.has(data.id)) {
                const { resolve, reject } = this.callbacks.get(data.id);
                this.callbacks.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
            if (data.method === 'Runtime.exceptionThrown') {
                const desc = data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text;
                this.consoleErrors.push('[EXCEPTION] ' + desc);
            }
            if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
                const text = data.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
                this.consoleErrors.push('[CONSOLE.ERROR] ' + text);
            }
        };
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
            this.consoleErrors.push('[EVAL EXCEPTION] ' + desc);
        }
        return res?.result?.value;
    }

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: isMobile ? 2 : 1,
            mobile: isMobile
        });
        await sleep(500);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function run() {
    console.log("==============================================================================");
    console.log("🚀 FUNCTIONAL & RESPONSIVE E2E VERIFICATION FOR FEATURES 1 & 2");
    console.log("==============================================================================\n");

    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        '--window-size=1440,900',
        'http://localhost:5000'
    ], { stdio: 'ignore' });

    try {
        let connected = false;
        let tabs = [];
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            try {
                tabs = await cdpGet(`http://localhost:${DEBUG_PORT}/json`);
                if (tabs && tabs.length > 0) {
                    connected = true;
                    break;
                }
            } catch (e) {}
        }
        if (!connected) throw new Error('Could not connect to Chrome debugging port');

        const tab = tabs.find(t => t.type === 'page') || tabs[0];
        const client = new CDPClient(tab.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Log.enable');

        await sleep(2000);

        // Bypass Auth to Demo POS
        await client.evaluate(`(() => {
            localStorage.setItem('billnaw_auth_mode', 'demo');
            if (typeof window.closeShopAuthModal === 'function') window.closeShopAuthModal(true);
            const m = document.getElementById('shopAuthModal');
            if (m) m.style.display = 'none';
            if (typeof window.switchTab === 'function') window.switchTab('pos');
        })()`);
        await sleep(1000);

        // ====================================================================
        // FEATURE 1: POS BILLING & FAST TENDER VERIFICATION
        // ====================================================================
        console.log("📍 TEST F1.1: PROXIMITY STEPPERS & CART QUANTITIES");
        const cartTest1 = await client.evaluate(`(() => {
            // Select Table 1
            selectTable(1);
            // Clear items for clean test
            tablesInfo[1].items = [];
            tablesInfo[1].discount = null;
            updateCartUI();

            // 1. Add Samosa (id: 1, ₹15)
            addToCart(1);
            // 2. Increment Samosa to 2
            modifyQty(1, 1);
            // 3. Add Tea (id: 2, ₹10)
            addToCart(2);
            // 4. Add Chicken Curry (id: 3, ₹140)
            addToCart(3);
            // 5. Decrement Samosa from 2 to 1
            modifyQty(1, -1);

            const totals = calculateOrderTotals(tablesInfo[1].items);
            return {
                itemsInCart: tablesInfo[1].items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
                subtotal: totals.subtotal,
                tax: totals.totalTax,
                finalTotal: totals.finalTotal,
                itemCount: tablesInfo[1].items.length
            };
        })()`);
        console.log("  Cart after modifications (1 Samosa, 1 Tea, 1 Chicken Curry):", cartTest1);

        console.log("\n📍 TEST F1.2: QUICK VOICE CHIP TO CART PUSH");
        const voiceTest = await client.evaluate(`(() => {
            // Click '2 Hot Chai'
            quickVoiceAddOrder('2 Hot Chai');
            const totals = calculateOrderTotals(tablesInfo[1].items);
            const teaItem = tablesInfo[1].items.find(i => i.id === 2);
            return {
                teaQty: teaItem ? teaItem.qty : 0,
                finalTotal: totals.finalTotal
            };
        })()`);
        console.log("  Cart after '2 Hot Chai' chip:", voiceTest);

        console.log("\n📍 TEST F1.3: DISCOUNT CALCULATION");
        const discountTest = await client.evaluate(`(() => {
            // Apply 10% discount
            currentDiscountModalType = 'percent';
            document.getElementById('discountCustomValInput').value = '10';
            applyQuickDiscount();

            const totalsWithDisc = calculateOrderTotals(tablesInfo[1].items, tablesInfo[1].discount);
            return {
                discountApplied: tablesInfo[1].discount,
                grossSubtotal: totalsWithDisc.grossSubtotal,
                discountAmount: totalsWithDisc.discountAmount,
                finalTotal: totalsWithDisc.finalTotal
            };
        })()`);
        console.log("  Discount Applied (10%):", discountTest);

        console.log("\n📍 TEST F1.4: FAST TENDER ENGINE (DENOMINATIONS & CHANGE)");
        const tenderTest = await client.evaluate(`(() => {
            openCheckoutModal(true);
            const totals = calculateOrderTotals(tablesInfo[1].items, tablesInfo[1].discount);
            const billTotal = totals.finalTotal;

            // Check smart pills
            setupCheckoutTenderEngine(billTotal);
            const pills = Array.from(document.querySelectorAll('#checkoutDenomPills .denom-pill')).map(p => p.innerText.trim());

            // Test Exact Change
            setTenderAmount(billTotal);
            const exactChange = document.getElementById('checkoutChangeDueDisplay')?.innerText;
            const exactLabel = document.getElementById('checkoutChangeDueLabel')?.innerText;

            // Test Excess Tender (+ ₹100)
            const excessAmt = billTotal + 100;
            setTenderAmount(excessAmt);
            const excessChange = document.getElementById('checkoutChangeDueDisplay')?.innerText;
            const excessLabel = document.getElementById('checkoutChangeDueLabel')?.innerText;

            // Test Shortage (₹10)
            const shortAmt = 10;
            setTenderAmount(shortAmt);
            const shortChange = document.getElementById('checkoutChangeDueDisplay')?.innerText;
            const shortLabel = document.getElementById('checkoutChangeDueLabel')?.innerText;
            const isShortageClass = document.getElementById('checkoutChangeDueBox')?.classList.contains('shortage');

            return {
                billTotal,
                pills,
                exactLabel,
                exactChange,
                excessLabel,
                excessChange,
                shortLabel,
                shortChange,
                isShortageClass
            };
        })()`);
        console.log("  Fast Tender Engine Results:", tenderTest);

        console.log("\n📍 TEST F1.5: UPI QR GENERATION");
        const upiTest = await client.evaluate(`(() => {
            selectPayment('UPI', 'checkout');
            const upiContainer = document.getElementById('checkoutUpiQrContainer');
            const upiAmtDisplay = document.getElementById('checkoutUpiAmtDisplay')?.innerText;
            const hasCanvasOrImg = !!(upiContainer && (upiContainer.querySelector('canvas') || upiContainer.querySelector('img')));
            const upiString = window.currentUpiString || 'generated';
            return {
                upiContainerVisible: upiContainer ? window.getComputedStyle(upiContainer).display : null,
                upiAmtDisplay,
                hasCanvasOrImg,
                upiString
            };
        })()`);
        console.log("  UPI QR Modal State:", upiTest);

        console.log("\n📍 TEST F1.6: ATOMIC SETTLEMENT & THERMAL RECEIPT");
        const settlementTest = await client.evaluate(`(async () => {
            selectPayment('Cash', 'checkout');
            const total = calculateOrderTotals(tablesInfo[1].items, tablesInfo[1].discount).finalTotal;
            setTenderAmount(total);

            const initialHistoryLen = orderHistory.length;
            await confirmCheckout();

            const finalHistoryLen = orderHistory.length;
            const latestOrder = orderHistory[0];

            return {
                settledSuccessfully: finalHistoryLen > initialHistoryLen,
                billNo: latestOrder ? latestOrder.billNo : null,
                amountTendered: latestOrder ? latestOrder.amountTendered : null,
                changeReturned: latestOrder ? latestOrder.changeReturned : null,
                tableStatusAfterSettlement: tablesInfo[1].status,
                tableItemsCountAfterSettlement: tablesInfo[1].items.length
            };
        })()`);
        console.log("  Settlement Result:", settlementTest);

        // ====================================================================
        // FEATURE 2: TABLE MANAGEMENT & KOT TICKETING VERIFICATION
        // ====================================================================
        console.log("\n📍 TEST F2.1: TABLE STATUS TRANSITIONS (VACANT -> OCCUPIED)");
        const tableStateTest = await client.evaluate(`(() => {
            // Select Table 2
            selectTable(2);
            tablesInfo[2].items = [];
            tablesInfo[2].status = 'empty';
            syncTableUI();

            const beforeStatus = tablesInfo[2].status;
            // Add Samosa to Table 2
            addToCart(1);
            const afterStatus = tablesInfo[2].status;
            const savedTimeSet = !!tablesInfo[2].savedTime;

            return {
                beforeStatus,
                afterStatus,
                savedTimeSet,
                itemsCount: tablesInfo[2].items.length
            };
        })()`);
        console.log("  Table 2 Status Transition:", tableStateTest);

        console.log("\n📍 TEST F2.2: KOT GENERATION & PRINT BRIDGE");
        const kotTest = await client.evaluate(`(async () => {
            // Send Table 2 to Kitchen
            sendToKitchen();
            const statusAfterSend = tablesInfo[2].status;
            const kotModal = document.getElementById('kotModal');
            const kotModalDisplay = kotModal ? window.getComputedStyle(kotModal).display : null;

            // Generate / Process KOT
            await printKitchenTicket();

            return {
                statusAfterSend,
                kotModalDisplay,
                itemsInKot: tablesInfo[2].items.map(i => ({ name: i.name, qty: i.qty }))
            };
        })()`);
        console.log("  KOT Generation Result:", kotTest);

        console.log("\n📍 TEST F2.3: MULTI-TABLE CART ISOLATION");
        const isolationTest = await client.evaluate(`(() => {
            // Table 2 has Samosa
            // Select Table 3 (Vacant)
            selectTable(3);
            tablesInfo[3].items = [];
            tablesInfo[3].status = 'empty';
            syncTableUI();

            // Add Tea to Table 3
            addToCart(2);

            const t3Items = tablesInfo[3].items.map(i => i.name);
            const t2Items = tablesInfo[2].items.map(i => i.name);

            // Switch back to Table 2
            selectTable(2);
            const t2ActiveItems = tablesInfo[2].items.map(i => i.name);

            return {
                table2Items: t2Items,
                table3Items: t3Items,
                table2RestoredItems: t2ActiveItems,
                isIsolated: t2Items.length === 1 && t3Items.length === 1 && t2Items[0] !== t3Items[0]
            };
        })()`);
        console.log("  Multi-Table Cart Isolation Result:", isolationTest);

        // ====================================================================
        // RESPONSIVE VIEWPORT CHECKS
        // ====================================================================
        console.log("\n📱 --- MULTI-DEVICE RESPONSIVE VIEWPORT CHECKS ---");
        
        // PC (1440 x 900)
        await client.setViewport(1440, 900, false);
        const pcRes = await client.evaluate(`(() => ({
            viewport: '1440x900',
            posDisplay: window.getComputedStyle(document.getElementById('pos')).display,
            posLeftWidth: window.getComputedStyle(document.querySelector('.pos-left')).width,
            posRightWidth: window.getComputedStyle(document.querySelector('.pos-right')).width,
            menuGridCols: window.getComputedStyle(document.querySelector('.menu-grid')).gridTemplateColumns.split(' ').length
        }))()`);
        console.log("  PC (1440x900):", pcRes);

        // Tablet (768 x 1024)
        await client.setViewport(768, 1024, true);
        const tabRes = await client.evaluate(`(() => ({
            viewport: '768x1024',
            posDisplay: window.getComputedStyle(document.getElementById('pos')).display,
            menuGridCols: window.getComputedStyle(document.querySelector('.menu-grid')).gridTemplateColumns.split(' ').length,
            posRightPos: window.getComputedStyle(document.querySelector('.pos-right')).position
        }))()`);
        console.log("  Tablet (768x1024):", tabRes);

        // Mobile (390 x 844)
        await client.setViewport(390, 844, true);
        const mobRes = await client.evaluate(`(() => ({
            viewport: '390x844',
            menuGridCols: window.getComputedStyle(document.querySelector('.menu-grid')).gridTemplateColumns.split(' ').length,
            posRightPos: window.getComputedStyle(document.querySelector('.pos-right')).position,
            floatingCartDisplay: window.getComputedStyle(document.getElementById('floatingCart')).display
        }))()`);
        console.log("  Mobile (390x844):", mobRes);

        // Mobile Compact (375 x 667)
        await client.setViewport(375, 667, true);
        const mobSE = await client.evaluate(`(() => ({
            viewport: '375x667',
            menuGridCols: window.getComputedStyle(document.querySelector('.menu-grid')).gridTemplateColumns.split(' ').length,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }))()`);
        console.log("  Mobile Compact (375x667):", mobSE);

        // ====================================================================
        // CONSOLE ERRORS CAPTURED DURING EXECUTION
        // ====================================================================
        console.log("\n📢 --- CONSOLE ERRORS CAPTURED ---");
        console.log(`  Total Console Errors: ${client.consoleErrors.length}`);
        client.consoleErrors.forEach((err, i) => console.log(`  [${i+1}] ${err}`));

        client.close();
    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
}

run().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
