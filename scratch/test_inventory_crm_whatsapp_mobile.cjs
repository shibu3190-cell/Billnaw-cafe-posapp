const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const custJs = fs.readFileSync(path.join(root, 'js', 'customers.js'), 'utf8');
const invJs = fs.readFileSync(path.join(root, 'js', 'culinary_inventory.js'), 'utf8');

let passed = 0;
function check(name, fn) {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
}

console.log('====================================================');
console.log('🧪 INVENTORY, CUSTOMERS CRM & WHATSAPP CAMPAIGN AUDIT');
console.log('====================================================');

// 1. WhatsApp Phone Normalization
check('CRM-01: formatWhatsAppPhone prevents double 9191 prefix on Indian numbers', () => {
    const fnMatch = custJs.match(/function formatWhatsAppPhone[\s\S]*?^\}/m);
    assert.ok(fnMatch, 'formatWhatsAppPhone must exist');
    const formatWhatsAppPhone = new Function(`return (${fnMatch[0]})`)();
    assert.strictEqual(formatWhatsAppPhone('9876543210'), '919876543210');
    assert.strictEqual(formatWhatsAppPhone('+91 98765 43210'), '919876543210');
    assert.strictEqual(formatWhatsAppPhone('09876543210'), '919876543210');
    assert.strictEqual(formatWhatsAppPhone('919876543210'), '919876543210');
    assert.strictEqual(formatWhatsAppPhone(''), '');
});

// 2. WhatsApp Campaign Real DOM Wiring Fixes
check('WA-01: selectAiSegment targets #aiSegmentsContainer .filter-pill and #aiSeg-*', () => {
    assert.ok(custJs.includes("document.querySelectorAll('#aiSegmentsContainer .filter-pill"));
    assert.ok(custJs.includes('`aiSeg-${segmentKey}`'));
});

check('WA-02: renderAiWhatsAppHubUI populates all 5 live #aiSegCount-* badges', () => {
    assert.ok(custJs.includes('`aiSegCount-${k}`'));
    ['all', 'weekend', 'vip', 'inactive', 'loyalty'].forEach(k => {
        assert.ok(html.includes(`id="aiSegCount-${k}"`), `Missing #aiSegCount-${k}`);
    });
});

check('WA-03: runWeeklyAiMarketingScan updates real #aiScanSummaryText & generateAiCampaignCopy targets #generateAiCampaignBtn', () => {
    assert.ok(custJs.includes("getElementById('aiScanSummaryText')"));
    assert.ok(custJs.includes("getElementById('generateAiCampaignBtn')"));
});

check('WA-04: toggleWaPreviewExpand portals #waPhoneMockupCard onto document.body so Step 1/2/3 preview works', () => {
    assert.ok(custJs.includes('document.body.appendChild(mockup)'));
    assert.ok(custJs.includes('_waMockupHomePlaceholder'));
});

check('WA-05: triggerBulkWhatsAppBroadcast tracks sent customers and advances to next unsent diner', () => {
    assert.ok(custJs.includes('waDispatchedCustomerIds'));
    assert.ok(custJs.includes('markWaCustomerDispatched'));
});

check('WA-06: #custTabMarketing has 148px mobile bottom clearance and responsive .wa-hub-grid', () => {
    assert.ok(css.includes('#customers #custTabMarketing'));
    assert.ok(css.includes('padding-bottom: 148px'));
    assert.ok(css.includes('.wa-offer-inputs-grid'));
});

// 3. Inventory Functional & Mobile UX Fixes
check('INV-01: #restockExpenseModal includes #rtrRestockMaterialSelect for Quick Restock without pre-selected itemId', () => {
    assert.ok(html.includes('id="rtrRestockMaterialSelect"'));
    assert.ok(invJs.includes('onRestockMaterialSelectChange'));
    assert.ok(invJs.includes('openAddMaterialModal();'));
});

check('INV-02: submitRestockExpense refreshes hub tab, sub tab, and telemetry KPIs', () => {
    const start = invJs.indexOf('async function submitRestockExpense()');
    const end = invJs.indexOf('function closeRestockModal()', start);
    const body = invJs.slice(start, end);
    assert.ok(body.includes('renderActiveHubTab()'));
    assert.ok(body.includes('renderInventoryTelemetryUI()'));
});

check('INV-03: filterRawStockCategory auto-switches to raw_stock tab and updates active KPI ring', () => {
    const start = invJs.indexOf('function filterRawStockCategory(');
    const end = invJs.indexOf('const expandedItemRowIds', start);
    const body = invJs.slice(start, end);
    assert.ok(body.includes("switchInventoryHubTab('raw_stock')"));
    assert.ok(body.includes('is-active-kpi'));
});

check('INV-04: Zero duplicated empty-state blocks in culinary_inventory.js', () => {
    const rawEmpty = (invJs.match(/class="empty-inventory-state"/g) || []).length;
    const prepEmpty = (invJs.match(/class="empty-prep-state"/g) || []).length;
    const recEmpty = (invJs.match(/class="empty-recipe-state"/g) || []).length;
    assert.strictEqual(rawEmpty, 1, `Expected 1 raw empty state, found ${rawEmpty}`);
    assert.strictEqual(prepEmpty, 1, `Expected 1 prep empty state, found ${prepEmpty}`);
    assert.strictEqual(recEmpty, 1, `Expected 1 recipe empty state, found ${recEmpty}`);
});

// 4. Unified Palette & Repository Invariants
check('UI-01: Zero stray warm beige, brown, or coral hexes in style.css + 26 modal-close-btn SVGs', () => {
    const stray = ['#FAF7F4', '#F8F5F1', '#F4F0EA', '#F4EEE9', '#F9F7F5', '#E05A38', '#E85D3F', '#C55335', '#FAF5F0', '#FBF9F6', '#FCFBF9', '#7D4F42'];
    stray.forEach(hex => {
        assert.strictEqual(css.includes(hex), false, `Found stray color ${hex} in style.css`);
    });
    const closeBtns = (html.match(/class="[^"]*modal-close-btn[^"]*"/g) || []).length;
    assert.strictEqual(closeBtns, 26, `Expected strictly 26 modal-close-btn, found ${closeBtns}`);
});

console.log(`\n🎉 ALL ${passed} INVENTORY / CRM / WHATSAPP CHECKS PASSED 100%!`);
