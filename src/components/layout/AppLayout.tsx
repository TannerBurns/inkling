import { ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { HeaderSearch } from "./HeaderSearch";
import { AgentActivityIndicator } from "../shared/AgentActivityIndicator";

interface AppLayoutProps {
  sidebar: ReactNode;
  editor: ReactNode;
  rightSidebar?: ReactNode;
}

const MIN_RIGHT_SIDEBAR_WIDTH = 280;
const MAX_RIGHT_SIDEBAR_WIDTH = 600;
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 320;

/**
 * Main layout for the application
 * - Header: App title, search, and panel controls
 * - Sidebar: Folder/note tree navigation and app actions
 * - Editor: Note content editor with tabs
 * - Right Sidebar (optional): Related notes, backlinks, chat
 */
export function AppLayout({ sidebar, editor, rightSidebar }: AppLayoutProps) {
  const { 
    isLeftPanelVisible, 
    isRightSidebarVisible, 
    toggleLeftPanel, 
    toggleRightSidebar 
  } = useChatStore();
  
  const {
    isEditorToolbarVisible,
    toggleEditorToolbar
  } = useSettingsStore();
  
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("inkling-right-sidebar-width");
    return saved ? parseInt(saved, 10) : DEFAULT_RIGHT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("inkling-right-sidebar-width", String(rightSidebarWidth));
  }, [rightSidebarWidth]);

  // Handle window dragging
  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    // Only start drag if clicking on the header itself, not interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (target.closest('input')) return;
    if (target.closest('[data-no-drag]')) return;
    
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.min(
        Math.max(newWidth, MIN_RIGHT_SIDEBAR_WIDTH),
        MAX_RIGHT_SIDEBAR_WIDTH
      );
      setRightSidebarWidth(clampedWidth);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners when resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Keyboard shortcut for search (Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchFocused(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Header Bar */}
      <header
        ref={headerRef}
        onMouseDown={handleDragStart}
        className="flex h-11 flex-shrink-0 cursor-default items-center gap-4 border-b px-3"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Left side - macOS traffic lights spacing + logo */}
        <div className="flex items-center gap-2 flex-shrink-0 pointer-events-none select-none">
          {/* Spacer for macOS traffic lights */}
          <div className="w-16" />
          <img
            src="/inkling.png"
            alt="Inkling"
            className="h-6 w-auto"
            draggable={false}
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Inkling
          </span>
        </div>

        {/* Center - Search (flexible width) */}
        <div className="flex flex-1 justify-center pointer-events-none px-4">
          <div className="w-full max-w-2xl pointer-events-auto" data-no-drag>
            <HeaderSearch 
              isOpen={isSearchFocused} 
              onClose={() => setIsSearchFocused(false)} 
            />
          </div>
        </div>

        {/* Right side - Agent activity & Panel toggles */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Agent Activity Indicator */}
          <AgentActivityIndicator />
          
          {/* Left panel toggle */}
          <button
            onClick={toggleLeftPanel}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{
              color: isLeftPanelVisible
                ? "var(--color-text-primary)"
                : "var(--color-text-tertiary)",
            }}
            title={isLeftPanelVisible ? "Hide left panel (⌘[)" : "Show left panel (⌘[)"}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 4h18v16H3V4z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 4v16"
              />
            </svg>
          </button>

          {/* Editor toolbar toggle */}
          <button
            onClick={toggleEditorToolbar}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{
              color: isEditorToolbarVisible
                ? "var(--color-text-primary)"
                : "var(--color-text-tertiary)",
            }}
            title={isEditorToolbarVisible ? "Hide formatting toolbar" : "Show formatting toolbar"}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 4h18v16H3V4z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 9h18"
              />
            </svg>
          </button>

          {/* Right panel toggle */}
          {rightSidebar && (
            <button
              onClick={toggleRightSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{
                color: isRightSidebarVisible
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              }}
              title={isRightSidebarVisible ? "Hide right panel (⌘])" : "Show right panel (⌘])"}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 4h18v16H3V4z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 4v16"
                />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar - Folder/Note Tree */}
        {isLeftPanelVisible && (
          <aside
            className="flex h-full flex-shrink-0 flex-col border-r"
            style={{
              width: "var(--sidebar-width)",
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            {sidebar}
          </aside>
        )}

        {/* Editor */}
        <main
          className="flex h-full min-w-0 flex-1 flex-col"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        >
          {editor}
        </main>

        {/* Right Sidebar (optional, resizable) */}
        {rightSidebar && isRightSidebarVisible && (
          <aside
            ref={resizeRef}
            className="relative flex h-full flex-shrink-0 flex-col overflow-hidden border-l"
            style={{
              width: rightSidebarWidth,
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--color-accent)]"
              style={{
                backgroundColor: isResizing ? "var(--color-accent)" : "transparent",
              }}
            />
            {rightSidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
