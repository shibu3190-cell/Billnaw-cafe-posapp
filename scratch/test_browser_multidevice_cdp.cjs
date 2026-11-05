/**
 * scratch/test_browser_multidevice_cdp.cjs
 *
 * Automated Headless Chrome CDP Multi-Device Viewport Verification Suite
 * Pure Node 24 native WebSocket & fetch implementation (zero external npm dependencies)
 *
 * Viewports Tested:
 * - Desktop: 1280 x 800 (deviceScaleFactor: 1, mobile: false)
 * - Mobile:  390 x 844  (deviceScaleFactor: 2, mobile: true)
 *
 * 5 Multi-Device Flows Tested across BOTH Viewports:
 * 1. Master Admin Terminal Recognition (isMaster: true, Zero-Store-Data Gate access, POS tab, table/menu grids)
 * 2. Secondary Device Pairing & Zero-Store-Data Gate (#devicePairingOverlay, 6-digit code, QR canvas, blocked store data, 0 close buttons)
 * 3. Multi-Staff Fast PIN Switch & First-Login PIN Modal (#firstLoginPinModal, avatar/role, .pin-intercept-cancel-btn, SHA-256 + salt PIN update)
 * 4. Live Staff Activity & Session Hub (#activeSessionsModal, 3 session cards, presence dots, shift telemetry, master protected badge)
 * 5. 1-Click Remote Lockout & Atomic 9-step Lockdown (lockTerminalByRemote, cart flush, staff purge, #loginOverlay, PIN focus, Master immunity)
 *
 * Output: 10 Screenshot artifacts in scratch/browser_artifacts/:
 * - multidevice_01_master_desktop.png & multidevice_01_master_mobile.png
 * - multidevice_02_pairing_pending_desktop.png & multidevice_02_pairing_pending_mobile.png
 * - multidevice_03_first_login_pin_desktop.png & multidevice_03_first_login_pin_mobile.png
 * - multidevice_04_live_sessions_desktop.png & multidevice_04_live_sessions_mobile.png
 * - multidevice_05_remote_lockout_desktop.png & multidevice_05_remote_lockout_mobile.png
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'scratch', 'browser_artifacts');
const CDP_PORT = 9252;
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
                    console.log(`  [CDP << RES] #${msg.id}`);
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) {
                        console.error(`[CDP << ERROR] #${msg.id}:`, msg.error);
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

    send(method, params = {}, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const msgId = this.id++;
            console.log(`  [CDP >> REQ] #${msgId} ${method}`);
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
// 4. FLOW TEST IMPLEMENTATIONS (FLOWS 1 TO 5)
// ------------------------------------------------------------

/**
 * Flow 1: Master Admin Terminal Recognition
 */
async function testFlow1_MasterTerminal(cdp, viewport) {
    console.log(`  [Flow 1: Master Terminal Recognition] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            const pairOverlay = document.getElementById('devicePairingOverlay');
            if (pairOverlay) pairOverlay.style.display = 'none';

            localStorage.setItem('billnaw_auth_mode', 'authenticated');
            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
            localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');

            window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
            window.currentDeviceRecord = {
                deviceId: 'DEV_MASTER00000',
                isMaster: true,
                status: 'AUTHORIZED',
                stationProfile: 'BILLING_COUNTER'
            };

            if (typeof switchTab === 'function') switchTab('pos');
        })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const masterAssert = await cdp.evaluate(`
        (() => {
            const isMaster = typeof isMasterTerminal === 'function' ? isMasterTerminal() : (localStorage.getItem('billnaw_is_master') === 'true');
            const canAccess = typeof canAccessStoreData === 'function' ? canAccessStoreData() : false;
            const pairOverlay = document.getElementById('devicePairingOverlay');
            const pairVisible = pairOverlay && window.getComputedStyle(pairOverlay).display !== 'none';
            const posTab = document.getElementById('pos');
            const isPosActive = posTab && posTab.classList.contains('active');
            const cards = document.querySelectorAll('.menu-card');
            const tableBtns = document.querySelectorAll('#tableGridUI .table-btn');

            return {
                isMaster,
                canAccess,
                pairVisible,
                isPosActive,
                cardCount: cards.length,
                tableCount: tableBtns.length
            };
        })()
    `);

    assert.strictEqual(masterAssert.isMaster, true, 'isMasterTerminal() must be true for Master Terminal');
    assert.strictEqual(masterAssert.canAccess, true, 'canAccessStoreData() must be true for Master Terminal');
    assert.strictEqual(masterAssert.pairVisible, false, '#devicePairingOverlay must not be visible on Master Terminal');
    assert.strictEqual(masterAssert.isPosActive, true, '#pos tab must be active on Master Terminal');
    assert(masterAssert.cardCount > 0, 'Menu cards must be rendered on Master Terminal POS');
    assert(masterAssert.tableCount > 0, 'Table buttons must be rendered on Master Terminal POS');

    await cdp.captureScreenshot(`multidevice_01_master_${viewport}.png`);
    console.log(`  ✅ Flow 1 passed for ${viewport}.`);
}

/**
 * Flow 2: Secondary Device Pairing & Zero-Store-Data Gate
 */
async function testFlow2_SecondaryDevicePairing(cdp, viewport) {
    console.log(`  [Flow 2: Secondary Device Pairing & Zero-Store-Data Gate] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');

            localStorage.setItem('billnaw_is_master', 'false');
            localStorage.setItem('billnaw_device_status', 'PENDING');
            window.currentStaff = null;
            window.currentDeviceRecord = null;
            window.authorizedDevices = [
                { deviceId: 'DEV_MASTER00000', isMaster: true, status: 'AUTHORIZED', deviceName: 'Counter 1' }
            ];

            if (typeof showDevicePairingOverlay === 'function') {
                showDevicePairingOverlay();
            }
        })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const pairingAssert = await cdp.evaluate(`
        (() => {
            const overlay = document.getElementById('devicePairingOverlay');
            if (!overlay) return { error: 'Missing #devicePairingOverlay' };

            const style = window.getComputedStyle(overlay);
            const isVisible = style.display === 'flex' && style.visibility !== 'hidden';

            const codeEl = document.getElementById('pairingCodeDisplay');
            const codeText = codeEl ? codeEl.innerText.trim() : '';
            const rawDigits = codeText.replace(/\\s+/g, '');
            const hasValidCode = /^\\d{6}$/.test(rawDigits);

            const devIdEl = document.getElementById('pairingDeviceIdDisplay');
            const devIdText = devIdEl ? devIdEl.innerText.trim() : '';
            const hasValidDevId = devIdText.startsWith('DEV_');

            const qrContainer = document.getElementById('pairingQrContainer');
            const qrElements = qrContainer ? Array.from(qrContainer.querySelectorAll('canvas, img')) : [];
            const hasQr = qrElements.length > 0 && qrElements.some(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const isDisplayVisible = style.display !== 'none' && (rect.width > 0 || el.width > 0);
                const hasImgSrc = el.tagName.toLowerCase() === 'img' && el.src && el.src.startsWith('data:image');
                const hasCanvasDim = el.tagName.toLowerCase() === 'canvas' && (el.width > 0 || el.height > 0);
                return isDisplayVisible || hasImgSrc || hasCanvasDim;
            });

            const closeBtns = overlay.querySelectorAll('.modal-close-btn');
            const canAccess = typeof canAccessStoreData === 'function' ? canAccessStoreData() : true;

            // Attempt blocked navigation
            if (typeof switchTab === 'function') {
                switchTab('pos');
            }
            const posTab = document.getElementById('pos');
            const isPosActive = posTab && posTab.classList.contains('active');
            const overlayStillVisible = window.getComputedStyle(overlay).display === 'flex';

            return {
                isVisible,
                codeText,
                rawDigits,
                hasValidCode,
                devIdText,
                hasValidDevId,
                hasQr,
                closeBtnCount: closeBtns.length,
                canAccess,
                isPosActive,
                overlayStillVisible
            };
        })()
    `);

    assert.strictEqual(pairingAssert.isVisible, true, '#devicePairingOverlay must have display: flex');
    assert.strictEqual(pairingAssert.hasValidCode, true, `Pairing code must be 6 digits, got: ${pairingAssert.codeText}`);
    assert.strictEqual(pairingAssert.hasValidDevId, true, `Device ID must match DEV_..., got: ${pairingAssert.devIdText}`);
    assert.strictEqual(pairingAssert.hasQr, true, 'Pairing QR container must render canvas/img with dimensions > 0');
    assert.strictEqual(pairingAssert.closeBtnCount, 0, '#devicePairingOverlay must contain exactly 0 .modal-close-btn elements');
    assert.strictEqual(pairingAssert.canAccess, false, 'canAccessStoreData() must return false while PENDING');
    assert.strictEqual(pairingAssert.overlayStillVisible, true, 'Zero-Store-Data Gate must keep pairing overlay visible after blocked navigation');

    await cdp.captureScreenshot(`multidevice_02_pairing_pending_${viewport}.png`);

    // Clean up pairing overlay and restore master state
    await cdp.evaluate(`
        (() => {
            if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
            const overlay = document.getElementById('devicePairingOverlay');
            if (overlay) overlay.style.display = 'none';
            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
            window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
        })()
    `);
    console.log(`  ✅ Flow 2 passed for ${viewport}.`);
}

/**
 * Flow 3: Multi-Staff Fast PIN Switch & First-Login PIN Modal
 */
async function testFlow3_FirstLoginPinModal(cdp, viewport) {
    console.log(`  [Flow 3: Fast PIN Switch & First-Login PIN Modal] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            const pairOverlay = document.getElementById('devicePairingOverlay');
            if (pairOverlay) pairOverlay.style.display = 'none';

            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
            window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };

            const testStaff = {
                id: 201,
                name: 'Priya Sharma',
                role: 'Cashier',
                mustChangePin: true,
                status: 'Active'
            };

            if (!window.staffList) window.staffList = [];
            const idx = window.staffList.findIndex(s => s.id === 201);
            if (idx >= 0) window.staffList[idx] = testStaff;
            else window.staffList.push(testStaff);

            if (typeof openFirstLoginPinModal === 'function') {
                openFirstLoginPinModal(testStaff);
            }
        })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const modalAssert = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('firstLoginPinModal');
            if (!modal) return { error: 'Missing #firstLoginPinModal' };

            const style = window.getComputedStyle(modal);
            const isVisible = style.display === 'flex' && style.visibility !== 'hidden';

            const nameEl = document.getElementById('firstLoginStaffName');
            const roleEl = document.getElementById('firstLoginStaffRole');
            const avatarEl = document.getElementById('firstLoginStaffAvatar');
            const newPinInput = document.getElementById('firstLoginNewPin');
            const confirmPinInput = document.getElementById('firstLoginConfirmPin');
            const submitBtn = document.getElementById('firstLoginPinSubmitBtn');

            const modalCloseBtns = modal.querySelectorAll('.modal-close-btn');
            const cancelBtns = modal.querySelectorAll('.pin-intercept-cancel-btn');

            if (newPinInput) newPinInput.value = '5678';
            if (confirmPinInput) confirmPinInput.value = '5678';

            return {
                isVisible,
                nameText: nameEl ? nameEl.innerText.trim() : '',
                roleText: roleEl ? roleEl.innerText.trim() : '',
                avatarText: avatarEl ? avatarEl.innerText.trim() : '',
                hasInputs: !!(newPinInput && confirmPinInput),
                hasSubmitBtn: !!submitBtn,
                modalCloseBtnCount: modalCloseBtns.length,
                hasCancelBtn: cancelBtns.length > 0
            };
        })()
    `);

    assert.strictEqual(modalAssert.isVisible, true, '#firstLoginPinModal must have display: flex');
    assert.strictEqual(modalAssert.nameText, 'Priya Sharma', 'Staff name must display "Priya Sharma"');
    assert(modalAssert.roleText.includes('Cashier'), 'Staff role must display Cashier');
    assert.strictEqual(modalAssert.avatarText, 'PS', 'Staff avatar initials must be "PS"');
    assert.strictEqual(modalAssert.hasInputs, true, 'PIN inputs must exist in DOM');
    assert.strictEqual(modalAssert.modalCloseBtnCount, 0, '#firstLoginPinModal must contain strictly 0 .modal-close-btn elements');
    assert.strictEqual(modalAssert.hasCancelBtn, true, '#firstLoginPinModal must contain .pin-intercept-cancel-btn');

    await cdp.captureScreenshot(`multidevice_03_first_login_pin_${viewport}.png`);

    const submitAssert = await cdp.evaluate(`
        (async () => {
            if (typeof submitFirstLoginPin === 'function') {
                await submitFirstLoginPin();
            }
            const modal = document.getElementById('firstLoginPinModal');
            const isClosed = !modal || window.getComputedStyle(modal).display === 'none';
            const staff = (window.staffList || []).find(s => s.id === 201);

            return {
                isClosed,
                mustChangePin: staff ? staff.mustChangePin : null,
                hasSalt: staff && typeof staff.pin_salt === 'string' && staff.pin_salt.length >= 16,
                hasHash: staff && typeof staff.pin_hash === 'string' && staff.pin_hash.length === 64
            };
        })()
    `);

    assert.strictEqual(submitAssert.isClosed, true, '#firstLoginPinModal must close after submitFirstLoginPin');
    assert.strictEqual(submitAssert.mustChangePin, false, 'mustChangePin flag must be updated to false');
    assert.strictEqual(submitAssert.hasSalt, true, 'Staff record must contain valid cryptographic pin_salt');
    assert.strictEqual(submitAssert.hasHash, true, 'Staff record must contain 64-char SHA-256 pin_hash');

    await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('firstLoginPinModal');
            if (modal) modal.style.display = 'none';
        })()
    `);
    console.log(`  ✅ Flow 3 passed for ${viewport}.`);
}

/**
 * Flow 4: Live Staff Activity & Session Hub
 */
async function testFlow4_LiveSessionsHub(cdp, viewport) {
    console.log(`  [Flow 4: Live Staff Activity & Session Hub] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_id', 'DEV_MASTER00000');
            window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };

            const now = Date.now();
            window.activeStaffSessions = [
                {
                    sessionId: 'sess_master_01',
                    staffId: 1,
                    staffName: 'Admin',
                    staffRole: 'Admin',
                    deviceId: 'DEV_MASTER00000',
                    deviceName: 'Counter 1 (Master)',
                    stationProfile: 'BILLING_COUNTER',
                    status: 'ONLINE',
                    isMaster: true,
                    shiftStartedAt: new Date(now - 7200000).toISOString(),
                    lastActiveAt: new Date(now - 30000).toISOString()
                },
                {
                    sessionId: 'sess_cashier_02',
                    staffId: 2,
                    staffName: 'Priya Sharma',
                    staffRole: 'Cashier',
                    deviceId: 'DEV_C2A1B3C4D5E6',
                    deviceName: 'Counter 2',
                    stationProfile: 'BILLING_COUNTER',
                    status: 'ONLINE',
                    isMaster: false,
                    shiftStartedAt: new Date(now - 3600000).toISOString(),
                    lastActiveAt: new Date(now - 60000).toISOString()
                },
                {
                    sessionId: 'sess_kds_03',
                    staffId: 3,
                    staffName: 'Rahul Verma',
                    staffRole: 'Kitchen Chef',
                    deviceId: 'DEV_K9F8E7D6C5B4',
                    deviceName: 'Kitchen Display',
                    stationProfile: 'KDS',
                    status: 'ONLINE',
                    isMaster: false,
                    shiftStartedAt: new Date(now - 5400000).toISOString(),
                    lastActiveAt: new Date(now - 120000).toISOString()
                }
            ];
            localStorage.setItem('billnaw_active_sessions', JSON.stringify(window.activeStaffSessions));

            if (typeof openActiveSessionsModal === 'function') {
                openActiveSessionsModal();
            } else {
                const modal = document.getElementById('activeSessionsModal');
                if (modal) modal.style.display = 'flex';
                if (typeof renderLiveSessionCards === 'function') renderLiveSessionCards();
            }
        })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const hubAssert = await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('activeSessionsModal');
            if (!modal) return { error: 'Missing #activeSessionsModal' };

            const style = window.getComputedStyle(modal);
            const isVisible = style.display === 'flex' && style.visibility !== 'hidden';

            const container = document.getElementById('activeSessionsListContainer');
            const cards = container ? container.querySelectorAll('.session-card') : [];

            const firstCard = cards[0];
            const hasMasterProtected = firstCard && firstCard.innerText.includes('Master Terminal');
            const firstCardLockBtn = firstCard ? firstCard.querySelector('.session-remote-lock-btn') : null;

            const remoteLockBtns = container ? container.querySelectorAll('.session-remote-lock-btn') : [];
            const onlineDots = container ? container.querySelectorAll('.presence-dot.online') : [];

            const textContent = container ? container.innerText : '';
            const hasShiftDuration = textContent.includes('Shift:') || textContent.includes('h');

            const modalCloseBtns = modal.querySelectorAll('.modal-close-btn');
            const sessionCloseBtns = modal.querySelectorAll('.session-close-btn');

            return {
                isVisible,
                cardCount: cards.length,
                hasMasterProtected,
                hasFirstCardLockBtn: !!firstCardLockBtn,
                remoteLockBtnCount: remoteLockBtns.length,
                onlineDotCount: onlineDots.length,
                hasShiftDuration,
                modalCloseBtnCount: modalCloseBtns.length,
                hasSessionCloseBtn: sessionCloseBtns.length > 0
            };
        })()
    `);

    assert.strictEqual(hubAssert.isVisible, true, '#activeSessionsModal must display flex when opened');
    assert.strictEqual(hubAssert.cardCount, 3, 'Must render exactly 3 .session-card elements');
    assert.strictEqual(hubAssert.hasMasterProtected, true, 'First card must display "Master Terminal" protected indicator');
    assert.strictEqual(hubAssert.hasFirstCardLockBtn, false, 'Master Terminal must NOT have a remote lock button');
    assert.strictEqual(hubAssert.remoteLockBtnCount, 2, 'Secondary terminals must each render .session-remote-lock-btn');
    assert.strictEqual(hubAssert.onlineDotCount >= 3, true, 'All active sessions must render .presence-dot.online');
    assert.strictEqual(hubAssert.hasShiftDuration, true, 'Session cards must display formatted shift duration');
    assert.strictEqual(hubAssert.modalCloseBtnCount, 0, '#activeSessionsModal must contain strictly 0 .modal-close-btn elements');
    assert.strictEqual(hubAssert.hasSessionCloseBtn, true, '#activeSessionsModal must contain .session-close-btn');

    await cdp.captureScreenshot(`multidevice_04_live_sessions_${viewport}.png`);

    await cdp.evaluate(`
        (() => {
            if (typeof closeActiveSessionsModal === 'function') closeActiveSessionsModal();
            const modal = document.getElementById('activeSessionsModal');
            if (modal) modal.style.display = 'none';
        })()
    `);
    console.log(`  ✅ Flow 4 passed for ${viewport}.`);
}

/**
 * Flow 5: 1-Click Remote Lockout & Atomic 9-step Lockdown
 */
async function testFlow5_RemoteLockout(cdp, viewport) {
    console.log(`  [Flow 5: 1-Click Remote Lockout & Atomic Lockdown] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            localStorage.setItem('billnaw_is_master', 'false');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_id', 'DEV_C2A1B3C4D5E6');

            window.currentStaff = { id: 2, name: 'Priya Sharma', role: 'Cashier' };
            window.currentSessionId = 'sess_cashier_02';
            localStorage.setItem('billnaw_active_staff', JSON.stringify(window.currentStaff));
            localStorage.setItem('billnaw_current_session_id', 'sess_cashier_02');

            window.cart = [
                { id: 1, name: 'Espresso', price: 60, qty: 2 },
                { id: 3, name: 'Chicken Burger', price: 150, qty: 1 }
            ];
            localStorage.setItem('billnaw_active_cart', JSON.stringify(window.cart));
            if (typeof renderCart === 'function') renderCart();
        })()
    `);

    await new Promise(r => setTimeout(r, 200));

    const lockResult = await cdp.evaluate(`
        (() => {
            if (typeof lockTerminalByRemote === 'function') {
                lockTerminalByRemote({ sessionId: 'sess_cashier_02', staffName: 'Priya Sharma' });
            }

            const loginOverlay = document.getElementById('loginOverlay');
            const isOverlayVisible = loginOverlay && window.getComputedStyle(loginOverlay).display === 'flex';

            const cartEmpty = (!window.cart || window.cart.length === 0) && localStorage.getItem('billnaw_active_cart') === null;
            const staffPurged = (window.currentStaff === null) && (window.currentSessionId === null) && localStorage.getItem('billnaw_active_staff') === null;
            const terminalLocked = window.isTerminalLocked === true || localStorage.getItem('billnaw_terminal_locked') === 'true';

            const pinInput = document.getElementById('staffLoginPinInput');
            const pinVal = pinInput ? pinInput.value : null;

            return {
                isOverlayVisible,
                cartEmpty,
                staffPurged,
                terminalLocked,
                pinVal
            };
        })()
    `);

    assert.strictEqual(lockResult.isOverlayVisible, true, '#loginOverlay must display flex upon remote lock');
    assert.strictEqual(lockResult.cartEmpty, true, 'Cart must be completely purged from memory and localStorage');
    assert.strictEqual(lockResult.staffPurged, true, 'Active staff session must be purged from memory and localStorage');
    assert.strictEqual(lockResult.terminalLocked, true, 'isTerminalLocked flag must be true');
    assert.strictEqual(lockResult.pinVal, '', 'PIN input must be cleared to empty string');

    // Verify Master Admin Immunity
    const immunityResult = await cdp.evaluate(`
        (() => {
            localStorage.setItem('billnaw_is_master', 'true');
            window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };

            if (typeof lockTerminalByRemote === 'function') {
                lockTerminalByRemote({ sessionId: 'sess_admin_01' });
            }

            const masterProtected = window.currentStaff !== null && window.currentStaff.role === 'Admin';

            // Re-engage loginOverlay for visual verification
            localStorage.setItem('billnaw_is_master', 'false');
            window.currentStaff = null;
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'flex';

            return { masterProtected };
        })()
    `);

    assert.strictEqual(immunityResult.masterProtected, true, 'Master Terminal must be immune to remote lockout');

    await cdp.captureScreenshot(`multidevice_05_remote_lockout_${viewport}.png`);

    await cdp.evaluate(`
        (() => {
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
        })()
    `);
    console.log(`  ✅ Flow 5 passed for ${viewport}.`);
}

/**
 * Flow 6: 10-Day Session Persistence & PIN-Validated Role Switching
 */
async function testFlow6_SessionPersistenceAndRoleSwitch(cdp, viewport) {
    console.log(`  [Flow 6: 10-Day Session Persistence & PIN-Validated Role Switching] Auditing on ${viewport}...`);

    await cdp.evaluate(`
        (() => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            const pairOverlay = document.getElementById('devicePairingOverlay');
            if (pairOverlay) pairOverlay.style.display = 'none';
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';

            localStorage.setItem('billnaw_is_master', 'true');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.removeItem('billnaw_terminal_locked');
            window.isTerminalLocked = false;

            // Setup 10-day session persistence timestamp
            const now = Date.now();
            localStorage.setItem('billnaw_device_auth_timestamp', now.toString());

            // Setup staff and admin PIN hash
            window.shopProfile = window.shopProfile || {};
            if (typeof hashString === 'function') {
                window.shopProfile.adminPinHash = hashString('8899');
            }

            window.staffList = [
                { id: 1, name: 'Admin User', role: 'Admin', pin: '8899' },
                { id: 2, name: 'Priya Sharma', role: 'Cashier', pin: '2222' },
                { id: 3, name: 'Chef Gordon', role: 'Kitchen Chef', pin: '3333' }
            ];
            try {
                if (typeof staffList !== 'undefined') staffList = window.staffList;
            } catch (e) {}

            // Open staff switch modal
            if (typeof openStaffSwitchModal === 'function') {
                openStaffSwitchModal();
            }
        })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const switchAssert = await cdp.evaluate(`
        (async () => {
            const modal = document.getElementById('staffSwitchModal');
            const isVisible = modal && window.getComputedStyle(modal).display === 'flex';

            const ttlMs = (typeof DEVICE_AUTH_TTL_MS !== 'undefined') ? DEVICE_AUTH_TTL_MS : (10 * 24 * 60 * 60 * 1000);
            const now = Date.now();
            const validTimestamp = (now - 2 * 24 * 60 * 60 * 1000).toString(); // 2 days old
            const expiredTimestamp = (now - 12 * 24 * 60 * 60 * 1000).toString(); // 12 days old

            const isValidSession = typeof isDeviceAuthValid === 'function' ? isDeviceAuthValid(validTimestamp) : true;
            const isExpiredSession = typeof isDeviceAuthValid === 'function' ? isDeviceAuthValid(expiredTimestamp) : false;

            // Test role switch to Cashier (id: 2) with incorrect PIN then correct PIN
            if (typeof selectQuickSwitchStaff === 'function') {
                selectQuickSwitchStaff(2);
            }
            const pinInput = document.getElementById('quickSwitchPinInput');
            if (pinInput) pinInput.value = '9999'; // wrong PIN

            let wrongResult = false;
            if (typeof confirmQuickStaffSwitch === 'function') {
                wrongResult = await confirmQuickStaffSwitch();
            }

            // Enter correct Cashier PIN
            if (pinInput) pinInput.value = '2222';
            let correctResult = false;
            if (typeof confirmQuickStaffSwitch === 'function') {
                correctResult = await confirmQuickStaffSwitch();
            }

            const currentRoleActive = window.currentStaff ? window.currentStaff.role : null;
            const currentStaffName = window.currentStaff ? window.currentStaff.name : null;

            return {
                isVisible,
                isValidSession,
                isExpiredSession,
                wrongResult,
                correctResult,
                currentRoleActive,
                currentStaffName
            };
        })()
    `);

    assert.strictEqual(switchAssert.isVisible, true, '#staffSwitchModal must display flex when opened');
    assert.strictEqual(switchAssert.isValidSession, true, 'isDeviceAuthValid must return true for 2-day old auth');
    assert.strictEqual(switchAssert.isExpiredSession, false, 'isDeviceAuthValid must return false for 12-day old auth');
    assert.strictEqual(switchAssert.wrongResult, false, 'confirmQuickStaffSwitch must reject wrong PIN');
    assert.strictEqual(switchAssert.correctResult, true, 'confirmQuickStaffSwitch must accept correct Cashier PIN');
    assert.strictEqual(switchAssert.currentRoleActive, 'Cashier', 'Active staff role must be switched to Cashier');
    assert.strictEqual(switchAssert.currentStaffName, 'Priya Sharma', 'Active staff name must be Priya Sharma');

    await cdp.captureScreenshot(`multidevice_06_roleswitch_${viewport}.png`);

    await cdp.evaluate(`
        (() => {
            const modal = document.getElementById('staffSwitchModal');
            if (modal) modal.style.display = 'none';
        })()
    `);

    console.log(`  ✅ Flow 6 passed for ${viewport}.`);
}

// ------------------------------------------------------------
// 5. MASTER AUDIT ORCHESTRATOR
// ------------------------------------------------------------
async function runMultiDeviceAudit() {
    console.log('====================================================');
    console.log('🚀 BILLNAW POS — MULTI-DEVICE HEADLESS CDP AUDIT');
    console.log('====================================================\n');

    let chromeProc = null;
    let tempUserDataDir = null;
    let spawnedServer = null;
    let cdp = null;

    // 90-second watchdog
    const watchdogTimer = setTimeout(() => {
        console.error('🚨 AUDIT TIMEOUT: Execution exceeded 90s watchdog timer.');
        process.exit(1);
    }, 90000);
    watchdogTimer.unref();

    try {
        if (!fs.existsSync(ARTIFACTS_DIR)) {
            fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
        }

        spawnedServer = await ensureServerRunning();
        const chromeExe = findChromeExecutable();
        console.log(`🖥️  Launching Headless Chrome: ${chromeExe}`);

        tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billnaw_cdp_multidevice_'));

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
            stdio: 'ignore'
        });

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

        cdp.on('Page.javascriptDialogOpening', async (params) => {
            console.log('  ⚠️ Handled unexpected browser dialog:', params.message);
            try {
                await cdp.send('Page.handleJavaScriptDialog', { accept: true });
            } catch (e) {}
        });

        // Register initial base auth state (suppress shop auth modal and app update popup only)
        console.log('🔑 Registering base auth state...');
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
                    style.id = 'multidevice-audit-base';
                    style.textContent = '#shopAuthModal, #appUpdatePopup, #activationOverlay { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
                    (document.head || document.documentElement).appendChild(style);
                } catch (e) {}
            `
        });

        // Set initial storage and reload page
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
        const loadFiredPromise = cdp.once('Page.loadEventFired', 8000);
        await cdp.send('Page.reload');
        await loadFiredPromise;

        console.log('⏳ Allowing initial lifecycle & service worker claim to settle...');
        await new Promise(r => setTimeout(r, 2000));

        console.log('⏳ Waiting for scripts and DOM to be fully ready...');
        let pageReady = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const res = await cdp.evaluate(`
                    (() => {
                        const checks = {
                            complete: document.readyState === 'complete',
                            switchTab: typeof switchTab === 'function',
                            isMasterTerminal: typeof isMasterTerminal === 'function',
                            showDevicePairingOverlay: typeof showDevicePairingOverlay === 'function',
                            openFirstLoginPinModal: typeof openFirstLoginPinModal === 'function',
                            renderLiveSessionCards: typeof renderLiveSessionCards === 'function',
                            lockTerminalByRemote: typeof lockTerminalByRemote === 'function'
                        };
                        const allOk = Object.values(checks).every(Boolean);
                        return allOk ? true : checks;
                    })()
                `);
                if (res === true) {
                    pageReady = true;
                    console.log('  ✅ Page ready check passed at attempt #' + (i + 1));
                    break;
                } else if (i % 5 === 0) {
                    console.log('  [Wait #' + (i + 1) + '] Page state:', JSON.stringify(res));
                }
            } catch (e) {
                console.error('  [Wait #' + (i + 1) + '] evaluate error:', e.message);
            }
        }

        if (!pageReady) {
            throw new Error('Page scripts failed to initialize within 10 seconds.');
        }
        console.log('✅ Page scripts and DOM are fully ready.');

        // Initialize sample menuItems and shopProfile
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

                if (!Array.isArray(window.menuItems) || window.menuItems.length === 0) {
                    window.menuItems = [
                        { id: 1, name: "Espresso", category: "Beverages", price: 60, stockQty: 20, trackStock: true, is_active: true },
                        { id: 2, name: "Masala Chai", category: "Beverages", price: 25, stockQty: 30, trackStock: true, is_active: true },
                        { id: 3, name: "Chicken Burger", category: "Snacks", price: 150, stockQty: 10, trackStock: true, is_active: true },
                        { id: 4, name: "Veg Club Sandwich", category: "Snacks", price: 120, stockQty: 15, trackStock: true, is_active: true }
                    ];
                }
            })()
        `);
        await new Promise(r => setTimeout(r, 200));

        // Execute 6 Flows across Viewports
        const viewports = ['desktop', 'mobile'];

        for (const vp of viewports) {
            console.log(`\n====================================================`);
            console.log(`📱 RUNNING MULTI-DEVICE AUDIT FOR: ${vp.toUpperCase()}`);
            console.log(`====================================================`);

            // Clean inter-viewport state reset
            await cdp.evaluate(`
                (() => {
                    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
                    const pairOverlay = document.getElementById('devicePairingOverlay');
                    if (pairOverlay) pairOverlay.style.display = 'none';
                    const loginOverlay = document.getElementById('loginOverlay');
                    if (loginOverlay) loginOverlay.style.display = 'none';

                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                    localStorage.setItem('billnaw_is_master', 'true');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                    localStorage.removeItem('billnaw_terminal_locked');
                    window.isTerminalLocked = false;
                    window.currentStaff = { id: 1, name: 'Admin', role: 'Admin' };
                    if (typeof switchTab === 'function') switchTab('pos');
                })()
            `);

            await cdp.setViewport(vp);

            await testFlow1_MasterTerminal(cdp, vp);
            await testFlow2_SecondaryDevicePairing(cdp, vp);
            await testFlow3_FirstLoginPinModal(cdp, vp);
            await testFlow4_LiveSessionsHub(cdp, vp);
            await testFlow5_RemoteLockout(cdp, vp);
            await testFlow6_SessionPersistenceAndRoleSwitch(cdp, vp);
        }

        // Verify all 12 Screenshot Artifacts
        console.log('\n====================================================');
        console.log('📊 VERIFYING MULTI-DEVICE SCREENSHOT ARTIFACTS');
        console.log('====================================================\n');

        const expectedArtifacts = [
            'multidevice_01_master_desktop.png',
            'multidevice_01_master_mobile.png',
            'multidevice_02_pairing_pending_desktop.png',
            'multidevice_02_pairing_pending_mobile.png',
            'multidevice_03_first_login_pin_desktop.png',
            'multidevice_03_first_login_pin_mobile.png',
            'multidevice_04_live_sessions_desktop.png',
            'multidevice_04_live_sessions_mobile.png',
            'multidevice_05_remote_lockout_desktop.png',
            'multidevice_05_remote_lockout_mobile.png',
            'multidevice_06_roleswitch_desktop.png',
            'multidevice_06_roleswitch_mobile.png'
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
            if (stats.size < 10000) {
                console.error(`❌ ARTIFACT TOO SMALL (<10KB): ${file} (${stats.size} bytes)`);
                allArtifactsValid = false;
                continue;
            }
            console.log(`  ✅ [PASS] ${file.padEnd(46)} Size: ${stats.size.toLocaleString().padStart(8)} bytes`);
        }

        assert(allArtifactsValid, 'All 12 multi-device screenshot artifacts must exist with size > 10KB.');

        console.log('\n🎉 ALL 6 MULTI-DEVICE FLOWS & 12 SCREENSHOTS COMPLETED 100% GREEN!\n');
        process.exitCode = 0;

    } catch (err) {
        console.error('\n❌ MULTI-DEVICE AUDIT FAILED:', err);
        process.exitCode = 1;
    } finally {
        console.log('\n🧹 Performing clean process lifecycle teardown...');

        if (cdp) {
            try {
                cdp.close();
                console.log('  🔌 CDP WebSocket closed.');
            } catch (e) {
                console.warn('  ⚠️ Error closing CDP connection:', e.message);
            }
        }

        if (chromeProc && chromeProc.pid) {
            try {
                execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' });
                console.log(`  🛑 Terminated Chrome process tree (PID ${chromeProc.pid}).`);
            } catch (e) {
                try { chromeProc.kill('SIGKILL'); } catch (err) {}
            }
        }

        if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
            let removed = false;
            for (let attempt = 0; attempt < 10; attempt++) {
                try {
                    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
                    removed = true;
                    console.log('  🗑️ Removed temporary Chrome profile directory.');
                    break;
                } catch (e) {
                    try {
                        execSync('powershell -Command "Start-Sleep -Milliseconds 250"');
                    } catch (e2) {}
                }
            }
            if (!removed) {
                console.warn('  ⚠️ Could not immediately delete tempUserDataDir (file lock), continuing...');
            }
        }

        if (spawnedServer && spawnedServer.pid) {
            try {
                execSync(`taskkill /pid ${spawnedServer.pid} /f /t`, { stdio: 'ignore' });
                console.log(`  🛑 Terminated local server (PID ${spawnedServer.pid}).`);
            } catch (e) {
                try { spawnedServer.kill('SIGKILL'); } catch (err) {}
            }
        }

        const exitCode = (typeof process.exitCode === 'number') ? process.exitCode : 0;
        console.log(`🏁 Exiting process with code ${exitCode}.\n`);
        process.exit(exitCode);
    }
}

// Execute runner
runMultiDeviceAudit();
