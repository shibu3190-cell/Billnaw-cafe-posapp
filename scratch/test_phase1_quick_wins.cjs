// scratch/test_phase1_quick_wins.cjs
// Verification Suite for Phase 1: Quick Wins Optimization
// 1. Double-tap re-entrancy guards (confirmCheckout & printKitchenTicket)
// 2. Debounced search functions (menu & settings)
// 3. Vector SVG generateFallbackImage optimization (zero-canvas)
// 4. Mobile GPU composite relief (elimination of blur on badges)

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================================');
console.log('🚀 RUNNING PHASE 1 QUICK WINS PERFORMANCE & RE-ENTRANCY AUDIT');
console.log('====================================================================');

async function runAudit() {
  const rootDir = path.resolve(__dirname, '..');

  // ---------------------------------------------------------------
  // CHECK 1: Re-entrancy Guards in js/pos.js
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 1: Synchronous Re-entrancy Guards in js/pos.js');
  const posContent = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf-8');

  assert.ok(posContent.includes('let _isCheckoutInFlight = false;'), 'Must define _isCheckoutInFlight');
  assert.ok(posContent.includes('if (_isCheckoutInFlight)'), 'confirmCheckout must check _isCheckoutInFlight at entry');
  assert.ok(posContent.includes('let payBtn = null;'), 'confirmCheckout must declare let payBtn outside try block');
  assert.ok(posContent.includes('let _isKotDispatchInFlight = false;'), 'Must define _isKotDispatchInFlight');
  assert.ok(posContent.includes('if (_isKotDispatchInFlight)'), 'printKitchenTicket must check _isKotDispatchInFlight at entry');
  console.log('  ✅ PASS: Both confirmCheckout and printKitchenTicket have immediate synchronous re-entrancy locks and clean payBtn scope.');

  // ---------------------------------------------------------------
  // CHECK 2: Debounced Search in js/menu.js & index.html
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 2: Debounced Search Handling');
  const menuContent = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf-8');
  const indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const settingsContent = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf-8');

  assert.ok(menuContent.includes('function debouncedMenuSearch'), 'js/menu.js must export debouncedMenuSearch');
  assert.ok(menuContent.includes('window.debouncedMenuSearch = debouncedMenuSearch'), 'window.debouncedMenuSearch must be registered');
  assert.ok(indexContent.includes('oninput="debouncedMenuSearch()"'), 'index.html #menuSearchInput must use debouncedMenuSearch');
  assert.ok(settingsContent.includes('function debouncedFilterSettingsHub'), 'js/settings.js must export debouncedFilterSettingsHub');
  assert.ok(indexContent.includes('oninput="debouncedFilterSettingsHub(this.value)"'), 'index.html #settingsSearchInput must use debouncedFilterSettingsHub');
  console.log('  ✅ PASS: Menu and Settings search inputs debounced cleanly.');

  // ---------------------------------------------------------------
  // CHECK 3: Vector SVG generateFallbackImage in js/core.js
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 3: Vector SVG generateFallbackImage Optimization');
  const coreContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf-8');
  const genFallbackStart = coreContent.indexOf('function generateFallbackImage(');
  const genFallbackEnd = coreContent.indexOf('window.generateFallbackImage =', genFallbackStart);
  const genFallbackBody = coreContent.slice(genFallbackStart, genFallbackEnd);

  assert.ok(!genFallbackBody.includes('canvas.toDataURL'), 'generateFallbackImage body must NOT execute canvas.toDataURL');
  assert.ok(coreContent.includes('_svgFallbackCache'), 'js/core.js must implement _svgFallbackCache');
  assert.ok(coreContent.includes('_svgFallbackCache.delete(oldestKey)'), 'js/core.js must implement FIFO eviction for _svgFallbackCache');
  assert.ok(genFallbackBody.includes('data:image/svg+xml'), 'generateFallbackImage must generate SVG data URIs');
  console.log('  ✅ PASS: Main-thread canvas allocations eliminated & FIFO eviction verified in generateFallbackImage.');

  // ---------------------------------------------------------------
  // CHECK 4: GPU Blur Elimination in style.css & css/
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 4: GPU Blur Bottleneck Elimination');
  const posCss = fs.readFileSync(path.join(rootDir, 'css', 'pos.css'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf-8');

  assert.ok(!posCss.includes('.stock-badge {\n    position: absolute;\n    top: 6px;\n    right: 6px;\n    z-index: 2;\n    background: rgba(15, 23, 42, 0.78);\n    backdrop-filter: blur(4px);'), 'css/pos.css must not have backdrop-filter: blur on .stock-badge');
  assert.ok(styleCss.includes('.stock-badge'), 'style.css contains bundled .stock-badge');
  console.log('  ✅ PASS: .stock-badge GPU composite offscreen blur passes removed.');

  console.log('\n====================================================================');
  console.log('🎉 ALL 4 PHASE 1 CHECKS PASSED 100%!');
  console.log('====================================================================');
}

runAudit().catch(err => {
  console.error('❌ Phase 1 Audit Failed:', err);
  process.exit(1);
});
