import { useMemo } from "react";
import { useChatStore } from "../../stores/chatStore";
import { formatConversationTime, truncateTitle } from "../../lib/chat";
import type { ConversationPreview } from "../../types/chat";

/**
 * Group conversations by date
 */
function groupByDate(previews: ConversationPreview[]): Record<string, ConversationPreview[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: Record<string, ConversationPreview[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    Older: [],
  };

  for (const preview of previews) {
    const date = new Date(preview.conversation.updatedAt);
    if (date >= today) {
      groups.Today.push(preview);
    } else if (date >= yesterday) {
      groups.Yesterday.push(preview);
    } else if (date >= lastWeek) {
      groups["Last 7 Days"].push(preview);
    } else {
      groups.Older.push(preview);
    }
  }

  return groups;
}

/**
 * List of past conversations with date grouping
 */
export function ConversationList() {
  const { conversationPreviews, selectConversation, deleteConversation, isLoading } =
    useChatStore();

  const groupedConversations = useMemo(
    () => groupByDate(conversationPreviews),
    [conversationPreviews]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--color-accent)" }}
        />
      </div>
    );
  }

  if (conversationPreviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div
          className="mb-4 rounded-full p-4"
          style={{ backgroundColor: "var(--color-accent-light)" }}
        >
          <svg
            className="h-8 w-8"
            style={{ color: "var(--color-accent)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          No conversations yet
        </h3>
        <p
          className="max-w-[200px] text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Start a new conversation by typing a message below.
        </p>
      </div>
    );
  }

  const groupOrder = ["Today", "Yesterday", "Last 7 Days", "Older"];

  return (
    <div className="flex flex-col">
      {groupOrder.map((groupName) => {
        const previews = groupedConversations[groupName];
        if (previews.length === 0) return null;

        return (
          <div key={groupName}>
            {/* Group Header */}
            <div
              className="sticky top-0 z-10 px-4 py-2 text-xs font-medium"
              style={{
                color: "var(--color-text-tertiary)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              {groupName}
            </div>

            {/* Conversations in group */}
            {previews.map((preview) => (
              <button
                key={preview.conversation.id}
                onClick={() => selectConversation(preview.conversation.id)}
                className="group flex items-start gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="truncate text-sm"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {truncateTitle(preview.conversation.title)}
                    </span>
                    {/* Message count badge */}
                    {preview.messageCount > 0 && (
                      <span
                        className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: "var(--color-bg-tertiary)",
                          color: "var(--color-text-tertiary)",
                        }}
                      >
                        {preview.messageCount}
                      </span>
                    )}
                  </div>
                  {/* First message preview */}
                  {preview.firstMessagePreview && (
                    <div
                      className="mt-0.5 truncate text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {preview.firstMessagePreview}
                    </div>
                  )}
                  <div
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {formatConversationTime(preview.conversation.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(preview.conversation.id);
                  }}
                  className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-bg-active)]"
                  title="Delete conversation"
                >
                  <svg
                    className="h-4 w-4"
                    style={{ color: "var(--color-text-tertiary)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default ConversationList;
