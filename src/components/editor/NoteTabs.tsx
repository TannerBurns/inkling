import { useRef, useState, useCallback, useMemo } from "react";
import { X, FileText, Kanban } from "lucide-react";
import { useNoteStore, useOpenNotes } from "../../stores/noteStore";
import { useBoardStore, useOpenBoards } from "../../stores/boardStore";

// Tab type to distinguish between notes and boards
type TabItem = {
  type: "note" | "board";
  id: string;
  title: string;
};

/**
 * Tab bar component for open notes and boards
 * Shows tabs for all open items with close buttons and type icons
 */
export function NoteTabs() {
  const { selectedNoteId, selectNote, closeNote, reorderTabs } = useNoteStore();
  const { selectedBoardId, selectBoard, closeBoard } = useBoardStore();
  const openNotes = useOpenNotes();
  const openBoards = useOpenBoards();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Combine notes and boards into a single tab list
  const tabs: TabItem[] = useMemo(() => {
    const noteTabs: TabItem[] = openNotes.map((note) => ({
      type: "note" as const,
      id: note.id,
      title: note.title || "Untitled",
    }));
    const boardTabs: TabItem[] = openBoards.map((board) => ({
      type: "board" as const,
      id: board.id,
      title: board.name,
    }));
    return [...noteTabs, ...boardTabs];
  }, [openNotes, openBoards]);

  // Determine which tab is currently active
  const activeTabId = selectedBoardId || selectedNoteId;

  // Handle tab click
  const handleTabClick = useCallback(
    (tab: TabItem) => {
      if (tab.type === "note") {
        selectBoard(null); // Deselect board
        selectNote(tab.id);
      } else {
        selectNote(null); // Deselect note
        selectBoard(tab.id);
      }
    },
    [selectNote, selectBoard]
  );

  // Handle close button click
  const handleClose = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      e.stopPropagation();
      if (tab.type === "note") {
        closeNote(tab.id);
      } else {
        closeBoard(tab.id);
      }
    },
    [closeNote, closeBoard]
  );

  // Handle middle-click to close
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tab: TabItem) => {
      if (e.button === 1) {
        e.preventDefault();
        if (tab.type === "note") {
          closeNote(tab.id);
        } else {
          closeBoard(tab.id);
        }
      }
    },
    [closeNote, closeBoard]
  );

  // Drag and drop handlers (only for note tabs currently)
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, tab: TabItem) => {
      if (tab.type === "note") {
        e.dataTransfer.effectAllowed = "move";
        setDraggedIndex(index);
      }
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number, tab: TabItem) => {
      if (tab.type === "note") {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropIndex(index);
      }
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (
      draggedIndex !== null &&
      dropIndex !== null &&
      draggedIndex !== dropIndex
    ) {
      // Only reorder if both are within note tabs range
      if (draggedIndex < openNotes.length && dropIndex < openNotes.length) {
        reorderTabs(draggedIndex, dropIndex);
      }
    }
    setDraggedIndex(null);
    setDropIndex(null);
  }, [draggedIndex, dropIndex, reorderTabs, openNotes.length]);

  const handleDragLeave = useCallback(() => {
    setDropIndex(null);
  }, []);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      ref={tabsRef}
      className="flex flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
        minHeight: 36,
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isDragging = draggedIndex === index;
        const isDropTarget =
          dropIndex === index && draggedIndex !== index && tab.type === "note";
        const isNote = tab.type === "note";

        return (
          <div
            key={`${tab.type}-${tab.id}`}
            draggable={isNote}
            onClick={() => handleTabClick(tab)}
            onMouseDown={(e) => handleMouseDown(e, tab)}
            onDragStart={(e) => handleDragStart(e, index, tab)}
            onDragOver={(e) => handleDragOver(e, index, tab)}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
            className="group flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm transition-colors"
            style={{
              backgroundColor: isActive
                ? "var(--color-bg-primary)"
                : "transparent",
              color: isActive
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              opacity: isDragging ? 0.5 : 1,
              borderLeft: isDropTarget
                ? "2px solid var(--color-accent)"
                : "none",
              marginLeft: isDropTarget ? -2 : 0,
              maxWidth: 180,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor =
                  "var(--color-bg-tertiary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
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
            <button
              onClick={(e) => handleClose(e, tab)}
              className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                color: "var(--color-text-tertiary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--color-text-tertiary)";
              }}
              title="Close tab"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default NoteTabs;
