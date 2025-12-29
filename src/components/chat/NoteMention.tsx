import { useNoteStore } from "../../stores/noteStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface NoteMentionProps {
  noteTitle: string;
  /** If true, the mention is clickable and opens the note */
  clickable?: boolean;
  /** Style variant for different contexts */
  variant?: "input" | "message-user" | "message-assistant";
}

/**
 * A styled badge for note mentions (@noteTitle)
 */
export function NoteMention({ 
  noteTitle, 
  clickable = true,
  variant = "message-user" 
}: NoteMentionProps) {
  const notes = useNoteStore((state) => state.notes);
  const openTab = useEditorGroupStore((state) => state.openTab);
  
  // Try to find the note by title
  const note = notes.find(
    (n) => n.title.toLowerCase() === noteTitle.toLowerCase()
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    if (clickable && note) {
      openTab({ type: "note", id: note.id });
    }
  };

  // Style variations based on context
  const getStyles = () => {
    switch (variant) {
      case "input":
        return {
          backgroundColor: "var(--color-accent-light)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent)",
        };
      case "message-user":
        return {
          backgroundColor: "rgba(255, 255, 255, 0.2)",
          color: "inherit",
          border: "1px solid rgba(255, 255, 255, 0.3)",
        };
      case "message-assistant":
        return {
          backgroundColor: "var(--color-accent-light)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent)",
        };
    }
  };

  const styles = getStyles();

  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        clickable && note ? "cursor-pointer hover:opacity-80" : ""
      }`}
      style={styles}
      title={note ? `Open "${note.title}"` : `Note: ${noteTitle}`}
    >
      <svg
        className="h-3 w-3 flex-shrink-0"
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
      <span className="max-w-[120px] truncate">
        {/* Hidden @ prefix for copy/paste - zero-width but included in clipboard */}
        <span style={{ fontSize: 0, lineHeight: 0 }}>@</span>
        {noteTitle}
      </span>
    </span>
  );
}

/**
 * Parse text content and split into segments of plain text and mentions
 */
export interface TextSegment {
  type: "text" | "mention";
  content: string;
}

/**
 * Parse a string for @mentions and return segments
 * Matches @noteTitle against known note titles (supports titles with spaces)
 */
export function parseMentions(text: string, noteTitles: string[]): TextSegment[] {
  const segments: TextSegment[] = [];
  
  // Sort titles by length (longest first) to match longer titles before shorter ones
  // This prevents "My Project" from matching before "My Project Notes"
  const sortedTitles = [...noteTitles].sort((a, b) => b.length - a.length);
  
  let remaining = text;
  
  while (remaining.length > 0) {
    // Find the next @ symbol
    const atIndex = remaining.indexOf("@");
    
    if (atIndex === -1) {
      // No more @ symbols, add remaining text
      if (remaining.length > 0) {
        segments.push({ type: "text", content: remaining });
      }
      break;
    }
    
    // Add text before the @
    if (atIndex > 0) {
      segments.push({ type: "text", content: remaining.slice(0, atIndex) });
    }
    
    // Check if text after @ matches any known note title
    const afterAt = remaining.slice(atIndex + 1);
    let matched = false;
    
    for (const title of sortedTitles) {
      // Check if the text starts with this title (case-insensitive)
      if (afterAt.toLowerCase().startsWith(title.toLowerCase())) {
        // Make sure it's a complete match (followed by space, end of string, or punctuation)
        const charAfterTitle = afterAt[title.length];
        if (charAfterTitle === undefined || charAfterTitle === " " || charAfterTitle === "\n" || /[.,!?;:]/.test(charAfterTitle)) {
          segments.push({ type: "mention", content: title });
          remaining = afterAt.slice(title.length);
          matched = true;
          break;
        }
      }
    }
    
    if (!matched) {
      // No matching note title, treat @ as regular text
      segments.push({ type: "text", content: "@" });
      remaining = afterAt;
    }
  }
  
  return segments;
}

/**
 * Render text with mentions as badges
 */
export function TextWithMentions({
  content,
  variant = "message-user",
  clickable = true,
}: {
  content: string;
  variant?: "input" | "message-user" | "message-assistant";
  clickable?: boolean;
}) {
  const notes = useNoteStore((state) => state.notes);
  const noteTitles = notes.map((n) => n.title);
  const segments = parseMentions(content, noteTitles);

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "mention" ? (
          <NoteMention
            key={index}
            noteTitle={segment.content}
            variant={variant}
            clickable={clickable}
          />
        ) : (
          <span key={index}>{segment.content}</span>
        )
      )}
    </>
  );
}

export default NoteMention;

