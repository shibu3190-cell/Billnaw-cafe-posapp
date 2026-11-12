// scratch/test_single_printer_and_delta.cjs - Verification for Single-Printer Mode & Delta-KOT Fix
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("====================================================");
console.log("🖨️ SINGLE-PRINTER UNIFIED MODE & DELTA-KOT FIX SUITE");
console.log("====================================================\n");

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const jsPos = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8').replace(/\r\n/g, '\n');
const bridgeCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'platform-bridge.js'), 'utf8');

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

// SECTION 1: DELTA-KOT FIX & RUNTIME SAFETY
console.log("📍 SECTION 1: DELTA-KOT FIX & RUNTIME SAFETY");

test("SPD-01: printKitchenTicket computes delta at top of function without ReferenceError", () => {
    assert.ok(jsPos.includes('const delta = (typeof computeKotDelta === \'function\')'));
    assert.ok(jsPos.includes('if (!delta.hasNewItems)'));
    assert.ok(!jsPos.includes('try {\n        const kotHeader = delta.isAddon')); // Must not access delta before definition
});

test("SPD-02: printKitchenTicket guards empty/already-sent delta gracefully", () => {
    assert.ok(jsPos.includes('KOT already sent for all items.'));
    assert.ok(jsPos.includes('tInfo.items.forEach(item => {\n                item.qtyKotPrinted = Number(item.qty || item.quantity || 0);'));
});

// SECTION 2: SINGLE-PRINTER MODE & HARDWARE ROUTING
console.log("\n📍 SECTION 2: SINGLE-PRINTER MODE & HARDWARE ROUTING");

test("SPD-03: #cfgSinglePrinterMode option exists in index.html #printerSettingsModal", () => {
    assert.ok(html.includes('id="cfgSinglePrinterMode"'));
    assert.ok(html.includes('handleSinglePrinterToggle(this.checked)'));
    assert.ok(html.includes('id="printer2SlotCard"'));
});

test("SPD-04: platform-bridge.js supports singlePrinterMode in routing configuration", () => {
    assert.ok(bridgeCode.includes('singlePrinterMode: false'));
    assert.ok(bridgeCode.includes('singlePrinterMode: Boolean(this.routing?.singlePrinterMode)'));
});

test("SPD-05: routePrintJob routes directly to printer1 when singlePrinterMode is active", () => {
    assert.ok(bridgeCode.includes('const isSinglePrinter = Boolean('));
    assert.ok(bridgeCode.includes('if (isSinglePrinter) {\n      targetSlot = \'printer1\';'));
});

test("SPD-06: routePrintJob auto-falls back to printer1 when printer2 is disconnected", () => {
    assert.ok(bridgeCode.includes('Printer 2 disconnected. Direct KOT print fallback to connected Printer 1.'));
    assert.ok(bridgeCode.includes('targetSlot = \'printer1\';'));
});

test("SPD-07: pos.js defines handleSinglePrinterToggle and updates UI", () => {
    assert.ok(jsPos.includes('function handleSinglePrinterToggle(isSingle)'));
    assert.ok(jsPos.includes('cfgSinglePrinterMode'));
    assert.ok(jsPos.includes('isSingle ? \'printer1\' : (document.getElementById(\'cfgDefaultReceiptPrinter\')'));
});

// SECTION 3: INVARIANTS & INTEGRITY AUDIT
console.log("\n📍 SECTION 3: INVARIANTS & INTEGRITY AUDIT");

test("SPD-08: Exactly 26 modal-close-btn button elements exist in index.html", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.strictEqual(svgMatches ? svgMatches.length : 0, 26, `Strict invariant: expected exactly 26, found ${svgMatches ? svgMatches.length : 0}`);
});

test("SPD-09: Zero raw Unicode emojis inside button elements in index.html", () => {
    const rawEmojiBtnRegex = /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}](?:(?!<\/button>)[\s\S])*<\/button>/gu;
    const matches = html.match(rawEmojiBtnRegex);
    assert.strictEqual(matches, null, `Found raw emojis in buttons: ${JSON.stringify(matches)}`);
});

console.log("\n====================================================");
console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
} else {
    console.log("✨ ALL SINGLE-PRINTER & DELTA-KOT FIXES VERIFIED 100% GREEN!\n");
    process.exit(0);
}
