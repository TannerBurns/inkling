import { useEffect, useCallback } from "react";
import { FileText, Kanban } from "lucide-react";
import { useTabDragStore } from "../../stores/tabDragStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";
import { useNoteStore } from "../../stores/noteStore";
import { useBoardStore } from "../../stores/boardStore";

/**
 * Floating overlay that shows the dragged tab and follows the cursor.
 * Also handles the global mouse events for the drag operation.
 */
export function TabDragOverlay() {
  const {
    isDragging,
    draggedTab,
    fromGroupId,
    mouseX,
    mouseY,
    dropTargetGroupId,
    updatePosition,
    endDrag,
  } = useTabDragStore();

  const moveTabToGroup = useEditorGroupStore((state) => state.moveTabToGroup);
  const reorderTabsInGroup = useEditorGroupStore((state) => state.reorderTabsInGroup);
  const groups = useEditorGroupStore((state) => state.groups);
  
  const notes = useNoteStore((state) => state.notes);
  const boards = useBoardStore((state) => state.boards);

  // Get the title for the dragged tab
  const getTitle = useCallback(() => {
    if (!draggedTab) return "Tab";
    if (draggedTab.type === "note") {
      const note = notes.find((n) => n.id === draggedTab.id);
      return note?.title || "Untitled";
    } else {
      const board = boards.find((b) => b.id === draggedTab.id);
      return board?.name || "Untitled Board";
    }
  }, [draggedTab, notes, boards]);

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX, e.clientY);
    },
    [isDragging, updatePosition]
  );

  // Handle mouse up (drop)
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !draggedTab || !fromGroupId) {
      endDrag();
      return;
    }

    const { dropTargetGroupId, dropTargetIndex } = useTabDragStore.getState();
    console.log("[TabDragOverlay] handleMouseUp", { dropTargetGroupId, dropTargetIndex, fromGroupId });

    if (dropTargetGroupId && dropTargetGroupId !== fromGroupId) {
      // Moving to a different group
      console.log("[TabDragOverlay] Moving tab to different group");
      moveTabToGroup(draggedTab, fromGroupId, dropTargetGroupId, dropTargetIndex ?? undefined);
    } else if (dropTargetGroupId === fromGroupId && dropTargetIndex !== null) {
      // Reordering within the same group
      const group = groups.find((g) => g.id === fromGroupId);
      if (group) {
        const currentIndex = group.tabs.findIndex(
          (t) => t.type === draggedTab.type && t.id === draggedTab.id
        );
        if (currentIndex !== -1 && currentIndex !== dropTargetIndex) {
          console.log("[TabDragOverlay] Reordering within group", { currentIndex, dropTargetIndex });
          reorderTabsInGroup(fromGroupId, currentIndex, dropTargetIndex);
        }
      }
    }

    endDrag();
  }, [isDragging, draggedTab, fromGroupId, groups, moveTabToGroup, reorderTabsInGroup, endDrag]);

  // Set up global event listeners
  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isDragging || !draggedTab) return null;

  const title = getTitle();
  const isNote = draggedTab.type === "note";
  const hasValidTarget = dropTargetGroupId !== null;

  return (
    <div
      className="pointer-events-none fixed z-[100] flex items-center gap-2 rounded-lg border-2 px-3 py-2 shadow-lg"
      style={{
        left: mouseX + 12,
        top: mouseY + 12,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: hasValidTarget ? "var(--color-accent)" : "var(--color-border)",
        color: "var(--color-text-primary)",
        maxWidth: 200,
        opacity: 0.95,
      }}
    >
      {isNote ? (
        <FileText size={14} style={{ color: "var(--color-accent)" }} />
      ) : (
        <Kanban size={14} style={{ color: "var(--color-accent)" }} />
      )}
      <span className="truncate text-sm font-medium">{title}</span>
    </div>
  );
}
