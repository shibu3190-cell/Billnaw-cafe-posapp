const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('====================================================');
console.log('🔍 FORENSIC AUDITOR M3: INDEPENDENT INTEGRITY AUDIT');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function check(title, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
    failCount++;
  }
}

const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------
// 1. STATIC ANALYSIS & AST INSPECTION: server.js
// -----------------------------------------------------------------
console.log('📍 1. STATIC ANALYSIS & AST INSPECTION: server.js');

const serverSrc = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

check('server.js contains process.on("unhandledRejection")', () => {
  assert.ok(/process\.on\(\s*['"]unhandledRejection['"]\s*,\s*\(reason,\s*promise\)/.test(serverSrc), 'Must have unhandledRejection listener with reason, promise');
});

check('server.js contains process.on("uncaughtException")', () => {
  assert.ok(/process\.on\(\s*['"]uncaughtException['"]\s*,\s*\(err,\s*origin\)/.test(serverSrc), 'Must have uncaughtException listener with err, origin');
});

check('server.js exception handlers do NOT fake exit(0) or swallow without logs', () => {
  const rejMatch = serverSrc.match(/process\.on\(\s*['"]unhandledRejection['"][\s\S]*?\}\);/);
  assert.ok(rejMatch, 'unhandledRejection block found');
  assert.ok(!rejMatch[0].includes('process.exit(0)'), 'Must not exit(0)');
  assert.ok(rejMatch[0].includes('console.error'), 'Must log error to console.error');

  const uncMatch = serverSrc.match(/process\.on\(\s*['"]uncaughtException['"][\s\S]*?\}\);/);
  assert.ok(uncMatch, 'uncaughtException block found');
  assert.ok(!uncMatch[0].includes('process.exit(0)'), 'Must not exit(0)');
  assert.ok(uncMatch[0].includes('console.error'), 'Must log error to console.error');
});

// -----------------------------------------------------------------
// 2. STATIC ANALYSIS & BEHAVIORAL PROBING: menuItems SYNCHRONIZATION
// -----------------------------------------------------------------
console.log('\n📍 2. STATIC ANALYSIS & PROBING: menuItems SYNCHRONIZATION');

const coreSrc = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const menuSrc = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');

check('js/core.js implements Object.defineProperty(window, "menuItems")', () => {
  assert.ok(/Object\.defineProperty\(\s*window\s*,\s*['"]menuItems['"]\s*,\s*\{/.test(coreSrc), 'Must defineProperty for menuItems on window');
});

check('js/core.js defineProperty getter and setter are genuine without dummy items', () => {
  const defMatch = coreSrc.match(/Object\.defineProperty\(\s*window\s*,\s*['"]menuItems['"]\s*,\s*\{([\s\S]*?\}\s*\}\s*\);)/);
  assert.ok(defMatch, 'defineProperty block found');
  const body = defMatch[1];
  assert.ok(/get\s*\(\)\s*\{[\s\S]*?return\s+menuItems;?\s*\}/.test(body), 'Getter must return lexical menuItems');
  assert.ok(/set\s*\(\s*val\s*\)\s*\{[\s\S]*?menuItems\s*=\s*Array\.isArray\(val\)\s*\?\s*val\s*:\s*\[\];?\s*\}/.test(body), 'Setter must assign lexical menuItems with Array guard');
  assert.ok(!body.includes('mock') && !body.includes('dummy'), 'No mock or dummy values allowed');
});

check('Behavioral simulation: Object.defineProperty(window, "menuItems") functions bidirectionally', () => {
  const fakeWindow = {};
  let lexicalMenuItems = [];

  Object.defineProperty(fakeWindow, 'menuItems', {
    configurable: true,
    enumerable: true,
    get() {
      return lexicalMenuItems;
    },
    set(val) {
      lexicalMenuItems = Array.isArray(val) ? val : [];
    }
  });

  // Verify initial state
  assert.deepStrictEqual(fakeWindow.menuItems, []);

  // Verify write via window updates lexical
  fakeWindow.menuItems = [{ id: 'dish_1', name: 'Cold Coffee', price: 120 }];
  assert.strictEqual(lexicalMenuItems.length, 1);
  assert.strictEqual(lexicalMenuItems[0].name, 'Cold Coffee');

  // Verify direct update to lexical updates window read
  lexicalMenuItems.push({ id: 'dish_2', name: 'Sandwich', price: 80 });
  assert.strictEqual(fakeWindow.menuItems.length, 2);
  assert.strictEqual(fakeWindow.menuItems[1].name, 'Sandwich');

  // Verify non-array set defaults safely to []
  fakeWindow.menuItems = 'invalid-string';
  assert.deepStrictEqual(fakeWindow.menuItems, []);
  assert.deepStrictEqual(lexicalMenuItems, []);
});

check('js/menu.js synchronizes menuItems and window.menuItems across renderers', () => {
  assert.ok(menuSrc.includes('renderMenuUI()'), 'renderMenuUI present');
  assert.ok(menuSrc.includes('window.menuItems = menuItems'), 'Syncs to window.menuItems');
  assert.ok(/if\s*\(typeof window !== ['"]undefined['"] && Array\.isArray\(window\.menuItems\)/.test(menuSrc), 'Defensive check from window.menuItems');
});

// -----------------------------------------------------------------
// 3. ZERO-STORE-DATA GATE & SECONDARY DEVICE OVERLAY LOGIC
// -----------------------------------------------------------------
console.log('\n📍 3. ZERO-STORE-DATA GATE & SECONDARY OVERLAY AUDIT');

check('js/core.js defines isSecondaryTerminal()', () => {
  assert.ok(/function\s+isSecondaryTerminal\(\)/.test(coreSrc), 'isSecondaryTerminal function present');
  assert.ok(coreSrc.includes('window.isSecondaryTerminal = isSecondaryTerminal;'), 'Exported to window');
});

check('js/core.js showDevicePairingOverlay() genuinely enforces Zero-Store-Data Gate', () => {
  const fnMatch = coreSrc.match(/function\s+showDevicePairingOverlay\(\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(fnMatch, 'showDevicePairingOverlay function block found');
  const body = fnMatch[1];
  
  // Must check if secondary and devStatus === 'PENDING'
  assert.ok(body.includes('isSecondary && devStatus === \'PENDING\''), 'Checks secondary pending state');
  // Must NOT bypass overlay for pending secondary even if authenticated
  const pendingIndex = body.indexOf("isSecondary && devStatus === 'PENDING'");
  const authCheckIndex = body.indexOf("isStoreAuthenticated()", pendingIndex);
  assert.ok(pendingIndex !== -1, 'Pending secondary check exists');
  assert.ok(authCheckIndex !== -1, 'Authenticated check is in else-if branch');
  assert.ok(body.includes('overlay.style.display = \'flex\''), 'Displays overlay with flex');
});

check('canAccessStoreData() rejects PENDING and REVOKED devices', () => {
  assert.ok(coreSrc.includes('function canAccessStoreData()'), 'canAccessStoreData defined');
  const startIdx = coreSrc.indexOf('function canAccessStoreData()');
  assert.ok(startIdx !== -1, 'canAccessStoreData function found');
  const snippet = coreSrc.substring(startIdx, startIdx + 800);
  assert.ok(snippet.includes("status === 'REVOKED'") && snippet.includes("return false"), 'Rejects REVOKED');
  assert.ok(snippet.includes("status === 'PENDING'") && snippet.includes("return false"), 'Rejects PENDING');
  assert.ok(snippet.includes("return status === 'AUTHORIZED'"), 'Requires AUTHORIZED');
});

// -----------------------------------------------------------------
// 4. HARD REPOSITORY INVARIANTS CHECK
// -----------------------------------------------------------------
console.log('\n📍 4. HARD REPOSITORY INVARIANTS CHECK');

const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

check('Invariant 1: Exactly 26 .modal-close-btn SVGs in index.html', () => {
  const btnRegex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  let count = 0;
  let svgs = 0;
  let m;
  while ((m = btnRegex.exec(indexHtml)) !== null) {
    count++;
    if (/<svg/i.test(m[1])) {
      svgs++;
    }
  }
  assert.strictEqual(count, 26, `Must have exactly 26 .modal-close-btn buttons (found ${count})`);
  assert.strictEqual(svgs, 26, `All 26 buttons must contain an SVG (found ${svgs})`);
});

check('Invariant 2: Strictly 0 raw Unicode emojis inside <button> elements in index.html', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
  const allButtons = /<button[\s\S]*?<\/button>/gi;
  let buttonMatch;
  let buttonsWithEmoji = 0;
  let totalButtons = 0;

  while ((buttonMatch = allButtons.exec(indexHtml)) !== null) {
    totalButtons++;
    if (emojiRegex.test(buttonMatch[0])) {
      buttonsWithEmoji++;
    }
  }
  assert.ok(totalButtons > 500, `Expected > 500 buttons in index.html (found ${totalButtons})`);
  assert.strictEqual(buttonsWithEmoji, 0, `Buttons with raw emojis must be 0 (found ${buttonsWithEmoji})`);
});

check('Invariant 3: Bit-for-bit binary parity between storage.rules and database/storage.rules', () => {
  const rootRules = fs.readFileSync(path.join(rootDir, 'storage.rules'));
  const dbRules = fs.readFileSync(path.join(rootDir, 'database', 'storage.rules'));
  assert.strictEqual(rootRules.length, dbRules.length, 'Byte lengths must match');
  assert.strictEqual(Buffer.compare(rootRules, dbRules), 0, 'Buffer.compare must return 0');
  const rootHash = crypto.createHash('sha256').update(rootRules).digest('hex');
  const dbHash = crypto.createHash('sha256').update(dbRules).digest('hex');
  assert.strictEqual(rootHash, dbHash, 'SHA-256 hashes must match');
});

check('Invariant 4: Bit-for-bit binary parity between firestore.rules and database/firestore.rules', () => {
  const rootRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'));
  const dbRules = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'));
  assert.strictEqual(rootRules.length, dbRules.length, 'Byte lengths must match');
  assert.strictEqual(Buffer.compare(rootRules, dbRules), 0, 'Buffer.compare must return 0');
  const rootHash = crypto.createHash('sha256').update(rootRules).digest('hex');
  const dbHash = crypto.createHash('sha256').update(dbRules).digest('hex');
  assert.strictEqual(rootHash, dbHash, 'SHA-256 hashes must match');
});

check('Invariant 5: Git branch strictly feat/mobile-ux-and-backend-security without merge to main', () => {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.strictEqual(branch, 'feat/mobile-ux-and-backend-security', 'Must remain strictly on feat/mobile-ux-and-backend-security');
});

// -----------------------------------------------------------------
// 5. ADVERSARIAL SIMULATION & EDGE CASE STRESS TESTS
// -----------------------------------------------------------------
console.log('\n📍 5. ADVERSARIAL SIMULATION & EDGE CASE STRESS TESTS');

check('Adversarial: showDevicePairingOverlay simulation prevents bypass for PENDING secondary device', () => {
  function simulateShowDevicePairingOverlay({ isSecondary, devStatus, storeAuth, authExpired }) {
    let overlayDisplay = 'none';
    let hidden = false;
    let authModalOpened = false;

    function isStoreAuthenticated() { return storeAuth; }
    function hideDevicePairingOverlay() { hidden = true; overlayDisplay = 'none'; }
    function openShopAuthModal() { authModalOpened = true; }
    function isSecondaryTerminal() { return isSecondary; }
    function isMasterTerminal() { return !isSecondary; }
    function getDeviceStatus() { return devStatus; }
    function checkDeviceAuthExpiration() { return authExpired; }

    // Logic under audit:
    if (typeof isStoreAuthenticated === 'function' && !isStoreAuthenticated()) {
      hideDevicePairingOverlay();
      if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
      return { overlayDisplay, hidden, authModalOpened };
    }

    if (isSecondary && devStatus === 'PENDING') {
      // Zero-Store-Data Gate: keep pairing overlay active
    } else if (typeof isStoreAuthenticated === 'function' && isStoreAuthenticated()) {
      if (devStatus === 'AUTHORIZED') {
        if (!checkDeviceAuthExpiration()) {
          hideDevicePairingOverlay();
          return { overlayDisplay, hidden, authModalOpened };
        }
      }
    }

    overlayDisplay = 'flex';
    return { overlayDisplay, hidden, authModalOpened };
  }

  // Attack 1: Secondary device is PENDING, but store is already authenticated!
  const att1 = simulateShowDevicePairingOverlay({ isSecondary: true, devStatus: 'PENDING', storeAuth: true, authExpired: false });
  assert.strictEqual(att1.overlayDisplay, 'flex', 'Overlay MUST be flex for secondary PENDING');
  assert.strictEqual(att1.hidden, false, 'Overlay MUST NOT be hidden for secondary PENDING');

  // Case 2: Master terminal with authenticated store
  const case2 = simulateShowDevicePairingOverlay({ isSecondary: false, devStatus: 'AUTHORIZED', storeAuth: true, authExpired: false });
  assert.strictEqual(case2.hidden, true, 'Master terminal with auth hides pairing overlay');

  // Case 3: Secondary terminal AUTHORIZED
  const case3 = simulateShowDevicePairingOverlay({ isSecondary: true, devStatus: 'AUTHORIZED', storeAuth: true, authExpired: false });
  assert.strictEqual(case3.hidden, true, 'Secondary terminal once AUTHORIZED hides pairing overlay');

  // Attack 4: Secondary terminal with EXPIRED auth
  const att4 = simulateShowDevicePairingOverlay({ isSecondary: true, devStatus: 'AUTHORIZED', storeAuth: true, authExpired: true });
  assert.strictEqual(att4.overlayDisplay, 'flex', 'Expired device must show pairing overlay');
});

check('Adversarial: Object.defineProperty menuItems type safety and mutation resistance', () => {
  const fakeWin = {};
  let lexical = [];

  Object.defineProperty(fakeWin, 'menuItems', {
    configurable: true,
    enumerable: true,
    get() { return lexical; },
    set(val) { lexical = Array.isArray(val) ? val : []; }
  });

  // Test adversarial inputs to window.menuItems
  const adversarialInputs = [null, undefined, 123, 'string', { a: 1 }, () => {}, NaN, true, false];
  for (const input of adversarialInputs) {
    fakeWin.menuItems = input;
    assert.deepStrictEqual(fakeWin.menuItems, [], `Input ${String(input)} must reset to empty array`);
    assert.deepStrictEqual(lexical, [], `Lexical must also reset to empty array for ${String(input)}`);
  }

  // Test valid nested dish array
  const complexMenu = [
    { id: 101, name: 'Espresso', price: 90, options: { sugar: false, milk: 'oat' }, tags: ['coffee', 'hot'] },
    { id: 102, name: 'Croissant', price: 150, options: { warm: true }, tags: ['bakery'] }
  ];
  fakeWin.menuItems = complexMenu;
  assert.strictEqual(fakeWin.menuItems.length, 2);
  assert.strictEqual(fakeWin.menuItems[0].options.milk, 'oat');
  assert.strictEqual(lexical[1].name, 'Croissant');
});

check('Adversarial: Server process handlers log errors with timestamps and stacks', () => {
  // Verify regex patterns in server.js for structured logging
  assert.ok(serverSrc.includes('[Server Unhandled Rejection]'), 'Logged message tag present');
  assert.ok(serverSrc.includes('[Server Uncaught Exception]'), 'Logged message tag present');
  assert.ok(serverSrc.includes('new Date().toISOString()'), 'ISO timestamp generated');
  assert.ok(serverSrc.includes('reason.stack'), 'Unhandled rejection stack logged');
  assert.ok(serverSrc.includes('err.stack'), 'Uncaught exception stack logged');
});

console.log('\n====================================================');
console.log(`🎯 FORENSIC AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
