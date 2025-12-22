/**
 * Command Palette Component
 *
 * A searchable command palette for quick access to app actions.
 * Triggered via keyboard shortcut (Cmd+Shift+P or Ctrl+Shift+P).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  FolderOpen,
  PlusCircle,
  Calendar,
  Command,
} from 'lucide-react';
import { useExportStore } from '../../stores/exportStore';
import { useNoteStore } from '../../stores/noteStore';
import { useEditorGroupStore } from '../../stores/editorGroupStore';

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  category: 'export' | 'note' | 'view' | 'settings';
  action: () => void | Promise<void>;
  keywords?: string[];
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { openExportModal, setSelectedNoteIds } = useExportStore();
  const { createNote } = useNoteStore();
  const { openTab, getActiveTab } = useEditorGroupStore();

  // Get the current active note ID
  const activeNoteId = useMemo(() => {
    const activeTab = getActiveTab();
    return activeTab?.type === 'note' ? activeTab.id : undefined;
  }, [getActiveTab]);

  // Define available commands
  const commands: CommandItem[] = useMemo(() => {
    const cmds: CommandItem[] = [
      // Export commands
      {
        id: 'export-current-pdf',
        title: 'Export Current Note as PDF',
        description: 'Export the current note to PDF format',
        icon: <FileText size={16} />,
        category: 'export',
        keywords: ['pdf', 'export', 'download', 'document'],
        action: async () => {
          if (activeNoteId) {
            setSelectedNoteIds([activeNoteId]);
            openExportModal();
          }
        },
      },
      {
        id: 'export-current-docx',
        title: 'Export Current Note as DOCX',
        description: 'Export the current note to Word format',
        icon: <FileText size={16} />,
        category: 'export',
        keywords: ['docx', 'word', 'export', 'download', 'document'],
        action: async () => {
          if (activeNoteId) {
            setSelectedNoteIds([activeNoteId]);
            openExportModal();
          }
        },
      },
      {
        id: 'export-tables-xlsx',
        title: 'Export Tables to XLSX',
        description: 'Export tables from current note to Excel',
        icon: <FileSpreadsheet size={16} />,
        category: 'export',
        keywords: ['xlsx', 'excel', 'spreadsheet', 'table', 'export'],
        action: async () => {
          if (activeNoteId) {
            setSelectedNoteIds([activeNoteId]);
            openExportModal();
          }
        },
      },
      {
        id: 'export-multiple',
        title: 'Export Multiple Notes...',
        description: 'Select multiple notes to export together',
        icon: <Download size={16} />,
        category: 'export',
        keywords: ['export', 'multiple', 'batch', 'notes'],
        action: () => {
          setSelectedNoteIds([]);
          openExportModal();
        },
      },
      {
        id: 'view-exports',
        title: 'View Exports',
        description: 'Browse and manage exported documents',
        icon: <FolderOpen size={16} />,
        category: 'view',
        keywords: ['exports', 'documents', 'files', 'browse'],
        action: () => {
          // Note: exports view would need to be a tab type
          openExportModal();
        },
      },
      // Note commands
      {
        id: 'new-note',
        title: 'New Note',
        description: 'Create a new note',
        icon: <PlusCircle size={16} />,
        category: 'note',
        keywords: ['create', 'new', 'note', 'add'],
        action: async () => {
          const note = await createNote('Untitled');
          if (note) {
            openTab({ type: 'note', id: note.id });
          }
        },
      },
      {
        id: 'daily-note',
        title: 'Open Today\'s Daily Note',
        description: 'Open or create today\'s daily note',
        icon: <Calendar size={16} />,
        category: 'note',
        keywords: ['daily', 'today', 'journal', 'note'],
        action: () => {
          // Daily note would need special handling - for now just open graph
          openTab({ type: 'graph', id: 'main' });
        },
      },
    ];

    return cmds;
  }, [activeNoteId, setSelectedNoteIds, openExportModal, openTab, createNote]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    
    const searchTerms = query.toLowerCase().split(/\s+/);
    return commands.filter(cmd => {
      const searchableText = [
        cmd.title,
        cmd.description || '',
        ...(cmd.keywords || []),
      ].join(' ').toLowerCase();
      
      return searchTerms.every(term => searchableText.includes(term));
    });
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const categoryLabels: Record<string, string> = {
    export: 'Export',
    note: 'Notes',
    view: 'View',
    settings: 'Settings',
  };

  // Handle keyboard shortcut to open palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+P or Ctrl+Shift+P
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setIsOpen(true);
        setQuery('');
        setSelectedIndex(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Handle navigation and selection
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selectedCommand = filteredCommands[selectedIndex];
      if (selectedCommand) {
        selectedCommand.action();
        setIsOpen(false);
      }
      return;
    }
  }, [filteredCommands, selectedIndex]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredCommands.length]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    cmd.action();
    setIsOpen(false);
  }, []);

  if (!isOpen) return null;

  let currentIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={() => setIsOpen(false)}
      />

      {/* Palette */}
      <div
        className="fixed left-1/2 top-[20%] z-50 flex w-full max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Command size={18} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />
          <kbd
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Commands List */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto py-2"
        >
          {filteredCommands.length === 0 ? (
            <p
              className="px-4 py-6 text-center text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              No commands found
            </p>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div
                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {categoryLabels[category] || category}
                </div>
                {cmds.map(cmd => {
                  const index = currentIndex++;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-index={index}
                      onClick={() => executeCommand(cmd)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--color-bg-hover)'
                          : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {cmd.title}
                        </p>
                        {cmd.description && (
                          <p
                            className="text-xs truncate"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {cmd.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-4 py-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-[var(--color-bg-secondary)] px-1.5 py-0.5">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-[var(--color-bg-secondary)] px-1.5 py-0.5">↵</kbd>
              Select
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

