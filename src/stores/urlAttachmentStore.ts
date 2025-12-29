import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { UrlAttachment, UrlIndexingProgress } from "../types/url";
import { useAgentActivityStore } from "./agentActivityStore";
import { getUrlDomain } from "../types/url";

interface UrlAttachmentState {
  /** URL attachments by note ID */
  attachmentsByNote: Record<string, UrlAttachment[]>;
  /** Currently indexing URL IDs */
  indexingUrls: Set<string>;
  /** Error state */
  error: string | null;

  // Actions
  loadAttachments: (noteId: string) => Promise<void>;
  addUrlAttachment: (noteId: string, url: string) => Promise<UrlAttachment>;
  removeUrlAttachment: (id: string, noteId: string) => Promise<void>;
  refreshUrlAttachment: (id: string) => Promise<void>;

  // Internal
  updateAttachment: (attachment: UrlAttachment) => void;
  setIndexing: (id: string, isIndexing: boolean) => void;
  clearAttachments: () => void;
}

export const useUrlAttachmentStore = create<UrlAttachmentState>((set, get) => ({
  attachmentsByNote: {},
  indexingUrls: new Set(),
  error: null,

  loadAttachments: async (noteId: string) => {
    try {
      const attachments = await invoke<UrlAttachment[]>("get_url_attachments", {
        noteId,
      });
      set((state) => ({
        attachmentsByNote: {
          ...state.attachmentsByNote,
          [noteId]: attachments,
        },
        error: null,
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  addUrlAttachment: async (noteId: string, url: string) => {
    set({ error: null });
    try {
      const attachment = await invoke<UrlAttachment>("add_url_attachment", {
        noteId,
        url,
      });

      // Add to the store
      set((state) => {
        const existing = state.attachmentsByNote[noteId] || [];
        return {
          attachmentsByNote: {
            ...state.attachmentsByNote,
            [noteId]: [attachment, ...existing],
          },
          indexingUrls: new Set([...state.indexingUrls, attachment.id]),
        };
      });

      return attachment;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  removeUrlAttachment: async (id: string, noteId: string) => {
    set({ error: null });
    try {
      await invoke<boolean>("remove_url_attachment", { id });

      // Remove from store
      set((state) => {
        const existing = state.attachmentsByNote[noteId] || [];
        return {
          attachmentsByNote: {
            ...state.attachmentsByNote,
            [noteId]: existing.filter((a) => a.id !== id),
          },
        };
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  refreshUrlAttachment: async (id: string) => {
    set({ error: null });
    try {
      const attachment = await invoke<UrlAttachment>("refresh_url_attachment", {
        id,
      });

      // Update in store
      get().updateAttachment(attachment);
      get().setIndexing(id, true);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateAttachment: (attachment: UrlAttachment) => {
    set((state) => {
      const existing = state.attachmentsByNote[attachment.noteId] || [];
      const updated = existing.map((a) =>
        a.id === attachment.id ? attachment : a
      );
      return {
        attachmentsByNote: {
          ...state.attachmentsByNote,
          [attachment.noteId]: updated,
        },
      };
    });
  },

  setIndexing: (id: string, isIndexing: boolean) => {
    set((state) => {
      const indexingUrls = new Set(state.indexingUrls);
      if (isIndexing) {
        indexingUrls.add(id);
      } else {
        indexingUrls.delete(id);
      }
      return { indexingUrls };
    });
  },

  clearAttachments: () => {
    set({ attachmentsByNote: {}, indexingUrls: new Set(), error: null });
  },
}));

// ============================================================================
// URL Indexing Event Listener
// ============================================================================

let unlistenFn: UnlistenFn | null = null;

/** Track running agent IDs for URL indexing */
const runningUrlAgents = new Map<string, string>(); // urlAttachmentId -> agentId

/**
 * Initialize the URL indexing event listener
 * This should be called once when the app starts
 */
export async function initUrlIndexingListener(): Promise<void> {
  if (unlistenFn) {
    unlistenFn();
  }

  unlistenFn = await listen<UrlIndexingProgress>(
    "url-indexing-progress",
    (event) => {
      const progress = event.payload;
      const store = useUrlAttachmentStore.getState();
      const agentStore = useAgentActivityStore.getState();

      switch (progress.type) {
        case "started": {
          store.setIndexing(progress.urlAttachmentId, true);
          
          // Start an agent activity for this URL indexing
          const agentId = `url-${progress.urlAttachmentId}`;
          runningUrlAgents.set(progress.urlAttachmentId, agentId);
          
          const domain = getUrlDomain(progress.url);
          agentStore.startAgent({
            id: agentId,
            type: "url_indexing",
            noteId: progress.noteId,
            description: `Indexing ${domain}`,
          });
          break;
        }

        case "completed": {
          store.setIndexing(progress.urlAttachmentId, false);
          
          // Stop the agent activity
          const agentId = runningUrlAgents.get(progress.urlAttachmentId);
          if (agentId) {
            agentStore.stopAgent(agentId);
            runningUrlAgents.delete(progress.urlAttachmentId);
          }
          
          // Reload attachments for the affected note
          void reloadAttachmentById(progress.urlAttachmentId);
          break;
        }

        case "error": {
          store.setIndexing(progress.urlAttachmentId, false);
          
          // Stop the agent activity
          const agentId = runningUrlAgents.get(progress.urlAttachmentId);
          if (agentId) {
            agentStore.stopAgent(agentId);
            runningUrlAgents.delete(progress.urlAttachmentId);
          }
          
          // Reload to get the error state
          void reloadAttachmentById(progress.urlAttachmentId);
          break;
        }
      }
    }
  );
}

/**
 * Reload a specific attachment by ID
 */
async function reloadAttachmentById(id: string): Promise<void> {
  try {
    const attachment = await invoke<UrlAttachment | null>("get_url_attachment", {
      id,
    });
    if (attachment) {
      useUrlAttachmentStore.getState().updateAttachment(attachment);
    }
  } catch (error) {
    console.error("Failed to reload URL attachment:", error);
  }
}

/**
 * Cleanup the URL indexing event listener
 */
export function cleanupUrlIndexingListener(): void {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}

// ============================================================================
// Selectors
// ============================================================================

/** Stable empty array to avoid infinite re-renders in selectors */
const EMPTY_ATTACHMENTS: UrlAttachment[] = [];

/**
 * Get URL attachments for a specific note
 */
export function useNoteUrlAttachments(noteId: string): UrlAttachment[] {
  return useUrlAttachmentStore(
    (state) => state.attachmentsByNote[noteId] ?? EMPTY_ATTACHMENTS
  );
}

/**
 * Check if a specific URL is currently being indexed
 */
export function useIsUrlIndexing(urlAttachmentId: string): boolean {
  return useUrlAttachmentStore((state) =>
    state.indexingUrls.has(urlAttachmentId)
  );
}

/**
 * Check if any URLs are currently being indexed
 */
export function useIsAnyUrlIndexing(): boolean {
  return useUrlAttachmentStore((state) => state.indexingUrls.size > 0);
}

