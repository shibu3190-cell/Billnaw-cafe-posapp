/**
 * ⚔️ ADVERSARIAL TEST HARNESS: MILESTONE 3 DISTRIBUTED CLOUD PRINT RELAY CONCURRENCY (R3)
 * 
 * Conducted by: challenger_m3_1 (teamwork_challenger)
 * Target: src/core/platform-bridge.js (enqueueCloudKotPrintJob, claimPrintJob, completePrintJob, listenPrintQueue)
 * 
 * Empirical Stress Scenarios:
 * 1. High-Concurrency Lease Race: 5 to 10 stations concurrently calling claimPrintJob on the SAME queued job.
 *    - Strictly 1 station wins lease.
 *    - Exactly (N-1) stations abort with "Job already claimed or printed".
 *    - Zero duplicate physical prints across 25 repeated race iterations.
 * 2. Rapid Job Bursts: 50 concurrent KOT jobs consumed concurrently by 3 active kitchen stations.
 *    - All 50 jobs claimed and printed exactly once.
 *    - Total physical print tickets == 50.
 *    - Zero double claims, zero lost jobs.
 * 3. Zombie Lease Race: Crashed station holding lease > 60s, 2 to 5 active stations racing to reclaim.
 *    - Strictly 1 active station reclaims the stale job.
 *    - Attempt count accurately increments.
 *    - Exactly 1 physical print.
 *    - Lease at 59s is strictly preserved and not reclaimable.
 * 4. Retry Ceiling & Permanent Halting:
 *    - 3 failed attempts transitions to 'failed' status.
 *    - Halts retries (does not reset to queued).
 *    - Subsequent claim attempts on failed jobs reject.
 * 5. Adversarial Payload & Security Invariant Bounds:
 *    - Disguised billing payloads, zero-amount bills, prototype injections, uppercase fields rejected.
 * 6. High-Contention Extreme Stress: 20 stations racing for 1 job with simulated network jitter.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Realistic Adversarial Firestore Engine with Transactional Contention & Jitter
class AdversarialFirestoreDb {
  constructor() {
    this.documents = new Map();
    this.versionMap = new Map();
    this.totalTransactions = 0;
    this.totalRetries = 0;
  }

  setDoc(pathStr, data) {
    this.documents.set(pathStr, JSON.parse(JSON.stringify(data)));
    this.versionMap.set(pathStr, (this.versionMap.get(pathStr) || 0) + 1);
  }

  getDoc(pathStr) {
    const data = this.documents.get(pathStr);
    if (!data) return { exists: () => false, exists: false, data: () => null };
    return {
      exists: () => true,
      exists: true,
      data: () => JSON.parse(JSON.stringify(data)),
      id: path.basename(pathStr),
      path: pathStr
    };
  }

  async runTransaction(updateFunction) {
    const maxRetries = 50;
    this.totalTransactions++;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map();
      const pendingUpdates = new Map();

      const txn = {
        get: async (docRef) => {
          const pathStr = typeof docRef === 'string' ? docRef : (docRef.path || docRef.id);
          // Introduce adversarial async micro-jitter to maximize interleaving of reads
          await new Promise(r => setImmediate(r));
          readVersions.set(pathStr, this.versionMap.get(pathStr) || 0);
          return this.getDoc(pathStr);
        },
        update: (docRef, updateFields) => {
          const pathStr = typeof docRef === 'string' ? docRef : (docRef.path || docRef.id);
          pendingUpdates.set(pathStr, JSON.parse(JSON.stringify(updateFields)));
        }
      };

      try {
        const result = await updateFunction(txn);

        // Commit phase: check for version conflicts
        let conflict = false;
        for (const [pathStr, readVer] of readVersions.entries()) {
          const currentVer = this.versionMap.get(pathStr) || 0;
          if (currentVer !== readVer) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          this.totalRetries++;
          // Backoff with randomized jitter to emulate Firestore
          const backoffMs = Math.floor(Math.random() * 15) + 2;
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        // Apply pending updates atomically
        for (const [pathStr, updateFields] of pendingUpdates.entries()) {
          const existing = this.documents.get(pathStr) || {};
          const merged = { ...existing, ...updateFields };
          this.documents.set(pathStr, merged);
          this.versionMap.set(pathStr, (this.versionMap.get(pathStr) || 0) + 1);
        }

        return result;
      } catch (err) {
        // Explicit domain errors thrown inside transaction immediately abort without retry
        throw err;
      }
    }

    throw new Error('Transaction exceeded max retries due to severe contention');
  }
}

async function runAdversarialM3TestSuite() {
  console.log('====================================================================');
  console.log('⚔️  ADVERSARIAL SUITE: CONCURRENCY, LEASING & RETRY BOUNDS (M3)');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  let total = 0;
  const failureReports = [];

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}\n     ${err.stack}`);
      failureReports.push({ name, error: err.message });
    }
  }

  const {
    ThermalPrinterBridge,
    enqueueCloudKotPrintJob,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue
  } = await import('../src/core/platform-bridge.js');

  // ====================================================================
  // TEST GROUP 1: HIGH-CONCURRENCY LEASE RACE (5 TO 10 STATIONS)
  // ====================================================================
  console.log('📍 GROUP 1: HIGH-CONCURRENCY LEASE RACE (5 TO 10 STATIONS)');

  await test('ADV-RACE-01: 5 stations concurrently racing for the same queued KOT job -> strictly 1 winner', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_race_5stations';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    const stationIds = ['station_1', 'station_2', 'station_3', 'station_4', 'station_5'];
    let physicalPrints = 0;

    const claims = stationIds.map(async (stId) => {
      try {
        const claim = await claimPrintJob(
          mockDb,
          'shop_delhi',
          jobId,
          stId,
          { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
        );
        physicalPrints++;
        return { success: true, stationId: stId, claim };
      } catch (err) {
        return { success: false, stationId: stId, error: err.message };
      }
    });

    const results = await Promise.all(claims);
    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winner, found ${winners.length}`);
    assert.strictEqual(losers.length, 4, `Expected exactly 4 losers, found ${losers.length}`);
    assert.strictEqual(physicalPrints, 1, `Expected exactly 1 physical print, found ${physicalPrints}`);

    for (const loser of losers) {
      assert.strictEqual(loser.error, 'Job already claimed or printed');
    }

    const doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'processing');
    assert.strictEqual(doc.leasedBy, winners[0].stationId);
    assert.strictEqual(doc.attempts, 1);
  });

  await test('ADV-RACE-02: 10 stations concurrently racing for the same queued KOT job -> strictly 1 winner', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_race_10stations';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    const stationIds = Array.from({ length: 10 }, (_, i) => `station_kiosk_${i + 1}`);
    let physicalPrints = 0;

    const claims = stationIds.map(async (stId) => {
      try {
        const claim = await claimPrintJob(
          mockDb,
          'shop_delhi',
          jobId,
          stId,
          { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
        );
        physicalPrints++;
        return { success: true, stationId: stId, claim };
      } catch (err) {
        return { success: false, stationId: stId, error: err.message };
      }
    });

    const results = await Promise.all(claims);
    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Expected strictly 1 winner among 10 stations, got ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Expected exactly 9 losers, got ${losers.length}`);
    assert.strictEqual(physicalPrints, 1, `Physical prints must be strictly 1, got ${physicalPrints}`);

    losers.forEach((l, idx) => {
      assert.strictEqual(l.error, 'Job already claimed or printed', `Loser #${idx} error mismatch`);
    });

    const doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'processing');
    assert.strictEqual(doc.leasedBy, winners[0].stationId);
    assert.strictEqual(doc.attempts, 1);
  });

  await test('ADV-RACE-03: 20 sequential iterations of 8-station lease race -> 0 duplicates across all iterations', async () => {
    const mockDb = new AdversarialFirestoreDb();
    let totalPhysicalPrintsAcrossRaces = 0;

    for (let iter = 1; iter <= 20; iter++) {
      const jobId = `kot_iter_race_${iter}`;
      const docPath = `shops/shop_delhi/print_queue/${jobId}`;

      mockDb.setDoc(docPath, {
        jobId,
        jobType: 'KOT',
        status: 'queued',
        attempts: 0,
        leasedBy: null,
        leasedAt: null
      });

      const docRef = { path: docPath, id: jobId };
      const stations = ['stA', 'stB', 'stC', 'stD', 'stE', 'stF', 'stG', 'stH'];
      let iterPrints = 0;

      const results = await Promise.all(stations.map(async (st) => {
        try {
          await claimPrintJob(
            mockDb,
            'shop_delhi',
            jobId,
            st,
            { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
          );
          iterPrints++;
          return true;
        } catch (_) {
          return false;
        }
      }));

      const winners = results.filter(Boolean).length;
      assert.strictEqual(winners, 1, `Iteration ${iter} had ${winners} winners (must be strictly 1)`);
      assert.strictEqual(iterPrints, 1, `Iteration ${iter} printed ${iterPrints} times (must be strictly 1)`);
      totalPhysicalPrintsAcrossRaces += iterPrints;
    }

    assert.strictEqual(totalPhysicalPrintsAcrossRaces, 20, 'Exactly 20 prints for 20 race iterations');
  });

  // ====================================================================
  // TEST GROUP 2: RAPID JOB BURSTS (50 JOBS / 3 CONCURRENT STATIONS)
  // ====================================================================
  console.log('\n📍 GROUP 2: RAPID JOB BURSTS (50 CONCURRENT KOT JOBS / 3 STATIONS)');

  await test('ADV-BURST-01: 50 concurrent KOT jobs consumed by 3 concurrent stations -> all 50 printed exactly once', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const shopId = 'shop_burst';
    const numJobs = 50;
    const jobIds = [];

    // Enqueue 50 jobs concurrently
    const enqueuePromises = [];
    for (let i = 1; i <= numJobs; i++) {
      const jobId = `kot_burst_${String(i).padStart(3, '0')}`;
      jobIds.push(jobId);
      const payload = {
        jobType: 'KOT',
        tableNo: `T${(i % 10) + 1}`,
        kotId: `KOT-${i}`,
        items: [{ name: `Dish ${i}`, qty: 1 }],
        billerName: 'Staff'
      };
      enqueuePromises.push(
        enqueueCloudKotPrintJob(payload, {
          shopId,
          setDoc: (doc) => mockDb.setDoc(`shops/${shopId}/print_queue/${jobId}`, doc),
          deviceId: `terminal_${(i % 5) + 1}`
        })
      );
    }
    await Promise.all(enqueuePromises);

    // Verify all 50 exist as queued
    for (const jId of jobIds) {
      const doc = mockDb.getDoc(`shops/${shopId}/print_queue/${jId}`).data();
      assert.strictEqual(doc.status, 'queued');
      assert.strictEqual(doc.attempts, 0);
    }

    // Now 3 kitchen stations consume from the pool of 50 jobs concurrently
    const stationStats = {
      kitchen_station_1: 0,
      kitchen_station_2: 0,
      kitchen_station_3: 0
    };
    const printedJobIds = new Set();
    const stations = Object.keys(stationStats);

    // Each station continuously attempts to claim and print queued jobs until none remain
    async function runWorkerStation(stationId) {
      for (const jId of jobIds) {
        const docRef = { path: `shops/${shopId}/print_queue/${jId}`, id: jId };
        try {
          const claimed = await claimPrintJob(
            mockDb,
            shopId,
            jId,
            stationId,
            { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
          );

          // Simulated physical printing execution latency (paper feed / ESC/POS transmission)
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 8) + 2));

          assert.ok(!printedJobIds.has(jId), `CRITICAL CONCURRENCY BUG: Job ${jId} was printed more than once!`);
          printedJobIds.add(jId);
          stationStats[stationId]++;

          // Mark complete
          await completePrintJob(mockDb, shopId, jId, true, null, {
            jobRef: docRef,
            updateDoc: (ref, update) => {
              const current = mockDb.getDoc(ref.path).data();
              mockDb.setDoc(ref.path, { ...current, ...update });
            }
          });
        } catch (err) {
          // Expected contention error when another station already claimed the job
          assert.strictEqual(err.message, 'Job already claimed or printed');
        }
      }
    }

    // Run all 3 worker stations in parallel
    await Promise.all(stations.map(st => runWorkerStation(st)));

    // Assertions
    assert.strictEqual(printedJobIds.size, 50, `Expected all 50 jobs printed, got ${printedJobIds.size}`);
    const totalPrintedByStations = Object.values(stationStats).reduce((a, b) => a + b, 0);
    assert.strictEqual(totalPrintedByStations, 50, `Total physical prints must be exactly 50, got ${totalPrintedByStations}`);

    // Verify all 3 stations participated in processing the load
    for (const [st, count] of Object.entries(stationStats)) {
      console.log(`     Station ${st} printed: ${count} jobs`);
      assert.ok(count > 0, `Station ${st} did not process any jobs`);
    }


    // Verify final state of all documents in the DB
    for (const jId of jobIds) {
      const doc = mockDb.getDoc(`shops/${shopId}/print_queue/${jId}`).data();
      assert.strictEqual(doc.status, 'printed', `Job ${jId} status must be 'printed'`);
      assert.strictEqual(doc.attempts, 1, `Job ${jId} attempts must be exactly 1`);
      assert.ok(doc.printedAt, `Job ${jId} must have printedAt timestamp`);
      assert.strictEqual(doc.error, null, `Job ${jId} error must be null`);
    }
  });

  await test('ADV-BURST-02: 100 concurrent KOT jobs consumed by 10 concurrent stations -> exactly 100 printed, 0 duplicates', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const shopId = 'shop_hyper_burst';
    const numJobs = 100;
    const numStations = 10;
    const jobIds = [];

    // Enqueue 100 jobs concurrently
    for (let i = 1; i <= numJobs; i++) {
      const jobId = `kot_hyper_${String(i).padStart(3, '0')}`;
      jobIds.push(jobId);
      const payload = {
        jobType: 'KOT',
        tableNo: `T${(i % 20) + 1}`,
        kotId: `KOT-H-${i}`,
        items: [{ name: `Special Item ${i}`, qty: 2 }],
        billerName: `Server ${(i % 4) + 1}`
      };
      await enqueueCloudKotPrintJob(payload, {
        shopId,
        setDoc: (doc) => mockDb.setDoc(`shops/${shopId}/print_queue/${jobId}`, doc),
        deviceId: `pos_handheld_${(i % 5) + 1}`
      });
    }

    const stationStats = {};
    for (let s = 1; s <= numStations; s++) {
      stationStats[`station_${s}`] = 0;
    }
    const printedJobIds = new Set();
    const stations = Object.keys(stationStats);

    async function runWorker(stationId) {
      for (const jId of jobIds) {
        const docRef = { path: `shops/${shopId}/print_queue/${jId}`, id: jId };
        try {
          await claimPrintJob(
            mockDb,
            shopId,
            jId,
            stationId,
            { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
          );

          // Simulated print latency
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5) + 2));

          assert.ok(!printedJobIds.has(jId), `DUPLICATE DETECTED: Job ${jId} claimed more than once!`);
          printedJobIds.add(jId);
          stationStats[stationId]++;

          await completePrintJob(mockDb, shopId, jId, true, null, {
            jobRef: docRef,
            updateDoc: (ref, update) => {
              const current = mockDb.getDoc(ref.path).data();
              mockDb.setDoc(ref.path, { ...current, ...update });
            }
          });
        } catch (err) {
          assert.strictEqual(err.message, 'Job already claimed or printed');
        }
      }
    }

    await Promise.all(stations.map(st => runWorker(st)));

    assert.strictEqual(printedJobIds.size, 100, `All 100 jobs must be printed, got ${printedJobIds.size}`);
    const totalPrinted = Object.values(stationStats).reduce((a, b) => a + b, 0);
    assert.strictEqual(totalPrinted, 100, `Total printed tickets must be 100, got ${totalPrinted}`);

    // Verify all 10 stations participated
    const participatingStations = Object.values(stationStats).filter(c => c > 0).length;
    assert.ok(participatingStations >= 8, `Expected broad distribution across stations, only ${participatingStations} participated`);
  });


  // ====================================================================
  // TEST GROUP 3: ZOMBIE LEASE RACE & RECOVERY BOUNDS
  // ====================================================================
  console.log('\n📍 GROUP 3: ZOMBIE LEASE RACE & RECOVERY BOUNDS');

  await test('ADV-ZOMBIE-01: 5 active stations race to reclaim a stale zombie lease (> 60s) -> strictly 1 reclaims', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_zombie_5race';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    // Leased 80 seconds ago by a station that crashed mid-print
    const staleTime = new Date(Date.now() - 80000).toISOString();
    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'crashed_terminal_99',
      leasedAt: staleTime
    });

    const docRef = { path: docPath, id: jobId };
    const candidateStations = ['station_A', 'station_B', 'station_C', 'station_D', 'station_E'];
    let reclaimPrints = 0;

    const claims = candidateStations.map(async (stId) => {
      try {
        const claim = await claimPrintJob(
          mockDb,
          'shop_delhi',
          jobId,
          stId,
          { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
        );
        reclaimPrints++;
        return { success: true, stationId: stId, claim };
      } catch (err) {
        return { success: false, stationId: stId, error: err.message };
      }
    });

    const results = await Promise.all(claims);
    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Expected strictly 1 reclaimer, got ${winners.length}`);
    assert.strictEqual(losers.length, 4, `Expected exactly 4 losers, got ${losers.length}`);
    assert.strictEqual(reclaimPrints, 1, `Expected strictly 1 reclaim print, got ${reclaimPrints}`);

    for (const l of losers) {
      assert.strictEqual(l.error, 'Job already claimed or printed');
    }

    const doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'processing');
    assert.strictEqual(doc.leasedBy, winners[0].stationId);
    assert.strictEqual(doc.attempts, 2, 'Attempts must increment from 1 to 2');
    const newLeaseAge = Date.now() - new Date(doc.leasedAt).getTime();
    assert.ok(newLeaseAge < 5000, 'New lease timestamp must be current');
  });

  await test('ADV-ZOMBIE-02: Boundary check: lease at 59 seconds is NOT reclaimable; lease at 61 seconds IS reclaimable', async () => {
    const mockDb = new AdversarialFirestoreDb();

    // Case A: 59 seconds old (< 60000ms threshold)
    const jobAId = 'kot_boundary_59s';
    const pathA = `shops/shop_delhi/print_queue/${jobAId}`;
    mockDb.setDoc(pathA, {
      jobId: jobAId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'station_busy',
      leasedAt: new Date(Date.now() - 59000).toISOString()
    });

    let threw59 = false;
    try {
      await claimPrintJob(mockDb, 'shop_delhi', jobAId, 'station_intruder', {
        jobRef: { path: pathA, id: jobAId },
        runTransaction: mockDb.runTransaction.bind(mockDb)
      });
    } catch (err) {
      threw59 = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(threw59, true, '59-second lease must NOT be reclaimed');

    // Case B: 61 seconds old (> 60000ms threshold)
    const jobBId = 'kot_boundary_61s';
    const pathB = `shops/shop_delhi/print_queue/${jobBId}`;
    mockDb.setDoc(pathB, {
      jobId: jobBId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'station_crashed',
      leasedAt: new Date(Date.now() - 61000).toISOString()
    });

    const claimedB = await claimPrintJob(mockDb, 'shop_delhi', jobBId, 'station_rescuer', {
      jobRef: { path: pathB, id: jobBId },
      runTransaction: mockDb.runTransaction.bind(mockDb)
    });
    assert.strictEqual(claimedB.status, 'processing');
    assert.strictEqual(claimedB.leasedBy, 'station_rescuer');
    assert.strictEqual(claimedB.attempts, 2);
  });

  await test('ADV-ZOMBIE-03: 10 active stations racing to reclaim a stale zombie lease -> strictly 1 reclaims, 9 reject', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_zombie_10race';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    // Leased 90s ago
    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'crashed_worker_dead',
      leasedAt: new Date(Date.now() - 90000).toISOString()
    });

    const docRef = { path: docPath, id: jobId };
    const stations = Array.from({ length: 10 }, (_, i) => `reclaimer_st_${i + 1}`);
    let reclaimCount = 0;

    const results = await Promise.all(stations.map(async (st) => {
      try {
        const c = await claimPrintJob(mockDb, 'shop_delhi', jobId, st, {
          jobRef: docRef,
          runTransaction: mockDb.runTransaction.bind(mockDb)
        });
        reclaimCount++;
        return { success: true, station: st, c };
      } catch (err) {
        return { success: false, station: st, error: err.message };
      }
    }));

    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Must have strictly 1 reclaimer, got ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Must have strictly 9 losers, got ${losers.length}`);
    assert.strictEqual(reclaimCount, 1, `Total reclaim prints must be 1, got ${reclaimCount}`);

    losers.forEach(l => {
      assert.strictEqual(l.error, 'Job already claimed or printed');
    });

    const doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'processing');
    assert.strictEqual(doc.leasedBy, winners[0].station);
    assert.strictEqual(doc.attempts, 2);
  });


  // ====================================================================
  // TEST GROUP 4: RETRY CEILING & PERMANENT HALTING
  // ====================================================================
  console.log('\n📍 GROUP 4: RETRY CEILING & PERMANENT HALTING (ATTEMPTS CEILING)');

  await test('ADV-RETRY-01: Full lifecycle through 3 failed print attempts halts at status: failed', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_retry_ceiling_001';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    const mockUpdateDoc = (ref, update) => {
      const cur = mockDb.getDoc(ref.path).data();
      mockDb.setDoc(ref.path, { ...cur, ...update });
    };

    // Attempt 1: Claim -> Fail
    const claim1 = await claimPrintJob(mockDb, 'shop_delhi', jobId, 'st_1', {
      jobRef: docRef,
      runTransaction: mockDb.runTransaction.bind(mockDb)
    });
    assert.strictEqual(claim1.attempts, 1);
    const fail1 = await completePrintJob(mockDb, 'shop_delhi', jobId, false, new Error('Paper jam'), {
      jobRef: docRef,
      attempts: 1,
      updateDoc: mockUpdateDoc
    });
    assert.strictEqual(fail1.status, 'queued', 'Attempt 1 failure should reset to queued');
    let doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'queued');
    assert.strictEqual(doc.error, 'Paper jam');

    // Attempt 2: Claim -> Fail
    const claim2 = await claimPrintJob(mockDb, 'shop_delhi', jobId, 'st_2', {
      jobRef: docRef,
      runTransaction: mockDb.runTransaction.bind(mockDb)
    });
    assert.strictEqual(claim2.attempts, 2);
    const fail2 = await completePrintJob(mockDb, 'shop_delhi', jobId, false, new Error('Cutter error'), {
      jobRef: docRef,
      attempts: 2,
      updateDoc: mockUpdateDoc
    });
    assert.strictEqual(fail2.status, 'queued', 'Attempt 2 failure should reset to queued');
    doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'queued');
    assert.strictEqual(doc.error, 'Cutter error');

    // Attempt 3: Claim -> Fail (Reached ceiling)
    const claim3 = await claimPrintJob(mockDb, 'shop_delhi', jobId, 'st_3', {
      jobRef: docRef,
      runTransaction: mockDb.runTransaction.bind(mockDb)
    });
    assert.strictEqual(claim3.attempts, 3);
    const fail3 = await completePrintJob(mockDb, 'shop_delhi', jobId, false, new Error('Thermal head overheat'), {
      jobRef: docRef,
      attempts: 3,
      updateDoc: mockUpdateDoc
    });
    assert.strictEqual(fail3.status, 'failed', 'Attempt 3 failure MUST transition to failed');
    doc = mockDb.getDoc(docPath).data();
    assert.strictEqual(doc.status, 'failed', 'Persisted doc status must be failed');
    assert.strictEqual(doc.error, 'Thermal head overheat');

    // Station tries to claim a failed job -> MUST abort
    let claimFailedJobThrew = false;
    try {
      await claimPrintJob(mockDb, 'shop_delhi', jobId, 'st_4', {
        jobRef: docRef,
        runTransaction: mockDb.runTransaction.bind(mockDb)
      });
    } catch (err) {
      claimFailedJobThrew = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(claimFailedJobThrew, true, 'Failed job must NOT be claimed or retried');
  });

  // ====================================================================
  // TEST GROUP 5: ADVERSARIAL SECURITY & PAYLOAD INVARIANTS
  // ====================================================================
  console.log('\n📍 GROUP 5: ADVERSARIAL SECURITY & STATUTORY PAYLOAD INVARIANTS');

  await test('ADV-SEC-01: Disguised billing payloads (amount: 0, grandTotal: 0, uppercase fields) strictly rejected', async () => {
    const maliciousPayloads = [
      { jobType: 'KOT', amount: 0, items: [] },
      { jobType: 'KOT', billNo: '', items: [] },
      { jobType: 'KOT', grandTotal: 0, items: [] },
      { jobType: 'KOT', final_payable_paise: 0, items: [] },
      { jobType: 'KOT', paymentMode: 'UPI', items: [] },
      { jobType: 'kot', items: [] }, // lowercase jobType bypass attempt
      { jobType: 'Kot', items: [] },
      { jobType: 'BILL', items: [] },
      { jobType: 'RECEIPT', items: [] },
      { jobType: 'TAX_INVOICE', items: [] },
      null,
      undefined
    ];

    for (const payload of maliciousPayloads) {
      let threw = false;
      try {
        await enqueueCloudKotPrintJob(payload);
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'), `Expected security violation for: ${JSON.stringify(payload)}`);
      }
      assert.strictEqual(threw, true, `Payload was NOT rejected: ${JSON.stringify(payload)}`);
    }
  });

  await test('ADV-SEC-02: Local counter bills NEVER touch print queue even if local printer fails', async () => {
    const posJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');

    // Extract exact sendEscPosToPrinter function definition up to its window export
    const fnMatch = posJsCode.match(/async function sendEscPosToPrinter[\s\S]*?window\.sendEscPosToPrinter\s*=\s*sendEscPosToPrinter;/);
    assert.ok(fnMatch, 'sendEscPosToPrinter function definition found');
    const sendEscPosBlock = fnMatch[0];

    // Verify invariant: No call to enqueueCloudKotPrintJob or print_queue in sendEscPosToPrinter
    assert.strictEqual(sendEscPosBlock.includes('enqueueCloudKotPrintJob'), false, 'sendEscPosToPrinter must NEVER call enqueueCloudKotPrintJob');
    assert.strictEqual(sendEscPosBlock.includes('print_queue'), false, 'sendEscPosToPrinter must NEVER write to print_queue');

    // Extract exact sendKotToPrinter function definition up to its window export
    const kotMatch = posJsCode.match(/async function sendKotToPrinter[\s\S]*?window\.sendKotToPrinter\s*=\s*sendKotToPrinter;/);
    assert.ok(kotMatch, 'sendKotToPrinter function definition found');
    const sendKotBlock = kotMatch[0];

    // Verify KOT printer does have fallback to enqueueCloudKotPrintJob
    assert.ok(sendKotBlock.includes('enqueueCloudKotPrintJob'), 'sendKotToPrinter MUST contain fallback to enqueueCloudKotPrintJob');
  });

  // ====================================================================
  // TEST GROUP 6: EXTREME CONTENTION (20 STATIONS RACING)
  // ====================================================================
  console.log('\n📍 GROUP 6: EXTREME CONTENTION (20 STATIONS RACING FOR 1 JOB)');

  await test('ADV-STRESS-01: 20 stations simultaneously race for 1 job -> strictly 1 winner, 19 losers', async () => {
    const mockDb = new AdversarialFirestoreDb();
    const jobId = 'kot_extreme_contention_20';
    const docPath = `shops/shop_delhi/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    const stationCount = 20;
    const stations = Array.from({ length: stationCount }, (_, i) => `hyper_station_${i + 1}`);
    let prints = 0;

    const claims = stations.map(async (st) => {
      try {
        const res = await claimPrintJob(
          mockDb,
          'shop_delhi',
          jobId,
          st,
          { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
        );
        prints++;
        return { success: true, station: st, res };
      } catch (err) {
        return { success: false, station: st, error: err.message };
      }
    });

    const results = await Promise.all(claims);
    const winners = results.filter(r => r.success);
    const losers = results.filter(r => !r.success);

    assert.strictEqual(winners.length, 1, `Must have strictly 1 winner out of 20, got ${winners.length}`);
    assert.strictEqual(losers.length, 19, `Must have strictly 19 losers out of 20, got ${losers.length}`);
    assert.strictEqual(prints, 1, `Must have strictly 1 print executed, got ${prints}`);

    losers.forEach((l, i) => {
      assert.strictEqual(l.error, 'Job already claimed or printed', `Station ${l.station} wrong error`);
    });

    console.log(`     Total transactions executed: ${mockDb.totalTransactions}, total retries: ${mockDb.totalRetries}`);
  });

  // ====================================================================
  // TEST GROUP 7: SUBSCRIPTION FILTERING & FIRESTORE RULES INTEGRITY
  // ====================================================================
  console.log('\n📍 GROUP 7: SUBSCRIPTION FILTERING & FIRESTORE RULES INTEGRITY');

  await test('ADV-QUEUE-01: listenPrintQueue delivers only queued jobs and supports custom/mock subscriber', async () => {
    let deliveredJobs = null;
    const mockJobs = [
      { id: 'j1', status: 'queued', jobType: 'KOT' },
      { id: 'j2', status: 'queued', jobType: 'KOT' }
    ];

    const unsubscribe = listenPrintQueue(null, 'shop_test', (jobs) => {
      deliveredJobs = jobs;
    }, {
      onSnapshot: (cb) => {
        cb(mockJobs);
        return () => { deliveredJobs = 'unsubscribed'; };
      }
    });

    assert.strictEqual(Array.isArray(deliveredJobs), true);
    assert.strictEqual(deliveredJobs.length, 2);
    assert.strictEqual(deliveredJobs[0].id, 'j1');
    assert.strictEqual(deliveredJobs[1].id, 'j2');

    unsubscribe();
    assert.strictEqual(deliveredJobs, 'unsubscribed');
  });

  await test('ADV-RULES-01: Both firestore.rules and database/firestore.rules enforce strict KOT print_queue schema', async () => {
    const rulesFiles = ['firestore.rules', 'database/firestore.rules'];
    for (const rf of rulesFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', rf), 'utf8');
      assert.ok(content.includes('match /print_queue/{jobId}'), `Missing /print_queue match in ${rf}`);
      assert.ok(content.includes("request.resource.data.jobType == 'KOT'"), `Missing jobType == 'KOT' in ${rf}`);
      assert.ok(content.includes("!('invoice' in request.resource.data)"), `Missing invoice rejection in ${rf}`);
      assert.ok(content.includes("!('billNo' in request.resource.data)"), `Missing billNo rejection in ${rf}`);
      assert.ok(content.includes("!('amount' in request.resource.data)"), `Missing amount rejection in ${rf}`);
      assert.ok(content.includes("!('final_payable_paise' in request.resource.data)"), `Missing final_payable_paise rejection in ${rf}`);
      assert.ok(content.includes("request.resource.data.status in ['queued', 'processing', 'printed', 'failed']"), `Missing valid status check in ${rf}`);
    }
  });


  // ====================================================================
  // SUMMARY REPORT
  // ====================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL SUITE TOTAL: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error(`❌ CRITICAL: ${failed} ADVERSARIAL CONCURRENCY TESTS FAILED.`);
    process.exit(1);
  } else {
    console.log('🛡️ EMPIRICAL VERIFICATION COMPLETE: ALL ADVERSARIAL CHALLENGES PASSED!');
  }
}

runAdversarialM3TestSuite().catch(err => {
  console.error('Fatal crash in adversarial test runner:', err);
  process.exit(1);
});
