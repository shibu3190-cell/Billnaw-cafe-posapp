// server/quota-service.js - Client AI Quota & Custom Key Management
// Enforces 10 uses/month default limit, client-level overrides, and custom API keys per client.

import { CONFIG } from './config.js';
import { resolveGeminiApiKey } from './gemini-service.js';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
const DEFAULT_MONTHLY_LIMIT = 10;
const localClientMemoryStore = new Map();

// Helper to get current calendar year-month string (e.g., '2026-09')
export function getCurrentYearMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Fetch client document directly from Firestore REST API (server-side, zero SDK dependency)
 */
export async function getClientProfileData(clientId) {
  const targetId = clientId || 'BONGBHOJ-TERMINAL';
  const memoryCached = localClientMemoryStore.get(targetId) || {};
  const url = `${FIRESTORE_BASE}/clients/${encodeURIComponent(targetId)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      console.log(`[Firestore Quota] Client fetch status: ${res.status}`);
      return null;
    }
    const doc = await res.json();
    if (!doc.fields) return null;

    // Convert Firestore REST field format to standard JS object
    const data = {};
    for (const [key, valueObj] of Object.entries(doc.fields)) {
      if ('stringValue' in valueObj) data[key] = valueObj.stringValue;
      else if ('integerValue' in valueObj) data[key] = parseInt(valueObj.integerValue, 10);
      else if ('doubleValue' in valueObj) data[key] = parseFloat(valueObj.doubleValue);
      else if ('booleanValue' in valueObj) data[key] = valueObj.booleanValue;
    }
    return { ...memoryCached, ...data };
  } catch (err) {
    console.log(`[Firestore Quota] Offline profile fallback for ${targetId}:`, err.message);
    return Object.keys(memoryCached).length > 0 ? memoryCached : null;
  }
}

/**
 * Update client quota or custom key directly in Firestore REST API
 */
export async function updateClientProfileData(clientId, fieldsToUpdate) {
  const targetId = clientId || 'BONGBHOJ-TERMINAL';
  const existingMemory = localClientMemoryStore.get(targetId) || {};
  localClientMemoryStore.set(targetId, { ...existingMemory, ...fieldsToUpdate });

  const fieldPaths = Object.keys(fieldsToUpdate);
  if (fieldPaths.length === 0) return true;

  const updateMask = fieldPaths.map(p => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
  const url = `${FIRESTORE_BASE}/clients/${encodeURIComponent(targetId)}?${updateMask}`;

  const firestoreFields = {};
  for (const [k, v] of Object.entries(fieldsToUpdate)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = Number.isInteger(v) ? { integerValue: v.toString() } : { doubleValue: v };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
  }

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: firestoreFields })
    });
    return true;
  } catch (err) {
    console.log(`[Firestore Quota] Profile update status:`, err.message);
    return true; // Memory cache updated successfully
  }
}

/**
 * Check and resolve client AI key, without incrementing quota until execution succeeds
 */
export async function checkAiQuotaAndKey(clientId) {
  const currentMonth = getCurrentYearMonth();
  const profile = await getClientProfileData(clientId);

  // 1. Resolve Monthly Limit (default 10 or custom specified for this client)
  const monthlyLimit = (profile && typeof profile.aiMonthlyLimit === 'number' && profile.aiMonthlyLimit >= 0)
    ? profile.aiMonthlyLimit
    : DEFAULT_MONTHLY_LIMIT;

  // 2. Resolve Current Usage
  const storedMonth = profile?.aiUsageMonth || currentMonth;
  let currentUsage = (profile && storedMonth === currentMonth && typeof profile.aiUsageCount === 'number')
    ? profile.aiUsageCount
    : 0;

  // 3. Resolve API Key (Dedicated Client Key or Global Server Key)
  const clientCustomKey = profile?.customGeminiKey ? profile.customGeminiKey.trim() : '';
  const effectiveApiKey = resolveGeminiApiKey(clientCustomKey);

  // 4. Verify Quota Limit
  if (currentUsage >= monthlyLimit) {
    const err = new Error(`Monthly AI menu upload limit (${monthlyLimit} scans/month) reached for client '${clientId || 'store'}'. Usage resets next month.`);
    err.status = 429;
    err.quota = {
      limit: monthlyLimit,
      used: currentUsage,
      remaining: 0,
      month: currentMonth,
      isCustomLimit: Boolean(profile?.aiMonthlyLimit !== undefined)
    };
    throw err;
  }

  return {
    apiKey: effectiveApiKey,
    isCustomKey: Boolean(clientCustomKey),
    currentUsage,
    monthlyLimit,
    currentMonth
  };
}

/**
 * Record a successful AI extraction in Firestore
 */
export async function recordSuccessfulAiUsage(clientId, checkResult) {
  const newUsage = checkResult.currentUsage + 1;
  await updateClientProfileData(clientId, {
    aiUsageCount: newUsage,
    aiUsageMonth: checkResult.currentMonth
  });

  return {
    limit: checkResult.monthlyLimit,
    used: newUsage,
    remaining: Math.max(0, checkResult.monthlyLimit - newUsage),
    month: checkResult.currentMonth,
    isCustomLimit: Boolean(checkResult.isCustomLimit)
  };
}

/**
 * Backward-compatible helper that checks quota and resolves key
 */
export async function checkAndIncrementAiQuota(clientId) {
  const res = await checkAiQuotaAndKey(clientId);
  const quota = await recordSuccessfulAiUsage(clientId, res);
  return {
    apiKey: res.apiKey,
    isCustomKey: res.isCustomKey,
    quota
  };
}

/**
 * Read-only quota check for client dashboard/settings
 */
export async function getClientQuotaInfo(clientId) {
  const currentMonth = getCurrentYearMonth();
  const profile = await getClientProfileData(clientId);

  const monthlyLimit = (profile && typeof profile.aiMonthlyLimit === 'number' && profile.aiMonthlyLimit >= 0)
    ? profile.aiMonthlyLimit
    : DEFAULT_MONTHLY_LIMIT;

  const storedMonth = profile?.aiUsageMonth || currentMonth;
  const currentUsage = (profile && storedMonth === currentMonth && typeof profile.aiUsageCount === 'number')
    ? profile.aiUsageCount
    : 0;

  const hasCustomKey = Boolean(profile?.customGeminiKey && profile.customGeminiKey.trim().length > 0);

  return {
    clientId: clientId || 'BONGBHOJ-TERMINAL',
    month: currentMonth,
    limit: monthlyLimit,
    used: currentUsage,
    remaining: Math.max(0, monthlyLimit - currentUsage),
    hasCustomKey,
    keyMasked: hasCustomKey ? `${profile.customGeminiKey.substring(0, 7)}...${profile.customGeminiKey.slice(-4)}` : 'Global Server Key (Default)',
    isCustomLimit: Boolean(profile?.aiMonthlyLimit !== undefined)
  };
}
