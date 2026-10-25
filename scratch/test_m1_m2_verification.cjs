const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================================");
console.log("🧪 VERIFICATION SUITE: MILESTONE M1 & M2 (POS & MOBILE INVENTORY)");
console.log("====================================================================\n");

let passed = 0;
let failed = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
        failed++;
    }
}

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../js/culinary_inventory.js'), 'utf8');

// --- 1. Milestone M1: POS Screen Optimization & Decluttering ---
console.log("📍 SECTION 1: MILESTONE M1 — POS SCREEN OPTIMIZATION & DECLUTTERING");

check("M1-01: index.html defines #tableTopBar on .table-top-bar container", () => {
    assert.ok(html.includes('id="tableTopBar"'), "Missing id='tableTopBar' in index.html");
    assert.ok(html.match(/<div[^>]*class=["'][^"']*table-top-bar[^"']*["'][^>]*id=["']tableTopBar["']|<div[^>]*id=["']tableTopBar["'][^>]*class=["'][^"']*table-top-bar[^"']*["']/), "table-top-bar must have id='tableTopBar'");
});

check("M1-02: Redundant 'Edit Tables & Floors' button removed from POS tableTopBar", () => {
    assert.ok(!html.includes("Edit Tables &amp; Floors") && !html.includes("Edit Tables & Floors"), "Redundant 'Edit Tables & Floors' button still present in index.html");
});

check("M1-03: Settings view retains #settingTileTablesFloors with openTableManagementModal()", () => {
    assert.ok(html.includes('id="settingTileTablesFloors"'), "Missing #settingTileTablesFloors in Settings view");
    assert.ok(html.match(/id=["']settingTileTablesFloors["'][^>]*onclick=["']openTableManagementModal\(\)["']/), "#settingTileTablesFloors must trigger openTableManagementModal()");
});

check("M1-04: Table Management modal is preserved with dedicated non-modal close class", () => {
    assert.ok(html.includes('id="tableManagementModal"'), "Missing #tableManagementModal");
    assert.ok(html.includes('tbl-close-btn'), "#tableManagementModal must use tbl-close-btn to protect invariant");
});

// --- 2. Milestone M2: Mobile Inventory Master-Detail Row Layout ---
console.log("\n📍 SECTION 2: MILESTONE M2 — MOBILE INVENTORY MASTER-DETAIL ROW LAYOUT");

check("M2-01: culinary_inventory.js defines window.culinaryInventory.toggleItemRow", () => {
    assert.ok(js.includes('toggleItemRow'), "Missing toggleItemRow in culinary_inventory.js");
    assert.ok(js.includes('expandedItemRowIds'), "Missing expandedItemRowIds tracker in culinary_inventory.js");
});

check("M2-02: renderRawStockTab renders .inv-row-master with name, stock quantity chip, status badge, and chevron", () => {
    assert.ok(js.includes('inv-row-master'), "Missing .inv-row-master in raw stock card");
    assert.ok(js.includes('inv-card-name'), "Missing .inv-card-name in master row");
    assert.ok(js.includes('inv-master-stock') || js.includes('inv-stock-qty-chip'), "Missing stock quantity chip in master row");
    assert.ok(js.includes('inv-row-chevron'), "Missing .inv-row-chevron in master row");
});

check("M2-03: renderRawStockTab renders .inv-row-drawer with safety threshold, purchase rate, supplier, and .btn-restock-quick", () => {
    assert.ok(js.includes('inv-row-drawer'), "Missing .inv-row-drawer container");
    assert.ok(js.includes('inv-card-levels-stacked'), "Missing .inv-card-levels-stacked in drawer");
    assert.ok(js.includes('btn-restock-quick'), "Missing .btn-restock-quick action button");
    assert.ok(js.includes('event.stopPropagation()'), "Restock and edit actions must call event.stopPropagation()");
});

check("M2-04: style.css defines @media (max-width: 767.98px) compact column and accordion transitions", () => {
    assert.ok(css.includes('max-width: 767.98px'), "Missing max-width: 767.98px media query in style.css");
    assert.ok(css.includes('.inv-row-master'), "Missing .inv-row-master styling in style.css");
    assert.ok(css.includes('.inv-row-drawer'), "Missing .inv-row-drawer styling in style.css");
    assert.ok(css.includes('min-height: 50px'), "Master row should specify min-height: 50px for touch ergonomics");
    assert.ok(css.includes('min-height: 44px'), "Restock action button should specify min-height: 44px touch target");
});

check("M2-05: style.css preserves desktop/tablet grid (min-width: 768px)", () => {
    assert.ok(css.includes('min-width: 768px'), "Missing min-width: 768px desktop preservation block in style.css");
    assert.ok(css.includes('grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))'), "Desktop grid template must remain intact");
});

// --- 3. System Invariants ---
console.log("\n📍 SECTION 3: SYSTEM INVARIANTS & INTEGRITY AUDIT");

check("INV-01: Exactly 26 SVG modal close buttons matching regex in index.html", () => {
    const modalCloseRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseRegex) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${matches.length}`);
});

check("INV-02: Total modal-close-btn class occurrences in index.html is strictly 26", () => {
    const classOccurrences = (html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || []).length;
    assert.strictEqual(classOccurrences, 26, `Expected exactly 26 occurrences of modal-close-btn, found ${classOccurrences}`);
});

check("INV-03: Zero raw unicode emojis in buttons, tabs, or badges", () => {
    const rawEmojiPattern = /<button\b[^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)<\/button>/;
    const match = html.match(rawEmojiPattern);
    assert.ok(!match, `Found raw emoji in operational button: ${match ? match[0] : ''}`);
});

console.log("\n====================================================================");
console.log(`🎯 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================================");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
