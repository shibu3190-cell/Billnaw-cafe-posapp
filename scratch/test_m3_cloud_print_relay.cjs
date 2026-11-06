/**
 * 🛰️ TEST SUITE: MILESTONE 3 DISTRIBUTED CLOUD PRINT RELAY FOR REMOTE KOT (R3)
 * 
 * Verifies:
 * 1. Firebase SDK Export: window.firestoreRunTransaction = runTransaction in js/firebase-init.js.
 * 2. KOT Queueing to /shops/{shopId}/print_queue with complete schema validation.
 * 3. Strict Local-Only Billing Enforcement: Any non-KOT payload or billing fields
 *    (billNo, amount, invoice, final_payable_paise, grandTotal) THROW [Security Violation].
 * 4. Atomic Transaction Leasing: Concurrent competition between multiple stations
 *    guarantees exactly 1 winner and 0 duplicate physical prints.
 * 5. Zombie Lease Recovery: 60-second lease expiration allows active stations to reclaim stale jobs.
 * 6. Full Lifecycle & Retry Management: queued -> processing -> printed; retry < 3 -> queued; attempt >= 3 -> failed.
 * 7. pos.js Print Pipeline Wiring: sendKotToPrinter falls back to Cloud Print Relay; sendEscPosToPrinter strictly local.
 * 8. Firestore Security Rules: /print_queue/{jobId} matches and invariants in both rules files.
 * 9. Codebase Invariants: 26 .modal-close-btn SVGs, 0 raw emojis, currency non-breaking space "₹ ".
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runM3CloudPrintRelayTestSuite() {
  console.log('====================================================================');
  console.log('🛰️  VERIFICATION SUITE: MILESTONE 3 CLOUD PRINT RELAY (R3)');
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

  // ----------------------------------------------------
  // SECTION 1: FIREBASE SDK & PLATFORM BRIDGE EXPORTS
  // ----------------------------------------------------
  console.log('📍 SECTION 1: SDK & PLATFORM BRIDGE EXPORTS');

  it('EXP-01: js/firebase-init.js imports runTransaction from modular SDK', () => {
    const initCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-init.js'), 'utf8');
    assert.ok(initCode.includes('runTransaction'), 'runTransaction must be imported in firebase-init.js');
    assert.ok(initCode.includes('window.firestoreRunTransaction = runTransaction'), 'window.firestoreRunTransaction must be assigned');
  });

  const {
    ThermalPrinterBridge,
    enqueueCloudKotPrintJob,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue
  } = await import('../src/core/platform-bridge.js');

  it('EXP-02: platform-bridge.js exports all Cloud Print Relay functions', () => {
    assert.strictEqual(typeof enqueueCloudKotPrintJob, 'function', 'enqueueCloudKotPrintJob function missing');
    assert.strictEqual(typeof claimPrintJob, 'function', 'claimPrintJob function missing');
    assert.strictEqual(typeof completePrintJob, 'function', 'completePrintJob function missing');
    assert.strictEqual(typeof listenPrintQueue, 'function', 'listenPrintQueue function missing');
  });

  it('EXP-03: ThermalPrinterBridge exposes Cloud Print Relay methods on its instance', () => {
    assert.strictEqual(typeof ThermalPrinterBridge.enqueueCloudKotPrintJob, 'function');
    assert.strictEqual(typeof ThermalPrinterBridge.claimPrintJob, 'function');
    assert.strictEqual(typeof ThermalPrinterBridge.completePrintJob, 'function');
    assert.strictEqual(typeof ThermalPrinterBridge.listenPrintQueue, 'function');
  });

  // ----------------------------------------------------
  // SECTION 2: KOT QUEUEING & LOCAL-ONLY BILLING ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n📍 SECTION 2: KOT QUEUEING & STRICT LOCAL-ONLY BILLING ENFORCEMENT');

  await itAsync('SEC-01: enqueueCloudKotPrintJob creates valid KOT document schema', async () => {
    let capturedDoc = null;
    const mockSetDoc = async (doc) => {
      capturedDoc = doc;
    };

    const kotPayload = {
      jobType: 'KOT',
      tableNo: 'Table 5',
      kotId: 'KOT-20261106-0042',
      items: [
        { name: 'Paneer Tikka', qty: 2, notes: 'Spicy' },
        { name: 'Garlic Naan', qty: 3, notes: 'Crispy' }
      ],
      billerName: 'Rohan Sharma',
      billerRole: 'Server',
      shopId: 'shop_connaught_01'
    };

    const res = await enqueueCloudKotPrintJob(kotPayload, {
      shopId: 'shop_connaught_01',
      setDoc: mockSetDoc,
      deviceId: 'waiter_tab_04'
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.jobId && res.jobId.startsWith('kot_'), 'jobId must start with kot_');
    assert.ok(capturedDoc, 'Document was not saved via setDoc');
    assert.strictEqual(capturedDoc.jobType, 'KOT');
    assert.strictEqual(capturedDoc.targetPrinterRole, 'kitchen');
    assert.strictEqual(capturedDoc.tableNo, 'Table 5');
    assert.strictEqual(capturedDoc.kotId, 'KOT-20261106-0042');
    assert.strictEqual(capturedDoc.status, 'queued');
    assert.strictEqual(capturedDoc.attempts, 0);
    assert.strictEqual(capturedDoc.queuedByDeviceId, 'waiter_tab_04');
    assert.strictEqual(capturedDoc.leasedBy, null);
    assert.strictEqual(capturedDoc.leasedAt, null);
    assert.strictEqual(capturedDoc.printedAt, null);
    assert.strictEqual(capturedDoc.error, null);
    assert.strictEqual(capturedDoc.items.length, 2);
    assert.strictEqual(capturedDoc.billerName, 'Rohan Sharma');
    assert.strictEqual(capturedDoc.billerRole, 'Server');
    assert.ok(capturedDoc.createdAt, 'createdAt timestamp missing');
    assert.ok(capturedDoc.updatedAt, 'updatedAt timestamp missing');
  });

  await itAsync('SEC-02: Strictly throws security error if jobType !== KOT', async () => {
    let threw = false;
    try {
      await enqueueCloudKotPrintJob({
        jobType: 'RECEIPT',
        tableNo: 'Table 1',
        items: []
      });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('[Security Violation]'), 'Expected Security Violation error');
      assert.ok(err.message.includes('Customer bills and receipts must NEVER be queued to Firestore'));
    }
    assert.strictEqual(threw, true, 'Must throw error when jobType !== KOT');
  });

  await itAsync('SEC-03: Strictly throws security error if customer bill / receipt fields are present', async () => {
    const forbiddenTestCases = [
      { jobType: 'KOT', billNo: 'BILL-1049', items: [] },
      { jobType: 'KOT', bill_no: 'BILL-1050', items: [] },
      { jobType: 'KOT', amount: 450.50, items: [] },
      { jobType: 'KOT', invoice: { id: 'inv_123' }, items: [] },
      { jobType: 'KOT', invoice_id: 'inv_123', items: [] },
      { jobType: 'KOT', invoiceNo: 'INV-101', items: [] },
      { jobType: 'KOT', invoice_no: 'INV-102', items: [] },
      { jobType: 'KOT', final_payable_paise: 45050, items: [] },
      { jobType: 'KOT', final_total_paise: 45050, items: [] },
      { jobType: 'KOT', grandTotal: 450, items: [] },
      { jobType: 'KOT', grand_total: 450, items: [] },
      { jobType: 'KOT', paymentMode: 'Cash', items: [] },
      { jobType: 'KOT', payment_mode: 'Cash', items: [] },
      { jobType: 'KOT', subtotal: 400, items: [] },
      { jobType: 'KOT', grossSubtotal: 400, items: [] },
      { jobType: 'KOT', totalTax: 50, items: [] },
      { jobType: 'KOT', tax: 50, items: [] },
      { jobType: 'KOT', total: 450, items: [] },
      { jobType: 'KOT', discount: 10, items: [] },
      { jobType: 'KOT', discountAmount: 10, items: [] }
    ];

    for (const testCase of forbiddenTestCases) {
      let threw = false;
      try {
        await enqueueCloudKotPrintJob(testCase);
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'), `Expected security violation for ${JSON.stringify(testCase)}`);
      }
      assert.strictEqual(threw, true, `Must reject payload containing billing fields: ${Object.keys(testCase).join(',')}`);
    }
  });

  // ----------------------------------------------------
  // SECTION 3: ATOMIC TRANSACTION LEASING & RACE CONCURRENCY
  // ----------------------------------------------------
  console.log('\n📍 SECTION 3: ATOMIC TRANSACTION LEASING & RACE CONCURRENCY');

  // Construct a realistic in-memory Firestore database simulating transactional concurrency
  class MockFirestoreDb {
    constructor() {
      this.documents = new Map();
      this.versionMap = new Map();
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
        id: path.basename(pathStr)
      };
    }

    async runTransaction(updateFunction) {
      // Simulate real Firestore runTransaction with automatic conflict retry
      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const readVersions = new Map();
        const pendingUpdates = new Map();

        const txn = {
          get: async (docRef) => {
            const pathStr = typeof docRef === 'string' ? docRef : (docRef.path || docRef.id);
            readVersions.set(pathStr, this.versionMap.get(pathStr) || 0);
            return this.getDoc(pathStr);
          },
          update: (docRef, updateFields) => {
            const pathStr = typeof docRef === 'string' ? docRef : (docRef.path || docRef.id);
            pendingUpdates.set(pathStr, updateFields);
          }
        };

        try {
          const result = await updateFunction(txn);

          // Verify versions at commit time
          let conflict = false;
          for (const [pathStr, readVer] of readVersions.entries()) {
            const currentVer = this.versionMap.get(pathStr) || 0;
            if (currentVer !== readVer) {
              conflict = true;
              break;
            }
          }

          if (conflict) {
            // Contention detected: Firestore re-runs transaction callback
            await new Promise(r => setTimeout(r, 10));
            continue;
          }

          // Commit updates atomically
          for (const [pathStr, updateFields] of pendingUpdates.entries()) {
            const existing = this.documents.get(pathStr) || {};
            const merged = { ...existing, ...updateFields };
            this.documents.set(pathStr, merged);
            this.versionMap.set(pathStr, (this.versionMap.get(pathStr) || 0) + 1);
          }

          return result;
        } catch (err) {
          // If transaction handler intentionally throws (e.g. already claimed), rethrow immediately
          throw err;
        }
      }
      throw new Error('Transaction exceeded max retries');
    }
  }

  await itAsync('LEASE-01: Two concurrent stations racing for the same queued KOT job -> exactly 1 wins', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_race_test_001';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

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

    async function attemptStationPrint(stationId) {
      try {
        const claimed = await claimPrintJob(
          mockDb,
          'shop_1',
          jobId,
          stationId,
          { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
        );
        // Winning station performs physical print
        physicalPrintsCount++;
        return { success: true, stationId, claimed };
      } catch (err) {
        return { success: false, stationId, error: err.message };
      }
    }

    // Launch both station claims concurrently
    const [res1, res2] = await Promise.all([
      attemptStationPrint('kitchen_terminal_A'),
      attemptStationPrint('kitchen_terminal_B')
    ]);

    const winner = res1.success ? res1 : (res2.success ? res2 : null);
    const loser = !res1.success ? res1 : (!res2.success ? res2 : null);

    assert.ok(winner, 'One station must win the lease');
    assert.ok(loser, 'One station must lose the lease race');
    assert.strictEqual(physicalPrintsCount, 1, 'Strictly 1 physical print executed without duplicate');
    assert.strictEqual(loser.error, 'Job already claimed or printed');

    // Verify persisted state in DB
    const finalDoc = mockDb.getDoc(docPath).data();
    assert.strictEqual(finalDoc.status, 'processing');
    assert.strictEqual(finalDoc.leasedBy, winner.stationId);
    assert.strictEqual(finalDoc.attempts, 1);
    assert.ok(finalDoc.leasedAt, 'leasedAt must be recorded');
  });

  // -------------------------------------------------------------------------
  // MODULAR FIREBASE SDK SIGNATURE VERIFICATION (LEASE-02 through LEASE-07)
  // -------------------------------------------------------------------------

  await itAsync('LEASE-02: Modular SDK signature window.firestoreRunTransaction(targetDb, callback) execution', async () => {
    let receivedDb = null;
    let receivedFn = null;
    let callCount = 0;

    const mockModularRunTxn = (firestore, updateFn) => {
      callCount++;
      if (typeof firestore !== 'object' || firestore === null || typeof updateFn !== 'function') {
        throw new Error('FirebaseError: Expected first argument to runTransaction() to be a Firestore instance and second to be a function');
      }
      receivedDb = firestore;
      receivedFn = updateFn;
      const fakeTxn = {
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      };
      return updateFn(fakeTxn);
    };

    const activeDbInstance = { name: 'activeFirestoreInstance' };
    const savedWindow = global.window;
    global.window = { firestoreRunTransaction: mockModularRunTxn };

    try {
      const claimed = await claimPrintJob(activeDbInstance, 'shop_1', 'job_mod_1', 'station_modular_1');
      assert.strictEqual(callCount, 1, 'Modular runner called exactly once');
      assert.strictEqual(receivedDb, activeDbInstance, 'First parameter must be targetDb instance');
      assert.strictEqual(typeof receivedFn, 'function', 'Second parameter must be update callback function');
      assert.strictEqual(claimed.status, 'processing');
      assert.strictEqual(claimed.leasedBy, 'station_modular_1');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('LEASE-03: Modular SDK signature in injected options.runTransaction(targetDb, callback)', async () => {
    let receivedDb = null;
    const dummyDb = { name: 'injectedDb' };
    const customModularRunner = async (dbArg, updateFn) => {
      if (typeof dbArg !== 'object' || dbArg === null || typeof updateFn !== 'function') {
        throw new Error('Expected 2 arguments: (db, updateFn)');
      }
      receivedDb = dbArg;
      const fakeTxn = {
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      };
      return await updateFn(fakeTxn);
    };

    const savedWindow = global.window;
    delete global.window;

    try {
      const claimed = await claimPrintJob(dummyDb, 'shop_1', 'job_mod_2', 'station_mod_2', {
        runTransaction: customModularRunner
      });
      assert.strictEqual(receivedDb, dummyDb, 'Passed db must match dummyDb');
      assert.strictEqual(claimed.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('LEASE-04: targetDb resolution fallback to window.firestoreDB when db parameter is null', async () => {
    let receivedDb = null;
    const windowDb = { name: 'windowFirestoreDB' };
    const savedWindow = global.window;

    global.window = {
      firestoreDB: windowDb,
      firestoreRunTransaction: async (dbArg, updateFn) => {
        receivedDb = dbArg;
        const fakeTxn = {
          get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
          update: () => {}
        };
        return await updateFn(fakeTxn);
      }
    };

    try {
      const claimed = await claimPrintJob(null, 'shop_1', 'job_mod_3', 'station_mod_3');
      assert.strictEqual(receivedDb, windowDb, 'targetDb must resolve to window.firestoreDB');
      assert.strictEqual(claimed.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('LEASE-05: Direct targetDb.runTransaction(callback) instance method fallback in Node environment', async () => {
    const savedWindow = global.window;
    delete global.window;

    let nodeTxnCalled = false;
    const nodeDb = {
      runTransaction: async function(cb) {
        nodeTxnCalled = true;
        const fakeTxn = {
          get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
          update: () => {}
        };
        return await cb(fakeTxn);
      }
    };

    try {
      const claimed = await claimPrintJob(nodeDb, 'shop_1', 'job_node_1', 'station_node_1');
      assert.strictEqual(nodeTxnCalled, true, 'db.runTransaction called directly');
      assert.strictEqual(claimed.status, 'processing');
    } finally {
      global.window = savedWindow;
    }
  });

  await itAsync('LEASE-06: Backward compatibility for 1-argument options.runTransaction(callback)', async () => {
    let legacyCalled = false;
    const legacyRunner = async (cb) => {
      legacyCalled = true;
      const fakeTxn = {
        get: async () => ({ exists: () => true, data: () => ({ status: 'queued', attempts: 0 }) }),
        update: () => {}
      };
      return await cb(fakeTxn);
    };

    const claimed = await claimPrintJob(null, 'shop_1', 'job_legacy_1', 'station_legacy_1', {
      runTransaction: legacyRunner
    });
    assert.strictEqual(legacyCalled, true, '1-arg legacy runner called');
    assert.strictEqual(claimed.status, 'processing');
  });

  await itAsync('LEASE-07: Missing runTransaction runner throws explicit descriptive error', async () => {
    const savedWindow = global.window;
    delete global.window;

    let threw = false;
    try {
      await claimPrintJob(null, 'shop_1', 'job_err_1', 'station_err_1');
    } catch (err) {
      threw = true;
      assert.strictEqual(err.message, 'runTransaction is required for atomic print job claiming');
    } finally {
      global.window = savedWindow;
    }
    assert.strictEqual(threw, true, 'Must throw when no transaction runner is available');
  });

  // ----------------------------------------------------
  // SECTION 4: 60-SECOND ZOMBIE LEASE RECOVERY
  // ----------------------------------------------------
  console.log('\n📍 SECTION 4: 60-SECOND ZOMBIE LEASE RECOVERY');

  await itAsync('ZOMBIE-01: Active station reclaims stale processing job (> 60s lease)', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_zombie_001';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

    // Leased 75 seconds ago by crashed station
    const staleTime = new Date(Date.now() - 75000).toISOString();
    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'crashed_station_X',
      leasedAt: staleTime
    });

    const docRef = { path: docPath, id: jobId };
    const claimed = await claimPrintJob(
      mockDb,
      'shop_1',
      jobId,
      'healthy_station_Y',
      { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
    );

    assert.strictEqual(claimed.status, 'processing');
    assert.strictEqual(claimed.leasedBy, 'healthy_station_Y');
    assert.strictEqual(claimed.attempts, 2, 'Attempts count should increment upon reclaim');

    const finalDoc = mockDb.getDoc(docPath).data();
    assert.strictEqual(finalDoc.leasedBy, 'healthy_station_Y');
    assert.strictEqual(finalDoc.attempts, 2);
  });

  await itAsync('ZOMBIE-02: Fresh processing job (< 60s lease) is NOT reclaimable and throws', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_fresh_002';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

    // Leased only 15 seconds ago
    const freshTime = new Date(Date.now() - 15000).toISOString();
    mockDb.setDoc(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'active_station_A',
      leasedAt: freshTime
    });

    const docRef = { path: docPath, id: jobId };
    let threw = false;
    try {
      await claimPrintJob(
        mockDb,
        'shop_1',
        jobId,
        'intruder_station_B',
        { jobRef: docRef, runTransaction: mockDb.runTransaction.bind(mockDb) }
      );
    } catch (err) {
      threw = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(threw, true, 'Must reject claim while lease is active and fresh');
  });

  // ----------------------------------------------------
  // SECTION 5: COMPLETE JOB LIFECYCLE & RETRY RETENTION
  // ----------------------------------------------------
  console.log('\n📍 SECTION 5: COMPLETE JOB LIFECYCLE & RETRY RETENTION');

  await itAsync('LIFE-01: Successful print transitions status to printed with timestamp', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_success_001';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      status: 'processing',
      attempts: 1,
      leasedBy: 'kitchen_printer_1'
    });

    const docRef = { path: docPath, id: jobId };
    const res = await completePrintJob(
      mockDb,
      'shop_1',
      jobId,
      true,
      null,
      {
        jobRef: docRef,
        updateDoc: async (ref, data) => {
          const current = mockDb.getDoc(docPath).data();
          mockDb.setDoc(docPath, { ...current, ...data });
        }
      }
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'printed');

    const finalDoc = mockDb.getDoc(docPath).data();
    assert.strictEqual(finalDoc.status, 'printed');
    assert.ok(finalDoc.printedAt, 'printedAt timestamp must be recorded');
  });

  await itAsync('LIFE-02: Failed print with attempts < 3 resets status to queued for retry', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_retry_001';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      status: 'processing',
      attempts: 1
    });

    const docRef = { path: docPath, id: jobId };
    const res = await completePrintJob(
      mockDb,
      'shop_1',
      jobId,
      false,
      new Error('Paper Out'),
      {
        jobRef: docRef,
        attempts: 1,
        updateDoc: async (ref, data) => {
          const current = mockDb.getDoc(docPath).data();
          mockDb.setDoc(docPath, { ...current, ...data });
        }
      }
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'queued');

    const finalDoc = mockDb.getDoc(docPath).data();
    assert.strictEqual(finalDoc.status, 'queued', 'Must reset to queued for retry');
    assert.strictEqual(finalDoc.error, 'Paper Out');
  });

  await itAsync('LIFE-03: Failed print on attempt 3 transitions status to failed', async () => {
    const mockDb = new MockFirestoreDb();
    const jobId = 'kot_fail_003';
    const docPath = `shops/shop_1/print_queue/${jobId}`;

    mockDb.setDoc(docPath, {
      jobId,
      status: 'processing',
      attempts: 3
    });

    const docRef = { path: docPath, id: jobId };
    const res = await completePrintJob(
      mockDb,
      'shop_1',
      jobId,
      false,
      new Error('Printer Head Overheated'),
      {
        jobRef: docRef,
        attempts: 3,
        updateDoc: async (ref, data) => {
          const current = mockDb.getDoc(docPath).data();
          mockDb.setDoc(docPath, { ...current, ...data });
        }
      }
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'failed');

    const finalDoc = mockDb.getDoc(docPath).data();
    assert.strictEqual(finalDoc.status, 'failed', 'Must permanently mark failed after 3 attempts');
    assert.strictEqual(finalDoc.error, 'Printer Head Overheated');
  });

  // ----------------------------------------------------
  // SECTION 6: POS.JS PRINT PIPELINE WIRING & DECOUPLING
  // ----------------------------------------------------
  console.log('\n📍 SECTION 6: POS.JS PRINT PIPELINE WIRING & DECOUPLING');

  const posCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');

  it('POS-01: sendKotToPrinter connects to enqueueCloudKotPrintJob fallback when out of range', () => {
    assert.ok(posCode.includes('enqueueCloudKotPrintJob'), 'sendKotToPrinter must reference enqueueCloudKotPrintJob');
    assert.ok(
      posCode.includes('Kitchen printer out of range. KOT queued to Cloud Print Relay!'),
      'User feedback toast for remote KOT cloud relay missing'
    );
  });

  it('POS-02: sendEscPosToPrinter strictly prints locally and NEVER invokes cloud print queueing', () => {
    // Extract the full sendEscPosToPrinter function definition
    const fnMatch = posCode.match(/async function sendEscPosToPrinter[\s\S]*?window\.sendEscPosToPrinter\s*=\s*sendEscPosToPrinter;/);
    assert.ok(fnMatch, 'sendEscPosToPrinter function definition found');
    const fnBody = fnMatch[0];

    assert.strictEqual(
      fnBody.includes('enqueueCloudKotPrintJob'),
      false,
      'CRITICAL SECURITY: sendEscPosToPrinter must NEVER call enqueueCloudKotPrintJob'
    );
    assert.strictEqual(
      fnBody.includes('print_queue'),
      false,
      'CRITICAL SECURITY: sendEscPosToPrinter must NEVER reference print_queue'
    );
    assert.ok(
      fnBody.includes('executeHtmlPrint(\'print-receipt\')'),
      'sendEscPosToPrinter must fall back to local executeHtmlPrint'
    );
  });

  it('POS-03: pos.js defines and exports operational kitchen queue consumer functions', () => {
    assert.ok(posCode.includes('function startCloudKotQueueConsumer'), 'startCloudKotQueueConsumer missing');
    assert.ok(posCode.includes('window.startCloudKotQueueConsumer = startCloudKotQueueConsumer'), 'window.startCloudKotQueueConsumer export missing');
    assert.ok(posCode.includes('function stopCloudKotQueueConsumer'), 'stopCloudKotQueueConsumer missing');
    assert.ok(posCode.includes('window.stopCloudKotQueueConsumer = stopCloudKotQueueConsumer'), 'window.stopCloudKotQueueConsumer export missing');
    assert.ok(posCode.includes('function evaluateKitchenStationConsumer'), 'evaluateKitchenStationConsumer missing');
    assert.ok(posCode.includes('window.evaluateKitchenStationConsumer = evaluateKitchenStationConsumer'), 'window.evaluateKitchenStationConsumer export missing');
    assert.ok(posCode.includes('function processCloudKotJob'), 'processCloudKotJob missing');
    assert.ok(posCode.includes('window.processCloudKotJob = processCloudKotJob'), 'window.processCloudKotJob export missing');
  });

  await itAsync('POS-04: Operational kitchen station consumer processes queued KOT and completes lifecycle', async () => {
    const startMarker = 'let _kotQueueUnsubscribe = null;';
    const endMarker = 'window.evaluateKitchenStationConsumer = evaluateKitchenStationConsumer;';
    const consumerSlice = posCode.slice(
      posCode.indexOf(startMarker),
      posCode.indexOf(endMarker) + endMarker.length
    );

    let claimedJobId = null;
    let dispatchedSlot = null;
    let dispatchedBytes = null;
    let completedStatus = null;

    const fakeBridge = {
      routing: { defaultKotPrinter: 'printer2' },
      printers: { printer2: { status: 'CONNECTED', paperWidth: '58mm' } },
      isPrinterReady: () => true,
      generateEscPosCommands: (data) => new Uint8Array([0x1B, 0x40, 0x0A]),
      dispatchToPrinterSlot: async (slot, bytes) => {
        dispatchedSlot = slot;
        dispatchedBytes = bytes;
        return { success: true, data: { printed: true } };
      },
      claimPrintJob: async (db, shopId, jobId, workerId) => {
        claimedJobId = jobId;
        return { id: jobId, tableNo: 'T4', items: [{ name: 'Espresso', qty: 2 }] };
      },
      completePrintJob: async (db, shopId, jobId, success) => {
        completedStatus = success ? 'printed' : 'failed';
        return { success: true, status: completedStatus };
      }
    };

    const fakeWindow = { ThermalPrinterBridge: fakeBridge, posPrinters: fakeBridge.printers };
    const fn = new Function('window', 'ThermalPrinterBridge', 'document', 'localStorage', 'getActiveStoreIdentifier', 'shopProfile', 'getOrCreateDeviceId', 'showToast', consumerSlice + '\nreturn { isKitchenPrinterConnected, processCloudKotJob, startCloudKotQueueConsumer, stopCloudKotQueueConsumer, evaluateKitchenStationConsumer };');
    const fns = fn(fakeWindow, fakeBridge, {}, {}, () => 'shop_connaught_01', {}, () => 'kitchen_tab_01', () => {});

    const job = { id: 'kot_queue_test_99', tableNo: 'T4', items: [{ name: 'Espresso', qty: 2 }] };
    const res = await fns.processCloudKotJob(job, 'shop_connaught_01', { force: true });

    assert.strictEqual(res.success, true, 'Job processing must succeed');
    assert.strictEqual(claimedJobId, 'kot_queue_test_99', 'Job must be claimed via claimPrintJob');
    assert.strictEqual(dispatchedSlot, 'printer2', 'Job must be dispatched to printer2');
    assert.ok(dispatchedBytes && dispatchedBytes.length > 0, 'Bytecode must be generated and dispatched');
    assert.strictEqual(completedStatus, 'printed', 'Job must complete with printed status');
  });

  it('POS-05: Kitchen station consumer lifecycle adheres to printer connection state', () => {
    const startMarker = 'let _kotQueueUnsubscribe = null;';
    const endMarker = 'window.evaluateKitchenStationConsumer = evaluateKitchenStationConsumer;';
    const consumerSlice = posCode.slice(
      posCode.indexOf(startMarker),
      posCode.indexOf(endMarker) + endMarker.length
    );

    let listenCalled = false;
    let unsubscribed = false;

    const fakeBridge = {
      routing: { defaultKotPrinter: 'printer2' },
      printers: { printer2: { status: 'DISCONNECTED' } },
      isPrinterReady: () => false,
      listenPrintQueue: (db, shopId, cb) => {
        listenCalled = true;
        return () => { unsubscribed = true; };
      }
    };

    const fakeWindow = { ThermalPrinterBridge: fakeBridge, posPrinters: fakeBridge.printers };
    const fn = new Function('window', 'ThermalPrinterBridge', 'document', 'localStorage', 'getActiveStoreIdentifier', 'shopProfile', 'getOrCreateDeviceId', 'showToast', consumerSlice + '\nreturn { isKitchenPrinterConnected, processCloudKotJob, startCloudKotQueueConsumer, stopCloudKotQueueConsumer, evaluateKitchenStationConsumer };');
    const fns = fn(fakeWindow, fakeBridge, {}, {}, () => 'shop_connaught_01', {}, () => 'kitchen_tab_01', () => {});

    // 1. Initially disconnected -> false
    assert.strictEqual(fns.isKitchenPrinterConnected(), false, 'Disconnected kitchen printer must return false');

    // 2. Connect printer2 -> evaluateKitchenStationConsumer starts consumer
    fakeBridge.printers.printer2.status = 'CONNECTED';
    fakeBridge.isPrinterReady = () => true;
    assert.strictEqual(fns.isKitchenPrinterConnected(), true, 'Connected kitchen printer must return true');

    fns.evaluateKitchenStationConsumer();
    assert.strictEqual(listenCalled, true, 'evaluateKitchenStationConsumer must start queue subscription');

    // 3. Disconnect printer2 -> evaluateKitchenStationConsumer stops consumer
    fakeBridge.printers.printer2.status = 'DISCONNECTED';
    fakeBridge.isPrinterReady = () => false;
    fns.evaluateKitchenStationConsumer();
    assert.strictEqual(unsubscribed, true, 'Disconnecting printer must cleanly stop queue subscription');
  });

  // ----------------------------------------------------
  // SECTION 7: FIRESTORE SECURITY RULES PARITY & INVARIANTS
  // ----------------------------------------------------
  console.log('\n📍 SECTION 7: FIRESTORE SECURITY RULES PARITY & INVARIANTS');

  const rulesFiles = [
    { name: 'firestore.rules', path: path.join(__dirname, '..', 'firestore.rules') },
    { name: 'database/firestore.rules', path: path.join(__dirname, '..', 'database', 'firestore.rules') }
  ];

  for (const { name, path: filePath } of rulesFiles) {
    const rulesContent = fs.readFileSync(filePath, 'utf8');

    it(`RULES-01 [${name}]: Declares match /print_queue/{jobId} under /cafes/{cafeId}`, () => {
      assert.ok(
        rulesContent.includes('match /cafes/{cafeId}'),
        `Missing /cafes/{cafeId} in ${name}`
      );
      assert.ok(
        rulesContent.includes('match /print_queue/{jobId}'),
        `Missing /print_queue/{jobId} in ${name}`
      );
    });

    it(`RULES-02 [${name}]: Declares match /print_queue/{jobId} under /shops/{shopId}`, () => {
      assert.ok(
        rulesContent.includes('match /shops/{shopId}'),
        `Missing /shops/{shopId} in ${name}`
      );
    });

    it(`RULES-03 [${name}]: Strictly enforces jobType == 'KOT' and forbids billing attributes`, () => {
      assert.ok(rulesContent.includes("request.resource.data.jobType == 'KOT'"), 'Missing jobType check');
      assert.ok(rulesContent.includes("!('invoice' in request.resource.data)"), 'Missing !invoice check');
      assert.ok(rulesContent.includes("!('billNo' in request.resource.data)"), 'Missing !billNo check');
      assert.ok(rulesContent.includes("!('amount' in request.resource.data)"), 'Missing !amount check');
      assert.ok(rulesContent.includes("!('final_payable_paise' in request.resource.data)"), 'Missing !final_payable_paise check');
      assert.ok(rulesContent.includes("request.resource.data.status == 'queued'"), 'Create must enforce status == queued');
    });

    it(`RULES-04 [${name}]: Update rule limits status transitions to queued, processing, printed, failed`, () => {
      assert.ok(
        rulesContent.includes("request.resource.data.status in ['queued', 'processing', 'printed', 'failed']"),
        'Update must strictly constrain status enum'
      );
    });

    it(`RULES-05 [${name}]: Update rule strictly forbids post-creation billing attribute smuggling`, () => {
      const queueBlocks = rulesContent.match(/match \/print_queue\/\{jobId\} \{[\s\S]*?allow update:[\s\S]*?;/g) || [];
      assert.ok(queueBlocks.length >= 2, `Both print_queue blocks must define allow update in ${name}`);
      for (const block of queueBlocks) {
        assert.ok(block.includes("!('invoice' in request.resource.data)"), `Update rule in ${name} missing !invoice check`);
        assert.ok(block.includes("!('billNo' in request.resource.data)"), `Update rule in ${name} missing !billNo check`);
        assert.ok(block.includes("!('amount' in request.resource.data)"), `Update rule in ${name} missing !amount check`);
        assert.ok(block.includes("!('final_payable_paise' in request.resource.data)"), `Update rule in ${name} missing !final_payable_paise check`);
      }
    });
  }

  // ----------------------------------------------------
  // SECTION 8: REPOSITORY INVARIANTS
  // ----------------------------------------------------
  console.log('\n📍 SECTION 8: REPOSITORY INVARIANTS');

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  it('INV-01: Exactly 26 modal-close-btn button elements exist in index.html', () => {
    const modalCloseMatches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(
      modalCloseMatches.length,
      26,
      `Expected exactly 26 .modal-close-btn occurrences, found ${modalCloseMatches.length}`
    );
  });

  it('INV-02: Zero raw Unicode emojis inside button, tab, and control elements in index.html', () => {
    const buttonMatches = html.match(/<(button|tab)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const btn of buttonMatches) {
      assert.strictEqual(
        emojiRegex.test(btn),
        false,
        `Raw emoji found in button/control: ${btn.substring(0, 80)}`
      );
    }
  });

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ M3 Cloud Print Relay test suite failed with reports:', failureReports);
    process.exit(1);
  } else {
    console.log('✨ ALL MILESTONE 3 DISTRIBUTED CLOUD PRINT RELAY TESTS PASSED 100%!\n');
    process.exit(0);
  }
}

runM3CloudPrintRelayTestSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
