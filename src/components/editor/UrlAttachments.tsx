import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Plus,
  ExternalLink,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  useUrlAttachmentStore,
  useNoteUrlAttachments,
  useIsUrlIndexing,
} from "../../stores/urlAttachmentStore";
import {
  getUrlDomain,
  getUrlDisplayTitle,
  isUrlIndexed,
  isUrlProcessing,
  isUrlError,
  type UrlAttachment,
} from "../../types/url";

interface UrlAttachmentsProps {
  noteId: string;
}

/**
 * Component to display and manage URL attachments for a note
 */
export function UrlAttachments({ noteId }: UrlAttachmentsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const attachments = useNoteUrlAttachments(noteId);
  const { loadAttachments, addUrlAttachment } = useUrlAttachmentStore();

  // Load attachments when noteId changes
  useEffect(() => {
    void loadAttachments(noteId);
  }, [noteId, loadAttachments]);

  const handleAddUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;

    // Basic URL validation
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("URL must start with http:// or https://");
      return;
    }

    try {
      setError(null);
      await addUrlAttachment(noteId, url);
      setUrlInput("");
      setIsAddingUrl(false);
    } catch (err) {
      setError(String(err));
    }
  }, [noteId, urlInput, addUrlAttachment]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAddUrl();
    } else if (e.key === "Escape") {
      setIsAddingUrl(false);
      setUrlInput("");
      setError(null);
    }
  };

  // Don't render if no attachments and not adding
  if (attachments.length === 0 && !isAddingUrl) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsAddingUrl(true)}
          className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="Attach a URL to this note"
        >
          <Link2 size={12} />
          <span>Add URL</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-lg border"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <Link2 size={14} />
          <span className="text-xs font-medium">
            Linked URLs ({attachments.length})
          </span>
        </div>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Content */}
      {isExpanded && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* URL List */}
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <UrlAttachmentItem
                key={attachment.id}
                attachment={attachment}
                noteId={noteId}
              />
            ))}
          </div>

          {/* Add URL Input */}
          {isAddingUrl ? (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="https://example.com/article"
                  className="flex-1 rounded border px-2 py-1 text-xs outline-none"
                  style={{
                    borderColor: error
                      ? "var(--color-error)"
                      : "var(--color-border)",
                    backgroundColor: "var(--color-bg-primary)",
                    color: "var(--color-text-primary)",
                  }}
                  autoFocus
                />
                <button
                  onClick={() => void handleAddUrl()}
                  className="cursor-pointer rounded px-2 py-1 text-xs transition-colors"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-text-inverse)",
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAddingUrl(false);
                    setUrlInput("");
                    setError(null);
                  }}
                  className="cursor-pointer rounded px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Cancel
                </button>
              </div>
              {error && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--color-error)" }}
                >
                  {error}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAddingUrl(true)}
              className="mt-2 flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Plus size={12} />
              <span>Add another URL</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface UrlAttachmentItemProps {
  attachment: UrlAttachment;
  noteId: string;
}

function UrlAttachmentItem({ attachment, noteId }: UrlAttachmentItemProps) {
  const { removeUrlAttachment, refreshUrlAttachment } = useUrlAttachmentStore();
  const isIndexing = useIsUrlIndexing(attachment.id);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeUrlAttachment(attachment.id, noteId);
    } catch (err) {
      console.error("Failed to remove URL:", err);
      setIsRemoving(false);
    }
  };

  const handleRefresh = () => {
    void refreshUrlAttachment(attachment.id);
  };

  const handleOpenUrl = () => {
    window.open(attachment.url, "_blank", "noopener,noreferrer");
  };

  const title = getUrlDisplayTitle(attachment);
  const domain = getUrlDomain(attachment.url);
  const processing = isUrlProcessing(attachment) || isIndexing;
  const indexed = isUrlIndexed(attachment);
  const hasError = isUrlError(attachment);

  return (
    <div
      className="group flex items-start gap-2 rounded p-2"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {processing ? (
          <Loader2
            size={14}
            className="animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
        ) : indexed ? (
          <CheckCircle2
            size={14}
            style={{ color: "var(--color-success, #22c55e)" }}
          />
        ) : hasError ? (
          <AlertCircle
            size={14}
            style={{ color: "var(--color-error, #ef4444)" }}
          />
        ) : (
          <Link2 size={14} style={{ color: "var(--color-text-tertiary)" }} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className="truncate text-xs font-medium"
            style={{ color: "var(--color-text-primary)" }}
            title={title}
          >
            {title}
          </span>
        </div>
        <div
          className="truncate text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {domain}
        </div>
        {hasError && attachment.errorMessage && (
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--color-error, #ef4444)" }}
          >
            {attachment.errorMessage}
          </div>
        )}
        {processing && (
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Indexing...
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleOpenUrl}
          className="cursor-pointer rounded p-1 transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="Open URL in browser"
        >
          <ExternalLink size={12} />
        </button>
        {!processing && (
          <button
            onClick={handleRefresh}
            className="cursor-pointer rounded p-1 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
            title="Refresh content"
          >
            <RefreshCw size={12} />
          </button>
        )}
        <button
          onClick={() => void handleRemove()}
          disabled={isRemoving}
          className="cursor-pointer rounded p-1 transition-colors"
          style={{ color: "var(--color-error, #ef4444)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="Remove URL"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default UrlAttachments;

