const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🔍 INDEPENDENT REVIEWER GATE AUDIT SCRIPT');
console.log('====================================================\n');

let findings = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    findings.push({ name, error: err.message });
  }
}

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const settingsJsPath = path.join(__dirname, '..', 'js', 'settings.js');
const settingsJs = fs.readFileSync(settingsJsPath, 'utf8');

const posCssPath = path.join(__dirname, '..', 'css', 'pos.css');
const posCss = fs.readFileSync(posCssPath, 'utf8');

const styleCssPath = path.join(__dirname, '..', 'style.css');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

console.log('📍 AUDIT 1: index.html REMOVAL COMPLETENESS & INVARIANTS');

check('index.html: Completely absent <div id="tables" class="view">', () => {
  const hasTablesView = /<div\b[^>]*\bid=["']tables["'][^>]*\bclass=["'][^"']*view[^"']*["']/i.test(html) ||
                        /<div\b[^>]*\bclass=["'][^"']*view[^"']*["'][^>]*\bid=["']tables["']/i.test(html);
  assert.strictEqual(hasTablesView, false, 'Found lingering <div id="tables" class="view">');
});

check('index.html: No element with id="tables"', () => {
  const match = html.match(/id=["']tables["']/i);
  assert.strictEqual(match, null, 'Found element with id="tables"');
});

check('index.html: Completely absent "Dine-In Tables" More Hub card', () => {
  const moreHubIdx = html.indexOf('id="moreHubModal"');
  assert.ok(moreHubIdx !== -1, 'moreHubModal not found');
  const toastIdx = html.indexOf('id="toast-container"', moreHubIdx);
  assert.ok(toastIdx !== -1, 'toast-container not found');
  const moreHubContent = html.substring(moreHubIdx, toastIdx);
  
  assert.strictEqual(moreHubContent.includes('Dine-In Tables'), false, 'Found "Dine-In Tables" card inside moreHubModal');
  assert.strictEqual(moreHubContent.includes('switchTab(\'tables\')'), false, 'Found switchTab(\'tables\') in moreHubModal');
  assert.strictEqual(moreHubContent.includes('switchTab("tables")'), false, 'Found switchTab("tables") in moreHubModal');
});

check('index.html: More Hub has exactly 4 cards', () => {
  const moreHubIdx = html.indexOf('id="moreHubModal"');
  assert.ok(moreHubIdx !== -1, 'moreHubModal not found');
  const toastIdx = html.indexOf('id="toast-container"', moreHubIdx);
  assert.ok(toastIdx !== -1, 'toast-container not found');
  const moreHubContent = html.substring(moreHubIdx, toastIdx);
  const cardMatches = moreHubContent.match(/class=["'][^"']*more-hub-card[^"']*["']/g) || [];
  assert.strictEqual(cardMatches.length, 4, `Expected 4 cards in moreHubModal, found ${cardMatches.length}`);
});

check('index.html: Exactly 26 modal-close-btn SVG elements', () => {
  const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
  assert.strictEqual(svgMatches.length, 26, `Expected exactly 26 modal-close-btn SVGs, found ${svgMatches.length}`);
});

check('index.html: #tablesWrapper is intact inside #pos view', () => {
  const posIdx = html.indexOf('id="pos"');
  assert.ok(posIdx !== -1, '#pos view missing');
  const wrapperIdx = html.indexOf('id="tablesWrapper"');
  assert.ok(wrapperIdx !== -1, '#tablesWrapper missing');
  assert.ok(wrapperIdx > posIdx, '#tablesWrapper must be located after #pos view opening');
});

console.log('\n📍 AUDIT 2: js/settings.js ROUTER FALLBACK & MORE HUB');

check('js/settings.js: switchTabDirect contains fallback if (tabId === \'tables\') tabId = \'pos\';', () => {
  assert.ok(
    settingsJs.includes("if (tabId === 'tables') tabId = 'pos';"),
    'Router fallback for tabId === "tables" is missing in js/settings.js'
  );
});

check('js/settings.js: More Hub active button list excludes \'tables\'', () => {
  const moreNavLineMatch = settingsJs.match(/if\s*\(\s*\[([^\]]+)\]\.includes\(tabId\)\)/);
  assert.ok(moreNavLineMatch, 'Could not locate nav-more active list check in settings.js');
  const listContent = moreNavLineMatch[1];
  assert.ok(!listContent.includes('tables'), `'tables' is still present in nav-more active array: [${listContent}]`);
  assert.ok(listContent.includes('customers') && listContent.includes('settings') && listContent.includes('whatsapp'),
    'Expected customers, settings, whatsapp in nav-more active array'
  );
});

check('js/settings.js: No dangling renderTablesFloorUI call on tables tab', () => {
  // Ensure the old block `if (tabId === 'tables') { renderTablesFloorUI(); }` does not exist
  assert.ok(!settingsJs.includes('renderTablesFloorUI'), 'Found unexpected renderTablesFloorUI call in js/settings.js');
});

console.log('\n📍 AUDIT 3: css/pos.css & style.css PRUNING & RECOMPILATION');

check('css/pos.css: .tables-grid-wrap pruned, .kds-grid-wrap preserved', () => {
  assert.ok(!posCss.includes('.tables-grid-wrap'), '.tables-grid-wrap still present in css/pos.css');
  assert.ok(posCss.includes('.kds-grid-wrap'), '.kds-grid-wrap missing from css/pos.css');
});

check('style.css: .tables-grid-wrap pruned, .kds-grid-wrap preserved in bundle', () => {
  assert.ok(!styleCss.includes('.tables-grid-wrap'), '.tables-grid-wrap still present in style.css');
  assert.ok(styleCss.includes('.kds-grid-wrap'), '.kds-grid-wrap missing from style.css');
});

console.log('\n📍 AUDIT 4: SCRIPT PARSING & SYNTAX INTEGRITY');
const jsFiles = ['js/settings.js', 'js/pos.js', 'js/core.js'];
jsFiles.forEach(file => {
  check(`Syntax check: ${file}`, () => {
    const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    new Function(code); // Throws SyntaxError if invalid
  });
});

console.log('\n====================================================');
console.log(`AUDIT RESULT: ${findings.length === 0 ? 'ALL CHECKS PASSED ✅' : `${findings.length} CHECKS FAILED ❌`}`);
console.log('====================================================');

if (findings.length > 0) {
  process.exit(1);
}
