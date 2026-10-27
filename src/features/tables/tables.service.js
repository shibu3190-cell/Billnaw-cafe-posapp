/**
 * src/features/tables/tables.service.js
 * Real-Time Table Management Service for Billnaw Cafe POS.
 * Enforces the strict 6-stage cafe table lifecycle:
 * AVAILABLE -> OCCUPIED_DRAFT -> KOT_SENT -> SERVED -> BILLED -> PAID_CLOSED -> AVAILABLE
 */

import { safeExecute, successResult } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';

export const TABLE_STATES = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED_DRAFT: 'OCCUPIED_DRAFT',
  KOT_SENT: 'KOT_SENT',
  SERVED: 'SERVED',
  BILLED: 'BILLED',
  PAID_CLOSED: 'PAID_CLOSED'
};

const VALID_TRANSITIONS = {
  AVAILABLE: ['OCCUPIED_DRAFT', 'KOT_SENT'],
  OCCUPIED_DRAFT: ['KOT_SENT', 'AVAILABLE'],
  KOT_SENT: ['SERVED', 'BILLED', 'AVAILABLE'],
  SERVED: ['BILLED', 'KOT_SENT', 'AVAILABLE'],
  BILLED: ['PAID_CLOSED', 'AVAILABLE'],
  PAID_CLOSED: ['AVAILABLE']
};

/**
 * Fetch all cafe tables.
 * @returns {Promise<{ data: Array<Object>, error: string|null, offlineQueued: boolean }>}
 */
export async function getTables() {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.collection(`cafes/${cafeId}/tables`).get();
    
    const defaults = getDefaultTables();
    if (snap.empty) {
      return defaults;
    }

    const storedMap = new Map();
    snap.forEach(doc => storedMap.set(doc.id, doc.data()));

    const merged = defaults.map(t => {
      const stored = storedMap.get(t.id);
      return stored ? { ...t, ...stored } : t;
    });

    for (const [id, data] of storedMap.entries()) {
      if (!defaults.some(t => t.id === id)) {
        merged.push({ id, ...data });
      }
    }

    return merged.sort((a, b) => (a.number || 0) - (b.number || 0));
  });
}

/**
 * Occupy a table (Guest seating).
 * @param {string} tableId 
 * @param {number} [guestsCount=2] 
 * @param {string} [serverStaffId=''] 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function occupyTable(tableId, guestsCount = 2, serverStaffId = '') {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const tableRef = db.doc(`cafes/${cafeId}/tables/${tableId}`);

    const updatePayload = {
      status: TABLE_STATES.OCCUPIED_DRAFT,
      guests_count: Number(guestsCount) || 2,
      server_staff_id: serverStaffId,
      occupied_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await tableRef.update(updatePayload);
    return { id: tableId, ...updatePayload };
  });
}

/**
 * Transition Table Status with State Machine Validation.
 * @param {string} tableId 
 * @param {string} newStatus 
 * @param {Object} [extraData={}] 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function updateTableStatus(tableId, newStatus, extraData = {}) {
  return safeExecute(async () => {
    if (!TABLE_STATES[newStatus]) {
      throw new Error(`Invalid table status: ${newStatus}`);
    }

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const tableRef = db.doc(`cafes/${cafeId}/tables/${tableId}`);

    const existingSnap = await tableRef.get();
    const currentStatus = existingSnap.exists ? existingSnap.data().status : TABLE_STATES.AVAILABLE;

    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus) && newStatus !== TABLE_STATES.AVAILABLE) {
      throw new Error(`Invalid transition from ${currentStatus} to ${newStatus}`);
    }

    const updatePayload = {
      status: newStatus,
      ...extraData,
      updated_at: new Date().toISOString()
    };

    await tableRef.update(updatePayload);
    return { id: tableId, ...updatePayload };
  });
}

/**
 * Reset Table back to AVAILABLE.
 * @param {string} tableId 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function resetTable(tableId) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const tableRef = db.doc(`cafes/${cafeId}/tables/${tableId}`);

    const resetPayload = {
      status: TABLE_STATES.AVAILABLE,
      guests_count: 0,
      active_bill_id: null,
      active_kot_ids: [],
      server_staff_id: null,
      occupied_at: null,
      updated_at: new Date().toISOString()
    };

    await tableRef.update(resetPayload);
    return { id: tableId, ...resetPayload };
  });
}

/**
 * Atomically switch guest order from one table to another.
 * @param {string} fromTableId 
 * @param {string} toTableId 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function switchTable(fromTableId, toTableId) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const batch = db.createBatch();

    const fromRef = db.doc(`cafes/${cafeId}/tables/${fromTableId}`);
    const toRef = db.doc(`cafes/${cafeId}/tables/${toTableId}`);

    const fromSnap = await fromRef.get();
    if (!fromSnap.exists) throw new Error(`Source table ${fromTableId} does not exist.`);
    const fromData = fromSnap.data();

    // Source reset
    batch.update(fromRef, {
      status: TABLE_STATES.AVAILABLE,
      guests_count: 0,
      active_bill_id: null,
      active_kot_ids: [],
      occupied_at: null,
      updated_at: new Date().toISOString()
    });

    // Destination update
    batch.update(toRef, {
      status: fromData.status,
      guests_count: fromData.guests_count,
      active_bill_id: fromData.active_bill_id,
      active_kot_ids: fromData.active_kot_ids || [],
      occupied_at: fromData.occupied_at,
      server_staff_id: fromData.server_staff_id,
      updated_at: new Date().toISOString()
    });

    await batch.commit();
    return { fromTableId, toTableId, status: fromData.status };
  });
}

function getDefaultTables() {
  return [
    { id: 'T1', number: 1, name: 'Table 1', capacity: 2, status: 'AVAILABLE' },
    { id: 'T2', number: 2, name: 'Table 2', capacity: 4, status: 'AVAILABLE' },
    { id: 'T3', number: 3, name: 'Table 3', capacity: 4, status: 'AVAILABLE' },
    { id: 'T4', number: 4, name: 'Table 4', capacity: 6, status: 'AVAILABLE' },
    { id: 'T5', number: 5, name: 'Table 5', capacity: 2, status: 'AVAILABLE' },
    { id: 'T6', number: 6, name: 'Table 6', capacity: 8, status: 'AVAILABLE' },
    { id: 'T7', number: 7, name: 'Table 7', capacity: 4, status: 'AVAILABLE' },
    { id: 'T8', number: 8, name: 'Table 8', capacity: 4, status: 'AVAILABLE' }
  ];
}
