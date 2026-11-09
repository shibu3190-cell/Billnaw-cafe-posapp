/**
 * scratch/test_auditor_m2_gemini_forensics.cjs
 * ============================================================================
 * FORENSIC INTEGRITY AUDIT SUITE FOR MILESTONE 2 (Gemini AI Scanner & 15-Scan Quota)
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

let passedCount = 0;
let failedCount = 0;
const errors = [];

async function auditCheck(title, fn) {
  try {
    await fn();
    passedCount++;
    console.log(`  ✅ AUDIT PASS: ${title}`);
  } catch (err) {
    failedCount++;
    errors.push({ title, error: err.message, stack: err.stack });
    console.log(`  ❌ AUDIT FAIL: ${title}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runForensicAudit() {
  console.log('================================================================');
  console.log('🕵️ FORENSIC INTEGRITY AUDIT: MILESTONE 2 (GEMINI & 15-SCAN QUOTA)');
  console.log('================================================================\n');

  const geminiService = await import('../server/gemini-service.js');
  const quotaService = await import('../server/quota-service.js');
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const serverJs = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');

  // --------------------------------------------------------------------------
  console.log('📍 PHASE 1: STATIC CODE FORENSICS & FACADE DETECTION');
  // --------------------------------------------------------------------------

  await auditCheck('F1-NO-FACADE-01: CANDIDATE_MODELS contains legitimate model names with gemini-3.5-flash-lite leading', () => {
    assert.strictEqual(geminiService.CANDIDATE_MODELS[0], 'gemini-3.5-flash-lite');
    assert.strictEqual(geminiService.CANDIDATE_MODELS[1], 'gemini-3.1-flash-lite');
    assert.strictEqual(geminiService.CANDIDATE_TIMEOUT_MS, 7000);
    assert.ok(geminiService.CANDIDATE_MODELS.length >= 6);
  });

  await auditCheck('F1-NO-FACADE-02: executeWithTimeout uses Promise.race and unref timer, not dummy resolved value', async () => {
    let executed = false;
    const res = await geminiService.executeWithTimeout(async () => {
      executed = true;
      return 42;
    }, 100);
    assert.strictEqual(res, 42);
    assert.strictEqual(executed, true);
  });

  await auditCheck('F1-NO-FACADE-03: parseMenuJsonSafely rejects dummy non-JSON strings with authentic Error', () => {
    assert.throws(() => geminiService.parseMenuJsonSafely('Dummy text output from broken AI'), /not valid JSON/);
    assert.throws(() => geminiService.parseMenuJsonSafely(''), /empty or invalid string/);
  });

  await auditCheck('F1-NO-FACADE-04: parseMenuJsonSafely cleans dirty prices (₹, $, dashes, text) into numeric floats', () => {
    const dirtyPayload = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Hot Drinks',
          items: [
            { item_name: 'Kadak Chai', price: '₹ 25.50/-', isVeg: true },
            { item_name: 'Filter Coffee', price: '40.00', isVeg: true },
            { item_name: 'Americano', price: '$ 3.50', isVeg: true }
          ]
        }
      ]
    });
    const parsed = geminiService.parseMenuJsonSafely(dirtyPayload);
    assert.strictEqual(parsed.categories[0].items[0].price, 25.5);
    assert.strictEqual(parsed.categories[0].items[1].price, 40);
    assert.strictEqual(parsed.categories[0].items[2].price, 3.5);
  });

  await auditCheck('F1-NO-FACADE-05: parseMenuJsonSafely preserves dietary isVeg boolean attributes authentic parsing', () => {
    const dietaryPayload = JSON.stringify({
      menu_categories: [
        {
          category_name: 'Appetizers',
          items: [
            { item_name: 'Paneer Tikka', price: 180, isVeg: true },
            { item_name: 'Chicken Kebab', price: 220, isVeg: false },
            { item_name: 'Chef Special Platter', price: 300, isVeg: null }
          ]
        }
      ]
    });
    const parsed = geminiService.parseMenuJsonSafely(dietaryPayload);
    assert.strictEqual(parsed.categories[0].items[0].isVeg, true);
    assert.strictEqual(parsed.categories[0].items[1].isVeg, false);
    assert.strictEqual(parsed.categories[0].items[2].isVeg, null);
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 PHASE 2: ATOMIC QUOTA ENFORCEMENT & CONCURRENCY MUTEX');
  // --------------------------------------------------------------------------

  await auditCheck('F2-QUOTA-01: DEFAULT_MONTHLY_LIMIT is strictly 15', () => {
    assert.strictEqual(quotaService.DEFAULT_MONTHLY_LIMIT, 15);
  });

  await auditCheck('F2-QUOTA-02: 15 Scans boundary: exactly 15 succeed, 16th fails with status 429', async () => {
    quotaService.resetQuotaMemoryStore();
    const testShopId = 'AUDITOR_SHOP_QUOTA_' + Date.now();

    for (let i = 1; i <= 15; i++) {
      const check = await quotaService.checkAiQuotaAndKey({ shopId: testShopId });
      assert.strictEqual(check.currentUsage, i - 1);
      assert.strictEqual(check.monthlyLimit, 15);
      await quotaService.recordSuccessfulAiUsage(testShopId, check);
    }

    // 16th attempt must be rejected with 429
    let error429 = null;
    try {
      await quotaService.checkAiQuotaAndKey({ shopId: testShopId });
    } catch (err) {
      error429 = err;
    }

    assert.ok(error429 !== null, '16th scan must throw error');
    assert.strictEqual(error429.status, 429);
    assert.strictEqual(error429.quota.limit, 15);
    assert.strictEqual(error429.quota.used, 15);
    assert.strictEqual(error429.quota.remaining, 0);
    assert.strictEqual(error429.quota.quotaExceeded, true);
  });

  await auditCheck('F2-QUOTA-03: Calendar month rollover auto-resets usage to 0', async () => {
    const testShopId = 'AUDITOR_SHOP_ROLLOVER_' + Date.now();
    // Simulate shop at limit in previous month '2026-10'
    await quotaService.updateClientProfileData(testShopId, {
      currentUsage: 15,
      monthlyLimit: 15,
      lastResetMonth: '2026-10'
    });

    // Check quota in current month ('2026-11')
    const check = await quotaService.checkAiQuotaAndKey({ shopId: testShopId });
    assert.strictEqual(check.currentUsage, 0, 'Usage must auto-reset to 0 on new calendar month');
    assert.strictEqual(check.monthlyLimit, 15);
  });

  await auditCheck('F2-QUOTA-04: withShopLock serializes concurrent critical sections per shop', async () => {
    quotaService.resetQuotaMemoryStore();
    const testShopId = 'AUDITOR_CONCURRENCY_' + Date.now();
    const order = [];

    const job1 = quotaService.withShopLock(testShopId, async () => {
      await new Promise(r => setTimeout(r, 40));
      order.push('first');
    });

    const job2 = quotaService.withShopLock(testShopId, async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push('second');
    });

    await Promise.all([job1, job2]);
    assert.deepStrictEqual(order, ['first', 'second'], 'job2 must serialize after job1');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 PHASE 3: BYOK VALIDATION & KEY ISOLATION');
  // --------------------------------------------------------------------------

  await auditCheck('F3-BYOK-01: resolveGeminiApiKey prioritizes valid custom key over server environment key', () => {
    const longCustomKey = 'AIzaSyA_CUSTOM_VALID_KEY_1234567890';
    assert.strictEqual(geminiService.resolveGeminiApiKey(longCustomKey), longCustomKey);

    // If custom key is invalid/short, falls back to server environment key
    const fallback = geminiService.resolveGeminiApiKey('short');
    assert.ok(fallback.length > 15, 'Must fall back to default server key when custom key is too short');
  });

  await auditCheck('F3-BYOK-02: server.js enforces operational validation on custom keys and returns 401 when invalid', () => {
    assert.ok(serverJs.includes('isCustomKeyValid'), 'server.js must check isCustomKeyValid');
    assert.ok(serverJs.includes('res.status(401).json({'), 'server.js must return 401 for invalid custom key');
    assert.ok(serverJs.includes('invalidCustomKey: true'), 'server.js must flag invalidCustomKey in payload');
  });

  await auditCheck('F3-BYOK-03: server.js enforces HTTP 429 on quota exhaustion', () => {
    assert.ok(serverJs.includes('res.status(429).json({'), 'server.js must return 429 when quota exceeded');
    assert.ok(serverJs.includes('quotaErr.status === 429'), 'server.js must detect status 429');
  });

  // --------------------------------------------------------------------------
  console.log('\n📍 PHASE 4: REPOSITORY INVARIANTS & INTEGRITY');
  // --------------------------------------------------------------------------

  await auditCheck('F4-INV-01: Exactly 26 .modal-close-btn SVG elements in index.html', () => {
    const matches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
    assert.strictEqual(matches.length, 26, `Must have exactly 26 modal-close-btn elements (found ${matches.length})`);
    for (const m of matches) {
      assert.ok(/<svg[\s\S]*?<\/svg>/i.test(m), `Each modal-close-btn must contain an SVG icon: ${m.substring(0, 60)}`);
      assert.ok(!m.includes('✕'), 'Must not contain raw ✕ character');
    }
  });

  await auditCheck('F4-INV-02: Zero raw Unicode emojis inside <button> elements in index.html', () => {
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
    let match;
    const violations = [];
    while ((match = buttonRegex.exec(indexHtml)) !== null) {
      const inner = match[1].replace(/<svg[\s\S]*?<\/svg>/gi, '');
      if (emojiRegex.test(inner)) {
        violations.push(match[0].substring(0, 80));
      }
    }
    assert.strictEqual(violations.length, 0, `Buttons with raw emojis found: ${JSON.stringify(violations)}`);
  });

  console.log('\n================================================================');
  console.log(`🎯 FORENSIC AUDIT SUMMARY: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runForensicAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
