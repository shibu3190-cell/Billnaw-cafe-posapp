// ==============================================================================
// 🛡️ CHALLENGER 1: EMPIRICAL STRESS & REGRESSION TEST HARNESS
// Milestone 4: R1 (Viewport-Locked Shell & Navigation) & R2 (Culinary Grid & Cart)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');

let passCount = 0;
let failCount = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
    results.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Reason: ${err.message}`);
    failCount++;
    results.push({ name, status: 'FAIL', reason: err.message });
  }
}

console.log("==============================================================================");
console.log("🚀 CHALLENGER 1: EMPIRICAL HARNESS FOR MILESTONE 4 (R1 & R2)");
console.log("==============================================================================\n");

// ------------------------------------------------------------------------------
// SECTION 1: ROOT VIEWPORT LOCK & SHELL ERGONOMICS (R1)
// ------------------------------------------------------------------------------
console.log("--- Section 1: Root Viewport Lock & Document Rubber-Banding Prevention ---");

test("CH-R1-01: html tag explicitly enforces 100dvh, overflow: hidden & overscroll-behavior: none", () => {
  const htmlBlockMatch = css.match(/html\s*\{([^}]+)\}/);
  assert.ok(htmlBlockMatch, "style.css must have an explicit html rule");
  const block = htmlBlockMatch[1];
  assert.ok(block.includes('100dvh'), "html must include 100dvh for dynamic mobile browser bar handling");
  assert.ok(block.includes('overflow: hidden') || block.includes('overflow:hidden'), "html must lock overflow to hidden");
  assert.ok(block.includes('overscroll-behavior: none') || block.includes('overscroll-behavior:none'), "html must declare overscroll-behavior: none");
});

test("CH-R1-02: body tag explicitly enforces 100dvh, overflow: hidden & overscroll-behavior: none", () => {
  const bodyBlockMatch = css.match(/body\s*\{([^}]+)\}/);
  assert.ok(bodyBlockMatch, "style.css must have a body rule");
  const block = bodyBlockMatch[1];
  assert.ok(block.includes('100dvh'), "body must include 100dvh");
  assert.ok(block.includes('overflow: hidden') || block.includes('overflow:hidden'), "body must lock overflow to hidden");
  assert.ok(block.includes('overscroll-behavior: none') || block.includes('overscroll-behavior:none'), "body must declare overscroll-behavior: none");
});

test("CH-R1-03: .main-wrapper and .app-layout enforce global shell overflow: hidden", () => {
  assert.ok(css.includes('.main-wrapper, .app-layout {') || css.includes('.main-wrapper,') || css.includes('.app-layout {'),
    "style.css must contain wrapper shell rules");
  assert.ok(css.match(/\.main-wrapper[\s\S]*?overflow:\s*hidden/), ".main-wrapper must declare overflow: hidden");
});

test("CH-R1-04: Mobile media query enforces overflow: hidden on .main-content to stop scroll chaining", () => {
  const mobileMqMatch = css.match(/@media\s+screen\s+and\s+\(max-width:\s*640px\)[\s\S]*?\.main-content\s*\{([^}]+)\}/);
  assert.ok(mobileMqMatch, "style.css mobile media query must style .main-content");
  const contentRule = mobileMqMatch[1];
  assert.ok(contentRule.includes('overflow: hidden') || contentRule.includes('overflow:hidden'),
    ".main-content on mobile must enforce overflow: hidden");
  assert.ok(contentRule.includes('min-height: 0') || contentRule.includes('min-height:0'),
    ".main-content on mobile must enforce min-height: 0 for proper flex clipping");
});

test("CH-R1-05: Mobile #pos layout isolates scroll strictly to .pos-left", () => {
  const posActiveMatch = css.match(/#pos\.view\.active\s*\{([^}]+)\}/);
  assert.ok(posActiveMatch, "style.css must have #pos.view.active rule");
  assert.ok(posActiveMatch[1].includes('overflow: hidden'), "#pos.view.active must have overflow: hidden");

  const posLeftMatch = css.match(/\.pos-left\s*\{([^}]+)\}/g);
  assert.ok(posLeftMatch && posLeftMatch.length > 0, "style.css must define .pos-left");
  
  // Find the mobile .pos-left rule
  const mobileSectionMatch = css.match(/@media\s+screen\s+and\s+\(max-width:\s*640px\)[\s\S]*?\.pos-left\s*\{([^}]+)\}/);
  assert.ok(mobileSectionMatch, ".pos-left must be configured inside max-width: 640px");
  const mobilePosLeft = mobileSectionMatch[1];
  assert.ok(mobilePosLeft.includes('overflow-y: auto'), ".pos-left on mobile must scroll with overflow-y: auto");
  assert.ok(mobilePosLeft.includes('overscroll-behavior: contain'), ".pos-left must isolate momentum scroll with overscroll-behavior: contain");
  assert.ok(mobilePosLeft.includes('-webkit-overflow-scrolling: touch'), ".pos-left must enable -webkit-overflow-scrolling: touch");
  assert.ok(mobilePosLeft.includes('padding-bottom: 130px'), ".pos-left must have sufficient bottom padding above floating dock");
});

// ------------------------------------------------------------------------------
// SECTION 2: TOUCH ERGONOMICS & SAFE AREA INSETS (R1, R3)
// ------------------------------------------------------------------------------
console.log("\n--- Section 2: Touch Ergonomics & Safe Area Inset Geometry ---");

test("CH-R1-06: .slide-menu-close-btn enforces strictly >= 44x44px touch bounding box", () => {
  const match = css.match(/\.slide-menu-close-btn\s*\{([^}]+)\}/);
  assert.ok(match, "Missing .slide-menu-close-btn rule");
  const rule = match[1];
  assert.ok(rule.includes('min-width: 44px') || rule.includes('min-width:44px'), "Missing min-width: 44px on .slide-menu-close-btn");
  assert.ok(rule.includes('min-height: 44px') || rule.includes('min-height:44px'), "Missing min-height: 44px on .slide-menu-close-btn");
  assert.ok(rule.includes('width: 44px') || rule.includes('width:44px'), "Missing width: 44px on .slide-menu-close-btn");
  assert.ok(rule.includes('height: 44px') || rule.includes('height:44px'), "Missing height: 44px on .slide-menu-close-btn");
});

test("CH-R1-07: .topbar-menu-icon-btn enforces >= 44x44px minimum touch target", () => {
  const match = css.match(/\.topbar-menu-icon-btn\s*\{([^}]+)\}/);
  assert.ok(match, "Missing .topbar-menu-icon-btn rule");
  const rule = match[1];
  assert.ok(rule.includes('min-width: 44px') || rule.includes('min-width:44px'), "Missing min-width: 44px on .topbar-menu-icon-btn");
  assert.ok(rule.includes('min-height: 44px') || rule.includes('min-height:44px'), "Missing min-height: 44px on .topbar-menu-icon-btn");
});

test("CH-R1-08: .topbar-bell-btn enforces strictly >= 44x44px touch bounding box", () => {
  const match = css.match(/\.topbar-bell-btn\s*\{([^}]+)\}/);
  assert.ok(match, "Missing .topbar-bell-btn rule");
  const rule = match[1];
  assert.ok(rule.includes('min-width: 44px') || rule.includes('min-width:44px'), "Missing min-width: 44px on .topbar-bell-btn");
  assert.ok(rule.includes('min-height: 44px') || rule.includes('min-height:44px'), "Missing min-height: 44px on .topbar-bell-btn");
  assert.ok(rule.includes('width: 44px') || rule.includes('width:44px'), "Missing width: 44px on .topbar-bell-btn");
  assert.ok(rule.includes('height: 44px') || rule.includes('height:44px'), "Missing height: 44px on .topbar-bell-btn");
});

test("CH-R1-09: .more-close-btn enforces strictly >= 44x44px touch bounding box", () => {
  const match = css.match(/\.more-close-btn\s*\{([^}]+)\}/);
  assert.ok(match, "Missing .more-close-btn rule");
  const rule = match[1];
  assert.ok(rule.includes('min-width: 44px') || rule.includes('min-width:44px'), "Missing min-width: 44px on .more-close-btn");
  assert.ok(rule.includes('min-height: 44px') || rule.includes('min-height:44px'), "Missing min-height: 44px on .more-close-btn");
  assert.ok(rule.includes('width: 44px') || rule.includes('width:44px'), "Missing width: 44px on .more-close-btn");
  assert.ok(rule.includes('height: 44px') || rule.includes('height:44px'), "Missing height: 44px on .more-close-btn");
});

test("CH-R1-10: .slide-nav-item enforces min-height: 44px for thumb tap ergonomics", () => {
  const match = css.match(/\.slide-nav-item\s*\{([^}]+)\}/);
  assert.ok(match, "Missing .slide-nav-item rule");
  const rule = match[1];
  assert.ok(rule.includes('min-height: 44px') || rule.includes('min-height:44px'), "Missing min-height: 44px on .slide-nav-item");
});

test("CH-R1-11: Safe area padding formula applied to mobile bottom navigation, slide menu footer, and cart footer", () => {
  // Mobile bottom navigation bar (.sidebar)
  assert.ok(css.includes('env(safe-area-inset-bottom'), "style.css must declare safe-area-inset-bottom insets");
  
  // Cart footer
  const cartFooterMatch = css.match(/\.pos-right\s+\.cart-footer\s*\{([^}]+)\}/);
  assert.ok(cartFooterMatch, "Missing .pos-right .cart-footer rule in style.css");
  assert.ok(cartFooterMatch[1].includes('env(safe-area-inset-bottom'), "Cart footer must declare env(safe-area-inset-bottom)");

  // Slide menu footer
  const slideFooterMatch = css.match(/\.slide-menu-footer\s*\{([^}]+)\}/);
  assert.ok(slideFooterMatch, "Missing .slide-menu-footer rule in style.css");
  assert.ok(slideFooterMatch[1].includes('env(safe-area-inset-bottom'), "Slide menu footer must declare env(safe-area-inset-bottom)");
});

// ------------------------------------------------------------------------------
// SECTION 3: CULINARY ORDERING GRID RESPONSIVE MEDIA QUERIES (R2)
// ------------------------------------------------------------------------------
console.log("\n--- Section 3: Culinary Ordering Grid Responsive Media Queries ---");

test("CH-R2-01: .menu-grid strictly enforces 2 columns at mobile breakpoint (< 640px)", () => {
  const mobileGridMatches = css.match(/@media\s+screen\s+and\s+\(max-width:\s*640px\)[\s\S]*?\.menu-grid\s*\{([^}]+)\}/g);
  assert.ok(mobileGridMatches && mobileGridMatches.length > 0, "Missing .menu-grid rule in @media (max-width: 640px)");
  const hasStrict2Cols = mobileGridMatches.some(m => m.includes('repeat(2, 1fr) !important') || m.includes('repeat(2,1fr)!important'));
  assert.ok(hasStrict2Cols, "Mobile .menu-grid must declare grid-template-columns: repeat(2, 1fr) !important");
});

test("CH-R2-02: .menu-grid strictly enforces 4 columns on desktop/tablet (>= 641px)", () => {
  const desktopGridMatches = css.match(/@media\s+screen\s+and\s+\(min-width:\s*641px\)[\s\S]*?\.menu-grid\s*\{([^}]+)\}/g);
  assert.ok(desktopGridMatches && desktopGridMatches.length > 0, "Missing .menu-grid rule in @media (min-width: 641px)");
  const hasStrict4Cols = desktopGridMatches.some(m => m.includes('repeat(4, 1fr) !important') || m.includes('repeat(4,1fr)!important'));
  assert.ok(hasStrict4Cols, "Desktop .menu-grid must declare grid-template-columns: repeat(4, 1fr) !important");
});

test("CH-R2-03: Tablet split-screen landscape (641px - 1080px) enforces strictly 4 columns", () => {
  const tabletMqMatch = css.match(/@media\s+screen\s+and\s+\(min-width:\s*641px\)\s+and\s+\(max-width:\s*1080px\)[\s\S]*?\.menu-grid\s*\{([^}]+)\}/);
  assert.ok(tabletMqMatch, "Missing .menu-grid rule in tablet split-screen media query");
  assert.ok(tabletMqMatch[1].includes('repeat(4, 1fr) !important'), "Tablet split-screen must enforce 4 columns");
});

test("CH-R2-04: Default base .menu-grid specifies 4 columns with gap: 12px", () => {
  const baseMatch = css.match(/\.menu-grid\s*\{([^}]+)\}/);
  assert.ok(baseMatch, "style.css must have base .menu-grid declaration");
  assert.ok(baseMatch[1].includes('grid-template-columns: repeat(4, 1fr)'), "Base .menu-grid must default to repeat(4, 1fr)");
  assert.ok(baseMatch[1].includes('gap: 12px'), "Base .menu-grid must define gap: 12px");
});

// ------------------------------------------------------------------------------
// SECTION 4: UNIFIED AI MENU INGESTION HERO CARD (R2)
// ------------------------------------------------------------------------------
console.log("\n--- Section 4: Unified AI Menu Ingestion Hero Card Deduplication ---");

test("CH-R2-05: Exactly one #menuCatalogAutoDetectBtn exists in index.html (no duplicate header button)", () => {
  const matches = html.match(/id=["']menuCatalogAutoDetectBtn["']/g) || [];
  assert.strictEqual(matches.length, 1, `Expected exactly 1 #menuCatalogAutoDetectBtn in index.html, found ${matches.length}`);
});

test("CH-R2-06: Catalog topbar action group retains ONLY '+ Add New Item' button", () => {
  const menuViewStart = html.indexOf('id="menu"');
  const cardStart = html.indexOf('<div class="card"', menuViewStart);
  const searchWrap = html.indexOf('catalog-search-wrap', cardStart);
  const headerActionsBlock = html.substring(cardStart, searchWrap);

  assert.ok(headerActionsBlock.includes('openAddMenuItemModal()'), "Topbar must retain openAddMenuItemModal()");
  assert.ok(!headerActionsBlock.includes('openUploadMenuChoiceModal()'),
    "Topbar must NOT contain duplicate openUploadMenuChoiceModal() trigger");
  assert.ok(!headerActionsBlock.includes('id="menuCatalogAutoDetectBtn"'),
    "Topbar must NOT contain #menuCatalogAutoDetectBtn");
});

test("CH-R2-07: Unified hero ingestion card retains dragover, ondrop & click triggers", () => {
  const cardMatch = html.match(/<div\b[^>]*class=["'][^"']*bulk-upload-dashed-card[^"']*["'][^>]*>/);
  assert.ok(cardMatch, "Missing .bulk-upload-dashed-card in index.html");
  const cardTag = cardMatch[0];
  assert.ok(cardTag.includes('ondragover="event.preventDefault();"'), "Missing ondragover on .bulk-upload-dashed-card");
  assert.ok(cardTag.includes('ondrop="handleMenuDrop(event);"'), "Missing ondrop='handleMenuDrop(event);' on .bulk-upload-dashed-card");
  assert.ok(cardTag.includes('openUploadMenuChoiceModal()'), "Missing openUploadMenuChoiceModal() on .bulk-upload-dashed-card");
});

test("CH-R2-08: Unified hero ingestion card embeds Camera Snap & Auto-Detect Menu buttons", () => {
  const cardStart = html.indexOf('class="bulk-upload-dashed-card"');
  const cardEnd = html.indexOf('id="cleanItemCardsList"', cardStart);
  assert.ok(cardStart !== -1 && cardEnd !== -1, "Missing bounds for .bulk-upload-dashed-card");
  const cardBlock = html.substring(cardStart, cardEnd);

  assert.ok(cardBlock.includes("document.getElementById('aiMenuCameraInput').click()"),
    "Hero card must contain camera snap trigger");
  assert.ok(cardBlock.includes('id="menuCatalogAutoDetectBtn"'),
    "Hero card must house #menuCatalogAutoDetectBtn");
  assert.ok(cardBlock.includes('openUploadMenuChoiceModal()'),
    "Hero card must call openUploadMenuChoiceModal()");
  
  // Check vector SVGs used, zero raw emojis
  assert.ok(cardBlock.includes('<svg'), "Hero card must use vector SVGs");
  assert.ok(!cardBlock.includes('📸'), "Hero card must not use raw camera emoji");
  assert.ok(!cardBlock.includes('⚡'), "Hero card must not use raw lightning emoji");
});

test("CH-R2-09: js/menu.js handleMenuDrop function exists and delegates to processAIMenu", () => {
  assert.ok(menuJs.includes('function handleMenuDrop(event)'), "js/menu.js must define handleMenuDrop");
  assert.ok(menuJs.includes('processAIMenu(event)'), "handleMenuDrop must delegate to processAIMenu");
  assert.ok(menuJs.includes('window.handleMenuDrop = handleMenuDrop;'), "handleMenuDrop must be exposed to window");
});

// ------------------------------------------------------------------------------
// SECTION 5: POS CART DRAWER & FIXED DESKTOP SIDEBAR (R2)
// ------------------------------------------------------------------------------
console.log("\n--- Section 5: POS Cart Drawer (Mobile Slide-Up vs Desktop Fixed Sidebar) ---");

test("CH-R2-10: Desktop .pos-right is configured as fixed 360px sidebar with scroll containment", () => {
  const desktopMatch = css.match(/\.pos-right\s*\{([^}]+)\}/);
  assert.ok(desktopMatch, "Missing base/desktop .pos-right in style.css");
  const rule = desktopMatch[1];
  assert.ok(rule.includes('width: 360px'), "Desktop .pos-right must have width: 360px");
  assert.ok(rule.includes('overflow: hidden'), "Desktop .pos-right must have overflow: hidden");
  assert.ok(rule.includes('display: flex'), "Desktop .pos-right must have display: flex");

  const cartContainerMatch = css.match(/\.cart-items-container\s*\{([^}]+)\}/);
  assert.ok(cartContainerMatch, "Missing .cart-items-container in style.css");
  const containerRule = cartContainerMatch[1];
  assert.ok(containerRule.includes('overflow-y: auto'), ".cart-items-container must scroll internally");
  assert.ok(containerRule.includes('overscroll-behavior: contain'), ".cart-items-container must contain scroll");
});

test("CH-R2-11: Mobile .pos-right is configured as fixed slide-up sheet (bottom: -120% / bottom: 0)", () => {
  const mobileMatch = css.match(/@media\s+screen\s+and\s+\(max-width:\s*640px\)[\s\S]*?\.pos-right\s*\{([^}]+)\}/);
  assert.ok(mobileMatch, "Missing mobile .pos-right rule");
  const rule = mobileMatch[1];
  assert.ok(rule.includes('position: fixed'), "Mobile .pos-right must be position: fixed");
  assert.ok(rule.includes('bottom: -120%'), "Mobile .pos-right must be offscreen by default");
  assert.ok(rule.includes('border-radius: 28px 28px 0 0'), "Mobile .pos-right must have rounded top sheet corners");

  assert.ok(css.includes('.pos-right.open { bottom: 0; }'), "style.css must have .pos-right.open { bottom: 0; }");
});

test("CH-R2-12: Mobile drawer includes grab handle, overlay dismissal and close button", () => {
  assert.ok(html.includes('id="cartDrawerOverlay" class="drawer-overlay" onclick="toggleCartDrawer()"'),
    "index.html must include #cartDrawerOverlay calling toggleCartDrawer()");
  assert.ok(html.includes('<div class="drawer-handle"></div>'),
    "index.html must include .drawer-handle");
  assert.ok(html.includes('class="close-drawer-btn" onclick="toggleCartDrawer()"'),
    "index.html must include .close-drawer-btn calling toggleCartDrawer()");
  assert.ok(css.includes('.drawer-handle { display: block;'),
    "style.css must display .drawer-handle on mobile");
  assert.ok(css.includes('touch-action: pan-y;'),
    ".drawer-handle must declare touch-action: pan-y");
});

test("CH-R2-13: Floating cart bar (#floatingCart) exists in index.html with dual touch triggers", () => {
  const fcMatch = html.match(/id=["']floatingCart["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(fcMatch, "index.html must include #floatingCart");
  const fcBlock = fcMatch[0];
  assert.ok(fcBlock.includes('onclick="toggleCartDrawer()"'), "Floating cart must trigger toggleCartDrawer()");
  assert.ok(fcBlock.includes('onclick="openCheckoutModal()"'), "Floating cart must have checkout trigger");
  assert.ok(fcBlock.includes('id="fc-count"'), "Floating cart must include #fc-count");
  assert.ok(fcBlock.includes('id="fc-total"'), "Floating cart must include #fc-total");
});

// ------------------------------------------------------------------------------
// SECTION 6: INVARIANT VERIFICATION: 26 MODAL CLOSE BUTTONS (R4)
// ------------------------------------------------------------------------------
console.log("\n--- Section 6: Invariant Verification: 26 SVG Modal Close Buttons ---");

test("CH-INV-01: Exactly 26 SVG modal close buttons matching exact regex in index.html", () => {
  const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
  const matches = html.match(regex) || [];
  assert.strictEqual(matches.length, 26, `Regex matched ${matches.length} elements (strictly 26 required)`);
});

test("CH-INV-02: Total class='modal-close-btn' occurrences in index.html is strictly 26", () => {
  const classMatches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
  assert.strictEqual(classMatches.length, 26, `Found ${classMatches.length} occurrences of class modal-close-btn (strictly 26 required)`);
});

test("CH-INV-03: Zero raw unicode '✕' characters in any modal close button", () => {
  const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/g) || [];
  for (const m of matches) {
    assert.ok(!m.includes('✕') && !m.includes('&#10005;') && !m.includes('&times;'),
      `Modal close button contains raw unicode close character: ${m}`);
  }
});

test("CH-INV-04: Non-modal dialogs and sheets strictly use distinct close classes", () => {
  assert.ok(html.includes('class="slide-menu-close-btn"'), "Slide menu drawer must use .slide-menu-close-btn");
  assert.ok(html.includes('class="more-close-btn"'), "More hub must use .more-close-btn");
  assert.ok(html.includes('class="close-drawer-btn"'), "Cart drawer must use .close-drawer-btn");
  assert.ok(html.includes('class="upload_choice_close_btn"'), "Upload choice modal must use .upload_choice_close_btn");
  assert.ok(html.includes('class="khata-close-btn"'), "Khata modals must use .khata-close-btn");
});

// ------------------------------------------------------------------------------
// SUMMARY & VERDICT GENERATION
// ------------------------------------------------------------------------------
console.log("\n==============================================================================");
console.log(`📊 CHALLENGER 1 AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log("==============================================================================");

if (failCount > 0) {
  console.log("\n❌ VERDICT: REQUEST_CHANGES");
  console.log("Failed tests:");
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(` - ${r.name}: ${r.reason}`));
  process.exit(1);
} else {
  console.log("\n✨ VERDICT: APPROVE");
  console.log("All R1 & R2 architectural requirements and system invariants successfully verified!");
  process.exit(0);
}
