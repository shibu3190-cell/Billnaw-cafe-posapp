// scratch/test_endpoints_port3000.cjs
const http = require('http');

console.log('====================================================');
console.log('🌐 TESTING LIVE BACKEND ENDPOINTS ON PORT 3000');
console.log('====================================================\n');

const PORT = 3000;

function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${PORT}${path}`, res => {
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
        const req = http.request(`http://127.0.0.1:${PORT}${path}`, {
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
        assert(vRes.data.subscription?.features?.length > 0, `Feature bundle verified (${vRes.data.subscription?.features?.length} features)`);

        console.log('\n📍 2. GET /api/health');
        const hRes = await httpGet('/api/health');
        assert(hRes.status === 200, `Health status 200`);
        assert(hRes.data.status === 'ok', `Health status is ok`);
        assert(hRes.data.firestoreDb.length > 0, `Firestore DB linked: ${hRes.data.firestoreDb}`);

        console.log('\n📍 3. GET /api/config/client');
        const cRes = await httpGet('/api/config/client');
        assert(cRes.status === 200, `Client config status 200`);
        assert(typeof cRes.data === 'object', `Client config returned object`);

        console.log('\n📍 4. POST /api/admin/clear-cache');
        const clearRes = await httpPost('/api/admin/clear-cache', {});
        assert(clearRes.status === 200, `Clear cache status 200`);
        assert(clearRes.data.success === true, `Clear cache success: true`);

        console.log('\n📍 5. GET /api/ai/quota?clientId=BONGBHOJ-TERMINAL');
        const qRes = await httpGet('/api/ai/quota?clientId=BONGBHOJ-TERMINAL');
        assert(qRes.status === 200, `Quota status 200`);
        assert(qRes.data.clientId === 'BONGBHOJ-TERMINAL', `Quota clientId verified`);

        console.log('\n📍 6. GET / (Static Client Serving)');
        const rootRes = await httpGet('/');
        assert(rootRes.status === 200, `Root index.html served with HTTP 200`);
        assert(typeof rootRes.data === 'string' && rootRes.data.includes('billnaw'), `Index.html contains billnaw branding`);

        console.log('\n====================================================');
        console.log(`🎯 BACKEND LIVE TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
        console.log('====================================================\n');
    } catch (e) {
        console.error('Integration test exception:', e);
        failed++;
    } finally {
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
