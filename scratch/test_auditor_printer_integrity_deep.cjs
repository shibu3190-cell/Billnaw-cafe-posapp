/**
 * scratch/test_auditor_printer_integrity_deep.cjs
 * ============================================================================
 * INDEPENDENT DEEP FORENSIC INTEGRITY AUDIT (M1-M4 Universal Printer Suite)
 * Conducted by: auditor_m4_1
 *
 * Verifies:
 *   1. Anti-Cheating & Facade Analysis across src/core/platform-bridge.js, js/pos.js, server.js
 *   2. ESC/POS Dynamic Formatter edge cases (wrapping, column boundary, cuts)
 *   3. Ezo BLE UUID completeness and discovery fallback
 *   4. Strict Local-Only Billing Invariant (zero cloud queueing for customer bills)
 *   5. Atomic Transaction Leasing & 60s Zombie Lease Recovery
 *   6. Security Rules Binary Parity & Injection Rejection
 *   7. Repository Invariants (26 modal-close-btn SVGs, 0 raw emojis, currency non-breaking space)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('====================================================================');
console.log('🔬 DEEP INDEPENDENT FORENSIC INTEGRITY AUDIT: UNIVERSAL PRINTER');
console.log('====================================================================\n');

let passed = 0;
let failed = 0;

function audit(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function auditAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runAuditorChecks() {
  const ROOT_DIR = path.resolve(__dirname, '..');

  // Load files
  const bridgePath = path.join(ROOT_DIR, 'src', 'core', 'platform-bridge.js');
  const posPath = path.join(ROOT_DIR, 'js', 'pos.js');
  const serverPath = path.join(ROOT_DIR, 'server.js');
  const htmlPath = path.join(ROOT_DIR, 'index.html');
  const rulesPath1 = path.join(ROOT_DIR, 'firestore.rules');
  const rulesPath2 = path.join(ROOT_DIR, 'database', 'firestore.rules');

  const bridgeSrc = fs.readFileSync(bridgePath, 'utf8');
  const posSrc = fs.readFileSync(posPath, 'utf8');
  const serverSrc = fs.readFileSync(serverPath, 'utf8');
  const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
  const rules1 = fs.readFileSync(rulesPath1);
  const rules2 = fs.readFileSync(rulesPath2);

  // 1. Static Anti-Cheating & Facade Detection
  console.log('📍 CHECK 1: STATIC SOURCE FORENSICS & ANTI-FACADE AUDIT');

  audit('No hardcoded PASS/FAIL or mock short-circuits in platform-bridge.js', () => {
    assert.strictEqual(/return\s+["']PASS["']/i.test(bridgeSrc), false, 'Hardcoded PASS found in platform-bridge.js');
    assert.strictEqual(/return\s+true;\s*\/\/\s*mock/i.test(bridgeSrc), false, 'Mock return found in platform-bridge.js');
  });

  audit('No facade dummy implementations in ThermalPrinterBridge', () => {
    // Check that core methods have genuine multi-line logic
    const methods = [
      'connectBluetoothPrinter',
      'connectUsbPrinter',
      'connectNetworkPrinter',
      'connectSerialPrinter',
      'generateEscPosCommands',
      'routePrintJob',
      'enqueueCloudKotPrintJob',
      'claimPrintJob'
    ];
    for (const m of methods) {
      assert.ok(bridgeSrc.includes(m), `Method ${m} must exist in platform-bridge.js`);
      // Ensure body is not just empty or single return
      const regex = new RegExp(`async\\s+${m}\\s*\\([^)]*\\)\\s*\\{([^}]{0,50})\\}`);
      const dummyMatch = bridgeSrc.match(regex);
      assert.strictEqual(dummyMatch, null, `Method ${m} appears to be a trivial facade dummy`);
    }
  });

  // 2. ESC/POS Bytecode & Text Wrapping Logic Verification
  console.log('\n📍 CHECK 2: ESC/POS DYNAMIC BYTECODE & WRAPPING ENGINE');
  const { ThermalPrinterBridge, wrapText, BLE_PRINTER_SERVICE_UUIDS, enqueueCloudKotPrintJob, claimPrintJob } = await import('../src/core/platform-bridge.js');

  audit('wrapText strictly bounds lines to maxCols (32 cols for 58mm, 48 cols for 80mm)', () => {
    const longText = "Supercalifragilisticexpialidocious special gourmet caramel macchiato with extra whipped cream and chocolate sprinkles";
    const wrapped32 = wrapText(longText, 32);
    for (const line of wrapped32) {
      assert.ok(line.length <= 32, `Line exceeds 32 cols: '${line}' (${line.length})`);
    }
    const wrapped48 = wrapText(longText, 48);
    for (const line of wrapped48) {
      assert.ok(line.length <= 48, `Line exceeds 48 cols: '${line}' (${line.length})`);
    }
  });

  audit('ESC/POS initialization (0x1B, 0x40) and cut (0x1D, 0x56, 0x42, 0x00) invariants', () => {
    const invoice = {
      bill_no: 'B-777',
      amount: 150.00,
      items: [{ name: 'Espresso', qty: 1, price: 150 }]
    };
    const bytes = ThermalPrinterBridge.generateEscPosCommands(invoice, '58mm');
    assert.strictEqual(bytes[0], 0x1B);
    assert.strictEqual(bytes[1], 0x40);
    const cut = bytes.slice(-4);
    assert.deepStrictEqual(Array.from(cut), [0x1D, 0x56, 0x42, 0x00]);
  });

  // 3. Ezo BLE UUID completeness
  console.log('\n📍 CHECK 3: EZO BLE & UNIVERSAL GATT DISCOVERY');
  audit('BLE_PRINTER_SERVICE_UUIDS contains all 5 required vendor service UUIDs', () => {
    const requiredUuids = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard Rongta / Xprinter
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Zijiang
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC UART
      '0000ff00-0000-1000-8000-00805f9b34fb', // Ezo BLE (Telink/Bekene)
      '0000fee7-0000-1000-8000-00805f9b34fb'  // Tencent AirSync
    ];
    for (const u of requiredUuids) {
      assert.ok(BLE_PRINTER_SERVICE_UUIDS.includes(u), `Missing required UUID: ${u}`);
    }
  });

  // 4. Strict Local-Only Billing Enforcement
  console.log('\n📍 CHECK 4: LOCAL-ONLY BILLING ENFORCEMENT & CLOUD KOT ISOLATION');
  await auditAsync('enqueueCloudKotPrintJob rejects non-KOT jobs and all 20 forbidden billing keys', async () => {
    // Test non-KOT jobType
    await assert.rejects(
      async () => enqueueCloudKotPrintJob({ jobType: 'RECEIPT', tableNo: 'T1' }),
      /Security Violation.*Customer bills and receipts must NEVER be queued/
    );

    // Test 20 billing fields injected into KOT
    const forbiddenKeys = [
      'billNo', 'bill_no', 'amount', 'invoice', 'invoice_id', 'invoiceNo', 'invoice_no',
      'final_payable_paise', 'final_total_paise', 'grandTotal', 'grand_total',
      'paymentMode', 'payment_mode', 'subtotal', 'grossSubtotal', 'totalTax',
      'tax', 'total', 'discount', 'discountAmount'
    ];
    for (const key of forbiddenKeys) {
      const badJob = { jobType: 'KOT', tableNo: 'T1', items: [] };
      badJob[key] = (key === 'amount' || key.includes('Total') || key.includes('paise')) ? 500 : 'TEST';
      await assert.rejects(
        async () => enqueueCloudKotPrintJob(badJob),
        /Security Violation/,
        `Should reject forbidden key ${key}`
      );
    }
  });

  audit('pos.js sendEscPosToPrinter strictly never calls enqueueCloudKotPrintJob or writes to print_queue', () => {
    const fnMatch = posSrc.match(/async function sendEscPosToPrinter[\s\S]*?window\.sendEscPosToPrinter\s*=\s*sendEscPosToPrinter;/);
    assert.ok(fnMatch, 'sendEscPosToPrinter definition found');
    const body = fnMatch[0];
    assert.strictEqual(body.includes('enqueueCloudKotPrintJob'), false, 'sendEscPosToPrinter must never call enqueueCloudKotPrintJob');
    assert.strictEqual(body.includes('print_queue'), false, 'sendEscPosToPrinter must never access print_queue');
  });

  // 5. Atomic Transaction Leasing & Zombie Recovery
  console.log('\n📍 CHECK 5: ATOMIC TRANSACTION LEASING & ZOMBIE RECOVERY');
  await auditAsync('claimPrintJob correctly leases queued job and recovers zombie lease (>60s)', async () => {
    let mockData = {
      status: 'queued',
      attempts: 0
    };
    const mockDb = {
      runTransaction: async (callback) => {
        const txn = {
          get: async () => ({ exists: true, data: mockData }),
          update: (ref, updateObj) => { Object.assign(mockData, updateObj); }
        };
        return await callback(txn);
      }
    };

    // 1. First claim succeeds
    const claimed = await claimPrintJob(mockDb, 'shop1', 'job1', 'worker_alpha');
    assert.strictEqual(claimed.status, 'processing');
    assert.strictEqual(claimed.leasedBy, 'worker_alpha');
    assert.strictEqual(claimed.attempts, 1);

    // 2. Second claim immediately fails (already processing)
    await assert.rejects(
      async () => claimPrintJob(mockDb, 'shop1', 'job1', 'worker_beta'),
      /Job already claimed or printed/
    );

    // 3. Simulated zombie lease (>60s) recovers and allows second worker
    mockData.leasedAt = new Date(Date.now() - 65000).toISOString();
    const recovered = await claimPrintJob(mockDb, 'shop1', 'job1', 'worker_beta');
    assert.strictEqual(recovered.status, 'processing');
    assert.strictEqual(recovered.leasedBy, 'worker_beta');
    assert.strictEqual(recovered.attempts, 2);
  });

  // 6. Security Rules Binary Parity
  console.log('\n📍 CHECK 6: SECURITY RULES PARITY & INVARIANTS');
  audit('firestore.rules and database/firestore.rules are 100% byte-for-byte identical', () => {
    assert.strictEqual(rules1.length, rules2.length, 'Length mismatch');
    assert.strictEqual(Buffer.compare(rules1, rules2), 0, 'Buffer.compare mismatch');
    const hash1 = crypto.createHash('sha256').update(rules1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(rules2).digest('hex');
    assert.strictEqual(hash1, hash2, 'SHA-256 digest mismatch');
  });

  // 7. System Invariants Audit
  console.log('\n📍 CHECK 7: REPOSITORY INVARIANTS AUDIT');
  audit('Exact count of 26 .modal-close-btn SVGs in index.html', () => {
    const matches = htmlSrc.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(matches, 'SVG close buttons found');
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn SVGs, found ${matches.length}`);
  });

  audit('#printerSettingsModal and #printerSelectModal do not violate 26 modal-close-btn count', () => {
    // Verify that printer modals use .printer-modal-close-btn or other class
    const printerModalClose = htmlSrc.match(/class=["'][^"']*printer-modal-close-btn[^"']*["']/g);
    assert.ok(printerModalClose && printerModalClose.length >= 1, 'printer-modal-close-btn class used in printer modals');
  });

  audit('Zero raw Unicode emojis in operational buttons, tabs, and controls', () => {
    // Regex for emoji ranges: \u{1F300}-\u{1F9FF}, \u{2600}-\u{27BF}
    const buttonMatches = htmlSrc.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const btn of buttonMatches) {
      assert.strictEqual(emojiRegex.test(btn), false, `Found raw Unicode emoji in button: ${btn.slice(0, 80)}`);
    }
  });

  audit('Currency formatting maintains non-breaking space (₹ )', () => {
    assert.ok(htmlSrc.includes('₹ '), 'index.html contains non-breaking currency format ₹ ');
    assert.ok(posSrc.includes('₹ '), 'js/pos.js contains non-breaking currency format ₹ ');
  });

  console.log('\n====================================================================');
  console.log(`🎯 AUDITOR DEEP FORENSICS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuditorChecks().catch(err => {
  console.error('Fatal auditor error:', err);
  process.exit(1);
});
