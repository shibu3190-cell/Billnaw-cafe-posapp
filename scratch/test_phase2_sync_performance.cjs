// scratch/test_phase2_sync_performance.cjs
// Verification Suite for Phase 2 Multi-Device Sync & Backend Parallelization:
// 1. Root onSnapshot self-echo suppression (hasPendingWrites + _writerId/_lastSelfWriteUpdatedAt)
// 2. persistTables() delta-only sync (no shopProfile/logo upload, skips no-op calls, coalesces rapid taps, writes subcollection docs)
// 3. subscribeTablesCloudListener() docChanges() delta merge with LWW, self-echo skip, and permission-denied fallback
// 4. subscribeInvoicesCloudListener() bounded fallback query (firestoreLimit(50))
// 5. server/sync-service.js parallelized root+cache reads & single Promise.allSettled post-root fan-out

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('⚡ PHASE 2 MULTI-DEVICE SYNC & BACKEND VERIFICATION');
console.log('====================================================\n');

const coreJs = read('js/core.js');
const syncServiceJs = read('server/sync-service.js');

test('P2-ECHO-01: Root Firestore onSnapshot skips hasPendingWrites and self-written echoes', () => {
  assert.ok(coreJs.includes('snap.metadata && snap.metadata.hasPendingWrites'), 'Missing hasPendingWrites guard on root listener');
  assert.ok(coreJs.includes('data._writerId === _syncClientInstanceId && data.updatedAt && data.updatedAt === _lastSelfWriteUpdatedAt'), 'Missing self-write echo suppression');
});

test('P2-INV-02: Invoices fallback listener is ordered newest-first and bounded with firestoreLimit(50)', () => {
  assert.ok(
    coreJs.includes("window.firestoreQuery(invoicesColRef, window.firestoreOrderBy('created_at', 'desc'), window.firestoreLimit(50))"),
    'Invoices fallback must order by created_at desc and limit to 50 newest docs'
  );
});

test('P2-DEBOUNCE-03: dispatchBackendStoreSync uses 1200ms coalescing when Firestore SDK is online', () => {
  assert.ok(coreJs.includes('(typeof window !== \'undefined\' && window.firestoreDB) ? 1200 : 350'), 'Missing SDK-aware backend debounce');
});

test('P2-TABLES-04: persistTables sends only changed-table delta, omits shopProfile, and coalesces rapid item taps', () => {
  const hashStart = coreJs.indexOf('function _computeTableSyncHash(tbl)');
  const hashEnd = coreJs.indexOf('let firestoreMenuMetaUnsubscribe = null;');
  const persistStart = coreJs.indexOf('function persistTables()');
  const persistEnd = coreJs.indexOf('window.persistTables = persistTables;');
  assert.ok(hashStart !== -1 && persistStart !== -1 && persistEnd !== -1, 'Could not extract persistTables');

  const snippet = coreJs.slice(hashStart, hashEnd) + '\n' + coreJs.slice(persistStart, persistEnd + 40);

  const backendCalls = [];
  const rootWrites = [];
  const subdocCalls = [];
  const sandbox = {
    window: { firestoreDB: {}, firestoreDoc: () => ({}), firestoreSetDoc: (ref, data) => { rootWrites.push(data); return Promise.resolve(); } },
    tablesInfo: {
      1: { items: [{ id: 1, name: 'Latte', qty: 1 }], status: 'occupied' },
      2: { items: [], status: 'empty' }
    },
    shopProfile: { name: 'Cafe', logo: 'data:image/png;base64,HUGE_LOGO' },
    _lastPersistedTableState: {},
    _lastSelfWriteUpdatedAt: '',
    _syncClientInstanceId: 'tab_test',
    idb: { set: () => {} },
    getStoreDocRef: () => ({ id: 'root' }),
    _syncTablesSubcollectionDocs: (d) => subdocCalls.push(d),
    dispatchBackendStoreSync: (payload, immediate) => backendCalls.push({ payload, immediate }),
    posMeshChannel: null
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);

  // 1st call: initial occupation of Table 1 (status change '' -> 'occupied' => immediate)
  sandbox.persistTables();
  assert.strictEqual(backendCalls.length, 1);
  assert.strictEqual(backendCalls[0].payload.profile, undefined, 'persistTables MUST NOT upload shopProfile/logo');
  assert.ok(backendCalls[0].payload.tables['1'], 'Table 1 must be in delta');
  assert.strictEqual(backendCalls[0].immediate, true, 'Status transition should sync immediately');

  // 2nd call: no-op call with identical tablesInfo -> 0 cloud calls!
  sandbox.persistTables();
  assert.strictEqual(backendCalls.length, 1, 'Unchanged tablesInfo must not fire redundant backend sync');
  assert.strictEqual(rootWrites.length, 1, 'Unchanged tablesInfo must not fire redundant Firestore write');

  // 3rd call: increment qty on Table 1 (same status 'occupied') -> delta only Table 1, coalesced (immediate=false)!
  sandbox.tablesInfo[1].items = [{ id: 1, name: 'Latte', qty: 2 }];
  sandbox.persistTables();
  assert.strictEqual(backendCalls.length, 2);
  assert.deepStrictEqual(Object.keys(backendCalls[1].payload.tables), ['1'], 'Delta must contain ONLY Table 1, not untouched Table 2');
  assert.strictEqual(backendCalls[1].immediate, false, 'Rapid item quantity tap should coalesce (immediate=false) when SDK online');
  assert.strictEqual(subdocCalls.length, 2, 'Per-table subcollection doc must be written');

  // 4th call: Applying a discount on Table 1 MUST trigger sync (discount included in _computeTableSyncHash)
  sandbox.tablesInfo[1].discount = { type: 'percent', value: 10 };
  sandbox.persistTables();
  assert.strictEqual(backendCalls.length, 3, 'Applying discount to Table 1 must trigger delta sync');
  assert.deepStrictEqual(Object.keys(backendCalls[2].payload.tables), ['1']);

  // 5th call: Table 1 cleared (items=[]) -> immediate=true
  sandbox.tablesInfo[1].items = [];
  sandbox.tablesInfo[1].status = 'empty';
  sandbox.persistTables();
  assert.strictEqual(backendCalls.length, 4);
  assert.strictEqual(backendCalls[3].immediate, true, 'Clearing a table must dispatch immediately');
});

test('P2-MESH-04B: posMeshChannel TABLES_UPDATED merges per-table keys without wiping untouched sibling tables', () => {
  assert.ok(
    coreJs.includes("for (const [tId, tVal] of Object.entries(data.tables))") &&
    !coreJs.includes("tablesInfo = data.tables;"),
    'TABLES_UPDATED must merge per-table keys instead of overwriting tablesInfo'
  );
  assert.ok(
    coreJs.includes('merged.tables = { ...prev.tables, ...next.tables };'),
    'dispatchBackendStoreSync must deep-merge partial tables deltas when coalescing or queuing offline'
  );
});

test('P2-SUBCOL-05: subscribeTablesCloudListener uses per-doc hasPendingWrites, resets kotPrintedMap on clear, and detaches cleanly', () => {
  assert.ok(coreJs.includes('subscribeTablesCloudListener(targetStoreCode);'), 'attachFirestoreListener must attach tables subcollection listener');
  assert.ok(coreJs.includes('if (firestoreTablesUnsubscribe)'), 'detachFirestoreListener must clean up tables subcollection listener');

  const start = coreJs.indexOf('let firestoreTablesUnsubscribe = null;');
  const end = coreJs.indexOf('let firestoreMenuMetaUnsubscribe = null;');
  assert.ok(start !== -1 && end !== -1, 'Could not locate tables subcollection listener');
  const snippet = coreJs.slice(start, end);

  let capturedOnNext = null;
  const uiUpdates = [];
  const sandbox = {
    window: {
      firestoreDB: {},
      firestoreCollection: () => ({ id: 'tablesCol' }),
      firestoreOnSnapshot: (_ref, onNext) => { capturedOnNext = onNext; return () => {}; }
    },
    tablesInfo: {
      1: { items: [{ id: 1, name: 'Latte', qty: 2, qtyKotPrinted: 2 }], status: 'occupied', kotPrintedMap: { '1': 2, Latte: 2 }, notes: 'Hot', updatedAt: 1000 }
    },
    _lastPersistedTableState: {},
    idb: { set: () => {} },
    getActiveStoreIdentifier: () => 'SHOP_TEST',
    getStoreCollectionName: () => 'shops',
    isBillingAlertEligibleRole: () => false,
    scheduleUIUpdate: (d) => uiUpdates.push(d),
    console: { debug: () => {}, warn: () => {}, log: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);

  sandbox.subscribeTablesCloudListener('SHOP_TEST');
  assert.ok(typeof capturedOnNext === 'function', 'onSnapshot callback not registered');

  // Collection has pending write on Table 1, while Table 4 has confirmed remote change -> Table 4 MUST NOT be dropped!
  capturedOnNext({
    metadata: { hasPendingWrites: true },
    docChanges: () => [
      { type: 'modified', doc: { id: '1', metadata: { hasPendingWrites: true }, data: () => ({ id: '1', status: 'occupied', items: [{ id: 1, name: 'Tea', qty: 1 }], updatedAt: 2000 }) } },
      { type: 'added', doc: { id: '4', metadata: { hasPendingWrites: false }, data: () => ({ id: '4', status: 'occupied', items: [{ id: 2, name: 'Coffee', qty: 2 }], updatedAt: 3000, _writerId: 'other_device' }) } }
    ]
  });
  assert.strictEqual(sandbox.tablesInfo['1'].items[0].name, 'Latte', 'Pending local echo on Table 1 must be skipped');
  assert.strictEqual(sandbox.tablesInfo['4'].status, 'occupied', 'Remote Table 4 must still be applied even when Table 1 has pending writes');
  assert.strictEqual(sandbox.tablesInfo['4'].items[0].name, 'Coffee');
  assert.strictEqual(uiUpdates.length, 1);
  assert.deepStrictEqual({ ...uiUpdates[0] }, { tables: true });

  // Remote clear of Table 1 MUST wipe stale kotPrintedMap and notes so next customer prints KOT cleanly
  capturedOnNext({
    metadata: { hasPendingWrites: false },
    docChanges: () => [
      { type: 'modified', doc: { id: '1', metadata: { hasPendingWrites: false }, data: () => ({ id: '1', status: 'empty', items: [], kotPrintedMap: {}, clearedAt: 4000, updatedAt: 4000, _writerId: 'other_device' }) } }
    ]
  });
  assert.strictEqual(sandbox.tablesInfo['1'].status, 'empty');
  assert.deepStrictEqual({ ...sandbox.tablesInfo['1'].kotPrintedMap }, {}, 'Remote clear must reset kotPrintedMap to empty object');
  assert.strictEqual(sandbox.tablesInfo['1'].notes, undefined, 'Remote clear must not carry over stale table notes');
});

test('P2-BACKEND-06: server/sync-service.js parallelizes root+cache reads and all post-root subcollection writes', () => {
  assert.ok(syncServiceJs.includes('const [rootReadRes, cachedStore] = await Promise.all(['), 'syncStoreToFirestoreREST must parallelize root fetch and persistent cache read');
  assert.ok(syncServiceJs.includes('const postRootTasks = [') && syncServiceJs.includes('await Promise.allSettled(postRootTasks);'), 'syncStoreToFirestoreREST must run post-root cache + subcollections concurrently');
  assert.ok(syncServiceJs.includes('const [cached, res] = await Promise.all(['), 'getStoreFromFirestoreREST must parallelize cache read and Firestore fetch');
});

console.log('\n====================================================');
console.log(`🎯 PHASE 2 SYNC SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================');
if (failed > 0) process.exit(1);
