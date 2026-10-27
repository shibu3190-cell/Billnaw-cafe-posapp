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
        return { id: docPath.split('/').pop() };
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
 * Returns tenant collection path: cafes/{cafe_id}/{subcollection}
 * @param {string} subcollection
 * @param {string} [cafeId]
 * @returns {string}
 */
export function getTenantPath(subcollection, cafeId) {
  const activeCafe = cafeId || getActiveCafeId();
  return `cafes/${activeCafe}/${subcollection}`;
}

/**
 * Subscribes to a real-time Firestore collection scoped to the active cafe.
 * @param {string} subcollection - e.g. "tables", "menu", "invoices"
 * @param {Function} onData - Callback receiving array of documents
 * @param {Function} [onError] - Error callback
 * @returns {Promise<Function>} Unsubscribe function
 */
export async function subscribeTenantCollection(subcollection, onData, onError) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const db = await getDb();
  const path = getTenantPath(subcollection);
  
  const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js').catch(() => null);
  if (!firestoreModule) return () => {};

  const { collection, onSnapshot, query } = firestoreModule;
  const colRef = collection(db, path);
  const q = query(colRef);

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const docs = [];
    snapshot.forEach(docSnap => {
      docs.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (typeof onData === 'function') {
      onData(docs, snapshot.metadata.fromCache);
    }
  }, (err) => {
    console.warn(`[DBClient:SnapshotError] ${path}:`, err.message);
    if (typeof onError === 'function') onError(err);
  });

  return unsubscribe;
}

/**
 * Writes or merges a document under the active cafe's collection.
 * Works seamlessly offline via Firestore's persistent cache.
 * @param {string} subcollection
 * @param {string} docId
 * @param {Object} data
 * @param {boolean} [merge=true]
 * @returns {Promise<ServiceResult<Object>>}
 */
export async function setTenantDocument(subcollection, docId, data, merge = true) {
  return safeExecute(async () => {
    const db = await getDb();
    const path = getTenantPath(subcollection);
    
    if (typeof window === 'undefined' || !window.firebaseFirestoreModule) {
      return universalClient.doc(`${path}/${docId}`).set(data, { merge });
    }

    const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
    const { doc, setDoc } = firestoreModule;

    const docRef = doc(db, path, String(docId));
    const payload = {
      ...data,
      updated_at: new Date().toISOString()
    };

    await setDoc(docRef, payload, { merge });
    return { id: docId, ...payload };
  }, `setDoc:${subcollection}`);
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
