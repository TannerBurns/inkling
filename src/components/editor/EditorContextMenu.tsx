import { useEffect, useRef } from "react";
import { FileText, Search, Sparkles } from "lucide-react";

export interface EditorContextMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  selectedAttachment?: {
    src: string;
    filename: string;
    fileType: string;
  };
  onSummarize: () => void;
  onResearch: () => void;
  onClose: () => void;
}

/**
 * Context menu for the editor with AI actions
 * Shows Summarize and Research options for selected text or attachments
 */
export function EditorContextMenu({
  x,
  y,
  hasSelection,
  selectedAttachment,
  onSummarize,
  onResearch,
  onClose,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Determine labels based on context
  const isAttachment = !!selectedAttachment;
  const summarizeLabel = isAttachment ? "Summarize Document" : "Summarize Selection";
  const researchLabel = isAttachment ? "Research Document" : "Research Topic";

  // Only show if we have something to work with
  if (!hasSelection && !selectedAttachment) {
    return null;
  }

  return (
    <>
      {/* Backdrop to close menu when clicking outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[200px] rounded-lg border py-1 shadow-lg"
        style={{
          left: x,
          top: y,
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* AI Actions Header */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <Sparkles size={12} />
          AI Actions
        </div>

        {/* Summarize Button */}
        <button
          onClick={() => {
            onSummarize();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <FileText size={16} style={{ color: "var(--color-accent)" }} />
          <div className="flex flex-col">
            <span>{summarizeLabel}</span>
            <span
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Create a concise summary
            </span>
          </div>
        </button>

        {/* Research Button */}
        <button
          onClick={() => {
            onResearch();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Search size={16} style={{ color: "var(--color-accent)" }} />
          <div className="flex flex-col">
            <span>{researchLabel}</span>
            <span
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Deep research with notes and sources
            </span>
          </div>
        </button>

        {/* Show attachment info if applicable */}
        {selectedAttachment && (
          <>
            <div
              className="my-1 border-t"
              style={{ borderColor: "var(--color-border)" }}
            />
            <div
              className="px-3 py-1.5 text-xs truncate"
              style={{ color: "var(--color-text-tertiary)" }}
              title={selectedAttachment.filename}
            >
              {selectedAttachment.filename}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default EditorContextMenu;
