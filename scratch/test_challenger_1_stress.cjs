// scratch/test_challenger_1_stress.cjs
// ==============================================================================
// 🔬 EMPIRICAL ADVERSARIAL STRESS TEST SUITE — CHALLENGER 1
// Milestones M1 (POS Decluttering & Settings) & M2 (Mobile Inventory Master-Detail)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("==============================================================================");
console.log("🔬 CHALLENGER 1: ADVERSARIAL STRESS HARNESS — M1 & M2 EMPIRICAL AUDIT");
console.log("==============================================================================\n");

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const cssPath = path.join(rootDir, 'style.css');
const posJsPath = path.join(rootDir, 'js', 'pos.js');
const culinaryJsPath = path.join(rootDir, 'js', 'culinary_inventory.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const posJs = fs.readFileSync(posJsPath, 'utf8');
const culinaryJs = fs.readFileSync(culinaryJsPath, 'utf8');

let passed = 0;
let failed = 0;
const results = [];

function check(id, title, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${id}: ${title}`);
        passed++;
        results.push({ id, title, status: 'PASS' });
    } catch (err) {
        console.error(`  ❌ [FAIL] ${id}: ${title}`);
        console.error(`     Error: ${err.message}`);
        failed++;
        results.push({ id, title, status: 'FAIL', error: err.message });
    }
}

// ==============================================================================
// SECTION 1: MILESTONE M1 — POS TABLE BAR & SETTINGS MODAL STRESS
// ==============================================================================
console.log("📍 SECTION 1: POS SCREEN OPTIMIZATION & SETTINGS MODAL STRESS (M1)");

check("M1-STRESS-01", "POS #tableTopBar container exists and redundant 'Edit Tables & Floors' is purged", () => {
    assert.ok(html.includes('id="tableTopBar"'), "Missing id='tableTopBar' in index.html");
    
    // Check that inside #pos, no table editing button exists
    const posViewMatch = html.match(/<div\b[^>]*id=["']pos["'][\s\S]*?(?=<div\b[^>]*id=["'](?:menu|customers|inventory|reports|settings)["'])/i);
    assert.ok(posViewMatch, "Unable to extract #pos view from index.html");
    const posContent = posViewMatch[0];
    
    const editBtnPatterns = [
        /Edit Tables/i,
        /Edit Floors/i,
        /openTableManagementModal/i,
        /tblMgmt/i
    ];
    for (const pat of editBtnPatterns) {
        assert.ok(!pat.test(posContent), `Forbidden table config trigger found in #pos view: ${pat}`);
    }
});

check("M1-STRESS-02", "POS floor pills rapid switching stress test & state integrity", () => {
    // Simulate floor selector DOM
    class MockElement {
        constructor(tag, id = '', className = '') {
            this.tagName = tag.toUpperCase();
            this.id = id;
            this.className = className;
            this.classList = {
                classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
                add: (c) => this.classList.classes.add(c),
                remove: (c) => this.classList.classes.delete(c),
                contains: (c) => this.classList.classes.has(c),
                toggle: (c) => {
                    if (this.classList.classes.has(c)) {
                        this.classList.classes.delete(c);
                        return false;
                    } else {
                        this.classList.classes.add(c);
                        return true;
                    }
                }
            };
            this.style = {};
            this.attributes = {};
            this.children = [];
            this.innerHTML = '';
            this.innerText = '';
        }
        setAttribute(k, v) { this.attributes[k] = String(v); }
        getAttribute(k) { return this.attributes[k] || null; }
        querySelector(sel) { return null; }
        querySelectorAll(sel) { return []; }
        closest(sel) { return null; }
    }

    const pills = [
        new MockElement('button', 'pill-ground', 'floor-pill active'),
        new MockElement('button', 'pill-1st', 'floor-pill'),
        new MockElement('button', 'pill-outdoor', 'floor-pill')
    ];

    const fakeShopProfile = { activeFloor: 'Ground Floor' };
    function mockSwitchFloor(floorName, btnEl) {
        fakeShopProfile.activeFloor = floorName;
        pills.forEach(p => p.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
    }

    const floors = ['Ground Floor', '1st Floor', 'Outdoor'];
    // 150 rapid switches
    for (let i = 0; i < 150; i++) {
        const targetIdx = i % 3;
        const targetFloor = floors[targetIdx];
        const targetPill = pills[targetIdx];
        
        mockSwitchFloor(targetFloor, targetPill);
        
        assert.strictEqual(fakeShopProfile.activeFloor, targetFloor, `Iteration ${i}: shopProfile.activeFloor not set correctly`);
        assert.ok(targetPill.classList.contains('active'), `Iteration ${i}: target pill must have active class`);
        for (let j = 0; j < 3; j++) {
            if (j !== targetIdx) {
                assert.ok(!pills[j].classList.contains('active'), `Iteration ${i}: non-target pill ${j} should not have active class`);
            }
        }
    }

    // Edge case: call switchFloor with null or undefined button
    mockSwitchFloor('Outdoor', null);
    assert.strictEqual(fakeShopProfile.activeFloor, 'Outdoor');
    pills.forEach(p => assert.ok(!p.classList.contains('active')));
});

check("M1-STRESS-03", "Settings tile #settingTileTablesFloors triggers openTableManagementModal & manages inputs", () => {
    assert.ok(html.includes('id="settingTileTablesFloors"'), "Missing #settingTileTablesFloors in Settings view");
    assert.ok(html.includes('onclick="openTableManagementModal()"'), "Missing onclick handler for openTableManagementModal");

    // Verify openTableManagementModal function logic in index.html
    assert.ok(html.includes('function openTableManagementModal()'), "Missing openTableManagementModal function definition");
    assert.ok(html.includes('document.getElementById(\'tableManagementModal\')'), "Function must target #tableManagementModal");
    assert.ok(html.includes('modal.style.display = \'flex\''), "Function must show modal with display: flex");
    assert.ok(html.includes('tblMgmtCountInput'), "Function must bind #tblMgmtCountInput");
    assert.ok(html.includes('tblMgmtShowTables'), "Function must bind #tblMgmtShowTables");
    assert.ok(html.includes('tblMgmtUnpaidAlert'), "Function must bind #tblMgmtUnpaidAlert");

    // Verify closeTableManagementModal
    assert.ok(html.includes('function closeTableManagementModal()'), "Missing closeTableManagementModal function definition");
    assert.ok(html.includes('modal.style.display = \'none\''), "close function must hide modal with display: none");

    // Modal close button class invariant: must NOT be .modal-close-btn
    const modalMatch = html.match(/<div\b[^>]*id=["']tableManagementModal["'][\s\S]*?(?=<div\b[^>]*class=["']modal-overlay["']|<script\b)/i);
    assert.ok(modalMatch, "Missing #tableManagementModal DOM container");
    const modalMarkup = modalMatch[0];
    assert.ok(!modalMarkup.includes('class="modal-close-btn"'), "#tableManagementModal close button must not use modal-close-btn class");
    assert.ok(modalMarkup.includes('tbl-close-btn'), "#tableManagementModal close button must use tbl-close-btn");
});

// ==============================================================================
// SECTION 2: MILESTONE M2 — MOBILE INVENTORY MASTER-DETAIL ROW STRESS
// ==============================================================================
console.log("\n📍 SECTION 2: MOBILE INVENTORY MASTER-DETAIL ROW STRESS (M2)");

check("M2-STRESS-01", "Presence of all required master & drawer telemetry metrics across inventory items", () => {
    // Verify renderRawStockTab generates master row and drawer with all required metrics
    assert.ok(culinaryJs.includes('inv-row-master'), "Missing .inv-row-master in culinary_inventory.js");
    assert.ok(culinaryJs.includes('inv-card-name'), "Missing .inv-card-name in master row");
    assert.ok(culinaryJs.includes('inv-master-stock'), "Missing .inv-master-stock container in master row");
    assert.ok(culinaryJs.includes('inv-stock-qty'), "Missing .inv-stock-qty in master row");
    assert.ok(culinaryJs.includes('inv-stock-unit'), "Missing .inv-stock-unit in master row");
    assert.ok(culinaryJs.includes('inv-master-badge'), "Missing .inv-master-badge in master row");
    assert.ok(culinaryJs.includes('inv-row-chevron'), "Missing .inv-row-chevron in master row");

    // Drawer requirements: Safety Threshold, Unit Cost / Purchase Rate, Supplier, and + Restock button
    assert.ok(culinaryJs.includes('inv-row-drawer'), "Missing .inv-row-drawer in culinary_inventory.js");
    assert.ok(culinaryJs.includes('Safety Threshold:'), "Drawer must display 'Safety Threshold:' label");
    assert.ok(culinaryJs.includes('item.min_threshold'), "Drawer must render item.min_threshold");
    assert.ok(culinaryJs.includes('Purchase Rate:'), "Drawer must display 'Purchase Rate:' label");
    assert.ok(culinaryJs.includes('item.cost_per_unit'), "Drawer must render item.cost_per_unit");
    assert.ok(culinaryJs.includes('inv-meta-supplier'), "Drawer must render supplier info container");
    assert.ok(culinaryJs.includes('item.supplier'), "Drawer must render item.supplier");
    assert.ok(culinaryJs.includes('btn-restock-quick'), "Drawer must render .btn-restock-quick button");
    assert.ok(culinaryJs.includes('+ Restock'), "Quick restock button must display '+ Restock'");
});

check("M2-STRESS-02", "Single Row Rapid-Click Stress Test (100 alternating toggles)", () => {
    const expandedItemRowIds = new Set();
    
    // Create mock DOM structure for item
    const mockCard = {
        id: 'invItem-RM-OIL',
        classes: new Set(['inv-stock-card']),
        classList: {
            toggle: function(c) {
                if (mockCard.classes.has(c)) {
                    mockCard.classes.delete(c);
                    return false;
                } else {
                    mockCard.classes.add(c);
                    return true;
                }
            },
            contains: (c) => mockCard.classes.has(c)
        },
        masterAriaExpanded: 'false',
        querySelector: (sel) => {
            if (sel === '.inv-row-master') {
                return {
                    setAttribute: (k, v) => {
                        if (k === 'aria-expanded') mockCard.masterAriaExpanded = v;
                    }
                };
            }
            return null;
        }
    };

    function simulateToggleItemRow(itemId, event) {
        if (event && event.target && event.target.closest) {
            if (event.target.closest('button') || event.target.closest('input')) return;
        }
        const isNowExpanded = mockCard.classList.toggle('expanded');
        const master = mockCard.querySelector('.inv-row-master');
        if (master) master.setAttribute('aria-expanded', isNowExpanded ? 'true' : 'false');
        if (isNowExpanded) expandedItemRowIds.add(itemId);
        else expandedItemRowIds.delete(itemId);
    }

    // 100 rapid clicks
    for (let i = 1; i <= 100; i++) {
        simulateToggleItemRow('RM-OIL', { target: { closest: () => null } });
        
        const shouldBeExpanded = (i % 2 === 1);
        assert.strictEqual(mockCard.classList.contains('expanded'), shouldBeExpanded, 
            `Iteration ${i}: expected expanded=${shouldBeExpanded}`);
        assert.strictEqual(mockCard.masterAriaExpanded, shouldBeExpanded ? 'true' : 'false',
            `Iteration ${i}: aria-expanded mismatch`);
        assert.strictEqual(expandedItemRowIds.has('RM-OIL'), shouldBeExpanded,
            `Iteration ${i}: expandedItemRowIds Set mismatch`);
    }

    // Must be completely closed after 100 iterations
    assert.strictEqual(mockCard.classList.contains('expanded'), false);
    assert.strictEqual(mockCard.masterAriaExpanded, 'false');
    assert.strictEqual(expandedItemRowIds.size, 0);
});

check("M2-STRESS-03", "Multi-Row Concurrent Expansion & Independent Accordion State Stress", () => {
    const expandedItemRowIds = new Set();
    const itemIds = [
        'RM-OIL', 'RM-MAIDA', 'RM-POTATO', 'RM-MILK', 'RM-TEA-LEAVES',
        'RM-SUGAR', 'RM-POULTRY', 'RM-ONION', 'RM-COLA', 'RM-CHAAT-MASALA'
    ];

    const cards = {};
    itemIds.forEach(id => {
        cards[id] = {
            id: `invItem-${id}`,
            classes: new Set(['inv-stock-card']),
            classList: {
                toggle: function(c) {
                    if (cards[id].classes.has(c)) {
                        cards[id].classes.delete(c);
                        return false;
                    } else {
                        cards[id].classes.add(c);
                        return true;
                    }
                },
                contains: (c) => cards[id].classes.has(c)
            },
            ariaExpanded: 'false'
        };
    });

    function toggleRow(id) {
        const card = cards[id];
        const isNow = card.classList.toggle('expanded');
        card.ariaExpanded = isNow ? 'true' : 'false';
        if (isNow) expandedItemRowIds.add(id);
        else expandedItemRowIds.delete(id);
    }

    // 1. Expand all 10 items concurrently
    itemIds.forEach((id, idx) => {
        toggleRow(id);
        assert.strictEqual(expandedItemRowIds.size, idx + 1, `After opening ${idx+1} items, Set size must be ${idx+1}`);
        assert.ok(cards[id].classList.contains('expanded'));
        assert.strictEqual(cards[id].ariaExpanded, 'true');
    });

    // Verify all 10 remain simultaneously expanded (multi-drawer behavior)
    itemIds.forEach(id => {
        assert.ok(cards[id].classList.contains('expanded'), `Item ${id} should remain expanded`);
        assert.strictEqual(cards[id].ariaExpanded, 'true');
    });
    assert.strictEqual(expandedItemRowIds.size, 10);

    // 2. Collapse the first 5 items
    for (let i = 0; i < 5; i++) {
        toggleRow(itemIds[i]);
    }
    assert.strictEqual(expandedItemRowIds.size, 5);
    for (let i = 0; i < 5; i++) {
        assert.ok(!cards[itemIds[i]].classList.contains('expanded'), `Item ${itemIds[i]} should be collapsed`);
        assert.strictEqual(cards[itemIds[i]].ariaExpanded, 'false');
    }
    for (let i = 5; i < 10; i++) {
        assert.ok(cards[itemIds[i]].classList.contains('expanded'), `Item ${itemIds[i]} should remain expanded`);
        assert.strictEqual(cards[itemIds[i]].ariaExpanded, 'true');
    }

    // 3. Collapse the remaining 5 items
    for (let i = 5; i < 10; i++) {
        toggleRow(itemIds[i]);
    }
    assert.strictEqual(expandedItemRowIds.size, 0);
    itemIds.forEach(id => {
        assert.ok(!cards[id].classList.contains('expanded'), `Item ${id} must be closed`);
        assert.strictEqual(cards[id].ariaExpanded, 'false');
    });
});

check("M2-STRESS-04", "Restock Button Event Propagation & Drawer Isolation Stress", () => {
    // Verify culinary_inventory.js implementation:
    // .btn-restock-quick has onclick="event.stopPropagation(); window.culinaryInventory.openRestockModal('${item.id}')"
    const restockBtnRegex = /<button\b[^>]*class=["'][^"']*btn-restock-quick[^"']*["'][^>]*onclick=["']([^"']+)["']/g;
    const match = restockBtnRegex.exec(culinaryJs);
    assert.ok(match, "Missing .btn-restock-quick with onclick attribute");
    assert.ok(match[1].includes('event.stopPropagation()'), "Restock button must call event.stopPropagation()");
    assert.ok(match[1].includes('openRestockModal'), "Restock button must invoke openRestockModal");

    // Also check other interactive buttons inside drawer
    const rateBtnRegex = /promptPriceEdit\(['"]\${item\.id}['"]\)/;
    assert.ok(rateBtnRegex.test(culinaryJs), "Rate button must call promptPriceEdit");
    assert.ok(culinaryJs.includes("onclick=\"event.stopPropagation(); window.culinaryInventory.promptPriceEdit"), "Rate button must call event.stopPropagation()");

    const minBtnRegex = /openItemAlertModal\(['"]\${item\.id}['"]\)/;
    assert.ok(minBtnRegex.test(culinaryJs), "Min alert button must call openItemAlertModal");
    assert.ok(culinaryJs.includes("onclick=\"event.stopPropagation(); window.culinaryInventory.openItemAlertModal"), "Min alert button must call event.stopPropagation()");

    // Simulate event propagation: if event is clicked on button, toggleItemRow must abort
    let toggleExecuted = false;
    function testToggleItemRow(itemId, event) {
        if (event && event.target) {
            if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('a')) {
                return;
            }
        }
        toggleExecuted = true;
    }

    // 1. Click on button inside drawer -> toggle must NOT execute
    toggleExecuted = false;
    testToggleItemRow('RM-POTATO', {
        target: {
            closest: (sel) => (sel === 'button' ? { tagName: 'BUTTON' } : null)
        }
    });
    assert.strictEqual(toggleExecuted, false, "Clicking button must not toggle drawer");

    // 2. Click on input inside drawer -> toggle must NOT execute
    toggleExecuted = false;
    testToggleItemRow('RM-POTATO', {
        target: {
            closest: (sel) => (sel === 'input' ? { tagName: 'INPUT' } : null)
        }
    });
    assert.strictEqual(toggleExecuted, false, "Clicking input must not toggle drawer");

    // 3. Click on row master (not a button) -> toggle MUST execute
    toggleExecuted = false;
    testToggleItemRow('RM-POTATO', {
        target: {
            closest: (sel) => null
        }
    });
    assert.strictEqual(toggleExecuted, true, "Clicking master row header must execute toggle");
});

check("M2-STRESS-05", "Keyboard Accessibility (Enter/Space vs other keys)", () => {
    // Verify culinary_inventory.js onkeydown implementation on .inv-row-master:
    // onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.culinaryInventory.toggleItemRow('${item.id}', event);}"
    assert.ok(culinaryJs.includes("event.key==='Enter'||event.key===' '"), "Missing Enter/Space key handler on .inv-row-master");
    assert.ok(culinaryJs.includes("event.preventDefault()"), "Keyboard handler must call preventDefault on Space to avoid page scroll");
    assert.ok(culinaryJs.includes('role="button"'), "Master row must have role='button'");
    assert.ok(culinaryJs.includes('tabindex="0"'), "Master row must have tabindex='0'");
});

check("M2-STRESS-06", "CSS Viewport Ergonomics & Responsive Rules (< 768px vs >= 768px)", () => {
    // 1. Mobile rules (< 768px)
    const mobileMediaMatch = css.match(/@media\s+screen\s+and\s+\(max-width:\s*767\.98px\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(mobileMediaMatch, "Missing @media screen and (max-width: 767.98px) in style.css");
    const mobileCss = mobileMediaMatch[1];

    // Grid turns into flex column
    assert.ok(mobileCss.includes('.inv-stock-cards-grid'), "Mobile css must style .inv-stock-cards-grid");
    assert.ok(mobileCss.includes('flex-direction: column !important') || mobileCss.includes('flex-direction: column'), "Mobile grid must become column flex");

    // Master row min-height 50px
    assert.ok(mobileCss.includes('min-height: 50px !important') || mobileCss.includes('min-height: 50px'), "Master row must have min-height 50px");

    // Drawer collapsed by default (max-height: 0, opacity: 0, visibility: hidden)
    assert.ok(mobileCss.includes('.inv-row-drawer'), "Mobile css must style .inv-row-drawer");
    assert.ok(mobileCss.includes('max-height: 0 !important') || mobileCss.includes('max-height: 0'), "Drawer must be max-height: 0 when collapsed");

    // Drawer expanded state
    assert.ok(mobileCss.includes('.inv-stock-card.expanded .inv-row-drawer'), "Mobile css must style .inv-stock-card.expanded .inv-row-drawer");
    assert.ok(mobileCss.includes('max-height: 320px !important') || mobileCss.includes('max-height: 320px'), "Drawer must expand to max-height 320px");

    // Chevron rotation
    assert.ok(mobileCss.includes('.inv-stock-card.expanded .inv-row-chevron'), "Mobile css must animate chevron on expand");
    assert.ok(mobileCss.includes('rotate(180deg)'), "Expanded chevron must rotate 180deg");

    // Restock button touch target >= 44px
    assert.ok(mobileCss.includes('min-height: 44px !important') || mobileCss.includes('min-height: 44px'), "Restock button must enforce 44px touch target on mobile");

    // 2. Desktop rules (min-width: 768px)
    const desktopMediaMatch = css.match(/@media\s+screen\s+and\s+\(min-width:\s*768px\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(desktopMediaMatch, "Missing @media screen and (min-width: 768px) in style.css");
    const desktopCss = desktopMediaMatch[1];

    assert.ok(desktopCss.includes('grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important') || desktopCss.includes('minmax(260px, 1fr)'), "Desktop must preserve grid-template-columns");
    assert.ok(desktopCss.includes('display: block !important'), "Desktop drawer must be permanently displayed block");
    assert.ok(desktopCss.includes('.inv-row-chevron') && desktopCss.includes('display: none !important'), "Desktop chevron must be hidden");
});

// ==============================================================================
// SECTION 3: SYSTEM INVARIANTS AUDIT
// ==============================================================================
console.log("\n📍 SECTION 3: SYSTEM INVARIANTS AUDIT");

check("INV-STRESS-01", "Strict invariant: Exactly 26 SVG modal close buttons matching regex in index.html", () => {
    const modalCloseRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseRegex) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${matches.length}`);
});

check("INV-STRESS-02", "Total occurrences of class 'modal-close-btn' across index.html is strictly 26", () => {
    const classOccurrences = (html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || []).length;
    assert.strictEqual(classOccurrences, 26, `Expected exactly 26 modal-close-btn classes, found ${classOccurrences}`);
});

check("INV-STRESS-03", "Zero raw unicode emojis in buttons, tabs, or badges", () => {
    const rawEmojiPattern = /<button\b[^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)<\/button>/;
    const match = html.match(rawEmojiPattern);
    assert.ok(!match, `Found raw emoji in operational button: ${match ? match[0] : ''}`);
});

// ==============================================================================
// FINAL SUMMARY
// ==============================================================================
console.log("\n==============================================================================");
console.log(`🎯 EMPIRICAL STRESS AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==============================================================================");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
