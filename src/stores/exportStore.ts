/**
 * Export Store
 * 
 * Manages document exports state including listing, creating, and deleting exports.
 * Uses AI agents to intelligently structure documents.
 * Exports run in the background and are tracked via the agent activity indicator.
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { Export, ExportFormat, ExportResult } from '../types';
import { useAgentActivityStore } from './agentActivityStore';

/** Export-specific progress event from backend */
interface ExportProgressEvent {
  type: 'started' | 'readingNote' | 'creatingDocument' | 'addingContent' | 'addingTable' | 'saving' | 'completed' | 'error';
  // For 'started'
  title?: string;
  format?: string;
  noteCount?: number;
  // For 'readingNote'
  noteId?: string;
  // For 'addingContent'
  sectionType?: string;
  preview?: string;
  // For 'addingTable'
  rows?: number;
  cols?: number;
  // For 'completed'
  filename?: string;
  path?: string;
  // For 'error'
  message?: string;
}

/** Result from running the export agent */
interface ExportAgentResult {
  finalResponse: string;
  exportId: string | null;
  exportPath: string | null;
  exportFilename: string | null;
  iterations: number;
  toolsUsed: string[];
}

/** Completed export notification */
export interface CompletedExport {
  id: string;
  filename: string;
  format: ExportFormat;
  success: boolean;
  error?: string;
  timestamp: number;
}

interface ExportState {
  exports: Export[];
  isLoading: boolean;
  isExporting: boolean; // True while any export is in progress
  error: string | null;
  isExportModalOpen: boolean;
  selectedNoteIds: string[];
  
  // Recently completed exports for notifications
  completedExports: CompletedExport[];
  
  // Actions
  loadExports: () => Promise<void>;
  
  // Background AI-powered export (fire and forget)
  startBackgroundExport: (
    noteIds: string[],
    title: string,
    format: ExportFormat,
    customInstructions?: string
  ) => void;
  
  // Legacy export functions (kept for backward compatibility, now async background)
  exportNoteToPdf: (noteId: string, title?: string) => void;
  exportNoteToDocx: (noteId: string, title?: string) => void;
  exportNotesToPdf: (noteIds: string[], title: string, pageBreaks?: boolean) => void;
  exportNotesToDocx: (noteIds: string[], title: string, pageBreaks?: boolean) => void;
  exportContentToXlsx: (content: string, title: string) => void;
  exportNotesToPptx: (noteIds: string[], title: string) => void;
  
  // Simple export functions for toolbar
  exportNotesPdf: (noteIds: string[]) => void;
  exportNotesDocx: (noteIds: string[]) => void;
  exportSelectionXlsx: (content: string, title: string) => void;
  
  deleteExport: (id: string) => Promise<void>;
  openExport: (id: string) => Promise<void>;
  revealExportsFolder: () => Promise<void>;
  
  // Modal actions
  openExportModal: (noteIds?: string[]) => void;
  closeExportModal: () => void;
  setSelectedNoteIds: (noteIds: string[]) => void;
  
  // Notification actions
  addCompletedExport: (export_: CompletedExport) => void;
  dismissCompletedExport: (id: string) => void;
  clearCompletedExports: () => void;
}

export const useExportStore = create<ExportState>((set, get) => ({
  exports: [],
  isLoading: false,
  isExporting: false,
  error: null,
  isExportModalOpen: false,
  selectedNoteIds: [],
  completedExports: [],
  
  loadExports: async () => {
    set({ isLoading: true, error: null });
    try {
      const exports = await invoke<Export[]>('list_exports');
      set({ exports, isLoading: false });
    } catch (error) {
      console.error('Failed to load exports:', error);
      set({ error: String(error), isLoading: false });
    }
  },
  
  // Background AI-powered export (fire and forget)
  startBackgroundExport: (
    noteIds: string[],
    title: string,
    format: ExportFormat,
    customInstructions?: string
  ) => {
    const agentId = `export-${format}-${Date.now()}`;
    const { queueTask, updateAgentDescription } = useAgentActivityStore.getState();
    
    const noteCount = noteIds.length;
    const formatLabel = format.toUpperCase();
    
    // Queue the export task
    queueTask(
      {
        id: agentId,
        type: 'export',
        description: `${formatLabel}: ${title} (${noteCount} note${noteCount > 1 ? 's' : ''})`,
      },
      async () => {
        let unlisten: UnlistenFn | null = null;
        let iterationCount = 0;
        
        try {
          // Set up progress event listener for export-specific events
          unlisten = await listen<ExportProgressEvent>('export-agent-progress', (event) => {
            const progress = event.payload;
            
            // Update background task UI based on progress events
            switch (progress.type) {
              case 'readingNote':
                iterationCount++;
                updateAgentDescription(agentId, `${formatLabel}: Reading notes...`);
                break;
              case 'creatingDocument':
                updateAgentDescription(agentId, `${formatLabel}: Creating document...`);
                break;
              case 'addingContent':
                iterationCount++;
                updateAgentDescription(agentId, `${formatLabel}: Adding content (${iterationCount} sections)...`);
                break;
              case 'saving':
                updateAgentDescription(agentId, `${formatLabel}: Saving...`);
                break;
              case 'error':
                console.error('[ExportStore] Export error:', progress.message);
                break;
            }
          });
          
          // Run the export
          const result = await invoke<ExportAgentResult>('run_export_agent_cmd', {
            input: {
              noteIds,
              title,
              format,
              customInstructions: customInstructions ?? null,
            },
          });
          
          // Check if export was actually created
          const success = result.exportFilename !== null;
          
          // Add to completed exports for notification
          get().addCompletedExport({
            id: agentId,
            filename: result.exportFilename || title,
            format,
            success,
            error: success ? undefined : 'Export agent did not save document',
            timestamp: Date.now(),
          });
          
          // Reload exports list
          await get().loadExports();
        } catch (error) {
          // Add error notification
          get().addCompletedExport({
            id: agentId,
            filename: title,
            format,
            success: false,
            error: String(error),
            timestamp: Date.now(),
          });
          throw error;
        } finally {
          // Clean up event listener
          if (unlisten) {
            unlisten();
          }
        }
      }
    ).catch((error) => {
      console.error('[ExportStore] Export task failed:', error);
    });
  },
  
  // Legacy export functions - now run in background
  exportNoteToPdf: (noteId: string, title?: string) => {
    get().startBackgroundExport([noteId], title || 'Export', 'pdf');
  },
  
  exportNoteToDocx: (noteId: string, title?: string) => {
    get().startBackgroundExport([noteId], title || 'Export', 'docx');
  },
  
  exportNotesToPdf: (noteIds: string[], title: string, _pageBreaks = true) => {
    get().startBackgroundExport(noteIds, title, 'pdf');
  },
  
  exportNotesToDocx: (noteIds: string[], title: string, _pageBreaks = true) => {
    get().startBackgroundExport(noteIds, title, 'docx');
  },
  
  exportContentToXlsx: (content: string, title: string) => {
    // XLSX still uses direct export since it's table-specific
    const agentId = `export-xlsx-${Date.now()}`;
    const { queueTask } = useAgentActivityStore.getState();
    
    queueTask(
      {
        id: agentId,
        type: 'export',
        description: `XLSX: ${title}`,
      },
      async () => {
        try {
          await invoke<ExportResult>('export_content_to_xlsx', {
            content,
            title,
          });
          
          get().addCompletedExport({
            id: agentId,
            filename: title,
            format: 'xlsx',
            success: true,
            timestamp: Date.now(),
          });
          await get().loadExports();
        } catch (error) {
          console.error('Failed to export to XLSX:', error);
          get().addCompletedExport({
            id: agentId,
            filename: title,
            format: 'xlsx',
            success: false,
            error: String(error),
            timestamp: Date.now(),
          });
          throw error;
        }
      }
    ).catch((error) => {
      console.error('[ExportStore] XLSX export task failed:', error);
    });
  },
  
  exportNotesToPptx: (noteIds: string[], title: string) => {
    get().startBackgroundExport(noteIds, title, 'pptx');
  },
  
  // Simple export functions for toolbar
  exportNotesPdf: (noteIds: string[]) => {
    get().startBackgroundExport(noteIds, 'Export', 'pdf');
  },
  
  exportNotesDocx: (noteIds: string[]) => {
    get().startBackgroundExport(noteIds, 'Export', 'docx');
  },
  
  exportSelectionXlsx: (content: string, title: string) => {
    get().exportContentToXlsx(content, title);
  },
  
  deleteExport: async (id: string) => {
    try {
      await invoke('delete_export', { id });
      set(state => ({
        exports: state.exports.filter(e => e.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete export:', error);
      throw error;
    }
  },
  
  openExport: async (id: string) => {
    try {
      await invoke('open_export', { id });
    } catch (error) {
      console.error('Failed to open export:', error);
      throw error;
    }
  },
  
  revealExportsFolder: async () => {
    try {
      await invoke('reveal_exports_folder');
    } catch (error) {
      console.error('Failed to reveal exports folder:', error);
      throw error;
    }
  },
  
  openExportModal: (noteIds?: string[]) => {
    set({
      isExportModalOpen: true,
      selectedNoteIds: noteIds ?? [],
    });
  },
  
  closeExportModal: () => {
    set({
      isExportModalOpen: false,
      selectedNoteIds: [],
    });
  },
  
  setSelectedNoteIds: (noteIds: string[]) => {
    set({ selectedNoteIds: noteIds });
  },
  
  addCompletedExport: (export_: CompletedExport) => {
    set(state => ({
      completedExports: [export_, ...state.completedExports].slice(0, 10), // Keep last 10
    }));
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      get().dismissCompletedExport(export_.id);
    }, 5000);
  },
  
  dismissCompletedExport: (id: string) => {
    set(state => ({
      completedExports: state.completedExports.filter(e => e.id !== id),
    }));
  },
  
  clearCompletedExports: () => {
    set({ completedExports: [] });
  },
}));
