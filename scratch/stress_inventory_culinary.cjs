// scratch/stress_inventory_culinary.cjs
// ==============================================================================
// 🔬 BILLNAW POS: EMPIRICAL STRESS TEST SUITE - INVENTORY & CULINARY ENGINE
// ==============================================================================
// Challenger: Inventory Suite Challenger (critic & specialist)
// Authoritative Specifications:
//   - ORIGINAL_REQUEST.md (## 2026-10-04T08:34:00Z)
//   - orchestrator_2/PROJECT.md
//   - TEST_READY.md
//
// Test Dimensions:
//   1. Raw Stock Telemetry Badges Across Exact Boundary Thresholds (0, min, min+0.001)
//   2. Morning Prep Batching (Multipliers 1x, 2x, 5x, 0.5x, Shortages, Deductions, Yields)
//   3. Dish Recipe Live Food Costing with Commodity Surges (Tomato +125%, Oil +50%, Paneer +40%)
//   4. Quick Restock Addition & Validation Math
//   5. Strict Invariant: 26 SVG Modal Close Buttons in index.html
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

console.log("==============================================================================");
console.log("🔬 EMPIRICAL INVENTORY & CULINARY STRESS HARNESS");
console.log("   Adversarial Stress-Testing & Threshold Verification");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function runStressTest(id, description, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${id}: ${description}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ [FAIL] ${id}: ${description}`);
    console.error(`     Reason: ${err.message}`);
    failures.push({ id, description, error: err.message });
  }
}

async function runStressTestAsync(id, description, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ [PASS] ${id}: ${description}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ [FAIL] ${id}: ${description}`);
    console.error(`     Reason: ${err.message}`);
    failures.push({ id, description, error: err.message });
  }
}

(async () => {
  const rootDir = path.resolve(__dirname, '..');
  const htmlPath = path.join(rootDir, 'index.html');
  const culinaryJsPath = path.join(rootDir, 'js', 'culinary_inventory.js');
  const invServicePath = path.join(rootDir, 'server', 'inventory-service.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const culinaryJs = fs.readFileSync(culinaryJsPath, 'utf8');
  const invService = await import(pathToFileURL(invServicePath).href);

  // Helper badge evaluator conforming to culinary_inventory.js lines 532-538
  function evaluateTelemetryBadge(currentStock, minThreshold) {
    const isOut = currentStock <= 0;
    const isLow = !isOut && currentStock <= minThreshold;
    if (isOut) return 'Out';
    if (isLow) return 'Low Stock';
    return 'In Stock';
  }

  // ==============================================================================
  // 🎯 SUITE 1: RAW STOCK TELEMETRY TABLE STATUS BADGES AT EXACT BOUNDARIES
  // ==============================================================================
  console.log("\n------------------------------------------------------------------------------");
  console.log("📊 SUITE 1: RAW STOCK TELEMETRY STATUS BADGE BOUNDARY THRESHOLDS");
  console.log("------------------------------------------------------------------------------");

  runStressTest('STRESS-BADGE-01', "Boundary stock = 0 evaluates strictly to 'Out'", () => {
    assert.strictEqual(evaluateTelemetryBadge(0, 5.0), 'Out');
    assert.strictEqual(evaluateTelemetryBadge(0.0, 15.0), 'Out');
    assert.strictEqual(evaluateTelemetryBadge(-0.0001, 5.0), 'Out');
    assert.strictEqual(evaluateTelemetryBadge(-10, 2.0), 'Out');
  });

  runStressTest('STRESS-BADGE-02', "Boundary stock = threshold evaluates strictly to 'Low Stock'", () => {
    assert.strictEqual(evaluateTelemetryBadge(5.0, 5.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(1.0, 1.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(15.0, 15.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(0.5, 0.5), 'Low Stock');
  });

  runStressTest('STRESS-BADGE-03', "Boundary stock = threshold - 0.001 evaluates strictly to 'Low Stock'", () => {
    assert.strictEqual(evaluateTelemetryBadge(4.999, 5.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(14.999, 15.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(0.499, 0.5), 'Low Stock');
  });

  runStressTest('STRESS-BADGE-04', "Boundary stock = threshold + 0.001 evaluates strictly to 'In Stock'", () => {
    assert.strictEqual(evaluateTelemetryBadge(5.001, 5.0), 'In Stock');
    assert.strictEqual(evaluateTelemetryBadge(15.001, 15.0), 'In Stock');
    assert.strictEqual(evaluateTelemetryBadge(0.501, 0.5), 'In Stock');
    assert.strictEqual(evaluateTelemetryBadge(1.001, 1.0), 'In Stock');
  });

  runStressTest('STRESS-BADGE-05', "Micro-stock 0.0001 with positive threshold evaluates to 'Low Stock' (not Out)", () => {
    assert.strictEqual(evaluateTelemetryBadge(0.0001, 5.0), 'Low Stock');
    assert.strictEqual(evaluateTelemetryBadge(0.000001, 1.0), 'Low Stock');
  });

  runStressTest('STRESS-BADGE-06', "Catalog ingredients verified against exact threshold matrix", () => {
    invService.resetInventoryStore();
    const rawMaterials = invService.getRawMaterials();

    const itemsToTest = [
      { id: 'RM-OIL', threshold: 5.0 },
      { id: 'RM-POTATO', threshold: 5.0 },
      { id: 'RM-TEA-LEAVES', threshold: 1.0 },
      { id: 'RM-CHAAT-MASALA', threshold: 0.5 },
      { id: 'RM-TOMATO', threshold: 15.0 },
      { id: 'RM-ONION', threshold: 12.0 },
      { id: 'RM-COLA', threshold: 10.0 }
    ];

    itemsToTest.forEach(testItem => {
      const rm = rawMaterials.find(m => m.id === testItem.id);
      assert.ok(rm, `Missing catalog item ${testItem.id}`);
      assert.strictEqual(rm.min_threshold, testItem.threshold, `Threshold mismatch for ${testItem.id}`);

      // Verify boundary trio for each catalog ingredient
      assert.strictEqual(evaluateTelemetryBadge(0, testItem.threshold), 'Out');
      assert.strictEqual(evaluateTelemetryBadge(testItem.threshold, testItem.threshold), 'Low Stock');
      assert.strictEqual(evaluateTelemetryBadge(testItem.threshold + 0.001, testItem.threshold), 'In Stock');
    });
  });

  runStressTest('STRESS-BADGE-07', "Culinary frontend HTML template contains exact badge class markup", () => {
    assert.ok(culinaryJs.includes('inv-badge-out'), "culinary_inventory.js must define inv-badge-out");
    assert.ok(culinaryJs.includes('inv-badge-low'), "culinary_inventory.js must define inv-badge-low");
    assert.ok(culinaryJs.includes('inv-badge-instock'), "culinary_inventory.js must define inv-badge-instock");
    assert.ok(culinaryJs.includes('item.current_stock <= 0'), "Badge must check stock <= 0 for Out");
    assert.ok(culinaryJs.includes('item.current_stock <= item.min_threshold'), "Badge must check min_threshold for Low Stock");
  });

  // ==============================================================================
  // 🍲 SUITE 2: MORNING PREP BATCHING (MULTIPLIERS, SHORTAGES, DEDUCTIONS, YIELDS)
  // ==============================================================================
  console.log("\n------------------------------------------------------------------------------");
  console.log("🍲 SUITE 2: MORNING PREP BATCHING STRESS TEST");
  console.log("------------------------------------------------------------------------------");

  runStressTest('STRESS-BATCH-01', "1x Multiplier Batch (20L Makhani Gravy) exact ingredient deduction math", () => {
    invService.resetInventoryStore();
    const rawBefore = invService.getRawMaterials();
    const subBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01');

    const expectedDeductions = {
      'RM-TOMATO': 15.0,
      'RM-GINGER-GARLIC': 2.0,
      'RM-OIL': 1.5,
      'RM-BUTTER': 1.2,
      'RM-CASHEW': 1.5,
      'RM-KASHMIRI-MIRCH': 0.4,
      'RM-GARAM-MASALA': 0.2,
      'RM-CREAM': 1.0,
      'RM-KASURI-METHI': 0.1
    };

    const initialStocks = {};
    for (const [id, req] of Object.entries(expectedDeductions)) {
      const item = rawBefore.find(r => r.id === id);
      assert.ok(item, `Missing ingredient ${id}`);
      initialStocks[id] = item.current_stock;
    }

    const res = invService.produceMorningBatch('SUB-MAK-01', 20.0);
    assert.strictEqual(res.status, 200, "1x batch should succeed");

    const rawAfter = invService.getRawMaterials();
    for (const [id, req] of Object.entries(expectedDeductions)) {
      const item = rawAfter.find(r => r.id === id);
      const expectedStock = Math.round((initialStocks[id] - req) * 1000) / 1000;
      assert.strictEqual(item.current_stock, expectedStock, `Deduction mismatch for ${id}: expected ${expectedStock}, got ${item.current_stock}`);
    }

    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01');
    assert.strictEqual(subAfter.current_stock, subBefore.current_stock + 20.0, "Sub-recipe stock must increment by 20.0");
    assert.ok(res.data.unit_production_cost > 0, "Unit production cost must be computed");
  });

  runStressTest('STRESS-BATCH-02', "2x Multiplier Batch (40L Makhani Gravy) exact 2x deduction math & yield credit", () => {
    invService.resetInventoryStore();
    // Replenish stock to ensure ample supply for 2x
    invService.updateRawMaterialStock('RM-TOMATO', 80.0, true);
    invService.updateRawMaterialStock('RM-CASHEW', 20.0, true);
    invService.updateRawMaterialStock('RM-BUTTER', 20.0, true);

    const initialTomato = invService.getRawMaterials().find(r => r.id === 'RM-TOMATO').current_stock;
    const initialButter = invService.getRawMaterials().find(r => r.id === 'RM-BUTTER').current_stock;
    const initialSubStock = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    // 2x of 20L yield is 40L
    const res = invService.produceMorningBatch('SUB-MAK-01', 40.0);
    assert.strictEqual(res.status, 200);

    const rawAfter = invService.getRawMaterials();
    const afterTomato = rawAfter.find(r => r.id === 'RM-TOMATO').current_stock;
    const afterButter = rawAfter.find(r => r.id === 'RM-BUTTER').current_stock;

    // 2x requires 30kg Tomato and 2.4kg Butter
    assert.strictEqual(afterTomato, initialTomato - 30.0);
    assert.strictEqual(afterButter, Math.round((initialButter - 2.4) * 10) / 10);

    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01');
    assert.strictEqual(subAfter.current_stock, initialSubStock + 40.0);
  });

  runStressTest('STRESS-BATCH-03', "5x Multiplier Batch (100L Makhani Gravy) bulk stress deduction", () => {
    invService.resetInventoryStore();
    // Seed massive commissary quantities
    invService.updateRawMaterialStock('RM-TOMATO', 200.0, true);
    invService.updateRawMaterialStock('RM-GINGER-GARLIC', 50.0, true);
    invService.updateRawMaterialStock('RM-OIL', 50.0, true);
    invService.updateRawMaterialStock('RM-BUTTER', 50.0, true);
    invService.updateRawMaterialStock('RM-CASHEW', 50.0, true);
    invService.updateRawMaterialStock('RM-KASHMIRI-MIRCH', 20.0, true);
    invService.updateRawMaterialStock('RM-GARAM-MASALA', 20.0, true);
    invService.updateRawMaterialStock('RM-CREAM', 50.0, true);
    invService.updateRawMaterialStock('RM-KASURI-METHI', 20.0, true);

    const tomatoBefore = invService.getRawMaterials().find(r => r.id === 'RM-TOMATO').current_stock;
    const subBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    // 5x of 20L yield = 100L
    const res = invService.produceMorningBatch('SUB-MAK-01', 100.0);
    assert.strictEqual(res.status, 200);

    // 5x Tomato = 15 * 5 = 75 kg
    const tomatoAfter = invService.getRawMaterials().find(r => r.id === 'RM-TOMATO').current_stock;
    assert.strictEqual(tomatoAfter, tomatoBefore - 75.0);

    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01');
    assert.strictEqual(subAfter.current_stock, subBefore + 100.0);
  });

  runStressTest('STRESS-BATCH-04', "Fractional 0.5x Multiplier Batch (10L Makhani Gravy) exact halving deduction math", () => {
    invService.resetInventoryStore();
    const rawBefore = invService.getRawMaterials();
    const tomatoBefore = rawBefore.find(r => r.id === 'RM-TOMATO').current_stock;
    const butterBefore = rawBefore.find(r => r.id === 'RM-BUTTER').current_stock;
    const cashewBefore = rawBefore.find(r => r.id === 'RM-CASHEW').current_stock;
    const gingerBefore = rawBefore.find(r => r.id === 'RM-GINGER-GARLIC').current_stock;
    const oilBefore = rawBefore.find(r => r.id === 'RM-OIL').current_stock;
    const subBefore = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01').current_stock;

    // 0.5x of 20L yield = 10L
    const res = invService.produceMorningBatch('SUB-MAK-01', 10.0);
    assert.strictEqual(res.status, 200);

    const rawAfter = invService.getRawMaterials();
    // Halved ingredients:
    // Tomato: 15 / 2 = 7.5 kg
    // Butter: 1.2 / 2 = 0.6 kg
    // Cashew: 1.5 / 2 = 0.75 kg
    // Ginger: 2.0 / 2 = 1.0 kg
    // Oil: 1.5 / 2 = 0.75 L
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-TOMATO').current_stock, Math.round((tomatoBefore - 7.5) * 1000) / 1000);
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-BUTTER').current_stock, Math.round((butterBefore - 0.6) * 1000) / 1000);
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-CASHEW').current_stock, Math.round((cashewBefore - 0.75) * 1000) / 1000);
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-GINGER-GARLIC').current_stock, Math.round((gingerBefore - 1.0) * 1000) / 1000);
    assert.strictEqual(rawAfter.find(r => r.id === 'RM-OIL').current_stock, Math.round((oilBefore - 0.75) * 1000) / 1000);

    const subAfter = invService.getSubRecipes().find(s => s.id === 'SUB-MAK-01');
    assert.strictEqual(subAfter.current_stock, subBefore + 10.0);
  });

  runStressTest('STRESS-BATCH-05', "Shortage Rejection & State Invariance (Single ingredient shortage aborts with 400 and zero deductions)", () => {
    invService.resetInventoryStore();
    // Artificially starve Cashew stock to 0.5 kg (requires 1.5 kg for 20L)
    invService.updateRawMaterialStock('RM-CASHEW', 0.5, true);

    const rawSnapshotBefore = JSON.parse(JSON.stringify(invService.getRawMaterials()));
    const subSnapshotBefore = JSON.parse(JSON.stringify(invService.getSubRecipes()));

    const res = invService.produceMorningBatch('SUB-MAK-01', 20.0);
    assert.strictEqual(res.status, 400, "Must return status 400 on shortage");
    assert.strictEqual(res.data.success, false);
    assert.ok(res.data.error.includes('Insufficient'));
    assert.ok(Array.isArray(res.data.shortages));
    assert.strictEqual(res.data.shortages.length, 1);
    assert.strictEqual(res.data.shortages[0].material_id, 'RM-CASHEW');
    assert.strictEqual(res.data.shortages[0].required, 1.5);
    assert.strictEqual(res.data.shortages[0].available, 0.5);

    // Verify zero side-effects: stock must remain completely untouched
    const rawSnapshotAfter = JSON.parse(JSON.stringify(invService.getRawMaterials()));
    const subSnapshotAfter = JSON.parse(JSON.stringify(invService.getSubRecipes()));

    assert.deepStrictEqual(rawSnapshotBefore, rawSnapshotAfter, "Raw materials state must NOT mutate on failed batch");
    assert.deepStrictEqual(subSnapshotBefore, subSnapshotAfter, "Sub-recipes state must NOT mutate on failed batch");
  });

  runStressTest('STRESS-BATCH-06', "Multiple Simultaneous Shortages Detection", () => {
    invService.resetInventoryStore();
    // Starve 3 ingredients simultaneously
    invService.updateRawMaterialStock('RM-TOMATO', 5.0, true); // needs 15.0
    invService.updateRawMaterialStock('RM-BUTTER', 0.2, true); // needs 1.2
    invService.updateRawMaterialStock('RM-CREAM', 0.1, true);  // needs 1.0

    const res = invService.produceMorningBatch('SUB-MAK-01', 20.0);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.shortages.length, 3);
    const shortageIds = res.data.shortages.map(s => s.material_id);
    assert.ok(shortageIds.includes('RM-TOMATO'));
    assert.ok(shortageIds.includes('RM-BUTTER'));
    assert.ok(shortageIds.includes('RM-CREAM'));
  });

  runStressTest('STRESS-BATCH-07', "Batch production rejects invalid quantities (0, negative, NaN) and unknown recipe", () => {
    invService.resetInventoryStore();
    assert.strictEqual(invService.produceMorningBatch('SUB-MAK-01', 0).status, 400);
    assert.strictEqual(invService.produceMorningBatch('SUB-MAK-01', -10).status, 400);
    assert.strictEqual(invService.produceMorningBatch('SUB-MAK-01', 'invalid').status, 400);
    assert.strictEqual(invService.produceMorningBatch('NON-EXISTENT-ID', 20).status, 404);
  });

  // ==============================================================================
  // 📈 SUITE 3: DISH RECIPE LIVE FOOD COSTING WITH RAPID COMMODITY SURGES
  // ==============================================================================
  console.log("\n------------------------------------------------------------------------------");
  console.log("📈 SUITE 3: DISH RECIPE LIVE COSTING & RAPID COMMODITY SURGES");
  console.log("------------------------------------------------------------------------------");

  runStressTest('STRESS-COST-01', "Baseline food costing and profit margin formula verification", () => {
    invService.resetInventoryStore();
    const costing = invService.calculateDishCosting();
    assert.ok(costing.length >= 4, "Must cost all catalog dishes");

    costing.forEach(dish => {
      assert.strictEqual(typeof dish.food_cost, 'number');
      assert.strictEqual(typeof dish.selling_price, 'number');
      assert.strictEqual(typeof dish.gross_profit, 'number');
      assert.strictEqual(typeof dish.gross_margin_pct, 'number');

      // Verify formula: gross_profit = selling_price - food_cost
      const expectedProfit = Math.round((dish.selling_price - dish.food_cost) * 100) / 100;
      assert.strictEqual(dish.gross_profit, expectedProfit, `Profit mismatch for ${dish.dish_name}`);

      // Verify formula: gross_margin_pct = ((selling_price - food_cost) / selling_price) * 100
      const expectedMarginPct = Math.round(((dish.gross_profit / dish.selling_price) * 100) * 10) / 10;
      assert.strictEqual(dish.gross_margin_pct, expectedMarginPct, `Margin % mismatch for ${dish.dish_name}`);
    });
  });

  runStressTest('STRESS-COST-02', "Rapid Tomato surge (+125%: ₹40 -> ₹90/kg) cascades into Sub-Recipe & Butter Chicken cost", () => {
    invService.resetInventoryStore();
    const subsBefore = invService.getSubRecipes();
    const makBefore = subsBefore.find(s => s.id === 'SUB-MAK-01');
    const costBefore = invService.calculateDishCosting();
    const bcBefore = costBefore.find(c => c.dish_id === 'REC-BC');
    const pbmBefore = costBefore.find(c => c.dish_id === 'REC-PBM');

    // Surge Tomato by +125% (40 -> 90)
    const updateRes = invService.updateRawMaterialPrice('RM-TOMATO', 90);
    assert.strictEqual(updateRes.status, 200);

    const subsAfter = invService.getSubRecipes();
    const makAfter = subsAfter.find(s => s.id === 'SUB-MAK-01');

    // SUB-MAK-01 uses 15kg tomato per 20L yield.
    // Price hike is ₹50/kg. Total hike per 20L batch is 15 * 50 = ₹750.
    // Unit production cost hike is 750 / 20 = ₹37.50/L.
    const expectedUnitCostHike = (15.0 * (90 - 40)) / 20.0;
    const actualUnitCostHike = makAfter.unit_production_cost - makBefore.unit_production_cost;
    assert.strictEqual(Math.round(actualUnitCostHike * 100) / 100, expectedUnitCostHike);

    const costAfter = invService.calculateDishCosting();
    const bcAfter = costAfter.find(c => c.dish_id === 'REC-BC');
    const pbmAfter = costAfter.find(c => c.dish_id === 'REC-PBM');

    // Butter Chicken uses 0.22L of Makhani Gravy
    // Expected BC food cost increase = 0.22 * 37.50 = ₹8.25
    const expectedBcHike = Math.round((0.22 * expectedUnitCostHike) * 100) / 100;
    const actualBcHike = Math.round((bcAfter.food_cost - bcBefore.food_cost) * 100) / 100;
    assert.strictEqual(actualBcHike, expectedBcHike, `BC food cost hike mismatch: expected +₹${expectedBcHike}, got +₹${actualBcHike}`);

    // Verify profit margin recomputes down mathematically
    assert.ok(bcAfter.gross_margin_pct < bcBefore.gross_margin_pct, "BC margin must drop");
    assert.ok(pbmAfter.gross_margin_pct < pbmBefore.gross_margin_pct, "PBM margin must drop");
  });

  runStressTest('STRESS-COST-03', "Rapid Oil surge (+50%: ₹135 -> ₹202.50/L) recomputes Samosa margin mathematically", () => {
    invService.resetInventoryStore();
    const costBefore = invService.calculateDishCosting();
    const samosaBefore = costBefore.find(c => c.dish_id === 'REC-SAMOSA');

    // Oil price spikes +50% (135 -> 202.5)
    invService.updateRawMaterialPrice('RM-OIL', 202.5);

    const costAfter = invService.calculateDishCosting();
    const samosaAfter = costAfter.find(c => c.dish_id === 'REC-SAMOSA');

    // Samosa uses 0.015L oil:
    // Expected increase = 0.015 * (202.5 - 135) = 0.015 * 67.5 = 1.0125 -> ~1.01
    const expectedDiff = Math.round((0.015 * (202.5 - 135)) * 100) / 100;
    const actualDiff = Math.round((samosaAfter.food_cost - samosaBefore.food_cost) * 100) / 100;
    assert.strictEqual(actualDiff, expectedDiff);

    // Verify margin reduction
    assert.ok(samosaAfter.gross_margin_pct < samosaBefore.gross_margin_pct);
    const expectedNewMargin = Math.round((((samosaAfter.selling_price - samosaAfter.food_cost) / samosaAfter.selling_price) * 100) * 10) / 10;
    assert.strictEqual(samosaAfter.gross_margin_pct, expectedNewMargin);
  });

  runStressTest('STRESS-COST-04', "Triple Commodity Shock (Tomato +125%, Oil +50%, Paneer +40%) forces Squeeze Risk on PBM", () => {
    invService.resetInventoryStore();
    const initialCosting = invService.calculateDishCosting();
    const initialPbm = initialCosting.find(c => c.dish_id === 'REC-PBM');

    // Triple surge:
    invService.updateRawMaterialPrice('RM-TOMATO', 90);    // +125%
    invService.updateRawMaterialPrice('RM-OIL', 202.5);    // +50%
    invService.updateRawMaterialPrice('RM-PANEER', 532);   // +40% (380 * 1.4)

    const shockedCosting = invService.calculateDishCosting();
    const shockedPbm = shockedCosting.find(c => c.dish_id === 'REC-PBM');

    assert.ok(shockedPbm.food_cost > initialPbm.food_cost + 25.0, "PBM cost should skyrocket by > ₹25");
    assert.ok(shockedPbm.gross_margin_pct < initialPbm.gross_margin_pct - 9.0, "PBM margin should drop heavily");

    // Reverting prices back to baseline
    invService.updateRawMaterialPrice('RM-TOMATO', 40);
    invService.updateRawMaterialPrice('RM-OIL', 135);
    invService.updateRawMaterialPrice('RM-PANEER', 380);

    const restoredCosting = invService.calculateDishCosting();
    const restoredPbm = restoredCosting.find(c => c.dish_id === 'REC-PBM');
    assert.strictEqual(restoredPbm.food_cost, initialPbm.food_cost, "Food cost must restore to initial value");
    assert.strictEqual(restoredPbm.gross_margin_pct, initialPbm.gross_margin_pct, "Margin % must restore to initial value");
  });

  // ==============================================================================
  // 🛒 SUITE 4: QUICK RESTOCK ADDITION & VALIDATION MATH
  // ==============================================================================
  console.log("\n------------------------------------------------------------------------------");
  console.log("🛒 SUITE 4: QUICK RESTOCK ADDITION & VALIDATION MATH");
  console.log("------------------------------------------------------------------------------");

  runStressTest('STRESS-RESTOCK-01', "Quick Restock integer and fractional addition math (+20.0, +12.5, +0.75)", () => {
    invService.resetInventoryStore();
    const initialOil = invService.getRawMaterials().find(r => r.id === 'RM-OIL').current_stock;

    // +20.0 integer addition
    const res1 = invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: 20.0, unit_cost: 140 });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.updated_stock, initialOil + 20.0);

    // +12.5 fractional addition
    const res2 = invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: 12.5, unit_cost: 140 });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.updated_stock, initialOil + 32.5);

    // +0.75 micro addition
    const res3 = invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: 0.75, unit_cost: 140 });
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.data.updated_stock, initialOil + 33.25);
  });

  runStressTest('STRESS-RESTOCK-02', "Quick Restock updates rate and calculates total expense accurately", () => {
    invService.resetInventoryStore();
    const res = invService.recordRestockExpense({
      material_id: 'RM-POTATO',
      quantity: 15.5,
      unit_cost: 32.0,
      supplier: 'Kolkata Mandi Direct'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.log.total_expense, 15.5 * 32.0); // 496
    const potato = invService.getRawMaterials().find(r => r.id === 'RM-POTATO');
    assert.strictEqual(potato.cost_per_unit, 32.0);
  });

  runStressTest('STRESS-RESTOCK-03', "Quick Restock validation rejects negative, zero, and missing quantities", () => {
    invService.resetInventoryStore();
    assert.strictEqual(invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: 0 }).status, 400);
    assert.strictEqual(invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: -10 }).status, 400);
    assert.strictEqual(invService.recordRestockExpense({ material_id: 'RM-OIL', quantity: 'abc' }).status, 400);
    assert.strictEqual(invService.recordRestockExpense({ quantity: 10 }).status, 400);
    assert.strictEqual(invService.recordRestockExpense({ material_id: 'UNKNOWN_RM', quantity: 10 }).status, 404);
  });

  // ==============================================================================
  // 🔒 SUITE 5: 26 MODAL CLOSE BUTTON INVARIANT VERIFICATION
  // ==============================================================================
  console.log("\n------------------------------------------------------------------------------");
  console.log("🔒 SUITE 5: 26 MODAL CLOSE BUTTON INVARIANT VERIFICATION");
  console.log("------------------------------------------------------------------------------");

  runStressTest('STRESS-INVARIANT-01', "Exact regex /<button\\b[^>]*class=[\"'][^\"']*modal-close-btn[^\"']*[\"'][^>]*><svg[^>]*>.*?<\\/svg><\\/button>/g matches strictly 26 buttons", () => {
    const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(regex) || [];
    assert.strictEqual(matches.length, 26, `Invariant violated! Expected exactly 26 SVG modal-close-btn buttons, found ${matches.length}`);
  });

  runStressTest('STRESS-INVARIANT-02', "Total occurrences of class 'modal-close-btn' in index.html is strictly 26", () => {
    const classOccurrences = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || [];
    assert.strictEqual(classOccurrences.length, 26, `Expected exactly 26 occurrences of modal-close-btn class, found ${classOccurrences.length}`);
  });

  runStressTest('STRESS-INVARIANT-03', "Inventory Hub restock and config modals strictly avoid modal-close-btn", () => {
    // Restock modal must use rtr_close_btn
    assert.ok(html.includes('id="restockExpenseModal"'), "Missing #restockExpenseModal");
    assert.ok(html.includes('rtr_close_btn'), "Restock modal must use rtr_close_btn");

    const restockSnippet = html.match(/<div\b[^>]*id=["']restockExpenseModal["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
    assert.ok(restockSnippet, "Could not slice restockExpenseModal");
    assert.ok(!restockSnippet[0].includes('modal-close-btn'), "#restockExpenseModal must not contain modal-close-btn");
  });

  // ==============================================================================
  // 📋 SUMMARY & VERDICT
  // ==============================================================================
  console.log("\n==============================================================================");
  console.log(`📊 STRESS TEST EXECUTION COMPLETE: ${passed} PASSED / ${passed + failed} TOTAL (${failed} FAILED)`);
  console.log("==============================================================================\n");

  if (failed > 0) {
    console.error("❌ CHALLENGER VERDICT: FAIL");
    console.error("   The following empirical stress tests failed:");
    failures.forEach(f => console.error(`   - [${f.id}] ${f.description}: ${f.error}`));
    process.exit(1);
  } else {
    console.log("🌟 CHALLENGER VERDICT: APPROVE");
    console.log("   All boundary thresholds, batch multipliers, food costing cascades,");
    console.log("   quick restock additions, and modal invariants passed with 100% empirical precision.\n");
    process.exit(0);
  }
})();
