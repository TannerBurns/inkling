import { create } from "zustand";
import type { Folder, UpdateFolderInput } from "../types/note";
import * as api from "../lib/tauri";

interface FolderState {
  // State
  folders: Folder[];
  selectedFolderId: string | null; // null means "All Notes"
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchFolders: () => Promise<void>;
  selectFolder: (id: string | null) => void;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
  updateFolder: (id: string, updates: UpdateFolderInput) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useFolderStore = create<FolderState>((set) => ({
  // Initial state
  folders: [],
  selectedFolderId: null,
  isLoading: false,
  error: null,

  // Fetch all folders
  fetchFolders: async () => {
    set({ isLoading: true, error: null });
    try {
      const folders = await api.getAllFolders();
      set({ folders, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Select a folder by ID (null = All Notes)
  selectFolder: (id: string | null) => {
    set({ selectedFolderId: id });
  },

  // Create a new folder
  createFolder: async (name: string, parentId?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const folder = await api.createFolder({ name, parentId });
      set((state) => ({
        folders: [...state.folders, folder],
        isLoading: false,
      }));
      return folder;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update an existing folder
  updateFolder: async (id: string, updates: UpdateFolderInput) => {
    set({ error: null });
    try {
      const updatedFolder = await api.updateFolder(id, updates);
      set((state) => ({
        folders: state.folders.map((f) => (f.id === id ? updatedFolder : f)),
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Delete a folder
  deleteFolder: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteFolder(id);
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
        selectedFolderId:
          state.selectedFolderId === id ? null : state.selectedFolderId,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

// Helper to build folder tree structure
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}

export const useFolderTree = (): FolderTreeNode[] => {
  const folders = useFolderStore((state) => state.folders);

  const buildTree = (parentId: string | null): FolderTreeNode[] => {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((folder) => ({
        ...folder,
        children: buildTree(folder.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  return buildTree(null);
};
