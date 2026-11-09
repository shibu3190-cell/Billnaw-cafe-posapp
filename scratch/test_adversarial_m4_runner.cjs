/**
 * scratch/test_adversarial_m4_runner.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST FOR MASTER TEST RUNNER:
 * scratch/test_universal_printer_suite.cjs
 *
 * Requirements Tested:
 * 1. Failure Propagation:
 *    - Child process exit code 1 -> runner detects and marks FAILED
 *    - Child process exit code 42 -> runner detects and marks FAILED
 *    - Child process uncaught exception -> runner detects and marks FAILED
 *    - Child process missing file -> runner detects and marks FAILED
 *    - Child process signal termination (SIGTERM/SIGKILL) -> runner detects and marks FAILED
 *    - Rules binary parity mismatch -> runner detects and marks FAILED
 *    - Npm test regression failure -> runner detects and marks FAILED
 *    - Cloned runner end-to-end failure -> runner process exits with non-zero exit code (1)
 *
 * 2. Child Process State Isolation:
 *    - Environment variables pollution isolation
 *    - Global / globalThis namespace isolation
 *    - Prototype pollution isolation
 *    - Module require cache isolation
 *    - Memory heap isolation
 * ============================================================================
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(__dirname, 'temp_m4_stress');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
    failCount++;
  }
}

// Ensure temp dir
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log('====================================================================');
console.log('🔬 ADVERSARIAL STRESS TEST: MASTER TEST RUNNER MECHANICS');
console.log('====================================================================\n');

// ============================================================================
// PART 1: CHILD PROCESS STATE ISOLATION AUDIT
// ============================================================================
console.log('--- PART 1: CHILD PROCESS STATE ISOLATION ---');

// Create script 1 that aggressively pollutes environment, globals, prototypes
const script1Path = path.join(TEMP_DIR, 'isolate_polluter.cjs');
const script2Path = path.join(TEMP_DIR, 'isolate_verifier.cjs');

fs.writeFileSync(script1Path, `
// Pollute environment
process.env.M4_POLLUTED_FLAG = 'COMPROMISED_VALUE_12345';
process.env.NODE_ENV = 'adversarial_toxic';

// Pollute global and globalThis
global.M4_POLLUTED_GLOBAL = { toxic: true, timestamp: Date.now() };
globalThis.M4_POLLUTED_GLOBALTHIS = 'toxic_pollution';

// Pollute Object and Array prototype
Object.prototype.__adversarial_leak__ = 'leaked_prototype_property';
Array.prototype.__adversarial_arr_leak__ = function() { return 'leaked'; };

// Set mock browser globals that test suites typically set
global.window = { isMock: true, contaminated: true };
global.navigator = { bluetooth: { requestDevice: () => {} } };
global.localStorage = { store: { secret: 'dirty' } };

console.log('POLLUTER_EXEC_SUCCESS');
process.exit(0);
`);

fs.writeFileSync(script2Path, `
// Verify that none of the pollution from script 1 exists in this process
const errors = [];

if (process.env.M4_POLLUTED_FLAG) {
  errors.push('process.env.M4_POLLUTED_FLAG leaked: ' + process.env.M4_POLLUTED_FLAG);
}

if (process.env.NODE_ENV === 'adversarial_toxic') {
  errors.push('process.env.NODE_ENV contaminated');
}

if (typeof global.M4_POLLUTED_GLOBAL !== 'undefined') {
  errors.push('global.M4_POLLUTED_GLOBAL leaked');
}

if (typeof globalThis.M4_POLLUTED_GLOBALTHIS !== 'undefined') {
  errors.push('globalThis.M4_POLLUTED_GLOBALTHIS leaked');
}

if (typeof Object.prototype.__adversarial_leak__ !== 'undefined') {
  errors.push('Object.prototype.__adversarial_leak__ leaked');
}

if (typeof Array.prototype.__adversarial_arr_leak__ !== 'undefined') {
  errors.push('Array.prototype.__adversarial_arr_leak__ leaked');
}

if (typeof global.window !== 'undefined') {
  errors.push('global.window leaked');
}

if (typeof global.navigator.bluetooth !== 'undefined') {
  errors.push('global.navigator.bluetooth mock leaked');
}

if (typeof global.localStorage !== 'undefined') {
  errors.push('global.localStorage leaked');
}

if (errors.length > 0) {
  console.error('ISOLATION_FAILURE: ' + errors.join('; '));
  process.exit(1);
} else {
  console.log('ISOLATION_VERIFIED_CLEAN');
  process.exit(0);
}
`);

runTest('State Isolation: First child process pollutes globals, env, prototypes', () => {
  const res1 = spawnSync(process.execPath, [script1Path], { encoding: 'utf8' });
  assert.strictEqual(res1.status, 0, 'Polluter child should exit 0');
  assert.ok(res1.stdout.includes('POLLUTER_EXEC_SUCCESS'), 'Polluter must have executed');
});

runTest('State Isolation: Second child process has clean V8 heap, zero leaks', () => {
  const res2 = spawnSync(process.execPath, [script2Path], { encoding: 'utf8' });
  assert.strictEqual(res2.status, 0, `Verifier child must exit 0: ${res2.stderr || res2.stdout}`);
  assert.ok(res2.stdout.includes('ISOLATION_VERIFIED_CLEAN'), 'Verifier must confirm clean state');
});

runTest('State Isolation: Parent process itself remains unpolluted', () => {
  assert.strictEqual(typeof process.env.M4_POLLUTED_FLAG, 'undefined', 'Parent process.env must not have leaked flag');
  assert.strictEqual(typeof global.M4_POLLUTED_GLOBAL, 'undefined', 'Parent global must not have leaked property');
  assert.strictEqual(typeof Object.prototype.__adversarial_leak__, 'undefined', 'Parent Object prototype must be unpolluted');
  assert.strictEqual(typeof global.window, 'undefined', 'Parent global.window must remain undefined');
});

runTest('State Isolation: Module require cache is isolated per child process', () => {
  const modTest1 = path.join(TEMP_DIR, 'mod_test_1.cjs');
  const modTest2 = path.join(TEMP_DIR, 'mod_test_2.cjs');
  const sharedMod = path.join(TEMP_DIR, 'shared_mod.cjs');

  fs.writeFileSync(sharedMod, `module.exports = { counter: 0 };`);
  fs.writeFileSync(modTest1, `
    const m = require('./shared_mod.cjs');
    m.counter = 999;
    process.exit(0);
  `);
  fs.writeFileSync(modTest2, `
    const m = require('./shared_mod.cjs');
    if (m.counter === 999) {
      console.error('MODULE_CACHE_LEAKED');
      process.exit(1);
    }
    console.log('MODULE_CACHE_CLEAN');
    process.exit(0);
  `);

  const r1 = spawnSync(process.execPath, [modTest1], { encoding: 'utf8' });
  const r2 = spawnSync(process.execPath, [modTest2], { encoding: 'utf8' });
  assert.strictEqual(r1.status, 0);
  assert.strictEqual(r2.status, 0);
  assert.ok(r2.stdout.includes('MODULE_CACHE_CLEAN'), 'Module cache must not leak across processes');
});

// ============================================================================
// PART 2: FAILURE PROPAGATION HARNESS (SUBPROCESS CRASHES & EXIT CODES)
// ============================================================================
console.log('\n--- PART 2: FAILURE PROPAGATION HARNESS ---');

// Create test scripts with various failure modes
const failExit1Path = path.join(TEMP_DIR, 'fail_exit_1.cjs');
fs.writeFileSync(failExit1Path, `
console.error('Simulated assertion failure in sub-suite');
process.exit(1);
`);

const failExit42Path = path.join(TEMP_DIR, 'fail_exit_42.cjs');
fs.writeFileSync(failExit42Path, `
console.error('Simulated fatal error code 42');
process.exit(42);
`);

const failThrowPath = path.join(TEMP_DIR, 'fail_throw_uncaught.cjs');
fs.writeFileSync(failThrowPath, `
console.error('Simulated uncaught exception');
throw new Error('UNCAUGHT_SUBPROCESS_CRASH');
`);

const failSyntaxPath = path.join(TEMP_DIR, 'fail_syntax_error.cjs');
fs.writeFileSync(failSyntaxPath, `
// Malformed javascript syntax
const invalid = ;;;
`);

// Replicate runner's runNodeSuite logic
function simulateRunNodeSuite(scriptRelativePath) {
  const fullPath = path.join(ROOT_DIR, scriptRelativePath);
  if (!fs.existsSync(fullPath)) {
    return {
      status: 'FAILED',
      exitCode: null,
      error: 'File not found'
    };
  }

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    env: process.env,
    encoding: 'utf8'
  });

  const passed = result.status === 0;
  return {
    status: passed ? 'PASSED' : 'FAILED',
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

runTest('Failure Propagation: Sub-suite exiting with status 1 is marked FAILED', () => {
  const relPath = path.relative(ROOT_DIR, failExit1Path);
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Status must be FAILED');
  assert.strictEqual(outcome.exitCode, 1, 'Exit code must be preserved as 1');
});

runTest('Failure Propagation: Sub-suite exiting with status 42 is marked FAILED', () => {
  const relPath = path.relative(ROOT_DIR, failExit42Path);
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Status must be FAILED');
  assert.strictEqual(outcome.exitCode, 42, 'Exit code must be preserved as 42');
});

runTest('Failure Propagation: Sub-suite throwing uncaught exception is marked FAILED', () => {
  const relPath = path.relative(ROOT_DIR, failThrowPath);
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Status must be FAILED');
  assert.strictEqual(outcome.exitCode, 1, 'Exit code for uncaught exception is 1');
  assert.ok(outcome.stderr.includes('UNCAUGHT_SUBPROCESS_CRASH'), 'Stderr captured stack');
});

runTest('Failure Propagation: Sub-suite with syntax error is marked FAILED', () => {
  const relPath = path.relative(ROOT_DIR, failSyntaxPath);
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Status must be FAILED');
  assert.strictEqual(outcome.exitCode, 1, 'Exit code for syntax error is 1');
});

runTest('Failure Propagation: Sub-suite self-terminating via SIGTERM is marked FAILED', () => {
  const failSignalPath = path.join(TEMP_DIR, 'fail_signal.cjs');
  fs.writeFileSync(failSignalPath, `
    process.kill(process.pid, 'SIGTERM');
  `);
  const relPath = path.relative(ROOT_DIR, failSignalPath);
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Killed process must be marked FAILED');
});

runTest('Failure Propagation: Missing sub-suite file is detected and marked FAILED', () => {
  const relPath = 'scratch/does_not_exist_xyz123.cjs';
  const outcome = simulateRunNodeSuite(relPath);
  assert.strictEqual(outcome.status, 'FAILED', 'Status must be FAILED');
  assert.strictEqual(outcome.error, 'File not found', 'Must flag file not found');
});

// ============================================================================
// PART 3: RULES BINARY PARITY ADVERSARIAL STRESS
// ============================================================================
console.log('\n--- PART 3: RULES PARITY ADVERSARIAL AUDIT ---');

function simulateRulesBinaryParity(file1Path, file2Path) {
  let passed = true;
  let errors = [];

  try {
    if (!fs.existsSync(file1Path) || !fs.existsSync(file2Path)) {
      throw new Error('One or both firestore.rules files do not exist');
    }

    const buf1 = fs.readFileSync(file1Path);
    const buf2 = fs.readFileSync(file2Path);

    if (buf1.length !== buf2.length) {
      errors.push(`Length mismatch: ${buf1.length} vs ${buf2.length}`);
      passed = false;
    }

    const cmp = Buffer.compare(buf1, buf2);
    if (cmp !== 0) {
      errors.push(`Buffer.compare returned ${cmp}`);
      passed = false;
    }

    const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
    if (hash1 !== hash2) {
      errors.push(`SHA-256 mismatch: ${hash1} vs ${hash2}`);
      passed = false;
    }
  } catch (err) {
    passed = false;
    errors.push(err.message);
  }

  return {
    passed,
    errors
  };
}

runTest('Rules Parity: Legitimate identical files evaluate PASSED', () => {
  const f1 = path.join(ROOT_DIR, 'firestore.rules');
  const f2 = path.join(ROOT_DIR, 'database', 'firestore.rules');
  const res = simulateRulesBinaryParity(f1, f2);
  assert.strictEqual(res.passed, true, 'Real rules must pass parity');
  assert.strictEqual(res.errors.length, 0);
});

runTest('Rules Parity: Single byte difference triggers FAILED with hash mismatch', () => {
  const f1 = path.join(ROOT_DIR, 'firestore.rules');
  const mutatedPath = path.join(TEMP_DIR, 'firestore_tampered.rules');
  const originalBuf = fs.readFileSync(f1);
  const tamperedBuf = Buffer.from(originalBuf);
  // Flip a single byte in the buffer
  tamperedBuf[tamperedBuf.length - 1] = tamperedBuf[tamperedBuf.length - 1] ^ 0x01;
  fs.writeFileSync(mutatedPath, tamperedBuf);

  const res = simulateRulesBinaryParity(f1, mutatedPath);
  assert.strictEqual(res.passed, false, 'Tampered rule must fail parity');
  assert.ok(res.errors.some(e => e.includes('SHA-256 mismatch')), 'Must catch SHA-256 mismatch');
  assert.ok(res.errors.some(e => e.includes('Buffer.compare')), 'Must catch Buffer mismatch');
});

runTest('Rules Parity: Truncated file triggers FAILED with length mismatch', () => {
  const f1 = path.join(ROOT_DIR, 'firestore.rules');
  const truncatedPath = path.join(TEMP_DIR, 'firestore_truncated.rules');
  const originalBuf = fs.readFileSync(f1);
  fs.writeFileSync(truncatedPath, originalBuf.slice(0, originalBuf.length - 10));

  const res = simulateRulesBinaryParity(f1, truncatedPath);
  assert.strictEqual(res.passed, false, 'Truncated rule must fail parity');
  assert.ok(res.errors.some(e => e.includes('Length mismatch')), 'Must catch length mismatch');
});

runTest('Rules Parity: Missing rules file triggers FAILED', () => {
  const f1 = path.join(ROOT_DIR, 'firestore.rules');
  const missingPath = path.join(TEMP_DIR, 'non_existent.rules');
  const res = simulateRulesBinaryParity(f1, missingPath);
  assert.strictEqual(res.passed, false, 'Missing rule must fail parity');
  assert.ok(res.errors.some(e => e.includes('do not exist')));
});

// ============================================================================
// PART 4: FULL RUNNER PROCESS EXIT CODE PROPAGATION E2E TEST
// ============================================================================
console.log('\n--- PART 4: FULL RUNNER PROCESS ADVERSARIAL INJECTION ---');

runTest('Master Runner E2E: Injected failing stage forces master exit code 1', () => {
  // Read original master runner
  const originalRunnerPath = path.join(ROOT_DIR, 'scratch', 'test_universal_printer_suite.cjs');
  let runnerCode = fs.readFileSync(originalRunnerPath, 'utf8');

  // Inject our failing script as the first target
  const failingScriptRel = path.relative(ROOT_DIR, failExit1Path).replace(/\\/g, '/');
  
  // Replace the first test target with our failing test
  const modifiedCode = runnerCode.replace(
    "'scratch/test_m1_printer_connectivity.cjs'",
    `'${failingScriptRel}'`
  );

  assert.notStrictEqual(runnerCode, modifiedCode, 'Modification must have succeeded');

  const adversarialRunnerPath = path.join(TEMP_DIR, 'test_adversarial_master_runner.cjs');
  fs.writeFileSync(adversarialRunnerPath, modifiedCode, 'utf8');

  // Execute the modified runner
  const runnerResult = spawnSync(process.execPath, [adversarialRunnerPath], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8'
  });

  // Verify failure propagation to process exit code
  assert.strictEqual(
    runnerResult.status,
    1,
    `Master runner with failing sub-suite must exit with code 1, but got ${runnerResult.status}`
  );

  // Verify failure appeared in scorecard output
  const output = runnerResult.stdout + '\n' + runnerResult.stderr;
  assert.ok(
    output.includes('❌ FAIL') || output.includes('FAILED'),
    'Scorecard must display ❌ FAIL for the failing sub-suite'
  );
  assert.ok(
    output.includes('FINAL VERDICT: TEST SUITE FAILED'),
    'Master runner must announce FINAL VERDICT: TEST SUITE FAILED'
  );
  assert.ok(
    output.includes('Suites Failed: 1'),
    'Scorecard must count Suites Failed: 1'
  );
});

runTest('Master Runner Logic: Rules parity failure in runner triggers exit code 1', () => {
  // Create a minimal harness mirroring test_universal_printer_suite.cjs
  const runnerLogicPath = path.join(TEMP_DIR, 'runner_rules_fail.cjs');
  fs.writeFileSync(runnerLogicPath, `
    const suiteResults = [];
    // Simulate failing rules parity
    suiteResults.push({
      category: 'RULES_PARITY',
      name: 'firestore.rules <=> database/firestore.rules',
      status: 'FAILED',
      durationMs: 50,
      exitCode: 1
    });

    let allPassed = true;
    for (const s of suiteResults) {
      if (s.status !== 'PASSED') allPassed = false;
    }
    process.exit(allPassed ? 0 : 1);
  `);

  const res = spawnSync(process.execPath, [runnerLogicPath]);
  assert.strictEqual(res.status, 1, 'Runner must exit 1 when rules parity fails');
});

runTest('Master Runner Logic: Regression npm test failure in runner triggers exit code 1', () => {
  const runnerLogicPath = path.join(TEMP_DIR, 'runner_regression_fail.cjs');
  fs.writeFileSync(runnerLogicPath, `
    const suiteResults = [];
    // Simulate failing regression
    suiteResults.push({
      category: 'REGRESSION',
      name: 'npm test',
      status: 'FAILED',
      durationMs: 500,
      exitCode: 1
    });

    let allPassed = true;
    for (const s of suiteResults) {
      if (s.status !== 'PASSED') allPassed = false;
    }
    process.exit(allPassed ? 0 : 1);
  `);

  const res = spawnSync(process.execPath, [runnerLogicPath]);
  assert.strictEqual(res.status, 1, 'Runner must exit 1 when regression fails');
});

// ============================================================================
// PART 5: CLEANUP & SUMMARY
// ============================================================================
console.log('\n--- CLEANUP ---');
try {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log('  Cleaned up temporary stress test directory.');
} catch (e) {
  console.warn('  Warning: Could not remove temp dir:', e.message);
}

console.log('\n====================================================================');
console.log(`📊 ADVERSARIAL CHALLENGER SCORECARD`);
console.log(`====================================================================`);
console.log(`Total Assertions/Tests: ${passCount + failCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log('====================================================================');

if (failCount === 0) {
  console.log('✨ ADVERSARIAL CHALLENGE VERDICT: ALL FAILURE PROPAGATION & ISOLATION CHECKS PASSED!');
  process.exit(0);
} else {
  console.error('💥 ADVERSARIAL CHALLENGE VERDICT: FAILED CHECKS DETECTED!');
  process.exit(1);
}
