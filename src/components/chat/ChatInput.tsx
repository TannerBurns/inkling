import { useState, useRef, KeyboardEvent, useCallback, useMemo, useEffect } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useNoteStore } from "../../stores/noteStore";
import { useFolderStore } from "../../stores/folderStore";
import { createNoteContext, createFolderContext } from "../../types/chat";
import { parseMentions } from "./NoteMention";

/**
 * Chat input with @ mention autocomplete and inline badges
 */
export function ChatInput() {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionStartOffset, setMentionStartOffset] = useState<number | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const { 
    sendMessage, 
    addContext, 
    addFolderContext, 
    removeContext,
    removeFolderContext,
    attachedContext,
    attachedFolders,
    pendingBadges, 
    clearPendingBadges, 
    isStreaming, 
    isLoading, 
    stopGeneration 
  } = useChatStore();
  const notes = useNoteStore((state) => state.notes);
  const folders = useFolderStore((state) => state.folders);

  // Create mention result type
  type MentionResult = 
    | { type: "folder"; id: string; name: string; noteCount: number }
    | { type: "note"; id: string; title: string; content?: string | null };

  // Filter and combine folders and notes based on mention query
  const mentionResults: MentionResult[] = useMemo(() => {
    const results: MentionResult[] = [];
    const queryLower = mentionQuery.toLowerCase();
    
    // Filter folders
    const filteredFolders = mentionQuery
      ? folders.filter((folder) =>
          folder.name.toLowerCase().includes(queryLower)
        )
      : folders;
    
    // Count notes per folder for display
    for (const folder of filteredFolders.slice(0, 3)) {
      const noteCount = notes.filter((n) => n.folderId === folder.id && !n.isDeleted).length;
      // Only show folders with notes
      if (noteCount > 0) {
        results.push({
          type: "folder",
          id: folder.id,
          name: folder.name,
          noteCount,
        });
      }
    }
    
    // Filter notes
    const filteredNotes = mentionQuery
      ? notes.filter(
          (note) =>
            !note.isDeleted &&
            (note.title.toLowerCase().includes(queryLower) ||
            note.content?.toLowerCase().includes(queryLower))
        )
      : notes.filter((n) => !n.isDeleted);
    
    for (const note of filteredNotes.slice(0, 5 - results.length)) {
      results.push({
        type: "note",
        id: note.id,
        title: note.title,
        content: note.content,
      });
    }
    
    return results;
  }, [mentionQuery, notes, folders]);

  // Get plain text content from the contenteditable (with @mentions preserved)
  const getTextContent = useCallback((): string => {
    if (!inputRef.current) return "";
    
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.classList.contains("mention-badge")) {
          // Convert badge back to @mention text
          const mentionTitle = el.getAttribute("data-mention");
          if (mentionTitle) {
            text += `@${mentionTitle}`;
          }
        } else if (el.tagName === "BR") {
          text += "\n";
        } else {
          for (const child of el.childNodes) {
            walk(child);
          }
        }
      }
    };
    
    for (const child of inputRef.current.childNodes) {
      walk(child);
    }
    
    return text;
  }, []);

  // Get all badge names currently in the input
  const getBadgesInInput = useCallback((): { notes: Set<string>; folders: Set<string> } => {
    const noteNames = new Set<string>();
    const folderNames = new Set<string>();
    
    if (!inputRef.current) return { notes: noteNames, folders: folderNames };
    
    const badges = inputRef.current.querySelectorAll(".mention-badge");
    badges.forEach((badge) => {
      const name = badge.getAttribute("data-mention");
      const type = badge.getAttribute("data-mention-type");
      if (name) {
        if (type === "folder") {
          folderNames.add(name);
        } else {
          noteNames.add(name);
        }
      }
    });
    
    return { notes: noteNames, folders: folderNames };
  }, []);

  // Sync context with badges in input (remove context items without badges)
  const syncContextWithBadges = useCallback(() => {
    const { notes: noteBadges, folders: folderBadges } = getBadgesInInput();
    
    // Remove notes that no longer have badges
    for (const item of attachedContext) {
      if (!noteBadges.has(item.noteTitle)) {
        removeContext(item.noteId);
      }
    }
    
    // Remove folders that no longer have badges
    for (const folder of attachedFolders) {
      if (!folderBadges.has(folder.folderName)) {
        removeFolderContext(folder.folderId);
      }
    }
  }, [getBadgesInInput, attachedContext, attachedFolders, removeContext, removeFolderContext]);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!inputRef.current) return;
    
    // Sync context with badges (remove context items if their badges were deleted)
    syncContextWithBadges();
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setShowMentions(false);
      return;
    }

    // Find if we're currently typing a mention
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    
    // Only process if we're in a text node
    if (container.nodeType !== Node.TEXT_NODE) {
      setShowMentions(false);
      setMentionQuery("");
      return;
    }

    const textContent = container.textContent || "";
    const cursorPos = range.startOffset;
    
    // Look backwards from cursor to find @
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (textContent[i] === "@") {
        // Check if @ is at start or after whitespace
        if (i === 0 || /\s/.test(textContent[i - 1])) {
          atIndex = i;
        }
        break;
      } else if (/\s/.test(textContent[i])) {
        // Hit whitespace before finding @
        break;
      }
    }

    if (atIndex !== -1) {
      const query = textContent.slice(atIndex + 1, cursorPos);
      setMentionQuery(query);
      setMentionStartOffset(atIndex);
      setShowMentions(true);
      setSelectedMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery("");
      setMentionStartOffset(null);
    }
  }, [syncContextWithBadges]);

  // Insert mention badge at current position (for both notes and folders)
  const insertMentionBadge = useCallback((
    type: "note" | "folder",
    id: string,
    displayName: string,
    noteCount?: number
  ) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !inputRef.current) return;

    // Add to appropriate context
    if (type === "folder") {
      addFolderContext(createFolderContext(id, displayName, noteCount || 0));
    } else {
      addContext(createNoteContext(id, displayName));
    }

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    
    if (container.nodeType === Node.TEXT_NODE && mentionStartOffset !== null) {
      const textNode = container as Text;
      const textContent = textNode.textContent || "";
      const cursorPos = range.startOffset;
      
      // Split the text node
      const beforeMention = textContent.slice(0, mentionStartOffset);
      const afterMention = textContent.slice(cursorPos);
      
      // Create the badge element (different icon for folders)
      const badge = document.createElement("span");
      badge.contentEditable = "false";
      badge.className = "mention-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 mx-0.5 text-xs font-medium align-baseline";
      badge.style.backgroundColor = type === "folder" ? "var(--color-warning-light, #fef3c7)" : "var(--color-accent-light)";
      badge.style.color = type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)";
      badge.style.border = `1px solid ${type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)"}`;
      badge.setAttribute("data-mention", displayName);
      badge.setAttribute("data-mention-type", type);
      
      const icon = type === "folder"
        ? `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>`
        : `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>`;
      
      const countBadge = type === "folder" && noteCount 
        ? `<span class="opacity-70">(${noteCount})</span>` 
        : "";
      
      badge.innerHTML = `
        ${icon}
        <span class="max-w-[150px] truncate">${displayName}</span>
        ${countBadge}
      `;

      // Create text nodes for before and after
      const beforeNode = document.createTextNode(beforeMention);
      const afterNode = document.createTextNode(" " + afterMention);
      
      // Replace the current text node with the new structure
      const parent = textNode.parentNode;
      if (parent) {
        parent.insertBefore(beforeNode, textNode);
        parent.insertBefore(badge, textNode);
        parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);
        
        // Move cursor after the badge
        const newRange = document.createRange();
        newRange.setStart(afterNode, 1); // After the space
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }

    setShowMentions(false);
    setMentionQuery("");
    setMentionStartOffset(null);
    inputRef.current?.focus();
  }, [addContext, addFolderContext, mentionStartOffset]);

  // Append a badge to the end of input (for programmatic insertion from right-click)
  const appendBadge = useCallback((
    type: "note" | "folder",
    displayName: string,
    noteCount?: number
  ) => {
    if (!inputRef.current) return;

    // Create the badge element
    const badge = document.createElement("span");
    badge.contentEditable = "false";
    badge.className = "mention-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 mx-0.5 text-xs font-medium align-baseline";
    badge.style.backgroundColor = type === "folder" ? "var(--color-warning-light, #fef3c7)" : "var(--color-accent-light)";
    badge.style.color = type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)";
    badge.style.border = `1px solid ${type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)"}`;
    badge.setAttribute("data-mention", displayName);
    badge.setAttribute("data-mention-type", type);
    
    const icon = type === "folder"
      ? `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>`
      : `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>`;
    
    const countBadge = type === "folder" && noteCount 
      ? `<span class="opacity-70">(${noteCount})</span>` 
      : "";
    
    badge.innerHTML = `
      ${icon}
      <span class="max-w-[150px] truncate">${displayName}</span>
      ${countBadge}
    `;

    // Append badge to the end of the input
    inputRef.current.appendChild(badge);
    
    // Add a space after the badge and set cursor there
    const spaceNode = document.createTextNode(" ");
    inputRef.current.appendChild(spaceNode);
    
    // Move cursor to the end
    const selection = window.getSelection();
    if (selection) {
      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
    
    inputRef.current.focus();
  }, []);

  // Handle pending badges from right-click context menu
  useEffect(() => {
    if (pendingBadges.length > 0) {
      for (const badge of pendingBadges) {
        appendBadge(badge.type, badge.name, badge.noteCount);
      }
      clearPendingBadges();
    }
  }, [pendingBadges, appendBadge, clearPendingBadges]);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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
          if (selected.type === "folder") {
            insertMentionBadge("folder", selected.id, selected.name, selected.noteCount);
          } else {
            insertMentionBadge("note", selected.id, selected.title);
          }
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
    const text = getTextContent().trim();
    if (!text || isStreaming || isLoading) return;

    // Clear the input
    if (inputRef.current) {
      inputRef.current.innerHTML = "";
    }
    
    await sendMessage(text);
  };

  // Create a badge element for a mention
  const createBadgeElement = useCallback((
    type: "note" | "folder",
    displayName: string,
    noteCount?: number
  ): HTMLSpanElement => {
    const badge = document.createElement("span");
    badge.contentEditable = "false";
    badge.className = "mention-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 mx-0.5 text-xs font-medium align-baseline";
    badge.style.backgroundColor = type === "folder" ? "var(--color-warning-light, #fef3c7)" : "var(--color-accent-light)";
    badge.style.color = type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)";
    badge.style.border = `1px solid ${type === "folder" ? "var(--color-warning, #d97706)" : "var(--color-accent)"}`;
    badge.setAttribute("data-mention", displayName);
    badge.setAttribute("data-mention-type", type);
    
    const icon = type === "folder"
      ? `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>`
      : `<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>`;
    
    const countBadge = type === "folder" && noteCount 
      ? `<span class="opacity-70">(${noteCount})</span>` 
      : "";
    
    badge.innerHTML = `
      ${icon}
      <span class="max-w-[150px] truncate">${displayName}</span>
      ${countBadge}
    `;
    
    return badge;
  }, []);

  // Handle paste - detect and convert @mentions to badges
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    
    if (!inputRef.current) {
      document.execCommand("insertText", false, text);
      return;
    }
    
    // Get note titles for mention detection
    const noteTitles = notes.map((n) => n.title);
    const segments = parseMentions(text, noteTitles);
    
    // If no mentions found, just insert plain text
    if (!segments.some(s => s.type === "mention")) {
      document.execCommand("insertText", false, text);
      return;
    }
    
    // Insert segments with mention badges
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      document.execCommand("insertText", false, text);
      return;
    }
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    // Create a document fragment to hold all the content
    const fragment = document.createDocumentFragment();
    
    for (const segment of segments) {
      if (segment.type === "mention") {
        // Find the note and add to context
        const note = notes.find(n => n.title.toLowerCase() === segment.content.toLowerCase());
        if (note) {
          addContext(createNoteContext(note.id, note.title));
          const badge = createBadgeElement("note", note.title);
          fragment.appendChild(badge);
        } else {
          // Note not found, just insert as text with @
          fragment.appendChild(document.createTextNode(`@${segment.content}`));
        }
      } else {
        fragment.appendChild(document.createTextNode(segment.content));
      }
    }
    
    range.insertNode(fragment);
    
    // Move cursor to end of inserted content
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Trigger input handler to sync state
    handleInput();
  }, [notes, addContext, createBadgeElement, handleInput]);

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
              Add folder or note as context
            </div>
            {mentionResults.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => {
                  if (result.type === "folder") {
                    insertMentionBadge("folder", result.id, result.name, result.noteCount);
                  } else {
                    insertMentionBadge("note", result.id, result.title);
                  }
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
                style={{
                  backgroundColor:
                    index === selectedMentionIndex
                      ? "var(--color-bg-hover)"
                      : "transparent",
                }}
              >
                {result.type === "folder" ? (
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--color-warning, #d97706)" }}
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
                ) : (
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
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="flex items-center gap-2 truncate text-sm"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {result.type === "folder" ? result.name : result.title}
                    {result.type === "folder" && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        ({result.noteCount} note{result.noteCount !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                  {result.type === "note" && result.content && (
                    <div
                      className="truncate text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {result.content.slice(0, 50)}
                      {result.content.length > 50 ? "..." : ""}
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
        <div
          ref={inputRef}
          contentEditable={!isDisabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          data-placeholder="Type @ to mention a note..."
          className="max-h-36 min-h-[24px] flex-1 overflow-y-auto bg-transparent text-sm outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-text-tertiary)]"
          style={{ 
            color: "var(--color-text-primary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          role="textbox"
          aria-multiline="true"
          suppressContentEditableWarning
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
            disabled={isDisabled}
            className="flex-shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
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
          : "Press Enter to send • Shift+Enter for new line • @ to add notes or folders"
        }
      </div>
    </div>
  );
}

export default ChatInput;
