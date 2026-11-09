/**
 * scratch/test_adversarial_deep_stress.cjs
 * Empirical challenger tests for complex edge cases:
 * - Price ranges ("100 - 150", "100 / 150")
 * - Trailing commas, single quotes, comments in JSON
 * - Large payloads (1000 items)
 * - HTML / XSS strings in item names
 * - Negative and Infinity values
 * - Multi-block JSON
 */

const assert = require('assert');

async function run() {
  const { cleanParsedPrice, parseMenuJsonSafely } = await import('../server/gemini-service.js');

  console.log('--- Testing Edge Cases ---');

  // Test 1: Price ranges
  console.log('Price range "100 - 150":', cleanParsedPrice("100 - 150"));
  console.log('Price range "100-150":', cleanParsedPrice("100-150"));
  console.log('Price range "100 / 150":', cleanParsedPrice("100 / 150"));

  // Test 2: Infinity
  console.log('Infinity:', cleanParsedPrice(Infinity));
  console.log('-Infinity:', cleanParsedPrice(-Infinity));

  // Test 3: Leading decimal ".50" vs "0.50"
  console.log('".50":', cleanParsedPrice(".50"));
  console.log('"0.50":', cleanParsedPrice("0.50"));

  // Test 4: Trailing dot "50."
  console.log('"50.":', cleanParsedPrice("50."));

  // Test 5: Multiple dots "50..00"
  console.log('"50..00":', cleanParsedPrice("50..00"));

  // Test 6: Malformed / Trailing commas in JSON
  const trailingCommaJson = `
  {
    "menu_categories": [
      {
        "category_name": "Snacks",
        "items": [
          { "item_name": "Samosa", "price": 30, },
        ],
      }
    ]
  }
  `;
  try {
    const res = parseMenuJsonSafely(trailingCommaJson);
    console.log('Trailing comma JSON parsed:', res ? 'SUCCESS' : 'NULL');
  } catch (e) {
    console.log('Trailing comma JSON error:', e.message);
  }

  // Test 7: Large payload (1000 items)
  const largeItems = [];
  for (let i = 0; i < 1000; i++) {
    largeItems.push({
      item_name: `Dish #${i}`,
      price: `Rs. ${i + 10}/-`,
      isVeg: i % 2 === 0
    });
  }
  const largeJson = JSON.stringify({
    menu_categories: [{ category_name: 'Big Menu', items: largeItems }]
  });
  const t0 = Date.now();
  const parsedLarge = parseMenuJsonSafely(largeJson);
  const t1 = Date.now();
  console.log(`Large payload (1000 items) parsed in ${t1 - t0}ms, count = ${parsedLarge.categories[0].items.length}`);

  // Test 8: XSS in item name and description
  const xssJson = JSON.stringify({
    menu_categories: [
      {
        category_name: '<b>Injected Category</b>',
        items: [
          {
            item_name: '<script>alert("xss")</script>Latte',
            description: '<img src=x onerror=alert(1)>',
            price: 150
          }
        ]
      }
    ]
  });
  const parsedXss = parseMenuJsonSafely(xssJson);
  console.log('XSS preserved raw (safe if UI escapes):', parsedXss.categories[0].items[0].name);

  // Test 9: Zero price vs negative
  console.log('Price 0:', cleanParsedPrice(0));
  console.log('Price "0":', cleanParsedPrice("0"));
  console.log('Price "0.00":', cleanParsedPrice("0.00"));
  console.log('Price "-0":', cleanParsedPrice("-0"));
}

run();
