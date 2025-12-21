import { Sparkles, ChevronDown, ChevronRight, FileText, Link2 } from "lucide-react";
import { useState } from "react";
import type { SearchResult } from "../../lib/search";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface RelatedNotesProps {
  relatedNotes: SearchResult[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Related Notes panel showing semantically similar notes
 * Displays notes based on embedding similarity with the current note
 */
export function RelatedNotes({ relatedNotes, isLoading, error }: RelatedNotesProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { openTab } = useEditorGroupStore();

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
        <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium">Related Notes</span>
        {relatedNotes.length > 0 && (
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {relatedNotes.length}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-2 pb-2">
          {isLoading && (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg"
                  style={{ backgroundColor: "var(--color-bg-hover)" }}
                />
              ))}
            </div>
          )}

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--color-error-light)",
                color: "var(--color-error)",
              }}
            >
              {error}
            </div>
          )}

          {!isLoading && !error && relatedNotes.length === 0 && (
            <div
              className="flex flex-col items-center gap-2 py-6 text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Link2 size={24} strokeWidth={1.5} />
              <p className="text-sm">No related notes found</p>
              <p className="text-xs">
                Similar notes will appear here based on content
              </p>
            </div>
          )}

          {!isLoading && !error && relatedNotes.length > 0 && (
            <div className="space-y-1">
              {relatedNotes.map((note) => (
                <RelatedNoteItem
                  key={note.noteId}
                  note={note}
                  onClick={() => handleSelectNote(note.noteId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RelatedNoteItemProps {
  note: SearchResult;
  onClick: () => void;
}

function RelatedNoteItem({ note, onClick }: RelatedNoteItemProps) {
  const scorePercent = Math.round(note.score * 100);

  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors"
      style={{ backgroundColor: "transparent" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {/* Title */}
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
          {note.title}
        </span>
      </div>

      {/* Snippet */}
      {note.snippet && (
        <p
          className="line-clamp-2 pl-6 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {note.snippet}
        </p>
      )}

      {/* Score */}
      <div className="flex items-center gap-2 pl-6">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--color-bg-hover)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${scorePercent}%`,
              backgroundColor: "var(--color-accent)",
            }}
          />
        </div>
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {scorePercent}%
        </span>
      </div>
    </button>
  );
}

export default RelatedNotes;
