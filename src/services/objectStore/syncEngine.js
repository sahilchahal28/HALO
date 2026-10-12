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
import { getApiBase } from '../../utils/api.js';

let _activeSocket = null;
let _currentSubscribedPatientId = null;

function getAuthToken() {
  try {
    return localStorage.getItem('halo_token');
  } catch (_) {
    return null;
  }
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
    ObjectStore.setRole(role);

    // Clean up any existing listeners to prevent duplicates
    socket.off('document:uploaded', this._handleDocumentUploaded);
    socket.off('document:deleted', this._handleDocumentDeleted);

    // Register handlers
    socket.on('document:uploaded', this._handleDocumentUploaded);
    socket.on('document:deleted', this._handleDocumentDeleted);

    // Handle room subscriptions based on role
    if (role === 'PATIENT' && patientId) {
      this.subscribePatient(patientId);
    } else if (role === 'DOCTOR' && patientId) {
      this.subscribePatient(patientId);
    }
  },

  /**
   * Subscribe to a patient's real-time document room.
   */
  subscribePatient(patientId) {
    if (!_activeSocket || !patientId) return;
    if (_currentSubscribedPatientId && _currentSubscribedPatientId !== patientId) {
      this.unsubscribePatient(_currentSubscribedPatientId);
    }
    _currentSubscribedPatientId = patientId;
    _activeSocket.emit('subscribe:patient', patientId);
    console.log(`[HALOArchive] Subscribed to real-time room for patient: ${patientId}`);
  },

  /**
   * Unsubscribe from a patient's document room.
   */
  unsubscribePatient(patientId) {
    if (!_activeSocket || !patientId) return;
    _activeSocket.emit('unsubscribe:patient', patientId);
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
    ObjectStore.setRole(role);

    if (role !== 'ADMIN' && !patientId) {
      console.warn('[HALOArchive] syncDelta skipped: patientId is required.');
      return [];
    }

    const base = getApiBase();
    const token = getAuthToken();
    const queryParams = new URLSearchParams();
    if (patientId) queryParams.set('patientId', patientId);
    if (since) queryParams.set('since', since);

    const url = `${base}/api/documents/sync-delta?${queryParams.toString()}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true',
          'ngrok-skip-browser-warning': 'true',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) {
        throw new Error(`Sync delta failed with status ${res.status}`);
      }

      const deltas = await res.json();
      console.log(`[HALOArchive] Received ${deltas.length} delta items from server.`);

      for (const item of deltas) {
        const { action, fileKey, metadata, documentId } = item;
        if (!fileKey) continue;

        if (action === 'delete') {
          await ObjectStore.deleteObject(fileKey);
        } else if (action === 'upsert') {
          const exists = await ObjectStore.exists(fileKey);
          if (!exists) {
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

      // Dispatch update event
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
   * @returns {Promise<{ blob: Blob, blobUrl: string }>}
   */
  async fetchAndCacheBlob({ documentId, fileKey, metadata = {} }) {
    if (!documentId && !fileKey) {
      throw new Error('documentId or fileKey is required to fetch blob.');
    }

    // 1. Check if already stored in local IndexedDB with valid binary data
    if (fileKey) {
      const existing = await ObjectStore.getObject(fileKey);
      if (existing && existing.blob && existing.blob.size > 0) {
        return {
          blob: existing.blob,
          blobUrl: existing.blobUrl,
          cached: true,
        };
      }
    }

    // 2. Fetch from server's binary stream
    const base = getApiBase();
    const token = getAuthToken();
    const url = `${base}/api/documents/${documentId}/blob`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'bypass-tunnel-reminder': 'true',
        'ngrok-skip-browser-warning': 'true',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch document blob (${res.status}). It may have expired or been deleted.`);
    }

    const rawBlob = await res.blob();
    const mimeType = res.headers.get('Content-Type') || metadata.mimeType || rawBlob.type || 'application/octet-stream';
    const blob = new Blob([rawBlob], { type: mimeType });

    // 3. Store into local IndexedDB
    const targetKey = fileKey || `records/${metadata.patientId || 'GENERAL'}/${documentId}`;
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
