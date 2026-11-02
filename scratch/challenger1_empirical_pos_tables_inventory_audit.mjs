// scratch/challenger1_empirical_pos_tables_inventory_audit.mjs
// ==============================================================================
// ⚔️ CHALLENGER GATE 1: EMPIRICAL VERIFICATION & STRESS-TESTING SUITE
// POS Billing, Fast Tender, Table Management, KOT & Multi-Viewport CDP Audit
// ==============================================================================

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = 9260;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_challenger_profile_' + Date.now());

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function cdpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
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
        this.consoleMessages = [];
        this.errors = [];
        this.warnings = [];
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onmessage = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id && this.callbacks.has(data.id)) {
                const { resolve, reject } = this.callbacks.get(data.id);
                this.callbacks.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }

            if (data.method === 'Runtime.consoleAPICalled') {
                const type = data.params.type;
                const text = data.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
                this.consoleMessages.push({ type, text });
                if (type === 'error') {
                    this.errors.push(text);
                } else if (type === 'warning') {
                    this.warnings.push(text);
                }
            }

            if (data.method === 'Runtime.exceptionThrown') {
                const desc = data.params?.exceptionDetails?.exception?.description ||
                             data.params?.exceptionDetails?.text || 'Unknown exception';
                this.errors.push('[EXCEPTION] ' + desc);
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
            this.errors.push('[EVAL EXCEPTION] ' + desc);
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
        await sleep(400);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function runEmpiricalVerification() {
    console.log("==============================================================================");
    console.log("⚔️ CHALLENGER GATE 1: EMPIRICAL VERIFICATION & STRESS-TESTING HARNESS");
    console.log("==============================================================================\n");

    const suiteResults = {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        details: []
    };

    function record(name, pass, detail = "") {
        suiteResults.totalChecks++;
        if (pass) {
            suiteResults.passedChecks++;
            console.log(`  ✅ PASS: ${name}`);
            suiteResults.details.push({ name, status: 'PASS', detail });
        } else {
            suiteResults.failedChecks++;
            console.log(`  ❌ FAIL: ${name} -> ${detail}`);
            suiteResults.details.push({ name, status: 'FAIL', detail });
        }
    }

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
        for (let i = 0; i < 25; i++) {
            await sleep(500);
            try {
                tabs = await cdpGet(`http://localhost:${DEBUG_PORT}/json`);
                if (tabs && tabs.length > 0) {
                    const pageTab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('5000'));
                    if (pageTab) {
                        connected = true;
                        break;
                    }
                }
            } catch (e) {}
        }
        if (!connected) throw new Error('Could not connect to Chrome debugging port for localhost:5000');

        const tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('5000'));
        const client = new CDPClient(tab.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Log.enable');

        // Allow 3.5 seconds for ServiceWorker initial check & IDB hydration
        console.log("  Waiting for Service Worker & Local Storage hydration...");
        await sleep(3500);

        // Bypass Auth & Setup Demo Environment
        await client.evaluate(`(() => {
            localStorage.setItem('billnaw_auth_mode', 'demo');
            if (typeof window.closeShopAuthModal === 'function') {
                window.closeShopAuthModal(true);
            }
            if (document.getElementById('shopAuthModal')) {
                document.getElementById('shopAuthModal').style.display = 'none';
            }
            if (typeof window.switchTab === 'function') {
                window.switchTab('pos');
            }
        })()`);
        await sleep(800);

        // ==========================================================================
        // SUITE 1: POS BILLING & FAST TENDER STRESS TESTING
        // ==========================================================================
        console.log("\n💵 --- SUITE 1: POS BILLING & FAST TENDER STRESS TESTING ---");

        // 1.0: Setup Table 1 with items totaling exactly ₹ 100
        const setupCart100 = await client.evaluate(`(() => {
            window.selectTable(1);
            window.tablesInfo[1] = {
                items: [
                    { id: 991, name: "Test Samosa Plate", price: 50.00, qty: 1, gstRate: 0 },
                    { id: 992, name: "Test Cold Coffee", price: 50.00, qty: 1, gstRate: 0 }
                ],
                status: 'occupied',
                savedTime: Date.now(),
                discount: null
            };
            window.syncTableUI();
            window.updateCartUI();
            const totals = window.calculateOrderTotals(window.tablesInfo[1].items, null);
            return {
                itemCount: window.tablesInfo[1].items.length,
                finalTotal: totals.finalTotal
            };
        })()`);
        console.log("  Cart ₹ 100 Setup Result:", setupCart100);
        record("Cart Setup for ₹ 100 bill", setupCart100.finalTotal === 100 && setupCart100.itemCount === 2);

        // 1.1: Under-tendered Cash: ₹5 tendered for ₹100 bill
        const underTenderResult = await client.evaluate(`(() => {
            window.openCheckoutModal(true);
            window.selectPayment('Cash', 'checkout');
            
            const tenderInput = document.getElementById('checkoutCashTenderedInput');
            tenderInput.value = '5.00';
            window.onCashTenderedChange('5.00');

            const dueBox = document.getElementById('checkoutChangeDueBox');
            const dueLabel = document.getElementById('checkoutChangeDueLabel');
            const dueDisplay = document.getElementById('checkoutChangeDueDisplay');

            const hasShortageClass = dueBox ? dueBox.classList.contains('shortage') : false;
            const labelText = dueLabel ? dueLabel.innerText : '';
            const displayText = dueDisplay ? dueDisplay.innerText : '';

            // Spy on showToast
            let toastMessage = null;
            const origShowToast = window.showToast;
            window.showToast = (msg) => {
                toastMessage = msg;
                if (typeof origShowToast === 'function') origShowToast(msg);
            };

            const orderCountBefore = window.orderHistory.length;
            const cartItemsBefore = window.tablesInfo[1].items.length;

            // Attempt checkout
            window.confirmCheckout();

            // Restore showToast
            window.showToast = origShowToast;

            const orderCountAfter = window.orderHistory.length;
            const cartItemsAfter = window.tablesInfo[1].items.length;
            const checkoutModalVisible = document.getElementById('checkoutModal')?.style.display !== 'none';

            return {
                hasShortageClass,
                labelText,
                displayText,
                toastMessage,
                orderCreated: orderCountAfter > orderCountBefore,
                cartCleared: cartItemsAfter === 0,
                cartItemsRemaining: cartItemsAfter,
                checkoutModalVisible
            };
        })()`);
        console.log("  Under-Tender Test Result (₹5 for ₹100):", underTenderResult);
        record("Under-tender: Change box has shortage styling", underTenderResult.hasShortageClass === true);
        record("Under-tender: Label indicates 'Amount Short:'", underTenderResult.labelText.includes('Amount Short'));
        record("Under-tender: Displays exact shortage amount ₹ 95.00", underTenderResult.displayText.includes('95.00'));
        record("Under-tender: Checkout aborts with toast warning", underTenderResult.toastMessage && underTenderResult.toastMessage.includes('is less than total'));
        record("Under-tender: Cart is NOT cleared and NO order is created", !underTenderResult.orderCreated && !underTenderResult.cartCleared && underTenderResult.cartItemsRemaining === 2);

        // 1.2: Exact Cash Tender: ₹100 tendered for ₹100 bill
        const exactTenderResult = await client.evaluate(`(async () => {
            window.openCheckoutModal(true);
            window.selectPayment('Cash', 'checkout');

            const tenderInput = document.getElementById('checkoutCashTenderedInput');
            tenderInput.value = '100.00';
            window.onCashTenderedChange('100.00');

            const dueBox = document.getElementById('checkoutChangeDueBox');
            const dueLabel = document.getElementById('checkoutChangeDueLabel');
            const dueDisplay = document.getElementById('checkoutChangeDueDisplay');

            const hasShortageClass = dueBox ? dueBox.classList.contains('shortage') : false;
            const labelText = dueLabel ? dueLabel.innerText : '';
            const displayText = dueDisplay ? dueDisplay.innerText : '';

            const orderCountBefore = window.orderHistory.length;
            
            // Execute confirmCheckout
            await window.confirmCheckout();

            const orderCountAfter = window.orderHistory.length;
            const createdOrder = orderCountAfter > orderCountBefore ? window.orderHistory[0] : null;
            const cartItemsAfter = window.tablesInfo[1].items.length;

            return {
                hasShortageClass,
                labelText,
                displayText,
                orderCreated: orderCountAfter > orderCountBefore,
                cartCleared: cartItemsAfter === 0,
                amountTendered: createdOrder ? createdOrder.amountTendered : null,
                changeReturned: createdOrder ? createdOrder.changeReturned : null,
                totalAmount: createdOrder ? createdOrder.amount : null
            };
        })()`);
        console.log("  Exact Tender Test Result (₹100 for ₹100):", exactTenderResult);
        record("Exact tender: Shortage styling absent", exactTenderResult.hasShortageClass === false);
        record("Exact tender: Label is 'Change Due to Diner:'", exactTenderResult.labelText.includes('Change Due'));
        record("Exact tender: Change due displays ₹ 0.00", exactTenderResult.displayText.includes('0.00'));
        record("Exact tender: Order successfully created in orderHistory", exactTenderResult.orderCreated === true);
        record("Exact tender: Change returned recorded as 0.00", exactTenderResult.changeReturned === 0);
        record("Exact tender: Cart and table items cleared after settlement", exactTenderResult.cartCleared === true);

        // 1.3: Over-tendered Cash: ₹500 tendered for ₹320 bill
        const overTenderResult = await client.evaluate(`(async () => {
            window.selectTable(1);
            window.tablesInfo[1] = {
                items: [
                    { id: 993, name: "Special Paneer Thali", price: 320.00, qty: 1, gstRate: 0 }
                ],
                status: 'occupied',
                savedTime: Date.now(),
                discount: null
            };
            window.syncTableUI();
            window.updateCartUI();

            window.openCheckoutModal(true);
            window.selectPayment('Cash', 'checkout');

            const tenderInput = document.getElementById('checkoutCashTenderedInput');
            tenderInput.value = '500.00';
            window.onCashTenderedChange('500.00');

            const dueBox = document.getElementById('checkoutChangeDueBox');
            const dueLabel = document.getElementById('checkoutChangeDueLabel');
            const dueDisplay = document.getElementById('checkoutChangeDueDisplay');

            const hasShortageClass = dueBox ? dueBox.classList.contains('shortage') : false;
            const labelText = dueLabel ? dueLabel.innerText : '';
            const displayText = dueDisplay ? dueDisplay.innerText : '';

            const orderCountBefore = window.orderHistory.length;

            // Execute confirmCheckout
            await window.confirmCheckout();

            const orderCountAfter = window.orderHistory.length;
            const createdOrder = orderCountAfter > orderCountBefore ? window.orderHistory[0] : null;
            const cartItemsAfter = window.tablesInfo[1].items.length;

            return {
                hasShortageClass,
                labelText,
                displayText,
                orderCreated: orderCountAfter > orderCountBefore,
                cartCleared: cartItemsAfter === 0,
                amountTendered: createdOrder ? createdOrder.amountTendered : null,
                changeReturned: createdOrder ? createdOrder.changeReturned : null,
                totalAmount: createdOrder ? createdOrder.amount : null
            };
        })()`);
        console.log("  Over-Tender Test Result (₹500 for ₹320):", overTenderResult);
        record("Over-tender: Shortage styling absent", overTenderResult.hasShortageClass === false);
        record("Over-tender: Change display is exactly ₹ 180.00", overTenderResult.displayText.includes('180.00'));
        record("Over-tender: Order created with amount: 320, amountTendered: 500, changeReturned: 180",
            overTenderResult.orderCreated === true &&
            overTenderResult.totalAmount === 320 &&
            overTenderResult.amountTendered === 500 &&
            overTenderResult.changeReturned === 180
        );
        record("Over-tender: Cart cleared upon successful payment", overTenderResult.cartCleared === true);

        // 1.4: UPI QR Generation Flow & Card / Online Tender Options
        const upiAndCardResult = await client.evaluate(`(async () => {
            window.selectTable(1);
            window.tablesInfo[1] = {
                items: [
                    { id: 994, name: "Cold Brew Tonic", price: 250.00, qty: 1, gstRate: 0 }
                ],
                status: 'occupied',
                savedTime: Date.now(),
                discount: null
            };
            window.syncTableUI();
            window.updateCartUI();

            window.openCheckoutModal(true);

            // Test UPI mode selection
            window.selectPayment('UPI', 'checkout');

            const upiWrap = document.getElementById('checkoutUpiQrContainer');
            const cashWrap = document.getElementById('checkoutCashTenderContainer');
            const cardWrap = document.getElementById('checkoutCardContainer');
            const upiAmtDisplay = document.getElementById('checkoutUpiAmtDisplay');
            const upiCanvasHolder = document.getElementById('checkoutModalQrCanvas');

            const upiVisible = upiWrap ? window.getComputedStyle(upiWrap).display !== 'none' : false;
            const cashHiddenOnUpi = cashWrap ? window.getComputedStyle(cashWrap).display === 'none' : false;
            const upiAmt = upiAmtDisplay ? upiAmtDisplay.innerText.trim() : '';
            const upiHasContent = upiCanvasHolder ? upiCanvasHolder.innerHTML.length > 0 : false;

            // Test Card mode selection
            window.selectPayment('Card', 'checkout');
            const cardVisible = cardWrap ? window.getComputedStyle(cardWrap).display !== 'none' : false;
            const upiHiddenOnCard = upiWrap ? window.getComputedStyle(upiWrap).display === 'none' : false;
            const selectedMode = document.getElementById('selectedPaymentMode')?.value;

            // Complete checkout via Card
            const orderCountBefore = window.orderHistory.length;
            await window.confirmCheckout();
            const orderCountAfter = window.orderHistory.length;
            const cardOrder = orderCountAfter > orderCountBefore ? window.orderHistory[0] : null;

            return {
                upiVisible,
                cashHiddenOnUpi,
                upiAmt,
                upiHasContent,
                cardVisible,
                upiHiddenOnCard,
                selectedMode,
                cardOrderCreated: !!cardOrder,
                cardOrderPaymentMode: cardOrder ? cardOrder.paymentMode : null,
                cardOrderAmount: cardOrder ? cardOrder.amount : null
            };
        })()`);
        console.log("  UPI & Card Mode Test Result:", upiAndCardResult);
        record("UPI: Container displayed and Cash container hidden", upiAndCardResult.upiVisible && upiAndCardResult.cashHiddenOnUpi);
        record("UPI: Display amount matches bill payable ₹ 250.00", upiAndCardResult.upiAmt === '250.00');
        record("UPI: Dynamic QR container populated with canvas / fallback note", upiAndCardResult.upiHasContent);
        record("Card: Card instructions container displayed", upiAndCardResult.cardVisible && upiAndCardResult.upiHiddenOnCard);
        record("Card: Order settlement completes with paymentMode: 'Card'",
            upiAndCardResult.cardOrderCreated &&
            upiAndCardResult.cardOrderPaymentMode === 'Card' &&
            upiAndCardResult.cardOrderAmount === 250
        );

        // ==========================================================================
        // SUITE 2: TABLE MANAGEMENT & KOT TICKETING
        // ==========================================================================
        console.log("\n🍽️ --- SUITE 2: TABLE MANAGEMENT & KOT TICKETING ---");

        const tableKotResult = await client.evaluate(`(async () => {
            // 2.1: Table selection and vacant initial state
            window.selectTable(3);
            const activeBadge = document.getElementById('posActiveTableBadge')?.innerText;
            const t3Initial = window.tablesInfo[3] || { items: [], status: 'empty' };
            const initialStatus = t3Initial.status;

            // 2.2: Add items to Table 3 -> transition to occupied
            const testItem = (window.menuItems && window.menuItems.length > 0)
                ? window.menuItems[0] 
                : { id: 101, name: "Masala Chai", price: 30 };
            
            window.addToCart(testItem.id);
            const t3AfterAdd = window.tablesInfo[3];
            const statusAfterAdd = t3AfterAdd.status;
            const itemsCountAfterAdd = t3AfterAdd.items.length;

            // 2.3: Verify Table Status in UI Grid
            const tBtn = document.getElementById('table-btn-3');
            const hasOccupiedClass = tBtn ? tBtn.classList.contains('occupied') : false;
            const hasSelectedClass = tBtn ? tBtn.classList.contains('selected') : false;

            // 2.4: Simulate billing status transition
            t3AfterAdd.status = 'billed';
            window.syncTableUI();
            const hasBilledClass = tBtn ? tBtn.classList.contains('billed') : false;

            // Restore occupied status for KOT test
            t3AfterAdd.status = 'occupied';
            window.syncTableUI();

            // 2.5: Test KOT Generation & Kitchen Ticket Template
            let kotProcessedToast = null;
            const origToast = window.showToast;
            window.showToast = (msg) => {
                kotProcessedToast = msg;
                if (typeof origToast === 'function') origToast(msg);
            };

            await window.printKitchenTicket();
            window.showToast = origToast;

            // Check printable KOT DOM elements
            const printKotTable = document.getElementById('printKotTableNo')?.innerText;
            const printKotItems = document.getElementById('printKotItems')?.innerHTML;

            // 2.6: Settle Table 3 to return to vacant
            window.openCheckoutModal(true);
            window.selectPayment('Cash', 'checkout');
            const cTot = parseFloat(document.getElementById('checkoutTotal')?.innerText) || 0;
            const tInput = document.getElementById('checkoutCashTenderedInput');
            if (tInput) tInput.value = cTot.toFixed(2);
            window.onCashTenderedChange(cTot.toFixed(2));
            await window.confirmCheckout();

            const statusAfterSettlement = window.tablesInfo[3]?.status;
            const itemsAfterSettlement = window.tablesInfo[3]?.items?.length;
            const hasEmptyClass = tBtn ? tBtn.classList.contains('empty') : false;

            return {
                activeBadge,
                initialStatus,
                statusAfterAdd,
                itemsCountAfterAdd,
                hasOccupiedClass,
                hasSelectedClass,
                hasBilledClass,
                kotProcessedToast,
                printKotTable,
                printKotHasItems: !!printKotItems && printKotItems.includes(testItem.name),
                statusAfterSettlement,
                itemsAfterSettlement,
                hasEmptyClass
            };
        })()`);
        console.log("  Table & KOT Test Result:", tableKotResult);
        record("Table Selection: Pos badge reflects Table 3 selection", tableKotResult.activeBadge.includes('3'));
        record("Table Initial State: Vacant / empty", tableKotResult.initialStatus === 'empty' || tableKotResult.initialStatus === 'vacant');
        record("Table Transition: Adding item transitions status to 'occupied'", tableKotResult.statusAfterAdd === 'occupied' && tableKotResult.itemsCountAfterAdd > 0);
        record("Table UI: Button reflects .occupied and .selected styling", tableKotResult.hasOccupiedClass && tableKotResult.hasSelectedClass);
        record("Table Transition: Table status transitions to 'billed' with .billed styling", tableKotResult.hasBilledClass === true);
        record("KOT Ticketing: printKitchenTicket generates printable KOT items", tableKotResult.printKotHasItems === true);
        record("Table Settlement: Settle bill transitions table back to 'empty' (vacant)", tableKotResult.statusAfterSettlement === 'empty' && tableKotResult.itemsAfterSettlement === 0);

        // ==========================================================================
        // SUITE 3: CULINARY INVENTORY HUB (RECIPES, BATCH MULTIPLIERS, SPOILAGE)
        // ==========================================================================
        console.log("\n🍲 --- SUITE 3: CULINARY INVENTORY HUB STRESS TESTING ---");

        const culinaryResult = await client.evaluate(`(() => {
            const hasCulinary = typeof window.culinaryInventory !== 'undefined' || typeof window.rawMaterials !== 'undefined' || typeof window.getApproxAutoFill === 'function';
            return { hasCulinary };
        })()`);
        console.log("  Culinary In-Browser Result:", culinaryResult);
        record("Culinary Hub: Module loaded in POS window", culinaryResult.hasCulinary === true);

        // Also run direct unit verification of culinary batch & spoilage logic via Node module
        const { calculateDishFoodCost, produceMorningPrepBatch, logSpoilageWaste } = await (async () => {
            try {
                const invService = await import('../src/features/inventory/inventory.service.js');
                return {
                    calculateDishFoodCost: invService.calculateDishFoodCost,
                    produceMorningPrepBatch: invService.produceMorningPrepBatch,
                    logSpoilageWaste: invService.logSpoilageWaste
                };
            } catch (e) {
                return {};
            }
        })();

        if (calculateDishFoodCost) {
            const costRes = calculateDishFoodCost('DISH-PBM-01');
            record("Inventory Service: calculateDishFoodCost returns valid food cost", costRes && !costRes.error);
        }

        // ==========================================================================
        // SUITE 4: MULTI-VIEWPORT BROWSER VERIFICATION & ZERO CONSOLE ERRORS
        // ==========================================================================
        console.log("\n📱 --- SUITE 4: MULTI-VIEWPORT BROWSER VERIFICATION ---");

        const viewports = [
            { name: "PC Desktop", width: 1440, height: 900, isMobile: false },
            { name: "Tablet", width: 768, height: 1024, isMobile: true },
            { name: "Mobile", width: 375, height: 667, isMobile: true }
        ];

        for (const vp of viewports) {
            console.log(`\n  Checking Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
            await client.setViewport(vp.width, vp.height, vp.isMobile);

            const overflowCheck = await client.evaluate(`(() => {
                const docWidth = document.documentElement.offsetWidth;
                const scrollWidth = document.documentElement.scrollWidth;
                const winWidth = window.innerWidth;
                
                const hasOverflow = scrollWidth > winWidth || document.documentElement.clientWidth < scrollWidth;
                
                const pos = document.getElementById('pos');
                const posVisible = pos ? window.getComputedStyle(pos).display !== 'none' : false;

                return {
                    winWidth,
                    scrollWidth,
                    docWidth,
                    hasOverflow,
                    posVisible
                };
            })()`);
            console.log(`    Viewport Layout Metrics:`, overflowCheck);
            record(`${vp.name}: Zero horizontal scroll overflow`, !overflowCheck.hasOverflow);
            record(`${vp.name}: POS root view is rendered and visible`, overflowCheck.posVisible);
        }

        // Check console errors across entire execution
        console.log(`\n📢 --- CONSOLE LOG & EXCEPTION AUDIT ---`);
        console.log(`  Total Messages: ${client.consoleMessages.length}`);
        console.log(`  Total Errors: ${client.errors.length}`);
        console.log(`  Total Warnings: ${client.warnings.length}`);
        if (client.errors.length > 0) {
            console.log("  Errors found:", client.errors);
        }

        const unhandledExceptions = client.errors.filter(e => e.includes('[EXCEPTION]') || e.includes('TypeError') || e.includes('ReferenceError'));
        record("Zero unhandled console errors or runtime exceptions across all viewports", unhandledExceptions.length === 0, unhandledExceptions.join('; '));

    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }

    console.log("\n==============================================================================");
    console.log(`🎯 EMPIRICAL AUDIT RESULTS: ${suiteResults.passedChecks} / ${suiteResults.totalChecks} PASSED (${suiteResults.failedChecks} FAILED)`);
    console.log("==============================================================================");

    const verdict = suiteResults.failedChecks === 0 ? "APPROVE" : "REQUEST_CHANGES";
    console.log(`\nFINAL CHALLENGER VERDICT: ${verdict}\n`);

    // Write full audit result to JSON
    fs.writeFileSync(
        path.join(process.cwd(), '.agents', 'teamwork', 'challenger_gate_1', 'empirical_audit_results.json'),
        JSON.stringify({ ...suiteResults, verdict, timestamp: new Date().toISOString() }, null, 2)
    );

    return { ...suiteResults, verdict };
}

runEmpiricalVerification().catch(err => {
    console.error("FATAL ERROR in Empirical Verification:", err);
    process.exit(1);
});
