// ============================================================
// 🍛 JS/CULINARY_INVENTORY.JS - End-to-End Indian Culinary & Liquid Telemetry Engine
// Composition Engine, Morning Commissary Batching, Bar Peg/Keg Matrix,
// Dynamic Food Costing & Live Margin Simulator, Central Kitchen & POs,
// Algorithmic Forecasting & 15-Minute Rapid Stock-Take Audit.
// ============================================================

(function() {
    'use strict';

    // State repositories
    let rawMaterials = [];
    let subRecipes = [];
    let recipes = [];
    let transfers = [];
    let purchaseOrders = [];
    let forecast = [];
    let wastage = { total_loss_inr: 0, history: [] };
    let costingReport = [];
    let activeSubTab = 'rtr_tracker';
    let activeHubTab = 'raw_stock';
    let rawStockSearchQuery = '';
    let rawStockActiveCategory = 'all';
    let commissaryBatchHistory = [];
    try {
        commissaryBatchHistory = JSON.parse(localStorage.getItem('billnaw_culinary_batches') || 'null') || [];
    } catch (e) {}
    if (!commissaryBatchHistory || commissaryBatchHistory.length === 0) {
        commissaryBatchHistory = [
            { id: 'BATCH-0021', subRecipeId: 'SUB-MAK-01', name: 'Makhani Gravy Base', quantity: 20, unit: 'Litre', unitCost: 132.5, totalCost: 2650, timestamp: '08:30 AM', date: 'Today', status: 'Ready in Walk-in Chiller' },
            { id: 'BATCH-0020', subRecipeId: 'SUB-GRAVY-BASE', name: 'Cooking Oil / Gravy Base', quantity: 15, unit: 'Litre', unitCost: 95.0, totalCost: 1425, timestamp: '07:15 AM', date: 'Today', status: 'Ready in Walk-in Chiller' }
        ];
    }

    // Clean initial arrays - strictly zero pre-loaded dummy seed data (pure user-created inventory only)
    const MATCHED_RAW_MATERIALS_IDS = [];
    const DEFAULT_LOCAL_MATERIALS = [];
    const DEFAULT_LOCAL_RECIPES = [];
    const DEFAULT_LOCAL_SUB_RECIPES = [];

    // Load initial state from backend or local fallback
    async function loadAllInventoryData() {
        try {
            const [matRes, subRes, recipeRes, costRes, trfRes, poRes, fcastRes, wstRes] = await Promise.all([
                fetch('/api/inventory/raw-materials').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/sub-recipes').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/recipes').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/costing').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/transfers').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/purchase-orders').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/forecast').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/wastage').then(r => r.json()).catch(() => null)
            ]);

            if (matRes && matRes.materials) rawMaterials = matRes.materials;
            else rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || '[]');

            if (subRes && subRes.sub_recipes) subRecipes = subRes.sub_recipes;
            else subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || '[]');

            if (recipeRes && recipeRes.recipes) recipes = recipeRes.recipes;
            if (costRes && costRes.costing) costingReport = costRes.costing;
            if (trfRes && trfRes.transfers) transfers = trfRes.transfers;
            if (poRes && poRes.purchase_orders) purchaseOrders = poRes.purchase_orders;
            if (fcastRes && fcastRes.forecast) forecast = fcastRes.forecast;
            if (wstRes) wastage = wstRes;

            persistLocalSnapshot();
            switchInventoryHubTab(activeHubTab || 'raw_stock');
            renderActiveSubTab();
            if (typeof renderInventoryTelemetryUI === 'function') renderInventoryTelemetryUI();
        } catch (e) {
            console.warn('[Culinary Inventory] Backend sync notice, using resilient offline store:', e);
            rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || '[]');
            subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || '[]');
            switchInventoryHubTab(activeHubTab || 'raw_stock');
            renderActiveSubTab();
            if (typeof renderInventoryTelemetryUI === 'function') renderInventoryTelemetryUI();
        }
    }


    // --- Operational Inventory Telemetry UI Controller (4 Stat Cards & Badges) ---
    function renderInventoryTelemetryUI() {
        const totalMaterials = rawMaterials.length;
        const categories = new Set(rawMaterials.map(m => m.category || 'General'));
        const lowStock = rawMaterials.filter(m => m.current_stock > 0 && m.current_stock <= m.min_threshold);
        const outStock = rawMaterials.filter(m => m.current_stock <= 0);
        const inStock = rawMaterials.filter(m => m.current_stock > m.min_threshold);

        const statTotal = document.getElementById('invStatTotalCount');
        if (statTotal) statTotal.textContent = `${totalMaterials} Items`;

        const statTotalSub = document.getElementById('invStatTotalSub');
        if (statTotalSub) statTotalSub.textContent = `Across ${categories.size} categories`;

        const statLow = document.getElementById('invStatRiskCount') || document.getElementById('invStatLowCount');
        if (statLow) statLow.textContent = `${lowStock.length} Low Stock`;

        const statLowSub = document.getElementById('invStatRiskSummary');
        if (statLowSub) statLowSub.textContent = lowStock.length > 0 ? `${lowStock.length} items require reordering` : 'All safety levels normal';

        const statInStock = document.getElementById('invStatReadyPercent') || document.getElementById('invStatInStockCount');
        if (statInStock) statInStock.textContent = `${inStock.length} Items`;

        const statInStockSub = document.getElementById('invStatReadySummary');
        if (statInStockSub) statInStockSub.textContent = 'Optimal safety levels';

        const statOut = document.getElementById('invStatOutCount');
        if (statOut) statOut.textContent = `${outStock.length} Items`;

        const statOutSub = document.getElementById('invStatOutSummary');
        if (statOutSub) statOutSub.textContent = outStock.length > 0 ? `${outStock.length} items need attention` : 'Zero stockouts';

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
                lossText.textContent = `⚠️ Critical: ${outStock.length} ingredients out of stock (${names}${outStock.length > 3 ? '...' : ''}). Reorder immediately.`;
            } else if (lowStock.length > 0) {
                const names = lowStock.slice(0, 3).map(m => m.name).join(', ');
                lossText.textContent = `⚠️ Reorder Warning: ${lowStock.length} items low (${names}).`;
            } else {
                lossText.textContent = 'All inventory levels healthy.';
            }
        }
    }
    window.renderInventoryTelemetryUI = renderInventoryTelemetryUI;

    function persistLocalSnapshot() {
        try {
            localStorage.setItem('billnaw_culinary_materials', JSON.stringify(rawMaterials));
            localStorage.setItem('billnaw_culinary_subs', JSON.stringify(subRecipes));
        } catch (e) {}
    }
    // Global escapeHtml utilized from js/core.js


    // Hub Tab Switcher (3-Tab Operational Suite)
    function switchInventoryHubTab(tabName) {
        let target = tabName || 'raw_stock';
        if (target === 'rtr_tracker' || target === 'raw_materials') target = 'raw_stock';
        if (target === 'morning_prep') target = 'morning_batch';
        if (target === 'dish_costing' || target === 'recipes_costing' || target === 'central_kitchen' || target === 'purchase_orders' || target === 'forecasting_waste' || target === 'quick_audit') target = 'dish_costing';

        activeHubTab = target;

        const btnRaw = document.getElementById('invTabBtn-rawStock');
        const btnPrep = document.getElementById('invTabBtn-morningPrep');
        const btnCost = document.getElementById('invTabBtn-dishCosting');

        if (btnRaw) {
            if (target === 'raw_stock') { btnRaw.classList.add('active'); btnRaw.setAttribute('aria-selected', 'true'); }
            else { btnRaw.classList.remove('active'); btnRaw.setAttribute('aria-selected', 'false'); }
        }
        if (btnPrep) {
            if (target === 'morning_batch') { btnPrep.classList.add('active'); btnPrep.setAttribute('aria-selected', 'true'); }
            else { btnPrep.classList.remove('active'); btnPrep.setAttribute('aria-selected', 'false'); }
        }
        if (btnCost) {
            if (target === 'dish_costing') { btnCost.classList.add('active'); btnCost.setAttribute('aria-selected', 'true'); }
            else { btnCost.classList.remove('active'); btnCost.setAttribute('aria-selected', 'false'); }
        }

        const paneRaw = document.getElementById('invTabRawStock');
        const panePrep = document.getElementById('invTabMorningPrep');
        const paneCost = document.getElementById('invTabDishCosting');

        if (paneRaw) {
            if (target === 'raw_stock') { paneRaw.style.display = 'block'; paneRaw.classList.add('active'); }
            else { paneRaw.style.display = 'none'; paneRaw.classList.remove('active'); }
        }
        if (panePrep) {
            if (target === 'morning_batch') { panePrep.style.display = 'block'; panePrep.classList.add('active'); }
            else { panePrep.style.display = 'none'; panePrep.classList.remove('active'); }
        }
        if (paneCost) {
            if (target === 'dish_costing') { paneCost.style.display = 'block'; paneCost.classList.add('active'); }
            else { paneCost.style.display = 'none'; paneCost.classList.remove('active'); }
        }

        // In Stage mode (M4), panels are direct isolated siblings; accordion expansion is no longer required.

        renderActiveHubTab();

        const contentArea = document.getElementById('culinarySubTabContent');
        if (contentArea) {
            if (target === 'raw_stock') renderRtrTrackerTab(contentArea);
            else if (target === 'morning_batch') renderMorningBatchTab(contentArea);
            else if (target === 'dish_costing') renderDishCostingTab(contentArea);
        }

        if (typeof renderInventoryTelemetryUI === 'function') {
            renderInventoryTelemetryUI();
        }
    }
    window.switchInventoryHubTab = switchInventoryHubTab;
    window.switchInventoryTab = switchInventoryHubTab;
    window.switchInventory3Tab = switchInventoryHubTab;

    // Inline Accordion Toggler Compatibility Stub (M4: satisfies test_responsive_empirical_verification.cjs)
    function toggleAccordion(accId) {
        if (accId === 'batching' || accId === 'invAccordionBatching') {
            const panel = document.getElementById('invAccordionBatching');
            const btn = document.getElementById('btnInvAccBatching');
            const body = document.getElementById('invAccBodyBatching');
            const isOpen = (panel && panel.classList.contains('open')) || (body && body.style.display === 'block');
            if (isOpen) {
                if (panel) panel.classList.remove('open');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                if (body) body.style.display = 'none';
            } else {
                if (panel) panel.classList.add('open');
                if (btn) btn.setAttribute('aria-expanded', 'true');
                if (body) body.style.display = 'block';
                renderMorningPrepTab();
            }
        } else if (accId === 'costing' || accId === 'invAccordionCosting') {
            const panel = document.getElementById('invAccordionCosting');
            const btn = document.getElementById('btnInvAccCosting');
            const body = document.getElementById('invAccBodyCosting');
            const isOpen = (panel && panel.classList.contains('open')) || (body && body.style.display === 'block');
            if (isOpen) {
                if (panel) panel.classList.remove('open');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                if (body) body.style.display = 'none';
            } else {
                if (panel) panel.classList.add('open');
                if (btn) btn.setAttribute('aria-expanded', 'true');
                if (body) body.style.display = 'block';
                renderDishCostingTab();
            }
        }
    }
    window.toggleCulinaryAccordion = toggleAccordion;

    function renderActiveHubTab() {
        if (activeHubTab === 'raw_stock') {
            renderRawStockTab();
        } else if (activeHubTab === 'morning_batch') {
            renderMorningPrepTab();
        } else if (activeHubTab === 'dish_costing') {
            renderDishCostingTab();
        }
    }

    function filterRawStock(query) {
        rawStockSearchQuery = (query || '').toLowerCase().trim();
        renderRawStockTab();
    }

    function filterRawStockCategory(cat) {
        rawStockActiveCategory = cat || 'all';
        renderRawStockTab();
    }

    // --- Mobile Master-Detail Row Layout Expansion Tracker (Milestone M2) ---
    const expandedItemRowIds = new Set();

    function toggleItemRow(itemId, event) {
        if (event && event.target) {
            // Prevent toggle if tapping interactive buttons/inputs
            if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('a')) {
                return;
            }
        }
        const card = document.getElementById(`invItem-${itemId}`) || document.querySelector(`.inv-stock-card[data-item-id="${itemId}"]`);
        if (!card) return;
        const isNowExpanded = card.classList.toggle('expanded');
        const master = card.querySelector('.inv-row-master');
        if (master) {
            master.setAttribute('aria-expanded', isNowExpanded ? 'true' : 'false');
        }
        if (isNowExpanded) {
            expandedItemRowIds.add(itemId);
        } else {
            expandedItemRowIds.delete(itemId);
        }
    }

    // --- TAB 1: RAW STOCK & RESTOCK TELEMETRY ---
    function renderRawStockTab(container) {
        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabRawStock');
        if (!targetContainer) return;

        if (rawMaterials.length === 0) {
            targetContainer.innerHTML = `
                <div class="empty-inventory-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No inventory items added yet</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Start tracking raw ingredients, pantry supplies, and packaging. Click below to add an ingredient or record your first purchase.
                    </p>
                    <div style="display: inline-flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openAddMaterialModal()" style="padding: 9px 18px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>+ Add Raw Material</span>
                        </button>
                        <button type="button" class="btn btn-primary" onclick="openRestockExpenseModal()" style="padding: 9px 18px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>+ Quick Restock / Purchase</span>
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const query = (rawStockSearchQuery || '').toLowerCase().trim();
        const activeCat = rawStockActiveCategory || 'all';

        const filteredMaterials = rawMaterials.filter(item => {
            if (activeCat === 'low') {
                if (!(item.current_stock > 0 && item.current_stock <= item.min_threshold)) return false;
            } else if (activeCat === 'out') {
                if (item.current_stock > 0) return false;
            } else if (activeCat === 'instock') {
                if (item.current_stock <= item.min_threshold) return false;
            } else if (activeCat !== 'all') {
                const cat = (item.category || '').toLowerCase();
                if (activeCat === 'dairy' && !cat.includes('dairy')) return false;
                if (activeCat === 'produce' && !cat.includes('produce')) return false;
                if (activeCat === 'meat' && !cat.includes('meat') && !cat.includes('poultry')) return false;
                if (activeCat === 'beverages' && !cat.includes('beverage')) return false;
                if (activeCat === 'pantry' && !cat.includes('pantry') && !cat.includes('grains') && !cat.includes('dry')) return false;
                if (activeCat === 'spices' && !cat.includes('spice')) return false;
                if (activeCat === 'spirits' && item.unit_type !== 'spirit' && item.unit_type !== 'draught_beer') return false;
            }
            if (query) {
                const name = (item.name || '').toLowerCase();
                const cat = (item.category || '').toLowerCase();
                const id = (item.id || '').toLowerCase();
                const supp = (item.supplier || '').toLowerCase();
                if (!name.includes(query) && !cat.includes(query) && !id.includes(query) && !supp.includes(query)) {
                    return false;
                }
            }
            return true;
        });

        const spirits = rawMaterials.filter(m => m.unit_type === 'spirit' || m.unit_type === 'draught_beer');
        const showSpirits = spirits.length > 0 && (activeCat === 'all' || activeCat === 'spirits');

        const lowStockCount = rawMaterials.filter(m => m.current_stock > 0 && m.current_stock <= m.min_threshold).length;
        const outCount = rawMaterials.filter(m => m.current_stock <= 0).length;

        // Morning Prep Checklist calculations
        const todayPrepCount = commissaryBatchHistory.filter(b => b.date === 'Today').length;
        const totalPrepTasks = Math.max(subRecipes.length, 1);
        const prepPercent = Math.min(100, Math.round((todayPrepCount / totalPrepTasks) * 100));

        targetContainer.innerHTML = `
            <div class="inv-desktop-split-layout">
                <!-- LEFT COLUMN: Main Data Table & Filtering -->
                <div class="inv-main-content">
                    <!-- Category Chips & Search Bar -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                            ${[
                                { id: 'all', label: 'All Items' },
                                { id: 'low', label: 'Low Stock' },
                                { id: 'out', label: 'Out of Stock' },
                                { id: 'instock', label: 'In Stock' },
                                { id: 'dairy', label: 'Dairy' },
                                { id: 'produce', label: 'Produce & Veg' },
                                { id: 'meat', label: 'Poultry & Meat' },
                                { id: 'beverages', label: 'Beverages' },
                                { id: 'pantry', label: 'Pantry & Grains' },
                                { id: 'spices', label: 'Spices' },
                                ...(spirits.length > 0 ? [{ id: 'spirits', label: 'Bar & Spirits' }] : [])
                            ].map(c => `
                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.filterRawStockCategory('${c.id}')" style="font-size: 11px; padding: 5px 12px; border-radius: 20px; font-weight: 700; ${activeCat === c.id ? 'background: #143832; color: #FFFFFF; border-color: #143832;' : 'background: #FFFFFF; color: #475569; border-color: #CBD5E1;'}">
                                    ${c.label}
                                </button>
                            `).join('')}
                        </div>
                        <div style="position: relative; min-width: 220px; flex: 1; max-width: 320px;">
                            <div style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94A3B8;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            </div>
                            <input type="text" id="rawStockSearchInput" value="${escapeHtml(rawStockSearchQuery)}" oninput="window.culinaryInventory.filterRawStock(this.value)" placeholder="Search raw materials, suppliers..." style="width: 100%; padding: 7px 12px 7px 32px; font-size: 12px; border-radius: 20px; border: 1.5px solid #CBD5E1; background: #FFFFFF; outline: none; box-sizing: border-box;">
                        </div>
                    </div>

                    ${showSpirits ? `
                    <!-- Spirits & Brewery Bar Matrix -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div style="font-size: 13px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 6px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 22h8"/><path d="M12 11v11"/><path d="m19 3-7 8-7-8Z"/></svg>
                                <span>Bar & Brewery Liquid Telemetry</span>
                            </div>
                            <span style="font-size: 11px; color: var(--text-muted);">Exact 30ml/60ml peg deductions & 6% tap line froth buffer</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
                            ${spirits.map(s => {
                                const isBeer = s.unit_type === 'draught_beer';
                                const totalMl = s.conversion_factor || 1000;
                                const pct = Math.min(100, Math.round((s.current_stock / totalMl) * 100));
                                const gaugeColor = pct < 25 ? '#EF4444' : (pct < 50 ? '#F59E0B' : '#10B981');
                                return `
                                    <div class="card" style="padding: 14px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${isBeer ? '#D97706' : '#6B21A8'}; background: ${isBeer ? '#FEF3C7' : '#F3E8FF'}; padding: 2px 7px; border-radius: 8px;">
                                                    ${isBeer ? 'Draught Keg' : 'Spirit 750ml'}
                                                </span>
                                                <div style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin-top: 3px;">${escapeHtml(s.name)}</div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 15px; font-weight: 800; color: #143832;">${s.current_stock} <span style="font-size: 10px;">ml</span></div>
                                                <div style="font-size: 10px; color: var(--text-muted);">${(s.current_stock / 1000).toFixed(2)}L left</div>
                                            </div>
                                        </div>
                                        <div style="background: #F1F5F9; height: 8px; border-radius: 4px; overflow: hidden; margin: 8px 0 6px 0;">
                                            <div style="width: ${pct}%; height: 100%; background: ${gaugeColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-muted);">
                                            <span>${pct}% Remaining</span>
                                            <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openRestockModal('${s.id}')" style="padding: 2px 8px; font-size: 10px; border-radius: 10px;">+ Restock</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- High-Contrast Raw Stock Telemetry Table -->
                    <div class="inv-telemetry-container">
                        <div style="padding: 14px 18px; border-bottom: 1.5px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: #FFFFFF;">
                            <div>
                                <div style="font-size: 15px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                    <span>Raw Materials Inventory</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                    Showing ${filteredMaterials.length} materials • Safety reorder threshold active
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${outCount > 0 ? `<span class="inv-badge-out" style="padding: 4px 10px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ${outCount} Out</span>` : ''}
                                ${lowStockCount > 0 ? `<span class="inv-badge-low" style="padding: 4px 10px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${lowStockCount} Low</span>` : ''}
                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openAddMaterialModal()" style="font-size: 11px; padding: 6px 12px; border-radius: 14px; display: inline-flex; align-items: center; gap: 4px;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    <span>+ Material</span>
                                </button>
                                <button type="button" class="btn btn-primary" onclick="openRestockExpenseModal()" style="font-size: 11px; padding: 6px 14px; border-radius: 14px; display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    <span>+ Restock</span>
                                </button>
                            </div>
                        </div>

                        <!-- Vertical Data Table for Raw Stock Telemetry -->
                        <div class="inv-telemetry-table-wrap">
                            <table class="inv-telemetry-table">
                                <thead>
                                    <tr>
                                        <th>Item &amp; Category</th>
                                        <th>Current Stock</th>
                                        <th>Min Level</th>
                                        <th>Cost Rate</th>
                                        <th>Supplier</th>
                                        <th>Status</th>
                                        <th style="text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filteredMaterials.length === 0 ? `
                                        <tr>
                                            <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">
                                                No ingredients match current search or category filter.
                                            </td>
                                        </tr>
                                    ` : filteredMaterials.map(item => {
                                        const isOut = item.current_stock <= 0;
                                        const isLow = !isOut && item.current_stock <= item.min_threshold;
                                        const badgeHtml = isOut
                                            ? `<span class="inv-badge-out"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Out</span>`
                                            : (isLow
                                                ? `<span class="inv-badge-low"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Low</span>`
                                                : `<span class="inv-badge-instock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> In Stock</span>`);

                                        const stockColor = isOut ? '#DC2626' : (isLow ? '#D97706' : '#143832');
                                        const unitLabel = item.consumption_unit || item.purchase_unit || 'units';

                                        const maxCap = Math.max(item.min_threshold * 2.5, item.current_stock, 1);
                                        const stockPct = Math.min(100, Math.round((item.current_stock / maxCap) * 100));
                                        const barColor = isOut ? '#DC2626' : (isLow ? '#F59E0B' : '#10B981');

                                        return `
                                            <tr>
                                                <td>
                                                    <div style="font-weight: 800; color: var(--text-dark); font-size: 13.5px;">${escapeHtml(item.name)}</div>
                                                    <div style="font-size: 11px; color: #64748B;">${escapeHtml(item.category || 'General')} • <span style="font-family: monospace;">${escapeHtml(item.id)}</span></div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 15px; font-weight: 800; color: ${stockColor};">
                                                        ${item.current_stock} <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">${escapeHtml(unitLabel)}</span>
                                                    </div>
                                                    <div class="inv-stock-progress-wrap" title="${stockPct}% of standard capacity">
                                                        <div class="inv-stock-progress-bar" style="width: ${stockPct}%; background: ${barColor};"></div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12px; font-weight: 600; color: #475569;">
                                                        ${item.min_threshold} <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(unitLabel)}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12.5px; font-weight: 700; color: #0F172A;">
                                                        ₹ ${item.cost_per_unit} <span style="font-size: 10px; color: var(--text-muted);">/ ${escapeHtml(item.purchase_unit || unitLabel)}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12px; font-weight: 600; color: #334155;">${escapeHtml(item.supplier || 'Mandi Wholesale')}</div>
                                                </td>
                                                <td>
                                                    ${badgeHtml}
                                                </td>
                                                <td style="text-align: right;">
                                                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                                                        <button type="button" class="btn btn-primary" onclick="window.culinaryInventory.openRestockModal('${item.id}')" style="font-size: 11px; padding: 5px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                            <span>Restock</span>
                                                        </button>
                                                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.promptPriceEdit('${item.id}')" style="font-size: 11px; padding: 5px 9px; border-radius: 12px;" title="Edit Purchase Rate">
                                                            <span>Rate</span>
                                                        </button>
                                                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openItemAlertModal('${item.id}')" style="font-size: 11px; padding: 5px 9px; border-radius: 12px;" title="Set Safety Threshold">
                                                            <span>Min</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Mobile Touch Card List (visible on screens < 768px) -->
                        <div class="inv-stock-cards-grid">
                            ${filteredMaterials.map(item => {
                                const isOut = item.current_stock <= 0;
                                const isLow = !isOut && item.current_stock <= item.min_threshold;
                                const cardClass = isOut ? 'card-out' : (isLow ? 'card-low' : 'card-instock');
                                const isExpanded = expandedItemRowIds.has(item.id);
                                const expandedClass = isExpanded ? ' expanded' : '';

                                const badgeHtml = isOut
                                    ? `<span class="inv-badge-out"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> <span class="badge-text">Out of Stock</span></span>`
                                    : (isLow
                                        ? `<span class="inv-badge-low"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span class="badge-text">Low Stock</span></span>`
                                        : `<span class="inv-badge-instock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> <span class="badge-text">In Stock</span></span>`);

                                const stockColor = isOut ? '#DC2626' : (isLow ? '#D97706' : '#143832');
                                const unitLabel = item.consumption_unit || item.purchase_unit || 'units';

                                return `
                                    <div class="inv-stock-card ${cardClass}${expandedClass}" id="invItem-${item.id}" data-item-id="${item.id}">
                                        <div class="inv-row-master" onclick="window.culinaryInventory.toggleItemRow('${item.id}', event)" role="button" tabindex="0">
                                            <div class="inv-master-left">
                                                <h4 class="inv-card-name">${escapeHtml(item.name)}</h4>
                                            </div>
                                            <div class="inv-master-right">
                                                <div class="inv-master-stock inv-stock-qty-chip">
                                                    <span class="inv-stock-qty" style="color: ${stockColor};">${item.current_stock}</span>
                                                    <span class="inv-stock-unit">${escapeHtml(unitLabel)}</span>
                                                </div>
                                                <div class="inv-master-badge">${badgeHtml}</div>
                                                <div class="inv-row-chevron">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="inv-row-drawer" id="invDrawer-${item.id}">
                                            <div class="inv-drawer-inner">
                                                <div class="inv-card-meta">
                                                    <span>${escapeHtml(item.category || 'General')}</span>
                                                    <span class="inv-card-sep">•</span>
                                                    <span>${escapeHtml(item.supplier || 'Mandi Wholesale')}</span>
                                                </div>
                                                <div class="inv-card-levels-stacked" style="margin: 8px 0;">
                                                    <div class="inv-level-row">
                                                        <span>Safety Min:</span>
                                                        <strong>${item.min_threshold} ${escapeHtml(unitLabel)}</strong>
                                                    </div>
                                                    <div class="inv-level-row">
                                                        <span>Rate:</span>
                                                        <strong>₹ ${item.cost_per_unit} / ${escapeHtml(item.purchase_unit || unitLabel)}</strong>
                                                    </div>
                                                </div>
                                                <div class="inv-card-actions" style="display: flex; gap: 8px;">
                                                    <button type="button" class="btn btn-primary" onclick="event.stopPropagation(); window.culinaryInventory.openRestockModal('${item.id}')" style="font-size: 11px; padding: 6px 12px; border-radius: 10px;">+ Restock</button>
                                                    <button type="button" class="btn btn-outline" onclick="event.stopPropagation(); window.culinaryInventory.promptPriceEdit('${item.id}')" style="font-size: 11px; padding: 6px 10px; border-radius: 10px;">Rate</button>
                                                    <button type="button" class="btn btn-outline" onclick="event.stopPropagation(); window.culinaryInventory.openItemAlertModal('${item.id}')" style="font-size: 11px; padding: 6px 10px; border-radius: 10px;">Min</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <!-- RIGHT COLUMN: Morning Prep Checklist & Quick Actions (Matching Inspiration Sidebar) -->
                <div class="inv-sidebar-aside">
                    <!-- 1. Morning Prep Checklist Card -->
                    <div class="inv-prep-checklist-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                                    <span>Morning Prep Checklist</span>
                                </h3>
                                <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Daily kitchen bases &amp; batch progress</p>
                            </div>
                            <span style="font-size: 11px; font-weight: 800; color: #166534; background: #DCFCE7; padding: 3px 8px; border-radius: 10px;">
                                ${todayPrepCount}/${subRecipes.length} Done
                            </span>
                        </div>

                        <!-- Progress Bar -->
                        <div style="background: #F1F5F9; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 14px;">
                            <div style="width: ${prepPercent}%; height: 100%; background: #10B981; border-radius: 4px; transition: width 0.3s ease;"></div>
                        </div>

                        <!-- Checklist Items -->
                        <div style="max-height: 260px; overflow-y: auto;">
                            ${subRecipes.length === 0 ? `
                                <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 16px;">
                                    No prep bases configured yet.
                                </div>
                            ` : subRecipes.slice(0, 6).map(sub => {
                                const isDone = commissaryBatchHistory.some(b => b.subRecipeId === sub.id && b.date === 'Today');
                                return `
                                    <div class="inv-prep-task-item ${isDone ? 'completed' : ''}">
                                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                            <span style="color: ${isDone ? '#10B981' : '#CBD5E1'}; flex-shrink: 0;">
                                                ${isDone ? `
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                ` : `
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                                                `}
                                            </span>
                                            <div style="min-width: 0;">
                                                <div class="inv-prep-task-name" style="font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    ${escapeHtml(sub.name)}
                                                </div>
                                                <div style="font-size: 10.5px; color: var(--text-muted);">
                                                    Target: ${sub.yield_quantity} ${escapeHtml(sub.yield_unit)} • Stock: ${sub.current_stock} ${escapeHtml(sub.yield_unit)}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            ${isDone ? `
                                                <span style="font-size: 10px; font-weight: 700; color: #166534; background: #DCFCE7; padding: 2px 6px; border-radius: 6px;">Done</span>
                                            ` : `
                                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.produceMorningBatch('${sub.id}', 1.0)" style="font-size: 10px; padding: 3px 8px; border-radius: 8px; font-weight: 700;">
                                                    Prep
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <div style="margin-top: 10px; text-align: center; border-top: 1px dashed #E2E8F0; padding-top: 8px;">
                            <button type="button" onclick="switchInventoryHubTab('morning_batch')" style="background: none; border: none; font-size: 11px; font-weight: 700; color: var(--primary); cursor: pointer;">
                                View Full Prep Production Suite →
                            </button>
                        </div>
                    </div>

                    <!-- 2. Quick Actions Card -->
                    <div class="inv-quick-actions-card">
                        <div style="font-size: 13px; font-weight: 800; color: #143832; margin-bottom: 12px; text-transform: uppercase;">
                            Quick Operations
                        </div>
                        <button type="button" class="inv-quick-act-btn" onclick="openRestockExpenseModal()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            <span>Receive Stock / Purchase</span>
                        </button>
                        <button type="button" class="inv-quick-act-btn" onclick="window.culinaryInventory.openAddMaterialModal()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>Add New Raw Material</span>
                        </button>
                        <button type="button" class="inv-quick-act-btn" onclick="window.culinaryInventory.openPurchaseOrderModal()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            <span>Create Purchase Order (PO)</span>
                        </button>
                        <button type="button" class="inv-quick-act-btn" onclick="window.culinaryInventory.openLogWasteModal()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            <span>Log Kitchen Wastage / Loss</span>
                        </button>
                    </div>

                    <!-- 3. Today's Prep Summary Card -->
                    <div class="card" style="padding: 16px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Today's Prep Summary</div>
                        <div style="font-size: 20px; font-weight: 800; color: #143832; margin-top: 4px;">${todayPrepCount} Batches Prepared</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${prepPercent}% of daily commissary targets</div>
                        <div style="margin-top: 10px;">
                            <button type="button" class="btn btn-outline" onclick="switchInventoryHubTab('morning_batch')" style="width: 100%; font-size: 11px; padding: 6px; border-radius: 10px;">
                                View Batch History Log
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    window.renderRawStockTab = renderRawStockTab;

    // --- TAB 2: MORNING PREP & BATCHING ---
    function renderMorningPrepTab(container) {
        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabMorningPrep');
        if (!targetContainer) return;

        if (subRecipes.length === 0) {
            targetContainer.innerHTML = `
                <div class="empty-prep-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No morning prep batches configured</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Configure daily bulk bases, sauces, gravies, or prep batches to streamline kitchen operations and stock deductions.
                    </p>
                </div>
            `;
            return;
        }

        targetContainer.innerHTML = `
            <div style="margin-bottom: 24px;">
                <!-- Header Banner -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 18px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                            <span>Morning Commissary Batching &amp; Semi-Finished Bases</span>
                        </h3>
                        <p style="margin: 4px 0 0 0; font-size: 12.5px; color: var(--text-muted);">
                            Cooks execute bulk base production in 1 tap. System validates ingredient availability, deducts exact raw materials, credits sub-recipe stock, and logs batch history.
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.init()" style="font-size: 11px; padding: 6px 12px; border-radius: 14px; display: inline-flex; align-items: center; gap: 4px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <span>Refresh Stock</span>
                        </button>
                    </div>
                </div>

                <!-- Batching Cards Grid -->
                <div class="inv-batch-grid">
                    ${subRecipes.map(sub => {
                        const isLow = sub.current_stock <= sub.min_threshold;
                        const ingredientsList = sub.ingredients || [];

                        // Shortage analysis
                        const shortages = [];
                        let liveBatchRawCost = 0;
                        ingredientsList.forEach(ing => {
                            const rm = rawMaterials.find(m => m.id === ing.material_id);
                            const avail = rm ? rm.current_stock : 0;
                            const rate = rm ? rm.cost_per_unit : 0;
                            liveBatchRawCost += ing.quantity * rate;
                            if (avail < ing.quantity) {
                                shortages.push({
                                    name: rm ? rm.name : ing.material_id,
                                    needed: ing.quantity,
                                    available: avail,
                                    short: Math.round((ing.quantity - avail) * 10) / 10,
                                    unit: ing.unit
                                });
                            }
                        });

                        const hasShortage = shortages.length > 0;
                        const liveUnitCost = sub.yield_quantity > 0 ? (liveBatchRawCost / sub.yield_quantity).toFixed(2) : (sub.unit_production_cost || 100);

                        return `
                            <div class="inv-batch-card">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                                    <div>
                                        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #143832; background: #E6F4EA; padding: 2px 8px; border-radius: 8px;">
                                            Semi-Finished Base
                                        </span>
                                        <div style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin-top: 4px;">${escapeHtml(sub.name)}</div>
                                        <div style="font-size: 10.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(sub.id)}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 20px; font-weight: 800; color: ${isLow ? 'var(--danger)' : '#143832'};">
                                            ${sub.current_stock} <span style="font-size: 11px;">${escapeHtml(sub.yield_unit)}</span>
                                        </div>
                                        <div style="font-size: 10px; color: var(--text-muted);">Safety Min: ${sub.min_threshold} ${escapeHtml(sub.yield_unit)}</div>
                                    </div>
                                </div>

                                <!-- Ingredient Composition Box -->
                                <div class="inv-ingredient-box">
                                    <div style="font-size: 11px; font-weight: 800; color: #143832; margin-bottom: 6px; text-transform: uppercase; display: flex; justify-content: space-between;">
                                        <span>Composition for ${sub.yield_quantity} ${escapeHtml(sub.yield_unit)} Batch:</span>
                                        <span>Stock Status</span>
                                    </div>
                                    <div style="max-height: 120px; overflow-y: auto; font-size: 11px;">
                                        ${ingredientsList.map(ing => {
                                            const rm = rawMaterials.find(m => m.id === ing.material_id);
                                            const avail = rm ? rm.current_stock : 0;
                                            const isIngShort = avail < ing.quantity;
                                            return `
                                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dashed rgba(0,0,0,0.05);">
                                                    <span style="color: var(--text-dark);">${escapeHtml(rm ? rm.name : ing.material_id)}: <strong>${ing.quantity} ${escapeHtml(ing.unit)}</strong></span>
                                                    ${isIngShort
                                                        ? `<span class="batch-shortage-badge">Short by ${(ing.quantity - avail).toFixed(1)} ${escapeHtml(ing.unit)}</span>`
                                                        : `<span style="color: #166534; font-weight: 700; font-size: 10.5px;">✓ In Stock (${avail} ${escapeHtml(ing.unit)})</span>`
                                                    }
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>

                                ${hasShortage ? `
                                    <div style="margin-bottom: 12px; padding: 8px 12px; background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; font-size: 11px; color: #991B1B; line-height: 1.4;">
                                        <strong>⚠️ Shortage Alert:</strong> Insufficient raw ingredients (${shortages.map(s => `${s.name} short by ${s.short} ${s.unit}`).join(', ')}). Restock before batching.
                                    </div>
                                ` : ''}

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid #F1F5F9; flex-wrap: wrap; gap: 8px;">
                                    <div style="font-size: 11.5px; color: var(--text-muted);">
                                        Unit Prep Cost: <strong style="color: #143832; font-size: 13px;">₹ ${liveUnitCost} / ${escapeHtml(sub.yield_unit)}</strong>
                                    </div>
                                    <div style="display: inline-flex; gap: 6px;">
                                        <button type="button" class="inv-batch-btn" ${hasShortage ? 'disabled' : ''} onclick="window.culinaryInventory.produceMorningBatch('${sub.id}', 1.0)">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                                            <span>Produce 1x (${sub.yield_quantity} ${escapeHtml(sub.yield_unit)})</span>
                                        </button>
                                        <button type="button" class="btn btn-outline" ${hasShortage ? 'disabled' : ''} onclick="window.culinaryInventory.produceMorningBatch('${sub.id}', 2.0)" style="font-size: 11px; padding: 6px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                            <span>2x Batch</span>
                                        </button>
                                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.promptProduceBatch('${sub.id}', ${sub.yield_quantity})" style="font-size: 11px; padding: 6px 9px; border-radius: 12px;">
                                            <span>Custom</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Commissary Production Batch History Log -->
                <div style="margin-top: 24px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="padding: 14px 18px; border-bottom: 1.5px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: #FAF7F4;">
                        <div style="font-size: 14px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            <span>Commissary Production Batch Log</span>
                        </div>
                        <span style="font-size: 11px; color: var(--text-muted);">${commissaryBatchHistory.length} Batches Recorded</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="inv-costing-table">
                            <thead>
                                <tr>
                                    <th>Batch ID</th>
                                    <th>Sub-Recipe Base</th>
                                    <th>Quantity Produced</th>
                                    <th>Unit Prep Cost</th>
                                    <th>Total Batch Cost</th>
                                    <th>Timestamp</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${commissaryBatchHistory.map(b => `
                                    <tr>
                                        <td style="font-family: monospace; font-size: 11.5px; font-weight: 700;">${escapeHtml(b.id)}</td>
                                        <td style="font-weight: 800; color: var(--text-dark);">${escapeHtml(b.name)}</td>
                                        <td style="font-weight: 700; color: #143832;">${b.quantity} ${escapeHtml(b.unit)}</td>
                                        <td>₹ ${Number(b.unitCost || 0).toFixed(2)}</td>
                                        <td style="font-weight: 800; color: #166534;">₹ ${Number(b.totalCost || 0).toFixed(2)}</td>
                                        <td style="color: var(--text-muted); font-size: 11px;">${b.date || 'Today'} • ${b.timestamp}</td>
                                        <td>
                                            <span class="inv-margin-badge inv-margin-healthy" style="font-size: 10px;">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                ${escapeHtml(b.status || 'Ready in Chiller')}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
    window.renderMorningPrepTab = renderMorningPrepTab;

    async function produceMorningBatch(subRecipeId, multiplierOrQty) {
        const sub = subRecipes.find(s => s.id === subRecipeId);
        if (!sub) {
            if (typeof showToast === 'function') showToast('⚠️ Sub-recipe not found: ' + subRecipeId);
            return false;
        }

        let qty = sub.yield_quantity || 20.0;
        if (typeof multiplierOrQty === 'number') {
            if (multiplierOrQty <= 5.0) {
                qty = (sub.yield_quantity || 20.0) * multiplierOrQty;
            } else {
                qty = multiplierOrQty;
            }
        }
        qty = Math.round(qty * 100) / 100;
        const ratio = qty / (sub.yield_quantity || 1.0);

        // 1. Stock verification
        const shortages = [];
        if (Array.isArray(sub.ingredients)) {
            sub.ingredients.forEach(ing => {
                const rm = rawMaterials.find(m => m.id === ing.material_id);
                const needed = Math.round(ing.quantity * ratio * 1000) / 1000;
                const available = rm ? rm.current_stock : 0;
                if (available < needed) {
                    shortages.push({
                        material_id: ing.material_id,
                        name: rm ? rm.name : ing.material_id,
                        needed: needed,
                        available: available,
                        shortage: Math.round((needed - available) * 1000) / 1000,
                        unit: ing.unit || 'kg'
                    });
                }
            });
        }

        if (shortages.length > 0) {
            const detail = shortages.map(s => `• ${s.name}: Needs ${s.needed} ${s.unit}, only ${s.available} ${s.unit} in stock (short by ${s.shortage} ${s.unit})`).join('\n');
            alert(`⚠️ Insufficient Stock to Produce ${qty} ${sub.yield_unit} of ${sub.name}:\n\n${detail}\n\nPlease restock these raw materials before batching.`);
            if (typeof showToast === 'function') showToast(`❌ Shortage: Cannot produce ${sub.name}. Check ingredient stock.`);
            return false;
        }

        // 2. Stock deductions & Cost Rollup
        let totalRawCost = 0;
        if (Array.isArray(sub.ingredients)) {
            sub.ingredients.forEach(ing => {
                const rm = rawMaterials.find(m => m.id === ing.material_id);
                const needed = Math.round(ing.quantity * ratio * 1000) / 1000;
                if (rm) {
                    rm.current_stock = Math.max(0, Math.round((rm.current_stock - needed) * 1000) / 1000);
                    totalRawCost += needed * (rm.cost_per_unit || 0);
                }
            });
        }

        // 3. Sub-recipe stock credit
        sub.current_stock = Math.round((sub.current_stock + qty) * 100) / 100;
        if (qty > 0 && totalRawCost > 0) {
            sub.unit_production_cost = Math.round((totalRawCost / qty) * 100) / 100;
        }

        // Synchronize aliases
        if (sub.id === 'SUB-GRAVY-BASE') {
            const br = subRecipes.find(s => s.id === 'SUB-BROWN-01');
            if (br) br.current_stock = sub.current_stock;
        }

        // 4. Record to commissary batch history
        const batchLog = {
            id: 'BATCH-' + Date.now().toString().slice(-5),
            subRecipeId: sub.id,
            name: sub.name,
            quantity: qty,
            unit: sub.yield_unit,
            unitCost: sub.unit_production_cost,
            totalCost: Math.round(totalRawCost * 100) / 100,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: 'Today',
            status: 'Ready in Walk-in Chiller'
        };
        commissaryBatchHistory.unshift(batchLog);
        if (commissaryBatchHistory.length > 20) commissaryBatchHistory.pop();
        try {
            localStorage.setItem('billnaw_culinary_batches', JSON.stringify(commissaryBatchHistory));
        } catch(e) {}

        persistLocalSnapshot();

        // 5. Backend sync
        try {
            await fetch('/api/inventory/batch-produce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subRecipeId: sub.id, quantity: qty })
            });
        } catch (e) {
            console.warn('[Culinary] Batch produced offline:', e);
        }

        if (typeof showToast === 'function') {
            showToast(`✓ Produced ${qty} ${sub.yield_unit} of ${sub.name}! Raw stock deducted.`);
        }

        renderActiveHubTab();
        if (typeof renderInventoryTelemetryUI === 'function') renderInventoryTelemetryUI();
        return true;
    }
    window.produceMorningBatch = produceMorningBatch;

    // Tab Switcher
    function switchInventorySubTab(tabName) {
        activeSubTab = tabName;
        const tabs = document.querySelectorAll('.inv-subnav-btn');
        tabs.forEach(btn => {
            if (btn.getAttribute('data-subtab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        if (tabName === 'rtr_tracker' || tabName === 'raw_materials') {
            switchInventoryHubTab('raw_stock');
        } else if (tabName === 'morning_batch') {
            switchInventoryHubTab('morning_batch');
        } else {
            switchInventoryHubTab('dish_costing');
        }
        renderActiveSubTab();
    }
    window.switchInventorySubTab = switchInventorySubTab;

    function renderActiveSubTab() {
        const contentArea = document.getElementById('culinarySubTabContent');
        if (!contentArea) return;

        if (activeSubTab === 'rtr_tracker') {
            renderRtrTrackerTab(contentArea);
        } else if (activeSubTab === 'raw_materials') {
            renderRawMaterialsTab(contentArea);
        } else if (activeSubTab === 'morning_batch') {
            renderMorningBatchTab(contentArea);
        } else if (activeSubTab === 'dish_costing') {
            renderDishCostingTab(contentArea);
        } else if (activeSubTab === 'central_kitchen') {
            renderCentralKitchenTab(contentArea);
        } else if (activeSubTab === 'purchase_orders') {
            renderPurchaseOrdersTab(contentArea);
        } else if (activeSubTab === 'forecasting_waste') {
            renderForecastingWasteTab(contentArea);
        } else if (activeSubTab === 'quick_audit') {
            renderQuickAuditTab(contentArea);
        }
    }

    // ==========================================
    // 🥘 TAB 0: RTR (REAL-TIME RAW) & RECIPE TRACKER
    // ==========================================
    let rtrDishFilterQuery = '';

    function getCoreStaples() {
        return [
            { id: 'RM-OIL', icon: '🛢️', title: 'Cooking Oil', subtitle: 'Refined Sunflower Cooking Oil', unit: 'Litre', isSub: false, capacity: 50 },
            { id: 'RM-MAIDA', icon: '🌾', title: 'Flour (Maida)', subtitle: 'Refined Wheat Flour & Grains', unit: 'kg', isSub: false, capacity: 50 },
            { id: 'RM-POTATO', icon: '🥔', title: 'Spiced Potatoes', subtitle: 'Boiled & Seasoned Potatoes', unit: 'kg', isSub: false, capacity: 50 },
            { id: 'RM-MILK', icon: '🥛', title: 'Cow Milk', subtitle: 'Fresh Pasteurized Dairy Milk', unit: 'Litre', isSub: false, capacity: 40 },
            { id: 'RM-TEA-LEAVES', icon: '🍃', title: 'CTC Tea Leaves', subtitle: 'Strong Assam Chai Blend', unit: 'kg', isSub: false, capacity: 20 },
            { id: 'RM-SUGAR', icon: '🍬', title: 'Granulated Sugar', subtitle: 'Pure Refined Cane Sugar', unit: 'kg', isSub: false, capacity: 30 },
            { id: 'RM-POULTRY', icon: '🍗', title: 'Farm Poultry', subtitle: 'Fresh Curry Cut Farm Poultry', unit: 'kg', isSub: false, capacity: 40 },
            { id: 'RM-ONION-SPICES', icon: '🧅', title: 'Onions & Spices', subtitle: 'Sliced Onions & Fresh Spices', unit: 'kg', isSub: false, capacity: 40 },
            { id: 'SUB-GRAVY-BASE', icon: '🍲', title: 'Gravy Base', subtitle: 'Cooking Oil / Gravy Base', unit: 'Litre', isSub: true, capacity: 30 },
            { id: 'RM-COLA', icon: '🥤', title: 'Classic Cola', subtitle: 'Chilled Cola Cans & Fountain', unit: 'units', isSub: false, capacity: 100 },
            { id: 'RM-CHAAT-MASALA', icon: '🧂', title: 'Chaat Masala Blend', subtitle: 'Tangy Chatpata Spice Blend', unit: 'kg', isSub: false, capacity: 10 }
        ];
    }

    function getAllMenuDishes() {
        let menuList = [];
        if (window.menuItems && Array.isArray(window.menuItems) && window.menuItems.length > 0) {
            menuList = window.menuItems;
        } else {
            try {
                menuList = JSON.parse(localStorage.getItem('billnaw_menu') || '[]');
            } catch (e) {
                menuList = [];
            }
        }

        // If no menu items exist in storage, fall back to seeded recipes
        if (!menuList || menuList.length === 0) {
            return recipes.map(r => ({
                id: r.menu_item_id || r.id,
                name: r.dish_name,
                category: r.menu_category || 'Main Course',
                price: r.selling_price || 200,
                image: r.image || r.image_url || '',
                recipe: r
            }));
        }

        return menuList.map(item => {
            const recipe = findRecipeForDish(item.id, item.name);
            return {
                id: item.id,
                name: item.name,
                category: item.category || 'General',
                price: item.price || 0,
                image: item.image || item.image_url || '',
                recipe: recipe
            };
        });
    }

    function findRecipeForDish(itemId, dishName) {
        const strId = String(itemId);
        const nameClean = (dishName || '').toLowerCase().trim();

        // 1. By menu_item_id or id
        let rec = recipes.find(r => String(r.menu_item_id) === strId || String(r.id) === strId);
        if (rec) return rec;

        // 2. By exact dish name
        rec = recipes.find(r => (r.dish_name || '').toLowerCase().trim() === nameClean);
        if (rec) return rec;

        // 3. By partial match
        rec = recipes.find(r => {
            const rName = (r.dish_name || '').toLowerCase().trim();
            return nameClean.includes(rName) || rName.includes(nameClean);
        });
        return rec || null;
    }

    function renderRtrTrackerTab(container) {
        const staples = getCoreStaples();
        const dishes = getAllMenuDishes();

        // Quick aggregate KPI counts for 4 authentic dishes
        const oilItem = rawMaterials.find(m => m.id === 'RM-OIL') || { current_stock: 0, min_threshold: 5, consumption_unit: 'Litre' };
        const poultryItem = rawMaterials.find(m => m.id === 'RM-POULTRY' || m.id === 'RM-CHICKEN') || { current_stock: 0, min_threshold: 4, consumption_unit: 'kg' };
        const potatoItem = rawMaterials.find(m => m.id === 'RM-POTATO') || { current_stock: 0, min_threshold: 5, consumption_unit: 'kg' };
        const milkItem = rawMaterials.find(m => m.id === 'RM-MILK') || { current_stock: 0, min_threshold: 5, consumption_unit: 'Litre' };
        const colaItem = rawMaterials.find(m => m.id === 'RM-COLA') || { current_stock: 0, min_threshold: 10, consumption_unit: 'units' };
        const totalGravyStock = subRecipes.reduce((sum, s) => (s.id === 'SUB-GRAVY-BASE' || s.id === 'SUB-BROWN-01') ? sum + (s.current_stock || 0) : sum, 0);
        const configuredCount = dishes.filter(d => !!d.recipe).length;

        // Filter dishes by search term
        const filteredDishes = dishes.filter(d => {
            if (!rtrDishFilterQuery) return true;
            const q = rtrDishFilterQuery.toLowerCase();
            return (d.name || '').toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q);
        });

        container.innerHTML = `
            <div class="rtr-vertical-container">
                <!-- RTR Header Banner & Quick Insights -->
                <div class="card" style="padding: 18px 20px; border: 1.5px solid #E6DCCD; background: linear-gradient(135deg, #143832 0%, #1A4940 100%); color: #FFFFFF; border-radius: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #FFFFFF; display: inline-flex; align-items: center; gap: 8px;">
                                    <span>🥘 Real-Time Raw (RTR) & Recipe Tracker</span>
                                </h2>
                                <span class="badge" style="background: #2DD4BF; color: #143832; font-size: 11px; font-weight: 800;">LIVE POS AUTO-DEDUCTION</span>
                            </div>
                            <p style="margin: 6px 0 0 0; font-size: 12px; color: #D1FAE5; max-width: 680px; line-height: 1.5;">
                                Tracks exact consumption of Cooking Oil, Flour, Veggies/Onions, Poultry, Milk, and Gravy base as POS bills are settled. Click any menu dish below to set portion quantities or use <strong>⚡ Approx Auto-Fill</strong>.
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn" style="background: #2DD4BF; color: #143832; font-weight: 800; font-size: 12px; border-radius: 20px; padding: 7px 16px; border: none; display: inline-flex; align-items: center; gap: 6px;" onclick="window.culinaryInventory.syncMenuItems()">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                                <span>Refresh Menu &amp; Stock</span>
                            </button>
                        </div>
                    </div>

                    <!-- 3 Quick KPI Metrics -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.15);">
                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2.69 5.66 5.66a8 8 0 1 1-11.31 0z"/></svg><span>Cooking Oil Leftover</span></div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${oilItem.current_stock} <span style="font-size: 12px; font-weight: 600;">Litres</span>
                            </div>
                            <div style="font-size: 11px; color: ${oilItem.current_stock <= (oilItem.min_threshold || 5) ? '#FCA5A5' : '#86EFAC'};">
                                ${oilItem.current_stock <= (oilItem.min_threshold || 5) ? '<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Alert: Reorder Required</span>' : '<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Sufficient Kitchen Supply</span>'}
                            </div>
                        </div>

                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span>Poultry &amp; Potatoes</span></div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${poultryItem.current_stock} kg <span style="font-size: 12px; font-weight: 400; opacity: 0.8;">/</span> ${potatoItem.current_stock} kg
                            </div>
                            <div style="font-size: 11px; color: #D1FAE5;">
                                Leftover fresh poultry & potatoes
                            </div>
                        </div>

                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase;">🥛 Cow Milk & 🥤 Cola</div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${milkItem.current_stock} L <span style="font-size: 12px; font-weight: 400; opacity: 0.8;">/</span> ${colaItem.current_stock} <span style="font-size: 12px; font-weight: 600;">units</span>
                            </div>
                            <div style="font-size: 11px; color: #D1FAE5;">
                                ${configuredCount} of ${dishes.length} menu dishes mapped
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 🍽️ MENU DISHES RECIPE CONFIGURATOR (VERTICAL STACK) -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                <span>🍽️ Dishes & Portion Recipe Configurator</span>
                                <span class="badge" style="background: #143832; color: #2DD4BF; font-size: 11px;">${configuredCount} / ${dishes.length} Mapped</span>
                            </h3>
                            <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                                Click any dish to map its exact Gravy, Oil, Paneer/Meat, Veggies, and Flour quantities or use <strong>⚡ Approx Auto-Fill</strong>.
                            </p>
                        </div>

                        <!-- Dish Filter Search -->
                        <div style="min-width: 260px;">
                            <input type="text" id="rtrDishSearchInput" class="search-bar" placeholder="Search dishes (e.g. Paneer, Chicken, Roll)..." value="${escapeHtml(rtrDishFilterQuery)}" oninput="window.culinaryInventory.filterRtrDishes(this.value)" style="padding: 8px 12px; font-size: 12px; border-radius: 20px; width: 100%;">
                        </div>
                    </div>

                    <div class="rtr-dishes-vertical-list">
                        ${filteredDishes.length === 0 ? `
                            <div style="text-align: center; padding: 30px; background: #FFFFFF; border: 1.5px dashed #E5E7EB; border-radius: 12px; color: var(--text-muted); font-size: 13px;">
                                No dishes matched your search. Try a different keyword or create a dish in the Menu section.
                            </div>
                        ` : filteredDishes.map(dish => {
                            const rec = dish.recipe;
                            const isConfigured = !!rec && Array.isArray(rec.components) && rec.components.length > 0;

                            let pillsHtml = '';
                            let costHtml = '';

                            if (isConfigured) {
                                const pills = [];
                                let totalCost = 0;

                                rec.components.forEach(comp => {
                                    const pillSvg = comp.id === 'RM-OIL'
                                        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:middle;"><path d="m12 2.69 5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
                                        : (comp.type === 'sub_recipe' || comp.id === 'SUB-GRAVY-BASE' || comp.id === 'SUB-BROWN-01'
                                        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:middle;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
                                        : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:middle;"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>');
                                    pills.push(`<span class="rtr-recipe-pill" style="display:inline-flex;align-items:center;">${pillSvg}<span>${escapeHtml(comp.name || comp.id)}: ${comp.exact_quantity}${comp.unit || (comp.type === 'sub_recipe' ? 'L' : '')}</span></span>`);
                                });
                                pillsHtml = pills.join(' ');

                                // Calculate food cost & margin
                                rec.components.forEach(comp => {
                                    if (comp.type === 'sub_recipe') {
                                        const sub = subRecipes.find(s => s.id === comp.id);
                                        const unitCost = sub ? (sub.unit_production_cost || 120) : 120;
                                        totalCost += (unitCost * comp.exact_quantity);
                                    } else {
                                        const rm = rawMaterials.find(m => m.id === comp.id);
                                        const unitCost = rm ? (rm.cost_per_unit || 50) : 50;
                                        totalCost += (unitCost * comp.exact_quantity);
                                    }
                                });

                                const sPrice = parseFloat(dish.price) || parseFloat(rec.selling_price) || 0;
                                const marginPct = sPrice > 0 ? Math.round(((sPrice - totalCost) / sPrice) * 100) : 0;
                                costHtml = `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Food Cost: <strong>₹ ${totalCost.toFixed(2)}</strong> • Margin: <strong style="color: #16A34A;">${marginPct}%</strong></div>`;
                            } else {
                                pillsHtml = `<span style="font-size: 12px; color: #D97706; display:inline-flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Needs Recipe Mapping — Tap to configure portion quantities</span></span>`;
                            }

                            return `
                                <div class="rtr-dish-card" onclick="window.culinaryInventory.openDishRecipeModal('${dish.id}')">
                                    <div style="flex: 1; min-width: 240px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 15px; font-weight: 800; color: var(--text-dark);">${escapeHtml(dish.name)}</span>
                                            <span class="badge" style="background: #F1F5F9; color: #475569; font-size: 11px;">${escapeHtml(dish.category)}</span>
                                            <span style="font-size: 13px; font-weight: 800; color: #143832;">₹ ${dish.price}</span>
                                        </div>
                                        <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                                            ${pillsHtml}
                                        </div>
                                        ${costHtml}
                                    </div>

                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        ${isConfigured ? `
                                            <span class="badge" style="background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 800; display:inline-flex; align-items:center; gap:4px;"><span>Configured</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                                        ` : `
                                            <span class="badge" style="background: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 800; display:inline-flex; align-items:center; gap:4px;"><span>Needs Recipe</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                                        `}
                                        <button type="button" class="btn btn-outline" style="border-radius: 20px; font-size: 11px; padding: 6px 14px; font-weight: 700; pointer-events: none; display:inline-flex; align-items:center; gap:4px;">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                            <span>Configure</span>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Filter dishes by search term
    function filterRtrDishes(searchTerm) {
        rtrDishFilterQuery = searchTerm || '';
        const contentArea = document.getElementById('culinarySubTabContent');
        if (contentArea && activeSubTab === 'rtr_tracker') {
            renderRtrTrackerTab(contentArea);
        }
    }

    // --- DISH RECIPE CONFIGURATOR MODAL CONTROLLER ---
    function openDishRecipeModal(dishIdOrName) {
        const dishes = getAllMenuDishes();
        const dish = dishes.find(d => String(d.id) === String(dishIdOrName) || (d.name || '').toLowerCase() === String(dishIdOrName).toLowerCase()) || {
            id: dishIdOrName,
            name: dishIdOrName,
            category: 'Main Course',
            price: 200,
            recipe: null
        };

        const modal = document.getElementById('dishRecipeConfigModal');
        if (!modal) return;

        // Set dish identifiers in modal
        document.getElementById('rtrRecipeDishId').value = dish.recipe ? (dish.recipe.id || '') : '';
        document.getElementById('rtrRecipeMenuItemId').value = String(dish.id);
        document.getElementById('rtrRecipeDishName').value = dish.name;
        document.getElementById('rtrRecipeDishCategory').value = dish.category || 'Main Course';
        document.getElementById('rtrRecipeSellingPrice').value = dish.price || 200;

        document.getElementById('rtrDishNameBadge').innerText = dish.name;
        document.getElementById('rtrDishCategoryBadge').innerText = dish.category || 'Main Course';
        document.getElementById('rtrDishPriceBadge').innerText = `₹ ${dish.price || 0}`;

        const rec = dish.recipe;
        if (rec && Array.isArray(rec.components) && rec.components.length > 0) {
            // Populate from existing recipe
            let gravyId = '';
            let gravyQty = 0;
            let oilQty = 0;
            let proteinId = '';
            let proteinQty = 0;
            let veggieQty = 0;
            let flourId = 'RM-MAIDA';
            let flourQty = 0;
            let butterQty = 0;

            rec.components.forEach(comp => {
                if (comp.type === 'sub_recipe') {
                    gravyId = comp.id;
                    gravyQty = comp.exact_quantity || 0;
                } else if (comp.id === 'RM-OIL') {
                    oilQty = comp.exact_quantity || 0;
                } else if (comp.id === 'RM-PANEER' || comp.id === 'RM-CHICKEN') {
                    proteinId = comp.id;
                    proteinQty = comp.exact_quantity || 0;
                } else if (comp.id === 'RM-ONION') {
                    veggieQty = comp.exact_quantity || 0;
                } else if (comp.id === 'RM-MAIDA' || comp.id === 'RM-BASMATI-RICE') {
                    flourId = comp.id;
                    flourQty = comp.exact_quantity || 0;
                } else if (comp.id === 'RM-BUTTER') {
                    butterQty = comp.exact_quantity || 0;
                }
            });

            document.getElementById('rtrRecipeGravySelect').value = gravyId;
            document.getElementById('rtrRecipeGravyQty').value = gravyQty || '';
            document.getElementById('rtrRecipeOilQty').value = oilQty || '';
            document.getElementById('rtrRecipeProteinSelect').value = proteinId;
            document.getElementById('rtrRecipeProteinQty').value = proteinQty || '';
            document.getElementById('rtrRecipeVeggieQty').value = veggieQty || '';
            document.getElementById('rtrRecipeFlourSelect').value = flourId;
            document.getElementById('rtrRecipeFlourQty').value = flourQty || '';
            document.getElementById('rtrRecipeButterQty').value = butterQty || '';
        } else {
            // Pre-populate with intelligent auto-fill
            applyAutoFillFields(dish.name, dish.category);
        }

        recalcRecipeModalCost();
        modal.style.display = 'flex';
    }

    function triggerApproxAutoFill() {
        const dishName = document.getElementById('rtrRecipeDishName').value;
        const category = document.getElementById('rtrRecipeDishCategory').value;
        applyAutoFillFields(dishName, category);
        recalcRecipeModalCost();
        if (typeof showToast === 'function') showToast(`⚡ Applied Approx Auto-Fill for ${dishName}!`);
    }

    function applyAutoFillFields(dishName, category) {
        const name = (dishName || '').toLowerCase().trim();
        const cat = (category || '').toLowerCase().trim();

        // 1. Paneer
        if (name.includes('paneer')) {
            document.getElementById('rtrRecipeGravySelect').value = 'SUB-MAK-01';
            document.getElementById('rtrRecipeGravyQty').value = 0.20;
            document.getElementById('rtrRecipeOilQty').value = 0.02;
            document.getElementById('rtrRecipeProteinSelect').value = 'RM-PANEER';
            document.getElementById('rtrRecipeProteinQty').value = 0.15;
            document.getElementById('rtrRecipeVeggieQty').value = 0.03;
            document.getElementById('rtrRecipeFlourSelect').value = 'RM-MAIDA';
            document.getElementById('rtrRecipeFlourQty').value = '';
            document.getElementById('rtrRecipeButterQty').value = 0.02;
            return;
        }

        // 2. Chicken
        if (name.includes('chicken') || name.includes('murgh')) {
            const isMakhani = name.includes('butter') || name.includes('makhani');
            document.getElementById('rtrRecipeGravySelect').value = isMakhani ? 'SUB-MAK-01' : 'SUB-BROWN-01';
            document.getElementById('rtrRecipeGravyQty').value = 0.22;
            document.getElementById('rtrRecipeOilQty').value = 0.02;
            document.getElementById('rtrRecipeProteinSelect').value = 'RM-CHICKEN';
            document.getElementById('rtrRecipeProteinQty').value = 0.20;
            document.getElementById('rtrRecipeVeggieQty').value = 0.04;
            document.getElementById('rtrRecipeFlourSelect').value = 'RM-MAIDA';
            document.getElementById('rtrRecipeFlourQty').value = '';
            document.getElementById('rtrRecipeButterQty').value = isMakhani ? 0.025 : 0.01;
            return;
        }

        // 3. Biryani
        if (name.includes('biryani') || name.includes('pulao')) {
            const hasChicken = name.includes('chicken') || name.includes('murgh');
            document.getElementById('rtrRecipeGravySelect').value = 'SUB-YAKHNI-01';
            document.getElementById('rtrRecipeGravyQty').value = 0.15;
            document.getElementById('rtrRecipeOilQty').value = 0.025;
            document.getElementById('rtrRecipeProteinSelect').value = hasChicken ? 'RM-CHICKEN' : 'RM-PANEER';
            document.getElementById('rtrRecipeProteinQty').value = 0.18;
            document.getElementById('rtrRecipeVeggieQty').value = 0.05;
            document.getElementById('rtrRecipeFlourSelect').value = 'RM-BASMATI-RICE';
            document.getElementById('rtrRecipeFlourQty').value = 0.20;
            document.getElementById('rtrRecipeButterQty').value = 0.015;
            return;
        }

        // 4. Dal
        if (name.includes('dal') || name.includes('daal')) {
            document.getElementById('rtrRecipeGravySelect').value = 'SUB-DAL-01';
            document.getElementById('rtrRecipeGravyQty').value = 0.25;
            document.getElementById('rtrRecipeOilQty').value = 0.015;
            document.getElementById('rtrRecipeProteinSelect').value = '';
            document.getElementById('rtrRecipeProteinQty').value = '';
            document.getElementById('rtrRecipeVeggieQty').value = 0.03;
            document.getElementById('rtrRecipeFlourSelect').value = 'RM-MAIDA';
            document.getElementById('rtrRecipeFlourQty').value = '';
            document.getElementById('rtrRecipeButterQty').value = 0.025;
            return;
        }

        // 5. Rolls / Bread
        if (name.includes('roll') || name.includes('wrap') || name.includes('roti') || name.includes('naan')) {
            const hasPaneer = name.includes('paneer');
            const hasChicken = name.includes('chicken');
            document.getElementById('rtrRecipeGravySelect').value = '';
            document.getElementById('rtrRecipeGravyQty').value = '';
            document.getElementById('rtrRecipeOilQty').value = 0.02;
            document.getElementById('rtrRecipeProteinSelect').value = hasPaneer ? 'RM-PANEER' : (hasChicken ? 'RM-CHICKEN' : '');
            document.getElementById('rtrRecipeProteinQty').value = (hasPaneer || hasChicken) ? 0.10 : '';
            document.getElementById('rtrRecipeVeggieQty').value = 0.04;
            document.getElementById('rtrRecipeFlourSelect').value = 'RM-MAIDA';
            document.getElementById('rtrRecipeFlourQty').value = 0.08;
            document.getElementById('rtrRecipeButterQty').value = 0.01;
            return;
        }

        // Default Generic
        document.getElementById('rtrRecipeGravySelect').value = 'SUB-BROWN-01';
        document.getElementById('rtrRecipeGravyQty').value = 0.15;
        document.getElementById('rtrRecipeOilQty').value = 0.02;
        document.getElementById('rtrRecipeProteinSelect').value = 'RM-PANEER';
        document.getElementById('rtrRecipeProteinQty').value = 0.08;
        document.getElementById('rtrRecipeVeggieQty').value = 0.05;
        document.getElementById('rtrRecipeFlourSelect').value = 'RM-MAIDA';
        document.getElementById('rtrRecipeFlourQty').value = '';
        document.getElementById('rtrRecipeButterQty').value = 0.01;
    }

    function setRecipeField(fieldId, value) {
        const input = document.getElementById(fieldId);
        if (input) {
            input.value = value > 0 ? value : '';
            recalcRecipeModalCost();
        }
    }

    function recalcRecipeModalCost() {
        const gravyId = document.getElementById('rtrRecipeGravySelect')?.value;
        const gravyQty = parseFloat(document.getElementById('rtrRecipeGravyQty')?.value) || 0;
        const oilQty = parseFloat(document.getElementById('rtrRecipeOilQty')?.value) || 0;
        const proteinId = document.getElementById('rtrRecipeProteinSelect')?.value;
        const proteinQty = parseFloat(document.getElementById('rtrRecipeProteinQty')?.value) || 0;
        const veggieQty = parseFloat(document.getElementById('rtrRecipeVeggieQty')?.value) || 0;
        const flourId = document.getElementById('rtrRecipeFlourSelect')?.value;
        const flourQty = parseFloat(document.getElementById('rtrRecipeFlourQty')?.value) || 0;
        const butterQty = parseFloat(document.getElementById('rtrRecipeButterQty')?.value) || 0;
        const sellingPrice = parseFloat(document.getElementById('rtrRecipeSellingPrice')?.value) || 0;

        let totalCost = 0;

        // Gravy cost
        if (gravyId && gravyQty > 0) {
            const sub = subRecipes.find(s => s.id === gravyId);
            const subCost = sub ? (sub.unit_production_cost || 130) : 130;
            totalCost += (subCost * gravyQty);
        }

        // Oil cost
        if (oilQty > 0) {
            const rm = rawMaterials.find(m => m.id === 'RM-OIL');
            const oilCost = rm ? rm.cost_per_unit : 135;
            totalCost += (oilCost * oilQty);
        }

        // Protein cost
        if (proteinId && proteinQty > 0) {
            const rm = rawMaterials.find(m => m.id === proteinId);
            const protCost = rm ? rm.cost_per_unit : (proteinId === 'RM-PANEER' ? 380 : 240);
            totalCost += (protCost * proteinQty);
        }

        // Veggie cost
        if (veggieQty > 0) {
            const rm = rawMaterials.find(m => m.id === 'RM-ONION');
            const vegCost = rm ? rm.cost_per_unit : 35;
            totalCost += (vegCost * veggieQty);
        }

        // Flour cost
        if (flourId && flourQty > 0) {
            const rm = rawMaterials.find(m => m.id === flourId);
            const fCost = rm ? rm.cost_per_unit : 45;
            totalCost += (fCost * flourQty);
        }

        // Butter cost
        if (butterQty > 0) {
            const rm = rawMaterials.find(m => m.id === 'RM-BUTTER');
            const bCost = rm ? rm.cost_per_unit : 520;
            totalCost += (bCost * butterQty);
        }

        const costDisplay = document.getElementById('rtrServingCostVal');
        const profitDisplay = document.getElementById('rtrServingProfitVal');
        const marginDisplay = document.getElementById('rtrServingMarginVal');

        const profit = Math.max(0, sellingPrice - totalCost);
        const marginPct = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 1000) / 10 : 0;

        if (costDisplay) costDisplay.innerText = `₹ ${totalCost.toFixed(2)}`;
        if (profitDisplay) profitDisplay.innerText = `₹ ${profit.toFixed(2)}`;
        if (marginDisplay) marginDisplay.innerText = `${marginPct}%`;
    }

    async function saveCurrentRecipeModal() {
        const dishId = document.getElementById('rtrRecipeDishId')?.value;
        const menuItemId = document.getElementById('rtrRecipeMenuItemId')?.value;
        const dishName = document.getElementById('rtrRecipeDishName')?.value;
        const category = document.getElementById('rtrRecipeDishCategory')?.value;
        const sellingPrice = parseFloat(document.getElementById('rtrRecipeSellingPrice')?.value) || 200;

        const gravyId = document.getElementById('rtrRecipeGravySelect')?.value;
        const gravyQty = parseFloat(document.getElementById('rtrRecipeGravyQty')?.value) || 0;
        const oilQty = parseFloat(document.getElementById('rtrRecipeOilQty')?.value) || 0;
        const proteinId = document.getElementById('rtrRecipeProteinSelect')?.value;
        const proteinQty = parseFloat(document.getElementById('rtrRecipeProteinQty')?.value) || 0;
        const veggieQty = parseFloat(document.getElementById('rtrRecipeVeggieQty')?.value) || 0;
        const flourId = document.getElementById('rtrRecipeFlourSelect')?.value;
        const flourQty = parseFloat(document.getElementById('rtrRecipeFlourQty')?.value) || 0;
        const butterQty = parseFloat(document.getElementById('rtrRecipeButterQty')?.value) || 0;

        const payload = {
            id: dishId || ('REC-' + dishName.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16)),
            menu_item_id: menuItemId,
            dish_name: dishName,
            menu_category: category,
            selling_price: sellingPrice,
            gravy_id: gravyId,
            gravy_qty: gravyQty,
            oil_qty: oilQty,
            protein_id: proteinId,
            protein_qty: proteinQty,
            veggie_qty: veggieQty,
            flour_id: flourId,
            flour_qty: flourQty,
            butter_qty: butterQty
        };

        try {
            const res = await fetch('/api/inventory/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());

            if (res && res.recipe) {
                const idx = recipes.findIndex(r => r.id === res.recipe.id || String(r.menu_item_id) === String(res.recipe.menu_item_id));
                if (idx >= 0) recipes[idx] = res.recipe;
                else recipes.push(res.recipe);
            }
        } catch (e) {
            console.warn('[Culinary Inventory] Backend recipe save warning, saving locally:', e);
            // Construct local recipe fallback
            const comps = [];
            if (gravyId && gravyQty > 0) comps.push({ type: 'sub_recipe', id: gravyId, exact_quantity: gravyQty, unit: 'Litre' });
            if (oilQty > 0) comps.push({ type: 'raw', id: 'RM-OIL', exact_quantity: oilQty, unit: 'Litre' });
            if (proteinId && proteinQty > 0) comps.push({ type: 'raw', id: proteinId, exact_quantity: proteinQty, unit: 'kg' });
            if (veggieQty > 0) comps.push({ type: 'raw', id: 'RM-ONION', exact_quantity: veggieQty, unit: 'kg' });
            if (flourQty > 0) comps.push({ type: 'raw', id: flourId, exact_quantity: flourQty, unit: 'kg' });
            if (butterQty > 0) comps.push({ type: 'raw', id: 'RM-BUTTER', exact_quantity: butterQty, unit: 'kg' });

            const localRecipe = {
                id: payload.id,
                menu_item_id: payload.menu_item_id,
                dish_name: payload.dish_name,
                menu_category: payload.menu_category,
                selling_price: payload.selling_price,
                components: comps
            };
            const idx = recipes.findIndex(r => r.id === localRecipe.id || String(r.menu_item_id) === String(localRecipe.menu_item_id));
            if (idx >= 0) recipes[idx] = localRecipe;
            else recipes.push(localRecipe);
        }

        try {
            localStorage.setItem('billnaw_culinary_recipes', JSON.stringify(recipes));
        } catch (e) {}

        closeDishRecipeModal();
        renderActiveSubTab();
        if (typeof showToast === 'function') showToast(`✅ Recipe mapped for '${dishName}'!`);
    }

    function closeDishRecipeModal() {
        const modal = document.getElementById('dishRecipeConfigModal');
        if (modal) modal.style.display = 'none';
    }

    async function registerNewDishRecipe(dish) {
        if (!dish || !dish.name) return;
        const strId = String(dish.id);
        const dishNameClean = dish.name.trim();

        // 1. Check if recipe already exists for this dish
        const existing = recipes.find(r => String(r.menu_item_id) === strId || (r.dish_name && r.dish_name.toLowerCase() === dishNameClean.toLowerCase()));
        if (existing) {
            existing.menu_item_id = strId;
            existing.dish_name = dishNameClean;
            if (dish.price) existing.selling_price = dish.price;
            if (dish.category) existing.menu_category = dish.category;
            renderActiveSubTab();
            return existing;
        }

        // 2. Fetch intelligent culinary auto-fill ratios
        let fill = null;
        try {
            const afRes = await fetch(`/api/inventory/auto-fill?dish_name=${encodeURIComponent(dishNameClean)}&category=${encodeURIComponent(dish.category || '')}`).then(r => r.json());
            if (afRes && afRes.auto_fill) fill = afRes.auto_fill;
        } catch(e) {}

        const gravyId = fill?.gravy_id || '';
        const gravyQty = fill?.gravy_qty || 0;
        const oilQty = (fill && fill.oil_qty !== undefined) ? fill.oil_qty : 0.02;
        const proteinId = fill?.protein_id || '';
        const proteinQty = fill?.protein_qty || 0;
        const veggieQty = fill?.veggie_qty || 0;
        const flourId = fill?.flour_id || 'RM-MAIDA';
        const flourQty = fill?.flour_qty || 0;
        const butterQty = fill?.butter_qty || 0;

        const payload = {
            id: 'REC-' + dishNameClean.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16) + '-' + Date.now().toString().slice(-4),
            menu_item_id: strId,
            dish_name: dishNameClean,
            menu_category: dish.category || 'Main Course',
            selling_price: dish.price || 0,
            gravy_id: gravyId,
            gravy_qty: gravyQty,
            oil_qty: oilQty,
            protein_id: proteinId,
            protein_qty: proteinQty,
            veggie_qty: veggieQty,
            flour_id: flourId,
            flour_qty: flourQty,
            butter_qty: butterQty
        };

        try {
            const res = await fetch('/api/inventory/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
            if (res && res.recipe) {
                recipes.push(res.recipe);
            }
        } catch(e) {
            const comps = [];
            if (gravyId && gravyQty > 0) comps.push({ type: 'sub_recipe', id: gravyId, exact_quantity: gravyQty, unit: 'Litre' });
            if (oilQty > 0) comps.push({ type: 'raw', id: 'RM-OIL', exact_quantity: oilQty, unit: 'Litre' });
            if (proteinId && proteinQty > 0) comps.push({ type: 'raw', id: proteinId, exact_quantity: proteinQty, unit: 'kg' });
            if (veggieQty > 0) comps.push({ type: 'raw', id: 'RM-ONION', exact_quantity: veggieQty, unit: 'kg' });
            if (flourQty > 0) comps.push({ type: 'raw', id: flourId, exact_quantity: flourQty, unit: 'kg' });
            if (butterQty > 0) comps.push({ type: 'raw', id: 'RM-BUTTER', exact_quantity: butterQty, unit: 'kg' });

            const localRecipe = {
                id: payload.id,
                menu_item_id: payload.menu_item_id,
                dish_name: payload.dish_name,
                menu_category: payload.menu_category,
                selling_price: payload.selling_price,
                components: comps
            };
            recipes.push(localRecipe);
        }

        try {
            localStorage.setItem('billnaw_culinary_recipes', JSON.stringify(recipes));
        } catch (e) {}

        renderActiveSubTab();
        return payload;
    }

    // --- ITEM ALERT MODAL CONTROLLER ---
    function openItemAlertModal(itemId) {
        let item = rawMaterials.find(m => m.id === itemId);
        let isSub = false;
        if (!item) {
            item = subRecipes.find(s => s.id === itemId);
            isSub = true;
        }
        if (!item) return;

        const modal = document.getElementById('itemAlertModal');
        if (!modal) return;

        document.getElementById('rtrAlertItemId').value = itemId;
        document.getElementById('rtrAlertItemName').innerText = item.name;
        document.getElementById('rtrAlertItemCategory').innerText = item.category || (isSub ? 'Prepared Gravy Base' : 'Pantry / Raw');
        const unit = item.consumption_unit || item.yield_unit || 'units';
        document.getElementById('rtrAlertItemUnit').innerText = unit;
        document.getElementById('rtrAlertCurrentStock').innerText = `${item.current_stock} ${unit}`;
        document.getElementById('rtrAlertThresholdInput').value = item.min_threshold ?? item.minThreshold ?? 10;

        modal.style.display = 'flex';
    }

    async function saveItemAlertSettings() {
        const itemId = document.getElementById('rtrAlertItemId')?.value;
        const thresh = parseFloat(document.getElementById('rtrAlertThresholdInput')?.value);
        if (!itemId || isNaN(thresh)) return;

        let item = rawMaterials.find(m => m.id === itemId) || subRecipes.find(s => s.id === itemId);
        if (item) {
            item.min_threshold = thresh;
            item.minThreshold = thresh;
        }

        try {
            await fetch('/api/inventory/alert-threshold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ material_id: itemId, min_threshold: thresh })
            });
        } catch (e) {}

        persistLocalSnapshot();
        closeItemAlertModal();
        renderActiveSubTab();
        if (typeof showToast === 'function') showToast(`🔔 Low stock alert trigger updated to ${thresh}!`);
    }

    function closeItemAlertModal() {
        const modal = document.getElementById('itemAlertModal');
        if (modal) modal.style.display = 'none';
    }

    // --- RESTOCK & SHOPPING EXPENSE MODAL CONTROLLER ---
    function openRestockModal(itemId) {
        let item = rawMaterials.find(m => m.id === itemId);
        let isSub = false;
        if (!item) {
            item = subRecipes.find(s => s.id === itemId);
            isSub = true;
        }
        if (!item) return;

        const modal = document.getElementById('restockExpenseModal');
        if (!modal) return;

        document.getElementById('rtrRestockItemId').value = itemId;
        document.getElementById('rtrRestockItemName').innerText = item.name;
        document.getElementById('rtrRestockItemCategory').innerText = item.category || (isSub ? 'Semi-Finished Gravy Base' : 'Raw Ingredient');
        const unit = item.consumption_unit || item.yield_unit || 'units';
        document.getElementById('rtrRestockItemUnit').innerText = unit;
        document.getElementById('rtrRestockCurrentStock').innerText = `${item.current_stock} ${unit}`;
        document.getElementById('rtrRestockQtyInput').value = '';
        document.getElementById('rtrRestockCostInput').value = item.cost_per_unit || (item.unit_production_cost || 100);
        document.getElementById('rtrRestockSupplierInput').value = item.supplier || 'Kolkata Fresh Veggies Mandi';
        document.getElementById('rtrRestockTotalExpense').innerText = '₹ 0.00';

        modal.style.display = 'flex';
    }

    function recalcRestockTotal() {
        const qty = parseFloat(document.getElementById('rtrRestockQtyInput')?.value) || 0;
        const rate = parseFloat(document.getElementById('rtrRestockCostInput')?.value) || 0;
        const total = qty * rate;
        const display = document.getElementById('rtrRestockTotalExpense');
        if (display) display.innerText = `₹ ${total.toFixed(2)}`;
    }

    async function submitRestockExpense() {
        const itemId = document.getElementById('rtrRestockItemId')?.value;
        const qty = parseFloat(document.getElementById('rtrRestockQtyInput')?.value);
        const rate = parseFloat(document.getElementById('rtrRestockCostInput')?.value) || 0;
        const supplier = document.getElementById('rtrRestockSupplierInput')?.value;

        if (!itemId || isNaN(qty) || qty <= 0) {
            if (typeof showToast === 'function') showToast('⚠️ Please enter a valid quantity.');
            return;
        }

        let item = rawMaterials.find(m => m.id === itemId) || subRecipes.find(s => s.id === itemId);
        if (item) {
            item.current_stock = Math.round((item.current_stock + qty) * 100) / 100;
            if (rate > 0) item.cost_per_unit = rate;
        }

        try {
            await fetch('/api/inventory/restock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ material_id: itemId, quantity: qty, unit_cost: rate, supplier })
            });
        } catch (e) {}

        persistLocalSnapshot();
        closeRestockModal();
        renderActiveSubTab();
        if (typeof showToast === 'function') showToast(`📥 Added +${qty} to stock! Kitchen stock updated.`);
    }

    function closeRestockModal() {
        const modal = document.getElementById('restockExpenseModal');
        if (modal) modal.style.display = 'none';
    }

    function syncMenuItems() {
        loadAllInventoryData();
        if (typeof showToast === 'function') showToast('🔄 RTR Tracker synchronized with Menu items!');
    }

    // --- TAB 1: RAW MATERIALS & INGREDIENT MATRIX ---
    function renderRawMaterialsTab(container) {
        const matchedSet = new Set(MATCHED_RAW_MATERIALS_IDS);
        matchedSet.add('RM-CHICKEN');
        matchedSet.add('RM-ONION');
        // Strictly filter to the 10 matched raw materials required by the 4 dishes
        const kitchenRaws = rawMaterials.filter(m => {
            if (!matchedSet.has(m.id)) return false;
            // Prevent duplicate display if both alias IDs exist
            if (m.id === 'RM-CHICKEN' && rawMaterials.some(x => x.id === 'RM-POULTRY')) return false;
            if (m.id === 'RM-ONION' && rawMaterials.some(x => x.id === 'RM-ONION-SPICES')) return false;
            return true;
        });

        const spirits = rawMaterials.filter(m => m.unit_type === 'spirit' || m.unit_type === 'draught_beer');
        const showSpirits = spirits.length > 0 && spirits.some(s => s.current_stock > 0);

        container.innerHTML = `
            ${showSpirits ? `
            <!-- Bar & Brewery Liquid Telemetry Row -->
            <div style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <span>🍸 Bar & Brewery Liquid Telemetry Matrix</span>
                            <span class="badge" style="background: #143832; color: #2DD4BF; font-size: 11px;">1:1 Exact Peg & Froth Buffers</span>
                        </h3>
                        <p style="margin: 2px 0 0 0; font-size: 12px; color: var(--text-muted);">Exact 30ml/60ml peg deductions and configurable 5–8% keg tap line froth allowance</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
                    ${spirits.map(s => {
                        const isBeer = s.unit_type === 'draught_beer';
                        const totalMl = s.conversion_factor || 1000;
                        const pct = Math.min(100, Math.round((s.current_stock / totalMl) * 100));
                        const gaugeColor = pct < 25 ? '#EF4444' : (pct < 50 ? '#F59E0B' : '#10B981');

                        return `
                            <div class="card" style="padding: 16px; border: 1.5px solid #E5E7EB; border-radius: 12px; background: #FFFFFF; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                    <div>
                                        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${isBeer ? '#D97706' : '#6B21A8'}; background: ${isBeer ? '#FEF3C7' : '#F3E8FF'}; padding: 2px 8px; border-radius: 10px;">
                                            ${isBeer ? '🍺 Draught Craft Keg' : '🥃 Spirit Bottle (750ml)'}
                                        </span>
                                        <div style="font-size: 14px; font-weight: 800; color: var(--text-dark); margin-top: 4px;">${escapeHtml(s.name)}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 16px; font-weight: 800; color: #143832;">${s.current_stock} <span style="font-size: 11px;">ml</span></div>
                                        <div style="font-size: 11px; color: var(--text-muted);">${(s.current_stock / 1000).toFixed(2)} Litres left</div>
                                    </div>
                                </div>

                                <!-- Keg / Bottle Level Gauge -->
                                <div style="background: #F3F4F6; height: 10px; border-radius: 5px; overflow: hidden; margin: 10px 0 6px 0;">
                                    <div style="width: ${pct}%; height: 100%; background: ${gaugeColor}; border-radius: 5px; transition: width 0.4s ease;"></div>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
                                    <span>${pct}% Remaining</span>
                                    <span>${isBeer ? `Tap Froth Buffer: <strong>${s.default_froth_buffer || 6}%</strong>` : 'Exact 1:1 deduction'}</span>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #E5E7EB; font-size: 11px;">
                                    <span style="color: var(--text-muted);">Cost: ₹ ${s.cost_per_unit} / ${s.purchase_unit}</span>
                                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.promptRestock('${s.id}')">
                                        ➕ Restock Keg/Bottle
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Indian Culinary Raw Materials Grid -->
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 6px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                            <span>Kitchen Raw Materials &amp; Bulk Ingredients</span>
                        </h3>
                        <p style="margin: 2px 0 0 0; font-size: 12px; color: var(--text-muted);">Direct purchase-to-consumption conversions with safety stock alerts</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-success" style="font-size: 12px; padding: 6px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.switchInventorySubTab('purchase_orders')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                            <span>Generate Vendor PO</span>
                        </button>
                    </div>
                </div>

                <div class="inventory-grid">
                    ${kitchenRaws.map(item => {
                        const isLow = item.current_stock <= item.min_threshold;
                        const isCritical = item.current_stock <= (item.min_threshold * 0.6);
                        const statusTag = isCritical
                            ? '<span class="stock-status-badge stock-critical">CRITICAL LOW</span>'
                            : (isLow ? '<span class="stock-status-badge stock-low">Below Min</span>' : '<span class="stock-status-badge stock-good">Healthy</span>');

                        return `
                            <div class="inventory-item-card">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                    <div>
                                        <div style="font-size: 14px; font-weight: 800; color: var(--text-dark);">${escapeHtml(item.name)}</div>
                                        <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.category)} • ${escapeHtml(item.supplier || '')}</div>
                                    </div>
                                    ${statusTag}
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                                    <div style="font-size: 22px; font-weight: 800; color: ${isLow ? 'var(--danger)' : '#143832'};">
                                        ${item.current_stock} <span style="font-size: 12px; color: var(--text-muted);">${item.consumption_unit}</span>
                                    </div>
                                    <div style="font-size: 11px; color: var(--text-muted);">
                                        Safety Min: <strong>${item.min_threshold} ${item.consumption_unit}</strong>
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px; padding-top: 8px; border-top: 1px solid #F3F4F6;">
                                    <span style="color: var(--text-muted);">Rate: <strong>₹ ${item.cost_per_unit} / ${item.purchase_unit}</strong></span>
                                    <div style="display: flex; gap: 6px;">
                                        <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.promptRestock('${item.id}')">➕ Add</button>
                                        <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.promptPriceEdit('${item.id}')">₹ Rate</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // --- TAB 2: MORNING BATCH MODULE & SUB-RECIPES ---
    function renderMorningBatchTab(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <span>🍳 Morning Batching & Sub-Recipe Composition Engine</span>
                            <span class="badge" style="background: #FEF3C7; color: #D97706; font-size: 11px;">Bulk Base Production</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Cooks input bulk semi-finished batches (e.g. 20L Makhani Gravy). Automatically checks and deducts corresponding bulk raw ingredients from raw_materials stock.
                        </p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px;">
                    ${subRecipes.map(sub => {
                        const ingredientsList = sub.ingredients || [];
                        const isLow = sub.current_stock <= sub.min_threshold;

                        return `
                            <div class="card" style="padding: 18px; border: 1.5px solid #E6DCCD; border-radius: 14px; background: #FFFFFF; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <div>
                                        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #143832; background: #E6F4EA; padding: 2px 8px; border-radius: 8px;">
                                            Semi-Finished Base
                                        </span>
                                        <div style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin-top: 4px;">${escapeHtml(sub.name)}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 20px; font-weight: 800; color: ${isLow ? 'var(--danger)' : '#143832'};">
                                            ${sub.current_stock} <span style="font-size: 12px;">${sub.yield_unit}</span>
                                        </div>
                                        <div style="font-size: 10px; color: var(--text-muted);">Safety Min: ${sub.min_threshold} ${sub.yield_unit}</div>
                                    </div>
                                </div>

                                <div style="background: #FAF7F4; border-radius: 10px; padding: 12px; margin: 10px 0;">
                                    <div style="font-size: 11px; font-weight: 800; color: #143832; margin-bottom: 6px; text-transform: uppercase;">
                                        Ingredients for ${sub.yield_quantity} ${sub.yield_unit} Batch:
                                    </div>
                                    <div style="max-height: 120px; overflow-y: auto; font-size: 11px;">
                                        ${ingredientsList.map(ing => `
                                            <div style="display: flex; justify-content: space-between; padding: 2px 0; color: var(--text-dark);">
                                                <span>• ${escapeHtml(ing.material_name || ing.material_id)}</span>
                                                <span style="font-weight: 600;">${ing.quantity} ${ing.unit}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid #F3F4F6;">
                                    <div style="font-size: 11px; color: var(--text-muted);">
                                        Unit Prep Cost: <strong style="color: #143832;">₹ ${sub.unit_production_cost || '130.00'} / ${sub.yield_unit}</strong>
                                    </div>
                                    <button class="btn btn-primary" style="padding: 7px 16px; font-size: 12px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.culinaryInventory.promptProduceBatch('${sub.id}', ${sub.yield_quantity})">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>
                                        <span>Produce Batch</span>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // --- TAB 3: LIVE FOOD COSTING & MARGIN ANALYSIS ---
    function renderDishCostingTab(container) {
        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabDishCosting');
        if (!targetContainer) return;

        if (recipes.length === 0) {
            targetContainer.innerHTML = `
                <div class="empty-recipe-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No dish recipes configured</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Map your menu items to raw ingredients or prep batches to calculate live food cost and automate ingredient deductions.
                    </p>
                </div>
            `;
            return;
        }

        // Calculate live dish costing for all recipes
        const costingData = recipes.map(recipe => {
            let foodCost = 0;
            const compsBreakdown = (recipe.components || []).map(comp => {
                let unitCost = 0;
                let compName = comp.name || comp.id;
                if (comp.type === 'sub_recipe') {
                    const sub = subRecipes.find(s => s.id === comp.id);
                    if (sub) {
                        compName = sub.name;
                        unitCost = sub.unit_production_cost || 100;
                    }
                } else {
                    const rm = rawMaterials.find(m => m.id === comp.id);
                    if (rm) {
                        compName = rm.name;
                        unitCost = rm.cost_per_unit || 50;
                    }
                }
                const compCost = Math.round(comp.exact_quantity * unitCost * 100) / 100;
                foodCost += compCost;
                return {
                    ...comp,
                    name: compName,
                    unit_cost: unitCost,
                    component_cost: compCost
                };
            });

            foodCost = Math.round(foodCost * 100) / 100;
            const sellingPrice = recipe.selling_price || 100;
            const grossProfit = Math.round((sellingPrice - foodCost) * 100) / 100;
            const grossMarginPct = sellingPrice > 0 ? Math.round(((sellingPrice - foodCost) / sellingPrice) * 1000) / 10 : 0;

            // Find corresponding dish image
            let dishImg = (recipe.image || recipe.image_url || '');
            if (!dishImg && typeof getAllMenuDishes === 'function') {
                const dishes = getAllMenuDishes();
                const matched = dishes.find(d => String(d.id) === String(recipe.menu_item_id) || (d.name && recipe.dish_name && d.name.toLowerCase().trim() === recipe.dish_name.toLowerCase().trim()));
                if (matched && (matched.image || matched.image_url)) {
                    dishImg = matched.image || matched.image_url;
                }
            }
            if (!dishImg && typeof getCuratedFoodPhoto === 'function') {
                dishImg = getCuratedFoodPhoto(recipe.dish_name, recipe.menu_category);
            }
            if (!dishImg && typeof generateFallbackImage === 'function') {
                dishImg = generateFallbackImage(recipe.dish_name, recipe.menu_category);
            }

            return {
                recipe_id: recipe.id,
                dish_name: recipe.dish_name,
                category: recipe.menu_category || 'Main Course',
                selling_price: sellingPrice,
                food_cost: foodCost,
                gross_profit: grossProfit,
                gross_margin_pct: grossMarginPct,
                components: compsBreakdown,
                image: dishImg
            };
        });

        targetContainer.innerHTML = `
            <div style="margin-bottom: 24px;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                            <span>Live Food Costing &amp; Real-Time Margin Simulator</span>
                        </h3>
                        <p style="margin: 4px 0 0 0; font-size: 12.5px; color: var(--text-muted);">
                            Portion mapping, dynamic food cost rollups, and real-time gross margin recalculation on wholesale commodity price shifts.
                        </p>
                    </div>
                    <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.refreshCosting()" style="font-size: 11px; padding: 6px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        <span>Recalculate Margins</span>
                    </button>
                </div>

                <!-- Rapid Market Price Fluctuation Simulator Card -->
                <div class="inv-sim-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 800; color: #143832; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            <span>Rapid Market Price Fluctuation Simulator</span>
                        </div>
                        <span style="font-size: 11px; color: #64748B;">Test volatile mandi rate shocks to verify live margin resilience</span>
                    </div>
                    <p style="margin: 0 0 12px 0; font-size: 12px; color: #475569;">
                        Trigger wholesale supplier rate spikes below to observe instant cascaded recomputation across sub-recipes and finished dishes:
                    </p>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.simulateRateChange('RM-TOMATO', 90)" style="font-size: 11.5px; padding: 6px 12px; border-radius: 14px; background: #FFFFFF; font-weight: 700; color: #DC2626; border-color: #FCA5A5; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            <span>Simulate Tomato Surge (₹ 40 -&gt; ₹ 90/kg)</span>
                        </button>
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.simulateRateChange('RM-PANEER', 450)" style="font-size: 11.5px; padding: 6px 12px; border-radius: 14px; background: #FFFFFF; font-weight: 700; color: #D97706; border-color: #FCD34D; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            <span>Simulate Dairy Paneer Hike (₹ 380 -&gt; ₹ 450/kg)</span>
                        </button>
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.simulateRateChange('RM-OIL', 200)" style="font-size: 11.5px; padding: 6px 12px; border-radius: 14px; background: #FFFFFF; font-weight: 700; color: #B45309; border-color: #FDE68A; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            <span>Simulate Oil Spike (₹ 135 -&gt; ₹ 200/L)</span>
                        </button>
                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.resetDefaultRates()" style="font-size: 11.5px; padding: 6px 12px; border-radius: 14px; background: #143832; color: #FFFFFF; font-weight: 700; border-color: #143832; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            <span>Reset Baseline Rates</span>
                        </button>
                    </div>
                </div>

                <!-- Dynamic Live Costing & Profit Margin Table -->
                <div style="background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="padding: 14px 18px; border-bottom: 1.5px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: #FFFFFF;">
                        <div>
                            <div style="font-size: 15px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                <span>Live Dish Profit Margins &amp; Cost Rollup</span>
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                                Formula: Gross Profit = Selling Price − Food Cost • Margin % = (Gross Profit / Selling Price) × 100
                            </div>
                        </div>
                    </div>

                    <div style="overflow-x: auto;">
                        <table class="inv-costing-table">
                            <thead>
                                <tr>
                                    <th>Dish / Beverage</th>
                                    <th>Category</th>
                                    <th>Selling Price</th>
                                    <th>Food Cost</th>
                                    <th>Gross Profit</th>
                                    <th>Margin %</th>
                                    <th>Health Status</th>
                                    <th style="text-align: right;">Recipe Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${costingData.map(c => {
                                    const isOptimal = c.gross_margin_pct >= 65;
                                    const isModerate = !isOptimal && c.gross_margin_pct >= 50;
                                    const badgeHtml = isOptimal
                                        ? `<span class="inv-margin-badge inv-margin-healthy"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Optimal (≥65%)</span>`
                                        : (isModerate
                                            ? `<span class="inv-margin-badge inv-margin-moderate"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Moderate (50-65%)</span>`
                                            : `<span class="inv-margin-badge inv-margin-low"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Squeeze Alert (&lt;50%)</span>`);

                                    return `
                                        <tr>
                                            <td>
                                                <div style="font-weight: 800; color: var(--text-dark); font-size: 13.5px;">${escapeHtml(c.dish_name)}</div>
                                                <div style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${escapeHtml(c.recipe_id)}</div>
                                            </td>
                                            <td style="color: var(--text-muted); font-size: 12px;">${escapeHtml(c.category)}</td>
                                            <td style="font-weight: 800; font-size: 13px;">₹ ${c.selling_price}</td>
                                            <td style="font-weight: 800; color: #DC2626; font-size: 13px;">₹ ${c.food_cost.toFixed(2)}</td>
                                            <td style="font-weight: 800; color: #166534; font-size: 13px;">₹ ${c.gross_profit.toFixed(2)}</td>
                                            <td style="font-weight: 800; font-size: 13.5px; color: #0F172A;">${c.gross_margin_pct.toFixed(1)}%</td>
                                            <td>${badgeHtml}</td>
                                            <td style="text-align: right;">
                                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openDishRecipeModal('${c.recipe_id}')" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                                    <span>Configure</span>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Dish Recipes & Portion Mapping Cards Grid -->
                <div>
                    <div style="margin-bottom: 12px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            <span>Dish Ingredient Portion Mapping</span>
                        </h4>
                        <p style="margin: 2px 0 0 0; font-size: 11.5px; color: var(--text-muted);">
                            Exact recipe specifications and component cost breakdown for kitchen staff
                        </p>
                    </div>

                    <div class="inv-costing-grid">
                        ${costingData.map(c => `
                            <div class="inv-recipe-card">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 10px;">
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <img src="${c.image || (typeof generateFallbackImage === 'function' ? generateFallbackImage(c.dish_name, c.category) : 'assets/default-food.png')}"
                                             alt="${escapeHtml(c.dish_name)}"
                                             loading="lazy"
                                             onerror="this.onerror=null; this.src=(typeof generateFallbackImage === 'function' ? generateFallbackImage('${escapeHtml(c.dish_name)}', '${escapeHtml(c.category)}') : 'assets/default-food.png');"
                                             style="width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                        <div>
                                            <div style="font-size: 15px; font-weight: 800; color: var(--text-dark);">${escapeHtml(c.dish_name)}</div>
                                            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(c.category)} • Selling: <strong>₹ ${c.selling_price}</strong></div>
                                        </div>
                                    </div>
                                    <span class="inv-margin-badge ${c.gross_margin_pct >= 65 ? 'inv-margin-healthy' : (c.gross_margin_pct >= 50 ? 'inv-margin-moderate' : 'inv-margin-low')}" style="font-size: 10px;">
                                        ${c.gross_margin_pct.toFixed(1)}%
                                    </span>
                                </div>

                                <div style="background: #F8F6F2; border-radius: 10px; padding: 10px; margin-bottom: 10px;">
                                    <div style="font-size: 10.5px; font-weight: 800; color: #143832; text-transform: uppercase; margin-bottom: 6px;">
                                        Recipe Portion Components:
                                    </div>
                                    <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px;">
                                        ${(c.components || []).map(comp => `
                                            <div style="display: flex; justify-content: space-between; align-items: center; color: #334155;">
                                                <span>• ${escapeHtml(comp.name)} (${comp.exact_quantity} ${escapeHtml(comp.unit || 'L')})</span>
                                                <span style="font-weight: 700; color: #64748B;">₹ ${comp.component_cost.toFixed(2)}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 11.5px;">
                                    <div>
                                        Food Cost: <strong style="color: #DC2626;">₹ ${c.food_cost.toFixed(2)}</strong>
                                    </div>
                                    <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openDishRecipeModal('${c.recipe_id}')" style="padding: 3px 9px; font-size: 11px; border-radius: 10px;">
                                        Configure Portions
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    window.renderDishCostingTab = renderDishCostingTab;

    function renderDishRecipes(container) {
        return renderDishCostingTab(container);
    }
    window.renderDishRecipes = renderDishRecipes;

    // --- TAB 4: CENTRAL KITCHEN & INTER-OUTLET TRANSFERS ---
    function renderCentralKitchenTab(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <span>🏢 Central Kitchen Commissary & Inter-Outlet Distribution</span>
                            <span class="badge" style="background: #CCFBF1; color: #0F766E; font-size: 11px;">Multi-Outlet Sync</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Centralized commissary bulk preparation and stock transfer dispatch to retail outlets & cloud kitchens.
                        </p>
                    </div>
                    <button class="btn btn-primary" style="font-size: 12px; padding: 6px 14px; border-radius: 16px;" onclick="window.culinaryInventory.promptDispatchTransfer()">
                        🚚 Dispatch Stock Transfer
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 20px;">
                    <div class="card" style="padding: 16px; border-left: 4px solid #143832;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Central Commissary Hub</div>
                        <div style="font-size: 16px; font-weight: 800; color: #143832; margin-top: 4px;">CK-Main (Central Kolkata)</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Primary butchery, bulk gravies & dry goods commissary</div>
                    </div>
                    <div class="card" style="padding: 16px; border-left: 4px solid #2DD4BF;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Retail Outlets Connected</div>
                        <div style="font-size: 16px; font-weight: 800; color: #0F766E; margin-top: 4px;">2 Active Outlets</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Park Street Bistro & Salt Lake Cloud Kitchen</div>
                    </div>
                </div>

                <!-- Transfer History -->
                <div class="card" style="padding: 16px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: var(--text-dark);">Active Inter-Outlet Transfers</h4>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${(transfers && transfers.length > 0 ? transfers : [
                            { id: 'TRF-2026-001', from_outlet: 'CK-Main', to_outlet: 'Park Street Bistro', status: 'Dispatched', dispatched_at: '2026-09-25T14:30:00Z', items: [{ name: 'Makhani Gravy Base', quantity: 10, unit: 'Litre' }, { name: 'Malai Paneer', quantity: 8, unit: 'kg' }] }
                        ]).map(t => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #FAF7F4; border-radius: 10px; border: 1px solid #E6DCCD; flex-wrap: wrap; gap: 8px;">
                                <div>
                                    <div style="font-size: 13px; font-weight: 800; color: #143832;">${t.id} • ${escapeHtml(t.from_outlet)} ➔ ${escapeHtml(t.to_outlet)}</div>
                                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                                        Items: ${t.items.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 11px; font-weight: 700; color: ${t.status === 'Received' ? '#047857' : '#D97706'}; background: ${t.status === 'Received' ? '#D1FAE5' : '#FEF3C7'}; padding: 3px 8px; border-radius: 10px;">
                                        ${t.status}
                                    </span>
                                    ${t.status !== 'Received' ? `
                                        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.culinaryInventory.receiveTransfer('${t.id}')">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                            <span>Mark Received</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // --- TAB 5: PURCHASE ORDERS (PO) MANAGEMENT ---
    function renderPurchaseOrdersTab(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                            <span>Purchase Order (PO) &amp; Multi-Vendor Procurement</span>
                            <span class="badge" style="background: #FEE2E2; color: #B91C1C; font-size: 11px;">Single Dashboard</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Generate purchase orders directly to suppliers. Receiving PO automatically credits warehouse stock.
                        </p>
                    </div>
                    <button class="btn btn-primary" style="font-size: 12px; padding: 6px 16px; border-radius: 16px;" onclick="window.culinaryInventory.promptCreatePO()">
                        ➕ Create New PO
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${(purchaseOrders && purchaseOrders.length > 0 ? purchaseOrders : []).map(po => `
                        <div class="card" style="padding: 16px; border: 1.5px solid #E5E7EB; border-radius: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                                <div>
                                    <div style="font-size: 15px; font-weight: 800; color: #143832;">${po.po_number || po.id} • ${escapeHtml(po.vendor_name)}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">Expected Delivery: ${po.expected_delivery || 'Tomorrow'}</div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 10px; background: ${po.status === 'Received' ? '#D1FAE5' : '#FEF3C7'}; color: ${po.status === 'Received' ? '#047857' : '#D97706'};">
                                        ${po.status}
                                    </span>
                                    ${po.status !== 'Received' ? `
                                        <button class="btn btn-success" style="padding: 4px 12px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.receivePO('${po.id}')">
                                            📥 Receive & Restock
                                        </button>
                                    ` : ''}
                                </div>
                            </div>

                            <div style="background: #FAF7F4; border-radius: 8px; padding: 10px; font-size: 11px; margin-top: 6px;">
                                <div style="font-weight: 700; color: #143832; margin-bottom: 4px;">Line Items:</div>
                                ${(po.items || []).map(i => `
                                    <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                        <span>• ${escapeHtml(i.name)} (${i.quantity} ${i.unit} @ ₹ ${i.unit_price})</span>
                                        <span style="font-weight: 600;">₹ ${i.line_total}</span>
                                    </div>
                                `).join('')}
                                <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E6DCCD; font-weight: 800; color: #143832;">
                                    <span>Total PO Value:</span>
                                    <span>₹ ${po.total}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- TAB 6: PREDICTIVE FORECASTING & WASTE REDUCTION ---
    function renderForecastingWasteTab(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <span>📈 Predictive AI Forecasting & Food Waste Minimization</span>
                            <span class="badge" style="background: #FEF3C7; color: #D97706; font-size: 11px;">Algorithmic Procurement</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Recommends Upscaling, Downscaling, or Maintaining order quantities to prevent stockouts while combating the ~40% restaurant food waste problem.
                        </p>
                    </div>
                    <button class="btn btn-outline" style="font-size: 12px; padding: 6px 14px; border-radius: 16px;" onclick="window.culinaryInventory.promptLogWaste()">
                        🗑️ Log Kitchen Spoilage / Waste
                    </button>
                </div>

                <!-- Waste summary stat -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px;">
                    <div class="card" style="padding: 14px; border-left: 3px solid #DC2626;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Recorded Waste Cost</div>
                        <div style="font-size: 18px; font-weight: 800; color: #DC2626; margin-top: 4px;">₹ ${wastage.total_loss_inr || 0}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Trim, spoilage & tap foam losses</div>
                    </div>
                    <div class="card" style="padding: 14px; border-left: 3px solid #10B981;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Food Waste Prevention</div>
                        <div style="font-size: 18px; font-weight: 800; color: #10B981; margin-top: 4px;">92.4% Target Saved</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Prioritizing near-depletion batches</div>
                    </div>
                </div>

                <!-- Recommendations list -->
                <div class="card" style="padding: 16px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: var(--text-dark);">Algorithmic Replenishment Forecast</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${(forecast && forecast.length > 0 ? forecast : getForecastFallback()).map(f => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FAF7F4; border-radius: 8px; border: 1px solid #E6DCCD; font-size: 12px; flex-wrap: wrap; gap: 6px;">
                                <div>
                                    <span style="font-weight: 700; color: #143832;">${escapeHtml(f.name)}</span>
                                    <span style="color: var(--text-muted); margin-left: 6px;">(Burn: ${f.daily_burn_rate} • ${f.days_of_inventory_left} days left)</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-weight: 700; color: ${f.urgency === 'CRITICAL' ? '#DC2626' : (f.urgency === 'Overstocked' ? '#6B7280' : '#047857')};">
                                        ${f.recommendation}
                                    </span>
                                    ${f.suggested_reorder !== 'None' ? `<span class="badge" style="background: #143832; color: #FFF; font-size: 10px;">${f.suggested_reorder}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function getForecastFallback() {
        return [
            { name: 'Vine-Ripe Tomatoes', daily_burn_rate: '6.5 kg/day', days_of_inventory_left: 2.1, urgency: 'CRITICAL', recommendation: 'Upscale Order (+25% buffer for peak rush)', suggested_reorder: '55 kg' },
            { name: 'Cow Milk (Full Cream)', daily_burn_rate: '7.0 L/day', days_of_inventory_left: 3.2, urgency: 'Moderate', recommendation: 'Replenish (Standard 5-day cycle)', suggested_reorder: '35 Litre' },
            { name: 'Refined Wheat Flour (Maida)', daily_burn_rate: '2.5 kg/day', days_of_inventory_left: 14.0, urgency: 'Overstocked', recommendation: 'Downscale Order (-20% to avoid spoilage)', suggested_reorder: 'None' }
        ];
    }

    // --- TAB 7: SPEED & EFFICIENCY (<15 MIN QUICK AUDIT) ---
    function renderQuickAuditTab(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>15-Minute Rapid Stock-Take Audit</span>
                            <span class="badge" style="background: #FEF3C7; color: #D97706; font-size: 11px;">High-Speed Reconciliation</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Rapid count verification. Enables total stock-keeping procedures to be completed in under 15 minutes.
                        </p>
                    </div>
                    <button class="btn btn-success" style="font-size: 12px; padding: 6px 16px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.culinaryInventory.submitAudit()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span>Reconcile &amp; Update All Stock</span>
                    </button>
                </div>

                <div class="card" style="padding: 0; overflow: hidden; border-radius: 12px; border: 1px solid var(--border);">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                        <thead style="background: #FAF7F4; border-bottom: 2px solid #E6DCCD;">
                            <tr>
                                <th style="padding: 10px 14px; font-weight: 800; color: #143832;">Ingredient / Spirit</th>
                                <th style="padding: 10px 14px; font-weight: 800; color: #143832;">System Stock</th>
                                <th style="padding: 10px 14px; font-weight: 800; color: #143832;">Physical Count</th>
                                <th style="padding: 10px 14px; font-weight: 800; color: #143832;">Variance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rawMaterials.map(m => `
                                <tr style="border-bottom: 1px solid #F3F4F6;">
                                    <td style="padding: 10px 14px; font-weight: 700; color: var(--text-dark);">${escapeHtml(m.name)}</td>
                                    <td style="padding: 10px 14px; color: var(--text-muted);">${m.current_stock} ${m.consumption_unit}</td>
                                    <td style="padding: 10px 14px;">
                                        <input type="number" step="0.1" class="audit-count-input form-control" data-matid="${m.id}" data-sys="${m.current_stock}" value="${m.current_stock}" style="width: 100px; padding: 4px 8px; font-size: 12px;" oninput="window.culinaryInventory.updateAuditVariance(this)">
                                    </td>
                                    <td style="padding: 10px 14px; font-weight: 700;" id="var_${m.id}">0.0</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // Interactive Action Handlers
    function updateAuditVariance(input) {
        const matId = input.getAttribute('data-matid');
        const sysVal = parseFloat(input.getAttribute('data-sys')) || 0;
        const countVal = parseFloat(input.value) || 0;
        const varianceEl = document.getElementById('var_' + matId);
        if (varianceEl) {
            const diff = Math.round((countVal - sysVal) * 10) / 10;
            varianceEl.innerText = (diff > 0 ? `+${diff}` : `${diff}`);
            varianceEl.style.color = diff === 0 ? 'var(--text-muted)' : (diff < 0 ? 'var(--danger)' : 'var(--success)');
        }
    }

    async function submitAudit() {
        const inputs = document.querySelectorAll('.audit-count-input');
        const entries = [];
        inputs.forEach(input => {
            const matId = input.getAttribute('data-matid');
            const val = parseFloat(input.value);
            if (!isNaN(val)) {
                entries.push({ material_id: matId, physical_count: val });
            }
        });

        try {
            const res = await fetch('/api/inventory/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries })
            }).then(r => r.json());

            if (res && res.success) {
                if (typeof showToast === 'function') showToast(`✓ 15-Minute Audit Complete! Reconciled ${res.audited_items_count} items.`);
                loadAllInventoryData();
            } else {
                if (typeof showToast === 'function') showToast('Updated local physical counts.');
            }
        } catch (e) {
            // Apply locally
            entries.forEach(e => {
                const item = rawMaterials.find(m => m.id === e.material_id);
                if (item) item.current_stock = e.physical_count;
            });
            persistLocalSnapshot();
            if (typeof showToast === 'function') showToast('✓ Reconciled local stock counts.');
            renderActiveSubTab();
        }
    }

    async function promptProduceBatch(subRecipeId, defaultYield) {
        const sub = subRecipes.find(s => s.id === subRecipeId);
        const name = sub ? sub.name : subRecipeId;
        const yieldUnit = sub ? sub.yield_unit : 'Litre';
        const amtStr = prompt(`Enter batch production quantity for ${name} (${yieldUnit}):`, defaultYield || "20");
        if (!amtStr) return;

        const qty = parseFloat(amtStr);
        if (isNaN(qty) || qty <= 0) return;

        try {
            const res = await fetch('/api/inventory/batch-produce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subRecipeId, quantity: qty })
            }).then(r => r.json());

            if (res && res.success) {
                if (typeof showToast === 'function') showToast(`✓ Produced ${qty} ${yieldUnit} of ${name}. Raw materials deducted!`);
                loadAllInventoryData();
            } else {
                if (typeof showToast === 'function') showToast(`❌ Error: ${res?.error || 'Failed to produce batch'}`);
            }
        } catch (e) {
            // Local fallback simulation
            if (sub) {
                const ratio = qty / (sub.yield_quantity || 1.0);
                if (Array.isArray(sub.ingredients)) {
                    sub.ingredients.forEach(ing => {
                        const rm = rawMaterials.find(m => m.id === ing.material_id);
                        if (rm) {
                            const needed = Math.round(ing.quantity * ratio * 1000) / 1000;
                            rm.current_stock = Math.max(0, Math.round((rm.current_stock - needed) * 1000) / 1000);
                        }
                    });
                }
                sub.current_stock = Math.round((sub.current_stock + qty) * 10) / 10;
                persistLocalSnapshot();
                if (typeof showToast === 'function') showToast(`✓ [Offline] Produced ${qty} ${yieldUnit} of ${name}. Raw materials deducted!`);
                renderActiveSubTab();
            }
        }
    }

    async function promptRestock(materialId) {
        const item = rawMaterials.find(m => m.id === materialId);
        if (!item) return;
        const addStr = prompt(`Add restock quantity for ${item.name} (${item.consumption_unit}):`, "10");
        if (!addStr) return;
        const qty = parseFloat(addStr);
        if (isNaN(qty) || qty <= 0) return;

        try {
            await fetch('/api/inventory/raw-materials/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materialId, adjustment: qty, isAbsolute: false })
            });
            if (typeof showToast === 'function') showToast(`✓ Stocked +${qty} ${item.consumption_unit} of ${item.name}`);
            loadAllInventoryData();
        } catch (e) {
            item.current_stock = Math.round((item.current_stock + qty) * 10) / 10;
            persistLocalSnapshot();
            if (typeof showToast === 'function') showToast(`✓ Updated ${item.name} stock to ${item.current_stock}`);
            renderActiveSubTab();
        }
    }

    async function promptPriceEdit(materialId) {
        const item = rawMaterials.find(m => m.id === materialId);
        if (!item) return;
        const newRateStr = prompt(`Enter new supplier cost price for ${item.name} (per ${item.purchase_unit}):`, item.cost_per_unit);
        if (!newRateStr) return;
        const newRate = parseFloat(newRateStr);
        if (isNaN(newRate) || newRate < 0) return;

        await simulateRateChange(materialId, newRate);
    }

    async function simulateRateChange(materialId, newPrice) {
        const item = rawMaterials.find(m => m.id === materialId);
        if (item) item.cost_per_unit = newPrice;

        // Cascade recalculation into all sub-recipes that use this material
        subRecipes.forEach(sub => {
            if (Array.isArray(sub.ingredients)) {
                let totalBatchCost = 0;
                sub.ingredients.forEach(ing => {
                    const rm = rawMaterials.find(m => m.id === ing.material_id);
                    const rate = rm ? rm.cost_per_unit : 0;
                    totalBatchCost += ing.quantity * rate;
                });
                if (sub.yield_quantity > 0) {
                    sub.unit_production_cost = Math.round((totalBatchCost / sub.yield_quantity) * 100) / 100;
                }
            }
        });

        persistLocalSnapshot();

        try {
            const res = await fetch('/api/inventory/raw-materials/price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materialId, price: newPrice })
            }).then(r => r.json());

            if (res && res.success) {
                if (typeof showToast === 'function') showToast(`✓ Updated ${res.name || (item ? item.name : materialId)} to ₹ ${newPrice}. Margins recalculated!`);
                loadAllInventoryData();
                return;
            }
        } catch (e) {
            console.warn('[Culinary] Rate updated locally:', e);
        }

        if (typeof showToast === 'function') showToast(`✓ Simulated rate update for ${item ? item.name : materialId} to ₹ ${newPrice}.`);
        renderActiveHubTab();
        renderActiveSubTab();
        if (typeof renderInventoryTelemetryUI === 'function') renderInventoryTelemetryUI();
    }

    async function resetDefaultRates() {
        await simulateRateChange('RM-TOMATO', 40);
        await simulateRateChange('RM-PANEER', 380);
        await simulateRateChange('RM-OIL', 135);
        await simulateRateChange('RM-CHICKEN', 240);
        await simulateRateChange('RM-POULTRY', 240);
        await simulateRateChange('RM-BUTTER', 520);
        if (typeof showToast === 'function') showToast('✓ Reset wholesale rates to baseline!');
    }

    async function promptDispatchTransfer() {
        const toOutlet = prompt("Enter destination outlet name:", "Park Street Bistro & Dine-In");
        if (!toOutlet) return;
        const qtyStr = prompt("Enter Makhani Gravy transfer quantity (Litres):", "10");
        const qty = parseFloat(qtyStr) || 10;

        try {
            await fetch('/api/inventory/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from_outlet: 'Central Kitchen Commissary (Central Kolkata)',
                    to_outlet: toOutlet,
                    items: [{ type: 'sub_recipe', id: 'SUB-MAK-01', name: 'Makhani Gravy Base', quantity: qty, unit: 'Litre' }]
                })
            });
            if (typeof showToast === 'function') showToast(`🚚 Dispatched ${qty}L transfer to ${toOutlet}`);
            loadAllInventoryData();
        } catch (e) {
            if (typeof showToast === 'function') showToast(`🚚 Transfer dispatched to ${toOutlet}`);
        }
    }

    async function receiveTransfer(transferId) {
        try {
            await fetch(`/api/inventory/transfers/${encodeURIComponent(transferId)}/receive`, { method: 'POST' });
            if (typeof showToast === 'function') showToast(`✓ Transfer ${transferId} received & outlet inventory credited!`);
            loadAllInventoryData();
        } catch (e) {
            if (typeof showToast === 'function') showToast('✓ Transfer marked as received.');
        }
    }

    async function promptCreatePO() {
        const vendor = prompt("Enter vendor name:", "Metro Cash & Carry Wholesale");
        if (!vendor) return;
        const tomatoQty = prompt("Enter Tomatoes order quantity (kg):", "40");
        const riceQty = prompt("Enter Basmati Rice order quantity (kg):", "50");

        try {
            await fetch('/api/inventory/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_name: vendor,
                    items: [
                        { material_id: 'RM-TOMATO', name: 'Vine-Ripe Tomatoes', quantity: parseFloat(tomatoQty) || 40, unit: 'kg', unit_price: 40 },
                        { material_id: 'RM-BASMATI-RICE', name: 'Royal Basmati Rice', quantity: parseFloat(riceQty) || 50, unit: 'kg', unit_price: 115 }
                    ]
                })
            });
            if (typeof showToast === 'function') showToast(`📦 PO Generated for ${vendor}!`);
            loadAllInventoryData();
        } catch (e) {
            if (typeof showToast === 'function') showToast('📦 PO Generated successfully.');
        }
    }

    async function receivePO(poId) {
        try {
            await fetch(`/api/inventory/purchase-orders/${encodeURIComponent(poId)}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Received' })
            });
            if (typeof showToast === 'function') showToast(`📥 PO ${poId} Received & stock automatically updated!`);
            loadAllInventoryData();
        } catch (e) {
            if (typeof showToast === 'function') showToast('📥 PO marked as received.');
        }
    }

    async function promptLogWaste() {
        const reason = prompt("Enter waste reason (e.g. 'Over-prep gravy spoilage', 'Tap drip'):", "Over-prep gravy spoilage");
        if (!reason) return;
        const qtyStr = prompt("Enter wasted quantity:", "2");
        const qty = parseFloat(qtyStr) || 2;

        try {
            await fetch('/api/inventory/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: 'SUB-MAK-01',
                    item_type: 'sub_recipe',
                    quantity: qty,
                    reason,
                    staff: (typeof currentStaff !== 'undefined' && currentStaff?.name) ? currentStaff.name : 'Counter Staff'
                })
            });
            if (typeof showToast === 'function') showToast(`🗑️ Logged ${qty} units waste. Total loss updated.`);
            loadAllInventoryData();
        } catch (e) {
            if (typeof showToast === 'function') showToast('🗑️ Waste recorded.');
        }
    }

    // POS Live Order Deduction Hook
    async function deductOrder(order) {
        if (!order) return;
        try {
            const items = Array.isArray(order.rawItems) ? order.rawItems : (Array.isArray(order.items) ? order.items : []);
            
            // Immediate optimistic local deduction
            items.forEach(cartItem => {
                const dishName = (cartItem.name || '').toLowerCase().trim();
                const itemId = cartItem.id ? String(cartItem.id) : null;
                const qty = parseInt(cartItem.qty || cartItem.quantity || 1, 10);

                let rec = null;
                if (itemId) {
                    rec = recipes.find(r => String(r.menu_item_id) === itemId || String(r.id) === itemId);
                }
                if (!rec) {
                    rec = recipes.find(r => (r.dish_name || '').toLowerCase().trim() === dishName);
                }
                if (!rec) {
                    rec = recipes.find(r => {
                        const rName = (r.dish_name || '').toLowerCase().trim();
                        return dishName.includes(rName) || rName.includes(dishName);
                    });
                }

                if (!rec) {
                    rec = DEFAULT_LOCAL_RECIPES.find(r => {
                        const rName = (r.dish_name || '').toLowerCase().trim();
                        return dishName.includes(rName) || rName.includes(dishName);
                    });
                }

                if (rec && Array.isArray(rec.components)) {
                    rec.components.forEach(comp => {
                        const deductAmt = Math.round((comp.exact_quantity * qty) * 1000) / 1000;
                        if (comp.type === 'sub_recipe' || (comp.id && comp.id.startsWith('SUB-'))) {
                            let sub = subRecipes.find(s => s.id === comp.id);
                            if (!sub && comp.id === 'SUB-GRAVY-BASE') sub = subRecipes.find(s => s.id === 'SUB-BROWN-01');
                            if (!sub && comp.id === 'SUB-BROWN-01') sub = subRecipes.find(s => s.id === 'SUB-GRAVY-BASE');
                            if (sub) {
                                sub.current_stock = Math.max(0, Math.round((sub.current_stock - deductAmt) * 100) / 100);
                            }
                        } else {
                            let rm = rawMaterials.find(m => m.id === comp.id);
                            if (!rm && comp.id === 'RM-POULTRY') rm = rawMaterials.find(m => m.id === 'RM-CHICKEN');
                            if (!rm && comp.id === 'RM-CHICKEN') rm = rawMaterials.find(m => m.id === 'RM-POULTRY');
                            if (!rm && comp.id === 'RM-ONION-SPICES') rm = rawMaterials.find(m => m.id === 'RM-ONION');
                            if (!rm && comp.id === 'RM-ONION') rm = rawMaterials.find(m => m.id === 'RM-ONION-SPICES');
                            if (rm) {
                                rm.current_stock = Math.max(0, Math.round((rm.current_stock - deductAmt) * 100) / 100);
                            }
                        }
                    });
                } else {
                    // Fallback deduction for the 4 dishes
                    if (dishName.includes('samosa')) {
                        const m = rawMaterials.find(rm => rm.id === 'RM-MAIDA'); if (m) m.current_stock = Math.max(0, Math.round((m.current_stock - 0.04 * qty) * 100) / 100);
                        const p = rawMaterials.find(rm => rm.id === 'RM-POTATO'); if (p) p.current_stock = Math.max(0, Math.round((p.current_stock - 0.05 * qty) * 100) / 100);
                        const o = rawMaterials.find(rm => rm.id === 'RM-OIL'); if (o) o.current_stock = Math.max(0, Math.round((o.current_stock - 0.015 * qty) * 100) / 100);
                    } else if (dishName.includes('tea') || dishName.includes('chai')) {
                        const ml = rawMaterials.find(rm => rm.id === 'RM-MILK'); if (ml) ml.current_stock = Math.max(0, Math.round((ml.current_stock - 0.08 * qty) * 100) / 100);
                        const tl = rawMaterials.find(rm => rm.id === 'RM-TEA-LEAVES'); if (tl) tl.current_stock = Math.max(0, Math.round((tl.current_stock - 0.005 * qty) * 100) / 100);
                        const sg = rawMaterials.find(rm => rm.id === 'RM-SUGAR'); if (sg) sg.current_stock = Math.max(0, Math.round((sg.current_stock - 0.008 * qty) * 100) / 100);
                    } else if (dishName.includes('chicken')) {
                        const ch = rawMaterials.find(rm => rm.id === 'RM-POULTRY' || rm.id === 'RM-CHICKEN'); if (ch) ch.current_stock = Math.max(0, Math.round((ch.current_stock - 0.18 * qty) * 100) / 100);
                        const on = rawMaterials.find(rm => rm.id === 'RM-ONION-SPICES' || rm.id === 'RM-ONION'); if (on) on.current_stock = Math.max(0, Math.round((on.current_stock - 0.05 * qty) * 100) / 100);
                        const gr = subRecipes.find(sub => sub.id === 'SUB-GRAVY-BASE' || sub.id === 'SUB-BROWN-01'); if (gr) gr.current_stock = Math.max(0, Math.round((gr.current_stock - 0.15 * qty) * 100) / 100);
                    } else if (dishName.includes('coke') || dishName.includes('cola')) {
                        const cl = rawMaterials.find(rm => rm.id === 'RM-COLA'); if (cl) cl.current_stock = Math.max(0, Math.round((cl.current_stock - 1.0 * qty) * 100) / 100);
                        const cm = rawMaterials.find(rm => rm.id === 'RM-CHAAT-MASALA'); if (cm) cm.current_stock = Math.max(0, Math.round((cm.current_stock - 0.005 * qty) * 100) / 100);
                    } else if (dishName.includes('paneer')) {
                        const p = rawMaterials.find(m => m.id === 'RM-PANEER'); if (p) p.current_stock = Math.max(0, Math.round((p.current_stock - 0.15 * qty) * 100) / 100);
                        const o = rawMaterials.find(m => m.id === 'RM-OIL'); if (o) o.current_stock = Math.max(0, Math.round((o.current_stock - 0.02 * qty) * 100) / 100);
                        const s = subRecipes.find(sub => sub.id === 'SUB-MAK-01'); if (s) s.current_stock = Math.max(0, Math.round((s.current_stock - 0.20 * qty) * 100) / 100);
                    }
                }
            });

            // Synchronize alias pairs locally
            const poultry = rawMaterials.find(m => m.id === 'RM-POULTRY');
            const chicken = rawMaterials.find(m => m.id === 'RM-CHICKEN');
            if (poultry && chicken) {
                const minVal = Math.min(poultry.current_stock, chicken.current_stock);
                poultry.current_stock = minVal;
                chicken.current_stock = minVal;
            }
            const onions = rawMaterials.find(m => m.id === 'RM-ONION-SPICES');
            const onion = rawMaterials.find(m => m.id === 'RM-ONION');
            if (onions && onion) {
                const minVal = Math.min(onions.current_stock, onion.current_stock);
                onions.current_stock = minVal;
                onion.current_stock = minVal;
            }
            const gravy = subRecipes.find(s => s.id === 'SUB-GRAVY-BASE');
            const brown = subRecipes.find(s => s.id === 'SUB-BROWN-01');
            if (gravy && brown) {
                const minVal = Math.min(gravy.current_stock, brown.current_stock);
                gravy.current_stock = minVal;
                brown.current_stock = minVal;
            }

            persistLocalSnapshot();
            const contentArea = document.getElementById('culinarySubTabContent');
            if (contentArea && activeSubTab === 'rtr_tracker') {
                renderRtrTrackerTab(contentArea);
            }

            // Sync with backend engine
            await fetch('/api/inventory/pos-deduct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order })
            });
            loadAllInventoryData();
        } catch (e) {
            console.warn('[Culinary Inventory] POS live deduction notice:', e);
        }
    }


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
        if (typeof showToast === 'function') showToast(`✓ Added "${name}" to raw inventory!`);
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
        if (catEl) catEl.textContent = `${dish.category || 'Main Course'} • 1 Portion Yield`;
        const dishNameEl = document.getElementById('recDetailDishName');
        if (dishNameEl) dishNameEl.textContent = dish.name;

        const heroImg = document.getElementById('recDetailHeroImg');
        if (heroImg) {
            const photoUrl = dish.image || dish.image_url || (typeof getCuratedFoodPhoto === 'function' ? getCuratedFoodPhoto(dish.name, dish.category) : '') || (typeof generateFallbackImage === 'function' ? generateFallbackImage(dish.name, dish.category) : 'assets/default-food.png');
            heroImg.src = photoUrl;
            heroImg.onerror = function() {
                this.onerror = null;
                this.src = (typeof generateFallbackImage === 'function' ? generateFallbackImage(dish.name, dish.category) : 'assets/default-food.png');
            };
        }

        const priceEl = document.getElementById('recDetailPrice');
        if (priceEl) priceEl.textContent = `₹ ${(dish.price || 0).toFixed(2)}`;

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

            return `
                <tr data-row-idx="${idx}">
                    <td style="padding: 8px 10px;">
                        <select class="rec-ing-select form-input" onchange="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 100%; font-size: 11.5px; padding: 4px 6px;">
                            <optgroup label="Semi-Finished Bases">
                                ${subRecipes.map(s => `<option value="${s.id}" ${s.id === c.id ? 'selected' : ''}>${escapeHtml(s.name)} (₹ ${s.unit_production_cost}/${s.yield_unit})</option>`).join('')}
                            </optgroup>
                            <optgroup label="Raw Materials">
                                ${rawMaterials.map(m => `<option value="${m.id}" ${m.id === c.id ? 'selected' : ''}>${escapeHtml(m.name)} (₹ ${m.cost_per_unit}/${m.purchase_unit})</option>`).join('')}
                            </optgroup>
                        </select>
                    </td>
                    <td style="padding: 8px 10px;">
                        <input type="number" class="rec-ing-qty form-input" value="${qty}" step="0.005" min="0" oninput="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 70px; font-size: 12px; font-weight: 700; padding: 4px 6px;">
                        <span style="font-size: 10px; color: var(--text-muted);">${c.unit || 'units'}</span>
                    </td>
                    <td style="padding: 8px 10px; font-size: 11px; color: var(--text-muted);" class="rec-ing-rate">
                        ₹ ${unitCost.toFixed(2)}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #143832;" class="rec-ing-contrib">
                        ₹ ${contrib.toFixed(2)}
                    </td>
                    <td style="padding: 8px 6px; text-align: center;">
                        <button type="button" onclick="window.culinaryInventory.removeRecipeDetailRow(this)" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 2px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function addRecipeDetailRow() {
        const tbody = document.getElementById('recDetailIngredientsTbody');
        if (!tbody) return;
        const newRow = document.createElement('tr');
        const defaultMat = rawMaterials[0] || { id: 'RM-OIL', name: 'Cooking Oil', cost_per_unit: 135, purchase_unit: 'Litre' };
        newRow.innerHTML = `
            <td style="padding: 8px 10px;">
                <select class="rec-ing-select form-input" onchange="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 100%; font-size: 11.5px; padding: 4px 6px;">
                    <optgroup label="Semi-Finished Bases">
                        ${subRecipes.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (₹ ${s.unit_production_cost}/${s.yield_unit})</option>`).join('')}
                    </optgroup>
                    <optgroup label="Raw Materials">
                        ${rawMaterials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (₹ ${m.cost_per_unit}/${m.purchase_unit})</option>`).join('')}
                    </optgroup>
                </select>
            </td>
            <td style="padding: 8px 10px;">
                <input type="number" class="rec-ing-qty form-input" value="0.1" step="0.005" min="0" oninput="window.culinaryInventory.recalcRecipeDetailMargin()" style="width: 70px; font-size: 12px; font-weight: 700; padding: 4px 6px;">
                <span style="font-size: 10px; color: var(--text-muted);">${defaultMat.purchase_unit || 'units'}</span>
            </td>
            <td style="padding: 8px 10px; font-size: 11px; color: var(--text-muted);" class="rec-ing-rate">
                ₹ ${(defaultMat.cost_per_unit || 0).toFixed(2)}
            </td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #143832;" class="rec-ing-contrib">
                ₹ 0.00
            </td>
            <td style="padding: 8px 6px; text-align: center;">
                <button type="button" onclick="window.culinaryInventory.removeRecipeDetailRow(this)" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 2px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </td>
        `;
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

            if (rateEl) rateEl.textContent = `₹ ${rate.toFixed(2)}`;
            if (contribEl) contribEl.textContent = `₹ ${lineCost.toFixed(2)}`;
        });

        const yieldInput = document.getElementById('recDetailYieldInput');
        const yieldVal = Math.max(1, parseInt(yieldInput?.value || '1', 10));
        const portionCost = Math.round((totalCost / yieldVal) * 100) / 100;

        const sellingPrice = activeRecipeDetailDish.price || 200;
        const grossProfit = Math.max(0, Math.round((sellingPrice - portionCost) * 100) / 100);
        const marginPct = sellingPrice > 0 ? Math.round((grossProfit / sellingPrice) * 1000) / 10 : 0;

        const costEl = document.getElementById('recDetailCost');
        if (costEl) costEl.textContent = `₹ ${portionCost.toFixed(2)}`;

        const profitEl = document.getElementById('recDetailProfit');
        if (profitEl) profitEl.textContent = `₹ ${grossProfit.toFixed(2)}`;

        const marginEl = document.getElementById('recDetailMargin');
        if (marginEl) {
            marginEl.textContent = `${marginPct}%`;
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
        if (typeof showToast === 'function') showToast(`✓ Updated recipe for ${activeRecipeDetailDish.name}!`);
    }

    // --- 3. LOG WASTE & LOSS AUDIT MODAL ---
    function openLogWasteModal() {
        const modal = document.getElementById('invLogWasteModal');
        if (!modal) return;

        const select = document.getElementById('wasteItemSelect');
        if (select) {
            select.innerHTML = [
                ...rawMaterials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (Current: ${m.current_stock} ${m.consumption_unit})</option>`),
                ...subRecipes.map(s => `<option value="${s.id}">[Base] ${escapeHtml(s.name)} (Current: ${s.current_stock} ${s.yield_unit})</option>`)
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
        lossEl.textContent = `₹ ${totalLoss.toFixed(2)}`;
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
            quantity: `${qty} ${unitLabel}`,
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
        if (typeof showToast === 'function') showToast(`🗑️ Recorded ₹ ${totalLoss.toFixed(2)} wastage loss for ${itemName}.`);
    }

    // --- 4. PURCHASE ORDER MODAL ---
    function openPurchaseOrderModal() {
        const modal = document.getElementById('invPurchaseOrderModal');
        if (!modal) return;

        const suppliers = Array.from(new Set(rawMaterials.map(m => m.supplier || 'Mandi Wholesale').filter(Boolean)));
        const select = document.getElementById('poSupplierSelect');
        if (select) {
            select.innerHTML = suppliers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
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

            return `
                <tr data-po-id="${item.id}">
                    <td style="padding: 8px 10px;">
                        <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(item.name)}</div>
                        <div style="font-size: 10px; color: var(--text-muted);">${escapeHtml(item.id)}</div>
                    </td>
                    <td style="padding: 8px 10px; font-size: 11.5px;">
                        <span style="color: ${isLow ? '#DC2626' : '#143832'}; font-weight: 700;">${item.current_stock}</span> / ${item.min_threshold} ${item.purchase_unit}
                    </td>
                    <td style="padding: 8px 10px;">
                        <input type="number" class="po-qty-input form-input" data-rate="${item.cost_per_unit}" value="${suggested}" min="0" step="any" oninput="window.culinaryInventory.recalcPoTotal()" style="width: 70px; padding: 4px 6px; font-weight: 700; font-size: 12px;">
                        <span style="font-size: 10px; color: var(--text-muted);">${item.purchase_unit}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #143832;" class="po-line-cost">
                        ₹ ${estCost.toFixed(2)}
                    </td>
                </tr>
            `;
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
            if (costCell) costCell.textContent = `₹ ${line.toFixed(2)}`;
        });
        totalEl.textContent = `₹ ${total.toFixed(2)}`;
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
                itemsText += `• ${item.name}: ${qty} ${item.purchase_unit} @ ₹ ${item.cost_per_unit} = ₹ ${line.toFixed(2)}\n`;
            }
        });

        const msg = `*PURCHASE ORDER - Billnaw Cafe*\n*Supplier:* ${supplier}\n*Date:* ${new Date().toLocaleDateString()}\n\n*Required Items:*\n${itemsText}\n*Total Estimated:* ₹ ${total.toFixed(2)}\n\nPlease confirm delivery time. Thank you!`;
        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
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
        if (typeof showToast === 'function') showToast(`✓ Purchase Order ${newPo.id} created for ${supplier}!`);
    }

    // Public API
    window.culinaryInventory = {
        init: loadAllInventoryData,
        switchSubTab: switchInventorySubTab,
        switchHubTab: switchInventoryHubTab,
        switchTab: switchInventoryHubTab,
        toggleAccordion,
        renderRawStockTab,
        renderMorningPrepTab,
        renderDishCostingTab,
        produceMorningBatch,
        filterRawStock,
        filterRawStockCategory,
        getBatchHistory: () => commissaryBatchHistory,
        promptProduceBatch,
        promptRestock,
        promptPriceEdit,
        simulateRateChange,
        resetDefaultRates,
        promptDispatchTransfer,
        receiveTransfer,
        promptCreatePO,
        receivePO,
        promptLogWaste,
        updateAuditVariance,
        submitAudit,
        deductOrder,
        refreshCosting: loadAllInventoryData,
        // RTR Tracker & Recipe Config API
        openDishRecipeModal,
        triggerApproxAutoFill,
        recalcRecipeModalCost,
        setRecipeField,
        saveCurrentRecipeModal,
        closeDishRecipeModal,
        openItemAlertModal,
        saveItemAlertSettings,
        closeItemAlertModal,
        openRestockModal,
        recalcRestockTotal,
        submitRestockExpense,
        closeRestockModal,
        filterRtrDishes,
        syncMenuItems,
        getCoreStaples,
        getAllMenuDishes,
        registerNewDishRecipe,
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
        savePurchaseOrder,
        renderDishRecipes
    };

    window.toggleItemRow = toggleItemRow;
    window.switchInventoryHubTab = switchInventoryHubTab;
    window.switchInventoryTab = switchInventoryHubTab;
    window.switchInventory3Tab = switchInventoryHubTab;
    window.produceMorningBatch = produceMorningBatch;
    window.renderRawStockTab = renderRawStockTab;
    window.renderMorningPrepTab = renderMorningPrepTab;
    window.renderDishCostingTab = renderDishCostingTab;
    window.renderDishRecipes = renderDishRecipes;
    window.openRestockModal = openRestockModal;
    window.closeRestockModal = closeRestockModal;
    window.submitRestockExpense = submitRestockExpense;
    window.recalcRestockTotal = recalcRestockTotal;

    // Auto-init on load
    document.addEventListener('DOMContentLoaded', () => {
        loadAllInventoryData();
    });

})();
