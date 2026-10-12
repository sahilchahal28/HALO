import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FileText, UploadCloud, Download, ArrowUpDown, RefreshCw, 
  HardDrive, AlertTriangle, CheckCircle, ShieldCheck, Plus, Sparkles 
} from 'lucide-react';
import FilterBar from './FilterBar';
import DocumentSection from './DocumentSection';
import PreviewModal from './PreviewModal';
import { ObjectStore } from '../../../services/objectStore';
import { HALOArchive } from '../../../services/objectStore/syncEngine';
import { DOCUMENT_TYPES, DEPARTMENTS } from '../../../services/objectStore/constants';
import { api, getFileUrl } from '../../../utils/api';
import { useApp } from '../../../context/AppContext';

export default function PatientDocumentsPanel({
  patient,
  activeEpisode,
  doctorUser,
  initialDocuments = [],
}) {
  const { addToast } = useApp();
  const patientId = patient?.patientId || patient?.id;

  // Filter & Sort State
  const [filters, setFilters] = useState({
    search: '',
    department: 'ALL',
    type: 'ALL',
    dateFrom: '',
    dateTo: '',
  });

  const [sortConfig, setSortConfig] = useState({
    sortBy: 'date', // 'date' | 'title' | 'size' | 'type'
    sortOrder: 'desc',
  });

  // Data & Loading States - Initialize with initialDocuments if available for instant display
  const [documents, setDocuments] = useState(initialDocuments);
  const [isLoading, setIsLoading] = useState(!initialDocuments || initialDocuments.length === 0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageInfo, setStorageInfo] = useState({ count: 0, estimatedBytes: 0, usagePercentage: 0 });
  const [actionLoadingDocId, setActionLoadingDocId] = useState(null);

  // Sync initialDocuments if they update from parent
  useEffect(() => {
    if (initialDocuments && initialDocuments.length > 0) {
      setDocuments(prev => (prev.length === 0 ? initialDocuments : prev));
      setIsLoading(false);
    }
  }, [initialDocuments]);

  // Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);

  // Upload Modal / Form State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    type: 'LAB_REPORT',
    department: patient?.department || 'GENERAL',
    examinationDate: new Date().toISOString().split('T')[0],
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load from local ObjectStore
  const loadDocumentsFromStore = useCallback(async () => {
    if (!patientId) return;
    try {
      ObjectStore.setRole('DOCTOR');
      const res = await ObjectStore.listObjects({
        patientId,
        type: filters.type,
        department: filters.department,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        sortBy: sortConfig.sortBy,
        sortOrder: sortConfig.sortOrder,
        limit: 200,
      });

      if (res.items && res.items.length > 0) {
        setDocuments(res.items);
      } else if (initialDocuments && initialDocuments.length > 0) {
        setDocuments(initialDocuments);
      }
      const info = await ObjectStore.getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      console.error('[PatientDocumentsPanel] Error loading objects:', err);
      if (initialDocuments && initialDocuments.length > 0) {
        setDocuments(initialDocuments);
      }
    } finally {
      setIsLoading(false);
    }
  }, [patientId, filters, sortConfig, initialDocuments]);

  // Sync Delta with server
  const triggerSync = useCallback(async () => {
    if (!patientId) return;
    setIsSyncing(true);
    try {
      await HALOArchive.syncDelta({ patientId, role: 'DOCTOR' });
      await loadDocumentsFromStore();
    } catch (err) {
      console.warn('[PatientDocumentsPanel] Sync delta warning:', err.message);
    } finally {
      setIsSyncing(false);
    }
  }, [patientId, loadDocumentsFromStore]);

  // Initial load and real-time subscription
  useEffect(() => {
    if (!patientId) return;
    setIsLoading(true);

    // Initial load from IndexedDB
    loadDocumentsFromStore();

    // Subscribe to patient room
    HALOArchive.subscribePatient(patientId);

    // Run delta sync in background
    triggerSync();

    // Listen to local store updates
    const handleStoreUpdated = (e) => {
      if (!e.detail?.patientId || e.detail.patientId.toUpperCase() === patientId.toUpperCase()) {
        loadDocumentsFromStore();
      }
    };

    window.addEventListener('halo:store:updated', handleStoreUpdated);

    return () => {
      window.removeEventListener('halo:store:updated', handleStoreUpdated);
      HALOArchive.unsubscribePatient(patientId);
    };
  }, [patientId, loadDocumentsFromStore, triggerSync]);

  // Filter handlers
  const handleFilterChange = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      department: 'ALL',
      type: 'ALL',
      dateFrom: '',
      dateTo: '',
    });
  };

  // Inline Preview Handler
  const handlePreview = async (doc) => {
    const docId = doc.documentId || doc.fileKey;
    setActionLoadingDocId(docId);
    try {
      const { blobUrl } = await HALOArchive.fetchAndCacheBlob({
        documentId: doc.documentId,
        fileKey: doc.fileKey,
        metadata: doc,
      });
      setPreviewBlobUrl(blobUrl);
      setPreviewDoc(doc);
    } catch (err) {
      // Fallback: try downloadUrl from server API
      try {
        const res = await api.get(`/documents/${doc.documentId}/download-url`);
        if (res.downloadUrl) {
          window.open(getFileUrl(res.downloadUrl), '_blank');
        } else {
          throw new Error('No preview URL available');
        }
      } catch (fallbackErr) {
        addToast(err.message || 'Unable to open file preview', 'error');
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

  // On-Device Download Handler
  const handleDownload = async (doc) => {
    const docId = doc.documentId || doc.fileKey;
    setActionLoadingDocId(docId);
    try {
      const { blobUrl } = await HALOArchive.fetchAndCacheBlob({
        documentId: doc.documentId,
        fileKey: doc.fileKey,
        metadata: doc,
      });

      const fileName = `${doc.title || 'document'}.${(doc.mimeType === 'application/pdf' ? 'pdf' : (doc.title?.split('.').pop() || 'dat'))}`;
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL after brief delay
      setTimeout(() => ObjectStore.revokeUrl(blobUrl), 15000);
      addToast(`"${doc.title}" downloaded to your device`, 'success');
      
      // Update UI to reflect cached state
      loadDocumentsFromStore();
    } catch (err) {
      console.error('[PatientDocumentsPanel] Download error:', err);
      // Fallback to server download URL
      try {
        const res = await api.get(`/documents/${doc.documentId}/download-url`);
        if (res.downloadUrl) {
          window.open(getFileUrl(res.downloadUrl), '_blank');
          addToast('File download initiated via archive server', 'info');
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

  // Upload new medical report/document
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      addToast('Please select a file to attach', 'error');
      return;
    }
    if (!uploadForm.title.trim()) {
      addToast('Please specify a title for the document', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('patientId', patientId);
      if (activeEpisode?.episodeId) {
        formData.append('treatmentEpisodeId', activeEpisode.episodeId);
      }
      formData.append('type', uploadForm.type);
      formData.append('title', uploadForm.title);
      formData.append('department', uploadForm.department || 'GENERAL');
      formData.append('examinationDate', uploadForm.examinationDate);
      if (doctorUser?.name) formData.append('doctor', doctorUser.name);
      if (doctorUser?.doctorId) formData.append('doctorId', doctorUser.doctorId);
      else if (doctorUser?.id) formData.append('doctorId', doctorUser.id);

      const res = await api.post('/documents/upload', formData);

      // Cache directly into local IndexedDB
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

      addToast('Medical record archived and synchronized to patient file!', 'success');
      setUploadForm({
        title: '',
        type: 'LAB_REPORT',
        department: patient?.department || 'GENERAL',
        examinationDate: new Date().toISOString().split('T')[0],
      });
      setUploadFile(null);
      setShowUploadForm(false);
      await loadDocumentsFromStore();
    } catch (err) {
      console.error('[PatientDocumentsPanel] Upload failed:', err);
      addToast(err.message || 'Failed to archive document', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Group documents by type for categorized clinical view
  const groupedDocs = DOCUMENT_TYPES.reduce((acc, type) => {
    const list = documents.filter((d) => d.type === type);
    if (list.length > 0) acc[type] = list;
    return acc;
  }, {});

  // Documents matching other/unlisted types
  const otherDocs = documents.filter((d) => !DOCUMENT_TYPES.includes(d.type));
  if (otherDocs.length > 0) groupedDocs['OTHER'] = [...(groupedDocs['OTHER'] || []), ...otherDocs];

  return (
    <div className="space-y-4">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-canvas border border-hairline rounded-[20px] p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">
              Clinical Records &amp; Archive
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
              {documents.length} Records
            </span>
          </div>
          <p className="text-[11px] text-ink-muted-48 mt-0.5">
            Synchronized patient object storage • IndexedDB local cache • MacBook disk archive
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Storage usage indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-ink-muted-48 bg-canvas-parchment px-3 py-1.5 rounded-full border border-hairline">
            <HardDrive size={12} className="text-primary" />
            <span>{(storageInfo.estimatedBytes / 1024 / 1024).toFixed(1)} MB used</span>
          </div>

          <button
            type="button"
            onClick={triggerSync}
            disabled={isSyncing}
            className="p-2 text-ink-muted-48 hover:text-ink bg-canvas-parchment hover:bg-canvas border border-hairline rounded-full transition-colors cursor-pointer"
            title="Refresh &amp; Sync Delta"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-primary' : ''} />
          </button>

          {/* Sort By Toggle */}
          <div className="flex items-center gap-1 bg-canvas-parchment border border-hairline rounded-full p-0.5">
            <select
              value={sortConfig.sortBy}
              onChange={(e) => setSortConfig((prev) => ({ ...prev, sortBy: e.target.value }))}
              className="bg-transparent text-ink text-xs px-2.5 py-1 focus:outline-none cursor-pointer"
            >
              <option value="date">Date</option>
              <option value="title">Title</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
            <button
              type="button"
              onClick={() => setSortConfig((prev) => ({ ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' }))}
              className="p-1 hover:text-primary text-ink-muted-48 transition-colors cursor-pointer"
              title={sortConfig.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              <ArrowUpDown size={13} />
            </button>
          </div>

          {/* Attach Record Button */}
          <button
            type="button"
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="flex-1 sm:flex-none text-xs font-semibold bg-primary hover:bg-primary-focus text-canvas px-4 py-2 rounded-full flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus size={14} />
            <span>Attach Record</span>
          </button>
        </div>
      </div>

      {/* Upload Accordion / Modal */}
      {showUploadForm && (
        <form
          onSubmit={handleUploadSubmit}
          className="bg-canvas border border-hairline rounded-[20px] p-5 space-y-4 shadow-sm animate-fadeIn"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div>
              <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
                <UploadCloud size={16} className="text-primary" />
                Upload New Clinical Document
              </h4>
              <p className="text-[11px] text-ink-muted-48">
                Attached to patient file and synchronized to both MacBook archive &amp; offline IndexedDB.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="text-xs text-ink-muted-48 hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* 6-Month Retention Notice Notice */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-[14px] p-3 text-[11px] text-amber-700 flex items-start gap-2">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong className="font-semibold">Retention Notice:</strong> Lab reports, imaging, and test results are automatically purged after <strong>6 months (180 days)</strong> from examination date. Prescriptions, discharge summaries, and referrals are kept <strong>permanently</strong>.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink block mb-1">Document Title *</label>
              <input
                type="text"
                placeholder="e.g. Complete Blood Count (CBC)"
                required
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-ink block mb-1">Category / Type *</label>
              <select
                value={uploadForm.type}
                onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}
                className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="LAB_REPORT">🧪 Lab Report (6-mo auto purge)</option>
                <option value="IMAGING">🫁 Imaging / X-Ray / CT (6-mo auto purge)</option>
                <option value="TEST_REPORT">🔬 Test Results (6-mo auto purge)</option>
                <option value="PRESCRIPTION">💊 Prescription (Permanent)</option>
                <option value="DISCHARGE_SUMMARY">📋 Discharge Summary (Permanent)</option>
                <option value="REFERRAL">📨 Referral Letter (Permanent)</option>
                <option value="OTHER">📄 Other Record</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-ink block mb-1">Department</label>
              <select
                value={uploadForm.department}
                onChange={(e) => setUploadForm({ ...uploadForm, department: e.target.value })}
                className="w-full text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-2 text-ink focus:border-primary focus:outline-none cursor-pointer"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
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
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink block mb-1">File Attachment (PDF, JPG, PNG up to 15MB) *</label>
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
              className="text-xs file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-primary file:text-canvas hover:file:bg-primary-focus file:cursor-pointer text-ink-muted-48 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="text-xs text-ink px-4 py-2 rounded-full hover:bg-canvas-parchment border border-hairline cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="text-xs font-semibold bg-primary hover:bg-primary-focus text-canvas px-5 py-2 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <UploadCloud size={14} />
              {isUploading ? 'Archiving & Syncing...' : 'Upload & Archive'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        totalResults={documents.length}
      />

      {/* Grouped Document Sections */}
      {isLoading ? (
        <div className="bg-canvas border border-hairline rounded-[20px] p-8 text-center text-xs text-ink-muted-48 space-y-2">
          <RefreshCw size={20} className="animate-spin mx-auto text-primary" />
          <p>Loading patient records from local archive...</p>
        </div>
      ) : Object.keys(groupedDocs).length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-[20px] p-8 text-center space-y-2 shadow-xs">
          <FileText size={32} className="mx-auto text-ink-muted-48 opacity-40" />
          <h4 className="text-sm font-semibold text-ink">No records found</h4>
          <p className="text-xs text-ink-muted-48 max-w-sm mx-auto">
            {filters.search || filters.type !== 'ALL' || filters.department !== 'ALL'
              ? 'No medical documents match the selected filters. Try resetting search criteria.'
              : 'No medical records or test reports have been attached to this patient file yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedDocs).map(([type, docs]) => (
            <DocumentSection
              key={type}
              type={type}
              documents={docs}
              onPreview={handlePreview}
              onDownload={handleDownload}
              actionLoadingDocId={actionLoadingDocId}
            />
          ))}
        </div>
      )}

      {/* Inline Preview Lightbox Modal */}
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
