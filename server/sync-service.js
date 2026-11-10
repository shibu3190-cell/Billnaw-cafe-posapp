// server/sync-service.js - Backend Shop Mapping, Cloud Sync, Backup, and Diagnostics
// Manages shop data integrity, verification, cloud configuration, and state mapping.

import { CONFIG } from './config.js';

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

  // Safe Staff Handling: Merge with existing staff if partial sync, or replace/remove when requested
  let finalStaffArray = payload.staff;
  const deletedIdStr = payload.deletedStaffId ? String(payload.deletedStaffId) : null;
  if (Array.isArray(payload.staff)) {
    if (payload.staff.length > 0 && !payload.replaceStaff) {
      try {
        const rootCheck = await fetch(rootUrl);
        if (rootCheck.ok) {
          const rootData = await rootCheck.json();
          const existingStaffRaw = rootData.fields?.staff?.arrayValue?.values || [];
          const existingStaff = existingStaffRaw.map(v => firestoreValueToJson(v)).filter(Boolean);
          if (existingStaff.length > 0) {
            const staffMap = new Map();
            existingStaff.forEach(s => {
              const sid = String(s.id || s.staffId || '');
              if (sid && sid !== deletedIdStr) staffMap.set(sid, s);
            });
            payload.staff.forEach(s => {
              const sid = String(s.id || s.staffId || '');
              if (sid && sid !== deletedIdStr) staffMap.set(sid, s);
            });
            finalStaffArray = Array.from(staffMap.values());
          }
        }
      } catch (e) {
        // Fallback to payload.staff
      }
    } else if (deletedIdStr) {
      finalStaffArray = payload.staff.filter(s => String(s?.id || s?.staffId || '') !== deletedIdStr);
    }
    fieldsToPatch.staff = finalStaffArray;
  }

  if (Array.isArray(payload.menu)) fieldsToPatch.menu = payload.menu;
  if (Array.isArray(payload.categories)) fieldsToPatch.categories = payload.categories;
  if (payload.tables && typeof payload.tables === 'object') fieldsToPatch.tables = payload.tables;
  if (Array.isArray(payload.history)) fieldsToPatch.history = payload.history;
  if (Array.isArray(payload.expenses)) fieldsToPatch.expenses = payload.expenses;
  if (Array.isArray(payload.customers)) fieldsToPatch.customers = payload.customers;
  if (Array.isArray(payload.kots)) fieldsToPatch.kots = payload.kots;
  if (payload.subscription) fieldsToPatch.subscription = payload.subscription;
  fieldsToPatch.updatedAt = timestamp;
  fieldsToPatch.storeCode = code;

  // Build field paths for updateMask
  const updateMaskParams = Object.keys(fieldsToPatch)
    .map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const patchUrl = `${rootUrl}?${updateMaskParams}`;

  try {
    const rootRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: jsonToFirestoreFields(fieldsToPatch) })
    });

    if (!rootRes.ok) {
      const errText = await rootRes.text();
      console.warn(`[SYNC REST] Root doc patch warning (${rootRes.status}):`, errText);
    }
  } catch (err) {
    console.warn('[SYNC REST] Root doc fetch error:', err.message);
  }

  // 2. Sync Staff Subcollection (/{collection}/{storeCode}/staff/{staffId})
  if (deletedIdStr) {
    const delUrl = `${base}/${collection}/${encodeURIComponent(code)}/staff/${encodeURIComponent(deletedIdStr)}`;
    await fetch(delUrl, { method: 'DELETE' }).catch(() => null);
    const revokeSessionUrl = `${base}/${collection}/${encodeURIComponent(code)}/staffSessions/${encodeURIComponent(deletedIdStr)}`;
    await fetch(revokeSessionUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: jsonToFirestoreFields({
          staffId: deletedIdStr,
          status: 'REVOKED',
          isLocked: true,
          revokedAt: timestamp,
          revokedReason: 'Staff profile removed by Admin'
        })
      })
    }).catch(() => null);
  }

  const staffToSubdoc = Array.isArray(finalStaffArray) ? finalStaffArray : (Array.isArray(payload.staff) ? payload.staff : []);
  const staffPromises = staffToSubdoc.map(async (s) => {
    if (s && (s.id || s.staffId)) {
      const sId = String(s.id || s.staffId);
      if (sId === deletedIdStr) return;
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
  if (payload.tables && typeof payload.tables === 'object') {
    const tablePromises = Object.entries(payload.tables).map(async ([tId, tData]) => {
      if (tData) {
        const tableDocUrl = `${base}/${collection}/${encodeURIComponent(code)}/tables/${encodeURIComponent(tId)}`;
        try {
          const itemPayload = (typeof tData === 'object') ? { id: String(tId), ...tData, updatedAt: timestamp } : { id: String(tId), status: tData, updatedAt: timestamp };
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

  return {
    success: true,
    storeCode: code,
    syncedFields: Object.keys(fieldsToPatch),
    staffCount: staffToSubdoc.length,
    deletedStaffId: deletedIdStr || undefined,
    tableCount: (payload.tables && typeof payload.tables === 'object') ? Object.keys(payload.tables).length : undefined
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
    const res = await fetch(rootUrl);
    if (!res.ok) {
      return { success: false, status: res.status, error: await res.text() };
    }
    const rawDoc = await res.json();
    const fields = rawDoc.fields || {};
    const profileObj = fields.profile ? firestoreValueToJson(fields.profile) : null;
    const ownerEmail = (fields.ownerEmail ? firestoreValueToJson(fields.ownerEmail) : null) || profileObj?.ownerEmail || profileObj?.email || null;
    return {
      success: true,
      storeCode: code,
      ownerEmail,
      profile: profileObj,
      staff: fields.staff ? firestoreValueToJson(fields.staff) : [],
      menu: fields.menu ? firestoreValueToJson(fields.menu) : [],
      categories: fields.categories ? firestoreValueToJson(fields.categories) : [],
      tables: fields.tables ? firestoreValueToJson(fields.tables) : {},
      history: fields.history ? firestoreValueToJson(fields.history) : [],
      expenses: fields.expenses ? firestoreValueToJson(fields.expenses) : [],
      customers: fields.customers ? firestoreValueToJson(fields.customers) : [],
      kots: fields.kots ? firestoreValueToJson(fields.kots) : [],
      subscription: fields.subscription ? firestoreValueToJson(fields.subscription) : null,
      updatedAt: fields.updatedAt ? firestoreValueToJson(fields.updatedAt) : rawDoc.updateTime
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
