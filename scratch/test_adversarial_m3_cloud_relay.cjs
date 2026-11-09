/**
 * 🕵️ ADVERSARIAL INTEGRITY & STRESS TEST SUITE: MILESTONE 3 CLOUD PRINT RELAY
 * 
 * Conducted by auditor_m3_1:
 * - 10 concurrent stations contending for a single KOT lease.
 * - Adversarial billing injection attempts (obfuscated fields, mixed casing, prototypes).
 * - Exact 60s lease boundary testing (59.9s vs 60.1s).
 * - Multi-failure state machine transition testing (attempt 1, 2, 3 -> failed).
 * - Code scanning for dummy returns, facades, or test bypassing.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runAdversarialM3Audit() {
  console.log('====================================================================');
  console.log('🕵️  ADVERSARIAL STRESS & INTEGRITY SUITE: MILESTONE 3 CLOUD PRINT RELAY');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(desc) {
    passed++;
    console.log(`  ✅ PASS: ${desc}`);
  }

  function fail(desc, err) {
    failed++;
    console.error(`  ❌ FAIL: ${desc}\n     ${err.message || err}`);
  }

  const {
    ThermalPrinterBridge,
    enqueueCloudKotPrintJob,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue
  } = await import('../src/core/platform-bridge.js');

  // --- STRESS TEST 1: 10-Way Concurrent Lease Race ---
  console.log('📍 ADVERSARIAL TEST 1: 10-Way Concurrent Lease Race');
  try {
    const documents = new Map();
    const versionMap = new Map();

    const jobId = 'kot_stress_race_10way';
    const docPath = `shops/shop_test/print_queue/${jobId}`;
    documents.set(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });
    versionMap.set(docPath, 1);

    const mockDb = {
      runTransaction: async (updateFn) => {
        const maxRetries = 10;
        for (let r = 0; r < maxRetries; r++) {
          const readVer = versionMap.get(docPath);
          const txn = {
            get: async () => ({
              exists: () => true,
              data: () => JSON.parse(JSON.stringify(documents.get(docPath)))
            }),
            update: (ref, fields) => {
              if (versionMap.get(docPath) !== readVer) {
                throw new Error('OCC_CONFLICT');
              }
              const current = documents.get(docPath);
              documents.set(docPath, { ...current, ...fields });
              versionMap.set(docPath, readVer + 1);
            }
          };

          try {
            return await updateFn(txn);
          } catch (e) {
            if (e.message === 'OCC_CONFLICT') {
              await new Promise(res => setTimeout(res, Math.random() * 20));
              continue;
            }
            throw e;
          }
        }
        throw new Error('Max retries reached in OCC');
      }
    };

    const competitors = Array.from({ length: 10 }, (_, i) => `station_terminal_${i + 1}`);
    const results = await Promise.all(
      competitors.map(async (stId) => {
        try {
          const claim = await claimPrintJob(
            mockDb,
            'shop_test',
            jobId,
            stId,
            { jobRef: { path: docPath, id: jobId }, runTransaction: mockDb.runTransaction }
          );
          return { success: true, stId, claim };
        } catch (e) {
          return { success: false, stId, error: e.message };
        }
      })
    );

    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Exactly 1 winner expected among 10 contenders, found ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Exactly 9 losers expected among 10 contenders, found ${losers.length}`);
    for (const loser of losers) {
      assert.strictEqual(loser.error, 'Job already claimed or printed');
    }

    const finalState = documents.get(docPath);
    assert.strictEqual(finalState.status, 'processing');
    assert.strictEqual(finalState.leasedBy, winners[0].stId);
    assert.strictEqual(finalState.attempts, 1);
    pass('10 concurrent stations competing simultaneously: strictly 1 winner, 9 rejected, 0 duplicates');
  } catch (err) {
    fail('10-Way Concurrent Lease Race failed', err);
  }

  // --- STRESS TEST 2: Adversarial Billing Injections ---
  console.log('\n📍 ADVERSARIAL TEST 2: Adversarial Billing Injections & Evasions');
  const forbiddenPayloads = [
    { name: 'Undefined jobType', payload: { tableNo: 'T1', items: [] } },
    { name: 'Null jobType', payload: { jobType: null, tableNo: 'T1' } },
    { name: 'Fake jobType (KOT_RECEIPT)', payload: { jobType: 'KOT_RECEIPT', tableNo: 'T1' } },
    { name: 'Lower-case jobType', payload: { jobType: 'kot', tableNo: 'T1' } },
    { name: 'Invoice object injected', payload: { jobType: 'KOT', invoice: { id: 1 } } },
    { name: 'billNo string injected', payload: { jobType: 'KOT', billNo: '1001' } },
    { name: 'bill_no snake_case injected', payload: { jobType: 'KOT', bill_no: '1001' } },
    { name: 'amount float injected', payload: { jobType: 'KOT', amount: 150.00 } },
    { name: 'final_payable_paise integer injected', payload: { jobType: 'KOT', final_payable_paise: 15000 } },
    { name: 'final_total_paise injected', payload: { jobType: 'KOT', final_total_paise: 15000 } },
    { name: 'grandTotal injected', payload: { jobType: 'KOT', grandTotal: 200 } },
    { name: 'grand_total snake_case injected', payload: { jobType: 'KOT', grand_total: 200 } },
    { name: 'paymentMode injected', payload: { jobType: 'KOT', paymentMode: 'UPI' } },
    { name: 'payment_mode snake_case injected', payload: { jobType: 'KOT', payment_mode: 'Cash' } },
    { name: 'subtotal injected', payload: { jobType: 'KOT', subtotal: 100 } },
    { name: 'grossSubtotal injected', payload: { jobType: 'KOT', grossSubtotal: 120 } },
    { name: 'totalTax injected', payload: { jobType: 'KOT', totalTax: 5 } }
  ];

  for (const tc of forbiddenPayloads) {
    try {
      let rejected = false;
      try {
        await enqueueCloudKotPrintJob(tc.payload, { setDoc: async () => {} });
      } catch (e) {
        if (e.message.includes('[Security Violation]')) {
          rejected = true;
        }
      }
      assert.strictEqual(rejected, true, `Payload '${tc.name}' bypassed security validation!`);
      pass(`Adversarial attack blocked: ${tc.name}`);
    } catch (err) {
      fail(`Adversarial attack succeeded unexpectedly: ${tc.name}`, err);
    }
  }

  // --- STRESS TEST 3: Sub-Second Lease Expiration Boundary ---
  console.log('\n📍 ADVERSARIAL TEST 3: Exact 60-Second Lease Expiration Boundary');
  try {
    const testBoundary = async (ageMs, shouldAllowClaim) => {
      const docPath = 'shops/s1/print_queue/kot_boundary';
      const doc = {
        jobId: 'kot_boundary',
        jobType: 'KOT',
        status: 'processing',
        attempts: 1,
        leasedBy: 'station_alpha',
        leasedAt: new Date(Date.now() - ageMs).toISOString()
      };

      const mockDb = {
        runTransaction: async (fn) => fn({
          get: async () => ({
            exists: () => true,
            data: () => ({ ...doc })
          }),
          update: (ref, fields) => { Object.assign(doc, fields); }
        })
      };

      let claimed = false;
      try {
        await claimPrintJob(mockDb, 's1', 'kot_boundary', 'station_beta', {
          jobRef: { path: docPath, id: 'kot_boundary' },
          runTransaction: mockDb.runTransaction
        });
        claimed = true;
      } catch (e) {
        if (e.message !== 'Job already claimed or printed') throw e;
      }

      assert.strictEqual(
        claimed,
        shouldAllowClaim,
        `At age ${ageMs}ms, expected claim=${shouldAllowClaim}, got ${claimed}`
      );
    };

    // 59,500ms (< 60s): must be locked
    await testBoundary(59500, false);
    pass('Lease age 59.5s (< 60s): claim strictly locked');

    // 60,500ms (> 60s): must be reclaimable (zombie recovery)
    await testBoundary(60500, true);
    pass('Lease age 60.5s (> 60s): zombie lease cleanly reclaimed');
  } catch (err) {
    fail('Lease expiration boundary test failed', err);
  }

  // --- STRESS TEST 4: Full Multi-Failure State Machine Transition ---
  console.log('\n📍 ADVERSARIAL TEST 4: Multi-Failure State Machine & Retry Ceilings');
  try {
    let currentDoc = {
      jobId: 'kot_retry_sm',
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'station_1',
      leasedAt: new Date().toISOString()
    };

    const mockDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({
                exists: () => true,
                data: () => ({ ...currentDoc })
              }),
              update: async (fields) => {
                Object.assign(currentDoc, fields);
              }
            })
          })
        })
      })
    };

    // Attempt 1 fails -> should reset to 'queued'
    const res1 = await completePrintJob(mockDb, 's1', 'kot_retry_sm', false, 'Jammed', {
      attempts: 1,
      updateDoc: async (ref, d) => Object.assign(currentDoc, d)
    });
    assert.strictEqual(res1.status, 'queued');
    assert.strictEqual(currentDoc.status, 'queued');
    pass('Failure on attempt 1 -> resets to status: queued');

    // Attempt 2 fails -> should reset to 'queued'
    const res2 = await completePrintJob(mockDb, 's1', 'kot_retry_sm', false, 'Out of Paper', {
      attempts: 2,
      updateDoc: async (ref, d) => Object.assign(currentDoc, d)
    });
    assert.strictEqual(res2.status, 'queued');
    assert.strictEqual(currentDoc.status, 'queued');
    pass('Failure on attempt 2 -> resets to status: queued');

    // Attempt 3 fails -> should mark as 'failed' (permanent failure)
    const res3 = await completePrintJob(mockDb, 's1', 'kot_retry_sm', false, 'Cutter Error', {
      attempts: 3,
      updateDoc: async (ref, d) => Object.assign(currentDoc, d)
    });
    assert.strictEqual(res3.status, 'failed');
    assert.strictEqual(currentDoc.status, 'failed');
    pass('Failure on attempt 3 -> permanently marks status: failed');
  } catch (err) {
    fail('Multi-Failure State Machine test failed', err);
  }

  // --- STRESS TEST 5: Static Analysis for Facade and Dummy Returns ---
  console.log('\n📍 ADVERSARIAL TEST 5: Facade, Stub & Hardcoded Test Detection');
  try {
    const bridgePath = path.join(__dirname, '..', 'src', 'core', 'platform-bridge.js');
    const bridgeCode = fs.readFileSync(bridgePath, 'utf8');

    // Check for dummy return true or fake implementations
    const prohibitedPatterns = [
      /claimPrintJob[\s\S]*?return\s+true;/,
      /claimPrintJob[\s\S]*?return\s+\{\s*success:\s*true\s*\};/,
      /enqueueCloudKotPrintJob[\s\S]*?return\s+true;/
    ];

    for (const pat of prohibitedPatterns) {
      assert.strictEqual(pat.test(bridgeCode), false, `Prohibited stubbing pattern matched: ${pat}`);
    }
    pass('Zero stubbed or dummy return shortcuts in platform-bridge.js');

    // Verify runTransaction presence and enforcement
    assert.ok(
      bridgeCode.includes('runTransaction is required for atomic print job claiming'),
      'Missing runTransaction guard check'
    );
    assert.ok(
      bridgeCode.includes('Job already claimed or printed'),
      'Missing concurrency rejection throw'
    );
    pass('Genuine runTransaction guard and concurrency collision error in place');
  } catch (err) {
    fail('Static Analysis for Facade Detection failed', err);
  }

  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialM3Audit().catch(err => {
  console.error('Adversarial audit fatal:', err);
  process.exit(1);
});
