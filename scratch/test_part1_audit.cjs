const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("📐 PART 1: HIGH-CONVERSION FACTORS BY POS MODULE AUDIT");
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
const staffJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'settings.js'), 'utf8');
const posJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pos.js'), 'utf8');

console.log("📍 FACTOR 1: LOGIN & OTP (REDUCING DECISION FATIGUE)");
test("staff.js pre-selects last active cashier/manager from localStorage", () => {
    assert.ok(staffJs.includes("localStorage.getItem('billnaw_last_staff_id')"), "Missing last staff retrieval in staff.js");
    assert.ok(staffJs.includes("localStorage.setItem('billnaw_last_staff_id'"), "Missing last staff storage on login");
});

test("staff.js auto-focuses #staffLoginPinInput and supports 4-digit auto-submit", () => {
    assert.ok(staffJs.includes("pinInput.focus()"), "Missing pinInput auto-focus");
    assert.ok(html.includes("if(this.value.length === 4) confirmStaffLogin()"), "Missing 4-digit auto-advance submission");
});

test("index.html elevates Quick Staff Login inside .quick-login-card", () => {
    assert.ok(html.includes('class="quick-login-card"'), "Missing .quick-login-card container in index.html");
    assert.ok(html.includes('id="skipLoginBtn"'), "Missing #skipLoginBtn in index.html");
    assert.ok(css.includes('.quick-login-card'), "Missing .quick-login-card in style.css");
});

console.log("\n📍 FACTOR 2: ONBOARDING (THE GOAL GRADIENT EFFECT)");
test("index.html contains #onboardingWizardModal with 20% setup completed progress pill", () => {
    assert.ok(html.includes('id="onboardingWizardModal"'), "Missing #onboardingWizardModal");
    assert.ok(html.includes('20% Setup Completed'), "Missing 20% Setup Completed label");
    assert.ok(html.includes('Step 1: Terminal Connected ✓'), "Missing Step 1 Connected status");
    assert.ok(html.includes('id="onboardStoreName"') && html.includes('id="onboardUpiId"'), "Missing store setup inputs in wizard");
});

test("settings.js defines activateSoftware and saveOnboardingProfile with momentum toast", () => {
    assert.ok(settingsJs.includes('activateSoftware'), "Missing activateSoftware in settings.js");
    assert.ok(settingsJs.includes('saveOnboardingProfile'), "Missing saveOnboardingProfile in settings.js");
    assert.ok(settingsJs.includes('20% Completed'), "Missing 20% Completed toast notification");
});

console.log("\n📍 FACTOR 3: DASHBOARD (VISUAL HIERARCHY & TRUST SIGNALS)");
test("Dashboard has sticky top bar with backdrop blur and verified status badges", () => {
    assert.ok(html.includes('class="dashboard-sticky-bar"'), "Missing .dashboard-sticky-bar in index.html");
    assert.ok(css.includes('.dashboard-sticky-bar') && css.includes('position: sticky') && css.includes('backdrop-filter: blur'), "Missing sticky backdrop blur in style.css");
    assert.ok(html.includes('⚡ Cloud Synced • 99.9% Uptime'), "Missing verified terminal badge in dashboard");
});

console.log("\n📍 FACTOR 4: BILLING (FRAMING & RELATIVE EVALUATION)");
test("pos.js frames GST as relative evaluation (GST & Service: ₹... Just X% of total)", () => {
    assert.ok(posJs.includes('GST & Service: ₹'), "Missing GST & Service relative label in pos.js");
    assert.ok(posJs.includes('Just ') && posJs.includes('of total'), "Missing relative percentage framing in pos.js");
});

test("pos.js frames loyalty loss aversion with Unclaimed Loyalty warning", () => {
    assert.ok(posJs.includes('⚠️ Unclaimed Loyalty: Customer will forfeit'), "Missing Unclaimed Loyalty warning in pos.js");
    assert.ok(posJs.includes('VIP discount'), "Missing VIP discount mention");
    assert.ok(posJs.includes('Diner forfeits'), "Must preserve Diner forfeits for test invariant");
});

console.log("\n📍 FACTOR 5: ORDER MANAGEMENT (PROXIMITY & ACTION)");
test("style.css provides 44px thumb reach tap targets on quantity stepper buttons", () => {
    assert.ok(css.includes('.item-qty-control button::before'), "Missing 44px tap zone pseudo-element in style.css");
    assert.ok(css.includes('min-width: 44px;') && css.includes('min-height: 44px;'), "Missing 44px min tap dimensions");
});

console.log("\n====================================================");
console.log(`🎯 TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("====================================================");

if (failed > 0) process.exit(1);
