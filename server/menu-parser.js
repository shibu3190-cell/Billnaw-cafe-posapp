/**
 * Local Rule-Based Menu Parser Fallback
 * Extracts categories, items, and prices from text lines when AI services are offline or unauthenticated.
 */

export function parseMenuFromText(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return generateDefaultMenuTemplate();
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const categoriesMap = new Map();
  let currentCategory = 'Popular Items';

  // Common category keywords
  const categoryKeywords = [
    'beverages', 'drinks', 'starters', 'appetizers', 'main course', 'mains', 
    'breads', 'rice', 'biryani', 'desserts', 'snacks', 'combos', 'thali',
    'chinese', 'tandoor', 'soups', 'salads', 'pizza', 'burgers', 'hot beverages', 'cold drinks'
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();
    
    // Check if line looks like a category heading
    const isCategory = categoryKeywords.some(k => lower === k || lower === k + ':' || lower.startsWith(k + ' -')) ||
      (line.length < 30 && !line.match(/\d/) && (line.toUpperCase() === line || line.endsWith(':')));

    if (isCategory) {
      currentCategory = line.replace(/[:\-#]/g, '').trim();
      if (!categoriesMap.has(currentCategory)) {
        categoriesMap.set(currentCategory, []);
      }
      continue;
    }

    // Match item name and price: e.g. "Chicken Biryani ... 180" or "Tea Rs. 20" or "120/-"
    const priceMatch = line.match(/(?:(?:rs\.?|inr|₹)\s*)?(\d{2,5})(?:\s*\/-\s*)?$/i) ||
      line.match(/^(?:(?:rs\.?|inr|₹)\s*)?(\d{2,5})\s*[-–:]\s*(.+)$/i);

    if (priceMatch) {
      let name, price;
      if (priceMatch[2]) {
        price = parseFloat(priceMatch[1]);
        name = priceMatch[2].trim();
      } else {
        price = parseFloat(priceMatch[1]);
        name = line.replace(/(?:(?:rs\.?|inr|₹)\s*)?(\d{2,5})(?:\s*\/-\s*)?$/i, '')
                   .replace(/[\.\-–\t_]+$/, '')
                   .trim();
      }

      if (name && !isNaN(price) && price > 0) {
        if (!categoriesMap.has(currentCategory)) {
          categoriesMap.set(currentCategory, []);
        }
        categoriesMap.get(currentCategory).push({
          name: cleanItemName(name),
          price: price,
          gst: 5
        });
      }
    }
  }

  // If we parsed items, convert map to categories array
  const categories = [];
  for (const [name, items] of categoriesMap.entries()) {
    if (items.length > 0) {
      categories.push({ name, items });
    }
  }

  if (categories.length > 0) {
    return { categories, source: 'local_text_parser' };
  }

  return { categories: [], source: 'empty' };
}

function cleanItemName(str) {
  return str.replace(/^[\d\.\-\)\s]+/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
}

export function generateDefaultMenuTemplate() {
  return {
    categories: [
      {
        name: 'Beverages & Chai',
        items: [
          { name: 'Special Masala Chai', price: 20, gst: 5 },
          { name: 'Fresh Filter Coffee', price: 35, gst: 5 },
          { name: 'Cold Coffee with Ice Cream', price: 80, gst: 5 }
        ]
      },
      {
        name: 'Snacks & Starters',
        items: [
          { name: 'Paneer Pakoda (6 pcs)', price: 110, gst: 5 },
          { name: 'Crispy Veg Spring Rolls', price: 130, gst: 5 },
          { name: 'Chicken Cutlet (2 pcs)', price: 120, gst: 5 }
        ]
      },
      {
        name: 'Mains & Biryani',
        items: [
          { name: 'Kolkata Chicken Biryani', price: 190, gst: 5 },
          { name: 'Mutton Kasha', price: 280, gst: 5 },
          { name: 'Paneer Butter Masala', price: 160, gst: 5 },
          { name: 'Butter Tandoori Roti', price: 25, gst: 5 }
        ]
      }
    ],
    source: 'starter_template'
  };
}
