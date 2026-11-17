/**
 * Comprehensive Verification Suite: Full-Screen Table Floor View & Bottom Bar Replacement
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const staffJs = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const posCss = fs.readFileSync(path.join(rootDir, 'css', 'pos.css'), 'utf8');

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
        failed++;
    }
}

console.log('====================================================');
console.log('🍽️ FULL-SCREEN TABLE FLOOR VIEW & BOTTOM BAR AUDIT');
console.log('====================================================\n');

// ------------------------------------------------------------
// PART 1: NAVIGATION BAR & KHATA RETENTION
// ------------------------------------------------------------
console.log('📍 PART 1: NAVIGATION BAR & KHATA RETENTION');

test('index.html .sidebar defines #nav-tables calling switchTab("tables")', () => {
    const navTablesMatch = html.match(/<button\b[^>]*id="nav-tables"[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(navTablesMatch, '#nav-tables button must exist in index.html');
    assert.ok(navTablesMatch[0].includes("switchTab('tables')"), 'Must call switchTab("tables")');
    assert.ok(navTablesMatch[1].includes('<svg'), '#nav-tables must contain a vector SVG icon');
    assert.ok(navTablesMatch[1].includes('Tables'), '#nav-tables must display "Tables" text');
});

test('index.html maintains hidden #nav-khata for backwards DOM compatibility', () => {
    const navKhataMatch = html.match(/<button\b[^>]*id="nav-khata"[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/);
    assert.ok(navKhataMatch, 'Hidden #nav-khata must exist in sidebar to prevent null pointer exceptions');
});

test('index.html .sidebar has strictly one #nav-more and exact 5-tab sequence: POS, Menu, Reports, Tables, More', () => {
    const moreMatches = html.match(/id="nav-more"/g);
    assert.strictEqual(moreMatches ? moreMatches.length : 0, 1, 'Must have strictly one #nav-more element');

    const sidebarContent = html.slice(html.indexOf('<div class="sidebar">'), html.indexOf('<!-- Top Bar / Nav Header -->'));
    const posIdx = sidebarContent.indexOf('id="nav-pos"');
    const menuIdx = sidebarContent.indexOf('id="nav-menu"');
    const reportIdx = sidebarContent.indexOf('id="nav-dashboard"');
    const tableIdx = sidebarContent.indexOf('id="nav-tables"');
    const moreIdx = sidebarContent.indexOf('id="nav-more"');

    assert.ok(posIdx < menuIdx, 'POS must precede Menu');
    assert.ok(menuIdx < reportIdx, 'Menu must precede Reports');
    assert.ok(reportIdx < tableIdx, 'Reports must precede Tables');
    assert.ok(tableIdx < moreIdx, 'Tables must precede More');
});

test('js/staff.js enforcePermissions keeps navTables accessible', () => {
    assert.ok(!staffJs.includes("navTables.style.display = 'none';\n    }\n}\nwindow.enforcePermissions"), 'Must not unconditionally force navTables display to none in enforcePermissions');
});

test('index.html #moreHubModal includes Khata card calling switchTab("khata")', () => {
    const moreHubSection = html.slice(html.indexOf('id="moreHubModal"'), html.indexOf('id="toast-container"'));
    assert.ok(moreHubSection.includes("switchTab('khata')"), '#moreHubModal must contain Khata entry');
    assert.ok(moreHubSection.includes('Khata & Customer Ledger') || moreHubSection.includes('Khata'), '#moreHubModal must label Khata clearly');
});

test('index.html #mobileSlideMenuDrawer includes both Tables and Khata options', () => {
    const drawerSection = html.slice(html.indexOf('id="mobileSlideMenuDrawer"'));
    assert.ok(drawerSection.includes("switchTab('tables')"), 'Mobile slide menu must have Tables option');
    assert.ok(drawerSection.includes("switchTab('khata')"), 'Mobile slide menu must have Khata option');
});

// ------------------------------------------------------------
// PART 2: DEDICATED TABLE VIEW & 4x8 GRID
// ------------------------------------------------------------
console.log('\n📍 PART 2: DEDICATED TABLE VIEW & 4x8 GRID');

test('index.html defines primary first-class <div id="tables" class="view">', () => {
    assert.ok(html.includes('<div id="tables" class="view">'), 'Must contain <div id="tables" class="view">');
    assert.ok(html.includes('id="tablesViewGridUI"'), 'Must contain #tablesViewGridUI container for the floor grid');
    assert.ok(html.includes('id="tableOrderFloatingBar"'), 'Must contain #tableOrderFloatingBar');
    assert.ok(html.includes('id="tablesViewStatsSummary"'), 'Must contain #tablesViewStatsSummary');
});

test('pos.css and style.css define .tables-fullscreen-grid responsive auto-fit layout', () => {
    assert.ok(posCss.includes('.tables-fullscreen-grid'), 'pos.css must define .tables-fullscreen-grid');
    assert.ok(styleCss.includes('.tables-fullscreen-grid'), 'Bundled style.css must contain .tables-fullscreen-grid');
});

test('js/pos.js defines renderTablesView() dynamically scaling to shopProfile.tableCount with Add Table card', () => {
    assert.ok(posJs.includes('function renderTablesView'), 'Must define renderTablesView');
    assert.ok(posJs.includes('shopProfile?.tableCount') || posJs.includes('shopProfile.tableCount'), 'Must dynamically scale to shopProfile.tableCount');
    assert.ok(posJs.includes('add-table-card'), 'Must append Add Table card');
    assert.ok(posJs.includes('window.renderTablesView = renderTablesView'), 'Must export renderTablesView');
});

test('js/pos.js renderTablesView formats table cards with identical POS telemetry', () => {
    assert.ok(posJs.includes('table-status-dot'), 'Must render table status dot');
    assert.ok(posJs.includes('table-num-pill'), 'Must render table number pill');
    assert.ok(posJs.includes('table-t-code'), 'Must render table T-code');
    assert.ok(posJs.includes('table-status-tag'), 'Must render status tag (VACANT, BILL READY, etc.)');
    assert.ok(posJs.includes('table-item-badge'), 'Must render item count badge');
    assert.ok(posJs.includes('table-card-amount'), 'Must render table bill amount');
    assert.ok(posJs.includes('selectTableInTableView'), 'Cards must trigger selectTableInTableView');
});

// ------------------------------------------------------------
// PART 3: FLOATING ORDER INSPECTOR & QUICK CHECKOUT
// ------------------------------------------------------------
console.log('\n📍 PART 3: FLOATING ORDER INSPECTOR & QUICK CHECKOUT');

test('js/pos.js defines updateTableOrderFloatingBar with complete order summary & actions', () => {
    assert.ok(posJs.includes('function updateTableOrderFloatingBar'), 'Must define updateTableOrderFloatingBar');
    assert.ok(posJs.includes('tofbCheckoutBtn'), 'Must control checkout button');
    assert.ok(posJs.includes('tofbItemsPreview'), 'Must preview order items');
    assert.ok(posJs.includes('tofbTotalVal'), 'Must format order total with currency symbol');
});

test('js/pos.js defines addItemsInPosFromTableView switching to POS with activeTable', () => {
    assert.ok(posJs.includes('function addItemsInPosFromTableView'), 'Must define addItemsInPosFromTableView');
    assert.ok(posJs.includes("switchTab('pos')"), 'Must switch to POS view');
    assert.ok(posJs.includes('window.addItemsInPosFromTableView = addItemsInPosFromTableView'), 'Must export on window');
});

test('js/pos.js defines checkoutFromTableView invoking openCheckoutModal', () => {
    assert.ok(posJs.includes('function checkoutFromTableView'), 'Must define checkoutFromTableView');
    assert.ok(posJs.includes('openCheckoutModal()'), 'Must open checkout modal directly');
    assert.ok(posJs.includes('window.checkoutFromTableView = checkoutFromTableView'), 'Must export on window');
});

test('js/pos.js printTableFromTableView calls canonical printKitchenTicket', () => {
    assert.ok(posJs.includes('printKitchenTicket()'), 'Must call printKitchenTicket');
    assert.ok(posJs.includes('window.printTableFromTableView = printTableFromTableView'), 'Must export on window');
});

test('js/pos.js uses calculateOrderTotals for accurate discount & GST totals', () => {
    assert.ok(posJs.includes('calculateOrderTotals(tInfo.items, tInfo.discount)'), 'Must pass discount to calculateOrderTotals');
});

test('js/settings.js switchTabDirect routes "tables" to view and renders floor', () => {
    assert.ok(!settingsJs.includes("if (tabId === 'tables') tabId = 'pos';"), 'Must NOT alias tables to pos');
    assert.ok(settingsJs.includes("tabId === 'tables'"), 'Must handle tabId === "tables"');
    assert.ok(settingsJs.includes('renderTablesView'), 'Must trigger renderTablesView on tab switch');
});

test('js/core.js applyStationProfileRestrictions shows navTables for supervisor and cashier', () => {
    assert.ok(coreJs.includes("navTables.style.display = 'flex'"), 'Must show navTables for counter staff');
});

test('js/pos.js syncTableUI keeps tables view synchronized', () => {
    assert.ok(posJs.includes("document.getElementById('tables')?.classList.contains('active')"), 'syncTableUI must check if tables view is active');
    assert.ok(posJs.includes('renderTablesView()'), 'syncTableUI must refresh renderTablesView when active');
});

// ------------------------------------------------------------
// PART 4: REPOSITORY INVARIANTS & SAFETY CHECKS
// ------------------------------------------------------------
console.log('\n📍 PART 4: REPOSITORY INVARIANTS & SAFETY CHECKS');

test('Exact count of 26 modal-close-btn SVG elements in index.html', () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, 'No modal-close-btn found');
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26 modal close SVGs, found ${svgMatches.length}`);
});

test('Zero raw unicode emojis inside <button> elements in index.html', () => {
    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const offenders = [];
    buttonMatches.forEach((btn, idx) => {
        if (emojiRegex.test(btn)) offenders.push({ idx, snippet: btn.slice(0, 80) });
    });
    assert.strictEqual(offenders.length, 0, `Found raw emojis in buttons: ${JSON.stringify(offenders)}`);
});

test('100% bit-for-bit binary parity between firestore.rules and database/firestore.rules', () => {
    const rootRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'));
    const dbRules = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'));
    assert.ok(rootRules.equals(dbRules), 'firestore.rules and database/firestore.rules must be 100% byte identical');
});

test('All 9 CSS modules in css/ have 100% balanced braces', () => {
    const cssDir = path.join(rootDir, 'css');
    const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
    assert.strictEqual(files.length, 9, `Expected 9 CSS modules, found ${files.length}`);
    files.forEach(f => {
        const content = fs.readFileSync(path.join(cssDir, f), 'utf8');
        const open = (content.match(/{/g) || []).length;
        const close = (content.match(/}/g) || []).length;
        assert.strictEqual(open, close, `Unbalanced braces in css/${f}: ${open} open vs ${close} close`);
    });
});

console.log('\n====================================================');
console.log(`🎯 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
    process.exit(1);
}
