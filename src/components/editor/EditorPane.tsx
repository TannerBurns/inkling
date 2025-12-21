import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  useEditorGroupStore,
  type EditorGroup,
  parseTabKey,
} from "../../stores/editorGroupStore";
import { useTabDragStore } from "../../stores/tabDragStore";
import { PaneTabs } from "./PaneTabs";
import { PaneContent } from "./PaneContent";

interface EditorPaneProps {
  group: EditorGroup;
  isActive: boolean;
  canClose: boolean;
}

/**
 * Individual editor pane containing a tab bar and content area.
 * Handles focus state and close functionality.
 */
export function EditorPane({ group, isActive, canClose }: EditorPaneProps) {
  const focusGroup = useEditorGroupStore((state) => state.focusGroup);
  const closeGroup = useEditorGroupStore((state) => state.closeGroup);
  const paneRef = useRef<HTMLDivElement>(null);

  // Tab drag state
  const { isDragging, setDropTarget, dropTargetGroupId } = useTabDragStore();

  // Get the active tab for this group
  const activeTab = group.activeTabId ? parseTabKey(group.activeTabId) : null;

  // Handle clicking on the pane to focus it
  const handlePaneClick = useCallback(() => {
    if (!isActive) {
      focusGroup(group.id);
    }
  }, [isActive, focusGroup, group.id]);

  // Handle closing the entire pane
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeGroup(group.id);
    },
    [closeGroup, group.id]
  );

  // Track when dragging over the pane content area (as a fallback drop zone)
  useEffect(() => {
    if (!isDragging || !paneRef.current) return;

    const pane = paneRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = pane.getBoundingClientRect();

      // Check if mouse is within the pane
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        // Only set as target if not already set by the tab bar
        const currentTarget = useTabDragStore.getState().dropTargetGroupId;
        if (currentTarget !== group.id) {
          setDropTarget(group.id, null);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isDragging, group.id, setDropTarget]);

  const isDropTarget = isDragging && dropTargetGroupId === group.id;

  return (
    <div
      ref={paneRef}
      onClick={handlePaneClick}
      className="flex h-full flex-col overflow-hidden"
      style={{
        backgroundColor: isDropTarget
          ? "var(--color-bg-tertiary)"
          : "var(--color-bg-primary)",
        borderLeft: isActive
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
        outline: isDropTarget ? "2px dashed var(--color-accent)" : "none",
        outlineOffset: "-2px",
      }}
    >
      {/* Tab bar with close button */}
      <div className="relative flex-shrink-0">
        <PaneTabs group={group} />

        {/* Pane close button (only show if multiple panes and has tabs) */}
        {canClose && group.tabs.length > 0 && (
          <button
            onClick={handleClose}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--color-bg-hover)] group-hover:opacity-100"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Close split"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <PaneContent groupId={group.id} activeTab={activeTab} />
      </div>
    </div>
  );
}

export default EditorPane;
