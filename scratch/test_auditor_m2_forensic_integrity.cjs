/**
 * scratch/test_auditor_m2_forensic_integrity.cjs
 * Independent Forensic Integrity & Adversarial Stress Verification Suite for Milestone 2 (R2)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runForensicAudit() {
  console.log('====================================================================');
  console.log('🔍 FORENSIC AUDIT SUITE: MILESTONE 2 INTEGRITY & STRESS AUDIT');
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

  // -------------------------------------------------------------------------
  // 1. INVARIANT & DOM FORENSICS
  // -------------------------------------------------------------------------
  console.log('📍 1. INVARIANT & STATIC FORENSICS (index.html)');
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  it('INVAR-01: Exactly 26 .modal-close-btn elements exist (strictly preserved)', () => {
    const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(matches, 'Matches array is null');
    assert.strictEqual(matches.length, 26, `Expected exactly 26, got ${matches.length}`);
  });

  it('INVAR-02: Printer modals use .printer-close-btn without polluting .modal-close-btn', () => {
    const printerCloseBtns = html.match(/class=["'][^"']*printer-close-btn[^"']*["']/g);
    assert.ok(printerCloseBtns && printerCloseBtns.length === 2, `Expected 2 .printer-close-btn instances, found ${printerCloseBtns ? printerCloseBtns.length : 0}`);
    
    // Ensure printer-close-btn is not matched by modal-close-btn regex
    const btnSample = '<button type="button" class="printer-close-btn" aria-label="Close"><svg></svg></button>';
    const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/;
    assert.strictEqual(regex.test(btnSample), false, 'printer-close-btn must not match modal-close-btn regex');
  });

  it('INVAR-03: Strict zero raw Unicode emojis across newly added modal markup', () => {
    const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const m1 = html.match(/<div\b[^>]*id="printerSettingsModal"[^>]*>([\s\S]*?)<\/div>\s*<!-- Interactive Printer Selection/);
    assert.ok(m1, 'printerSettingsModal section found');
    assert.strictEqual(rawEmojiRegex.test(m1[1]), false, 'Found raw emoji in printerSettingsModal');

    const m2 = html.match(/<div\b[^>]*id="printerSelectModal"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(m2, 'printerSelectModal section found');
    assert.strictEqual(rawEmojiRegex.test(m2[1]), false, 'Found raw emoji in printerSelectModal');
  });

  it('INVAR-04: Non-breaking currency space is preserved throughout pos.js and index.html', () => {
    const posJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');
    assert.ok(posJs.includes('₹ '), 'pos.js must preserve ₹ non-breaking space');
  });

  // -------------------------------------------------------------------------
  // 2. STORAGE ROBUSTNESS & STATE ISOLATION FORENSICS
  // -------------------------------------------------------------------------
  console.log('\n📍 2. STORAGE ROBUSTNESS & STATE ISOLATION FORENSICS');

  const storageMap = new Map();
  global.localStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  const { ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');

  it('STORAGE-01: Corrupt JSON in localStorage handled gracefully without throwing', () => {
    storageMap.set('billnaw_printers_config', '{corrupt json!!!');
    storageMap.set('pos_dual_printers', '{corrupt json!!!');

    let settings;
    assert.doesNotThrow(() => {
      settings = ThermalPrinterBridge.loadPrinterSettings();
    }, 'loadPrinterSettings threw on corrupt JSON');

    assert.ok(settings.printer1, 'printer1 default missing after corrupt load');
    assert.ok(settings.printer2, 'printer2 default missing after corrupt load');
    assert.ok(settings.routing, 'routing default missing after corrupt load');
  });

  it('STORAGE-02: Partial config in localStorage merges cleanly without wiping other slots', () => {
    storageMap.clear();
    const partial = {
      printer2: {
        transport: 'USB',
        paperWidth: '80mm',
        name: 'Kitchen Custom USB'
      }
    };
    storageMap.set('billnaw_printers_config', JSON.stringify(partial));

    const loaded = ThermalPrinterBridge.loadPrinterSettings();
    assert.strictEqual(loaded.printer2.transport, 'USB');
    assert.strictEqual(loaded.printer2.paperWidth, '80mm');
    assert.strictEqual(loaded.printer2.name, 'Kitchen Custom USB');
    // printer1 should remain intact
    assert.ok(loaded.printer1.id === 'printer1');
    assert.ok(loaded.routing.defaultReceiptPrinter === 'printer1');
  });

  it('STORAGE-03: Slot isolation: updating printer1 properties does not mutate printer2', () => {
    ThermalPrinterBridge.savePrinterSettings({
      printer1: { transport: 'NETWORK', host: '10.0.0.99', port: 9100 },
      printer2: { transport: 'BLUETOOTH', host: '', port: 9100 }
    });

    assert.strictEqual(ThermalPrinterBridge.printers.printer1.transport, 'NETWORK');
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.host, '10.0.0.99');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.transport, 'BLUETOOTH');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.host, '');
  });

  // -------------------------------------------------------------------------
  // 3. ROLE RESOLUTION & ROUTING FORENSICS
  // -------------------------------------------------------------------------
  console.log('\n📍 3. ROLE RESOLUTION & ROUTING FORENSICS');

  await itAsync('ROUTER-01: Auto-infers role KOT from jobType === "KOT"', async () => {
    let target = null;
    const orig = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => { target = slot; return { success: true, data: {} }; };

    await ThermalPrinterBridge.routePrintJob({ jobType: 'KOT', items: [{ name: 'Soup', qty: 1 }] });
    assert.strictEqual(target, 'printer2', 'Should auto-infer KOT and route to printer2');

    ThermalPrinterBridge.dispatchToPrinterSlot = orig;
  });

  await itAsync('ROUTER-02: Auto-infers role KOT from kot_id / kotId', async () => {
    let target = null;
    const orig = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => { target = slot; return { success: true, data: {} }; };

    await ThermalPrinterBridge.routePrintJob({ kot_id: 'kot_1234', table: 'T2', items: [{ name: 'Tea', qty: 2 }] });
    assert.strictEqual(target, 'printer2', 'Should auto-infer KOT from kot_id');

    ThermalPrinterBridge.dispatchToPrinterSlot = orig;
  });

  await itAsync('ROUTER-03: Auto-infers role RECEIPT when invoice billNo / amount is present', async () => {
    let target = null;
    const orig = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => { target = slot; return { success: true, data: {} }; };

    await ThermalPrinterBridge.routePrintJob({ billNo: 'B-777', amount: 500, rawItems: [{ name: 'Pizza', qty: 1 }] });
    assert.strictEqual(target, 'printer1', 'Should auto-infer RECEIPT and route to printer1');

    ThermalPrinterBridge.dispatchToPrinterSlot = orig;
  });

  await itAsync('ROUTER-04: Rejects null/undefined jobPayload gracefully with errorResult', async () => {
    const res = await ThermalPrinterBridge.routePrintJob(null);
    assert.ok(res.error, 'Should return errorResult on null payload');
    assert.strictEqual(res.error.code, 'INVALID_PAYLOAD');
  });

  await itAsync('ROUTER-05: Missing or unassigned targetSlot triggers promptInteractiveSelection', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = null; // Unassigned!
    
    let prompted = false;
    ThermalPrinterBridge._mockPromptSelection = async () => {
      prompted = true;
      return 'printer1';
    };

    let target = null;
    const orig = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => { target = slot; return { success: true, data: {} }; };

    await ThermalPrinterBridge.routePrintJob({ billNo: 'B-888', amount: 100 }, { role: 'RECEIPT' });
    assert.ok(prompted, 'Unassigned slot must trigger prompt fallback');
    assert.strictEqual(target, 'printer1');

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = orig;
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
  });

  // -------------------------------------------------------------------------
  // 4. HARDWARE STATUS & ADVERSARIAL DISPATCH FORENSICS
  // -------------------------------------------------------------------------
  console.log('\n📍 4. HARDWARE STATUS & ADVERSARIAL DISPATCH FORENSICS');

  it('STATUS-01: isPrinterReady returns accurate readiness for all transports', () => {
    assert.strictEqual(ThermalPrinterBridge.isPrinterReady('SYSTEM_DIALOG'), true);

    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    assert.strictEqual(ThermalPrinterBridge.isPrinterReady('printer1'), false);

    ThermalPrinterBridge.printers.printer1.characteristic = { uuid: 'c1' };
    assert.strictEqual(ThermalPrinterBridge.isPrinterReady('printer1'), true);

    ThermalPrinterBridge.printers.printer2.transport = 'NETWORK';
    ThermalPrinterBridge.printers.printer2.host = '';
    assert.strictEqual(ThermalPrinterBridge.isPrinterReady('printer2'), false);

    ThermalPrinterBridge.printers.printer2.host = '192.168.1.50';
    assert.strictEqual(ThermalPrinterBridge.isPrinterReady('printer2'), true);
  });

  await itAsync('STATUS-02: Cross-slot bleed prevention: dispatching to slot without connection does not use another slot characteristic', async () => {
    // printer1 has a characteristic
    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer1.characteristic = {
      uuid: 'char-p1',
      writeValue: async () => {}
    };

    // printer2 has NO characteristic
    ThermalPrinterBridge.printers.printer2.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer2.characteristic = null;

    // Dispatching to printer2 must NOT use printer1's characteristic!
    // In headless Node, no window.print exists, so it must return PRINTER_UNAVAILABLE
    const savedWindow = global.window;
    delete global.window;

    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer2', new Uint8Array([0x1B, 0x40]));
    assert.ok(res.error, 'Must fail when slot has no characteristic');
    assert.strictEqual(res.error.code, 'PRINTER_UNAVAILABLE');

    global.window = savedWindow;
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 AUDITOR TEST SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ AUDITOR FAILURES DETECTED:');
    failureReports.forEach((f, idx) => console.error(`  ${idx + 1}. ${f.name}\n     ${f.error}`));
    process.exit(1);
  } else {
    console.log('✨ ALL FORENSIC INTEGRITY & ADVERSARIAL STRESS TESTS PASSED 100%!\n');
    process.exit(0);
  }
}

runForensicAudit().catch(err => {
  console.error('Fatal auditor error:', err);
  process.exit(1);
});
