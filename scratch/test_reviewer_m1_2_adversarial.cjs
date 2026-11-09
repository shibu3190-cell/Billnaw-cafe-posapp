/**
 * scratch/test_reviewer_m1_2_adversarial.cjs
 * Independent Reviewer 2 & Adversarial Critic Test Suite for Milestone 1
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('====================================================');
console.log('🕵️ REVIEWER 2 & ADVERSARIAL CRITIC SUITE - MILESTONE 1');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

(async () => {
  // ----------------------------------------------------
  // SECTION 1: INVARIANTS & INTEGRITY IN INDEX.HTML
  // ----------------------------------------------------
  console.log('📍 SECTION 1: INVARIANTS & INTEGRITY IN INDEX.HTML');

  const html = fs.readFileSync('index.html', 'utf8');

  it('INV-01: Exactly 26 .modal-close-btn occurrences in index.html', () => {
    const matches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn, found ${matches.length}`);
  });

  it('INV-02: Zero raw "✕" or "x" in modal-close-btn elements', () => {
    const rawCloseBtnRegex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/g;
    const buttons = html.match(rawCloseBtnRegex) || [];
    assert.strictEqual(buttons.length, 26, 'Should have matched 26 modal close buttons');
    for (const btn of buttons) {
      assert.ok(!btn.includes('✕'), 'Found raw ✕ inside modal-close-btn');
      assert.ok(btn.includes('<svg'), 'Modal close btn must contain SVG icon');
    }
  });

  it('INV-03: Zero raw Unicode emojis inside <button> tags', () => {
    // Regex for button content containing emoji ranges
    const emojiRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    const emojiRange = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let match;
    let foundEmojis = [];
    while ((match = emojiRegex.exec(html)) !== null) {
      const buttonBody = match[1];
      // strip out svgs and tags to inspect text content
      const textOnly = buttonBody.replace(/<[^>]+>/g, '');
      if (emojiRange.test(textOnly)) {
        foundEmojis.push(textOnly.trim());
      }
    }
    assert.strictEqual(foundEmojis.length, 0, `Found raw emojis in buttons: ${foundEmojis.join(', ')}`);
  });

  it('INV-04: Non-breaking currency space preserved ("₹ ")', () => {
    assert.ok(html.includes('₹ '), 'index.html must maintain currency format');
  });

  it('INV-05: #subscriptionPausedBanner and #subscriptionRevokedOverlay exist and preserve invariants', () => {
    assert.ok(html.includes('id="subscriptionPausedBanner"'), 'Missing #subscriptionPausedBanner');
    assert.ok(html.includes('id="subscriptionRevokedOverlay"'), 'Missing #subscriptionRevokedOverlay');

    // Neither should have modal-close-btn
    const pausedBannerMatch = html.match(/<div id="subscriptionPausedBanner"[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(pausedBannerMatch, 'Could not extract #subscriptionPausedBanner block');
    assert.ok(!pausedBannerMatch[0].includes('modal-close-btn'), '#subscriptionPausedBanner must not have modal-close-btn');

    const revokedOverlayMatch = html.match(/<div id="subscriptionRevokedOverlay"[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(revokedOverlayMatch, 'Could not extract #subscriptionRevokedOverlay block');
    assert.ok(!revokedOverlayMatch[0].includes('modal-close-btn'), '#subscriptionRevokedOverlay must not have modal-close-btn');
  });

  // ----------------------------------------------------
  // SECTION 2: FIRESTORE SECURITY RULES PARITY & AUDIT
  // ----------------------------------------------------
  console.log('\n📍 SECTION 2: FIRESTORE RULES PARITY & AUDIT');

  it('RUL-01: Bit-for-bit binary parity between firestore.rules and database/firestore.rules', () => {
    const r1 = fs.readFileSync('firestore.rules');
    const r2 = fs.readFileSync('database/firestore.rules');
    assert.strictEqual(Buffer.compare(r1, r2), 0, 'firestore.rules and database/firestore.rules are not identical');
    assert.strictEqual(r1.length, r2.length, 'Length mismatch');

    const h1 = crypto.createHash('sha256').update(r1).digest('hex');
    const h2 = crypto.createHash('sha256').update(r2).digest('hex');
    assert.strictEqual(h1, h2, 'SHA-256 hash mismatch');
  });

  it('RUL-02: Rules enforce tenant boundary functions without bypasses', () => {
    const rulesText = fs.readFileSync('firestore.rules', 'utf8');
    assert.ok(rulesText.includes('function isAuthenticated()'), 'Missing isAuthenticated');
    assert.ok(rulesText.includes('function matchesTenantId('), 'Missing matchesTenantId');
    assert.ok(rulesText.includes('function matchesOwnerEmail('), 'Missing matchesOwnerEmail');
    assert.ok(rulesText.includes('function isTenantStaff('), 'Missing isTenantStaff');
    assert.ok(rulesText.includes('function isTenantAdmin('), 'Missing isTenantAdmin');
  });

  // ----------------------------------------------------
  // SECTION 3: BACKEND SUBSCRIPTION SERVICE ADVERSARIAL STRESS
  // ----------------------------------------------------
  console.log('\n📍 SECTION 3: BACKEND SUBSCRIPTION SERVICE ADVERSARIAL STRESS');

  const {
    createDefaultSubscription,
    validateSubscriptionTransition
  } = await import('../server/subscription-service.js');

  it('SRV-01: createDefaultSubscription generates complete, robust schema for empty or strange inputs', () => {
    const def1 = createDefaultSubscription('', '');
    assert.strictEqual(def1.status, 'ACTIVE');
    assert.strictEqual(def1.isFree, true);
    assert.ok(def1.shopId.length >= 3);
    assert.strictEqual(typeof def1.features, 'object');
    assert.strictEqual(def1.features.maxTerminals, 10);
    assert.strictEqual(def1.features.aiMenuScansPerMonth, 15);

    const def2 = createDefaultSubscription('SHOP-XYZ-99', 'CAFE.OWNER+TEST@DOMAIN.CO');
    assert.strictEqual(def2.shopId, 'SHOP-XYZ-99');
    assert.strictEqual(def2.shopEmail, 'cafe.owner+test@domain.co');
  });

  it('SRV-02: validateSubscriptionTransition matrix exhaustion', () => {
    // Valid transitions
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', 'PAUSED').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('PAUSED', 'RESUMED').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('PAUSED', 'ACTIVE').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', 'REVOKED').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('PAUSED', 'REVOKED').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('REVOKED', 'ACTIVE').allowed, true);

    // Case insensitivity & trimming
    assert.strictEqual(validateSubscriptionTransition('active', '  paused  ').allowed, true);
    assert.strictEqual(validateSubscriptionTransition('PAUSED', 'resumed').allowed, true);

    // Idempotent no-ops
    const noOp1 = validateSubscriptionTransition('ACTIVE', 'ACTIVE');
    assert.strictEqual(noOp1.allowed, true);
    assert.strictEqual(noOp1.isNoOp, true);

    const noOp2 = validateSubscriptionTransition('PAUSED', 'PAUSED');
    assert.strictEqual(noOp2.allowed, true);
    assert.strictEqual(noOp2.isNoOp, true);

    const noOp3 = validateSubscriptionTransition('REVOKED', 'REVOKED');
    assert.strictEqual(noOp3.allowed, true);
    assert.strictEqual(noOp3.isNoOp, true);

    // Blocked transitions
    // Cannot resume if already active
    const blk1 = validateSubscriptionTransition('ACTIVE', 'RESUMED');
    assert.strictEqual(blk1.allowed, false);
    assert.strictEqual(blk1.statusCode, 400);

    const blk2 = validateSubscriptionTransition('RESUMED', 'RESUMED');
    assert.strictEqual(blk2.allowed, true); // no-op

    // Cannot resume or pause a revoked account directly
    const blk3 = validateSubscriptionTransition('REVOKED', 'RESUMED');
    assert.strictEqual(blk3.allowed, false);
    assert.strictEqual(blk3.statusCode, 400);

    const blk4 = validateSubscriptionTransition('REVOKED', 'PAUSED');
    assert.strictEqual(blk4.allowed, false);
    assert.strictEqual(blk4.statusCode, 400);

    // Completely invalid actions
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', 'DELETE').allowed, false);
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', 'CANCELLED').allowed, false);
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', '').allowed, false);
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', null).allowed, false);
    assert.strictEqual(validateSubscriptionTransition('ACTIVE', 1234).allowed, false);
  });

  // ----------------------------------------------------
  // SECTION 4: CLIENT SYNC LOGIC & OFFLINE RESILIENCE
  // ----------------------------------------------------
  console.log('\n📍 SECTION 4: CLIENT SYNC LOGIC & OFFLINE RESILIENCE');

  const coreJs = fs.readFileSync('js/core.js', 'utf8');

  it('CLI-01: handleRemoteFirestoreUpdate safely handles null, undefined, or missing subscription', () => {
    // Check that missing subscription in data falls back to default ACTIVE without locking
    assert.ok(coreJs.includes('if (data.subscription && typeof data.subscription === \'object\')'), 'Must check data.subscription is object');
    assert.ok(coreJs.includes("applySubscriptionStatus({ status: 'ACTIVE', plan: 'billnaw Pro', isFree: true })"), 'Must default to ACTIVE when no subscription');
  });

  it('CLI-02: Offline snapshot error handler NEVER triggers REVOKED lockout', () => {
    // Check onSnapshot error handler around line 2311-2325
    const snapshotErrBlock = coreJs.slice(coreJs.indexOf('firestoreUnsubscribe = window.firestoreOnSnapshot'), coreJs.indexOf('window.attachFirestoreListener = attachFirestoreListener'));
    assert.ok(!snapshotErrBlock.includes("status: 'REVOKED'"), 'Error block must not set status to REVOKED');
    assert.ok(!snapshotErrBlock.includes("isTerminalLocked = true"), 'Error block must not lock terminal');
    assert.ok(snapshotErrBlock.includes("setCloudSyncStatus('offline'"), 'Error block must gracefully switch to offline local mode');
  });

  it('CLI-03: applySubscriptionStatus isolates side effects', () => {
    // Verify that PAUSED retains view access and closes checkoutModal
    assert.ok(coreJs.includes("rawStatus === 'PAUSED'"), 'PAUSED branch missing');
    assert.ok(coreJs.includes("desktopCheckoutBtn.disabled = true"), 'Must disable desktop checkout');
    assert.ok(coreJs.includes("cModal.style.display = 'none'"), 'Must dismiss checkout modal when paused');

    // Verify REVOKED cleans state
    assert.ok(coreJs.includes("rawStatus === 'REVOKED'"), 'REVOKED branch missing');
    assert.ok(coreJs.includes("localStorage.removeItem('billnaw_active_staff')"), 'Must purge active staff on revoked');
    assert.ok(coreJs.includes("isTerminalLocked = true"), 'Must set terminal locked');
  });

  it('CLI-04: Capture-phase click interceptor enforces checkout block', () => {
    assert.ok(coreJs.includes("document.addEventListener('click', function(e) {"), 'Missing click listener');
    assert.ok(coreJs.includes("e.stopPropagation()"), 'Missing stopPropagation in capture listener');
    assert.ok(coreJs.includes("}, true);"), 'Listener must use capture phase (true)');
  });

  // ----------------------------------------------------
  // SECTION 5: INTEGRITY & FACADE AUDIT
  // ----------------------------------------------------
  console.log('\n📍 SECTION 5: INTEGRITY & ADVERSARIAL FORGERY AUDIT');

  it('INT-01: No hardcoded test bypasses or short-circuit test flags in subscription-service.js', () => {
    const srvText = fs.readFileSync('server/subscription-service.js', 'utf8');
    assert.ok(!srvText.includes('process.env.TEST_MODE_BYPASS'), 'Found suspicious test bypass');
    assert.ok(!srvText.includes('if (shopId === \'test\') return true'), 'Found hardcoded test condition');
    assert.ok(srvText.includes('persistSubscriptionToFirestore'), 'Real Firestore persistence must exist');
    assert.ok(srvText.includes('updateMask.fieldPaths=subscription'), 'updateMask must be used');
  });

  it('INT-02: No dummy stubs in server.js subscription endpoints', () => {
    const srvJs = fs.readFileSync('server.js', 'utf8');
    assert.ok(srvJs.includes("app.get('/api/subscription/status'"), 'Status endpoint missing');
    assert.ok(srvJs.includes("app.post('/api/subscription/manage'"), 'Manage endpoint missing');
    assert.ok(srvJs.includes("validateSubscriptionTransition("), 'Server must validate transition');
    assert.ok(srvJs.includes("updateShopSubscription("), 'Server must update subscription');
  });

  console.log('\n====================================================');
  console.log(`📊 ADVERSARIAL AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
})();
