/**
 * Exports View Component
 *
 * Displays a list of all generated exports with options to open or delete them.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Trash2,
  ExternalLink,
  FolderOpen,
  Clock,
  Loader2,
  FileDown,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useExportStore } from '../../stores/exportStore';
import type { Export, ExportFormat } from '../../types';

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getFormatIcon(format: ExportFormat) {
  switch (format) {
    case 'pdf':
      return <FileText size={18} className="text-red-500" />;
    case 'docx':
      return <FileText size={18} className="text-blue-500" />;
    case 'xlsx':
      return <FileSpreadsheet size={18} className="text-green-500" />;
    case 'pptx':
      return <Presentation size={18} className="text-orange-500" />;
    default:
      return <FileDown size={18} />;
  }
}

interface ExportItemProps {
  export_: Export;
  onOpen: () => void;
  onDelete: () => void;
}

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  exportTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function ConfirmDeleteModal({ isOpen, exportTitle, onConfirm, onCancel, isDeleting }: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-xl"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
          >
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div className="flex-1">
            <h3
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Delete Export
            </h3>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Are you sure you want to delete &ldquo;{exportTitle}&rdquo;? This action cannot be undone.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 transition-colors hover:bg-opacity-10"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#ef4444' }}
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function ExportItem({ export_, onOpen, onDelete }: ExportItemProps) {
  return (
    <div
      className="group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Icon */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        {getFormatIcon(export_.format)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3
          className="truncate text-sm font-medium"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {export_.title}
        </h3>
        <div
          className="mt-0.5 flex items-center gap-3 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span className="uppercase">{export_.format}</span>
          <span>•</span>
          <span>{formatFileSize(export_.fileSize)}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(export_.createdAt)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onOpen}
          className="rounded-lg p-2 transition-colors hover:bg-opacity-10"
          style={{ color: 'var(--color-accent)' }}
          title="Open file"
        >
          <ExternalLink size={16} />
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
          title="Delete export"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export function ExportsView() {
  const {
    exports,
    isLoading,
    error,
    loadExports,
    openExport,
    deleteExport,
    revealExportsFolder,
    openExportModal,
  } = useExportStore();

  // State for delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [exportToDelete, setExportToDelete] = useState<Export | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadExports();
  }, [loadExports]);

  // Group exports by date
  const groupedExports = useMemo(() => {
    const groups: Record<string, Export[]> = {};
    
    for (const export_ of exports) {
      const dateKey = formatDate(export_.createdAt);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(export_);
    }
    
    return groups;
  }, [exports]);

  const handleDeleteClick = (export_: Export) => {
    setExportToDelete(export_);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!exportToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteExport(exportToDelete.id);
      setDeleteModalOpen(false);
      setExportToDelete(null);
    } catch (err) {
      console.error('Failed to delete export:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalOpen(false);
    setExportToDelete(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <FileDown
            size={24}
            style={{ color: 'var(--color-accent)' }}
          />
          <h1
            className="text-xl font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Exports
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={revealExportsFolder}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <FolderOpen size={16} />
            Open Folder
          </button>
          <button
            onClick={() => openExportModal()}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white transition-colors"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <FileDown size={16} />
            New Export
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2
              size={24}
              className="animate-spin"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-red-500">{error}</p>
          </div>
        ) : exports.length === 0 ? (
          <div className="py-12 text-center">
            <FileDown
              size={48}
              className="mx-auto mb-4"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <h3
              className="mb-2 text-lg font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              No exports yet
            </h3>
            <p
              className="mb-4 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Export your notes to PDF, Word, or Excel format.
            </p>
            <button
              onClick={() => openExportModal()}
              className="rounded-lg px-4 py-2 text-sm text-white transition-colors"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Create Export
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedExports).map(([date, dateExports]) => (
              <div key={date}>
                <h2
                  className="mb-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {date}
                </h2>
                <div className="space-y-2">
                  {dateExports.map(export_ => (
                    <ExportItem
                      key={export_.id}
                      export_={export_}
                      onOpen={() => openExport(export_.id)}
                      onDelete={() => handleDeleteClick(export_)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        exportTitle={exportToDelete?.title ?? ''}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

