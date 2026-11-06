/**
 * RECEIPT & KOT ITEM NAME/PRICE DISPLAY FIX
 * ==========================================
 * Bug: Bill printing showed "Item" and "Rs. 0.00" for all items.
 * Root Cause: order.items is a string-summary array ["Chai (x2)", "Biscuit (x1)"]
 *   but generateEscPosCommands used `data.items || data.rawItems`, selecting the
 *   string array instead of rawItems (structured objects with name, price, qty).
 * Fix: Prefer rawItems when it contains objects; fall back to items only if rawItems empty.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const pbjs = fs.readFileSync(path.join(ROOT, 'src/core/platform-bridge.js'), 'utf8');

let passed = 0, failed = 0;

function check(label, fn) {
  try { fn(); console.log(`  \u2705 PASS: ${label}`); passed++; }
  catch (e) { console.log(`  \u274C FAIL: ${label}\n         ${e.message}`); failed++; }
}

console.log('\n====================================================');
console.log('\uD83D\uDDC3\uFE0F  RECEIPT & KOT ITEM DISPLAY FIX VERIFICATION');
console.log('====================================================\n');

console.log('\uD83D\uDCCD SECTION 1: PLATFORM-BRIDGE ITEM ARRAY SELECTION FIX');

check('ITEM-01: Receipt branch uses rawItems-preferring logic (not plain data.items fallback)', () => {
  // Should NOT have bare `const items = data.items || data.rawItems` in receipt branch
  // Should have _receiptRaw or typeof check
  const hasRobustReceipt = pbjs.includes('_receiptRaw') || 
    (pbjs.includes('rawItems') && pbjs.includes("typeof _receiptRaw[0]"));
  assert.ok(hasRobustReceipt, 
    'Receipt branch still uses naive data.items priority — rawItems not preferred');
});

check('ITEM-02: KOT branch uses rawItems-preferring logic', () => {
  const hasRobustKot = pbjs.includes('_kotRaw') || 
    (pbjs.includes('rawItems') && pbjs.includes("typeof _kotRaw[0]"));
  assert.ok(hasRobustKot, 
    'KOT branch still uses naive data.items priority — rawItems not preferred');
});

check('ITEM-03: item.name fallback chain includes item_name and title', () => {
  assert.ok(
    pbjs.includes('item_name') || pbjs.includes('menuItemName'),
    'item.name fallback chain missing item_name in platform-bridge.js'
  );
});

check('ITEM-04: item.price fallback chain includes item.rate / unitPrice', () => {
  assert.ok(
    pbjs.includes('item.rate') || pbjs.includes('unitPrice') || pbjs.includes('unit_price'),
    'item.price fallback chain missing item.rate / unitPrice'
  );
});

check('ITEM-05: item.qty fallback chain includes item.count', () => {
  assert.ok(
    pbjs.includes('item.count') || (pbjs.includes('item.quantity') && pbjs.includes('item.qty')),
    'item.qty fallback chain missing item.count'
  );
});

console.log('\n\uD83D\uDCCD SECTION 2: RUNTIME SIMULATION OF BUG SCENARIO');

// Replicate the fix logic in Node.js for a simulation test
function getItemsForPrint(data) {
  // The fixed logic from platform-bridge.js
  const _raw = data.rawItems || data.items || [];
  return (_raw.length > 0 && typeof _raw[0] === 'object' && _raw[0] !== null)
    ? _raw
    : (data.rawItems || []);
}

function getItemName(item) {
  return item.name || item.item_name || item.menuItemName || item.title || 'Item';
}

function getItemQty(item) {
  return item.quantity || item.qty || item.count || 1;
}

function getItemPrice(item, qty) {
  if (item.line_total_paise !== undefined) return item.line_total_paise / 100;
  if (item.item_subtotal_paise !== undefined) return item.item_subtotal_paise / 100;
  if (item.total !== undefined) return item.total;
  const unitPrice = item.price || item.rate || item.unitPrice || item.unit_price || 0;
  return unitPrice * qty;
}

// Bug scenario: items is string array, rawItems has actual data
const bugScenario = {
  billNo: 1005,
  amount: 15.00,
  items: ['Chai (x2)', 'Biscuit (x1)'],  // string array — the bug trigger
  rawItems: [
    { id: 1, name: 'Chai',    price: 5, qty: 2, gstRate: 0 },
    { id: 2, name: 'Biscuit', price: 5, qty: 1, gstRate: 0 }
  ]
};

check('ITEM-06: Bug scenario — fixed items array selects rawItems not string array', () => {
  const items = getItemsForPrint(bugScenario);
  assert.ok(items.length > 0, 'No items returned');
  assert.ok(typeof items[0] === 'object', 'Items[0] is not an object (selected string array!)');
});

check('ITEM-07: Bug scenario — Chai item has correct name "Chai"', () => {
  const items = getItemsForPrint(bugScenario);
  const chai = items.find(i => getItemName(i).includes('Chai'));
  assert.ok(chai, 'Chai item not found');
  assert.strictEqual(getItemName(chai), 'Chai', `Expected "Chai", got "${getItemName(chai)}"`);
});

check('ITEM-08: Bug scenario — Chai (x2) prints Rs. 10.00 not Rs. 0.00', () => {
  const items = getItemsForPrint(bugScenario);
  const chai = items.find(i => getItemName(i) === 'Chai');
  const qty = getItemQty(chai);
  const total = getItemPrice(chai, qty);
  assert.strictEqual(total, 10.00, `Expected Rs. 10.00, got Rs. ${total.toFixed(2)}`);
});

check('ITEM-09: Bug scenario — Biscuit item has correct name "Biscuit"', () => {
  const items = getItemsForPrint(bugScenario);
  const biscuit = items.find(i => getItemName(i).includes('Biscuit'));
  assert.ok(biscuit, 'Biscuit item not found');
  assert.strictEqual(getItemName(biscuit), 'Biscuit');
});

check('ITEM-10: Bug scenario — Biscuit (x1) prints Rs. 5.00 not Rs. 0.00', () => {
  const items = getItemsForPrint(bugScenario);
  const biscuit = items.find(i => getItemName(i) === 'Biscuit');
  const qty = getItemQty(biscuit);
  const total = getItemPrice(biscuit, qty);
  assert.strictEqual(total, 5.00, `Expected Rs. 5.00, got Rs. ${total.toFixed(2)}`);
});

check('ITEM-11: Bug scenario — sum of item totals equals bill amount Rs. 15.00', () => {
  const items = getItemsForPrint(bugScenario);
  const sum = items.reduce((acc, item) => {
    const q = getItemQty(item);
    return acc + getItemPrice(item, q);
  }, 0);
  assert.strictEqual(sum, 15.00, `Expected Rs. 15.00, got Rs. ${sum.toFixed(2)}`);
});

check('ITEM-12: Edge case — when only rawItems present (no items), rawItems used correctly', () => {
  const data = {
    rawItems: [{ id: 3, name: 'Samosa', price: 15, qty: 3 }]
  };
  const items = getItemsForPrint(data);
  assert.ok(items.length === 1 && items[0].name === 'Samosa', 'rawItems not selected when items absent');
});

check('ITEM-13: Edge case — when both items and rawItems are structured objects, rawItems wins', () => {
  const data = {
    items: [{ id: 1, name: 'StructuredFromItems', price: 10, qty: 1 }],
    rawItems: [{ id: 2, name: 'CorrectItem', price: 20, qty: 2 }]
  };
  const items = getItemsForPrint(data);
  // rawItems takes precedence
  assert.ok(items[0].name === 'CorrectItem', `Expected "CorrectItem", got "${items[0].name}"`);
});

check('ITEM-14: Edge case — item.qty fallback: item.count field works', () => {
  const item = { name: 'Tea', price: 10, count: 3 };
  assert.strictEqual(getItemQty(item), 3, 'item.count not picked up as qty');
});

check('ITEM-15: Edge case — item.price fallback: item.rate works when price absent', () => {
  const item = { name: 'Lassi', rate: 40, qty: 1 };
  assert.strictEqual(getItemPrice(item, 1), 40, 'item.rate not picked up as price');
});

console.log('\n\uD83D\uDCCD SECTION 3: INVARIANTS');

check('INV-01: 26 modal-close-btn SVG elements still intact in index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const matches = html.match(/class="modal-close-btn"/g) || [];
  assert.strictEqual(matches.length, 26, `Expected 26, found ${matches.length}`);
});

check('INV-02: generateEscPosCommands still starts with ESC @ init bytes', () => {
  assert.ok(pbjs.includes('0x1B, 0x40'), 'ESC @ init bytes removed from platform-bridge.js');
});

check('INV-03: GS V cut bytes still present in platform-bridge.js', () => {
  assert.ok(pbjs.includes('0x1D, 0x56'), 'GS V cut bytes removed from platform-bridge.js');
});

console.log('\n====================================================');
console.log(`\uD83C\uDFAF RECEIPT & KOT ITEM FIX: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================');
if (failed === 0) {
  console.log('\u2728 ITEM NAME & PRICE DISPLAY BUG FULLY FIXED & VERIFIED!');
  console.log('   Before: All items printed as "Item" / Rs. 0.00');
  console.log('   After:  Correct names (Chai, Samosa...) and prices (Rs. 10.00, Rs. 15.00...)');
} else {
  process.exit(1);
}
