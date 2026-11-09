// scratch/test_auditor_m1_parity_invariants.cjs
// Independent forensic verification by Auditor auditor_m1_iter2_1

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const r1Path = path.join(root, 'firestore.rules');
const r2Path = path.join(root, 'database', 'firestore.rules');
const htmlPath = path.join(root, 'index.html');

console.log('=== AUDITOR INDEPENDENT FORENSIC INVARIANT CHECK ===\n');

// 1. Bit-for-bit Parity
const b1 = fs.readFileSync(r1Path);
const b2 = fs.readFileSync(r2Path);

console.log(`[1] File Lengths: firestore.rules = ${b1.length}, database/firestore.rules = ${b2.length}`);
assert.strictEqual(b1.length, b2.length, 'Length mismatch');

const diff = Buffer.compare(b1, b2);
console.log(`[2] Buffer.compare diff = ${diff}`);
assert.strictEqual(diff, 0, 'Buffer.compare non-zero');

const sha1 = crypto.createHash('sha256').update(b1).digest('hex');
const sha2 = crypto.createHash('sha256').update(b2).digest('hex');
console.log(`[3] SHA-256 Hash 1: ${sha1}`);
console.log(`[3] SHA-256 Hash 2: ${sha2}`);
assert.strictEqual(sha1, sha2, 'SHA-256 mismatch');

const md5_1 = crypto.createHash('md5').update(b1).digest('hex');
const md5_2 = crypto.createHash('md5').update(b2).digest('hex');
console.log(`[4] MD5 Checksum 1: ${md5_1}`);
console.log(`[4] MD5 Checksum 2: ${md5_2}`);
assert.strictEqual(md5_1, md5_2, 'MD5 mismatch');

// Windows fc /b check
const fcOut = execSync('cmd /c fc /b "firestore.rules" "database\\firestore.rules"', { cwd: root, encoding: 'utf8' });
console.log(`[5] OS fc /b output: ${fcOut.trim()}`);
assert.ok(fcOut.includes('FC: no differences encountered'), 'OS fc /b failed');

// Check line endings
console.log(`[6] CRLF present in firestore.rules: ${b1.includes('\r\n')}`);
console.log(`[6] CRLF present in database/firestore.rules: ${b2.includes('\r\n')}`);

// 2. Eradication of !isAuthenticated()
const text1 = b1.toString('utf8');
const text2 = b2.toString('utf8');
const hasBypass1 = text1.includes('!isAuthenticated()');
const hasBypass2 = text2.includes('!isAuthenticated()');
console.log(`[7] !isAuthenticated() in firestore.rules: ${hasBypass1}`);
console.log(`[7] !isAuthenticated() in database/firestore.rules: ${hasBypass2}`);
assert.strictEqual(hasBypass1, false, 'Security bypass detected in firestore.rules');
assert.strictEqual(hasBypass2, false, 'Security bypass detected in database/firestore.rules');

// 3. index.html invariants
const html = fs.readFileSync(htmlPath, 'utf8');

// Modal close button SVGs: exactly 26
const modalCloseBtns = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
console.log(`[8] Exact count of .modal-close-btn buttons: ${modalCloseBtns.length}`);
assert.strictEqual(modalCloseBtns.length, 26, `Expected exactly 26 modal close buttons, found ${modalCloseBtns.length}`);

modalCloseBtns.forEach((btn, idx) => {
  assert.ok(btn.includes('<svg') && btn.includes('</svg>'), `Button ${idx} missing SVG`);
  assert.ok(!btn.includes('✕'), `Button ${idx} has raw ✕`);
  assert.ok(!btn.includes('&#x2715;'), `Button ${idx} has entity &#x2715;`);
  assert.ok(!btn.includes('&times;'), `Button ${idx} has entity &times;`);
});
console.log(`[9] All 26 .modal-close-btn buttons confirmed to contain inline SVGs with zero raw X characters.`);

// Zero raw emojis inside <button>
const allButtons = [...html.matchAll(/<button\b[\s\S]*?<\/button>/gi)];
console.log(`[10] Total button elements in index.html: ${allButtons.length}`);
const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F0FF}\u{1F1E6}-\u{1F1FF}]/u;
const emojiViolations = [];
allButtons.forEach((m, idx) => {
  if (emojiRegex.test(m[0])) {
    emojiViolations.push({ index: idx, snippet: m[0].substring(0, 100) });
  }
});
console.log(`[11] Raw emojis in <button> elements: ${emojiViolations.length}`);
assert.strictEqual(emojiViolations.length, 0, `Found ${emojiViolations.length} buttons with raw Unicode emojis`);

// Currency non-breaking space
console.log(`[12] Currency formatting non-breaking space '₹ ' present: ${html.includes('₹ ')}`);
assert.ok(html.includes('₹ '), 'Missing standard currency format ₹ ');

console.log('\n✅ ALL INDEPENDENT FORENSIC INVARIANT CHECKS PASSED 100%!');
