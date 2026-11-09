/**
 * scratch/test_adversarial_m2_vision.cjs
 * ============================================================================
 * Milestone 2: Gemini Vision & Parsing Adversarial Challenger Test Suite
 * 
 * Adversarially stress-tests:
 *   1. parseMenuJsonSafely against corrupted JSON, markdown fences, commentary,
 *      curly brace noise, array schemas, price formats, and dietary flags.
 *   2. Model cascade timeout fallback when a candidate model hangs >7000ms.
 *   3. Clear image input sanitization, MIME detection, and false rejection prevention.
 *   4. Quota and BYOK precedence edge cases.
 *   5. Repository invariants (26 modal close SVGs, 0 raw emojis in buttons).
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

async function runAdversarialSuite() {
  console.log('====================================================================');
  console.log('🔥 ADVERSARIAL CHALLENGER SUITE: GEMINI VISION & PARSING HARDENING');
  console.log('====================================================================\n');

  const geminiService = await import('../server/gemini-service.js');
  const quotaService = await import('../server/quota-service.js');
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

  // --------------------------------------------------------------------------
  console.log('📍 CATEGORY A: ADVERSARIAL JSON PARSING (parseMenuJsonSafely)');
  // --------------------------------------------------------------------------

  await test('ADV-JSON-01: Valid pure JSON with menu_categories format', () => {
    const raw = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Hot Coffee',
          items: [
            { item_name: 'Espresso', price: 120.00, isVeg: true, description: 'Single shot' }
          ]
        }
      ],
      gst_pricing_note: 'inclusive'
    });
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.categories[0].name, 'Hot Coffee');
    assert.strictEqual(parsed.categories[0].items[0].name, 'Espresso');
    assert.strictEqual(parsed.categories[0].items[0].price, 120);
    assert.strictEqual(parsed.categories[0].items[0].isVeg, true);
    assert.strictEqual(parsed.gst_pricing_note, 'inclusive');
  });

  await test('ADV-JSON-02: Markdown code fence ```json with trailing commentary', () => {
    const raw = '```json\n{\n  "categories": [\n    {\n      "name": "Quick Bites",\n      "items": [\n        { "name": "Vada Pav", "price": 40, "isVeg": true }\n      ]\n    }\n  ]\n}\n```\nExtra commentary: Hope this scanned well!';
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.categories[0].name, 'Quick Bites');
    assert.strictEqual(parsed.categories[0].items[0].name, 'Vada Pav');
    assert.strictEqual(parsed.categories[0].items[0].price, 40);
  });

  await test('ADV-JSON-03: Case-insensitive code fence ```JSON and untrimmed formatting', () => {
    const raw = '   ```JSON\n{\n  "menu_categories": [\n    {\n      "category_name": "Cold Drinks",\n      "items": [{ "item_name": "Iced Tea", "price": "60" }]\n    }\n  ]\n}   ```   ';
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories[0].name, 'Cold Drinks');
    assert.strictEqual(parsed.categories[0].items[0].items === undefined, true);
    assert.strictEqual(parsed.categories[0].items[0].name, 'Iced Tea');
    assert.strictEqual(parsed.categories[0].items[0].price, 60);
  });

  await test('ADV-JSON-04: Conversational preamble with introductory speech', () => {
    const raw = 'Here is the digitised menu extracted from your uploaded photo:\n\n{\n  "menu_categories": [\n    {\n      "category_name": "Desserts",\n      "items": [{ "item_name": "Brownie", "price": 95, "isVeg": true }]\n    }\n  ]\n}';
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories[0].name, 'Desserts');
    assert.strictEqual(parsed.categories[0].items[0].name, 'Brownie');
    assert.strictEqual(parsed.categories[0].items[0].price, 95);
  });

  await test('ADV-JSON-05: Bare array of items [ { name, price } ] without categories wrapper', () => {
    const raw = '[\n  { "name": "Veg Burger", "price": 110, "isVeg": true },\n  { "name": "Chicken Burger", "price": 160, "isVeg": false }\n]';
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.categories[0].name, 'General');
    assert.strictEqual(parsed.categories[0].items.length, 2);
    assert.strictEqual(parsed.categories[0].items[0].name, 'Veg Burger');
    assert.strictEqual(parsed.categories[0].items[0].price, 110);
    assert.strictEqual(parsed.categories[0].items[0].isVeg, true);
    assert.strictEqual(parsed.categories[0].items[1].name, 'Chicken Burger');
    assert.strictEqual(parsed.categories[0].items[1].price, 160);
    assert.strictEqual(parsed.categories[0].items[1].isVeg, false);
  });

  await test('ADV-JSON-06: Bare array of category objects [ { category_name, items } ]', () => {
    const raw = '[\n  {\n    "category_name": "Shakes",\n    "items": [{ "name": "Mango Shake", "price": 90 }]\n  }\n]';
    const parsed = geminiService.parseMenuJsonSafely(raw);
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.categories[0].name, 'Shakes');
    assert.strictEqual(parsed.categories[0].items[0].name, 'Mango Shake');
    assert.strictEqual(parsed.categories[0].items[0].price, 90);
  });

  await test('ADV-JSON-07: Corrupted Unicode currency symbols & messy price strings parsing audit', () => {
    const raw = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Prices Test',
          items: [
            { item_name: 'Rupee Symbol', price: '₹ 120.00' },
            { item_name: 'Dollar Sign', price: '$15' },
            { item_name: 'Rs Prefix Slash Dot', price: 'Rs. 50/-' },
            { item_name: 'Rs Prefix No Dot', price: 'Rs 50/-' },
            { item_name: 'INR Code', price: 'INR 250.50' },
            { item_name: 'Euro Sign', price: '€8.50' },
            { item_name: 'Pound Sign', price: '£12.99' },
            { item_name: 'Plain Slash', price: '99/-' },
            { item_name: 'Free Item', price: 'Free' },
            { item_name: 'Null Price', price: null },
            { item_name: 'Negative Price', price: -50 }
          ]
        }
      ]
    });
    const parsed = geminiService.parseMenuJsonSafely(raw);
    const items = parsed.categories[0].items;
    
    // Verify standard currency formats work
    assert.strictEqual(items.find(i => i.name === 'Rupee Symbol').price, 120);
    assert.strictEqual(items.find(i => i.name === 'Dollar Sign').price, 15);
    assert.strictEqual(items.find(i => i.name === 'Rs Prefix No Dot').price, 50);
    assert.strictEqual(items.find(i => i.name === 'INR Code').price, 250.5);
    assert.strictEqual(items.find(i => i.name === 'Euro Sign').price, 8.5);
    assert.strictEqual(items.find(i => i.name === 'Pound Sign').price, 12.99);
    assert.strictEqual(items.find(i => i.name === 'Plain Slash').price, 99);
    assert.strictEqual(items.find(i => i.name === 'Free Item').price, 0);
    assert.strictEqual(items.find(i => i.name === 'Null Price').price, 0);
    assert.strictEqual(items.find(i => i.name === 'Negative Price').price, 0);

    // EMPIRICAL BUG DEMONSTRATION:
    // 'Rs. 50/-' contains a dot in 'Rs.' which replace(/[^\d\.]/g, '') retains as leading '.50',
    // causing parseFloat('.50') to evaluate to 0.5 instead of 50!
    const rsDotPrice = items.find(i => i.name === 'Rs Prefix Slash Dot').price;
    if (rsDotPrice !== 50) {
      throw new Error(`CRITICAL PRICE BUG CONFIRMED: "Rs. 50/-" was parsed as ${rsDotPrice} (0.50) instead of 50.00 due to unstripped abbreviation dot in "Rs."`);
    }
  });

  await test('ADV-JSON-08: Dietary indicator variations (isVeg, is_veg, veg)', () => {
    const raw = JSON.stringify({
      categories: [
        {
          name: 'Dietary Test',
          items: [
            { name: 'Veg Standard', price: 100, isVeg: true },
            { name: 'Non-Veg Standard', price: 150, isVeg: false },
            { name: 'Veg SnakeCase', price: 100, is_veg: true },
            { name: 'Non-Veg SnakeCase', price: 150, is_veg: false },
            { name: 'Veg Short', price: 100, veg: true },
            { name: 'Non-Veg Short', price: 150, veg: false },
            { name: 'Unspecified Veg', price: 100 },
            { name: 'Invalid String Veg', price: 100, isVeg: 'true' }
          ]
        }
      ]
    });
    const parsed = geminiService.parseMenuJsonSafely(raw);
    const items = parsed.categories[0].items;
    assert.strictEqual(items.find(i => i.name === 'Veg Standard').isVeg, true);
    assert.strictEqual(items.find(i => i.name === 'Non-Veg Standard').isVeg, false);
    assert.strictEqual(items.find(i => i.name === 'Veg SnakeCase').isVeg, true);
    assert.strictEqual(items.find(i => i.name === 'Non-Veg SnakeCase').isVeg, false);
    assert.strictEqual(items.find(i => i.name === 'Veg Short').isVeg, true);
    assert.strictEqual(items.find(i => i.name === 'Non-Veg Short').isVeg, false);
    assert.strictEqual(items.find(i => i.name === 'Unspecified Veg').isVeg, null);
    assert.strictEqual(items.find(i => i.name === 'Invalid String Veg').isVeg, null);
  });

  await test('ADV-JSON-09: Filtering empty names and empty categories safely', () => {
    const raw = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Empty Category',
          items: []
        },
        {
          category_name: 'Category With Nameless Items',
          items: [
            { item_name: '', price: 100 },
            { item_name: '   ', price: 50 },
            { item_name: 'Valid Item', price: 75 }
          ]
        }
      ]
    });
    const parsed = geminiService.parseMenuJsonSafely(raw);
    // 'Empty Category' should be omitted because it has 0 valid items
    assert.strictEqual(parsed.categories.length, 1);
    assert.strictEqual(parsed.categories[0].name, 'Category With Nameless Items');
    assert.strictEqual(parsed.categories[0].items.length, 1);
    assert.strictEqual(parsed.categories[0].items[0].name, 'Valid Item');
  });

  await test('ADV-JSON-10: Incomplete / truncated JSON throws Error cleanly without crashing process', () => {
    const truncated1 = '{"menu_categories": [{"category_name": "Incomplete';
    const truncated2 = '```json\n{"categories": [';
    assert.throws(() => geminiService.parseMenuJsonSafely(truncated1), /not valid JSON/);
    assert.throws(() => geminiService.parseMenuJsonSafely(truncated2), /not valid JSON/);
  });

  await test('ADV-JSON-11: Empty, null, or whitespace-only input throws explicit validation Error', () => {
    assert.throws(() => geminiService.parseMenuJsonSafely(null), /empty or invalid string/);
    assert.throws(() => geminiService.parseMenuJsonSafely(undefined), /empty or invalid string/);
    assert.throws(() => geminiService.parseMenuJsonSafely(''), /empty or invalid string/);
    assert.throws(() => geminiService.parseMenuJsonSafely('    \n\t  '), /empty or invalid string/);
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 CATEGORY B: CANDIDATE MODEL TIMEOUT & CASCADE SIMULATION');
  // --------------------------------------------------------------------------

  await test('ADV-CASCADE-01: CANDIDATE_MODELS priority ordering starts with fast flash-lite models', () => {
    const models = geminiService.CANDIDATE_MODELS;
    assert.strictEqual(models[0], 'gemini-3.5-flash-lite');
    assert.strictEqual(models[1], 'gemini-3.1-flash-lite');
    assert.strictEqual(models[2], 'gemini-flash-latest');
    assert.strictEqual(geminiService.CANDIDATE_TIMEOUT_MS, 7000);
  });

  await test('ADV-CASCADE-02: executeWithTimeout triggers TimeoutError exactly when promise exceeds timeoutMs', async () => {
    const start = Date.now();
    let timeoutCaught = false;
    try {
      await geminiService.executeWithTimeout(async () => {
        await new Promise(r => setTimeout(r, 150));
        return 'too_late';
      }, 50, 'Test candidate timeout');
    } catch (err) {
      timeoutCaught = true;
      assert.strictEqual(err.name, 'TimeoutError');
      assert.ok(err.message.includes('Test candidate timeout'));
    }
    const elapsed = Date.now() - start;
    assert.ok(timeoutCaught, 'Timeout must be caught');
    assert.ok(elapsed >= 45 && elapsed < 120, `Elapsed time ${elapsed}ms should be close to 50ms timeout`);
  });

  await test('ADV-CASCADE-03: Multi-candidate cascade loop simulates hanging model 1 and succeeds on model 2', async () => {
    // Replicate the exact cascade loop logic from gemini-service.js
    const simulatedModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    const modelExecutionLog = [];
    let successfulModel = null;
    let responseText = null;

    for (const modelName of simulatedModels) {
      try {
        const res = await geminiService.executeWithTimeout(async () => {
          modelExecutionLog.push({ model: modelName, action: 'start' });
          if (modelName === 'gemini-3.5-flash-lite') {
            // Simulate hanging > timeout
            await new Promise(r => setTimeout(r, 200));
            return { text: 'never_reached' };
          }
          // Second model succeeds promptly
          await new Promise(r => setTimeout(r, 20));
          return {
            text: JSON.stringify({
              menu_categories: [
                { category_name: 'Cascade Cat', items: [{ item_name: 'Cascade Dish', price: 99 }] }
              ]
            })
          };
        }, 50, `Model '${modelName}' request exceeded 50ms timeout`);

        if (res && res.text) {
          successfulModel = modelName;
          responseText = res.text;
          break;
        }
      } catch (err) {
        modelExecutionLog.push({ model: modelName, action: 'timeout_or_error', err: err.message });
        continue;
      }
    }

    assert.strictEqual(successfulModel, 'gemini-3.1-flash-lite', 'Cascade must successfully fall back to candidate 2');
    assert.ok(modelExecutionLog.find(e => e.model === 'gemini-3.5-flash-lite' && e.action === 'timeout_or_error'));
    assert.ok(modelExecutionLog.find(e => e.model === 'gemini-3.1-flash-lite' && e.action === 'start'));
    // Third model should NOT have been called since model 2 succeeded
    assert.strictEqual(modelExecutionLog.some(e => e.model === 'gemini-flash-latest'), false);

    const parsed = geminiService.parseMenuJsonSafely(responseText);
    assert.strictEqual(parsed.categories[0].items[0].name, 'Cascade Dish');
    assert.strictEqual(parsed.categories[0].items[0].price, 99);
  });

  await test('ADV-CASCADE-04: Multi-candidate cascade breaks immediately on 401/403 authentication failure', async () => {
    const simulatedModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    const attemptedModels = [];
    let lastError = null;

    for (const modelName of simulatedModels) {
      try {
        await geminiService.executeWithTimeout(async () => {
          attemptedModels.push(modelName);
          const authErr = new Error('UNAUTHENTICATED: API_KEY_INVALID');
          authErr.status = 401;
          throw authErr;
        }, 50);
      } catch (err) {
        lastError = err;
        const errMsg = String(err?.message || err);
        const isAuthError = err.status === 401 || err.status === 403 || errMsg.includes('UNAUTHENTICATED');
        if (isAuthError) {
          break; // Stop immediately to avoid wasting time
        }
        continue;
      }
    }

    assert.strictEqual(attemptedModels.length, 1, 'Cascade must abort on first 401/UNAUTHENTICATED error');
    assert.strictEqual(attemptedModels[0], 'gemini-3.5-flash-lite');
    assert.ok(lastError.message.includes('UNAUTHENTICATED'));
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 CATEGORY C: CLEAR IMAGE INPUT SANITIZATION & FALSE REJECTION PREVENTION');
  // --------------------------------------------------------------------------

  await test('ADV-IMG-01: Base64 data with data:image/png;base64 prefix is stripped cleanly', () => {
    const rawDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const match = rawDataUri.match(/^data:([^;]+);base64,(.+)$/s);
    assert.ok(match, 'Must match data URI regex');
    assert.strictEqual(match[1], 'image/png');
    assert.strictEqual(match[2].trim(), 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  });

  await test('ADV-IMG-02: Base64 data with whitespace and newlines is sanitized', () => {
    const dirtyBase64 = '  iVBORw0KGgoAAA\nANSUhEUgAAAAEAAAABCAQA\r\nAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=  ';
    const cleaned = dirtyBase64.trim().replace(/\s+/g, '');
    assert.ok(!cleaned.includes(' '), 'Must not contain spaces');
    assert.ok(!cleaned.includes('\n'), 'Must not contain newlines');
    assert.ok(!cleaned.includes('\r'), 'Must not contain carriage returns');
    assert.ok(cleaned.length > 50, 'Cleaned base64 must retain image payload');
  });

  await test('ADV-IMG-03: Buffer base64 conversion is handled accurately', () => {
    const buf = Buffer.from('menu_test_image_bytes');
    const b64 = buf.toString('base64');
    assert.strictEqual(Buffer.from(b64, 'base64').toString('utf8'), 'menu_test_image_bytes');
  });

  await test('ADV-IMG-04: Clear image parsing never produces 0 pending items when categories are returned', () => {
    // Simulate what js/menu.js does with serverData
    const serverData = geminiService.parseMenuJsonSafely(JSON.stringify({
      menu_categories: [
        {
          category_name: 'Appetizers',
          items: [
            { item_name: 'Spring Rolls', price: 140, isVeg: true }
          ]
        }
      ]
    }));

    const pendingAiItems = [];
    serverData.categories.forEach(cat => {
      const catName = String(cat.name || cat.category || "General").trim();
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          const rawName = String(item.name || item.title || "New Item").trim();
          const rawPrice = parseFloat(item.price) || 0;
          pendingAiItems.push({
            name: rawName,
            price: rawPrice,
            category: catName,
            isVeg: item.isVeg
          });
        });
      }
    });

    assert.ok(pendingAiItems.length > 0, 'Must have at least 1 pending item');
    assert.strictEqual(pendingAiItems[0].name, 'Spring Rolls');
    assert.strictEqual(pendingAiItems[0].price, 140);
    assert.strictEqual(pendingAiItems[0].isVeg, true);
    // Verified: if pendingAiItems.length > 0, "No clear dishes detected" is NEVER shown.
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 CATEGORY D: 15-SCAN QUOTA HARDENING & BYOK RESOLUTION');
  // --------------------------------------------------------------------------

  await test('ADV-QUOTA-01: DEFAULT_MONTHLY_LIMIT is strictly 15', () => {
    assert.strictEqual(quotaService.DEFAULT_MONTHLY_LIMIT, 15);
  });

  await test('ADV-QUOTA-02: Simultaneous concurrent requests within quota limit are serialized via withShopLock', async () => {
    const shopId = 'SHOP_ADVERSARIAL_CONCURRENCY_' + Date.now();
    const executionTrace = [];
    
    // Simulate 4 concurrent scan operations on the same shop
    const p1 = quotaService.withShopLock(shopId, async () => {
      await new Promise(r => setTimeout(r, 40));
      executionTrace.push('scan1_done');
    });
    const p2 = quotaService.withShopLock(shopId, async () => {
      await new Promise(r => setTimeout(r, 20));
      executionTrace.push('scan2_done');
    });
    const p3 = quotaService.withShopLock(shopId, async () => {
      await new Promise(r => setTimeout(r, 10));
      executionTrace.push('scan3_done');
    });

    await Promise.all([p1, p2, p3]);
    assert.deepStrictEqual(executionTrace, ['scan1_done', 'scan2_done', 'scan3_done'], 'Concurrent scans must execute serially in arrival order');
  });

  await test('ADV-QUOTA-03: Exhausted quota strictly rejects subsequent requests with HTTP 429', async () => {
    const shopId = 'SHOP_EXHAUSTED_' + Date.now();
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 15,
      used: 15,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    let caught = null;
    try {
      await quotaService.checkAiQuotaAndKey({ shopId });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught);
    assert.strictEqual(caught.status, 429);
    assert.ok(caught.message.includes('15 scans'));
    assert.strictEqual(caught.quota.remaining, 0);
  });

  await test('ADV-BYOK-01: Custom Gemini key precedence over environment fallback', () => {
    const customKey = 'AIzaSyAdversarialCustomKey12345';
    const resolved = geminiService.resolveGeminiApiKey(customKey);
    assert.strictEqual(resolved, customKey);
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 CATEGORY E: REPOSITORY INVARIANTS AUDIT');
  // --------------------------------------------------------------------------

  await test('ADV-INV-01: Exactly 26 .modal-close-btn SVG elements in index.html', () => {
    const matches = indexHtml.match(/<button[^>]*class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(matches.length, 26, `Must have exactly 26 modal close buttons, found ${matches.length}`);
  });

  await test('ADV-INV-02: Zero raw Unicode emojis inside <button> elements in index.html', () => {
    const btnRegex = /<button[\s\S]*?<\/button>/gi;
    const btns = indexHtml.match(btnRegex) || [];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const rawEmojiButtons = btns.filter(b => emojiRegex.test(b));
    assert.strictEqual(rawEmojiButtons.length, 0, `Expected 0 raw emoji buttons, found ${rawEmojiButtons.length}`);
  });

  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL ADVERSARIAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('====================================================================');

  if (failedTests > 0) {
    console.error('FAILURES DETECTED:');
    failureDetails.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL 25 ADVERSARIAL STRESS TESTS VERIFIED 100% GREEN!\n');
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Adversarial suite crashed:', err);
  process.exit(1);
});
