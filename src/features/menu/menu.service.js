/**
 * src/features/menu/menu.service.js
 * Menu & Catalog Management Service for Billnaw Cafe POS.
 * Handles menu items, categories, pricing in integer paise, and curated dish visual variations.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';
import { rupeesToPaise, paiseToRupees } from '../../shared/utils/currency.js';

export const MENU_CATEGORIES = [
  'All',
  'Beverages',
  'Fast Food',
  'Snacks',
  'Main Course',
  'Desserts',
  'Bakery',
  'Breakfast'
];

/**
 * Fetch all menu items for the cafe tenant.
 * @param {string} [category='All']
 * @returns {Promise<{ data: Array<Object>, error: string|null, offlineQueued: boolean }>}
 */
export async function getMenuItems(category = 'All') {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.collection(`cafes/${cafeId}/menu_items`).get();

    let items = [];
    if (!snap.empty) {
      snap.forEach(doc => {
        const d = doc.data();
        // Filter database queries to display only active, user-created items rather than pre-populated template data
        if (d && !d.is_template && d.source !== 'template' && d.is_active !== false && d.is_available !== false) {
          items.push({ id: doc.id, ...d });
        }
      });
    } else {
      // Local dev fallback
      items = getDefaultMenuItems().filter(it => !it.is_template && it.source !== 'template' && it.is_available !== false && it.is_active !== false);
    }

    if (category && category !== 'All') {
      items = items.filter(it => it.category?.toLowerCase() === category.toLowerCase());
    }

    return items;
  });
}

/**
 * Save or update a menu item.
 * Guarantees prices are stored in integer paise.
 * @param {Object} itemData
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function saveMenuItem(itemData) {
  return safeExecute(async () => {
    if (!itemData.name || itemData.name.trim().length === 0) {
      throw new Error('Menu item name is required.');
    }

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const itemId = itemData.id || `item_${Date.now()}`;

    // Normalize price to integer paise
    const pricePaise = itemData.price_paise !== undefined 
      ? Number(itemData.price_paise) 
      : rupeesToPaise(itemData.price || 0);

    const docPayload = {
      id: itemId,
      name: itemData.name.trim(),
      category: itemData.category || 'General',
      price_paise: pricePaise,
      price: paiseToRupees(pricePaise),
      gst_rate: Number(itemData.gst_rate ?? 5),
      hsn_code: itemData.hsn_code || '996331',
      is_available: itemData.is_available !== false,
      is_active: itemData.is_active !== false,
      is_user_created: true,
      is_template: false,
      image_url: itemData.image_url || '',
      variation_idx: itemData.variation_idx || 0,
      recipe_id: itemData.recipe_id || null,
      updated_at: new Date().toISOString()
    };

    const itemRef = db.doc(`cafes/${cafeId}/menu_items/${itemId}`);
    await itemRef.set(docPayload, { merge: true });

    return docPayload;
  });
}

/**
 * Toggle item active / out-of-stock availability.
 * @param {string} itemId 
 * @param {boolean} isAvailable 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function toggleItemAvailability(itemId, isAvailable) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const itemRef = db.doc(`cafes/${cafeId}/menu_items/${itemId}`);

    const updateData = {
      is_available: !!isAvailable,
      updated_at: new Date().toISOString()
    };

    await itemRef.update(updateData);
    return { id: itemId, ...updateData };
  });
}

function getDefaultMenuItems() {
  return [
    {
      id: 'item_samosa',
      name: 'Samosa',
      category: 'Snacks',
      price_paise: 2000,
      price: 20,
      gst_rate: 5,
      hsn_code: '996331',
      is_available: true,
      is_active: true,
      is_user_created: true,
      is_template: false,
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'item_tea',
      name: 'Tea',
      category: 'Beverages',
      price_paise: 1500,
      price: 15,
      gst_rate: 5,
      hsn_code: '996331',
      is_available: true,
      is_active: true,
      is_user_created: true,
      is_template: false,
      image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'item_chicken_curry',
      name: 'Chicken Curry',
      category: 'Main Course',
      price_paise: 18000,
      price: 180,
      gst_rate: 5,
      hsn_code: '996331',
      is_available: true,
      is_active: true,
      is_user_created: true,
      is_template: false,
      image_url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80'
    }
  ];
}
