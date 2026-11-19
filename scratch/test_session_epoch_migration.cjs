// scratch/test_session_epoch_migration.cjs
// ============================================================================
// 🧪 Automated Verification Suite: Milestone 1 (Approach A)
// Session Epoch / Soft Upgrade, Multi-Tenant Isolation & UI Invariants
// ============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('====================================================================');
  console.log('🚀 RUNNING MILESTONE 1 VERIFICATION: SESSION EPOCH & SOFT UPGRADE');
  console.log('====================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(err);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 1: R1 Epoch Mismatch & Stale Cache Purge with Draft Preservation
  // --------------------------------------------------------------------------
  console.log('📍 TEST GROUP 1: R1 Epoch Mismatch & Active Draft Order Preservation');

  const storageMock = new Map();
  const idbMock = new Map();
  const eventListeners = {
    document: new Map(),
    window: new Map()
  };

  global.localStorage = {
    getItem: (k) => storageMock.get(k) || null,
    setItem: (k, v) => storageMock.set(k, String(v)),
    removeItem: (k) => storageMock.delete(k),
    clear: () => storageMock.clear()
  };

  global.sessionStorage = {
    getItem: (k) => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };

  global.indexedDB = undefined;
  global.idbMemoryStore = {};

  global.idb = {
    init: async () => {},
    get: async (key) => idbMock.get(key) || null,
    set: async (key, val) => { idbMock.set(key, JSON.parse(JSON.stringify(val))); },
    delete: async (key) => { idbMock.delete(key); },
    clear: async (key) => {
      if (key) idbMock.delete(key);
      else idbMock.clear();
    }
  };

  let lockTerminalCalls = [];
  let openShopAuthModalCalls = [];

  global.window = global;
  global.window.lockTerminal = (notify) => {
    lockTerminalCalls.push({ notify, timestamp: Date.now() });
  };
  global.window.openShopAuthModal = (isReLogin) => {
    openShopAuthModalCalls.push({ isReLogin, timestamp: Date.now() });
  };
  global.window.runBackgroundHealthCheck = async () => {};
  global.window.syncTableUI = () => {};
  global.window.updateCartUI = () => {};

  global.document = {
    hidden: false,
    getElementById: (id) => null,
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    addEventListener: (event, handler) => {
      if (!eventListeners.document.has(event)) eventListeners.document.set(event, []);
      eventListeners.document.get(event).push(handler);
    }
  };

  global.window.addEventListener = (event, handler) => {
    if (!eventListeners.window.has(event)) eventListeners.window.set(event, []);
    eventListeners.window.get(event).push(handler);
  };

  // Load core module
  const coreModule = await import('../js/core.js');
  const APP_DATA_EPOCH = coreModule.APP_DATA_EPOCH || window.APP_DATA_EPOCH;
  const checkAndApplySessionEpoch = coreModule.checkAndApplySessionEpoch || window.checkAndApplySessionEpoch;

  test('R1-01: Constant APP_DATA_EPOCH is correctly defined', () => {
    assert.strictEqual(typeof APP_DATA_EPOCH, 'string', 'APP_DATA_EPOCH must be a string');
    assert.strictEqual(APP_DATA_EPOCH, '2026_11_19_CLEAN_V1', 'APP_DATA_EPOCH must match spec');
    assert.strictEqual(window.APP_DATA_EPOCH, '2026_11_19_CLEAN_V1');
  });

  await asyncTest('R1-02: Epoch mismatch triggers purge of stale tenant cache while 100% preserving active draft orders', async () => {
    // 1. Seed outdated epoch
    localStorage.setItem('billnaw_data_epoch', '2026_01_01_OLD_EPOCH');
    localStorage.setItem('billnaw_auth_token', 'jwt_test_token_shop_owner');
    localStorage.setItem('billnaw_store_code', 'SHOP_ABHIJITMODAK');

    // 2. Seed stale staff cache in localStorage and IDB
    const dirtyStaff = [
      { id: '1793965135000', name: 'Bapi Leaked', role: 'Staff' },
      { id: '1793965355981', name: 'Gourab Leaked', role: 'Staff' }
    ];
    localStorage.setItem('billnaw_store_staff', JSON.stringify(dirtyStaff));
    localStorage.setItem('billnaw_active_staff', JSON.stringify(dirtyStaff[0]));
    localStorage.setItem('billnaw_last_staff_id', '1793965135000');
    localStorage.setItem('billnaw_deleted_staff_ids', JSON.stringify(['old_del_1']));
    await idb.set('cafe_staff', dirtyStaff);

    // 3. Seed orphaned sessions & device pairing residue
    localStorage.setItem('billnaw_active_sessions', JSON.stringify(['sess_1', 'sess_2']));
    localStorage.setItem('billnaw_current_session_id', 'sess_1');
    localStorage.setItem('billnaw_authorized_devices', JSON.stringify([{ id: 'dev_old' }]));
    localStorage.setItem('billnaw_session_revoked', 'true');
    localStorage.setItem('billnaw_terminal_locked', 'false');
    localStorage.setItem('billnaw_pin_verified_at', '1700000000000');
    localStorage.setItem('billnaw_offline_sync_queue', JSON.stringify({ pending: 5 }));

    // 4. Seed active in-progress draft bill on Table 2 and ghost state on Table 3
    const draftItems = [
      { id: 'menu_burger', name: 'Veg Crispy Burger', price: 120, rate: 120, qty: 2, gstRate: 5 },
      { id: 'menu_shake', name: 'Chocolate Cold Shake', price: 90, rate: 90, qty: 1, gstRate: 5 }
    ];
    const initialTables = {
      1: { items: [], status: 'empty', savedTime: null, lastReminder: null },
      2: {
        items: draftItems,
        status: 'occupied',
        savedTime: 1700000123456,
        lastReminder: null,
        notes: 'Less sugar in shake',
        discount: { type: 'percent', value: 10 }
      },
      3: { items: [], status: 'occupied', savedTime: 1690000000000, lastReminder: null }, // Ghost table!
      4: { items: [], status: 'empty', savedTime: null, lastReminder: null }
    };
    window.tablesInfo = JSON.parse(JSON.stringify(initialTables));
    window.activeTable = 2;
    await idb.set('cafe_tables', initialTables);

    lockTerminalCalls = [];
    openShopAuthModalCalls = [];

    // Execute Soft Upgrade
    const result = await checkAndApplySessionEpoch();

    assert.strictEqual(result.migrated, true, 'Migration must indicate true');
    assert.deepStrictEqual(result.preservedDraftTables, ['2'], 'Preserved draft table must be Table 2');

    // Verify localStorage epoch updated
    assert.strictEqual(localStorage.getItem('billnaw_data_epoch'), APP_DATA_EPOCH, 'billnaw_data_epoch must be updated');
    assert.strictEqual(localStorage.getItem('billnaw_app_data_epoch'), APP_DATA_EPOCH, 'billnaw_app_data_epoch fallback must match');

    // Verify Active Draft Order was 100% PRESERVED in tablesInfo
    const t2 = window.tablesInfo[2];
    assert.ok(t2, 'Table 2 must exist in tablesInfo');
    assert.strictEqual(t2.status, 'occupied', 'Table 2 must remain occupied');
    assert.strictEqual(t2.items.length, 2, 'Table 2 must preserve both items');
    assert.strictEqual(t2.items[0].name, 'Veg Crispy Burger');
    assert.strictEqual(t2.items[0].qty, 2);
    assert.strictEqual(t2.items[1].name, 'Chocolate Cold Shake');
    assert.strictEqual(t2.notes, 'Less sugar in shake', 'Special instructions/notes must be preserved');
    assert.deepStrictEqual(t2.discount, { type: 'percent', value: 10 }, 'Draft discount must be preserved');

    // Verify Active Draft Order was persisted to IDB cafe_tables
    const idbTables = await idb.get('cafe_tables');
    assert.ok(idbTables[2], 'IDB must contain Table 2');
    assert.strictEqual(idbTables[2].items.length, 2);
    assert.strictEqual(idbTables[2].items[0].name, 'Veg Crispy Burger');

    // Verify Ghost Table 3 was RESET to clean empty status
    assert.strictEqual(window.tablesInfo[3].status, 'empty', 'Ghost Table 3 must be reset to empty');
    assert.strictEqual(window.tablesInfo[3].items.length, 0);
    assert.strictEqual(idbTables[3].status, 'empty', 'IDB Ghost Table 3 must be reset to empty');

    // Verify Stale Cache was PURGED from LocalStorage
    assert.strictEqual(localStorage.getItem('billnaw_store_staff'), null, 'billnaw_store_staff must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_active_staff'), null, 'billnaw_active_staff must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_last_staff_id'), null, 'billnaw_last_staff_id must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_deleted_staff_ids'), null, 'billnaw_deleted_staff_ids must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_active_sessions'), null, 'billnaw_active_sessions must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_current_session_id'), null, 'billnaw_current_session_id must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_authorized_devices'), null, 'billnaw_authorized_devices must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_session_revoked'), null, 'billnaw_session_revoked must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_terminal_locked'), null, 'billnaw_terminal_locked must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_pin_verified_at'), null, 'billnaw_pin_verified_at must be purged');
    assert.strictEqual(localStorage.getItem('billnaw_offline_sync_queue'), null, 'billnaw_offline_sync_queue must be purged');

    // Verify cafe_staff IDB was purged
    const idbStaff = await idb.get('cafe_staff');
    assert.strictEqual(idbStaff, null, 'cafe_staff in IDB must be purged');

    // Verify clean re-authentication prompted (PIN lock for authenticated shop)
    assert.strictEqual(lockTerminalCalls.length, 1, 'lockTerminal must be invoked once to prompt PIN entry');
    assert.strictEqual(lockTerminalCalls[0].notify, true);
    assert.strictEqual(openShopAuthModalCalls.length, 0, 'openShopAuthModal should not be called when auth token exists');

    // Verify shop credentials were NOT wiped
    assert.strictEqual(localStorage.getItem('billnaw_auth_token'), 'jwt_test_token_shop_owner');
    assert.strictEqual(localStorage.getItem('billnaw_store_code'), 'SHOP_ABHIJITMODAK');
  });

  await asyncTest('R1-03: Unauthenticated device triggers openShopAuthModal on epoch mismatch', async () => {
    localStorage.setItem('billnaw_data_epoch', '2026_01_01_OLD_EPOCH');
    localStorage.removeItem('billnaw_auth_token');
    localStorage.removeItem('billnaw_shop_session');

    lockTerminalCalls = [];
    openShopAuthModalCalls = [];

    const result = await checkAndApplySessionEpoch();
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(openShopAuthModalCalls.length, 1, 'openShopAuthModal must be invoked for unauthenticated device');
    assert.strictEqual(openShopAuthModalCalls[0].isReLogin, true);
    assert.strictEqual(lockTerminalCalls.length, 0);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: R1 Idempotence & Immediate Load
  // --------------------------------------------------------------------------
  console.log('\n📍 TEST GROUP 2: R1 Idempotence & Zero Delay on Matching Epoch');

  await asyncTest('R1-04: Subsequent boot/wake with matching epoch executes immediately (0ms delay, no purge, no re-auth)', async () => {
    localStorage.setItem('billnaw_data_epoch', APP_DATA_EPOCH);
    localStorage.setItem('billnaw_store_staff', JSON.stringify([{ id: 1, name: 'Admin' }]));
    lockTerminalCalls = [];
    openShopAuthModalCalls = [];

    const t0 = performance.now();
    const result = await checkAndApplySessionEpoch();
    const elapsed = performance.now() - t0;

    assert.strictEqual(result.migrated, false, 'Must not migrate when epoch matches');
    assert.deepStrictEqual(result.preservedDraftTables, []);
    assert.strictEqual(lockTerminalCalls.length, 0, 'No lockTerminal prompt on matching epoch');
    assert.strictEqual(openShopAuthModalCalls.length, 0, 'No auth modal prompt on matching epoch');
    assert.ok(localStorage.getItem('billnaw_store_staff') !== null, 'Staff cache must NOT be purged on matching epoch');
    assert.ok(elapsed < 20, `Execution must be near instantaneous (took ${elapsed.toFixed(2)}ms)`);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: R1 Lifecycle Wake Hooks
  // --------------------------------------------------------------------------
  console.log('\n📍 TEST GROUP 3: R1 Lifecycle Wake Hooks (visibilitychange, focus, pageshow)');

  await asyncTest('R1-05: visibilitychange hook triggers checkAndApplySessionEpoch when returning from background', async () => {
    const visibilityHandlers = eventListeners.document.get('visibilitychange') || [];
    assert.ok(visibilityHandlers.length > 0, 'Must register visibilitychange listener');

    // Simulate epoch change on server while app was backgrounded
    localStorage.setItem('billnaw_data_epoch', '2026_11_18_OUTDATED');
    global.document.hidden = false;

    // Trigger visibilitychange
    for (const handler of visibilityHandlers) {
      await handler();
    }
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(localStorage.getItem('billnaw_data_epoch'), APP_DATA_EPOCH, 'Epoch must be upgraded on visibilitychange wake');
  });

  await asyncTest('R1-06: window focus hook triggers checkAndApplySessionEpoch', async () => {
    const focusHandlers = eventListeners.window.get('focus') || [];
    assert.ok(focusHandlers.length > 0, 'Must register focus listener');

    localStorage.setItem('billnaw_data_epoch', '2026_11_18_OUTDATED_FOCUS');
    for (const handler of focusHandlers) {
      await handler();
    }
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(localStorage.getItem('billnaw_data_epoch'), APP_DATA_EPOCH, 'Epoch must be upgraded on focus wake');
  });

  await asyncTest('R1-07: window pageshow hook triggers checkAndApplySessionEpoch (bfcache restore)', async () => {
    const pageshowHandlers = eventListeners.window.get('pageshow') || [];
    assert.ok(pageshowHandlers.length > 0, 'Must register pageshow listener');

    localStorage.setItem('billnaw_data_epoch', '2026_11_18_OUTDATED_PAGESHOW');
    for (const handler of pageshowHandlers) {
      await handler();
    }
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(localStorage.getItem('billnaw_data_epoch'), APP_DATA_EPOCH, 'Epoch must be upgraded on pageshow wake');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: R2 Multi-Tenant Isolation & Zero Cross-Contamination
  // --------------------------------------------------------------------------
  console.log('\n📍 TEST GROUP 4: R2 Multi-Tenant Isolation & Quarantine Enforcement');

  const {
    sanitizeStaffForTenant,
    isAbhijitTenant,
    BAPI_QUARANTINE_STAFF_IDS
  } = await import('../server/sync-service.js');

  test('R2-01: Tenant identification strictly segregates SHOP_ABHIJITMODAK vs SHOP_BAPI92HALDER', () => {
    assert.strictEqual(isAbhijitTenant('SHOP_ABHIJITMODAK', null, null), true);
    assert.strictEqual(isAbhijitTenant('SHOP_BAPI92HALDER', 'bapi@gmail.com', null), false);
    assert.strictEqual(isAbhijitTenant('SHOP_RANDOM', 'other@shop.com', null), false);
    assert.strictEqual(isAbhijitTenant('OTHER', 'abhijitmodak098@gmail.com', null), true);
  });

  test('R2-02: sanitizeStaffForTenant removes leaked staff from SHOP_ABHIJITMODAK and preserves SHOP_BAPI92HALDER', () => {
    const mixedPayload = {
      staff: [
        { id: 1, name: 'Admin', role: 'Admin' },
        { id: '1793949208017', name: 'Dk', role: 'Staff' },
        { id: '1793965135000', name: 'Bapi Halder', role: 'Staff' },     // Leaked Bapi
        { id: '1793965355981', name: 'Gourab Majumder', role: 'Staff' } // Leaked Gourab
      ],
      deletedStaffIds: ['existing_del_99']
    };

    // When applied to Abhijit's shop: leaked Bapi IDs must be quarantined and added to deletedStaffIds
    const abhiSanitized = sanitizeStaffForTenant('SHOP_ABHIJITMODAK', mixedPayload);
    assert.strictEqual(abhiSanitized.staff.length, 2, 'Abhijit shop must retain only genuine staff');
    assert.deepStrictEqual(abhiSanitized.staff.map(s => s.name), ['Admin', 'Dk']);
    assert.ok(abhiSanitized.deletedStaffIds.includes('1793965135000'));
    assert.ok(abhiSanitized.deletedStaffIds.includes('1793965355981'));
    assert.ok(abhiSanitized.deletedStaffIds.includes('existing_del_99'));

    // When applied to Bapi's shop: genuine Bapi staff must remain intact!
    const bapiPayload = {
      staff: [
        { id: '1793965135000', name: 'Bapi Halder', role: 'Admin' },
        { id: '1793965355981', name: 'Gourab Majumder', role: 'Staff' }
      ],
      deletedStaffIds: []
    };
    const bapiSanitized = sanitizeStaffForTenant('SHOP_BAPI92HALDER', bapiPayload);
    assert.strictEqual(bapiSanitized.staff.length, 2, 'Bapi shop must keep its own staff');
    assert.strictEqual(bapiSanitized.staff[0].name, 'Bapi Halder');
  });

  await asyncTest('R2-03: dispatchBackendStoreSync rejects mismatched store code payload to prevent cross-tenant writes', async () => {
    const dispatchBackendStoreSync = coreModule.dispatchBackendStoreSync || window.dispatchBackendStoreSync;
    assert.strictEqual(typeof dispatchBackendStoreSync, 'function', 'dispatchBackendStoreSync must be a function');

    localStorage.setItem('billnaw_store_code', 'SHOP_ABHIJITMODAK');
    // Payload with storeCode for BAPI while active store is ABHIJIT
    const rejected = await dispatchBackendStoreSync({ storeCode: 'SHOP_BAPI92HALDER', tables: {} });
    assert.strictEqual(rejected, false, 'Store mismatch must be strictly rejected');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: R3 UI Invariants & Code Standards
  // --------------------------------------------------------------------------
  console.log('\n📍 TEST GROUP 5: R3 UI Invariants (Strictly 26 Modal Close SVGs, 0 Button Emoji)');

  const indexHtmlPath = path.join(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  test('R3-01: Exactly 26 modal close button SVGs exist in index.html', () => {
    const modalCloseMatches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(modalCloseMatches.length, 26, `Must have strictly 26 modal-close-btn elements, found ${modalCloseMatches.length}`);
  });

  test('R3-02: Every one of the 26 modal close buttons contains verbatim 15x15 vector SVG', () => {
    const expectedSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const buttonRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    let count = 0;
    while ((match = buttonRegex.exec(indexHtml)) !== null) {
      count++;
      const innerHtml = match[1].trim();
      assert.ok(innerHtml.includes(expectedSvg), `Modal close button #${count} must contain the standard 15x15 vector SVG`);
      assert.ok(!match[0].includes('\n'), `Modal close button #${count} must be formatted as a single line`);
      assert.ok(!match[0].includes('?'), `Modal close button #${count} must have 0 raw '?' characters`);
    }
    assert.strictEqual(count, 26, `Verified all 26 modal close buttons`);
  });

  test('R3-03: Zero raw Unicode emoji characters inside any <button> element in index.html', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let btnMatch;
    let violations = 0;
    const violatingButtons = [];

    while ((btnMatch = buttonRegex.exec(indexHtml)) !== null) {
      const fullTag = btnMatch[0];
      const textOnly = btnMatch[2].replace(/<[^>]+>/g, '').trim();
      if (emojiRegex.test(textOnly)) {
        violations++;
        violatingButtons.push(fullTag.substring(0, 100));
      }
    }

    assert.strictEqual(violations, 0, `Found ${violations} button emoji violations in index.html:\n${violatingButtons.join('\n')}`);
  });

  test('R3-04: Anti-collision guardrail: dedicated close buttons do not use modal-close-btn', () => {
    const dedicatedClasses = [
      'shop-auth-close-btn', 'device-hub-close-btn', 'session-close-btn',
      'tbl-close-btn', 'rtr_close_btn', 'khata-close-btn', 'printer-close-btn'
    ];
    for (const dClass of dedicatedClasses) {
      const reg = new RegExp(`class=["'][^"']*${dClass}[^"']*modal-close-btn[^"']*["']`, 'gi');
      assert.ok(!reg.test(indexHtml), `Dedicated class ${dClass} must NEVER collide with modal-close-btn`);
    }
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎉 ALL ${passedTests} TESTS PASSED CLEANLY (Total: ${totalTests}, Failed: 0)`);
  console.log('====================================================================\n');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
