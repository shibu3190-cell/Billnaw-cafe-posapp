const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🕵️ REVIEWER M4 ADVERSARIAL & INVARIANT AUDIT");
console.log("====================================================\n");

let passed = 0;
let failed = 0;

function check(name, fn) {
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
const staffJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
const reportsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'reports.css'), 'utf8');
const responsiveCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'responsive.css'), 'utf8');

// 1. INVARIANT CHECKS
check("Invariant 1: Exact 26 modal close button SVGs in index.html", () => {
    const rawMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>✕<\/button>/g);
    assert.strictEqual(rawMatches, null, "Found un-modernized modal close buttons");
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, "No modal close buttons found");
    assert.strictEqual(svgMatches.length, 26, `Expected 26, got ${svgMatches.length}`);
});

check("Invariant 2: Zero raw Unicode emojis in operational <button> or <tab>", () => {
    // Check buttons in index.html
    const buttonMatches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    
    // Whitelisted non-operational emoji-like entities or exceptions if any
    for (const btn of buttonMatches) {
        // Skip hidden template buttons or comment buttons if any
        if (emojiRegex.test(btn)) {
            // Check if it's in an operational control
            assert.fail(`Found raw Unicode emoji in button: ${btn.slice(0, 80)}...`);
        }
    }
});

check("Invariant 3: Non-breaking currency space formatting (₹ ) preserved", () => {
    assert.ok(html.includes('₹ '), "index.html should have non-breaking rupee notation");
    assert.ok(!html.includes('₹  '), "index.html should not have duplicate spaces after ₹");
});

// 2. ADVERSARIAL STRESS TESTING: remoteLockStaffSession
check("Adversarial: remoteLockStaffSession rejects unauthorized non-admin staff", async () => {
    // Setup isolated fake environment
    const fakeGlobal = {
        currentStaff: { id: 5, name: 'Alice', role: 'Cashier' },
        currentRole: 'staff',
        isMasterTerminal: () => false,
        localStorage: { getItem: () => null, setItem: () => {} },
        showToast: () => {},
        hasPermission: () => false
    };
    fakeGlobal.window = fakeGlobal;
    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    const res = await ctx.remoteLockStaffSession('sess_123');
    assert.ok(res.error, "Should fail authorization");
    assert.strictEqual(res.error.code, 'UNAUTHORIZED');
});

check("Adversarial: remoteLockStaffSession rejects missing sessionId", async () => {
    const fakeGlobal = {
        currentStaff: { id: 1, name: 'Boss', role: 'Admin' },
        currentRole: 'admin',
        isMasterTerminal: () => true,
        localStorage: { getItem: () => 'true', setItem: () => {} },
        showToast: () => {}
    };
    fakeGlobal.window = fakeGlobal;
    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    const res = await ctx.remoteLockStaffSession('');
    assert.ok(res.error);
    assert.strictEqual(res.error.code, 'INVALID_ID');
});

check("Adversarial: remoteLockStaffSession protects Master Terminal from remote lock", async () => {
    const fakeGlobal = {
        currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
        currentRole: 'admin',
        isMasterTerminal: () => true,
        getOrCreateDeviceId: () => 'DEV_MASTER_01',
        localStorage: { getItem: (k) => k === 'billnaw_is_master' ? 'true' : null, setItem: () => {} },
        showToast: () => {},
        activeStaffSessions: [
            { sessionId: 'sess_master_1', staffId: 1, deviceId: 'DEV_MASTER_01', isMaster: true, status: 'ONLINE' },
            { sessionId: 'sess_waiter_2', staffId: 2, deviceId: 'DEV_WAITER_02', isMaster: false, status: 'ONLINE' }
        ]
    };
    fakeGlobal.window = fakeGlobal;
    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    const res = await ctx.remoteLockStaffSession('sess_master_1');
    assert.ok(res.error, "Master terminal should be immune");
    assert.strictEqual(res.error.code, 'IMMUNE_TARGET');
});

check("Adversarial: remoteLockStaffSession is idempotent for already LOCKED or ENDED session", async () => {
    const fakeGlobal = {
        currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
        currentRole: 'admin',
        isMasterTerminal: () => true,
        getOrCreateDeviceId: () => 'DEV_MASTER_01',
        localStorage: { getItem: (k) => k === 'billnaw_is_master' ? 'true' : null, setItem: () => {} },
        showToast: () => {},
        activeStaffSessions: [
            { sessionId: 'sess_ended_3', staffId: 3, deviceId: 'DEV_03', status: 'ENDED', isLocked: true },
            { sessionId: 'sess_locked_4', staffId: 4, deviceId: 'DEV_04', status: 'LOCKED', isLocked: true }
        ]
    };
    fakeGlobal.window = fakeGlobal;
    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    const resEnded = await ctx.remoteLockStaffSession('sess_ended_3');
    assert.strictEqual(resEnded.error, null);
    assert.strictEqual(resEnded.data.status, 'ENDED');

    const resLocked = await ctx.remoteLockStaffSession('sess_locked_4');
    assert.strictEqual(resLocked.error, null);
    assert.strictEqual(resLocked.data.status, 'LOCKED');
});

// 3. ADVERSARIAL STRESS TESTING: lockTerminalByRemote 9-Step Sequence
check("Adversarial: lockTerminalByRemote Master Terminal immunity check", () => {
    let purged = false;
    const fakeGlobal = {
        isMasterTerminal: () => true,
        clearCart: () => { purged = true; },
        localStorage: { getItem: (k) => k === 'billnaw_is_master' ? 'true' : null }
    };
    fakeGlobal.window = fakeGlobal;
    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    ctx.lockTerminalByRemote({ sessionId: 'sess_123' });
    assert.strictEqual(purged, false, "Master terminal must NOT execute lockdown sequence");
});

check("Adversarial: lockTerminalByRemote executes atomic 9-step lockdown on secondary terminal", () => {
    let cartCleared = false;
    let staffPurged = false;
    let pickerRendered = false;
    let pinFocused = false;
    let toastShown = false;
    let eventDispatched = false;

    const mockModal = { id: 'otherModal', style: { display: 'flex' } };
    const mockOverlay = { id: 'loginOverlay', style: { display: 'none', zIndex: '0' } };
    const mockPinInput = { value: '9999', focus: () => { pinFocused = true; } };
    const mockPickerContainer = { innerHTML: '' };

    const fakeGlobal = {
        isMasterTerminal: () => false,
        staffList: [{ id: 1, name: 'Admin', role: 'Admin' }],
        selectedLoginStaffId: 1,
        localStorage: {
            items: {},
            getItem(k) { return this.items[k] || null; },
            setItem(k, v) { this.items[k] = String(v); },
            removeItem(k) {
                if (k === 'billnaw_active_cart') cartCleared = true;
                if (k === 'billnaw_current_session_id') staffPurged = true;
                delete this.items[k];
            }
        },
        document: {
            querySelectorAll(sel) {
                if (sel === '.modal-overlay') return [mockModal, mockOverlay];
                return [];
            },
            getElementById(id) {
                if (id === 'loginOverlay') return mockOverlay;
                if (id === 'staffLoginPinInput') return mockPinInput;
                if (id === 'loginStaffPicker') return mockPickerContainer;
                return null;
            }
        },
        CustomEvent: function(type, opts) { this.type = type; this.detail = opts.detail; },
        setTimeout: (fn) => fn(),
        clearCart: () => { cartCleared = true; },
        renderCart: () => {},
        stopSessionHeartbeat: () => {},
        updateStaffTopbarDisplay: () => {},
        renderLoginStaffPicker: () => { pickerRendered = true; },
        enforcePermissions: () => {},
        showToast: (msg, type) => {
            if (msg.includes('remotely locked') && type === 'warning') toastShown = true;
        }
    };
    fakeGlobal.window = fakeGlobal;
    fakeGlobal.window.dispatchEvent = (e) => {
        if (e.type === 'billnaw:terminal-remotely-locked') eventDispatched = true;
    };

    const vm = require('vm');
    const ctx = vm.createContext(fakeGlobal);
    vm.runInContext(staffJs, ctx);

    ctx.lockTerminalByRemote({ sessionId: 'sess_waiter_99' });

    assert.ok(cartCleared, "Step 1: In-progress cart must be purged");
    assert.ok(staffPurged, "Step 2: Active staff must be purged");
    assert.strictEqual(mockModal.style.display, 'none', "Step 3: Other modals must be dismissed");
    assert.strictEqual(ctx.window.isTerminalLocked, true, "Step 4: Locked flag must be set true");
    assert.strictEqual(mockOverlay.style.display, 'flex', "Step 5: #loginOverlay must be flex");
    assert.strictEqual(mockOverlay.style.zIndex, '1000005', "Step 5: #loginOverlay zIndex 1000005");
    assert.ok(mockPickerContainer.innerHTML.includes('staff-card'), "Step 6: Staff picker rendered");
    assert.strictEqual(mockPinInput.value, '', "Step 7: PIN cleared");
    assert.ok(pinFocused, "Step 7: PIN focused");
    assert.ok(toastShown, "Step 8: Warning toast displayed");
    assert.ok(eventDispatched, "Step 9: Dispatched billnaw:terminal-remotely-locked event");
});

// 4. CSS TOKENS & RESPONSIVE RULES AUDIT
check("CSS Audit: .session-card and presence indicators exist in reports.css", () => {
    assert.ok(reportsCss.includes('.session-card'), "Must style .session-card");
    assert.ok(reportsCss.includes('.presence-dot.online'), "Must style online presence dot");
    assert.ok(reportsCss.includes('.presence-dot.idle'), "Must style idle presence dot");
    assert.ok(reportsCss.includes('.presence-dot.locked'), "Must style locked presence dot");
    assert.ok(reportsCss.includes('@keyframes presence-pulse'), "Must define pulsing animation");
    assert.ok(reportsCss.includes('.session-remote-lock-btn'), "Must style remote lock button");
});

check("CSS Audit: Mobile responsive styles (<= 640px) exist in responsive.css", () => {
    assert.ok(responsiveCss.includes('@media screen and (max-width: 640px)'), "Must have 640px media query");
    assert.ok(responsiveCss.includes('.session-card'), "Must adapt .session-card on mobile");
    assert.ok(responsiveCss.includes('.session-remote-lock-btn'), "Must adapt remote lock button on mobile");
});

console.log("\n====================================================");
console.log(`🎯 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) process.exit(1);
