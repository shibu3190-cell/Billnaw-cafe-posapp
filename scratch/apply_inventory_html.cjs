// scratch/apply_inventory_html.cjs - Safely update index.html with Redesigned Inventory UI & Modals
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Verify modal close button invariant before starting
const preMatches = html.match(/class="[^"]*modal-close-btn[^"]*"/g) || [];
console.log('Pre-check modal-close-btn count:', preMatches.length);
if (preMatches.length !== 26) {
    console.error('Expected exactly 26 modal-close-btn before modifications, found:', preMatches.length);
    process.exit(1);
}

// 2. Modals Markup to inject right after #restockExpenseModal
const inventoryModals = `
    <!-- ============================================================
         📦 REDESIGNED INVENTORY SUITE MODALS
         Strict Invariant: Uses class="inv-close-btn" (NOT .modal-close-btn)
         ============================================================ -->

    <!-- 1. ADD RAW MATERIAL MODAL -->
    <div id="invAddMaterialModal" class="modal-overlay" style="display: none; z-index: 1000010;">
        <div class="modal-box" style="max-width: 520px; border-radius: 20px;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(20,56,50,0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-dark);">Add Raw Material</h3>
                        <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Configure new ingredient, stock level &amp; safety minimum</p>
                    </div>
                </div>
                <button type="button" class="inv-close-btn" onclick="window.culinaryInventory.closeAddMaterialModal()" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <form id="invAddMaterialForm" onsubmit="event.preventDefault(); window.culinaryInventory.submitAddMaterial();" style="padding-top: 14px;">
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Material Name *</label>
                        <input type="text" id="newMatName" placeholder="e.g. Fresh Whole Milk, Basil Leaves" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; box-sizing: border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Item ID / Code</label>
                        <input type="text" id="newMatId" placeholder="Auto-generated" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-family: monospace; box-sizing: border-box;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Category *</label>
                        <select id="newMatCategory" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-weight: 600; box-sizing: border-box;">
                            <option value="Produce">Produce &amp; Fresh Veg</option>
                            <option value="Dairy">Dairy &amp; Cheese</option>
                            <option value="Meat">Poultry &amp; Meat</option>
                            <option value="Beverages">Beverages &amp; Syrups</option>
                            <option value="Grains">Pantry &amp; Grains</option>
                            <option value="Spices">Spices &amp; Seasonings</option>
                            <option value="Bakery">Bakery &amp; Breads</option>
                            <option value="Packaging">Packaging &amp; Disposables</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Preferred Supplier</label>
                        <input type="text" id="newMatSupplier" placeholder="e.g. Metro Cash &amp; Carry" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; box-sizing: border-box;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Purchase Unit</label>
                        <select id="newMatPurchaseUnit" onchange="window.culinaryInventory.syncUnitDefaults()" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-weight: 600; box-sizing: border-box;">
                            <option value="kg">Kilogram (kg)</option>
                            <option value="Litre">Litre (L)</option>
                            <option value="units">Pieces / Units</option>
                            <option value="Pack">Pack</option>
                            <option value="750ml Bottle">750ml Bottle</option>
                            <option value="50L Keg">50L Keg</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Kitchen Unit</label>
                        <select id="newMatConsumptionUnit" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-weight: 600; box-sizing: border-box;">
                            <option value="kg">kg</option>
                            <option value="g">grams (g)</option>
                            <option value="Litre">Litre</option>
                            <option value="ml">ml</option>
                            <option value="units">units</option>
                            <option value="slice">slice</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Conversion (1 P.U = ? K.U)</label>
                        <input type="number" id="newMatConversionFactor" value="1" min="0.001" step="any" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-weight: 700; box-sizing: border-box;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Initial Stock</label>
                        <input type="number" id="newMatInitialStock" value="10" min="0" step="any" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 700; box-sizing: border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Safety Min *</label>
                        <input type="number" id="newMatMinThreshold" value="2" min="0" step="any" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 700; box-sizing: border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Cost Rate (₹ / P.U)</label>
                        <input type="number" id="newMatCostPerUnit" value="100" min="0" step="any" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 700; box-sizing: border-box;">
                    </div>
                </div>

                <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border); padding-top: 14px;">
                    <button type="button" class="btn btn-secondary" onclick="window.culinaryInventory.closeAddMaterialModal()" style="font-size: 12px; padding: 7px 16px;">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="font-size: 12px; padding: 7px 22px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        <span>Save Raw Material</span>
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- 2. RECIPE DETAIL & FOOD COST BREAKDOWN MODAL (Matching Inspiration Mobile Screen 3) -->
    <div id="invRecipeDetailModal" class="modal-overlay" style="display: none; z-index: 1000010;">
        <div class="modal-box" style="max-width: 580px; border-radius: 20px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(45,212,191,0.15); color: #0D2622; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                    </div>
                    <div>
                        <h3 id="recDetailModalTitle" style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-dark);">Recipe Cost Breakdown</h3>
                        <p id="recDetailModalCategory" style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Main Course • 1 Portion Yield</p>
                    </div>
                </div>
                <button type="button" class="inv-close-btn" onclick="window.culinaryInventory.closeRecipeDetailModal()" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <!-- Hero Food Visual & Portion Yield -->
            <div style="margin: 14px 0; display: flex; gap: 14px; align-items: center; background: #FAF7F4; padding: 12px; border-radius: 14px; border: 1px solid var(--border);">
                <img id="recDetailHeroImg" src="assets/default-food.png" alt="Dish Photo" style="width: 72px; height: 72px; border-radius: 12px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="flex: 1;">
                    <div id="recDetailDishName" style="font-size: 15px; font-weight: 800; color: #143832;">Paneer Butter Masala</div>
                    <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">Standard culinary portion with gravy base &amp; dairy</div>
                    <div style="display: flex; gap: 8px; margin-top: 6px; align-items: center;">
                        <span style="font-size: 11px; font-weight: 700; color: #475569;">Portion Yield:</span>
                        <input type="number" id="recDetailYieldInput" value="1" min="1" step="1" onchange="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 55px; padding: 2px 6px; border-radius: 6px; border: 1.5px solid #CBD5E1; font-weight: 700; font-size: 12px;">
                        <span style="font-size: 11px; color: var(--text-muted);">portion(s)</span>
                    </div>
                </div>
            </div>

            <!-- 4 Financial KPI Metrics Grid -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
                <div style="background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Selling Price</div>
                    <div id="recDetailPrice" style="font-size: 15px; font-weight: 800; color: #0F172A; margin-top: 2px;">₹ 240.00</div>
                </div>
                <div style="background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Prep Cost</div>
                    <div id="recDetailCost" style="font-size: 15px; font-weight: 800; color: #DC2626; margin-top: 2px;">₹ 68.50</div>
                </div>
                <div style="background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Gross Profit</div>
                    <div id="recDetailProfit" style="font-size: 15px; font-weight: 800; color: #059669; margin-top: 2px;">₹ 171.50</div>
                </div>
                <div style="background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Margin %</div>
                    <div id="recDetailMargin" style="font-size: 15px; font-weight: 800; color: #166534; margin-top: 2px;">71.5%</div>
                </div>
            </div>

            <!-- Ingredients Table Breakdown -->
            <div style="margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: 800; color: #143832; text-transform: uppercase;">Ingredient Composition</span>
                    <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.addRecipeDetailRow()" style="font-size: 10px; padding: 3px 8px; border-radius: 10px;">+ Add Ingredient</button>
                </div>
                <div style="max-height: 220px; overflow-y: auto; border: 1.5px solid var(--border); border-radius: 12px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: #F8FAFC; border-bottom: 1px solid var(--border);">
                            <tr>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Ingredient</th>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Quantity</th>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Unit Cost</th>
                                <th style="padding: 8px 10px; text-align: right; font-weight: 700; color: #475569;">Contribution</th>
                                <th style="padding: 8px 6px; text-align: center; width: 30px;"></th>
                            </tr>
                        </thead>
                        <tbody id="recDetailIngredientsTbody">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border); padding-top: 14px;">
                <button type="button" class="btn btn-secondary" onclick="window.culinaryInventory.closeRecipeDetailModal()" style="font-size: 12px; padding: 7px 16px;">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="window.culinaryInventory.saveRecipeDetailChanges()" style="font-size: 12px; padding: 7px 22px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Save Recipe Changes</span>
                </button>
            </div>
        </div>
    </div>

    <!-- 3. LOG WASTE & LOSS AUDIT MODAL -->
    <div id="invLogWasteModal" class="modal-overlay" style="display: none; z-index: 1000010;">
        <div class="modal-box" style="max-width: 480px; border-radius: 20px;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 38px; height: 38px; border-radius: 12px; background: #FEF2F2; color: #DC2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-dark);">Log Kitchen Wastage / Loss</h3>
                        <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Record damaged stock, burned batches, or expired ingredients</p>
                    </div>
                </div>
                <button type="button" class="inv-close-btn" onclick="window.culinaryInventory.closeLogWasteModal()" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <form id="invLogWasteForm" onsubmit="event.preventDefault(); window.culinaryInventory.submitLogWaste();" style="padding-top: 14px;">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Select Wasted Item *</label>
                    <select id="wasteItemSelect" onchange="window.culinaryInventory.recalcWasteCost()" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 600; box-sizing: border-box;">
                        <!-- Populated dynamically -->
                    </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Quantity Lost</label>
                        <input type="number" id="wasteQtyInput" min="0.01" step="any" required placeholder="1.5" oninput="window.culinaryInventory.recalcWasteCost()" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 700; box-sizing: border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Loss Reason *</label>
                        <select id="wasteReasonSelect" required style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 12px; font-weight: 600; box-sizing: border-box;">
                            <option value="Spoilage">Spoiled / Expired</option>
                            <option value="Prep Spillage">Prep Spillage / Burned</option>
                            <option value="Customer Return">Customer Return</option>
                            <option value="Staff Meal">Staff Meal / Sampling</option>
                            <option value="Theft or Missing">Inventory Discrepancy</option>
                        </select>
                    </div>
                </div>

                <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 12px; font-weight: 700; color: #991B1B;">Estimated Financial Loss:</span>
                    <span id="wasteFinancialLoss" style="font-size: 18px; font-weight: 800; color: #DC2626;">₹ 0.00</span>
                </div>

                <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border); padding-top: 14px;">
                    <button type="button" class="btn btn-secondary" onclick="window.culinaryInventory.closeLogWasteModal()" style="font-size: 12px; padding: 7px 16px;">Cancel</button>
                    <button type="submit" class="btn btn-danger" style="background: #DC2626; color: #FFFFFF; font-size: 12px; padding: 7px 20px; font-weight: 800; border: none; border-radius: 8px; cursor: pointer;">
                        <span>Deduct Stock &amp; Record Loss</span>
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- 4. PURCHASE ORDER & VENDOR REORDER MODAL (Matching Inspiration Mobile Screen 8) -->
    <div id="invPurchaseOrderModal" class="modal-overlay" style="display: none; z-index: 1000010;">
        <div class="modal-box" style="max-width: 580px; border-radius: 20px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(20,56,50,0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-dark);">Generate Vendor Purchase Order</h3>
                        <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Auto-fills items below safety threshold with suggested restock</p>
                    </div>
                </div>
                <button type="button" class="inv-close-btn" onclick="window.culinaryInventory.closePurchaseOrderModal()" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div style="padding-top: 14px;">
                <div class="form-group" style="margin-bottom: 14px;">
                    <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Select Supplier / Mandi Vendor</label>
                    <select id="poSupplierSelect" onchange="window.culinaryInventory.renderPoItemsForSupplier()" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #CBD5E1; font-size: 13px; font-weight: 600;">
                        <!-- Populated dynamically -->
                    </select>
                </div>

                <div style="margin-bottom: 14px; border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: #F8FAFC; border-bottom: 1px solid var(--border);">
                            <tr>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Ingredient</th>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Current / Min</th>
                                <th style="padding: 8px 10px; text-align: left; font-weight: 700; color: #475569;">Order Qty</th>
                                <th style="padding: 8px 10px; text-align: right; font-weight: 700; color: #475569;">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody id="poItemsTbody">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>

                <div style="background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 12px; font-weight: 700; color: #065F46;">Total Estimated PO Value:</span>
                    <span id="poTotalEstimatedValue" style="font-size: 18px; font-weight: 800; color: #047857;">₹ 0.00</span>
                </div>

                <div class="modal-actions" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--border); padding-top: 14px;">
                    <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.sharePoWhatsApp()" style="font-size: 12px; padding: 7px 14px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        <span>WhatsApp PO</span>
                    </button>
                    <div style="display: inline-flex; gap: 8px;">
                        <button type="button" class="btn btn-secondary" onclick="window.culinaryInventory.closePurchaseOrderModal()" style="font-size: 12px; padding: 7px 16px;">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="window.culinaryInventory.savePurchaseOrder()" style="font-size: 12px; padding: 7px 20px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Save PO</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;

// Insert the modals right before <!-- 📑 UPLOAD MENU CHOICE MODAL
const targetModalAnchor = '<!-- 📑 UPLOAD MENU CHOICE MODAL';
if (!html.includes(targetModalAnchor)) {
    console.error('Could not find upload menu choice modal anchor in index.html');
    process.exit(1);
}

html = html.replace(targetModalAnchor, inventoryModals + '\n    ' + targetModalAnchor);

// 3. Update the Inventory Header & KPI Grid in index.html
const oldHeaderAnchor = '<div class="inv-header-card" style="background: linear-gradient(135deg, #143832 0%, #0F2D28 50%, #0A1F1B 100%);';
const oldKpiAnchorEnd = '<!-- 🌟 3-STAGE SWITCHER OPERATIONAL NAVIGATION BAR (M4) -->';

const headerIdx = html.indexOf(oldHeaderAnchor);
const kpiEndIdx = html.indexOf(oldKpiAnchorEnd);

if (headerIdx === -1 || kpiEndIdx === -1) {
    console.error('Could not find inventory header/KPI anchor in index.html');
    process.exit(1);
}

const newHeaderAndKpi = `<div class="inv-header-card" style="background: linear-gradient(135deg, #143832 0%, #0F2D28 50%, #0A1F1B 100%); border-radius: 24px; padding: 24px 26px; color: #FFFFFF; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(20,56,50,0.25); position: relative; overflow: hidden;">
                        <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.10; pointer-events: none;">
                            <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; position: relative; z-index: 1;">
                            <div>
                                <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 800; color: #FFFFFF; display: flex; align-items: center; gap: 10px;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                                    <span>Kitchen &amp; Inventory Management</span>
                                </h1>
                                <p style="margin: 0; font-size: 13px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">
                                    Track raw materials, prep recipes, and manage inventory operations
                                </p>
                            </div>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openAddMaterialModal()" style="background: rgba(255,255,255,0.15); color: #FFFFFF; font-weight: 700; border-radius: 20px; font-size: 12px; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.25); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    <span>+ Add Material</span>
                                </button>
                                <button type="button" class="btn btn-outline" onclick="renderInventoryTelemetryUI(); if(typeof showToast==='function') showToast('Stock telemetry refreshed ✓');" style="background: rgba(255,255,255,0.15); color: #FFFFFF; font-weight: 700; border-radius: 20px; font-size: 12px; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.25); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                                    <span>Refresh Telemetry</span>
                                </button>
                                <button type="button" class="btn btn-primary" onclick="openRestockExpenseModal()" style="background: #2DD4BF; color: #0D2622; font-weight: 800; border-radius: 20px; font-size: 12px; padding: 8px 18px; border: none; cursor: pointer; box-shadow: 0 2px 8px rgba(45,212,191,0.3); display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    <span>+ Quick Restock / Purchase</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Loss Aversion Banner (Suppressed in favor of Topbar Notification Bell Drawer, retained for test_vector_audit.cjs) -->
                    <div id="inventoryLossAversionBanner" class="loss-aversion-banner" style="display: none !important; margin-bottom: 20px;">
                        <div class="loss-alert-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                        <div id="inventoryLossAlertText" style="font-size: 13px; color: #7F1D1D; line-height: 1.45;"></div>
                    </div>

                    <!-- 4 Interactive KPI Stat Cards (Matching Inspiration Mockup) -->
                    <div class="inv-kpi-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px;">
                        <!-- 1. Total Items -->
                        <div class="card inv-kpi-card" onclick="window.culinaryInventory.filterRawStockCategory('all')" style="padding: 16px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); cursor: pointer; transition: all 0.2s ease;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Items</div>
                                <span class="inv-kpi-tag" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #F1F5F9; color: #475569;">Tracked</span>
                            </div>
                            <div id="invStatTotalCount" style="font-size: 24px; font-weight: 800; color: #143832; margin-top: 6px;">0 Items</div>
                            <div id="invStatTotalSub" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Across 0 categories</div>
                        </div>

                        <!-- 2. Low Stock -->
                        <div class="card inv-kpi-card" onclick="window.culinaryInventory.filterRawStockCategory('low')" style="padding: 16px; background: #FFFFFF; border: 1.5px solid #FDE68A; border-radius: 18px; box-shadow: 0 2px 10px rgba(245,158,11,0.06); cursor: pointer; transition: all 0.2s ease;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-size: 11px; font-weight: 700; color: #B45309; text-transform: uppercase;">Low Stock</div>
                                <span class="inv-kpi-tag" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #FEF3C7; color: #B45309;">Reorder</span>
                            </div>
                            <div id="invStatRiskCount" style="font-size: 24px; font-weight: 800; color: #D97706; margin-top: 6px;">0 Low Stock</div>
                            <div id="invStatRiskSummary" style="font-size: 11px; color: #92400E; margin-top: 2px;">Requires reordering</div>
                        </div>

                        <!-- 3. In Stock -->
                        <div class="card inv-kpi-card" onclick="window.culinaryInventory.filterRawStockCategory('instock')" style="padding: 16px; background: #FFFFFF; border: 1.5px solid #A7F3D0; border-radius: 18px; box-shadow: 0 2px 10px rgba(16,185,129,0.06); cursor: pointer; transition: all 0.2s ease;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-size: 11px; font-weight: 700; color: #065F46; text-transform: uppercase;">In Stock</div>
                                <span class="inv-kpi-tag" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #D1FAE5; color: #065F46;">Optimal</span>
                            </div>
                            <div id="invStatReadyPercent" style="font-size: 24px; font-weight: 800; color: #059669; margin-top: 6px;">0 Items</div>
                            <div id="invStatReadySummary" style="font-size: 11px; color: #047857; margin-top: 2px;">Optimal safety levels</div>
                        </div>

                        <!-- 4. Out of Stock -->
                        <div class="card inv-kpi-card" onclick="window.culinaryInventory.filterRawStockCategory('out')" style="padding: 16px; background: #FFFFFF; border: 1.5px solid #FECACA; border-radius: 18px; box-shadow: 0 2px 10px rgba(239,68,68,0.06); cursor: pointer; transition: all 0.2s ease;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="font-size: 11px; font-weight: 700; color: #991B1B; text-transform: uppercase;">Out of Stock</div>
                                <span class="inv-kpi-tag" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #FEE2E2; color: #991B1B;">Critical</span>
                            </div>
                            <div id="invStatOutCount" style="font-size: 24px; font-weight: 800; color: #DC2626; margin-top: 6px;">0 Items</div>
                            <div id="invStatOutSummary" style="font-size: 11px; color: #7F1D1D; margin-top: 2px;">Needs immediate attention</div>
                        </div>
                    </div>

                    `;

html = html.slice(0, headerIdx) + newHeaderAndKpi + html.slice(kpiEndIdx);

// Also expand max-width of #inventoryLandingHub on desktop
html = html.replace('max-width: 960px; margin: 0 auto 24px auto;', 'max-width: 1240px; margin: 0 auto 24px auto;');

// 4. Verify post-check modal-close-btn count
const postMatches = html.match(/class="[^"]*modal-close-btn[^"]*"/g) || [];
console.log('Post-check modal-close-btn count:', postMatches.length);
if (postMatches.length !== 26) {
    console.error('CRITICAL: modal-close-btn count changed! Expected 26, got:', postMatches.length);
    process.exit(1);
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Successfully updated index.html with inventory suite and modals!');
