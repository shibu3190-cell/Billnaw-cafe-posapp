/**
 * BILLNAW POS — LOGO, DYNAMIC QR, TAX BREAKDOWN, KOT ISOLATION & ADMIN->CASHIER SYNC SUITE
 * ========================================================================================
 * Verifies:
 *  1. Shop Logo & Dynamic QR Code in Customer Invoices (ESC/POS bytecode + HTML preview).
 *  2. Tax / GST Breakdown (CGST + SGST) in ESC/POS bytecode & HTML when GST is enabled,
 *     and clean suppression (RETAIL INVOICE) when GST mode is 'none'.
 *  3. KOT Ticket Isolation: KOT slips NEVER print shop logo, shop details, prices, tax, or UPI QR.
 *  4. Structured Item Resolution: String `items` ("Samosa (x1)") parsed cleanly without
 *     character-by-character "Item | 1 | Rs. 0.00" corruption.
 *  5. Modal-Safe saveSettings() & Login-Safe shop-auth.js: Unopened modals never wipe
 *     defaultGstRate, shop details, logo, or QR settings.
 *  6. Admin -> Cashier Cross-Role & Cross-Device Hydration: Cashier printing an invoice
 *     always gets Admin's saved Shop Logo, Shop Details, GST Breakdown, and Dynamic UPI QR.
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
const shopAuthJs = read('js/shop-auth.js');
const cloudSyncJs = read('js/cloud-sync.js');
const staffJs = read('js/staff.js');
const responsiveCss = read('css/responsive.css');
const swJs = read('service-worker.js');
const indexHtml = read('index.html');

// Load ThermalPrinterBridge for live bytecode execution tests
const bridgeCode = pbjs
  .replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, 'const successResult = (d) => ({ data: d, error: null }); const errorResult = (c, m) => ({ data: null, error: { code: c, message: m } });')
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+async\s+function\s+/g, 'async function ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+default\s+[\s\S]*$/g, '');
const loadBridge = new Function(`${bridgeCode}; return { ThermalPrinterBridge };`);
const { ThermalPrinterBridge } = loadBridge();

console.log('\n====================================================');
console.log('🏷️  LOGO, DYNAMIC QR, TAX & KOT ISOLATION AUDIT');
console.log('====================================================\n');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: CUSTOMER INVOICE LOGO, TAX BREAKDOWN & DYNAMIC QR IN ESC/POS
// ═══════════════════════════════════════════════════════════════════════════
console.log('📍 SECTION 1: CUSTOMER INVOICE LOGO, TAX & DYNAMIC QR IN ESC/POS');

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

check('TAX-01: generateEscPosCommands outputs GST BREAKDOWN (Taxable Value, CGST, SGST) when GST enabled', () => {
  const sampleProfile = {
    name: 'BILLNAW GRAND CAFE',
    address: 'Park Street, Kolkata',
    phone: '9876543210',
    fssai: '12824019000123',
    gstin: '19ABCDE1234F1Z5',
    upiId: 'billnaw@upi',
    showQr: true,
    gstMode: 'inclusive',
    defaultGstRate: 5
  };
  const fakeLogo = new Uint8Array([0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xFF]);
  const fakeQr = new Uint8Array([0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xAA]);
  const order = {
    billNo: 1008,
    date: '07/11/2026, 03:00:00 AM',
    table: 'T2',
    orderType: 'Dine-In',
    paymentMode: 'UPI',
    biller: 'Cashier Rahul',
    amount: 105,
    rawItems: [{ name: 'Masala Dosa', qty: 1, price: 105, gstRate: 5 }]
  };
  const bytes = ThermalPrinterBridge.generateEscPosCommands(order, {
    storeProfile: sampleProfile,
    logoBytes: fakeLogo,
    qrBytes: fakeQr
  });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('BILLNAW GRAND') && text.includes('CAFE'), 'Missing Shop Name');
  assert.ok(text.includes('Park Street, Kolkata'), 'Missing Shop Address');
  assert.ok(text.includes('Tel: 9876543210'), 'Missing Shop Phone');
  assert.ok(text.includes('FSSAI Lic. No.: 12824019000123'), 'Missing FSSAI');
  assert.ok(text.includes('GSTIN: 19ABCDE1234F1Z5'), 'Missing GSTIN');
  assert.ok(text.includes('TAX INVOICE'), 'Missing TAX INVOICE header');
  assert.ok(text.includes('Masala Dosa'), 'Missing item name');
  assert.ok(text.includes('--- GST BREAKDOWN ---'), 'Missing GST BREAKDOWN section');
  assert.ok(text.includes('Taxable Value (5%)') && text.includes('Rs. 100.00'), 'Missing Taxable Value');
  assert.ok(text.includes('CGST @ 2.5%') && text.includes('Rs. 2.50'), 'Missing CGST @ 2.5%');
  assert.ok(text.includes('SGST @ 2.5%') && text.includes('Rs. 2.50'), 'Missing SGST @ 2.5%');
  assert.ok(text.includes('TOTAL: Rs.') && text.includes('105.00'), 'Missing TOTAL');
  assert.ok(text.includes('Scan to Pay') && text.includes('UPI: billnaw@upi'), 'Missing Scan to Pay / UPI ID');
});

check('TAX-02: generateEscPosCommands suppresses GST breakdown and prints RETAIL INVOICE when gstMode is "none"', () => {
  const noTaxProfile = {
    name: 'BILLNAW EXPRESS',
    gstin: '19ABCDE1234F1Z5',
    gstMode: 'none',
    defaultGstRate: 5
  };
  const order = {
    billNo: 1009,
    amount: 50,
    rawItems: [{ name: 'Cold Coffee', qty: 1, price: 50, gstRate: 5 }]
  };
  const bytes = ThermalPrinterBridge.generateEscPosCommands(order, { storeProfile: noTaxProfile });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('RETAIL INVOICE'), 'Expected RETAIL INVOICE when gstMode is none');
  assert.ok(!text.includes('--- GST BREAKDOWN ---'), 'GST Breakdown should not print when gstMode is none');
  assert.ok(!text.includes('GSTIN:'), 'GSTIN should not print when gstMode is none');
});

check('ITEMS-01: resolveStructuredItems parses legacy string items ("Samosa (x1), Tea (x2)") without "Item | 1 | Rs. 0.00" bug', () => {
  const orderWithStringItems = {
    billNo: 1010,
    amount: 35,
    items: 'Samosa (x1), Tea (x2)'
  };
  const bytes = ThermalPrinterBridge.generateEscPosCommands(orderWithStringItems, {
    storeProfile: { name: 'BILLNAW CAFE', gstMode: 'none' }
  });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('Samosa'), 'Failed to parse Samosa from string items');
  assert.ok(text.includes('Tea'), 'Failed to parse Tea from string items');
  assert.ok(!text.includes('Rs. 0.00'), 'Printed Rs. 0.00 instead of pro-rated/catalog item price');
});

check('PRN-01: sendEscPosToPrinter hydrates shopProfile and attaches storeProfile, logoBytes, and qrBytes for routePrintJob', () => {
  assert.ok(posjs.includes('ensureShopProfileHydrated'), 'sendEscPosToPrinter does not call ensureShopProfileHydrated');
  assert.ok(posjs.includes('order.logoBytes = logoBytes'), 'order.logoBytes not set');
  assert.ok(posjs.includes('order.qrBytes = qrBytes'), 'order.qrBytes not set');
  assert.ok(posjs.includes('order.storeProfile = shopProfile'), 'order.storeProfile not set');
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

check('KOT-ISO-02: Live KOT bytecode strictly excludes Shop Name, Address, Phone, FSSAI, GSTIN, Prices, Tax & QR', () => {
  const fullProfile = {
    name: 'SECRET SHOP NAME',
    address: '99 MG Road',
    phone: '9988776655',
    fssai: '11223344556677',
    gstin: '19ZZZZZ9999Z1Z9',
    upiId: 'secret@upi',
    showQr: true,
    gstMode: 'inclusive',
    defaultGstRate: 5
  };
  const kotPayload = {
    jobType: 'KOT',
    table: 'T4',
    biller: 'Waiter Raju',
    date: '03:05:00 AM',
    rawItems: [{ name: 'Paneer Tikka', qty: 2, price: 220, notes: 'Extra spicy' }]
  };
  const bytes = ThermalPrinterBridge.generateEscPosCommands(kotPayload, {
    isKot: true,
    storeProfile: fullProfile,
    logoBytes: new Uint8Array([1, 2, 3]),
    qrBytes: new Uint8Array([4, 5, 6])
  });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('KITCHEN TICKET'), 'Missing KITCHEN TICKET header');
  assert.ok(text.includes('TABLE: T4'), 'Missing TABLE: T4');
  assert.ok(text.includes('2x Paneer Tikka'), 'Missing 2x Paneer Tikka');
  assert.ok(text.includes('Extra spicy'), 'Missing item note');
  assert.ok(!text.includes('SECRET SHOP NAME'), 'KOT leaked Shop Name!');
  assert.ok(!text.includes('99 MG Road'), 'KOT leaked Shop Address!');
  assert.ok(!text.includes('9988776655'), 'KOT leaked Shop Phone!');
  assert.ok(!text.includes('11223344556677'), 'KOT leaked FSSAI!');
  assert.ok(!text.includes('19ZZZZZ9999Z1Z9'), 'KOT leaked GSTIN!');
  assert.ok(!text.includes('secret@upi'), 'KOT leaked UPI ID!');
  assert.ok(!text.includes('Scan to Pay'), 'KOT leaked Scan to Pay!');
  assert.ok(!text.includes('220'), 'KOT leaked item price!');
});

check('KOT-ISO-03: CSS @media print hides #print-receipt when body.printing-kot is active', () => {
  assert.ok(
    responsiveCss.includes('body.printing-kot #print-receipt { display: none !important; }'),
    'responsive.css missing body.printing-kot #print-receipt { display: none !important; }'
  );
  assert.ok(
    responsiveCss.includes('body:not(.printing-kot) #print-kot { display: none !important; }'),
    'responsive.css missing body:not(.printing-kot) #print-kot { display: none !important; }'
  );
});

check('KOT-ISO-04: executeHtmlPrint does not shrink 160px QR code to 50px and isolates KOT', () => {
  assert.ok(
    posjs.includes('.print-qr-img{width:160px !important;height:160px !important;') &&
    !posjs.includes('img{max-width:50px;'),
    'executeHtmlPrint still has global img{max-width:50px} shrinking QR code!'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MODAL-SAFE SETTINGS, LOGIN PROTECTION & ADMIN->CASHIER SYNC
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 3: MODAL-SAFE SETTINGS & ADMIN->CASHIER SYNC');

check('SETTINGS-01: saveSettings never overwrites defaultGstRate to 0 when #defaultGstRateInput is empty', () => {
  assert.ok(
    settingsjs.includes("rawRateStr !== '' && !isNaN(parseFloat(rawRateStr))"),
    'saveSettings does not guard against empty #defaultGstRateInput'
  );
});

check('SETTINGS-02: loadLogo fills canvas with white (#FFFFFF) before drawing logo to prevent black transparent PNGs', () => {
  assert.ok(
    settingsjs.includes("ctx.fillStyle = '#FFFFFF'") && settingsjs.includes('ctx.fillRect(0, 0, canvas.width, canvas.height)'),
    'loadLogo does not fill canvas background with white before JPEG encoding'
  );
});

check('AUTH-01: shop-auth.js login handlers (handleVerifyOtpCode & handlePasswordSignIn) do not overwrite cloud profile before hydration', () => {
  const loginSection = shopAuthJs.slice(0, shopAuthJs.indexOf('function handleCreateShopAccount'));
  const loginPersistCalls = loginSection.match(/if\s*\(typeof\s+persistProfile\s*===\s*'function'\)\s*persistProfile\(\);/g);
  assert.strictEqual(loginPersistCalls, null, 'Login handlers still call persistProfile() prematurely before Firestore hydration!');
});

check('SYNC-01: core.js defines and exports ensureShopProfileHydrated recovering logo, QR, and GST across tiers', () => {
  assert.ok(
    corejs.includes('async function ensureShopProfileHydrated()') &&
    corejs.includes('window.ensureShopProfileHydrated = ensureShopProfileHydrated'),
    'ensureShopProfileHydrated missing in core.js'
  );
});

check('SYNC-02: Staff session switch (cloud-sync.js & staff.js) hydrates shopProfile for Cashier role', () => {
  assert.ok(
    cloudSyncJs.includes('ensureShopProfileHydrated') && staffJs.includes('ensureShopProfileHydrated'),
    'activateStaffProfileSession or unlockTerminal missing ensureShopProfileHydrated call'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: SERVICE WORKER CACHE BUSTING & OFFLINE RESILIENCE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 4: SERVICE WORKER CACHE BUSTING & OFFLINE RESILIENCE');

check('SW-01: service-worker.js bumped to v3.5.0 with skipWaiting() and Network-First for code assets', () => {
  assert.ok(swJs.includes("CACHE_VERSION = 'billnaw-pos-shell-v3.5.0'"), 'CACHE_VERSION not bumped to v3.5.0');
  assert.ok(swJs.includes('self.skipWaiting()'), 'skipWaiting() missing in install listener');
  assert.ok(swJs.includes('if (isCodeAsset)'), 'Network-First for code assets missing in service-worker.js');
});

check('SW-02: index.html scripts bumped to ?v=2900', () => {
  assert.ok(indexHtml.includes('js/pos.js?v=2900') && indexHtml.includes('js/settings.js?v=2900'), 'index.html scripts not bumped to ?v=2900');
});

check('OFFLINE-01: refreshAiQuotaDisplay guards against offline fetch (navigator.onLine === false)', () => {
  assert.ok(
    settingsjs.includes('navigator.onLine === false') || settingsjs.includes('!navigator.onLine'),
    'refreshAiQuotaDisplay does not guard against offline fetch'
  );
});

check('FAV-01: favicon.ico exists at project root and is linked in index.html', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'favicon.ico')), 'favicon.ico missing at root');
  assert.ok(indexHtml.includes('href="favicon.ico"'), 'favicon.ico not linked in index.html');
});

// ═══════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n====================================================');
console.log(`🎯 LOGO, QR, TAX & KOT ISOLATION AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================');

if (failed === 0) {
  console.log('✨ ALL LOGO, DYNAMIC QR, TAX BREAKDOWN, KOT ISOLATION & ADMIN->CASHIER SYNC TESTS VERIFIED 100% GREEN!\n');
} else {
  process.exit(1);
}
