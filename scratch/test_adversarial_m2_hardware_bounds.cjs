/**
 * ⚔️ ADVERSARIAL STRESS & HARDWARE BOUNDS TEST SUITE: MILESTONE 2 (R2)
 * 
 * Target: Dual Thermal Printer Management and Routing Subsystem
 * Scope:
 *   1. Dynamic Paper Width Formatting & Zero Column Overflow Bounds (80mm @ 48 cols vs 58mm @ 32 cols)
 *   2. Modal Lifecycle Stress & DOM Invariant Integrity (#printerSettingsModal & #printerSelectModal)
 *   3. Strict Vector Invariant Verification (Exactly 26 .modal-close-btn SVGs, .printer-close-btn adoption)
 *   4. Zero Raw Unicode Emoji Scan across newly added controls, buttons, and configs
 *   5. Routing Engine Peripheral Bounds, Fallbacks & Error Resilience
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup Node.js globals for DOM & Storage
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

/**
 * Strips binary ESC/POS control sequences to isolate printable text strings.
 * Accurately handles ESC @, ESC a n, ESC E n, ESC m, GS ! n, GS V m n, and C0 control codes.
 */
function cleanEscPosText(uint8Bytes) {
  const rawText = new TextDecoder().decode(uint8Bytes);
  return rawText
    .replace(/\x1B\x40/g, '')               // ESC @ (Init)
    .replace(/\x1B\x61[\s\S]/g, '')         // ESC a n (Alignment)
    .replace(/\x1B\x45[\s\S]/g, '')         // ESC E n (Bold)
    .replace(/\x1B\x6D/g, '')               // ESC m (Partial cut)
    .replace(/\x1D\x21[\s\S]/g, '')         // GS ! n (Font size)
    .replace(/\x1D\x56[\s\S]{2}/g, '')      // GS V m n (Paper cut)
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ''); // Non-printable control characters (excluding newline)
}

async function runAdversarialHardwareBoundsSuite() {
  console.log('====================================================================');
  console.log('⚔️  ADVERSARIAL HARDWARE BOUNDS & DOM STRESS TEST SUITE (M2 - R2)');
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
      console.error(`  ❌ FAIL (DEFECT FOUND): ${name}\n     ${err.message}`);
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
      console.error(`  ❌ FAIL (DEFECT FOUND): ${name}\n     ${err.message}`);
      failureReports.push({ name, error: err.message, stack: err.stack });
    }
  }

  // Import Platform Bridge
  const { ThermalPrinterBridge, DEFAULT_PRINTERS_CONFIG } = await import('../src/core/platform-bridge.js');

  // ============================================================================
  // SECTION 1: DYNAMIC PAPER WIDTH FORMATTING & ZERO COLUMN OVERFLOW BOUNDS
  // ============================================================================
  console.log('📍 SECTION 1: DYNAMIC PAPER WIDTH FORMATTING & ZERO COLUMN OVERFLOW');

  it('WIDTH-01: Standard 80mm customer receipt strictly formats at 48 columns with zero line overflow', () => {
    const invoice = {
      billNo: 'INV-80-001',
      date: '2026-11-06 14:30:00',
      orderType: 'Dine-In',
      paymentMode: 'UPI',
      customer: 'Aarav Patel',
      biller: 'Cashier 1',
      amount: 520,
      final_payable_paise: 52000,
      rawItems: [
        { name: 'Espresso Romano Single', qty: 2, price: 120 },
        { name: 'Artisanal Sourdough Avocado Toast', qty: 1, price: 280 }
      ]
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(invoice, '80mm');
    const cleaned = cleanEscPosText(bytes);
    const lines = cleaned.split('\n');

    // Verify 48-char divider presence
    assert.ok(lines.includes('-'.repeat(48)), '80mm ticket must include 48-char divider');

    // Verify header table row
    const expectedHeader = 'ITEM'.padEnd(28, ' ') + '  ' + 'QTY'.padStart(4, ' ') + '  ' + 'AMOUNT'.padStart(12, ' ');
    assert.ok(lines.includes(expectedHeader), '80mm header row mismatch');
    assert.strictEqual(expectedHeader.length, 48, 'Header row must be exactly 48 characters');

    // Check zero column overflow on every printable line
    const overflowLines = lines.filter(line => line.length > 48);
    assert.strictEqual(
      overflowLines.length,
      0,
      `80mm receipt produced ${overflowLines.length} lines exceeding 48 columns: ${JSON.stringify(overflowLines)}`
    );
  });

  it('WIDTH-02: Adversarial 80mm receipt with 100+ char items, huge quantities and prices formats without overflow', () => {
    const hostileInvoice = {
      billNo: 'INV-HOSTILE-9999999999',
      date: '2026-11-06 23:59:59 PM IST',
      orderType: 'Dine-In Luxury Private Suite',
      paymentMode: 'International Corporate Credit Card',
      customer: 'Dr. Subramanian Chandrasekharan Ramachandran Nair',
      biller: 'Shift Senior Head Administrator Vikramaditya Singh',
      amount: 9876543.50,
      final_payable_paise: 987654350,
      rawItems: [
        {
          name: 'Supercalifragilisticexpialidocious Ultra Premium Triple Chocolate Belgian Truffle Waffle With Madagascar Vanilla Pod Infusion And Caramelized Macadamia Crunch',
          qty: 99999,
          price: 999999.99
        },
        {
          name: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', // 80 consecutive W's without space
          qty: 1,
          price: 50.00
        }
      ]
    };

    const profile = {
      name: 'The Imperial Crown Palace Fine Dining Restaurant & Artisanal Brewery Private Limited Bangalore',
      address: 'Suite 909-A, Level 9, Tower C, Embassy Tech Village, Outer Ring Road, Devarabeesanahalli, Bengaluru 560103',
      phone: '+91-9876543210 / +91-8765432109',
      fssai: '12345678901234567890',
      gstin: '29AAAAA0000A1Z5',
      gstMode: 'inclusive'
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(hostileInvoice, '80mm', { storeProfile: profile });
    const cleaned = cleanEscPosText(bytes);
    const lines = cleaned.split('\n');

    const overflowLines = lines.filter(line => line.length > 48);
    assert.strictEqual(
      overflowLines.length,
      0,
      `Hostile 80mm ticket produced ${overflowLines.length} lines exceeding 48 columns: ${JSON.stringify(overflowLines)}`
    );
  });

  it('WIDTH-03: Standard 58mm kitchen KOT strictly formats at 32 columns with zero line overflow', () => {
    const kotPayload = {
      jobType: 'KOT',
      table: 'T4',
      tableNo: 'T4',
      date: '14:35:10',
      biller: 'Captain Roy',
      items: [
        { name: 'Veg Hakka Noodles', qty: 2, notes: 'Less oil, spicy' },
        { name: 'Crispy Baby Corn', qty: 1, notes: 'Extra crispy' }
      ]
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(kotPayload, '58mm', { isKot: true });
    const cleaned = cleanEscPosText(bytes);
    const lines = cleaned.split('\n');

    // Verify 32-char divider presence
    assert.ok(lines.includes('-'.repeat(32)), '58mm KOT must include 32-char divider');

    // Check zero column overflow
    const overflowLines = lines.filter(line => line.length > 32);
    assert.strictEqual(
      overflowLines.length,
      0,
      `58mm KOT produced ${overflowLines.length} lines exceeding 32 columns: ${JSON.stringify(overflowLines)}`
    );
  });

  it('WIDTH-04: Adversarial 58mm KOT with long dish names, continuous tokens, and extreme notes formats without overflow', () => {
    const hostileKot = {
      jobType: 'KOT',
      table: 'VIP Dining Hall Table 44 North Wing Terrace',
      date: '11:59:59 PM',
      biller: 'Sous Chef Dharmendra Sharma',
      items: [
        {
          name: 'Handcrafted Wood-Fired Neapolitan Pizza Margherita Con Bufala D.O.P.',
          qty: 12,
          notes: 'Customer is severely allergic to garlic and onions. Please sanitize all utensils and prepare in isolated station.'
        },
        {
          name: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // 48 consecutive chars without space
          qty: 99,
          notes: 'URGENT_RUSH_ORDER_EXPEDITE_IMMEDIATELY'
        }
      ],
      special_instructions: 'Customer celebrating 50th golden wedding anniversary. Please present with celebratory sparkler candle.'
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(hostileKot, '58mm', { isKot: true });
    const cleaned = cleanEscPosText(bytes);
    const lines = cleaned.split('\n');

    const overflowLines = lines.filter(line => line.length > 32);
    assert.strictEqual(
      overflowLines.length,
      0,
      `Hostile 58mm KOT produced ${overflowLines.length} lines exceeding 32 columns: ${JSON.stringify(overflowLines)}`
    );
  });

  it('WIDTH-05: Swapped paper roll width: Receipt on 58mm and KOT on 80mm format accurately with zero overflow', () => {
    // Scenario A: Customer receipt sent to 58mm printer
    const receipt = {
      billNo: 'INV-SWAP-58',
      amount: 350,
      rawItems: [{ name: 'Cappuccino Caramel Large', qty: 2, price: 175 }]
    };
    const receipt58Bytes = ThermalPrinterBridge.generateEscPosCommands(receipt, '58mm');
    const cleanedReceipt58 = cleanEscPosText(receipt58Bytes);
    const linesReceipt58 = cleanedReceipt58.split('\n');

    assert.ok(linesReceipt58.includes('-'.repeat(32)), '58mm receipt must contain 32-char divider');
    const overReceipt58 = linesReceipt58.filter(l => l.length > 32);
    assert.strictEqual(overReceipt58.length, 0, `58mm receipt produced overflow lines: ${JSON.stringify(overReceipt58)}`);

    // Scenario B: Kitchen KOT sent to 80mm wide printer
    const kot = {
      table: 'T-10',
      items: [{ name: 'Double Cheese Margherita', qty: 1 }]
    };
    const kot80Bytes = ThermalPrinterBridge.generateEscPosCommands(kot, '80mm', { isKot: true });
    const cleanedKot80 = cleanEscPosText(kot80Bytes);
    const linesKot80 = cleanedKot80.split('\n');

    assert.ok(linesKot80.includes('-'.repeat(48)), '80mm KOT must contain 48-char divider');
    const overKot80 = linesKot80.filter(l => l.length > 48);
    assert.strictEqual(overKot80.length, 0, `80mm KOT produced overflow lines: ${JSON.stringify(overKot80)}`);
  });

  // ============================================================================
  // SECTION 2: MODAL LIFECYCLE STRESS & DOM INVARIANT INTEGRITY
  // ============================================================================
  console.log('\n📍 SECTION 2: MODAL LIFECYCLE STRESS & DOM INVARIANT INTEGRITY');

  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Build simulated DOM elements based on actual index.html IDs
  const simulatedDom = new Map();
  function createSimulatedElement(id, tagName = 'div', extra = {}) {
    const el = {
      id,
      tagName,
      style: { display: 'none' },
      value: '',
      checked: false,
      innerText: '',
      innerHTML: '',
      attributes: {},
      onclick: null,
      onchange: null,
      ...extra
    };
    simulatedDom.set(id, el);
    return el;
  }

  // Populate mock elements required by pos.js printer modal functions
  createSimulatedElement('printerSettingsModal', 'div');
  createSimulatedElement('printerSelectModal', 'div');
  createSimulatedElement('printerSelectRoleLabel', 'span');
  createSimulatedElement('printer1Transport', 'select', { value: 'BLUETOOTH' });
  createSimulatedElement('printer1PaperWidth', 'select', { value: '80mm' });
  createSimulatedElement('printer1Host', 'input', { value: '' });
  createSimulatedElement('printer1Port', 'input', { value: '9100' });
  createSimulatedElement('printer1NetworkSettings', 'div');
  createSimulatedElement('printer1StatusBadge', 'span');
  createSimulatedElement('printer1DeviceNameDisplay', 'span');
  createSimulatedElement('btnPairPrinter1', 'button');
  createSimulatedElement('btnPairPrinter1Text', 'span');
  createSimulatedElement('btnTestPrinter1', 'button');
  createSimulatedElement('printer2Transport', 'select', { value: 'BLUETOOTH' });
  createSimulatedElement('printer2PaperWidth', 'select', { value: '58mm' });
  createSimulatedElement('printer2Host', 'input', { value: '' });
  createSimulatedElement('printer2Port', 'input', { value: '9100' });
  createSimulatedElement('printer2NetworkSettings', 'div');
  createSimulatedElement('printer2StatusBadge', 'span');
  createSimulatedElement('printer2DeviceNameDisplay', 'span');
  createSimulatedElement('btnPairPrinter2', 'button');
  createSimulatedElement('btnPairPrinter2Text', 'span');
  createSimulatedElement('btnTestPrinter2', 'button');
  createSimulatedElement('cfgDefaultReceiptPrinter', 'select', { value: 'printer1' });
  createSimulatedElement('cfgDefaultKotPrinter', 'select', { value: 'printer2' });
  createSimulatedElement('cfgAlwaysPromptPrinters', 'input', { checked: false });
  createSimulatedElement('btnSavePrinterSettings', 'button');
  createSimulatedElement('printer1SelectName', 'div');
  createSimulatedElement('printer1SelectDetails', 'div');
  createSimulatedElement('printer1SelectStatusBadge', 'span');
  createSimulatedElement('btnSelectPrinter1', 'button');
  createSimulatedElement('printer2SelectName', 'div');
  createSimulatedElement('printer2SelectDetails', 'div');
  createSimulatedElement('printer2SelectStatusBadge', 'span');
  createSimulatedElement('btnSelectPrinter2', 'button');
  createSimulatedElement('btnSelectSystemDialog', 'button');
  createSimulatedElement('btnSelectPrinterCancel', 'button');

  // Bind document.getElementById to simulatedDom
  global.document.getElementById = (id) => simulatedDom.get(id) || null;

  // Read pos.js printer modal functions
  const posJsPath = path.join(__dirname, '..', 'js', 'pos.js');
  const posJsContent = fs.readFileSync(posJsPath, 'utf8');

  // Evaluate pos.js printer modal block in an isolated scope
  const posContext = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    ThermalPrinterBridge,
    alert: () => {},
    showToast: () => {}
  };

  // Extract printer functions from pos.js
  const endMarker = 'window.handleInteractivePrinterSelect = handleInteractivePrinterSelect;';
  const printerFunctionsCode = `
    ${posJsContent.slice(
      posJsContent.indexOf('function openPrinterSettingsModal('),
      posJsContent.indexOf(endMarker) + endMarker.length
    )}
    return {
      openPrinterSettingsModal,
      closePrinterSettingsModal,
      handlePrinterTransportChange,
      updatePrinterSlotBadges,
      savePrinterSettingsFromUi,
      openPrinterSelectModal,
      closePrinterSelectModal,
      handleInteractivePrinterSelect,
      getSelectCallback: () => _printerSelectCallback
    };
  `;

  const posPrinterFns = new Function('window', 'document', 'localStorage', 'ThermalPrinterBridge', 'showToast', 'alert', printerFunctionsCode)(
    global.window,
    global.document,
    global.localStorage,
    ThermalPrinterBridge,
    () => {},
    () => {}
  );

  it('MODAL-01: 500 rapid open/close cycles on #printerSettingsModal maintain clean display states without element accumulation', () => {
    const modal = simulatedDom.get('printerSettingsModal');
    const initialDomSize = simulatedDom.size;

    for (let i = 0; i < 500; i++) {
      posPrinterFns.openPrinterSettingsModal();
      assert.strictEqual(modal.style.display, 'flex', `Iteration ${i}: modal should be flex on open`);

      posPrinterFns.closePrinterSettingsModal();
      assert.strictEqual(modal.style.display, 'none', `Iteration ${i}: modal should be none on close`);
    }

    // Assert DOM size remained constant
    assert.strictEqual(simulatedDom.size, initialDomSize, 'DOM element map count must not increase');
  });

  it('MODAL-02: 500 rapid open/close cycles on #printerSelectModal nullify callback reference preventing memory leaks', () => {
    const selectModal = simulatedDom.get('printerSelectModal');
    let lastResult = null;

    for (let i = 0; i < 500; i++) {
      lastResult = null;
      posPrinterFns.openPrinterSelectModal('RECEIPT', (res) => {
        lastResult = res;
      });

      assert.strictEqual(selectModal.style.display, 'flex');
      assert.ok(posPrinterFns.getSelectCallback() !== null, 'Callback must be active while open');

      const choice = (i % 3 === 0) ? 'printer1' : ((i % 3 === 1) ? 'printer2' : 'SYSTEM_DIALOG');
      posPrinterFns.handleInteractivePrinterSelect(choice);

      assert.strictEqual(selectModal.style.display, 'none');
      assert.strictEqual(lastResult, choice);
      assert.strictEqual(posPrinterFns.getSelectCallback(), null, 'Callback must be cleared to null after selection');
    }
  });

  it('MODAL-03: Concurrency attack: Rapid re-opening of interactive prompt handles race without hanging or uncaught exceptions', () => {
    const selectModal = simulatedDom.get('printerSelectModal');
    let callback1Invoked = false;
    let callback2Result = null;

    // Call 1
    posPrinterFns.openPrinterSelectModal('RECEIPT', () => {
      callback1Invoked = true;
    });

    // Call 2 immediately overrides Call 1 before Call 1 could be answered
    posPrinterFns.openPrinterSelectModal('KOT', (choice) => {
      callback2Result = choice;
    });

    assert.strictEqual(simulatedDom.get('printerSelectRoleLabel').innerText, 'Kitchen KOT Ticket');

    // Operator selects printer2
    posPrinterFns.handleInteractivePrinterSelect('printer2');

    assert.strictEqual(selectModal.style.display, 'none');
    assert.strictEqual(callback2Result, 'printer2');
    assert.strictEqual(posPrinterFns.getSelectCallback(), null);
  });

  it('MODAL-04: High-frequency transport change (1000 switching events) updates network input visibility without DOM errors', () => {
    const t1 = simulatedDom.get('printer1Transport');
    const net1 = simulatedDom.get('printer1NetworkSettings');
    const pText1 = simulatedDom.get('btnPairPrinter1Text');

    const transports = ['BLUETOOTH', 'USB', 'NETWORK', 'SYSTEM_DIALOG'];

    for (let i = 0; i < 1000; i++) {
      const selected = transports[i % transports.length];
      t1.value = selected;
      posPrinterFns.handlePrinterTransportChange('printer1');

      if (selected === 'NETWORK') {
        assert.strictEqual(net1.style.display, 'block');
        assert.strictEqual(pText1.innerText, 'Save Network IP');
      } else {
        assert.strictEqual(net1.style.display, 'none');
      }
    }
  });

  // ============================================================================
  // SECTION 3: STRICT VECTOR INVARIANT VERIFICATION
  // ============================================================================
  console.log('\n📍 SECTION 3: STRICT VECTOR INVARIANT VERIFICATION');

  it('VECTOR-01: Exactly 26 .modal-close-btn SVGs exist in index.html (Strict Invariant)', () => {
    const modalCloseBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseBtnRegex);

    assert.ok(matches, 'Matches for .modal-close-btn must not be null');
    assert.strictEqual(
      matches.length,
      26,
      `Expected exactly 26 .modal-close-btn SVGs, but found ${matches.length}`
    );
  });

  it('VECTOR-02: New printer modal close buttons adopt .printer-close-btn and do NOT collide with 26-button invariant', () => {
    const printerCloseBtnRegex = /<button\b[^>]*class=["'][^"']*printer-close-btn[^"']*["'][^>]*>/g;
    const matches = html.match(printerCloseBtnRegex);

    assert.ok(matches, 'Expected .printer-close-btn elements in index.html');
    assert.strictEqual(matches.length, 2, `Expected exactly 2 .printer-close-btn elements (Settings + Select), found ${matches.length}`);

    // Verify neither button contains modal-close-btn anywhere in its attributes
    const settingsModalChunk = html.match(/<div\b[^>]*id="printerSettingsModal"[^>]*>([\s\S]*?)<\/div>\s*<!-- Interactive Printer Selection/)[1];
    const selectModalChunk = html.match(/<div\b[^>]*id="printerSelectModal"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)[1];

    assert.strictEqual(settingsModalChunk.includes('modal-close-btn'), false, '#printerSettingsModal must not contain modal-close-btn');
    assert.strictEqual(selectModalChunk.includes('modal-close-btn'), false, '#printerSelectModal must not contain modal-close-btn');
  });

  it('VECTOR-03: All interactive buttons in newly added printer modals strictly use vector SVG icons (zero raster <img>)', () => {
    const printerModalsMarkup = html.slice(
      html.indexOf('id="printerSettingsModal"'),
      html.indexOf('id="print-receipt"')
    );

    // Extract all <button> elements in printer modals
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
    let match;
    let buttonCount = 0;

    while ((match = buttonRegex.exec(printerModalsMarkup)) !== null) {
      buttonCount++;
      const buttonBody = match[1];

      // Assert no <img> or <picture> raster graphics
      assert.strictEqual(buttonBody.includes('<img'), false, 'Found <img> inside printer modal button');
      assert.strictEqual(buttonBody.includes('<picture'), false, 'Found <picture> inside printer modal button');

      // If button has an icon, assert it is an SVG
      if (buttonBody.includes('<svg') || buttonBody.includes('href="#icon-')) {
        assert.ok(
          buttonBody.includes('<svg') && (buttonBody.includes('<use') || buttonBody.includes('<line') || buttonBody.includes('<polygon') || buttonBody.includes('<path')),
          `Button icon must be genuine vector SVG: ${buttonBody}`
        );
      }
    }

    assert.ok(buttonCount >= 9, `Expected at least 9 interactive buttons across both modals, found ${buttonCount}`);
  });

  // ============================================================================
  // SECTION 4: ZERO RAW UNICODE EMOJI SCAN
  // ============================================================================
  console.log('\n📍 SECTION 4: ZERO RAW UNICODE EMOJI SCAN');

  // Complete unicode emoji block regex
  const fullEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

  it('EMOJI-01: Zero raw Unicode emojis inside #printerSettingsModal markup', () => {
    const settingsMarkup = html.slice(
      html.indexOf('id="printerSettingsModal"'),
      html.indexOf('id="printerSelectModal"')
    );

    const hasEmoji = fullEmojiRegex.test(settingsMarkup);
    assert.strictEqual(hasEmoji, false, 'Found raw Unicode emoji in #printerSettingsModal');
  });

  it('EMOJI-02: Zero raw Unicode emojis inside #printerSelectModal markup', () => {
    const selectMarkup = html.slice(
      html.indexOf('id="printerSelectModal"'),
      html.indexOf('id="print-receipt"')
    );

    const hasEmoji = fullEmojiRegex.test(selectMarkup);
    assert.strictEqual(hasEmoji, false, 'Found raw Unicode emoji in #printerSelectModal');
  });

  it('EMOJI-03: Zero raw Unicode emojis inside Settings tile card #settingTilePrinterConfig', () => {
    const tileMarkup = html.slice(
      html.indexOf('id="settingTilePrinterConfig"'),
      html.indexOf('id="settingTilePrinterConfig"') + 600
    );

    const hasEmoji = fullEmojiRegex.test(tileMarkup);
    assert.strictEqual(hasEmoji, false, 'Found raw Unicode emoji in #settingTilePrinterConfig');
  });

  it('EMOJI-04: Zero raw Unicode emojis in pos.js printer management functions', () => {
    const posSnippet = posJsContent.slice(
      posJsContent.indexOf('function openPrinterSettingsModal('),
      posJsContent.indexOf('window.handleInteractivePrinterSelect = handleInteractivePrinterSelect;') + 75
    );

    const hasEmoji = fullEmojiRegex.test(posSnippet);
    assert.strictEqual(hasEmoji, false, 'Found raw Unicode emoji in pos.js printer management functions');
  });

  // ============================================================================
  // SECTION 5: ROUTING ENGINE PERIPHERAL BOUNDS & EXCEPTION RESILIENCE
  // ============================================================================
  console.log('\n📍 SECTION 5: ROUTING ENGINE PERIPHERAL BOUNDS & RESILIENCE');

  await itAsync('RESIL-01: routePrintJob rejects null, undefined, or empty payload with standardized errorResult', async () => {
    const resNull = await ThermalPrinterBridge.routePrintJob(null);
    assert.strictEqual(resNull.data, null);
    assert.ok(resNull.error !== null);
    assert.strictEqual(resNull.error.code, 'INVALID_PAYLOAD');

    const resUndef = await ThermalPrinterBridge.routePrintJob(undefined);
    assert.strictEqual(resUndef.data, null);
    assert.ok(resUndef.error !== null);
    assert.strictEqual(resUndef.error.code, 'INVALID_PAYLOAD');
  });

  await itAsync('RESIL-02: Swapped role routing (Receipt -> printer2, KOT -> printer1) strictly honors custom rules', async () => {
    let dispatchedSlot = null;
    let dispatchedRole = null;

    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async (slot, bytes) => {
      dispatchedSlot = slot;
      return { data: { printed: true, slot }, error: null };
    };

    // Swap defaults: receipts to printer2, KOT to printer1
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer2';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer1';
    ThermalPrinterBridge.routing.alwaysPrompt = false;

    // 1. Dispatch Receipt
    const receiptRes = await ThermalPrinterBridge.routePrintJob({ billNo: 'SWAP-REC-1', amount: 100, rawItems: [] }, { role: 'RECEIPT' });
    assert.strictEqual(dispatchedSlot, 'printer2', 'Receipt should route to swapped printer2 slot');
    assert.strictEqual(receiptRes.data.slot, 'printer2');

    // 2. Dispatch KOT
    const kotRes = await ThermalPrinterBridge.routePrintJob({ table: 'T-SWAP', items: [{ name: 'Chai', qty: 1 }] }, { role: 'KOT' });
    assert.strictEqual(dispatchedSlot, 'printer1', 'KOT should route to swapped printer1 slot');
    assert.strictEqual(kotRes.data.slot, 'printer1');

    // Restore defaults
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
    ThermalPrinterBridge.routing.defaultKotPrinter = 'printer2';
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
  });

  await itAsync('RESIL-03: promptInteractiveSelection fallback resolves cleanly when prompt is cancelled', async () => {
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'PROMPT';
    ThermalPrinterBridge._mockPromptSelection = async () => null; // User clicked Cancel

    let dispatchCalled = false;
    const origDispatch = ThermalPrinterBridge.dispatchToPrinterSlot;
    ThermalPrinterBridge.dispatchToPrinterSlot = async () => {
      dispatchCalled = true;
      return { data: { printed: true }, error: null };
    };

    const res = await ThermalPrinterBridge.routePrintJob({ billNo: 'CAN-99', amount: 200, rawItems: [] });
    assert.strictEqual(dispatchCalled, false, 'Dispatch must not be called when user cancels');
    assert.strictEqual(res.data.cancelled, true);
    assert.strictEqual(res.data.printed, false);

    ThermalPrinterBridge._mockPromptSelection = null;
    ThermalPrinterBridge.dispatchToPrinterSlot = origDispatch;
    ThermalPrinterBridge.routing.defaultReceiptPrinter = 'printer1';
  });

  it('RESIL-04: Hostile corrupted localStorage JSON automatically heals and recovers to DEFAULT_PRINTERS_CONFIG', () => {
    storageMap.set('billnaw_printers_config', '{{INVALID_JSON_CORRUPTED');

    const config = ThermalPrinterBridge.loadPrinterSettings();
    assert.ok(config, 'Config must be recovered');
    assert.strictEqual(config.routing.defaultReceiptPrinter, 'printer1');
    assert.strictEqual(config.routing.defaultKotPrinter, 'printer2');
    assert.strictEqual(config.routing.alwaysPrompt, false);
  });

  // ============================================================================
  // SUMMARY & VERDICT
  // ============================================================================
  console.log('\n====================================================================');
  console.log(`🎯 TOTAL ADVERSARIAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    console.error('❌ DEFECTS DETECTED:');
    failureReports.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}\n     ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🛡️  VERDICT: ALL ADVERSARIAL HARDWARE & DOM INVARIANT TESTS PASSED 100%!');
    console.log('✨ System verified fully resilient against column overflow, modal leaks, and invariant mutations.\n');
    process.exit(0);
  }
}

runAdversarialHardwareBoundsSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
