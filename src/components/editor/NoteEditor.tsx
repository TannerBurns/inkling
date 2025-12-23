import { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";
import { FileText, Paperclip } from "lucide-react";
import { marked } from "marked";
import { useNoteStore, useSelectedNote } from "../../stores/noteStore";
import { useBoardStore } from "../../stores/boardStore";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { WikiLink } from "./extensions/WikiLink";
import { Video } from "./extensions/Video";
import { Audio } from "./extensions/Audio";
import { FileBlock } from "./extensions/FileBlock";
import { AIBlock } from "./extensions/AIBlock";
import { SlashCommand } from "./extensions/SlashCommand";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { EditorContextMenu } from "./EditorContextMenu";
import { EditorToolbar } from "./EditorToolbar";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { extractLinksFromHtml, syncNoteLinks } from "../../lib/links";
import { NoteTags } from "../notes/NoteTags";
import { DailyNoteNavigation } from "../notes/DailyNoteNavigation";
import { NoteTabs } from "./NoteTabs";
import { BoardView } from "../board/BoardView";
import { saveAttachment } from "../../lib/vault";
import { detectFileCategory, type FileCategory } from "../../lib/fileTypes";
import * as agentsApi from "../../lib/agents";

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Create lowlight instance with common languages
// Includes: javascript, typescript, python, css, html, json, markdown, bash, etc.
const lowlight = createLowlight(common);

// Insert file based on its category
function insertFileByCategory(
  editor: Editor,
  file: File,
  category: FileCategory,
  relativePath: string
) {
  switch (category) {
    case "image":
      editor.chain().focus().setImage({ src: relativePath }).run();
      break;
    case "video":
      editor.chain().focus().setVideo({ src: relativePath, title: file.name }).run();
      break;
    case "audio":
      editor.chain().focus().setAudio({ src: relativePath, title: file.name }).run();
      break;
    case "pdf":
    case "code":
    case "text":
    case "office":
    default:
      editor.chain().focus().setFileBlock({
        src: relativePath,
        filename: file.name,
        fileType: category,
        fileSize: file.size,
      }).run();
      break;
  }
}

/**
 * TipTap-based note editor with markdown support
 * 
 * Markdown shortcuts supported:
 * - # Heading 1, ## Heading 2, ### Heading 3
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - ~~strikethrough~~
 * - `inline code`
 * - ```language code block with syntax highlighting
 * - > blockquote
 * - - or * for bullet lists
 * - 1. for numbered lists
 * - --- for horizontal rule
 * - [text](url) for links
 * 
 * Supported file types:
 * - Images: jpg, png, gif, webp, svg
 * - Videos: mp4, webm, mov, avi
 * - Audio: mp3, wav, ogg, m4a
 * - Documents: pdf, doc, docx, xls, xlsx, ppt, pptx
 * - Code: js, ts, py, rs, go, java, c, cpp, etc.
 * - Text: txt, md
 */
export function NoteEditor() {
  const selectedNote = useSelectedNote();
  const { updateNote, createNote, openNote } = useNoteStore();
  const { selectedBoardId } = useBoardStore();
  const { startAgent, stopAgent } = useAgentActivityStore();
  const { isEditorToolbarVisible } = useSettingsStore();
  const [title, setTitle] = useState("");
  const lastSyncedHtmlRef = useRef<string>("");

  // Track the current note ID to prevent saving after deletion
  const currentNoteIdRef = useRef<string | null>(null);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
    selectedText: string;
    selectedAttachment?: {
      src: string;
      filename: string;
      fileType: string;
    };
  } | null>(null);

  // Track active agent execution for content streaming
  const activeExecutionRef = useRef<string | null>(null);
  const unlistenContentRef = useRef<(() => void) | null>(null);
  
  // Update ref when selected note changes
  useEffect(() => {
    currentNoteIdRef.current = selectedNote?.id ?? null;
  }, [selectedNote?.id]);

  // Cleanup content listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenContentRef.current) {
        unlistenContentRef.current();
      }
    };
  }, []);

  // Debounced save function with link syncing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(
      async (
        noteId: string,
        updates: { title?: string; content?: string; contentHtml?: string },
      ) => {
        // Don't save if the note is no longer selected (e.g., was deleted)
        if (currentNoteIdRef.current !== noteId) {
          return;
        }
        
        await updateNote(noteId, updates);
        
        // Sync wiki-links if content changed
        if (updates.contentHtml && updates.contentHtml !== lastSyncedHtmlRef.current) {
          lastSyncedHtmlRef.current = updates.contentHtml;
          const links = extractLinksFromHtml(updates.contentHtml, noteId);
          syncNoteLinks(noteId, links).catch((err) => {
            console.warn("Failed to sync note links:", err);
          });
        }
      },
      500,
    ),
    [updateNote],
  );

  // Store editor ref for use in callbacks
  const editorRef = useRef<Editor | null>(null);

  // Convert file to attachment and insert into editor
  const insertFileFromFile = useCallback(async (file: File) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const category = detectFileCategory(file.type, file.name);
    
    try {
      // Try to save as vault attachment first
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const relativePath = await saveAttachment(data, file.name);
      
      // Insert based on file category
      insertFileByCategory(editor, file, category, relativePath);
    } catch {
      // Fall back to base64 for images only if vault is not configured
      if (category === "image") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          editor.chain().focus().setImage({ src: base64 }).run();
        };
        reader.readAsDataURL(file);
      } else {
        console.error("Failed to save attachment. Vault may not be configured.");
      }
    }
  }, []);

  // Initialize TipTap editor with extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Disable default code block - we use CodeBlockLowlight instead
        codeBlock: false,
        // Enable markdown-like input rules
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      // Code blocks with syntax highlighting
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: {
          class: "code-block",
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing... (supports Markdown shortcuts)",
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "editor-image",
        },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class: "editor-link",
        },
      }),
      Typography, // Smart quotes, dashes, etc.
      WikiLink, // Wiki-style [[note]] links
      Video, // Video embedding with custom player
      Audio, // Audio embedding with custom player
      FileBlock, // File blocks for PDFs, code, text, office docs
      AIBlock, // AI assistant blocks
      SlashCommand, // Slash command menu
      MermaidBlock, // Mermaid diagram rendering
      // Table support
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "editor-table",
        },
      }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "tiptap prose prose-sm max-w-none focus:outline-none",
      },
      // Handle paste events for all file types and markdown tables
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        // First, check for file pastes
        for (const item of items) {
          // Check if it's a file
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              const category = detectFileCategory(file.type, file.name);
              // Handle all supported file types
              if (category !== "unknown") {
                event.preventDefault();
                insertFileFromFile(file);
                return true;
              }
            }
          }
        }

        // Check for markdown table in pasted text
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          // Detect markdown table pattern: lines starting with | and containing |
          // Filter out empty lines to handle tables with blank lines between rows
          const lines = text.trim().split("\n").filter(line => line.trim().length > 0);
          const isMarkdownTable = lines.length >= 2 && 
            lines.every(line => line.trim().startsWith("|") && line.trim().endsWith("|")) &&
            lines.some(line => /^\|[\s\-:]+\|/.test(line.trim())); // Has separator row
          
          if (isMarkdownTable) {
            event.preventDefault();
            const editor = editorRef.current;
            if (editor) {
              // Remove empty lines for proper markdown table parsing
              const cleanedText = lines.join("\n");
              // Convert markdown table to HTML using marked
              const html = marked.parse(cleanedText);
              if (typeof html === "string") {
                editor.chain().focus().insertContent(html).run();
              } else {
                // Handle Promise (async mode)
                html.then((parsedHtml) => {
                  editor.chain().focus().insertContent(parsedHtml).run();
                });
              }
            }
            return true;
          }
        }

        return false;
      },
      // Handle drop events for all file types
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        let handled = false;
        for (const file of files) {
          const category = detectFileCategory(file.type, file.name);
          // Handle all supported file types
          if (category !== "unknown") {
            event.preventDefault();
            insertFileFromFile(file);
            handled = true;
          }
        }
        return handled;
      },
    },
    onUpdate: ({ editor }) => {
      // Auto-save on content change
      if (selectedNote) {
        const content = editor.getText();
        const contentHtml = editor.getHTML();
        debouncedSave(selectedNote.id, { content, contentHtml });
      }
    },
  });

  // Keep editorRef in sync with editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Handle wiki-link clicks - opens the linked note in a new tab
  const handleEditorClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const wikiLink = target.closest(".wiki-link");
    if (wikiLink) {
      const noteId = wikiLink.getAttribute("data-note-id");
      if (noteId) {
        event.preventDefault();
        openNote(noteId);
      }
    }
  }, [openNote]);

  // Handle context menu for AI actions
  const handleEditorContextMenu = useCallback((event: MouseEvent) => {
    const editor = editorRef.current;
    if (!editor) return;

    const target = event.target as HTMLElement;
    
    // Check if right-clicked on a file block
    const fileBlockNode = target.closest(".file-block-node-wrapper");
    let selectedAttachment: { src: string; filename: string; fileType: string } | undefined;
    
    if (fileBlockNode) {
      const src = fileBlockNode.querySelector("[data-src]")?.getAttribute("data-src");
      const filename = fileBlockNode.querySelector("[data-filename]")?.getAttribute("data-filename");
      const fileType = fileBlockNode.querySelector("[data-file-type]")?.getAttribute("data-file-type");
      
      if (src && filename) {
        selectedAttachment = {
          src,
          filename,
          fileType: fileType || "unknown",
        };
      }
    }

    // Get selected text
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const hasSelection = selectedText.trim().length > 0;

    // Only show context menu if there's a selection or an attachment
    if (hasSelection || selectedAttachment) {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        hasSelection,
        selectedText,
        selectedAttachment,
      });
    }
  }, []);

  // Execute summarization agent
  const handleSummarize = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !contextMenu || !selectedNote) return;

    const executionId = agentsApi.generateExecutionId();
    activeExecutionRef.current = executionId;

    // Determine content and type
    const isAttachment = !!contextMenu.selectedAttachment;
    const content = isAttachment 
      ? contextMenu.selectedAttachment!.filename 
      : contextMenu.selectedText;
    const contentType = isAttachment ? "attachment" : "selection";

    // Track agent activity
    startAgent({
      id: executionId,
      type: "summarization",
      noteId: selectedNote.id,
      noteTitle: selectedNote.title,
    });

    // Set up content streaming listener
    try {
      const unlisten = await agentsApi.listenForAgentContent(executionId, async (event) => {
        if (editor && !editor.isDestroyed) {
          // Convert markdown to HTML and insert
          const html = await marked.parse(event.content);
          editor.chain().focus().insertContent(html).run();
        }
      });
      unlistenContentRef.current = unlisten;

      // Execute the agent
      await agentsApi.executeSummarizationAgent(
        executionId,
        content,
        contentType,
        isAttachment ? contextMenu.selectedAttachment?.src : undefined
      );
    } catch (err) {
      console.error("[NoteEditor] Summarization error:", err);
    } finally {
      stopAgent(executionId);
      activeExecutionRef.current = null;
      if (unlistenContentRef.current) {
        unlistenContentRef.current();
        unlistenContentRef.current = null;
      }
    }
  }, [contextMenu, selectedNote, startAgent, stopAgent]);

  // Execute research agent
  const handleResearch = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !contextMenu || !selectedNote) return;

    const executionId = agentsApi.generateExecutionId();
    activeExecutionRef.current = executionId;

    // Determine topic and context
    const isAttachment = !!contextMenu.selectedAttachment;
    const topic = isAttachment 
      ? `Research the content of: ${contextMenu.selectedAttachment!.filename}`
      : contextMenu.selectedText;
    
    // Track agent activity
    startAgent({
      id: executionId,
      type: "research",
      noteId: selectedNote.id,
      noteTitle: selectedNote.title,
    });

    // Set up content streaming listener
    try {
      const unlisten = await agentsApi.listenForAgentContent(executionId, async (event) => {
        if (editor && !editor.isDestroyed) {
          // Convert markdown to HTML and insert
          const html = await marked.parse(event.content);
          editor.chain().focus().insertContent(html).run();
        }
      });
      unlistenContentRef.current = unlisten;

      // Execute the agent
      await agentsApi.executeResearchAgent(
        executionId,
        topic,
        isAttachment ? undefined : contextMenu.selectedText
      );
    } catch (err) {
      console.error("[NoteEditor] Research error:", err);
    } finally {
      stopAgent(executionId);
      activeExecutionRef.current = null;
      if (unlistenContentRef.current) {
        unlistenContentRef.current();
        unlistenContentRef.current = null;
      }
    }
  }, [contextMenu, selectedNote, startAgent, stopAgent]);

  // Update editor content when selected note changes
  useEffect(() => {
    if (selectedNote) {
      setTitle(selectedNote.title);
      // Set content from HTML if available, otherwise from plain text
      if (editor) {
        const newContent = selectedNote.contentHtml || selectedNote.content || "";
        // Only update if content is different to avoid cursor jump
        if (editor.getHTML() !== newContent) {
          editor.commands.setContent(newContent);
          lastSyncedHtmlRef.current = newContent;
        }
      }
    } else {
      setTitle("");
      editor?.commands.setContent("");
      lastSyncedHtmlRef.current = "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id, editor]);

  // Attach click and context menu handlers
  useEffect(() => {
    // Wait for editor to be fully mounted before accessing view.dom
    if (!editor || editor.isDestroyed) {
      return;
    }

    // Use a small delay to ensure the editor view is ready
    const timeoutId = setTimeout(() => {
      try {
        const editorElement = editor.view?.dom;
        if (editorElement) {
          editorElement.addEventListener("click", handleEditorClick);
          editorElement.addEventListener("contextmenu", handleEditorContextMenu);
        }
      } catch {
        // Editor view not ready yet, ignore
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      try {
        const editorElement = editor.view?.dom;
        if (editorElement) {
          editorElement.removeEventListener("click", handleEditorClick);
          editorElement.removeEventListener("contextmenu", handleEditorContextMenu);
        }
      } catch {
        // Editor view not available, ignore
      }
    };
  }, [editor, handleEditorClick, handleEditorContextMenu]);

  // Handle title change
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (selectedNote) {
      debouncedSave(selectedNote.id, { title: newTitle });
    }
  };

  // Handle title blur - save immediately
  const handleTitleBlur = () => {
    if (selectedNote && title !== selectedNote.title) {
      updateNote(selectedNote.id, { title });
    }
  };

  // Handle file upload button - accepts all file types
  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    // Accept all supported file types
    input.accept = [
      // Images
      "image/*",
      // Videos
      "video/*",
      // Audio
      "audio/*",
      // Documents
      ".pdf",
      ".doc", ".docx", ".odt", ".rtf",
      ".xls", ".xlsx", ".ods",
      ".ppt", ".pptx", ".odp",
      // Code
      ".js", ".jsx", ".ts", ".tsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
      ".cs", ".rb", ".php", ".swift", ".kt", ".scala", ".css", ".scss", ".sass", ".less",
      ".html", ".htm", ".xml", ".json", ".yaml", ".yml", ".toml", ".sql", ".sh", ".bash",
      // Text
      ".txt", ".md", ".markdown",
    ].join(",");
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        insertFileFromFile(file);
      }
    };
    input.click();
  };

  // If a board is selected, show the BoardView instead
  if (selectedBoardId) {
    return (
      <div className="flex h-full flex-col">
        <NoteTabs />
        <BoardView />
      </div>
    );
  }

  // Show empty state if no note is selected
  if (!selectedNote) {
    return (
      <div className="flex h-full flex-col">
        <NoteTabs />
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <FileText size={64} strokeWidth={1} />
          <div className="text-center">
            <p className="text-lg font-medium">No note selected</p>
            <p className="mt-1 text-sm">
              Select a note from the sidebar or create a new one
            </p>
          </div>
          <button
            onClick={() => createNote("Untitled", null)}
            className="mt-2 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "var(--color-accent-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-accent)")
            }
          >
            Create New Note
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab Bar */}
      <NoteTabs />

      {/* Fixed Formatting Toolbar */}
      {isEditorToolbarVisible && <EditorToolbar editor={editor} />}
      
      {/* Title Input */}
      <div
        className="flex flex-shrink-0 items-start justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Note title..."
            className="w-full border-none bg-transparent text-2xl font-bold outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Last updated:{" "}
            {new Date(selectedNote.updatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
          
          {/* Tags */}
          <NoteTags noteId={selectedNote.id} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Daily Note Navigation */}
          <DailyNoteNavigation noteId={selectedNote.id} />
          
          <button
            onClick={handleFileUpload}
            className="cursor-pointer rounded-lg p-2 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
            title="Attach file (images, videos, documents, code)"
          >
            <Paperclip size={18} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Bubble Menu for text selection */}
        {editor && <EditorBubbleMenu editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {/* Context Menu for AI Actions */}
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasSelection={contextMenu.hasSelection}
          selectedAttachment={contextMenu.selectedAttachment}
          onSummarize={handleSummarize}
          onResearch={handleResearch}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// Simple debounce utility
function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
