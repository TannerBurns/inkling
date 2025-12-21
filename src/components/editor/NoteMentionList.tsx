import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef,
} from "react";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { FileText, Folder, Search } from "lucide-react";
import { searchNotesForMention, type NoteSummary } from "../../lib/links";

export interface NoteMentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface NoteMentionListProps extends SuggestionProps {
  // The query comes from SuggestionProps
}

/**
 * Autocomplete dropdown for wiki-style [[note]] links
 * Shows matching notes as user types
 */
export const NoteMentionList = forwardRef<NoteMentionListRef, NoteMentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [notes, setNotes] = useState<NoteSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Get current note ID from editor state if available
    const currentNoteId = useRef<string | undefined>(undefined);

    // Search for notes when query changes
    useEffect(() => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const results = await searchNotesForMention(
            props.query || "",
            currentNoteId.current,
            10
          );
          setNotes(results);
          setSelectedIndex(0);
        } catch (err) {
          console.error("Failed to search notes:", err);
          setNotes([]);
        } finally {
          setIsLoading(false);
        }
      }, 150);

      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
      };
    }, [props.query]);

    const selectItem = (index: number) => {
      const note = notes[index];
      if (note) {
        props.command({ id: note.id, label: note.title });
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + notes.length - 1) % notes.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % notes.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    return (
      <div
        className="overflow-hidden rounded-lg border shadow-lg"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
          minWidth: "240px",
          maxWidth: "320px",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-secondary)",
          }}
        >
          <Search size={14} style={{ color: "var(--color-text-tertiary)" }} />
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Link to note
          </span>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto p-1">
          {isLoading && (
            <div
              className="flex items-center justify-center py-4"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--color-accent)" }}
              />
            </div>
          )}

          {!isLoading && notes.length === 0 && (
            <div
              className="py-4 text-center text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {props.query ? "No matching notes" : "Start typing to search"}
            </div>
          )}

          {!isLoading &&
            notes.map((note, index) => (
              <button
                key={note.id}
                onClick={() => selectItem(index)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left"
                style={{
                  backgroundColor:
                    index === selectedIndex
                      ? "var(--color-bg-hover)"
                      : "transparent",
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <FileText
                  size={16}
                  className="flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {note.title}
                  </div>
                  {note.folderId && (
                    <div
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      <Folder size={10} />
                      <span className="truncate">In folder</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center justify-between border-t px-3 py-1.5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-secondary)",
          }}
        >
          <span
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            ↑↓ navigate
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            ↵ select
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            esc close
          </span>
        </div>
      </div>
    );
  }
);

NoteMentionList.displayName = "NoteMentionList";

export default NoteMentionList;
