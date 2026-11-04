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
    const port = 9270;
    const userDataDir = path.join(__dirname, 'chrome_test_profile_' + Date.now());

    console.log('Spawning Chrome on port', port);
    const chrome = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu'
    ]);

    let connected = false;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) { connected = true; break; }
        } catch (e) {}
    }
    assert.ok(connected);

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

    // Wait 3.5s for page to load & sync
    await new Promise(r => setTimeout(r, 3500));

    console.log('\n--- Evaluating Device Master Recognition & ZeroStoreDataGate ---');
    const evalRes = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
            isMaster: isMasterTerminal(),
            deviceStatus: getDeviceStatus(),
            canAccess: canAccessStoreData(),
            pairingOverlayDisplay: document.getElementById('devicePairingOverlay')?.style?.display,
            hasAuthBtn: !!document.querySelector('#devicePairingOverlay button[onclick="promptAdminAuthorizeTerminal()"]'),
            menuCount: (window.menuItems || []).length
        })`,
        returnByValue: true
    });

    console.log('Evaluation result:', evalRes.result.value);
    const parsed = JSON.parse(evalRes.result.value);
    
    assert.strictEqual(parsed.isMaster, true, 'Primary device must auto-recognize as Master Admin Terminal');
    assert.strictEqual(parsed.deviceStatus, 'AUTHORIZED', 'Primary device must have AUTHORIZED status');
    assert.strictEqual(parsed.canAccess, true, 'Primary device must have store data access');
    assert.notStrictEqual(parsed.pairingOverlayDisplay, 'flex', 'Pairing overlay must not block Master terminal');
    assert.strictEqual(parsed.hasAuthBtn, true, 'Pairing overlay must have promptAdminAuthorizeTerminal button');

    console.log('ZeroStoreDataGate warnings in console:', consoleLogs.filter(l => l.text.includes('ZeroStoreDataGate')));
    assert.strictEqual(consoleLogs.some(l => l.text.includes('Suspending store data sync')), false, 'Store data sync must NOT be suspended on primary device');

    console.log('✅ PASS: Primary browser auto-promoted to Master Admin Terminal with zero gate suspension!');

    ws.close();
    chrome.kill();
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
}

run().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
