// server/sync-service.js - Backend Shop Mapping, Cloud Sync, Backup, and Diagnostics
// Manages shop data integrity, verification, cloud configuration, and state mapping.

import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

const isServerlessEnv = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const STORE_CACHE_FILE = path.join(isServerlessEnv ? '/tmp' : path.resolve(process.cwd(), 'data'), 'stores_state_cache.json');
const serverStoreMemoryCache = new Map();

try {
  if (fs.existsSync(STORE_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(STORE_CACHE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (k && v && typeof v === 'object') serverStoreMemoryCache.set(k, v);
      }
    }
  }
} catch (e) {}

function saveServerStoreCacheToDisk() {
  try {
    const dir = path.dirname(STORE_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const serialized = {};
    for (const [k, v] of serverStoreMemoryCache.entries()) {
      serialized[k] = v;
    }
    fs.writeFileSync(STORE_CACHE_FILE, JSON.stringify(serialized), 'utf8');
  } catch (e) {}
}

export function getShopStatus() {
  return {
    status: 'online',
    serverTime: new Date().toISOString(),
    geminiConfigured: Boolean(CONFIG.gemini.apiKey),
    sheetsConfigured: Boolean(CONFIG.sheets.defaultWebhookUrl),
    firebase: {
      projectId: CONFIG.firebase.projectId,
      firestoreDatabaseId: CONFIG.firebase.firestoreDatabaseId,
      realtimeSyncSupported: true,
      authDomain: CONFIG.firebase.authDomain,
      storageBucket: CONFIG.firebase.storageBucket
    }
  };
}

export function getPublicClientConfig() {
  // Returns safe public parameters to client without exposing backend secrets or server tokens
  return {
    projectId: CONFIG.firebase.projectId,
    firestoreDatabaseId: CONFIG.firebase.firestoreDatabaseId,
    authDomain: CONFIG.firebase.authDomain,
    storageBucket: CONFIG.firebase.storageBucket,
    messagingSenderId: CONFIG.firebase.messagingSenderId,
    appId: CONFIG.firebase.appId,
    apiKey: CONFIG.firebase.apiKey,
    geminiServerAvailable: Boolean(CONFIG.gemini.apiKey),
    sheetsServerAvailable: Boolean(CONFIG.sheets.defaultWebhookUrl)
  };
}

export function createShopExportBundle({ clientId, profile, staff, menu, customers, history, expenses, tables }) {
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    clientId: clientId || 'SHOP-BILLNAW-01',
    profile: profile || {},
    staff: staff || [],
    customers: customers || [],
    menu: menu || [],
    tables: tables || {},
    history: history || [],
    expenses: expenses || []
  };
}

export function validateShopImportBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Invalid backup file. Payload must be a JSON object.');
  }

  return {
    valid: true,
    shopName: bundle.profile?.name || 'Unnamed Store',
    clientId: bundle.clientId || 'SHOP-BILLNAW-01',
    staffCount: Array.isArray(bundle.staff) ? bundle.staff.length : 0,
    customerCount: Array.isArray(bundle.customers) ? bundle.customers.length : 0,
    menuItemCount: Array.isArray(bundle.menu) ? bundle.menu.length : 0,
    historyCount: Array.isArray(bundle.history) ? bundle.history.length : 0,
    expenseCount: Array.isArray(bundle.expenses) ? bundle.expenses.length : 0
  };
}

export function getStoreCollectionName(code = '') {
  // Unified canonical collection: all stores reside under 'shops'
  return 'shops';
}

export function firestoreValueToJson(val) {
  if (!val || typeof val !== 'object') return val;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) {
    const num = Number(val.integerValue);
    return Number.isSafeInteger(num) ? num : val.integerValue;
  }
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(firestoreValueToJson);
  }
  if ('mapValue' in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = firestoreValueToJson(v);
    }
    return res;
  }
  return val;
}

export function jsonToFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isNaN(val) || !Number.isFinite(val)) return { nullValue: null };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(v => jsonToFirestoreValue(v)).filter(v => v !== undefined)
      }
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = jsonToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function jsonToFirestoreFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = jsonToFirestoreValue(v);
    }
  }
  return fields;
}

function parseComparableTimestamp(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const asNum = Number(val);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function isExplicitTableReset(tData) {
  if (!tData || typeof tData !== 'object' || Array.isArray(tData)) return false;
  if (tData.items !== undefined && (!Array.isArray(tData.items) || tData.items.length > 0)) return false;
  if (tData.occupied === false) return true;
  const status = String(tData.status || '').trim().toLowerCase();
  return ['empty', 'available', 'vacant', 'cleared', 'billed'].includes(status);
}

function mergeTableEntry(existingTable, incomingTable) {
  if (!incomingTable || typeof incomingTable !== 'object' || Array.isArray(incomingTable)) {
    return existingTable ?? incomingTable;
  }
  if (!existingTable || typeof existingTable !== 'object' || Array.isArray(existingTable)) {
    return { ...incomingTable };
  }

  const incomingTs = parseComparableTimestamp(incomingTable.updatedAt ?? incomingTable.clearedAt ?? incomingTable.savedTime);
  const existingTs = parseComparableTimestamp(existingTable.updatedAt ?? existingTable.clearedAt ?? existingTable.savedTime);
  const existingClearedTs = parseComparableTimestamp(existingTable.clearedAt);
  const existingItems = Array.isArray(existingTable.items) ? existingTable.items : [];

  if (isExplicitTableReset(incomingTable)) {
    const isUntimestampedBootSlot = (incomingTs === null && incomingTable.occupied !== false && String(incomingTable.status || '').toLowerCase() !== 'billed');
    if (existingItems.length > 0 && existingTs !== null && (isUntimestampedBootSlot || (incomingTs !== null && incomingTs < existingTs))) {
      return { ...existingTable };
    }
    return {
      ...incomingTable,
      id: incomingTable.id ?? existingTable.id,
      name: incomingTable.name ?? existingTable.name,
      items: [],
      kotPrintedMap: {}
    };
  }

  // Guard: If existing table was explicitly cleared/settled at existingClearedTs, reject stale incoming items with incomingTs === null or incomingTs <= existingClearedTs
  if (isExplicitTableReset(existingTable) && existingClearedTs !== null && (incomingTs === null || incomingTs <= existingClearedTs)) {
    return { ...existingTable };
  }

  if (Array.isArray(incomingTable.items) && incomingTable.items.length > 0) {
    // Last-Edit-Wins (LWW): If existingTable has active items and a strictly newer timestamp than incomingTable, preserve existingTable as base
    const useExistingAsBase = Boolean(existingItems.length > 0 && existingTs !== null && incomingTs !== null && existingTs > incomingTs);
    const baseTable = useExistingAsBase ? existingTable : incomingTable;
    const otherTable = useExistingAsBase ? incomingTable : existingTable;
    const baseItems = useExistingAsBase ? existingItems : incomingTable.items;
    const otherItems = useExistingAsBase ? incomingTable.items : existingItems;

    const existingMap = (existingTable.kotPrintedMap && typeof existingTable.kotPrintedMap === 'object' && !Array.isArray(existingTable.kotPrintedMap))
      ? existingTable.kotPrintedMap
      : {};
    const incomingMap = (incomingTable.kotPrintedMap && typeof incomingTable.kotPrintedMap === 'object' && !Array.isArray(incomingTable.kotPrintedMap))
      ? incomingTable.kotPrintedMap
      : {};

    const combinedLookupMap = { ...existingMap };
    for (const [k, val] of Object.entries(incomingMap)) {
      const nPrev = Number(combinedLookupMap[k] || 0);
      const nInc = Number(val || 0);
      combinedLookupMap[k] = Math.max(Number.isFinite(nPrev) ? nPrev : 0, Number.isFinite(nInc) ? nInc : 0);
    }
    const prunedMap = {};

    const mergedItems = baseItems.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const itemIdStr = (item.id !== undefined && item.id !== null) ? String(item.id) : '';
      const prevItem = otherItems.find((pi) => {
        if (!pi || typeof pi !== 'object') return false;
        if (itemIdStr && pi.id !== undefined && pi.id !== null && String(pi.id) === itemIdStr) return true;
        return Boolean(pi.name && item.name && pi.name === item.name);
      });

      const rawQty = Number(item.qty ?? item.quantity ?? 1);
      const qty = (Number.isFinite(rawQty) && rawQty >= 0) ? rawQty : 1;
      const prevPrinted = Number(prevItem?.qtyKotPrinted || 0);
      const incPrinted = Number(item.qtyKotPrinted || 0);
      const mapById = itemIdStr ? Number(combinedLookupMap[itemIdStr] ?? 0) : 0;
      const mapByName = item.name ? Number(combinedLookupMap[item.name] ?? 0) : 0;
      const maxPrinted = Math.max(
        Number.isFinite(prevPrinted) ? prevPrinted : 0,
        Number.isFinite(incPrinted) ? incPrinted : 0,
        Number.isFinite(mapById) ? mapById : 0,
        Number.isFinite(mapByName) ? mapByName : 0
      );

      if (maxPrinted > 0) {
        const clamped = Math.min(qty, maxPrinted);
        if (itemIdStr) prunedMap[itemIdStr] = Math.max(prunedMap[itemIdStr] || 0, clamped);
        if (item.name) prunedMap[item.name] = Math.max(prunedMap[item.name] || 0, clamped);
        return { ...item, qtyKotPrinted: clamped };
      }
      return { ...item };
    });

    const anyKotPrinted = mergedItems.some(it => Number(it?.qtyKotPrinted || 0) > 0);
    const existingStatus = String(existingTable.status || '').trim().toLowerCase();
    const incomingStatus = String(incomingTable.status || '').trim().toLowerCase();
    let finalStatus = baseTable.status ?? otherTable.status;
    if ((existingStatus === 'kot' || incomingStatus === 'kot') && (!finalStatus || String(finalStatus).toLowerCase() === 'occupied') && anyKotPrinted) {
      finalStatus = 'kot';
    }

    return {
      ...otherTable,
      ...baseTable,
      status: finalStatus,
      items: mergedItems,
      kotPrintedMap: prunedMap
    };
  }

  if (existingItems.length > 0 && existingTs !== null && (incomingTs === null || incomingTs < existingTs)) {
    return { ...existingTable };
  }

  return {
    ...existingTable,
    ...incomingTable
  };
}

/**
 * High-Reliability Native Server Sync directly into Cloud Firestore REST API.
 * Replicates root shop document and operational subcollections (staff, tables).
 */
export async function syncStoreToFirestoreREST(storeCode, payload = {}) {
  const cleanCode = (typeof storeCode === 'string') ? storeCode.trim() : '';
  if (!cleanCode || !/^[A-Za-z0-9_-]{3,64}$/.test(cleanCode)) {
    return { success: false, error: 'Tenant isolation error: valid storeCode required.' };
  }
  const code = cleanCode;
  if (!CONFIG?.firebase?.projectId || !CONFIG?.firebase?.firestoreDatabaseId) {
    return { success: false, error: 'Firebase configuration missing on server' };
  }

  const collection = getStoreCollectionName(code);
  const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  const rootUrl = `${base}/${collection}/${encodeURIComponent(code)}`;
  const timestamp = new Date().toISOString();

  // 1. Prepare Root Document Fields
  const fieldsToPatch = {};
  const resolvedOwnerEmail = (payload.ownerEmail || payload.profile?.ownerEmail || payload.profile?.email || '').trim().toLowerCase();
  if (payload.profile) {
    if (resolvedOwnerEmail && !payload.profile.ownerEmail) {
      payload.profile.ownerEmail = resolvedOwnerEmail;
    }
    fieldsToPatch.profile = payload.profile;
    if (payload.profile.name) {
      fieldsToPatch.name = payload.profile.name;
    }
  }
  if (resolvedOwnerEmail) {
    fieldsToPatch.ownerEmail = resolvedOwnerEmail;
  }

  // Deduplicate deletedStaffId + deletedStaffIds
  const deletedStaffIdSet = new Set();
  if (payload.deletedStaffId !== undefined && payload.deletedStaffId !== null && String(payload.deletedStaffId).trim() !== '') {
    deletedStaffIdSet.add(String(payload.deletedStaffId).trim());
  }
  if (Array.isArray(payload.deletedStaffIds)) {
    for (const rawId of payload.deletedStaffIds) {
      if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
        deletedStaffIdSet.add(String(rawId).trim());
      }
    }
  }
  const deletedIdStr = (payload.deletedStaffId !== undefined && payload.deletedStaffId !== null && String(payload.deletedStaffId).trim() !== '')
    ? String(payload.deletedStaffId).trim()
    : null;

  const hasTablesPayload = Boolean(
    payload.tables &&
    typeof payload.tables === 'object' &&
    !Array.isArray(payload.tables) &&
    Object.keys(payload.tables).length > 0
  );
  const needsStaffMerge = Array.isArray(payload.staff) && payload.staff.length > 0 && !payload.replaceStaff;
  const needsDeletedStaffMerge = deletedStaffIdSet.size > 0 && !Array.isArray(payload.deletedStaffIds);

  // Single optional GET rootUrl fetch for concurrent staff/tables/deletedStaffIds merge
  let existingRootFields = null;
  if (needsStaffMerge || hasTablesPayload || needsDeletedStaffMerge) {
    try {
      const rootCheck = await fetch(rootUrl);
      if (rootCheck && rootCheck.ok && typeof rootCheck.json === 'function') {
        const rootData = await rootCheck.json();
        existingRootFields = (rootData && rootData.fields && typeof rootData.fields === 'object') ? rootData.fields : null;
      }
    } catch (e) {
      existingRootFields = null;
    }
  }

  // Safe Staff Handling: Merge with existing staff if partial sync, or replace/remove when requested
  const cachedStoreForMerge = serverStoreMemoryCache.get(code);
  let finalStaffArray = payload.staff;
  const existingStaffRaw = existingRootFields?.staff?.arrayValue?.values || [];
  const existingStaff = (cachedStoreForMerge?._quotaFallbackActive && Array.isArray(cachedStoreForMerge.staff))
    ? cachedStoreForMerge.staff
    : existingStaffRaw.map(v => firestoreValueToJson(v)).filter(Boolean);

  if (Array.isArray(payload.staff)) {
    if (needsStaffMerge && existingStaff.length > 0) {
      const staffMap = new Map();
      existingStaff.forEach(s => {
        const sid = String(s?.id || s?.staffId || '').trim();
        if (sid && !deletedStaffIdSet.has(sid)) staffMap.set(sid, s);
      });
      payload.staff.forEach(s => {
        const sid = String(s?.id || s?.staffId || '').trim();
        if (sid && !deletedStaffIdSet.has(sid)) staffMap.set(sid, s);
      });
      finalStaffArray = Array.from(staffMap.values());
    } else if (deletedStaffIdSet.size > 0) {
      finalStaffArray = payload.staff.filter(s => {
        const sid = String(s?.id || s?.staffId || '').trim();
        return !sid || !deletedStaffIdSet.has(sid);
      });
    }
    fieldsToPatch.staff = finalStaffArray;
  }

  if (Array.isArray(payload.deletedStaffIds)) {
    fieldsToPatch.deletedStaffIds = Array.from(deletedStaffIdSet);
  } else if (deletedStaffIdSet.size > 0) {
    const existingDeletedStaff = (cachedStoreForMerge?._quotaFallbackActive && Array.isArray(cachedStoreForMerge.deletedStaffIds))
      ? cachedStoreForMerge.deletedStaffIds
      : (existingRootFields?.deletedStaffIds ? firestoreValueToJson(existingRootFields.deletedStaffIds) : []);
    const combinedDeleted = new Set([
      ...(Array.isArray(existingDeletedStaff) ? existingDeletedStaff.map(id => String(id).trim()).filter(Boolean) : []),
      ...deletedStaffIdSet
    ]);
    fieldsToPatch.deletedStaffIds = Array.from(combinedDeleted);
  }

  let resolvedMenuVersion = null;
  if (typeof payload.menuVersion === 'number' || typeof payload.menuVersion === 'string') {
    const v = Number(payload.menuVersion);
    if (Number.isFinite(v) && v >= 0 && String(payload.menuVersion).trim() !== '') {
      resolvedMenuVersion = v;
      fieldsToPatch.menuVersion = v;
    }
  }
  if (Array.isArray(payload.menu)) {
    fieldsToPatch.menu = payload.menu;
  }
  if (Array.isArray(payload.deletedMenuIds)) {
    const activeMenuIds = new Set(
      (Array.isArray(payload.menu) ? payload.menu : [])
        .filter(m => m && !m.isDeleted && m.isAvailable !== false && m.id !== undefined)
        .map(m => String(m.id).trim())
    );
    fieldsToPatch.deletedMenuIds = payload.deletedMenuIds.filter(id => !activeMenuIds.has(String(id).trim()));
  }
  if (Array.isArray(payload.deletedMenuNames)) {
    const activeMenuNames = new Set(
      (Array.isArray(payload.menu) ? payload.menu : [])
        .filter(m => m && !m.isDeleted && m.isAvailable !== false && m.name)
        .map(m => String(m.name).trim().toLowerCase())
    );
    fieldsToPatch.deletedMenuNames = payload.deletedMenuNames.filter(n => !activeMenuNames.has(String(n).trim().toLowerCase()));
  }
  if (Array.isArray(payload.categories)) fieldsToPatch.categories = payload.categories;

  if (payload.menuVersion === undefined && (Array.isArray(payload.menu) || Array.isArray(payload.categories)) && resolvedMenuVersion === null) {
    resolvedMenuVersion = Date.now();
    fieldsToPatch.menuVersion = resolvedMenuVersion;
  }

  let mergedTables = null;
  if (hasTablesPayload) {
    const cachedStore = serverStoreMemoryCache.get(code);
    const existingTablesRaw = (cachedStore?._quotaFallbackActive && cachedStore.tables)
      ? cachedStore.tables
      : (existingRootFields?.tables ? firestoreValueToJson(existingRootFields.tables) : {});
    mergedTables = (existingTablesRaw && typeof existingTablesRaw === 'object' && !Array.isArray(existingTablesRaw))
      ? { ...existingTablesRaw }
      : {};
    for (const [tId, tData] of Object.entries(payload.tables)) {
      if (tData !== undefined && tData !== null) {
        mergedTables[tId] = mergeTableEntry(mergedTables[tId], tData);
      }
    }
    fieldsToPatch.tables = mergedTables;
  } else if (payload.tables && typeof payload.tables === 'object' && !Array.isArray(payload.tables) && payload.replaceTables) {
    fieldsToPatch.tables = {};
  }

  if (Array.isArray(payload.history)) fieldsToPatch.history = payload.history;
  if (Array.isArray(payload.expenses)) fieldsToPatch.expenses = payload.expenses;
  if (Array.isArray(payload.customers)) fieldsToPatch.customers = payload.customers;
  if (Array.isArray(payload.kots)) fieldsToPatch.kots = payload.kots;
  if (payload.subscription) fieldsToPatch.subscription = payload.subscription;
  fieldsToPatch.updatedAt = timestamp;
  fieldsToPatch.storeCode = code;

  // If store had pending unsynced fields from a previous Firestore 429 quota fallback, include them so recovery flushes 100% of cached state
  const currentFieldsKeys = Object.keys(fieldsToPatch);
  if (cachedStoreForMerge?._quotaFallbackActive) {
    const dirtyKeys = ['ownerEmail', 'profile', 'name', 'staff', 'deletedStaffIds', 'menu', 'deletedMenuIds', 'deletedMenuNames', 'menuVersion', 'categories', 'tables', 'history', 'expenses', 'customers', 'kots', 'subscription'];
    for (const dk of dirtyKeys) {
      if (fieldsToPatch[dk] === undefined && cachedStoreForMerge[dk] !== undefined) {
        fieldsToPatch[dk] = cachedStoreForMerge[dk];
      }
    }
  }

  // Build field paths for updateMask
  const updateMaskParams = Object.keys(fieldsToPatch)
    .map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const patchUrl = `${rootUrl}?${updateMaskParams}`;

  let rootPatchError = null;
  let rootPatchStatus = null;
  try {
    const rootRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: jsonToFirestoreFields(fieldsToPatch) })
    });

    if (!rootRes || !rootRes.ok) {
      const errText = (rootRes && typeof rootRes.text === 'function') ? await rootRes.text().catch(() => '') : '';
      rootPatchStatus = rootRes?.status || 502;
      rootPatchError = errText || `Root doc patch failed (${rootPatchStatus})`;
      console.warn(`[SYNC REST] Root doc patch failed (${rootPatchStatus}):`, errText);
    }
  } catch (err) {
    rootPatchStatus = 502;
    rootPatchError = err?.message || 'Root doc fetch error';
    console.warn('[SYNC REST] Root doc fetch error:', rootPatchError);
  }

  if (rootPatchError) {
    if (rootPatchStatus === 429) {
      // Firestore free-tier daily write quota exhausted: persist authoritative LWW state in server cache & disk
      const prevCached = serverStoreMemoryCache.get(code) || {};
      serverStoreMemoryCache.set(code, {
        ...prevCached,
        ...fieldsToPatch,
        _quotaFallbackActive: true
      });
      saveServerStoreCacheToDisk();
      return {
        success: true,
        quotaFallback: true,
        storeCode: code,
        syncedFields: currentFieldsKeys,
        staffCount: Array.isArray(finalStaffArray) ? finalStaffArray.length : 0,
        deletedStaffId: deletedIdStr || undefined,
        deletedStaffIds: deletedStaffIdSet.size > 0 ? Array.from(deletedStaffIdSet) : undefined,
        tableCount: hasTablesPayload ? Object.keys(payload.tables).length : undefined
      };
    }
    return {
      success: false,
      status: rootPatchStatus,
      error: rootPatchError,
      storeCode: code
    };
  }

  // Root write succeeded on Firestore: keep server cache synchronized and mark quotaFallback false
  serverStoreMemoryCache.set(code, {
    ...(serverStoreMemoryCache.get(code) || {}),
    ...fieldsToPatch,
    _quotaFallbackActive: false
  });
  saveServerStoreCacheToDisk();

  // 2. Sync Staff Subcollection (/{collection}/{storeCode}/staff/{staffId})
  if (deletedStaffIdSet.size > 0) {
    const existingStaffIds = new Set(
      existingStaff.map(s => String(s?.id || s?.staffId || '').trim()).filter(Boolean)
    );
    let idsToDelete = [];
    if (deletedStaffIdSet.size <= 10) {
      idsToDelete = Array.from(deletedStaffIdSet);
    } else {
      const bounded = new Set();
      if (deletedIdStr) bounded.add(deletedIdStr);
      for (const id of deletedStaffIdSet) {
        if (existingStaffIds.has(id)) bounded.add(id);
      }
      // Also include the most recent 10 entries in case existingStaff wasn't fetched (e.g. replaceStaff: true)
      const recentSlice = Array.from(deletedStaffIdSet).slice(-10);
      for (const id of recentSlice) bounded.add(id);
      idsToDelete = Array.from(bounded);
    }

    const deletePromises = idsToDelete.map(async (delId) => {
      const delUrl = `${base}/${collection}/${encodeURIComponent(code)}/staff/${encodeURIComponent(delId)}`;
      await fetch(delUrl, { method: 'DELETE' }).catch(() => null);
      const revokeSessionUrl = `${base}/${collection}/${encodeURIComponent(code)}/staffSessions/${encodeURIComponent(delId)}`;
      await fetch(revokeSessionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: jsonToFirestoreFields({
            staffId: delId,
            status: 'REVOKED',
            isLocked: true,
            revokedAt: timestamp,
            revokedReason: 'Staff profile removed by Admin'
          })
        })
      }).catch(() => null);
    });
    await Promise.allSettled(deletePromises);
  }

  const staffToSubdoc = Array.isArray(finalStaffArray) ? finalStaffArray : (Array.isArray(payload.staff) ? payload.staff : []);
  const staffPromises = staffToSubdoc.map(async (s) => {
    if (s && (s.id || s.staffId)) {
      const sId = String(s.id || s.staffId).trim();
      if (!sId || deletedStaffIdSet.has(sId)) return;
      const subdocUrl = `${base}/${collection}/${encodeURIComponent(code)}/staff/${encodeURIComponent(sId)}`;
      try {
        await fetch(subdocUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: jsonToFirestoreFields({ ...s, updatedAt: timestamp }) })
        }).catch(() => null);
      } catch (e) {}
    }
  });
  await Promise.allSettled(staffPromises);

  // 3. Sync Tables Subcollection (/{collection}/{storeCode}/tables/{tableId})
  if (hasTablesPayload) {
    const tablePromises = Object.entries(payload.tables).map(async ([tId, tData]) => {
      if (tData !== undefined && tData !== null) {
        const mergedTData = (mergedTables && mergedTables[tId] !== undefined) ? mergedTables[tId] : tData;
        const tableDocUrl = `${base}/${collection}/${encodeURIComponent(code)}/tables/${encodeURIComponent(tId)}`;
        try {
          const itemPayload = (typeof mergedTData === 'object')
            ? { id: String(tId), ...mergedTData, updatedAt: timestamp }
            : { id: String(tId), status: mergedTData, updatedAt: timestamp };
          await fetch(tableDocUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: jsonToFirestoreFields(itemPayload) })
          }).catch(() => null);
        } catch (e) {}
      }
    });
    await Promise.allSettled(tablePromises);
  }

  // 4. Sync Menu Metadata Subcollection (/{collection}/{storeCode}/menu_meta/version)
  // Ensures all connected peer devices listening on menu_meta/version receive instant version bump
  if (resolvedMenuVersion !== null || Array.isArray(payload.menu) || Array.isArray(payload.categories)) {
    const metaDocUrl = `${base}/${collection}/${encodeURIComponent(code)}/menu_meta/version`;
    const finalVer = resolvedMenuVersion !== null ? resolvedMenuVersion : Date.now();
    const metaFields = {
      version: finalVer,
      menuVersion: finalVer,
      updatedAt: timestamp,
      updatedBy: payload.profile?.name || payload.updatedBy || 'Admin'
    };
    if (Array.isArray(fieldsToPatch.menu) || Array.isArray(payload.menu)) {
      metaFields.itemCount = Array.isArray(fieldsToPatch.menu) ? fieldsToPatch.menu.length : payload.menu.length;
    }
    try {
      await fetch(metaDocUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: jsonToFirestoreFields(metaFields) })
      }).catch((err) => {
        console.warn('[SYNC REST] menu_meta patch notice:', err?.message || err);
      });
    } catch (e) {}
  }

  return {
    success: true,
    storeCode: code,
    syncedFields: Object.keys(fieldsToPatch),
    staffCount: staffToSubdoc.length,
    deletedStaffId: deletedIdStr || undefined,
    deletedStaffIds: deletedStaffIdSet.size > 0 ? Array.from(deletedStaffIdSet) : undefined,
    tableCount: hasTablesPayload ? Object.keys(payload.tables).length : undefined
  };
}

export async function deleteStaffFromFirestoreREST(storeCode, staffId, remainingStaff = null) {
  const cleanCode = (typeof storeCode === 'string') ? storeCode.trim() : '';
  if (!cleanCode || !/^[A-Za-z0-9_-]{3,64}$/.test(cleanCode)) {
    return { success: false, error: 'Tenant isolation error: valid storeCode required.' };
  }
  const code = cleanCode;
  const sId = String(staffId || '').trim();
  if (!sId) return { success: false, error: 'staffId is required' };
  let staffList = remainingStaff;
  if (!Array.isArray(staffList)) {
    const existing = await getStoreFromFirestoreREST(code);
    if (existing && Array.isArray(existing.staff)) {
      staffList = existing.staff.filter(s => String(s?.id || s?.staffId || '') !== sId);
    } else {
      staffList = [];
    }
  }
  return await syncStoreToFirestoreREST(code, {
    staff: staffList,
    replaceStaff: true,
    deletedStaffId: sId
  });
}

export async function getStoreFromFirestoreREST(storeCode) {
  const cleanCode = (typeof storeCode === 'string') ? storeCode.trim() : '';
  if (!cleanCode || !/^[A-Za-z0-9_-]{3,64}$/.test(cleanCode)) {
    return { success: false, error: 'Tenant isolation error: valid storeCode required.' };
  }
  const code = cleanCode;
  if (!CONFIG?.firebase?.projectId || !CONFIG?.firebase?.firestoreDatabaseId) {
    return { success: false, error: 'Firebase configuration missing on server' };
  }

  const collection = getStoreCollectionName(code);
  const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  const rootUrl = `${base}/${collection}/${encodeURIComponent(code)}`;

  try {
    const cached = serverStoreMemoryCache.get(code);
    const res = await fetch(rootUrl);
    if (!res.ok) {
      if (cached && cached._quotaFallbackActive) {
        return {
          success: true,
          storeCode: code,
          ownerEmail: cached.ownerEmail || cached.profile?.ownerEmail || null,
          profile: cached.profile || null,
          staff: cached.staff || [],
          deletedStaffIds: cached.deletedStaffIds || [],
          menu: cached.menu || [],
          deletedMenuIds: cached.deletedMenuIds || [],
          deletedMenuNames: cached.deletedMenuNames || [],
          menuVersion: cached.menuVersion || 0,
          categories: cached.categories || [],
          tables: cached.tables || {},
          history: cached.history || [],
          expenses: cached.expenses || [],
          customers: cached.customers || [],
          kots: cached.kots || [],
          subscription: cached.subscription || null,
          updatedAt: cached.updatedAt || new Date().toISOString()
        };
      }
      return { success: false, status: res.status, error: await res.text() };
    }
    const rawDoc = await res.json();
    const fields = rawDoc.fields || {};
    const profileObj = fields.profile ? firestoreValueToJson(fields.profile) : null;
    const ownerEmail = (fields.ownerEmail ? firestoreValueToJson(fields.ownerEmail) : null) || profileObj?.ownerEmail || profileObj?.email || null;
    const baseResult = {
      success: true,
      storeCode: code,
      ownerEmail,
      profile: profileObj,
      staff: fields.staff ? firestoreValueToJson(fields.staff) : [],
      deletedStaffIds: fields.deletedStaffIds ? firestoreValueToJson(fields.deletedStaffIds) : [],
      menu: fields.menu ? firestoreValueToJson(fields.menu) : [],
      deletedMenuIds: fields.deletedMenuIds ? firestoreValueToJson(fields.deletedMenuIds) : [],
      deletedMenuNames: fields.deletedMenuNames ? firestoreValueToJson(fields.deletedMenuNames) : [],
      menuVersion: fields.menuVersion ? firestoreValueToJson(fields.menuVersion) : 0,
      categories: fields.categories ? firestoreValueToJson(fields.categories) : [],
      tables: fields.tables ? firestoreValueToJson(fields.tables) : {},
      history: fields.history ? firestoreValueToJson(fields.history) : [],
      expenses: fields.expenses ? firestoreValueToJson(fields.expenses) : [],
      customers: fields.customers ? firestoreValueToJson(fields.customers) : [],
      kots: fields.kots ? firestoreValueToJson(fields.kots) : [],
      subscription: fields.subscription ? firestoreValueToJson(fields.subscription) : null,
      updatedAt: fields.updatedAt ? firestoreValueToJson(fields.updatedAt) : rawDoc.updateTime
    };
    if (cached && cached._quotaFallbackActive) {
      return {
        ...baseResult,
        ownerEmail: cached.ownerEmail ?? baseResult.ownerEmail,
        profile: cached.profile ? { ...(baseResult.profile || {}), ...cached.profile } : baseResult.profile,
        staff: Array.isArray(cached.staff) ? cached.staff : baseResult.staff,
        deletedStaffIds: Array.isArray(cached.deletedStaffIds) ? cached.deletedStaffIds : baseResult.deletedStaffIds,
        menu: Array.isArray(cached.menu) ? cached.menu : baseResult.menu,
        deletedMenuIds: Array.isArray(cached.deletedMenuIds) ? cached.deletedMenuIds : baseResult.deletedMenuIds,
        deletedMenuNames: Array.isArray(cached.deletedMenuNames) ? cached.deletedMenuNames : baseResult.deletedMenuNames,
        menuVersion: Math.max(Number(cached.menuVersion || 0), Number(baseResult.menuVersion || 0)),
        categories: Array.isArray(cached.categories) ? cached.categories : baseResult.categories,
        tables: cached.tables ? { ...(baseResult.tables || {}), ...cached.tables } : baseResult.tables,
        history: Array.isArray(cached.history) ? cached.history : baseResult.history,
        expenses: Array.isArray(cached.expenses) ? cached.expenses : baseResult.expenses,
        customers: Array.isArray(cached.customers) ? cached.customers : baseResult.customers,
        kots: Array.isArray(cached.kots) ? cached.kots : baseResult.kots,
        updatedAt: cached.updatedAt || baseResult.updatedAt
      };
    }
    return baseResult;
  } catch (err) {
    const cached = serverStoreMemoryCache.get(code);
    if (cached && cached._quotaFallbackActive) {
      return {
        success: true,
        storeCode: code,
        ownerEmail: cached.ownerEmail || cached.profile?.ownerEmail || null,
        profile: cached.profile || null,
        staff: cached.staff || [],
        deletedStaffIds: cached.deletedStaffIds || [],
        menu: cached.menu || [],
        deletedMenuIds: cached.deletedMenuIds || [],
        deletedMenuNames: cached.deletedMenuNames || [],
        menuVersion: cached.menuVersion || 0,
        categories: cached.categories || [],
        tables: cached.tables || {},
        history: cached.history || [],
        expenses: cached.expenses || [],
        customers: cached.customers || [],
        kots: cached.kots || [],
        subscription: cached.subscription || null,
        updatedAt: cached.updatedAt || new Date().toISOString()
      };
    }
    return { success: false, error: err.message };
  }
}
