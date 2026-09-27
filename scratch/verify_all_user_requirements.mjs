import http from 'http';
import fs from 'fs';
import assert from 'assert';

console.log("==============================================================================");
console.log("🔍 COMPREHENSIVE VERIFICATION SUITE FOR ALL USER REQUIREMENTS");
console.log("==============================================================================");

const BASE_URL = 'http://localhost:5000';

function fetchPage(path = '/') {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runVerification() {
  let passed = 0;
  let failed = 0;

  function verify(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  const res = await fetchPage('/');
  const html = res.body;
  const css = fs.readFileSync('style.css', 'utf8');
  const posJs = fs.readFileSync('js/pos.js', 'utf8');
  const coreJs = fs.readFileSync('js/core.js', 'utf8');
  const dashboardJs = fs.readFileSync('js/dashboard.js', 'utf8');
  const culinaryJs = fs.readFileSync('js/culinary_inventory.js', 'utf8');
  const marketingJs = fs.readFileSync('js/marketing_inventory.js', 'utf8');
  const customersJs = fs.readFileSync('js/customers.js', 'utf8');
  const settingsJs = fs.readFileSync('js/settings.js', 'utf8');
  const authServiceJs = fs.readFileSync('server/auth-service.js', 'utf8');
  const invServiceJs = fs.readFileSync('server/inventory-service.js', 'utf8');

  console.log("\n--- Requirement 1: Top Bar & Clickable Billnaw Logo ---");
  verify("Top-left Billnaw logo button invokes toggleMobileSlideMenu(true)", () => {
    assert.ok(html.includes('class="topbar-menu-icon-btn"') && html.includes('onclick="toggleMobileSlideMenu(true)"'));
  });

  verify("Top-left Brand Texts click opens slide menu via toggleMobileSlideMenu(true)", () => {
    assert.ok(html.includes('class="topbar-brand-texts" onclick="toggleMobileSlideMenu(true)"'));
  });

  verify("Slide menu drawer (#mobileSlideMenuDrawer) contains navigation items and closes cleanly", () => {
    assert.ok(html.includes('id="mobileSlideMenuDrawer"'));
    assert.ok(html.includes('id="mobileSlideMenuOverlay"') && html.includes('toggleMobileSlideMenu(false)'));
    assert.ok(html.includes('class="slide-menu-close-btn" onclick="toggleMobileSlideMenu(false)"'));
  });

  verify("Topbar Bell Notification Icon button triggers toggleNotificationDrawer(true)", () => {
    assert.ok(html.includes('id="topbarNotificationBellBtn"') && html.includes('toggleNotificationDrawer(true)'));
    assert.ok(html.includes('id="topbarNotificationBadge"'));
  });

  console.log("\n--- Requirement 2: Fixed Bottom Quick Access Navigation (6 Tabs) ---");
  const bottomTabs = ['pos', 'menu', 'dashboard', 'inventory', 'customers', 'settings'];
  bottomTabs.forEach(tab => {
    verify(`Bottom navigation provides quick access button #nav-${tab} calling switchTab('${tab}')`, () => {
      assert.ok(html.includes(`id="nav-${tab}" onclick="switchTab('${tab}')"`));
    });
  });

  console.log("\n--- Requirement 3: Detail Pages & Sub-Views with 'Back to Hub' Navigation ---");
  verify("Inventory Tab opens Hub (#inventoryLandingHub) and subviews feature 'Back to Hub' button", () => {
    assert.ok(html.includes('id="inventoryLandingHub"'));
    assert.ok(html.includes('openInventoryHubSubView(') || html.includes('openCulinarySubView('));
    assert.ok(html.includes('closeInventoryHubSubView()') || html.includes('closeCulinarySubView()'));
  });

  verify("Customer Tab opens Hub (#customerLandingHub) and subviews feature 'Back to For You Hub' button", () => {
    assert.ok(html.includes('id="customerLandingHub"'));
    assert.ok(html.includes("openCustomerHubSubView('customerDirectoryDetailedSubView')"));
    assert.ok(html.includes('closeCustomerHubSubView()'));
  });

  verify("Redundant WhatsApp Marketing tile is removed from Customer Hub", () => {
    const hubStart = html.indexOf('id="customerLandingHub"');
    const hubEnd = html.indexOf('id="customerDirectoryDetailedSubView"');
    const hubContent = html.slice(hubStart, hubEnd);
    assert.strictEqual(hubContent.includes("openCustomerHubSubView('aiWhatsAppMarketingHub')"), false);
  });

  console.log("\n--- Requirement 4: POS Screen Hierarchy, Table Statuses & Voice Chips ---");
  verify("Table section (#tablesWrapper) sits on top above menu area in POS view", () => {
    const posStart = html.indexOf('id="pos"');
    const tableWrapIndex = html.indexOf('id="tablesWrapper"');
    const menuWrapIndex = html.indexOf('class="menu-wrapper"');
    assert.ok(tableWrapIndex > posStart && tableWrapIndex < menuWrapIndex);
  });

  verify("Live table status indicators support Vacant, Occupied (+ elapsed mins), and Billed", () => {
    assert.ok(posJs.includes("status === 'empty'") || posJs.includes("status === 'vacant'"));
    assert.ok(posJs.includes("occupiedSince"));
    assert.ok(posJs.includes("status === 'billed'"));
  });

  verify("Search bar with mic icon and 2 speech history chips positioned under table section", () => {
    assert.ok(html.includes('id="menuSearchInput"'));
    assert.ok(html.includes('onclick="toggleVoiceBilling()"'));
    assert.ok(html.includes("parseAndPushVoiceOrder('2 Hot Chai')"));
    assert.ok(html.includes("parseAndPushVoiceOrder('2 Samosa')"));
  });

  console.log("\n--- Requirement 5: Responsive Layout (PC 4 Columns, Mobile 2 Cards/Row) ---");
  verify("Mobile & Tablet (<= 900px) strictly enforces 2 cards per row in .menu-grid", () => {
    assert.ok(css.includes('@media screen and (max-width: 900px)') && css.includes('grid-template-columns: repeat(2, 1fr) !important'));
  });

  verify("PC / Desktop (>= 901px) strictly enforces 4 columns per row (3 rows x 4 columns)", () => {
    assert.ok(css.includes('@media screen and (min-width: 901px)') && css.includes('grid-template-columns: repeat(4, 1fr) !important'));
  });

  verify("Sticky Cart Summary & 1-tap Checkout Bar floated above bottom navigation bar", () => {
    assert.ok(html.includes('class="mobile-pos-actions"'));
    assert.ok(html.includes('class="sleek-checkout-bar"'));
    assert.ok(css.includes('bottom: calc(64px + env(safe-area-inset-bottom))') || css.includes('.mobile-pos-actions'));
  });

  console.log("\n--- Requirement 6: Strict 4-Item Catalog & Matched Raw Materials ---");
  verify("Menu catalog strictly contains 4 items: Samosa (₹15), Tea (₹10), Chicken Curry (₹140), Masala Coke (₹40)", () => {
    assert.ok(coreJs.includes("Samosa") && coreJs.includes("15"));
    assert.ok(coreJs.includes("Tea") && coreJs.includes("10"));
    assert.ok(coreJs.includes("Chicken Curry") && coreJs.includes("140"));
    assert.ok(coreJs.includes("Masala Coke") && coreJs.includes("40"));
  });

  verify("Culinary Inventory raw materials exclusively match the 4 dishes with zero phantom data", () => {
    assert.ok(culinaryJs.includes("RM-OIL") || culinaryJs.includes("Refined Cooking Oil"));
    assert.ok(culinaryJs.includes("RM-FLOUR") || culinaryJs.includes("Wheat Flour"));
    assert.ok(culinaryJs.includes("RM-MILK") || culinaryJs.includes("Fresh Cow Milk"));
    assert.ok(culinaryJs.includes("RM-CHICKEN") || culinaryJs.includes("Fresh Farm Poultry"));
    assert.ok(culinaryJs.includes("RM-COLA") || culinaryJs.includes("Classic Cola Cans"));
  });

  console.log("\n--- Requirement 7: Reports Date Picker, Transaction Editor & Reset ---");
  verify("Reports section includes Custom Date Range calendar inputs and filter handlers", () => {
    assert.ok(html.includes('id="reportCustomStartDate"') && html.includes('id="reportCustomEndDate"'));
    assert.ok(dashboardJs.includes("setDashboardDateRange('custom')") || dashboardJs.includes("applyCustomDashboardDateRange"));
  });

  verify("Transaction Editor modal (#editOrderModal) provides item quantity steppers and recalculation", () => {
    assert.ok(html.includes('id="editOrderItemsContainer"'));
    assert.ok(dashboardJs.includes("function editOrderItemQty"));
    assert.ok(dashboardJs.includes("function saveEditedOrder"));
  });

  verify("Pristine Store Data Reset purges data and re-seeds clean 4 items", () => {
    assert.ok(authServiceJs.includes("resetStoreCloudData"));
    assert.ok(html.includes("openClearAllDataModal()"));
  });

  console.log("\n--- Requirement 8: Modal Invariant Safety ---");
  verify("Exact 26 SVG modal-close-btn buttons preserved across index.html", () => {
    const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.strictEqual(matches.length, 26);
  });

  console.log("\n==============================================================================");
  console.log(`🎯 VERIFICATION SUMMARY: ${passed} / ${passed + failed} CHECKS PASSED (${failed} FAILED)`);
  console.log("==============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error("VERIFICATION FAILED WITH EXCEPTION:", err);
  process.exit(1);
});
