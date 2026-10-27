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
