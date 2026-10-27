/**
 * scratch/test_m1_adversarial.cjs
 * Empirical Challenger Verification Suite for Milestone 1
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const projectRoot = path.resolve(__dirname, '..');
const coreJsPath = path.join(projectRoot, 'js', 'core.js');
const indexHtmlPath = path.join(projectRoot, 'index.html');
const settingsJsPath = path.join(projectRoot, 'js', 'settings.js');
const dashboardJsPath = path.join(projectRoot, 'js', 'dashboard.js');
const marketingJsPath = path.join(projectRoot, 'js', 'marketing_inventory.js');
const menuJsPath = path.join(projectRoot, 'js', 'menu.js');
const appJsPath = path.join(projectRoot, 'app.js');
const culinaryJsPath = path.join(projectRoot, 'js', 'culinary_inventory.js');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failCount++;
    }
}

console.log('====================================================');
console.log('⚔️  ADVERSARIAL CHALLENGER SUITE: MILESTONE 1');
console.log('====================================================\n');

// ------------------------------------------------------------------
// SECTION 1: js/core.js formatCurrency STRESS-TESTING
// ------------------------------------------------------------------
console.log('📍 SECTION 1: formatCurrency ADVERSARIAL STRESS-TESTING');

// Extract formatCurrency definition from js/core.js
const coreJsContent = fs.readFileSync(coreJsPath, 'utf8');
const formatCurrencyMatch = coreJsContent.match(/function\s+formatCurrency\s*\([\s\S]*?\n\}/);
if (!formatCurrencyMatch) {
    throw new Error('formatCurrency not found in js/core.js');
}
const formatCurrency = new Function(`return ${formatCurrencyMatch[0]}`)();

test('formatCurrency(0) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(0), '₹0.00');
});

test('formatCurrency(-0) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(-0), '₹0.00');
});

test('formatCurrency(null) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(null), '₹0.00');
});

test('formatCurrency(undefined) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(undefined), '₹0.00');
});

test('formatCurrency("") (empty string) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(''), '₹0.00');
});

test('formatCurrency(false) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(false), '₹0.00');
});

test('formatCurrency(NaN) returns ₹0.00', () => {
    assert.strictEqual(formatCurrency(NaN), '₹0.00');
});

test('formatCurrency(50) returns ₹50.00', () => {
    assert.strictEqual(formatCurrency(50), '₹50.00');
});

test('formatCurrency(1234.5) formats with Indian comma grouping ₹1,234.50', () => {
    assert.strictEqual(formatCurrency(1234.5), '₹1,234.50');
});

test('formatCurrency(1000000) formats 10 Lakhs as ₹10,00,000.00', () => {
    assert.strictEqual(formatCurrency(1000000), '₹10,00,000.00');
});

test('formatCurrency(10000000) formats 1 Crore as ₹1,00,00,000.00', () => {
    assert.strictEqual(formatCurrency(10000000), '₹1,00,00,000.00');
});

test('formatCurrency("499.99") handles numeric string input', () => {
    assert.strictEqual(formatCurrency('499.99'), '₹499.99');
});

test('formatCurrency(-250.75) handles negative number', () => {
    const res = formatCurrency(-250.75);
    // Node.js en-IN format for negative numbers can be ₹-250.75 or -₹250.75
    assert.ok(res === '₹-250.75' || res === '-₹250.75', `Unexpected format: ${res}`);
});

test('formatCurrency(Number.MAX_SAFE_INTEGER) handles huge number without crash', () => {
    const res = formatCurrency(Number.MAX_SAFE_INTEGER);
    assert.ok(res.startsWith('₹'), `Expected starting with ₹, got: ${res}`);
    assert.ok(res.endsWith('.00'), `Expected ending with .00, got: ${res}`);
});

test('formatCurrency(0.1 + 0.2) handles floating point rounding (0.30)', () => {
    assert.strictEqual(formatCurrency(0.1 + 0.2), '₹0.30');
});

// ------------------------------------------------------------------
// SECTION 2: js/core.js getLocalISODate STRESS-TESTING
// ------------------------------------------------------------------
console.log('\n📍 SECTION 2: getLocalISODate ADVERSARIAL STRESS-TESTING');

const getLocalISODateMatch = coreJsContent.match(/function\s+getLocalISODate\s*\([\s\S]*?\n\}/);
if (!getLocalISODateMatch) {
    throw new Error('getLocalISODate not found in js/core.js');
}
const getLocalISODate = new Function(`return ${getLocalISODateMatch[0]}`)();

test('getLocalISODate() default parameter produces valid YYYY-MM-DD for today', () => {
    const res = getLocalISODate();
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.strictEqual(res, expected);
});

test('getLocalISODate with single digit month and day zero-pads correctly', () => {
    const d = new Date(2026, 4, 3); // May 3, 2026
    assert.strictEqual(getLocalISODate(d), '2026-05-03');
});

test('getLocalISODate with year boundary Dec 31', () => {
    const d = new Date(2026, 11, 31);
    assert.strictEqual(getLocalISODate(d), '2026-12-31');
});

test('getLocalISODate with year boundary Jan 1', () => {
    const d = new Date(2026, 0, 1);
    assert.strictEqual(getLocalISODate(d), '2026-01-01');
});

test('getLocalISODate with leap year Feb 29 (2024)', () => {
    const d = new Date(2024, 1, 29);
    assert.strictEqual(getLocalISODate(d), '2024-02-29');
});

test('getLocalISODate with century leap year Feb 29 (2000)', () => {
    const d = new Date(2000, 1, 29);
    assert.strictEqual(getLocalISODate(d), '2000-02-29');
});

test('getLocalISODate with non-leap year Feb 28 (2025)', () => {
    const d = new Date(2025, 1, 28);
    assert.strictEqual(getLocalISODate(d), '2025-02-28');
});

test('getLocalISODate(null) safely falls back to today instead of throwing', () => {
    const res = getLocalISODate(null);
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

test('getLocalISODate(undefined) safely falls back to today', () => {
    const res = getLocalISODate(undefined);
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

test('getLocalISODate("2026-10-25") string arg falls back to today without throwing', () => {
    const res = getLocalISODate("2026-10-25");
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

test('getLocalISODate(new Date("invalid")) invalid Date object falls back to today without NaN', () => {
    const invalidDate = new Date("invalid-date-string");
    const res = getLocalISODate(invalidDate);
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!res.includes('NaN'), `Result contains NaN: ${res}`);
});

test('getLocalISODate({}) object argument falls back safely', () => {
    const res = getLocalISODate({});
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

test('getLocalISODate(123456789) number argument falls back safely', () => {
    const res = getLocalISODate(123456789);
    assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

// ------------------------------------------------------------------
// SECTION 3: OTHER CONSOLIDATED CORE UTILITIES
// ------------------------------------------------------------------
console.log('\n📍 SECTION 3: OTHER CONSOLIDATED CORE UTILITIES');

test('js/core.js defines openModal, closeModal, showToast, escapeHtml on window', () => {
    assert.ok(coreJsContent.includes('window.openModal = openModal;'), 'Missing window.openModal');
    assert.ok(coreJsContent.includes('window.closeModal = closeModal;'), 'Missing window.closeModal');
    assert.ok(coreJsContent.includes('window.showToast = showToast;'), 'Missing window.showToast');
    assert.ok(coreJsContent.includes('window.escapeHtml = escapeHtml;'), 'Missing window.escapeHtml');
    assert.ok(coreJsContent.includes('window.loadLazyScript = loadLazyScript;'), 'Missing window.loadLazyScript');
});

test('openModal and closeModal manage aria-hidden and display', () => {
    assert.ok(coreJsContent.includes("el.setAttribute('aria-hidden', 'false')"));
    assert.ok(coreJsContent.includes("el.setAttribute('aria-hidden', 'true')"));
    assert.ok(coreJsContent.includes("el.style.display = 'flex'"));
    assert.ok(coreJsContent.includes("el.style.display = 'none'"));
});

test('showToast supports polymorphic type argument and assigns toast-${safeType}', () => {
    assert.ok(coreJsContent.includes('function showToast(message, type = \'info\')'));
    assert.ok(coreJsContent.includes('toast.className = `toast toast-${safeType}`;'));
});

test('loadLazyScript utilizes _loadedLazyScripts Map cache', () => {
    assert.ok(coreJsContent.includes('const _loadedLazyScripts = new Map();'));
    assert.ok(coreJsContent.includes('_loadedLazyScripts.has(src)'));
    assert.ok(coreJsContent.includes('_loadedLazyScripts.set(src, promise)'));
});

// ------------------------------------------------------------------
// SECTION 4: INVARIANT - EXACTLY 26 SVG MODAL CLOSE BUTTONS
// ------------------------------------------------------------------
console.log('\n📍 SECTION 4: 26 SVG MODAL CLOSE BUTTONS INVARIANT');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const modalCloseBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^\"']*[\"'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
const matches = indexHtml.match(modalCloseBtnRegex) || [];

test('Exact count of SVG modal close buttons matching regex is strictly 26', () => {
    assert.strictEqual(matches.length, 26, `Expected 26 matches, got ${matches.length}`);
});

const allModalCloseClasses = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
test('Total occurrences of modal-close-btn class in index.html is strictly 26', () => {
    assert.strictEqual(allModalCloseClasses.length, 26, `Expected 26 class occurrences, got ${allModalCloseClasses.length}`);
});

test('Zero raw unicode ✕ or X characters inside modal-close-btn elements', () => {
    for (const match of matches) {
        assert.ok(!match.includes('✕'), `Found unicode ✕ in: ${match}`);
        assert.ok(!match.includes('&#10005;'), `Found entity ✕ in: ${match}`);
    }
});

test('Table config modal SVG close button at line 2406 is preserved with closeTableConfigModal()', () => {
    assert.ok(indexHtml.includes('onclick="closeTableConfigModal()"><svg width="15" height="15"'), 'Missing closeTableConfigModal SVG button');
});

test('Table management modal SVG close button is preserved with closeTableManagementModal()', () => {
    assert.ok(indexHtml.includes('onclick="closeTableManagementModal()"><svg width="15" height="15"'), 'Missing closeTableManagementModal SVG button');
});

// ------------------------------------------------------------------
// SECTION 5: TABLE MANAGEMENT ROUTING & UNIFICATION
// ------------------------------------------------------------------
console.log('\n📍 SECTION 5: TABLE MANAGEMENT ROUTING & UNIFICATION');

const settingsJs = fs.readFileSync(settingsJsPath, 'utf8');

test('js/settings.js does not define conflicting saveTableSettings()', () => {
    assert.ok(!settingsJs.includes('function saveTableSettings()'), 'Conflicting saveTableSettings() still exists in js/settings.js');
});

test('index.html contains the authoritative saveTableSettings() targeting #tableManagementModal', () => {
    assert.ok(indexHtml.includes('function saveTableSettings()'), 'Missing authoritative saveTableSettings in index.html');
    assert.ok(indexHtml.includes('tableManagementModal'), 'Authoritative saveTableSettings does not reference tableManagementModal');
});

test('js/settings.js openTableConfigModal safely proxies to openTableManagementModal', () => {
    assert.ok(settingsJs.includes('if (typeof openTableManagementModal === \'function\')'), 'Missing proxy check to openTableManagementModal');
    assert.ok(settingsJs.includes('openTableManagementModal();'), 'Missing call to openTableManagementModal');
});

test('Settings tile 7 in index.html triggers openTableManagementModal()', () => {
    const tile7Match = indexHtml.match(/id=["']settingTileTablesFloors["'][^>]*onclick=["']([^"']+)["']/);
    assert.ok(tile7Match, 'settingTileTablesFloors not found in index.html');
    assert.ok(tile7Match[1].includes('openTableManagementModal()'), `Tile 7 does not trigger openTableManagementModal: ${tile7Match[1]}`);
});

// ------------------------------------------------------------------
// SECTION 6: DEAD CODE CLEANUP VERIFICATION
// ------------------------------------------------------------------
console.log('\n📍 SECTION 6: DEAD CODE CLEANUP VERIFICATION');

const marketingJs = fs.readFileSync(marketingJsPath, 'utf8');

test('marketing_inventory.js pruned dead WhatsApp hub functions', () => {
    assert.ok(!marketingJs.includes('function selectWhatsAppTemplate'), 'selectWhatsAppTemplate was not pruned');
    assert.ok(!marketingJs.includes('function renderWhatsAppPreviewBubble'), 'renderWhatsAppPreviewBubble was not pruned');
    assert.ok(!marketingJs.includes('function renderWhatsAppHubUI'), 'renderWhatsAppHubUI was not pruned');
    assert.ok(!marketingJs.includes('function renderWhatsAppCustomerBroadcastList'), 'renderWhatsAppCustomerBroadcastList was not pruned');
    assert.ok(!marketingJs.includes('function openWhatsAppHubSubView'), 'openWhatsAppHubSubView was not pruned');
    assert.ok(!marketingJs.includes('function closeWhatsAppHubSubView'), 'closeWhatsAppHubSubView was not pruned');
});

test('marketing_inventory.js pruned dead telemetry DOM renderers', () => {
    assert.ok(!marketingJs.includes('function calculateLossAversionMetrics'), 'calculateLossAversionMetrics was not pruned');
    assert.ok(!marketingJs.includes('function renderInventoryTelemetryUI'), 'renderInventoryTelemetryUI was not pruned');
    assert.ok(!marketingJs.includes('function promptRestockIngredient'), 'promptRestockIngredient was not pruned');
});

test('marketing_inventory.js retains operational Voice Billing engine', () => {
    assert.ok(marketingJs.includes('initVoiceEngine'), 'initVoiceEngine missing');
    assert.ok(marketingJs.includes('toggleVoiceBilling'), 'toggleVoiceBilling missing');
    assert.ok(marketingJs.includes('parseAndPushVoiceOrder'), 'parseAndPushVoiceOrder missing');
});

test('marketing_inventory.js retains portion chips & price chips', () => {
    assert.ok(marketingJs.includes('applyPortionChip'), 'applyPortionChip missing');
    assert.ok(marketingJs.includes('applyPriceChip'), 'applyPriceChip missing');
});

test('marketing_inventory.js retains defaultDishRecipes & defaultInventoryData required by tests', () => {
    assert.ok(marketingJs.includes('Refined Wheat & All-Purpose Flour'), 'Missing Flour in inventory');
    assert.ok(marketingJs.includes('defaultDishRecipes'), 'Missing defaultDishRecipes');
    assert.ok(marketingJs.includes('deductInventoryForOrder'), 'Missing deductInventoryForOrder');
});

const menuJs = fs.readFileSync(menuJsPath, 'utf8');

test('menu.js pruned obsolete menuTableBody DOM generation', () => {
    assert.ok(!menuJs.includes('menuTableBody'), 'menuTableBody still referenced in js/menu.js');
});

test('menu.js cleanly renders into cleanItemCardsList', () => {
    assert.ok(menuJs.includes('cleanItemCardsList'), 'cleanItemCardsList missing in js/menu.js');
});

const appJs = fs.readFileSync(appJsPath, 'utf8');

test('app.js does not define duplicate loadLazyScript', () => {
    assert.ok(!appJs.includes('function loadLazyScript'), 'Duplicate loadLazyScript still in app.js');
});

const culinaryJs = fs.readFileSync(culinaryJsPath, 'utf8');

test('culinary_inventory.js does not define duplicate escapeHtml', () => {
    assert.ok(!culinaryJs.includes('function escapeHtml'), 'Duplicate escapeHtml still in culinary_inventory.js');
});

// ------------------------------------------------------------------
// SECTION 7: DASHBOARD EXPENSE HANDLERS
// ------------------------------------------------------------------
console.log('\n📍 SECTION 7: DASHBOARD EXPENSE HANDLERS');

const dashboardJs = fs.readFileSync(dashboardJsPath, 'utf8');

test('dashboard.js addExpense safely targets #quickExpenseNameInput / #quickExpenseCostInput', () => {
    assert.ok(dashboardJs.includes('quickExpenseNameInput'), 'quickExpenseNameInput missing in addExpense');
    assert.ok(dashboardJs.includes('quickExpenseCostInput'), 'quickExpenseCostInput missing in addExpense');
});

test('dashboard.js editExpense safely targets quickExpenseModal fields without throwing', () => {
    assert.ok(dashboardJs.includes('quickExpenseEditId'), 'quickExpenseEditId missing in editExpense');
    assert.ok(dashboardJs.includes('quickExpenseModalTitle'), 'quickExpenseModalTitle missing in editExpense');
});

// ------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(`🎯 CHALLENGER AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('====================================================');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
