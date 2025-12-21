import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
  Check,
  X,
} from "lucide-react";

interface EditorBubbleMenuProps {
  editor: Editor;
}

/**
 * Bubble menu that appears when text is selected
 * Provides quick access to inline formatting options
 */
export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isHeadingDropdownOpen, setIsHeadingDropdownOpen] = useState(false);

  const handleLinkSubmit = useCallback(() => {
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    }
    setLinkUrl("");
    setIsLinkInputOpen(false);
  }, [editor, linkUrl]);

  const handleLinkRemove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setLinkUrl("");
    setIsLinkInputOpen(false);
  }, [editor]);

  const openLinkInput = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setIsLinkInputOpen(true);
  }, [editor]);

  // Get current heading level for display
  const getCurrentHeadingLabel = () => {
    if (editor.isActive("heading", { level: 1 })) return "H1";
    if (editor.isActive("heading", { level: 2 })) return "H2";
    if (editor.isActive("heading", { level: 3 })) return "H3";
    return "Text";
  };

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      {isLinkInputOpen ? (
        // Link input mode
        <div className="flex items-center gap-1 px-1">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === "Escape") {
                setIsLinkInputOpen(false);
                setLinkUrl("");
              }
            }}
            placeholder="Enter URL..."
            className="h-7 w-48 rounded border px-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            autoFocus
          />
          <ToolbarButton
            onClick={handleLinkSubmit}
            isActive={false}
            title="Apply link"
          >
            <Check size={14} />
          </ToolbarButton>
          {editor.isActive("link") && (
            <ToolbarButton
              onClick={handleLinkRemove}
              isActive={false}
              title="Remove link"
            >
              <X size={14} />
            </ToolbarButton>
          )}
        </div>
      ) : (
        // Normal formatting mode
        <>
          {/* Heading dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsHeadingDropdownOpen(!isHeadingDropdownOpen)}
              className="flex h-7 items-center gap-1 rounded px-2 text-sm font-medium transition-colors"
              style={{
                color: "var(--color-text-primary)",
                backgroundColor: isHeadingDropdownOpen
                  ? "var(--color-bg-hover)"
                  : "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = isHeadingDropdownOpen
                  ? "var(--color-bg-hover)"
                  : "transparent")
              }
            >
              {getCurrentHeadingLabel()}
              <ChevronDown size={12} />
            </button>

            {isHeadingDropdownOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border py-1 shadow-lg"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <HeadingOption
                  label="Text"
                  isActive={!editor.isActive("heading")}
                  onClick={() => {
                    editor.chain().focus().setParagraph().run();
                    setIsHeadingDropdownOpen(false);
                  }}
                />
                <HeadingOption
                  label="Heading 1"
                  icon={<Heading1 size={14} />}
                  isActive={editor.isActive("heading", { level: 1 })}
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 1 }).run();
                    setIsHeadingDropdownOpen(false);
                  }}
                />
                <HeadingOption
                  label="Heading 2"
                  icon={<Heading2 size={14} />}
                  isActive={editor.isActive("heading", { level: 2 })}
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                    setIsHeadingDropdownOpen(false);
                  }}
                />
                <HeadingOption
                  label="Heading 3"
                  icon={<Heading3 size={14} />}
                  isActive={editor.isActive("heading", { level: 3 })}
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 3 }).run();
                    setIsHeadingDropdownOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Bold (Cmd+B)"
          >
            <Bold size={14} />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Italic (Cmd+I)"
          >
            <Italic size={14} />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title="Inline code"
          >
            <Code size={14} />
          </ToolbarButton>

          <Separator />

          {/* Link */}
          <ToolbarButton
            onClick={openLinkInput}
            isActive={editor.isActive("link")}
            title="Add link"
          >
            <Link size={14} />
          </ToolbarButton>
        </>
      )}
    </BubbleMenu>
  );
}

function ToolbarButton({
  children,
  onClick,
  isActive,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  isActive: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded transition-colors"
      style={{
        color: isActive ? "var(--color-accent)" : "var(--color-text-primary)",
        backgroundColor: isActive ? "var(--color-accent-light)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

function HeadingOption({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
      style={{
        color: isActive ? "var(--color-accent)" : "var(--color-text-primary)",
        backgroundColor: isActive ? "var(--color-accent-light)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = isActive
            ? "var(--color-accent-light)"
            : "transparent";
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Separator() {
  return (
    <div
      className="mx-1 h-5 w-px"
      style={{ backgroundColor: "var(--color-border)" }}
    />
  );
}

export default EditorBubbleMenu;
