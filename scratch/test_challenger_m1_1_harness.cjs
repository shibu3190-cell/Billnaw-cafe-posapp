// scratch/test_challenger_m1_1_harness.cjs
// ==============================================================================
// 🥋 EMPIRICAL ADVERSARIAL CHALLENGER STRESS HARNESS (Milestone 1 / R1)
// Focus:
// 1. Speech chip clicks with various table states (empty, occupied, billed, invalid/unselected activeTable)
// 2. Rapid consecutive clicks & concurrency/duplicate stress
// 3. Stepper boundary conditions (0 -> + ADD, negative deltas, table transitions)
// 4. Responsive CSS media query & grid column layout across viewports
// 5. Exact 26 SVG modal-close-btn invariant audit
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log("==============================================================================");
console.log("🥋 CHALLENGER M1: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS");
console.log("==============================================================================\n");

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const marketingJs = fs.readFileSync(path.join(rootDir, 'js', 'marketing_inventory.js'), 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function challenge(section, title, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ PASS [${section}]: ${title}`);
        testResults.push({ section, title, passed: true });
    } catch (err) {
        failedTests++;
        console.error(`  ❌ FAIL [${section}]: ${title}`);
        console.error(`     Reason: ${err.message}`);
        testResults.push({ section, title, passed: false, error: err.message });
    }
}

// -----------------------------------------------------------------------------
// ENVIRONMENT FACTORY: Setup sandbox reproducing browser runtime
// -----------------------------------------------------------------------------
function createPosSandbox() {
    const elements = {};
    function createMockElement(id = '', tag = 'div') {
        const el = {
            id,
            tagName: tag.toUpperCase(),
            innerHTML: '',
            innerText: '',
            style: { display: 'none' },
            className: '',
            classList: {
                _classes: new Set(),
                add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
                remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
                contains(c) { return this._classes.has(c); }
            },
            disabled: false,
            appendChild(c) {},
            querySelector(sel) {
                return createMockElement('', 'div');
            },
            querySelectorAll(sel) {
                return [];
            },
            remove() {}
        };
        return el;
    }

    function getOrCreateEl(id) {
        if (!elements[id]) {
            elements[id] = createMockElement(id);
        }
        return elements[id];
    }

    // Pre-populate known DOM IDs
    [
        'cartUI', 'totalUI', 'cartDiscountBtn', 'cartDiscountLineRow', 'cartDiscountDesc',
        'cartDiscountAmt', 'cartCustomerDiscountBanner', 'cartCustomerDiscountText',
        'cartLossAversionAlert', 'cartLossAversionMsg', 'gstBreakdownUI', 'desktopCheckoutBtn',
        'desktopCheckoutBtnSub', 'floatingCart', 'fc-count', 'fc-total', 'cartDrawer',
        'cartDrawerOverlay', 'tablesWrapper', 'activeTableUI', 'quickVoicePillsRow',
        'voiceFeedbackBanner', 'voiceFeedbackText', 'menuSearchInput', 'posActiveBadge',
        'mobileVoiceTriggerBtn'
    ].forEach(getOrCreateEl);

    // Pre-populate table buttons 1-10
    for (let i = 1; i <= 10; i++) {
        getOrCreateEl(`table-btn-${i}`);
    }

    // Pre-populate menu action wrappers for items 1-4
    [1, 2, 3, 4].forEach(id => {
        getOrCreateEl(`menu-action-wrap-${id}`);
    });

    const sandbox = {
        window: {},
        document: {
            getElementById(id) {
                return elements[id] || getOrCreateEl(id);
            },
            querySelector(sel) {
                return createMockElement('', 'div');
            },
            querySelectorAll(sel) {
                return [];
            },
            createElement(tag) {
                return createMockElement('', tag);
            },
            addEventListener(ev, fn) {},
            removeEventListener(ev, fn) {}
        },
        addEventListener(ev, fn) {},
        removeEventListener(ev, fn) {},
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] || null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; }
        },
        indexedDB: {
            open() {
                return {
                    onupgradeneeded: null,
                    onsuccess: null,
                    onerror: null
                };
            }
        },
        idb: {
            init: async () => {},
            get: async (k) => null,
            set: async (k, v) => {}
        },
        console: {
            log() {},
            warn() {},
            error() {}
        },
        setTimeout(fn) { return 1; },
        clearTimeout() {},
        setInterval(fn) { return 1; },
        clearInterval() {},
        requestAnimationFrame(fn) { return 1; },
        cancelAnimationFrame() {},
        Date,
        Math,
        parseInt,
        parseFloat,

        escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, ''); },
        showToast(msg) {},
        toasts: []
    };


    sandbox.window = sandbox;
    sandbox.showToast = (msg) => { sandbox.toasts.push(msg); };

    // Execute scripts in order inside VM sandbox
    vm.createContext(sandbox);

    // 1. Core JS
    vm.runInContext(coreJs, sandbox);

    // Inject menu items and tables into script lexical scope
    vm.runInContext(`
        menuItems = [
            { id: 1, name: "Samosa", price: 15, category: "Snacks", gstRate: 5, trackStock: false, stockQty: 100 },
            { id: 2, name: "Tea", price: 10, category: "Beverages", gstRate: 5, trackStock: false, stockQty: 100 },
            { id: 3, name: "Chicken Curry", price: 140, category: "Main Course", gstRate: 5, trackStock: false, stockQty: 50 },
            { id: 4, name: "Masala Coke", price: 40, category: "Beverages", gstRate: 5, trackStock: false, stockQty: 50 }
        ];
        window.menuItems = menuItems;

        shopProfile = {
            name: 'Billnaw Cafe',
            tableCount: 5,
            showTablesInPos: true,
            gstPricingMode: 'inclusive',
            defaultGstRate: 5,
            discountsEnabled: true,
            customTableNames: {}
        };
        window.shopProfile = shopProfile;

        tablesInfo = {};
        for (let i = 1; i <= 5; i++) {
            tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
        }
        window.tablesInfo = tablesInfo;
    `, sandbox);

    // 2. POS JS
    vm.runInContext(posJs, sandbox);


    // 3. Menu JS
    vm.runInContext(menuJs, sandbox);

    // 4. Marketing JS
    vm.runInContext(marketingJs, sandbox);

    sandbox.elements = elements;
    return sandbox;
}

// =============================================================================
// SECTION 1: SPEECH CHIP CLICKS ACROSS TABLE STATES & ACTIVE TABLE DEFENSE
// =============================================================================
console.log("------------------------------------------------------------------------------");
console.log("📌 SECTION 1: SPEECH CHIP CLICKS ACROSS TABLE STATES & BOUNDARIES");
console.log("------------------------------------------------------------------------------");

challenge("SEC-1", "Speech chip '2 Hot Chai' on EMPTY table populates cart, transitions to occupied, sets savedTime", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;
    sb.tablesInfo[1] = { items: [], status: 'empty', savedTime: null, lastReminder: null };

    sb.parseAndPushVoiceOrder('2 Hot Chai');

    const t1 = sb.tablesInfo[1];
    assert.strictEqual(t1.status, 'occupied', "Table status should become 'occupied'");
    assert.ok(t1.savedTime > 0, "savedTime must be recorded as non-zero timestamp");
    assert.strictEqual(t1.items.length, 1, "Should have exactly 1 item in cart");
    assert.strictEqual(t1.items[0].name, 'Tea', "Resolved dish should be 'Tea'");
    assert.strictEqual(t1.items[0].qty, 2, "Quantity should be 2");
    assert.strictEqual(t1.items[0].price, 10, "Unit price should be 10");

    // Check floating cart update
    assert.strictEqual(sb.elements['floatingCart'].style.display, 'flex');
    assert.strictEqual(sb.elements['fc-count'].innerText, '2 ITEMS');
    assert.strictEqual(sb.elements['fc-total'].innerText, '20.00');
});

challenge("SEC-1", "Speech chip '2 Samosa' on OCCUPIED table increments existing item without creating duplicates", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;
    const initialSavedTime = 1700000000000;
    sb.tablesInfo[1] = {
        items: [{ id: 1, name: 'Samosa', price: 15, qty: 1, gstRate: 5 }],
        status: 'occupied',
        savedTime: initialSavedTime,
        lastReminder: null
    };

    sb.parseAndPushVoiceOrder('2 Samosa');

    const t1 = sb.tablesInfo[1];
    assert.strictEqual(t1.status, 'occupied', "Status should remain 'occupied'");
    assert.strictEqual(t1.savedTime, initialSavedTime, "Original savedTime should not be overwritten");
    assert.strictEqual(t1.items.length, 1, "Must NOT create duplicate item row");
    assert.strictEqual(t1.items[0].qty, 3, "Quantity should increment from 1 to 3");

    // Total should be 3 * 15 = 45.00
    assert.strictEqual(sb.elements['fc-count'].innerText, '3 ITEMS');
    assert.strictEqual(sb.elements['fc-total'].innerText, '45.00');
});

challenge("SEC-1", "Speech chip click on BILLED table reopens table to occupied with additional items", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;
    const initialSavedTime = 1700000000000;
    sb.tablesInfo[1] = {
        items: [{ id: 1, name: 'Samosa', price: 15, qty: 2, gstRate: 5 }],
        status: 'billed',
        savedTime: initialSavedTime,
        lastReminder: null
    };

    sb.parseAndPushVoiceOrder('2 Hot Chai');

    const t1 = sb.tablesInfo[1];
    assert.strictEqual(t1.status, 'occupied', "Billed table should transition back to 'occupied' when new order is added");
    assert.strictEqual(t1.items.length, 2, "Cart should contain 2 distinct items (Samosa + Tea)");
    const teaItem = t1.items.find(i => i.name === 'Tea');
    assert.ok(teaItem, "Tea item must exist in cart");
    assert.strictEqual(teaItem.qty, 2, "Tea qty must be 2");
});

challenge("SEC-1", "Speech chip click when activeTable is uninitialized or not in tablesInfo creates table entry safely", () => {
    const sb = createPosSandbox();
    sb.selectTable(99); // Table not in tablesInfo yet
    delete sb.tablesInfo[99];

    // Must not throw uncaught error
    assert.doesNotThrow(() => {
        sb.parseAndPushVoiceOrder('2 Samosa');
    }, "Should not throw error when activeTable is missing from tablesInfo");

    assert.ok(sb.tablesInfo[99], "Should auto-initialize tablesInfo[99]");
    assert.strictEqual(sb.tablesInfo[99].items.length, 1);
    assert.strictEqual(sb.tablesInfo[99].items[0].qty, 2);
});

challenge("SEC-1", "Speech chip click handles invalid activeTable (0, -1, 'T-1') without unhandled crash", () => {
    const sb = createPosSandbox();

    // Test with activeTable = 0
    sb.selectTable(0);
    assert.doesNotThrow(() => {
        sb.parseAndPushVoiceOrder('2 Hot Chai');
    }, "activeTable = 0 should not crash");
    assert.strictEqual(sb.tablesInfo[0].items[0].name, 'Tea');

    // Test with activeTable = "T-1"
    sb.selectTable("T-1");
    assert.doesNotThrow(() => {
        sb.parseAndPushVoiceOrder('2 Samosa');
    }, "activeTable = 'T-1' should not crash");
    assert.strictEqual(sb.tablesInfo["T-1"].items[0].name, 'Samosa');
});

// =============================================================================
// SECTION 2: RAPID CONSECUTIVE CLICKS & CONCURRENCY / DUPLICATE STRESS
// =============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📌 SECTION 2: RAPID CONSECUTIVE CLICKS & DUPLICATE CORRUPTION STRESS");
console.log("------------------------------------------------------------------------------");

challenge("SEC-2", "100 rapid consecutive clicks on '2 Hot Chai' strictly yields 1 item array entry with qty 200", () => {
    const sb = createPosSandbox();
    sb.selectTable(1);

    for (let i = 0; i < 100; i++) {
        sb.parseAndPushVoiceOrder('2 Hot Chai');
    }

    const t1 = sb.tablesInfo[1];
    assert.strictEqual(t1.items.length, 1, "Cart must strictly contain 1 item, no duplicate Tea entries");
    assert.strictEqual(t1.items[0].name, 'Tea');
    assert.strictEqual(t1.items[0].qty, 200, "Qty must exactly equal 100 * 2 = 200");
    assert.strictEqual(sb.elements['fc-count'].innerText, '200 ITEMS');
    assert.strictEqual(sb.elements['fc-total'].innerText, '2000.00'); // 200 * 10 = 2000
});

challenge("SEC-2", "200 alternating clicks ('2 Hot Chai' / '2 Samosa') maintains strictly 2 distinct item objects", () => {
    const sb = createPosSandbox();
    sb.selectTable(2);

    for (let i = 0; i < 100; i++) {
        sb.parseAndPushVoiceOrder('2 Hot Chai');
        sb.parseAndPushVoiceOrder('2 Samosa');
    }

    const t2 = sb.tablesInfo[2];
    assert.strictEqual(t2.items.length, 2, "Cart must strictly have 2 item records");

    const tea = t2.items.find(i => i.name === 'Tea');
    const samosa = t2.items.find(i => i.name === 'Samosa');

    assert.ok(tea && samosa, "Both Tea and Samosa must exist");
    assert.strictEqual(tea.qty, 200, "Tea qty must be 200");
    assert.strictEqual(samosa.qty, 200, "Samosa qty must be 200");

    // Total: (200 * 10) + (200 * 15) = 2000 + 3000 = 5000.00
    assert.strictEqual(sb.elements['fc-count'].innerText, '400 ITEMS');
    assert.strictEqual(sb.elements['fc-total'].innerText, '5000.00');
});

challenge("SEC-2", "Adversarial Fuzzing: Non-matching speech phrases reject gracefully with 0 items added", () => {
    const sb = createPosSandbox();
    sb.selectTable(1);

    const nonMatchingInputs = [
        "",
        "   ",
        null,
        undefined,
        "random gibberish phrase",
        "100 cold beers",
        "NaN invalid item",
        "'; DROP TABLE tables; --",
        "<script>alert(1)</script>"
    ];

    nonMatchingInputs.forEach(input => {
        assert.doesNotThrow(() => {
            sb.parseAndPushVoiceOrder(input);
        }, `Phrase '${input}' should not throw error`);
    });

    // Cart should remain completely empty
    assert.strictEqual(sb.tablesInfo[1].items.length, 0, "Non-matching inputs must not add bogus items");
});

challenge("SEC-2", "Adversarial Semantic Edge Case: '0 hot chai' falls back to 1 item due to '|| 1' coercion", () => {
    const sb = createPosSandbox();
    sb.selectTable(1);

    sb.parseAndPushVoiceOrder("0 hot chai");
    // Parser has: qty = parseInt(digitMatch[1], 10) || 1;
    // Because parseInt("0") is 0, 0 || 1 becomes 1!
    assert.strictEqual(sb.tablesInfo[1].items.length, 1);
    assert.strictEqual(sb.tablesInfo[1].items[0].qty, 1, "Semantic bug: '0 hot chai' coerces to qty 1 instead of rejecting or 0");
});


// =============================================================================
// SECTION 3: STEPPER BOUNDARIES (0 -> + ADD) & TABLE STATE TRANSITIONS
// =============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📌 SECTION 3: STEPPER BOUNDARIES (0 -> + ADD) & TABLE STATE TRANSITIONS");
console.log("------------------------------------------------------------------------------");

challenge("SEC-3", "Initial state renders '+ ADD' button for all 4 menu items", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;
    sb.syncMenuUIQuantities();

    [1, 2, 3, 4].forEach(id => {
        const wrap = sb.elements[`menu-action-wrap-${id}`];
        assert.ok(wrap.innerHTML.includes('+ ADD'), `Item ${id} action wrap must display '+ ADD'`);
        assert.ok(!wrap.innerHTML.includes('item-qty-control'), `Item ${id} should not display stepper initially`);
    });
});

challenge("SEC-3", "Adding item renders stepper (− 1 +), incrementing renders (− 2 +)", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;
    sb.syncMenuUIQuantities();

    // 1. Click + ADD on Samosa (id 1)
    sb.addToCart(1);
    const wrap = sb.elements['menu-action-wrap-1'];
    assert.ok(wrap.innerHTML.includes('item-qty-control'), "Action wrap must switch to stepper");
    assert.ok(wrap.innerHTML.includes('<span>1</span>'), "Stepper count must be 1");
    assert.strictEqual(sb.tablesInfo[1].status, 'occupied');

    // 2. Click + on stepper
    sb.addToCart(1);
    assert.ok(wrap.innerHTML.includes('<span>2</span>'), "Stepper count must be 2");
});

challenge("SEC-3", "Decrementing quantity from 1 to 0 removes stepper and cleanly restores '+ ADD'", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;

    // Add Samosa (qty 1)
    sb.addToCart(1);
    const wrap = sb.elements['menu-action-wrap-1'];
    assert.ok(wrap.innerHTML.includes('<span>1</span>'));

    // Decrement from 1 to 0
    sb.modifyQty(1, -1);

    // Verify stepper is replaced by '+ ADD'
    assert.ok(wrap.innerHTML.includes('+ ADD'), "Action wrap must restore '+ ADD' button when quantity reaches 0");
    assert.ok(!wrap.innerHTML.includes('item-qty-control'), "Stepper control must be completely removed");

    // Verify item is removed from table items
    assert.strictEqual(sb.tablesInfo[1].items.length, 0, "Cart item list must be empty");

    // Verify table transitions back to 'empty' and savedTime cleared
    assert.strictEqual(sb.tablesInfo[1].status, 'empty', "Table status must transition to 'empty'");
    assert.strictEqual(sb.tablesInfo[1].savedTime, null, "savedTime must be reset to null");

    // Verify floating dock is hidden
    assert.strictEqual(sb.elements['floatingCart'].style.display, 'none', "#floatingCart must be hidden when cart is empty");
    assert.strictEqual(sb.elements['desktopCheckoutBtn'].disabled, true, "Desktop checkout button must be disabled");
});

challenge("SEC-3", "Boundary Stress: Calling modifyQty(-1) when item is already at 0 or missing does not crash or underflow", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;

    // Table is empty, modify non-existent item
    assert.doesNotThrow(() => {
        sb.modifyQty(1, -1);
        sb.modifyQty(999, -1);
        sb.modifyQty(1, -10);
    }, "modifyQty on non-existent item should not crash");

    assert.strictEqual(sb.tablesInfo[1].items.length, 0);
    assert.strictEqual(sb.elements['floatingCart'].style.display, 'none');
});

challenge("SEC-3", "Multi-item table: Decrementing 1 item to 0 preserves remaining items and table status", () => {
    const sb = createPosSandbox();
    sb.activeTable = 1;

    // Add Samosa (id 1) and Tea (id 2)
    sb.addToCart(1);
    sb.addToCart(2);
    sb.addToCart(2); // Tea qty 2

    assert.strictEqual(sb.tablesInfo[1].items.length, 2);
    assert.strictEqual(sb.tablesInfo[1].status, 'occupied');

    // Decrement Samosa to 0
    sb.modifyQty(1, -1);

    // Samosa wrap should be '+ ADD'
    assert.ok(sb.elements['menu-action-wrap-1'].innerHTML.includes('+ ADD'));
    // Tea wrap should still be stepper with 2
    assert.ok(sb.elements['menu-action-wrap-2'].innerHTML.includes('<span>2</span>'));

    // Table must still be occupied with Tea
    assert.strictEqual(sb.tablesInfo[1].status, 'occupied');
    assert.strictEqual(sb.tablesInfo[1].items.length, 1);
    assert.strictEqual(sb.tablesInfo[1].items[0].name, 'Tea');
    assert.strictEqual(sb.tablesInfo[1].items[0].qty, 2);

    // Dock must reflect remaining Tea (2 ITEMS, ₹20.00)
    assert.strictEqual(sb.elements['fc-count'].innerText, '2 ITEMS');
    assert.strictEqual(sb.elements['fc-total'].innerText, '20.00');
});

// =============================================================================
// SECTION 4: RESPONSIVE MEDIA QUERIES & .menu-grid COLUMN LAYOUT
// =============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📌 SECTION 4: RESPONSIVE CSS MEDIA QUERIES & .menu-grid LAYOUT");
console.log("------------------------------------------------------------------------------");

challenge("SEC-4", "Check style.css media query boundaries and rules for .menu-grid", () => {
    // Collect all declarations for .menu-grid
    const lines = css.split('\n');
    const menuGridDeclarations = [];

    lines.forEach((line, idx) => {
        if (line.includes('.menu-grid')) {
            menuGridDeclarations.push({ lineNo: idx + 1, text: line.trim() });
        }
    });

    console.log("     Found .menu-grid declarations at lines:", menuGridDeclarations.map(d => d.lineNo));

    // Check if line 1611 auto-fill rule exists
    const hasAutoFillSplitScreen = css.includes('grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));');
    console.log("     Contains split-screen auto-fill rule (line 1612):", hasAutoFillSplitScreen);

    // Check if worker claimed @media (max-width: 900px) exists
    const hasMax900px = css.includes('@media (max-width: 900px)') || css.includes('@media screen and (max-width: 900px)');
    console.log("     Contains @media (max-width: 900px):", hasMax900px);

    // Check actual mobile media query
    const hasMax640px = css.includes('@media screen and (max-width: 640px)');
    console.log("     Contains actual mobile media query @media screen and (max-width: 640px):", hasMax640px);

    // Verify whether auto-fill rule is inside min-width: 641px and max-width: 1080px
    const splitQueryIndex = css.indexOf('@media screen and (min-width: 641px) and (max-width: 1080px)');
    const autoFillIndex = css.indexOf('grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));');
    const nextQueryIndex = css.indexOf('@media screen and (max-width: 640px)');

    const autoFillIsInsideSplit = (splitQueryIndex !== -1 && autoFillIndex > splitQueryIndex && autoFillIndex < nextQueryIndex);
    console.log("     Auto-fill rule is enclosed by 641px-1080px media query:", autoFillIsInsideSplit);

    if (autoFillIsInsideSplit) {
        console.log("     ⚠️ WARNING / DEFECT: On viewports between 641px and 1080px, .menu-grid uses fluid auto-fill (minmax 130px),");
        console.log("        which breaks into 3 columns on tablet (e.g. 800px-900px) instead of strictly 2 cards (mobile) or 4 columns (PC).");
    }
    
    // We record whether the requirement of never breaking into 3 columns is violated:
    assert.strictEqual(autoFillIsInsideSplit, false,
        "CRITICAL DEFECT: style.css line 1612 contains 'grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));' inside '@media screen and (min-width: 641px) and (max-width: 1080px)'. At 768px-900px tablet width, .menu-grid breaks into 3 columns, violating the 2-col mobile / 4-col PC specification!");
});

// =============================================================================
// SECTION 5: MODAL CLOSE BUTTON STRICT 26 INVARIANT AUDIT
// =============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📌 SECTION 5: MODAL CLOSE BUTTON STRICT 26 INVARIANT AUDIT");
console.log("------------------------------------------------------------------------------");

challenge("SEC-5", "Exactly 26 SVG modal-close-btn buttons in index.html", () => {
    const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(matches, "Must match SVG modal-close-btn buttons");
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal-close-btn buttons, found ${matches.length}`);
});

challenge("SEC-5", "Zero raw unicode '✕' characters inside any modal-close-btn", () => {
    const modalCloseBtns = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/g) || [];
    assert.strictEqual(modalCloseBtns.length, 26, "Must find exactly 26 modal-close-btn buttons");
    modalCloseBtns.forEach((btnHtml, idx) => {
        assert.ok(!btnHtml.includes('✕') && !btnHtml.includes('✖'), `modal-close-btn #${idx + 1} contains raw unicode X`);
    });
});

challenge("SEC-5", "Top bar Bell button does NOT use modal-close-btn class", () => {
    const bellBtnMatch = html.match(/id=["']topbarNotificationBellBtn["'][^>]*>/);
    assert.ok(bellBtnMatch, "topbarNotificationBellBtn must exist");
    assert.ok(!bellBtnMatch[0].includes('modal-close-btn'), "topbarNotificationBellBtn must not use modal-close-btn class");
});

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log("\n==============================================================================");
console.log(`📊 CHALLENGER M1 RESULTS: ${passedTests} / ${totalTests} Passed (${failedTests} Failed)`);
console.log("==============================================================================");

testResults.forEach(r => {
    if (!r.passed) {
        console.log(`  ❌ [DEFECT] [${r.section}] ${r.title}: ${r.error}`);
    }
});
console.log("==============================================================================\n");
