import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Edit3, Check, X, AlertCircle } from "lucide-react";
import mermaid from "mermaid";

// Get the theme based on system/user preference
function getMermaidTheme(): "default" | "dark" {
  // Check for dark mode
  if (typeof window !== "undefined") {
    const isDark = document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isDark ? "dark" : "default";
  }
  return "default";
}

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: getMermaidTheme(),
  securityLevel: "loose",
  fontFamily: "inherit",
});

export interface MermaidBlockAttrs {
  code: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      setMermaidBlock: (attrs?: Partial<MermaidBlockAttrs>) => ReturnType;
    };
  }
}

function MermaidBlockComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const attrs = node.attrs as MermaidBlockAttrs;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(!attrs.code);
  const [editValue, setEditValue] = useState(attrs.code || "");
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");

  // Render the mermaid diagram
  const renderDiagram = useCallback(async (code: string) => {
    if (!code.trim()) {
      setSvgContent("");
      setError(null);
      return;
    }

    try {
      // Reinitialize with current theme before rendering
      mermaid.initialize({
        startOnLoad: false,
        theme: getMermaidTheme(),
        securityLevel: "loose",
        fontFamily: "inherit",
      });
      
      // Validate the syntax first
      await mermaid.parse(code);
      
      // Generate unique ID for this render
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Render the diagram
      const { svg } = await mermaid.render(id, code);
      setSvgContent(svg);
      setError(null);
    } catch (err) {
      console.error("Mermaid render error:", err);
      setError(err instanceof Error ? err.message : "Failed to render diagram");
      setSvgContent("");
    }
  }, []);

  // Render on mount and when code changes
  useEffect(() => {
    if (!isEditing && attrs.code) {
      renderDiagram(attrs.code);
    }
  }, [attrs.code, isEditing, renderDiagram]);

  // Handle save
  const handleSave = useCallback(() => {
    updateAttributes({ code: editValue });
    setIsEditing(false);
    renderDiagram(editValue);
  }, [editValue, updateAttributes, renderDiagram]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setEditValue(attrs.code || "");
    setIsEditing(false);
    if (attrs.code) {
      renderDiagram(attrs.code);
    }
  }, [attrs.code, renderDiagram]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  }, [handleCancel, handleSave]);

  return (
    <NodeViewWrapper className="mermaid-block my-4">
      <div
        className={`rounded-lg border transition-all ${
          selected ? "ring-2 ring-blue-500" : ""
        }`}
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Mermaid Diagram
          </span>
          {!isEditing && (
            <button
              onClick={() => {
                setEditValue(attrs.code || "");
                setIsEditing(true);
              }}
              className="rounded p-1 transition-colors hover:bg-black/10"
              title="Edit diagram"
            >
              <Edit3 size={14} style={{ color: "var(--color-text-tertiary)" }} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do something]
  B -->|No| D[Do something else]`}
                className="w-full rounded-lg border p-3 font-mono text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                  minHeight: "120px",
                  resize: "vertical",
                }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  <Check size={14} />
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <X size={14} />
                  Cancel
                </button>
                <span
                  className="ml-auto text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  ⌘+Enter to save, Esc to cancel
                </span>
              </div>
            </div>
          ) : error ? (
            <div
              className="flex items-start gap-2 rounded-lg p-3"
              style={{
                backgroundColor: "var(--color-error-bg, rgba(239, 68, 68, 0.1))",
              }}
            >
              <AlertCircle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: "var(--color-error, #ef4444)" }}
              />
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-error, #ef4444)" }}
                >
                  Diagram Error
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {error}
                </p>
                <button
                  onClick={() => setIsEditing(true)}
                  className="mt-2 text-xs underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  Edit to fix
                </button>
              </div>
            </div>
          ) : svgContent ? (
            <div
              ref={containerRef}
              className="mermaid-svg flex justify-center overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div
              className="flex items-center justify-center py-8 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No diagram code. Click edit to add.
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const mermaidBlock = Node.create<MermaidBlockAttrs>({
  name: "mermaidBlock",

  group: "block",

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      code: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid-block"]',
        priority: 60,
      },
      // Also parse code blocks with language mermaid
      {
        tag: "pre",
        priority: 60, // Higher than CodeBlockLowlight (default 50)
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          const code = node.querySelector("code");
          if (code?.classList.contains("language-mermaid")) {
            return { code: code.textContent || "" };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "mermaid-block",
        "data-code": node.attrs.code,
      }),
      ["pre", ["code", { class: "language-mermaid" }, node.attrs.code]],
    ];
  },

  renderText({ node }) {
    return `\`\`\`mermaid\n${node.attrs.code}\n\`\`\``;
  },

  addCommands() {
    return {
      setMermaidBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockComponent);
  },
});

export default mermaidBlock;
