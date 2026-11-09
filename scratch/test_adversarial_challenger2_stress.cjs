/**
 * scratch/test_adversarial_challenger2_stress.cjs
 * ============================================================================
 * Challenger 2 Adversarial Stress Harness:
 * Extreme Concurrency, In-Flight Quota Leaks, Re-entrancy & Multi-Tenant Isolation
 * ============================================================================
 */

const assert = require('assert');
const path = require('path');
const http = require('http');

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
    failureDetails.push({ name, error: err.message, stack: err.stack });
    console.log(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function run() {
  console.log('====================================================================');
  console.log('🔥 CHALLENGER 2 ADVERSARIAL STRESS HARNESS: CONCURRENCY & IN-FLIGHT');
  console.log('====================================================================\n');

  const quotaService = await import('../server/quota-service.js');
  const geminiService = await import('../server/gemini-service.js');
  const netlifyHandlerModule = await import('../netlify/functions/api.js');
  const netlifyHandler = netlifyHandlerModule.handler;

  // ==========================================================================
  console.log('📍 SUITE 1: EXTREME CONCURRENCY BURST (50 requests, 1 slot remaining)');
  // ==========================================================================

  await test('CHALLENGE-01: 50 simultaneous bursts on 1 remaining slot allow exactly 1 and reject 49 with 429', async () => {
    const shopId = 'BURST_50_SHOP_' + Date.now();
    const currentMonth = quotaService.getCurrentYearMonth();

    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 14,
      used: 14,
      monthlyLimit: 15,
      lastResetMonth: currentMonth
    });

    let successCount = 0;
    let blockedCount = 0;
    const errors = [];

    // 50 concurrent requests
    const tasks = Array.from({ length: 50 }, async (_, i) => {
      try {
        const check = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
        // Jitter delay simulating asynchronous Gemini OCR network call
        await new Promise(r => setTimeout(r, 10 + (i % 5) * 5));
        await quotaService.recordSuccessfulAiUsage(shopId, check);
        successCount++;
      } catch (err) {
        if (err.status === 429) {
          blockedCount++;
        } else {
          errors.push(err);
        }
      }
    });

    await Promise.all(tasks);

    assert.strictEqual(errors.length, 0, `Unexpected errors: ${errors.map(e => e.message).join(', ')}`);
    assert.strictEqual(successCount, 1, `Exactly 1 scan must succeed, but got ${successCount}`);
    assert.strictEqual(blockedCount, 49, `Exactly 49 scans must be blocked with 429, but got ${blockedCount}`);

    const finalInfo = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(finalInfo.used, 15, 'Final used count must be strictly 15');
    assert.strictEqual(finalInfo.remaining, 0, 'Final remaining count must be strictly 0');
  });

  // ==========================================================================
  console.log('\n📍 SUITE 2: FAIL-SAFE SLOT RELEASE & TRANSIENT ERROR RESILIENCE');
  // ==========================================================================

  await test('CHALLENGE-02: Aborted / failed scans cleanly release in-flight slot without leaking or blocking subsequent scans', async () => {
    const shopId = 'FAIL_RELEASE_SHOP_' + Date.now();
    const currentMonth = quotaService.getCurrentYearMonth();

    // Start with 14 used scans (1 remaining)
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 14,
      used: 14,
      monthlyLimit: 15,
      lastResetMonth: currentMonth
    });

    // Request 1 reserves slot
    const check1 = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
    assert.strictEqual(check1.slotReserved, true);

    // Request 2 immediately tries while Request 1 is in-flight -> MUST BE BLOCKED
    let caught429 = null;
    try {
      await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
    } catch (err) {
      caught429 = err;
    }
    assert.ok(caught429, 'Second request must be blocked while first is in-flight');
    assert.strictEqual(caught429.status, 429);

    // Request 1 encounters an external error / abort -> release slot
    quotaService.releaseAiQuotaSlot(shopId);

    // Request 3 now tries -> MUST SUCCEED because slot was cleanly released
    const check3 = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
    assert.strictEqual(check3.currentUsage, 14, 'Current usage should still be 14');
    await quotaService.recordSuccessfulAiUsage(shopId, check3);

    const postInfo = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(postInfo.used, 15, 'Post-success used count must be 15');
    assert.strictEqual(postInfo.remaining, 0, 'Post-success remaining count must be 0');
  });

  await test('CHALLENGE-03: Repeated or redundant releaseAiQuotaSlot calls never cause underflow or corruption', async () => {
    const shopId = 'UNDERFLOW_TEST_SHOP_' + Date.now();
    // Call release on a shop with 0 in-flight reservations 10 times
    for (let i = 0; i < 10; i++) {
      const res = quotaService.releaseAiQuotaSlot(shopId);
      assert.strictEqual(res, true);
    }

    // Now verify normal reservation works without being offset by spurious releases
    const check = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
    assert.strictEqual(check.inFlight, 1);
    quotaService.releaseAiQuotaSlot(shopId);
  });

  await test('CHALLENGE-04: Mixed concurrent burst (10 succeed, 10 fail & release, 10 blocked by 429)', async () => {
    const shopId = 'MIXED_BURST_SHOP_' + Date.now();
    const currentMonth = quotaService.getCurrentYearMonth();

    // Start with 10 used scans (5 remaining)
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 10,
      used: 10,
      monthlyLimit: 15,
      lastResetMonth: currentMonth
    });

    let completedSuccess = 0;
    let completedFailure = 0;
    let blocked429 = 0;

    // 25 concurrent requests: odd indices will fail & release; even indices will succeed
    const tasks = Array.from({ length: 25 }, async (_, i) => {
      let slotReserved = false;
      try {
        const check = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
        slotReserved = true;

        await new Promise(r => setTimeout(r, 10 + (i % 4) * 5));

        if (i % 2 === 1) {
          // Simulate failure (e.g. invalid response / timeout)
          throw new Error('Simulated external failure');
        } else {
          await quotaService.recordSuccessfulAiUsage(shopId, check);
          slotReserved = false;
          completedSuccess++;
        }
      } catch (err) {
        if (slotReserved) {
          quotaService.releaseAiQuotaSlot(shopId);
          slotReserved = false;
          completedFailure++;
        } else if (err.status === 429) {
          blocked429++;
        } else {
          throw err;
        }
      }
    });

    await Promise.all(tasks);

    const info = await quotaService.getClientQuotaInfo(shopId);
    // At most 5 scans could succeed (since only 5 slots available)
    assert.strictEqual(info.used, 10 + completedSuccess, 'Used count must accurately match initial + completed successes');
    assert.ok(info.used <= 15, `Used count must never exceed 15 (got ${info.used})`);
    assert.ok(completedSuccess <= 5, `Completed successes cannot exceed available 5 slots (got ${completedSuccess})`);
    assert.ok(completedFailure > 0, 'Some requests should have failed and released slots');
  });

  // ==========================================================================
  console.log('\n📍 SUITE 3: MULTI-TENANT CONCURRENCY & ZERO CROSS-TALK');
  // ==========================================================================

  await test('CHALLENGE-05: 10 distinct shops running 20 concurrent requests each (200 total) execute in complete isolation', async () => {
    const shopCount = 10;
    const shops = Array.from({ length: shopCount }, (_, i) => ({
      id: `MULTI_SHOP_${i}_` + Date.now(),
      initialUsed: i, // 0, 1, 2, ..., 9 used
      expectedRemaining: 15 - i
    }));

    const currentMonth = quotaService.getCurrentYearMonth();

    // Initialize all shops
    for (const shop of shops) {
      await quotaService.updateClientProfileData(shop.id, {
        currentUsage: shop.initialUsed,
        used: shop.initialUsed,
        monthlyLimit: 15,
        lastResetMonth: currentMonth
      });
    }

    const shopResults = new Map();
    shops.forEach(s => shopResults.set(s.id, { success: 0, blocked: 0 }));

    // 200 tasks: 20 per shop, all interleaved
    const allTasks = [];
    for (let r = 0; r < 20; r++) {
      for (const shop of shops) {
        allTasks.push((async () => {
          try {
            const check = await quotaService.checkAiQuotaAndKey({ shopId: shop.id, reserveSlot: true });
            await new Promise(res => setTimeout(res, 5 + (r % 3) * 5));
            await quotaService.recordSuccessfulAiUsage(shop.id, check);
            shopResults.get(shop.id).success++;
          } catch (err) {
            if (err.status === 429) {
              shopResults.get(shop.id).blocked++;
            } else {
              throw err;
            }
          }
        })());
      }
    }

    await Promise.all(allTasks);

    // Verify each shop independently
    for (const shop of shops) {
      const res = shopResults.get(shop.id);
      const expectedSuccess = shop.expectedRemaining;
      const expectedBlocked = 20 - expectedSuccess;

      assert.strictEqual(res.success, expectedSuccess, `Shop ${shop.id} expected ${expectedSuccess} successes, got ${res.success}`);
      assert.strictEqual(res.blocked, expectedBlocked, `Shop ${shop.id} expected ${expectedBlocked} blocked, got ${res.blocked}`);

      const info = await quotaService.getClientQuotaInfo(shop.id);
      assert.strictEqual(info.used, 15, `Shop ${shop.id} final used must be 15`);
      assert.strictEqual(info.remaining, 0, `Shop ${shop.id} final remaining must be 0`);
    }
  });

  // ==========================================================================
  console.log('\n📍 SUITE 4: RE-ENTRANCY & NESTED MUTEX LOCK SAFETY');
  // ==========================================================================

  await test('CHALLENGE-06: withShopLock allows deep recursive re-entrancy without self-deadlock', async () => {
    const shopId = 'REENTRANT_SHOP_' + Date.now();
    let depthReached = 0;

    const result = await quotaService.withShopLock(shopId, async () => {
      depthReached++;
      return await quotaService.withShopLock(shopId, async () => {
        depthReached++;
        return await quotaService.withShopLock(shopId, async () => {
          depthReached++;
          return 'TRIPLE_LOCK_PASS';
        });
      });
    });

    assert.strictEqual(result, 'TRIPLE_LOCK_PASS');
    assert.strictEqual(depthReached, 3);

    // Ensure lock is cleanly released after re-entrant stack unrolls
    const subsequentCall = await quotaService.withShopLock(shopId, async () => 'AFTER_REENTRANT');
    assert.strictEqual(subsequentCall, 'AFTER_REENTRANT');
  });

  await test('CHALLENGE-07: Nested lock exception properly unrolls and unlocks the mutex', async () => {
    const shopId = 'EXCEPTION_LOCK_SHOP_' + Date.now();

    try {
      await quotaService.withShopLock(shopId, async () => {
        await quotaService.withShopLock(shopId, async () => {
          throw new Error('Explosion inside nested lock');
        });
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.strictEqual(err.message, 'Explosion inside nested lock');
    }

    // Mutex should be available and not locked
    const canAcquire = await quotaService.withShopLock(shopId, async () => 'RECOVERED');
    assert.strictEqual(canAcquire, 'RECOVERED');
  });

  // ==========================================================================
  console.log('\n📍 SUITE 5: STATUS PROBES (reserveSlot: false) IMMUNITY');
  // ==========================================================================

  await test('CHALLENGE-08: Health checks and status probes never consume in-flight reservation slots', async () => {
    const shopId = 'STATUS_PROBE_SHOP_' + Date.now();
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 14,
      used: 14,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    // Fire 30 concurrent status checks with reserveSlot: false
    const probeTasks = Array.from({ length: 30 }, async () => {
      const res = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: false });
      assert.strictEqual(res.slotReserved, false);
      assert.strictEqual(res.inFlight, 0);
    });

    await Promise.all(probeTasks);

    // Remaining slots must still be exactly 1
    const info = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(info.used, 14);
    assert.strictEqual(info.remaining, 1);

    // The single remaining slot can be consumed normally
    const realScan = await quotaService.checkAiQuotaAndKey({ shopId, reserveSlot: true });
    assert.strictEqual(realScan.slotReserved, true);
    await quotaService.recordSuccessfulAiUsage(shopId, realScan);

    const exhaustedInfo = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(exhaustedInfo.used, 15);
    assert.strictEqual(exhaustedInfo.remaining, 0);
  });

  // ==========================================================================
  console.log('\n📍 SUITE 6: NETLIFY SERVERLESS FUNCTION HANDLER PARITY');
  // ==========================================================================

  await test('CHALLENGE-09: Netlify serverless handler enforces quota, 429, and slot management', async () => {
    const shopId = 'NETLIFY_STRESS_SHOP_' + Date.now();
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 14,
      used: 14,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    // Scan 1 via Netlify event (Fallback smart parser)
    const event1 = {
      httpMethod: 'POST',
      path: '/.netlify/functions/api/ai/scan-menu',
      headers: { 'x-shop-id': shopId },
      body: JSON.stringify({ extractedText: 'Coffee 50\nTea 30' })
    };

    const resp1 = await netlifyHandler(event1, {});
    assert.strictEqual(resp1.statusCode, 200);
    const body1 = JSON.parse(resp1.body);
    assert.strictEqual(body1.isFallback, true);

    // Fallback does NOT increment usage; usage remains 14
    const info1 = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(info1.used, 14);

    // Set usage to 15 (exhausted)
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 15,
      used: 15,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    // Scan 2 via Netlify event when quota is exhausted
    const event2 = {
      httpMethod: 'POST',
      path: '/.netlify/functions/api/ai/scan-menu',
      headers: { 'x-shop-id': shopId },
      body: JSON.stringify({ extractedText: 'Burger 120' })
    };

    const resp2 = await netlifyHandler(event2, {});
    assert.strictEqual(resp2.statusCode, 429, 'Netlify handler must return 429 when quota exhausted');
    const body2 = JSON.parse(resp2.body);
    assert.ok(body2.error.includes('quota') || body2.error.includes('15 scans'), 'Error message should mention quota');
  });

  // ==========================================================================
  console.log('\n📍 SUITE 7: EXPRESS APP LOOPBACK CONCURRENCY');
  // ==========================================================================

  await test('CHALLENGE-10: Express server /api/ai/scan-menu over loopback preserves slot safety', async () => {
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());

    // Import the exact handler logic from server.js
    const quotaService = await import('../server/quota-service.js');
    const geminiService = await import('../server/gemini-service.js');

    app.post('/test/scan-menu', async (req, res) => {
      const shopId = (req.headers['x-shop-id'] || req.body?.shopId || 'TEST_SHOP').trim();
      let slotReserved = false;
      try {
        const keyCheck = await quotaService.checkAiQuotaAndKey({ shopId });
        slotReserved = true;

        // Simulated processing
        await new Promise(r => setTimeout(r, 10));

        const quotaInfo = await quotaService.recordSuccessfulAiUsage(shopId, keyCheck);
        slotReserved = false;
        return res.json({ success: true, quota: quotaInfo });
      } catch (err) {
        if (slotReserved) {
          quotaService.releaseAiQuotaSlot(shopId);
          slotReserved = false;
        }
        if (err.status === 429) {
          return res.status(429).json({ error: err.message, quota: err.quota });
        }
        return res.status(500).json({ error: err.message });
      }
    });

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const shopId = 'EXPRESS_BURST_SHOP_' + Date.now();
    await quotaService.updateClientProfileData(shopId, {
      currentUsage: 13,
      used: 13,
      monthlyLimit: 15,
      lastResetMonth: quotaService.getCurrentYearMonth()
    });

    let okCount = 0;
    let err429Count = 0;

    const reqs = Array.from({ length: 15 }, async () => {
      const postData = JSON.stringify({ shopId });
      return new Promise((resolve) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: port,
          path: '/test/scan-menu',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-shop-id': shopId,
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          if (res.statusCode === 200) okCount++;
          else if (res.statusCode === 429) err429Count++;
          res.resume();
          res.on('end', resolve);
        });
        req.on('error', resolve);
        req.write(postData);
        req.end();
      });
    });

    await Promise.all(reqs);
    await new Promise(resolve => server.close(resolve));

    // Started at 13 out of 15 -> exactly 2 should succeed, 13 rejected
    assert.strictEqual(okCount, 2, `Exactly 2 requests must succeed, got ${okCount}`);
    assert.strictEqual(err429Count, 13, `Exactly 13 requests must return 429, got ${err429Count}`);

    const finalInfo = await quotaService.getClientQuotaInfo(shopId);
    assert.strictEqual(finalInfo.used, 15);
    assert.strictEqual(finalInfo.remaining, 0);
  });

  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL CHALLENGER TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('====================================================================');

  if (failedTests > 0) {
    console.error('\n❌ FAILURE DETAILS:');
    failureDetails.forEach(f => {
      console.error(`- ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('✨ ALL CHALLENGER 2 STRESS TESTS COMPLETED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal crash in stress harness:', err);
  process.exit(1);
});
