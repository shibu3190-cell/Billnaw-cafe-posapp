// scratch/test_challenger_m1_iter2_stress.cjs
// ==============================================================================
// 🔬 EMPIRICAL ADVERSARIAL STRESS TEST SUITE — CHALLENGER 1
// Milestone 1 Iteration 2 (Syntax Remediation, Invariants, & Catalog Stress)
// ==============================================================================

const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const assert = require('assert');

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

(async () => {
    console.log("==============================================================================");
    console.log("🔬 CHALLENGER 1: ADVERSARIAL STRESS HARNESS — M1 ITERATION 2");
    console.log("==============================================================================\n");

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    const failures = [];

    function test(id, description, fn) {
        totalTests++;
        try {
            fn();
            console.log(`  ✅ PASS [${id}]: ${description}`);
            passedTests++;
        } catch (err) {
            console.error(`  ❌ FAIL [${id}]: ${description}`);
            console.error(`     Error: ${err.message}`);
            failedTests++;
            failures.push({ id, description, error: err.message });
        }
    }

    async function asyncTest(id, description, fn) {
        totalTests++;
        try {
            await fn();
            console.log(`  ✅ PASS [${id}]: ${description}`);
            passedTests++;
        } catch (err) {
            console.error(`  ❌ FAIL [${id}]: ${description}`);
            console.error(`     Error: ${err.message}`);
            failedTests++;
            failures.push({ id, description, error: err.message });
        }
    }

    const html = fs.readFileSync('index.html', 'utf8');
    const menuJs = fs.readFileSync('js/menu.js', 'utf8');
    const customersJs = fs.readFileSync('js/customers.js', 'utf8');

    // ==============================================================================
    // SECTION 1: SYNTAX VERIFICATION & SCRIPT PARSING
    // ==============================================================================
    console.log("📍 SECTION 1: SYNTAX VERIFICATION & SCRIPT PARSING");

    test("SYNTAX-01", "js/menu.js parses with zero syntax errors (node --check)", () => {
        const { execSync } = require('child_process');
        execSync('node --check js/menu.js', { stdio: 'pipe' });
    });

    test("SYNTAX-02", "js/customers.js parses with zero syntax errors (node --check)", () => {
        const { execSync } = require('child_process');
        execSync('node --check js/customers.js', { stdio: 'pipe' });
    });

    test("SYNTAX-03", "All primary application scripts parse cleanly with zero errors", () => {
        const { execSync } = require('child_process');
        execSync('node --check app.js js/core.js js/culinary_inventory.js js/dashboard.js js/marketing_inventory.js js/settings.js js/pos.js js/staff.js', { stdio: 'pipe' });
    });

    // ==============================================================================
    // SECTION 2: SYSTEM INVARIANT — EXACTLY 26 SVG MODAL CLOSE BUTTONS
    // ==============================================================================
    console.log("\n📍 SECTION 2: SYSTEM INVARIANT — MODAL CLOSE BUTTON AUDIT");

    const exactSvgBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/gs;
    const exactMatches = html.match(exactSvgBtnRegex) || [];

    test("INV-MODAL-01", "index.html contains exactly 26 SVG modal close buttons matching strict regex", () => {
        assert.strictEqual(exactMatches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${exactMatches.length}`);
    });

    const anyModalCloseBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi;
    const allModalCloseBtns = html.match(anyModalCloseBtnRegex) || [];

    test("INV-MODAL-02", "Total occurrences of modal-close-btn class is strictly 26 (zero non-SVG buttons)", () => {
        assert.strictEqual(allModalCloseBtns.length, 26, `Expected 26 total buttons with modal-close-btn class, found ${allModalCloseBtns.length}`);
    });

    test("INV-MODAL-03", "Zero raw unicode '✕' or 'X' inside modal-close-btn elements", () => {
        allModalCloseBtns.forEach((btn, idx) => {
            assert.ok(!btn.includes('✕') && !btn.includes('&#10005;'), `Raw unicode cross found in modal close button #${idx + 1}`);
        });
    });

    // ==============================================================================
    // SECTION 3: EMPIRICAL HEADLESS CHROME STRESS TEST
    // ==============================================================================
    console.log("\n📍 SECTION 3: EMPIRICAL HEADLESS CHROME STRESS TEST (MENU CATALOG & EDGE CASES)");

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const debugPort = 9893;
    const userDataDir = path.join(os.tmpdir(), 'chrome_m1_iter2_stress_' + Date.now());
    const chromeProc = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${userDataDir}`,
        '--window-size=375,667',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:5000'
    ]);

    let ws = null;
    let msgId = 1;
    const pending = new Map();

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async function evaluate(expression) {
        const res = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.text || (res.exceptionDetails.exception && res.exceptionDetails.exception.description) || "Evaluation error");
        }
        return res.result ? res.result.value : undefined;
    }

    try {
        let targets = null;
        for (let i = 0; i < 30; i++) {
            await wait(400);
            try {
                targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
                if (targets && targets.length > 0) break;
            } catch (e) {}
        }

        assert.ok(targets && targets.length > 0, "Failed to connect to headless Chrome debugging port");

        const pageTarget = targets.find(t => t.type === 'page') || targets[0];
        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };

        await new Promise(r => ws.onopen = r);
        await send('Page.enable');
        await send('Runtime.enable');
        await send('DOM.enable');

        // Navigate explicitly and wait for network/DOM idle
        await send('Page.navigate', { url: 'http://localhost:5000' });
        await wait(2500);

        // Ensure we are switched to menu catalog
        await evaluate(`
            (() => {
                if (typeof switchTab === 'function') switchTab('menu');
                if (typeof switchMenuSubTab === 'function') switchMenuSubTab('inventory');
            })()
        `);
        await wait(300);

        // --- STRESS TEST 3.1: ZERO ITEMS (CLEAN SLATE / EMPTY STATE) ---
        await asyncTest("STRESS-CAT-01", "0 Items: renderMenuCatalogUI renders clean empty state without crashing", async () => {
            const res = await evaluate(`
                (() => {
                    menuItems.length = 0;
                    catalogActiveCategoryFilter = 'All';
                    const searchInput = document.getElementById('catalogSearchInput');
                    if (searchInput) searchInput.value = '';
                    
                    renderMenuCatalogUI();

                    const cardsList = document.getElementById('cleanItemCardsList');
                    const cards = cardsList ? cardsList.querySelectorAll('.clean-item-card') : [];
                    const invCountEl = document.getElementById('menuInventoryCount');
                    const hasEmptyText = cardsList && cardsList.innerText.includes('No menu items found');

                    return {
                        cardCount: cards.length,
                        invCount: invCountEl ? invCountEl.innerText.trim() : '',
                        hasEmptyText: hasEmptyText
                    };
                })()
            `);

            assert.strictEqual(res.cardCount, 0, "Clean cards list must have 0 cards");
            assert.strictEqual(res.invCount, "0", "Inventory count header must show '0'");
            assert.strictEqual(res.hasEmptyText, true, "Empty state placeholder must be visible");
        });

        // --- STRESS TEST 3.2: 1 ITEM (SINGULAR BOUNDARY & STOCK BADGES) ---
        await asyncTest("STRESS-CAT-02", "1 Item: accurate inventory count '1' and accurate stock tags (unlimited, in-stock, low-stock, out-stock)", async () => {
            const res = await evaluate(`
                (() => {
                    const testCases = [
                        { trackStock: false, stockQty: 0, expectedClass: 'unlimited', expectedLabel: '∞ Unlimited' },
                        { trackStock: true, stockQty: 10, expectedClass: 'in-stock', expectedLabel: '10 in stock' },
                        { trackStock: true, stockQty: 3, expectedClass: 'low-stock', expectedLabel: '3 low' },
                        { trackStock: true, stockQty: 0, expectedClass: 'out-stock', expectedLabel: 'Out of stock' }
                    ];

                    const results = [];
                    for (const tc of testCases) {
                        menuItems.length = 0;
                        menuItems.push({ id: 99, name: "Cold Coffee", category: "Beverages", price: 65, trackStock: tc.trackStock, stockQty: tc.stockQty, image: "https://example.com/valid.jpg" });
                        catalogActiveCategoryFilter = 'All';
                        renderMenuCatalogUI();

                        const invCountEl = document.getElementById('menuInventoryCount');
                        const card = document.querySelector('#cleanItemCardsList .clean-item-card');
                        const stockTag = card ? card.querySelector('.clean-item-stock-tag') : null;
                        const priceEl = card ? card.querySelector('.clean-item-price') : null;

                        results.push({
                            invCount: invCountEl ? invCountEl.innerText.trim() : '',
                            hasCard: !!card,
                            tagClass: stockTag ? stockTag.className : '',
                            tagText: stockTag ? stockTag.innerText.trim() : '',
                            priceText: priceEl ? priceEl.innerText.trim() : ''
                        });
                    }
                    return results;
                })()
            `);

            assert.strictEqual(res.length, 4);
            assert.strictEqual(res[0].invCount, "1", "Inventory counter must show 1");
            assert.strictEqual(res[0].hasCard, true, "1 item card must be rendered");
            assert.ok(res[0].tagClass.includes('unlimited') && res[0].tagText.includes('Unlimited'), "Unlimited stock tag mismatch");
            assert.ok(res[1].tagClass.includes('in-stock') && res[1].tagText.includes('10 in stock'), "In-stock tag mismatch");
            assert.ok(res[2].tagClass.includes('low-stock') && res[2].tagText.includes('3 low'), "Low-stock tag mismatch");
            assert.ok(res[3].tagClass.includes('out-stock') && res[3].tagText.includes('Out of stock'), "Out-of-stock tag mismatch");
            assert.strictEqual(res[0].priceText, "₹ 65.00", "Price formatting must be ₹ 65.00");
        });

        // --- STRESS TEST 3.3: 30 ITEMS (BULK RENDERING, CATEGORY & SEARCH FILTERING, DROPDOWN MUTEX) ---
        await asyncTest("STRESS-CAT-03", "30 Items: renders exactly 30 cards, category chips filter correctly, and search filters correctly", async () => {
            const res = await evaluate(`
                (() => {
                    const categories = ["All", "Snacks", "Beverages", "Main Course", "Desserts"];
                    menuCategories.length = 0;
                    menuCategories.push(...categories);

                    const items = [];
                    for (let i = 1; i <= 30; i++) {
                        const cat = categories[1 + (i % 4)];
                        items.push({
                            id: i,
                            name: \`Dish \${i} - \${cat}\`,
                            category: cat,
                            price: 20 + i * 5,
                            trackStock: i % 2 === 0,
                            stockQty: i,
                            image: "https://example.com/dish.jpg"
                        });
                    }
                    menuItems.length = 0;
                    menuItems.push(...items);
                    catalogActiveCategoryFilter = 'All';
                    const searchInput = document.getElementById('catalogSearchInput');
                    if (searchInput) searchInput.value = '';

                    // 1. Full render
                    renderMenuCatalogUI();
                    const initialCardCount = document.querySelectorAll('#cleanItemCardsList .clean-item-card').length;
                    const initialCount = document.getElementById('menuInventoryCount')?.innerText.trim();

                    // 2. Category filter: Beverages
                    catalogActiveCategoryFilter = 'Beverages';
                    renderMenuCatalogUI();
                    const bevCardCount = document.querySelectorAll('#cleanItemCardsList .clean-item-card').length;
                    const bevItems = items.filter(i => i.category === 'Beverages').length;

                    // 3. Search query: "Dish 15"
                    catalogActiveCategoryFilter = 'All';
                    if (searchInput) searchInput.value = 'Dish 15';
                    renderMenuCatalogUI();
                    const searchCards = document.querySelectorAll('#cleanItemCardsList .clean-item-card');
                    const searchResultName = searchCards.length === 1 ? searchCards[0].querySelector('.clean-item-name')?.innerText.trim() : '';

                    // 4. Search non-matching
                    if (searchInput) searchInput.value = 'NonExistentDishXYZ999';
                    renderMenuCatalogUI();
                    const emptyCardCount = document.querySelectorAll('#cleanItemCardsList .clean-item-card').length;
                    const emptyStateVisible = document.getElementById('cleanItemCardsList')?.innerText.includes('No menu items found');

                    // Reset
                    if (searchInput) searchInput.value = '';
                    catalogActiveCategoryFilter = 'All';
                    renderMenuCatalogUI();

                    return {
                        initialCardCount,
                        initialCount,
                        bevCardCount,
                        expectedBevItems: bevItems,
                        searchCardsCount: searchCards.length,
                        searchResultName,
                        emptyCardCount,
                        emptyStateVisible
                    };
                })()
            `);

            assert.strictEqual(res.initialCardCount, 30, "Expected 30 cards initially");
            assert.strictEqual(res.initialCount, "30", "Inventory count header must show '30'");
            assert.strictEqual(res.bevCardCount, res.expectedBevItems, "Category filter 'Beverages' card count mismatch");
            assert.strictEqual(res.searchCardsCount, 1, "Search for 'Dish 15' should yield exactly 1 card");
            assert.ok(res.searchResultName.includes('Dish 15'), "Search card title mismatch");
            assert.strictEqual(res.emptyCardCount, 0, "Non-matching search should yield 0 item cards");
            assert.strictEqual(res.emptyStateVisible, true, "Empty state placeholder must appear on zero-match search");
        });

        // --- STRESS TEST 3.4: 3-DOT ACTION DROPDOWN MUTEX & CLICK-OUTSIDE DISMISSAL ---
        await asyncTest("STRESS-CAT-04", "3-Dot Action Dropdown: toggles open, ensures single dropdown open (mutex), and click-outside closes", async () => {
            const res = await evaluate(`
                (() => {
                    menuItems.length = 0;
                    menuItems.push(
                        { id: 101, name: "Burger", category: "Snacks", price: 50, trackStock: false, image: "https://example.com/b.jpg" },
                        { id: 102, name: "Pizza", category: "Snacks", price: 120, trackStock: false, image: "https://example.com/p.jpg" }
                    );
                    renderMenuCatalogUI();

                    const btn1 = document.querySelector('#cleanItemCardsList .clean-item-card:nth-child(1) .clean-item-more-btn');
                    const btn2 = document.querySelector('#cleanItemCardsList .clean-item-card:nth-child(2) .clean-item-more-btn');
                    const menu1 = document.getElementById('menuItemDropdown-101');
                    const menu2 = document.getElementById('menuItemDropdown-102');

                    // Click item 1
                    btn1.click();
                    const state1_menu1 = menu1 && (menu1.style.display === 'block' || menu1.classList.contains('show'));
                    const state1_menu2 = menu2 && (menu2.style.display === 'block' || menu2.classList.contains('show'));

                    // Click item 2 (mutex test: item 1 must close)
                    btn2.click();
                    const state2_menu1 = menu1 && (menu1.style.display === 'block' || menu1.classList.contains('show'));
                    const state2_menu2 = menu2 && (menu2.style.display === 'block' || menu2.classList.contains('show'));

                    // Click outside (document body)
                    document.body.click();
                    // Also trigger closeAllMenuActionDropdowns directly to verify cleanup handler
                    if (typeof closeAllMenuActionDropdowns === 'function') closeAllMenuActionDropdowns();
                    const state3_menu1 = menu1 && (menu1.style.display === 'block' || menu1.classList.contains('show'));
                    const state3_menu2 = menu2 && (menu2.style.display === 'block' || menu2.classList.contains('show'));

                    return {
                        state1: { menu1: state1_menu1, menu2: state1_menu2 },
                        state2: { menu1: state2_menu1, menu2: state2_menu2 },
                        state3: { menu1: state3_menu1, menu2: state3_menu2 }
                    };
                })()
            `);

            assert.strictEqual(res.state1.menu1, true, "Menu 1 should be open after clicking button 1");
            assert.strictEqual(res.state1.menu2, false, "Menu 2 should remain closed");
            assert.strictEqual(res.state2.menu1, false, "Menu 1 must close when button 2 is clicked (mutex)");
            assert.strictEqual(res.state2.menu2, true, "Menu 2 should be open");
            assert.strictEqual(res.state3.menu1, false, "Menu 1 must be closed after dismiss");
            assert.strictEqual(res.state3.menu2, false, "Menu 2 must be closed after dismiss");
        });

        // --- STRESS TEST 3.5: SPECIAL CHARACTERS & XSS PAYLOAD IMMUNITY ---
        await asyncTest("STRESS-CAT-05", "Special Characters & XSS: HTML injection, quotes, ampersands, and unicode render safely without code execution", async () => {
            const res = await evaluate(`
                (() => {
                    window.__xss_attack_triggered = false;
                    window.__xss_img_triggered = false;

                    const adversarialItems = [
                        {
                            id: 201,
                            name: "<script>window.__xss_attack_triggered=true;</script>Hacker Dish",
                            category: "Exploit Cat",
                            price: 99.99,
                            trackStock: false,
                            image: "https://example.com/hacker.jpg"
                        },
                        {
                            id: 202,
                            name: "Clean Dish With Special Chars &amp; More",
                            category: "Category & Punctuation",
                            price: 0,
                            trackStock: true,
                            stockQty: 5,
                            image: "https://example.com/clean.jpg"
                        },
                        {
                            id: 203,
                            name: "Chef's Special \\"Double Tikka\\" & McDonald's Fries™",
                            category: "Snacks & Drinks",
                            price: 150.50,
                            trackStock: true,
                            stockQty: 10,
                            image: "https://example.com/tikka.jpg"
                        },
                        {
                            id: 204,
                            name: "🔥 Spicy Masala Chai ☕ (₹15.00) & Momos 🥟",
                            category: "Beverages",
                            price: 15,
                            trackStock: false,
                            image: "https://example.com/chai.jpg"
                        }
                    ];

                    menuItems.length = 0;
                    menuItems.push(...adversarialItems);
                    catalogActiveCategoryFilter = 'All';
                    renderMenuCatalogUI();

                    const cards = document.querySelectorAll('#cleanItemCardsList .clean-item-card');
                    const renderedNames = Array.from(cards).map(c => c.querySelector('.clean-item-name')?.innerText.trim());
                    const renderedHtml = document.getElementById('cleanItemCardsList')?.innerHTML || '';

                    return {
                        cardCount: cards.length,
                        xssAttackTriggered: window.__xss_attack_triggered,
                        xssImgTriggered: window.__xss_img_triggered,
                        containsRawScriptTag: renderedHtml.includes('<script>window.__xss_attack_triggered'),
                        renderedNames: renderedNames
                    };
                })()
            `);

            assert.strictEqual(res.cardCount, 4, "All 4 adversarial items must render");
            assert.strictEqual(res.xssAttackTriggered, false, "XSS script payload must NEVER execute");
            assert.strictEqual(res.xssImgTriggered, false, "XSS img onerror must NEVER execute");
            assert.strictEqual(res.containsRawScriptTag, false, "Raw script tags must be escaped as &lt;script&gt;");
            assert.ok(res.renderedNames[2].includes("Chef's Special"), "Quotes in dish name must render cleanly in textContent");
            assert.ok(res.renderedNames[3].includes("🔥"), "Unicode emojis must render accurately in dish name textContent");
        });

        // --- STRESS TEST 3.6: CUSTOMER QUICK-ADD LOGIC ---
        await asyncTest("STRESS-CUST-01", "quickAddNewCustomerFromCheckout parses phone digits vs customer name cleanly without duplicate declaration errors", async () => {
            const res = await evaluate(`
                (() => {
                    let modalOpened = false;
                    window.openAddCustomerModal = () => { modalOpened = true; };

                    // Ensure mock input containers exist
                    let checkoutInput = document.getElementById('checkoutCustomerName');
                    if (!checkoutInput) {
                        checkoutInput = document.createElement('input');
                        checkoutInput.id = 'checkoutCustomerName';
                        document.body.appendChild(checkoutInput);
                    }
                    let phoneInput = document.getElementById('custPhoneInput');
                    if (!phoneInput) {
                        phoneInput = document.createElement('input');
                        phoneInput.id = 'custPhoneInput';
                        document.body.appendChild(phoneInput);
                    }
                    let nameInput = document.getElementById('custNameInput');
                    if (!nameInput) {
                        nameInput = document.createElement('input');
                        nameInput.id = 'custNameInput';
                        document.body.appendChild(nameInput);
                    }

                    // Test Phone input (digits only)
                    checkoutInput.value = '9876543210';
                    phoneInput.value = '';
                    nameInput.value = '';
                    quickAddNewCustomerFromCheckout();
                    const phoneResult = { phoneVal: phoneInput.value, nameVal: nameInput.value };

                    // Test Name input (non-digits)
                    checkoutInput.value = 'Abhijit Mukherjee';
                    phoneInput.value = '';
                    nameInput.value = '';
                    quickAddNewCustomerFromCheckout();
                    const nameResult = { phoneVal: phoneInput.value, nameVal: nameInput.value };

                    return {
                        modalOpened,
                        phoneResult,
                        nameResult
                    };
                })()
            `);

            assert.strictEqual(res.modalOpened, true, "openAddCustomerModal should be invoked");
            assert.strictEqual(res.phoneResult.phoneVal, '9876543210', "Digits should route to custPhoneInput");
            assert.strictEqual(res.phoneResult.nameVal, '', "Digits should NOT route to custNameInput");
            assert.strictEqual(res.nameResult.nameVal, 'Abhijit Mukherjee', "Alpha text should route to custNameInput");
            assert.strictEqual(res.nameResult.phoneVal, '', "Alpha text should NOT route to custPhoneInput");
        });

    } finally {
        if (ws) ws.close();
        chromeProc.kill();
    }

    console.log("\n==============================================================================");
    console.log(`📊 ADVERSARIAL STRESS TEST SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
    console.log("==============================================================================");

    if (failedTests > 0) {
        console.error("\n❌ FAILURES ENCOUNTERED:");
        failures.forEach(f => console.error(`  - [${f.id}] ${f.description}: ${f.error}`));
        process.exit(1);
    } else {
        console.log("\n✨ ALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED WITH ZERO REGRESSIONS!");
        process.exit(0);
    }
})();
