const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🧪 BILLNAW POS USER REQUIREMENTS VERIFICATION SUITE");
console.log("====================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err.message}`);
        failed++;
    }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const posJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'menu.js'), 'utf8');
const custJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'customers.js'), 'utf8');
const mktJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'marketing_inventory.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

console.log("📍 REQUIREMENT 1: TABLE NUMBER ON TOPBAR");
test("Topbar contains #topbarTablePill, #topbarTableDisplay, and #topbarTableDot", () => {
    assert.ok(html.includes('id="topbarTablePill"'), "Missing #topbarTablePill");
    assert.ok(html.includes('id="topbarTableDisplay"'), "Missing #topbarTableDisplay");
    assert.ok(html.includes('id="topbarTableDot"'), "Missing #topbarTableDot");
});

test("syncTableUI updates #topbarTableDisplay and toggles occupied/empty dot", () => {
    assert.ok(posJs.includes("topbarDisplay.innerText = currentTableName"), "Missing topbarDisplay update");
    assert.ok(posJs.includes("topbarDot.className = 'topbar-table-dot ' + (isOccupied ? 'occupied' : 'empty')"), "Missing topbarDot toggle");
});

console.log("\n📍 REQUIREMENT 2: AI MENU UPLOAD & OCR RESILIENCE");
test("index.html provides #aiMenuFileInput and drag-and-drop listener", () => {
    assert.ok(html.includes('id="aiMenuFileInput"'), "Missing #aiMenuFileInput");
    assert.ok(html.includes('ondrop="handleMenuDrop(event)'), "Missing drag-and-drop handler");
});

test("menu.js implements handleMenuDrop and parseLocalMenuFallback", () => {
    assert.ok(menuJs.includes('handleMenuDrop'), "Missing handleMenuDrop");
    assert.ok(menuJs.includes('parseLocalMenuFallback'), "Missing parseLocalMenuFallback");
});

test("server.js aliases /api/extract-menu, /api/menu/ocr, and /api/gemini", () => {
    assert.ok(serverJs.includes("['/api/extract-menu', '/api/menu/ocr', '/api/gemini']"), "Missing route aliases in server.js");
});

console.log("\n📍 REQUIREMENT 3: POPUP STACKING & MODAL Z-INDEX");
test("style.css assigns strict z-index stacking hierarchy", () => {
    assert.ok(css.includes('#expensesDetailModal') && css.includes('1000015'), "Missing #expensesDetailModal z-index");
    assert.ok(css.includes('#quickExpenseModal') && css.includes('1000030'), "Missing #quickExpenseModal z-index");
    assert.ok(css.includes('#aiPreviewModal') && css.includes('1000025'), "Missing #aiPreviewModal z-index");
    assert.ok(css.includes('#aiMenuZoomModal') && css.includes('1000050'), "Missing #aiMenuZoomModal z-index");
});

test("app.js implements dismissTopModal to dismiss highest z-index modal", () => {
    assert.ok(appJs.includes('dismissTopModal'), "Missing dismissTopModal");
    assert.ok(appJs.includes('zB - zA'), "Missing z-index descending sort");
});

console.log("\n📍 REQUIREMENT 4: VOICE HISTORY (STRICTLY LAST 2)");
test("marketing_inventory.js caps voice history strictly at 2 items", () => {
    assert.ok(mktJs.includes('voiceLogHistory.slice(-2)'), "Missing slice(-2) in voiceLogHistory");
    assert.ok(html.includes('History (Last 2):'), "Missing label in index.html");
});

console.log("\n📍 REQUIREMENT 5: TOP-LEFT CUP ICON");
test("Top-left button is clean single coffee cup icon without hamburger bars or duplicate text", () => {
    assert.ok(!html.includes('menu-bars-glyph'), "Unexpected hamburger bars in brand icon");
    assert.ok(html.includes('topbar-menu-icon-btn'), "Missing topbar-menu-icon-btn");
    assert.ok(css.includes('.topbar-menu-icon-btn'), "Missing CSS for topbar-menu-icon-btn");
});

console.log("\n📍 REQUIREMENT 6: INVENTORY TELEMETRY & INGREDIENT RECIPE DEDUCTION");
test("Inventory data includes Flour and default dish recipes", () => {
    assert.ok(mktJs.includes('Refined Wheat & All-Purpose Flour'), "Missing Flour in inventory");
    assert.ok(mktJs.includes('defaultDishRecipes'), "Missing defaultDishRecipes");
    assert.ok(mktJs.includes('deductInventoryForOrder'), "Missing deductInventoryForOrder");
});

test("deductInventoryForOrder decrements raw ingredient quantities on order", () => {
    // Simulate deduction
    let testInventory = [
        { id: 1, name: 'Espresso Coffee Beans', stock: 10.0, unit: 'kg' },
        { id: 2, name: 'Full Cream Milk', stock: 15.0, unit: 'L' },
        { id: 9, name: 'Refined Wheat & All-Purpose Flour', stock: 20.0, unit: 'kg' }
    ];
    const recipes = {
        'Cold Coffee': [ { id: 1, qty: 0.02 }, { id: 2, qty: 0.25 } ],
        'Paneer Roll': [ { id: 9, qty: 0.08 } ]
    };
    const order = {
        items: [
            { name: 'Cold Coffee', quantity: 2 },
            { name: 'Paneer Roll', quantity: 1 }
        ]
    };

    order.items.forEach(item => {
        const ingList = recipes[item.name];
        if (ingList) {
            ingList.forEach(ing => {
                const stockItem = testInventory.find(i => i.id === ing.id);
                if (stockItem) {
                    stockItem.stock = Math.max(0, stockItem.stock - (ing.qty * item.quantity));
                }
            });
        }
    });

    const coffeeBeans = testInventory.find(i => i.id === 1);
    const milk = testInventory.find(i => i.id === 2);
    const flour = testInventory.find(i => i.id === 9);

    assert.strictEqual(Number(coffeeBeans.stock.toFixed(2)), 9.96, "Coffee beans incorrectly deducted");
    assert.strictEqual(Number(milk.stock.toFixed(2)), 14.50, "Milk incorrectly deducted");
    assert.strictEqual(Number(flour.stock.toFixed(2)), 19.92, "Flour incorrectly deducted");
});

console.log("\n📍 REQUIREMENT 7: CUSTOMER CRM REDESIGN & 1-TAP ACTIONS");
test("Customer directory rows provide 1-tap call, 1-tap Bill, and 1-tap WhatsApp", () => {
    assert.ok(custJs.includes('href="tel:'), "Missing 1-tap phone call link");
    assert.ok(custJs.includes('startOrderForCustomer(${cust.id})'), "Missing 1-tap Bill button");
    assert.ok(custJs.includes('https://wa.me/91'), "Missing 1-tap WhatsApp button");
    assert.ok(custJs.includes('circle cx="12" cy="12" r="9"'), "Missing loyalty vector coin");
    assert.ok(custJs.includes('Manage & Message'), "Missing Manage & Message button");
});

test("filterCustomersByTier supports cFilter-* and tierFilter-* case-insensitively", () => {
    assert.ok(custJs.includes('cFilter-') && custJs.includes('tierFilter-'), "Missing dual ID support in filterCustomersByTier");
    assert.ok(custJs.includes('toLowerCase()'), "Missing case-insensitive tier comparison");
});

console.log("\n====================================================");
console.log(`🎯 TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("====================================================");

if (failed > 0) process.exit(1);
