// scratch/test_quick_stock_adjustment_fix.cjs
// Test verification for saveQuickStockAdjustment & toggleStockUnlimited null safety fix

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const menuJsPath = path.join(root, 'js', 'menu.js');

console.log('=== TEST SUITE: QUICK STOCK ADJUSTMENT NULL FIX ===\n');

// Mock DOM & Environment
const mockElements = {
    quickAdjustStockModal: { style: { display: 'none' } },
    quickAdjustItemName: { innerText: '' },
    quickAdjustItemCategory: { innerText: '' },
    quickAdjustItemId: { value: '' },
    quickAdjustStockInput: { value: '' }
};

let toastMessages = [];
let persistMenuCalled = false;
let renderMenuUICalled = false;

global.window = global;
global.window.addEventListener = () => {};
global.document = {
    getElementById(id) {
        return mockElements[id] || null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}
};
global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = String(v); }
};
global.showToast = (msg, type) => {
    toastMessages.push({ msg, type });
};
global.persistMenu = () => { persistMenuCalled = true; };
global.renderMenuUI = () => { renderMenuUICalled = true; };

global.menuItems = [
    { id: 101, name: 'Samosa', category: 'Snacks', price: 15, trackStock: true, stockQty: 20, stock: 20 },
    { id: 102, name: 'Cold Coffee', category: 'Beverages', price: 80, trackStock: false, stockQty: 0, stock: 0 }
];

const menuCode = fs.readFileSync(menuJsPath, 'utf8');
eval(menuCode);

// Test 1: saveQuickStockAdjustment normal flow
console.log('[1] Testing saveQuickStockAdjustment with valid open item...');
global.openQuickAdjustStockModal(101);
assert.strictEqual(mockElements.quickAdjustStockModal.style.display, 'flex');
assert.strictEqual(mockElements.quickAdjustItemName.innerText, 'Samosa');
assert.strictEqual(mockElements.quickAdjustItemId.value, 101);

mockElements.quickAdjustStockInput.value = '45';
assert.doesNotThrow(() => {
    global.saveQuickStockAdjustment();
}, 'saveQuickStockAdjustment threw an exception!');

assert.strictEqual(global.menuItems[0].stockQty, 45);
assert.strictEqual(global.menuItems[0].trackStock, true);
assert.strictEqual(mockElements.quickAdjustStockModal.style.display, 'none');
assert.ok(toastMessages.some(t => t.msg === 'Updated Samosa stock to 45.' && t.type === 'success'), 'Expected success toast for Samosa');
console.log('  ✅ PASS: saveQuickStockAdjustment successfully updated stock and displayed toast without null crash.');

// Test 2: toggleStockUnlimited normal flow
console.log('\n[2] Testing toggleStockUnlimited with valid open item...');
toastMessages = [];
global.openQuickAdjustStockModal(101);
assert.strictEqual(mockElements.quickAdjustStockModal.style.display, 'flex');

assert.doesNotThrow(() => {
    global.toggleStockUnlimited();
}, 'toggleStockUnlimited threw an exception!');

assert.strictEqual(global.menuItems[0].trackStock, false);
assert.strictEqual(mockElements.quickAdjustStockModal.style.display, 'none');
assert.ok(toastMessages.some(t => t.msg === 'Samosa stock set to Unlimited.' && t.type === 'success'), 'Expected unlimited toast for Samosa');
console.log('  ✅ PASS: toggleStockUnlimited successfully set unlimited stock and displayed toast without null crash.');

// Test 3: Resilient fallback when activeAdjustingItem is null but input has item ID
console.log('\n[3] Testing resilient fallback from quickAdjustItemId when activeAdjustingItem is null...');
toastMessages = [];
mockElements.quickAdjustItemId.value = '102';
mockElements.quickAdjustStockInput.value = '60';

assert.doesNotThrow(() => {
    global.saveQuickStockAdjustment();
}, 'saveQuickStockAdjustment threw an exception on fallback!');

assert.strictEqual(global.menuItems[1].stockQty, 60);
assert.strictEqual(global.menuItems[1].trackStock, true);
assert.ok(toastMessages.some(t => t.msg === 'Updated Cold Coffee stock to 60.' && t.type === 'success'));
console.log('  ✅ PASS: Fallback lookup by ID works seamlessly even if activeAdjustingItem was null.');

// Test 4: Graceful handling when no item is found
console.log('\n[4] Testing graceful exit when item is completely missing...');
mockElements.quickAdjustItemId.value = '999999';
assert.doesNotThrow(() => {
    global.saveQuickStockAdjustment();
}, 'Should not throw when item missing');
assert.doesNotThrow(() => {
    global.toggleStockUnlimited();
}, 'Should not throw when item missing');
console.log('  ✅ PASS: Graceful exit when item ID cannot be resolved.');

console.log('\n✅ ALL QUICK STOCK ADJUSTMENT FIX TESTS PASSED 100%!');
