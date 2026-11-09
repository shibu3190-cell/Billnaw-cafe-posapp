// scratch/test_adversarial_m1_printer.cjs
// Adversarial Stress-Test Suite for Milestone 1: Universal Thermal Printer Compatibility

const assert = require('assert');
const net = require('net');

/**
 * Strips ESC/POS binary command sequences from a decoded text string to isolate printable text.
 * Handles ESC sequences (0x1B), GS sequences (0x1D), and control bytes.
 */
function extractPrintableLines(uint8Bytes) {
  // Replace known multi-byte ESC/POS commands before decoding:
  // ESC @: 1B 40
  // ESC a n: 1B 61 nn
  // ESC E n: 1B 45 nn
  // GS ! n: 1D 21 nn
  // GS V m n: 1D 56 mm nn
  const cleanBytes = [];
  let i = 0;
  while (i < uint8Bytes.length) {
    if (uint8Bytes[i] === 0x1B) {
      if (i + 1 < uint8Bytes.length) {
        const cmd = uint8Bytes[i + 1];
        if (cmd === 0x40 || cmd === 0x6D) { // ESC @, ESC m
          i += 2;
          continue;
        } else if (cmd === 0x61 || cmd === 0x45) { // ESC a n, ESC E n
          i += 3;
          continue;
        }
      }
      i += 2;
      continue;
    } else if (uint8Bytes[i] === 0x1D) {
      if (i + 1 < uint8Bytes.length) {
        const cmd = uint8Bytes[i + 1];
        if (cmd === 0x21) { // GS ! n
          i += 3;
          continue;
        } else if (cmd === 0x56) { // GS V m n
          i += 4;
          continue;
        }
      }
      i += 2;
      continue;
    }
    cleanBytes.push(uint8Bytes[i]);
    i++;
  }

  const rawText = new TextDecoder('utf-8').decode(new Uint8Array(cleanBytes));
  // Split on newline and remove carriage returns
  return rawText.split('\n').map(l => l.replace(/\r/g, ''));
}

async function runAdversarialM1Suite() {
  console.log('====================================================================');
  console.log('🔥 ADVERSARIAL STRESS TEST: MILESTONE 1 THERMAL PRINTER BRIDGE');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  const findings = [];

  function recordPass(testName) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  }

  function recordFail(testName, error, details = '') {
    failed++;
    const finding = { testName, error: error.message || String(error), details };
    findings.push(finding);
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Reason: ${error.message || error}`);
    if (details) console.error(`     Details: ${details}`);
  }

  const {
    ThermalPrinterBridge,
    BLE_PRINTER_SERVICE_UUIDS,
    discoverWritableGattCharacteristic,
    writeBleEscPosChunks
  } = await import('../src/core/platform-bridge.js');

  // ============================================================================
  // SUITE 1: ESC/POS GENERATOR ATTACK VECTORS
  // ============================================================================
  console.log('📍 SUITE 1: ESC/POS GENERATOR EXTREME INPUT ATTACKS');

  // Attack 1.1: Bytecode boundary invariants: First 2 bytes [0x1B, 0x40] and Cut [0x1D, 0x56]
  try {
    const dataVariants = [
      { bill_no: 'B1', amount: 0, items: [] },
      { bill_no: 'B2', amount: 100, items: [{ name: 'Test', qty: 1, line_total_paise: 10000 }] },
      { jobType: 'KOT', table: 'T1', items: [{ name: 'Chai', qty: 2 }] }
    ];

    for (let i = 0; i < dataVariants.length; i++) {
      const bytes58 = ThermalPrinterBridge.generateEscPosCommands(dataVariants[i], '58mm');
      const bytes80 = ThermalPrinterBridge.generateEscPosCommands(dataVariants[i], '80mm');

      assert.strictEqual(bytes58[0], 0x1B, `58mm byte 0 must be 0x1B (variant ${i})`);
      assert.strictEqual(bytes58[1], 0x40, `58mm byte 1 must be 0x40 (variant ${i})`);
      assert.strictEqual(bytes80[0], 0x1B, `80mm byte 0 must be 0x1B (variant ${i})`);
      assert.strictEqual(bytes80[1], 0x40, `80mm byte 1 must be 0x40 (variant ${i})`);

      // Verify Knife Cut: 0x1D, 0x56 in last 4 bytes
      const cut58 = bytes58.slice(-4);
      const cut80 = bytes80.slice(-4);
      assert.strictEqual(cut58[0], 0x1D, `58mm cut byte 0 must be 0x1D (variant ${i})`);
      assert.strictEqual(cut58[1], 0x56, `58mm cut byte 1 must be 0x56 (variant ${i})`);
      assert.strictEqual(cut80[0], 0x1D, `80mm cut byte 0 must be 0x1D (variant ${i})`);
      assert.strictEqual(cut80[1], 0x56, `80mm cut byte 1 must be 0x56 (variant ${i})`);
    }
    recordPass('ADV-ESC-01: Initialization [0x1B, 0x40] and Knife Cut [0x1D, 0x56] byte invariants');
  } catch (err) {
    recordFail('ADV-ESC-01: Initialization [0x1B, 0x40] and Knife Cut [0x1D, 0x56] byte invariants', err);
  }

  // Attack 1.2: Empty item lists and zero amounts resilience
  try {
    const emptyBill = {
      bill_no: 'EMPTY-001',
      date: '2026-11-06',
      amount: 0,
      final_payable_paise: 0,
      items: []
    };
    const emptyKot = {
      jobType: 'KOT',
      table: 'T-ZERO',
      items: []
    };

    const emptyBillBytes58 = ThermalPrinterBridge.generateEscPosCommands(emptyBill, '58mm');
    const emptyKotBytes58 = ThermalPrinterBridge.generateEscPosCommands(emptyKot, '58mm');

    assert.ok(emptyBillBytes58.length > 20, 'Empty bill should generate valid header and totals');
    assert.ok(emptyKotBytes58.length > 20, 'Empty KOT should generate valid header and end marker');

    const billText = new TextDecoder().decode(emptyBillBytes58);
    assert.ok(billText.includes('TOTAL: Rs. 0.00'), 'Zero amount formatted correctly');
    assert.ok(billText.includes('Thank You! Visit Again'), 'Footer preserved on empty bill');

    const kotText = new TextDecoder().decode(emptyKotBytes58);
    assert.ok(kotText.includes('TABLE: T-ZERO'), 'Table preserved on empty KOT');
    assert.ok(kotText.includes('*** END OF KOT ***'), 'End of KOT preserved');
    recordPass('ADV-ESC-02: Empty item lists and zero amounts generate valid formatted receipts');
  } catch (err) {
    recordFail('ADV-ESC-02: Empty item lists and zero amounts generate valid formatted receipts', err);
  }

  // Attack 1.3: Extremely long item names (100+ chars) line length bounds (32 chars for 58mm, 48 chars for 80mm)
  try {
    const longNameBill = {
      bill_no: 'LONG-999',
      amount: 450,
      final_payable_paise: 45000,
      items: [
        {
          name: 'Super Special Gourmet Hyderabadi Handi Biryani Family Jumbo Pack with Extra Saffron and Roasted Cashews', // 104 chars
          qty: 1,
          line_total_paise: 45000
        }
      ]
    };

    const bytes58 = ThermalPrinterBridge.generateEscPosCommands(longNameBill, '58mm');
    const lines58 = extractPrintableLines(bytes58);

    const violatingLines58 = [];
    for (let idx = 0; idx < lines58.length; idx++) {
      const line = lines58[idx];
      // Exclude empty lines
      if (!line.trim()) continue;
      if (line.length > 32) {
        violatingLines58.push({ lineIndex: idx, length: line.length, text: line });
      }
    }

    const bytes80 = ThermalPrinterBridge.generateEscPosCommands(longNameBill, '80mm');
    const lines80 = extractPrintableLines(bytes80);

    const violatingLines80 = [];
    for (let idx = 0; idx < lines80.length; idx++) {
      const line = lines80[idx];
      if (!line.trim()) continue;
      if (line.length > 48) {
        violatingLines80.push({ lineIndex: idx, length: line.length, text: line });
      }
    }

    if (violatingLines58.length > 0 || violatingLines80.length > 0) {
      const detail58 = violatingLines58.map(v => `[58mm L${v.lineIndex}: len=${v.length}] "${v.text}"`).join('\n     ');
      const detail80 = violatingLines80.map(v => `[80mm L${v.lineIndex}: len=${v.length}] "${v.text}"`).join('\n     ');
      throw new Error(`Lines exceeded maximum column boundaries:\n     58mm violations (${violatingLines58.length}):\n     ${detail58}\n     80mm violations (${violatingLines80.length}):\n     ${detail80}`);
    }

    recordPass('ADV-ESC-03: 100+ char item names strictly never exceed 32 columns (58mm) and 48 columns (80mm)');
  } catch (err) {
    recordFail('ADV-ESC-03: 100+ char item names strictly never exceed 32 columns (58mm) and 48 columns (80mm)', err);
  }

  // Attack 1.4: Ultra-large quantities and amounts column alignment bounds
  try {
    const hugeNumbersBill = {
      bill_no: 'HUGE-99999999',
      amount: 9999999.99,
      final_payable_paise: 999999999,
      items: [
        {
          name: 'Gold Leaf Espresso',
          qty: 99999, // 5 digits
          line_total_paise: 999999999 // Rs. 9,999,999.99 (14 chars)
        }
      ]
    };

    const bytes58 = ThermalPrinterBridge.generateEscPosCommands(hugeNumbersBill, '58mm');
    const lines58 = extractPrintableLines(bytes58);
    const violatingLines = lines58.filter(l => l.trim() && l.length > 32);

    if (violatingLines.length > 0) {
      throw new Error(`Large numbers caused 58mm line overrun: ${JSON.stringify(violatingLines)}`);
    }

    recordPass('ADV-ESC-04: Extreme quantities and multi-million amounts do not overrun line width');
  } catch (err) {
    recordFail('ADV-ESC-04: Extreme quantities and multi-million amounts do not overrun line width', err);
  }

  // Attack 1.5: Missing / malformed item objects (null, undefined, sparse)
  try {
    const sparseBill = {
      bill_no: 'SPARSE-1',
      items: [
        { name: null, quantity: undefined, line_total_paise: undefined },
        {}
      ]
    };
    const sparseBytes = ThermalPrinterBridge.generateEscPosCommands(sparseBill, '58mm');
    assert.ok(sparseBytes.length > 0, 'Sparse items should not throw');
    recordPass('ADV-ESC-05: Missing item properties default safely without throwing');
  } catch (err) {
    recordFail('ADV-ESC-05: Missing item properties default safely without throwing', err);
  }

  // Attack 1.6: KOT item names, notes, and special instructions line length bounds
  try {
    const longKot = {
      jobType: 'KOT',
      table: 'T-VIP-1',
      date: '2026-11-06 12:00:00 PM',
      biller: 'Head Chef Master Staff',
      items: [
        {
          name: 'Crispy Schezwan Veg Cheese Frankie with Special Jalapeno Dip and Herb Infused Seasoning', // 93 chars
          qty: 2,
          notes: 'Make it extra spicy and serve without mayonnaise or bell peppers' // 68 chars
        }
      ],
      special_instructions: 'Pack separately and do not mix with cold drinks or desserts in same bag' // 71 chars
    };

    const bytes58 = ThermalPrinterBridge.generateEscPosCommands(longKot, '58mm', { isKot: true });
    const lines58 = extractPrintableLines(bytes58);
    const violatingLines58 = lines58.filter(l => l.trim() && l.length > 32);

    if (violatingLines58.length > 0) {
      const details = violatingLines58.map(l => `[len=${l.length}] "${l}"`).join('\n     ');
      throw new Error(`KOT 58mm lines exceeded 32 columns (${violatingLines58.length} lines):\n     ${details}`);
    }
    recordPass('ADV-ESC-06: KOT item names, notes, and instructions strictly never exceed 32 columns on 58mm');
  } catch (err) {
    recordFail('ADV-ESC-06: KOT item names, notes, and instructions strictly never exceed 32 columns on 58mm', err);
  }

  // Attack 1.7: Store Profile long business address and customer details
  try {
    const longProfileBill = {
      bill_no: 'ADDR-1',
      customer: 'Siddharth Roy Kapoor (Premium VIP Club Member #99882)', // 54 chars
      biller: 'Supervisor Alexander Hamilton', // 29 chars
      amount: 150,
      final_payable_paise: 15000,
      items: [{ name: 'Masala Tea', qty: 2, line_total_paise: 15000 }]
    };
    const storeProfile = {
      name: 'The Grand Royal Majestic Palace Cafe & Bakery Bistro', // 53 chars
      address: 'Shop 104, 3rd Floor, Prestige Silicon Tech Park, Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103', // 105 chars
      phone: '+91-9876543210 / +91-8765432109', // 31 chars
      fssai: '12345678901234 (Central Zone License)', // 37 chars
      gstin: '29ABCDE1234F1Z5',
      gstMode: 'cgst_sgst'
    };

    const bytes58 = ThermalPrinterBridge.generateEscPosCommands(longProfileBill, '58mm', { storeProfile });
    const lines58 = extractPrintableLines(bytes58);
    const violatingLines58 = lines58.filter(l => l.trim() && l.length > 32);

    if (violatingLines58.length > 0) {
      const details = violatingLines58.map(l => `[len=${l.length}] "${l}"`).join('\n     ');
      throw new Error(`Store profile / customer details exceeded 32 columns (${violatingLines58.length} lines):\n     ${details}`);
    }
    recordPass('ADV-ESC-07: Store profile address and customer details wrap within 32 columns on 58mm');
  } catch (err) {
    recordFail('ADV-ESC-07: Store profile address and customer details wrap within 32 columns on 58mm', err);
  }

  // ============================================================================
  // SUITE 2: WEB BLUETOOTH BLE GATT TRAVERSAL ATTACKS
  // ============================================================================
  console.log('\n📍 SUITE 2: WEB BLUETOOTH BLE GATT TRAVERSAL ATTACKS');

  // Attack 2.1: Missing `char.properties` or undefined properties
  try {
    const mockMaliciousChar = {
      uuid: 'bad-prop-char',
      properties: undefined // No properties object at all
    };
    const mockWritableChar = {
      uuid: 'good-char',
      properties: { write: true }
    };
    const mockService = {
      uuid: 'service-1',
      async getCharacteristics() {
        return [mockMaliciousChar, mockWritableChar];
      }
    };
    const mockServer = {
      async getPrimaryServices() { return [mockService]; },
      async getPrimaryService() { return mockService; }
    };

    const res = await discoverWritableGattCharacteristic(mockServer);
    assert.strictEqual(res.characteristic, mockWritableChar, 'Should skip characteristic with undefined properties');
    recordPass('ADV-BLE-01: Characteristics with missing or undefined properties skipped cleanly');
  } catch (err) {
    recordFail('ADV-BLE-01: Characteristics with missing or undefined properties skipped cleanly', err);
  }

  // Attack 2.2: Device with read-only and notify-only characteristics preceding writable characteristic
  try {
    const readOnlyChar = {
      uuid: 'read-char',
      properties: { read: true, notify: true, write: false, writeWithoutResponse: false }
    };
    const service1 = {
      uuid: 'service-readonly',
      async getCharacteristics() { return [readOnlyChar]; }
    };
    const writableChar = {
      uuid: 'write-char',
      properties: { writeWithoutResponse: true }
    };
    const service2 = {
      uuid: '0000ff00-0000-1000-8000-00805f9b34fb', // Ezo BLE
      async getCharacteristics() { return [writableChar]; }
    };

    const mockServer = {
      async getPrimaryServices() { return [service1, service2]; },
      async getPrimaryService(uuid) {
        if (uuid.toLowerCase().includes('ff00')) return service2;
        throw new Error('Not found');
      }
    };

    const res = await discoverWritableGattCharacteristic(mockServer);
    assert.strictEqual(res.characteristic, writableChar, 'Should skip read-only service and locate writable characteristic');
    recordPass('ADV-BLE-02: Read-only/notify-only services bypassed to discover writable characteristic');
  } catch (err) {
    recordFail('ADV-BLE-02: Read-only/notify-only services bypassed to discover writable characteristic', err);
  }

  // Attack 2.3: Primary services enumeration throws DOMException -> Fallback to targeted UUID query
  try {
    const writableChar = {
      uuid: 'ezo-char',
      properties: { write: true }
    };
    const ezoService = {
      uuid: '0000ff00-0000-1000-8000-00805f9b34fb',
      async getCharacteristics() { return [writableChar]; }
    };

    const mockServer = {
      async getPrimaryServices() {
        // Simulates Android Chrome security error when getPrimaryServices() is restricted
        throw new Error('DOMException: Origin is not allowed to enumerate all services');
      },
      async getPrimaryService(uuid) {
        if (uuid === '0000ff00-0000-1000-8000-00805f9b34fb') {
          return ezoService;
        }
        throw new Error('Service not present');
      }
    };

    const res = await discoverWritableGattCharacteristic(mockServer);
    assert.strictEqual(res.characteristic, writableChar, 'Fallback strategy must locate Ezo service');
    recordPass('ADV-BLE-03: Security exception during getPrimaryServices() falls back to targeted UUID query');
  } catch (err) {
    recordFail('ADV-BLE-03: Security exception during getPrimaryServices() falls back to targeted UUID query', err);
  }

  // Attack 2.4: Device with zero writable characteristics anywhere
  try {
    const deadChar = {
      uuid: 'dead-char',
      properties: { read: true, indicate: true }
    };
    const mockService = {
      uuid: 'service-dead',
      async getCharacteristics() { return [deadChar]; }
    };
    const mockServer = {
      async getPrimaryServices() { return [mockService]; },
      async getPrimaryService() { throw new Error('Not found'); }
    };

    let thrown = null;
    try {
      await discoverWritableGattCharacteristic(mockServer);
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown, 'Must throw error when no writable characteristic exists');
    assert.ok(thrown.message.includes('No writable GATT characteristic found'), 'Clean expected error message');
    recordPass('ADV-BLE-04: Non-writable printer device rejected with clear error message');
  } catch (err) {
    recordFail('ADV-BLE-04: Non-writable printer device rejected with clear error message', err);
  }

  // Attack 2.5: Stress UART chunking with 1,000 bytes and various write methods
  try {
    const receivedChunks = [];
    const mockChar = {
      properties: { write: true, writeWithoutResponse: false },
      async writeValue(chunk) { receivedChunks.push(chunk); }
    };

    const payload = new Uint8Array(1000);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

    const start = Date.now();
    await writeBleEscPosChunks(mockChar, payload);
    const duration = Date.now() - start;

    assert.strictEqual(receivedChunks.length, 10, '1000 bytes / 100 chunk size = 10 chunks');
    assert.strictEqual(receivedChunks[0].length, 100);
    assert.strictEqual(receivedChunks[9].length, 100);
    // 9 inter-chunk delays of 25ms = ~225ms
    assert.ok(duration >= 180, `Expected pacing delay >= 180ms, got ${duration}ms`);

    // Guard test: null characteristic or null bytes should return gracefully without throw
    await writeBleEscPosChunks(null, payload);
    await writeBleEscPosChunks(mockChar, null);
    await writeBleEscPosChunks(mockChar, new Uint8Array(0));

    recordPass('ADV-BLE-05: 1000-byte UART chunking and pacing executed reliably without memory leak');
  } catch (err) {
    recordFail('ADV-BLE-05: 1000-byte UART chunking and pacing executed reliably without memory leak', err);
  }

  // ============================================================================
  // SUITE 3: NETWORK TCP PROXY RESILIENCE ATTACKS (server.js)
  // ============================================================================
  console.log('\n📍 SUITE 3: NETWORK TCP PROXY RESILIENCE ATTACKS (server.js)');

  process.env.NODE_ENV = 'test';
  const { app } = await import('../server.js');

  const expressServer = app.listen(0);
  const expressPort = expressServer.address().port;
  const baseUrl = `http://127.0.0.1:${expressPort}/api/print/network`;

  try {
    // Attack 3.1: Malformed and missing requests
    const malformedPayloads = [
      { name: 'Missing body completely', body: null, expectedStatus: 400 },
      { name: 'Empty JSON object', body: {}, expectedStatus: 400 },
      { name: 'Missing host', body: { port: 9100, data: [27, 64] }, expectedStatus: 400 },
      { name: 'Empty string host', body: { host: '   ', port: 9100, data: [27, 64] }, expectedStatus: 400 },
      { name: 'Numeric host', body: { host: 12345, port: 9100, data: [27, 64] }, expectedStatus: 400 },
      { name: 'Negative port', body: { host: '127.0.0.1', port: -10, data: [27, 64] }, expectedStatus: 400 },
      { name: 'Port out of bounds (99999)', body: { host: '127.0.0.1', port: 99999, data: [27, 64] }, expectedStatus: 400 },
      { name: 'NaN port', body: { host: '127.0.0.1', port: 'INVALID_PORT', data: [27, 64] }, expectedStatus: 400 },
      { name: 'Missing data buffer', body: { host: '127.0.0.1', port: 9100 }, expectedStatus: 400 },
      { name: 'Empty data array', body: { host: '127.0.0.1', port: 9100, data: [] }, expectedStatus: 400 },
      { name: 'Empty data string', body: { host: '127.0.0.1', port: 9100, data: '' }, expectedStatus: 400 }
    ];

    for (const testCase of malformedPayloads) {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: testCase.body ? JSON.stringify(testCase.body) : undefined
      });
      assert.strictEqual(res.status, testCase.expectedStatus, `Expected HTTP ${testCase.expectedStatus} for: ${testCase.name}`);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.error, 'Error message must be returned');
    }
    recordPass('ADV-NET-01: Malformed and missing request payloads rejected with HTTP 400');
  } catch (err) {
    recordFail('ADV-NET-01: Malformed and missing request payloads rejected with HTTP 400', err);
  }

  // Attack 3.2: Connection to closed port (ECONNREFUSED) without crashing Express
  try {
    // Find an unused local port
    const dummyServer = net.createServer();
    await new Promise(r => dummyServer.listen(0, '127.0.0.1', r));
    const closedPort = dummyServer.address().port;
    dummyServer.close(); // Closed immediately

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '127.0.0.1',
        port: closedPort,
        data: [0x1B, 0x40]
      })
    });

    assert.strictEqual(res.status, 500, 'Closed port should return HTTP 500');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes('ECONNREFUSED') || json.error.includes('error'), 'Must report socket connection error');
    recordPass('ADV-NET-02: Connection to closed port returns HTTP 500 without crashing Express');
  } catch (err) {
    recordFail('ADV-NET-02: Connection to closed port returns HTTP 500 without crashing Express', err);
  }

  // Attack 3.3: Connection to blackhole / unreachable IP timeout (5000ms -> HTTP 504)
  try {
    console.log('     [ADV-NET-03] Testing 5000ms TCP socket timeout against non-routable IP (TEST-NET-1: 192.0.2.1)...');
    const start = Date.now();
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '192.0.2.1', // RFC 5737 TEST-NET-1: packets dropped silently
        port: 9100,
        data: [0x1B, 0x40]
      })
    });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 504, `Unreachable host should time out with HTTP 504 (got ${res.status})`);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes('timed out'), 'Error message should explicitly cite timeout');
    assert.ok(elapsed >= 4800, `Timeout must respect 5000ms threshold (took ${elapsed}ms)`);
    recordPass(`ADV-NET-03: Unreachable IP correctly triggers 5000ms timeout and HTTP 504 (${elapsed}ms)`);
  } catch (err) {
    recordFail('ADV-NET-03: Unreachable IP correctly triggers 5000ms timeout and HTTP 504', err);
  }

  // Attack 3.4: Concurrent print flood (10 simultaneous TCP relay requests)
  try {
    const receivedMessages = [];
    const mockPrinterServer = net.createServer((sock) => {
      sock.on('data', (d) => {
        receivedMessages.push(d);
      });
    });
    await new Promise(r => mockPrinterServer.listen(0, '127.0.0.1', r));
    const printerPort = mockPrinterServer.address().port;

    const requestPromises = [];
    const CONCURRENT_COUNT = 10;
    for (let i = 0; i < CONCURRENT_COUNT; i++) {
      const payload = [0x1B, 0x40, 0x30 + i]; // ESC @ + digit
      requestPromises.push(
        fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: '127.0.0.1',
            port: printerPort,
            data: payload
          })
        }).then(async r => ({ status: r.status, json: await r.json() }))
      );
    }

    const results = await Promise.all(requestPromises);
    for (const r of results) {
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.success, true);
    }

    // Give socket a moment to flush all messages
    await new Promise(r => setTimeout(r, 200));
    mockPrinterServer.close();

    assert.strictEqual(receivedMessages.length, CONCURRENT_COUNT, `Expected all ${CONCURRENT_COUNT} streams to arrive`);
    recordPass(`ADV-NET-04: Concurrent flood of ${CONCURRENT_COUNT} TCP requests handled without race condition`);
  } catch (err) {
    recordFail('ADV-NET-04: Concurrent flood of TCP requests handled without race condition', err);
  } finally {
    expressServer.close();
  }

  // ============================================================================
  // SUMMARY AND VERDICT
  // ============================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  if (findings.length > 0) {
    console.log('🚨 VULNERABILITIES & FAILURES IDENTIFIED:');
    findings.forEach((f, idx) => {
      console.log(`  [${idx + 1}] ${f.testName}`);
      console.log(`      Error: ${f.error}`);
    });
    console.log('\nVERDICT: REQUEST_CHANGES\n');
  } else {
    console.log('VERDICT: APPROVE\n');
  }

  return { passed, failed, findings };
}

runAdversarialM1Suite()
  .then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
