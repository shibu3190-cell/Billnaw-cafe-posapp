// server/inventory-service.js - Production-Grade Restaurant Inventory & Indian Culinary Logic Engine
// Supports Nested Sub-Recipe Batching, Morning Commissary Production, Bar Liquid Telemetry (Exact Pegs & Draft Beer Froth Buffering),
// Dynamic Food Costing & Margin Recalculation, Central Kitchen Inter-Outlet Transfers, PO Management, and Predictive Forecasting.

// ==========================================
// 1. DATA REPOSITORIES (In-Memory with Defaults)
// ==========================================

const DEFAULT_RAW_MATERIALS = [
  // 10 Matched Ingredients for the 4 Menu Dishes
  { id: 'RM-OIL', name: 'Refined Cooking Oil', category: 'Pantry', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 40.0, min_threshold: 5.0, cost_per_unit: 135, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-MAIDA', name: 'Wheat Flour / Maida', category: 'Grains', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 35.0, min_threshold: 5.0, cost_per_unit: 45, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-POTATO', name: 'Spiced Potatoes', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 25.0, min_threshold: 5.0, cost_per_unit: 30, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
  { id: 'RM-MILK', name: 'Fresh Cow Milk', category: 'Dairy', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 40.0, min_threshold: 5.0, cost_per_unit: 64, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
  { id: 'RM-TEA-LEAVES', name: 'CTC Tea Leaves', category: 'Beverages', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 10.0, min_threshold: 1.0, cost_per_unit: 380, supplier: 'Assam Tea Direct', unit_type: 'raw' },
  { id: 'RM-SUGAR', name: 'Granulated Sugar', category: 'Pantry', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 10.0, min_threshold: 2.0, cost_per_unit: 44, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-POULTRY', name: 'Fresh Farm Poultry', category: 'Meat', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 30.0, min_threshold: 4.0, cost_per_unit: 240, supplier: 'Farm Fresh Poultry', unit_type: 'raw' },
  { id: 'RM-CHICKEN', name: 'Fresh Farm Chicken (Curry Cut/Boneless)', category: 'Meat', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 30.0, min_threshold: 4.0, cost_per_unit: 240, supplier: 'Farm Fresh Poultry', unit_type: 'raw' },
  { id: 'RM-ONION-SPICES', name: 'Sliced Onions & Spices', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 20.0, min_threshold: 3.0, cost_per_unit: 50, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
  { id: 'RM-ONION', name: 'Red Onions', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 45.0, min_threshold: 12.0, cost_per_unit: 35, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
  { id: 'RM-COLA', name: 'Classic Cola Cans/Syrup', category: 'Beverages', purchase_unit: 'units', consumption_unit: 'units', conversion_factor: 1, current_stock: 50.0, min_threshold: 10.0, cost_per_unit: 20, supplier: 'Beverage Distributor', unit_type: 'raw' },
  { id: 'RM-CHAAT-MASALA', name: 'Chaat Masala & Lemon Spice Blend', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 2.0, min_threshold: 0.5, cost_per_unit: 300, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },

  // Kitchen Raw Materials (Retained for Catalog Depth & Legacy Tests)
  { id: 'RM-TOMATO', name: 'Vine-Ripe Tomatoes', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 50.0, min_threshold: 15.0, cost_per_unit: 40, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
  { id: 'RM-GINGER-GARLIC', name: 'Ginger-Garlic Paste', category: 'Produce', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 15.0, min_threshold: 4.0, cost_per_unit: 150, supplier: 'Kolkata Fresh Veggies Mandi', unit_type: 'raw' },
  { id: 'RM-BUTTER', name: 'Dairy Butter (Amul/Dairy)', category: 'Dairy', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 20.0, min_threshold: 5.0, cost_per_unit: 520, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
  { id: 'RM-CREAM', name: 'Fresh Dairy Malai / Cream', category: 'Dairy', purchase_unit: 'Litre', consumption_unit: 'Litre', conversion_factor: 1, current_stock: 15.0, min_threshold: 4.0, cost_per_unit: 220, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
  { id: 'RM-PANEER', name: 'Malai Paneer Blocks', category: 'Dairy', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 25.0, min_threshold: 6.0, cost_per_unit: 380, supplier: 'Dairy Farm Co-op', unit_type: 'raw' },
  { id: 'RM-CASHEW', name: 'Premium Cashew Nut Paste', category: 'Dry Fruits & Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 10.0, min_threshold: 2.5, cost_per_unit: 720, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-KASURI-METHI', name: 'Kasuri Methi (Fenugreek Leaves)', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 4.0, min_threshold: 1.0, cost_per_unit: 320, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-GARAM-MASALA', name: 'Royal Shahi Garam Masala', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 5.0, min_threshold: 1.5, cost_per_unit: 850, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-KASHMIRI-MIRCH', name: 'Kashmiri Degi Mirch Powder', category: 'Spices', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 6.0, min_threshold: 1.5, cost_per_unit: 480, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-BASMATI-RICE', name: 'Royal Dum Biryani Basmati Rice', category: 'Grains', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 60.0, min_threshold: 15.0, cost_per_unit: 115, supplier: 'Metro Cash & Carry Wholesale', unit_type: 'raw' },
  { id: 'RM-COFFEE-BEANS', name: 'Roast Arabica Coffee Beans', category: 'Beverages', purchase_unit: 'kg', consumption_unit: 'kg', conversion_factor: 1, current_stock: 8.0, min_threshold: 2.5, cost_per_unit: 750, supplier: 'Specialty Roasters', unit_type: 'raw' },

  // Liquid Telemetry (Bar & Brewery Inventory - Retained for legacy test compliance)
  { id: 'RM-WHISKY-750', name: 'Premium Blended Scotch Whisky', category: 'Bar & Spirits', purchase_unit: '750ml Bottle', consumption_unit: 'ml', conversion_factor: 750, current_stock: 3750, min_threshold: 1500, cost_per_unit: 2600, supplier: 'United Spirits Distributor', unit_type: 'spirit' },
  { id: 'RM-RUM-750', name: 'Dark Indian Spiced Rum', category: 'Bar & Spirits', purchase_unit: '750ml Bottle', consumption_unit: 'ml', conversion_factor: 750, current_stock: 4500, min_threshold: 1500, cost_per_unit: 900, supplier: 'United Spirits Distributor', unit_type: 'spirit' },
  { id: 'RM-CRAFT-BEER-KEG', name: 'German Wheat Draught Craft Beer Keg', category: 'Brewery & Kegs', purchase_unit: '50L Keg', consumption_unit: 'ml', conversion_factor: 50000, current_stock: 50000, min_threshold: 10000, cost_per_unit: 8500, supplier: 'Craft Brewery Tap Lines', unit_type: 'draught_beer', default_froth_buffer: 6.0 },
  { id: 'RM-IPA-BEER-KEG', name: 'Hazy Indian Pale Ale (IPA) Keg', category: 'Brewery & Kegs', purchase_unit: '30L Keg', consumption_unit: 'ml', conversion_factor: 30000, current_stock: 30000, min_threshold: 8000, cost_per_unit: 6200, supplier: 'Craft Brewery Tap Lines', unit_type: 'draught_beer', default_froth_buffer: 7.0 }
];

const DEFAULT_SUB_RECIPES = [
  {
    id: 'SUB-GRAVY-BASE',
    name: 'Cooking Oil / Gravy Base',
    yield_quantity: 15.0,
    yield_unit: 'Litre',
    current_stock: 15.0,
    min_threshold: 4.0,
    unit_production_cost: 95.0,
    ingredients: [
      { material_id: 'RM-OIL', quantity: 2.0, unit: 'Litre' },
      { material_id: 'RM-ONION-SPICES', quantity: 8.0, unit: 'kg' }
    ]
  },
  {
    id: 'SUB-MAK-01',
    name: 'Makhani Gravy Base (Shahi Butter Masala Gravy)',
    yield_quantity: 20.0,
    yield_unit: 'Litre',
    current_stock: 20.0,
    min_threshold: 5.0,
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
    name: 'Bhuna Onion-Tomato Gravy Base (Brown Curry Gravy)',
    yield_quantity: 15.0,
    yield_unit: 'Litre',
    current_stock: 15.0,
    min_threshold: 4.0,
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
    name: 'Awadhi Dum Biryani Yakhni / Meat Stock Base',
    yield_quantity: 10.0,
    yield_unit: 'kg',
    current_stock: 10.0,
    min_threshold: 3.0,
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
    ingredients: [
      { material_id: 'RM-BUTTER', quantity: 1.5, unit: 'kg' },
      { material_id: 'RM-CREAM', quantity: 1.0, unit: 'Litre' },
      { material_id: 'RM-TOMATO', quantity: 4.0, unit: 'kg' },
      { material_id: 'RM-GINGER-GARLIC', quantity: 0.8, unit: 'kg' }
    ]
  }
];

const DEFAULT_RECIPES = [
  {
    id: 'REC-SAMOSA',
    menu_item_id: '1',
    dish_name: 'Samosa',
    menu_category: 'Snacks',
    selling_price: 15,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-MAIDA', name: 'Wheat Flour / Maida', exact_quantity: 0.04, unit: 'kg' },
      { type: 'raw', id: 'RM-POTATO', name: 'Spiced Potatoes', exact_quantity: 0.05, unit: 'kg' },
      { type: 'raw', id: 'RM-OIL', name: 'Refined Cooking Oil', exact_quantity: 0.015, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-TEA',
    menu_item_id: '2',
    dish_name: 'Tea',
    menu_category: 'Beverages',
    selling_price: 10,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-MILK', name: 'Fresh Cow Milk', exact_quantity: 0.08, unit: 'Litre' },
      { type: 'raw', id: 'RM-TEA-LEAVES', name: 'CTC Tea Leaves', exact_quantity: 0.005, unit: 'kg' },
      { type: 'raw', id: 'RM-SUGAR', name: 'Granulated Sugar', exact_quantity: 0.008, unit: 'kg' }
    ]
  },
  {
    id: 'REC-CHICKEN-CURRY',
    menu_item_id: '3',
    dish_name: 'Chicken Curry',
    menu_category: 'Main Course',
    selling_price: 140,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-POULTRY', name: 'Fresh Farm Poultry', exact_quantity: 0.18, unit: 'kg' },
      { type: 'raw', id: 'RM-ONION-SPICES', name: 'Sliced Onions & Spices', exact_quantity: 0.05, unit: 'kg' },
      { type: 'sub_recipe', id: 'SUB-GRAVY-BASE', name: 'Cooking Oil / Gravy Base', exact_quantity: 0.15, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-MASALA-COKE',
    menu_item_id: '4',
    dish_name: 'Masala Coke',
    menu_category: 'Beverages',
    selling_price: 40,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-COLA', name: 'Classic Cola Cans/Syrup', exact_quantity: 1.0, unit: 'units' },
      { type: 'raw', id: 'RM-CHAAT-MASALA', name: 'Chaat Masala & Lemon Spice Blend', exact_quantity: 0.005, unit: 'kg' }
    ]
  },
  {
    id: 'REC-PBM',
    dish_name: 'Paneer Butter Masala',
    menu_category: 'Main Course',
    selling_price: 280,
    gst_percentage: 5,
    components: [
      { type: 'sub_recipe', id: 'SUB-MAK-01', name: 'Makhani Gravy Base', exact_quantity: 0.20, unit: 'Litre' },
      { type: 'raw', id: 'RM-PANEER', name: 'Malai Paneer', exact_quantity: 0.15, unit: 'kg' },
      { type: 'raw', id: 'RM-BUTTER', name: 'Dairy Butter', exact_quantity: 0.02, unit: 'kg' },
      { type: 'raw', id: 'RM-CREAM', name: 'Fresh Cream', exact_quantity: 0.02, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-BC',
    dish_name: 'Butter Chicken',
    menu_category: 'Main Course',
    selling_price: 340,
    gst_percentage: 5,
    components: [
      { type: 'sub_recipe', id: 'SUB-MAK-01', name: 'Makhani Gravy Base', exact_quantity: 0.22, unit: 'Litre' },
      { type: 'raw', id: 'RM-CHICKEN', name: 'Fresh Chicken Tikka Cut', exact_quantity: 0.20, unit: 'kg' },
      { type: 'raw', id: 'RM-BUTTER', name: 'Dairy Butter', exact_quantity: 0.025, unit: 'kg' },
      { type: 'raw', id: 'RM-CREAM', name: 'Fresh Cream', exact_quantity: 0.02, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-DM',
    dish_name: 'Dal Makhani',
    menu_category: 'Main Course',
    selling_price: 220,
    gst_percentage: 5,
    components: [
      { type: 'sub_recipe', id: 'SUB-DAL-01', name: 'Dal Makhani Base', exact_quantity: 0.25, unit: 'Litre' },
      { type: 'raw', id: 'RM-BUTTER', name: 'Dairy Butter', exact_quantity: 0.02, unit: 'kg' },
      { type: 'raw', id: 'RM-CREAM', name: 'Fresh Cream', exact_quantity: 0.02, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-KP',
    dish_name: 'Kadhai Paneer',
    menu_category: 'Main Course',
    selling_price: 260,
    gst_percentage: 5,
    components: [
      { type: 'sub_recipe', id: 'SUB-BROWN-01', name: 'Brown Curry Gravy', exact_quantity: 0.18, unit: 'Litre' },
      { type: 'raw', id: 'RM-PANEER', name: 'Malai Paneer', exact_quantity: 0.15, unit: 'kg' },
      { type: 'raw', id: 'RM-ONION', name: 'Red Onions', exact_quantity: 0.05, unit: 'kg' },
      { type: 'raw', id: 'RM-OIL', name: 'Sunflower Oil', exact_quantity: 0.01, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-BIRYANI',
    dish_name: 'Chicken Biryani',
    menu_category: 'Biryani & Rice',
    selling_price: 280,
    gst_percentage: 5,
    components: [
      { type: 'sub_recipe', id: 'SUB-YAKHNI-01', name: 'Biryani Yakhni Base', exact_quantity: 0.25, unit: 'kg' },
      { type: 'raw', id: 'RM-BASMATI-RICE', name: 'Basmati Rice', exact_quantity: 0.20, unit: 'kg' },
      { type: 'raw', id: 'RM-OIL', name: 'Sunflower Oil', exact_quantity: 0.015, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-PATIALA-PEG',
    dish_name: 'Patiala Peg Whisky (60ml)',
    menu_category: 'Bar & Spirits',
    selling_price: 380,
    gst_percentage: 18,
    components: [
      { type: 'spirit', id: 'RM-WHISKY-750', name: 'Scotch Whisky', exact_quantity: 60, unit: 'ml', froth_buffer_pct: 0 }
    ]
  },
  {
    id: 'REC-SINGLE-PEG',
    dish_name: 'Single Peg Whisky (30ml)',
    menu_category: 'Bar & Spirits',
    selling_price: 210,
    gst_percentage: 18,
    components: [
      { type: 'spirit', id: 'RM-WHISKY-750', name: 'Scotch Whisky', exact_quantity: 30, unit: 'ml', froth_buffer_pct: 0 }
    ]
  },
  {
    id: 'REC-RUM-60',
    dish_name: 'Dark Rum Double Peg (60ml)',
    menu_category: 'Bar & Spirits',
    selling_price: 180,
    gst_percentage: 18,
    components: [
      { type: 'spirit', id: 'RM-RUM-750', name: 'Dark Rum', exact_quantity: 60, unit: 'ml', froth_buffer_pct: 0 }
    ]
  },
  {
    id: 'REC-BEER-MUG',
    dish_name: 'German Wheat Craft Beer Mug (500ml)',
    menu_category: 'Brewery & Draught',
    selling_price: 320,
    gst_percentage: 18,
    components: [
      { type: 'draught_beer', id: 'RM-CRAFT-BEER-KEG', name: 'German Wheat Draught Keg', exact_quantity: 500, unit: 'ml', froth_buffer_pct: 6.0 }
    ]
  },
  {
    id: 'REC-BEER-PITCHER',
    dish_name: 'German Wheat Craft Beer Pitcher (1500ml)',
    menu_category: 'Brewery & Draught',
    selling_price: 850,
    gst_percentage: 18,
    components: [
      { type: 'draught_beer', id: 'RM-CRAFT-BEER-KEG', name: 'German Wheat Draught Keg', exact_quantity: 1500, unit: 'ml', froth_buffer_pct: 5.0 }
    ]
  },
  {
    id: 'REC-IPA-GLASS',
    dish_name: 'Hazy IPA Craft Beer Glass (330ml)',
    menu_category: 'Brewery & Draught',
    selling_price: 260,
    gst_percentage: 18,
    components: [
      { type: 'draught_beer', id: 'RM-IPA-BEER-KEG', name: 'Hazy IPA Keg', exact_quantity: 330, unit: 'ml', froth_buffer_pct: 7.0 }
    ]
  },
  {
    id: 'REC-COLD-COFFEE',
    dish_name: 'Cold Coffee',
    menu_category: 'Beverages',
    selling_price: 120,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-COFFEE-BEANS', name: 'Coffee Beans', exact_quantity: 0.02, unit: 'kg' },
      { type: 'raw', id: 'RM-MILK', name: 'Cow Milk', exact_quantity: 0.22, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-MASALA-CHAI',
    dish_name: 'Masala Chai',
    menu_category: 'Beverages',
    selling_price: 30,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-TEA-LEAVES', name: 'Tea Leaves', exact_quantity: 0.01, unit: 'kg' },
      { type: 'raw', id: 'RM-MILK', name: 'Cow Milk', exact_quantity: 0.12, unit: 'Litre' }
    ]
  },
  {
    id: 'REC-PANEER-ROLL',
    dish_name: 'Paneer Roll',
    menu_category: 'Snacks',
    selling_price: 130,
    gst_percentage: 5,
    components: [
      { type: 'raw', id: 'RM-PANEER', name: 'Malai Paneer', exact_quantity: 0.12, unit: 'kg' },
      { type: 'raw', id: 'RM-MAIDA', name: 'Refined Flour', exact_quantity: 0.08, unit: 'kg' },
      { type: 'raw', id: 'RM-OIL', name: 'Sunflower Oil', exact_quantity: 0.02, unit: 'Litre' }
    ]
  }
];

// In-Memory state maps
let rawMaterialsStore = new Map();
let subRecipesStore = new Map();
let recipesStore = new Map();
let batchHistory = [];
let deductionHistory = [];
let purchaseOrdersStore = new Map();
let transfersStore = new Map();
let wastageHistory = [];
let restockExpensesHistory = [];

/**
 * Resets stores to default seed data (useful for test isolation).
 */
export function resetInventoryStore() {
  rawMaterialsStore.clear();
  subRecipesStore.clear();
  recipesStore.clear();
  batchHistory = [];
  deductionHistory = [];
  purchaseOrdersStore.clear();
  transfersStore.clear();
  wastageHistory = [];
  restockExpensesHistory = [];

  DEFAULT_RAW_MATERIALS.forEach(item => {
    rawMaterialsStore.set(item.id, JSON.parse(JSON.stringify(item)));
  });

  DEFAULT_SUB_RECIPES.forEach(item => {
    subRecipesStore.set(item.id, JSON.parse(JSON.stringify(item)));
  });

  DEFAULT_RECIPES.forEach(item => {
    recipesStore.set(item.id, JSON.parse(JSON.stringify(item)));
  });

  // Seed default PO
  const seedPo = {
    id: 'PO-2026-001',
    po_number: 'PO-2026-001',
    vendor_name: 'Metro Cash & Carry Wholesale',
    status: 'Dispatched',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    expected_delivery: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    items: [
      { material_id: 'RM-TOMATO', name: 'Vine-Ripe Tomatoes', quantity: 30, unit: 'kg', unit_price: 40, line_total: 1200 },
      { material_id: 'RM-BASMATI-RICE', name: 'Royal Dum Biryani Basmati Rice', quantity: 50, unit: 'kg', unit_price: 115, line_total: 5750 }
    ],
    subtotal: 6950,
    tax: 347.5,
    total: 7297.5
  };
  purchaseOrdersStore.set(seedPo.id, seedPo);

  // Seed default inter-outlet transfer
  const seedTransfer = {
    id: 'TRF-2026-001',
    from_outlet: 'Central Kitchen Commissary (Central Kolkata)',
    to_outlet: 'Park Street Bistro & Dine-In',
    status: 'Dispatched',
    dispatched_at: new Date().toISOString(),
    items: [
      { type: 'sub_recipe', id: 'SUB-MAK-01', name: 'Makhani Gravy Base', quantity: 10, unit: 'Litre' },
      { type: 'raw', id: 'RM-PANEER', name: 'Malai Paneer Blocks', quantity: 10, unit: 'kg' }
    ]
  };
  transfersStore.set(seedTransfer.id, seedTransfer);
}

// Initial seed
resetInventoryStore();

// ==========================================
// 2. RAW MATERIALS MANAGEMENT
// ==========================================

export function getRawMaterials() {
  return Array.from(rawMaterialsStore.values());
}

export function updateRawMaterialStock(materialId, adjustment, isAbsolute = false) {
  const item = rawMaterialsStore.get(materialId);
  if (!item) return { status: 404, data: { success: false, error: 'Raw material not found' } };

  const qty = parseFloat(adjustment);
  if (isNaN(qty)) return { status: 400, data: { success: false, error: 'Invalid quantity adjustment' } };

  if (isAbsolute) {
    item.current_stock = Math.max(0, Math.round(qty * 100) / 100);
  } else {
    item.current_stock = Math.max(0, Math.round((item.current_stock + qty) * 100) / 100);
  }

  return { status: 200, data: { success: true, item } };
}

export function updateRawMaterialPrice(materialId, newPrice) {
  const item = rawMaterialsStore.get(materialId);
  if (!item) return { status: 404, data: { success: false, error: 'Raw material not found' } };

  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) return { status: 400, data: { success: false, error: 'Invalid price value' } };

  const oldPrice = item.cost_per_unit;
  item.cost_per_unit = price;

  // Immediately recalculate dish margin impacts
  const liveCosting = calculateDishCosting();

  return {
    status: 200,
    data: {
      success: true,
      materialId,
      name: item.name,
      oldPrice,
      newPrice: price,
      costingImpact: liveCosting
    }
  };
}

// ==========================================
// 3. MORNING BATCHING & SUB-RECIPE COMPOSITION ENGINE
// ==========================================

export function getSubRecipes() {
  const rawList = Array.from(rawMaterialsStore.values());
  const recipes = Array.from(subRecipesStore.values());

  return recipes.map(sub => {
    let batchCost = 0;
    const enrichedIngredients = sub.ingredients.map(ing => {
      const rm = rawMaterialsStore.get(ing.material_id);
      const unitCost = rm ? rm.cost_per_unit : 0;
      const ingCost = unitCost * ing.quantity;
      batchCost += ingCost;
      return {
        ...ing,
        material_name: rm ? rm.name : ing.material_id,
        available_stock: rm ? rm.current_stock : 0,
        unit_cost: unitCost,
        ingredient_total_cost: Math.round(ingCost * 100) / 100
      };
    });

    const unitProductionCost = sub.yield_quantity > 0 ? (batchCost / sub.yield_quantity) : 0;

    return {
      ...sub,
      ingredients: enrichedIngredients,
      batch_raw_cost: Math.round(batchCost * 100) / 100,
      unit_production_cost: Math.round(unitProductionCost * 100) / 100
    };
  });
}

/**
 * Morning Bulk Batch Production:
 * Cooks input batch quantity (e.g. 20L Makhani Gravy).
 * Deducts proportional raw ingredients from raw_materials and increments sub-recipe stock.
 */
export function produceMorningBatch(subRecipeId, produceQuantity) {
  const sub = subRecipesStore.get(subRecipeId);
  if (!sub) {
    return { status: 404, data: { success: false, error: `Sub-recipe ${subRecipeId} not found` } };
  }

  const targetQty = parseFloat(produceQuantity);
  if (isNaN(targetQty) || targetQty <= 0) {
    return { status: 400, data: { success: false, error: 'Production quantity must be greater than zero' } };
  }

  const ratio = targetQty / (sub.yield_quantity || 1.0);

  // 1. Stock sufficiency check for all bulk ingredients
  const shortages = [];
  const requiredDeductions = [];

  for (const ing of sub.ingredients) {
    const rm = rawMaterialsStore.get(ing.material_id);
    const needed = Math.round(ing.quantity * ratio * 1000) / 1000;
    if (!rm || rm.current_stock < needed) {
      shortages.push({
        material_id: ing.material_id,
        name: rm ? rm.name : ing.material_id,
        required: needed,
        available: rm ? rm.current_stock : 0,
        unit: ing.unit
      });
    }
    requiredDeductions.push({ rm, needed, unitCost: rm ? rm.cost_per_unit : 0 });
  }

  if (shortages.length > 0) {
    return {
      status: 400,
      data: {
        success: false,
        error: `Insufficient raw materials for ${targetQty} ${sub.yield_unit} of ${sub.name}`,
        shortages
      }
    };
  }

  // 2. Perform bulk raw ingredient deductions
  let totalRawCost = 0;
  for (const deduction of requiredDeductions) {
    deduction.rm.current_stock = Math.max(0, Math.round((deduction.rm.current_stock - deduction.needed) * 1000) / 1000);
    totalRawCost += (deduction.needed * deduction.unitCost);
  }

  // 3. Increment semi-finished sub-recipe stock
  sub.current_stock = Math.round((sub.current_stock + targetQty) * 100) / 100;
  const unitProductionCost = targetQty > 0 ? (totalRawCost / targetQty) : 0;

  const batchLog = {
    batch_id: 'BATCH-' + Date.now().toString().slice(-6),
    sub_recipe_id: sub.id,
    sub_recipe_name: sub.name,
    produced_quantity: targetQty,
    unit: sub.yield_unit,
    total_raw_cost: Math.round(totalRawCost * 100) / 100,
    unit_production_cost: Math.round(unitProductionCost * 100) / 100,
    timestamp: new Date().toISOString(),
    deductions: requiredDeductions.map(d => ({ name: d.rm.name, deducted: d.needed, unit: d.rm.consumption_unit }))
  };

  batchHistory.unshift(batchLog);

  return {
    status: 200,
    data: {
      success: true,
      message: `Successfully produced ${targetQty} ${sub.yield_unit} of ${sub.name}`,
      batch: batchLog,
      produced: targetQty,
      produced_quantity: targetQty,
      updated_stock: sub.current_stock,
      unit_production_cost: batchLog.unit_production_cost
    }
  };
}

// ==========================================
// 4. LIVE ORDER DEDUCTION & LIQUID TELEMETRY MATRIX
// ==========================================

export const MATCHED_RAW_MATERIALS_IDS = [
  'RM-OIL',
  'RM-MAIDA',
  'RM-POTATO',
  'RM-MILK',
  'RM-TEA-LEAVES',
  'RM-SUGAR',
  'RM-POULTRY',
  'RM-ONION-SPICES',
  'RM-COLA',
  'RM-CHAAT-MASALA'
];

function syncStockAliases(id, newStock) {
  if (id === 'RM-POULTRY') {
    const chk = rawMaterialsStore.get('RM-CHICKEN');
    if (chk) chk.current_stock = newStock;
  } else if (id === 'RM-CHICKEN') {
    const p = rawMaterialsStore.get('RM-POULTRY');
    if (p) p.current_stock = newStock;
  } else if (id === 'RM-ONION-SPICES') {
    const o = rawMaterialsStore.get('RM-ONION');
    if (o) o.current_stock = newStock;
  } else if (id === 'RM-ONION') {
    const os = rawMaterialsStore.get('RM-ONION-SPICES');
    if (os) os.current_stock = newStock;
  } else if (id === 'SUB-GRAVY-BASE') {
    const b = subRecipesStore.get('SUB-BROWN-01');
    if (b) b.current_stock = newStock;
  } else if (id === 'SUB-BROWN-01') {
    const g = subRecipesStore.get('SUB-GRAVY-BASE');
    if (g) g.current_stock = newStock;
  }
}

export function getDishRecipes() {
  return Array.from(recipesStore.values());
}
export const getRecipes = getDishRecipes;

/**
 * Deducts inventory upon live POS dish orders:
 * 1. Nested/Sub-Recipes: Deducts semi-finished bases directly (e.g. 200g Makhani Gravy)
 * 2. Spirits: Exact 1:1 volume deduction (e.g. 30ml / 60ml Patiala Peg)
 * 3. Draught Beer: Volume deduction with customizable froth/tap line buffer % (e.g. 500ml + 6% froth = 530ml)
 * 4. Raw items: Deducts directly (e.g. 150g Paneer, 20g Butter)
 */
export function deductOrderInventory(order) {
  if (!order) return { status: 400, data: { success: false, error: 'Order is required' } };

  const items = Array.isArray(order.rawItems)
    ? order.rawItems
    : (Array.isArray(order.items) ? order.items : []);

  if (items.length === 0) {
    return { status: 200, data: { success: true, message: 'No items to deduct', deductions: [] } };
  }

  const deductions = [];

  items.forEach(cartItem => {
    const dishName = (cartItem.name || '').toLowerCase().trim();
    const itemId = cartItem.id ? String(cartItem.id) : null;
    const qty = parseInt(cartItem.qty || cartItem.quantity || 1, 10);

    // 0. Match by menu_item_id or custom ID if available
    let recipe = null;
    if (itemId) {
      recipe = Array.from(recipesStore.values()).find(r => String(r.menu_item_id) === itemId || String(r.id) === itemId);
    }

    // 1. Exact match in recipe store
    if (!recipe) {
      recipe = Array.from(recipesStore.values()).find(r => r.dish_name.toLowerCase() === dishName);
    }
    
    // 2. Substring or token match
    if (!recipe) {
      recipe = Array.from(recipesStore.values()).find(r => {
        const target = r.dish_name.toLowerCase();
        return dishName.includes(target) || target.includes(dishName);
      });
    }

    // 3. Indian culinary alias matching
    if (!recipe) {
      const aliasMap = [
        { matches: ['samosa', 'hot samosa', 'singara', 'crispy samosa'], id: 'REC-SAMOSA' },
        { matches: ['masala chai', 'chai', 'tea', 'kadak chai', 'hot chai', 'special tea', 'masala tea'], id: 'REC-TEA' },
        { matches: ['chicken curry', 'curry chicken', 'murgh curry'], id: 'REC-CHICKEN-CURRY' },
        { matches: ['masala coke', 'coke', 'cola', 'masala cola', 'spiced coke'], id: 'REC-MASALA-COKE' },
        { matches: ['makhani', 'butter masala', 'butter paneer', 'paneer makhani', 'shahi paneer'], id: 'REC-PBM' },
        { matches: ['butter chicken', 'murgh makhani', 'chicken makhani'], id: 'REC-BC' },
        { matches: ['dal makhani', 'makhani dal', 'black dal'], id: 'REC-DM' },
        { matches: ['kadhai paneer', 'karahi paneer', 'kadai paneer'], id: 'REC-KP' },
        { matches: ['biryani', 'dum biryani', 'chicken biryani', 'yakhni'], id: 'REC-BIRYANI' },
        { matches: ['patiala', 'large peg', 'whisky 60', 'scotch 60'], id: 'REC-PATIALA-PEG' },
        { matches: ['single peg', 'small peg', 'whisky 30', 'scotch 30', 'whisky', 'scotch'], id: 'REC-SINGLE-PEG' },
        { matches: ['rum 60', 'dark rum', 'rum double', 'rum peg', 'rum'], id: 'REC-RUM-60' },
        { matches: ['pitcher', 'beer pitcher', 'craft beer pitcher'], id: 'REC-BEER-PITCHER' },
        { matches: ['beer mug', 'craft beer mug', 'draught mug', 'draft mug', 'craft beer', 'draught beer', 'draft beer', 'beer'], id: 'REC-BEER-MUG' },
        { matches: ['ipa', 'hazy ipa', 'ipa glass'], id: 'REC-IPA-GLASS' },
        { matches: ['cold coffee', 'iced coffee', 'frappe'], id: 'REC-COLD-COFFEE' },
        { matches: ['paneer roll', 'kathi roll', 'paneer wrap'], id: 'REC-PANEER-ROLL' }
      ];

      for (const alias of aliasMap) {
        if (alias.matches.some(m => dishName.includes(m))) {
          recipe = recipesStore.get(alias.id);
          if (recipe) break;
        }
      }
    }

    if (recipe && Array.isArray(recipe.components)) {
      recipe.components.forEach(comp => {
        if (comp.type === 'sub_recipe') {
          // Nested Sub-Recipe Deduction (Semi-finished base directly)
          let sub = subRecipesStore.get(comp.id);
          if (!sub && comp.id === 'SUB-GRAVY-BASE') sub = subRecipesStore.get('SUB-BROWN-01');
          const totalDeduct = Math.round(comp.exact_quantity * qty * 1000) / 1000;
          if (sub) {
            sub.current_stock = Math.max(0, Math.round((sub.current_stock - totalDeduct) * 1000) / 1000);
            syncStockAliases(sub.id, sub.current_stock);
            deductions.push({
              dish: recipe.dish_name,
              component_type: 'sub_recipe',
              name: sub.name,
              deducted: totalDeduct,
              remaining_stock: sub.current_stock,
              unit: comp.unit
            });
          }
        } else if (comp.type === 'spirit') {
          // Exact Volume 1:1 Spirit Peg Deduction (30ml / 60ml Patiala Peg)
          const rm = rawMaterialsStore.get(comp.id);
          const totalMl = Math.round(comp.exact_quantity * qty);
          if (rm) {
            rm.current_stock = Math.max(0, Math.round(rm.current_stock - totalMl));
            deductions.push({
              dish: recipe.dish_name,
              component_type: 'spirit',
              name: rm.name,
              exact_ml_deducted: totalMl,
              remaining_ml: rm.current_stock,
              unit: 'ml'
            });
          }
        } else if (comp.type === 'draught_beer') {
          // Liquid Telemetry: Draught Beer with Froth & Tap Line Buffer %
          const rm = rawMaterialsStore.get(comp.id);
          const frothPct = typeof comp.froth_buffer_pct === 'number' ? comp.froth_buffer_pct : 6.0;
          const servedVolume = comp.exact_quantity * qty;
          const bufferMl = servedVolume * (frothPct / 100.0);
          const totalDeductedMl = Math.round(servedVolume + bufferMl);

          if (rm) {
            rm.current_stock = Math.max(0, Math.round(rm.current_stock - totalDeductedMl));
            deductions.push({
              dish: recipe.dish_name,
              component_type: 'draught_beer',
              name: rm.name,
              served_ml: servedVolume,
              froth_buffer_pct: frothPct,
              buffer_ml: Math.round(bufferMl),
              total_ml_deducted: totalDeductedMl,
              remaining_keg_ml: rm.current_stock,
              unit: 'ml'
            });
          }
        } else {
          // Standard Raw Material Deduction
          let rm = rawMaterialsStore.get(comp.id);
          if (!rm && comp.id === 'RM-POULTRY') rm = rawMaterialsStore.get('RM-CHICKEN');
          if (!rm && comp.id === 'RM-ONION-SPICES') rm = rawMaterialsStore.get('RM-ONION');
          const totalDeduct = Math.round(comp.exact_quantity * qty * 1000) / 1000;
          if (rm) {
            rm.current_stock = Math.max(0, Math.round((rm.current_stock - totalDeduct) * 1000) / 1000);
            syncStockAliases(rm.id, rm.current_stock);
            deductions.push({
              dish: recipe.dish_name,
              component_type: 'raw',
              name: rm.name,
              deducted: totalDeduct,
              remaining_stock: rm.current_stock,
              unit: comp.unit
            });
          }
        }
      });
    } else {
      // 4. Fallback direct deduction from raw materials for unmapped menu items
      if (dishName.includes('samosa')) {
        const rmMaida = rawMaterialsStore.get('RM-MAIDA');
        const rmPotato = rawMaterialsStore.get('RM-POTATO');
        const rmOil = rawMaterialsStore.get('RM-OIL');
        if (rmMaida) {
          const d = Math.round(0.04 * qty * 1000) / 1000;
          rmMaida.current_stock = Math.max(0, Math.round((rmMaida.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmMaida.name, deducted: d, remaining_stock: rmMaida.current_stock, unit: rmMaida.consumption_unit });
        }
        if (rmPotato) {
          const d = Math.round(0.05 * qty * 1000) / 1000;
          rmPotato.current_stock = Math.max(0, Math.round((rmPotato.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmPotato.name, deducted: d, remaining_stock: rmPotato.current_stock, unit: rmPotato.consumption_unit });
        }
        if (rmOil) {
          const d = Math.round(0.015 * qty * 1000) / 1000;
          rmOil.current_stock = Math.max(0, Math.round((rmOil.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmOil.name, deducted: d, remaining_stock: rmOil.current_stock, unit: rmOil.consumption_unit });
        }
      } else if (dishName.includes('tea') || dishName.includes('chai')) {
        const rmMilk = rawMaterialsStore.get('RM-MILK');
        const rmTea = rawMaterialsStore.get('RM-TEA-LEAVES');
        const rmSugar = rawMaterialsStore.get('RM-SUGAR');
        if (rmMilk) {
          const d = Math.round(0.08 * qty * 1000) / 1000;
          rmMilk.current_stock = Math.max(0, Math.round((rmMilk.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmMilk.name, deducted: d, remaining_stock: rmMilk.current_stock, unit: rmMilk.consumption_unit });
        }
        if (rmTea) {
          const d = Math.round(0.005 * qty * 1000) / 1000;
          rmTea.current_stock = Math.max(0, Math.round((rmTea.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmTea.name, deducted: d, remaining_stock: rmTea.current_stock, unit: rmTea.consumption_unit });
        }
        if (rmSugar) {
          const d = Math.round(0.008 * qty * 1000) / 1000;
          rmSugar.current_stock = Math.max(0, Math.round((rmSugar.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmSugar.name, deducted: d, remaining_stock: rmSugar.current_stock, unit: rmSugar.consumption_unit });
        }
      } else if (dishName.includes('chicken') || dishName.includes('curry')) {
        let rmChk = rawMaterialsStore.get('RM-POULTRY') || rawMaterialsStore.get('RM-CHICKEN');
        let rmOnion = rawMaterialsStore.get('RM-ONION-SPICES') || rawMaterialsStore.get('RM-ONION');
        let subGravy = subRecipesStore.get('SUB-GRAVY-BASE') || subRecipesStore.get('SUB-BROWN-01');
        if (rmChk) {
          const d = Math.round(0.18 * qty * 1000) / 1000;
          rmChk.current_stock = Math.max(0, Math.round((rmChk.current_stock - d) * 1000) / 1000);
          syncStockAliases(rmChk.id, rmChk.current_stock);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmChk.name, deducted: d, remaining_stock: rmChk.current_stock, unit: rmChk.consumption_unit });
        }
        if (rmOnion) {
          const d = Math.round(0.05 * qty * 1000) / 1000;
          rmOnion.current_stock = Math.max(0, Math.round((rmOnion.current_stock - d) * 1000) / 1000);
          syncStockAliases(rmOnion.id, rmOnion.current_stock);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmOnion.name, deducted: d, remaining_stock: rmOnion.current_stock, unit: rmOnion.consumption_unit });
        }
        if (subGravy) {
          const d = Math.round(0.15 * qty * 1000) / 1000;
          subGravy.current_stock = Math.max(0, Math.round((subGravy.current_stock - d) * 1000) / 1000);
          syncStockAliases(subGravy.id, subGravy.current_stock);
          deductions.push({ dish: cartItem.name, component_type: 'sub_recipe', name: subGravy.name, deducted: d, remaining_stock: subGravy.current_stock, unit: subGravy.yield_unit });
        }
      } else if (dishName.includes('coke') || dishName.includes('cola')) {
        const rmCola = rawMaterialsStore.get('RM-COLA');
        const rmChaat = rawMaterialsStore.get('RM-CHAAT-MASALA');
        if (rmCola) {
          const d = 1.0 * qty;
          rmCola.current_stock = Math.max(0, Math.round((rmCola.current_stock - d) * 100) / 100);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmCola.name, deducted: d, remaining_stock: rmCola.current_stock, unit: rmCola.consumption_unit });
        }
        if (rmChaat) {
          const d = Math.round(0.005 * qty * 1000) / 1000;
          rmChaat.current_stock = Math.max(0, Math.round((rmChaat.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmChaat.name, deducted: d, remaining_stock: rmChaat.current_stock, unit: rmChaat.consumption_unit });
        }
      } else if (dishName.includes('coffee')) {
        const rmBeans = rawMaterialsStore.get('RM-COFFEE-BEANS');
        const rmMilk = rawMaterialsStore.get('RM-MILK');
        if (rmBeans) {
          const d = Math.round(0.02 * qty * 1000) / 1000;
          rmBeans.current_stock = Math.max(0, Math.round((rmBeans.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmBeans.name, deducted: d, remaining_stock: rmBeans.current_stock, unit: rmBeans.consumption_unit });
        }
        if (rmMilk) {
          const d = Math.round(0.22 * qty * 1000) / 1000;
          rmMilk.current_stock = Math.max(0, Math.round((rmMilk.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmMilk.name, deducted: d, remaining_stock: rmMilk.current_stock, unit: rmMilk.consumption_unit });
        }
      } else if (dishName.includes('paneer')) {
        const rmPan = rawMaterialsStore.get('RM-PANEER');
        if (rmPan) {
          const d = Math.round(0.15 * qty * 1000) / 1000;
          rmPan.current_stock = Math.max(0, Math.round((rmPan.current_stock - d) * 1000) / 1000);
          deductions.push({ dish: cartItem.name, component_type: 'raw', name: rmPan.name, deducted: d, remaining_stock: rmPan.current_stock, unit: rmPan.consumption_unit });
        }
      }
    }
  });

  const record = {
    order_id: order.id || 'ORD-' + Date.now().toString().slice(-6),
    channel: order.orderType || 'Dine-in',
    timestamp: new Date().toISOString(),
    deductions
  };
  deductionHistory.unshift(record);

  return { status: 200, data: { success: true, record } };
}

// ==========================================
// 5. LIVE FOOD COSTING & MARGIN ANALYSIS
// ==========================================

export function calculateDishCosting() {
  const subRecipes = getSubRecipes();
  const subCostMap = new Map();
  subRecipes.forEach(s => subCostMap.set(s.id, s.unit_production_cost));

  const report = [];

  recipesStore.forEach(recipe => {
    let dishCost = 0;
    const itemized = [];

    recipe.components.forEach(comp => {
      let compUnitCost = 0;
      let compTotalCost = 0;

      if (comp.type === 'sub_recipe') {
        compUnitCost = subCostMap.get(comp.id) || 0;
        compTotalCost = comp.exact_quantity * compUnitCost;
      } else if (comp.type === 'spirit') {
        const rm = rawMaterialsStore.get(comp.id);
        const perMl = rm ? (rm.cost_per_unit / (rm.conversion_factor || 750)) : 0;
        compUnitCost = perMl;
        compTotalCost = comp.exact_quantity * perMl;
      } else if (comp.type === 'draught_beer') {
        const rm = rawMaterialsStore.get(comp.id);
        const frothPct = comp.froth_buffer_pct || 6.0;
        const perMl = rm ? (rm.cost_per_unit / (rm.conversion_factor || 50000)) : 0;
        const totalMl = comp.exact_quantity * (1 + frothPct / 100);
        compUnitCost = perMl;
        compTotalCost = totalMl * perMl;
      } else {
        const rm = rawMaterialsStore.get(comp.id);
        compUnitCost = rm ? rm.cost_per_unit : 0;
        compTotalCost = comp.exact_quantity * compUnitCost;
      }

      const roundedCompCost = Math.round(compTotalCost * 100) / 100;
      dishCost += roundedCompCost;
      itemized.push({
        type: comp.type,
        name: comp.name,
        quantity: comp.exact_quantity,
        unit: comp.unit,
        unit_cost: Math.round(compUnitCost * 100) / 100,
        component_cost: roundedCompCost
      });
    });

    const roundedCost = Math.round(dishCost * 100) / 100;
    const sellingPrice = recipe.selling_price;
    const grossProfit = Math.round((sellingPrice - roundedCost) * 100) / 100;
    const grossMarginPct = sellingPrice > 0 ? Math.round(((grossProfit / sellingPrice) * 100) * 10) / 10 : 0;

    let marginStatus = 'healthy';
    if (grossMarginPct < 50) {
      marginStatus = 'squeeze_risk';
    } else if (grossMarginPct < 65) {
      marginStatus = 'moderate';
    }

    report.push({
      dish_id: recipe.id,
      dish_name: recipe.dish_name,
      category: recipe.menu_category,
      selling_price: sellingPrice,
      food_cost: roundedCost,
      gross_profit: grossProfit,
      gross_margin_pct: grossMarginPct,
      margin_status: marginStatus,
      components: itemized
    });
  });

  return report;
}

// ==========================================
// 6. CENTRAL KITCHEN & INTER-OUTLET TRANSFERS
// ==========================================

export function getTransfers() {
  return Array.from(transfersStore.values());
}

export function createTransfer({ from_outlet, to_outlet, items }) {
  if (!from_outlet || !to_outlet || !Array.isArray(items) || items.length === 0) {
    return { status: 400, data: { success: false, error: 'from_outlet, to_outlet and non-empty items array required' } };
  }

  const transferId = 'TRF-' + Date.now().toString().slice(-6);
  const transfer = {
    id: transferId,
    from_outlet,
    to_outlet,
    status: 'Dispatched',
    dispatched_at: new Date().toISOString(),
    items: items.map(i => ({
      type: i.type || 'raw',
      id: i.id,
      name: i.name || i.id,
      quantity: parseFloat(i.quantity) || 1,
      unit: i.unit || 'unit'
    }))
  };

  transfersStore.set(transferId, transfer);
  return { status: 200, data: { success: true, transfer } };
}

export function receiveTransfer(transferId) {
  const trf = transfersStore.get(transferId);
  if (!trf) return { status: 404, data: { success: false, error: 'Transfer not found' } };
  if (trf.status === 'Received') {
    return { status: 400, data: { success: false, error: 'Transfer already marked as Received' } };
  }

  // Increment receiving stock
  trf.items.forEach(item => {
    if (item.type === 'sub_recipe') {
      const sub = subRecipesStore.get(item.id);
      if (sub) sub.current_stock += item.quantity;
    } else {
      const rm = rawMaterialsStore.get(item.id);
      if (rm) rm.current_stock += item.quantity;
    }
  });

  trf.status = 'Received';
  trf.received_at = new Date().toISOString();

  return { status: 200, data: { success: true, message: 'Transfer received and outlet stock credited', transfer: trf } };
}

// ==========================================
// 7. PURCHASE ORDER (PO) MANAGEMENT
// ==========================================

export function getPurchaseOrders() {
  return Array.from(purchaseOrdersStore.values());
}

export function createPurchaseOrder({ vendor_name, items, expected_delivery, notes }) {
  if (!vendor_name || !Array.isArray(items) || items.length === 0) {
    return { status: 400, data: { success: false, error: 'vendor_name and items required' } };
  }

  const poNumber = 'PO-2026-' + Date.now().toString().slice(-4);
  let subtotal = 0;

  const enrichedItems = items.map(line => {
    const qty = parseFloat(line.quantity) || 1;
    const price = parseFloat(line.unit_price) || 0;
    const total = qty * price;
    subtotal += total;

    return {
      material_id: line.material_id,
      name: line.name || line.material_id,
      quantity: qty,
      unit: line.unit || 'kg',
      unit_price: price,
      line_total: Math.round(total * 100) / 100
    };
  });

  const tax = Math.round(subtotal * 0.05 * 100) / 100; // 5% GST standard estimate
  const total = Math.round((subtotal + tax) * 100) / 100;

  const po = {
    id: poNumber,
    po_number: poNumber,
    vendor_name,
    status: 'Dispatched',
    created_at: new Date().toISOString(),
    expected_delivery: expected_delivery || new Date(Date.now() + 86400000).toISOString().split('T')[0],
    notes: notes || '',
    items: enrichedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    total
  };

  purchaseOrdersStore.set(poNumber, po);
  return { status: 200, data: { success: true, purchase_order: po } };
}

export function updatePurchaseOrderStatus(poId, newStatus) {
  const po = purchaseOrdersStore.get(poId);
  if (!po) return { status: 404, data: { success: false, error: 'Purchase Order not found' } };

  const validStatuses = ['Draft', 'Dispatched', 'Received', 'Cancelled'];
  if (!validStatuses.includes(newStatus)) {
    return { status: 400, data: { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } };
  }

  // If transitioned to 'Received', automatically restock items!
  if (newStatus === 'Received' && po.status !== 'Received') {
    po.items.forEach(item => {
      const rm = rawMaterialsStore.get(item.material_id);
      if (rm) {
        rm.current_stock = Math.round((rm.current_stock + item.quantity) * 100) / 100;
      }
    });
    po.received_at = new Date().toISOString();
  }

  po.status = newStatus;
  return { status: 200, data: { success: true, message: `PO status updated to ${newStatus}`, purchase_order: po } };
}

// ==========================================
// 8. PREDICTIVE INVENTORY FORECASTING & WASTE
// ==========================================

export function getPredictiveForecast() {
  const materials = Array.from(rawMaterialsStore.values());
  const forecast = [];

  materials.forEach(item => {
    // Determine daily burn rate based on category and current thresholds
    const threshold = typeof item.min_threshold === 'number' ? item.min_threshold : (typeof item.minThreshold === 'number' ? item.minThreshold : 10.0);
    const dailyBurnRate = Math.max(0.5, Math.round((threshold * 0.45) * 10) / 10);
    const daysRemaining = dailyBurnRate > 0 ? Math.round((item.current_stock / dailyBurnRate) * 10) / 10 : 99;

    let recommendation = 'Maintain';
    let urgency = 'Normal';
    let suggestedReorderQty = 0;

    if (daysRemaining <= 2) {
      recommendation = 'Upscale Order (+25% buffer for peak rush)';
      urgency = 'CRITICAL';
      suggestedReorderQty = Math.round(dailyBurnRate * 7 * 1.25);
    } else if (daysRemaining <= 4) {
      recommendation = 'Replenish (Standard 5-day cycle)';
      urgency = 'Moderate';
      suggestedReorderQty = Math.round(dailyBurnRate * 5);
    } else if (daysRemaining > 14) {
      recommendation = 'Downscale Order (-20% to avoid spoilage)';
      urgency = 'Overstocked';
      suggestedReorderQty = 0;
    }

    forecast.push({
      material_id: item.id,
      name: item.name,
      category: item.category,
      unit: item.consumption_unit,
      current_stock: item.current_stock,
      daily_burn_rate: `${dailyBurnRate} ${item.consumption_unit}/day`,
      days_of_inventory_left: daysRemaining,
      recommendation,
      urgency,
      suggested_reorder: suggestedReorderQty > 0 ? `${suggestedReorderQty} ${item.purchase_unit}` : 'None'
    });
  });

  return forecast;
}

export function logWastage({ item_id, item_type, quantity, reason, staff }) {
  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) {
    return { status: 400, data: { success: false, error: 'Valid waste quantity required' } };
  }

  let itemName = item_id;
  let unitCost = 0;
  let unit = 'unit';

  if (item_type === 'sub_recipe') {
    const sub = subRecipesStore.get(item_id);
    if (sub) {
      itemName = sub.name;
      unit = sub.yield_unit;
      sub.current_stock = Math.max(0, Math.round((sub.current_stock - qty) * 100) / 100);
      const costing = getSubRecipes().find(s => s.id === item_id);
      unitCost = costing ? costing.unit_production_cost : 50;
    }
  } else {
    const rm = rawMaterialsStore.get(item_id);
    if (rm) {
      itemName = rm.name;
      unit = rm.consumption_unit;
      rm.current_stock = Math.max(0, Math.round((rm.current_stock - qty) * 100) / 100);
      unitCost = rm.cost_per_unit;
    }
  }

  const lossValue = Math.round(qty * unitCost * 100) / 100;
  const wasteRecord = {
    id: 'WST-' + Date.now().toString().slice(-6),
    item_id,
    item_type: item_type || 'raw',
    item_name: itemName,
    quantity: qty,
    unit,
    loss_value: lossValue,
    reason: reason || 'Spoilage / Prep Trim',
    staff: staff || 'Counter Chef',
    timestamp: new Date().toISOString()
  };

  wastageHistory.unshift(wasteRecord);
  return { status: 200, data: { success: true, wastage: wasteRecord } };
}

export function getWastageHistory() {
  const totalLoss = wastageHistory.reduce((sum, w) => sum + w.loss_value, 0);
  return {
    total_loss_inr: Math.round(totalLoss * 100) / 100,
    records_count: wastageHistory.length,
    history: wastageHistory
  };
}

// ==========================================
// 9. SPEED & EFFICIENCY (< 15 MIN QUICK AUDIT)
// ==========================================

export function performStockAudit(auditEntries) {
  if (!Array.isArray(auditEntries)) {
    return { status: 400, data: { success: false, error: 'auditEntries must be an array' } };
  }

  const reconciliations = [];
  let totalDiscrepancyValue = 0;

  auditEntries.forEach(entry => {
    const rm = rawMaterialsStore.get(entry.material_id);
    if (rm) {
      const physical = parseFloat(entry.physical_count);
      if (!isNaN(physical)) {
        const variance = Math.round((physical - rm.current_stock) * 100) / 100;
        const discrepancyCost = Math.round(variance * rm.cost_per_unit * 100) / 100;
        totalDiscrepancyValue += discrepancyCost;

        reconciliations.push({
          material_id: rm.id,
          name: rm.name,
          system_stock: rm.current_stock,
          physical_count: physical,
          variance,
          discrepancy_value: discrepancyCost,
          unit: rm.consumption_unit
        });

        // Reconcile system to physical reality
        rm.current_stock = physical;
      }
    }
  });

  return {
    status: 200,
    data: {
      success: true,
      audited_items_count: reconciliations.length,
      total_discrepancy_inr: Math.round(totalDiscrepancyValue * 100) / 100,
      timestamp: new Date().toISOString(),
      reconciliations
    }
  };
}

// ==========================================
// 10. RTR TRACKER: RECIPE CONFIG, AUTO-FILL & STAPLES
// ==========================================

/**
 * Intelligent Approx Auto-Fill based on Indian culinary portion benchmarks
 */
export function getApproxAutoFill(dishName = '', category = '') {
  const name = (dishName || '').toLowerCase().trim();
  const cat = (category || '').toLowerCase().trim();

  // 1. Paneer gravies (Paneer Butter Masala, Shahi Paneer, Kadhai Paneer, etc.)
  if (name.includes('paneer') && (name.includes('butter') || name.includes('makhani') || name.includes('shahi') || name.includes('masala') || cat.includes('curry') || cat.includes('main'))) {
    return {
      gravy_id: 'SUB-MAK-01',
      gravy_name: 'Makhani Gravy Base',
      gravy_qty: 0.20,
      protein_id: 'RM-PANEER',
      protein_name: 'Malai Paneer',
      protein_qty: 0.15,
      oil_qty: 0.02,
      veggie_qty: 0.03,
      flour_qty: 0.0,
      butter_qty: 0.02,
      confidence: 'High (Curry / Paneer Base)'
    };
  }

  // 2. Chicken gravies (Butter Chicken, Chicken Tikka Masala, Chicken Curry)
  if (name.includes('chicken') && (name.includes('butter') || name.includes('curry') || name.includes('masala') || name.includes('makhani') || cat.includes('main'))) {
    const isMakhani = name.includes('butter') || name.includes('makhani');
    return {
      gravy_id: isMakhani ? 'SUB-MAK-01' : 'SUB-BROWN-01',
      gravy_name: isMakhani ? 'Makhani Gravy Base' : 'Bhuna Onion-Tomato Gravy Base',
      gravy_qty: 0.22,
      protein_id: 'RM-CHICKEN',
      protein_name: 'Fresh Farm Chicken',
      protein_qty: 0.20,
      oil_qty: 0.02,
      veggie_qty: 0.04,
      flour_qty: 0.0,
      butter_qty: isMakhani ? 0.025 : 0.01,
      confidence: 'High (Poultry Gravy)'
    };
  }

  // 3. Biryani / Pulao
  if (name.includes('biryani') || name.includes('pulao') || name.includes('fried rice')) {
    const hasChicken = name.includes('chicken') || name.includes('murgh') || name.includes('meat');
    const hasPaneer = name.includes('paneer');
    return {
      gravy_id: 'SUB-YAKHNI-01',
      gravy_name: 'Awadhi Dum Biryani Yakhni / Meat Stock Base',
      gravy_qty: 0.15,
      protein_id: hasPaneer ? 'RM-PANEER' : (hasChicken ? 'RM-CHICKEN' : 'RM-ONION'),
      protein_name: hasPaneer ? 'Malai Paneer' : (hasChicken ? 'Fresh Farm Chicken' : 'Fresh Veggies'),
      protein_qty: (hasChicken || hasPaneer) ? 0.18 : 0.08,
      oil_qty: 0.025,
      veggie_qty: 0.06,
      flour_qty: 0.20, // Rice
      butter_qty: 0.015,
      confidence: 'High (Dum Rice / Biryani Base)'
    };
  }

  // 4. Dal (Dal Makhani, Dal Tadka, Yellow Dal)
  if (name.includes('dal') || name.includes('daal') || name.includes('lentil')) {
    return {
      gravy_id: 'SUB-DAL-01',
      gravy_name: 'Dal Makhani Slow-Cook Base',
      gravy_qty: 0.25,
      protein_id: 'RM-BUTTER',
      protein_name: 'Dairy Butter',
      protein_qty: 0.02,
      oil_qty: 0.015,
      veggie_qty: 0.04,
      flour_qty: 0.0,
      butter_qty: 0.02,
      confidence: 'High (Lentil Base)'
    };
  }

  // 5. Rolls / Wraps / Kathi / Roti / Naan / Paratha
  if (name.includes('roll') || name.includes('wrap') || name.includes('roti') || name.includes('naan') || name.includes('paratha')) {
    const hasPaneer = name.includes('paneer');
    const hasChicken = name.includes('chicken');
    return {
      gravy_id: '',
      gravy_name: 'None (Dry Prep)',
      gravy_qty: 0.0,
      protein_id: hasPaneer ? 'RM-PANEER' : (hasChicken ? 'RM-CHICKEN' : ''),
      protein_name: hasPaneer ? 'Malai Paneer' : (hasChicken ? 'Fresh Chicken' : 'None'),
      protein_qty: (hasPaneer || hasChicken) ? 0.10 : 0.0,
      oil_qty: 0.02,
      veggie_qty: 0.04,
      flour_qty: 0.09, // Maida/Atta
      butter_qty: 0.01,
      confidence: 'High (Bread / Roll Base)'
    };
  }

  // 6. Samosa / Snacks
  if (name.includes('samosa') || cat.includes('snack')) {
    return {
      gravy_id: '',
      gravy_name: 'None (Deep Fry Snack)',
      gravy_qty: 0.0,
      protein_id: 'RM-ONION',
      protein_name: 'Spiced Potato & Peas Masala',
      protein_qty: 0.06,
      oil_qty: 0.02,
      veggie_qty: 0.03,
      flour_qty: 0.05,
      butter_qty: 0.0,
      confidence: 'High (Snacks / Samosa)'
    };
  }

  // 7. Tea / Chai / Beverages
  if (name.includes('tea') || name.includes('chai') || cat.includes('tea') || cat.includes('beverage')) {
    return {
      gravy_id: '',
      gravy_name: 'None (Hot Beverage)',
      gravy_qty: 0.0,
      protein_id: 'RM-MILK',
      protein_name: 'Cow Milk (Full Cream)',
      protein_qty: 0.08,
      oil_qty: 0.0,
      veggie_qty: 0.0,
      flour_qty: 0.0,
      butter_qty: 0.0,
      confidence: 'High (Hot Chai / Beverage)'
    };
  }

  // 8. Masala Coke / Cold Beverages
  if (name.includes('coke') || name.includes('cola')) {
    return {
      gravy_id: '',
      gravy_name: 'None (Chilled Soda / Beverage)',
      gravy_qty: 0.0,
      protein_id: 'RM-COLA',
      protein_name: 'Classic Cola Cans/Syrup',
      protein_qty: 1.0,
      oil_qty: 0.0,
      veggie_qty: 0.005,
      flour_qty: 0.0,
      butter_qty: 0.0,
      confidence: 'High (Soda / Masala Coke)'
    };
  }

  // 6. Generic Snack / Starter / Veg Curry fallback
  return {
    gravy_id: 'SUB-BROWN-01',
    gravy_name: 'Bhuna Onion-Tomato Gravy Base',
    gravy_qty: 0.12,
    protein_id: 'RM-PANEER',
    protein_name: 'Malai Paneer / Veg',
    protein_qty: 0.08,
    oil_qty: 0.02,
    veggie_qty: 0.06,
    flour_qty: 0.04,
    butter_qty: 0.01,
    confidence: 'Moderate (Estimated Generic Profile)'
  };
}

/**
 * Creates or updates a dish's portion composition recipe.
 */
export function saveDishRecipe(recipeData) {
  if (!recipeData || !recipeData.dish_name) {
    return { status: 400, data: { success: false, error: 'dish_name is required' } };
  }

  const recipeId = recipeData.id || ('REC-' + recipeData.dish_name.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16));
  const sellingPrice = parseFloat(recipeData.selling_price) || 200;
  const gstPct = parseFloat(recipeData.gst_percentage) || 5;

  let components = [];

  if (Array.isArray(recipeData.components) && recipeData.components.length > 0) {
    components = recipeData.components;
  } else {
    // Construct components from dedicated portion fields
    // 1. Gravy base
    if (recipeData.gravy_id && parseFloat(recipeData.gravy_qty) > 0) {
      const sub = subRecipesStore.get(recipeData.gravy_id);
      components.push({
        type: 'sub_recipe',
        id: recipeData.gravy_id,
        name: sub ? sub.name : 'Gravy Base',
        exact_quantity: parseFloat(recipeData.gravy_qty),
        unit: 'Litre'
      });
    }

    // 2. Cooking Oil
    if (parseFloat(recipeData.oil_qty) > 0) {
      components.push({
        type: 'raw',
        id: 'RM-OIL',
        name: 'Refined Sunflower Oil',
        exact_quantity: parseFloat(recipeData.oil_qty),
        unit: 'Litre'
      });
    }

    // 3. Protein (Paneer / Chicken / Meat)
    if (recipeData.protein_id && parseFloat(recipeData.protein_qty) > 0) {
      const rm = rawMaterialsStore.get(recipeData.protein_id);
      components.push({
        type: 'raw',
        id: recipeData.protein_id,
        name: rm ? rm.name : 'Protein / Main Base',
        exact_quantity: parseFloat(recipeData.protein_qty),
        unit: 'kg'
      });
    }

    // 4. Raw Veggies & Onions
    if (parseFloat(recipeData.veggie_qty) > 0) {
      components.push({
        type: 'raw',
        id: 'RM-ONION',
        name: 'Red Onions & Veggies',
        exact_quantity: parseFloat(recipeData.veggie_qty),
        unit: 'kg'
      });
    }

    // 5. Flour / Maida / Rice
    if (parseFloat(recipeData.flour_qty) > 0) {
      const flourId = recipeData.flour_id || 'RM-MAIDA';
      const rm = rawMaterialsStore.get(flourId);
      components.push({
        type: 'raw',
        id: flourId,
        name: rm ? rm.name : 'Flour / Grains',
        exact_quantity: parseFloat(recipeData.flour_qty),
        unit: 'kg'
      });
    }

    // 6. Butter / Cream
    if (parseFloat(recipeData.butter_qty) > 0) {
      components.push({
        type: 'raw',
        id: 'RM-BUTTER',
        name: 'Dairy Butter',
        exact_quantity: parseFloat(recipeData.butter_qty),
        unit: 'kg'
      });
    }
  }

  const recipe = {
    id: recipeId,
    menu_item_id: recipeData.menu_item_id ? String(recipeData.menu_item_id) : recipeId,
    dish_name: recipeData.dish_name.trim(),
    menu_category: recipeData.menu_category || 'Main Course',
    selling_price: sellingPrice,
    gst_percentage: gstPct,
    components,
    updated_at: new Date().toISOString()
  };

  recipesStore.set(recipe.id, recipe);

  // Recalculate live costing for this single dish
  let dishCost = 0;
  recipe.components.forEach(comp => {
    if (comp.type === 'sub_recipe') {
      const sub = subRecipesStore.get(comp.id);
      if (sub) {
        let subCostPerUnit = 0;
        let subBatchTotal = 0;
        sub.ingredients.forEach(ing => {
          const rm = rawMaterialsStore.get(ing.material_id);
          if (rm) subBatchTotal += (rm.cost_per_unit * ing.quantity);
        });
        subCostPerUnit = sub.yield_quantity > 0 ? (subBatchTotal / sub.yield_quantity) : 0;
        dishCost += (subCostPerUnit * comp.exact_quantity);
      }
    } else {
      const rm = rawMaterialsStore.get(comp.id);
      if (rm) {
        dishCost += (rm.cost_per_unit * comp.exact_quantity);
      }
    }
  });

  const roundedCost = Math.round(dishCost * 100) / 100;
  const profitMargin = sellingPrice > 0 ? Math.round(((sellingPrice - roundedCost) / sellingPrice) * 1000) / 10 : 0;

  return {
    status: 200,
    data: {
      success: true,
      message: `Recipe for '${recipe.dish_name}' configured successfully`,
      recipe,
      costing: {
        cost_per_serving: roundedCost,
        selling_price: sellingPrice,
        profit_per_serving: Math.round((sellingPrice - roundedCost) * 100) / 100,
        gross_margin_percentage: profitMargin
      }
    }
  };
}

/**
 * Updates item alert minimum threshold.
 */
export function updateAlertThreshold(materialId, minThreshold) {
  if (!materialId) return { status: 400, data: { success: false, error: 'material_id is required' } };
  const thresh = parseFloat(minThreshold);
  if (isNaN(thresh) || thresh < 0) return { status: 400, data: { success: false, error: 'Valid threshold is required' } };

  let item = rawMaterialsStore.get(materialId);
  let isSub = false;
  if (!item) {
    item = subRecipesStore.get(materialId);
    isSub = true;
  }

  if (!item) {
    return { status: 404, data: { success: false, error: 'Item not found in inventory' } };
  }

  item.min_threshold = thresh;

  return {
    status: 200,
    data: {
      success: true,
      message: `Minimum alert threshold for ${item.name} set to ${thresh}`,
      item_id: materialId,
      name: item.name,
      min_threshold: thresh,
      current_stock: item.current_stock,
      is_low: item.current_stock <= thresh
    }
  };
}

/**
 * Records a shopping / mandi purchase intake & expense, incrementing stock immediately.
 */
export function recordRestockExpense(data) {
  if (!data || !data.material_id) {
    return { status: 400, data: { success: false, error: 'material_id is required' } };
  }

  const qty = parseFloat(data.quantity);
  if (isNaN(qty) || qty <= 0) {
    return { status: 400, data: { success: false, error: 'Valid positive quantity is required' } };
  }

  let item = rawMaterialsStore.get(data.material_id);
  let isSub = false;
  if (!item) {
    item = subRecipesStore.get(data.material_id);
    isSub = true;
  }

  if (!item) {
    return { status: 404, data: { success: false, error: 'Material not found in inventory' } };
  }

  const oldStock = item.current_stock;
  item.current_stock = Math.round((item.current_stock + qty) * 100) / 100;

  const unitCost = parseFloat(data.unit_cost) || item.cost_per_unit || 0;
  if (data.unit_cost && !isNaN(unitCost) && unitCost > 0) {
    item.cost_per_unit = unitCost;
  }

  const totalExpense = Math.round(qty * unitCost * 100) / 100;

  const logEntry = {
    id: 'EXP-' + Date.now().toString().slice(-6),
    material_id: item.id,
    name: item.name,
    quantity_added: qty,
    unit: item.consumption_unit || item.yield_unit || 'units',
    unit_cost: unitCost,
    total_expense: totalExpense,
    supplier: data.supplier || item.supplier || 'Local Market / Mandi Shopping',
    notes: data.notes || 'Counter restock intake',
    timestamp: new Date().toISOString()
  };

  restockExpensesHistory.unshift(logEntry);

  return {
    status: 200,
    data: {
      success: true,
      message: `Added +${qty} ${logEntry.unit} to ${item.name}. Stock now ${item.current_stock}.`,
      log: logEntry,
      updated_stock: item.current_stock
    }
  };
}

export function getRestockExpenses() {
  return restockExpensesHistory;
}

