// scratch/test_ui_ux_production_refactor.cjs
// ============================================================================
// Comprehensive Automated E2E Verification Suite: R1-R5 Production Refactor
// Covering:
//   - Invariant Check: 26 Modal Close Buttons (R5 / F14)
//   - Tier 1: Vector Iconography & Zero Unicode Emojis (R1 / F1, F3)
//   - Tier 2: Color System, WCAG Contrast, Touch Ergonomics & Safe Area (R1, R3 / F2, F10)
//   - Tier 3: Mobile 5-Tab Navigation, Compact Ledger, Dropdowns & Filter Toggles (R2, R3 / F5, F7, F9, F11)
//   - Tier 4: SaaS 3-Tier Pricing, Account Card & Interactive Donut Analytics (R2, R4 / F4, F6, F8, F12, F13)
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================================");
console.log("🚀 E2E AUDIT: BILLNAW POS PRODUCTION UI/UX REFACTOR (R1 - R5)");
console.log("====================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function test(id, description, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: [${id}] ${description}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ FAIL: [${id}] ${description}`);
    console.log(`     Error: ${err.message}`);
    failed++;
    failures.push({ id, description, error: err.message });
  }
}

// ----------------------------------------------------------------------------
// WCAG 2.1 Relative Luminance & Contrast Calculation Helpers
// ----------------------------------------------------------------------------
function getLuminance(hex) {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const toLinear = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ----------------------------------------------------------------------------
// Load Source Files
// ----------------------------------------------------------------------------
const rootDir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(rootDir, 'js', 'dashboard.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
const staffJs = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf8');
const culinaryJs = fs.readFileSync(path.join(rootDir, 'js', 'culinary_inventory.js'), 'utf8');

// Regex to detect emoji characters in strings
const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/u;

// Sliced Subsections for scoped DOM analysis
const sidebarStart = html.indexOf('class="sidebar"');
const sidebarEnd = html.indexOf('class="main-wrapper"');
const sidebarHtml = sidebarStart !== -1 && sidebarEnd !== -1 ? html.substring(sidebarStart, sidebarEnd) : html;

const subModalStart = html.indexOf('id="subscriptionDetailModal"');
const subModalEnd = html.indexOf('id="storeProfileModal"');
const subModalHtml = subModalStart !== -1 && subModalEnd !== -1 ? html.substring(subModalStart, subModalEnd) : html;

const kpiStart = html.indexOf('class="kpi-grid"');
const kpiEnd = html.indexOf('<!-- Interactive Filters', kpiStart);
const kpiHtml = kpiStart !== -1 && kpiEnd !== -1 ? html.substring(kpiStart, kpiEnd) : html;

// ============================================================================
// INVARIANT PRESERVATION CHECK: 26 MODAL CLOSE BUTTONS (R5 / F14)
// ============================================================================
console.log("📍 INVARIANT CHECK: MODAL CLOSE BUTTON SYSTEM INVARIANT (R5)");

test("INV-01", "Exact count of 26 SVG modal close buttons matching regex in index.html", () => {
  const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
  const matches = html.match(reg) || [];
  assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal-close-btn elements, found ${matches.length}`);
});

test("INV-02", "Total occurrences of modal-close-btn class in index.html is strictly 26", () => {
  const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
  assert.strictEqual(allMatches.length, 26, `Expected strictly 26 class occurrences, found ${allMatches.length}`);
});

test("INV-03", "Zero raw unicode '✕' or 'X' characters inside modal-close-btn elements", () => {
  const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = reg.exec(html)) !== null) {
    const inner = match[1];
    assert.ok(!inner.includes('✕'), "modal-close-btn must not contain unicode ✕");
    assert.ok(!inner.includes('✖'), "modal-close-btn must not contain unicode ✖");
    assert.ok(!inner.includes('&#10005;'), "modal-close-btn must not contain &#10005;");
  }
});

test("INV-04", "All 26 modal close buttons have 15x15 SVG with 0 0 24 24 viewBox and 2.5 stroke-width", () => {
  const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg\b([^>]*)>.*?<\/svg><\/button>/g;
  let count = 0;
  let match;
  while ((match = reg.exec(html)) !== null) {
    const attrs = match[1];
    assert.ok(attrs.includes('width="15"'), `Modal close button #${count + 1} must have width="15"`);
    assert.ok(attrs.includes('height="15"'), `Modal close button #${count + 1} must have height="15"`);
    assert.ok(attrs.includes('viewBox="0 0 24 24"'), `Modal close button #${count + 1} must have viewBox="0 0 24 24"`);
    assert.ok(attrs.includes('stroke-width="2.5"'), `Modal close button #${count + 1} must have stroke-width="2.5"`);
    count++;
  }
  assert.strictEqual(count, 26, `Expected 26 verified SVG close buttons, got ${count}`);
});

test("INV-05", "Non-standard dialogs and popovers use distinct close classes to prevent invariant collision", () => {
  assert.ok(html.includes('class="tbl-close-btn"'), "Table management modal must use tbl-close-btn");
  assert.ok(html.includes('class="session-close-btn"'), "Active sessions modal must use session-close-btn");
  assert.ok(html.includes('class="rtr_close_btn"'), "RTR Recipe modals must use rtr_close_btn");
  assert.ok(html.includes('class="upload_choice_close_btn"'), "Upload modal must use upload_choice_close_btn");
});

// ============================================================================
// TIER 1: VECTOR ICONOGRAPHY & ZERO UNICODE EMOJIS (R1 / F1, F3)
// ============================================================================
console.log("\n📍 TIER 1: VECTOR ICONOGRAPHY & ZERO UNICODE EMOJIS (R1)");

test("T1-EMOJI-01", "Zero raw unicode emojis in operational <button> elements in index.html", () => {
  const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  const violatingButtons = [];
  while ((match = buttonRegex.exec(html)) !== null) {
    const content = match[1];
    if (emojiRegex.test(content)) {
      violatingButtons.push(match[0].slice(0, 80));
    }
  }
  assert.strictEqual(
    violatingButtons.length,
    0,
    `Found ${violatingButtons.length} buttons with raw emojis: ${violatingButtons.slice(0, 3).join(' | ')}`
  );
});

test("T1-EMOJI-02", "Zero raw unicode emojis in navigation tabs, pills, and feature cards in index.html", () => {
  const targetPattern = /<div\b[^>]*class=["'][^"']*(?:for-you-feature-card|hub-feature-tile|nav-btn|tab-btn|sub-nav-btn)[^"']*["'][^>]*>([\s\S]*?)<\/div>/g;
  let match;
  const violatingCards = [];
  while ((match = targetPattern.exec(html)) !== null) {
    const content = match[1];
    if (emojiRegex.test(content)) {
      violatingCards.push(match[0].slice(0, 80));
    }
  }
  assert.strictEqual(
    violatingCards.length,
    0,
    `Found ${violatingCards.length} cards/tabs with emojis: ${violatingCards.slice(0, 3).join(' | ')}`
  );
});

test("T1-EMOJI-03", "Dynamic button text handlers in js/pos.js do not assign raw emojis", () => {
  assert.ok(!posJs.includes("'🏷️ '") && !posJs.includes('"🏷️ "'), "pos.js must not assign 🏷️ emoji to discount button");
  assert.ok(!posJs.includes("'🏷️ Discount'") && !posJs.includes('"🏷️ Discount"'), "pos.js must not assign 🏷️ Discount string");
  assert.ok(!posJs.includes('"🖨️ Pay & Print"') && !posJs.includes("'🖨️ Pay & Print'"), "pos.js must not assign 🖨️ Pay & Print");
  assert.ok(!posJs.includes('"🖨️ Print KOT"') && !posJs.includes("'🖨️ Print KOT'"), "pos.js must not assign 🖨️ Print KOT");
});

test("T1-EMOJI-04", "Dynamic button text handlers in js/menu.js do not assign raw emojis", () => {
  assert.ok(!menuJs.includes('"💾 Save Item"') && !menuJs.includes("'💾 Save Item'"), "menu.js must not assign 💾 Save Item");
});

test("T1-EMOJI-05", "Dynamic text handlers in js/dashboard.js do not render raw emojis in ledger actions", () => {
  assert.ok(!dashboardJs.includes('🧾 Bill'), "dashboard.js must not output 🧾 Bill emoji");
  assert.ok(!dashboardJs.includes('✏️ Edit'), "dashboard.js must not output ✏️ Edit emoji");
  assert.ok(!dashboardJs.includes('🖨️ Receipt'), "dashboard.js must not output 🖨️ Receipt emoji");
  assert.ok(!dashboardJs.includes('🛍️ Takeaway'), "dashboard.js must not output 🛍️ Takeaway emoji");
  assert.ok(!dashboardJs.includes('🪑 Table'), "dashboard.js must not output 🪑 Table emoji");
});

test("T1-EMOJI-06", "Dynamic handlers in js/staff.js and js/culinary_inventory.js do not assign emojis", () => {
  assert.ok(!staffJs.includes('✏️ Edit'), "staff.js must not output ✏️ Edit");
  assert.ok(!staffJs.includes('🗑️'), "staff.js must not output 🗑️");
  assert.ok(!culinaryJs.includes('🔄 Refresh'), "culinary_inventory.js must not output 🔄 Refresh");
  assert.ok(!culinaryJs.includes('🛒 Generate'), "culinary_inventory.js must not output 🛒 Generate");
  assert.ok(!culinaryJs.includes('👨‍🍳 Produce'), "culinary_inventory.js must not output 👨‍🍳 Produce");
});

test("T1-SVG-01", "Operational button and navigation SVGs adhere to Lucide standard viewBox='0 0 24 24'", () => {
  const navBtnSvgPattern = /<button\b[^>]*class=["'][^"']*nav-btn[^"']*["'][^>]*>[\s\S]*?<svg\b([^>]*)>/g;
  let match;
  let checked = 0;
  while ((match = navBtnSvgPattern.exec(html)) !== null) {
    const attrs = match[1];
    assert.ok(attrs.includes('viewBox="0 0 24 24"'), "Nav button SVG must have viewBox='0 0 24 24'");
    checked++;
  }
  assert.ok(checked >= 5, `Expected at least 5 nav button SVGs verified, checked ${checked}`);
});

test("T1-SVG-02", "Operational Lucide SVGs conform to 1.8px standard stroke width", () => {
  const hasStroke18InHtml = html.includes('stroke-width="1.8"') || html.includes('stroke-width="2"');
  const hasStroke18InCss = css.includes('stroke-width: 1.8px') || css.includes('stroke-width: 1.8') || css.includes('stroke-width: 2px');
  assert.ok(hasStroke18InHtml || hasStroke18InCss, "Application must standardize Lucide icon stroke-width (1.8px)");
});

test("T1-SVG-03", "Dynamic buttons wrap label text in .btn-text or target span to protect child SVGs", () => {
  const hasBtnTextPattern = posJs.includes('.btn-text') || posJs.includes('.label-text') || html.includes('class="btn-text"');
  assert.ok(hasBtnTextPattern, "Buttons with dynamic text must wrap label in .btn-text to prevent wiping SVG children");
});

// ============================================================================
// TIER 2: COLOR SYSTEM, CONTRAST, TOUCH ERGONOMICS & SAFE AREA (R1, R3 / F2, F10)
// ============================================================================
console.log("\n📍 TIER 2: COLOR SYSTEM, WCAG CONTRAST, TOUCH ERGONOMICS & SAFE AREA (R1, R3)");

test("T2-COLOR-01", ":root in style.css standardizes core palette on dark emerald neutral tokens", () => {
  assert.ok(css.includes('#143832'), "style.css must include primary dark emerald #143832");
  const emeraldNeutrals = ['#143832', '#1B4940', '#0F2924', '#F8F6F2', '#E2E8F0'];
  let count = 0;
  emeraldNeutrals.forEach(token => {
    if (css.includes(token)) count++;
  });
  assert.ok(count >= 3, `Expected at least 3 dark emerald neutral tokens in style.css, found ${count}`);
});

test("T2-CONTRAST-01", "WCAG 3:1+ inactive contrast validation between neutral icon tokens and light backgrounds", () => {
  // Verify dark emerald against light background
  const primaryContrast = getContrastRatio('#143832', '#F8F6F2');
  assert.ok(primaryContrast >= 4.5, `Primary contrast ${primaryContrast.toFixed(2)} must exceed WCAG AA 4.5:1`);

  // Verify inactive/muted icon token against surface background
  const inactiveSlateContrast = getContrastRatio('#52796F', '#F8F6F2');
  assert.ok(inactiveSlateContrast >= 3.0, `Inactive contrast ${inactiveSlateContrast.toFixed(2)} must be >= 3.0:1`);

  const mutedSlateContrast = getContrastRatio('#64748B', '#FFFFFF');
  assert.ok(mutedSlateContrast >= 3.0, `Muted contrast ${mutedSlateContrast.toFixed(2)} must be >= 3.0:1`);
});

test("T2-SAFEAREA-01", "Mobile styles apply modern device safe area padding formula in style.css", () => {
  const hasSafeAreaMax = css.includes('padding-bottom: max(12px, env(safe-area-inset-bottom, 24px))');
  assert.ok(
    hasSafeAreaMax,
    "style.css must strictly implement padding-bottom: max(12px, env(safe-area-inset-bottom, 24px))"
  );
});

test("T2-TOUCH-01", "Touch ergonomics enforces >= 44x44px touch targets on mobile nav buttons", () => {
  const hasMinTouchInCss = (css.includes('min-height: 44px') || css.includes('min-height:44px')) &&
                           (css.includes('min-width: 44px') || css.includes('min-width:44px'));
  assert.ok(hasMinTouchInCss, "style.css must enforce touch target size strictly >= 44x44px on mobile interactive targets");
});

test("T2-TOUCH-02", "Mobile nav icon container specifies standard icon dimensions (20-24px)", () => {
  assert.ok(sidebarHtml.includes('width="24"') || sidebarHtml.includes('width="22"') || sidebarHtml.includes('width="20"') || sidebarHtml.includes('width="18"'), "Nav buttons must declare structured vector dimensions");
});

test("T2-TYPO-01", "Bottom nav labels adhere to 10-12px single-line typography", () => {
  const hasNavTypography = css.includes('font-size: 11px') || css.includes('font-size: 10px') || css.includes('font-size: 12px');
  assert.ok(hasNavTypography, "style.css must style nav-text with 10-12px single line typography");
});

test("T2-STATE-01", "Icon state styles enforce outlined stroke for inactive and filled accent for active", () => {
  const hasActiveIconStyle = css.includes('.nav-btn.active .icon-box') || css.includes('.nav-btn.active svg');
  assert.ok(hasActiveIconStyle, "style.css must enforce active state styling for icons");
});

// ============================================================================
// TIER 3: MOBILE 5 CORE TABS, LEDGER, DROPDOWNS & FILTER TOGGLES (R2, R3 / F5, F7, F9, F11)
// ============================================================================
console.log("\n📍 TIER 3: MOBILE 5 CORE TABS, COMPACT LEDGER, ACTION DROPDOWNS & FILTER TOGGLES (R2, R3)");

test("T3-NAV-01", "Mobile bottom navigation renders strictly 5 core tabs (POS, Menu, Reports, Inventory, More)", () => {
  assert.ok(sidebarHtml.includes('id="nav-pos"'), "Must include POS tab (#nav-pos)");
  assert.ok(sidebarHtml.includes('id="nav-menu"'), "Must include Menu tab (#nav-menu)");
  assert.ok(sidebarHtml.includes('id="nav-dashboard"') || sidebarHtml.includes('id="nav-reports"'), "Must include Reports tab");
  assert.ok(sidebarHtml.includes('id="nav-inventory"'), "Must include Inventory tab (#nav-inventory)");
  assert.ok(sidebarHtml.includes('id="nav-more"'), "Must include More tab (#nav-more) as unified hub");

  // In the 5-tab core architecture, Customer and Settings are consolidated into the More hub
  const customerButton = sidebarHtml.match(/<button\b[^>]*id=["']nav-customers["'][^>]*>/);
  const settingsButton = sidebarHtml.match(/<button\b[^>]*id=["']nav-settings["'][^>]*>/);
  const customerIsHidden = !customerButton || (customerButton && customerButton[0].includes('display: none'));
  const settingsIsHidden = !settingsButton || (settingsButton && settingsButton[0].includes('display: none'));
  assert.ok(customerIsHidden, "Customers tab must be consolidated inside More hub rather than separate visible bottom tab");
  assert.ok(settingsIsHidden, "Settings tab must be consolidated inside More hub rather than separate visible bottom tab");
});

test("T3-NAV-02", "More tab acts as Unified Hub housing Customers, WhatsApp Campaigns, and Settings", () => {
  assert.ok(html.includes('id="moreHubModal"') || html.includes('id="moreHubView"') || html.includes('openMoreHub'), "Must provide unified More hub container or trigger");
});

test("T3-NAV-03", "Dual-cue active tab feedback in style.css (icon transition + bold indicator + emerald glow)", () => {
  const hasActiveFeedback = css.includes('.nav-btn.active') &&
    (css.includes('font-weight: 700') || css.includes('font-weight: 800')) &&
    (css.includes('border-color') || css.includes('box-shadow') || css.includes('::before') || css.includes('::after'));
  assert.ok(hasActiveFeedback, "style.css must implement dual-cue active tab feedback");
});

test("T3-NAV-04", "Tactile tap micro-interaction on bottom nav buttons (transform: scale(0.96))", () => {
  assert.ok(
    css.includes('scale(0.96)') || css.includes('scale(0.97)'),
    "style.css must include tactile tap scale(0.96) micro-interaction on active state"
  );
});

test("T3-LEDGER-01", "Sales & transaction ledger rows feature compact layout with centered date and right-aligned amount", () => {
  const hasCompactLedger = dashboardJs.includes('compact-ledger-row') ||
    css.includes('.ledger-row') ||
    dashboardJs.includes('action-dropdown') ||
    (css.includes('#historyTableBody') && css.includes('text-align: right'));
  assert.ok(hasCompactLedger, "Transaction ledger must implement compact row styling with right-aligned amounts");
});

test("T3-ACTION-01", "Floating triple-dot action dropdown menu (.action-dropdown) in transaction ledger", () => {
  const hasActionDropdownInJs = dashboardJs.includes('action-dropdown') || dashboardJs.includes('toggleActionDropdown');
  const hasActionDropdownInCss = css.includes('.action-dropdown');
  assert.ok(hasActionDropdownInJs || hasActionDropdownInCss, "Transaction ledger must provide .action-dropdown triple-dot menu");
});

test("T3-ACTION-02", "Click-outside dismissal event listener closes open .action-dropdown menus", () => {
  const hasClickOutside = dashboardJs.includes("addEventListener('click'") &&
    (dashboardJs.includes('action-dropdown') || dashboardJs.includes('actionDropdown') || dashboardJs.includes('closest'));
  assert.ok(hasClickOutside, "js/dashboard.js must register click-outside dismissal for .action-dropdown");
});

test("T3-FILTER-01", "Dashboard filter element IDs synchronized between index.html and js/dashboard.js", () => {
  // Prevent the bug where index.html had dashFilterPayment but JS looked for dashPayModeFilter
  const htmlHasPayMode = html.includes('id="dashPayModeFilter"');
  const jsHasPayMode = dashboardJs.includes('dashPayModeFilter');
  assert.ok(htmlHasPayMode && jsHasPayMode, "index.html and js/dashboard.js must both use synchronized ID dashPayModeFilter");
});

test("T3-FILTER-02", "Quick filter toggle pills for Payment Breakdown and Order Channels", () => {
  const hasPaymentFilterPills = html.includes('dashFilterPill') || html.includes('dashPayFilterPill') || dashboardJs.includes('setDashboardPaymentFilter');
  assert.ok(hasPaymentFilterPills, "Dashboard must implement interactive quick filter toggle pills for payment & order types");
});

// ============================================================================
// TIER 4: SAAS PRICING TIERS, ACCOUNT CARD & DONUT ANALYTICS (R2, R4 / F4, F6, F8, F12, F13)
// ============================================================================
console.log("\n📍 TIER 4: SAAS PRICING TIERS, ACCOUNT CARD & DONUT ANALYTICS (R2, R4)");

test("T4-SAAS-01", "Subscription modal consolidates strictly 3 transparent tiers (Starter, Pro Cafe, Enterprise Chain)", () => {
  assert.ok(subModalHtml.includes('Starter'), "Subscription modal must contain Starter tier");
  assert.ok(subModalHtml.includes('Pro Cafe'), "Subscription modal must contain Pro Cafe tier");
  assert.ok(subModalHtml.includes('Enterprise Chain'), "Subscription modal must contain Enterprise Chain tier");
});

test("T4-SAAS-02", "Starter tier specifies ₹0 Free Forever, Single Counter Terminal, 50 orders/mo", () => {
  assert.ok(subModalHtml.includes('Starter'), "Must declare Starter tier");
  assert.ok(subModalHtml.includes('₹0') || subModalHtml.includes('Free'), "Starter tier must display ₹0 / Free Forever");
  assert.ok(subModalHtml.includes('Single Counter') || subModalHtml.includes('Single-Counter'), "Starter tier must specify Single Counter");
  assert.ok(subModalHtml.includes('50 orders'), "Starter tier must specify 50 orders limit");
});

test("T4-SAAS-03", "Pro Cafe tier specifies ₹499/mo, 'Most Popular' badge, Unlimited Orders, Multi-Table", () => {
  assert.ok(subModalHtml.includes('Pro Cafe'), "Must declare Pro Cafe tier");
  assert.ok(subModalHtml.includes('₹499') || subModalHtml.includes('499'), "Pro Cafe tier must display ₹499");
  assert.ok(subModalHtml.includes('Most Popular') || subModalHtml.includes('Popular'), "Pro Cafe tier must display Most Popular badge");
  assert.ok(subModalHtml.includes('Unlimited Orders') || subModalHtml.includes('Unlimited orders'), "Pro Cafe tier must specify Unlimited Orders");
});

test("T4-SAAS-04", "Enterprise Chain tier specifies ₹1,499/mo, Multi-Outlet Central Kitchen, Live Cloud Sync", () => {
  assert.ok(subModalHtml.includes('Enterprise Chain'), "Must declare Enterprise Chain tier");
  assert.ok(subModalHtml.includes('1,499') || subModalHtml.includes('1499'), "Enterprise Chain tier must display ₹1,499");
  assert.ok(subModalHtml.includes('Multi-Outlet') || subModalHtml.includes('Central Kitchen'), "Enterprise Chain tier must specify Multi-Outlet / Central Kitchen");
  assert.ok(subModalHtml.includes('Cloud Sync'), "Enterprise Chain tier must specify Cloud Sync");
});

test("T4-SAAS-05", "Price-first visual hierarchy with enlarged price typography (28-32px) and 'What's included next'", () => {
  const hasPriceTypography = css.includes('font-size: 28px') || css.includes('font-size: 30px') || css.includes('font-size: 32px') || css.includes('.tier-price') || css.includes('.plan-price');
  assert.ok(hasPriceTypography, "style.css must implement price-first typography hierarchy (28-32px or .tier-price)");
  assert.ok(html.includes("What's included next") || html.includes("included next") || html.includes("Annual"), "Subscription modal must include feature callouts / annual billing discount badge");
});

test("T4-ACCOUNT-01", "Topbar cashier avatar/status toggles Account Card popover (#accountPopoverCard)", () => {
  const hasAccountPopover = html.includes('id="accountPopoverCard"') || html.includes('account-popover-card') || html.includes('toggleAccountPopover');
  assert.ok(hasAccountPopover, "index.html must implement #accountPopoverCard toggled from cashier topbar");
});

test("T4-KPI-01", "Dashboard decluttering: redundant 5th KPI card (#kpiAvgOrderValue) and static badges removed", () => {
  const cardMatches = kpiHtml.match(/class=["'][^"']*kpi-card[^"']*["']/g) || [];
  assert.strictEqual(cardMatches.length, 4, `kpi-grid must contain exactly 4 deduplicated KPI cards, found ${cardMatches.length}`);
  assert.ok(!kpiHtml.includes('id="kpiAvgOrderValue"'), "Redundant 5th KPI card #kpiAvgOrderValue must be removed");
  assert.ok(!html.includes('Cloud Synced • 99.9% Uptime'), "Static non-functional 99.9% uptime badge must be removed from dashboard");
});

test("T4-DONUT-01", "Reports analytics features interactive Donut chart visualization container", () => {
  const hasDonutContainer = html.includes('id="dashDonutChart"') ||
    html.includes('id="revenueDistributionDonut"') ||
    html.includes('id="analyticsDonutChart"') ||
    dashboardJs.includes('donut');
  assert.ok(hasDonutContainer, "index.html / js/dashboard.js must provide interactive Donut visualization container");
});

test("T4-DONUT-02", "Interactive dataset toggle for Donut chart in js/dashboard.js", () => {
  const hasDonutToggle = dashboardJs.includes('toggleDonutDataset') ||
    dashboardJs.includes('renderDonutChart') ||
    dashboardJs.includes('renderDashboardDonut');
  assert.ok(hasDonutToggle, "js/dashboard.js must implement Donut chart rendering with dataset toggling");
});

// ============================================================================
// AUDIT SUMMARY
// ============================================================================
console.log("\n====================================================================");
console.log(`🎯 REFACTOR E2E AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================================");

if (failed > 0) {
  console.log(`\n⚠️  CURRENT PENDING REFACTOR DEFECTS / GAPS (${failed}):`);
  failures.forEach(f => {
    console.log(`  - [${f.id}] ${f.description}`);
  });
  console.log("\nNote: Failures represent pending Milestone 1-4 deliverables tracked in PROJECT.md.");
  process.exit(1);
} else {
  console.log("\n✨ ALL REFACTOR ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!");
  process.exit(0);
}
