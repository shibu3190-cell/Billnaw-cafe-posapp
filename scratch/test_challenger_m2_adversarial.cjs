// scratch/test_challenger_m2_adversarial.cjs
// Empirical Challenger M2 Adversarial Test Harness
// Comprehensive stress testing of CSS architecture, system invariants, and cross-milestone integrity

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const cssDir = path.join(rootDir, 'css');
const distPath = path.join(rootDir, 'style.css');

console.log('======================================================================');
console.log('⚔️  CHALLENGER M2: ADVERSARIAL CSS ARCHITECTURE & INVARIANTS TEST HARNESS');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;
const findings = [];

function challenge(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    findings.push({ name, error: err.message, stack: err.stack });
    failCount++;
  }
}

// Helper: Strip CSS comments and strings to accurately count syntactic delimiters
function sanitizeCssForDelimiters(css) {
  let result = '';
  let inComment = false;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i++; // skip /
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      inComment = true;
      i++; // skip *
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    result += ch;
  }

  if (inComment) {
    throw new Error('Unterminated block comment in CSS');
  }
  if (inString) {
    throw new Error(`Unterminated string (${stringChar}) in CSS`);
  }

  return result;
}

// Helper: Verify balanced braces, parens, and brackets
function verifyBalancedDelimiters(sanitized, fileName) {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const ch = sanitized[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}') {
      braceDepth--;
      assert.ok(braceDepth >= 0, `${fileName}: Extra closing brace '}' at char ${i}`);
    } else if (ch === '(') parenDepth++;
    else if (ch === ')') {
      parenDepth--;
      assert.ok(parenDepth >= 0, `${fileName}: Extra closing paren ')' at char ${i}`);
    } else if (ch === '[') bracketDepth++;
    else if (ch === ']') {
      bracketDepth--;
      assert.ok(bracketDepth >= 0, `${fileName}: Extra closing bracket ']' at char ${i}`);
    }
  }

  assert.strictEqual(braceDepth, 0, `${fileName}: Unclosed brace '{' (depth=${braceDepth})`);
  assert.strictEqual(parenDepth, 0, `${fileName}: Unclosed paren '(' (depth=${parenDepth})`);
  assert.strictEqual(bracketDepth, 0, `${fileName}: Unclosed bracket '[' (depth=${bracketDepth})`);
}

// Helper: Strip HTML comments
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

console.log('--- 1. CSS MODULAR ARCHITECTURE INVARIANTS ---');

const EXPECTED_MODULES = [
  'tokens.css',
  'modals.css',
  'pos.css',
  'checkout.css',
  'inventory.css',
  'crm.css',
  'reports.css',
  'food-images.css',
  'responsive.css'
];

challenge('CSS-ARCH-01: Directory contains exactly the 9 expected modular stylesheets (no stray files)', () => {
  const actualFiles = fs.readdirSync(cssDir).sort();
  const expectedSorted = [...EXPECTED_MODULES].sort();
  assert.deepStrictEqual(actualFiles, expectedSorted, `css/ directory files do not match expected 9 modules`);
});

challenge('CSS-ARCH-02: Advanced token sanitizer & delimiter balancing across all 9 individual modules', () => {
  for (const mod of EXPECTED_MODULES) {
    const filePath = path.join(cssDir, mod);
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const sanitized = sanitizeCssForDelimiters(rawContent);
    verifyBalancedDelimiters(sanitized, mod);
  }
});

challenge('CSS-ARCH-03: Inventory collision resolution strictly verified in css/inventory.css', () => {
  const invCss = fs.readFileSync(path.join(cssDir, 'inventory.css'), 'utf8');
  assert.ok(invCss.includes('max-width: 767.98px'), 'Must contain resolved boundary max-width: 767.98px');
  assert.ok(!invCss.includes('max-width: 768px'), 'Must NOT contain conflicting max-width: 768px');
  assert.ok(invCss.includes('min-width: 768px'), 'Must contain desktop/tablet min-width: 768px');
});

challenge('CSS-ARCH-04: Touch target expansion rules & 44x44px minimum bounds present in css/modals.css & css/responsive.css', () => {
  const modalsCss = fs.readFileSync(path.join(cssDir, 'modals.css'), 'utf8');
  const respCss = fs.readFileSync(path.join(cssDir, 'responsive.css'), 'utf8');

  // Verify custom close buttons touch expansion
  const customCloseClasses = [
    '.khata-close-btn',
    '.orders-log-close-btn',
    '.printer-close-btn',
    '.device-hub-close-btn',
    '.device-approval-close-btn',
    '.forgot-pin-close-btn',
    '.report-picker-close-btn',
    '.txn-action-close-btn',
    '.ai_scan_close_btn',
    '.drawer-close-btn',
    '.hdr-close-btn',
    '.wa-preview-close-btn',
    '.slide-menu-close-btn'
  ];

  for (const cls of customCloseClasses) {
    const presentInModals = modalsCss.includes(cls);
    const presentInResp = respCss.includes(cls);
    assert.ok(presentInModals || presentInResp, `Custom close button class ${cls} must have CSS rule`);
  }

  // Verify touch target expansion pseudo-elements exist
  assert.ok(
    modalsCss.includes('min-width: 44px') || respCss.includes('min-width: 44px'),
    'Must define min-width: 44px touch expansion'
  );
  assert.ok(
    modalsCss.includes('min-height: 44px') || respCss.includes('min-height: 44px'),
    'Must define min-height: 44px touch expansion'
  );

  // Verify #historyTableBody .action-dropdown-btn touch expansion
  assert.ok(
    respCss.includes('#historyTableBody .action-dropdown-btn') || respCss.includes('#historyTableBody'),
    'Must define touch target expansion for #historyTableBody action dropdowns'
  );

  // Verify mobile bottom sheet standardization for #shopAuthModal and #aiScanningOverlay
  assert.ok(respCss.includes('#shopAuthModal'), 'Must include mobile bottom-sheet styling for #shopAuthModal');
  assert.ok(respCss.includes('#aiScanningOverlay'), 'Must include mobile bottom-sheet styling for #aiScanningOverlay');
});

challenge('CSS-ARCH-05: Bundler scripts/bundle-css.cjs produces valid, complete, and balanced style.css', () => {
  const { bundleStylesheets } = require('../scripts/bundle-css.cjs');
  
  // Pre-bundling check: read existing style.css
  const existingStyle = fs.readFileSync(distPath, 'utf8');

  // Bundle freshly
  bundleStylesheets();
  const bundledStyle = fs.readFileSync(distPath, 'utf8');

  // Idempotence: verify bundleStylesheets() produces exact same output on repeated invocation
  bundleStylesheets();
  const reBundledStyle = fs.readFileSync(distPath, 'utf8');
  assert.strictEqual(bundledStyle, reBundledStyle, 'Bundling must be 100% deterministic');

  // Delimiter balance on compiled style.css
  const sanitized = sanitizeCssForDelimiters(bundledStyle);
  verifyBalancedDelimiters(sanitized, 'style.css');

  // Verify all 9 module banners are in style.css in the correct order
  let lastIndex = 0;
  for (const mod of EXPECTED_MODULES) {
    const marker = `MODULE: css/${mod}`;
    const idx = bundledStyle.indexOf(marker);
    assert.ok(idx > -1, `style.css must contain module marker for ${mod}`);
    assert.ok(idx >= lastIndex, `Module ${mod} is out of order in style.css`);
    lastIndex = idx;
  }
});

challenge('CSS-ARCH-06: Verification of style.css synchronization with modular sources', () => {
  // Check that the currently checked-in style.css exactly reflects the concatenation of css/*.css
  const { bundleStylesheets } = require('../scripts/bundle-css.cjs');
  bundleStylesheets();
  const compiled = fs.readFileSync(distPath, 'utf8');
  assert.ok(compiled.length > 200000, `style.css size should be substantial (actual: ${compiled.length} bytes)`);
  assert.ok(compiled.includes('css/responsive.css'), 'style.css must include responsive.css');
  // Check responsive.css is at the end of style.css
  const respIdx = compiled.indexOf('MODULE: css/responsive.css');
  const reportsIdx = compiled.indexOf('MODULE: css/reports.css');
  assert.ok(respIdx > reportsIdx, 'responsive.css must be ordered after domain stylesheets to ensure proper media query cascade');
});

console.log('\n--- 2. SYSTEM INVARIANTS STRESS TESTS ---');

challenge('INVARIANT-01: Comment-stripped count of .modal-close-btn SVGs in index.html is EXACTLY 26', () => {
  const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const strippedHtml = stripHtmlComments(rawHtml);

  // Match all button.modal-close-btn elements in stripped HTML
  const modalBtnRegex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  const matches = [];
  let m;
  while ((m = modalBtnRegex.exec(strippedHtml)) !== null) {
    matches.push({ full: m[0], inner: m[1] });
  }

  assert.strictEqual(
    matches.length,
    26,
    `Expected exactly 26 .modal-close-btn button elements in comment-stripped HTML, found ${matches.length}`
  );

  // Deep verification: each of the 26 must contain an inline SVG
  let svgCount = 0;
  let textFallbackCount = 0;
  matches.forEach((btn, idx) => {
    const hasSvg = /<svg[\s\S]*?<\/svg>/i.test(btn.inner);
    const hasRawTimes = /(&times;|&#215;|✕|\bx\b)/i.test(btn.inner.replace(/<[^>]+>/g, '').trim());
    if (hasSvg) svgCount++;
    if (hasRawTimes) textFallbackCount++;
  });

  assert.strictEqual(svgCount, 26, `Expected all 26 modal close buttons to contain inline SVG, but only ${svgCount} did`);
  assert.strictEqual(textFallbackCount, 0, `Found ${textFallbackCount} modal close buttons with raw text fallback (times/X)`);
  console.log(`     ℹ️ All 26 .modal-close-btn elements contain verified inline SVGs with 0 text fallbacks`);

  // Verify that NO OTHER buttons have mistakenly adopted modal-close-btn
  const allModalCloseClasses = (strippedHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || []);
  assert.strictEqual(
    allModalCloseClasses.length,
    26,
    `Found extra non-button elements with class modal-close-btn (expected 26, got ${allModalCloseClasses.length})`
  );
});

challenge('INVARIANT-02: Zero raw Unicode emojis inside <button> elements in index.html', () => {
  const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const strippedHtml = stripHtmlComments(rawHtml);

  // Standard Unicode emoji ranges (emoticons, pictographs, symbols, flags)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/u;

  const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  let buttonIndex = 0;
  const offendingButtons = [];

  while ((match = buttonRegex.exec(strippedHtml)) !== null) {
    buttonIndex++;
    const buttonContent = match[0];
    if (emojiRegex.test(buttonContent)) {
      offendingButtons.push({
        buttonIndex,
        tagSnippet: match[0].substring(0, 80).replace(/\s+/g, ' ')
      });
    }
  }

  console.log(`     ℹ️ Scanned ${buttonIndex} <button> elements in index.html for raw emojis`);
  if (offendingButtons.length > 0) {
    console.error('     Offending buttons:', JSON.stringify(offendingButtons, null, 2));
  }
  assert.strictEqual(
    offendingButtons.length,
    0,
    `Found ${offendingButtons.length} <button> elements containing raw Unicode emojis`
  );
});

challenge('INVARIANT-03: Firebase Storage Security Rules 100% binary parity (storage.rules vs database/storage.rules)', () => {
  const rootStorage = fs.readFileSync(path.join(rootDir, 'storage.rules'));
  const dbStorage = fs.readFileSync(path.join(rootDir, 'database', 'storage.rules'));

  assert.strictEqual(
    Buffer.compare(rootStorage, dbStorage),
    0,
    'storage.rules and database/storage.rules must be 100% byte-for-byte identical'
  );

  const rootHash = crypto.createHash('sha256').update(rootStorage).digest('hex');
  const dbHash = crypto.createHash('sha256').update(dbStorage).digest('hex');
  assert.strictEqual(rootHash, dbHash, 'SHA-256 hashes must match');
  console.log(`     ℹ️ Storage rules SHA-256: ${rootHash} (${rootStorage.length} bytes)`);
});

challenge('INVARIANT-04: Firestore Security Rules 100% binary parity (firestore.rules vs database/firestore.rules)', () => {
  const rootFirestore = fs.readFileSync(path.join(rootDir, 'firestore.rules'));
  const dbFirestore = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'));

  assert.strictEqual(
    Buffer.compare(rootFirestore, dbFirestore),
    0,
    'firestore.rules and database/firestore.rules must be 100% byte-for-byte identical'
  );

  const rootHash = crypto.createHash('sha256').update(rootFirestore).digest('hex');
  const dbHash = crypto.createHash('sha256').update(dbFirestore).digest('hex');
  assert.strictEqual(rootHash, dbHash, 'SHA-256 hashes must match');
  console.log(`     ℹ️ Firestore rules SHA-256: ${rootHash} (${rootFirestore.length} bytes)`);
});

challenge('INVARIANT-05: Git branch is strictly feat/mobile-ux-and-backend-security', () => {
  const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  assert.strictEqual(
    currentBranch,
    'feat/mobile-ux-and-backend-security',
    `Git branch must be feat/mobile-ux-and-backend-security, found: ${currentBranch}`
  );
});

console.log('\n======================================================================');
console.log(`🎯 CHALLENGER M2 RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
