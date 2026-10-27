/**
 * src/features/billing/billing.service.js
 * Mission-Critical Billing Service & Atomic Bill Settlement Engine for Billnaw Cafe POS.
 * 
 * Strict POS Invariants Enforced:
 * 1. Integer Paise Math across line items, subtotals, discounts, GST, and final totals.
 * 2. Deterministic Offline Invoice IDs (UUIDv4 + BN-{Terminal}-{YYMMDD}-{Counter}).
 * 3. Atomic Bill Settlement: single writeBatch bundling invoice persistence, recipe stock
 *    deduction, customer CRM update, daily GST counter, and table reset.
 * 4. Anti-Tampering Rule: Invoices are immutable; ZERO delete operations. Bills only transition
 *    to VOID with mandatory audit metadata.
 * 5. Returns standardized { data, error, offlineQueued } envelope.
 */

import { safeExecute, successResult, errorResult } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId, getTerminalId } from '../../core/config.js';
import { generateDeterministicInvoiceId } from '../../shared/utils/invoice-id.js';
import {
  rupeesToPaise,
  paiseToRupees,
  addPaise,
  calcDiscountPaise,
  calcRoundoff
} from '../../shared/utils/currency.js';
import { calculateGST } from '../../shared/utils/gst-calculator.js';

/**
 * Calculate full bill financial breakdown in integer paise.
 * @param {Array<{ price_paise: number, quantity: number, gst_rate?: number, name: string }>} items
 * @param {Object} options
 * @param {number} [options.discountPercent=0]
 * @param {number} [options.discountAmountPaise=0]
 * @param {boolean} [options.isTaxInclusive=true]
 * @param {boolean} [options.isInterState=false]
 * @returns {Object} Full financial breakdown in integer paise and rupees
 */
export function calculateBillFinancials(items = [], options = {}) {
  const {
    discountPercent = 0,
    discountAmountPaise = 0,
    isTaxInclusive = true,
    isInterState = false
  } = options;

  let grossSubtotalPaise = 0;
  const processedItems = [];

  for (const item of items) {
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));
    const unitPricePaise = item.price_paise !== undefined ? item.price_paise : rupeesToPaise(item.price || 0);
    const lineTotalPaise = unitPricePaise * qty;
    grossSubtotalPaise += lineTotalPaise;

    processedItems.push({
      ...item,
      quantity: qty,
      unit_price_paise: unitPricePaise,
      line_total_paise: lineTotalPaise
    });
  }

  // Calculate discount
  let totalDiscountPaise = 0;
  if (discountPercent > 0) {
    totalDiscountPaise = calcDiscountPaise(grossSubtotalPaise, discountPercent);
  } else if (discountAmountPaise > 0) {
    totalDiscountPaise = Math.min(grossSubtotalPaise, discountAmountPaise);
  }

  const taxableSubtotalPaise = Math.max(0, grossSubtotalPaise - totalDiscountPaise);

  // Calculate GST across items or blended rate
  // Default to 5% cafe rate if not specified on item
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;

  for (const item of processedItems) {
    const itemGstRate = item.gst_rate !== undefined ? item.gst_rate : 5;
    // Ratio of this item to total subtotal
    const itemRatio = grossSubtotalPaise > 0 ? (item.line_total_paise / grossSubtotalPaise) : 0;
    const itemNetTaxablePaise = Math.round(taxableSubtotalPaise * itemRatio);

    const gst = calculateGST(itemNetTaxablePaise, itemGstRate, {
      isInclusive: isTaxInclusive,
      isInterState
    });

    totalCgstPaise += gst.cgst_paise;
    totalSgstPaise += gst.sgst_paise;
    totalIgstPaise += gst.igst_paise;
  }

  const totalTaxPaise = totalCgstPaise + totalSgstPaise + totalIgstPaise;
  const unroundedTotalPaise = isTaxInclusive 
    ? taxableSubtotalPaise 
    : (taxableSubtotalPaise + totalTaxPaise);

  const roundoffPaise = calcRoundoff(unroundedTotalPaise);
  const finalPayablePaise = addPaise(unroundedTotalPaise, roundoffPaise);

  return {
    items: processedItems,
    gross_subtotal_paise: grossSubtotalPaise,
    gross_subtotal_rupees: paiseToRupees(grossSubtotalPaise),
    discount_paise: totalDiscountPaise,
    discount_rupees: paiseToRupees(totalDiscountPaise),
    taxable_subtotal_paise: taxableSubtotalPaise,
    taxable_subtotal_rupees: paiseToRupees(taxableSubtotalPaise),
    cgst_paise: totalCgstPaise,
    cgst_rupees: paiseToRupees(totalCgstPaise),
    sgst_paise: totalSgstPaise,
    sgst_rupees: paiseToRupees(totalSgstPaise),
    igst_paise: totalIgstPaise,
    igst_rupees: paiseToRupees(totalIgstPaise),
    total_tax_paise: totalTaxPaise,
    total_tax_rupees: paiseToRupees(totalTaxPaise),
    roundoff_paise: roundoffPaise,
    roundoff_rupees: paiseToRupees(roundoffPaise),
    final_payable_paise: finalPayablePaise,
    final_payable_rupees: paiseToRupees(finalPayablePaise)
  };
}

/**
 * Settle Bill with Atomic Batch Write.
 * Bundles:
 *   1. Invoice record creation
 *   2. Recipe ingredient raw material deductions
 *   3. Customer CRM visit / khata ledger update
 *   4. Daily sales & GST aggregate counter increment
 *   5. Dine-in Table reset to AVAILABLE
 * 
 * @param {Object} billData
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function settleBill(billData) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const terminalId = getTerminalId();
    const db = getDbClient();

    if (!billData.items || billData.items.length === 0) {
      throw new Error('Cannot settle an empty bill. Items are required.');
    }

    // 1. Generate Deterministic Invoice IDs
    const counter = billData.counter || Math.floor(Math.random() * 9000) + 1000;
    const { client_invoice_id, invoice_id } = generateDeterministicInvoiceId(terminalId, counter);

    // 2. Perform Integer Financials
    const financials = calculateBillFinancials(billData.items, {
      discountPercent: billData.discount_percent || 0,
      discountAmountPaise: billData.discount_amount_paise || 0,
      isTaxInclusive: billData.is_tax_inclusive !== false,
      isInterState: !!billData.is_inter_state
    });

    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');

    const invoiceDoc = {
      invoice_id,
      client_invoice_id,
      cafe_id: cafeId,
      terminal_id: terminalId,
      status: 'SETTLED', // IMMUTABLE: can only change to VOID via voidBill
      created_at: now.toISOString(),
      settled_at: now.toISOString(),
      cashier_id: billData.cashier_id || 'cashier_terminal',
      table_id: billData.table_id || null,
      order_type: billData.order_type || 'DINE_IN',
      payment_mode: billData.payment_mode || 'CASH', // CASH, UPI, CARD, KHATA, SPLIT
      customer_name: billData.customer_name || 'Walk-in Customer',
      customer_phone: billData.customer_phone || '',
      items: financials.items,
      gross_subtotal_paise: financials.gross_subtotal_paise,
      discount_paise: financials.discount_paise,
      taxable_subtotal_paise: financials.taxable_subtotal_paise,
      cgst_paise: financials.cgst_paise,
      sgst_paise: financials.sgst_paise,
      igst_paise: financials.igst_paise,
      total_tax_paise: financials.total_tax_paise,
      roundoff_paise: financials.roundoff_paise,
      final_payable_paise: financials.final_payable_paise,
      final_payable_rupees: financials.final_payable_rupees,
      amount_tendered_paise: billData.amount_tendered_paise || financials.final_payable_paise,
      change_due_paise: billData.change_due_paise || 0,
      notes: billData.notes || ''
    };

    // 3. Prepare Atomic Batch
    const batch = db.createBatch();

    // A. Invoice document
    const invoiceRef = db.doc(`cafes/${cafeId}/invoices/${invoice_id}`);
    batch.set(invoiceRef, invoiceDoc);

    // B. Recipe ingredient stock deductions (if inventory recipe map exists)
    if (billData.stock_deductions && Array.isArray(billData.stock_deductions)) {
      for (const deduction of billData.stock_deductions) {
        if (deduction.material_id && deduction.deduct_qty) {
          const matRef = db.doc(`cafes/${cafeId}/raw_materials/${deduction.material_id}`);
          batch.update(matRef, {
            current_stock: db.increment(-Number(deduction.deduct_qty)),
            updated_at: now.toISOString()
          });
        }
      }
    }

    // C. Customer CRM & Khata Ledger update
    if (billData.customer_phone) {
      const custRef = db.doc(`cafes/${cafeId}/customers/${billData.customer_phone}`);
      const isKhata = billData.payment_mode === 'KHATA';
      batch.set(custRef, {
        phone: billData.customer_phone,
        name: billData.customer_name || 'Valued Customer',
        total_visits: db.increment(1),
        total_spent_paise: db.increment(financials.final_payable_paise),
        khata_balance_paise: isKhata ? db.increment(financials.final_payable_paise) : db.increment(0),
        last_visit_at: now.toISOString(),
        updated_at: now.toISOString()
      }, { merge: true });
    }

    // D. Daily GST & Sales Aggregate Counter
    const summaryRef = db.doc(`cafes/${cafeId}/daily_summaries/${yyyymmdd}`);
    batch.set(summaryRef, {
      date: yyyymmdd,
      cafe_id: cafeId,
      total_orders: db.increment(1),
      gross_sales_paise: db.increment(financials.gross_subtotal_paise),
      net_sales_paise: db.increment(financials.final_payable_paise),
      cgst_collected_paise: db.increment(financials.cgst_paise),
      sgst_collected_paise: db.increment(financials.sgst_paise),
      igst_collected_paise: db.increment(financials.igst_paise),
      discount_given_paise: db.increment(financials.discount_paise),
      updated_at: now.toISOString()
    }, { merge: true });

    // E. Reset Dine-in Table
    if (billData.table_id) {
      const tableRef = db.doc(`cafes/${cafeId}/tables/${billData.table_id}`);
      batch.update(tableRef, {
        status: 'AVAILABLE',
        active_bill_id: null,
        occupied_at: null,
        guests_count: 0,
        updated_at: now.toISOString()
      });
    }

    // Commit atomic batch
    await batch.commit();

    // In local dev/fallback mode also update localStorage cache
    if (typeof localStorage !== 'undefined') {
      try {
        const rawHistory = localStorage.getItem('pos_order_history');
        const history = rawHistory ? JSON.parse(rawHistory) : [];
        history.unshift(invoiceDoc);
        localStorage.setItem('pos_order_history', JSON.stringify(history.slice(0, 500)));
      } catch (e) {
        // quota exceeded fallback
      }
    }

    return invoiceDoc;
  });
}

/**
 * Void Bill with Mandatory Audit Trail.
 * ANTI-TAMPERING: Invoices are NEVER deleted from the database.
 * 
 * @param {string} invoiceId
 * @param {string} voidReason
 * @param {string} voidedByStaffId
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function voidBill(invoiceId, voidReason, voidedByStaffId) {
  return safeExecute(async () => {
    if (!invoiceId) throw new Error('Invoice ID is required for void operation.');
    if (!voidReason || voidReason.trim().length < 3) {
      throw new Error('A valid void reason (min 3 characters) is strictly mandatory.');
    }
    if (!voidedByStaffId) {
      throw new Error('Void operation requires authorizing Staff / Manager ID.');
    }

    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const now = new Date().toISOString();

    const invoiceRef = db.doc(`cafes/${cafeId}/invoices/${invoiceId}`);
    
    // Check if invoice exists and is not already void
    const existingSnap = await invoiceRef.get();
    if (!existingSnap.exists) {
      throw new Error(`Invoice #${invoiceId} not found.`);
    }

    const existingData = existingSnap.data();
    if (existingData.status === 'VOID') {
      throw new Error(`Invoice #${invoiceId} is already marked as VOID.`);
    }

    const voidUpdate = {
      status: 'VOID',
      void_reason: voidReason.trim(),
      voided_by: voidedByStaffId,
      voided_at: now,
      updated_at: now
    };

    // Atomic update
    await invoiceRef.update(voidUpdate);

    // If bill was KHATA, reverse customer khata balance
    if (existingData.payment_mode === 'KHATA' && existingData.customer_phone) {
      const custRef = db.doc(`cafes/${cafeId}/customers/${existingData.customer_phone}`);
      await custRef.update({
        khata_balance_paise: db.increment(-Number(existingData.final_payable_paise || 0)),
        updated_at: now
      });
    }

    // Mirror to localStorage in dev mode
    if (typeof localStorage !== 'undefined') {
      try {
        const rawHistory = localStorage.getItem('pos_order_history');
        if (rawHistory) {
          const history = JSON.parse(rawHistory);
          const found = history.find(inv => inv.invoice_id === invoiceId);
          if (found) {
            Object.assign(found, voidUpdate);
            localStorage.setItem('pos_order_history', JSON.stringify(history));
          }
        }
      } catch (e) {}
    }

    return { ...existingData, ...voidUpdate };
  });
}

/**
 * Generate decoupled thermal receipt payload for physical ESC/POS printing.
 * Decoupled so printer jams/offline state NEVER compromise settled invoice data.
 * 
 * @param {Object} invoice
 * @param {Object} cafeProfile
 * @returns {{ textContent: string, escPosBytes: Uint8Array, printableHtml: string }}
 */
export function generateReceiptPayload(invoice, cafeProfile = {}) {
  const cafeName = cafeProfile.name || 'BILLNAW CAFE';
  const cafeAddress = cafeProfile.address || 'Smart POS Terminal';
  const cafeGstin = cafeProfile.gstin || '';
  const cafeFssai = cafeProfile.fssai || '';
  const dateStr = invoice.settled_at 
    ? new Date(invoice.settled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) 
    : new Date().toLocaleString('en-IN');

  const divider = '------------------------------------------\n';
  let txt = '';
  txt += `\x1B\x61\x01`; // Center
  txt += `\x1B\x45\x01${cafeName}\x1B\x45\x00\n`;
  txt += `${cafeAddress}\n`;
  if (cafeGstin) txt += `GSTIN: ${cafeGstin}\n`;
  if (cafeFssai) txt += `FSSAI: ${cafeFssai}\n`;
  txt += divider;
  txt += `\x1B\x61\x00`; // Left
  txt += `Invoice : ${invoice.invoice_id}\n`;
  txt += `Date    : ${dateStr}\n`;
  txt += `Terminal: ${invoice.terminal_id || 'T1'}\n`;
  if (invoice.table_id) txt += `Table   : ${invoice.table_id}\n`;
  if (invoice.customer_phone) txt += `Customer: ${invoice.customer_name} (${invoice.customer_phone})\n`;
  txt += divider;

  txt += `Item                      Qty   Total (INR)\n`;
  txt += divider;

  for (const it of (invoice.items || [])) {
    const name = (it.name || 'Item').padEnd(24).slice(0, 24);
    const qty = String(it.quantity).padStart(4);
    const total = String(paiseToRupees(it.line_total_paise || (it.unit_price_paise * it.quantity))).padStart(12);
    txt += `${name} ${qty} ${total}\n`;
  }

  txt += divider;
  txt += `Subtotal:      INR ${paiseToRupees(invoice.gross_subtotal_paise)}\n`;
  if (invoice.discount_paise > 0) {
    txt += `Discount:     -INR ${paiseToRupees(invoice.discount_paise)}\n`;
  }
  if (invoice.cgst_paise > 0) {
    txt += `CGST (2.5%):   INR ${paiseToRupees(invoice.cgst_paise)}\n`;
  }
  if (invoice.sgst_paise > 0) {
    txt += `SGST (2.5%):   INR ${paiseToRupees(invoice.sgst_paise)}\n`;
  }
  if (invoice.roundoff_paise !== 0) {
    txt += `Roundoff:      INR ${paiseToRupees(invoice.roundoff_paise)}\n`;
  }
  txt += `\x1B\x45\x01TOTAL PAYABLE: INR ${invoice.final_payable_rupees || paiseToRupees(invoice.final_payable_paise)}\x1B\x45\x00\n`;
  txt += `Payment Mode:  ${invoice.payment_mode}\n`;
  txt += divider;
  txt += `\x1B\x61\x01`; // Center
  txt += `Thank you! Visit Again.\nPowered by Billnaw POS\n\n\n\x1D\x56\x41\x03`; // Cut

  const encoder = new TextEncoder();
  const escPosBytes = encoder.encode(txt);

  const printableHtml = `
    <div class="thermal-receipt-preview font-mono text-sm leading-tight p-4 bg-white text-black max-w-xs mx-auto">
      <div class="text-center font-bold text-lg">${escapeHtml(cafeName)}</div>
      <div class="text-center text-xs">${escapeHtml(cafeAddress)}</div>
      ${cafeGstin ? `<div class="text-center text-xs">GSTIN: ${escapeHtml(cafeGstin)}</div>` : ''}
      <hr class="my-2 border-dashed border-gray-400" />
      <div class="flex justify-between"><span>Bill: #${invoice.invoice_id}</span><span>${dateStr}</span></div>
      ${invoice.table_id ? `<div>Table: ${escapeHtml(invoice.table_id)}</div>` : ''}
      <hr class="my-2 border-dashed border-gray-400" />
      <table class="w-full text-xs">
        <thead><tr class="border-b border-gray-300"><th class="text-left">Item</th><th>Qty</th><th class="text-right">INR</th></tr></thead>
        <tbody>
          ${(invoice.items || []).map(it => `
            <tr>
              <td>${escapeHtml(it.name)}</td>
              <td class="text-center">${it.quantity}</td>
              <td class="text-right">${paiseToRupees(it.line_total_paise || (it.unit_price_paise * it.quantity))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <hr class="my-2 border-dashed border-gray-400" />
      <div class="flex justify-between font-bold text-sm">
        <span>TOTAL:</span><span>INR ${invoice.final_payable_rupees || paiseToRupees(invoice.final_payable_paise)}</span>
      </div>
      <div class="text-center text-xs mt-4">Thank You! Visit Again</div>
    </div>
  `;

  return {
    textContent: txt,
    escPosBytes,
    printableHtml
  };
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
