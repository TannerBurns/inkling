import { memo, useCallback } from "react";
import { FileText, GripVertical, X, FolderOpen } from "lucide-react";
import type { BoardCardWithNote } from "../../types/board";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface BoardCardProps {
  card: BoardCardWithNote;
  onRemove: (cardId: string) => void;
  isDragging?: boolean;
}

/**
 * A card on the Kanban board representing a note
 */
export const BoardCard = memo(function BoardCard({
  card,
  onRemove,
  isDragging = false,
}: BoardCardProps) {
  const { openTab } = useEditorGroupStore();

  const handleClick = useCallback(() => {
    openTab({ type: "note", id: card.noteId });
  }, [openTab, card.noteId]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(card.id);
    },
    [onRemove, card.id]
  );

  return (
    <div
      onClick={handleClick}
      className="group relative cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: isDragging ? "var(--color-accent)" : "var(--color-border)",
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-opacity group-hover:opacity-50"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <GripVertical size={14} />
      </div>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        className="absolute right-1 top-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--color-text-tertiary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-tertiary)";
        }}
        title="Remove from board"
      >
        <X size={14} />
      </button>

      {/* Card content */}
      <div className="flex items-start gap-2 pl-4">
        <FileText
          size={16}
          className="mt-0.5 flex-shrink-0"
          style={{ color: "var(--color-accent)" }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium leading-snug"
            style={{ color: "var(--color-text-primary)" }}
          >
            {card.noteTitle}
          </p>
          {card.noteFolderPath && (
            <div
              className="mt-1 flex items-center gap-1 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <FolderOpen size={12} />
              <span className="truncate">{card.noteFolderPath}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default BoardCard;
