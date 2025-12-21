import { useState, useCallback, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import type { BoardLane } from "../../types/board";

interface LaneSettingsModalProps {
  lane: BoardLane;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (name: string, color?: string) => void;
  onDelete: () => void;
}

const LANE_COLORS = [
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

/**
 * Modal for editing lane settings
 */
export function LaneSettingsModal({
  lane,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
}: LaneSettingsModalProps) {
  const [name, setName] = useState(lane.name);
  const [color, setColor] = useState(lane.color || LANE_COLORS[0].value);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setName(lane.name);
    setColor(lane.color || LANE_COLORS[0].value);
    setShowDeleteConfirm(false);
  }, [lane, isOpen]);

  const handleSave = useCallback(() => {
    if (name.trim()) {
      onUpdate(name.trim(), color);
      onClose();
    }
  }, [name, color, onUpdate, onClose]);

  const handleDelete = useCallback(() => {
    if (showDeleteConfirm) {
      onDelete();
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  }, [showDeleteConfirm, onDelete, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSave, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-lg border p-6"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Lane Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Name input */}
        <div className="mb-4">
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            autoFocus
          />
        </div>

        {/* Color picker */}
        <div className="mb-6">
          <label
            className="mb-2 block text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {LANE_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.value,
                  borderColor:
                    color === c.value ? "var(--color-text-primary)" : "transparent",
                }}
                title={c.name}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: showDeleteConfirm ? "#ef4444" : "transparent",
              color: showDeleteConfirm ? "white" : "#ef4444",
            }}
          >
            <Trash2 size={16} />
            {showDeleteConfirm ? "Click to confirm" : "Delete lane"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LaneSettingsModal;
