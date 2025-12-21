import { FileText } from "lucide-react";
import type { TabItem } from "../../stores/editorGroupStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";
import { useNoteStore } from "../../stores/noteStore";
import { NoteEditorContent } from "./NoteEditorContent";
import { BoardView } from "../board/BoardView";
import { GraphView } from "../graph/GraphView";
import { CalendarView } from "../calendar/CalendarView";

interface PaneContentProps {
  groupId: string;
  activeTab: TabItem | null;
}

/**
 * Renders the content for an editor pane based on the active tab.
 * Shows note editor for notes, board view for boards.
 */
export function PaneContent({ groupId, activeTab }: PaneContentProps) {
  const createNote = useNoteStore((state) => state.createNote);
  const openTab = useEditorGroupStore((state) => state.openTab);

  // Handle creating a new note from the empty state
  const handleCreateNote = async () => {
    const note = await createNote("Untitled", null);
    openTab({ type: "note", id: note.id }, groupId);
  };

  // Empty state when no tab is active
  if (!activeTab) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <FileText size={64} strokeWidth={1} />
        <div className="text-center">
          <p className="text-lg font-medium">No tab selected</p>
          <p className="mt-1 text-sm">
            Select a note from the sidebar or create a new one
          </p>
        </div>
        <button
          onClick={handleCreateNote}
          className="mt-2 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-text-inverse)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--color-accent-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-accent)")
          }
        >
          Create New Note
        </button>
      </div>
    );
  }

  // Render based on tab type
  if (activeTab.type === "note") {
    return <NoteEditorContent noteId={activeTab.id} />;
  }

  if (activeTab.type === "board") {
    return <BoardView boardId={activeTab.id} />;
  }

  if (activeTab.type === "graph") {
    return <GraphView />;
  }

  if (activeTab.type === "calendar") {
    return <CalendarView />;
  }

  return null;
}

export default PaneContent;
