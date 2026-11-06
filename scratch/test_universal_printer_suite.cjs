/**
 * scratch/test_universal_printer_suite.cjs
 * ============================================================================
 * UNIFIED MASTER TEST RUNNER:
 * Universal Thermal Printer Compatibility, Dual Routing, Distributed Cloud
 * Print Relay, Critical System Invariants, and Full Project Regression.
 *
 * Covers:
 *   - Milestone 1 (R1): Universal Thermal Printer Connectivity
 *     1. scratch/test_m1_printer_connectivity.cjs
 *     2. scratch/test_adversarial_m1_hardware.cjs
 *     3. scratch/test_adversarial_m1_printer.cjs
 *   - Milestone 2 (R2): Dual Thermal Printer Management & Routing
 *     4. scratch/test_m2_dual_printer_routing.cjs
 *     5. scratch/test_adversarial_m2_routing.cjs
 *     6. scratch/test_adversarial_m2_hardware_bounds.cjs
 *   - Milestone 3 (R3): Distributed Cloud Print Relay for Remote KOT
 *     7. scratch/test_m3_cloud_print_relay.cjs
 *     8. scratch/test_adversarial_m3_iter2_stress.cjs
 *     9. scratch/test_adversarial_m3_security_boundary.cjs
 *    10. scratch/test_challenger_m3_iter2_security_invariants.cjs
 *   - System Invariants & Statutory Invoicing (R4):
 *    11. scratch/test_vector_audit.cjs (26 .modal-close-btn SVGs)
 *    12. scratch/test_invoice_details_and_gst.cjs (0 emojis, currency non-breaking space)
 *   - Security Rules Binary Parity:
 *    13. Binary byte comparison, SHA-256 match, and OS fc /b between firestore.rules and database/firestore.rules
 *   - Full Project Regression:
 *    14. npm test (all 18 test suites in package.json)
 * ============================================================================
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('🖨️  MASTER TEST RUNNER: UNIVERSAL THERMAL PRINTER SUITE (M1 - M4)');
console.log('   Universal Connectivity, Dual Routing, Cloud Relay & Regression');
console.log('====================================================================\n');

const suiteResults = [];

/**
 * Run a node script in a child process
 */
function runNodeSuite(category, relativeScriptPath, description) {
  const fullPath = path.join(ROOT_DIR, relativeScriptPath);
  const startTime = Date.now();
  console.log(`\n--------------------------------------------------------------------`);
  console.log(`▶ [${category}] RUNNING: ${relativeScriptPath}`);
  console.log(`  Description: ${description}`);
  console.log(`--------------------------------------------------------------------`);

  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ FAIL: File not found: ${relativeScriptPath}`);
    suiteResults.push({
      category,
      name: relativeScriptPath,
      description,
      status: 'FAILED',
      durationMs: 0,
      passCount: 0,
      failCount: 1,
      error: `File not found: ${relativeScriptPath}`
    });
    return false;
  }

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env
  });

  const durationMs = Date.now() - startTime;
  const passed = result.status === 0;

  if (passed) {
    console.log(`\n  ✅ [${category}] PASSED: ${relativeScriptPath} (${durationMs}ms)`);
  } else {
    console.error(`\n  ❌ [${category}] FAILED: ${relativeScriptPath} (exit code ${result.status}, ${durationMs}ms)`);
  }

  suiteResults.push({
    category,
    name: relativeScriptPath,
    description,
    status: passed ? 'PASSED' : 'FAILED',
    durationMs,
    exitCode: result.status
  });

  return passed;
}

/**
 * Run Security Rules Binary Parity Verification
 */
function runRulesBinaryParity() {
  const category = 'RULES_PARITY';
  const name = 'firestore.rules <=> database/firestore.rules';
  const description = 'Byte-for-byte binary equality, SHA-256 match, and fc /b check';
  const startTime = Date.now();

  console.log(`\n--------------------------------------------------------------------`);
  console.log(`▶ [${category}] RUNNING: Security Rules Binary Parity Audit`);
  console.log(`  Description: ${description}`);
  console.log(`--------------------------------------------------------------------`);

  const file1 = path.join(ROOT_DIR, 'firestore.rules');
  const file2 = path.join(ROOT_DIR, 'database', 'firestore.rules');

  let passed = true;
  let errors = [];

  try {
    if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
      throw new Error('One or both firestore.rules files do not exist');
    }

    const buf1 = fs.readFileSync(file1);
    const buf2 = fs.readFileSync(file2);

    // 1. Length equality
    if (buf1.length !== buf2.length) {
      errors.push(`Length mismatch: root=${buf1.length} bytes, database=${buf2.length} bytes`);
      passed = false;
    } else {
      console.log(`  ✅ PASS: Exact byte length match (${buf1.length} bytes)`);
    }

    // 2. Buffer comparison
    const cmp = Buffer.compare(buf1, buf2);
    if (cmp !== 0) {
      errors.push(`Buffer.compare returned non-zero (${cmp})`);
      passed = false;
    } else {
      console.log(`  ✅ PASS: Buffer.compare returned 0 (100% byte-for-byte identical)`);
    }

    // 3. SHA-256 Hash
    const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
    if (hash1 !== hash2) {
      errors.push(`SHA-256 mismatch: root=${hash1}, database=${hash2}`);
      passed = false;
    } else {
      console.log(`  ✅ PASS: SHA-256 digest match: ${hash1}`);
    }

    // 4. OS fc /b on Windows (if running on Windows)
    if (process.platform === 'win32') {
      const fcRes = spawnSync('cmd.exe', ['/c', 'fc', '/b', 'firestore.rules', 'database\\firestore.rules'], {
        cwd: ROOT_DIR,
        encoding: 'utf8'
      });
      if (fcRes.status === 0 && fcRes.stdout.includes('no differences encountered')) {
        console.log(`  ✅ PASS: Windows fc /b verified: no differences encountered`);
      } else {
        errors.push(`Windows fc /b failed: ${fcRes.stdout || fcRes.stderr}`);
        passed = false;
      }
    }
  } catch (err) {
    passed = false;
    errors.push(err.message);
  }

  const durationMs = Date.now() - startTime;
  if (passed) {
    console.log(`\n  ✅ [${category}] PASSED: Binary parity fully confirmed (${durationMs}ms)`);
  } else {
    console.error(`\n  ❌ [${category}] FAILED: ${errors.join(', ')} (${durationMs}ms)`);
  }

  suiteResults.push({
    category,
    name,
    description,
    status: passed ? 'PASSED' : 'FAILED',
    durationMs,
    exitCode: passed ? 0 : 1,
    errors
  });

  return passed;
}

/**
 * Run Full Regression Suite: npm test
 */
function runNpmTestRegression() {
  const category = 'REGRESSION';
  const name = 'npm test';
  const description = 'Full project regression execution across all 18 test suites';
  const startTime = Date.now();

  console.log(`\n--------------------------------------------------------------------`);
  console.log(`▶ [${category}] RUNNING: Full Regression Suite (npm test)`);
  console.log(`  Description: ${description}`);
  console.log(`--------------------------------------------------------------------`);

  let passed = false;
  let exitCode = 0;
  try {
    execSync('npm test', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env
    });
    passed = true;
    exitCode = 0;
  } catch (err) {
    passed = false;
    exitCode = err.status || 1;
  }

  const durationMs = Date.now() - startTime;

  if (passed) {
    console.log(`\n  ✅ [${category}] PASSED: Full regression test passed (${durationMs}ms)`);
  } else {
    console.error(`\n  ❌ [${category}] FAILED: npm test exited with code ${exitCode} (${durationMs}ms)`);
  }

  suiteResults.push({
    category,
    name,
    description,
    status: passed ? 'PASSED' : 'FAILED',
    durationMs,
    exitCode
  });

  return passed;
}

/**
 * Main Orchestrator
 */
async function main() {
  console.log('Initiating full test matrix execution...\n');

  // =========================================================================
  // MILESTONE 1: UNIVERSAL THERMAL PRINTER CONNECTIVITY (R1)
  // =========================================================================
  runNodeSuite(
    'M1_CONNECTIVITY',
    'scratch/test_m1_printer_connectivity.cjs',
    'Dynamic ESC/POS bytecode, Web Bluetooth Ezo UUIDs, WebUSB, Network TCP relay, Web Serial'
  );

  runNodeSuite(
    'M1_ADVERSARIAL_HW',
    'scratch/test_adversarial_m1_hardware.cjs',
    'Adversarial hardware stress, failure mode reproduction, pacing, disconnects'
  );

  runNodeSuite(
    'M1_ADVERSARIAL_PRN',
    'scratch/test_adversarial_m1_printer.cjs',
    'Extreme line lengths, 100+ char items, GATT security exceptions, TCP proxy timeouts'
  );

  // =========================================================================
  // MILESTONE 2: DUAL THERMAL PRINTER MANAGEMENT & ROUTING (R2)
  // =========================================================================
  runNodeSuite(
    'M2_ROUTING',
    'scratch/test_m2_dual_printer_routing.cjs',
    'Dual printer slots (printer1 & printer2), role routing, settings modal, interactive prompt'
  );

  runNodeSuite(
    'M2_ADVERSARIAL_RTG',
    'scratch/test_adversarial_m2_routing.cjs',
    'High-concurrency role switching, corrupt localStorage auto-recovery, prompt cancellations'
  );

  runNodeSuite(
    'M2_ADVERSARIAL_BND',
    'scratch/test_adversarial_m2_hardware_bounds.cjs',
    'Zero column overflow (32/48 cols), modal lifecycle stress, DOM invariants preservation'
  );

  // =========================================================================
  // MILESTONE 3: DISTRIBUTED CLOUD PRINT RELAY FOR REMOTE KOT (R3)
  // =========================================================================
  runNodeSuite(
    'M3_CLOUD_RELAY',
    'scratch/test_m3_cloud_print_relay.cjs',
    'Firestore print_queue, atomic transaction leasing, 60s zombie recovery, local billing lock'
  );

  runNodeSuite(
    'M3_ITER2_STRESS',
    'scratch/test_adversarial_m3_iter2_stress.cjs',
    '10-20 concurrent worker lease racing, network disconnections, lease renewal invariants'
  );

  runNodeSuite(
    'M3_SEC_BOUNDARY',
    'scratch/test_adversarial_m3_security_boundary.cjs',
    'Exhaustive billing injection attacks, 20 forbidden billing keys, schema tamper rejection'
  );

  runNodeSuite(
    'M3_CHALLENGER_INV',
    'scratch/test_challenger_m3_iter2_security_invariants.cjs',
    '130 empirical challenges: injection attacks, rules simulation, repository invariants'
  );

  // =========================================================================
  // REPOSITORY INVARIANTS & STATUTORY INVOICE DETAILS (R4)
  // =========================================================================
  runNodeSuite(
    'INVARIANTS_VECTOR',
    'scratch/test_vector_audit.cjs',
    'Invariant audit: exactly 26 .modal-close-btn SVGs, 0 raw "✕", modern CSS'
  );

  runNodeSuite(
    'INVARIANTS_INVOICE',
    'scratch/test_invoice_details_and_gst.cjs',
    'Statutory invoice fields, GST split, 0 raw emojis in buttons/tabs, currency space (₹ )'
  );

  // =========================================================================
  // FIRESTORE RULES BINARY PARITY (R3/R4)
  // =========================================================================
  runRulesBinaryParity();

  // =========================================================================
  // FULL REGRESSION SUITE (ALL 18 SUITES)
  // =========================================================================
  runNpmTestRegression();

  // =========================================================================
  // FINAL SCORECARD & ASSESSMENT
  // =========================================================================
  console.log('\n====================================================================');
  console.log('📊 MASTER TEST SUITE SCORECARD & COVERAGE MATRIX');
  console.log('====================================================================');

  let allPassed = true;
  let totalDuration = 0;

  console.log(
    'Category'.padEnd(20) +
    'Suite / Target'.padEnd(42) +
    'Status'.padEnd(12) +
    'Duration'.padStart(10)
  );
  console.log('-'.repeat(84));

  for (const s of suiteResults) {
    totalDuration += s.durationMs;
    if (s.status !== 'PASSED') {
      allPassed = false;
    }
    const statusFormatted = s.status === 'PASSED' ? '✅ PASS' : '❌ FAIL';
    console.log(
      s.category.padEnd(20) +
      s.name.padEnd(42) +
      statusFormatted.padEnd(12) +
      `${s.durationMs}ms`.padStart(10)
    );
  }

  console.log('-'.repeat(84));
  console.log(`Total Execution Time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Total Suites Executed: ${suiteResults.length}`);
  console.log(`Suites Passed: ${suiteResults.filter(s => s.status === 'PASSED').length}`);
  console.log(`Suites Failed: ${suiteResults.filter(s => s.status !== 'PASSED').length}`);
  console.log('====================================================================');

  if (allPassed) {
    console.log('✨ FINAL VERDICT: 100% GREEN — ALL SUITES, INVARIANTS & REGRESSION PASSED!');
    console.log('====================================================================\n');
    process.exit(0);
  } else {
    console.error('💥 FINAL VERDICT: TEST SUITE FAILED — REGRESSION OR DEFECT DETECTED!');
    console.error('====================================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal unhandled error during master suite execution:', err);
  process.exit(1);
});
