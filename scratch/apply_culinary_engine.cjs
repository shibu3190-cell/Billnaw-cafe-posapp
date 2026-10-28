// scratch/apply_culinary_engine.cjs - Safely inject updated telemetry, 2-column layout & modals into js/culinary_inventory.js
const fs = require('fs');
const path = require('path');

const culPath = path.join(__dirname, '..', 'js', 'culinary_inventory.js');
let code = fs.readFileSync(culPath, 'utf8');

// 1. Telemetry UI implementation
const telemetryImpl = `
    // --- Operational Inventory Telemetry UI Controller (4 Stat Cards & Badges) ---
    function renderInventoryTelemetryUI() {
        const totalMaterials = rawMaterials.length;
        const categories = new Set(rawMaterials.map(m => m.category || 'General'));
        const lowStock = rawMaterials.filter(m => m.current_stock > 0 && m.current_stock <= m.min_threshold);
        const outStock = rawMaterials.filter(m => m.current_stock <= 0);
        const inStock = rawMaterials.filter(m => m.current_stock > m.min_threshold);

        const statTotal = document.getElementById('invStatTotalCount');
        if (statTotal) statTotal.textContent = \`\${totalMaterials} Items\`;

        const statTotalSub = document.getElementById('invStatTotalSub');
        if (statTotalSub) statTotalSub.textContent = \`Across \${categories.size} categories\`;

        const statLow = document.getElementById('invStatRiskCount') || document.getElementById('invStatLowCount');
        if (statLow) statLow.textContent = \`\${lowStock.length} Low Stock\`;

        const statLowSub = document.getElementById('invStatRiskSummary');
        if (statLowSub) statLowSub.textContent = lowStock.length > 0 ? \`\${lowStock.length} items require reordering\` : 'All safety levels normal';

        const statInStock = document.getElementById('invStatReadyPercent') || document.getElementById('invStatInStockCount');
        if (statInStock) statInStock.textContent = \`\${inStock.length} Items\`;

        const statInStockSub = document.getElementById('invStatReadySummary');
        if (statInStockSub) statInStockSub.textContent = 'Optimal safety levels';

        const statOut = document.getElementById('invStatOutCount');
        if (statOut) statOut.textContent = \`\${outStock.length} Items\`;

        const statOutSub = document.getElementById('invStatOutSummary');
        if (statOutSub) statOutSub.textContent = outStock.length > 0 ? \`\${outStock.length} items need attention\` : 'Zero stockouts';

        // Tab count badges
        const badgeRaw = document.getElementById('invBadgeRawCount');
        if (badgeRaw) badgeRaw.textContent = totalMaterials;

        const badgePrep = document.getElementById('invBadgePrepCount');
        if (badgePrep) badgePrep.textContent = subRecipes.length;

        const badgeRecipe = document.getElementById('invBadgeRecipeCount');
        if (badgeRecipe) {
            const menuCount = (window.menuItems && window.menuItems.length) || recipes.length || 0;
            badgeRecipe.textContent = menuCount;
        }

        // Loss Aversion Banner if any critical items
        const lossBanner = document.getElementById('inventoryLossAversionBanner');
        const lossText = document.getElementById('inventoryLossAlertText');
        if (lossBanner && lossText) {
            if (outStock.length > 0) {
                const names = outStock.slice(0, 3).map(m => m.name).join(', ');
                lossText.textContent = \`⚠️ Critical: \${outStock.length} ingredients out of stock (\${names}\${outStock.length > 3 ? '...' : ''}). Reorder immediately.\`;
            } else if (lowStock.length > 0) {
                const names = lowStock.slice(0, 3).map(m => m.name).join(', ');
                lossText.textContent = \`⚠️ Reorder Warning: \${lowStock.length} items low (\${names}).\`;
            } else {
                lossText.textContent = 'All inventory levels healthy.';
            }
        }
    }
    window.renderInventoryTelemetryUI = renderInventoryTelemetryUI;
`;

// Insert telemetryImpl right after loadAllInventoryData definition
const loadAllAnchor = '    function persistLocalSnapshot() {';
if (!code.includes(loadAllAnchor)) {
    console.error('Could not find persistLocalSnapshot anchor');
    process.exit(1);
}
code = code.replace(loadAllAnchor, telemetryImpl + '\n' + loadAllAnchor);

// 2. Add Modal Controllers & Handlers
const modalControllers = `
    // ============================================================
    // 📦 MODAL CONTROLLERS & ACTIONS
    // ============================================================

    // --- 1. ADD RAW MATERIAL MODAL ---
    function openAddMaterialModal() {
        const modal = document.getElementById('invAddMaterialModal');
        if (!modal) return;
        const form = document.getElementById('invAddMaterialForm');
        if (form) form.reset();
        modal.style.display = 'flex';
    }

    function closeAddMaterialModal() {
        const modal = document.getElementById('invAddMaterialModal');
        if (modal) modal.style.display = 'none';
    }

    function syncUnitDefaults() {
        const pUnit = document.getElementById('newMatPurchaseUnit')?.value || 'kg';
        const cUnitSelect = document.getElementById('newMatConsumptionUnit');
        const factorInput = document.getElementById('newMatConversionFactor');
        if (!cUnitSelect || !factorInput) return;

        if (pUnit === 'kg') {
            cUnitSelect.value = 'kg';
            factorInput.value = '1';
        } else if (pUnit === 'Litre') {
            cUnitSelect.value = 'Litre';
            factorInput.value = '1';
        } else if (pUnit === '750ml Bottle') {
            cUnitSelect.value = 'ml';
            factorInput.value = '750';
        } else if (pUnit === '50L Keg') {
            cUnitSelect.value = 'ml';
            factorInput.value = '50000';
        } else if (pUnit === 'units' || pUnit === 'Pack') {
            cUnitSelect.value = 'units';
            factorInput.value = '1';
        }
    }

    async function submitAddMaterial() {
        const name = (document.getElementById('newMatName')?.value || '').trim();
        if (!name) {
            if (typeof showToast === 'function') showToast('⚠️ Material name is required');
            return;
        }

        let id = (document.getElementById('newMatId')?.value || '').trim();
        if (!id) {
            id = 'RM-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 14);
        }

        const category = document.getElementById('newMatCategory')?.value || 'Produce';
        const supplier = (document.getElementById('newMatSupplier')?.value || 'Local Mandi').trim();
        const purchase_unit = document.getElementById('newMatPurchaseUnit')?.value || 'kg';
        const consumption_unit = document.getElementById('newMatConsumptionUnit')?.value || 'kg';
        const conversion_factor = parseFloat(document.getElementById('newMatConversionFactor')?.value || '1') || 1;
        const current_stock = parseFloat(document.getElementById('newMatInitialStock')?.value || '0') || 0;
        const min_threshold = parseFloat(document.getElementById('newMatMinThreshold')?.value || '2') || 2;
        const cost_per_unit = parseFloat(document.getElementById('newMatCostPerUnit')?.value || '0') || 0;

        const newMaterial = {
            id,
            name,
            category,
            supplier,
            purchase_unit,
            consumption_unit,
            conversion_factor,
            current_stock,
            min_threshold,
            cost_per_unit,
            unit_type: 'raw'
        };

        const existingIdx = rawMaterials.findIndex(m => m.id === id);
        if (existingIdx !== -1) {
            rawMaterials[existingIdx] = newMaterial;
        } else {
            rawMaterials.unshift(newMaterial);
        }

        persistLocalSnapshot();

        try {
            await fetch('/api/inventory/raw-materials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMaterial)
            });
        } catch (e) {
            console.warn('[Culinary] Added material offline:', e);
        }

        closeAddMaterialModal();
        renderRawStockTab();
        renderInventoryTelemetryUI();
        if (typeof showToast === 'function') showToast(\`✓ Added "\${name}" to raw inventory!\`);
    }

    // --- 2. RECIPE DETAIL & FOOD COST MODAL ---
    let activeRecipeDetailDish = null;

    function openRecipeDetailModal(dishId) {
        const dishes = getAllMenuDishes();
        const dish = dishes.find(d => String(d.id) === String(dishId)) || dishes[0];
        if (!dish) return;

        activeRecipeDetailDish = dish;
        const modal = document.getElementById('invRecipeDetailModal');
        if (!modal) return;

        // Populate header & photo
        const titleEl = document.getElementById('recDetailModalTitle');
        if (titleEl) titleEl.textContent = dish.name;
        const catEl = document.getElementById('recDetailModalCategory');
        if (catEl) catEl.textContent = \`\${dish.category || 'Main Course'} • 1 Portion Yield\`;
        const dishNameEl = document.getElementById('recDetailDishName');
        if (dishNameEl) dishNameEl.textContent = dish.name;

        const heroImg = document.getElementById('recDetailHeroImg');
        if (heroImg) {
            const photoUrl = (typeof getCuratedFoodPhoto === 'function' ? getCuratedFoodPhoto(dish.name, dish.category) : '') || 'assets/default-food.png';
            heroImg.src = photoUrl;
        }

        const priceEl = document.getElementById('recDetailPrice');
        if (priceEl) priceEl.textContent = \`₹ \${(dish.price || 0).toFixed(2)}\`;

        // Render ingredients table
        renderRecipeDetailIngredients(dish);
        recalcRecipeDetailMargin();
        modal.style.display = 'flex';
    }

    function closeRecipeDetailModal() {
        const modal = document.getElementById('invRecipeDetailModal');
        if (modal) modal.style.display = 'none';
        activeRecipeDetailDish = null;
    }

    function renderRecipeDetailIngredients(dish) {
        const tbody = document.getElementById('recDetailIngredientsTbody');
        if (!tbody) return;

        const rec = dish.recipe;
        let components = [];
        if (rec && Array.isArray(rec.components) && rec.components.length > 0) {
            components = rec.components;
        } else {
            // Default breakdown for standard cafe dishes
            components = [
                { id: 'RM-OIL', quantity: 0.02, unit: 'Litre', type: 'raw' },
                { id: 'RM-ONION', quantity: 0.05, unit: 'kg', type: 'raw' }
            ];
        }

        tbody.innerHTML = components.map((c, idx) => {
            let itemName = c.name || c.id;
            let unitCost = 0;
            const rm = rawMaterials.find(m => m.id === c.id);
            const sub = subRecipes.find(s => s.id === c.id);
            if (rm) {
                itemName = rm.name;
                unitCost = rm.cost_per_unit || 0;
            } else if (sub) {
                itemName = sub.name;
                unitCost = sub.unit_production_cost || 100;
            }
            const qty = c.exact_quantity || c.quantity || 0.1;
            const contrib = Math.round(qty * unitCost * 100) / 100;

            return \`
                <tr data-row-idx="\${idx}">
                    <td style="padding: 8px 10px;">
                        <select class="rec-ing-select form-input" onchange="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 100%; font-size: 11.5px; padding: 4px 6px;">
                            <optgroup label="Semi-Finished Bases">
                                \${subRecipes.map(s => \`<option value="\${s.id}" \${s.id === c.id ? 'selected' : ''}>\${escapeHtml(s.name)} (₹ \${s.unit_production_cost}/\${s.yield_unit})</option>\`).join('')}
                            </optgroup>
                            <optgroup label="Raw Materials">
                                \${rawMaterials.map(m => \`<option value="\${m.id}" \${m.id === c.id ? 'selected' : ''}>\${escapeHtml(m.name)} (₹ \${m.cost_per_unit}/\${m.purchase_unit})</option>\`).join('')}
                            </optgroup>
                        </select>
                    </td>
                    <td style="padding: 8px 10px;">
                        <input type="number" class="rec-ing-qty form-input" value="\${qty}" step="0.005" min="0" oninput="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 70px; font-size: 12px; font-weight: 700; padding: 4px 6px;">
                        <span style="font-size: 10px; color: var(--text-muted);">\${c.unit || 'units'}</span>
                    </td>
                    <td style="padding: 8px 10px; font-size: 11px; color: var(--text-muted);" class="rec-ing-rate">
                        ₹ \${unitCost.toFixed(2)}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #143832;" class="rec-ing-contrib">
                        ₹ \${contrib.toFixed(2)}
                    </td>
                    <td style="padding: 8px 6px; text-align: center;">
                        <button type="button" onclick="window.culinaryInventory.removeRecipeDetailRow(this)" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 2px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </td>
                </tr>
            \`;
        }).join('');
    }

    function addRecipeDetailRow() {
        const tbody = document.getElementById('recDetailIngredientsTbody');
        if (!tbody) return;
        const newRow = document.createElement('tr');
        const defaultMat = rawMaterials[0] || { id: 'RM-OIL', name: 'Cooking Oil', cost_per_unit: 135, purchase_unit: 'Litre' };
        newRow.innerHTML = \`
            <td style="padding: 8px 10px;">
                <select class="rec-ing-select form-input" onchange="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 100%; font-size: 11.5px; padding: 4px 6px;">
                    <optgroup label="Semi-Finished Bases">
                        \${subRecipes.map(s => \`<option value="\${s.id}">\${escapeHtml(s.name)} (₹ \${s.unit_production_cost}/\${s.yield_unit})</option>\`).join('')}
                    </optgroup>
                    <optgroup label="Raw Materials">
                        \${rawMaterials.map(m => \`<option value="\${m.id}">\${escapeHtml(m.name)} (₹ \${m.cost_per_unit}/\${m.purchase_unit})</option>\`).join('')}
                    </optgroup>
                </select>
            </td>
            <td style="padding: 8px 10px;">
                <input type="number" class="rec-ing-qty form-input" value="0.1" step="0.005" min="0" oninput="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 70px; font-size: 12px; font-weight: 700; padding: 4px 6px;">
                <span style="font-size: 10px; color: var(--text-muted);">\${defaultMat.purchase_unit || 'units'}</span>
            </td>
            <td style="padding: 8px 10px; font-size: 11px; color: var(--text-muted);" class="rec-ing-rate">
                ₹ \${(defaultMat.cost_per_unit || 0).toFixed(2)}
            </td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #143832;" class="rec-ing-contrib">
                ₹ 0.00
            </td>
            <td style="padding: 8px 6px; text-align: center;">
                <button type="button" onclick="window.culinaryInventory.removeRecipeDetailRow(this)" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 2px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </td>
        \`;
        tbody.appendChild(newRow);
        recalcRecipeDetailMargin();
    }

    function removeRecipeDetailRow(btn) {
        const row = btn.closest('tr');
        if (row) {
            row.remove();
            recalcRecipeDetailMargin();
        }
    }

    function recalcRecipeDetailMargin() {
        const tbody = document.getElementById('recDetailIngredientsTbody');
        if (!tbody || !activeRecipeDetailDish) return;

        let totalCost = 0;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const select = row.querySelector('.rec-ing-select');
            const qtyInput = row.querySelector('.rec-ing-qty');
            const rateEl = row.querySelector('.rec-ing-rate');
            const contribEl = row.querySelector('.rec-ing-contrib');

            const itemId = select?.value;
            const qty = parseFloat(qtyInput?.value || '0') || 0;

            let rate = 0;
            const rm = rawMaterials.find(m => m.id === itemId);
            const sub = subRecipes.find(s => s.id === itemId);
            if (rm) rate = rm.cost_per_unit || 0;
            else if (sub) rate = sub.unit_production_cost || 100;

            const lineCost = Math.round(qty * rate * 100) / 100;
            totalCost += lineCost;

            if (rateEl) rateEl.textContent = \`₹ \${rate.toFixed(2)}\`;
            if (contribEl) contribEl.textContent = \`₹ \${lineCost.toFixed(2)}\`;
        });

        const yieldInput = document.getElementById('recDetailYieldInput');
        const yieldVal = Math.max(1, parseInt(yieldInput?.value || '1', 10));
        const portionCost = Math.round((totalCost / yieldVal) * 100) / 100;

        const sellingPrice = activeRecipeDetailDish.price || 200;
        const grossProfit = Math.max(0, Math.round((sellingPrice - portionCost) * 100) / 100);
        const marginPct = sellingPrice > 0 ? Math.round((grossProfit / sellingPrice) * 1000) / 10 : 0;

        const costEl = document.getElementById('recDetailCost');
        if (costEl) costEl.textContent = \`₹ \${portionCost.toFixed(2)}\`;

        const profitEl = document.getElementById('recDetailProfit');
        if (profitEl) profitEl.textContent = \`₹ \${grossProfit.toFixed(2)}\`;

        const marginEl = document.getElementById('recDetailMargin');
        if (marginEl) {
            marginEl.textContent = \`\${marginPct}%\`;
            marginEl.style.color = marginPct >= 65 ? '#166534' : (marginPct >= 50 ? '#D97706' : '#DC2626');
        }
    }

    async function saveRecipeDetailChanges() {
        if (!activeRecipeDetailDish) return;
        const tbody = document.getElementById('recDetailIngredientsTbody');
        if (!tbody) return;

        const components = [];
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const select = row.querySelector('.rec-ing-select');
            const qtyInput = row.querySelector('.rec-ing-qty');
            const itemId = select?.value;
            const qty = parseFloat(qtyInput?.value || '0') || 0;
            if (itemId && qty > 0) {
                const isSub = itemId.startsWith('SUB-');
                components.push({
                    id: itemId,
                    type: isSub ? 'sub_recipe' : 'raw',
                    exact_quantity: qty,
                    quantity: qty,
                    unit: isSub ? 'Litre' : 'kg'
                });
            }
        });

        const yieldInput = document.getElementById('recDetailYieldInput');
        const yieldVal = Math.max(1, parseInt(yieldInput?.value || '1', 10));

        let existingRec = recipes.find(r => String(r.menu_item_id) === String(activeRecipeDetailDish.id) || String(r.id) === String(activeRecipeDetailDish.id));
        if (!existingRec) {
            existingRec = {
                id: 'REC-' + String(activeRecipeDetailDish.id),
                menu_item_id: activeRecipeDetailDish.id,
                dish_name: activeRecipeDetailDish.name,
                selling_price: activeRecipeDetailDish.price || 200,
                components: []
            };
            recipes.push(existingRec);
        }

        existingRec.components = components;
        existingRec.yield_quantity = yieldVal;

        try {
            await fetch('/api/inventory/save-recipe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dishId: activeRecipeDetailDish.id,
                    recipe: existingRec
                })
            });
        } catch (e) {
            console.warn('[Culinary] Recipe saved offline:', e);
        }

        closeRecipeDetailModal();
        renderDishCostingTab();
        renderInventoryTelemetryUI();
        if (typeof showToast === 'function') showToast(\`✓ Updated recipe for \${activeRecipeDetailDish.name}!\`);
    }

    // --- 3. LOG WASTE & LOSS AUDIT MODAL ---
    function openLogWasteModal() {
        const modal = document.getElementById('invLogWasteModal');
        if (!modal) return;

        const select = document.getElementById('wasteItemSelect');
        if (select) {
            select.innerHTML = [
                ...rawMaterials.map(m => \`<option value="\${m.id}">\${escapeHtml(m.name)} (Current: \${m.current_stock} \${m.consumption_unit})</option>\`),
                ...subRecipes.map(s => \`<option value="\${s.id}">[Base] \${escapeHtml(s.name)} (Current: \${s.current_stock} \${s.yield_unit})</option>\`)
            ].join('');
        }
        recalcWasteCost();
        modal.style.display = 'flex';
    }

    function closeLogWasteModal() {
        const modal = document.getElementById('invLogWasteModal');
        if (modal) modal.style.display = 'none';
    }

    function recalcWasteCost() {
        const select = document.getElementById('wasteItemSelect');
        const qtyInput = document.getElementById('wasteQtyInput');
        const lossEl = document.getElementById('wasteFinancialLoss');
        if (!select || !qtyInput || !lossEl) return;

        const id = select.value;
        const qty = parseFloat(qtyInput.value || '0') || 0;

        let unitCost = 0;
        const rm = rawMaterials.find(m => m.id === id);
        const sub = subRecipes.find(s => s.id === id);
        if (rm) unitCost = rm.cost_per_unit || 0;
        else if (sub) unitCost = sub.unit_production_cost || 100;

        const totalLoss = Math.round(qty * unitCost * 100) / 100;
        lossEl.textContent = \`₹ \${totalLoss.toFixed(2)}\`;
    }

    async function submitLogWaste() {
        const select = document.getElementById('wasteItemSelect');
        const qtyInput = document.getElementById('wasteQtyInput');
        const reasonSelect = document.getElementById('wasteReasonSelect');
        if (!select || !qtyInput) return;

        const id = select.value;
        const qty = parseFloat(qtyInput.value || '0') || 0;
        const reason = reasonSelect?.value || 'Spoilage';

        if (qty <= 0) {
            if (typeof showToast === 'function') showToast('⚠️ Enter a valid wasted quantity');
            return;
        }

        let unitCost = 0;
        let itemName = id;
        let unitLabel = 'units';
        const rm = rawMaterials.find(m => m.id === id);
        const sub = subRecipes.find(s => s.id === id);
        if (rm) {
            rm.current_stock = Math.max(0, Math.round((rm.current_stock - qty) * 100) / 100);
            unitCost = rm.cost_per_unit || 0;
            itemName = rm.name;
            unitLabel = rm.consumption_unit;
        } else if (sub) {
            sub.current_stock = Math.max(0, Math.round((sub.current_stock - qty) * 100) / 100);
            unitCost = sub.unit_production_cost || 100;
            itemName = sub.name;
            unitLabel = sub.yield_unit;
        }

        const totalLoss = Math.round(qty * unitCost * 100) / 100;
        if (!wastage.history) wastage.history = [];
        wastage.history.unshift({
            date: 'Today',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            item: itemName,
            quantity: \`\${qty} \${unitLabel}\`,
            reason: reason,
            monetary_loss: totalLoss
        });
        wastage.total_loss_inr = (wastage.total_loss_inr || 0) + totalLoss;

        persistLocalSnapshot();

        try {
            await fetch('/api/inventory/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materialId: id, quantity: qty, reason })
            });
        } catch (e) {
            console.warn('[Culinary] Wastage logged offline:', e);
        }

        closeLogWasteModal();
        renderActiveHubTab();
        renderInventoryTelemetryUI();
        if (typeof showToast === 'function') showToast(\`🗑️ Recorded ₹ \${totalLoss.toFixed(2)} wastage loss for \${itemName}.\`);
    }

    // --- 4. PURCHASE ORDER MODAL ---
    function openPurchaseOrderModal() {
        const modal = document.getElementById('invPurchaseOrderModal');
        if (!modal) return;

        const suppliers = Array.from(new Set(rawMaterials.map(m => m.supplier || 'Mandi Wholesale').filter(Boolean)));
        const select = document.getElementById('poSupplierSelect');
        if (select) {
            select.innerHTML = suppliers.map(s => \`<option value="\${escapeHtml(s)}">\${escapeHtml(s)}</option>\`).join('');
        }
        renderPoItemsForSupplier();
        modal.style.display = 'flex';
    }

    function closePurchaseOrderModal() {
        const modal = document.getElementById('invPurchaseOrderModal');
        if (modal) modal.style.display = 'none';
    }

    function renderPoItemsForSupplier() {
        const select = document.getElementById('poSupplierSelect');
        const tbody = document.getElementById('poItemsTbody');
        if (!select || !tbody) return;

        const supplier = select.value;
        const items = rawMaterials.filter(m => (m.supplier || 'Mandi Wholesale') === supplier);

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-muted);">No materials assigned to this supplier.</td></tr>';
            recalcPoTotal();
            return;
        }

        tbody.innerHTML = items.map((item, idx) => {
            const isLow = item.current_stock <= item.min_threshold;
            const suggested = Math.max(1, Math.ceil(item.min_threshold * 2.5 - item.current_stock));
            const estCost = Math.round(suggested * item.cost_per_unit * 100) / 100;

            return \`
                <tr data-po-id="\${item.id}">
                    <td style="padding: 8px 10px;">
                        <div style="font-weight: 700; color: var(--text-dark);">\${escapeHtml(item.name)}</div>
                        <div style="font-size: 10px; color: var(--text-muted);">\${escapeHtml(item.id)}</div>
                    </td>
                    <td style="padding: 8px 10px; font-size: 11.5px;">
                        <span style="color: \${isLow ? '#DC2626' : '#143832'}; font-weight: 700;">\${item.current_stock}</span> / \${item.min_threshold} \${item.purchase_unit}
                    </td>
                    <td style="padding: 8px 10px;">
                        <input type="number" class="po-qty-input form-input" data-rate="\${item.cost_per_unit}" value="\${suggested}" min="0" step="any" oninput="window.culinaryInventory.recalcPoTotal()" style="width: 70px; padding: 4px 6px; font-weight: 700; font-size: 12px;">
                        <span style="font-size: 10px; color: var(--text-muted);">\${item.purchase_unit}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #143832;" class="po-line-cost">
                        ₹ \${estCost.toFixed(2)}
                    </td>
                </tr>
            \`;
        }).join('');
        recalcPoTotal();
    }

    function recalcPoTotal() {
        const tbody = document.getElementById('poItemsTbody');
        const totalEl = document.getElementById('poTotalEstimatedValue');
        if (!tbody || !totalEl) return;

        let total = 0;
        const rows = tbody.querySelectorAll('tr[data-po-id]');
        rows.forEach(row => {
            const input = row.querySelector('.po-qty-input');
            const costCell = row.querySelector('.po-line-cost');
            const rate = parseFloat(input?.getAttribute('data-rate') || '0') || 0;
            const qty = parseFloat(input?.value || '0') || 0;
            const line = Math.round(qty * rate * 100) / 100;
            total += line;
            if (costCell) costCell.textContent = \`₹ \${line.toFixed(2)}\`;
        });
        totalEl.textContent = \`₹ \${total.toFixed(2)}\`;
    }

    function sharePoWhatsApp() {
        const select = document.getElementById('poSupplierSelect');
        const supplier = select ? select.value : 'Wholesale Supplier';
        const tbody = document.getElementById('poItemsTbody');
        if (!tbody) return;

        let itemsText = '';
        let total = 0;
        const rows = tbody.querySelectorAll('tr[data-po-id]');
        rows.forEach(row => {
            const id = row.getAttribute('data-po-id');
            const item = rawMaterials.find(m => m.id === id);
            const input = row.querySelector('.po-qty-input');
            const qty = parseFloat(input?.value || '0') || 0;
            if (qty > 0 && item) {
                const line = Math.round(qty * item.cost_per_unit * 100) / 100;
                total += line;
                itemsText += \`• \${item.name}: \${qty} \${item.purchase_unit} @ ₹ \${item.cost_per_unit} = ₹ \${line.toFixed(2)}\\n\`;
            }
        });

        const msg = \`*PURCHASE ORDER - Billnaw Cafe*\\n*Supplier:* \${supplier}\\n*Date:* \${new Date().toLocaleDateString()}\\n\\n*Required Items:*\\n\${itemsText}\\n*Total Estimated:* ₹ \${total.toFixed(2)}\\n\\nPlease confirm delivery time. Thank you!\`;
        const waUrl = \`https://wa.me/?text=\${encodeURIComponent(msg)}\`;
        window.open(waUrl, '_blank');
        if (typeof showToast === 'function') showToast('📱 Opening WhatsApp with PO draft...');
    }

    async function savePurchaseOrder() {
        const select = document.getElementById('poSupplierSelect');
        const supplier = select ? select.value : 'Wholesale Supplier';
        const tbody = document.getElementById('poItemsTbody');
        if (!tbody) return;

        const items = [];
        let total = 0;
        const rows = tbody.querySelectorAll('tr[data-po-id]');
        rows.forEach(row => {
            const id = row.getAttribute('data-po-id');
            const item = rawMaterials.find(m => m.id === id);
            const input = row.querySelector('.po-qty-input');
            const qty = parseFloat(input?.value || '0') || 0;
            if (qty > 0 && item) {
                const line = Math.round(qty * item.cost_per_unit * 100) / 100;
                total += line;
                items.push({ material_id: id, name: item.name, quantity: qty, unit: item.purchase_unit, cost: line });
            }
        });

        const newPo = {
            id: 'PO-' + Date.now().toString().slice(-5),
            supplier,
            date: 'Today',
            items,
            total_amount: total,
            status: 'Draft / Sent to Supplier'
        };
        purchaseOrders.unshift(newPo);

        try {
            await fetch('/api/inventory/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPo)
            });
        } catch (e) {
            console.warn('[Culinary] PO saved offline:', e);
        }

        closePurchaseOrderModal();
        if (typeof showToast === 'function') showToast(\`✓ Purchase Order \${newPo.id} created for \${supplier}!\`);
    }
`;

// Insert modal controllers right before Public API
const publicApiAnchor = '    // Public API\n    window.culinaryInventory = {';
if (!code.includes(publicApiAnchor)) {
    console.error('Could not find Public API anchor');
    process.exit(1);
}
code = code.replace(publicApiAnchor, modalControllers + '\n' + publicApiAnchor);

// 3. Expose new methods on window.culinaryInventory
const exportsAnchor = '        registerNewDishRecipe,\n        toggleItemRow';
const newExports = `        registerNewDishRecipe,
        toggleItemRow,
        // Upgraded Modals & Actions
        openAddMaterialModal,
        closeAddMaterialModal,
        submitAddMaterial,
        syncUnitDefaults,
        openRecipeDetailModal,
        closeRecipeDetailModal,
        recalcRecipeDetailMargin,
        addRecipeDetailRow,
        removeRecipeDetailRow,
        saveRecipeDetailChanges,
        openLogWasteModal,
        closeLogWasteModal,
        recalcWasteCost,
        submitLogWaste,
        openPurchaseOrderModal,
        closePurchaseOrderModal,
        renderPoItemsForSupplier,
        recalcPoTotal,
        sharePoWhatsApp,
        savePurchaseOrder`;

code = code.replace(exportsAnchor, newExports);

fs.writeFileSync(culPath, code, 'utf8');
console.log('Successfully injected culinary engine methods!');
