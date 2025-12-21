import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface NoteCitationProps {
  noteId: string;
  noteTitle: string;
  relevance?: number;
}

/**
 * Clickable citation badge that opens a note
 */
export function NoteCitation({
  noteId,
  noteTitle,
  relevance,
}: NoteCitationProps) {
  const openTab = useEditorGroupStore((state) => state.openTab);

  const handleClick = () => {
    openTab({ type: "note", id: noteId });
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:opacity-80"
      style={{
        backgroundColor: "var(--color-accent-light)",
        color: "var(--color-accent)",
      }}
      title={`Open "${noteTitle}" ${relevance ? `(${Math.round(relevance * 100)}% relevant)` : ""}`}
    >
      <svg
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span className="max-w-[120px] truncate">{noteTitle}</span>
    </button>
  );
}

export default NoteCitation;
