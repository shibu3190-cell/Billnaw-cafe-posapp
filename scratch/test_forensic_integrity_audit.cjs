/**
 * scratch/test_forensic_integrity_audit.cjs
 * Forensic verification script run by auditor_final_m3_1
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
const html = fs.readFileSync(indexHtmlPath, 'utf8');

console.log('=== FORENSIC CHECK 1: INDEX.HTML REMOVALS ===');
const hasTablesId = /id=["']tables["']/.test(html);
const hasTablesDiv = /<div[^>]*id=["']tables["']/.test(html);
const hasTablesGridContainer = /tablesGridContainer/.test(html);
const hasTablesGridWrap = /tables-grid-wrap/.test(html);

console.log('hasTablesId:', hasTablesId);
console.log('hasTablesDiv:', hasTablesDiv);
console.log('hasTablesGridContainer:', hasTablesGridContainer);
console.log('hasTablesGridWrap:', hasTablesGridWrap);

assert.strictEqual(hasTablesId, false, 'Obsolete id="tables" MUST be completely absent from index.html');
assert.strictEqual(hasTablesDiv, false, 'Obsolete <div id="tables"> MUST be completely absent from index.html');
assert.strictEqual(hasTablesGridContainer, false, 'tablesGridContainer MUST be completely absent from index.html');

console.log('=== FORENSIC CHECK 2: MORE HUB STRUCTURE & TRIGGER REMOVAL ===');
const moreHubStart = html.indexOf('id="moreHubModal"');
const moreHubEnd = html.indexOf('id="toast-container"');
assert.ok(moreHubStart !== -1 && moreHubEnd !== -1, 'moreHubModal and toast-container must exist');
const moreHubContent = html.substring(moreHubStart, moreHubEnd);

const moreHubCards = (moreHubContent.match(/class=["'][^"']*more-hub-card[^"']*["']/g) || []).length;
console.log('More Hub Card Count:', moreHubCards);
const moreHubHasDineInTables = /Dine-In Tables/i.test(moreHubContent);
const moreHubHasTablesSwitchTab = /switchTab\(["']tables["']\)/.test(moreHubContent);
console.log('moreHubHasDineInTables:', moreHubHasDineInTables);
console.log('moreHubHasTablesSwitchTab:', moreHubHasTablesSwitchTab);

assert.strictEqual(moreHubCards, 4, 'More Hub must have exactly 4 operational cards');
assert.strictEqual(moreHubHasDineInTables, false, 'More Hub must NOT contain "Dine-In Tables" card');
assert.strictEqual(moreHubHasTablesSwitchTab, false, 'More Hub must not contain switchTab("tables") triggers');

console.log('=== FORENSIC CHECK 3: POS TABLES WRAPPER INTEGRITY ===');
const hasTablesWrapper = /id=["']tablesWrapper["']/.test(html);
const hasPosFloorSelector = /id=["']posFloorSelector["']/.test(html);
const hasTableGridUI = /id=["']tableGridUI["']/.test(html);
const hasPosActiveTableBadge = /id=["']posActiveTableBadge["']/.test(html);

console.log('hasTablesWrapper:', hasTablesWrapper);
console.log('hasPosFloorSelector:', hasPosFloorSelector);
console.log('hasTableGridUI:', hasTableGridUI);
console.log('hasPosActiveTableBadge:', hasPosActiveTableBadge);

assert.strictEqual(hasTablesWrapper, true, '#tablesWrapper must be present');
assert.strictEqual(hasPosFloorSelector, true, '#posFloorSelector must be present');
assert.strictEqual(hasTableGridUI, true, '#tableGridUI must be present');
assert.strictEqual(hasPosActiveTableBadge, true, '#posActiveTableBadge must be present');

console.log('=== FORENSIC CHECK 4: CSS HIDING PATTERNS ===');
const cssPosPath = path.join(ROOT_DIR, 'css', 'pos.css');
const cssPos = fs.readFileSync(cssPosPath, 'utf8');
const styleCssPath = path.join(ROOT_DIR, 'style.css');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

const tablesDisplayNoneCss = /#tables\s*\{[^}]*display\s*:\s*none/i.test(cssPos) || /#tables\s*\{[^}]*display\s*:\s*none/i.test(styleCss);
const tablesGridWrapDisplayNone = /\.tables-grid-wrap\s*\{[^}]*display\s*:\s*none/i.test(cssPos) || /\.tables-grid-wrap\s*\{[^}]*display\s*:\s*none/i.test(styleCss);

console.log('tablesDisplayNoneCss:', tablesDisplayNoneCss);
console.log('tablesGridWrapDisplayNone:', tablesGridWrapDisplayNone);
assert.strictEqual(tablesDisplayNoneCss, false, 'No CSS display:none tricks on #tables');
assert.strictEqual(tablesGridWrapDisplayNone, false, 'No CSS display:none tricks on .tables-grid-wrap');

console.log('\nAll Index & CSS Forensic Checks Passed Cleanly!');
