/**
 * src/core/config.js
 * Centralized Configuration & Multi-Tenant Context Manager for Billnaw Cafe POS.
 */

function safeStorageGet(key, defaultVal) {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key) || defaultVal;
  }
  return defaultVal;
}

function safeStorageSet(key, val) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, val);
  }
}

// Global state container for active tenant context
const activeContext = {
  cafeId: safeStorageGet('billnaw_store_code', 'cafe_billnaw_kolkata_01'),
  terminalId: safeStorageGet('billnaw_terminal_id', 'T1'),
  activeStaffId: safeStorageGet('billnaw_last_staff_id', 'stf_admin_01'),
  activeStaffName: 'Admin',
  activeStaffRole: 'ADMIN'
};

/**
 * Returns current tenant identifier (cafe_id).
 * @returns {string}
 */
export function getActiveCafeId() {
  return activeContext.cafeId;
}

/**
 * Updates active tenant context.
 * @param {string} cafeId
 */
export function setActiveCafeId(cafeId) {
  if (cafeId && typeof cafeId === 'string') {
    activeContext.cafeId = cafeId.trim();
    safeStorageSet('billnaw_store_code', activeContext.cafeId);
  }
}

/**
 * Returns terminal identifier (e.g. 'T1', 'T2').
 * @returns {string}
 */
export function getActiveTerminalId() {
  return activeContext.terminalId;
}

/**
 * Sets terminal identifier.
 * @param {string} terminalId
 */
export function setActiveTerminalId(terminalId) {
  if (terminalId && typeof terminalId === 'string') {
    activeContext.terminalId = terminalId.trim().toUpperCase();
    safeStorageSet('billnaw_terminal_id', activeContext.terminalId);
  }
}

/**
 * Retrieves runtime Firebase client configuration.
 * Fetches from /api/config/client or falls back to public client configuration.
 * @returns {Promise<Object>}
 */
export async function getFirebaseClientConfig() {
  const fallback = {
    apiKey: "AIzaSyCha9cL9MOmOZjweNd9ZXCX9V5sDh-RlAU",
    authDomain: "abhi-pro-cafe-pos.firebaseapp.com",
    projectId: "abhi-pro-cafe-pos",
    storageBucket: "abhi-pro-cafe-pos.firebasestorage.app",
    messagingSenderId: "323985422709",
    appId: "1:323985422709:web:700b77f1a0ff4dc723bb3c",
    firestoreDatabaseId: "ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda"
  };

  try {
    if (typeof fetch === 'function') {
      const res = await fetch('/api/config/client');
      if (res.ok) {
        const remote = await res.json();
        return {
          apiKey: remote.apiKey || fallback.apiKey,
          authDomain: remote.authDomain || fallback.authDomain,
          projectId: remote.projectId || fallback.projectId,
          storageBucket: remote.storageBucket || fallback.storageBucket,
          messagingSenderId: remote.messagingSenderId || fallback.messagingSenderId,
          appId: remote.appId || fallback.appId,
          firestoreDatabaseId: remote.firestoreDatabaseId || fallback.firestoreDatabaseId
        };
      }
    }
  } catch (e) {
    // Silent offline fallback
  }

  return fallback;
}

export const APP_CONSTANTS = {
  APP_NAME: 'Billnaw POS',
  VERSION: '2.0.0-saas',
  DEFAULT_GST_RATE: 5,
  MAX_TABLES: 60,
  UNPAID_ALERT_MINUTES: 15,
  DEFAULT_INVOICE_START_NO: 1001,
  SYNC_INTERVAL_MS: 30000
};
