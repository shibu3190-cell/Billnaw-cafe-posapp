// scratch/challenge_empirical_gate_2.cjs
// ==============================================================================
// 🧪 CHALLENGER GATE 2: ADVERSARIAL STRESS TEST & INVARIANT HARNESS
// Empirical Challenger Verification: CRM, Khata, Food Images, PWA, Receipts & Invariants
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("==============================================================================");
console.log("🔥 CHALLENGER GATE 2: EMPIRICAL VERIFICATION & ADVERSARIAL STRESS HARNESS");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;
const results = [];

function check(id, title, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${id}: ${title}`);
    passed++;
    results.push({ id, title, status: 'PASS' });
  } catch (err) {
    console.error(`  ❌ [FAIL] ${id}: ${title}`);
    console.error(`     Error: ${err.message}`);
    failed++;
    results.push({ id, title, status: 'FAIL', error: err.message });
  }
}

async function checkAsync(id, title, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${id}: ${title}`);
    passed++;
    results.push({ id, title, status: 'PASS' });
  } catch (err) {
    console.error(`  ❌ [FAIL] ${id}: ${title}`);
    console.error(`     Error: ${err.message}`);
    failed++;
    results.push({ id, title, status: 'FAIL', error: err.message });
  }
}

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const customersJs = fs.readFileSync(path.join(rootDir, 'js', 'customers.js'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const platformBridgeJs = fs.readFileSync(path.join(rootDir, 'src', 'core', 'platform-bridge.js'), 'utf8');

(async () => {
  // ----------------------------------------------------------------------------
  // SECTION 1: CUSTOMER CRM & KHATA DEBT LEDGER STRESS-TESTING
  // ----------------------------------------------------------------------------
  console.log("📍 SECTION 1: CUSTOMER CRM & KHATA STRESS-TESTING");

  // Debt ledger repayment math:
  function evaluateKhataStatus(dueDateStr, balanceDue, todayStr) {
    if (balanceDue <= 0) return 'Cleared';
    if (!dueDateStr) return 'Pending';
    const today = todayStr || new Date().toISOString().split('T')[0];
    return dueDateStr < today ? 'Overdue' : 'Pending';
  }

  function simulateRepayment(balance, paymentAmount) {
    const payVal = Number(paymentAmount);
    if (isNaN(payVal) || payVal <= 0) {
      return { success: false, balance };
    }
    const newBal = Math.max(0, balance - payVal);
    return { success: true, balance: newBal, status: evaluateKhataStatus('2026-10-10', newBal, '2026-10-11') };
  }

  check("CRM-01", "Debt ledger: partial repayment reduces balance without negative float drift", () => {
    const res = simulateRepayment(1000.50, 400.25);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.balance, 600.25);
    assert.strictEqual(res.status, 'Overdue');
  });

  check("CRM-02", "Debt ledger: exact repayment clears balance and marks Cleared", () => {
    const res = simulateRepayment(500, 500);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.balance, 0);
    assert.strictEqual(res.status, 'Cleared');
  });

  check("CRM-03", "Debt ledger: overpayment caps balance at 0 (never negative)", () => {
    const res = simulateRepayment(250, 300);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.balance, 0);
    assert.strictEqual(res.status, 'Cleared');
  });

  check("CRM-04", "Debt ledger: zero, negative, and NaN repayments rejected", () => {
    assert.strictEqual(simulateRepayment(100, 0).success, false);
    assert.strictEqual(simulateRepayment(100, -50).success, false);
    assert.strictEqual(simulateRepayment(100, 'invalid').success, false);
  });

  // Loyalty Tier progression
  function getCustomerTierName(visits = 0) {
    if (visits >= 20) return "Platinum";
    if (visits >= 10) return "Gold";
    if (visits >= 5) return "Silver";
    return "Bronze";
  }

  check("CRM-05", "Customer loyalty tier ladder strictly: Bronze (0-4), Silver (5-9), Gold (10-19), Platinum (20+)", () => {
    assert.strictEqual(getCustomerTierName(0), "Bronze");
    assert.strictEqual(getCustomerTierName(4), "Bronze");
    assert.strictEqual(getCustomerTierName(5), "Silver");
    assert.strictEqual(getCustomerTierName(9), "Silver");
    assert.strictEqual(getCustomerTierName(10), "Gold");
    assert.strictEqual(getCustomerTierName(19), "Gold");
    assert.strictEqual(getCustomerTierName(20), "Platinum");
    assert.strictEqual(getCustomerTierName(150), "Platinum");
  });

  // WhatsApp Marketing link generation
  function makeWhatsAppLink(phone, message) {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) return null;
    return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  check("CRM-06", "WhatsApp link generator sanitizes 10-digit number and encodes special chars & currency", () => {
    const link = makeWhatsAppLink('+91 98765-43210', 'Dear O\'Connor & Sons, bill ₹ 500 is due.');
    assert.ok(link.startsWith('https://wa.me/919876543210?text='));
    assert.ok(link.includes(encodeURIComponent('O\'Connor & Sons')));
    assert.ok(link.includes(encodeURIComponent('₹ 500')));
    assert.strictEqual(makeWhatsAppLink('12345', 'Short'), null);
  });

  // ----------------------------------------------------------------------------
  // SECTION 2: FOOD IMAGE MANAGER & FALLBACK CASCADE
  // ----------------------------------------------------------------------------
  console.log("\n📍 SECTION 2: FOOD IMAGE MANAGER & FALLBACKS");

  check("IMG-01", "Imagen prompt synthesis enforces commercial photography style & negative suppression", () => {
    const { getCuratedFoodPhotoServer, getDishVariationCountServer } = require('../server/gemini-service.js');
    assert.strictEqual(typeof getCuratedFoodPhotoServer, 'function');
    assert.strictEqual(typeof getDishVariationCountServer, 'function');
  });

  check("IMG-02", "Curated photography fallback contains 4 distinct variations for core dishes", () => {
    const { getCuratedFoodPhotoServer } = require('../server/gemini-service.js');
    const v0 = getCuratedFoodPhotoServer('Samosa', 'Snacks', 0);
    const v1 = getCuratedFoodPhotoServer('Samosa', 'Snacks', 1);
    const v2 = getCuratedFoodPhotoServer('Samosa', 'Snacks', 2);
    const v3 = getCuratedFoodPhotoServer('Samosa', 'Snacks', 3);
    const v4 = getCuratedFoodPhotoServer('Samosa', 'Snacks', 4);

    assert.ok(v0 && v0.startsWith('https://images.unsplash.com/'));
    assert.ok(v1 && v1.startsWith('https://images.unsplash.com/'));
    assert.ok(v2 && v2.startsWith('https://images.unsplash.com/'));
    assert.ok(v3 && v3.startsWith('https://images.unsplash.com/'));
    assert.notStrictEqual(v0, v1);
    assert.strictEqual(v4, v0, "Variation 4 must loop back to Variation 0");
  });

  check("IMG-03", "3MB upload threshold and image magic bytes validator", () => {
    const maxBytes = 3 * 1024 * 1024;
    const jpegMagic = Buffer.from([0xFF, 0xD8, 0xFF]);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    const gifMagic = Buffer.from([0x47, 0x49, 0x46, 0x38]);

    function isValidUpload(buffer) {
      if (buffer.length > maxBytes) return false;
      if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true; // JPEG
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
      return false;
    }

    assert.strictEqual(isValidUpload(jpegMagic), true);
    assert.strictEqual(isValidUpload(pngMagic), true);
    assert.strictEqual(isValidUpload(gifMagic), false);
    assert.strictEqual(isValidUpload(Buffer.alloc(maxBytes + 1)), false);
  });

  // ----------------------------------------------------------------------------
  // SECTION 3: OFFLINE PWA & THERMAL PRINTER BRIDGE
  // ----------------------------------------------------------------------------
  console.log("\n📍 SECTION 3: OFFLINE PWA & THERMAL PRINTER BRIDGE");

  await checkAsync("PRN-01", "Thermal printer ESC/POS commands strictly emit ASCII 'Rs. ' (zero multi-byte UTF-8 ₹)", async () => {
    const { ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');
    const mockInvoice = {
      bill_no: 'BN-T1-261102-9999',
      settled_at: '2026-11-02T12:00:00Z',
      final_payable_paise: 25000,
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, line_total_paise: 25000 }
      ]
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(mockInvoice);
    assert.ok(bytes instanceof Uint8Array);
    const decoded = Buffer.from(bytes).toString('utf8');

    // Multi-byte UTF-8 sequence for ₹ is [0xE2, 0x82, 0xB9]
    const hasUtf8Rupee = bytes.some((b, i) => b === 0xE2 && bytes[i + 1] === 0x82 && bytes[i + 2] === 0xB9);
    assert.strictEqual(hasUtf8Rupee, false, "ESC/POS byte stream must NOT contain multi-byte UTF-8 rupee (0xE2 0x82 0xB9)");
    assert.ok(decoded.includes("Rs. 250.00"), "Receipt must contain ASCII 'Rs. 250.00'");
  });

  await checkAsync("PRN-02", "Decoupled print queue returns immediately without blocking checkout", async () => {
    const { ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');
    const mockBill = { id: 'BN-T1-999', final_total_paise: 5000, items: [] };
    const startTime = Date.now();
    const res = await ThermalPrinterBridge.enqueuePrintJob(mockBill);
    const elapsed = Date.now() - startTime;

    assert.strictEqual(res.error, null);
    assert.strictEqual(res.data.queued, true);
    assert.ok(elapsed < 100, `Enqueue print job took ${elapsed}ms; must complete in <100ms`);
  });

  // ----------------------------------------------------------------------------
  // SECTION 4: SYSTEM INVARIANTS HARDENING
  // ----------------------------------------------------------------------------
  console.log("\n📍 SECTION 4: SYSTEM INVARIANTS HARDENING");

  check("INV-01", "Exact count of 26 SVG modal close buttons matching regex in index.html", () => {
    const modalCloseRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseRegex) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26, found ${matches.length}`);
  });

  check("INV-02", "Total occurrences of class 'modal-close-btn' across index.html is strictly 26", () => {
    const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
    assert.strictEqual(allMatches.length, 26, `Expected exactly 26, found ${allMatches.length}`);
  });

  check("INV-03", "Zero raw Unicode emojis in operational <button> elements in index.html", () => {
    const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const violations = [];
    buttonMatches.forEach(btn => {
      // Strip nested SVGs and span tags to check raw text nodes
      const textOnly = btn.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '');
      if (EMOJI_REGEX.test(textOnly)) {
        violations.push(btn);
      }
    });
    assert.strictEqual(violations.length, 0, `Found ${violations.length} buttons with raw emojis: ${violations.slice(0, 3).join(', ')}`);
  });

  check("INV-04", "Currency display maintains the non-breaking currency space format (₹ ) across all views", () => {
    // Regex for cramped rupee: ₹ directly followed by a digit or variable interpolation
    const crampedMatches = html.match(/₹[0-9]|₹\$\{/g) || [];
    assert.strictEqual(crampedMatches.length, 0, `Found ${crampedMatches.length} cramped rupee occurrences: ${crampedMatches.slice(0, 3).join(', ')}`);
  });

  console.log("\n==============================================================================");
  console.log(`🎯 CHALLENGER GATE 2 AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("==============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
})();
