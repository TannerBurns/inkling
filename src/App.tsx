import { useEffect } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { Sidebar } from "./components/layout/Sidebar";
import { SplitContainer } from "./components/editor/SplitContainer";
import { RightSidebar } from "./components/notes/RightSidebar";
import { SettingsModal } from "./components/settings/SettingsModal";
import { DragOverlay } from "./components/shared/DragOverlay";
import { VaultSetup } from "./components/setup/VaultSetup";
import { useNoteStore } from "./stores/noteStore";
import { useFolderStore } from "./stores/folderStore";
import { useChatStore } from "./stores/chatStore";
import { useVaultStore } from "./stores/vaultStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useDailyNotesStore } from "./stores/dailyNotesStore";
import { useActiveTab, useEditorGroupStore } from "./stores/editorGroupStore";
import { useRelatedNotes } from "./hooks/useRelatedNotes";
import { useBacklinks } from "./hooks/useBacklinks";
import { Loader2 } from "lucide-react";

function App() {
  const { fetchAllNotes, createNote } = useNoteStore();
  const { fetchFolders } = useFolderStore();
  const { toggleChat, toggleLeftPanel, toggleRightSidebar } = useChatStore();
  const { openSettings } = useSettingsStore();
  const { openTodayNote } = useDailyNotesStore();
  const { openTab } = useEditorGroupStore();
  const {
    isConfigured,
    isLoading: vaultLoading,
    checkVaultStatus,
  } = useVaultStore();

  // Get active tab from editor groups
  const activeTab = useActiveTab();
  const selectedNoteId = activeTab?.type === "note" ? activeTab.id : null;

  // Check vault status on app load
  useEffect(() => {
    checkVaultStatus();
  }, [checkVaultStatus]);

  // Related notes (semantic similarity)
  const {
    relatedNotes,
    isLoading: relatedNotesLoading,
    error: relatedNotesError,
  } = useRelatedNotes(selectedNoteId);

  // Backlinks (wiki-style links)
  const {
    backlinks,
    isLoading: backlinksLoading,
    error: backlinksError,
  } = useBacklinks(selectedNoteId);

  // Load initial data once vault is configured
  useEffect(() => {
    if (isConfigured) {
      fetchAllNotes();
      fetchFolders();
    }
  }, [isConfigured, fetchAllNotes, fetchFolders]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd/Ctrl+Shift+C: Toggle between Notes and Chat mode
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "c"
      ) {
        e.preventDefault();
        toggleChat();
      }
      // Cmd/Ctrl+[: Toggle left panel visibility
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault();
        toggleLeftPanel();
      }
      // Cmd/Ctrl+]: Toggle right sidebar visibility
      if ((e.metaKey || e.ctrlKey) && e.key === "]") {
        e.preventDefault();
        toggleRightSidebar();
      }
      // Cmd/Ctrl+N: New Note
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const newNote = await createNote("Untitled", null);
        if (newNote) {
          openTab({ type: "note", id: newNote.id });
        }
      }
      // Cmd/Ctrl+D: New Daily Note
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        openTodayNote();
      }
      // Cmd/Ctrl+,: Open Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
      // Cmd/Ctrl+G: Open Knowledge Graph
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        openTab({ type: "graph", id: "main" });
      }
      // Cmd/Ctrl+Shift+D: Open Calendar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        openTab({ type: "calendar", id: "main" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleChat, toggleLeftPanel, toggleRightSidebar, createNote, openTab, openTodayNote, openSettings]);

  // Show loading state while checking vault status
  if (vaultLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2
            size={32}
            className="animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
          <p style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show vault setup if not configured
  if (!isConfigured) {
    return <VaultSetup />;
  }

  // Main app layout
  return (
    <>
      <AppLayout
        sidebar={<Sidebar />}
        editor={<SplitContainer />}
        rightSidebar={
          <RightSidebar
            relatedNotes={relatedNotes}
            relatedNotesLoading={relatedNotesLoading}
            relatedNotesError={relatedNotesError}
            backlinks={backlinks}
            backlinksLoading={backlinksLoading}
            backlinksError={backlinksError}
          />
        }
      />
      <SettingsModal />
      <DragOverlay />
    </>
  );
}

export default App;
