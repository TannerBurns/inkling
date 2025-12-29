import { useChatStore } from "../../stores/chatStore";

/**
 * Panel showing attached context (notes and folders) for the current message
 */
export function ContextPanel() {
  const { attachedContext, attachedFolders, removeContext, removeFolderContext, clearContext } = useChatStore();

  const totalCount = attachedContext.length + attachedFolders.length;
  
  if (totalCount === 0) return null;

  return (
    <div
      className="flex-shrink-0 border-b px-3 py-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-tertiary)",
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Context ({totalCount})
        </span>
        <button
          onClick={clearContext}
          className="text-xs transition-colors hover:underline"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {/* Render folder badges first */}
        {attachedFolders.map((folder) => (
          <div
            key={`folder-${folder.folderId}`}
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              backgroundColor: "var(--color-warning-light, #fef3c7)",
              color: "var(--color-warning, #d97706)",
            }}
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span className="max-w-[100px] truncate text-xs">
              {folder.folderName}
            </span>
            <span className="text-xs opacity-70">
              ({folder.noteCount})
            </span>
            <button
              onClick={() => removeFolderContext(folder.folderId)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
        {/* Render note badges */}
        {attachedContext.map((item) => (
          <div
            key={`note-${item.noteId}`}
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              backgroundColor: "var(--color-accent-light)",
              color: "var(--color-accent)",
            }}
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
            <span className="max-w-[100px] truncate text-xs">
              {item.noteTitle}
            </span>
            {!item.isFullNote && (
              <span
                className="text-xs opacity-70"
                title="Partial selection"
              >
                (snippet)
              </span>
            )}
            <button
              onClick={() => removeContext(item.noteId)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ContextPanel;
