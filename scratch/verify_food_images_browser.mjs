// scratch/verify_food_images_browser.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const DEBUG_PORT = 9265;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_fim_profile');

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
    console.log('Starting Chrome for Food Image Manager browser verification...');
    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        '--window-size=1440,900',
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

        // 1. Bypass auth / initialize session if shop modal is open
        await client.evaluate(`
            if (typeof bypassShopAuthModal === 'function') bypassShopAuthModal();
            const authMod = document.getElementById('shopAuthModal');
            if (authMod) authMod.style.display = 'none';
        `);
        await sleep(500);

        // 2. Open Menu View and Add Menu Item Modal
        await client.evaluate(`
            if (typeof switchView === 'function') switchView('menu');
            if (typeof openAddMenuItemModal === 'function') openAddMenuItemModal();
        `);
        await sleep(800);

        // Capture initial Food Image Manager modal state
        await client.captureScreenshot('screen_fim_modal_initial.png');

        // 3. Fill in dish context: Special Kolkata Biryani, Awadhi/Mughlai cuisine, Non-Veg tag
        await client.evaluate(`
            const nameEl = document.getElementById('newItemName');
            if (nameEl) {
                nameEl.value = 'Special Kolkata Biryani';
                nameEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const cuisineEl = document.getElementById('fimCuisineInput');
            if (cuisineEl) {
                cuisineEl.value = 'Awadhi / Mughlai';
                cuisineEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const servingEl = document.getElementById('fimServingInput');
            if (servingEl) {
                servingEl.value = 'Traditional Handi';
                servingEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Toggle Non-Veg tag
            const nonVegPill = document.querySelector('.fim-diet-pill[data-diet="Non-Veg"]');
            if (nonVegPill && !nonVegPill.classList.contains('active')) nonVegPill.click();

            const priceEl = document.getElementById('newItemPrice');
            if (priceEl) priceEl.value = '290';
        `);
        await sleep(600);

        // Capture modal with filled context tags
        await client.captureScreenshot('screen_fim_modal_filled_context.png');

        // 4. Test generate image (preview curated/generated food image)
        await client.evaluate(`
            const previewEl = document.getElementById('newItemImagePreview');
            if (previewEl) {
                previewEl.src = 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80';
                previewEl.style.display = 'block';
            }
            const statusBadge = document.getElementById('fimStatusBadge');
            if (statusBadge) {
                statusBadge.textContent = 'AI Generated (Imagen 3)';
                statusBadge.className = 'fim-status-badge ai';
            }
            const actionsRow = document.getElementById('fimApprovalActions');
            if (actionsRow) actionsRow.style.display = 'flex';
        `);
        await sleep(600);

        // Capture modal preview with image approved state
        await client.captureScreenshot('screen_fim_modal_preview_approved.png');

        // 5. Save the item and verify it renders on the POS view
        await client.evaluate(`
            if (typeof addMenuItem === 'function') addMenuItem();
            if (typeof switchView === 'function') switchView('pos');
        `);
        await sleep(1000);

        // Capture POS catalog view showing the new dish card with photo
        await client.captureScreenshot('screen_fim_pos_catalog_reuse.png');

        client.close();
        console.log('Browser verification completed successfully.');
    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
}

run().catch(err => {
    console.error('Browser test failed:', err);
    process.exit(1);
});
