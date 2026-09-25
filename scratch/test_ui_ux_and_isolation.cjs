// scratch/test_ui_ux_and_isolation.cjs
// Comprehensive Automated Test Suite: Clean UI/UX, 2-Item Demo State, Device Isolation, Logout Re-Login & Cloud Server Reset

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🎨 CLEAN UI/UX, DEMO ITEMS, ISOLATION & RESET AUDIT");
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

async function runAudit() {
  const rootDir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
  const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
  const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(rootDir, 'js', 'settings.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const authService = require(path.join(rootDir, 'server', 'auth-service.js'));
  const { pathToFileURL } = require('url');
  const invService = await import(pathToFileURL(path.join(rootDir, 'server', 'inventory-service.js')).href);

  // ----------------------------------------------------
  // SECTION 1: MODAL CLOSE BUTTON INVARIANT (CRITICAL 26)
  // ----------------------------------------------------
  console.log("📍 SECTION 1: MODAL CLOSE BUTTON INVARIANT");
  test("INV-1: Exactly 26 SVG modal close buttons matching regex in index.html", () => {
    const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(reg) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG close buttons, found ${matches.length}`);
  });

  test("INV-2: Total modal-close-btn class occurrences in index.html is exactly 26", () => {
    const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
    assert.strictEqual(allMatches.length, 26, `Expected exactly 26 class matches, found ${allMatches.length}`);
  });

  test("INV-3: New modals use custom non-conflicting close classes", () => {
    assert.ok(html.includes('class="upload_choice_close_btn"'), "Must use upload_choice_close_btn");
    assert.ok(html.includes('class="quick_stock_close_btn"'), "Must use quick_stock_close_btn");
    assert.ok(html.includes('class="danger_action_close_btn"'), "Must use danger_action_close_btn");
    assert.ok(html.includes('class="for_you_close_btn"'), "Must use for_you_close_btn");
  });

  // ----------------------------------------------------
  // SECTION 2: CLEAN DEMO STATE & RECIPE PORTION CONFIG
  // ----------------------------------------------------
  console.log("\n📍 SECTION 2: CLEAN DEMO STATE & RECIPES");
  test("DEMO-1: Default items in core.js initialize with Samosa, Tea, and Chicken Curry", () => {
    assert.ok(coreJs.includes('name: "Samosa"'), "Missing Samosa in core.js");
    assert.ok(coreJs.includes('price: 15'), "Samosa must be ₹15");
    assert.ok(coreJs.includes('stock: 10') || coreJs.includes('stockQty: 10'), "Samosa must have 10 pcs stock");
    assert.ok(coreJs.includes('name: "Tea"'), "Missing Tea in core.js");
    assert.ok(coreJs.includes('price: 10'), "Tea must be ₹10");
    assert.ok(coreJs.includes('name: "Chicken Curry"'), "Missing Chicken Curry in core.js");
    assert.ok(coreJs.includes('price: 150'), "Chicken Curry must be ₹150");
  });

  test("DEMO-2: auth-service initializes new store profile with Samosa, Tea, Chicken Curry & zero expenses", () => {
    const testCode = 'SHOP_TEST_DEMO_' + Date.now();
    const shop = authService.resolveShopTenant(testCode, 'Test Store');
    assert.ok(Array.isArray(shop.menu), "Menu must be an array");
    const samosa = shop.menu.find(i => i.name === 'Samosa');
    const tea = shop.menu.find(i => i.name === 'Tea');
    const chicken = shop.menu.find(i => i.name === 'Chicken Curry');
    assert.ok(samosa, "Shop must have Samosa");
    assert.strictEqual(samosa.price, 15);
    assert.strictEqual(samosa.stock, 10);
    assert.ok(tea, "Shop must have Tea");
    assert.strictEqual(tea.price, 10);
    assert.ok(chicken, "Shop must have Chicken Curry");
    assert.strictEqual(chicken.price, 150);
    assert.deepStrictEqual(shop.expenses, [], "Expenses must be empty");
  });

  test("DEMO-3: Dish Recipe & Portion Configurator supports Samosa, Tea and Chicken Curry", () => {
    const samosaFill = invService.getApproxAutoFill('Hot Crispy Samosa', 'Snacks');
    assert.ok(samosaFill && samosaFill.confidence.includes('Samosa'), "Auto-fill must recognize Samosa");
    assert.strictEqual(samosaFill.flour_qty, 0.05);

    const teaFill = invService.getApproxAutoFill('Special Masala Tea', 'Beverages');
    assert.ok(teaFill && teaFill.confidence.includes('Chai'), "Auto-fill must recognize Tea");
    assert.strictEqual(teaFill.protein_qty, 0.08);

    const chickenFill = invService.getApproxAutoFill('Chicken Curry Home Style', 'Main Course');
    assert.ok(chickenFill && chickenFill.confidence.includes('Poultry'), "Auto-fill must recognize Chicken Curry");
    assert.strictEqual(chickenFill.protein_name, 'Fresh Farm Chicken');
  });

  // ----------------------------------------------------
  // SECTION 3: UI/UX REDESIGN (SCREENSHOTS 1-3)
  // ----------------------------------------------------
  console.log("\n📍 SECTION 3: UI/UX REDESIGN (SCREENSHOTS 1-3)");
  test("UI-1: Screenshot 1 clean catalog elements: segmented tabs, dashed card, clean item cards", () => {
    assert.ok(html.includes('class="menu-segment-tabs"'), "Missing .menu-segment-tabs in index.html");
    assert.ok(html.includes('id="tabMenuInventoryBtn"'), "Missing #tabMenuInventoryBtn in index.html");
    assert.ok(html.includes('id="tabMenuCategoriesBtn"'), "Missing #tabMenuCategoriesBtn in index.html");
    assert.ok(html.includes('class="bulk-upload-dashed-card"'), "Missing .bulk-upload-dashed-card in index.html");
    assert.ok(html.includes('id="cleanItemCardsList"'), "Missing #cleanItemCardsList in index.html");
    assert.ok(css.includes('.clean-item-card'), "Missing .clean-item-card in style.css");
    assert.ok(css.includes('.adjust-stock-btn'), "Missing .adjust-stock-btn in style.css");
  });

  test("UI-2: Action buttons are normal flow (not sticky) and trigger upload & new item", () => {
    assert.ok(html.includes('id="menuCatalogAutoDetectBtn"'), "Missing #menuCatalogAutoDetectBtn in index.html");
    assert.ok(html.includes('openUploadMenuChoiceModal()'), "Menu button must open upload choice modal");
    assert.ok(html.includes('openAddMenuItemModal()'), "Add new item button present");
  });

  test("UI-3: Screenshot 2 settings elements: avatar header, GST pill & gold crown subscription card", () => {
    assert.ok(html.includes('class="settings-profile-header-card"'), "Missing .settings-profile-header-card in index.html");
    assert.ok(html.includes('id="settingsStoreAvatar"'), "Missing #settingsStoreAvatar in index.html");
    assert.ok(html.includes('BUSINESS &amp; GST SETTINGS') || html.includes('BUSINESS & GST SETTINGS'), "Missing Business & GST pill");
    assert.ok(html.includes('class="subscription-crown-card"'), "Missing .subscription-crown-card in index.html");
    assert.ok(html.includes('👑'), "Subscription card must feature crown icon");
    assert.ok(css.includes('.subscription-crown-card'), "Missing .subscription-crown-card in style.css");
  });

  test("UI-4: Screenshot 3 'For You' feature hub modal with purple gradient header", () => {
    assert.ok(html.includes('id="forYouModal"'), "Missing #forYouModal in index.html");
    assert.ok(html.includes('class="for-you-header"'), "Missing .for-you-header in index.html");
    assert.ok(css.includes('.for-you-header') && css.includes('#5B47FB'), "style.css must have purple gradient #5B47FB");
    assert.ok(html.includes('Indian Culinary Batch &amp; Recipe Engine') || html.includes('Indian Culinary Batch & Recipe Engine'), "Must list Indian culinary engine");
  });

  // ----------------------------------------------------
  // SECTION 4: LOGOUT, RE-LOGIN & MULTI-ACCOUNT ISOLATION
  // ----------------------------------------------------
  console.log("\n📍 SECTION 4: LOGOUT, RE-LOGIN & DEVICE ISOLATION");
  test("AUTH-ISO-1: logoutShop schedules clean reload returning to ?auth=login", () => {
    assert.ok(html.includes('auth=login'), "index.html logoutShop must target auth=login");
    assert.ok(appJs.includes('auth=login'), "app.js logoutShop must target auth=login");
    assert.ok(html.includes("localStorage.removeItem('billnaw_auth_token')"), "Must clear token");
    assert.ok(html.includes("openShopAuthModal();"), "Must trigger openShopAuthModal");
  });

  test("AUTH-ISO-2: Cold load with ?auth=login automatically presents #shopAuthModal", () => {
    assert.ok(html.includes("window.location.search.includes('auth=login')"), "index.html must check for auth=login");
    assert.ok(appJs.includes("window.location.search.includes('auth=login')"), "app.js must check for auth=login");
  });

  test("AUTH-ISO-3: Device isolation wipes local storage on account switch", () => {
    assert.ok(coreJs.includes('billnaw_last_device_email'), "core.js must track billnaw_last_device_email");
    assert.ok(coreJs.includes("idb.clear('cafe_menu')"), "Must wipe cafe_menu on email switch");
    assert.ok(coreJs.includes("idb.clear('cafe_history')"), "Must wipe cafe_history on email switch");
  });

  test("AUTH-ISO-4: Mandatory phone number persisted on signup", () => {
    const email = `test_phone_audit_${Date.now()}@billnawcafe.com`;
    const res = authService.registerUser({
      firstName: 'Vikram',
      lastName: 'Roy',
      shopName: 'Vikram Cafe',
      email,
      password: 'Password123!',
      phone: '+91 98765 12345'
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.shop.profile.phone.includes('9876512345'), "Phone must be persisted to profile");
  });

  // ----------------------------------------------------
  // SECTION 5: RESET ALL DATA (LOCAL & SERVER CLOUD)
  // ----------------------------------------------------
  console.log("\n📍 SECTION 5: RESET ALL DATA (LOCAL & CLOUD SERVER)");
  test("RESET-1: Settings view contains 'Clear All Store Data' danger tile", () => {
    assert.ok(html.includes('openClearAllDataModal()'), "index.html must call openClearAllDataModal()");
    assert.ok(html.includes('id="clearAllDataConfirmModal"'), "index.html must contain #clearAllDataConfirmModal");
    assert.ok(settingsJs.includes('openClearAllDataModal'), "settings.js must define openClearAllDataModal");
    assert.ok(settingsJs.includes('confirmClearAllData'), "settings.js must define confirmClearAllData");
  });

  test("RESET-2: POST /api/store/reset-data wipes cloud server store collections", () => {
    assert.ok(serverJs.includes('/api/store/reset-data'), "server.js must expose /api/store/reset-data");
    const testCode = 'SHOP_RESET_TEST_' + Date.now();
    authService.resolveShopTenant(testCode, 'Reset Cafe');
    const resetRes = authService.resetStoreCloudData(testCode);
    assert.strictEqual(resetRes.success, true);
    assert.strictEqual(resetRes.menu.length, 3);
    assert.strictEqual(resetRes.menu[0].name, 'Samosa');
  });

  console.log("\n====================================================");
  console.log(`🎯 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
