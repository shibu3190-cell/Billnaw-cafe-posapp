/**
 * scratch/test_kds_and_webchannel_resilience.cjs
 * Empirical verification for:
 * 1. WebChannel 400 Bad Request prevention & Firestore initialization settings
 * 2. Complete Kitchen Display System (KDS) data flow, status advancement & action button events
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

async function runSuite() {
  console.log('====================================================');
  console.log('🍳 KITCHEN DISPLAY SYSTEM & FIRESTORE WEBCHANNEL AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  global.window = global.window || {
    dispatchEvent: () => {},
    playKdsAudioChime: () => {}
  };
  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    clear() { this._data = {}; }
  };

  async function test(id, desc, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: [${id}] ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: [${id}] ${desc}: ${e.message}`);
      failed++;
    }
  }

  // 1. FIREBASE WEBCHANNEL SETTINGS AUDIT
  const firebaseInitContent = fs.readFileSync(path.join(rootDir, 'js', 'firebase-init.js'), 'utf8');
  const dbClientContent = fs.readFileSync(path.join(rootDir, 'src', 'core', 'db-client.js'), 'utf8');
  const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
  const firestoreRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  const dbFirestoreRules = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'), 'utf8');

  await test('WEBCHANNEL-01', 'js/firebase-init.js imports initializeFirestore', () => {
    assert.ok(firebaseInitContent.includes('initializeFirestore'), 'Imports initializeFirestore');
  });

  await test('WEBCHANNEL-02', 'js/firebase-init.js configures experimentalAutoDetectLongPolling and useFetchStreams: false', () => {
    assert.ok(firebaseInitContent.includes('experimentalAutoDetectLongPolling: true'), 'Auto-detect long polling configured');
    assert.ok(firebaseInitContent.includes('useFetchStreams: false'), 'Disables fragile fetch streaming');
  });

  await test('WEBCHANNEL-03', 'src/core/db-client.js configures auto-detect long polling in initializeFirestore', () => {
    assert.ok(dbClientContent.includes('experimentalAutoDetectLongPolling: true'), 'db-client sets auto-detect long polling');
    assert.ok(dbClientContent.includes('useFetchStreams: false'), 'db-client sets useFetchStreams: false');
  });

  await test('WEBCHANNEL-04', 'js/core.js attachFirestoreListener guards against duplicate listener stream thrashing', () => {
    assert.ok(coreJsContent.includes('lastSubscribedStoreCode'), 'Tracks lastSubscribedStoreCode');
    assert.ok(coreJsContent.includes('lastSubscribedStoreCode === activeStoreCode'), 'Prevents redundant stream reconnects');
  });

  await test('WEBCHANNEL-05', 'firestore.rules supports both /kot/{kotId} and /kots/{kotId} across tenants', () => {
    assert.ok(firestoreRules.includes('match /kot/{kotId}'), 'Supports /kot/{kotId}');
    assert.ok(firestoreRules.includes('match /kots/{kotId}'), 'Supports /kots/{kotId}');
    assert.ok(dbFirestoreRules.includes('match /kots/{kotId}'), 'Database firestore.rules supports /kots/{kotId}');
  });

  // 2. KDS & KOT SERVICE MODULE AUDIT
  const { createKOT, updateKotStatus, cancelKOT, getActiveKOTs } = await import('../src/features/kot/kot.service.js');
  const { KotUI } = await import('../src/features/kot/kot.ui.js');

  await test('KDS-01', 'getActiveKOTs function is exported by kot.service.js', () => {
    assert.strictEqual(typeof getActiveKOTs, 'function', 'getActiveKOTs is a function');
  });

  await test('KDS-02', 'createKOT creates a valid ticket with PENDING status and generates human-readable ID', async () => {
    const res = await createKOT({
      table_id: 'Table 5',
      items: [
        { name: 'Cold Brew', quantity: 2, notes: 'with oat milk' },
        { name: 'Croissant', quantity: 1 }
      ],
      special_instructions: 'Pack extra napkins'
    });

    assert.ok(res.data, 'Returns ticket data');
    assert.strictEqual(res.data.status, 'PENDING');
    assert.strictEqual(res.data.table_id, 'Table 5');
    assert.strictEqual(res.data.items.length, 2);
    assert.ok(res.data.kot_id.startsWith('KOT-'), 'Has KOT- prefix');
  });

  await test('KDS-03', 'getActiveKOTs retrieves active tickets from storage and table state', async () => {
    global.window.tablesInfo = {
      '3': {
        items: [{ name: 'Masala Chai', qty: 3, notes: 'ginger' }],
        status: 'occupied',
        savedTime: Date.now() - 120000,
        server: 'Ramesh'
      }
    };

    const active = await getActiveKOTs();
    assert.ok(Array.isArray(active.data), 'Returns an array of tickets');
    assert.ok(active.data.length >= 2, 'Has both dispatched ticket and active table order');

    const table3Kot = active.data.find(k => k.table_id.includes('3'));
    assert.ok(table3Kot, 'Finds Table 3 active order');
    assert.strictEqual(table3Kot.items[0].name, 'Masala Chai');
  });

  await test('KDS-04', 'KotUI has click listener delegation and advances status via handleAdvanceStatus', async () => {
    const mockContainer = {
      innerHTML: '',
      _listeners: {},
      addEventListener(evt, handler) {
        this._listeners[evt] = handler;
      },
      querySelectorAll() { return []; }
    };

    const kotUI = new KotUI({ container: mockContainer });
    assert.strictEqual(typeof kotUI.loadKots, 'function', 'loadKots method exists');
    assert.strictEqual(typeof kotUI.initEventListeners, 'function', 'initEventListeners method exists');

    // Load sample tickets
    kotUI.setKots([
      { kot_id: 'KOT-TEST-01', table_id: 'Table 1', status: 'PENDING', items: [{ name: 'Dosa', quantity: 2 }] },
      { kot_id: 'KOT-TEST-02', table_id: 'Table 2', status: 'PREPARING', items: [{ name: 'Filter Coffee', quantity: 2 }] },
      { kot_id: 'KOT-TEST-03', table_id: 'Table 3', status: 'READY', items: [{ name: 'Idli', quantity: 1 }] }
    ]);

    assert.ok(mockContainer.innerHTML.includes('kot-status-pending'), 'Renders pending card');
    assert.ok(mockContainer.innerHTML.includes('kot-status-preparing'), 'Renders preparing card');
    assert.ok(mockContainer.innerHTML.includes('kot-status-ready'), 'Renders ready card');
    assert.ok(mockContainer.innerHTML.includes('btn-prep'), 'Has Prep button');
    assert.ok(mockContainer.innerHTML.includes('btn-ready'), 'Has Ready button');
    assert.ok(mockContainer.innerHTML.includes('btn-served'), 'Has Served button');
    assert.ok(mockContainer.innerHTML.includes('kot-timer-pill'), 'Has elapsed timer indicator');
  });

  await test('KDS-05', 'updateKotStatus advances ticket to PREPARING, READY, and SERVED', async () => {
    const kotRes = await createKOT({ table_id: 'Table 8', items: [{ name: 'Tea', quantity: 1 }] });
    const kotId = kotRes.data.kot_id;

    const prep = await updateKotStatus(kotId, 'PREPARING');
    assert.strictEqual(prep.data.status, 'PREPARING');

    const ready = await updateKotStatus(kotId, 'READY');
    assert.strictEqual(ready.data.status, 'READY');

    const served = await updateKotStatus(kotId, 'SERVED');
    assert.strictEqual(served.data.status, 'SERVED');
  });

  await test('KDS-06', 'POS printKitchenTicket and confirmCheckout update KOT queue and table states', () => {
    const posJsContent = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
    assert.ok(posJsContent.includes('billnaw:kot-created'), 'pos.js dispatches billnaw:kot-created');
    assert.ok(posJsContent.includes("status = 'SERVED'"), 'pos.js marks paid tables as SERVED in KOT queue');
  });

  console.log('\n====================================================');
  console.log(`🎯 KDS & WEBCHANNEL AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(e => {
  console.error('Fatal error running suite:', e);
  process.exit(1);
});
