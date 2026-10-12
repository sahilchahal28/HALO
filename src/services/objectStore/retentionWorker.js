/**
 * objectStore/retentionWorker.js
 *
 * Client-Side Retention & Quota Worker
 *
 * 1. Enforces the 6-Month Auto-Purge rule locally in IndexedDB:
 *    - Lab reports, imaging, and test reports older than 180 days from examinationDate
 *      are automatically removed from the local store (unless under legalHold).
 *    - Prescriptions, discharge summaries, referrals, and other documents remain PERMANENT.
 *
 * 2. Enforces the 2 GB max storage cap (oldest-first eviction).
 */

import { STORES, RETENTION_ELIGIBLE_TYPES, MAX_STORAGE_BYTES } from './constants.js';
import { openDB, withTransaction, getAll } from './db.js';
import { DB_NAMES } from './constants.js';

export async function runLocalRetentionPurge(role = 'DOCTOR') {
  const dbName = DB_NAMES[role.toUpperCase()] || DB_NAMES.DOCTOR;
  const db = await openDB(dbName);
  const now = Date.now();
  const summary = { purgedCount: 0, purgedBytes: 0, freedCapBytes: 0 };

  // ─── 1. Retention Purge (6-Month Rule) ───────────────────────────────────
  const records = await withTransaction(db, [STORES.OBJECTS], 'readonly', async (tx) => {
    const store = tx.objectStore(STORES.OBJECTS);
    return getAll(store);
  });

  const keysToPurge = [];

  for (const rec of records) {
    if (rec.legalHold) continue; // Never purge items on legal hold

    const isEligible = RETENTION_ELIGIBLE_TYPES.includes(rec.type);
    if (!isEligible) continue;

    let isExpired = false;
    if (rec.retentionPolicy?.expiresAt) {
      isExpired = new Date(rec.retentionPolicy.expiresAt).getTime() <= now;
    } else if (rec.examinationDate) {
      const examTime = new Date(rec.examinationDate).getTime();
      const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
      isExpired = (now - examTime) >= sixMonthsMs;
    }

    if (isExpired) {
      keysToPurge.push({
        key: rec.fileKey,
        size: rec.fileSize || rec.blob?.size || 0,
      });
    }
  }

  if (keysToPurge.length > 0) {
    await withTransaction(db, [STORES.OBJECTS], 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.OBJECTS);
      for (const item of keysToPurge) {
        store.delete(item.key);
        summary.purgedCount += 1;
        summary.purgedBytes += item.size;
      }
      return Promise.resolve();
    });
    console.log(`[RetentionWorker] Purged ${summary.purgedCount} expired records (${(summary.purgedBytes / 1024).toFixed(1)} KB)`);
  }

  // ─── 2. Storage Quota Check (2 GB Cap) ──────────────────────────────────
  const remainingRecords = await withTransaction(db, [STORES.OBJECTS], 'readonly', (tx) => {
    return getAll(tx.objectStore(STORES.OBJECTS));
  });

  let totalBytes = 0;
  for (const rec of remainingRecords) {
    totalBytes += rec.fileSize || (rec.blob?.size || 0);
  }

  if (totalBytes > MAX_STORAGE_BYTES) {
    const overflow = totalBytes - MAX_STORAGE_BYTES;
    // Sort oldest-first, skip legal hold
    const candidates = remainingRecords
      .filter((r) => !r.legalHold)
      .sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));

    let freed = 0;
    const overCapKeys = [];
    for (const cand of candidates) {
      if (freed >= overflow) break;
      overCapKeys.push(cand.fileKey);
      freed += cand.fileSize || cand.blob?.size || 0;
    }

    if (overCapKeys.length > 0) {
      await withTransaction(db, [STORES.OBJECTS], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES.OBJECTS);
        for (const k of overCapKeys) {
          store.delete(k);
        }
        return Promise.resolve();
      });
      summary.freedCapBytes = freed;
      console.log(`[RetentionWorker] Quota overflow: purged ${overCapKeys.length} files (${(freed / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  return summary;
}
