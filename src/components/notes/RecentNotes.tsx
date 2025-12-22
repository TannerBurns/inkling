import { Clock, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useState, useMemo } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useFolderStore } from "../../stores/folderStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

/**
 * Format relative time for display
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Get a text preview from note content (strip markdown/HTML)
 */
function getContentPreview(content: string | null, maxLength = 60): string {
  if (!content) return "";
  const stripped = content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  
  if (stripped.length <= maxLength) return stripped;
  return stripped.slice(0, maxLength).trim() + "…";
}

/**
 * Recent Notes panel showing recently modified notes
 */
export function RecentNotes() {
  const [isExpanded, setIsExpanded] = useState(true);
  const { notes } = useNoteStore();
  const { folders } = useFolderStore();
  const { openTab } = useEditorGroupStore();

  // Get the Daily Notes folder to exclude daily notes
  const dailyNotesFolder = useMemo(
    () => folders.find((f) => f.name === "Daily Notes" && f.parentId === null),
    [folders]
  );

  // Get recent notes sorted by updatedAt, excluding daily notes
  const recentNotes = useMemo(() => {
    return notes
      .filter((n) => !n.isDeleted && n.folderId !== dailyNotesFolder?.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [notes, dailyNotesFolder?.id]);

  const handleSelectNote = (noteId: string) => {
    openTab({ type: "note", id: noteId });
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex cursor-pointer items-center gap-2 px-4 py-3 text-left transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Clock size={16} style={{ color: "var(--color-warning)" }} />
        <span className="text-sm font-medium">Recent Notes</span>
        {recentNotes.length > 0 && (
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {recentNotes.length}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-2 pb-2">
          {recentNotes.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 py-6 text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <FileText size={24} strokeWidth={1.5} />
              <p className="text-sm">No recent notes</p>
              <p className="text-xs">
                Your recently edited notes will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note.id)}
                  className="group flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors"
                  style={{ backgroundColor: "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  {/* Title and time */}
                  <div className="flex items-center gap-2">
                    <FileText
                      size={14}
                      className="flex-shrink-0"
                      style={{ color: "var(--color-text-tertiary)" }}
                    />
                    <span
                      className="flex-1 truncate text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {note.title || "Untitled"}
                    </span>
                    <span
                      className="flex-shrink-0 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {formatRelativeTime(note.updatedAt)}
                    </span>
                  </div>

                  {/* Preview */}
                  {note.content && (
                    <p
                      className="line-clamp-1 pl-6 text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {getContentPreview(note.content)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecentNotes;

