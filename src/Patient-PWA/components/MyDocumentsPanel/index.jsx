import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, UploadCloud, Download, Search, RefreshCw, 
  HardDrive, AlertTriangle, Plus, X, ArrowUpDown 
} from 'lucide-react';
import TypeFilterTabs from './TypeFilterTabs';
import DocumentCard from './DocumentCard';
import PreviewModal from './PreviewModal';
import { ObjectStore } from '../../../services/objectStore';
import { HALOArchive } from '../../../services/objectStore/syncEngine';
import { api, getFileUrl } from '../../../utils/api';
import { useApp } from '../../../context/AppContext';

export default function MyDocumentsPanel({ user, patientEpisode }) {
  const { addToast } = useApp();
  const patientId = user?.patientId || user?.id;

  // Filter & Search
  const [activeType, setActiveType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (newest) | 'asc' (oldest)

  // Document list & status
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionLoadingDocId, setActionLoadingDocId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);

  // Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    type: 'LAB_REPORT',
    examinationDate: new Date().toISOString().split('T')[0],
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load from ObjectStore
  const loadDocuments = useCallback(async () => {
    if (!patientId) return;
    try {
      ObjectStore.setRole('PATIENT');
      const res = await ObjectStore.listObjects({
        patientId,
        type: activeType,
        search: searchQuery,
        sortBy: 'date',
        sortOrder,
        limit: 200,
      });

      setDocuments(res.items || []);
    } catch (err) {
      console.error('[MyDocumentsPanel] Error querying ObjectStore:', err);
    } finally {
      setIsLoading(false);
    }
  }, [patientId, activeType, searchQuery, sortOrder]);

  // Sync Delta
  const syncWithMacArchive = useCallback(async () => {
    if (!patientId) return;
    setIsSyncing(true);
    try {
      await HALOArchive.syncDelta({ patientId, role: 'PATIENT' });
      await loadDocuments();
    } catch (err) {
      console.warn('[MyDocumentsPanel] Sync delta warning:', err.message);
    } finally {
      setIsSyncing(false);
    }
  }, [patientId, loadDocuments]);

  // Initial mount & real-time socket subscription
  useEffect(() => {
    if (!patientId) return;
    setIsLoading(true);

    loadDocuments();
    HALOArchive.subscribePatient(patientId);
    syncWithMacArchive();

    const handleUpdate = (e) => {
      if (!e.detail?.patientId || e.detail.patientId.toUpperCase() === patientId.toUpperCase()) {
        loadDocuments();
      }
    };

    const handleOnline = () => {
      loadDocuments();
      syncWithMacArchive();
    };

    window.addEventListener('halo:store:updated', handleUpdate);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('halo:store:updated', handleUpdate);
      window.removeEventListener('online', handleOnline);
      HALOArchive.unsubscribePatient(patientId);
    };
  }, [patientId, loadDocuments, syncWithMacArchive]);

  // Preview Document Handler
  const handlePreview = async (doc) => {
    const docId = doc.documentId || doc.fileKey || doc.s3Key;
    setActionLoadingDocId(docId);
    try {
      const { blobUrl, blob } = await HALOArchive.fetchAndCacheBlob({
        documentId: doc.documentId,
        fileKey: doc.fileKey || doc.s3Key || doc.fileRef,
        metadata: doc,
      });
      const isPdfFile = Boolean(
        doc.mimeType === 'application/pdf' ||
        blob?.type === 'application/pdf' ||
        /\.pdf$/i.test(doc.fileKey || '') ||
        /\.pdf$/i.test(doc.s3Key || '') ||
        /\.pdf$/i.test(doc.fileRef || '') ||
        /\.pdf$/i.test(doc.title || '')
      );
      setPreviewBlobUrl(blobUrl);
      setPreviewDoc({
        ...doc,
        mimeType: isPdfFile ? 'application/pdf' : (doc.mimeType || blob?.type),
      });
    } catch (err) {
      // Fallback: try downloadUrl from server API
      try {
        const res = await api.get(`/documents/${doc.documentId}/download-url`);
        if (res.downloadUrl) {
          window.open(getFileUrl(res.downloadUrl), '_blank');
        } else {
          throw new Error('Preview URL not found');
        }
      } catch (fallbackErr) {
        addToast(err.message || 'Unable to open document preview', 'error');
      }
    } finally {
      setActionLoadingDocId(null);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      ObjectStore.revokeUrl(previewBlobUrl);
    }
    setPreviewBlobUrl(null);
    setPreviewDoc(null);
  };

  // Download Document Handler (Device Storage)
  const handleDownload = async (doc) => {
    const docId = doc.documentId || doc.fileKey;
    setActionLoadingDocId(docId);
    try {
      const { blobUrl, blob } = await HALOArchive.fetchAndCacheBlob({
        documentId: doc.documentId,
        fileKey: doc.fileKey,
        metadata: doc,
      });

      const fileName = `${doc.title || 'medical_record'}.${(doc.mimeType === 'application/pdf' ? 'pdf' : (doc.title?.split('.').pop() || 'dat'))}`;

      // Native Web Share API if on mobile device supporting file sharing
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: blob.type })] })) {
        try {
          await navigator.share({
            files: [new File([blob], fileName, { type: blob.type })],
            title: doc.title,
            text: 'HALO Medical Document',
          });
          addToast('File saved to device', 'success');
          setActionLoadingDocId(null);
          return;
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.log('Native share failed, falling back to download:', shareErr);
          }
        }
      }

      // Standard browser download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => ObjectStore.revokeUrl(blobUrl), 15000);
      addToast(`"${doc.title}" downloaded to your device!`, 'success');

      // Refresh list to show offline badge
      loadDocuments();
    } catch (err) {
      console.error('[MyDocumentsPanel] Download error:', err);
      try {
        const res = await api.get(`/documents/${doc.documentId}/download-url`);
        if (res.downloadUrl) {
          window.open(getFileUrl(res.downloadUrl), '_blank');
          addToast('Opening medical record...', 'info');
        } else {
          throw new Error('Download failed');
        }
      } catch (fallbackErr) {
        addToast(err.message || 'Download failed', 'error');
      }
    } finally {
      setActionLoadingDocId(null);
    }
  };

  // Delete Document Handler (Patient Only Authority)
  const handleDelete = async (doc) => {
    const docId = doc.documentId || doc.fileKey;
    if (!window.confirm(`Permanently remove "${doc.title}"? As the patient, you hold sole deletion authority. This cannot be undone.`)) {
      return;
    }

    setDeletingDocId(docId);
    try {
      await api.delete(`/documents/${doc.documentId}`);
      if (doc.fileKey) {
        await ObjectStore.deleteObject(doc.fileKey);
      }
      addToast('Medical record permanently removed.', 'success');
      await loadDocuments();
    } catch (err) {
      console.error('[MyDocumentsPanel] Delete error:', err);
      addToast(err.message || 'Failed to remove document', 'error');
    } finally {
      setDeletingDocId(null);
    }
  };

  // Patient Upload Handler
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      addToast('Please select a file to upload', 'error');
      return;
    }
    if (!uploadForm.title.trim()) {
      addToast('Please provide a title', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('patientId', patientId);
      if (patientEpisode?.episodeId) {
        formData.append('treatmentEpisodeId', patientEpisode.episodeId);
      }
      formData.append('type', uploadForm.type);
      formData.append('title', uploadForm.title);
      formData.append('department', 'GENERAL');
      formData.append('examinationDate', uploadForm.examinationDate);

      const res = await api.post('/documents/upload', formData);

      if (res && res.s3Key) {
        await ObjectStore.putObject({
          key: res.s3Key,
          blob: uploadFile,
          metadata: {
            ...res,
            documentId: res.documentId,
            patientId,
          },
        });
      }

      addToast('Medical record archived and saved to device!', 'success');
      setUploadForm({
        title: '',
        type: 'LAB_REPORT',
        examinationDate: new Date().toISOString().split('T')[0],
      });
      setUploadFile(null);
      setShowUploadModal(false);
      await loadDocuments();
    } catch (err) {
      console.error('[MyDocumentsPanel] Upload error:', err);
      addToast(err.message || 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header card with action */}
      <div className="bg-canvas border border-hairline rounded-[20px] p-4 flex items-center justify-between shadow-xs">
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            My Medical Records &amp; Archive
          </h3>
          <p className="text-[11px] text-ink-muted-48 mt-0.5">
            Offline-accessible on device • Real-time sync with hospital archive
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={syncWithMacArchive}
            disabled={isSyncing}
            className="p-2 text-ink-muted-48 hover:text-ink bg-canvas-parchment hover:bg-canvas border border-hairline rounded-full transition-colors cursor-pointer"
            title="Sync with Archive"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin text-primary' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="text-xs font-semibold bg-primary hover:bg-primary-focus text-canvas px-3.5 py-1.5 rounded-full flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
          >
            <Plus size={13} />
            <span>Add Record</span>
          </button>
        </div>
      </div>

      {/* Search & Sort Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted-48" />
          <input
            type="text"
            placeholder="Search reports, prescriptions, tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-canvas text-ink text-xs pl-8 pr-3 py-2 rounded-full border border-hairline focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="text-xs bg-canvas text-ink border border-hairline px-3 py-2 rounded-full flex items-center gap-1 font-medium cursor-pointer"
          title={sortOrder === 'desc' ? 'Showing Newest First' : 'Showing Oldest First'}
        >
          <ArrowUpDown size={12} />
          <span className="hidden sm:inline">{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
        </button>
      </div>

      {/* Horizontal Scrolling Filter Tabs */}
      <TypeFilterTabs
        activeType={activeType}
        onSelectType={setActiveType}
      />

      {/* Documents List */}
      {isLoading ? (
        <div className="bg-canvas border border-hairline rounded-[20px] p-8 text-center text-xs text-ink-muted-48 space-y-2">
          <RefreshCw size={20} className="animate-spin mx-auto text-primary" />
          <p>Accessing your local medical archive...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-[20px] p-8 text-center space-y-2 shadow-xs">
          <FileText size={32} className="mx-auto text-ink-muted-48 opacity-40" />
          <h4 className="text-sm font-semibold text-ink">No medical documents found</h4>
          <p className="text-xs text-ink-muted-48 max-w-sm mx-auto">
            {searchQuery || activeType !== 'ALL'
              ? 'No records match your search filter. Try clearing filters.'
              : 'New reports uploaded by your physician will appear here in real time.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.documentId || doc.fileKey}
              doc={doc}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={handleDelete}
              isActionLoading={actionLoadingDocId === (doc.documentId || doc.fileKey)}
              isDeleting={deletingDocId === (doc.documentId || doc.fileKey)}
            />
          ))}
        </div>
      )}

      {/* Upload Modal for Patient */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowUploadModal(false)}
        >
          <div 
            className="bg-canvas border border-hairline rounded-[22px] max-w-md w-full p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
                <UploadCloud size={16} className="text-primary" />
                Upload Personal Medical Record
              </h4>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-ink-muted-48 hover:text-ink cursor-pointer p-1 rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            {/* Retention Notice */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-[14px] p-3 text-[11px] text-amber-700 flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Retention Notice:</strong> Reports and imaging are retained for <strong>6 months</strong> from examination date. Prescriptions and discharge summaries are kept permanently.
              </div>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Thyroid Blood Work (Sep 2026)"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Record Type *</label>
                <select
                  value={uploadForm.type}
                  onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}
                  className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="LAB_REPORT">🧪 Lab Report (6-mo auto purge)</option>
                  <option value="IMAGING">🫁 Imaging / X-Ray (6-mo auto purge)</option>
                  <option value="TEST_REPORT">🔬 Test Results (6-mo auto purge)</option>
                  <option value="PRESCRIPTION">💊 Prescription (Permanent)</option>
                  <option value="DISCHARGE_SUMMARY">📋 Discharge Summary (Permanent)</option>
                  <option value="REFERRAL">📨 Referral Letter (Permanent)</option>
                  <option value="OTHER">📄 Other Clinical Record</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Examination Date</label>
                <input
                  type="date"
                  required
                  value={uploadForm.examinationDate}
                  onChange={(e) => setUploadForm({ ...uploadForm, examinationDate: e.target.value })}
                  className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Attach File (PDF, Image up to 15MB) *</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 15 * 1024 * 1024) {
                        addToast('File exceeds 15 MB limit', 'error');
                        e.target.value = '';
                        return;
                      }
                      setUploadFile(f);
                      if (!uploadForm.title) {
                        setUploadForm((prev) => ({ ...prev, title: f.name.replace(/\.[^/.]+$/, '') }));
                      }
                    }
                  }}
                  className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-primary file:text-canvas hover:file:bg-primary-focus file:cursor-pointer text-ink-muted-48 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="text-xs text-ink px-4 py-2 rounded-full hover:bg-canvas-parchment border border-hairline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="text-xs font-semibold bg-primary hover:bg-primary-focus text-canvas px-5 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <UploadCloud size={14} />
                  {isUploading ? 'Saving...' : 'Save to Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <PreviewModal
          document={previewDoc}
          previewUrl={previewBlobUrl}
          onClose={closePreview}
          onDownload={() => handleDownload(previewDoc)}
        />
      )}
    </div>
  );
}
