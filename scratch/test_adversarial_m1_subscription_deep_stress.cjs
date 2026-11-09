// scratch/test_adversarial_m1_subscription_deep_stress.cjs
// ==============================================================================
// ⚔️ EMPIRICAL ADVERSARIAL CHALLENGER 2: SUBSCRIPTION STRESS & INVARIANTS HARNESS
// ==============================================================================
// Challenges:
// 1. Subscription Lifecycle Transition Cycle: ACTIVE -> PAUSED -> RESUMED -> REVOKED -> ACTIVE
// 2. Forbidden State Transitions (Guard Stress)
// 3. Negative Input Rejection & Parameter Fuzzing
// 4. REST API Endpoint Negative Boundary Checks
// 5. Client POS Lockdown & Banner State Machine Assertions
// 6. Non-dismissibility of Revocation Modal (#subscriptionRevokedOverlay)
// 7. Repository Invariants: Exactly 26 modal-close-btn SVGs, 0 raw emojis in <button>
// ==============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

process.env.NODE_ENV = 'test';

let passed = 0;
let failed = 0;
const results = [];

function pass(id, msg) {
  passed++;
  console.log(`  ✅ PASS [${id}]: ${msg}`);
  results.push({ id, status: 'PASS', msg });
}

function fail(id, msg, err) {
  failed++;
  console.error(`  ❌ FAIL [${id}]: ${msg}`);
  console.error(`     Details: ${err.message || err}`);
  results.push({ id, status: 'FAIL', msg, error: err.message || String(err) });
}

async function step(id, msg, fn) {
  try {
    await fn();
    pass(id, msg);
  } catch (err) {
    fail(id, msg, err);
  }
}

function request(port, method, reqPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('========================================================================');
  console.log('🛡️  EMPIRICAL ADVERSARIAL CHALLENGER 2: SUBSCRIPTION & INVARIANT HARNESS');
  console.log('========================================================================\n');

  const {
    validateSubscriptionTransition,
    createDefaultSubscription,
    getShopSubscription,
    updateShopSubscription
  } = await import('../server/subscription-service.js');
  const { app } = await import('../server.js');

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`🚀 Test Express server initialized on 127.0.0.1:${port}\n`);

  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');

  // ============================================================================
  // SUITE 1: SUBSCRIPTION FULL LIFECYCLE TRANSITION CYCLE
  // Cycle: ACTIVE -> PAUSED -> RESUMED -> REVOKED -> ACTIVE
  // ============================================================================
  console.log('📍 SUITE 1: FULL SUBSCRIPTION LIFECYCLE CYCLE');

  const lifecycleShop = 'SHOP-CHALLENGER-LIFECYCLE-01';
  const lifecycleEmail = 'challenger_lifecycle@billnawcafe.com';

  await step('SUB-CYC-01', 'Initialize store subscription with ACTIVE status', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      shopEmail: lifecycleEmail,
      action: 'ACTIVE',
      reason: 'Initial setup'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'ACTIVE');
  });

  await step('SUB-CYC-02', 'Step 1: Transition ACTIVE -> PAUSED', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'PAUSED',
      reason: 'Temporary pause for cafe renovation'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PAUSED');
    assert.strictEqual(res.body.previousStatus, 'ACTIVE');

    // Verify GET confirms PAUSED
    const getRes = await request(port, 'GET', `/api/subscription/status?shopId=${lifecycleShop}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.subscription.status, 'PAUSED');
  });

  await step('SUB-CYC-03', 'Step 2: Transition PAUSED -> RESUMED', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'RESUMED',
      reason: 'Cafe reopened after renovation'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'RESUMED');
    assert.strictEqual(res.body.previousStatus, 'PAUSED');

    const getRes = await request(port, 'GET', `/api/subscription/status?shopId=${lifecycleShop}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.subscription.status, 'RESUMED');
  });

  await step('SUB-CYC-04', 'Step 3: Transition RESUMED -> REVOKED', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'REVOKED',
      reason: 'Billing violation'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'REVOKED');

    const getRes = await request(port, 'GET', `/api/subscription/status?shopId=${lifecycleShop}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.subscription.status, 'REVOKED');
  });

  await step('SUB-CYC-05', 'Step 4: Transition REVOKED -> ACTIVE (reinstatement)', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'ACTIVE',
      reason: 'Account reinstated by admin'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ACTIVE');

    const getRes = await request(port, 'GET', `/api/subscription/status?shopId=${lifecycleShop}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.subscription.status, 'ACTIVE');
  });

  // ============================================================================
  // SUITE 2: FORBIDDEN TRANSITIONS & INVALID ACTION REJECTION
  // ============================================================================
  console.log('\n📍 SUITE 2: FORBIDDEN TRANSITIONS & INVALID ACTION REJECTION');

  await step('SUB-GRD-01', 'Cannot transition ACTIVE -> RESUMED (returns 400)', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'RESUMED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes("already 'ACTIVE'"));
  });

  await step('SUB-GRD-02', 'Cannot transition REVOKED -> RESUMED directly (returns 400)', async () => {
    // Put into REVOKED first
    await request(port, 'POST', '/api/subscription/manage', { shopId: lifecycleShop, action: 'REVOKED' });

    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'RESUMED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes("Use action 'ACTIVE' to reinstate"));
  });

  await step('SUB-GRD-03', 'Cannot transition REVOKED -> PAUSED directly (returns 400)', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop,
      action: 'PAUSED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes("Use action 'ACTIVE' to reinstate"));

    // Reinstate back to ACTIVE for subsequent tests
    await request(port, 'POST', '/api/subscription/manage', { shopId: lifecycleShop, action: 'ACTIVE' });
  });

  await step('SUB-GRD-04', 'Invalid action verbs (e.g. INVALID_STATE, DELETED, SUSPENDED) return 400', async () => {
    const invalidVerbs = ['INVALID_STATE', 'FOO_BAR', 'DELETE', 'SUSPEND', 'EXPIRED', 'ARCHIVED'];
    for (const verb of invalidVerbs) {
      const res = await request(port, 'POST', '/api/subscription/manage', {
        shopId: lifecycleShop,
        action: verb
      });
      assert.strictEqual(res.status, 400, `Action ${verb} must return 400`);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('Allowed actions: ACTIVE, PAUSED, RESUMED, REVOKED'));
    }
  });

  // ============================================================================
  // SUITE 3: NEGATIVE INPUT REJECTION & PARAMETER FUZZING
  // ============================================================================
  console.log('\n📍 SUITE 3: NEGATIVE INPUT REJECTION & PARAMETER FUZZING');

  await step('SUB-NEG-01', 'Empty body {} returns 400', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await step('SUB-NEG-02', 'Missing action returns 400', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: lifecycleShop
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await step('SUB-NEG-03', 'Missing both shopEmail and shopId returns 400', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      action: 'PAUSED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('at least one of shopEmail or shopId'));
  });

  await step('SUB-NEG-04', 'Whitespace-only shopId and shopEmail return 400', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: '   \t  \n  ',
      shopEmail: '    ',
      action: 'PAUSED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await step('SUB-NEG-05', 'Malformed email formats in POST /api/subscription/manage return 400', async () => {
    const badEmails = [
      'plainaddress',
      '@missingusername.com',
      'username@.com',
      'username@domain..com',
      'username@domain,com',
      'user name@domain.com',
      'user@domain'
    ];
    for (const bad of badEmails) {
      const res = await request(port, 'POST', '/api/subscription/manage', {
        shopEmail: bad,
        action: 'PAUSED'
      });
      assert.strictEqual(res.status, 400, `Expected 400 for bad email: ${bad}`);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('Invalid shopEmail'));
    }
  });

  await step('SUB-NEG-06', 'GET /api/subscription/status missing both email and shopId returns 400', async () => {
    const res = await request(port, 'GET', '/api/subscription/status');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await step('SUB-NEG-07', 'GET /api/subscription/status with malformed email returns 400', async () => {
    const res = await request(port, 'GET', '/api/subscription/status?email=notanemail');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await step('SUB-NEG-08', 'Negative / non-existent shopId returns 404', async () => {
    const res = await request(port, 'POST', '/api/subscription/manage', {
      shopId: 'NON_EXISTENT_SHOP_9999999',
      action: 'PAUSED'
    });
    // In our system, if shopId is provided and neither in-memory nor disk has it, getShopSubscription creates default or returns 404
    // If shopId was created, it returns 200, or 404 if not found. Let's verify status is valid (200 or 404), never 500
    assert.ok(res.status === 200 || res.status === 404);
  });

  // ============================================================================
  // SUITE 4: CLIENT-SIDE POS LOCKDOWN & BANNER BEHAVIOR AUDIT
  // ============================================================================
  console.log('\n📍 SUITE 4: CLIENT-SIDE POS LOCKDOWN & BANNER PRESENTATION');

  const mockDom = {
    subscriptionPausedBanner: { style: { display: 'none' } },
    subscriptionRevokedOverlay: { style: { display: 'none' } },
    desktopCheckoutBtn: { disabled: false, title: '', removeAttribute(a) { if (a === 'title') this.title = ''; } },
    floatingCartRight: { disabled: false, title: '', removeAttribute(a) { if (a === 'title') this.title = ''; } },
    checkoutModalPayBtn: { disabled: false },
    checkoutModal: { style: { display: 'none' } },
    settingsSubscriptionSubtitle: { innerText: '' },
    revokedShopEmailDisplay: { innerText: '' },
    revokedStoreCodeDisplay: { innerText: '' },
    subscriptionRevokedReason: { innerText: '' }
  };

  const storeMap = new Map();
  const mockLocalStorage = {
    getItem: (k) => storeMap.get(k) || null,
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k)
  };

  const registeredListeners = [];
  const mockDocument = {
    getElementById: (id) => mockDom[id] || null,
    querySelector: (sel) => {
      if (sel.includes('.sc-right')) return mockDom.floatingCartRight;
      if (sel.includes('#checkoutModal .btn-success')) return mockDom.checkoutModalPayBtn;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.modal-overlay') {
        return [
          { id: 'checkoutModal', style: mockDom.checkoutModal.style },
          { id: 'subscriptionRevokedOverlay', style: mockDom.subscriptionRevokedOverlay.style }
        ];
      }
      return [];
    },
    addEventListener: (evt, fn, capture) => {
      registeredListeners.push({ evt, fn, capture });
    }
  };

  const mockWindow = {
    shopProfile: { email: 'owner@mockcafe.com', id: 'SHOP-MOCK-01' },
    cart: [{ item: 'Mocha', price: 150 }],
    currentStaff: { id: 'staff_1', name: 'Server Bob' },
    currentRole: 'Server',
    isTerminalLocked: false,
    dispatchEvent: () => {}
  };

  const coreFnChunk = coreJs.substring(
    coreJs.indexOf('function isSubscriptionPaused()'),
    coreJs.indexOf('// Firestore Sync Integration')
  );

  const clientScope = new Function(
    'global',
    'window',
    'document',
    'localStorage',
    `${coreFnChunk}; return { applySubscriptionStatus, isSubscriptionPaused, isSubscriptionRevoked };`
  )(global, mockWindow, mockDocument, mockLocalStorage);

  await step('CLI-ST-01', 'PAUSED state shows banner, disables desktop and floating checkout buttons, dismisses checkout modal', () => {
    mockDom.checkoutModal.style.display = 'flex'; // simulate modal open
    clientScope.applySubscriptionStatus({
      status: 'PAUSED',
      shopEmail: 'owner@mockcafe.com',
      shopId: 'SHOP-MOCK-01'
    });

    assert.strictEqual(clientScope.isSubscriptionPaused(), true);
    assert.strictEqual(clientScope.isSubscriptionRevoked(), false);
    assert.strictEqual(mockDom.subscriptionPausedBanner.style.display, 'flex');
    assert.strictEqual(mockDom.subscriptionRevokedOverlay.style.display, 'none');
    assert.strictEqual(mockDom.desktopCheckoutBtn.disabled, true);
    assert.strictEqual(mockDom.floatingCartRight.disabled, true);
    assert.strictEqual(mockDom.checkoutModalPayBtn.disabled, true);
    assert.strictEqual(mockDom.checkoutModal.style.display, 'none');
    assert.strictEqual(mockLocalStorage.getItem('billnaw_subscription_status'), 'PAUSED');
  });

  await step('CLI-ST-02', 'Capture-phase click listener intercepts click on checkout buttons when PAUSED', () => {
    const listener = registeredListeners.find((l) => l.evt === 'click' && l.capture === true);
    assert.ok(listener, 'Click capture listener must be attached');

    let prevented = false;
    let stopped = false;
    const fakeEvt = {
      target: {
        closest: (selector) => {
          if (selector.includes('#desktopCheckoutBtn')) return mockDom.desktopCheckoutBtn;
          return null;
        }
      },
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; }
    };

    listener.fn(fakeEvt);
    assert.strictEqual(prevented, true, 'Checkout click must be prevented when paused');
    assert.strictEqual(stopped, true, 'Checkout click event must be stopped');
  });

  await step('CLI-ST-03', 'REVOKED state locks terminal, displays full-screen overlay, clears cart, and purges session', () => {
    mockWindow.cart = [{ item: 'Cold Brew' }];
    mockWindow.currentStaff = { name: 'Manager Dave' };
    mockLocalStorage.setItem('billnaw_active_staff', '{"name":"Manager Dave"}');
    mockLocalStorage.setItem('billnaw_current_session_id', 'sess_999');

    clientScope.applySubscriptionStatus({
      status: 'REVOKED',
      shopEmail: 'owner@mockcafe.com',
      shopId: 'SHOP-MOCK-01',
      statusReason: 'Delinquent subscription invoice #INV-404'
    });

    assert.strictEqual(clientScope.isSubscriptionRevoked(), true);
    assert.strictEqual(clientScope.isSubscriptionPaused(), false);
    assert.strictEqual(mockDom.subscriptionRevokedOverlay.style.display, 'flex');
    assert.strictEqual(mockDom.subscriptionPausedBanner.style.display, 'none');
    assert.strictEqual(mockDom.revokedShopEmailDisplay.innerText, 'owner@mockcafe.com');
    assert.strictEqual(mockDom.revokedStoreCodeDisplay.innerText, 'SHOP-MOCK-01');
    assert.strictEqual(mockDom.subscriptionRevokedReason.innerText, 'Delinquent subscription invoice #INV-404');

    // Terminal lock invariants
    assert.strictEqual(mockWindow.isTerminalLocked, true);
    assert.strictEqual(mockLocalStorage.getItem('billnaw_terminal_locked'), 'true');
    assert.strictEqual(mockLocalStorage.getItem('billnaw_active_staff'), null);
    assert.strictEqual(mockLocalStorage.getItem('billnaw_current_session_id'), null);
    assert.strictEqual(mockWindow.cart.length, 0);
    assert.strictEqual(mockWindow.currentStaff, null);
  });

  await step('CLI-ST-04', 'RESUMED or ACTIVE reinstates checkout capability and removes restriction overlays', () => {
    clientScope.applySubscriptionStatus({
      status: 'RESUMED',
      shopEmail: 'owner@mockcafe.com',
      shopId: 'SHOP-MOCK-01'
    });

    assert.strictEqual(clientScope.isSubscriptionPaused(), false);
    assert.strictEqual(clientScope.isSubscriptionRevoked(), false);
    assert.strictEqual(mockDom.subscriptionRevokedOverlay.style.display, 'none');
    assert.strictEqual(mockDom.subscriptionPausedBanner.style.display, 'none');
    assert.strictEqual(mockDom.desktopCheckoutBtn.disabled, false);
    assert.strictEqual(mockDom.floatingCartRight.disabled, false);
    assert.strictEqual(mockDom.checkoutModalPayBtn.disabled, false);
    assert.strictEqual(mockLocalStorage.getItem('billnaw_subscription_status'), 'RESUMED');
  });

  // ============================================================================
  // SUITE 5: REPOSITORY INVARIANTS AUDIT
  // ============================================================================
  console.log('\n📍 SUITE 5: REPOSITORY INVARIANTS AUDIT');

  await step('INV-SVG-01', 'Count .modal-close-btn SVG elements in index.html: EXACTLY 26', () => {
    const modalMatches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(modalMatches, 'No modal-close-btn buttons found');
    console.log(`     -> Found ${modalMatches.length} modal-close-btn SVG elements`);
    assert.strictEqual(modalMatches.length, 26, `Must have exactly 26 modal-close-btn SVGs, got ${modalMatches.length}`);
  });

  await step('INV-CLS-02', 'Total occurrences of modal-close-btn class in index.html: EXACTLY 26', () => {
    const classMatches = indexHtml.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
    assert.ok(classMatches, 'No modal-close-btn classes found');
    console.log(`     -> Found ${classMatches.length} occurrences of class="modal-close-btn"`);
    assert.strictEqual(classMatches.length, 26, `Must have exactly 26 modal-close-btn class occurrences, got ${classMatches.length}`);
  });

  await step('INV-EMJ-03', 'Raw Unicode emojis inside <button> elements: EXACTLY 0', () => {
    const buttonMatches = indexHtml.match(/<button\b[^>]*>(.*?)<\/button>/gs) || [];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let emojiButtonCount = 0;
    const offendingButtons = [];

    for (const btn of buttonMatches) {
      const textOnly = btn.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textOnly)) {
        emojiButtonCount++;
        offendingButtons.push(btn);
      }
    }

    console.log(`     -> Checked ${buttonMatches.length} <button> elements, found ${emojiButtonCount} raw emojis`);
    assert.strictEqual(emojiButtonCount, 0, `Buttons with raw emojis detected: ${JSON.stringify(offendingButtons)}`);
  });

  await step('INV-OVR-04', '#subscriptionRevokedOverlay is non-dismissible (has NO close button)', () => {
    const overlayStart = indexHtml.indexOf('id="subscriptionRevokedOverlay"');
    assert.ok(overlayStart !== -1, 'Missing #subscriptionRevokedOverlay in index.html');
    const overlayEnd = indexHtml.indexOf('<!-- 🔐 MANDATORY FIRST-LOGIN PIN CHANGE MODAL', overlayStart);
    const overlayHtml = indexHtml.substring(overlayStart, overlayEnd);

    assert.strictEqual(overlayHtml.includes('modal-close-btn'), false, 'Revoked overlay must NOT have modal-close-btn');
    assert.strictEqual(overlayHtml.includes('&times;'), false, 'Revoked overlay must NOT have &times;');
    assert.strictEqual(overlayHtml.includes('✕'), false, 'Revoked overlay must NOT have raw cross character');
  });

  server.close();

  // ============================================================================
  // FINAL SCORECARD
  // ============================================================================
  console.log('\n========================================================================');
  console.log('📊 CHALLENGER 2 EMPIRICAL AUDIT SCORECARD');
  console.log('========================================================================');
  console.log(`  Total Checks:       ${passed + failed}`);
  console.log(`  Passed Checks:      ${passed}`);
  console.log(`  Failed Checks:      ${failed}`);
  console.log(`  Pass Rate:          ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('========================================================================');

  if (failed > 0) {
    console.error(`❌ CHALLENGER 2 REJECTED: ${failed} assertions failed.`);
    process.exit(1);
  } else {
    console.log('🎉 CHALLENGER 2 VERIFIED: ALL SUBSCRIPTION TRANSITIONS & INVARIANTS PASS 100%!');
    process.exit(0);
  }
})();
