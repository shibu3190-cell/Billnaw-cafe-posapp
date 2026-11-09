// scratch/test_staff_pin_sessions_24h_lifecycle.cjs - Modern Staff PINs, 24h Session, Sessions Cleanup & Terminal Hub
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log("================================================================================");
console.log("🔐 24-HOUR SHIFT SESSION, SALTED PIN SYNC, ACTIVE SESSIONS & TERMINALS TEST");
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

async function testAsync(name, fn) {
    try {
        await fn();
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
const staffJs = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf8');
const cloudSyncJs = fs.readFileSync(path.join(rootDir, 'js', 'cloud-sync.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
const authServiceJs = fs.readFileSync(path.join(rootDir, 'server', 'auth-service.js'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const rulesRoot = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const rulesDb = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'), 'utf8');

(async () => {
    // SECTION 1: 24-HOUR SHIFT SESSION PERSISTENCE (NO REPEATED PIN PROMPT)
    console.log("📍 SECTION 1: 24-HOUR SHIFT SESSION PERSISTENCE & MONITOR");

    test("PIN-24H-01: unlockTerminal stamps billnaw_pin_verified_at and clears terminal lock", () => {
        assert.ok(staffJs.includes("localStorage.setItem('billnaw_pin_verified_at', Date.now().toString())"), "unlockTerminal must stamp billnaw_pin_verified_at");
        assert.ok(staffJs.includes("localStorage.removeItem('billnaw_terminal_locked')"), "unlockTerminal must remove billnaw_terminal_locked");
    });

    test("PIN-24H-02: cloud-sync activateStaffProfileSession stamps billnaw_pin_verified_at", () => {
        assert.ok(cloudSyncJs.includes("localStorage.setItem('billnaw_pin_verified_at', Date.now().toString())"), "activateStaffProfileSession must stamp billnaw_pin_verified_at");
    });

    test("PIN-24H-03: initStaffSystem validates 24-hour shift window (24 * 60 * 60 * 1000)", () => {
        assert.ok(coreJs.includes("is24hShiftValid = Boolean(lastPinVerification && (Date.now() - Number(lastPinVerification)) < (24 * 60 * 60 * 1000))"), "Must validate 24-hour shift validity");
        assert.ok(coreJs.includes("if (isLocked || !is24hShiftValid)"), "Must only lock if explicitly locked or if 24 hours elapsed");
        assert.ok(coreJs.includes("unlockTerminal(currentStaff, false)"), "Must unlock smoothly without toast on reload within 24 hours");
    });

    test("PIN-24H-04: start24hShiftMonitor periodically enforces 24-hour shift boundary in background", () => {
        assert.ok(coreJs.includes("function start24hShiftMonitor"), "start24hShiftMonitor must be defined");
        assert.ok(coreJs.includes("(Date.now() - Number(lastPin)) >= (24 * 60 * 60 * 1000)"), "Must check 24-hour boundary");
    });

    // SECTION 2: BACKEND-SAFE SALTED ADMIN PIN & FORGOT PIN SYNC
    console.log("\n📍 SECTION 2: BACKEND-SAFE SALTED ADMIN & STAFF PIN SYNC");

    test("ADMIN-PIN-01: server auth-service resetAdminPinWithOtp generates CSPRNG salt & canonical salted SHA-256", () => {
        assert.ok(authServiceJs.includes("pinSalt = crypto.randomBytes(16).toString('hex')"), "Must generate 16-byte hex salt");
        assert.ok(authServiceJs.includes("saltedPinHash = crypto.createHash('sha256').update(`${cleanPin}:${pinSalt}:billnaw_pin_v2`).digest('hex')"), "Must compute canonical salted SHA-256");
        assert.ok(authServiceJs.includes("pinSalt: pinSalt"), "Must return pinSalt");
        assert.ok(authServiceJs.includes("pinHash: saltedPinHash"), "Must return salted pinHash");
    });

    await testAsync("ADMIN-PIN-02: Live endpoint POST /api/auth/admin-forgot-pin/reset returns salted hash and salt", async () => {
        // Send OTP first
        const testEmail = `admin_test_${Date.now()}@billnawcafe.com`;
        const sendRes = await fetch('http://localhost:5000/api/auth/admin-forgot-pin/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail })
        });
        const sendData = await sendRes.json();
        assert.strictEqual(sendRes.status, 200, "Send OTP must succeed");

        const otp = sendData.devOtp || '123456';
        const resetRes = await fetch('http://localhost:5000/api/auth/admin-forgot-pin/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                otp: otp,
                newPin: '7890',
                storeCode: 'SHOP-TEST-ADMIN'
            })
        });
        const resetData = await resetRes.json();
        assert.strictEqual(resetRes.status, 200, "Reset PIN must succeed");
        assert.ok(resetData.success, "Reset response must be successful");
        assert.ok(resetData.pinSalt && /^[a-f0-9]{32}$/i.test(resetData.pinSalt), "Must return 32-char hex salt");
        assert.ok(resetData.pinHash && /^[a-f0-9]{64}$/i.test(resetData.pinHash), "Must return 64-char sha256 hash");

        // Verify cryptographic verification matches
        const expectedHash = crypto.createHash('sha256').update(`7890:${resetData.pinSalt}:billnaw_pin_v2`).digest('hex');
        assert.strictEqual(resetData.pinHash, expectedHash, "Hash must match canonical salted formula");
    });

    test("ADMIN-PIN-03: client submitAdminForgotPinReset handles salted hash and syncs to Firestore", () => {
        assert.ok(staffJs.includes("submitAdminForgotPinReset"), "submitAdminForgotPinReset must exist");
        assert.ok(staffJs.includes(".pin_salt = salt"), "Must save pin_salt on targetStaff/adminStaff");
        assert.ok(staffJs.includes(".pin_hash = saltedHash"), "Must save pin_hash on targetStaff/adminStaff");
        assert.ok(staffJs.includes("persistStaffToFirestore(targetStaff)") || staffJs.includes("persistStaffToFirestore(adminStaff)"), "Must sync staff to Firestore");
    });

    // SECTION 3: ACTIVE SESSIONS CLEANUP & INACTIVITY TELEMETRY
    console.log("\n📍 SECTION 3: ACTIVE SESSIONS REVOCATION PURGE & INACTIVITY TELEMETRY");

    test("SESS-01: renderLiveSessionCards filters out REVOKED, DELETED, ENDED, and deleted staff sessions", () => {
        assert.ok(staffJs.includes("s.status === 'REVOKED' || s.status === 'DELETED' || s.status === 'ENDED'"), "Must filter revoked, deleted, and ended sessions");
        assert.ok(staffJs.includes("!existingStaffIds.has(String(s.staffId))"), "Must filter out sessions for staff deleted by admin");
    });

    test("SESS-02: renderLiveSessionCards formats real-time telemetry ('Active now', 'Inactive for Xm', 'Inactive for Xh')", () => {
        assert.ok(staffJs.includes("activityStr = 'Active now'"), "Must format online as Active now");
        assert.ok(staffJs.includes("Inactive for ${Math.max(1, diffMinutes)}m"), "Must format minutes of inactivity");
        assert.ok(staffJs.includes("Inactive for ${hours}h"), "Must format hours of inactivity");
    });

    test("SESS-03: deleteStaffMember purges session from activeStaffSessions and re-renders cards immediately", () => {
        assert.ok(staffJs.includes("window.activeStaffSessions = window.activeStaffSessions.filter(s => String(s.staffId) !== String(id) && s.status !== 'REVOKED')"), "Must purge session immediately on staff delete");
        assert.ok(staffJs.includes("renderLiveSessionCards()"), "Must re-render live session cards");
    });

    // SECTION 4: AUTHORIZED TERMINALS HUB MODERNIZATION
    console.log("\n📍 SECTION 4: AUTHORIZED TERMINALS HUB MODERNIZATION");

    test("TERM-01: renderAuthorizedDevicesHub cross-references active sessions to display logged-in staff", () => {
        assert.ok(settingsJs.includes("activeSessionForDev = sessions.find"), "Must cross-reference device with active staff session");
        assert.ok(settingsJs.includes("Staff: ${activeSessionForDev.staffName}"), "Must display currently logged-in staff member");
    });

    test("TERM-02: renderAuthorizedDevicesHub formats live device telemetry (Active now / Inactive for Xm/h / Revoked)", () => {
        assert.ok(settingsJs.includes("telemetryText = '🟢 Active now'"), "Must format online devices as 🟢 Active now");
        assert.ok(settingsJs.includes("telemetryText = diffM < 60 ? `⚪ Inactive for ${Math.max(1, diffM)}m`"), "Must format inactive minutes");
        assert.ok(settingsJs.includes("telemetryText = `Revoked"), "Must format revoked status");
    });

    // SECTION 5: INVARIANTS & INTEGRITY
    console.log("\n📍 SECTION 5: CRITICAL REPOSITORY INVARIANTS");

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
    console.log(`🎯 TOTAL AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
})();
