/**
 * src/shared/utils/gst-calculator.js
 * Indian GST Tax Calculation Engine in Integer Paise.
 * Supports CGST, SGST, IGST, Inclusive & Exclusive tax modes with zero rounding discrepancies.
 */

import { addPaise } from './currency.js';

export const GST_MODES = {
  INCLUSIVE: 'INCLUSIVE',
  EXCLUSIVE: 'EXCLUSIVE'
};

export const STANDARD_GST_RATES = [0, 5, 12, 18, 28];

/**
 * Computes tax for a single line item in integer paise.
 * @param {number} itemPricePaise - Unit price in paise
 * @param {number} qty - Item quantity
 * @param {number} gstRate - Total GST percentage (e.g. 5, 12, 18)
 * @param {"INCLUSIVE"|"EXCLUSIVE"} [gstMode="INCLUSIVE"]
 * @param {boolean} [isInterstate=false] - True for IGST, False for CGST+SGST
 * @returns {Object} Line item tax breakdown in integer paise
 */
export function calcItemGst(itemPricePaise, qty, gstRate, gstMode = GST_MODES.INCLUSIVE, isInterstate = false) {
  const price = parseInt(itemPricePaise, 10) || 0;
  const count = Math.max(0, parseInt(qty, 10) || 1);
  const rate = Math.max(0, parseFloat(gstRate) || 0);

  const lineTotalPaise = price * count;
  if (lineTotalPaise === 0 || rate === 0) {
    return {
      taxablePaise: lineTotalPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
      finalLineTotalPaise: lineTotalPaise,
      gstRate: rate,
      gstMode
    };
  }

  let taxablePaise = 0;
  let totalTaxPaise = 0;

  if (gstMode === GST_MODES.INCLUSIVE) {
    // Taxable = (Price * 100) / (100 + Rate)
    taxablePaise = Math.round((lineTotalPaise * 100) / (100 + rate));
    totalTaxPaise = lineTotalPaise - taxablePaise;
  } else {
    // Taxable = LineTotal, Tax = (Taxable * Rate) / 100
    taxablePaise = lineTotalPaise;
    totalTaxPaise = Math.round((taxablePaise * rate) / 100);
  }

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterstate) {
    igstPaise = totalTaxPaise;
  } else {
    // Split equally between CGST and SGST, ensuring sum matches totalTaxPaise exactly
    cgstPaise = Math.floor(totalTaxPaise / 2);
    sgstPaise = totalTaxPaise - cgstPaise;
  }

  const finalLineTotalPaise = gstMode === GST_MODES.INCLUSIVE
    ? lineTotalPaise
    : taxablePaise + totalTaxPaise;

  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    finalLineTotalPaise,
    gstRate: rate,
    gstMode
  };
}

/**
 * Universal calculation wrapper for single or total amounts.
 * @param {number} amountPaise 
 * @param {number} [gstRate=5] 
 * @param {Object} [options={}]
 * @param {boolean} [options.isInclusive=true]
 * @param {boolean} [options.isInterState=false]
 */
export function calculateGST(amountPaise, gstRate = 5, options = {}) {
  const isInclusive = options.isInclusive !== false;
  const isInterState = !!options.isInterState;
  const res = calcItemGst(
    amountPaise,
    1,
    gstRate,
    isInclusive ? GST_MODES.INCLUSIVE : GST_MODES.EXCLUSIVE,
    isInterState
  );

  return {
    taxable_amount_paise: res.taxablePaise,
    cgst_paise: res.cgstPaise,
    sgst_paise: res.sgstPaise,
    igst_paise: res.igstPaise,
    total_tax_paise: res.totalTaxPaise,
    total_paise: res.finalLineTotalPaise,
    gst_rate: res.gstRate,
    is_inclusive: isInclusive,
    is_interstate: isInterState
  };
}

/**
 * Aggregates order items and discount into a complete bill tax summary.
 * @param {Array<Object>} items - Array of { price_paise, qty, gst_rate }
 * @param {number} discountPaise - Total discount in paise to apply
 * @param {"INCLUSIVE"|"EXCLUSIVE"} [defaultGstMode="INCLUSIVE"]
 * @param {boolean} [isInterstate=false]
 * @returns {Object} Comprehensive bill totals in integer paise
 */
export function calcBillGstTotals(items, discountPaise = 0, defaultGstMode = GST_MODES.INCLUSIVE, isInterstate = false) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      grossSubtotalPaise: 0,
      discountPaise: 0,
      taxableSubtotalPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
      netTotalPaise: 0,
      taxSlabs: {}
    };
  }

  let grossSubtotalPaise = 0;
  const lineResults = [];

  for (const it of items) {
    const unitPrice = it.price_paise || (it.price ? Math.round(it.price * 100) : 0);
    const qty = it.qty || 1;
    const rate = it.gst_rate !== undefined ? it.gst_rate : 5;
    const mode = it.gst_mode || defaultGstMode;

    const res = calcItemGst(unitPrice, qty, rate, mode, isInterstate);
    lineResults.push(res);
    grossSubtotalPaise += (mode === GST_MODES.INCLUSIVE ? res.finalLineTotalPaise : res.taxablePaise);
  }

  const safeDiscount = Math.min(grossSubtotalPaise, Math.max(0, parseInt(discountPaise, 10) || 0));
  const discountRatio = grossSubtotalPaise > 0 ? (grossSubtotalPaise - safeDiscount) / grossSubtotalPaise : 1;

  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;
  const taxSlabs = {};

  for (const line of lineResults) {
    // Proportionally apply bill discount across tax lines
    const lineDiscountedTaxable = Math.round(line.taxablePaise * discountRatio);
    const lineDiscountedTax = Math.round(line.totalTaxPaise * discountRatio);

    const cgst = Math.floor(lineDiscountedTax / 2);
    const sgst = lineDiscountedTax - cgst;

    totalTaxablePaise += lineDiscountedTaxable;
    totalCgstPaise += cgst;
    totalSgstPaise += sgst;
    totalTaxPaise += lineDiscountedTax;

    const slabKey = `${line.gstRate}%`;
    if (!taxSlabs[slabKey]) {
      taxSlabs[slabKey] = {
        rate: line.gstRate,
        taxablePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        totalTaxPaise: 0
      };
    }
    taxSlabs[slabKey].taxablePaise += lineDiscountedTaxable;
    taxSlabs[slabKey].cgstPaise += cgst;
    taxSlabs[slabKey].sgstPaise += sgst;
    taxSlabs[slabKey].totalTaxPaise += lineDiscountedTax;
  }

  const netTotalPaise = totalTaxablePaise + totalTaxPaise;

  return {
    grossSubtotalPaise,
    discountPaise: safeDiscount,
    taxableSubtotalPaise: totalTaxablePaise,
    cgstPaise: totalCgstPaise,
    sgstPaise: totalSgstPaise,
    igstPaise: totalIgstPaise,
    totalTaxPaise,
    netTotalPaise,
    taxSlabs
  };
}
