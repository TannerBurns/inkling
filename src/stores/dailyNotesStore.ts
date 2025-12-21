import { create } from "zustand";
import { marked } from "marked";
import type { Note, Folder } from "../types/note";
import * as api from "../lib/tauri";
import { useEditorGroupStore } from "./editorGroupStore";
import { useSettingsStore } from "./settingsStore";
import { useNoteStore } from "./noteStore";
import { useFolderStore } from "./folderStore";

// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date object
 */
export function parseDateString(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  
  return new Date(year, month, day);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return formatDateToString(new Date());
}

/**
 * Interpolate template variables
 */
function interpolateTemplate(template: string, date: Date): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = dayNames[date.getDay()];
  const monthName = monthNames[date.getMonth()];
  
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const time = `${hours}:${minutes}`;
  
  // Full date format: "December 20, 2025"
  const fullDate = `${monthName} ${day}, ${year}`;
  
  // Short date format: "2025-12-20"
  const shortDate = formatDateToString(date);
  
  return template
    .replace(/\{\{date\}\}/g, fullDate)
    .replace(/\{\{date_short\}\}/g, shortDate)
    .replace(/\{\{day_of_week\}\}/g, dayOfWeek)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{year\}\}/g, String(year))
    .replace(/\{\{month\}\}/g, String(month).padStart(2, "0"))
    .replace(/\{\{month_name\}\}/g, monthName)
    .replace(/\{\{day\}\}/g, String(day).padStart(2, "0"));
}

interface DailyNotesState {
  // State
  dailyNotesFolder: Folder | null;
  currentDailyNote: Note | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  initializeDailyNotesFolder: () => Promise<Folder>;
  openTodayNote: () => Promise<Note>;
  openDailyNote: (date: string) => Promise<Note>;
  navigatePrevious: () => Promise<Note | null>;
  navigateNext: () => Promise<Note | null>;
  checkIfDailyNote: (noteId: string) => Promise<boolean>;
  clearError: () => void;
}

export const useDailyNotesStore = create<DailyNotesState>((set, get) => ({
  // Initial state
  dailyNotesFolder: null,
  currentDailyNote: null,
  isLoading: false,
  error: null,
  
  // Initialize or get the Daily Notes folder
  initializeDailyNotesFolder: async () => {
    const { dailyNotesFolder } = get();
    if (dailyNotesFolder) return dailyNotesFolder;
    
    set({ isLoading: true, error: null });
    try {
      const folder = await api.getOrCreateDailyNotesFolder();
      set({ dailyNotesFolder: folder, isLoading: false });
      
      // Refresh the folder store to show the new folder
      await useFolderStore.getState().fetchFolders();
      
      return folder;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },
  
  // Open today's daily note (creates if doesn't exist)
  openTodayNote: async () => {
    const today = getTodayDateString();
    return get().openDailyNote(today);
  },
  
  // Open a daily note for a specific date
  openDailyNote: async (date: string) => {
    set({ isLoading: true, error: null });
    try {
      // First, ensure the Daily Notes folder exists
      await get().initializeDailyNotesFolder();
      
      // Try to get existing note for this date
      let note = await api.getDailyNote(date);
      
      if (!note) {
        // Create new daily note with template content
        const { dailyNoteSettings } = useSettingsStore.getState();
        const template = dailyNoteSettings.template;
        
        const parsedDate = parseDateString(date);
        const content = parsedDate && template 
          ? interpolateTemplate(template, parsedDate)
          : "";
        
        // Convert markdown to HTML for the editor
        const contentHtml = content ? await marked.parse(content) : null;
        
        note = await api.createDailyNote(date, content, contentHtml);
      }
      
      // Add or update the note in the noteStore directly
      // This ensures the editor can find and display the note immediately
      const noteStore = useNoteStore.getState();
      const existingNotes = noteStore.notes;
      const noteIndex = existingNotes.findIndex(n => n.id === note!.id);
      
      if (noteIndex === -1) {
        // Note doesn't exist in store, add it at the beginning
        useNoteStore.setState({
          notes: [note, ...existingNotes],
        });
      } else {
        // Note already exists, update it in place
        const updatedNotes = [...existingNotes];
        updatedNotes[noteIndex] = note;
        useNoteStore.setState({ notes: updatedNotes });
      }
      
      set({ currentDailyNote: note, isLoading: false });
      
      // Open the note in the editor
      const { openTab } = useEditorGroupStore.getState();
      openTab({ type: "note", id: note.id });
      
      return note;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },
  
  // Navigate to the previous daily note
  navigatePrevious: async () => {
    const { currentDailyNote } = get();
    if (!currentDailyNote) return null;
    
    set({ isLoading: true, error: null });
    try {
      const prevNote = await api.getAdjacentDailyNote(currentDailyNote.title, "prev");
      
      if (prevNote) {
        set({ currentDailyNote: prevNote, isLoading: false });
        
        // Open the note in the editor
        const { openTab } = useEditorGroupStore.getState();
        openTab({ type: "note", id: prevNote.id });
      } else {
        set({ isLoading: false });
      }
      
      return prevNote;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },
  
  // Navigate to the next daily note
  navigateNext: async () => {
    const { currentDailyNote } = get();
    if (!currentDailyNote) return null;
    
    set({ isLoading: true, error: null });
    try {
      const nextNote = await api.getAdjacentDailyNote(currentDailyNote.title, "next");
      
      if (nextNote) {
        set({ currentDailyNote: nextNote, isLoading: false });
        
        // Open the note in the editor
        const { openTab } = useEditorGroupStore.getState();
        openTab({ type: "note", id: nextNote.id });
      } else {
        set({ isLoading: false });
      }
      
      return nextNote;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },
  
  // Check if a note is a daily note
  checkIfDailyNote: async (noteId: string) => {
    try {
      return await api.isDailyNote(noteId);
    } catch {
      return false;
    }
  },
  
  // Clear error
  clearError: () => set({ error: null }),
}));

/**
 * Hook to sync the current daily note when the active tab changes
 */
export function useSyncDailyNoteWithActiveTab(activeNoteId: string | null) {
  const { checkIfDailyNote } = useDailyNotesStore();
  
  // When active note changes, check if it's a daily note and update state
  if (activeNoteId) {
    checkIfDailyNote(activeNoteId).then((isDailyNote) => {
      if (isDailyNote) {
        api.getNote(activeNoteId).then((note) => {
          if (note) {
            useDailyNotesStore.setState({ currentDailyNote: note });
          }
        });
      } else {
        useDailyNotesStore.setState({ currentDailyNote: null });
      }
    });
  }
}

// Re-export getNote for convenience
export { getNote } from "../lib/tauri";

