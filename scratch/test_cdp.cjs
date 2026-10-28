// scratch/test_cdp.cjs - Test Chrome DevTools Protocol automation with robust polling
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.join(__dirname, 'chrome_test_profile');

async function getTargets() {
    for (let i = 0; i < 20; i++) {
        try {
            const data = await new Promise((resolve, reject) => {
                const req = http.get('http://127.0.0.1:9222/json/list', (res) => {
                    let d = '';
                    res.on('data', chunk => d += chunk);
                    res.on('end', () => resolve(d));
                });
                req.on('error', reject);
                req.setTimeout(1000, () => req.destroy());
            });
            if (data && data.trim().startsWith('[')) {
                return JSON.parse(data);
            }
        } catch (e) {
            // retry
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Chrome CDP port 9222 did not respond in time');
}

async function run() {
    console.log('Launching headless Chrome with debugging port 9222...');
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9222',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`,
        'about:blank'
    ]);

    const targets = await getTargets();
    console.log('CDP targets found:', targets.length);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
        console.error('No page target found');
        chrome.kill();
        return;
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let id = 1;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const curId = id++;
            const handler = (msg) => {
                const res = JSON.parse(msg);
                if (res.id === curId) {
                    ws.off('message', handler);
                    if (res.error) reject(res.error);
                    else resolve(res.result);
                }
            };
            ws.on('message', handler);
            ws.send(JSON.stringify({ id: curId, method, params }));
        });
    }

    await new Promise(r => ws.on('open', r));
    console.log('Connected to Chrome DevTools Protocol!');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
    });

    console.log('Navigating to http://localhost:5000...');
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await new Promise(r => setTimeout(r, 2000));

    // Switch to inventory tab
    await send('Runtime.evaluate', {
        expression: `
            if (typeof switchTab === 'function') switchTab('inventory');
            if (typeof switchInventoryHubTab === 'function') switchInventoryHubTab('raw_stock');
        `
    });
    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7\\screen_inv_desktop_overview.png';
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot to:', shotPath);

    ws.close();
    chrome.kill();
}

run().catch(e => {
    console.error('Error running CDP test:', e);
    process.exit(1);
});
