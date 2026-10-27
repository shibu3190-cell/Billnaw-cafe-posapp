/**
 * src/features/kot/kot.service.js
 * Kitchen Order Ticket (KOT) Management Service for Billnaw Cafe POS.
 * Handles ticket dispatch, kitchen routing, preparation tracking, and audited cancellation.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId, getTerminalId } from '../../core/config.js';

let localKotCounter = 1;

/**
 * Generate a sequential KOT identifier.
 * Format: KOT-YYMMDD-XXXX
 */
export function generateKotNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const seq = String(localKotCounter++).padStart(4, '0');
  return `KOT-${yy}${mm}${dd}-${seq}`;
}

/**
 * Create and dispatch a new Kitchen Order Ticket.
 * @param {Object} kotData
 * @param {string} kotData.table_id
 * @param {Array<{ name: string, quantity: number, notes?: string, station?: string }>} kotData.items
 * @param {string} [kotData.server_staff_id='']
 * @param {string} [kotData.order_type='DINE_IN']
 * @param {string} [kotData.special_instructions='']
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function createKOT(kotData) {
  return safeExecute(async () => {
    if (!kotData.items || kotData.items.length === 0) {
      throw new Error('KOT requires at least one kitchen line item.');
    }

    const cafeId = getTenantCafeId();
    const terminalId = getTerminalId();
    const db = getDbClient();
    const kotId = generateKotNumber();
    const now = new Date().toISOString();

    const kotDoc = {
      kot_id: kotId,
      cafe_id: cafeId,
      terminal_id: terminalId,
      table_id: kotData.table_id || 'TAKEAWAY',
      order_type: kotData.order_type || 'DINE_IN',
      server_staff_id: kotData.server_staff_id || 'staff',
      status: 'PENDING', // PENDING, PREPARING, READY, SERVED, CANCELLED
      items: kotData.items.map(it => ({
        name: it.name,
        quantity: Math.max(1, parseInt(it.quantity || 1, 10)),
        notes: it.notes || '',
        station: it.station || 'KITCHEN'
      })),
      special_instructions: kotData.special_instructions || '',
      created_at: now,
      updated_at: now
    };

    const batch = db.createBatch();

    // 1. Save KOT document
    const kotRef = db.doc(`cafes/${cafeId}/kots/${kotId}`);
    batch.set(kotRef, kotDoc);

    // 2. If table order, link KOT to table and transition status to KOT_SENT
    if (kotData.table_id && kotData.table_id !== 'TAKEAWAY') {
      const tableRef = db.doc(`cafes/${cafeId}/tables/${kotData.table_id}`);
      batch.update(tableRef, {
        status: 'KOT_SENT',
        active_kot_ids: db.arrayUnion ? db.arrayUnion(kotId) : [kotId],
        updated_at: now
      });
    }

    await batch.commit();
    return kotDoc;
  });
}

/**
 * Update KOT Status (Kitchen Display Station).
 * @param {string} kotId 
 * @param {'PREPARING'|'READY'|'SERVED'} newStatus 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function updateKotStatus(kotId, newStatus) {
  return safeExecute(async () => {
    const valid = ['PREPARING', 'READY', 'SERVED'];
    if (!valid.includes(newStatus)) {
      throw new Error(`Invalid KOT status: ${newStatus}`);
    }

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const kotRef = db.doc(`cafes/${cafeId}/kots/${kotId}`);

    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    await kotRef.update(updateData);
    return { kot_id: kotId, ...updateData };
  });
}

/**
 * Cancel KOT with Mandatory Audit Trail.
 * @param {string} kotId 
 * @param {string} reason 
 * @param {string} staffId 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function cancelKOT(kotId, reason, staffId) {
  return safeExecute(async () => {
    if (!reason || reason.trim().length < 3) {
      throw new Error('Mandatory cancellation reason required (min 3 chars).');
    }
    if (!staffId) {
      throw new Error('Authorizing staff ID required for KOT cancellation.');
    }

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const kotRef = db.doc(`cafes/${cafeId}/kots/${kotId}`);

    const cancelData = {
      status: 'CANCELLED',
      cancellation_reason: reason.trim(),
      cancelled_by_staff_id: staffId,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await kotRef.update(cancelData);
    return { kot_id: kotId, ...cancelData };
  });
}

/**
 * Generate thermal KOT slip payload for physical printer dispatch.
 * @param {Object} kot 
 * @returns {{ textContent: string, escPosBytes: Uint8Array }}
 */
export function generateKotSlipPayload(kot) {
  const divider = '==========================================\n';
  let txt = '';
  txt += `\x1B\x61\x01`; // Center
  txt += `\x1B\x45\x01** KITCHEN ORDER TICKET **\x1B\x45\x00\n`;
  txt += `TABLE: ${kot.table_id}\n`;
  txt += `TICKET #: ${kot.kot_id}\n`;
  txt += `TIME: ${new Date(kot.created_at || Date.now()).toLocaleTimeString('en-IN')}\n`;
  txt += divider;
  txt += `\x1B\x61\x00`; // Left
  txt += `ITEM                           QTY\n`;
  txt += divider;

  for (const it of (kot.items || [])) {
    const name = (it.name || 'Item').padEnd(28).slice(0, 28);
    const qty = String(it.quantity).padStart(4);
    txt += `\x1B\x45\x01${name} ${qty}\x1B\x45\x00\n`;
    if (it.notes) {
      txt += `   >> Note: ${it.notes}\n`;
    }
  }

  txt += divider;
  if (kot.special_instructions) {
    txt += `INSTRUCTIONS: ${kot.special_instructions}\n`;
    txt += divider;
  }
  txt += `Server: ${kot.server_staff_id || 'Staff'}\n\n\n\x1D\x56\x41\x03`; // Cut

  const encoder = new TextEncoder();
  return {
    textContent: txt,
    escPosBytes: encoder.encode(txt)
  };
}
