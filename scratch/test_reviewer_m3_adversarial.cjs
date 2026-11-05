const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🔍 REVIEWER ADVERSARIAL AUDIT: M3 (F9, F18, F19, F20, F21)");
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

const rootDir = path.join(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const corePath = path.join(rootDir, 'js', 'core.js');
const staffPath = path.join(rootDir, 'js', 'staff.js');
const settingsPath = path.join(rootDir, 'js', 'settings.js');
const posPath = path.join(rootDir, 'js', 'pos.js');
const cssPosPath = path.join(rootDir, 'css', 'pos.css');
const styleCssPath = path.join(rootDir, 'style.css');
const kotUiPath = path.join(rootDir, 'src', 'features', 'kot', 'kot.ui.js');
const kotServicePath = path.join(rootDir, 'src', 'features', 'kot', 'kot.service.js');
const tablesUiPath = path.join(rootDir, 'src', 'features', 'tables', 'tables.ui.js');
const tablesServicePath = path.join(rootDir, 'src', 'features', 'tables', 'tables.service.js');
const featureControllersPath = path.join(rootDir, 'js', 'feature-controllers.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const staff = fs.readFileSync(staffPath, 'utf8');
const settings = fs.readFileSync(settingsPath, 'utf8');
const pos = fs.readFileSync(posPath, 'utf8');
const cssPos = fs.readFileSync(cssPosPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');
const kotUi = fs.readFileSync(kotUiPath, 'utf8');
const kotService = fs.readFileSync(kotServicePath, 'utf8');
const featureControllers = fs.existsSync(featureControllersPath) ? fs.readFileSync(featureControllersPath, 'utf8') : '';
const tablesUi = fs.readFileSync(tablesUiPath, 'utf8');
const tablesService = fs.readFileSync(tablesServicePath, 'utf8');

// ==========================================
// 1. INVARIANT F19: EXACT 26 .modal-close-btn SVGs
// ==========================================
console.log("📍 [F19] MODAL CLOSE BUTTON INVARIANT AUDIT");

check("F19-01: Exactly 26 elements with class modal-close-btn exist in index.html", () => {
    const classMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
    assert.ok(classMatches, "No modal-close-btn found");
    assert.strictEqual(classMatches.length, 26, `Expected 26 modal-close-btn class matches, found ${classMatches.length}`);
});

check("F19-02: Every single modal-close-btn contains an inline SVG close icon", () => {
    const btnRegex = /<button\b[^>]*class=["'][^"']*\bmodal-close-btn\b[^"']*["'][^>]*>([\s\S]*?)<\/button>/g;
    let match;
    let count = 0;
    while ((match = btnRegex.exec(html)) !== null) {
        count++;
        const inner = match[1];
        assert.ok(inner.includes('<svg'), `Button #${count} lacks an SVG element: ${match[0]}`);
        assert.ok(!inner.includes('✕'), `Button #${count} contains raw '✕': ${match[0]}`);
    }
    assert.strictEqual(count, 26, `Expected 26 matched buttons, found ${count}`);
});

check("F19-03: Newly introduced M3 modals use dedicated close button classes (not modal-close-btn)", () => {
    // #authorizedDevicesModal
    assert.ok(html.includes('id="authorizedDevicesModal"'), "authorizedDevicesModal exists");
    assert.ok(html.includes('class="device-hub-close-btn"'), "device-hub-close-btn exists");
    
    // Check that neither #devicePairingOverlay nor #deviceRevokedOverlay have modal-close-btn
    const pairingOverlay = html.match(/<div\b[^>]*id="devicePairingOverlay"[\s\S]*?<\/div>\s*<\/div>/);
    if (pairingOverlay) {
        assert.ok(!pairingOverlay[0].includes('modal-close-btn'), "devicePairingOverlay should not have modal-close-btn");
    }
    const revokedOverlay = html.match(/<div\b[^>]*id="deviceRevokedOverlay"[\s\S]*?<\/div>\s*<\/div>/);
    if (revokedOverlay) {
        assert.ok(!revokedOverlay[0].includes('modal-close-btn'), "deviceRevokedOverlay should not have modal-close-btn");
    }
});

// ==========================================
// 2. INVARIANT F20: ZERO RAW UNICODE EMOJIS IN OPERATIONAL BUTTONS & TABS
// ==========================================
console.log("\n📍 [F20] ZERO RAW EMOJIS IN OPERATIONAL BUTTONS & TABS AUDIT");

check("F20-01: Zero raw Unicode emojis in operational <button> elements in index.html", () => {
    // Regex matching standard emoji ranges: Emoticons, Misc symbols, Dingbats, Transport/Map, Supplemental symbols
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    
    const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/g) || [];
    const offenders = [];
    for (const btn of buttonMatches) {
        // Strip comments and SVG content
        const cleaned = btn.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
        if (emojiRegex.test(cleaned)) {
            // Check if it's operational or demo/test/decorative
            offenders.push(btn.slice(0, 100));
        }
    }
    assert.strictEqual(offenders.length, 0, `Found ${offenders.length} buttons with raw emojis: ${JSON.stringify(offenders.slice(0, 5))}`);
});

check("F20-02: Zero raw Unicode emojis in navigation <tab> and segmented pills in index.html", () => {
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    
    // Check navigation buttons: .nav-btn, .tab-btn, .seg-btn, .segmented-btn
    const tabMatches = html.match(/<[^>]*(?:nav-btn|tab-btn|seg-btn|segmented-btn)[^>]*>([\s\S]*?)<\/[^>]+>/g) || [];
    const offenders = [];
    for (const tab of tabMatches) {
        const cleaned = tab.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
        if (emojiRegex.test(cleaned)) {
            offenders.push(tab.slice(0, 80));
        }
    }
    assert.strictEqual(offenders.length, 0, `Found ${offenders.length} tabs/pills with raw emojis: ${JSON.stringify(offenders)}`);
});

check("F20-03: #nav-kds and #nav-tables use clean Lucide SVG icons", () => {
    const navKds = html.match(/<button\b[^>]*id="nav-kds"[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(navKds, "#nav-kds exists");
    assert.ok(navKds[1].includes('<svg'), "#nav-kds contains an SVG");
    
    const navTables = html.match(/<button\b[^>]*id="nav-tables"[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(navTables, "#nav-tables exists");
    assert.ok(navTables[1].includes('<svg'), "#nav-tables contains an SVG");
});

// ==========================================
// 3. INVARIANT F21: NON-BREAKING CURRENCY SPACE FORMATTING
// ==========================================
console.log("\n📍 [F21] NON-BREAKING CURRENCY SPACE FORMATTING AUDIT");

check("F21-01: formatCurrency helper in currency.js uses '₹ ' prefix", () => {
    const currencyUtilPath = path.join(rootDir, 'src', 'shared', 'utils', 'currency.js');
    const currencyUtil = fs.readFileSync(currencyUtilPath, 'utf8');
    assert.ok(currencyUtil.includes("₹ "), "currency.js must format with '₹ '");
    assert.ok(!currencyUtil.includes("`₹${"), "currency.js must not format without space (`₹${)");
});

check("F21-02: POS cart and checkout UI helpers preserve '₹ ' currency formatting", () => {
    // Check pos.js formatting patterns: ensure ₹ has a space following it
    const crampedMatches = pos.match(/['"`]₹[0-9]/g) || [];
    // Allow zero cramped instances in UI display code
    assert.strictEqual(crampedMatches.length, 0, `Found cramped currency instances in pos.js: ${JSON.stringify(crampedMatches)}`);
});

// ==========================================
// 4. FEATURE F9: 4 STATION PROFILES ENGINE
// ==========================================
console.log("\n📍 [F9] 4 STATION PROFILES & TAILORED VIEWS AUDIT");

check("F9-01: STATION_PROFILES definition contains all 4 canonical profiles", () => {
    assert.ok(core.includes("BILLING_COUNTER: 'BILLING_COUNTER'"), "Contains BILLING_COUNTER");
    assert.ok(core.includes("KDS: 'KDS'"), "Contains KDS");
    assert.ok(core.includes("WAITER_MOBILE: 'WAITER_MOBILE'"), "Contains WAITER_MOBILE");
    assert.ok(core.includes("GENERAL_STATION: 'GENERAL_STATION'"), "Contains GENERAL_STATION");
});

check("F9-02: resolveInitialViewForStation routes correctly for each station profile", () => {
    // Dynamic execution simulation
    const fnStr = core.match(/function resolveInitialViewForStation[\s\S]*?^}/m);
    assert.ok(fnStr, "resolveInitialViewForStation function exists in core.js");
    
    // Test logic directly
    const evalEnv = {
        STATION_PROFILES: {
            BILLING_COUNTER: 'BILLING_COUNTER',
            KDS: 'KDS',
            WAITER_MOBILE: 'WAITER_MOBILE',
            GENERAL_STATION: 'GENERAL_STATION'
        },
        normalizeRole: (r) => {
            if (/chef|kitchen/i.test(r)) return 'Kitchen Chef';
            if (/waiter|server/i.test(r)) return 'Floor Server';
            if (/admin|owner/i.test(r)) return 'Admin';
            if (/manager/i.test(r)) return 'Manager';
            return 'Cashier';
        },
        getStationProfile: () => 'GENERAL_STATION',
        window: {}
    };
    
    const resolveFn = new Function('env', `
        with(env) {
            ${fnStr[0]};
            return resolveInitialViewForStation;
        }
    `)(evalEnv);
    
    // BILLING_COUNTER -> 'pos'
    assert.strictEqual(resolveFn('BILLING_COUNTER'), 'pos');
    // KDS -> 'kds'
    assert.strictEqual(resolveFn('KDS'), 'kds');
    // WAITER_MOBILE -> 'tables'
    assert.strictEqual(resolveFn('WAITER_MOBILE'), 'tables');
    // GENERAL_STATION dynamic routing
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Kitchen Chef'), 'kds');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Chef'), 'kds');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Floor Server'), 'tables');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Waiter'), 'tables');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Cashier'), 'pos');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Manager'), 'pos');
    assert.strictEqual(resolveFn('GENERAL_STATION', 'Admin'), 'pos');
});

check("F9-03: KDS view integrates KotUI with preparation status progression", () => {
    assert.ok(html.includes('id="kds"'), "#kds view container exists in index.html");
    assert.ok(html.includes('id="kotCardsContainer"'), "#kotCardsContainer exists in index.html");
    assert.ok(kotUi.includes('handleAdvanceStatus'), "kot.ui.js handles status advancement");
    assert.ok(kotService.includes("const valid = ['PREPARING', 'READY', 'SERVED'];"), "kot.service.js enforces PREPARING -> READY -> SERVED");
    assert.ok(kotService.includes("status: 'PENDING'"), "kot.service.js initializes tickets as PENDING");
});

check("F9-04: KDS Web Audio API chime implementation is synthetically generated (offline-resilient)", () => {
    assert.ok(core.includes('function playKdsAudioChime'), "playKdsAudioChime exists in core.js");
    assert.ok(core.includes('ctx.createOscillator()'), "Uses AudioContext oscillator synthesis");
    assert.ok(core.includes('function toggleKdsSound'), "toggleKdsSound exists in core.js");
    assert.ok(html.includes('id="kdsSoundToggleBtn"'), "#kdsSoundToggleBtn exists in #kds view header");
});

check("F9-05: KDS station profile strictly blocks checkout button and tender controls", () => {
    assert.ok(core.includes("if (checkoutBtn) checkoutBtn.style.display = 'none';"), "checkoutBtn hidden on KDS");
    assert.ok(core.includes("if (navPos) navPos.style.display = 'none';"), "navPos hidden on KDS");
});

check("F9-06: WAITER_MOBILE integrates TablesUI for table-side ordering and blocks settlement/discounts", () => {
    assert.ok(html.includes('id="tables"'), "#tables view container exists in index.html");
    assert.ok(html.includes('id="tablesGridContainer"'), "#tablesGridContainer exists in index.html");
    assert.ok(tablesUi.includes('onTableSelect'), "tables.ui.js supports table selection callback");
    assert.ok(html.includes("if (table && typeof selectTable === 'function')") || featureControllers.includes("if (table && typeof selectTable === 'function')"), "Table select triggers selectTable and pos navigation");
    assert.ok(core.includes("if (checkoutBtn) checkoutBtn.style.display = 'none';"), "checkoutBtn hidden on Waiter Mobile");
    assert.ok(core.includes("if (cartDiscountWrap) cartDiscountWrap.style.display = 'none';"), "cartDiscountWrap hidden on Waiter Mobile");
    assert.ok(pos.includes("can_settle_bills"), "pos.js enforces can_settle_bills permission check");
});

check("F9-07: GENERAL_STATION dynamic role routing on unlockTerminal() in staff.js", () => {
    assert.ok(staff.includes("resolveInitialViewForStation(typeof getStationProfile === 'function' ? getStationProfile() : null, staff ? staff.role : null)"), "unlockTerminal resolves view using staff.role");
    assert.ok(staff.includes("applyStationProfileRestrictions()"), "unlockTerminal calls applyStationProfileRestrictions()");
});

// ==========================================
// 5. FEATURE F18: OFFLINE PWA RESILIENCE & CSS MODULAR ARCHITECTURE
// ==========================================
console.log("\n📍 [F18] OFFLINE PWA & CSS MODULAR ARCHITECTURE AUDIT");

check("F18-01: Service worker files exist and bypass /api/ and firestore endpoints", () => {
    const swPath = path.join(rootDir, 'sw.js');
    const serviceWorkerPath = path.join(rootDir, 'service-worker.js');
    assert.ok(fs.existsSync(swPath), "sw.js exists");
    assert.ok(fs.existsSync(serviceWorkerPath), "service-worker.js exists");
    
    const swContent = fs.readFileSync(swPath, 'utf8');
    const fullSwContent = fs.readFileSync(serviceWorkerPath, 'utf8');
    assert.ok(swContent.includes('service-worker.js'), "sw.js imports service-worker.js");
    assert.ok(fullSwContent.includes('/api/'), "service-worker.js bypasses /api/");
    assert.ok(fullSwContent.includes('firestore.googleapis.com'), "service-worker.js bypasses firestore endpoints");
});

check("F18-02: Deterministic offline invoice ID generator BN-{TerminalID}-{YYMMDD}-{Counter}", () => {
    const idGenPath = path.join(rootDir, 'src', 'shared', 'utils', 'invoice-id.js');
    const idGen = fs.readFileSync(idGenPath, 'utf8');
    assert.ok(idGen.includes('generateDeterministicInvoiceId'), "generateDeterministicInvoiceId function exists");
    assert.ok(idGen.includes('BN-'), "Prefixes with BN-");
    assert.ok(idGen.includes('parseInvoiceId'), "parseInvoiceId function exists");
});

check("F18-03: CSS Modular Architecture: css/pos.css contains KDS and Tables styles", () => {
    assert.ok(cssPos.includes('.kds-grid-wrap'), ".kds-grid-wrap styled in css/pos.css");
    assert.ok(cssPos.includes('.kot-card'), ".kot-card styled in css/pos.css");
    assert.ok(cssPos.includes('.tables-grid-wrap'), ".tables-grid-wrap styled in css/pos.css");
    assert.ok(cssPos.includes('.table-card'), ".table-card styled in css/pos.css");
});

check("F18-04: scripts/bundle-css.cjs compiles style.css matching css/pos.css styles", () => {
    assert.ok(styleCss.includes('.kds-grid-wrap'), ".kds-grid-wrap compiled into style.css");
    assert.ok(styleCss.includes('.kot-card'), ".kot-card compiled into style.css");
    assert.ok(styleCss.includes('.tables-grid-wrap'), ".tables-grid-wrap compiled into style.css");
    assert.ok(styleCss.includes('.table-card'), ".table-card compiled into style.css");
});

// ==========================================
// 6. ADVERSARIAL INTEGRITY & ANTI-CHEAT CHECKS
// ==========================================
console.log("\n📍 [INTEGRITY] ADVERSARIAL STRESS & INTEGRITY CHECKS");

check("INTEGRITY-01: No hardcoded test bypass flags in core.js", () => {
    assert.ok(!core.includes('__TEST_BYPASS_ALL__ = true'), "No test bypass flags in core.js");
    assert.ok(!core.includes('if (isTestEnvironment) return true'), "No synthetic test bypass in core.js");
});

check("INTEGRITY-02: Zero-Store-Data Gate actively clears store data on unauthorized devices", () => {
    assert.ok(core.includes("menuItems = [];"), "Wipes menuItems in memory on unauth");
    assert.ok(core.includes("orderHistory = [];"), "Wipes orderHistory in memory on unauth");
    assert.ok(core.includes("customersList = [];"), "Wipes customersList in memory on unauth");
    assert.ok(core.includes("tablesInfo = {};"), "Wipes tablesInfo in memory on unauth");
});

check("INTEGRITY-03: clearAllTenantLocalData purges sensitive auth, cart, and IndexedDB keys", () => {
    assert.ok(core.includes("localStorage.removeItem('billnaw_auth_token')"), "Removes auth token");
    assert.ok(core.includes("localStorage.removeItem('billnaw_active_staff')"), "Removes active staff");
    assert.ok(core.includes("localStorage.removeItem('billnaw_active_cart')"), "Removes active cart");
    assert.ok(core.includes("stores.forEach(s => { try { idb.clear(s); } catch (e) {} });"), "Clears IndexedDB stores");
});

console.log("\n====================================================");
console.log(`🎯 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
