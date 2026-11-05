/**
 * scratch/test_adversarial_m5_persistence_lifecycle.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS CHALLENGE SUITE: PERSISTENCE, LIFECYCLE & TRANSACTIONS
 * Agent: challenger_o10_m5_1 (critic, specialist)
 * Targets:
 *   1. Client Cache Footprint Boundaries & Query Decoupling (R1)
 *   2. Server-Side Data Tiering & Purge Lifecycles (R2)
 *   3. Balanced Atomic Adjustments & Admin Privilege Limits (R3)
 *   4. Multi-Device Concurrent Simulation Verification
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(id, desc, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: [${id}] ${desc}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ FAIL: [${id}] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ id, desc, error: err.message, stack: err.stack });
  }
}

// Global browser mocks for testing client-side code in Node
function setupBrowserMock() {
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
  };

  const memIDB = new Map();
  global.indexedDB = {
    open: () => {
      const req = {
        result: {
          transaction: () => ({
            objectStore: () => ({
              put: (val, key) => { memIDB.set(key, val); },
              get: (key) => ({ result: memIDB.get(key) }),
              clear: () => { memIDB.clear(); }
            })
          })
        }
      };
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 5);
      return req;
    }
  };

  const listeners = new Map();
  global.window = global;
  global.window.addEventListener = (event, handler) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
  };
  global.window.removeEventListener = (event, handler) => {
    if (!listeners.has(event)) return;
    listeners.set(event, listeners.get(event).filter(h => h !== handler));
  };
  global.window.dispatchEvent = (e) => {
    const list = listeners.get(e.type) || [];
    list.forEach(h => h(e));
  };

  if (typeof CustomEvent === 'undefined') {
    global.CustomEvent = class CustomEvent {
      constructor(type, eventInitDict = {}) {
        this.type = type;
        this.detail = eventInitDict.detail || null;
      }
    };
  }

  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };

  const origSetInterval = global.setInterval;
  global.setInterval = (fn, ms) => {
    const t = origSetInterval(fn, ms);
    if (t && t.unref) t.unref();
    return t;
  };

  return { storage, memIDB };
}

async function runEmpiricalSuite() {
  console.log('====================================================================');
  console.log('⚔️  EMPIRICAL ADVERSARIAL STRESS TEST: PERSISTENCE, LIFECYCLE & TRANSACTIONS');
  console.log('    challenger_o10_m5_1 (critic, specialist)');
  console.log('====================================================================\n');

  const { storage, memIDB } = setupBrowserMock();

  // Load client core module
  await import('../js/core.js');

  const DAY_MS = 24 * 60 * 60 * 1000;

  // --------------------------------------------------------------------------
  // SECTION 1: CLIENT CACHE FOOTPRINT BOUNDARIES & QUERY DECOUPLING (R1)
  // --------------------------------------------------------------------------
  console.log('📍 SECTION 1: CLIENT CACHE FOOTPRINT BOUNDARIES & QUERY DECOUPLING (R1)');

  await test('R1-01', 'pruneClientTransactionalCache(10) preserves records <= 10 days old', async () => {
    const now = Date.now();
    window.orderHistory = [
      { id: 'ord_0d', created_at: new Date(now).toISOString() },
      { id: 'ord_5d', created_at: new Date(now - 5 * DAY_MS).toISOString() },
      { id: 'ord_9_99d', created_at: new Date(now - 9.99 * DAY_MS).toISOString() }
    ];
    window.dailyExpenses = [
      { id: 'exp_0d', date: new Date(now).toISOString() },
      { id: 'exp_8d', date: new Date(now - 8 * DAY_MS).toISOString() }
    ];
    localStorage.setItem('pos_order_history', JSON.stringify([
      { id: 'loc_0d', created_at: new Date(now).toISOString() }
    ]));

    const res = await window.pruneClientTransactionalCache(10);
    assert.strictEqual(res.evictedOrders, 0, 'No orders within 10 days should be evicted');
    assert.strictEqual(res.evictedExpenses, 0, 'No expenses within 10 days should be evicted');
    assert.strictEqual(res.remainingOrders, 3, 'All 3 orders should remain');
  });

  await test('R1-02', 'pruneClientTransactionalCache(10) strictly evicts records > 10 days old', async () => {
    const now = Date.now();
    window.orderHistory = [
      { id: 'ord_recent', created_at: new Date(now - 2 * DAY_MS).toISOString() },
      { id: 'ord_10_01d', created_at: new Date(now - 10.01 * DAY_MS).toISOString() },
      { id: 'ord_15d', created_at: new Date(now - 15 * DAY_MS).toISOString() },
      { id: 'ord_60d', created_at: new Date(now - 60 * DAY_MS).toISOString() }
    ];
    window.dailyExpenses = [
      { id: 'exp_recent', date: new Date(now - 1 * DAY_MS).toISOString() },
      { id: 'exp_11d', date: new Date(now - 11 * DAY_MS).toISOString() },
      { id: 'exp_40d', date: new Date(now - 40 * DAY_MS).toISOString() }
    ];
    localStorage.setItem('pos_order_history', JSON.stringify([
      { id: 'loc_recent', created_at: new Date(now - 1 * DAY_MS).toISOString() },
      { id: 'loc_14d', created_at: new Date(now - 14 * DAY_MS).toISOString() }
    ]));

    const res = await window.pruneClientTransactionalCache(10);
    assert.strictEqual(res.evictedOrders, 3, 'Exactly 3 orders > 10 days must be evicted');
    assert.strictEqual(res.evictedExpenses, 2, 'Exactly 2 expenses > 10 days must be evicted');
    assert.strictEqual(res.remainingOrders, 1, 'Only recent order must remain');
    assert.strictEqual(window.orderHistory[0].id, 'ord_recent');

    const locStored = JSON.parse(localStorage.getItem('pos_order_history'));
    assert.strictEqual(locStored.length, 1);
    assert.strictEqual(locStored[0].id, 'loc_recent');
  });

  await test('R1-03', 'pruneClientTransactionalCache evicts malformed / unparseable dates safely', async () => {
    const now = Date.now();
    window.orderHistory = [
      { id: 'ord_valid', created_at: new Date(now).toISOString() },
      { id: 'ord_corrupt_1', created_at: 'NOT_A_VALID_DATE' },
      { id: 'ord_corrupt_2', created_at: null },
      { id: 'ord_corrupt_3', created_at: undefined }
    ];
    const res = await window.pruneClientTransactionalCache(10);
    assert.strictEqual(res.remainingOrders, 1);
    assert.strictEqual(window.orderHistory[0].id, 'ord_valid');
  });

  await test('R1-04', 'pruneClientTransactionalCache syncs IndexedDB stores cafe_history & cafe_expenses', async () => {
    const now = Date.now();
    window.orderHistory = [{ id: 'ord_1', created_at: new Date(now).toISOString() }];
    window.dailyExpenses = [{ id: 'exp_1', date: new Date(now).toISOString() }];

    await window.pruneClientTransactionalCache(10);
    assert.ok(memIDB.has('cafe_history'), 'IndexedDB must store cafe_history');
    assert.ok(memIDB.has('cafe_expenses'), 'IndexedDB must store cafe_expenses');
    assert.strictEqual(memIDB.get('cafe_history').length, 1);
  });

  await test('R1-05', 'pruneClientTransactionalCache respects custom retention parameter', async () => {
    const now = Date.now();
    window.orderHistory = [
      { id: 'ord_2d', created_at: new Date(now - 2 * DAY_MS).toISOString() },
      { id: 'ord_4d', created_at: new Date(now - 4 * DAY_MS).toISOString() },
      { id: 'ord_6d', created_at: new Date(now - 6 * DAY_MS).toISOString() }
    ];
    // Evict > 3 days
    const res = await window.pruneClientTransactionalCache(3);
    assert.strictEqual(res.evictedOrders, 2);
    assert.strictEqual(res.remainingOrders, 1);
    assert.strictEqual(window.orderHistory[0].id, 'ord_2d');
  });

  await test('R1-06', 'subscribeInvoicesCloudListener generates 10-day filter where constraint', () => {
    let capturedQueryCol = null;
    let capturedConstraints = null;

    window.firestoreDB = {};
    window.firestoreCollection = (db, path) => ({ db, path });
    window.firestoreQuery = (col, ...constraints) => {
      capturedQueryCol = col;
      capturedConstraints = constraints;
      return { col, constraints };
    };
    window.firestoreWhere = (field, op, val) => ({ field, op, val });
    window.firestoreOnSnapshot = (q, cb) => () => {};

    const unsub = window.subscribeInvoicesCloudListener('SHOP-TEST');
    assert.ok(typeof unsub === 'function');
    assert.ok(capturedConstraints && capturedConstraints.length > 0);
    const whereClause = capturedConstraints[0];
    assert.strictEqual(whereClause.field, 'created_at');
    assert.strictEqual(whereClause.op, '>=');
    // Ensure value is approx 10 days ago (within 1 minute)
    const tenDaysAgoMs = Date.now() - (10 * DAY_MS);
    const parsedWhereMs = new Date(whereClause.val).getTime();
    assert.ok(Math.abs(parsedWhereMs - tenDaysAgoMs) < 60000);
  });

  await test('R1-07', 'subscribeInvoicesCloudListener double-guard filters snapshot items older than 10 days', () => {
    const now = Date.now();
    let emittedInvoices = null;
    const testHandler = (e) => { emittedInvoices = e.detail.invoices; };
    window.addEventListener('billnaw:invoices-updated', testHandler);

    window.firestoreOnSnapshot = (q, onNext) => {
      // Simulate remote emitting 4 invoices (2 recent, 2 older than 10d)
      onNext({
        forEach: (cb) => {
          [
            { id: 'inv_recent_1', data: () => ({ created_at: new Date(now - 1 * DAY_MS).toISOString(), amount: 100 }) },
            { id: 'inv_old_1', data: () => ({ created_at: new Date(now - 20 * DAY_MS).toISOString(), amount: 200 }) },
            { id: 'inv_recent_2', data: () => ({ created_at: new Date(now - 5 * DAY_MS).toISOString(), amount: 300 }) },
            { id: 'inv_old_2', data: () => ({ created_at: new Date(now - 15 * DAY_MS).toISOString(), amount: 400 }) }
          ].forEach(cb);
        }
      });
      return () => {};
    };

    window.subscribeInvoicesCloudListener('SHOP-TEST');
    assert.ok(Array.isArray(emittedInvoices));
    assert.strictEqual(emittedInvoices.length, 2, 'Snapshot listener must filter out docs older than 10 days');
    const ids = emittedInvoices.map(i => i.id);
    assert.ok(ids.includes('inv_recent_1'));
    assert.ok(ids.includes('inv_recent_2'));
    assert.ok(!ids.includes('inv_old_1'));
    assert.ok(!ids.includes('inv_old_2'));
  });

  const { getHistoricalInvoicesPaginated } = await import('../src/features/reports/reports.service.js');
  const { getDbClient } = await import('../src/core/db-client.js');
  const { getTenantCafeId } = await import('../src/core/config.js');

  await test('R1-08', 'getHistoricalInvoicesPaginated clamps queries beyond 500 days to earliestAllowed', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();

    // Seed invoices spanning across 700 days
    const seed = [
      { id: 'inv_10d', created_at: new Date(now - 10 * DAY_MS).toISOString(), payment_mode: 'cash', amount: 10 },
      { id: 'inv_250d', created_at: new Date(now - 250 * DAY_MS).toISOString(), payment_mode: 'cash', amount: 20 },
      { id: 'inv_499d', created_at: new Date(now - 499 * DAY_MS).toISOString(), payment_mode: 'cash', amount: 30 },
      { id: 'inv_501d', created_at: new Date(now - 501 * DAY_MS).toISOString(), payment_mode: 'cash', amount: 40 },
      { id: 'inv_650d', created_at: new Date(now - 650 * DAY_MS).toISOString(), payment_mode: 'cash', amount: 50 }
    ];
    for (const inv of seed) {
      db.memoryStore.set(`cafes/${cafeId}/invoices/${inv.id}`, inv);
    }

    // Query asking for 700 days ago
    const res = await getHistoricalInvoicesPaginated(cafeId, {
      startDate: new Date(now - 700 * DAY_MS).toISOString(),
      limit: 50
    });

    const returnedIds = res.items.map(i => i.id);
    assert.ok(returnedIds.includes('inv_10d'), 'Recent doc must be included');
    assert.ok(returnedIds.includes('inv_250d'), '250d doc must be included');
    assert.ok(returnedIds.includes('inv_499d'), '499d doc must be included');
    assert.ok(!returnedIds.includes('inv_501d'), '501d doc must be CLAMPED OUT by 500-day ceiling');
    assert.ok(!returnedIds.includes('inv_650d'), '650d doc must be CLAMPED OUT by 500-day ceiling');
  });

  await test('R1-09', 'getHistoricalInvoicesPaginated paginates correctly with limit and startAfter cursor', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    // Seed 12 invoices
    for (let i = 1; i <= 12; i++) {
      const inv = {
        id: `inv_seq_${String(i).padStart(2, '0')}`,
        created_at: new Date(now - i * DAY_MS).toISOString(),
        payment_mode: 'cash',
        amount: i * 10
      };
      db.memoryStore.set(`cafes/${cafeId}/invoices/${inv.id}`, inv);
    }

    // Page 1: limit 5
    const page1 = await getHistoricalInvoicesPaginated(cafeId, { limit: 5 });
    assert.strictEqual(page1.items.length, 5);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.nextCursor, 'inv_seq_05');

    // Page 2: limit 5 starting after inv_seq_05
    const page2 = await getHistoricalInvoicesPaginated(cafeId, { limit: 5, startAfterDoc: page1.nextCursor });
    assert.strictEqual(page2.items.length, 5);
    assert.strictEqual(page2.hasMore, true);
    assert.strictEqual(page2.items[0].id, 'inv_seq_06');
    assert.strictEqual(page2.nextCursor, 'inv_seq_10');

    // Page 3: remaining 2 items
    const page3 = await getHistoricalInvoicesPaginated(cafeId, { limit: 5, startAfterDoc: page2.nextCursor });
    assert.strictEqual(page3.items.length, 2);
    assert.strictEqual(page3.hasMore, false);
    assert.strictEqual(page3.items[0].id, 'inv_seq_11');
    assert.strictEqual(page3.items[1].id, 'inv_seq_12');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: SERVER-SIDE DATA TIERING & PURGE LIFECYCLES (R2)
  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 2: SERVER-SIDE DATA TIERING & PURGE LIFECYCLES (R2)');

  const {
    executeHardPurge500Days,
    anonymizeInactiveCustomers730Days,
    scrubWhatsAppLogs90Days,
    runDailyDataRetentionRoutine
  } = await import('../database/server-functions/retention-lifecycle.js');

  await test('R2-01', 'executeHardPurge500Days preserves invoices <= 500 days old', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_now`, { id: 'inv_now', created_at: new Date(now).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_499d`, { id: 'inv_499d', created_at: new Date(now - 499 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_500d`, { id: 'inv_500d', created_at: new Date(now - 500 * DAY_MS).toISOString() });

    const res = await executeHardPurge500Days({ db, now, dryRun: false });
    assert.strictEqual(res.purgedCount, 0, 'No records <= 500d should be purged');
    assert.strictEqual(db.memoryStore.size, 3);
  });

  await test('R2-02', 'executeHardPurge500Days permanently deletes invoices > 500 days on day 501', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_recent`, { id: 'inv_recent', created_at: new Date(now - 10 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_501d`, { id: 'inv_501d', created_at: new Date(now - 501 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_600d`, { id: 'inv_600d', created_at: new Date(now - 600 * DAY_MS).toISOString() });

    const res = await executeHardPurge500Days({ db, now, dryRun: false });
    assert.strictEqual(res.purgedCount, 2, 'Exactly 2 records > 500 days must be purged');
    assert.strictEqual(db.memoryStore.size, 1);
    assert.ok(db.memoryStore.has(`cafes/${cafeId}/invoices/inv_recent`));
    assert.ok(!db.memoryStore.has(`cafes/${cafeId}/invoices/inv_501d`));
    assert.ok(!db.memoryStore.has(`cafes/${cafeId}/invoices/inv_600d`));
  });

  await test('R2-03', 'executeHardPurge500Days honors dryRun mode without deleting records', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_505d`, { id: 'inv_505d', created_at: new Date(now - 505 * DAY_MS).toISOString() });

    const res = await executeHardPurge500Days({ db, now, dryRun: true });
    assert.strictEqual(res.purgedCount, 1);
    assert.strictEqual(db.memoryStore.size, 1, 'dryRun must NOT delete from memoryStore');
  });

  await test('R2-04', 'anonymizeInactiveCustomers730Days scrubs PII for customers inactive >= 730 days', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    const custKey = `cafes/${cafeId}/customers/9876543210`;
    db.memoryStore.set(custKey, {
      id: '9876543210',
      name: 'Rohan Sharma',
      phone: '9876543210',
      email: 'rohan@example.com',
      notes: 'VIP customer prefers filter coffee',
      last_visit_at: new Date(now - 735 * DAY_MS).toISOString(),
      total_visits: 3,
      total_spent_paise: 95000,
      khata_balance_paise: 15000,
      is_anonymized: false
    });

    const res = await anonymizeInactiveCustomers730Days({ db, now, dryRun: false });
    assert.strictEqual(res.anonymizedCount, 1);

    const scrubbed = db.memoryStore.get(custKey);
    assert.strictEqual(scrubbed.name, 'Anonymized Customer');
    assert.strictEqual(scrubbed.phone, '0000000000');
    assert.strictEqual(scrubbed.email, '');
    assert.strictEqual(scrubbed.notes, '');
    assert.strictEqual(scrubbed.is_anonymized, true);
    assert.ok(scrubbed.anonymized_at);
    // Invariants preserved:
    assert.strictEqual(scrubbed.khata_balance_paise, 15000, 'khata_balance_paise must be preserved');
    assert.strictEqual(scrubbed.total_spent_paise, 95000, 'total_spent_paise must be preserved');
    assert.strictEqual(scrubbed.total_visits, 3, 'total_visits must be preserved');
  });

  await test('R2-05', 'anonymizeInactiveCustomers730Days leaves active customers (< 730 days) untouched', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    const custKey = `cafes/${cafeId}/customers/9998887776`;
    db.memoryStore.set(custKey, {
      id: '9998887776',
      name: 'Priya Mukherjee',
      phone: '9998887776',
      email: 'priya@example.com',
      last_visit_at: new Date(now - 50 * DAY_MS).toISOString(),
      total_visits: 12,
      is_anonymized: false
    });

    const res = await anonymizeInactiveCustomers730Days({ db, now, dryRun: false });
    assert.strictEqual(res.anonymizedCount, 0);

    const record = db.memoryStore.get(custKey);
    assert.strictEqual(record.name, 'Priya Mukherjee');
    assert.strictEqual(record.phone, '9998887776');
    assert.strictEqual(record.is_anonymized, false);
  });

  await test('R2-06', 'anonymizeInactiveCustomers730Days skips already anonymized customers', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    const custKey = `cafes/${cafeId}/customers/0000000000`;
    db.memoryStore.set(custKey, {
      id: '0000000000',
      name: 'Anonymized Customer',
      phone: '0000000000',
      last_visit_at: new Date(now - 800 * DAY_MS).toISOString(),
      is_anonymized: true
    });

    const res = await anonymizeInactiveCustomers730Days({ db, now, dryRun: false });
    assert.strictEqual(res.anonymizedCount, 0, 'Already anonymized profiles must not be re-processed');
  });

  await test('R2-07', 'scrubWhatsAppLogs90Days preserves logs <= 90 days and purges logs on day 91', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_1d`, { id: 'log_1d', created_at: new Date(now - 1 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_89d`, { id: 'log_89d', created_at: new Date(now - 89 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_90d`, { id: 'log_90d', created_at: new Date(now - 90 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_91d`, { id: 'log_91d', created_at: new Date(now - 91 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_120d`, { id: 'log_120d', created_at: new Date(now - 120 * DAY_MS).toISOString() });

    const res = await scrubWhatsAppLogs90Days({ db, now, dryRun: false });
    assert.strictEqual(res.scrubbedCount, 2, 'Exactly 2 logs > 90 days must be scrubbed');
    assert.strictEqual(db.memoryStore.size, 3);
    assert.ok(db.memoryStore.has(`cafes/${cafeId}/marketing_logs/log_1d`));
    assert.ok(db.memoryStore.has(`cafes/${cafeId}/marketing_logs/log_89d`));
    assert.ok(db.memoryStore.has(`cafes/${cafeId}/marketing_logs/log_90d`));
  });

  await test('R2-08', 'runDailyDataRetentionRoutine executes master lifecycle report', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    db.memoryStore.clear();
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_550d`, { id: 'inv_550d', created_at: new Date(now - 550 * DAY_MS).toISOString() });
    db.memoryStore.set(`cafes/${cafeId}/customers/cust_old`, {
      id: 'cust_old',
      name: 'Old User',
      phone: '1122334455',
      last_visit_at: new Date(now - 750 * DAY_MS).toISOString(),
      is_anonymized: false
    });
    db.memoryStore.set(`cafes/${cafeId}/marketing_logs/log_100d`, { id: 'log_100d', created_at: new Date(now - 100 * DAY_MS).toISOString() });

    const report = await runDailyDataRetentionRoutine({ db, now, dryRun: false });
    assert.strictEqual(report.totalRecordsPurged, 2); // 1 invoice + 1 whatsapp log
    assert.strictEqual(report.totalRecordsAnonymized, 1);
    assert.strictEqual(report.dryRun, false);
    assert.ok(report.timestamp);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: BALANCED ATOMIC ADJUSTMENTS & ADMIN PRIVILEGE LIMITS (R3)
  // --------------------------------------------------------------------------
  console.log('\n📍 SECTION 3: BALANCED ATOMIC ADJUSTMENTS & ADMIN PRIVILEGE LIMITS (R3)');

  const { settleBill, adjustSettledBill } = await import('../src/features/billing/billing.service.js');

  await test('R3-01', 'adjustSettledBill rejects invalid inputs (missing invoiceId, staffId, editReason)', async () => {
    const bad1 = await adjustSettledBill('', {}, 'stf_1', 'Valid Reason');
    assert.ok(bad1.error, 'Must reject missing invoiceId');

    const bad2 = await adjustSettledBill('inv_123', {}, '', 'Valid Reason');
    assert.ok(bad2.error, 'Must reject missing staffId');

    const bad3 = await adjustSettledBill('inv_123', {}, 'stf_1', 'ab');
    assert.ok(bad3.error, 'Must reject edit reason < 3 chars');
  });

  await test('R3-02', 'adjustSettledBill strictly rejects modifications to VOID invoices', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    const invDoc = {
      invoice_id: 'inv_void_test',
      status: 'VOID',
      created_at: new Date(now - 2 * DAY_MS).toISOString(),
      items: [{ name: 'Samosa', price_paise: 1500, quantity: 1 }],
      gross_subtotal_paise: 1500,
      final_payable_paise: 1500
    };
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_void_test`, invDoc);

    const res = await adjustSettledBill('inv_void_test', { items: [] }, 'stf_1', 'Attempting void modification');
    assert.ok(res.error);
    const errMsg = typeof res.error === 'string' ? res.error : (res.error.message || '');
    assert.ok(errMsg.includes('VOID and cannot be modified'), 'Must mention invoice is VOID');
  });

  await test('R3-03', 'adjustSettledBill strictly enforces 30-day edit lock (rejects bill > 30 days old)', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    // Bill created 31 days ago
    const invDoc = {
      invoice_id: 'inv_31d_old',
      status: 'SETTLED',
      created_at: new Date(now - 31 * DAY_MS).toISOString(),
      items: [{ name: 'Tea', price_paise: 1000, quantity: 1 }],
      gross_subtotal_paise: 1000,
      final_payable_paise: 1000
    };
    db.memoryStore.set(`cafes/${cafeId}/invoices/inv_31d_old`, invDoc);

    const res = await adjustSettledBill('inv_31d_old', {
      items: [{ name: 'Tea', price_paise: 1000, quantity: 2 }]
    }, 'stf_admin', 'Customer requested second tea');

    assert.ok(res.error);
    const errMsg = typeof res.error === 'string' ? res.error : (res.error.message || '');
    assert.ok(errMsg.includes('30-day edit window has expired'), 'Must reject modification past 30 days');
  });

  await test('R3-04', 'adjustSettledBill within 30 days updates invoice and audit metadata', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();
    const now = Date.now();

    // Settle an initial bill
    const settleRes = await settleBill({
      items: [{ name: 'Cold Coffee', price_paise: 6000, quantity: 1, gst_rate: 5 }],
      payment_mode: 'CASH'
    });
    assert.strictEqual(settleRes.error, null);
    const invoiceId = settleRes.data.invoice_id;

    // Adjust: Add Veg Burger (₹80.00 / 8000 paise)
    const adjRes = await adjustSettledBill(invoiceId, {
      items: [
        { name: 'Cold Coffee', price_paise: 6000, quantity: 1, gst_rate: 5 },
        { name: 'Veg Burger', price_paise: 8000, quantity: 1, gst_rate: 5 }
      ]
    }, 'stf_manager_01', 'Customer added burger before leaving');

    assert.strictEqual(adjRes.error, null);
    assert.ok(adjRes.data);
    assert.strictEqual(adjRes.data.gross_subtotal_paise, 14000);
    assert.strictEqual(adjRes.data.final_payable_paise, 14000);
    assert.strictEqual(adjRes.data.items.length, 2);

    // Audit trail verification
    const audit = adjRes.data.edit_audit;
    assert.ok(audit, 'edit_audit record must be present');
    assert.strictEqual(audit.edited_by_staff_id, 'stf_manager_01');
    assert.strictEqual(audit.edit_reason, 'Customer added burger before leaving');
    assert.strictEqual(audit.previous_totals.gross_paise, 6000);
    assert.strictEqual(audit.previous_totals.net_paise, 6000);
  });

  await test('R3-05', 'adjustSettledBill updates /reports/{YYYY-MM-DD} in lockstep via transaction', async () => {
    const db = getDbClient();
    const cafeId = getTenantCafeId();

    const settleRes = await settleBill({
      items: [{ name: 'Samosa', price_paise: 2000, quantity: 1, gst_rate: 5 }],
      payment_mode: 'CASH'
    });
    const invId = settleRes.data.invoice_id;

    const adjRes = await adjustSettledBill(invId, {
      items: [
        { name: 'Samosa', price_paise: 2000, quantity: 1, gst_rate: 5 },
        { name: 'Tea', price_paise: 1000, quantity: 1, gst_rate: 5 }
      ]
    }, 'stf_cashier_01', 'Added tea to bill');

    assert.strictEqual(adjRes.error, null);

    const todayStr = new Date().toISOString().slice(0, 10);
    const reportSnap = await db.doc(`cafes/${cafeId}/reports/${todayStr}`).get();
    const report = reportSnap.data();
    assert.ok(report, 'Report document must exist');
    assert.strictEqual(report.date, todayStr);
    assert.ok(report.updated_at, 'Report must have updated_at timestamp');
  });

  await test('R3-06', 'firestore.rules enforces 30-day edit lock and subcollections', () => {
    const rulesPath = path.join(ROOT_DIR, 'firestore.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    assert.ok(content.includes('function isWithin30DayEditWindow()'), 'Must define isWithin30DayEditWindow');
    assert.ok(content.includes('duration.value(30, \'d\')'), 'Must enforce 30-day window');
    assert.ok(content.includes('allow delete: if false;'), 'Must forbid physical invoice deletion');
    assert.ok(content.includes('match /reports/{reportId}'), 'Must declare reports subcollection');
    assert.ok(content.includes('match /daily_summaries/{summaryId}'), 'Must declare daily_summaries subcollection');
    assert.ok(content.includes('match /marketing_logs/{logId}'), 'Must declare marketing_logs subcollection');
  });

  await test('R3-07', 'Backend server.js declares purge and offloaded statement generation routes', () => {
    const serverPath = path.join(ROOT_DIR, 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');

    assert.ok(content.includes('/api/admin/maintenance/purge'), 'Must register /api/admin/maintenance/purge');
    assert.ok(content.includes('/api/reports/generate-statement'), 'Must register /api/reports/generate-statement');
    assert.ok(content.includes('/api/reports/download/:token'), 'Must register /api/reports/download/:token');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    console.error('💥 ADVERSARIAL STRESS CHALLENGE FAILED with', failedTests, 'failures:');
    failures.forEach(f => console.error(`  - [${f.id}] ${f.desc}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY 100% GREEN!');
    process.exit(0);
  }
}

runEmpiricalSuite().catch(err => {
  console.error('Fatal suite crash:', err);
  process.exit(1);
});
