import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.id && this.callbacks.has(msg.id)) {
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) reject(msg.error);
                    else resolve(msg.result);
                }
            };
        });
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
            console.error('Eval error:', res.exceptionDetails);
        }
        return res.result?.value;
    }

    async screenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(res.data, 'base64');
        fs.writeFileSync(filepath, buf);
        console.log(`📸 Saved screenshot: ${filepath} (${buf.length} bytes)`);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function run() {
    console.log('🚀 Launching headless Chrome with remote debugging on port', DEBUG_PORT);
    const tempDir = path.join(process.env.TEMP, 'chrome_cdp_profile_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    const chromeProc = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${tempDir}`,
        '--window-size=1280,880',
        'about:blank'
    ]);

    chromeProc.on('error', (err) => console.error('Chrome spawn error:', err));

    let versionData = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
            if (res.ok) {
                versionData = await res.json();
                break;
            }
        } catch (e) {}
    }

    if (!versionData) {
        console.error('Failed to connect to Chrome debug port');
        chromeProc.kill();
        return;
    }

    const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    console.log('Connecting to target:', pageTarget.title, pageTarget.webSocketDebuggerUrl);

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log('Connected to CDP!');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // 1. Navigate to POS login view
    console.log('Navigating to http://localhost:5000/?auth=login ...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5000/?auth=login' });
    await sleep(2500);

    // Capture 1: Auth Login Screen
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_auth_login.png'));

    // 2. Switch to Sign Up tab
    console.log('Switching to Sign Up tab...');
    await cdp.evaluate(`switchShopAuthTab('signup');`);
    await sleep(800);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_auth_signup.png'));

    // 3. Switch back to Login, enter email, request OTP
    console.log('Switching back to Login & requesting OTP...');
    await cdp.evaluate(`
        switchShopAuthTab('login');
        const emailInput = document.getElementById('shopAuthEmail');
        if (emailInput) {
            emailInput.value = 'shibu3190@gmail.com';
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        handleSendOtpCode();
    `);
    await sleep(3500); // Wait for OTP request and auto-fill banner rendering
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_auth_otp_step.png'));

    // 4. Close auth modal forcefully to view tabs
    console.log('Unlocking and closing Auth Modal to view POS and Hubs...');
    await cdp.evaluate(`closeShopAuthModal(true);`);
    await sleep(800);

    // 5. Navigate to WhatsApp Tab
    console.log('Navigating to WhatsApp Tab...');
    await cdp.evaluate(`switchTab('whatsapp');`);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_whatsapp_hub.png'));

    // 6. Open WhatsApp Campaign Studio Sub-view
    console.log('Opening WhatsApp Campaign Studio Sub-view...');
    await cdp.evaluate(`openWhatsAppHubSubView('studio', 'festival');`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_whatsapp_studio_subview.png'));

    // 7. Return to WhatsApp Hub, then navigate to Inventory Tab
    console.log('Returning to WhatsApp Hub, switching to Inventory Tab...');
    await cdp.evaluate(`
        closeWhatsAppHubSubView();
        switchTab('inventory');
    `);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_inventory_hub.png'));

    // 8. Open Inventory Detailed Sub-view (RTR Tracker)
    console.log('Opening Inventory RTR Tracker Sub-view...');
    await cdp.evaluate(`openInventoryHubSubView('rtr_tracker');`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_inventory_subview.png'));

    // Done!
    cdp.close();
    chromeProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    console.log('🎉 Browser test flow completed successfully with all screenshots saved!');
}

run().catch(err => {
    console.error('Error during browser runner:', err);
    process.exit(1);
});
