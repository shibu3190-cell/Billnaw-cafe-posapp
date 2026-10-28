// scratch/update_render_tabs.cjs - Update renderRawStockTab & renderDishCostingTab with split layout, checklist & modals
const fs = require('fs');
const path = require('path');

const culPath = path.join(__dirname, '..', 'js', 'culinary_inventory.js');
let code = fs.readFileSync(culPath, 'utf8');

// Target start of renderRawStockTab
const fnStartAnchor = '    // --- TAB 1: RAW STOCK & RESTOCK TELEMETRY ---\n    function renderRawStockTab(container) {';
const fnEndAnchor = '    window.renderRawStockTab = renderRawStockTab;';

const startIdx = code.indexOf(fnStartAnchor);
const endIdx = code.indexOf(fnEndAnchor);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not locate renderRawStockTab bounds in js/culinary_inventory.js');
    process.exit(1);
}

const newRenderRawStock = `    // --- TAB 1: RAW STOCK & RESTOCK TELEMETRY ---
    function renderRawStockTab(container) {
        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabRawStock');
        if (!targetContainer) return;

        if (rawMaterials.length === 0) {
            targetContainer.innerHTML = \`
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
            \`;
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

        targetContainer.innerHTML = \`
            <div class="inv-desktop-split-layout">
                <!-- LEFT COLUMN: Main Data Table & Filtering -->
                <div class="inv-main-content">
                    <!-- Category Chips & Search Bar -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                            \${[
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
                            ].map(c => \`
                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.filterRawStockCategory('\${c.id}')" style="font-size: 11px; padding: 5px 12px; border-radius: 20px; font-weight: 700; \${activeCat === c.id ? 'background: #143832; color: #FFFFFF; border-color: #143832;' : 'background: #FFFFFF; color: #475569; border-color: #CBD5E1;'}">
                                    \${c.label}
                                </button>
                            \`).join('')}
                        </div>
                        <div style="position: relative; min-width: 220px; flex: 1; max-width: 320px;">
                            <div style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94A3B8;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            </div>
                            <input type="text" id="rawStockSearchInput" value="\${escapeHtml(rawStockSearchQuery)}" oninput="window.culinaryInventory.filterRawStock(this.value)" placeholder="Search raw materials, suppliers..." style="width: 100%; padding: 7px 12px 7px 32px; font-size: 12px; border-radius: 20px; border: 1.5px solid #CBD5E1; background: #FFFFFF; outline: none; box-sizing: border-box;">
                        </div>
                    </div>

                    \${showSpirits ? \`
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
                            \${spirits.map(s => {
                                const isBeer = s.unit_type === 'draught_beer';
                                const totalMl = s.conversion_factor || 1000;
                                const pct = Math.min(100, Math.round((s.current_stock / totalMl) * 100));
                                const gaugeColor = pct < 25 ? '#EF4444' : (pct < 50 ? '#F59E0B' : '#10B981');
                                return \`
                                    <div class="card" style="padding: 14px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 12px;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: \${isBeer ? '#D97706' : '#6B21A8'}; background: \${isBeer ? '#FEF3C7' : '#F3E8FF'}; padding: 2px 7px; border-radius: 8px;">
                                                    \${isBeer ? 'Draught Keg' : 'Spirit 750ml'}
                                                </span>
                                                <div style="font-size: 13px; font-weight: 800; color: var(--text-dark); margin-top: 3px;">\${escapeHtml(s.name)}</div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 15px; font-weight: 800; color: #143832;">\${s.current_stock} <span style="font-size: 10px;">ml</span></div>
                                                <div style="font-size: 10px; color: var(--text-muted);">\${(s.current_stock / 1000).toFixed(2)}L left</div>
                                            </div>
                                        </div>
                                        <div style="background: #F1F5F9; height: 8px; border-radius: 4px; overflow: hidden; margin: 8px 0 6px 0;">
                                            <div style="width: \${pct}%; height: 100%; background: \${gaugeColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-muted);">
                                            <span>\${pct}% Remaining</span>
                                            <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openRestockModal('\${s.id}')" style="padding: 2px 8px; font-size: 10px; border-radius: 10px;">+ Restock</button>
                                        </div>
                                    </div>
                                \`;
                            }).join('')}
                        </div>
                    </div>
                    \` : ''}

                    <!-- High-Contrast Raw Stock Telemetry Table -->
                    <div class="inv-telemetry-container">
                        <div style="padding: 14px 18px; border-bottom: 1.5px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: #FFFFFF;">
                            <div>
                                <div style="font-size: 15px; font-weight: 800; color: #143832; display: flex; align-items: center; gap: 8px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                    <span>Raw Materials Inventory</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                    Showing \${filteredMaterials.length} materials • Safety reorder threshold active
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                \${outCount > 0 ? \`<span class="inv-badge-out" style="padding: 4px 10px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> \${outCount} Out</span>\` : ''}
                                \${lowStockCount > 0 ? \`<span class="inv-badge-low" style="padding: 4px 10px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> \${lowStockCount} Low</span>\` : ''}
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
                                    \${filteredMaterials.length === 0 ? \`
                                        <tr>
                                            <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">
                                                No ingredients match current search or category filter.
                                            </td>
                                        </tr>
                                    \` : filteredMaterials.map(item => {
                                        const isOut = item.current_stock <= 0;
                                        const isLow = !isOut && item.current_stock <= item.min_threshold;
                                        const badgeHtml = isOut
                                            ? \`<span class="inv-badge-out"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Out</span>\`
                                            : (isLow
                                                ? \`<span class="inv-badge-low"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Low</span>\`
                                                : \`<span class="inv-badge-instock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> In Stock</span>\`);

                                        const stockColor = isOut ? '#DC2626' : (isLow ? '#D97706' : '#143832');
                                        const unitLabel = item.consumption_unit || item.purchase_unit || 'units';

                                        const maxCap = Math.max(item.min_threshold * 2.5, item.current_stock, 1);
                                        const stockPct = Math.min(100, Math.round((item.current_stock / maxCap) * 100));
                                        const barColor = isOut ? '#DC2626' : (isLow ? '#F59E0B' : '#10B981');

                                        return \`
                                            <tr>
                                                <td>
                                                    <div style="font-weight: 800; color: var(--text-dark); font-size: 13.5px;">\${escapeHtml(item.name)}</div>
                                                    <div style="font-size: 11px; color: #64748B;">\${escapeHtml(item.category || 'General')} • <span style="font-family: monospace;">\${escapeHtml(item.id)}</span></div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 15px; font-weight: 800; color: \${stockColor};">
                                                        \${item.current_stock} <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">\${escapeHtml(unitLabel)}</span>
                                                    </div>
                                                    <div class="inv-stock-progress-wrap" title="\${stockPct}% of standard capacity">
                                                        <div class="inv-stock-progress-bar" style="width: \${stockPct}%; background: \${barColor};"></div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12px; font-weight: 600; color: #475569;">
                                                        \${item.min_threshold} <span style="font-size: 10.5px; color: var(--text-muted);">\${escapeHtml(unitLabel)}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12.5px; font-weight: 700; color: #0F172A;">
                                                        ₹ \${item.cost_per_unit} <span style="font-size: 10px; color: var(--text-muted);">/ \${escapeHtml(item.purchase_unit || unitLabel)}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-size: 12px; font-weight: 600; color: #334155;">\${escapeHtml(item.supplier || 'Mandi Wholesale')}</div>
                                                </td>
                                                <td>
                                                    \${badgeHtml}
                                                </td>
                                                <td style="text-align: right;">
                                                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                                                        <button type="button" class="btn btn-primary" onclick="window.culinaryInventory.openRestockModal('\${item.id}')" style="font-size: 11px; padding: 5px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                            <span>Restock</span>
                                                        </button>
                                                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.promptPriceEdit('\${item.id}')" style="font-size: 11px; padding: 5px 9px; border-radius: 12px;" title="Edit Purchase Rate">
                                                            <span>Rate</span>
                                                        </button>
                                                        <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.openItemAlertModal('\${item.id}')" style="font-size: 11px; padding: 5px 9px; border-radius: 12px;" title="Set Safety Threshold">
                                                            <span>Min</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        \`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Mobile Touch Card List (visible on screens < 768px) -->
                        <div class="inv-stock-cards-grid">
                            \${filteredMaterials.map(item => {
                                const isOut = item.current_stock <= 0;
                                const isLow = !isOut && item.current_stock <= item.min_threshold;
                                const cardClass = isOut ? 'card-out' : (isLow ? 'card-low' : 'card-instock');
                                const isExpanded = expandedItemRowIds.has(item.id);
                                const expandedClass = isExpanded ? ' expanded' : '';

                                const badgeHtml = isOut
                                    ? \`<span class="inv-badge-out"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> <span class="badge-text">Out of Stock</span></span>\`
                                    : (isLow
                                        ? \`<span class="inv-badge-low"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span class="badge-text">Low Stock</span></span>\`
                                        : \`<span class="inv-badge-instock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> <span class="badge-text">In Stock</span></span>\`);

                                const stockColor = isOut ? '#DC2626' : (isLow ? '#D97706' : '#143832');
                                const unitLabel = item.consumption_unit || item.purchase_unit || 'units';

                                return \`
                                    <div class="inv-stock-card \${cardClass}\${expandedClass}" id="invItem-\${item.id}" data-item-id="\${item.id}">
                                        <div class="inv-row-master" onclick="window.culinaryInventory.toggleItemRow('\${item.id}', event)" role="button" tabindex="0">
                                            <div class="inv-master-left">
                                                <h4 class="inv-card-name">\${escapeHtml(item.name)}</h4>
                                            </div>
                                            <div class="inv-master-right">
                                                <div class="inv-master-stock inv-stock-qty-chip">
                                                    <span class="inv-stock-qty" style="color: \${stockColor};">\${item.current_stock}</span>
                                                    <span class="inv-stock-unit">\${escapeHtml(unitLabel)}</span>
                                                </div>
                                                <div class="inv-master-badge">\${badgeHtml}</div>
                                                <div class="inv-row-chevron">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="inv-row-drawer" id="invDrawer-\${item.id}">
                                            <div class="inv-drawer-inner">
                                                <div class="inv-card-meta">
                                                    <span>\${escapeHtml(item.category || 'General')}</span>
                                                    <span class="inv-card-sep">•</span>
                                                    <span>\${escapeHtml(item.supplier || 'Mandi Wholesale')}</span>
                                                </div>
                                                <div class="inv-card-levels-stacked" style="margin: 8px 0;">
                                                    <div class="inv-level-row">
                                                        <span>Safety Min:</span>
                                                        <strong>\${item.min_threshold} \${escapeHtml(unitLabel)}</strong>
                                                    </div>
                                                    <div class="inv-level-row">
                                                        <span>Rate:</span>
                                                        <strong>₹ \${item.cost_per_unit} / \${escapeHtml(item.purchase_unit || unitLabel)}</strong>
                                                    </div>
                                                </div>
                                                <div class="inv-card-actions" style="display: flex; gap: 8px;">
                                                    <button type="button" class="btn btn-primary" onclick="event.stopPropagation(); window.culinaryInventory.openRestockModal('\${item.id}')" style="font-size: 11px; padding: 6px 12px; border-radius: 10px;">+ Restock</button>
                                                    <button type="button" class="btn btn-outline" onclick="event.stopPropagation(); window.culinaryInventory.promptPriceEdit('\${item.id}')" style="font-size: 11px; padding: 6px 10px; border-radius: 10px;">Rate</button>
                                                    <button type="button" class="btn btn-outline" onclick="event.stopPropagation(); window.culinaryInventory.openItemAlertModal('\${item.id}')" style="font-size: 11px; padding: 6px 10px; border-radius: 10px;">Min</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                \`;
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
                                \${todayPrepCount}/\${subRecipes.length} Done
                            </span>
                        </div>

                        <!-- Progress Bar -->
                        <div style="background: #F1F5F9; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 14px;">
                            <div style="width: \${prepPercent}%; height: 100%; background: #10B981; border-radius: 4px; transition: width 0.3s ease;"></div>
                        </div>

                        <!-- Checklist Items -->
                        <div style="max-height: 260px; overflow-y: auto;">
                            \${subRecipes.length === 0 ? \`
                                <div style="font-size: 11.5px; color: var(--text-muted); text-align: center; padding: 16px;">
                                    No prep bases configured yet.
                                </div>
                            \` : subRecipes.slice(0, 6).map(sub => {
                                const isDone = commissaryBatchHistory.some(b => b.subRecipeId === sub.id && b.date === 'Today');
                                return \`
                                    <div class="inv-prep-task-item \${isDone ? 'completed' : ''}">
                                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                            <span style="color: \${isDone ? '#10B981' : '#CBD5E1'}; flex-shrink: 0;">
                                                \${isDone ? \`
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                \` : \`
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                                                \`}
                                            </span>
                                            <div style="min-width: 0;">
                                                <div class="inv-prep-task-name" style="font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    \${escapeHtml(sub.name)}
                                                </div>
                                                <div style="font-size: 10.5px; color: var(--text-muted);">
                                                    Target: \${sub.yield_quantity} \${escapeHtml(sub.yield_unit)} • Stock: \${sub.current_stock} \${escapeHtml(sub.yield_unit)}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            \${isDone ? \`
                                                <span style="font-size: 10px; font-weight: 700; color: #166534; background: #DCFCE7; padding: 2px 6px; border-radius: 6px;">Done</span>
                                            \` : \`
                                                <button type="button" class="btn btn-outline" onclick="window.culinaryInventory.produceMorningBatch('\${sub.id}', 1.0)" style="font-size: 10px; padding: 3px 8px; border-radius: 8px; font-weight: 700;">
                                                    Prep
                                                </button>
                                            \`}
                                        </div>
                                    </div>
                                \`;
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
                        <div style="font-size: 20px; font-weight: 800; color: #143832; margin-top: 4px;">\${todayPrepCount} Batches Prepared</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">\${prepPercent}% of daily commissary targets</div>
                        <div style="margin-top: 10px;">
                            <button type="button" class="btn btn-outline" onclick="switchInventoryHubTab('morning_batch')" style="width: 100%; font-size: 11px; padding: 6px; border-radius: 10px;">
                                View Batch History Log
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        \`;
    }`;

code = code.slice(0, startIdx) + newRenderRawStock + '\n' + code.slice(endIdx);

fs.writeFileSync(culPath, code, 'utf8');
console.log('Successfully updated renderRawStockTab with split layout!');
