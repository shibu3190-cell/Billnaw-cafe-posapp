// scratch/test_adversarial_m1_hardware.cjs
// Empirical Adversarial Stress Test Suite for Milestone 1 Hardware Bridge
// Demonstrates confirmed failure modes and verified resilient areas.

const assert = require('assert');
const net = require('net');

async function runAdversarialHardwareSuite() {
  console.log('====================================================================');
  console.log('⚔️  ADVERSARIAL HARDWARE STRESS & CONCURRENCY TEST SUITE (M1)');
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
    console.error(`  ❌ FAIL (CONFIRMED DEFECT): ${name}\n     -> ${err.message}`);
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
    BLE_PRINTER_SERVICE_UUIDS,
    discoverWritableGattCharacteristic,
    writeBleEscPosChunks
  } = await import('../src/core/platform-bridge.js');

  // ============================================================================
  // SECTION 1: CONFIRMED DEFECT REPRODUCTIONS
  // ============================================================================
  console.log('📍 SECTION 1: ADVERSARIAL FAILURE MODE REPRODUCTIONS');

  // BUG 1: Cross-Slot Print Bleed / Contamination
  try {
    let p2Writes = 0;
    const p2Char = {
      uuid: 'kitchen-ble-char',
      properties: { writeWithoutResponse: true },
      writeValueWithoutResponse: async () => { p2Writes++; }
    };

    // Slot 1 is USB, currently DISCONNECTED (e.g. cable unplugged)
    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'Counter USB Receipt',
      transport: 'USB',
      paperWidth: '80mm',
      role: 'RECEIPT',
      status: 'DISCONNECTED',
      device: null,
      characteristic: null
    };

    // Slot 2 is Kitchen BLE, CONNECTED
    ThermalPrinterBridge.printers.printer2 = {
      id: 'printer2',
      name: 'Kitchen BLE',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'CONNECTED',
      device: { name: 'Kitchen BLE' },
      characteristic: p2Char
    };
    ThermalPrinterBridge._activeCharacteristic = null;
    ThermalPrinterBridge._activeBluetoothDevice = null;

    // Cashier attempts to print receipt to printer1
    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', new Uint8Array([0x1B, 0x40, 0x52]));

    // Adversarial assertion: Printer 1 is a disconnected USB printer. It MUST NOT send bytes to Printer 2 BLE!
    if (p2Writes > 0) {
      throw new Error(`CRITICAL: Disconnected USB printer1 bled print job to BLE printer2! (p2Writes=${p2Writes}, method=${res.data?.method})`);
    }
    recordPass('DEFECT-01-GUARD: Disconnected printer1 does not bleed to printer2');
  } catch (e) {
    recordFail('DEFECT-01: Cross-slot bleed - Disconnected USB printer1 bleeds print payload to kitchen BLE printer2', e);
  }

  // BUG 2: Composite WebUSB Endpoint Discovery
  try {
    let claimedIface = null;
    const mockCompositeDevice = {
      productName: 'Multi-Function POS Terminal',
      configuration: {
        interfaces: [
          {
            // Interface 0: Scanner HID
            interfaceNumber: 0,
            alternates: [{ endpoints: [{ endpointNumber: 1, direction: 'in', type: 'interrupt' }] }]
          },
          {
            // Interface 1: Audio speaker (Isochronous OUT)
            interfaceNumber: 1,
            alternates: [{ endpoints: [{ endpointNumber: 2, direction: 'out', type: 'isochronous' }] }]
          },
          {
            // Interface 2: Class 7 Thermal Printer (Bulk OUT)
            interfaceNumber: 2,
            alternates: [{
              endpoints: [
                { endpointNumber: 3, direction: 'in', type: 'bulk' },
                { endpointNumber: 4, direction: 'out', type: 'bulk' } // TARGET
              ]
            }]
          }
        ]
      },
      open: async () => {},
      claimInterface: async (n) => { claimedIface = n; }
    };

    navigator.usb = {
      requestDevice: async () => mockCompositeDevice,
      addEventListener: () => {}
    };

    const res = await ThermalPrinterBridge.connectUsbPrinter('printer1');
    if (res.data.endpointNumber !== 4 || res.data.interfaceNumber !== 2) {
      throw new Error(`HIGH: Incorrect endpoint selected on composite device! Expected Interface 2 / EP 4 (bulk), got Interface ${res.data.interfaceNumber} / EP ${res.data.endpointNumber}`);
    }
    recordPass('DEFECT-02-GUARD: Composite device endpoint discovery prioritized bulk OUT on interface 2');
  } catch (e) {
    recordFail('DEFECT-02: Flawed WebUSB discovery - Non-bulk OUT on Interface 1 preempts bulk OUT on Interface 2', e);
  }

  // BUG 3: Silent Queue Drop on Disconnected / Error Result
  try {
    // Clear all printer connections
    ThermalPrinterBridge.printers.printer1.status = 'DISCONNECTED';
    ThermalPrinterBridge.printers.printer1.device = null;
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    ThermalPrinterBridge.printers.printer2.status = 'DISCONNECTED';
    ThermalPrinterBridge.printers.printer2.device = null;
    ThermalPrinterBridge.printers.printer2.characteristic = null;
    ThermalPrinterBridge._activeCharacteristic = null;
    ThermalPrinterBridge._activeBluetoothDevice = null;
    ThermalPrinterBridge._activeUsbDevice = null;

    storageMap.clear();
    ThermalPrinterBridge.printQueue = [];
    ThermalPrinterBridge.isProcessingQueue = false;

    // Window without window.print so dispatch returns errorResult('PRINTER_UNAVAILABLE')
    const originalPrint = global.window.print;
    delete global.window.print;

    const testInvoice = { bill_no: 'INV-QUEUE-TEST', amount: 150 };
    await ThermalPrinterBridge.enqueuePrintJob(testInvoice);
    await new Promise(r => setTimeout(r, 50));

    const dlqRaw = storageMap.get('pos_failed_print_jobs');
    const dlq = dlqRaw ? JSON.parse(dlqRaw) : [];

    // The job should NOT have been dequeued without retry or DLQ preservation
    if (ThermalPrinterBridge.printQueue.length === 0 && dlq.length === 0) {
      throw new Error(`HIGH: Print job was silently dequeued and lost when printReceipt returned errorResult('PRINTER_UNAVAILABLE')!`);
    }

    if (originalPrint) global.window.print = originalPrint;
    recordPass('DEFECT-03-GUARD: Print queue preserves failed job in queue or moves to DLQ');
  } catch (e) {
    recordFail('DEFECT-03: Silent job loss - processQueue discards unprinted jobs on ServiceResult error without retry/DLQ', e);
  }

  // BUG 4: Stale _activeCharacteristic Retention on disconnectPrinter
  try {
    const dummyChar = { uuid: 'stale-test-char', properties: { writeWithoutResponse: true } };
    const dummyDev = { name: 'BLE-Stale', gatt: { disconnect: () => {} } };

    ThermalPrinterBridge.printers.printer1.device = dummyDev;
    ThermalPrinterBridge.printers.printer1.characteristic = dummyChar;
    ThermalPrinterBridge.activeBluetoothDevice = dummyDev;
    ThermalPrinterBridge.activeCharacteristic = dummyChar;

    await ThermalPrinterBridge.disconnectPrinter('printer1');

    if (ThermalPrinterBridge.activeCharacteristic !== null || ThermalPrinterBridge._activeCharacteristic !== null) {
      throw new Error(`MEDIUM: disconnectPrinter('printer1') did not clear activeCharacteristic or _activeCharacteristic (still points to ${ThermalPrinterBridge._activeCharacteristic?.uuid})`);
    }
    recordPass('DEFECT-04-GUARD: disconnectPrinter clears activeCharacteristic');
  } catch (e) {
    recordFail('DEFECT-04: Stale reference retention - disconnectPrinter does not nullify activeCharacteristic / _activeCharacteristic', e);
  }

  // ============================================================================
  // SECTION 2: VERIFIED RESILIENT SUBSYSTEMS
  // ============================================================================
  console.log('\n📍 SECTION 2: VERIFIED RESILIENT SUBSYSTEMS');

  // Resilient Test 1: In-order BLE chunk pacing under variable delay
  try {
    const receivedChunks = [];
    const simulatedChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(chunk) {
        await new Promise(r => setTimeout(r, 15 + Math.floor(Math.random() * 20)));
        receivedChunks.push(Array.from(chunk));
      }
    };

    const sourceBytes = new Uint8Array(450);
    for (let i = 0; i < sourceBytes.length; i++) sourceBytes[i] = i % 256;

    await writeBleEscPosChunks(simulatedChar, sourceBytes);
    assert.strictEqual(receivedChunks.length, 5);
    const flatReceived = [].concat(...receivedChunks);
    assert.deepStrictEqual(flatReceived, Array.from(sourceBytes));
    recordPass('RES-01: In-order BLE chunk pacing with delayed acknowledgments (100-byte chunks)');
  } catch (e) {
    recordFail('RES-01: In-order BLE chunk pacing', e);
  }

  // Resilient Test 2: Clean error propagation on mid-stream BLE failure
  try {
    let chunksWritten = 0;
    const failingChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(chunk) {
        chunksWritten++;
        if (chunksWritten === 2) throw new Error('BLE_DROPPED_PACKET');
      }
    };
    let threw = false;
    try {
      await writeBleEscPosChunks(failingChar, new Uint8Array(300));
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true);
    assert.strictEqual(chunksWritten, 2);
    recordPass('RES-02: Clean error propagation on mid-stream BLE packet drop');
  } catch (e) {
    recordFail('RES-02: Clean error propagation on mid-stream BLE packet drop', e);
  }

  // Resilient Test 3: WebUSB multi-chunk transfer (>4096 bytes)
  try {
    const transferSizes = [];
    const mockTransferDevice = {
      async transferOut(ep, chunk) {
        transferSizes.push(chunk.length);
        return { status: 'ok', bytesWritten: chunk.length };
      }
    };

    ThermalPrinterBridge.printers.printer1 = {
      id: 'printer1',
      name: 'USB Chunky',
      transport: 'USB',
      status: 'CONNECTED',
      device: mockTransferDevice,
      endpointNumber: 2
    };

    const hugeBytes = new Uint8Array(10000);
    await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', hugeBytes);
    assert.strictEqual(transferSizes.length, 3);
    assert.strictEqual(transferSizes[0], 4096);
    assert.strictEqual(transferSizes[1], 4096);
    assert.strictEqual(transferSizes[2], 1808);
    recordPass('RES-03: WebUSB multi-chunk transfer (>4096 bytes segmented into 4KB transfers)');
  } catch (e) {
    recordFail('RES-03: WebUSB multi-chunk transfer', e);
  }

  // Resilient Test 4: High-concurrency network TCP proxy burst (15 concurrent connections)
  try {
    process.env.NODE_ENV = 'test';
    const { app } = await import('../server.js');

    const receivedPackets = [];
    const tcpServer = net.createServer((sock) => {
      sock.on('data', (d) => receivedPackets.push(d));
    });
    await new Promise(r => tcpServer.listen(0, '127.0.0.1', r));
    const tcpPort = tcpServer.address().port;

    const expressServer = app.listen(0);
    const expressPort = expressServer.address().port;

    try {
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          fetch(`http://127.0.0.1:${expressPort}/api/print/network`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              host: '127.0.0.1',
              port: tcpPort,
              data: [0x1B, 0x40, i, 0x0A]
            })
          }).then(r => r.json())
        );
      }
      const results = await Promise.all(promises);
      for (const res of results) {
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.bytesWritten, 4);
      }
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(receivedPackets.length, 15);
      recordPass('RES-04: High-concurrency network TCP proxy burst (15 concurrent print requests)');
    } finally {
      expressServer.close();
      tcpServer.close();
    }
  } catch (e) {
    recordFail('RES-04: High-concurrency network TCP proxy burst', e);
  }

  // Resilient Test 5: Network proxy closed-port refusal
  try {
    process.env.NODE_ENV = 'test';
    const { app } = await import('../server.js');
    const expressServer = app.listen(0);
    const expressPort = expressServer.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${expressPort}/api/print/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: 59992,
          data: [0x1B, 0x40]
        })
      });
      assert.strictEqual(res.status, 500);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      recordPass('RES-05: Network proxy closed-port connection error handled gracefully with HTTP 500');
    } finally {
      expressServer.close();
    }
  } catch (e) {
    recordFail('RES-05: Network proxy closed-port refusal', e);
  }

  console.log(`\n====================================================================`);
  console.log(`🎯 TOTAL AUDIT: ${passed} PASSED, ${failed} DEFECTS CONFIRMED (TOTAL: ${total})`);
  console.log(`====================================================================\n`);

  if (failureReports.length > 0) {
    console.log('📋 SUMMARY OF CONFIRMED DEFECTS:');
    failureReports.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.name}]: ${f.error}`);
    });
    console.log('\n❌ EMPIRICAL VERDICT: REQUEST_CHANGES\n');
  } else {
    console.log('\n✅ EMPIRICAL VERDICT: APPROVE\n');
  }

  return { passed, failed, total, failureReports };
}

runAdversarialHardwareSuite().catch(e => {
  console.error('Adversarial Test Suite Fatal Error:', e);
  process.exit(1);
});
