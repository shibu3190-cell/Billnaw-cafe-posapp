/**
 * scratch/test_m3_menu_server_stress.cjs
 *
 * Milestone 3 Adversarial Empirical Stress Test Suite:
 * 1. Menu Items Bidirectional Lexical & Window Scoping (mutation, reassignment, edge cases).
 * 2. Server Process Exception Handlers (unhandledRejection, uncaughtException, crash-resistance).
 * 3. Repository Invariants & Safety Verification.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_PORT = 3995;

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function test(id, title, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${id}: ${title}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${id}: ${title}`);
        console.error(`     Reason: ${err.message}`);
        failCount++;
        failures.push({ id, title, error: err.message, stack: err.stack });
    }
}

async function testAsync(id, title, fn) {
    try {
        await fn();
        console.log(`  ✅ [PASS] ${id}: ${title}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${id}: ${title}`);
        console.error(`     Reason: ${err.message}`);
        failCount++;
        failures.push({ id, title, error: err.message, stack: err.stack });
    }
}

/**
 * Creates a browser-like sandbox with DOM elements and loads js/core.js and js/menu.js.
 */
function createSandbox() {
    const docElements = new Map();
    function getEl(id) {
        if (!docElements.has(id)) {
            docElements.set(id, {
                id,
                innerHTML: '',
                innerText: '',
                value: '',
                style: {},
                classList: {
                    add() {},
                    remove() {},
                    toggle() {},
                    contains() { return false; }
                },
                setAttribute() {},
                getAttribute() { return null; },
                addEventListener() {}
            });
        }
        return docElements.get(id);
    }

    const sandbox = {
        document: {
            getElementById: getEl,
            querySelector: (sel) => {
                if (sel.startsWith('#')) return getEl(sel.slice(1));
                return null;
            },
            querySelectorAll: () => [],
            createElement: (tag) => ({
                tagName: tag.toUpperCase(),
                innerHTML: '',
                innerText: '',
                style: {},
                appendChild() {},
                setAttribute() {},
                getAttribute() { return null; },
                addEventListener() {}
            }),
            body: { appendChild() {} },
            addEventListener() {}
        },
        localStorage: {
            _store: new Map(),
            getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
            setItem(k, v) { this._store.set(k, String(v)); },
            removeItem(k) { this._store.delete(k); },
            clear() { this._store.clear(); }
        },
        sessionStorage: {
            _store: new Map(),
            getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
            setItem(k, v) { this._store.set(k, String(v)); },
            removeItem(k) { this._store.delete(k); },
            clear() { this._store.clear(); }
        },
        navigator: { onLine: true, userAgent: 'AdversarialTestHarness/1.0' },
        location: { reload() {} },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        BroadcastChannel: class {
            constructor() { this.onmessage = null; }
            postMessage() {}
            close() {}
        },
        indexedDB: { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }) },
        console,
        setTimeout: (fn) => setTimeout(fn, 0),
        clearTimeout,
        setInterval: () => 1,
        clearInterval: () => {}
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const coreCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'core.js'), 'utf8');
    const menuCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'menu.js'), 'utf8');

    vm.createContext(sandbox);
    vm.runInContext(coreCode, sandbox);
    vm.runInContext(menuCode, sandbox);

    return { sandbox, getEl };
}

(async () => {
    console.log('================================================================================');
    console.log('⚡ MILESTONE 3: ADVERSARIAL STRESS TEST SUITE');
    console.log('   Menu Items Lexical Sync, Server Process Exceptions & Repository Invariants');
    console.log('================================================================================\n');

    // ========================================================================
    // 📍 SECTION 1: MENU ITEMS BIDIRECTIONAL LEXICAL & WINDOW SCOPING
    // ========================================================================
    console.log('📍 SECTION 1: MENU ITEMS PROPERTY DESCRIPTOR & BIDIRECTIONAL SYNC');

    test('MENU-SYNC-01', 'window.menuItems has valid accessor descriptor (getter, setter, enumerable, configurable)', () => {
        const { sandbox } = createSandbox();
        const desc = Object.getOwnPropertyDescriptor(sandbox.window, 'menuItems');
        assert(desc !== undefined, 'window.menuItems descriptor must exist');
        assert(typeof desc.get === 'function', 'desc.get must be a getter function');
        assert(typeof desc.set === 'function', 'desc.set must be a setter function');
        assert(desc.enumerable === true, 'desc.enumerable must be true');
        assert(desc.configurable === true, 'desc.configurable must be true');
    });

    test('MENU-SYNC-02', 'Getter transparently reads lexical menuItems', () => {
        const { sandbox } = createSandbox();
        // Initially populated with default demo menu or [] depending on seed
        const items = sandbox.window.menuItems;
        assert(Array.isArray(items), 'window.menuItems must return an Array');
        // Reading via global identifier vs window property must yield identical reference
        const directRead = vm.runInContext('menuItems', sandbox);
        assert(items === directRead, 'window.menuItems and lexical menuItems must be the identical array reference');
    });

    test('MENU-SYNC-03', 'Direct reassignment of window.menuItems updates lexical variable', () => {
        const { sandbox } = createSandbox();
        const testMenu = [
            { id: 101, name: 'Adversarial Cortado', price: 160, category: 'Beverages', is_active: true },
            { id: 102, name: 'Saffron Croissant', price: 210, category: 'Snacks', is_active: true }
        ];

        sandbox.window.menuItems = testMenu;

        assert(sandbox.window.menuItems.length === 2, 'window.menuItems length must reflect 2 items');
        assert(sandbox.window.menuItems[0].name === 'Adversarial Cortado', 'Item 0 name must match');

        // Lexical identifier in the scope must be identical
        const directRead = vm.runInContext('menuItems', sandbox);
        assert(directRead === testMenu, 'Lexical menuItems must point to newly assigned testMenu');
        assert(directRead.length === 2, 'Lexical menuItems must have length 2');
        assert(directRead[0].name === 'Adversarial Cortado', 'Lexical menuItems[0] must match');
    });

    test('MENU-SYNC-04', 'In-place array mutations (push, splice, property edit) reflect in window.menuItems', () => {
        const { sandbox } = createSandbox();
        sandbox.window.menuItems = [
            { id: 201, name: 'Cold Brew Single Origin', price: 180, category: 'Beverages', is_active: true }
        ];

        // 1. In-place push
        sandbox.window.menuItems.push({ id: 202, name: 'Almond Biscotti', price: 80, category: 'Snacks', is_active: true });
        assert(sandbox.window.menuItems.length === 2, 'In-place push must increase length to 2');
        const lexical1 = vm.runInContext('menuItems', sandbox);
        assert(lexical1.length === 2, 'Lexical variable must also reflect length 2');

        // 2. In-place property edit
        sandbox.window.menuItems[0].price = 220;
        assert(sandbox.window.menuItems[0].price === 220, 'Property mutation must update on window');
        assert(lexical1[0].price === 220, 'Property mutation must update in lexical variable');

        // 3. In-place splice
        const removed = sandbox.window.menuItems.splice(0, 1);
        assert(removed.length === 1 && removed[0].id === 201, 'Splice must remove first element');
        assert(sandbox.window.menuItems.length === 1, 'window.menuItems length must be 1 after splice');
        assert(sandbox.window.menuItems[0].name === 'Almond Biscotti', 'Remaining item must be Almond Biscotti');
        assert(lexical1.length === 1, 'Lexical length must be 1 after splice');
    });

    // ========================================================================
    // 📍 SECTION 2: ADVERSARIAL EDGE CASE ASSIGNMENTS & NORMALIZATION
    // ========================================================================
    console.log('\n📍 SECTION 2: ADVERSARIAL EDGE CASE REASSIGNMENTS');

    test('MENU-EDGE-01', 'window.menuItems = null normalizes safely to empty array []', () => {
        const { sandbox } = createSandbox();
        sandbox.window.menuItems = null;

        assert(Array.isArray(sandbox.window.menuItems), 'window.menuItems must normalize to an Array');
        assert(sandbox.window.menuItems.length === 0, 'window.menuItems must be empty array');
        const lexical = vm.runInContext('menuItems', sandbox);
        assert(Array.isArray(lexical) && lexical.length === 0, 'Lexical menuItems must be empty array');
    });

    test('MENU-EDGE-02', 'window.menuItems = undefined normalizes safely to empty array []', () => {
        const { sandbox } = createSandbox();
        sandbox.window.menuItems = undefined;

        assert(Array.isArray(sandbox.window.menuItems), 'window.menuItems must normalize to an Array');
        assert(sandbox.window.menuItems.length === 0, 'window.menuItems must be empty array');
        const lexical = vm.runInContext('menuItems', sandbox);
        assert(Array.isArray(lexical) && lexical.length === 0, 'Lexical menuItems must be empty array');
    });

    test('MENU-EDGE-03', 'Non-array assignments (string, number, boolean, plain object) normalize safely to []', () => {
        const { sandbox } = createSandbox();
        
        sandbox.window.menuItems = "INVALID_STRING";
        assert(Array.isArray(sandbox.window.menuItems) && sandbox.window.menuItems.length === 0, 'String must normalize to []');

        sandbox.window.menuItems = 99999;
        assert(Array.isArray(sandbox.window.menuItems) && sandbox.window.menuItems.length === 0, 'Number must normalize to []');

        sandbox.window.menuItems = true;
        assert(Array.isArray(sandbox.window.menuItems) && sandbox.window.menuItems.length === 0, 'Boolean must normalize to []');

        sandbox.window.menuItems = { notAnArray: true, id: 1 };
        assert(Array.isArray(sandbox.window.menuItems) && sandbox.window.menuItems.length === 0, 'Object must normalize to []');
    });

    test('MENU-EDGE-04', 'window.menuItems = [] assigns empty array cleanly', () => {
        const { sandbox } = createSandbox();
        sandbox.window.menuItems = [];

        assert(Array.isArray(sandbox.window.menuItems), 'Must be an array');
        assert(sandbox.window.menuItems.length === 0, 'Must have length 0');
    });

    test('MENU-EDGE-05', 'Large array assignment (500 items) processes without memory or indexing failure', () => {
        const { sandbox } = createSandbox();
        const largeMenu = Array.from({ length: 500 }, (_, i) => ({
            id: i + 1,
            name: `Dish #${i + 1}`,
            price: 50 + (i % 200),
            category: i % 2 === 0 ? 'Beverages' : 'Snacks',
            is_active: true
        }));

        sandbox.window.menuItems = largeMenu;
        assert(sandbox.window.menuItems.length === 500, 'window.menuItems length must be 500');
        assert(sandbox.window.menuItems[0].name === 'Dish #1', 'First item name must match');
        assert(sandbox.window.menuItems[499].name === 'Dish #500', 'Last item name must match');

        const lexical = vm.runInContext('menuItems', sandbox);
        assert(lexical.length === 500, 'Lexical menuItems length must be 500');
    });

    test('MENU-EDGE-06', 'Sparse array assignment (Array(500)) maintains array shape without unhandled crash', () => {
        const { sandbox } = createSandbox();
        sandbox.window.menuItems = new Array(500);

        assert(Array.isArray(sandbox.window.menuItems), 'Sparse array is an array');
        assert(sandbox.window.menuItems.length === 500, 'Sparse array length is 500');
    });

    // ========================================================================
    // 📍 SECTION 3: UI FUNCTION RESILIENCE UNDER MUTATED MENU ITEMS
    // ========================================================================
    console.log('\n📍 SECTION 3: UI FUNCTION RESILIENCE (renderMenuUI, filterMenu, renderMenuCatalogUI)');

    test('MENU-UI-01', 'renderMenuUI() handles empty array cleanly by rendering posMenuEmptyState', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = [];
        sandbox.renderMenuUI();

        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(gridHtml.includes('posMenuEmptyState'), 'Must render #posMenuEmptyState when menu is empty');
        assert(gridHtml.includes('No Dishes Added Yet'), 'Must show empty slate heading');
    });

    test('MENU-UI-02', 'renderMenuUI() handles null assignment (normalized to []) cleanly without throwing', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = null;
        sandbox.renderMenuUI();

        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(gridHtml.includes('posMenuEmptyState'), 'Must render #posMenuEmptyState when window.menuItems = null');
    });

    test('MENU-UI-03', 'renderMenuUI() renders dish cards when items are present and sets window.menuItems', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = [
            { id: 301, name: 'Double Shot Americano', price: 140, category: 'Beverages', is_active: true },
            { id: 302, name: 'Pain au Chocolat', price: 190, category: 'Snacks', is_active: true }
        ];

        sandbox.renderMenuUI();
        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(!gridHtml.includes('posMenuEmptyState'), 'Must not render empty state when dishes exist');
        assert(gridHtml.includes('Double Shot Americano'), 'Must render Double Shot Americano card');
        assert(gridHtml.includes('Pain au Chocolat'), 'Must render Pain au Chocolat card');
    });

    test('MENU-UI-04', 'filterMenu() filters active category cleanly without throwing exceptions', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = [
            { id: 401, name: 'Green Tea', price: 60, category: 'Beverages', is_active: true },
            { id: 402, name: 'Club Sandwich', price: 150, category: 'Snacks', is_active: true }
        ];

        sandbox.filterMenu('Beverages');
        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(gridHtml.includes('Green Tea'), 'Must show Green Tea when filtered to Beverages');
        assert(!gridHtml.includes('Club Sandwich'), 'Must NOT show Club Sandwich when filtered to Beverages');
    });

    test('MENU-UI-05', 'renderMenuUI() renders 500 dishes cleanly under extreme array scale', () => {
        const { sandbox, getEl } = createSandbox();
        const bigMenu = Array.from({ length: 500 }, (_, i) => ({
            id: 1000 + i,
            name: `Stress Item ${i}`,
            price: 50,
            category: 'Beverages',
            is_active: true
        }));

        sandbox.window.menuItems = bigMenu;
        sandbox.renderMenuUI();

        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(gridHtml.includes('Stress Item 0'), 'First item must be rendered');
        assert(gridHtml.includes('Stress Item 499'), 'Last item must be rendered');
    });

    test('MENU-UI-06', 'renderMenuCatalogUI() updates catalog badges accurately across counts', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = [
            { id: 501, name: 'Espresso', price: 90, category: 'Beverages', is_active: true }
        ];

        sandbox.renderMenuCatalogUI();
        const badge = getEl('catalogItemCountBadge').innerText;
        assert(badge === '1 Item', `Expected '1 Item', got '${badge}'`);

        sandbox.window.menuItems = [
            { id: 501, name: 'Espresso', price: 90, category: 'Beverages', is_active: true },
            { id: 502, name: 'Cappuccino', price: 120, category: 'Beverages', is_active: true }
        ];
        sandbox.renderMenuCatalogUI();
        const badge2 = getEl('catalogItemCountBadge').innerText;
        assert(badge2 === '2 Items', `Expected '2 Items', got '${badge2}'`);
    });

    test('MENU-UI-07', 'renderMenuUI() handles sparse array Array(500) gracefully (empty holes skipped by Array.filter)', () => {
        const { sandbox, getEl } = createSandbox();
        sandbox.window.menuItems = new Array(500);
        sandbox.renderMenuUI();

        const gridHtml = getEl('menuGridUI').innerHTML;
        assert(gridHtml.includes('posMenuEmptyState'), 'Sparse array holes must filter out to empty state');
    });

    // ========================================================================
    // 📍 SECTION 4: SERVER PROCESS EXCEPTION HANDLERS (server.js)
    // ========================================================================
    console.log('\n📍 SECTION 4: SERVER PROCESS EXCEPTION HANDLERS (server.js)');

    await testAsync('SERVER-EXC-01', 'server.js attaches listeners to unhandledRejection and uncaughtException', async () => {
        process.env.NODE_ENV = 'test';
        await import('../server.js');

        const urListeners = process.listeners('unhandledRejection');
        const ucListeners = process.listeners('uncaughtException');

        assert(urListeners.length >= 1, 'process must have at least 1 unhandledRejection listener');
        assert(ucListeners.length >= 1, 'process must have at least 1 uncaughtException listener');
    });

    await testAsync('SERVER-EXC-02', 'unhandledRejection listener formats ISO timestamp and captures reason & stack', async () => {
        process.env.NODE_ENV = 'test';
        await import('../server.js');

        const urListener = process.listeners('unhandledRejection')[0];
        assert(typeof urListener === 'function', 'Listener must be a function');

        const captured = [];
        const origError = console.error;
        console.error = (...args) => captured.push(args.join(' '));

        try {
            const syntheticError = new Error('Empirical Test Rejection');
            urListener(syntheticError, Promise.resolve());

            assert(captured.length >= 2, 'Listener must log both reason and stack');
            assert(captured[0].includes('[Server Unhandled Rejection] Reason: Error: Empirical Test Rejection'), 'First log must contain header and reason');
            assert(captured[1].includes('[Server Unhandled Rejection Stack]: Error: Empirical Test Rejection'), 'Second log must contain stack trace');
            assert(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]/.test(captured[0]), 'Log must include ISO timestamp');
        } finally {
            console.error = origError;
        }
    });

    await testAsync('SERVER-EXC-03', 'unhandledRejection listener handles non-Error reasons (string, number, null) safely', async () => {
        process.env.NODE_ENV = 'test';
        await import('../server.js');

        const urListener = process.listeners('unhandledRejection')[0];
        const captured = [];
        const origError = console.error;
        console.error = (...args) => captured.push(args.join(' '));

        try {
            // String rejection
            urListener('HTTP 429 Quota Exceeded', Promise.resolve());
            assert(captured.some(l => l.includes('[Server Unhandled Rejection] Reason: HTTP 429 Quota Exceeded')), 'String reason logged cleanly');

            // Numeric rejection
            urListener(500, Promise.resolve());
            assert(captured.some(l => l.includes('[Server Unhandled Rejection] Reason: 500')), 'Numeric reason logged cleanly');

            // Null rejection
            urListener(null, Promise.resolve());
            assert(captured.some(l => l.includes('[Server Unhandled Rejection] Reason: null') || l.includes('[Server Unhandled Rejection] Reason: ')), 'Null reason handled cleanly');
        } finally {
            console.error = origError;
        }
    });

    await testAsync('SERVER-EXC-04', 'uncaughtException listener formats ISO timestamp, origin, error and stack', async () => {
        process.env.NODE_ENV = 'test';
        await import('../server.js');

        const ucListener = process.listeners('uncaughtException')[0];
        assert(typeof ucListener === 'function', 'Listener must be a function');

        const captured = [];
        const origError = console.error;
        console.error = (...args) => captured.push(args.join(' '));

        try {
            const syntheticError = new Error('Empirical Test Uncaught Exception');
            ucListener(syntheticError, 'uncaughtException');

            assert(captured.length >= 2, 'Listener must log both header and stack');
            assert(captured[0].includes('[Server Uncaught Exception] Origin: uncaughtException, Error: Error: Empirical Test Uncaught Exception'), 'Header must contain origin and error');
            assert(captured[1].includes('[Server Uncaught Exception Stack]: Error: Empirical Test Uncaught Exception'), 'Must log stack trace');
            assert(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]/.test(captured[0]), 'Log must include ISO timestamp');
        } finally {
            console.error = origError;
        }
    });

    await testAsync('SERVER-EXC-05', 'Spawned server survives asynchronous unhandledRejection and stays responsive to HTTP traffic', async () => {
        // We spawn a sub-process running server.js on TEST_PORT and trigger a synthetic unhandled rejection in its event loop
        const childCode = `
            process.env.NODE_ENV = 'test';
            process.env.PORT = '${TEST_PORT}';
            import('./server.js').then(({ app }) => {
                const server = app.listen(${TEST_PORT}, '127.0.0.1', () => {
                    process.send('SERVER_LISTENING');
                });

                process.on('message', (msg) => {
                    if (msg === 'TRIGGER_REJECTION') {
                        // Asynchronously reject a Promise without catch to trigger process unhandledRejection event
                        Promise.reject(new Error('Synthetic Event Loop Rejection'));
                    }
                    if (msg === 'SHUTDOWN') {
                        server.close(() => process.exit(0));
                    }
                });
            });
        `;

        const child = spawn('node', ['--input-type=module', '-e', childCode], {
            cwd: ROOT_DIR,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        let stderr = '';
        let stdout = '';
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.stdout.on('data', d => { stdout += d.toString(); });

        try {
            // Wait for SERVER_LISTENING
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Child server boot timeout')), 8000);
                child.on('message', (msg) => {
                    if (msg === 'SERVER_LISTENING') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                child.on('error', reject);
            });

            // 1. Verify HTTP request BEFORE rejection
            const resBefore = await new Promise((resolve, reject) => {
                http.get(`http://127.0.0.1:${TEST_PORT}/api/health`, (res) => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });
            assert(resBefore.status === 'ok', 'Health check before rejection must return { status: ok }');

            // 2. Trigger asynchronous unhandled rejection in the child process
            child.send('TRIGGER_REJECTION');

            // Wait 500ms for rejection listener to handle and log
            await new Promise(r => setTimeout(r, 500));

            // Verify stderr logged the unhandled rejection
            assert(stderr.includes('[Server Unhandled Rejection] Reason: Error: Synthetic Event Loop Rejection'), 'Sub-process stderr must log the unhandled rejection');
            assert(stderr.includes('[Server Unhandled Rejection Stack]:'), 'Sub-process stderr must log the stack trace');

            // 3. Verify HTTP request AFTER rejection - proof of crash resistance!
            const resAfter = await new Promise((resolve, reject) => {
                http.get(`http://127.0.0.1:${TEST_PORT}/api/health`, (res) => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });
            assert(resAfter.status === 'ok', 'Health check AFTER unhandled rejection must STILL return { status: ok }');

        } finally {
            child.send('SHUTDOWN');
            setTimeout(() => {
                try { child.kill('SIGKILL'); } catch (e) {}
            }, 500);
        }
    });

    // ========================================================================
    // 📍 SECTION 5: REPOSITORY INVARIANTS & INTEGRITY VERIFICATION
    // ========================================================================
    console.log('\n📍 SECTION 5: REPOSITORY INVARIANTS & INTEGRITY VERIFICATION');

    test('INV-01', 'index.html contains exactly 26 active modal-close-btn button elements with SVGs', () => {
        const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
        const matches = [...indexHtml.matchAll(/<button[^>]*class="[^"]*modal-close-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)];
        assert(matches.length === 26, `Expected exactly 26 modal-close-btn buttons, found ${matches.length}`);

        for (let i = 0; i < matches.length; i++) {
            const btnContent = matches[i][1];
            assert(btnContent.includes('<svg') && btnContent.includes('</svg>'), `Button ${i + 1} must contain an SVG icon`);
        }
    });

    test('INV-02', 'Zero raw Unicode emojis inside <button> elements in index.html', () => {
        const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
        const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}]/u;
        const buttonMatches = [...indexHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];

        let emojiBtnCount = 0;
        for (const match of buttonMatches) {
            const content = match[1].replace(/<!--[\s\S]*?-->/g, '');
            if (emojiRegex.test(content)) {
                emojiBtnCount++;
            }
        }
        assert(emojiBtnCount === 0, `Expected 0 raw emoji buttons, found ${emojiBtnCount}`);
    });

    test('INV-03', 'Firestore rules maintain 100% binary parity between root and database/ directories', () => {
        const rootRules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'));
        const dbRules = fs.readFileSync(path.join(ROOT_DIR, 'database', 'firestore.rules'));
        assert(Buffer.compare(rootRules, dbRules) === 0, 'firestore.rules and database/firestore.rules must be bit-for-bit identical');
    });

    test('INV-04', 'Storage rules maintain 100% binary parity between root and database/ directories', () => {
        const rootRules = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'));
        const dbRules = fs.readFileSync(path.join(ROOT_DIR, 'database', 'storage.rules'));
        assert(Buffer.compare(rootRules, dbRules) === 0, 'storage.rules and database/storage.rules must be bit-for-bit identical');
    });

    test('INV-05', 'Git branch is feat/mobile-ux-and-backend-security', () => {
        const branch = execSync('git branch --show-current', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
        assert(branch === 'feat/mobile-ux-and-backend-security', `Expected feat/mobile-ux-and-backend-security, found ${branch}`);
    });

    // ========================================================================
    // 🎯 FINAL REPORT & SUITE VERDICT
    // ========================================================================
    console.log('\n================================================================================');
    console.log(`🎯 TOTAL SUITE SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
    console.log('================================================================================\n');

    if (failCount > 0) {
        console.error('❌ ADVERSARIAL CHALLENGES FAILED:');
        failures.forEach(f => console.error(`  - [${f.id}] ${f.title}: ${f.error}`));
        process.exit(1);
    } else {
        console.log('✨ ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!');
        process.exit(0);
    }
})();
