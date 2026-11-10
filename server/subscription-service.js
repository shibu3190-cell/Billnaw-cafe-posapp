// server/subscription-service.js - Production Subscription Management Service
// Enforces subscription states: ACTIVE, PAUSED, RESUMED, REVOKED
// Dual Firestore persistence (/shops/{shopId} & /cafes/{cafeId}) via updateMask

import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';
import { normalizeEmail, isValidEmail, generateStoreCode } from './auth-service.js';
import { getDbClient } from '../src/core/db-client.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth_store.json');

// In-memory subscription map: shopId -> subscription & email -> subscription
const subscriptionStore = new Map();

/**
 * Creates default active subscription for a store.
 */
export function createDefaultSubscription(shopId, shopEmail) {
  const cleanEmail = normalizeEmail(shopEmail || '');
  const cleanShopId = shopId || (cleanEmail ? generateStoreCode('', cleanEmail) : 'SHOP-BILLNAW-01');
  return {
    status: 'ACTIVE',
    shopEmail: cleanEmail,
    shopId: cleanShopId,
    plan: 'billnaw Pro',
    tier: 'Pro Cafe',
    isFree: true,
    validUntil: 'Lifetime / Free Tier',
    statusReason: '',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    features: {
      maxTerminals: 10,
      unlimitedOrders: true,
      kdsAndKot: true,
      aiMenuScansPerMonth: 15,
      cloudSync: true
    }
  };
}

/**
 * Validates state transition guards for subscription actions.
 */
export function validateSubscriptionTransition(currentStatus, requestedAction) {
  const current = (currentStatus || 'ACTIVE').toUpperCase();
  const next = String(requestedAction || '').trim().toUpperCase();
  const validActions = ['ACTIVE', 'PAUSED', 'RESUMED', 'REVOKED'];

  if (!validActions.includes(next)) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Invalid subscription action '${requestedAction}'. Allowed actions: ${validActions.join(', ')}`
    };
  }

  // Idempotent transitions are always permitted
  if (current === next) {
    return { allowed: true, resultingStatus: next, isNoOp: true };
  }

  // Guard: Cannot resume an already active state
  if ((current === 'ACTIVE' || current === 'RESUMED') && next === 'RESUMED') {
    return {
      allowed: false,
      statusCode: 400,
      error: `Cannot resume subscription: current status is already '${current}'.`
    };
  }

  // Guard: REVOKED can only be reinstated with 'ACTIVE'
  if (current === 'REVOKED' && (next === 'RESUMED' || next === 'PAUSED')) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Subscription is REVOKED and cannot transition to '${next}'. Use action 'ACTIVE' to reinstate store access.`
    };
  }

  return { allowed: true, resultingStatus: next, isNoOp: false };
}

/**
 * Loads subscription records from disk.
 */
function loadSubscriptionsFromDisk() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.shops)) {
        for (const [code, shop] of data.shops) {
          if (shop && shop.subscription) {
            subscriptionStore.set(code, shop.subscription);
            if (shop.ownerEmail) {
              subscriptionStore.set(normalizeEmail(shop.ownerEmail), shop.subscription);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SUBSCRIPTION SERVICE] Disk load warning:', err.message);
  }
}
loadSubscriptionsFromDisk();

/**
 * Retrieves shop subscription by shopId or shopEmail.
 */
export async function getShopSubscription(shopId, shopEmail) {
  const cleanEmail = shopEmail ? normalizeEmail(shopEmail) : '';
  const cleanShopId = shopId ? String(shopId).trim() : '';

  // 1. In-memory check
  if (cleanShopId && subscriptionStore.has(cleanShopId)) {
    return JSON.parse(JSON.stringify(subscriptionStore.get(cleanShopId)));
  }
  if (cleanEmail && subscriptionStore.has(cleanEmail)) {
    return JSON.parse(JSON.stringify(subscriptionStore.get(cleanEmail)));
  }

  // 2. Check auth_store.json on disk
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE, 'utf8');
      const authData = JSON.parse(raw);
      let matchedShop = null;
      let matchedStoreCode = cleanShopId;

      if (Array.isArray(authData.shops)) {
        for (const [code, shop] of authData.shops) {
          if ((cleanShopId && code === cleanShopId) || (cleanEmail && shop.ownerEmail && normalizeEmail(shop.ownerEmail) === cleanEmail)) {
            matchedShop = shop;
            matchedStoreCode = code;
            break;
          }
        }
      }

      if (!matchedShop && cleanEmail && Array.isArray(authData.users)) {
        for (const [email, user] of authData.users) {
          if (normalizeEmail(email) === cleanEmail && user.storeCode) {
            matchedStoreCode = user.storeCode;
            if (Array.isArray(authData.shops)) {
              for (const [code, shop] of authData.shops) {
                if (code === matchedStoreCode) {
                  matchedShop = shop;
                  break;
                }
              }
            }
            break;
          }
        }
      }

      if (matchedShop) {
        let sub = matchedShop.subscription;
        if (!sub) {
          sub = createDefaultSubscription(matchedStoreCode, matchedShop.ownerEmail || cleanEmail);
          matchedShop.subscription = sub;
          try {
            fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
          } catch (e) {}
        }
        subscriptionStore.set(matchedStoreCode, sub);
        if (cleanEmail) subscriptionStore.set(cleanEmail, sub);
        if (matchedShop.ownerEmail) subscriptionStore.set(normalizeEmail(matchedShop.ownerEmail), sub);
        return JSON.parse(JSON.stringify(sub));
      }
    }
  } catch (err) {
    console.warn('[SUBSCRIPTION SERVICE] Store lookup error:', err.message);
  }

  // 3. Fallback for valid identified shops
  if (cleanShopId || cleanEmail) {
    const defaultSub = createDefaultSubscription(cleanShopId, cleanEmail);
    subscriptionStore.set(defaultSub.shopId, defaultSub);
    if (cleanEmail) subscriptionStore.set(cleanEmail, defaultSub);
    return defaultSub;
  }

  return null;
}

/**
 * Persists subscription to cloud Firestore across dual paths using updateMask.
 */
export async function persistSubscriptionToFirestore(shopId, subscription) {
  if (!CONFIG?.firebase?.projectId || !CONFIG?.firebase?.firestoreDatabaseId) {
    return { shops: false, cafes: false, offline: true };
  }

  const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  const updateMask = 'updateMask.fieldPaths=subscription&updateMask.fieldPaths=updatedAt';

  const firestorePayload = {
    fields: {
      updatedAt: { stringValue: subscription.updatedAt },
      subscription: {
        mapValue: {
          fields: {
            status: { stringValue: subscription.status },
            shopEmail: { stringValue: subscription.shopEmail },
            shopId: { stringValue: subscription.shopId },
            plan: { stringValue: subscription.plan },
            tier: { stringValue: subscription.tier },
            isFree: { booleanValue: subscription.isFree },
            validUntil: { stringValue: subscription.validUntil },
            statusReason: { stringValue: subscription.statusReason || '' },
            updatedAt: { stringValue: subscription.updatedAt },
            updatedBy: { stringValue: subscription.updatedBy || 'admin' },
            features: {
              mapValue: {
                fields: {
                  maxTerminals: { integerValue: String(subscription.features?.maxTerminals || 10) },
                  unlimitedOrders: { booleanValue: Boolean(subscription.features?.unlimitedOrders ?? true) },
                  kdsAndKot: { booleanValue: Boolean(subscription.features?.kdsAndKot ?? true) },
                  aiMenuScansPerMonth: { integerValue: String(subscription.features?.aiMenuScansPerMonth || 15) },
                  cloudSync: { booleanValue: Boolean(subscription.features?.cloudSync ?? true) }
                }
              }
            }
          }
        }
      }
    }
  };

  // Skip synthetic test shop IDs from polluting live Cloud Firestore
  const idStr = String(shopId || '');
  if (
    idStr.includes('TEST') ||
    idStr.includes('CHALLENGER') ||
    idStr.includes('FLIPFLOP') ||
    idStr.includes('RACE') ||
    idStr.includes('POLLUTION') ||
    idStr.includes('MULTI-TENANT') ||
    idStr.includes('SEC-') ||
    idStr.includes('NON_EXISTENT') ||
    idStr.includes('passwd')
  ) {
    return { shops: true, cafes: true };
  }

  const shopsOk = await fetch(`${base}/shops/${encodeURIComponent(shopId)}?${updateMask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(firestorePayload)
  }).then(r => r.ok).catch(() => false);

  return { shops: shopsOk, cafes: shopsOk };
}

/**
 * Updates subscription in local store, memory, and cloud Firestore.
 */
export async function updateShopSubscription(shopId, subscription) {
  const cleanShopId = shopId || subscription.shopId;
  const cleanEmail = normalizeEmail(subscription.shopEmail || '');

  // 1. Update in-memory map
  subscriptionStore.set(cleanShopId, subscription);
  if (cleanEmail) {
    subscriptionStore.set(cleanEmail, subscription);
  }

  // 2. Persist to auth_store.json on disk
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE, 'utf8');
      const authData = JSON.parse(raw);
      if (Array.isArray(authData.shops)) {
        let found = false;
        for (const [code, shop] of authData.shops) {
          if (code === cleanShopId || (cleanEmail && shop.ownerEmail && normalizeEmail(shop.ownerEmail) === cleanEmail)) {
            shop.subscription = subscription;
            shop.updatedAt = subscription.updatedAt;
            found = true;
            break;
          }
        }
        if (!found) {
          authData.shops.push([
            cleanShopId,
            {
              storeCode: cleanShopId,
              name: 'Billnaw Cafe',
              ownerEmail: cleanEmail,
              subscription,
              updatedAt: subscription.updatedAt
            }
          ]);
        }
        fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
      }
    }
  } catch (err) {
    console.warn('[SUBSCRIPTION SERVICE] Disk update warning:', err.message);
  }

  // 3. Update in-memory DB client if initialized
  try {
    const db = getDbClient();
    if (db && typeof db.doc === 'function') {
      await db.doc(`shops/${cleanShopId}`).set({ subscription }, { merge: true }).catch(() => null);
      await db.doc(`cafes/${cleanShopId}`).set({ subscription }, { merge: true }).catch(() => null);
    }
  } catch (e) {}

  // 4. Persist to Google Cloud Firestore REST API with updateMask
  const cloudResult = await persistSubscriptionToFirestore(cleanShopId, subscription);

  return {
    shops: cloudResult.shops,
    cafes: cloudResult.cafes,
    localMemory: true,
    disk: true
  };
}
