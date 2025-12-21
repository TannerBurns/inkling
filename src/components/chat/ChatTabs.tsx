import { useChatStore } from "../../stores/chatStore";
import { truncateTitle } from "../../lib/chat";

/**
 * Horizontal tabs for switching between active conversations
 */
export function ChatTabs() {
  const {
    conversationPreviews,
    currentConversationId,
    selectConversation,
    closeTab,
    startNewChat,
    openTabIds,
  } = useChatStore();

  // Get conversation previews for open tabs only
  const openTabs = openTabIds
    .map((id) => conversationPreviews.find((p) => p.conversation.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* New Chat button */}
      <button
        onClick={startNewChat}
        className={`flex-shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
          !currentConversationId
            ? "bg-[var(--color-bg-tertiary)]"
            : "hover:bg-[var(--color-bg-hover)]"
        }`}
        style={{
          color: !currentConversationId
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)",
        }}
        title="New Chat"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>

      {/* Conversation tabs */}
      {openTabs.map((preview) => {
        const isActive = currentConversationId === preview.conversation.id;
        const title = preview.conversation.title || "New Chat";

        return (
          <div
            key={preview.conversation.id}
            className={`group flex max-w-[160px] flex-shrink-0 items-center rounded transition-colors ${
              isActive
                ? "bg-[var(--color-bg-tertiary)]"
                : "hover:bg-[var(--color-bg-hover)]"
            }`}
          >
            <button
              onClick={() => selectConversation(preview.conversation.id)}
              className="flex-1 truncate px-2 py-1 text-left text-xs"
              style={{
                color: isActive
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              }}
              title={title}
            >
              {truncateTitle(title, 15)}
            </button>
            {/* Close button - visible on hover or when active */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(preview.conversation.id);
              }}
              className={`mr-1 flex-shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--color-bg-hover)] ${
                isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70"
              }`}
              style={{ color: "var(--color-text-tertiary)" }}
              title="Close tab"
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
        );
      })}
    </div>
  );
}

export default ChatTabs;
