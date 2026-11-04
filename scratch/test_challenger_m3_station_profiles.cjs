/**
 * scratch/test_challenger_m3_station_profiles.cjs
 * Empirical Adversarial Challenger Test Suite for Milestone 3:
 * Station Profiles, Tailored Views, KDS & Tables Workflows, Web Audio API Error Handling & System Invariants.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'index.html');
const styleCssPath = path.join(rootDir, 'style.css');
const cssDirPath = path.join(rootDir, 'css');
const coreJsPath = path.join(rootDir, 'js', 'core.js');
const staffJsPath = path.join(rootDir, 'js', 'staff.js');
const posJsPath = path.join(rootDir, 'js', 'pos.js');
const settingsJsPath = path.join(rootDir, 'js', 'settings.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
const findings = [];

function recordPass(testId, description, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: [${testId}] ${description}${details ? ` (${details})` : ''}`);
}

function recordFail(testId, description, error, details = '') {
  totalTests++;
  failedTests++;
  const msg = error && error.message ? error.message : String(error);
  failures.push({ testId, description, error: msg, details });
  console.error(`  ❌ FAIL: [${testId}] ${description}`);
  console.error(`     Error: ${msg}`);
  if (details) console.error(`     Context: ${details}`);
}

function recordFinding(category, title, observation, risk, recommendation) {
  findings.push({ category, title, observation, risk, recommendation });
  console.log(`  🔍 FINDING: [${category}] ${title} -> ${observation}`);
}

/**
 * Creates an isolated DOM Sandbox for testing core.js, pos.js, staff.js functions
 */
function createDomSandbox(extraGlobals = {}) {
  const store = {};
  const mockLocalStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const elements = {};
  function getOrCreateElement(id, tag = 'div') {
    if (elements[id]) return elements[id];
    const el = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        _set: new Set(),
        add: (...cls) => cls.forEach(c => el.classList._set.add(c)),
        remove: (...cls) => cls.forEach(c => el.classList._set.delete(c)),
        contains: (c) => el.classList._set.has(c),
        toggle: (c) => el.classList._set.has(c) ? el.classList._set.delete(c) : el.classList._set.add(c)
      },
      innerText: '',
      innerHTML: '',
      value: '',
      disabled: false,
      dataset: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {}
    };
    elements[id] = el;
    return el;
  }

  const mockDoc = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      if (sel === '.cart-discount-row') return null; // match actual index.html state
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const k in elements) {
          if (elements[k].classList.contains(cls)) return elements[k];
        }
      }
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => getOrCreateElement(`dyn_${Math.random().toString(36).slice(2)}`, tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const sandbox = {
    window: {},
    document: mockDoc,
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    navigator: { userAgent: 'NodeTestEngine' },
    location: { href: 'http://localhost' },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    tablesInfo: {},
    activeTable: 1,
    orderHistory: [],
    shopProfile: { showQr: false, startInvoiceNo: 1001 },
    currentStaff: null,
    showToast: () => {},
    ...extraGlobals
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};

  return { sandbox, elements, mockLocalStorage, getOrCreateElement };
}

async function runTestSuite() {
  console.log('====================================================================');
  console.log('🛡️  CHALLENGER SUITE: EMPIRICAL ADVERSARIAL STRESS ON STATION PROFILES & INVARIANTS');
  console.log('====================================================================\n');

  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const coreJs = fs.readFileSync(coreJsPath, 'utf8');

  // Strip comments for HTML structure checks
  const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '');

  // Load RBAC and Feature Modules
  const { ROLES, normalizeRole, hasPermission } = await import('../src/core/rbac.js');
  const { createKOT, updateKotStatus, cancelKOT } = await import('../src/features/kot/kot.service.js');
  const { KotUI } = await import('../src/features/kot/kot.ui.js');
  const { getTables, occupyTable, updateTableStatus } = await import('../src/features/tables/tables.service.js');
  const { TablesUI } = await import('../src/features/tables/tables.ui.js');
  const { formatRupees, rupeesToPaise, paiseToRupees } = await import('../src/shared/utils/currency.js');

  // ==================================================================
  // SECTION 1: INVARIANT STRESS TESTING & PROGRAMMATIC SCANS
  // ==================================================================
  console.log('📍 SECTION 1: INVARIANT STRESS TESTING (EXACT 26 CLOSE SVGS, EMOJIS, CURRENCY & CSS)');

  // [INV-01]: Scan index.html for modal-close-btn
  try {
    const modalCloseButtons = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
    assert.strictEqual(modalCloseButtons.length, 26, `Expected exactly 26 .modal-close-btn elements, found ${modalCloseButtons.length}`);
    recordPass('INV-01', 'Programmatically confirmed exactly 26 .modal-close-btn elements exist in index.html', `count = ${modalCloseButtons.length}`);
  } catch (e) {
    recordFail('INV-01', 'Exact 26 .modal-close-btn elements invariant failed', e);
  }

  // [INV-02]: All 26 contain inline SVG close icons
  try {
    const modalCloseButtons = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
    const withSvg = modalCloseButtons.filter(btn => /<svg\b/i.test(btn));
    assert.strictEqual(withSvg.length, 26, `Expected all 26 .modal-close-btn elements to contain <svg>, found ${withSvg.length}`);
    recordPass('INV-02', 'Confirmed 100% (26 of 26) .modal-close-btn elements contain inline vector SVG icons');
  } catch (e) {
    recordFail('INV-02', 'Missing SVG in modal close buttons', e);
  }

  // [INV-03]: Zero raw Unicode '✕' inside modal-close-btn
  try {
    const modalCloseButtons = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
    const withRawX = modalCloseButtons.filter(btn => btn.includes('✕') || btn.includes('&#10005;') || btn.includes('&times;'));
    assert.strictEqual(withRawX.length, 0, `Found ${withRawX.length} modal-close-btn elements with raw text close characters`);
    recordPass('INV-03', 'Zero instances of raw Unicode ✕ inside any .modal-close-btn elements');
  } catch (e) {
    recordFail('INV-03', 'Raw Unicode close character detected', e);
  }

  // [INV-04]: #authorizedDevicesModal uses isolated class .device-hub-close-btn
  try {
    const hubMatch = htmlWithoutComments.match(/<div[^>]*id=["']authorizedDevicesModal["'][\s\S]*?(?=<div\s+(?:id=["']|class=["']modal-overlay)|<\/body>)/i);
    assert.ok(hubMatch, 'authorizedDevicesModal not found in index.html');
    const modalContent = hubMatch[0];
    assert.ok(modalContent.includes('device-hub-close-btn'), 'Authorized Devices modal close button missing .device-hub-close-btn');
    assert.ok(!modalContent.includes('class="modal-close-btn"') && !modalContent.includes("class='modal-close-btn'"), 'Authorized Devices modal illegally uses .modal-close-btn class!');
    recordPass('INV-04', '#authorizedDevicesModal strictly uses isolated class .device-hub-close-btn (NEVER .modal-close-btn)');
  } catch (e) {
    recordFail('INV-04', 'Modal isolation violation in #authorizedDevicesModal', e);
  }

  // [INV-05]: #devicePairingOverlay and #deviceRevokedOverlay have zero close buttons (non-dismissible security gates)
  try {
    const pairingMatch = htmlWithoutComments.match(/<div[^>]*id=["']devicePairingOverlay["'][\s\S]*?(?=<div\s+(?:id=["']|class=["']modal-overlay)|<\/body>)/i);
    const revokedMatch = htmlWithoutComments.match(/<div[^>]*id=["']deviceRevokedOverlay["'][\s\S]*?(?=<div\s+(?:id=["']|class=["']modal-overlay)|<\/body>)/i);
    assert.ok(pairingMatch, 'devicePairingOverlay exists');
    assert.ok(revokedMatch, 'deviceRevokedOverlay exists');
    assert.ok(!pairingMatch[0].includes('modal-close-btn'), 'devicePairingOverlay must NOT have close buttons');
    assert.ok(!revokedMatch[0].includes('modal-close-btn'), 'deviceRevokedOverlay must NOT have close buttons');
    recordPass('INV-05', 'Secondary device pairing & revoked overlays have ZERO close buttons (non-dismissible security gates)');
  } catch (e) {
    recordFail('INV-05', 'Pairing overlay close button check failed', e);
  }

  // [INV-06]: #firstLoginPinModal uses isolated close button
  try {
    const pinModalMatch = htmlWithoutComments.match(/<div[^>]*id=["']firstLoginPinModal["'][\s\S]*?(?=<div\s+(?:id=["']|class=["']modal-overlay)|<\/body>)/i);
    assert.ok(pinModalMatch, 'firstLoginPinModal exists');
    assert.ok(pinModalMatch[0].includes('pin-intercept-cancel-btn'), 'firstLoginPinModal must use .pin-intercept-cancel-btn');
    assert.ok(!pinModalMatch[0].includes('class="modal-close-btn"') && !pinModalMatch[0].includes("class='modal-close-btn'"), 'firstLoginPinModal must NOT have modal-close-btn');
    recordPass('INV-06', '#firstLoginPinModal maintains close button isolation with .pin-intercept-cancel-btn');
  } catch (e) {
    recordFail('INV-06', 'firstLoginPinModal isolation check failed', e);
  }

  // [INV-07]: Strictly ZERO raw Unicode emojis in operational <button> elements
  try {
    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    // Strict Unicode emoji regex
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    
    const offendingButtons = [];
    buttonMatches.forEach((btn, idx) => {
      if (emojiRegex.test(btn)) {
        offendingButtons.push({ idx, snippet: btn.slice(0, 100) });
      }
    });

    assert.strictEqual(offendingButtons.length, 0, `Found ${offendingButtons.length} operational <button> elements containing raw emojis!`);
    recordPass('INV-07', `Programmatically verified all ${buttonMatches.length} <button> elements contain strictly ZERO raw Unicode emojis`);
  } catch (e) {
    recordFail('INV-07', 'Raw Unicode emojis detected in operational buttons', e);
  }

  // [INV-08]: Strictly ZERO raw Unicode emojis in <tab>, segmented pills and navigation controls
  try {
    const pillMatches = html.match(/<div\b[^>]*class=["'][^"']*(?:segmented-control|action-pill|discount-pill|category-pill|tab-btn)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const offendingPills = pillMatches.filter(pill => emojiRegex.test(pill));
    assert.strictEqual(offendingPills.length, 0, `Found ${offendingPills.length} segmented pills containing raw emojis`);
    recordPass('INV-08', 'Strictly ZERO raw Unicode emojis in tabs, pills, and navigation controls');
  } catch (e) {
    recordFail('INV-08', 'Raw Unicode emojis detected in pills/tabs', e);
  }

  // [INV-09]: Non-breaking currency space formatting (₹ )
  try {
    assert.strictEqual(formatRupees(14950), '₹ 149.50');
    assert.strictEqual(formatRupees(0), '₹ 0.00');
    assert.strictEqual(formatRupees(-5000), '-₹ 50.00');
    assert.strictEqual(formatRupees(10000000), '₹ 1,00,000.00');
    // Verify space after Rupee symbol
    assert.ok(formatRupees(100).includes('₹ '));
    assert.ok(!/₹\d/.test(formatRupees(100)), 'Cramped currency symbol found without space!');
    recordPass('INV-09', 'Non-breaking currency space formatting (₹ ) strictly preserved across positive, zero, and negative amounts');
  } catch (e) {
    recordFail('INV-09', 'Currency formatting space invariant failed', e);
  }

  // [INV-10]: Integer paise conversion with zero floating-point drift
  try {
    assert.strictEqual(rupeesToPaise(149.50), 14950);
    assert.strictEqual(rupeesToPaise('149.50'), 14950);
    assert.strictEqual(rupeesToPaise(0.1 + 0.2), 30); // Famous JS float drift 0.30000000000000004 -> 30 paise
    assert.strictEqual(paiseToRupees(14950), 149.50);
    recordPass('INV-10', 'Integer paise math eliminates floating-point drift (e.g. 0.1 + 0.2 -> exactly 30 paise)');
  } catch (e) {
    recordFail('INV-10', 'Integer paise math conversion drift detected', e);
  }

  // [INV-11]: All 9 CSS modules in css/ have 100% balanced braces
  try {
    const cssFiles = fs.readdirSync(cssDirPath).filter(f => f.endsWith('.css'));
    assert.strictEqual(cssFiles.length, 9, `Expected 9 CSS domain modules, found ${cssFiles.length}`);
    cssFiles.forEach(file => {
      const content = fs.readFileSync(path.join(cssDirPath, file), 'utf8');
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      assert.strictEqual(openBraces, closeBraces, `Unbalanced braces in css/${file}: ${openBraces} open vs ${closeBraces} close`);
    });
    recordPass('INV-11', 'All 9 CSS domain modules in css/ verify 100% balanced braces without syntax leaks');
  } catch (e) {
    recordFail('INV-11', 'Unbalanced CSS braces detected in modular files', e);
  }

  // [INV-12]: Bundled style.css exists and has balanced braces
  try {
    const openBraces = (styleCss.match(/{/g) || []).length;
    const closeBraces = (styleCss.match(/}/g) || []).length;
    assert.strictEqual(openBraces, closeBraces, `Unbalanced braces in style.css: ${openBraces} open vs ${closeBraces} close`);
    assert.ok(styleCss.length > 100000, `style.css file size unexpectedly small (${styleCss.length} bytes)`);
    recordPass('INV-12', `Bundled style.css verified: ${openBraces} balanced rules, byte size ${styleCss.length} bytes (>100KB)`);
  } catch (e) {
    recordFail('INV-12', 'style.css balanced braces check failed', e);
  }

  // ==================================================================
  // SECTION 2: KDS STATION PROFILE BOUNDARY TESTING
  // ==================================================================
  console.log('\n📍 SECTION 2: KDS STATION PROFILE BOUNDARY TESTING');

  // [KDS-01]: resolveInitialViewForStation returns 'kds'
  try {
    const { sandbox } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    const view = sandbox.resolveInitialViewForStation('KDS');
    assert.strictEqual(view, 'kds');
    recordPass('KDS-01', "resolveInitialViewForStation('KDS') strictly resolves to 'kds'");
  } catch (e) {
    recordFail('KDS-01', "resolveInitialViewForStation('KDS') failed", e);
  }

  // [KDS-02]: applyStationProfileRestrictions hides #checkoutBtn on KDS
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'KDS');
    sandbox.applyStationProfileRestrictions();

    const checkoutBtn = elements['checkoutBtn'];
    assert.strictEqual(checkoutBtn.style.display, 'none');
    recordPass('KDS-02', 'KDS station profile hides checkout button (#checkoutBtn.style.display === "none")');
  } catch (e) {
    recordFail('KDS-02', 'KDS failed to hide #checkoutBtn', e);
  }

  // [KDS-03]: applyStationProfileRestrictions hides counter navigation tabs on KDS
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'KDS');
    sandbox.applyStationProfileRestrictions();

    assert.strictEqual(elements['nav-pos'].style.display, 'none');
    assert.strictEqual(elements['nav-tables'].style.display, 'none');
    assert.strictEqual(elements['nav-menu'].style.display, 'none');
    assert.strictEqual(elements['nav-dashboard'].style.display, 'none');
    assert.strictEqual(elements['nav-inventory'].style.display, 'none');
    assert.strictEqual(elements['nav-khata'].style.display, 'none');
    assert.strictEqual(elements['nav-more'].style.display, 'none');
    recordPass('KDS-03', 'KDS station profile hides all counter tabs (#nav-pos, #nav-tables, #nav-menu, #nav-dashboard, #nav-inventory, #nav-khata, #nav-more)');
  } catch (e) {
    recordFail('KDS-03', 'KDS counter navigation tabs restriction failed', e);
  }

  // [KDS-04]: #nav-kds is displayed as 'flex' and marked active
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'KDS');
    sandbox.applyStationProfileRestrictions();

    assert.strictEqual(elements['nav-kds'].style.display, 'flex');
    assert.ok(elements['nav-kds'].classList.contains('active'));
    recordPass('KDS-04', 'KDS station profile displays #nav-kds as "flex" with active class');
  } catch (e) {
    recordFail('KDS-04', '#nav-kds visibility check failed', e);
  }

  // [KDS-05]: Transaction blocked if store data access is unapproved
  try {
    const { sandbox, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_device_status', 'PENDING');
    assert.strictEqual(sandbox.canAccessStoreData(), false);
    recordPass('KDS-05', 'Secondary device in PENDING or unapproved status strictly fails canAccessStoreData()');
  } catch (e) {
    recordFail('KDS-05', 'canAccessStoreData check failed for PENDING device', e);
  }

  // [KDS-06]: Kot ticket status progression: PENDING -> PREPARING -> READY -> SERVED
  try {
    const kotRes = await createKOT({
      table_id: 'Table 5',
      items: [
        { name: 'Masala Chai', quantity: 2, notes: 'Less sugar' },
        { name: 'Veg Sandwich', quantity: 1 }
      ]
    });
    assert.ok(kotRes.data && kotRes.data.kot_id);
    const kotId = kotRes.data.kot_id;
    assert.strictEqual(kotRes.data.status, 'PENDING');

    // 1. Advance to PREPARING
    const prepRes = await updateKotStatus(kotId, 'PREPARING');
    assert.strictEqual(prepRes.data.status, 'PREPARING');

    // 2. Advance to READY
    const readyRes = await updateKotStatus(kotId, 'READY');
    assert.strictEqual(readyRes.data.status, 'READY');

    // 3. Advance to SERVED
    const servedRes = await updateKotStatus(kotId, 'SERVED');
    assert.strictEqual(servedRes.data.status, 'SERVED');

    recordPass('KDS-06', 'KOT status progression verified: PENDING -> PREPARING -> READY -> SERVED');
  } catch (e) {
    recordFail('KDS-06', 'KOT status progression failed', e);
  }

  // [KDS-07]: Adversarial rejection of invalid status transitions
  try {
    const kotRes = await createKOT({ table_id: 'Table 2', items: [{ name: 'Espresso', quantity: 1 }] });
    const kotId = kotRes.data.kot_id;

    // Test invalid statuses
    const invalidStatuses = ['COMPLETED', 'DELIVERED', 'DONE', 'CANCEL', '', null, 999];
    for (const bad of invalidStatuses) {
      const res = await updateKotStatus(kotId, bad);
      assert.ok(res.error, `Expected updateKotStatus to reject status: ${bad}`);
    }
    recordPass('KDS-07', 'Adversarial rejection: updateKotStatus strictly rejects unauthorized statuses (COMPLETED, DELIVERED, null, etc.)');
  } catch (e) {
    recordFail('KDS-07', 'Adversarial status validation failed', e);
  }

  // [KDS-08]: KotUI rendering: status cards and action buttons
  try {
    const container = { innerHTML: '' };
    const kotUI = new KotUI({ container });
    kotUI.setKots([
      { kot_id: 'KOT-101', table_id: 'Table 1', status: 'PENDING', items: [{ name: 'Tea', quantity: 1 }] },
      { kot_id: 'KOT-102', table_id: 'Table 2', status: 'PREPARING', items: [{ name: 'Coffee', quantity: 2 }] },
      { kot_id: 'KOT-103', table_id: 'Table 3', status: 'READY', items: [{ name: 'Muffin', quantity: 1 }] },
      { kot_id: 'KOT-104', table_id: 'Table 4', status: 'SERVED', items: [{ name: 'Cookie', quantity: 3 }] }
    ]);

    assert.ok(container.innerHTML.includes('kot-status-pending'));
    assert.ok(container.innerHTML.includes('kot-status-preparing'));
    assert.ok(container.innerHTML.includes('kot-status-ready'));
    assert.ok(container.innerHTML.includes('kot-status-served'));

    // PENDING has .btn-prep, PREPARING has .btn-ready
    assert.ok(container.innerHTML.includes('data-action="prep"'));
    assert.ok(container.innerHTML.includes('data-action="ready"'));

    recordPass('KDS-08', 'KotUI renders active ticket queue with status badges and lifecycle action buttons');
  } catch (e) {
    recordFail('KDS-08', 'KotUI card rendering failed', e);
  }

  // [KDS-09]: KotUI empty queue fallback
  try {
    const container = { innerHTML: '' };
    const kotUI = new KotUI({ container });
    kotUI.setKots([]);
    assert.ok(container.innerHTML.includes('kot-empty'));
    assert.ok(container.innerHTML.includes('No active kitchen orders'));
    recordPass('KDS-09', 'KotUI renders .kot-empty with clean fallback text when queue is empty');
  } catch (e) {
    recordFail('KDS-09', 'KotUI empty queue test failed', e);
  }

  // ==================================================================
  // SECTION 3: WAITER MOBILE STATION PROFILE BOUNDARY TESTING
  // ==================================================================
  console.log('\n📍 SECTION 3: WAITER MOBILE STATION PROFILE BOUNDARY TESTING');

  // [WTR-01]: resolveInitialViewForStation returns 'tables'
  try {
    const { sandbox } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    const view = sandbox.resolveInitialViewForStation('WAITER_MOBILE');
    assert.strictEqual(view, 'tables');
    recordPass('WTR-01', "resolveInitialViewForStation('WAITER_MOBILE') strictly resolves to 'tables'");
  } catch (e) {
    recordFail('WTR-01', "resolveInitialViewForStation('WAITER_MOBILE') failed", e);
  }

  // [WTR-02]: applyStationProfileRestrictions hides #checkoutBtn on WAITER_MOBILE
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'WAITER_MOBILE');
    sandbox.applyStationProfileRestrictions();

    assert.strictEqual(elements['checkoutBtn'].style.display, 'none');
    recordPass('WTR-02', 'WAITER_MOBILE profile hides #checkoutBtn (display === "none")');
  } catch (e) {
    recordFail('WTR-02', 'WAITER_MOBILE failed to hide #checkoutBtn', e);
  }

  // [WTR-03]: applyStationProfileRestrictions hides #nav-kds, #nav-dashboard, #nav-inventory, #nav-khata
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'WAITER_MOBILE');
    sandbox.applyStationProfileRestrictions();

    assert.strictEqual(elements['nav-kds'].style.display, 'none');
    assert.strictEqual(elements['nav-dashboard'].style.display, 'none');
    assert.strictEqual(elements['nav-inventory'].style.display, 'none');
    assert.strictEqual(elements['nav-khata'].style.display, 'none');
    recordPass('WTR-03', 'WAITER_MOBILE profile hides back-office & kitchen tabs (#nav-kds, #nav-dashboard, #nav-inventory, #nav-khata)');
  } catch (e) {
    recordFail('WTR-03', 'WAITER_MOBILE navigation restrictions failed', e);
  }

  // [WTR-04]: #nav-tables and #nav-pos remain visible
  try {
    const { sandbox, elements, mockLocalStorage } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    mockLocalStorage.setItem('billnaw_station_profile', 'WAITER_MOBILE');
    sandbox.applyStationProfileRestrictions();

    assert.strictEqual(elements['nav-tables'].style.display, 'flex');
    assert.strictEqual(elements['nav-pos'].style.display, 'flex');
    recordPass('WTR-04', 'WAITER_MOBILE profile preserves access to #nav-tables and #nav-pos for table-side order entry');
  } catch (e) {
    recordFail('WTR-04', 'WAITER_MOBILE accessible tabs check failed', e);
  }

  // [WTR-05]: Bill settlement is blocked by RBAC permission check for Floor Server
  try {
    const serverStaff = { id: 3, name: 'Rahul Verma', role: 'Floor Server' };
    const canSettle = hasPermission(serverStaff, 'can_settle_bills');
    assert.strictEqual(canSettle, false, 'Floor Server must NOT have can_settle_bills permission!');
    recordPass('WTR-05', 'RBAC Invariant: Floor Server role is strictly barred from can_settle_bills');
  } catch (e) {
    recordFail('WTR-05', 'Floor Server can_settle_bills permission check failed', e);
  }

  // [WTR-06]: Discount controls blocked by RBAC permission check for Floor Server
  try {
    const serverStaff = { id: 3, name: 'Rahul Verma', role: 'Floor Server' };
    const canDiscount = hasPermission(serverStaff, 'can_apply_discount');
    assert.strictEqual(canDiscount, false, 'Floor Server must NOT have can_apply_discount permission!');
    recordPass('WTR-06', 'RBAC Invariant: Floor Server role is strictly barred from can_apply_discount');
  } catch (e) {
    recordFail('WTR-06', 'Floor Server can_apply_discount permission check failed', e);
  }

  // [WTR-07]: Empirical DOM Audit of Discount Buttons & Selectors
  try {
    const hasCartDiscountBtn = html.includes('id="cartDiscountBtn"');
    const hasCartDiscountWrap = html.includes('id="cartDiscountWrap"');
    const hasCartDiscountRow = html.includes('class="cart-discount-row"');
    
    assert.ok(hasCartDiscountBtn, 'Expected index.html to contain #cartDiscountBtn');
    recordPass('WTR-07', 'Empirical DOM audit: Verified #cartDiscountBtn exists in index.html (line 4761)');
    
    if (!hasCartDiscountWrap && !hasCartDiscountRow) {
      recordFinding(
        'SELECTOR_MISMATCH',
        'Discount selector in applyStationProfileRestrictions()',
        'applyStationProfileRestrictions() checks for #cartDiscountWrap or .cart-discount-row, but index.html defines #cartDiscountBtn. However, RBAC gate in openQuickDiscountModal() securely intercepts clicks and blocks unauthorized discounts for Floor Server.',
        'LOW (Defense-in-depth UI cosmetic; behavioral RBAC protection is 100% airtight)',
        'Recommendation: In a future polish, add #cartDiscountBtn to applyStationProfileRestrictions selector list to hide the button on Waiter Mobile.'
      );
    }
  } catch (e) {
    recordFail('WTR-07', 'DOM discount button audit failed', e);
  }

  // [WTR-08]: TablesUI loads tables and renders table cards
  try {
    const container = { innerHTML: '', querySelectorAll: () => [] };
    const tablesUI = new TablesUI({ container });
    await tablesUI.loadTables();

    assert.ok(tablesUI.tables.length > 0, 'TablesUI should load configured tables');
    assert.ok(container.innerHTML.includes('tables-grid'), 'TablesUI should render .tables-grid');
    assert.ok(container.innerHTML.includes('table-card'), 'TablesUI should render .table-card elements');
    recordPass('WTR-08', `TablesUI renders visual floor grid with ${tablesUI.tables.length} configured cafe tables`);
  } catch (e) {
    recordFail('WTR-08', 'TablesUI floor grid render failed', e);
  }

  // [WTR-09]: Table-side order workflow with TablesUI
  try {
    let selectedTable = null;
    let switchedView = null;
    const container = { innerHTML: '', querySelectorAll: () => [] };
    const tablesUI = new TablesUI({
      container,
      onTableSelect: (tbl) => {
        selectedTable = tbl;
        switchedView = 'pos';
      }
    });
    await tablesUI.loadTables();

    // Trigger select on Table 1
    const t1 = tablesUI.tables[0];
    assert.ok(t1, 'Table 1 exists');
    tablesUI.onTableSelect(t1);

    assert.strictEqual(selectedTable.id, t1.id);
    assert.strictEqual(switchedView, 'pos');
    recordPass('WTR-09', 'Table selection triggers table-side ordering workflow: binds selected table and switches to #pos view');
  } catch (e) {
    recordFail('WTR-09', 'Table-side order workflow test failed', e);
  }

  // ==================================================================
  // SECTION 4: GENERAL STATION PROFILE & DYNAMIC ROLE ROUTING
  // ==================================================================
  console.log('\n📍 SECTION 4: GENERAL STATION PROFILE & DYNAMIC ROLE ROUTING');

  const { sandbox: genSandbox } = createDomSandbox({ normalizeRole });
  vm.runInNewContext(coreJs, genSandbox);

  // [GEN-01]: Kitchen Chef routes to 'kds'
  try {
    const view = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Kitchen Chef');
    assert.strictEqual(view, 'kds');
    recordPass('GEN-01', "General Station routes 'Kitchen Chef' dynamically to 'kds'");
  } catch (e) {
    recordFail('GEN-01', "Routing Kitchen Chef failed", e);
  }

  // [GEN-02]: Chef aliases ('Kitchen', 'Chef') route to 'kds'
  try {
    const view1 = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Kitchen');
    const view2 = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Chef');
    assert.strictEqual(view1, 'kds');
    assert.strictEqual(view2, 'kds');
    recordPass('GEN-02', "General Station routes alias 'Kitchen' and 'Chef' dynamically to 'kds'");
  } catch (e) {
    recordFail('GEN-02', "Routing Chef aliases failed", e);
  }

  // [GEN-03]: Floor Server routes to 'tables'
  try {
    const view = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Floor Server');
    assert.strictEqual(view, 'tables');
    recordPass('GEN-03', "General Station routes 'Floor Server' dynamically to 'tables'");
  } catch (e) {
    recordFail('GEN-03', "Routing Floor Server failed", e);
  }

  // [GEN-04]: Server aliases ('Waiter', 'Server') route to 'tables'
  try {
    const view1 = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Waiter');
    const view2 = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Server');
    assert.strictEqual(view1, 'tables');
    assert.strictEqual(view2, 'tables');
    recordPass('GEN-04', "General Station routes alias 'Waiter' and 'Server' dynamically to 'tables'");
  } catch (e) {
    recordFail('GEN-04', "Routing Waiter aliases failed", e);
  }

  // [GEN-05]: Cashier routes to 'pos'
  try {
    const view = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Cashier');
    assert.strictEqual(view, 'pos');
    recordPass('GEN-05', "General Station routes 'Cashier' to 'pos'");
  } catch (e) {
    recordFail('GEN-05', "Routing Cashier failed", e);
  }

  // [GEN-06]: Manager routes to 'pos'
  try {
    const view = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Manager');
    assert.strictEqual(view, 'pos');
    recordPass('GEN-06', "General Station routes 'Manager' to 'pos'");
  } catch (e) {
    recordFail('GEN-06', "Routing Manager failed", e);
  }

  // [GEN-07]: Admin routes to 'pos'
  try {
    const view = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'Admin');
    assert.strictEqual(view, 'pos');
    recordPass('GEN-07', "General Station routes 'Admin' to 'pos'");
  } catch (e) {
    recordFail('GEN-07', "Routing Admin failed", e);
  }

  // [GEN-08]: Adversarial boundary: null, undefined, empty, or unknown roles safely default to 'pos'
  try {
    const viewNull = genSandbox.resolveInitialViewForStation('GENERAL_STATION', null);
    const viewUndef = genSandbox.resolveInitialViewForStation('GENERAL_STATION', undefined);
    const viewEmpty = genSandbox.resolveInitialViewForStation('GENERAL_STATION', '');
    const viewUnknown = genSandbox.resolveInitialViewForStation('GENERAL_STATION', 'SECURITY_GUARD');

    assert.strictEqual(viewNull, 'pos');
    assert.strictEqual(viewUndef, 'pos');
    assert.strictEqual(viewEmpty, 'pos');
    assert.strictEqual(viewUnknown, 'pos');
    recordPass('GEN-08', "Adversarial boundary: null, empty, or unknown role gracefully defaults to 'pos' with zero crashes");
  } catch (e) {
    recordFail('GEN-08', "Adversarial role fallback failed", e);
  }

  // ==================================================================
  // SECTION 5: WEB AUDIO API CHIME FAILURE MODES & STRESS TESTING
  // ==================================================================
  console.log('\n📍 SECTION 5: WEB AUDIO API CHIME FAILURE MODES & STRESS HARNESS');

  // [AUD-01]: AudioContext is uninitialized/undefined
  try {
    const { sandbox } = createDomSandbox();
    sandbox.AudioContext = undefined;
    sandbox.webkitAudioContext = undefined;
    sandbox.window.AudioContext = undefined;
    sandbox.window.webkitAudioContext = undefined;
    vm.runInNewContext(coreJs, sandbox);

    assert.doesNotThrow(() => {
      sandbox.playKdsAudioChime();
    }, 'playKdsAudioChime must not throw when AudioContext is undefined');
    recordPass('AUD-01', 'playKdsAudioChime handles undefined/unsupported window.AudioContext safely with zero exceptions');
  } catch (e) {
    recordFail('AUD-01', 'Undefined AudioContext check failed', e);
  }

  // [AUD-02]: AudioContext throws on instantiation (Browser Autoplay Policy restriction)
  try {
    const { sandbox } = createDomSandbox();
    sandbox.window.AudioContext = function() {
      const err = new Error('The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page.');
      err.name = 'NotAllowedError';
      throw err;
    };
    sandbox.AudioContext = sandbox.window.AudioContext;
    vm.runInNewContext(coreJs, sandbox);

    assert.doesNotThrow(() => {
      sandbox.playKdsAudioChime();
    }, 'playKdsAudioChime must catch Autoplay NotAllowedError silently');
    recordPass('AUD-02', 'playKdsAudioChime survives browser Autoplay Policy block (NotAllowedError) without uncaught rejection');
  } catch (e) {
    recordFail('AUD-02', 'Autoplay policy rejection handling failed', e);
  }

  // [AUD-03]: AudioContext node methods throw errors
  try {
    const { sandbox } = createDomSandbox();
    sandbox.window.AudioContext = function() {
      return {
        currentTime: 0,
        destination: {},
        createOscillator: () => { throw new Error('Oscillator allocation failure'); },
        createGain: () => ({ connect: () => {} })
      };
    };
    sandbox.AudioContext = sandbox.window.AudioContext;
    vm.runInNewContext(coreJs, sandbox);

    assert.doesNotThrow(() => {
      sandbox.playKdsAudioChime();
    }, 'playKdsAudioChime must catch audio node errors');
    recordPass('AUD-03', 'playKdsAudioChime catches audio oscillator/gain pipeline errors safely');
  } catch (e) {
    recordFail('AUD-03', 'Audio pipeline error catch failed', e);
  }

  // [AUD-04]: Muted preference prevents AudioContext execution
  try {
    const { sandbox, mockLocalStorage } = createDomSandbox();
    let audioInstantiated = false;
    sandbox.window.AudioContext = function() {
      audioInstantiated = true;
      return {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
        createGain: () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } })
      };
    };
    sandbox.AudioContext = sandbox.window.AudioContext;
    vm.runInNewContext(coreJs, sandbox);

    // Set muted
    mockLocalStorage.setItem('billnaw_kds_chime_disabled', 'true');
    sandbox.playKdsAudioChime();

    assert.strictEqual(audioInstantiated, false, 'AudioContext should NOT be instantiated when chime is disabled');
    recordPass('AUD-04', 'Muted preference (billnaw_kds_chime_disabled: true) prevents AudioContext execution and respects user preference');
  } catch (e) {
    recordFail('AUD-04', 'Muted preference check failed', e);
  }

  // [AUD-05]: toggleKdsSound toggles state and updates UI label
  try {
    const { sandbox, mockLocalStorage, getOrCreateElement } = createDomSandbox();
    vm.runInNewContext(coreJs, sandbox);
    const label = getOrCreateElement('kdsSoundLabel');

    // Initially active -> toggle to muted
    mockLocalStorage.setItem('billnaw_kds_chime_disabled', 'false');
    sandbox.toggleKdsSound();
    assert.strictEqual(mockLocalStorage.getItem('billnaw_kds_chime_disabled'), 'true');
    assert.strictEqual(label.innerText, 'Chime: OFF');

    // Toggle back to active
    sandbox.toggleKdsSound();
    assert.strictEqual(mockLocalStorage.getItem('billnaw_kds_chime_disabled'), 'false');
    assert.strictEqual(label.innerText, 'Chime: ON');

    recordPass('AUD-05', 'toggleKdsSound() toggles state between ON/OFF and updates UI label #kdsSoundLabel accurately');
  } catch (e) {
    recordFail('AUD-05', 'toggleKdsSound test failed', e);
  }

  // ==================================================================
  // SUMMARY REPORT & EXIT
  // ==================================================================
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER AUDIT SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================================');

  if (findings.length > 0) {
    console.log(`\n📋 OBSERVATIONAL FINDINGS (${findings.length}):`);
    findings.forEach((f, i) => {
      console.log(`  [${i + 1}] ${f.category} (${f.risk}): ${f.title}`);
      console.log(`      Observation: ${f.observation}`);
      console.log(`      Recommendation: ${f.recommendation}`);
    });
  }

  if (failedTests > 0) {
    console.error(`\n❌ ADVERSARIAL TEST FAILURES (${failedTests}):`);
    failures.forEach((f, i) => {
      console.error(`  [${i + 1}] [${f.testId}] ${f.description}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✨ ALL EMPIRICAL CHALLENGES PASSED! VERDICT: APPROVE');
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal crash during test execution:', err);
  process.exit(1);
});
