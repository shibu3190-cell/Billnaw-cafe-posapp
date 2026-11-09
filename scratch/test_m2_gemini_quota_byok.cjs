/**
 * scratch/test_m2_gemini_quota_byok.cjs
 * ============================================================================
 * Milestone 2: Gemini AI Menu Scanner & 15-Scan Quota Verification Test Suite
 * Covers:
 *   1. Gemini vision model cascade prioritization & 7s per-candidate timeout
 *   2. Resilient multi-strategy JSON extraction (fences, preambles, isVeg)
 *   3. 15-scan monthly quota tracking, atomic increments, rollover & HTTP 429
 *   4. Bring-Your-Own-Key (BYOK) custom key precedence and validation
 *   5. Backend route contracts (server.js & netlify/functions/api.js)
 *   6. Repository invariants (26 modal-close-btn SVGs, 0 raw emojis in buttons)
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failureDetails.push({ name, error: err.message });
    console.log(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('🤖 MILESTONE 2: GEMINI AI, 15-SCAN QUOTA & BYOK TEST');
  console.log('====================================================\n');

  // Load modules dynamically
  const geminiService = await import('../server/gemini-service.js');
  const quotaService = await import('../server/quota-service.js');
  const serverJs = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  const netlifyApiJs = fs.readFileSync(path.join(ROOT_DIR, 'netlify/functions/api.js'), 'utf8');
  const menuJs = fs.readFileSync(path.join(ROOT_DIR, 'js/menu.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(ROOT_DIR, 'js/settings.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

  // --------------------------------------------------------------------------
  console.log('📍 SECTION 1: GEMINI VISION MODEL CASCADE & TIMEOUT MECHANISM');
  // --------------------------------------------------------------------------

  await test('M2-CASCADE-01: CANDIDATE_MODELS starts with flash-lite vision models in priority order', () => {
    assert.ok(Array.isArray(geminiService.CANDIDATE_MODELS), 'CANDIDATE_MODELS must be an exported array');
    const expectedPrefix = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    for (let i = 0; i < expectedPrefix.length; i++) {
      assert.strictEqual(geminiService.CANDIDATE_MODELS[i], expectedPrefix[i], `Model at index ${i} must be ${expectedPrefix[i]}`);
    }
  });

  await test('M2-CASCADE-02: CANDIDATE_TIMEOUT_MS is configured to exactly 7000ms', () => {
    assert.strictEqual(geminiService.CANDIDATE_TIMEOUT_MS, 7000, 'Candidate timeout must be 7000ms');
  });

  await test('M2-CASCADE-03: executeWithTimeout resolves fast promises normally', async () => {
    const result = await geminiService.executeWithTimeout(async () => {
      return 'fast_success';
    }, 1000);
    assert.strictEqual(result, 'fast_success');
  });

  await test('M2-CASCADE-04: executeWithTimeout rejects slow hanging promises with TimeoutError', async () => {
    let errorCaught = null;
    try {
      await geminiService.executeWithTimeout(async () => {
        await new Promise(r => setTimeout(r, 200));
        return 'should_not_reach';
      }, 50, 'Candidate model timeout');
    } catch (err) {
      errorCaught = err;
    }
    assert.ok(errorCaught, 'Timeout must throw an error');
    assert.strictEqual(errorCaught.name, 'TimeoutError');
    assert.ok(errorCaught.message.includes('Candidate model timeout'));
  });

  await test('M2-CASCADE-05: extractMenuFromDocument source contains zero thinking budget configuration', () => {
    const geminiSrc = fs.readFileSync(path.join(ROOT_DIR, 'server/gemini-service.js'), 'utf8');
    assert.ok(geminiSrc.includes('thinkingBudget: 0'), 'Must configure thinkingBudget: 0 to eliminate reasoning delays');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 2: RESILIENT MULTI-STRATEGY JSON PARSER & DIETARY DETECTION');
  // --------------------------------------------------------------------------

  await test('M2-JSON-01: parseMenuJsonSafely parses direct valid JSON', () => {
    const input = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Beverages',
          items: [{ item_name: 'Cold Coffee', price: 120.00, isVeg: true }]
        }
      ]
    });
    const res = geminiService.parseMenuJsonSafely(input);
    assert.ok(res.categories.length === 1);
    assert.strictEqual(res.categories[0].name, 'Beverages');
    assert.strictEqual(res.categories[0].items[0].name, 'Cold Coffee');
    assert.strictEqual(res.categories[0].items[0].price, 120);
    assert.strictEqual(res.categories[0].items[0].isVeg, true);
  });

  await test('M2-JSON-02: parseMenuJsonSafely extracts JSON from markdown code fences', () => {
    const input = '```json\n{\n  "categories": [\n    {\n      "name": "Snacks",\n      "items": [\n        { "name": "Veg Samosa", "price": "₹25.00", "isVeg": true }\n      ]\n    }\n  ]\n}\n```';
    const res = geminiService.parseMenuJsonSafely(input);
    assert.strictEqual(res.categories[0].name, 'Snacks');
    assert.strictEqual(res.categories[0].items[0].name, 'Veg Samosa');
    assert.strictEqual(res.categories[0].items[0].price, 25);
    assert.strictEqual(res.categories[0].items[0].isVeg, true);
  });

  await test('M2-JSON-03: parseMenuJsonSafely handles conversational preamble and trailing commentary', () => {
    const input = 'Here is the extracted menu from your high resolution photo:\n\n```json\n{\n  "menu_categories": [\n    {\n      "category_name": "Biryani",\n      "items": [\n        { "item_name": "Chicken Biryani", "price": 280, "isVeg": false }\n      ]\n    }\n  ]\n}\n```\nHope this helps your restaurant!';
    const res = geminiService.parseMenuJsonSafely(input);
    assert.strictEqual(res.categories[0].name, 'Biryani');
    assert.strictEqual(res.categories[0].items[0].name, 'Chicken Biryani');
    assert.strictEqual(res.categories[0].items[0].price, 280);
    assert.strictEqual(res.categories[0].items[0].isVeg, false);
  });

  await test('M2-JSON-04: parseMenuJsonSafely slices outermost curly braces when no code fences present', () => {
    const input = 'Preamble text without code fence { "menu_categories": [ { "category_name": "Desserts", "items": [ { "item_name": "Gulab Jamun", "price": "80" } ] } ] } postamble notes.';
    const res = geminiService.parseMenuJsonSafely(input);
    assert.strictEqual(res.categories[0].name, 'Desserts');
    assert.strictEqual(res.categories[0].items[0].name, 'Gulab Jamun');
    assert.strictEqual(res.categories[0].items[0].price, 80);
  });

  await test('M2-JSON-05: parseMenuJsonSafely parses bare array format [ ... ] safely', () => {
    const input = '[ { "name": "Espresso", "price": 100 } ]';
    const res = geminiService.parseMenuJsonSafely(input);
    assert.strictEqual(res.categories[0].name, 'General');
    assert.strictEqual(res.categories[0].items[0].name, 'Espresso');
    assert.strictEqual(res.categories[0].items[0].price, 100);
  });

  await test('M2-JSON-06: parseMenuJsonSafely throws error on empty or invalid string', () => {
    assert.throws(() => geminiService.parseMenuJsonSafely(''), /empty or invalid string/);
    assert.throws(() => geminiService.parseMenuJsonSafely('not a json at all'), /not valid JSON/);
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 3: 15-SCAN MONTHLY QUOTA, AUTO-RESET & CONCURRENCY');
  // --------------------------------------------------------------------------

  await test('M2-QUOTA-01: DEFAULT_MONTHLY_LIMIT is strictly 15 scans', () => {
    assert.strictEqual(quotaService.DEFAULT_MONTHLY_LIMIT, 15, 'DEFAULT_MONTHLY_LIMIT must be 15');
  });

  await test('M2-QUOTA-02: Fresh shop starts with used=0 and remaining=15', async () => {
    quotaService.resetQuotaMemoryStore();
    const shopId = 'SHOP_TEST_FRESH_' + Date.now();
    const info = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(info.limit, 15);
    assert.strictEqual(info.used, 0);
    assert.strictEqual(info.remaining, 15);
  });

  await test('M2-QUOTA-03: Sequential scans increment usage and decrease remaining accurately', async () => {
    const shopId = 'SHOP_TEST_SEQ_' + Date.now();
    for (let i = 1; i <= 15; i++) {
      const check = await quotaService.checkAiQuotaAndKey({ shopId });
      assert.strictEqual(check.currentUsage, i - 1);
      assert.strictEqual(check.monthlyLimit, 15);

      const usageResult = await quotaService.recordSuccessfulAiUsage(shopId, check);
      assert.strictEqual(usageResult.used, i);
      assert.strictEqual(usageResult.remaining, 15 - i);
    }

    const finalInfo = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(finalInfo.used, 15);
    assert.strictEqual(finalInfo.remaining, 0);
  });

  await test('M2-QUOTA-04: 16th scan attempt is rejected with HTTP 429 Too Many Requests', async () => {
    const shopId = 'SHOP_TEST_EXHAUST_' + Date.now();
    // Simulate quota reached
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 15,
      used: 15,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    let errorCaught = null;
    try {
      await quotaService.checkAiQuotaAndKey({ shopId });
    } catch (err) {
      errorCaught = err;
    }

    assert.ok(errorCaught, '16th scan must throw quota error');
    assert.strictEqual(errorCaught.status, 429, 'Must be HTTP status 429');
    assert.ok(errorCaught.message.includes('15 scans'), 'Error message must specify 15 scans quota');
    assert.strictEqual(errorCaught.quota.remaining, 0);
    assert.strictEqual(errorCaught.quota.used, 15);
    assert.strictEqual(errorCaught.quota.limit, 15);
  });

  await test('M2-QUOTA-05: Calendar month rollover auto-resets usage to 0', async () => {
    const shopId = 'SHOP_TEST_ROLLOVER_' + Date.now();
    // Seed previous month with 15 used scans
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 15,
      used: 15,
      monthlyLimit: 15,
      lastResetMonth: '2026-10' // Previous month
    });

    // Check in current month
    const check = await quotaService.checkAiQuotaAndKey({ shopId });
    assert.strictEqual(check.currentUsage, 0, 'Rollover must reset currentUsage to 0');
    assert.strictEqual(check.monthlyLimit, 15);
  });

  await test('M2-QUOTA-06: withShopLock serializes concurrent scan operations per shop', async () => {
    const shopId = 'SHOP_TEST_MUTEX_' + Date.now();
    const executionOrder = [];

    const p1 = quotaService.withShopLock(shopId, async () => {
      await new Promise(r => setTimeout(r, 60));
      executionOrder.push('job1');
    });

    const p2 = quotaService.withShopLock(shopId, async () => {
      await new Promise(r => setTimeout(r, 20));
      executionOrder.push('job2');
    });

    await Promise.all([p1, p2]);
    assert.deepStrictEqual(executionOrder, ['job1', 'job2'], 'Job 2 must wait for Job 1 under same shop lock');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 4: BRING-YOUR-OWN-KEY (BYOK) SUPPORT & RESOLUTION');
  // --------------------------------------------------------------------------

  await test('M2-BYOK-01: resolveGeminiApiKey prioritizes valid custom key over server fallback', () => {
    const customKey = 'AIzaSyValidCustomKey1234567890';
    const resolved = geminiService.resolveGeminiApiKey(customKey);
    assert.strictEqual(resolved, customKey);
  });

  await test('M2-BYOK-02: resolveGeminiApiKey falls back to environment key if custom key is empty', () => {
    const resolved = geminiService.resolveGeminiApiKey('');
    assert.ok(typeof resolved === 'string');
  });

  await test('M2-BYOK-03: getClientQuotaInfo masks custom API key for client display', async () => {
    const shopId = 'SHOP_BYOK_' + Date.now();
    await quotaService.updateClientProfileData(shopId, {
      customGeminiKey: 'AIzaSyB1234567890SecretKey1234'
    });
    const info = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(info.hasCustomKey, true);
    assert.strictEqual(info.keyMasked, 'AIzaSyB...1234');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 5: BACKEND ROUTE CONTRACTS & PARITY');
  // --------------------------------------------------------------------------

  await test('M2-ROUTE-01: server.js defines POST /api/ai/scan-menu and preserves legacy route literal array', () => {
    assert.ok(serverJs.includes("['/api/extract-menu', '/api/menu/ocr', '/api/gemini']"), 'Must preserve legacy route literal array');
    assert.ok(serverJs.includes("'/api/ai/scan-menu'"), 'Must declare /api/ai/scan-menu route');
  });

  await test('M2-ROUTE-02: server.js parses x-gemini-api-key, x-shop-id, and x-shop-email headers', () => {
    assert.ok(serverJs.includes("req.headers['x-gemini-api-key']"), 'Must parse x-gemini-api-key');
    assert.ok(serverJs.includes("req.headers['x-shop-id']"), 'Must parse x-shop-id');
    assert.ok(serverJs.includes("req.headers['x-shop-email']"), 'Must parse x-shop-email');
  });

  await test('M2-ROUTE-03: server.js handles 401 invalid custom key and 429 quota exhaustion', () => {
    assert.ok(serverJs.includes('invalidCustomKey'), 'Must return invalidCustomKey on 401');
    assert.ok(serverJs.includes('Monthly AI scan quota of 15 scans reached for this shop.'), 'Must return 15 scans quota error');
  });

  await test('M2-ROUTE-04: netlify/functions/api.js contains /ai/scan-menu and x-gemini-api-key support', () => {
    assert.ok(netlifyApiJs.includes('/ai/scan-menu'), 'Netlify api.js must support /ai/scan-menu');
    assert.ok(netlifyApiJs.includes("headers['x-gemini-api-key']"), 'Netlify api.js must inspect x-gemini-api-key header');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 6: CLIENT UI FEEDBACK & LOCALSTORAGE PERSISTENCE');
  // --------------------------------------------------------------------------

  await test('M2-CLIENT-01: js/settings.js exports getCustomGeminiKey and setCustomGeminiKey using gemini_api_key', () => {
    assert.ok(settingsJs.includes('getCustomGeminiKey'), 'Must define getCustomGeminiKey');
    assert.ok(settingsJs.includes('setCustomGeminiKey'), 'Must define setCustomGeminiKey');
    assert.ok(settingsJs.includes("'gemini_api_key'"), 'Must access localStorage gemini_api_key');
  });

  await test('M2-CLIENT-02: js/settings.js defines testGeminiApiKey and toggleApiKeyVisibility', () => {
    assert.ok(settingsJs.includes('testGeminiApiKey'), 'Must export testGeminiApiKey');
    assert.ok(settingsJs.includes('toggleApiKeyVisibility'), 'Must export toggleApiKeyVisibility');
  });

  await test('M2-CLIENT-03: js/menu.js sends x-gemini-api-key and x-shop-id in request headers', () => {
    assert.ok(menuJs.includes("requestHeaders['x-gemini-api-key'] = customKey"), 'Must set x-gemini-api-key');
    assert.ok(menuJs.includes("requestHeaders['x-shop-id'] = activeShopId"), 'Must set x-shop-id');
  });

  await test('M2-CLIENT-04: js/menu.js handles 429 quota exhaustion and 401 invalid key toasts', () => {
    assert.ok(menuJs.includes('Monthly scan quota of 15 scans reached for this shop.'), 'Must handle 429 toast');
    assert.ok(menuJs.includes('Invalid or unauthorized Gemini API key'), 'Must handle 401 toast');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 7: REPOSITORY INVARIANTS & INTEGRITY');
  // --------------------------------------------------------------------------

  await test('M2-INV-01: Exactly 26 .modal-close-btn SVG elements exist in index.html', () => {
    const matches = indexHtml.match(/<button[^>]*class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 modal-close-btn elements, found ${matches.length}`);
  });

  await test('M2-INV-02: Strictly zero raw Unicode emojis exist inside <button> elements in index.html', () => {
    const btnRegex = /<button[\s\S]*?<\/button>/gi;
    const btns = indexHtml.match(btnRegex) || [];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const rawEmojiButtons = btns.filter(b => emojiRegex.test(b));
    assert.strictEqual(rawEmojiButtons.length, 0, `Expected 0 raw emoji buttons, found ${rawEmojiButtons.length}: ${JSON.stringify(rawEmojiButtons)}`);
  });

  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`🎯 TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('====================================================');

  if (failedTests > 0) {
    console.error('FAILURES:');
    failureDetails.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL MILESTONE 2 GEMINI, QUOTA & BYOK TESTS VERIFIED 100% GREEN!\n');
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
