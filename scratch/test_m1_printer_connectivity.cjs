// scratch/test_m1_printer_connectivity.cjs
// Verification suite for Milestone 1: Universal Thermal Printer Connectivity

const assert = require('assert');
const net = require('net');

async function runM1Suite() {
  console.log('====================================================');
  console.log('🖨️  MILESTONE 1: UNIVERSAL THERMAL PRINTER TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;
  function it(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`, e);
    }
  }

  async function itAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`, e);
    }
  }

  // Import ES module bridge
  const {
    ThermalPrinterBridge,
    BLE_PRINTER_SERVICE_UUIDS,
    discoverWritableGattCharacteristic,
    writeBleEscPosChunks,
    detectPlatform,
    PLATFORMS
  } = await import('../src/core/platform-bridge.js');

  console.log('📍 SECTION 1: DYNAMIC ESC/POS BYTECODE ENGINE (58mm vs 80mm)');

  const mockBill = {
    bill_no: 'INV-1001',
    created_at: '2026-11-06T10:00:00Z',
    table: 'Table 4',
    orderType: 'Dine-In',
    paymentMode: 'Cash',
    amount: 350.00,
    items: [
      { name: 'Cold Coffee Frappe Special', qty: 2, line_total_paise: 24000 },
      { name: 'Veg Grilled Sandwich', qty: 1, line_total_paise: 11000 }
    ]
  };

  it('ESC-01: 58mm generator produces 32-column layout with strict ESC @ and GS V cut', () => {
    const bytes58 = ThermalPrinterBridge.generateEscPosCommands(mockBill, '58mm');
    assert.ok(bytes58 instanceof Uint8Array);
    // Init command: 0x1B, 0x40
    assert.strictEqual(bytes58[0], 0x1B);
    assert.strictEqual(bytes58[1], 0x40);
    // Cut command: [0x1D, 0x56, 0x42, 0x00]
    const last4 = bytes58.slice(-4);
    assert.strictEqual(last4[0], 0x1D);
    assert.strictEqual(last4[1], 0x56);
    assert.strictEqual(last4[2], 0x42);
    assert.strictEqual(last4[3], 0x00);

    const text58 = new TextDecoder().decode(bytes58);
    // Contains 32-dash divider
    assert.ok(text58.includes('--------------------------------\n'), 'Expected 32-char divider');
    // Does NOT contain 48-dash divider
    assert.ok(!text58.includes('------------------------------------------------\n'), 'Should not have 48-char divider');
  });

  it('ESC-02: 80mm generator produces 48-column layout with strict ESC @ and GS V cut', () => {
    const bytes80 = ThermalPrinterBridge.generateEscPosCommands(mockBill, '80mm');
    assert.ok(bytes80 instanceof Uint8Array);
    assert.strictEqual(bytes80[0], 0x1B);
    assert.strictEqual(bytes80[1], 0x40);
    const last4 = bytes80.slice(-4);
    assert.strictEqual(last4[0], 0x1D);
    assert.strictEqual(last4[1], 0x56);

    const text80 = new TextDecoder().decode(bytes80);
    // Contains 48-dash divider
    assert.ok(text80.includes('------------------------------------------------\n'), 'Expected 48-char divider');
  });

  it('ESC-03: KOT generation dynamically formats kitchen order ticket', () => {
    const kotData = {
      jobType: 'KOT',
      table: 'T-5',
      items: [
        { name: 'Masala Dosa', qty: 2, notes: 'Extra crispy' }
      ]
    };
    const kotBytes = ThermalPrinterBridge.generateEscPosCommands(kotData, '58mm', { isKot: true });
    const kotText = new TextDecoder().decode(kotBytes);
    assert.ok(kotText.includes('KITCHEN TICKET'));
    assert.ok(kotText.includes('TABLE: T-5'));
    assert.ok(kotText.includes('2x Masala Dosa'));
    assert.ok(kotText.includes('>> Note: Extra crispy'));
    assert.ok(kotText.includes('*** END OF KOT ***'));
  });

  console.log('\n📍 SECTION 2: WEB BLUETOOTH BLE & EZO UUID INCLUSION');

  it('BLE-01: BLE_PRINTER_SERVICE_UUIDS includes all 5 critical service UUIDs', () => {
    assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes('000018f0-0000-1000-8000-00805f9b34fb'), 'Missing Rongta UUID');
    assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes('e7810a71-73ae-499d-8c15-faa9aef0c3f2'), 'Missing Zijiang UUID');
    assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes('49535343-fe7d-4ae5-8fa9-9fafd205e455'), 'Missing ISSC UUID');
    assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes('0000ff00-0000-1000-8000-00805f9b34fb'), 'Missing Ezo BLE UUID');
    assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes('0000fee7-0000-1000-8000-00805f9b34fb'), 'Missing Tencent AirSync UUID');
  });

  await itAsync('BLE-02: discoverWritableGattCharacteristic resolves writable characteristic across mock GATT services', async () => {
    let writeCalled = false;
    const mockWritableChar = {
      uuid: '0000ff02-0000-1000-8000-00805f9b34fb',
      properties: { write: true, writeWithoutResponse: true },
      async writeValue(v) { writeCalled = true; }
    };
    const mockService = {
      uuid: '0000ff00-0000-1000-8000-00805f9b34fb',
      async getCharacteristics() { return [mockWritableChar]; }
    };
    const mockServer = {
      async getPrimaryServices() { return [mockService]; },
      async getPrimaryService(uuid) {
        if (uuid === '0000ff00-0000-1000-8000-00805f9b34fb') return mockService;
        throw new Error('Not found');
      }
    };

    const res = await discoverWritableGattCharacteristic(mockServer);
    assert.strictEqual(res.characteristic, mockWritableChar);
    assert.strictEqual(res.service, mockService);
  });

  await itAsync('BLE-03: writeBleEscPosChunks paces 100-byte chunks', async () => {
    const writtenChunks = [];
    const mockChar = {
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse(chunk) {
        writtenChunks.push(chunk);
      }
    };
    // 250 bytes -> 3 chunks (100, 100, 50)
    const testBytes = new Uint8Array(250);
    testBytes.fill(0xAA);
    const start = Date.now();
    await writeBleEscPosChunks(mockChar, testBytes);
    const duration = Date.now() - start;

    assert.strictEqual(writtenChunks.length, 3);
    assert.strictEqual(writtenChunks[0].length, 100);
    assert.strictEqual(writtenChunks[1].length, 100);
    assert.strictEqual(writtenChunks[2].length, 50);
    // At least 2 delays of ~25ms -> ~50ms
    assert.ok(duration >= 40, `Expected paced delay >= 40ms, got ${duration}ms`);
  });

  console.log('\n📍 SECTION 3: DUAL PRINTER SLOTS & BACKWARD COMPATIBILITY');

  it('SLOT-01: ThermalPrinterBridge maintains independent printer1 and printer2 slots', () => {
    assert.ok(ThermalPrinterBridge.printers.printer1);
    assert.ok(ThermalPrinterBridge.printers.printer2);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.role, 'RECEIPT');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.role, 'KOT');
  });

  it('SLOT-02: Backward compatibility getters and setters mirror active device and characteristic', () => {
    const dummyDev = { name: 'DummyBLE' };
    const dummyChar = { uuid: 'dummy-char' };
    ThermalPrinterBridge.activeBluetoothDevice = dummyDev;
    ThermalPrinterBridge.activeCharacteristic = dummyChar;

    assert.strictEqual(ThermalPrinterBridge.activeBluetoothDevice, dummyDev);
    assert.strictEqual(ThermalPrinterBridge.activeCharacteristic, dummyChar);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.device, dummyDev);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.characteristic, dummyChar);
  });

  console.log('\n📍 SECTION 4: WEBUSB DYNAMIC OUT ENDPOINT DISCOVERY');

  await itAsync('USB-01: connectUsbPrinter dynamically discovers endpoint 2 with direction out', async () => {
    const mockUsbDevice = {
      productName: 'Epson TM-T88VI',
      configuration: {
        interfaces: [
          {
            interfaceNumber: 0,
            alternates: [
              {
                endpoints: [
                  { endpointNumber: 1, direction: 'in', type: 'bulk' },
                  { endpointNumber: 2, direction: 'out', type: 'bulk' } // OUT endpoint is 2
                ]
              }
            ]
          }
        ]
      },
      async open() {},
      async selectConfiguration() {},
      claimedIface: null,
      async claimInterface(n) { this.claimedIface = n; },
      transfers: [],
      async transferOut(ep, data) {
        this.transfers.push({ ep, data });
        return { status: 'ok', bytesWritten: data.length };
      }
    };

    navigator.usb = {
      requestDevice: async () => mockUsbDevice,
      addEventListener: () => {}
    };

    const res = await ThermalPrinterBridge.connectUsbPrinter('printer1');
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.connected, true);
    assert.strictEqual(res.data.endpointNumber, 2);
    assert.strictEqual(res.data.interfaceNumber, 0);
    assert.strictEqual(mockUsbDevice.claimedIface, 0);
    assert.strictEqual(ThermalPrinterBridge.printers.printer1.endpointNumber, 2);
    assert.strictEqual(ThermalPrinterBridge.activeUsbEndpoint, 2);
  });

  console.log('\n📍 SECTION 5: NETWORK TCP PROXY (Port 9100 RAW)');

  await itAsync('NET-01: Mock TCP server receives raw bytes sent via connectNetworkPrinter and printToNetwork', async () => {
    // Spin up local TCP test server
    const received = [];
    const tcpServer = net.createServer((sock) => {
      sock.on('data', (d) => received.push(d));
    });

    await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
    const port = tcpServer.address().port;

    // Configure slot
    const netConfig = await ThermalPrinterBridge.connectNetworkPrinter('printer2', '127.0.0.1', port);
    assert.strictEqual(netConfig.error, null);
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.host, '127.0.0.1');
    assert.strictEqual(ThermalPrinterBridge.printers.printer2.port, port);

    // Mock fetch for client bridge to route to local proxy simulation
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (url === '/api/print/network') {
        const body = JSON.parse(opts.body);
        const sock = new net.Socket();
        await new Promise((res, rej) => {
          sock.connect(body.port, body.host, () => {
            sock.write(Buffer.from(body.data), () => {
              sock.end(() => res());
            });
          });
          sock.on('error', rej);
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, bytesWritten: body.data.length })
        };
      }
      return originalFetch(url, opts);
    };

    const sampleBytes = new Uint8Array([0x1B, 0x40, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0A]);
    const printRes = await ThermalPrinterBridge.printToNetwork('127.0.0.1', port, sampleBytes);
    assert.strictEqual(printRes.success, true);
    assert.strictEqual(printRes.bytesWritten, sampleBytes.length);

    await new Promise((r) => setTimeout(r, 100));
    tcpServer.close();
    global.fetch = originalFetch;

    const combined = Buffer.concat(received);
    assert.deepStrictEqual(Array.from(combined), Array.from(sampleBytes));
  });

  console.log('\n📍 SECTION 6: WEB SERIAL CLASSIC VIRTUAL COM PORT');

  await itAsync('SER-01: connectSerialPrinter connects and releases lock on printToSerial', async () => {
    let released = false;
    let written = null;
    const mockSerialPort = {
      async open() {},
      writable: {
        getWriter() {
          return {
            async write(data) { written = data; },
            releaseLock() { released = true; }
          };
        }
      }
    };

    navigator.serial = {
      requestPort: async () => mockSerialPort,
      addEventListener: () => {}
    };

    const res = await ThermalPrinterBridge.connectSerialPrinter('printer1', 9600);
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.transport, 'SERIAL');

    const testPayload = new Uint8Array([0x1B, 0x40]);
    await ThermalPrinterBridge.printToSerial(mockSerialPort, testPayload);
    assert.strictEqual(released, true, 'Writer lock must be released');
    assert.deepStrictEqual(written, testPayload);
  });

  await itAsync('NET-02: server.js POST /api/print/network validates payload and relays raw bytes to TCP socket', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = await import('../server.js');

    // 1. Spin up mock TCP printer
    const tcpReceived = [];
    const printerServer = net.createServer((sock) => {
      sock.on('data', (d) => tcpReceived.push(d));
    });
    await new Promise((r) => printerServer.listen(0, '127.0.0.1', r));
    const printerPort = printerServer.address().port;

    // 2. Spin up Express app on random port
    const expressServer = app.listen(0);
    const expressPort = expressServer.address().port;

    try {
      // Test A: Missing host
      const resBad = await fetch(`http://127.0.0.1:${expressPort}/api/print/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: printerPort, data: [27, 64] })
      });
      assert.strictEqual(resBad.status, 400);

      // Test B: Valid print relay
      const rawPayload = [0x1B, 0x40, 0x54, 0x45, 0x53, 0x54, 0x0A]; // ESC @ TEST\n
      const resOk = await fetch(`http://127.0.0.1:${expressPort}/api/print/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: printerPort,
          data: rawPayload
        })
      });
      assert.strictEqual(resOk.status, 200);
      const jsonOk = await resOk.json();
      assert.strictEqual(jsonOk.success, true);
      assert.strictEqual(jsonOk.bytesWritten, rawPayload.length);

      await new Promise((r) => setTimeout(r, 100));
      const receivedBuffer = Buffer.concat(tcpReceived);
      assert.deepStrictEqual(Array.from(receivedBuffer), rawPayload);
    } finally {
      expressServer.close();
      printerServer.close();
    }
  });

  console.log(`\n====================================================`);
  console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${total - passed} FAILED (TOTAL: ${total})`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runM1Suite().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
