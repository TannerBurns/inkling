import type { Message } from "../../types/chat";
import { MessageBubble } from "./MessageBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolProgress } from "./ToolProgress";
import { useChatStore } from "../../stores/chatStore";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
}

/**
 * List of chat messages with streaming support
 */
export function MessageList({
  messages,
  isStreaming,
  streamingContent,
}: MessageListProps) {
  // Access tool and thinking state from store
  const toolResults = useChatStore((state) => state.toolResults);
  const activeToolCalls = useChatStore((state) => state.activeToolCalls);
  const thinkingContent = useChatStore((state) => state.thinkingContent);
  const inFinalResponsePhase = useChatStore((state) => state.inFinalResponsePhase);
  
  // Show tool progress when:
  // 1. We're actively streaming with tool calls, OR
  // 2. We have streaming content AND completed tool results (transition period before real message arrives)
  const hasToolActivity = activeToolCalls.length > 0 || toolResults.length > 0;
  const showToolProgress = isStreaming || (streamingContent && hasToolActivity);
  
  // Show thinking block when there's thinking content (during streaming or transition)
  const showThinking = thinkingContent.length > 0;
  
  // Thinking is "streaming" when we're streaming and NOT in final response phase
  const isThinkingStreaming = isStreaming && !inFinalResponsePhase;
  
  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.length === 0 && !isStreaming && !streamingContent && !thinkingContent && (
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
            Start a conversation
          </h3>
          <p
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Ask questions about your notes or attach specific notes for context.
          </p>
        </div>
      )}

      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Thinking block - shows AI reasoning in greyed-out, scrolling view */}
      {showThinking && (
        <div className="px-0">
          <ThinkingBlock content={thinkingContent} isStreaming={isThinkingStreaming} />
        </div>
      )}

      {/* Tool progress indicator - show during streaming or transition (until real message arrives) */}
      {showToolProgress && (
        <div className="px-0">
          <ToolProgress isLive />
        </div>
      )}

      {/* Streaming message - show if there's content (even after streaming stops) */}
      {streamingContent && (
        <MessageBubble
          message={{
            id: "streaming",
            conversationId: "",
            role: "assistant",
            content: streamingContent,
            metadata: null,
            createdAt: new Date().toISOString(),
          }}
          isStreaming={isStreaming}
        />
      )}

      {/* Thinking indicator - only show when streaming and no content yet and no thinking content */}
      {isStreaming && !streamingContent && !thinkingContent && (
        <div className="flex items-center gap-2 px-4">
          <div className="flex items-center gap-1">
            <span
              className="h-2 w-2 animate-bounce rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                animationDelay: "0ms",
              }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                animationDelay: "150ms",
              }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                animationDelay: "300ms",
              }}
            />
          </div>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Thinking...
          </span>
        </div>
      )}
    </div>
  );
}

export default MessageList;
