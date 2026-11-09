// scratch/test_adversarial_challenger_deep_stress.cjs
// Empirical Adversarial Stress Harness created by challenger_m1_iter2_1
// Deep stress-testing wrapText edge cases and server.js POST /api/print/network port/host/data vectors.

const assert = require('assert');
const net = require('net');

async function runDeepStressSuite() {
  console.log('====================================================================');
  console.log('🧪 EMPIRICAL CHALLENGER DEEP STRESS HARNESS: M1 ITERATION 2');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  const findings = [];

  function recordPass(testName) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  }

  function recordFail(testName, error, details = '') {
    failed++;
    const finding = { testName, error: error.message || String(error), details };
    findings.push(finding);
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Reason: ${error.message || error}`);
    if (details) console.error(`     Details: ${details}`);
  }

  const { wrapText, ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');

  // ============================================================================
  // SECTION 1: wrapText ADVERSARIAL BOUNDARY & STRESS TESTS
  // ============================================================================
  console.log('📍 SECTION 1: wrapText ADVERSARIAL STRESS TESTING');

  // Test 1.1: Falsy, null, undefined, primitive non-string inputs
  try {
    assert.deepStrictEqual(wrapText(null, 32), [], 'null input must return []');
    assert.deepStrictEqual(wrapText(undefined, 32), [], 'undefined input must return []');
    assert.deepStrictEqual(wrapText('', 32), [], 'empty string must return []');
    assert.deepStrictEqual(wrapText(0, 32), ['0'], 'number 0 must return ["0"]');
    assert.deepStrictEqual(wrapText(12345, 32), ['12345'], 'number 12345 must return ["12345"]');
    assert.deepStrictEqual(wrapText(true, 32), ['true'], 'boolean true must return ["true"]');
    assert.deepStrictEqual(wrapText(false, 32), ['false'], 'boolean false must return ["false"]');
    recordPass('CHALLENGE-WRAP-01: Null, undefined, empty, and numeric/boolean primitives handled safely');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-01: Null, undefined, empty, and numeric/boolean primitives handled safely', err);
  }

  // Test 1.2: Whitespace and newline permutations
  try {
    assert.deepStrictEqual(wrapText('\n', 32), ['', ''], 'single newline yields 2 empty lines');
    assert.deepStrictEqual(wrapText('\r\n', 32), ['', ''], 'CRLF yields 2 empty lines');
    assert.deepStrictEqual(wrapText('\n\n\n', 32), ['', '', '', ''], 'multiple newlines yield empty line per paragraph');
    assert.deepStrictEqual(wrapText('   ', 32), [''], 'pure spaces in paragraph yields [""]');
    assert.deepStrictEqual(wrapText('\t\t\t', 32), [''], 'pure tabs in paragraph yields [""]');
    assert.deepStrictEqual(wrapText('   \n   \n   ', 32), ['', '', ''], 'multiline whitespace yields empty lines');
    assert.deepStrictEqual(wrapText('Hello\n\nWorld', 32), ['Hello', '', 'World'], 'paragraphs separated by empty line preserved');
    recordPass('CHALLENGE-WRAP-02: Whitespace and newline permutations handled without infinite loops or crashes');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-02: Whitespace and newline permutations handled without infinite loops or crashes', err);
  }

  // Test 1.3: Single word exceeding maxCols (Hard slicing stress)
  try {
    const hugeWord100 = 'A'.repeat(100);
    const wrapped32 = wrapText(hugeWord100, 32);
    // 100 chars / 32 cols: 32 + 32 + 32 + 4 = 4 lines
    assert.strictEqual(wrapped32.length, 4, `100 chars sliced into 32 col chunks should produce 4 lines (got ${wrapped32.length})`);
    assert.strictEqual(wrapped32[0].length, 32);
    assert.strictEqual(wrapped32[1].length, 32);
    assert.strictEqual(wrapped32[2].length, 32);
    assert.strictEqual(wrapped32[3].length, 4);
    assert.strictEqual(wrapped32.join(''), hugeWord100, 'Reconstituted text must match original');

    // Test with indent
    const wrappedIndent = wrapText(hugeWord100, 32, '  ');
    // Line 1: no indent (32 chars)
    // Line 2: indent "  " + 30 chars = 32 chars
    // Line 3: indent "  " + 30 chars = 32 chars
    // Line 4: indent "  " + 8 chars = 10 chars
    assert.strictEqual(wrappedIndent[0].length, 32);
    assert.strictEqual(wrappedIndent[1].length, 32);
    assert.strictEqual(wrappedIndent[2].length, 32);
    assert.strictEqual(wrappedIndent[3].length, 10);
    assert.ok(wrappedIndent.every(line => line.length <= 32), 'No line exceeds 32 chars');
    recordPass('CHALLENGE-WRAP-03: Single words exceeding maxCols cleanly hard-sliced with indent invariant');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-03: Single words exceeding maxCols cleanly hard-sliced with indent invariant', err);
  }

  // Test 1.4: Extreme column widths (maxCols = 1, maxCols = 2, maxCols = 5)
  try {
    const shortText = 'Hi POS App';
    const wrappedCols1 = wrapText(shortText, 1);
    assert.ok(wrappedCols1.every(line => line.length <= 1), 'maxCols=1 must strictly cap line length <= 1');
    assert.strictEqual(wrappedCols1.join(''), 'HiPOSApp', 'All non-space characters preserved');

    const wrappedCols2 = wrapText('Supercalifragilisticexpialidocious', 2);
    assert.ok(wrappedCols2.every(line => line.length <= 2), 'maxCols=2 must strictly cap line length <= 2');
    recordPass('CHALLENGE-WRAP-04: Extreme small column boundaries (maxCols=1, maxCols=2) terminate and satisfy invariants');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-04: Extreme small column boundaries (maxCols=1, maxCols=2) terminate and satisfy invariants', err);
  }

  // Test 1.5: Indent equal to or greater than maxCols
  try {
    // If indent is "   " (3 chars) and maxCols is 3, wWidth <= 0 branch is hit
    const res = wrapText('TestingBoundaryWord', 3, '   ');
    assert.ok(res.length > 0, 'Should not throw or freeze');
    assert.ok(res.every(l => l.length <= 3), 'All lines <= 3 chars');
    recordPass('CHALLENGE-WRAP-05: Indent equal to or larger than maxCols falls back safely without infinite loop');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-05: Indent equal to or larger than maxCols falls back safely without infinite loop', err);
  }

  // Test 1.6: Unicode, emojis, Devanagari, and accents
  try {
    const devanagari = 'नमस्ते दुनिया बिलनाव कैफे स्वागतम्';
    const wrappedDev = wrapText(devanagari, 15);
    assert.ok(wrappedDev.length > 1, 'Devanagari text wraps into multiple lines');
    // Note: JS .length measures UTF-16 code units, wrapText checks length <= maxCols
    for (const line of wrappedDev) {
      assert.ok(line.length <= 15, `Devanagari line length ${line.length} must be <= 15`);
    }

    const accents = 'Café François Crème Brûlée Jalapeño Smörgåsbord';
    const wrappedAccents = wrapText(accents, 20);
    assert.ok(wrappedAccents.every(l => l.length <= 20), 'Accented characters respected within length bounds');

    const emojis = '🍕 Pizza 🍔 Burger 🍟 Fries ☕ Espresso 🍰 Cake 🍩 Donut';
    const wrappedEmojis = wrapText(emojis, 16);
    assert.ok(wrappedEmojis.every(l => l.length <= 16), 'Emoji tokens wrapped within length bounds');
    recordPass('CHALLENGE-WRAP-06: Unicode, Devanagari, accented text, and emoji tokens wrap safely');
  } catch (err) {
    recordFail('CHALLENGE-WRAP-06: Unicode, Devanagari, accented text, and emoji tokens wrap safely', err);
  }

  // Test 1.7: Performance stress test (10,000 words wrapped within < 100ms)
  try {
    const words = [];
    for (let i = 0; i < 5000; i++) {
      words.push(`ItemNumber${i}`);
      words.push(`Description${i % 10}`);
    }
    const bigText = words.join(' ');
    const t0 = Date.now();
    const wrappedBig = wrapText(bigText, 48, '  ');
    const elapsed = Date.now() - t0;

    assert.ok(wrappedBig.length > 500, 'Generated substantial wrapped lines');
    assert.ok(wrappedBig.every(l => l.length <= 48), 'All 5000+ lines strictly <= 48 chars');
    assert.ok(elapsed < 200, `High-volume 10,000 words wrap took ${elapsed}ms (expected < 200ms)`);
    recordPass(`CHALLENGE-WRAP-07: High volume stress (10,000 words) processed in ${elapsed}ms without quadratic slowdown`);
  } catch (err) {
    recordFail('CHALLENGE-WRAP-07: High volume stress (10,000 words) processed without quadratic slowdown', err);
  }

  // ============================================================================
  // SECTION 2: server.js POST /api/print/network ADVERSARIAL PORT & PAYLOAD ATTACKS
  // ============================================================================
  console.log('\n📍 SECTION 2: server.js POST /api/print/network EXTREME EDGE CASES');

  process.env.NODE_ENV = 'test';
  const { app } = await import('../server.js');
  const server = app.listen(0);
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/api/print/network`;

  try {
    const portAttackVectors = [
      { name: 'port: 0 (below min port 1)', port: 0, expected: 400 },
      { name: 'port: -1 (negative port)', port: -1, expected: 400 },
      { name: 'port: -65535 (large negative)', port: -65535, expected: 400 },
      { name: 'port: 65536 (above max port 65535)', port: 65536, expected: 400 },
      { name: 'port: 70000 (well above 65535)', port: 70000, expected: 400 },
      { name: 'port: 10000000 (extreme integer)', port: 10000000, expected: 400 },
      { name: 'port: "NaN" (literal string NaN)', port: 'NaN', expected: 400 },
      { name: 'port: 9100.5 (floating point port)', port: 9100.5, expected: 400 },
      { name: 'port: 80.0001 (floating point port)', port: 80.0001, expected: 400 },
      { name: 'port: Infinity (serializes to null in JSON)', port: Infinity, expectedDefault: true },
      { name: 'port: -Infinity (serializes to null in JSON)', port: -Infinity, expectedDefault: true },
      { name: 'port: [9100, 9200] (array with multiple ports)', port: [9100, 9200], expected: 400 },
      { name: 'port: {} (empty object)', port: {}, expected: 400 },
      { name: 'port: { port: 9100 } (nested object)', port: { port: 9100 }, expected: 400 },
      { name: 'port: "9100abc" (alphanumeric suffix)', port: '9100abc', expected: 400 },
      { name: 'port: "abc9100" (alphanumeric prefix)', port: 'abc9100', expected: 400 },
      { name: 'port: null (should use default 9100)', port: null, expectedDefault: true },
      { name: 'port: undefined (should use default 9100)', port: undefined, expectedDefault: true },
      { name: 'port: "" (empty string, should use default 9100)', port: '', expectedDefault: true },
      { name: 'port: "   " (whitespace string, should use default 9100)', port: '   ', expectedDefault: true }
    ];

    // Setup a dummy printer socket listener on a random local port to test default port vs rejected ports
    const dummyPrinter = net.createServer((c) => { c.on('data', () => {}); });
    await new Promise(r => dummyPrinter.listen(0, '127.0.0.1', r));
    const validDummyPort = dummyPrinter.address().port;

    for (const vector of portAttackVectors) {
      const body = {
        host: '127.0.0.1',
        port: vector.port,
        data: [0x1B, 0x40]
      };

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (vector.expected === 400) {
        assert.strictEqual(
          res.status,
          400,
          `Vector "${vector.name}" must return HTTP 400, got ${res.status}`
        );
        const json = await res.json();
        assert.strictEqual(json.success, false);
        assert.ok(json.error, 'Must contain validation error');
      } else if (vector.expectedDefault) {
        // Since default port is 9100, connecting to 127.0.0.1:9100 should attempt connection to 9100.
        // It may fail with ECONNREFUSED (500) or timeout (504), but MUST NOT return HTTP 400 (validation error).
        assert.notStrictEqual(
          res.status,
          400,
          `Vector "${vector.name}" should have used default port 9100 without 400 validation error`
        );
      }
    }
    dummyPrinter.close();
    recordPass(`CHALLENGE-NET-PORT-01: All ${portAttackVectors.length} port edge cases correctly validated or defaulted`);
  } catch (err) {
    recordFail('CHALLENGE-NET-PORT-01: Port edge cases verification', err);
  }

  // Test 2.2: Host attack vectors
  try {
    const hostAttackVectors = [
      { name: 'host: null', host: null },
      { name: 'host: undefined', host: undefined },
      { name: 'host: empty string', host: '' },
      { name: 'host: whitespace only', host: '     ' },
      { name: 'host: number 127001', host: 127001 },
      { name: 'host: boolean true', host: true },
      { name: 'host: array ["127.0.0.1"]', host: ['127.0.0.1'] },
      { name: 'host: object { ip: "127.0.0.1" }', host: { ip: '127.0.0.1' } }
    ];

    for (const vector of hostAttackVectors) {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: vector.host,
          port: 9100,
          data: [0x1B, 0x40]
        })
      });

      assert.strictEqual(res.status, 400, `Vector "${vector.name}" must return HTTP 400`);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes('host') || json.error.includes('Target printer host'), 'Error message must mention host requirement');
    }
    recordPass(`CHALLENGE-NET-HOST-01: All ${hostAttackVectors.length} invalid host vectors rejected with HTTP 400`);
  } catch (err) {
    recordFail('CHALLENGE-NET-HOST-01: Host validation edge cases', err);
  }

  // Test 2.3: Data buffer attack vectors
  try {
    const dataAttackVectors = [
      { name: 'data: null', data: null },
      { name: 'data: undefined', data: undefined },
      { name: 'data: empty array []', data: [] },
      { name: 'data: empty string ""', data: '' },
      { name: 'data: number 99999', data: 99999 },
      { name: 'data: boolean false', data: false },
      { name: 'data: empty object {}', data: {} }
    ];

    for (const vector of dataAttackVectors) {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: 9100,
          data: vector.data
        })
      });

      assert.strictEqual(res.status, 400, `Vector "${vector.name}" must return HTTP 400`);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes('buffer') || json.error.includes('Print data buffer'), 'Must reject empty/invalid data');
    }
    recordPass(`CHALLENGE-NET-DATA-01: All ${dataAttackVectors.length} invalid data vectors rejected with HTTP 400`);
  } catch (err) {
    recordFail('CHALLENGE-NET-DATA-01: Data buffer validation edge cases', err);
  }

  // Test 2.4: Valid base64 encoded data string streaming
  try {
    let capturedBytes = null;
    const testPrinter = net.createServer((sock) => {
      sock.on('data', (d) => {
        capturedBytes = d;
      });
    });
    await new Promise(r => testPrinter.listen(0, '127.0.0.1', r));
    const testPort = testPrinter.address().port;

    // Base64 for [0x1B, 0x40, 0x54, 0x45, 0x53, 0x54] ("\x1b@TEST")
    const base64Data = Buffer.from([0x1B, 0x40, 0x54, 0x45, 0x53, 0x54]).toString('base64');

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '127.0.0.1',
        port: testPort,
        data: base64Data
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.bytesWritten, 6);

    await new Promise(r => setTimeout(r, 100));
    testPrinter.close();

    assert.ok(capturedBytes, 'Bytes should have been captured by socket');
    assert.strictEqual(capturedBytes[0], 0x1B);
    assert.strictEqual(capturedBytes[1], 0x40);
    assert.strictEqual(capturedBytes.toString('utf-8', 2), 'TEST');
    recordPass('CHALLENGE-NET-BASE64-01: Base64 encoded payload successfully decoded and streamed to TCP socket');
  } catch (err) {
    recordFail('CHALLENGE-NET-BASE64-01: Base64 payload streaming', err);
  } finally {
    server.close();
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n====================================================================');
  console.log(`🎯 DEEP STRESS COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================================\n');

  return { passed, failed, findings };
}

runDeepStressSuite()
  .then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
