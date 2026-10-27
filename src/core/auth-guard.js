/**
 * src/core/auth-guard.js
 * Terminal Authentication Guard & Session Lifecycle Manager.
 * Ensures the POS device is bound to an authenticated cafe shop via 6-digit Email OTP.
 */

import { getActiveCafeId, setActiveCafeId } from './config.js';
import { successResult, errorResult } from './error-handler.js';

/**
 * Checks if the terminal currently has an active shop session.
 * @returns {boolean}
 */
export function isTerminalAuthenticated() {
  const token = localStorage.getItem('billnaw_auth_token');
  const session = localStorage.getItem('billnaw_shop_session');
  const authMode = localStorage.getItem('billnaw_auth_mode');

  return Boolean(token && session && authMode === 'authenticated');
}

/**
 * Retrieves the active shop session payload.
 * @returns {Object|null}
 */
export function getTerminalSession() {
  try {
    const raw = localStorage.getItem('billnaw_shop_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Enforces authentication. If unauthenticated, displays the shop auth modal or redirects.
 * @param {Function} [showAuthModalFn] - Callback to trigger shop auth modal
 * @returns {boolean}
 */
export function requireTerminalAuth(showAuthModalFn) {
  if (isTerminalAuthenticated()) {
    const session = getTerminalSession();
    if (session && session.storeCode) {
      setActiveCafeId(session.storeCode);
    }
    return true;
  }

  if (typeof showAuthModalFn === 'function') {
    showAuthModalFn(true);
  } else if (typeof window !== 'undefined' && window.location) {
    if (!window.location.search.includes('auth=login')) {
      const url = new URL(window.location.href);
      url.searchParams.set('auth', 'login');
      window.location.replace(url.toString());
    }
  }

  return false;
}

/**
 * Signs the terminal out of the cloud shop, revokes local session, and purges sensitive tenant data.
 * @returns {Promise<void>}
 */
export async function terminateTerminalSession() {
  const activeToken = localStorage.getItem('billnaw_auth_token');
  const activeEmail = localStorage.getItem('billnaw_auth_email');

  // Notify backend of session termination
  try {
    if (typeof fetch === 'function') {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
        },
        body: JSON.stringify({ token: activeToken, email: activeEmail })
      });
    }
  } catch (e) {
    // Network offline: proceed with local clearance
  }

  // Purge tenant localStorage
  localStorage.removeItem('billnaw_auth_token');
  localStorage.removeItem('billnaw_shop_session');
  localStorage.removeItem('billnaw_auth_mode');
  localStorage.removeItem('billnaw_auth_email');
  localStorage.removeItem('billnaw_auth_phone');
  localStorage.removeItem('billnaw_store_code');
  localStorage.removeItem('billnaw_active_user');

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }

  // Redirect to login view
  if (typeof window !== 'undefined' && window.location) {
    window.location.replace(window.location.origin + window.location.pathname + '?auth=login');
  }
}
