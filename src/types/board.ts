/**
 * A Kanban board associated with a folder
 */
export interface Board {
  id: string;
  folderId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new board
 */
export interface CreateBoardInput {
  folderId: string;
  name: string;
}

/**
 * Input for updating a board
 */
export interface UpdateBoardInput {
  name?: string | null;
}

/**
 * A lane (column) in a Kanban board
 */
export interface BoardLane {
  id: string;
  boardId: string;
  name: string;
  color: string | null;
  position: number;
}

/**
 * Input for creating a new lane
 */
export interface CreateLaneInput {
  boardId: string;
  name: string;
  color?: string | null;
}

/**
 * Input for updating a lane
 */
export interface UpdateLaneInput {
  name?: string | null;
  color?: string | null;
}

/**
 * A card (note reference) on a board
 */
export interface BoardCard {
  id: string;
  boardId: string;
  laneId: string;
  noteId: string;
  position: number;
}

/**
 * A card with note details for display
 */
export interface BoardCardWithNote {
  id: string;
  boardId: string;
  laneId: string;
  noteId: string;
  position: number;
  noteTitle: string;
  noteFolderPath: string | null;
}

/**
 * Input for adding a card to a lane
 */
export interface AddCardInput {
  boardId: string;
  laneId: string;
  noteId: string;
}

/**
 * Input for moving a card
 */
export interface MoveCardInput {
  cardId: string;
  targetLaneId: string;
  targetPosition: number;
}

/**
 * A board with all its lanes and cards
 */
export interface BoardWithDetails {
  board: Board;
  lanes: BoardLane[];
  cards: BoardCardWithNote[];
}
