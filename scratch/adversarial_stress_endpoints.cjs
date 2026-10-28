// scratch/adversarial_stress_endpoints.cjs
// ==============================================================================
// 🛡️ ADVERSARIAL EMPIRICAL STRESS TEST HARNESS
// Testing Backend Endpoints, Rate Limiting, Security Boundaries & Secret Safety
// ==============================================================================

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const crypto = require('crypto');

console.log('==============================================================================');
console.log('⚔️  ADVERSARIAL STRESS-TESTING: BACKEND FOOD-IMAGES ENDPOINTS');
console.log('   Empirical Challenger Verification for Milestone M5');
console.log('==============================================================================\n');

const TEST_SECRET_KEY = 'AIzaSyAdversarialVerificationSecretKey12345';
process.env.GEMINI_API_KEY = TEST_SECRET_KEY;

let passedTests = 0;
let failedTests = 0;
const failureReport = [];
const allResponsePayloads = [];

function recordTest(id, description, fn) {
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${id}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${id}: ${description}`);
    console.error(`     Details: ${err.message}`);
    failureReport.push({ id, description, error: err.message });
  }
}

async function recordTestAsync(id, description, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${id}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${id}: ${description}`);
    console.error(`     Details: ${err.message}`);
    failureReport.push({ id, description, error: err.message });
  }
}

// Helper to inspect every response for secret leakage
function inspectForSecretLeakage(responseStatus, responseHeaders, responseBodyText, testContext) {
  allResponsePayloads.push(responseBodyText);
  if (responseBodyText.includes(TEST_SECRET_KEY)) {
    throw new Error(`CRITICAL SECURITY FAILURE: Response body leaked secret API key in context: ${testContext}! Body: ${responseBodyText}`);
  }
  for (const [header, val] of Object.entries(responseHeaders || {})) {
    if (String(val).includes(TEST_SECRET_KEY)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Response header '${header}' leaked secret API key in context: ${testContext}!`);
    }
  }
}

(async () => {
  const serverModule = await import('../server.js');
  const geminiService = await import('../server/gemini-service.js');
  const app = serverModule.app;

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`📡 Ephemeral Test Server running on ${baseUrl}\n`);

  try {
    // ============================================================================
    // CATEGORY 1: POST /api/food-images/generate
    // ============================================================================
    console.log('------------------------------------------------------------------------------');
    console.log('📌 CATEGORY 1: POST /api/food-images/generate (Rate Limits & Input Bounds)');
    console.log('------------------------------------------------------------------------------');

    // 1.1 Rapid Fire Cooldown Violation (<5s returns 429)
    await recordTestAsync('GEN-RAPID-01', 'First generation request is accepted', async () => {
      geminiService.resetFoodImageRateLimits();
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: 'Paneer Tikka', clientId: 'client_stress_1' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-RAPID-01');
      assert.ok([200, 429].includes(res.status), `Expected 200 or 429, got ${res.status}`);
      const data = JSON.parse(text);
      // Either success or graceful error envelope if API call fails
      assert.strictEqual(typeof data.success, 'boolean');
    });

    await recordTestAsync('GEN-RAPID-02', 'Immediate second request (<50ms) returns HTTP 429 cooldown', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: 'Paneer Tikka', clientId: 'client_stress_1' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-RAPID-02');
      assert.strictEqual(res.status, 429, `Expected HTTP 429, got ${res.status}`);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.cooldown, true);
      assert.ok(data.retryAfter >= 1 && data.retryAfter <= 5);
      assert.ok(data.error.includes('Please wait'));
    });

    await recordTestAsync('GEN-RAPID-03', 'Burst hammer of 10 rapid concurrent requests all receive 429', async () => {
      const promises = Array.from({ length: 10 }).map(() =>
        fetch(`${baseUrl}/api/food-images/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dishName: 'Paneer Tikka', clientId: 'client_stress_1' })
        })
      );
      const responses = await Promise.all(promises);
      for (const res of responses) {
        const text = await res.text();
        inspectForSecretLeakage(res.status, res.headers, text, 'GEN-RAPID-03');
        assert.strictEqual(res.status, 429);
        const data = JSON.parse(text);
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.cooldown, true);
      }
    });

    await recordTestAsync('GEN-RAPID-04', 'Isolated client terminal (client_stress_2) is NOT blocked by client_stress_1', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: 'Butter Chicken', clientId: 'client_stress_2' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-RAPID-04');
      // Should NOT be 429 because client_stress_2 has separate bucket
      assert.notStrictEqual(res.status, 429, 'client_stress_2 should not be blocked by client_stress_1 cooldown');
    });

    // 1.2 Hourly Burst Limit Enforcement (20 max per hour)
    await recordTestAsync('GEN-BURST-01', 'Hourly burst limit strictly rejects 21st request within 1 hour', async () => {
      const burstClient = 'client_burst_limit_test';
      geminiService.resetFoodImageRateLimits();

      const originalDateNow = Date.now;
      let mockClock = 1700000000000;
      try {
        Date.now = () => mockClock;

        // Perform 20 requests through the HTTP endpoint, each with clock advanced by 6 seconds (>5s cooldown)
        for (let i = 0; i < 20; i++) {
          mockClock += 6000;
          const res = await fetch(`${baseUrl}/api/food-images/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dishName: 'Biryani', clientId: burstClient })
          });
          const text = await res.text();
          inspectForSecretLeakage(res.status, res.headers, text, `GEN-BURST-01 call ${i + 1}`);
          assert.strictEqual(res.status, 200, `Call ${i + 1} should be permitted with HTTP 200 (got ${res.status}: ${text})`);
        }

        // Advance clock by 6 seconds again (21 * 6s = 126s << 3600s, still inside 1-hour window)
        mockClock += 6000;

        // 21st request MUST be rejected with HTTP 429 and hourly quota message
        const res21 = await fetch(`${baseUrl}/api/food-images/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dishName: 'Biryani', clientId: burstClient })
        });
        const text21 = await res21.text();
        inspectForSecretLeakage(res21.status, res21.headers, text21, 'GEN-BURST-01 call 21');
        assert.strictEqual(res21.status, 429, `Expected HTTP 429 on 21st request, got ${res21.status}`);
        const data21 = JSON.parse(text21);
        assert.strictEqual(data21.success, false);
        assert.strictEqual(data21.cooldown, false, 'Expected cooldown: false for hourly burst limit');
        assert.ok(data21.error.includes('Hourly image generation quota reached'));
      } finally {
        Date.now = originalDateNow;
      }
    });

    // 1.3 XSS and Injection Inputs in dishName
    await recordTestAsync('GEN-XSS-01', 'HTML script tag injection is sanitized: <script>alert("xss")</script>', async () => {
      geminiService.resetFoodImageRateLimits();
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: '<script>alert("xss")</script>', clientId: 'client_xss_1' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-XSS-01');
      // The sanitized prompt must not contain raw unescaped script tag
      assert.ok(!text.includes('<script>'));
      assert.ok(!text.includes('</script>'));
    });

    await recordTestAsync('GEN-XSS-02', 'Inputs with only HTML/special chars (<>$$`) rejected with 400 validation error', async () => {
      geminiService.resetFoodImageRateLimits();
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: '<><>$$$`', clientId: 'client_xss_2' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-XSS-02');
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('dishName must contain at least 2 valid characters'));
    });

    await recordTestAsync('GEN-XSS-03', 'Dish name exceeding 100 characters rejected with 400', async () => {
      geminiService.resetFoodImageRateLimits();
      const longName = 'A'.repeat(101);
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: longName, clientId: 'client_xss_3' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-XSS-03');
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('dishName cannot exceed 100 characters'));
    });

    await recordTestAsync('GEN-XSS-04', 'Template injection and command syntax handled safely without crash', async () => {
      geminiService.resetFoodImageRateLimits();
      const malicious = '${process.exit(1)}; rm -rf /; " OR ""="';
      const res = await fetch(`${baseUrl}/api/food-images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName: malicious, clientId: 'client_xss_4' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'GEN-XSS-04');
      // Server must remain running and return response without executing expression
      assert.ok([200, 429].includes(res.status));
    });

    // 1.4 Missing API Key Fallback Envelope
    await recordTestAsync('GEN-KEY-01', 'Missing API key returns graceful 200 envelope with fallbackUrl and NO crash', async () => {
      // Temporarily clear environment keys
      const saved1 = process.env.GEMINI_API_KEY;
      const saved2 = process.env.GEMINI_API_KEY2;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY2;
      geminiService.clearGeminiCaches();

      try {
        const res = await fetch(`${baseUrl}/api/food-images/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dishName: 'Masala Dosa', clientId: 'client_no_key' })
        });
        const text = await res.text();
        assert.strictEqual(res.status, 200, `Expected safe 200 envelope, got ${res.status}`);
        const data = JSON.parse(text);
        assert.strictEqual(data.success, false);
        assert.ok(data.error.includes('NO_API_KEY'));
        assert.ok(typeof data.fallbackUrl === 'string');
        assert.ok(data.fallbackUrl.startsWith('http'));
      } finally {
        process.env.GEMINI_API_KEY = saved1;
        if (saved2) process.env.GEMINI_API_KEY2 = saved2;
        geminiService.clearGeminiCaches();
      }
    });

    // ============================================================================
    // CATEGORY 2: POST /api/food-images/upload
    // ============================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📌 CATEGORY 2: POST /api/food-images/upload (Payload, MIME & Magic Bytes)');
    console.log('------------------------------------------------------------------------------');

    // Sample valid JPEG buffer: FF D8 FF E0 + padding
    const validJpegBuffer = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), Buffer.alloc(100, 0xAB)]);
    const validJpegBase64 = `data:image/jpeg;base64,${validJpegBuffer.toString('base64')}`;

    // Sample valid PNG buffer: 89 50 4E 47
    const validPngBuffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(100, 0xCD)]);
    const validPngBase64 = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

    // Sample valid WebP buffer: RIFF .... WEBP
    const validWebpBuffer = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(100, 0xEF)]);
    const validWebpBase64 = `data:image/webp;base64,${validWebpBuffer.toString('base64')}`;

    await recordTestAsync('UP-OK-01', 'Upload valid JPEG passes magic bytes check and saves file', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'test_jpeg_item', base64Data: validJpegBase64, mimeType: 'image/jpeg' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'UP-OK-01');
      assert.strictEqual(res.status, 200);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, true);
      assert.ok(data.image.url.startsWith('/uploads/food-images/'));
      assert.strictEqual(data.image.source, 'upload');
    });

    await recordTestAsync('UP-OK-02', 'Upload valid PNG and WebP are accepted', async () => {
      const resPng = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'test_png_item', base64Data: validPngBase64, mimeType: 'image/png' })
      });
      assert.strictEqual(resPng.status, 200);

      const resWebp = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'test_webp_item', base64Data: validWebpBase64, mimeType: 'image/webp' })
      });
      assert.strictEqual(resWebp.status, 200);
    });

    // 2.1 Payload Size Limits (Reject > 3MB)
    await recordTestAsync('UP-SIZE-01', 'Upload payload exceeding 3MB is rejected with HTTP 413', async () => {
      // 3MB = 3,145,728 bytes. Generate 3.2MB buffer
      const oversizeBuffer = Buffer.concat([
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
        Buffer.alloc(3.2 * 1024 * 1024, 0x00)
      ]);
      const oversizeBase64 = `data:image/jpeg;base64,${oversizeBuffer.toString('base64')}`;

      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'oversize_item', base64Data: oversizeBase64 })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'UP-SIZE-01');
      assert.strictEqual(res.status, 413, `Expected HTTP 413, got ${res.status}`);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('exceeds 3MB limit'));
    });

    await recordTestAsync('UP-SIZE-02', 'Upload empty payload is rejected with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'empty_item', base64Data: '' })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
    });

    // 2.2 MIME Whitelist Rejection
    await recordTestAsync('UP-MIME-01', 'Upload with declared disallowed MIME (image/gif) rejected with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'gif_item', base64Data: validJpegBase64, mimeType: 'image/gif' })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Allowed types: JPEG, PNG, WebP'));
    });

    await recordTestAsync('UP-MIME-02', 'Upload with declared PDF MIME (application/pdf) rejected with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'pdf_item', base64Data: validJpegBase64, mimeType: 'application/pdf' })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 400);
    });

    // 2.3 Binary Magic Bytes Validation (Reject Fake JPEGs)
    await recordTestAsync('UP-MAGIC-01', 'Fake JPEG starting with MZ (Windows PE executable) rejected with HTTP 400', async () => {
      const mzExecutableBuffer = Buffer.concat([Buffer.from([0x4D, 0x5A, 0x90, 0x00]), Buffer.alloc(100, 0x11)]);
      const fakeJpegBase64 = `data:image/jpeg;base64,${mzExecutableBuffer.toString('base64')}`;

      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'malicious_exe', base64Data: fakeJpegBase64, mimeType: 'image/jpeg' })
      });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'UP-MAGIC-01');
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Invalid file format or header'));
    });

    await recordTestAsync('UP-MAGIC-02', 'Fake JPEG starting with ELF (Linux executable) rejected with HTTP 400', async () => {
      const elfBuffer = Buffer.concat([Buffer.from([0x7F, 0x45, 0x4C, 0x46]), Buffer.alloc(100, 0x22)]);
      const fakeElfBase64 = `data:image/jpeg;base64,${elfBuffer.toString('base64')}`;

      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'malicious_elf', base64Data: fakeElfBase64, mimeType: 'image/jpeg' })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 400);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Invalid file format or header'));
    });

    await recordTestAsync('UP-MAGIC-03', 'HTML/SVG script disguised as JPEG rejected with HTTP 400', async () => {
      const htmlBuffer = Buffer.from('<svg onload=alert(1)>');
      const fakeSvgBase64 = `data:image/jpeg;base64,${htmlBuffer.toString('base64')}`;

      const res = await fetch(`${baseUrl}/api/food-images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishId: 'fake_svg_item', base64Data: fakeSvgBase64, mimeType: 'image/jpeg' })
      });
      const text = await res.text();
      assert.strictEqual(res.status, 400);
    });

    // ============================================================================
    // CATEGORY 3: DELETE /api/food-images/:filename
    // ============================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📌 CATEGORY 3: DELETE /api/food-images/:filename (Path Traversal & Unlink)');
    console.log('------------------------------------------------------------------------------');

    // 3.1 Normal Deletion
    await recordTestAsync('DEL-NORM-01', 'DELETE unlinks valid file and returns success', async () => {
      const targetFilename = `del_test_${Date.now()}.jpg`;
      const filePath = path.join(__dirname, '..', 'uploads', 'food-images', targetFilename);
      fs.writeFileSync(filePath, Buffer.from([0xFF, 0xD8, 0xFF]));
      assert.ok(fs.existsSync(filePath));

      const res = await fetch(`${baseUrl}/api/food-images/${targetFilename}`, { method: 'DELETE' });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'DEL-NORM-01');
      assert.strictEqual(res.status, 200);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.deletedFilename, targetFilename);
      assert.ok(!fs.existsSync(filePath), 'File must be unlinked from filesystem');
    });

    await recordTestAsync('DEL-NORM-02', 'DELETE non-existent file returns 200 with notFound: true without throwing', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/non_existent_dish_file_123.jpg`, { method: 'DELETE' });
      const text = await res.text();
      assert.strictEqual(res.status, 200);
      const data = JSON.parse(text);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.notFound, true);
    });

    // 3.2 Path Traversal Attacks
    await recordTestAsync('DEL-TRAV-01', 'Relative traversal ../server.js cannot delete server.js', async () => {
      const serverJsPath = path.join(__dirname, '..', 'server.js');
      assert.ok(fs.existsSync(serverJsPath), 'server.js must exist before test');

      const res = await fetch(`${baseUrl}/api/food-images/..%2Fserver.js`, { method: 'DELETE' });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'DEL-TRAV-01');
      assert.ok(fs.existsSync(serverJsPath), 'CRITICAL: server.js must NOT be deleted by path traversal!');
    });

    await recordTestAsync('DEL-TRAV-02', 'Deep relative traversal ../../../../package.json cannot delete package.json', async () => {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      assert.ok(fs.existsSync(pkgPath));

      const res = await fetch(`${baseUrl}/api/food-images/..%2F..%2F..%2F..%2Fpackage.json`, { method: 'DELETE' });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'DEL-TRAV-02');
      assert.ok(fs.existsSync(pkgPath), 'CRITICAL: package.json must NOT be deleted!');
    });

    await recordTestAsync('DEL-TRAV-03', 'Windows backslash traversal ..\\..\\server.js is safely handled', async () => {
      const serverJsPath = path.join(__dirname, '..', 'server.js');
      const res = await fetch(`${baseUrl}/api/food-images/..%5C..%5Cserver.js`, { method: 'DELETE' });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'DEL-TRAV-03');
      assert.ok(fs.existsSync(serverJsPath), 'CRITICAL: server.js must remain untouched!');
    });

    await recordTestAsync('DEL-TRAV-04', 'Null byte injection dish.jpg%00.exe is sanitized', async () => {
      const res = await fetch(`${baseUrl}/api/food-images/dish.jpg%00.exe`, { method: 'DELETE' });
      const text = await res.text();
      inspectForSecretLeakage(res.status, res.headers, text, 'DEL-TRAV-04');
      const data = JSON.parse(text);
      assert.ok(!data.deletedFilename.includes('\0'));
    });

    // ============================================================================
    // CATEGORY 4: SECRET KEY LEAKAGE SCRUTINY
    // ============================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📌 CATEGORY 4: SECRET KEY LEAKAGE FORENSIC AUDIT');
    console.log('------------------------------------------------------------------------------');

    recordTest('SEC-LEAK-01', 'Zero HTTP responses contained process.env.GEMINI_API_KEY', () => {
      for (let i = 0; i < allResponsePayloads.length; i++) {
        const payload = allResponsePayloads[i];
        if (payload.includes(TEST_SECRET_KEY)) {
          throw new Error(`Secret key leaked in response index ${i}: ${payload}`);
        }
      }
    });

    recordTest('SEC-LEAK-02', 'sanitizeErrorForClient redacts test key and Google key pattern', () => {
      const rawErrMsg = `API call failed: Error at https://generativelanguage.googleapis.com/...key=${TEST_SECRET_KEY}`;
      const sanitized = geminiService.sanitizeErrorForClient(rawErrMsg, TEST_SECRET_KEY);
      assert.ok(!sanitized.includes(TEST_SECRET_KEY), 'Must not contain TEST_SECRET_KEY');
      assert.ok(sanitized.includes('[REDACTED_API_KEY]'), 'Must replace key with [REDACTED_API_KEY]');
    });

    recordTest('SEC-LEAK-03', 'Simulated API rejection stack does NOT leak secret key to client error response', () => {
      const sampleStack = `Error: GoogleGenAI Error\n    at Request.send (node_modules/@google/genai)\n    at URL (https://endpoint?key=${TEST_SECRET_KEY})`;
      const cleanStack = geminiService.sanitizeErrorForClient(sampleStack, TEST_SECRET_KEY);
      assert.ok(!cleanStack.includes(TEST_SECRET_KEY));
      assert.ok(cleanStack.includes('[REDACTED_API_KEY]'));
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    console.log('\n🛑 Ephemeral Test Server cleanly shut down.');
  }

  // ============================================================================
  // SUMMARY SCORECARD
  // ============================================================================
  console.log('\n==============================================================================');
  console.log('📊 ADVERSARIAL STRESS TEST SCORECARD');
  console.log('==============================================================================');
  console.log(`  Total Tests Run:  ${passedTests + failedTests}`);
  console.log(`  Passed Tests:     ${passedTests}`);
  console.log(`  Failed Tests:     ${failedTests}`);
  console.log('==============================================================================\n');

  if (failedTests > 0) {
    console.error(`💥 FAILURE: ${failedTests} adversarial assertions failed!`);
    for (const f of failureReport) {
      console.error(`   - [${f.id}] ${f.description}: ${f.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('🎉 ALL ADVERSARIAL STRESS TESTS PASSED WITH 0 LEAKAGES AND 0 BYPASSES!\n');
  }
})();
