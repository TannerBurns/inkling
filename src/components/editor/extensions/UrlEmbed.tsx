import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  X,
  Globe,
  Plus,
  AlertCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type { UrlMetadata } from "../../../types/url";
import { useSelectedNote } from "../../../stores/noteStore";
import { useUrlAttachmentStore } from "../../../stores/urlAttachmentStore";

export interface UrlEmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface UrlEmbedAttrs {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  status: "loading" | "loaded" | "error";
  error: string | null;
}

function getUrlEmbedAttrs(attrs: Record<string, unknown>): UrlEmbedAttrs {
  return {
    url: (attrs.url as string) || "",
    title: (attrs.title as string) || null,
    description: (attrs.description as string) || null,
    imageUrl: (attrs.imageUrl as string) || null,
    faviconUrl: (attrs.faviconUrl as string) || null,
    siteName: (attrs.siteName as string) || null,
    status: (attrs.status as UrlEmbedAttrs["status"]) || "loading",
    error: (attrs.error as string) || null,
  };
}

/**
 * UrlEmbed extension for TipTap
 * Renders inline URL preview cards with rich metadata
 */
export const urlEmbed = Node.create<UrlEmbedOptions>({
  name: "urlEmbed",

  group: "block",

  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      url: {
        default: "",
      },
      title: {
        default: null,
      },
      description: {
        default: null,
      },
      imageUrl: {
        default: null,
      },
      faviconUrl: {
        default: null,
      },
      siteName: {
        default: null,
      },
      status: {
        default: "loading",
      },
      error: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-url-embed="true"]',
        // Higher priority ensures this parses before generic div rules
        priority: 60,
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            url: el.getAttribute("data-url") || "",
            title: el.getAttribute("data-title"),
            description: el.getAttribute("data-description"),
            imageUrl: el.getAttribute("data-image-url"),
            faviconUrl: el.getAttribute("data-favicon-url"),
            siteName: el.getAttribute("data-site-name"),
            status: el.getAttribute("data-status") || "loaded",
          };
        },
      },
      // Also handle the case where the URL embed placeholder was saved without full attributes
      {
        tag: 'div.url-embed-placeholder',
        priority: 59,
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const url = el.getAttribute("data-url") || el.textContent?.trim() || "";
          return {
            url,
            title: el.getAttribute("data-title"),
            description: el.getAttribute("data-description"),
            imageUrl: el.getAttribute("data-image-url"),
            faviconUrl: el.getAttribute("data-favicon-url"),
            siteName: el.getAttribute("data-site-name"),
            // If we're parsing from a placeholder, re-fetch metadata
            status: url ? "loading" : "error",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          "data-url-embed": "true",
          "data-url": node.attrs.url,
          "data-title": node.attrs.title,
          "data-description": node.attrs.description,
          "data-image-url": node.attrs.imageUrl,
          "data-favicon-url": node.attrs.faviconUrl,
          "data-site-name": node.attrs.siteName,
          "data-status": node.attrs.status,
          class: "url-embed-placeholder",
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      node.attrs.title || node.attrs.url,
    ];
  },

  renderText({ node }) {
    return node.attrs.url;
  },

  addNodeView() {
    return ReactNodeViewRenderer(UrlEmbedComponent);
  },

  addCommands() {
    return {
      insertUrlEmbed:
        (url: string) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                url,
                status: "loading",
              },
            })
            .run();
        },
    };
  },
});

// Declare the command type
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    urlEmbed: {
      insertUrlEmbed: (url: string) => ReturnType;
    };
  }
}

/**
 * Extract domain from URL for display
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * UrlEmbed React component rendered by the node view
 */
function UrlEmbedComponent({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = getUrlEmbedAttrs(node.attrs);
  const [isHovered, setIsHovered] = useState(false);
  const selectedNote = useSelectedNote();
  const { addUrlAttachment } = useUrlAttachmentStore();
  const [isIndexing, setIsIndexing] = useState(false);
  const [hasAutoIndexed, setHasAutoIndexed] = useState(false);

  // Fetch metadata on mount if in loading state
  useEffect(() => {
    if (attrs.status === "loading" && attrs.url) {
      fetchMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-index URL for AI context when the embed is created
  useEffect(() => {
    if (selectedNote && attrs.url && !hasAutoIndexed && attrs.status !== "error") {
      setHasAutoIndexed(true);
      // Auto-index in background - don't block or show loading state
      addUrlAttachment(selectedNote.id, attrs.url).catch((err) => {
        // Silently fail for auto-indexing (e.g., duplicate URL)
        console.debug("Auto-index URL skipped:", err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id, attrs.url]);

  const fetchMetadata = useCallback(async () => {
    try {
      const metadata = await invoke<UrlMetadata>("get_url_metadata", {
        url: attrs.url,
      });

      updateAttributes({
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        faviconUrl: metadata.faviconUrl,
        siteName: metadata.siteName,
        status: "loaded",
        error: null,
      });
    } catch (err) {
      updateAttributes({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [attrs.url, updateAttributes]);

  const handleOpenUrl = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (attrs.url) {
      open(attrs.url).catch((err) => {
        console.error("Failed to open URL:", err);
      });
    }
  }, [attrs.url]);

  const handleIndexUrl = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedNote || !attrs.url || isIndexing) return;
    
    setIsIndexing(true);
    addUrlAttachment(selectedNote.id, attrs.url)
      .catch((err) => {
        console.error("Failed to index URL:", err);
      })
      .finally(() => {
        setIsIndexing(false);
      });
  }, [selectedNote, attrs.url, addUrlAttachment, isIndexing]);

  const domain = getDomain(attrs.url);

  return (
    <NodeViewWrapper className="url-embed-wrapper">
      <div
        className="my-2 overflow-hidden rounded-lg border transition-shadow"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: isHovered ? "var(--color-accent)" : "var(--color-border)",
          boxShadow: isHovered ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Loading State */}
        {attrs.status === "loading" && (
          <div className="flex items-center gap-3 p-4">
            <Loader2
              size={20}
              className="animate-spin flex-shrink-0"
              style={{ color: "var(--color-accent)" }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Loading preview...
              </div>
              <div
                className="truncate text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {domain}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteNode();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex-shrink-0 p-1 transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Remove"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Error State */}
        {attrs.status === "error" && (
          <div className="flex items-center gap-3 p-4">
            <AlertCircle
              size={20}
              className="flex-shrink-0"
              style={{ color: "var(--color-error, #ef4444)" }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Failed to load preview
              </div>
              <div
                className="truncate text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {attrs.error || domain}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleOpenUrl}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Open URL"
              >
                <ExternalLink size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteNode();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Remove"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Loaded State */}
        {attrs.status === "loaded" && (
          <div className="flex">
            {/* Image thumbnail */}
            {attrs.imageUrl && (
              <div
                className="flex-shrink-0"
                style={{
                  width: "120px",
                  minHeight: "90px",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                <img
                  src={attrs.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // Hide image on error
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col p-3">
              {/* Header with favicon and domain */}
              <div className="mb-1 flex items-center gap-2">
                {attrs.faviconUrl ? (
                  <img
                    src={attrs.faviconUrl}
                    alt=""
                    className="h-4 w-4 flex-shrink-0"
                    onError={(e) => {
                      // Replace with fallback icon on error
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Globe
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                )}
                <span
                  className="truncate text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {attrs.siteName || domain}
                </span>
              </div>

              {/* Title */}
              <div
                className="mb-1 line-clamp-2 cursor-pointer text-sm font-medium leading-tight hover:underline"
                style={{ color: "var(--color-text-primary)" }}
                onClick={handleOpenUrl}
                onMouseDown={(e) => e.stopPropagation()}
                title={attrs.title || attrs.url}
              >
                {attrs.title || domain}
              </div>

              {/* Description */}
              {attrs.description && (
                <div
                  className="line-clamp-2 text-xs leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {attrs.description}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div
              className="flex flex-shrink-0 flex-col items-center justify-center gap-1 border-l px-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <button
                type="button"
                onClick={handleOpenUrl}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1.5 transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="Open in browser"
              >
                <ExternalLink size={14} />
              </button>
              {selectedNote && (
                <button
                  type="button"
                  onClick={handleIndexUrl}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isIndexing}
                  className="rounded p-1.5 transition-colors"
                  style={{ color: "var(--color-accent)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  title="Index for AI context"
                >
                  {isIndexing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteNode();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1.5 transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="Remove embed"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export default urlEmbed;

