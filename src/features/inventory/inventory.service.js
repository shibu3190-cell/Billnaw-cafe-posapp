/**
 * src/features/inventory/inventory.service.js
 * Commissary Raw Materials, Recipe Portioning & Food Costing Service for Billnaw Cafe POS.
 * Connects directly with atomic bill settlement for live ingredient stock deduction.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';
import { paiseToRupees } from '../../shared/utils/currency.js';

/**
 * Fetch all commissary raw materials with current stock levels.
 * @returns {Promise<{ data: Array<Object>, error: string|null, offlineQueued: boolean }>}
 */
export async function getRawMaterials() {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.collection(`cafes/${cafeId}/raw_materials`).get();

    const defaults = getDefaultRawMaterials();
    if (snap.empty) {
      return defaults;
    }

    const storedMap = new Map();
    snap.forEach(doc => storedMap.set(doc.id, doc.data()));

    const merged = defaults.map(m => {
      const stored = storedMap.get(m.id);
      return stored ? { ...m, ...stored } : m;
    });

    for (const [id, data] of storedMap.entries()) {
      if (!defaults.some(m => m.id === id)) {
        merged.push({ id, ...data });
      }
    }

    return merged;
  });
}

/**
 * Save or update a raw material.
 * @param {Object} matData
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function saveRawMaterial(matData) {
  return safeExecute(async () => {
    if (!matData.name) throw new Error('Raw material name is required.');

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const matId = matData.id || `mat_${Date.now()}`;

    const payload = {
      id: matId,
      name: matData.name.trim(),
      unit: matData.unit || 'g', // g, ml, pcs, kg, l
      current_stock: Number(matData.current_stock || 0),
      low_stock_threshold: Number(matData.low_stock_threshold || 10),
      cost_per_unit_paise: Number(matData.cost_per_unit_paise || 0),
      updated_at: new Date().toISOString()
    };

    const matRef = db.doc(`cafes/${cafeId}/raw_materials/${matId}`);
    await matRef.set(payload, { merge: true });
    return payload;
  });
}

/**
 * Record a manual stock adjustment or incoming delivery with audit notes.
 * @param {string} materialId 
 * @param {number} qtyDelta Positive for restock, negative for wastage/spillage
 * @param {string} reason 
 * @param {string} staffId 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function recordStockAdjustment(materialId, qtyDelta, reason, staffId) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const now = new Date().toISOString();

    const batch = db.createBatch();

    // 1. Update material stock
    const matRef = db.doc(`cafes/${cafeId}/raw_materials/${materialId}`);
    batch.update(matRef, {
      current_stock: db.increment(Number(qtyDelta)),
      updated_at: now
    });

    // 2. Append audit ledger entry
    const logId = `log_${Date.now()}`;
    const logRef = db.doc(`cafes/${cafeId}/stock_logs/${logId}`);
    batch.set(logRef, {
      id: logId,
      material_id: materialId,
      qty_delta: Number(qtyDelta),
      reason: reason || 'Adjustment',
      staff_id: staffId || 'staff',
      timestamp: now
    });

    await batch.commit();
    return { materialId, qtyDelta, reason };
  });
}

/**
 * Fetch recipe ingredients for a dish.
 * @param {string} dishId 
 * @returns {Promise<{ data: Array<{ material_id: string, name: string, quantity: number, unit: string }>, error: string|null, offlineQueued: boolean }>}
 */
export async function getDishRecipe(dishId) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const recipeRef = db.doc(`cafes/${cafeId}/recipes/${dishId}`);
    const snap = await recipeRef.get();

    if (snap.exists) {
      return snap.data().ingredients || [];
    }
    return getDefaultRecipes()[dishId] || [];
  });
}

/**
 * Calculate live dish food cost and profit margin.
 * @param {string} dishId 
 * @param {number} sellingPricePaise 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function calculateDishFoodCost(dishId, sellingPricePaise = 0) {
  return safeExecute(async () => {
    const { data: ingredients } = await getDishRecipe(dishId);
    const { data: materials } = await getRawMaterials();

    const matMap = new Map((materials || []).map(m => [m.id, m]));
    let totalCostPaise = 0;

    const breakdown = (ingredients || []).map(ing => {
      const mat = matMap.get(ing.material_id);
      const unitCost = mat?.cost_per_unit_paise || 0;
      const ingCostPaise = Math.round(unitCost * Number(ing.quantity || 0));
      totalCostPaise += ingCostPaise;
      return {
        material_name: ing.name || mat?.name || ing.material_id,
        quantity: ing.quantity,
        unit: ing.unit,
        cost_paise: ingCostPaise,
        cost_rupees: paiseToRupees(ingCostPaise)
      };
    });

    const profitPaise = Math.max(0, sellingPricePaise - totalCostPaise);
    const marginPct = sellingPricePaise > 0 
      ? Math.round((profitPaise / sellingPricePaise) * 100) 
      : 0;

    return {
      dish_id: dishId,
      total_cost_paise: totalCostPaise,
      total_cost_rupees: paiseToRupees(totalCostPaise),
      selling_price_paise: sellingPricePaise,
      profit_margin_percent: marginPct,
      ingredients: breakdown
    };
  });
}

function getDefaultRawMaterials() {
  return [
    { id: 'mat_potato', name: 'Potatoes', unit: 'kg', current_stock: 45, low_stock_threshold: 10, cost_per_unit_paise: 2500 },
    { id: 'mat_flour', name: 'Refined Flour (Maida)', unit: 'kg', current_stock: 30, low_stock_threshold: 8, cost_per_unit_paise: 3800 },
    { id: 'mat_oil', name: 'Cooking Oil', unit: 'l', current_stock: 20, low_stock_threshold: 5, cost_per_unit_paise: 12000 },
    { id: 'mat_tea_leaves', name: 'Assam Tea Leaves', unit: 'kg', current_stock: 12, low_stock_threshold: 2, cost_per_unit_paise: 32000 },
    { id: 'mat_milk', name: 'Full Cream Milk', unit: 'l', current_stock: 25, low_stock_threshold: 5, cost_per_unit_paise: 6400 }
  ];
}

function getDefaultRecipes() {
  return {
    item_samosa: [
      { material_id: 'mat_flour', name: 'Refined Flour', quantity: 0.05, unit: 'kg' },
      { material_id: 'mat_potato', name: 'Potatoes', quantity: 0.08, unit: 'kg' },
      { material_id: 'mat_oil', name: 'Cooking Oil', quantity: 0.015, unit: 'l' }
    ],
    item_tea: [
      { material_id: 'mat_tea_leaves', name: 'Tea Leaves', quantity: 0.01, unit: 'kg' },
      { material_id: 'mat_milk', name: 'Milk', quantity: 0.1, unit: 'l' }
    ]
  };
}
