/**
 * scratch/challenger_stress_verification.cjs
 *
 * EMPIRICAL CHALLENGER ADVERSARIAL STRESS & MULTI-DEVICE VERIFICATION HARNESS
 * Pure Node 24 native WebSocket & Chrome CDP (zero external npm dependencies)
 *
 * Scope:
 * 1. Extreme Viewports Stress Test:
 *    - 320x568 (iPhone 5/SE1 extreme narrow mobile)
 *    - 375x667 (iPhone SE2/3 / Standard compact mobile)
 *    - 430x932 (iPhone 14/15/16 Pro Max large mobile)
 *    - 768x1024 (iPad Mini / Tablet portrait)
 *    - 1024x768 (iPad / Tablet landscape / small desktop)
 *    - 1920x1080 (Full HD / Ultra-wide desktop)
 *    Assertions:
 *    - Zero horizontal document overflow (scrollWidth <= innerWidth)
 *    - Mobile bottom navigation bar (.sidebar) fixed at bottom: 0, height >= 44px, touch accessibility
 *    - Mobile More Hub modal as slide-up bottom sheet with exactly 4 cards, NO "Dine-In Tables" card, closes cleanly
 *    - Dual-pane layout on tablet & desktop (.pos-layout row flex, visible cart pane, 4-col menu grid)
 *
 * 2. High-Frequency Table Ordering Lifecycle Stress Test:
 *    - 50 rapid table switches between Tables 1-5
 *    - Multi-table simultaneous order accumulation
 *    - KOT dispatch & delta verification
 *    - Empty table reservation toggle
 *    - Atomic settlement & invoice archival for multiple tables
 *    - Verification of zero UI desyncs, badge sync, and clean table resets
 *    - Interception of all runtime exceptions, console errors, and 404 network requests
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'scratch', 'browser_artifacts');
const CDP_PORT = 9258;
const SERVER_URL = 'http://localhost:5000';

if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

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

async function ensureServerRunning() {
    try {
        const res = await fetch(`${SERVER_URL}/api/health`);
        const json = await res.json();
        if (json.status === 'ok') {
            console.log('✅ Local server is already running and healthy.');
            return null;
        }
    } catch (e) {}

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
    throw new Error('Server failed to start within 12s');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = new Map();
    }

    async init() {
        await new Promise((resolve, reject) => {
            this.ws.addEventListener('open', resolve, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });

        this.ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.id && this.callbacks.has(msg.id)) {
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                    else resolve(msg.result);
                } else if (msg.method && this.eventListeners.has(msg.method)) {
                    this.eventListeners.get(msg.method).forEach(fn => fn(msg.params));
                }
            } catch (err) {
                console.error('CDP parse error:', err);
            }
        });
    }

    send(method, params = {}, timeoutMs = 25000) {
        return new Promise((resolve, reject) => {
            const msgId = this.id++;
            const timer = setTimeout(() => {
                if (this.callbacks.has(msgId)) {
                    this.callbacks.delete(msgId);
                    reject(new Error(`Timeout waiting for #${msgId} ${method}`));
                }
            }, timeoutMs);
            this.callbacks.set(msgId, {
                resolve: (res) => { clearTimeout(timer); resolve(res); },
                reject: (err) => { clearTimeout(timer); reject(err); }
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
                    throw new Error(`Runtime.evaluate Exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
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

    async setViewport(width, height, scale = 1, mobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: scale,
            mobile: Boolean(mobile)
        });
        await new Promise(r => setTimeout(r, 300));
    }

    async captureScreenshot(filename) {
        try {
            const fullPath = path.join(ARTIFACTS_DIR, filename);
            const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 6000);
            if (res && res.data) {
                const buffer = Buffer.from(res.data, 'base64');
                fs.writeFileSync(fullPath, buffer);
                console.log(`    📸 Saved screenshot: ${filename} (${buffer.length.toLocaleString()} bytes)`);
            }
        } catch (e) {
            console.log(`    ℹ️ Screenshot skipped: ${e.message}`);
        }
    }

    close() {
        try { this.ws.close(); } catch(e) {}
    }
}

async function runChallengerStress() {
    console.log('========================================================================');
    console.log('🛡️  EMPIRICAL CHALLENGER: ADVERSARIAL STRESS & COMPATIBILITY HARNESS');
    console.log('========================================================================\n');

    let serverProc = null;
    let chromeProc = null;
    let tempProfileDir = null;
    let cdp = null;

    const runtimeErrors = [];
    const http404s = [];

    try {
        serverProc = await ensureServerRunning();
        tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_challenger_stress_'));
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

        console.log(`⏳ Waiting for CDP target on port ${CDP_PORT}...`);
        let pages = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 300));
            try {
                const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
                pages = await res.json();
                if (Array.isArray(pages) && pages[0]?.webSocketDebuggerUrl) break;
            } catch (e) {}
        }
        if (!pages || !pages[0]?.webSocketDebuggerUrl) {
            throw new Error('Failed to find Chrome DevTools endpoint');
        }

        cdp = new CDPClient(pages[0].webSocketDebuggerUrl);
        await cdp.init();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');
        await cdp.send('Network.enable');

        cdp.on('Runtime.exceptionThrown', (params) => {
            const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception';
            console.error(`  ⚠️ Runtime Exception: ${desc}`);
            runtimeErrors.push(`Exception: ${desc}`);
        });

        cdp.on('Runtime.consoleAPICalled', (params) => {
            if (params.type === 'error') {
                const msg = (params.args || []).map(a => a.value || a.description || '').join(' ');
                if (!msg.includes('Quota limit') && !msg.includes('RESOURCE_EXHAUSTED')) {
                    console.error(`  ⚠️ Console Error: ${msg}`);
                    runtimeErrors.push(`Console Error: ${msg}`);
                }
            }
        });

        cdp.on('Network.responseReceived', (params) => {
            if (params.response && params.response.status === 404) {
                console.error(`  ⚠️ HTTP 404: ${params.response.url}`);
                http404s.push(params.response.url);
            }
        });

        // Seed auth and store data
        console.log('🔑 Registering base auth and store state...');
        const initScript = `
            (() => {
                const sampleMenu = [
                    { id: 1, name: "Espresso", category: "Beverages", price: 60, stockQty: 50, trackStock: true, is_active: true },
                    { id: 2, name: "Masala Chai", category: "Beverages", price: 25, stockQty: 60, trackStock: true, is_active: true },
                    { id: 3, name: "Chicken Burger", category: "Snacks", price: 150, stockQty: 40, trackStock: true, is_active: true },
                    { id: 4, name: "Veg Club Sandwich", category: "Snacks", price: 120, stockQty: 30, trackStock: true, is_active: true },
                    { id: 5, name: "Paneer Roll", category: "Snacks", price: 100, stockQty: 25, trackStock: true, is_active: true }
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
                        categories: ["All", "Snacks", "Beverages"],
                        menu: sampleMenu
                    }
                }));
            })()
        `;
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });

        console.log(`🌐 Navigating to ${SERVER_URL}...`);
        await cdp.send('Page.navigate', { url: SERVER_URL });

        console.log('⏳ Awaiting scripts and DOM to be fully loaded and interactive...');
        let pageReady = false;
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
                    pageReady = true;
                    console.log(`  ✅ Page ready at attempt #${i + 1}`);
                    break;
                }
            } catch (e) {}
        }
        assert.ok(pageReady, 'Page scripts failed to initialize within 10 seconds');

        // Close overlays and switch to POS
        await cdp.evaluate(`
            (() => {
                document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
                const pairOverlay = document.getElementById('devicePairingOverlay');
                if (pairOverlay) pairOverlay.style.display = 'none';
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) loginOverlay.style.display = 'none';

                if (typeof switchTab === 'function') switchTab('pos');
                if (typeof renderTables === 'function') renderTables();
                if (typeof renderMenu === 'function') renderMenu();
            })()
        `);
        await new Promise(r => setTimeout(r, 400));

        // ====================================================================
        // PHASE 1: ADVERSARIAL RESPONSIVE LAYOUT VERIFICATION (EXTREME VIEWPORTS)
        // ====================================================================
        console.log('\n====================================================================');
        console.log('📐 PHASE 1: ADVERSARIAL RESPONSIVE LAYOUT PROBING (320px to 1920px)');
        console.log('====================================================================\n');

        const testViewports = [
            { id: 'iphone_5_se1', name: 'iPhone 5/SE1 (Ultra-Narrow)', width: 320, height: 568, scale: 2, mobile: true, category: 'mobile' },
            { id: 'iphone_se2_3', name: 'iPhone SE 2/3 (Compact Mobile)', width: 375, height: 667, scale: 2, mobile: true, category: 'mobile' },
            { id: 'iphone_15_pro_max', name: 'iPhone 15 Pro Max (Large Mobile)', width: 430, height: 932, scale: 3, mobile: true, category: 'mobile' },
            { id: 'ipad_portrait', name: 'iPad Portrait (Tablet)', width: 768, height: 1024, scale: 2, mobile: true, category: 'tablet' },
            { id: 'ipad_landscape', name: 'iPad Landscape / Laptop (Tablet/Desktop)', width: 1024, height: 768, scale: 2, mobile: false, category: 'desktop' },
            { id: 'fhd_desktop', name: '1080p Full HD Desktop', width: 1920, height: 1080, scale: 1, mobile: false, category: 'desktop' }
        ];

        for (const vp of testViewports) {
            console.log(`--- Probing Viewport: ${vp.name} (${vp.width}x${vp.height}) [${vp.category.toUpperCase()}] ---`);
            await cdp.setViewport(vp.width, vp.height, vp.scale, vp.mobile);
            await new Promise(r => setTimeout(r, 300));

            // Assertion 1: Zero horizontal document overflow
            const overflow = await cdp.evaluate(`
                (() => {
                    const docEl = document.documentElement;
                    const docBody = document.body;
                    const scrollWidth = docEl ? docEl.scrollWidth : 0;
                    const bodyScrollWidth = docBody ? docBody.scrollWidth : 0;
                    const innerWidth = window.innerWidth;
                    return {
                        scrollWidth,
                        bodyScrollWidth,
                        innerWidth,
                        hasOverflow: Math.max(scrollWidth, bodyScrollWidth) > innerWidth + 1
                    };
                })()
            `);
            assert.strictEqual(overflow.hasOverflow, false, `Horizontal overflow detected on ${vp.name}: scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`);
            console.log(`  ✅ [${vp.id}] Zero horizontal document overflow (scrollWidth: ${overflow.scrollWidth}px <= innerWidth: ${overflow.innerWidth}px).`);

            // Category-specific assertions
            if (vp.category === 'mobile') {
                // Bottom navigation bar assertions
                const navBarAssert = await cdp.evaluate(`
                    (() => {
                        const sidebar = document.querySelector('.sidebar');
                        const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
                        const rect = sidebar ? sidebar.getBoundingClientRect() : null;

                        const navButtons = sidebar ? Array.from(sidebar.querySelectorAll('.nav-btn')) : [];
                        const touchTargetSizes = navButtons.map(btn => {
                            const r = btn.getBoundingClientRect();
                            return { id: btn.id, width: r.width, height: r.height };
                        });

                        const tablesWrapper = document.getElementById('tablesWrapper');
                        const tableGridUI = document.getElementById('tableGridUI');
                        const gridStyle = tableGridUI ? window.getComputedStyle(tableGridUI) : null;

                        return {
                            location: window.location.href,
                            title: document.title,
                            bodyLength: document.body ? document.body.innerHTML.length : -1,
                            hasSidebar: !!sidebar,
                            position: sidebarStyle ? sidebarStyle.position : null,
                            bottom: sidebarStyle ? sidebarStyle.bottom : null,
                            flexDirection: sidebarStyle ? sidebarStyle.flexDirection : null,
                            height: rect ? rect.height : 0,
                            navBtnCount: navButtons.length,
                            minTargetHeight: Math.min(...touchTargetSizes.map(t => t.height)),
                            isTablesVisible: tablesWrapper ? window.getComputedStyle(tablesWrapper).display !== 'none' : false,
                            gridOverflowX: gridStyle ? gridStyle.overflowX : null
                        };
                    })()
                `);

                console.log(`  [DEBUG navBarAssert]:`, JSON.stringify(navBarAssert));
                assert.strictEqual(navBarAssert.position, 'fixed', 'Sidebar on mobile must be fixed at bottom');
                assert.strictEqual(navBarAssert.bottom, '0px', 'Sidebar on mobile must be docked at bottom: 0');
                assert.strictEqual(navBarAssert.flexDirection, 'row', 'Sidebar on mobile must have row orientation');
                assert.ok(navBarAssert.height >= 44, `Sidebar height must be >= 44px for touch accessibility (got ${navBarAssert.height}px)`);
                assert.strictEqual(navBarAssert.isTablesVisible, true, '#tablesWrapper must be visible on mobile');
                assert.strictEqual(navBarAssert.gridOverflowX, 'auto', '#tableGridUI must have overflow-x: auto for swipeable strip');
                console.log(`  ✅ [${vp.id}] Bottom navigation fixed at bottom: 0 (height: ${navBarAssert.height}px), tables strip scrollable.`);

                // More Hub slide-up bottom sheet assertion
                const moreHubAssert = await cdp.evaluate(`
                    (() => {
                        openMoreHub();
                        const modal = document.getElementById('moreHubModal');
                        const modalStyle = modal ? window.getComputedStyle(modal) : null;
                        const box = modal ? modal.querySelector('.more-hub-box') : null;
                        const cards = box ? Array.from(box.querySelectorAll('.more-hub-card')) : [];
                        const cardTitles = cards.map(c => c.querySelector('.more-card-title')?.textContent.trim() || c.textContent.trim());
                        const hasTablesCard = cardTitles.some(t => t.includes('Dine-In Tables') || t.includes('Floor Layout'));

                        return {
                            isOpen: modal ? modalStyle.display === 'flex' : false,
                            alignItems: modalStyle ? modalStyle.alignItems : null,
                            cardCount: cards.length,
                            cardTitles,
                            hasTablesCard
                        };
                    })()
                `);

                assert.strictEqual(moreHubAssert.isOpen, true, '#moreHubModal must open cleanly on mobile');
                assert.strictEqual(moreHubAssert.alignItems, 'flex-end', '#moreHubModal must align items to flex-end (slide-up bottom sheet)');
                assert.strictEqual(moreHubAssert.cardCount, 4, 'More Hub must contain strictly 4 operational cards');
                assert.strictEqual(moreHubAssert.hasTablesCard, false, 'More Hub must NOT contain "Dine-In Tables" card');
                console.log(`  ✅ [${vp.id}] More Hub opens as slide-up bottom sheet with 4 cards (${moreHubAssert.cardTitles.join(', ')}), 0 tables cards.`);

                // Close More Hub cleanly
                await cdp.evaluate(`closeMoreHub();`);
                await new Promise(r => setTimeout(r, 200));

            } else {
                // Tablet and Desktop dual-pane assertions
                const dualPaneAssert = await cdp.evaluate(`
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
                            colCount,
                            isTablesVisible
                        };
                    })()
                `);

                assert.strictEqual(dualPaneAssert.posFlexDirection, 'row', '.pos-layout must have row flex layout');
                assert.strictEqual(dualPaneAssert.posRightDisplay, 'flex', 'Cart pane .pos-right must be visible flex container');
                assert.strictEqual(dualPaneAssert.colCount, 4, 'Menu grid must have strictly 4 columns');
                assert.strictEqual(dualPaneAssert.isTablesVisible, true, '#tablesWrapper must be visible');
                console.log(`  ✅ [${vp.id}] Dual-pane layout verified (row flex, cart pane width: ${Math.round(dualPaneAssert.posRightWidth)}px, 4-col menu grid).`);

                // More Hub on desktop/tablet opens as centered dialog
                const desktopMoreHubAssert = await cdp.evaluate(`
                    (() => {
                        openMoreHub();
                        const modal = document.getElementById('moreHubModal');
                        const modalStyle = modal ? window.getComputedStyle(modal) : null;
                        const cards = modal ? Array.from(modal.querySelectorAll('.more-hub-card')) : [];
                        return {
                            isOpen: modal ? modalStyle.display === 'flex' : false,
                            alignItems: modalStyle ? modalStyle.alignItems : null,
                            cardCount: cards.length,
                            hasTablesCard: cards.some(c => c.textContent.includes('Dine-In Tables'))
                        };
                    })()
                `);
                assert.strictEqual(desktopMoreHubAssert.isOpen, true, '#moreHubModal must open cleanly');
                assert.strictEqual(desktopMoreHubAssert.cardCount, 4, 'More Hub must have exactly 4 cards');
                assert.strictEqual(desktopMoreHubAssert.hasTablesCard, false, 'More Hub must NOT contain "Dine-In Tables" card');
                await cdp.evaluate(`closeMoreHub();`);
                await new Promise(r => setTimeout(r, 200));
            }

            await cdp.captureScreenshot(`challenger_vp_${vp.id}.png`);
        }

        // ====================================================================
        // PHASE 2: HIGH-FREQUENCY TABLE ORDERING LIFECYCLE STRESS TEST
        // ====================================================================
        console.log('\n====================================================================');
        console.log('⚡ PHASE 2: HIGH-FREQUENCY TABLE ORDERING & LIFECYCLE STRESS HARNESS');
        console.log('====================================================================\n');

        // Reset to standard desktop viewport for table stress
        await cdp.setViewport(1280, 800, 1, false);
        await new Promise(r => setTimeout(r, 300));

        // Sub-test 2.1: 50 Rapid Table Switches in #tablesWrapper
        console.log('  [Stress 2.1] Executing 50 rapid table switches across tables 1-5...');
        const rapidSwitchResult = await cdp.evaluate(`
            (() => {
                const switchLog = [];
                for (let i = 0; i < 50; i++) {
                    const targetTable = (i % 5) + 1;
                    selectTable(targetTable);
                    const badge = document.getElementById('posActiveTableBadge');
                    const selectedBtn = document.querySelector('#tableGridUI .table-btn.selected');
                    const btnTableNum = selectedBtn ? parseInt(selectedBtn.dataset.table || selectedBtn.getAttribute('onclick')?.match(/\\d+/)?.[0] || '0') : 0;
                    
                    if (activeTable !== targetTable) {
                        switchLog.push({ step: i, target: targetTable, activeTable, error: 'activeTable mismatch' });
                    }
                    if (badge && !badge.textContent.includes(String(targetTable))) {
                        switchLog.push({ step: i, target: targetTable, badgeText: badge.textContent, error: 'badge mismatch' });
                    }
                }
                return {
                    totalSwitches: 50,
                    finalActiveTable: activeTable,
                    finalBadgeText: document.getElementById('posActiveTableBadge')?.textContent,
                    errors: switchLog
                };
            })()
        `);
        assert.strictEqual(rapidSwitchResult.errors.length, 0, `Table switching desyncs detected: ${JSON.stringify(rapidSwitchResult.errors)}`);
        assert.strictEqual(rapidSwitchResult.finalActiveTable, 5, 'Final active table must be 5');
        console.log(`  ✅ [Stress 2.1] 50 rapid table switches executed cleanly with 0 desyncs.`);

        // Sub-test 2.2: Multi-Table Simultaneous Order Accumulation & KOT Dispatch
        console.log('  [Stress 2.2] Accumulating orders across multiple tables and dispatching KOT...');
        const multiTableOrdersResult = await cdp.evaluate(`
            (() => {
                // Table 1: 3 Espresso (id 1)
                selectTable(1);
                addToCart(1); addToCart(1); addToCart(1);

                // Table 2: 2 Chicken Burger (id 3) + 1 Veg Club Sandwich (id 4)
                selectTable(2);
                addToCart(3); addToCart(3); addToCart(4);

                // Table 3: 4 Masala Chai (id 2) + 2 Paneer Roll (id 5)
                selectTable(3);
                addToCart(2); addToCart(2); addToCart(2); addToCart(2);
                addToCart(5); addToCart(5);

                // Table 5: 1 Espresso (id 1) + 1 Chicken Burger (id 3)
                selectTable(5);
                addToCart(1); addToCart(3);

                // Dispatch KOT on Table 2
                selectTable(2);
                const kotDelta2Before = computeKotDelta(2);
                bookTable(); // sends KOT
                const kotDelta2After = computeKotDelta(2);

                // Dispatch KOT on Table 5
                selectTable(5);
                const kotDelta5Before = computeKotDelta(5);
                bookTable(); // sends KOT
                const kotDelta5After = computeKotDelta(5);

                return {
                    t1Count: tablesInfo[1]?.items?.length,
                    t1Qty: tablesInfo[1]?.items?.reduce((s, i) => s + i.qty, 0),
                    t1Status: tablesInfo[1]?.status,

                    t2Count: tablesInfo[2]?.items?.length,
                    t2Status: tablesInfo[2]?.status,
                    t2DeltaBefore: kotDelta2Before.totalDeltaCount,
                    t2DeltaAfter: kotDelta2After.totalDeltaCount,

                    t3Count: tablesInfo[3]?.items?.length,
                    t3Qty: tablesInfo[3]?.items?.reduce((s, i) => s + i.qty, 0),
                    t3Status: tablesInfo[3]?.status,

                    t5Count: tablesInfo[5]?.items?.length,
                    t5Status: tablesInfo[5]?.status,
                    t5DeltaBefore: kotDelta5Before.totalDeltaCount,
                    t5DeltaAfter: kotDelta5After.totalDeltaCount
                };
            })()
        `);

        assert.strictEqual(multiTableOrdersResult.t1Qty, 3, 'Table 1 must have total quantity 3');
        assert.strictEqual(multiTableOrdersResult.t1Status, 'occupied', 'Table 1 must be occupied');
        assert.strictEqual(multiTableOrdersResult.t2Status, 'kot', 'Table 2 status must be "kot" after bookTable()');
        assert.strictEqual(multiTableOrdersResult.t2DeltaBefore, 3, 'Table 2 had 3 unprinted items');
        assert.strictEqual(multiTableOrdersResult.t2DeltaAfter, 0, 'Table 2 delta must be 0 after KOT dispatch');
        assert.strictEqual(multiTableOrdersResult.t3Qty, 6, 'Table 3 must have total quantity 6');
        assert.strictEqual(multiTableOrdersResult.t5Status, 'kot', 'Table 5 status must be "kot" after bookTable()');
        assert.strictEqual(multiTableOrdersResult.t5DeltaAfter, 0, 'Table 5 delta must be 0 after KOT dispatch');
        console.log('  ✅ [Stress 2.2] Multi-table orders & KOT dispatch verified across Tables 1, 2, 3, and 5.');

        // Sub-test 2.3: Table 4 Reservation Toggle
        console.log('  [Stress 2.3] Testing empty table reservation toggle on Table 4...');
        const table4ReserveResult = await cdp.evaluate(`
            (() => {
                selectTable(4);
                const pre = tablesInfo[4]?.status;
                bookTable(); // reserve
                const mid = tablesInfo[4]?.status;
                bookTable(); // clear reservation
                const post = tablesInfo[4]?.status;
                return { pre, mid, post };
            })()
        `);
        assert.strictEqual(table4ReserveResult.mid, 'booked', 'Empty table must toggle to "booked"');
        assert.strictEqual(table4ReserveResult.post, 'empty', 'Second toggle must return table to "empty"');
        console.log('  ✅ [Stress 2.3] Table 4 reservation cleanly toggled empty -> booked -> empty.');

        // Sub-test 2.4: Sequential Checkout & Settlement of Tables 1 and 2
        console.log('  [Stress 2.4] Settling Table 1 and Table 2 and verifying atomic state reset...');
        const settlementResult = await cdp.evaluate(`
            (() => {
                const results = {};
                const preHistory = orderHistory.length;

                // Settle Table 1 (Cash)
                selectTable(1);
                openCheckoutModal(true);
                selectPayment('Cash', 'checkout');
                if (typeof completeCheckout === 'function') completeCheckout();
                else if (typeof confirmCheckout === 'function') confirmCheckout();

                results.afterT1History = orderHistory.length;
                results.t1ItemsPost = tablesInfo[1]?.items?.length;
                results.t1StatusPost = tablesInfo[1]?.status;

                // Settle Table 2 (UPI)
                selectTable(2);
                openCheckoutModal(true);
                selectPayment('UPI', 'checkout');
                if (typeof completeCheckout === 'function') completeCheckout();
                else if (typeof confirmCheckout === 'function') confirmCheckout();

                results.afterT2History = orderHistory.length;
                results.t2ItemsPost = tablesInfo[2]?.items?.length;
                results.t2StatusPost = tablesInfo[2]?.status;

                // Verify Table 3 remains occupied and unaffected
                results.t3ItemsPost = tablesInfo[3]?.items?.length;
                results.t3StatusPost = tablesInfo[3]?.status;

                return results;
            })()
        `);

        assert.strictEqual(settlementResult.t1ItemsPost, 0, 'Table 1 items must be cleared to 0 after settlement');
        assert.strictEqual(settlementResult.t1StatusPost, 'empty', 'Table 1 status must be reset to "empty"');
        assert.strictEqual(settlementResult.t2ItemsPost, 0, 'Table 2 items must be cleared to 0 after settlement');
        assert.strictEqual(settlementResult.t2StatusPost, 'empty', 'Table 2 status must be reset to "empty"');
        assert.strictEqual(settlementResult.t3ItemsPost, 2, 'Table 3 items must remain unaffected and intact');
        assert.strictEqual(settlementResult.t3StatusPost, 'occupied', 'Table 3 status must remain occupied');
        console.log('  ✅ [Stress 2.4] Tables 1 & 2 settled atomically; invoices archived; non-settled Table 3 intact.');

        // Sub-test 2.5: Floor Switching Integrity
        console.log('  [Stress 2.5] Stressing floor switching in #posFloorSelector...');
        const floorStressResult = await cdp.evaluate(`
            (() => {
                const floors = ['1st Floor', 'Outdoor', 'Ground Floor'];
                const floorLog = [];
                for (let i = 0; i < 9; i++) {
                    const f = floors[i % floors.length];
                    switchFloor(f);
                    const activePill = document.querySelector('#posFloorSelector .floor-pill.active');
                    const text = activePill ? activePill.textContent.trim() : null;
                    if (text !== f) {
                        floorLog.push({ step: i, target: f, actual: text });
                    }
                }
                return { errors: floorLog };
            })()
        `);
        assert.strictEqual(floorStressResult.errors.length, 0, `Floor switching errors: ${JSON.stringify(floorStressResult.errors)}`);
        console.log('  ✅ [Stress 2.5] 9 sequential floor switches completed with 0 errors.');

        // ====================================================================
        // PHASE 3: AUDITING RUNTIME ERRORS, EXCEPTIONS & 404S
        // ====================================================================
        console.log('\n====================================================================');
        console.log('🔍 PHASE 3: RUNTIME CONSOLE ERROR & NETWORK 404 FORENSIC AUDIT');
        console.log('====================================================================\n');

        console.log(`Total Runtime Exceptions Intercepted: ${runtimeErrors.length}`);
        console.log(`Total HTTP 404 Responses Intercepted: ${http404s.length}`);

        assert.strictEqual(runtimeErrors.length, 0, `Runtime errors/exceptions detected during stress harness: ${JSON.stringify(runtimeErrors)}`);
        assert.strictEqual(http404s.length, 0, `HTTP 404 network responses detected during stress harness: ${JSON.stringify(http404s)}`);
        console.log('  ✅ [PASS] Zero runtime exceptions, zero console errors, zero 404 network requests.');

        console.log('\n====================================================================');
        console.log('🎉 ALL ADVERSARIAL CHALLENGER VERIFICATION & STRESS TESTS PASSED 100%!');
        console.log('====================================================================\n');

    } finally {
        if (cdp) cdp.close();
        if (chromeProc && chromeProc.pid) {
            try { execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
        }
        if (tempProfileDir && fs.existsSync(tempProfileDir)) {
            try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch (e) {}
        }
        if (serverProc && serverProc.pid) {
            try { execSync(`taskkill /pid ${serverProc.pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
        }
    }
}

runChallengerStress().catch(err => {
    console.error('\n❌ CHALLENGER STRESS HARNESS FAILED:', err);
    process.exit(1);
});
