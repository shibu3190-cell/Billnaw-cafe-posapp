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
const menuJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'menu.js'), 'utf8');
const configJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'config.js'), 'utf8');
const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
const authService = require('../server/auth-service.js');

// 1. Table Option Removed From Top Header & POS Section Shows Tables Numberwise
console.log("📍 REQUIREMENT 1: TABLE OPTION REMOVED FROM TOPBAR & NUMBERWISE IN POS");
test("index.html hides #topbarTablePill from header with display: none !important", () => {
    assert.ok(html.includes('id="topbarTablePill"'), "DOM element preserved for backward compatibility");
    assert.ok(html.includes('id="topbarTablePill" class="topbar-table-pill" style="display: none !important;"'), "Must hide topbarTablePill in HTML");
});

test("style.css enforces #topbarTablePill display: none !important", () => {
    assert.ok(css.includes('#topbarTablePill') && css.includes('display: none !important;'), "style.css must hide topbarTablePill");
    assert.ok(css.includes('.table-num-pill'), "style.css must style .table-num-pill");
});

test("index.html renders Tables (Numberwise) and active table badge in POS view", () => {
    assert.ok(html.includes('Tables (Numberwise)'), "POS section must display Tables (Numberwise)");
    assert.ok(html.includes('id="posActiveTableBadge"'), "Must contain #posActiveTableBadge");
    assert.ok(html.includes('id="posActiveTableBadgeWrap"'), "Must contain #posActiveTableBadgeWrap");
});

test("js/pos.js renderTables prepends .table-num-pill number and syncs active badge", () => {
    assert.ok(posJs.includes('<span class="table-num-pill">${i}</span>'), "renderTables must output table number pill");
    assert.ok(posJs.includes("posActiveBadge.innerText = currentTableName;"), "Must sync active table badge in POS");
    assert.ok(posJs.includes("topbarPill.style.display = 'none';"), "syncTableUI keeps topbar pill hidden");
});

// 2. Smart Menu Auto-Detect Exclusively in Menu Section
console.log("\n📍 REQUIREMENT 2: SMART MENU AUTO-DETECT ONLY IN MENU SECTION");
test("Smart menu auto-detect button is removed from POS view", () => {
    const posStart = html.indexOf('id="pos"');
    const posEnd = html.indexOf('id="orders"');
    const posSection = html.substring(posStart, posEnd);
    assert.ok(!posSection.includes('id="posSmartMenuUploadBtn"'), "POS view must not have #posSmartMenuUploadBtn");
});

test("Menu section (#menuManage) provides AI menu uploaders and auto-detect triggers", () => {
    assert.ok(html.includes('id="aiMenuFileInput"'), "Menu section must have #aiMenuFileInput");
    assert.ok(html.includes('id="aiMenuUploader"'), "Menu section must have #aiMenuUploader");
    assert.ok(posJs.includes("function triggerSmartMenuUpload()"), "triggerSmartMenuUpload defined in pos.js");
    assert.ok(posJs.includes("switchTab('menu')"), "triggerSmartMenuUpload navigates to menu section");
});

// 3. Rate Area Enlarged & High Visibility
console.log("\n📍 REQUIREMENT 3: RATE AREA ENLARGEMENT & HIGH VISIBILITY");
test("js/menu.js renders enlarged rate area with >= 140px width and bold currency", () => {
    assert.ok(menuJs.includes('min-width: 140px;'), "Rate area must have min-width: 140px");
    assert.ok(menuJs.includes('height: 38px;'), "Rate input must have height 38px");
    assert.ok(menuJs.includes('font-weight: 800;'), "Rate input must have font-weight: 800");
    assert.ok(menuJs.includes('class="item-meta-rate"'), "Must render .item-meta-rate wrapper");
});

test("style.css allocates 150px in .ai-review-item grid and styles .item-meta-rate", () => {
    assert.ok(css.includes('150px 36px'), "ai-review-item grid must allocate 150px to rate column");
    assert.ok(css.includes('.item-meta-rate'), "Must define .item-meta-rate in CSS");
});

test("index.html enlarged #newItemPrice in Add/Edit modal", () => {
    assert.ok(html.includes('id="newItemPrice"'), "Must contain #newItemPrice");
    assert.ok(html.includes('height: 42px;'), "#newItemPrice must be spacious with 42px height");
});

// 4. Real Email OTP Support & Configuration Guide
console.log("\n📍 REQUIREMENT 4: ACTUAL EMAIL OTP DISPATCH & CONFIGURATION");
test("server/config.js exports email config for SMTP and Resend", () => {
    assert.ok(configJs.includes('SMTP_HOST'), "config.js must support SMTP_HOST");
    assert.ok(configJs.includes('SMTP_PORT'), "config.js must support SMTP_PORT");
    assert.ok(configJs.includes('SMTP_USER'), "config.js must support SMTP_USER");
    assert.ok(configJs.includes('SMTP_PASS'), "config.js must support SMTP_PASS");
    assert.ok(configJs.includes('RESEND_API_KEY'), "config.js must support RESEND_API_KEY");
});

test("server/auth-service.js implements sendActualOtpEmail with nodemailer", () => {
    const authServiceSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'auth-service.js'), 'utf8');
    assert.ok(authServiceSource.includes('sendActualOtpEmail'), "auth-service must implement sendActualOtpEmail");
    assert.ok(authServiceSource.includes('nodemailer'), "auth-service must use nodemailer");
});

test(".env.example provides step-by-step setup instructions for Gmail and Resend", () => {
    assert.ok(envExample.includes('GMAIL SMTP') && envExample.includes('App Password'), "Must include Gmail setup guide");
    assert.ok(envExample.includes('RESEND API'), "Must include Resend setup guide");
    assert.ok(envExample.includes('SMTP_HOST='), "Must provide SMTP variables");
});

// 5. Settings Logout Cloud Shop & Signup OTP Verification
console.log("\n📍 REQUIREMENT 5: SETTINGS LOGOUT & SIGNUP EMAIL OTP VERIFICATION");
test("index.html contains #settingTileLogoutShop calling logoutShopCloudAccount()", () => {
    assert.ok(html.includes('id="settingTileLogoutShop"'), "Missing #settingTileLogoutShop");
    assert.ok(html.includes('onclick="logoutShopCloudAccount()"'), "Must call logoutShopCloudAccount()");
    assert.ok(html.includes('window.logoutShopCloudAccount = logoutShop;'), "Must export logoutShopCloudAccount");
});

test("index.html contains #signupOtpSection with 6-digit inputs and resend controls", () => {
    assert.ok(html.includes('id="signupOtpSection"'), "Missing #signupOtpSection");
    assert.ok(html.includes('id="signupOtpBoxesContainer"'), "Missing #signupOtpBoxesContainer");
    assert.ok(html.includes('id="btnSignupResendOtp"'), "Missing #btnSignupResendOtp");
    assert.ok(html.includes('id="btnVerifySignupSubmit"'), "Missing #btnVerifySignupSubmit");
});

test("auth-service registerUser verifies OTP code when provided", () => {
    const testEmail = `newshop_${Date.now()}@billnawcafe.com`;
    const sendRes = authService.sendOtp(testEmail, 'signup');
    assert.strictEqual(sendRes.status, 200, "OTP request should succeed");
    const validOtp = sendRes.data.devOtp;

    // Reject registration with wrong OTP
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

    // Accept registration with valid OTP
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
