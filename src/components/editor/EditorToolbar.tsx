import { type Editor } from "@tiptap/react";
import { useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Table,
  ChevronDown,
  Link,
  Check,
  X,
  Type,
  Plus,
  Trash2,
  RowsIcon,
  Columns,
  Download,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { TableSizePicker } from "./TableSizePicker";
import { useExportStore } from "../../stores/exportStore";

interface EditorToolbarProps {
  editor: Editor | null;
  noteId?: string;
}

/**
 * Fixed toolbar for the note editor
 * Provides formatting options for text and block elements
 */
export function EditorToolbar({ editor, noteId }: EditorToolbarProps) {
  const [isHeadingDropdownOpen, setIsHeadingDropdownOpen] = useState(false);
  const [isInsertDropdownOpen, setIsInsertDropdownOpen] = useState(false);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  
  const { exportNotesPdf, exportNotesDocx, exportSelectionXlsx, isExporting } = useExportStore();

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;
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
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setLinkUrl("");
    setIsLinkInputOpen(false);
  }, [editor]);

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setIsLinkInputOpen(true);
  }, [editor]);

  const closeAllDropdowns = useCallback(() => {
    setIsHeadingDropdownOpen(false);
    setIsInsertDropdownOpen(false);
    setIsTablePickerOpen(false);
    setIsTableMenuOpen(false);
    setIsExportDropdownOpen(false);
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!noteId) return;
    setIsExportDropdownOpen(false);
    await exportNotesPdf([noteId]);
  }, [noteId, exportNotesPdf]);

  const handleExportDocx = useCallback(async () => {
    if (!noteId) return;
    setIsExportDropdownOpen(false);
    await exportNotesDocx([noteId]);
  }, [noteId, exportNotesDocx]);

  const handleExportXlsx = useCallback(async () => {
    if (!noteId || !editor) return;
    setIsExportDropdownOpen(false);
    // Get the current selection or full content
    const content = editor.getHTML();
    await exportSelectionXlsx(content, noteId);
  }, [noteId, editor, exportSelectionXlsx]);

  const handleTableInsert = useCallback(
    (rows: number, cols: number) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertTable({ rows, cols, withHeaderRow: true })
        .run();
      setIsTablePickerOpen(false);
      setIsInsertDropdownOpen(false);
    },
    [editor]
  );

  if (!editor) {
    return null;
  }

  // Check if cursor is inside a table
  const isInTable = editor.isActive("table");

  // Get current heading level for display
  const getCurrentHeadingLabel = () => {
    if (editor.isActive("heading", { level: 1 })) return "Heading 1";
    if (editor.isActive("heading", { level: 2 })) return "Heading 2";
    if (editor.isActive("heading", { level: 3 })) return "Heading 3";
    return "Normal";
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b px-4 py-2"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Heading dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsHeadingDropdownOpen(!isHeadingDropdownOpen);
            setIsInsertDropdownOpen(false);
          }}
          className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors"
          style={{
            color: "var(--color-text-primary)",
            backgroundColor: isHeadingDropdownOpen
              ? "var(--color-bg-hover)"
              : "transparent",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = isHeadingDropdownOpen
              ? "var(--color-bg-hover)"
              : "transparent")
          }
        >
          <Type size={14} />
          <span className="min-w-[70px]">{getCurrentHeadingLabel()}</span>
          <ChevronDown size={12} />
        </button>

        {isHeadingDropdownOpen && (
          <div
            className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border py-1 shadow-lg"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
            }}
          >
            <DropdownOption
              label="Normal"
              isActive={!editor.isActive("heading")}
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                setIsHeadingDropdownOpen(false);
              }}
            />
            <DropdownOption
              label="Heading 1"
              icon={<Heading1 size={14} />}
              isActive={editor.isActive("heading", { level: 1 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                setIsHeadingDropdownOpen(false);
              }}
            />
            <DropdownOption
              label="Heading 2"
              icon={<Heading2 size={14} />}
              isActive={editor.isActive("heading", { level: 2 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
                setIsHeadingDropdownOpen(false);
              }}
            />
            <DropdownOption
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
        <Bold size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic (Cmd+I)"
      >
        <Italic size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline code"
      >
        <Code size={16} />
      </ToolbarButton>

      {/* Link button with inline input */}
      {isLinkInputOpen ? (
        <div className="flex items-center gap-1 rounded border px-1" style={{ borderColor: "var(--color-border)" }}>
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
            className="h-6 w-40 border-none bg-transparent px-2 text-sm outline-none"
            style={{ color: "var(--color-text-primary)" }}
            autoFocus
          />
          <button
            onClick={handleLinkSubmit}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-primary)" }}
          >
            <Check size={14} />
          </button>
          {editor.isActive("link") && (
            <button
              onClick={handleLinkRemove}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <ToolbarButton
          onClick={openLinkInput}
          isActive={editor.isActive("link")}
          title="Add link"
        >
          <Link size={16} />
        </ToolbarButton>
      )}

      <Separator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered list"
      >
        <ListOrdered size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive("taskList")}
        title="Task list"
      >
        <CheckSquare size={16} />
      </ToolbarButton>

      <Separator />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Code block"
      >
        <Code size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        isActive={false}
        title="Divider"
      >
        <Minus size={16} />
      </ToolbarButton>

      {/* Insert dropdown for table */}
      <div className="relative">
        <button
          onClick={() => {
            setIsInsertDropdownOpen(!isInsertDropdownOpen);
            setIsHeadingDropdownOpen(false);
            setIsTablePickerOpen(false);
            setIsTableMenuOpen(false);
          }}
          className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors"
          style={{
            color: "var(--color-text-primary)",
            backgroundColor: isInsertDropdownOpen
              ? "var(--color-bg-hover)"
              : "transparent",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = isInsertDropdownOpen
              ? "var(--color-bg-hover)"
              : "transparent")
          }
        >
          <Table size={14} />
          <span>Insert</span>
          <ChevronDown size={12} />
        </button>

        {isInsertDropdownOpen && !isTablePickerOpen && (
          <div
            className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border py-1 shadow-lg"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
            }}
          >
            <DropdownOption
              label="Table..."
              icon={<Table size={14} />}
              isActive={false}
              onClick={() => setIsTablePickerOpen(true)}
            />
            <DropdownOption
              label="Horizontal Rule"
              icon={<Minus size={14} />}
              isActive={false}
              onClick={() => {
                editor.chain().focus().setHorizontalRule().run();
                setIsInsertDropdownOpen(false);
              }}
            />
          </div>
        )}

        {isTablePickerOpen && (
          <div className="absolute left-0 top-full z-50 mt-1">
            <TableSizePicker
              onSelect={handleTableInsert}
              onClose={() => {
                setIsTablePickerOpen(false);
                setIsInsertDropdownOpen(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Table controls - shown when cursor is inside a table */}
      {isInTable && (
        <>
          <Separator />
          
          <div className="relative">
            <button
              onClick={() => {
                setIsTableMenuOpen(!isTableMenuOpen);
                closeAllDropdowns();
                setIsTableMenuOpen(!isTableMenuOpen);
              }}
              className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors"
              style={{
                color: "var(--color-accent)",
                backgroundColor: isTableMenuOpen
                  ? "var(--color-accent-light)"
                  : "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--color-accent-light)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = isTableMenuOpen
                  ? "var(--color-accent-light)"
                  : "transparent")
              }
            >
              <Table size={14} />
              <span>Table</span>
              <ChevronDown size={12} />
            </button>

            {isTableMenuOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border py-1 shadow-lg"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Add
                </div>
                <DropdownOption
                  label="Add row above"
                  icon={<Plus size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    setIsTableMenuOpen(false);
                  }}
                />
                <DropdownOption
                  label="Add row below"
                  icon={<Plus size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    setIsTableMenuOpen(false);
                  }}
                />
                <DropdownOption
                  label="Add column left"
                  icon={<Plus size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    setIsTableMenuOpen(false);
                  }}
                />
                <DropdownOption
                  label="Add column right"
                  icon={<Plus size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    setIsTableMenuOpen(false);
                  }}
                />

                <div
                  className="mt-1 border-t px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ 
                    color: "var(--color-text-tertiary)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  Remove
                </div>
                <DropdownOption
                  label="Delete row"
                  icon={<RowsIcon size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    setIsTableMenuOpen(false);
                  }}
                />
                <DropdownOption
                  label="Delete column"
                  icon={<Columns size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    setIsTableMenuOpen(false);
                  }}
                />
                <DropdownOption
                  label="Delete table"
                  icon={<Trash2 size={14} />}
                  isActive={false}
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    setIsTableMenuOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Export dropdown - shown when noteId is available */}
      {noteId && (
        <>
          <div className="flex-1" /> {/* Spacer to push export to the right */}
          <div className="relative">
            <button
              onClick={() => {
                closeAllDropdowns();
                setIsExportDropdownOpen(!isExportDropdownOpen);
              }}
              disabled={isExporting}
              className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                color: "var(--color-text-primary)",
                backgroundColor: isExportDropdownOpen
                  ? "var(--color-bg-hover)"
                  : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isExporting) {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                }
              }}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = isExportDropdownOpen
                  ? "var(--color-bg-hover)"
                  : "transparent")
              }
            >
              <Download size={14} />
              <span>{isExporting ? "Exporting..." : "Export"}</span>
              <ChevronDown size={12} />
            </button>

            {isExportDropdownOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border py-1 shadow-lg"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <DropdownOption
                  label="Export as PDF"
                  icon={<FileText size={14} />}
                  isActive={false}
                  onClick={handleExportPdf}
                />
                <DropdownOption
                  label="Export as DOCX"
                  icon={<FileText size={14} />}
                  isActive={false}
                  onClick={handleExportDocx}
                />
                <DropdownOption
                  label="Tables to XLSX"
                  icon={<FileSpreadsheet size={14} />}
                  isActive={false}
                  onClick={handleExportXlsx}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
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
      className="flex h-8 w-8 items-center justify-center rounded transition-colors"
      style={{
        color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
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

function DropdownOption({
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

export default EditorToolbar;
