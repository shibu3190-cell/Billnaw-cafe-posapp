// scratch/test_culinary_and_sessions.cjs - Full Test Suite for Logout/Sessions and Indian Culinary Inventory
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🍛 CULINARY INVENTORY & SESSION MANAGEMENT AUDIT");
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
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const cssPath = path.join(rootDir, 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

(async () => {
  // ----------------------------------------------------
  // SECTION 1: INVARIANT CHECKS (CRITICAL SYSTEM RULES)
  // ----------------------------------------------------
  console.log("📍 SECTION 1: INVARIANT PRESERVATION AUDIT");

  test("INV-1: Exactly 26 SVG modal close buttons matching regex in index.html", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, "No modal-close-btn found");
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26, got ${svgMatches.length}`);
  });

  test("INV-2: Total modal-close-btn class occurrences in index.html is exactly 26", () => {
    const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
    assert.ok(allMatches, "No modal-close-btn classes found");
    assert.strictEqual(allMatches.length, 26, `Expected exactly 26, got ${allMatches.length}`);
  });

  test("INV-3: Zero raw unicode '✕' characters inside modal-close-btn", () => {
    const rawMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[^<]*✕[^<]*<\/button>/g);
    assert.strictEqual(rawMatches, null, "Found forbidden raw ✕ modal-close-btn");
  });

  test("INV-4: #shopAuthModal NEVER uses class modal-close-btn", () => {
    const modalMatch = html.match(/<div\b[^>]*id=["']shopAuthModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
    assert.ok(modalMatch, "Could not locate #shopAuthModal");
    assert.ok(!modalMatch[0].includes('modal-close-btn'), "Forbidden modal-close-btn in #shopAuthModal");
  });

  test("INV-5: #activeSessionsModal NEVER uses class modal-close-btn", () => {
    const startIndex = html.indexOf('id="activeSessionsModal"');
    const endIndex = html.indexOf('id="gstConfigModal"');
    assert.ok(startIndex !== -1 && endIndex !== -1, "Could not locate modal positions");
    const activeModalSnippet = html.slice(startIndex, endIndex);
    assert.ok(!activeModalSnippet.includes('modal-close-btn'), "Forbidden modal-close-btn in #activeSessionsModal");
    assert.ok(activeModalSnippet.includes('session-close-btn'), "Must use session-close-btn");
  });

  // ----------------------------------------------------
  // SECTION 2: REQUIREMENT 1 - LOGOUT, RE-LOGIN & SESSIONS
  // ----------------------------------------------------
  console.log("\n📍 SECTION 2: LOGOUT, RE-LOGIN & BACKEND SESSION MANAGEMENT");

  const authService = await import('../server/auth-service.js');

  test("AUTH-1: index.html contains #settingTileLogoutShop calling logoutShopCloudAccount()", () => {
    assert.ok(html.includes('id="settingTileLogoutShop"'), "Missing #settingTileLogoutShop");
    assert.ok(html.includes('onclick="logoutShopCloudAccount()"'), "Must call logoutShopCloudAccount()");
    assert.ok(html.includes('window.logoutShopCloudAccount = logoutShop;'), "Must export logoutShopCloudAccount");
  });

  test("AUTH-2: index.html contains #settingTileActiveSessions calling openActiveSessionsModal()", () => {
    assert.ok(html.includes('id="settingTileActiveSessions"'), "Missing #settingTileActiveSessions");
    assert.ok(html.includes('onclick="openActiveSessionsModal()"'), "Must call openActiveSessionsModal()");
    assert.ok(html.includes('id="activeSessionsModal"'), "Missing #activeSessionsModal");
  });

  test("AUTH-3: logoutShop() sends /api/auth/logout with Bearer token & clears credentials", () => {
    assert.ok(html.includes("fetch('/api/auth/logout'"), "Must call /api/auth/logout");
    assert.ok(html.includes("localStorage.removeItem('billnaw_auth_token')"), "Must clear auth token");
    assert.ok(html.includes("localStorage.removeItem('billnaw_auth_email')"), "Must clear auth email");
    assert.ok(html.includes("localStorage.removeItem('billnaw_shop_session')"), "Must clear shop session");
    assert.ok(html.includes("openShopAuthModal();"), "Must immediately open shopAuthModal for re-login");
  });

  test("AUTH-4: Backend listActiveSessions, revokeSession & revokeSessionsForStore operate accurately", () => {
    authService.resetAuthStore();

    // Create session 1
    const s1 = authService.sendOtp('owner1@billnawcafe.com');
    const auth1 = authService.verifyOtp('owner1@billnawcafe.com', s1.data.devOtp, 'Shop Alpha');
    const token1 = auth1.data.token;
    const storeCode1 = auth1.data.storeCode;

    // Create session 2 for same store
    const s2 = authService.sendOtp('owner1@billnawcafe.com');
    const auth2 = authService.verifyOtp('owner1@billnawcafe.com', s2.data.devOtp, 'Shop Alpha');
    const token2 = auth2.data.token;

    // Create session 3 for different store
    const s3 = authService.sendOtp('owner2@billnawcafe.com');
    const auth3 = authService.verifyOtp('owner2@billnawcafe.com', s3.data.devOtp, 'Shop Beta');
    const token3 = auth3.data.token;
    const storeCode2 = auth3.data.storeCode;

    // List sessions for Shop Alpha
    const alphaSessions = authService.listActiveSessions(storeCode1);
    assert.strictEqual(alphaSessions.length, 2, "Shop Alpha must have 2 active sessions");

    // Revoke specific session by token
    const revRes = authService.revokeSession(token1);
    assert.strictEqual(revRes.status, 200, "revokeSession should return 200");
    const afterRev = authService.listActiveSessions(storeCode1);
    assert.strictEqual(afterRev.length, 1, "Shop Alpha must have 1 active session remaining");

    // Revoke all for store
    const revAll = authService.revokeSessionsForStore(storeCode1);
    assert.strictEqual(revAll.status, 200);
    const alphaZero = authService.listActiveSessions(storeCode1);
    assert.strictEqual(alphaZero.length, 0, "All sessions for Shop Alpha revoked");

    // Shop Beta unaffected
    const betaSessions = authService.listActiveSessions(storeCode2);
    assert.strictEqual(betaSessions.length, 1, "Shop Beta sessions preserved");
  });

  test("AUTH-5: logoutSession purges both session and active OTP for user", () => {
    authService.resetAuthStore();
    const otpRes = authService.sendOtp('logout_audit@billnawcafe.com');
    const auth = authService.verifyOtp('logout_audit@billnawcafe.com', otpRes.data.devOtp, 'Audit Cafe');
    const token = auth.data.token;

    // Send a new pending OTP
    const pendingOtp = authService.sendOtp('logout_audit@billnawcafe.com');
    assert.strictEqual(pendingOtp.status, 200);

    // Call logout
    const logoutRes = authService.logoutSession(token);
    assert.strictEqual(logoutRes.status, 200);

    // Verify session destroyed
    const chkSess = authService.verifySession(token);
    assert.strictEqual(chkSess.status, 401, "Session must be destroyed");

    // Verify pending OTP was purged
    const verifyPending = authService.verifyOtp('logout_audit@billnawcafe.com', pendingOtp.data.devOtp);
    assert.strictEqual(verifyPending.status, 400, "Pending OTP must be purged on logout");
  });

  test("AUTH-6: revokeSessionsForStore preserves excepted session by hashed sessionId", () => {
    authService.resetAuthStore();
    const s1 = authService.sendOtp('hashed_test1@billnawcafe.com');
    const a1 = authService.verifyOtp('hashed_test1@billnawcafe.com', s1.data.devOtp, 'Hashed Store');
    const storeCode = a1.data.storeCode;

    const s2 = authService.sendOtp('hashed_test1@billnawcafe.com');
    const a2 = authService.verifyOtp('hashed_test1@billnawcafe.com', s2.data.devOtp, 'Hashed Store');

    const activeList = authService.listActiveSessions(storeCode);
    assert.strictEqual(activeList.length, 2);

    // Except session 1 by its hashed id
    const hashedId1 = activeList.find(s => s.token === a1.data.token).id;
    const revRes = authService.revokeSessionsForStore(storeCode, hashedId1);
    assert.strictEqual(revRes.status, 200);

    const remaining = authService.listActiveSessions(storeCode);
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].token, a1.data.token, "Session excepted by hashed ID must remain active");
  });

  test("AUTH-7: index.html implements revokeCurrentSessionAndLogout and app.js calls /api/auth/logout", () => {
    assert.ok(html.includes('revokeCurrentSessionAndLogout'), "index.html must implement revokeCurrentSessionAndLogout");
    const appJsContent = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
    assert.ok(appJsContent.includes('/api/auth/logout'), "app.js logoutShop must call /api/auth/logout");
  });

  // ----------------------------------------------------
  // SECTION 3: REQUIREMENT 2 - MORNING BATCHING & SUB-RECIPES
  // ----------------------------------------------------
  console.log("\n📍 SECTION 3: MORNING BATCHING & SUB-RECIPE COMPOSITION ENGINE");

  const invService = await import('../server/inventory-service.js');

  test("CUL-BATCH-1: Sub-recipes include Indian curry bases with ingredient composition", () => {
    invService.resetInventoryStore();
    const subList = invService.getSubRecipes();
    assert.ok(Array.isArray(subList) && subList.length >= 4, "Must have at least 4 sub-recipes");

    const makhani = subList.find(s => s.id === 'SUB-MAK-01');
    assert.ok(makhani, "Missing SUB-MAK-01 (Makhani Gravy Base)");
    assert.strictEqual(makhani.yield_unit, 'Litre');
    assert.strictEqual(makhani.yield_quantity, 20.0);
    assert.ok(makhani.unit_production_cost > 0, "Makhani Gravy must have dynamic unit production cost");

    const hasTomatoes = makhani.ingredients.find(i => i.material_id === 'RM-TOMATO');
    assert.ok(hasTomatoes && hasTomatoes.quantity === 15.0, "Makhani recipe requires 15kg tomatoes");
  });

  test("CUL-BATCH-2: Morning bulk batch production deducts bulk raw materials and increments sub-recipe stock", () => {
    invService.resetInventoryStore();

    const rawBefore = invService.getRawMaterials();
    const tomatoesBefore = rawBefore.find(r => r.id === 'RM-TOMATO').current_stock;
    const gingerBefore = rawBefore.find(r => r.id === 'RM-GINGER-GARLIC').current_stock;
    const butterBefore = rawBefore.find(r => r.id === 'RM-BUTTER').current_stock;

    const subBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    // Produce 20 Litres of Makhani Gravy
    const batchRes = invService.produceMorningBatch('SUB-MAK-01', 20.0);
    assert.strictEqual(batchRes.status, 200, "Batch production must succeed");
    assert.ok(batchRes.data.success);
    assert.strictEqual(batchRes.data.produced, 20.0);

    const rawAfter = invService.getRawMaterials();
    const tomatoesAfter = rawAfter.find(r => r.id === 'RM-TOMATO').current_stock;
    const gingerAfter = rawAfter.find(r => r.id === 'RM-GINGER-GARLIC').current_stock;
    const butterAfter = rawAfter.find(r => r.id === 'RM-BUTTER').current_stock;
    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    // Check raw materials deducted
    assert.strictEqual(tomatoesAfter, tomatoesBefore - 15.0, "15kg tomatoes deducted");
    assert.strictEqual(gingerAfter, gingerBefore - 2.0, "2kg ginger-garlic paste deducted");
    assert.strictEqual(butterAfter, butterBefore - 1.2, "1.2kg butter deducted");

    // Check sub-recipe stock credited
    assert.strictEqual(subAfter, subBefore + 20.0, "Makhani gravy stock incremented by 20L");
  });

  test("CUL-BATCH-3: Batch production fails gracefully when raw materials are insufficient", () => {
    invService.resetInventoryStore();
    // Deplete tomatoes
    invService.updateRawMaterialStock('RM-TOMATO', 2.0, true);

    const res = invService.produceMorningBatch('SUB-MAK-01', 20.0);
    assert.strictEqual(res.status, 400, "Should reject batch production due to raw material shortage");
    assert.ok(res.data.shortages.some(s => s.material_id === 'RM-TOMATO'), "Shortage reported for tomatoes");
  });

  // ----------------------------------------------------
  // SECTION 4: REQUIREMENT 2 - LIVE ORDER DEDUCTION & LIQUID TELEMETRY
  // ----------------------------------------------------
  console.log("\n📍 SECTION 4: LIVE ORDER DEDUCTION & BAR LIQUID TELEMETRY MATRIX");

  test("CUL-DEDUCT-1: Live dish order (Paneer Butter Masala) deducts semi-finished sub-recipe base directly", () => {
    invService.resetInventoryStore();

    const makhaniBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;
    const paneerBefore = invService.getRawMaterials().find(r => r.id === 'RM-PANEER').current_stock;

    // Place POS order: 2 portions of Paneer Butter Masala
    const order = {
      id: 'ORD-TEST-001',
      orderType: 'Dine-in',
      rawItems: [
        { name: 'Paneer Butter Masala', qty: 2, price: 280 }
      ]
    };

    const deductRes = invService.deductOrderInventory(order);
    assert.strictEqual(deductRes.status, 200);

    const makhaniAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;
    const paneerAfter = invService.getRawMaterials().find(r => r.id === 'RM-PANEER').current_stock;

    // 2 portions * 0.20L = 0.40L Makhani Gravy deducted from sub_recipe stock directly
    assert.strictEqual(Number((makhaniBefore - makhaniAfter).toFixed(2)), 0.40, "Deducted 0.40L Makhani Gravy sub-recipe");
    // 2 portions * 0.15kg = 0.30kg Paneer deducted from raw materials
    assert.strictEqual(Number((paneerBefore - paneerAfter).toFixed(2)), 0.30, "Deducted 0.30kg Paneer raw material");
  });

  test("CUL-LIQUID-1: Exact 1:1 volume deduction for spirits (30ml Single & 60ml Patiala Peg)", () => {
    invService.resetInventoryStore();

    const whiskyBefore = invService.getRawMaterials().find(r => r.id === 'RM-WHISKY-750').current_stock;

    // Order 1 Patiala Peg (60ml) and 1 Single Peg (30ml)
    const order = {
      id: 'ORD-BAR-001',
      orderType: 'Dine-in',
      rawItems: [
        { name: 'Patiala Peg Whisky (60ml)', qty: 1, price: 380 },
        { name: 'Single Peg Whisky (30ml)', qty: 1, price: 210 }
      ]
    };

    invService.deductOrderInventory(order);
    const whiskyAfter = invService.getRawMaterials().find(r => r.id === 'RM-WHISKY-750').current_stock;

    // Exact deduction: 60ml + 30ml = 90ml
    assert.strictEqual(whiskyBefore - whiskyAfter, 90, "Exact 90ml deducted from whisky bottle stock");
  });

  test("CUL-LIQUID-2: Draught craft beer applies configurable froth & tap line allowance buffer %", () => {
    invService.resetInventoryStore();

    const beerBefore = invService.getRawMaterials().find(r => r.id === 'RM-CRAFT-BEER-KEG').current_stock;

    // Order 1 Craft Beer Mug (500ml served with 6% froth buffer = 530ml deducted)
    const order = {
      id: 'ORD-BREW-001',
      orderType: 'Dine-in',
      rawItems: [
        { name: 'German Wheat Craft Beer Mug (500ml)', qty: 1, price: 320 }
      ]
    };

    const res = invService.deductOrderInventory(order);
    const deduction = res.data.record.deductions.find(d => d.component_type === 'draught_beer');

    assert.ok(deduction, "Must record draught_beer deduction with froth telemetry");
    assert.strictEqual(deduction.served_ml, 500);
    assert.strictEqual(deduction.froth_buffer_pct, 6.0);
    assert.strictEqual(deduction.buffer_ml, 30);
    assert.strictEqual(deduction.total_ml_deducted, 530);

    const beerAfter = invService.getRawMaterials().find(r => r.id === 'RM-CRAFT-BEER-KEG').current_stock;
    assert.strictEqual(beerBefore - beerAfter, 530, "Keg deducted by exactly 530ml (500ml + 6% froth buffer)");
  });

  test("CUL-DEDUCT-2: Live dish order with culinary alias ('Paneer Makhani') maps to Makhani Gravy sub-recipe", () => {
    invService.resetInventoryStore();
    const makhaniBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    const order = {
      id: 'ORD-ALIAS-001',
      orderType: 'Dine-in',
      rawItems: [{ name: 'Chef Special Paneer Makhani', qty: 1, price: 290 }]
    };

    const res = invService.deductOrderInventory(order);
    assert.strictEqual(res.status, 200);
    const subDeduct = res.data.record.deductions.find(d => d.component_type === 'sub_recipe');
    assert.ok(subDeduct, "Must match Makhani sub-recipe via culinary alias");
    assert.strictEqual(subDeduct.deducted, 0.20);

    const makhaniAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;
    assert.strictEqual(Math.round((makhaniBefore - makhaniAfter) * 100) / 100, 0.20);
  });

  test("CUL-DEDUCT-3: Live dish order with unmapped item ('Iced Cold Coffee') triggers fallback raw deductions", () => {
    invService.resetInventoryStore();
    const beansBefore = invService.getRawMaterials().find(r => r.id === 'RM-COFFEE-BEANS').current_stock;
    const milkBefore = invService.getRawMaterials().find(r => r.id === 'RM-MILK').current_stock;

    const order = {
      id: 'ORD-UNMAPPED-001',
      orderType: 'Dine-in',
      rawItems: [{ name: 'Unmapped Artisan Coffee Blend', qty: 2 }]
    };

    const res = invService.deductOrderInventory(order);
    assert.strictEqual(res.status, 200);

    const beansAfter = invService.getRawMaterials().find(r => r.id === 'RM-COFFEE-BEANS').current_stock;
    const milkAfter = invService.getRawMaterials().find(r => r.id === 'RM-MILK').current_stock;

    assert.ok(beansAfter < beansBefore, "Coffee beans must be deducted via fallback");
    assert.ok(milkAfter < milkBefore, "Milk must be deducted via fallback");
  });

  // ----------------------------------------------------
  // SECTION 5: REQUIREMENT 2 - LIVE FOOD COSTING & MARGIN ANALYSIS
  // ----------------------------------------------------
  console.log("\n📍 SECTION 5: LIVE FOOD COSTING & MARGIN ANALYSIS");

  test("CUL-COST-1: calculateDishCosting dynamically calculates cost, profit and gross margin %", () => {
    invService.resetInventoryStore();
    const costing = invService.calculateDishCosting();
    assert.ok(Array.isArray(costing) && costing.length > 0);

    const pbm = costing.find(c => c.dish_name === 'Paneer Butter Masala');
    assert.ok(pbm);
    assert.strictEqual(pbm.selling_price, 280);
    assert.ok(pbm.food_cost > 50 && pbm.food_cost < 150, "Food cost must be within reasonable range");
    assert.strictEqual(pbm.gross_profit, Math.round((280 - pbm.food_cost) * 100) / 100);
    assert.ok(pbm.gross_margin_pct >= 50, "Paneer butter masala has healthy gross margin");
  });

  test("CUL-COST-2: Supplier market price changes dynamically recalculate dish costs & margins", () => {
    invService.resetInventoryStore();
    const initialCosting = invService.calculateDishCosting();
    const pbmInitial = initialCosting.find(c => c.dish_name === 'Paneer Butter Masala');

    // Simulate tomato price surge from ₹40 to ₹90/kg
    const updateRes = invService.updateRawMaterialPrice('RM-TOMATO', 90);
    assert.strictEqual(updateRes.status, 200);

    const updatedCosting = invService.calculateDishCosting();
    const pbmUpdated = updatedCosting.find(c => c.dish_name === 'Paneer Butter Masala');

    // Cost must have increased and margin decreased
    assert.ok(pbmUpdated.food_cost > pbmInitial.food_cost, "Food cost must increase after tomato price surge");
    assert.ok(pbmUpdated.gross_margin_pct < pbmInitial.gross_margin_pct, "Gross margin % must decrease");
  });

  // ----------------------------------------------------
  // SECTION 6: REQUIREMENT 2 - CENTRAL KITCHEN & PURCHASE ORDERS
  // ----------------------------------------------------
  console.log("\n📍 SECTION 6: CENTRAL KITCHEN TRANSFERS & VENDOR PO MANAGEMENT");

  test("CUL-CK-1: Inter-outlet transfer dispatch and receipt credits receiving outlet", () => {
    invService.resetInventoryStore();

    // Create transfer
    const trfRes = invService.createTransfer({
      from_outlet: 'Central Kitchen Commissary',
      to_outlet: 'Park Street Bistro',
      items: [{ type: 'sub_recipe', id: 'SUB-MAK-01', name: 'Makhani Gravy Base', quantity: 10, unit: 'Litre' }]
    });
    assert.strictEqual(trfRes.status, 200);
    const trfId = trfRes.data.transfer.id;

    // Receive transfer
    const subBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;
    const recRes = invService.receiveTransfer(trfId);
    assert.strictEqual(recRes.status, 200);
    assert.strictEqual(recRes.data.transfer.status, 'Received');

    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;
    assert.strictEqual(subAfter, subBefore + 10, "Stock credited upon receiving transfer");
  });

  test("CUL-PO-1: Vendor Purchase Order generation and receiving auto-credits stock", () => {
    invService.resetInventoryStore();

    const riceBefore = invService.getRawMaterials().find(r => r.id === 'RM-BASMATI-RICE').current_stock;

    // Create PO
    const poRes = invService.createPurchaseOrder({
      vendor_name: 'Metro Cash & Carry Wholesale',
      items: [
        { material_id: 'RM-BASMATI-RICE', name: 'Basmati Rice', quantity: 40, unit: 'kg', unit_price: 115 }
      ]
    });
    assert.strictEqual(poRes.status, 200);
    const poId = poRes.data.purchase_order.id;

    // Receive PO
    const statusRes = invService.updatePurchaseOrderStatus(poId, 'Received');
    assert.strictEqual(statusRes.status, 200);

    const riceAfter = invService.getRawMaterials().find(r => r.id === 'RM-BASMATI-RICE').current_stock;
    assert.strictEqual(riceAfter, riceBefore + 40, "Basmati rice credited +40kg on PO receipt");
  });

  // ----------------------------------------------------
  // SECTION 7: REQUIREMENT 2 - FORECASTING, WASTE & QUICK AUDIT
  // ----------------------------------------------------
  console.log("\n📍 SECTION 7: PREDICTIVE FORECASTING, WASTE LOGGING & QUICK AUDIT");

  test("CUL-FC-1: Algorithmic forecasting provides recommendations (Upscale/Downscale/Maintain)", () => {
    invService.resetInventoryStore();
    const forecast = invService.getPredictiveForecast();
    assert.ok(Array.isArray(forecast) && forecast.length > 0);

    const tomato = forecast.find(f => f.material_id === 'RM-TOMATO');
    assert.ok(tomato, "Must include tomato in forecast");
    assert.ok(!tomato.daily_burn_rate.includes('NaN'), `daily_burn_rate must not be NaN: got ${tomato.daily_burn_rate}`);
    assert.ok(!isNaN(tomato.days_of_inventory_left), "days_of_inventory_left must be a valid number");
    assert.strictEqual(tomato.recommendation, 'Maintain', "Normal stock level yields Maintain recommendation");

    // Deplete tomatoes to 5kg (< 1 day burn rate)
    invService.updateRawMaterialStock('RM-TOMATO', 5.0, true);
    const criticalForecast = invService.getPredictiveForecast();
    const tomatoCritical = criticalForecast.find(f => f.material_id === 'RM-TOMATO');
    assert.ok(tomatoCritical.days_of_inventory_left <= 2, "Days left must be <= 2");
    assert.strictEqual(tomatoCritical.urgency, 'CRITICAL', "Urgency must be CRITICAL when depleted");
    assert.strictEqual(tomatoCritical.recommendation, 'Upscale Order (+25% buffer for peak rush)', "Must recommend Upscale Order for low stock");

    // Overstock Maida to 200kg (> 14 days)
    invService.updateRawMaterialStock('RM-MAIDA', 200.0, true);
    const overstockedForecast = invService.getPredictiveForecast();
    const maidaOverstocked = overstockedForecast.find(f => f.material_id === 'RM-MAIDA');
    assert.ok(maidaOverstocked.days_of_inventory_left > 14, "Days left must be > 14");
    assert.strictEqual(maidaOverstocked.urgency, 'Overstocked');
    assert.strictEqual(maidaOverstocked.recommendation, 'Downscale Order (-20% to avoid spoilage)');
  });

  test("CUL-WST-1: Waste logging deducts stock and tracks monetary loss", () => {
    invService.resetInventoryStore();
    const tomatoesBefore = invService.getRawMaterials().find(r => r.id === 'RM-TOMATO').current_stock;

    const res = invService.logWastage({
      item_id: 'RM-TOMATO',
      item_type: 'raw',
      quantity: 5.0,
      reason: 'Spoilage / Prep Trim',
      staff: 'Chef Sanjay'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.wastage.loss_value, 5.0 * 40); // 5kg * ₹40/kg = ₹200

    const tomatoesAfter = invService.getRawMaterials().find(r => r.id === 'RM-TOMATO').current_stock;
    assert.strictEqual(tomatoesAfter, tomatoesBefore - 5.0, "5kg tomatoes deducted for waste");
  });

  test("CUL-AUDIT-1: 15-minute quick stock-take audit reconciles variance & updates stock", () => {
    invService.resetInventoryStore();

    const auditRes = invService.performStockAudit([
      { material_id: 'RM-TOMATO', physical_count: 48.0 },
      { material_id: 'RM-ONION', physical_count: 42.0 }
    ]);
    assert.strictEqual(auditRes.status, 200);
    assert.strictEqual(auditRes.data.audited_items_count, 2);

    const rawAfter = invService.getRawMaterials();
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-TOMATO').current_stock, 48.0);
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-ONION').current_stock, 42.0);
  });

  console.log("\n====================================================");
  console.log(`🎯 TOTAL SUITE RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================");

  if (failed > 0) {
    process.exit(1);
  }
})();
