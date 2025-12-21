import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useNoteStore } from "../../stores/noteStore";
import { createNoteContext } from "../../types/chat";

/**
 * Chat input with @ mention autocomplete
 */
export function ChatInput() {
  const [input, setInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, addContext, isStreaming, isLoading, stopGeneration } = useChatStore();
  const notes = useNoteStore((state) => state.notes);

  // Filter notes based on mention query
  const filteredNotes = mentionQuery
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          note.content?.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : notes;

  const mentionResults = filteredNotes.slice(0, 5);

  // Handle input change
  const handleInputChange = (value: string) => {
    setInput(value);

    // Check for @ mentions
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1) {
      const afterAt = value.slice(atIndex + 1);
      // Only show mentions if @ is at the start or after a space
      const charBeforeAt = atIndex > 0 ? value[atIndex - 1] : " ";
      if (charBeforeAt === " " || charBeforeAt === "\n" || atIndex === 0) {
        // Check if we're still typing the mention (no space after)
        if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
          setMentionQuery(afterAt);
          setShowMentions(true);
          setSelectedMentionIndex(0);
          return;
        }
      }
    }
    setShowMentions(false);
    setMentionQuery("");
  };

  // Handle selecting a mention
  const selectMention = (noteId: string, noteTitle: string) => {
    // Add the note as context
    addContext(createNoteContext(noteId, noteTitle));

    // Remove the @query from input
    const atIndex = input.lastIndexOf("@");
    if (atIndex !== -1) {
      const beforeAt = input.slice(0, atIndex);
      setInput(beforeAt);
    }

    setShowMentions(false);
    setMentionQuery("");
    inputRef.current?.focus();
  };

  // Handle keyboard navigation in mentions
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((i) =>
          i < mentionResults.length - 1 ? i + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((i) =>
          i > 0 ? i - 1 : mentionResults.length - 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = mentionResults[selectedMentionIndex];
        if (selected) {
          selectMention(selected.id, selected.title);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    // Stop generation on Escape when streaming
    if (e.key === "Escape" && isStreaming) {
      e.preventDefault();
      stopGeneration();
      return;
    }

    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming || isLoading) return;

    setInput("");
    await sendMessage(trimmedInput);
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const isDisabled = isStreaming || isLoading;

  return (
    <div
      className="relative flex-shrink-0 border-t p-3"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Mention autocomplete dropdown */}
      {showMentions && mentionResults.length > 0 && (
        <div
          className="absolute bottom-full left-3 right-3 mb-2 max-h-48 overflow-y-auto rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="p-1">
            <div
              className="px-2 py-1 text-xs font-medium"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Add note as context
            </div>
            {mentionResults.map((note, index) => (
              <button
                key={note.id}
                onClick={() => selectMention(note.id, note.title)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
                style={{
                  backgroundColor:
                    index === selectedMentionIndex
                      ? "var(--color-bg-hover)"
                      : "transparent",
                }}
              >
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
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
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {note.title}
                  </div>
                  {note.content && (
                    <div
                      className="truncate text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {note.content.slice(0, 50)}
                      {note.content.length > 50 ? "..." : ""}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className="flex items-end gap-2 rounded-lg border px-3 py-2"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type @ to mention a note..."
          disabled={isDisabled}
          rows={1}
          className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none"
          style={{ color: "var(--color-text-primary)" }}
        />
        {isStreaming ? (
          <button
            onClick={stopGeneration}
            className="flex-shrink-0 rounded-md p-1.5 transition-colors hover:opacity-80"
            style={{
              backgroundColor: "var(--color-error, #ef4444)",
              color: "var(--color-text-inverse)",
            }}
            title="Stop generation"
          >
            <svg
              className="h-4 w-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isDisabled}
            className="flex-shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-50"
            style={{
              backgroundColor: input.trim()
                ? "var(--color-accent)"
                : "transparent",
              color: input.trim()
                ? "var(--color-text-inverse)"
                : "var(--color-text-tertiary)",
            }}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Helper text */}
      <div
        className="mt-1 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {isStreaming 
          ? "Press Esc or click stop to cancel generation" 
          : "Press Enter to send • Shift+Enter for new line • @ to add notes"
        }
      </div>
    </div>
  );
}

export default ChatInput;
