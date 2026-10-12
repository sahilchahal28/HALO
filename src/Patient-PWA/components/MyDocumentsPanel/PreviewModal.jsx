import React, { useEffect } from 'react';
import { X, Download, Maximize2, ExternalLink, FileText } from 'lucide-react';

export default function PreviewModal({ document, previewUrl, onClose, onDownload }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!document || !previewUrl) return null;

  const isPdf = document.mimeType === 'application/pdf' || document.title?.toLowerCase().endsWith('.pdf');
  const isImage = document.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(document.title || '');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-canvas border border-hairline w-full max-w-4xl h-[88vh] max-h-[850px] flex flex-col rounded-[22px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline bg-canvas">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink truncate">{document.title}</h3>
              <p className="text-[11px] text-ink-muted-48">
                {document.type?.replace('_', ' ')} • {document.department || 'GENERAL'} • {document.doctor || 'Attending Physician'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onDownload}
              className="text-xs font-medium bg-primary hover:bg-primary-focus text-canvas px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download size={13} />
              Download
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-ink hover:bg-canvas-parchment border border-hairline px-3 py-1.5 rounded-full hidden sm:flex items-center gap-1.5 transition-colors"
              title="Open in new window"
            >
              <ExternalLink size={13} />
              Pop out
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-muted-48 hover:text-ink hover:bg-canvas-parchment p-1.5 rounded-full transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 bg-canvas-parchment relative overflow-auto flex items-center justify-center p-2 sm:p-4">
          {isPdf ? (
            <iframe
              src={previewUrl}
              title={document.title}
              className="w-full h-full rounded-[14px] border border-hairline shadow-sm bg-canvas"
            />
          ) : isImage ? (
            <div className="max-w-full max-h-full flex items-center justify-center">
              <img
                src={previewUrl}
                alt={document.title}
                className="max-w-full max-h-[75vh] object-contain rounded-[14px] shadow-md border border-hairline"
              />
            </div>
          ) : (
            <div className="text-center p-8 space-y-3">
              <FileText size={48} className="mx-auto text-ink-muted-48 opacity-60" />
              <p className="text-sm font-semibold text-ink">Preview unavailable for this format</p>
              <p className="text-xs text-ink-muted-48">Please download the file directly to view it on your device.</p>
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold px-4 py-2 rounded-full cursor-pointer"
              >
                <Download size={14} />
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-2.5 bg-canvas border-t border-hairline text-[11px] text-ink-muted-48 flex items-center justify-between">
          <span>Examination: {new Date(document.examinationDate || document.createdAt).toLocaleDateString()}</span>
          <span>{document.fileSize ? `${(document.fileSize / 1024 / 1024).toFixed(2)} MB` : ''}</span>
        </div>
      </div>
    </div>
  );
}
