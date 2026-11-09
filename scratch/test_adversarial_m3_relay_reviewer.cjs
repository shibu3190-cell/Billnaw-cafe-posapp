/**
 * 🕵️‍♂️ ADVERSARIAL STRESS-TEST & INTEGRITY AUDIT: MILESTONE 3 (Distributed Cloud Print Relay)
 * 
 * Conducted by: reviewer_m3_2 (reviewer & critic)
 * 
 * Stress-tests:
 * 1. High-concurrency stampede: 10 concurrent stations competing for 1 job -> exactly 1 winner.
 * 2. Multi-job burst: 20 distinct jobs claimed concurrently by 5 worker stations -> 20 distinct claims, 0 double-prints.
 * 3. Strict 60s zombie boundary condition:
 *    - 59,900 ms -> REJECTED (still active lease)
 *    - 60,100 ms -> ACCEPTED (reclaimed)
 * 4. Multi-stage zombie cascade: Station A leases & crashes -> Station B reclaims at 65s & crashes -> Station C reclaims at 130s -> attempts count is exactly 3.
 * 5. Case sensitivity and payload poisoning in enqueueCloudKotPrintJob:
 *    - 'kot' (lowercase) -> REJECTED
 *    - 'KOT ' (trailing space) -> REJECTED
 *    - billNo: "" (empty string) -> REJECTED
 *    - amount: 0 -> REJECTED
 *    - final_payable_paise: 0 -> REJECTED
 * 6. Edge-case retry boundary transitions in completePrintJob:
 *    - attempt 1 fail -> queued
 *    - attempt 2 fail -> queued
 *    - attempt 3 fail -> failed
 *    - attempt 4 fail -> failed
 * 7. Verification of zero hardcoded facade / bypass logic in src/core/platform-bridge.js.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runAdversarialM3Audit() {
  console.log('====================================================================');
  console.log('🕵️‍♂️ ADVERSARIAL REVIEWER STRESS-TEST & INTEGRITY AUDIT (M3)');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  let total = 0;
  const failureReports = [];

  function it(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
      failureReports.push({ name, error: err.message });
    }
  }

  async function itAsync(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
      failureReports.push({ name, error: err.message });
    }
  }

  // Import implementation under test
  const {
    enqueueCloudKotPrintJob,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue
  } = await import('../src/core/platform-bridge.js');

  // Realistic transactional DB mock with optimistic concurrency control
  class TransactionalFirestoreMock {
    constructor() {
      this.store = new Map();
      this.versions = new Map();
    }

    set(docPath, data) {
      this.store.set(docPath, JSON.parse(JSON.stringify(data)));
      this.versions.set(docPath, (this.versions.get(docPath) || 0) + 1);
    }

    get(docPath) {
      const doc = this.store.get(docPath);
      if (!doc) return { exists: () => false, exists: false, data: () => null };
      return {
        exists: () => true,
        exists: true,
        data: () => JSON.parse(JSON.stringify(doc)),
        id: path.basename(docPath)
      };
    }

    async runTransaction(txnCallback) {
      const maxRetries = 15;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const readSnapshots = new Map();
        const pendingMutations = new Map();

        const txn = {
          get: async (ref) => {
            const p = typeof ref === 'string' ? ref : (ref.path || ref.id);
            const currentVer = this.versions.get(p) || 0;
            readSnapshots.set(p, currentVer);
            return this.get(p);
          },
          update: (ref, fields) => {
            const p = typeof ref === 'string' ? ref : (ref.path || ref.id);
            pendingMutations.set(p, fields);
          }
        };

        try {
          const res = await txnCallback(txn);

          // Check if any read document was mutated concurrently
          let conflicted = false;
          for (const [p, readVer] of readSnapshots.entries()) {
            if ((this.versions.get(p) || 0) !== readVer) {
              conflicted = true;
              break;
            }
          }

          if (conflicted) {
            // Contention backoff and retry
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 5));
            continue;
          }

          // Commit mutations
          for (const [p, fields] of pendingMutations.entries()) {
            const existing = this.store.get(p) || {};
            this.store.set(p, { ...existing, ...fields });
            this.versions.set(p, (this.versions.get(p) || 0) + 1);
          }

          return res;
        } catch (err) {
          throw err;
        }
      }
      throw new Error('Firestore Transaction contention exceeded retry limit');
    }
  }

  // ------------------------------------------------------------------------
  // ADV-1: 10-STATION CONCURRENT STAMPEDE FOR SINGLE KOT JOB
  // ------------------------------------------------------------------------
  console.log('📍 ADVERSARIAL TEST 1: 10-STATION CONCURRENT STAMPEDE');

  await itAsync('ADV-01: 10 stations simultaneously claim 1 queued job -> exactly 1 succeeds, 9 fail', async () => {
    const db = new TransactionalFirestoreMock();
    const jobId = 'kot_stampede_001';
    const docPath = `shops/main_store/print_queue/${jobId}`;
    db.set(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    const stations = Array.from({ length: 10 }, (_, i) => `station_node_${i + 1}`);

    const results = await Promise.all(
      stations.map(stationId =>
        claimPrintJob(db, 'main_store', jobId, stationId, {
          jobRef: docRef,
          runTransaction: db.runTransaction.bind(db)
        })
          .then(res => ({ success: true, stationId, res }))
          .catch(err => ({ success: false, stationId, err: err.message }))
      )
    );

    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winner, but got ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Expected exactly 9 losers, but got ${losers.length}`);
    for (const loser of losers) {
      assert.strictEqual(loser.err, 'Job already claimed or printed');
    }

    const finalDoc = db.get(docPath).data();
    assert.strictEqual(finalDoc.status, 'processing');
    assert.strictEqual(finalDoc.leasedBy, winners[0].stationId);
    assert.strictEqual(finalDoc.attempts, 1);
  });

  // ------------------------------------------------------------------------
  // ADV-2: MULTI-JOB HIGH-THROUGHPUT BURST (20 JOBS x 5 WORKERS)
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 2: MULTI-JOB BURST (20 JOBS x 5 STATIONS)');

  await itAsync('ADV-02: 20 queued jobs claimed across 5 stations -> each job claimed exactly once', async () => {
    const db = new TransactionalFirestoreMock();
    const jobIds = Array.from({ length: 20 }, (_, i) => `job_burst_${i + 1}`);

    for (const jid of jobIds) {
      db.set(`shops/main_store/print_queue/${jid}`, {
        jobId: jid,
        jobType: 'KOT',
        status: 'queued',
        attempts: 0,
        leasedBy: null,
        leasedAt: null
      });
    }

    const stations = ['worker_alpha', 'worker_beta', 'worker_gamma', 'worker_delta', 'worker_epsilon'];
    const claimLogs = [];

    // Each station tries to claim each job concurrently
    const allClaimPromises = [];
    for (const jid of jobIds) {
      const docRef = { path: `shops/main_store/print_queue/${jid}`, id: jid };
      for (const st of stations) {
        allClaimPromises.push(
          claimPrintJob(db, 'main_store', jid, st, {
            jobRef: docRef,
            runTransaction: db.runTransaction.bind(db)
          })
            .then(res => claimLogs.push({ jobId: jid, stationId: st, success: true }))
            .catch(() => claimLogs.push({ jobId: jid, stationId: st, success: false }))
        );
      }
    }

    await Promise.all(allClaimPromises);

    const successfulClaims = claimLogs.filter(c => c.success);
    assert.strictEqual(successfulClaims.length, 20, 'Each of the 20 jobs must be claimed exactly once in total');

    // Verify each job was claimed by a unique station
    const claimedJobSet = new Set(successfulClaims.map(c => c.jobId));
    assert.strictEqual(claimedJobSet.size, 20, 'All 20 distinct jobs must be represented');
  });

  // ------------------------------------------------------------------------
  // ADV-3: 60-SECOND ZOMBIE LEASE PRECISION BOUNDARY
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 3: 60-SECOND ZOMBIE LEASE PRECISION BOUNDARY');

  await itAsync('ADV-03: Boundary condition at 59,900 ms (reject) vs 60,100 ms (accept)', async () => {
    const db = new TransactionalFirestoreMock();

    // Job 1: Leased 59,900 ms ago (still within 60s window)
    const freshJobId = 'kot_boundary_fresh';
    const freshDocPath = `shops/main_store/print_queue/${freshJobId}`;
    db.set(freshDocPath, {
      jobId: freshJobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'station_1',
      leasedAt: new Date(Date.now() - 59900).toISOString()
    });

    let freshClaimRejected = false;
    try {
      await claimPrintJob(db, 'main_store', freshJobId, 'station_2', {
        jobRef: { path: freshDocPath, id: freshJobId },
        runTransaction: db.runTransaction.bind(db)
      });
    } catch (err) {
      freshClaimRejected = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(freshClaimRejected, true, '59.9s lease MUST NOT be reclaimable');

    // Job 2: Leased 60,100 ms ago (strictly past 60s window)
    const expiredJobId = 'kot_boundary_expired';
    const expiredDocPath = `shops/main_store/print_queue/${expiredJobId}`;
    db.set(expiredDocPath, {
      jobId: expiredJobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'station_1',
      leasedAt: new Date(Date.now() - 60100).toISOString()
    });

    const claimedExpired = await claimPrintJob(db, 'main_store', expiredJobId, 'station_2', {
      jobRef: { path: expiredDocPath, id: expiredJobId },
      runTransaction: db.runTransaction.bind(db)
    });

    assert.strictEqual(claimedExpired.status, 'processing');
    assert.strictEqual(claimedExpired.leasedBy, 'station_2');
    assert.strictEqual(claimedExpired.attempts, 2);
  });

  // ------------------------------------------------------------------------
  // ADV-4: MULTI-STAGE ZOMBIE CRASH CASCADE
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 4: MULTI-STAGE ZOMBIE CRASH CASCADE');

  await itAsync('ADV-04: Station A leases & crashes -> Station B reclaims & crashes -> Station C reclaims (attempts = 3)', async () => {
    const db = new TransactionalFirestoreMock();
    const cascadeJobId = 'kot_cascade_001';
    const docPath = `shops/main_store/print_queue/${cascadeJobId}`;

    // Step 1: Queued initial
    db.set(docPath, {
      jobId: cascadeJobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });
    const docRef = { path: docPath, id: cascadeJobId };

    // Station A claims
    const claimA = await claimPrintJob(db, 'main_store', cascadeJobId, 'station_A', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    assert.strictEqual(claimA.attempts, 1);
    assert.strictEqual(claimA.leasedBy, 'station_A');

    // Simulate Station A crashed 65s ago
    const docA = db.get(docPath).data();
    docA.leasedAt = new Date(Date.now() - 65000).toISOString();
    db.set(docPath, docA);

    // Station B reclaims
    const claimB = await claimPrintJob(db, 'main_store', cascadeJobId, 'station_B', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    assert.strictEqual(claimB.attempts, 2);
    assert.strictEqual(claimB.leasedBy, 'station_B');

    // Simulate Station B crashed 70s ago
    const docB = db.get(docPath).data();
    docB.leasedAt = new Date(Date.now() - 70000).toISOString();
    db.set(docPath, docB);

    // Station C reclaims
    const claimC = await claimPrintJob(db, 'main_store', cascadeJobId, 'station_C', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    assert.strictEqual(claimC.attempts, 3);
    assert.strictEqual(claimC.leasedBy, 'station_C');
  });

  // ------------------------------------------------------------------------
  // ADV-5: PAYLOAD POISONING & CASE SENSITIVITY ATTACKS
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 5: PAYLOAD POISONING & CASE SENSITIVITY');

  await itAsync('ADV-05: Malicious / malformed payloads are strictly rejected with [Security Violation]', async () => {
    const maliciousPayloads = [
      { jobType: 'kot', tableNo: 'T1', items: [] },            // lowercase
      { jobType: 'KOT ', tableNo: 'T1', items: [] },           // whitespace
      { jobType: 'Receipt', tableNo: 'T1', items: [] },        // mixed case
      { jobType: 'BILL', tableNo: 'T1', items: [] },           // billing
      { jobType: 'INVOICE', tableNo: 'T1', items: [] },        // invoice
      { jobType: 'KOT', billNo: '', items: [] },               // empty string billNo
      { jobType: 'KOT', bill_no: '', items: [] },              // empty string bill_no
      { jobType: 'KOT', amount: 0, items: [] },                // numeric 0 amount
      { jobType: 'KOT', final_payable_paise: 0, items: [] },   // numeric 0 paise
      { jobType: 'KOT', grandTotal: 0, items: [] },            // numeric 0 grandTotal
      { jobType: 'KOT', paymentMode: '', items: [] },          // payment mode
      { jobType: 'KOT', subtotal: 0, items: [] },              // subtotal
      { jobType: 'KOT', totalTax: 0, items: [] }               // totalTax
    ];

    for (const payload of maliciousPayloads) {
      let rejected = false;
      try {
        await enqueueCloudKotPrintJob(payload);
      } catch (err) {
        if (err.message.includes('[Security Violation]')) {
          rejected = true;
        }
      }
      assert.strictEqual(rejected, true, `Payload failed security rejection: ${JSON.stringify(payload)}`);
    }
  });

  // ------------------------------------------------------------------------
  // ADV-6: RETRY CEILING & TERMINATION BOUNDARY
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 6: RETRY CEILING & TERMINATION BOUNDARY');

  await itAsync('ADV-06: Complete print failure retry thresholds: 1 -> queued, 2 -> queued, 3 -> failed, 4 -> failed', async () => {
    const testMatrix = [
      { attempts: 1, expectedStatus: 'queued' },
      { attempts: 2, expectedStatus: 'queued' },
      { attempts: 3, expectedStatus: 'failed' },
      { attempts: 4, expectedStatus: 'failed' }
    ];

    for (const { attempts, expectedStatus } of testMatrix) {
      const db = new TransactionalFirestoreMock();
      const jobId = `kot_retry_test_${attempts}`;
      const docPath = `shops/main_store/print_queue/${jobId}`;

      db.set(docPath, {
        jobId,
        status: 'processing',
        attempts
      });

      const res = await completePrintJob(
        db,
        'main_store',
        jobId,
        false,
        new Error('Hardware Jam'),
        {
          jobRef: { path: docPath, id: jobId },
          attempts,
          updateDoc: async (ref, updateData) => {
            const current = db.get(docPath).data();
            db.set(docPath, { ...current, ...updateData });
          }
        }
      );

      assert.strictEqual(res.status, expectedStatus, `At attempt ${attempts}, status must be ${expectedStatus}`);
      const updated = db.get(docPath).data();
      assert.strictEqual(updated.status, expectedStatus);
    }
  });

  // ------------------------------------------------------------------------
  // ADV-7: SOURCE CODE FORENSIC AUDIT (ZERO DUMMY IMPLEMENTATIONS)
  // ------------------------------------------------------------------------
  console.log('\n📍 ADVERSARIAL TEST 7: FORENSIC CODE INTEGRITY AUDIT');

  it('ADV-07: Verify genuine implementation logic with no hardcoded bypasses or test intercepts', () => {
    const platformBridgeCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'platform-bridge.js'), 'utf8');

    // Check that enqueueCloudKotPrintJob performs real validation and doc building
    assert.ok(platformBridgeCode.includes('jobPayload.jobType !== \'KOT\''), 'jobType validation missing');
    assert.ok(platformBridgeCode.includes('forbiddenBillingFields'), 'forbiddenBillingFields array missing');
    assert.ok(platformBridgeCode.includes('now - new Date(data.leasedAt).getTime() > 60000'), '60000ms lease formula missing');
    assert.ok(platformBridgeCode.includes('txn.update(jobRef, updateData)'), 'Transactional update missing');

    // Ensure there are no test-only bypass hacks like `if (process.env.TEST) return true;`
    assert.strictEqual(platformBridgeCode.includes('process.env.TEST'), false, 'Found suspicious test bypass hack');
    assert.strictEqual(platformBridgeCode.includes('mockSuccess'), false, 'Found mockSuccess shortcut in platform bridge');
  });

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL SUITE RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ Adversarial stress test failed:', failureReports);
    process.exit(1);
  } else {
    console.log('✨ ALL ADVERSARIAL STRESS TESTS AND INTEGRITY AUDITS PASSED 100%!\n');
    process.exit(0);
  }
}

runAdversarialM3Audit().catch(err => {
  console.error('Fatal crash in adversarial runner:', err);
  process.exit(1);
});
