import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Calendar } from "lucide-react";
import type { Note } from "../../types/note";

interface GraphNodePreviewProps {
  nodeId: string;
  position: { x: number; y: number };
}

/**
 * Tooltip preview shown when hovering over a graph node
 * Displays note title, snippet, and metadata
 */
export function GraphNodePreview({ nodeId, position }: GraphNodePreviewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchNote() {
      setIsLoading(true);
      try {
        const result = await invoke<Note | null>("get_note", { id: nodeId });
        if (!cancelled) {
          setNote(result);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchNote();

    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Extract plain text snippet from content
  const getSnippet = (content: string | null, maxLength: number = 150) => {
    if (!content) return "No content";
    // Strip markdown/HTML and get first N characters
    const plain = content
      .replace(/<[^>]*>/g, "")
      .replace(/[#*`_~[\]]/g, "")
      .replace(/\n+/g, " ")
      .trim();
    if (plain.length <= maxLength) return plain;
    return plain.slice(0, maxLength) + "...";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div
      className="pointer-events-none fixed z-50 w-72 rounded-lg border p-3 shadow-lg"
      style={{
        left: position.x + 16,
        top: position.y,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--color-accent)" }}
          />
        </div>
      ) : note ? (
        <>
          {/* Title */}
          <div className="mb-2 flex items-center gap-2">
            <FileText
              size={16}
              style={{ color: "var(--color-accent)", flexShrink: 0 }}
            />
            <h4
              className="font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {note.title}
            </h4>
          </div>

          {/* Content snippet */}
          <p
            className="mb-3 text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {getSnippet(note.content)}
          </p>

          {/* Metadata */}
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatDate(note.updatedAt)}
            </span>
          </div>
        </>
      ) : (
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Note not found
        </p>
      )}
    </div>
  );
}

