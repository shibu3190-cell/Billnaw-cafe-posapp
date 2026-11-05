/**
 * scratch/test_adversarial_gate2_empirical.cjs
 * ============================================================================
 * EMPIRICAL ADVERSARIAL STRESS HARNESS — FINAL GATE 2
 * Author: challenger_final_gate_2 (Empirical Invariants & CDP Challenger)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================================');
console.log('⚔️  EMPIRICAL ADVERSARIAL STRESS TEST: FINAL GATE 2');
console.log('====================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failureDetails = [];

function check(title, testFn) {
    totalChecks++;
    try {
        testFn();
        console.log(`  ✅ PASS: ${title}`);
        passedChecks++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${title}`);
        console.error(`     Error: ${err.message}`);
        failedChecks++;
        failureDetails.push({ title, error: err.message, stack: err.stack });
    }
}

const htmlPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(htmlPath, 'utf8');

// ============================================================================
// 1. ADVERSARIAL REGEX SCANS FOR EMOJIS IN OPERATIONAL CONTROLS
// ============================================================================
console.log('📍 SECTION 1: ADVERSARIAL EMOJI SCANS IN OPERATIONAL CONTROLS');

check('Zero raw Unicode emojis in <button> elements', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const cleanHtml = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
    
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    const violations = [];
    while ((match = buttonRegex.exec(cleanHtml)) !== null) {
        const fullBtn = match[0];
        const stripped = match[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
        if (emojiRegex.test(stripped)) {
            violations.push({ button: fullBtn.slice(0, 100), content: stripped });
        }
    }
    assert.strictEqual(violations.length, 0, `Found ${violations.length} <button> elements with raw emojis: ${JSON.stringify(violations, null, 2)}`);
});

check('Zero raw Unicode emojis in operational <tab>, nav tabs, and segmented controls', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const cleanHtml = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
    
    // Operational tab/pill controls: buttons or elements with onclick/role="tab" and class containing tab/pill/segmented
    const controlRegex = /<(?:button|[a-z0-9]+)\b[^>]*?(?:onclick|role=["']tab["'])[^>]*?class=["'][^"']*(?:tab|pill|segmented)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|[a-z0-9]+)>/gi;
    let match;
    const violations = [];
    while ((match = controlRegex.exec(cleanHtml)) !== null) {
        const fullElem = match[0];
        const stripped = match[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
        if (emojiRegex.test(stripped)) {
            violations.push({ elem: fullElem.slice(0, 100), content: stripped });
        }
    }
    assert.strictEqual(violations.length, 0, `Found ${violations.length} operational tab/pill controls with raw emojis: ${JSON.stringify(violations, null, 2)}`);
});

// ============================================================================
// 2. ADVERSARIAL REGEX SCANS FOR CURRENCY FORMATTING
// ============================================================================
console.log('\n📍 SECTION 2: ADVERSARIAL CURRENCY FORMATTING SCANS');

check('Zero raw currency formatting without space (/₹[0-9]/)', () => {
    const bareRupeeMatches = indexHtml.match(/₹[0-9]/g) || [];
    assert.strictEqual(bareRupeeMatches.length, 0, `Found ${bareRupeeMatches.length} raw /₹[0-9]/ currency violations!`);
});

check('Preserved non-breaking currency spacing (/₹\\s+/ or ₹&nbsp;) exists throughout index.html', () => {
    const spacedRupeeMatches = indexHtml.match(/₹(?:\s|&nbsp;|&#160;)/g) || [];
    assert.ok(spacedRupeeMatches.length >= 30, `Expected at least 30 non-breaking spaced Rupee instances, found ${spacedRupeeMatches.length}`);
});

// ============================================================================
// 3. EXACT COUNT AND STRUCTURE OF .modal-close-btn SVG ELEMENTS
// ============================================================================
console.log('\n📍 SECTION 3: .modal-close-btn EXACT COUNT & VERBATIM STRUCTURE');

check('Total count of .modal-close-btn elements in index.html is strictly 26', () => {
    const rawMatches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(rawMatches.length, 26, `Expected strictly 26 .modal-close-btn instances, found ${rawMatches.length}`);
});

check('All 26 .modal-close-btn elements are formatted as single-line and contain verbatim child SVG', () => {
    const closeBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/g;
    let match;
    let count = 0;
    while ((match = closeBtnRegex.exec(indexHtml)) !== null) {
        count++;
        const fullBtn = match[0];
        const innerContent = match[1];
        
        // Check single-line structure (no newline inside button element)
        assert.strictEqual(fullBtn.includes('\n'), false, `modal-close-btn #${count} spans multiple lines: ${fullBtn.slice(0, 80)}`);
        
        // Check contains valid SVG child
        assert.ok(/<svg\b[^>]*>[\s\S]*?<\/svg>/.test(innerContent), `modal-close-btn #${count} missing child SVG: ${fullBtn}`);
        
        // Check zero raw "✕" text
        assert.strictEqual(innerContent.includes('✕'), false, `modal-close-btn #${count} contains raw "✕" character: ${fullBtn}`);
    }
    assert.strictEqual(count, 26, `Scanned ${count} modal-close-btn elements (expected 26)`);
});

// ============================================================================
// 4. ANTI-COLLISION GUARDRAIL: DEDICATED CLOSE BUTTONS
// ============================================================================
console.log('\n📍 SECTION 4: ANTI-COLLISION GUARDRAIL ON DEDICATED CLOSE BUTTONS');

check('Dedicated close buttons have ZERO .modal-close-btn class contamination', () => {
    const allButtonsRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let bMatch;
    const dedicatedCloseButtons = [];
    
    while ((bMatch = allButtonsRegex.exec(indexHtml)) !== null) {
        const attrs = bMatch[1];
        const classMatch = attrs.match(/class=["']([^"']*)["']/i);
        const classStr = classMatch ? classMatch[1] : '';
        const onclickMatch = attrs.match(/onclick=["']([^"']*)["']/i);
        const onclickStr = onclickMatch ? onclickMatch[1] : '';
        const idMatch = attrs.match(/id=["']([^"']*)["']/i);
        const idStr = idMatch ? idMatch[1] : '';
        
        if (classStr.includes('close') || onclickStr.toLowerCase().includes('close') || idStr.toLowerCase().includes('close')) {
            if (!classStr.includes('modal-close-btn')) {
                dedicatedCloseButtons.push({ id: idStr, class: classStr, onclick: onclickStr });
            } else {
                const dedicatedClasses = [
                    'shop-auth-close-btn', 'device-hub-close-btn', 'session-close-btn',
                    'auth-close-btn', 'pairing-close-btn', 'revoked-close-btn', 'rtr_close_btn'
                ];
                for (const dc of dedicatedClasses) {
                    assert.strictEqual(classStr.includes(dc), false, `Collision! Button has both modal-close-btn and ${dc}: ${attrs}`);
                }
            }
        }
    }
    
    console.log(`     Discovered ${dedicatedCloseButtons.length} dedicated close/dismiss button instances across index.html`);
    const dedicatedClassesToCheck = [
        'shop-auth-close-btn',
        'device-hub-close-btn',
        'session-close-btn',
        'rtr_close_btn'
    ];
    dedicatedClassesToCheck.forEach(dc => {
        const instances = dedicatedCloseButtons.filter(b => b.class.includes(dc));
        console.log(`     Found ${instances.length} instance(s) of .${dc}`);
        assert.ok(instances.length > 0, `Expected at least one dedicated close button with class .${dc}`);
        instances.forEach(inst => {
            assert.strictEqual(inst.class.includes('modal-close-btn'), false, `Contamination detected in .${dc}`);
        });
    });
});

// ============================================================================
// 5. TEST-DELIMITER COMMENTS VERIFICATION
// ============================================================================
console.log('\n📍 SECTION 5: VERIFICATION OF 6 TEST-DELIMITER COMMENTS');

const requiredDelimiters = [
    { name: 'shopAuthModal delimiter', str: '<!-- /#shopAuthModal -->' },
    { name: 'deviceRevokedOverlay delimiter', str: '<!-- 🚫 NON-DISMISSIBLE DEVICE REVOKED OVERLAY (ZERO .modal-close-btn) -->' },
    { name: 'firstLoginPinModal delimiter', str: '<!-- 🔐 MANDATORY FIRST-LOGIN PIN CHANGE MODAL (NON-DISMISSIBLE INTERCEPT) -->' },
    { name: 'cloudSyncDetailModal delimiter', str: '<!-- DETAIL SUB-MODAL: CLOUD SYNC & FIREBASE -->' },
    { name: 'dashboard toolbar delimiter', str: '<!-- Interactive Filters & Actions Toolbar -->' },
    { name: 'customers closing view delimiter', str: '<!-- Closing #customers view -->' }
];

requiredDelimiters.forEach(del => {
    check(`Delimiter comment intact: "${del.name}"`, () => {
        assert.ok(indexHtml.includes(del.str), `Missing delimiter comment: ${del.str}`);
    });
});

// ============================================================================
// 6. COMPATIBILITY ANCHORS VERIFICATION
// ============================================================================
console.log('\n📍 SECTION 6: VERIFICATION OF 9 COMPATIBILITY ANCHORS');

const requiredAnchors = [
    { name: 'customerLandingHub', test: () => assert.ok(indexHtml.includes('id="customerLandingHub"'), 'Missing #customerLandingHub') },
    { name: 'whatsapp', test: () => assert.ok(indexHtml.includes('id="whatsapp"'), 'Missing #whatsapp') },
    { name: 'rtr_tracker', test: () => assert.ok(indexHtml.includes('data-subtab="rtr_tracker"'), 'Missing data-subtab="rtr_tracker"') },
    { name: 'invAccordionBatching', test: () => assert.ok(indexHtml.includes('id="invAccordionBatching"'), 'Missing #invAccordionBatching') },
    { name: 'culinarySubTabContent', test: () => assert.ok(indexHtml.includes('id="culinarySubTabContent"'), 'Missing #culinarySubTabContent') },
    { name: 'inventoryDetailedSubView', test: () => assert.ok(indexHtml.includes('id="inventoryDetailedSubView"'), 'Missing #inventoryDetailedSubView') },
    { name: 'VIP Crown Symbol 👑 (data/anchor)', test: () => assert.ok(indexHtml.includes('👑'), 'Missing 👑 anchor') },
    { name: 'demoBypassContainer', test: () => assert.ok(indexHtml.includes('id="demoBypassContainer"'), 'Missing #demoBypassContainer') },
    { name: 'skipLoginBtn', test: () => assert.ok(indexHtml.includes('id="skipLoginBtn"'), 'Missing #skipLoginBtn') }
];

requiredAnchors.forEach(anchor => {
    check(`Compatibility anchor intact: "${anchor.name}"`, () => {
        anchor.test();
    });
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n====================================================================');
console.log(`🏁 EMPIRICAL ADVERSARIAL STRESS TEST COMPLETE: ${passedChecks}/${totalChecks} PASSED (${failedChecks} FAILED)`);
console.log('====================================================================\n');

if (failedChecks > 0) {
    console.error(`💥 AUDIT VERDICT: INTEGRITY FAILURE (${failedChecks} failures)`);
    process.exit(1);
} else {
    console.log('🌟 AUDIT VERDICT: 100% CLEAN — ALL OPERATIONAL INVARIANTS EMPIRICALLY CONFIRMED');
    process.exit(0);
}
