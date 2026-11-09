// scratch/test_adversarial_inflight_disconnect.cjs
// Empirical Adversarial Stress Test: In-flight Disconnect & Slot Isolation
// Specifically verifies: Disconnecting Printer 1 while a print job is in-flight
// guarantees Printer 2 is NEVER written to, corrupted, or cross-talked.

const assert = require('assert');

async function runInflightDisconnectAdversarialSuite() {
  console.log('====================================================================');
  console.log('⚔️  ADVERSARIAL STRESS TEST: IN-FLIGHT DISCONNECT & SLOT ISOLATION');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  let total = 0;
  const failureReports = [];

  function recordPass(name) {
    total++;
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  }

  function recordFail(name, err) {
    total++;
    failed++;
    console.error(`  ❌ FAIL: ${name}\n     -> ${err.message}`);
    failureReports.push({ name, error: err.message });
  }

  // Setup DOM & Storage Globals
  const storageMap = new Map();
  global.localStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  const windowListeners = new Map();
  global.window = {
    addEventListener: (ev, fn) => {
      if (!windowListeners.has(ev)) windowListeners.set(ev, []);
      windowListeners.get(ev).push(fn);
    },
    removeEventListener: (ev, fn) => {
      if (windowListeners.has(ev)) {
        windowListeners.set(ev, windowListeners.get(ev).filter(f => f !== fn));
      }
    },
    dispatchEvent: (ev) => {
      const list = windowListeners.get(ev.type || ev.name) || [];
      for (const fn of list) fn(ev);
      return true;
    },
    posPrinters: {}
  };
  global.CustomEvent = class CustomEvent {
    constructor(name, opts = {}) {
      this.name = name;
      this.type = name;
      this.detail = opts.detail || {};
    }
  };

  // Import Platform Bridge
  const {
    ThermalPrinterBridge,
    writeBleEscPosChunks
  } = await import('../src/core/platform-bridge.js');

  // ============================================================================
  // TEST 1: Disconnect Printer 1 (BLE) mid-flight during multi-chunk write
  // Assert: Printer 2 characteristic receives ZERO writes
  // ============================================================================
  try {
    let p1Writes = 0;
    let p2Writes = 0;
    const p2Chunks = [];

    // Printer 2 (Kitchen BLE) - Active and Healthy
    const p2Char = {
      uuid: 'kitchen-ble-char-uuid',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(chunk) {
        p2Writes++;
        p2Chunks.push(Array.from(chunk));
      }
    };
    const p2Device = { name: 'Kitchen Printer', gatt: { disconnect: () => {} } };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen Printer',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: p2Device,
      characteristic: p2Char
    };

    // Printer 1 (Receipt BLE) - Connected initially, but will be disconnected mid-flight
    let p1DisconnectTriggered = false;
    const p1Char = {
      uuid: 'receipt-ble-char-uuid',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(chunk) {
        p1Writes++;
        // On chunk 1, simulate transmission delay and trigger disconnectPrinter('printer1')
        if (p1Writes === 1) {
          await new Promise(r => setTimeout(r, 20));
          p1DisconnectTriggered = true;
          // Mid-flight disconnection happens right here!
          await ThermalPrinterBridge.disconnectPrinter('printer1');
        } else if (p1DisconnectTriggered) {
          // Once disconnected, subsequent writes on the old characteristic fail
          throw new Error('GATT Server Disconnected: Network connection lost');
        }
      }
    };
    const p1Device = { name: 'Receipt Printer', gatt: { disconnect: () => {} } };

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'Receipt Printer',
      transport: 'BLUETOOTH',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'CONNECTED',
      device: p1Device,
      characteristic: p1Char
    };

    // Prepare a 450-byte payload (would normally take 5 chunks of 100 bytes)
    const payload = new Uint8Array(450).fill(0xAA);

    // Provide a mocked window.print to observe if fallback activates
    let windowPrintCalls = 0;
    global.window.print = () => { windowPrintCalls++; };

    // Dispatch to Printer 1
    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', payload);

    // CRITICAL EMPIRICAL ASSERTIONS:
    // 1. Printer 2 MUST NEVER have received any writes!
    assert.strictEqual(p2Writes, 0, `CRITICAL VIOLATION: Printer 2 received ${p2Writes} writes during Printer 1 in-flight disconnect!`);
    assert.strictEqual(p2Chunks.length, 0, `CRITICAL VIOLATION: Printer 2 received data chunks during Printer 1 in-flight disconnect!`);

    // 2. Printer 1 slot status must be DISCONNECTED
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.status, 'DISCONNECTED', 'Printer 1 status must be DISCONNECTED');
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, null, 'Printer 1 characteristic must be null');

    // 3. Printer 2 slot status must remain CONNECTED and untouched
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.status, 'CONNECTED', 'Printer 2 status must remain CONNECTED');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.characteristic, p2Char, 'Printer 2 characteristic must remain intact');

    // 4. Dispatch caught error and did not throw uncaught exception, or fell back to browser print
    assert.ok(res && (res.data !== null || res.error !== null), 'Dispatch must return a valid ServiceResult envelope');
    if (res.data) {
      assert.strictEqual(res.data.method, 'BROWSER_DIALOG', 'Fallback must be BROWSER_DIALOG');
      assert.strictEqual(windowPrintCalls, 1, 'window.print must have been called on fallback');
    }

    recordPass('DISCONNECT-01: Disconnect Printer 1 mid-flight (BLE) -> Printer 2 writes strictly 0, Printer 2 remains CONNECTED');
  } catch (e) {
    recordFail('DISCONNECT-01: Disconnect Printer 1 mid-flight (BLE)', e);
  }

  // ============================================================================
  // TEST 2: Disconnect Printer 1 (WebUSB) mid-flight during multi-chunk transfer
  // Assert: Printer 2 characteristic receives ZERO writes
  // ============================================================================
  try {
    let p1UsbTransfers = 0;
    let p2UsbTransfers = 0;
    let p2BleWrites = 0;

    const p2BleChar = {
      uuid: 'kitchen-ble-char-uuid-2',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { p2BleWrites++; }
    };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen Printer',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: { name: 'Kitchen BLE' },
      characteristic: p2BleChar
    };

    const mockUsbDevice = {
      productName: 'USB Receipt Printer',
      async transferOut(ep, chunk) {
        p1UsbTransfers++;
        if (p1UsbTransfers === 1) {
          // First chunk succeeds
          return { status: 'ok', bytesWritten: chunk.length };
        }
        // Second chunk simulates cable pulled during transfer
        await ThermalPrinterBridge.disconnectPrinter('printer1');
        throw new Error('DOMException: The device was disconnected.');
      },
      close: async () => {}
    };

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'USB Receipt Printer',
      transport: 'USB',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'CONNECTED',
      device: mockUsbDevice,
      endpointNumber: 2
    };

    // 10,000 bytes requires 3 chunks (4096, 4096, 1808)
    const largePayload = new Uint8Array(10000).fill(0xBB);
    let printCalled = false;
    global.window.print = () => { printCalled = true; };

    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', largePayload);

    // CRITICAL ASSERTIONS:
    assert.strictEqual(p2BleWrites, 0, `CRITICAL: BLE Printer 2 received writes during USB Printer 1 disconnect!`);
    assert.strictEqual(p2UsbTransfers, 0, `CRITICAL: Printer 2 received USB transfers during Printer 1 disconnect!`);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.status, 'DISCONNECTED');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.status, 'CONNECTED');

    recordPass('DISCONNECT-02: Disconnect Printer 1 mid-flight (WebUSB) -> Printer 2 writes strictly 0');
  } catch (e) {
    recordFail('DISCONNECT-02: Disconnect Printer 1 mid-flight (WebUSB)', e);
  }

  // ============================================================================
  // TEST 3: Disconnect Printer 1 while background printQueue is actively draining
  // Assert: Job for Printer 1 does NOT print to Printer 2, and preserves queue/DLQ
  // ============================================================================
  try {
    let p2BleWrites = 0;
    const p2BleChar = {
      uuid: 'kitchen-ble-queue-test',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { p2BleWrites++; }
    };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen Printer',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: { name: 'Kitchen BLE' },
      characteristic: p2BleChar
    };

    let p1Started = false;
    let p1WriteCount = 0;
    const p1BleChar = {
      uuid: 'receipt-ble-queue-test',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() {
        p1WriteCount++;
        p1Started = true;
        // In the middle of printing, printer 1 powers off or disconnects
        await ThermalPrinterBridge.disconnectPrinter('printer1');
        throw new Error('GATT Connection Terminated by Remote Peripheral');
      }
    };

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'Receipt Printer',
      transport: 'BLUETOOTH',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'CONNECTED',
      device: { name: 'Receipt BLE', gatt: { disconnect: () => {} } },
      characteristic: p1BleChar
    };

    // Clear queue & remove window.print to prevent fallback suppression of error
    storageMap.clear();
    ThermalPrinterBridge.printQueue = [];
    ThermalPrinterBridge.isProcessingQueue = false;
    delete global.window.print;

    const testJob = {
      bill_no: 'INV-DISCONNECT-TEST-99',
      amount: 450,
      items: [{ name: 'Espresso', price: 150, quantity: 3 }]
    };

    await ThermalPrinterBridge.enqueuePrintJob(testJob, { printerSlot: 'printer1' });

    // Allow async queue processing
    await new Promise(r => setTimeout(r, 150));

    // Assert: Printer 2 received ZERO writes
    assert.strictEqual(p2BleWrites, 0, `CRITICAL: Printer 2 received ${p2BleWrites} writes during queue in-flight disconnect!`);
    
    // Assert: Printer 1 job was not silently lost (it is in queue or DLQ)
    const dlqRaw = storageMap.get('pos_failed_print_jobs');
    const dlq = dlqRaw ? JSON.parse(dlqRaw) : [];
    const inQueueOrDlq = (ThermalPrinterBridge.printQueue.length > 0) || (dlq.length > 0);
    assert.strictEqual(inQueueOrDlq, true, 'Job must be retained in printQueue or DLQ on in-flight disconnect');

    recordPass('DISCONNECT-03: In-flight queue processing disconnect on Printer 1 -> Printer 2 writes strictly 0, zero job loss');
  } catch (e) {
    recordFail('DISCONNECT-03: In-flight queue processing disconnect on Printer 1', e);
  }

  // ============================================================================
  // TEST 4: Concurrent printing on both slots, Printer 1 disconnects, Printer 2 succeeds
  // ============================================================================
  try {
    let p1WriteAttempts = 0;
    let p2SuccessfulWrites = 0;

    const p1BleChar = {
      uuid: 'p1-concurrent-char',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() {
        p1WriteAttempts++;
        // Simulate delay then disconnect
        await new Promise(r => setTimeout(r, 30));
        await ThermalPrinterBridge.disconnectPrinter('printer1');
        throw new Error('P1 Bluetooth Link Loss');
      }
    };

    const p2BleChar = {
      uuid: 'p2-concurrent-char',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() {
        // P2 finishes cleanly after slight pacing
        await new Promise(r => setTimeout(r, 60));
        p2SuccessfulWrites++;
      }
    };

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'Counter Receipt Printer',
      transport: 'BLUETOOTH',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'CONNECTED',
      device: { name: 'P1 BLE', gatt: { disconnect: () => {} } },
      characteristic: p1BleChar
    };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen KOT Printer',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: { name: 'P2 BLE', gatt: { disconnect: () => {} } },
      characteristic: p2BleChar
    };

    delete global.window.print;

    // Launch both jobs concurrently
    const p1Promise = ThermalPrinterBridge.dispatchToPrinterSlot('printer1', new Uint8Array([0x1B, 0x40, 0x31]));
    const p2Promise = ThermalPrinterBridge.dispatchToPrinterSlot('printer2', new Uint8Array([0x1B, 0x40, 0x32]));

    const [res1, res2] = await Promise.all([p1Promise, p2Promise]);

    // Assert: P2 succeeded independently despite P1 disconnecting concurrently
    assert.strictEqual(res2.error, null, 'Printer 2 must succeed concurrently without error');
    assert.strictEqual(res2.data?.printed, true, 'Printer 2 data.printed must be true');
    assert.strictEqual(p2SuccessfulWrites, 1, 'Printer 2 must have exactly 1 write');
    assert.strictEqual(res2.data.slot, 'printer2');

    // Assert: P1 reported error or handled its failure cleanly
    assert.ok(res1.error !== null, 'Printer 1 must fail due to mid-flight disconnect');
    assert.strictEqual(res1.error.code, 'WRITE_FAILED');

    // Assert: Printer 1 is DISCONNECTED, Printer 2 remains CONNECTED
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.status, 'DISCONNECTED');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.status, 'CONNECTED');

    recordPass('DISCONNECT-04: Concurrent dual-slot print: Printer 1 disconnects mid-flight, Printer 2 finishes 100% cleanly');
  } catch (e) {
    recordFail('DISCONNECT-04: Concurrent dual-slot print', e);
  }

  // ============================================================================
  // TEST 5: Subsequent job dispatched to Printer 1 after in-flight disconnect
  // Assert: Never falls back to Printer 2 characteristic
  // ============================================================================
  try {
    let p2BleWrites = 0;
    const p2BleChar = {
      uuid: 'p2-isolation-char',
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { p2BleWrites++; }
    };

    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen KOT Printer',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: { name: 'P2 BLE' },
      characteristic: p2BleChar
    };

    // Printer 1 is already disconnected from prior test
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.status, 'DISCONNECTED');
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, null);

    // Set fallback window.print
    let windowPrintInvoked = false;
    global.window.print = () => { windowPrintInvoked = true; };

    // Attempt to dispatch a new job to printer1
    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', new Uint8Array([0x1B, 0x40, 0x99]));

    // Assert: Printer 2 received ZERO writes
    assert.strictEqual(p2BleWrites, 0, `CRITICAL: Disconnected printer1 dispatched to printer2! (p2BleWrites=${p2BleWrites})`);
    assert.strictEqual(windowPrintInvoked, true, 'Should fall back to window.print()');
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG');

    recordPass('DISCONNECT-05: Post-disconnect dispatch to Printer 1 falls back to BROWSER_DIALOG without touching Printer 2');
  } catch (e) {
    recordFail('DISCONNECT-05: Post-disconnect dispatch to Printer 1', e);
  }

  console.log(`\n====================================================================`);
  console.log(`🎯 IN-FLIGHT DISCONNECT AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log(`====================================================================\n`);

  if (failureReports.length > 0) {
    console.log('📋 SUMMARY OF FAILURES:');
    failureReports.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.name}]: ${f.error}`);
    });
    console.log('\n❌ EMPIRICAL VERDICT: REQUEST_CHANGES\n');
  } else {
    console.log('\n✅ EMPIRICAL VERDICT: APPROVE\n');
  }

  return { passed, failed, total, failureReports };
}

runInflightDisconnectAdversarialSuite().catch(e => {
  console.error('Fatal Error:', e);
  process.exit(1);
});
