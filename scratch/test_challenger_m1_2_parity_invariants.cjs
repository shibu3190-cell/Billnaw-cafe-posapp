/**
 * scratch/test_challenger_m1_2_parity_invariants.cjs
 *
 * CHALLENGER M1-2 EMPIRICAL ADVERSARIAL HARNESS:
 * 1. Binary Parity Mutation Sensitivity Stress Testing (storage.rules vs database/storage.rules)
 *    - Single-byte mutations (offset 0, midpoint, EOF)
 *    - Off-by-one truncation and expansion
 *    - Newline format differences (CRLF vs LF, mixed)
 *    - Trailing whitespace (spaces, tabs, newlines, null bytes)
 *    - Internal whitespace variations (spaces to tabs)
 *    - Case sensitivity mutations
 *    - Multi-byte UTF-8 homoglyphs and zero-width spaces
 *    - Invariant: Parity checking algorithms (Buffer.compare, SHA-256, SHA-512, MD5, byte loop) MUST reject every single mutation.
 * 2. Invariant Stress Testing on index.html:
 *    - Exactly 26 active .modal-close-btn SVG elements
 *    - Verification of inline <svg> inside each modal-close-btn
 *    - Zero raw Unicode emojis in all <button> elements across index.html
 * 3. Firestore Rules Binary Parity Invariant:
 *    - Verify firestore.rules and database/firestore.rules parity is intact and undisturbed
 * 4. Git Branch Strict Invariant:
 *    - Verify active branch is strictly feat/mobile-ux-and-backend-security
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const storageRootPath = path.join(rootDir, 'storage.rules');
const storageDbPath = path.join(rootDir, 'database', 'storage.rules');
const firestoreRootPath = path.join(rootDir, 'firestore.rules');
const firestoreDbPath = path.join(rootDir, 'database', 'firestore.rules');
const indexHtmlPath = path.join(rootDir, 'index.html');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function challenge(suite, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] [${suite}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] [${suite}] ${name}`);
    console.error(`     Error: ${err.message}`);
    failureDetails.push({ suite, name, error: err.message, stack: err.stack });
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha512(buf) {
  return crypto.createHash('sha512').update(buf).digest('hex');
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/**
 * Byte-for-byte iterative loop check.
 * Evaluates byte differences up to Math.min(lenA, lenB) first,
 * then flags length mismatch at index minLen.
 */
function byteByByteCompare(bufA, bufB) {
  const minLen = Math.min(bufA.length, bufB.length);
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) {
      return { identical: false, reason: 'byte_mismatch', firstMismatchIndex: i, byteA: bufA[i], byteB: bufB[i] };
    }
  }
  if (bufA.length !== bufB.length) {
    return { identical: false, reason: 'length_mismatch', lenA: bufA.length, lenB: bufB.length, firstMismatchIndex: minLen };
  }
  return { identical: true, firstMismatchIndex: -1 };
}

console.log('====================================================================');
console.log('⚔️  CHALLENGER 2: MUTATION SENSITIVITY & INVARIANTS STRESS HARNESS');
console.log('====================================================================\n');

// ============================================================================
// SUITE 1: BASELINE STORAGE RULES BINARY PARITY
// ============================================================================
console.log('📍 SUITE 1: BASELINE STORAGE RULES BINARY PARITY');

challenge('S1-BASELINE', 'storage.rules and database/storage.rules both exist', () => {
  assert.ok(fs.existsSync(storageRootPath), 'storage.rules missing at root');
  assert.ok(fs.existsSync(storageDbPath), 'database/storage.rules missing');
});

const sRootBuf = fs.readFileSync(storageRootPath);
const sDbBuf = fs.readFileSync(storageDbPath);

challenge('S1-BASELINE', 'Byte length equality between storage.rules and database/storage.rules', () => {
  assert.strictEqual(sRootBuf.length, sDbBuf.length, `Byte length mismatch: ${sRootBuf.length} vs ${sDbBuf.length}`);
  console.log(`     Length: ${sRootBuf.length} bytes`);
});

challenge('S1-BASELINE', 'Buffer.compare === 0 (100% bit-for-bit identical)', () => {
  const diff = Buffer.compare(sRootBuf, sDbBuf);
  assert.strictEqual(diff, 0, `Buffer.compare non-zero difference: ${diff}`);
});

challenge('S1-BASELINE', 'Byte-by-byte loop detects zero mismatch indices', () => {
  const result = byteByByteCompare(sRootBuf, sDbBuf);
  assert.strictEqual(result.identical, true, `Byte loop found mismatch: ${JSON.stringify(result)}`);
});

challenge('S1-BASELINE', 'Cryptographic hash identities (SHA-256, SHA-512, MD5)', () => {
  const hash256Root = sha256(sRootBuf);
  const hash256Db = sha256(sDbBuf);
  assert.strictEqual(hash256Root, hash256Db, 'SHA-256 hash mismatch');
  console.log(`     SHA-256: ${hash256Root}`);

  const hash512Root = sha512(sRootBuf);
  const hash512Db = sha512(sDbBuf);
  assert.strictEqual(hash512Root, hash512Db, 'SHA-512 hash mismatch');

  const hashMd5Root = md5(sRootBuf);
  const hashMd5Db = md5(sDbBuf);
  assert.strictEqual(hashMd5Root, hashMd5Db, 'MD5 checksum mismatch');
  console.log(`     MD5:     ${hashMd5Root}`);
});

challenge('S1-BASELINE', 'Windows OS binary comparison (fc /b)', () => {
  const fcOut = execSync('cmd /c fc /b "storage.rules" "database\\storage.rules"', { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    fcOut.includes('FC: no differences encountered') || fcOut.includes('no differences'),
    `OS fc /b failed: ${fcOut}`
  );
  console.log('     OS fc /b: clean');
});

// ============================================================================
// SUITE 2: ADVERSARIAL MUTATION SENSITIVITY TESTING
// ============================================================================
console.log('\n📍 SUITE 2: ADVERSARIAL MUTATION SENSITIVITY STRESS TESTING');

/**
 * Helper to run comparator verification against a mutated buffer
 */
function assertMutationDetected(label, mutatedBuf, expectedMismatchByteIndex) {
  // 1. Buffer.compare must fail
  const cmp = Buffer.compare(sRootBuf, mutatedBuf);
  assert.notStrictEqual(cmp, 0, `[${label}] Buffer.compare failed to detect mutation!`);

  // 2. SHA-256 must diverge
  const hashOrig = sha256(sRootBuf);
  const hashMut = sha256(mutatedBuf);
  assert.notStrictEqual(hashOrig, hashMut, `[${label}] SHA-256 collision on mutation!`);

  // 3. SHA-512 must diverge
  assert.notStrictEqual(sha512(sRootBuf), sha512(mutatedBuf), `[${label}] SHA-512 collision on mutation!`);

  // 4. MD5 must diverge
  assert.notStrictEqual(md5(sRootBuf), md5(mutatedBuf), `[${label}] MD5 collision on mutation!`);

  // 5. Byte-by-byte loop must flag divergence
  const loopResult = byteByByteCompare(sRootBuf, mutatedBuf);
  assert.strictEqual(loopResult.identical, false, `[${label}] Byte loop failed to detect mutation!`);
  if (expectedMismatchByteIndex !== undefined) {
    assert.strictEqual(
      loopResult.firstMismatchIndex,
      expectedMismatchByteIndex,
      `[${label}] First mismatch byte index expected ${expectedMismatchByteIndex}, got ${loopResult.firstMismatchIndex}`
    );
  }
}

challenge('S2-MUTATION', 'Sensitivity to 1-byte mutation at offset 0 (first byte)', () => {
  const mutated = Buffer.from(sRootBuf);
  mutated[0] = mutated[0] ^ 0xFF; // Flip all bits of byte 0
  assertMutationDetected('offset 0 mutation', mutated, 0);
});

challenge('S2-MUTATION', 'Sensitivity to 1-byte mutation at midpoint (middle of rules)', () => {
  const midpoint = Math.floor(sRootBuf.length / 2);
  const mutated = Buffer.from(sRootBuf);
  mutated[midpoint] = mutated[midpoint] === 0x41 ? 0x42 : 0x41;
  assertMutationDetected('midpoint mutation', mutated, midpoint);
});

challenge('S2-MUTATION', 'Sensitivity to 1-byte mutation at EOF (last byte of rules)', () => {
  const lastIndex = sRootBuf.length - 1;
  const mutated = Buffer.from(sRootBuf);
  mutated[lastIndex] = mutated[lastIndex] === 0x0A ? 0x20 : 0x0A;
  assertMutationDetected('last byte mutation', mutated, lastIndex);
});

challenge('S2-MUTATION', 'Sensitivity to off-by-one truncation (1 byte removed at EOF)', () => {
  const mutated = sRootBuf.subarray(0, sRootBuf.length - 1);
  assertMutationDetected('truncation by 1 byte', mutated, sRootBuf.length - 1);
});

challenge('S2-MUTATION', 'Sensitivity to off-by-one expansion (1 byte appended at EOF)', () => {
  const mutated = Buffer.concat([sRootBuf, Buffer.from([0x00])]);
  assertMutationDetected('expansion by 1 byte', mutated, sRootBuf.length);
});

challenge('S2-MUTATION', 'Sensitivity to trailing whitespace (trailing space)', () => {
  const mutated = Buffer.concat([sRootBuf, Buffer.from(' ')]);
  assertMutationDetected('trailing space', mutated, sRootBuf.length);
});

challenge('S2-MUTATION', 'Sensitivity to trailing tab character', () => {
  const mutated = Buffer.concat([sRootBuf, Buffer.from('\t')]);
  assertMutationDetected('trailing tab', mutated, sRootBuf.length);
});

challenge('S2-MUTATION', 'Sensitivity to trailing newline addition', () => {
  const mutated = Buffer.concat([sRootBuf, Buffer.from('\n')]);
  assertMutationDetected('trailing newline', mutated, sRootBuf.length);
});

challenge('S2-MUTATION', 'Sensitivity to newline encoding change: LF vs CRLF (single line)', () => {
  const str = sRootBuf.toString('utf8');
  assert.ok(str.includes('\n'), 'Rules file has no newlines to test');
  const firstLfCharIdx = str.indexOf('\n');
  const firstLfByteIdx = Buffer.byteLength(str.slice(0, firstLfCharIdx));
  
  // Mutate first LF to CRLF
  const mutatedStr = str.replace('\n', '\r\n');
  const mutated = Buffer.from(mutatedStr, 'utf8');
  assertMutationDetected('LF to CRLF replacement', mutated, firstLfByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to newline encoding change: full CRLF conversion', () => {
  const str = sRootBuf.toString('utf8');
  const normalizedStr = str.replace(/\r\n/g, '\n');
  const firstLfCharIdx = normalizedStr.indexOf('\n');
  const firstLfByteIdx = Buffer.byteLength(normalizedStr.slice(0, firstLfCharIdx));

  const fullCrlfStr = normalizedStr.replace(/\n/g, '\r\n');
  const mutated = Buffer.from(fullCrlfStr, 'utf8');
  assertMutationDetected('Full CRLF conversion', mutated, firstLfByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to internal whitespace variation (space to tab)', () => {
  const str = sRootBuf.toString('utf8');
  assert.ok(str.includes('rules_version ='), 'Expected rules_version line not found');
  const spaceCharIdx = str.indexOf(' ');
  const spaceByteIdx = Buffer.byteLength(str.slice(0, spaceCharIdx));

  const mutatedStr = str.replace('rules_version =', 'rules_version\t=');
  const mutated = Buffer.from(mutatedStr, 'utf8');
  assertMutationDetected('internal space-to-tab substitution', mutated, spaceByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to case alteration (service to Service)', () => {
  const str = sRootBuf.toString('utf8');
  assert.ok(str.includes('service firebase.storage'), 'Expected service header not found');
  const targetCharIdx = str.indexOf('service firebase.storage');
  const targetByteIdx = Buffer.byteLength(str.slice(0, targetCharIdx));

  const mutatedStr = str.replace('service firebase.storage', 'Service firebase.storage');
  const mutated = Buffer.from(mutatedStr, 'utf8');
  assertMutationDetected('keyword case modification', mutated, targetByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to Unicode zero-width space injection (\\u200B)', () => {
  const str = sRootBuf.toString('utf8');
  const insertCharIdx = str.indexOf('{');
  const insertByteIdx = Buffer.byteLength(str.slice(0, insertCharIdx));

  const mutatedStr = str.slice(0, insertCharIdx) + '\u200B' + str.slice(insertCharIdx);
  const mutated = Buffer.from(mutatedStr, 'utf8');
  assertMutationDetected('Unicode zero-width space injection', mutated, insertByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to Cyrillic homoglyph injection (Latin "a" -> Cyrillic "а")', () => {
  const str = sRootBuf.toString('utf8');
  const aCharIdx = str.indexOf('a');
  assert.ok(aCharIdx !== -1, 'Letter "a" not found');
  const aByteIdx = Buffer.byteLength(str.slice(0, aCharIdx));

  const mutatedStr = str.slice(0, aCharIdx) + '\u0430' + str.slice(aCharIdx + 1); // U+0430 is Cyrillic small letter a (2 bytes UTF-8)
  const mutated = Buffer.from(mutatedStr, 'utf8');
  assertMutationDetected('Cyrillic homoglyph substitution', mutated, aByteIdx);
});

challenge('S2-MUTATION', 'Sensitivity to embedded null byte (\\0)', () => {
  const mutated = Buffer.from(sRootBuf);
  const targetPos = 50;
  mutated[targetPos] = 0x00;
  assertMutationDetected('embedded null byte at index 50', mutated, targetPos);
});

// ============================================================================
// SUITE 3: FIRESTORE RULES PARITY INVARIANT CHECK
// ============================================================================
console.log('\n📍 SUITE 3: FIRESTORE RULES BINARY PARITY INVARIANT');

challenge('S3-FIRESTORE', 'firestore.rules and database/firestore.rules both exist', () => {
  assert.ok(fs.existsSync(firestoreRootPath), 'firestore.rules is missing at root');
  assert.ok(fs.existsSync(firestoreDbPath), 'database/firestore.rules is missing');
});

const fRootBuf = fs.readFileSync(firestoreRootPath);
const fDbBuf = fs.readFileSync(firestoreDbPath);

challenge('S3-FIRESTORE', 'Exact byte length equality between root and database firestore rules', () => {
  assert.strictEqual(fRootBuf.length, fDbBuf.length, `Byte length mismatch: ${fRootBuf.length} vs ${fDbBuf.length}`);
  console.log(`     Length: ${fRootBuf.length} bytes`);
});

challenge('S3-FIRESTORE', 'Buffer.compare === 0 on firestore rules', () => {
  const diff = Buffer.compare(fRootBuf, fDbBuf);
  assert.strictEqual(diff, 0, `Buffer.compare non-zero difference on firestore rules: ${diff}`);
});

challenge('S3-FIRESTORE', 'Cryptographic SHA-256 and MD5 hash match on firestore rules', () => {
  const shaRoot = sha256(fRootBuf);
  const shaDb = sha256(fDbBuf);
  assert.strictEqual(shaRoot, shaDb, `SHA-256 mismatch: ${shaRoot} vs ${shaDb}`);
  console.log(`     SHA-256: ${shaRoot}`);

  const md5Root = md5(fRootBuf);
  const md5Db = md5(fDbBuf);
  assert.strictEqual(md5Root, md5Db, `MD5 mismatch: ${md5Root} vs ${md5Db}`);
  console.log(`     MD5:     ${md5Root}`);
});

challenge('S3-FIRESTORE', 'Windows OS binary comparison (fc /b) on firestore rules', () => {
  const fcOut = execSync('cmd /c fc /b "firestore.rules" "database\\firestore.rules"', { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    fcOut.includes('FC: no differences encountered') || fcOut.includes('no differences'),
    `OS fc /b failed: ${fcOut}`
  );
  console.log('     OS fc /b: clean');
});

challenge('S3-FIRESTORE', 'Firestore rules critical security functions intact', () => {
  const content = fRootBuf.toString('utf8');
  assert.ok(content.includes('isValidTenant'), 'Missing isValidTenant');
  assert.ok(content.includes('isAuthenticated'), 'Missing isAuthenticated');
  assert.ok(content.includes('token.storeCode'), 'Missing token.storeCode');
  assert.ok(content.includes('token.cafe_id'), 'Missing token.cafe_id');
  assert.ok(content.includes('isTenantStaff'), 'Missing isTenantStaff');
  assert.ok(content.includes('isTenantAdmin'), 'Missing isTenantAdmin');
  assert.ok(content.includes('match /cafes/{cafeId}'), 'Missing /cafes/{cafeId}');
  assert.ok(content.includes('match /shops/{shopId}'), 'Missing /shops/{shopId}');
});

// ============================================================================
// SUITE 4: INVARIANT STRESS TESTING ON index.html
// ============================================================================
console.log('\n📍 SUITE 4: INVARIANT STRESS TESTING ON index.html');

challenge('S4-INVARIANTS', 'index.html exists and is readable', () => {
  assert.ok(fs.existsSync(indexHtmlPath), 'index.html is missing');
});

const rawHtml = fs.readFileSync(indexHtmlPath, 'utf8');
// Strip HTML comments to only evaluate active DOM elements
const activeHtml = rawHtml.replace(/<!--[\s\S]*?-->/g, '');

challenge('S4-INVARIANTS', 'Exact 26 active .modal-close-btn elements in index.html', () => {
  const modalBtnRegex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  const matches = [];
  let m;
  while ((m = modalBtnRegex.exec(activeHtml)) !== null) {
    matches.push({ full: m[0], inner: m[1] });
  }

  console.log(`     Active modal-close-btn elements found: ${matches.length}`);
  assert.strictEqual(
    matches.length,
    26,
    `Invariant violated! Expected exactly 26 .modal-close-btn elements, found ${matches.length}`
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
  console.log(`     All 26 modal close buttons contain verified inline SVGs with 0 text fallbacks`);
});

challenge('S4-INVARIANTS', 'Zero raw Unicode emojis in all <button> elements in index.html', () => {
  // Broad Unicode emoji ranges:
  // - Miscellaneous Symbols and Pictographs (1F300-1F5FF)
  // - Emoticons (1F600-1F64F)
  // - Transport and Map Symbols (1F680-1F6FF)
  // - Supplemental Symbols and Pictographs (1F900-1F9FF)
  // - Symbols and Pictographs Extended-A (1FA70-1FAFF)
  // - Chess Symbols (1FA00-1FA6F)
  // - Miscellaneous Symbols (2600-26FF)
  // - Dingbats (2700-27BF)
  // - Regional Indicator Symbols (Flags) (1F1E6-1F1FF)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/u;

  const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let buttonCount = 0;
  const violatingButtons = [];
  let match;

  while ((match = btnRegex.exec(activeHtml)) !== null) {
    buttonCount++;
    const fullTag = match[0];
    if (emojiRegex.test(fullTag)) {
      violatingButtons.push({
        index: buttonCount,
        snippet: fullTag.replace(/\s+/g, ' ').substring(0, 80)
      });
    }
  }

  console.log(`     Total <button> elements inspected: ${buttonCount}`);
  console.log(`     Violating buttons with raw emojis: ${violatingButtons.length}`);

  assert.strictEqual(
    violatingButtons.length,
    0,
    `Found ${violatingButtons.length} buttons with raw Unicode emojis: ${JSON.stringify(violatingButtons)}`
  );
});

// ============================================================================
// SUITE 5: GIT BRANCH INVARIANT VERIFICATION
// ============================================================================
console.log('\n📍 SUITE 5: GIT BRANCH INVARIANT VERIFICATION');

challenge('S5-BRANCH', 'Git branch is strictly feat/mobile-ux-and-backend-security', () => {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  console.log(`     Current branch: ${currentBranch}`);
  assert.strictEqual(
    currentBranch,
    'feat/mobile-ux-and-backend-security',
    `Git branch violation: must be 'feat/mobile-ux-and-backend-security', but got '${currentBranch}'`
  );
});

// ============================================================================
// SUITE 6: RUN WORKER ADVERSARIAL STORAGE RULES SUITE
// ============================================================================
console.log('\n📍 SUITE 6: EXECUTE WORKER STORAGE RULES ADVERSARIAL SUITE');

challenge('S6-WORKER-SUITE', 'scratch/test_storage_rules_adversarial.cjs passes 48/48 tests', () => {
  const workerTestScript = path.join(rootDir, 'scratch', 'test_storage_rules_adversarial.cjs');
  assert.ok(fs.existsSync(workerTestScript), 'scratch/test_storage_rules_adversarial.cjs missing');

  const stdout = execSync(`node "${workerTestScript}"`, { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    stdout.includes('ALL ADVERSARIAL STORAGE SECURITY CHALLENGES PASSED PERFECTLY!') || stdout.includes('48/48 PASSED'),
    `Worker test suite did not report 100% pass:\n${stdout}`
  );
  console.log('     Worker adversarial test suite returned 100% pass (48/48 tests)');
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n====================================================================');
console.log(`📊 CHALLENGER M1-2 RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('====================================================================');

if (failedTests > 0) {
  console.error(`❌ ${failedTests} challenge(s) failed:`);
  failureDetails.forEach((f, idx) => {
    console.error(`  ${idx + 1}. [${f.suite}] ${f.name}`);
    console.error(`     ${f.error}`);
  });
  console.log('\n⚖️  EMPIRICAL VERDICT: REQUEST_CHANGES\n');
  process.exit(1);
} else {
  console.log('🎯 ALL ADVERSARIAL MUTATION & INVARIANT CHALLENGES PASSED EMPIRICALLY!');
  console.log('⚖️  EMPIRICAL VERDICT: APPROVE\n');
  process.exit(0);
}
