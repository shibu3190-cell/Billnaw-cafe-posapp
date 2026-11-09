// scratch/test_report_total_orders_card_view.cjs
// Verification suite for "Sales & Billing Transactions Log strictly Card View & Total Orders Modal navigation with Details action"

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const dashJsPath = path.join(root, 'js', 'dashboard.js');

console.log('=== TEST SUITE: SALES & BILLING TRANSACTIONS CARD VIEW & TOTAL ORDERS MODAL ===\n');

// 1. Static HTML Invariant & Element Integrity Checks
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('[1] Checking index.html static markup invariants:');

// Check ordersLogModal existence
assert.ok(html.includes('id="ordersLogModal"'), 'Missing #ordersLogModal in index.html');
console.log('  - #ordersLogModal element exists in DOM.');

// Check collision-free close button (.orders-log-close-btn, NOT .modal-close-btn)
assert.ok(html.includes('class="orders-log-close-btn"'), 'Missing .orders-log-close-btn in #ordersLogModal');
const modalCloseBtns = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
assert.strictEqual(modalCloseBtns.length, 26, `Strict invariant violated: expected exactly 26 .modal-close-btn SVGs, found ${modalCloseBtns.length}`);
console.log('  - Strictly 26 .modal-close-btn SVG buttons preserved.');

// Check KPI Card click handler
assert.ok(html.includes('id="kpiCard-orders"') && html.includes("filterDashboardByMetric('orders')"), 'kpiCard-orders must call filterDashboardByMetric(\'orders\')');
console.log('  - #kpiCard-orders is wired to filterDashboardByMetric(\'orders\').');

// Check report section cards view strictly enforced (pill toggle hidden)
assert.ok(html.includes('class="dashFilterPill-group" style="display: none;'), 'dashFilterPill-group must be hidden to enforce strictly card view in report section');
console.log('  - Report section ledger view toggle hidden to enforce strictly card view.');

// Check required modal inner elements
const requiredModalIds = [
    'ordersModalFilterSubtitle',
    'ordersModalCountBadge',
    'ordersModalAmountBadge',
    'ordersModalSearchInput',
    'ordersModalCardsGrid',
    'ordersModalPrevBtn',
    'ordersModalNextBtn',
    'ordersModalPageIndicator'
];
requiredModalIds.forEach(id => {
    assert.ok(html.includes(`id="${id}"`), `Missing required element #${id} inside #ordersLogModal`);
});
console.log(`  - All ${requiredModalIds.length} inner modal controls verified in index.html.`);

// 2. Behavioral Verification in Simulated DOM Environment
console.log('\n[2] Checking JavaScript behavioral logic in simulated DOM:');

// Build mock DOM elements
const mockElements = {};
function createMockEl(id) {
    const el = {
        id,
        style: { display: 'none' },
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        },
        value: '',
        textContent: '',
        innerText: '',
        innerHTML: '',
        disabled: false
    };
    mockElements[id] = el;
    return el;
}

[
    'ordersLogModal', 'ordersModalFilterSubtitle', 'ordersModalCountBadge', 'ordersModalAmountBadge',
    'ordersModalSearchInput', 'ordersModalCardsGrid', 'ordersModalPrevBtn', 'ordersModalNextBtn',
    'ordersModalPageIndicator', 'kpiCard-orders', 'kpiCard-sales', 'kpiCard-expenses', 'kpiCard-profit',
    'kpiGrossSales', 'kpiTotalExpenses', 'kpiNetProfit', 'kpiTotalOrders', 'kpiAvgOrderValue',
    'kpiGrossSub', 'kpiExpenseSub', 'kpiProfitSub', 'kpiOrdersSub', 'historyCardsGrid', 'historyTableViewWrap',
    'dashViewModeCardsBtn', 'dashViewModeTableBtn', 'reportDateSelect', 'reportCustomStartDate', 'reportCustomEndDate',
    'dashPayModeFilter', 'dashOrderTypeFilter', 'dashSearchInput', 'historyPrevPageBtn', 'historyNextPageBtn',
    'historyPageIndicator', 'dashLogCountSubtitle'
].forEach(id => createMockEl(id));

// Setup global mock sandbox
const todayDate = new Date();
const todayISO = todayDate.toISOString().slice(0, 10);
const yDate = new Date();
yDate.setDate(yDate.getDate() - 1);
const yesterdayISO = yDate.toISOString().slice(0, 10);
const wDate = new Date();
wDate.setDate(wDate.getDate() - 4);
const weekISO = wDate.toISOString().slice(0, 10);

const sampleOrders = [
    {
        id: 1001,
        billNo: '1001',
        filterDate: todayISO,
        date: `${todayISO}, 10:30 AM`,
        table: 'Table 4',
        customer: 'Alice Sharma',
        items: 'Masala Chai (x2), Bun Maska (x1)',
        paymentMode: 'UPI',
        amount: 140.00
    },
    {
        id: 1002,
        billNo: '1002',
        filterDate: todayISO,
        date: `${todayISO}, 11:15 AM`,
        table: 'Takeaway',
        customer: 'Bob Verma',
        items: 'Cold Coffee (x1), Veg Sandwich (x1)',
        paymentMode: 'Cash',
        amount: 210.00
    },
    {
        id: 1003,
        billNo: '1003',
        filterDate: yesterdayISO,
        date: `${yesterdayISO}, 03:45 PM`,
        table: 'Table 2',
        customer: 'Charlie Brown',
        items: 'Espresso (x1)',
        paymentMode: 'Card',
        amount: 120.00
    },
    {
        id: 1004,
        billNo: '1004',
        filterDate: weekISO,
        date: `${weekISO}, 01:20 PM`,
        table: 'Table 1',
        customer: 'Diana Prince',
        items: 'Paneer Wrap (x2)',
        paymentMode: 'UPI',
        amount: 280.00
    }
];

global.window = global;
global.window.addEventListener = () => {};
global.document = {
    getElementById(id) { return mockElements[id] || null; },
    querySelectorAll(selector) {
        if (selector === '.dashboard-kpi-card') {
            return [mockElements['kpiCard-orders'], mockElements['kpiCard-sales'], mockElements['kpiCard-expenses'], mockElements['kpiCard-profit']];
        }
        return [];
    },
    addEventListener() {}
};
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
};
global.escapeHtml = (s) => String(s || '');
global.getLocalISODate = (d) => (d ? new Date(d) : todayDate).toISOString().slice(0, 10);
global.getLocalISOMonth = () => todayISO.slice(0, 7);
global.orderHistory = [...sampleOrders];
global.dailyExpenses = [];
global.currentDashboardRange = 'today';
global.currentDashboardMetric = 'all';
global.viewOrderInvoiceModalCalls = [];
global.viewOrderInvoiceModal = (id) => { global.viewOrderInvoiceModalCalls.push(id); };

// Load js/dashboard.js
const dashCode = fs.readFileSync(dashJsPath, 'utf8');
eval(dashCode);

// Test 2.1: filterDashboardByMetric('orders') opens #ordersLogModal
console.log('  - Testing filterDashboardByMetric(\'orders\') invocation...');
assert.strictEqual(mockElements['ordersLogModal'].style.display, 'none');
global.filterDashboardByMetric('orders');

assert.strictEqual(mockElements['ordersLogModal'].style.display, 'flex', '#ordersLogModal must be set to display: flex on orders metric click');
console.log('    ✓ #ordersLogModal successfully opened on Total Orders click.');

// Test 2.2: Top filter synchronization (currentDashboardRange = 'today')
console.log('  - Testing orders filtered matching top date range ("today"):');
const cardsHtml = mockElements['ordersModalCardsGrid'].innerHTML;
assert.ok(cardsHtml.includes('#1001'), 'Must include today order #1001');
assert.ok(cardsHtml.includes('#1002'), 'Must include today order #1002');
assert.ok(!cardsHtml.includes('#1003'), 'Must NOT include yesterday order #1003 when range is today');
assert.ok(!cardsHtml.includes('#1004'), 'Must NOT include last week order #1004 when range is today');
assert.strictEqual(mockElements['ordersModalCountBadge'].textContent, '2 Orders');
assert.strictEqual(mockElements['ordersModalAmountBadge'].textContent, '₹ 350.00');
assert.ok(mockElements['ordersModalFilterSubtitle'].textContent.includes('Today'), 'Subtitle must indicate Today range filter');
console.log('    ✓ Rendered exactly 2 orders matching Today filter with total ₹ 350.00.');

// Test 2.3: Details button present on card and triggers viewOrderInvoiceModal
console.log('  - Testing Details button markup and invoice modal action:');
assert.ok(cardsHtml.includes('<span>Details</span>'), 'Cards must contain <span>Details</span> button');
assert.ok(cardsHtml.includes('viewOrderInvoiceModal(1001)'), 'Details button must invoke viewOrderInvoiceModal(1001)');
assert.ok(cardsHtml.includes('viewOrderInvoiceModal(1002)'), 'Details button must invoke viewOrderInvoiceModal(1002)');
console.log('    ✓ Card view has prominent Details option triggering viewOrderInvoiceModal().');

// Test 2.4: Top filter change to 'yesterday'
console.log('  - Testing top filter switch to "yesterday":');
global.setDashboardDateRange('yesterday');
global.renderOrdersLogModalCards();
const yCardsHtml = mockElements['ordersModalCardsGrid'].innerHTML;
assert.ok(!yCardsHtml.includes('#1001'), 'Must not include today order');
assert.ok(yCardsHtml.includes('#1003'), 'Must include yesterday order #1003');
assert.strictEqual(mockElements['ordersModalCountBadge'].textContent, '1 Orders');
assert.strictEqual(mockElements['ordersModalAmountBadge'].textContent, '₹ 120.00');
assert.ok(mockElements['ordersModalFilterSubtitle'].textContent.includes('Yesterday'), 'Subtitle must indicate Yesterday');
console.log('    ✓ Modal cards dynamically updated for Yesterday filter (1 order, ₹ 120.00).');

// Test 2.5: Top filter change to 'week'
console.log('  - Testing top filter switch to "week":');
global.setDashboardDateRange('week');
global.renderOrdersLogModalCards();
const wCardsHtml = mockElements['ordersModalCardsGrid'].innerHTML;
assert.ok(wCardsHtml.includes('#1001'));
assert.ok(wCardsHtml.includes('#1002'));
assert.ok(wCardsHtml.includes('#1003'));
assert.ok(wCardsHtml.includes('#1004'));
assert.strictEqual(mockElements['ordersModalCountBadge'].textContent, '4 Orders');
assert.strictEqual(mockElements['ordersModalAmountBadge'].textContent, '₹ 750.00');
console.log('    ✓ Modal cards dynamically updated for This Week (4 orders, ₹ 750.00).');

// Test 2.6: Modal Quick Search filtering
console.log('  - Testing quick search inside modal:');
mockElements['ordersModalSearchInput'].value = 'Alice';
global.onOrdersModalSearchInput();
const sCardsHtml = mockElements['ordersModalCardsGrid'].innerHTML;
assert.ok(sCardsHtml.includes('#1001'));
assert.ok(!sCardsHtml.includes('#1002'));
assert.ok(!sCardsHtml.includes('#1003'));
assert.ok(!sCardsHtml.includes('#1004'));
mockElements['ordersModalSearchInput'].value = '';
global.onOrdersModalSearchInput();
console.log('    ✓ Quick search inside modal filters correctly by customer/item/bill.');

// Test 2.7: Close modal
console.log('  - Testing closeOrdersLogModal():');
global.closeOrdersLogModal();
assert.strictEqual(mockElements['ordersLogModal'].style.display, 'none');
console.log('    ✓ closeOrdersLogModal() hides modal.');

// Test 2.8: Strict Card View enforcement in setDashboardViewMode
console.log('  - Testing strict card view enforcement:');
global.setDashboardViewMode('table');
assert.strictEqual(global.currentDashboardViewMode, 'cards', 'Must enforce cards mode even if table requested');
assert.strictEqual(mockElements['historyCardsGrid'].style.display, 'grid');
assert.strictEqual(mockElements['historyTableViewWrap'].style.display, 'none');
console.log('    ✓ setDashboardViewMode strictly enforces card view.');

console.log('\n✅ ALL TOTAL ORDERS CARD VIEW & MODAL TESTS PASSED 100%!');
