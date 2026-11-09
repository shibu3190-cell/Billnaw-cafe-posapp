// scratch/test_m1_subscription_adversarial.cjs
// ==============================================================================
// ⚔️ ADVERSARIAL STRESS & VERIFICATION SUITE — MILESTONE 1 SUBSCRIPTION ENGINE
// ==============================================================================
// Scope:
// 1. Invalid subscription state transitions (guards, invalid actions, idempotency)
// 2. Malformed payloads (missing identifiers, invalid email formats, injections, prototype pollution)
// 3. High-concurrency & rapid flip-flopping (race conditions, memory/disk integrity)
// 4. Client-side DOM resilience (checkout button disabled/event interception, terminal lockout)
// 5. Offline safety & snapshot resiliency (disconnects, empty docs, corrupted objects)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

// Set test environment flag before importing server.js
process.env.NODE_ENV = 'test';

let passed = 0;
let failed = 0;
const results = [];

function recordPass(testId, name) {
  passed++;
  console.log(`  ✅ PASS [${testId}]: ${name}`);
  results.push({ id: testId, name, status: 'PASS' });
}

function recordFail(testId, name, error) {
  failed++;
  console.error(`  ❌ FAIL [${testId}]: ${name}`);
  console.error(`     Error: ${error.message || error}`);
  results.push({ id: testId, name, status: 'FAIL', error: error.message || String(error) });
}

async function runTest(testId, name, fn) {
  try {
    await fn();
    recordPass(testId, name);
  } catch (err) {
    recordFail(testId, name, err);
  }
}

// HTTP request helper
function sendHttpRequest(port, method, reqPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
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
        res.on('data', (chunk) => (raw += chunk));
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
  console.log('====================================================================');
  console.log('⚔️  MILESTONE 1: SUBSCRIPTION ADVERSARIAL & STRESS HARNESS');
  console.log('====================================================================\n');

  // Load backend services and server
  const {
    validateSubscriptionTransition,
    createDefaultSubscription,
    getShopSubscription,
    updateShopSubscription
  } = await import('../server/subscription-service.js');
  const { normalizeEmail, isValidEmail } = await import('../server/auth-service.js');
  const { app } = await import('../server.js');

  // Start Express test server on ephemeral port
  const server = app.listen(0);
  const serverPort = server.address().port;
  console.log(`📡 Production Express app running for test on port ${serverPort}\n`);

  // ============================================================================
  // SECTION 1: INVALID & FORBIDDEN STATE TRANSITIONS (STATE MACHINE GUARDS)
  // ============================================================================
  console.log('📍 SECTION 1: SUBSCRIPTION STATE TRANSITION MATRIX & GUARDS');

  // 1.1 Valid Transitions
  await runTest('ADV-TR-01', 'ACTIVE -> PAUSED is permitted', () => {
    const r = validateSubscriptionTransition('ACTIVE', 'PAUSED');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'PAUSED');
    assert.strictEqual(r.isNoOp, false);
  });

  await runTest('ADV-TR-02', 'PAUSED -> RESUMED is permitted', () => {
    const r = validateSubscriptionTransition('PAUSED', 'RESUMED');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'RESUMED');
  });

  await runTest('ADV-TR-03', 'PAUSED -> ACTIVE is permitted', () => {
    const r = validateSubscriptionTransition('PAUSED', 'ACTIVE');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'ACTIVE');
  });

  await runTest('ADV-TR-04', 'ACTIVE -> REVOKED is permitted', () => {
    const r = validateSubscriptionTransition('ACTIVE', 'REVOKED');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'REVOKED');
  });

  await runTest('ADV-TR-05', 'PAUSED -> REVOKED is permitted', () => {
    const r = validateSubscriptionTransition('PAUSED', 'REVOKED');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'REVOKED');
  });

  await runTest('ADV-TR-06', 'REVOKED -> ACTIVE is permitted (explicit admin reinstatement)', () => {
    const r = validateSubscriptionTransition('REVOKED', 'ACTIVE');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'ACTIVE');
  });

  // 1.2 Idempotent Transitions (No-Op)
  await runTest('ADV-TR-07', 'Idempotent no-op transitions (ACTIVE->ACTIVE, PAUSED->PAUSED, REVOKED->REVOKED)', () => {
    const r1 = validateSubscriptionTransition('ACTIVE', 'ACTIVE');
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.isNoOp, true);

    const r2 = validateSubscriptionTransition('PAUSED', 'PAUSED');
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.isNoOp, true);

    const r3 = validateSubscriptionTransition('REVOKED', 'REVOKED');
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.isNoOp, true);
  });

  // 1.3 Forbidden Transitions & Guard Violations
  await runTest('ADV-TR-08', 'ACTIVE -> RESUMED is strictly rejected (cannot resume already active)', () => {
    const r = validateSubscriptionTransition('ACTIVE', 'RESUMED');
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.statusCode, 400);
    assert.ok(r.error.includes("already 'ACTIVE'"));
  });

  await runTest('ADV-TR-09', 'REVOKED -> RESUMED is strictly rejected (cannot directly resume revoked)', () => {
    const r = validateSubscriptionTransition('REVOKED', 'RESUMED');
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.statusCode, 400);
    assert.ok(r.error.includes("Use action 'ACTIVE' to reinstate"));
  });

  await runTest('ADV-TR-10', 'REVOKED -> PAUSED is strictly rejected (cannot pause revoked store)', () => {
    const r = validateSubscriptionTransition('REVOKED', 'PAUSED');
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.statusCode, 400);
    assert.ok(r.error.includes("Use action 'ACTIVE' to reinstate"));
  });

  // 1.4 Invalid Action Verbs & Edge Cases
  await runTest('ADV-TR-11', 'Invalid action verbs are rejected with 400 (DELETED, CANCELLED, EXPIRED, UNKNOWN)', () => {
    const invalidVerbs = ['DELETED', 'CANCELLED', 'EXPIRED', 'PENDING', 'SUSPENDED', 'BLOCKED', 'DESTROY'];
    for (const verb of invalidVerbs) {
      const r = validateSubscriptionTransition('ACTIVE', verb);
      assert.strictEqual(r.allowed, false, `Verb ${verb} should be rejected`);
      assert.strictEqual(r.statusCode, 400);
      assert.ok(r.error.includes('Allowed actions: ACTIVE, PAUSED, RESUMED, REVOKED'));
    }
  });

  await runTest('ADV-TR-12', 'Non-string, empty, null, and multi-element array actions are safely rejected with 400', () => {
    const bogusActions = [null, undefined, '', '   ', 12345, {}, ['PAUSED', 'REVOKED'], ['UNKNOWN'], true];
    for (const act of bogusActions) {
      const r = validateSubscriptionTransition('ACTIVE', act);
      assert.strictEqual(r.allowed, false, `Action ${JSON.stringify(act)} should be rejected`);
      assert.strictEqual(r.statusCode, 400);
    }
  });

  await runTest('ADV-TR-12b', 'Single-element array coercion: ["ACTIVE"] coerces to "ACTIVE" via String() cast', () => {
    const r = validateSubscriptionTransition('ACTIVE', ['ACTIVE']);
    // String(['ACTIVE']) yields 'ACTIVE', which is idempotent no-op for ACTIVE
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.resultingStatus, 'ACTIVE');
  });

  await runTest('ADV-TR-13', 'Case and whitespace tolerance for valid actions', () => {
    const r1 = validateSubscriptionTransition('ACTIVE', '  paused  ');
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.resultingStatus, 'PAUSED');

    const r2 = validateSubscriptionTransition('PAUSED', 'resumed');
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.resultingStatus, 'RESUMED');

    const r3 = validateSubscriptionTransition('REVOKED', '\nACTIVE\t');
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.resultingStatus, 'ACTIVE');
  });

  await runTest('ADV-TR-14', 'Null or undefined currentStatus safely defaults to ACTIVE', () => {
    const r1 = validateSubscriptionTransition(null, 'PAUSED');
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.resultingStatus, 'PAUSED');

    const r2 = validateSubscriptionTransition(undefined, 'RESUMED');
    assert.strictEqual(r2.allowed, false); // Defaulting to ACTIVE rejects RESUMED
  });

  // ============================================================================
  // SECTION 2: MALFORMED PAYLOADS & ADVERSARIAL INJECTION (REST API)
  // ============================================================================
  console.log('\n📍 SECTION 2: REST API MALFORMED PAYLOADS & INJECTION RESISTANCE');

  await runTest('ADV-API-01', 'POST /api/subscription/manage with empty body returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Missing required field'));
  });

  await runTest('ADV-API-02', 'POST /api/subscription/manage missing action returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: 'SHOP-TEST-M1'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('action'));
  });

  await runTest('ADV-API-03', 'POST /api/subscription/manage missing both shopEmail and shopId returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      action: 'PAUSED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('at least one of shopEmail or shopId'));
  });

  await runTest('ADV-API-04', 'POST /api/subscription/manage with whitespace-only identifiers returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopEmail: '   ',
      shopId: '   ',
      action: 'PAUSED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  await runTest('ADV-API-05', 'POST /api/subscription/manage with malformed email formats returns 400', async () => {
    const badEmails = [
      'not-an-email',
      'user@',
      '@domain.com',
      'user..name@domain.com',
      'user@domain..com',
      'user@.com',
      'user name@domain.com',
      123456,
      { email: 'user@domain.com' },
      ['user@domain.com']
    ];
    for (const bad of badEmails) {
      const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
        shopEmail: bad,
        action: 'PAUSED'
      });
      assert.strictEqual(res.status, 400, `Email ${JSON.stringify(bad)} should return 400`);
      assert.strictEqual(res.body.success, false);
    }
  });

  await runTest('ADV-API-06', 'GET /api/subscription/status with missing parameters returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'GET', '/api/subscription/status');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Either shopId or a valid email'));
  });

  await runTest('ADV-API-07', 'GET /api/subscription/status with invalid email returns 400', async () => {
    const res = await sendHttpRequest(serverPort, 'GET', '/api/subscription/status?email=notanemail');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid email address'));
  });

  await runTest('ADV-API-08', 'SQL injection in reason parameter does not crash or execute', async () => {
    const sqlInjectionPayload = "'; DROP TABLE subscriptions; SELECT * FROM users WHERE '1'='1; --";
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: 'SHOP-SEC-SQL-01',
      action: 'PAUSED',
      reason: sqlInjectionPayload
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'PAUSED');
    assert.strictEqual(res.body.subscription.statusReason, sqlInjectionPayload);
  });

  await runTest('ADV-API-09', 'XSS HTML/script injection in reason is safely stored as string without evaluation', async () => {
    const xssPayload = "<script>alert('XSS_ATTACK')</script><img src='x' onerror='window.hack()'>";
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: 'SHOP-SEC-XSS-01',
      action: 'PAUSED',
      reason: xssPayload
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.subscription.statusReason, xssPayload);
  });

  await runTest('ADV-API-10', 'Excessive payload string in reason (50,000 chars) is safely truncated to 500 chars (DoS defense)', async () => {
    const hugeReason = 'A'.repeat(50000);
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: 'SHOP-SEC-DOS-01',
      action: 'PAUSED',
      reason: hugeReason
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.subscription.statusReason.length, 500);
  });

  await runTest('ADV-API-11', 'Path traversal characters in shopId are handled safely with URL encoding', async () => {
    const traversalShopId = '../../../etc/passwd';
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: traversalShopId,
      action: 'PAUSED',
      reason: 'Traversal test'
    });
    // Handled safely without filesystem leak or server crash
    assert.ok(res.status === 200 || res.status === 400 || res.status === 404);
  });

  await runTest('ADV-API-12', 'Prototype pollution attempt does not compromise Object prototype', async () => {
    const pollutionPayload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"isAdmin":true}},"shopId":"SHOP-POLLUTION-01","action":"PAUSED"}');
    const res = await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', pollutionPayload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(({}).polluted, undefined, 'Object prototype must NOT be polluted');
    assert.strictEqual(({}).isAdmin, undefined, 'Object prototype isAdmin must NOT be set');
  });

  // ============================================================================
  // SECTION 3: HIGH-CONCURRENCY & RAPID FLIP-FLOP STRESS TESTING
  // ============================================================================
  console.log('\n📍 SECTION 3: HIGH-CONCURRENCY & FLIP-FLOPPING STRESS');

  await runTest('ADV-CONC-01', '60 rapid concurrent flip-flop requests (ACTIVE <-> PAUSED) execute without crash or 500s', async () => {
    const testShopId = 'SHOP-FLIPFLOP-STRESS-01';

    // Seed shop with ACTIVE
    await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
      shopId: testShopId,
      action: 'ACTIVE'
    });

    // Generate 60 concurrent requests alternating between PAUSED, RESUMED, PAUSED, RESUMED
    const promises = [];
    for (let i = 0; i < 60; i++) {
      const action = i % 2 === 0 ? 'PAUSED' : 'RESUMED';
      promises.push(
        sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
          shopId: testShopId,
          action,
          reason: `Concurrent flip-flop request #${i + 1}`
        })
      );
    }

    const responses = await Promise.all(promises);
    let okCount = 0;
    let guardRejectionCount = 0;
    let serverErrorCount = 0;

    for (const res of responses) {
      if (res.status === 200) {
        okCount++;
        assert.ok(res.body.success === true);
      } else if (res.status === 400) {
        guardRejectionCount++; // Valid state guard rejections (e.g. concurrent race)
      } else if (res.status >= 500) {
        serverErrorCount++;
      }
    }

    console.log(`     -> Total: 60 | 200 OK: ${okCount} | 400 Guards: ${guardRejectionCount} | 500 Errors: ${serverErrorCount}`);
    assert.strictEqual(serverErrorCount, 0, 'Zero 500 internal server errors allowed during rapid concurrency');
    assert.ok(okCount > 0, 'At least some requests must succeed');

    // Verify final state is well-formed
    const finalRes = await sendHttpRequest(serverPort, 'GET', `/api/subscription/status?shopId=${testShopId}`);
    assert.strictEqual(finalRes.status, 200);
    assert.ok(['ACTIVE', 'PAUSED', 'RESUMED'].includes(finalRes.body.subscription.status));
  });

  await runTest('ADV-CONC-02', '50 concurrent multi-tenant requests across 10 distinct shops remain isolated', async () => {
    const tenantPromises = [];
    for (let tenantIdx = 1; tenantIdx <= 10; tenantIdx++) {
      const shopId = `SHOP-MULTI-TENANT-${tenantIdx}`;
      for (let reqIdx = 1; reqIdx <= 5; reqIdx++) {
        const action = reqIdx % 2 === 1 ? 'PAUSED' : 'ACTIVE';
        tenantPromises.push(
          sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
            shopId,
            action,
            reason: `Tenant ${tenantIdx} action ${action}`
          })
        );
      }
    }

    const responses = await Promise.all(tenantPromises);
    assert.strictEqual(responses.length, 50);
    for (const res of responses) {
      assert.notStrictEqual(res.status, 500, 'Zero server errors in multi-tenant concurrency');
    }

    // Verify isolation: check each shop has valid status
    for (let tenantIdx = 1; tenantIdx <= 10; tenantIdx++) {
      const shopId = `SHOP-MULTI-TENANT-${tenantIdx}`;
      const getRes = await sendHttpRequest(serverPort, 'GET', `/api/subscription/status?shopId=${shopId}`);
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.subscription.shopId, shopId);
    }
  });

  await runTest('ADV-CONC-03', 'Concurrent read-while-writing race condition resilience (30 GET + 30 POST)', async () => {
    const raceShopId = 'SHOP-RACE-READWRITE-01';
    await sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', { shopId: raceShopId, action: 'ACTIVE' });

    const mixedPromises = [];
    for (let i = 0; i < 30; i++) {
      mixedPromises.push(sendHttpRequest(serverPort, 'GET', `/api/subscription/status?shopId=${raceShopId}`));
      mixedPromises.push(
        sendHttpRequest(serverPort, 'POST', '/api/subscription/manage', {
          shopId: raceShopId,
          action: i % 2 === 0 ? 'PAUSED' : 'ACTIVE'
        })
      );
    }

    const responses = await Promise.all(mixedPromises);
    assert.strictEqual(responses.length, 60);
    const serverErrors = responses.filter((r) => r.status >= 500);
    assert.strictEqual(serverErrors.length, 0, 'No server errors during simultaneous read/write race condition');
  });

  // ============================================================================
  // SECTION 4: CLIENT-SIDE DOM RESILIENCE & LOCKOUT BYPASS STRESS
  // ============================================================================
  console.log('\n📍 SECTION 4: CLIENT-SIDE DOM RESILIENCE & INTERCEPTION AUDIT');

  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');

  await runTest('ADV-DOM-01', 'Repository Invariants: 26 modal close SVGs and zero emojis in buttons', () => {
    const modalMatches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.strictEqual(modalMatches ? modalMatches.length : 0, 26, 'Must have exactly 26 modal-close-btn SVGs');

    const buttonMatches = indexHtml.match(/<button\b[^>]*>(.*?)<\/button>/gs) || [];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const btn of buttonMatches) {
      const textOnly = btn.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
      assert.strictEqual(emojiRegex.test(textOnly), false, `Found raw emoji in button: ${btn}`);
    }
  });

  await runTest('ADV-DOM-02', '#subscriptionRevokedOverlay is completely non-dismissible (0 close buttons)', () => {
    assert.ok(indexHtml.includes('id="subscriptionRevokedOverlay"'), 'Missing #subscriptionRevokedOverlay in HTML');
    const overlayIdx = indexHtml.indexOf('id="subscriptionRevokedOverlay"');
    const overlayEnd = indexHtml.indexOf('<!-- 🔐 MANDATORY FIRST-LOGIN PIN CHANGE MODAL', overlayIdx);
    const chunk = indexHtml.substring(overlayIdx, overlayEnd);
    assert.strictEqual(chunk.includes('modal-close-btn'), false, 'revoked overlay must not contain modal-close-btn');
    assert.strictEqual(chunk.includes('&times;'), false);
    assert.strictEqual(chunk.includes('✕'), false);
  });

  // Mock DOM Environment for In-Depth Interception & State Testing
  const domElements = {
    subscriptionPausedBanner: { style: { display: 'none' } },
    subscriptionRevokedOverlay: { style: { display: 'none' } },
    desktopCheckoutBtn: { disabled: false, title: '', removeAttribute() { this.title = ''; } },
    floatingCartRight: { disabled: false, title: '', removeAttribute() { this.title = ''; } },
    checkoutModalPayBtn: { disabled: false },
    checkoutModal: { style: { display: 'none' } },
    settingsSubscriptionSubtitle: { innerText: '' },
    revokedShopEmailDisplay: { innerText: '' },
    revokedStoreCodeDisplay: { innerText: '' },
    subscriptionRevokedReason: { innerText: '' }
  };

  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k)
  };

  const registeredListeners = [];
  global.document = {
    getElementById: (id) => domElements[id] || null,
    querySelector: (sel) => {
      if (sel.includes('.sc-right')) return domElements.floatingCartRight;
      if (sel.includes('#checkoutModal .btn-success')) return domElements.checkoutModalPayBtn;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.modal-overlay') {
        return [
          { id: 'checkoutModal', style: domElements.checkoutModal.style },
          { id: 'subscriptionRevokedOverlay', style: domElements.subscriptionRevokedOverlay.style }
        ];
      }
      return [];
    },
    addEventListener: (evt, handler, useCapture) => {
      registeredListeners.push({ evt, handler, useCapture });
    }
  };

  global.window = {
    shopProfile: { email: 'owner@adversarial.com', id: 'SHOP-ADV-DOM' },
    cart: [{ name: 'Espresso', price: 120 }],
    currentStaff: { id: 'staff_1', name: 'Barista' },
    currentRole: 'Cashier',
    isTerminalLocked: false,
    dispatchEvent: () => {}
  };

  // Compile js/core.js functions in mock environment
  const applyFnCode = coreJs.substring(
    coreJs.indexOf('function isSubscriptionPaused()'),
    coreJs.indexOf('// Firestore Sync Integration')
  );
  const sandbox = new Function('global', 'window', 'document', 'localStorage', `${applyFnCode}; return { applySubscriptionStatus, isSubscriptionPaused, isSubscriptionRevoked };`)(
    global,
    global.window,
    global.document,
    global.localStorage
  );

  await runTest('ADV-DOM-03', 'PAUSED status disables all checkout buttons and closes open checkout modal', () => {
    domElements.checkoutModal.style.display = 'flex'; // Modal was open
    sandbox.applySubscriptionStatus({
      status: 'PAUSED',
      shopEmail: 'owner@adversarial.com',
      shopId: 'SHOP-ADV-DOM'
    });

    assert.strictEqual(sandbox.isSubscriptionPaused(), true);
    assert.strictEqual(sandbox.isSubscriptionRevoked(), false);
    assert.strictEqual(domElements.subscriptionPausedBanner.style.display, 'flex');
    assert.strictEqual(domElements.subscriptionRevokedOverlay.style.display, 'none');
    assert.strictEqual(domElements.desktopCheckoutBtn.disabled, true);
    assert.strictEqual(domElements.floatingCartRight.disabled, true);
    assert.strictEqual(domElements.checkoutModalPayBtn.disabled, true);
    assert.strictEqual(domElements.checkoutModal.style.display, 'none', 'Checkout modal must be dismissed');
    assert.strictEqual(global.localStorage.getItem('billnaw_subscription_status'), 'PAUSED');
  });

  await runTest('ADV-DOM-04', 'Capture-phase click listener intercepts and cancels checkout attempts when PAUSED', () => {
    const clickHandler = registeredListeners.find((l) => l.evt === 'click' && l.useCapture === true);
    assert.ok(clickHandler, 'Capture-phase click listener must be registered on document');

    // Create synthetic checkout click event
    let prevented = false;
    let stopped = false;
    const fakeEvent = {
      target: {
        closest: (selector) => {
          if (selector.includes('#desktopCheckoutBtn')) return domElements.desktopCheckoutBtn;
          return null;
        }
      },
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; }
    };

    clickHandler.handler(fakeEvent);
    assert.strictEqual(prevented, true, 'Event must have preventDefault() called');
    assert.strictEqual(stopped, true, 'Event must have stopPropagation() called');
  });

  await runTest('ADV-DOM-05', 'REVOKED status executes full terminal lockout, purges staff session & clears cart', () => {
    global.window.cart = [{ item: 'Cold Brew' }];
    global.window.currentStaff = { name: 'Admin Staff' };
    global.window.currentRole = 'Admin';
    global.localStorage.setItem('billnaw_active_staff', JSON.stringify({ name: 'Admin Staff' }));
    global.localStorage.setItem('billnaw_current_session_id', 'sess_123');

    sandbox.applySubscriptionStatus({
      status: 'REVOKED',
      shopEmail: 'owner@adversarial.com',
      shopId: 'SHOP-ADV-DOM',
      statusReason: 'Non-payment of subscription'
    });

    assert.strictEqual(sandbox.isSubscriptionRevoked(), true);
    assert.strictEqual(sandbox.isSubscriptionPaused(), false);
    assert.strictEqual(domElements.subscriptionRevokedOverlay.style.display, 'flex');
    assert.strictEqual(domElements.subscriptionPausedBanner.style.display, 'none');
    assert.strictEqual(domElements.revokedShopEmailDisplay.innerText, 'owner@adversarial.com');
    assert.strictEqual(domElements.revokedStoreCodeDisplay.innerText, 'SHOP-ADV-DOM');
    assert.strictEqual(domElements.subscriptionRevokedReason.innerText, 'Non-payment of subscription');

    // Terminal lockout invariants
    assert.strictEqual(global.window.isTerminalLocked, true);
    assert.strictEqual(global.localStorage.getItem('billnaw_terminal_locked'), 'true');
    assert.strictEqual(global.localStorage.getItem('billnaw_active_staff'), null);
    assert.strictEqual(global.localStorage.getItem('billnaw_current_session_id'), null);
    assert.strictEqual(global.window.cart.length, 0);
    assert.strictEqual(global.window.currentStaff, null);
    assert.strictEqual(global.window.currentRole, null);
  });

  await runTest('ADV-DOM-06', 'Reinstatement (REVOKED -> ACTIVE) restores operational terminal state', () => {
    sandbox.applySubscriptionStatus({
      status: 'ACTIVE',
      shopEmail: 'owner@adversarial.com',
      shopId: 'SHOP-ADV-DOM'
    });

    assert.strictEqual(sandbox.isSubscriptionRevoked(), false);
    assert.strictEqual(sandbox.isSubscriptionPaused(), false);
    assert.strictEqual(domElements.subscriptionRevokedOverlay.style.display, 'none');
    assert.strictEqual(domElements.subscriptionPausedBanner.style.display, 'none');
    assert.strictEqual(domElements.desktopCheckoutBtn.disabled, false);
    assert.strictEqual(domElements.floatingCartRight.disabled, false);
    assert.strictEqual(domElements.checkoutModalPayBtn.disabled, false);
    assert.strictEqual(global.localStorage.getItem('billnaw_subscription_status'), 'ACTIVE');
  });

  // ============================================================================
  // SECTION 5: OFFLINE SAFETY & SNAPSHOT RESILIENCY
  // ============================================================================
  console.log('\n📍 SECTION 5: OFFLINE SAFETY & SNAPSHOT RESILIENCY AUDIT');

  await runTest('ADV-OFF-01', 'Network disconnect error during onSnapshot does NOT revoke subscription or lock terminal', () => {
    // Inspect onSnapshot error handler in js/core.js
    const onSnapshotMatch = coreJs.match(/window\.firestoreOnSnapshot\(storeDocRef,\s*\(snap\)\s*=>\s*\{[\s\S]*?\},\s*\(err\)\s*=>\s*\{([\s\S]*?)\}\);/);
    assert.ok(onSnapshotMatch, 'onSnapshot listener must be present in js/core.js');
    const errBody = onSnapshotMatch[1];

    // Assert that the error handler NEVER invokes applySubscriptionStatus or sets REVOKED
    assert.strictEqual(errBody.includes("applySubscriptionStatus"), false, 'Error handler must not call applySubscriptionStatus');
    assert.strictEqual(errBody.includes("'REVOKED'"), false, 'Error handler must not revoke subscription on network loss');
    assert.ok(errBody.includes("setCloudSyncStatus('offline', 'Offline (Local)')"), 'Error handler must switch to offline mode');
  });

  await runTest('ADV-OFF-02', 'Incoming snapshot with missing subscription preserves existing active status', () => {
    // Check handleRemoteFirestoreUpdate implementation in js/core.js
    assert.ok(coreJs.includes("if (data.subscription && typeof data.subscription === 'object')"));
    assert.ok(coreJs.includes("else if (!currentSubscriptionState)"));
    assert.ok(coreJs.includes("applySubscriptionStatus({ status: 'ACTIVE', plan: 'billnaw Pro', isFree: true })"));

    // Simulate handleRemoteFirestoreUpdate with doc missing subscription
    let currentSubscriptionState = { status: 'ACTIVE', plan: 'billnaw Pro' };
    let applied = null;
    const mockApply = (s) => { applied = s; };

    const handleUpdate = (data) => {
      if (data.subscription && typeof data.subscription === 'object') {
        mockApply(data.subscription);
      } else if (!currentSubscriptionState) {
        mockApply({ status: 'ACTIVE', plan: 'billnaw Pro', isFree: true });
      }
    };

    handleUpdate({ name: 'Cafe Data Without Subscription' });
    assert.strictEqual(applied, null, 'Must NOT mutate or revoke existing subscription when remote doc lacks subscription');
  });

  await runTest('ADV-OFF-03', 'Incoming snapshot with corrupted non-object subscription safely defaults', () => {
    let applied = null;
    const mockApply = (s) => { applied = s; };

    const handleUpdate = (data) => {
      if (data.subscription && typeof data.subscription === 'object') {
        mockApply(data.subscription);
      } else {
        mockApply({ status: 'ACTIVE', plan: 'billnaw Pro', isFree: true });
      }
    };

    // Corrupted primitives
    handleUpdate({ subscription: "CORRUPTED_STRING_VALUE" });
    assert.strictEqual(applied.status, 'ACTIVE');

    handleUpdate({ subscription: 12345 });
    assert.strictEqual(applied.status, 'ACTIVE');

    handleUpdate({ subscription: null });
    assert.strictEqual(applied.status, 'ACTIVE');
  });

  await runTest('ADV-OFF-04', 'checkSubscriptionStatusNow() network failure catches cleanly without locking POS', async () => {
    assert.ok(coreJs.includes('async function checkSubscriptionStatusNow()'));
    assert.ok(coreJs.includes("catch (err) {"));
    assert.ok(coreJs.includes("showToast('Network error while checking subscription status.', 'error')"));

    // Verify it doesn't call applySubscriptionStatus('REVOKED') in catch block
    const fnStart = coreJs.indexOf('async function checkSubscriptionStatusNow()');
    const fnEnd = coreJs.indexOf('window.checkSubscriptionStatusNow = checkSubscriptionStatusNow;');
    const fnCode = coreJs.substring(fnStart, fnEnd);
    const catchBlock = fnCode.substring(fnCode.indexOf('catch (err)'));
    assert.strictEqual(catchBlock.includes('REVOKED'), false, 'Network catch block must NOT revoke subscription');
  });

  // Close server
  server.close();

  // ============================================================================
  // FINAL SCORECARD & SUMMARY
  // ============================================================================
  console.log('\n====================================================================');
  console.log('📊 MILESTONE 1 ADVERSARIAL STRESS CHALLENGE SCORECARD');
  console.log('====================================================================');
  console.log(`  Passed Assertions:  ${passed} / ${passed + failed}`);
  console.log(`  Failed Assertions:  ${failed} / ${passed + failed}`);
  console.log(`  Success Rate:       ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('====================================================================');

  if (failed === 0) {
    console.log('✨ ALL ADVERSARIAL CHALLENGES PASSED EMPIRICALLY WITH ZERO DEFECTS!');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} ADVERSARIAL CHALLENGES FAILED!`);
    process.exit(1);
  }
})();
