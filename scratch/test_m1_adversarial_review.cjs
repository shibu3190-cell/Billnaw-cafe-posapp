// scratch/test_m1_adversarial_review.cjs
// Adversarial Review & Edge Case Stress-Testing for Milestone 1

const assert = require('assert');
const net = require('net');

async function runAdversarialSuite() {
  console.log('====================================================');
  console.log('⚡ ADVERSARIAL STRESS TEST SUITE: MILESTONE 1 PRINTERS');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;
  const failures = [];

  function it(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failures.push({ name, error: e.message });
    }
  }

  async function itAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failures.push({ name, error: e.message });
    }
  }

  const {
    ThermalPrinterBridge,
    BLE_PRINTER_SERVICE_UUIDS,
    discoverWritableGattCharacteristic,
    writeBleEscPosChunks
  } = await import('../src/core/platform-bridge.js');

  // ---------------------------------------------------------
  // TEST GROUP 1: UART Pacing & Microcontroller Overflow Edge Cases
  // ---------------------------------------------------------
  console.log('📍 STRESS 1: UART CHUNKING BOUNDARY CONDITIONS');

  await itAsync('ADV-UART-01: Zero-byte and null payloads handle gracefully without throwing', async () => {
    let callCount = 0;
    const dummyChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { callCount++; }
    };
    await writeBleEscPosChunks(dummyChar, new Uint8Array(0));
    await writeBleEscPosChunks(dummyChar, null);
    await writeBleEscPosChunks(null, new Uint8Array(50));
    assert.strictEqual(callCount, 0, 'No write should happen for empty or null payloads');
  });

  await itAsync('ADV-UART-02: Exactly 100-byte boundary triggers exactly 1 chunk with zero unnecessary delays', async () => {
    const chunks = [];
    const dummyChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(c) { chunks.push(c); }
    };
    const payload100 = new Uint8Array(100).fill(0x55);
    const start = Date.now();
    await writeBleEscPosChunks(dummyChar, payload100);
    const elapsed = Date.now() - start;

    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].length, 100);
    assert.ok(elapsed < 20, `Single 100-byte chunk should not delay (took ${elapsed}ms)`);
  });

  await itAsync('ADV-UART-03: Exactly 101-byte boundary produces 2 chunks (100 and 1) with exactly 1 inter-chunk delay', async () => {
    const chunks = [];
    const dummyChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(c) { chunks.push(c); }
    };
    const payload101 = new Uint8Array(101).fill(0x55);
    const start = Date.now();
    await writeBleEscPosChunks(dummyChar, payload101);
    const elapsed = Date.now() - start;

    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].length, 100);
    assert.strictEqual(chunks[1].length, 1);
    assert.ok(elapsed >= 20, `101 bytes must include inter-chunk delay (took ${elapsed}ms)`);
  });

  await itAsync('ADV-UART-04: Characteristic with only writeValue (write with response) is correctly utilized', async () => {
    const chunks = [];
    const legacyChar = {
      properties: { write: true, writeWithoutResponse: false },
      async writeValue(c) { chunks.push(c); }
    };
    const payload = new Uint8Array(150).fill(0xAA);
    await writeBleEscPosChunks(legacyChar, payload);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].length, 100);
    assert.strictEqual(chunks[1].length, 50);
  });

  // ---------------------------------------------------------
  // TEST GROUP 2: Web Serial Stream Locking & Error Recovery
  // ---------------------------------------------------------
  console.log('\n📍 STRESS 2: WEB SERIAL STREAM LOCK & REJECTION PATHS');

  await itAsync('ADV-SER-01: printToSerial releases lock even when writer.write() rejects', async () => {
    let lockReleased = false;
    let writeAttempted = false;

    const failingSerialPort = {
      writable: {
        getWriter() {
          return {
            async write() {
              writeAttempted = true;
              throw new Error('Hardware I/O UART bus error');
            },
            releaseLock() {
              lockReleased = true;
            }
          };
        }
      }
    };

    let caughtError = null;
    try {
      await ThermalPrinterBridge.printToSerial(failingSerialPort, new Uint8Array([1, 2, 3]));
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError, 'Expected error to be thrown');
    assert.ok(writeAttempted, 'Write must have been attempted');
    assert.strictEqual(lockReleased, true, 'CRITICAL: releaseLock() MUST be called in finally block even on error!');
  });

  await itAsync('ADV-SER-02: printToSerial throws meaningful error on unwritable or null port', async () => {
    let err1 = null;
    try {
      await ThermalPrinterBridge.printToSerial(null, new Uint8Array([1]));
    } catch (e) { err1 = e; }
    assert.ok(err1 && err1.message.includes('not connected or writable'));

    let err2 = null;
    try {
      await ThermalPrinterBridge.printToSerial({ writable: null }, new Uint8Array([1]));
    } catch (e) { err2 = e; }
    assert.ok(err2 && err2.message.includes('not connected or writable'));
  });

  // ---------------------------------------------------------
  // TEST GROUP 3: WebUSB Dynamic Endpoint Traversal & Fallback
  // ---------------------------------------------------------
  console.log('\n📍 STRESS 3: WEBUSB MULTI-INTERFACE & FALLBACK');

  await itAsync('ADV-USB-01: Finds Bulk OUT on Interface 1 when Interface 0 is non-printing control interface', async () => {
    const multiIfaceDevice = {
      productName: 'Multi-Interface POS Printer',
      configuration: {
        interfaces: [
          {
            interfaceNumber: 0, // Control interface with no OUT endpoints
            alternates: [{ endpoints: [{ endpointNumber: 1, direction: 'in', type: 'interrupt' }] }]
          },
          {
            interfaceNumber: 1, // Printer interface
            alternates: [{
              endpoints: [
                { endpointNumber: 2, direction: 'in', type: 'bulk' },
                { endpointNumber: 3, direction: 'out', type: 'bulk' } // Bulk OUT is on ep 3
              ]
            }]
          }
        ]
      },
      claimedIface: null,
      async open() {},
      async selectConfiguration() {},
      async claimInterface(n) { this.claimedIface = n; }
    };

    navigator.usb = {
      requestDevice: async () => multiIfaceDevice,
      addEventListener: () => {}
    };

    const res = await ThermalPrinterBridge.connectUsbPrinter('printer2');
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.endpointNumber, 3);
    assert.strictEqual(res.data.interfaceNumber, 1);
    assert.strictEqual(multiIfaceDevice.claimedIface, 1);
  });

  await itAsync('ADV-USB-02: Safe fallback to interface 0 and endpoint 1 when device exposes non-standard descriptors', async () => {
    const emptyDescDevice = {
      productName: 'Generic USB Device',
      configuration: { interfaces: [] },
      claimedIface: null,
      async open() {},
      async selectConfiguration() {},
      async claimInterface(n) { this.claimedIface = n; }
    };

    navigator.usb = {
      requestDevice: async () => emptyDescDevice,
      addEventListener: () => {}
    };

    const res = await ThermalPrinterBridge.connectUsbPrinter('printer1');
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.endpointNumber, 1);
    assert.strictEqual(res.data.interfaceNumber, 0);
  });

  // ---------------------------------------------------------
  // TEST GROUP 4: Server TCP Proxy Adversarial Attacks
  // ---------------------------------------------------------
  console.log('\n📍 STRESS 4: SERVER TCP PROXY MALFORMED REQUESTS & TIMEOUT');

  await itAsync('ADV-NET-01: Rejects missing host, invalid port, and empty/non-byte payloads with HTTP 400', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = await import('../server.js');
    const expressServer = app.listen(0);
    const port = expressServer.address().port;
    const url = `http://127.0.0.1:${port}/api/print/network`;

    try {
      // Missing host
      const r1 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 9100, data: [1, 2] })
      });
      assert.strictEqual(r1.status, 400);

      // Port out of bounds (99999)
      const r2 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '127.0.0.1', port: 99999, data: [1, 2] })
      });
      assert.strictEqual(r2.status, 400);

      // Empty payload array
      const r3 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '127.0.0.1', port: 9100, data: [] })
      });
      assert.strictEqual(r3.status, 400);

      // Null payload
      const r4 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '127.0.0.1', port: 9100, data: null })
      });
      assert.strictEqual(r4.status, 400);

      // Non-existent target IP connection error -> returns HTTP 500 without crashing server
      const r5 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '127.0.0.1', port: 65432, data: [27, 64] })
      });
      assert.strictEqual(r5.status, 500);
      const json5 = await r5.json();
      assert.strictEqual(json5.success, false);
      assert.ok(json5.error.includes('error'));
    } finally {
      expressServer.close();
    }
  });

  // ---------------------------------------------------------
  // TEST GROUP 5: Backwards Compatibility & Slot Decoupling
  // ---------------------------------------------------------
  console.log('\n📍 STRESS 5: BACKWARDS COMPATIBILITY & DUAL-SLOT INTEGRITY');

  it('ADV-BACK-01: Legacy activeBluetoothDevice / activeCharacteristic setters update printer1 without polluting printer2', () => {
    const mockDev = { name: 'LegacyDev' };
    const mockChar = { uuid: 'char-1' };

    // Reset slots
    ThermalPrinterBridge.printers.printer1.device = null;
    ThermalPrinterBridge.printers.printer1.characteristic = null;
    ThermalPrinterBridge.printers.printer2.device = { name: 'KitchenDev' };
    ThermalPrinterBridge.printers.printer2.characteristic = { uuid: 'kitchen-char' };

    ThermalPrinterBridge.activeBluetoothDevice = mockDev;
    ThermalPrinterBridge.activeCharacteristic = mockChar;

    assert.strictEqual(ThermalPrinterBridge.printers.printer1.device, mockDev);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, mockChar);
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.device.name, 'KitchenDev');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.characteristic.uuid, 'kitchen-char');
  });

  await itAsync('ADV-CROSS-01: Printer 1 dispatch must NOT cross-talk to Printer 2 characteristic when Printer 1 is SYSTEM_DIALOG', async () => {
    let windowPrintCalled = false;
    global.window = {
      print: () => { windowPrintCalled = true; }
    };

    // Clean legacy active pointers
    ThermalPrinterBridge._activeBluetoothDevice = null;
    ThermalPrinterBridge._activeCharacteristic = null;

    // Printer 1 is set to SYSTEM_DIALOG and has no characteristic
    ThermalPrinterBridge.printers.printer1.transport = 'SYSTEM_DIALOG';
    ThermalPrinterBridge.printers.printer1.device = null;
    ThermalPrinterBridge.printers.printer1.characteristic = null;

    // Printer 2 has active Kitchen characteristic
    let kitchenBleWritten = false;
    ThermalPrinterBridge.printers.printer2.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer2.characteristic = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { kitchenBleWritten = true; }
    };

    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', new Uint8Array([0x1B, 0x40]));
    
    // Invariant: Receipt dispatched to printer1 must invoke BROWSER_DIALOG and NOT write to printer2 BLE!
    assert.strictEqual(kitchenBleWritten, false, 'CRITICAL BUG: printer1 dispatch must NOT write to printer2 characteristic!');
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG', 'printer1 with SYSTEM_DIALOG transport must use BROWSER_DIALOG');
    assert.strictEqual(windowPrintCalled, true, 'window.print() must have been called');
  });

  await itAsync('ADV-FALLBACK-01: Hardware error during Bluetooth dispatch must gracefully fall back to BROWSER_DIALOG', async () => {
    let windowPrintCalled = false;
    global.window = {
      print: () => { windowPrintCalled = true; }
    };

    ThermalPrinterBridge._activeBluetoothDevice = null;
    ThermalPrinterBridge._activeCharacteristic = null;

    ThermalPrinterBridge.printers.printer1.transport = 'BLUETOOTH';
    ThermalPrinterBridge.printers.printer1.characteristic = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() {
        throw new Error('GATT Connection Timeout: Device out of range');
      }
    };

    // When Bluetooth transmission throws an unhandled exception, dispatchToPrinterSlot should catch it and fall back to BROWSER_DIALOG
    const res = await ThermalPrinterBridge.dispatchToPrinterSlot('printer1', new Uint8Array([0x1B, 0x40]));
    assert.strictEqual(res.data.method, 'BROWSER_DIALOG', 'Must fall back to BROWSER_DIALOG on GATT transmission error');
    assert.strictEqual(windowPrintCalled, true, 'window.print() must be called on fallback');
  });

  console.log(`\n====================================================`);
  console.log(`🎯 TOTAL ADVERSARIAL SUITE: ${passed} PASSED, ${failures.length} FAILED (TOTAL: ${total})`);
  console.log(`====================================================\n`);

  if (failures.length > 0) {
    console.log('Documented Failures for Worker Resolution:');
    failures.forEach((f, idx) => console.log(`  ${idx + 1}. [${f.name}]: ${f.error}`));
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Adversarial suite failure:', err);
  process.exit(1);
});
