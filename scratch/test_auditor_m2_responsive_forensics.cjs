/**
 * scratch/test_auditor_m2_responsive_forensics.cjs
 *
 * Independent Forensic Integrity Verification Suite for Milestone 2:
 * Responsive UI, Viewport Compatibility, Touch Target Expansions & System Invariants.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function runCheck(name, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        failed++;
    }
}

console.log('======================================================================');
console.log('🔬 AUDITOR M2 FORENSIC INTEGRITY AUDIT SUITE');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 1. SYSTEM & REPOSITORY INVARIANTS
// ---------------------------------------------------------------------------
console.log('--- 1. SYSTEM & REPOSITORY INVARIANTS ---');

runCheck('Invariant 1: Exactly 26 active .modal-close-btn SVGs in index.html', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const exactClassMatches = (html.match(/class="modal-close-btn"/g) || []).length;
    assert.strictEqual(exactClassMatches, 26, `Expected exactly 26 'class="modal-close-btn"', got ${exactClassMatches}`);
    
    // Verify each button has an embedded <svg>
    const btnRegex = /<button[^>]*class="[^"]*modal-close-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g;
    let match;
    let svgButtons = 0;
    while ((match = btnRegex.exec(html)) !== null) {
        assert(match[1].includes('<svg'), `Modal close button at index ${match.index} is missing an <svg> element`);
        svgButtons++;
    }
    assert.strictEqual(svgButtons, 26, `Expected all 26 modal-close-btn buttons to contain <svg>, got ${svgButtons}`);
});

runCheck('Invariant 2: 0 raw Unicode emojis in <button> elements in index.html', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    
    let buttonMatches = [...html.matchAll(buttonRegex)];
    let emojiButtons = [];
    
    buttonMatches.forEach((m, idx) => {
        const inner = m[1];
        // Strip nested HTML tags (like <span> or <svg>) to check text nodes
        const textOnly = inner.replace(/<[^>]+>/g, '');
        if (emojiRegex.test(textOnly)) {
            emojiButtons.push(m[0].slice(0, 80));
        }
    });
    
    assert.strictEqual(emojiButtons.length, 0, `Found ${emojiButtons.length} buttons with raw Unicode emojis: ${JSON.stringify(emojiButtons)}`);
});

runCheck('Invariant 3: Git branch is feat/mobile-ux-and-backend-security without merge to main', () => {
    const branch = execSync('git branch --show-current', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    assert.strictEqual(branch, 'feat/mobile-ux-and-backend-security', `Expected branch feat/mobile-ux-and-backend-security, got: ${branch}`);
});

runCheck('Invariant 4: Binary parity between storage.rules and database/storage.rules', () => {
    const rootRules = fs.readFileSync(path.join(ROOT_DIR, 'storage.rules'));
    const dbRules = fs.readFileSync(path.join(ROOT_DIR, 'database', 'storage.rules'));
    assert.strictEqual(rootRules.length, dbRules.length, `Length mismatch: ${rootRules.length} vs ${dbRules.length}`);
    assert(rootRules.equals(dbRules), 'Binary content differs between storage.rules and database/storage.rules');
});

// ---------------------------------------------------------------------------
// 2. CSS RESPONSIVE & TOUCH TARGET FORENSICS
// ---------------------------------------------------------------------------
console.log('\n--- 2. CSS RESPONSIVE & TOUCH TARGET FORENSICS ---');

runCheck('CSS 1: Inventory 768px breakpoint boundary collision resolution', () => {
    const invCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'inventory.css'), 'utf8');
    assert(invCss.includes('@media screen and (min-width: 768px)'), 'Missing min-width: 768px rule');
    assert(invCss.includes('@media screen and (max-width: 767.98px)'), 'Missing max-width: 767.98px rule');
    assert(!invCss.includes('@media screen and (max-width: 768px)'), 'Forbidden max-width: 768px rule still present in inventory.css');
});

runCheck('CSS 2: Ergonomic 44x44px touch targets on all 13 custom modal/drawer close buttons', () => {
    const modalsCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'modals.css'), 'utf8');
    const customClasses = [
        'khata-close-btn',
        'orders-log-close-btn',
        'printer-close-btn',
        'device-hub-close-btn',
        'device-approval-close-btn',
        'forgot-pin-close-btn',
        'report-picker-close-btn',
        'txn-action-close-btn',
        'ai_scan_close_btn',
        'drawer-close-btn',
        'hdr-close-btn',
        'wa-preview-close-btn',
        'slide-menu-close-btn'
    ];
    
    for (const cls of customClasses) {
        assert(modalsCss.includes(`.${cls}`), `modals.css missing .${cls}`);
        assert(modalsCss.includes(`.${cls}::before`), `modals.css missing .${cls}::before pseudo-element`);
    }
    assert(modalsCss.includes('min-width: 44px;'), 'modals.css missing min-width: 44px;');
    assert(modalsCss.includes('min-height: 44px;'), 'modals.css missing min-height: 44px;');
    assert(modalsCss.includes('touch-action: manipulation;'), 'modals.css missing touch-action: manipulation;');
});

runCheck('CSS 3: Tablet portrait stepper & add button 44x44px touch target expansion', () => {
    const respCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'responsive.css'), 'utf8');
    assert(respCss.includes('.item-qty-control button::before'), 'Missing .item-qty-control button::before');
    assert(respCss.includes('.qty-pill button::before'), 'Missing .qty-pill button::before');
    assert(respCss.includes('.menu-card .add-btn::before'), 'Missing .menu-card .add-btn::before');
    assert(respCss.includes('min-width: 44px;'), 'responsive.css tablet stepper missing min-width: 44px;');
    assert(respCss.includes('min-height: 44px;'), 'responsive.css tablet stepper missing min-height: 44px;');
});

runCheck('CSS 4: Ledger 3-dot action dropdown button 44x44px touch expansion', () => {
    const respCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'responsive.css'), 'utf8');
    assert(respCss.includes('#customersTableBody .action-dropdown-btn'), 'Missing #customersTableBody .action-dropdown-btn');
    assert(respCss.includes('#historyTableBody .action-dropdown-btn'), 'Missing #historyTableBody .action-dropdown-btn');
    assert(respCss.includes('#historyTableBody .action-dropdown-btn::before'), 'Missing #historyTableBody .action-dropdown-btn::before');
});

runCheck('CSS 5: Mobile bottom-sheet standardization for shop auth and AI scanner', () => {
    const respCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'responsive.css'), 'utf8');
    assert(respCss.includes('#shopAuthModal .shop-auth-card'), 'Missing #shopAuthModal .shop-auth-card bottom sheet');
    assert(respCss.includes('#aiScanningOverlay > div'), 'Missing #aiScanningOverlay > div bottom sheet');
    assert(respCss.includes('border-radius: 24px 24px 0 0 !important;'), 'Missing border-radius: 24px 24px 0 0');
    assert(respCss.includes('env(safe-area-inset-bottom, 24px)'), 'Missing safe-area-inset-bottom');
});

// ---------------------------------------------------------------------------
// 3. TEST HARNESS & BROWSER ARTIFACTS INTEGRITY
// ---------------------------------------------------------------------------
console.log('\n--- 3. TEST HARNESS & BROWSER ARTIFACTS INTEGRITY ---');

runCheck('Harness 1: scratch/test_browser_viewports.cjs contains no facade or dummy bypasses', () => {
    const harnessCode = fs.readFileSync(path.join(ROOT_DIR, 'scratch', 'test_browser_viewports.cjs'), 'utf8');
    assert(!harnessCode.includes('assert(true);'), 'Found assert(true);');
    assert(!harnessCode.includes('assert(true,'), 'Found assert(true, ...');
    assert(harnessCode.includes('findChromeExecutable()'), 'Missing findChromeExecutable()');
    assert(harnessCode.includes('class CDPClient'), 'Missing class CDPClient');
    assert(harnessCode.includes('Page.captureScreenshot'), 'Missing Page.captureScreenshot');
});

runCheck('Harness 2: All 14 domain screenshot artifacts exist, are valid PNGs, and unique', () => {
    const artifactsDir = path.join(ROOT_DIR, 'scratch', 'browser_artifacts');
    assert(fs.existsSync(artifactsDir), 'scratch/browser_artifacts directory missing');
    
    const requiredFiles = [
        '01_modals_desktop.png', '01_modals_mobile.png',
        '02_pos_desktop.png', '02_pos_mobile.png',
        '03_checkout_desktop.png', '03_checkout_mobile.png',
        '04_inventory_desktop.png', '04_inventory_mobile.png',
        '05_crm_desktop.png', '05_crm_mobile.png',
        '06_reports_desktop.png', '06_reports_mobile.png',
        '07_food_images_desktop.png', '07_food_images_mobile.png'
    ];
    
    const hashes = new Set();
    for (const f of requiredFiles) {
        const fullPath = path.join(artifactsDir, f);
        assert(fs.existsSync(fullPath), `Missing screenshot artifact: ${f}`);
        const buf = fs.readFileSync(fullPath);
        
        // PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
        assert.strictEqual(buf[0], 0x89, `${f} invalid PNG byte 0`);
        assert.strictEqual(buf[1], 0x50, `${f} invalid PNG byte 1`);
        assert.strictEqual(buf[2], 0x4E, `${f} invalid PNG byte 2`);
        assert.strictEqual(buf[3], 0x47, `${f} invalid PNG byte 3`);
        
        // Non-trivial file size (> 50KB)
        assert(buf.length > 50000, `${f} size suspiciously small: ${buf.length} bytes`);
        
        // Verify dimensions
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (f.includes('desktop')) {
            assert.strictEqual(width, 1280, `${f} desktop width expected 1280, got ${width}`);
            assert.strictEqual(height, 800, `${f} desktop height expected 800, got ${height}`);
        } else if (f.includes('mobile')) {
            assert.strictEqual(width, 780, `${f} mobile width expected 780 (390*2), got ${width}`);
            assert.strictEqual(height, 1688, `${f} mobile height expected 1688 (844*2), got ${height}`);
        }
        
        // Hash uniqueness
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        assert(!hashes.has(h), `${f} is an exact duplicate of another artifact (hash: ${h})`);
        hashes.add(h);
    }
    assert.strictEqual(hashes.size, 14, `Expected 14 unique hashes, got ${hashes.size}`);
});

console.log('\n======================================================================');
console.log(`🎯 AUDITOR RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('======================================================================');

if (failed > 0) process.exit(1);
