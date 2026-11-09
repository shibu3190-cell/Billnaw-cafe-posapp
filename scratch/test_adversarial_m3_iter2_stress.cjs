/**
 * ⚔️ EMPIRICAL ADVERSARIAL STRESS HARNESS: MILESTONE 3 ITERATION 2
 * 
 * Verifies:
 * 1. High-Concurrency Stress: Multi-worker (10, 15, 20 workers) race conditions claiming queued KOT jobs.
 *    Verifies exactly-once leasing, zero duplicate physical prints, multi-job batch contention,
 *    and zombie lease recovery under race conditions.
 * 2. Modular SDK runTransaction Calling & Diverse DB Shapes:
 *    Verifies claimPrintJob with 2-argument modular runner across diverse db object shapes
 *    (instance, options.db, window.firestoreDB, legacy window.firebaseDB, frozen objects, runner precedence).
 * 3. Consumer Lifecycle & Memory Leaks in js/pos.js:
 *    Verifies rapid connect/disconnect toggles (50 cycles), idempotent subscriptions,
 *    store switching teardown, faulty unsubscribe handling, FIFO serialization, and phantom print prevention.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Realistic Modular Firestore Database Mock with OCC (Optimistic Concurrency Control)
class ModularAdversarialFirestoreDb {
  constructor(dbIdentity = { type: 'modular_firestore' }) {
    this.dbIdentity = dbIdentity;
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

  // Real Modular SDK signature: runTransaction(firestore, updateFn)
  async modularRunTransaction(firestoreInstance, updateFunction) {
    if (arguments.length < 2) {
      throw new Error("FirebaseError: Expected first argument to runTransaction() to be a Firestore instance and second to be a function");
    }
    if (typeof firestoreInstance !== 'object' || firestoreInstance === null) {
      throw new Error("FirebaseError: Expected first argument to runTransaction() to be a Firestore instance");
    }
    if (typeof updateFunction !== 'function') {
      throw new Error("FirebaseError: Expected second argument to runTransaction() to be a function");
    }

    const maxRetries = 50;
    this.totalTransactions++;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map();
      const pendingUpdates = new Map();

      const txn = {
        get: async (docRef) => {
          const pathStr = typeof docRef === 'string' ? docRef : (docRef.path || docRef.id);
          // Micro-delay to interleave concurrent reads
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

        // Check for version conflict (OCC)
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
          // Randomized backoff jitter
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 2));
          continue;
        }

        // Commit pending updates atomically
        for (const [pathStr, updateFields] of pendingUpdates.entries()) {
          const existing = this.documents.get(pathStr) || {};
          const merged = { ...existing, ...updateFields };
          this.documents.set(pathStr, merged);
          this.versionMap.set(pathStr, (this.versionMap.get(pathStr) || 0) + 1);
        }

        return result;
      } catch (err) {
        // Business logic exception (e.g. "Job already claimed or printed")
        throw err;
      }
    }
    throw new Error("Transaction exceeded max retries");
  }
}

async function runAdversarialStressSuite() {
  console.log('====================================================================');
  console.log('⚔️  EMPIRICAL ADVERSARIAL STRESS SUITE: M3 ITERATION 2');
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

  const {
    ThermalPrinterBridge,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue,
    enqueueCloudKotPrintJob
  } = await import('../src/core/platform-bridge.js');

  // =========================================================================
  // PART 1: HIGH-CONCURRENCY RACE STRESS WITH 2-ARGUMENT MODULAR RUNNER
  // =========================================================================
  console.log('📍 PART 1: HIGH-CONCURRENCY LEASE RACING (10+ WORKERS)');

  await itAsync('CONC-01: 10 concurrent workers racing to claim 1 queued KOT job -> exactly 1 wins, 9 fail', async () => {
    const mockDb = new ModularAdversarialFirestoreDb({ name: 'store_delhi_db' });
    const jobId = 'kot_conc_10_workers_001';
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
    let physicalPrintsCount = 0;

    const savedWindow = global.window;
    global.window = {
      firestoreRunTransaction: (db, cb) => mockDb.modularRunTransaction(db, cb)
    };

    try {
      const workers = Array.from({ length: 10 }, (_, i) => `kitchen_worker_${i + 1}`);
      const results = await Promise.all(
        workers.map(async (workerId) => {
          try {
            const claimed = await claimPrintJob(
              mockDb.dbIdentity,
              'shop_delhi',
              jobId,
              workerId,
              { jobRef: docRef }
            );
            physicalPrintsCount++;
            return { success: true, workerId, claimed };
          } catch (err) {
            return { success: false, workerId, error: err.message };
          }
        })
      );

      const winners = results.filter(r => r.success);
      const losers = results.filter(r => !r.success);

      assert.strictEqual(winners.length, 1, 'Exactly 1 worker must acquire the lease');
      assert.strictEqual(losers.length, 9, 'Exactly 9 workers must lose the lease race');
      assert.strictEqual(physicalPrintsCount, 1, 'Strictly 1 physical print executed');

      for (const loser of losers) {
        assert.strictEqual(loser.error, 'Job already claimed or printed');
      }

      const finalDoc = mockDb.getDoc(docPath).data();
      assert.strictEqual(finalDoc.status, 'processing');
      assert.strictEqual(finalDoc.leasedBy, winners[0].workerId);
      assert.strictEqual(finalDoc.attempts, 1);
      assert.ok(finalDoc.leasedAt, 'leasedAt must be recorded');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('CONC-02: 20 concurrent workers racing for 1 job under randomized network jitter -> exactly 1 wins, 19 fail', async () => {
    const mockDb = new ModularAdversarialFirestoreDb({ name: 'store_mumbai_db' });
    const jobId = 'kot_conc_20_workers_002';
    const docPath = `shops/shop_mumbai/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    let physicalPrintsCount = 0;

    const savedWindow = global.window;
    global.window = {
      firestoreRunTransaction: (db, cb) => mockDb.modularRunTransaction(db, cb)
    };

    try {
      const workers = Array.from({ length: 20 }, (_, i) => `station_terminal_${i + 1}`);
      const results = await Promise.all(
        workers.map(async (workerId) => {
          // Introduce micro-jitter before initiating claim
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 8)));
          try {
            const claimed = await claimPrintJob(
              mockDb.dbIdentity,
              'shop_mumbai',
              jobId,
              workerId,
              { jobRef: docRef }
            );
            physicalPrintsCount++;
            return { success: true, workerId, claimed };
          } catch (err) {
            return { success: false, workerId, error: err.message };
          }
        })
      );

      const winners = results.filter(r => r.success);
      const losers = results.filter(r => !r.success);

      assert.strictEqual(winners.length, 1, 'Strictly 1 worker must win out of 20');
      assert.strictEqual(losers.length, 19, 'Strictly 19 workers must fail out of 20');
      assert.strictEqual(physicalPrintsCount, 1, 'Strictly 1 physical print dispatch');
      assert.strictEqual(mockDb.getDoc(docPath).data().status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('CONC-03: Multi-job batch race: 15 concurrent workers competing for 10 queued KOT jobs -> all 10 leased once', async () => {
    const mockDb = new ModularAdversarialFirestoreDb({ name: 'batch_race_db' });
    const jobIds = Array.from({ length: 10 }, (_, i) => `kot_batch_job_${i + 1}`);

    for (const jobId of jobIds) {
      const docPath = `shops/shop_batch/print_queue/${jobId}`;
      mockDb.setDoc(docPath, {
        jobId,
        jobType: 'KOT',
        status: 'queued',
        attempts: 0,
        leasedBy: null,
        leasedAt: null
      });
    }

    const savedWindow = global.window;
    global.window = {
      firestoreRunTransaction: (db, cb) => mockDb.modularRunTransaction(db, cb)
    };

    try {
      const workers = Array.from({ length: 15 }, (_, i) => `worker_batch_${i + 1}`);
      const allPrintTickets = [];

      // Every worker tries to claim as many jobs as possible from the pool in shuffled order
      await Promise.all(
        workers.map(async (workerId) => {
          const shuffledJobs = [...jobIds].sort(() => Math.random() - 0.5);
          for (const jobId of shuffledJobs) {
            const docPath = `shops/shop_batch/print_queue/${jobId}`;
            const docRef = { path: docPath, id: jobId };
            try {
              const claimed = await claimPrintJob(
                mockDb.dbIdentity,
                'shop_batch',
                jobId,
                workerId,
                { jobRef: docRef }
              );
              allPrintTickets.push({ jobId, workerId, claimed });
            } catch (err) {
              // Expected to fail if already claimed
            }
          }
        })
      );

      // Verify all 10 jobs are leased exactly once
      assert.strictEqual(allPrintTickets.length, 10, 'All 10 jobs must be printed exactly once');
      const uniqueClaimedJobIds = new Set(allPrintTickets.map(t => t.jobId));
      assert.strictEqual(uniqueClaimedJobIds.size, 10, 'Each job must be claimed by a unique claim');

      for (const jobId of jobIds) {
        const docPath = `shops/shop_batch/print_queue/${jobId}`;
        const finalDoc = mockDb.getDoc(docPath).data();
        assert.strictEqual(finalDoc.status, 'processing');
        assert.strictEqual(finalDoc.attempts, 1);
        assert.ok(finalDoc.leasedBy);
      }
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('CONC-04: 12 concurrent workers racing to reclaim a stale zombie lease (> 60s) -> exactly 1 reclaims, attempts = 2', async () => {
    const mockDb = new ModularAdversarialFirestoreDb({ name: 'zombie_race_db' });
    const jobId = 'kot_zombie_race_001';
    const docPath = `shops/shop_zombie/print_queue/${jobId}`;

    const staleLeaseTime = new Date(Date.now() - 90000).toISOString(); // 90 seconds ago (> 60s)
    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'crashed_terminal_old',
      leasedAt: staleLeaseTime
    });

    const docRef = { path: docPath, id: jobId };
    const savedWindow = global.window;
    global.window = {
      firestoreRunTransaction: (db, cb) => mockDb.modularRunTransaction(db, cb)
    };

    try {
      const workers = Array.from({ length: 12 }, (_, i) => `recovery_station_${i + 1}`);
      const results = await Promise.all(
        workers.map(async (workerId) => {
          try {
            const claimed = await claimPrintJob(
              mockDb.dbIdentity,
              'shop_zombie',
              jobId,
              workerId,
              { jobRef: docRef }
            );
            return { success: true, workerId, claimed };
          } catch (err) {
            return { success: false, workerId, error: err.message };
          }
        })
      );

      const winners = results.filter(r => r.success);
      const losers = results.filter(r => !r.success);

      assert.strictEqual(winners.length, 1, 'Exactly 1 worker must reclaim the stale zombie job');
      assert.strictEqual(losers.length, 11, 'All 11 competing workers must be rejected');

      const finalDoc = mockDb.getDoc(docPath).data();
      assert.strictEqual(finalDoc.status, 'processing');
      assert.strictEqual(finalDoc.leasedBy, winners[0].workerId);
      assert.strictEqual(finalDoc.attempts, 2, 'Attempts must increment from 1 to 2 upon zombie reclaim');
      assert.ok(new Date(finalDoc.leasedAt).getTime() > Date.now() - 5000, 'leasedAt must be updated to current timestamp');
    } finally {
      global.window = savedWindow;
    }
  });

  // =========================================================================
  // PART 2: MODULAR SDK RUNTRANSACTION & DIVERSE DB OBJECT SHAPES
  // =========================================================================
  console.log('\n📍 PART 2: MODULAR SDK RUNTRANSACTION & DIVERSE DB OBJECT SHAPES');

  itAsync('MOD-SHAPE-01: Modular DB shape passed as first argument db -> correctly delivered to runner', async () => {
    let capturedDb = null;
    let capturedFn = null;
    const modularDbInstance = { type: 'firestore', app: { name: 'billnaw_pos' }, _databaseId: 'test_db' };

    const mockRunner = (dbArg, updateFn) => {
      capturedDb = dbArg;
      capturedFn = updateFn;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: mockRunner };

    try {
      const res = await claimPrintJob(modularDbInstance, 'shop_1', 'job_s1', 'w1');
      assert.strictEqual(capturedDb, modularDbInstance, 'Runner must receive the exact modularDbInstance');
      assert.strictEqual(typeof capturedFn, 'function', 'Runner must receive update function');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-02: db is null, options.db is provided -> options.db delivered to modular runner', async () => {
    let capturedDb = null;
    const optionsDbInstance = { type: 'firestore_options', projectId: 'cafe_delhi' };

    const mockRunner = (dbArg, updateFn) => {
      capturedDb = dbArg;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: mockRunner };

    try {
      const res = await claimPrintJob(null, 'shop_1', 'job_s2', 'w2', { db: optionsDbInstance });
      assert.strictEqual(capturedDb, optionsDbInstance, 'targetDb must resolve to options.db');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-03: db & options.db null -> resolves to window.firestoreDB', async () => {
    let capturedDb = null;
    const windowFirestoreDb = { type: 'window_firestore', token: 'token_123' };

    const mockRunner = (dbArg, updateFn) => {
      capturedDb = dbArg;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = {
      firestoreDB: windowFirestoreDb,
      firestoreRunTransaction: mockRunner
    };

    try {
      const res = await claimPrintJob(null, 'shop_1', 'job_s3', 'w3');
      assert.strictEqual(capturedDb, windowFirestoreDb, 'targetDb must resolve to window.firestoreDB');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-04: db, options.db, window.firestoreDB null -> legacy fallback to window.firebaseDB', async () => {
    let capturedDb = null;
    const windowFirebaseDb = { type: 'legacy_firebase_db', appId: 'app_legacy' };

    const mockRunner = (dbArg, updateFn) => {
      capturedDb = dbArg;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = {
      firestoreDB: null,
      firebaseDB: windowFirebaseDb,
      firestoreRunTransaction: mockRunner
    };

    try {
      const res = await claimPrintJob(null, 'shop_1', 'job_s4', 'w4');
      assert.strictEqual(capturedDb, windowFirebaseDb, 'targetDb must resolve to window.firebaseDB');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-05: Frozen DB object works seamlessly without attempted mutation', async () => {
    let capturedDb = null;
    const frozenDb = Object.freeze({
      type: 'frozen_firestore',
      version: '12.9.0',
      settings: Object.freeze({ host: 'firestore.googleapis.com' })
    });

    const mockRunner = (dbArg, updateFn) => {
      capturedDb = dbArg;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: mockRunner };

    try {
      const res = await claimPrintJob(frozenDb, 'shop_1', 'job_s5', 'w5');
      assert.strictEqual(capturedDb, frozenDb);
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-06: Strict runner enforcing arguments.length >= 2 executes without throwing', async () => {
    let callArgsLength = 0;
    const strictRunner = function() {
      callArgsLength = arguments.length;
      if (arguments.length < 2) {
        throw new Error("STRICT_ARITY_FAILURE: Expected at least 2 arguments");
      }
      const [db, updateFn] = arguments;
      return updateFn({
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      });
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: strictRunner };

    try {
      const res = await claimPrintJob({ type: 'db' }, 'shop_1', 'job_s6', 'w6');
      assert.strictEqual(callArgsLength, 2, 'Must be invoked with exactly 2 arguments');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-07: Runner precedence: options.runTransaction takes precedence over window.firestoreRunTransaction', async () => {
    let windowRunnerCalled = false;
    let optionsRunnerCalled = false;

    const windowRunner = (db, cb) => {
      windowRunnerCalled = true;
      return cb({ get: async () => ({ exists: () => true, data: () => ({ status: 'queued' }) }), update: () => {} });
    };

    const optionsRunner = (db, cb) => {
      optionsRunnerCalled = true;
      return cb({ get: async () => ({ exists: () => true, data: () => ({ status: 'queued' }) }), update: () => {} });
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: windowRunner };

    try {
      const res = await claimPrintJob({ type: 'db' }, 'shop_1', 'job_s7', 'w7', {
        runTransaction: optionsRunner
      });
      assert.strictEqual(optionsRunnerCalled, true, 'options.runTransaction must take precedence');
      assert.strictEqual(windowRunnerCalled, false, 'window.firestoreRunTransaction must NOT be called when options runner provided');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-08: Runner precedence: In browser, window.firestoreRunTransaction takes precedence over targetDb.runTransaction', async () => {
    let windowRunnerCalled = false;
    let instanceMethodCalled = false;

    const windowRunner = (db, cb) => {
      windowRunnerCalled = true;
      return cb({ get: async () => ({ exists: () => true, data: () => ({ status: 'queued' }) }), update: () => {} });
    };

    const dbWithInstanceMethod = {
      type: 'hybrid_db',
      runTransaction: async (cb) => {
        instanceMethodCalled = true;
        return cb({ get: async () => ({ exists: () => true, data: () => ({ status: 'queued' }) }), update: () => {} });
      }
    };

    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: windowRunner };

    try {
      const res = await claimPrintJob(dbWithInstanceMethod, 'shop_1', 'job_s8', 'w8');
      assert.strictEqual(windowRunnerCalled, true, 'window.firestoreRunTransaction must take precedence in browser');
      assert.strictEqual(instanceMethodCalled, false, 'Instance method must NOT be called when modular window runner is present');
      assert.strictEqual(res.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-09: Missing targetDb in browser with window.firestoreRunTransaction throws explicit error', async () => {
    const savedWindow = global.window;
    global.window = {
      firestoreDB: null,
      firebaseDB: null,
      firestoreRunTransaction: (db, cb) => {}
    };

    try {
      let threw = false;
      try {
        await claimPrintJob(null, 'shop_1', 'job_s9', 'w9');
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('Firestore instance (db) is required for window.firestoreRunTransaction'));
      }
      assert.strictEqual(threw, true, 'Must throw explicit Firestore instance required error');
    } finally {
      global.window = savedWindow;
    }
  });

  itAsync('MOD-SHAPE-10: window.firestoreDoc is invoked with targetDb as first argument', async () => {
    let docDbArg = null;
    let docPathParts = [];
    const testDb = { type: 'test_db_doc' };

    const savedWindow = global.window;
    global.window = {
      firestoreDoc: (dbArg, ...pathParts) => {
        docDbArg = dbArg;
        docPathParts = pathParts;
        return { path: pathParts.join('/') };
      },
      firestoreRunTransaction: (dbArg, updateFn) => {
        return updateFn({
          get: async () => ({ exists: () => true, data: () => ({ status: 'queued' }) }),
          update: () => {}
        });
      }
    };

    try {
      await claimPrintJob(testDb, 'shop_xyz', 'job_xyz', 'w10');
      assert.strictEqual(docDbArg, testDb, 'window.firestoreDoc must receive targetDb');
      assert.deepStrictEqual(docPathParts, ['shops', 'shop_xyz', 'print_queue', 'job_xyz']);
    } finally {
      global.window = savedWindow;
    }
  });

  // =========================================================================
  // PART 3: CONSUMER LIFECYCLE & MEMORY LEAKS IN JS/POS.JS
  // =========================================================================
  console.log('\n📍 PART 3: CONSUMER LIFECYCLE, RAPID TOGGLES & LEAK SAFETY IN JS/POS.JS');

  const posCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');
  const startMarker = 'let _kotQueueUnsubscribe = null;';
  const endMarker = 'window.evaluateKitchenStationConsumer = evaluateKitchenStationConsumer;';
  const consumerSlice = posCode.slice(
    posCode.indexOf(startMarker),
    posCode.indexOf(endMarker) + endMarker.length
  );

  function createConsumerHarness(options = {}) {
    let unsubscribeCallCount = 0;
    let subscribeCallCount = 0;
    let activeSubscribers = 0;
    let activeShopListened = null;

    const fakeBridge = {
      routing: { defaultKotPrinter: 'printer2' },
      printers: {
        printer2: {
          status: options.initialStatus || 'DISCONNECTED',
          paperWidth: '58mm',
          characteristic: options.initialCharacteristic || null
        }
      },
      isPrinterReady: () => {
        return fakeBridge.printers.printer2.status === 'CONNECTED';
      },
      listenPrintQueue: (db, shopId, cb) => {
        subscribeCallCount++;
        activeSubscribers++;
        activeShopListened = shopId;
        return () => {
          unsubscribeCallCount++;
          activeSubscribers--;
          activeShopListened = null;
        };
      },
      claimPrintJob: async (db, shopId, jobId, workerId) => ({ id: jobId, tableNo: 'T1' }),
      completePrintJob: async (db, shopId, jobId, success) => ({ success: true, status: success ? 'printed' : 'failed' }),
      generateEscPosCommands: () => new Uint8Array([0x1B, 0x40]),
      dispatchToPrinterSlot: async () => ({ success: true, data: { printed: true } })
    };

    const fakeWindow = {
      ThermalPrinterBridge: fakeBridge,
      posPrinters: fakeBridge.printers,
      firestoreDB: { type: 'test_firestore' }
    };

    const fn = new Function(
      'window',
      'ThermalPrinterBridge',
      'document',
      'localStorage',
      'getActiveStoreIdentifier',
      'shopProfile',
      'getOrCreateDeviceId',
      'showToast',
      consumerSlice + '\nreturn { isKitchenPrinterConnected, processCloudKotJob, startCloudKotQueueConsumer, stopCloudKotQueueConsumer, evaluateKitchenStationConsumer, getUnsubscribeRef: () => _kotQueueUnsubscribe, getShopRef: () => _currentKotConsumerShopId, getSetSize: () => _kotJobProcessingSet.size, getIsProcessing: () => _isProcessingKotQueue };'
    );

    const consumer = fn(
      fakeWindow,
      fakeBridge,
      {},
      {},
      () => options.shopId || 'shop_test_101',
      {},
      () => 'worker_pos_1',
      () => {}
    );

    return {
      consumer,
      fakeBridge,
      fakeWindow,
      getStats: () => ({
        subscribeCallCount,
        unsubscribeCallCount,
        activeSubscribers,
        activeShopListened
      })
    };
  }

  it('LIFE-01: Rapid connection / disconnection toggling (50 cycles) leaves zero dangling listeners', () => {
    const { consumer, fakeBridge, getStats } = createConsumerHarness();

    assert.strictEqual(consumer.isKitchenPrinterConnected(), false);
    assert.strictEqual(getStats().activeSubscribers, 0);

    // Perform 50 rapid connect / disconnect cycles
    for (let i = 0; i < 50; i++) {
      // Connect
      fakeBridge.printers.printer2.status = 'CONNECTED';
      consumer.evaluateKitchenStationConsumer();
      assert.strictEqual(getStats().activeSubscribers, 1, `Active subscribers must be 1 on connect iteration ${i}`);
      assert.ok(consumer.getUnsubscribeRef() !== null, 'Unsubscribe ref must be populated');

      // Disconnect
      fakeBridge.printers.printer2.status = 'DISCONNECTED';
      consumer.evaluateKitchenStationConsumer();
      assert.strictEqual(getStats().activeSubscribers, 0, `Active subscribers must be 0 on disconnect iteration ${i}`);
      assert.strictEqual(consumer.getUnsubscribeRef(), null, 'Unsubscribe ref must be cleared');
      assert.strictEqual(consumer.getShopRef(), null, 'Shop ref must be cleared');
      assert.strictEqual(consumer.getSetSize(), 0, 'In-flight processing set must be cleared');
    }

    const stats = getStats();
    assert.strictEqual(stats.subscribeCallCount, 50, 'Exactly 50 subscribes');
    assert.strictEqual(stats.unsubscribeCallCount, 50, 'Exactly 50 unsubscribes');
    assert.strictEqual(stats.activeSubscribers, 0, 'Zero dangling listeners');
  });

  it('LIFE-02: Idempotent subscriptions: calling startCloudKotQueueConsumer 10 times consecutively creates 1 listener', () => {
    const { consumer, getStats } = createConsumerHarness();

    for (let i = 0; i < 10; i++) {
      const res = consumer.startCloudKotQueueConsumer('shop_idempotent_test');
      assert.strictEqual(res, true);
    }

    const stats = getStats();
    assert.strictEqual(stats.subscribeCallCount, 1, 'Only 1 subscription created despite 10 start calls');
    assert.strictEqual(stats.activeSubscribers, 1, 'Exactly 1 active subscriber');
    assert.strictEqual(consumer.getShopRef(), 'shop_idempotent_test');

    consumer.stopCloudKotQueueConsumer();
    assert.strictEqual(getStats().activeSubscribers, 0);
  });

  it('LIFE-03: Store switching cleanly unsubscribes prior store before attaching new listener', () => {
    const { consumer, getStats } = createConsumerHarness();

    // Start listening on Shop A
    consumer.startCloudKotQueueConsumer('shop_A');
    assert.strictEqual(getStats().activeSubscribers, 1);
    assert.strictEqual(getStats().activeShopListened, 'shop_A');

    // Switch to Shop B
    consumer.startCloudKotQueueConsumer('shop_B');
    assert.strictEqual(getStats().unsubscribeCallCount, 1, 'Must unsubscribe from shop_A');
    assert.strictEqual(getStats().activeSubscribers, 1, 'Strictly 1 active subscriber during switch');
    assert.strictEqual(getStats().activeShopListened, 'shop_B');

    // Switch to Shop C
    consumer.startCloudKotQueueConsumer('shop_C');
    assert.strictEqual(getStats().unsubscribeCallCount, 2, 'Must unsubscribe from shop_B');
    assert.strictEqual(getStats().activeSubscribers, 1, 'Strictly 1 active subscriber during switch');
    assert.strictEqual(getStats().activeShopListened, 'shop_C');

    consumer.stopCloudKotQueueConsumer();
    assert.strictEqual(getStats().activeSubscribers, 0);
    assert.strictEqual(getStats().unsubscribeCallCount, 3);
  });

  it('LIFE-04: stopCloudKotQueueConsumer gracefully handles throwing unsubscribe callback without unhandled errors', () => {
    const { consumer, fakeBridge } = createConsumerHarness();

    // Mock a listener that throws on unsubscribe
    fakeBridge.listenPrintQueue = () => {
      return () => {
        throw new Error("UNSUBSCRIBE_NETWORK_SOCKET_CRASH");
      };
    };

    consumer.startCloudKotQueueConsumer('shop_crash_test');
    assert.ok(consumer.getUnsubscribeRef() !== null);

    // Stop consumer should catch the exception internally and reset state cleanly
    let threw = false;
    try {
      consumer.stopCloudKotQueueConsumer();
    } catch (err) {
      threw = true;
    }

    assert.strictEqual(threw, false, 'stopCloudKotQueueConsumer must not throw');
    assert.strictEqual(consumer.getUnsubscribeRef(), null, 'Unsubscribe ref must be cleared even if runner threw');
    assert.strictEqual(consumer.getShopRef(), null, 'Shop ref must be cleared');
    assert.strictEqual(consumer.getSetSize(), 0, 'Processing set must be cleared');
  });

  await itAsync('LIFE-05: Disconnected printer prevents phantom claims and prints when snapshot delivered', async () => {
    const { consumer, fakeBridge } = createConsumerHarness({ initialStatus: 'DISCONNECTED' });

    let claimInvoked = false;
    fakeBridge.claimPrintJob = async () => {
      claimInvoked = true;
      return { id: 'job_phantom' };
    };

    const job = { id: 'job_phantom_1', tableNo: 'T1', items: [{ name: 'Chai', qty: 2 }] };
    const res = await consumer.processCloudKotJob(job, 'shop_test');

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Kitchen printer not connected');
    assert.strictEqual(claimInvoked, false, 'Must NOT claim job from Firestore when printer is disconnected');
  });

  await itAsync('LIFE-06: Batch FIFO queue serialization: 5 jobs delivered in 1 snapshot processed sequentially', async () => {
    const processedOrder = [];
    const executionTimeline = [];

    const { consumer, fakeBridge } = createConsumerHarness({ initialStatus: 'CONNECTED' });

    let activeProcessing = 0;
    let maxConcurrentProcessing = 0;

    fakeBridge.claimPrintJob = async (db, shopId, jobId) => {
      activeProcessing++;
      if (activeProcessing > maxConcurrentProcessing) {
        maxConcurrentProcessing = activeProcessing;
      }
      executionTimeline.push(`start_${jobId}`);
      // Simulate hardware transmission latency
      await new Promise(r => setTimeout(r, 15));
      processedOrder.push(jobId);
      activeProcessing--;
      executionTimeline.push(`end_${jobId}`);
      return { id: jobId, tableNo: 'T1', items: [{ name: 'Item', qty: 1 }] };
    };

    let snapshotListenerCallback = null;
    fakeBridge.listenPrintQueue = (db, shopId, cb) => {
      snapshotListenerCallback = cb;
      return () => {};
    };

    consumer.startCloudKotQueueConsumer('shop_fifo_test');
    assert.ok(typeof snapshotListenerCallback === 'function');

    // Deliver batch of 5 jobs in a single snapshot
    const batchJobs = [
      { id: 'job_fifo_1', status: 'queued' },
      { id: 'job_fifo_2', status: 'queued' },
      { id: 'job_fifo_3', status: 'queued' },
      { id: 'job_fifo_4', status: 'queued' },
      { id: 'job_fifo_5', status: 'queued' }
    ];

    await snapshotListenerCallback(batchJobs);

    // Wait for async FIFO loop to complete
    await new Promise(r => setTimeout(r, 150));

    assert.strictEqual(processedOrder.length, 5, 'All 5 jobs must be processed');
    assert.deepStrictEqual(processedOrder, ['job_fifo_1', 'job_fifo_2', 'job_fifo_3', 'job_fifo_4', 'job_fifo_5'], 'Jobs must be processed in strict FIFO order');
    assert.strictEqual(maxConcurrentProcessing, 1, 'Max concurrent processing must be strictly 1 (sequential hardware dispatch)');

    consumer.stopCloudKotQueueConsumer();
  });

  await itAsync('LIFE-07: In-flight deduplication: snapshot echo does not re-process cached in-flight job', async () => {
    const { consumer, fakeBridge } = createConsumerHarness({ initialStatus: 'CONNECTED' });

    let claimCallCount = 0;
    fakeBridge.claimPrintJob = async (db, shopId, jobId) => {
      claimCallCount++;
      return { id: jobId, tableNo: 'T2' };
    };

    const job = { id: 'job_echo_1', tableNo: 'T2', items: [{ name: 'Coffee', qty: 1 }] };

    // Process first time
    const res1 = await consumer.processCloudKotJob(job, 'shop_test');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(claimCallCount, 1);

    // Immediate second call (snapshot echo) before cooldown expires
    const res2 = await consumer.processCloudKotJob(job, 'shop_test');
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.error, 'Job already in processing cache');
    assert.strictEqual(claimCallCount, 1, 'Claim must not be called again on echo');

    consumer.stopCloudKotQueueConsumer();
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ Adversarial stress suite encountered failures:', failureReports);
    process.exit(1);
  } else {
    console.log('🛡️ EMPIRICAL ADVERSARIAL STRESS TEST: ALL 21 CHALLENGES PASSED 100%!\n');
    process.exit(0);
  }
}

runAdversarialStressSuite().catch((err) => {
  console.error('Unhandled stress suite error:', err);
  process.exit(1);
});
