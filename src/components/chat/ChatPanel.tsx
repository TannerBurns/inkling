import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useChatStore, useCurrentConversation } from "../../stores/chatStore";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ContextPanel } from "./ContextPanel";
import { ChatTabs } from "./ChatTabs";
import { ModelSelector } from "./ModelSelector";
import { HistoryDropdown } from "./HistoryDropdown";
import { NewChatView } from "./NewChatView";

/**
 * Main chat panel component
 */
export function ChatPanel() {
  const {
    messages,
    isStreaming,
    streamingContent,
    attachedContext,
    attachedFolders,
    fetchConversations,
    openTabIds,
    error,
    clearError,
  } = useChatStore();
  
  const currentConversation = useCurrentConversation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track if we should stick to bottom (true = auto-scroll, false = user scrolled up)
  const shouldStickToBottom = useRef(true);
  // Track the previous message count to detect new messages
  const prevMessageCount = useRef(messages.length);
  // Flag to ignore scroll events caused by programmatic scrolling
  const isProgrammaticScroll = useRef(false);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((smooth = false) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Mark this as a programmatic scroll so handleScroll ignores it
    isProgrammaticScroll.current = true;
    
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    
    // Reset the flag after a short delay to allow the scroll event to fire
    requestAnimationFrame(() => {
      isProgrammaticScroll.current = false;
    });
  }, []);

  // Check if user is at/near the bottom
  const isAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    
    const threshold = 50; // pixels from bottom
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, []);

  // Handle scroll - update sticky state based on user scroll position
  const handleScroll = useCallback(() => {
    // Ignore scroll events caused by our programmatic scrolling
    if (isProgrammaticScroll.current) return;
    
    // User manually scrolled - update sticky state based on position
    shouldStickToBottom.current = isAtBottom();
  }, [isAtBottom]);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // When new messages arrive (user sends message), always scroll to bottom
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      shouldStickToBottom.current = true;
      scrollToBottom(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // During streaming, scroll to bottom only if we should stick
  // Use useLayoutEffect for synchronous updates before paint
  useLayoutEffect(() => {
    if (isStreaming && streamingContent && shouldStickToBottom.current) {
      // Use instant scroll during streaming to avoid animation conflicts
      scrollToBottom(false);
    }
  }, [streamingContent, isStreaming, scrollToBottom]);

  // When streaming starts, check if we should stick to bottom
  useEffect(() => {
    if (isStreaming) {
      shouldStickToBottom.current = isAtBottom();
    }
  }, [isStreaming, isAtBottom]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with History Dropdown and Model Selector */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {currentConversation?.title || "Inkling Chat"}
        </h2>
        <div className="flex items-center gap-1">
          <HistoryDropdown />
          <ModelSelector />
        </div>
      </div>

      {/* Chat Tabs (show when there are open tabs) */}
      {openTabIds.length > 0 && <ChatTabs />}

      {/* Error Banner */}
      {error && (
        <div
          className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--color-error-bg, #fef2f2)",
            borderColor: "var(--color-error-border, #fecaca)",
            color: "var(--color-error-text, #dc2626)",
          }}
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="line-clamp-2">{error}</span>
          </div>
          <button
            onClick={clearError}
            className="flex-shrink-0 rounded p-1 transition-colors hover:opacity-70"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Context Panel (shown when context is attached - notes or folders) */}
      {(attachedContext.length > 0 || attachedFolders.length > 0) && <ContextPanel />}

      {/* Messages or New Chat View */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {messages.length === 0 && !currentConversation ? (
          <NewChatView />
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
          />
        )}
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}

export default ChatPanel;
