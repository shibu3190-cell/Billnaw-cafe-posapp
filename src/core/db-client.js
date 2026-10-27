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

/**
 * Initializes Firebase App and Firestore with IndexedDB persistentLocalCache.
 * Supports multi-tab caching and offline mutations.
 * @returns {Promise<Object>} Firestore database instance
 */
export async function initDatabase() {
  if (isInitialized && firestoreInstance) {
    return firestoreInstance;
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
    throw new Error('Firebase SDK could not be loaded in this environment.');
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
  return firestoreInstance;
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
  const db = await getDb();
  const path = getTenantPath(subcollection);
  
  const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
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
  const db = await getDb();
  const firestoreModule = window.firebaseFirestoreModule || await import('https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js');
  const { writeBatch } = firestoreModule;
  return writeBatch(db);
}
