/**
 * Export Modal Component
 *
 * Modal for exporting notes to various document formats (PDF, DOCX, XLSX, PPTX).
 * Uses AI agent to intelligently structure documents.
 * Exports run in the background and are tracked in the agent activity indicator.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  Check,
  FileText,
  FileSpreadsheet,
  File,
  Presentation,
  Sparkles,
} from 'lucide-react';
import { useExportStore } from '../../stores/exportStore';
import { useNoteStore } from '../../stores/noteStore';
import type { ExportFormat } from '../../types';

const AVAILABLE_FORMATS: { format: ExportFormat; label: string; icon: React.ReactNode; description: string }[] = [
  { format: 'pdf', label: 'PDF', icon: <FileText size={24} />, description: 'Best for sharing' },
  { format: 'docx', label: 'Word', icon: <File size={24} />, description: 'Editable document' },
  { format: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={24} />, description: 'Tables & data' },
  { format: 'pptx', label: 'PowerPoint', icon: <Presentation size={24} />, description: 'Presentations' },
];

export function ExportModal() {
  const {
    isExportModalOpen,
    closeExportModal,
    selectedNoteIds,
    setSelectedNoteIds,
    startBackgroundExport,
    exportContentToXlsx,
  } = useExportStore();

  const { notes } = useNoteStore();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [title, setTitle] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isExportModalOpen) {
      setSearchQuery('');
      setError(null);
      setCustomInstructions('');
      setShowCustomInstructions(false);
      
      // Generate default title from selected notes
      if (selectedNoteIds.length === 1) {
        const note = notes.find(n => n.id === selectedNoteIds[0]);
        if (note) {
          setTitle(note.title);
        }
      } else if (selectedNoteIds.length > 1) {
        setTitle('Combined Export');
      } else {
        setTitle('');
      }

      // Focus search input after a short delay
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isExportModalOpen, selectedNoteIds, notes]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExportModalOpen) {
        closeExportModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExportModalOpen, closeExportModal]);

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes.filter(n => !n.isDeleted);
    const query = searchQuery.toLowerCase();
    return notes.filter(
      n => !n.isDeleted && n.title.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);

  // Selected notes
  const selectedNotes = useMemo(() => {
    return notes.filter(n => selectedNoteIds.includes(n.id));
  }, [notes, selectedNoteIds]);

  const toggleNoteSelection = (noteId: string) => {
    if (selectedNoteIds.includes(noteId)) {
      setSelectedNoteIds(selectedNoteIds.filter(id => id !== noteId));
    } else {
      setSelectedNoteIds([...selectedNoteIds, noteId]);
    }
  };

  const handleExport = () => {
    if (selectedNoteIds.length === 0) {
      setError('Please select at least one note');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    // Start export in background
    if (selectedFormat === 'xlsx') {
      // For XLSX, combine note content
      const content = selectedNotes
        .map(n => n.content || '')
        .join('\n\n');
      exportContentToXlsx(content, title);
    } else {
      // Use AI export agent for PDF, DOCX, PPTX
      startBackgroundExport(
        selectedNoteIds,
        title,
        selectedFormat,
        customInstructions.trim() || undefined
      );
    }
    
    // Close modal immediately - export runs in background
    closeExportModal();
  };

  if (!isExportModalOpen) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
        onClick={closeExportModal}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl shadow-xl transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'var(--color-accent-light)' }}
            >
              <Sparkles size={20} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <h2
                className="text-xl font-semibold tracking-tight"
                style={{ color: 'var(--color-text-primary)' }}
              >
                AI Export
              </h2>
              <p
                className="mt-0.5 text-sm"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Export runs in background • Check agent activity for progress
              </p>
            </div>
          </div>
          <button
            onClick={closeExportModal}
            className="rounded-full p-2 transition-all duration-150 hover:scale-105"
            style={{ 
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div 
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{ maxHeight: 'calc(85vh - 180px)' }}
        >
          {/* Search */}
          <div className="relative mb-4">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-0 py-2.5 pl-10 pr-4 text-sm transition-all duration-150 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
              }}
            />
          </div>

          {/* Selected Notes Tags */}
          {selectedNotes.length > 0 && (
            <div className="mb-4">
              <p
                className="mb-2 text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Selected ({selectedNotes.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedNotes.map(note => (
                  <span
                    key={note.id}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:scale-[1.02]"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      color: 'white',
                    }}
                  >
                    {note.title.length > 20 ? `${note.title.slice(0, 20)}...` : note.title}
                    <button
                      onClick={() => toggleNoteSelection(note.id)}
                      className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/20"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes List */}
          <div
            className="mb-5 max-h-40 overflow-y-auto rounded-xl"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
          >
            {filteredNotes.length === 0 ? (
              <p
                className="p-6 text-center text-sm"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                No notes found
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {filteredNotes.map(note => {
                  const isSelected = selectedNoteIds.includes(note.id);
                  return (
                    <button
                      key={note.id}
                      onClick={() => toggleNoteSelection(note.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--color-accent-light)'
                          : 'transparent',
                      }}
                    >
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-all duration-150"
                        style={{
                          borderWidth: '2px',
                          borderStyle: 'solid',
                          borderColor: isSelected
                            ? 'var(--color-accent)'
                            : 'var(--color-border)',
                          backgroundColor: isSelected
                            ? 'var(--color-accent)'
                            : 'transparent',
                        }}
                      >
                        {isSelected && <Check size={12} color="white" strokeWidth={3} />}
                      </div>
                      <span
                        className="flex-1 truncate text-sm font-medium"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {note.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Format Selection */}
          <div className="mb-5">
            <label
              className="mb-3 block text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Format
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {AVAILABLE_FORMATS.map(({ format, label, icon, description }) => {
                const isActive = selectedFormat === format;
                return (
                  <button
                    key={format}
                    onClick={() => setSelectedFormat(format)}
                    className="group flex flex-col items-center gap-2.5 rounded-xl px-4 py-4 transition-all duration-150 hover:scale-[1.02]"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--color-accent-light)'
                        : 'var(--color-bg-secondary)',
                      borderWidth: '2px',
                      borderStyle: 'solid',
                      borderColor: isActive
                        ? 'var(--color-accent)'
                        : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        color: isActive
                          ? 'var(--color-accent)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {icon}
                    </div>
                    <div className="text-center">
                      <p
                        className="text-sm font-semibold"
                        style={{
                          color: isActive
                            ? 'var(--color-accent)'
                            : 'var(--color-text-primary)',
                        }}
                      >
                        {label}
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title Input */}
          <div className="mb-4">
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter document title..."
              className="w-full rounded-xl border-0 px-4 py-2.5 text-sm transition-all duration-150 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
              }}
            />
          </div>

          {/* Custom Instructions Toggle */}
          {selectedFormat !== 'xlsx' && (
            <div className="mb-4">
              <button
                onClick={() => setShowCustomInstructions(!showCustomInstructions)}
                className="flex items-center gap-2 text-sm transition-colors"
                style={{ color: 'var(--color-accent)' }}
              >
                <Sparkles size={14} />
                {showCustomInstructions ? 'Hide' : 'Add'} custom instructions
              </button>
              
              {showCustomInstructions && (
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="e.g., 'Focus on key takeaways only' or 'Create a summary slide at the end'"
                  rows={2}
                  className="mt-2 w-full rounded-xl border-0 px-4 py-2.5 text-sm transition-all duration-150 focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
                    resize: 'none',
                  }}
                />
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="mt-4 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-5"
          style={{
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '0 0 1rem 1rem',
          }}
        >
          <button
            onClick={closeExportModal}
            className="rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:scale-[1.02]"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-primary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={selectedNoteIds.length === 0}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              backgroundColor: 'var(--color-accent)',
              boxShadow: '0 2px 8px rgba(var(--color-accent-rgb, 99, 102, 241), 0.25)',
            }}
          >
            <Sparkles size={16} />
            Start Export
          </button>
        </div>
      </div>
    </>
  );
}
