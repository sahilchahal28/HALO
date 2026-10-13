/**
 * objectStore/index.js
 *
 * HALO Local Object Storage Layer (IndexedDB S3-Lookalike Abstraction)
 *
 * Implements an S3-compatible interface (putObject, getObject, deleteObject, listObjects)
 * backed by raw browser IndexedDB Blobs. To external callers, this behaves identically
 * to an S3 object store with sub-millisecond local reads and full offline support.
 */

import { DB_NAMES, STORES, MAX_STORAGE_BYTES, RETENTION_ELIGIBLE_TYPES } from './constants.js';
import { openDB, withTransaction, getAll, cursorAll } from './db.js';

let _currentRole = 'DOCTOR';

/**
 * Configure the active role ('ADMIN' | 'DOCTOR' | 'PATIENT').
 * Dictates which underlying database is connected.
 */
export function setObjectStoreRole(role) {
  if (role && DB_NAMES[role.toUpperCase()]) {
    _currentRole = role.toUpperCase();
  }
}

/**
 * Resolve the DB connection for the active role.
 */
async function getDB() {
  const dbName = DB_NAMES[_currentRole] || DB_NAMES.DOCTOR;
  return openDB(dbName);
}

export const ObjectStore = {
  /**
   * Set active role context.
   */
  setRole(role) {
    setObjectStoreRole(role);
  },

  /**
   * Save a file (Blob) with associated metadata into the object store.
   *
   * @param {Object} params
   * @param {string} params.key - Unique file key (e.g., 'records/PAT-001/1728741600000-uuid.pdf')
   * @param {Blob|File} params.blob - Binary file content (raw Blob, NOT base64)
   * @param {Object} params.metadata - Metadata payload (patientId, documentId, type, title, etc.)
   */
  async putObject({ key, blob, metadata = {} }) {
    if (!key) throw new Error('ObjectStore.putObject: "key" is required.');
    if (!blob) throw new Error('ObjectStore.putObject: "blob" is required.');
    if (!metadata.patientId) {
      throw new Error('ObjectStore.putObject: "metadata.patientId" is required for patient segregation.');
    }

    const db = await getDB();
    const size = blob.size || 0;

    // Check storage budget and run purge if needed
    try {
      const info = await this.getStorageInfo();
      if (info.estimatedBytes + size > MAX_STORAGE_BYTES) {
        const bytesToFree = (info.estimatedBytes + size) - MAX_STORAGE_BYTES + (50 * 1024 * 1024); // free +50MB buffer
        await this.purgeOldest(bytesToFree);
      }
    } catch (e) {
      console.warn('[ObjectStore] Storage budget check warning:', e.message);
    }

    const record = {
      fileKey: key,
      blob,
      fileSize: size,
      mimeType: blob.type || metadata.mimeType || 'application/octet-stream',
      patientId: String(metadata.patientId).trim().toUpperCase(),
      documentId: metadata.documentId || null,
      type: metadata.type || 'OTHER',
      title: metadata.title || key.split('/').pop() || 'Untitled Document',
      department: metadata.department || 'GENERAL',
      doctor: metadata.doctor || null,
      doctorId: metadata.doctorId || null,
      examinationDate: metadata.examinationDate ? new Date(metadata.examinationDate).toISOString() : new Date().toISOString(),
      uploadedAt: metadata.uploadedAt ? new Date(metadata.uploadedAt).toISOString() : new Date().toISOString(),
      uploadedBy: metadata.uploadedBy || 'User',
      uploadedByRole: metadata.uploadedByRole || _currentRole,
      status: metadata.status || 'ACTIVE',
      legalHold: Boolean(metadata.legalHold),
      retentionPolicy: metadata.retentionPolicy || null,
      syncedAt: new Date().toISOString(),
    };

    await withTransaction(db, [STORES.OBJECTS], 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      store.put(record);
      return Promise.resolve();
    });

    return { key, size, record };
  },

  /**
   * Retrieve an object by its key.
   * Generates a temporary object URL that must be revoked when finished.
   *
   * @param {string} key
   * @returns {Promise<{ key: string, blob: Blob, blobUrl: string, metadata: Object } | null>}
   */
  async getObject(key) {
    if (!key) return null;
    const db = await getDB();

    const record = await withTransaction(db, [STORES.OBJECTS], 'readonly', (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    });

    if (!record) return null;

    const blobUrl = URL.createObjectURL(record.blob);
    const { blob, ...metadata } = record;

    return {
      key,
      blob,
      blobUrl,
      metadata,
    };
  },

  /**
   * Retrieve an object by its documentId.
   * Useful when fileKey is unknown or during delta sync resolution.
   *
   * @param {string} documentId
   * @returns {Promise<{ key: string, blob: Blob, blobUrl: string, metadata: Object } | null>}
   */
  async getObjectByDocumentId(documentId) {
    if (!documentId) return null;
    const db = await getDB();

    const record = await withTransaction(db, [STORES.OBJECTS], 'readonly', async (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      if (store.indexNames.contains('documentId')) {
        const index = store.index('documentId');
        return new Promise((resolve, reject) => {
          const req = index.get(documentId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      }
      // Fallback in-memory scan if index not created yet
      const all = await getAll(store);
      return all.find((r) => r.documentId === documentId) || null;
    });

    if (!record) return null;

    const blobUrl = URL.createObjectURL(record.blob);
    const { blob, ...metadata } = record;

    return {
      key: record.fileKey,
      blob,
      blobUrl,
      metadata,
    };
  },

  /**
   * Delete an object by key.
   *
   * @param {string} key
   */
  async deleteObject(key) {
    if (!key) return false;
    const db = await getDB();

    await withTransaction(db, [STORES.OBJECTS], 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      store.delete(key);
      return Promise.resolve();
    });

    return true;
  },

  /**
   * Check if an object exists in the local store.
   *
   * @param {string} key
   */
  async exists(key) {
    if (!key) return false;
    const db = await getDB();

    return withTransaction(db, [STORES.OBJECTS], 'readonly', (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      return new Promise((resolve, reject) => {
        const req = store.count(key);
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => reject(req.error);
      });
    });
  },

  /**
   * List objects for a patient with filtering, sorting, and pagination.
   * NOTE: Strips the binary Blob from returned items for performance.
   *
   * @param {Object} query
   * @param {string} query.patientId - REQUIRED (unless ADMIN)
   * @param {string} [query.type]
   * @param {string} [query.department]
   * @param {string} [query.doctorId]
   * @param {string} [query.doctor]
   * @param {string} [query.search]
   * @param {string|Date} [query.dateFrom]
   * @param {string|Date} [query.dateTo]
   * @param {string} [query.sortBy] - 'date' | 'title' | 'size' | 'type'
   * @param {'asc'|'desc'} [query.sortOrder]
   * @param {number} [query.page]
   * @param {number} [query.limit]
   */
  async listObjects({
    patientId,
    type,
    department,
    doctorId,
    doctor,
    search,
    dateFrom,
    dateTo,
    sortBy = 'date',
    sortOrder = 'desc',
    page = 1,
    limit = 50,
  } = {}) {
    // Role-based patient segregation: Patient and Doctor must provide patientId
    if (_currentRole !== 'ADMIN' && !patientId) {
      throw new Error('ObjectStore.listObjects: patientId is required for non-admin queries.');
    }

    const db = await getDB();

    const records = await withTransaction(db, [STORES.OBJECTS], 'readonly', async (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);

      // Fast-path index lookup by patientId if available
      let allForPatient = [];
      if (patientId) {
        const index = store.index('patientId');
        const targetId = String(patientId).trim().toUpperCase();
        allForPatient = await getAll(index, targetId);
      } else {
        allForPatient = await getAll(store);
      }
      return allForPatient;
    });

    // In-memory filter pipeline
    let filtered = records.filter((rec) => {
      if (rec.status === 'DELETED') return false;

      // Filter by type
      if (type && type !== 'ALL' && rec.type !== type) return false;

      // Filter by department
      if (department && department !== 'ALL' && rec.department !== department) return false;

      // Filter by doctor
      if (doctorId && rec.doctorId !== doctorId) return false;
      if (doctor && rec.doctor && !rec.doctor.toLowerCase().includes(doctor.toLowerCase())) return false;

      // Filter by exam date range
      if (dateFrom) {
        const examDate = new Date(rec.examinationDate || rec.uploadedAt);
        if (examDate < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const examDate = new Date(rec.examinationDate || rec.uploadedAt);
        const toBoundary = new Date(dateTo);
        toBoundary.setHours(23, 59, 59, 999);
        if (examDate > toBoundary) return false;
      }

      // Filter by title / keyword search
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesTitle = rec.title?.toLowerCase().includes(q);
        const matchesDept = rec.department?.toLowerCase().includes(q);
        const matchesDoc = rec.doctor?.toLowerCase().includes(q);
        const matchesType = rec.type?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDept && !matchesDoc && !matchesType) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'size') {
        comparison = (a.fileSize || 0) - (b.fileSize || 0);
      } else if (sortBy === 'type') {
        comparison = (a.type || '').localeCompare(b.type || '');
      } else {
        // Default: date (examinationDate or uploadedAt)
        const dateA = new Date(a.examinationDate || a.uploadedAt || 0).getTime();
        const dateB = new Date(b.examinationDate || b.uploadedAt || 0).getTime();
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    // Strip binary Blob to avoid memory overhead in metadata views
    const items = paginated.map(({ blob, ...meta }) => ({
      ...meta,
      hasCachedBlob: Boolean(blob),
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  /**
   * Return storage metrics (number of objects and total estimated bytes).
   */
  async getStorageInfo() {
    const db = await getDB();

    return withTransaction(db, [STORES.OBJECTS], 'readonly', async (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      const records = await getAll(store);

      let totalBytes = 0;
      let count = 0;

      for (const rec of records) {
        count += 1;
        totalBytes += rec.fileSize || (rec.blob?.size || 0);
      }

      return {
        count,
        estimatedBytes: totalBytes,
        maxBytes: MAX_STORAGE_BYTES,
        usagePercentage: Math.min(100, Math.round((totalBytes / MAX_STORAGE_BYTES) * 100)),
      };
    });
  },

  /**
   * Purge oldest records when storage cap is exceeded.
   * Never purges records marked with legalHold.
   *
   * @param {number} bytesToFree
   */
  async purgeOldest(bytesToFree) {
    if (bytesToFree <= 0) return 0;
    const db = await getDB();

    const candidates = await withTransaction(db, [STORES.OBJECTS], 'readonly', async (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      const index = store.index('uploadedAt');
      const records = await cursorAll(index, null, 'next'); // oldest first
      return records.filter((r) => !r.legalHold);
    });

    let freed = 0;
    const keysToDelete = [];

    for (const rec of candidates) {
      if (freed >= bytesToFree) break;
      keysToDelete.push(rec.fileKey);
      freed += rec.fileSize || (rec.blob?.size || 0);
    }

    if (keysToDelete.length > 0) {
      await withTransaction(db, [STORES.OBJECTS], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES.OBJECTS);
        for (const k of keysToDelete) {
          store.delete(k);
        }
        return Promise.resolve();
      });
      console.log(`[ObjectStore] Purged ${keysToDelete.length} oldest objects, freed ${(freed / 1024 / 1024).toFixed(2)} MB`);
    }

    return freed;
  },

  /**
   * Revoke an active Blob URL to avoid memory leaks.
   */
  revokeUrl(blobUrl) {
    if (blobUrl && typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (_) {}
    }
  },
};

export default ObjectStore;
