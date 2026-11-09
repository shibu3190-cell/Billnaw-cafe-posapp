// scratch/test_m1_subscription_client_sync.cjs
// Verification suite for Milestone 1 Client Subscription Sync, Zero-Reload Propagation & Invariants

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('💎 TESTING CLIENT SUBSCRIPTION PROPAGATION & INVARIANTS');
console.log('====================================================\n');

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

const rootDir = path.resolve(__dirname, '..');
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');

// 1. INVARIANT CHECKS
console.log('📍 SECTION 1: STRICT INVARIANT AUDIT');
test('INV-01: Exactly 26 modal-close-btn SVG elements in index.html', () => {
  const matches = htmlContent.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
  assert.ok(matches, 'No modal-close-btn SVGs found');
  assert.strictEqual(matches.length, 26, `Expected exactly 26, got ${matches.length}`);
});

test('INV-02: Total modal-close-btn class occurrences in index.html is exactly 26', () => {
  const allMatches = htmlContent.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
  assert.ok(allMatches, 'No modal-close-btn classes found');
  assert.strictEqual(allMatches.length, 26, `Expected exactly 26, got ${allMatches.length}`);
});

test('INV-03: Zero raw Unicode emojis inside <button> elements in index.html', () => {
  const buttonMatches = htmlContent.match(/<button\b[^>]*>(.*?)<\/button>/gs) || [];
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const btn of buttonMatches) {
    // Strip inner SVGs and attributes to inspect visible text nodes
    const textOnly = btn.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
    assert.strictEqual(emojiRegex.test(textOnly), false, `Found raw emoji in button: ${btn}`);
  }
});

// 2. DOM STRUCTURE AUDIT
console.log('\n📍 SECTION 2: DOM SUBSCRIPTION ELEMENTS AUDIT');
test('DOM-01: #subscriptionPausedBanner exists in index.html with correct styling', () => {
  assert.ok(htmlContent.includes('id="subscriptionPausedBanner"'), 'Missing #subscriptionPausedBanner');
  assert.ok(htmlContent.includes('Subscription Paused - Contact Admin'), 'Missing paused banner header text');
  assert.ok(htmlContent.includes('onclick="openSubscriptionModal()"'), 'Missing View Plan trigger');
});

test('DOM-02: #subscriptionRevokedOverlay exists in index.html and is non-dismissible', () => {
  assert.ok(htmlContent.includes('id="subscriptionRevokedOverlay"'), 'Missing #subscriptionRevokedOverlay');
  assert.ok(htmlContent.includes('id="subscriptionRevokedReason"'), 'Missing #subscriptionRevokedReason');
  assert.ok(htmlContent.includes('id="revokedShopEmailDisplay"'), 'Missing #revokedShopEmailDisplay');
  assert.ok(htmlContent.includes('id="revokedStoreCodeDisplay"'), 'Missing #revokedStoreCodeDisplay');
  assert.ok(htmlContent.includes('onclick="checkSubscriptionStatusNow()"'), 'Missing checkSubscriptionStatusNow button');
  // Confirm no close button inside #subscriptionRevokedOverlay
  const overlayIdx = htmlContent.indexOf('id="subscriptionRevokedOverlay"');
  const overlayEnd = htmlContent.indexOf('<!-- 🔐 MANDATORY FIRST-LOGIN PIN CHANGE MODAL', overlayIdx);
  const overlayChunk = htmlContent.substring(overlayIdx, overlayEnd);
  assert.strictEqual(overlayChunk.includes('modal-close-btn'), false, 'revoked overlay must NOT contain modal-close-btn');
});

// 3. CORE CLIENT LOGIC AUDIT
console.log('\n📍 SECTION 3: JS/CORE.JS CLIENT PROPAGATION ENGINE AUDIT');
test('CORE-01: js/core.js exports isSubscriptionPaused, isSubscriptionRevoked, applySubscriptionStatus', () => {
  assert.ok(coreJsContent.includes('function isSubscriptionPaused()'), 'Missing isSubscriptionPaused');
  assert.ok(coreJsContent.includes('function isSubscriptionRevoked()'), 'Missing isSubscriptionRevoked');
  assert.ok(coreJsContent.includes('function applySubscriptionStatus('), 'Missing applySubscriptionStatus');
  assert.ok(coreJsContent.includes('window.isSubscriptionPaused = isSubscriptionPaused;'), 'Missing window export');
  assert.ok(coreJsContent.includes('window.isSubscriptionRevoked = isSubscriptionRevoked;'), 'Missing window export');
  assert.ok(coreJsContent.includes('window.applySubscriptionStatus = applySubscriptionStatus;'), 'Missing window export');
});

test('CORE-02: handleRemoteFirestoreUpdate unpacks data.subscription and applies status', () => {
  assert.ok(coreJsContent.includes('if (data.subscription && typeof data.subscription === \'object\')'), 'Missing subscription check in handleRemoteFirestoreUpdate');
  assert.ok(coreJsContent.includes('applySubscriptionStatus(data.subscription);'), 'Missing applySubscriptionStatus call');
});

test('CORE-03: applySubscriptionStatus handles ACTIVE/RESUMED, PAUSED, REVOKED deterministic transitions', () => {
  assert.ok(coreJsContent.includes("rawStatus === 'ACTIVE' || rawStatus === 'RESUMED'"), 'Missing ACTIVE/RESUMED branch');
  assert.ok(coreJsContent.includes("rawStatus === 'PAUSED'"), 'Missing PAUSED branch');
  assert.ok(coreJsContent.includes("rawStatus === 'REVOKED'"), 'Missing REVOKED branch');
  assert.ok(coreJsContent.includes("desktopCheckoutBtn.disabled = true"), 'Missing desktop checkout disable on pause');
  assert.ok(coreJsContent.includes("desktopCheckoutBtn.disabled = false"), 'Missing desktop checkout enable on active');
  assert.ok(coreJsContent.includes("isTerminalLocked = true"), 'Missing terminal lock on revoked');
});

test('CORE-04: Click capture listener intercepts checkout attempts when paused or revoked', () => {
  assert.ok(coreJsContent.includes('document.addEventListener(\'click\''), 'Missing document click listener');
  assert.ok(coreJsContent.includes('isSubscriptionPaused()'), 'Missing paused check in click listener');
  assert.ok(coreJsContent.includes('isSubscriptionRevoked()'), 'Missing revoked check in click listener');
});

// 4. SIMULATION TESTS (In a mock DOM environment)
console.log('\n📍 SECTION 4: DOM SIMULATION & REACTIVITY');
test('SIM-01: State simulation on mocked elements', () => {
  // Create minimal mock DOM
  const elements = {
    subscriptionPausedBanner: { style: { display: 'none' } },
    subscriptionRevokedOverlay: { style: { display: 'none' } },
    desktopCheckoutBtn: { disabled: false, title: '', removeAttribute() { this.title = ''; } },
    floatingCartRight: { disabled: false, title: '', removeAttribute() { this.title = ''; } },
    revokedShopEmailDisplay: { innerText: '' },
    revokedStoreCodeDisplay: { innerText: '' },
    subscriptionRevokedReason: { innerText: '' }
  };

  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k)
  };
  global.document = {
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (sel.includes('.sc-right')) return elements.floatingCartRight;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  global.window = {
    shopProfile: { email: 'owner@cafe.com' },
    dispatchEvent: () => {}
  };

  // Evaluate the applySubscriptionStatus implementation extracted from js/core.js
  const fnStart = coreJsContent.indexOf('function applySubscriptionStatus(subscription) {');
  const fnEnd = coreJsContent.indexOf('window.applySubscriptionStatus = applySubscriptionStatus;');
  const fnCode = coreJsContent.substring(fnStart, fnEnd) + '\nreturn applySubscriptionStatus;';
  const applyFn = new Function('currentSubscriptionState', fnCode)({});

  // 1. Apply PAUSED
  applyFn({ status: 'PAUSED', shopEmail: 'owner@cafe.com', shopId: 'SHOP-TEST' });
  assert.strictEqual(elements.subscriptionPausedBanner.style.display, 'flex');
  assert.strictEqual(elements.subscriptionRevokedOverlay.style.display, 'none');
  assert.strictEqual(elements.desktopCheckoutBtn.disabled, true);
  assert.strictEqual(global.localStorage.getItem('billnaw_subscription_status'), 'PAUSED');

  // 2. Apply RESUMED
  applyFn({ status: 'RESUMED', shopEmail: 'owner@cafe.com', shopId: 'SHOP-TEST' });
  assert.strictEqual(elements.subscriptionPausedBanner.style.display, 'none');
  assert.strictEqual(elements.subscriptionRevokedOverlay.style.display, 'none');
  assert.strictEqual(elements.desktopCheckoutBtn.disabled, false);
  assert.strictEqual(global.localStorage.getItem('billnaw_subscription_status'), 'RESUMED');

  // 3. Apply REVOKED
  applyFn({ status: 'REVOKED', shopEmail: 'owner@cafe.com', shopId: 'SHOP-TEST', statusReason: 'Audit pending' });
  assert.strictEqual(elements.subscriptionPausedBanner.style.display, 'none');
  assert.strictEqual(elements.subscriptionRevokedOverlay.style.display, 'flex');
  assert.strictEqual(elements.revokedShopEmailDisplay.innerText, 'owner@cafe.com');
  assert.strictEqual(elements.revokedStoreCodeDisplay.innerText, 'SHOP-TEST');
  assert.strictEqual(elements.subscriptionRevokedReason.innerText, 'Audit pending');
  assert.strictEqual(global.localStorage.getItem('billnaw_subscription_status'), 'REVOKED');
});

console.log(`\n====================================================`);
console.log(`🎯 TOTAL CLIENT SUBSCRIPTION AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log(`====================================================`);

if (failed > 0) process.exit(1);
process.exit(0);
