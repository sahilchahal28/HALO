/**
 * objectStore/syncEngine.js
 *
 * HALOArchive Real-Time Sync Engine
 *
 * Coordinates synchronization between the MacBook backend filesystem archive
 * and browser IndexedDB caches across Doctor and Patient PWAs.
 *
 * Features:
 *  - Incremental metadata delta sync via GET /api/documents/sync-delta
 *  - Lazy binary blob hydration on click / view / download (keeps bandwidth optimal)
 *  - Real-time instant push notifications via Socket.io ('document:uploaded', 'document:deleted')
 *  - Custom DOM events ('halo:store:updated') for zero-prop-drilling React UI updates
 *  - Client-side retention enforcement & storage quota management
 */

import { ObjectStore } from './index.js';
import { runLocalRetentionPurge } from './retentionWorker.js';
import { api, getApiBase } from '../../utils/api.js';

let _activeSocket = null;
let _currentSubscribedPatientId = null;
let _currentRole = 'DOCTOR';

function getAuthToken() {
  try {
    return localStorage.getItem('halo_token');
  } catch (_) {
    return null;
  }
}

// Global online event handler for auto-recovering when Wi-Fi is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[HALOArchive] Network restored (online event). Reconnecting socket and syncing deltas...');
    if (_activeSocket && !_activeSocket.connected) {
      try { _activeSocket.connect(); } catch (_) {}
    }
    if (_currentSubscribedPatientId) {
      HALOArchive.syncDelta({ patientId: _currentSubscribedPatientId, role: _currentRole });
    }
  });
}

export const HALOArchive = {
  /**
   * Bind the active Socket.io instance for real-time document events.
   *
   * @param {import('socket.io-client').Socket} socket
   * @param {string} role - 'ADMIN' | 'DOCTOR' | 'PATIENT'
   * @param {string} [patientId] - Patient ID for patient-specific subscription
   */
  bindSocket(socket, role = 'DOCTOR', patientId = null) {
    if (!socket) return;
    _activeSocket = socket;
    _currentRole = role;
    if (patientId) {
      _currentSubscribedPatientId = patientId;
    }
    ObjectStore.setRole(role);

    // Clean up any existing listeners to prevent duplicates
    socket.off('document:uploaded', this._handleDocumentUploaded);
    socket.off('document:deleted', this._handleDocumentDeleted);
    socket.off('connect', this._handleSocketConnect);

    // Register handlers
    socket.on('document:uploaded', this._handleDocumentUploaded);
    socket.on('document:deleted', this._handleDocumentDeleted);
    socket.on('connect', () => {
      console.log('[HALOArchive] Socket connected/reconnected.');
      if (_currentSubscribedPatientId) {
        socket.emit('subscribe:patient', _currentSubscribedPatientId);
        console.log(`[HALOArchive] Re-subscribed to patient ${_currentSubscribedPatientId} on reconnect`);
        // Immediately fetch deltas upon reconnect to catch mutations that occurred while offline
        this.syncDelta({ patientId: _currentSubscribedPatientId, role: _currentRole });
      }
    });

    // Handle room subscriptions based on role
    if (patientId) {
      this.subscribePatient(patientId);
    }
  },

  /**
   * Subscribe to a patient's real-time document room.
   */
  subscribePatient(patientId) {
    if (!patientId) return;
    if (_currentSubscribedPatientId && _currentSubscribedPatientId !== patientId) {
      this.unsubscribePatient(_currentSubscribedPatientId);
    }
    _currentSubscribedPatientId = patientId;
    if (_activeSocket) {
      _activeSocket.emit('subscribe:patient', patientId);
      console.log(`[HALOArchive] Subscribed to real-time room for patient: ${patientId}`);
    }
  },

  /**
   * Unsubscribe from a patient's document room.
   */
  unsubscribePatient(patientId) {
    if (!patientId) return;
    if (_activeSocket) {
      _activeSocket.emit('unsubscribe:patient', patientId);
    }
    if (_currentSubscribedPatientId === patientId) {
      _currentSubscribedPatientId = null;
    }
  },

  /**
   * Internal handler for document:uploaded socket event.
   */
  async _handleDocumentUploaded(payload) {
    try {
      console.log('[HALOArchive] Realtime document:uploaded received:', payload);
      const { documentId, patientId, fileKey, metadata } = payload;
      if (!fileKey || !patientId) return;

      // When an upload event occurs, create/update the document entry in IndexedDB.
      // A empty/placeholder Blob is used initially if lazy-fetching, or eager fetch can occur.
      const exists = await ObjectStore.exists(fileKey);
      if (!exists) {
        // Create initial record entry with metadata so it appears immediately in search/filters
        const placeholderBlob = new Blob([], { type: metadata?.mimeType || 'application/octet-stream' });
        await ObjectStore.putObject({
          key: fileKey,
          blob: placeholderBlob,
          metadata: {
            ...metadata,
            documentId,
            patientId,
          },
        });
      }

      // Notify UI
      window.dispatchEvent(
        new CustomEvent('halo:store:updated', {
          detail: { patientId, documentId, fileKey, action: 'uploaded' },
        })
      );
    } catch (err) {
      console.error('[HALOArchive] Error handling realtime document:uploaded:', err);
    }
  },

  /**
   * Internal handler for document:deleted socket event.
   */
  async _handleDocumentDeleted(payload) {
    try {
      console.log('[HALOArchive] Realtime document:deleted received:', payload);
      const { fileKey, patientId, documentId } = payload;
      if (fileKey) {
        await ObjectStore.deleteObject(fileKey);
      }

      // Notify UI
      window.dispatchEvent(
        new CustomEvent('halo:store:updated', {
          detail: { patientId, documentId, fileKey, action: 'deleted' },
        })
      );
    } catch (err) {
      console.error('[HALOArchive] Error handling realtime document:deleted:', err);
    }
  },

  /**
   * Incremental delta synchronization with the MacBook backend.
   * Pulls new/changed documents and purges deleted records.
   *
   * @param {Object} options
   * @param {string} [options.patientId] - Required for patient & doctor
   * @param {string} [options.role] - 'ADMIN' | 'DOCTOR' | 'PATIENT'
   * @param {string} [options.since] - ISO timestamp of last sync
   */
  async syncDelta({ patientId, role = 'DOCTOR', since = null } = {}) {
    _currentRole = role;
    ObjectStore.setRole(role);

    if (role !== 'ADMIN' && !patientId) {
      console.warn('[HALOArchive] syncDelta skipped: patientId is required.');
      return [];
    }

    const queryParams = new URLSearchParams();
    if (patientId) queryParams.set('patientId', patientId);
    if (since) queryParams.set('since', since);

    try {
      // Use api.get which features timeout, retry, stale IP recovery, and token handling
      const deltas = await api.get(`/documents/sync-delta?${queryParams.toString()}`);
      if (!Array.isArray(deltas)) {
        return [];
      }

      console.log(`[HALOArchive] Received ${deltas.length} delta items from server.`);

      for (const item of deltas) {
        const { action, fileKey, metadata, documentId } = item;
        if (!fileKey) continue;

        if (action === 'delete') {
          await ObjectStore.deleteObject(fileKey);
        } else if (action === 'upsert') {
          let existing = await ObjectStore.getObject(fileKey);
          if (!existing && documentId) {
            existing = await ObjectStore.getObjectByDocumentId(documentId);
          }

          if (existing && existing.blob && existing.blob.size > 0) {
            // Preserve the downloaded binary blob, but update metadata
            await ObjectStore.putObject({
              key: fileKey,
              blob: existing.blob,
              metadata: {
                ...existing.metadata,
                ...metadata,
                documentId,
              },
            });
          } else {
            // Lazy sync: save metadata with placeholder blob
            const placeholderBlob = new Blob([], { type: metadata?.mimeType || 'application/octet-stream' });
            await ObjectStore.putObject({
              key: fileKey,
              blob: placeholderBlob,
              metadata: {
                ...metadata,
                documentId,
              },
            });
          }
        }
      }

      // Run local 6-month retention purge
      await runLocalRetentionPurge(role);

      // Dispatch update event to let React components refresh
      window.dispatchEvent(
        new CustomEvent('halo:store:updated', {
          detail: { patientId, syncedCount: deltas.length },
        })
      );

      return deltas;
    } catch (err) {
      console.warn('[HALOArchive] Background sync delta error (will retry next cycle):', err.message);
      return [];
    }
  },

  /**
   * Lazily fetch the binary blob from the MacBook backend stream
   * and store it in IndexedDB for immediate offline access & re-download.
   *
   * @param {Object} params
   * @param {string} params.documentId
   * @param {string} params.fileKey
   * @param {Object} [params.metadata]
   * @returns {Promise<{ blob: Blob, blobUrl: string, cached: boolean }>}
   */
  async fetchAndCacheBlob({ documentId, fileKey, metadata = {} }) {
    if (!documentId && !fileKey) {
      throw new Error('documentId or fileKey is required to fetch blob.');
    }

    // 1. Check if already stored in local IndexedDB with valid binary data
    const wrapPdfBlobIfNeeded = (blob, key = '') => {
      if (!blob || blob.size === 0) return blob;
      const isPdf =
        blob.type === 'application/pdf' ||
        /\.pdf$/i.test(key) ||
        /\.pdf$/i.test(metadata.title || '') ||
        /\.pdf$/i.test(metadata.s3Key || '') ||
        metadata.mimeType === 'application/pdf';
      if (isPdf && blob.type !== 'application/pdf') {
        return new Blob([blob], { type: 'application/pdf' });
      }
      return blob;
    };

    if (fileKey) {
      const existing = await ObjectStore.getObject(fileKey);
      if (existing && existing.blob && existing.blob.size > 0) {
        const ensuredBlob = wrapPdfBlobIfNeeded(existing.blob, fileKey);
        return {
          blob: ensuredBlob,
          blobUrl: URL.createObjectURL(ensuredBlob),
          cached: true,
        };
      }
    }
    if (documentId) {
      const existingByDoc = await ObjectStore.getObjectByDocumentId(documentId);
      if (existingByDoc && existingByDoc.blob && existingByDoc.blob.size > 0) {
        const ensuredBlob = wrapPdfBlobIfNeeded(existingByDoc.blob, existingByDoc.key || fileKey || '');
        return {
          blob: ensuredBlob,
          blobUrl: URL.createObjectURL(ensuredBlob),
          cached: true,
        };
      }
    }

    // 2. Fetch from server's binary stream with timeout and fallback
    const base = getApiBase();
    const token = getAuthToken();

    const fetchStream = async (baseUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout
      try {
        const url = `${baseUrl}/api/documents/${documentId}/blob`;
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'bypass-tunnel-reminder': 'true',
            'ngrok-skip-browser-warning': 'true',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });
        clearTimeout(timer);
        return res;
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };

    let res = null;
    try {
      res = await fetchStream(base);
      if (!res.ok && base) {
        // Try same-origin fallback if custom base returned an error
        try {
          const fallbackRes = await fetchStream('');
          if (fallbackRes.ok) res = fallbackRes;
        } catch (_) {}
      }
    } catch (_) {
      // If primary base timed out or failed, try same-origin fallback
      if (base) {
        try {
          res = await fetchStream('');
        } catch (_) {}
      }
    }

    if (!res || !res.ok) {
      // Offline fallback: check if we have any cached blob even with a different key
      if (fileKey) {
        const fallback = await ObjectStore.getObject(fileKey);
        if (fallback && fallback.blob && fallback.blob.size > 0) {
          const ensuredBlob = wrapPdfBlobIfNeeded(fallback.blob, fileKey);
          return { blob: ensuredBlob, blobUrl: URL.createObjectURL(ensuredBlob), cached: true };
        }
      }
      if (documentId) {
        const fallback = await ObjectStore.getObjectByDocumentId(documentId);
        if (fallback && fallback.blob && fallback.blob.size > 0) {
          const ensuredBlob = wrapPdfBlobIfNeeded(fallback.blob, fallback.key || fileKey || '');
          return { blob: ensuredBlob, blobUrl: URL.createObjectURL(ensuredBlob), cached: true };
        }
      }

      throw new Error(
        !navigator.onLine
          ? 'You are offline. This document has not been downloaded to your device yet. Reconnect to Wi-Fi to view.'
          : (res ? `Failed to load document (${res.status}).` : 'Unable to connect to archive server. Please verify your Wi-Fi connection.')
      );
    }

    const rawBlob = await res.blob();
    const targetKey = fileKey || `records/${metadata.patientId || 'GENERAL'}/${documentId}`;
    let mimeType = res.headers.get('Content-Type') || metadata.mimeType || rawBlob.type || 'application/octet-stream';
    const isPdfFile =
      mimeType === 'application/pdf' ||
      /\.pdf$/i.test(targetKey || '') ||
      /\.pdf$/i.test(fileKey || '') ||
      /\.pdf$/i.test(metadata.title || '') ||
      /\.pdf$/i.test(metadata.s3Key || '') ||
      /\.pdf$/i.test(metadata.fileRef || '');
    if (isPdfFile) {
      mimeType = 'application/pdf';
    }
    const blob = new Blob([rawBlob], { type: mimeType });

    // 3. Store into local IndexedDB
    await ObjectStore.putObject({
      key: targetKey,
      blob,
      metadata: {
        ...metadata,
        documentId,
        mimeType,
      },
    });

    const blobUrl = URL.createObjectURL(blob);
    return {
      blob,
      blobUrl,
      cached: false,
    };
  },
};

export default HALOArchive;
