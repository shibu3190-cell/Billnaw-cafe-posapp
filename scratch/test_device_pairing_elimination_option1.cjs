// scratch/test_device_pairing_elimination_option1.cjs - Verification of Option 1: Auto-Authorize on Store Login + Passive Audit
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("================================================================================");
console.log("📱 OPTION 1 VERIFICATION: AUTO-AUTHORIZE ON STORE LOGIN + PASSIVE AUDIT HUB");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

const rootDir = path.resolve(__dirname, '..');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const shopAuthJs = fs.readFileSync(path.join(rootDir, 'js', 'shop-auth.js'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const rulesRoot = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const rulesDb = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'), 'utf8');

// SECTION 1: SHOP AUTH LOGIN STREAMS DO NOT SET STATUS 'PENDING'
test("OP1-01: OTP login sets secondary device status to 'AUTHORIZED' directly", () => {
    assert.ok(shopAuthJs.includes("localStorage.setItem('billnaw_device_status', 'AUTHORIZED');"), "Must set AUTHORIZED on login");
    // Ensure it does not set PENDING on successful login
    const otpSuccessLoginBlock = shopAuthJs.match(/fetch\('\/api\/auth\/verify-otp'[\s\S]*?updateShopAuthUI/);
    assert.ok(otpSuccessLoginBlock, "OTP login block must exist");
    assert.ok(!otpSuccessLoginBlock[0].includes("localStorage.setItem('billnaw_device_status', 'PENDING')"), "OTP login must NOT set status to PENDING");
});

test("OP1-02: Password login sets secondary device status to 'AUTHORIZED' directly", () => {
    const pwdSuccessLoginBlock = shopAuthJs.match(/fetch\('\/api\/auth\/login'[\s\S]*?updateShopAuthUI/);
    assert.ok(pwdSuccessLoginBlock, "Password login block must exist");
    assert.ok(!pwdSuccessLoginBlock[0].includes("localStorage.setItem('billnaw_device_status', 'PENDING')"), "Password login must NOT set status to PENDING");
});

// SECTION 2: AUTO-AUTHORIZE IN VERIFYDEVICEAUTHORIZATIONONLOGIN & INITDEVICEPAIRINGFLOW
test("OP1-03: verifyDeviceAuthorizationOnLogin auto-authorizes and registers passively without blocking overlay", () => {
    const fnDef = coreJs.match(/async function verifyDeviceAuthorizationOnLogin[\s\S]*?\n\}/);
    assert.ok(fnDef, "verifyDeviceAuthorizationOnLogin must exist");
    const fnText = fnDef[0];
    assert.ok(fnText.includes("localStorage.setItem('billnaw_device_status', 'AUTHORIZED')"), "Must set AUTHORIZED");
    assert.ok(fnText.includes("hideDevicePairingOverlay()"), "Must hide device pairing overlay");
    assert.ok(fnText.includes("registerDeviceToCloud"), "Must passively register device to cloud");
});

test("OP1-04: initDevicePairingFlow auto-authorizes authenticated secondary devices", () => {
    const fnDef = coreJs.match(/function initDevicePairingFlow\(\) \{[\s\S]*?\n\}/);
    assert.ok(fnDef, "initDevicePairingFlow must exist");
    const fnText = fnDef[0];
    assert.ok(fnText.includes("hideDevicePairingOverlay()"), "Must call hideDevicePairingOverlay");
    assert.ok(fnText.includes("registerDeviceToCloud"), "Must call registerDeviceToCloud");
    assert.ok(!fnText.includes("showDevicePairingOverlay()"), "Must NOT invoke showDevicePairingOverlay");
});

test("OP1-05: showDevicePairingOverlay strictly suppresses popup for store-authenticated devices", () => {
    const fnDef = coreJs.match(/function showDevicePairingOverlay\(\) \{[\s\S]*?\n\}/);
    assert.ok(fnDef, "showDevicePairingOverlay must exist");
    const fnText = fnDef[0];
    assert.ok(fnText.includes("if (typeof isStoreAuthenticated === 'function' && isStoreAuthenticated())"), "Must check isStoreAuthenticated");
    assert.ok(fnText.includes("hideDevicePairingOverlay();"), "Must hide overlay when store authenticated");
});

test("OP1-06: checkDeviceAuthorizationStatus auto-authorizes legacy 'PENDING' records passively", () => {
    const fnDef = coreJs.match(/async function checkDeviceAuthorizationStatus[\s\S]*?\n\}/);
    assert.ok(fnDef, "checkDeviceAuthorizationStatus must exist");
    const fnText = fnDef[0];
    assert.ok(fnText.includes("myRecord.status === 'PENDING'"), "Must check for pending record");
    assert.ok(fnText.includes("localStorage.setItem('billnaw_device_status', 'AUTHORIZED')"), "Must auto-upgrade pending record to AUTHORIZED");
    assert.ok(fnText.includes("hideDevicePairingOverlay()"), "Must hide pairing overlay");
});

// SECTION 3: PASSIVE AUDIT REGISTRATION & DEFAULT TERMINAL NAMING
test("OP1-07: registerDeviceToCloud helper registers device to Firestore with default terminal naming", () => {
    assert.ok(coreJs.includes("function registerDeviceToCloud("), "registerDeviceToCloud must exist");
    assert.ok(coreJs.includes("function detectDefaultDeviceName("), "detectDefaultDeviceName must exist");
    assert.ok(coreJs.includes("Counter Terminal") || coreJs.includes("Mobile Terminal"), "Default naming must be provided");
});

// SECTION 4: REMOTE REVOCATION REMAINS FULLY ACTIVE
test("OP1-08: Admin remote revocation locks terminal, purges data & shows #deviceRevokedOverlay", () => {
    const revFn = coreJs.match(/async function handleDeviceRevocation[\s\S]*?\n\}/);
    assert.ok(revFn, "handleDeviceRevocation must exist");
    const revText = revFn[0];
    assert.ok(revText.includes("localStorage.setItem('billnaw_device_status', 'REVOKED')"), "Must set status to REVOKED");
    assert.ok(revText.includes("clearAllTenantLocalData()"), "Must clear tenant local data");
    assert.ok(revText.includes("deviceRevokedOverlay"), "Must display deviceRevokedOverlay");
});

// SECTION 5: REPOSITORY & SECURITY INVARIANTS
test("INV-1: Exactly 26 SVG modal close buttons in index.html", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, "No modal-close-btn found");
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26, got ${svgMatches.length}`);
});

test("INV-2: Zero raw Unicode emojis inside <button> elements in index.html", () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u;
    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    const violatingButtons = [];
    buttonMatches.forEach(btn => {
        if (emojiRegex.test(btn)) violatingButtons.push(btn.slice(0, 80));
    });
    assert.strictEqual(violatingButtons.length, 0, `Found raw emojis in buttons:\n${violatingButtons.join('\n')}`);
});

test("INV-3: 100% binary parity between firestore.rules and database/firestore.rules", () => {
    assert.strictEqual(rulesRoot, rulesDb, "firestore.rules and database/firestore.rules must be bit-for-bit identical");
});

console.log("\n================================================================================");
console.log(`🎯 OPTION 1 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================\n");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
