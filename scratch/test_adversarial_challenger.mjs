// scratch/test_adversarial_challenger.mjs
// Adversarial Empirical Attack Harness & Invariant Audit
// Teamwork Preview Challenger 1

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import http from 'http';
import express from 'express';
import { fileURLToPath } from 'url';

import {
  sendOtp,
  verifyOtp,
  registerUser,
  loginWithPassword,
  verifySession,
  resetAuthStore,
  normalizeEmail,
  isValidEmail,
  hashPassword,
  generateStoreCode,
  createCustomAuthToken
} from '../server/auth-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('⚔️  EMPIRICAL ADVERSARIAL CHALLENGER AUDIT');
console.log('Attacks: Rate Limiting, Replay, Brute-Force, Injection, Invariants');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function challenge(title, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${title}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
    failures.push({ title, error: err.message, stack: err.stack });
  }
}

// -------------------------------------------------------------
// SETUP EPHEMERAL EXPRESS HTTP SERVER FOR LIVE NETWORK AUDIT
// -------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/api/auth/send-otp', (req, res) => {
  try {
    const { email, purpose } = req.body || {};
    const result = sendOtp(email, purpose);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { email, otp, shopName } = req.body || {};
    const result = verifyOtp(email, otp, shopName);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/auth/signup', '/api/auth/register'], (req, res) => {
  try {
    const result = registerUser(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/auth/login', '/api/auth/login-password'], (req, res) => {
  try {
    const result = loginWithPassword(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.all('/api/auth/session', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader || req.headers['x-session-token'] || req.query.token || req.body?.token;
    const result = verifySession(token);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function postHttp(baseUrl, endpoint, data) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function runAllChallenges() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[TEST HARNESS] Live ephemeral server running on ${baseUrl}\n`);

  try {
    // =========================================================
    // SECTION 1: INVARIANT VERIFICATION
    // =========================================================
    console.log('📍 SECTION 1: INVARIANT VERIFICATION (Exact 26 SVG, 0 Raw ✕, #shopAuthModal isolation)');
    const indexHtmlPath = path.join(rootDir, 'index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    await challenge('INV-AUDIT-01: index.html contains EXACTLY 26 SVG modal close buttons matching regex', () => {
      const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
      const matches = indexHtml.match(regex);
      assert.ok(matches, 'No modal close button matches found');
      assert.strictEqual(
        matches.length,
        26,
        `Expected exactly 26 SVG modal-close-btn occurrences, but found ${matches.length}`
      );
    });

    await challenge('INV-AUDIT-02: Zero raw unicode "✕" characters inside modal-close-btn in index.html', () => {
      const rawRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[^<]*✕[^<]*<\/button>/g;
      const rawMatches = indexHtml.match(rawRegex);
      assert.strictEqual(
        rawMatches,
        null,
        `Found forbidden raw ✕ modal-close-btn: ${JSON.stringify(rawMatches)}`
      );
    });

    await challenge('INV-AUDIT-03: #shopAuthModal NEVER uses class modal-close-btn', () => {
      const modalRegex = /<div\b[^>]*id=["']shopAuthModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i;
      const modalMatch = indexHtml.match(modalRegex);
      assert.ok(modalMatch, 'Could not locate #shopAuthModal container in index.html');
      const modalContent = modalMatch[0];
      const hasForbiddenClass = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/.test(modalContent);
      assert.strictEqual(
        hasForbiddenClass,
        false,
        'CRITICAL VIOLATION: #shopAuthModal contains forbidden class modal-close-btn'
      );
    });

    await challenge('INV-AUDIT-04: Total modal-close-btn class occurrences across index.html is exactly 26', () => {
      const allClassMatches = indexHtml.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
      assert.ok(allClassMatches, 'No modal-close-btn classes found');
      assert.strictEqual(
        allClassMatches.length,
        26,
        `Expected total modal-close-btn class count to be 26, got ${allClassMatches.length}`
      );
    });

    // =========================================================
    // SECTION 2: ATTACK VECTOR 1 — RAPID CONCURRENT OTP REQUESTS (HTTP 429)
    // =========================================================
    console.log('\n📍 SECTION 2: ATTACK VECTOR 1 — RAPID CONCURRENT OTP REQUESTS (HTTP 429)');
    resetAuthStore();

    await challenge('V1-CONCUR-01: Rapid 10 concurrent requests to /api/auth/send-otp enforce 429 rate limit', async () => {
      const targetEmail = `stress_concurrent_${Date.now()}@billnawcafe.com`;
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(postHttp(baseUrl, '/api/auth/send-otp', { email: targetEmail, purpose: 'login' }));
      }
      const results = await Promise.all(promises);

      const successResults = results.filter(r => r.status === 200);
      const rateLimitedResults = results.filter(r => r.status === 429);

      assert.strictEqual(successResults.length, 1, `Expected exactly 1 request to succeed (200), got ${successResults.length}`);
      assert.strictEqual(rateLimitedResults.length, 9, `Expected exactly 9 requests to be rate-limited (429), got ${rateLimitedResults.length}`);

      for (const limited of rateLimitedResults) {
        assert.strictEqual(limited.body.success, false);
        assert.ok(limited.body.error.includes('Rate limited'));
        assert.ok(typeof limited.body.retryAfter === 'number' && limited.body.retryAfter >= 50 && limited.body.retryAfter <= 60);
      }
    });

    await challenge('V1-CONCUR-02: Rate limit on Email A does NOT block concurrent request for Email B (Isolation)', async () => {
      const emailA = `isolated_a_${Date.now()}@billnawcafe.com`;
      const emailB = `isolated_b_${Date.now()}@billnawcafe.com`;

      const resA1 = await postHttp(baseUrl, '/api/auth/send-otp', { email: emailA });
      assert.strictEqual(resA1.status, 200, 'Email A first request should be 200');

      const resA2 = await postHttp(baseUrl, '/api/auth/send-otp', { email: emailA });
      assert.strictEqual(resA2.status, 429, 'Email A second request should be 429');

      const resB1 = await postHttp(baseUrl, '/api/auth/send-otp', { email: emailB });
      assert.strictEqual(resB1.status, 200, 'Email B first request must succeed (200) despite Email A being rate limited');
    });

    // =========================================================
    // SECTION 3: ATTACK VECTOR 2 — REPLAY ATTACKS ON CONSUMED OTPs
    // =========================================================
    console.log('\n📍 SECTION 3: ATTACK VECTOR 2 — REPLAY ATTACKS ON CONSUMED OTPs (HTTP 400)');

    await challenge('V2-REPLAY-01: Successfully consumed OTP cannot be replayed (HTTP 400 on subsequent attempts)', async () => {
      const replayEmail = `replay_test_${Date.now()}@billnawcafe.com`;
      const sendRes = await postHttp(baseUrl, '/api/auth/send-otp', { email: replayEmail });
      assert.strictEqual(sendRes.status, 200);
      const validOtp = sendRes.body.devOtp;
      assert.ok(validOtp, 'devOtp must be returned in test/dev mode');

      // First verification (legitimate)
      const verify1 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: replayEmail, otp: validOtp });
      assert.strictEqual(verify1.status, 200, 'Legitimate verification must succeed with 200');
      assert.ok(verify1.body.token, 'Session token must be minted');

      // Replay attempt 1 immediately
      const replay1 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: replayEmail, otp: validOtp });
      assert.strictEqual(replay1.status, 400, 'Replay attempt 1 must return 400 (consumed code)');
      assert.strictEqual(replay1.body.success, false);
      assert.strictEqual(replay1.body.error, 'Invalid or expired OTP');

      // Replay attempt 2
      const replay2 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: replayEmail, otp: validOtp });
      assert.strictEqual(replay2.status, 400, 'Replay attempt 2 must return 400 (consumed code)');
    });

    await challenge('V2-REPLAY-02: Concurrent replay attempts on single OTP yield exactly ONE 200 and all others 400', async () => {
      const raceEmail = `race_replay_${Date.now()}@billnawcafe.com`;
      const sendRes = await postHttp(baseUrl, '/api/auth/send-otp', { email: raceEmail });
      const validOtp = sendRes.body.devOtp;

      // Launch 5 concurrent verification attempts with the same valid OTP
      const verifyPromises = [];
      for (let i = 0; i < 5; i++) {
        verifyPromises.push(postHttp(baseUrl, '/api/auth/verify-otp', { email: raceEmail, otp: validOtp }));
      }
      const verifyResults = await Promise.all(verifyPromises);

      const passes = verifyResults.filter(r => r.status === 200);
      const rejections = verifyResults.filter(r => r.status === 400);

      assert.strictEqual(passes.length, 1, `Expected exactly 1 verification success, got ${passes.length}`);
      assert.strictEqual(rejections.length, 4, `Expected exactly 4 rejections, got ${rejections.length}`);
    });

    // =========================================================
    // SECTION 4: ATTACK VECTOR 3 — BRUTE-FORCE OTP ATTEMPTS (MAX 3 LOCKOUT)
    // =========================================================
    console.log('\n📍 SECTION 4: ATTACK VECTOR 3 — BRUTE-FORCE OTP ATTEMPTS (MAX 3 LOCKOUT)');

    await challenge('V3-BRUTE-01: Progressive attempt throttling: 1st (401, 2 left) -> 2nd (401, 1 left) -> 3rd (429, 0 left)', async () => {
      const bruteEmail = `bruteforce_${Date.now()}@billnawcafe.com`;
      const sendRes = await postHttp(baseUrl, '/api/auth/send-otp', { email: bruteEmail });
      assert.strictEqual(sendRes.status, 200);
      const realOtp = sendRes.body.devOtp;
      const fakeOtp = realOtp === '111111' ? '222222' : '111111';

      // Attempt 1: Wrong code
      const try1 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: bruteEmail, otp: fakeOtp });
      assert.strictEqual(try1.status, 401, 'Attempt 1 should return 401');
      assert.strictEqual(try1.body.attemptsRemaining, 2);

      // Attempt 2: Wrong code
      const try2 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: bruteEmail, otp: fakeOtp });
      assert.strictEqual(try2.status, 401, 'Attempt 2 should return 401');
      assert.strictEqual(try2.body.attemptsRemaining, 1);

      // Attempt 3: Wrong code -> Lockout!
      const try3 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: bruteEmail, otp: fakeOtp });
      assert.strictEqual(try3.status, 429, 'Attempt 3 must trigger 429 rate limit / lockout');
      assert.strictEqual(try3.body.attemptsRemaining, 0);
      assert.ok(try3.body.error.includes('Too many invalid attempts'));

      // Attempt 4: Even submitting the CORRECT OTP is now blocked because the code was invalidated
      const try4 = await postHttp(baseUrl, '/api/auth/verify-otp', { email: bruteEmail, otp: realOtp });
      assert.strictEqual(try4.status, 400, 'Submitting correct OTP after lockout must return 400 (code purged)');
      assert.strictEqual(try4.body.error, 'Invalid or expired OTP');
    });

    await challenge('V3-BRUTE-02: Adversary rapid dictionary brute force (20 random codes) is hard blocked after 3 attempts', async () => {
      const dictEmail = `dict_attack_${Date.now()}@billnawcafe.com`;
      await postHttp(baseUrl, '/api/auth/send-otp', { email: dictEmail });

      const responses = [];
      for (let i = 0; i < 20; i++) {
        const guess = String(100000 + i);
        responses.push(await postHttp(baseUrl, '/api/auth/verify-otp', { email: dictEmail, otp: guess }));
      }

      assert.strictEqual(responses[0].status, 401);
      assert.strictEqual(responses[1].status, 401);
      assert.strictEqual(responses[2].status, 429); // 3rd failed guess triggers 429
      // All subsequent 17 requests must be 400 (purged record)
      for (let i = 3; i < 20; i++) {
        assert.strictEqual(responses[i].status, 400, `Attempt ${i + 1} should be 400`);
      }
    });

    // =========================================================
    // SECTION 5: ATTACK VECTOR 4 — MALFORMED / SCRIPT INJECTION EMAILS
    // =========================================================
    console.log('\n📍 SECTION 5: ATTACK VECTOR 4 — MALFORMED / SCRIPT INJECTION EMAILS');

    const injectionPayloads = [
      "<script>alert('XSS')</script>@cafe.com",
      "<script>alert(1)</script>",
      "admin' OR '1'='1",
      "user@domain.com<script>",
      "javascript:alert(1)@test.com",
      "test..bad@example.com",
      "plainaddress",
      "@missing-username.com",
      "username@.com",
      "username@com",
      "user with spaces@example.com",
      "user\nnewline@example.com",
      "user\0nullbyte@example.com"
    ];

    for (const [idx, badPayload] of injectionPayloads.entries()) {
      await challenge(`V4-INJECT-${idx + 1}: Malformed/Injection email "${badPayload.slice(0, 25)}" is rejected with 400`, async () => {
        const res = await postHttp(baseUrl, '/api/auth/send-otp', { email: badPayload });
        assert.strictEqual(res.status, 400, `Expected 400 for bad payload: ${badPayload}`);
        assert.strictEqual(res.body.success, false);
      });
    }

    await challenge('V4-NORM-01: Whitespace padding and uppercase characters are sanitized and normalized safely', async () => {
      const rawInput = "   CAFE.OWNER.2026@BillnawCafe.COM   \t";
      const normalizedExpected = "cafe.owner.2026@billnawcafe.com";
      const res = await postHttp(baseUrl, '/api/auth/send-otp', { email: rawInput });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.email, normalizedExpected);

      // Verify OTP with rawInput also works because verifyOtp normalizes it
      const otp = res.body.devOtp;
      const verifyRes = await postHttp(baseUrl, '/api/auth/verify-otp', { email: rawInput, otp });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.shop.ownerEmail, normalizedExpected);
    });

    // =========================================================
    // SECTION 6: ATTACK VECTOR 5 — PASSWORD MISMATCH & BOUNDARIES
    // =========================================================
    console.log('\n📍 SECTION 6: ATTACK VECTOR 5 — PASSWORD MISMATCH & BOUNDARIES');

    await challenge('V5-PASS-01: Password mismatch on signup is rejected with 400 and explicit message', async () => {
      const email = `mismatch_${Date.now()}@billnawcafe.com`;
      const res = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'John',
        lastName: 'Doe',
        shopName: 'John Cafe',
        email,
        password: 'SecurePassword123!',
        confirmPassword: 'DifferentPassword456!'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, 'Passwords do not match');
    });

    await challenge('V5-PASS-02: Password below minimum 6 characters boundary (5 chars) is rejected', async () => {
      const email = `shortpass_${Date.now()}@billnawcafe.com`;
      const res = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'Jane',
        lastName: 'Doe',
        shopName: 'Jane Cafe',
        email,
        password: '12345',
        confirmPassword: '12345'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, 'Password must be at least 6 characters');
    });

    await challenge('V5-PASS-03: Password with exact boundary length 6 characters is accepted', async () => {
      const email = `exact6_${Date.now()}@billnawcafe.com`;
      const res = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'Jane',
        lastName: 'Doe',
        shopName: 'Exact Six Cafe',
        email,
        password: 'Pass6!',
        confirmPassword: 'Pass6!'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
    });

    await challenge('V5-PASS-04: Duplicate signup with same email is rejected with 400', async () => {
      const dupEmail = `dup_${Date.now()}@billnawcafe.com`;
      const first = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'First',
        shopName: 'First Cafe',
        email: dupEmail,
        password: 'Password123!'
      });
      assert.strictEqual(first.status, 200);

      const second = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'Second',
        shopName: 'Second Cafe',
        email: dupEmail,
        password: 'Password123!'
      });
      assert.strictEqual(second.status, 400);
      assert.strictEqual(second.body.error, 'An account with this email already exists');
    });

    await challenge('V5-PASS-05: Password login with wrong password returns 401 Unauthorized', async () => {
      const userEmail = `login_fail_${Date.now()}@billnawcafe.com`;
      await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'Login',
        shopName: 'Login Cafe',
        email: userEmail,
        password: 'CorrectPassword123!'
      });

      const badLogin = await postHttp(baseUrl, '/api/auth/login', {
        email: userEmail,
        password: 'WrongPassword456!'
      });
      assert.strictEqual(badLogin.status, 401);
      assert.strictEqual(badLogin.body.error, 'Invalid credentials');
    });

    await challenge('V5-PASS-06: Password login with non-existent email returns 401 Unauthorized', async () => {
      const nonExistent = `ghost_${Date.now()}@billnawcafe.com`;
      const badLogin = await postHttp(baseUrl, '/api/auth/login', {
        email: nonExistent,
        password: 'AnyPassword123!'
      });
      assert.strictEqual(badLogin.status, 401);
      assert.strictEqual(badLogin.body.error, 'Invalid credentials');
    });

    await challenge('V5-PASS-07: Missing required firstName or shopName rejected with 400', async () => {
      const missingNameRes = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: '',
        shopName: 'Shop Name',
        email: `missing_name_${Date.now()}@billnawcafe.com`,
        password: 'Password123!'
      });
      assert.strictEqual(missingNameRes.status, 400);
      assert.strictEqual(missingNameRes.body.error, 'First name is required');

      const missingShopRes = await postHttp(baseUrl, '/api/auth/signup', {
        firstName: 'Alice',
        shopName: '',
        email: `missing_shop_${Date.now()}@billnawcafe.com`,
        password: 'Password123!'
      });
      assert.strictEqual(missingShopRes.status, 400);
      assert.strictEqual(missingShopRes.body.error, 'Shop/Cafe name is required');
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    console.log('\n[TEST HARNESS] Ephemeral test server closed cleanly.');
  }

  console.log('\n====================================================');
  console.log(`🎯 EMPIRICAL CHALLENGER SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================');

  if (failedTests > 0) {
    console.error(`\n❌ VERDICT: REQUEST_CHANGES (${failedTests} tests failed)`);
    process.exitCode = 1;
  } else {
    console.log(`\n🎉 VERDICT: APPROVE (All ${totalTests} adversarial stress tests passed empirically!)`);
  }
}

runAllChallenges().catch(err => {
  console.error('Fatal test harness error:', err);
  process.exitCode = 1;
});
