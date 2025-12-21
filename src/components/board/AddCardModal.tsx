import { useState, useCallback, useEffect, useMemo } from "react";
import { X, Search, FileText, FolderOpen } from "lucide-react";
import { useNoteStore } from "../../stores/noteStore";
import { useFolderStore } from "../../stores/folderStore";

interface AddCardModalProps {
  isOpen: boolean;
  boardFolderId: string;
  existingNoteIds: string[];
  onClose: () => void;
  onAddNote: (noteId: string) => void;
}

/**
 * Modal for selecting a note to add to a board lane
 */
export function AddCardModal({
  isOpen,
  boardFolderId,
  existingNoteIds,
  onClose,
  onAddNote,
}: AddCardModalProps) {
  const { notes: allNotes, fetchAllNotes } = useNoteStore();
  const { folders } = useFolderStore();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchAllNotes();
      setSearchQuery("");
    }
  }, [isOpen, fetchAllNotes]);

  // Build folder tree to check ancestry
  const folderParents = useMemo(() => {
    const parents: Record<string, string | null> = {};
    folders.forEach((f) => {
      parents[f.id] = f.parentId;
    });
    return parents;
  }, [folders]);

  // Check if a folder is a descendant of the board's folder
  const isDescendantOfBoardFolder = useCallback(
    (folderId: string | null): boolean => {
      if (!folderId) return false;
      if (folderId === boardFolderId) return true;

      let currentId: string | null = folderId;
      while (currentId) {
        if (currentId === boardFolderId) return true;
        currentId = folderParents[currentId] || null;
      }
      return false;
    },
    [boardFolderId, folderParents]
  );

  // Filter notes: only show notes from the board's folder or its subfolders
  const availableNotes = useMemo(() => {
    return allNotes.filter((note) => {
      // Skip notes already on the board
      if (existingNoteIds.includes(note.id)) return false;

      // Include notes from the board's folder or descendants
      if (note.folderId === boardFolderId) return true;
      if (note.folderId && isDescendantOfBoardFolder(note.folderId)) return true;

      return false;
    });
  }, [allNotes, existingNoteIds, boardFolderId, isDescendantOfBoardFolder]);

  // Apply search filter
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return availableNotes;

    const query = searchQuery.toLowerCase();
    return availableNotes.filter((note) =>
      note.title.toLowerCase().includes(query)
    );
  }, [availableNotes, searchQuery]);

  // Get folder name for display
  const getFolderPath = useCallback(
    (folderId: string | null): string | null => {
      if (!folderId) return null;

      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return null;

      // Build path from folder up to board folder
      const parts: string[] = [];
      let currentId: string | null = folderId;

      while (currentId && currentId !== boardFolderId) {
        const f = folders.find((folder) => folder.id === currentId);
        if (f) {
          parts.unshift(f.name);
          currentId = f.parentId;
        } else {
          break;
        }
      }

      return parts.length > 0 ? parts.join(" / ") : null;
    },
    [folders, boardFolderId]
  );

  const handleSelectNote = useCallback(
    (noteId: string) => {
      onAddNote(noteId);
      onClose();
    },
    [onAddNote, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      />

      {/* Modal */}
      <div
        className="relative flex max-h-[70vh] w-full max-w-lg flex-col rounded-lg border"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Add Note to Board
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b p-4" style={{ borderColor: "var(--color-border)" }}>
          <div
            className="flex items-center gap-2 rounded-md border px-3 py-2"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            <Search size={18} style={{ color: "var(--color-text-tertiary)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text-primary)" }}
              autoFocus
            />
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredNotes.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <FileText size={48} strokeWidth={1} />
              <p className="mt-2 text-sm">
                {searchQuery
                  ? "No matching notes found"
                  : "No notes available to add"}
              </p>
              <p className="mt-1 text-xs">
                Notes must be in this folder or its subfolders
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredNotes.map((note) => {
                const folderPath = getFolderPath(note.folderId);
                return (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note.id)}
                    className="flex items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <FileText
                      size={18}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: "var(--color-accent)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {note.title || "Untitled"}
                      </p>
                      {folderPath && (
                        <div
                          className="mt-0.5 flex items-center gap-1 text-xs"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          <FolderOpen size={12} />
                          <span className="truncate">{folderPath}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddCardModal;
