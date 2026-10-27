/**
 * src/core/rbac.js
 * Role-Based Access Control & Cryptographic PIN Hashing for Billnaw Cafe POS.
 * Enforces Salted SHA-256 for all Cashier & Manager PINs (Zero plain text or MD5).
 */

import { successResult, errorResult } from './error-handler.js';

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER'
};

export const PERMISSIONS = {
  TAKE_ORDERS: 'can_take_orders',
  SETTLE_BILLS: 'can_settle_bills',
  APPLY_DISCOUNT: 'can_apply_discount',
  VOID_INVOICE: 'can_void_invoice',
  MANAGE_MENU: 'can_manage_menu',
  VIEW_REPORTS: 'can_view_reports',
  VIEW_EXPENSES: 'can_view_expenses',
  CHANGE_SETTINGS: 'can_change_settings'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.MANAGER]: [
    PERMISSIONS.TAKE_ORDERS,
    PERMISSIONS.SETTLE_BILLS,
    PERMISSIONS.APPLY_DISCOUNT,
    PERMISSIONS.VOID_INVOICE,
    PERMISSIONS.MANAGE_MENU,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_EXPENSES
  ],
  [ROLES.CASHIER]: [
    PERMISSIONS.TAKE_ORDERS,
    PERMISSIONS.SETTLE_BILLS
  ],
  [ROLES.WAITER]: [
    PERMISSIONS.TAKE_ORDERS
  ]
};

/**
 * Computes a salted SHA-256 hash of a 4-digit PIN.
 * Uses Web Crypto API in browser/native environments with fallback.
 * @param {string} pin - 4-digit string
 * @param {string} [salt] - Hex string salt
 * @returns {Promise<string|{pinHash: string, salt: string}>}
 */
export async function hashPin(pin, salt) {
  const cleanPin = String(pin).trim();
  const actualSalt = salt !== undefined ? String(salt).trim() : generatePinSalt();
  const cleanSalt = actualSalt;
  const data = new TextEncoder().encode(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`);

  let hashHex = '';
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Pure JS SHA-256 fallback for testing / legacy environments
    const nodeCrypto = await import('crypto').catch(() => null);
    if (nodeCrypto && nodeCrypto.createHash) {
      hashHex = nodeCrypto.createHash('sha256').update(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`).digest('hex');
    } else {
      throw new Error('No cryptographic library available for PIN hashing.');
    }
  }

  if (salt === undefined) {
    return { pinHash: hashHex, salt: actualSalt };
  }
  return hashHex;
}

/**
 * Generates a random cryptographic salt.
 * @returns {string} 32-character hex string
 */
export function generatePinSalt() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback salt generator
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, () => {
    return ((Math.random() * 16) | 0).toString(16);
  });
}

/**
 * Verifies an entered PIN against a stored salt and SHA-256 hash in constant time.
 * @param {string} enteredPin
 * @param {string} salt
 * @param {string} expectedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPin(enteredPin, salt, expectedHash) {
  if (!enteredPin || !salt || !expectedHash) return false;
  const computedHash = await hashPin(enteredPin, salt);
  return timingSafeEqual(computedHash, expectedHash);
}

/**
 * Verifies staff member's credentials using their stored pin_hash and pin_salt.
 * @param {Object} staff
 * @param {string} enteredPin
 * @returns {Promise<boolean>}
 */
export async function verifyStaffPin(staff, enteredPin) {
  if (!staff) return false;
  const hash = staff.pin_hash || staff.hash;
  const salt = staff.pin_salt || staff.salt || '';
  if (!hash) return false;
  return verifyPin(enteredPin, salt, hash);
}

/**
 * Constant-time string equality to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validates whether a user role has the required operational permission.
 * @param {Object} user - { role: string }
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(user, permission) {
  if (!user || !user.role) return false;
  const role = user.role.toUpperCase();
  const allowedPermissions = ROLE_PERMISSIONS[role] || [];
  return allowedPermissions.includes(permission);
}

/**
 * Authenticates a staff member using 4-digit PIN against an array of staff profiles.
 * @param {string} enteredPin
 * @param {Array<Object>} staffList
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function authenticateStaffPin(enteredPin, staffList = []) {
  if (!enteredPin || String(enteredPin).trim().length !== 4) {
    return errorResult('AUTH_INVALID_FORMAT', 'PIN must be exactly 4 digits.');
  }

  for (const staff of staffList) {
    if (staff.status === 'INACTIVE') continue;
    const isMatch = await verifyPin(enteredPin, staff.pin_salt, staff.pin_hash);
    if (isMatch) {
      return successResult({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        authenticated_at: new Date().toISOString()
      });
    }
  }

  return errorResult('AUTH_INVALID_PIN', 'Invalid PIN. Access denied.');
}
