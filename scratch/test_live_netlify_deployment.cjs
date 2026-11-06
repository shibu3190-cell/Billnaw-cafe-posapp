// scratch/test_live_netlify_deployment.cjs
// Automated live production verification for https://billnawcafepos.netlify.app

const https = require('https');

const BASE_URL = 'https://billnawcafepos.netlify.app';

function fetchUrl(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 15000
        };

        const req = https.request(url, reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch(e) {}
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    json: parsed
                });
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${path}`));
        });

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

async function runLiveAudit() {
    console.log(`\n🌐 [NETLIFY PRODUCTION AUDIT] Testing live deployment: ${BASE_URL}\n`);
    let passCount = 0;
    let failCount = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passCount++;
        } else {
            console.error(`  ❌ FAIL: ${name} - ${details}`);
            failCount++;
        }
    }

    try {
        // 1. Root / index.html test
        console.log('--- 1. Web App Shell & Assets ---');
        const rootRes = await fetchUrl('/');
        assert('Root URL returns HTTP 200', rootRes.status === 200, `Status: ${rootRes.status}`);
        assert('HTML contains Billnaw POS title', rootRes.body.includes('Billnaw') || rootRes.body.includes('POS'), 'Missing title');
        assert('Security header X-Frame-Options is DENY', rootRes.headers['x-frame-options'] === 'DENY', `Header: ${rootRes.headers['x-frame-options']}`);
        assert('HTML contains modal close buttons invariant', rootRes.body.includes('modal-close-btn'), 'Missing modal close buttons');

        // 2. Bundled CSS test
        console.log('\n--- 2. Modular CSS Bundle ---');
        const cssRes = await fetchUrl('/style.css');
        assert('style.css returns HTTP 200', cssRes.status === 200, `Status: ${cssRes.status}`);
        assert('style.css contains compiled design tokens', cssRes.body.includes('--primary') || cssRes.body.includes(':root'), 'Missing CSS tokens');

        // 3. Service Worker zero-cache header test
        console.log('\n--- 3. PWA & Service Worker Headers ---');
        const swRes = await fetchUrl('/sw.js');
        assert('sw.js returns HTTP 200', swRes.status === 200, `Status: ${swRes.status}`);
        assert('sw.js has no-cache headers', (swRes.headers['cache-control'] || '').includes('no-cache'), `Cache-Control: ${swRes.headers['cache-control']}`);

        // 4. Serverless API Health
        console.log('\n--- 4. Serverless API Function Health ---');
        const healthRes = await fetchUrl('/api/health');
        assert('GET /api/health returns HTTP 200', healthRes.status === 200, `Status: ${healthRes.status}`);
        assert('Health JSON indicates ok / running', healthRes.json && (healthRes.json.status === 'ok' || healthRes.json.status === 'healthy'), `JSON: ${JSON.stringify(healthRes.json)}`);

        // 5. Serverless API Version & Runtime
        console.log('\n--- 5. Serverless API Version ---');
        const verRes = await fetchUrl('/api/version');
        assert('GET /api/version returns HTTP 200', verRes.status === 200, `Status: ${verRes.status}`);
        assert('Version response indicates netlify-serverless runtime', verRes.json && verRes.json.runtime === 'netlify-serverless', `Runtime: ${verRes.json?.runtime}`);

        // 6. Gemini AI Status
        console.log('\n--- 6. Gemini AI Status ---');
        const geminiRes = await fetchUrl('/api/gemini/status');
        assert('GET /api/gemini/status returns HTTP 200', geminiRes.status === 200, `Status: ${geminiRes.status}`);
        assert('Gemini reports operational model', geminiRes.json && geminiRes.json.model, `JSON: ${JSON.stringify(geminiRes.json)}`);

        // 7. Client Config
        console.log('\n--- 7. Client Multi-tenant Config ---');
        const configRes = await fetchUrl('/api/config/client');
        assert('GET /api/config/client returns HTTP 200', configRes.status === 200, `Status: ${configRes.status}`);
        assert('Config returns projectId', configRes.json && configRes.json.projectId === 'abhi-pro-cafe-pos', `ProjectId: ${configRes.json?.projectId}`);

        // 8. Device Recognition API
        console.log('\n--- 8. Device Hardware Validation API ---');
        const devValRes = await fetchUrl('/api/auth/validate-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { deviceId: 'DEV_HW_AUDIT_TEST_101', storeCode: 'DEMO' }
        });
        assert('POST /api/auth/validate-device returns HTTP 200', devValRes.status === 200, `Status: ${devValRes.status}`);
        assert('Device validated successfully', devValRes.json && devValRes.json.success === true, `JSON: ${JSON.stringify(devValRes.json)}`);

        // 9. Inventory Transfers API
        console.log('\n--- 9. Inventory Transfers API ---');
        const trfRes = await fetchUrl('/api/inventory/transfers');
        assert('GET /api/inventory/transfers returns HTTP 200', trfRes.status === 200, `Status: ${trfRes.status}`);
        assert('Transfers returns array', trfRes.json && Array.isArray(trfRes.json.transfers), `JSON: ${JSON.stringify(trfRes.json)}`);

        console.log(`\n====================================================`);
        console.log(`🎯 LIVE AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
        console.log(`====================================================\n`);

        process.exit(failCount > 0 ? 1 : 0);
    } catch (err) {
        console.error('Fatal live audit error:', err);
        process.exit(1);
    }
}

runLiveAudit();
