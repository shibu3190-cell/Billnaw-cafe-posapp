// scratch/test_backend_live.cjs - Live backend HTTP endpoints integration test
const { spawn } = require('child_process');
const http = require('http');

console.log('====================================================');
console.log('🌐 TESTING LIVE BACKEND (server.js)');
console.log('====================================================\n');

const PORT = 5055;
const env = { ...process.env, PORT: PORT.toString() };

const serverProcess = spawn('node', ['server.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let serverOutput = '';
serverProcess.stdout.on('data', data => {
    serverOutput += data.toString();
});
serverProcess.stderr.on('data', data => {
    serverOutput += data.toString();
});

function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}${path}`, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
    });
}

function httpPost(path, payload) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const req = http.request(`http://localhost:${PORT}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function runTests() {
    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 2500));

    let passed = 0;
    let failed = 0;

    function assert(cond, desc) {
        if (cond) {
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${desc}`);
            failed++;
        }
    }

    try {
        console.log('📍 1. GET /api/version');
        const vRes = await httpGet('/api/version');
        assert(vRes.status === 200, `Status is 200 (got ${vRes.status})`);
        assert(vRes.data.version === '2.4.0', `Version is 2.4.0 (got ${vRes.data.version})`);
        assert(vRes.data.subscription?.plan === 'billnaw Pro', `Plan is billnaw Pro`);

        console.log('\n📍 2. GET /api/health');
        const hRes = await httpGet('/api/health');
        assert(hRes.status === 200, `Health status 200`);
        assert(hRes.data.status === 'ok', `Health status is ok`);

        console.log('\n📍 3. GET /api/config/client');
        const cRes = await httpGet('/api/config/client');
        assert(cRes.status === 200, `Client config status 200`);
        assert(typeof cRes.data === 'object', `Client config returned valid object`);

        console.log('\n📍 4. POST /api/admin/clear-cache');
        const clearRes = await httpPost('/api/admin/clear-cache', {});
        assert(clearRes.status === 200, `Clear cache status 200`);
        assert(clearRes.data.success === true, `Clear cache success: true`);

        console.log('\n📍 5. GET /api/ai/quota?clientId=BONGBHOJ-TERMINAL');
        const qRes = await httpGet('/api/ai/quota?clientId=BONGBHOJ-TERMINAL');
        assert(qRes.status === 200, `Quota status 200`);
        assert(qRes.data.clientId === 'BONGBHOJ-TERMINAL', `Quota clientId verified`);

        console.log('\n====================================================');
        console.log(`🎯 BACKEND TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
        console.log('====================================================\n');
    } catch (e) {
        console.error('Integration test exception:', e);
        failed++;
    } finally {
        if (failed > 0) {
            console.log('Server process output:', serverOutput);
        }
        serverProcess.kill('SIGTERM');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
