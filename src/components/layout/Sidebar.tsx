import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  FileText,
  FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  Inbox,
  Trash2,
  Pencil,
  Kanban,
  Calendar,
  CalendarPlus,
  Copy,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  useFolderStore,
  useFolderTree,
  type FolderTreeNode,
} from "../../stores/folderStore";
import { useNoteStore } from "../../stores/noteStore";
import { useBoardStore } from "../../stores/boardStore";
import { useEditorGroupStore, useActiveTab } from "../../stores/editorGroupStore";
import { useDragStore } from "../../stores/dragStore";
import { useDailyNotesStore } from "../../stores/dailyNotesStore";
import type { Note } from "../../types/note";
import type { Folder } from "../../types/note";
import type { Board } from "../../types/board";
import { createNote as createNoteApi } from "../../lib/tauri";

/** System folder names that cannot be deleted or renamed */
const SYSTEM_FOLDER_NAMES = ["Daily Notes"];

/** Check if a folder is a system folder */
const isSystemFolder = (folder: Folder): boolean => {
  return SYSTEM_FOLDER_NAMES.includes(folder.name) && folder.parentId === null;
};

/**
 * Sidebar component with folder tree navigation
 * Supports drag-and-drop to move notes between folders
 */
export function Sidebar() {
  const { createFolder, deleteFolder, updateFolder } = useFolderStore();
  const { 
    notes,
    createNote, 
    fetchAllNotes, 
    moveNoteToFolder,
    deleteNote,
    updateNote,
  } = useNoteStore();
  const {
    boards,
    fetchAllBoards,
    createBoard,
  } = useBoardStore();
  const { openTab } = useEditorGroupStore();
  const activeTab = useActiveTab();
  const selectedNoteId = activeTab?.type === "note" ? activeTab.id : null;
  const { isDragging, draggedNoteId, endDrag, startDrag } = useDragStore();
  const { openTodayNote, isLoading: isDailyNoteLoading } = useDailyNotesStore();
  const folderTree = useFolderTree();

  // Fetch boards on mount
  useEffect(() => {
    fetchAllBoards();
  }, [fetchAllBoards]);

  // Create a map of folder IDs to boards
  const boardsByFolder = useMemo(() => {
    const map: Record<string, Board> = {};
    for (const board of boards) {
      map[board.folderId] = board;
    }
    return map;
  }, [boards]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showUnfiledNotes, setShowUnfiledNotes] = useState(false);
  const [showDailyNotes, setShowDailyNotes] = useState(false);
  
  // Context menu state for folders
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    folder: Folder;
  } | null>(null);

  // Context menu state for notes
  const [noteContextMenu, setNoteContextMenu] = useState<{
    x: number;
    y: number;
    note: Note;
  } | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Delete folder dialog state (with checkbox option)
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{
    folder: Folder;
    noteCount: number;
    subfolderCount: number;
  } | null>(null);

  // Renaming state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // New board modal state
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);

  // Find the Daily Notes folder
  const dailyNotesFolder = useMemo(() => {
    return folderTree.find(f => f.name === "Daily Notes" && f.parentId === null) ?? null;
  }, [folderTree]);

  // Filter the Daily Notes folder from the regular folder tree
  const filteredFolderTree = useMemo(() => {
    return folderTree.filter(f => !(f.name === "Daily Notes" && f.parentId === null));
  }, [folderTree]);

  // Group notes by folder for efficient lookup
  const notesByFolder = useMemo(() => {
    const grouped: Record<string, Note[]> = { unfiled: [], dailyNotes: [] };
    for (const note of notes) {
      if (note.folderId) {
        // Check if this is the Daily Notes folder
        if (dailyNotesFolder && note.folderId === dailyNotesFolder.id) {
          grouped.dailyNotes.push(note);
        } else {
          if (!grouped[note.folderId]) {
            grouped[note.folderId] = [];
          }
          grouped[note.folderId].push(note);
        }
      } else {
        grouped.unfiled.push(note);
      }
    }
    // Sort notes by title within each folder (daily notes sorted by date descending)
    for (const key of Object.keys(grouped)) {
      if (key === "dailyNotes") {
        // Sort daily notes by date (title) descending (newest first)
        grouped[key].sort((a, b) => b.title.localeCompare(a.title));
      } else {
        grouped[key].sort((a, b) => a.title.localeCompare(b.title));
      }
    }
    return grouped;
  }, [notes, dailyNotesFolder]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateNote = async () => {
    const newNote = await createNote("Untitled", null);
    if (newNote) {
      openTab({ type: "note", id: newNote.id });
    }
  };

  const handleOpenDailyNote = async () => {
    try {
      await openTodayNote();
    } catch (error) {
      console.error("Failed to open daily note:", error);
    }
  };

  const handleCreateNoteInFolder = async (folderId: string) => {
    const newNote = await createNote("Untitled", folderId);
    // Expand the folder to show the new note
    setExpandedFolders((prev) => new Set([...prev, folderId]));
    setFolderContextMenu(null);
    // Start renaming the new note immediately
    if (newNote) {
      openTab({ type: "note", id: newNote.id });
      setRenamingNoteId(newNote.id);
      setRenameValue("Untitled");
    }
  };

  const handleStartCreateFolderInFolder = (parentId: string) => {
    // Start inline folder creation with a parent
    setCreatingFolderParentId(parentId);
    setIsCreatingFolder(true);
    setNewFolderName("");
    // Expand the parent folder to show the input
    setExpandedFolders((prev) => new Set([...prev, parentId]));
    setFolderContextMenu(null);
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteContextMenu(null);
    setFolderContextMenu({
      x: e.clientX,
      y: e.clientY,
      folder,
    });
  };

  const handleNoteContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu(null);
    setNoteContextMenu({
      x: e.clientX,
      y: e.clientY,
      note,
    });
  };

  // Helper to count all notes in a folder and its subfolders
  const countNotesInFolderTree = (folderId: string): number => {
    let count = notesByFolder[folderId]?.length || 0;
    const folder = folderTree.find(f => f.id === folderId) || 
      folderTree.flatMap(function findInTree(f: FolderTreeNode): FolderTreeNode[] {
        if (f.id === folderId) return [f];
        return f.children.flatMap(findInTree);
      }).find(f => f.id === folderId);
    
    if (folder) {
      const countChildren = (node: FolderTreeNode): number => {
        let childCount = notesByFolder[node.id]?.length || 0;
        for (const child of node.children) {
          childCount += countChildren(child);
        }
        return childCount;
      };
      // Only count children, not self (already counted above)
      for (const child of (folder as FolderTreeNode).children || []) {
        count += countChildren(child);
      }
    }
    return count;
  };

  // Helper to count subfolders
  const countSubfolders = (folderId: string): number => {
    const findFolder = (nodes: FolderTreeNode[]): FolderTreeNode | null => {
      for (const node of nodes) {
        if (node.id === folderId) return node;
        const found = findFolder(node.children);
        if (found) return found;
      }
      return null;
    };
    
    const folder = findFolder(folderTree);
    if (!folder) return 0;
    
    const countChildren = (node: FolderTreeNode): number => {
      let count = node.children.length;
      for (const child of node.children) {
        count += countChildren(child);
      }
      return count;
    };
    return countChildren(folder);
  };

  const handleDeleteFolder = (folder: Folder) => {
    const noteCount = countNotesInFolderTree(folder.id);
    const subfolderCount = countSubfolders(folder.id);
    setFolderContextMenu(null);
    setDeleteFolderDialog({
      folder,
      noteCount,
      subfolderCount,
    });
  };

  // Handle opening or creating a board for a folder
  const handleOpenOrCreateBoard = useCallback(async (folder: Folder) => {
    setFolderContextMenu(null);
    
    // Check if board exists
    const existingBoard = boardsByFolder[folder.id];
    if (existingBoard) {
      openTab({ type: "board", id: existingBoard.id });
    } else {
      // Create a new board
      const newBoard = await createBoard(folder.id, `${folder.name} Board`);
      openTab({ type: "board", id: newBoard.board.id });
    }
  }, [boardsByFolder, openTab, createBoard]);

  const handleConfirmDeleteFolder = async (moveNotesToUnfiled: boolean) => {
    if (!deleteFolderDialog) return;
    
    const { folder } = deleteFolderDialog;
    
    if (moveNotesToUnfiled) {
      // Move all notes in this folder to unfiled before deleting
      const notesInFolder = notesByFolder[folder.id] || [];
      for (const note of notesInFolder) {
        await moveNoteToFolder(note.id, null);
      }
    } else {
      // Delete all notes in this folder
      const notesInFolder = notesByFolder[folder.id] || [];
      for (const note of notesInFolder) {
        await deleteNote(note.id);
      }
    }
    
    // Delete the folder (backend should handle cascading to subfolders)
    await deleteFolder(folder.id);
    setDeleteFolderDialog(null);
  };

  const handleDeleteNote = (note: Note) => {
    setNoteContextMenu(null);
    setConfirmDialog({
      title: "Delete Note",
      message: `Are you sure you want to delete "${note.title || "Untitled"}"? This action cannot be undone.`,
      onConfirm: async () => {
        await deleteNote(note.id);
        setConfirmDialog(null);
      },
    });
  };

  const handleStartRenameFolder = (folder: Folder) => {
    setFolderContextMenu(null);
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  };

  const handleRenameFolder = async () => {
    if (renamingFolderId && renameValue.trim()) {
      await updateFolder(renamingFolderId, { name: renameValue.trim() });
    }
    setRenamingFolderId(null);
    setRenameValue("");
  };

  const handleStartRenameNote = (note: Note) => {
    setNoteContextMenu(null);
    setRenamingNoteId(note.id);
    setRenameValue(note.title || "");
  };

  const handleDuplicateNote = async (note: Note) => {
    setNoteContextMenu(null);
    try {
      // Create new note with "(Copy)" appended to the title
      const newTitle = `${note.title || "Untitled"} (Copy)`;
      const duplicatedNote = await createNoteApi({
        title: newTitle,
        content: note.content,
        contentHtml: note.contentHtml,
        folderId: note.folderId,
      });
      // Refresh notes and open the duplicated note
      await fetchAllNotes();
      openTab({ type: "note", id: duplicatedNote.id });
    } catch (error) {
      console.error("Failed to duplicate note:", error);
    }
  };

  const handleRenameNote = async () => {
    if (renamingNoteId && renameValue.trim()) {
      await updateNote(renamingNoteId, { title: renameValue.trim() });
    }
    setRenamingNoteId(null);
    setRenameValue("");
  };

  const handleCancelRename = () => {
    setRenamingFolderId(null);
    setRenamingNoteId(null);
    setRenameValue("");
  };

  // Close context menus when clicking elsewhere
  useEffect(() => {
    if (folderContextMenu || noteContextMenu) {
      const handleClick = () => {
        setFolderContextMenu(null);
        setNoteContextMenu(null);
      };
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [folderContextMenu, noteContextMenu]);

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim(), creatingFolderParentId);
      setNewFolderName("");
      setIsCreatingFolder(false);
      setCreatingFolderParentId(null);
    }
  };

  const handleCancelCreateFolder = () => {
    setIsCreatingFolder(false);
    setNewFolderName("");
    setCreatingFolderParentId(null);
  };

  // Handle drop on a target
  const handleDrop = async (targetFolderId: string | null) => {
    if (draggedNoteId) {
      await moveNoteToFolder(draggedNoteId, targetFolderId);
      endDrag();
    }
  };

  const handleOpenNote = (noteId: string) => {
    openTab({ type: "note", id: noteId });
  };

  const handleStartNoteDrag = (note: Note, x: number, y: number) => {
    startDrag(note.id, note.title || "Untitled", x, y);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header / Action Buttons */}
      <div
        className="flex flex-shrink-0 items-center justify-center gap-1 border-b p-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        {/* New Note */}
        <button
          onClick={handleCreateNote}
          className="cursor-pointer rounded-lg p-2 transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="New Note (⌘N)"
        >
          <FilePlus size={18} />
        </button>
        {/* New Daily Note */}
        <button
          onClick={handleOpenDailyNote}
          disabled={isDailyNoteLoading}
          className="cursor-pointer rounded-lg p-2 transition-colors"
          style={{ 
            color: "var(--color-text-secondary)",
            opacity: isDailyNoteLoading ? 0.5 : 1,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="New Daily Note (⌘D)"
        >
          <CalendarPlus size={18} />
        </button>
        {/* New Folder */}
        <button
          onClick={() => {
            setCreatingFolderParentId(null);
            setIsCreatingFolder(true);
            setNewFolderName("");
          }}
          className="cursor-pointer rounded-lg p-2 transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="New Folder"
        >
          <FolderPlus size={18} />
        </button>
        {/* New Board */}
        <button
          onClick={() => setShowNewBoardModal(true)}
          className="cursor-pointer rounded-lg p-2 transition-colors flex items-center justify-center"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
          title="New Board"
        >
          <span className="relative" style={{ width: 18, height: 18, display: "block" }}>
            <LayoutGrid size={18} />
            <span
              className="absolute flex items-center justify-center"
              style={{ 
                bottom: 0,
                right: -3,
                fontSize: "11px",
                fontWeight: 800,
                lineHeight: 1,
                textShadow: "-1px -1px 0 var(--color-bg-secondary), 1px -1px 0 var(--color-bg-secondary), -1px 1px 0 var(--color-bg-secondary), 1px 1px 0 var(--color-bg-secondary)",
              }}
            >
              +
            </span>
          </span>
        </button>
      </div>

      {/* Folder Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {/* All Notes - Just a label, notes are shown in folders */}
        <button
          onClick={fetchAllNotes}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
          style={{
            backgroundColor: "transparent",
            color: "var(--color-text-primary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <FileText size={16} style={{ color: "var(--color-text-secondary)" }} />
          <span className="font-medium">All Notes</span>
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {notes.length}
          </span>
        </button>

        {/* Unfiled Notes - Expandable section */}
        <div>
          <DropTarget
            id="unfiled"
            isActive={false}
            isDragging={isDragging}
            hoverTarget={hoverTarget}
            setHoverTarget={setHoverTarget}
            onDrop={() => handleDrop(null)}
            onClick={() => setShowUnfiledNotes(!showUnfiledNotes)}
          >
            <span
              className="flex-shrink-0"
              style={{
                width: 16,
                color: "var(--color-text-tertiary)",
              }}
            >
              {showUnfiledNotes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <Inbox size={16} style={{ color: "var(--color-text-secondary)" }} />
            <span className="font-medium">Unfiled</span>
            <span
              className="ml-auto text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {notesByFolder.unfiled?.length || 0}
            </span>
          </DropTarget>
          
          {/* Unfiled Notes List */}
          {showUnfiledNotes && notesByFolder.unfiled?.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onOpen={() => handleOpenNote(note.id)}
              onContextMenu={handleNoteContextMenu}
              onStartDrag={handleStartNoteDrag}
              depth={1}
              isRenaming={renamingNoteId === note.id}
              renameValue={renamingNoteId === note.id ? renameValue : ""}
              onRenameValueChange={setRenameValue}
              onRenameSubmit={handleRenameNote}
              onRenameCancel={handleCancelRename}
            />
          ))}
        </div>

        {/* Daily Notes - Expandable section */}
        <div>
          <div
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
            onClick={() => setShowDailyNotes(!showDailyNotes)}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
            style={{ color: "var(--color-text-primary)" }}
          >
            <span
              className="flex-shrink-0"
              style={{
                width: 16,
                color: "var(--color-text-tertiary)",
              }}
            >
              {showDailyNotes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <Calendar size={16} style={{ color: "var(--color-text-secondary)" }} />
            <span className="font-medium">Daily Notes</span>
            <span
              className="ml-auto text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {notesByFolder.dailyNotes?.length || 0}
            </span>
          </div>
          
          {/* Daily Notes List */}
          {showDailyNotes && notesByFolder.dailyNotes?.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onOpen={() => handleOpenNote(note.id)}
              onContextMenu={handleNoteContextMenu}
              onStartDrag={handleStartNoteDrag}
              depth={1}
              isRenaming={renamingNoteId === note.id}
              renameValue={renamingNoteId === note.id ? renameValue : ""}
              onRenameValueChange={setRenameValue}
              onRenameSubmit={handleRenameNote}
              onRenameCancel={handleCancelRename}
            />
          ))}
        </div>

        {/* Folders Section */}
        <div className="mt-4">
          <div
            className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Folders
          </div>

          {/* New Folder Input (root level) */}
          {isCreatingFolder && creatingFolderParentId === null && (
            <NewFolderInput
              value={newFolderName}
              onChange={setNewFolderName}
              onSubmit={handleCreateFolder}
              onCancel={handleCancelCreateFolder}
              depth={0}
            />
          )}

          {/* Folder Tree (excluding Daily Notes system folder) */}
          {filteredFolderTree.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              notesByFolder={notesByFolder}
              boardsByFolder={boardsByFolder}
              selectedNoteId={selectedNoteId}
              expandedFolders={expandedFolders}
              onToggle={toggleFolder}
              onOpenNote={handleOpenNote}
              onDrop={handleDrop}
              onFolderContextMenu={handleFolderContextMenu}
              onNoteContextMenu={handleNoteContextMenu}
              onStartNoteDrag={handleStartNoteDrag}
              isDragging={isDragging}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              depth={0}
              isCreatingFolder={isCreatingFolder}
              creatingFolderParentId={creatingFolderParentId}
              newFolderName={newFolderName}
              onNewFolderNameChange={setNewFolderName}
              onCreateFolder={handleCreateFolder}
              onCancelCreateFolder={handleCancelCreateFolder}
              renamingFolderId={renamingFolderId}
              renamingNoteId={renamingNoteId}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onRenameFolderSubmit={handleRenameFolder}
              onRenameNoteSubmit={handleRenameNote}
              onRenameCancel={handleCancelRename}
            />
          ))}

          {folderTree.length === 0 && !isCreatingFolder && (
            <div
              className="px-3 py-2 text-sm italic"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No folders yet
            </div>
          )}
        </div>
      </nav>

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <FolderContextMenu
          x={folderContextMenu.x}
          y={folderContextMenu.y}
          hasBoard={!!boardsByFolder[folderContextMenu.folder.id]}
          isSystem={isSystemFolder(folderContextMenu.folder)}
          onNewNote={() => handleCreateNoteInFolder(folderContextMenu.folder.id)}
          onNewFolder={() => handleStartCreateFolderInFolder(folderContextMenu.folder.id)}
          onOpenBoard={() => handleOpenOrCreateBoard(folderContextMenu.folder)}
          onRename={() => handleStartRenameFolder(folderContextMenu.folder)}
          onDelete={() => handleDeleteFolder(folderContextMenu.folder)}
        />
      )}

      {/* Note Context Menu */}
      {noteContextMenu && (
        <NoteContextMenu
          x={noteContextMenu.x}
          y={noteContextMenu.y}
          onRename={() => handleStartRenameNote(noteContextMenu.note)}
          onDuplicate={() => handleDuplicateNote(noteContextMenu.note)}
          onDelete={() => handleDeleteNote(noteContextMenu.note)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Delete Folder Dialog */}
      {deleteFolderDialog && (
        <DeleteFolderDialog
          folderName={deleteFolderDialog.folder.name}
          noteCount={deleteFolderDialog.noteCount}
          subfolderCount={deleteFolderDialog.subfolderCount}
          onConfirm={handleConfirmDeleteFolder}
          onCancel={() => setDeleteFolderDialog(null)}
        />
      )}

      {/* New Board Modal */}
      {showNewBoardModal && (
        <NewBoardModal
          folders={filteredFolderTree}
          boardsByFolder={boardsByFolder}
          onSelect={async (folderId, folderName) => {
            setShowNewBoardModal(false);
            const newBoard = await createBoard(folderId, `${folderName} Board`);
            openTab({ type: "board", id: newBoard.board.id });
          }}
          onCancel={() => setShowNewBoardModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Drop Target Component
// ============================================================================

interface DropTargetProps {
  id: string;
  isActive: boolean;
  isDragging: boolean;
  hoverTarget: string | null;
  setHoverTarget: (id: string | null) => void;
  onDrop: () => void;
  onClick: () => void;
  children: React.ReactNode;
}

function DropTarget({
  id,
  isActive,
  isDragging,
  hoverTarget,
  setHoverTarget,
  onDrop,
  onClick,
  children,
}: DropTargetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = hoverTarget === id;

  useEffect(() => {
    if (!isDragging || !ref.current) return;

    const handleMouseEnter = () => {
      setHoverTarget(id);
    };

    const handleMouseLeave = () => {
      setHoverTarget(null);
    };

    const handleMouseUp = () => {
      if (hoverTarget === id) {
        onDrop();
      }
    };

    const el = ref.current;
    el.addEventListener("mouseenter", handleMouseEnter);
    el.addEventListener("mouseleave", handleMouseLeave);
    el.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mouseleave", handleMouseLeave);
      el.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, id, hoverTarget, setHoverTarget, onDrop]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
      style={{
        backgroundColor:
          isHovered && isDragging
            ? "var(--color-accent-light)"
            : isActive
              ? "var(--color-bg-hover)"
              : "transparent",
        color: "var(--color-text-primary)",
        outline: isHovered && isDragging ? "2px dashed var(--color-accent)" : "none",
        outlineOffset: "-2px",
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isDragging) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !(isHovered && isDragging)) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Note Item Component (leaf node in tree)
// ============================================================================

interface NoteItemProps {
  note: Note;
  isSelected: boolean;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent, note: Note) => void;
  onStartDrag?: (note: Note, x: number, y: number) => void;
  depth: number;
  isRenaming?: boolean;
  renameValue?: string;
  onRenameValueChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}

function NoteItem({ 
  note, 
  isSelected, 
  onOpen, 
  onContextMenu,
  onStartDrag,
  depth,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
}: NoteItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRenaming || e.button !== 0) return;
    // Store the initial position for drag detection
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStartRef.current || isRenaming) return;
    
    // Check if we've moved enough to start a drag (5px threshold)
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    
    if (dx > 5 || dy > 5) {
      onStartDrag?.(note, e.clientX, e.clientY);
      dragStartRef.current = null;
    }
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
  };

  const handleClick = () => {
    // Only trigger open if we didn't just drag
    if (!isRenaming && dragStartRef.current === null) {
      onOpen();
    }
    dragStartRef.current = null;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    handleMouseUp();
    if (!isSelected) {
      e.currentTarget.style.backgroundColor = "transparent";
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => !isRenaming && onContextMenu?.(e, note)}
      className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm transition-colors select-none"
      style={{
        paddingLeft: `${8 + depth * 16 + 16}px`, // Extra indent for notes under folders
        backgroundColor: isSelected ? "var(--color-accent-light)" : "transparent",
        color: isSelected ? "var(--color-accent)" : "var(--color-text-primary)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isRenaming) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }
      }}
    >
      <FileText
        size={14}
        style={{
          color: isSelected ? "var(--color-accent)" : "var(--color-text-tertiary)",
          flexShrink: 0,
        }}
      />
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameValueChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit?.();
            if (e.key === "Escape") onRenameCancel?.();
          }}
          onBlur={onRenameSubmit}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 rounded border px-1 py-0.5 text-sm"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-accent)",
            color: "var(--color-text-primary)",
            minWidth: 0,
          }}
        />
      ) : (
        <span className="truncate">{note.title || "Untitled"}</span>
      )}
    </div>
  );
}

// ============================================================================
// Folder Item Component
// ============================================================================

interface FolderItemProps {
  folder: FolderTreeNode;
  notesByFolder: Record<string, Note[]>;
  boardsByFolder: Record<string, Board>;
  selectedNoteId: string | null;
  expandedFolders: Set<string>;
  onToggle: (folderId: string) => void;
  onOpenNote: (noteId: string) => void;
  onDrop: (folderId: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: Note) => void;
  onStartNoteDrag: (note: Note, x: number, y: number) => void;
  isDragging: boolean;
  hoverTarget: string | null;
  setHoverTarget: (id: string | null) => void;
  depth: number;
  isCreatingFolder: boolean;
  creatingFolderParentId: string | null;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  // Renaming props
  renamingFolderId: string | null;
  renamingNoteId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameFolderSubmit: () => void;
  onRenameNoteSubmit: () => void;
  onRenameCancel: () => void;
}

function FolderItem({
  folder,
  notesByFolder,
  boardsByFolder,
  selectedNoteId,
  expandedFolders,
  onToggle,
  onOpenNote,
  onDrop,
  onFolderContextMenu,
  onNoteContextMenu,
  onStartNoteDrag,
  isDragging,
  hoverTarget,
  setHoverTarget,
  depth,
  isCreatingFolder,
  creatingFolderParentId,
  newFolderName,
  onNewFolderNameChange,
  onCreateFolder,
  onCancelCreateFolder,
  renamingFolderId,
  renamingNoteId,
  renameValue,
  onRenameValueChange,
  onRenameFolderSubmit,
  onRenameNoteSubmit,
  onRenameCancel,
}: FolderItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isExpanded = expandedFolders.has(folder.id);
  const folderNotes = notesByFolder[folder.id] || [];
  const hasChildren = folder.children.length > 0 || folderNotes.length > 0;
  const isHovered = hoverTarget === folder.id;
  const isRenaming = renamingFolderId === folder.id;
  const hasBoard = !!boardsByFolder[folder.id];

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!isDragging || !ref.current) return;

    const handleMouseEnter = () => {
      setHoverTarget(folder.id);
    };

    const handleMouseLeave = () => {
      setHoverTarget(null);
    };

    const handleMouseUp = () => {
      if (hoverTarget === folder.id) {
        onDrop(folder.id);
      }
    };

    const el = ref.current;
    el.addEventListener("mouseenter", handleMouseEnter);
    el.addEventListener("mouseleave", handleMouseLeave);
    el.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mouseleave", handleMouseLeave);
      el.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, folder.id, hoverTarget, setHoverTarget, onDrop]);

  return (
    <div>
      <div
        ref={ref}
        onClick={isRenaming ? undefined : () => onToggle(folder.id)}
        onContextMenu={isRenaming ? undefined : (e) => onFolderContextMenu(e, folder)}
        className="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          backgroundColor:
            isHovered && isDragging
              ? "var(--color-accent-light)"
              : "transparent",
          color: "var(--color-text-primary)",
          outline: isHovered && isDragging ? "2px dashed var(--color-accent)" : "none",
          outlineOffset: "-2px",
        }}
        onMouseEnter={(e) => {
          if (!isDragging) {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }
        }}
        onMouseLeave={(e) => {
          if (!(isHovered && isDragging)) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        {/* Expand/Collapse Toggle */}
        <span
          className="flex-shrink-0"
          style={{
            width: 16,
            visibility: hasChildren ? "visible" : "hidden",
            color: "var(--color-text-tertiary)",
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Folder Icon */}
        {isExpanded ? (
          <FolderOpen
            size={16}
            style={{
              color: isHovered && isDragging ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          />
        ) : (
          <FolderIcon
            size={16}
            style={{
              color: isHovered && isDragging ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          />
        )}

        {/* Folder Name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameFolderSubmit();
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={onRenameFolderSubmit}
            onClick={(e) => e.stopPropagation()}
            className="ml-1 flex-1 rounded border px-1 py-0.5 text-sm"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-accent)",
              color: "var(--color-text-primary)",
              minWidth: 0,
            }}
          />
        ) : (
          <span className="ml-1 truncate">{folder.name}</span>
        )}
        
        {/* Board indicator */}
        {!isRenaming && hasBoard && (
          <span title="Has board">
            <Kanban
              size={12}
              className="ml-auto flex-shrink-0"
              style={{ color: "var(--color-accent)" }}
            />
          </span>
        )}
        
        {/* Note count */}
        {!isRenaming && (
          <span
            className={hasBoard ? "ml-1 text-xs" : "ml-auto text-xs"}
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {folderNotes.length}
          </span>
        )}
      </div>

      {/* Expanded content: subfolders and notes */}
      {isExpanded && (
        <>
          {/* New folder input (when creating subfolder) */}
          {isCreatingFolder && creatingFolderParentId === folder.id && (
            <NewFolderInput
              value={newFolderName}
              onChange={onNewFolderNameChange}
              onSubmit={onCreateFolder}
              onCancel={onCancelCreateFolder}
              depth={depth + 1}
            />
          )}

          {/* Subfolders first */}
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              notesByFolder={notesByFolder}
              boardsByFolder={boardsByFolder}
              selectedNoteId={selectedNoteId}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onOpenNote={onOpenNote}
              onDrop={onDrop}
              onFolderContextMenu={onFolderContextMenu}
              onNoteContextMenu={onNoteContextMenu}
              onStartNoteDrag={onStartNoteDrag}
              isDragging={isDragging}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              depth={depth + 1}
              isCreatingFolder={isCreatingFolder}
              creatingFolderParentId={creatingFolderParentId}
              newFolderName={newFolderName}
              onNewFolderNameChange={onNewFolderNameChange}
              onCreateFolder={onCreateFolder}
              onCancelCreateFolder={onCancelCreateFolder}
              renamingFolderId={renamingFolderId}
              renamingNoteId={renamingNoteId}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onRenameFolderSubmit={onRenameFolderSubmit}
              onRenameNoteSubmit={onRenameNoteSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
          
          {/* Notes in this folder */}
          {folderNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onOpen={() => onOpenNote(note.id)}
              onContextMenu={onNoteContextMenu}
              onStartDrag={onStartNoteDrag}
              depth={depth + 1}
              isRenaming={renamingNoteId === note.id}
              renameValue={renamingNoteId === note.id ? renameValue : ""}
              onRenameValueChange={onRenameValueChange}
              onRenameSubmit={onRenameNoteSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================================
// New Folder Input Component
// ============================================================================

interface NewFolderInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  depth: number;
}

function NewFolderInput({ value, onChange, onSubmit, onCancel, depth }: NewFolderInputProps) {
  return (
    <div 
      className="mb-1 py-1"
      style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: 8 }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => {
          if (!value.trim()) {
            onCancel();
          }
        }}
        placeholder="Folder name..."
        autoFocus
        className="w-full rounded-md border px-2 py-1 text-sm"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-accent)",
          color: "var(--color-text-primary)",
        }}
      />
    </div>
  );
}

// ============================================================================
// Folder Context Menu Component
// ============================================================================

interface FolderContextMenuProps {
  x: number;
  y: number;
  hasBoard: boolean;
  isSystem?: boolean;
  onNewNote: () => void;
  onNewFolder: () => void;
  onOpenBoard: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FolderContextMenu({ x, y, hasBoard, isSystem, onNewNote, onNewFolder, onOpenBoard, onRename, onDelete }: FolderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border py-1 shadow-lg"
      style={{
        left: x,
        top: y,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onNewNote}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Plus size={14} />
        New Note
      </button>
      <button
        onClick={onNewFolder}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <FolderPlus size={14} />
        New Folder
      </button>
      <div 
        className="my-1 border-t"
        style={{ borderColor: "var(--color-border)" }}
      />
      <button
        onClick={onOpenBoard}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Kanban size={14} />
        {hasBoard ? "Open Board" : "Create Board"}
      </button>
      {!isSystem && (
        <>
          <div 
            className="my-1 border-t"
            style={{ borderColor: "var(--color-border)" }}
          />
          <button
            onClick={onRename}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
            style={{ color: "var(--color-text-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Pencil size={14} />
            Rename
          </button>
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
            style={{ color: "var(--color-error, #ef4444)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Trash2 size={14} />
            Delete Folder
          </button>
        </>
      )}
      {isSystem && (
        <div
          className="mt-1 border-t px-3 py-2 text-xs italic"
          style={{ 
            borderColor: "var(--color-border)",
            color: "var(--color-text-tertiary)" 
          }}
        >
          System folder
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Note Context Menu Component
// ============================================================================

interface NoteContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function NoteContextMenu({ x, y, onRename, onDuplicate, onDelete }: NoteContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border py-1 shadow-lg"
      style={{
        left: x,
        top: y,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onRename}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Pencil size={14} />
        Rename
      </button>
      <button
        onClick={onDuplicate}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-text-primary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Copy size={14} />
        Duplicate
      </button>
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
        style={{ color: "var(--color-error, #ef4444)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Trash2 size={14} />
        Delete Note
      </button>
    </div>
  );
}

// ============================================================================
// Confirmation Dialog Component
// ============================================================================

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleConfirmClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm();
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={handleCancelClick}
    >
      <div
        className="mx-4 max-w-sm rounded-lg border p-4 shadow-xl"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="mb-2 text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        <p
          className="mb-4 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancelClick}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-error, #ef4444)",
              color: "white",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Delete Folder Dialog Component (with checkbox option)
// ============================================================================

interface DeleteFolderDialogProps {
  folderName: string;
  noteCount: number;
  subfolderCount: number;
  onConfirm: (moveNotesToUnfiled: boolean) => void;
  onCancel: () => void;
}

function DeleteFolderDialog({ 
  folderName, 
  noteCount, 
  subfolderCount,
  onConfirm, 
  onCancel 
}: DeleteFolderDialogProps) {
  const [moveToUnfiled, setMoveToUnfiled] = useState(true);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleConfirmClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm(moveToUnfiled);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  const hasContent = noteCount > 0 || subfolderCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={handleCancelClick}
    >
      <div
        className="mx-4 max-w-md rounded-lg border p-4 shadow-xl"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="mb-2 text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Delete Folder
        </h3>
        <p
          className="mb-3 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Are you sure you want to delete &quot;<strong>{folderName}</strong>&quot;?
        </p>
        
        {hasContent && (
          <div
            className="mb-3 rounded-md p-3 text-sm"
            style={{ backgroundColor: "var(--color-bg-secondary)" }}
          >
            <p style={{ color: "var(--color-text-secondary)" }}>
              This folder contains:
            </p>
            <ul className="mt-1 list-inside list-disc" style={{ color: "var(--color-text-secondary)" }}>
              {noteCount > 0 && (
                <li>{noteCount} note{noteCount > 1 ? "s" : ""}</li>
              )}
              {subfolderCount > 0 && (
                <li>{subfolderCount} subfolder{subfolderCount > 1 ? "s" : ""}</li>
              )}
            </ul>
          </div>
        )}

        {noteCount > 0 && (
          <label 
            className="mb-4 flex cursor-pointer items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={moveToUnfiled}
              onChange={(e) => setMoveToUnfiled(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span 
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              Move notes to Unfiled instead of deleting
            </span>
          </label>
        )}

        {noteCount > 0 && !moveToUnfiled && (
          <p
            className="mb-4 text-sm font-medium"
            style={{ color: "var(--color-error, #ef4444)" }}
          >
            ⚠️ All {noteCount} note{noteCount > 1 ? "s" : ""} will be permanently deleted!
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancelClick}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-error, #ef4444)",
              color: "white",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// New Board Modal Component
// ============================================================================

interface NewBoardModalProps {
  folders: FolderTreeNode[];
  boardsByFolder: Record<string, Board>;
  onSelect: (folderId: string, folderName: string) => void;
  onCancel: () => void;
}

function NewBoardModal({ folders, boardsByFolder, onSelect, onCancel }: NewBoardModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  // Flatten folders for display
  const flattenFolders = (nodes: FolderTreeNode[], depth = 0): Array<{ folder: FolderTreeNode; depth: number }> => {
    const result: Array<{ folder: FolderTreeNode; depth: number }> = [];
    for (const node of nodes) {
      result.push({ folder: node, depth });
      result.push(...flattenFolders(node.children, depth + 1));
    }
    return result;
  };

  const flatFolders = flattenFolders(folders);
  const availableFolders = flatFolders.filter(({ folder }) => !boardsByFolder[folder.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-lg border shadow-xl"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            New Board
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Select a folder to create a board for
          </p>
        </div>

        {/* Folder List */}
        <div className="max-h-64 overflow-y-auto p-2">
          {availableFolders.length === 0 ? (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {folders.length === 0 
                ? "No folders yet. Create a folder first."
                : "All folders already have boards."}
            </div>
          ) : (
            availableFolders.map(({ folder, depth }) => (
              <button
                key={folder.id}
                onClick={() => onSelect(folder.id, folder.name)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                style={{
                  paddingLeft: `${12 + depth * 16}px`,
                  color: "var(--color-text-primary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <FolderIcon size={16} style={{ color: "var(--color-text-secondary)" }} />
                <span>{folder.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end border-t px-4 py-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
