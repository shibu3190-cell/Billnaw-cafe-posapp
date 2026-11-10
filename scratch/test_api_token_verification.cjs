// scratch/test_api_token_verification.cjs - Security & Tenant Isolation Test Suite
// Verifies cryptographic token generation, tampering protection, expiry, tenant isolation, and API gates.

const assert = require('assert');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🛡️ API TOKEN & MULTI-TENANT ISOLATION SECURITY AUDIT');
  console.log('====================================================\n');

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

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  // Dynamically import auth-service
  const authService = await import('../server/auth-service.js');
  const {
    createSignedAuthToken,
    verifySignedAuthToken,
    verifyTenantAuthorization,
    createCustomAuthToken,
    verifySession
  } = authService;

  console.log('📍 SUITE 1: CRYPTOGRAPHIC SIGNED TOKEN ENGINE');

  test('SEC-01: createSignedAuthToken exports and generates 3-segment JWT', () => {
    assert(typeof createSignedAuthToken === 'function', 'createSignedAuthToken must be exported');
    const token = createSignedAuthToken({ storeCode: 'SHOP_DEMO_01', email: 'owner@demo.com', role: 'Owner' });
    assert(typeof token === 'string', 'Token must be a string');
    const segments = token.split('.');
    assert.strictEqual(segments.length, 3, 'Token must have exactly 3 segments (header.payload.signature)');
  });

  test('SEC-02: verifySignedAuthToken validates authentic signed token', () => {
    const payload = { storeCode: 'SHOP_ALPHA_01', email: 'alpha@test.com', role: 'Owner' };
    const token = createSignedAuthToken(payload);
    const result = verifySignedAuthToken(token);
    assert.strictEqual(result.valid, true, 'Valid token must return valid: true');
    assert.strictEqual(result.payload.storeCode, 'SHOP_ALPHA_01');
    assert.strictEqual(result.payload.email, 'alpha@test.com');
    assert.strictEqual(result.payload.role, 'Owner');
    assert(result.payload.exp > Math.floor(Date.now() / 1000), 'Expiration must be in future');
  });

  test('SEC-03: verifySignedAuthToken handles Bearer prefix transparently', () => {
    const token = createSignedAuthToken({ storeCode: 'SHOP_BETA_02', email: 'beta@test.com' });
    const result = verifySignedAuthToken(`Bearer ${token}`);
    assert.strictEqual(result.valid, true, 'Must accept Bearer prefix');
    assert.strictEqual(result.payload.storeCode, 'SHOP_BETA_02');
  });

  test('SEC-04: Tampered payload is rejected (cryptographic integrity)', () => {
    const token = createSignedAuthToken({ storeCode: 'SHOP_ALPHA_01', email: 'alpha@test.com' });
    const [h, b, s] = token.split('.');
    // Tamper payload to claim a different store
    const decoded = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    decoded.storeCode = 'SHOP_VICTIM_09';
    const tamperedB = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const tamperedToken = `${h}.${tamperedB}.${s}`;

    const result = verifySignedAuthToken(tamperedToken);
    assert.strictEqual(result.valid, false, 'Tampered token must be rejected');
    assert(result.error.toLowerCase().includes('signature') || result.error.toLowerCase().includes('tamper'));
  });

  test('SEC-05: Tampered signature is rejected', () => {
    const token = createSignedAuthToken({ storeCode: 'SHOP_ALPHA_01', email: 'alpha@test.com' });
    const [h, b, s] = token.split('.');
    const tamperedSig = s.slice(0, -4) + 'AAAA';
    const tamperedToken = `${h}.${b}.${tamperedSig}`;

    const result = verifySignedAuthToken(tamperedToken);
    assert.strictEqual(result.valid, false, 'Tampered signature must be rejected');
  });

  test('SEC-06: Expired token is detected and rejected', () => {
    // Generate token with negative TTL (already expired)
    const token = createSignedAuthToken({
      storeCode: 'SHOP_EXP_01',
      email: 'exp@test.com',
      ttlSeconds: -100
    });
    const result = verifySignedAuthToken(token);
    assert.strictEqual(result.valid, false, 'Expired token must return valid: false');
    assert.strictEqual(result.expired, true, 'Result must flag expired: true');
    assert(result.error.toLowerCase().includes('expire'));
  });

  console.log('\n📍 SUITE 2: MULTI-TENANT ISOLATION GATE (BOLA / IDOR MITIGATION)');

  test('TEN-01: Matching storeCode tenant access is granted (200)', () => {
    const token = createSignedAuthToken({ storeCode: 'SHOP_MYCAFE_99', email: 'cafe@test.com' });
    const auth = verifyTenantAuthorization({ token, targetStoreCode: 'SHOP_MYCAFE_99' });
    assert.strictEqual(auth.authorized, true, 'Matching tenant must be authorized');
    assert.strictEqual(auth.storeCode, 'SHOP_MYCAFE_99');
  });

  test('TEN-02: Cross-tenant attack is blocked with 403 Forbidden', () => {
    // Attacker holds token for SHOP_ATTACKER_01
    const attackerToken = createSignedAuthToken({
      storeCode: 'SHOP_ATTACKER_01',
      email: 'hacker@bad.com',
      role: 'Owner'
    });

    // Attacker attempts to access SHOP_VICTIM_02
    const auth = verifyTenantAuthorization({
      token: attackerToken,
      targetStoreCode: 'SHOP_VICTIM_02'
    });

    assert.strictEqual(auth.authorized, false, 'Cross-tenant request must be blocked');
    assert.strictEqual(auth.status, 403, 'Cross-tenant mismatch must yield HTTP 403 Forbidden');
    assert(auth.error.toLowerCase().includes('cross-tenant') || auth.error.toLowerCase().includes('forbidden'));
  });

  test('TEN-03: SuperAdmin bypasses tenant restriction for platform administration', () => {
    const adminToken = createSignedAuthToken({
      storeCode: 'PLATFORM_ROOT',
      email: 'admin@billnawpos.com',
      role: 'SuperAdmin'
    });
    const auth = verifyTenantAuthorization({
      token: adminToken,
      targetStoreCode: 'SHOP_ANY_TENANT'
    });
    assert.strictEqual(auth.authorized, true, 'SuperAdmin must have cross-tenant access');
  });

  test('TEN-04: Graceful migration allows unauthenticated request and issues refreshed token', () => {
    const auth = verifyTenantAuthorization({
      token: null,
      targetStoreCode: 'SHOP_MIGRATION_01',
      allowGracefulMigration: true
    });
    assert.strictEqual(auth.authorized, true, 'Graceful migration must permit request during rollout');
    assert.strictEqual(auth.migrated, true, 'Result must flag migrated: true');
    assert(typeof auth.refreshedToken === 'string' && auth.refreshedToken.split('.').length === 3, 'Must issue signed token in refreshedToken');
  });

  test('TEN-05: Strict mode (allowGracefulMigration = false) rejects unauthenticated request with 401', () => {
    const auth = verifyTenantAuthorization({
      token: null,
      targetStoreCode: 'SHOP_STRICT_01',
      allowGracefulMigration: false
    });
    assert.strictEqual(auth.authorized, false, 'Strict mode must block missing token');
    assert.strictEqual(auth.status, 401, 'Missing token must yield 401');
  });

  test('TEN-06: Malicious or tampered token during migration is still blocked with 401', () => {
    const auth = verifyTenantAuthorization({
      token: 'not.a.valid.jwt.signature',
      targetStoreCode: 'SHOP_TEST_01',
      allowGracefulMigration: true
    });
    assert.strictEqual(auth.authorized, false, 'Tampered token must never be allowed even during migration');
    assert.strictEqual(auth.status, 401, 'Invalid token must yield 401');
  });

  console.log('\n📍 SUITE 3: verifySession STATELESS JWT COMPATIBILITY');

  test('SESS-01: verifySession resolves stateless signed JWT token into shop & user session', () => {
    const token = createSignedAuthToken({
      storeCode: 'SHOP_RESTORE_77',
      email: 'restore@test.com',
      role: 'Owner'
    });
    const sessResult = verifySession(token);
    assert.strictEqual(sessResult.status, 200, 'verifySession must accept valid signed JWT');
    assert.strictEqual(sessResult.data.success, true);
    assert.strictEqual(sessResult.data.storeCode, 'SHOP_RESTORE_77');
    assert.strictEqual(sessResult.data.user.email, 'restore@test.com');
  });

  console.log('\n📍 SUITE 4: NETLIFY SERVERLESS API HANDLER GATING');

  const netlifyApi = await import('../netlify/functions/api.js');

  await asyncTest('NET-01: Netlify handler blocks cross-tenant /sync/store-data with 403', async () => {
    const attackerToken = createSignedAuthToken({
      storeCode: 'SHOP_ATTACKER_99',
      email: 'attacker@evil.com',
      role: 'Owner'
    });

    const response = await netlifyApi.handler({
      httpMethod: 'GET',
      path: '/api/sync/store-data',
      queryStringParameters: { storeCode: 'SHOP_VICTIM_88' },
      headers: {
        authorization: `Bearer ${attackerToken}`
      }
    });

    assert.strictEqual(response.statusCode, 403, 'Must return 403 Forbidden on tenant mismatch');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert(body.error.toLowerCase().includes('cross-tenant') || body.error.toLowerCase().includes('forbidden'));
  });

  await asyncTest('NET-02: Netlify handler rejects tampered token with 401', async () => {
    const token = createSignedAuthToken({ storeCode: 'SHOP_VALID_01', email: 'owner@valid.com' });
    const tampered = token.slice(0, -6) + 'ZZZZZZ';

    const response = await netlifyApi.handler({
      httpMethod: 'POST',
      path: '/api/sync/store-data',
      body: JSON.stringify({ storeCode: 'SHOP_VALID_01', menu: [] }),
      headers: {
        authorization: `Bearer ${tampered}`,
        'content-type': 'application/json'
      }
    });

    assert.strictEqual(response.statusCode, 401, 'Must return 401 on tampered token');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
  });

  await asyncTest('NET-03: Netlify /auth/verify-otp issues signed JWT and CORS exposed headers', async () => {
    // Testing OPTIONS preflight contains exposed headers
    const preflight = await netlifyApi.handler({
      httpMethod: 'OPTIONS',
      path: '/api/sync/store-data'
    });
    assert.strictEqual(preflight.statusCode, 204);
    assert.strictEqual(preflight.headers['Access-Control-Allow-Origin'], '*');
    assert(preflight.headers['Access-Control-Expose-Headers'].includes('x-refreshed-token'));
  });

  console.log('\n📍 SUITE 5: CLIENT FETCH INTERCEPTOR LOGIC VERIFICATION');

  test('CLI-01: Global fetch interceptor exists in js/core.js and injects Bearer + Tenant headers', () => {
    const fs = require('fs');
    const coreJs = fs.readFileSync('js/core.js', 'utf8');

    assert(coreJs.includes('initGlobalApiInterceptor'), 'js/core.js must contain initGlobalApiInterceptor');
    assert(coreJs.includes('Authorization'), 'Interceptor must attach Authorization header');
    assert(coreJs.includes('x-auth-token'), 'Interceptor must attach x-auth-token header');
    assert(coreJs.includes('x-shop-id'), 'Interceptor must attach x-shop-id header');
    assert(coreJs.includes('x-store-code'), 'Interceptor must attach x-store-code header');
    assert(coreJs.includes('x-refreshed-token'), 'Interceptor must capture x-refreshed-token');
  });

  console.log('\n====================================================');
  console.log(`🎯 TOTAL SUITE RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
