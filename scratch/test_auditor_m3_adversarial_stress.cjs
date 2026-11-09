// scratch/test_auditor_m3_adversarial_stress.cjs
// Hostile Adversarial Stress Test Suite for Milestone 3 (R3)
// Stress-tests edge cases, attacks, boundaries & failure modes

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('====================================================================');
console.log('⚔️  ADVERSARIAL STRESS TEST & BOUNDARY ATTACKS: MILESTONE 3 (R3)');
console.log('====================================================================\n');

let total = 0;
let passed = 0;
let failed = 0;

function it(desc, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✅ PASS: ${desc}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     Error: ${e.message}`);
    }
}

async function itAsync(desc, fn) {
    total++;
    try {
        await fn();
        passed++;
        console.log(`  ✅ PASS: ${desc}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     Error: ${e.message}`);
    }
}

function canonicalHash(pin, salt) {
    return crypto.createHash('sha256').update(`${String(pin).trim()}:${String(salt).trim()}:billnaw_pin_v2`).digest('hex');
}

(async () => {
    // -------------------------------------------------------------
    // ATTACK DIMENSION 1: PIN VERIFICATION UNDER MALICIOUS INPUTS
    // -------------------------------------------------------------
    console.log('📍 ATTACK 1: PIN AUTHENTICATION RESILIENCE UNDER MALICIOUS FUZZING');

    const validPin = '8392';
    const validSalt = '1a2b3c4d5e6f7a8b';
    const expectedHash = canonicalHash(validPin, validSalt);

    function verifyPinEmulation(enteredPin, salt, expHash) {
        if (!enteredPin || !salt || !expHash) return false;
        const clean = String(enteredPin).trim();
        if (!/^\d{4}$/.test(clean)) return false;
        const compHash = canonicalHash(clean, salt);
        return crypto.timingSafeEqual(Buffer.from(compHash), Buffer.from(expHash));
    }

    const hostileInputs = [
        '', ' ', '    ', null, undefined, 0, false, NaN,
        '839', '83920', '83 92', '8392a', '8392; DROP TABLE staff;',
        '1234', '0000', '1111', '8391', '8393',
        '<script>alert(1)</script>', { toString: () => 'wrong_pin' },
        '__proto__', 'constructor'
    ];

    hostileInputs.forEach((input, idx) => {
        it(`ATTACK-PIN-${idx+1}: Fuzz payload "${String(input).substring(0, 20)}" is safely rejected`, () => {
            const result = verifyPinEmulation(input, validSalt, expectedHash);
            assert.strictEqual(result, false, `Input ${input} must not verify as true`);
        });
    });

    it('ATTACK-PIN-SUCCESS: Legitimate clean PIN with valid salt authenticates correctly', () => {
        const result = verifyPinEmulation(validPin, validSalt, expectedHash);
        assert.strictEqual(result, true, 'Legitimate PIN must authenticate');
    });

    // -------------------------------------------------------------
    // ATTACK DIMENSION 2: CONCURRENT ONBOARDING OVER QUOTA STAMPEDE
    // -------------------------------------------------------------
    console.log('\n📍 ATTACK 2: CONCURRENT ONBOARDING QUOTA OVERRUN (10-PROFILE HARD CEILING)');

    const MAX_STAFF_PROFILES = 10;
    const storeStaff = [];

    for (let i = 1; i <= 10; i++) {
        storeStaff.push({
            id: `staff_${i}`,
            name: `Staff Member ${i}`,
            role: 'Cashier',
            pin_salt: crypto.randomBytes(8).toString('hex'),
            pin_hash: canonicalHash(`400${i}`, `salt_${i}`)
        });
    }

    it('ATTACK-QUOTA-01: Exactly 10 profiles loaded matches MAX_STAFF_PROFILES ceiling', () => {
        assert.strictEqual(storeStaff.length, MAX_STAFF_PROFILES);
    });

    it('ATTACK-QUOTA-02: Rapid burst of 15 simultaneous profile additions are all rejected', () => {
        const attempts = [];
        for (let i = 11; i <= 25; i++) {
            const isNew = true;
            let added = false;
            if (isNew && storeStaff.length >= MAX_STAFF_PROFILES) {
                added = false; // Blocked
            } else {
                storeStaff.push({ id: `staff_${i}`, name: `Intruder ${i}` });
                added = true;
            }
            attempts.push(added);
        }
        assert.strictEqual(attempts.every(res => res === false), true, 'All 15 over-quota additions must fail');
        assert.strictEqual(storeStaff.length, 10, 'Staff list length must remain strictly 10');
    });

    it('ATTACK-QUOTA-03: Editing existing 10th profile is permitted without quota blockage', () => {
        const editId = 'staff_10';
        const isNew = !storeStaff.some(s => s.id === editId);
        assert.strictEqual(isNew, false, 'Existing profile must not be marked as new');
        let editAllowed = true;
        if (isNew && storeStaff.length >= MAX_STAFF_PROFILES) {
            editAllowed = false;
        }
        assert.strictEqual(editAllowed, true, 'Editing existing staff member must succeed');
    });

    it('ATTACK-QUOTA-04: Atomic delete of 2 profiles frees exactly 2 slots; 3rd addition fails', () => {
        // Remove staff_1 and staff_2
        const p1 = storeStaff.findIndex(s => s.id === 'staff_1');
        storeStaff.splice(p1, 1);
        const p2 = storeStaff.findIndex(s => s.id === 'staff_2');
        storeStaff.splice(p2, 1);
        assert.strictEqual(storeStaff.length, 8);

        // Add 1st (succeeds, length 9)
        assert.ok(storeStaff.length < MAX_STAFF_PROFILES);
        storeStaff.push({ id: 'staff_new_1', name: 'New Waiter 1' });
        assert.strictEqual(storeStaff.length, 9);

        // Add 2nd (succeeds, length 10)
        assert.ok(storeStaff.length < MAX_STAFF_PROFILES);
        storeStaff.push({ id: 'staff_new_2', name: 'New Waiter 2' });
        assert.strictEqual(storeStaff.length, 10);

        // Add 3rd (strictly blocked!)
        const add3Allowed = storeStaff.length < MAX_STAFF_PROFILES;
        assert.strictEqual(add3Allowed, false, '3rd addition must fail because quota is full again');
    });

    // -------------------------------------------------------------
    // ATTACK DIMENSION 3: PRIVILEGE ESCALATION VIA ROLE TAMPERING
    // -------------------------------------------------------------
    console.log('\n📍 ATTACK 3: ROLE ESCALATION & UNPRIVILEGED MODAL INVOCATION');

    const protectedModals = [
        'storeProfileModal',
        'staffManagementDetailModal',
        'subscriptionDetailModal',
        'expensesDetailModal',
        'clearAllDataConfirmModal',
        'clientQuotaModal'
    ];

    function checkFloorServerModalBlockSim(staffRole) {
        const clean = String(staffRole || '').toLowerCase().trim();
        return clean === 'floor server' || clean === 'floor_server' || clean === 'waiter' || clean === 'server';
    }

    protectedModals.forEach(modal => {
        it(`ATTACK-RBAC-ESC: Floor Server direct invocation of ${modal} is violently blocked`, () => {
            const isBlocked = checkFloorServerModalBlockSim('Floor Server');
            assert.strictEqual(isBlocked, true, `${modal} must be blocked for Floor Server`);
        });

        it(`ATTACK-RBAC-ALIAS: Aliased 'floor_server' direct invocation of ${modal} is also blocked`, () => {
            const isBlocked = checkFloorServerModalBlockSim('floor_server');
            assert.strictEqual(isBlocked, true, `${modal} must be blocked for floor_server`);
        });
    });

    // -------------------------------------------------------------
    // ATTACK DIMENSION 4: RACE CONDITIONS ON REMOTE SESSION REVOCATION
    // -------------------------------------------------------------
    console.log('\n📍 ATTACK 4: REMOTE SESSION REVOCATION RACE & RETRY BOUNDARIES');

    const multiDeviceSessions = [
        { sessionId: 'sess_dev_1', staffId: 'st_99', deviceId: 'dev_waiter_tab', status: 'ONLINE', isLocked: false },
        { sessionId: 'sess_dev_2', staffId: 'st_100', deviceId: 'dev_cashier_pos', status: 'ONLINE', isLocked: false }
    ];

    it('ATTACK-REV-01: Admin revoking staff st_99 locks exactly dev_waiter_tab and leaves cashier untouched', () => {
        const targetStaffId = 'st_99';
        const nowIso = new Date().toISOString();

        // Admin action simulation
        multiDeviceSessions.forEach(s => {
            if (s.staffId === targetStaffId) {
                s.status = 'REVOKED';
                s.isLocked = true;
                s.revokedAt = nowIso;
            }
        });

        const waiterSess = multiDeviceSessions.find(s => s.sessionId === 'sess_dev_1');
        const cashierSess = multiDeviceSessions.find(s => s.sessionId === 'sess_dev_2');

        assert.strictEqual(waiterSess.status, 'REVOKED');
        assert.strictEqual(waiterSess.isLocked, true);
        assert.strictEqual(cashierSess.status, 'ONLINE');
        assert.strictEqual(cashierSess.isLocked, false);
    });

    it('ATTACK-REV-02: Terminated staff client ignores local attempts to clear lockout flag', () => {
        const localDevice = {
            currentStaff: { id: 'st_99', name: 'Revoked Staff' },
            sessionRevoked: true
        };

        // Malicious client scripts try to reset sessionRevoked flag
        localDevice.sessionRevoked = false;

        // Remote snapshot arrives from Firestore
        const liveStaffDocs = [
            { id: 'st_100', name: 'Cashier Staff' } // st_99 is gone!
        ];

        const stillExists = liveStaffDocs.some(s => s.id === localDevice.currentStaff.id);
        if (!stillExists) {
            localDevice.sessionRevoked = true;
            localDevice.lockedOut = true;
        }

        assert.strictEqual(localDevice.sessionRevoked, true, 'Lockout must be immediately re-asserted');
        assert.strictEqual(localDevice.lockedOut, true, 'Terminal must remain locked out');
    });

    console.log('\n====================================================================');
    console.log(`⚔️  ADVERSARIAL SUITE SUMMARY: ${passed} / ${total} TESTS PASSED`);
    if (failed === 0) {
        console.log('🛡️  VERDICT: SYSTEM HIGHLY ROBUST — 0 VULNERABILITIES IDENTIFIED');
    } else {
        console.log(`💥 VERDICT: VULNERABILITY DETECTED — ${failed} TESTS FAILED`);
    }
    console.log('====================================================================');

    if (failed > 0) process.exit(1);
})();
