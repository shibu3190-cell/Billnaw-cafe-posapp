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

    // Offline / Local defaults fallback
    const DEFAULT_LOCAL_MATERIALS = [
        { id: 'RM-TOMATO', name: 'Vine-Ripe Tomatoes', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 50.0, min_threshold: 15.0, cost_per_unit: 40, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
        { id: 'RM-ONION', name: 'Red Onions', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 45.0, min_threshold: 12.0, cost_per_unit: 35, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
        { id: 'RM-GINGER-GARLIC', name: 'Ginger-Garlic Paste', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 15.0, min_threshold: 4.0, cost_per_unit: 150, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
        { id: 'RM-BUTTER', name: 'Dairy Butter (Amul/Dairy)', category: 'Dairy', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 20.0, min_threshold: 5.0, cost_per_unit: 520, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
        { id: 'RM-CREAM', name: 'Fresh Dairy Malai / Cream', category: 'Dairy', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 15.0, min_threshold: 4.0, cost_per_unit: 220, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
        { id: 'RM-PANEER', name: 'Malai Paneer Blocks', category: 'Dairy', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 25.0, min_threshold: 6.0, cost_per_unit: 380, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
        { id: 'RM-CHICKEN', name: 'Fresh Farm Chicken', category: 'Meat', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 30.0, min_threshold: 8.0, cost_per_unit: 240, supplier: 'Farm Fresh Poultry', unit_type: 'raw' },
        { id: 'RM-OIL', name: 'Refined Sunflower Oil', category: 'Pantry', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 40.0, min_threshold: 10.0, cost_per_unit: 135, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-CASHEW', name: 'Premium Cashew Paste', category: 'Dry Fruits', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 10.0, min_threshold: 2.5, cost_per_unit: 720, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-KASURI-METHI', name: 'Kasuri Methi', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 4.0, min_threshold: 1.0, cost_per_unit: 320, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-GARAM-MASALA', name: 'Royal Garam Masala', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 5.0, min_threshold: 1.5, cost_per_unit: 850, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-KASHMIRI-MIRCH', name: 'Kashmiri Degi Mirch', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 6.0, min_threshold: 1.5, cost_per_unit: 480, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-BASMATI-RICE', name: 'Dum Biryani Basmati Rice', category: 'Grains', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 60.0, min_threshold: 15.0, cost_per_unit: 115, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        { id: 'RM-MILK', name: 'Full Cream Milk', category: 'Dairy', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 40.0, min_threshold: 10.0, cost_per_unit: 64, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
        { id: 'RM-COFFEE-BEANS', name: 'Arabica Coffee Beans', category: 'Beverages', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 8.0, min_threshold: 2.5, cost_per_unit: 750, supplier: 'Specialty Roasters', unit_type: 'raw' },
        { id: 'RM-TEA-LEAVES', name: 'CTC Assam Tea Leaves', category: 'Beverages', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 10.0, min_threshold: 3.0, cost_per_unit: 380, supplier: 'Assam Tea Direct', unit_type: 'raw' },
        { id: 'RM-MAIDA', name: 'Refined Flour (Maida)', category: 'Grains', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 35.0, min_threshold: 10.0, cost_per_unit: 45, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
        // Liquid Spirits & Draught Beer Kegs
        { id: 'RM-WHISKY-750', name: 'Premium Scotch Whisky', category: 'Bar & Spirits', purchase_unit: '750ml Bottle', consumption_unit: 'ml', conversion_factor: 750, current_stock: 3750, min_threshold: 1500, cost_per_unit: 2600, supplier: 'United Spirits Distributor', unit_type: 'spirit' },
        { id: 'RM-RUM-750', name: 'Dark Spiced Rum', category: 'Bar & Spirits', purchase_unit: '750ml Bottle', consumption_unit: 'ml', conversion_factor: 750, current_stock: 4500, min_threshold: 1500, cost_per_unit: 900, supplier: 'United Spirits Distributor', unit_type: 'spirit' },
        { id: 'RM-CRAFT-BEER-KEG', name: 'German Wheat Draught Keg', category: 'Brewery & Kegs', purchase_unit: '50L Keg', consumption_unit: 'ml', conversion_factor: 50000, current_stock: 50000, min_threshold: 10000, cost_per_unit: 8500, supplier: 'Craft Brewery Tap Lines', unit_type: 'draught_beer', default_froth_buffer: 6.0 },
        { id: 'RM-IPA-BEER-KEG', name: 'Hazy IPA Keg', category: 'Brewery & Kegs', purchase_unit: '30L Keg', consumption_unit: 'ml', conversion_factor: 30000, current_stock: 30000, min_threshold: 8000, cost_per_unit: 6200, supplier: 'Craft Brewery Tap Lines', unit_type: 'draught_beer', default_froth_buffer: 7.0 }
    ];

    const DEFAULT_LOCAL_SUB_RECIPES = [
        {
            id: 'SUB-MAK-01',
            name: 'Makhani Gravy Base (Shahi Butter Masala Gravy)',
            yield_quantity: 20.0,
            yield_unit: 'Litre',
            current_stock: 20.0,
            min_threshold: 5.0,
            unit_production_cost: 132.5,
            ingredients: [
                { material_id: 'RM-TOMATO', quantity: 15.0, unit: 'kg' },
                { material_id: 'RM-GINGER-GARLIC', quantity: 2.0, unit: 'kg' },
                { material_id: 'RM-OIL', quantity: 1.5, unit: 'Litre' },
                { material_id: 'RM-BUTTER', quantity: 1.2, unit: 'kg' },
                { material_id: 'RM-CASHEW', quantity: 1.5, unit: 'kg' },
                { material_id: 'RM-KASHMIRI-MIRCH', quantity: 0.4, unit: 'kg' },
                { material_id: 'RM-GARAM-MASALA', quantity: 0.2, unit: 'kg' },
                { material_id: 'RM-CREAM', quantity: 1.0, unit: 'Litre' },
                { material_id: 'RM-KASURI-METHI', quantity: 0.1, unit: 'kg' }
            ]
        },
        {
            id: 'SUB-BROWN-01',
            name: 'Bhuna Onion-Tomato Gravy Base',
            yield_quantity: 15.0,
            yield_unit: 'Litre',
            current_stock: 15.0,
            min_threshold: 4.0,
            unit_production_cost: 98.0,
            ingredients: [
                { material_id: 'RM-ONION', quantity: 12.0, unit: 'kg' },
                { material_id: 'RM-TOMATO', quantity: 6.0, unit: 'kg' },
                { material_id: 'RM-GINGER-GARLIC', quantity: 1.5, unit: 'kg' },
                { material_id: 'RM-OIL', quantity: 2.0, unit: 'Litre' },
                { material_id: 'RM-GARAM-MASALA', quantity: 0.3, unit: 'kg' },
                { material_id: 'RM-KASHMIRI-MIRCH', quantity: 0.3, unit: 'kg' }
            ]
        },
        {
            id: 'SUB-YAKHNI-01',
            name: 'Dum Biryani Yakhni / Meat Stock Base',
            yield_quantity: 10.0,
            yield_unit: 'kg',
            current_stock: 10.0,
            min_threshold: 3.0,
            unit_production_cost: 248.0,
            ingredients: [
                { material_id: 'RM-CHICKEN', quantity: 8.0, unit: 'kg' },
                { material_id: 'RM-ONION', quantity: 3.0, unit: 'kg' },
                { material_id: 'RM-GINGER-GARLIC', quantity: 1.0, unit: 'kg' },
                { material_id: 'RM-OIL', quantity: 1.0, unit: 'Litre' },
                { material_id: 'RM-GARAM-MASALA', quantity: 0.25, unit: 'kg' }
            ]
        },
        {
            id: 'SUB-DAL-01',
            name: 'Dal Makhani Slow-Cook Base',
            yield_quantity: 15.0,
            yield_unit: 'Litre',
            current_stock: 15.0,
            min_threshold: 4.0,
            unit_production_cost: 85.0,
            ingredients: [
                { material_id: 'RM-BUTTER', quantity: 1.5, unit: 'kg' },
                { material_id: 'RM-CREAM', quantity: 1.0, unit: 'Litre' },
                { material_id: 'RM-TOMATO', quantity: 4.0, unit: 'kg' },
                { material_id: 'RM-GINGER-GARLIC', quantity: 0.8, unit: 'kg' }
            ]
        }
    ];

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
            else rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || 'null') || DEFAULT_LOCAL_MATERIALS;

            if (subRes && subRes.sub_recipes) subRecipes = subRes.sub_recipes;
            else subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || 'null') || DEFAULT_LOCAL_SUB_RECIPES;

            if (recipeRes && recipeRes.recipes) recipes = recipeRes.recipes;
            if (costRes && costRes.costing) costingReport = costRes.costing;
            if (trfRes && trfRes.transfers) transfers = trfRes.transfers;
            if (poRes && poRes.purchase_orders) purchaseOrders = poRes.purchase_orders;
            if (fcastRes && fcastRes.forecast) forecast = fcastRes.forecast;
            if (wstRes) wastage = wstRes;

            persistLocalSnapshot();
            renderActiveSubTab();
        } catch (e) {
            console.warn('[Culinary Inventory] Backend sync notice, using resilient offline store:', e);
            rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || 'null') || DEFAULT_LOCAL_MATERIALS;
            subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || 'null') || DEFAULT_LOCAL_SUB_RECIPES;
            renderActiveSubTab();
        }
    }

    function persistLocalSnapshot() {
        try {
            localStorage.setItem('billnaw_culinary_materials', JSON.stringify(rawMaterials));
            localStorage.setItem('billnaw_culinary_subs', JSON.stringify(subRecipes));
        } catch (e) {}
    }

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
            { id: 'RM-ONION', icon: '🧅', title: 'Raw Veggies & Onions', subtitle: 'Fresh Red Onions & Veg', unit: 'kg', isSub: false, capacity: 60 },
            { id: 'RM-CHICKEN', icon: '🍗', title: 'Fresh Chicken / Meat', subtitle: 'Poultry Curry Cut & Boneless', unit: 'kg', isSub: false, capacity: 40 },
            { id: 'RM-PANEER', icon: '🧀', title: 'Malai Paneer', subtitle: 'Fresh Dairy Paneer Blocks', unit: 'kg', isSub: false, capacity: 35 },
            { id: 'SUB-MAK-01', icon: '🍲', title: 'Makhani Gravy Base', subtitle: 'Shahi Butter Masala Gravy', unit: 'Litre', isSub: true, capacity: 30 },
            { id: 'SUB-BROWN-01', icon: '🥘', title: 'Brown Curry Base', subtitle: 'Bhuna Onion-Tomato Gravy Base', unit: 'Litre', isSub: true, capacity: 25 },
            { id: 'SUB-DAL-01', icon: '🍛', title: 'Dal Makhani Base', subtitle: 'Slow-Cooked Black Dal Base', unit: 'Litre', isSub: true, capacity: 20 }
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

        // Quick aggregate KPI counts
        const oilItem = rawMaterials.find(m => m.id === 'RM-OIL') || { current_stock: 40, min_threshold: 10, consumption_unit: 'Litre' };
        const paneerItem = rawMaterials.find(m => m.id === 'RM-PANEER') || { current_stock: 25, min_threshold: 6, consumption_unit: 'kg' };
        const chickenItem = rawMaterials.find(m => m.id === 'RM-CHICKEN') || { current_stock: 30, min_threshold: 8, consumption_unit: 'kg' };
        const totalGravyStock = subRecipes.reduce((sum, s) => sum + (s.current_stock || 0), 0);
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
                                Tracks exact consumption of Cooking Oil, Flour, Veggies/Onions, Meat/Paneer, and Gravy bases as POS bills are settled. Click any menu dish below to set portion quantities or use <strong>⚡ Approx Auto-Fill</strong>.
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn" style="background: #2DD4BF; color: #143832; font-weight: 800; font-size: 12px; border-radius: 20px; padding: 7px 16px; border: none;" onclick="window.culinaryInventory.syncMenuItems()">
                                🔄 Refresh Menu & Stock
                            </button>
                        </div>
                    </div>

                    <!-- 3 Quick KPI Metrics -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.15);">
                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase;">🛢️ Cooking Oil Leftover</div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${oilItem.current_stock} <span style="font-size: 12px; font-weight: 600;">Litres</span>
                            </div>
                            <div style="font-size: 11px; color: ${oilItem.current_stock <= (oilItem.min_threshold || 10) ? '#FCA5A5' : '#86EFAC'};">
                                ${oilItem.current_stock <= (oilItem.min_threshold || 10) ? '⚠️ Alert: Reorder Required' : '🟢 Sufficient Kitchen Supply'}
                            </div>
                        </div>

                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase;">🧀 Paneer & 🍗 Chicken</div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${paneerItem.current_stock} kg <span style="font-size: 12px; font-weight: 400; opacity: 0.8;">/</span> ${chickenItem.current_stock} kg
                            </div>
                            <div style="font-size: 11px; color: #D1FAE5;">
                                Leftover fresh proteins in kitchen
                            </div>
                        </div>

                        <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #A7F3D0; text-transform: uppercase;">🍲 Gravy Bases Ready</div>
                            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-top: 2px;">
                                ${totalGravyStock.toFixed(1)} <span style="font-size: 12px; font-weight: 600;">Litres</span>
                            </div>
                            <div style="font-size: 11px; color: #D1FAE5;">
                                ${configuredCount} of ${dishes.length} menu dishes mapped
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 1: 🥦 ESSENTIAL LEFTOVER STAPLES (VERTICAL STACK) -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                <span>🥦 Essential Leftover Raw Materials & Gravies</span>
                                <span class="badge" style="background: #E0F2FE; color: #0369A1; font-size: 11px;">Vertical Live Monitor</span>
                            </h3>
                            <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                                Leftover stocks decrease automatically when bills settle. Click <strong>🔔 Item Alert</strong> to change alert trigger, or <strong>🛒 + Restock</strong> after market shopping.
                            </p>
                        </div>
                    </div>

                    <div class="rtr-staples-vertical-list">
                        ${staples.map(s => {
                            let item = s.isSub ? subRecipes.find(sub => sub.id === s.id) : rawMaterials.find(rm => rm.id === s.id);
                            if (!item) {
                                item = { current_stock: 0, min_threshold: 10, cost_per_unit: 100, consumption_unit: s.unit };
                            }
                            const stock = parseFloat(item.current_stock) || 0;
                            const thresh = parseFloat(item.min_threshold ?? item.minThreshold ?? 10);
                            const unit = item.consumption_unit || item.yield_unit || s.unit;
                            const isOut = stock <= 0;
                            const isLow = !isOut && stock <= thresh;

                            let statusBadge = '';
                            if (isOut) {
                                statusBadge = `<span class="badge" style="background: #FEE2E2; color: #DC2626; font-size: 11px; font-weight: 800;">🚨 Out of Stock (0 ${unit})</span>`;
                            } else if (isLow) {
                                statusBadge = `<span class="badge" style="background: #FEF3C7; color: #D97706; font-size: 11px; font-weight: 800;">⚠️ Low Alert (< ${thresh} ${unit})</span>`;
                            } else {
                                statusBadge = `<span class="badge" style="background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 800;">🟢 Healthy Stock (> ${thresh} ${unit})</span>`;
                            }

                            return `
                                <div class="rtr-staple-row ${isLow || isOut ? 'low-stock' : ''}">
                                    <div style="display: flex; align-items: center; gap: 14px; min-width: 220px;">
                                        <div style="width: 44px; height: 44px; border-radius: 12px; background: #FAF7F4; border: 1.5px solid #E6DCCD; display: flex; align-items: center; justify-content: center; font-size: 22px;">
                                            ${s.icon}
                                        </div>
                                        <div>
                                            <div style="font-size: 15px; font-weight: 800; color: var(--text-dark);">${escapeHtml(item.name || s.title)}</div>
                                            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(s.subtitle)} • Alert below <strong>${thresh} ${unit}</strong></div>
                                        </div>
                                    </div>

                                    <div style="display: flex; align-items: center; gap: 16px;">
                                        <div style="text-align: right;">
                                            <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Leftover Current Stock</div>
                                            <div style="font-size: 20px; font-weight: 800; color: ${isOut ? '#DC2626' : (isLow ? '#D97706' : '#143832')};">
                                                ${stock} <span style="font-size: 13px; font-weight: 600;">${unit}</span>
                                            </div>
                                        </div>
                                        <div>
                                            ${statusBadge}
                                        </div>
                                    </div>

                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <button type="button" class="btn btn-outline" style="border-radius: 20px; font-size: 11px; padding: 6px 14px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.culinaryInventory.openItemAlertModal('${s.id}')">
                                            <span>🔔 Item Alert</span>
                                        </button>
                                        <button type="button" class="btn btn-success" style="border-radius: 20px; font-size: 11px; padding: 6px 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" onclick="window.culinaryInventory.openRestockModal('${s.id}')">
                                            <span>🛒 + Restock / Shop</span>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- SECTION 2: 🍽️ MENU DISHES RECIPE CONFIGURATOR (VERTICAL STACK) -->
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
                                    if (comp.type === 'sub_recipe') {
                                        pills.push(`<span class="rtr-recipe-pill">🍲 ${escapeHtml(comp.name || 'Gravy')}: ${comp.exact_quantity}L</span>`);
                                    } else if (comp.id === 'RM-OIL') {
                                        pills.push(`<span class="rtr-recipe-pill">🛢️ Oil: ${comp.exact_quantity}L</span>`);
                                    } else if (comp.id === 'RM-PANEER') {
                                        pills.push(`<span class="rtr-recipe-pill">🧀 Paneer: ${comp.exact_quantity}kg</span>`);
                                    } else if (comp.id === 'RM-CHICKEN') {
                                        pills.push(`<span class="rtr-recipe-pill">🍗 Chicken: ${comp.exact_quantity}kg</span>`);
                                    } else if (comp.id === 'RM-ONION') {
                                        pills.push(`<span class="rtr-recipe-pill">🧅 Veggies: ${comp.exact_quantity}kg</span>`);
                                    } else if (comp.id === 'RM-MAIDA') {
                                        pills.push(`<span class="rtr-recipe-pill">🌾 Flour: ${comp.exact_quantity}kg</span>`);
                                    } else if (comp.id === 'RM-BUTTER') {
                                        pills.push(`<span class="rtr-recipe-pill">🧈 Butter: ${comp.exact_quantity}kg</span>`);
                                    }
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
                                costHtml = `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Food Cost: <strong>₹${totalCost.toFixed(2)}</strong> • Margin: <strong style="color: #16A34A;">${marginPct}%</strong></div>`;
                            } else {
                                pillsHtml = `<span style="font-size: 12px; color: #D97706;">⚠️ Needs Recipe Mapping — Tap to configure portion quantities or ⚡ Approx Auto-Fill</span>`;
                            }

                            return `
                                <div class="rtr-dish-card" onclick="window.culinaryInventory.openDishRecipeModal('${dish.id}')">
                                    <div style="flex: 1; min-width: 240px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 15px; font-weight: 800; color: var(--text-dark);">${escapeHtml(dish.name)}</span>
                                            <span class="badge" style="background: #F1F5F9; color: #475569; font-size: 11px;">${escapeHtml(dish.category)}</span>
                                            <span style="font-size: 13px; font-weight: 800; color: #143832;">₹${dish.price}</span>
                                        </div>
                                        <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                                            ${pillsHtml}
                                        </div>
                                        ${costHtml}
                                    </div>

                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        ${isConfigured ? `
                                            <span class="badge" style="background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 800;">Configured ✅</span>
                                        ` : `
                                            <span class="badge" style="background: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 800;">Needs Recipe ⚠️</span>
                                        `}
                                        <button type="button" class="btn btn-outline" style="border-radius: 20px; font-size: 11px; padding: 6px 14px; font-weight: 700; pointer-events: none;">
                                            ⚙️ Configure
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
        document.getElementById('rtrDishPriceBadge').innerText = `₹${dish.price || 0}`;

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

        if (costDisplay) costDisplay.innerText = `₹${totalCost.toFixed(2)}`;
        if (profitDisplay) profitDisplay.innerText = `₹${profit.toFixed(2)}`;
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
        document.getElementById('rtrRestockTotalExpense').innerText = '₹0.00';

        modal.style.display = 'flex';
    }

    function recalcRestockTotal() {
        const qty = parseFloat(document.getElementById('rtrRestockQtyInput')?.value) || 0;
        const rate = parseFloat(document.getElementById('rtrRestockCostInput')?.value) || 0;
        const total = qty * rate;
        const display = document.getElementById('rtrRestockTotalExpense');
        if (display) display.innerText = `₹${total.toFixed(2)}`;
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

    // --- TAB 1: RAW MATERIALS & BAR LIQUID MATRIX ---
    function renderRawMaterialsTab(container) {
        const spirits = rawMaterials.filter(m => m.unit_type === 'spirit' || m.unit_type === 'draught_beer');
        const kitchenRaws = rawMaterials.filter(m => m.unit_type !== 'spirit' && m.unit_type !== 'draught_beer');

        container.innerHTML = `
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
                                    <span style="color: var(--text-muted);">Cost: ₹${s.cost_per_unit} / ${s.purchase_unit}</span>
                                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.promptRestock('${s.id}')">
                                        ➕ Restock Keg/Bottle
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Indian Culinary Raw Materials Grid -->
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #143832;">🥦 Kitchen Raw Materials & Bulk Ingredients</h3>
                        <p style="margin: 2px 0 0 0; font-size: 12px; color: var(--text-muted);">Direct purchase-to-consumption conversions with safety stock alerts</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-success" style="font-size: 12px; padding: 6px 14px; border-radius: 16px;" onclick="window.switchInventorySubTab('purchase_orders')">
                            🛒 Generate Vendor PO
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
                                    <span style="color: var(--text-muted);">Rate: <strong>₹${item.cost_per_unit} / ${item.purchase_unit}</strong></span>
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
                                        Unit Prep Cost: <strong style="color: #143832;">₹${sub.unit_production_cost || '130.00'} / ${sub.yield_unit}</strong>
                                    </div>
                                    <button class="btn btn-primary" style="padding: 7px 16px; font-size: 12px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.culinaryInventory.promptProduceBatch('${sub.id}', ${sub.yield_quantity})">
                                        👨‍🍳 Produce Batch
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
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                            <span>📊 Live Food Costing & Real-Time Margin Simulator</span>
                            <span class="badge" style="background: #E0E7FF; color: #4338CA; font-size: 11px;">Dynamic Cost Rollup</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Real-time dish margin calculation. Test supplier ingredient price fluctuations to see instant impact on gross margins.
                        </p>
                    </div>
                    <button class="btn btn-outline" style="border-radius: 20px; font-size: 12px; padding: 6px 14px;" onclick="window.culinaryInventory.refreshCosting()">
                        🔄 Recalculate Margins
                    </button>
                </div>

                <!-- Price Fluctuation Interactive Simulator -->
                <div class="card" style="padding: 16px; margin-bottom: 20px; background: linear-gradient(135deg, #143832 0%, #0D2622 100%); color: #FFFFFF; border-radius: 14px;">
                    <div style="font-size: 13px; font-weight: 800; color: #2DD4BF; text-transform: uppercase; margin-bottom: 6px;">
                        ⚡ Rapid Market Price Fluctuation Simulator
                    </div>
                    <p style="font-size: 12px; color: #E6DCCD; margin: 0 0 12px 0;">
                        Change market rates below to observe real-time gross margin recalculation across sub-recipes and finished menu dishes:
                    </p>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                        <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px; background: rgba(255,255,255,0.15); color: #FFF; border: 1px solid rgba(255,255,255,0.3);" onclick="window.culinaryInventory.simulateRateChange('RM-TOMATO', 90)">
                            🍅 Simulate Tomato Price Surge (₹40 ➔ ₹90/kg)
                        </button>
                        <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px; background: rgba(255,255,255,0.15); color: #FFF; border: 1px solid rgba(255,255,255,0.3);" onclick="window.culinaryInventory.simulateRateChange('RM-PANEER', 450)">
                            🧀 Simulate Dairy Paneer Hike (₹380 ➔ ₹450/kg)
                        </button>
                        <button class="btn btn-outline" style="font-size: 12px; padding: 6px 12px; color: #2DD4BF; border-color: #2DD4BF;" onclick="window.culinaryInventory.resetDefaultRates()">
                            ↺ Reset to Normal Market Rates
                        </button>
                    </div>
                </div>

                <!-- Costing Table -->
                <div class="card" style="padding: 0; overflow: hidden; border-radius: 12px; border: 1px solid var(--border);">
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                            <thead style="background: #FAF7F4; border-bottom: 2px solid #E6DCCD;">
                                <tr>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Dish / Beverage</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Category</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Selling Price</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Food Cost</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Gross Profit</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Margin %</th>
                                    <th style="padding: 12px 14px; font-weight: 800; color: #143832;">Health Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(costingReport && costingReport.length > 0 ? costingReport : getLocalCostingFallback()).map(c => {
                                    let badgeColor = '#10B981';
                                    let badgeBg = '#D1FAE5';
                                    let statusText = 'Optimal (≥65%)';

                                    if (c.gross_margin_pct < 50) {
                                        badgeColor = '#DC2626';
                                        badgeBg = '#FEE2E2';
                                        statusText = '⚠️ Squeeze Alert (<50%)';
                                    } else if (c.gross_margin_pct < 65) {
                                        badgeColor = '#D97706';
                                        badgeBg = '#FEF3C7';
                                        statusText = 'Moderate (50-65%)';
                                    }

                                    return `
                                        <tr style="border-bottom: 1px solid #F3F4F6;">
                                            <td style="padding: 12px 14px; font-weight: 700; color: var(--text-dark);">${escapeHtml(c.dish_name)}</td>
                                            <td style="padding: 12px 14px; color: var(--text-muted);">${escapeHtml(c.category)}</td>
                                            <td style="padding: 12px 14px; font-weight: 700;">₹${c.selling_price}</td>
                                            <td style="padding: 12px 14px; font-weight: 700; color: #DC2626;">₹${c.food_cost}</td>
                                            <td style="padding: 12px 14px; font-weight: 700; color: #047857;">₹${c.gross_profit}</td>
                                            <td style="padding: 12px 14px; font-weight: 800; font-size: 13px;">${c.gross_margin_pct}%</td>
                                            <td style="padding: 12px 14px;">
                                                <span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 3px 8px; border-radius: 12px;">
                                                    ${statusText}
                                                </span>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function getLocalCostingFallback() {
        return [
            { dish_name: 'Paneer Butter Masala', category: 'Main Course', selling_price: 280, food_cost: 95.5, gross_profit: 184.5, gross_margin_pct: 65.9 },
            { dish_name: 'Butter Chicken', category: 'Main Course', selling_price: 340, food_cost: 112.0, gross_profit: 228.0, gross_margin_pct: 67.1 },
            { dish_name: 'Dal Makhani', category: 'Main Course', selling_price: 220, food_cost: 45.2, gross_profit: 174.8, gross_margin_pct: 79.5 },
            { dish_name: 'Chicken Biryani', category: 'Biryani & Rice', selling_price: 280, food_cost: 88.0, gross_profit: 192.0, gross_margin_pct: 68.6 },
            { dish_name: 'Patiala Peg Whisky (60ml)', category: 'Bar & Spirits', selling_price: 380, food_cost: 208.0, gross_profit: 172.0, gross_margin_pct: 45.3 },
            { dish_name: 'German Wheat Craft Beer Mug (500ml)', category: 'Brewery & Draught', selling_price: 320, food_cost: 90.1, gross_profit: 229.9, gross_margin_pct: 71.8 }
        ];
    }

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
                                        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-radius: 12px;" onclick="window.culinaryInventory.receiveTransfer('${t.id}')">
                                            ✓ Mark Received
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
                            <span>📦 Purchase Order (PO) & Multi-Vendor Procurement</span>
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
                                        <span>• ${escapeHtml(i.name)} (${i.quantity} ${i.unit} @ ₹${i.unit_price})</span>
                                        <span style="font-weight: 600;">₹${i.line_total}</span>
                                    </div>
                                `).join('')}
                                <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #E6DCCD; font-weight: 800; color: #143832;">
                                    <span>Total PO Value:</span>
                                    <span>₹${po.total}</span>
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
                        <div style="font-size: 18px; font-weight: 800; color: #DC2626; margin-top: 4px;">₹${wastage.total_loss_inr || 0}</div>
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
                            <span>⏱️ 15-Minute Rapid Stock-Take Audit</span>
                            <span class="badge" style="background: #FEF3C7; color: #D97706; font-size: 11px;">High-Speed Reconciliation</span>
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-muted);">
                            Rapid count verification. Enables total stock-keeping procedures to be completed in under 15 minutes.
                        </p>
                    </div>
                    <button class="btn btn-success" style="font-size: 12px; padding: 6px 16px; border-radius: 16px;" onclick="window.culinaryInventory.submitAudit()">
                        ✓ Reconcile & Update All Stock
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
        try {
            const res = await fetch('/api/inventory/raw-materials/price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ materialId, price: newPrice })
            }).then(r => r.json());

            if (res && res.success) {
                if (typeof showToast === 'function') showToast(`✓ Updated ${res.name} to ₹${newPrice}. Margins recalculated!`);
                loadAllInventoryData();
            }
        } catch (e) {
            const item = rawMaterials.find(m => m.id === materialId);
            if (item) item.cost_per_unit = newPrice;
            persistLocalSnapshot();
            if (typeof showToast === 'function') showToast(`✓ Simulated rate update for ${materialId}.`);
            renderActiveSubTab();
        }
    }

    async function resetDefaultRates() {
        await simulateRateChange('RM-TOMATO', 40);
        await simulateRateChange('RM-PANEER', 380);
        if (typeof showToast === 'function') showToast('✓ Reset rates to standard baseline.');
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

                if (rec && Array.isArray(rec.components)) {
                    rec.components.forEach(comp => {
                        if (comp.type === 'sub_recipe') {
                            const sub = subRecipes.find(s => s.id === comp.id);
                            if (sub) {
                                sub.current_stock = Math.max(0, Math.round((sub.current_stock - (comp.exact_quantity * qty)) * 100) / 100);
                            }
                        } else {
                            const rm = rawMaterials.find(m => m.id === comp.id);
                            if (rm) {
                                rm.current_stock = Math.max(0, Math.round((rm.current_stock - (comp.exact_quantity * qty)) * 100) / 100);
                            }
                        }
                    });
                } else {
                    // Fallback core staple deduction
                    if (dishName.includes('paneer')) {
                        const p = rawMaterials.find(m => m.id === 'RM-PANEER'); if (p) p.current_stock = Math.max(0, Math.round((p.current_stock - 0.15 * qty) * 100) / 100);
                        const o = rawMaterials.find(m => m.id === 'RM-OIL'); if (o) o.current_stock = Math.max(0, Math.round((o.current_stock - 0.02 * qty) * 100) / 100);
                        const s = subRecipes.find(sub => sub.id === 'SUB-MAK-01'); if (s) s.current_stock = Math.max(0, Math.round((s.current_stock - 0.20 * qty) * 100) / 100);
                    } else if (dishName.includes('chicken')) {
                        const c = rawMaterials.find(m => m.id === 'RM-CHICKEN'); if (c) c.current_stock = Math.max(0, Math.round((c.current_stock - 0.20 * qty) * 100) / 100);
                        const o = rawMaterials.find(m => m.id === 'RM-OIL'); if (o) o.current_stock = Math.max(0, Math.round((o.current_stock - 0.02 * qty) * 100) / 100);
                        const s = subRecipes.find(sub => sub.id === 'SUB-BROWN-01'); if (s) s.current_stock = Math.max(0, Math.round((s.current_stock - 0.22 * qty) * 100) / 100);
                    } else if (dishName.includes('roll') || dishName.includes('roti') || dishName.includes('naan')) {
                        const f = rawMaterials.find(m => m.id === 'RM-MAIDA'); if (f) f.current_stock = Math.max(0, Math.round((f.current_stock - 0.08 * qty) * 100) / 100);
                        const o = rawMaterials.find(m => m.id === 'RM-OIL'); if (o) o.current_stock = Math.max(0, Math.round((o.current_stock - 0.02 * qty) * 100) / 100);
                    }
                }
            });

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

    // Public API
    window.culinaryInventory = {
        init: loadAllInventoryData,
        switchSubTab: switchInventorySubTab,
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
        getAllMenuDishes
    };

    // Auto-init on load
    document.addEventListener('DOMContentLoaded', () => {
        loadAllInventoryData();
    });

})();
