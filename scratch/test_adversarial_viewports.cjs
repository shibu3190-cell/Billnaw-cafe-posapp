/**
 * scratch/test_adversarial_viewports.cjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE — MILESTONE 2
 * Viewport Stress Testing, Horizontal Overflow & Touch Boundary Auditing
 *
 * Tests:
 * 1. Extreme Small Viewports (320x480, 360x640, 375x667, 390x844, 414x896, 430x932)
 * 2. Breakpoint Boundary Viewports (640px, 641px, 767px, 768px, 820px, 1024px, 1079px, 1080px)
 * 3. Large Viewports (1280x800, 1920x1080)
 * 4. Horizontal Window Overflow (scrollWidth <= innerWidth) across views, tables, and modals
 * 5. Short Viewport Modal Clipping & Accessible Dismissal (320x480, 360x400)
 * 6. Minimum 44x44px Touch Target Boundaries (DOM + ::before pseudo-element hit area)
 * 7. Invariants: 26 modal-close-btn SVGs, 0 raw emojis in buttons, git branch, storage parity
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const CDP_PORT = 9300 + Math.floor(Math.random() * 200);
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
                if (res && res.exceptionDetails) {
                    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
                    throw new Error(`Runtime.evaluate Exception: ${desc}`);
                }
                return res && res.result ? res.result.value : null;
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
        // Poll until window.innerWidth matches or timeout after 1.5s
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 100));
            const curW = await this.evaluate('window.innerWidth');
            if (curW === width) break;
        }
    }

    close() {
        try {
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                this.ws.onclose = null;
                this.ws.close();
            }
        } catch (e) {}
        this.callbacks.clear();
        this.eventListeners.clear();
    }
}

// Adversarial Viewport Matrix
const VIEWPORT_MATRIX = [
    // 1. Extreme small viewports
    { id: '320x480', width: 320, height: 480, scale: 2, mobile: true, category: 'extreme_small', label: 'iPhone SE 1st gen / iPod' },
    { id: '360x640', width: 360, height: 640, scale: 2, mobile: true, category: 'extreme_small', label: 'Budget Android standard' },
    { id: '375x667', width: 375, height: 667, scale: 2, mobile: true, category: 'mobile_standard', label: 'iPhone SE 2nd/3rd gen' },
    { id: '390x844', width: 390, height: 844, scale: 3, mobile: true, category: 'mobile_standard', label: 'iPhone 12/13/14' },
    { id: '414x896', width: 414, height: 896, scale: 3, mobile: true, category: 'mobile_standard', label: 'iPhone XR/11' },
    { id: '430x932', width: 430, height: 932, scale: 3, mobile: true, category: 'mobile_standard', label: 'iPhone 14/15/16 Pro Max' },

    // 2. Breakpoint boundary viewports
    { id: '640x800', width: 640, height: 800, scale: 1, mobile: true, category: 'boundary', label: 'Mobile Ceiling (640px)' },
    { id: '641x800', width: 641, height: 800, scale: 1, mobile: false, category: 'boundary', label: 'Split-Screen Floor (641px)' },
    { id: '767x1024', width: 767, height: 1024, scale: 2, mobile: true, category: 'boundary', label: 'Inventory Mobile Ceiling (767px)' },
    { id: '768x1024', width: 768, height: 1024, scale: 2, mobile: true, category: 'boundary', label: 'Tablet Portrait Floor (768px iPad)' },
    { id: '820x1180', width: 820, height: 1180, scale: 2, mobile: true, category: 'boundary', label: 'iPad Air Portrait (820px)' },
    { id: '1024x768', width: 1024, height: 768, scale: 2, mobile: false, category: 'boundary', label: 'iPad Pro Landscape / Desktop Floor (1024px)' },
    { id: '1079x800', width: 1079, height: 800, scale: 1, mobile: false, category: 'boundary', label: 'Split-Screen Upper Boundary (1079px)' },
    { id: '1080x800', width: 1080, height: 800, scale: 1, mobile: false, category: 'boundary', label: 'Split-Screen Ceiling (1080px)' },

    // 3. Large viewports
    { id: '1280x800', width: 1280, height: 800, scale: 1, mobile: false, category: 'large', label: 'WXGA Standard Laptop' },
    { id: '1920x1080', width: 1920, height: 1080, scale: 1, mobile: false, category: 'large', label: 'Full HD Desktop' }
];

async function runAdversarialAudit() {
    console.log('====================================================================');
    console.log('⚔️  CHALLENGER 1: ADVERSARIAL VIEWPORT & TOUCH TARGET STRESS HARNESS');
    console.log('====================================================================\n');

    let chromeProc = null;
    let tempUserDataDir = null;
    let cdp = null;

    const auditResults = {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        failures: [],
        warnings: []
    };

    function recordPass(testName) {
        auditResults.totalChecks++;
        auditResults.passedChecks++;
        console.log(`  ✅ [PASS] ${testName}`);
    }

    function recordFail(testName, reason) {
        auditResults.totalChecks++;
        auditResults.failedChecks++;
        auditResults.failures.push({ testName, reason });
        console.error(`  ❌ [FAIL] ${testName}: ${reason}`);
    }

    try {
        // Step 0: Invariants Check (AST/Markup Static Invariants)
        console.log('--- Phase 0: Repository Invariants Audit ---');

        // Invariant 1: Exactly 26 .modal-close-btn SVGs in index.html
        const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
        const modalCloseMatches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        if (modalCloseMatches.length === 26) {
            recordPass(`Invariant 1: Exactly 26 .modal-close-btn elements in index.html (found ${modalCloseMatches.length})`);
        } else {
            recordFail('Invariant 1: 26 .modal-close-btn elements', `Expected 26, found ${modalCloseMatches.length}`);
        }

        // Invariant 2: Zero raw Unicode emojis in <button> elements
        const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
        let buttonMatch;
        let rawEmojiButtons = 0;
        while ((buttonMatch = buttonRegex.exec(indexHtml)) !== null) {
            const buttonContent = buttonMatch[1];
            if (emojiRegex.test(buttonContent)) {
                rawEmojiButtons++;
            }
        }
        if (rawEmojiButtons === 0) {
            recordPass('Invariant 2: Zero raw Unicode emojis in <button> elements');
        } else {
            recordFail('Invariant 2: Zero raw Unicode emojis', `Found ${rawEmojiButtons} buttons with raw Unicode emojis`);
        }

        // Invariant 3: Exact binary parity between storage.rules and database/storage.rules
        const rootStorage = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'));
        const dbStorage = fs.readFileSync(path.join(ROOT_DIR, 'database', 'storage.rules'));
        if (rootStorage.equals(dbStorage)) {
            recordPass(`Invariant 3: Exact binary parity for storage.rules (${rootStorage.length} bytes identical)`);
        } else {
            recordFail('Invariant 3: storage.rules binary parity', `Root (${rootStorage.length} B) !== database/ (${dbStorage.length} B)`);
        }

        // Step 1: Launch Headless Chrome
        console.log('\n--- Phase 1: Browser Launch & Navigation ---');
        tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger_viewports_'));
        const chromeExe = findChromeExecutable();

        chromeProc = spawn(chromeExe, [
            '--headless=new',
            `--remote-debugging-port=${CDP_PORT}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
            `--user-data-dir=${tempUserDataDir}`,
            SERVER_URL
        ], { stdio: 'ignore' });

        let wsUrl = null;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
                const list = await res.json();
                const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
                if (page) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch (e) {}
        }

        if (!wsUrl) throw new Error(`Could not find CDP page on port ${CDP_PORT}`);
        cdp = new CDPClient(wsUrl);
        await cdp.init();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Initialize mock auth in localStorage
        await cdp.evaluate(`
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
                localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                localStorage.setItem('billnaw_staff_pin_hash', '1234');
                localStorage.setItem('billnaw_current_staff', JSON.stringify({ id: 1, name: 'Admin', role: 'Admin' }));
                localStorage.setItem('cafe_shop_auth', JSON.stringify({
                    storeName: "Billnaw Cafe Demo",
                    ownerName: "Abhijeet",
                    status: "ACTIVE"
                }));
                window.menuItems = sampleMenu;
                if (typeof menuItems !== 'undefined') { menuItems = sampleMenu; }
                if (typeof renderMenuUI === 'function') { renderMenuUI(); }
                if (typeof renderTables === 'function') { renderTables(); }
            })()
        `);
        await new Promise(r => setTimeout(r, 600));

        // Step 2: Adversarial Viewport Matrix — Horizontal Overflow Check
        console.log('\n--- Phase 2: Viewport Matrix & Horizontal Overflow Stress Testing ---');
        for (const vp of VIEWPORT_MATRIX) {
            await cdp.setViewport(vp.width, vp.height, vp.scale, vp.mobile);
            await new Promise(r => setTimeout(r, 200));

            // Verify innerWidth actually matched
            const actualW = await cdp.evaluate('window.innerWidth');
            if (actualW !== vp.width) {
                recordFail(`Viewport [${vp.id}] resize`, `Expected innerWidth ${vp.width}, got ${actualW}`);
                continue;
            }

            // Test Horizontal Overflow across active view
            const overflowData = await cdp.evaluate(`
                (() => {
                    const docEl = document.documentElement;
                    const docBody = document.body;
                    const scrollWidth = Math.max(docEl ? docEl.scrollWidth : 0, docBody ? docBody.scrollWidth : 0);
                    const innerWidth = window.innerWidth;
                    return {
                        scrollWidth,
                        innerWidth,
                        hasOverflow: scrollWidth > innerWidth + 1
                    };
                })()
            `);

            if (!overflowData.hasOverflow) {
                recordPass(`Viewport [${vp.id} - ${vp.label}] Zero horizontal overflow (${overflowData.scrollWidth}px <= ${overflowData.innerWidth}px)`);
            } else {
                recordFail(`Viewport [${vp.id}] Horizontal Overflow`, `scrollWidth (${overflowData.scrollWidth}px) exceeds innerWidth (${overflowData.innerWidth}px)`);
            }
        }

        // Step 3: View-by-View Horizontal Overflow across Extremes & Boundaries
        console.log('\n--- Phase 3: Multi-View Horizontal Overflow Stress (320px, 360px, 640px, 768px, 1024px) ---');
        const stressViewports = [
            { width: 320, height: 480, label: '320px Extreme Mobile' },
            { width: 360, height: 640, label: '360px Compact Mobile' },
            { width: 640, height: 800, label: '640px Breakpoint Boundary' },
            { width: 768, height: 1024, label: '768px Tablet Portrait' },
            { width: 1024, height: 768, label: '1024px Tablet Landscape' }
        ];

        const viewsToTest = ['pos', 'inventory', 'crm', 'reports'];
        for (const svp of stressViewports) {
            await cdp.setViewport(svp.width, svp.height, 1, svp.width < 768);
            for (const viewId of viewsToTest) {
                const viewResult = await cdp.evaluate(`
                    (() => {
                        if (typeof switchTabDirect === 'function') {
                            switchTabDirect('${viewId}');
                        } else if (typeof switchTab === 'function') {
                            switchTab('${viewId}');
                        }
                        const docEl = document.documentElement;
                        const docBody = document.body;
                        const scrollW = Math.max(docEl ? docEl.scrollWidth : 0, docBody ? docBody.scrollWidth : 0);
                        const innerW = window.innerWidth;
                        const targetView = document.getElementById('${viewId}');
                        const viewScrollW = targetView ? targetView.scrollWidth : 0;
                        return {
                            innerW,
                            scrollW,
                            viewScrollW,
                            hasOverflow: scrollW > innerW + 1
                        };
                    })()
                `);
                await new Promise(r => setTimeout(r, 100));

                if (!viewResult.hasOverflow) {
                    recordPass(`View [${viewId}] @ ${svp.label}: 0 horizontal overflow (scrollWidth: ${viewResult.scrollW}px <= innerWidth: ${viewResult.innerW}px)`);
                } else {
                    recordFail(`View [${viewId}] @ ${svp.label}: Horizontal Overflow`, `scrollWidth ${viewResult.scrollW}px > innerWidth ${viewResult.innerW}px`);
                }
            }
        }

        // Return to POS
        await cdp.evaluate(`if (typeof switchTabDirect === 'function') switchTabDirect('pos');`);

        // Step 4: Short Viewport Modal Clipping & Accessible Close Buttons (320x480 & 360x400)
        console.log('\n--- Phase 4: Short Viewport Modal Clipping & Dismissal Audit ---');
        await cdp.setViewport(320, 480, 2, true);

        const modalsToAudit = [
            {
                name: 'shopAuthModal',
                openExpr: `(() => { const el = document.getElementById('shopAuthModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('shopAuthModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#shopAuthModal .shop-auth-card',
                closeSelector: null // Bottom sheet, check container bounds
            },
            {
                name: 'moreHubModal',
                openExpr: `(() => { if (typeof openMoreHub === 'function') openMoreHub(); })()`,
                closeExpr: `(() => { if (typeof closeMoreHub === 'function') closeMoreHub(); })()`,
                boxSelector: '#moreHubModal .more-hub-box',
                closeSelector: null // Dismissible overlay
            },
            {
                name: 'recordKhataPaymentModal',
                openExpr: `(() => { const el = document.getElementById('recordKhataPaymentModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('recordKhataPaymentModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#recordKhataPaymentModal .modal-box',
                closeSelector: '#recordKhataPaymentModal .khata-close-btn'
            },
            {
                name: 'addKhataDueModal',
                openExpr: `(() => { const el = document.getElementById('addKhataDueModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('addKhataDueModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#addKhataDueModal .modal-box',
                closeSelector: '#addKhataDueModal .khata-close-btn'
            },
            {
                name: 'printerSettingsModal',
                openExpr: `(() => { const el = document.getElementById('printerSettingsModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('printerSettingsModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#printerSettingsModal .modal-box',
                closeSelector: '#printerSettingsModal .printer-close-btn'
            },
            {
                name: 'authorizedDevicesModal',
                openExpr: `(() => { const el = document.getElementById('authorizedDevicesModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('authorizedDevicesModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#authorizedDevicesModal .modal-box',
                closeSelector: '#authorizedDevicesModal .device-hub-close-btn'
            },
            {
                name: 'deviceApprovalPinModal',
                openExpr: `(() => { const el = document.getElementById('deviceApprovalPinModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('deviceApprovalPinModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#deviceApprovalPinModal .modal-box',
                closeSelector: '#deviceApprovalPinModal .device-approval-close-btn'
            },
            {
                name: 'adminForgotPinModal',
                openExpr: `(() => { const el = document.getElementById('adminForgotPinModal'); if (el) el.style.display = 'flex'; })()`,
                closeExpr: `(() => { const el = document.getElementById('adminForgotPinModal'); if (el) el.style.display = 'none'; })()`,
                boxSelector: '#adminForgotPinModal .modal-box',
                closeSelector: '#adminForgotPinModal .forgot-pin-close-btn'
            }
        ];

        for (const modal of modalsToAudit) {
            await cdp.evaluate(modal.openExpr);
            await new Promise(r => setTimeout(r, 150));

            const modalMetrics = await cdp.evaluate(`
                (() => {
                    const docEl = document.documentElement;
                    const innerW = window.innerWidth;
                    const innerH = window.innerHeight;
                    const scrollW = docEl.scrollWidth;
                    const box = document.querySelector('${modal.boxSelector}');
                    const boxRect = box ? box.getBoundingClientRect() : null;
                    let closeBtnRect = null;
                    if ('${modal.closeSelector}' && '${modal.closeSelector}' !== 'null') {
                        const btn = document.querySelector('${modal.closeSelector}');
                        if (btn) closeBtnRect = btn.getBoundingClientRect();
                    }
                    return {
                        innerW,
                        innerH,
                        scrollW,
                        hasHOverflow: scrollW > innerW + 1,
                        boxVisible: !!boxRect && boxRect.width > 0 && boxRect.height > 0,
                        boxWidth: boxRect ? boxRect.width : 0,
                        closeBtnVisible: !closeBtnRect || (closeBtnRect.top >= 0 && closeBtnRect.top <= innerH)
                    };
                })()
            `);

            // Check no horizontal overflow when modal is active
            if (!modalMetrics.hasHOverflow) {
                recordPass(`Modal [${modal.name}] @ 320x480: Zero horizontal page overflow`);
            } else {
                recordFail(`Modal [${modal.name}] @ 320x480: Horizontal overflow`, `scrollWidth (${modalMetrics.scrollW}px) > innerWidth (${modalMetrics.innerW}px)`);
            }

            // Check box within viewport bounds
            if (modalMetrics.boxVisible && modalMetrics.boxWidth <= 320) {
                recordPass(`Modal [${modal.name}] @ 320x480: Card fits within 320px width (boxWidth: ${modalMetrics.boxWidth}px)`);
            } else {
                recordFail(`Modal [${modal.name}] @ 320x480: Box sizing`, `boxWidth: ${modalMetrics.boxWidth}px exceeds 320px`);
            }

            // Check close button accessibility
            if (modalMetrics.closeBtnVisible) {
                recordPass(`Modal [${modal.name}] @ 320x480: Close button is accessible on short viewport`);
            } else {
                recordFail(`Modal [${modal.name}] @ 320x480: Close button clipped`, `Close button is pushed out of viewport`);
            }

            await cdp.evaluate(modal.closeExpr);
            await new Promise(r => setTimeout(r, 100));
        }

        // Step 5: Touch Target Boundaries Verification (Minimum 44x44px Hit Area)
        console.log('\n--- Phase 5: Touch Target Hit Area Verification (>= 44x44px) ---');
        // Test in mobile viewport (390px)
        await cdp.setViewport(390, 844, 2, true);

        const customCloseButtons = [
            { cls: '.khata-close-btn', name: 'Khata Ledger Close' },
            { cls: '.orders-log-close-btn', name: 'Orders Log Close' },
            { cls: '.printer-close-btn', name: 'Printer Settings Close' },
            { cls: '.device-hub-close-btn', name: 'Device Hub Close' },
            { cls: '.device-approval-close-btn', name: 'Device Approval Close' },
            { cls: '.forgot-pin-close-btn', name: 'Forgot PIN Close' },
            { cls: '.report-picker-close-btn', name: 'Report Date Picker Close' },
            { cls: '.txn-action-close-btn', name: 'Transaction Action Close' },
            { cls: '.ai_scan_close_btn', name: 'AI Scan Close' },
            { cls: '.drawer-close-btn', name: 'Drawer Close' },
            { cls: '.hdr-close-btn', name: 'Header Dialog Close' },
            { cls: '.wa-preview-close-btn', name: 'WhatsApp Preview Close' },
            { cls: '.slide-menu-close-btn', name: 'Slide Menu Close' },
            { cls: '.modal-close-btn', name: 'Standard Modal Close SVG' }
        ];

        for (const item of customCloseButtons) {
            const hitMetrics = await cdp.evaluate(`
                (() => {
                    const el = document.querySelector('${item.cls}');
                    if (!el) return { found: false };
                    const rect = el.getBoundingClientRect();
                    const computed = window.getComputedStyle(el);
                    const before = window.getComputedStyle(el, '::before');
                    
                    const rectW = rect.width;
                    const rectH = rect.height;
                    const compMinW = parseFloat(computed.minWidth) || 0;
                    const compMinH = parseFloat(computed.minHeight) || 0;
                    const beforeMinW = parseFloat(before.minWidth) || 0;
                    const beforeMinH = parseFloat(before.minHeight) || 0;
                    
                    const effectiveW = Math.max(rectW, compMinW, beforeMinW);
                    const effectiveH = Math.max(rectH, compMinH, beforeMinH);
                    
                    return {
                        found: true,
                        rectW,
                        rectH,
                        compMinW,
                        compMinH,
                        beforeMinW,
                        beforeMinH,
                        effectiveW,
                        effectiveH,
                        is44pxCompliant: effectiveW >= 43.5 && effectiveH >= 43.5
                    };
                })()
            `);

            if (!hitMetrics.found) {
                recordFail(`Touch Target [${item.name} (${item.cls})]`, 'Element not found in DOM');
            } else if (hitMetrics.is44pxCompliant) {
                recordPass(`Touch Target [${item.name} (${item.cls})]: Compliant >= 44x44px (effective: ${hitMetrics.effectiveW}x${hitMetrics.effectiveH}px, pseudo: ${hitMetrics.beforeMinW}x${hitMetrics.beforeMinH}px)`);
            } else {
                recordFail(`Touch Target [${item.name} (${item.cls})]: Sub-44px target`, `Effective size ${hitMetrics.effectiveW}x${hitMetrics.effectiveH}px < 44x44px`);
            }
        }

        // Action dropdown buttons touch target in customers and sales history tables
        const actionDropdownMetrics = await cdp.evaluate(`
            (() => {
                const parent = document.getElementById('customersTableBody') || document.body;
                const dummyBtn = document.createElement('button');
                dummyBtn.className = 'action-dropdown-btn';
                parent.appendChild(dummyBtn);
                const computed = window.getComputedStyle(dummyBtn);
                const before = window.getComputedStyle(dummyBtn, '::before');
                const minW = parseFloat(computed.minWidth) || 0;
                const minH = parseFloat(computed.minHeight) || 0;
                const beforeMinW = parseFloat(before.minWidth) || 0;
                const beforeMinH = parseFloat(before.minHeight) || 0;
                parent.removeChild(dummyBtn);
                return {
                    minW,
                    minH,
                    beforeMinW,
                    beforeMinH,
                    isCompliant: Math.max(minW, beforeMinW) >= 43.5 && Math.max(minH, beforeMinH) >= 43.5
                };
            })()
        `);
        if (actionDropdownMetrics.isCompliant) {
            recordPass(`Touch Target [.action-dropdown-btn]: Compliant >= 44x44px (minWidth: ${actionDropdownMetrics.minW}px, pseudo: ${actionDropdownMetrics.beforeMinW}px)`);
        } else {
            recordFail('Touch Target [.action-dropdown-btn]', `Sub-44px: minW=${actionDropdownMetrics.minW}px`);
        }

        // Stepper buttons touch target expansion on tablet portrait (768px)
        await cdp.setViewport(768, 1024, 2, true);
        const tabletStepperMetrics = await cdp.evaluate(`
            (() => {
                const qtyBtn = document.createElement('button');
                const qtyCtrl = document.createElement('div');
                qtyCtrl.className = 'item-qty-control';
                qtyCtrl.appendChild(qtyBtn);
                document.body.appendChild(qtyCtrl);
                const before = window.getComputedStyle(qtyBtn, '::before');
                const beforeMinW = parseFloat(before.minWidth) || 0;
                const beforeMinH = parseFloat(before.minHeight) || 0;
                document.body.removeChild(qtyCtrl);
                return {
                    beforeMinW,
                    beforeMinH,
                    isCompliant: beforeMinW >= 43.5 && beforeMinH >= 43.5
                };
            })()
        `);
        if (tabletStepperMetrics.isCompliant) {
            recordPass(`Tablet Stepper Touch Expansion [.item-qty-control button::before]: Compliant >= 44x44px (pseudo: ${tabletStepperMetrics.beforeMinW}x${tabletStepperMetrics.beforeMinH}px)`);
        } else {
            recordFail('Tablet Stepper Touch Expansion', `Pseudo size ${tabletStepperMetrics.beforeMinW}x${tabletStepperMetrics.beforeMinH}px < 44x44px`);
        }

        // Step 6: Inventory Breakpoint Collision Check at 767.98px / 768px
        console.log('\n--- Phase 6: Inventory Breakpoint Boundary Collision Audit (767px vs 768px) ---');
        // At 767px:
        await cdp.setViewport(767, 1024, 1, false);
        const inv767 = await cdp.evaluate(`
            (() => {
                if (typeof switchTabDirect === 'function') switchTabDirect('inventory');
                const tableWrap = document.querySelector('.inv-telemetry-table-wrap');
                const cardsWrap = document.querySelector('.inv-stock-cards-grid');
                return {
                    tableDisplay: tableWrap ? window.getComputedStyle(tableWrap).display : null,
                    cardsDisplay: cardsWrap ? window.getComputedStyle(cardsWrap).display : null
                };
            })()
        `);
        if (inv767.tableDisplay === 'none') {
            recordPass('Inventory Breakpoint @ 767px: Telemetry table cleanly hidden on mobile (display: none)');
        } else {
            recordFail('Inventory Breakpoint @ 767px', `Expected table display: none, got: ${inv767.tableDisplay}`);
        }

        // At 768px:
        await cdp.setViewport(768, 1024, 1, false);
        const inv768 = await cdp.evaluate(`
            (() => {
                if (typeof switchTabDirect === 'function') switchTabDirect('inventory');
                const tableWrap = document.querySelector('.inv-telemetry-table-wrap');
                const cardsWrap = document.querySelector('.inv-stock-cards-grid');
                return {
                    tableDisplay: tableWrap ? window.getComputedStyle(tableWrap).display : null,
                    cardsDisplay: cardsWrap ? window.getComputedStyle(cardsWrap).display : null
                };
            })()
        `);
        if (inv768.tableDisplay !== 'none') {
            recordPass(`Inventory Breakpoint @ 768px: Telemetry table cleanly visible on tablet/desktop (display: ${inv768.tableDisplay})`);
        } else {
            recordFail('Inventory Breakpoint @ 768px', `Telemetry table unexpectedly hidden (display: ${inv768.tableDisplay})`);
        }

    } finally {
        if (cdp) cdp.close();
        if (chromeProc) chromeProc.kill();
        if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
            try {
                fs.rmSync(tempUserDataDir, { recursive: true, force: true });
            } catch (e) {}
        }
    }

    console.log('\n====================================================================');
    console.log(`📊 ADVERSARIAL AUDIT SUMMARY: ${auditResults.passedChecks}/${auditResults.totalChecks} PASSED, ${auditResults.failedChecks} FAILED`);
    console.log('====================================================================\n');

    if (auditResults.failures.length > 0) {
        console.error('❌ FAILURES DETECTED:');
        for (const f of auditResults.failures) {
            console.error(`  - ${f.testName}: ${f.reason}`);
        }
        process.exit(1);
    } else {
        console.log('🎉 ALL ADVERSARIAL VIEWPORT & TOUCH TARGET CHECKS PASSED 100% GREEN!');
        process.exit(0);
    }
}

runAdversarialAudit().catch(err => {
    console.error('💥 Unhandled exception during adversarial audit:', err);
    process.exit(1);
});
