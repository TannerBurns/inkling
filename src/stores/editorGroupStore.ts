import { create } from "zustand";

// Tab type (shared between notes and boards)
export type TabItem = {
  type: "note" | "board";
  id: string; // noteId or boardId
};

// Editor group (one pane)
export type EditorGroup = {
  id: string;
  tabs: TabItem[];
  activeTabId: string | null; // Format: "note:id" or "board:id"
};

// Helper to create a unique tab key
export const getTabKey = (tab: TabItem): string => `${tab.type}:${tab.id}`;

// Helper to parse a tab key back to TabItem
export const parseTabKey = (key: string): TabItem | null => {
  const [type, id] = key.split(":");
  if ((type === "note" || type === "board") && id) {
    return { type, id };
  }
  return null;
};

interface EditorGroupState {
  // State
  groups: EditorGroup[];
  activeGroupId: string;
  draggingTab: { tab: TabItem; fromGroupId: string } | null;

  // Actions
  createGroup: (initialTab?: TabItem) => string;
  closeGroup: (groupId: string) => void;
  focusGroup: (groupId: string) => void;

  // Tab operations
  openTab: (tab: TabItem, groupId?: string) => void;
  closeTab: (tab: TabItem, groupId: string) => void;
  closeOtherTabs: (tab: TabItem, groupId: string) => void;
  selectTab: (tab: TabItem, groupId: string) => void;
  moveTabToGroup: (tab: TabItem, fromGroupId: string, toGroupId: string, insertIndex?: number) => void;
  splitWithTab: (tab: TabItem, fromGroupId: string) => void;
  reorderTabsInGroup: (groupId: string, fromIndex: number, toIndex: number) => void;

  // Drag state
  setDraggingTab: (tab: TabItem | null, fromGroupId?: string) => void;

  // Getters
  getActiveTab: () => TabItem | null;
  getGroupById: (groupId: string) => EditorGroup | undefined;
  findTabInGroups: (tab: TabItem) => { group: EditorGroup; index: number } | null;

  // Persistence
  loadFromStorage: () => void;
  migrateFromOldStorage: () => void;
}

// Generate unique ID
const generateId = (): string => {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// LocalStorage keys
const STORAGE_KEY = "inkling-editor-groups";
const OLD_NOTES_KEY = "inkling-open-tabs";
const OLD_BOARDS_KEY = "inkling-open-boards";

// Save to localStorage
const saveToStorage = (groups: EditorGroup[], activeGroupId: string) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ groups, activeGroupId })
    );
  } catch (e) {
    console.error("Failed to save editor groups:", e);
  }
};

// Load from localStorage
const loadFromStorage = (): { groups: EditorGroup[]; activeGroupId: string } | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load editor groups:", e);
  }
  return null;
};

// Create initial state with one empty group
const createInitialState = (): { groups: EditorGroup[]; activeGroupId: string } => {
  const groupId = generateId();
  return {
    groups: [{ id: groupId, tabs: [], activeTabId: null }],
    activeGroupId: groupId,
  };
};

export const useEditorGroupStore = create<EditorGroupState>((set, get) => ({
  // Initial state
  ...createInitialState(),
  draggingTab: null,

  // Create a new group
  createGroup: (initialTab?: TabItem) => {
    const newGroupId = generateId();
    const newGroup: EditorGroup = {
      id: newGroupId,
      tabs: initialTab ? [initialTab] : [],
      activeTabId: initialTab ? getTabKey(initialTab) : null,
    };

    set((state) => {
      const newGroups = [...state.groups, newGroup];
      saveToStorage(newGroups, newGroupId);
      return { groups: newGroups, activeGroupId: newGroupId };
    });

    return newGroupId;
  },

  // Close a group
  closeGroup: (groupId: string) => {
    const state = get();
    if (state.groups.length <= 1) {
      // Can't close the last group, just clear its tabs
      set((s) => {
        const newGroups = s.groups.map((g) =>
          g.id === groupId ? { ...g, tabs: [], activeTabId: null } : g
        );
        saveToStorage(newGroups, s.activeGroupId);
        return { groups: newGroups };
      });
      return;
    }

    const groupIndex = state.groups.findIndex((g) => g.id === groupId);
    const group = state.groups[groupIndex];
    if (!group) return;

    // Move tabs to adjacent group
    const adjacentIndex = groupIndex === 0 ? 1 : groupIndex - 1;
    const adjacentGroup = state.groups[adjacentIndex];

    set((s) => {
      // Merge tabs into adjacent group
      const updatedAdjacentGroup = {
        ...adjacentGroup,
        tabs: [...adjacentGroup.tabs, ...group.tabs],
      };

      const newGroups = s.groups
        .filter((g) => g.id !== groupId)
        .map((g) => (g.id === adjacentGroup.id ? updatedAdjacentGroup : g));

      const newActiveGroupId =
        s.activeGroupId === groupId ? adjacentGroup.id : s.activeGroupId;

      saveToStorage(newGroups, newActiveGroupId);
      return { groups: newGroups, activeGroupId: newActiveGroupId };
    });
  },

  // Focus a group
  focusGroup: (groupId: string) => {
    set((state) => {
      if (state.activeGroupId !== groupId) {
        saveToStorage(state.groups, groupId);
        return { activeGroupId: groupId };
      }
      return {};
    });
  },

  // Open a tab (in specified group or active group)
  openTab: (tab: TabItem, groupId?: string) => {
    const state = get();
    const targetGroupId = groupId || state.activeGroupId;
    const tabKey = getTabKey(tab);

    // Check if tab is already open in any group
    const existing = state.findTabInGroups(tab);
    if (existing) {
      // Focus the existing tab
      set((s) => {
        const newGroups = s.groups.map((g) =>
          g.id === existing.group.id ? { ...g, activeTabId: tabKey } : g
        );
        saveToStorage(newGroups, existing.group.id);
        return { groups: newGroups, activeGroupId: existing.group.id };
      });
      return;
    }

    // Add to target group
    set((s) => {
      const newGroups = s.groups.map((g) => {
        if (g.id === targetGroupId) {
          return {
            ...g,
            tabs: [...g.tabs, tab],
            activeTabId: tabKey,
          };
        }
        return g;
      });
      saveToStorage(newGroups, targetGroupId);
      return { groups: newGroups, activeGroupId: targetGroupId };
    });
  },

  // Close a tab
  closeTab: (tab: TabItem, groupId: string) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;

    const tabKey = getTabKey(tab);
    const tabIndex = group.tabs.findIndex((t) => getTabKey(t) === tabKey);
    if (tabIndex === -1) return;

    const newTabs = group.tabs.filter((t) => getTabKey(t) !== tabKey);

    // Determine new active tab
    let newActiveTabId: string | null = null;
    if (group.activeTabId === tabKey && newTabs.length > 0) {
      // Select adjacent tab
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveTabId = getTabKey(newTabs[newIndex]);
    } else if (group.activeTabId !== tabKey) {
      newActiveTabId = group.activeTabId;
    }

    set((s) => {
      let newGroups = s.groups.map((g) =>
        g.id === groupId ? { ...g, tabs: newTabs, activeTabId: newActiveTabId } : g
      );

      // If group is now empty and there are other groups, close it
      if (newTabs.length === 0 && newGroups.length > 1) {
        const groupIndex = newGroups.findIndex((g) => g.id === groupId);
        newGroups = newGroups.filter((g) => g.id !== groupId);
        const newActiveGroupId =
          s.activeGroupId === groupId
            ? newGroups[Math.max(0, groupIndex - 1)].id
            : s.activeGroupId;
        saveToStorage(newGroups, newActiveGroupId);
        return { groups: newGroups, activeGroupId: newActiveGroupId };
      }

      saveToStorage(newGroups, s.activeGroupId);
      return { groups: newGroups };
    });
  },

  // Close all tabs except the specified one
  closeOtherTabs: (tab: TabItem, groupId: string) => {
    const tabKey = getTabKey(tab);
    set((s) => {
      const newGroups = s.groups.map((g) =>
        g.id === groupId ? { ...g, tabs: [tab], activeTabId: tabKey } : g
      );
      saveToStorage(newGroups, s.activeGroupId);
      return { groups: newGroups };
    });
  },

  // Select a tab in a group
  selectTab: (tab: TabItem, groupId: string) => {
    const tabKey = getTabKey(tab);
    set((s) => {
      const newGroups = s.groups.map((g) =>
        g.id === groupId ? { ...g, activeTabId: tabKey } : g
      );
      saveToStorage(newGroups, groupId);
      return { groups: newGroups, activeGroupId: groupId };
    });
  },

  // Move tab from one group to another
  moveTabToGroup: (tab: TabItem, fromGroupId: string, toGroupId: string, insertIndex?: number) => {
    console.log("[EditorGroupStore] moveTabToGroup called:", { tab, fromGroupId, toGroupId, insertIndex });
    
    if (fromGroupId === toGroupId) {
      console.log("[EditorGroupStore] Same group, skipping");
      return;
    }

    const tabKey = getTabKey(tab);
    const currentGroups = get().groups;
    console.log("[EditorGroupStore] Current groups:", currentGroups.map(g => ({ id: g.id, tabs: g.tabs.length })));

    set((s) => {
      let newGroups = s.groups.map((g) => {
        if (g.id === fromGroupId) {
          // Remove from source
          const newTabs = g.tabs.filter((t) => getTabKey(t) !== tabKey);
          console.log("[EditorGroupStore] Removing from source, before:", g.tabs.length, "after:", newTabs.length);
          const newActiveTabId =
            g.activeTabId === tabKey
              ? newTabs.length > 0
                ? getTabKey(newTabs[0])
                : null
              : g.activeTabId;
          return { ...g, tabs: newTabs, activeTabId: newActiveTabId };
        }
        if (g.id === toGroupId) {
          // Add to destination
          const newTabs = [...g.tabs];
          if (insertIndex !== undefined && insertIndex >= 0) {
            newTabs.splice(insertIndex, 0, tab);
          } else {
            newTabs.push(tab);
          }
          console.log("[EditorGroupStore] Adding to destination, before:", g.tabs.length, "after:", newTabs.length);
          return { ...g, tabs: newTabs, activeTabId: tabKey };
        }
        return g;
      });

      // Remove empty source group if there are other groups
      const sourceGroup = newGroups.find((g) => g.id === fromGroupId);
      if (sourceGroup && sourceGroup.tabs.length === 0 && newGroups.length > 1) {
        console.log("[EditorGroupStore] Removing empty source group");
        newGroups = newGroups.filter((g) => g.id !== fromGroupId);
      }

      console.log("[EditorGroupStore] Final groups:", newGroups.map(g => ({ id: g.id, tabs: g.tabs.length })));
      saveToStorage(newGroups, toGroupId);
      return { groups: newGroups, activeGroupId: toGroupId };
    });
  },

  // Split view with a tab (creates new group to the right)
  splitWithTab: (tab: TabItem, fromGroupId: string) => {
    const tabKey = getTabKey(tab);
    const newGroupId = generateId();

    set((s) => {
      // Remove tab from source group
      const newGroups = s.groups.map((g) => {
        if (g.id === fromGroupId) {
          const newTabs = g.tabs.filter((t) => getTabKey(t) !== tabKey);
          const newActiveTabId =
            g.activeTabId === tabKey
              ? newTabs.length > 0
                ? getTabKey(newTabs[0])
                : null
              : g.activeTabId;
          return { ...g, tabs: newTabs, activeTabId: newActiveTabId };
        }
        return g;
      });

      // Insert new group after the source group
      const sourceIndex = newGroups.findIndex((g) => g.id === fromGroupId);
      const newGroup: EditorGroup = {
        id: newGroupId,
        tabs: [tab],
        activeTabId: tabKey,
      };
      newGroups.splice(sourceIndex + 1, 0, newGroup);

      // Remove empty source group if there are other groups
      const filteredGroups =
        newGroups.find((g) => g.id === fromGroupId)?.tabs.length === 0 &&
        newGroups.length > 1
          ? newGroups.filter((g) => g.id !== fromGroupId)
          : newGroups;

      saveToStorage(filteredGroups, newGroupId);
      return { groups: filteredGroups, activeGroupId: newGroupId };
    });
  },

  // Reorder tabs within a group
  reorderTabsInGroup: (groupId: string, fromIndex: number, toIndex: number) => {
    set((s) => {
      const newGroups = s.groups.map((g) => {
        if (g.id === groupId) {
          const newTabs = [...g.tabs];
          const [removed] = newTabs.splice(fromIndex, 1);
          newTabs.splice(toIndex, 0, removed);
          return { ...g, tabs: newTabs };
        }
        return g;
      });
      saveToStorage(newGroups, s.activeGroupId);
      return { groups: newGroups };
    });
  },

  // Set dragging state
  setDraggingTab: (tab: TabItem | null, fromGroupId?: string) => {
    if (tab && fromGroupId) {
      set({ draggingTab: { tab, fromGroupId } });
    } else {
      set({ draggingTab: null });
    }
  },

  // Get the currently active tab
  getActiveTab: () => {
    const state = get();
    const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
    if (!activeGroup || !activeGroup.activeTabId) return null;
    return parseTabKey(activeGroup.activeTabId);
  },

  // Get group by ID
  getGroupById: (groupId: string) => {
    return get().groups.find((g) => g.id === groupId);
  },

  // Find a tab across all groups
  findTabInGroups: (tab: TabItem) => {
    const tabKey = getTabKey(tab);
    for (const group of get().groups) {
      const index = group.tabs.findIndex((t) => getTabKey(t) === tabKey);
      if (index !== -1) {
        return { group, index };
      }
    }
    return null;
  },

  // Load state from storage
  loadFromStorage: () => {
    const saved = loadFromStorage();
    if (saved && saved.groups.length > 0) {
      set({ groups: saved.groups, activeGroupId: saved.activeGroupId });
    }
  },

  // Migrate from old storage format
  migrateFromOldStorage: () => {
    const saved = loadFromStorage();
    if (saved && saved.groups.length > 0) {
      // Already have new format data
      set({ groups: saved.groups, activeGroupId: saved.activeGroupId });
      return;
    }

    // Try to migrate from old format
    try {
      const oldNotes = localStorage.getItem(OLD_NOTES_KEY);
      const oldBoards = localStorage.getItem(OLD_BOARDS_KEY);

      const noteTabs: TabItem[] = oldNotes
        ? JSON.parse(oldNotes).map((id: string) => ({ type: "note" as const, id }))
        : [];
      const boardTabs: TabItem[] = oldBoards
        ? JSON.parse(oldBoards).map((id: string) => ({ type: "board" as const, id }))
        : [];

      const allTabs = [...noteTabs, ...boardTabs];

      if (allTabs.length > 0) {
        const groupId = generateId();
        const groups: EditorGroup[] = [
          {
            id: groupId,
            tabs: allTabs,
            activeTabId: allTabs.length > 0 ? getTabKey(allTabs[0]) : null,
          },
        ];

        saveToStorage(groups, groupId);
        set({ groups, activeGroupId: groupId });

        // Clear old storage
        localStorage.removeItem(OLD_NOTES_KEY);
        localStorage.removeItem(OLD_BOARDS_KEY);
      }
    } catch (e) {
      console.error("Failed to migrate from old storage:", e);
    }
  },
}));

// Selector hooks for common use cases
export const useActiveGroup = () => {
  const groups = useEditorGroupStore((state) => state.groups);
  const activeGroupId = useEditorGroupStore((state) => state.activeGroupId);
  return groups.find((g) => g.id === activeGroupId);
};

export const useActiveTab = () => {
  const activeGroup = useActiveGroup();
  if (!activeGroup || !activeGroup.activeTabId) return null;
  return parseTabKey(activeGroup.activeTabId);
};
