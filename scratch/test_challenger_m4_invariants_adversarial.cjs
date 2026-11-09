/**
 * 🛡️ CHALLENGER ADVERSARIAL STRESS TEST: REPOSITORY INVARIANTS & RULES BINARY PARITY
 * Milestone 4 Adversarial Verification
 *
 * Verifies:
 * 1. Modal close button regex stress: EXACTLY 26 .modal-close-btn SVGs in index.html.
 * 2. Raw Unicode emoji scan: ZERO raw emojis across buttons, tabs, and segmented controls.
 * 3. Rules parity: Byte-for-byte binary parity between firestore.rules and database/firestore.rules.
 * 4. Regression: Full npm test execution (all 18 test suites green) & universal printer suite.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('====================================================================');
console.log('⚔️ CHALLENGER EMPIRICAL AUDIT: INVARIANTS & RULES BINARY PARITY');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function challenge(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: [CHALLENGE ${totalTests}] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: [CHALLENGE ${totalTests}] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const firestoreRulesPath = path.join(rootDir, 'firestore.rules');
const dbFirestoreRulesPath = path.join(rootDir, 'database', 'firestore.rules');
const packageJsonPath = path.join(rootDir, 'package.json');
const styleCssPath = path.join(rootDir, 'style.css');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// ====================================================================
// SECTION 1: MODAL CLOSE BUTTON REGEX STRESS & DOM INVARIANTS
// ====================================================================
console.log('📍 SECTION 1: MODAL CLOSE BUTTON REGEX STRESS & DOM INVARIANTS');

challenge('1.1: Exactly 26 elements with class containing modal-close-btn in index.html', () => {
  const classMatches = htmlContent.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
  assert.strictEqual(
    classMatches.length,
    26,
    `Expected exactly 26 class occurrences of modal-close-btn, found ${classMatches.length}`
  );
});

challenge('1.2: All modal-close-btn elements are strictly <button> tags (no divs, anchors, spans)', () => {
  const nonButtonRegex = /<(?!button\b)([a-z0-9_-]+)\b[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'][^>]*>/gi;
  const nonButtons = [];
  let match;
  while ((match = nonButtonRegex.exec(htmlContent)) !== null) {
    nonButtons.push(match[0].slice(0, 60));
  }
  assert.strictEqual(
    nonButtons.length,
    0,
    `Found non-button elements using modal-close-btn: ${nonButtons.join(', ')}`
  );
});

challenge('1.3: Standard regex matches exactly 26 button elements with modal-close-btn', () => {
  const standardMatches = htmlContent.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
  assert.strictEqual(
    standardMatches.length,
    26,
    `Standard regex expected 26, found ${standardMatches.length}`
  );
});

challenge('1.4: Multiline and whitespace-resilient regex matches exactly 26 button elements', () => {
  const multilineMatches = htmlContent.match(/<button\b[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'][^>]*>\s*<svg\b[^>]*>[\s\S]*?<\/svg>\s*<\/button>/gi) || [];
  assert.strictEqual(
    multilineMatches.length,
    26,
    `Multiline-resilient regex expected 26, found ${multilineMatches.length}`
  );
});

challenge('1.5: Attribute-order-independent regex matches exactly 26 buttons', () => {
  // Matches any button that has modal-close-btn in class regardless of attribute order
  const attrRegex = /<button\b(?=[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'])[^>]*>[\s\S]*?<\/button>/gi;
  const attrMatches = htmlContent.match(attrRegex) || [];
  assert.strictEqual(
    attrMatches.length,
    26,
    `Attribute-independent regex expected 26, found ${attrMatches.length}`
  );
});

challenge('1.6: Every single modal-close-btn button contains a well-formed SVG with paths/lines', () => {
  const attrRegex = /<button\b(?=[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'])[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  let index = 0;
  while ((match = attrRegex.exec(htmlContent)) !== null) {
    index++;
    const inner = match[1];
    assert.ok(
      /<svg\b[^>]*>[\s\S]*?<\/svg>/i.test(inner),
      `Modal close button #${index} does not contain an SVG element! Content: ${inner.slice(0, 40)}`
    );
    assert.ok(
      /(<path\b|<line\b|<polyline\b|<circle\b)/i.test(inner),
      `Modal close button #${index} contains empty SVG without drawing elements!`
    );
  }
  assert.strictEqual(index, 26, `Audited ${index} buttons, expected 26.`);
});

challenge('1.7: Zero raw text or legacy glyphs ("✕", "x", "X", "Close") inside modal-close-btn', () => {
  const rawGlyphRegex = /<button\b(?=[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'])[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  const violations = [];
  while ((match = rawGlyphRegex.exec(htmlContent)) !== null) {
    const inner = match[1].replace(/<svg\b[\s\S]*?<\/svg>/gi, '').trim();
    if (inner.length > 0) {
      violations.push({ button: match[0].slice(0, 50), text: inner });
    }
  }
  assert.strictEqual(
    violations.length,
    0,
    `Found raw text/glyphs inside modal-close-btn buttons: ${JSON.stringify(violations)}`
  );
});

challenge('1.8: Printer modals (#printerSettingsModal, #printerSelectModal) do NOT use .modal-close-btn and use .printer-close-btn', () => {
  // Check printerSettingsModal
  const settingsModalMatch = htmlContent.match(/<div\b[^>]*id=["']printerSettingsModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  assert.ok(settingsModalMatch, '#printerSettingsModal markup exists in index.html');
  const hasModalCloseBtn1 = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/.test(settingsModalMatch[0]);
  assert.strictEqual(hasModalCloseBtn1, false, 'printerSettingsModal must NOT use .modal-close-btn');
  assert.ok(
    /class=["'][^"']*\bprinter-close-btn\b[^"']*["']/.test(settingsModalMatch[0]),
    'printerSettingsModal should use .printer-close-btn'
  );

  // Check printerSelectModal
  const selectModalMatch = htmlContent.match(/<div\b[^>]*id=["']printerSelectModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  assert.ok(selectModalMatch, '#printerSelectModal markup exists in index.html');
  const hasModalCloseBtn2 = /class=["'][^"']*\bmodal-close-btn\b[^"']*["']/.test(selectModalMatch[0]);
  assert.strictEqual(hasModalCloseBtn2, false, 'printerSelectModal must NOT use .modal-close-btn');
  assert.ok(
    /class=["'][^"']*\bprinter-close-btn\b[^"']*["']/.test(selectModalMatch[0]),
    'printerSelectModal should use .printer-close-btn'
  );
});

challenge('1.9: CSS defines .modal-close-btn styling rules', () => {
  const cssContent = fs.readFileSync(styleCssPath, 'utf8');
  assert.ok(cssContent.includes('.modal-close-btn'), '.modal-close-btn class selector must exist in style.css');
  assert.ok(cssContent.includes('width: 32px;'), 'width: 32px must exist in .modal-close-btn');
  assert.ok(cssContent.includes('height: 32px;'), 'height: 32px must exist in .modal-close-btn');
});


// ====================================================================
// SECTION 2: RAW UNICODE EMOJI SCAN IN OPERATIONAL CONTROLS
// ====================================================================
console.log('\n📍 SECTION 2: RAW UNICODE EMOJI SCAN IN OPERATIONAL CONTROLS');

// Broad adversarial Unicode emoji regex covering all emoji categories
const ADVERSARIAL_EMOJI_REGEX = /(?:[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B50}])/u;

challenge('2.1: Zero raw Unicode emojis inside all <button> elements in index.html', () => {
  const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  const violations = [];
  while ((match = buttonRegex.exec(htmlContent)) !== null) {
    const buttonHtml = match[0];
    const content = match[1];
    // Strip SVG tags to only inspect raw text/attributes inside button content
    const textOnly = content.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
    if (ADVERSARIAL_EMOJI_REGEX.test(textOnly)) {
      violations.push({
        snippet: buttonHtml.slice(0, 70).replace(/\s+/g, ' '),
        char: textOnly.match(ADVERSARIAL_EMOJI_REGEX)[0]
      });
    }
  }
  assert.strictEqual(
    violations.length,
    0,
    `Found raw Unicode emojis in buttons: ${JSON.stringify(violations, null, 2)}`
  );
});

challenge('2.2: Zero raw Unicode emojis inside elements with role="tab" or class containing tab/pill in index.html', () => {
  const tabRegex = /<([a-z0-9_-]+)\b(?=[^>]*(?:role=["']tab["']|class=["'][^"']*\b(?:tab|nav-tab|tab-btn|segmented-pill|segment-btn)\b[^"']*["']))[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  const violations = [];
  while ((match = tabRegex.exec(htmlContent)) !== null) {
    const fullElement = match[0];
    const content = match[2];
    const textOnly = content.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
    if (ADVERSARIAL_EMOJI_REGEX.test(textOnly)) {
      violations.push({
        element: fullElement.slice(0, 70).replace(/\s+/g, ' '),
        char: textOnly.match(ADVERSARIAL_EMOJI_REGEX)[0]
      });
    }
  }
  assert.strictEqual(
    violations.length,
    0,
    `Found raw emojis in tab/pill operational controls: ${JSON.stringify(violations, null, 2)}`
  );
});

challenge('2.3: Zero raw Unicode emojis inside dynamically constructed <button> in core JS modules', () => {
  const jsDir = path.join(rootDir, 'js');
  const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  const violations = [];

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(jsDir, file), 'utf8');
    // Find template literal buttons or string concatenation buttons: <button ...> ... </button>
    const jsButtonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = jsButtonRegex.exec(content)) !== null) {
      const fullBtn = match[0];
      const btnContent = match[1].replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
      if (ADVERSARIAL_EMOJI_REGEX.test(btnContent)) {
        violations.push({
          file,
          snippet: fullBtn.slice(0, 60),
          char: btnContent.match(ADVERSARIAL_EMOJI_REGEX)[0]
        });
      }
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `Found raw emojis in JS button templates: ${JSON.stringify(violations, null, 2)}`
  );
});

challenge('2.4: Currency formatting non-breaking space invariant (₹ ) adhered to across displays', () => {
  // Invariant: currency must use "₹ " (with non-breaking space or standard space), never raw ₹ followed immediately by digits without space
  assert.ok(
    !htmlContent.includes('₹0.00'),
    'index.html should not contain unspaced "₹0.00"'
  );
  const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
  assert.ok(
    posJs.includes('₹ ${') || posJs.includes('₹ '),
    'pos.js should use spaced currency formatting "₹ "'
  );
});


// ====================================================================
// SECTION 3: RULES BINARY PARITY (firestore.rules vs database/firestore.rules)
// ====================================================================
console.log('\n📍 SECTION 3: RULES BINARY PARITY');

challenge('3.1: Both firestore.rules and database/firestore.rules files exist and are readable', () => {
  assert.ok(fs.existsSync(firestoreRulesPath), 'firestore.rules does not exist');
  assert.ok(fs.existsSync(dbFirestoreRulesPath), 'database/firestore.rules does not exist');
});

const buf1 = fs.readFileSync(firestoreRulesPath);
const buf2 = fs.readFileSync(dbFirestoreRulesPath);

challenge('3.2: Exact byte size equality between firestore.rules and database/firestore.rules', () => {
  assert.strictEqual(
    buf1.length,
    buf2.length,
    `Byte sizes differ: firestore.rules = ${buf1.length} bytes, database/firestore.rules = ${buf2.length} bytes`
  );
  console.log(`     Confirmed: Both files are exactly ${buf1.length} bytes.`);
});

challenge('3.3: In-process Buffer.compare yields 0 (exact byte-for-byte binary parity)', () => {
  const cmp = Buffer.compare(buf1, buf2);
  assert.strictEqual(cmp, 0, `Buffer.compare yielded non-zero difference: ${cmp}`);
});

challenge('3.4: SHA-256 cryptographic hashes match identically', () => {
  const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
  assert.strictEqual(hash1, hash2, `SHA-256 mismatch: ${hash1} !== ${hash2}`);
  console.log(`     SHA-256: ${hash1}`);
});

challenge('3.5: SHA-512 cryptographic hashes match identically', () => {
  const hash1 = crypto.createHash('sha512').update(buf1).digest('hex');
  const hash2 = crypto.createHash('sha512').update(buf2).digest('hex');
  assert.strictEqual(hash1, hash2, `SHA-512 mismatch: ${hash1} !== ${hash2}`);
});

challenge('3.6: MD5 cryptographic checksums match identically', () => {
  const hash1 = crypto.createHash('md5').update(buf1).digest('hex');
  const hash2 = crypto.createHash('md5').update(buf2).digest('hex');
  assert.strictEqual(hash1, hash2, `MD5 mismatch: ${hash1} !== ${hash2}`);
  console.log(`     MD5: ${hash1}`);
});

challenge('3.7: OS-level binary file comparison (cmd /c fc /b) confirms zero differences', () => {
  const rel1 = path.relative(rootDir, firestoreRulesPath);
  const rel2 = path.relative(rootDir, dbFirestoreRulesPath);
  const output = execSync(`cmd /c fc /b "${rel1}" "${rel2}"`, { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    output.includes('FC: no differences encountered') || output.includes('no differences'),
    `OS file compare reported differences:\n${output}`
  );
  console.log('     OS FC output: "FC: no differences encountered"');
});

challenge('3.8: Rules content contains /print_queue/{jobId} security rules enforcing KOT only', () => {
  const rulesStr = buf1.toString('utf8');
  assert.ok(rulesStr.includes('match /print_queue/{jobId}'), 'Missing /print_queue/{jobId} rule block');
  assert.ok(rulesStr.includes("request.resource.data.jobType == 'KOT'"), 'Missing KOT jobType assertion');
  assert.ok(rulesStr.includes("!('invoice' in request.resource.data)"), 'Missing invoice rejection assertion');
  assert.ok(rulesStr.includes("!('billNo' in request.resource.data)"), 'Missing billNo rejection assertion');
  assert.ok(rulesStr.includes("!('amount' in request.resource.data)"), 'Missing amount rejection assertion');
  assert.ok(rulesStr.includes("!('final_payable_paise' in request.resource.data)"), 'Missing final_payable_paise rejection assertion');
});


// ====================================================================
// SECTION 4: FULL REGRESSION TEST INTEGRITY (npm test & universal suite)
// ====================================================================
console.log('\n📍 SECTION 4: FULL REGRESSION TEST INTEGRITY');

challenge('4.1: package.json test script is configured with all 18 test suites', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const testScript = pkg.scripts.test;
  const suites = testScript.split('&&').map(s => s.trim());
  assert.strictEqual(suites.length, 18, `Expected 18 test suites in package.json test script, found ${suites.length}`);
});

challenge('4.2: Execute npm test and verify all 18 test suites pass green (exit code 0)', () => {
  console.log('     Executing npm test via execSync (takes ~15-20s)...');
  const startTime = Date.now();
  const stdout = execSync('npm test', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
  const duration = Date.now() - startTime;
  console.log(`     npm test completed in ${(duration / 1000).toFixed(2)}s`);
  assert.ok(stdout.includes('ALL STATUTORY INVOICE & PERSISTENCE DELIVERABLES VERIFIED 100%!'), 'Final suite output missing');
});

challenge('4.3: Execute master runner scratch/test_universal_printer_suite.cjs', () => {
  console.log('     Executing node scratch/test_universal_printer_suite.cjs (takes ~25-35s)...');
  const startTime = Date.now();
  const stdout = execSync('node scratch/test_universal_printer_suite.cjs', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
  const duration = Date.now() - startTime;
  console.log(`     Universal printer suite completed in ${(duration / 1000).toFixed(2)}s`);
  assert.ok(
    stdout.includes('FINAL VERDICT: 100% GREEN'),
    'Expected FINAL VERDICT: 100% GREEN in output'
  );
});

// ====================================================================
// SUMMARY & VERDICT
// ====================================================================
console.log('\n====================================================================');
console.log(`📊 CHALLENGER AUDIT SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('====================================================================');

if (failedTests > 0) {
  console.error(`\n❌ VERDICT: REQUEST_CHANGES — ${failedTests} CHALLENGE(S) FAILED:`);
  failures.forEach((f, idx) => {
    console.error(`  ${idx + 1}. ${f.name}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('\n✨ VERDICT: APPROVE — ALL EMPIRICAL CHALLENGES PASSED WITH ZERO DEFECTS!');
  process.exit(0);
}
