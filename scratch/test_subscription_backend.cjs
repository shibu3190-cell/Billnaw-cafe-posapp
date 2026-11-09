// scratch/test_subscription_backend.cjs
// Tests backend subscription state machine, input validation, and transition guards

const assert = require('assert');

(async () => {
  console.log('====================================================');
  console.log('💳 TESTING BACKEND SUBSCRIPTION SERVICE & TRANSITION GUARDS');
  console.log('====================================================\n');

  const {
    createDefaultSubscription,
    validateSubscriptionTransition
  } = await import('../server/subscription-service.js');

  // 1. Default subscription factory
  const defaultSub = createDefaultSubscription('SHOP-TEST-01', 'test@cafe.com');
  assert.strictEqual(defaultSub.status, 'ACTIVE');
  assert.strictEqual(defaultSub.shopEmail, 'test@cafe.com');
  assert.strictEqual(defaultSub.shopId, 'SHOP-TEST-01');
  assert.strictEqual(defaultSub.isFree, true);
  assert.strictEqual(defaultSub.features.aiMenuScansPerMonth, 15);
  console.log('✅ PASS: Default subscription initialized properly');

  // 2. Allowed transitions
  // ACTIVE -> PAUSED
  let t = validateSubscriptionTransition('ACTIVE', 'PAUSED');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'PAUSED');
  console.log('✅ PASS: ACTIVE -> PAUSED allowed');

  // PAUSED -> RESUMED
  t = validateSubscriptionTransition('PAUSED', 'RESUMED');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'RESUMED');
  console.log('✅ PASS: PAUSED -> RESUMED allowed');

  // PAUSED -> ACTIVE
  t = validateSubscriptionTransition('PAUSED', 'ACTIVE');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'ACTIVE');
  console.log('✅ PASS: PAUSED -> ACTIVE allowed');

  // ACTIVE -> REVOKED
  t = validateSubscriptionTransition('ACTIVE', 'REVOKED');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'REVOKED');
  console.log('✅ PASS: ACTIVE -> REVOKED allowed');

  // PAUSED -> REVOKED
  t = validateSubscriptionTransition('PAUSED', 'REVOKED');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'REVOKED');
  console.log('✅ PASS: PAUSED -> REVOKED allowed');

  // REVOKED -> ACTIVE
  t = validateSubscriptionTransition('REVOKED', 'ACTIVE');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.resultingStatus, 'ACTIVE');
  console.log('✅ PASS: REVOKED -> ACTIVE allowed (reinstatement)');

  // Idempotent
  t = validateSubscriptionTransition('ACTIVE', 'ACTIVE');
  assert.strictEqual(t.allowed, true);
  assert.strictEqual(t.isNoOp, true);
  console.log('✅ PASS: ACTIVE -> ACTIVE idempotent no-op');

  // 3. Guard violations
  // ACTIVE -> RESUMED (cannot resume already active)
  t = validateSubscriptionTransition('ACTIVE', 'RESUMED');
  assert.strictEqual(t.allowed, false);
  assert.strictEqual(t.statusCode, 400);
  assert.ok(t.error.includes('already'));
  console.log('✅ PASS: ACTIVE -> RESUMED correctly rejected with 400 guard violation');

  // RESUMED -> RESUMED (cannot resume already resumed)
  t = validateSubscriptionTransition('RESUMED', 'RESUMED');
  assert.strictEqual(t.allowed, true); // Same status is idempotent no-op
  console.log('✅ PASS: RESUMED -> RESUMED idempotent no-op');

  // REVOKED -> RESUMED (cannot directly resume revoked)
  t = validateSubscriptionTransition('REVOKED', 'RESUMED');
  assert.strictEqual(t.allowed, false);
  assert.strictEqual(t.statusCode, 400);
  assert.ok(t.error.includes('REVOKED'));
  console.log('✅ PASS: REVOKED -> RESUMED correctly rejected with 400 guard violation');

  // REVOKED -> PAUSED (cannot pause revoked)
  t = validateSubscriptionTransition('REVOKED', 'PAUSED');
  assert.strictEqual(t.allowed, false);
  assert.strictEqual(t.statusCode, 400);
  assert.ok(t.error.includes('REVOKED'));
  console.log('✅ PASS: REVOKED -> PAUSED correctly rejected with 400 guard violation');

  // Invalid action enum
  t = validateSubscriptionTransition('ACTIVE', 'UNKNOWN_ACTION');
  assert.strictEqual(t.allowed, false);
  assert.strictEqual(t.statusCode, 400);
  console.log('✅ PASS: Invalid action correctly rejected with 400');

  console.log('\n🎯 ALL SUBSCRIPTION BACKEND STATE TESTS PASSED 100%!');
  process.exit(0);
})();
