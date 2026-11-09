// scratch/test_subscription_endpoints.cjs
// Tests subscription REST API endpoints by sending HTTP requests to Express server

const http = require('http');
const assert = require('assert');

(async () => {
  console.log('====================================================');
  console.log('🌐 TESTING SUBSCRIPTION REST API ENDPOINTS');
  console.log('====================================================\n');

  // Dynamically import server or initialize Express app for test
  const express = (await import('express')).default;
  const {
    getShopSubscription,
    updateShopSubscription,
    validateSubscriptionTransition
  } = await import('../server/subscription-service.js');
  const { normalizeEmail, isValidEmail } = await import('../server/auth-service.js');

  const app = express();
  app.use(express.json());

  // Mount identical endpoints as in server.js
  app.get('/api/subscription/status', async (req, res) => {
    try {
      const rawEmail = req.query.email || req.query.shopEmail;
      const rawShopId = req.query.shopId || req.query.storeCode;
      const email = rawEmail ? normalizeEmail(rawEmail) : '';
      const shopId = rawShopId ? String(rawShopId).trim() : '';

      if (!email && !shopId) {
        return res.status(400).json({ success: false, error: 'Either shopId or a valid email query parameter is required.' });
      }
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email address provided.' });
      }

      const subscription = await getShopSubscription(shopId, email);
      if (!subscription) {
        return res.status(404).json({ success: false, error: 'Shop not found for the provided identifier.' });
      }
      return res.status(200).json({ success: true, subscription });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/subscription/manage', async (req, res) => {
    try {
      const { shopEmail, shopId, action, reason, updatedBy } = req.body || {};
      const email = shopEmail ? normalizeEmail(shopEmail) : '';
      const cleanShopId = shopId ? String(shopId).trim() : '';

      if (!action || (!email && !cleanShopId)) {
        return res.status(400).json({ success: false, error: "Missing required field: action ('ACTIVE', 'PAUSED', 'RESUMED', 'REVOKED') and at least one of shopEmail or shopId." });
      }
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Invalid shopEmail address format.' });
      }

      const currentSub = await getShopSubscription(cleanShopId, email);
      if (!currentSub) {
        return res.status(404).json({ success: false, error: 'Shop not found for the provided email or shopId.' });
      }

      const transition = validateSubscriptionTransition(currentSub.status, action);
      if (!transition.allowed) {
        return res.status(transition.statusCode).json({ success: false, error: transition.error });
      }

      const updatedSub = {
        ...currentSub,
        status: transition.resultingStatus,
        statusReason: reason ? String(reason).slice(0, 500) : '',
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy || 'admin'
      };

      const propagationResult = await updateShopSubscription(updatedSub.shopId, updatedSub);

      return res.status(200).json({
        success: true,
        message: `Subscription status successfully updated to ${updatedSub.status}`,
        previousStatus: currentSub.status,
        status: updatedSub.status,
        subscription: updatedSub,
        propagated: propagationResult
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const server = app.listen(0);
  const port = server.address().port;

  function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {})
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // 1. GET status without params -> 400
    let res = await request('GET', '/api/subscription/status');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    console.log('✅ PASS: GET /api/subscription/status without params returns 400');

    // 2. GET status with invalid email -> 400
    res = await request('GET', '/api/subscription/status?email=invalid-email');
    assert.strictEqual(res.status, 400);
    console.log('✅ PASS: GET /api/subscription/status with invalid email returns 400');

    // 3. GET status with valid email -> 200 ACTIVE
    res = await request('GET', '/api/subscription/status?email=test_owner_m1@billnawcafe.com');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.subscription.status, 'ACTIVE');
    assert.strictEqual(res.data.subscription.isFree, true);
    console.log('✅ PASS: GET /api/subscription/status returns 200 with default ACTIVE subscription');

    // 4. POST manage PAUSED -> 200
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'PAUSED',
      reason: 'Administrative billing audit'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.status, 'PAUSED');
    assert.strictEqual(res.data.subscription.status, 'PAUSED');
    assert.strictEqual(res.data.subscription.statusReason, 'Administrative billing audit');
    console.log('✅ PASS: POST /api/subscription/manage with action=PAUSED returns 200');

    // 5. GET status confirms PAUSED
    res = await request('GET', '/api/subscription/status?email=test_owner_m1@billnawcafe.com');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.subscription.status, 'PAUSED');
    console.log('✅ PASS: GET confirms status transitioned to PAUSED');

    // 6. POST manage RESUMED -> 200
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'RESUMED'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'RESUMED');
    console.log('✅ PASS: POST /api/subscription/manage with action=RESUMED returns 200');

    // 7. POST manage REVOKED -> 200
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'REVOKED',
      reason: 'Policy violation'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'REVOKED');
    console.log('✅ PASS: POST /api/subscription/manage with action=REVOKED returns 200');

    // 8. Attempt RESUMED on REVOKED -> Guard rejection (400)
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'RESUMED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.error.includes('REVOKED'));
    console.log('✅ PASS: Resuming REVOKED subscription rejected with 400 guard violation');

    // 9. Reinstate REVOKED with ACTIVE -> 200
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'ACTIVE',
      reason: 'Account reinstated'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ACTIVE');
    console.log('✅ PASS: Reinstating REVOKED with ACTIVE returns 200');

    // 10. Attempt RESUMED on already ACTIVE -> Guard rejection (400)
    res = await request('POST', '/api/subscription/manage', {
      shopEmail: 'test_owner_m1@billnawcafe.com',
      action: 'RESUMED'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.error.includes('already'));
    console.log('✅ PASS: Resuming already ACTIVE subscription rejected with 400 guard violation');

    console.log('\n🎯 ALL 10 REST API ENDPOINT TESTS PASSED 100%!');
  } finally {
    server.close();
  }

  process.exit(0);
})();
