import { useEffect } from "react";
import { FileText } from "lucide-react";
import { useDragStore } from "../../stores/dragStore";

/**
 * Floating overlay that shows the dragged note and follows the cursor
 */
export function DragOverlay() {
  const { isDragging, draggedNoteTitle, mouseX, mouseY, updatePosition, endDrag } = useDragStore();

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePosition(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      // The actual drop handling happens in the drop targets
      // We just need to end the drag here if nothing caught it
      endDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updatePosition, endDrag]);

  if (!isDragging) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
      style={{
        left: mouseX + 12,
        top: mouseY + 12,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-accent)",
        color: "var(--color-text-primary)",
        maxWidth: 200,
      }}
    >
      <FileText size={14} style={{ color: "var(--color-accent)" }} />
      <span className="truncate text-sm font-medium">
        {draggedNoteTitle || "Untitled"}
      </span>
    </div>
  );
}
