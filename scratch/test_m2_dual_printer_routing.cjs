/**
 * 🖨️ TEST SUITE: MILESTONE 2 DUAL THERMAL PRINTER MANAGEMENT & ROUTING (R2)
 * 
 * Verifies:
 * 1. Independent configuration of Printer 1 and Printer 2 (Transports, Paper Widths, Network IPs).
 * 2. Role-based automated routing (RECEIPT -> Printer 1, KOT -> Printer 2).
 * 3. Dynamic 80mm (48-col) and 58mm (32-col) paper formatting per slot.
 * 4. Interactive prompt fallback when role assignment is 'PROMPT' or unassigned.
 * 5. 'alwaysPrompt' mode forcing interactive selection on all print jobs.
 * 6. Dual-slot settings persistence and recovery in localStorage ('billnaw_printers_config').
 * 7. HTML contracts (#printerSettingsModal, #printerSelectModal, zero raw emojis, preserved 26 .modal-close-btn SVGs).
 * 8. Backwards compatibility getters/setters in ThermalPrinterBridge.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runM2DualPrinterTestSuite() {
  console.log('====================================================================');
  console.log('🖨️  VERIFICATION SUITE: MILESTONE 2 DUAL THERMAL PRINTER ROUTING (R2)');
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
  // SECTION 1: HTML DOM & MODAL CONTRACTS
  // ----------------------------------------------------
  console.log('📍 SECTION 1: HTML DOM & MODAL CONTRACTS');
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  it('HTML-01: Settings tile invokes openPrinterSettingsModal()', () => {
    assert.ok(
      html.includes('onclick="openPrinterSettingsModal()"'),
      'Settings tile must trigger openPrinterSettingsModal()'
    );
  });

  it('HTML-02: #printerSettingsModal exists with dual printer slot controls', () => {
    assert.ok(html.includes('id="printerSettingsModal"'), '#printerSettingsModal container missing');
    assert.ok(html.includes('id="printer1Transport"'), '#printer1Transport missing');
    assert.ok(html.includes('id="printer1PaperWidth"'), '#printer1PaperWidth missing');
    assert.ok(html.includes('id="printer1Host"'), '#printer1Host missing');
    assert.ok(html.includes('id="printer1Port"'), '#printer1Port missing');
    assert.ok(html.includes('id="btnPairPrinter1"'), '#btnPairPrinter1 missing');
    assert.ok(html.includes('id="btnTestPrinter1"'), '#btnTestPrinter1 missing');

    assert.ok(html.includes('id="printer2Transport"'), '#printer2Transport missing');
    assert.ok(html.includes('id="printer2PaperWidth"'), '#printer2PaperWidth missing');
    assert.ok(html.includes('id="printer2Host"'), '#printer2Host missing');
    assert.ok(html.includes('id="printer2Port"'), '#printer2Port missing');
    assert.ok(html.includes('id="btnPairPrinter2"'), '#btnPairPrinter2 missing');
    assert.ok(html.includes('id="btnTestPrinter2"'), '#btnTestPrinter2 missing');

    assert.ok(html.includes('id="cfgDefaultReceiptPrinter"'), '#cfgDefaultReceiptPrinter missing');
    assert.ok(html.includes('id="cfgDefaultKotPrinter"'), '#cfgDefaultKotPrinter missing');
    assert.ok(html.includes('id="cfgAlwaysPromptPrinters"'), '#cfgAlwaysPromptPrinters missing');
    assert.ok(html.includes('id="btnSavePrinterSettings"'), '#btnSavePrinterSettings missing');
  });

  it('HTML-03: #printerSelectModal exists with interactive destination buttons', () => {
    assert.ok(html.includes('id="printerSelectModal"'), '#printerSelectModal container missing');
    assert.ok(html.includes('id="printerSelectRoleLabel"'), '#printerSelectRoleLabel missing');
    assert.ok(html.includes('id="btnSelectPrinter1"'), '#btnSelectPrinter1 missing');
    assert.ok(html.includes('id="btnSelectPrinter2"'), '#btnSelectPrinter2 missing');
    assert.ok(html.includes('id="btnSelectSystemDialog"'), '#btnSelectSystemDialog missing');
    assert.ok(html.includes('id="btnSelectPrinterCancel"'), '#btnSelectPrinterCancel missing');
  });

  it('HTML-04: Strict modal close invariant: zero additional .modal-close-btn SVGs (exactly 26)', () => {
    const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(matches, 'Matches array is null');
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn elements, found ${matches.length}`);
  });

  it('HTML-05: Zero raw Unicode emojis inside newly created modal buttons', () => {
    const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const modal1Match = html.match(/<div\b[^>]*id="printerSettingsModal"[^>]*>([\s\S]*?)<\/div>\s*<!-- Interactive Printer Selection/);
    assert.ok(modal1Match, 'Could not isolate #printerSettingsModal markup');
    assert.strictEqual(rawEmojiRegex.test(modal1Match[1]), false, 'Raw emoji found in #printerSettingsModal');

    const modal2Match = html.match(/<div\b[^>]*id="printerSelectModal"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(modal2Match, 'Could not isolate #printerSelectModal markup');
    assert.strictEqual(rawEmojiRegex.test(modal2Match[1]), false, 'Raw emoji found in #printerSelectModal');
  });

  // ----------------------------------------------------
  // SECTION 2: PLATFORM BRIDGE DUAL SLOTS & PERSISTENCE
  // ----------------------------------------------------
  console.log('\n📍 SECTION 2: PLATFORM BRIDGE DUAL SLOTS & PERSISTENCE');

  // Setup mock localStorage
  const storageMap = new Map();
  global.localStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  const { ThermalPrinterBridge, DEFAULT_PRINTERS_CONFIG } = await import('../src/core/platform-bridge.js');

  it('CFG-01: DEFAULT_PRINTERS_CONFIG defines printer1, printer2, and routing', () => {
    assert.ok(DEFAULT_PRINTERS_CONFIG.printer1, 'printer1 default missing');
    assert.ok(DEFAULT_PRINTERS_CONFIG.printer2, 'printer2 default missing');
    assert.ok(DEFAULT_PRINTERS_CONFIG.routing, 'routing default missing');
    assert.strictEqual(DEFAULT_PRINTERS_CONFIG.routing.defaultReceiptPrinter, 'printer1');
    assert.strictEqual(DEFAULT_PRINTERS_CONFIG.routing.defaultKotPrinter, 'printer2');
    assert.strictEqual(DEFAULT_PRINTERS_CONFIG.routing.alwaysPrompt, false);
  });

  it('CFG-02: savePrinterSettings() persists independent configurations to localStorage', () => {
    storageMap.clear();

    const customConfig = {
      printer1: {
        transport: 'NETWORK',
        paperWidth: '80mm',
        host: '192.168.1.100',
        port: 9100
      },
      printer2: {
        transport: 'BLUETOOTH',
        paperWidth: '58mm',
        name: 'Ezo Kitchen BLE'
      },
      routing: {
        defaultReceiptPrinter: 'printer1',
        defaultKotPrinter: 'printer2',
        alwaysPrompt: false
      }
    };

    ThermalPrinterBridge.savePrinterSettings(customConfig);

    const savedRaw = storageMap.get('billnaw_printers_config');
    assert.ok(savedRaw, 'billnaw_printers_config was not written to localStorage');

    const parsed = JSON.parse(savedRaw);
    assert.strictEqual(parsed.printer1.transport, 'NETWORK');
    assert.strictEqual(parsed.printer1.host, '192.168.1.100');
    assert.strictEqual(parsed.printer2.transport, 'BLUETOOTH');
    assert.strictEqual(parsed.printer2.paperWidth, '58mm');
    assert.strictEqual(parsed.routing.defaultReceiptPrinter, 'printer1');
    assert.strictEqual(parsed.routing.defaultKotPrinter, 'printer2');

    // Also verify legacy mirror key pos_dual_printers was updated
    assert.ok(storageMap.has('pos_dual_printers'), 'pos_dual_printers mirror missing');
  });

  it('CFG-03: loadPrinterSettings() recovers configuration from localStorage snapshot', () => {
    // Reset internal state
    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer1.host = '';

    const loaded = ThermalPrinterBridge.loadPrinterSettings();
    assert.strictEqual(loaded.printer1.transport, 'NETWORK');
    assert.strictEqual(loaded.printer1.host, '192.168.1.100');
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.transport, 'NETWORK');
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.host, '192.168.1.100');
  });

  it('CFG-04: Backwards-compatibility getters and setters operate on printer1', () => {
    const mockChar = { uuid: 'mock-char-uuid', writeValue: async () => {} };
    ThermalPrinterBridge.activeCharacteristic = mockChar;

    assert.strictEqual(ThermalPrinterBridge.activeCharacteristic, mockChar);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, mockChar);

    ThermalPrinterBridge.activeCharacteristic = null;
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, null);
  });

  // ----------------------------------------------------
  // SECTION 3: ROLE-BASED AUTOMATED ROUTING ENGINE
  // ----------------------------------------------------
  console.log('\n📍 SECTION 3: ROLE-BASED AUTOMATED ROUTING ENGINE');

  await itAsync('ROUTE-01: Receipt job automatically dispatches to defaultReceiptPrinter (printer1)', async () => {
    let dispatchedSlot = null;
    let dispatchedBytes = null;

    // Spy on dispatchToPrinterSlot
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      dispatchedSlot = slot;
      dispatchedBytes = bytes;
      return { success: true, data: { printed: true, slot } };
    };

    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer2';
    ThermalPrinterBridge.routing.alwaysPrompt = false;

    const dummyInvoice = {
      billNo: 'INV-101',
      date: '2026-11-06 12:00',
      orderType: 'Dine-In',
      paymentMode: 'Cash',
      amount: 450,
      final_payable_paise: 45000,
      rawItems: [{ name: 'Espresso Single', qty: 2, price: 150 }]
    };

    const res = await ThermalPrinterBridge.routePrintJob(dummyInvoice, { role: 'RECEIPT' });

    assert.ok(res.success, 'routePrintJob failed');
    assert.strictEqual(dispatchedSlot, 'printer1', 'Receipt should have routed to printer1');
    assert.strictEqual(res.data.role, 'RECEIPT');
    assert.ok(dispatchedBytes instanceof Uint8Array, 'Byte stream must be Uint8Array');

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ROUTE-02: Kitchen KOT job automatically dispatches to defaultKotPrinter (printer2)', async () => {
    let dispatchedSlot = null;
    let dispatchedBytes = null;

    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      dispatchedSlot = slot;
      dispatchedBytes = bytes;
      return { success: true, data: { printed: true, slot } };
    };

    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer2';
    ThermalPrinterBridge.routing.alwaysPrompt = false;

    const dummyKot = {
      table: 'T4',
      tableNo: 'T4',
      items: [
        { name: 'Veg Hakka Noodles', qty: 2, notes: 'Spicy' },
        { name: 'Crispy Paneer', qty: 1 }
      ],
      biller: 'Chef Ravi'
    };

    const res = await ThermalPrinterBridge.routePrintJob(dummyKot, { role: 'KOT' });

    assert.ok(res.success, 'KOT routePrintJob failed');
    assert.strictEqual(dispatchedSlot, 'printer2', 'KOT should have routed to printer2');
    assert.strictEqual(res.data.role, 'KOT');

    // Decode ESC/POS bytes to verify KOT formatting
    const text = new TextDecoder().decode(dispatchedBytes);
    assert.ok(text.includes('KITCHEN TICKET'), 'Missing KITCHEN TICKET header');
    assert.ok(text.includes('TABLE: T4'), 'Missing TABLE: T4');
    assert.ok(text.includes('Veg Hakka Noodles'), 'Missing noodle item');

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ROUTE-03: Dynamic paper width formats 48 columns for 80mm and 32 columns for 58mm', async () => {
    ThermalPrinterBridge.printers.printer1.paperWidth = '80mm';
    ThermalPrinterBridge.printers.printer2.paperWidth = '58mm';

    let dispatchedBytes1 = null;
    let dispatchedBytes2 = null;

    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      if (slot === 'printer1') dispatchedBytes1 = bytes;
      if (slot === 'printer2') dispatchedBytes2 = bytes;
      return { success: true, data: { printed: true, slot } };
    };

    const invoice = {
      billNo: 'W-001',
      date: '2026-11-06',
      amount: 100,
      rawItems: [{ name: 'Test Item', qty: 1, price: 100 }]
    };

    await ThermalPrinterBridge.routePrintJob(invoice, { role: 'RECEIPT' });

    const kot = {
      table: 'T1',
      items: [{ name: 'Test KOT Item', qty: 1 }]
    };

    await ThermalPrinterBridge.routePrintJob(kot, { role: 'KOT' });

    const text80mm = new TextDecoder().decode(dispatchedBytes1);
    const text58mm = new TextDecoder().decode(dispatchedBytes2);

    assert.ok(text80mm.includes('-'.repeat(48)), '80mm receipt must have 48-column divider');
    assert.ok(text58mm.includes('-'.repeat(32)), '58mm KOT must have 32-column divider');

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  // ----------------------------------------------------
  // SECTION 4: INTERACTIVE PROMPT FALLBACK ENGINE
  // ----------------------------------------------------
  console.log('\n📍 SECTION 4: INTERACTIVE PROMPT FALLBACK ENGINE');

  await itAsync('PROMPT-01: Triggers prompt when defaultReceiptPrinter is set to PROMPT', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';
    ThermalPrinterBridge.routing.alwaysPrompt = false;

    let promptCalled = false;
    let promptRole = null;
    ThermalPrinterBridge._mockPromptSelection = async (role) => {
      promptCalled = true;
      promptRole = role;
      return 'printer2'; // User manually chose printer2 for this receipt
    };

    let dispatchedSlot = null;
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => {
      dispatchedSlot = slot;
      return { success: true, data: { printed: true, slot } };
    };

    const invoice = { billNo: 'P-101', amount: 200, rawItems: [{ name: 'Chai', qty: 2, price: 100 }] };
    const res = await ThermalPrinterBridge.routePrintJob(invoice, { role: 'RECEIPT' });

    assert.ok(promptCalled, 'Prompt selection was not invoked');
    assert.strictEqual(promptRole, 'RECEIPT');
    assert.strictEqual(dispatchedSlot, 'printer2', 'Should dispatch to the slot chosen in prompt');
    assert.strictEqual(res.data.slot, 'printer2');

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('PROMPT-02: User cancellation in interactive prompt returns cancelled: true without error', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';

    ThermalPrinterBridge._mockPromptSelection = async () => null; // User clicked Cancel

    let dispatchCalled = false;
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async () => {
      dispatchCalled = true;
      return { success: true };
    };

    const invoice = { billNo: 'P-102', amount: 300, rawItems: [{ name: 'Coffee', qty: 1, price: 300 }] };
    const res = await ThermalPrinterBridge.routePrintJob(invoice, { role: 'RECEIPT' });

    assert.strictEqual(dispatchCalled, false, 'Should not dispatch when user cancels');
    assert.strictEqual(res.data.cancelled, true, 'Result must indicate cancelled: true');
    assert.strictEqual(res.data.printed, false);

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('PROMPT-03: User selecting SYSTEM_DIALOG routes to browser print spooler', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';

    ThermalPrinterBridge._mockPromptSelection = async () => 'SYSTEM_DIALOG';

    let windowPrintTriggered = false;
    global.window = global.window || {};
    global.window.print = () => { windowPrintTriggered = true; };

    const invoice = { billNo: 'P-103', amount: 500, rawItems: [{ name: 'Pizza', qty: 1, price: 500 }] };
    const res = await ThermalPrinterBridge.routePrintJob(invoice, { role: 'RECEIPT' });

    assert.ok(windowPrintTriggered, 'window.print() was not invoked for SYSTEM_DIALOG');
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG');
    assert.strictEqual(res.data.slot, 'SYSTEM_DIALOG');

    ThermalPrinterBridge._mockPromptSelection = null;
  });

  await itAsync('PROMPT-04: alwaysPrompt = true forces interactive prompt even if default slot is assigned', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.alwaysPrompt = true;

    let promptCalled = false;
    ThermalPrinterBridge._mockPromptSelection = async () => {
      promptCalled = true;
      return 'printer1';
    };

    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => ({ success: true, data: { printed: true, slot } });

    const invoice = { billNo: 'P-104', amount: 150, rawItems: [{ name: 'Tea', qty: 1, price: 150 }] };
    await ThermalPrinterBridge.routePrintJob(invoice, { role: 'RECEIPT' });

    assert.ok(promptCalled, 'Prompt selection must be forced when alwaysPrompt is true');

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
    ThermalPrinterBridge.routing.alwaysPrompt = false;
  });

  // ----------------------------------------------------
  // SECTION 5: POS.JS WIRING & GLOBAL EXPOSURES
  // ----------------------------------------------------
  console.log('\n📍 SECTION 5: POS.JS WIRING & GLOBAL EXPOSURES');
  const posJsPath = path.join(__dirname, '..', 'js', 'pos.js');
  const posJs = fs.readFileSync(posJsPath, 'utf8');

  it('POS-01: pos.js defines openPrinterSettingsModal and closePrinterSettingsModal', () => {
    assert.ok(posJs.includes('function openPrinterSettingsModal('), 'openPrinterSettingsModal missing');
    assert.ok(posJs.includes('function closePrinterSettingsModal('), 'closePrinterSettingsModal missing');
    assert.ok(posJs.includes('window.openPrinterSettingsModal = openPrinterSettingsModal'), 'window exposure missing');
  });

  it('POS-02: pos.js defines savePrinterSettingsFromUi and pairPrinterSlot', () => {
    assert.ok(posJs.includes('function savePrinterSettingsFromUi('), 'savePrinterSettingsFromUi missing');
    assert.ok(posJs.includes('function pairPrinterSlot('), 'pairPrinterSlot missing');
    assert.ok(posJs.includes('function testPrinterSlot('), 'testPrinterSlot missing');
  });

  it('POS-03: pos.js defines interactive selection modal controls', () => {
    assert.ok(posJs.includes('function openPrinterSelectModal('), 'openPrinterSelectModal missing');
    assert.ok(posJs.includes('function closePrinterSelectModal('), 'closePrinterSelectModal missing');
    assert.ok(posJs.includes('function handleInteractivePrinterSelect('), 'handleInteractivePrinterSelect missing');
  });

  it('POS-04: sendEscPosToPrinter routes through ThermalPrinterBridge.routePrintJob', () => {
    assert.ok(
      posJs.includes('ThermalPrinterBridge.routePrintJob(order, { role: \'RECEIPT\' })'),
      'sendEscPosToPrinter must route through ThermalPrinterBridge.routePrintJob with role RECEIPT'
    );
  });

  it('POS-05: sendKotToPrinter routes through ThermalPrinterBridge.routePrintJob', () => {
    assert.ok(
      posJs.includes('ThermalPrinterBridge.routePrintJob(kotJobPayload, { role: \'KOT\' })'),
      'sendKotToPrinter must route through ThermalPrinterBridge.routePrintJob with role KOT'
    );
  });

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('====================================================================');
  console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ M2 TEST FAILURES REPORT:');
    failureReports.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}\n     ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('✨ ALL MILESTONE 2 DUAL PRINTER MANAGEMENT & ROUTING TESTS PASSED 100%!\n');
    process.exit(0);
  }
}

runM2DualPrinterTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
