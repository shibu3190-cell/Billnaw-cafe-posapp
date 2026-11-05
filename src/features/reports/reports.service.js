/**
 * src/features/reports/reports.service.js
 * Business Intelligence, Sales Register & GST Reporting Service for Billnaw Cafe POS.
 * Aggregates integer paise financial figures into daily summaries and tax audit reports.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';
import { paiseToRupees } from '../../shared/utils/currency.js';

/**
 * Fetch daily financial and GST summary.
 * @param {string} [dateStr] YYYYMMDD format. Defaults to today.
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function getDailySummary(dateStr) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const targetDate = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const summaryRef = db.doc(`cafes/${cafeId}/daily_summaries/${targetDate}`);
    const snap = await summaryRef.get();

    if (snap.exists) {
      const d = snap.data();
      return {
        date: targetDate,
        ...d,
        gross_sales_rupees: paiseToRupees(d.gross_sales_paise || 0),
        net_sales_rupees: paiseToRupees(d.net_sales_paise || 0),
        cgst_collected_rupees: paiseToRupees(d.cgst_collected_paise || 0),
        sgst_collected_rupees: paiseToRupees(d.sgst_collected_paise || 0),
        igst_collected_rupees: paiseToRupees(d.igst_collected_paise || 0),
        discount_given_rupees: paiseToRupees(d.discount_given_paise || 0)
      };
    }

    return {
      date: targetDate,
      total_orders: 0,
      gross_sales_paise: 0,
      gross_sales_rupees: 0,
      net_sales_paise: 0,
      net_sales_rupees: 0,
      cgst_collected_paise: 0,
      cgst_collected_rupees: 0,
      sgst_collected_paise: 0,
      sgst_collected_rupees: 0,
      igst_collected_paise: 0,
      igst_collected_rupees: 0,
      discount_given_paise: 0,
      discount_given_rupees: 0
    };
  });
}

/**
 * Fetch settled invoice transaction ledger for date range.
 * @param {string} startDate ISO date string
 * @param {string} endDate ISO date string
 * @returns {Promise<{ data: Array<Object>, error: string|null, offlineQueued: boolean }>}
 */
export async function getSalesRegister(startDate, endDate) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();

    // Query invoices
    const snap = await db.collection(`cafes/${cafeId}/invoices`).get();
    let invoices = [];

    if (!snap.empty) {
      snap.forEach(doc => {
        const inv = doc.data();
        invoices.push({
          id: doc.id,
          ...inv,
          final_payable_rupees: paiseToRupees(inv.final_payable_paise || 0),
          gross_subtotal_rupees: paiseToRupees(inv.gross_subtotal_paise || 0)
        });
      });
    } else if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_order_history');
        invoices = raw ? JSON.parse(raw) : [];
      } catch (e) {
        invoices = [];
      }
    }

    // Filter by dates if provided
    if (startDate) {
      const s = new Date(startDate).getTime();
      invoices = invoices.filter(inv => new Date(inv.created_at).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      invoices = invoices.filter(inv => new Date(inv.created_at).getTime() <= e);
    }

    return invoices.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });
}

/**
 * Generate GST Audit breakdown report.
 * @param {Array<Object>} invoices
 * @returns {{ taxableAmountRupees: number, cgstRupees: number, sgstRupees: number, igstRupees: number, totalGstRupees: number }}
 */
export function aggregateGstReport(invoices = []) {
  let taxablePaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  for (const inv of invoices) {
    if (inv.status === 'SETTLED') {
      taxablePaise += (inv.taxable_subtotal_paise || 0);
      cgstPaise += (inv.cgst_paise || 0);
      sgstPaise += (inv.sgst_paise || 0);
      igstPaise += (inv.igst_paise || 0);
    }
  }

  const totalGstPaise = cgstPaise + sgstPaise + igstPaise;

  return {
    taxable_amount_paise: taxablePaise,
    taxable_amount_rupees: paiseToRupees(taxablePaise),
    cgst_paise: cgstPaise,
    cgst_rupees: paiseToRupees(cgstPaise),
    sgst_paise: sgstPaise,
    sgst_rupees: paiseToRupees(sgstPaise),
    igst_paise: igstPaise,
    igst_rupees: paiseToRupees(igstPaise),
    total_gst_paise: totalGstPaise,
    total_gst_rupees: paiseToRupees(totalGstPaise)
  };
}

/**
 * Executes bounded server-side query for historical invoices using getDocs.
 * Employs document cursor (startAfter) pagination with strict 500-day retention ceiling.
 * 
 * @param {string|Object} [cafeIdOrOptions] - Cafe ID string or options object
 * @param {Object} [options] - Options if first param is cafeId
 * @param {string} [options.startDate] - ISO timestamp or YYYY-MM-DD
 * @param {string} [options.endDate] - ISO timestamp or YYYY-MM-DD
 * @param {number} [options.limit=25] - Items per page
 * @param {any} [options.startAfterDoc=null] - DocumentSnapshot or ID cursor
 * @param {string} [options.paymentMode='all'] - Optional payment filter
 * @returns {Promise<{ items: Array<Object>, nextCursor: any, hasMore: boolean, totalFetched: number, data: Object }>}
 */
export async function getHistoricalInvoicesPaginated(cafeIdOrOptions, maybeOptions = {}) {
  let cafeId;
  let opts;

  if (typeof cafeIdOrOptions === 'string') {
    cafeId = cafeIdOrOptions;
    opts = maybeOptions || {};
  } else {
    opts = cafeIdOrOptions || {};
    cafeId = opts.cafeId || getTenantCafeId();
  }

  const {
    startDate = null,
    endDate = null,
    limit: pageSize = opts.pageSize || 25,
    startAfterDoc = opts.cursorDoc || null,
    paymentMode = 'all'
  } = opts;

  const db = getDbClient();

  // 1. Enforce strict 500-day hard retention ceiling
  const MAX_HISTORY_MS = 500 * 24 * 60 * 60 * 1000;
  const earliestAllowed = new Date(Date.now() - MAX_HISTORY_MS).toISOString();
  let effectiveStart = earliestAllowed;
  if (startDate) {
    const reqStart = new Date(startDate).toISOString();
    effectiveStart = reqStart > earliestAllowed ? reqStart : earliestAllowed;
  }
  const effectiveEnd = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

  // 2. Headless / Node / UniversalDbClient Environment
  if (typeof window === 'undefined' || (!window.firebaseFirestoreModule && !window.firestoreGetDocs)) {
    const snap = await db.collection(`cafes/${cafeId}/invoices`).get();
    let invoices = [];

    if (!snap.empty) {
      snap.forEach(doc => {
        const inv = doc.data();
        const created = inv.created_at || inv.createdAt || inv.settled_at || new Date().toISOString();
        if (created >= effectiveStart && created <= effectiveEnd) {
          if (paymentMode === 'all' || (inv.payment_mode || inv.paymentMode || '').toLowerCase() === paymentMode.toLowerCase()) {
            invoices.push({
              id: doc.id,
              ...inv,
              final_payable_rupees: paiseToRupees(inv.final_payable_paise || (inv.amount ? inv.amount * 100 : 0)),
              gross_subtotal_rupees: paiseToRupees(inv.gross_subtotal_paise || 0)
            });
          }
        }
      });
    } else if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_order_history');
        if (raw) {
          const stored = JSON.parse(raw);
          stored.forEach(inv => {
            const created = inv.created_at || inv.createdAt || inv.date || new Date().toISOString();
            if (created >= effectiveStart && created <= effectiveEnd) {
              if (paymentMode === 'all' || (inv.payment_mode || inv.paymentMode || '').toLowerCase() === paymentMode.toLowerCase()) {
                invoices.push({
                  id: inv.id || inv.billNo,
                  ...inv,
                  final_payable_rupees: paiseToRupees(inv.final_payable_paise || (inv.amount ? inv.amount * 100 : 0)),
                  gross_subtotal_rupees: paiseToRupees(inv.gross_subtotal_paise || 0)
                });
              }
            }
          });
        }
      } catch (e) {}
    }

    invoices.sort((a, b) => new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime());

    let startIndex = 0;
    if (startAfterDoc) {
      const cursorId = typeof startAfterDoc === 'string' ? startAfterDoc : (startAfterDoc.id || null);
      if (cursorId) {
        const idx = invoices.findIndex(i => String(i.id) === String(cursorId));
        if (idx !== -1) {
          startIndex = idx + 1;
        }
      }
    }

    const sliced = invoices.slice(startIndex, startIndex + pageSize);
    const hasMore = invoices.length > startIndex + pageSize;
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].id : null;

    const result = {
      items: sliced,
      nextCursor,
      hasMore,
      totalFetched: sliced.length
    };
    return { ...result, data: result };
  }

  // 3. Browser Firebase Modular SDK
  const fsMod = window.firebaseFirestoreModule || {
    collection: window.firestoreCollection,
    query: window.firestoreQuery,
    where: window.firestoreWhere,
    orderBy: window.firestoreOrderBy,
    limit: window.firestoreLimit,
    startAfter: window.firestoreStartAfter,
    getDocs: window.firestoreGetDocs
  };

  const { collection, query, where, orderBy, limit, startAfter, getDocs } = fsMod;
  const colRef = collection(window.firestoreDB, `cafes/${cafeId}/invoices`);

  const constraints = [
    where('created_at', '>=', effectiveStart),
    where('created_at', '<=', effectiveEnd),
    orderBy('created_at', 'desc')
  ];

  if (paymentMode && paymentMode !== 'all') {
    constraints.push(where('payment_mode', '==', paymentMode));
  }

  if (startAfterDoc && startAfter) {
    constraints.push(startAfter(startAfterDoc));
  }

  constraints.push(limit(pageSize + 1));

  const q = query(colRef, ...constraints);
  const snapshot = await getDocs(q);

  const docs = snapshot.docs || [];
  const hasMore = docs.length > pageSize;
  const resultDocs = hasMore ? docs.slice(0, pageSize) : docs;

  const items = [];
  resultDocs.forEach(d => {
    const inv = d.data();
    items.push({
      id: d.id,
      ...inv,
      final_payable_rupees: paiseToRupees(inv.final_payable_paise || (inv.amount ? inv.amount * 100 : 0)),
      gross_subtotal_rupees: paiseToRupees(inv.gross_subtotal_paise || 0)
    });
  });

  const nextCursor = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null;

  const res = {
    items,
    nextCursor,
    hasMore,
    totalFetched: items.length
  };
  return { ...res, data: res };
}
