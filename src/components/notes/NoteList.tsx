import { useState } from "react";
import { FileText } from "lucide-react";
import { useNoteStore } from "../../stores/noteStore";
import { useFolderStore } from "../../stores/folderStore";
import { useEditorGroupStore, useActiveTab } from "../../stores/editorGroupStore";
import { NoteCard } from "./NoteCard";

/**
 * List of notes in the current view (all, unfiled, or folder)
 */
export function NoteList() {
  const { 
    notes, 
    isLoading, 
    deleteNote,
    viewMode,
    currentFolderId,
  } = useNoteStore();
  const { folders } = useFolderStore();
  const { openTab } = useEditorGroupStore();
  const activeTab = useActiveTab();
  const selectedNoteId = activeTab?.type === "note" ? activeTab.id : null;

  // Get the current view title
  const getCurrentTitle = () => {
    if (viewMode === "all") return "All Notes";
    if (viewMode === "unfiled") return "Unfiled";
    if (viewMode === "folder" && currentFolderId) {
      const folder = folders.find((f) => f.id === currentFolderId);
      return folder?.name || "Notes";
    }
    return "Notes";
  };

  // State for delete confirmation
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Handle note deletion - show inline confirmation
  const handleDelete = (noteId: string) => {
    setNoteToDelete(noteId);
  };

  // Confirm the deletion
  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await deleteNote(noteToDelete);
    } catch (error) {
      console.error("Failed to delete note:", error);
    } finally {
      setNoteToDelete(null);
    }
  };

  // Cancel the deletion
  const cancelDelete = () => {
    setNoteToDelete(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {getCurrentTitle()}
        </h2>
        <span
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div
            className="flex items-center justify-center p-8"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <div
              className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--color-accent)" }}
            />
            Loading...
          </div>
        ) : notes.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 p-8 text-center"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <FileText size={48} strokeWidth={1} />
            <div>
              <p className="font-medium">No notes yet</p>
              <p className="mt-1 text-sm">
                Click "New Note" to create your first note
              </p>
            </div>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onSelect={() => openTab({ type: "note", id: note.id })}
              onDelete={() => handleDelete(note.id)}
            />
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {noteToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={cancelDelete}
        >
          <div
            className="mx-4 max-w-sm rounded-lg p-6 shadow-lg"
            style={{ backgroundColor: "var(--color-bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="mb-2 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Delete Note?
            </h3>
            <p
              className="mb-4 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                className="cursor-pointer rounded px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)")
                }
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="cursor-pointer rounded px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-danger)",
                  color: "white",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-danger-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-danger)")
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
