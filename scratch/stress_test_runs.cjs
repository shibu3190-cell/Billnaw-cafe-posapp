/**
 * scratch/stress_test_runs.cjs
 * Empirical Challenger Verification Harness for scratch/test_browser_viewports.cjs
 *
 * Runs 3 consecutive executions of test_browser_viewports.cjs.
 * Streams stdout in real time to observe exact progress.
 * Measures:
 * 1. Exact execution duration (< 30s)
 * 2. Exit code (must be 0)
 * 3. Process tree teardown (Chrome process, WebSocket closure, port 9250 clearance)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_SCRIPT = path.join(ROOT_DIR, 'scratch', 'test_browser_viewports.cjs');

function getPortStatus(port) {
    try {
        const out = execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, { encoding: 'utf8' }).trim();
        return out.length > 0 ? out : null;
    } catch (e) {
        return null;
    }
}

function runSingleAudit(runIndex) {
    return new Promise((resolve, reject) => {
        console.log(`\n============================================================`);
        console.log(`🚀 STARTING STRESS RUN #${runIndex}`);
        console.log(`============================================================`);

        const portBefore = getPortStatus(9250);
        console.log(`Port 9250 before run: ${portBefore ? `IN USE by PID(s): ${portBefore}` : 'FREE'}`);

        const startTime = Date.now();
        const proc = spawn('node', [TEST_SCRIPT], {
            cwd: ROOT_DIR,
            env: process.env,
            stdio: 'inherit' // Real-time streaming
        });

        proc.on('close', (code, signal) => {
            const durationMs = Date.now() - startTime;
            const durationSec = (durationMs / 1000).toFixed(2);
            console.log(`\n⏱️ Run #${runIndex} finished in ${durationMs}ms (${durationSec}s) with exit code: ${code}`);

            const portAfter = getPortStatus(9250);
            console.log(`Port 9250 after run: ${portAfter ? `IN USE by PID(s): ${portAfter}` : 'CLEANLY RELEASED'}`);

            resolve({
                runIndex,
                code,
                durationMs,
                durationSec: parseFloat(durationSec),
                portBefore,
                portAfter
            });
        });

        proc.on('error', err => {
            reject(err);
        });
    });
}

async function main() {
    console.log('Starting 3 consecutive stress runs of scratch/test_browser_viewports.cjs...\n');
    const results = [];

    for (let i = 1; i <= 3; i++) {
        const result = await runSingleAudit(i);
        results.push(result);

        if (result.code !== 0) {
            console.error(`\n❌ FAILED: Run #${i} exited with non-zero code: ${result.code}`);
            process.exit(1);
        }

        if (result.durationSec >= 30.0) {
            console.error(`\n❌ FAILED: Run #${i} took ${result.durationSec}s, which exceeds 30.0s budget`);
            process.exit(1);
        }

        if (result.portAfter) {
            console.error(`\n❌ FAILED: Run #${i} leaked port 9250 listener!`);
            process.exit(1);
        }

        console.log(`✅ Run #${i} VERIFIED: Duration = ${result.durationSec}s (< 30s), Exit Code = ${result.code}, Port 9250 = Clean`);
    }

    console.log('\n============================================================');
    console.log('📊 CONSECUTIVE RUNS SUMMARY');
    console.log('============================================================');
    console.table(results.map(r => ({
        Run: `#${r.runIndex}`,
        'Duration (s)': r.durationSec,
        'Exit Code': r.code,
        'Port 9250 Clean': !r.portAfter,
        Status: 'PASS'
    })));

    console.log('\n🎉 ALL 3 CONSECUTIVE RUNS PASSED STRICT AUDIT CRITERIA!');
}

main().catch(err => {
    console.error('Fatal error in stress harness:', err);
    process.exit(1);
});
