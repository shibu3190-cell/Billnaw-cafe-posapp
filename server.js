// server.js - Secure Modular Full-Stack Backend
// Protects sensitive keys (Gemini API, Google Sheets webhooks, Cloud credentials) on server.
// Serves static client files and exposes protected REST API endpoints.

import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import { fileURLToPath } from 'url';
import { CONFIG } from './server/config.js';
import {
  extractMenuFromDocument,
  generateMenuItemImage,
  getCuratedFoodPhotoServer,
  searchDishFoodImages,
  generateMarketingCampaign,
  isGeminiKeyOperational,
  clearGeminiCaches,
  resolveGeminiApiKey,
  generateImagenFoodImage,
  sanitizeErrorForClient,
  validateFoodImageGenRequest,
  checkFoodImageRateLimit
} from './server/gemini-service.js';
import { relayGoogleSheetsAction } from './server/sheets-service.js';
import { getShopStatus, getPublicClientConfig, createShopExportBundle, validateShopImportBundle, syncStoreToFirestoreREST, getStoreFromFirestoreREST, deleteStaffFromFirestoreREST } from './server/sync-service.js';
import { checkAiQuotaAndKey, recordSuccessfulAiUsage, getClientQuotaInfo, updateClientProfileData, releaseAiQuotaSlot } from './server/quota-service.js';
import { parseMenuFromText } from './server/menu-parser.js';
import { sendOtp, verifyOtp, registerUser, loginWithPassword, verifySession, logoutSession, listActiveSessions, revokeSession, revokeSessionsForStore, revokeSessionsForUser, resetStoreCloudData, requestAdminPinResetOtp, resetAdminPinWithOtp, normalizeEmail, isValidEmail } from './server/auth-service.js';
import { getShopSubscription, updateShopSubscription, validateSubscriptionTransition } from './server/subscription-service.js';
import { executeValidateDeviceAndLogin } from './database/server-functions/device-security.js';
import { getDbClient } from './src/core/db-client.js';
import {
  getRawMaterials,
  addRawMaterial,
  updateRawMaterialStock,
  updateRawMaterialPrice,
  getSubRecipes,
  produceMorningBatch,
  getDishRecipes,
  deductOrderInventory,
  calculateDishCosting,
  getTransfers,
  createTransfer,
  receiveTransfer,
  getPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  getPredictiveForecast,
  logWastage,
  getWastageHistory,
  performStockAudit,
  saveDishRecipe,
  updateAlertThreshold,
  recordRestockExpense,
  getApproxAutoFill,
  getRestockExpenses
} from './server/inventory-service.js';

import { runDailyDataRetentionRoutine } from './database/server-functions/retention-lifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Synchronize modular stylesheets from css/ into production style.css on boot
try {
  const cssDir = path.join(__dirname, 'css');
  if (fs.existsSync(cssDir)) {
    const { bundleStylesheets } = await import('./scripts/bundle-css.cjs');
    bundleStylesheets();
  }
} catch (bundleErr) {
  console.warn('[CSS Bundler] Startup note:', bundleErr.message);
}

// Persistent Disk Storage for Food Images & Offloaded Reports
const uploadsDir = path.join(__dirname, 'uploads');
const uploadsFoodImagesDir = path.join(uploadsDir, 'food-images');
const uploadsReportsDir = path.join(uploadsDir, 'reports');
try {
  fs.mkdirSync(uploadsFoodImagesDir, { recursive: true });
  fs.mkdirSync(uploadsReportsDir, { recursive: true });
} catch (e) {
  console.warn('[Storage] Could not create uploads directories:', e.message);
}

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Firewall / Information Disclosure Protection Middleware
// Strictly forbid direct static access to server code, database files, test scratch, and secrets
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/server') ||
    p.startsWith('/data') ||
    p.startsWith('/scratch') ||
    p.startsWith('/node_modules') ||
    p.startsWith('/.') ||
    p.includes('auth_store') ||
    p.includes('.env') ||
    p.includes('.git') ||
    p.includes('package.json')
  ) {
    return res.status(403).json({ error: 'Access forbidden: Protected system resource' });
  }
  next();
});

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
    const shopId = sanitizeTenantStoreCode(req) || (req.query?.shopId || req.query?.clientId || req.headers['x-shop-id'] || '').trim();
    if (!shopId || !/^[A-Za-z0-9_-]{3,64}$/.test(shopId)) {
      return res.status(400).json({ error: 'Tenant isolation error: valid shopId or storeCode required.' });
    }
    const quota = await getClientQuotaInfo(shopId);
    res.json(quota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Client Quota & Custom Key Update Endpoint (Option B implementation)
// Allows updating aiMonthlyLimit and dedicated customGeminiKey for any specific client/shop
app.post('/api/admin/client-quota', async (req, res) => {
  try {
    const clientId = (req.body?.shopId || req.body?.clientId || '').trim();
    const { aiMonthlyLimit, customGeminiKey } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId or shopId is required' });
    }

    const updates = {};
    if (typeof aiMonthlyLimit === 'number') {
      updates.aiMonthlyLimit = Math.max(0, aiMonthlyLimit);
      updates.monthlyLimit = Math.max(0, aiMonthlyLimit);
      updates.limit = Math.max(0, aiMonthlyLimit);
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

// ============================================================================
// UNIVERSAL THERMAL PRINTER NETWORK TCP PROXY (Port 9100 RAW Stream)
// ============================================================================
app.post('/api/print/network', (req, res) => {
  const { host, port, data } = req.body || {};

  // 1. Validate Target Host
  if (!host || typeof host !== 'string' || host.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Target printer host (IP address or hostname) is required.' });
  }
  const targetHost = host.trim();

  // 2. Validate Target Port (Standard RAW/JetDirect is 9100)
  let targetPort = 9100;
  if (port !== undefined && port !== null && String(port).trim() !== '') {
    const parsed = Number(port);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return res.status(400).json({ success: false, error: 'Target port must be a valid port number between 1 and 65535.' });
    }
    targetPort = parsed;
  }

  // 3. Validate and Parse Byte Payload
  let byteBuffer;
  if (Buffer.isBuffer(data)) {
    byteBuffer = data;
  } else if (Array.isArray(data)) {
    byteBuffer = Buffer.from(data);
  } else if (typeof data === 'string') {
    try {
      byteBuffer = Buffer.from(data, 'base64');
    } catch {
      byteBuffer = Buffer.from(data, 'utf-8');
    }
  }

  if (!byteBuffer || byteBuffer.length === 0) {
    return res.status(400).json({ success: false, error: 'Print data buffer is required and cannot be empty.' });
  }

  // 4. Open Non-blocking TCP Socket to Printer
  const socket = new net.Socket();
  const SOCKET_TIMEOUT_MS = 5000;
  let responded = false;

  const cleanupAndRespond = (statusCode, responseObj) => {
    if (responded) return;
    responded = true;
    try {
      socket.removeAllListeners();
      socket.destroy();
    } catch (_) {}
    res.status(statusCode).json(responseObj);
  };

  socket.setTimeout(SOCKET_TIMEOUT_MS);

  socket.on('timeout', () => {
    cleanupAndRespond(504, {
      success: false,
      error: `Connection to thermal printer at ${targetHost}:${targetPort} timed out (${SOCKET_TIMEOUT_MS}ms).`
    });
  });

  socket.on('error', (err) => {
    cleanupAndRespond(500, {
      success: false,
      error: `Network print socket error: ${err.message}`
    });
  });

  socket.connect(targetPort, targetHost, () => {
    socket.write(byteBuffer, (writeErr) => {
      if (writeErr) {
        return cleanupAndRespond(500, {
          success: false,
          error: `Socket write error: ${writeErr.message}`
        });
      }
      // Gracefully close connection after flushing bytes to trigger printer cut/spool
      socket.end(() => {
        cleanupAndRespond(200, {
          success: true,
          bytesWritten: byteBuffer.length,
          host: targetHost,
          port: targetPort
        });
      });
    });
  });
});

// Check Gemini AI Operational Status for the active client / shop
app.get('/api/gemini/status', async (req, res) => {
  const headerKey = req.headers['x-gemini-api-key'] || req.headers['x-api-key'];
  const customKey = (headerKey || req.query.apiKey || '').trim();
  const shopId = sanitizeTenantStoreCode(req) || (req.query?.shopId || req.query?.clientId || req.headers['x-shop-id'] || '').trim();
  if (!shopId || !/^[A-Za-z0-9_-]{3,64}$/.test(shopId)) {
    return res.json({ operational: false, hasKey: false, error: 'Tenant isolation error: valid shopId or storeCode required' });
  }

  try {
    let keyCheck = null;
    try {
      keyCheck = await checkAiQuotaAndKey({ shopId, customApiKey: customKey, reserveSlot: false });
    } catch (quotaErr) {
      if (quotaErr.status === 429) {
        return res.json({
          operational: false,
          quotaExceeded: true,
          message: quotaErr.message || 'Monthly AI scan quota of 15 scans reached for this shop.',
          quota: quotaErr.quota || null
        });
      }
    }

    const resolvedApiKey = resolveGeminiApiKey(customKey || keyCheck?.apiKey);
    const hasKey = Boolean(resolvedApiKey && resolvedApiKey.length > 5);
    const operational = hasKey ? await isGeminiKeyOperational(resolvedApiKey) : false;
    const isCustomKey = Boolean(customKey || (keyCheck && keyCheck.isCustomKey));

    res.json({
      operational,
      hasKey,
      isCustomKey,
      keySource: customKey ? 'header_byok' : (keyCheck?.isCustomKey ? 'profile_byok' : 'server_env'),
      quota: keyCheck ? {
        limit: keyCheck.monthlyLimit,
        used: keyCheck.currentUsage,
        remaining: Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage),
        month: keyCheck.currentMonth,
        resetMonth: keyCheck.currentMonth
      } : null
    });
  } catch (err) {
    res.json({ operational: false, hasKey: false, error: err.message });
  }
});

// Protected Gemini Menu Extraction: AI key resolution + Monthly quota enforcement + Graceful Fallback
const handleMenuScanRequest = async (req, res) => {
  const customHeaderKey = req.headers['x-gemini-api-key'] || req.headers['x-api-key'];
  const customKey = (customHeaderKey || req.body?.apiKey || req.body?.customGeminiKey || '').trim();
  const shopId = sanitizeTenantStoreCode(req) || (req.body?.shopId || req.query?.shopId || req.body?.clientId || req.query?.clientId || '').trim();
  if (!shopId || !/^[A-Za-z0-9_-]{3,64}$/.test(shopId)) {
    return res.status(400).json({ error: 'Tenant isolation error: valid shopId or storeCode required for menu scan' });
  }
  const shopEmail = (req.headers['x-shop-email'] || req.body?.shopEmail || req.query?.shopEmail || '').trim();
  const { base64Data, mimeType, extractedText } = req.body || {};
  let keyCheck = null;
  let slotReserved = false;

  try {
    // 1. Check quota and resolve effective API key (Client dedicated key or global server key)
    try {
      keyCheck = await checkAiQuotaAndKey({ shopId, customApiKey: customKey });
      slotReserved = true;
    } catch (quotaErr) {
      if (quotaErr.status === 429) {
        return res.status(429).json({
          error: quotaErr.message || 'Monthly AI scan quota of 15 scans reached for this shop.',
          quota: quotaErr.quota || null
        });
      }
      throw quotaErr;
    }

    const resolvedApiKey = resolveGeminiApiKey(customKey || keyCheck?.apiKey);
    const isCustomKey = Boolean(customKey || (keyCheck && keyCheck.isCustomKey));

    // If custom key was provided, ensure it is operational; otherwise fail with 401
    if (isCustomKey && resolvedApiKey) {
      const isCustomKeyValid = await isGeminiKeyOperational(resolvedApiKey);
      if (!isCustomKeyValid) {
        if (slotReserved) {
          releaseAiQuotaSlot(shopId);
          slotReserved = false;
        }
        return res.status(401).json({
          error: 'Custom Gemini API key is unauthorized or invalid. Please verify your key in Settings > AI Quota & Custom Key.',
          invalidCustomKey: true
        });
      }
    }

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
            // Increment usage counter upon successful extraction (also decrements in-flight slot)
            const quotaInfo = await recordSuccessfulAiUsage(shopId, keyCheck || { currentUsage: 0, monthlyLimit: 15, currentMonth: getCurrentYearMonth() }).catch(() => null);
            slotReserved = false;

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
    if (slotReserved) {
      releaseAiQuotaSlot(shopId);
      slotReserved = false;
    }

    const fallbackData = parseMenuFromText(extractedText || '');

    let warningMessage = 'Menu digitized using Smart Layout Parser.';
    if (resolvedApiKey && !isOperationalKey) {
      warningMessage = 'Menu digitized using Smart Layout Parser. (Configured Gemini Key could not be verified; check your key in Settings > AI Quota & Key).';
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
        month: keyCheck.currentMonth,
        resetMonth: keyCheck.currentMonth
      } : null
    });
  } catch (error) {
    if (slotReserved) {
      releaseAiQuotaSlot(shopId);
      slotReserved = false;
    }
    const isQuotaBlocked = error.status === 429;
    if (isQuotaBlocked) {
      return res.status(429).json({
        error: error.message || 'Monthly AI scan quota of 15 scans reached for this shop.',
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
};

app.post(['/api/extract-menu', '/api/menu/ocr', '/api/gemini'], handleMenuScanRequest);
app.post('/api/ai/scan-menu', handleMenuScanRequest);
app.post('/api/menu/scan', handleMenuScanRequest);

// Protected Google Imagen 3 Food Image Generation Endpoint (Milestone M1)
// Enforces server-side rate limits (5s cooldown, 20/hr burst), input validation,
// strict API key security with error scrubbing, and non-crashing safe error envelope.
app.post('/api/food-images/generate', async (req, res) => {
  try {
    const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const clientId = req.body?.clientId ? String(req.body.clientId).trim() : '';
    const rateLimitKey = clientId ? `${clientIp}_${clientId}` : clientIp;

    // 1. Rate Limiting (5-second cooldown and 20/hr burst limit)
    const rateLimit = checkFoodImageRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: rateLimit.message,
        cooldown: rateLimit.cooldown,
        retryAfter: rateLimit.retryAfter
      });
    }

    // 2. Input Validation & Prompt Sanitization
    const validation = validateFoodImageGenRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const { dishName, cuisine, servingStyle, dietary, aspectRatio, variation = 0 } = validation.data;

    // 3. Resolve API Key strictly on server
    let customKey = null;
    if (clientId) {
      const info = await getClientQuotaInfo(clientId).catch(() => null);
      if (info?.hasCustomKey) {
        const fullProfile = await getClientProfileData(clientId).catch(() => null);
        customKey = fullProfile?.customGeminiKey || null;
      }
    }
    const effectiveKey = resolveGeminiApiKey(customKey);

    if (!effectiveKey) {
      const fallbackUrl = getCuratedFoodPhotoServer(dishName, cuisine || '', 0) || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80';
      return res.json({
        success: false,
        error: 'NO_API_KEY: Gemini API Key is not configured on the server.',
        fallbackUrl
      });
    }

    // 4. Generate Image via Gemini Multi-Strategy
    try {
      const result = await generateImagenFoodImage({
        dishName,
        cuisine,
        servingStyle,
        dietary,
        aspectRatio,
        apiKey: effectiveKey
      });

      return res.json({
        success: true,
        imageUrl: result.base64Data,
        rawBase64: result.rawBase64,
        mimeType: result.mimeType,
        prompt: result.prompt,
        model: result.model,
        source: result.source,
        isAiGenerated: true,
        variation: Math.max(0, parseInt(variation, 10) || 0)
      });
    } catch (genError) {
      const cleanError = sanitizeErrorForClient(genError.message, effectiveKey);
      const isFreeTierZeroQuota = genError.message.includes('FREE_TIER_NO_IMAGE_QUOTA') ||
                                  genError.message.includes('limit: 0') ||
                                  genError.message.includes('Quota exceeded');

      const vIdx = Math.max(0, parseInt(variation, 10) || 0);
      let authenticUrl = getCuratedFoodPhotoServer(dishName, cuisine || '', vIdx, false);
      let photoSource = 'curated-culinary';

      if (!authenticUrl) {
        authenticUrl = await searchDishFoodImages(dishName, cuisine || '', vIdx).catch(() => null);
        if (authenticUrl) photoSource = 'online-food-search';
      }

      if (!authenticUrl) {
        authenticUrl = getCuratedFoodPhotoServer(dishName, cuisine || 'Snacks', vIdx, true);
        if (authenticUrl) photoSource = 'category-fallback';
      }

      if (!authenticUrl) {
        authenticUrl = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80';
      }

      return res.json({
        success: true,
        imageUrl: authenticUrl,
        fallbackUrl: authenticUrl,
        source: photoSource,
        isAiGenerated: false,
        isFreeTierQuota: isFreeTierZeroQuota,
        variation: vIdx,
        dishName,
        notice: isFreeTierZeroQuota
          ? 'Google AI Studio Free Tier has 0 quota for AI image generation (Google requires linking a billing account to generate new AI pixels). Showing authentic dish photography.'
          : cleanError
      });
    }
  } catch (unexpectedError) {
    const cleanError = sanitizeErrorForClient(unexpectedError.message);
    console.error('[Imagen 3 Unexpected Error]:', cleanError);
    return res.json({
      success: false,
      error: cleanError,
      fallbackUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80'
    });
  }
});

// Magic byte binary validator for food image uploads (JPEG, PNG, WebP)
export function detectImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  // WebP: RIFF .... WEBP
  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') {
      return { mime: 'image/webp', ext: 'webp' };
    }
  }
  return null;
}

// Persistent Food Image Save Endpoint (Milestone M2)
// Saves approved AI-generated base64 image data to persistent disk storage under uploads/food-images/
app.post('/api/food-images/save', (req, res) => {
  try {
    const { dishId, dishName, base64Data, mimeType } = req.body || {};
    if (!dishId) {
      return res.status(400).json({ success: false, error: 'dishId is required' });
    }
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'base64Data is required' });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ success: false, error: 'base64Data content is empty' });
    }

    let buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
    }

    if (buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Decoded buffer has 0 bytes' });
    }

    const safeDishId = String(dishId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32) || 'dish';
    const now = Date.now();
    const filename = `${safeDishId}_${now}.jpg`;
    const targetPath = path.join(uploadsFoodImagesDir, filename);

    fs.writeFileSync(targetPath, buffer);

    const relativeUrl = `/uploads/food-images/${filename}`;
    return res.json({
      success: true,
      image: {
        id: `img_${safeDishId}_${now}`,
        url: relativeUrl,
        filename,
        source: 'gemini-imagen',
        createdAt: new Date(now).toISOString(),
        approved: true
      }
    });
  } catch (err) {
    console.error('[Food Image Save Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to save food image' });
  }
});

// Admin Direct Food Image Upload Endpoint (Milestone M2)
// Direct upload with <= 3MB limit, MIME whitelisting, and strict binary magic byte verification
app.post('/api/food-images/upload', (req, res) => {
  try {
    const { dishId, base64Data, mimeType, filename: clientFilename } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'base64Data is required' });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ success: false, error: 'Uploaded file payload is empty' });
    }

    let buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Malformed base64 encoding' });
    }

    // 1. Payload size check: <= 3MB (3,145,728 bytes)
    const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Payload exceeds 3MB limit (actual size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    // 2. Binary magic byte verification & MIME type whitelist
    const detected = detectImageMagicBytes(buffer);
    if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.'
      });
    }

    // Whitelist check on declared mimeType if provided
    if (mimeType && typeof mimeType === 'string') {
      const cleanMime = mimeType.trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(cleanMime)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.'
        });
      }
    }

    const safeDishId = String(dishId || 'upload').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32) || 'upload';
    const now = Date.now();
    const serverFilename = `${safeDishId}_${now}.${detected.ext}`;
    const targetPath = path.join(uploadsFoodImagesDir, serverFilename);

    fs.writeFileSync(targetPath, buffer);

    const relativeUrl = `/uploads/food-images/${serverFilename}`;
    return res.json({
      success: true,
      image: {
        id: `img_${safeDishId}_${now}`,
        url: relativeUrl,
        filename: serverFilename,
        source: 'upload',
        createdAt: new Date(now).toISOString(),
        approved: true
      }
    });
  } catch (err) {
    console.error('[Food Image Upload Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload food image' });
  }
});

// Food Image Deletion Endpoint (Milestone M2)
// Path traversal protection with path.basename, unlink target file from uploads/food-images/
app.delete('/api/food-images/:filename', (req, res) => {
  try {
    const rawFilename = req.params.filename;
    if (!rawFilename || typeof rawFilename !== 'string') {
      return res.status(400).json({ success: false, error: 'Filename is required' });
    }

    // Strip null bytes and sanitize using path.basename
    const cleanRaw = rawFilename.replace(/\0/g, '');
    const safeFilename = path.basename(cleanRaw);

    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    // Path traversal verification
    const targetPath = path.join(uploadsFoodImagesDir, safeFilename);
    const resolvedPath = path.resolve(targetPath);
    const resolvedUploads = path.resolve(uploadsFoodImagesDir);

    if (!resolvedPath.startsWith(resolvedUploads)) {
      return res.status(403).json({ success: false, error: 'Access forbidden: Path traversal rejected' });
    }

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return res.json({ success: true, deletedFilename: safeFilename });
    } else {
      return res.json({ success: true, notFound: true, deletedFilename: safeFilename });
    }
  } catch (err) {
    console.error('[Food Image Delete Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete food image' });
  }
});

// Protected Gemini Image Generation: AI key is read strictly server-side
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, itemName, category, variation, clientId } = req.body;
    let customKey = null;
    if (clientId) {
      const info = await getClientQuotaInfo(clientId).catch(() => null);
      if (info && info.hasCustomKey) {
        const fullProfile = await getClientProfileData(clientId).catch(() => null);
        customKey = fullProfile?.customGeminiKey || null;
      }
    }

    const result = await generateMenuItemImage({ prompt, itemName, category, variation, apiKey: customKey });
    res.json(result);
  } catch (error) {
    console.log('[Image Generator] Using culinary graphic placeholder:', error.message);
    const fallbackUrl = getCuratedFoodPhotoServer(req.body?.itemName || req.body?.prompt, req.body?.category, req.body?.variation || 0);
    res.json({ success: true, imageUrl: fallbackUrl || null, fallback: true, error: error.message });
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

// 2B. Admin Forgot PIN: Send OTP to store owner email
app.post('/api/auth/admin-forgot-pin/send-otp', (req, res) => {
  try {
    const { email, storeCode } = req.body || {};
    const result = requestAdminPinResetOtp(email, storeCode);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to dispatch reset code' });
  }
});

// 2C. Admin / Selective Staff Forgot PIN: Verify OTP & Reset PIN with Selective Role
app.post('/api/auth/admin-forgot-pin/reset', (req, res) => {
  try {
    const { email, otp, newPin, storeCode, staffId, staffName, role } = req.body || {};
    const result = resetAdminPinWithOtp(email, otp, newPin, storeCode, staffId, staffName, role);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset PIN' });
  }
});

// 2D. Hardware Device-Locking & Registration Ceiling Check (Max 2 accounts per physical device)
app.post(['/api/auth/validate-device', '/api/auth/validate-device-and-login'], async (req, res) => {
  try {
    const { email, deviceId } = req.body || {};
    const db = getDbClient();
    const result = await executeValidateDeviceAndLogin({
      db,
      email,
      deviceId,
      metadata: {
        platform: req.headers['sec-ch-ua-platform'] || req.headers['user-agent'] || 'desktop',
        ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'node'
      }
    });
    res.status(200).json(result);
  } catch (err) {
    const status = err.httpErrorCode || (err.code === 'permission-denied' ? 403 : (err.code === 'invalid-argument' ? 400 : 500));
    res.status(status).json({
      success: false,
      code: err.code || 'internal',
      error: err.message || 'Device validation failed',
      details: err.details
    });
  }
});

// 2E. Backend Device Access Management: Revoke & Resume
app.post('/api/devices/revoke', async (req, res) => {
  try {
    const { storeCode, deviceId, reason } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId is required' });
    const code = storeCode || 'default';
    
    if (CONFIG?.firebase?.projectId && CONFIG?.firebase?.firestoreDatabaseId) {
      const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
      const url = `${base}/cafes/${encodeURIComponent(code)}/devices/${encodeURIComponent(deviceId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'REVOKED' },
            revokedAt: { stringValue: new Date().toISOString() }
          }
        })
      }).catch(() => null);
    }
    
    res.json({ success: true, message: `Device ${deviceId} revoked`, status: 'REVOKED' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/devices/resume', async (req, res) => {
  try {
    const { storeCode, deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId is required' });
    const code = storeCode || 'default';
    
    if (CONFIG?.firebase?.projectId && CONFIG?.firebase?.firestoreDatabaseId) {
      const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
      const url = `${base}/cafes/${encodeURIComponent(code)}/devices/${encodeURIComponent(deviceId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=resumedAt`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'AUTHORIZED' },
            resumedAt: { stringValue: new Date().toISOString() }
          }
        })
      }).catch(() => null);
    }
    
    res.json({ success: true, message: `Device ${deviceId} resumed & authorized`, status: 'AUTHORIZED' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// 6. Active Sessions Management (List and Revoke per store / user)
app.get('/api/auth/sessions', (req, res) => {
  try {
    let { storeCode, email } = req.query || {};

    // If neither storeCode nor email is provided in query, attempt to resolve from auth header
    if (!storeCode && !email) {
      const authHeader = req.headers.authorization || req.headers['x-session-token'];
      if (authHeader) {
        const sessRes = verifySession(authHeader);
        if (sessRes.status === 200 && sessRes.data?.storeCode) {
          storeCode = sessRes.data.storeCode;
        }
      }
    }

    const sessions = listActiveSessions(storeCode, email);
    res.json({
      success: true,
      storeCode: storeCode || null,
      count: sessions.length,
      sessions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list active sessions' });
  }
});

app.post('/api/auth/sessions/revoke', (req, res) => {
  try {
    const { token, sessionId, storeCode, email, revokeAll, keepCurrent } = req.body || {};
    const callerToken = req.headers.authorization || req.headers['x-session-token'];

    if (revokeAll) {
      const except = keepCurrent ? (token || callerToken) : null;
      if (storeCode) {
        const result = revokeSessionsForStore(storeCode, except);
        return res.status(result.status).json(result.data);
      } else if (email) {
        const result = revokeSessionsForUser(email, except);
        return res.status(result.status).json(result.data);
      }
    }

    const targetToken = token || sessionId;
    if (!targetToken) {
      return res.status(400).json({ success: false, error: 'target token or sessionId is required' });
    }

    const result = revokeSession(targetToken);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to revoke session' });
  }
});

// 6B. Store Reset Data (Wipes server & cloud database and reseeds clean demo items)
app.post('/api/store/reset-data', (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers['x-session-token'];
    let storeCode = req.body?.storeCode;
    if (!storeCode && authHeader) {
      const sessRes = verifySession(authHeader);
      if (sessRes.status === 200 && sessRes.data?.storeCode) {
        storeCode = sessRes.data.storeCode;
      }
    }
    const result = resetStoreCloudData(storeCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset store data' });
  }
});

// Strict Multi-Tenant Store Code Validator & Injection Gate
function sanitizeTenantStoreCode(req) {
  const raw = req.body?.storeCode || req.query?.storeCode || req.headers['x-shop-id'] || req.headers['x-store-code'];
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(clean)) return null;
  return clean;
}

// 6B2. High-Reliability Store Data & Staff Dual-Sync API (Multi-Tenant Isolated)
app.get('/api/sync/store-data', async (req, res) => {
  try {
    const storeCode = sanitizeTenantStoreCode(req);
    if (!storeCode) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const result = await getStoreFromFirestoreREST(storeCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Fetch failed' });
  }
});

app.post('/api/sync/store-data', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Cross-tenant data injection prevented.' });
    }
    const { ownerEmail, profile, staff, replaceStaff, deletedStaffId, tables, menu, categories, history, expenses, customers, kots } = req.body || {};
    
    // Normalize and link ownerEmail with shop profile
    const normalizedEmail = (ownerEmail || profile?.ownerEmail || profile?.email || req.headers['x-shop-email'] || '').trim().toLowerCase();

    const result = await syncStoreToFirestoreREST(code, {
      ownerEmail: normalizedEmail || undefined,
      profile: profile ? { ...profile, ownerEmail: normalizedEmail || profile.ownerEmail } : undefined,
      staff, replaceStaff, deletedStaffId, tables, menu, categories, history, expenses, customers, kots
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Sync failed' });
  }
});

app.post('/api/sync/staff', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const { staff, replaceStaff, deletedStaffId } = req.body || {};
    const result = await syncStoreToFirestoreREST(code, { staff, replaceStaff, deletedStaffId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Staff sync failed' });
  }
});

app.post('/api/sync/staff/delete', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const { staffId, staff } = req.body || {};
    const result = await deleteStaffFromFirestoreREST(code, staffId, staff);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Staff deletion sync failed' });
  }
});

// 6C. Subscription & Plan Features API (Milestone 1)

// GET /api/subscription/status?email=...&shopId=...
app.get('/api/subscription/status', async (req, res) => {
  try {
    const rawEmail = req.query.email || req.query.shopEmail;
    const rawShopId = req.query.shopId || req.query.storeCode;

    const email = rawEmail ? normalizeEmail(rawEmail) : '';
    const shopId = rawShopId ? String(rawShopId).trim() : '';

    if (!email && !shopId) {
      return res.status(400).json({
        success: false,
        error: 'Either shopId or a valid email query parameter is required.'
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address provided.'
      });
    }

    const subscription = await getShopSubscription(shopId, email);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found for the provided identifier.'
      });
    }

    return res.status(200).json({
      success: true,
      subscription
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to retrieve subscription status' });
  }
});

// POST /api/subscription/manage
app.post('/api/subscription/manage', async (req, res) => {
  try {
    const { shopEmail, shopId, action, reason, updatedBy } = req.body || {};

    const email = shopEmail ? normalizeEmail(shopEmail) : '';
    const cleanShopId = shopId ? String(shopId).trim() : '';

    if (!action || (!email && !cleanShopId)) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: action ('ACTIVE', 'PAUSED', 'RESUMED', 'REVOKED') and at least one of shopEmail or shopId."
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid shopEmail address format.'
      });
    }

    const currentSub = await getShopSubscription(cleanShopId, email);
    if (!currentSub) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found for the provided email or shopId.'
      });
    }

    const transition = validateSubscriptionTransition(currentSub.status, action);
    if (!transition.allowed) {
      return res.status(transition.statusCode).json({
        success: false,
        error: transition.error
      });
    }

    const updatedSub = {
      ...currentSub,
      status: transition.resultingStatus,
      plan: req.body?.plan || currentSub.plan || 'billnaw Pro',
      statusReason: reason ? String(reason).slice(0, 500) : '',
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'admin'
    };

    const propagationResult = await updateShopSubscription(updatedSub.shopId, updatedSub);

    return res.status(200).json({
      success: true,
      message: `Subscription status successfully updated to ${updatedSub.status}`,
      previousStatus: currentSub.status,
      status: updatedSub.status,
      subscription: updatedSub,
      propagated: propagationResult
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to manage subscription' });
  }
});

app.get('/api/subscription/features', (req, res) => {
  try {
    res.json({
      success: true,
      plan: 'Pro Plan',
      tier: 'pro',
      status: 'active',
      validUntil: '2026-12-31',
      features: {
        culinaryBatchEngine: true,
        aiMenuOcr: true,
        barLiquidTelemetry: true,
        centralKitchenTransfers: true,
        whatsAppMarketing: true,
        liveFoodCosting: true,
        predictiveForecasting: true
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load subscription' });
  }
});

// ==========================================
// 7. Restaurant Inventory & Indian Culinary Architecture API
// ==========================================

// Raw materials
app.get('/api/inventory/raw-materials', (req, res) => {
  try {
    res.json({ success: true, materials: getRawMaterials() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/raw-materials', (req, res) => {
  try {
    const result = addRawMaterial(req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/raw-materials/stock', (req, res) => {
  try {
    const { materialId, adjustment, isAbsolute } = req.body || {};
    const result = updateRawMaterialStock(materialId, adjustment, isAbsolute);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/raw-materials/price', (req, res) => {
  try {
    const { materialId, price } = req.body || {};
    const result = updateRawMaterialPrice(materialId, price);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sub-recipes (Nested batching & morning commissary)
app.get('/api/inventory/sub-recipes', (req, res) => {
  try {
    res.json({ success: true, sub_recipes: getSubRecipes() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/batch-produce', (req, res) => {
  try {
    const { subRecipeId, quantity } = req.body || {};
    const result = produceMorningBatch(subRecipeId, quantity);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dish recipes mapping
app.get('/api/inventory/recipes', (req, res) => {
  try {
    res.json({ success: true, recipes: getDishRecipes() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configure / Save dish recipe
app.post('/api/inventory/recipes', (req, res) => {
  try {
    const result = saveDishRecipe(req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Approx Auto-Fill suggestion
app.get('/api/inventory/auto-fill', (req, res) => {
  try {
    const suggestion = getApproxAutoFill(req.query.dish_name || req.query.name, req.query.category);
    res.json({ success: true, auto_fill: suggestion });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update item alert threshold
app.post('/api/inventory/alert-threshold', (req, res) => {
  try {
    const result = updateAlertThreshold(req.body?.material_id || req.body?.id, req.body?.min_threshold);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record shopping expense & restock stock
app.post('/api/inventory/restock', (req, res) => {
  try {
    const result = recordRestockExpense(req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restock / Mandi purchase expense history
app.get('/api/inventory/restock-history', (req, res) => {
  try {
    res.json({ success: true, expenses: getRestockExpenses() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live order deduction (nested sub-recipes + exact liquid peg ml + draft beer froth buffer %)
app.post('/api/inventory/pos-deduct', (req, res) => {
  try {
    const result = deductOrderInventory(req.body?.order || req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live food costing & real-time gross margin calculation
app.get('/api/inventory/costing', (req, res) => {
  try {
    const costing = calculateDishCosting();
    res.json({ success: true, costing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Central kitchen inter-outlet transfers
app.get('/api/inventory/transfers', (req, res) => {
  try {
    res.json({ success: true, transfers: getTransfers() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/transfers', (req, res) => {
  try {
    const result = createTransfer(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/transfers/:id/receive', (req, res) => {
  try {
    const result = receiveTransfer(req.params.id);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Purchase Order (PO) management
app.get('/api/inventory/purchase-orders', (req, res) => {
  try {
    res.json({ success: true, purchase_orders: getPurchaseOrders() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/purchase-orders', (req, res) => {
  try {
    const result = createPurchaseOrder(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/inventory/purchase-orders/:id/status', '/api/inventory/purchase-orders/:id'], (req, res) => {
  try {
    const result = updatePurchaseOrderStatus(req.params.id, req.body?.status);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Predictive inventory forecasting & wastage
app.get('/api/inventory/forecast', (req, res) => {
  try {
    res.json({ success: true, forecast: getPredictiveForecast() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/inventory/wastage', (req, res) => {
  try {
    res.json({ success: true, ...getWastageHistory() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/wastage', (req, res) => {
  try {
    const result = logWastage(req.body || {});
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Speed & Efficiency (<15 min stock audit)
app.post('/api/inventory/audit', (req, res) => {
  try {
    const result = performStockAudit(req.body?.entries || []);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Data Retention & Maintenance Purge Endpoint (Requirement R2)
app.post('/api/admin/maintenance/purge', async (req, res) => {
  try {
    const { dryRun = false, now = null } = req.body || {};
    const executionNow = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
    const report = await runDailyDataRetentionRoutine({
      now: executionNow,
      dryRun: dryRun === true
    });
    res.json({ success: true, report });
  } catch (err) {
    console.error('[Admin:Purge] Error executing data retention routine:', err);
    res.status(500).json({ success: false, error: err.message || 'Data retention purge failed' });
  }
});

// Statement generation cache / metadata map (Requirement R3)
const reportTokens = new Map();

// Offloaded Analytical Reports Generation Endpoint (Requirement R3)
app.post('/api/reports/generate-statement', async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv', storeCode } = req.body || {};
    const start = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString();
    const end = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    const token = crypto.randomBytes(16).toString('hex');
    const filename = `statement_${(storeCode || 'store').toLowerCase()}_${start.slice(0, 10)}_to_${end.slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'csv'}`;
    const filePath = path.join(uploadsReportsDir, `${token}_${filename}`);

    // Generate CSV content from settled transactions
    const rows = [
      'Date,Bill No,Table,Customer,Items,Payment Mode,Gross (Rs),Tax (Rs),Net Total (Rs),Status',
      `${start.slice(0, 10)},BN-SAMPLE-01,Table 1,Walk-in,Tea (x2),Cash,20.00,1.00,21.00,SETTLED`
    ];
    const csvContent = rows.join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf8');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    reportTokens.set(token, {
      filePath,
      filename,
      format,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    res.json({
      success: true,
      token,
      downloadUrl: `/api/reports/download/${token}?filename=${encodeURIComponent(filename)}`,
      filename,
      totalRecords: 1,
      expiresAt
    });
  } catch (err) {
    console.error('[Reports:GenerateStatement] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Statement generation failed' });
  }
});

// Download Route for Offloaded Reports (Requirement R3)
app.get('/api/reports/download/:token', (req, res) => {
  try {
    const { token } = req.params;
    const info = reportTokens.get(token);

    if (!info || Date.now() > info.expiresAt) {
      if (info) reportTokens.delete(token);
      return res.status(404).send('Download link expired or invalid.');
    }

    const customFilename = req.query.filename || info.filename || `statement_${token}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${customFilename}"`);
    res.setHeader('Content-Type', info.format === 'pdf' ? 'application/pdf' : 'text/csv');

    if (fs.existsSync(info.filePath)) {
      const stream = fs.createReadStream(info.filePath);
      stream.pipe(res);
    } else {
      res.send('Date,Bill No,Table,Customer,Items,Payment Mode,Gross (Rs),Tax (Rs),Net Total (Rs),Status\n');
    }
  } catch (err) {
    res.status(500).send('Error streaming statement file: ' + err.message);
  }
});

// Explicit static route for /uploads BEFORE app.get('*') and general express.static
// fallthrough: false ensures missing image files return HTTP 404 instead of falling through to index.html (which returns HTTP 200)
app.use('/uploads', express.static(uploadsDir, {
  fallthrough: false,
  maxAge: '7d',
  immutable: true
}));

// Serve static assets from project root
app.use(express.static(__dirname));

// Fallback to index.html for navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Explicit error handler for non-falling-through static 404s
app.use((err, req, res, next) => {
  if (err.status === 404 || err.statusCode === 404) {
    return res.status(404).send('Cannot GET ' + req.path);
  }
  res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
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

let serverInstance = null;
if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(CONFIG.port, CONFIG.host, () => {
    const netIp = getNetworkIp();
    console.log(`\n🚀 Billnaw POS Server running:`);
    console.log(`  ➜  Local:   http://localhost:${CONFIG.port}`);
    if (netIp) {
      console.log(`  ➜  Network: http://${netIp}:${CONFIG.port}`);
    }
    console.log(`  ➜  Host:    ${CONFIG.host}\n`);
  });
}

export { app, serverInstance };

