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

    // Persist to local storage for instant KDS display & offline resilience (Retain 24hr in DB)
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('billnaw_active_kots');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(kotDoc);
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        const retained = list.filter(k => new Date(k.created_at || 0).getTime() >= cutoff);
        localStorage.setItem('billnaw_active_kots', JSON.stringify(retained.slice(0, 200)));
      } catch (e) {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('billnaw:kot-created', { detail: { kot: kotDoc } }));
      if (typeof window.playKdsAudioChime === 'function') {
        window.playKdsAudioChime();
      }
    }

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

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('billnaw_active_kots');
        const list = raw ? JSON.parse(raw) : [];
        const item = list.find(k => k.kot_id === kotId);
        if (item) {
          item.status = newStatus;
          item.updated_at = updateData.updated_at;
          localStorage.setItem('billnaw_active_kots', JSON.stringify(list));
        }
      } catch (e) {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('billnaw:kot-status-changed', { detail: { kotId, status: newStatus } }));
    }

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

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('billnaw_active_kots');
        const list = raw ? JSON.parse(raw) : [];
        const item = list.find(k => k.kot_id === kotId);
        if (item) {
          item.status = 'CANCELLED';
          item.cancellation_reason = reason.trim();
          item.cancelled_at = cancelData.cancelled_at;
          localStorage.setItem('billnaw_active_kots', JSON.stringify(list));
        }
      } catch (e) {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('billnaw:kot-cancelled', { detail: { kotId, reason } }));
    }

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

/**
 * Retrieve active Kitchen Order Tickets for KDS display.
 * Gathers tickets from local storage, in-memory table orders, and cloud DB.
 * @returns {Promise<{ data: Array<Object>, error: string|null }>}
 */
export async function getActiveKOTs() {
  return safeExecute(async () => {
    let kots = [];
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const cutoff24h = now - TWENTY_FOUR_HOURS;
    const todayStr = new Date(now).toDateString();

    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('billnaw_active_kots');
        if (stored) {
          kots = JSON.parse(stored);
        }
      } catch (e) {}
    }

    // 1. Sliding 24-Hour DB Retention: Keep KOT details in database for 24 hours
    kots = Array.isArray(kots) ? kots.filter(k => {
      const createdTime = new Date(k.created_at || 0).getTime();
      return createdTime >= cutoff24h;
    }) : [];

    // 2. Determine Active Tables status
    const activeTables = (typeof window !== 'undefined' && window.tablesInfo) ? window.tablesInfo : null;
    const allTablesClear = !activeTables || Object.values(activeTables).every(t => !t || !Array.isArray(t.items) || t.items.length === 0 || t.status === 'empty' || t.status === 'billed');

    let storageChanged = false;

    // 3. Mark settled / cleared / yesterday table tickets as SERVED
    kots.forEach(k => {
      if (k.status === 'CANCELLED' || k.status === 'SERVED') return;
      
      const isTableTicket = k.table_id && k.table_id !== 'TAKEAWAY';
      const createdDate = new Date(k.created_at || 0).toDateString();
      const isFromPreviousDay = createdDate !== todayStr;

      if (isTableTicket) {
        if (allTablesClear || isFromPreviousDay) {
          // Next day rollover or all tables cleared: KDS screen should be clean
          k.status = 'SERVED';
          k.updated_at = new Date().toISOString();
          storageChanged = true;
        } else if (activeTables) {
          // Check if specific table is currently occupied
          const matchingKey = Object.keys(activeTables).find(key => {
            const tName = typeof window.getTableName === 'function' ? window.getTableName(key) : `Table ${key}`;
            return k.table_id === tName || k.table_id === `Table ${key}` || k.table_id === String(key) || k.kot_id === `KOT-TBL-${key}`;
          });
          const tInfo = matchingKey ? activeTables[matchingKey] : null;
          if (!tInfo || !Array.isArray(tInfo.items) || tInfo.items.length === 0 || tInfo.status === 'empty' || tInfo.status === 'billed') {
            // Table was cleared or checked out: remove from active kitchen
            k.status = 'SERVED';
            k.updated_at = new Date().toISOString();
            storageChanged = true;
          }
        }
      } else if (isFromPreviousDay && ['PENDING', 'PREPARING', 'READY'].includes(k.status)) {
        // Stale takeaway ticket from previous day
        k.status = 'SERVED';
        k.updated_at = new Date().toISOString();
        storageChanged = true;
      }
    });

    // 4. Merge active in-memory table orders that contain kitchen items
    if (activeTables && !allTablesClear) {
      Object.keys(activeTables).forEach(tableKey => {
        const tInfo = activeTables[tableKey];
        if (tInfo && Array.isArray(tInfo.items) && tInfo.items.length > 0 && tInfo.status !== 'billed' && tInfo.status !== 'empty') {
          const tableName = typeof window.getTableName === 'function' ? window.getTableName(tableKey) : `Table ${tableKey}`;
          const existing = kots.find(k => (k.table_id === tableName || k.table_id === `Table ${tableKey}` || k.table_id === String(tableKey) || k.kot_id === `KOT-TBL-${tableKey}`) && k.status !== 'SERVED' && k.status !== 'CANCELLED');
          if (!existing) {
            kots.unshift({
              kot_id: `KOT-TBL-${tableKey}`,
              table_id: tableName,
              order_type: 'DINE_IN',
              status: 'PENDING',
              items: tInfo.items.map(it => ({
                name: it.name || 'Dish',
                quantity: it.qty || it.quantity || 1,
                notes: it.notes || ''
              })),
              server_staff_id: tInfo.server || 'Floor Server',
              created_at: tInfo.savedTime ? new Date(tInfo.savedTime).toISOString() : new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            storageChanged = true;
          }
        }
      });
    }

    // Attempt cloud database retrieval if online
    try {
      const db = getDbClient();
      const cafeId = getTenantCafeId();
      if (db && typeof db.collection === 'function') {
        const col = db.collection(`cafes/${cafeId}/kots`);
        if (col && typeof col.getDocs === 'function') {
          const snap = await col.getDocs();
          if (snap && snap.docs) {
            snap.docs.forEach(docSnap => {
              const d = docSnap.data();
              if (d && ['PENDING', 'PREPARING', 'READY'].includes(d.status)) {
                const createdTime = new Date(d.created_at || 0).getTime();
                if (createdTime >= cutoff24h) {
                  const idx = kots.findIndex(k => k.kot_id === d.kot_id || k.id === docSnap.id);
                  if (idx >= 0) {
                    kots[idx] = { id: docSnap.id, ...d };
                  } else {
                    kots.unshift({ id: docSnap.id, ...d });
                  }
                }
              }
            });
          }
        }
      }
    } catch (dbErr) {}

    // Persist 24hr retained list in localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('billnaw_active_kots', JSON.stringify(kots.slice(0, 200)));
      } catch (e) {}
    }

    // 5. Active Display Filtering: Return only active preparation tickets (exclude SERVED and CANCELLED)
    let activeTickets = kots.filter(k => ['PENDING', 'PREPARING', 'READY'].includes(k.status));

    // If all tables are clear, ensure no table tickets linger on screen
    if (allTablesClear) {
      activeTickets = activeTickets.filter(k => !k.table_id || k.table_id === 'TAKEAWAY');
    }
    
    // Sort oldest first for kitchen workflow priority
    activeTickets.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    return activeTickets;
  });
}
