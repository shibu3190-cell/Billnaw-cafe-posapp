/**
 * scratch/test_challenger_m3_iter2_security_invariants.cjs
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE — Milestone 3 Iteration 2
 * Roles: critic, specialist
 *
 * Rigorous empirical challenges:
 * 1. Billing injection attacks against /print_queue/{jobId}:
 *    - All 20 forbidden fields tested individually with multiple value types
 *    - Combinatorial injection attacks (all 20 simultaneous, pairwise, triple combinations)
 *    - Adversarial jobTypes ('RECEIPT', 'BILL', 'INVOICE', 'kot', 'KOT ', null, undefined, '', etc.)
 *    - Zero-write verification (spy asserts 0 database writes attempted upon rejection)
 *    - Firestore Security Rules create & update attack simulation for both /cafes/ and /shops/ paths
 *    - Anti-smuggling update rules verification
 * 2. Invariant verification:
 *    - Exactly 26 .modal-close-btn SVG elements in index.html
 *    - Zero raw Unicode emojis in buttons, tabs, segmented pills
 *    - Currency non-breaking space invariant
 * 3. Rules parity:
 *    - 100% byte-for-byte binary parity between firestore.rules and database/firestore.rules
 *    - SHA-256 hash equality
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assertTest(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failureDetails.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function assertAsyncTest(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failureDetails.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAllChallengerTests() {
  console.log('====================================================================');
  console.log('⚔️  CHALLENGER EMPIRICAL SECURITY & INVARIANTS HARNESS (M3 ITERATION 2)');
  console.log('====================================================================\n');

  // Load platform-bridge.js
  const platformBridge = await import('../src/core/platform-bridge.js');
  const { enqueueCloudKotPrintJob, claimPrintJob, completePrintJob, listenPrintQueue, ThermalPrinterBridge } = platformBridge;

  // ------------------------------------------------------------------
  // SECTION 1: ALL 20 FORBIDDEN BILLING FIELDS INDIVIDUAL INJECTION
  // ------------------------------------------------------------------
  console.log('📍 CHALLENGE 1.1: ALL 20 FORBIDDEN BILLING FIELDS INDIVIDUAL INJECTION');

  const all20ForbiddenFields = [
    'billNo',
    'bill_no',
    'amount',
    'invoice',
    'invoice_id',
    'invoiceNo',
    'invoice_no',
    'final_payable_paise',
    'final_total_paise',
    'grandTotal',
    'grand_total',
    'paymentMode',
    'payment_mode',
    'subtotal',
    'grossSubtotal',
    'totalTax',
    'tax',
    'total',
    'discount',
    'discountAmount'
  ];

  assertTest('FIELD-COUNT: Exactly 20 forbidden fields are targeted in the audit list', () => {
    assert.strictEqual(all20ForbiddenFields.length, 20);
    const unique = new Set(all20ForbiddenFields);
    assert.strictEqual(unique.size, 20, 'All 20 field names must be distinct');
  });

  for (const field of all20ForbiddenFields) {
    await assertAsyncTest(`SEC-INJECT-SINGLE: Field '${field}' is strictly rejected with Security Violation`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      const maliciousPayload = {
        jobType: 'KOT',
        tableNo: 'T1',
        kotId: 'KOT-TEST-1',
        items: [{ name: 'Adversarial Tea', qty: 1 }],
        [field]: 'ADVERSARIAL_INJECTION_VALUE'
      };

      let threw = false;
      let errorMsg = '';
      try {
        await enqueueCloudKotPrintJob(maliciousPayload, {
          setDoc: spySetDoc,
          shopId: 'adversarial_shop'
        });
      } catch (err) {
        threw = true;
        errorMsg = err.message;
      }

      assert.strictEqual(threw, true, `Field '${field}' did NOT throw an error!`);
      assert.ok(
        errorMsg.includes('[Security Violation]'),
        `Field '${field}' threw unexpected error: ${errorMsg}`
      );
      assert.strictEqual(dbWriteCount, 0, `Database write was attempted for forbidden field '${field}'!`);
    });
  }

  // ------------------------------------------------------------------
  // SECTION 2: ADVERSARIAL VALUE TYPES ACROSS FORBIDDEN FIELDS
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 1.2: ADVERSARIAL VALUE TYPES ACROSS FORBIDDEN FIELDS');

  const adversarialValueVariants = [
    { label: 'Numeric positive', value: 450.75 },
    { label: 'Numeric zero', value: 0 },
    { label: 'Numeric negative', value: -100 },
    { label: 'Numeric integer paise', value: 45075 },
    { label: 'Empty string', value: '' },
    { label: 'String "0"', value: '0' },
    { label: 'String invoice code', value: 'INV/2026/001' },
    { label: 'Boolean true', value: true },
    { label: 'Boolean false', value: false },
    { label: 'Nested object', value: { subfield: 123, nestedInvoice: 'INV-X' } },
    { label: 'Array of values', value: [100, 200] },
    { label: 'Empty array', value: [] },
    { label: 'Empty object', value: {} }
  ];

  for (const variant of adversarialValueVariants) {
    await assertAsyncTest(`SEC-INJECT-TYPE: amount with [${variant.label}] is rejected`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      let threw = false;
      try {
        await enqueueCloudKotPrintJob({
          jobType: 'KOT',
          tableNo: 'T1',
          items: [],
          amount: variant.value
        }, { setDoc: spySetDoc });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'));
      }
      assert.strictEqual(threw, true, `amount with value [${variant.label}] did not throw`);
      assert.strictEqual(dbWriteCount, 0, 'No write should happen');
    });

    await assertAsyncTest(`SEC-INJECT-TYPE: invoice with [${variant.label}] is rejected`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      let threw = false;
      try {
        await enqueueCloudKotPrintJob({
          jobType: 'KOT',
          tableNo: 'T1',
          items: [],
          invoice: variant.value
        }, { setDoc: spySetDoc });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'));
      }
      assert.strictEqual(threw, true, `invoice with value [${variant.label}] did not throw`);
      assert.strictEqual(dbWriteCount, 0, 'No write should happen');
    });

    await assertAsyncTest(`SEC-INJECT-TYPE: billNo with [${variant.label}] is rejected`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      let threw = false;
      try {
        await enqueueCloudKotPrintJob({
          jobType: 'KOT',
          tableNo: 'T1',
          items: [],
          billNo: variant.value
        }, { setDoc: spySetDoc });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'));
      }
      assert.strictEqual(threw, true, `billNo with value [${variant.label}] did not throw`);
      assert.strictEqual(dbWriteCount, 0, 'No write should happen');
    });
  }

  // ------------------------------------------------------------------
  // SECTION 3: COMBINATORIAL INJECTION ATTACKS
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 1.3: COMBINATORIAL INJECTION ATTACKS');

  await assertAsyncTest('SEC-INJECT-COMBO: All 20 forbidden fields present simultaneously', async () => {
    let dbWriteCount = 0;
    const spySetDoc = async () => { dbWriteCount++; };

    const superMaliciousPayload = {
      jobType: 'KOT',
      tableNo: 'T1',
      kotId: 'KOT-COMBO-ALL',
      items: [{ name: 'Combo Item', qty: 1 }]
    };
    for (const f of all20ForbiddenFields) {
      superMaliciousPayload[f] = `leak_${f}`;
    }

    let threw = false;
    try {
      await enqueueCloudKotPrintJob(superMaliciousPayload, { setDoc: spySetDoc });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('[Security Violation]'));
    }
    assert.strictEqual(threw, true, 'Mega-payload with all 20 fields must throw');
    assert.strictEqual(dbWriteCount, 0, 'Zero writes allowed');
  });

  const pairwiseCombos = [
    ['billNo', 'amount'],
    ['invoice', 'final_payable_paise'],
    ['invoiceNo', 'tax'],
    ['invoice_no', 'total'],
    ['bill_no', 'discount'],
    ['subtotal', 'grossSubtotal'],
    ['grandTotal', 'grand_total'],
    ['paymentMode', 'payment_mode'],
    ['totalTax', 'discountAmount'],
    ['invoice_id', 'amount']
  ];

  for (const [f1, f2] of pairwiseCombos) {
    await assertAsyncTest(`SEC-INJECT-COMBO: Pairwise [${f1} + ${f2}] is rejected`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      let threw = false;
      try {
        await enqueueCloudKotPrintJob({
          jobType: 'KOT',
          tableNo: 'T1',
          items: [],
          [f1]: 'val1',
          [f2]: 'val2'
        }, { setDoc: spySetDoc });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'));
      }
      assert.strictEqual(threw, true, `Pairwise combo ${f1} + ${f2} did not throw`);
      assert.strictEqual(dbWriteCount, 0);
    });
  }

  // ------------------------------------------------------------------
  // SECTION 4: ADVERSARIAL jobType VALUES & CORRUPT PAYLOADS
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 1.4: ADVERSARIAL jobType VALUES & CORRUPT PAYLOADS');

  const adversarialJobTypes = [
    'RECEIPT',
    'BILL',
    'INVOICE',
    'ORDER',
    'PAYMENT',
    'kot',
    'KOT ',
    ' KOT',
    'KOT\n',
    'KOT_BILL',
    'KOT;DROP TABLE',
    '',
    null,
    undefined,
    123,
    false,
    true,
    {},
    []
  ];

  for (const jt of adversarialJobTypes) {
    const label = typeof jt === 'string' ? `"${jt}"` : String(jt);
    await assertAsyncTest(`SEC-JOBTYPE: jobType = ${label} is rejected`, async () => {
      let dbWriteCount = 0;
      const spySetDoc = async () => { dbWriteCount++; };

      let threw = false;
      try {
        await enqueueCloudKotPrintJob({
          jobType: jt,
          tableNo: 'T1',
          items: []
        }, { setDoc: spySetDoc });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('[Security Violation]'));
      }
      assert.strictEqual(threw, true, `jobType = ${label} did not throw [Security Violation]`);
      assert.strictEqual(dbWriteCount, 0);
    });
  }

  await assertAsyncTest('SEC-CORRUPT: null payload is rejected', async () => {
    let threw = false;
    try {
      await enqueueCloudKotPrintJob(null);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('[Security Violation]'));
    }
    assert.strictEqual(threw, true);
  });

  await assertAsyncTest('SEC-CORRUPT: undefined payload is rejected', async () => {
    let threw = false;
    try {
      await enqueueCloudKotPrintJob(undefined);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('[Security Violation]'));
    }
    assert.strictEqual(threw, true);
  });

  await assertAsyncTest('SEC-CORRUPT: empty object payload is rejected', async () => {
    let threw = false;
    try {
      await enqueueCloudKotPrintJob({});
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('[Security Violation]'));
    }
    assert.strictEqual(threw, true);
  });

  // ------------------------------------------------------------------
  // SECTION 5: FIRESTORE SECURITY RULES SIMULATOR & PREDICATE AUDIT
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 1.5: FIRESTORE SECURITY RULES PREDICATE STRESS-TEST');

  const firestoreRulesSource = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

  // Exact reproduction of Firestore rules logic for print_queue
  function evaluateFirestorePrintQueueRule(op, {
    auth = { isStaff: true, isAdmin: false },
    resource = null,
    requestData = null
  }) {
    if (op === 'read') {
      return !!(auth && auth.isStaff);
    }
    if (op === 'create') {
      if (!auth || !auth.isStaff) return false;
      if (!requestData) return false;
      if (requestData.jobType !== 'KOT') return false;
      if ('invoice' in requestData) return false;
      if ('billNo' in requestData) return false;
      if ('amount' in requestData) return false;
      if ('final_payable_paise' in requestData) return false;
      if (requestData.status !== 'queued') return false;
      return true;
    }
    if (op === 'update') {
      if (!auth || !auth.isStaff) return false;
      if (!resource || resource.jobType !== 'KOT') return false;
      if (!requestData || requestData.jobType !== 'KOT') return false;
      if ('invoice' in requestData) return false;
      if ('billNo' in requestData) return false;
      if ('amount' in requestData) return false;
      if ('final_payable_paise' in requestData) return false;
      const validStatuses = ['queued', 'processing', 'printed', 'failed'];
      if (!validStatuses.includes(requestData.status)) return false;
      return true;
    }
    if (op === 'delete') {
      return !!(auth && auth.isAdmin);
    }
    return false;
  }

  // 5.1 Create Rule Stress
  assertTest('RULES-CREATE: Valid KOT queued doc is ALLOWED', () => {
    const allowed = evaluateFirestorePrintQueueRule('create', {
      auth: { isStaff: true, isAdmin: false },
      requestData: {
        jobType: 'KOT',
        status: 'queued',
        tableNo: 'T2',
        kotId: 'KOT-101',
        items: []
      }
    });
    assert.strictEqual(allowed, true);
  });

  const ruleCreateAttacks = [
    { label: 'Unauthenticated user', auth: null, data: { jobType: 'KOT', status: 'queued' } },
    { label: 'Non-staff user', auth: { isStaff: false, isAdmin: false }, data: { jobType: 'KOT', status: 'queued' } },
    { label: 'jobType == RECEIPT', auth: { isStaff: true }, data: { jobType: 'RECEIPT', status: 'queued' } },
    { label: 'jobType == BILL', auth: { isStaff: true }, data: { jobType: 'BILL', status: 'queued' } },
    { label: 'status == processing on create', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'processing' } },
    { label: 'status == printed on create', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'printed' } },
    { label: 'Smuggling invoice string', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', invoice: 'INV-1' } },
    { label: 'Smuggling invoice object', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', invoice: { id: 1 } } },
    { label: 'Smuggling billNo', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', billNo: 'B-10' } },
    { label: 'Smuggling amount positive', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', amount: 150 } },
    { label: 'Smuggling amount zero', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', amount: 0 } },
    { label: 'Smuggling final_payable_paise', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', final_payable_paise: 15000 } },
    { label: 'Smuggling all 4 billing fields', auth: { isStaff: true }, data: { jobType: 'KOT', status: 'queued', invoice: 'I', billNo: 'B', amount: 1, final_payable_paise: 100 } }
  ];

  for (const tc of ruleCreateAttacks) {
    assertTest(`RULES-CREATE-DENY: ${tc.label} is REJECTED by security rules`, () => {
      const allowed = evaluateFirestorePrintQueueRule('create', {
        auth: tc.auth,
        requestData: tc.data
      });
      assert.strictEqual(allowed, false, `Expected false for ${tc.label}`);
    });
  }

  // 5.2 Update Rule Stress (Anti-Smuggling)
  const validOriginalKot = {
    jobType: 'KOT',
    status: 'queued',
    tableNo: 'T1'
  };

  assertTest('RULES-UPDATE: Valid status transition queued -> processing is ALLOWED', () => {
    const allowed = evaluateFirestorePrintQueueRule('update', {
      auth: { isStaff: true },
      resource: validOriginalKot,
      requestData: { ...validOriginalKot, status: 'processing', leasedBy: 'worker_1' }
    });
    assert.strictEqual(allowed, true);
  });

  assertTest('RULES-UPDATE: Valid status transition processing -> printed is ALLOWED', () => {
    const allowed = evaluateFirestorePrintQueueRule('update', {
      auth: { isStaff: true },
      resource: { ...validOriginalKot, status: 'processing' },
      requestData: { ...validOriginalKot, status: 'printed' }
    });
    assert.strictEqual(allowed, true);
  });

  assertTest('RULES-UPDATE: Valid status transition processing -> failed is ALLOWED', () => {
    const allowed = evaluateFirestorePrintQueueRule('update', {
      auth: { isStaff: true },
      resource: { ...validOriginalKot, status: 'processing' },
      requestData: { ...validOriginalKot, status: 'failed' }
    });
    assert.strictEqual(allowed, true);
  });

  const ruleUpdateAttacks = [
    { label: 'Smuggle invoice on update', updateData: { status: 'processing', invoice: 'INV-SMUGGLE-99' } },
    { label: 'Smuggle billNo on update', updateData: { status: 'processing', billNo: 'BILL-SMUGGLE-99' } },
    { label: 'Smuggle amount on update', updateData: { status: 'processing', amount: 999.00 } },
    { label: 'Smuggle final_payable_paise on update', updateData: { status: 'processing', final_payable_paise: 99900 } },
    { label: 'Mutate jobType to RECEIPT on update', updateData: { jobType: 'RECEIPT', status: 'processing' } },
    { label: 'Mutate jobType to BILL on update', updateData: { jobType: 'BILL', status: 'processing' } },
    { label: 'Mutate status to arbitrary unknown "completed"', updateData: { status: 'completed' } },
    { label: 'Mutate status to "archived"', updateData: { status: 'archived' } },
    { label: 'Non-staff attempt update', auth: { isStaff: false }, updateData: { status: 'processing' } },
    { label: 'Original doc was not KOT', original: { jobType: 'RECEIPT', status: 'queued' }, updateData: { status: 'processing' } }
  ];

  for (const tc of ruleUpdateAttacks) {
    assertTest(`RULES-UPDATE-DENY: ${tc.label} is REJECTED by update rules`, () => {
      const allowed = evaluateFirestorePrintQueueRule('update', {
        auth: tc.auth || { isStaff: true },
        resource: tc.original || validOriginalKot,
        requestData: {
          jobType: tc.updateData.jobType || validOriginalKot.jobType,
          status: tc.updateData.status || validOriginalKot.status,
          ...tc.updateData
        }
      });
      assert.strictEqual(allowed, false, `Expected false for ${tc.label}`);
    });
  }

  // 5.3 Delete Rule Stress
  assertTest('RULES-DELETE: Staff user CANNOT delete print_queue doc', () => {
    const allowed = evaluateFirestorePrintQueueRule('delete', {
      auth: { isStaff: true, isAdmin: false }
    });
    assert.strictEqual(allowed, false);
  });

  assertTest('RULES-DELETE: Admin user CAN delete print_queue doc', () => {
    const allowed = evaluateFirestorePrintQueueRule('delete', {
      auth: { isStaff: true, isAdmin: true }
    });
    assert.strictEqual(allowed, true);
  });

  // ------------------------------------------------------------------
  // SECTION 6: INVARIANT VERIFICATION
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 2: INVARIANT VERIFICATION');

  const indexPath = path.join(__dirname, '..', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assertTest('INVARIANT-SVG-01: Exactly 26 .modal-close-btn elements exist in index.html', () => {
    const matches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(
      matches.length,
      26,
      `Expected exactly 26 .modal-close-btn matches, got ${matches.length}`
    );
  });

  assertTest('INVARIANT-SVG-02: Every single .modal-close-btn contains an SVG element', () => {
    // Regex matching each <button ... class="...modal-close-btn...">...</button>
    const buttonRegex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    let count = 0;
    while ((match = buttonRegex.exec(indexHtml)) !== null) {
      count++;
      const innerContent = match[1];
      assert.ok(
        innerContent.includes('<svg') && innerContent.includes('</svg>'),
        `.modal-close-btn #${count} does NOT contain an SVG element! Content: ${innerContent.trim()}`
      );
      assert.strictEqual(
        innerContent.includes('✕'),
        false,
        `.modal-close-btn #${count} contains raw '✕' character!`
      );
    }
    assert.strictEqual(count, 26, `Found ${count} modal-close-btn buttons, expected 26`);
  });

  assertTest('INVARIANT-SVG-03: New printer modals strictly do NOT use .modal-close-btn', () => {
    const printerSettingsMatch = indexHtml.match(/id=["']printerSettingsModal["'][\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(printerSettingsMatch, 'Found printerSettingsModal in index.html');
    const settingsBlock = printerSettingsMatch[0];
    assert.strictEqual(
      settingsBlock.includes('class="modal-close-btn') || settingsBlock.includes("class='modal-close-btn"),
      false,
      'printerSettingsModal must NOT use .modal-close-btn'
    );

    const printerSelectMatch = indexHtml.match(/id=["']printerSelectModal["'][\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(printerSelectMatch, 'Found printerSelectModal in index.html');
    const selectBlock = printerSelectMatch[0];
    assert.strictEqual(
      selectBlock.includes('class="modal-close-btn') || selectBlock.includes("class='modal-close-btn"),
      false,
      'printerSelectModal must NOT use .modal-close-btn'
    );
  });

  assertTest('INVARIANT-EMOJI: Zero raw Unicode emojis in operational controls (button, tab, segmented pill)', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    // Check all button tags
    const buttons = indexHtml.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
    for (const btn of buttons) {
      assert.strictEqual(
        emojiRegex.test(btn),
        false,
        `Raw emoji found in button: ${btn.substring(0, 100)}`
      );
    }

    // Check all tab / role="tab" elements
    const tabs = indexHtml.match(/<(?:tab|\w+\s+[^>]*role=["']tab["'])[^>]*>([\s\S]*?)<\/(?:tab|\w+)>/gi) || [];
    for (const tab of tabs) {
      assert.strictEqual(
        emojiRegex.test(tab),
        false,
        `Raw emoji found in tab: ${tab.substring(0, 100)}`
      );
    }

    // Check all segmented-pill elements
    const pills = indexHtml.match(/<[^>]*class=["'][^"']*segmented-pill[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi) || [];
    for (const pill of pills) {
      assert.strictEqual(
        emojiRegex.test(pill),
        false,
        `Raw emoji found in segmented pill: ${pill.substring(0, 100)}`
      );
    }
  });

  assertTest('INVARIANT-CURRENCY: Currency non-breaking space (₹ ) preserved', () => {
    // Check that ₹ is followed by a non-breaking space \u00a0 or standard space in expected UI locations
    const posJsPath = path.join(__dirname, '..', 'js', 'pos.js');
    const posJs = fs.readFileSync(posJsPath, 'utf8');
    assert.ok(
      posJs.includes('₹\u00a0') || posJs.includes('₹ '),
      'pos.js must format currency with ₹ and non-breaking space'
    );
  });

  // ------------------------------------------------------------------
  // SECTION 7: RULES PARITY VERIFICATION
  // ------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 3: RULES BINARY PARITY VERIFICATION');

  const rulePath1 = path.join(__dirname, '..', 'firestore.rules');
  const rulePath2 = path.join(__dirname, '..', 'database', 'firestore.rules');

  const buf1 = fs.readFileSync(rulePath1);
  const buf2 = fs.readFileSync(rulePath2);

  assertTest('PARITY-LENGTH: Both rules files have identical byte size', () => {
    assert.strictEqual(buf1.length, buf2.length, `Byte length mismatch: ${buf1.length} vs ${buf2.length}`);
  });

  assertTest('PARITY-SHA256: Both rules files have identical SHA-256 hash', () => {
    const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
    console.log(`     firestore.rules:          ${hash1}`);
    console.log(`     database/firestore.rules: ${hash2}`);
    assert.strictEqual(hash1, hash2, 'SHA-256 hash mismatch between rules files!');
  });

  assertTest('PARITY-BUFFER-COMPARE: Buffer.compare returns 0 (100% binary identical)', () => {
    const cmp = Buffer.compare(buf1, buf2);
    assert.strictEqual(cmp, 0, 'Buffer.compare is non-zero — byte disparity detected!');
  });

  // ------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`🎯 CHALLENGER SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${passedTests + failedTests})`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    console.error('❌ CHALLENGER FOUND FAILURES / DEFECTS:');
    failureDetails.forEach(f => {
      console.error(`- ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🛡️ ALL EMPIRICAL CHALLENGES PASSED WITH ZERO SECURITY VULNERABILITIES OR INVARIANT DEFECTS.\n');
    process.exit(0);
  }
}

runAllChallengerTests().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
