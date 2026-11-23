// scratch/test_phase1_performance.cjs
// Verification Suite for Phase 1 Performance Quick Wins:
// 1. Service Worker: True SWR + exact ?v= immutable cache hit + gentle batched precache + HTML fast fallback
// 2. sw-register.js: Prevents first-visit double reload via hadController guard
// 3. netlify.toml: Smart Cache-Control headers for /js/*, /src/*, /style.css, /app.js
// 4. index.html: Deferred scripts & non-render-blocking Google Fonts
// 5. css/responsive.css & style.css: Mobile/touch GPU backdrop-filter relief, content-visibility, touch-action
// 6. js/core.js: Active-tab gating in updateAllUI, dirty-domain filtering, rAF coalescing, and skip unchanged localStorage writes

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('⚡ PHASE 1 PERFORMANCE OPTIMIZATION VERIFICATION');
console.log('====================================================\n');

const swJs = read('service-worker.js');
const pubSwJs = read('public/sw.js');
const swRegJs = read('js/sw-register.js');
const netlifyToml = read('netlify.toml');
const indexHtml = read('index.html');
const respCss = read('css/responsive.css');
const styleCss = read('style.css');
const coreJs = read('js/core.js');
const settingsJs = read('js/settings.js');

// 1. Service Worker & Caching
test('PERF-SW-01: service-worker.js bumped to v4.1.0+, batched precache, and synced with public/sw.js', () => {
  assert.ok(swJs.includes("CACHE_VERSION = 'billnaw-pos-shell-v4.1.0'"), 'Missing v4.1.0 cache version');
  assert.ok(swJs.includes('precacheInBatches'), 'Missing batched precaching helper');
  assert.strictEqual(swJs, pubSwJs, 'public/sw.js must stay synced with service-worker.js');
});

test('PERF-SW-02: service-worker.js serves cached versioned JS/CSS immediately without waiting on network', () => {
  assert.ok(swJs.includes('isVersionedScriptOrStyle'), 'Missing versioned asset detection');
  assert.ok(swJs.includes('if (isCodeAsset && isVersionedScriptOrStyle && cachedResponse)'), 'Missing fast-path immutable cache hit');
  assert.ok(swJs.includes('if (isCodeAsset)'), 'Preserves isCodeAsset block');
  assert.ok(swJs.includes('Promise.race([fetchPromise, timeoutFallback])'), 'Missing fast HTML timeout fallback for slow 3G');
});

test('PERF-SW-03: js/sw-register.js prevents redundant double-reload on first visit while still reloading future deploys', () => {
  assert.ok(swRegJs.includes('let hadController = Boolean(navigator.serviceWorker.controller)'), 'hadController must be mutable');
  assert.ok(swRegJs.includes('hadController = Boolean(navigator.serviceWorker.controller);'), 'Must arm hadController after initial claim');
});

test('PERF-CACHE-04: netlify.toml configures stale-while-revalidate for versioned JS/CSS and no-cache for index.html, sw, and unversioned /src/*', () => {
  assert.ok(netlifyToml.includes('for = "/js/*"') && netlifyToml.includes('stale-while-revalidate'), 'Missing /js/* cache header');
  assert.ok(netlifyToml.includes('for = "/style.css"'), 'Missing /style.css cache header');
  assert.ok(netlifyToml.includes('for = "/index.html"') && netlifyToml.includes('no-cache, must-revalidate'), 'Missing index.html no-cache header');
  const srcBlockIdx = netlifyToml.indexOf('for = "/src/*"');
  assert.ok(srcBlockIdx !== -1 && netlifyToml.slice(srcBlockIdx, srcBlockIdx + 120).includes('no-cache, must-revalidate'), '/src/* must revalidate to prevent stale ES module cache');
  assert.ok(swJs.includes("cache: 'no-cache'"), 'SW must bypass HTTP disk cache when refreshing unversioned assets');
  assert.ok(swJs.includes("u.split('?')[0]"), 'SW install must deduplicate versioned vs unversioned paths');
});

// 2. HTML Script Deferral & Non-Blocking Fonts
test('PERF-HTML-05: index.html defers all body app scripts and loads Google Fonts non-blocking', () => {
  assert.ok(indexHtml.includes('media="print" onload="this.media=\'all\'"'), 'Google Fonts must be non-render-blocking');
  const deferredScripts = [
    'js/sw-register.js?v=3001',
    'js/core.js?v=3001',
    'js/pos.js?v=3001',
    'js/menu.js?v=3001',
    'js/customers.js?v=3001',
    'js/dashboard.js?v=3001',
    'js/culinary_inventory.js?v=3001',
    'js/settings.js?v=3001',
    'js/shop-auth.js?v=3001',
    'js/cloud-sync.js?v=3001'
  ];
  for (const s of deferredScripts) {
    assert.ok(indexHtml.includes(`src="${s}" defer`), `Script ${s} must use defer`);
  }
});

// 3. CSS GPU Relief & Layout Containment
test('PERF-CSS-06: css/responsive.css and compiled style.css include mobile GPU relief, content-visibility, and overlay/dropdown exceptions', () => {
  assert.ok(respCss.includes('touch-action: manipulation'), 'Missing touch-action: manipulation');
  assert.ok(respCss.includes('.view:not(.active)'), 'Missing inactive view content-visibility rule');
  assert.ok(respCss.includes('body.cart-drawer-from-tables #pos') && respCss.includes('content-visibility: visible !important'), 'Cart drawer from #tables must stay visible');
  assert.ok(respCss.includes('#menu .clean-item-card.dropdown-open') && respCss.includes('content-visibility: visible'), 'Menu 3-dot dropdown must not be clipped');
  assert.ok(respCss.includes('backdrop-filter: none !important'), 'Missing mobile backdrop-filter relief');
  assert.ok(respCss.includes('prefers-reduced-motion: reduce'), 'Missing reduced-motion support');
  assert.ok(styleCss.includes('backdrop-filter: none !important'), 'Compiled style.css missing mobile GPU relief');
  assert.ok(Buffer.byteLength(styleCss, 'utf8') < 260 * 1024, `Compiled style.css should be minified (<260KB), got ${(Buffer.byteLength(styleCss)/1024).toFixed(1)}KB`);
});

test('PERF-BOOT-06B: defer-safe DOMContentLoaded guards in defensive-stubs, app.js, shop-auth.js, and customers.js', () => {
  const stubsJs = read('js/defensive-stubs.js');
  const appJs = read('app.js');
  const shopAuthJs = read('js/shop-auth.js');
  const customersJs = read('js/customers.js');
  assert.ok(stubsJs.includes('_domContentLoadedFired'), 'defensive-stubs.js must track _domContentLoadedFired');
  assert.ok(appJs.includes('!window._domContentLoadedFired'), 'app.js must wait for DOMContentLoaded under defer');
  assert.ok(shopAuthJs.includes('!window._domContentLoadedFired'), 'shop-auth.js must wait for DOMContentLoaded under defer');
  assert.ok(customersJs.includes('!window._domContentLoadedFired'), 'customers.js must wait for DOMContentLoaded under defer');
});

// 4. Behavioral Test: Active-Tab Gating & Dirty-Domain Filtering in updateAllUI
test('PERF-UI-07: updateAllUI only renders active view and skips hidden tabs', () => {
  const calls = [];
  const makeEl = (active) => ({
    classList: { contains: (c) => active && c === 'active' },
    style: { display: '' }
  });

  const activeMap = { pos: true, menu: false, customers: false, dashboard: false, settings: false, kds: false, tables: false, staff: false, khata: false };
  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => makeEl(Boolean(activeMap[id]))
    },
    console: { warn: () => {}, log: () => {} },
    idb: { set: () => {} },
    shopProfile: {},
    menuItems: [],
    menuCategories: [],
    orderHistory: [],
    dailyExpenses: [],
    tablesInfo: {},
    customersList: [],
    staffList: [],
    updateProfileVisuals: () => calls.push('updateProfileVisuals'),
    syncTableUI: () => calls.push('syncTableUI'),
    renderTables: () => calls.push('renderTables'),
    renderTablesView: () => calls.push('renderTablesView'),
    renderCategoryFilters: () => calls.push('renderCategoryFilters'),
    renderCategoryDropdown: () => calls.push('renderCategoryDropdown'),
    renderCategoryListUI: () => calls.push('renderCategoryListUI'),
    renderMenuUI: () => calls.push('renderMenuUI'),
    renderMenuCatalogUI: () => calls.push('renderMenuCatalogUI'),
    updateCartUI: () => calls.push('updateCartUI'),
    renderExpensesUI: () => calls.push('renderExpensesUI'),
    renderCustomersUI: () => calls.push('renderCustomersUI'),
    populateCheckoutCustomerDropdown: () => calls.push('populateCheckoutCustomerDropdown'),
    renderStaffManagementUI: () => calls.push('renderStaffManagementUI'),
    renderLoginStaffPicker: () => calls.push('renderLoginStaffPicker'),
    generateSettingsQRPreview: () => calls.push('generateSettingsQRPreview'),
    refreshAiQuotaDisplay: () => calls.push('refreshAiQuotaDisplay'),
    renderDashboardAnalytics: () => calls.push('renderDashboardAnalytics'),
    renderKdsUI: () => calls.push('renderKdsUI'),
    renderKhataUI: () => calls.push('renderKhataUI')
  };

  // Extract saveToLocal..updateAllUI block from js/core.js
  const startIdx = coreJs.indexOf('function saveToLocal(domains = null)');
  const endIdx = coreJs.indexOf('window.updateAllUI = updateAllUI;');
  assert.ok(startIdx !== -1 && endIdx !== -1, 'Could not locate updateAllUI block in js/core.js');
  const snippet = coreJs.slice(startIdx, endIdx + 'window.updateAllUI = updateAllUI;'.length);

  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);

  // Case A: Table-only update while on #pos tab -> should NOT render menu, customers, staff, dashboard, or settings!
  sandbox.updateAllUI({ tables: true });
  assert.ok(calls.includes('syncTableUI'), 'Should update topbar syncTableUI');
  assert.ok(calls.includes('renderTables'), 'Should render POS tables');
  assert.ok(calls.includes('updateCartUI'), 'Should update POS cart');
  assert.ok(!calls.includes('renderMenuUI'), 'Table-only sync must NOT re-render POS menu');
  assert.ok(!calls.includes('renderMenuCatalogUI'), 'Must NOT render hidden Menu Catalog');
  assert.ok(!calls.includes('renderCustomersUI'), 'Must NOT render hidden Customers tab');
  assert.ok(!calls.includes('renderStaffManagementUI'), 'Must NOT render hidden Staff tab');
  assert.ok(!calls.includes('renderDashboardAnalytics'), 'Must NOT render hidden Dashboard tab');
  assert.ok(!calls.includes('generateSettingsQRPreview'), 'Must NOT render hidden Settings QR');

  // Case B: Full updateAllUI() while on #pos tab -> still skips hidden tabs!
  calls.length = 0;
  sandbox.updateAllUI();
  assert.ok(calls.includes('renderMenuUI'), 'Full refresh on #pos renders POS menu');
  assert.ok(!calls.includes('renderMenuCatalogUI'), 'Full refresh on #pos still skips hidden #menu catalog');
  assert.ok(!calls.includes('renderCustomersUI'), 'Full refresh on #pos still skips hidden #customers');
  assert.ok(!calls.includes('renderStaffManagementUI'), 'Full refresh on #pos still skips hidden #staff');
  assert.ok(sandbox.window._dirtyRenderTabs.has('menu'), 'Hidden menu tab marked dirty for on-demand refresh');
  assert.ok(sandbox.window._dirtyRenderTabs.has('customers'), 'Hidden customers tab marked dirty');
  // Case C: Lock screen (#loginOverlay) and Staff Profile Selector (#staffProfileSelector) refresh live on staff updates
  calls.length = 0;
  sandbox.window._renderStaffProfileCards = () => calls.push('_renderStaffProfileCards');
  activeMap.loginOverlay = true;
  activeMap.staffProfileSelector = true;
  sandbox.updateAllUI({ staff: true });
  assert.ok(calls.includes('renderLoginStaffPicker'), 'Must refresh #loginOverlay staff picker when visible');
  assert.ok(calls.includes('_renderStaffProfileCards'), 'Must refresh #staffProfileSelector cards when visible');
});

test('PERF-UI-08: _setLocalStorageIfChanged skips identical writes and returns true on QuotaExceededError so idb persists', () => {
  const startIdx = coreJs.indexOf('function _setLocalStorageIfChanged(key, value)');
  const endIdx = coreJs.indexOf('function handleRemoteFirestoreUpdate(data)');
  assert.ok(startIdx !== -1 && endIdx !== -1, 'Could not locate _setLocalStorageIfChanged');
  const snippet = coreJs.slice(startIdx, endIdx);

  const store = new Map();
  let writeCount = 0;
  let shouldThrow = false;
  const sandbox = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        if (shouldThrow) throw new Error('QuotaExceededError');
        writeCount++;
        store.set(k, v);
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);

  assert.strictEqual(sandbox._setLocalStorageIfChanged('k1', 'hello'), true);
  assert.strictEqual(sandbox._setLocalStorageIfChanged('k1', 'hello'), false);
  assert.strictEqual(sandbox._setLocalStorageIfChanged('k1', 'world'), true);
  assert.strictEqual(writeCount, 2, `Expected 2 writes, got ${writeCount}`);
  shouldThrow = true;
  assert.strictEqual(sandbox._setLocalStorageIfChanged('k2', 'big'), true, 'Must return true on storage error so idb fallback runs');
});

test('PERF-UI-09: switchTabDirect clears dirty tab flag and hydrates newly opened tabs', () => {
  assert.ok(settingsJs.includes('window._dirtyRenderTabs.delete(tabId)'), 'switchTabDirect must clear dirty flag');
  assert.ok(settingsJs.includes('renderCategoryFilters'), 'switchTabDirect(pos) must refresh category filters');
  assert.ok(settingsJs.includes('renderExpensesUI'), 'switchTabDirect(dashboard) must refresh expenses');
});

console.log('\n====================================================');
console.log(`🎯 PHASE 1 PERF SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================');
if (failed > 0) process.exit(1);
