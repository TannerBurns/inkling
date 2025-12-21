import { memo, useCallback } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { BoardLane as BoardLaneType, BoardCardWithNote } from "../../types/board";
import { SortableCard } from "./SortableCard";

interface BoardLaneProps {
  lane: BoardLaneType;
  cards: BoardCardWithNote[];
  onAddCard: (laneId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onSettingsClick: (lane: BoardLaneType) => void;
  onMoveCard?: (cardId: string, targetLaneId: string, targetPosition: number) => void;
}

/**
 * A lane (column) in the Kanban board
 */
export const BoardLane = memo(function BoardLane({
  lane,
  cards,
  onAddCard,
  onRemoveCard,
  onSettingsClick,
}: BoardLaneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: lane.id,
  });

  const handleAddCard = useCallback(() => {
    onAddCard(lane.id);
  }, [onAddCard, lane.id]);

  const handleSettingsClick = useCallback(() => {
    onSettingsClick(lane);
  }, [onSettingsClick, lane]);

  const cardIds = cards.map((c) => c.id);

  return (
    <div
      className="flex h-full w-72 flex-shrink-0 flex-col rounded-lg"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      {/* Lane header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          {/* Color indicator */}
          {lane.color && (
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: lane.color }}
            />
          )}
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {lane.name}
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            {cards.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleAddCard}
            className="rounded p-1 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
            title="Add card"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={handleSettingsClick}
            className="rounded p-1 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
            title="Lane settings"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2"
        style={{
          backgroundColor: isOver ? "var(--color-bg-tertiary)" : "transparent",
        }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {cards.map((card) => (
              <SortableCard key={card.id} card={card} onRemove={onRemoveCard} />
            ))}

            {cards.length === 0 && (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <p className="text-sm">No cards</p>
                <button
                  onClick={handleAddCard}
                  className="mt-2 text-sm underline transition-colors hover:text-[var(--color-accent)]"
                >
                  Add a note
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
});

export default BoardLane;
