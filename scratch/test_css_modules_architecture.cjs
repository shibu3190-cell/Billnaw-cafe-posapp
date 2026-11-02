// scratch/test_css_modules_architecture.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CSS_MODULES, bundleStylesheets } = require('../scripts/bundle-css.cjs');

console.log('====================================================');
console.log('🎨 CSS MODULAR ARCHITECTURE & DOMAIN SUITE AUDIT');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failCount++;
  }
}

const rootDir = path.resolve(__dirname, '..');
const cssDir = path.join(rootDir, 'css');

// 1. Module existence and non-empty checks
test('CSS-01: All 9 domain modules exist in css/ directory', () => {
  assert.strictEqual(CSS_MODULES.length, 9, 'Must define exactly 9 domain modules');
  CSS_MODULES.forEach(mod => {
    const modPath = path.join(cssDir, mod);
    assert.ok(fs.existsSync(modPath), `Module css/${mod} must exist`);
    const stat = fs.statSync(modPath);
    assert.ok(stat.size > 100, `Module css/${mod} must not be empty`);
  });
});

// 2. Balanced braces in all domain modules
test('CSS-02: Every domain module has 100% balanced braces', () => {
  CSS_MODULES.forEach(mod => {
    const content = fs.readFileSync(path.join(cssDir, mod), 'utf8');
    let depth = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      assert.ok(depth >= 0, `Extra closing brace in css/${mod} at index ${i}`);
    }
    assert.strictEqual(depth, 0, `Unclosed brace in css/${mod}`);
  });
});

// 3. Bundler execution compiles style.css
test('CSS-03: scripts/bundle-css.cjs compiles style.css successfully', () => {
  const generatedPath = bundleStylesheets();
  assert.ok(fs.existsSync(generatedPath), 'style.css must exist after bundling');
  const content = fs.readFileSync(generatedPath, 'utf8');
  assert.ok(content.length > 50000, 'Bundled style.css must be substantial');
  assert.ok(content.includes('BILLNAW POS — CONSOLIDATED PRODUCTION STYLESHEET'));
});

// 4. Critical UI invariants & classes are intact
test('CSS-04: Critical UI tokens and invariants present in bundled stylesheet', () => {
  const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
  assert.ok(css.includes('#143832'), 'Must include primary dark emerald #143832');
  assert.ok(css.includes('.modal-close-btn'), 'Must include .modal-close-btn');
  assert.ok(css.includes('.loss-aversion-banner'), 'Must include .loss-aversion-banner');
  assert.ok(css.includes('.gst-pct-pill'), 'Must include .gst-pct-pill');
  assert.ok(css.includes('.action-dropdown'), 'Must include .action-dropdown');
  assert.ok(css.includes('.inv-row-master'), 'Must include .inv-row-master');
  assert.ok(css.includes('.fim-preview-container'), 'Must include .fim-preview-container');
  assert.ok(css.includes('@media screen and (max-width: 640px)'), 'Must include mobile media query');
});

// 5. Invariant: 26 modal close button SVGs in index.html
test('CSS-05: Invariant 26 modal close button SVGs preserved in index.html', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const count = (html.match(/class="modal-close-btn"/g) || []).length;
  assert.strictEqual(count, 26, `Expected exactly 26 modal-close-btn instances, found ${count}`);
});

console.log('\n====================================================');
console.log(`🎯 TOTAL SUITE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
