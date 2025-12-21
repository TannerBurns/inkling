import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditorGroupStore } from "../../stores/editorGroupStore";
import { useTabDragStore } from "../../stores/tabDragStore";
import { EditorPane } from "./EditorPane";
import { TabDragOverlay } from "./TabDragOverlay";

const MIN_PANE_WIDTH = 300;
const DEFAULT_PANE_FLEX = 1;

interface PaneSize {
  groupId: string;
  flex: number;
}

/**
 * Container that manages split editor panes horizontally.
 * Supports multiple panes with draggable resize handles between them.
 */
export function SplitContainer() {
  const groups = useEditorGroupStore((state) => state.groups);
  const activeGroupId = useEditorGroupStore((state) => state.activeGroupId);
  const focusGroup = useEditorGroupStore((state) => state.focusGroup);
  const migrateFromOldStorage = useEditorGroupStore((state) => state.migrateFromOldStorage);
  
  // Use the new tab drag store
  const isDraggingTab = useTabDragStore((state) => state.isDragging);

  // Track pane sizes (flex values)
  const [paneSizes, setPaneSizes] = useState<PaneSize[]>(() => {
    try {
      const saved = localStorage.getItem("inkling-pane-sizes");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Resize state
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startSizesRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  // Drop zone visibility for creating new splits
  const [showRightDropZone, setShowRightDropZone] = useState(false);

  // Migrate from old storage on mount
  useEffect(() => {
    migrateFromOldStorage();
  }, [migrateFromOldStorage]);


  // Update pane sizes when groups change
  useEffect(() => {
    setPaneSizes((prev) => {
      const newSizes: PaneSize[] = groups.map((g) => {
        const existing = prev.find((p) => p.groupId === g.id);
        return existing || { groupId: g.id, flex: DEFAULT_PANE_FLEX };
      });
      return newSizes;
    });
  }, [groups]);

  // Save pane sizes to localStorage
  useEffect(() => {
    localStorage.setItem("inkling-pane-sizes", JSON.stringify(paneSizes));
  }, [paneSizes]);

  // Get flex value for a group
  const getFlexForGroup = useCallback(
    (groupId: string) => {
      const size = paneSizes.find((p) => p.groupId === groupId);
      return size?.flex || DEFAULT_PANE_FLEX;
    },
    [paneSizes]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingIndex(index);
      startXRef.current = e.clientX;

      // Get actual widths of the panes being resized using group IDs
      const container = containerRef.current;
      if (container && groups[index] && groups[index + 1]) {
        const leftPane = container.querySelector(`[data-group-id="${groups[index].id}"]`) as HTMLElement;
        const rightPane = container.querySelector(`[data-group-id="${groups[index + 1].id}"]`) as HTMLElement;
        if (leftPane && rightPane) {
          startSizesRef.current = {
            left: leftPane.offsetWidth,
            right: rightPane.offsetWidth,
          };
        }
      }
    },
    [groups]
  );

  // Handle mouse move during resize
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (resizingIndex === null) return;

      const delta = e.clientX - startXRef.current;
      const { left, right } = startSizesRef.current;
      const total = left + right;

      // Calculate new sizes respecting minimum width
      let newLeft = left + delta;
      let newRight = right - delta;

      if (newLeft < MIN_PANE_WIDTH) {
        newLeft = MIN_PANE_WIDTH;
        newRight = total - MIN_PANE_WIDTH;
      } else if (newRight < MIN_PANE_WIDTH) {
        newRight = MIN_PANE_WIDTH;
        newLeft = total - MIN_PANE_WIDTH;
      }

      // Convert to flex ratios
      const leftFlex = newLeft / total;
      const rightFlex = newRight / total;

      setPaneSizes((prev) => {
        const newSizes = [...prev];
        const leftGroup = groups[resizingIndex];
        const rightGroup = groups[resizingIndex + 1];

        const leftIndex = newSizes.findIndex((p) => p.groupId === leftGroup.id);
        const rightIndex = newSizes.findIndex((p) => p.groupId === rightGroup.id);

        if (leftIndex !== -1) {
          newSizes[leftIndex] = { ...newSizes[leftIndex], flex: leftFlex * 2 };
        }
        if (rightIndex !== -1) {
          newSizes[rightIndex] = { ...newSizes[rightIndex], flex: rightFlex * 2 };
        }

        return newSizes;
      });
    },
    [resizingIndex, groups]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setResizingIndex(null);
  }, []);

  // Add/remove global mouse listeners for resize
  useEffect(() => {
    if (resizingIndex !== null) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingIndex, handleMouseMove, handleMouseUp]);

  // Show/hide right drop zone based on tab dragging state
  useEffect(() => {
    setShowRightDropZone(isDraggingTab);
  }, [isDraggingTab]);

  // Track when mouse is over the right drop zone
  const rightDropZoneRef = useRef<HTMLDivElement>(null);
  const [isOverRightZone, setIsOverRightZone] = useState(false);

  useEffect(() => {
    if (!isDraggingTab || !rightDropZoneRef.current) return;

    const zone = rightDropZoneRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = zone.getBoundingClientRect();
      const isOver =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      setIsOverRightZone(isOver);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      setIsOverRightZone(false);
    };
  }, [isDraggingTab]);

  // Handle drop on right zone (called from TabDragOverlay via store check)
  useEffect(() => {
    if (!isDraggingTab) return;

    const handleMouseUp = () => {
      if (!isOverRightZone) return;

      const { draggedTab, fromGroupId, endDrag } = useTabDragStore.getState();
      if (draggedTab && fromGroupId) {
        console.log("[SplitContainer] Dropping on right zone to create split");
        useEditorGroupStore.getState().splitWithTab(draggedTab, fromGroupId);
      }
      endDrag();
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isDraggingTab, isOverRightZone]);

  // Keyboard shortcuts for split navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+\ to split current tab
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup && activeGroup.activeTabId) {
          const parts = activeGroup.activeTabId.split(":");
          if (parts.length === 2) {
            const tab = { type: parts[0] as "note" | "board" | "graph", id: parts[1] };
            useEditorGroupStore.getState().splitWithTab(tab, activeGroupId);
          }
        }
      }

      // Cmd+Option+Left/Right to focus adjacent pane
      if ((e.metaKey || e.ctrlKey) && e.altKey) {
        const currentIndex = groups.findIndex((g) => g.id === activeGroupId);
        if (e.key === "ArrowLeft" && currentIndex > 0) {
          e.preventDefault();
          focusGroup(groups[currentIndex - 1].id);
        } else if (e.key === "ArrowRight" && currentIndex < groups.length - 1) {
          e.preventDefault();
          focusGroup(groups[currentIndex + 1].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [groups, activeGroupId, focusGroup]);

  return (
    <div
      ref={containerRef}
      className="flex h-full min-w-0 flex-1 overflow-hidden"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {groups.map((group, index) => (
        <React.Fragment key={group.id}>
          {/* Editor Pane */}
          <div
            data-pane
            data-group-id={group.id}
            className="h-full min-w-0 overflow-hidden"
            style={{ 
              flex: getFlexForGroup(group.id),
              minWidth: MIN_PANE_WIDTH,
            }}
          >
            <EditorPane
              group={group}
              isActive={group.id === activeGroupId}
              canClose={groups.length > 1}
            />
          </div>

          {/* Resize Handle (between panes) */}
          {index < groups.length - 1 && (
            <div
              onMouseDown={(e) => handleResizeStart(e, index)}
              className="group relative h-full w-1 flex-shrink-0 cursor-col-resize hover:w-1"
              style={{ backgroundColor: "var(--color-border)" }}
            >
              {/* Wider hit area for easier grabbing */}
              <div
                className="absolute inset-y-0 -left-2 -right-2 z-20"
                style={{ cursor: "col-resize" }}
              />
              {/* Visual indicator */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 right-0 transition-colors group-hover:bg-[var(--color-accent)]"
                style={{
                  backgroundColor:
                    resizingIndex === index ? "var(--color-accent)" : "transparent",
                }}
              />
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Right edge drop zone for creating new split */}
      {showRightDropZone && (
        <div
          ref={rightDropZoneRef}
          className="flex h-full w-16 flex-shrink-0 items-center justify-center border-l-2 border-dashed transition-colors"
          style={{
            borderColor: isOverRightZone ? "var(--color-accent)" : "var(--color-border)",
            backgroundColor: isOverRightZone ? "var(--color-bg-tertiary)" : "var(--color-bg-secondary)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: isOverRightZone ? "var(--color-accent)" : "var(--color-text-secondary)" }}
          >
            Split
          </span>
        </div>
      )}

      {/* Tab drag overlay */}
      <TabDragOverlay />
    </div>
  );
}

export default SplitContainer;
