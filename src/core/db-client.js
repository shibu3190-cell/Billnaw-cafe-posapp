/**
 * src/core/db-client.js
 * Universal Firestore Database Client with persistentLocalCache & Multi-Tenant Scoping.
 * Guarantees zero direct Firestore access from UI layers.
 */

import { getActiveCafeId, getFirebaseClientConfig } from './config.js';
import { successResult, errorResult, safeExecute } from './error-handler.js';

let firestoreInstance = null;
let firebaseAppInstance = null;
let isInitialized = false;

// Universal in-memory fallback store for offline tests and headless environments
class UniversalDbClient {
  constructor() {
    this.memoryStore = new Map();
    this.listeners = new Map();
  }

  notifyListeners(changedPath) {
    for (const [subPath, callbacks] of this.listeners.entries()) {
      if (changedPath === subPath || changedPath.startsWith(subPath + '/') || subPath.startsWith(changedPath + '/')) {
        callbacks.forEach(cb => {
          try { cb(); } catch (e) {}
        });
      }
    }
  }

  doc(docPath) {
    const self = this;
    return {
      path: docPath,
      async get() {
        const val = self.memoryStore.get(docPath);
        return {
          exists: val !== undefined,
          id: docPath.split('/').pop(),
          data: () => (val ? JSON.parse(JSON.stringify(val)) : null)
        };
      },
      async set(data, options = {}) {
        if (options.merge && self.memoryStore.has(docPath)) {
          const prev = self.memoryStore.get(docPath) || {};
          self.memoryStore.set(docPath, { ...prev, ...data });
        } else {
          self.memoryStore.set(docPath, { ...data });
        }
        self.notifyListeners(docPath);
        return { id: docPath.split('/').pop() };
      },
      async update(updates) {
        const prev = self.memoryStore.get(docPath) || {};
        const merged = { ...prev };
        for (const [k, v] of Object.entries(updates)) {
          if (v && v.__type === 'INCREMENT') {
            merged[k] = (Number(merged[k]) || 0) + v.value;
          } else if (v && v.__type === 'ARRAY_UNION') {
            const arr = Array.isArray(merged[k]) ? [...merged[k]] : [];
            v.values.forEach(item => { if (!arr.includes(item)) arr.push(item); });
            merged[k] = arr;
          } else {
            merged[k] = v;
          }
        }
        self.memoryStore.set(docPath, merged);
        self.notifyListeners(docPath);
        return { id: docPath.split('/').pop() };
      },
      onSnapshot(onNext, onError) {
        const emit = async () => {
          try {
            const snap = await self.doc(docPath).get();
            if (typeof onNext === 'function') onNext(snap);
          } catch (err) {
            if (typeof onError === 'function') onError(err);
          }
        };
        emit();
        if (!self.listeners.has(docPath)) {
          self.listeners.set(docPath, new Set());
        }
        self.listeners.get(docPath).add(emit);
        return () => {
          const set = self.listeners.get(docPath);
          if (set) {
            set.delete(emit);
            if (set.size === 0) {
              self.listeners.delete(docPath);
            }
          }
        };
      }
    };
  }

  collection(colPath) {
    const self = this;
    return {
      path: colPath,
      async get() {
        const prefix = colPath.endsWith('/') ? colPath : `${colPath}/`;
        const docs = [];
        for (const [key, val] of self.memoryStore.entries()) {
          if (key.startsWith(prefix)) {
            const rest = key.slice(prefix.length);
            if (!rest.includes('/')) {
              docs.push({
                id: rest,
                data: () => JSON.parse(JSON.stringify(val))
              });
            }
          }
        }
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach(cb) { docs.forEach(cb); }
        };
      },
      onSnapshot(onNext, onError) {
        const emit = async () => {
          try {
            const snap = await self.collection(colPath).get();
            if (typeof onNext === 'function') onNext(snap);
          } catch (err) {
            if (typeof onError === 'function') onError(err);
          }
        };
        emit();
        if (!self.listeners.has(colPath)) {
          self.listeners.set(colPath, new Set());
        }
        self.listeners.get(colPath).add(emit);
        return () => {
          const set = self.listeners.get(colPath);
          if (set) {
            set.delete(emit);
            if (set.size === 0) {
              self.listeners.delete(colPath);
            }
          }
        };
      }
    };
  }

  createBatch() {
    const self = this;
    const operations = [];
    return {
      set(docRef, data, options) {
        operations.push({ type: 'set', docRef, data, options });
      },
      update(docRef, data) {
        operations.push({ type: 'update', docRef, data });
      },
      delete(docRef) {
        operations.push({ type: 'delete', docRef });
      },
      async commit() {
        for (const op of operations) {
          if (op.type === 'set') {
            await op.docRef.set(op.data, op.options);
          } else if (op.type === 'update') {
            await op.docRef.update(op.data);
          }
        }
        return true;
      }
    };
  }

  increment(n) {
    return { __type: 'INCREMENT', value: Number(n) };
  }

  arrayUnion(...items) {
    return { __type: 'ARRAY_UNION', values: items };
  }

  async runTransaction(updateFn) {
    const txn = {
      async get(docRef) {
        return await docRef.get();
      },
      set(docRef, data, options = {}) {
        return docRef.set(data, options);
      },
      update(docRef, data) {
        return docRef.update(data);
      },
      delete(docRef) {
        return docRef.delete ? docRef.delete() : null;
      }
    };
    return await updateFn(txn);
  }
}

const universalClient = new UniversalDbClient();

/**
 * Returns the universal DB client instance.
 * @returns {UniversalDbClient}
 */
export function getDbClient() {
  return universalClient;
}

/**
 * Initializes Firebase App and Firestore with IndexedDB persistentLocalCache.
 * Supports multi-tab caching and offline mutations.
 * @returns {Promise<Object>} Firestore database instance
 */
export async function initDatabase() {
  if (isInitialized && firestoreInstance) {
    return firestoreInstance;
  }

  if (typeof window === 'undefined') {
    return universalClient;
  }

  const config = await getFirebaseClientConfig();

  // Load Firebase modular SDK dynamically or from window if preloaded
  let initializeApp = window.initializeApp;
  let getFirestore = window.getFirestore;
  let initializeFirestore = window.initializeFirestore;
  let persistentLocalCache = window.persistentLocalCache;
  let persistentMultipleTabManager = window.persistentMultipleTabManager;

  if (!initializeApp || !getFirestore) {
    try {
      const appModule = await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js');
      const firestoreModule = await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
      initializeApp = appModule.initializeApp;
      getFirestore = firestoreModule.getFirestore;
      initializeFirestore = firestoreModule.initializeFirestore;
      persistentLocalCache = firestoreModule.persistentLocalCache;
      persistentMultipleTabManager = firestoreModule.persistentMultipleTabManager;
    } catch (e) {
      console.warn('[DBClient] Modular Firebase SDK loading fallback:', e);
    }
  }

  if (!initializeApp) {
    return universalClient;
  }

  firebaseAppInstance = initializeApp(config);

  // Initialize Firestore with robust multi-tab persistent local cache
  try {
    if (initializeFirestore && persistentLocalCache) {
      firestoreInstance = initializeFirestore(firebaseAppInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager ? persistentMultipleTabManager() : undefined
        })
      }, config.firestoreDatabaseId || undefined);
      console.log('[DBClient] Initialized Firestore with multi-tab persistentLocalCache.');
    } else {
      firestoreInstance = getFirestore(firebaseAppInstance, config.firestoreDatabaseId || undefined);
      console.log('[DBClient] Initialized default Firestore instance.');
    }
  } catch (err) {
    console.warn('[DBClient] Falling back to standard getFirestore:', err.message);
    firestoreInstance = getFirestore(firebaseAppInstance);
  }

  window.__billnawFirestore = firestoreInstance;
  isInitialized = true;
  return firestoreInstance;
}

/**
 * Resolves the Firestore instance, initializing if needed.
 * @returns {Promise<Object>}
 */
export async function getDb() {
  if (!firestoreInstance) {
    await initDatabase();
  }
  return firestoreInstance || universalClient;
}

/**
 * Resolves root collection name ('cafes', 'shops', or 'clients') based on identifier.
 * @param {string} tenantId
 * @returns {'cafes' | 'shops' | 'clients'}
 */
export function resolveTenantRoot(tenantId) {
  if (tenantId === '') return 'cafes';
  if (!tenantId || typeof tenantId !== 'string') return 'shops';
  if (/^\s/.test(tenantId)) return 'shops';
  const clean = tenantId.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (clean.startsWith('shop-') || clean.startsWith('shop_')) {
    return 'shops';
  }
  if (clean.startsWith('client-') || clean === 'bongbhoj-terminal') {
    return 'clients';
  }
  if (clean.startsWith('cafe-') || clean.startsWith('cafe_')) {
    return 'cafes';
  }
  return 'shops';
}

/**
 * Returns tenant collection path supporting dual-path compatibility:
 * cafes/{cafeId}/{subcollection} or shops/{shopId}/{subcollection}
 * If no subcollection is provided, returns root tenant document path.
 * @param {string} [subcollection]
 * @param {string} [cafeId]
 * @param {string} [forcedRoot] - optional override ('cafes' | 'shops' | 'clients')
 * @returns {string}
 */
export function getTenantPath(subcollection, cafeId, forcedRoot) {
  const activeCafe = (cafeId || getActiveCafeId() || '').trim().replace(/^\/+|\/+$/g, '');
  const cleanSub = (subcollection || '').trim().replace(/^\/+|\/+$/g, '');
  const root = forcedRoot || resolveTenantRoot(activeCafe);
  return cleanSub ? `${root}/${activeCafe}/${cleanSub}` : `${root}/${activeCafe}`;
}

/**
 * Returns path explicitly under /shops/{shopId}/{subcollection}
 * @param {string} [subcollection]
 * @param {string} [shopId]
 * @returns {string}
 */
export function getShopPath(subcollection, shopId) {
  return getTenantPath(subcollection, shopId, 'shops');
}

/**
 * Returns path explicitly under /cafes/{cafeId}/{subcollection}
 * @param {string} [subcollection]
 * @param {string} [cafeId]
 * @returns {string}
 */
export function getCafePath(subcollection, cafeId) {
  return getTenantPath(subcollection, cafeId, 'cafes');
}

/**
 * Subscribes to a real-time Firestore collection scoped to the active cafe or shop.
 * @param {string} subcollection - e.g. "devices", "sessions", "staff", "tables", "menu", "invoices"
 * @param {Function} onData - Callback receiving array of documents and fromCache boolean
 * @param {Function} [onError] - Error callback
 * @param {string} [cafeId] - Optional explicit tenant identifier
 * @param {string} [forcedRoot] - Optional forced root ('shops' | 'cafes')
 * @returns {Promise<Function>} Unsubscribe function
 */
export async function subscribeTenantCollection(subcollection, onData, onError, cafeId, forcedRoot) {
  const path = getTenantPath(subcollection, cafeId, forcedRoot);
  const isTransactional = subcollection === 'invoices';
  const tenDaysAgoISO = new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString();

  if (typeof window === 'undefined') {
    return universalClient.collection(path).onSnapshot((snapshot) => {
      const docs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!isTransactional || !data.created_at || data.created_at >= tenDaysAgoISO) {
          docs.push({ id: docSnap.id, ...data });
        }
      });
      if (typeof onData === 'function') {
        onData(docs, true);
      }
    }, onError);
  }

  const db = await getDb();
  const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js').catch(() => null);
  if (!firestoreModule) {
    return universalClient.collection(path).onSnapshot((snapshot) => {
      const docs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!isTransactional || !data.created_at || data.created_at >= tenDaysAgoISO) {
          docs.push({ id: docSnap.id, ...data });
        }
      });
      if (typeof onData === 'function') onData(docs, true);
    }, onError);
  }

  const { collection, onSnapshot, query, where } = firestoreModule;
  const colRef = collection(db, path);
  let q;
  if (isTransactional && typeof where === 'function') {
    q = query(colRef, where('created_at', '>=', tenDaysAgoISO));
  } else {
    q = query(colRef);
  }

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const docs = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!isTransactional || !data.created_at || data.created_at >= tenDaysAgoISO) {
        docs.push({ id: docSnap.id, ...data });
      }
    });
    if (typeof onData === 'function') {
      onData(docs, snapshot.metadata ? snapshot.metadata.fromCache : false);
    }
  }, (err) => {
    console.warn(`[DBClient:SnapshotError] ${path}:`, err.message);
    if (typeof onError === 'function') onError(err);
  });

  return unsubscribe;
}

/**
 * Subscribes specifically to live transactions with strict 10-day filter boundary.
 */
export async function subscribeLiveTransactions(subcollection, onData, onError, cafeId) {
  return subscribeTenantCollection(subcollection || 'invoices', onData, onError, cafeId);
}

/**
 * Writes or merges a document under the active tenant's collection.
 * Works seamlessly offline via Firestore's persistent cache.
 * @param {string} subcollection
 * @param {string} docId
 * @param {Object} data
 * @param {boolean} [merge=true]
 * @param {string} [cafeId]
 * @param {string} [forcedRoot]
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function setTenantDocument(subcollection, docId, data, merge = true, cafeId = null, forcedRoot = null) {
  return safeExecute(async () => {
    const path = getTenantPath(subcollection, cafeId, forcedRoot);
    const payload = {
      ...data,
      updated_at: new Date().toISOString()
    };
    
    if (typeof window === 'undefined' || !window.firebaseFirestoreModule) {
      await universalClient.doc(`${path}/${docId}`).set(payload, { merge });
      return { id: docId, ...payload };
    }

    const db = await getDb();
    const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
    const { doc, setDoc } = firestoreModule;

    const docRef = doc(db, path, String(docId));

    await setDoc(docRef, payload, { merge });
    return { id: docId, ...payload };
  }, `setDoc:${subcollection}`);
}

/**
 * Subscribes to devices under active tenant (/shops/{shopId}/devices or /cafes/{cafeId}/devices).
 * @param {Function} onData
 * @param {Function} [onError]
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<Function>}
 */
export async function subscribeDevices(onData, onError, tenantId, forcedRoot) {
  return subscribeTenantCollection('devices', onData, onError, tenantId, forcedRoot);
}

/**
 * Subscribes to live sessions under active tenant (/shops/{shopId}/sessions).
 * @param {Function} onData
 * @param {Function} [onError]
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<Function>}
 */
export async function subscribeSessions(onData, onError, tenantId, forcedRoot) {
  return subscribeTenantCollection('sessions', onData, onError, tenantId, forcedRoot);
}

/**
 * Subscribes to staff directory under active tenant (/shops/{shopId}/staff).
 * @param {Function} onData
 * @param {Function} [onError]
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<Function>}
 */
export async function subscribeStaff(onData, onError, tenantId, forcedRoot) {
  return subscribeTenantCollection('staff', onData, onError, tenantId, forcedRoot);
}

/**
 * Writes or updates a device record under the tenant's devices subcollection.
 * @param {string} deviceId
 * @param {Object} data
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function setTenantDevice(deviceId, data, tenantId, forcedRoot) {
  return setTenantDocument('devices', deviceId, data, true, tenantId, forcedRoot);
}

/**
 * Writes or updates a session record under the tenant's sessions subcollection.
 * @param {string} sessionId
 * @param {Object} data
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function setTenantSession(sessionId, data, tenantId, forcedRoot) {
  return setTenantDocument('sessions', sessionId, data, true, tenantId, forcedRoot);
}

/**
 * Writes or updates a staff record under the tenant's staff subcollection.
 * @param {string|number} staffId
 * @param {Object} data
 * @param {string} [tenantId]
 * @param {string} [forcedRoot]
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function setTenantStaffMember(staffId, data, tenantId, forcedRoot) {
  return setTenantDocument('staff', String(staffId), data, true, tenantId, forcedRoot);
}

/**
 * Creates an atomic Firestore write batch for bundled mutations.
 * @returns {Promise<Object>} WriteBatch instance
 */
export async function createBatch() {
  if (typeof window === 'undefined' || !window.firebaseFirestoreModule) {
    return universalClient.createBatch();
  }
  const db = await getDb();
  const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
  const { writeBatch } = firestoreModule;
  return writeBatch(db);
}

/**
 * Runs an atomic database transaction.
 * @param {Function} updateFunction - Transaction execution callback
 * @returns {Promise<any>}
 */
export async function runTransaction(updateFunction) {
  if (typeof window !== 'undefined' && window.firebaseFirestoreModule && typeof window.firebaseFirestoreModule.runTransaction === 'function') {
    const db = await getDb();
    return await window.firebaseFirestoreModule.runTransaction(db, updateFunction);
  }
  const db = await getDb();
  if (db && typeof db.runTransaction === 'function') {
    return await db.runTransaction(updateFunction);
  }
  return await universalClient.runTransaction(updateFunction);
}

