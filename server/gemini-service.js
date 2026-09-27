// server/gemini-service.js - Server-side Gemini AI operations
// Keeps GEMINI_API_KEY secure in server environment memory. No API key is ever exposed to client.

import { GoogleGenAI } from '@google/genai';
import { CONFIG } from './config.js';

const clientsCache = new Map();
const keyVerificationCache = new Map();

export function clearGeminiCaches() {
  clientsCache.clear();
  keyVerificationCache.clear();
  return true;
}

export function resolveGeminiApiKey(customKey = null) {
  const custom = (customKey || '').trim();
  if (custom && custom.length > 5) {
    return custom;
  }
  const defaultKey = (
    CONFIG.gemini.apiKey ||
    'AQ.Ab8RN6KT_02Vdemz8fVUS8n-m5fsz3APL5LBNvca0vgr6quTlA' ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY2 ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ''
  ).trim();
  return defaultKey;
}

export function getGeminiClient(customKey = null) {
  const key = resolveGeminiApiKey(customKey);
  if (!key || key.length < 5) {
    throw new Error('NO_API_KEY: A valid Gemini API key was not found. Please provide a key in backend Secrets (GEMINI_API_KEY) or in Settings.');
  }

  if (!clientsCache.has(key)) {
    clientsCache.set(key, new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    }));
  }

  return clientsCache.get(key);
}

/**
 * Validates whether a Gemini API key is currently active and authenticated.
 * Uses the official GoogleGenAI SDK to test key validity.
 */
export async function isGeminiKeyOperational(apiKey = null) {
  const key = resolveGeminiApiKey(apiKey);
  if (!key || key.length < 5) return false;

  const cached = keyVerificationCache.get(key);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    // Cache successful verification for 5 mins; failed checks only for 5 seconds to catch updated secrets immediately
    const maxAge = cached.operational ? 300000 : 5000;
    if (age < maxAge) {
      return cached.operational;
    }
  }

  const testModels = [
    CONFIG.gemini.model,
    'gemini-3.7-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ].filter(Boolean);
  for (const model of testModels) {
    try {
      const ai = getGeminiClient(key);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
      });

      const operational = Boolean(response && response.text !== undefined);
      if (operational) {
        keyVerificationCache.set(key, { operational: true, timestamp: Date.now() });
        return true;
      }
    } catch (err) {
      const errMsg = String(err?.message || err);
      const isAuthError = err.status === 401 || err.status === 403 || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errMsg.includes('API_KEY_INVALID');
      if (isAuthError) {
        keyVerificationCache.set(key, { operational: false, timestamp: Date.now() });
        return false;
      }
      // If error is model not found or transient, try next model in loop
      continue;
    }
  }

  keyVerificationCache.set(key, { operational: false, timestamp: Date.now() });
  return false;
}

/**
 * Digitizes menu scan/photo/pdf into structured JSON menu
 */
export async function extractMenuFromDocument({ base64Data, mimeType, apiKey }) {
  if (!base64Data) {
    throw new Error('No image or PDF menu data provided.');
  }

  const resolvedKey = resolveGeminiApiKey(apiKey);
  if (!resolvedKey || resolvedKey.length < 5) {
    throw new Error('NO_API_KEY: Gemini API Key is required for Vision OCR.');
  }

  const isOperational = await isGeminiKeyOperational(resolvedKey);
  if (!isOperational) {
    throw new Error('UNAUTHENTICATED: Gemini API key is not operational or lacks active credentials.');
  }

  const ai = getGeminiClient(resolvedKey);
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const promptParts = [
    {
      text: `You are an advanced, specialized Restaurant POS Data Entry Automation Engine. Your sole purpose is to analyze restaurant menu images or PDFs and convert them into a structured database-ready format.

Analyze the provided menu carefully and adhere to these strict rules:
1. EXTRACTION ACCURACY: Extract every food item, beverage, variation, combo, and category exactly as written. Do not summarize or omit anything.
2. PRICE CLEANING: Extract the exact price as a numerical float. Strip away all currency symbols (e.g., $, ₹, £, €, AED) and stray text. If a price is omitted, use null.
3. LAYOUT INTELLIGENCE: Read multi-column, grids, or parallel tables correctly. Do not combine text columns horizontally. Ensure the item text on the left matches its corresponding price on the right.
4. CATEGORIZATION: Group items under their logical menu headings (e.g., Starters, Beverages, Pizzas) as displayed in the image.

Output the final result ONLY as a valid JSON object adhering strictly to this schema:
{
  "menu_categories": [
    {
      "category_name": "Mains",
      "items": [
        {
          "item_name": "Paneer Butter Masala",
          "description": null,
          "price": 320.00
        }
      ]
    }
  ]
}`
    },
    {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64
      }
    }
  ];

  const candidateModels = [...new Set([
    CONFIG.gemini.model,
    'gemini-3.7-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ].filter(Boolean))];
  
  let response = null;
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: promptParts }],
        config: {
          responseMimeType: 'application/json'
        }
      });
      if (response && response.text) break;
    } catch (modelErr) {
      lastError = modelErr;
      const errMsg = String(modelErr?.message || modelErr);
      const isAuthError = modelErr.status === 401 || modelErr.status === 403 || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errMsg.includes('API_KEY_INVALID');
      if (isAuthError) {
        break;
      }
      continue;
    }
  }

  if (!response && lastError) {
    throw lastError;
  }

  const responseText = response?.text ? response.text.trim() : '';
  const cleanedText = responseText.replace(/^```(json)?|```$/gi, '').trim();

  try {
    const rawParsed = JSON.parse(cleanedText);
    // Normalize both menu_categories and categories schemas for POS compatibility
    const rawCategories = rawParsed.menu_categories || rawParsed.categories || [];
    const normalizedCategories = rawCategories.map(cat => ({
      name: cat.category_name || cat.name || 'General',
      items: (cat.items || []).map(item => ({
        name: item.item_name || item.name || '',
        description: item.description || null,
        price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0)
      }))
    }));

    return {
      menu_categories: rawCategories,
      categories: normalizedCategories,
      gst_pricing_note: rawParsed.gst_pricing_note || 'inclusive'
    };
  } catch (err) {
    throw new Error('AI output was not valid JSON');
  }
}

const SERVER_CULINARY_PHOTO_MAP = [
  // 1. Samosa & Crispy Snacks
  {
    keys: ['samosa', 'singara', 'samosha', 'aloo samosa', 'samosa chaat', 'samosachaat', 'punjabi samosa', 'patti samosa', 'keema samosa'],
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601050690123-e18712a206a4?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601050690105-021d7b1d9bf5?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 2. Tea, Chai & Hot Beverages
  {
    keys: ['tea', 'chai', 'masala chai', 'ginger tea', 'cutting chai', 'hot tea', 'kulhad chai', 'kadak chai', 'green tea', 'elaichi chai', 'adrak chai', 'lemon tea', 'black tea'],
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 3. Chicken Curry & Non-Veg Gravies
  {
    keys: ['chicken curry', 'butter chicken', 'chicken masala', 'murgh kari', 'chicken handi', 'kadai chicken', 'mutton curry', 'chicken korma', 'chicken tikka masala', 'chicken gravy', 'rogan josh', 'chicken', 'mutton', 'fish curry'],
    url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 4. Masala Coke, Cola & Fizzy Refreshers
  {
    keys: ['masala coke', 'masala cola', 'spiced coke', 'spiced cola', 'coke', 'coca cola', 'cola', 'pepsi', 'thums up', 'lemon coke', 'diet coke', 'cold drink', 'fizz', 'soda'],
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 5. Biryani & Royal Rice
  {
    keys: ['biryani', 'chicken biryani', 'mutton biryani', 'veg biryani', 'hyderabadi biryani', 'dum biryani', 'pulao', 'jeera rice', 'fried rice', 'egg biryani', 'paneer biryani'],
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 6. Paneer & Veg Main Courses
  {
    keys: ['paneer', 'paneer butter masala', 'paneer tikka', 'shahi paneer', 'kadai paneer', 'matar paneer', 'palak paneer', 'paneer makhani', 'paneer lababdar', 'paneer pasanda', 'veg kadai'],
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 7. Cold Coffee, Frappes & Shakes
  {
    keys: ['cold coffee', 'iced coffee', 'frappe', 'iced latte', 'cold brew', 'ice coffee', 'mocha frappe', 'shake', 'milkshake', 'chocolate shake', 'oreo shake', 'vanilla shake', 'strawberry shake'],
    url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 8. Hot Coffee, Cappuccino & Espresso
  {
    keys: ['coffee', 'cappuccino', 'espresso', 'latte', 'hot coffee', 'americano', 'filter coffee', 'mocha', 'flat white', 'macchiato'],
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 9. Burgers
  {
    keys: ['burger', 'veg burger', 'chicken burger', 'cheese burger', 'crispy burger', 'aloo tikki burger', 'paneer burger', 'slider'],
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 10. Pizza
  {
    keys: ['pizza', 'margherita', 'margherita pizza', 'paneer pizza', 'cheese pizza', 'farmhouse pizza', 'pepperoni', 'veg pizza', 'bbq pizza'],
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 11. French Fries & Finger Snacks
  {
    keys: ['fries', 'french fries', 'peri peri fries', 'potato wedges', 'nuggets', 'cheese balls', 'finger chips', 'crispy corn', 'potatoes'],
    url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 12. Sandwiches & Toasts
  {
    keys: ['sandwich', 'grilled sandwich', 'club sandwich', 'cheese sandwich', 'veg sandwich', 'paneer sandwich', 'toast', 'garlic bread', 'panini'],
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1554433607-66b5efe9d304?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1619096252214-ef06c45683e3?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 13. Momos & Dim Sums
  {
    keys: ['momo', 'momos', 'steamed momos', 'fried momos', 'veg momos', 'chicken momos', 'dim sum', 'dumpling', 'kurkure momos', 'wonton'],
    url: 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 14. South Indian (Dosa, Idli, Vada, Sambar)
  {
    keys: ['dosa', 'masala dosa', 'plain dosa', 'ghee roast', 'paper dosa', 'paneer dosa', 'idli', 'vada', 'medu vada', 'sambar', 'uttapam', 'appam'],
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 15. Lassi, Smoothies & Yogurt Drinks
  {
    keys: ['lassi', 'mango lassi', 'sweet lassi', 'rose lassi', 'smoothie', 'chaas', 'buttermilk', 'mattha'],
    url: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 16. Dal, Curries & Gravies
  {
    keys: ['dal', 'dal makhani', 'dal tadka', 'yellow dal', 'dal fry', 'chole', 'rajma', 'curry', 'chana masala', 'sambhar'],
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 17. Noodles, Pasta & Indo-Chinese
  {
    keys: ['noodles', 'hakka noodles', 'chowmein', 'veg noodles', 'schezwan noodles', 'pasta', 'manchurian', 'chilli chicken', 'chilli paneer', 'pasta alfredo', 'red sauce pasta', 'chinese'],
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 18. Rolls & Wraps
  {
    keys: ['roll', 'kathi roll', 'egg roll', 'paneer roll', 'chicken roll', 'wrap', 'frankie', 'shawarma', 'spring roll'],
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 19. Desserts & Cakes
  {
    keys: ['pastry', 'cake', 'chocolate cake', 'brownie', 'ice cream', 'sundae', 'cheesecake', 'waffle', 'pancake', 'muffin', 'dessert', 'lava cake'],
    url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 20. Indian Sweets (Gulab Jamun, Halwa, Kheer)
  {
    keys: ['gulab jamun', 'rasgulla', 'kheer', 'halwa', 'gajar halwa', 'jalebi', 'sweet', 'mithai', 'rasmalai', 'kaju katli'],
    url: 'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 21. Mocktails, Coolers & Juices
  {
    keys: ['mojito', 'virgin mojito', 'mocktail', 'lemonade', 'fresh lime soda', 'nimbu pani', 'juice', 'orange juice', 'watermelon juice', 'cooler', 'iced tea'],
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 22. Soups
  {
    keys: ['soup', 'tomato soup', 'sweet corn soup', 'hot and sour soup', 'manchow soup', 'chicken soup', 'clear soup', 'mushroom soup'],
    url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1578873375972-04b36021f1e9?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 23. Indian Breads & Tandoor
  {
    keys: ['naan', 'butter naan', 'garlic naan', 'roti', 'tandoori roti', 'paratha', 'aloo paratha', 'laccha paratha', 'kulcha', 'bhature', 'puri', 'poori'],
    url: 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 24. Street Food & Chaat
  {
    keys: ['pav bhaji', 'vada pav', 'pani puri', 'golgappe', 'bhel puri', 'sev puri', 'dahi puri', 'chaat', 'kachori', 'chole bhature'],
    url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601050690123-e18712a206a4?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 25. Breakfast & Eggs
  {
    keys: ['egg', 'omelette', 'omelet', 'egg bhurji', 'boiled egg', 'scrambled egg', 'french toast', 'egg roll', 'breakfast'],
    url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80'
    ]
  },
  // 26. Salads & Bowls
  {
    keys: ['salad', 'caesar salad', 'green salad', 'sprout salad', 'greek salad', 'fruit salad', 'bowl', 'healthy'],
    url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    urls: [
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=600&auto=format&fit=crop&q=80'
    ]
  }
];

export function getCuratedFoodPhotoServer(name, category = '', variation = 0, allowCategoryFallback = true) {
  if (!name && !category) return null;
  const clean = String(name || '').toLowerCase().trim();
  const cleanCat = String(category || '').toLowerCase().trim();
  const vIdx = Math.max(0, parseInt(variation, 10) || 0);

  // 1. Exact full-name match against any keyword
  if (clean) {
    for (const entry of SERVER_CULINARY_PHOTO_MAP) {
      for (const k of entry.keys) {
        if (clean === k) {
          if (entry.urls && entry.urls.length > 0) {
            return entry.urls[vIdx % entry.urls.length];
          }
          return entry.url;
        }
      }
    }
  }

  // 2. High-precision scored keyword match:
  if (clean) {
    let bestEntry = null;
    let highestScore = 0;

    for (const entry of SERVER_CULINARY_PHOTO_MAP) {
      let entryScore = 0;
      for (const k of entry.keys) {
        const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRegex = new RegExp('(?:^|\\s|_|-|\\/)' + escapedK + '(?:$|\\s|_|-|\\/)', 'i');
        if (wordBoundaryRegex.test(clean)) {
          const matchScore = k.length * 10;
          if (matchScore > entryScore) {
            entryScore = matchScore;
          }
        }
      }

      if (entryScore > 0) {
        if (cleanCat && (
          (entry.theme && cleanCat.includes(entry.theme)) ||
          (entry.badge && cleanCat.includes(entry.badge.toLowerCase())) ||
          entry.keys.some(k => cleanCat.includes(k) || k.includes(cleanCat))
        )) {
          entryScore += 50;
        }

        if (entryScore > highestScore) {
          highestScore = entryScore;
          bestEntry = entry;
        }
      }
    }

    if (bestEntry) {
      if (bestEntry.urls && bestEntry.urls.length > 0) {
        return bestEntry.urls[vIdx % bestEntry.urls.length];
      }
      return bestEntry.url;
    }
  }

  // 3. Category level matching with multi-variation image pools
  if (allowCategoryFallback) {
    if (cleanCat.includes('beverage') || cleanCat.includes('drink') || cleanCat.includes('tea') || cleanCat.includes('coffee') || cleanCat.includes('juice')) {
      const bevList = [
        'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80'
      ];
      return bevList[vIdx % bevList.length];
    }
    if (cleanCat.includes('snack') || cleanCat.includes('starter') || cleanCat.includes('appetizer') || cleanCat.includes('quick bite')) {
      const snackList = [
        'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80'
      ];
      return snackList[vIdx % snackList.length];
    }
    if (cleanCat.includes('main') || cleanCat.includes('curry') || cleanCat.includes('course') || cleanCat.includes('meal') || cleanCat.includes('rice') || cleanCat.includes('biryani')) {
      const mainList = [
        'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80'
      ];
      return mainList[vIdx % mainList.length];
    }
    if (cleanCat.includes('dessert') || cleanCat.includes('sweet') || cleanCat.includes('cake') || cleanCat.includes('ice cream') || cleanCat.includes('bakery')) {
      const sweetList = [
        'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80'
      ];
      return sweetList[vIdx % sweetList.length];
    }
    if (cleanCat.includes('fast') || cleanCat.includes('burger') || cleanCat.includes('pizza') || cleanCat.includes('sandwich')) {
      const fastList = [
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80'
      ];
      return fastList[vIdx % fastList.length];
    }
  }

  return null;
}

export function getDishVariationCountServer(name, category = '') {
  if (!name && !category) return 4;
  const clean = String(name || '').toLowerCase().trim();
  const cleanCat = String(category || '').toLowerCase().trim();
  if (clean) {
    for (const entry of SERVER_CULINARY_PHOTO_MAP) {
      for (const k of entry.keys) {
        if (clean === k) {
          return (entry.urls && entry.urls.length > 0) ? entry.urls.length : 4;
        }
      }
    }
    let bestEntry = null;
    let highestScore = 0;
    for (const entry of SERVER_CULINARY_PHOTO_MAP) {
      let entryScore = 0;
      for (const k of entry.keys) {
        const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRegex = new RegExp('(?:^|\\s|_|-|\\/)' + escapedK + '(?:$|\\s|_|-|\\/)', 'i');
        if (wordBoundaryRegex.test(clean)) {
          const matchScore = k.length * 10;
          if (matchScore > entryScore) entryScore = matchScore;
        }
      }
      if (entryScore > 0) {
        if (cleanCat && (
          (entry.theme && cleanCat.includes(entry.theme)) ||
          (entry.badge && cleanCat.includes(entry.badge.toLowerCase())) ||
          entry.keys.some(k => cleanCat.includes(k) || k.includes(cleanCat))
        )) {
          entryScore += 50;
        }
        if (entryScore > highestScore) {
          highestScore = entryScore;
          bestEntry = entry;
        }
      }
    }
    if (bestEntry && bestEntry.urls && bestEntry.urls.length > 0) {
      return bestEntry.urls.length;
    }
  }
  return 4;
}

/**
 * Generates gourmet photo for menu item with Curated Culinary Library as authoritative engine
 * and Gemini AI as a smart culinary visual classifier for unknown/custom dishes.
 */
export async function generateMenuItemImage({ prompt, itemName, category = '', variation = 0, apiKey }) {
  const vIdx = Math.max(0, parseInt(variation, 10) || 0);
  const cleanItemName = (itemName || prompt || '').trim();
  const cleanCat = (category || '').trim();

  // 1. Primary Engine: Direct Curated Culinary Library Match with Variation Cycling
  const directCuratedUrl = getCuratedFoodPhotoServer(cleanItemName, cleanCat, vIdx, false);
  if (directCuratedUrl) {
    return {
      imageUrl: directCuratedUrl,
      source: 'curated-culinary',
      variation: vIdx,
      success: true
    };
  }

  // 2. Secondary Engine: Gemini AI Smart Culinary Visual Classifier for unknown/custom dishes
  const effectiveKey = resolveGeminiApiKey(apiKey);
  if (effectiveKey && await isGeminiKeyOperational(effectiveKey)) {
    try {
      const ai = getGeminiClient(effectiveKey);
      const classificationPrompt = `You are a professional culinary AI classifier.
Given the dish name "${cleanItemName}" and category "${cleanCat}", classify it into the single closest food/beverage visual match from this list:
[samosa, tea, chicken curry, masala coke, biryani, paneer, cold coffee, hot coffee, burger, pizza, fries, sandwich, momos, dosa, lassi, dal, noodles, roll, dessert, sweets, mocktail, soup, naan, chaat, breakfast, salad]

Output strictly a JSON object: {"matched_type": "one_item_from_list"}`;

      const candidateModels = [
        CONFIG.gemini.model,
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-3.7-flash',
        'gemini-flash-latest'
      ].filter(Boolean);

      for (const modelName of candidateModels) {
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 4000));
          const response = await Promise.race([
            ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: classificationPrompt }] }],
              config: {
                responseMimeType: 'application/json'
              }
            }),
            timeoutPromise
          ]);

          if (response && response.text) {
            const parsed = JSON.parse(response.text.trim().replace(/^```(json)?|```$/gi, ''));
            const matchedKey = parsed.matched_type || parsed.category || '';
            if (matchedKey) {
              const classifiedUrl = getCuratedFoodPhotoServer(matchedKey, cleanCat, vIdx, true);
              if (classifiedUrl) {
                return {
                  imageUrl: classifiedUrl,
                  source: 'gemini-culinary-classifier',
                  variation: vIdx,
                  success: true
                };
              }
            }
          }
          break;
        } catch (mErr) {
          continue;
        }
      }
    } catch (geminiErr) {
      // Seamlessly fall through to culinary fallback
    }
  }

  // 3. Fallback to category pool or default appetizing cafe visual
  const fallbackUrl = getCuratedFoodPhotoServer(cleanItemName, cleanCat || 'Snacks', vIdx, true);
  if (fallbackUrl) {
    return {
      imageUrl: fallbackUrl,
      source: 'curated-culinary-fallback',
      variation: vIdx,
      success: true
    };
  }

  return { imageUrl: null, message: 'Use instant generated vector fallback.', variation: vIdx, success: true };
}

/**
 * Generates an appetizing AI WhatsApp promotional campaign tailored to billnaw.
 */
export async function generateMarketingCampaign({
  theme = 'weekend',
  discountPercent = 15,
  minOrder = 199,
  validTill = 'this Sunday',
  storeName = 'billnaw',
  customNotes = '',
  apiKey = null
}) {
  const effectiveKey = resolveGeminiApiKey(apiKey);
  const prompt = `You are a savvy restaurant & cafe marketing copywriter for "${storeName}".
Write an appetizing, warm, and highly engaging WhatsApp marketing message.
The message MUST include the placeholder token "{customer_name}" so it can be personalized for each diner.
Theme: ${theme}
Discount: ${discountPercent}% off (on orders above ₹${minOrder})
Validity: ${validTill}
Store Name: ${storeName}
Additional notes: ${customNotes || 'Dine-in and takeaway available.'}

Guidelines:
- Keep it punchy, friendly, and formatted for WhatsApp with tasteful emojis (☕, ✨, 🍽️, 🌟).
- Length should be around 50 to 80 words.
- Explicitly mention that showing this message unlocks the discount.
- Return ONLY the final message text without markdown backticks or quotes.`;

  if (effectiveKey) {
    try {
      const ai = getGeminiClient(effectiveKey);
      const candidateModels = [
        CONFIG.gemini.model,
        'gemini-2.5-flash',
        'gemini-1.5-flash'
      ].filter(Boolean);

      for (const modelName of candidateModels) {
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3500));
          const response = await Promise.race([
            ai.models.generateContent({
              model: modelName,
              contents: prompt
            }),
            timeoutPromise
          ]);
          if (response && response.text) {
            return {
              text: response.text.trim().replace(/^```(markdown)?|```$/gi, '').trim(),
              source: 'gemini-ai'
            };
          }
        } catch (err) {
          continue;
        }
      }
    } catch (e) {
      // Fall through to fallback
    }
  }

  // Fallback high-converting templates with dynamic variables
  const fallbackTemplates = {
    weekend: `Hey {customer_name}! ☕ Weekend vibes are in full swing at ${storeName}!\n\nTreat yourself and your friends to our chef specials and delicious cafe favorites. Enjoy a flat *${discountPercent}% OFF* on all orders above ₹${minOrder} until ${validTill}.\n\nShow this WhatsApp message at billing to claim your discount. See you soon! ✨🍽️`,
    vip: `Dear {customer_name} 💎, thank you for being one of our most valued patrons at ${storeName}!\n\nTo thank you for your loyalty, we have unlocked an exclusive *${discountPercent}% OFF* for you on your next visit (Min order ₹${minOrder}).\n\nOffer valid till ${validTill}. We look forward to serving you again! ☕✨`,
    inactive: `We miss you, {customer_name}! ☕ It's been a while since your last visit to ${storeName}.\n\nYour favorite corner table and fresh brews are waiting for you. Drop by this week and enjoy *${discountPercent}% OFF* your bill with code *WELCOMEBACK* (Min order ₹${minOrder}).\n\nValid till ${validTill}. Drop in today! 🌟`,
    loyalty: `Special Loyalty Rewards for you, {customer_name}! 🪙\n\nEarn 2X Loyalty Points and get *${discountPercent}% OFF* on your cafe bill this week at ${storeName} (Min order ₹${minOrder}). Valid till ${validTill}.\n\nShow this message at counter checkout to redeem. Cheers! ☕🍽️`
  };

  return {
    text: fallbackTemplates[theme] || fallbackTemplates.weekend,
    source: 'template-engine'
  };
}
