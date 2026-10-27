/**
 * src/core/db-migrator.js
 * IndexedDB Schema Versioning & Zero-Data-Loss Migration for Billnaw Cafe POS.
 * Manages local client persistence alongside Firestore persistentLocalCache.
 */

const DB_NAME = 'CafePOS_DB';
const TARGET_VERSION = 2;

let dbInstance = null;

/**
 * Initializes the versioned IndexedDB database with schema upgrades.
 * @returns {Promise<IDBDatabase>}
 */
export function initMigratedDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const req = indexedDB.open(DB_NAME, TARGET_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;
      console.log(`[DBMigrator] Upgrading IndexedDB from v${oldVersion} to v${TARGET_VERSION}`);

      // Version 1 legacy store
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }

      // Version 2: Specialized stores for high-throughput offline access
      if (!db.objectStoreNames.contains('offline_sync_queue')) {
        const queueStore = db.createObjectStore('offline_sync_queue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('local_settings')) {
        db.createObjectStore('local_settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      console.log('[DBMigrator] Connected to CafePOS_DB v' + dbInstance.version);
      resolve(dbInstance);
    };

    req.onerror = (e) => {
      console.error('[DBMigrator] IndexedDB open error:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Key-value getter for local storage.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getLocalValue(key) {
  const db = await initMigratedDb();
  return new Promise((resolve) => {
    const tx = db.transaction('store', 'readonly');
    const store = tx.objectStore('store');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/**
 * Key-value setter for local storage.
 * @param {string} key
 * @param {any} val
 * @returns {Promise<void>}
 */
export async function setLocalValue(key, val) {
  const db = await initMigratedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    const req = store.put(val, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears a specific local key.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function clearLocalKey(key) {
  const db = await initMigratedDb();
  return new Promise((resolve) => {
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
