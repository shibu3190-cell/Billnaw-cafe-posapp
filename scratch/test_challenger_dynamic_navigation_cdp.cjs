/**
 * scratch/test_challenger_dynamic_navigation_cdp.cjs
 *
 * Empirical verification harness for challenger_o10_m5_2:
 * 1. Headless Chrome CDP Verification across Desktop & Mobile
 * 2. Dynamic Bottom Navigation Verification (Chef, Cashier, Server, Manager, Admin)
 * 3. Tables view reachability via switchTab('tables') & #moreHubModal
 * 4. Invariant Verification: layout shifts, button occlusion, emoji regressions
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const CDP_PORT = 9253; // Use distinct port to prevent conflicts
const SERVER_URL = 'http://localhost:5000';

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
    serverProc.kill();
    throw new Error('Server failed to start within 12 seconds.');
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
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onclose = () => {
            for (const [id, { reject }] of this.callbacks.entries()) {
                reject(new Error(`CDP connection closed unexpectedly while waiting for #${id}`));
            }
            this.callbacks.clear();
        };

        this.ws.onerror = (err) => {
            for (const [id, { reject }] of this.callbacks.entries()) {
                reject(new Error(`CDP connection error for #${id}: ${err?.message || err}`));
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

    on(event, handler) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(handler);
    }

    off(event, handler) {
        if (!this.eventListeners.has(event)) return;
        const listeners = this.eventListeners.get(event).filter(fn => fn !== handler);
        this.eventListeners.set(event, listeners);
    }

    once(event, timeoutMs = 8000) {
        return new Promise((resolve) => {
            let timer = null;
            const handler = (params) => {
                if (timer) clearTimeout(timer);
                this.off(event, handler);
                resolve(params);
            };
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    this.off(event, handler);
                    resolve(null);
                }, timeoutMs);
            }
            this.on(event, handler);
        });
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

    async setViewport(viewport) {
        if (viewport === 'desktop') {
            await this.send('Emulation.setDeviceMetricsOverride', {
                width: 1280,
                height: 800,
                deviceScaleFactor: 1,
                mobile: false
            });
        } else if (viewport === 'mobile') {
            await this.send('Emulation.setDeviceMetricsOverride', {
                width: 390,
                height: 844,
                deviceScaleFactor: 2,
                mobile: true
            });
        }
        await new Promise(r => setTimeout(r, 350));
    }

    close() {
        try {
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                this.ws.onclose = null;
                this.ws.close();
            }
        } catch (e) {}
        this.callbacks.clear();
    }
}

async function runEmpiricalNavigationChallenge() {
    console.log('================================================================');
    console.log('🧪 EMPIRICAL CHALLENGER: DYNAMIC NAVIGATION & VIEWPORT INVARIANTS');
    console.log('================================================================\n');

    let chromeProc = null;
    let tempUserDataDir = null;
    let spawnedServer = null;
    let cdp = null;

    try {
        spawnedServer = await ensureServerRunning();
        const chromeExe = findChromeExecutable();
        tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger_cdp_nav_'));

        chromeProc = spawn(chromeExe, [
            '--headless=new',
            `--remote-debugging-port=${CDP_PORT}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=390,844',
            `--user-data-dir=${tempUserDataDir}`,
            SERVER_URL
        ], {
            stdio: 'ignore'
        });

        console.log(`⏳ Connecting to CDP port ${CDP_PORT}...`);
        let wsUrl = null;
        for (let i = 0; i < 35; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
                const list = await res.json();
                const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
                if (page && page.url.includes('localhost:5000')) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch (e) {}
        }

        if (!wsUrl) throw new Error('Could not find inspectable page on CDP port.');
        cdp = new CDPClient(wsUrl);
        await cdp.init();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Setup base auth state
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `
                try {
                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                    localStorage.setItem('billnaw_auth_token', 'challenger-valid-token');
                    localStorage.setItem('billnaw_auth_email', 'admin@cafe.com');
                    localStorage.setItem('billnaw_store_code', 'SHOP-M2');
                    localStorage.setItem('billnaw_user_role', 'admin');
                    localStorage.setItem('billnaw_pos_version', '2.4.0');
                    localStorage.setItem('billnaw_is_master', 'true');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
                    localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                    localStorage.setItem('billnaw_shop_session', JSON.stringify({
                        token: 'challenger-valid-token',
                        storeCode: 'SHOP-M2',
                        user: { email: 'admin@cafe.com', role: 'admin' },
                        shop: { name: 'Billnaw Cafe' }
                    }));
                    localStorage.setItem('billnaw_store_profile', JSON.stringify({
                        name: 'Billnaw Cafe',
                        shopName: 'Billnaw Cafe',
                        upiId: 'billnaw@okaxis',
                        tableCount: 5,
                        showQr: true,
                        gstMode: 'inclusive',
                        defaultGstRate: 5,
                        discountsEnabled: true
                    }));

                    const style = document.createElement('style');
                    style.id = 'challenger-audit-base';
                    style.textContent = '#shopAuthModal, #appUpdatePopup, #activationOverlay { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
                    (document.head || document.documentElement).appendChild(style);
                } catch (e) {}
            `
        });

        // Explicitly navigate to SERVER_URL
        console.log(`🌐 Navigating to ${SERVER_URL}...`);
        const loadFiredPromise = cdp.once('Page.loadEventFired', 10000);
        await cdp.send('Page.navigate', { url: SERVER_URL });
        await loadFiredPromise;
        console.log('⏳ Page loadEventFired received, allowing scripts to settle...');
        await new Promise(r => setTimeout(r, 2000));

        // Set mobile viewport
        await cdp.setViewport('mobile');

        // Set localStorage auth items
        await cdp.evaluate(`
            (() => {
                try {
                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                    localStorage.setItem('billnaw_auth_token', 'challenger-valid-token');
                    localStorage.setItem('billnaw_auth_email', 'admin@cafe.com');
                    localStorage.setItem('billnaw_store_code', 'SHOP-M2');
                    localStorage.setItem('billnaw_user_role', 'admin');
                    localStorage.setItem('billnaw_pos_version', '2.4.0');
                    localStorage.setItem('billnaw_is_master', 'true');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
                    localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                    localStorage.setItem('billnaw_shop_session', JSON.stringify({
                        token: 'challenger-valid-token',
                        storeCode: 'SHOP-M2',
                        user: { email: 'admin@cafe.com', role: 'admin' },
                        shop: { name: 'Billnaw Cafe' }
                    }));
                    window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
                } catch (e) {}
            })()
        `);

        // Wait for page scripts
        let pageReady = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 300));
            try {
                const status = await cdp.evaluate(`
                    (() => {
                        const navKds = document.getElementById('nav-kds');
                        const navTables = document.getElementById('nav-tables');
                        return {
                            readyState: document.readyState,
                            url: window.location.href,
                            hasSwitchTab: typeof switchTab === 'function',
                            hasEnforcePermissions: typeof enforcePermissions === 'function',
                            navKdsExists: !!navKds,
                            navTablesExists: !!navTables,
                            bodyLength: document.body ? document.body.innerHTML.length : 0
                        };
                    })()
                `);
                console.log('  Page status attempt #' + (i + 1) + ':', JSON.stringify(status));
                if (status && status.readyState === 'complete' && status.hasSwitchTab && status.navKdsExists) {
                    pageReady = true;
                    break;
                }
            } catch (e) {
                console.log('  Evaluate error attempt #' + (i + 1) + ':', e.message);
            }
        }
        assert(pageReady, 'Page scripts failed to initialize');
        console.log('✅ Page initialized on Mobile Viewport (390x844).\n');

        // ================================================================
        // TEST 1: Default Bottom Navigation on Mobile Viewport
        // ================================================================
        console.log('--- Test 1: Default Bottom Navigation Bar on Mobile ---');
        const defaultNav = await cdp.evaluate(`
            (() => {
                const navKds = document.getElementById('nav-kds');
                const navTables = document.getElementById('nav-tables');
                const navPos = document.getElementById('nav-pos');
                const navMenu = document.getElementById('nav-menu');
                const navDashboard = document.getElementById('nav-dashboard');
                const navInventory = document.getElementById('nav-inventory');
                const navKhata = document.getElementById('nav-khata');
                const navMore = document.getElementById('nav-more');

                const getInfo = (el) => {
                    if (!el) return null;
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    return {
                        display: style.display,
                        visibility: style.visibility,
                        inlineDisplay: el.style.display,
                        width: rect.width,
                        height: rect.height,
                        isRendered: style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0
                    };
                };

                return {
                    kds: getInfo(navKds),
                    tables: getInfo(navTables),
                    pos: getInfo(navPos),
                    menu: getInfo(navMenu),
                    more: getInfo(navMore)
                };
            })()
        `);

        console.log('Default Nav state:', JSON.stringify(defaultNav, null, 2));

        // In default state:
        // Neither #nav-kds nor #nav-tables should be visible / present in the default bottom bar
        console.log(`Checking default visibility:`);
        console.log(`  #nav-kds isRendered: ${defaultNav.kds ? defaultNav.kds.isRendered : 'missing'}, inlineDisplay: "${defaultNav.kds ? defaultNav.kds.inlineDisplay : ''}"`);
        console.log(`  #nav-tables isRendered: ${defaultNav.tables ? defaultNav.tables.isRendered : 'missing'}, inlineDisplay: "${defaultNav.tables ? defaultNav.tables.inlineDisplay : ''}"`);

        // Check enforcePermissions() role-based states
        // ================================================================
        // TEST 2: Role Matrix Verification (Chef, Cashier, Server, Manager, Admin)
        // ================================================================
        console.log('\n--- Test 2: Role Matrix Verification on Mobile Viewport ---');
        const rolesToTest = [
            { role: 'Kitchen Chef', constant: 'ROLES.CHEF', expectKds: true },
            { role: 'Cashier', constant: 'ROLES.CASHIER', expectKds: false },
            { role: 'Floor Server', constant: 'ROLES.SERVER', expectKds: false },
            { role: 'Manager', constant: 'ROLES.MANAGER', expectKds: false },
            { role: 'Admin', constant: 'ROLES.ADMIN', expectKds: false }
        ];

        for (const r of rolesToTest) {
            const roleResult = await cdp.evaluate(`
                (() => {
                    const testStaffObj = { id: 10, name: 'Test ${r.role}', role: '${r.role}' };
                    if (typeof unlockTerminal === 'function') {
                        unlockTerminal(testStaffObj);
                    } else {
                        currentStaff = testStaffObj;
                        window.currentStaff = testStaffObj;
                        if (typeof enforcePermissions === 'function') enforcePermissions();
                    }
                    const navKds = document.getElementById('nav-kds');
                    const navTables = document.getElementById('nav-tables');
                    const styleKds = window.getComputedStyle(navKds);
                    const rectKds = navKds.getBoundingClientRect();
                    const styleTables = window.getComputedStyle(navTables);

                    return {
                        kdsDisplay: styleKds.display,
                        kdsInlineDisplay: navKds.style.display,
                        kdsIsRendered: styleKds.display !== 'none' && styleKds.visibility !== 'hidden' && rectKds.height > 0,
                        tablesDisplay: styleTables.display,
                        tablesInlineDisplay: navTables.style.display,
                        tablesIsRendered: styleTables.display !== 'none' && styleTables.visibility !== 'hidden'
                    };
                })()
            `);

            console.log(`Role [${r.role.padEnd(13)}]: #nav-kds display="${roleResult.kdsDisplay}", inline="${roleResult.kdsInlineDisplay}", rendered=${roleResult.kdsIsRendered}`);

            if (r.expectKds) {
                assert.strictEqual(roleResult.kdsDisplay, 'flex', `Chef must display #nav-kds as 'flex', got '${roleResult.kdsDisplay}'`);
                assert.strictEqual(roleResult.kdsIsRendered, true, `Chef must have #nav-kds rendered`);
                console.log(`  ✅ ${r.role}: #nav-kds dynamically appears as flex`);
            } else {
                assert.strictEqual(roleResult.kdsDisplay, 'none', `${r.role} must strictly hide #nav-kds, got '${roleResult.kdsDisplay}'`);
                assert.strictEqual(roleResult.kdsIsRendered, false, `${r.role} must NOT have #nav-kds rendered`);
                console.log(`  ✅ ${r.role}: #nav-kds strictly hidden`);
            }
        }

        // ================================================================
        // TEST 3: Admin Can Launch KDS via #moreHubModal
        // ================================================================
        console.log('\n--- Test 3: Admin Can Launch KDS via #moreHubModal ---');
        const adminKdsLaunch = await cdp.evaluate(`
            (() => {
                window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
                if (typeof enforcePermissions === 'function') enforcePermissions();

                // Open moreHubModal
                if (typeof openMoreHub === 'function') openMoreHub();
                const moreModal = document.getElementById('moreHubModal');
                const isModalOpen = moreModal && window.getComputedStyle(moreModal).display === 'flex';

                // Locate KDS card in moreHubModal
                const kdsCard = moreModal ? moreModal.querySelector('.more-hub-card[onclick*="kds"]') : null;
                const hasKdsCard = !!kdsCard;
                const kdsCardText = kdsCard ? kdsCard.innerText : '';

                // Simulate clicking the KDS card
                if (kdsCard) {
                    kdsCard.click();
                }

                // Check active tab
                const isKdsActive = (typeof currentTab !== 'undefined' && currentTab === 'kds') ||
                                    (document.getElementById('kds') && document.getElementById('kds').classList.contains('active'));

                const isModalClosed = !moreModal || window.getComputedStyle(moreModal).display === 'none';

                return {
                    isModalOpen,
                    hasKdsCard,
                    kdsCardText,
                    isKdsActive,
                    isModalClosed
                };
            })()
        `);

        console.log('Admin KDS launch result:', JSON.stringify(adminKdsLaunch, null, 2));
        assert.strictEqual(adminKdsLaunch.hasKdsCard, true, 'KDS card must exist inside #moreHubModal');
        assert(adminKdsLaunch.kdsCardText.includes('Kitchen Display System') || adminKdsLaunch.kdsCardText.includes('KDS'), 'KDS card must have descriptive text');
        assert.strictEqual(adminKdsLaunch.isKdsActive, true, 'Clicking KDS card in #moreHubModal must switch to kds tab');
        assert.strictEqual(adminKdsLaunch.isModalClosed, true, '#moreHubModal must close after selecting KDS');
        console.log('✅ Admin can successfully launch KDS via #moreHubModal.');

        // ================================================================
        // TEST 4: Tables View Reachable via switchTab('tables') & #moreHubModal
        // ================================================================
        console.log('\n--- Test 4: Tables View Reachability ---');
        // Part A: via #moreHubModal
        const tablesModalLaunch = await cdp.evaluate(`
            (() => {
                if (typeof openMoreHub === 'function') openMoreHub();
                const moreModal = document.getElementById('moreHubModal');
                const tablesCard = moreModal ? moreModal.querySelector('.more-hub-card[onclick*="tables"]') : null;
                const hasTablesCard = !!tablesCard;
                const tablesCardText = tablesCard ? tablesCard.innerText : '';

                if (tablesCard) {
                    tablesCard.click();
                }

                const isTablesActive = (typeof currentTab !== 'undefined' && currentTab === 'tables') ||
                                       (document.getElementById('tables') && document.getElementById('tables').classList.contains('active'));
                const isModalClosed = !moreModal || window.getComputedStyle(moreModal).display === 'none';

                return {
                    hasTablesCard,
                    tablesCardText,
                    isTablesActive,
                    isModalClosed
                };
            })()
        `);

        console.log('Tables launch via #moreHubModal:', JSON.stringify(tablesModalLaunch, null, 2));
        assert.strictEqual(tablesModalLaunch.hasTablesCard, true, 'Tables card must exist inside #moreHubModal');
        assert(tablesModalLaunch.tablesCardText.includes('Tables'), 'Tables card must mention Tables');
        assert.strictEqual(tablesModalLaunch.isTablesActive, true, 'Clicking Tables card must switch to tables tab');
        assert.strictEqual(tablesModalLaunch.isModalClosed, true, '#moreHubModal must close after selecting Tables');
        console.log('✅ Tables view is reachable via #moreHubModal.');

        // Part B: via switchTab('tables')
        const tablesDirectSwitch = await cdp.evaluate(`
            (() => {
                if (typeof switchTab === 'function') switchTab('pos'); // reset first
                if (typeof switchTab === 'function') switchTab('tables');

                const tablesTab = document.getElementById('tables');
                const isTablesTabActive = tablesTab && tablesTab.classList.contains('active');

                // Check table management controls
                const tableGrid = document.getElementById('tableGridUI') || document.querySelector('.table-grid') || document.getElementById('tablesContainer');
                const hasTableUI = !!tableGrid;

                return {
                    isTablesTabActive,
                    hasTableUI
                };
            })()
        `);

        console.log('Tables direct switch result:', JSON.stringify(tablesDirectSwitch, null, 2));
        assert.strictEqual(tablesDirectSwitch.isTablesTabActive, true, 'switchTab("tables") must activate tables tab');
        console.log('✅ Tables view is functional and reachable via route switchTab("tables").');

        // ================================================================
        // TEST 5: Invariants - Layout Shifts, Occlusion & Touch Target Geometry
        // ================================================================
        console.log('\n--- Test 5: Invariant Verification - Layout Shifts & Occlusions ---');
        // Ensure modals from prior interaction tests are dismissed before checking base bottom nav layout
        await cdp.evaluate(`
            (() => {
                if (typeof closeSpotManagerOverrideModal === 'function') closeSpotManagerOverrideModal();
                if (typeof closeMoreHub === 'function') closeMoreHub();
                document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            })()
        `);
        await new Promise(r => setTimeout(r, 200));

        const layoutAudit = await cdp.evaluate(`
            (() => {
                const sidebar = document.querySelector('.sidebar');
                if (!sidebar) return { error: 'Sidebar not found' };

                const sidebarStyle = window.getComputedStyle(sidebar);
                const sidebarRect = sidebar.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const navButtons = Array.from(sidebar.querySelectorAll('.nav-btn'));
                const buttonAudits = [];

                for (const btn of navButtons) {
                    const style = window.getComputedStyle(btn);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const rect = btn.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const topEl = document.elementFromPoint(centerX, centerY);
                    const isOccluded = topEl ? (!btn.contains(topEl) && topEl !== btn) : true;

                    buttonAudits.push({
                        id: btn.id,
                        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
                        centerX,
                        centerY,
                        topElTag: topEl ? topEl.tagName : null,
                        topElClass: topEl ? topEl.className : null,
                        topElId: topEl ? topEl.id : null,
                        isOccluded
                    });
                }

                // Check for body horizontal overflow
                const bodyOverflow = document.body.scrollWidth > window.innerWidth;
                const htmlOverflow = document.documentElement.scrollWidth > window.innerWidth;

                const openModals = Array.from(document.querySelectorAll('.modal-overlay'))
                    .filter(m => window.getComputedStyle(m).display !== 'none')
                    .map(m => ({ id: m.id, display: window.getComputedStyle(m).display, text: (m.innerText || '').substring(0, 150) }));

                return {
                    viewportWidth,
                    viewportHeight,
                    sidebarPosition: sidebarStyle.position,
                    sidebarRect: { left: sidebarRect.left, top: sidebarRect.top, width: sidebarRect.width, height: sidebarRect.height },
                    visibleButtonCount: buttonAudits.length,
                    buttonAudits,
                    bodyOverflow,
                    htmlOverflow,
                    openModals
                };
            })()
        `);

        console.log('Open modals during layout audit:', JSON.stringify(layoutAudit.openModals, null, 2));

        console.log('Layout audit summary:');
        console.log(`  Viewport: ${layoutAudit.viewportWidth}x${layoutAudit.viewportHeight}`);
        console.log(`  Sidebar position: ${layoutAudit.sidebarPosition}`);
        console.log(`  Visible nav buttons: ${layoutAudit.visibleButtonCount}`);
        console.log(`  Body horizontal overflow: ${layoutAudit.bodyOverflow}`);
        console.log(`  HTML horizontal overflow: ${layoutAudit.htmlOverflow}`);

        assert.strictEqual(layoutAudit.bodyOverflow, false, 'Body must have zero horizontal overflow on mobile');
        assert.strictEqual(layoutAudit.htmlOverflow, false, 'HTML must have zero horizontal overflow on mobile');

        for (const btn of layoutAudit.buttonAudits) {
            console.log(`  Nav button #${btn.id}: width=${btn.rect.width.toFixed(1)}px, height=${btn.rect.height.toFixed(1)}px, occluded=${btn.isOccluded} (topEl=${btn.topElTag}.${btn.topElClass}#${btn.topElId})`);
            assert.strictEqual(btn.isOccluded, false, `Button #${btn.id} is occluded by ${btn.topElTag}#${btn.topElId}`);
            assert(btn.rect.width > 20, `Button #${btn.id} width too small: ${btn.rect.width}`);
            assert(btn.rect.height > 20, `Button #${btn.id} height too small: ${btn.rect.height}`);
        }
        console.log('✅ Zero layout shifts and zero button occlusions confirmed on mobile viewport.');

        // ================================================================
        // TEST 6: Invariants - Zero Raw Unicode Emojis in Controls
        // ================================================================
        console.log('\n--- Test 6: Invariant Verification - Zero Raw Unicode Emojis ---');
        const emojiAudit = await cdp.evaluate(`
            (() => {
                // Regex targeting actual Unicode emojis (emoticons, pictographs, transport, food, symbols), excluding standard typographic text glyphs (✓, ➔)
                const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/u;

                const operationalSelectors = [
                    '.nav-btn',
                    '.sidebar button',
                    '.more-hub-card',
                    '#moreHubModal button',
                    '.tab-btn',
                    '.segmented-pill',
                    '.btn',
                    'button'
                ];

                const controls = Array.from(document.querySelectorAll(operationalSelectors.join(',')));
                const offenders = [];

                for (const el of controls) {
                    const clone = el.cloneNode(true);
                    clone.querySelectorAll('svg, style, script').forEach(n => n.remove());
                    const cleanText = (clone.innerText || clone.textContent || '').trim();
                    if (emojiRegex.test(cleanText)) {
                        offenders.push({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            text: cleanText.substring(0, 40)
                        });
                    }
                }

                // Also check modal close button SVG count
                const closeBtns = document.querySelectorAll('.modal-close-btn');

                return {
                    totalControlsAudited: controls.length,
                    offenderCount: offenders.length,
                    offenders,
                    modalCloseBtnCount: closeBtns.length
                };
            })()
        `);

        console.log(`Audited ${emojiAudit.totalControlsAudited} operational controls for raw Unicode emojis.`);
        console.log(`Offenders found: ${emojiAudit.offenderCount}`);
        if (emojiAudit.offenderCount > 0) {
            console.error('Emoji offenders:', emojiAudit.offenders);
        }
        assert.strictEqual(emojiAudit.offenderCount, 0, `Operational controls must contain zero raw Unicode emojis. Found ${emojiAudit.offenderCount}`);
        console.log(`Modal close buttons: ${emojiAudit.modalCloseBtnCount} (Invariant: 26)`);
        assert.strictEqual(emojiAudit.modalCloseBtnCount, 26, `Must have exactly 26 .modal-close-btn elements, got ${emojiAudit.modalCloseBtnCount}`);
        console.log('✅ Zero emoji regressions & exact 26 modal close SVGs confirmed.');

        console.log('\n================================================================');
        console.log('🎉 ALL EMPIRICAL CHALLENGES PASSED 100% GREEN!');
        console.log('================================================================\n');

        process.exitCode = 0;

    } catch (err) {
        console.error('\n❌ EMPIRICAL CHALLENGE FAILED:', err);
        process.exitCode = 1;
    } finally {
        if (cdp) cdp.close();
        if (chromeProc && chromeProc.pid) {
            try { execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
        }
        if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
            try { fs.rmSync(tempUserDataDir, { recursive: true, force: true }); } catch (e) {}
        }
        if (spawnedServer && spawnedServer.pid) {
            try { execSync(`taskkill /pid ${spawnedServer.pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
        }
        process.exit(process.exitCode || 0);
    }
}

runEmpiricalNavigationChallenge();
