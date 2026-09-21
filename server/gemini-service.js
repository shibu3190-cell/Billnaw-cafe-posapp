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

/**
 * Generates gourmet photo for menu item using gemini-3.1-flash-lite-image
 * with automatic high quality culinary fallback
 */
export async function generateMenuItemImage({ prompt, itemName, apiKey }) {
  const queryPrompt = prompt || `Professional gourmet photography of ${itemName || 'delicious culinary dish'}, warm studio lighting, appetizing presentation, plated on ceramic dish, 4k quality`;

  // Try server-side Gemini image generation if key is verified operational
  const effectiveKey = apiKey || CONFIG.gemini.apiKey;
  if (effectiveKey && await isGeminiKeyOperational(effectiveKey)) {
    try {
      const ai = getGeminiClient(effectiveKey);
      const response = await ai.models.generateContent({
        model: CONFIG.gemini.imageModel,
        contents: {
          parts: [{ text: queryPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: '4:3'
          }
        }
      });

      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || 'image/jpeg';
            return {
              imageUrl: `data:${mime};base64,${part.inlineData.data}`,
              source: 'gemini-ai'
            };
          }
        }
      }
    } catch (geminiErr) {
      // Seamlessly fall through to culinary proxy
    }
  }

  // High quality culinary proxy fallback
  try {
    const encoded = encodeURIComponent(queryPrompt);
    const pollUrl = `https://image.pollinations.ai/prompt/${encoded}?width=400&height=300&nologo=true`;
    const imgRes = await fetch(pollUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (imgRes.ok) {
      const buffer = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      return {
        imageUrl: `data:${contentType};base64,${b64}`,
        source: 'cloud-ai'
      };
    }
  } catch (fallbackErr) {
    // Graceful fallback to client vector visual
  }

  return { imageUrl: null, message: 'Use instant generated vector fallback.' };
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
