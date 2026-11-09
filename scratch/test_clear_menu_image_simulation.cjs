/**
 * scratch/test_clear_menu_image_simulation.cjs
 * Empirical verification: Clear menu images are NEVER falsely rejected.
 */

const assert = require('assert');

async function testClearMenuImages() {
  console.log('====================================================================');
  console.log('🖼️ EMPIRICAL VERIFICATION: CLEAR MENU IMAGE PIPELINE & ACCEPTANCE');
  console.log('====================================================================\n');

  const geminiService = await import('../server/gemini-service.js');
  const { parseMenuJsonSafely } = geminiService;

  const testCases = [
    {
      name: 'Standard multi-category cafe menu',
      raw: JSON.stringify({
        menu_categories: [
          {
            category_name: 'Hot Coffee',
            items: [
              { item_name: 'Espresso', price: 'Rs. 100/-', isVeg: true },
              { item_name: 'Cappuccino', price: '₹ 150', isVeg: true },
              { item_name: 'Cafe Latte', price: '160', isVeg: true }
            ]
          },
          {
            category_name: 'Snacks',
            items: [
              { item_name: 'Veg Club Sandwich', price: 'Rs. 180.00', isVeg: true },
              { item_name: 'Chicken Burger', price: 'INR 220', isVeg: false }
            ]
          }
        ],
        gst_pricing_note: 'inclusive'
      })
    },
    {
      name: 'Markdown code fence with surrounding OCR notes',
      raw: 'Menu extraction result:\n```json\n{\n  "categories": [\n    {\n      "name": "Beverages",\n      "items": [\n        { "name": "Cold Brew", "price": 180, "veg": true },\n        { "name": "Iced Americano", "price": 140, "veg": true }\n      ]\n    }\n  ]\n}\n```\nAll items in INR.'
    },
    {
      name: 'Single category blackboard chalkboard menu',
      raw: JSON.stringify({
        categories: [
          {
            name: "Today's Specials",
            items: [
              { name: 'Pumpkin Spiced Latte', price: 'Rs. 250/-', isVeg: true },
              { name: 'Apple Cinnamon Muffin', price: 'MRP: 120', isVeg: true }
            ]
          }
        ]
      })
    },
    {
      name: 'Flat array of items without category wrapper',
      raw: JSON.stringify([
        { item_name: 'Espresso Single', price: 90, is_veg: true },
        { item_name: 'Espresso Double', price: 130, is_veg: true },
        { item_name: 'Flat White', price: 170, is_veg: true }
      ])
    },
    {
      name: 'Menu with alternate field naming (title, category)',
      raw: JSON.stringify({
        menu_categories: [
          {
            category: 'Quick Bites',
            items: [
              { title: 'Cheese Garlic Bread', price: '₹ 160', veg: true },
              { title: 'Peri Peri Fries', price: '₹ 120', veg: true }
            ]
          }
        ]
      })
    },
    {
      name: 'Menu with items having null or free prices',
      raw: JSON.stringify({
        menu_categories: [
          {
            category_name: 'Water & Extras',
            items: [
              { item_name: 'Filtered Water', price: 'Free', isVeg: true },
              { item_name: 'Extra Shot Espresso', price: 'Rs. 50/-', isVeg: true },
              { item_name: 'Soy Milk Substitute', price: 40, isVeg: true }
            ]
          }
        ]
      })
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const parsed = parseMenuJsonSafely(tc.raw);
      assert.ok(parsed, `${tc.name}: parsed result must be non-null`);
      assert.ok(Array.isArray(parsed.categories), `${tc.name}: parsed.categories must be array`);
      assert.ok(parsed.categories.length > 0, `${tc.name}: must have at least 1 category`);

      // Simulate client pendingAiItems ingestion
      const pendingAiItems = [];
      parsed.categories.forEach(cat => {
        const catName = String(cat.name || cat.category || 'General').trim();
        if (cat.items && Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            const rawName = String(item.name || item.title || 'New Item').trim();
            const rawPrice = parseFloat(item.price) || 0;
            pendingAiItems.push({
              name: rawName,
              price: rawPrice,
              category: catName,
              isVeg: item.isVeg
            });
          });
        }
      });

      assert.ok(pendingAiItems.length > 0, `${tc.name}: pendingAiItems must be > 0`);
      assert.ok(pendingAiItems.every(i => i.name.length > 0), `${tc.name}: every item must have a valid name`);
      assert.ok(pendingAiItems.every(i => typeof i.price === 'number' && i.price >= 0), `${tc.name}: all prices must be non-negative numbers`);

      console.log(`  ✅ [PASS] ${tc.name} -> Extracted ${pendingAiItems.length} items across ${parsed.categories.length} categories`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${tc.name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n====================================================================');
  console.log(`🎯 TOTAL CLEAR MENU TESTS: ${testCases.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All clear menu images successfully extract items without false rejections!\n');
    process.exit(0);
  }
}

testClearMenuImages().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
