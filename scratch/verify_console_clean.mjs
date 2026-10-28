// scratch/verify_console_clean.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = 9270;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_clean_console_profile');

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
        this.errors = [];
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
            if (data.method === 'Runtime.exceptionThrown') {
                const desc = data.params?.exceptionDetails?.exception?.description || 
                             data.params?.exceptionDetails?.text || 'Unknown exception';
                console.error('[BROWSER EXCEPTION]', desc);
                this.errors.push(desc);
            }
            if (data.method === 'Log.entryAdded' && data.params?.entry?.level === 'error') {
                console.error('[BROWSER LOG ERROR]', data.params.entry.text);
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
    console.log('Testing browser console for syntax/initialization errors...');
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
        await client.send('Log.enable');

        await sleep(2000);

        // Check if menu.js loaded and exported its functions
        const checkResults = await client.evaluate(`({
            renderCategoryDropdownType: typeof window.renderCategoryDropdown,
            openAddMenuItemModalType: typeof window.openAddMenuItemModal,
            addMenuItemType: typeof window.addMenuItem,
            currentItemImageBase64Type: typeof window.currentItemImageBase64,
            menuItemsCount: Array.isArray(window.menuItems) ? window.menuItems.length : -1,
            initAppStatus: document.readyState
        })`);

        console.log('Browser Scope Verification Results:', JSON.stringify(checkResults, null, 2));

        if (client.errors.length > 0) {
            console.error(`FAILED: Detected ${client.errors.length} unhandled browser exceptions:`, client.errors);
            process.exit(1);
        }

        if (checkResults.renderCategoryDropdownType !== 'function') {
            throw new Error(`renderCategoryDropdown is ${checkResults.renderCategoryDropdownType}, expected function`);
        }
        if (checkResults.openAddMenuItemModalType !== 'function') {
            throw new Error(`openAddMenuItemModal is ${checkResults.openAddMenuItemModalType}, expected function`);
        }
        if (checkResults.addMenuItemType !== 'function') {
            throw new Error(`addMenuItemType is ${checkResults.addMenuItemType}, expected function`);
        }

        console.log('✅ SUCCESS: Zero syntax errors. All menu and UI functions properly initialized and accessible!');

        client.close();
    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
}

run().catch(err => {
    console.error('Fatal verification error:', err);
    process.exit(1);
});
