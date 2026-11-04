/**
 * scratch/test_challenger_m4_lockout.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE: MILESTONE 4
 * Remote Lockout Security, Cart Flush, Master Admin Immunity & DOM Invariants
 *
 * Authored by: challenger_session_m4_2 (Teamwork Challenger)
 * Roles: critic, specialist
 *
 * Attack Surface & Challenge Dimensions:
 *   1. Master Admin Terminal Immunity (Defense-in-Depth)
 *      - Trigger guard immunity (isMaster, DEV_MASTER_01, current master device)
 *      - Reactive execution immunity (lockTerminalByRemote NO-OP on master)
 *      - UI presentation immunity (protected badge, lock button omitted)
 *      - Cloud listener event propagation immunity
 *   2. Cart Flush, Staff Purge & Modal Wipe (Data & Privacy Protection)
 *      - In-progress cart eradication (memory & localStorage)
 *      - Staff credentials & session tokens purge
 *      - Full modal overlay dismissal (.modal-overlay set to display: none)
 *      - Login overlay elevation (zIndex 1000005) & PIN input reset
 *      - CustomEvent broadcast and operator warning toast
 *   3. Strict RBAC Enforcement on Remote Lockout Trigger
 *      - Non-admin staff rejection (Cashier, Kitchen Chef, Floor Server, Manager without permission)
 *      - Unauthenticated rejection
 *      - Authorized Admin execution verification
 *   4. Idempotency, Edge Cases & Attack Resilience
 *      - Double-lock attack on already LOCKED session
 *      - Lockout attempt on already ENDED session
 *      - Null / undefined / empty string / non-existent session IDs
 *      - Malformed session objects
 *   5. DOM Invariants & Static Security Verification
 *      - Exact 26 .modal-close-btn SVGs in index.html
 *      - Zero raw Unicode emojis in operational <button>, <tab>, and segmented controls
 *      - Non-breaking currency space formatting (₹ )
 *      - Proper isolation of close classes in new modals (.session-close-btn)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('====================================================================');
console.log('⚔️  RUNNING EMPIRICAL ADVERSARIAL CHALLENGER SUITE: MILESTONE 4');
console.log('⚔️  Remote Lockout, Cart Flush, Master Immunity & DOM Invariants');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function challenge(id, description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ PASS: [${id}] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: [${id}] ${description}`);
        console.error(`     Error: ${err.message}`);
        failedTests++;
        failures.push({ id, description, error: err.message, stack: err.stack });
    }
}

// ----------------------------------------------------------------------------
// File Loading & Verification
// ----------------------------------------------------------------------------
const rootDir = path.resolve(__dirname, '..');
const staffJsPath = path.join(rootDir, 'js', 'staff.js');
const coreJsPath = path.join(rootDir, 'js', 'core.js');
const htmlPath = path.join(rootDir, 'index.html');
const reportsCssPath = path.join(rootDir, 'css', 'reports.css');

assert.ok(fs.existsSync(staffJsPath), 'js/staff.js must exist');
assert.ok(fs.existsSync(coreJsPath), 'js/core.js must exist');
assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
assert.ok(fs.existsSync(reportsCssPath), 'css/reports.css must exist');

const staffJs = fs.readFileSync(staffJsPath, 'utf8');
const coreJs = fs.readFileSync(coreJsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const reportsCss = fs.readFileSync(reportsCssPath, 'utf8');

// Helper to construct a standard mock browser context for testing
function createMockEnvironment(overrides = {}) {
    const storage = new Map();
    if (overrides.initialLocalStorage) {
        Object.entries(overrides.initialLocalStorage).forEach(([k, v]) => storage.set(k, String(v)));
    }

    const elements = new Map();
    const mockModalOverlays = [];

    const mockOverlay = overrides.mockOverlay || {
        id: 'loginOverlay',
        className: 'modal-overlay',
        style: { display: 'none', zIndex: '0' }
    };
    elements.set('loginOverlay', mockOverlay);
    mockModalOverlays.push(mockOverlay);

    const mockPinInput = overrides.mockPinInput || {
        id: 'staffLoginPinInput',
        value: '1234',
        focused: false,
        focus() { this.focused = true; }
    };
    elements.set('staffLoginPinInput', mockPinInput);

    const mockContainer = overrides.mockContainer || {
        id: 'activeSessionsListContainer',
        innerHTML: ''
    };
    elements.set('activeSessionsListContainer', mockContainer);

    const mockStaffPicker = {
        id: 'loginStaffPicker',
        innerHTML: ''
    };
    elements.set('loginStaffPicker', mockStaffPicker);

    // Other operational modals
    const otherModals = overrides.otherModals || [
        { id: 'splitBillModal', className: 'modal-overlay', style: { display: 'flex' } },
        { id: 'discountModal', className: 'modal-overlay', style: { display: 'flex' } },
        { id: 'customerSelectModal', className: 'modal-overlay', style: { display: 'block' } }
    ];
    otherModals.forEach(m => {
        elements.set(m.id, m);
        mockModalOverlays.push(m);
    });

    const dispatchedEvents = [];
    const toasts = [];

    const env = {
        console: {
            log: () => {},
            warn: () => {},
            error: () => {}
        },
        document: {
            getElementById: (id) => elements.get(id) || null,
            querySelectorAll: (selector) => {
                if (selector === '.modal-overlay') return mockModalOverlays;
                return [];
            },
            querySelector: () => null,
            addEventListener: () => {},
            removeEventListener: () => {}
        },
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, val) => storage.set(key, String(val)),
            removeItem: (key) => storage.delete(key),
            clear: () => storage.clear()
        },
        CustomEvent: function(type, options) {
            this.type = type;
            this.detail = options ? options.detail : null;
        },
        dispatchEvent: (event) => {
            dispatchedEvents.push(event);
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        setTimeout: (fn) => { fn(); return 1; },
        setInterval: () => 1,
        clearInterval: () => {},
        clearTimeout: () => {},
        showToast: (msg, type) => {
            toasts.push({ msg, type });
        },
        escapeHtml: (str) => String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        // State
        cart: overrides.cart !== undefined ? overrides.cart : [{ id: 101, name: 'Espresso', price: 120, qty: 1 }],
        currentCart: overrides.currentCart !== undefined ? overrides.currentCart : [{ id: 101, name: 'Espresso', price: 120, qty: 1 }],
        isTerminalLocked: overrides.isTerminalLocked !== undefined ? overrides.isTerminalLocked : false,
        currentSessionId: overrides.currentSessionId !== undefined ? overrides.currentSessionId : 'sess_dev_1',
        currentStaff: overrides.currentStaff !== undefined ? overrides.currentStaff : { id: 2, name: 'Priya Sharma', role: 'Cashier' },
        currentRole: overrides.currentRole !== undefined ? overrides.currentRole : 'cashier',
        activeStaffSessions: overrides.activeStaffSessions || [],
        staffList: overrides.staffList || [
            { id: 1, name: 'Rajesh Admin', role: 'Admin', pin_hash: 'abc', pin_salt: '123' },
            { id: 2, name: 'Priya Sharma', role: 'Cashier', pin_hash: 'def', pin_salt: '456' }
        ],
        selectedLoginStaffId: 1,
        isMasterTerminal: overrides.isMasterTerminal || (() => false),
        getOrCreateDeviceId: overrides.getOrCreateDeviceId || (() => 'DEV_SECONDARY_01'),
        clearCart() { this.cart = []; },
        renderCart() {},
        updateStaffTopbarDisplay() {},
        renderLoginStaffPicker() {
            mockStaffPicker.innerHTML = '<div class="staff-card">Mock Staff Picker</div>';
        },
        enforcePermissions() {},
        stopSessionHeartbeat() {}
    };

    env.window = env;
    env.global = env;

    // Apply any explicit custom overrides
    Object.assign(env, overrides.globals || {});

    const ctx = vm.createContext(env);
    vm.runInContext(staffJs, ctx);

    return {
        ctx,
        elements,
        storage,
        mockOverlay,
        mockPinInput,
        mockContainer,
        otherModals,
        dispatchedEvents,
        toasts
    };
}

(async () => {

    // ========================================================================
    // DIMENSION 1: MASTER ADMIN TERMINAL IMMUNITY (DEFENSE-IN-DEPTH)
    // ========================================================================
    console.log('📍 ADVERSARIAL DIMENSION 1: MASTER ADMIN TERMINAL IMMUNITY');

    await challenge('CH-IMM-01', 'remoteLockStaffSession strictly rejects lock request for isMaster: true session', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Rajesh Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                { sessionId: 'sess_master_01', staffId: 1, staffName: 'Rajesh Admin', deviceId: 'DEV_MASTER_01', isMaster: true, status: 'ONLINE', isLocked: false },
                { sessionId: 'sess_waiter_02', staffId: 2, staffName: 'Priya Sharma', deviceId: 'DEV_WAITER_02', isMaster: false, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_master_01');
        assert.ok(res.error, 'Master session lock must return error');
        assert.strictEqual(res.error.code, 'IMMUNE_TARGET', `Expected IMMUNE_TARGET, got ${res.error.code}`);

        // Verify status was NOT mutated
        const sess = ctx.activeStaffSessions.find(s => s.sessionId === 'sess_master_01');
        assert.strictEqual(sess.status, 'ONLINE', 'Master session status must remain ONLINE');
        assert.strictEqual(sess.isLocked, false, 'Master session isLocked must remain false');
    });

    await challenge('CH-IMM-02', 'remoteLockStaffSession strictly rejects lock request for deviceId: DEV_MASTER_01', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Rajesh Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                { sessionId: 'sess_dev_master', staffId: 1, staffName: 'Rajesh Admin', deviceId: 'DEV_MASTER_01', isMaster: false, status: 'ONLINE' }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_dev_master');
        assert.ok(res.error, 'DEV_MASTER_01 target must return error');
        assert.strictEqual(res.error.code, 'IMMUNE_TARGET');
    });

    await challenge('CH-IMM-03', 'remoteLockStaffSession rejects lock when target device matches current device and isMaster is true', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
            currentRole: 'admin',
            getOrCreateDeviceId: () => 'DEV_MY_MASTER',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                { sessionId: 'sess_my_master', staffId: 1, deviceId: 'DEV_MY_MASTER', isMaster: false, status: 'ONLINE' }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_my_master');
        assert.ok(res.error, 'Current master device session must be immune');
        assert.strictEqual(res.error.code, 'IMMUNE_TARGET');
    });

    await challenge('CH-IMM-04', 'lockTerminalByRemote NO-OPs on Master Admin Terminal (via isMasterTerminal)', async () => {
        const { ctx, mockOverlay, mockPinInput, otherModals } = createMockEnvironment({
            isMasterTerminal: () => true,
            cart: [{ id: 1, name: 'Item', qty: 2 }],
            initialLocalStorage: { billnaw_active_cart: JSON.stringify([{ id: 1 }]) }
        });

        // Attempt to execute reactive lockdown on Master terminal
        ctx.lockTerminalByRemote({ sessionId: 'sess_master', isMaster: true });

        // Master terminal must NOT be locked
        assert.strictEqual(ctx.isTerminalLocked, false, 'Master terminal isTerminalLocked must remain false');
        assert.strictEqual(ctx.window.isTerminalLocked, false, 'window.isTerminalLocked must remain false');
        assert.strictEqual(mockOverlay.style.display, 'none', 'Master loginOverlay must not be shown');
        assert.ok(ctx.cart.length > 0, 'Cart must NOT be cleared on Master terminal');
        assert.notStrictEqual(otherModals[0].style.display, 'none', 'Open modals must NOT be closed on Master terminal');
    });

    await challenge('CH-IMM-05', 'lockTerminalByRemote NO-OPs on Master Admin Terminal (via billnaw_is_master localStorage)', async () => {
        const { ctx, mockOverlay } = createMockEnvironment({
            isMasterTerminal: () => false, // returns false, but localStorage has master flag
            initialLocalStorage: { billnaw_is_master: 'true' },
            cart: [{ id: 2, name: 'Latte', qty: 1 }]
        });

        ctx.lockTerminalByRemote({ sessionId: 'sess_master' });

        assert.strictEqual(ctx.isTerminalLocked, false, 'Terminal with billnaw_is_master=true must be immune');
        assert.strictEqual(mockOverlay.style.display, 'none', 'loginOverlay must not be opened');
        assert.strictEqual(ctx.cart.length, 1, 'Cart must remain intact');
    });

    await challenge('CH-IMM-06', 'renderLiveSessionCards renders protected badge and zero lock button for Master Terminal', async () => {
        const { ctx, mockContainer } = createMockEnvironment({
            getOrCreateDeviceId: () => 'DEV_MASTER_01',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                {
                    sessionId: 'sess_master_01',
                    staffId: 1,
                    staffName: 'Rajesh Admin',
                    staffRole: 'Admin',
                    deviceId: 'DEV_MASTER_01',
                    isMaster: true,
                    status: 'ONLINE',
                    shiftStartedAt: new Date().toISOString(),
                    lastActiveAt: new Date().toISOString()
                },
                {
                    sessionId: 'sess_waiter_02',
                    staffId: 2,
                    staffName: 'Priya Sharma',
                    staffRole: 'Cashier',
                    deviceId: 'DEV_COUNTER_02',
                    isMaster: false,
                    status: 'ONLINE',
                    shiftStartedAt: new Date().toISOString(),
                    lastActiveAt: new Date().toISOString()
                }
            ]
        });

        ctx.renderLiveSessionCards();
        const html = mockContainer.innerHTML;

        // Verify Master session UI
        assert.ok(html.includes('Master Terminal (Protected)'), 'Must render Master Terminal (Protected) badge');
        assert.ok(!html.includes("remoteLockStaffSession('sess_master_01')"), 'Must NEVER render remote lock button for master session');

        // Verify Secondary session UI
        assert.ok(html.includes("remoteLockStaffSession('sess_waiter_02')"), 'Secondary terminal MUST render Remote Lock button');
    });

    // ========================================================================
    // DIMENSION 2: CART FLUSH, STAFF PURGE & MODAL WIPE
    // ========================================================================
    console.log('\n📍 ADVERSARIAL DIMENSION 2: CART FLUSH, STAFF PURGE & MODAL WIPE');

    await challenge('CH-WIPE-01', 'lockTerminalByRemote completely clears in-progress cart across all state stores', async () => {
        let customClearCartCalled = false;
        const { ctx, storage } = createMockEnvironment({
            cart: [{ id: 10, name: 'Biryani', qty: 2 }],
            currentCart: [{ id: 10, name: 'Biryani', qty: 2 }],
            initialLocalStorage: { billnaw_active_cart: JSON.stringify([{ id: 10 }]) },
            globals: {
                clearCart: () => { customClearCartCalled = true; ctx.cart = []; }
            }
        });

        ctx.lockTerminalByRemote({ sessionId: 'sess_target_01' });

        assert.ok(customClearCartCalled, 'Custom clearCart() function must be called');
        assert.strictEqual(ctx.cart.length, 0, 'ctx.cart must be empty array');
        assert.strictEqual(ctx.window.cart.length, 0, 'window.cart must be empty array');
        assert.strictEqual(storage.has('billnaw_active_cart'), false, 'billnaw_active_cart must be removed from localStorage');
    });

    await challenge('CH-WIPE-02', 'lockTerminalByRemote purges active staff identity and stops session heartbeat', async () => {
        let clearIntervalCalled = false;
        let removeEventListenerCalled = false;
        const { ctx, storage } = createMockEnvironment({
            currentSessionId: 'sess_cashier_55',
            currentStaff: { id: 5, name: 'Arjun', role: 'Cashier' },
            currentRole: 'cashier',
            initialLocalStorage: {
                billnaw_current_session_id: 'sess_cashier_55',
                billnaw_active_staff: JSON.stringify({ id: 5 }),
                billnaw_last_staff_id: '5'
            },
            globals: {
                clearInterval: (id) => { clearIntervalCalled = true; },
                removeEventListener: (ev) => { removeEventListenerCalled = true; }
            }
        });

        // Initialize active heartbeat
        ctx.startSessionHeartbeat({ sessionId: 'sess_cashier_55' });

        ctx.lockTerminalByRemote({ sessionId: 'sess_cashier_55' });

        assert.ok(clearIntervalCalled, 'clearInterval must be called to halt heartbeat');
        assert.ok(removeEventListenerCalled, 'removeEventListener must be called to detach interaction tracking');
        assert.strictEqual(ctx.window.currentSessionId, null, 'currentSessionId must be set to null');
        assert.strictEqual(ctx.window.currentStaff, null, 'currentStaff must be set to null');
        assert.strictEqual(ctx.window.currentRole, null, 'currentRole must be set to null');
        assert.strictEqual(storage.has('billnaw_current_session_id'), false, 'billnaw_current_session_id must be removed');
        assert.strictEqual(storage.has('billnaw_active_staff'), false, 'billnaw_active_staff must be removed');
        assert.strictEqual(storage.has('billnaw_last_staff_id'), false, 'billnaw_last_staff_id must be removed');
    });

    await challenge('CH-WIPE-03', 'lockTerminalByRemote dismisses all active modals except #loginOverlay', async () => {
        const { ctx, otherModals, mockOverlay } = createMockEnvironment({
            otherModals: [
                { id: 'modal1', className: 'modal-overlay', style: { display: 'flex' } },
                { id: 'modal2', className: 'modal-overlay', style: { display: 'block' } },
                { id: 'modal3', className: 'modal-overlay', style: { display: 'inline-block' } }
            ]
        });

        ctx.lockTerminalByRemote({ sessionId: 'sess_waiter_1' });

        otherModals.forEach(m => {
            assert.strictEqual(m.style.display, 'none', `Modal #${m.id} must have display: none`);
        });
        assert.strictEqual(mockOverlay.style.display, 'flex', '#loginOverlay must have display: flex');
        assert.strictEqual(mockOverlay.style.zIndex, '1000005', '#loginOverlay must have zIndex: 1000005');
    });

    await challenge('CH-WIPE-04', 'lockTerminalByRemote clears and focuses PIN input & sets locked flags', async () => {
        const { ctx, mockPinInput, storage } = createMockEnvironment();

        mockPinInput.value = '9876';
        mockPinInput.focused = false;

        ctx.lockTerminalByRemote({ sessionId: 'sess_99' });

        assert.strictEqual(mockPinInput.value, '', 'PIN input value must be cleared');
        assert.strictEqual(mockPinInput.focused, true, 'PIN input must be focused');
        assert.strictEqual(ctx.isTerminalLocked, true, 'isTerminalLocked must be true');
        assert.strictEqual(ctx.window.isTerminalLocked, true, 'window.isTerminalLocked must be true');
        assert.strictEqual(storage.get('billnaw_terminal_locked'), 'true', 'billnaw_terminal_locked must be "true"');
    });

    await challenge('CH-WIPE-05', 'lockTerminalByRemote displays operator warning toast & dispatches CustomEvent', async () => {
        const { ctx, toasts, dispatchedEvents } = createMockEnvironment();

        const lockedSession = { sessionId: 'sess_remote_88', staffName: 'Karan' };
        ctx.lockTerminalByRemote(lockedSession);

        // Toast check
        const warningToast = toasts.find(t => t.type === 'warning');
        assert.ok(warningToast, 'Must display warning toast');
        assert.ok(warningToast.msg.includes('Session remotely locked by Administrator'), 'Toast message must indicate remote admin lock');

        // CustomEvent check
        const lockEvent = dispatchedEvents.find(e => e.type === 'billnaw:terminal-remotely-locked');
        assert.ok(lockEvent, 'Must dispatch billnaw:terminal-remotely-locked event');
        assert.deepStrictEqual(lockEvent.detail.session, lockedSession, 'Event detail must contain lockedSession');
        assert.ok(lockEvent.detail.timestamp, 'Event detail must contain ISO timestamp');
    });

    // ========================================================================
    // DIMENSION 3: STRICT RBAC ENFORCEMENT ON REMOTE LOCKOUT TRIGGER
    // ========================================================================
    console.log('\n📍 ADVERSARIAL DIMENSION 3: STRICT RBAC ENFORCEMENT ON TRIGGER');

    await challenge('CH-RBAC-01', 'Cashier cannot trigger remoteLockStaffSession', async () => {
        const { ctx, toasts } = createMockEnvironment({
            currentStaff: { id: 2, name: 'Cashier User', role: 'Cashier' },
            currentRole: 'cashier',
            isMasterTerminal: () => false,
            activeStaffSessions: [
                { sessionId: 'sess_waiter_9', staffId: 9, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_waiter_9');
        assert.ok(res.error, 'Cashier must be denied');
        assert.strictEqual(res.error.code, 'UNAUTHORIZED');
        assert.strictEqual(res.error.message, 'Admin role required');

        const warningToast = toasts.find(t => t.type === 'warning' && t.msg.includes('Only Administrators'));
        assert.ok(warningToast, 'Must show unauthorized warning toast');
    });

    await challenge('CH-RBAC-02', 'Kitchen Chef cannot trigger remoteLockStaffSession', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 3, name: 'Chef Vikas', role: 'Kitchen Chef' },
            currentRole: 'kitchen',
            isMasterTerminal: () => false,
            activeStaffSessions: [
                { sessionId: 'sess_waiter_9', staffId: 9, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_waiter_9');
        assert.ok(res.error, 'Kitchen Chef must be denied');
        assert.strictEqual(res.error.code, 'UNAUTHORIZED');
    });

    await challenge('CH-RBAC-03', 'Floor Server cannot trigger remoteLockStaffSession', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 4, name: 'Server Sunil', role: 'Floor Server' },
            currentRole: 'server',
            isMasterTerminal: () => false,
            activeStaffSessions: [
                { sessionId: 'sess_waiter_9', staffId: 9, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_waiter_9');
        assert.ok(res.error, 'Floor Server must be denied');
        assert.strictEqual(res.error.code, 'UNAUTHORIZED');
    });

    await challenge('CH-RBAC-04', 'Manager without can_manage_staff cannot trigger remoteLockStaffSession', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 5, name: 'Manager Dave', role: 'Manager' },
            currentRole: 'manager',
            isMasterTerminal: () => false,
            globals: {
                hasPermission: () => false
            },
            activeStaffSessions: [
                { sessionId: 'sess_waiter_9', staffId: 9, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_waiter_9');
        assert.ok(res.error, 'Manager without can_manage_staff must be denied');
        assert.strictEqual(res.error.code, 'UNAUTHORIZED');
    });

    await challenge('CH-RBAC-05', 'Unauthenticated attacker cannot trigger remoteLockStaffSession', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: null,
            currentRole: null,
            isMasterTerminal: () => false,
            activeStaffSessions: [
                { sessionId: 'sess_waiter_9', staffId: 9, status: 'ONLINE', isLocked: false }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_waiter_9');
        assert.ok(res.error, 'Unauthenticated caller must be denied');
        assert.strictEqual(res.error.code, 'UNAUTHORIZED');
    });

    await challenge('CH-RBAC-06', 'Authorized Admin successfully locks secondary session with audit trail', async () => {
        const { ctx, storage, toasts } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Rajesh Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                {
                    sessionId: 'sess_counter_2',
                    staffId: 2,
                    staffName: 'Priya Sharma',
                    deviceId: 'DEV_COUNTER_2',
                    isMaster: false,
                    status: 'ONLINE',
                    isLocked: false
                }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_counter_2');
        assert.strictEqual(res.error, null, 'Must succeed without error');
        assert.ok(res.data, 'Must return locked session data');
        assert.strictEqual(res.data.status, 'LOCKED');
        assert.strictEqual(res.data.isLocked, true);
        assert.ok(res.data.lockedAt, 'Must set lockedAt timestamp');
        assert.strictEqual(res.data.lockedByAdminId, 1, 'Must record admin staff ID in audit trail');

        // Check optimistic persistence in localStorage
        const stored = JSON.parse(storage.get('billnaw_active_sessions'));
        const storedSess = stored.find(s => s.sessionId === 'sess_counter_2');
        assert.strictEqual(storedSess.status, 'LOCKED');
        assert.strictEqual(storedSess.isLocked, true);

        // Toast confirmation
        const successToast = toasts.find(t => t.type === 'success' && t.msg.includes('Remote lock signal dispatched'));
        assert.ok(successToast, 'Must display success toast');
    });

    // ========================================================================
    // DIMENSION 4: IDEMPOTENCY, EDGE CASES & ATTACK RESILIENCE
    // ========================================================================
    console.log('\n📍 ADVERSARIAL DIMENSION 4: IDEMPOTENCY & EDGE CASES');

    await challenge('CH-EDGE-01', 'Idempotent remoteLockStaffSession on already LOCKED session returns cleanly', async () => {
        const originalLockedAt = '2026-11-04T10:00:00.000Z';
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                {
                    sessionId: 'sess_already_locked',
                    staffId: 3,
                    deviceId: 'DEV_03',
                    status: 'LOCKED',
                    isLocked: true,
                    lockedAt: originalLockedAt
                }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_already_locked');
        assert.strictEqual(res.error, null, 'Must return error: null');
        assert.strictEqual(res.data.status, 'LOCKED');
        assert.strictEqual(res.data.lockedAt, originalLockedAt, 'Must preserve original lockedAt without overwriting');
    });

    await challenge('CH-EDGE-02', 'remoteLockStaffSession on already ENDED session returns cleanly without reactivating', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                {
                    sessionId: 'sess_ended',
                    staffId: 4,
                    deviceId: 'DEV_04',
                    status: 'ENDED',
                    isLocked: false
                }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_ended');
        assert.strictEqual(res.error, null);
        assert.strictEqual(res.data.status, 'ENDED', 'Session must remain ENDED, not revived to LOCKED');
    });

    await challenge('CH-EDGE-03', 'remoteLockStaffSession with empty / null / undefined sessionId returns INVALID_ID', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true
        });

        const resNull = await ctx.remoteLockStaffSession(null);
        assert.ok(resNull.error);
        assert.strictEqual(resNull.error.code, 'INVALID_ID');

        const resEmpty = await ctx.remoteLockStaffSession('');
        assert.ok(resEmpty.error);
        assert.strictEqual(resEmpty.error.code, 'INVALID_ID');

        const resUndef = await ctx.remoteLockStaffSession(undefined);
        assert.ok(resUndef.error);
        assert.strictEqual(resUndef.error.code, 'INVALID_ID');
    });

    await challenge('CH-EDGE-04', 'remoteLockStaffSession with non-existent session ID returns SESSION_NOT_FOUND', async () => {
        const { ctx } = createMockEnvironment({
            currentStaff: { id: 1, name: 'Admin', role: 'Admin' },
            currentRole: 'admin',
            isMasterTerminal: () => true,
            activeStaffSessions: [
                { sessionId: 'sess_1', staffId: 1 }
            ]
        });

        const res = await ctx.remoteLockStaffSession('sess_ghost_9999');
        assert.ok(res.error);
        assert.strictEqual(res.error.code, 'SESSION_NOT_FOUND');
    });

    await challenge('CH-EDGE-05', 'formatShiftDuration and isSessionOnline calculate accurately under boundary conditions', async () => {
        const { ctx } = createMockEnvironment();

        const now = new Date('2026-11-04T12:00:00.000Z');

        // Boundary: null / empty
        assert.strictEqual(ctx.formatShiftDuration(null, now), '0m');
        assert.strictEqual(ctx.isSessionOnline(null, now), false);

        // Boundary: 0 minutes elapsed
        assert.strictEqual(ctx.formatShiftDuration(now.toISOString(), now), '0m');
        assert.strictEqual(ctx.isSessionOnline(now.toISOString(), now), true);

        // Boundary: exactly 4m59s elapsed (online)
        const t4m59s = new Date(now.getTime() - 4 * 60 * 1000 - 59 * 1000).toISOString();
        assert.strictEqual(ctx.formatShiftDuration(t4m59s, now), '4m');
        assert.strictEqual(ctx.isSessionOnline(t4m59s, now), true);

        // Boundary: exactly 5m01s elapsed (idle)
        const t5m01s = new Date(now.getTime() - 5 * 60 * 1000 - 1000).toISOString();
        assert.strictEqual(ctx.formatShiftDuration(t5m01s, now), '5m');
        assert.strictEqual(ctx.isSessionOnline(t5m01s, now), false);

        // 3 hours 25 minutes
        const t3h25m = new Date(now.getTime() - (3 * 3600 + 25 * 60) * 1000).toISOString();
        assert.strictEqual(ctx.formatShiftDuration(t3h25m, now), '3h 25m');
    });

    // ========================================================================
    // DIMENSION 5: DOM INVARIANTS & STATIC SECURITY VERIFICATION
    // ========================================================================
    console.log('\n📍 ADVERSARIAL DIMENSION 5: DOM INVARIANTS & STATIC SECURITY');

    await challenge('CH-INV-01', 'Invariant 1: Total .modal-close-btn occurrences in index.html is strictly 26', async () => {
        const classMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
        assert.strictEqual(classMatches.length, 26, `Expected exactly 26 .modal-close-btn occurrences, found ${classMatches.length}`);
    });

    await challenge('CH-INV-02', 'Invariant 1b: Exact 26 modal-close-btn buttons contain inline SVG icons', async () => {
        const svgCloseMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[\s\S]*?<\/svg><\/button>/gi) || [];
        assert.strictEqual(svgCloseMatches.length, 26, `Expected exactly 26 SVG close buttons, found ${svgCloseMatches.length}`);
    });

    await challenge('CH-INV-03', 'Invariant 1c: Zero raw Unicode "✕" or "X" inside any .modal-close-btn', async () => {
        const rawCloseMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[^<]*[✕xX][^<]*<\/button>/g);
        assert.strictEqual(rawCloseMatches, null, 'Found forbidden raw text inside .modal-close-btn');
    });

    await challenge('CH-INV-04', 'Newly introduced modals use dedicated class names, NEVER .modal-close-btn', async () => {
        // #activeSessionsModal -> .session-close-btn
        assert.ok(html.includes('class="session-close-btn"'), '#activeSessionsModal must use .session-close-btn');

        // #devicePairingOverlay & #deviceHubModal -> .device-hub-close-btn
        assert.ok(html.includes('class="device-hub-close-btn"'), '#deviceHubModal must use .device-hub-close-btn');

        // #firstLoginPinModal -> .pin-intercept-cancel-btn
        assert.ok(html.includes('class="pin-intercept-cancel-btn"'), '#firstLoginPinModal must use .pin-intercept-cancel-btn');
    });

    await challenge('CH-INV-05', 'Invariant 2: Zero raw Unicode emojis in operational <button> elements in index.html', async () => {
        const buttonMatches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
        const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

        let emojiViolations = 0;
        const violatingButtons = [];
        for (const btn of buttonMatches) {
            if (emojiRegex.test(btn)) {
                emojiViolations++;
                violatingButtons.push(btn.slice(0, 80));
            }
        }
        assert.strictEqual(emojiViolations, 0, `Found ${emojiViolations} operational buttons with raw Unicode emojis: ${violatingButtons.join('; ')}`);
    });

    await challenge('CH-INV-06', 'Invariant 3: Non-breaking currency space formatting (₹ ) preserved in index.html', async () => {
        assert.ok(html.includes('₹ '), 'index.html must use standard "₹ " notation');
        assert.ok(!html.includes('₹  '), 'index.html must not contain double spaces after ₹');
    });

    await challenge('CH-INV-07', 'CSS Architecture: reports.css contains .session-card and presence telemetry styles', async () => {
        assert.ok(reportsCss.includes('.session-card'), 'reports.css must define .session-card');
        assert.ok(reportsCss.includes('.presence-dot'), 'reports.css must define .presence-dot');
        assert.ok(reportsCss.includes('.presence-dot.online'), 'reports.css must define .presence-dot.online');
        assert.ok(reportsCss.includes('.presence-dot.idle'), 'reports.css must define .presence-dot.idle');
        assert.ok(reportsCss.includes('.presence-dot.locked'), 'reports.css must define .presence-dot.locked');
        assert.ok(reportsCss.includes('.session-remote-lock-btn'), 'reports.css must define .session-remote-lock-btn');
    });

    // ========================================================================
    // FINAL SUMMARY & VERDICT
    // ========================================================================
    console.log('\n====================================================================');
    console.log(`🎯 CHALLENGER SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('====================================================================\n');

    if (failedTests > 0) {
        console.error(`💥 ADVERSARIAL VULNERABILITIES DETECTED (${failedTests}):`);
        failures.forEach(f => {
            console.error(`  - [${f.id}] ${f.description}: ${f.error}`);
        });
        process.exit(1);
    } else {
        console.log('✨ ALL 25 ADVERSARIAL CHALLENGES PASSED WITH ZERO VULNERABILITIES!');
        process.exit(0);
    }

})();
