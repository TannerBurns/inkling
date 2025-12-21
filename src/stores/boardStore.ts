import { create } from "zustand";
import type {
  Board,
  BoardLane,
  BoardWithDetails,
} from "../types/board";
import * as api from "../lib/board";

interface BoardState {
  // State
  boards: Board[];
  currentBoard: BoardWithDetails | null;
  openBoardIds: string[]; // Ordered list of open board tab IDs
  selectedBoardId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAllBoards: () => Promise<void>;
  fetchBoardWithDetails: (id: string) => Promise<void>;
  getBoardByFolder: (folderId: string) => Promise<Board | null>;
  createBoard: (folderId: string, name: string) => Promise<BoardWithDetails>;
  updateBoard: (id: string, name: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;

  // Lane actions
  createLane: (boardId: string, name: string, color?: string) => Promise<void>;
  updateLane: (id: string, name?: string, color?: string) => Promise<void>;
  deleteLane: (id: string) => Promise<void>;
  reorderLanes: (boardId: string, laneIds: string[]) => Promise<void>;

  // Card actions
  addCard: (boardId: string, laneId: string, noteId: string) => Promise<void>;
  moveCard: (cardId: string, targetLaneId: string, targetPosition: number) => Promise<void>;
  removeCard: (id: string) => Promise<void>;

  // Tab management
  openBoard: (id: string) => void;
  closeBoard: (id: string) => void;
  selectBoard: (id: string | null) => void;

  // Utilities
  clearError: () => void;
}

// Helper to load open boards from localStorage
const loadOpenBoardIds = (): string[] => {
  try {
    const saved = localStorage.getItem("inkling-open-boards");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Helper to save open boards to localStorage
const saveOpenBoardIds = (ids: string[]) => {
  localStorage.setItem("inkling-open-boards", JSON.stringify(ids));
};

export const useBoardStore = create<BoardState>((set, get) => ({
  // Initial state
  boards: [],
  currentBoard: null,
  openBoardIds: loadOpenBoardIds(),
  selectedBoardId: null,
  isLoading: false,
  error: null,

  // Fetch all boards
  fetchAllBoards: async () => {
    set({ isLoading: true, error: null });
    try {
      const boards = await api.getAllBoards();
      set({ boards, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch a board with all details
  fetchBoardWithDetails: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const details = await api.getBoardWithDetails(id);
      if (details) {
        set({ currentBoard: details, isLoading: false });
      } else {
        set({ error: "Board not found", isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Get board by folder ID
  getBoardByFolder: async (folderId: string) => {
    try {
      return await api.getBoardByFolder(folderId);
    } catch (error) {
      console.error("Failed to get board by folder:", error);
      return null;
    }
  },

  // Create a new board
  createBoard: async (folderId: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const details = await api.createBoard(folderId, name);
      const { openBoardIds } = get();
      
      // Add to boards list
      set((state) => ({
        boards: [details.board, ...state.boards],
        currentBoard: details,
        isLoading: false,
      }));

      // Open the new board as a tab
      const newOpenBoardIds = [...openBoardIds, details.board.id];
      saveOpenBoardIds(newOpenBoardIds);
      set({ openBoardIds: newOpenBoardIds, selectedBoardId: details.board.id });

      return details;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update a board
  updateBoard: async (id: string, name: string) => {
    set({ error: null });
    try {
      const updated = await api.updateBoard(id, name);
      set((state) => ({
        boards: state.boards.map((b) => (b.id === id ? updated : b)),
        currentBoard:
          state.currentBoard?.board.id === id
            ? { ...state.currentBoard, board: updated }
            : state.currentBoard,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Delete a board
  deleteBoard: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteBoard(id);
      const { openBoardIds, selectedBoardId } = get();

      // Remove from open tabs
      const newOpenBoardIds = openBoardIds.filter((bid) => bid !== id);
      if (newOpenBoardIds.length !== openBoardIds.length) {
        saveOpenBoardIds(newOpenBoardIds);
      }

      // Update selected board if needed
      let newSelectedId = selectedBoardId;
      if (selectedBoardId === id) {
        newSelectedId = newOpenBoardIds.length > 0 ? newOpenBoardIds[0] : null;
      }

      set((state) => ({
        boards: state.boards.filter((b) => b.id !== id),
        openBoardIds: newOpenBoardIds,
        selectedBoardId: newSelectedId,
        currentBoard:
          state.currentBoard?.board.id === id ? null : state.currentBoard,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Create a lane
  createLane: async (boardId: string, name: string, color?: string) => {
    set({ error: null });
    try {
      const lane = await api.createLane(boardId, name, color);
      set((state) => {
        if (state.currentBoard?.board.id === boardId) {
          return {
            currentBoard: {
              ...state.currentBoard,
              lanes: [...state.currentBoard.lanes, lane],
            },
          };
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Update a lane
  updateLane: async (id: string, name?: string, color?: string) => {
    set({ error: null });
    try {
      const updated = await api.updateLane(id, name, color);
      set((state) => {
        if (state.currentBoard) {
          return {
            currentBoard: {
              ...state.currentBoard,
              lanes: state.currentBoard.lanes.map((l) =>
                l.id === id ? updated : l
              ),
            },
          };
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Delete a lane
  deleteLane: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteLane(id);
      set((state) => {
        if (state.currentBoard) {
          return {
            currentBoard: {
              ...state.currentBoard,
              lanes: state.currentBoard.lanes.filter((l) => l.id !== id),
              cards: state.currentBoard.cards.filter((c) => c.laneId !== id),
            },
          };
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Reorder lanes
  reorderLanes: async (boardId: string, laneIds: string[]) => {
    set({ error: null });
    try {
      await api.reorderLanes(boardId, laneIds);
      set((state) => {
        if (state.currentBoard?.board.id === boardId) {
          // Reorder lanes based on new order
          const lanesMap = new Map(
            state.currentBoard.lanes.map((l) => [l.id, l])
          );
          const reorderedLanes = laneIds
            .map((id, index) => {
              const lane = lanesMap.get(id);
              return lane ? { ...lane, position: index } : null;
            })
            .filter((l): l is BoardLane => l !== null);

          return {
            currentBoard: {
              ...state.currentBoard,
              lanes: reorderedLanes,
            },
          };
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Add a card
  addCard: async (boardId: string, laneId: string, noteId: string) => {
    set({ error: null });
    try {
      await api.addCard(boardId, laneId, noteId);
      // Refresh the board to get the full card with note details
      await get().fetchBoardWithDetails(boardId);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Move a card
  moveCard: async (cardId: string, targetLaneId: string, targetPosition: number) => {
    set({ error: null });
    try {
      await api.moveCard(cardId, targetLaneId, targetPosition);
      // Optimistic update
      set((state) => {
        if (state.currentBoard) {
          const card = state.currentBoard.cards.find((c) => c.id === cardId);
          if (card) {
            const updatedCards = state.currentBoard.cards.map((c) => {
              if (c.id === cardId) {
                return { ...c, laneId: targetLaneId, position: targetPosition };
              }
              return c;
            });
            return {
              currentBoard: {
                ...state.currentBoard,
                cards: updatedCards,
              },
            };
          }
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Remove a card
  removeCard: async (id: string) => {
    set({ error: null });
    try {
      await api.removeCard(id);
      set((state) => {
        if (state.currentBoard) {
          return {
            currentBoard: {
              ...state.currentBoard,
              cards: state.currentBoard.cards.filter((c) => c.id !== id),
            },
          };
        }
        return {};
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Open a board as a tab
  openBoard: (id: string) => {
    const { openBoardIds } = get();
    if (openBoardIds.includes(id)) {
      // Already open, just select it
      set({ selectedBoardId: id });
    } else {
      const newOpenBoardIds = [...openBoardIds, id];
      saveOpenBoardIds(newOpenBoardIds);
      set({ openBoardIds: newOpenBoardIds, selectedBoardId: id });
    }
    // Load the board details
    get().fetchBoardWithDetails(id);
  },

  // Close a board tab
  closeBoard: (id: string) => {
    const { openBoardIds, selectedBoardId } = get();
    const index = openBoardIds.indexOf(id);
    if (index === -1) return;

    const newOpenBoardIds = openBoardIds.filter((bid) => bid !== id);
    saveOpenBoardIds(newOpenBoardIds);

    // If closing the selected board, select an adjacent one
    let newSelectedId = selectedBoardId;
    if (selectedBoardId === id) {
      if (newOpenBoardIds.length === 0) {
        newSelectedId = null;
      } else if (index >= newOpenBoardIds.length) {
        newSelectedId = newOpenBoardIds[newOpenBoardIds.length - 1];
      } else {
        newSelectedId = newOpenBoardIds[index];
      }
    }

    set({
      openBoardIds: newOpenBoardIds,
      selectedBoardId: newSelectedId,
      currentBoard:
        get().currentBoard?.board.id === id ? null : get().currentBoard,
    });
  },

  // Select a board
  selectBoard: (id: string | null) => {
    set({ selectedBoardId: id });
    if (id) {
      get().fetchBoardWithDetails(id);
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

// Selector for open boards
export const useOpenBoards = () => {
  const boards = useBoardStore((state) => state.boards);
  const openBoardIds = useBoardStore((state) => state.openBoardIds);
  return openBoardIds
    .map((id) => boards.find((b) => b.id === id))
    .filter((b): b is Board => b !== undefined);
};

// Selector for current board's lanes with cards
export const useBoardLanesWithCards = () => {
  const currentBoard = useBoardStore((state) => state.currentBoard);
  if (!currentBoard) return [];

  return currentBoard.lanes.map((lane) => ({
    ...lane,
    cards: currentBoard.cards
      .filter((c) => c.laneId === lane.id)
      .sort((a, b) => a.position - b.position),
  }));
};
