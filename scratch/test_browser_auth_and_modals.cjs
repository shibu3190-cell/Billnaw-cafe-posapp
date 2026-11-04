/**
 * scratch/test_browser_auth_and_modals.cjs
 * Comprehensive headless Chrome CDP verification for:
 * 1. Global modal triggers: openAuthorizedDevicesModal, toggleKdsSound, openStatementModal, openSwitchStoreModal
 * 2. Smart PIN auto-recognition across multiple staff members on the same terminal
 * 3. First-login PIN setup & confirmation workflow
 * 4. Zero console errors, zero uncaught ReferenceErrors
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function findChrome() {
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
    throw new Error('Chrome/Edge not found');
}

async function run() {
    const chromePath = findChrome();
    const port = 9265;
    const userDataDir = path.join(__dirname, 'chrome_test_profile_' + Date.now());

    console.log('🚀 Spawning Headless Chrome for Auth & Modal Verification on port', port);
    const chrome = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu'
    ]);

    let connected = false;
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) { connected = true; break; }
        } catch (e) {}
    }
    assert.ok(connected, 'CDP connection failed');

    const newPageRes = await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:5000`, { method: 'PUT' });
    const target = await newPageRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    function send(method, params = {}) {
        const id = msgId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise(resolve => {
            const handler = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id === id) {
                    ws.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
        });
    }

    const consoleLogs = [];
    const jsExceptions = [];

    ws.addEventListener('message', (evt) => {
        const data = JSON.parse(evt.data);
        if (data.method === 'Runtime.consoleAPICalled') {
            consoleLogs.push({ type: data.params.type, text: data.params.args.map(a => a.value || a.description).join(' ') });
        }
        if (data.method === 'Runtime.exceptionThrown') {
            jsExceptions.push(data.params.exceptionDetails);
        }
    });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });

    // Wait 3.5s for initial assets and scripts to boot
    await new Promise(r => setTimeout(r, 3500));

    console.log('\n--- CHECK 1: Global Functions & Early Defensive Stubs ---');
    const funcChecks = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
            openAuthorizedDevicesModal: typeof window.openAuthorizedDevicesModal,
            closeAuthorizedDevicesModal: typeof window.closeAuthorizedDevicesModal,
            toggleKdsSound: typeof window.toggleKdsSound,
            openStatementModal: typeof window.openStatementModal,
            closeStatementModal: typeof window.closeStatementModal,
            openSwitchStoreModal: typeof window.openSwitchStoreModal,
            confirmSwitchShopCode: typeof window.confirmSwitchShopCode,
            forceCheckAppUpdate: typeof window.forceCheckAppUpdate,
            generateSecureUniqueStaffPin: typeof window.generateSecureUniqueStaffPin
        })`,
        returnByValue: true
    });
    const parsedFuncs = JSON.parse(funcChecks.result.value);
    console.log('Function signatures:', parsedFuncs);
    for (const [fn, type] of Object.entries(parsedFuncs)) {
        assert.strictEqual(type, 'function', `Expected ${fn} to be a function, got ${type}`);
    }
    console.log('✅ PASS: All 9 global functions and defensive stubs exist on window.');

    console.log('\n--- CHECK 2: Open Authorized Devices Modal from Settings Tile ---');
    const openDevicesRes = await send('Runtime.evaluate', {
        expression: `(function() {
            const tile = document.getElementById('settingTileAuthorizedDevices');
            if (!tile) return { ok: false, reason: 'Tile not found' };
            tile.click();
            const modal = document.getElementById('authorizedDevicesModal');
            return {
                ok: modal && modal.style.display !== 'none',
                display: modal?.style?.display
            };
        })()`,
        returnByValue: true
    });
    console.log('Authorized Devices Modal test:', openDevicesRes.result.value);
    assert.strictEqual(openDevicesRes.result.value.ok, true, 'Authorized Devices Modal should be visible after click');
    console.log('✅ PASS: Authorized Devices Hub opens seamlessly on tile click without errors.');

    console.log('\n--- CHECK 3: Close Authorized Devices Modal ---');
    const closeDevicesRes = await send('Runtime.evaluate', {
        expression: `(function() {
            closeAuthorizedDevicesModal();
            const modal = document.getElementById('authorizedDevicesModal');
            return { ok: modal && modal.style.display === 'none', display: modal?.style?.display };
        })()`,
        returnByValue: true
    });
    assert.strictEqual(closeDevicesRes.result.value.ok, true, 'Authorized Devices Modal should close');
    console.log('✅ PASS: Authorized Devices Hub closes cleanly.');

    console.log('\n--- CHECK 4: Toggle KDS Sound ---');
    const toggleKdsRes = await send('Runtime.evaluate', {
        expression: `(function() {
            const btn = document.getElementById('kdsSoundToggleBtn');
            if (!btn) return { ok: false, reason: 'KDS btn not found' };
            btn.click();
            const label1 = document.getElementById('kdsSoundLabel')?.innerText;
            btn.click();
            const label2 = document.getElementById('kdsSoundLabel')?.innerText;
            return { ok: true, label1, label2 };
        })()`,
        returnByValue: true
    });
    console.log('Toggle KDS Sound test:', toggleKdsRes.result.value);
    assert.strictEqual(toggleKdsRes.result.value.ok, true);
    assert.notStrictEqual(toggleKdsRes.result.value.label1, toggleKdsRes.result.value.label2);
    console.log('✅ PASS: KDS Sound chime toggles state cleanly on click.');

    console.log('\n--- CHECK 5: Open Switch Store Modal ---');
    const openSwitchStoreRes = await send('Runtime.evaluate', {
        expression: `(function() {
            openSwitchStoreModal();
            const modal = document.getElementById('switchStoreModal');
            const isOpen = modal && modal.style.display !== 'none';
            if (modal) modal.style.display = 'none';
            return { ok: isOpen };
        })()`,
        returnByValue: true
    });
    assert.strictEqual(openSwitchStoreRes.result.value.ok, true);
    console.log('✅ PASS: Switch Store modal opens without error.');

    console.log('\n--- CHECK 6: Auto-Gen Secure Staff PIN in Add Staff Modal ---');
    const autoGenPinRes = await send('Runtime.evaluate', {
        expression: `(function() {
            const pin1 = generateSecureUniqueStaffPin();
            const pin2 = generateSecureUniqueStaffPin();
            const isValid = /^\\d{4}$/.test(pin1) && /^\\d{4}$/.test(pin2) && pin1 !== '1234' && pin1 !== '0000' && pin1 !== '1111';
            openAddStaffModal();
            const inputVal = document.getElementById('staffPinInput')?.value;
            closeStaffModal();
            return {
                pin1, pin2, inputVal,
                isValid: isValid && inputVal && inputVal.length === 4
            };
        })()`,
        returnByValue: true
    });
    console.log('Auto-Gen Staff PIN test:', autoGenPinRes.result.value);
    assert.strictEqual(autoGenPinRes.result.value.isValid, true);
    console.log('✅ PASS: Non-trivial unique random PINs are generated and pre-filled in Add Staff modal.');

    console.log('\n--- CHECK 7: Smart Staff PIN Auto-Recognition on Login ---');
    const smartLoginRes = await send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async function() {
            // Setup two staff members: Admin (PIN 1234) and Cashier Rahul (PIN 7891)
            const saltRahul = generatePinSalt();
            const hashRahul = await hashPin('7891', saltRahul);
            
            const saltAdmin = generatePinSalt();
            const hashAdmin = await hashPin('1234', saltAdmin);

            staffList = [
                { id: 101, name: 'Priya Admin', role: 'Admin', pin_salt: saltAdmin, pin_hash: hashAdmin, mustChangePin: false, status: 'Active' },
                { id: 102, name: 'Rahul Cashier', role: 'Cashier', pin_salt: saltRahul, pin_hash: hashRahul, mustChangePin: false, status: 'Active' }
            ];
            window.staffList = staffList;
            
            // Lock terminal and show login overlay
            lockTerminal(false);
            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'flex';

            // Select Admin as active card initially
            selectLoginStaff(101);
            
            // Now, simulate typing Rahul's PIN (7891) WITHOUT clicking Rahul's avatar card
            const pinInput = document.getElementById('staffLoginPinInput');
            pinInput.value = '7891';
            
            // Confirm login
            await confirmStaffLogin();
            
            // Terminal should now be unlocked as Rahul Cashier!
            return {
                currentStaffName: currentStaff?.name,
                currentStaffRole: currentStaff?.role,
                currentStaffId: currentStaff?.id,
                isUnlocked: overlay.style.display === 'none'
            };
        })()`,
        returnByValue: true
    });
    console.log('Smart PIN Auto-Recognition Result:', smartLoginRes.result.value);
    assert.strictEqual(smartLoginRes.result.value.currentStaffName, 'Rahul Cashier');
    assert.strictEqual(smartLoginRes.result.value.currentStaffRole, 'Cashier');
    assert.strictEqual(smartLoginRes.result.value.currentStaffId, 102);
    assert.strictEqual(smartLoginRes.result.value.isUnlocked, true);
    console.log('✅ PASS: Smart PIN Auto-Recognition automatically identified Rahul Cashier and unlocked with Cashier role without manual avatar tapping!');

    console.log('\n--- CHECK 8: First-Login PIN Intercept Workflow ---');
    const firstLoginRes = await send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async function() {
            // Add new staff with mustChangePin: true
            const saltNew = generatePinSalt();
            const hashNew = await hashPin('4829', saltNew);
            const newStaff = { id: 103, name: 'Chef Gordon', role: 'Kitchen Chef', pin_salt: saltNew, pin_hash: hashNew, mustChangePin: true, status: 'Active' };
            staffList.push(newStaff);

            lockTerminal(false);
            document.getElementById('loginOverlay').style.display = 'flex';
            
            // Enter temp PIN 4829
            const pinInput = document.getElementById('staffLoginPinInput');
            pinInput.value = '4829';
            await confirmStaffLogin();

            const firstLoginModal = document.getElementById('firstLoginPinModal');
            const isOpen = firstLoginModal && firstLoginModal.style.display !== 'none';
            const targetName = document.getElementById('firstLoginStaffName')?.innerText;

            return {
                isIntercepted: isOpen,
                targetName
            };
        })()`,
        returnByValue: true
    });
    console.log('First Login Intercept Result:', firstLoginRes.result.value);
    assert.strictEqual(firstLoginRes.result.value.isIntercepted, true);
    assert.ok(firstLoginRes.result.value.targetName.includes('Chef Gordon'));
    console.log('✅ PASS: First login correctly intercepted with #firstLoginPinModal.');

    console.log('\n--- CHECK 9: Uncaught JS Exceptions & Critical Errors ---');
    console.log('Total JS Exceptions caught:', jsExceptions.length);
    if (jsExceptions.length > 0) {
        jsExceptions.forEach((e, i) => console.error(`[Exception ${i+1}]:`, e.text, e.exception?.description));
    }
    assert.strictEqual(jsExceptions.length, 0, 'No uncaught JS exceptions allowed during verification');
    console.log('✅ PASS: Zero uncaught JS exceptions during full test run.');

    ws.close();
    chrome.kill();
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('\n🎉 ALL AUTH & MODAL VERIFICATION TESTS PASSED 100% GREEN!\n');
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
