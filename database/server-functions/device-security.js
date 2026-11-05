/**
 * database/server-functions/device-security.js
 * 
 * Strict Hardware Device-Locking Security Mechanism for POS SaaS.
 * Enforces a strict quota on physical devices: a single device can only be used
 * by a maximum of 2 distinct email accounts (configurable up to 5).
 * 
 * Server-enforced via Cloud Firestore Transactions to prevent race conditions.
 * Immune to client-side storage clears, private browsing/incognito, or app uninstalls.
 */

import crypto from 'crypto';

/**
 * Standard Firebase Cloud Functions HttpsError class compatibility.
 * Mirrors the behavior of @firebase/functions / firebase-functions/v2/https.
 */
export class HttpsError extends Error {
  /**
   * @param {'invalid-argument'|'permission-denied'|'not-found'|'already-exists'|'internal'|'unauthenticated'} code
   * @param {string} message
   * @param {any} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'HttpsError';
    this.code = code;
    this.details = details;
    this.httpErrorCode = getHttpEquivalentCode(code);
  }
}

function getHttpEquivalentCode(code) {
  switch (code) {
    case 'invalid-argument': return 400;
    case 'unauthenticated': return 401;
    case 'permission-denied': return 403;
    case 'not-found': return 404;
    case 'already-exists': return 409;
    default: return 500;
  }
}

export const MAX_ALLOWED_ACCOUNTS_PER_DEVICE = 2;
const HMAC_SECRET = process.env.DEVICE_TOKEN_SECRET || 'billnaw_pos_device_attestation_hmac_secret_2026';

/**
 * Normalizes email address for strict comparisons.
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Validates hardware device ID string.
 * Must be 16-128 chars, alphanumeric with allowed safe punctuation (_ - . :)
 * @param {string} deviceId
 * @returns {boolean}
 */
export function isValidDeviceId(deviceId) {
  if (typeof deviceId !== 'string') return false;
  const clean = deviceId.trim();
  if (clean.length < 16 || clean.length > 128) return false;
  return /^[a-zA-Z0-9_\-.:]+$/.test(clean);
}

/**
 * Validates standard email address syntax.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const norm = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm);
}

/**
 * Generates a tamper-proof cryptographic confirmation token
 * for client verification after device clearance.
 * @param {string} deviceId
 * @param {string} email
 * @param {number} timestamp
 * @returns {string}
 */
export function generateDeviceVerificationToken(deviceId, email, timestamp) {
  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(`${deviceId}:${email}:${timestamp}`)
    .digest('hex');
}

/**
 * Core business logic for validating hardware device authorization and registration.
 * Executes inside an atomic Firestore Transaction to prevent concurrent race conditions.
 * 
 * @param {Object} params
 * @param {Object} params.db - Firestore instance (Admin SDK or UniversalDbClient)
 * @param {string} params.email - Raw email from client
 * @param {string} params.deviceId - Hardware-derived device ID
 * @param {Object} [params.metadata] - Optional client metadata (platform, IP, userAgent)
 * @param {number} [params.maxAccounts] - Max accounts allowed (defaults to 2)
 * @returns {Promise<Object>} Success confirmation object
 * @throws {HttpsError}
 */
export async function executeValidateDeviceAndLogin({
  db,
  email,
  deviceId,
  metadata = {},
  maxAccounts = MAX_ALLOWED_ACCOUNTS_PER_DEVICE
}) {
  // 1. Untrusted Client Parameter Sanitization & Strict Validation
  if (!email || !isValidEmail(email)) {
    throw new HttpsError(
      'invalid-argument',
      'A valid email address is required.'
    );
  }

  if (!deviceId || !isValidDeviceId(deviceId)) {
    throw new HttpsError(
      'invalid-argument',
      'A valid hardware device identifier is required (16-128 alphanumeric characters).'
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const cleanDeviceId = String(deviceId).trim();
  const maxLimit = Number(maxAccounts) > 0 ? Number(maxAccounts) : MAX_ALLOWED_ACCOUNTS_PER_DEVICE;

  if (!db || typeof db.collection !== 'function') {
    throw new HttpsError('internal', 'Database client is not configured or unavailable.');
  }

  const deviceRef = db.collection('devices').doc(cleanDeviceId);

  // 2. Atomic Firestore Transaction Execution
  const transactionResult = await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(deviceRef);
    const nowTimestamp = (typeof db.serverTimestamp === 'function') 
      ? db.serverTimestamp() 
      : (typeof db.Timestamp?.now === 'function' ? db.Timestamp.now() : new Date());

    // 3. Document DOES NOT EXIST: Create it and register first email
    if (!docSnap.exists) {
      const initialDoc = {
        associatedEmails: [normalizedEmail],
        registeredAt: nowTimestamp,
        lastActive: nowTimestamp,
        deviceMetadata: {
          platform: String(metadata.platform || 'unknown').slice(0, 50),
          createdIp: String(metadata.ip || 'unknown').slice(0, 45),
          userAgent: String(metadata.userAgent || 'unknown').slice(0, 200)
        }
      };

      if (typeof transaction.set === 'function') {
        await transaction.set(deviceRef, initialDoc);
      } else {
        await deviceRef.set(initialDoc);
      }

      return {
        action: 'REGISTERED',
        associatedEmails: [normalizedEmail],
        count: 1
      };
    }

    // 4. Document EXISTS: Inspect associated emails
    const data = docSnap.data() || {};
    const associatedEmails = Array.isArray(data.associatedEmails)
      ? data.associatedEmails.map(normalizeEmail)
      : [];

    // 4A. Incoming email is ALREADY associated -> Allow login and bump lastActive
    if (associatedEmails.includes(normalizedEmail)) {
      const updateData = { lastActive: nowTimestamp };
      if (typeof transaction.update === 'function') {
        await transaction.update(deviceRef, updateData);
      } else {
        await deviceRef.update(updateData);
      }

      return {
        action: 'EXISTING_ACCOUNT',
        associatedEmails,
        count: associatedEmails.length
      };
    }

    // 4B. Incoming email is NEW and quota has room (length < maxLimit) -> Append email
    if (associatedEmails.length < maxLimit) {
      const updatedList = [...associatedEmails, normalizedEmail];
      const updateData = {
        associatedEmails: (typeof db.arrayUnion === 'function') 
          ? db.arrayUnion(normalizedEmail) 
          : updatedList,
        lastActive: nowTimestamp
      };

      if (typeof transaction.update === 'function') {
        await transaction.update(deviceRef, updateData);
      } else {
        await deviceRef.update(updateData);
      }

      return {
        action: 'NEW_ACCOUNT_LINKED',
        associatedEmails: updatedList,
        count: updatedList.length
      };
    }

    // 4C. Device quota reached (length >= maxLimit) -> THROW STRICT PERMISSION DENIED
    throw new HttpsError(
      'permission-denied',
      'Device registration limit reached. This device is already linked to two other accounts.',
      {
        deviceId: cleanDeviceId,
        registeredCount: associatedEmails.length,
        maxLimit
      }
    );
  });

  // 5. Successful Clearance Token Generation
  const timestamp = Date.now();
  const verificationToken = generateDeviceVerificationToken(cleanDeviceId, normalizedEmail, timestamp);

  return {
    success: true,
    allowed: true,
    deviceId: cleanDeviceId,
    email: normalizedEmail,
    action: transactionResult.action,
    associatedAccountsCount: transactionResult.count,
    maxAllowedAccounts: maxLimit,
    timestamp,
    deviceVerificationToken: verificationToken
  };
}

/**
 * Production Firebase Cloud Functions Callable Handler (v2 / v1 compatible).
 * 
 * Usage in index.js:
 * export const validateDeviceAndLogin = onCall({ cors: true }, validateDeviceAndLoginCallable);
 */
export async function validateDeviceAndLoginCallable(requestOrData, context) {
  // Support both Cloud Functions v2 (request.data) and v1 (data, context)
  const isV2 = requestOrData && typeof requestOrData === 'object' && 'data' in requestOrData;
  const payload = isV2 ? requestOrData.data : requestOrData;
  const reqContext = isV2 ? requestOrData : context;

  const { email, deviceId } = payload || {};

  // Dynamically resolve admin.firestore() in live Cloud Functions environment
  let db;
  try {
    const admin = await import('firebase-admin');
    db = admin.firestore();
  } catch (err) {
    // Fallback to internal UniversalDbClient if run in test or lightweight runner
    const { getDbClient } = await import('../../src/core/db-client.js');
    db = getDbClient();
  }

  const metadata = {
    platform: payload?.platform || reqContext?.rawRequest?.headers?.['sec-ch-ua-platform'] || 'unknown',
    ip: reqContext?.rawRequest?.ip || reqContext?.rawRequest?.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: reqContext?.rawRequest?.headers?.['user-agent'] || 'unknown'
  };

  return await executeValidateDeviceAndLogin({
    db,
    email,
    deviceId,
    metadata
  });
}
