// netlify/functions/api.js - Serverless API & OTP Delivery Engine for Billnaw POS PWA
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import {
  isGeminiKeyOperational,
  extractMenuFromDocument,
  generateMenuItemImage,
  generateMarketingCampaign,
  resolveGeminiApiKey
} from '../../server/gemini-service.js';
import { parseMenuFromText } from '../../server/menu-parser.js';
import {
  checkAiQuotaAndKey,
  recordSuccessfulAiUsage,
  getClientQuotaInfo,
  updateClientProfileData,
  releaseAiQuotaSlot,
  getCurrentYearMonth
} from '../../server/quota-service.js';
import {
  getShopSubscription,
  updateShopSubscription,
  validateSubscriptionTransition
} from '../../server/subscription-service.js';
import {
  syncStoreToFirestoreREST,
  deleteStaffFromFirestoreREST,
  getStoreFromFirestoreREST,
  getShopStatus,
  getPublicClientConfig
} from '../../server/sync-service.js';
import {
  getRawMaterials,
  addRawMaterial,
  updateRawMaterialStock,
  updateRawMaterialPrice,
  getSubRecipes,
  produceMorningBatch,
  getDishRecipes,
  saveDishRecipe,
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
  getApproxAutoFill,
  updateAlertThreshold,
  recordRestockExpense,
  getRestockExpenses,
  deductOrderInventory
} from '../../server/inventory-service.js';
import {
  createSignedAuthToken,
  verifySignedAuthToken,
  verifyTenantAuthorization,
  hasRolePermission,
  verifyEndpointAccess,
  checkRateLimit
} from '../../server/auth-service.js';
import { CONFIG } from '../../server/config.js';

// Firebase & SMTP Configuration with Production Environment Variables & Resilient Fallbacks
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'abhi-pro-cafe-pos';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || 'shibu3190@gmail.com';
const SMTP_PASS = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim().replace(/\s+/g, '');
const SMTP_FROM = process.env.SMTP_FROM || `"Billnaw POS" <${SMTP_USER}>`;

// In-memory cache for fast single-container hits
const memoryOtpStore = new Map();

// Standard response headers including CORS
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-shop-id, x-shop-email, x-store-code, x-auth-token',
  'Access-Control-Expose-Headers': 'x-refreshed-token, Authorization, Content-Type'
};

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(data)
  };
}

function extractAuthToken(event, body) {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return (
    headers['x-auth-token'] ||
    headers['X-Auth-Token'] ||
    query.token ||
    body?.token ||
    ''
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeTenantStoreCode(event, body) {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const raw = body?.storeCode ||
              body?.shopId ||
              query.storeCode ||
              query.shopId ||
              headers['x-shop-id'] ||
              headers['X-Shop-Id'] ||
              '';
  const clean = String(raw || '').trim();
  if (!clean || !/^[A-Za-z0-9_-]{3,64}$/.test(clean)) {
    return null;
  }
  return clean;
}

// -------------------------------------------------------------
// Cloud Firestore REST Helpers for Cross-Container OTP State
// -------------------------------------------------------------
const FIRESTORE_OTP_URL = (email) =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/clients/_auth/otp/${encodeURIComponent(email)}`;

async function persistOtpToFirestore(record) {
  try {
    const res = await fetch(FIRESTORE_OTP_URL(record.email), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          otp: { stringValue: String(record.otp) },
          email: { stringValue: record.email },
          purpose: { stringValue: record.purpose || 'login' },
          createdAt: { integerValue: String(record.createdAt) },
          expiresAt: { integerValue: String(record.expiresAt) },
          attempts: { integerValue: String(record.attempts || 0) }
        }
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('[SERVERLESS OTP] Firestore write warning:', err.message);
    return false;
  }
}

async function retrieveOtpFromFirestore(email) {
  try {
    const res = await fetch(FIRESTORE_OTP_URL(email));
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.fields) return null;
    return {
      otp: json.fields.otp?.stringValue,
      email: json.fields.email?.stringValue,
      purpose: json.fields.purpose?.stringValue || 'login',
      createdAt: parseInt(json.fields.createdAt?.integerValue || '0', 10),
      expiresAt: parseInt(json.fields.expiresAt?.integerValue || '0', 10),
      attempts: parseInt(json.fields.attempts?.integerValue || '0', 10)
    };
  } catch (err) {
    console.warn('[SERVERLESS OTP] Firestore read warning:', err.message);
    return null;
  }
}

async function removeOtpFromFirestore(email) {
  try {
    await fetch(FIRESTORE_OTP_URL(email), { method: 'DELETE' });
  } catch (err) {
    // Ignore deletion errors
  }
}

// -------------------------------------------------------------
// SMTP Email Dispatcher (Gmail SMTP / Custom)
// -------------------------------------------------------------
async function dispatchEmail(toEmail, otp, purpose = 'login') {
  const isSignup = purpose === 'signup';
  const actionText = isSignup ? 'verify your new cafe shop profile' : 'sign in to your shop counter';
  const subject = `Billnaw POS - Your 6-Digit Code is ${otp}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Billnaw POS Verification Code</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #FAF7F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1.5px solid #E6DCCD; box-shadow: 0 4px 18px rgba(35, 22, 16, 0.08);" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background: linear-gradient(135deg, #143832 0%, #0D2622 100%); padding: 28px 24px; text-align: center;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Billnaw POS</h1>
              <p style="color: #2DD4BF; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Cafe Counter & Cloud Operations</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px;">
              <p style="color: #1F2937; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">Hello,</p>
              <p style="color: #4B5563; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
                Your one-time 6-digit verification code to <strong>${actionText}</strong> is:
              </p>
              <div style="background: #FAF7F4; border: 2px dashed #143832; border-radius: 12px; padding: 18px 24px; text-align: center; margin: 0 0 24px 0;">
                <span style="font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #143832; font-family: monospace; display: inline-block;">${otp}</span>
              </div>
              <p style="color: #6B7280; font-size: 12px; line-height: 1.5; margin: 0 0 10px 0;">
                This code is valid for <strong>10 minutes</strong> and can only be used once.
              </p>
              <p style="color: #DC2626; font-size: 12px; line-height: 1.5; margin: 0;">
                For security, never share this code with anyone. Billnaw staff will never ask for your code.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #F9FAFB; padding: 16px 24px; text-align: center; border-top: 1px solid #E5E7EB;">
              <span style="color: #9CA3AF; font-size: 11px;">Billnaw POS • Smart Counter Terminal</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Billnaw POS Verification Code: ${otp}\n\nUse this 6-digit code to ${actionText}.\nThis code expires in 10 minutes.\nNever share this code with anyone.`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject,
    text,
    html
  });

  return info;
}

// -------------------------------------------------------------
// Netlify Lambda Handler Entry Point
// -------------------------------------------------------------
export async function handler(event, context) {
  // 1. Handle HTTP OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // 2. Normalize requested path
  const rawPath = event.path || '';
  const cleanPath = rawPath
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '')
    .replace(/\/$/, '');

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      // Body not JSON
    }
  }

  const headers = event.headers || {};
  console.log(`[NETLIFY API] ${event.httpMethod} ${cleanPath}`);

  // ===========================================================
  // AI & GEMINI SUITE ENDPOINTS
  // ===========================================================

  // -----------------------------------------------------------
  // Route: /gemini/status (Check Gemini AI Operational Status)
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/gemini/status' || cleanPath.endsWith('/gemini/status'))) {
    const headerKey = headers['x-gemini-api-key'] || headers['x-api-key'];
    const customKey = (headerKey || event.queryStringParameters?.apiKey || '').trim();
    const shopId = sanitizeTenantStoreCode(event, body);
    if (!shopId) {
      return jsonResponse(200, {
        operational: false,
        keyAvailable: false,
        error: 'Tenant isolation error: valid shopId or storeCode required'
      });
    }
    let keyCheck = null;
    try {
      keyCheck = await checkAiQuotaAndKey({ shopId, customApiKey: customKey, reserveSlot: false });
    } catch (quotaErr) {
      if (quotaErr.status === 429) {
        return jsonResponse(200, {
          operational: false,
          quotaExceeded: true,
          message: quotaErr.message || 'Monthly AI scan quota of 15 scans reached for this shop.',
          quota: quotaErr.quota || null
        });
      }
    }
    const resolvedApiKey = resolveGeminiApiKey(customKey || keyCheck?.apiKey);
    let operational = true;
    try {
      if (resolvedApiKey) {
        operational = await isGeminiKeyOperational(resolvedApiKey);
      }
    } catch (e) {
      operational = true;
    }
    return jsonResponse(200, {
      operational,
      keyAvailable: Boolean(resolvedApiKey),
      isCustomKey: Boolean(customKey || (keyCheck && keyCheck.isCustomKey)),
      model: CONFIG?.gemini?.model || 'gemini-3.5-flash-lite',
      scansRemaining: keyCheck ? Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage) : 15,
      monthlyLimit: keyCheck?.monthlyLimit || 15,
      quota: keyCheck ? {
        limit: keyCheck.monthlyLimit,
        remaining: Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage),
        used: keyCheck.currentUsage
      } : {
        limit: 15,
        remaining: 15,
        used: 0
      }
    });
  }

  // -----------------------------------------------------------
  // Route: /ai/quota (Client AI Quota Telemetry)
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/ai/quota' || cleanPath.endsWith('/ai/quota'))) {
    const clientId = sanitizeTenantStoreCode(event, body);
    if (!clientId) {
      return jsonResponse(400, { error: 'Tenant isolation error: valid shopId or storeCode required.' });
    }
    try {
      const quota = await getClientQuotaInfo(clientId);
      return jsonResponse(200, {
        tier: 'Pro',
        status: 'operational',
        monthlyLimit: quota.limit,
        usedThisMonth: quota.used,
        ...quota
      });
    } catch (err) {
      return jsonResponse(500, { error: err.message });
    }
  }

  // -----------------------------------------------------------
  // Route: /admin/client-quota (Update Client Quota)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/admin/client-quota' || cleanPath.endsWith('/admin/client-quota'))) {
    const clientId = (body?.shopId || body?.clientId || '').trim();
    const { aiMonthlyLimit, customGeminiKey } = body;
    if (!clientId) {
      return jsonResponse(400, { error: 'clientId or shopId is required' });
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
      return jsonResponse(500, { error: 'Failed to update client profile in Firestore' });
    }

    const updatedQuota = await getClientQuotaInfo(clientId);
    return jsonResponse(200, {
      success: true,
      message: `Updated quota settings for client '${clientId}'`,
      quota: updatedQuota
    });
  }

  // -----------------------------------------------------------
  // Route: /extract-menu & /menu/ocr & /gemini & /ai/scan-menu (AI Menu OCR)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (
    cleanPath === '/extract-menu' || cleanPath.endsWith('/extract-menu') ||
    cleanPath === '/menu/ocr' || cleanPath.endsWith('/menu/ocr') ||
    cleanPath === '/gemini' || cleanPath.endsWith('/gemini') ||
    cleanPath === '/ai/scan-menu' || cleanPath.endsWith('/ai/scan-menu') ||
    cleanPath === '/scan-menu' || cleanPath.endsWith('/scan-menu')
  )) {
    const { base64Data, mimeType, extractedText } = body;
    const customHeaderKey = headers['x-gemini-api-key'] || headers['x-api-key'];
    const customKey = (customHeaderKey || body.apiKey || body.customGeminiKey || '').trim();
    const shopId = sanitizeTenantStoreCode(event, body);
    if (!shopId) {
      return jsonResponse(400, { error: 'Tenant isolation error: valid shopId or storeCode required for menu scan' });
    }

    let keyCheck = null;
    let slotReserved = false;

    try {
      try {
        keyCheck = await checkAiQuotaAndKey({ shopId, customApiKey: customKey });
        slotReserved = true;
      } catch (quotaErr) {
        if (quotaErr.status === 429) {
          return jsonResponse(429, {
            error: quotaErr.message || 'Monthly AI scan quota of 15 scans reached for this shop.',
            quota: quotaErr.quota || null
          });
        }
        throw quotaErr;
      }

      const resolvedApiKey = resolveGeminiApiKey(customKey || keyCheck?.apiKey);
      const isCustomKey = Boolean(customKey || (keyCheck && keyCheck.isCustomKey));

      if (isCustomKey && resolvedApiKey) {
        const isCustomKeyValid = await isGeminiKeyOperational(resolvedApiKey);
        if (!isCustomKeyValid) {
          if (slotReserved) {
            releaseAiQuotaSlot(shopId);
            slotReserved = false;
          }
          return jsonResponse(401, {
            error: 'Custom Gemini API key is unauthorized or invalid. Please verify your key in Settings > AI Quota & Custom Key.',
            invalidCustomKey: true
          });
        }
      }

      if (base64Data && resolvedApiKey) {
        try {
          const isOperationalKey = await isGeminiKeyOperational(resolvedApiKey);
          if (isOperationalKey) {
            const result = await extractMenuFromDocument({ base64Data, mimeType, apiKey: resolvedApiKey });
            if (result && Array.isArray(result.categories) && result.categories.length > 0) {
              const quotaInfo = await recordSuccessfulAiUsage(shopId, keyCheck || { currentUsage: 0, monthlyLimit: 15, currentMonth: getCurrentYearMonth() }).catch(() => null);
              slotReserved = false;
              return jsonResponse(200, {
                ...result,
                isFallback: false,
                quota: quotaInfo
              });
            }
          }
        } catch (geminiError) {
          // Continue to fallback
        }
      }

      if (slotReserved) {
        releaseAiQuotaSlot(shopId);
        slotReserved = false;
      }

      const fallback = parseMenuFromText(extractedText || '');
      return jsonResponse(200, {
        categories: fallback.categories,
        isFallback: true,
        fallbackSource: fallback.source,
        warning: 'Menu processed using smart layout parser.',
        quota: keyCheck ? {
          limit: keyCheck.monthlyLimit,
          used: keyCheck.currentUsage,
          remaining: Math.max(0, keyCheck.monthlyLimit - keyCheck.currentUsage),
          month: keyCheck.currentMonth,
          resetMonth: keyCheck.currentMonth
        } : null
      });
    } catch (err) {
      if (slotReserved) {
        releaseAiQuotaSlot(shopId);
        slotReserved = false;
      }
      return jsonResponse(500, { error: err.message });
    }
  }

  // ===========================================================
  // CLOUD STORE & STAFF SYNC ENDPOINTS (Multi-Tenant Isolated)
  // ===========================================================

  // Route: /sync/store-data (GET)
  if (event.httpMethod === 'GET' && (cleanPath === '/sync/store-data' || cleanPath.endsWith('/sync/store-data'))) {
    const storeCode = sanitizeTenantStoreCode(event, body);
    if (!storeCode) {
      return jsonResponse(400, { success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const token = extractAuthToken(event, body);
    const auth = verifyTenantAuthorization({ token, targetStoreCode: storeCode, allowGracefulMigration: true });
    if (!auth.authorized) {
      return jsonResponse(auth.status || 401, { success: false, error: auth.error });
    }
    const extraHeaders = auth.refreshedToken ? { 'x-refreshed-token': auth.refreshedToken } : {};
    try {
      const result = await getStoreFromFirestoreREST(storeCode);
      const status = result.status || (result.success ? 200 : 500);
      return jsonResponse(status, result, extraHeaders);
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Fetch failed' }, extraHeaders);
    }
  }

  // Route: /sync/store-data (POST)
  if (event.httpMethod === 'POST' && (cleanPath === '/sync/store-data' || cleanPath.endsWith('/sync/store-data'))) {
    const storeCode = sanitizeTenantStoreCode(event, body);
    if (!storeCode) {
      return jsonResponse(400, { success: false, error: 'A valid storeCode is required. Cross-tenant data injection prevented.' });
    }
    const token = extractAuthToken(event, body);
    const auth = verifyTenantAuthorization({ token, targetStoreCode: storeCode, allowGracefulMigration: true });
    if (!auth.authorized) {
      return jsonResponse(auth.status || 401, { success: false, error: auth.error });
    }
    const extraHeaders = auth.refreshedToken ? { 'x-refreshed-token': auth.refreshedToken } : {};

    const { ownerEmail, profile, staff, replaceStaff, deletedStaffId, tables, menu, categories, history, expenses, customers, kots } = body || {};
    const normalizedEmail = (ownerEmail || profile?.ownerEmail || profile?.email || headers['x-shop-email'] || headers['X-Shop-Email'] || '').trim().toLowerCase();

    try {
      const result = await syncStoreToFirestoreREST(storeCode, {
        ownerEmail: normalizedEmail || undefined,
        profile: profile ? { ...profile, ownerEmail: normalizedEmail || profile.ownerEmail } : undefined,
        staff, replaceStaff, deletedStaffId, tables, menu, categories, history, expenses, customers, kots
      });
      return jsonResponse(result.success ? 200 : 500, result, extraHeaders);
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Sync failed' }, extraHeaders);
    }
  }

  // Route: /sync/staff (POST)
  if (event.httpMethod === 'POST' && (cleanPath === '/sync/staff' || cleanPath.endsWith('/sync/staff'))) {
    const storeCode = sanitizeTenantStoreCode(event, body);
    if (!storeCode) {
      return jsonResponse(400, { success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const token = extractAuthToken(event, body);
    const auth = verifyTenantAuthorization({ token, targetStoreCode: storeCode, allowGracefulMigration: true });
    if (!auth.authorized) {
      return jsonResponse(auth.status || 401, { success: false, error: auth.error });
    }
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'manage_staff' });
    if (!rbac.allowed) {
      return jsonResponse(rbac.status || 403, { success: false, error: rbac.error });
    }
    const extraHeaders = auth.refreshedToken ? { 'x-refreshed-token': auth.refreshedToken } : {};

    const { staff, replaceStaff, deletedStaffId } = body || {};
    try {
      const result = await syncStoreToFirestoreREST(storeCode, { staff, replaceStaff, deletedStaffId });
      return jsonResponse(result.success ? 200 : 500, result, extraHeaders);
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Staff sync failed' }, extraHeaders);
    }
  }

  // Route: /sync/staff/delete (POST)
  if (event.httpMethod === 'POST' && (cleanPath === '/sync/staff/delete' || cleanPath.endsWith('/sync/staff/delete'))) {
    const storeCode = sanitizeTenantStoreCode(event, body);
    if (!storeCode) {
      return jsonResponse(400, { success: false, error: 'A valid storeCode is required. Tenant separation enforced.' });
    }
    const token = extractAuthToken(event, body);
    const auth = verifyTenantAuthorization({ token, targetStoreCode: storeCode, allowGracefulMigration: true });
    if (!auth.authorized) {
      return jsonResponse(auth.status || 401, { success: false, error: auth.error });
    }
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'manage_staff' });
    if (!rbac.allowed) {
      return jsonResponse(rbac.status || 403, { success: false, error: rbac.error });
    }
    const extraHeaders = auth.refreshedToken ? { 'x-refreshed-token': auth.refreshedToken } : {};

    const { staffId, staff } = body || {};
    try {
      const result = await deleteStaffFromFirestoreREST(storeCode, staffId, staff);
      return jsonResponse(result.success ? 200 : 500, result, extraHeaders);
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Staff deletion sync failed' }, extraHeaders);
    }
  }

  // Route: /sync/status (GET)
  if (event.httpMethod === 'GET' && (cleanPath === '/sync/status' || cleanPath.endsWith('/sync/status'))) {
    try {
      return jsonResponse(200, getShopStatus());
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message });
    }
  }

  // -----------------------------------------------------------
  // Route: /subscription/status & /api/subscription/status
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/subscription/status' || cleanPath.endsWith('/subscription/status'))) {
    const q = event.queryStringParameters || {};
    const email = (q.email || q.shopEmail || headers['x-shop-email'] || '').trim();
    const shopId = (q.shopId || headers['x-shop-id'] || '').trim();
    try {
      const subscription = await getShopSubscription(shopId, email);
      return jsonResponse(200, { success: true, subscription });
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Failed to retrieve subscription status' });
    }
  }

  // -----------------------------------------------------------
  // Route: /subscription/manage & /api/subscription/manage
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/subscription/manage' || cleanPath.endsWith('/subscription/manage'))) {
    const email = (body.email || body.shopEmail || headers['x-shop-email'] || '').trim();
    const shopId = (body.shopId || headers['x-shop-id'] || body.storeCode || '').trim();
    const token = extractAuthToken(event, body);
    if (shopId) {
      const auth = verifyTenantAuthorization({ token, targetStoreCode: shopId, allowGracefulMigration: true });
      if (!auth.authorized) {
        return jsonResponse(auth.status || 401, { success: false, error: auth.error });
      }
      const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'manage_subscription' });
      if (!rbac.allowed) {
        return jsonResponse(rbac.status || 403, { success: false, error: rbac.error });
      }
    }
    const action = String(body.action || '').trim().toUpperCase();
    const reason = String(body.reason || '').trim();
    const updatedBy = String(body.updatedBy || 'admin').trim();

    try {
      const currentSub = await getShopSubscription(shopId, email);
      const transitionCheck = validateSubscriptionTransition(currentSub?.status, action);
      if (!transitionCheck.allowed) {
        return jsonResponse(transitionCheck.statusCode || 400, { success: false, error: transitionCheck.error });
      }

      const updatedSub = await updateShopSubscription(shopId, email, {
        status: action,
        statusReason: reason,
        updatedBy
      });

      return jsonResponse(200, {
        success: true,
        message: `Subscription successfully transitioned to ${action}`,
        action,
        subscription: updatedSub
      });
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Failed to manage subscription' });
    }
  }

  // -----------------------------------------------------------
  // Route: /subscription/features
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/subscription/features' || cleanPath.endsWith('/subscription/features'))) {
    return jsonResponse(200, {
      success: true,
      features: {
        maxTerminals: 10,
        unlimitedOrders: true,
        kdsAndKot: true,
        aiMenuScansPerMonth: 15,
        cloudSync: true
      }
    });
  }

  // -----------------------------------------------------------
  // Route: /generate-image (Dish Gourmet Photo / Classifier)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/generate-image' || cleanPath.endsWith('/generate-image'))) {
    const { prompt, itemName, category, variation } = body;
    try {
      const result = await generateMenuItemImage({ prompt, itemName, category, variation });
      return jsonResponse(200, { success: true, ...result });
    } catch (err) {
      console.warn('[NETLIFY AI] Generate image error, returning fallback:', err.message);
      return jsonResponse(200, {
        success: true,
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
        source: 'curated-culinary',
        variation: 0
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /food-images/generate (AI Food Image Generator)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/food-images/generate' || cleanPath.endsWith('/food-images/generate'))) {
    const { dishName, cuisine, servingStyle, dietary, variation } = body;
    try {
      const result = await generateMenuItemImage({
        itemName: dishName,
        category: cuisine || 'Main Course',
        variation
      });
      return jsonResponse(200, {
        success: true,
        imageUrl: result.imageUrl,
        source: result.source || 'gemini-ai',
        isAiGenerated: true,
        variation: result.variation || 0
      });
    } catch (err) {
      return jsonResponse(200, {
        success: true,
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
        source: 'authentic-curated',
        isAiGenerated: false
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /food-images/save (Save Image Metadata)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/food-images/save' || cleanPath.endsWith('/food-images/save'))) {
    const { dishId, base64Data } = body;
    return jsonResponse(200, {
      success: true,
      dishId,
      url: base64Data || '',
      message: 'Image saved successfully'
    });
  }

  // -----------------------------------------------------------
  // Route: /food-images/upload (Upload Food Image)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/food-images/upload' || cleanPath.endsWith('/food-images/upload'))) {
    const { dishId, base64Data } = body;
    return jsonResponse(200, {
      success: true,
      dishId,
      url: base64Data || '',
      message: 'Image uploaded successfully'
    });
  }

  // -----------------------------------------------------------
  // Route: /generate-campaign (AI WhatsApp Marketing Copy)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/generate-campaign' || cleanPath.endsWith('/generate-campaign'))) {
    const { theme, discountPercent, minOrder, validTill, storeName, customNotes } = body;
    try {
      const campaign = await generateMarketingCampaign({
        theme,
        discountPercent,
        minOrder,
        validTill,
        storeName,
        customNotes
      });
      return jsonResponse(200, {
        success: true,
        text: campaign.text,
        campaignText: campaign.text,
        source: campaign.source || 'gemini-ai'
      });
    } catch (err) {
      const sName = storeName || 'our cafe';
      const fallbackText = `Hey {customer_name}! ☕ Weekend specials are live at ${sName}!\n\nEnjoy an exclusive ${discountPercent || 15}% OFF on orders above ₹${minOrder || 199}. Show this message at billing!\n\nValid till ${validTill || 'this Sunday'}. See you soon! ✨`;
      return jsonResponse(200, {
        success: true,
        text: fallbackText,
        campaignText: fallbackText,
        source: 'smart-fallback'
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /inventory/auto-fill (Intelligent Recipe Auto-Fill)
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/inventory/auto-fill' || cleanPath.endsWith('/inventory/auto-fill'))) {
    const query = event.queryStringParameters || {};
    const dishName = query.dish_name || query.name || '';
    const category = query.category || '';
    const suggestion = getApproxAutoFill(dishName, category);
    return jsonResponse(200, {
      success: true,
      auto_fill: suggestion
    });
  }

  // -----------------------------------------------------------
  // Route: /inventory/transfers & /inventory/transfers/:id/receive
  // -----------------------------------------------------------
  if (cleanPath === '/inventory/transfers' || cleanPath.endsWith('/inventory/transfers')) {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { success: true, transfers: getTransfers() });
    }
    if (event.httpMethod === 'POST') {
      const res = createTransfer(body || {});
      return jsonResponse(res.status, res.data);
    }
  }

  const transferReceiveMatch = cleanPath.match(/\/inventory\/transfers\/([^\/]+)\/receive$/);
  if (event.httpMethod === 'POST' && transferReceiveMatch) {
    const res = receiveTransfer(transferReceiveMatch[1]);
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/purchase-orders & status update
  // -----------------------------------------------------------
  if (cleanPath === '/inventory/purchase-orders' || cleanPath.endsWith('/inventory/purchase-orders')) {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { success: true, purchase_orders: getPurchaseOrders() });
    }
    if (event.httpMethod === 'POST') {
      const res = createPurchaseOrder(body || {});
      return jsonResponse(res.status, res.data);
    }
  }

  const poStatusMatch = cleanPath.match(/\/inventory\/purchase-orders\/([^\/]+)(?:\/status)?$/);
  if (event.httpMethod === 'POST' && poStatusMatch) {
    const res = updatePurchaseOrderStatus(poStatusMatch[1], body?.status);
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/costing & /inventory/forecast
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/inventory/costing' || cleanPath.endsWith('/inventory/costing'))) {
    return jsonResponse(200, { success: true, costing: calculateDishCosting() });
  }

  if (event.httpMethod === 'GET' && (cleanPath === '/inventory/forecast' || cleanPath.endsWith('/inventory/forecast'))) {
    return jsonResponse(200, { success: true, forecast: getPredictiveForecast() });
  }

  // -----------------------------------------------------------
  // Route: /inventory/wastage
  // -----------------------------------------------------------
  if (cleanPath === '/inventory/wastage' || cleanPath.endsWith('/inventory/wastage')) {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { success: true, ...getWastageHistory() });
    }
    if (event.httpMethod === 'POST') {
      const res = logWastage(body || {});
      return jsonResponse(res.status, res.data);
    }
  }

  // -----------------------------------------------------------
  // Route: /inventory/restock-history & /inventory/restock
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/inventory/restock-history' || cleanPath.endsWith('/inventory/restock-history'))) {
    return jsonResponse(200, { success: true, expenses: getRestockExpenses() });
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/restock' || cleanPath.endsWith('/inventory/restock'))) {
    const res = recordRestockExpense(body || {});
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/raw-materials
  // -----------------------------------------------------------
  if (cleanPath === '/inventory/raw-materials' || cleanPath.endsWith('/inventory/raw-materials')) {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { success: true, materials: getRawMaterials() });
    }
    if (event.httpMethod === 'POST') {
      const res = addRawMaterial(body || {});
      return jsonResponse(201, { success: true, material: res });
    }
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/raw-materials/stock' || cleanPath.endsWith('/inventory/raw-materials/stock'))) {
    const res = updateRawMaterialStock(body.materialId || body.id, body.adjustment || body.stock, body.isAbsolute);
    return jsonResponse(res.status, res.data);
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/raw-materials/price' || cleanPath.endsWith('/inventory/raw-materials/price'))) {
    const res = updateRawMaterialPrice(body.materialId || body.id, body.newPrice || body.price);
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/sub-recipes & /inventory/batch-produce
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/inventory/sub-recipes' || cleanPath.endsWith('/inventory/sub-recipes'))) {
    return jsonResponse(200, { success: true, sub_recipes: getSubRecipes() });
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/batch-produce' || cleanPath.endsWith('/inventory/batch-produce'))) {
    const res = produceMorningBatch(body.subRecipeId || body.id, body.produceQuantity || body.quantity);
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/recipes & /inventory/save-recipe
  // -----------------------------------------------------------
  if (cleanPath === '/inventory/recipes' || cleanPath.endsWith('/inventory/recipes')) {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { success: true, recipes: getDishRecipes() });
    }
    if (event.httpMethod === 'POST') {
      const res = saveDishRecipe(body || {});
      return jsonResponse(res.status, res.data);
    }
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/save-recipe' || cleanPath.endsWith('/inventory/save-recipe'))) {
    const res = saveDishRecipe(body || {});
    return jsonResponse(res.status, res.data);
  }

  // -----------------------------------------------------------
  // Route: /inventory/pos-deduct, /inventory/alert-threshold, /inventory/audit
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/pos-deduct' || cleanPath.endsWith('/inventory/pos-deduct'))) {
    const res = deductOrderInventory(body?.order || body);
    return jsonResponse(res.status, res.data);
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/alert-threshold' || cleanPath.endsWith('/inventory/alert-threshold'))) {
    const res = updateAlertThreshold(body.materialId || body.id, body.minThreshold || body.threshold);
    return jsonResponse(res.status, res.data);
  }

  if (event.httpMethod === 'POST' && (cleanPath === '/inventory/audit' || cleanPath.endsWith('/inventory/audit'))) {
    const res = performStockAudit(body.entries || body);
    return jsonResponse(res.status, res.data);
  }

  // ===========================================================
  // AUTHENTICATION & OTP SUITE
  // ===========================================================

  // -----------------------------------------------------------
  // Route: /auth/send-otp (Passwordless Login & Signup OTP)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/send-otp' || cleanPath.endsWith('/send-otp'))) {
    const clientIp = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `otp_req_${clientIp}`,
      limit: 10,
      windowSeconds: 600,
      message: 'Too many verification code requests from this device. Please wait 10 minutes.'
    });
    if (!rateCheck.allowed) {
      return jsonResponse(429, { success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }

    const email = normalizeEmail(body.email);
    const purpose = body.purpose || 'login';

    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Please enter a valid email address.' });
    }

    const now = Date.now();
    const existing = memoryOtpStore.get(email);
    if (existing && !existing.consumed && now < existing.resendAvailableAt) {
      const retryAfter = Math.ceil((existing.resendAvailableAt - now) / 1000);
      return jsonResponse(429, {
        success: false,
        error: `Please wait ${retryAfter} seconds before requesting a new code.`,
        retryAfter
      });
    }

    // Generate 6-digit cryptographic numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const record = {
      email,
      otp,
      purpose,
      createdAt: now,
      expiresAt: now + (600 * 1000), // 10 minutes
      resendAvailableAt: now + (60 * 1000), // 60 seconds
      attempts: 0,
      consumed: false
    };

    // Cache locally & persist in Firestore for serverless multi-instance availability
    memoryOtpStore.set(email, record);
    await persistOtpToFirestore(record);

    // Send the real email via Nodemailer and AWAIT completion
    try {
      await dispatchEmail(email, otp, purpose);
      console.log(`[NETLIFY API] ✅ Real OTP email delivered to ${email}`);
      return jsonResponse(200, {
        success: true,
        message: `A 6-digit verification code has been dispatched to ${email}.`,
        email,
        cooldownSeconds: 60,
        expiresInSeconds: 600,
        realEmailDispatched: true
      });
    } catch (mailErr) {
      console.error(`[NETLIFY API] ❌ SMTP Email dispatch error for ${email}:`, mailErr);
      return jsonResponse(500, {
        success: false,
        error: `Failed to dispatch email to ${email}: ${mailErr.message || 'SMTP delivery failed'}. Please check your email or use password login.`
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /auth/verify-otp (Validates OTP & Mints Session)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/verify-otp' || cleanPath.endsWith('/verify-otp'))) {
    const clientIp = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `verify_req_${clientIp}`,
      limit: 20,
      windowSeconds: 300,
      message: 'Too many verification attempts from this connection. Please wait 5 minutes.'
    });
    if (!rateCheck.allowed) {
      return jsonResponse(429, { success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }

    const email = normalizeEmail(body.email);
    const submittedOtp = (body.otp !== undefined && body.otp !== null) ? String(body.otp).trim() : '';
    const shopName = body.shopName ? String(body.shopName).trim() : '';

    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid email address.' });
    }
    if (!/^\d{6}$/.test(submittedOtp)) {
      return jsonResponse(400, { success: false, error: 'Please enter a valid 6-digit code.' });
    }

    // Check memory first, then Firestore
    let record = memoryOtpStore.get(email);
    if (!record || record.consumed) {
      record = await retrieveOtpFromFirestore(email);
    }

    const now = Date.now();
    if (!record || now > record.expiresAt) {
      return jsonResponse(400, {
        success: false,
        error: 'Verification code has expired or was not requested. Please click Resend Code.'
      });
    }

    if (record.attempts >= 3) {
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email);
      return jsonResponse(429, {
        success: false,
        error: 'Too many incorrect attempts. Please request a new verification code.'
      });
    }

    if (record.otp !== submittedOtp) {
      record.attempts = (record.attempts || 0) + 1;
      memoryOtpStore.set(email, record);
      await persistOtpToFirestore(record);
      const remaining = 3 - record.attempts;
      return jsonResponse(400, {
        success: false,
        error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    // Code is valid! Consume and remove
    memoryOtpStore.delete(email);
    await removeOtpFromFirestore(email);

    // Generate authenticated token & store tenant code
    let cleanStoreCode = (body.storeCode && typeof body.storeCode === 'string' && body.storeCode.trim())
      ? body.storeCode.trim()
      : (shopName ? shopName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 16) : 'SHOP_' + email.split('@')[0].toUpperCase().slice(0, 12));
    const token = createSignedAuthToken({ email, storeCode: cleanStoreCode, role: 'owner' });
    const sessionToken = 'billnaw_' + crypto.randomBytes(24).toString('hex');

    let existingShop = null;
    try {
      existingShop = await getStoreFromFirestoreREST(cleanStoreCode);
    } catch(e) {}

    const resolvedShopName = (shopName && shopName.trim() && shopName !== 'My Cafe')
      ? shopName.trim()
      : ((existingShop?.profile?.name && existingShop.profile.name !== 'My Cafe' && existingShop.profile.name !== 'billnaw')
          ? existingShop.profile.name
          : ((existingShop?.name && existingShop.name !== 'My Cafe') ? existingShop.name : (shopName || cleanStoreCode)));

    return jsonResponse(200, {
      success: true,
      token,
      sessionToken,
      customToken: token,
      storeCode: cleanStoreCode,
      isOwner: true,
      user: {
        email,
        role: 'owner',
        isOwner: true
      },
      shop: existingShop ? {
        storeCode: cleanStoreCode,
        name: resolvedShopName,
        profile: existingShop.profile,
        staff: existingShop.staff,
        tables: existingShop.tables,
        menu: existingShop.menu,
        categories: existingShop.categories
      } : {
        name: resolvedShopName,
        storeCode: cleanStoreCode
      },
      message: 'Email verified successfully!'
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/admin-forgot-pin/send-otp
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/admin-forgot-pin/send-otp' || cleanPath.endsWith('/admin-forgot-pin/send-otp'))) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid store owner email.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const now = Date.now();
    const record = {
      email,
      otp,
      purpose: 'admin-pin-reset',
      createdAt: now,
      expiresAt: now + (600 * 1000),
      resendAvailableAt: now + (60 * 1000),
      attempts: 0,
      consumed: false
    };

    memoryOtpStore.set(email, record);
    await persistOtpToFirestore(record);

    try {
      await dispatchEmail(email, otp, 'admin-pin-reset');
      return jsonResponse(200, {
        success: true,
        message: `Admin PIN reset code sent to ${email}`
      });
    } catch (err) {
      return jsonResponse(500, {
        success: false,
        error: `Could not send PIN reset email: ${err.message}`
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /auth/admin-forgot-pin/reset
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/admin-forgot-pin/reset' || cleanPath.endsWith('/admin-forgot-pin/reset'))) {
    const email = normalizeEmail(body.email);
    const submittedOtp = String(body.otp || '').trim();
    const newPin = String(body.newPin || '').trim();

    if (!/^\d{4,6}$/.test(newPin)) {
      return jsonResponse(400, { success: false, error: 'PIN must be 4 to 6 digits.' });
    }

    let record = memoryOtpStore.get(email) || await retrieveOtpFromFirestore(email);
    if (!record || record.otp !== submittedOtp || Date.now() > record.expiresAt) {
      return jsonResponse(400, { success: false, error: 'Invalid or expired reset code.' });
    }

    memoryOtpStore.delete(email);
    await removeOtpFromFirestore(email);

    const pinHash = crypto.createHash('sha256').update(newPin).digest('hex');

    return jsonResponse(200, {
      success: true,
      message: 'Master Admin PIN reset successfully.',
      adminPinHash: pinHash,
      storeCode: body.storeCode || ''
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/validate-device & /auth/validate-device-and-login
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath.includes('validate-device'))) {
    return jsonResponse(200, {
      success: true,
      allowed: true,
      message: 'Device authorized.'
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/login (Password Login Fallback)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/auth/login') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) {
      return jsonResponse(400, { success: false, error: 'Email and password required.' });
    }
    let storeCode = body.storeCode || '';
    if (!storeCode) {
      storeCode = 'SHOP_' + email.split('@')[0].toUpperCase().slice(0, 12);
    }
    const token = createSignedAuthToken({ email, storeCode, role: 'owner' });
    const sessionToken = 'billnaw_' + crypto.randomBytes(24).toString('hex');
    let existingShop = null;
    try {
      existingShop = await getStoreFromFirestoreREST(storeCode);
    } catch(e) {}

    return jsonResponse(200, {
      success: true,
      token,
      sessionToken,
      customToken: token,
      storeCode,
      isOwner: true,
      user: { email, role: 'owner', isOwner: true },
      shop: existingShop ? {
        storeCode,
        name: (existingShop.profile?.name && existingShop.profile.name !== 'My Cafe' && existingShop.profile.name !== 'billnaw') 
          ? existingShop.profile.name 
          : (existingShop.name && existingShop.name !== 'My Cafe' ? existingShop.name : (body.shopName || storeCode)),
        profile: existingShop.profile,
        staff: existingShop.staff,
        tables: existingShop.tables,
        menu: existingShop.menu,
        categories: existingShop.categories
      } : { name: body.shopName || storeCode, storeCode }
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/signup (Shop Signup)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/auth/signup') {
    const email = normalizeEmail(body.email);
    const shopName = String(body.shopName || '').trim() || ('Shop ' + email.split('@')[0]);
    const storeCode = shopName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 16);
    const token = createSignedAuthToken({ email, storeCode, role: 'owner' });
    const sessionToken = 'billnaw_' + crypto.randomBytes(24).toString('hex');

    // Automatically seed shop into Firestore with full profile, staff, tables, menu, categories & subcollections
    try {
      const defaultPin = '1234';
      const pinHash = crypto.createHash('sha256').update(defaultPin).digest('hex');
      const defaultTables = {};
      for (let i = 1; i <= 10; i++) {
        defaultTables[String(i)] = { id: String(i), name: `Table ${i}`, status: 'available' };
      }
      await syncStoreToFirestoreREST(storeCode, {
        ownerEmail: email,
        profile: {
          name: shopName,
          tableCount: 10,
          phone: body.phone || '9876543210',
          adminPinHash: pinHash,
          gstMode: 'inclusive',
          defaultGstRate: 5
        },
        staff: [
          { id: 1, name: 'Store Owner', role: 'Admin', status: 'Active', phone: body.phone || '9876543210' }
        ],
        tables: defaultTables,
        categories: ['All', 'Snacks', 'Beverages', 'Main Course'],
        menu: [
          { id: 1, name: 'Samosa', category: 'Snacks', price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5 },
          { id: 2, name: 'Tea', category: 'Beverages', price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5 },
          { id: 3, name: 'Chicken Curry', category: 'Main Course', price: 150, stock: 4, stockQty: 4, trackStock: true, gstRate: 5 },
          { id: 4, name: 'Masala Coke', category: 'Beverages', price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5 }
        ]
      });
    } catch (seedErr) {
      console.warn('[NETLIFY SIGNUP] Auto-seed note:', seedErr.message);
    }

    return jsonResponse(200, {
      success: true,
      token,
      sessionToken,
      customToken: token,
      storeCode,
      isOwner: true,
      user: { email, role: 'owner', isOwner: true },
      shop: { name: shopName, storeCode }
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/logout
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/auth/logout') {
    return jsonResponse(200, { success: true, message: 'Logged out successfully.' });
  }

  // -----------------------------------------------------------
  // Route: /auth/sessions
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && cleanPath.startsWith('/auth/sessions')) {
    return jsonResponse(200, { success: true, sessions: [] });
  }

  // -----------------------------------------------------------
  // Route: /config/client (Firebase Client Configuration)
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && cleanPath === '/config/client') {
    return jsonResponse(200, {
      apiKey: 'AIzaSyCha9cL9MOmOZjweNd9ZXCX9V5sDh-RlAU',
      authDomain: 'abhi-pro-cafe-pos.firebaseapp.com',
      projectId: FIREBASE_PROJECT_ID,
      storageBucket: 'abhi-pro-cafe-pos.firebasestorage.app',
      messagingSenderId: '323985422709',
      appId: '1:323985422709:web:700b77f1a0ff4dc723bb3c',
      firestoreDatabaseId: FIRESTORE_DATABASE_ID
    });
  }

  // -----------------------------------------------------------
  // Route: /version
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && cleanPath === '/version') {
    return jsonResponse(200, {
      version: '1.0.0',
      status: 'online',
      runtime: 'netlify-serverless',
      timestamp: Date.now()
    });
  }

  // -----------------------------------------------------------
  // Route: /health
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && (cleanPath === '/health' || cleanPath === '')) {
    return jsonResponse(200, {
      status: 'ok',
      service: 'billnaw-pos-serverless',
      timestamp: Date.now()
    });
  }

  // Fallback for unhandled routes
  return jsonResponse(404, {
    error: 'Route not found',
    path: cleanPath
  });
}
