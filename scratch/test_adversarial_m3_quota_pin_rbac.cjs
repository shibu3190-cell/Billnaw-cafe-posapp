/**
 * ⚔️ ADVERSARIAL TEST HARNESS: MILESTONE 3 (R3)
 * Staff Cloud Presence, Role-Based Access & Multi-Profile PIN Flow
 * 
 * Conducted by: challenger_m3_2 (teamwork_challenger)
 * Target Focus:
 * 1. Quota Bounds & Dynamic Slot Reclaim (MAX_STAFF_PROFILES = 10 boundary, 11th blocked, delete reclaims, admin delete protected)
 * 2. OTP Onboarding & Single-Use Consumption Replay Attack (trivial PINs 0000/1111/1234/4321 rejected, OTP wiped & non-replayable)
 * 3. Floor Server Role Settings Access Restriction & Modal Escape (settings tab permitted, non-printer tiles shielded, printer locked to Bluetooth KOT, direct JS calls to 14 modal openers blocked by checkFloorServerModalBlock)
 * 4. Cryptographic PIN Verification (eradicate 1234 backdoor, verify canonical salted SHA-256: cleanPin:cleanSalt:billnaw_pin_v2)
 * 5. Repository Invariants (exact 26 modal close SVGs, zero emojis in buttons, firestore.rules bit-for-bit binary parity)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const vm = require('vm');

console.log('====================================================================');
console.log('⚔️  ADVERSARIAL STRESS HARNESS: MILESTONE 3 (R3)');
console.log('    Quota Bounds, OTP Single-Use, Floor Server Modal Escape & PIN Crypto');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function it(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
        failedTests++;
        failures.push({ name, error: err.message, stack: err.stack });
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Reason: ${err.message}`);
    }
}

// Reference Oracle for canonical salted SHA-256
function referenceHash(pin, salt) {
    const cleanPin = String(pin).trim();
    const cleanSalt = String(salt).trim();
    return crypto.createHash('sha256').update(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`).digest('hex');
}

// Build a full-fidelity DOM & browser sandbox capable of executing real js/staff.js, js/settings.js, and js/cloud-sync.js
function createPosSandbox() {
    const storage = {};
    const toasts = [];
    const elementsById = new Map();

    class MockClassList {
        constructor() { this.set = new Set(); }
        add(...cls) { cls.forEach(c => this.set.add(c)); }
        remove(...cls) { cls.forEach(c => this.set.delete(c)); }
        contains(c) { return this.set.has(c); }
        toggle(c, force) {
            if (force !== undefined) {
                if (force) this.set.add(c);
                else this.set.delete(c);
            } else {
                if (this.set.has(c)) this.set.delete(c);
                else this.set.add(c);
            }
        }
    }

    class MockElement {
        constructor(id, tagName = 'div') {
            this.id = id || '';
            this.tagName = tagName.toUpperCase();
            this.style = {
                setProperty: (k, v) => { this.style[k] = v; },
                removeProperty: (k) => { delete this.style[k]; }
            };
            this.classList = new MockClassList();
            this.attributes = new Map();
            this.children = [];
            this.parentElement = null;
            this.dataset = {};
            this.value = '';
            this.innerText = '';
            this.textContent = '';
            this.innerHTML = '';
            this.disabled = false;
            this.checked = false;
            this.placeholder = '';
            this.type = 'text';
            if (id) elementsById.set(id, this);
        }

        setAttribute(k, v) { this.attributes.set(k, String(v)); }
        getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
        removeAttribute(k) { this.attributes.delete(k); }

        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) {
                this.children.splice(idx, 1);
                child.parentElement = null;
            }
            return child;
        }

        querySelector(sel) {
            const all = this.querySelectorAll(sel);
            return all.length > 0 ? all[0] : null;
        }

        querySelectorAll(sel) {
            sel = sel.trim();
            if (sel.includes(' ')) {
                const parts = sel.split(/\s+/);
                let current = [this];
                for (const part of parts) {
                    let next = [];
                    for (const node of current) {
                        function traverse(n) {
                            for (const ch of n.children) {
                                if (matches(ch, part)) next.push(ch);
                                traverse(ch);
                            }
                        }
                        traverse(node);
                    }
                    current = next;
                }
                return current;
            }
            const results = [];
            function traverse(node) {
                for (const ch of node.children) {
                    if (matches(ch, sel)) results.push(ch);
                    traverse(ch);
                }
            }
            traverse(this);
            return results;
        }

        closest(sel) {
            let cur = this;
            while (cur) {
                if (matches(cur, sel)) return cur;
                cur = cur.parentElement;
            }
            return null;
        }

        focus() {}
    }

    function matches(el, sel) {
        if (!el || !sel) return false;
        sel = sel.trim();
        if (sel.startsWith('#')) return el.id === sel.slice(1);
        if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
        if (sel.includes('.')) {
            const parts = sel.split('.');
            if (parts[0] && el.tagName !== parts[0].toUpperCase()) return false;
            return el.classList.contains(parts[1]);
        }
        if (sel.includes('[') && sel.includes(']')) {
            const attrMatch = sel.match(/\[([a-zA-Z0-9_\-]+)([\*\^$]?=)"?([^"\]]*)"?\]/);
            if (attrMatch) {
                const [, attr, op, val] = attrMatch;
                const actual = el.getAttribute(attr) || '';
                if (op === '*=') return actual.includes(val);
                if (op === '^=') return actual.startsWith(val);
                if (op === '$=') return actual.endsWith(val);
                return actual === val;
            }
        }
        return el.tagName === sel.toUpperCase();
    }

    const mockDoc = {
        getElementById(id) {
            if (!elementsById.has(id)) {
                const el = new MockElement(id);
                elementsById.set(id, el);
            }
            return elementsById.get(id);
        },
        querySelector(sel) {
            const all = this.querySelectorAll(sel);
            return all.length > 0 ? all[0] : null;
        },
        querySelectorAll(sel) {
            sel = sel.trim();
            if (sel.startsWith('#') && !sel.includes(' ') && !sel.includes('.')) {
                const el = this.getElementById(sel.slice(1));
                return el ? [el] : [];
            }
            if (sel.includes(' ')) {
                const parts = sel.split(/\s+/);
                const firstPart = parts[0];
                let current = [];
                for (const el of elementsById.values()) {
                    if (matches(el, firstPart) && !current.includes(el)) current.push(el);
                }
                for (let p = 1; p < parts.length; p++) {
                    const part = parts[p];
                    let next = [];
                    for (const node of current) {
                        function traverse(n) {
                            for (const ch of n.children) {
                                if (matches(ch, part) && !next.includes(ch)) next.push(ch);
                                traverse(ch);
                            }
                        }
                        traverse(node);
                    }
                    current = next;
                }
                return current;
            }
            const results = [];
            for (const el of elementsById.values()) {
                if (matches(el, sel) && !results.includes(el)) results.push(el);
                for (const sub of el.querySelectorAll(sel)) {
                    if (!results.includes(sub)) results.push(sub);
                }
            }
            return results;
        },
        createElement(tag) { return new MockElement('', tag); },
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const ctx = {
        console,
        Buffer,
        TextEncoder,
        Uint8Array,
        Array,
        Math,
        String,
        Date,
        parseInt,
        parseFloat,
        Set,
        Map,
        Promise,
        fetch: globalThis.fetch || (async () => ({ ok: true, json: async () => ({}) })),
        setTimeout: (fn) => { fn(); return 1; },
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        navigator: { onLine: true, userAgent: 'AdvSandbox' },
        location: { hash: '', reload: () => {} },
        scrollTo: () => {},
        toasts,
        showToast: (msg, type = 'info') => { toasts.push({ msg, type }); },
        confirm: () => true,
        saveToLocal: () => {},
        getLocalISODate: () => '2026-11-08',
        localStorage: {
            getItem: (k) => (k in storage ? storage[k] : null),
            setItem: (k, v) => { storage[k] = String(v); },
            removeItem: (k) => { delete storage[k]; },
            clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
            _raw: storage
        },
        sessionStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        crypto: {
            subtle: {
                digest: async (algo, data) => {
                    const hash = crypto.createHash('sha256').update(Buffer.from(data)).digest();
                    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
                }
            },
            getRandomValues: (arr) => crypto.randomFillSync(arr)
        },
        idb: {
            set: async () => {},
            get: async () => null
        },
        shopProfile: {
            name: 'Billnaw Cafe Test',
            storeCode: 'SHOP-TEST-M3',
            email: 'admin@cafe.com',
            adminPinHash: crypto.createHash('sha256').update('1234').digest('hex')
        },
        hashString: (str) => crypto.createHash('sha256').update(String(str)).digest('hex'),
        staffList: [],
        currentStaff: null,
        activeStaffSessions: [],
        document: mockDoc,
        window: null,
        globalThis: null
    };

    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    // Load staff.js (which defines ROLES, ROLE_PERMISSIONS, normalizeRole, etc.)
    const staffCode = fs.readFileSync(path.join(__dirname, '../js/staff.js'), 'utf8');
    vm.runInContext(staffCode, ctx);

    // Load settings.js
    const settingsCode = fs.readFileSync(path.join(__dirname, '../js/settings.js'), 'utf8');
    vm.runInContext(settingsCode, ctx);

    // Load cloud-sync.js
    const cloudSyncCode = fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8');
    vm.runInContext(cloudSyncCode, ctx);

    // Load shop-auth.js
    const shopAuthCode = fs.readFileSync(path.join(__dirname, '../js/shop-auth.js'), 'utf8');
    vm.runInContext(shopAuthCode, ctx);

    return { ctx, mockDoc, toasts, storage, MockElement };
}

async function runAdversarialHarness() {

    // =========================================================================
    // GROUP 1: QUOTA BOUNDS & DYNAMIC SLOT RECLAMATION (MAX_STAFF_PROFILES = 10)
    // =========================================================================
    console.log('📍 GROUP 1: QUOTA BOUNDS & DYNAMIC RECLAMATION (MAX_STAFF_PROFILES = 10)');

    await it('ADV-QUOTA-01: Exactly 10 staff profiles succeed, 11th strictly blocked in openAddStaffModal()', async () => {
        const { ctx, mockDoc, toasts } = createPosSandbox();
        
        ctx.staffList = [];
        // Onboard profiles 1 through 10
        for (let i = 1; i <= 10; i++) {
            const salt = ctx.generatePinSalt();
            const pin = String(1000 + i * 27);
            const pinHash = await ctx.hashPin(pin, salt);
            ctx.staffList.push({
                id: i === 1 ? 'admin' : `staff_${i}`,
                name: i === 1 ? 'Store Admin' : `Staff Member ${i}`,
                role: i === 1 ? 'Admin' : 'Cashier',
                pin_salt: salt,
                pin_hash: pinHash,
                pinSalt: salt,
                pinHash: pinHash,
                status: 'Active'
            });
        }
        assert.strictEqual(ctx.staffList.length, 10, 'Must have exactly 10 profiles');

        // Calling openAddStaffModal when at quota cap (10) must return false and emit warning toast
        toasts.length = 0;
        const modalResult = ctx.openAddStaffModal();
        assert.strictEqual(modalResult, false, 'openAddStaffModal must return false at quota 10');
        const hasWarning = toasts.some(t => t.msg.includes('Maximum limit of 10 staff profiles reached'));
        assert.ok(hasWarning, 'Must toast warning about 10-profile quota cap');
    });

    await it('ADV-QUOTA-02: Direct saveStaffMember() call at quota 10 rejects 11th member and does NOT mutate staffList', async () => {
        const { ctx, toasts } = createPosSandbox();
        
        ctx.staffList = [];
        for (let i = 1; i <= 10; i++) {
            const salt = ctx.generatePinSalt();
            const pin = String(2000 + i * 13);
            const pinHash = await ctx.hashPin(pin, salt);
            ctx.staffList.push({
                id: `id_${i}`,
                name: `Staff ${i}`,
                role: 'Cashier',
                pin_salt: salt,
                pin_hash: pinHash,
                status: 'Active'
            });
        }

        // Direct bypass attempt calling saveStaffMember() with new payload
        toasts.length = 0;
        const res = await ctx.saveStaffMember({
            name: 'Malicious 11th Staff',
            pin: '9482',
            role: 'Cashier'
        });

        assert.strictEqual(res, false, 'saveStaffMember must return false on 11th creation attempt');
        assert.strictEqual(ctx.staffList.length, 10, 'staffList length must remain strictly 10');
        assert.ok(!ctx.staffList.some(s => s.name === 'Malicious 11th Staff'), 'Malicious staff must NOT be added');
    });

    await it('ADV-QUOTA-03: Editing an existing staff member at quota 10 succeeds without quota block', async () => {
        const { ctx } = createPosSandbox();
        
        ctx.staffList = [];
        for (let i = 1; i <= 10; i++) {
            const salt = ctx.generatePinSalt();
            const pin = String(3000 + i * 17);
            const pinHash = await ctx.hashPin(pin, salt);
            ctx.staffList.push({
                id: `staff_${i}`,
                name: `Staff ${i}`,
                role: 'Cashier',
                pin_salt: salt,
                pin_hash: pinHash,
                status: 'Active'
            });
        }

        // Edit staff #4
        const res = await ctx.saveStaffMember({
            id: 'staff_4',
            name: 'Updated Staff 4 Name',
            role: 'Floor Server'
        });

        assert.strictEqual(res, true, 'Updating an existing staff member must succeed');
        assert.strictEqual(ctx.staffList.length, 10, 'staffList length must stay 10');
        const updated = ctx.staffList.find(s => s.id === 'staff_4');
        assert.strictEqual(updated.name, 'Updated Staff 4 Name');
        assert.strictEqual(updated.role, 'Floor Server');
    });

    await it('ADV-QUOTA-04: Dynamic slot recovery — deleting 1 staff member frees up slot for replacement', async () => {
        const { ctx, toasts } = createPosSandbox();
        
        ctx.staffList = [];
        ctx.currentStaff = { id: 'admin', role: 'Admin' };
        for (let i = 1; i <= 10; i++) {
            const salt = ctx.generatePinSalt();
            const pin = String(4000 + i * 19);
            const pinHash = await ctx.hashPin(pin, salt);
            ctx.staffList.push({
                id: i === 1 ? 'admin' : `staff_${i}`,
                name: i === 1 ? 'Store Admin' : `Staff ${i}`,
                role: i === 1 ? 'Admin' : 'Cashier',
                pin_salt: salt,
                pin_hash: pinHash,
                status: 'Active'
            });
        }
        assert.strictEqual(ctx.staffList.length, 10);

        // Delete staff member #5
        await ctx.deleteStaffMember('staff_5');
        assert.strictEqual(ctx.staffList.length, 9, 'staffList length must decrement to 9');

        // Now save a replacement staff member (reaching 10 again)
        const addSuccess = await ctx.saveStaffMember({
            name: 'Replacement Member',
            pin: '7392',
            role: 'Floor Server'
        });
        assert.strictEqual(addSuccess, true, 'Creating replacement staff member must succeed');
        assert.strictEqual(ctx.staffList.length, 10, 'staffList length must reach 10');

        // 11th attempt is blocked again
        const blockAgain = await ctx.saveStaffMember({
            name: 'Extra 11th Member',
            pin: '8214',
            role: 'Cashier'
        });
        assert.strictEqual(blockAgain, false, '11th attempt must be blocked again');
        assert.strictEqual(ctx.staffList.length, 10, 'staffList must stay capped at 10');
    });

    await it('ADV-QUOTA-05: 25-cycle delete & create churn stress maintains strict 10-profile boundary', async () => {
        const { ctx } = createPosSandbox();
        
        ctx.staffList = [];
        ctx.currentStaff = { id: 'admin', role: 'Admin' };
        for (let i = 1; i <= 10; i++) {
            const salt = ctx.generatePinSalt();
            const pin = String(5000 + i * 23);
            const pinHash = await ctx.hashPin(pin, salt);
            ctx.staffList.push({
                id: i === 1 ? 'admin' : `staff_init_${i}`,
                name: `Staff Initial ${i}`,
                role: i === 1 ? 'Admin' : 'Cashier',
                pin_salt: salt,
                pin_hash: pinHash,
                status: 'Active'
            });
        }

        // Perform 25 churn cycles (delete slot 10, re-add, verify cap)
        for (let cycle = 0; cycle < 25; cycle++) {
            const last = ctx.staffList[ctx.staffList.length - 1];
            await ctx.deleteStaffMember(last.id);
            assert.strictEqual(ctx.staffList.length, 9, `Cycle ${cycle}: length must be 9 after delete`);

            const added = await ctx.saveStaffMember({
                name: `Churn Staff ${cycle}`,
                pin: String(1000 + ((cycle * 73 + 31) % 8900)),
                role: 'Cashier'
            });
            assert.strictEqual(added, true, `Cycle ${cycle}: saveStaffMember must succeed`);
            assert.strictEqual(ctx.staffList.length, 10, `Cycle ${cycle}: length must be 10`);

            // Verify 11th is strictly blocked in every cycle
            const blocked = await ctx.saveStaffMember({
                name: `Over-Quota ${cycle}`,
                pin: '9999',
                role: 'Cashier'
            });
            assert.strictEqual(blocked, false, `Cycle ${cycle}: 11th must be blocked`);
            assert.strictEqual(ctx.staffList.length, 10);
        }
    });

    await it('ADV-QUOTA-06: Deletion of default Admin profile is strictly forbidden', async () => {
        const { ctx, toasts } = createPosSandbox();
        ctx.staffList = [
            { id: 'admin', name: 'Master Admin', role: 'Admin', status: 'Active' },
            { id: 'staff_2', name: 'Cashier 2', role: 'Cashier', status: 'Active' }
        ];
        ctx.currentStaff = ctx.staffList[0];

        toasts.length = 0;
        await ctx.deleteStaffMember('admin');
        assert.strictEqual(ctx.staffList.length, 2, 'Admin profile must NOT be deleted');
        assert.ok(toasts.some(t => t.msg.includes('The default Admin profile cannot be removed')));
    });

    // =========================================================================
    // GROUP 2: OTP ONBOARDING & SINGLE-USE CONSUMPTION REPLAY ATTACK
    // =========================================================================
    console.log('\n📍 GROUP 2: OTP ONBOARDING & SINGLE-USE REPLAY ATTACK DEFENSE');

    await it('ADV-OTP-01: generateStaffOtp() produces 100 random 4-digit numeric OTPs strictly between 1000 and 9999', async () => {
        const { ctx } = createPosSandbox();
        for (let i = 0; i < 100; i++) {
            const otp = ctx.generateStaffOtp();
            assert.strictEqual(typeof otp, 'string', 'OTP must be string');
            assert.strictEqual(otp.length, 4, 'OTP must be 4 digits');
            assert.ok(/^\d{4}$/.test(otp), `OTP '${otp}' must be numeric`);
            const num = parseInt(otp, 10);
            assert.ok(num >= 1000 && num <= 9999, `OTP ${num} must be in [1000, 9999]`);
        }
    });

    await it('ADV-OTP-02: saveStaffMember() assigns OTP, marks mustChangePin: true, otpConsumed: false, and deletes plaintext PIN', async () => {
        const { ctx } = createPosSandbox();
        ctx.staffList = [];
        
        const tempOtp = '6842';
        await ctx.saveStaffMember({
            name: 'Rahul Floor Server',
            pin: tempOtp,
            role: 'Floor Server'
        });

        assert.strictEqual(ctx.staffList.length, 1);
        const rahul = ctx.staffList[0];
        assert.strictEqual(rahul.name, 'Rahul Floor Server');
        assert.strictEqual(rahul.mustChangePin, true, 'mustChangePin must be true');
        assert.strictEqual(rahul.otpConsumed, false, 'otpConsumed must be false');
        assert.strictEqual(rahul.initialOtp, tempOtp, 'initialOtp must store temporary OTP');
        assert.strictEqual(rahul.pin, undefined, 'Plaintext pin property must be completely purged');
        assert.ok(rahul.pin_salt && rahul.pin_salt.length >= 16, 'Salt must be generated');
        assert.ok(rahul.pin_hash && rahul.pin_hash.length === 64, 'SHA-256 hash must be generated');

        // Verify hash matches OTP
        const expectedHash = referenceHash(tempOtp, rahul.pin_salt);
        assert.strictEqual(rahul.pin_hash, expectedHash, 'pin_hash must match salted SHA-256 of OTP');
    });

    await it('ADV-OTP-03: submitFirstLoginPin() rejects non-numeric and wrong-length PINs', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        const staff = { id: 101, name: 'Ananya', role: 'Cashier', mustChangePin: true, otpConsumed: false };
        ctx.staffList = [staff];
        ctx.openFirstLoginPinModal(staff);

        const invalidPins = ['12', '123', '12345', 'abcd', '12a4', '', '    '];
        for (const badPin of invalidPins) {
            mockDoc.getElementById('firstLoginNewPin').value = badPin;
            mockDoc.getElementById('firstLoginConfirmPin').value = badPin;
            mockDoc.getElementById('firstLoginPinError').style.display = 'none';

            await ctx.submitFirstLoginPin();
            assert.strictEqual(mockDoc.getElementById('firstLoginPinError').style.display, 'flex',
                `PIN '${badPin}' must trigger error`);
            assert.strictEqual(staff.mustChangePin, true, 'mustChangePin must remain true');
        }
    });

    await it('ADV-OTP-04: submitFirstLoginPin() strictly rejects repetitive PINs (0000, 1111, 2222..9999)', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        const staff = { id: 102, name: 'Vikram', role: 'Floor Server', mustChangePin: true, otpConsumed: false };
        ctx.staffList = [staff];
        ctx.openFirstLoginPinModal(staff);

        const repetitive = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
        for (const pin of repetitive) {
            mockDoc.getElementById('firstLoginNewPin').value = pin;
            mockDoc.getElementById('firstLoginConfirmPin').value = pin;
            mockDoc.getElementById('firstLoginPinError').style.display = 'none';

            await ctx.submitFirstLoginPin();
            assert.strictEqual(mockDoc.getElementById('firstLoginPinError').style.display, 'flex',
                `Repetitive PIN '${pin}' must be rejected`);
            assert.ok(mockDoc.getElementById('firstLoginPinErrorText').textContent.includes('non-trivial PIN'),
                `Error message must mention non-trivial PIN for '${pin}'`);
            assert.strictEqual(staff.mustChangePin, true, 'Staff must remain locked in mustChangePin');
        }
    });

    await it('ADV-OTP-05: submitFirstLoginPin() strictly rejects sequential PINs (1234, 4321)', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        const staff = { id: 103, name: 'Suresh', role: 'Cashier', mustChangePin: true, otpConsumed: false };
        ctx.staffList = [staff];
        ctx.openFirstLoginPinModal(staff);

        const sequential = ['1234', '4321'];
        for (const pin of sequential) {
            mockDoc.getElementById('firstLoginNewPin').value = pin;
            mockDoc.getElementById('firstLoginConfirmPin').value = pin;
            mockDoc.getElementById('firstLoginPinError').style.display = 'none';

            await ctx.submitFirstLoginPin();
            assert.strictEqual(mockDoc.getElementById('firstLoginPinError').style.display, 'flex',
                `Sequential PIN '${pin}' must be rejected`);
            assert.strictEqual(staff.mustChangePin, true);
        }
    });

    await it('ADV-OTP-06: submitFirstLoginPin() rejects mismatching confirmation PIN', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        const staff = { id: 104, name: 'Priya', role: 'Cashier', mustChangePin: true, otpConsumed: false };
        ctx.staffList = [staff];
        ctx.openFirstLoginPinModal(staff);

        mockDoc.getElementById('firstLoginNewPin').value = '8492';
        mockDoc.getElementById('firstLoginConfirmPin').value = '8493'; // 1 digit mismatch
        mockDoc.getElementById('firstLoginPinError').style.display = 'none';

        await ctx.submitFirstLoginPin();
        assert.strictEqual(mockDoc.getElementById('firstLoginPinError').style.display, 'flex');
        assert.ok(mockDoc.getElementById('firstLoginPinErrorText').textContent.includes('PINs do not match'));
        assert.strictEqual(staff.mustChangePin, true);
    });

    await it('ADV-OTP-07: submitFirstLoginPin() rejects PIN colliding with existing staff PIN', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        
        // Staff 1 already has PIN 7183
        const salt1 = ctx.generatePinSalt();
        const hash1 = await ctx.hashPin('7183', salt1);
        const existingStaff = { id: 101, name: 'Existing Staff', pin_salt: salt1, pin_hash: hash1 };

        // Staff 2 onboarding
        const newStaff = { id: 102, name: 'New Staff', mustChangePin: true, otpConsumed: false };
        ctx.staffList = [existingStaff, newStaff];
        ctx.openFirstLoginPinModal(newStaff);

        // Try to set Staff 2's PIN to 7183
        mockDoc.getElementById('firstLoginNewPin').value = '7183';
        mockDoc.getElementById('firstLoginConfirmPin').value = '7183';
        mockDoc.getElementById('firstLoginPinError').style.display = 'none';

        await ctx.submitFirstLoginPin();
        assert.strictEqual(mockDoc.getElementById('firstLoginPinError').style.display, 'flex');
        assert.ok(mockDoc.getElementById('firstLoginPinErrorText').textContent.includes('already assigned to another staff member'));
        assert.strictEqual(newStaff.mustChangePin, true);
    });

    await it('ADV-OTP-08: REPLAY ATTACK BLOCKED: After successful PIN configuration, original OTP is wiped and strictly rejected', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        
        const initialOtp = '5829';
        const otpSalt = ctx.generatePinSalt();
        const otpHash = await ctx.hashPin(initialOtp, otpSalt);

        const staff = {
            id: 201,
            name: 'Rohit Server',
            role: 'Floor Server',
            pin_salt: otpSalt,
            pin_hash: otpHash,
            initialOtp: initialOtp,
            otpHash: otpHash,
            mustChangePin: true,
            otpConsumed: false
        };
        ctx.staffList = [staff];

        // Step 1: User verifies initial OTP successfully
        const otpMatch = await ctx.verifyStaffPin(staff, initialOtp);
        assert.strictEqual(otpMatch, true, 'Initial OTP must verify before change');

        // Step 2: User sets strong private PIN (9482)
        ctx.openFirstLoginPinModal(staff);
        mockDoc.getElementById('firstLoginNewPin').value = '9482';
        mockDoc.getElementById('firstLoginConfirmPin').value = '9482';
        mockDoc.getElementById('firstLoginPinModal').style.display = 'flex';

        await ctx.submitFirstLoginPin();

        // Step 3: Verify staff record has transitioned
        assert.strictEqual(staff.mustChangePin, false, 'mustChangePin must be false');
        assert.strictEqual(staff.otpConsumed, true, 'otpConsumed must be true');
        assert.strictEqual(staff.initialOtp, undefined, 'initialOtp must be deleted');
        assert.strictEqual(staff.otpHash, null, 'otpHash must be null');
        assert.strictEqual(staff.pin, undefined, 'Plaintext PIN must be undefined');
        assert.strictEqual(mockDoc.getElementById('firstLoginPinModal').style.display, 'none');

        // Step 4: Verify new private PIN authenticates
        const privatePinMatch = await ctx.verifyStaffPin(staff, '9482');
        assert.strictEqual(privatePinMatch, true, 'New private PIN must verify successfully');

        // Step 5: REPLAY ATTACK — Attempting to authenticate using the old temporary OTP (5829) MUST FAIL
        const replayAttempt = await ctx.verifyStaffPin(staff, initialOtp);
        assert.strictEqual(replayAttempt, false, 'REPLAY ATTACK MUST FAIL: Old OTP 5829 cannot authenticate!');

        // Step 6: Verify in cloud-sync.js confirmStaffProfilePin() flow
        ctx.onStaffProfileSelected(staff.id, staff.name, staff.role);
        mockDoc.getElementById('staffGatewayPinInput').value = initialOtp; // entered old OTP
        await ctx.confirmStaffProfilePin();
        assert.ok(ctx.toasts.some(t => t.msg.includes('Incorrect PIN / OTP')),
            'Replay attack in cloud-sync gateway must trigger Incorrect PIN toast');
    });

    // =========================================================================
    // GROUP 3: ERADICATION OF 1234 BACKDOOR & CANONICAL SALTED SHA-256
    // =========================================================================
    console.log('\n📍 GROUP 3: ERADICATION OF 1234 BACKDOOR & CANONICAL SALTED SHA-256');

    await it('ADV-CRYPTO-01: Backdoor "1234" is completely eradicated in confirmStaffProfilePin() for non-admin staff', async () => {
        const { ctx, mockDoc, toasts } = createPosSandbox();
        
        // Staff member with unique PIN 7391
        const salt = ctx.generatePinSalt();
        const hash = await ctx.hashPin('7391', salt);
        const staff = {
            id: 301,
            name: 'Kavita Cashier',
            role: 'Cashier',
            pin_salt: salt,
            pin_hash: hash,
            pinSalt: salt,
            pinHash: hash,
            mustChangePin: false,
            otpConsumed: true
        };
        ctx.staffList = [staff];
        ctx.onStaffProfileSelected(staff.id, staff.name, staff.role);

        // Adversary attempts backdoor "1234"
        mockDoc.getElementById('staffGatewayPinInput').value = '1234';
        toasts.length = 0;
        await ctx.confirmStaffProfilePin();

        assert.ok(toasts.some(t => t.msg.includes('Incorrect PIN / OTP')), 'Backdoor 1234 must be denied');
        assert.strictEqual(ctx.currentStaff, null, 'Session must not be activated with 1234');
    });

    await it('ADV-CRYPTO-02: verifyStaffPin() rejects raw unsalted SHA-256 and MD5 hashes', async () => {
        const { ctx } = createPosSandbox();
        
        const salt = ctx.generatePinSalt();
        const pin = '4821';
        const canonicalHash = await ctx.hashPin(pin, salt);
        const staff = { id: 302, role: 'Cashier', pin_salt: salt, pin_hash: canonicalHash };

        // Attacker passes unsalted SHA-256
        const unsaltedSha256 = crypto.createHash('sha256').update(pin).digest('hex');
        assert.strictEqual(await ctx.verifyStaffPin(staff, unsaltedSha256), false);

        // Attacker passes MD5
        const md5Hash = crypto.createHash('md5').update(pin).digest('hex');
        assert.strictEqual(await ctx.verifyStaffPin(staff, md5Hash), false);

        // Attacker passes random string
        assert.strictEqual(await ctx.verifyStaffPin(staff, 'null'), false);
        assert.strictEqual(await ctx.verifyStaffPin(staff, 'undefined'), false);
    });

    await it('ADV-CRYPTO-03: Canonical salted SHA-256 matches native crypto reference oracle across 50 random PINs & salts', async () => {
        const { ctx } = createPosSandbox();
        
        for (let i = 0; i < 50; i++) {
            const pin = String(1000 + Math.floor(Math.random() * 9000));
            const salt = ctx.generatePinSalt();
            
            const computed = await ctx.hashPin(pin, salt);
            const expected = referenceHash(pin, salt);
            
            assert.strictEqual(computed, expected, `Mismatch for pin=${pin}, salt=${salt}`);
            assert.strictEqual(computed.length, 64, 'SHA-256 hex digest must be 64 characters');
        }
    });

    await it('ADV-CRYPTO-04: Salt isolation — same PIN with 20 distinct salts yields 20 distinct hashes', async () => {
        const { ctx } = createPosSandbox();
        const pin = '5566';
        const hashes = new Set();
        
        for (let i = 0; i < 20; i++) {
            const salt = ctx.generatePinSalt();
            const h = await ctx.hashPin(pin, salt);
            hashes.add(h);
        }
        assert.strictEqual(hashes.size, 20, 'All 20 hashes must be unique (rainbow table resistance)');
    });

    // =========================================================================
    // GROUP 4: FLOOR SERVER SETTINGS RESTRICTIONS & MODAL ESCAPE HARDENING
    // =========================================================================
    console.log('\n📍 GROUP 4: FLOOR SERVER SETTINGS RESTRICTIONS & MODAL ESCAPE HARDENING');

    await it('ADV-RBAC-01: canStaffAccessTab() grants Floor Server access to tables, pos, settings, and strictly forbids other tabs', async () => {
        const { ctx } = createPosSandbox();
        
        const floorRoles = ['Floor Server', 'floor_server', 'server', 'waiter', 'waiters'];
        for (const r of floorRoles) {
            const staff = { role: r };
            // Permitted
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'settings'), true, `${r} must access settings`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'tables'), true, `${r} must access tables`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'pos'), true, `${r} must access pos`);

            // Forbidden
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'dashboard'), false, `${r} must NOT access dashboard`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'reports'), false, `${r} must NOT access reports`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'staff'), false, `${r} must NOT access staff`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'inventory'), false, `${r} must NOT access inventory`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'devices'), false, `${r} must NOT access devices`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'whatsapp'), false, `${r} must NOT access whatsapp`);
            assert.strictEqual(ctx.canStaffAccessTab(staff, 'kds'), false, `${r} must NOT access kds`);
        }
    });

    await it('ADV-RBAC-02: applySettingsRoleRestrictions() shields all non-printer tiles and header cards for Floor Server', async () => {
        const { ctx, mockDoc, MockElement } = createPosSandbox();
        ctx.currentStaff = { role: 'Floor Server' };

        // Construct simulated settings DOM
        const settingsView = new MockElement('settings');
        
        const profileHeader = new MockElement('profileHeader');
        profileHeader.classList.add('settings-profile-header-card');
        const profileBtn = new MockElement('profileBtn', 'button');
        profileHeader.appendChild(profileBtn);
        settingsView.appendChild(profileHeader);

        const subCrown = new MockElement('subCrown');
        subCrown.classList.add('subscription-crown-card');
        settingsView.appendChild(subCrown);

        const tilesGrid = new MockElement('tilesGrid');
        tilesGrid.classList.add('settings-tiles-grid');
        settingsView.appendChild(tilesGrid);

        // 1 Printer Tile + 17 non-printer tiles
        const printerTile = new MockElement('settingTilePrinterConfig');
        printerTile.classList.add('setting-tile-card');
        printerTile.setAttribute('onclick', 'openPrinterSettingsModal()');
        tilesGrid.appendChild(printerTile);

        const otherTileIds = [
            'settingTileStoreProfile', 'settingTileTablesFloors', 'settingTileStaff',
            'settingTileAuthorizedDevices', 'settingTileSubscription', 'settingTileExpenses',
            'settingTileGstConfig', 'settingTilePaymentConfig', 'settingTileTableConfig',
            'settingTileDiscounts', 'settingTileCloudSync', 'settingTileClientQuota',
            'settingTileContact', 'settingTileLogout', 'settingTileActiveSessions',
            'settingTileAppUpdates', 'settingTileBackup'
        ];

        const otherTiles = otherTileIds.map(id => {
            const t = new MockElement(id);
            t.classList.add('setting-tile-card');
            tilesGrid.appendChild(t);
            return t;
        });

        // Danger card
        const dangerCard = new MockElement('dangerCard');
        dangerCard.classList.add('card');
        const clearBtn = new MockElement('clearBtn', 'button');
        clearBtn.setAttribute('onclick', 'openClearAllDataModal()');
        dangerCard.appendChild(clearBtn);
        settingsView.appendChild(dangerCard);

        // Execute role restrictions
        ctx.applySettingsRoleRestrictions();

        // Verifications
        assert.strictEqual(printerTile.style.display, 'flex', 'Printer tile must be displayed (flex)');
        assert.strictEqual(profileBtn.style.display, 'none', 'Store profile header button must be hidden');
        assert.strictEqual(subCrown.style.display, 'none', 'Subscription crown card must be hidden');
        assert.strictEqual(dangerCard.style.display, 'none', 'Reset & Clear data card must be hidden');

        for (const t of otherTiles) {
            assert.strictEqual(t.style.display, 'none', `Non-printer tile ${t.id} must be hidden (display: none)`);
        }
    });

    await it('ADV-RBAC-03: applyPrinterModalRoleRestrictions() in pos.js locks Printer 2 to Bluetooth KOT and shields Printer 1 controls', async () => {
        const { ctx, mockDoc, MockElement } = createPosSandbox();
        ctx.currentStaff = { role: 'Floor Server' };

        // Construct #printerSettingsModal
        const modal = mockDoc.getElementById('printerSettingsModal');

        const singleBanner = new MockElement('singleBanner');
        singleBanner.setAttribute('style', 'background: #fff;');
        const singleCheck = mockDoc.getElementById('cfgSinglePrinterMode');
        singleBanner.appendChild(singleCheck);
        modal.appendChild(singleBanner);

        const p1Card = new MockElement('printer1SlotCard');
        modal.appendChild(p1Card);

        const p2Card = mockDoc.getElementById('printer2SlotCard');
        p2Card.previousElementSibling = p1Card;
        modal.appendChild(p2Card);

        const p2Transport = mockDoc.getElementById('printer2Transport');
        const p2Net = mockDoc.getElementById('printer2NetworkSettings');
        const btnPair2 = mockDoc.getElementById('btnPairPrinter2');
        const btnTest2 = mockDoc.getElementById('btnTestPrinter2');

        const routingCard = new MockElement('routingCard');
        routingCard.classList.add('card');
        const defaultReceipt = mockDoc.getElementById('cfgDefaultReceiptPrinter');
        routingCard.appendChild(defaultReceipt);
        modal.appendChild(routingCard);

        // Load pos.js snippet for applyPrinterModalRoleRestrictions
        const posCode = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');
        const match = posCode.match(/function applyPrinterModalRoleRestrictions\(\)[\s\S]*?window\.applyPrinterModalRoleRestrictions = applyPrinterModalRoleRestrictions;/);
        assert.ok(match, 'Must find applyPrinterModalRoleRestrictions in js/pos.js');
        vm.runInContext(match[0], ctx);

        // Execute function
        ctx.applyPrinterModalRoleRestrictions();

        // Verifications
        assert.strictEqual(singleBanner.style.display, 'none', 'Single printer banner must be hidden');
        assert.strictEqual(p1Card.style.display, 'none', 'Printer 1 card (Receipts) must be hidden');
        assert.strictEqual(routingCard.style.display, 'none', 'Role routing card must be hidden');
        assert.strictEqual(p2Card.style.display, 'flex', 'Printer 2 card must be displayed');
        assert.strictEqual(p2Transport.value, 'BLUETOOTH', 'Printer 2 transport must be locked to BLUETOOTH');
        assert.strictEqual(p2Transport.disabled, true, 'Printer 2 transport select must be disabled');
        assert.strictEqual(p2Net.style.display, 'none', 'Printer 2 network IP settings must be hidden');
        assert.strictEqual(btnPair2.disabled, false, 'Pair Bluetooth button must be enabled');
        assert.strictEqual(btnTest2.disabled, false, 'Test Print button must be enabled');
    });

    await it('ADV-RBAC-04: MODAL ESCAPE DEFENSE: Direct JS calls to all 14 restricted modal openers are blocked by checkFloorServerModalBlock()', async () => {
        const { ctx, mockDoc, toasts } = createPosSandbox();
        ctx.currentStaff = { id: 99, name: 'Adversary Waiter', role: 'Floor Server' };

        // List of 14 restricted modal openers across settings.js and shop-auth.js
        const modalOpenerNames = [
            'openStoreProfileModal',
            'openStaffManagementModal',
            'openClientQuotaModal',
            'openSubscriptionModal',
            'openExpensesDetailModal',
            'openDiscountSettingsModal',
            'openGstConfigModal',
            'openPaymentConfigModal',
            'openTableConfigModal',
            'openCloudSyncDetailModal',
            'openClearAllDataModal',
            'openAuthorizedDevicesModal',
            'openActiveSessionsModal',
            'openTableManagementModal'
        ];

        // Also define corresponding modal element IDs
        const modalElementIds = [
            'storeProfileModal',
            'staffManagementDetailModal',
            'clientQuotaModal',
            'subscriptionDetailModal',
            'expensesDetailModal',
            'discountConfigModal',
            'gstConfigModal',
            'paymentConfigModal',
            'tableConfigModal',
            'cloudSyncDetailModal',
            'clearAllDataConfirmModal',
            'authorizedDevicesModal',
            'activeSessionsModal',
            'tableManagementModal'
        ];

        // Initialize all modals to style.display = 'none'
        for (const mid of modalElementIds) {
            mockDoc.getElementById(mid).style.display = 'none';
        }

        // Test calling each opener directly
        for (let i = 0; i < modalOpenerNames.length; i++) {
            const fnName = modalOpenerNames[i];
            const modalId = modalElementIds[i];

            assert.strictEqual(typeof ctx[fnName], 'function', `${fnName} must exist as a function`);

            toasts.length = 0;
            const modalEl = mockDoc.getElementById(modalId);
            modalEl.style.display = 'none';

            // Direct invocation bypass attempt
            await ctx[fnName]();

            // Verification: modal must NOT open, error toast must be shown
            assert.strictEqual(modalEl.style.display, 'none',
                `MODAL ESCAPE VIOLATION: ${fnName}() opened modal #${modalId} for Floor Server!`);
            assert.ok(toasts.some(t => t.msg.includes('Access restricted: Only Admin or Manager can modify this setting')),
                `Modal opener ${fnName}() must emit access restriction toast`);
        }
    });

    await it('ADV-RBAC-05: When logged in as Admin, checkFloorServerModalBlock() does NOT block modal openers', async () => {
        const { ctx, mockDoc } = createPosSandbox();
        ctx.currentStaff = { id: 'admin', name: 'Store Admin', role: 'Admin' };

        assert.strictEqual(ctx.checkFloorServerModalBlock('storeProfileModal'), false,
            'checkFloorServerModalBlock must return false for Admin');

        mockDoc.getElementById('storeProfileModal').style.display = 'none';
        ctx.openStoreProfileModal();
        assert.strictEqual(mockDoc.getElementById('storeProfileModal').style.display, 'flex',
            'Admin must be able to open storeProfileModal');
    });

    // =========================================================================
    // GROUP 5: REPOSITORY INVARIANTS & INTEGRITY
    // =========================================================================
    console.log('\n📍 GROUP 5: REPOSITORY INVARIANTS & RULES PARITY');

    await it('ADV-INV-01: Exactly 26 .modal-close-btn SVGs in index.html (zero raw "✕")', async () => {
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        
        const closeBtnMatches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        assert.strictEqual(closeBtnMatches.length, 26, `Must have exactly 26 .modal-close-btn elements, found ${closeBtnMatches.length}`);

        // Verify each close button contains SVG and no raw '✕'
        const regex = /<button[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/g;
        let match;
        let count = 0;
        while ((match = regex.exec(html)) !== null) {
            count++;
            const inner = match[1];
            assert.ok(inner.includes('<svg') || inner.includes('<use'), `Button ${count} must contain SVG icon`);
            assert.ok(!inner.includes('✕') && !inner.includes('&#10005;') && !inner.includes('&times;'),
                `Button ${count} must not contain raw X character`);
        }
        assert.strictEqual(count, 26, 'Must match exactly 26 regex buttons');
    });

    await it('ADV-INV-02: Strictly 0 raw Unicode emojis inside <button> elements in index.html', async () => {
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        
        const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/g;
        // Emoji regex matching Unicode emojis
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u;

        let match;
        let emojiCount = 0;
        const offending = [];

        while ((match = buttonRegex.exec(html)) !== null) {
            const btnContent = match[1];
            if (emojiRegex.test(btnContent)) {
                emojiCount++;
                offending.push(match[0].slice(0, 80));
            }
        }

        assert.strictEqual(emojiCount, 0, `Found ${emojiCount} buttons containing raw emojis: ${offending.join(', ')}`);
    });

    await it('ADV-INV-03: firestore.rules and database/firestore.rules maintain 100% bit-for-bit parity', async () => {
        const r1 = fs.readFileSync(path.join(__dirname, '../firestore.rules'));
        const r2 = fs.readFileSync(path.join(__dirname, '../database/firestore.rules'));

        assert.strictEqual(r1.length, r2.length, 'Files must have identical byte lengths');
        assert.strictEqual(Buffer.compare(r1, r2), 0, 'Buffer.compare must return 0 (identical bytes)');

        const hash1 = crypto.createHash('sha256').update(r1).digest('hex');
        const hash2 = crypto.createHash('sha256').update(r2).digest('hex');
        assert.strictEqual(hash1, hash2, 'SHA-256 hashes must match bit-for-bit');
    });

    await it('ADV-INV-04: Currency formatting strictly preserves non-breaking space "₹ "', async () => {
        const posJs = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');
        assert.ok(posJs.includes("₹ "), "pos.js must preserve non-breaking currency string '₹ '");
    });

    // =========================================================================
    // FINAL SCORECARD
    // =========================================================================
    console.log('\n====================================================================');
    console.log(`📊 ADVERSARIAL SCORECARD: ${passedTests} / ${totalTests} TESTS PASSED`);
    if (failedTests > 0) {
        console.log(`   ❌ ${failedTests} FAILURES DETECTED!`);
        failures.forEach(f => {
            console.log(`   - ${f.name}: ${f.error}`);
        });
        process.exit(1);
    } else {
        console.log('✨ ALL ADVERSARIAL CHALLENGES & STRESS TESTS PASSED WITH 100% GREEN STATUS!');
        console.log('====================================================================\n');
        process.exit(0);
    }
}

runAdversarialHarness().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
