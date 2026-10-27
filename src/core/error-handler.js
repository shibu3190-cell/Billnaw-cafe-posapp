/**
 * src/core/error-handler.js
 * Standardized Error Handling & Result Envelope for Billnaw Cafe POS.
 * Every asynchronous service operation returns a consistent ServiceResult<T>.
 */

/**
 * Creates a successful ServiceResult.
 * @template T
 * @param {T} data
 * @param {boolean} [offlineQueued=false]
 * @returns {{ data: T, error: null, offlineQueued: boolean }}
 */
export function successResult(data, offlineQueued = false) {
  return {
    data,
    error: null,
    offlineQueued: Boolean(offlineQueued)
  };
}

/**
 * Creates a failed ServiceResult.
 * @param {string} code - Error code (e.g. 'AUTH_UNAUTHORIZED')
 * @param {string} message - User-friendly message
 * @param {*} [details=null] - Optional debug metadata
 * @returns {{ data: null, error: { code: string, message: string, details: * }, offlineQueued: false }}
 */
export function errorResult(code, message, details = null) {
  return {
    data: null,
    error: {
      code,
      message,
      details
    },
    offlineQueued: false
  };
}

/**
 * Maps raw Firestore/network errors into human-friendly messages and codes.
 * @param {Error|*} err
 * @param {string} [context='operation']
 * @returns {{ code: string, message: string, details: * }}
 */
export function parseError(err, context = 'operation') {
  if (!err) {
    return { code: 'UNKNOWN_ERROR', message: `An unexpected issue occurred during ${context}.`, details: null };
  }

  const msg = err.message || String(err);
  const code = err.code || 'OPERATION_FAILED';

  // Firestore offline indicator
  if (code === 'failed-precondition' || msg.includes('offline') || code === 'unavailable') {
    return {
      code: 'OFFLINE_CACHE_ACTIVE',
      message: 'Running in offline counter mode. Changes saved locally and will sync once internet restores.',
      details: msg
    };
  }

  if (code === 'permission-denied' || msg.includes('permission-denied')) {
    return {
      code: 'AUTH_PERMISSION_DENIED',
      message: 'Access denied: You do not have permission to perform this cafe action.',
      details: msg
    };
  }

  if (code === 'not-found' || msg.includes('not-found')) {
    return {
      code: 'RECORD_NOT_FOUND',
      message: 'The requested document or record was not found.',
      details: msg
    };
  }

  return {
    code,
    message: msg,
    details: err.stack || null
  };
}

/**
 * Safe executor wrapping async tasks in standardized ServiceResult envelopes.
 * @template T
 * @param {() => Promise<T>} task
 * @param {string} [context='operation']
 * @returns {Promise<{ data: T|null, error: { code: string, message: string, details: * }|null, offlineQueued: boolean }>}
 */
export async function safeExecute(task, context = 'operation') {
  try {
    const data = await task();
    return successResult(data);
  } catch (err) {
    const parsed = parseError(err, context);
    console.warn(`[SafeExecute:${context}] Error:`, parsed.code, parsed.message);
    return {
      data: null,
      error: parsed,
      offlineQueued: parsed.code === 'OFFLINE_CACHE_ACTIVE'
    };
  }
}
