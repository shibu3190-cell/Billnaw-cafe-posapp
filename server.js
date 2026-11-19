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
import { getShopStatus, getPublicClientConfig, createShopExportBundle, validateShopImportBundle, syncStoreToFirestoreREST, getStoreFromFirestoreREST, deleteStaffFromFirestoreREST, getInvoicesFromFirestoreREST, getStoreStateFromPersistentCache } from './server/sync-service.js';
import { checkAiQuotaAndKey, recordSuccessfulAiUsage, getClientQuotaInfo, updateClientProfileData, releaseAiQuotaSlot, normalizeShopId, getClientProfileData, getCurrentYearMonth } from './server/quota-service.js';
import { parseMenuFromText } from './server/menu-parser.js';
import {
  sendOtp,
  verifyOtp,
  registerUser,
  loginWithPassword,
  verifySession,
  logoutSession,
  listActiveSessions,
  revokeSession,
  revokeSessionsForStore,
  revokeSessionsForUser,
  resetStoreCloudData,
  requestAdminPinResetOtp,
  resetAdminPinWithOtp,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  getShopRecord,
  normalizeEmail,
  isValidEmail,
  normalizeBackendRole,
  createSignedAuthToken,
  verifySignedAuthToken,
  verifyTenantAuthorization,
  hasRolePermission,
  verifyEndpointAccess,
  checkRateLimit
} from './server/auth-service.js';
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

// Global Process Exception & Rejection Handlers for Server Resilience
process.on('unhandledRejection', (reason, promise) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [Server Unhandled Rejection] Reason:`, reason);
  if (reason && reason.stack) {
    console.error(`[${ts}] [Server Unhandled Rejection Stack]:`, reason.stack);
  }
});

process.on('uncaughtException', (err, origin) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [Server Uncaught Exception] Origin: ${origin}, Error:`, err);
  if (err && err.stack) {
    console.error(`[${ts}] [Server Uncaught Exception Stack]:`, err.stack);
  }
});

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
    const rawShop = sanitizeTenantStoreCode(req) || req.query?.shopId || req.query?.clientId || req.query?.storeCode || req.headers['x-shop-id'];
    const shopId = normalizeShopId(rawShop);
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
    const rawId = sanitizeTenantStoreCode(req) || String(req.body?.shopId || req.body?.clientId || '').trim();
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: rawId || undefined,
      requiredPermission: 'admin_quota'
    });
    if (!auth) return;

    const { aiMonthlyLimit, customGeminiKey } = req.body || {};
    if (!rawId || !/^[A-Za-z0-9_-]{3,64}$/.test(rawId)) {
      return res.status(400).json({ success: false, error: 'Valid clientId or shopId is required' });
    }

    const updates = {};
    if (typeof aiMonthlyLimit === 'number' && Number.isFinite(aiMonthlyLimit)) {
      updates.aiMonthlyLimit = Math.max(0, aiMonthlyLimit);
      updates.monthlyLimit = Math.max(0, aiMonthlyLimit);
      updates.limit = Math.max(0, aiMonthlyLimit);
    }
    if (typeof customGeminiKey === 'string') {
      updates.customGeminiKey = customGeminiKey.trim();
    }

    const success = await updateClientProfileData(rawId, updates);
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to update client profile in Firestore' });
    }

    const updatedQuota = await getClientQuotaInfo(rawId);
    res.json({
      success: true,
      message: `Updated quota settings for client '${rawId}'`,
      quota: updatedQuota
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Server-side AI & Runtime Verification Caches
app.post('/api/admin/clear-cache', (req, res) => {
  try {
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: sanitizeTenantStoreCode(req) || undefined,
      requiredPermission: 'admin_quota'
    });
    if (!auth) return;

    clearGeminiCaches();
    res.json({ success: true, message: 'All server memory & verification caches cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
  const rawShop = sanitizeTenantStoreCode(req) || req.query?.shopId || req.query?.clientId || req.headers['x-shop-id'];
  const shopId = normalizeShopId(rawShop);

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
  const rawShop = sanitizeTenantStoreCode(req) || req.body?.shopId || req.query?.shopId || req.body?.clientId || req.query?.clientId || req.headers['x-shop-id'];
  const shopId = normalizeShopId(rawShop);
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

    if (customKey && customKey.length <= 15) {
      if (slotReserved) {
        releaseAiQuotaSlot(shopId);
        slotReserved = false;
      }
      return res.status(401).json({
        error: 'Custom Gemini API key is too short or invalid. Please verify your key in Settings > AI Quota & Custom Key.',
        invalidCustomKey: true
      });
    }

    const isCustomKey = Boolean((customKey && customKey.length > 15) || (keyCheck && keyCheck.isCustomKey));
    const resolvedApiKey = isCustomKey ? (customKey || keyCheck?.apiKey) : resolveGeminiApiKey();

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
        console.warn('[Menu Digitizer] Vision OCR model generation failed:', geminiError?.message || geminiError);
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
    if (!resolvedApiKey) {
      warningMessage = 'Menu digitized using Smart Layout Parser. (Server Gemini key is not configured; tap AI Key to add your key in Settings).';
    } else if (!isOperationalKey) {
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
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: sanitizeTenantStoreCode(req) || undefined,
      requiredPermission: 'manage_menu'
    });
    if (!auth) return;

    const { dishId, dishName, base64Data, mimeType } = req.body || {};
    if (!dishId) {
      return res.status(400).json({ success: false, error: 'dishId is required' });
    }
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'base64Data is required' });
    }

    const trimmedInput = base64Data.trim();
    const dataUrlMatch = trimmedInput.match(/^data:([^;]+);base64,/i);
    if (dataUrlMatch) {
      const prefixMime = dataUrlMatch[1].trim().toLowerCase();
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(prefixMime)) {
        return res.status(400).json({ success: false, error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.' });
      }
    }

    if (mimeType && typeof mimeType === 'string') {
      const cleanMime = mimeType.trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(cleanMime)) {
        return res.status(400).json({ success: false, error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.' });
      }
    }

    const cleanBase64 = trimmedInput.replace(/^data:[^;]+;base64,/i, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ success: false, error: 'base64Data content is empty' });
    }

    let buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Decoded buffer has 0 bytes' });
    }

    const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Payload exceeds 3MB limit (actual size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    const detected = detectImageMagicBytes(buffer);
    if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.'
      });
    }

    const safeDishId = String(dishId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32) || 'dish';
    const now = Date.now();
    const filename = `${safeDishId}_${now}.${detected.ext}`;
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
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: sanitizeTenantStoreCode(req) || undefined,
      requiredPermission: 'manage_menu'
    });
    if (!auth) return;

    const { dishId, base64Data, mimeType, filename: clientFilename } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'base64Data is required' });
    }

    const trimmedInput = base64Data.trim();
    const dataUrlMatch = trimmedInput.match(/^data:([^;]+);base64,/i);
    if (dataUrlMatch) {
      const prefixMime = dataUrlMatch[1].trim().toLowerCase();
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(prefixMime)) {
        return res.status(400).json({ success: false, error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.' });
      }
    }

    const cleanBase64 = trimmedInput.replace(/^data:[^;]+;base64,/i, '').trim();
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
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: sanitizeTenantStoreCode(req) || undefined,
      requiredPermission: 'manage_menu'
    });
    if (!auth) return;

    const rawFilename = req.params.filename;
    if (!rawFilename || typeof rawFilename !== 'string') {
      return res.status(400).json({ success: false, error: 'Filename is required' });
    }

    // Strip null bytes and sanitize using path.basename
    const cleanRaw = rawFilename.replace(/\0/g, '');
    const safeFilename = path.basename(cleanRaw);

    if (!safeFilename || safeFilename === '.' || safeFilename === '..' || cleanRaw.includes('..')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    // Path traversal verification
    const targetPath = path.join(uploadsFoodImagesDir, safeFilename);
    const resolvedPath = path.resolve(targetPath);
    const resolvedUploads = path.resolve(uploadsFoodImagesDir);

    if (!resolvedPath.startsWith(resolvedUploads + path.sep)) {
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
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `verify_req_${clientIp}`,
      limit: 20,
      windowSeconds: 300,
      message: 'Too many verification attempts from this connection. Please wait 5 minutes.'
    });
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }
    const { email, otp, shopName, otpTicket } = req.body || {};
    const result = verifyOtp(email, otp, shopName, null, otpTicket, true);
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
app.post('/api/auth/admin-forgot-pin/reset', async (req, res) => {
  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `pin_reset_req_${clientIp}`,
      limit: 15,
      windowSeconds: 300,
      message: 'Too many PIN reset attempts. Please wait 5 minutes.'
    });
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }
    const { email, otp, newPin, storeCode, staffId, staffName, role, otpTicket } = req.body || {};
    const normEmail = normalizeEmail(email);
    const cleanCode = storeCode ? String(storeCode).trim() : '';
    if (cleanCode && !getShopRecord(cleanCode)) {
      const cloudShop = await getStoreFromFirestoreREST(cleanCode).catch(() => null);
      if (cloudShop && cloudShop.success) {
        const cloudOwner = normalizeEmail(cloudShop.ownerEmail || cloudShop.profile?.ownerEmail || cloudShop.profile?.email || '');
        if (cloudOwner && cloudOwner !== normEmail) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden: email does not match store owner.'
          });
        }
      }
    }
    const result = resetAdminPinWithOtp(email, otp, newPin, storeCode, staffId, staffName, role, otpTicket);
    res.status(result.status || (result.data?.success ? 200 : 400)).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset PIN' });
  }
});

// 2C-2. Account Forgot Password: Send OTP & Reset Password via Email Verification
app.post('/api/auth/forgot-password/send-otp', (req, res) => {
  try {
    const { email } = req.body || {};
    const result = requestPasswordResetOtp(email);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to dispatch password reset code' });
  }
});

app.post('/api/auth/forgot-password/reset', (req, res) => {
  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `pw_reset_req_${clientIp}`,
      limit: 15,
      windowSeconds: 300,
      message: 'Too many password reset attempts. Please wait 5 minutes.'
    });
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }
    const { email, otp, newPassword, otpTicket } = req.body || {};
    const result = resetPasswordWithOtp(email, otp, newPassword, otpTicket);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset password' });
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
    const code = sanitizeTenantStoreCode(req);
    if (!code) return res.status(400).json({ success: false, error: 'Valid storeCode is required' });

    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: code,
      requiredPermission: 'manage_devices'
    });
    if (!auth) return;

    const { deviceId } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    if (CONFIG?.firebase?.projectId && CONFIG?.firebase?.firestoreDatabaseId) {
      const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
      const url = `${base}/cafes/${encodeURIComponent(code)}/devices/${encodeURIComponent(deviceId.trim())}?updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt`;
      const patchRes = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'REVOKED' },
            revokedAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (!patchRes || !patchRes.ok) {
        return res.status(patchRes?.status >= 400 ? patchRes.status : 502).json({
          success: false,
          error: `Firestore device revoke failed (${patchRes?.status || 502})`
        });
      }
    }

    res.json({ success: true, message: `Device ${deviceId} revoked`, status: 'REVOKED' });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

app.post('/api/devices/resume', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) return res.status(400).json({ success: false, error: 'Valid storeCode is required' });

    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: code,
      requiredPermission: 'manage_devices'
    });
    if (!auth) return;

    const { deviceId } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    if (CONFIG?.firebase?.projectId && CONFIG?.firebase?.firestoreDatabaseId) {
      const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
      const url = `${base}/cafes/${encodeURIComponent(code)}/devices/${encodeURIComponent(deviceId.trim())}?updateMask.fieldPaths=status&updateMask.fieldPaths=resumedAt`;
      const patchRes = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'AUTHORIZED' },
            resumedAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (!patchRes || !patchRes.ok) {
        return res.status(patchRes?.status >= 400 ? patchRes.status : 502).json({
          success: false,
          error: `Firestore device resume failed (${patchRes?.status || 502})`
        });
      }
    }

    res.json({ success: true, message: `Device ${deviceId} resumed & authorized`, status: 'AUTHORIZED' });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
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
    const requestedStore = sanitizeTenantStoreCode(req) || '';
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: requestedStore || undefined,
      requiredPermission: 'manage_staff',
      allowBodyToken: false
    });
    if (!auth) return;

    const callerRole = normalizeBackendRole(auth.user?.role || 'Cashier');
    const isSuper = Boolean(auth.isAdminSecret || callerRole === 'SuperAdmin');
    const scopedStoreCode = isSuper ? (requestedStore || auth.storeCode || undefined) : auth.storeCode;
    const rawEmail = req.query?.email;
    const scopedEmail = isSuper
      ? (rawEmail || undefined)
      : (rawEmail && normalizeEmail(rawEmail) === normalizeEmail(auth.user?.email || '') ? rawEmail : undefined);

    const sessions = listActiveSessions(scopedStoreCode, scopedEmail).map(({ token: _rawToken, ...safeSession }) => safeSession);
    res.json({
      success: true,
      storeCode: scopedStoreCode || null,
      count: sessions.length,
      sessions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to list active sessions' });
  }
});

app.post('/api/auth/sessions/revoke', (req, res) => {
  try {
    const requestedStore = sanitizeTenantStoreCode(req) || '';
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: requestedStore || undefined,
      requiredPermission: null,
      allowBodyToken: false
    });
    if (!auth) return;

    const { token, sessionId, storeCode, email, revokeAll, keepCurrent } = req.body || {};
    const authHeader = req.headers.authorization || '';
    const callerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : (req.headers['x-auth-token'] || req.headers['x-session-token'] || '');
    const callerRole = normalizeBackendRole(auth.user?.role || 'Cashier');
    const isSuper = Boolean(auth.isAdminSecret || callerRole === 'SuperAdmin');

    const targetToken = token || sessionId;
    const isSelfRevoke = Boolean(
      !revokeAll &&
      targetToken &&
      callerToken &&
      (targetToken === callerToken ||
        targetToken === ('sess_' + crypto.createHash('sha256').update(callerToken).digest('hex').slice(0, 12)))
    );

    if (!isSelfRevoke) {
      const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'manage_staff' });
      if (!rbac.allowed) {
        return res.status(rbac.status || 403).json({ success: false, error: rbac.error });
      }
    }

    if (revokeAll) {
      const except = keepCurrent ? callerToken : null;
      if (storeCode || !email) {
        if (!isSuper && storeCode && String(storeCode).trim().toUpperCase() !== String(auth.storeCode || '').trim().toUpperCase()) {
          return res.status(403).json({ success: false, error: 'Cross-tenant session revocation forbidden' });
        }
        const targetStore = isSuper ? (storeCode || auth.storeCode) : auth.storeCode;
        const result = revokeSessionsForStore(targetStore, except);
        return res.status(result.status).json(result.data);
      } else if (email) {
        if (!isSuper && normalizeEmail(email) !== normalizeEmail(auth.user?.email || '')) {
          return res.status(403).json({ success: false, error: 'Cross-tenant user session revocation forbidden' });
        }
        const result = revokeSessionsForUser(email, except);
        return res.status(result.status).json(result.data);
      }
    }

    if (!targetToken) {
      return res.status(400).json({ success: false, error: 'target token or sessionId is required' });
    }

    const result = revokeSession(targetToken, isSuper ? null : (auth.storeCode || '__MISSING_STORE__'));
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to revoke session' });
  }
});

// 6B. Store Reset Data (Wipes server & cloud database and reseeds clean demo items)
app.post('/api/store/reset-data', (req, res) => {
  try {
    const requestedStore = sanitizeTenantStoreCode(req) || '';
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: requestedStore || undefined,
      requiredPermission: 'change_settings',
      allowBodyToken: false
    });
    if (!auth) return;

    const targetCode = requestedStore || auth.storeCode;
    if (!targetCode) {
      return res.status(400).json({ success: false, error: 'Valid storeCode is required' });
    }
    const result = resetStoreCloudData(targetCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset store data' });
  }
});

// Strict Multi-Tenant Store Code Validator & Injection Gate
function sanitizeTenantStoreCode(req) {
  const raw = req.body?.storeCode ||
              req.body?.shopId ||
              req.body?.clientId ||
              req.query?.storeCode ||
              req.query?.shopId ||
              req.query?.clientId ||
              req.headers['x-shop-id'] ||
              req.headers['x-store-code'] ||
              req.headers['x-client-id'];
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(clean)) return null;
  return clean;
}

function verifyAdminSecret(req) {
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected) return false;
  const provided = String(req.headers['x-admin-secret'] || '').trim();
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Authoritative Tenant Auth Gate Middleware / Helper
function checkTenantAuth(req, res, targetStoreCode, allowGracefulMigration = true, options = {}) {
  const { allowBodyToken = true, allowQueryToken = true } = options;
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  } else if (allowQueryToken && (req.query?.authToken || req.query?.token)) {
    token = String(req.query.authToken || req.query.token).trim();
  } else if (allowBodyToken && req.body?.token) {
    token = String(req.body.token).trim();
  }

  const auth = verifyTenantAuthorization({ token, targetStoreCode, allowGracefulMigration });
  if (auth.refreshedToken) {
    res.setHeader('x-refreshed-token', auth.refreshedToken);
  }
  return auth;
}

function requireStrictTenantRbac(req, res, { targetStoreCode, requiredPermission, allowBodyToken = true, allowQueryToken = true } = {}) {
  if (verifyAdminSecret(req)) {
    return {
      authorized: true,
      isAdminSecret: true,
      user: { role: 'SuperAdmin', storeCode: targetStoreCode || '*' },
      storeCode: targetStoreCode || ''
    };
  }
  const auth = checkTenantAuth(req, res, targetStoreCode || '', false, { allowBodyToken, allowQueryToken });
  if (!auth.authorized) {
    res.status(auth.status || 401).json({ success: false, error: auth.error });
    return null;
  }
  if (requiredPermission) {
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission });
    if (!rbac.allowed) {
      res.status(rbac.status || 403).json({ success: false, error: rbac.error });
      return null;
    }
  }
  return auth;
}

// 6B2. High-Reliability Store Data & Staff Dual-Sync API (Multi-Tenant Isolated)
app.get('/api/sync/store-data', async (req, res) => {
  try {
    const storeCode = sanitizeTenantStoreCode(req);
    if (!storeCode) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const auth = checkTenantAuth(req, res, storeCode, true);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    const result = await getStoreFromFirestoreREST(storeCode);
    const status = result.status || (result.success ? 200 : 500);
    res.status(status).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Fetch failed' });
  }
});

app.get('/api/sync/invoices', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const auth = checkTenantAuth(req, res, code, true);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const pageToken = req.query.pageToken || null;
    const result = await getInvoicesFromFirestoreREST(code, { pageSize, pageToken });
    res.status(result.success ? 200 : (result.status >= 400 ? result.status : 500)).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch invoices' });
  }
});

app.post('/api/sync/store-data', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required. Cross-tenant data injection prevented.' });
    }
    const auth = checkTenantAuth(req, res, code, true);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    const { ownerEmail, profile, staff, replaceStaff, deletedStaffId, deletedStaffIds, tables, menu, deletedMenuIds, deletedMenuNames, menuVersion, categories, history, expenses, customers, kots } = req.body || {};

    if (staff !== undefined || replaceStaff !== undefined || deletedStaffId !== undefined || deletedStaffIds !== undefined) {
      const staffRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'manage_staff' });
      if (!staffRbac.allowed) {
        return res.status(staffRbac.status || 403).json({ success: false, error: staffRbac.error });
      }
    }
    if (menu !== undefined || deletedMenuIds !== undefined || deletedMenuNames !== undefined || menuVersion !== undefined || categories !== undefined) {
      const menuRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'manage_menu' });
      if (!menuRbac.allowed) {
        return res.status(menuRbac.status || 403).json({ success: false, error: menuRbac.error });
      }
    }
    if (tables !== undefined || history !== undefined || expenses !== undefined || customers !== undefined) {
      const opsRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'take_orders' });
      if (!opsRbac.allowed) {
        return res.status(opsRbac.status || 403).json({ success: false, error: opsRbac.error });
      }
    }

    const settingsRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'change_settings' });
    const hasOperationalPayload = (
      tables !== undefined ||
      kots !== undefined ||
      history !== undefined ||
      customers !== undefined ||
      expenses !== undefined
    );
    if (!settingsRbac.allowed && !hasOperationalPayload && (ownerEmail !== undefined || profile !== undefined)) {
      return res.status(settingsRbac.status || 403).json({ success: false, error: settingsRbac.error });
    }

    // Normalize and link ownerEmail with shop profile only for callers permitted to change settings
    const normalizedEmail = settingsRbac.allowed
      ? (ownerEmail || profile?.ownerEmail || profile?.email || req.headers['x-shop-email'] || '').trim().toLowerCase()
      : '';
    const safeProfile = settingsRbac.allowed && profile
      ? { ...profile, ownerEmail: normalizedEmail || profile.ownerEmail }
      : undefined;

    const result = await syncStoreToFirestoreREST(code, {
      ownerEmail: normalizedEmail || undefined,
      profile: safeProfile,
      staff, replaceStaff, deletedStaffId, deletedStaffIds, tables, menu, deletedMenuIds, deletedMenuNames, menuVersion, categories, history, expenses, customers, kots
    });
    res.status(result.success ? 200 : (result.status >= 400 ? result.status : 500)).json(result);
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
    const auth = checkTenantAuth(req, res, code, true);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'manage_staff' });
    if (!rbac.allowed) {
      return res.status(rbac.status || 403).json({ success: false, error: rbac.error });
    }
    const { staff, replaceStaff, deletedStaffId, deletedStaffIds } = req.body || {};
    const result = await syncStoreToFirestoreREST(code, { staff, replaceStaff, deletedStaffId, deletedStaffIds });
    res.status(result.success ? 200 : (result.status >= 400 ? result.status : 500)).json(result);
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
    const auth = checkTenantAuth(req, res, code, true);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: req, requiredPermission: 'manage_staff' });
    if (!rbac.allowed) {
      return res.status(rbac.status || 403).json({ success: false, error: rbac.error });
    }
    const { staffId, staff } = req.body || {};
    const result = await deleteStaffFromFirestoreREST(code, staffId, staff);
    res.status(result.success ? 200 : (result.status >= 400 ? result.status : 500)).json(result);
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
    const { shopEmail, email: bodyEmail, shopId, storeCode: bodyStoreCode, action, reason, updatedBy } = req.body || {};

    const email = (shopEmail || bodyEmail || req.headers['x-shop-email']) ? normalizeEmail(shopEmail || bodyEmail || req.headers['x-shop-email']) : '';
    const cleanShopId = (shopId || bodyStoreCode || req.headers['x-shop-id']) ? String(shopId || bodyStoreCode || req.headers['x-shop-id']).trim() : '';

    // Enforce strict authentication and RBAC unconditionally (allowGracefulMigration = false)
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: cleanShopId || undefined,
      requiredPermission: 'manage_subscription'
    });
    if (!auth) return;

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

    const callerRole = normalizeBackendRole(auth.user?.role || 'Cashier');
    if (!auth.isAdminSecret && callerRole !== 'SuperAdmin') {
      const authStore = String(auth.storeCode || '').trim().toUpperCase();
      const subStore = String(currentSub.shopId || '').trim().toUpperCase();
      if (!authStore || (subStore && authStore !== subStore)) {
        return res.status(403).json({
          success: false,
          error: `Cross-tenant access forbidden: store [${authStore || 'NONE'}] cannot manage subscription for [${subStore}].`
        });
      }
      if (!cleanShopId && email && auth.user?.email && normalizeEmail(auth.user.email) !== email) {
        return res.status(403).json({
          success: false,
          error: 'Cross-tenant access forbidden: email does not match authenticated account.'
        });
      }
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
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: undefined,
      requiredPermission: 'admin_quota'
    });
    if (!auth) return;

    const callerRole = normalizeBackendRole(auth.user?.role || 'Cashier');
    if (!auth.isAdminSecret && callerRole !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: SuperAdmin privileges required for global data retention purge.'
      });
    }

    const { dryRun = false, now = null } = req.body || {};
    const executionNow = (now !== null && now !== undefined && now !== '')
      ? (typeof now === 'number' ? now : new Date(now).getTime())
      : Date.now();
    if (!Number.isFinite(executionNow)) {
      return res.status(400).json({ success: false, error: 'Invalid now timestamp provided.' });
    }

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

function pruneExpiredReportTokens() {
  const now = Date.now();
  for (const [tok, info] of reportTokens.entries()) {
    if (!info || now > info.expiresAt) {
      reportTokens.delete(tok);
      if (info?.filePath && fs.existsSync(info.filePath)) {
        try { fs.unlinkSync(info.filePath); } catch (_) {}
      }
    }
  }
}

function escapeCsvCell(val) {
  const str = String(val ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

// Offloaded Analytical Reports Generation Endpoint (Requirement R3)
app.post('/api/reports/generate-statement', async (req, res) => {
  try {
    const code = sanitizeTenantStoreCode(req);
    if (!code) {
      return res.status(400).json({ success: false, error: 'A valid storeCode is required.' });
    }

    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: code,
      requiredPermission: 'view_reports'
    });
    if (!auth) return;

    pruneExpiredReportTokens();

    const { startDate, endDate, format = 'csv', transactions } = req.body || {};
    const startMs = startDate ? Date.parse(startDate) : (Date.now() - 30 * 86400000);
    const parseEndMs = (val) => {
      if (!val) return Date.now();
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T23:59:59.999Z`);
      return Date.parse(s);
    };
    const endMs = parseEndMs(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return res.status(400).json({ success: false, error: 'Invalid startDate or endDate provided.' });
    }
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();

    // Collect real settled non-void transactions from request payload, Firestore REST, and in-memory DB
    const seenIds = new Set();
    const collected = [];
    const addTx = (tx) => {
      if (!tx || typeof tx !== 'object') return;
      const st = String(tx.status || 'SETTLED').trim().toUpperCase();
      if (st === 'VOID' || st === 'CANCELLED') return;
      const dt = Date.parse(tx.createdAt || tx.created_at || tx.settled_at || tx.date || '');
      if (Number.isFinite(dt) && (dt < startMs || dt > endMs)) return;
      const txKey = String(tx.id || tx.invoiceNo || tx.billNo || `${dt}_${tx.total || tx.amount || 0}`);
      if (seenIds.has(txKey)) return;
      seenIds.add(txKey);
      collected.push(tx);
    };

    if (Array.isArray(transactions)) {
      transactions.forEach(addTx);
    }

    const cloudStore = await getStoreFromFirestoreREST(code).catch(() => null);
    if (cloudStore && cloudStore.success && Array.isArray(cloudStore.history)) {
      cloudStore.history.forEach(addTx);
    }

    const cachedStoreState = await getStoreStateFromPersistentCache(code).catch(() => null);
    if (cachedStoreState && Array.isArray(cachedStoreState.history)) {
      cachedStoreState.history.forEach(addTx);
    }

    try {
      const db = getDbClient();
      if (db?.memoryStore instanceof Map) {
        for (const [k, v] of db.memoryStore.entries()) {
          if ((k.startsWith(`shops/${code}/invoices/`) || k.startsWith(`cafes/${code}/invoices/`)) && v && typeof v === 'object') {
            addTx(v);
          }
        }
      }
    } catch (_) {}

    const safeFormat = format === 'pdf' ? 'pdf' : 'csv';
    const token = crypto.randomBytes(32).toString('hex');
    const safeStoreSlug = code.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `statement_${safeStoreSlug}_${start.slice(0, 10)}_to_${end.slice(0, 10)}.${safeFormat}`;
    const filePath = path.join(uploadsReportsDir, `${token}_${filename}`);

    const header = 'Date,Bill No,Table,Customer,Items,Payment Mode,Gross (Rs),Tax (Rs),Net Total (Rs),Status';
    const rows = [header];
    for (const tx of collected) {
      const itemsStr = Array.isArray(tx.items)
        ? tx.items.map(i => `${i.name || 'Item'} (x${i.qty || i.quantity || 1})`).join('; ')
        : String(tx.items || '');
      rows.push([
        escapeCsvCell(String(tx.date || tx.createdAt || tx.created_at || tx.settled_at || '').slice(0, 10)),
        escapeCsvCell(tx.billNo || tx.invoiceNo || tx.id || ''),
        escapeCsvCell(tx.table || tx.tableName || 'Counter'),
        escapeCsvCell(tx.customerName || tx.customer?.name || 'Walk-in'),
        escapeCsvCell(itemsStr),
        escapeCsvCell(tx.paymentMode || tx.paymentMethod || 'Cash'),
        escapeCsvCell(Number(tx.grossTotal ?? tx.subtotal ?? tx.total ?? tx.amount ?? 0).toFixed(2)),
        escapeCsvCell(Number(tx.tax ?? tx.gst ?? 0).toFixed(2)),
        escapeCsvCell(Number(tx.total ?? tx.amount ?? 0).toFixed(2)),
        escapeCsvCell(String(tx.status || 'SETTLED').toUpperCase())
      ].join(','));
    }

    const csvContent = rows.join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf8');

    const expiresAtMs = Date.now() + 15 * 60 * 1000;
    reportTokens.set(token, {
      filePath,
      filename,
      format: safeFormat,
      storeCode: code,
      expiresAt: expiresAtMs
    });

    res.json({
      success: true,
      token,
      downloadUrl: `/api/reports/download/${token}?filename=${encodeURIComponent(filename)}`,
      filename,
      totalRecords: collected.length,
      expiresAt: new Date(expiresAtMs).toISOString()
    });
  } catch (err) {
    console.error('[Reports:GenerateStatement] Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Statement generation failed' });
  }
});

// Download Route for Offloaded Reports (Requirement R3)
app.get('/api/reports/download/:token', (req, res) => {
  try {
    const auth = requireStrictTenantRbac(req, res, {
      targetStoreCode: undefined,
      requiredPermission: 'view_reports',
      allowBodyToken: false,
      allowQueryToken: true
    });
    if (!auth) return;

    const { token } = req.params;
    const info = reportTokens.get(token);

    if (!info || Date.now() > info.expiresAt) {
      if (info) {
        reportTokens.delete(token);
        if (info.filePath && fs.existsSync(info.filePath)) {
          try { fs.unlinkSync(info.filePath); } catch (_) {}
        }
      }
      return res.status(404).send('Download link expired or invalid.');
    }

    const callerRole = normalizeBackendRole(auth.user?.role || 'Cashier');
    if (!auth.isAdminSecret && callerRole !== 'SuperAdmin') {
      const authStore = String(auth.storeCode || '').trim().toUpperCase();
      const reportStore = String(info.storeCode || '').trim().toUpperCase();
      if (!authStore || authStore !== reportStore) {
        return res.status(403).json({
          success: false,
          error: `Cross-tenant access forbidden: store [${authStore}] cannot download report for [${reportStore}].`
        });
      }
    }

    const resolvedFile = path.resolve(info.filePath);
    const resolvedDir = path.resolve(uploadsReportsDir);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      return res.status(403).send('Access forbidden: invalid report path.');
    }

    const rawName = String(req.query.filename || info.filename || '');
    const stripped = rawName.replace(/[\r\n\x00-\x1f"';\\\/]/g, '');
    const baseName = path.basename(stripped);
    const ext = info.format === 'pdf' ? '.pdf' : '.csv';
    const safeStem = baseName.replace(/\.(csv|pdf)$/i, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || `statement_${token.slice(0, 8)}`;
    const safeFilename = `${safeStem}${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', info.format === 'pdf' ? 'application/pdf' : 'text/csv');
    res.setHeader('Cache-Control', 'no-store');

    if (fs.existsSync(resolvedFile)) {
      const stream = fs.createReadStream(resolvedFile);
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

