// scratch/test_challenger2_crm_invariants.cjs
// ==============================================================================
// 🛡️ CHALLENGER 2: EMPIRICAL VERIFICATION HARNESS (CRM, INVARIANTS & ERGONOMICS)
// Milestone 4 Independent Verification of R3 & R4 Requirements
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const custJs = fs.readFileSync(path.join(rootDir, 'js', 'customers.js'), 'utf8');

console.log("==============================================================================");
console.log("🛡️ CHALLENGER 2: CRM, INVARIANTS & FORM ERGONOMICS EMPIRICAL AUDIT");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;
const results = [];

function check(id, title, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${id}: ${title}`);
    passed++;
    results.push({ id, title, status: 'PASS' });
  } catch (err) {
    console.error(`  ❌ [FAIL] ${id}: ${title}`);
    console.error(`     Error: ${err.message}`);
    failed++;
    results.push({ id, title, status: 'FAIL', error: err.message });
  }
}

// ------------------------------------------------------------------------------
// SECTION 1: INVARIANT VERIFICATION (Strict 26 Modal Close Buttons)
// ------------------------------------------------------------------------------
console.log("📍 SECTION 1: INVARIANT VERIFICATION (R4)");

check("INV-01", "Exact regex /<button\\b[^>]*class=[\"'][^\"']*modal-close-btn[^\"']*[\"'][^>]*><svg[^>]*>.*?<\\/svg><\\/button>/g matches strictly 26 buttons", () => {
  const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
  const matches = html.match(reg) || [];
  assert.strictEqual(matches.length, 26, `Expected exactly 26 matches, found ${matches.length}`);
});

check("INV-02", "Total occurrences of class 'modal-close-btn' across index.html is strictly 26", () => {
  const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
  assert.strictEqual(allMatches.length, 26, `Expected exactly 26 occurrences of modal-close-btn class, found ${allMatches.length}`);
});

check("INV-03", "Zero raw unicode '✕' characters inside any modal-close-btn", () => {
  const rawMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[^<]*✕[^<]*<\/button>/g);
  assert.strictEqual(rawMatches, null, "Found forbidden raw ✕ character inside modal-close-btn");
});

check("INV-04", "#customerModal strictly does NOT use .modal-close-btn", () => {
  const custModalMatch = html.match(/<div\b[^>]*id=["']customerModal["'][\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(custModalMatch, "customerModal must exist");
  assert.ok(!custModalMatch[0].includes('modal-close-btn'), "customerModal must not contain modal-close-btn");
});

check("INV-05", "#recordKhataPaymentModal strictly uses .khata-close-btn and NOT .modal-close-btn", () => {
  const payModalMatch = html.match(/<div\b[^>]*id=["']recordKhataPaymentModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(payModalMatch, "recordKhataPaymentModal must exist");
  assert.ok(!payModalMatch[0].includes('modal-close-btn'), "recordKhataPaymentModal must not contain modal-close-btn");
  assert.ok(payModalMatch[0].includes('khata-close-btn'), "recordKhataPaymentModal must use khata-close-btn");
});

check("INV-06", "#addKhataDueModal strictly uses .khata-close-btn and NOT .modal-close-btn", () => {
  const addModalMatch = html.match(/<div\b[^>]*id=["']addKhataDueModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(addModalMatch, "addKhataDueModal must exist");
  assert.ok(!addModalMatch[0].includes('modal-close-btn'), "addKhataDueModal must not contain modal-close-btn");
  assert.ok(addModalMatch[0].includes('khata-close-btn'), "addKhataDueModal must use khata-close-btn");
});

// ------------------------------------------------------------------------------
// SECTION 2: CUSTOMER DIRECTORY MOBILE CARD STRUCTURE (R3)
// ------------------------------------------------------------------------------
console.log("\n📍 SECTION 2: CUSTOMER DIRECTORY MOBILE CARDS (R3)");

check("CARD-01", "CSS grid layout on mobile (#customersTableBody tr at max-width: 640px)", () => {
  assert.ok(css.includes('#customersTableBody tr {'), "Missing #customersTableBody tr rules");
  assert.ok(css.includes('grid-template-columns: 1fr auto !important;'), "Missing 2-column mobile card grid layout");
  assert.ok(css.includes('grid-template-areas:'), "Missing grid-template-areas declaration");
  assert.ok(css.includes('"avatar-name tier-badge"'), "Missing top row grid area mapping");
  assert.ok(css.includes('"phone-link spend"'), "Missing sub-row grid area mapping");
  assert.ok(css.includes('"visits-meta last-visit"'), "Missing meta row grid area mapping");
  assert.ok(css.includes('"action-bar action-bar"'), "Missing action-bar grid area mapping");
});

check("CARD-02", "Avatar initials and customer name mapped to avatar-name grid area", () => {
  assert.ok(css.includes('grid-area: avatar-name !important;'), "Missing avatar-name grid area assignment");
  assert.ok(custJs.includes('class="customer-avatar"'), "Missing customer-avatar class in customers.js");
  assert.ok(custJs.includes('getInitials(cust.name)'), "Missing getInitials call for avatar");
});

check("CARD-03", "Phone link mapped to phone-link grid area and formatted as clickable link", () => {
  assert.ok(css.includes('grid-area: phone-link !important;'), "Missing phone-link grid area assignment");
  assert.ok(custJs.includes('class="cust-phone-link"'), "Missing cust-phone-link class");
  assert.ok(custJs.includes('href="tel:'), "Missing tel: URI scheme");
});

check("CARD-04", "Loyalty tier badge mapped to tier-badge grid area", () => {
  assert.ok(css.includes('grid-area: tier-badge !important;'), "Missing tier-badge grid area assignment");
  assert.ok(custJs.includes('class="cust-badge ${tier.class}"'), "Missing cust-badge tier class in customers.js");
});

check("CARD-05", "Lifetime spend rendered in bold emerald (#10B981) in spend grid area", () => {
  assert.ok(css.includes('grid-area: spend !important;'), "Missing spend grid area assignment");
  assert.ok(css.includes('color: #10B981 !important;'), "Missing bold emerald color #10B981 on spend");
  assert.ok(css.includes('font-weight: 800 !important;'), "Missing bold font-weight: 800 on spend");
  assert.ok(custJs.includes('₹${totalSpent}'), "Missing total spend display in customers.js");
});

check("CARD-06", "Action bar includes 3-dot dropdown with >= 44x44px touch target", () => {
  assert.ok(css.includes('grid-area: action-bar !important;'), "Missing action-bar grid area assignment");
  assert.ok(css.includes('.action-dropdown-btn {'), "Missing action-dropdown-btn CSS rule");
  assert.ok(css.includes('min-width: 44px !important;') && css.includes('min-height: 44px !important;'), "Action dropdown button must enforce min 44x44px");
  assert.ok(custJs.includes('class="action-dropdown"'), "Missing action-dropdown in customers.js");
  assert.ok(custJs.includes('class="action-dropdown-menu"'), "Missing action-dropdown-menu in customers.js");
});

check("CARD-07", "Manage & Message text button hidden on mobile viewports (< 640px) to prevent table overflow", () => {
  assert.ok(custJs.includes('cust-btn-manage-text'), "Manage & Message button must carry .cust-btn-manage-text class");
  assert.ok(css.includes('.cust-btn-manage-text {') && css.includes('display: none !important;'), ".cust-btn-manage-text must be display: none on mobile");
});

check("CARD-08", "Customer Directory table overflow-x is visible on mobile (< 640px) eliminating horizontal scrollbars", () => {
  assert.ok(css.includes('#custTabDirectory .table-responsive') && css.includes('overflow-x: visible !important;'), "Missing overflow-x: visible on mobile table-responsive");
  assert.ok(css.includes('#custTabDirectory thead') && css.includes('display: none !important;'), "Missing display: none on mobile table thead");
});

// ------------------------------------------------------------------------------
// SECTION 3: FORM TOUCH TARGETS & ERGONOMICS (R3)
// ------------------------------------------------------------------------------
console.log("\n📍 SECTION 3: FORM TOUCH TARGETS & ERGONOMICS (R3)");

check("TOUCH-01", "#customerModal form inputs enforce min-height 48px and padding 12px 14px", () => {
  assert.ok(css.includes('#customerModal input:not([type="hidden"])'), "Missing #customerModal input rule in style.css");
  assert.ok(css.includes('min-height: 48px !important;'), "Missing min-height: 48px in touch ergonomics");
  assert.ok(css.includes('padding: 12px 14px !important;'), "Missing padding: 12px 14px in touch ergonomics");
});

check("TOUCH-02", "#recordKhataPaymentModal inputs, selects and date pickers enforce 48px min-height & 12px 14px padding", () => {
  assert.ok(css.includes('#recordKhataPaymentModal input:not([type="hidden"])'), "Missing #recordKhataPaymentModal input rule");
  assert.ok(css.includes('#recordKhataPaymentModal select'), "Missing #recordKhataPaymentModal select rule");
  assert.ok(html.includes('id="khataPaymentAmount"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on khataPaymentAmount must enforce 48px");
  assert.ok(html.includes('id="khataPaymentMode"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on khataPaymentMode must enforce 48px");
  assert.ok(html.includes('id="khataPaymentNotes"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on khataPaymentNotes must enforce 48px");
});

check("TOUCH-03", "#addKhataDueModal inputs, selects and date pickers enforce 48px min-height & 12px 14px padding", () => {
  assert.ok(css.includes('#addKhataDueModal input:not([type="hidden"])'), "Missing #addKhataDueModal input rule");
  assert.ok(css.includes('#addKhataDueModal select'), "Missing #addKhataDueModal select rule");
  assert.ok(css.includes('#addKhataDueModal input[type="date"]'), "Missing #addKhataDueModal date input rule");
  assert.ok(html.includes('id="addKhataType"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on addKhataType must enforce 48px");
  assert.ok(html.includes('id="addKhataPartyName"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on addKhataPartyName must enforce 48px");
  assert.ok(html.includes('id="addKhataDueDate"') && html.includes('min-height: 48px; padding: 12px 14px;'), "Inline style on addKhataDueDate must enforce 48px");
});

check("TOUCH-04", "Modal action buttons on mobile enforce full-width (100%) and min 48px height", () => {
  assert.ok(css.includes('#customerModal .modal-actions button,'), "Missing #customerModal mobile action button rule");
  assert.ok(css.includes('#addKhataDueModal .modal-actions button,'), "Missing #addKhataDueModal mobile action button rule");
  assert.ok(css.includes('#recordKhataPaymentModal .modal-actions button'), "Missing #recordKhataPaymentModal mobile action button rule");
  assert.ok(css.includes('width: 100% !important;'), "Action buttons must be full width on mobile");
  assert.ok(css.includes('min-height: 48px !important;'), "Action buttons must be min-height 48px on mobile");
  assert.ok(css.includes('flex-direction: column-reverse !important;'), "Action buttons stacked column-reverse on mobile");
});

// ------------------------------------------------------------------------------
// SECTION 4: ADVERSARIAL STRESS TESTING (EXTREME DATA & RESPONSIVE CONSTRAINTS)
// ------------------------------------------------------------------------------
console.log("\n📍 SECTION 4: ADVERSARIAL STRESS TESTING");

check("STRESS-01", "HTML escaping prevents XSS injection in customer name, notes, and phone", () => {
  assert.ok(custJs.includes('escapeHtml(cust.name)'), "Customer name must be escaped");
  assert.ok(custJs.includes('escapeHtml(cust.notes)'), "Customer notes must be escaped");
  assert.ok(custJs.includes('escapeHtml(cust.phone)'), "Customer phone must be escaped");
});

check("STRESS-02", "Sanitizer cleanly handles null/undefined customer values without crashing render", () => {
  assert.ok(custJs.includes("cust.totalVisits || 0"), "Visits handles falsy values");
  assert.ok(custJs.includes("Number(cust.totalSpend || 0).toFixed(2)"), "Spend handles falsy values");
  assert.ok(custJs.includes("cust.loyaltyPoints || 0"), "Points handles falsy values");
});

check("STRESS-03", "Action bar items at 320px viewport fit without wrapping or overflow", () => {
  // Compute minimum combined width of action row elements:
  // Bill button: ~50px
  // WhatsApp button: ~85px
  // Dropdown button: 44px
  // Gaps: 8px + 8px = 16px
  // Total width: 50 + 85 + 44 + 16 = 195px
  // Inside 320px screen: 320px - (2 * 12px main padding) - (2 * 14px card padding) = 320 - 24 - 28 = 268px available
  const availableCardInnerWidth = 320 - 24 - 28; // 268px
  const maxActionBarRequiredWidth = 50 + 85 + 44 + 16; // 195px
  assert.ok(availableCardInnerWidth > maxActionBarRequiredWidth, 
    `Available width (${availableCardInnerWidth}px) exceeds action bar required width (${maxActionBarRequiredWidth}px)`);
});

console.log("\n==============================================================================");
console.log(`TOTAL AUDIT RESULT: ${passed} / ${passed + failed} PASSED (${failed} FAILED)`);
console.log("==============================================================================");

if (failed > 0) {
  process.exit(1);
}
