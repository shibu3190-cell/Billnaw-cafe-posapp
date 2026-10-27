/**
 * src/features/settings/settings.service.js
 * Store Profile, Tax Configuration & Hardware Peripherals Service for Billnaw Cafe POS.
 */

import { safeExecute } from '../../core/error-handler.js';
import { getDbClient } from '../../core/db-client.js';
import { getTenantCafeId } from '../../core/config.js';

/**
 * Fetch cafe profile and configuration.
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function getCafeSettings() {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const snap = await db.doc(`cafes/${cafeId}/settings/general`).get();

    if (snap.exists) {
      return snap.data();
    }

    // Default settings
    return getDefaultSettings();
  });
}

/**
 * Save cafe profile and tax settings.
 * @param {Object} settingsData 
 * @returns {Promise<{ data: Object|null, error: string|null, offlineQueued: boolean }>}
 */
export async function saveCafeSettings(settingsData) {
  return safeExecute(async () => {
    const cafeId = getTenantCafeId();
    const db = getDbClient();
    const settingsRef = db.doc(`cafes/${cafeId}/settings/general`);

    const payload = {
      ...settingsData,
      updated_at: new Date().toISOString()
    };

    await settingsRef.set(payload, { merge: true });

    // Mirror to localStorage in local dev mode
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('pos_settings', JSON.stringify(payload));
      } catch (e) {}
    }

    return payload;
  });
}

function getDefaultSettings() {
  return {
    name: 'Billnaw Cafe',
    tagline: 'Artisan Coffee & Good Food',
    phone: '9876543210',
    email: 'contact@billnawcafe.com',
    address: '123 Gourmet Lane, Bangalore, KA 560001',
    gstin: '29ABCDE1234F1Z5',
    fssai: '11223344556677',
    is_tax_inclusive: true,
    default_gst_rate: 5,
    roundoff_enabled: true,
    printer_type: 'SYSTEM_DIALOG',
    paper_width: '58mm'
  };
}
