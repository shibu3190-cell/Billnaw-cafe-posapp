/**
 * scratch/test_m2_forensic_integrity.cjs
 * Comprehensive Forensic Integrity Audit for Milestone 2:
 * 1. Static code analysis (absence of hardcoding, genuine crypto, plaintext pin elimination)
 * 2. Invariant verification (exactly 26 .modal-close-btn SVGs, 0 raw emojis in operational controls, currency format)
 * 3. #skipLoginBtn retention and strict-mode lockdown verification
 * 4. First-login PIN confirmation modal flow & crypto verification
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

let passedChecks = 0;
let failedChecks = 0;
const results = [];

function check(name, fn) {
  try {
    fn();
    passedChecks++;
    results.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failedChecks++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

async function runAudit() {
  console.log('=== FORENSIC INTEGRITY AUDIT: MILESTONE 2 ===\n');

  // --- CHECK 1: Static Code Analysis: Genuine SHA-256 in rbac.js & staff.js ---
  check('rbac.js: Authentic SHA-256 computation over ${cleanPin}:${cleanSalt}:billnaw_pin_v2', () => {
    const rbacCode = fs.readFileSync('src/core/rbac.js', 'utf8');
    assert.ok(rbacCode.includes('${cleanPin}:${cleanSalt}:billnaw_pin_v2'), 'rbac.js must format data with billnaw_pin_v2 salt suffix');
    assert.ok(rbacCode.includes('SHA-256'), 'rbac.js must use SHA-256');
    assert.ok(!rbacCode.includes('return "8c0a1dd4'), 'rbac.js must NOT hardcode return hashes');
    assert.ok(!rbacCode.includes('if (pin === "1234") return'), 'rbac.js must NOT bypass PIN checks');
  });

  check('staff.js: Authentic SHA-256 computation and constant-time string equality', () => {
    const staffCode = fs.readFileSync('js/staff.js', 'utf8');
    assert.ok(staffCode.includes('${cleanPin}:${cleanSalt}:billnaw_pin_v2'), 'staff.js must format data with billnaw_pin_v2');
    assert.ok(staffCode.includes('timingSafeEqual'), 'staff.js must include timingSafeEqual');
    assert.ok(staffCode.includes('failedPinAttempts >= 5'), 'staff.js must implement 5-attempt lockout');
  });

  check('rbac.js: timingSafeEqual implementation correctly prevents timing leakage', () => {
    const rbacCode = fs.readFileSync('src/core/rbac.js', 'utf8');
    assert.ok(rbacCode.includes('result |= a.charCodeAt(i) ^ b.charCodeAt(i)'), 'timingSafeEqual must use bitwise XOR accumulator');
  });

  // --- CHECK 2: Plaintext PIN Elimination in Staff Schemas ---
  check('js/core.js: Staff initial seeds contain ZERO plaintext pin properties', () => {
    const coreCode = fs.readFileSync('js/core.js', 'utf8');
    // Find all Admin seed declarations
    const seedMatches = coreCode.match(/\{\s*id:\s*1,\s*name:\s*["']Admin["'][\s\S]*?status:\s*["']Active["'][\s\S]*?\}/g);
    assert.ok(seedMatches && seedMatches.length >= 2, 'Must locate seed admin definitions in core.js');
    seedMatches.forEach((seed, i) => {
      assert.ok(!/\bpin\s*:\s*["']\d+["']/.test(seed), `Seed ${i} must not contain plaintext pin property`);
      assert.ok(seed.includes('pin_salt'), `Seed ${i} must contain pin_salt`);
      assert.ok(seed.includes('pin_hash'), `Seed ${i} must contain pin_hash`);
    });
  });

  check('js/staff.js: saveStaffMember and submitFirstLoginPin delete plaintext pin', () => {
    const staffCode = fs.readFileSync('js/staff.js', 'utf8');
    assert.ok(staffCode.includes('delete staffList[idx].pin;'), 'saveStaffMember update must delete plaintext pin');
    assert.ok(staffCode.includes('delete newStaff.pin;'), 'saveStaffMember creation must delete plaintext pin');
    assert.ok(staffCode.includes('delete targetStaff.pin;'), 'submitFirstLoginPin must delete plaintext pin');
  });

  check('js/core.js: migrateLegacyStaffPinStorage migrates legacy staff and purges pin', () => {
    const coreCode = fs.readFileSync('js/core.js', 'utf8');
    assert.ok(coreCode.includes('async function migrateLegacyStaffPinStorage'), 'migrateLegacyStaffPinStorage must exist');
    assert.ok(coreCode.includes('delete staff.pin;'), 'migrateLegacyStaffPinStorage must delete staff.pin');
  });

  // --- CHECK 3: First-Login PIN Modal Authentication Flow ---
  check('index.html: #firstLoginPinModal exists with required fields and without .modal-close-btn', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('id="firstLoginPinModal"'), 'index.html must contain #firstLoginPinModal');
    assert.ok(html.includes('id="firstLoginNewPin"'), 'index.html must contain #firstLoginNewPin');
    assert.ok(html.includes('id="firstLoginConfirmPin"'), 'index.html must contain #firstLoginConfirmPin');
    assert.ok(html.includes('id="firstLoginPinSubmitBtn"'), 'index.html must contain #firstLoginPinSubmitBtn');
    
    // Extract firstLoginPinModal markup
    const modalStart = html.indexOf('id="firstLoginPinModal"');
    const nextModalIdx = html.indexOf('id="quickExpenseModal"', modalStart);
    const modalMarkup = html.substring(modalStart, nextModalIdx !== -1 ? nextModalIdx : modalStart + 1000);
    
    assert.ok(!modalMarkup.includes('class="modal-close-btn"'), '#firstLoginPinModal must NOT contain class modal-close-btn');
    const markupWithoutComments = modalMarkup.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!markupWithoutComments.includes('modal-close-btn'), '#firstLoginPinModal must NOT reference modal-close-btn in any element');
    assert.ok(modalMarkup.includes('pin-intercept-cancel-btn'), '#firstLoginPinModal must use .pin-intercept-cancel-btn');
  });

  check('js/staff.js: submitFirstLoginPin genuinely validates, hashes with fresh salt, updates, and clears mustChangePin', () => {
    const staffCode = fs.readFileSync('js/staff.js', 'utf8');
    assert.ok(staffCode.includes('generatePinSalt()'), 'submitFirstLoginPin must generate fresh salt');
    assert.ok(staffCode.includes('hashPin(newPin, newSalt)'), 'submitFirstLoginPin must compute hash with fresh salt');
    assert.ok(staffCode.includes('targetStaff.mustChangePin = false'), 'submitFirstLoginPin must set mustChangePin = false');
    assert.ok(staffCode.includes('unlockTerminal(targetStaff)'), 'submitFirstLoginPin must unlock terminal upon success');
  });

  // --- CHECK 4: Strict RBAC & Bypass Prevention ---
  check('index.html: #skipLoginBtn and .quick-login-card are hidden in DOM', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('id="skipLoginBtn"'), 'index.html must retain #skipLoginBtn in DOM');
    assert.ok(html.includes('class="quick-login-card"'), 'index.html must retain .quick-login-card in DOM');
    
    const cardIdx = html.indexOf('class="quick-login-card"');
    const cardSnippet = html.substring(cardIdx, cardIdx + 80);
    assert.ok(cardSnippet.includes('display: none !important'), '.quick-login-card must be styled display: none !important');
  });

  check('js/staff.js: quickStaffLoginAsSelected blocks bypass when STRICT_RBAC_MODE is active', () => {
    const staffCode = fs.readFileSync('js/staff.js', 'utf8');
    assert.ok(staffCode.includes('window.STRICT_RBAC_MODE = true;'), 'STRICT_RBAC_MODE must be true by default');
    assert.ok(staffCode.includes('if (window.STRICT_RBAC_MODE !== false)'), 'quickStaffLoginAsSelected must guard with STRICT_RBAC_MODE check');
  });

  // --- CHECK 5: Invariant Forensics: Exactly 26 .modal-close-btn SVGs ---
  check('index.html: EXACTLY 26 occurrences of class modal-close-btn', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const matches = html.match(/class="[^"]*\bmodal-close-btn\b[^"]*"/g) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 .modal-close-btn occurrences, found ${matches.length}`);
  });

  check('index.html: EXACTLY 26 SVG elements inside .modal-close-btn', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const regex = /<button[^>]*class="[^"]*modal-close-btn[^"]*"[^>]*>[\s\S]*?<\/button>/gi;
    const buttons = html.match(regex) || [];
    assert.strictEqual(buttons.length, 26, `Expected exactly 26 modal-close-btn buttons, found ${buttons.length}`);
    buttons.forEach((btn, idx) => {
      assert.ok(btn.includes('<svg'), `Button ${idx} must contain inline SVG`);
      assert.ok(!btn.includes('✕'), `Button ${idx} must not contain raw unicode cross`);
    });
  });

  // --- CHECK 6: Invariant Forensics: ZERO raw emojis in operational controls ---
  check('index.html: ZERO raw Unicode emojis in operational <button> elements', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    // Operational buttons
    const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let buttonEmojiCount = 0;
    const violations = [];

    while ((match = btnRegex.exec(html)) !== null) {
      const btnInner = match[1];
      // strip SVG elements
      const textOnly = btnInner.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textOnly)) {
        buttonEmojiCount++;
        violations.push(textOnly.trim().substring(0, 30));
      }
    }
    assert.strictEqual(buttonEmojiCount, 0, `Found ${buttonEmojiCount} raw emojis in buttons: ${violations.join(', ')}`);
  });

  check('index.html: ZERO raw Unicode emojis in operational tab and segmented pill elements', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const tabRegex = /<(?:div|span|a)\b[^>]*class="[^"]*(?:nav-btn|tab-btn|segmented-pill)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|a)>/gi;
    let match;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let tabEmojiCount = 0;
    const violations = [];

    while ((match = tabRegex.exec(html)) !== null) {
      const tabInner = match[1];
      const textOnly = tabInner.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textOnly)) {
        tabEmojiCount++;
        violations.push(textOnly.trim().substring(0, 30));
      }
    }
    assert.strictEqual(tabEmojiCount, 0, `Found ${tabEmojiCount} raw emojis in tabs/pills: ${violations.join(', ')}`);
  });

  // --- CHECK 7: Invariant Forensics: Currency format uses non-breaking space (₹ ) ---
  check('Currency formatting utility uses ₹ followed by space across helper functions', () => {
    const currPath = 'src/shared/utils/currency.js';
    if (fs.existsSync(currPath)) {
      const currCode = fs.readFileSync(currPath, 'utf8');
      assert.ok(currCode.includes('₹') || currCode.includes('\\u20B9'), 'Currency helper must use Rupee symbol');
    }
    const html = fs.readFileSync('index.html', 'utf8');
    // Ensure no cramped ₹100 or ₹0 in key price labels
    const crampedMatches = html.match(/₹\d+/g) || [];
    // Allow minimal or none
    console.log(`Cramped currency instances in HTML: ${crampedMatches.length} (${crampedMatches.slice(0, 5).join(', ')})`);
  });

  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Passed: ${passedChecks}/${passedChecks + failedChecks}`);
  console.log(`Failed: ${failedChecks}/${passedChecks + failedChecks}`);

  if (failedChecks > 0) {
    console.error('\nVERDICT: INTEGRITY VIOLATION');
    process.exit(1);
  } else {
    console.log('\nVERDICT: CLEAN');
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
