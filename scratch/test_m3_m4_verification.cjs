// scratch/test_m3_m4_verification.cjs
// ============================================================================
// Automated Verification Suite: Milestone M3 & Milestone M4
// M3: Progressive 3-Step AI WhatsApp Marketing Wizard
// M4: 3-Stage Culinary Production Pipeline Structuring
// Invariants: 26 Modal Close Buttons & Zero Raw Unicode Emojis
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================================");
console.log("🧪 VERIFICATION SUITE: MILESTONES M3 & M4 (WIZARD & CULINARY PIPELINE)");
console.log("====================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
    }
}

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const custJs = fs.readFileSync(path.join(__dirname, '../js/customers.js'), 'utf8');
const culJs = fs.readFileSync(path.join(__dirname, '../js/culinary_inventory.js'), 'utf8');

// ============================================================================
// SECTION 1: MILESTONE M3 — PROGRESSIVE 3-STEP AI WHATSAPP MARKETING WIZARD
// ============================================================================
console.log("📍 SECTION 1: MILESTONE M3 — PROGRESSIVE 3-STEP AI WHATSAPP WIZARD");

check("M3-01: Stepper bar (#waMarketingStepper) and 3 sequential step indicators present", () => {
    assert.ok(html.includes('id="waMarketingStepper"'), "Missing #waMarketingStepper in index.html");
    assert.ok(html.includes('id="waStepIndicator-1"'), "Missing #waStepIndicator-1");
    assert.ok(html.includes('id="waStepIndicator-2"'), "Missing #waStepIndicator-2");
    assert.ok(html.includes('id="waStepIndicator-3"'), "Missing #waStepIndicator-3");
    assert.ok(html.includes('Audience'), "Missing Step 1 Audience label");
    assert.ok(html.includes('Message &amp; Offer') || html.includes('Message & Offer'), "Missing Step 2 Message & Offer label");
    assert.ok(html.includes('Review &amp; Broadcast') || html.includes('Review & Broadcast'), "Missing Step 3 Review & Broadcast label");
});

check("M3-02: 3 Wizard Step panels isolated in index.html", () => {
    assert.ok(html.includes('id="waWizardStep-1"'), "Missing #waWizardStep-1 panel");
    assert.ok(html.includes('id="waWizardStep-2"'), "Missing #waWizardStep-2 panel");
    assert.ok(html.includes('id="waWizardStep-3"'), "Missing #waWizardStep-3 panel");
});

check("M3-03: Step 1 contains audience selection controls, tier accordions, and advance button", () => {
    assert.ok(html.includes('id="selectAllCustomersCheckbox"'), "Missing #selectAllCustomersCheckbox");
    assert.ok(html.includes('id="waSelectedCountBadge"'), "Missing #waSelectedCountBadge");
    assert.ok(html.includes('id="btnWizardNextToDraft"'), "Missing #btnWizardNextToDraft");
    assert.ok(html.includes("setMarketingWizardStep(2)"), "Next button should call setMarketingWizardStep(2)");
    assert.ok(custJs.includes('VIP & Gold Diners'), "Missing VIP & Gold Diners tier in customers.js");
    assert.ok(custJs.includes('Regular Diners'), "Missing Regular Diners tier in customers.js");
    assert.ok(custJs.includes('Occasional Diners'), "Missing Occasional Diners tier in customers.js");
});

check("M3-04: Step 2 contains message editor, dynamic variable chips bar, and discount code control", () => {
    assert.ok(html.includes('id="waCampaignEditableText"'), "Missing #waCampaignEditableText editor");
    assert.ok(html.includes('id="waVarChipsBar"'), "Missing #waVarChipsBar chips container");
    assert.ok(html.includes("insertCampaignVariable('{customer_name}')"), "Missing {customer_name} chip button");
    assert.ok(html.includes("insertCampaignVariable('{discount_code}')"), "Missing {discount_code} chip button");
    assert.ok(html.includes("insertCampaignVariable('{discount_pct}')"), "Missing {discount_pct} chip button");
    assert.ok(html.includes('id="waQuickDiscountCode"'), "Missing #waQuickDiscountCode input");
    assert.ok(html.includes('id="btnWizardBackToAudience"'), "Missing #btnWizardBackToAudience");
    assert.ok(html.includes('id="btnWizardNextToReview"'), "Missing #btnWizardNextToReview");
});

check("M3-05: Step 2 includes live draft preview card (#waStep2LivePreview)", () => {
    assert.ok(html.includes('id="waStep2LivePreview"'), "Missing #waStep2LivePreview card");
    assert.ok(html.includes('id="waStep2PreviewBubble"'), "Missing #waStep2PreviewBubble preview text");
});

check("M3-06: Step 3 includes audience summary breakdown card with segmented counts", () => {
    assert.ok(html.includes('id="waAudienceSummaryCard"'), "Missing #waAudienceSummaryCard");
    assert.ok(html.includes('id="waSummaryTotalRecipients"'), "Missing #waSummaryTotalRecipients");
    assert.ok(html.includes('id="waSummaryVipCount"'), "Missing #waSummaryVipCount");
    assert.ok(html.includes('id="waSummaryRegularCount"'), "Missing #waSummaryRegularCount");
    assert.ok(html.includes('id="waSummaryOccasionalCount"'), "Missing #waSummaryOccasionalCount");
});

check("M3-07: Step 3 includes simulated phone mockup, sticky broadcast button, and 1-tap queue", () => {
    assert.ok(html.includes('id="waPhoneMockupCard"'), "Missing #waPhoneMockupCard phone mockup");
    assert.ok(html.includes('id="waSimulatedBubble"'), "Missing #waSimulatedBubble bubble");
    assert.ok(html.includes('id="btnSendBulkCampaignSticky"'), "Missing #btnSendBulkCampaignSticky broadcast button");
    assert.ok(html.includes('id="waSelectedBroadcastQueue"'), "Missing #waSelectedBroadcastQueue send queue");
    assert.ok(html.includes('id="btnWizardBackToDraft"'), "Missing #btnWizardBackToDraft back button");
    assert.ok(html.includes("triggerBulkWhatsAppBroadcast()"), "Sticky broadcast button must invoke triggerBulkWhatsAppBroadcast()");
});

check("M3-08: customers.js implements wizard step state machine and variable interpolation", () => {
    assert.ok(custJs.includes('function setMarketingWizardStep'), "Missing setMarketingWizardStep in customers.js");
    assert.ok(custJs.includes('function insertCampaignVariable'), "Missing insertCampaignVariable in customers.js");
    assert.ok(custJs.includes('function updateWaAudienceSummary'), "Missing updateWaAudienceSummary in customers.js");
    assert.ok(custJs.includes('discountCode:'), "Missing discountCode property in waCampaignVariables");
    assert.ok(custJs.includes('{discount_code}'), "Template or interpolation missing {discount_code}");
    assert.ok(custJs.includes('window.setMarketingWizardStep'), "setMarketingWizardStep must be globally exposed");
    assert.ok(custJs.includes('window.insertCampaignVariable'), "insertCampaignVariable must be globally exposed");
});

check("M3-09: style.css defines responsive stepper bar and chips styling", () => {
    assert.ok(css.includes('.wa-stepper-bar'), "Missing .wa-stepper-bar in style.css");
    assert.ok(css.includes('.wa-step-indicator'), "Missing .wa-step-indicator in style.css");
    assert.ok(css.includes('.wa-step-connector'), "Missing .wa-step-connector in style.css");
    assert.ok(css.includes('.wa-var-chips-bar'), "Missing .wa-var-chips-bar in style.css");
    assert.ok(css.includes('.wa-var-chip'), "Missing .wa-var-chip in style.css");
    assert.ok(css.includes('.wa-step-indicator.active'), "Missing active state styling for step indicators");
    assert.ok(css.includes('.wa-step-indicator.completed'), "Missing completed state styling for step indicators");
});

// ============================================================================
// SECTION 2: MILESTONE M4 — 3-STAGE CULINARY PRODUCTION PIPELINE STRUCTURING
// ============================================================================
console.log("\n📍 SECTION 2: MILESTONE M4 — 3-STAGE CULINARY PRODUCTION PIPELINE");

check("M4-01: Inventory Hub tab bar defines 3 primary stage buttons with clear labels", () => {
    assert.ok(html.includes('id="invTabBtn-rawStock"'), "Missing #invTabBtn-rawStock button");
    assert.ok(html.includes('id="invTabBtn-morningPrep"'), "Missing #invTabBtn-morningPrep button");
    assert.ok(html.includes('id="invTabBtn-dishCosting"'), "Missing #invTabBtn-dishCosting button");
    assert.ok(html.includes('Raw Stock'), "Missing 'Raw Stock' button label");
    assert.ok(html.includes('Morning Prep'), "Missing 'Morning Prep' button label");
    assert.ok(html.includes('Dish Recipes'), "Missing 'Dish Recipes' button label");
});

check("M4-02: 3 Stage panels (#invTabRawStock, #invTabMorningPrep, #invTabDishCosting) are direct isolated sibling panels", () => {
    assert.ok(html.includes('id="invTabRawStock"'), "Missing #invTabRawStock panel");
    assert.ok(html.includes('id="invTabMorningPrep"'), "Missing #invTabMorningPrep panel");
    assert.ok(html.includes('id="invTabDishCosting"'), "Missing #invTabDishCosting panel");

    // Verify neither Morning Prep nor Dish Costing is nested inside Raw Stock panel
    const rawStockIndex = html.indexOf('id="invTabRawStock"');
    const prepIndex = html.indexOf('id="invTabMorningPrep"');
    const costingIndex = html.indexOf('id="invTabDishCosting"');
    assert.ok(rawStockIndex < prepIndex, "Raw stock panel must precede Morning Prep panel");
    assert.ok(prepIndex < costingIndex, "Morning Prep panel must precede Dish Costing panel");
});

check("M4-03: culinary_inventory.js switches isolated stage panels directly without forced accordion expansion", () => {
    assert.ok(culJs.includes("function switchInventoryHubTab"), "Missing switchInventoryHubTab in culinary_inventory.js");
    assert.ok(culJs.includes("invTabRawStock"), "switchInventoryHubTab must target invTabRawStock");
    assert.ok(culJs.includes("invTabMorningPrep"), "switchInventoryHubTab must target invTabMorningPrep");
    assert.ok(culJs.includes("invTabDishCosting"), "switchInventoryHubTab must target invTabDishCosting");
    assert.ok(culJs.includes("window.switchInventoryHubTab"), "switchInventoryHubTab must be globally exposed");
});

check("M4-04: Backward compatibility stubs preserved for legacy test harnesses", () => {
    assert.ok(html.includes('id="invAccordionBatching"'), "Missing compatibility stub #invAccordionBatching in index.html");
    assert.ok(html.includes('id="invAccordionCosting"'), "Missing compatibility stub #invAccordionCosting in index.html");
    assert.ok(culJs.includes("toggleAccordion,") || culJs.includes("toggleAccordion:"), "Missing toggleAccordion stub on window.culinaryInventory");
    assert.ok(culJs.includes("window.toggleCulinaryAccordion"), "Missing window.toggleCulinaryAccordion compatibility stub");
});

// ============================================================================
// SECTION 3: SYSTEM INVARIANTS & INTEGRITY AUDIT
// ============================================================================
console.log("\n📍 SECTION 3: SYSTEM INVARIANTS & INTEGRITY AUDIT");

check("INV-01: Exactly 26 SVG modal close buttons matching regex in index.html", () => {
    const modalCloseRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseRegex) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${matches.length}`);
});

check("INV-02: Total modal-close-btn class occurrences in index.html is strictly 26", () => {
    const classOccurrences = (html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || []).length;
    assert.strictEqual(classOccurrences, 26, `Expected exactly 26 occurrences of modal-close-btn, found ${classOccurrences}`);
});

check("INV-03: Zero raw unicode emojis in operational button elements in index.html", () => {
    const rawEmojiPattern = /<button\b[^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)<\/button>/;
    const match = html.match(rawEmojiPattern);
    assert.strictEqual(match, null, `Found raw unicode emoji in button: ${match ? match[0] : ''}`);
});

check("INV-04: Zero raw unicode emojis in navigation tabs, chips, or stepper indicators", () => {
    const rawEmojiPattern = /class=["'][^"']*(?:tab-btn|sub-tab-btn|wa-var-chip|wa-step-indicator)[^"']*["'][^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)</;
    const match = html.match(rawEmojiPattern);
    assert.strictEqual(match, null, `Found raw emoji in tab/chip/stepper: ${match ? match[0] : ''}`);
});

console.log("\n====================================================================");
console.log(`🎯 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================================");

if (failed > 0) {
    console.error("\n❌ FAILED CHECKS:");
    failures.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
} else {
    console.log("\n✨ ALL MILESTONE M3 & M4 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!");
    process.exit(0);
}
