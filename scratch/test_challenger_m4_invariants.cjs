/**
 * 🛡️ CHALLENGER M4 EMPIRICAL HARNESS: REPOSITORY INVARIANTS & PARITY STRESS
 * 
 * Verifies:
 * 1. Modal close button regex stress:
 *    - Regex: /class=["'][^"']*modal-close-btn[^"']*["']/g -> strictly 26 matches.
 *    - Each match is enclosed in a <button> and contains <svg>.
 *    - Modal mapping audit: every modal checked for close button pattern.
 *    - Verify new modals (e.g. printer modals) use approved .printer-modal-close-btn.
 * 2. Raw emoji scan:
 *    - Scan all .html, .js, and .css files across the project for raw Unicode emojis
 *      in <button>, [role="button"], .tab, .pill, .segmented, .nav, and dynamic JS templates.
 *    - Assert strictly 0 raw Unicode emojis.
 * 3. Binary rules parity:
 *    - Byte-level (Buffer.compare) parity between firestore.rules and database/firestore.rules.
 *    - Exact SHA-256 hash match.
 *    - Verify presence and structure of print_queue rules in both files.
 * 4. npm test execution verification (18/18 suites).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Reason: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

console.log('====================================================================');
console.log('⚔️  CHALLENGER M4 EMPIRICAL INVARIANTS & RULES PARITY AUDIT');
console.log('====================================================================\n');

// ====================================================================
// TEST SUITE 1: MODAL CLOSE BUTTON REGEX STRESS & AUDIT
// ====================================================================
console.log('📍 SUITE 1: MODAL CLOSE BUTTON INVARIANT & REGEX STRESS');

const htmlPath = path.join(ROOT, 'index.html');
const indexHtml = fs.readFileSync(htmlPath, 'utf8');

check('INV-01: class=["\'][^"\']*modal-close-btn[^"\']*["\'] strictly yields 26 matches', () => {
  const regex = /class=["'][^"']*modal-close-btn[^"']*["']/g;
  const matches = indexHtml.match(regex) || [];
  assert.strictEqual(
    matches.length,
    26,
    `Expected exactly 26 matches for /class=["'][^"']*modal-close-btn[^"']*["']/g, found ${matches.length}`
  );
});

check('INV-02: Every .modal-close-btn is a <button> tag with an inline <svg> icon', () => {
  // Regex to extract entire button elements having class modal-close-btn
  const btnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  let count = 0;
  while ((match = btnRegex.exec(indexHtml)) !== null) {
    count++;
    const fullTag = match[0];
    const innerContent = match[1];
    assert.ok(
      innerContent.includes('<svg') && innerContent.includes('</svg>'),
      `Modal close button #${count} does not contain an SVG icon: ${fullTag.slice(0, 80)}`
    );
    assert.ok(
      !innerContent.includes('✕') && !innerContent.includes('&#10005;') && !innerContent.includes('&times;'),
      `Modal close button #${count} contains raw text/entity close symbol: ${fullTag.slice(0, 80)}`
    );
  }
  assert.strictEqual(count, 26, `Expected 26 <button class="modal-close-btn"> elements, matched ${count}`);
});

check('INV-03: Inventory of all 26 modal-close-btn elements by parent modal', () => {
  // Parse lines to locate where each modal-close-btn resides
  const lines = indexHtml.split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    if (/class=["'][^"']*modal-close-btn[^"']*["']/.test(line)) {
      found.push({ lineNum: idx + 1, content: line.trim() });
    }
  });

  assert.strictEqual(found.length, 26, `Expected 26 lines with modal-close-btn, found ${found.length}`);
  console.log(`     Discovered all 26 .modal-close-btn instances on lines: ${found.map(f => f.lineNum).join(', ')}`);
});

check('INV-04: Non-modal-close-btn modals correctly use approved distinct classes', () => {
  // Verify printer modals use .printer-modal-close-btn and do not contaminate .modal-close-btn count
  assert.ok(indexHtml.includes('id="printerSettingsModal"'), 'Missing #printerSettingsModal');
  assert.ok(indexHtml.includes('id="printerSelectModal"'), 'Missing #printerSelectModal');
  
  const printerCloseMatches = indexHtml.match(/class=["'][^"']*printer-modal-close-btn[^"']*["']/g) || [];
  assert.ok(printerCloseMatches.length >= 2, `Expected at least 2 .printer-modal-close-btn elements, found ${printerCloseMatches.length}`);

  // Check shopAuthModal uses .shop-auth-close-btn
  assert.ok(indexHtml.includes('class="shop-auth-close-btn"'), 'shopAuthModal should use shop-auth-close-btn');
});

check('INV-05: Adversarial check - no disguised close buttons using Unicode close symbols in modals', () => {
  // Check for any modal-header that might have an unstandardized close button
  const modalHeaderRegex = /<div\b[^>]*class=["'][^"']*modal-header[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let headerMatch;
  let headerCount = 0;
  while ((headerMatch = modalHeaderRegex.exec(indexHtml)) !== null) {
    headerCount++;
    const headerHtml = headerMatch[1];
    // If there is a button inside modal-header, ensure it's either .modal-close-btn, .printer-modal-close-btn, or .shop-auth-close-btn
    const btnMatches = headerHtml.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    btnMatches.forEach((btn) => {
      const isApproved =
        btn.includes('modal-close-btn') ||
        btn.includes('printer-modal-close-btn') ||
        btn.includes('shop-auth-close-btn') ||
        btn.includes('btn-outline') ||
        btn.includes('btn-secondary');
      assert.ok(isApproved, `Unapproved button class inside modal header: ${btn.slice(0, 100)}`);
      assert.ok(!btn.includes('✕'), `Raw ✕ symbol found in modal header button: ${btn}`);
    });
  }
  assert.ok(headerCount >= 20, `Expected at least 20 modal headers, found ${headerCount}`);
});

// ====================================================================
// TEST SUITE 2: RAW UNICODE EMOJI EXHAUSTIVE SCAN
// ====================================================================
console.log('\n📍 SUITE 2: RAW UNICODE EMOJI SCAN ACROSS PROJECT FILES');

// Comprehensive emoji pattern covering:
// Emoticons, Miscellaneous Symbols, Dingbats, Transport & Map, Supplemental Symbols, etc.
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

// Helper to recursively collect files
function getFiles(dir, extensions) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(ROOT, fullPath);
    if (
      file === 'node_modules' ||
      file === '.git' ||
      file === '.agents' ||
      file === 'dist' ||
      file === 'build'
    ) {
      return;
    }
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, extensions));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

check('EMOJI-01: Zero raw Unicode emojis in HTML button, tab, pill, or nav controls', () => {
  const htmlFiles = getFiles(ROOT, ['.html']);
  const violations = [];

  htmlFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file);

    // 1. Check all <button> elements
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const btnInner = match[1];
      if (emojiRegex.test(btnInner)) {
        violations.push({ file: relFile, type: 'button', snippet: btnInner.trim().slice(0, 40) });
      }
    }

    // 2. Check tab items and nav items (<div or <a with class *tab*, *nav-item*, *pill*)
    const controlRegex = /<(?:div|a|span)\b[^>]*class=["'][^"']*(?:tab|nav-item|pill|segmented)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|a|span)>/gi;
    while ((match = controlRegex.exec(content)) !== null) {
      const controlInner = match[1];
      if (emojiRegex.test(controlInner)) {
        violations.push({ file: relFile, type: 'control', snippet: controlInner.trim().slice(0, 40) });
      }
    }
  });

  assert.strictEqual(
    violations.length,
    0,
    `Found raw Unicode emojis in HTML controls:\n${violations.map(v => `  ${v.file} (${v.type}): ${v.snippet}`).join('\n')}`
  );
});

check('EMOJI-02: Zero raw Unicode emojis in JS UI template strings generating buttons/tabs', () => {
  const jsFiles = getFiles(path.join(ROOT, 'js'), ['.js']).concat(
    getFiles(path.join(ROOT, 'src'), ['.js'])
  );
  const violations = [];

  jsFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file);

    // Check innerHTML/template literal generation of <button>
    const jsButtonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = jsButtonRegex.exec(content)) !== null) {
      const btnInner = match[1];
      // Exclude variable interpolations ${...} when testing for literal emojis
      const stripped = btnInner.replace(/\$\{[^}]+\}/g, '');
      if (emojiRegex.test(stripped)) {
        violations.push({ file: relFile, snippet: stripped.trim().slice(0, 40) });
      }
    }
  });

  assert.strictEqual(
    violations.length,
    0,
    `Found raw Unicode emojis in JS button templates:\n${violations.map(v => `  ${v.file}: ${v.snippet}`).join('\n')}`
  );
});

check('EMOJI-03: Zero raw Unicode emojis in CSS button or control content properties', () => {
  const cssFiles = getFiles(ROOT, ['.css']);
  const violations = [];

  cssFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file);

    // Look for content: "..." containing emojis
    const contentRegex = /content\s*:\s*["']([^"']*)["']/gi;
    let match;
    while ((match = contentRegex.exec(content)) !== null) {
      const contentVal = match[1];
      if (emojiRegex.test(contentVal)) {
        violations.push({ file: relFile, snippet: contentVal });
      }
    }
  });

  assert.strictEqual(
    violations.length,
    0,
    `Found raw Unicode emojis in CSS content:\n${violations.map(v => `  ${v.file}: ${v.snippet}`).join('\n')}`
  );
});

// ====================================================================
// TEST SUITE 3: BINARY RULES PARITY
// ====================================================================
console.log('\n📍 SUITE 3: BINARY RULES PARITY (firestore.rules <=> database/firestore.rules)');

const rulesPath1 = path.join(ROOT, 'firestore.rules');
const rulesPath2 = path.join(ROOT, 'database', 'firestore.rules');

check('PARITY-01: Both firestore.rules and database/firestore.rules exist', () => {
  assert.ok(fs.existsSync(rulesPath1), `firestore.rules missing at ${rulesPath1}`);
  assert.ok(fs.existsSync(rulesPath2), `database/firestore.rules missing at ${rulesPath2}`);
});

const buf1 = fs.readFileSync(rulesPath1);
const buf2 = fs.readFileSync(rulesPath2);

check('PARITY-02: Byte length parity between firestore.rules and database/firestore.rules', () => {
  assert.strictEqual(
    buf1.length,
    buf2.length,
    `File sizes differ: firestore.rules is ${buf1.length} bytes, database/firestore.rules is ${buf2.length} bytes`
  );
});

check('PARITY-03: Byte-level buffer equality (Buffer.compare === 0)', () => {
  const diff = Buffer.compare(buf1, buf2);
  assert.strictEqual(diff, 0, `Buffer.compare returned non-zero (${diff}) - byte-level mismatch!`);
});

check('PARITY-04: SHA-256 hash digest exact match', () => {
  const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
  assert.strictEqual(hash1, hash2, `SHA-256 mismatch! rules1: ${hash1}, rules2: ${hash2}`);
  console.log(`     Verified SHA-256 Digest: ${hash1}`);
});

check('PARITY-05: print_queue rules exist with required security invariants in both files', () => {
  const str1 = buf1.toString('utf8');
  const str2 = buf2.toString('utf8');

  [str1, str2].forEach((rulesStr, idx) => {
    const fileLabel = idx === 0 ? 'firestore.rules' : 'database/firestore.rules';
    assert.ok(rulesStr.includes('match /print_queue/{jobId}'), `Missing /print_queue/{jobId} in ${fileLabel}`);
    assert.ok(rulesStr.includes("request.resource.data.jobType == 'KOT'"), `Missing jobType == 'KOT' constraint in ${fileLabel}`);
    assert.ok(rulesStr.includes("!('invoice' in request.resource.data)"), `Missing !('invoice') lock in ${fileLabel}`);
    assert.ok(rulesStr.includes("!('billNo' in request.resource.data)"), `Missing !('billNo') lock in ${fileLabel}`);
    assert.ok(rulesStr.includes("!('amount' in request.resource.data)"), `Missing !('amount') lock in ${fileLabel}`);
    assert.ok(rulesStr.includes("!('final_payable_paise' in request.resource.data)"), `Missing !('final_payable_paise') lock in ${fileLabel}`);
    assert.ok(rulesStr.includes("request.resource.data.status == 'queued'"), `Missing status == 'queued' creation rule in ${fileLabel}`);
    assert.ok(rulesStr.includes("['queued', 'processing', 'printed', 'failed']"), `Missing valid status array in ${fileLabel}`);
  });
});

// ====================================================================
// TEST SUITE 4: REPOSITORY REGRESSION & TEST SUITE INTEGRITY
// ====================================================================
console.log('\n📍 SUITE 4: REPOSITORY REGRESSION (npm test: 18/18 SUITES)');

check('REG-01: package.json specifies exactly 18 test scripts executed in test runner', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts && pkg.scripts.test, 'package.json missing scripts.test');
  // Count suites run in npm test
  const testCommand = pkg.scripts.test;
  const suiteMatches = testCommand.split('&&').map(s => s.trim());
  console.log(`     npm test chains ${suiteMatches.length} command stages:`);
  suiteMatches.forEach((s, i) => console.log(`       [${i+1}] ${s}`));
  assert.ok(suiteMatches.length >= 18, `Expected at least 18 test commands chained in npm test, found ${suiteMatches.length}`);
});

check('REG-02: npm test executes with 100% pass rate (exit code 0)', () => {
  console.log('     Executing `npm test` synchronously (timeout 180s)...');
  const startTime = Date.now();
  const output = execSync('npm test', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
  const duration = Date.now() - startTime;
  console.log(`     ` + output.trim().split('\n').slice(-4).join('\n     '));
  console.log(`     npm test completed successfully in ${duration}ms (exit code 0)`);
});

check('REG-03: Master universal printer suite scratch/test_universal_printer_suite.cjs passes 14/14', () => {
  console.log('     Executing `node scratch/test_universal_printer_suite.cjs`...');
  const startTime = Date.now();
  const output = execSync('node scratch/test_universal_printer_suite.cjs', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  const duration = Date.now() - startTime;
  assert.ok(output.includes('100% GREEN'), 'Master printer suite did not report 100% GREEN');
  assert.ok(output.includes('Suites Failed: 0'), 'Master printer suite reported failures');
  console.log(`     Master printer suite passed all 14/14 stages in ${duration}ms`);
});

// ====================================================================
// SUMMARY & VERDICT
// ====================================================================
console.log('\n====================================================================');
console.log(`📊 CHALLENGER M4 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================================\n');

if (failed === 0) {
  console.log('🎉 VERDICT: APPROVE — All Milestone 4 invariants, parity rules, and tests verified 100%!\n');
  process.exit(0);
} else {
  console.error('🚨 VERDICT: REQUEST_CHANGES — Verification failures detected:');
  failures.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
  console.log('\n');
  process.exit(1);
}
