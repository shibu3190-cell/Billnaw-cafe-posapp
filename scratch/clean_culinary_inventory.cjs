const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'js', 'culinary_inventory.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace hardcoded seed arrays
const seedStart = "    // 10 Matched Ingredients Strictly Required by the 4 Dishes";
const seedEnd = "    // Load initial state from backend or local fallback";

const cleanSeedBlock = `    // Clean initial arrays - strictly zero pre-loaded dummy seed data (pure user-created inventory only)
    const MATCHED_RAW_MATERIALS_IDS = [];
    const DEFAULT_LOCAL_MATERIALS = [];
    const DEFAULT_LOCAL_RECIPES = [];
    const DEFAULT_LOCAL_SUB_RECIPES = [];

`;

const startIdx = content.indexOf(seedStart);
const endIdx = content.indexOf(seedEnd);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + cleanSeedBlock + content.substring(endIdx);
    console.log('SUCCESS: Purged hardcoded seed arrays from culinary_inventory.js');
} else {
    console.error('ERROR: Could not locate seed arrays block', { startIdx, endIdx });
}

// 2. Clean fallback loaders in loadAllInventoryData
content = content.replace(
    "rawMaterials = matRes.materials;\n            else rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || 'null') || DEFAULT_LOCAL_MATERIALS;",
    "rawMaterials = matRes.materials;\n            else rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || '[]');"
);
content = content.replace(
    "subRecipes = subRes.sub_recipes;\n            else subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || 'null') || DEFAULT_LOCAL_SUB_RECIPES;",
    "subRecipes = subRes.sub_recipes;\n            else subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || '[]');"
);
content = content.replace(
    "rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || 'null') || DEFAULT_LOCAL_MATERIALS;",
    "rawMaterials = JSON.parse(localStorage.getItem('billnaw_culinary_materials') || '[]');"
);
content = content.replace(
    "subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || 'null') || DEFAULT_LOCAL_SUB_RECIPES;",
    "subRecipes = JSON.parse(localStorage.getItem('billnaw_culinary_subs') || '[]');"
);

// 3. Add clean empty state to renderRawStockTab
const rawStockTarget = "        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabRawStock');\n        if (!targetContainer) return;";
const rawStockEmptyBlock = `        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabRawStock');
        if (!targetContainer) return;

        if (rawMaterials.length === 0) {
            targetContainer.innerHTML = \`
                <div class="empty-inventory-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No inventory items added yet</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Start tracking raw ingredients, pantry supplies, and packaging. Click below to record your first purchase or restock.
                    </p>
                    <button type="button" class="btn btn-primary" onclick="openRestockExpenseModal()" style="padding: 9px 18px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>+ Quick Restock / Purchase</span>
                    </button>
                </div>
            \`;
            return;
        }`;

if (content.includes(rawStockTarget)) {
    content = content.replace(rawStockTarget, rawStockEmptyBlock);
    console.log('SUCCESS: Injected raw stock empty state');
}

// 4. Add clean empty state to renderMorningPrepTab
const prepTarget = "        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabMorningPrep');\n        if (!targetContainer) return;";
const prepEmptyBlock = `        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabMorningPrep');
        if (!targetContainer) return;

        if (subRecipes.length === 0) {
            targetContainer.innerHTML = \`
                <div class="empty-prep-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c2 4 4 6 4 9a4 4 0 0 1-8 0c0-3 2-5 4-9z"/><path d="M4 14h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No morning prep batches configured</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Configure daily bulk bases, sauces, gravies, or prep batches to streamline kitchen operations and stock deductions.
                    </p>
                </div>
            \`;
            return;
        }`;

if (content.includes(prepTarget)) {
    content = content.replace(prepTarget, prepEmptyBlock);
    console.log('SUCCESS: Injected morning prep empty state');
}

// 5. Add clean empty state to renderDishCostingTab
const costingTarget = "        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabDishCosting');\n        if (!targetContainer) return;";
const costingEmptyBlock = `        const targetContainer = (container && container.nodeType) ? container : document.getElementById('invTabDishCosting');
        if (!targetContainer) return;

        if (recipes.length === 0) {
            targetContainer.innerHTML = \`
                <div class="empty-recipe-state" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1.5px dashed var(--border); border-radius: 16px; margin: 20px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(74, 51, 42, 0.06); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin: 0 0 6px 0;">No dish recipes configured</h3>
                    <p style="font-size: 12px; color: var(--text-muted); max-width: 380px; margin: 0 auto 18px auto; line-height: 1.5;">
                        Map your menu items to raw ingredients or prep batches to calculate live food cost and automate ingredient deductions.
                    </p>
                </div>
            \`;
            return;
        }`;

if (content.includes(costingTarget)) {
    content = content.replace(costingTarget, costingEmptyBlock);
    console.log('SUCCESS: Injected dish costing empty state');
}

// 6. Fix Rupee symbol spacing across culinary_inventory.js
content = content.replace(/₹(\d|\${)/g, '₹ $1');

fs.writeFileSync(filePath, content, 'utf8');
console.log('SUCCESS: culinary_inventory.js updated successfully');
