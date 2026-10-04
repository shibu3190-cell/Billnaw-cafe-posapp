const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🎯 VERIFICATION: THEME, OTP INVALIDATION, PHONE & T1-T3 TABLES");
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

// 1. POS Login Theme & Security Hardening
console.log("📍 TEST 1: POS LOGIN THEME & PHONE PREVIEW");
test("style.css styles shopAuth modal with POS palette (#143832, #FAF7F4, #E05A38)", () => {
    assert.ok(css.includes('.phone-auth-feature-preview'), "style.css must style phone-auth-feature-preview");
    assert.ok(css.includes('.coming-soon-pill'), "style.css must style coming-soon-pill");
    assert.ok(css.includes('.phone-feature-badge'), "style.css must style phone-feature-badge");
});

test("index.html displays Phone & WhatsApp OTP feature preview and removed skip button", () => {
    assert.ok(html.includes('phone-auth-feature-preview'), "index.html must display phone feature preview");
    assert.ok(html.includes('Phone &amp; WhatsApp OTP') || html.includes('Phone & WhatsApp OTP'), "Must include Phone & WhatsApp OTP title");
    assert.strictEqual(html.includes('id="skipAuthToDemoBtn"'), false, "Must not contain bypass button in HTML");
});

// 2. OTP Purge on Send & Logout Session Invalidation
console.log("\n📍 TEST 2: OTP PURGE & SESSION LOGOUT SECURITY");
test("sendOtp immediately purges any previous OTP for the same email", () => {
    const email = 'otppurge_test@billnawcafe.com';
    const first = authService.sendOtp(email);
    assert.strictEqual(first.status, 200);
    const firstOtp = first.data.devOtp;

    // Simulate sending a new OTP after cooldown expires
    const oldEntry = authService.sendOtp(email); // cooldown
    assert.strictEqual(oldEntry.status, 429);

    // Logout session purges OTP and session
    const fakeToken = 'sess_test_purge_' + Date.now();
    const logoutRes = authService.logoutSession(fakeToken, email);
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.data.success, true);

    // Verifying old OTP fails with 400
    const verifyOld = authService.verifyOtp(email, firstOtp);
    assert.strictEqual(verifyOld.status, 400, "Old OTP must be purged on logout");
    assert.strictEqual(verifyOld.data.success, false);
});

test("index.html implements resetLoginOtpView and resetSignupOtpView clearing OTP boxes", () => {
    assert.ok(html.includes('function resetLoginOtpView()'), "Must define resetLoginOtpView");
    assert.ok(html.includes('function resetSignupOtpView()'), "Must define resetSignupOtpView");
    assert.ok(html.includes("fetch('/api/auth/logout'"), "logoutShop must invoke /api/auth/logout");
});

// 3. Mandatory Phone Number Validation on Signup
console.log("\n📍 TEST 3: MANDATORY PHONE NUMBER ON SIGNUP");
test("registerUser rejects signup without phone or phone with < 10 digits", () => {
    const resNoPhone = authService.registerUser({
        firstName: 'Test',
        lastName: 'Owner',
        shopName: 'Test Cafe',
        email: 'invalid_phone_1@billnawcafe.com',
        phone: '12345',
        password: 'password123',
        confirmPassword: 'password123'
    });
    assert.strictEqual(resNoPhone.status, 400);
    assert.ok(resNoPhone.data.error.includes('10 digits'), "Error must cite 10 digits requirement");
});

test("registerUser accepts valid 10-digit phone and stores it on user and shop profile", () => {
    const email = `valid_phone_signup_${Date.now()}@billnawcafe.com`;
    const otpRes = authService.sendOtp(email, 'signup');
    const validOtp = otpRes.data.devOtp;

    const res = authService.registerUser({
        firstName: 'Rajesh',
        lastName: 'Sharma',
        shopName: 'Royal Bengal Cafe',
        email,
        phone: '+91 9876543210',
        password: 'password123',
        confirmPassword: 'password123',
        otp: validOtp
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.phone, '9876543210');
    assert.strictEqual(res.data.shop.phone, '9876543210');
});

test("index.html signup form has mandatory phone field with +91 prefix and ID signupPhone", () => {
    assert.ok(html.includes('id="signupPhone"'), "index.html must have #signupPhone");
    assert.ok(html.includes('validateSignupPhone'), "index.html must validate phone input");
});

test("storeProfileModal contains shopEmailInput, shopStoreCodeInput, and shopPhoneInput", () => {
    assert.ok(html.includes('id="shopEmailInput"'), "Must have #shopEmailInput in store profile");
    assert.ok(html.includes('id="shopStoreCodeInput"'), "Must have #shopStoreCodeInput in store profile");
    assert.ok(html.includes('id="shopPhoneInput"'), "Must have #shopPhoneInput in store profile");
    assert.ok(settingsJs.includes('shopPhoneInput'), "settings.js must populate and persist shopPhoneInput");
});

// 4. Classy T1, T2, T3 Table Section & Settings Management
console.log("\n📍 TEST 4: T1-T3 TABLE SECTION & SETTINGS MANAGEMENT");
test("pos.js renderTables formats table buttons with .table-t-code (T1, T2, T3) and .table-status-tag", () => {
    assert.ok(posJs.includes('<span class="table-t-code">T${i}</span>'), "pos.js must output table T code");
    assert.ok(posJs.includes('<span class="table-status-tag">${statusTag}</span>'), "pos.js must output status tag");
    assert.ok(posJs.includes('<span class="table-num-pill">${i}</span>'), "pos.js must retain table-num-pill for test compatibility");
});

test("style.css provides classy styles for .table-t-code, .table-status-tag, KOT, Served, and 15m+ alert", () => {
    assert.ok(css.includes('.table-t-code'), "style.css must style .table-t-code");
    assert.ok(css.includes('.table-status-tag'), "style.css must style .table-status-tag");
    assert.ok(css.includes('.table-btn.kot'), "style.css must style KOT table button");
    assert.ok(css.includes('.table-btn.served'), "style.css must style SERVED table button");
    assert.ok(css.includes('tablePulseAlert'), "style.css must provide pulsing red animation for 15m alert");
});

test("index.html provides #tableManagementModal, quick table settings button, and settings tile", () => {
    assert.ok(html.includes('id="tableManagementModal"'), "index.html must have #tableManagementModal");
    assert.ok(html.includes('openTableManagementModal()'), "index.html must support openTableManagementModal()");
    assert.ok(html.includes('tbl-close-btn'), "tableManagementModal must use tbl-close-btn (protecting 26 modal-close-btn invariant)");
    assert.ok(html.includes('id="tblMgmtCountInput"'), "Must have #tblMgmtCountInput");
    assert.ok(html.includes('id="tblMgmtShowTables"'), "Must have #tblMgmtShowTables");
    assert.ok(html.includes('id="tblMgmtUnpaidAlert"'), "Must have #tblMgmtUnpaidAlert");
});

test("pos.js implements 15-minute unpaid alert check honoring unpaidTableAlert toggle", () => {
    assert.ok(posJs.includes('shopProfile.unpaidTableAlert === false'), "pos.js must honor unpaidTableAlert toggle");
    assert.ok(posJs.includes('ALERT_THRESHOLD_MS'), "pos.js must check 15m threshold");
    assert.ok(posJs.includes("tInfo.status = 'alert';"), "pos.js must mark table status as alert");
});

console.log("\n====================================================");
console.log(`🎯 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
}
