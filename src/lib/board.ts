/**
 * Typed wrappers for Board-related Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  Board,
  BoardLane,
  BoardCard,
  BoardCardWithNote,
  BoardWithDetails,
} from "../types/board";

// ============================================================================
// Board Commands
// ============================================================================

/**
 * Create a new board for a folder
 */
export async function createBoard(
  folderId: string,
  name: string
): Promise<BoardWithDetails> {
  return invoke<BoardWithDetails>("create_board", { folderId, name });
}

/**
 * Get a board by ID
 */
export async function getBoard(id: string): Promise<Board | null> {
  return invoke<Board | null>("get_board", { id });
}

/**
 * Get a board by folder ID
 */
export async function getBoardByFolder(folderId: string): Promise<Board | null> {
  return invoke<Board | null>("get_board_by_folder", { folderId });
}

/**
 * Get all boards
 */
export async function getAllBoards(): Promise<Board[]> {
  return invoke<Board[]>("get_all_boards");
}

/**
 * Get a board with all its lanes and cards
 */
export async function getBoardWithDetails(
  id: string
): Promise<BoardWithDetails | null> {
  return invoke<BoardWithDetails | null>("get_board_with_details", { id });
}

/**
 * Update a board
 */
export async function updateBoard(
  id: string,
  name: string | null
): Promise<Board> {
  return invoke<Board>("update_board", { id, name });
}

/**
 * Delete a board
 */
export async function deleteBoard(id: string): Promise<boolean> {
  return invoke<boolean>("delete_board", { id });
}

// ============================================================================
// Lane Commands
// ============================================================================

/**
 * Create a new lane
 */
export async function createLane(
  boardId: string,
  name: string,
  color?: string | null
): Promise<BoardLane> {
  return invoke<BoardLane>("create_lane", {
    boardId,
    name,
    color: color ?? null,
  });
}

/**
 * Get all lanes for a board
 */
export async function getLanesForBoard(boardId: string): Promise<BoardLane[]> {
  return invoke<BoardLane[]>("get_lanes_for_board", { boardId });
}

/**
 * Update a lane
 */
export async function updateLane(
  id: string,
  name?: string | null,
  color?: string | null
): Promise<BoardLane> {
  return invoke<BoardLane>("update_lane", {
    id,
    name: name ?? null,
    color: color ?? null,
  });
}

/**
 * Delete a lane
 */
export async function deleteLane(id: string): Promise<boolean> {
  return invoke<boolean>("delete_lane", { id });
}

/**
 * Reorder lanes
 */
export async function reorderLanes(
  boardId: string,
  laneIds: string[]
): Promise<void> {
  return invoke<void>("reorder_lanes", { boardId, laneIds });
}

// ============================================================================
// Card Commands
// ============================================================================

/**
 * Add a card to a lane
 */
export async function addCard(
  boardId: string,
  laneId: string,
  noteId: string
): Promise<BoardCard> {
  return invoke<BoardCard>("add_card", { boardId, laneId, noteId });
}

/**
 * Get all cards for a board
 */
export async function getCardsForBoard(
  boardId: string
): Promise<BoardCardWithNote[]> {
  return invoke<BoardCardWithNote[]>("get_cards_for_board", { boardId });
}

/**
 * Get cards in a specific lane
 */
export async function getCardsInLane(
  laneId: string
): Promise<BoardCardWithNote[]> {
  return invoke<BoardCardWithNote[]>("get_cards_in_lane", { laneId });
}

/**
 * Move a card to a different lane and/or position
 */
export async function moveCard(
  cardId: string,
  targetLaneId: string,
  targetPosition: number
): Promise<BoardCard> {
  return invoke<BoardCard>("move_card", {
    cardId,
    targetLaneId,
    targetPosition,
  });
}

/**
 * Remove a card from a board
 */
export async function removeCard(id: string): Promise<boolean> {
  return invoke<boolean>("remove_card", { id });
}

/**
 * Get all boards that a note appears on
 */
export async function getBoardsForNote(noteId: string): Promise<Board[]> {
  return invoke<Board[]>("get_boards_for_note", { noteId });
}
