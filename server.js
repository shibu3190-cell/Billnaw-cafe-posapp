// server.js - Secure Modular Full-Stack Backend
// Protects sensitive keys (Gemini API, Google Sheets webhooks, Cloud credentials) on server.
// Serves static client files and exposes protected REST API endpoints.

import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { CONFIG } from './server/config.js';
import { extractMenuFromDocument, generateMenuItemImage, generateMarketingCampaign, isGeminiKeyOperational, clearGeminiCaches } from './server/gemini-service.js';
import { relayGoogleSheetsAction } from './server/sheets-service.js';
import { getShopStatus, getPublicClientConfig, createShopExportBundle, validateShopImportBundle } from './server/sync-service.js';
import { checkAiQuotaAndKey, recordSuccessfulAiUsage, getClientQuotaInfo, updateClientProfileData } from './server/quota-service.js';
import { parseMenuFromText, generateDefaultMenuTemplate } from './server/menu-parser.js';
import { sendOtp, verifyOtp, registerUser, loginWithPassword, verifySession, logoutSession } from './server/auth-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
const APP_BUILD_TIMESTAMP = Date.now().toString();
const APP_VERSION = "2.4.0";

app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION,
    buildTime: APP_BUILD_TIMESTAMP,
    subscription: {
      plan: 'billnaw Pro',
      status: 'active',
      isFree: true,
      validUntil: 'Lifetime / Free Tier',
      features: [
        'Unlimited Orders & Invoices',
        'Real-Time Firebase Multi-Terminal Sync',
        'Offline PWA Support',
        'Customer Loyalty Directory & Ledger',
        'Kitchen KOT Printing',
        'Thermal Receipt & Dynamic UPI QR',
        'AI Menu OCR Scanner'
      ]
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: APP_VERSION,
    buildTime: APP_BUILD_TIMESTAMP,
    serverTime: new Date().toISOString(),
    geminiConfigured: Boolean(CONFIG.gemini.apiKey),
    geminiKeySource: process.env.GEMINI_API_KEY2 ? 'GEMINI_API_KEY2 (primary)' : (process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY (fallback)' : 'none'),
    sheetsConfigured: Boolean(CONFIG.sheets.defaultWebhookUrl),
    firestoreDb: CONFIG.firebase.firestoreDatabaseId
  });
});

// Safe Client Handshake: Provides runtime client config without exposing private server secrets
app.get('/api/config/client', (req, res) => {
  try {
    const config = getPublicClientConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client AI Quota Info: Returns current month usage, limit, and quota remaining
app.get('/api/ai/quota', async (req, res) => {
  try {
    const clientId = req.query.clientId || 'BONGBHOJ-TERMINAL';
    const quota = await getClientQuotaInfo(clientId);
    res.json(quota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Client Quota & Custom Key Update Endpoint (Option B implementation)
// Allows updating aiMonthlyLimit and dedicated customGeminiKey for any specific client
app.post('/api/admin/client-quota', async (req, res) => {
  try {
    const { clientId, aiMonthlyLimit, customGeminiKey } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const updates = {};
    if (typeof aiMonthlyLimit === 'number') {
      updates.aiMonthlyLimit = Math.max(0, aiMonthlyLimit);
    }
    if (typeof customGeminiKey === 'string') {
      updates.customGeminiKey = customGeminiKey.trim();
    }

    const success = await updateClientProfileData(clientId, updates);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update client profile in Firestore' });
    }

    const updatedQuota = await getClientQuotaInfo(clientId);
    res.json({
      success: true,
      message: `Updated quota settings for client '${clientId}'`,
      quota: updatedQuota
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear Server-side AI & Runtime Verification Caches
app.post('/api/admin/clear-cache', (req, res) => {
  try {
    clearGeminiCaches();
    res.json({ success: true, message: 'All server memory & verification caches cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Gemini AI Operational Status for the active client
app.get('/api/gemini/status', async (req, res) => {
  const { clientId } = req.query;
  try {
    let keyCheck = null;
    if (clientId) {
      try {
        keyCheck = await checkAiQuotaAndKey(clientId);
      } catch (quotaErr) {
        if (quotaErr.status === 429) {
          return res.json({
            operational: false,
            quotaExceeded: true,
            message: 'Monthly AI menu scan quota reached for this store.'
          });
        }
      }
    }

    const resolvedApiKey = (
      keyCheck?.apiKey ||
      CONFIG.gemini.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY2 ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      ''
    ).trim();

    const hasKey = Boolean(resolvedApiKey && resolvedApiKey.length > 5);
    const operational = hasKey ? await isGeminiKeyOperational(resolvedApiKey) : false;

    res.json({
      operational,
      hasKey,
      quota: keyCheck ? {
        limit: keyCheck.monthlyLimit,
        used: keyCheck.currentUsage,
        remaining: Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage),
        month: keyCheck.currentMonth
      } : null
    });
  } catch (err) {
    res.json({ operational: false, hasKey: false, error: err.message });
  }
});

// Protected Gemini Menu Extraction: AI key resolution + Monthly quota enforcement + Graceful Fallback
app.post(['/api/extract-menu', '/api/menu/ocr', '/api/gemini'], async (req, res) => {
  const { base64Data, mimeType, clientId, extractedText } = req.body;
  let keyCheck = null;

  try {
    // 1. Check quota and resolve effective API key (Client dedicated key or global server key)
    try {
      keyCheck = await checkAiQuotaAndKey(clientId);
    } catch (quotaErr) {
      if (quotaErr.status === 429) {
        return res.status(429).json({
          error: quotaErr.message || 'Monthly AI upload quota reached for this store.',
          quota: quotaErr.quota || null
        });
      }
    }

    const resolvedApiKey = (
      keyCheck?.apiKey ||
      CONFIG.gemini.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY2 ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      ''
    ).trim();

    let isOperationalKey = false;
    if (base64Data && resolvedApiKey) {
      try {
        isOperationalKey = await isGeminiKeyOperational(resolvedApiKey);
        if (isOperationalKey) {
          const result = await extractMenuFromDocument({
            base64Data,
            mimeType,
            apiKey: resolvedApiKey
          });

          if (result && Array.isArray(result.categories) && result.categories.length > 0) {
            // Increment usage counter upon successful extraction
            const quotaInfo = await recordSuccessfulAiUsage(clientId, keyCheck || { currentUsage: 0, monthlyLimit: 10, currentMonth: getCurrentYearMonth() }).catch(() => null);

            return res.json({
              ...result,
              isFallback: false,
              quota: quotaInfo
            });
          }
        }
      } catch (geminiError) {
        // Continue to structured layout fallback
      }
    }

    // 2. Fallback parser (Extracts text lines or populates editable category starter)
    const fallbackData = parseMenuFromText(extractedText || '');

    let warningMessage = 'Menu imported via smart layout parser.';
    if (!resolvedApiKey) {
      warningMessage = 'Menu imported via smart layout parser. To enable Google Gemini AI Vision OCR, enter a verified Gemini API Key in Settings > AI Quota & Key.';
    } else if (!isOperationalKey) {
      warningMessage = 'Menu imported via smart layout parser. Note: The configured Gemini API Key could not be authenticated with Google AI. Please check the key in Settings > AI Quota & Key or Settings > Secrets.';
    }

    return res.json({
      categories: fallbackData.categories,
      isFallback: true,
      fallbackSource: fallbackData.source,
      warning: warningMessage,
      quota: keyCheck ? {
        limit: keyCheck.monthlyLimit,
        used: keyCheck.currentUsage,
        remaining: Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage),
        month: keyCheck.currentMonth
      } : null
    });
  } catch (error) {
    const isQuotaBlocked = error.status === 429;
    if (isQuotaBlocked) {
      return res.status(429).json({
        error: error.message || 'Monthly AI upload quota reached for this store.',
        quota: error.quota || null
      });
    }

    console.log('[Menu Digitizer] Handled extraction via smart parser fallback.');
    const fallbackData = parseMenuFromText(extractedText || '');

    return res.json({
      categories: fallbackData.categories,
      isFallback: true,
      fallbackSource: fallbackData.source,
      warning: 'Menu imported via smart layout parser.',
      quota: null
    });
  }
});

// Protected Gemini Image Generation: AI key is read strictly server-side
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, itemName, clientId } = req.body;
    let customKey = null;
    if (clientId) {
      const info = await getClientQuotaInfo(clientId).catch(() => null);
      if (info && info.hasCustomKey) {
        const fullProfile = await getClientProfileData(clientId).catch(() => null);
        customKey = fullProfile?.customGeminiKey || null;
      }
    }

    const result = await generateMenuItemImage({ prompt, itemName, apiKey: customKey });
    res.json(result);
  } catch (error) {
    console.log('[Image Generator] Using culinary graphic placeholder.');
    res.json({ success: false, fallback: true, error: error.message });
  }
});

// Protected Gemini WhatsApp Marketing Campaign Generator
app.post('/api/generate-campaign', async (req, res) => {
  try {
    const { theme, discountPercent, minOrder, validTill, storeName, customNotes, clientId } = req.body;
    let customKey = null;
    if (clientId) {
      const info = await getClientQuotaInfo(clientId).catch(() => null);
      if (info && info.hasCustomKey) {
        const fullProfile = await getClientProfileData(clientId).catch(() => null);
        customKey = fullProfile?.customGeminiKey || null;
      }
    }

    const campaign = await generateMarketingCampaign({
      theme: theme || 'weekend',
      discountPercent: discountPercent || 15,
      minOrder: minOrder || 199,
      validTill: validTill || 'this Sunday',
      storeName: storeName || 'billnaw',
      customNotes: customNotes || '',
      apiKey: customKey
    });

    res.json({ success: true, ...campaign });
  } catch (error) {
    console.log('[Campaign Generator] Error, returning smart fallback:', error.message);
    const store = req.body?.storeName || 'billnaw';
    res.json({
      success: true,
      text: `Hey {customer_name}! ☕ Weekend vibes are in full swing at ${store}!\n\nTreat yourself and your friends to our chef specials. Enjoy 15% OFF your order above ₹199 this week. Show this message at billing! ✨`,
      source: 'fallback'
    });
  }
});

// Protected Google Sheets Proxy: Sheet Webhook URL is managed on the server
app.post('/api/sync-sheets', async (req, res) => {
  try {
    const { webhookUrl, action, clientId, data } = req.body;
    const result = await relayGoogleSheetsAction({
      action,
      clientId,
      data,
      customWebhookUrl: webhookUrl
    });
    res.json(result);
  } catch (error) {
    console.log('[Sheets Proxy] Sync request note:', error.message);
    res.json({ success: false, queued: true, error: error.message });
  }
});

// Backend Shop Status & Firestore Diagnostics
app.get('/api/shop/status', (req, res) => {
  res.json(getShopStatus());
});

// Shop Backup & Export
app.post('/api/shop/export', (req, res) => {
  try {
    const bundle = createShopExportBundle(req.body);
    res.json({ success: true, bundle });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Shop Import Validation
app.post('/api/shop/import-validate', (req, res) => {
  try {
    const summary = validateShopImportBundle(req.body.bundle);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// Authentication & OTP Suite (Milestone 1)
// ==========================================

// 1. Send OTP (Passwordless Login / Signup initiation)
app.post('/api/auth/send-otp', (req, res) => {
  try {
    const { email, purpose } = req.body || {};
    const result = sendOtp(email, purpose);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to dispatch verification code' });
  }
});

// 2. Verify OTP (Validates code, rate-limits attempts, resolves store tenant, mints tokens)
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { email, otp, shopName } = req.body || {};
    const result = verifyOtp(email, otp, shopName);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to verify verification code' });
  }
});

// 3. User Signup (Email + Password account registration)
app.post(['/api/auth/signup', '/api/auth/register'], (req, res) => {
  try {
    const result = registerUser(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create account' });
  }
});

// 4. User Login (Email + Password authentication fallback)
app.post(['/api/auth/login', '/api/auth/login-password'], (req, res) => {
  try {
    const result = loginWithPassword(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to authenticate' });
  }
});

// 5. Session Verification / Refresh
app.all('/api/auth/session', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader || req.headers['x-session-token'] || req.query.token || req.body?.token;
    const result = verifySession(token);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to verify session' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader || req.headers['x-session-token'] || req.body?.token;
    const email = req.body?.email;
    const result = logoutSession(token, email);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Logout failed' });
  }
});

// Serve static assets from project root
app.use(express.static(__dirname));

// Fallback to index.html for navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function getNetworkIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return null;
}

app.listen(CONFIG.port, CONFIG.host, () => {
  const netIp = getNetworkIp();
  console.log(`\n🚀 Billnaw POS Server running:`);
  console.log(`  ➜  Local:   http://localhost:${CONFIG.port}`);
  if (netIp) {
    console.log(`  ➜  Network: http://${netIp}:${CONFIG.port}`);
  }
  console.log(`  ➜  Host:    ${CONFIG.host}\n`);
});
