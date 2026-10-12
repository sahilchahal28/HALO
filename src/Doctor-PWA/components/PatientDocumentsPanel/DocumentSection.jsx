import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import DocumentCard from './DocumentCard';
import { TYPE_META } from '../../../services/objectStore/constants';

export default function DocumentSection({
  type,
  documents,
  onPreview,
  onDownload,
  actionLoadingDocId,
  defaultExpanded = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = TYPE_META[type] || TYPE_META.OTHER;

  if (!documents || documents.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Collapsible Section Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-1.5 px-1 text-left text-ink hover:text-primary transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.icon}</span>
          <span className="text-sm font-semibold tracking-tight">{meta.label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-canvas-parchment text-ink-muted-48 border border-hairline font-mono font-medium">
            {documents.length}
          </span>
        </div>

        <div className="text-ink-muted-48 group-hover:text-primary transition-colors">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Cards inside Section */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fadeIn">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.documentId || doc.fileKey}
              doc={doc}
              onPreview={onPreview}
              onDownload={onDownload}
              actionLoadingDocId={actionLoadingDocId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
