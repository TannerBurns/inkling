import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../../stores/chatStore";
import { truncateTitle, formatConversationTime } from "../../lib/chat";

/**
 * Dropdown showing chat history (up to 20 conversations)
 */
export function HistoryDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { conversationPreviews, selectConversation, startNewChat, deleteConversation } = useChatStore();

  // Limit to 20 conversations
  const historyItems = useMemo(
    () => conversationPreviews.slice(0, 20),
    [conversationPreviews]
  );

  // Calculate dropdown position when opening
  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    setIsOpen(false);
  };

  const handleNewChat = () => {
    startNewChat();
    setIsOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent selecting the conversation
    deleteConversation(id);
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          isOpen
            ? "bg-[var(--color-bg-tertiary)]"
            : "hover:bg-[var(--color-bg-hover)]"
        }`}
        style={{ color: "var(--color-text-secondary)" }}
        title="Chat history"
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <svg
          className={`h-3 w-3 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[260px] max-w-[320px] max-h-[400px] overflow-y-auto rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
            top: dropdownPosition.top,
            right: dropdownPosition.right,
          }}
        >
          {/* New Chat button */}
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <svg
              className="h-4 w-4"
              style={{ color: "var(--color-accent)" }}
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
            <span style={{ color: "var(--color-text-primary)" }}>
              New Chat
            </span>
          </button>

          {/* History list */}
          {historyItems.length === 0 ? (
            <div
              className="p-4 text-center text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No chat history yet
            </div>
          ) : (
            <div className="py-1">
              {historyItems.map((preview) => (
                <div
                  key={preview.conversation.id}
                  className="group flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)] cursor-pointer"
                  onClick={() => handleSelectConversation(preview.conversation.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectConversation(preview.conversation.id);
                    }
                  }}
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
                        {truncateTitle(preview.conversation.title, 30)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {formatConversationTime(preview.conversation.updatedAt)}
                      </span>
                      {preview.messageCount > 0 && (
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          · {preview.messageCount} messages
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, preview.conversation.id)}
                    className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-bg-active)]"
                    title="Delete conversation"
                  >
                    <svg
                      className="h-3.5 w-3.5"
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
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default HistoryDropdown;

