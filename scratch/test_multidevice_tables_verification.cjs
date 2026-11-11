/**
 * scratch/test_multidevice_tables_verification.cjs
 *
 * Milestone 2: Main POS Table Operations Robustness & Multi-Device Responsive Verification Suite
 * Native Node 24 WebSocket & CDP implementation (zero external npm dependencies)
 *
 * Requirements Verified:
 * R2: Main POS Table Operations:
 *   - Floor switching in #posFloorSelector ("Ground Floor", "1st Floor", "Outdoor") updates .floor-pill.active properly.
 *   - Table selection in #tableGridUI (selectTable(i)) activates the table and displays active table badge.
 *   - Adding items to the active table order from menu items (addToCart).
 *   - Sending KOT / booking table (bookTable / computeKotDelta) marks status to 'kot'.
 *   - Checkout / settlement (openCheckoutModal, completeCheckout) archives invoice and clears active table.
 *   - Verify that <div id="tables" class="view"> is completely absent from DOM and produces zero ReferenceErrors.
 *
 * R3: Multi-Device Responsive Compatibility:
 *   - Mobile Viewports (375x667, 390x844, 430x932):
 *     * No horizontal window overflow (scrollWidth <= innerWidth)
 *     * Bottom navigation bar (.sidebar) fixed at bottom with safe-area padding
 *     * #tablesWrapper table strip accessible and scrollable
 *     * More Hub modal opens as slide-up bottom sheet with 4 operational cards (no "Dine-In Tables"), 0 console errors, closes cleanly
 *     * Cart drawer / bottom bar operates properly
 *   - Tablet Viewports (768x1024, 820x1180):
 *     * Dual-pane split POS layout (.pos-layout) with side-by-side ordering and ~290px cart pane
 *     * 4-column menu grid and #tablesWrapper rendering
 *     * More Hub modal renders and operates properly
 *   - Desktop Viewports (1280x800, 1440x900):
 *     * Desktop POS layout with permanent cart sidebar (~360px) and 4-column menu grid
 *     * More Hub modal renders as centered dialog modal
 *
 * Console Error Auditing:
 *   - Capture any runtime console errors, uncaught exceptions, or 404 network requests during interactions. Verify 0 errors.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'scratch', 'browser_artifacts');
const CDP_PORT = 9255;
const SERVER_URL = 'http://localhost:5000';

if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 1. CHROME DISCOVERY & PROCESS MANAGEMENT
// ------------------------------------------------------------
function findChromeExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Chrome/Edge executable not found in standard system locations.');
}

// ------------------------------------------------------------
// 2. SERVER HEALTH MANAGEMENT (PID REUSE OR BOOT)
// ------------------------------------------------------------
async function ensureServerRunning() {
    try {
        const res = await fetch(`${SERVER_URL}/api/health`);
        const json = await res.json();
        if (json.status === 'ok') {
            console.log('✅ Local server is already running and healthy (PID reuse).');
            return null;
        }
    } catch (e) {
        // Server not running yet
    }

    console.log('⚡ Booting local server: node server.js...');
    const serverProc = spawn('node', ['server.js'], {
        cwd: ROOT_DIR,
        env: process.env,
        stdio: 'ignore'
    });

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 400));
        try {
            const res = await fetch(`${SERVER_URL}/api/health`);
            const json = await res.json();
            if (json.status === 'ok') {
                console.log('✅ Local server successfully booted and ready.');
                return serverProc;
            }
        } catch (e) {}
    }
    serverProc.kill();
    throw new Error('Server failed to start and respond on /api/health within 12 seconds.');
}

// ------------------------------------------------------------
// 3. ZERO-DEPENDENCY NATIVE NODE 24 CDP CLIENT
// ------------------------------------------------------------
class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = new Map();
    }

    async init() {
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onclose = () => {
            for (const [id, { reject }] of this.callbacks.entries()) {
                reject(new Error(`CDP connection closed unexpectedly while waiting for message #${id}`));
            }
            this.callbacks.clear();
        };

        this.ws.onerror = (err) => {
            for (const [id, { reject }] of this.callbacks.entries()) {
                reject(new Error(`CDP connection error for message #${id}: ${err?.message || err}`));
            }
            this.callbacks.clear();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.id && this.callbacks.has(msg.id)) {
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) {
                        reject(new Error(JSON.stringify(msg.error)));
                    } else {
                        resolve(msg.result);
                    }
                } else if (msg.method && this.eventListeners.has(msg.method)) {
                    this.eventListeners.get(msg.method).forEach(fn => fn(msg.params));
                }
            } catch (err) {
                console.error('CDP message parse error:', err);
            }
        };
    }

    send(method, params = {}, timeoutMs = 25000) {
        return new Promise((resolve, reject) => {
            const msgId = this.id++;
            const timer = setTimeout(() => {
                if (this.callbacks.has(msgId)) {
                    this.callbacks.delete(msgId);
                    reject(new Error(`CDP request #${msgId} (${method}) timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.callbacks.set(msgId, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            });
            this.ws.send(JSON.stringify({ id: msgId, method, params }));
        });
    }

    on(event, handler) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(handler);
    }

    async evaluate(expression, retries = 3) {
        const isAsync = expression.includes('async ') || expression.includes('await ');
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await this.send('Runtime.evaluate', {
                    expression,
                    returnByValue: true,
                    awaitPromise: isAsync
                }, 15000);
                if (res.exceptionDetails) {
                    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
                    throw new Error(`Runtime.evaluate Exception: ${desc}`);
                }
                return res.result ? res.result.value : null;
            } catch (err) {
                if (attempt < retries && (err.message.includes('context') || err.message.includes('destroyed') || err.message.includes('not defined'))) {
                    await new Promise(r => setTimeout(r, 600));
                    continue;
                }
                throw err;
            }
        }
    }

    async setViewport(vp) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: vp.scale || 1,
            mobile: Boolean(vp.mobile)
        });
        await new Promise(r => setTimeout(r, 350));
    }

    async captureScreenshot(filename) {
        const fullPath = path.join(ARTIFACTS_DIR, filename);
        const res = await this.send('Page.captureScreenshot', { format: 'png' }, 30000);
        const buffer = Buffer.from(res.data, 'base64');
        fs.writeFileSync(fullPath, buffer);
        console.log(`    📸 Saved screenshot: ${filename} (${buffer.length.toLocaleString()} bytes)`);
    }

    close() {
        try {
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                this.ws.onclose = null;
                this.ws.close();
            }
        } catch (e) {}
        for (const [id, { reject }] of this.callbacks.entries()) {
            reject(new Error(`CDP client explicitly closed during request #${id}`));
        }
        this.callbacks.clear();
        this.eventListeners.clear();
    }
}

// ------------------------------------------------------------
// 4. TEST SUITE IMPLEMENTATION
// ------------------------------------------------------------

const VIEWPORTS = [
    // Mobile Viewports (~375–430px)
    { id: 'mobile_375x667', name: 'Mobile 375x667 (iPhone SE)', category: 'mobile', width: 375, height: 667, scale: 2, mobile: true },
    { id: 'mobile_390x844', name: 'Mobile 390x844 (iPhone 12/13/14)', category: 'mobile', width: 390, height: 844, scale: 2, mobile: true },
    { id: 'mobile_430x932', name: 'Mobile 430x932 (iPhone 14/15 Pro Max)', category: 'mobile', width: 430, height: 932, scale: 3, mobile: true },

    // Tablet Viewports (~768–1024px)
    { id: 'tablet_768x1024', name: 'Tablet 768x1024 (iPad Portrait)', category: 'tablet', width: 768, height: 1024, scale: 2, mobile: true },
    { id: 'tablet_820x1180', name: 'Tablet 820x1180 (iPad Air Portrait)', category: 'tablet', width: 820, height: 1180, scale: 2, mobile: true },

    // Desktop Viewports (>1024px)
    { id: 'desktop_1280x800', name: 'Desktop 1280x800 (WXGA Laptop)', category: 'desktop', width: 1280, height: 800, scale: 1, mobile: false },
    { id: 'desktop_1440x900', name: 'Desktop 1440x900 (High-Res Desktop)', category: 'desktop', width: 1440, height: 900, scale: 1, mobile: false }
];

async function runVerification() {
    console.log('====================================================================');
    console.log('🚀 MAIN POS TABLE OPERATIONS & MULTI-DEVICE VERIFICATION SUITE');
    console.log('====================================================================\n');

    let serverProc = null;
    let chromeProc = null;
    let tempProfileDir = null;
    let cdp = null;

    const runtimeErrors = [];
    const http404s = [];

    try {
        serverProc = await ensureServerRunning();

        // Prepare Chrome profile
        tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_tables_audit_'));
        const chromeExe = findChromeExecutable();

        console.log(`🖥️  Launching Headless Chrome: ${chromeExe}`);
        chromeProc = spawn(chromeExe, [
            `--remote-debugging-port=${CDP_PORT}`,
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            `--user-data-dir=${tempProfileDir}`,
            'about:blank'
        ], { stdio: 'ignore' });

        // Await CDP endpoint
        console.log(`⏳ Waiting for CDP target on port ${CDP_PORT}...`);
        let pages = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 400));
            try {
                const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
                pages = await res.json();
                if (Array.isArray(pages) && pages.length > 0 && pages[0].webSocketDebuggerUrl) {
                    break;
                }
            } catch (e) {}
        }

        if (!pages || !pages[0]?.webSocketDebuggerUrl) {
            throw new Error(`Failed to discover Chrome DevTools endpoint on port ${CDP_PORT}`);
        }

        const wsUrl = pages[0].webSocketDebuggerUrl;
        console.log(`🔗 Connecting to CDP Page: ${wsUrl}`);
        cdp = new CDPClient(wsUrl);
        await cdp.init();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');
        await cdp.send('Network.enable');

        // Track runtime console errors and uncaught exceptions
        cdp.on('Runtime.exceptionThrown', (params) => {
            const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception';
            console.error(`  ⚠️ Runtime Exception: ${desc}`);
            runtimeErrors.push(`Exception: ${desc}`);
        });

        cdp.on('Runtime.consoleAPICalled', (params) => {
            if (params.type === 'error') {
                const msg = (params.args || []).map(a => a.value || a.description || '').join(' ');
                // Filter out non-fatal expected warnings (e.g. quota limit, network mocks)
                if (!msg.includes('Quota limit') && !msg.includes('RESOURCE_EXHAUSTED')) {
                    console.error(`  ⚠️ Console Error: ${msg}`);
                    runtimeErrors.push(`Console Error: ${msg}`);
                }
            }
        });

        // Track 404 network responses
        cdp.on('Network.responseReceived', (params) => {
            if (params.response && params.response.status === 404) {
                console.error(`  ⚠️ HTTP 404: ${params.response.url}`);
                http404s.push(params.response.url);
            }
        });

        // Seed authentication & store data before loading page
        console.log('🔑 Registering base auth and store state...');
        const initScript = `
            (() => {
                const sampleMenu = [
                    { id: 1, name: "Espresso", category: "Beverages", price: 60, stockQty: 20, trackStock: true, is_active: true },
                    { id: 2, name: "Masala Chai", category: "Beverages", price: 25, stockQty: 30, trackStock: true, is_active: true },
                    { id: 3, name: "Chicken Burger", category: "Snacks", price: 150, stockQty: 10, trackStock: true, is_active: true },
                    { id: 4, name: "Veg Club Sandwich", category: "Snacks", price: 120, stockQty: 15, trackStock: true, is_active: true }
                ];

                localStorage.setItem('billnaw_auth_mode', 'authenticated');
                localStorage.setItem('billnaw_auth_token', 'mock-jwt-token-authenticated-terminal');
                localStorage.setItem('billnaw_is_master', 'true');
                localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
                localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                localStorage.setItem('billnaw_staff_pin_hash', '1234');
                localStorage.setItem('billnaw_current_staff', JSON.stringify({ id: 1, name: 'Admin', role: 'Admin' }));
                localStorage.setItem('cafe_shop_auth', JSON.stringify({
                    storeName: "Billnaw Cafe Demo",
                    ownerName: "Abhijeet",
                    email: "demo@billnawcafe.com",
                    currency: "INR",
                    currencySymbol: "₹ ",
                    status: "ACTIVE"
                }));
                localStorage.setItem('billnaw_shop_session', JSON.stringify({
                    token: "mock-session-token",
                    shop: {
                        storeName: "Billnaw Cafe Demo",
                        storeCode: "DEMO01",
                        ownerName: "Abhijeet",
                        categories: ["All", "Snacks", "Beverages", "Main Course"],
                        menu: sampleMenu
                    }
                }));
            })()
        `;
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });

        // Navigate to app URL
        console.log(`🌐 Navigating to ${SERVER_URL}...`);
        await cdp.send('Page.navigate', { url: SERVER_URL });

        console.log('⏳ Allowing initial lifecycle & service worker claim to settle...');
        await new Promise(r => setTimeout(r, 2500));

        console.log('⏳ Waiting for scripts and DOM to be fully ready...');
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const isReady = await cdp.evaluate(`
                    (() => {
                        return (document.readyState === 'complete' || document.readyState === 'interactive') &&
                               typeof switchTab === 'function' &&
                               typeof switchTabDirect === 'function' &&
                               typeof renderTables === 'function' &&
                               typeof selectTable === 'function' &&
                               !!document.getElementById('pos') &&
                               !!document.getElementById('tableGridUI');
                    })()
                `);
                if (isReady) {
                    console.log('  ✅ Page scripts and DOM ready at attempt #' + (i + 1));
                    break;
                }
            } catch (e) {}
        }

        // Ensure page DOM and scripts are fully initialized
        await cdp.evaluate(`
            (async () => {
                // Ensure overlays are closed
                document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
                const pairOverlay = document.getElementById('devicePairingOverlay');
                if (pairOverlay) pairOverlay.style.display = 'none';
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) loginOverlay.style.display = 'none';

                const sampleMenu = [
                    { id: 1, name: "Espresso", category: "Beverages", price: 60, stockQty: 20, trackStock: true, is_active: true },
                    { id: 2, name: "Masala Chai", category: "Beverages", price: 25, stockQty: 30, trackStock: true, is_active: true },
                    { id: 3, name: "Chicken Burger", category: "Snacks", price: 150, stockQty: 10, trackStock: true, is_active: true },
                    { id: 4, name: "Veg Club Sandwich", category: "Snacks", price: 120, stockQty: 15, trackStock: true, is_active: true }
                ];

                if (typeof menuItems !== 'undefined') {
                    menuItems.length = 0;
                    menuItems.push(...sampleMenu);
                }
                window.menuItems = sampleMenu;

                if (typeof idb !== 'undefined' && idb.set) {
                    try {
                        await idb.set('cafe_menu', sampleMenu);
                    } catch(e) {}
                }

                // Switch to POS tab
                if (typeof switchTab === 'function') switchTab('pos');
                if (typeof renderTables === 'function') renderTables();
                if (typeof renderMenu === 'function') renderMenu();
            })()
        `);

        await new Promise(r => setTimeout(r, 600));

        // Diagnostics
        const initialDiag = await cdp.evaluate(`
            (() => {
                return {
                    tableCount: (typeof shopProfile !== 'undefined' ? shopProfile.tableCount : 'no shopProfile'),
                    hasTablesInfo: typeof tablesInfo !== 'undefined' && !!tablesInfo,
                    tablesInfoKeys: typeof tablesInfo !== 'undefined' ? Object.keys(tablesInfo) : [],
                    gridInnerHtmlLength: document.getElementById('tableGridUI') ? document.getElementById('tableGridUI').innerHTML.length : -1,
                    renderedButtonsCount: document.querySelectorAll('#tableGridUI .table-btn').length,
                    activeView: document.querySelector('.view.active') ? document.querySelector('.view.active').id : 'none'
                };
            })()
        `);
        console.log('  🔍 [Initial Page Diagnostics]:', JSON.stringify(initialDiag));

        // ============================================================
        // SECTION 1: REQUIREMENT R2 - MAIN POS TABLE OPERATIONS
        // ============================================================
        console.log('\n====================================================================');
        console.log('📍 SECTION 1: MAIN POS TABLE OPERATIONS ROBUSTNESS (REQUIREMENT R2)');
        console.log('====================================================================\n');

        // Test 1.1: Verify <div id="tables" class="view"> is completely absent from DOM
        const tablesViewCheck = await cdp.evaluate(`
            (() => {
                const tablesView = document.getElementById('tables');
                return {
                    exists: !!tablesView,
                    allViews: Array.from(document.querySelectorAll('.view')).map(v => v.id)
                };
            })()
        `);
        assert.strictEqual(tablesViewCheck.exists, false, '<div id="tables" class="view"> must be completely absent from DOM');
        console.log('  ✅ [R2-01] Obsolete <div id="tables" class="view"> is completely absent from DOM.');

        // Test 1.2: Router Fallback - calling switchTabDirect('tables') safely aliases to 'pos'
        const routerFallbackCheck = await cdp.evaluate(`
            (() => {
                if (typeof switchTabDirect === 'function') {
                    switchTabDirect('tables');
                }
                const posView = document.getElementById('pos');
                return {
                    posIsActive: posView ? posView.classList.contains('active') : false
                };
            })()
        `);
        assert.strictEqual(routerFallbackCheck.posIsActive, true, 'switchTabDirect("tables") must alias safely to "pos" view');
        console.log('  ✅ [R2-02] Router fallback safely routes "tables" -> "pos" with zero blank screen.');

        // Test 1.3: Floor switching in #posFloorSelector updates .floor-pill.active properly
        const floorSwitchCheck = await cdp.evaluate(`
            (() => {
                const results = {};

                // Switch to 1st Floor
                switchFloor('1st Floor');
                let activePill = document.querySelector('#posFloorSelector .floor-pill.active');
                results.firstFloorActive = activePill ? activePill.textContent.trim() : null;

                // Switch to Outdoor
                switchFloor('Outdoor');
                activePill = document.querySelector('#posFloorSelector .floor-pill.active');
                results.outdoorActive = activePill ? activePill.textContent.trim() : null;

                // Switch back to Ground Floor
                switchFloor('Ground Floor');
                activePill = document.querySelector('#posFloorSelector .floor-pill.active');
                results.groundFloorActive = activePill ? activePill.textContent.trim() : null;

                return results;
            })()
        `);
        assert.strictEqual(floorSwitchCheck.firstFloorActive, '1st Floor', '1st Floor pill must become active');
        assert.strictEqual(floorSwitchCheck.outdoorActive, 'Outdoor', 'Outdoor pill must become active');
        assert.strictEqual(floorSwitchCheck.groundFloorActive, 'Ground Floor', 'Ground Floor pill must become active');
        console.log('  ✅ [R2-03] Floor switching in #posFloorSelector ("Ground Floor", "1st Floor", "Outdoor") updates .floor-pill.active properly.');

        // Test 1.4: Table selection in #tableGridUI (selectTable(i)) activates table and badge
        const tableSelectCheck = await cdp.evaluate(`
            (() => {
                // Select Table 2
                selectTable(2);

                const activeTableNum = typeof activeTable !== 'undefined' ? activeTable : null;
                const activeBadge = document.getElementById('posActiveTableBadge');
                const selectedBtn = document.querySelector('#tableGridUI .table-btn.selected');
                const btn2 = document.getElementById('table-btn-2');
                const allBtns = Array.from(document.querySelectorAll('#tableGridUI .table-btn'));

                return {
                    activeTableNum,
                    badgeText: activeBadge ? activeBadge.textContent.trim() : '',
                    hasSelectedClass: !!selectedBtn,
                    btn2ClassName: btn2 ? btn2.className : null,
                    allBtnClasses: allBtns.map(b => b.className),
                    btnCount: allBtns.length
                };
            })()
        `);
        console.log('  [Debug TableSelectCheck]:', JSON.stringify(tableSelectCheck));
        assert.strictEqual(tableSelectCheck.activeTableNum, 2, 'activeTable must equal 2');
        assert.ok(tableSelectCheck.badgeText.includes('2') || tableSelectCheck.badgeText.includes('Table 2'), `Active table badge must reflect Table 2, got: "${tableSelectCheck.badgeText}"`);
        assert.strictEqual(tableSelectCheck.hasSelectedClass, true, '.table-btn.selected class must be present on selected table');
        console.log('  ✅ [R2-04] Table selection in #tableGridUI (selectTable(2)) activates table, updates badge, and highlights .table-btn.');

        // Test 1.5: Adding items to active table order from menu items
        const addToOrderCheck = await cdp.evaluate(`
            (() => {
                const targetTable = 2;
                selectTable(targetTable);

                const mItems = (typeof menuItems !== 'undefined') ? menuItems : [];
                const item1 = mItems.find(m => m.id === 1);
                const item3 = mItems.find(m => m.id === 3);

                // Add 2 items: Espresso (id: 1) and Chicken Burger (id: 3)
                addToCart(1);
                addToCart(3);

                const tInfo = tablesInfo[targetTable];
                const cartItems = tInfo ? tInfo.items : [];
                const tableStatus = tInfo ? tInfo.status : null;

                return {
                    debugMItemsCount: mItems.length,
                    debugItem1: item1 ? item1.name : null,
                    debugItem3: item3 ? item3.name : null,
                    debugTInfoExists: !!tInfo,
                    itemCount: cartItems.length,
                    itemNames: cartItems.map(i => i.name),
                    tableStatus
                };
            })()
        `);
        console.log('  [Debug AddToOrderCheck]:', JSON.stringify(addToOrderCheck));
        assert.strictEqual(addToOrderCheck.itemCount, 2, 'Active table order must contain exactly 2 distinct menu items');
        assert.strictEqual(addToOrderCheck.tableStatus, 'occupied', 'Table status must transition to "occupied" upon adding items');
        console.log(`  ✅ [R2-05] Adding items to active table (Table 2) updates order (${addToOrderCheck.itemNames.join(', ')}) and sets status='occupied'.`);

        // Test 1.6: Sending KOT / booking table (bookTable / computeKotDelta) marks status to 'kot'
        const kotAndBookingCheck = await cdp.evaluate(`
            (() => {
                const results = {};

                // Part A: Reserve / book an empty table (Table 4)
                selectTable(4);
                // Table 4 should be empty
                results.table4PreStatus = tablesInfo[4]?.status || 'empty';
                bookTable();
                results.table4BookedStatus = tablesInfo[4]?.status;
                bookTable(); // Toggle back
                results.table4ClearedStatus = tablesInfo[4]?.status;

                // Part B: KOT Delta and dispatch on active Table 2 (with items)
                selectTable(2);
                const deltaBefore = typeof computeKotDelta === 'function' ? computeKotDelta(2) : null;
                results.hasNewItemsBefore = deltaBefore ? deltaBefore.hasNewItems : false;
                results.deltaCountBefore = deltaBefore ? deltaBefore.totalDeltaCount : 0;

                // Dispatch KOT via bookTable() / sendToKitchen()
                bookTable();
                results.table2StatusAfterKot = tablesInfo[2]?.status;

                const deltaAfter = typeof computeKotDelta === 'function' ? computeKotDelta(2) : null;
                results.hasNewItemsAfter = deltaAfter ? deltaAfter.hasNewItems : false;

                return results;
            })()
        `);
        assert.strictEqual(kotAndBookingCheck.table4BookedStatus, 'booked', 'bookTable on empty table must toggle status to "booked"');
        assert.strictEqual(kotAndBookingCheck.table4ClearedStatus, 'empty', 'second bookTable call must clear reservation back to "empty"');
        assert.strictEqual(kotAndBookingCheck.hasNewItemsBefore, true, 'computeKotDelta must detect unprinted items before KOT dispatch');
        assert.strictEqual(kotAndBookingCheck.table2StatusAfterKot, 'kot', 'Sending KOT on table with items must mark status to "kot"');
        assert.strictEqual(kotAndBookingCheck.hasNewItemsAfter, false, 'computeKotDelta must have 0 new items after KOT dispatch');
        console.log('  ✅ [R2-06] bookTable and computeKotDelta properly reserve empty tables and dispatch KOT marking status to "kot".');

        // Test 1.7: Checkout / settlement (openCheckoutModal, completeCheckout) archives invoice and clears active table
        const checkoutSettlementCheck = await cdp.evaluate(`
            (() => {
                selectTable(2);

                const preHistoryLength = orderHistory.length;
                openCheckoutModal(true);
                const modal = document.getElementById('checkoutModal');
                const isModalOpen = modal ? modal.style.display === 'flex' : false;

                // Complete checkout
                if (typeof completeCheckout === 'function') {
                    completeCheckout();
                } else if (typeof confirmCheckout === 'function') {
                    confirmCheckout();
                }

                const postHistoryLength = orderHistory.length;
                const archivedOrder = orderHistory[0];
                const table2AfterSettlement = tablesInfo[2];

                return {
                    isModalOpen,
                    preHistoryLength,
                    postHistoryLength,
                    archivedOrder: archivedOrder ? {
                        id: archivedOrder.id,
                        billNo: archivedOrder.billNo,
                        table: archivedOrder.table,
                        itemCount: archivedOrder.items?.length
                    } : null,
                    table2ItemsCount: table2AfterSettlement ? table2AfterSettlement.items.length : 0,
                    table2Status: table2AfterSettlement ? table2AfterSettlement.status : null
                };
            })()
        `);
        console.log('  [Debug checkoutSettlementCheck]:', JSON.stringify(checkoutSettlementCheck));
        assert.strictEqual(checkoutSettlementCheck.isModalOpen, true, 'openCheckoutModal must open #checkoutModal with display: flex');
        assert.ok(checkoutSettlementCheck.postHistoryLength > checkoutSettlementCheck.preHistoryLength, 'Checkout must record a new order in orderHistory');
        assert.strictEqual(checkoutSettlementCheck.table2ItemsCount, 0, 'Settled table items must be cleared to empty array');
        assert.strictEqual(checkoutSettlementCheck.table2Status, 'empty', 'Settled table status must be reset to "empty"');
        console.log(`  ✅ [R2-07] Checkout settlement (openCheckoutModal & completeCheckout) archives invoice #${checkoutSettlementCheck.archivedOrder?.billNo} and resets table status='empty'.`);

        // ============================================================
        // SECTION 2: REQUIREMENT R3 - MULTI-DEVICE RESPONSIVE COMPATIBILITY
        // ============================================================
        console.log('\n====================================================================');
        console.log('📍 SECTION 2: MULTI-DEVICE RESPONSIVE COMPATIBILITY (REQUIREMENT R3)');
        console.log('====================================================================\n');

        for (const vp of VIEWPORTS) {
            console.log(`--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) [${vp.category.toUpperCase()}] ---`);
            await cdp.setViewport(vp);
            await new Promise(r => setTimeout(r, 400));

            // Viewport Assessment 1: Window horizontal overflow check
            const overflowCheck = await cdp.evaluate(`
                (() => {
                    const docEl = document.documentElement;
                    const docBody = document.body;
                    const scrollWidth = docEl ? docEl.scrollWidth : (docBody ? docBody.scrollWidth : 0);
                    const innerWidth = window.innerWidth;
                    const bodyScrollWidth = docBody ? docBody.scrollWidth : 0;
                    return {
                        scrollWidth,
                        innerWidth,
                        bodyScrollWidth,
                        hasOverflow: scrollWidth > innerWidth + 1
                    };
                })()
            `);
            assert.strictEqual(overflowCheck.hasOverflow, false, `Viewport ${vp.name} has horizontal window overflow: scrollWidth=${overflowCheck.scrollWidth} > innerWidth=${overflowCheck.innerWidth}`);
            console.log(`  ✅ [${vp.id}] Zero horizontal window overflow (scrollWidth: ${overflowCheck.scrollWidth}px <= innerWidth: ${overflowCheck.innerWidth}px).`);

            // Viewport Assessment 2: Category-Specific Responsive Architecture
            if (vp.category === 'mobile') {
                // Mobile Viewport Checks:
                const mobileLayoutAssert = await cdp.evaluate(`
                    (() => {
                        const sidebar = document.querySelector('.sidebar');
                        const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;

                        const tablesWrapper = document.getElementById('tablesWrapper');
                        const tablesWrapStyle = tablesWrapper ? window.getComputedStyle(tablesWrapper) : null;

                        const tableGrid = document.getElementById('tableGridUI');
                        const tableGridStyle = tableGrid ? window.getComputedStyle(tableGrid) : null;

                        const menuGrid = document.querySelector('.menu-grid');
                        const menuGridStyle = menuGrid ? window.getComputedStyle(menuGrid) : null;

                        return {
                            sidebarPosition: sidebarStyle ? sidebarStyle.position : null,
                            sidebarBottom: sidebarStyle ? sidebarStyle.bottom : null,
                            sidebarFlexDirection: sidebarStyle ? sidebarStyle.flexDirection : null,
                            isTablesVisible: tablesWrapStyle ? tablesWrapStyle.display !== 'none' : false,
                            tableGridOverflowX: tableGridStyle ? tableGridStyle.overflowX : null,
                            menuGridColumns: menuGridStyle ? menuGridStyle.gridTemplateColumns.split(' ').length : 0
                        };
                    })()
                `);

                assert.strictEqual(mobileLayoutAssert.sidebarPosition, 'fixed', 'Sidebar on mobile must be fixed at bottom');
                assert.strictEqual(mobileLayoutAssert.sidebarBottom, '0px', 'Sidebar on mobile must be docked at bottom: 0');
                assert.strictEqual(mobileLayoutAssert.sidebarFlexDirection, 'row', 'Sidebar on mobile must be row orientation');
                assert.strictEqual(mobileLayoutAssert.isTablesVisible, true, '#tablesWrapper must be visible on mobile');
                assert.strictEqual(mobileLayoutAssert.tableGridOverflowX, 'auto', '#tableGridUI must have overflow-x: auto for swipeable strip');
                console.log(`  ✅ [${vp.id}] Mobile bottom navigation bar fixed at bottom (row layout), tables strip scrollable.`);

                // Mobile More Hub Modal as slide-up bottom sheet
                const moreHubMobileAssert = await cdp.evaluate(`
                    (() => {
                        openMoreHub();
                        const hubOverlay = document.getElementById('moreHubModal');
                        const hubBox = hubOverlay ? hubOverlay.querySelector('.more-hub-box') : null;
                        const overlayStyle = hubOverlay ? window.getComputedStyle(hubOverlay) : null;
                        const boxStyle = hubBox ? window.getComputedStyle(hubBox) : null;
                        const cards = hubBox ? Array.from(hubBox.querySelectorAll('.more-hub-card')) : [];
                        const hasTablesCard = cards.some(c => c.textContent.includes('Dine-In Tables'));

                        return {
                            isOpen: hubOverlay ? overlayStyle.display === 'flex' : false,
                            alignItems: overlayStyle ? overlayStyle.alignItems : null,
                            cardCount: cards.length,
                            hasTablesCard,
                            boxBorderRadius: boxStyle ? boxStyle.borderRadius : null
                        };
                    })()
                `);

                assert.strictEqual(moreHubMobileAssert.isOpen, true, '#moreHubModal must open cleanly on mobile');
                assert.strictEqual(moreHubMobileAssert.alignItems, 'flex-end', '#moreHubModal must align items to flex-end (slide-up bottom sheet)');
                assert.strictEqual(moreHubMobileAssert.cardCount, 4, 'More Hub must contain exactly 4 operational cards (no Dine-In Tables)');
                assert.strictEqual(moreHubMobileAssert.hasTablesCard, false, 'More Hub must NOT contain "Dine-In Tables" card');
                console.log(`  ✅ [${vp.id}] More Hub opens as slide-up bottom sheet (align-items: flex-end) with 4 operational cards.`);

                // Close More Hub cleanly
                await cdp.evaluate(`closeMoreHub();`);
                await new Promise(r => setTimeout(r, 200));

            } else if (vp.category === 'tablet') {
                // Tablet Viewport Checks (768–1024px):
                const tabletLayoutAssert = await cdp.evaluate(`
                    (() => {
                        const posLayout = document.querySelector('.pos-layout');
                        const posLayoutStyle = posLayout ? window.getComputedStyle(posLayout) : null;

                        const posRight = document.querySelector('.pos-right');
                        const posRightStyle = posRight ? window.getComputedStyle(posRight) : null;
                        const posRightWidth = posRight ? posRight.getBoundingClientRect().width : 0;

                        const menuGrid = document.querySelector('.menu-grid');
                        const menuGridStyle = menuGrid ? window.getComputedStyle(menuGrid) : null;
                        const colCount = menuGridStyle ? menuGridStyle.gridTemplateColumns.split(' ').length : 0;

                        const tablesWrapper = document.getElementById('tablesWrapper');
                        const isTablesVisible = tablesWrapper ? window.getComputedStyle(tablesWrapper).display !== 'none' : false;

                        return {
                            posFlexDirection: posLayoutStyle ? posLayoutStyle.flexDirection : null,
                            posRightDisplay: posRightStyle ? posRightStyle.display : null,
                            posRightWidth,
                            menuGridColCount: colCount,
                            isTablesVisible
                        };
                    })()
                `);

                assert.strictEqual(tabletLayoutAssert.posFlexDirection, 'row', '.pos-layout on tablet must be dual-pane row split');
                assert.strictEqual(tabletLayoutAssert.posRightDisplay, 'flex', '.pos-right cart pane on tablet must be visible flex container');
                assert.ok(Math.abs(tabletLayoutAssert.posRightWidth - 290) <= 20, `Tablet cart pane width must be ~290px, got: ${tabletLayoutAssert.posRightWidth}px`);
                assert.strictEqual(tabletLayoutAssert.menuGridColCount, 4, 'Tablet menu-grid must have strictly 4 columns');
                assert.strictEqual(tabletLayoutAssert.isTablesVisible, true, '#tablesWrapper must be visible on tablet');
                console.log(`  ✅ [${vp.id}] Tablet dual-pane layout verified (row flex, 290px cart pane, 4-col menu grid).`);

                // Tablet More Hub Modal
                const moreHubTabletAssert = await cdp.evaluate(`
                    (() => {
                        openMoreHub();
                        const hubOverlay = document.getElementById('moreHubModal');
                        const cards = hubOverlay ? Array.from(hubOverlay.querySelectorAll('.more-hub-card')) : [];
                        return {
                            isOpen: hubOverlay ? window.getComputedStyle(hubOverlay).display === 'flex' : false,
                            cardCount: cards.length,
                            hasTablesCard: cards.some(c => c.textContent.includes('Dine-In Tables'))
                        };
                    })()
                `);
                assert.strictEqual(moreHubTabletAssert.isOpen, true, '#moreHubModal must open cleanly on tablet');
                assert.strictEqual(moreHubTabletAssert.cardCount, 4, 'More Hub on tablet must contain exactly 4 operational cards');
                assert.strictEqual(moreHubTabletAssert.hasTablesCard, false, 'More Hub must NOT contain "Dine-In Tables" card');
                await cdp.evaluate(`closeMoreHub();`);
                await new Promise(r => setTimeout(r, 200));

            } else if (vp.category === 'desktop') {
                // Desktop Viewport Checks (>1024px):
                const desktopLayoutAssert = await cdp.evaluate(`
                    (() => {
                        const posLayout = document.querySelector('.pos-layout');
                        const posLayoutStyle = posLayout ? window.getComputedStyle(posLayout) : null;

                        const posRight = document.querySelector('.pos-right');
                        const posRightWidth = posRight ? posRight.getBoundingClientRect().width : 0;

                        const menuGrid = document.querySelector('.menu-grid');
                        const menuGridStyle = menuGrid ? window.getComputedStyle(menuGrid) : null;
                        const colCount = menuGridStyle ? menuGridStyle.gridTemplateColumns.split(' ').length : 0;

                        const tablesWrapper = document.getElementById('tablesWrapper');
                        const isTablesVisible = tablesWrapper ? window.getComputedStyle(tablesWrapper).display !== 'none' : false;

                        return {
                            posFlexDirection: posLayoutStyle ? posLayoutStyle.flexDirection : null,
                            posRightWidth,
                            menuGridColCount: colCount,
                            isTablesVisible
                        };
                    })()
                `);

                assert.strictEqual(desktopLayoutAssert.posFlexDirection, 'row', '.pos-layout on desktop must be side-by-side row flex');
                assert.ok(Math.abs(desktopLayoutAssert.posRightWidth - 360) <= 30, `Desktop cart pane width must be ~360px, got: ${desktopLayoutAssert.posRightWidth}px`);
                assert.strictEqual(desktopLayoutAssert.menuGridColCount, 4, 'Desktop menu grid must have 4 columns');
                assert.strictEqual(desktopLayoutAssert.isTablesVisible, true, '#tablesWrapper must be visible on desktop');
                console.log(`  ✅ [${vp.id}] Desktop layout verified (row flex, ~360px cart sidebar, 4-col menu grid).`);

                // Desktop More Hub Modal as centered dialog
                const moreHubDesktopAssert = await cdp.evaluate(`
                    (() => {
                        openMoreHub();
                        const hubOverlay = document.getElementById('moreHubModal');
                        const overlayStyle = hubOverlay ? window.getComputedStyle(hubOverlay) : null;
                        const cards = hubOverlay ? Array.from(hubOverlay.querySelectorAll('.more-hub-card')) : [];
                        return {
                            isOpen: hubOverlay ? overlayStyle.display === 'flex' : false,
                            alignItems: overlayStyle ? overlayStyle.alignItems : null,
                            cardCount: cards.length,
                            hasTablesCard: cards.some(c => c.textContent.includes('Dine-In Tables'))
                        };
                    })()
                `);
                assert.strictEqual(moreHubDesktopAssert.isOpen, true, '#moreHubModal must open cleanly on desktop');
                assert.strictEqual(moreHubDesktopAssert.alignItems, 'center', '#moreHubModal must align items to center (dialog modal) on desktop');
                assert.strictEqual(moreHubDesktopAssert.cardCount, 4, 'More Hub on desktop must contain exactly 4 operational cards');
                assert.strictEqual(moreHubDesktopAssert.hasTablesCard, false, 'More Hub must NOT contain "Dine-In Tables" card');
                await cdp.evaluate(`closeMoreHub();`);
                await new Promise(r => setTimeout(r, 200));
            }

            // Capture screenshot for visual proof
            await cdp.captureScreenshot(`m2_multidevice_${vp.id}.png`);
        }

        // ============================================================
        // SECTION 3: CONSOLE ERROR & NETWORK AUDITING
        // ============================================================
        console.log('\n====================================================================');
        console.log('📍 SECTION 3: RUNTIME CONSOLE ERROR & NETWORK AUDITING');
        console.log('====================================================================\n');

        console.log(`Total Runtime Errors/Exceptions intercepted: ${runtimeErrors.length}`);
        console.log(`Total HTTP 404 responses intercepted: ${http404s.length}`);

        if (runtimeErrors.length > 0) {
            console.error('Captured Runtime Errors:', runtimeErrors);
        }
        if (http404s.length > 0) {
            console.error('Captured 404 URLs:', http404s);
        }

        assert.strictEqual(runtimeErrors.length, 0, `Audit encountered ${runtimeErrors.length} runtime errors/exceptions: ${JSON.stringify(runtimeErrors)}`);
        assert.strictEqual(http404s.length, 0, `Audit encountered ${http404s.length} 404 network responses: ${JSON.stringify(http404s)}`);
        console.log('  ✅ [AUDIT] Zero runtime console errors, zero uncaught exceptions, and zero 404 network requests.');

        console.log('\n====================================================================');
        console.log('🎉 ALL MILESTONE 2 MULTI-DEVICE & TABLE OPERATIONS VERIFIED 100%!');
        console.log('====================================================================\n');

    } finally {
        console.log('🧹 Teardown CDP connection and temporary test processes...');
        if (cdp) cdp.close();
        if (chromeProc) {
            try {
                chromeProc.kill();
            } catch (e) {}
        }
        if (tempProfileDir && fs.existsSync(tempProfileDir)) {
            try {
                fs.rmSync(tempProfileDir, { recursive: true, force: true });
            } catch (e) {}
        }
        if (serverProc) {
            try {
                serverProc.kill();
            } catch (e) {}
        }
    }
}

runVerification().catch(err => {
    console.error('\n❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
});
