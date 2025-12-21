import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { X, FileText, Kanban, SplitSquareHorizontal } from "lucide-react";
import {
  useEditorGroupStore,
  type EditorGroup,
  type TabItem,
  getTabKey,
} from "../../stores/editorGroupStore";
import { useTabDragStore } from "../../stores/tabDragStore";
import { useNoteStore } from "../../stores/noteStore";
import { useBoardStore } from "../../stores/boardStore";

interface PaneTabsProps {
  group: EditorGroup;
}

// Tab with display info
type TabDisplay = TabItem & {
  title: string;
};

/**
 * Tab bar for a single editor pane.
 * Supports mouse-based drag within and between panes.
 */
export function PaneTabs({ group: groupProp }: PaneTabsProps) {
  const notes = useNoteStore((state) => state.notes);
  const boards = useBoardStore((state) => state.boards);
  const groups = useEditorGroupStore((state) => state.groups);

  // Get the latest group data from the store to ensure we have fresh data
  const group = groups.find((g) => g.id === groupProp.id) || groupProp;

  const { selectTab, closeTab, closeOtherTabs, splitWithTab, focusGroup } =
    useEditorGroupStore();

  // Tab drag store
  const {
    isDragging: isGlobalDragging,
    draggedTab,
    startDrag,
    setDropTarget,
  } = useTabDragStore();

  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Build tabs with display titles
  const tabs: TabDisplay[] = useMemo(() => {
    return group.tabs.map((tab) => {
      if (tab.type === "note") {
        const note = notes.find((n) => n.id === tab.id);
        return { ...tab, title: note?.title || "Untitled" };
      } else {
        const board = boards.find((b) => b.id === tab.id);
        return { ...tab, title: board?.name || "Untitled Board" };
      }
    });
  }, [group.tabs, notes, boards]);

  // Handle tab click
  const handleTabClick = useCallback(
    (tab: TabItem) => {
      focusGroup(group.id);
      selectTab(tab, group.id);
    },
    [focusGroup, selectTab, group.id]
  );

  // Handle close button click
  const handleClose = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      e.stopPropagation();
      closeTab(tab, group.id);
    },
    [closeTab, group.id]
  );

  // Handle middle-click to close
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab, group.id);
      }
    },
    [closeTab, group.id]
  );

  // Handle context menu (shift+right-click to close others)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      e.preventDefault();
      if (e.shiftKey) {
        closeOtherTabs(tab, group.id);
      }
    },
    [closeOtherTabs, group.id]
  );

  // Handle split button click
  const handleSplit = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      e.stopPropagation();
      splitWithTab(tab, group.id);
    },
    [splitWithTab, group.id]
  );

  // Start dragging a tab (on mouse down + move)
  const handleTabMouseDown = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      // Only handle left mouse button
      if (e.button !== 0) return;

      // Don't start drag if clicking on close button or split button
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        // Start drag after moving a small distance
        if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          hasMoved = true;
          startDrag(tab, group.id, moveEvent.clientX, moveEvent.clientY);
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);

        // If we haven't started dragging, treat it as a click
        if (!hasMoved) {
          handleTabClick(tab);
        }
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [group.id, startDrag, handleTabClick]
  );

  // Track drop target when dragging over this tab bar
  useEffect(() => {
    if (!isGlobalDragging || !tabsRef.current) return;

    const tabBar = tabsRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = tabBar.getBoundingClientRect();

      // Check if mouse is within the tab bar
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        // Find which tab we're over
        let foundIndex = group.tabs.length; // Default to end

        for (let i = 0; i < group.tabs.length; i++) {
          const tabKey = getTabKey(group.tabs[i]);
          const tabEl = tabRefs.current.get(tabKey);
          if (tabEl) {
            const tabRect = tabEl.getBoundingClientRect();
            const tabCenter = tabRect.left + tabRect.width / 2;
            if (e.clientX < tabCenter) {
              foundIndex = i;
              break;
            }
          }
        }

        setDropIndex(foundIndex);
        setDropTarget(group.id, foundIndex);
      } else {
        setDropIndex(null);
        // Only clear if this group was the target
        const currentTarget = useTabDragStore.getState().dropTargetGroupId;
        if (currentTarget === group.id) {
          setDropTarget(null, null);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      setDropIndex(null);
    };
  }, [isGlobalDragging, group.id, group.tabs, setDropTarget]);

  // Check if we're the drop target
  const isDropTarget =
    isGlobalDragging && useTabDragStore.getState().dropTargetGroupId === group.id;

  if (tabs.length === 0) {
    return (
      <div
        ref={tabsRef}
        className="flex h-9 flex-shrink-0 items-center border-b px-1"
        style={{
          backgroundColor: isDropTarget
            ? "var(--color-bg-tertiary)"
            : "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <span
          className="px-2 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {isDropTarget ? "Drop here" : "No tabs open"}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={tabsRef}
      className="group flex flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1"
      style={{
        backgroundColor: isDropTarget
          ? "var(--color-bg-tertiary)"
          : "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
        minHeight: 36,
      }}
    >
      {tabs.map((tab, index) => {
        const tabKey = getTabKey(tab);
        const isActiveTab = group.activeTabId === tabKey;
        const isDraggedTab =
          isGlobalDragging &&
          draggedTab &&
          draggedTab.type === tab.type &&
          draggedTab.id === tab.id;
        const isDropTargetTab = dropIndex === index && !isDraggedTab;
        const isNote = tab.type === "note";
        const canSplit = groups.length < 5; // Limit to 5 panes

        return (
          <div
            key={tabKey}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(tabKey, el);
              } else {
                tabRefs.current.delete(tabKey);
              }
            }}
            data-tab
            onMouseDown={(e) => handleTabMouseDown(e, tab)}
            onContextMenu={(e) => handleContextMenu(e, tab)}
            className="group/tab flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm transition-colors select-none"
            style={{
              backgroundColor: isActiveTab
                ? "var(--color-bg-primary)"
                : "transparent",
              color: isActiveTab
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              opacity: isDraggedTab ? 0.5 : 1,
              borderLeft: isDropTargetTab
                ? "2px solid var(--color-accent)"
                : "none",
              marginLeft: isDropTargetTab ? -2 : 0,
              maxWidth: 180,
            }}
            onMouseEnter={(e) => {
              if (!isActiveTab && !isGlobalDragging) {
                e.currentTarget.style.backgroundColor =
                  "var(--color-bg-tertiary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActiveTab) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {/* Icon based on type */}
            {isNote ? (
              <FileText size={14} className="flex-shrink-0 opacity-60" />
            ) : (
              <Kanban size={14} className="flex-shrink-0 opacity-60" />
            )}
            <span className="truncate">{tab.title}</span>

            {/* Action buttons (visible on hover, hidden while dragging) */}
            {!isGlobalDragging && (
              <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/tab:opacity-100">
                {/* Split button */}
                {canSplit && (
                  <button
                    onClick={(e) => handleSplit(e, tab)}
                    className="flex h-4 w-4 items-center justify-center rounded hover:bg-[var(--color-bg-hover)]"
                    style={{ color: "var(--color-text-tertiary)" }}
                    title="Split to new pane"
                  >
                    <SplitSquareHorizontal size={12} />
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={(e) => handleClose(e, tab)}
                  onMouseDown={(e) => handleMouseDown(e, tab)}
                  className="flex h-4 w-4 items-center justify-center rounded hover:bg-[var(--color-bg-hover)]"
                  style={{ color: "var(--color-text-tertiary)" }}
                  title="Close tab"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Drop indicator at end */}
      {isDropTarget && dropIndex === tabs.length && (
        <div
          className="h-6 w-0.5 flex-shrink-0"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
      )}
    </div>
  );
}

export default PaneTabs;
