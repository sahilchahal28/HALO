import React from 'react';
import { Download, Eye, Trash2, Calendar, HardDrive, Clock, ShieldAlert, Share2 } from 'lucide-react';
import { TYPE_META } from '../../../services/objectStore/constants';

export default function DocumentCard({
  doc,
  onPreview,
  onDownload,
  onDelete,
  isActionLoading,
  isDeleting,
}) {
  const meta = TYPE_META[doc.type] || TYPE_META.OTHER;

  let retentionText = 'Permanent Record';
  let isExpiring = false;
  if (doc.retentionPolicy?.autoDelete) {
    isExpiring = true;
    if (doc.retentionPolicy?.expiresAt) {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(doc.retentionPolicy.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );
      retentionText = `${daysLeft} days remaining`;
    } else {
      retentionText = '6-Month Auto-Purge';
    }
  }

  return (
    <div className="bg-canvas border border-hairline rounded-[18px] p-4 space-y-3 shadow-xs hover:border-ink/20 transition-all">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0" role="img" aria-label={meta.label}>
            {meta.icon}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-ink truncate" title={doc.title}>
              {doc.title}
            </h4>
            <p className="text-[11px] text-ink-muted-48 truncate mt-0.5">
              {doc.department || 'GENERAL'} • {doc.doctor || doc.uploadedBy || 'Hospital Staff'}
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            disabled={isActionLoading}
            onClick={() => onPreview(doc)}
            className="text-[11px] font-medium text-ink bg-canvas hover:bg-canvas-parchment border border-hairline px-2.5 py-1.5 rounded-full flex items-center gap-1 cursor-pointer transition-colors"
            title="Preview Inline"
          >
            <Eye size={12} className="text-primary" />
            <span className="hidden sm:inline">Preview</span>
          </button>

          <button
            type="button"
            disabled={isActionLoading}
            onClick={() => onDownload(doc)}
            className="text-[11px] font-semibold bg-primary hover:bg-primary-focus text-canvas px-3 py-1.5 rounded-full flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
            title="Download to Device"
          >
            <Download size={12} />
            <span>{isActionLoading ? 'Opening...' : 'Download'}</span>
          </button>
        </div>
      </div>

      {/* Meta tags & status row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-hairline/70 text-[10px] text-ink-muted-48 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 font-mono">
            <Calendar size={11} />
            {new Date(doc.examinationDate || doc.createdAt || doc.uploadedAt).toLocaleDateString()}
          </span>

          {doc.fileSize ? (
            <span className="px-2 py-0.5 rounded-full bg-canvas-parchment border border-hairline font-mono">
              {(doc.fileSize / 1024).toFixed(0)} KB
            </span>
          ) : null}

          {doc.hasCachedBlob && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium border border-emerald-500/20">
              <HardDrive size={10} />
              Stored on Device
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {doc.legalHold && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-medium border border-red-500/20">
              <ShieldAlert size={10} />
              Legal Hold
            </span>
          )}

          {isExpiring ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 font-medium border border-amber-500/20">
              <Clock size={10} />
              {retentionText}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium border border-emerald-500/20">
              🛡️ Permanent
            </span>
          )}

          {/* Patient-Only Delete Trigger */}
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onDelete(doc)}
            className="text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200/80 p-1 rounded-full transition-colors cursor-pointer ml-1"
            title="Permanently remove (Patient authority)"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
