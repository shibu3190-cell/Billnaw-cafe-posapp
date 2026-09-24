const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🎯 VERIFICATION: USER REPORTED 4 FIXES AUDIT");
console.log("====================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err.message}`);
        failed++;
    }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const posJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'settings.js'), 'utf8');
const authService = require('../server/auth-service.js');

// 1. Table Number Topbar Visibility
console.log("📍 REQUIREMENT 1: TABLE NUMBER ON TOPBAR VISIBILITY & SYNC");
test("index.html contains #topbarTablePill, #topbarTableDisplay and #topbarTableDot", () => {
    assert.ok(html.includes('id="topbarTablePill"'), "Missing #topbarTablePill");
    assert.ok(html.includes('id="topbarTableDisplay"'), "Missing #topbarTableDisplay");
    assert.ok(html.includes('id="topbarTableDot"'), "Missing #topbarTableDot");
});

test("js/settings.js switchTab always invokes syncTableUI() across all tab switches", () => {
    assert.ok(settingsJs.includes('if (typeof syncTableUI === \'function\') syncTableUI();'), "switchTab must call syncTableUI() unconditionally");
});

test("js/pos.js syncTableUI ensures #topbarTableDisplay is updated and pill is visible", () => {
    assert.ok(posJs.includes("topbarDisplay.innerText = currentTableName;"), "topbarDisplay must receive currentTableName");
    assert.ok(posJs.includes("topbarPill.style.display = 'inline-flex'"), "topbarPill must be set to inline-flex");
    assert.ok(posJs.includes("topbarPill.style.visibility = 'visible'"), "topbarPill must be set to visible");
});

test("style.css prevents .topbar-table-pill from being squished or hidden", () => {
    assert.ok(css.includes('flex-shrink: 0 !important;'), "topbar-table-pill must have flex-shrink: 0");
    assert.ok(css.includes('white-space: nowrap !important;'), "topbar-table-pill must have white-space: nowrap");
});

// 2. Smart Menu Upload Button in POS View
console.log("\n📍 REQUIREMENT 2: SMART MENU UPLOAD BUTTON IN POS VIEW");
test("index.html provides #posSmartMenuUploadBtn and #smartMenuUniversalInput in POS view", () => {
    assert.ok(html.includes('id="posSmartMenuUploadBtn"'), "Missing #posSmartMenuUploadBtn");
    assert.ok(html.includes('id="smartMenuUniversalInput"'), "Missing #smartMenuUniversalInput");
    assert.ok(html.includes('accept="image/*, application/pdf"'), "smartMenuUniversalInput must accept images and PDF");
});

test("js/pos.js defines triggerSmartMenuUpload globally", () => {
    assert.ok(posJs.includes("function triggerSmartMenuUpload()"), "Missing triggerSmartMenuUpload function");
    assert.ok(posJs.includes("window.triggerSmartMenuUpload = triggerSmartMenuUpload;"), "Must export triggerSmartMenuUpload to window");
});

// 3. Settings Logout Cloud Shop Button
console.log("\n📍 REQUIREMENT 3: SETTINGS LOGOUT CLOUD SHOP ACCOUNT BUTTON");
test("index.html contains #settingTileLogoutShop calling logoutShopCloudAccount()", () => {
    assert.ok(html.includes('id="settingTileLogoutShop"'), "Missing #settingTileLogoutShop");
    assert.ok(html.includes('onclick="logoutShopCloudAccount()"'), "Must call logoutShopCloudAccount()");
});

test("index.html script exports logoutShopCloudAccount() and resets to Demo POS", () => {
    assert.ok(html.includes('window.logoutShopCloudAccount = logoutShop;'), "Must export logoutShopCloudAccount");
    assert.ok(html.includes('localStorage.setItem(\'billnaw_auth_mode\', \'demo\');'), "Must set demo mode on logout");
    assert.ok(html.includes('openShopAuthModal();'), "Must reopen shop auth modal on logout for easy re-login");
});

// 4. Shop Profile Creation Requires Email OTP Verification
console.log("\n📍 REQUIREMENT 4: SHOP CREATION REQUIRES EMAIL OTP VERIFICATION");
test("index.html contains #signupOtpSection with 6-digit inputs and resend controls", () => {
    assert.ok(html.includes('id="signupOtpSection"'), "Missing #signupOtpSection");
    assert.ok(html.includes('id="signupOtpBoxesContainer"'), "Missing #signupOtpBoxesContainer");
    assert.ok(html.includes('id="btnSignupResendOtp"'), "Missing #btnSignupResendOtp");
    assert.ok(html.includes('id="btnVerifySignupSubmit"'), "Missing #btnVerifySignupSubmit");
});

test("index.html script implements handleCreateShopAccount, handleResendSignupOtp, and handleVerifyAndCreateAccount", () => {
    assert.ok(html.includes('function handleCreateShopAccount()'), "Missing handleCreateShopAccount");
    assert.ok(html.includes('function handleResendSignupOtp()'), "Missing handleResendSignupOtp");
    assert.ok(html.includes('function handleVerifyAndCreateAccount()'), "Missing handleVerifyAndCreateAccount");
    assert.ok(html.includes('window.handleVerifyAndCreateAccount = handleVerifyAndCreateAccount;'), "Must export handleVerifyAndCreateAccount");
});

test("auth-service registerUser verifies OTP code when provided", () => {
    // 1. Request OTP
    const testEmail = `newshop_${Date.now()}@billnawcafe.com`;
    const sendRes = authService.sendOtp(testEmail, 'signup');
    assert.strictEqual(sendRes.status, 200, "OTP request should succeed");
    const validOtp = sendRes.data.devOtp;

    // 2. Reject registration with wrong OTP
    const badReg = authService.registerUser({
        firstName: "Chef",
        lastName: "Owner",
        shopName: "Sweet Treat Cafe",
        email: testEmail,
        password: "securepassword123",
        confirmPassword: "securepassword123",
        otp: "000000"
    });
    assert.strictEqual(badReg.status, 400, "Registration with wrong OTP must fail");

    // 3. Accept registration with valid OTP
    const goodReg = authService.registerUser({
        firstName: "Chef",
        lastName: "Owner",
        shopName: "Sweet Treat Cafe",
        email: testEmail,
        password: "securepassword123",
        confirmPassword: "securepassword123",
        otp: validOtp
    });
    assert.strictEqual(goodReg.status, 200, "Registration with valid OTP must succeed");
    assert.ok(goodReg.data.token, "Must return session token");
    assert.ok(goodReg.data.storeCode, "Must return storeCode");
});

console.log("\n====================================================");
console.log(`🎯 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) process.exit(1);
