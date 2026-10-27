// scratch/test_challenger_m1_2_suite.cjs - Adversarial Empirical Stress Test Suite for Milestone 1
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log("==============================================================================");
console.log("🔥 EMPIRICAL ADVERSARIAL STRESS SUITE - MILESTONE 1 CHALLENGER 2");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        console.error(err.stack);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        console.error(err.stack);
        failed++;
    }
}

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const marketingJs = fs.readFileSync(path.join(rootDir, 'js', 'marketing_inventory.js'), 'utf8');
const culinaryJs = fs.readFileSync(path.join(rootDir, 'js', 'culinary_inventory.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(rootDir, 'js', 'dashboard.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');

// Helper to create a rich DOM mockup
function createDOMMock(elements = {}) {
    const registry = new Map();
    for (const [id, el] of Object.entries(elements)) {
        registry.set(id, el);
    }

    function createElement(tag) {
        return {
            tagName: tag.toUpperCase(),
            id: '',
            className: '',
            style: {},
            attributes: {},
            value: '',
            innerText: '',
            innerHTML: '',
            children: [],
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); },
                toggle(c) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); }
            },
            setAttribute(k, v) { this.attributes[k] = String(v); },
            getAttribute(k) { return this.attributes[k]; },
            removeAttribute(k) { delete this.attributes[k]; },
            focus() { this.focused = true; },
            addEventListener() {},
            removeEventListener() {}
        };
    }

    const documentMock = {
        registry,
        createElement,
        getElementById(id) {
            return registry.get(id) || null;
        },
        querySelector(selector) {
            if (selector.startsWith('#')) return registry.get(selector.slice(1)) || null;
            return null;
        },
        querySelectorAll(selector) {
            return [];
        },
        addEventListener() {},
        removeEventListener() {}
    };

    return { documentMock, registry, createElement };
}

(async () => {

    // =========================================================================
    // SECTION 1: INVARIANT 26 MODAL CLOSE BUTTONS
    // =========================================================================
    console.log("📍 STRESS AREA 1: SYSTEM INVARIANT AUDIT (26 MODAL CLOSE BUTTONS)");

    test("INV-1.1: Exact count of 26 SVG modal close buttons in index.html", () => {
        const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^\"']*[\"'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
        const matches = html.match(regex);
        assert.ok(matches, "No modal close buttons found!");
        assert.strictEqual(matches.length, 26, `Expected exactly 26 modal close buttons, found ${matches.length}`);
    });

    test("INV-1.2: Exact count of modal-close-btn class matches across index.html is strictly 26", () => {
        const classRegex = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g;
        const matches = html.match(classRegex);
        assert.ok(matches, "No modal-close-btn classes found!");
        assert.strictEqual(matches.length, 26, `Expected exactly 26 modal-close-btn classes, found ${matches.length}`);
    });

    test("INV-1.3: Zero instances of raw text close buttons ('✕' or 'X') in modal-close-btn", () => {
        const forbiddenRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^\"']*[\"'][^>]*>[^<]*(?:✕|✖|&times;|&#215;)[^<]*<\/button>/gi;
        const matches = html.match(forbiddenRegex);
        assert.strictEqual(matches, null, "Found forbidden raw unicode close buttons!");
    });

    test("INV-1.4: Line-by-line verification of all 26 modal-close-btn positions", () => {
        const lines = html.split('\n');
        const foundLines = [];
        const btnRegex = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/;
        lines.forEach((line, idx) => {
            if (btnRegex.test(line)) {
                foundLines.push(idx + 1);
            }
        });
        assert.strictEqual(foundLines.length, 26, `Expected 26 positions, found ${foundLines.length} at lines: ${foundLines.join(', ')}`);
        // Verify #tableConfigModal close button at line ~2406 was preserved
        assert.ok(foundLines.includes(2406), "Missing invariant close button at line 2406 (#tableConfigModal)");
    });

    // =========================================================================
    // SECTION 2: STRESS TEST deductInventoryForOrder & window.culinaryInventory
    // =========================================================================
    console.log("\n📍 STRESS AREA 2: deductInventoryForOrder & window.culinaryInventory INTEGRATION");

    test("DEDUCT-2.1: deductInventoryForOrder handles null, undefined, empty, and non-object gracefully", () => {
        const sandbox = {
            window: {},
            document: { addEventListener: () => {} },
            localStorage: { getItem: () => null, setItem: () => {} }
        };
        vm.createContext(sandbox);
        vm.runInContext(marketingJs, sandbox);

        assert.strictEqual(typeof sandbox.window.deductInventoryForOrder, 'function');

        // Adversarial inputs - should NEVER throw
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder(null));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder(undefined));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder(false));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder(""));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder(12345));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder([]));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({}));
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({ items: [] }));
    });

    test("DEDUCT-2.2: deductInventoryForOrder survives when window.culinaryInventory is missing or invalid", () => {
        const sandbox = {
            window: {},
            document: { addEventListener: () => {} },
            localStorage: { getItem: () => null, setItem: () => {} }
        };
        vm.createContext(sandbox);
        vm.runInContext(marketingJs, sandbox);

        // Subcase 1: culinaryInventory is undefined
        sandbox.window.culinaryInventory = undefined;
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({ items: [{ name: 'Samosa', qty: 2 }] }));

        // Subcase 2: culinaryInventory is null
        sandbox.window.culinaryInventory = null;
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({ items: [{ name: 'Samosa', qty: 2 }] }));

        // Subcase 3: culinaryInventory is empty object (deductOrder missing)
        sandbox.window.culinaryInventory = {};
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({ items: [{ name: 'Samosa', qty: 2 }] }));

        // Subcase 4: culinaryInventory.deductOrder is not a function
        sandbox.window.culinaryInventory = { deductOrder: 'not_a_func' };
        assert.doesNotThrow(() => sandbox.window.deductInventoryForOrder({ items: [{ name: 'Samosa', qty: 2 }] }));
    });

    test("DEDUCT-2.3: deductInventoryForOrder delegates accurately to window.culinaryInventory.deductOrder", () => {
        const sandbox = {
            window: {},
            document: { addEventListener: () => {} },
            localStorage: { getItem: () => null, setItem: () => {} }
        };
        vm.createContext(sandbox);
        vm.runInContext(marketingJs, sandbox);

        let delegatedOrder = null;
        sandbox.window.culinaryInventory = {
            deductOrder: (order) => {
                delegatedOrder = order;
            }
        };

        const testOrder = { id: 'ORD-999', items: [{ id: 1, name: 'Hot Chai', qty: 3 }], total: 60 };
        sandbox.window.deductInventoryForOrder(testOrder);
        assert.strictEqual(delegatedOrder, testOrder, "Order was not passed cleanly to culinaryInventory.deductOrder");
    });

    await testAsync("DEDUCT-2.4: Real culinaryInventory deduction execution with live ingredients & sub-recipes", async () => {
        const { documentMock, registry } = createDOMMock();
        const fetchCalls = [];
        const localStore = new Map();

        const sandbox = {
            window: {},
            document: documentMock,
            fetch: async (url, opts) => {
                fetchCalls.push({ url, opts });
                return { json: async () => ({}) };
            },
            localStorage: {
                getItem: (k) => localStore.get(k) || null,
                setItem: (k, v) => localStore.set(k, String(v)),
                removeItem: (k) => localStore.delete(k)
            },
            console: { log: () => {}, warn: () => {}, error: () => {} },
            setTimeout: (fn) => fn(),
            clearTimeout: () => {},
            Date: Date,
            Math: Math,
            parseInt: parseInt,
            parseFloat: parseFloat,
            isNaN: isNaN,
            Array: Array,
            JSON: JSON
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        // Load core.js first for escapeHtml
        vm.runInContext(coreJs, sandbox);
        // Load culinary_inventory.js
        vm.runInContext(culinaryJs, sandbox);
        // Load marketing_inventory.js
        vm.runInContext(marketingJs, sandbox);

        assert.ok(sandbox.window.culinaryInventory, "window.culinaryInventory must exist");
        assert.strictEqual(typeof sandbox.window.culinaryInventory.deductOrder, 'function');

        // Let's populate some initial stock for testing
        // Initialize culinary inventory
        await sandbox.window.culinaryInventory.init();

        // Check initial state of raw materials
        const initialRaw = JSON.parse(localStore.get('billnaw_culinary_materials') || '[]');
        assert.ok(initialRaw.length > 0, "Raw materials should be initialized");

        const maida = initialRaw.find(m => m.id === 'RM-MAIDA');
        const potato = initialRaw.find(m => m.id === 'RM-POTATO');
        const oil = initialRaw.find(m => m.id === 'RM-OIL');
        assert.ok(maida && potato && oil, "Required ingredients must exist in culinary materials");

        // Give them initial stock
        maida.current_stock = 10.0;
        potato.current_stock = 10.0;
        oil.current_stock = 10.0;
        localStore.set('billnaw_culinary_materials', JSON.stringify(initialRaw));

        // Re-init with populated stock
        await sandbox.window.culinaryInventory.init();

        // Now place an order for 10 Samosas via deductInventoryForOrder
        const order = {
            id: 'ORD-SAMOSA-10',
            rawItems: [
                { id: 1, name: 'Samosa', qty: 10 }
            ]
        };

        await sandbox.window.deductInventoryForOrder(order);

        // Samosa recipe uses: maida 0.04/qty, potato 0.05/qty, oil 0.015/qty
        // For 10 samosas: maida -0.4, potato -0.5, oil -0.15
        const updatedRaw = JSON.parse(localStore.get('billnaw_culinary_materials') || '[]');
        const updatedMaida = updatedRaw.find(m => m.id === 'RM-MAIDA');
        const updatedPotato = updatedRaw.find(m => m.id === 'RM-POTATO');
        const updatedOil = updatedRaw.find(m => m.id === 'RM-OIL');

        assert.strictEqual(updatedMaida.current_stock, 9.6, `Expected maida 9.6, got ${updatedMaida.current_stock}`);
        assert.strictEqual(updatedPotato.current_stock, 9.5, `Expected potato 9.5, got ${updatedPotato.current_stock}`);
        assert.strictEqual(updatedOil.current_stock, 9.85, `Expected oil 9.85, got ${updatedOil.current_stock}`);
    });

    await testAsync("DEDUCT-2.5: Adversarial stock deduction underflow protection (stock cannot go negative)", async () => {
        const { documentMock } = createDOMMock();
        const localStore = new Map();

        const sandbox = {
            window: {},
            document: documentMock,
            fetch: async () => ({ json: async () => ({}) }),
            localStorage: {
                getItem: (k) => localStore.get(k) || null,
                setItem: (k, v) => localStore.set(k, String(v))
            },
            console: { log: () => {}, warn: () => {}, error: () => {} },
            setTimeout: (fn) => fn(),
            clearTimeout: () => {},
            Date, Math, parseInt, parseFloat, isNaN, Array, JSON
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(coreJs, sandbox);
        vm.runInContext(culinaryJs, sandbox);
        vm.runInContext(marketingJs, sandbox);

        await sandbox.window.culinaryInventory.init();

        // Set stock close to 0
        const initialRaw = JSON.parse(localStore.get('billnaw_culinary_materials') || '[]');
        const maida = initialRaw.find(m => m.id === 'RM-MAIDA');
        maida.current_stock = 0.05;
        localStore.set('billnaw_culinary_materials', JSON.stringify(initialRaw));
        await sandbox.window.culinaryInventory.init();

        // Order 100 samosas (would deduct 4.0 kg, more than available 0.05 kg)
        const hugeOrder = {
            rawItems: [{ name: 'Samosa', qty: 100 }]
        };
        await sandbox.window.deductInventoryForOrder(hugeOrder);

        const updatedRaw = JSON.parse(localStore.get('billnaw_culinary_materials') || '[]');
        const updatedMaida = updatedRaw.find(m => m.id === 'RM-MAIDA');
        assert.strictEqual(updatedMaida.current_stock, 0, "Stock should clamp safely to 0 and NEVER become negative!");
    });

    // =========================================================================
    // SECTION 3: STRESS TEST DASHBOARD EXPENSE HANDLERS
    // =========================================================================
    console.log("\n📍 STRESS AREA 3: DASHBOARD EXPENSE HANDLERS (addExpense & editExpense)");

    test("EXP-3.1: addExpense() when modal inputs exist and are EMPTY -> rejects with validation toast", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const nameInput = createElement('input');
        nameInput.value = '';
        const costInput = createElement('input');
        costInput.value = '';

        registry.set('quickExpenseNameInput', nameInput);
        registry.set('quickExpenseCostInput', costInput);

        const toasts = [];
        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [],
            showToast: (msg) => toasts.push(msg),
            pushToGoogleSheetsQueue: () => {},
            persistExpensesFirebase: () => {},
            saveToLocal: () => {},
            renderExpensesUI: () => {},
            renderDashboardAnalytics: () => {},
            parseFloat: parseFloat,
            isNaN: isNaN,
            Date: Date
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        sandbox.window.addExpense();

        assert.strictEqual(sandbox.dailyExpenses.length, 0, "Must not add expense when inputs are empty");
        assert.strictEqual(toasts.length, 1);
        assert.strictEqual(toasts[0], "Please enter Item Name and Cost.");
    });

    test("EXP-3.2: addExpense() when name is whitespace or cost is invalid/negative -> rejects with validation toast", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const nameInput = createElement('input');
        const costInput = createElement('input');
        registry.set('quickExpenseNameInput', nameInput);
        registry.set('quickExpenseCostInput', costInput);

        const toasts = [];
        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [],
            showToast: (msg) => toasts.push(msg),
            parseFloat: parseFloat,
            isNaN: isNaN,
            Date: Date
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        // Case 1: whitespace only name
        nameInput.value = '    ';
        costInput.value = '100';
        sandbox.window.addExpense();
        assert.strictEqual(sandbox.dailyExpenses.length, 0);

        // Case 2: negative cost
        nameInput.value = 'Tomatoes';
        costInput.value = '-50';
        sandbox.window.addExpense();
        assert.strictEqual(sandbox.dailyExpenses.length, 0);

        // Case 3: zero cost
        costInput.value = '0';
        sandbox.window.addExpense();
        assert.strictEqual(sandbox.dailyExpenses.length, 0);

        // Case 4: non-numeric cost
        costInput.value = 'fifty_rupees';
        sandbox.window.addExpense();
        assert.strictEqual(sandbox.dailyExpenses.length, 0);
    });

    test("EXP-3.3: addExpense() with valid inputs -> records expense, clears inputs, updates UI and analytics", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const nameInput = createElement('input');
        nameInput.value = 'Fresh Dairy Milk';
        const costInput = createElement('input');
        costInput.value = '120.50';

        registry.set('quickExpenseNameInput', nameInput);
        registry.set('quickExpenseCostInput', costInput);

        const toasts = [];
        let uiRendered = false;
        let analyticsRendered = false;

        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [],
            showToast: (msg) => toasts.push(msg),
            pushToGoogleSheetsQueue: () => {},
            persistExpensesFirebase: () => {},
            saveToLocal: () => {},
            renderExpensesUI: () => { uiRendered = true; },
            renderDashboardAnalytics: () => { analyticsRendered = true; },
            parseFloat: parseFloat,
            isNaN: isNaN,
            Date: Date
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        sandbox.window.addExpense();

        assert.strictEqual(sandbox.dailyExpenses.length, 1, "Must add expense to dailyExpenses");
        assert.strictEqual(sandbox.dailyExpenses[0].name, 'Fresh Dairy Milk');
        assert.strictEqual(sandbox.dailyExpenses[0].cost, 120.50);
        assert.strictEqual(nameInput.value, '', "Must clear name input");
        assert.strictEqual(costInput.value, '', "Must clear cost input");
        assert.strictEqual(uiRendered, true, "Must call renderExpensesUI()");
        assert.strictEqual(analyticsRendered, true, "Must call renderDashboardAnalytics()");
        assert.ok(toasts.includes("Expense recorded."));
    });

    test("EXP-3.4: addExpense() when inputs are completely ABSENT from DOM -> safely calls openQuickExpenseModal() without throwing", () => {
        const { documentMock } = createDOMMock(); // empty DOM registry

        let modalOpened = false;
        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [],
            openQuickExpenseModal: () => { modalOpened = true; },
            showToast: () => {}
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        assert.doesNotThrow(() => sandbox.window.addExpense());
        assert.strictEqual(modalOpened, true, "Should delegate to openQuickExpenseModal when inputs are absent");
    });

    test("EXP-3.5: editExpense(id) when modal is PRESENT -> populates editId, inputs, sets title, shows modal", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const modal = createElement('div');
        const editIdInput = createElement('input');
        const nameInput = createElement('input');
        const costInput = createElement('input');
        const modalTitle = createElement('h2');

        registry.set('quickExpenseModal', modal);
        registry.set('quickExpenseEditId', editIdInput);
        registry.set('quickExpenseNameInput', nameInput);
        registry.set('quickExpenseCostInput', costInput);
        registry.set('quickExpenseModalTitle', modalTitle);

        const sampleExpense = { id: 888123, name: 'Cooking Gas Cylinder', cost: 1100.00 };
        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [sampleExpense],
            setTimeout: (fn) => fn()
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        sandbox.window.editExpense(888123);

        assert.strictEqual(editIdInput.value, 888123);
        assert.strictEqual(nameInput.value, 'Cooking Gas Cylinder');
        assert.strictEqual(costInput.value, 1100.00);
        assert.strictEqual(modalTitle.innerText, 'Edit Expense');
        assert.strictEqual(modal.style.display, 'flex');
        assert.strictEqual(modal.getAttribute('aria-hidden'), 'false');
    });

    test("EXP-3.6: editExpense(id) with non-existent ID -> cleanly returns without doing anything or throwing", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const modal = createElement('div');
        registry.set('quickExpenseModal', modal);

        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [{ id: 101, name: 'Sugar', cost: 50 }]
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        assert.doesNotThrow(() => sandbox.window.editExpense(999999));
        assert.strictEqual(modal.style.display, undefined, "Modal should not be opened for non-existent expense");
    });

    test("EXP-3.7: editExpense(id) when modal is ABSENT from DOM -> safely checks fallbacks without TypeError", () => {
        const { documentMock } = createDOMMock(); // empty registry: NO quickExpenseModal, NO expenseName, NO expenseCost

        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [{ id: 777, name: 'Coffee Beans', cost: 650 }]
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        // In original code, this threw TypeError: Cannot set properties of null (setting 'value')
        // Now with null safety checks (if (nameEl) ...), it MUST NOT throw!
        assert.doesNotThrow(() => sandbox.window.editExpense(777));
    });

    test("EXP-3.8: editExpense(id) when legacy inputs exist without modal -> populates them safely", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const legacyName = createElement('input');
        const legacyCost = createElement('input');
        registry.set('expenseName', legacyName);
        registry.set('expenseCost', legacyCost);

        const sandbox = {
            window: {},
            document: documentMock,
            dailyExpenses: [{ id: 456, name: 'Disposable Cups', cost: 250 }]
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(dashboardJs, sandbox);

        assert.doesNotThrow(() => sandbox.window.editExpense(456));
        assert.strictEqual(legacyName.value, 'Disposable Cups');
        assert.strictEqual(legacyCost.value, 250);
    });

    // =========================================================================
    // SECTION 4: STRESS TEST MENU RENDERING IN js/menu.js
    // =========================================================================
    console.log("\n📍 STRESS AREA 4: MENU RENDERING IN js/menu.js (EMPTY & FULL ARRAYS)");

    test("MENU-4.1: renderMenuCatalogUI() when menuItems is EMPTY -> renders clean empty state", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const cleanCardsList = createElement('div');
        const countBadge = createElement('span');
        const invCount = createElement('span');
        const catCount = createElement('span');
        const chips = createElement('div');

        registry.set('cleanItemCardsList', cleanCardsList);
        registry.set('catalogItemCountBadge', countBadge);
        registry.set('menuInventoryCount', invCount);
        registry.set('menuCategoriesCount', catCount);
        registry.set('catalogCategoryChips', chips);

        const sandbox = {
            window: {},
            document: documentMock,
            menuItems: [],
            menuCategories: ['All'],
            catalogActiveCategoryFilter: 'All',
            getStoreGstConfig: () => ({ mode: 'none', defaultRate: 5 }),
            escapeHtml: (s) => String(s || ''),
            Number: Number
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(menuJs, sandbox);

        assert.doesNotThrow(() => sandbox.window.renderMenuCatalogUI());

        assert.strictEqual(invCount.innerText, 0);
        assert.strictEqual(catCount.innerText, 0);
        assert.strictEqual(countBadge.innerText, '0 Items');
        assert.ok(cleanCardsList.innerHTML.includes('No menu items found matching current search.'));
        assert.ok(!cleanCardsList.innerHTML.includes('undefined'));
    });

    test("MENU-4.2: renderMenuCatalogUI() with 1 item -> displays singular '1 Item' badge and 1 clean card", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const cleanCardsList = createElement('div');
        const countBadge = createElement('span');
        registry.set('cleanItemCardsList', cleanCardsList);
        registry.set('catalogItemCountBadge', countBadge);

        const sampleItem = {
            id: 101,
            name: 'Kolkata Masala Chai',
            category: 'Beverages',
            price: 25.0,
            trackStock: true,
            stockQty: 20
        };

        const sandbox = {
            window: {},
            document: documentMock,
            menuItems: [sampleItem],
            menuCategories: ['All', 'Beverages'],
            catalogActiveCategoryFilter: 'All',
            getStoreGstConfig: () => ({ mode: 'none', defaultRate: 5 }),
            escapeHtml: (s) => String(s || ''),
            Number: Number,
            generateFallbackImage: () => 'data:image/svg+xml;utf8,<svg></svg>'
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(menuJs, sandbox);

        sandbox.window.renderMenuCatalogUI();

        assert.strictEqual(countBadge.innerText, '1 Item', "Must use singular '1 Item'");
        assert.ok(cleanCardsList.innerHTML.includes('clean-item-card'));
        assert.ok(cleanCardsList.innerHTML.includes('Kolkata Masala Chai'));
        assert.ok(cleanCardsList.innerHTML.includes('₹ 25.00'));
        assert.ok(cleanCardsList.innerHTML.includes('20 in stock'));
    });

    test("MENU-4.3: renderMenuCatalogUI() with 30 items across multiple stock levels and categories", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const cleanCardsList = createElement('div');
        const countBadge = createElement('span');
        registry.set('cleanItemCardsList', cleanCardsList);
        registry.set('catalogItemCountBadge', countBadge);

        const fullItems = [];
        for (let i = 1; i <= 30; i++) {
            fullItems.push({
                id: i,
                name: `Dish Item ${i}`,
                category: i % 3 === 0 ? 'Beverages' : (i % 3 === 1 ? 'Snacks' : 'Meals'),
                price: 50 + i * 5,
                trackStock: i % 4 !== 0,
                stockQty: i % 4 === 1 ? 15 : (i % 4 === 2 ? 3 : 0) // in-stock, low, out
            });
        }

        const sandbox = {
            window: {},
            document: documentMock,
            menuItems: fullItems,
            menuCategories: ['All', 'Beverages', 'Snacks', 'Meals'],
            catalogActiveCategoryFilter: 'All',
            getStoreGstConfig: () => ({ mode: 'none', defaultRate: 5 }),
            escapeHtml: (s) => String(s || ''),
            Number: Number,
            generateFallbackImage: () => 'data:image/svg+xml;utf8,<svg></svg>'
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(menuJs, sandbox);

        sandbox.window.renderMenuCatalogUI();

        assert.strictEqual(countBadge.innerText, '30 Items');
        const cardMatches = cleanCardsList.innerHTML.match(/class="clean-item-card"/g);
        assert.strictEqual(cardMatches.length, 30, "All 30 cards should be rendered");

        // Now test category filtering
        sandbox.catalogActiveCategoryFilter = 'Beverages';
        sandbox.window.renderMenuCatalogUI();
        const bevCards = cleanCardsList.innerHTML.match(/class="clean-item-card"/g);
        assert.strictEqual(bevCards.length, 10, "Should filter strictly to 10 Beverages");
    });

    test("MENU-4.4: renderMenuCatalogUI() with adversarial items (XSS tags, missing fields, extreme prices)", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const cleanCardsList = createElement('div');
        registry.set('cleanItemCardsList', cleanCardsList);

        const maliciousItems = [
            {
                id: 991,
                name: '<script>alert("xss")</script>',
                category: '<img src=x onerror=alert(1)>',
                price: 0,
                trackStock: false
            },
            {
                id: 992,
                name: 'Minimal Dish Without Optional Props',
                price: 999999.99
            }
        ];

        const escapeCalls = [];
        const sandbox = {
            window: {},
            document: documentMock,
            menuItems: maliciousItems,
            menuCategories: ['All'],
            catalogActiveCategoryFilter: 'All',
            getStoreGstConfig: () => ({ mode: 'none', defaultRate: 5 }),
            escapeHtml: (s) => {
                escapeCalls.push(s);
                return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            },
            Number: Number,
            generateFallbackImage: () => 'data:image/svg+xml;utf8,<svg></svg>'
        };
        sandbox.window = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(menuJs, sandbox);

        assert.doesNotThrow(() => sandbox.window.renderMenuCatalogUI());
        // Verify script tag was escaped and not injected raw
        assert.ok(!cleanCardsList.innerHTML.includes('<script>alert('), "Must not contain raw unescaped script tag!");
        assert.ok(cleanCardsList.innerHTML.includes('&lt;script&gt;alert('), "Must contain escaped script tag");
        assert.ok(cleanCardsList.innerHTML.includes('₹ 999999.99'));
    });

    test("MENU-4.5: js/menu.js contains ZERO occurrences of menuTable or menuTableBody", () => {
        assert.strictEqual(menuJs.includes('menuTableBody'), false, "menuTableBody should be completely removed from js/menu.js");
        assert.strictEqual(menuJs.includes('const menuTable'), false, "menuTable declaration should be pruned");
    });

    // =========================================================================
    // SECTION 5: STRESS TEST UTILITIES & DEDUPLICATION INTEGRITY
    // =========================================================================
    console.log("\n📍 STRESS AREA 5: CORE UTILITIES & DEDUPLICATION INTEGRITY");

    test("UTIL-5.1: formatCurrency(amount) format edge cases (0, negative, floating point, invalid)", () => {
        const sandbox = { window: {}, Intl: Intl, Number: Number, isNaN: isNaN };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(coreJs, sandbox);

        const formatCurrency = sandbox.window.formatCurrency;
        assert.strictEqual(typeof formatCurrency, 'function');

        // Normal values
        assert.strictEqual(formatCurrency(0), '₹0.00');
        assert.strictEqual(formatCurrency(50), '₹50.00');
        assert.strictEqual(formatCurrency(1250.75), '₹1,250.75');
        assert.strictEqual(formatCurrency('100.5'), '₹100.50');

        // Large Indian Lakhs formatting
        assert.strictEqual(formatCurrency(100000), '₹1,00,000.00');

        // Negative values
        assert.strictEqual(formatCurrency(-45), '-₹45.00');

        // Invalid values
        assert.strictEqual(formatCurrency(null), '₹0.00');
        assert.strictEqual(formatCurrency(undefined), '₹0.00');
        assert.strictEqual(formatCurrency('abc'), '₹0.00');
        assert.strictEqual(formatCurrency(NaN), '₹0.00');
    });

    test("UTIL-5.2: getLocalISODate() handles undefined, valid date, and invalid date strings", () => {
        const sandbox = { window: {}, Date: Date, isNaN: isNaN };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(coreJs, sandbox);

        const getLocalISODate = sandbox.window.getLocalISODate;
        assert.strictEqual(typeof getLocalISODate, 'function');

        // Undefined / default -> today's date format YYYY-MM-DD
        const today = getLocalISODate();
        assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

        // Specific Date object
        const specific = new Date('2026-10-25T15:30:00Z');
        assert.strictEqual(getLocalISODate(specific), '2026-10-25');

        // Invalid date string fallback
        assert.doesNotThrow(() => {
            const fb = getLocalISODate('invalid-date-xyz');
            assert.match(fb, /^\d{4}-\d{2}-\d{2}$/);
        });
    });

    test("UTIL-5.3: showToast(message, type) polymorphic toast class attachment", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const toastEl = createElement('div');
        registry.set('toast', toastEl);

        const sandbox = {
            window: {},
            document: documentMock,
            setTimeout: (fn) => fn(),
            clearTimeout: () => {}
        };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(coreJs, sandbox);

        const showToast = sandbox.window.showToast;
        assert.strictEqual(typeof showToast, 'function');

        // Info type
        showToast("Normal info");
        assert.strictEqual(toastEl.innerText, "Normal info");
        assert.ok(toastEl.classList.contains('toast-info'));

        // Success type
        showToast("All saved!", "success");
        assert.strictEqual(toastEl.innerText, "All saved!");
        assert.ok(toastEl.classList.contains('toast-success'));
        assert.ok(!toastEl.classList.contains('toast-info'));

        // Error type
        showToast("Error occurred", "error");
        assert.ok(toastEl.classList.contains('toast-error'));
        assert.ok(!toastEl.classList.contains('toast-success'));

        // Warning type
        showToast("Low stock alert", "warning");
        assert.ok(toastEl.classList.contains('toast-warning'));
    });

    test("UTIL-5.4: openModal(modalId) and closeModal(modalId) manipulate style and aria-hidden safely", () => {
        const { documentMock, createElement, registry } = createDOMMock();
        const modal = createElement('div');
        registry.set('myTestModal', modal);

        const sandbox = {
            window: {},
            document: documentMock
        };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(coreJs, sandbox);

        const openModal = sandbox.window.openModal;
        const closeModal = sandbox.window.closeModal;

        assert.strictEqual(typeof openModal, 'function');
        assert.strictEqual(typeof closeModal, 'function');

        openModal('myTestModal');
        assert.strictEqual(modal.style.display, 'flex');
        assert.strictEqual(modal.getAttribute('aria-hidden'), 'false');

        closeModal('myTestModal');
        assert.strictEqual(modal.style.display, 'none');
        assert.strictEqual(modal.getAttribute('aria-hidden'), 'true');

        // Calling on non-existent modal ID does not throw
        assert.doesNotThrow(() => openModal('nonExistentModal'));
        assert.doesNotThrow(() => closeModal('nonExistentModal'));
    });

    test("DEDUP-5.5: app.js does not define competing loadLazyScript", () => {
        assert.strictEqual(appJs.includes('function loadLazyScript'), false, "Duplicate loadLazyScript must be pruned from app.js");
        assert.strictEqual(coreJs.includes('function loadLazyScript'), true, "Authoritative loadLazyScript must exist in js/core.js");
    });

    test("DEDUP-5.6: js/culinary_inventory.js does not define competing escapeHtml", () => {
        assert.strictEqual(culinaryJs.includes('function escapeHtml'), false, "Duplicate escapeHtml must be pruned from js/culinary_inventory.js");
        assert.strictEqual(coreJs.includes('function escapeHtml'), true, "Authoritative escapeHtml must exist in js/core.js");
    });

    test("DEDUP-5.7: js/settings.js does not define competing saveTableSettings", () => {
        assert.strictEqual(settingsJs.includes('function saveTableSettings'), false, "Duplicate saveTableSettings must be pruned from js/settings.js");
        assert.ok(html.includes('function saveTableSettings()'), "Authoritative saveTableSettings must exist in index.html for #tableManagementModal");
    });

    test("DEDUP-5.8: js/settings.js openTableConfigModal redirects to openTableManagementModal", () => {
        const { documentMock } = createDOMMock();
        let tableManagementOpened = false;

        const sandbox = {
            window: {},
            document: documentMock,
            openTableManagementModal: () => { tableManagementOpened = true; }
        };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(settingsJs, sandbox);

        sandbox.window.openTableConfigModal();
        assert.strictEqual(tableManagementOpened, true, "openTableConfigModal must redirect to openTableManagementModal");
    });

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n==============================================================================");
    console.log(`📊 ADVERSARIAL STRESS SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==============================================================================");

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log("✨ ALL 25 ADVERSARIAL STRESS TESTS PASSED WITH 0 FAILURES!\n");
        process.exit(0);
    }
})();
