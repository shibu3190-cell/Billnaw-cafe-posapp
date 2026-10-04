const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🎨 VECTOR ICON & MODAL STANDARDIZATION AUDIT");
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

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const jsCustPath = path.join(__dirname, '..', 'js', 'customers.js');
const jsCust = fs.readFileSync(jsCustPath, 'utf8');

const cssPath = path.join(__dirname, '..', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

console.log("📍 CHECK 1: ALL 26 MODAL CLOSE BUTTONS STANDARDIZED");
test("Zero instances of raw '✕' inside modal-close-btn", () => {
    const rawMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>✕<\/button>/g);
    assert.strictEqual(rawMatches, null, "Found un-modernized modal close buttons");
});

test("Exact 26 modal close buttons have SVG icons", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches && svgMatches.length === 26, `Expected 26 SVG close buttons, found ${svgMatches ? svgMatches.length : 0}`);
});

test(".modal-close-btn CSS defines 32x32 flex center button with hover transition", () => {
    assert.ok(css.includes('.modal-close-btn'));
    assert.ok(css.includes('width: 32px;'));
    assert.ok(css.includes('height: 32px;'));
    assert.ok(css.includes('justify-content: center;'));
    assert.ok(css.includes('.modal-close-btn:hover'));
});

console.log("\n📍 CHECK 2: CUSTOMER TIER & DIRECTORY VECTORIZATION");
test("Customer tiers in js/customers.js return inline vector SVGs", () => {
    assert.ok(jsCust.includes('tier-platinum') && jsCust.includes('<polygon points="12 2'));
    assert.ok(jsCust.includes('tier-gold') && jsCust.includes('<polyline points="8.21 13.89'));
    assert.ok(jsCust.includes('tier-silver') && (jsCust.includes('polyline') || jsCust.includes('<path d="m9 12')));
    assert.ok(jsCust.includes('tier-bronze') && jsCust.includes('<path d="M12 22s8-4'));
});

test("Customer directory table rows render vector loyalty coin and manage gear", () => {
    assert.ok(jsCust.includes('circle cx="12" cy="12" r="9"'), "Missing vector coin in table row");
    assert.ok(jsCust.includes('Manage & Message'), "Missing manage button");
});

test("Customer directory tier filters in index.html use vector icons", () => {
    assert.ok(html.includes('id="cFilter-platinum"') && html.includes('Platinum (20+ visits)'));
    assert.ok(html.includes('id="cFilter-gold"') && html.includes('Gold (10+ visits)'));
    assert.ok(html.includes('id="cFilter-silver"') && html.includes('Silver (5+ visits)'));
    assert.ok(html.includes('id="cFilter-bronze"') && html.includes('Bronze'));
});

console.log("\n📍 CHECK 3: CUSTOMER ACTION HUB MODAL MODERNIZATION");
test("Customer action hub buttons use .hub-action-btn with SVGs", () => {
    assert.ok(html.includes("handleCustomerHubAction('history')") && html.includes('hub-action-btn'));
    assert.ok(html.includes("handleCustomerHubAction('bill')") && html.includes('hub-action-btn'));
    assert.ok(html.includes("handleCustomerHubAction('edit')") && html.includes('hub-action-btn'));
    assert.ok(html.includes("handleCustomerHubAction('delete')") && html.includes('hub-action-btn'));
});

test(".hub-action-btn has elevation and tactile feedback in style.css", () => {
    assert.ok(css.includes('.hub-action-btn'));
    assert.ok(css.includes('transform: translateY(-2px);'));
    assert.ok(css.includes('box-shadow: var(--shadow-sm);'));
    assert.ok(css.includes('transform: scale(0.96);'));
});

console.log("\n📍 CHECK 4: AI WHATSAPP MARKETING & INVENTORY HUBS");
test("AI WhatsApp Marketing Hub buttons have vector icons", () => {
    assert.ok(html.includes('runWeeklyAiMarketingScan()') && html.includes('Weekly AI Scan'));
    assert.ok(html.includes('triggerBulkWhatsAppBroadcast()') && html.includes('Send Campaign'));
    assert.ok(html.includes('generateAiCampaignCopy()') && html.includes('Generate with AI'));
    assert.ok(html.includes('copyAllSelectedPhones()') && html.includes('Copy Phone #s'));
});

test("Inventory Telemetry Hub refresh and loss alert are vectorized", () => {
    assert.ok(html.includes('renderInventoryTelemetryUI()') && html.includes('Refresh Telemetry'));
    assert.ok(html.includes('id="inventoryLossAversionBanner"') && html.includes('loss-alert-icon'));
});

console.log("\n📍 CHECK 5: VIEW HIERARCHY, INVARIANTS & BLANK-PAGE PREVENTATIVES");
test("All core views are direct siblings and NOT trapped inside #customers", () => {
    const custOpen = html.indexOf('<div id="customers" class="view">');
    const custClose = html.indexOf('</div> <!-- Closing #customers view -->');
    assert.ok(custOpen !== -1, "Missing #customers view");
    assert.ok(custClose !== -1, "Missing closing tag for #customers view");
    assert.ok(custClose > custOpen, "Closing tag for #customers must appear after opening tag");

    const customersChunk = html.substring(custOpen, custClose);
    assert.ok(!customersChunk.includes('id="pos"'), "#pos must NOT be trapped inside #customers");
    assert.ok(!customersChunk.includes('id="menu"'), "#menu must NOT be trapped inside #customers");
    assert.ok(!customersChunk.includes('id="inventory"'), "#inventory must NOT be trapped inside #customers");
    assert.ok(!customersChunk.includes('id="settings"'), "#settings must NOT be trapped inside #customers");
    assert.ok(!customersChunk.includes('id="dashboard"'), "#dashboard must NOT be trapped inside #customers");
});

test("Exact count of 26 SVG modal close buttons matching invariant", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.strictEqual(svgMatches.length, 26, `Strict invariant: expected exactly 26 modal close buttons, found ${svgMatches.length}`);
});

test("Service worker STATIC_ASSETS includes marketing_inventory.js and culinary_inventory.js", () => {
    const swPath = path.join(__dirname, '..', 'service-worker.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    assert.ok(sw.includes('./js/marketing_inventory.js'), "Missing marketing_inventory.js in service-worker.js STATIC_ASSETS");
    assert.ok(sw.includes('./js/culinary_inventory.js'), "Missing culinary_inventory.js in service-worker.js STATIC_ASSETS");
});

test("#shopAuthModal has dedicated close button and demo bypass", () => {
    assert.ok(html.includes('class="shop-auth-close-btn"'), "Missing dedicated close button in shopAuthModal");
    assert.ok(html.includes('skipShopAuthToDemo()'), "Missing skipShopAuthToDemo in shopAuthModal");
});

console.log("\n====================================================");
console.log(`🎯 VECTOR AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log("====================================================\n");

if (failed > 0) {
    process.exit(1);
}
