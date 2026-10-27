/**
 * src/shared/utils/currency.js
 * Integer Paise Math Engine for Billnaw Cafe POS.
 * Eliminates JavaScript floating-point rounding errors (0.1 + 0.2 != 0.3) by operating strictly in integer paise (₹1.00 = 100 paise).
 */

/**
 * Converts decimal rupees into integer paise.
 * @param {number|string} rupees - e.g. 149.50 or "149.50"
 * @returns {number} Integer paise (e.g. 14950)
 */
export function rupeesToPaise(rupees) {
  if (typeof rupees === 'string') {
    rupees = parseFloat(rupees.replace(/[^\d.-]/g, '')) || 0;
  }
  if (isNaN(rupees) || !isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise into standard floating-point rupees.
 * @param {number} paise - e.g. 14950
 * @returns {number} Decimal rupees (e.g. 149.5)
 */
export function paiseToRupees(paise) {
  const intVal = parseInt(paise, 10);
  if (isNaN(intVal)) return 0;
  return intVal / 100;
}

/**
 * Formats integer paise into a human-readable Indian Rupee currency string.
 * @param {number} paise - e.g. 14950
 * @param {boolean} [includeSymbol=true] - Whether to prepend '₹'
 * @returns {string} e.g. "₹149.50" or "149.50"
 */
export function formatRupees(paise, includeSymbol = true) {
  const p = parseInt(paise, 10);
  const safePaise = isNaN(p) ? 0 : p;
  const isNegative = safePaise < 0;
  const absPaise = Math.abs(safePaise);

  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;

  // Format with standard Indian numbering system (e.g. 1,00,000.00)
  const rupeeStr = rupees.toLocaleString('en-IN');
  const formatted = `${rupeeStr}.${remainingPaise.toString().padStart(2, '0')}`;
  const prefix = isNegative ? '-' : '';

  return includeSymbol ? `${prefix}₹${formatted}` : `${prefix}${formatted}`;
}

/**
 * Safely sums multiple integer paise amounts.
 * @param {...number} amounts - Integer paise values
 * @returns {number}
 */
export function addPaise(...amounts) {
  return amounts.reduce((sum, curr) => {
    const val = parseInt(curr, 10);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
}

/**
 * Multiplies integer paise by a scalar quantity or percentage.
 * Performs Half-Up integer rounding to avoid fractional paise.
 * @param {number} paise
 * @param {number} factor - Scalar multiplier or decimal rate
 * @returns {number} Integer paise
 */
export function multiplyPaise(paise, factor) {
  const p = parseInt(paise, 10);
  if (isNaN(p) || p === 0) return 0;
  return Math.round(p * factor);
}

/**
 * Calculates discount amount in integer paise.
 * Supports both:
 *   calcDiscountPaise(grossPaise, discountPercent)
 *   calcDiscountPaise(grossPaise, "PERCENT"|"FIXED", discountVal)
 * 
 * @param {number} grossPaise - Gross total in paise
 * @param {string|number} arg2 - Discount type or percentage
 * @param {number} [arg3] - Value if arg2 is discount type
 * @returns {number} Integer discount in paise
 */
export function calcDiscountPaise(grossPaise, arg2, arg3) {
  const gross = parseInt(grossPaise, 10) || 0;
  if (gross <= 0) return 0;

  // 2-argument call: calcDiscountPaise(grossPaise, discountPercent)
  if (typeof arg2 === 'number' && arg3 === undefined) {
    const pct = Math.min(100, Math.max(0, arg2));
    return Math.round((gross * pct) / 100);
  }

  // 3-argument call: calcDiscountPaise(grossPaise, discountType, discountVal)
  const discountType = arg2;
  const discountVal = arg3;
  if (!discountType || discountType === 'NONE' || !discountVal || discountVal <= 0) {
    return 0;
  }

  let discPaise = 0;
  if (discountType === 'PERCENT') {
    const pct = Math.min(100, Math.max(0, parseFloat(discountVal) || 0));
    discPaise = Math.round((gross * pct) / 100);
  } else if (discountType === 'FIXED') {
    discPaise = rupeesToPaise(discountVal);
  }

  return Math.min(gross, Math.max(0, discPaise));
}

/**
 * Computes cash roundoff to the nearest rupee (100 paise).
 * e.g., 14940 paise (₹149.40) -> roundoff: -40 paise
 * e.g., 14960 paise (₹149.60) -> roundoff: +40 paise
 * 
 * @param {number} totalPaise
 * @param {boolean} [asObject=false]
 * @returns {number|{ roundedTotalPaise: number, roundoffPaise: number }}
 */
export function calcRoundoff(totalPaise, asObject = false) {
  const t = parseInt(totalPaise, 10) || 0;
  const rem = t % 100;
  let roundoff = 0;

  if (rem !== 0) {
    if (rem >= 50) {
      roundoff = 100 - rem; // Round up
    } else {
      roundoff = -rem; // Round down
    }
  }

  if (asObject) {
    return {
      roundedTotalPaise: t + roundoff,
      roundoffPaise: roundoff
    };
  }

  return roundoff;
}

/**
 * Returns complete roundoff breakdown object.
 */
export function calcRoundoffBreakdown(totalPaise) {
  return calcRoundoff(totalPaise, true);
}
