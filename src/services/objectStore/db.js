/**
 * objectStore/db.js
 *
 * Raw IndexedDB connection and schema setup.
 * This file is intentionally the ONLY place that calls indexedDB.open().
 * All other modules go through the exported openDB() function.
 *
 * Schema:
 *   Store "objects" — key: fileKey
 *     Indexes: patientId, department, type, uploadedAt, doctorId,
 *              [patientId+type] compound, [patientId+department] compound
 *
 *   Store "sync_state" — key: 'cursor'
 *     Value: { lastSyncedAt, totalSynced, totalBytes }
 */

import { DB_VERSION, STORES } from './constants.js';

const _dbCache = {};

/**
 * Open (or reuse) an IndexedDB connection for a given database name.
 * Returns a Promise<IDBDatabase>.
 */
export function openDB(dbName) {
  if (_dbCache[dbName]) return Promise.resolve(_dbCache[dbName]);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ── "objects" store ───────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORES.OBJECTS)) {
        const store = db.createObjectStore(STORES.OBJECTS, { keyPath: 'fileKey' });

        // Single-field indexes
        store.createIndex('patientId',    'patientId',    { unique: false });
        store.createIndex('department',   'department',   { unique: false });
        store.createIndex('type',         'type',         { unique: false });
        store.createIndex('uploadedAt',   'uploadedAt',   { unique: false });
        store.createIndex('doctorId',     'doctorId',     { unique: false });
        store.createIndex('examinationDate', 'examinationDate', { unique: false });

        // Compound indexes for fast common queries
        store.createIndex('patientId+type',       ['patientId', 'type'],       { unique: false });
        store.createIndex('patientId+department', ['patientId', 'department'], { unique: false });
      }

      // ── "sync_state" store ────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORES.SYNC_STATE)) {
        db.createObjectStore(STORES.SYNC_STATE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      _dbCache[dbName] = db;

      // If the connection is forcibly closed (e.g. schema upgrade in another tab),
      // clear the cache so the next call re-opens.
      db.onversionchange = () => {
        db.close();
        delete _dbCache[dbName];
      };

      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB blocked for ${dbName}`));
  });
}

/**
 * Run an IndexedDB transaction and return the result of the callback.
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx: IDBTransaction) => Promise<any>} callback
 */
export function withTransaction(db, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
    callback(tx).then(resolve).catch((err) => {
      try { tx.abort(); } catch (_) {}
      reject(err);
    });
  });
}

/**
 * Wrap an IDBRequest in a Promise.
 */
export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

/**
 * Iterate all records in a store (or index) matching a query.
 * Returns an array of values.
 */
export function getAll(storeOrIndex, query) {
  return promisifyRequest(storeOrIndex.getAll(query));
}

/**
 * Iterate records using a cursor and collect results up to `limit`.
 */
export function cursorAll(storeOrIndex, query, direction = 'next') {
  return new Promise((resolve, reject) => {
    const results = [];
    const req = storeOrIndex.openCursor(query, direction);
    req.onerror = () => reject(req.error);
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}
