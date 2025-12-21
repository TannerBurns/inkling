import { create } from "zustand";
import type { Note, UpdateNoteInput } from "../types/note";
import * as api from "../lib/tauri";
import { embedNote } from "../lib/search";
import { useSettingsStore } from "./settingsStore";
import { useAgentActivityStore } from "./agentActivityStore";
import { useDailyNotesStore } from "./dailyNotesStore";
import { useEditorGroupStore } from "./editorGroupStore";

export type ViewMode = "all" | "unfiled" | "folder";

// Dragging state (stored outside of Zustand for performance)
let draggedNoteId: string | null = null;

export const setDraggedNoteId = (id: string | null) => {
  draggedNoteId = id;
};

export const getDraggedNoteId = () => draggedNoteId;

interface NoteState {
  // State
  notes: Note[];
  selectedNoteId: string | null;
  openNoteIds: string[]; // Ordered list of open tab IDs
  isLoading: boolean;
  error: string | null;
  viewMode: ViewMode;
  currentFolderId: string | null;

  // Actions
  fetchAllNotes: () => Promise<void>;
  fetchUnfiledNotes: () => Promise<void>;
  fetchNotesInFolder: (folderId: string) => Promise<void>;
  selectNote: (id: string | null) => void;
  openNote: (id: string) => void; // Open note in new tab (or focus if exists)
  closeNote: (id: string) => void; // Close tab
  closeOtherNotes: (id: string) => void; // Close all tabs except this one
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  createNote: (title: string, folderId?: string | null) => Promise<Note>;
  updateNote: (id: string, updates: UpdateNoteInput) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  searchNotes: (query: string) => Promise<void>;
  clearError: () => void;
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>;
}

// Helper to load open tabs from localStorage
const loadOpenNoteIds = (): string[] => {
  try {
    const saved = localStorage.getItem("inkling-open-tabs");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Helper to save open tabs to localStorage
const saveOpenNoteIds = (ids: string[]) => {
  localStorage.setItem("inkling-open-tabs", JSON.stringify(ids));
};

export const useNoteStore = create<NoteState>((set, get) => ({
  // Initial state
  notes: [],
  selectedNoteId: null,
  openNoteIds: loadOpenNoteIds(),
  isLoading: false,
  error: null,
  viewMode: "all",
  currentFolderId: null,

  // Fetch all notes
  fetchAllNotes: async () => {
    set({ isLoading: true, error: null, viewMode: "all", currentFolderId: null });
    try {
      const notes = await api.getAllNotes();
      set({ notes, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch unfiled notes (notes with no folder)
  fetchUnfiledNotes: async () => {
    set({ isLoading: true, error: null, viewMode: "unfiled", currentFolderId: null });
    try {
      const notes = await api.getNotesInFolder(null);
      set({ notes, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch notes in a specific folder
  fetchNotesInFolder: async (folderId: string) => {
    set({ isLoading: true, error: null, viewMode: "folder", currentFolderId: folderId });
    try {
      const notes = await api.getNotesInFolder(folderId);
      set({ notes, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Select a note by ID (switches active tab but doesn't open new tab)
  selectNote: (id: string | null) => {
    set({ selectedNoteId: id });
  },

  // Open a note in a new tab (or focus if already open)
  openNote: (id: string) => {
    const { openNoteIds } = get();
    if (openNoteIds.includes(id)) {
      // Already open, just focus it
      set({ selectedNoteId: id });
    } else {
      // Add to open tabs and focus
      const newOpenNoteIds = [...openNoteIds, id];
      saveOpenNoteIds(newOpenNoteIds);
      set({ openNoteIds: newOpenNoteIds, selectedNoteId: id });
    }
  },

  // Close a tab
  closeNote: (id: string) => {
    const { openNoteIds, selectedNoteId } = get();
    const index = openNoteIds.indexOf(id);
    if (index === -1) return;

    const newOpenNoteIds = openNoteIds.filter((noteId) => noteId !== id);
    saveOpenNoteIds(newOpenNoteIds);

    // If closing the active tab, select an adjacent tab
    let newSelectedId = selectedNoteId;
    if (selectedNoteId === id) {
      if (newOpenNoteIds.length === 0) {
        newSelectedId = null;
      } else if (index >= newOpenNoteIds.length) {
        // Was last tab, select new last
        newSelectedId = newOpenNoteIds[newOpenNoteIds.length - 1];
      } else {
        // Select the tab that took its place
        newSelectedId = newOpenNoteIds[index];
      }
    }

    set({ openNoteIds: newOpenNoteIds, selectedNoteId: newSelectedId });
  },

  // Close all tabs except the specified one
  closeOtherNotes: (id: string) => {
    const { openNoteIds } = get();
    if (!openNoteIds.includes(id)) return;
    
    const newOpenNoteIds = [id];
    saveOpenNoteIds(newOpenNoteIds);
    set({ openNoteIds: newOpenNoteIds, selectedNoteId: id });
  },

  // Reorder tabs by dragging
  reorderTabs: (fromIndex: number, toIndex: number) => {
    const { openNoteIds } = get();
    if (fromIndex < 0 || fromIndex >= openNoteIds.length) return;
    if (toIndex < 0 || toIndex >= openNoteIds.length) return;
    if (fromIndex === toIndex) return;

    const newOpenNoteIds = [...openNoteIds];
    const [removed] = newOpenNoteIds.splice(fromIndex, 1);
    newOpenNoteIds.splice(toIndex, 0, removed);
    saveOpenNoteIds(newOpenNoteIds);
    set({ openNoteIds: newOpenNoteIds });
  },

  // Create a new note
  createNote: async (title: string, folderId?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const note = await api.createNote({ title, folderId });
      const { viewMode, currentFolderId, openNoteIds } = get();
      
      // Only add to current list if it would be visible in current view
      const shouldAddToList = 
        viewMode === "all" ||
        (viewMode === "unfiled" && !folderId) ||
        (viewMode === "folder" && folderId === currentFolderId);

      // Also open the new note in a tab
      const newOpenNoteIds = [...openNoteIds, note.id];
      saveOpenNoteIds(newOpenNoteIds);

      set((state) => ({
        notes: shouldAddToList ? [note, ...state.notes] : [note, ...state.notes],
        selectedNoteId: note.id,
        openNoteIds: newOpenNoteIds,
        isLoading: false,
      }));
      
      // Queue embedding in background (don't await to avoid blocking)
      embedNote(note.id).catch((err) => {
        console.warn("Failed to embed note:", err);
      });
      
      return note;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update an existing note
  updateNote: async (id: string, updates: UpdateNoteInput) => {
    set({ error: null });
    try {
      const updatedNote = await api.updateNote(id, updates);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updatedNote : n)),
      }));
      
      // Re-embed if content changed (queue in background)
      if (updates.content !== undefined || updates.title !== undefined) {
        const embedAgentId = `embedding-${id}-${Date.now()}`;
        const note = get().notes.find((n) => n.id === id);
        const { startAgent, stopAgent } = useAgentActivityStore.getState();
        
        startAgent({
          id: embedAgentId,
          type: "embedding",
          noteId: id,
          noteTitle: note?.title || "Untitled",
        });
        
        embedNote(id)
          .catch((err) => {
            console.warn("Failed to re-embed note:", err);
          })
          .finally(() => {
            stopAgent(embedAgentId);
          });
        
        // Run tagging agent if enabled (queue in background)
        const { agentSettings } = useSettingsStore.getState();
        if (agentSettings.taggingEnabled) {
          const agentId = `tagging-${id}-${Date.now()}`;
          const note = get().notes.find((n) => n.id === id);
          const { startAgent, stopAgent } = useAgentActivityStore.getState();
          
          startAgent({
            id: agentId,
            type: "tagging",
            noteId: id,
            noteTitle: note?.title || "Untitled",
          });
          
          console.log("[TaggingAgent] Starting tagging for note:", id, note?.title);
          api.runTaggingAgent(id)
            .then((result) => {
              console.log("[TaggingAgent] Success:", result);
            })
            .catch((err) => {
              console.error("[TaggingAgent] Failed:", err);
            })
            .finally(() => {
              stopAgent(agentId);
            });
        }
      }
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Delete a note
  deleteNote: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteNote(id);
      const { openNoteIds, selectedNoteId } = get();
      
      // Remove from open tabs if present
      const newOpenNoteIds = openNoteIds.filter((noteId) => noteId !== id);
      if (newOpenNoteIds.length !== openNoteIds.length) {
        saveOpenNoteIds(newOpenNoteIds);
      }

      // If deleting the selected note, select an adjacent tab
      let newSelectedId = selectedNoteId;
      if (selectedNoteId === id) {
        const index = openNoteIds.indexOf(id);
        if (newOpenNoteIds.length === 0) {
          newSelectedId = null;
        } else if (index >= newOpenNoteIds.length) {
          newSelectedId = newOpenNoteIds[newOpenNoteIds.length - 1];
        } else {
          newSelectedId = newOpenNoteIds[index];
        }
      }

      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        openNoteIds: newOpenNoteIds,
        selectedNoteId: newSelectedId,
      }));

      // Clear current daily note if it was deleted
      const { currentDailyNote } = useDailyNotesStore.getState();
      if (currentDailyNote?.id === id) {
        useDailyNotesStore.setState({ currentDailyNote: null });
      }

      // Close tab in editor group store
      const editorStore = useEditorGroupStore.getState();
      const tabInfo = editorStore.findTabInGroups({ type: "note", id });
      if (tabInfo) {
        editorStore.closeTab({ type: "note", id }, tabInfo.group.id);
      }
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Search notes
  searchNotes: async (query: string) => {
    if (!query.trim()) {
      const { viewMode, currentFolderId } = get();
      if (viewMode === "all") return get().fetchAllNotes();
      if (viewMode === "unfiled") return get().fetchUnfiledNotes();
      if (viewMode === "folder" && currentFolderId) return get().fetchNotesInFolder(currentFolderId);
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const notes = await api.searchNotes(query);
      set({ notes, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Move a note to a different folder
  moveNoteToFolder: async (noteId: string, folderId: string | null) => {
    set({ error: null });
    try {
      // Use dedicated move command that properly handles null folder_id
      const updatedNote = await api.moveNoteToFolder(noteId, folderId);
      const { viewMode, currentFolderId } = get();
      
      // Update the note in the list, or remove it if it's no longer visible
      set((state) => {
        const shouldRemoveFromList = 
          (viewMode === "unfiled" && folderId !== null) ||
          (viewMode === "folder" && folderId !== currentFolderId);

        if (shouldRemoveFromList) {
          return {
            notes: state.notes.filter((n) => n.id !== noteId),
          };
        }

        return {
          notes: state.notes.map((n) => (n.id === noteId ? updatedNote : n)),
        };
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },
}));

// Selector for the currently selected note
export const useSelectedNote = () => {
  const notes = useNoteStore((state) => state.notes);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  return notes.find((n) => n.id === selectedNoteId) ?? null;
};

// Selector for open notes (as Note objects, in tab order)
export const useOpenNotes = () => {
  const notes = useNoteStore((state) => state.notes);
  const openNoteIds = useNoteStore((state) => state.openNoteIds);
  return openNoteIds
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => n !== undefined);
};
