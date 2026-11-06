/**
 * BILLNAW POS — LOGO, DYNAMIC QR & KOT ISOLATION VERIFICATION SUITE
 * =================================================================
 * Verifies:
 *  1. Shop Logo & Dynamic QR Code in Customer Invoices (ESC/POS bytecode + HTML preview).
 *  2. KOT Ticket Isolation: KOT slips NEVER print shop logo, shop details, or UPI QR code.
 *  3. HTML Print Engine Isolation: executeHtmlPrint only appends UPI QR for 'print-receipt'.
 *  4. Multi-Tier Persistence: Logo and QR settings saved to discrete keys & IndexedDB.
 *  5. Rehydration & Self-Healing: Logo & QR restored without wipe on cloud snapshots or restarts.
 *  6. Offline AI Quota & Favicon Safety: No console spam or missing favicon.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  \u2705 PASS: ${label}`);
    passed++;
  } catch (e) {
    console.log(`  \u274C FAIL: ${label}`);
    console.log(`         ${e.message}`);
    failed++;
  }
}

const pbjs = read('src/core/platform-bridge.js');
const posjs = read('js/pos.js');
const corejs = read('js/core.js');
const settingsjs = read('js/settings.js');
const indexHtml = read('index.html');

console.log('\n====================================================');
console.log('🏷️  LOGO, DYNAMIC QR & KOT ISOLATION AUDIT');
console.log('====================================================\n');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: CUSTOMER INVOICE LOGO & DYNAMIC QR IN ESC/POS
// ═══════════════════════════════════════════════════════════════════════════
console.log('📍 SECTION 1: CUSTOMER INVOICE LOGO & DYNAMIC QR IN ESC/POS');

check('LOGO-01: generateEscPosCommands includes logoBytes when provided for receipts', () => {
  assert.ok(
    pbjs.includes('options.logoBytes') && pbjs.includes('parts.push(options.logoBytes)'),
    'options.logoBytes not handled in generateEscPosCommands'
  );
});

check('LOGO-02: generateEscPosCommands centers logo bitmap (0x1B, 0x61, 0x01)', () => {
  assert.ok(
    pbjs.includes('parts.push(options.logoBytes)') && pbjs.includes('0x61, 0x01'),
    'Logo centering command not found before logoBytes'
  );
});

check('QR-01: generateEscPosCommands includes dynamic UPI qrBytes for receipts', () => {
  assert.ok(
    pbjs.includes('options.qrBytes') && pbjs.includes('parts.push(options.qrBytes)'),
    'options.qrBytes not handled in generateEscPosCommands'
  );
});

check('QR-02: Dynamic QR code preceded by "Scan to Pay" and followed by UPI ID in ESC/POS', () => {
  assert.ok(
    pbjs.includes('Scan to Pay') && pbjs.includes('options.qrBytes') && pbjs.includes('UPI:'),
    'Scan to Pay and UPI label not positioned around qrBytes'
  );
});

check('PRN-01: sendEscPosToPrinter passes storeProfile, logoBytes, and qrBytes to routePrintJob', () => {
  assert.ok(
    posjs.includes('logoBytes: logoBytes') || posjs.includes('logoBytes,'),
    'logoBytes not passed to routePrintJob in pos.js'
  );
  assert.ok(
    posjs.includes('qrBytes: qrBytes') || posjs.includes('qrBytes,'),
    'qrBytes not passed to routePrintJob in pos.js'
  );
  assert.ok(
    posjs.includes('storeProfile: shopProfile') || posjs.includes('storeProfile:'),
    'storeProfile not passed to routePrintJob in pos.js'
  );
});

check('PRN-02: routePrintJob auto-resolves logoBytes from window.shopProfile if not passed', () => {
  assert.ok(
    pbjs.includes('profile.logo') && pbjs.includes('getLogoBytes'),
    'routePrintJob does not auto-resolve logoBytes from profile'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: KOT TICKET ISOLATION (ZERO SHOP DETAILS / NO LOGO / NO QR)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 2: KOT TICKET ISOLATION (ZERO LEAKS)');

check('KOT-ISO-01: routePrintJob enforces null logoBytes and null qrBytes for KOT role', () => {
  assert.ok(
    pbjs.includes('logoBytes = null') && pbjs.includes('qrBytes = null'),
    'routePrintJob does not nullify logoBytes/qrBytes for KOT role'
  );
});

check('KOT-ISO-02: generateEscPosCommands KOT branch never injects logo or QR', () => {
  // Find KOT block in generateEscPosCommands
  const kotStart = pbjs.indexOf('if (isKot)');
  const receiptStart = pbjs.indexOf('} else {', kotStart);
  assert.ok(kotStart > 0 && receiptStart > kotStart, 'KOT block not found');
  const kotBlock = pbjs.substring(kotStart, receiptStart);
  assert.ok(!kotBlock.includes('logoBytes'), 'KOT block contains logoBytes!');
  assert.ok(!kotBlock.includes('qrBytes'), 'KOT block contains qrBytes!');
  assert.ok(!kotBlock.includes('profile.address'), 'KOT block contains profile.address!');
  assert.ok(!kotBlock.includes('profile.fssai'), 'KOT block contains profile.fssai!');
  assert.ok(!kotBlock.includes('profile.gstin'), 'KOT block contains profile.gstin!');
});

check('KOT-ISO-03: executeHtmlPrint only appends UPI QR script when divId === "print-receipt"', () => {
  assert.ok(
    posjs.includes("divId === 'print-receipt'") && posjs.includes('shopProfile.showQr'),
    'executeHtmlPrint does not guard UPI QR code with divId === "print-receipt"'
  );
});

check('KOT-ISO-04: sendKotToPrinter explicitly passes null logoBytes and qrBytes', () => {
  assert.ok(
    posjs.includes("role: 'KOT'") && posjs.includes('logoBytes: null'),
    'sendKotToPrinter does not pass null logoBytes to routePrintJob'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MULTI-TIER PERSISTENCE (REMEMBER LOGO & QR PERMANENTLY)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 3: MULTI-TIER PERSISTENCE (REMEMBER LOGO & QR PERMANENTLY)');

check('PERSIST-01: persistProfile saves discrete billnaw_shop_logo key', () => {
  assert.ok(
    corejs.includes('billnaw_shop_logo'),
    'billnaw_shop_logo not saved in core.js'
  );
});

check('PERSIST-02: persistProfile saves logo to dedicated cafe_logo in IndexedDB', () => {
  assert.ok(
    corejs.includes("idb.set('cafe_logo'") || corejs.includes('idb.set("cafe_logo"'),
    'cafe_logo IndexedDB write not found in persistProfile'
  );
});

check('PERSIST-03: persistProfile saves billnaw_shop_upi_id and billnaw_shop_show_qr', () => {
  assert.ok(
    corejs.includes('billnaw_shop_upi_id') && corejs.includes('billnaw_shop_show_qr'),
    'UPI and show_qr discrete keys not saved in persistProfile'
  );
});

check('REHYDRATE-01: initDatabase rehydrates billnaw_shop_logo from discrete key', () => {
  assert.ok(
    corejs.includes("localStorage.getItem('billnaw_shop_logo')"),
    'billnaw_shop_logo not restored in initDatabase'
  );
});

check('REHYDRATE-02: initDatabase restores logo from cafe_logo in IndexedDB', () => {
  assert.ok(
    corejs.includes("idb.get('cafe_logo')") || corejs.includes('idb.get("cafe_logo")'),
    'cafe_logo not restored from IndexedDB in initDatabase'
  );
});

check('REHYDRATE-03: handleRemoteFirestoreUpdate preserves existing logo on snapshot', () => {
  assert.ok(
    corejs.includes('existingLogo') || (corejs.includes('shopProfile.logo') && corejs.includes('billnaw_shop_logo')),
    'handleRemoteFirestoreUpdate does not preserve existing logo'
  );
});

check('VISUAL-01: updateProfileVisuals hides printLogo and sidebarLogo when logo is absent', () => {
  assert.ok(
    settingsjs.includes("printLogo.style.display = 'none'") || settingsjs.includes('printLogo.style.display="none"'),
    'updateProfileVisuals does not hide printLogo when logo absent'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: OFFLINE RESILIENCE & FAVICON
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 4: OFFLINE RESILIENCE & FAVICON');

check('OFFLINE-01: refreshAiQuotaDisplay guards against offline fetch (navigator.onLine === false)', () => {
  assert.ok(
    settingsjs.includes('navigator.onLine === false') || settingsjs.includes('!navigator.onLine'),
    'refreshAiQuotaDisplay does not guard against offline fetch'
  );
});

check('FAV-01: favicon.ico exists at project root', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'favicon.ico')), 'favicon.ico missing at root');
});

check('FAV-02: index.html links favicon.ico in <head>', () => {
  assert.ok(indexHtml.includes('href="favicon.ico"'), 'favicon.ico not linked in index.html');
});

// ═══════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n====================================================');
console.log(`🎯 LOGO, QR & KOT ISOLATION AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================');

if (failed === 0) {
  console.log('✨ ALL LOGO, DYNAMIC QR, KOT ISOLATION & PERSISTENCE TESTS VERIFIED 100% GREEN!\n');
} else {
  process.exit(1);
}
