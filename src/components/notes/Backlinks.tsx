import { useState } from "react";
import { Link2, ChevronDown, ChevronRight, FileText, ArrowUpRight } from "lucide-react";
import type { Backlink } from "../../lib/links";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface BacklinksProps {
  backlinks: Backlink[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Backlinks panel showing notes that link to the current note
 * Displays source notes with context snippets
 */
export function Backlinks({ backlinks, isLoading, error }: BacklinksProps) {
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
        <Link2 size={16} style={{ color: "var(--color-success)" }} />
        <span className="text-sm font-medium">Backlinks</span>
        {backlinks.length > 0 && (
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {backlinks.length}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-2 pb-2">
          {isLoading && (
            <div className="space-y-2 px-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg"
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

          {!isLoading && !error && backlinks.length === 0 && (
            <div
              className="flex flex-col items-center gap-2 py-6 text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Link2 size={24} strokeWidth={1.5} />
              <p className="text-sm">No backlinks yet</p>
              <p className="text-xs">
                Notes linking to this one will appear here
              </p>
            </div>
          )}

          {!isLoading && !error && backlinks.length > 0 && (
            <div className="space-y-1">
              {backlinks.map((backlink) => (
                <BacklinkItem
                  key={backlink.sourceNoteId}
                  backlink={backlink}
                  onClick={() => handleSelectNote(backlink.sourceNoteId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface BacklinkItemProps {
  backlink: Backlink;
  onClick: () => void;
}

function BacklinkItem({ backlink, onClick }: BacklinkItemProps) {
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
          {backlink.sourceTitle}
        </span>
        <ArrowUpRight
          size={14}
          className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--color-text-tertiary)" }}
        />
      </div>

      {/* Context */}
      {backlink.context && (
        <p
          className="line-clamp-2 pl-6 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          "{backlink.context}"
        </p>
      )}
    </button>
  );
}

export default Backlinks;
