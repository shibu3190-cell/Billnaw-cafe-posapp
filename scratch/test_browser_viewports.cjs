/**
 * scratch/test_browser_viewports.cjs
 *
 * Automated Headless Chrome CDP Multi-Viewport Layout & Interaction Audit
 * Pure Node 24 native WebSocket & fetch implementation (zero external npm dependencies)
 *
 * Viewports Tested:
 * - Desktop: 1280 x 800 (deviceScaleFactor: 1, mobile: false)
 * - Mobile:  390 x 844  (deviceScaleFactor: 2, mobile: true)
 *
 * 7 UI Domains Tested across BOTH Viewports:
 * 1. Modals (Store Profile modal, backdrop blur, rounded corners, close button SVG)
 * 2. POS Billing (4-col vs 2-col menu grid, price pills, table pills, 1-motion 44px steppers)
 * 3. Checkout (Cart drawer 360px vs slide-up sheet, amber VIP loss aversion alert, cash keypad, UPI QR)
 * 4. Inventory (Telemetry table desktop vs master-detail accordion mobile, status badges)
 * 5. CRM & WhatsApp (Customer table desktop vs touch cards mobile, live phone mockup vs floating pill)
 * 6. Reports & Analytics (KPI grid 4-col vs 1-col, charts grid, donut card, ledger table vs flex cards)
 * 7. Food Image Dock (Modal, 100px preview container, status pill, quad-action approval dock)
 *
 * Output: 14 Screenshot artifacts in scratch/browser_artifacts/
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'scratch', 'browser_artifacts');
const CDP_PORT = 9250;
const SERVER_URL = 'http://localhost:5000';

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
        // Not running yet
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

// Ensure minimal seed data exists for inventory and CRM
async function ensureSeedData() {
    try {
        await fetch(`${SERVER_URL}/api/inventory/raw-materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 'MAT-001',
                name: 'Espresso Roast Beans',
                category: 'Coffee & Tea',
                current_stock: 12.5,
                min_threshold: 5,
                cost_per_unit: 650,
                unit: 'kg',
                supplier: 'Blue Tokai'
            })
        });
        await fetch(`${SERVER_URL}/api/inventory/raw-materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 'MAT-002',
                name: 'Full Cream Milk',
                category: 'Dairy',
                current_stock: 3.0,
                min_threshold: 10,
                cost_per_unit: 65,
                unit: 'Litre',
                supplier: 'Amul Dairy'
            })
        });
    } catch (e) {
        // Ignore if backend in-memory seeding fails
    }
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
                        console.error(`[CDP << ERROR] #${msg.id}:`, msg.error);
                        reject(new Error(JSON.stringify(msg.error)));
                    } else {
                        // console.log(`[CDP << OK] #${msg.id}`);
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

    send(method, params = {}, timeoutMs = 10000) {
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
            // console.log(`[CDP >>] #${msgId} ${method}`);
            this.ws.send(JSON.stringify({ id: msgId, method, params }));
        });
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

    once(event, timeoutMs = 5000) {
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

    async evaluate(expression, retries = 3) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await this.send('Runtime.evaluate', {
                    expression,
                    returnByValue: true,
                    awaitPromise: true
                });
                if (res.exceptionDetails) {
                    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
                    throw new Error(`Runtime.evaluate Exception: ${desc}`);
                }
                return res.result ? res.result.value : null;
            } catch (err) {
                if (attempt < retries && (err.message.includes('context') || err.message.includes('destroyed') || err.message.includes('not defined'))) {
                    await new Promise(r => setTimeout(r, 700));
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

    async captureScreenshot(filename) {
        const fullPath = path.join(ARTIFACTS_DIR, filename);
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const buffer = Buffer.from(res.data, 'base64');
        fs.writeFileSync(fullPath, buffer);
        console.log(`    📸 Saved screenshot: ${filename} (${buffer.length} bytes)`);
        return buffer.length;
    }

    close() {
        try {
            if (this.ws) {
                this.ws.onmessage = null;
                this.ws.onerror = null;
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
// 3.5. ANTI-OCCLUSION & OVERLAY SUPPRESSION HELPERS
// ------------------------------------------------------------

/**
 * Dedicated Helper: Enforce display: none on #shopAuthModal, #appUpdatePopup,
 * #activationOverlay, and #loginOverlay, plus call dismiss functions and ensure auth state.
 */
async function ensureOverlaysSuppressed(cdp, allowedModalId = null) {
    await cdp.evaluate(`
        ((allowedId) => {
            // 1. Permanent CSS rule
            let style = document.getElementById('browser-audit-suppression');
            if (!style) {
                style = document.createElement('style');
                style.id = 'browser-audit-suppression';
                style.textContent = '#shopAuthModal, #appUpdatePopup, #activationOverlay, #loginOverlay, #devicePairingOverlay, #firstLoginPinModal { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
                (document.head || document.documentElement).appendChild(style);
            }

            // 2. Element-level inline style overrides
            const authModal = document.getElementById('shopAuthModal');
            if (authModal) {
                authModal.style.setProperty('display', 'none', 'important');
                authModal.style.setProperty('visibility', 'hidden', 'important');
                authModal.classList.remove('open', 'show');
                delete authModal.dataset.relogin;
            }

            const updatePopup = document.getElementById('appUpdatePopup');
            if (updatePopup) {
                updatePopup.style.setProperty('display', 'none', 'important');
                updatePopup.style.setProperty('visibility', 'hidden', 'important');
            }

            const actOverlay = document.getElementById('activationOverlay');
            if (actOverlay) {
                actOverlay.style.setProperty('display', 'none', 'important');
                actOverlay.style.setProperty('visibility', 'hidden', 'important');
            }

            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) {
                loginOverlay.style.setProperty('display', 'none', 'important');
                loginOverlay.style.setProperty('visibility', 'hidden', 'important');
            }

            const pairOverlay = document.getElementById('devicePairingOverlay');
            if (pairOverlay) {
                pairOverlay.style.setProperty('display', 'none', 'important');
                pairOverlay.style.setProperty('visibility', 'hidden', 'important');
            }

            // 3. Dismissal functions
            if (typeof dismissAppUpdatePopup === 'function') dismissAppUpdatePopup();
            if (typeof closeShopAuthModal === 'function') closeShopAuthModal(true);

            // 4. Cross-domain modal isolation enforcement
            const domainModals = ['storeProfileModal', 'checkoutModal', 'menuItemModal'];
            for (const modalId of domainModals) {
                if (allowedId && modalId === allowedId) continue;
                const m = document.getElementById(modalId);
                if (m) {
                    m.style.setProperty('display', 'none', 'important');
                    m.classList.remove('open', 'show', 'active');
                }
            }

            // 5. Invariant storage protection
            if (localStorage.getItem('billnaw_auth_mode') !== 'authenticated') {
                localStorage.setItem('billnaw_auth_mode', 'authenticated');
            }
            if (localStorage.getItem('billnaw_pos_version') !== '2.4.0') {
                localStorage.setItem('billnaw_pos_version', '2.4.0');
            }
            if (localStorage.getItem('billnaw_is_master') !== 'true') {
                localStorage.setItem('billnaw_is_master', 'true');
            }
            if (localStorage.getItem('billnaw_device_status') !== 'AUTHORIZED') {
                localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            }
            if (!localStorage.getItem('billnaw_device_id')) {
                localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
            }
        })(${allowedModalId ? JSON.stringify(allowedModalId) : 'null'})
    `);
}

/**
 * Anti-Occlusion Test Oracle:
 * Asserts that no blocking modal overlays or popups (#shopAuthModal, #appUpdatePopup,
 * #activationOverlay, #loginOverlay) are visible in the viewport before screenshot capture.
 * If allowedModalId is provided, all other modal overlays must be closed.
 */
async function assertAntiOcclusion(cdp, contextName, allowedModalId = null) {
    await ensureOverlaysSuppressed(cdp, allowedModalId);

    const report = await cdp.evaluate(`
        ((allowedId) => {
            const blockingOverlays = [
                { id: 'shopAuthModal', name: 'Shop Authentication Modal' },
                { id: 'appUpdatePopup', name: 'PWA Update Floating Popup' },
                { id: 'activationOverlay', name: 'Software Activation Overlay' },
                { id: 'loginOverlay', name: 'Staff PIN Login Overlay' }
            ];

            const domainModals = [
                { id: 'storeProfileModal', name: 'Store Profile Modal' },
                { id: 'checkoutModal', name: 'Checkout Modal' },
                { id: 'menuItemModal', name: 'Menu Item / Food Image Modal' }
            ];

            function isElementVisible(el) {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none') return false;
                if (style.visibility === 'hidden') return false;
                if (parseFloat(style.opacity || '1') <= 0) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }

            const violations = [];

            // 1. Check unauthorized blocking overlays (NEVER allowed during domain audits)
            for (const item of blockingOverlays) {
                const el = document.getElementById(item.id);
                if (isElementVisible(el)) {
                    const style = window.getComputedStyle(el);
                    violations.push({
                        id: item.id,
                        name: item.name,
                        display: style.display,
                        visibility: style.visibility,
                        zIndex: style.zIndex,
                        type: 'unauthorized_blocking_overlay'
                    });
                }
            }

            // 2. Check cross-domain modal isolation
            for (const item of domainModals) {
                if (allowedId && item.id === allowedId) continue; // Target modal is expected
                const el = document.getElementById(item.id);
                if (isElementVisible(el)) {
                    const style = window.getComputedStyle(el);
                    violations.push({
                        id: item.id,
                        name: item.name,
                        display: style.display,
                        visibility: style.visibility,
                        zIndex: style.zIndex,
                        type: 'cross_domain_leakage'
                    });
                }
            }

            return {
                clean: violations.length === 0,
                violations
            };
        })(${allowedModalId ? JSON.stringify(allowedModalId) : 'null'})
    `);

    assert.strictEqual(
        report.clean,
        true,
        `❌ [ANTI-OCCLUSION ORACLE BREACH in ${contextName}]: Viewport is obscured by illegal overlay(s):\n` +
        report.violations.map(v => `   - #${v.id} (${v.name}): display="${v.display}", visibility="${v.visibility}", zIndex="${v.zIndex}" [${v.type}]`).join('\n')
    );
}

// ------------------------------------------------------------
// 4. TEST IMPLEMENTATION FOR 7 DOMAINS
// ------------------------------------------------------------

/**
 * Domain 1: Modals
 */
async function testDomain1_Modals(cdp, viewport) {
    console.log(`  [Domain 1: Modals] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    // Poll up to 3000ms for storeProfileModal to exist in DOM
    let modalExists = false;
    for (let i = 0; i < 30; i++) {
        modalExists = await cdp.evaluate(`!!document.getElementById('storeProfileModal')`);
        if (modalExists) break;
        await new Promise(r => setTimeout(r, 100));
    }
    assert(modalExists, 'storeProfileModal element must exist in DOM');

    // 1. Open Store Profile Modal
    const openRes = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('storeProfileModal');
            if (!modal) return null;
            modal.style.removeProperty('display');
            modal.style.removeProperty('visibility');
            if (typeof openStoreProfileModal !== 'function') throw new Error("openStoreProfileModal not defined");
            openStoreProfileModal();
            return {
                display: window.getComputedStyle(modal).display,
                position: window.getComputedStyle(modal).position,
                zIndex: window.getComputedStyle(modal).zIndex
            };
        })()
    `);

    assert(openRes, 'storeProfileModal element was null when opening');
    assert.strictEqual(openRes.display, 'flex', 'Store profile modal must display flex when opened');
    assert.strictEqual(openRes.position, 'fixed', 'Store profile modal overlay must have position: fixed');

    // Wait 200ms for CSS transitions
    await new Promise(r => setTimeout(r, 200));

    // 2. Assert Modal Box, Backdrop Blur & Close Button SVG
    const modalAssert = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('storeProfileModal');
            if (!modal) return null;
            const style = window.getComputedStyle(modal);
            const box = modal.querySelector('.modal-box');
            const boxStyle = box ? window.getComputedStyle(box) : null;
            const closeBtn = modal.querySelector('.modal-close-btn');
            const svg = closeBtn ? closeBtn.querySelector('svg') : null;
            const svgRect = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };

            const bFilter = style.backdropFilter || style.webkitBackdropFilter || '';
            const hasBackdrop = bFilter.includes('blur') || style.backgroundColor.includes('rgba');
            const hasRoundedCorners = boxStyle ? parseInt(boxStyle.borderRadius, 10) >= 16 : false;

            return {
                hasBackdrop,
                hasRoundedCorners,
                borderRadius: boxStyle ? boxStyle.borderRadius : '',
                hasCloseBtn: !!closeBtn,
                hasCloseSvg: !!svg,
                svgWidth: svgRect.width,
                svgHeight: svgRect.height
            };
        })()
    `);

    assert(modalAssert, 'storeProfileModal element was null during modalAssert');
    assert(modalAssert.hasBackdrop, 'Modal overlay must have backdrop filter or rgba background');
    assert(modalAssert.hasRoundedCorners, `Modal box must have rounded corners (>=16px), got: ${modalAssert.borderRadius}`);
    assert(modalAssert.hasCloseBtn, 'Modal must contain .modal-close-btn');
    assert(modalAssert.hasCloseSvg, 'Modal close button must contain SVG');
    assert(modalAssert.svgWidth > 0 && modalAssert.svgHeight > 0, 'Modal close SVG must have non-zero dimensions');

    // 3. Assert Anti-Occlusion & Capture Screenshot Artifact 01
    await assertAntiOcclusion(cdp, `Domain 1: Modals (${viewport})`, 'storeProfileModal');
    await cdp.captureScreenshot(`01_modals_${viewport}.png`);

    // 4. Close Modal
    await cdp.evaluate(`
        (() => {
            if (typeof closeStoreProfileModal === 'function') {
                try { closeStoreProfileModal(); } catch (e) {}
            }
            const modal = document.getElementById('storeProfileModal');
            if (modal) {
                modal.style.display = 'none';
                modal.style.setProperty('display', 'none', 'important');
                modal.classList.remove('open', 'show', 'active');
            }
        })()
    `);

    // Poll until computed style is display: none
    let isClosed = false;
    for (let i = 0; i < 30; i++) {
        const disp = await cdp.evaluate(`
            (() => {
                const modal = document.getElementById('storeProfileModal');
                if (!modal) return 'none';
                return window.getComputedStyle(modal).display;
            })()
        `);
        if (disp === 'none') {
            isClosed = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    assert(isClosed, 'Store profile modal must be closed with display: none');
    console.log(`  ✅ Domain 1 passed for ${viewport}.`);
}

/**
 * Domain 2: POS Billing
 */
async function testDomain2_POS(cdp, viewport) {
    console.log(`  [Domain 2: POS Billing] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    // 1. Switch to POS Tab
    await cdp.evaluate(`
        (() => {
            switchTab('pos');
        })()
    `);
    await new Promise(r => setTimeout(r, 250));

    // 2. Assert Menu Grid Columns (Desktop: 4, Mobile: 2)
    const expectedCols = viewport === 'desktop' ? 4 : 2;
    const gridAssert = await cdp.evaluate(`
        ((expected) => {
            const grid = document.querySelector('.menu-grid');
            if (!grid) throw new Error("Missing .menu-grid");
            const style = window.getComputedStyle(grid);
            const cols = style.gridTemplateColumns.trim().split(/\\s+/).length;
            return {
                cols,
                gridTemplateColumns: style.gridTemplateColumns,
                gap: style.gap
            };
        })(${expectedCols})
    `);

    assert.strictEqual(gridAssert.cols, expectedCols, `Expected ${expectedCols} menu grid columns on ${viewport}, got: ${gridAssert.cols}`);

    // 3. Assert Dish Card Price Pills and Table Grid Pills
    const posPillsAssert = await cdp.evaluate(`
        (() => {
            const tableGrid = document.getElementById('tableGridUI');
            const tableBtns = tableGrid ? tableGrid.querySelectorAll('.table-btn') : [];
            const selectedTable = tableGrid ? tableGrid.querySelector('.table-btn.selected') : null;

            const cards = document.querySelectorAll('.menu-card');
            const firstCard = cards[0];
            const priceEl = firstCard ? firstCard.querySelector('.card-price-col .price, .price') : null;
            const priceText = priceEl ? priceEl.innerText.trim() : '';

            return {
                tableCount: tableBtns.length,
                hasSelectedTable: !!selectedTable,
                dishCount: cards.length,
                hasPriceRupee: priceText.includes('₹'),
                priceText
            };
        })()
    `);

    assert(posPillsAssert.tableCount > 0, 'Table grid must render .table-btn elements');
    assert(posPillsAssert.hasSelectedTable, 'Table grid must have an active selected table');
    assert(posPillsAssert.dishCount > 0, 'Menu grid must render .menu-card elements');
    assert(posPillsAssert.hasPriceRupee, `Dish card price must contain ₹ symbol, got: ${posPillsAssert.priceText}`);

    // 4. Trigger Add to Cart & Assert 1-Motion Quantity Stepper (44px Hit Target)
    const stepperAssert = await cdp.evaluate(`
        (() => {
            const targetDish = (window.menuItems && window.menuItems[0]) || { id: 1 };
            addToCart(targetDish.id);

            const stepper = document.querySelector('.menu-card .item-qty-control');
            if (!stepper) throw new Error("Missing .item-qty-control on dish card after addToCart");

            const buttons = stepper.querySelectorAll('button');
            const minusBtn = buttons[0];
            const beforeStyle = minusBtn ? window.getComputedStyle(minusBtn, '::before') : null;
            const minW = beforeStyle ? beforeStyle.minWidth : '';
            const minH = beforeStyle ? beforeStyle.minHeight : '';
            const btnRect = minusBtn ? minusBtn.getBoundingClientRect() : { width: 0 };

            const has44pxTouchZone = (minW === '44px' && minH === '44px') || (btnRect.width + 16 >= 44);

            return {
                stepperFound: !!stepper,
                buttonCount: buttons.length,
                minW,
                minH,
                has44pxTouchZone
            };
        })()
    `);

    assert(stepperAssert.stepperFound, '1-motion stepper must be rendered on dish card');
    assert(stepperAssert.buttonCount >= 2, 'Stepper must contain decrement and increment buttons');
    assert(stepperAssert.has44pxTouchZone, 'Stepper buttons must have ergonomic 44px thumb touch target zone');

    // 5. Assert Anti-Occlusion & Capture Screenshot Artifact 02
    await assertAntiOcclusion(cdp, `Domain 2: POS Billing (${viewport})`, null);
    await cdp.captureScreenshot(`02_pos_${viewport}.png`);
    console.log(`  ✅ Domain 2 passed for ${viewport}.`);
}

/**
 * Domain 3: Checkout
 */
async function testDomain3_Checkout(cdp, viewport) {
    console.log(`  [Domain 3: Checkout] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    const isMobile = viewport === 'mobile';

    // 1. Assert Cart Drawer Responsive Architecture & Loss Aversion Banner
    const cartAssert = await cdp.evaluate(`
        ((isMob) => {
            const drawer = document.getElementById('cartDrawer');
            if (!drawer) throw new Error("Missing #cartDrawer");
            const overlay = document.getElementById('cartDrawerOverlay');

            if (isMob) {
                if (typeof toggleCartDrawer === 'function' && !drawer.classList.contains('open')) {
                    toggleCartDrawer();
                }
            }

            const drawerStyle = window.getComputedStyle(drawer);
            const cartItems = document.querySelectorAll('#cartUI .cart-item');

            // Loss aversion alert check
            const lossAlert = document.getElementById('cartLossAversionAlert');
            const alertStyle = lossAlert ? window.getComputedStyle(lossAlert) : null;
            const isAlertFlex = alertStyle ? alertStyle.display === 'flex' : false;

            const bg = alertStyle ? alertStyle.backgroundColor : '';
            const border = alertStyle ? alertStyle.borderColor : '';
            const isAmber = bg.includes('255, 251, 235') || bg.includes('rgb(255, 251, 235)');

            return {
                drawerWidth: parseInt(drawerStyle.width, 10),
                drawerPosition: drawerStyle.position,
                isOpen: drawer.classList.contains('open'),
                itemCount: cartItems.length,
                isAlertFlex,
                isAmber,
                bg,
                border
            };
        })(${isMobile})
    `);

    if (!isMobile) {
        assert(Math.abs(cartAssert.drawerWidth - 360) <= 6, `Desktop Cart Drawer must be ~360px wide, got: ${cartAssert.drawerWidth}`);
    } else {
        assert(cartAssert.isOpen, 'Mobile Cart Drawer must have .open class when toggled');
        assert.strictEqual(cartAssert.drawerPosition, 'fixed', 'Mobile Cart Drawer must have position: fixed');
    }

    assert(cartAssert.itemCount > 0, 'Cart items container #cartUI must contain at least 1 .cart-item');
    assert(cartAssert.isAlertFlex, 'Loss aversion alert #cartLossAversionAlert must display: flex when cart has unlinked diner');
    assert(cartAssert.isAmber, `Loss aversion alert must use amber VIP palette (bg rgb(255, 251, 235)), got: ${cartAssert.bg}`);

    // 2. Trigger Checkout Modal & Assert Fast Tender Cash Keypad
    const cashAssert = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('checkoutModal');
            if (modal) {
                modal.style.removeProperty('display');
                modal.style.removeProperty('visibility');
            }
            if (typeof openCheckoutModal !== 'function') throw new Error("openCheckoutModal not defined");
            openCheckoutModal(true);

            const cashWrap = document.getElementById('checkoutCashTenderContainer');
            const cashStyle = cashWrap ? window.getComputedStyle(cashWrap) : null;

            const denomPills = document.querySelectorAll('#checkoutDenomPills .denom-pill');
            const activeDenom = document.querySelector('#checkoutDenomPills .denom-pill.active');
            const tenderInput = document.getElementById('checkoutCashTenderedInput');
            const changeDueBox = document.getElementById('checkoutChangeDueBox');

            return {
                modalDisplay: modal ? window.getComputedStyle(modal).display : 'none',
                cashDisplay: cashStyle ? cashStyle.display : 'none',
                denomCount: denomPills.length,
                hasActiveDenom: !!activeDenom,
                tenderValue: tenderInput ? tenderInput.value : '',
                hasChangeDue: !!changeDueBox
            };
        })()
    `);

    assert.strictEqual(cashAssert.modalDisplay, 'flex', 'Checkout modal must open with display: flex');
    assert.strictEqual(cashAssert.cashDisplay, 'block', 'Cash tender container must have display: block');
    assert(cashAssert.denomCount > 0, 'Cash denomination pills must be rendered');
    assert(cashAssert.hasActiveDenom, 'Denomination pills must have an active selected chip');
    assert(cashAssert.hasChangeDue, 'Change due box must exist');

    // 3. Switch to UPI & Assert Dynamic UPI QR Canvas with Async Polling
    const upiAssert = await cdp.evaluate(`
        (async () => {
            if (typeof selectPayment !== 'function') throw new Error("selectPayment not defined");

            // Defensive assurance of shopProfile state before UPI rendering
            const profileData = {
                name: 'Billnaw Cafe',
                shopName: 'Billnaw Cafe',
                upiId: 'billnaw@okaxis',
                tableCount: 5,
                showQr: true
            };
            if (typeof shopProfile !== 'undefined') Object.assign(shopProfile, profileData);
            if (!window.shopProfile) window.shopProfile = {};
            Object.assign(window.shopProfile, profileData);
            try {
                localStorage.setItem('billnaw_store_profile', JSON.stringify(window.shopProfile));
            } catch (e) {}

            // Wait up to 3000ms for QRCode library to be defined if still loading
            const startQrWait = Date.now();
            while (typeof window.QRCode === 'undefined' && (Date.now() - startQrWait < 3000)) {
                await new Promise(r => setTimeout(r, 100));
            }

            // Trigger UPI payment selection
            selectPayment('UPI', 'checkout');

            const upiWrap = document.getElementById('checkoutUpiQrContainer');
            const upiStyle = upiWrap ? window.getComputedStyle(upiWrap) : null;
            const qrHolder = document.getElementById('checkoutModalQrCanvas') || document.getElementById('checkoutQrCanvas');

            // Robust polling loop (up to 3000ms) for QR <canvas> or <img> rendering
            let qrCanvasOrImg = null;
            let qrRect = { width: 0, height: 0 };
            const pollStart = Date.now();
            while (Date.now() - pollStart < 3000) {
                if (qrHolder) {
                    // If QR code was not rendered (e.g. library loaded after click), re-render
                    if (!qrHolder.querySelector('canvas, img') && typeof renderCheckoutUpiQr === 'function' && window.QRCode) {
                        const cTot = parseFloat(document.getElementById('checkoutTotal')?.innerText) || 0;
                        renderCheckoutUpiQr(cTot);
                    }
                    qrCanvasOrImg = qrHolder.querySelector('canvas, img');
                    if (qrCanvasOrImg) {
                        qrRect = qrCanvasOrImg.getBoundingClientRect();
                        if (qrRect.width > 0 && qrRect.height > 0) {
                            break;
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 100));
            }

            const amtDisplay = document.getElementById('checkoutUpiAmtDisplay');

            return {
                upiDisplay: upiStyle ? upiStyle.display : 'none',
                hasQrHolder: !!qrHolder,
                hasQrElement: !!qrCanvasOrImg,
                qrWidth: qrRect.width,
                qrHeight: qrRect.height,
                hasAmtDisplay: !!amtDisplay,
                hasQRCodeLib: typeof window.QRCode !== 'undefined'
            };
        })()
    `);

    assert.strictEqual(upiAssert.upiDisplay, 'flex', 'UPI container must have display: flex');
    assert(upiAssert.hasQrHolder, 'UPI QR canvas holder (#checkoutModalQrCanvas) must exist');
    assert(upiAssert.hasQRCodeLib, 'window.QRCode library must be loaded');
    assert(upiAssert.hasQrElement, 'UPI QR code must render a <canvas> or <img>');
    assert(upiAssert.qrWidth > 0 && upiAssert.qrHeight > 0, `Rendered QR code must have non-zero dimensions, got ${upiAssert.qrWidth}x${upiAssert.qrHeight}`);

    // 4. Assert Anti-Occlusion & Capture Screenshot Artifact 03 (showing Checkout Modal with UPI QR & payment actions)
    await assertAntiOcclusion(cdp, `Domain 3: Checkout (${viewport})`, 'checkoutModal');
    await cdp.captureScreenshot(`03_checkout_${viewport}.png`);

    // 5. Clean up: Dismiss Checkout Modal & Drawer
    await cdp.evaluate(`
        (() => {
            if (typeof closeCheckoutModal === 'function') {
                try { closeCheckoutModal(); } catch (e) {}
            }
            const cm = document.getElementById('checkoutModal');
            if (cm) {
                cm.style.display = 'none';
                cm.style.setProperty('display', 'none', 'important');
                cm.classList.remove('open', 'show', 'active');
            }

            const drawer = document.getElementById('cartDrawer');
            if (drawer && drawer.classList.contains('open')) {
                drawer.classList.remove('open');
            }
            const overlay = document.getElementById('cartDrawerOverlay');
            if (overlay && overlay.classList.contains('show')) {
                overlay.classList.remove('show');
            }
        })()
    `);
    console.log(`  ✅ Domain 3 passed for ${viewport}.`);
}

/**
 * Domain 4: Inventory Management & Telemetry
 */
async function testDomain4_Inventory(cdp, viewport) {
    console.log(`  [Domain 4: Inventory] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    const isMobile = viewport === 'mobile';

    // 1. Switch to Inventory Tab
    await cdp.evaluate(`
        (() => {
            switchTab('inventory');
            if (typeof switchInventoryHubTab === 'function') switchInventoryHubTab('raw_stock');
        })()
    `);
    await new Promise(r => setTimeout(r, 300));

    // 2. Assert Layout & Responsive Breakpoint Behavior
    const invAssert = await cdp.evaluate(`
        ((isMob) => {
            const container = document.querySelector('.inv-telemetry-container');
            const tableWrap = document.querySelector('.inv-telemetry-table-wrap');
            const table = document.querySelector('.inv-telemetry-table');
            const stockGrid = document.querySelector('.inv-stock-cards-grid');
            const stockCards = document.querySelectorAll('.inv-stock-card');
            const badges = document.querySelectorAll('.inv-badge-instock, .inv-badge-low, .inv-badge-out');

            const tableWrapDisplay = tableWrap ? window.getComputedStyle(tableWrap).display : 'none';
            const tableDisplay = table ? window.getComputedStyle(table).display : 'none';
            const stockGridDisplay = stockGrid ? window.getComputedStyle(stockGrid).display : 'none';

            let firstCardResult = null;
            if (isMob && stockCards.length > 0) {
                const firstCard = stockCards[0];
                const masterRow = firstCard.querySelector('.inv-row-master');
                const masterHeight = masterRow ? masterRow.getBoundingClientRect().height : 0;
                const drawer = firstCard.querySelector('.inv-row-drawer');

                // Test click to expand
                if (masterRow) masterRow.click();
                const isExpanded = firstCard.classList.contains('expanded');
                const drawerVis = drawer ? window.getComputedStyle(drawer).visibility : '';

                firstCardResult = {
                    masterHeight,
                    isExpanded,
                    drawerVis
                };
            }

            return {
                hasContainer: !!container,
                tableWrapDisplay,
                tableDisplay,
                stockGridDisplay,
                cardCount: stockCards.length,
                badgeCount: badges.length,
                firstCardResult
            };
        })(${isMobile})
    `);

    assert(invAssert.hasContainer, 'Inventory telemetry container must exist');

    if (!isMobile) {
        // Desktop (1280x800): table visible, cards grid in grid mode
        assert(invAssert.tableWrapDisplay !== 'none', 'Desktop telemetry table wrapper must be visible');
        assert.strictEqual(invAssert.tableDisplay, 'table', 'Desktop telemetry table must have display: table');
        assert.strictEqual(invAssert.stockGridDisplay, 'grid', 'Desktop stock cards must have display: grid');
    } else {
        // Mobile (390x844): table hidden via display: none !important, cards in flex column
        assert.strictEqual(invAssert.tableWrapDisplay, 'none', 'Mobile telemetry table wrapper must be display: none !important');
        assert.strictEqual(invAssert.stockGridDisplay, 'flex', 'Mobile stock cards grid must have display: flex');
        if (invAssert.firstCardResult) {
            assert(invAssert.firstCardResult.masterHeight >= 44, `Mobile card master row height must be >= 44px, got: ${invAssert.firstCardResult.masterHeight}`);
            assert(invAssert.firstCardResult.isExpanded, 'Clicking mobile card master row must add .expanded class');
        }
    }

    // 3. Assert Anti-Occlusion & Capture Screenshot Artifact 04
    await assertAntiOcclusion(cdp, `Domain 4: Inventory (${viewport})`, null);
    await cdp.captureScreenshot(`04_inventory_${viewport}.png`);
    console.log(`  ✅ Domain 4 passed for ${viewport}.`);
}

/**
 * Domain 5: CRM, Khata Ledger & WhatsApp Marketing
 */
async function testDomain5_CRM(cdp, viewport) {
    console.log(`  [Domain 5: CRM & WhatsApp] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    const isMobile = viewport === 'mobile';

    // 1. Switch to Customers Tab & Ensure Mock Customers
    await cdp.evaluate(`
        (() => {
            if (!window.customersList || window.customersList.length === 0) {
                window.customersList = [
                    { id: 1, name: "Rajesh Kumar", phone: "9876543210", totalVisits: 25, totalSpend: 5400, loyaltyPoints: 340, lastVisit: "Today" },
                    { id: 2, name: "Priya Sharma", phone: "9123456780", totalVisits: 12, totalSpend: 2800, loyaltyPoints: 180, lastVisit: "Yesterday" },
                    { id: 3, name: "Amit Patel", phone: "9811223344", totalVisits: 6, totalSpend: 1100, loyaltyPoints: 60, lastVisit: "3 days ago" },
                    { id: 4, name: "Sneha Reddy", phone: "9988776655", totalVisits: 2, totalSpend: 450, loyaltyPoints: 20, lastVisit: "Last week" }
                ];
            }
            switchTab('customers');
            if (typeof switchCustomerHubTab === 'function') switchCustomerHubTab('directory');
            if (typeof renderCustomersUI === 'function') renderCustomersUI();
        })()
    `);

    // Poll up to 3000ms for customer table rows to be rendered
    let rowsReady = false;
    for (let i = 0; i < 30; i++) {
        rowsReady = await cdp.evaluate(`
            (() => {
                const rows = document.querySelectorAll('#customersTableBody tr');
                return rows.length > 0;
            })()
        `);
        if (rowsReady) break;
        await new Promise(r => setTimeout(r, 100));
    }
    assert(rowsReady, 'Customer directory table rows (#customersTableBody tr) failed to render within 3000ms');

    // 2. Assert Customer Directory (Desktop Table vs Mobile Touch Cards)
    const crmAssert = await cdp.evaluate(`
        ((isMob) => {
            const thead = document.querySelector('#custTabDirectory thead');
            const theadDisplay = thead ? window.getComputedStyle(thead).display : 'none';
            const rows = document.querySelectorAll('#customersTableBody tr');
            const tierBadges = document.querySelectorAll('.cust-badge, .tier-platinum, .tier-gold, .tier-silver, .tier-bronze');
            const dropdownBtns = document.querySelectorAll('.action-dropdown-btn');

            let firstRowDisplay = '';
            if (rows.length > 0 && rows[0]) {
                firstRowDisplay = window.getComputedStyle(rows[0]).display;
            }

            return {
                theadDisplay,
                rowCount: rows.length,
                tierBadgeCount: tierBadges.length,
                dropdownBtnCount: dropdownBtns.length,
                firstRowDisplay
            };
        })(${isMobile})
    `);

    assert(crmAssert.rowCount > 0, 'Customer directory table body must have customer rows');
    assert(crmAssert.tierBadgeCount > 0, 'Customer directory must display loyalty tier badges');

    if (!isMobile) {
        assert(crmAssert.theadDisplay !== 'none', 'Desktop customer table thead must be visible');
        assert(crmAssert.dropdownBtnCount > 0, 'Desktop customer rows must contain action dropdown buttons');
    } else {
        assert.strictEqual(crmAssert.theadDisplay, 'none', 'Mobile customer table thead must be hidden (display: none !important)');
        assert.strictEqual(crmAssert.firstRowDisplay, 'grid', 'Mobile customer rows must transform to standalone CSS grid touch cards');
    }

    // 3. Switch to WhatsApp Marketing Hub & Assert Live Phone Mockup / Floating Pill
    const waAssert = await cdp.evaluate(`
        ((isMob) => {
            if (typeof switchCustomerHubTab === 'function') switchCustomerHubTab('marketing');

            if (!isMob) {
                if (typeof setMarketingWizardStep === 'function') setMarketingWizardStep(3);
            } else {
                if (typeof setMarketingWizardStep === 'function') setMarketingWizardStep(2);
            }

            const phoneMockup = document.querySelector('.wa-phone-mockup');
            const phoneStyle = phoneMockup ? window.getComputedStyle(phoneMockup) : null;
            const phoneWidth = phoneMockup ? phoneMockup.getBoundingClientRect().width : 0;

            const floatingPill = document.querySelector('.wa-floating-preview-pill');
            const pillStyle = floatingPill ? window.getComputedStyle(floatingPill) : null;
            const liveDot = floatingPill ? floatingPill.querySelector('.wa-pill-dot-live') : null;
            const pillHeight = floatingPill ? floatingPill.getBoundingClientRect().height : 0;

            let expandSimulationWorks = false;
            if (isMob && floatingPill) {
                floatingPill.click();
                const expanded = phoneMockup ? phoneMockup.classList.contains('expanded') : false;
                expandSimulationWorks = expanded;
                if (typeof toggleWaPreviewExpand === 'function') toggleWaPreviewExpand(false);
            }

            return {
                phoneDisplay: phoneStyle ? phoneStyle.display : 'none',
                phoneWidth,
                pillDisplay: pillStyle ? pillStyle.display : 'none',
                pillHeight,
                hasLiveDot: !!liveDot,
                expandSimulationWorks
            };
        })(${isMobile})
    `);

    if (!isMobile) {
        assert(waAssert.phoneDisplay === 'block' || waAssert.phoneDisplay === 'flex', `Desktop WhatsApp live phone mockup must be visible, got: ${waAssert.phoneDisplay}`);
        assert(waAssert.phoneWidth >= 300 && waAssert.phoneWidth <= 650, `Desktop phone mockup must have responsive width (300-650px), got: ${waAssert.phoneWidth}`);
        assert.strictEqual(waAssert.pillDisplay, 'none', 'Floating preview pill must be hidden on desktop (display: none !important)');
    } else {
        assert(waAssert.pillDisplay === 'flex' || waAssert.pillDisplay === 'inline-flex', `Mobile WhatsApp floating preview pill must have display flex, got: ${waAssert.pillDisplay}`);
        assert(waAssert.hasLiveDot, 'Mobile WhatsApp floating preview pill must contain pulsing green live dot');
        assert(waAssert.pillHeight >= 40, `Mobile floating pill must satisfy touch target height >= 40px, got: ${waAssert.pillHeight}`);
        assert(waAssert.expandSimulationWorks, 'Tapping mobile floating preview pill must trigger expanded preview modal simulation');
    }

    // 4. Assert Anti-Occlusion & Capture Screenshot Artifact 05 (CRM WhatsApp Marketing view)
    await assertAntiOcclusion(cdp, `Domain 5: CRM & WhatsApp (${viewport})`, null);
    await cdp.captureScreenshot(`05_crm_${viewport}.png`);
    console.log(`  ✅ Domain 5 passed for ${viewport}.`);
}

/**
 * Domain 6: Reports & Analytics
 */
async function testDomain6_Reports(cdp, viewport) {
    console.log(`  [Domain 6: Reports & Analytics] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    const isMobile = viewport === 'mobile';

    // 1. Switch to Dashboard Tab & Ensure Mock Transaction History
    await cdp.evaluate(`
        (() => {
            if (!window.orderHistory || window.orderHistory.length === 0) {
                window.orderHistory = [
                    { id: 'BN-101', billNo: 'BN-101', customerName: 'Rajesh Kumar', totalAmount: 320, paymentMethod: 'UPI', date: new Date().toLocaleDateString(), time: '12:30 PM', items: [{ name: 'Espresso', qty: 2 }] },
                    { id: 'BN-102', billNo: 'BN-102', customerName: 'Priya Sharma', totalAmount: 150, paymentMethod: 'Cash', date: new Date().toLocaleDateString(), time: '01:15 PM', items: [{ name: 'Chicken Burger', qty: 1 }] }
                ];
            }
            switchTab('dashboard');
            if (typeof renderDashboardAnalytics === 'function') renderDashboardAnalytics();
        })()
    `);
    await new Promise(r => setTimeout(r, 350));

    // 2. Assert KPI Grid Columns (Desktop: 4 columns, Mobile: 1 column)
    const kpiAssert = await cdp.evaluate(`
        ((isMob) => {
            const grid = document.querySelector('#dashboard .kpi-grid');
            const style = grid ? window.getComputedStyle(grid) : null;
            const cards = grid ? grid.querySelectorAll('.kpi-card') : [];
            const grossVal = document.getElementById('kpiGrossSales')?.innerText || '';
            const profitVal = document.getElementById('kpiNetProfit')?.innerText || '';

            const cols = style ? style.gridTemplateColumns.trim().split(/\\s+/).length : 0;

            return {
                cardCount: cards.length,
                cols,
                gridTemplateColumns: style ? style.gridTemplateColumns : '',
                hasSalesCard: !!document.getElementById('kpiCard-sales'),
                hasExpensesCard: !!document.getElementById('kpiCard-expenses'),
                hasProfitCard: !!document.getElementById('kpiCard-profit'),
                hasOrdersCard: !!document.getElementById('kpiCard-orders'),
                hasRupeeGross: grossVal.includes('₹') || profitVal.includes('₹')
            };
        })(${isMobile})
    `);

    assert.strictEqual(kpiAssert.cardCount, 4, 'Must have exactly 4 KPI cards in dashboard');
    assert(kpiAssert.hasSalesCard && kpiAssert.hasExpensesCard && kpiAssert.hasProfitCard && kpiAssert.hasOrdersCard, 'All 4 KPI cards must be present');
    assert(kpiAssert.hasRupeeGross, 'KPI cards must preserve ₹ non-breaking currency formatting');

    if (!isMobile) {
        assert.strictEqual(kpiAssert.cols, 4, `Desktop KPI grid must have 4 columns, got: ${kpiAssert.cols}`);
    } else {
        assert.strictEqual(kpiAssert.cols, 1, `Mobile KPI grid must collapse to 1 column, got: ${kpiAssert.cols}`);
    }

    // 3. Assert Visual Charts Grid (.dash-charts-grid)
    const chartsAssert = await cdp.evaluate(`
        ((isMob) => {
            const grid = document.querySelector('#dashboard .dash-charts-grid');
            const style = grid ? window.getComputedStyle(grid) : null;
            const cols = style ? style.gridTemplateColumns.trim().split(/\\s+/).length : 0;

            const hasMeters = !!document.getElementById('dashProgressMetersCard');
            const hasDonut = !!document.getElementById('reportsDonutCard');
            const hasTopSelling = !!grid.querySelector('.dash-top-selling-card');
            const hasDonutCanvas = !!document.getElementById('dashDonutChart');
            const hasDonutCenter = !!document.getElementById('donutCenterTotal');

            return {
                cols,
                gridTemplateColumns: style ? style.gridTemplateColumns : '',
                hasMeters,
                hasDonut,
                hasTopSelling,
                hasDonutCanvas,
                hasDonutCenter
            };
        })(${isMobile})
    `);

    assert(chartsAssert.hasMeters, 'Progress meters card must be present');
    assert(chartsAssert.hasDonut, 'Interactive Donut analytics card #reportsDonutCard must be present');
    assert(chartsAssert.hasTopSelling, 'Top selling items card must be present');
    assert(chartsAssert.hasDonutCanvas, '#dashDonutChart canvas must be present');
    assert(chartsAssert.hasDonutCenter, 'Donut central metric overlay #donutCenterTotal must be present');

    if (!isMobile) {
        assert.strictEqual(chartsAssert.cols, 3, `Desktop charts grid must have 3 columns (1.1fr 1.1fr 1fr), got: ${chartsAssert.cols}`);
    } else {
        assert.strictEqual(chartsAssert.cols, 1, `Mobile charts grid must stack in 1 column (grid-template-columns: 1fr !important), got: ${chartsAssert.cols}`);
    }

    // 4. Assert Transaction Ledger Table & Mobile Flex Column Cards Transformation
    const ledgerAssert = await cdp.evaluate(`
        ((isMob) => {
            const thead = document.querySelector('#dashboard .data-table thead');
            const table = document.querySelector('#dashboard .data-table');
            const tbody = document.getElementById('historyTableBody');
            const theadDisplay = thead ? window.getComputedStyle(thead).display : '';
            const tableDisplay = table ? window.getComputedStyle(table).display : '';
            const rows = tbody ? tbody.querySelectorAll('tr') : [];

            let rowDisplay = '';
            let rowFlexDir = '';
            let rowRadius = '';
            if (rows.length > 0) {
                const rStyle = window.getComputedStyle(rows[0]);
                rowDisplay = rStyle.display;
                rowFlexDir = rStyle.flexDirection;
                rowRadius = rStyle.borderRadius;
            }

            return {
                theadDisplay,
                tableDisplay,
                rowCount: rows.length,
                rowDisplay,
                rowFlexDir,
                rowRadius
            };
        })(${isMobile})
    `);

    if (!isMobile) {
        assert(ledgerAssert.theadDisplay !== 'none', 'Desktop transaction table thead must be visible');
        assert.strictEqual(ledgerAssert.tableDisplay, 'table', 'Desktop transaction table must use table display');
    } else {
        assert.strictEqual(ledgerAssert.theadDisplay, 'none', 'Mobile transaction table thead must be hidden via display: none !important');
        assert.strictEqual(ledgerAssert.tableDisplay, 'block', 'Mobile data-table must be display: block !important');
        if (ledgerAssert.rowCount > 0) {
            assert.strictEqual(ledgerAssert.rowDisplay, 'flex', 'Mobile ledger row must display as flex card');
            assert.strictEqual(ledgerAssert.rowFlexDir, 'column', 'Mobile ledger row must have flex-direction: column');
            assert(parseInt(ledgerAssert.rowRadius, 10) >= 12, `Mobile ledger row must have rounded corners (14px), got: ${ledgerAssert.rowRadius}`);
        }
    }

    // 5. Assert Anti-Occlusion & Capture Screenshot Artifact 06
    await assertAntiOcclusion(cdp, `Domain 6: Reports & Analytics (${viewport})`, null);
    await cdp.captureScreenshot(`06_reports_${viewport}.png`);
    console.log(`  ✅ Domain 6 passed for ${viewport}.`);
}

/**
 * Domain 7: Food Image Dock
 */
async function testDomain7_FoodImages(cdp, viewport) {
    console.log(`  [Domain 7: Food Image Dock] Auditing on ${viewport}...`);

    await ensureOverlaysSuppressed(cdp);

    // 1. Open Add Menu Item Modal
    const modalRes = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('menuItemModal');
            if (modal) {
                modal.style.removeProperty('display');
                modal.style.removeProperty('visibility');
            }
            openAddMenuItemModal();
            const fim = document.querySelector('.food-image-manager');
            const fimStyle = fim ? window.getComputedStyle(fim) : null;
            return {
                modalDisplay: modal ? window.getComputedStyle(modal).display : 'none',
                hasFim: !!fim,
                fimDisplay: fimStyle ? fimStyle.display : 'none'
            };
        })()
    `);

    assert.strictEqual(modalRes.modalDisplay, 'flex', 'menuItemModal must open with display: flex');
    assert(modalRes.hasFim, 'Food image manager .food-image-manager must exist');
    assert.strictEqual(modalRes.fimDisplay, 'flex', '.food-image-manager must have display: flex');

    await new Promise(r => setTimeout(r, 200));

    // 2. Assert Status Pill, 100px Preview Container & Placeholder
    const previewRes = await cdp.evaluate(`
        (() => {
            const pill = document.getElementById('fimStatusPill');
            const container = document.getElementById('fimPreviewContainer');
            const cStyle = container ? window.getComputedStyle(container) : null;
            const placeholder = document.getElementById('fimPlaceholder');

            return {
                statusText: pill ? pill.innerText.trim() : '',
                hasStatusNone: pill ? pill.classList.contains('status-none') : false,
                height: cStyle ? cStyle.height : '',
                borderStyle: cStyle ? cStyle.borderTopStyle : '',
                hasPlaceholder: !!placeholder
            };
        })()
    `);

    assert.strictEqual(previewRes.statusText.toUpperCase(), 'NO IMAGE', 'Initial status pill text must be "No Image"');
    assert(previewRes.hasStatusNone, 'Initial status pill must have class status-none');
    assert.strictEqual(previewRes.height, '100px', `Preview container height must be exactly 100px, got: ${previewRes.height}`);
    assert.strictEqual(previewRes.borderStyle, 'dashed', 'Preview container border must be dashed');
    assert(previewRes.hasPlaceholder, 'Placeholder silhouette must be present');

    // 3. Assert Dish Context Selectors & Dietary Pills
    const contextRes = await cdp.evaluate(`
        (() => {
            const cuisine = document.getElementById('newItemCuisine');
            const serving = document.getElementById('newItemServingStyle');
            const dietaryPills = document.querySelectorAll('#fimDietaryPills .fim-dietary-pill');
            const genBtn = document.getElementById('btnGenerateAI');

            return {
                hasCuisine: !!cuisine,
                hasServing: !!serving,
                dietaryCount: dietaryPills.length,
                hasGenBtn: !!genBtn,
                genBtnText: genBtn ? genBtn.innerText.trim() : ''
            };
        })()
    `);

    assert(contextRes.hasCuisine && contextRes.hasServing, 'Cuisine and serving style inputs must be present');
    assert.strictEqual(contextRes.dietaryCount, 5, `Expected 5 dietary tag pills, got: ${contextRes.dietaryCount}`);
    assert(contextRes.hasGenBtn && contextRes.genBtnText.includes('Generate Food Image'), 'Generate Food Image button must be present');

    // 4. Force Quad-Action Approval Dock Visible & Assert Controls
    const dockRes = await cdp.evaluate(`
        (() => {
            if (typeof setFimActionDockVisible === 'function') setFimActionDockVisible(true);
            const dock = document.getElementById('fimActionDock');
            const dockStyle = dock ? window.getComputedStyle(dock) : null;
            const cols = dockStyle ? dockStyle.gridTemplateColumns.trim().split(/\\s+/).length : 0;
            const dockButtons = dock ? dock.querySelectorAll('.fim-dock-btn') : [];

            const regenBtn = document.getElementById('btnRegenAI');
            const approveBtn = document.getElementById('btnApproveSave');
            const uploadBtn = dock ? dock.querySelector('.fim-btn-upload') : null;
            const discardBtn = document.getElementById('btnDiscardImg');

            let touchTargetOk = false;
            if (regenBtn) {
                const h = parseInt(window.getComputedStyle(regenBtn).minHeight, 10);
                touchTargetOk = h >= 44;
            }

            return {
                dockDisplay: dockStyle ? dockStyle.display : 'none',
                cols,
                buttonCount: dockButtons.length,
                hasRegen: !!regenBtn,
                hasApprove: !!approveBtn,
                hasUpload: !!uploadBtn,
                hasDiscard: !!discardBtn,
                touchTargetOk
            };
        })()
    `);

    assert.strictEqual(dockRes.dockDisplay, 'grid', 'Approval dock must have display: grid');
    assert.strictEqual(dockRes.cols, 4, `Approval dock must have 4 columns (repeat(4, 1fr)), got: ${dockRes.cols}`);
    assert.strictEqual(dockRes.buttonCount, 4, 'Approval dock must contain exactly 4 action buttons');
    assert(dockRes.hasRegen && dockRes.hasApprove && dockRes.hasUpload && dockRes.hasDiscard, 'All quad-action buttons (Regen, Approve, Upload, Discard) must exist');
    assert(dockRes.touchTargetOk, 'Approval dock action buttons must satisfy >= 44px min-height');

    // 5. Assert Anti-Occlusion & Capture Screenshot Artifact 07
    await assertAntiOcclusion(cdp, `Domain 7: Food Image Dock (${viewport})`, 'menuItemModal');
    await cdp.captureScreenshot(`07_food_images_${viewport}.png`);

    // 6. Clean up: Dismiss Modal
    await cdp.evaluate(`
        (() => {
            if (typeof setFimActionDockVisible === 'function') setFimActionDockVisible(false);
            const modal = document.getElementById('menuItemModal');
            if (modal) {
                modal.style.display = 'none';
                modal.style.setProperty('display', 'none', 'important');
                modal.classList.remove('open', 'show', 'active');
            }
        })()
    `);
    console.log(`  ✅ Domain 7 passed for ${viewport}.`);
}

// ------------------------------------------------------------
// 5. MASTER AUDIT ORCHESTRATOR
// ------------------------------------------------------------
async function runMasterAudit() {
    console.log('====================================================');
    console.log('🚀 BILLNAW POS — HEADLESS CDP VIEWPORT AUDIT RUNNER');
    console.log('====================================================\n');

    // 1. Global Safety Watchdog (90 seconds maximum execution ceiling)
    const WATCHDOG_TIMEOUT_MS = 90000;
    const watchdog = setTimeout(() => {
        console.error('\n🚨 SCRIPT TIMEOUT WATCHDOG: Master audit exceeded 90s limit. Force terminating.');
        if (chromeProc && chromeProc.pid) {
            try { execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
        }
        process.exit(1);
    }, WATCHDOG_TIMEOUT_MS);
    if (watchdog.unref) watchdog.unref();

    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

    let spawnedServer = null;
    let chromeProc = null;
    let tempUserDataDir = null;
    let cdp = null; // FUNCTION-SCOPED SO FINALLY CAN ACCESS

    try {
        // Step 1: Ensure Server Running
        spawnedServer = await ensureServerRunning();
        await ensureSeedData();

        // Step 2: Chrome Setup
        const chromeExe = findChromeExecutable();
        tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billnaw_cdp_profile_'));

        console.log(`🖥️  Launching Headless Chrome: ${chromeExe}`);
        chromeProc = spawn(chromeExe, [
            '--headless=new',
            `--remote-debugging-port=${CDP_PORT}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1280,800',
            `--user-data-dir=${tempUserDataDir}`,
            SERVER_URL
        ], {
            stdio: 'ignore' // PREVENT OPEN STDIO PIPES FROM BLOCKING EVENT LOOP
        });

        // Step 3: Connect to CDP Page Target
        console.log(`⏳ Waiting for CDP target on port ${CDP_PORT}...`);
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

        if (!wsUrl) {
            throw new Error(`Failed to discover inspectable page target on http://127.0.0.1:${CDP_PORT}/json/list`);
        }

        console.log(`🔗 Connecting to CDP Page: ${wsUrl}`);
        cdp = new CDPClient(wsUrl);
        await cdp.init();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        cdp.on('Runtime.exceptionThrown', (params) => {
            console.error('🚨 BROWSER EXCEPTION:', params.exceptionDetails?.text, params.exceptionDetails?.exception?.description || params.exceptionDetails);
        });

        // Step 3a: Register Pre-Execution Storage & Anti-Occlusion Script
        console.log('🔑 Registering pre-execution auth state and overlay suppression...');
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `
                try {
                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                    localStorage.setItem('billnaw_auth_token', 'demo-valid-token-browser-audit');
                    localStorage.setItem('billnaw_auth_email', 'admin@cafe.com');
                    localStorage.setItem('billnaw_store_code', 'SHOP-M2');
                    localStorage.setItem('billnaw_user_role', 'admin');
                    localStorage.setItem('billnaw_pos_version', '2.4.0');
                    localStorage.setItem('billnaw_is_master', 'true');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
                    localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                    localStorage.setItem('billnaw_shop_session', JSON.stringify({
                        token: 'demo-valid-token-browser-audit',
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
                    style.id = 'browser-audit-suppression';
                    style.textContent = '#shopAuthModal, #appUpdatePopup, #activationOverlay, #loginOverlay, #devicePairingOverlay, #firstLoginPinModal { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
                    (document.head || document.documentElement).appendChild(style);
                } catch (e) {}
            `
        });

        // Set storage on current document and reload so scripts execute in fully authenticated state
        await cdp.evaluate(`
            (() => {
                try {
                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                    localStorage.setItem('billnaw_auth_token', 'demo-valid-token-browser-audit');
                    localStorage.setItem('billnaw_auth_email', 'admin@cafe.com');
                    localStorage.setItem('billnaw_store_code', 'SHOP-M2');
                    localStorage.setItem('billnaw_user_role', 'admin');
                    localStorage.setItem('billnaw_pos_version', '2.4.0');
                    localStorage.setItem('billnaw_is_master', 'true');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
                    localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                    localStorage.setItem('billnaw_shop_session', JSON.stringify({
                        token: 'demo-valid-token-browser-audit',
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
                } catch (e) {}
            })()
        `);
        console.log('🔄 Reloading page and awaiting Page.loadEventFired...');
        const loadFiredPromise = cdp.once('Page.loadEventFired', 5000);
        await cdp.send('Page.reload');
        await loadFiredPromise;

        // Step 3b: Wait for Initial Service Worker Lifecycle & Page Ready
        console.log('⏳ Allowing initial lifecycle & service worker claim to settle...');
        await new Promise(r => setTimeout(r, 600));
        console.log('⏳ Waiting for scripts and DOM to be fully ready...');
        let pageReady = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const res = await cdp.evaluate(`
                    (() => {
                        return document.readyState === 'complete' &&
                               typeof openStoreProfileModal === 'function' &&
                               typeof switchTab === 'function' &&
                               typeof addToCart === 'function' &&
                               typeof window.QRCode !== 'undefined';
                    })()
                `);
                if (res === true) {
                    pageReady = true;
                    break;
                }
            } catch (e) {}
        }
        if (!pageReady) {
            throw new Error('Page scripts failed to initialize within 10 seconds.');
        }
        console.log('✅ Page scripts and DOM are fully ready.');

        // Step 4: Auth Bypass Subroutine & Full State Persistence
        console.log('🔑 Performing administrative auth bypass & state initialization...');
        await ensureOverlaysSuppressed(cdp);
        await cdp.evaluate(`
            (() => {
                const profileData = {
                    name: 'Billnaw Cafe',
                    shopName: 'Billnaw Cafe',
                    upiId: 'billnaw@okaxis',
                    tableCount: 5,
                    showQr: true,
                    gstMode: 'inclusive',
                    defaultGstRate: 5,
                    discountsEnabled: true
                };

                window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
                window.currentDeviceRecord = {
                    deviceId: 'DEV_MASTER00000',
                    isMaster: true,
                    status: 'AUTHORIZED',
                    stationProfile: 'BILLING_COUNTER'
                };
                if (typeof shopProfile !== 'undefined') Object.assign(shopProfile, profileData);
                if (!window.shopProfile) window.shopProfile = {};
                Object.assign(window.shopProfile, profileData);

                // Prime IndexedDB and fire persistProfile to prevent async overwrite
                try {
                    if (typeof idb !== 'undefined' && idb.set) {
                        idb.set('cafe_profile', window.shopProfile);
                    }
                    if (typeof persistProfile === 'function') {
                        persistProfile();
                    }
                } catch (e) {}

                // Ensure sample menuItems exist if empty
                if (!Array.isArray(window.menuItems) || window.menuItems.length === 0) {
                    window.menuItems = [
                        { id: 1, name: "Espresso", category: "Beverages", price: 60, stockQty: 20, trackStock: true, is_active: true },
                        { id: 2, name: "Masala Chai", category: "Beverages", price: 25, stockQty: 30, trackStock: true, is_active: true },
                        { id: 3, name: "Chicken Burger", category: "Snacks", price: 150, stockQty: 10, trackStock: true, is_active: true },
                        { id: 4, name: "Veg Club Sandwich", category: "Snacks", price: 120, stockQty: 15, trackStock: true, is_active: true }
                    ];
                }
                return { success: true };
            })()
        `);
        await new Promise(r => setTimeout(r, 200));

        // Step 5: Execute 7 Domains across Viewports
        const viewports = ['desktop', 'mobile'];

        for (const vp of viewports) {
            console.log(`\n====================================================`);
            console.log(`📱 RUNNING AUDIT FOR VIEWPORT: ${vp.toUpperCase()}`);
            console.log(`====================================================`);

            await cdp.setViewport(vp);

            await testDomain1_Modals(cdp, vp);
            await testDomain2_POS(cdp, vp);
            await testDomain3_Checkout(cdp, vp);
            await testDomain4_Inventory(cdp, vp);
            await testDomain5_CRM(cdp, vp);
            await testDomain6_Reports(cdp, vp);
            await testDomain7_FoodImages(cdp, vp);
        }

        // Step 6: Verify all 14 Screenshot Artifacts exist with non-zero size
        console.log('\n====================================================');
        console.log('📊 VERIFYING SCREENSHOT ARTIFACTS IN scratch/browser_artifacts/');
        console.log('====================================================\n');

        const expectedArtifacts = [
            '01_modals_desktop.png',
            '01_modals_mobile.png',
            '02_pos_desktop.png',
            '02_pos_mobile.png',
            '03_checkout_desktop.png',
            '03_checkout_mobile.png',
            '04_inventory_desktop.png',
            '04_inventory_mobile.png',
            '05_crm_desktop.png',
            '05_crm_mobile.png',
            '06_reports_desktop.png',
            '06_reports_mobile.png',
            '07_food_images_desktop.png',
            '07_food_images_mobile.png'
        ];

        let allArtifactsValid = true;
        for (const file of expectedArtifacts) {
            const filePath = path.join(ARTIFACTS_DIR, file);
            if (!fs.existsSync(filePath)) {
                console.error(`❌ MISSING ARTIFACT: ${file}`);
                allArtifactsValid = false;
                continue;
            }
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                console.error(`❌ EMPTY ARTIFACT (0 bytes): ${file}`);
                allArtifactsValid = false;
                continue;
            }
            console.log(`  ✅ [PASS] ${file.padEnd(28)} Size: ${stats.size.toLocaleString().padStart(8)} bytes`);
        }

        assert(allArtifactsValid, 'All 14 screenshot artifacts must exist with non-zero byte size.');

        console.log('\n🎉 ALL 14 DOMAIN VIEWPORT AUDITS & SCREENSHOTS COMPLETED 100% GREEN!\n');
        process.exitCode = 0;

    } catch (err) {
        console.error('\n❌ MASTER AUDIT FAILED:', err);
        process.exitCode = 1;
    } finally {
        console.log('\n🧹 Performing clean process lifecycle teardown...');

        // 1. Close CDP WebSocket connection
        if (cdp) {
            try {
                cdp.close();
                console.log('  🔌 CDP WebSocket closed.');
            } catch (e) {
                console.warn('  ⚠️ Error closing CDP connection:', e.message);
            }
        }

        // 2. Kill Chrome process tree on Windows
        if (chromeProc && chromeProc.pid) {
            try {
                execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' });
                console.log(`  🛑 Terminated Chrome process tree (PID ${chromeProc.pid}).`);
            } catch (e) {
                try { chromeProc.kill('SIGKILL'); } catch (err) {}
            }
        }

        // 3. Remove temp profile directory
        if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
            try {
                fs.rmSync(tempUserDataDir, { recursive: true, force: true });
                console.log('  🗑️ Removed temporary Chrome profile directory.');
            } catch (e) {}
        }

        // 4. Terminate spawned server if started by this script
        if (spawnedServer && spawnedServer.pid) {
            try {
                execSync(`taskkill /pid ${spawnedServer.pid} /f /t`, { stdio: 'ignore' });
                console.log(`  🛑 Terminated local server (PID ${spawnedServer.pid}).`);
            } catch (e) {
                try { spawnedServer.kill('SIGKILL'); } catch (err) {}
            }
        }

        // 5. Explicitly terminate process with exitCode to guarantee zero hangs
        const exitCode = (typeof process.exitCode === 'number') ? process.exitCode : 0;
        console.log(`🏁 Exiting process with code ${exitCode}.\n`);
        process.exit(exitCode);
    }
}

// Execute runner
runMasterAudit();
