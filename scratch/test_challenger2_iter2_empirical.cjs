// scratch/test_challenger2_iter2_empirical.cjs
// Empirical verification harness for Milestone 1 Iteration 2 (Syntax Remediation)

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

console.log("==============================================================================");
console.log("🛡️ EMPIRICAL CHALLENGER 2: ITERATION 2 VERIFICATION & STRESS HARNESS");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;

function check(title, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${title}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${title}`);
        console.error(`     Error: ${e.message}`);
        failed++;
    }
}

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const customersJs = fs.readFileSync(path.join(rootDir, 'js', 'customers.js'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');

// 1. Syntax check validation
check("CH-01: node --check js/menu.js completes with code 0 (SyntaxError resolved)", () => {
    const res = execSync('node --check js/menu.js', { cwd: rootDir, stdio: 'pipe' });
    assert.strictEqual(res.toString(), '');
});

check("CH-02: node --check js/customers.js completes with code 0 (No duplicate declaration)", () => {
    const res = execSync('node --check js/customers.js', { cwd: rootDir, stdio: 'pipe' });
    assert.strictEqual(res.toString(), '');
});

check("CH-03: node --check core application modules all pass cleanly", () => {
    const files = [
        'app.js',
        'server.js',
        'js/core.js',
        'js/culinary_inventory.js',
        'js/dashboard.js',
        'js/marketing_inventory.js',
        'js/settings.js',
        'js/pos.js',
        'js/staff.js'
    ];
    for (const f of files) {
        execSync(`node --check ${f}`, { cwd: rootDir, stdio: 'pipe' });
    }
});

// 2. Exact Function Declaration Count and AST Scope Check
check("CH-04: quickAddNewCustomerFromCheckout is declared exactly once across entire codebase", () => {
    const regex = /function\s+quickAddNewCustomerFromCheckout\b/g;
    const menuMatches = menuJs.match(regex) || [];
    const custMatches = customersJs.match(regex) || [];
    const appMatches = appJs.match(regex) || [];
    const coreMatches = coreJs.match(regex) || [];
    
    assert.strictEqual(menuMatches.length, 0, "quickAddNewCustomerFromCheckout found in menu.js");
    assert.strictEqual(custMatches.length, 1, `Expected exactly 1 declaration in customers.js, found ${custMatches.length}`);
    assert.strictEqual(appMatches.length, 0, "quickAddNewCustomerFromCheckout found in app.js");
    assert.strictEqual(coreMatches.length, 0, "quickAddNewCustomerFromCheckout found in core.js");
});

// 3. Verify function implementation logic in js/customers.js
check("CH-05: quickAddNewCustomerFromCheckout handles phone digits vs name strings properly", () => {
    assert.ok(customersJs.includes("openAddCustomerModal()"), "quickAddNewCustomerFromCheckout must call openAddCustomerModal");
    assert.ok(customersJs.includes("custPhoneInput"), "Must populate custPhoneInput for numeric input");
    assert.ok(customersJs.includes("custNameInput"), "Must populate custNameInput for text input");
    assert.ok(customersJs.includes("/^\\d+$/"), "Must use digits regex to distinguish phone numbers");
});

// 4. Verify renderMenuCatalogUI block structure and top-level export
check("CH-06: renderMenuCatalogUI block is properly closed before toggleMenuItemDropdown", () => {
    // Find index of renderMenuCatalogUI and toggleMenuItemDropdown
    const renderIdx = menuJs.indexOf("function renderMenuCatalogUI()");
    const exportIdx = menuJs.indexOf("window.renderMenuCatalogUI = renderMenuCatalogUI;", renderIdx);
    const toggleIdx = menuJs.indexOf("function toggleMenuItemDropdown(", exportIdx);

    assert.ok(renderIdx !== -1, "renderMenuCatalogUI function missing");
    assert.ok(exportIdx !== -1, "window.renderMenuCatalogUI export missing");
    assert.ok(toggleIdx !== -1, "toggleMenuItemDropdown function missing");
    assert.ok(exportIdx < toggleIdx, "renderMenuCatalogUI export must precede toggleMenuItemDropdown");

    // Slice between renderIdx and exportIdx and balance braces
    const funcBody = menuJs.substring(renderIdx, exportIdx);
    let openCount = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < funcBody.length; i++) {
        const c = funcBody[i];
        if (inString) {
            if (c === stringChar && funcBody[i - 1] !== '\\') {
                inString = false;
            }
        } else {
            if (c === "'" || c === '"' || c === '`') {
                inString = true;
                stringChar = c;
            } else if (c === '{') {
                openCount++;
            } else if (c === '}') {
                openCount--;
            }
        }
    }
    assert.strictEqual(openCount, 0, `Braces must be perfectly balanced in renderMenuCatalogUI, net delta is ${openCount}`);
});

// 5. Invariant: Strictly 26 SVG modal close buttons in index.html
check("CH-07: Invariant: Strictly 26 SVG modal close buttons in index.html", () => {
    const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = [...html.matchAll(reg)];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${matches.length}`);
});

check("CH-08: Invariant: Modal-close-btn class total matches in index.html is exactly 26", () => {
    const classReg = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g;
    const matches = [...html.matchAll(classReg)];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 occurrences of modal-close-btn, found ${matches.length}`);
});

check("CH-09: Invariant: Zero raw unicode '✕' or 'X' in modal close buttons", () => {
    const allBtns = [...html.matchAll(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi)];
    for (const b of allBtns) {
        assert.ok(!/[✕✖×]/.test(b[0]), `Raw cross character found in modal close button: ${b[0]}`);
    }
});

// 6. Test Suite execution
check("CH-10: Consolidated hub test suite execution succeeds with 100/100 passes", () => {
    const res = execSync('node scratch/test_consolidated_hub_suite.cjs', { cwd: rootDir, stdio: 'pipe' }).toString();
    assert.ok(res.includes("100 / 100 PASSED (0 FAILED)"), "Consolidated hub suite did not report 100 / 100 PASSED");
});

console.log("\n==============================================================================");
console.log(`TOTAL EMPIRICAL CHALLENGER 2 CHECKS: ${passed} PASSED, ${failed} FAILED`);
console.log("==============================================================================");

if (failed > 0) {
    process.exit(1);
}
