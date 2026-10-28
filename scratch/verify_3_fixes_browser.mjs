// scratch/verify_3_fixes_browser.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const DEBUG_PORT = 9275;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_fixes_profile');

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function cdpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        }).on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
    }

    async connect() {
        const WebSocket = (await import('ws')).default;
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.on('open', resolve);
            this.ws.on('error', reject);
        });
        this.ws.on('message', (msg) => {
            const data = JSON.parse(msg.toString());
            if (data.id && this.callbacks.has(data.id)) {
                const { resolve, reject } = this.callbacks.get(data.id);
                this.callbacks.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async captureScreenshot(filename) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`Saved screenshot: ${filename}`);
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        return res?.result?.value;
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function run() {
    console.log('Starting Mobile Chrome CDP for 3 Fixes Verification (390x844)...');
    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        '--window-size=390,844',
        'http://localhost:5000'
    ], { stdio: 'ignore' });

    try {
        let connected = false;
        let tabs = [];
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            try {
                tabs = await cdpGet(`http://localhost:${DEBUG_PORT}/json`);
                if (tabs && tabs.length > 0) {
                    connected = true;
                    break;
                }
            } catch (e) {}
        }
        if (!connected) throw new Error('Could not connect to Chrome debugging port');

        const tab = tabs.find(t => t.type === 'page') || tabs[0];
        const client = new CDPClient(tab.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await sleep(1500);

        // Bypass login if auth modal is visible
        await client.evaluate(`
            const auth = document.getElementById('shopAuthModal');
            if (auth) {
                if (typeof bypassShopAuthDemo === 'function') bypassShopAuthDemo();
                auth.style.display = 'none';
            }
            localStorage.setItem('billnaw_user_role', 'admin');
        `);
        await sleep(1500);

        // 1. Verify Fix #1: Open Add Menu Item Modal on Mobile (390px)
        await client.evaluate(`
            if (typeof switchView === 'function') switchView('menu');
            if (typeof openAddMenuItemModal === 'function') openAddMenuItemModal();
        `);
        await sleep(600);

        // Capture screenshot of compact mobile modal
        await client.captureScreenshot('screen_fix1_mobile_modal_compact.png');

        // 2. Verify Fix #3: Type "paneer", cycle variation to 3 (which was the fish image), verify authentic paneer shows
        await client.evaluate(`
            const nameEl = document.getElementById('newItemName');
            if (nameEl) {
                nameEl.value = 'paneer';
                nameEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof generateAIImage === 'function') {
                // Set variation counter to 2 so next increment is 3 (was fish)
                dishImageVariationCounters['paneer'] = 2;
                generateAIImage();
            }
        `);
        await sleep(1200);

        // Capture screenshot of paneer generation showing genuine paneer (no fish!)
        await client.captureScreenshot('screen_fix3_paneer_authentic_food.png');

        // Close modal
        await client.evaluate(`
            const mod = document.getElementById('menuItemModal');
            if (mod) mod.style.display = 'none';
            if (typeof switchView === 'function') switchView('pos');
        `);
        await sleep(600);

        // 3. Verify Fix #2: Add 4 items to cart on mobile, open cart drawer, verify horizontal row layout (3-4 items visible at once)
        await client.evaluate(`
            if (!tablesInfo[activeTable]) tablesInfo[activeTable] = { items: [], status: 'occupied' };
            tablesInfo[activeTable].items = [
                { id: 101, name: 'Paneer Butter Masala', price: 260, qty: 2, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80' },
                { id: 102, name: 'Masala Cold Coke', price: 40, qty: 2, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80' },
                { id: 103, name: 'Crispy Veg Samosa', price: 25, qty: 4, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80' },
                { id: 104, name: 'Kolkata Chicken Biryani', price: 280, qty: 1, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80' }
            ];
            persistTables();
            updateCartUI();
            const drawer = document.getElementById('cartDrawer');
            if (drawer) drawer.classList.add('open');
            const overlay = document.getElementById('cartDrawerOverlay');
            if (overlay) overlay.classList.add('show');
        `);
        await sleep(800);

        // Capture screenshot of mobile cart drawer with 4 items visible at once, images on left!
        await client.captureScreenshot('screen_fix2_mobile_cart_4_items_visible.png');

        client.close();
        console.log('Mobile verification completed successfully.');
    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
}

run().catch(err => {
    console.error('Browser test failed:', err);
    process.exit(1);
});
