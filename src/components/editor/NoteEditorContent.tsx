import { useEffect, useCallback, useState, useRef, useMemo } from "react";
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
import { Paperclip } from "lucide-react";
import { marked } from "marked";
import { useNoteStore } from "../../stores/noteStore";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";
import * as api from "../../lib/tauri";
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
import { saveAttachment } from "../../lib/vault";
import { detectFileCategory, type FileCategory } from "../../lib/fileTypes";
import * as agentsApi from "../../lib/agents";

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Create lowlight instance with common languages
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

interface NoteEditorContentProps {
  noteId: string;
}

/**
 * TipTap-based note editor content component.
 * Receives a noteId prop and renders the editor for that specific note.
 */
export function NoteEditorContent({ noteId }: NoteEditorContentProps) {
  const notes = useNoteStore((state) => state.notes);
  const updateNote = useNoteStore((state) => state.updateNote);
  const openTab = useEditorGroupStore((state) => state.openTab);
  const { startAgent, stopAgent } = useAgentActivityStore();
  const { isEditorToolbarVisible } = useSettingsStore();
  const [title, setTitle] = useState("");
  const lastSyncedHtmlRef = useRef<string>("");

  // Find the current note from store
  const selectedNoteFromStore = useMemo(() => {
    return notes.find((n) => n.id === noteId) ?? null;
  }, [notes, noteId]);

  // State for note fetched directly from API (fallback)
  const [fetchedNote, setFetchedNote] = useState<typeof selectedNoteFromStore>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Use note from store, or fallback to fetched note
  const selectedNote = selectedNoteFromStore ?? fetchedNote;

  // Fetch note from API if not in store
  useEffect(() => {
    if (!selectedNoteFromStore && noteId && !isFetching) {
      setIsFetching(true);
      api.getNote(noteId)
        .then((note) => {
          if (note) {
            setFetchedNote(note);
            // Also add to store for consistency
            useNoteStore.setState((state) => ({
              notes: [note, ...state.notes.filter(n => n.id !== note.id)],
            }));
          }
        })
        .catch((err) => {
          console.error("Failed to fetch note:", err);
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [noteId, selectedNoteFromStore, isFetching]);

  // Track the current note ID to prevent saving after unmount
  const currentNoteIdRef = useRef<string>(noteId);
  
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
  
  // Update ref when note ID changes
  useEffect(() => {
    currentNoteIdRef.current = noteId;
  }, [noteId]);

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
        id: string,
        updates: { title?: string; content?: string; contentHtml?: string },
      ) => {
        // Don't save if the note is no longer active
        if (currentNoteIdRef.current !== id) {
          return;
        }
        
        await updateNote(id, updates);
        
        // Sync wiki-links if content changed
        if (updates.contentHtml && updates.contentHtml !== lastSyncedHtmlRef.current) {
          lastSyncedHtmlRef.current = updates.contentHtml;
          const links = extractLinksFromHtml(updates.contentHtml, id);
          syncNoteLinks(id, links).catch((err) => {
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
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const relativePath = await saveAttachment(data, file.name);
      insertFileByCategory(editor, file, category, relativePath);
    } catch {
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
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: { class: "code-block" },
      }),
      Placeholder.configure({
        placeholder: "Start writing... (supports Markdown shortcuts)",
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: "editor-image" },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { class: "editor-link" },
      }),
      Typography,
      WikiLink,
      Video,
      Audio,
      FileBlock,
      AIBlock,
      SlashCommand,
      MermaidBlock,
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "editor-table" },
      }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "tiptap prose prose-sm max-w-none focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              const category = detectFileCategory(file.type, file.name);
              if (category !== "unknown") {
                event.preventDefault();
                insertFileFromFile(file);
                return true;
              }
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        let handled = false;
        for (const file of files) {
          const category = detectFileCategory(file.type, file.name);
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
      if (noteId) {
        const content = editor.getText();
        const contentHtml = editor.getHTML();
        debouncedSave(noteId, { content, contentHtml });
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
      const linkedNoteId = wikiLink.getAttribute("data-note-id");
      if (linkedNoteId) {
        event.preventDefault();
        openTab({ type: "note", id: linkedNoteId });
      }
    }
  }, [openTab]);

  // Handle context menu for AI actions
  const handleEditorContextMenu = useCallback((event: MouseEvent) => {
    const editor = editorRef.current;
    if (!editor) return;

    const target = event.target as HTMLElement;
    
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

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const hasSelection = selectedText.trim().length > 0;

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

    const isAttachment = !!contextMenu.selectedAttachment;
    const content = isAttachment 
      ? contextMenu.selectedAttachment!.filename 
      : contextMenu.selectedText;
    const contentType = isAttachment ? "attachment" : "selection";

    startAgent({
      id: executionId,
      type: "summarization",
      noteId: selectedNote.id,
      noteTitle: selectedNote.title,
    });

    try {
      const unlisten = await agentsApi.listenForAgentContent(executionId, async (event) => {
        if (editor && !editor.isDestroyed) {
          const html = await marked.parse(event.content);
          editor.chain().focus().insertContent(html).run();
        }
      });
      unlistenContentRef.current = unlisten;

      await agentsApi.executeSummarizationAgent(
        executionId,
        content,
        contentType,
        isAttachment ? contextMenu.selectedAttachment?.src : undefined
      );
    } catch (err) {
      console.error("[NoteEditorContent] Summarization error:", err);
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

    const isAttachment = !!contextMenu.selectedAttachment;
    const topic = isAttachment 
      ? `Research the content of: ${contextMenu.selectedAttachment!.filename}`
      : contextMenu.selectedText;
    
    startAgent({
      id: executionId,
      type: "research",
      noteId: selectedNote.id,
      noteTitle: selectedNote.title,
    });

    try {
      const unlisten = await agentsApi.listenForAgentContent(executionId, async (event) => {
        if (editor && !editor.isDestroyed) {
          const html = await marked.parse(event.content);
          editor.chain().focus().insertContent(html).run();
        }
      });
      unlistenContentRef.current = unlisten;

      await agentsApi.executeResearchAgent(
        executionId,
        topic,
        isAttachment ? undefined : contextMenu.selectedText
      );
    } catch (err) {
      console.error("[NoteEditorContent] Research error:", err);
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
      if (editor) {
        const newContent = selectedNote.contentHtml || selectedNote.content || "";
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
    if (!editor || editor.isDestroyed) return;

    const timeoutId = setTimeout(() => {
      try {
        const editorElement = editor.view?.dom;
        if (editorElement) {
          editorElement.addEventListener("click", handleEditorClick);
          editorElement.addEventListener("contextmenu", handleEditorContextMenu);
        }
      } catch {
        // Editor view not ready yet
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
        // Editor view not available
      }
    };
  }, [editor, handleEditorClick, handleEditorContextMenu]);

  // Handle title change
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (noteId) {
      debouncedSave(noteId, { title: newTitle });
    }
  };

  // Handle title blur - save immediately
  const handleTitleBlur = () => {
    if (selectedNote && title !== selectedNote.title) {
      updateNote(noteId, { title });
    }
  };

  // Handle file upload button
  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [
      "image/*",
      "video/*",
      "audio/*",
      ".pdf",
      ".doc", ".docx", ".odt", ".rtf",
      ".xls", ".xlsx", ".ods",
      ".ppt", ".pptx", ".odp",
      ".js", ".jsx", ".ts", ".tsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
      ".cs", ".rb", ".php", ".swift", ".kt", ".scala", ".css", ".scss", ".sass", ".less",
      ".html", ".htm", ".xml", ".json", ".yaml", ".yml", ".toml", ".sql", ".sh", ".bash",
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

  // Loading state if note not found
  if (!selectedNote) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <p>Loading note...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Formatting Toolbar */}
      {isEditorToolbarVisible && <EditorToolbar editor={editor} noteId={noteId} />}
      
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
        <div className="flex items-center gap-1">
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

export default NoteEditorContent;
