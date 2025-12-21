import { MouseEvent, useEffect, useRef } from "react";
import { Trash2, GripVertical } from "lucide-react";
import type { Note } from "../../types/note";
import { useDragStore } from "../../stores/dragStore";

interface NoteCardProps {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * Individual note preview card in the note list
 * Supports drag-and-drop to move to folders
 */
export function NoteCard({
  note,
  isSelected,
  onSelect,
  onDelete,
}: NoteCardProps) {
  const { startDrag, isDragging, draggedNoteId } = useDragStore();
  const isBeingDragged = isDragging && draggedNoteId === note.id;
  const cardRef = useRef<HTMLDivElement>(null);

  // Reset background color when drag ends to fix stuck hover state
  useEffect(() => {
    if (!isDragging && cardRef.current && !isSelected) {
      cardRef.current.style.backgroundColor = "transparent";
    }
  }, [isDragging, isSelected]);

  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "short" });
    } else {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
  };

  // Get a preview of the note content
  const getPreview = () => {
    if (!note.content) return "No content";
    // Strip any HTML tags if contentHtml is used
    const text = note.content.replace(/<[^>]*>/g, "").trim();
    return text || "No content";
  };

  // Handle mouse down on the drag handle
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(note.id, note.title, e.clientX, e.clientY);
  };

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className="group relative border-b p-3 transition-colors"
      style={{
        backgroundColor: isSelected
          ? "var(--color-bg-tertiary)"
          : "transparent",
        borderColor: "var(--color-border)",
        opacity: isBeingDragged ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isBeingDragged) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isBeingDragged) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {/* Drag Handle (appears on hover) */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <GripVertical size={14} />
      </div>

      {/* Title and Date Row - pr-6 leaves space for delete button */}
      <div className="mb-1 flex items-start justify-between gap-2 pl-3 pr-6">
        <h3
          className="flex-1 truncate text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {note.title || "Untitled"}
        </h3>
        <span
          className="flex-shrink-0 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {formatDate(note.updatedAt)}
        </span>
      </div>

      {/* Content Preview */}
      <p
        className="truncate-2 pl-3 text-xs leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {getPreview()}
      </p>

      {/* Delete Button (appears on hover) */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 z-10 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--color-text-tertiary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-danger)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-tertiary)";
        }}
        title="Delete note"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
