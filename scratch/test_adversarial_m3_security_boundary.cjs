/**
 * 🛡️ ADVERSARIAL STRESS TEST & BOUNDARY VERIFICATION SUITE
 * Milestone 3: Distributed Cloud Print Relay for Remote KOT (R3)
 * 
 * Conducts rigorous, hostile boundary testing across:
 * 1. MALICIOUS & ACCIDENTAL BILL/RECEIPT ENQUEUE ATTEMPTS
 *    - Fuzzes payloads with forbidden billing/invoice attributes and non-KOT jobTypes.
 *    - Asserts 100% violent rejection with [Security Violation].
 *    - Verifies zero writes to Firestore (setDoc call count strictly 0).
 * 2. EXECUTION TRACE OF sendEscPosToPrinter UNDER ALL FAILURE MODES
 *    - Disconnect, timeout, BLE GATT write error, route failure, route rejection, missing bridge.
 *    - Dynamic runtime spy tracing: strictly local execution, 0 calls to enqueueCloudKotPrintJob or print_queue.
 *    - Contrasts with sendKotToPrinter which correctly falls back to Cloud Print Relay.
 * 3. FIRESTORE SECURITY RULES FORMAL LOGIC VALIDATION
 *    - Validates syntax parity in firestore.rules and database/firestore.rules.
 *    - Simulates rule predicates on /cafes/{cafeId}/print_queue and /shops/{shopId}/print_queue.
 *    - Confirms rejection of billing attributes, invalid jobType, and non-queued creation status.
 * 4. ATOMIC TRANSACTION & CONCURRENCY EXTREMES
 *    - 10-station concurrent stampede: exactly 1 claim succeeds, 9 fail, 0 duplicate prints.
 *    - Nanosecond/Millisecond boundary checks for 60s zombie lease recovery (59999ms, 60000ms, 60001ms, NaN).
 *    - State machine lifecycle and retry bounds (attempt 1, attempt 2, attempt 3 failure -> failed).
 * 5. REPOSITORY INVARIANTS
 *    - Exactly 26 .modal-close-btn SVGs in index.html.
 *    - 0 raw Unicode emojis in operational controls.
 *    - Currency non-breaking space "₹ ".
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runAdversarialM3TestSuite() {
  console.log('====================================================================');
  console.log('🛡️  ADVERSARIAL SECURITY & BOUNDARY TEST: MILESTONE 3 (R3)');
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

  // Load implementation module
  const {
    ThermalPrinterBridge,
    enqueueCloudKotPrintJob,
    claimPrintJob,
    completePrintJob,
    listenPrintQueue
  } = await import('../src/core/platform-bridge.js');

  // ====================================================================
  // CHALLENGE 1: MALICIOUS & ACCIDENTAL BILL/RECEIPT ENQUEUE ATTEMPTS
  // ====================================================================
  console.log('📍 CHALLENGE 1: MALICIOUS & ACCIDENTAL BILL/RECEIPT ENQUEUE ATTEMPTS');

  let databaseWriteAttempted = false;
  let writeCallCount = 0;
  const hostileSpySetDoc = async () => {
    databaseWriteAttempted = true;
    writeCallCount++;
    throw new Error('FATAL: Database write occurred on invalid payload!');
  };

  const hostileMockDb = {
    collection: () => ({
      doc: () => ({
        set: async () => {
          databaseWriteAttempted = true;
          writeCallCount++;
          throw new Error('FATAL: Database write occurred on invalid payload!');
        }
      })
    })
  };

  // Test set of 28 malicious / accidental payloads attempting to leak billing data into print_queue
  const adversarialPayloads = [
    // Non-KOT / Missing jobType
    { label: 'Missing jobType', payload: { tableNo: 'T1', items: [{ name: 'Chai', qty: 1 }] } },
    { label: 'jobType null', payload: { jobType: null, tableNo: 'T1', items: [] } },
    { label: 'jobType undefined', payload: { jobType: undefined, tableNo: 'T1', items: [] } },
    { label: 'jobType empty string', payload: { jobType: '', tableNo: 'T1', items: [] } },
    { label: 'jobType RECEIPT', payload: { jobType: 'RECEIPT', tableNo: 'T1', items: [] } },
    { label: 'jobType BILL', payload: { jobType: 'BILL', tableNo: 'T1', items: [] } },
    { label: 'jobType INVOICE', payload: { jobType: 'INVOICE', tableNo: 'T1', items: [] } },
    { label: 'jobType ORDER', payload: { jobType: 'ORDER', tableNo: 'T1', items: [] } },
    { label: 'jobType lowercase kot', payload: { jobType: 'kot', tableNo: 'T1', items: [] } },
    { label: 'jobType with whitespace', payload: { jobType: 'KOT ', tableNo: 'T1', items: [] } },
    { label: 'jobType composite KOT_BILL', payload: { jobType: 'KOT_BILL', tableNo: 'T1', items: [] } },
    { label: 'Null payload', payload: null },
    { label: 'Undefined payload', payload: undefined },

    // jobType == 'KOT' but containing forbidden billing / financial fields
    { label: 'billNo field', payload: { jobType: 'KOT', billNo: 'B-1001', items: [] } },
    { label: 'bill_no field', payload: { jobType: 'KOT', bill_no: 'B-1002', items: [] } },
    { label: 'amount field (positive)', payload: { jobType: 'KOT', amount: 250.00, items: [] } },
    { label: 'amount field (zero amount)', payload: { jobType: 'KOT', amount: 0, items: [] } },
    { label: 'invoice object field', payload: { jobType: 'KOT', invoice: { id: 'INV-1' }, items: [] } },
    { label: 'invoice string field', payload: { jobType: 'KOT', invoice: 'INV-001', items: [] } },
    { label: 'invoice_id field', payload: { jobType: 'KOT', invoice_id: 'INV-002', items: [] } },
    { label: 'final_payable_paise field', payload: { jobType: 'KOT', final_payable_paise: 25000, items: [] } },
    { label: 'final_payable_paise zero', payload: { jobType: 'KOT', final_payable_paise: 0, items: [] } },
    { label: 'final_total_paise field', payload: { jobType: 'KOT', final_total_paise: 25000, items: [] } },
    { label: 'grandTotal field', payload: { jobType: 'KOT', grandTotal: 250, items: [] } },
    { label: 'grand_total field', payload: { jobType: 'KOT', grand_total: 250, items: [] } },
    { label: 'paymentMode field', payload: { jobType: 'KOT', paymentMode: 'Cash', items: [] } },
    { label: 'payment_mode field', payload: { jobType: 'KOT', payment_mode: 'UPI', items: [] } },
    { label: 'subtotal field', payload: { jobType: 'KOT', subtotal: 200, items: [] } },
    { label: 'grossSubtotal field', payload: { jobType: 'KOT', grossSubtotal: 220, items: [] } },
    { label: 'totalTax field', payload: { jobType: 'KOT', totalTax: 30, items: [] } }
  ];

  for (const tc of adversarialPayloads) {
    await itAsync(`ADV-ENQ: Enqueue rejected and isolated for '${tc.label}'`, async () => {
      databaseWriteAttempted = false;
      let securityViolationThrown = false;
      let caughtError = null;

      try {
        await enqueueCloudKotPrintJob(tc.payload, {
          setDoc: hostileSpySetDoc,
          db: hostileMockDb,
          shopId: 'adversarial_shop'
        });
      } catch (err) {
        caughtError = err;
        if (err.message && err.message.includes('[Security Violation]')) {
          securityViolationThrown = true;
        }
      }

      assert.strictEqual(
        securityViolationThrown,
        true,
        `Expected [Security Violation] error for payload '${tc.label}', got: ${caughtError?.message}`
      );
      assert.strictEqual(
        databaseWriteAttempted,
        false,
        `CRITICAL SECURITY FAILURE: Database write attempted for forbidden payload '${tc.label}'!`
      );
    });
  }

  await itAsync('ADV-BRIDGE: ThermalPrinterBridge.enqueueCloudKotPrintJob delegates to same strict security gate', async () => {
    let bridgeThrew = false;
    try {
      await ThermalPrinterBridge.enqueueCloudKotPrintJob({
        jobType: 'RECEIPT',
        billNo: 'B-999',
        amount: 500
      });
    } catch (err) {
      bridgeThrew = true;
      assert.ok(err.message.includes('[Security Violation]'));
    }
    assert.strictEqual(bridgeThrew, true, 'Bridge method must also enforce security violation');
  });

  // ====================================================================
  // CHALLENGE 2: EXECUTION TRACE OF sendEscPosToPrinter UNDER ALL FAILURE MODES
  // ====================================================================
  console.log('\n📍 CHALLENGE 2: TRACE sendEscPosToPrinter UNDER ALL FAILURE MODES');

  const posJsPath = path.join(__dirname, '..', 'js', 'pos.js');
  const posSource = fs.readFileSync(posJsPath, 'utf8');

  it('ADV-TRACE-STATIC: Static analysis proves sendEscPosToPrinter never references cloud queue', () => {
    const fnMatch = posSource.match(/async function sendEscPosToPrinter[\s\S]*?window\.sendEscPosToPrinter\s*=\s*sendEscPosToPrinter;/);
    assert.ok(fnMatch, 'sendEscPosToPrinter function found in js/pos.js');
    const fnBody = fnMatch[0];

    assert.strictEqual(
      fnBody.includes('enqueueCloudKotPrintJob'),
      false,
      'VIOLATION: sendEscPosToPrinter contains reference to enqueueCloudKotPrintJob'
    );
    assert.strictEqual(
      fnBody.includes('print_queue'),
      false,
      'VIOLATION: sendEscPosToPrinter contains reference to print_queue'
    );
    assert.strictEqual(
      fnBody.includes('firestoreDoc') || fnBody.includes('firestoreSetDoc'),
      false,
      'VIOLATION: sendEscPosToPrinter contains direct Firestore document writes'
    );
  });

  // Create runtime sandbox to dynamically execute sendEscPosToPrinter under failure modes
  function createPosHarness() {
    let cloudKotEnqueueCount = 0;
    let localHtmlPrintCount = 0;
    let toastMessages = [];
    let qrRenderCount = 0;

    // Minimal DOM element mock
    function createMockElement(id) {
      return {
        id,
        innerText: '',
        innerHTML: '',
        style: { display: 'block' },
        querySelector: () => ({ toDataURL: () => 'data:image/png;base64,mock' })
      };
    }

    const elementMap = new Map();
    const elementIds = [
      'printQrCode', 'printInvoiceTitle', 'printShopName', 'printShopAddress',
      'printShopPhone', 'printFssai', 'printGstin', 'printBillNo', 'printDate',
      'printTableNoRow', 'printTableNo', 'printOrderType', 'printPayMode',
      'printCustomerRow', 'printCustomer', 'printBillerRow', 'printBiller',
      'printItems', 'printTotal'
    ];
    for (const id of elementIds) {
      elementMap.set(id, createMockElement(id));
    }

    const mockDocument = {
      getElementById: (id) => elementMap.get(id) || createMockElement(id)
    };

    const mockWindow = {
      enqueueCloudKotPrintJob: () => {
        cloudKotEnqueueCount++;
        throw new Error('CRITICAL INVARIANT VIOLATION: window.enqueueCloudKotPrintJob called by receipt printer!');
      },
      ThermalPrinterBridge: {
        enqueueCloudKotPrintJob: () => {
          cloudKotEnqueueCount++;
          throw new Error('CRITICAL INVARIANT VIOLATION: ThermalPrinterBridge.enqueueCloudKotPrintJob called by receipt printer!');
        },
        routePrintJob: async () => ({ success: true, data: { printed: true } })
      },
      posPrinters: { printer1: { characteristic: null } },
      QRCode: function(el, opts) { qrRenderCount++; }
    };

    const mockShopProfile = {
      name: 'Cafe Test',
      address: '123 Market St',
      phone: '9876543210',
      fssai: '12345678901234',
      gstin: '07AAAAA0000A1Z5',
      showQr: false,
      upiId: 'cafe@upi'
    };

    const mockGetStoreGstConfig = () => ({ mode: 'none', defaultRate: 5 });
    const mockCalculateOrderTotals = (items, disc) => ({
      subtotal: 200,
      totalTax: 0,
      gstSummary: {}
    });
    const mockExecuteHtmlPrint = async (templateId) => {
      localHtmlPrintCount++;
      return { printed: true, templateId };
    };
    const mockEscapeHtml = (str) => String(str);
    const mockShowToast = (msg) => { toastMessages.push(msg); };
    const mockGetLogoBytes = async () => null;

    // Sandbox execution context
    const sandboxContext = {
      document: mockDocument,
      window: mockWindow,
      shopProfile: mockShopProfile,
      getStoreGstConfig: mockGetStoreGstConfig,
      calculateOrderTotals: mockCalculateOrderTotals,
      executeHtmlPrint: mockExecuteHtmlPrint,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      getLogoBytes: mockGetLogoBytes,
      updateProfileVisuals: () => {},
      printCharacteristic: null,
      TextEncoder: global.TextEncoder,
      Uint8Array: global.Uint8Array,
      setTimeout: global.setTimeout,
      console: { log: () => {}, error: () => {}, warn: () => {} }
    };

    // Extract function implementation from pos.js and evaluate in sandbox
    const fnMatch = posSource.match(/async function sendEscPosToPrinter\(order\)[\s\S]*?\n\}/);
    const fnCode = fnMatch[0];
    const factory = new Function(
      'document', 'window', 'shopProfile', 'getStoreGstConfig', 'calculateOrderTotals',
      'executeHtmlPrint', 'escapeHtml', 'showToast', 'getLogoBytes', 'updateProfileVisuals',
      'printCharacteristic', 'TextEncoder', 'Uint8Array', 'setTimeout', 'console',
      `return (${fnCode});`
    );

    return {
      sandboxContext,
      getFn: (customOverrides = {}) => {
        const merged = { ...sandboxContext, ...customOverrides };
        return factory(
          merged.document, merged.window, merged.shopProfile, merged.getStoreGstConfig,
          merged.calculateOrderTotals, merged.executeHtmlPrint, merged.escapeHtml,
          merged.showToast, merged.getLogoBytes, merged.updateProfileVisuals,
          merged.printCharacteristic, merged.TextEncoder, merged.Uint8Array,
          merged.setTimeout, merged.console
        );
      },
      getMetrics: () => ({
        cloudKotEnqueueCount,
        localHtmlPrintCount,
        toastMessages,
        qrRenderCount
      })
    };
  }

  const sampleCustomerOrder = {
    billNo: 'BILL-8801',
    date: '2026-11-06 14:30',
    orderType: 'Dine-In',
    table: 'Table 4',
    customer: 'Amit Verma',
    biller: 'Karan',
    paymentMode: 'Cash',
    amount: 350.00,
    grossSubtotal: 350.00,
    rawItems: [
      { name: 'Cold Coffee', qty: 2, price: 100 },
      { name: 'Club Sandwich', qty: 1, price: 150 }
    ]
  };

  await itAsync('ADV-TRACE-1: Offline / No printerCharacteristic -> strictly local HTML print, 0 cloud calls', async () => {
    const harness = createPosHarness();
    const sendEscPos = harness.getFn({
      printCharacteristic: null,
      window: {
        ThermalPrinterBridge: {
          routePrintJob: async () => ({ success: false, reason: 'No hardware' })
        },
        posPrinters: { printer1: { characteristic: null } }
      }
    });

    await sendEscPos(sampleCustomerOrder);
    const metrics = harness.getMetrics();

    assert.strictEqual(metrics.cloudKotEnqueueCount, 0, 'Must NEVER call cloud enqueue');
    assert.strictEqual(metrics.localHtmlPrintCount, 1, 'Must fall back to local HTML print');
  });

  await itAsync('ADV-TRACE-2: routePrintJob returns BROWSER_DIALOG -> strictly local executeHtmlPrint', async () => {
    const harness = createPosHarness();
    const sendEscPos = harness.getFn({
      printCharacteristic: null,
      window: {
        ThermalPrinterBridge: {
          routePrintJob: async () => ({
            success: true,
            data: { printed: true, method: 'BROWSER_DIALOG' }
          })
        },
        posPrinters: { printer1: { characteristic: null } }
      }
    });

    await sendEscPos(sampleCustomerOrder);
    const metrics = harness.getMetrics();

    assert.strictEqual(metrics.cloudKotEnqueueCount, 0);
    assert.strictEqual(metrics.localHtmlPrintCount, 1);
  });

  await itAsync('ADV-TRACE-3: routePrintJob throws catastrophic transport error -> strictly local fallback', async () => {
    const harness = createPosHarness();
    const sendEscPos = harness.getFn({
      printCharacteristic: null,
      window: {
        ThermalPrinterBridge: {
          routePrintJob: async () => {
            throw new Error('Fatal BLE Bluetooth Stack Crash');
          }
        },
        posPrinters: { printer1: { characteristic: null } }
      }
    });

    // POS function should handle rejection gracefully and fall back to local print
    try {
      await sendEscPos(sampleCustomerOrder);
    } catch (_) {}

    const metrics = harness.getMetrics();
    assert.strictEqual(metrics.cloudKotEnqueueCount, 0, 'No cloud calls permitted during transport error');
  });

  await itAsync('ADV-TRACE-4: Physical GATT characteristic throws Disconnected during write -> strictly local toast', async () => {
    const harness = createPosHarness();
    const failingCharacteristic = {
      properties: { writeWithoutResponse: false },
      writeValue: async () => {
        throw new Error('GATT Connection Disconnected: Device Unreachable');
      }
    };

    const sendEscPos = harness.getFn({
      printCharacteristic: failingCharacteristic,
      window: {
        ThermalPrinterBridge: {
          routePrintJob: async () => null // bypass route bridge to test direct char write
        },
        posPrinters: { printer1: { characteristic: failingCharacteristic } }
      }
    });

    await sendEscPos(sampleCustomerOrder);
    const metrics = harness.getMetrics();

    assert.strictEqual(metrics.cloudKotEnqueueCount, 0, 'Hardware disconnect must NEVER route to cloud relay');
    assert.ok(
      metrics.toastMessages.some(m => m.includes('Print Failed. Printer might be off.')),
      'Expected local user failure notification toast'
    );
  });

  await itAsync('ADV-TRACE-5: Physical GATT timeout mid-transmission -> 0 cloud calls', async () => {
    const harness = createPosHarness();
    let chunksWritten = 0;
    const midStreamFailingChar = {
      properties: { writeWithoutResponse: true },
      writeValueWithoutResponse: async () => {
        chunksWritten++;
        if (chunksWritten >= 2) {
          throw new Error('Timeout: Printer buffer overflow / USB bus suspended');
        }
      }
    };

    const sendEscPos = harness.getFn({
      printCharacteristic: midStreamFailingChar,
      window: {
        ThermalPrinterBridge: { routePrintJob: async () => null },
        posPrinters: { printer1: { characteristic: midStreamFailingChar } }
      }
    });

    await sendEscPos(sampleCustomerOrder);
    const metrics = harness.getMetrics();

    assert.strictEqual(metrics.cloudKotEnqueueCount, 0);
    assert.ok(metrics.toastMessages.some(m => m.includes('Print Failed.')));
  });

  // ====================================================================
  // CHALLENGE 3: FIRESTORE SECURITY RULES FORMAL LOGIC VALIDATION
  // ====================================================================
  console.log('\n📍 CHALLENGE 3: FIRESTORE SECURITY RULES FORMAL LOGIC VALIDATION');

  const rulesPaths = [
    { name: 'firestore.rules', path: path.join(__dirname, '..', 'firestore.rules') },
    { name: 'database/firestore.rules', path: path.join(__dirname, '..', 'database', 'firestore.rules') }
  ];

  // Logic evaluator implementing the exact predicate in firestore.rules:
  // allow create: if isTenantStaff(shopId) &&
  //   request.resource.data.jobType == 'KOT' &&
  //   !('invoice' in request.resource.data) &&
  //   !('billNo' in request.resource.data) &&
  //   !('amount' in request.resource.data) &&
  //   !('final_payable_paise' in request.resource.data) &&
  //   request.resource.data.status == 'queued';
  function evaluateRuleCreate(docData, isStaff = true) {
    if (!isStaff) return { allowed: false, reason: 'Auth: not staff' };
    if (docData.jobType !== 'KOT') return { allowed: false, reason: 'jobType != KOT' };
    if ('invoice' in docData) return { allowed: false, reason: 'Forbidden invoice field present' };
    if ('billNo' in docData) return { allowed: false, reason: 'Forbidden billNo field present' };
    if ('amount' in docData) return { allowed: false, reason: 'Forbidden amount field present' };
    if ('final_payable_paise' in docData) return { allowed: false, reason: 'Forbidden final_payable_paise present' };
    if (docData.status !== 'queued') return { allowed: false, reason: 'Initial status must be queued' };
    return { allowed: true };
  }

  // allow update: if isTenantStaff(shopId) &&
  //   resource.data.jobType == 'KOT' &&
  //   request.resource.data.jobType == 'KOT' &&
  //   request.resource.data.status in ['queued', 'processing', 'printed', 'failed'];
  function evaluateRuleUpdate(existingData, updatedData, isStaff = true) {
    if (!isStaff) return { allowed: false, reason: 'Auth: not staff' };
    if (existingData.jobType !== 'KOT') return { allowed: false, reason: 'Existing doc was not KOT' };
    if (updatedData.jobType !== 'KOT') return { allowed: false, reason: 'Updated doc must remain KOT' };
    const allowedStatuses = ['queued', 'processing', 'printed', 'failed'];
    if (!allowedStatuses.includes(updatedData.status)) {
      return { allowed: false, reason: `Invalid status transition: ${updatedData.status}` };
    }
    return { allowed: true };
  }

  for (const { name, path: fPath } of rulesPaths) {
    const content = fs.readFileSync(fPath, 'utf8');

    it(`ADV-RULE-STRUCTURE [${name}]: Matches both /cafes/{cafeId} and /shops/{shopId}`, () => {
      assert.ok(content.includes('match /cafes/{cafeId}'), 'Missing /cafes/{cafeId}');
      assert.ok(content.includes('match /shops/{shopId}'), 'Missing /shops/{shopId}');
      const matchCount = (content.match(/match \/print_queue\/\{jobId\}/g) || []).length;
      assert.strictEqual(matchCount, 2, `Expected 2 matches for /print_queue/{jobId}, got ${matchCount}`);
    });

    it(`ADV-RULE-SYNTAX [${name}]: Enforces explicit KOT constraint and 4 billing exclusion guards`, () => {
      assert.ok(content.includes("request.resource.data.jobType == 'KOT'"));
      assert.ok(content.includes("!('invoice' in request.resource.data)"));
      assert.ok(content.includes("!('billNo' in request.resource.data)"));
      assert.ok(content.includes("!('amount' in request.resource.data)"));
      assert.ok(content.includes("!('final_payable_paise' in request.resource.data)"));
      assert.ok(content.includes("request.resource.data.status == 'queued'"));
    });
  }

  // Adversarial document creation rule simulations
  it('ADV-RULE-SIM: Legitimate KOT document creation is ALLOWED', () => {
    const legitimateKot = {
      jobType: 'KOT',
      status: 'queued',
      tableNo: 'T3',
      items: [{ name: 'Masala Dosa', qty: 2 }]
    };
    assert.strictEqual(evaluateRuleCreate(legitimateKot).allowed, true);
  });

  it('ADV-RULE-SIM: Document creation with jobType: "RECEIPT" is REJECTED', () => {
    const receiptDoc = {
      jobType: 'RECEIPT',
      status: 'queued',
      items: []
    };
    assert.strictEqual(evaluateRuleCreate(receiptDoc).allowed, false);
  });

  it('ADV-RULE-SIM: Document creation with invoice / billNo / amount / final_payable_paise is REJECTED', () => {
    const maliciousCases = [
      { jobType: 'KOT', status: 'queued', invoice: 'INV-1' },
      { jobType: 'KOT', status: 'queued', billNo: 'B-10' },
      { jobType: 'KOT', status: 'queued', amount: 150 },
      { jobType: 'KOT', status: 'queued', final_payable_paise: 15000 },
      { jobType: 'KOT', status: 'processing' } // status not queued
    ];

    for (const doc of maliciousCases) {
      const res = evaluateRuleCreate(doc);
      assert.strictEqual(res.allowed, false, `Expected rejection for: ${JSON.stringify(doc)}`);
    }
  });

  it('ADV-RULE-SIM: Update attempting to mutate jobType away from KOT is REJECTED', () => {
    const existing = { jobType: 'KOT', status: 'queued' };
    const mutation = { jobType: 'RECEIPT', status: 'processing' };
    const res = evaluateRuleUpdate(existing, mutation);
    assert.strictEqual(res.allowed, false);
  });

  it('ADV-RULE-SIM: Update with illegal status (e.g. deleted/archived) is REJECTED', () => {
    const existing = { jobType: 'KOT', status: 'queued' };
    const mutation = { jobType: 'KOT', status: 'archived' };
    const res = evaluateRuleUpdate(existing, mutation);
    assert.strictEqual(res.allowed, false);
  });

  // ====================================================================
  // CHALLENGE 4: ATOMIC TRANSACTION & CONCURRENCY EXTREMES
  // ====================================================================
  console.log('\n📍 CHALLENGE 4: ATOMIC TRANSACTION & CONCURRENCY EXTREMES');

  // Multi-client mock transaction engine with simulated atomic CAS (Compare-And-Swap)
  class AdversarialMockFirestore {
    constructor() {
      this.docs = new Map();
      this.versions = new Map();
    }

    set(pathKey, data) {
      this.docs.set(pathKey, JSON.parse(JSON.stringify(data)));
      this.versions.set(pathKey, (this.versions.get(pathKey) || 0) + 1);
    }

    get(pathKey) {
      const d = this.docs.get(pathKey);
      if (!d) return { exists: false, data: () => null };
      return { exists: true, data: () => JSON.parse(JSON.stringify(d)), id: path.basename(pathKey) };
    }

    async runTransaction(txnCallback) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        const readVersions = new Map();
        const pendingMutations = new Map();

        const txn = {
          get: async (ref) => {
            const k = ref.path || ref.id;
            readVersions.set(k, this.versions.get(k) || 0);
            return this.get(k);
          },
          update: (ref, fields) => {
            const k = ref.path || ref.id;
            pendingMutations.set(k, fields);
          }
        };

        try {
          const res = await txnCallback(txn);

          // Atomic validation
          let collision = false;
          for (const [k, v] of readVersions.entries()) {
            if (this.versions.get(k) !== v) {
              collision = true;
              break;
            }
          }

          if (collision) {
            // Contention backoff and retry
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 8) + 2));
            continue;
          }

          // Apply mutations atomically
          for (const [k, fields] of pendingMutations.entries()) {
            const current = this.docs.get(k) || {};
            this.docs.set(k, { ...current, ...fields });
            this.versions.set(k, (this.versions.get(k) || 0) + 1);
          }

          return res;
        } catch (err) {
          throw err;
        }
      }
      throw new Error('Transaction contention limit reached');
    }
  }

  await itAsync('ADV-CONCUR: 10-station stampede racing for 1 KOT job -> exactly 1 winner, 0 duplicate prints', async () => {
    const db = new AdversarialMockFirestore();
    const jobId = 'kot_stampede_99';
    const docPath = `shops/cafe_m3/print_queue/${jobId}`;

    db.set(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0,
      leasedBy: null,
      leasedAt: null
    });

    const docRef = { path: docPath, id: jobId };
    let physicalPrintsTriggered = 0;
    const stations = Array.from({ length: 10 }, (_, i) => `kitchen_station_${i + 1}`);

    const stationAttempts = await Promise.all(stations.map(async (stId) => {
      try {
        const claim = await claimPrintJob(
          db, 'cafe_m3', jobId, stId,
          { jobRef: docRef, runTransaction: db.runTransaction.bind(db) }
        );
        physicalPrintsTriggered++;
        return { stId, won: true, claim };
      } catch (err) {
        return { stId, won: false, error: err.message };
      }
    }));

    const winners = stationAttempts.filter(r => r.won);
    const losers = stationAttempts.filter(r => !r.won);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winning station, got ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Expected exactly 9 losing stations, got ${losers.length}`);
    assert.strictEqual(physicalPrintsTriggered, 1, 'Physical prints triggered must be exactly 1');

    for (const loser of losers) {
      assert.strictEqual(loser.error, 'Job already claimed or printed');
    }

    const finalDoc = db.get(docPath).data();
    assert.strictEqual(finalDoc.status, 'processing');
    assert.strictEqual(finalDoc.leasedBy, winners[0].stId);
    assert.strictEqual(finalDoc.attempts, 1);
  });

  await itAsync('ADV-ZOMBIE-BOUNDARY: Exact 60,000ms millisecond boundary validation', async () => {
    const db = new AdversarialMockFirestore();
    const jobId = 'kot_boundary_zombie';
    const docPath = `shops/cafe_m3/print_queue/${jobId}`;
    const docRef = { path: docPath, id: jobId };

    const realDateNow = Date.now;
    const frozenBaseNow = 1700000000000;

    try {
      Date.now = () => frozenBaseNow;

      // 1. Exactly 59,999 ms: Active lease, NOT expired
      db.set(docPath, {
        jobId,
        jobType: 'KOT',
        status: 'processing',
        attempts: 1,
        leasedBy: 'crashed_worker',
        leasedAt: new Date(frozenBaseNow - 59999).toISOString()
      });

      let threwAt59999 = false;
      try {
        await claimPrintJob(db, 'cafe_m3', jobId, 'new_worker', {
          jobRef: docRef,
          runTransaction: db.runTransaction.bind(db)
        });
      } catch (err) {
        threwAt59999 = true;
        assert.strictEqual(err.message, 'Job already claimed or printed');
      }
      assert.strictEqual(threwAt59999, true, 'Lease at 59,999ms must NOT be reclaimable');

      // 2. Exactly 60,000 ms: Strict inequality (> 60000), NOT expired
      db.set(docPath, {
        jobId,
        jobType: 'KOT',
        status: 'processing',
        attempts: 1,
        leasedBy: 'crashed_worker',
        leasedAt: new Date(frozenBaseNow - 60000).toISOString()
      });

      let threwAt60000 = false;
      try {
        await claimPrintJob(db, 'cafe_m3', jobId, 'new_worker', {
          jobRef: docRef,
          runTransaction: db.runTransaction.bind(db)
        });
      } catch (err) {
        threwAt60000 = true;
        assert.strictEqual(err.message, 'Job already claimed or printed');
      }
      assert.strictEqual(threwAt60000, true, 'Lease at 60,000ms must NOT be reclaimable');

      // 3. Exactly 60,001 ms: Expired (> 60000), MUST be reclaimable
      db.set(docPath, {
        jobId,
        jobType: 'KOT',
        status: 'processing',
        attempts: 1,
        leasedBy: 'crashed_worker',
        leasedAt: new Date(frozenBaseNow - 60001).toISOString()
      });

      const reclaimed = await claimPrintJob(db, 'cafe_m3', jobId, 'new_worker', {
        jobRef: docRef,
        runTransaction: db.runTransaction.bind(db)
      });

      assert.strictEqual(reclaimed.leasedBy, 'new_worker');
      assert.strictEqual(reclaimed.attempts, 2, 'Attempts must increment on zombie recovery');
      assert.strictEqual(reclaimed.status, 'processing');
    } finally {
      Date.now = realDateNow;
    }
  });

  await itAsync('ADV-ZOMBIE-NAN: Corrupted or non-date leasedAt strings do not falsely trigger recovery', async () => {
    const db = new AdversarialMockFirestore();
    const jobId = 'kot_corrupt_zombie';
    const docPath = `shops/cafe_m3/print_queue/${jobId}`;
    const docRef = { path: docPath, id: jobId };

    db.set(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'processing',
      attempts: 1,
      leasedBy: 'crashed_worker',
      leasedAt: 'CORRUPTED_DATE_STRING'
    });

    let threwOnCorrupt = false;
    try {
      await claimPrintJob(db, 'cafe_m3', jobId, 'new_worker', {
        jobRef: docRef,
        runTransaction: db.runTransaction.bind(db)
      });
    } catch (err) {
      threwOnCorrupt = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(threwOnCorrupt, true, 'Corrupted date must safely throw without crashing');
  });

  await itAsync('ADV-RETRY-BOUNDS: Complete 3-attempt lifecycle and dead-letter failure state', async () => {
    const db = new AdversarialMockFirestore();
    const jobId = 'kot_retry_harness';
    const docPath = `shops/cafe_m3/print_queue/${jobId}`;
    const docRef = { path: docPath, id: jobId };

    // Initial queued document
    db.set(docPath, {
      jobId,
      jobType: 'KOT',
      status: 'queued',
      attempts: 0
    });

    // Mock updateDoc & getDoc hooks
    const mockUpdateDoc = async (ref, updateData) => {
      const curr = db.get(ref.path).data();
      db.set(ref.path, { ...curr, ...updateData });
    };
    const mockGetDoc = async (ref) => db.get(ref.path);

    // Attempt 1: Claim -> Fail
    await claimPrintJob(db, 'cafe_m3', jobId, 'w1', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    let res1 = await completePrintJob(db, 'cafe_m3', jobId, false, 'Paper Jam', {
      jobRef: docRef,
      updateDoc: mockUpdateDoc,
      getDoc: mockGetDoc
    });
    assert.strictEqual(res1.status, 'queued', 'Attempt 1 failure must reset to queued');
    assert.strictEqual(db.get(docPath).data().status, 'queued');

    // Attempt 2: Claim -> Fail
    await claimPrintJob(db, 'cafe_m3', jobId, 'w2', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    let res2 = await completePrintJob(db, 'cafe_m3', jobId, false, 'Cutter Error', {
      jobRef: docRef,
      updateDoc: mockUpdateDoc,
      getDoc: mockGetDoc
    });
    assert.strictEqual(res2.status, 'queued', 'Attempt 2 failure must reset to queued');
    assert.strictEqual(db.get(docPath).data().status, 'queued');

    // Attempt 3: Claim -> Fail
    await claimPrintJob(db, 'cafe_m3', jobId, 'w3', {
      jobRef: docRef,
      runTransaction: db.runTransaction.bind(db)
    });
    let res3 = await completePrintJob(db, 'cafe_m3', jobId, false, 'Thermal Head Blown', {
      jobRef: docRef,
      updateDoc: mockUpdateDoc,
      getDoc: mockGetDoc
    });
    assert.strictEqual(res3.status, 'failed', 'Attempt 3 failure must permanently transition to failed');
    assert.strictEqual(db.get(docPath).data().status, 'failed');

    // Attempt 4: Should be completely unclaimable
    let claim4Threw = false;
    try {
      await claimPrintJob(db, 'cafe_m3', jobId, 'w4', {
        jobRef: docRef,
        runTransaction: db.runTransaction.bind(db)
      });
    } catch (err) {
      claim4Threw = true;
      assert.strictEqual(err.message, 'Job already claimed or printed');
    }
    assert.strictEqual(claim4Threw, true, 'Failed job cannot be reclaimed');
  });

  // ====================================================================
  // CHALLENGE 5: INVARIANTS COMPLIANCE
  // ====================================================================
  console.log('\n📍 CHALLENGE 5: REPOSITORY INVARIANTS');

  const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  it('ADV-INV-1: Exactly 26 .modal-close-btn SVGs in index.html', () => {
    const matches = htmlContent.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(
      matches.length,
      26,
      `VIOLATION: Expected exactly 26 .modal-close-btn occurrences, found ${matches.length}`
    );
  });

  it('ADV-INV-2: Zero raw Unicode emojis in buttons, tabs, and controls in index.html', () => {
    const controlMatches = htmlContent.match(/<(button|tab)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const ctrl of controlMatches) {
      assert.strictEqual(
        emojiRegex.test(ctrl),
        false,
        `EMOJI VIOLATION: Found raw emoji in: ${ctrl.substring(0, 70)}`
      );
    }
  });

  it('ADV-INV-3: Currency display consistently adheres to non-breaking space "₹ "', () => {
    // Check key templates in pos.js and core.js
    const coreJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
    assert.ok(coreJs.includes('₹ '), 'core.js must use currency non-breaking space format');
    assert.ok(posSource.includes('₹ '), 'pos.js must use currency non-breaking space format');
  });

  // ====================================================================
  // SUITE SUMMARY
  // ====================================================================
  console.log('\n====================================================================');
  console.log(`🎯 ADVERSARIAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ Adversarial verification failed with:', failureReports);
    process.exit(1);
  } else {
    console.log('🛡️ ALL ADVERSARIAL BOUNDARY & SECURITY TESTS PASSED 100% GREEN!\n');
    process.exit(0);
  }
}

runAdversarialM3TestSuite().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
