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
 * Welcome view for new chat showing recent conversations
 */
export function NewChatView() {
  const { conversationPreviews, selectConversation } = useChatStore();

  // Get up to 5 most recent conversations for display
  const recentConversations = useMemo(
    () => conversationPreviews.slice(0, 5),
    [conversationPreviews]
  );

  const groupedConversations = useMemo(
    () => groupByDate(recentConversations),
    [recentConversations]
  );

  const groupOrder = ["Today", "Yesterday", "Last 7 Days", "Older"];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Welcome Header */}
      <div className="text-center py-4">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--color-accent-light)" }}
        >
          <svg
            className="h-6 w-6"
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
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Start a new conversation
        </h3>
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Use @mention to add notes to context
        </p>
      </div>

      {/* Recent Conversations */}
      {recentConversations.length > 0 && (
        <div>
          <h4
            className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Recent Conversations
          </h4>
          <div className="flex flex-col">
            {groupOrder.map((groupName) => {
              const previews = groupedConversations[groupName];
              if (previews.length === 0) return null;

              return (
                <div key={groupName}>
                  {/* Group header (only show if multiple groups have items) */}
                  {recentConversations.length > 3 && (
                    <div
                      className="px-1 py-1.5 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {groupName}
                    </div>
                  )}

                  {/* Conversations */}
                  {previews.map((preview) => (
                    <button
                      key={preview.conversation.id}
                      onClick={() => selectConversation(preview.conversation.id)}
                      className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
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
                          <span
                            className="flex-shrink-0 text-xs"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            {formatConversationTime(preview.conversation.updatedAt)}
                          </span>
                        </div>
                        {preview.firstMessagePreview && (
                          <p
                            className="mt-0.5 truncate text-xs"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {preview.firstMessagePreview}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when no conversations */}
      {recentConversations.length === 0 && (
        <div
          className="text-center text-xs py-4"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          No previous conversations yet
        </div>
      )}
    </div>
  );
}

export default NewChatView;
