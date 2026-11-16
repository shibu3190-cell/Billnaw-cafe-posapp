// ============================================================
// 🔔 VERIFICATION TEST: BILLING READY SOUND & BACK NAVIGATION
// Tests:
// 1. Floor Server Ready for Billing & Multi-Device Audio Alert
// 2. Comprehensive Navigation History & Back Button Interceptor
// 3. Strict Invariant Verification
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🔔 BILLING READY ALERT & BACK NAVIGATION TEST SUITE');
console.log('====================================================\n');

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
        process.exitCode = 1;
    }
}

const rootDir = path.resolve(__dirname, '..');
const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

// ------------------------------------------------------------
// PART 1: FLOOR SERVER READY FOR BILLING & AUDIO ALERT
// ------------------------------------------------------------
console.log('📍 PART 1: FLOOR SERVER READY FOR BILLING & AUDIO ALERT');

test('js/core.js defines playAlertSound with Web Audio API chime synthesis', () => {
    assert.ok(coreJs.includes('function playAlertSound('), 'Missing playAlertSound function');
    assert.ok(coreJs.includes('window.playAlertSound = playAlertSound'), 'playAlertSound must be exposed on window');
    assert.ok(coreJs.includes('AudioContext') || coreJs.includes('webkitAudioContext'), 'Must use Web Audio API');
    assert.ok(coreJs.includes('billnaw_billing_alert_muted'), 'Must honor billing alert muted preference');
});

test('js/core.js defines triggerBillingReadyAlert with deduplication and notification', () => {
    assert.ok(coreJs.includes('function triggerBillingReadyAlert('), 'Missing triggerBillingReadyAlert function');
    assert.ok(coreJs.includes('window.triggerBillingReadyAlert = triggerBillingReadyAlert'), 'Must expose triggerBillingReadyAlert');
    assert.ok(coreJs.includes('_recentBillingAlerts'), 'Must maintain deduplication cache');
});

test('js/core.js posMeshChannel triggers billing ready alert for Admin/Cashier/Manager', () => {
    assert.ok(coreJs.includes("data.type === 'READY_FOR_BILLING'"), 'posMeshChannel must handle READY_FOR_BILLING');
    assert.ok(coreJs.includes('triggerBillingReadyAlert(data.tableNumber'), 'Must invoke triggerBillingReadyAlert on mesh event');
});

test('js/core.js handleRemoteFirestoreUpdate detects remote ready_for_billing transition and fires alert', () => {
    assert.ok(coreJs.includes("newStatus === 'ready_for_billing' && prevStatus !== 'ready_for_billing'"), 'Must detect table transition to ready_for_billing');
    assert.ok(coreJs.includes('triggerBillingReadyAlert(t.tableId'), 'Must trigger alert for newly ready tables on Firestore snapshot');
});

test('js/core.js handleReadyForBilling marks table, persists, and broadcasts to mesh + Firestore', () => {
    assert.ok(coreJs.includes("status = 'ready_for_billing'"), 'Must set status to ready_for_billing');
    assert.ok(coreJs.includes('readyForBillingTime'), 'Must record readyForBillingTime');
    assert.ok(coreJs.includes('readyForBillingBy'), 'Must record readyForBillingBy');
    assert.ok(coreJs.includes('broadcastMeshEvent'), 'Must broadcast event over mesh');
    assert.ok(coreJs.includes('dispatchBackendStoreSync') || coreJs.includes('persistAllToFirestore'), 'Must sync tables to Firestore');
    assert.ok(coreJs.includes('window.handleReadyForBilling = handleReadyForBilling'), 'Must expose handleReadyForBilling on window');
});

// ------------------------------------------------------------
// PART 2: COMPREHENSIVE BACK-BUTTON & NAVIGATION STACK
// ------------------------------------------------------------
console.log('\n📍 PART 2: COMPREHENSIVE BACK-BUTTON & NAVIGATION STACK');

test('js/core.js defines handleAppBackNavigation and initBackNavigationHandling', () => {
    assert.ok(coreJs.includes('function handleAppBackNavigation('), 'Missing handleAppBackNavigation');
    assert.ok(coreJs.includes('function initBackNavigationHandling('), 'Missing initBackNavigationHandling');
    assert.ok(coreJs.includes('window.handleAppBackNavigation = handleAppBackNavigation'), 'Must export handleAppBackNavigation');
    assert.ok(coreJs.includes('window.initBackNavigationHandling = initBackNavigationHandling'), 'Must export initBackNavigationHandling');
});

test('handleAppBackNavigation Layer 1: checks and dismisses top modal without exiting app', () => {
    assert.ok(coreJs.includes('dismissTopModal()'), 'Layer 1 must invoke dismissTopModal()');
    assert.ok(coreJs.includes('ensureHistoryGuardState()'), 'Must re-push guard state to protect against exit');
});

test('handleAppBackNavigation Layer 2: collapses mobile cart drawer if open', () => {
    assert.ok(coreJs.includes('cartDrawer'), 'Layer 2 must check cartDrawer');
    assert.ok(coreJs.includes("cartDrawer.classList.contains('open')"), 'Must check open drawer class');
    assert.ok(coreJs.includes('toggleCartDrawer') || coreJs.includes("cartDrawer.classList.remove('open')"), 'Must close cart drawer');
});

test('handleAppBackNavigation Layer 3: routes back to previous view when on secondary tab', () => {
    assert.ok(coreJs.includes("currentTab !== 'pos'"), 'Layer 3 must check if on secondary view');
    assert.ok(coreJs.includes('_appNavHistory'), 'Must use navigation history stack');
    assert.ok(coreJs.includes('switchTabDirect'), 'Must navigate back using switchTabDirect');
});

test('handleAppBackNavigation Layer 4: double-tap back protection on root POS view (2-second window)', () => {
    assert.ok(coreJs.includes('Press back again to exit Billnaw POS'), 'Must display double-back exit toast');
    assert.ok(coreJs.includes('2000'), 'Must enforce 2000ms window');
});

test('js/settings.js switchTabDirect tracks view history if not navigating back', () => {
    assert.ok(settingsJs.includes('_appNavHistory'), 'switchTabDirect must track _appNavHistory');
    assert.ok(settingsJs.includes('_isNavigatingBack'), 'switchTabDirect must guard against re-pushing when popping');
});

test('app.js dismissTopModal handles action sheets, drawers, and custom close buttons', () => {
    assert.ok(appJs.includes('dismissTopModal'), 'app.js must define dismissTopModal');
    assert.ok(appJs.includes('closeMoreHub'), 'Must support closing moreHubModal');
    assert.ok(appJs.includes('close-drawer-btn') || appJs.includes('tbl-close-btn'), 'Must check specialized close buttons');
    assert.ok(appJs.includes('initBackNavigationHandling'), 'initApp must call initBackNavigationHandling');
});

// ------------------------------------------------------------
// PART 3: INVARIANTS CHECK
// ------------------------------------------------------------
console.log('\n📍 PART 3: REPO INVARIANTS CHECK');

test('Exact count of 26 modal-close-btn SVG elements in index.html', () => {
    const matches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
    assert.strictEqual(matches.length, 26, `Strict invariant: expected exactly 26 modal close buttons, found ${matches.length}`);
});

test('Zero raw unicode emojis inside <button> elements in index.html', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/u;
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
    let match;
    let violations = 0;
    while ((match = buttonRegex.exec(indexHtml)) !== null) {
        if (emojiRegex.test(match[1])) {
            violations++;
        }
    }
    assert.strictEqual(violations, 0, `Expected zero raw emojis in button tags, found ${violations}`);
});

test('100% bit-for-bit binary parity between firestore.rules and database/firestore.rules', () => {
    const r1 = fs.readFileSync(path.join(rootDir, 'firestore.rules'));
    const r2 = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'));
    assert.ok(r1.equals(r2), 'Rules must match byte-for-byte');
});

console.log('\n====================================================');
console.log(`🎯 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
    process.exit(1);
}
