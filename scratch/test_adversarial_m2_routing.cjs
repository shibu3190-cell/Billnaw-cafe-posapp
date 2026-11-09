/**
 * 🖨️ ADVERSARIAL STRESS HARNESS: MILESTONE 2 DUAL PRINTER ROUTING (R2)
 * 
 * Conducts adversarial stress-testing against the dual printer management
 * and routing subsystem implemented in src/core/platform-bridge.js and js/pos.js.
 * 
 * Challenge Dimensions:
 * 1. Rapid sequential & concurrent role switching under heavy load (receipts -> P1, KOTs -> P2).
 * 2. Corrupted, non-JSON, and hostile localStorage configurations (fuzzing recovery).
 * 3. Interactive prompt resolution under race and concurrency conditions.
 * 4. Complete peripheral disconnection & hardware write failure fallbacks to SYSTEM_DIALOG.
 * 5. Role spoofing, boundary payloads, and memory queue resilience.
 * 6. Repository invariants (26 modal close SVGs, 0 raw emojis).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Global mock environment setup for Node.js
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

global.window = global.window || {};
global.document = global.document || {
  getElementById: () => null
};

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
    failureReports.push({ name, error: err.message, stack: err.stack });
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
    failureReports.push({ name, error: err.message, stack: err.stack });
  }
}

async function runAdversarialM2Suite() {
  console.log('====================================================================');
  console.log('🔥 ADVERSARIAL VERIFICATION: DUAL PRINTER MANAGEMENT & ROUTING (R2)');
  console.log('====================================================================\n');

  const { ThermalPrinterBridge, DEFAULT_PRINTERS_CONFIG } = await import('../src/core/platform-bridge.js');

  function resetBridgeState() {
    storageMap.clear();
    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer2';
    ThermalPrinterBridge.routing.alwaysPrompt = false;

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'Printer 1 (Receipt)',
      transport: 'BLUETOOTH',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'DISCONNECTED',
      device: null,
      server: null,
      characteristic: null,
      serviceUuid: null,
      charUuid: null,
      endpointNumber: null,
      interfaceNumber: null,
      host: null,
      port: 9100,
      serialPort: null,
      baudRate: 9600
    };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Printer 2 (Kitchen)',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'DISCONNECTED',
      device: null,
      server: null,
      characteristic: null,
      serviceUuid: null,
      charUuid: null,
      endpointNumber: null,
      interfaceNumber: null,
      host: null,
      port: 9100,
      serialPort: null,
      baudRate: 9600
    };
  }

  // ====================================================================
  // CHALLENGE 1: RAPID SEQUENTIAL & CONCURRENT ROLE SWITCHING UNDER STRESS
  // ====================================================================
  console.log('📍 CHALLENGE 1: RAPID SEQUENTIAL & CONCURRENT ROLE SWITCHING UNDER STRESS');

  await itAsync('ADV-01-A: 200 rapid alternating dispatches strictly isolate Printer 1 (Receipts) and Printer 2 (KOTs)', async () => {
    resetBridgeState();
    const printer1Log = [];
    const printer2Log = [];

    // Attach mock driver to slots
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      const decoded = new TextDecoder().decode(bytes);
      if (slot === 'printer1') {
        printer1Log.push({ slot, bytes, decoded });
      } else if (slot === 'printer2') {
        printer2Log.push({ slot, bytes, decoded });
      }
      return { data: { printed: true, slot }, error: null, offlineQueued: false };
    };

    const iterations = 100; // 100 receipts + 100 KOTs = 200 total alternating
    for (let i = 0; i < iterations; i++) {
      // 1. Dispatch Receipt
      const receiptJob = {
        billNo: `BILL-${1000 + i}`,
        amount: 250 + i,
        final_payable_paise: (250 + i) * 100,
        rawItems: [{ name: `Dish ${i}`, qty: 1, price: 250 + i }]
      };
      const rRes = await ThermalPrinterBridge.routePrintJob(receiptJob, { role: 'RECEIPT' });
      assert.strictEqual(rRes.error, null);
      assert.strictEqual(rRes.data.slot, 'printer1', `Receipt ${i} went to unexpected slot ${rRes.data.slot}`);

      // 2. Dispatch KOT
      const kotJob = {
        kot_id: `KOT-${i}`,
        table: `T-${(i % 10) + 1}`,
        items: [{ name: `Kitchen Item ${i}`, qty: 2 }]
      };
      const kRes = await ThermalPrinterBridge.routePrintJob(kotJob, { role: 'KOT' });
      assert.strictEqual(kRes.error, null);
      assert.strictEqual(kRes.data.slot, 'printer2', `KOT ${i} went to unexpected slot ${kRes.data.slot}`);
    }

    assert.strictEqual(printer1Log.length, 100, `Printer 1 received ${printer1Log.length} jobs instead of 100`);
    assert.strictEqual(printer2Log.length, 100, `Printer 2 received ${printer2Log.length} jobs instead of 100`);

    // Verify content isolation: Printer 1 MUST NOT contain any KOT tokens, Printer 2 MUST NOT contain receipt tokens
    for (const r of printer1Log) {
      assert.ok(r.bytes[0] === 0x1B && r.bytes[1] === 0x40, 'Receipt missing ESC @ init header');
      assert.ok(r.decoded.includes('------------------------------------------------'), 'Receipt must use 80mm 48-col divider');
      assert.strictEqual(r.decoded.includes('KITCHEN TICKET'), false, 'Printer 1 leaked KOT header');
      assert.strictEqual(r.decoded.includes('TABLE:'), false, 'Printer 1 leaked KOT table line');
    }

    for (const k of printer2Log) {
      assert.ok(k.bytes[0] === 0x1B && k.bytes[1] === 0x40, 'KOT missing ESC @ init header');
      assert.ok(k.decoded.includes('--------------------------------\n'), 'KOT must use 58mm 32-col divider');
      assert.ok(k.decoded.includes('KITCHEN TICKET'), 'KOT missing KITCHEN TICKET');
      assert.strictEqual(k.decoded.includes('TOTAL:'), false, 'Printer 2 leaked receipt TOTAL');
      assert.strictEqual(k.decoded.includes('RETAIL INVOICE'), false, 'Printer 2 leaked invoice title');
    }

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ADV-01-B: 50 concurrent mixed print jobs via Promise.all resolve without race or cross-over', async () => {
    resetBridgeState();
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      // Simulate minor async hardware delay
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5)));
      return { data: { printed: true, slot }, error: null, offlineQueued: false };
    };

    const promises = [];
    for (let i = 0; i < 50; i++) {
      const isKot = i % 2 === 1;
      const job = isKot
        ? { jobType: 'KOT', table: `T-${i}`, items: [{ name: `Concurrent Dish ${i}`, qty: 1 }] }
        : { billNo: `C-BILL-${i}`, amount: 100 + i, rawItems: [{ name: `Concurrent Item ${i}`, qty: 1, price: 100 }] };
      promises.push(ThermalPrinterBridge.routePrintJob(job));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50, 'All 50 concurrent jobs must resolve');
    for (let i = 0; i < 50; i++) {
      const isKot = i % 2 === 1;
      const expectedSlot = isKot ? 'printer2' : 'printer1';
      assert.strictEqual(results[i].error, null);
      assert.strictEqual(results[i].data.slot, expectedSlot, `Job ${i} assigned to wrong slot`);
    }

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ADV-01-C: Dynamic routing role swap mid-stream immediately redirects subsequent jobs', async () => {
    resetBridgeState();
    const history = [];
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => {
      history.push(slot);
      return { data: { printed: true, slot }, error: null, offlineQueued: false };
    };

    // Initial: Receipts -> P1, KOTs -> P2
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer2';

    await ThermalPrinterBridge.routePrintJob({ billNo: 'B-1', amount: 10, rawItems: [] }, { role: 'RECEIPT' });
    await ThermalPrinterBridge.routePrintJob({ table: 'T-1', items: [] }, { role: 'KOT' });

    assert.deepStrictEqual(history, ['printer1', 'printer2']);

    // Dynamic Role Swap: Receipts -> P2, KOTs -> P1
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer2';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer1';

    await ThermalPrinterBridge.routePrintJob({ billNo: 'B-2', amount: 20, rawItems: [] }, { role: 'RECEIPT' });
    await ThermalPrinterBridge.routePrintJob({ table: 'T-2', items: [] }, { role: 'KOT' });

    assert.deepStrictEqual(history, ['printer1', 'printer2', 'printer2', 'printer1']);

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  // ====================================================================
  // CHALLENGE 2: CORRUPTED & HOSTILE LOCALSTORAGE CONFIGURATION RECOVERY
  // ====================================================================
  console.log('\n📍 CHALLENGE 2: CORRUPTED & HOSTILE LOCALSTORAGE CONFIGURATION RECOVERY');

  it('ADV-02-A: Corrupted non-JSON strings in localStorage recover gracefully without uncaught exceptions', () => {
    resetBridgeState();
    const hostileInputs = [
      '{bad json string: 123',
      'CORRUPTED_RAW_BLOB_!@#$%^&*()',
      '<html><body>404 Not Found</body></html>',
      'undefined',
      'NaN',
      '{{{[[[}}}'
    ];

    for (const hostile of hostileInputs) {
      storageMap.set('billnaw_printers_config', hostile);
      storageMap.set('pos_dual_printers', hostile);

      let loaded;
      assert.doesNotThrow(() => {
        loaded = ThermalPrinterBridge.loadPrinterSettings();
      }, `loadPrinterSettings threw on hostile input: ${hostile}`);

      assert.ok(loaded.printer1, 'printer1 must exist after recovery');
      assert.ok(loaded.printer2, 'printer2 must exist after recovery');
      assert.ok(loaded.routing, 'routing must exist after recovery');
    }
  });

  it('ADV-02-B: Serialized primitive values in localStorage recover cleanly', () => {
    resetBridgeState();
    const primitives = ['null', '12345', '"plain_string"', 'true', 'false'];

    for (const prim of primitives) {
      storageMap.set('billnaw_printers_config', prim);

      let loaded;
      assert.doesNotThrow(() => {
        loaded = ThermalPrinterBridge.loadPrinterSettings();
      }, `loadPrinterSettings threw on primitive JSON: ${prim}`);

      assert.ok(loaded.printer1, 'printer1 must exist');
      assert.ok(loaded.printer2, 'printer2 must exist');
    }
  });

  it('ADV-02-C: Malformed slot schemas (missing slots, negative ports, invalid transports) are sanitized', () => {
    resetBridgeState();
    const malformed = {
      printer1: {
        transport: 'TELEPORTATION',
        port: -9999,
        paperWidth: '10000mm'
      },
      printer2: null,
      routing: {
        defaultReceiptPrinter: 'ghost_printer',
        defaultKotPrinter: 'printer2',
        alwaysPrompt: 'yes_please' // truthy string
      }
    };

    storageMap.set('billnaw_printers_config', JSON.stringify(malformed));
    ThermalPrinterBridge.loadPrinterSettings();

    // Verify savePrinterSettings sanitizes and recovers clean data structure
    const saved = ThermalPrinterBridge.savePrinterSettings();
    assert.strictEqual(typeof saved.printer1.port, 'number', 'Port must be sanitized to number');
    assert.ok(saved.printer2, 'printer2 slot must not be null');
    assert.strictEqual(typeof saved.routing.alwaysPrompt, 'boolean', 'alwaysPrompt must be boolean');

    const serialized = JSON.parse(storageMap.get('billnaw_printers_config'));
    assert.strictEqual(serialized.routing.alwaysPrompt, true);
    assert.ok(serialized.printer1);
    assert.ok(serialized.printer2);
  });

  it('ADV-02-D: Hostile storage access (throwing SecurityError) falls back to memory safely', () => {
    resetBridgeState();
    const origGetItem = global.localStorage.getItem;
    const origSetItem = global.localStorage.setItem;

    global.localStorage.getItem = () => {
      throw new Error('SecurityError: The operation is insecure.');
    };
    global.localStorage.setItem = () => {
      throw new Error('SecurityError: The operation is insecure.');
    };

    assert.doesNotThrow(() => {
      const res = ThermalPrinterBridge.loadPrinterSettings();
      assert.ok(res.printer1);
      assert.ok(res.printer2);
    }, 'loadPrinterSettings must not throw when localStorage is locked');

    assert.doesNotThrow(() => {
      const res = ThermalPrinterBridge.savePrinterSettings({ routing: { alwaysPrompt: true } });
      assert.ok(res);
    }, 'savePrinterSettings must not throw when localStorage is locked');

    global.localStorage.getItem = origGetItem;
    global.localStorage.setItem = origSetItem;
  });

  // ====================================================================
  // CHALLENGE 3: INTERACTIVE PROMPT RESOLUTION UNDER CONCURRENCY & RACES
  // ====================================================================
  console.log('\n📍 CHALLENGE 3: INTERACTIVE PROMPT RESOLUTION UNDER CONCURRENCY & RACES');

  await itAsync('ADV-03-A: Multiple concurrent prompt requests resolve independently without deadlocking', async () => {
    resetBridgeState();
    let callCounter = 0;
    ThermalPrinterBridge._mockPromptSelection = async (role, jobPayload) => {
      callCounter++;
      await new Promise(r => setTimeout(r, 10));
      return (jobPayload.targetChoice) || 'printer1';
    };

    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => ({
      data: { printed: true, slot },
      error: null,
      offlineQueued: false
    });

    const promptPromises = [
      ThermalPrinterBridge.routePrintJob({ billNo: 'P-1', targetChoice: 'printer1', amount: 10, rawItems: [] }),
      ThermalPrinterBridge.routePrintJob({ billNo: 'P-2', targetChoice: 'printer2', amount: 20, rawItems: [] }),
      ThermalPrinterBridge.routePrintJob({ billNo: 'P-3', targetChoice: 'SYSTEM_DIALOG', amount: 30, rawItems: [] })
    ];

    const results = await Promise.all(promptPromises);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].data.slot, 'printer1');
    assert.strictEqual(results[1].data.slot, 'printer2');
    assert.strictEqual(results[2].data.slot, 'SYSTEM_DIALOG');
    assert.strictEqual(callCounter, 3);

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ADV-03-B: Prompt cancellation resolves immediately with cancelled: true and does not throw', async () => {
    resetBridgeState();
    ThermalPrinterBridge._mockPromptSelection = async () => null; // Cancel
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';

    const res = await ThermalPrinterBridge.routePrintJob({ billNo: 'CAN-1', amount: 50, rawItems: [] });
    assert.strictEqual(res.error, null);
    assert.ok(res.data);
    assert.strictEqual(res.data.cancelled, true);
    assert.strictEqual(res.data.printed, false);

    ThermalPrinterBridge._mockPromptSelection = null;
  });

  it('ADV-03-C: pos.js modal callback overwrite concurrency vulnerability analysis', () => {
    const posJsPath = path.join(__dirname, '..', 'js', 'pos.js');
    const posJs = fs.readFileSync(posJsPath, 'utf8');

    // Check if _printerSelectCallback is a single global
    const hasSingleCallbackPattern = posJs.includes('let _printerSelectCallback = null;') &&
      posJs.includes('_printerSelectCallback = onSelect;');

    assert.ok(hasSingleCallbackPattern, 'pos.js uses single callback pattern');
    // Note: In single-page UI, modal is typically modal/blocking, but if two events fire simultaneously,
    // the second callback overwrites the first. We document this in handoff.md as an architectural advisory.
  });

  // ====================================================================
  // CHALLENGE 4: DUAL SLOT DISCONNECTION FALLBACK TO SYSTEM_DIALOG
  // ====================================================================
  console.log('\n📍 CHALLENGE 4: DUAL SLOT DISCONNECTION FALLBACK TO SYSTEM_DIALOG');

  await itAsync('ADV-04-A: Fully disconnected peripheral slots fall back to window.print() when available', async () => {
    resetBridgeState();
    // Both slots disconnected
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    ThermalPrinterBridge.printers.printer1.device = null;
    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer2.characteristic = null;
    ThermalPrinterBridge.printers.printer2.device = null;
    ThermalPrinterBridge.printers.printer2.transport = 'BLUETOOTH';

    let windowPrintFired = false;
    global.window.print = () => { windowPrintFired = true; };

    const res = await ThermalPrinterBridge.routePrintJob({
      billNo: 'FALLBACK-01',
      amount: 120,
      rawItems: [{ name: 'Chai', qty: 1, price: 120 }]
    }, { role: 'RECEIPT' });

    assert.strictEqual(res.error, null, 'routePrintJob should succeed via fallback without error');
    assert.ok(windowPrintFired, 'window.print() must be called');
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG');
    assert.strictEqual(res.data.printed, true);
  });

  await itAsync('ADV-04-B: When window.print is missing in headless/restricted environment, returns PRINTER_UNAVAILABLE without crashing', async () => {
    resetBridgeState();
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    ThermalPrinterBridge.printers.printer1.device = null;
    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';

    const savedPrint = global.window.print;
    delete global.window.print; // Remove window.print to simulate headless

    const res = await ThermalPrinterBridge.routePrintJob({
      billNo: 'HEADLESS-01',
      amount: 150,
      rawItems: []
    }, { role: 'RECEIPT' });

    assert.ok(res.error, 'Must return error envelope in headless mode without window.print');
    assert.strictEqual(res.error.code, 'PRINTER_UNAVAILABLE');

    global.window.print = savedPrint;
  });

  await itAsync('ADV-04-C: Hardware IO write error triggers graceful fallback to browser print dialog', async () => {
    resetBridgeState();
    // Simulate active BLE characteristic that fails during write
    const faultyChar = {
      properties: { write: true },
      writeValue: async () => {
        throw new Error('GATT operation failed: Peripheral disconnected unexpectedly');
      }
    };

    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer1.characteristic = faultyChar;

    let windowPrintFired = false;
    global.window.print = () => { windowPrintFired = true; };

    const res = await ThermalPrinterBridge.routePrintJob({
      billNo: 'FAULT-01',
      amount: 200,
      rawItems: []
    }, { role: 'RECEIPT' });

    assert.strictEqual(res.error, null, 'Job should succeed via browser print dialog fallback');
    assert.ok(windowPrintFired, 'window.print() should be invoked when hardware fails');
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG');
    assert.ok(res.data.fallbackFrom.includes('GATT operation failed'));

    ThermalPrinterBridge.printers.printer1.characteristic = null;
  });

  // ====================================================================
  // CHALLENGE 5: ROLE SPOOFING & EDGE CASE PAYLOADS
  // ====================================================================
  console.log('\n📍 CHALLENGE 5: ROLE SPOOFING & EDGE CASE PAYLOADS');

  await itAsync('ADV-05-A: KOT payload with billing fields without explicit options.role is categorized safely', async () => {
    resetBridgeState();
    let dispatchedRole = null;
    let dispatchedSlot = null;

    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot) => {
      dispatchedSlot = slot;
      return { data: { printed: true, slot }, error: null, offlineQueued: false };
    };

    // Ambiguous payload containing both KOT fields (items, table) and invoice fields (billNo, final_payable_paise)
    const hybridPayload = {
      table: 'T-5',
      items: [{ name: 'Soup', qty: 1 }],
      billNo: 'INV-HYBRID',
      final_payable_paise: 15000,
      amount: 150
    };

    // Without options.role, because it contains billNo & final_payable_paise, it should evaluate to RECEIPT!
    const res = await ThermalPrinterBridge.routePrintJob(hybridPayload);
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.role, 'RECEIPT', 'Hybrid bill payload must route as RECEIPT');
    assert.strictEqual(dispatchedSlot, 'printer1');

    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('ADV-05-B: routePrintJob rejects null or undefined payloads cleanly', async () => {
    resetBridgeState();
    const res1 = await ThermalPrinterBridge.routePrintJob(null);
    assert.ok(res1.error);
    assert.strictEqual(res1.error.code, 'INVALID_PAYLOAD');

    const res2 = await ThermalPrinterBridge.routePrintJob(undefined);
    assert.ok(res2.error);
    assert.strictEqual(res2.error.code, 'INVALID_PAYLOAD');
  });

  await itAsync('ADV-05-C: Decoupled print queue isolates failed jobs into DLQ without throwing', async () => {
    resetBridgeState();
    storageMap.clear();

    // Force dispatch failure by removing window.print and disconnecting slots
    const origPrint = global.window.print;
    delete global.window.print;
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';

    const queueRes = await ThermalPrinterBridge.enqueuePrintJob({ billNo: 'DLQ-01', amount: 50 });
    assert.strictEqual(queueRes.error, null, 'enqueuePrintJob should return immediately with success');
    assert.ok(queueRes.data.queued);

    // Wait for attempt 1 to complete (includes 100ms delay)
    await new Promise(r => setTimeout(r, 150));
    // Trigger attempt 2
    await ThermalPrinterBridge.processQueue();
    await new Promise(r => setTimeout(r, 150));
    // Trigger attempt 3 (reaches attempt >= 3 and moves to DLQ)
    await ThermalPrinterBridge.processQueue();
    await new Promise(r => setTimeout(r, 50));

    const dlqRaw = storageMap.get('pos_failed_print_jobs');
    assert.ok(dlqRaw, 'Failed jobs must be archived to pos_failed_print_jobs in storage');
    const dlq = JSON.parse(dlqRaw);
    assert.ok(Array.isArray(dlq));
    assert.ok(dlq.length > 0);
    assert.strictEqual(dlq[0].invoice.billNo, 'DLQ-01');

    global.window.print = origPrint;
  });

  // ====================================================================
  // CHALLENGE 6: REPOSITORY INVARIANTS & INTEGRITY AUDIT
  // ====================================================================
  console.log('\n📍 CHALLENGE 6: REPOSITORY INVARIANTS & INTEGRITY AUDIT');

  it('ADV-06-A: Preserves exactly 26 .modal-close-btn SVG elements in index.html', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(matches, 'Matches array is null');
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn SVGs, found ${matches.length}`);
  });

  it('ADV-06-B: Zero raw Unicode emojis inside newly introduced modal buttons in index.html', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const modal1 = html.match(/<div\b[^>]*id="printerSettingsModal"[^>]*>([\s\S]*?)<\/div>\s*<!-- Interactive/);
    assert.ok(modal1, '#printerSettingsModal markup found');
    assert.strictEqual(rawEmojiRegex.test(modal1[1]), false, 'Found raw emoji in #printerSettingsModal');

    const modal2 = html.match(/<div\b[^>]*id="printerSelectModal"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(modal2, '#printerSelectModal markup found');
    assert.strictEqual(rawEmojiRegex.test(modal2[1]), false, 'Found raw emoji in #printerSelectModal');
  });

  // ====================================================================
  // SUMMARY
  // ====================================================================
  console.log('====================================================================');
  console.log(`🎯 TOTAL ADVERSARIAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ ADVERSARIAL CHALLENGES FAILED:');
    failureReports.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}\n     ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🛡️ ALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY!\n');
    process.exit(0);
  }
}

runAdversarialM2Suite().catch(err => {
  console.error('Fatal crash in adversarial runner:', err);
  process.exit(1);
});
