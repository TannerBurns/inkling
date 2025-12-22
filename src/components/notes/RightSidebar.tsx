import { RelatedNotes } from "./RelatedNotes";
import { Backlinks } from "./Backlinks";
import { RecentNotes } from "./RecentNotes";
import { ChatPanel } from "../chat/ChatPanel";
import { useChatStore } from "../../stores/chatStore";
import type { SearchResult } from "../../lib/search";
import type { Backlink } from "../../lib/links";

interface RightSidebarProps {
  // Related notes props
  relatedNotes: SearchResult[];
  relatedNotesLoading: boolean;
  relatedNotesError: string | null;
  // Backlinks props
  backlinks: Backlink[];
  backlinksLoading: boolean;
  backlinksError: string | null;
}

/**
 * Right sidebar with toggle between Notes (Related Notes + Backlinks) and Chat modes
 */
export function RightSidebar({
  relatedNotes,
  relatedNotesLoading,
  relatedNotesError,
  backlinks,
  backlinksLoading,
  backlinksError,
}: RightSidebarProps) {
  const { rightSidebarMode, setRightSidebarMode } = useChatStore();
  const isNotesMode = rightSidebarMode === "notes";
  const isChatMode = rightSidebarMode === "chat";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with toggle */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="flex items-center gap-1 rounded-lg p-1"
          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
        >
          <button
            onClick={() => setRightSidebarMode("notes")}
            className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isNotesMode
                ? "var(--color-bg-primary)"
                : "transparent",
              color: isNotesMode
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              boxShadow: isNotesMode ? "var(--shadow-sm)" : "none",
            }}
        >
            Notes
          </button>
          <button
            onClick={() => setRightSidebarMode("chat")}
            className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isChatMode
                ? "var(--color-bg-primary)"
                : "transparent",
              color: isChatMode
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              boxShadow: isChatMode ? "var(--shadow-sm)" : "none",
            }}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isNotesMode ? (
          <div className="flex h-full flex-col">
            {/* Recent Notes */}
            <RecentNotes />

            {/* Divider */}
            <div
              className="mx-4 border-t"
              style={{ borderColor: "var(--color-border)" }}
            />

            {/* Related Notes (semantic) */}
            <RelatedNotes
              relatedNotes={relatedNotes}
              isLoading={relatedNotesLoading}
              error={relatedNotesError}
            />

            {/* Divider */}
            <div
              className="mx-4 border-t"
              style={{ borderColor: "var(--color-border)" }}
            />

            {/* Backlinks (wiki-style links) */}
            <Backlinks
              backlinks={backlinks}
              isLoading={backlinksLoading}
              error={backlinksError}
            />
          </div>
        ) : (
          <ChatPanel />
        )}
      </div>
    </div>
  );
}

export default RightSidebar;
