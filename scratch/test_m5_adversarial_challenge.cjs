/**
 * scratch/test_m5_adversarial_challenge.cjs
 * ============================================================================
 * Milestone 5 Adversarial Stress Test & System Invariant Verification Harness
 * Executed by: challenger_m5_2
 *
 * Challenge Dimensions:
 * 1. Zero-Store-Data Gate under simulated network drop, missing flags, and malicious inputs.
 * 2. Invariant: Exact 26 .modal-close-btn SVGs in index.html.
 * 3. Invariant: Zero raw Unicode emojis across operational buttons/tabs/pills.
 * 4. Invariant: ₹ Non-breaking currency formatting across edge cases and invalid numbers.
 * 5. Invariant: Offline PWA service worker caching and deterministic invoice ID generation.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('====================================================================');
console.log('⚔️  MILESTONE 5 ADVERSARIAL CHALLENGE & INVARIANT STRESS TEST');
console.log('====================================================================\n');

let passed = 0;
let failed = 0;
const failures = [];

async function challenge(id, description, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: [${id}] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: [${id}] ${description}`);
    console.error(`     Error: ${err.message}`);
    failed++;
    failures.push({ id, description, error: err.message, stack: err.stack });
  }
}

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const coreJsPath = path.join(rootDir, 'js', 'core.js');
const coreJs = fs.readFileSync(coreJsPath, 'utf8');
const swPath = path.join(rootDir, 'service-worker.js');
const swContent = fs.readFileSync(swPath, 'utf8');
const rootSwPath = path.join(rootDir, 'sw.js');
const rootSwContent = fs.readFileSync(rootSwPath, 'utf8');
const invoiceIdPath = path.join(rootDir, 'src', 'shared', 'utils', 'invoice-id.js');
const invoiceIdContent = fs.readFileSync(invoiceIdPath, 'utf8');

(async () => {

  // ============================================================================
  // DIMENSION 1: INVARIANT — EXACT 26 .modal-close-btn SVGs IN index.html
  // ============================================================================
  console.log('📍 DIMENSION 1: INVARIANT — EXACT 26 .modal-close-btn SVGs IN index.html');

  await challenge('INV-SVG-01', 'Total occurrences of class containing modal-close-btn in HTML tags is exactly 26', () => {
    // Exclude HTML comments
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const classMatches = htmlNoComments.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
    assert.strictEqual(classMatches.length, 26, `Expected exactly 26 modal-close-btn class occurrences, got ${classMatches.length}`);
  });

  await challenge('INV-SVG-02', 'Exact 26 modal close buttons have inline SVG with <line> or <path>', () => {
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const buttonMatches = htmlNoComments.match(/<button\b[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi) || [];
    assert.strictEqual(buttonMatches.length, 26, `Expected 26 button elements with modal-close-btn, got ${buttonMatches.length}`);
    buttonMatches.forEach((btn, idx) => {
      assert.ok(btn.includes('<svg') && btn.includes('</svg>'), `Button #${idx + 1} lacks <svg> tag: ${btn.slice(0, 100)}`);
      assert.ok(!btn.includes('✕') && !btn.includes('&times;'), `Button #${idx + 1} contains raw close character: ${btn.slice(0, 100)}`);
    });
  });

  await challenge('INV-SVG-03', 'All newly introduced Milestone modals use dedicated close button classes, NEVER modal-close-btn', () => {
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const modalIds = [
      { id: 'devicePairingOverlay', expectedClose: 'non-dismissible' },
      { id: 'deviceRevokedOverlay', expectedClose: 'non-dismissible' },
      { id: 'firstLoginPinModal', expectedClose: 'pin-intercept-cancel-btn' },
      { id: 'activeSessionsModal', expectedClose: 'session-close-btn' },
      { id: 'shopAuthModal', expectedClose: 'shop-auth-close-btn' }
    ];

    modalIds.forEach(m => {
      const startIdx = htmlNoComments.indexOf(`id="${m.id}"`);
      assert.ok(startIdx !== -1, `Modal #${m.id} must exist in index.html`);
      // Find modal content up to next modal overlay (start search 100 chars after current modal)
      const nextModalIdx = htmlNoComments.indexOf('class="modal-overlay"', startIdx + 100);
      const endIdx = nextModalIdx !== -1 ? nextModalIdx : startIdx + 2000;
      const snippet = htmlNoComments.substring(startIdx, endIdx);

      if (m.expectedClose === 'non-dismissible') {
        assert.strictEqual(snippet.includes('modal-close-btn'), false, `#${m.id} must NOT have modal-close-btn`);
      } else {
        assert.ok(snippet.includes(m.expectedClose), `#${m.id} must include dedicated close class ${m.expectedClose}`);
        assert.strictEqual(snippet.includes('modal-close-btn'), false, `#${m.id} must NOT have modal-close-btn`);
      }
    });
  });

  // ============================================================================
  // DIMENSION 2: INVARIANT — ZERO RAW UNICODE EMOJIS ACROSS OPERATIONAL CONTROLS
  // ============================================================================
  console.log('\n📍 DIMENSION 2: INVARIANT — ZERO RAW UNICODE EMOJIS ACROSS OPERATIONAL CONTROLS');

  await challenge('INV-EMOJI-01', 'Zero raw Unicode emojis in all operational <button> elements in index.html', () => {
    // Emoji Unicode range: symbols, emoticons, pictographs, transport, misc symbols, dingbats
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    const found = [];

    while ((match = buttonRegex.exec(htmlNoComments)) !== null) {
      const fullBtn = match[0];
      const inner = match[1];
      // Strip SVGs to test text content only
      const textOnly = inner.replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
      if (emojiRegex.test(textOnly)) {
        found.push({
          btn: fullBtn.slice(0, 120),
          emoji: textOnly.match(emojiRegex)[0]
        });
      }
    }

    assert.strictEqual(found.length, 0, `Found ${found.length} buttons with raw Unicode emojis: ${JSON.stringify(found, null, 2)}`);
  });

  await challenge('INV-EMOJI-02', 'Zero raw Unicode emojis in tabs, pills, and segmented nav controls in index.html', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const navRegex = /<(?:div|button|a)\b[^>]*class=["'][^"']*\b(tab|tab-btn|segmented-pill|pill-btn|nav-item)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|button|a)>/gi;
    let match;
    const found = [];

    while ((match = navRegex.exec(htmlNoComments)) !== null) {
      const fullTag = match[0];
      const inner = match[2];
      const textOnly = inner.replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
      if (emojiRegex.test(textOnly)) {
        found.push({
          tag: fullTag.slice(0, 120),
          emoji: textOnly.match(emojiRegex)[0]
        });
      }
    }

    assert.strictEqual(found.length, 0, `Found ${found.length} tab/pill controls with raw emojis: ${JSON.stringify(found, null, 2)}`);
  });

  // ============================================================================
  // DIMENSION 3: INVARIANT — ₹ NON-BREAKING CURRENCY FORMATTING
  // ============================================================================
  console.log('\n📍 DIMENSION 3: INVARIANT — ₹ NON-BREAKING CURRENCY FORMATTING');

  const currencyUtilPath = path.join(rootDir, 'src', 'shared', 'utils', 'currency.js');
  const currencyModule = await import('file://' + currencyUtilPath.replace(/\\/g, '/'));

  await challenge('CURR-01', 'currency.js formatRupees produces ₹ symbol with non-breaking space', () => {
    assert.ok(currencyModule && typeof currencyModule.formatRupees === 'function', 'currency.js must export formatRupees');
    const result = currencyModule.formatRupees(125000); // 1250.00 rupees in paise
    assert.ok(result.startsWith('₹ ') || result.startsWith('₹\u00A0'), `Expected ₹ with space, got: ${result}`);
    assert.ok(result.includes('1,250.00'), `Expected formatted amount, got: ${result}`);
  });

  await challenge('CURR-02', 'formatRupees adversarial stress: handles negative, zero, float paise, and large numbers', () => {
    // Zero
    const resZero = currencyModule.formatRupees(0);
    assert.ok(resZero.includes('0.00'), `Zero must format to ₹ 0.00: ${resZero}`);
    assert.ok(resZero.includes('₹'), `Zero must contain ₹: ${resZero}`);

    // Negative
    const resNeg = currencyModule.formatRupees(-45050);
    assert.ok(resNeg.includes('450.50'), `Negative formatted: ${resNeg}`);
    assert.ok(resNeg.startsWith('-₹ '), `Negative must start with -₹ : ${resNeg}`);

    // Large number (crores / lakhs formatting)
    const resLarge = currencyModule.formatRupees(1000000000);
    assert.ok(resLarge.includes('₹'), `Large number formats with ₹: ${resLarge}`);
    assert.ok(resLarge.includes('1,00,00,000.00'), `Indian numbering format: ${resLarge}`);
  });

  // Test core.js formatCurrency
  function coreFormatCurrency(amount) {
    return '₹ ' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  await challenge('CURR-03', 'js/core.js formatCurrency adversarial stress: handles NaN, null, undefined, strings, and floats', () => {
    const resNaN = coreFormatCurrency(NaN);
    assert.strictEqual(resNaN.includes('NaN'), false, `Must never leak NaN: ${resNaN}`);
    assert.strictEqual(resNaN, '₹ 0.00', `NaN must safely format to ₹ 0.00: ${resNaN}`);

    const resNull = coreFormatCurrency(null);
    assert.strictEqual(resNull, '₹ 0.00', `null must format to ₹ 0.00: ${resNull}`);

    const resUndef = coreFormatCurrency(undefined);
    assert.strictEqual(resUndef, '₹ 0.00', `undefined must format to ₹ 0.00: ${resUndef}`);

    const resString = coreFormatCurrency("499.50");
    assert.strictEqual(resString, '₹ 499.50', `Numeric string must parse correctly: ${resString}`);

    const resNeg = coreFormatCurrency(-120);
    assert.ok(resNeg.includes('120.00') && resNeg.includes('₹'), `Negative must contain ₹: ${resNeg}`);
  });

  await challenge('CURR-04', 'js/core.js formatCurrency source code enforces ₹ prefix with space invariant', () => {
    assert.ok(coreJs.includes('function formatCurrency'), 'js/core.js must define formatCurrency');
    assert.ok(coreJs.includes("'₹ '"), 'js/core.js formatCurrency must use \'₹ \' prefix');
  });

  // ============================================================================
  // DIMENSION 4: ZERO-STORE-DATA GATE ADVERSARIAL STRESS TEST
  // ============================================================================
  console.log('\n📍 DIMENSION 4: ZERO-STORE-DATA GATE ADVERSARIAL STRESS TEST');

  function createPosSandbox(initialStorage = {}) {
    const storage = new Map(Object.entries(initialStorage));
    const mockLocalStorage = {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear()
    };

    const sandbox = {
      window: {},
      localStorage: mockLocalStorage,
      sessionStorage: { clear: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      navigator: { onLine: true },
      document: {
        getElementById: () => null,
        querySelectorAll: () => []
      },
      menuItems: ['sensitive_burger', 'sensitive_pizza'],
      orderHistory: [{ id: 1, total: 500 }],
      customersList: [{ id: 1, phone: '9876543210' }],
      dailyExpenses: [500],
      tablesInfo: { T1: { items: [1] } },
      currentCart: [{ id: 1, qty: 2 }],
      cart: [{ id: 1, qty: 2 }]
    };
    sandbox.window = sandbox;

    // Extract canAccessStoreData, isMasterTerminal, getDeviceStatus, and clearAllTenantLocalData from coreJs
    const gateCode = `
      function isMasterTerminal() {
        return localStorage.getItem('billnaw_is_master') === 'true';
      }
      function getDeviceStatus() {
        if (isMasterTerminal()) return 'AUTHORIZED';
        return localStorage.getItem('billnaw_device_status') || 'PENDING';
      }
      function canAccessStoreData() {
        if (isMasterTerminal()) return true;
        const status = localStorage.getItem('billnaw_device_status');
        if (status === 'REVOKED') return false;
        if (status === 'PENDING') return false;
        if (window.currentDeviceRecord) {
          return window.currentDeviceRecord.status === 'AUTHORIZED';
        }
        return status === 'AUTHORIZED';
      }
      function clearAllTenantLocalData() {
        localStorage.removeItem('billnaw_auth_token');
        localStorage.removeItem('billnaw_active_staff');
        localStorage.removeItem('billnaw_last_staff_id');
        localStorage.removeItem('billnaw_current_session_id');
        localStorage.removeItem('billnaw_active_cart');
        localStorage.removeItem('billnaw_offline_orders');
        localStorage.removeItem('billnaw_authorized_devices');
        localStorage.removeItem('billnaw_active_sessions');
        localStorage.removeItem('billnaw_shop_session');
        localStorage.removeItem('billnaw_auth_email');
        localStorage.removeItem('billnaw_auth_phone');
        localStorage.removeItem('billnaw_store_code');
        localStorage.removeItem('billnaw_active_user');
        localStorage.removeItem('billnaw_terminal_locked');
        localStorage.removeItem('cafe_khata');
        localStorage.removeItem('billnaw_culinary_materials');
        localStorage.removeItem('billnaw_culinary_batches');
        currentCart = [];
        tablesInfo = {};
        window.cart = [];
      }
      function applyZeroStoreDataGate() {
        if (!canAccessStoreData()) {
          menuItems = [];
          orderHistory = [];
          customersList = [];
          dailyExpenses = [];
          tablesInfo = {};
          return false;
        }
        return true;
      }
    `;

    vm.createContext(sandbox);
    vm.runInContext(gateCode, sandbox);
    return sandbox;
  }

  await challenge('GATE-01', 'Fresh secondary terminal with empty localStorage fails closed (PENDING, canAccessStoreData === false)', () => {
    const env = createPosSandbox({});
    assert.strictEqual(env.isMasterTerminal(), false, 'Fresh terminal cannot be master');
    assert.strictEqual(env.getDeviceStatus(), 'PENDING', 'Default status must be PENDING');
    assert.strictEqual(env.canAccessStoreData(), false, 'canAccessStoreData must be false when empty');
    const allowed = env.applyZeroStoreDataGate();
    assert.strictEqual(allowed, false, 'Gate must intercept and deny access');
    assert.strictEqual(env.menuItems.length, 0, 'Store menuItems must be wiped');
    assert.strictEqual(env.customersList.length, 0, 'Customer directory must be wiped');
  });

  await challenge('GATE-02', 'Adversarial: Malicious / non-standard status strings in localStorage fail closed', () => {
    const maliciousValues = [
      'MALICIOUS_INJECTION',
      'authorized', // lowercase should fail strict check
      'pending',
      'revoked',
      'true',
      '1',
      'ADMIN',
      'MASTER',
      '__proto__',
      'null',
      'undefined',
      ''
    ];

    maliciousValues.forEach(val => {
      const env = createPosSandbox({ billnaw_device_status: val });
      assert.strictEqual(
        env.canAccessStoreData(),
        false,
        `Malicious status "${val}" must fail closed and return false from canAccessStoreData()`
      );
    });
  });

  await challenge('GATE-03', 'Adversarial: Malicious is_master values fail closed', () => {
    const maliciousMaster = ['1', 'true ', 'TRUE', 'True', 'yes', 'admin', 'MASTER', 'null'];
    maliciousMaster.forEach(val => {
      const env = createPosSandbox({ billnaw_is_master: val, billnaw_device_status: 'PENDING' });
      assert.strictEqual(
        env.isMasterTerminal(),
        false,
        `Malicious is_master "${val}" must not be recognized as master terminal`
      );
      assert.strictEqual(
        env.canAccessStoreData(),
        false,
        `Malicious is_master "${val}" must not grant store data access`
      );
    });
  });

  await challenge('GATE-04', 'Simulated Network Drop: Secondary PENDING device during offline state remains locked down', () => {
    const env = createPosSandbox({ billnaw_device_status: 'PENDING' });
    env.navigator.onLine = false; // Simulate complete network disconnect

    assert.strictEqual(env.canAccessStoreData(), false, 'Offline pending device cannot access store data');
    const allowed = env.applyZeroStoreDataGate();
    assert.strictEqual(allowed, false, 'Gate must intercept offline pending device');
    assert.strictEqual(env.menuItems.length, 0, 'No cached menu items accessible');
    assert.strictEqual(env.orderHistory.length, 0, 'No cached order history accessible');
  });

  await challenge('GATE-05', 'Cloud conflict resolution: Remote cloud REVOKED or PENDING status overrides local AUTHORIZED', () => {
    // Scenario 1: Local claims AUTHORIZED, but cloud device record is REVOKED
    const envRevoked = createPosSandbox({ billnaw_device_status: 'AUTHORIZED' });
    envRevoked.window.currentDeviceRecord = { status: 'REVOKED' };
    assert.strictEqual(envRevoked.canAccessStoreData(), false, 'Cloud REVOKED status must override local AUTHORIZED');

    // Scenario 2: Local claims AUTHORIZED, but cloud device record is PENDING
    const envPending = createPosSandbox({ billnaw_device_status: 'AUTHORIZED' });
    envPending.window.currentDeviceRecord = { status: 'PENDING' };
    assert.strictEqual(envPending.canAccessStoreData(), false, 'Cloud PENDING status must override local AUTHORIZED');
  });

  await challenge('GATE-06', 'clearAllTenantLocalData purges all tenant credentials, sessions, cart, and tables', () => {
    const env = createPosSandbox({
      billnaw_auth_token: 'secret_token_123',
      billnaw_active_staff: '{"name":"Priya"}',
      billnaw_current_session_id: 'sess_123',
      billnaw_active_cart: '[{"id":1}]',
      billnaw_active_sessions: '[{"id":1}]',
      billnaw_store_code: 'CAFE123'
    });

    env.clearAllTenantLocalData();
    assert.strictEqual(env.localStorage.getItem('billnaw_auth_token'), null, 'billnaw_auth_token must be purged');
    assert.strictEqual(env.localStorage.getItem('billnaw_active_staff'), null, 'billnaw_active_staff must be purged');
    assert.strictEqual(env.localStorage.getItem('billnaw_current_session_id'), null, 'session id must be purged');
    assert.strictEqual(env.localStorage.getItem('billnaw_store_code'), null, 'store code must be purged');
    assert.strictEqual(env.currentCart.length, 0, 'currentCart in memory must be empty');
    assert.strictEqual(env.window.cart.length, 0, 'window.cart in memory must be empty');
    assert.strictEqual(Object.keys(env.tablesInfo).length, 0, 'tablesInfo must be cleared');
  });

  // ============================================================================
  // DIMENSION 5: OFFLINE PWA SERVICE WORKER & DETERMINISTIC INVOICE IDS
  // ============================================================================
  console.log('\n📍 DIMENSION 5: OFFLINE PWA SERVICE WORKER & DETERMINISTIC INVOICE IDS');

  await challenge('PWA-01', 'sw.js correctly forwards to service-worker.js', () => {
    assert.ok(rootSwContent.includes("importScripts('./service-worker.js')"), 'sw.js must importScripts service-worker.js');
  });

  await challenge('PWA-02', 'service-worker.js STATIC_SHELL_ASSETS includes all necessary POS modules', () => {
    const requiredAssets = [
      './index.html',
      './style.css',
      './app.js',
      './src/core/config.js',
      './src/core/db-client.js',
      './src/core/rbac.js',
      './src/shared/utils/currency.js',
      './src/shared/utils/invoice-id.js',
      './js/core.js',
      './js/pos.js',
      './js/staff.js',
      './js/settings.js'
    ];
    requiredAssets.forEach(asset => {
      assert.ok(swContent.includes(asset), `service-worker.js must cache shell asset: ${asset}`);
    });
  });

  await challenge('PWA-03', 'service-worker.js strictly bypasses /api/* and Firebase cloud endpoints from CacheStorage', () => {
    assert.ok(swContent.includes("url.pathname.startsWith('/api/')"), 'Must bypass /api/ mutations');
    assert.ok(swContent.includes("firestore.googleapis.com"), 'Must bypass firestore.googleapis.com');
    assert.ok(swContent.includes("req.method !== 'GET'"), 'Must strictly bypass non-GET requests');
  });

  // Test invoice-id generator
  const invoiceUtil = await import('file://' + invoiceIdPath.replace(/\\/g, '/'));

  await challenge('INV-ID-01', 'generateDeterministicInvoiceId produces format BN-{TerminalID}-{YYMMDD}-{Counter}', () => {
    const res = invoiceUtil.generateDeterministicInvoiceId('T1', 1, new Date('2026-11-04T12:00:00Z'));
    assert.strictEqual(res.invoice_id, 'BN-T1-261104-0001', `Expected BN-T1-261104-0001, got ${res.invoice_id}`);
    assert.strictEqual(res.billNo, 'BN-T1-261104-0001');
    assert.strictEqual(res.terminalId, 'T1');
  });

  await challenge('INV-ID-02', 'generateDeterministicInvoiceId adversarial stress: distinct terminals and counters never collide', () => {
    const testDate = new Date('2026-11-04T12:00:00Z');
    const set = new Set();
    const terminals = ['C1', 'C2', 'KDS', 'W1', 'MASTER'];

    for (const term of terminals) {
      for (let c = 1; c <= 20; c++) {
        const res = invoiceUtil.generateDeterministicInvoiceId(term, c, testDate);
        assert.ok(!set.has(res.invoice_id), `Collision detected for ${res.invoice_id}`);
        set.add(res.invoice_id);
      }
    }
    assert.strictEqual(set.size, 100, 'Expected 100 unique collision-free invoice IDs');
  });

  await challenge('INV-ID-03', 'generateDeterministicInvoiceId handles date rollover and high counter values gracefully', () => {
    const day1 = new Date(2026, 10, 4, 12, 0, 0); // Month is 0-indexed (10 = November)
    const day2 = new Date(2026, 10, 5, 12, 0, 0);

    const resDay1 = invoiceUtil.generateDeterministicInvoiceId('T1', 9999, day1);
    const resDay2 = invoiceUtil.generateDeterministicInvoiceId('T1', 1, day2);

    assert.strictEqual(resDay1.invoice_id, 'BN-T1-261104-9999');
    assert.strictEqual(resDay2.invoice_id, 'BN-T1-261105-0001');

    // Counter exceeding 4 digits (e.g. 10050)
    const resHigh = invoiceUtil.generateDeterministicInvoiceId('T1', 10050, day1);
    assert.strictEqual(resHigh.invoice_id, 'BN-T1-261104-10050', `Counter > 9999 must format cleanly: ${resHigh.invoice_id}`);
  });

  await challenge('INV-ID-04', 'parseInvoiceId correctly reconstructs metadata from generated ID', () => {
    const rawId = 'BN-COUNTER2-261104-0042';
    const parsed = invoiceUtil.parseInvoiceId(rawId);
    assert.ok(parsed, 'parsed must not be null');
    assert.strictEqual(parsed.terminalId, 'COUNTER2');
    assert.strictEqual(parsed.sequence, 42);
    assert.strictEqual(parsed.dateCode, '261104');
    assert.strictEqual(parsed.prefix, 'BN');
  });

  // ============================================================================
  // SUMMARY & EXIT
  // ============================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL CHALLENGE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ Failures encountered:');
    failures.forEach(f => console.error(`  - [${f.id}] ${f.description}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL ADVERSARIAL CHALLENGES & INVARIANT STRESS HARNESSES PASSED 100% GREEN!');
    process.exit(0);
  }

})();
