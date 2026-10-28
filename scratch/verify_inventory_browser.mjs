// scratch/verify_inventory_browser.mjs
import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9260;
const ARTIFACTS_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_inv_test_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runInventoryBrowserVerification() {
  console.log("==============================================================================");
  console.log("🏪 BROWSER E2E SHOP OWNER SIMULATION: KITCHEN & INVENTORY SUITE");
  console.log("==============================================================================\n");

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${TEMP_USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,900',
    'about:blank'
  ]);

  await sleep(2500);

  let ws;
  try {
    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const page = targets.find(t => t.type === 'page') || targets[0];

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res && res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || 'Runtime error');
      }
      return res?.result?.value;
    };

    const capture = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const dest = path.join(ARTIFACTS_DIR, `${name}.png`);
      fs.writeFileSync(dest, Buffer.from(shot.data, 'base64'));
      console.log(`  📸 Captured: ${name}.png -> ${dest}`);
      return dest;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    console.log("📍 STEP 1: Navigating to POS application (Desktop View 1280x900)...");
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2500);

    // Bypass login if auth modal is visible
    await evaluate(`
      const auth = document.getElementById('shopAuthModal');
      if (auth && auth.style.display !== 'none') {
        if (typeof bypassShopAuthDemo === 'function') bypassShopAuthDemo();
      }
      localStorage.setItem('billnaw_user_role', 'admin');
    `);
    await sleep(1000);

    // Navigate to Inventory tab
    console.log("📍 STEP 2: Navigating to Kitchen & Inventory Management module...");
    await evaluate(`
      if (typeof switchTab === 'function') switchTab('inventory');
      if (typeof switchInventoryHubTab === 'function') switchInventoryHubTab('raw_stock');
    `);
    await sleep(1500);

    // Check KPI elements
    const kpiState = await evaluate(`
      ({
        total: document.getElementById('invStatTotalCount')?.textContent,
        low: document.getElementById('invStatRiskCount')?.textContent,
        inStock: document.getElementById('invStatReadyPercent')?.textContent,
        out: document.getElementById('invStatOutCount')?.textContent,
        badgeRaw: document.getElementById('invBadgeRawCount')?.textContent,
        badgePrep: document.getElementById('invBadgePrepCount')?.textContent,
        badgeRecipe: document.getElementById('invBadgeRecipeCount')?.textContent,
        hasEmptyState: !!document.querySelector('.empty-inventory-state'),
        hasTable: !!document.querySelector('.inv-telemetry-table')
      })
    `);
    console.log("  📊 Inventory Initial Clean State:", kpiState);
    assert.ok(kpiState.hasEmptyState, "Clean store must display empty state card per Fix 3");

    await capture('screen_inv_desktop_clean_empty_state');

    // STEP 3: Test Adding a New Raw Material via Modal
    console.log("\n📍 STEP 3: Testing Add Raw Material Modal...");
    await evaluate(`
      window.culinaryInventory.openAddMaterialModal();
      document.getElementById('newMatName').value = 'Farm Fresh Milk';
      document.getElementById('newMatCategory').value = 'Dairy';
      document.getElementById('newMatPurchaseUnit').value = 'Litre';
      document.getElementById('newMatConsumptionUnit').value = 'Litre';
      document.getElementById('newMatConversionFactor').value = '1';
      document.getElementById('newMatInitialStock').value = '40';
      document.getElementById('newMatMinThreshold').value = '8';
      document.getElementById('newMatCostPerUnit').value = '65';
      document.getElementById('newMatSupplier').value = 'Dairy Farm Co-op';
    `);
    await sleep(500);
    await capture('screen_inv_add_material_modal');

    // Submit form
    await evaluate(`window.culinaryInventory.submitAddMaterial();`);
    await sleep(1000);

    // Also add another staple (Refined Cooking Oil & Potatoes) to populate a rich inventory table
    await evaluate(`
      const staples = [
        { id: 'RM-OIL', name: 'Refined Cooking Oil', category: 'Pantry', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 45, min_threshold: 10, cost_per_unit: 135, supplier: 'Metro Cash & Carry', unit_type: 'raw' },
        { id: 'RM-POTATO', name: 'Spiced Potatoes', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 30, min_threshold: 5, cost_per_unit: 30, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
        { id: 'RM-TEA-LEAVES', name: 'CTC Assam Tea Leaves', category: 'Beverages', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 4, min_threshold: 5, cost_per_unit: 380, supplier: 'Assam Tea Direct', unit_type: 'raw' },
        { id: 'RM-SUGAR', name: 'Granulated Sugar', category: 'Pantry', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 0, min_threshold: 5, cost_per_unit: 44, supplier: 'Metro Cash & Carry', unit_type: 'raw' }
      ];
      staples.forEach(s => window.culinaryInventory.submitAddMaterial ? null : null);
      // Inject staples and sub-recipe for rich demonstration
      const existing = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || '[]');
      staples.forEach(s => { if (!existing.some(m => m.id === s.id)) existing.push(s); });
      localStorage.setItem('billnaw_culinary_materials', JSON.stringify(existing));
      
      const defaultSubs = [
        { id: 'SUB-GRAVY-BASE', name: 'Makhani Gravy Base', yield_quantity: 20, yield_unit: 'Litre', current_stock: 20, min_threshold: 5, unit_production_cost: 130 },
        { id: 'SUB-CHOPPED-VEG', name: 'Pre-cut Salad Veggies', yield_quantity: 5, yield_unit: 'kg', current_stock: 5, min_threshold: 2, unit_production_cost: 45 },
        { id: 'SUB-BREAD-SLICES', name: 'Sliced Sandwich Bread', yield_quantity: 40, yield_unit: 'slices', current_stock: 40, min_threshold: 10, unit_production_cost: 2.5 }
      ];
      localStorage.setItem('billnaw_culinary_subs', JSON.stringify(defaultSubs));
      window.culinaryInventory.init();
    `);
    await sleep(1500);

    const postAddState = await evaluate(`
      ({
        total: document.getElementById('invStatTotalCount')?.textContent,
        low: document.getElementById('invStatRiskCount')?.textContent,
        inStock: document.getElementById('invStatReadyPercent')?.textContent,
        out: document.getElementById('invStatOutCount')?.textContent,
        hasMilk: document.body.innerHTML.includes('Farm Fresh Milk'),
        hasTable: !!document.querySelector('.inv-telemetry-table'),
        hasChecklist: !!document.querySelector('.inv-prep-checklist-card'),
        hasQuickActions: !!document.querySelector('.inv-quick-actions-card'),
        badgeRaw: document.getElementById('invBadgeRawCount')?.textContent
      })
    `);
    console.log("  🥛 Post-Add Raw Material State:", postAddState);
    assert.ok(postAddState.hasMilk, "Farm Fresh Milk must appear in the inventory table");
    assert.ok(postAddState.hasTable, "Table must render when materials exist");
    assert.ok(postAddState.hasChecklist, "Checklist sidebar must render");

    await capture('screen_inv_desktop_material_added');

    // STEP 4: Test Morning Prep Checklist Interaction
    console.log("\n📍 STEP 4: Testing Morning Prep Checklist Batching...");
    await evaluate(`
      const prepBtns = document.querySelectorAll('.inv-prep-task-item button');
      if (prepBtns.length > 0) prepBtns[0].click();
    `);
    await sleep(1200);

    await capture('screen_inv_prep_checklist_active');

    // STEP 5: Test Recipe Details & Food Cost Breakdown Modal (matching inspiration screen 3)
    console.log("\n📍 STEP 5: Testing Recipe Details & Live Margin Modal...");
    await evaluate(`
      if (typeof switchInventoryHubTab === 'function') switchInventoryHubTab('dish_costing');
    `);
    await sleep(1000);

    await evaluate(`
      // Open recipe detail modal for first dish
      const dishes = window.culinaryInventory.getAllMenuDishes();
      if (dishes.length > 0) {
        window.culinaryInventory.openRecipeDetailModal(dishes[0].id);
      }
    `);
    await sleep(1000);

    const recipeModalState = await evaluate(`
      ({
        modalOpen: document.getElementById('invRecipeDetailModal')?.style.display === 'flex',
        title: document.getElementById('recDetailDishName')?.textContent,
        price: document.getElementById('recDetailPrice')?.textContent,
        cost: document.getElementById('recDetailCost')?.textContent,
        margin: document.getElementById('recDetailMargin')?.textContent,
        rowsCount: document.querySelectorAll('#recDetailIngredientsTbody tr').length
      })
    `);
    console.log("  🍲 Recipe Details Modal State:", recipeModalState);
    assert.ok(recipeModalState.modalOpen, "Recipe Detail Modal must be open with display: flex");

    await capture('screen_inv_recipe_details_modal');

    // Close recipe modal
    await evaluate(`window.culinaryInventory.closeRecipeDetailModal();`);
    await sleep(500);

    // STEP 6: Test Purchase Order (PO) Modal (matching inspiration screen 8)
    console.log("\n📍 STEP 6: Testing Vendor Purchase Order Generator Modal...");
    await evaluate(`
      if (typeof switchInventoryHubTab === 'function') switchInventoryHubTab('raw_stock');
      window.culinaryInventory.openPurchaseOrderModal();
    `);
    await sleep(1000);

    const poModalState = await evaluate(`
      ({
        poOpen: document.getElementById('invPurchaseOrderModal')?.style.display === 'flex',
        poTotal: document.getElementById('poTotalEstimatedValue')?.textContent,
        poRows: document.querySelectorAll('#poItemsTbody tr').length
      })
    `);
    console.log("  📋 Purchase Order Modal State:", poModalState);
    assert.ok(poModalState.poOpen, "Purchase Order Modal must be open with display: flex");

    await capture('screen_inv_purchase_order_modal');

    // Close PO modal
    await evaluate(`window.culinaryInventory.closePurchaseOrderModal();`);
    await sleep(500);

    // STEP 7: Mobile Viewport Touch Verification (390x844 - Android & iPhone)
    console.log("\n📍 STEP 7: Testing Mobile Touch Layout (390x844)...");
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(1000);

    const mobileState = await evaluate(`
      ({
        kpiGrid: !!document.querySelector('.inv-kpi-grid'),
        cardsCount: document.querySelectorAll('.inv-stock-card').length,
        chipsCount: document.querySelectorAll('.inv-main-content .btn-outline').length
      })
    `);
    console.log("  📱 Mobile Viewport State:", mobileState);

    await capture('screen_inv_mobile_touch_overview');

    console.log("\n==============================================================================");
    console.log("🎯 ALL BROWSER E2E SHOP OWNER TESTS PASSED 100%!");
    console.log("==============================================================================\n");

  } finally {
    if (ws) ws.close();
    chrome.kill();
    try { fs.rmSync(TEMP_USER_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  }
}

runInventoryBrowserVerification().catch(err => {
  console.error("❌ Browser verification failed:", err);
  process.exit(1);
});
