/**
 * src/features/customers/customers.service.js
 * Customer Relationship Management, 3-Tier Loyalty & Khata Debt Ledger for Billnaw Cafe POS.
 * Handles customer profiles, automatic loyalty tier progression, and credit/debit balances.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';
import { paiseToRupees } from '../../shared/utils/currency.js';

export const LOYALTY_TIERS = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold'
};

/**
 * Determine loyalty tier based on total visit count.
 * @param {number} visits 
 * @returns {'Bronze'|'Silver'|'Gold'}
 */
export function calculateLoyaltyTier(visits = 0) {
  if (visits >= 10) return LOYALTY_TIERS.GOLD;
  if (visits >= 5) return LOYALTY_TIERS.SILVER;
  return LOYALTY_TIERS.BRONZE;
}

/**
 * Fetch all cafe customers with loyalty tiers and Khata status.
 * @param {string} [tierFilter='All']
 * @returns {Promise<{ data: Array<Object>, error: string|null, offlineQueued: boolean }>}
 */
export async function getCustomers(tierFilter = 'All') {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.collection(`cafes/${cafeId}/customers`).get();

    let customers = [];
    if (!snap.empty) {
      snap.forEach(doc => {
        const d = doc.data();
        const visits = d.total_visits || 0;
        const tier = calculateLoyaltyTier(visits);
        customers.push({
          id: doc.id,
          ...d,
          tier,
          khata_balance_rupees: paiseToRupees(d.khata_balance_paise || 0),
          total_spent_rupees: paiseToRupees(d.total_spent_paise || 0)
        });
      });
    } else {
      // Local fallback
      customers = getDefaultCustomers();
    }

    if (tierFilter && tierFilter !== 'All') {
      customers = customers.filter(c => c.tier?.toLowerCase() === tierFilter.toLowerCase());
    }

    return customers;
  });
}

/**
 * Fetch a single customer by phone number.
 * @param {string} phone 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function getCustomerByPhone(phone) {
  return safeExecute(async () => {
    if (!phone) return null;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.doc(`cafes/${cafeId}/customers/${cleanPhone}`).get();

    if (!snap.exists) return null;
    const d = snap.data();
    return {
      phone: cleanPhone,
      ...d,
      tier: calculateLoyaltyTier(d.total_visits || 0),
      khata_balance_rupees: paiseToRupees(d.khata_balance_paise || 0),
      total_spent_rupees: paiseToRupees(d.total_spent_paise || 0)
    };
  });
}

/**
 * Record a partial or full payment towards Khata balance.
 * @param {string} phone 
 * @param {number} amountPaise 
 * @param {string} [paymentMode='CASH'] 
 * @param {string} [staffId='staff'] 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function recordKhataPayment(phone, amountPaise, paymentMode = 'CASH', staffId = 'staff') {
  return safeExecute(async () => {
    if (!phone) throw new Error('Customer phone number is required.');
    if (!amountPaise || amountPaise <= 0) throw new Error('Payment amount must be greater than zero.');

    const cleanPhone = String(phone).replace(/\D/g, '');
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const now = new Date().toISOString();

    const batch = db.createBatch();

    // 1. Decrement Khata balance
    const custRef = db.doc(`cafes/${cafeId}/customers/${cleanPhone}`);
    batch.update(custRef, {
      khata_balance_paise: db.increment(-Number(amountPaise)),
      updated_at: now
    });

    // 2. Append transaction to Khata payments ledger
    const pmtId = `kpmt_${Date.now()}`;
    const pmtRef = db.doc(`cafes/${cafeId}/khata_payments/${pmtId}`);
    batch.set(pmtRef, {
      id: pmtId,
      phone: cleanPhone,
      amount_paise: Number(amountPaise),
      amount_rupees: paiseToRupees(amountPaise),
      payment_mode: paymentMode,
      staff_id: staffId,
      paid_at: now
    });

    await batch.commit();
    return { phone: cleanPhone, paid_amount_paise: amountPaise, pmtId };
  });
}

function getDefaultCustomers() {
  return [
    {
      phone: '9876543210',
      name: 'Rahul Sharma',
      total_visits: 6,
      tier: 'Silver',
      total_spent_paise: 245000,
      total_spent_rupees: 2450,
      khata_balance_paise: 0,
      khata_balance_rupees: 0
    },
    {
      phone: '9811223344',
      name: 'Priya Patel',
      total_visits: 12,
      tier: 'Gold',
      total_spent_paise: 580000,
      total_spent_rupees: 5800,
      khata_balance_paise: 35000,
      khata_balance_rupees: 350
    }
  ];
}
