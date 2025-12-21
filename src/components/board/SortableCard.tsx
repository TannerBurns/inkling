import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardCardWithNote } from "../../types/board";
import { BoardCard } from "./BoardCard";

interface SortableCardProps {
  card: BoardCardWithNote;
  onRemove: (cardId: string) => void;
}

/**
 * Sortable wrapper for BoardCard using @dnd-kit
 */
export const SortableCard = memo(function SortableCard({
  card,
  onRemove,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BoardCard card={card} onRemove={onRemove} isDragging={isDragging} />
    </div>
  );
});

export default SortableCard;
