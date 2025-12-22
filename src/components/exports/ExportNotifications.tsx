/**
 * Export Notifications
 * 
 * Toast notifications for completed exports.
 * Shows success/error status with option to open the export.
 */

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X, FileText, File, Presentation, FileSpreadsheet } from 'lucide-react';
import { useExportStore, type CompletedExport } from '../../stores/exportStore';
import type { ExportFormat } from '../../types';

function getFormatIcon(format: ExportFormat) {
  switch (format) {
    case 'pdf':
      return FileText;
    case 'docx':
      return File;
    case 'pptx':
      return Presentation;
    case 'xlsx':
      return FileSpreadsheet;
    default:
      return FileText;
  }
}

function ExportToast({ export_: completedExport }: { export_: CompletedExport }) {
  const { dismissCompletedExport } = useExportStore();
  const [isVisible, setIsVisible] = useState(false);
  
  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => dismissCompletedExport(completedExport.id), 200);
  };

  const FormatIcon = getFormatIcon(completedExport.format);

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-xl p-4 shadow-lg transition-all duration-200"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        opacity: isVisible ? 1 : 0,
      }}
    >
      {/* Status Icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: completedExport.success
            ? 'rgba(34, 197, 94, 0.1)'
            : 'rgba(239, 68, 68, 0.1)',
        }}
      >
        {completedExport.success ? (
          <CheckCircle size={18} style={{ color: '#22c55e' }} />
        ) : (
          <XCircle size={18} style={{ color: '#ef4444' }} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FormatIcon
            size={14}
            style={{ color: 'var(--color-text-tertiary)' }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {completedExport.success ? 'Export Complete' : 'Export Failed'}
          </span>
        </div>
        <p
          className="mt-1 truncate text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {completedExport.success
            ? completedExport.filename
            : completedExport.error || 'An error occurred'}
        </p>
      </div>

      {/* Close Button */}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-black/10"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ExportNotifications() {
  const { completedExports } = useExportStore();

  if (completedExports.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {completedExports.map((export_) => (
        <ExportToast key={export_.id} export_={export_} />
      ))}
    </div>
  );
}

