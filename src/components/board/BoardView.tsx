import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useBoardStore, useBoardLanesWithCards } from "../../stores/boardStore";
import { BoardHeader } from "./BoardHeader";
import { BoardLane } from "./BoardLane";
import { BoardCard } from "./BoardCard";
import { LaneSettingsModal } from "./LaneSettingsModal";
import { AddCardModal } from "./AddCardModal";
import type { BoardLane as BoardLaneType, BoardCardWithNote } from "../../types/board";

interface BoardViewProps {
  boardId?: string;
}

/**
 * Main Kanban board view component
 */
export function BoardView({ boardId }: BoardViewProps) {
  const {
    currentBoard,
    isLoading,
    error,
    updateBoard,
    createLane,
    updateLane,
    deleteLane,
    addCard,
    moveCard,
    removeCard,
    fetchBoardWithDetails,
  } = useBoardStore();

  const lanesWithCards = useBoardLanesWithCards();

  // Load board when boardId prop changes
  useEffect(() => {
    if (boardId && currentBoard?.board.id !== boardId) {
      fetchBoardWithDetails(boardId);
    }
  }, [boardId, currentBoard?.board.id, fetchBoardWithDetails]);

  // Modal states
  const [laneSettingsOpen, setLaneSettingsOpen] = useState(false);
  const [selectedLane, setSelectedLane] = useState<BoardLaneType | null>(null);
  const [addCardModalOpen, setAddCardModalOpen] = useState(false);
  const [addCardLaneId, setAddCardLaneId] = useState<string | null>(null);

  // DnD state
  const [activeCard, setActiveCard] = useState<BoardCardWithNote | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const cardId = active.id as string;
      const card = currentBoard?.cards.find((c) => c.id === cardId);
      if (card) {
        setActiveCard(card);
      }
    },
    [currentBoard]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);

      if (!over || !currentBoard) return;

      const cardId = active.id as string;
      const overId = over.id as string;

      // Find the target lane
      let targetLaneId: string | null = null;
      let targetPosition = 0;

      // Check if dropping on a lane
      const targetLane = lanesWithCards.find((l) => l.id === overId);
      if (targetLane) {
        targetLaneId = targetLane.id;
        targetPosition = targetLane.cards.length;
      } else {
        // Check if dropping on another card
        for (const lane of lanesWithCards) {
          const cardIndex = lane.cards.findIndex((c) => c.id === overId);
          if (cardIndex !== -1) {
            targetLaneId = lane.id;
            targetPosition = cardIndex;
            break;
          }
        }
      }

      if (targetLaneId && cardId !== overId) {
        await moveCard(cardId, targetLaneId, targetPosition);
      }
    },
    [currentBoard, lanesWithCards, moveCard]
  );

  // Handle board name update
  const handleUpdateName = useCallback(
    async (name: string) => {
      if (currentBoard) {
        await updateBoard(currentBoard.board.id, name);
      }
    },
    [currentBoard, updateBoard]
  );

  // Handle add lane
  const handleAddLane = useCallback(async () => {
    if (currentBoard) {
      const laneNumber = currentBoard.lanes.length + 1;
      await createLane(currentBoard.board.id, `Lane ${laneNumber}`);
    }
  }, [currentBoard, createLane]);

  // Handle lane settings click
  const handleLaneSettingsClick = useCallback((lane: BoardLaneType) => {
    setSelectedLane(lane);
    setLaneSettingsOpen(true);
  }, []);

  // Handle lane update
  const handleLaneUpdate = useCallback(
    async (name: string, color?: string) => {
      if (selectedLane) {
        await updateLane(selectedLane.id, name, color);
      }
    },
    [selectedLane, updateLane]
  );

  // Handle lane delete
  const handleLaneDelete = useCallback(async () => {
    if (selectedLane) {
      await deleteLane(selectedLane.id);
    }
  }, [selectedLane, deleteLane]);

  // Handle add card click
  const handleAddCardClick = useCallback((laneId: string) => {
    setAddCardLaneId(laneId);
    setAddCardModalOpen(true);
  }, []);

  // Handle add note to lane
  const handleAddNote = useCallback(
    async (noteId: string) => {
      if (currentBoard && addCardLaneId) {
        await addCard(currentBoard.board.id, addCardLaneId, noteId);
      }
    },
    [currentBoard, addCardLaneId, addCard]
  );

  // Handle remove card
  const handleRemoveCard = useCallback(
    async (cardId: string) => {
      await removeCard(cardId);
    },
    [removeCard]
  );

  // Loading state
  if (isLoading && !currentBoard) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Loading board...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <p className="text-sm" style={{ color: "#ef4444" }}>
          {error}
        </p>
      </div>
    );
  }

  // No board selected
  if (!currentBoard) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          No board selected
        </p>
      </div>
    );
  }

  // Get existing note IDs for the add card modal
  const existingNoteIds = currentBoard.cards.map((c) => c.noteId);

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {/* Board header */}
      <BoardHeader
        board={currentBoard.board}
        onUpdateName={handleUpdateName}
        onAddLane={handleAddLane}
      />

      {/* Board content - horizontal scrolling lanes with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="flex h-full gap-4">
            {lanesWithCards.map((lane) => (
              <BoardLane
                key={lane.id}
                lane={lane}
                cards={lane.cards}
                onAddCard={handleAddCardClick}
                onRemoveCard={handleRemoveCard}
                onSettingsClick={handleLaneSettingsClick}
              />
            ))}

            {/* Add lane button (when empty) */}
            {lanesWithCards.length === 0 && (
              <button
                onClick={handleAddLane}
                className="flex h-full w-72 flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)]"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <span className="text-sm">Add your first lane</span>
              </button>
            )}
          </div>
        </div>

        {/* Drag overlay for active card */}
        <DragOverlay>
          {activeCard ? (
            <BoardCard card={activeCard} onRemove={() => {}} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Lane settings modal */}
      {selectedLane && (
        <LaneSettingsModal
          lane={selectedLane}
          isOpen={laneSettingsOpen}
          onClose={() => {
            setLaneSettingsOpen(false);
            setSelectedLane(null);
          }}
          onUpdate={handleLaneUpdate}
          onDelete={handleLaneDelete}
        />
      )}

      {/* Add card modal */}
      <AddCardModal
        isOpen={addCardModalOpen}
        boardFolderId={currentBoard.board.folderId}
        existingNoteIds={existingNoteIds}
        onClose={() => {
          setAddCardModalOpen(false);
          setAddCardLaneId(null);
        }}
        onAddNote={handleAddNote}
      />
    </div>
  );
}

export default BoardView;
