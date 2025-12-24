import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  Calendar,
  CalendarDays,
  Quote,
  FileText,
  MessageSquare,
  RefreshCw,
  Loader2,
  Sun,
  Moon,
  Sunrise,
  Clock,
  Kanban,
  NotebookPen,
} from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useNoteStore } from "../../stores/noteStore";
import { useChatStore } from "../../stores/chatStore";
import { useFolderStore } from "../../stores/folderStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";
import { useBoardStore } from "../../stores/boardStore";
import { useDailyNotesStore } from "../../stores/dailyNotesStore";
import {
  generateAssistantContent,
  getAssistantFallback,
  type AssistantContentResponse,
  type CalendarEventSummary,
} from "../../lib/assistant";
import { formatConversationTime } from "../../lib/chat";

// ============================================================================
// Caching utilities
// ============================================================================

const CACHE_KEY = "inkling-assistant-content";

interface CachedContent {
  date: string;
  content: AssistantContentResponse;
  eventCount: number;
}

function getCachedContent(): CachedContent | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function setCachedContent(date: string, content: AssistantContentResponse, eventCount: number): void {
  try {
    const cached: CachedContent = { date, content, eventCount };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format relative time for notes
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Get the appropriate greeting icon based on time
 */
function getGreetingIcon(): React.ReactNode {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return <Sunrise size={20} style={{ color: "var(--color-warning)" }} />;
  }
  if (hour >= 12 && hour < 18) {
    return <Sun size={20} style={{ color: "var(--color-warning)" }} />;
  }
  return <Moon size={20} style={{ color: "var(--color-info)" }} />;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * The Assistant Panel - a personalized dashboard in the right sidebar
 */
export function AssistantPanel() {
  const [content, setContent] = useState<AssistantContentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get today's events from calendar store
  const { getEventsForDate, fetchEventsForRange } = useCalendarStore();
  const today = new Date();
  const allTodayEvents = getEventsForDate(today);
  
  // Filter out declined events (from Google Calendar)
  const todayEvents = useMemo(() => {
    return allTodayEvents.filter((e) => e.responseStatus !== "declined");
  }, [allTodayEvents]);

  // Get recent notes
  const { notes } = useNoteStore();
  const { folders } = useFolderStore();
  const { openTab } = useEditorGroupStore();
  
  // Get boards
  const { boards, fetchAllBoards } = useBoardStore();
  
  // Get daily notes store for quick action
  const { openTodayNote } = useDailyNotesStore();

  // Get recent conversations - also fetch on mount to fix race condition
  const { conversationPreviews, selectConversation, setRightSidebarMode, fetchConversations } =
    useChatStore();

  // Get the Daily Notes folder to exclude daily notes from recent
  const dailyNotesFolder = useMemo(
    () => folders.find((f) => f.name === "Daily Notes" && f.parentId === null),
    [folders]
  );

  // Get 3 most recent notes (excluding daily notes)
  const recentNotes = useMemo(() => {
    return notes
      .filter((n) => !n.isDeleted && n.folderId !== dailyNotesFolder?.id)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 3);
  }, [notes, dailyNotesFolder?.id]);

  // Get 3 most recent conversations
  const recentChats = useMemo(() => {
    return conversationPreviews.slice(0, 3);
  }, [conversationPreviews]);
  
  // Get 3 most recent boards
  const recentBoards = useMemo(() => {
    return [...boards]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 3);
  }, [boards]);

  // Fetch today's events, conversations, and boards on mount
  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    fetchEventsForRange(start, end, true);
    
    // Fetch conversations and boards to fix race condition
    fetchConversations();
    fetchAllBoards();
  }, [fetchEventsForRange, fetchConversations, fetchAllBoards]);

  // Load cached content on mount (sync, no loading state)
  useEffect(() => {
    const todayStr = getTodayString();
    const cached = getCachedContent();
    if (cached && cached.date === todayStr) {
      console.log("[Assistant] Loaded cached content for", todayStr);
      setContent(cached.content);
      setIsLoading(false);
    }
  }, []);

  // Generate assistant content with caching
  const loadContent = useCallback(async (forceRefresh = false) => {
    const todayStr = getTodayString();
    
    // Check cache first (unless forcing refresh)
    // If we have content for today and event count matches, skip regeneration
    if (!forceRefresh) {
      const cached = getCachedContent();
      if (cached && cached.date === todayStr && cached.eventCount === todayEvents.length) {
        // Already have valid cached content, no need to regenerate
        if (!content) {
          setContent(cached.content);
        }
        setIsLoading(false);
        return;
      }
    }
    
    // Only show full loading state if we have NO content yet (initial load)
    // Otherwise, just show the refresh spinner
    if (forceRefresh || content) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Prepare event summaries for the API (already filtered for declined)
      const eventSummaries: CalendarEventSummary[] = todayEvents.map((e) => ({
        title: e.title,
        startTime: formatEventTime(e.startTime),
        endTime: e.endTime ? formatEventTime(e.endTime) : null,
        allDay: e.allDay,
        eventType: e.eventType || null,
        meetingLink: e.meetingLink || null,
      }));

      const input = {
        date: todayStr,
        events: eventSummaries,
      };

      let result: AssistantContentResponse;
      try {
        // Try AI-powered content first
        result = await generateAssistantContent(input);
      } catch {
        // Fallback to non-AI content
        console.log("[Assistant] AI generation failed, using fallback");
        result = await getAssistantFallback(input);
      }
      
      // Cache the result
      setCachedContent(todayStr, result, todayEvents.length);
      setContent(result);
    } catch (err) {
      // Only set error if we have no content to show
      if (!content) {
        setError(String(err));
      } else {
        console.error("[Assistant] Background refresh failed:", err);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [todayEvents, content]);

  // Load content on mount
  useEffect(() => {
    // Only load if we don't have content yet or need to refresh for new events
    const todayStr = getTodayString();
    const cached = getCachedContent();
    const needsRefresh = !cached || cached.date !== todayStr || cached.eventCount !== todayEvents.length;
    
    if (needsRefresh) {
      loadContent();
    } else {
      setIsLoading(false);
    }
    // Only run when event count changes, not on every loadContent change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEvents.length]);

  const handleRefresh = () => {
    loadContent(true);
  };

  const handleOpenNote = (noteId: string) => {
    openTab({ type: "note", id: noteId });
  };

  const handleOpenChat = (conversationId: string) => {
    selectConversation(conversationId);
    setRightSidebarMode("chat");
  };
  
  const handleOpenBoard = (boardId: string) => {
    openTab({ type: "board", id: boardId });
  };
  
  const handleOpenDailyNote = async () => {
    try {
      await openTodayNote();
    } catch (err) {
      console.error("Failed to open today's note:", err);
    }
  };
  
  const handleOpenCalendar = () => {
    openTab({ type: "calendar", id: "calendar" });
  };

  // Only show full loading state if we have NO content yet
  if (isLoading && !content) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
          <span
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Preparing your day...
          </span>
        </div>
      </div>
    );
  }

  // Only show full error state if we have NO content
  if (error && !content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <div
          className="text-center text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {error}
        </div>
        <button
          onClick={() => loadContent()}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
          }}
        >
          <RefreshCw size={14} />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Greeting Section */}
      <div
        className="border-b px-4 py-5"
        style={{
          borderColor: "var(--color-border)",
          background:
            "linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-tertiary) 100%)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {getGreetingIcon()}
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {content?.greeting || "Hello!"}
              </h2>
              <p
                className="mt-0.5 text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* Quick Actions Section */}
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenDailyNote}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
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
            <NotebookPen size={14} style={{ color: "var(--color-accent)" }} />
            Daily Note
          </button>
          <button
            onClick={handleOpenCalendar}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
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
            <CalendarDays size={14} style={{ color: "var(--color-info)" }} />
            Calendar
          </button>
        </div>
      </div>

      {/* Day Summary Section */}
      <div
        className="border-b px-4 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} style={{ color: "var(--color-accent)" }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Today&apos;s Schedule
          </h3>
          {todayEvents.length > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-text-inverse)",
              }}
            >
              {todayEvents.length}
            </span>
          )}
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-text-primary)" }}
        >
          {content?.daySummary || "Your schedule is clear today."}
        </p>

        {/* Quick event list */}
        {todayEvents.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {todayEvents.slice(0, 3).map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                style={{ backgroundColor: "var(--color-bg-tertiary)" }}
              >
                <Clock
                  size={12}
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {event.allDay ? "All day" : formatEventTime(event.startTime)}
                </span>
                <span
                  className="truncate font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {event.title}
                </span>
              </div>
            ))}
            {todayEvents.length > 3 && (
              <p
                className="pl-2 text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                +{todayEvents.length - 3} more event
                {todayEvents.length - 3 > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Motivation Quote Section */}
      <div
        className="border-b px-4 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Quote size={14} style={{ color: "var(--color-success)" }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Daily Inspiration
          </h3>
        </div>
        <blockquote
          className="border-l-2 pl-3 text-sm italic leading-relaxed"
          style={{
            borderColor: "var(--color-success)",
            color: "var(--color-text-primary)",
          }}
        >
          &ldquo;{content?.quote}&rdquo;
        </blockquote>
        <p
          className="mt-2 text-xs font-medium"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          — {content?.quoteAuthor}
        </p>
      </div>

      {/* Jump Back Into Notes Section */}
      <div
        className="border-b px-4 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} style={{ color: "var(--color-warning)" }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Recent Notes
          </h3>
        </div>
        {recentNotes.length === 0 ? (
          <p
            className="text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No recent notes yet
          </p>
        ) : (
          <div className="space-y-1">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleOpenNote(note.id)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <FileText
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <span
                  className="flex-1 truncate text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {note.title || "Untitled"}
                </span>
                <span
                  className="flex-shrink-0 text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {formatRelativeTime(note.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Jump Back Into Boards Section */}
      {recentBoards.length > 0 && (
        <div
          className="border-b px-4 py-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Kanban size={14} style={{ color: "var(--color-success)" }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recent Boards
            </h3>
          </div>
          <div className="space-y-1">
            {recentBoards.map((board) => (
              <button
                key={board.id}
                onClick={() => handleOpenBoard(board.id)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Kanban
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <span
                  className="flex-1 truncate text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {board.name}
                </span>
                <span
                  className="flex-shrink-0 text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {formatRelativeTime(board.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Jump Back Into Conversations Section */}
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} style={{ color: "var(--color-info)" }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Recent Chats
          </h3>
        </div>
        {recentChats.length === 0 ? (
          <p
            className="text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No conversations yet
          </p>
        ) : (
          <div className="space-y-1">
            {recentChats.map((preview) => (
              <button
                key={preview.conversation.id}
                onClick={() => handleOpenChat(preview.conversation.id)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <MessageSquare
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <span
                  className="flex-1 truncate text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {preview.conversation.title || "New Chat"}
                </span>
                <span
                  className="flex-shrink-0 text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {formatConversationTime(preview.conversation.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Inkling branding */}
      <div className="mt-auto px-4 py-4">
        <div
          className="flex items-center justify-center gap-2 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <Sparkles size={12} />
          <span>Powered by Inkling</span>
        </div>
      </div>
    </div>
  );
}

export default AssistantPanel;

