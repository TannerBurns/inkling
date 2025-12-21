import { memo, useCallback, useState, useRef, useEffect } from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import type { Board } from "../../types/board";

interface BoardHeaderProps {
  board: Board;
  onUpdateName: (name: string) => void;
  onAddLane: () => void;
}

/**
 * Header for the Kanban board with title and actions
 */
export const BoardHeader = memo(function BoardHeader({
  board,
  onUpdateName,
  onAddLane,
}: BoardHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(board.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditValue(board.name);
    setIsEditing(true);
  }, [board.name]);

  const handleSave = useCallback(() => {
    if (editValue.trim() && editValue.trim() !== board.name) {
      onUpdateName(editValue.trim());
    }
    setIsEditing(false);
  }, [editValue, board.name, onUpdateName]);

  const handleCancel = useCallback(() => {
    setEditValue(board.name);
    setIsEditing(false);
  }, [board.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  return (
    <div
      className="flex items-center justify-between border-b px-4 py-3"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Board title */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rounded border px-2 py-1 text-lg font-semibold"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={handleSave}
              className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-accent)" }}
              title="Save"
            >
              <Check size={18} />
            </button>
            <button
              onClick={handleCancel}
              className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Cancel"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {board.name}
            </h1>
            <button
              onClick={handleStartEdit}
              className="rounded p-1 opacity-0 transition-all hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Edit name"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAddLane}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          <Plus size={16} />
          Add Lane
        </button>
      </div>
    </div>
  );
});

export default BoardHeader;
