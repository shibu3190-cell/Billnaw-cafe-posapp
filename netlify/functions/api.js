// netlify/functions/api.js - Serverless API & OTP Delivery Engine for Billnaw POS PWA
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import {
  isGeminiKeyOperational,
  extractMenuFromDocument,
  generateMenuItemImage,
  generateMarketingCampaign,
  resolveGeminiApiKey,
  sanitizeErrorForClient,
  clearGeminiCaches
} from '../../server/gemini-service.js';
import { parseMenuFromText } from '../../server/menu-parser.js';
import {
  checkAiQuotaAndKey,
  recordSuccessfulAiUsage,
  getClientQuotaInfo,
  updateClientProfileData,
  releaseAiQuotaSlot,
  getCurrentYearMonth,
  normalizeShopId
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
  checkRateLimit,
  normalizeBackendRole,
  normalizeEmail as normalizeAuthEmail,
  isValidEmail as isValidAuthEmail,
  hashPassword,
  hashStringServer,
  generateStoreCode,
  registerUser,
  loginWithPassword,
  verifySession,
  listActiveSessions,
  revokeSession,
  revokeSessionsForStore,
  revokeSessionsForUser,
  resetStoreCloudData,
  setAuthUserRecord
} from '../../server/auth-service.js';
import { runDailyDataRetentionRoutine } from '../../database/server-functions/retention-lifecycle.js';
import { getDbClient } from '../../src/core/db-client.js';
import { CONFIG } from '../../server/config.js';

// Firebase & SMTP Configuration with Production Environment Variables & Resilient Fallbacks
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'abhi-pro-cafe-pos';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || CONFIG?.email?.user || 'shibu3190@gmail.com';
const SMTP_PASS = (process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || CONFIG?.email?.pass || '').trim().replace(/\s+/g, '');
const SMTP_FROM = process.env.SMTP_FROM || process.env.EMAIL_FROM || CONFIG?.email?.from || `"Billnaw POS" <${SMTP_USER}>`;

// In-memory cache for fast single-container hits
const memoryOtpStore = new Map();
const reportTokens = new Map();

function pruneExpiredReportTokens() {
  const now = Date.now();
  for (const [tok, info] of reportTokens.entries()) {
    if (!info || now > info.expiresAt) {
      reportTokens.delete(tok);
    }
  }
}

// Standard response headers including CORS
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-shop-id, x-shop-email, x-store-code, x-auth-token, x-staff-role, x-staff-id, x-session-token, x-gemini-api-key, x-api-key, x-admin-secret',
  'Access-Control-Expose-Headers': 'x-refreshed-token, Authorization, Content-Type'
};

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(data)
  };
}

function extractAuthToken(event, body, { allowBodyToken = true, allowQueryToken = true } = {}) {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const headerToken =
    headers['x-auth-token'] ||
    headers['X-Auth-Token'] ||
    headers['x-session-token'] ||
    headers['X-Session-Token'] ||
    '';
  if (headerToken) return String(headerToken).trim();
  if (allowQueryToken && (query.authToken || query.token)) {
    return String(query.authToken || query.token).trim();
  }
  if (allowBodyToken && body?.token) {
    return String(body.token).trim();
  }
  return '';
}

function verifyAdminSecret(event) {
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected) return false;
  const headers = event?.headers || {};
  const provided = String(headers['x-admin-secret'] || headers['X-Admin-Secret'] || '').trim();
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireTenantAndPermission(event, body, {
  targetStoreCode,
  requiredPermission,
  allowGracefulMigration = false,
  allowBodyToken = true,
  allowQueryToken = true
} = {}) {
  if (verifyAdminSecret(event)) {
    return {
      ok: true,
      auth: {
        authorized: true,
        isAdminSecret: true,
        user: { role: 'SuperAdmin', storeCode: targetStoreCode || '*' },
        storeCode: targetStoreCode || ''
      },
      extraHeaders: {}
    };
  }

  const token = extractAuthToken(event, body, { allowBodyToken, allowQueryToken });
  const auth = verifyTenantAuthorization({ token, targetStoreCode, allowGracefulMigration });
  if (!auth.authorized) {
    return {
      ok: false,
      response: jsonResponse(auth.status || 401, { success: false, error: auth.error })
    };
  }

  if (requiredPermission) {
    const rbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission });
    if (!rbac.allowed) {
      return {
        ok: false,
        response: jsonResponse(rbac.status || 403, { success: false, error: rbac.error })
      };
    }
  }

  return {
    ok: true,
    auth,
    extraHeaders: auth.refreshedToken ? { 'x-refreshed-token': auth.refreshedToken } : {}
  };
}

function detectImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') {
      return { mime: 'image/webp', ext: 'webp' };
    }
  }
  return null;
}

function normalizeEmail(email) {
  return normalizeAuthEmail(email);
}

function isValidEmail(email) {
  return isValidAuthEmail(email);
}

function sanitizeTenantStoreCode(event, body) {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const raw = body?.storeCode ||
              body?.shopId ||
              body?.clientId ||
              query.storeCode ||
              query.shopId ||
              query.clientId ||
              headers['x-shop-id'] ||
              headers['X-Shop-Id'] ||
              headers['x-store-code'] ||
              headers['X-Store-Code'] ||
              headers['x-client-id'] ||
              headers['X-Client-Id'] ||
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

const FIRESTORE_USER_URL = (email) =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/clients/_auth/users/${encodeURIComponent(email)}`;

async function persistAuthUserToFirestore(user) {
  try {
    if (!user || !user.email) return false;
    const normEmail = normalizeEmail(user.email);
    const res = await fetch(FIRESTORE_USER_URL(normEmail), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: String(user.uid || '') },
          email: { stringValue: normEmail },
          firstName: { stringValue: String(user.firstName || '') },
          lastName: { stringValue: String(user.lastName || '') },
          shopName: { stringValue: String(user.shopName || '') },
          phone: { stringValue: String(user.phone || '') },
          storeCode: { stringValue: String(user.storeCode || '') },
          passwordHash: { stringValue: String(user.passwordHash || '') },
          salt: { stringValue: String(user.salt || '') },
          role: { stringValue: String(user.role || 'Owner') },
          createdAt: { stringValue: String(user.createdAt || new Date().toISOString()) }
        }
      })
    });
    return Boolean(res && res.ok);
  } catch (err) {
    console.warn('[SERVERLESS AUTH] Firestore user write warning:', err.message);
    return false;
  }
}

async function retrieveAuthUserFromFirestore(email) {
  try {
    const normEmail = normalizeEmail(email);
    if (!normEmail) return null;
    const res = await fetch(FIRESTORE_USER_URL(normEmail));
    if (!res || !res.ok) return null;
    const json = await res.json();
    if (!json || !json.fields) return null;
    const f = json.fields;
    return {
      uid: f.uid?.stringValue || '',
      email: f.email?.stringValue || normEmail,
      firstName: f.firstName?.stringValue || '',
      lastName: f.lastName?.stringValue || '',
      shopName: f.shopName?.stringValue || '',
      phone: f.phone?.stringValue || '',
      storeCode: f.storeCode?.stringValue || '',
      passwordHash: f.passwordHash?.stringValue || '',
      salt: f.salt?.stringValue || '',
      role: f.role?.stringValue || 'Owner',
      createdAt: f.createdAt?.stringValue || ''
    };
  } catch (err) {
    console.warn('[SERVERLESS AUTH] Firestore user read warning:', err.message);
    return null;
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

  const resolvedSmtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || CONFIG?.email?.user || SMTP_USER;
  const resolvedSmtpPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || CONFIG?.email?.pass || SMTP_PASS || '').trim().replace(/\s+/g, '');
  if (!resolvedSmtpUser || !resolvedSmtpPass) {
    throw new Error('SMTP credentials are not configured. Please use password login or contact support.');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: resolvedSmtpUser,
      pass: resolvedSmtpPass
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

  // 2. Normalize requested path across all Netlify serverless rewrite formats
  const rawHeaders = event.headers || {};
  const getHeader = (name) => {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (k.toLowerCase() === target) return v;
    }
    return '';
  };

  const headerOriginalUrl = getHeader('x-nf-original-url') || getHeader('x-original-url') || getHeader('x-rewrite-url') || '';
  let rawPath = '';
  if (headerOriginalUrl) {
    rawPath = headerOriginalUrl.split('?')[0];
  } else if (event.rawUrl) {
    try {
      rawPath = new URL(event.rawUrl).pathname;
    } catch (_) {
      rawPath = event.path || '';
    }
  } else {
    rawPath = event.path || '';
  }

  if (!rawPath || rawPath === '/.netlify/functions/api' || rawPath === '/.netlify/functions/api/') {
    if (event.path && event.path !== '/.netlify/functions/api' && event.path !== '/.netlify/functions/api/') {
      rawPath = event.path;
    }
  }

  const cleanPath = (rawPath || '')
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
    const rawShop = sanitizeTenantStoreCode(event, body) || event.queryStringParameters?.shopId || headers['x-shop-id'];
    const shopId = normalizeShopId(rawShop);
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
    const rawClient = sanitizeTenantStoreCode(event, body) || event.queryStringParameters?.shopId || event.queryStringParameters?.clientId || headers['x-shop-id'];
    const clientId = normalizeShopId(rawClient);
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
      return jsonResponse(500, { error: sanitizeErrorForClient(err.message, '') });
    }
  }

  // -----------------------------------------------------------
  // Route: /admin/client-quota (Update Client Quota)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/admin/client-quota' || cleanPath.endsWith('/admin/client-quota'))) {
    const clientId = sanitizeTenantStoreCode(event, body) || String(body?.shopId || body?.clientId || '').trim();
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: clientId || undefined,
      requiredPermission: 'admin_quota',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const { aiMonthlyLimit, customGeminiKey } = body || {};
    if (!clientId || !/^[A-Za-z0-9_-]{3,64}$/.test(clientId)) {
      return jsonResponse(400, { success: false, error: 'Valid clientId or shopId is required' });
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

    const success = await updateClientProfileData(clientId, updates);
    if (!success) {
      return jsonResponse(500, { success: false, error: 'Failed to update client profile in Firestore' });
    }

    const updatedQuota = await getClientQuotaInfo(clientId);
    return jsonResponse(200, {
      success: true,
      message: `Updated quota settings for client '${clientId}'`,
      quota: updatedQuota
    }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /admin/clear-cache (Clear AI & Verification Caches)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/admin/clear-cache' || cleanPath.endsWith('/admin/clear-cache'))) {
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: sanitizeTenantStoreCode(event, body) || undefined,
      requiredPermission: 'admin_quota',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;
    clearGeminiCaches();
    return jsonResponse(200, { success: true, message: 'All server memory & verification caches cleared successfully.' }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /admin/maintenance/purge (SuperAdmin / ADMIN_SECRET only)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/admin/maintenance/purge' || cleanPath.endsWith('/admin/maintenance/purge'))) {
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: undefined,
      requiredPermission: 'admin_quota',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;
    const callerRole = normalizeBackendRole(gate.auth.user?.role || '');
    if (!gate.auth.isAdminSecret && callerRole !== 'SuperAdmin') {
      return jsonResponse(403, { success: false, error: 'Access denied: SuperAdmin privileges required for global data retention purge.' });
    }
    const { dryRun = false, now = null } = body || {};
    const executionNow = (now !== null && now !== undefined && now !== '')
      ? (typeof now === 'number' ? now : new Date(now).getTime())
      : Date.now();
    if (!Number.isFinite(executionNow)) {
      return jsonResponse(400, { success: false, error: 'Invalid now timestamp provided.' });
    }
    try {
      const report = await runDailyDataRetentionRoutine({ now: executionNow, dryRun: dryRun === true });
      return jsonResponse(200, { success: true, report }, gate.extraHeaders);
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Data retention purge failed' });
    }
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
    const rawShop = sanitizeTenantStoreCode(event, body) || body?.shopId || event.queryStringParameters?.shopId || headers['x-shop-id'];
    const shopId = normalizeShopId(rawShop);

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

      if (customKey && customKey.length <= 15) {
        if (slotReserved) {
          releaseAiQuotaSlot(shopId);
          slotReserved = false;
        }
        return jsonResponse(401, {
          error: 'Custom Gemini API key is too short or invalid. Please verify your key in Settings > AI Quota & Custom Key.',
          invalidCustomKey: true
        });
      }

      const isCustomKey = Boolean((customKey && customKey.length > 15) || (keyCheck && keyCheck.isCustomKey));
      const resolvedApiKey = isCustomKey ? (customKey || keyCheck?.apiKey) : resolveGeminiApiKey();

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
          console.warn('[Menu Digitizer Netlify] Vision OCR failed:', geminiError?.message || geminiError);
          // Continue to fallback
        }
      }

      if (slotReserved) {
        releaseAiQuotaSlot(shopId);
        slotReserved = false;
      }

      const fallback = parseMenuFromText(extractedText || '');
      let fallbackWarning = 'Menu processed using smart layout parser.';
      if (!resolvedApiKey) {
        fallbackWarning = 'Menu processed using smart layout parser. (Server Gemini key is not configured; tap AI Key to add your key or set GEMINI_API_KEY in Netlify).';
      }
      return jsonResponse(200, {
        categories: fallback.categories,
        isFallback: true,
        fallbackSource: fallback.source,
        warning: fallbackWarning,
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
      return jsonResponse(500, { error: sanitizeErrorForClient(err.message, resolvedApiKey || '') });
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

    const { ownerEmail, profile, staff, replaceStaff, deletedStaffId, deletedStaffIds, tables, menu, deletedMenuIds, deletedMenuNames, menuVersion, categories, history, expenses, customers, kots } = body || {};

    if (staff !== undefined || replaceStaff !== undefined || deletedStaffId !== undefined || deletedStaffIds !== undefined) {
      const staffRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'manage_staff' });
      if (!staffRbac.allowed) {
        return jsonResponse(staffRbac.status || 403, { success: false, error: staffRbac.error });
      }
    }
    if (menu !== undefined || deletedMenuIds !== undefined || deletedMenuNames !== undefined || menuVersion !== undefined || categories !== undefined) {
      const menuRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'manage_menu' });
      if (!menuRbac.allowed) {
        return jsonResponse(menuRbac.status || 403, { success: false, error: menuRbac.error });
      }
    }
    if (tables !== undefined || history !== undefined || expenses !== undefined || customers !== undefined) {
      const opsRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'take_orders' });
      if (!opsRbac.allowed) {
        return jsonResponse(opsRbac.status || 403, { success: false, error: opsRbac.error });
      }
    }

    const settingsRbac = verifyEndpointAccess({ authResult: auth, eventOrReq: event, requiredPermission: 'change_settings' });
    const hasOperationalPayload = (
      tables !== undefined ||
      kots !== undefined ||
      history !== undefined ||
      customers !== undefined ||
      expenses !== undefined
    );
    if (!settingsRbac.allowed && !hasOperationalPayload && (ownerEmail !== undefined || profile !== undefined)) {
      return jsonResponse(settingsRbac.status || 403, { success: false, error: settingsRbac.error });
    }

    const normalizedEmail = settingsRbac.allowed
      ? (ownerEmail || profile?.ownerEmail || profile?.email || headers['x-shop-email'] || headers['X-Shop-Email'] || '').trim().toLowerCase()
      : '';
    const safeProfile = settingsRbac.allowed && profile
      ? { ...profile, ownerEmail: normalizedEmail || profile.ownerEmail }
      : undefined;

    try {
      const result = await syncStoreToFirestoreREST(storeCode, {
        ownerEmail: normalizedEmail || undefined,
        profile: safeProfile,
        staff, replaceStaff, deletedStaffId, deletedStaffIds, tables, menu, deletedMenuIds, deletedMenuNames, menuVersion, categories, history, expenses, customers, kots
      });
      return jsonResponse(result.success ? 200 : (result.status >= 400 ? result.status : 500), result, extraHeaders);
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

    const { staff, replaceStaff, deletedStaffId, deletedStaffIds } = body || {};
    try {
      const result = await syncStoreToFirestoreREST(storeCode, { staff, replaceStaff, deletedStaffId, deletedStaffIds });
      return jsonResponse(result.success ? 200 : (result.status >= 400 ? result.status : 500), result, extraHeaders);
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
    const email = normalizeEmail(q.email || q.shopEmail || headers['x-shop-email'] || headers['X-Shop-Email'] || '');
    const shopId = String(q.shopId || q.storeCode || headers['x-shop-id'] || headers['X-Shop-Id'] || '').trim();
    if (!email && !shopId) {
      return jsonResponse(400, { success: false, error: 'Either shopId or a valid email query parameter is required.' });
    }
    if (email && !isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid email address provided.' });
    }
    try {
      const subscription = await getShopSubscription(shopId, email);
      if (!subscription) {
        return jsonResponse(404, { success: false, error: 'Shop not found for the provided identifier.' });
      }
      return jsonResponse(200, { success: true, subscription });
    } catch (err) {
      return jsonResponse(500, { success: false, error: err.message || 'Failed to retrieve subscription status' });
    }
  }

  // -----------------------------------------------------------
  // Route: /subscription/manage & /api/subscription/manage
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/subscription/manage' || cleanPath.endsWith('/subscription/manage'))) {
    const email = normalizeEmail(body.email || body.shopEmail || headers['x-shop-email'] || headers['X-Shop-Email'] || '');
    const shopId = String(body.shopId || body.storeCode || headers['x-shop-id'] || headers['X-Shop-Id'] || '').trim();

    // Enforce strict authentication and RBAC unconditionally (even when shopId is omitted)
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: shopId || undefined,
      requiredPermission: 'manage_subscription',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const action = String(body.action || '').trim().toUpperCase();
    const reason = String(body.reason || '').trim();
    const updatedBy = String(body.updatedBy || gate.auth.user?.email || 'admin').trim();

    if (!action || (!email && !shopId)) {
      return jsonResponse(400, {
        success: false,
        error: "Missing required field: action ('ACTIVE', 'PAUSED', 'RESUMED', 'REVOKED') and at least one of shopEmail or shopId."
      });
    }
    if (email && !isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid shopEmail address format.' });
    }

    try {
      const currentSub = await getShopSubscription(shopId, email);
      if (!currentSub) {
        return jsonResponse(404, { success: false, error: 'Shop not found for the provided email or shopId.' });
      }

      const callerRole = normalizeBackendRole(gate.auth.user?.role || 'Cashier');
      if (!gate.auth.isAdminSecret && callerRole !== 'SuperAdmin') {
        const authStore = String(gate.auth.storeCode || '').trim().toUpperCase();
        const subStore = String(currentSub.shopId || '').trim().toUpperCase();
        if (!authStore || (subStore && authStore !== subStore)) {
          return jsonResponse(403, {
            success: false,
            error: `Cross-tenant access forbidden: store [${authStore || 'NONE'}] cannot manage subscription for [${subStore}].`
          });
        }
        if (!shopId && email && gate.auth.user?.email && normalizeEmail(gate.auth.user.email) !== email) {
          return jsonResponse(403, {
            success: false,
            error: 'Cross-tenant access forbidden: email does not match authenticated account.'
          });
        }
      }

      const transitionCheck = validateSubscriptionTransition(currentSub?.status, action);
      if (!transitionCheck.allowed) {
        return jsonResponse(transitionCheck.statusCode || 400, { success: false, error: transitionCheck.error });
      }

      const updatedSub = {
        ...currentSub,
        status: transitionCheck.resultingStatus,
        plan: body.plan || currentSub.plan || 'billnaw Pro',
        statusReason: reason.slice(0, 500),
        updatedAt: new Date().toISOString(),
        updatedBy
      };

      const propagated = await updateShopSubscription(updatedSub.shopId, updatedSub);

      return jsonResponse(200, {
        success: true,
        message: `Subscription status successfully updated to ${updatedSub.status}`,
        previousStatus: currentSub.status,
        status: updatedSub.status,
        action: updatedSub.status,
        subscription: updatedSub,
        propagated
      }, gate.extraHeaders);
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
  // Route: /food-images/save & /food-images/upload (Authenticated, 3MB, Magic Bytes)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (
    cleanPath === '/food-images/save' || cleanPath.endsWith('/food-images/save') ||
    cleanPath === '/food-images/upload' || cleanPath.endsWith('/food-images/upload')
  )) {
    const isSave = cleanPath === '/food-images/save' || cleanPath.endsWith('/food-images/save');
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: sanitizeTenantStoreCode(event, body) || undefined,
      requiredPermission: 'manage_menu',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const { dishId, base64Data, mimeType } = body || {};
    if (isSave && !dishId) {
      return jsonResponse(400, { success: false, error: 'dishId is required' });
    }
    if (!base64Data || typeof base64Data !== 'string') {
      return jsonResponse(400, { success: false, error: 'base64Data is required' });
    }

    const trimmedInput = base64Data.trim();
    const dataUrlMatch = trimmedInput.match(/^data:([^;]+);base64,/i);
    if (dataUrlMatch) {
      const prefixMime = dataUrlMatch[1].trim().toLowerCase();
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(prefixMime)) {
        return jsonResponse(400, { success: false, error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.' });
      }
    }

    if (mimeType && typeof mimeType === 'string') {
      const cleanMime = mimeType.trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(cleanMime)) {
        return jsonResponse(400, { success: false, error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.' });
      }
    }

    const cleanBase64 = trimmedInput.replace(/^data:[^;]+;base64,/i, '').trim();
    if (!cleanBase64) {
      return jsonResponse(400, { success: false, error: 'Uploaded file payload is empty' });
    }

    let buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch (e) {
      return jsonResponse(400, { success: false, error: 'Malformed base64 encoding' });
    }

    if (!buffer || buffer.length === 0) {
      return jsonResponse(400, { success: false, error: 'Decoded buffer has 0 bytes' });
    }

    const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return jsonResponse(413, {
        success: false,
        error: `Payload exceeds 3MB limit (actual size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    const detected = detectImageMagicBytes(buffer);
    if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid file format or header. Allowed types: JPEG, PNG, WebP.'
      });
    }

    const safeDishId = String(dishId || (isSave ? 'dish' : 'upload')).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32) || 'upload';
    const now = Date.now();
    const serverFilename = `${safeDishId}_${now}.${detected.ext}`;
    const dataUrl = `data:${detected.mime};base64,${cleanBase64}`;

    return jsonResponse(200, {
      success: true,
      dishId: safeDishId,
      url: dataUrl,
      image: {
        id: `img_${safeDishId}_${now}`,
        url: dataUrl,
        filename: serverFilename,
        source: isSave ? 'gemini-imagen' : 'upload',
        createdAt: new Date(now).toISOString(),
        approved: true
      },
      message: isSave ? 'Image saved successfully' : 'Image uploaded successfully'
    }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: DELETE /food-images/:filename
  // -----------------------------------------------------------
  const foodImageDeleteMatch = cleanPath.match(/\/food-images\/([^/]+)$/);
  if (event.httpMethod === 'DELETE' && foodImageDeleteMatch) {
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: sanitizeTenantStoreCode(event, body) || undefined,
      requiredPermission: 'manage_menu',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const rawName = decodeURIComponent(foodImageDeleteMatch[1] || '').replace(/\0/g, '');
    const safeFilename = rawName.split(/[\\/]/).pop();
    if (!safeFilename || safeFilename === '.' || safeFilename === '..' || rawName.includes('..')) {
      return jsonResponse(400, { success: false, error: 'Invalid filename' });
    }
    return jsonResponse(200, { success: true, deletedFilename: safeFilename }, gate.extraHeaders);
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
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email).catch(() => {});
      console.error(`[NETLIFY API] ❌ SMTP Email dispatch error for ${email}:`, mailErr);
      return jsonResponse(500, {
        success: false,
        error: `Failed to dispatch verification email to ${email}. Please check your email or use password login.`
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
    if (!record || now > record.expiresAt || record.purpose === 'admin-pin-reset') {
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
    const clientIp = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `pin_otp_req_${clientIp}`,
      limit: 10,
      windowSeconds: 600,
      message: 'Too many PIN reset code requests from this device. Please wait 10 minutes.'
    });
    if (!rateCheck.allowed) {
      return jsonResponse(429, { success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid store owner email.' });
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

    const otp = crypto.randomInt(100000, 1000000).toString();
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
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email).catch(() => {});
      console.error(`[NETLIFY API] ❌ PIN reset email error for ${email}:`, err);
      return jsonResponse(500, {
        success: false,
        error: `Could not send PIN reset email to ${email}. Please check your email or contact support.`
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
    const requestedStoreCode = sanitizeTenantStoreCode(event, body) || '';
    const staffId = body.staffId !== undefined ? body.staffId : null;
    const staffName = body.staffName || null;
    const requestedRole = body.role || null;

    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid store owner email.' });
    }
    if (!/^\d{6}$/.test(submittedOtp)) {
      return jsonResponse(400, { success: false, error: 'Invalid or expired reset code.' });
    }
    if (!/^\d{4}$/.test(newPin)) {
      return jsonResponse(400, { success: false, error: 'PIN must be exactly 4 numeric digits.' });
    }
    if (/^(\d)\1{3}$/.test(newPin) || ['1234', '4321', '1111', '0000'].includes(newPin)) {
      return jsonResponse(400, {
        success: false,
        error: 'Please choose a non-trivial PIN (cannot be repetitive like 0000, 1111 or sequential like 1234, 4321).'
      });
    }

    let record = memoryOtpStore.get(email);
    if (!record || record.consumed) {
      record = await retrieveOtpFromFirestore(email);
    }

    const now = Date.now();
    if (!record || record.consumed || now > record.expiresAt || record.purpose !== 'admin-pin-reset') {
      return jsonResponse(400, { success: false, error: 'Invalid or expired reset code.' });
    }

    if ((record.attempts || 0) >= 3) {
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email);
      return jsonResponse(429, {
        success: false,
        error: 'Too many invalid attempts. Code invalidated. Please request a new code.'
      });
    }

    const expectedOtp = String(record.otp || '');
    const otpBufA = Buffer.from(submittedOtp, 'utf8');
    const otpBufB = Buffer.from(expectedOtp, 'utf8');
    const otpMatches = otpBufA.length === otpBufB.length && crypto.timingSafeEqual(otpBufA, otpBufB);

    if (!otpMatches) {
      record.attempts = (record.attempts || 0) + 1;
      if (record.attempts >= 3) {
        memoryOtpStore.delete(email);
        await removeOtpFromFirestore(email);
        return jsonResponse(429, {
          success: false,
          error: 'Too many invalid attempts. Code invalidated. Please request a new code.'
        });
      }
      memoryOtpStore.set(email, record);
      await persistOtpToFirestore(record);
      const remaining = Math.max(0, 3 - record.attempts);
      return jsonResponse(400, {
        success: false,
        error: `Invalid or expired reset code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    let existingShop = null;
    let existingOwnerEmail = '';
    if (requestedStoreCode) {
      try {
        existingShop = await getStoreFromFirestoreREST(requestedStoreCode);
        if (existingShop && existingShop.success) {
          existingOwnerEmail = normalizeEmail(
            existingShop.ownerEmail ||
            existingShop.profile?.ownerEmail ||
            existingShop.profile?.email ||
            ''
          );
          if (existingOwnerEmail && existingOwnerEmail !== email) {
            return jsonResponse(403, {
              success: false,
              error: 'Forbidden: email does not match store owner.'
            });
          }
        }
      } catch (lookupErr) {
        console.warn('[NETLIFY PIN RESET] Store lookup warning:', lookupErr.message);
      }
    }

    record.consumed = true;
    memoryOtpStore.delete(email);
    await removeOtpFromFirestore(email);

    const pinSalt = crypto.randomBytes(16).toString('hex');
    const saltedPinHash = crypto.createHash('sha256').update(`${newPin}:${pinSalt}:billnaw_pin_v2`).digest('hex');
    const pinHash = hashStringServer(newPin);
    const resolvedRole = requestedRole || 'Admin';
    const stationProfile = resolvedRole === 'Kitchen Chef' ? 'KDS'
      : (resolvedRole === 'Floor Server' ? 'WAITER_MOBILE'
        : (resolvedRole === 'Admin' ? 'ADMIN_MASTER' : 'BILLING_COUNTER'));

    let resolvedStaffId = staffId || (resolvedRole === 'Admin' ? 1 : Date.now());
    let resolvedStaffName = staffName || (resolvedRole === 'Admin' ? 'Store Owner' : resolvedRole);
    let finalRole = resolvedRole;

    if (requestedStoreCode) {
      try {
        const shopProfile = (existingShop && existingShop.success && existingShop.profile && typeof existingShop.profile === 'object')
          ? { ...existingShop.profile }
          : {};
        if (existingOwnerEmail) {
          shopProfile.ownerEmail = existingOwnerEmail;
        }
        const shopStaff = (existingShop && existingShop.success && Array.isArray(existingShop.staff))
          ? existingShop.staff.map(s => ({ ...s }))
          : [];

        let targetStaff = null;
        if (staffId !== null && staffId !== undefined && String(staffId).trim() !== '') {
          targetStaff = shopStaff.find(s => String(s.id || s.staffId) === String(staffId));
        }
        if (!targetStaff && requestedRole) {
          targetStaff = shopStaff.find(s => s.role === requestedRole && (!staffName || s.name === staffName));
        }
        if (!targetStaff && !staffId && (!requestedRole || requestedRole === 'Admin')) {
          targetStaff = shopStaff.find(s => s.role === 'Admin');
        }

        if (targetStaff) {
          finalRole = targetStaff.role || resolvedRole;
          resolvedStaffId = targetStaff.id || resolvedStaffId;
          resolvedStaffName = targetStaff.name || resolvedStaffName;
          delete targetStaff.pin;
          delete targetStaff.initialOtp;
          delete targetStaff.otp;
          targetStaff.otpHash = null;
          targetStaff.pin_hash = saltedPinHash;
          targetStaff.pin_salt = pinSalt;
          targetStaff.pinSalt = pinSalt;
          targetStaff.pinHash = saltedPinHash;
          targetStaff.mustChangePin = false;
          targetStaff.otpConsumed = true;
          targetStaff.updatedAt = new Date().toISOString();
        } else {
          shopStaff.push({
            id: resolvedStaffId,
            name: resolvedStaffName,
            role: finalRole,
            stationProfile,
            status: 'Active',
            pin_hash: saltedPinHash,
            pin_salt: pinSalt,
            pinSalt,
            pinHash: saltedPinHash,
            mustChangePin: false,
            otpConsumed: true,
            updatedAt: new Date().toISOString()
          });
        }

        if (finalRole === 'Admin') {
          shopProfile.adminPinHash = pinHash;
          shopProfile.adminPinSalt = pinSalt;
          shopProfile.adminSaltedPinHash = saltedPinHash;
        }

        await syncStoreToFirestoreREST(requestedStoreCode, {
          ownerEmail: existingOwnerEmail || email,
          profile: shopProfile,
          staff: shopStaff
        }).catch(() => null);
      } catch (syncErr) {
        console.warn('[NETLIFY PIN RESET] Store sync warning:', syncErr.message);
      }
    }

    return jsonResponse(200, {
      success: true,
      message: `${resolvedStaffName} (${finalRole}) PIN reset successfully!`,
      adminPinHash: pinHash,
      pinSalt,
      pinHash: saltedPinHash,
      staffId: resolvedStaffId,
      staffName: resolvedStaffName,
      role: finalRole,
      stationProfile,
      storeCode: requestedStoreCode
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/forgot-password/send-otp
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/forgot-password/send-otp' || cleanPath.endsWith('/forgot-password/send-otp'))) {
    const clientIp = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'client';
    const rateCheck = checkRateLimit({
      key: `pw_otp_req_${clientIp}`,
      limit: 10,
      windowSeconds: 600,
      message: 'Too many password reset requests from this device. Please wait 10 minutes.'
    });
    if (!rateCheck.allowed) {
      return jsonResponse(429, { success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfter });
    }

    const email = normalizeEmail(body.email);
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

    const otp = crypto.randomInt(100000, 1000000).toString();
    const record = {
      email,
      otp,
      purpose: 'password-reset',
      createdAt: now,
      expiresAt: now + (600 * 1000),
      resendAvailableAt: now + (60 * 1000),
      attempts: 0,
      consumed: false
    };

    memoryOtpStore.set(email, record);
    await persistOtpToFirestore(record);

    try {
      await dispatchEmail(email, otp, 'password-reset');
      return jsonResponse(200, {
        success: true,
        message: `Password reset code sent to ${email}`,
        cooldownSeconds: 60
      });
    } catch (err) {
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email).catch(() => {});
      console.error(`[NETLIFY API] ❌ Password reset email error for ${email}:`, err);
      return jsonResponse(500, {
        success: false,
        error: `Could not send password reset email to ${email}. Please check your email or sign in with Email + OTP.`
      });
    }
  }

  // -----------------------------------------------------------
  // Route: /auth/forgot-password/reset
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/forgot-password/reset' || cleanPath.endsWith('/forgot-password/reset'))) {
    const email = normalizeEmail(body.email);
    const submittedOtp = String(body.otp || '').trim();
    const newPassword = String(body.newPassword || '');

    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid email address.' });
    }
    if (!/^\d{6}$/.test(submittedOtp)) {
      return jsonResponse(400, { success: false, error: 'Please enter the 6-digit reset code.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return jsonResponse(400, { success: false, error: 'Password must be at least 6 characters.' });
    }

    let record = memoryOtpStore.get(email);
    if (!record) {
      record = await retrieveOtpFromFirestore(email);
      if (record) memoryOtpStore.set(email, record);
    }

    if (!record || record.consumed || Date.now() > record.expiresAt) {
      return jsonResponse(400, { success: false, error: 'Invalid or expired reset code.' });
    }
    if (record.purpose !== 'password-reset') {
      return jsonResponse(400, { success: false, error: 'Invalid OTP purpose for password reset.' });
    }

    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 3) {
      record.consumed = true;
      await persistOtpToFirestore(record);
      return jsonResponse(429, { success: false, error: 'Maximum verification attempts exceeded. Please request a new reset code.' });
    }

    const a = Buffer.from(String(record.otp), 'utf8');
    const b = Buffer.from(submittedOtp, 'utf8');
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      await persistOtpToFirestore(record);
      return jsonResponse(400, { success: false, error: `Incorrect reset code. ${3 - record.attempts} attempt(s) remaining.` });
    }

    record.consumed = true;
    await persistOtpToFirestore(record);

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);
    let existingUser = await retrieveAuthUserFromFirestore(email);
    const uid = existingUser?.uid || ('usr_' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 10));
    const storeCode = existingUser?.storeCode || generateStoreCode(existingUser?.shopName || 'Billnaw Cafe', email);
    const updatedUser = {
      ...(existingUser || {}),
      uid,
      email,
      firstName: existingUser?.firstName || '',
      lastName: existingUser?.lastName || '',
      shopName: existingUser?.shopName || 'Billnaw Cafe',
      phone: existingUser?.phone || '',
      storeCode,
      passwordHash,
      salt,
      role: existingUser?.role || 'Owner',
      createdAt: existingUser?.createdAt || new Date().toISOString()
    };

    setAuthUserRecord(updatedUser);
    await persistAuthUserToFirestore(updatedUser);

    return jsonResponse(200, {
      success: true,
      message: 'Password updated successfully! You can now sign in.',
      email,
      storeCode
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
  // Route: /auth/login & /auth/login-password (PBKDF2 + Firestore Fallback)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/login' || cleanPath === '/auth/login-password')) {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) {
      return jsonResponse(400, { success: false, error: 'Email and password are required.' });
    }
    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid email address.' });
    }

    // 1. Check in-memory auth-service userStore (includes demo@billnawcafe.com and warm-container signups)
    const localAuth = loginWithPassword({ email, password });
    let verifiedUser = null;
    let storeCode = '';
    let sessionToken = '';
    let localShop = null;

    if (localAuth.status === 200 && localAuth.data?.success) {
      verifiedUser = localAuth.data.user;
      storeCode = localAuth.data.storeCode;
      sessionToken = localAuth.data.sessionToken;
      localShop = localAuth.data.shop;
    } else {
      // 2. Serverless cold-start fallback via Firestore clients/_auth/users/{email}
      const cloudUser = await retrieveAuthUserFromFirestore(email);
      if (!cloudUser || !cloudUser.passwordHash || !cloudUser.salt) {
        return jsonResponse(401, { success: false, error: 'Invalid credentials' });
      }
      const computedHash = hashPassword(password, cloudUser.salt);
      const computedBuf = Buffer.from(computedHash, 'hex');
      const storedBuf = Buffer.from(cloudUser.passwordHash, 'hex');
      if (computedBuf.length !== storedBuf.length || !crypto.timingSafeEqual(computedBuf, storedBuf)) {
        return jsonResponse(401, { success: false, error: 'Invalid credentials' });
      }
      setAuthUserRecord(cloudUser);
      verifiedUser = {
        uid: cloudUser.uid,
        email: cloudUser.email,
        firstName: cloudUser.firstName,
        lastName: cloudUser.lastName,
        shopName: cloudUser.shopName,
        storeCode: cloudUser.storeCode,
        role: cloudUser.role || 'Owner'
      };
      storeCode = cloudUser.storeCode || generateStoreCode(cloudUser.shopName, email);
      sessionToken = 'billnaw_' + crypto.randomBytes(24).toString('hex');
    }

    const resolvedRole = verifiedUser.role || 'Owner';
    const token = createSignedAuthToken({
      uid: verifiedUser.uid,
      email: verifiedUser.email,
      storeCode,
      role: resolvedRole
    });

    let existingShop = null;
    try {
      existingShop = await getStoreFromFirestoreREST(storeCode);
    } catch (e) {}

    const shopPayload = (existingShop && existingShop.success)
      ? {
          storeCode,
          name: (existingShop.profile?.name && existingShop.profile.name !== 'My Cafe' && existingShop.profile.name !== 'billnaw')
            ? existingShop.profile.name
            : (existingShop.name && existingShop.name !== 'My Cafe' ? existingShop.name : (verifiedUser.shopName || storeCode)),
          profile: existingShop.profile,
          staff: existingShop.staff,
          tables: existingShop.tables,
          menu: existingShop.menu,
          categories: existingShop.categories
        }
      : (localShop || { name: verifiedUser.shopName || body.shopName || storeCode, storeCode });

    return jsonResponse(200, {
      success: true,
      message: 'Login successful',
      token,
      sessionToken,
      customToken: token,
      storeCode,
      isOwner: true,
      user: { ...verifiedUser, role: resolvedRole, isOwner: true },
      shop: shopPayload
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/signup & /auth/register (PBKDF2 + Firestore Persistence)
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/auth/signup' || cleanPath === '/auth/register')) {
    const email = normalizeEmail(body.email);
    const shopName = String(body.shopName || '').trim() || (email ? ('Shop ' + email.split('@')[0]) : '');
    const firstName = String(body.firstName || 'Owner').trim();
    const lastName = String(body.lastName || '').trim();
    const password = body.password;
    const confirmPassword = body.confirmPassword;
    const adminPin = body.adminPin;
    const phone = body.phone;
    const submittedOtp = (body.otp !== undefined && body.otp !== null) ? String(body.otp).trim() : '';

    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, error: 'Invalid email address' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return jsonResponse(400, { success: false, error: 'Password must be at least 6 characters' });
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return jsonResponse(400, { success: false, error: 'Passwords do not match' });
    }

    // Check duplicate in Firestore as well as memory
    const existingCloudUser = await retrieveAuthUserFromFirestore(email);
    if (existingCloudUser && existingCloudUser.email === email) {
      return jsonResponse(400, { success: false, error: 'An account with this email already exists' });
    }

    // Verify OTP against memory / Firestore if provided
    if (submittedOtp !== '') {
      if (!/^\d{6}$/.test(submittedOtp)) {
        return jsonResponse(400, { success: false, error: 'Invalid or expired email verification code' });
      }
      let otpRecord = memoryOtpStore.get(email);
      if (!otpRecord || otpRecord.consumed) {
        otpRecord = await retrieveOtpFromFirestore(email);
      }
      if (!otpRecord || otpRecord.consumed || Date.now() > otpRecord.expiresAt) {
        return jsonResponse(400, { success: false, error: 'Invalid or expired email verification code' });
      }
      if ((otpRecord.attempts || 0) >= 3) {
        memoryOtpStore.delete(email);
        await removeOtpFromFirestore(email);
        return jsonResponse(429, { success: false, error: 'Too many invalid attempts. Code invalidated.' });
      }
      const otpBufA = Buffer.from(submittedOtp, 'utf8');
      const otpBufB = Buffer.from(String(otpRecord.otp || ''), 'utf8');
      if (otpBufA.length !== otpBufB.length || !crypto.timingSafeEqual(otpBufA, otpBufB)) {
        otpRecord.attempts = (otpRecord.attempts || 0) + 1;
        memoryOtpStore.set(email, otpRecord);
        await persistOtpToFirestore(otpRecord);
        return jsonResponse(400, { success: false, error: 'Invalid or expired email verification code' });
      }
      otpRecord.consumed = true;
      memoryOtpStore.delete(email);
      await removeOtpFromFirestore(email);
    }

    const regResult = registerUser({
      firstName,
      lastName,
      shopName,
      email,
      password,
      confirmPassword,
      phone,
      adminPin
    });

    if (regResult.status !== 200 || !regResult.data?.success) {
      return jsonResponse(regResult.status || 400, regResult.data || { success: false, error: 'Signup failed' });
    }

    // Persist hashed user record to Firestore for cold-start login continuity
    const regUser = regResult.data.user;
    const storeCode = regResult.data.storeCode;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    // Keep auth-service in-memory userStore and Firestore in sync with identical salt/hash
    const persistentUserRecord = setAuthUserRecord({
      ...regUser,
      passwordHash,
      salt,
      role: 'Owner',
      createdAt: new Date().toISOString()
    });
    await persistAuthUserToFirestore(persistentUserRecord);

    const token = createSignedAuthToken({
      uid: regUser.uid,
      email: regUser.email,
      storeCode,
      role: 'Owner'
    });

    // Seed shop into Firestore using configured adminPin (never hardcoded '1234' when adminPin was provided)
    try {
      const effectivePin = (adminPin && /^\d{4}$/.test(String(adminPin).trim())) ? String(adminPin).trim() : '1234';
      const pinSalt = crypto.randomBytes(16).toString('hex');
      const saltedPinHash = crypto.createHash('sha256').update(`${effectivePin}:${pinSalt}:billnaw_pin_v2`).digest('hex');
      const pinHash = hashStringServer(effectivePin);
      const defaultTables = {};
      for (let i = 1; i <= 10; i++) {
        defaultTables[String(i)] = { id: String(i), name: `Table ${i}`, status: 'available' };
      }
      await syncStoreToFirestoreREST(storeCode, {
        ownerEmail: email,
        profile: {
          ...regResult.data.shop?.profile,
          name: shopName,
          tableCount: 10,
          phone: regUser.phone || '9876543210',
          adminPinHash: pinHash,
          adminPinSalt: pinSalt,
          adminSaltedPinHash: saltedPinHash,
          gstMode: 'inclusive',
          defaultGstRate: 5
        },
        staff: [
          {
            id: 1,
            name: 'Store Owner',
            role: 'Admin',
            status: 'Active',
            phone: regUser.phone || '9876543210',
            pinSalt,
            pinHash: saltedPinHash,
            pin_salt: pinSalt,
            pin_hash: saltedPinHash
          }
        ],
        tables: defaultTables,
        categories: ['All', 'Snacks', 'Beverages', 'Main Course'],
        menu: regResult.data.shop?.menu || []
      });
    } catch (seedErr) {
      console.warn('[NETLIFY SIGNUP] Auto-seed note:', seedErr.message);
    }

    return jsonResponse(200, {
      success: true,
      message: 'Account created successfully',
      token,
      sessionToken: regResult.data.sessionToken,
      customToken: token,
      storeCode,
      isOwner: true,
      user: { ...regUser, role: 'Owner', isOwner: true },
      shop: regResult.data.shop || { name: shopName, storeCode }
    });
  }

  // -----------------------------------------------------------
  // Route: /auth/logout
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/auth/logout') {
    return jsonResponse(200, { success: true, message: 'Logged out successfully.' });
  }

  // -----------------------------------------------------------
  // Route: /auth/sessions (Authenticated, Tenant-Scoped, Redacted)
  // -----------------------------------------------------------
  if (event.httpMethod === 'GET' && cleanPath === '/auth/sessions') {
    const requestedStore = sanitizeTenantStoreCode(event, body) || undefined;
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: requestedStore,
      requiredPermission: 'manage_staff',
      allowGracefulMigration: false,
      allowBodyToken: false
    });
    if (!gate.ok) return gate.response;

    const q = event.queryStringParameters || {};
    const callerRole = normalizeBackendRole(gate.auth.user?.role || 'Cashier');
    const isSuper = Boolean(gate.auth.isAdminSecret || callerRole === 'SuperAdmin');
    const scopedStoreCode = isSuper ? (requestedStore || gate.auth.storeCode || undefined) : gate.auth.storeCode;
    const scopedEmail = isSuper ? (q.email || undefined) : (q.email && normalizeEmail(q.email) === normalizeEmail(gate.auth.user?.email || '') ? q.email : undefined);

    const sessions = listActiveSessions(scopedStoreCode, scopedEmail).map(({ token: _rawToken, ...safeSession }) => safeSession);
    return jsonResponse(200, {
      success: true,
      storeCode: scopedStoreCode || null,
      count: sessions.length,
      sessions
    }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /auth/sessions/revoke
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/auth/sessions/revoke') {
    const requestedStore = sanitizeTenantStoreCode(event, body) || undefined;
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: requestedStore,
      requiredPermission: null,
      allowGracefulMigration: false,
      allowBodyToken: false
    });
    if (!gate.ok) return gate.response;

    const { token: targetTok, sessionId, storeCode, email, revokeAll, keepCurrent } = body || {};
    const callerToken = extractAuthToken(event, body, { allowBodyToken: false });
    const callerRole = normalizeBackendRole(gate.auth.user?.role || 'Cashier');
    const isSuper = Boolean(gate.auth.isAdminSecret || callerRole === 'SuperAdmin');

    const targetId = targetTok || sessionId;
    const isSelfRevoke = Boolean(
      !revokeAll &&
      targetId &&
      callerToken &&
      (targetId === callerToken ||
        targetId === ('sess_' + crypto.createHash('sha256').update(callerToken).digest('hex').slice(0, 12)))
    );

    if (!isSelfRevoke) {
      const rbac = verifyEndpointAccess({ authResult: gate.auth, eventOrReq: event, requiredPermission: 'manage_staff' });
      if (!rbac.allowed) {
        return jsonResponse(rbac.status || 403, { success: false, error: rbac.error });
      }
    }

    if (revokeAll) {
      const targetStore = isSuper ? (storeCode || gate.auth.storeCode) : gate.auth.storeCode;
      const except = keepCurrent ? callerToken : null;
      if (storeCode || !email) {
        if (!isSuper && storeCode && String(storeCode).trim().toUpperCase() !== String(gate.auth.storeCode || '').trim().toUpperCase()) {
          return jsonResponse(403, { success: false, error: 'Cross-tenant session revocation forbidden' });
        }
        const result = revokeSessionsForStore(targetStore, except);
        return jsonResponse(result.status, result.data, gate.extraHeaders);
      }
      if (!isSuper && normalizeEmail(email) !== normalizeEmail(gate.auth.user?.email || '')) {
        return jsonResponse(403, { success: false, error: 'Cross-tenant user session revocation forbidden' });
      }
      const result = revokeSessionsForUser(email, except);
      return jsonResponse(result.status, result.data, gate.extraHeaders);
    }

    if (!targetId) {
      return jsonResponse(400, { success: false, error: 'target token or sessionId is required' });
    }
    const result = revokeSession(targetId, isSuper ? null : (gate.auth.storeCode || '__MISSING_STORE__'));
    return jsonResponse(result.status, result.data, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /devices/revoke & /devices/resume
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && (cleanPath === '/devices/revoke' || cleanPath === '/devices/resume')) {
    const isRevoke = cleanPath === '/devices/revoke';
    const code = sanitizeTenantStoreCode(event, body);
    if (!code) {
      return jsonResponse(400, { success: false, error: 'Valid storeCode is required' });
    }
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: code,
      requiredPermission: 'manage_devices',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const { deviceId } = body || {};
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
      return jsonResponse(400, { success: false, error: 'deviceId is required' });
    }

    if (FIREBASE_PROJECT_ID && FIRESTORE_DATABASE_ID) {
      const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
      const fieldName = isRevoke ? 'revokedAt' : 'resumedAt';
      const newStatus = isRevoke ? 'REVOKED' : 'AUTHORIZED';
      const url = `${base}/cafes/${encodeURIComponent(code)}/devices/${encodeURIComponent(deviceId.trim())}?updateMask.fieldPaths=status&updateMask.fieldPaths=${fieldName}`;
      try {
        const patchRes = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: newStatus },
              [fieldName]: { stringValue: new Date().toISOString() }
            }
          })
        });
        if (!patchRes || !patchRes.ok) {
          return jsonResponse(patchRes?.status >= 400 ? patchRes.status : 502, {
            success: false,
            error: `Firestore device ${isRevoke ? 'revoke' : 'resume'} failed (${patchRes?.status || 502})`
          });
        }
      } catch (err) {
        return jsonResponse(502, { success: false, error: err.message || 'Firestore device update failed' });
      }
    }

    return jsonResponse(200, {
      success: true,
      message: isRevoke ? `Device ${deviceId} revoked` : `Device ${deviceId} resumed & authorized`,
      status: isRevoke ? 'REVOKED' : 'AUTHORIZED'
    }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /store/reset-data
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/store/reset-data') {
    const requestedStore = sanitizeTenantStoreCode(event, body) || undefined;
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: requestedStore,
      requiredPermission: 'change_settings',
      allowGracefulMigration: false,
      allowBodyToken: false
    });
    if (!gate.ok) return gate.response;

    const targetCode = requestedStore || gate.auth.storeCode;
    if (!targetCode) {
      return jsonResponse(400, { success: false, error: 'Valid storeCode is required' });
    }
    const result = resetStoreCloudData(targetCode);
    return jsonResponse(200, result, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /reports/generate-statement
  // -----------------------------------------------------------
  if (event.httpMethod === 'POST' && cleanPath === '/reports/generate-statement') {
    const code = sanitizeTenantStoreCode(event, body);
    if (!code) {
      return jsonResponse(400, { success: false, error: 'Valid storeCode is required' });
    }
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: code,
      requiredPermission: 'view_reports',
      allowGracefulMigration: false
    });
    if (!gate.ok) return gate.response;

    const { startDate, endDate, format = 'csv', transactions } = body || {};
    pruneExpiredReportTokens();
    const startMs = startDate ? Date.parse(startDate) : (Date.now() - 30 * 86400000);
    const parseEndMs = (val) => {
      if (!val) return Date.now();
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T23:59:59.999Z`);
      return Date.parse(s);
    };
    const endMs = parseEndMs(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return jsonResponse(400, { success: false, error: 'Invalid startDate or endDate' });
    }

    let sourceHistory = Array.isArray(transactions) ? transactions : [];
    if (sourceHistory.length === 0) {
      const cloudStore = await getStoreFromFirestoreREST(code).catch(() => null);
      if (cloudStore && cloudStore.success && Array.isArray(cloudStore.history)) {
        sourceHistory = cloudStore.history;
      }
    }

    const csvEscape = (v) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const filtered = sourceHistory.filter((tx) => {
      if (!tx || typeof tx !== 'object') return false;
      const st = String(tx.status || 'SETTLED').trim().toUpperCase();
      if (st === 'VOID' || st === 'CANCELLED') return false;
      const dt = Date.parse(tx.createdAt || tx.created_at || tx.date || tx.settled_at || '');
      if (Number.isFinite(dt) && (dt < startMs || dt > endMs)) return false;
      return true;
    });

    const header = 'Date,Bill No,Table,Customer,Items,Payment Mode,Gross (Rs),Tax (Rs),Net Total (Rs),Status';
    const rows = [header];
    for (const tx of filtered) {
      const itemsStr = Array.isArray(tx.items)
        ? tx.items.map(i => `${i.name || 'Item'} (x${i.qty || i.quantity || 1})`).join('; ')
        : String(tx.items || '');
      rows.push([
        csvEscape(String(tx.date || tx.createdAt || tx.created_at || '').slice(0, 10)),
        csvEscape(tx.billNo || tx.invoiceNo || tx.id || ''),
        csvEscape(tx.table || tx.tableName || 'Counter'),
        csvEscape(tx.customerName || tx.customer?.name || 'Walk-in'),
        csvEscape(itemsStr),
        csvEscape(tx.paymentMode || tx.paymentMethod || 'Cash'),
        csvEscape(Number(tx.grossTotal ?? tx.subtotal ?? tx.total ?? 0).toFixed(2)),
        csvEscape(Number(tx.tax ?? tx.gst ?? 0).toFixed(2)),
        csvEscape(Number(tx.total ?? tx.amount ?? 0).toFixed(2)),
        csvEscape(String(tx.status || 'SETTLED').toUpperCase())
      ].join(','));
    }

    const safeExt = format === 'pdf' ? 'pdf' : 'csv';
    const safeStoreSlug = code.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `statement_${safeStoreSlug}_${new Date(startMs).toISOString().slice(0, 10)}_to_${new Date(endMs).toISOString().slice(0, 10)}.${safeExt}`;
    const token = crypto.randomBytes(32).toString('hex');
    const csvContent = rows.join('\n');
    const expiresAtMs = Date.now() + 15 * 60 * 1000;

    reportTokens.set(token, {
      storeCode: code,
      filename,
      format: safeExt,
      content: csvContent,
      expiresAt: expiresAtMs
    });

    return jsonResponse(200, {
      success: true,
      token,
      downloadUrl: `/api/reports/download/${token}?filename=${encodeURIComponent(filename)}`,
      filename,
      totalRecords: filtered.length,
      csvContent,
      expiresAt: new Date(expiresAtMs).toISOString()
    }, gate.extraHeaders);
  }

  // -----------------------------------------------------------
  // Route: /reports/download/:token
  // -----------------------------------------------------------
  const reportDlMatch = event.httpMethod === 'GET' && cleanPath.match(/^\/reports\/download\/([^/]+)$/);
  if (reportDlMatch) {
    const gate = requireTenantAndPermission(event, body, {
      targetStoreCode: undefined,
      requiredPermission: 'view_reports',
      allowGracefulMigration: false,
      allowBodyToken: false,
      allowQueryToken: true
    });
    if (!gate.ok) return gate.response;

    const dlToken = decodeURIComponent(reportDlMatch[1] || '').trim();
    const info = reportTokens.get(dlToken);
    if (!info || Date.now() > info.expiresAt) {
      if (info) reportTokens.delete(dlToken);
      return {
        statusCode: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
        body: 'Download link expired or invalid.'
      };
    }

    const callerRole = normalizeBackendRole(gate.auth.user?.role || 'Cashier');
    if (!gate.auth.isAdminSecret && callerRole !== 'SuperAdmin') {
      const authStore = String(gate.auth.storeCode || '').trim().toUpperCase();
      const reportStore = String(info.storeCode || '').trim().toUpperCase();
      if (!authStore || authStore !== reportStore) {
        return jsonResponse(403, {
          success: false,
          error: `Cross-tenant access forbidden: store [${authStore}] cannot download report for [${reportStore}].`
        });
      }
    }

    const q = event.queryStringParameters || {};
    const rawName = String(q.filename || info.filename || '');
    const stripped = rawName.replace(/[\r\n\x00-\x1f"';\\\/]/g, '');
    const baseName = path.basename(stripped);
    const ext = info.format === 'pdf' ? '.pdf' : '.csv';
    const safeStem = baseName.replace(/\.(csv|pdf)$/i, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || `statement_${dlToken.slice(0, 8)}`;
    const safeFilename = `${safeStem}${ext}`;

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        ...gate.extraHeaders,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Type': info.format === 'pdf' ? 'application/pdf' : 'text/csv',
        'Cache-Control': 'no-store'
      },
      body: info.content || ''
    };
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

// Netlify Functions v2 Path Configuration
export const config = {
  path: ["/api/*", "/.netlify/functions/api/*"]
};
