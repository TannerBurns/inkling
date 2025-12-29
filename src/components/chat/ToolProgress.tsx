import { useState, useMemo } from "react";
import {
  Search,
  FileText,
  Link2,
  Globe,
  Link,
  FileDown,
  Loader2,
  Check,
  X,
  Wrench,
  ChevronDown,
  ChevronRight,
  Calendar,
  FolderOpen,
  Tag,
  FilePlus,
  Clock,
} from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import type { ToolCallRecord } from "../../types/chat";

/** Map tool names to display info */
const TOOL_INFO: Record<
  string,
  { icon: typeof Search; label: string; verb: string }
> = {
  search_notes: {
    icon: Search,
    label: "Note Search",
    verb: "Searching notes",
  },
  search_url_embeddings: {
    icon: Globe,
    label: "URL Search",
    verb: "Searching web content",
  },
  read_note: {
    icon: FileText,
    label: "Read Note",
    verb: "Reading note",
  },
  get_note_links: {
    icon: Link2,
    label: "Note Links",
    verb: "Getting links",
  },
  read_url_content: {
    icon: Link,
    label: "Read URL",
    verb: "Reading URL content",
  },
  web_search: {
    icon: Globe,
    label: "Web Search",
    verb: "Searching the web",
  },
  export_notes_pdf: {
    icon: FileDown,
    label: "Export PDF",
    verb: "Exporting to PDF",
  },
  export_notes_docx: {
    icon: FileDown,
    label: "Export Word",
    verb: "Exporting to Word",
  },
  export_selection_xlsx: {
    icon: FileDown,
    label: "Export Excel",
    verb: "Exporting to Excel",
  },
  get_calendar_events: {
    icon: Calendar,
    label: "Calendar Events",
    verb: "Getting calendar events",
  },
  create_calendar_event: {
    icon: Calendar,
    label: "Create Event",
    verb: "Creating calendar event",
  },
  get_daily_note: {
    icon: Clock,
    label: "Daily Note",
    verb: "Getting daily note",
  },
  get_recent_notes: {
    icon: Clock,
    label: "Recent Notes",
    verb: "Getting recent notes",
  },
  list_folders: {
    icon: FolderOpen,
    label: "List Folders",
    verb: "Listing folders",
  },
  get_notes_in_folder: {
    icon: FolderOpen,
    label: "Folder Notes",
    verb: "Getting notes in folder",
  },
  get_note_tags: {
    icon: Tag,
    label: "Note Tags",
    verb: "Getting note tags",
  },
  search_by_tag: {
    icon: Tag,
    label: "Search by Tag",
    verb: "Searching by tag",
  },
  get_related_notes: {
    icon: Link2,
    label: "Related Notes",
    verb: "Finding related notes",
  },
  create_note: {
    icon: FilePlus,
    label: "Create Note",
    verb: "Creating note",
  },
};

/** Get display info for a tool */
function getToolInfo(toolName: string) {
  return (
    TOOL_INFO[toolName] ?? {
      icon: Wrench,
      label: toolName.replace(/_/g, " "),
      verb: `Using ${toolName.replace(/_/g, " ")}`,
    }
  );
}

/** Format args for display */
function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/** Get a brief summary of args for inline display */
function getArgsSummary(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  
  // Try to get the most relevant arg value for display
  const primaryKeys = ["query", "title", "note_id", "note_title", "tag", "folder_id", "url"];
  for (const key of primaryKeys) {
    if (args[key] && typeof args[key] === "string") {
      const value = args[key] as string;
      return value.length > 30 ? `${value.slice(0, 30)}...` : value;
    }
  }
  
  // Fallback to first string value
  for (const key of keys) {
    if (typeof args[key] === "string") {
      const value = args[key] as string;
      return value.length > 30 ? `${value.slice(0, 30)}...` : value;
    }
  }
  
  return `${keys.length} args`;
}

interface ToolProgressProps {
  /** Tool calls to display (for persisted mode) */
  toolCalls?: ToolCallRecord[];
  /** Whether this is during active streaming */
  isLive?: boolean;
}

/**
 * Displays tool calls as a collapsible summary.
 * 
 * In live mode: reads from store and shows active spinners
 * In persisted mode: displays the provided toolCalls array
 */
export function ToolProgress({ toolCalls, isLive = false }: ToolProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  
  // Get live tool state from store when in live mode
  const storeActiveToolCalls = useChatStore((state) => state.activeToolCalls);
  const storeToolResults = useChatStore((state) => state.toolResults);
  const storeIsStreaming = useChatStore((state) => state.isStreaming);

  // Determine which data source to use - memoized to avoid dependency issues
  const activeToolCalls = useMemo(
    () => (isLive ? storeActiveToolCalls : []),
    [isLive, storeActiveToolCalls]
  );
  const completedToolCalls = useMemo(
    () => (isLive ? storeToolResults : (toolCalls ?? [])),
    [isLive, storeToolResults, toolCalls]
  );
  const isCurrentlyStreaming = isLive && storeIsStreaming;

  // Combine for counting
  const totalCount = activeToolCalls.length + completedToolCalls.length;
  const successCount = completedToolCalls.filter(tc => tc.success).length;
  const failureCount = completedToolCalls.filter(tc => !tc.success).length;

  // Toggle individual tool expansion
  const toggleTool = (key: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Generate summary text
  const summaryText = useMemo(() => {
    if (activeToolCalls.length > 0) {
      const activeInfo = getToolInfo(activeToolCalls[0].tool);
      if (activeToolCalls.length === 1 && completedToolCalls.length === 0) {
        return `${activeInfo.verb}...`;
      }
      return `${activeInfo.verb}... (+${completedToolCalls.length} completed)`;
    }
    
    if (totalCount === 0) return "";
    if (totalCount === 1) {
      const tc = completedToolCalls[0];
      const info = getToolInfo(tc.tool);
      return `Used ${info.label}`;
    }
    return `Used ${totalCount} tools`;
  }, [activeToolCalls, completedToolCalls, totalCount]);

  // Don't render if nothing to show
  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      className="rounded-lg border text-sm"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{ borderRadius: isExpanded ? "8px 8px 0 0" : "8px" }}
      >
        <div className="flex items-center gap-2">
          {/* Icon: spinner if active, wrench if complete */}
          {isCurrentlyStreaming && activeToolCalls.length > 0 ? (
            <Loader2
              className="animate-spin"
              size={14}
              style={{ color: "var(--color-accent)" }}
            />
          ) : (
            <Wrench size={14} style={{ color: "var(--color-text-secondary)" }} />
          )}
          
          {/* Summary text */}
          <span style={{ color: "var(--color-text-primary)" }}>
            {summaryText}
          </span>
          
          {/* Success/failure indicators */}
          {!isCurrentlyStreaming && completedToolCalls.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              {successCount > 0 && (
                <span
                  className="flex items-center gap-0.5 text-xs"
                  style={{ color: "var(--color-success)" }}
                >
                  <Check size={12} />
                  {successCount}
                </span>
              )}
              {failureCount > 0 && (
                <span
                  className="flex items-center gap-0.5 text-xs"
                  style={{ color: "var(--color-error)" }}
                >
                  <X size={12} />
                  {failureCount}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--color-text-tertiary)" }} />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="border-t px-2 py-2 space-y-1"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* Active tool calls (with spinner) */}
          {activeToolCalls.map((tc, i) => {
            const key = `active-${i}`;
            const info = getToolInfo(tc.tool);
            const ToolIcon = info.icon;
            const isToolExpanded = expandedTools.has(key);
            const hasArgs = tc.args && Object.keys(tc.args).length > 0;
            
            return (
              <div key={key} className="rounded" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                <button
                  onClick={() => hasArgs && toggleTool(key)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm ${hasArgs ? "cursor-pointer hover:bg-[var(--color-bg-hover)]" : "cursor-default"}`}
                  style={{ borderRadius: "4px" }}
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: "var(--color-accent-light)",
                      color: "var(--color-accent)",
                    }}
                  >
                    <Loader2 className="animate-spin" size={12} />
                  </div>
                  <ToolIcon size={12} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                  <span className="flex-1 text-left" style={{ color: "var(--color-text-primary)" }}>
                    {info.verb}...
                  </span>
                  {hasArgs && (
                    <span className="text-xs truncate max-w-[120px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {getArgsSummary(tc.args)}
                    </span>
                  )}
                  {hasArgs && (
                    isToolExpanded ? (
                      <ChevronDown size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    ) : (
                      <ChevronRight size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    )
                  )}
                </button>
                
                {/* Expanded args - full content, no truncation */}
                {isToolExpanded && hasArgs && (
                  <div
                    className="mx-2 mb-2 rounded p-2 text-xs font-mono overflow-x-auto"
                    style={{
                      backgroundColor: "var(--color-bg-primary)",
                      color: "var(--color-text-secondary)",
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    <div className="text-xs font-sans mb-1" style={{ color: "var(--color-text-tertiary)" }}>
                      Arguments:
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-xs">
                      {formatArgs(tc.args)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {/* Completed tool calls */}
          {completedToolCalls.map((tc, i) => {
            const key = `result-${i}`;
            const info = getToolInfo(tc.tool);
            const ToolIcon = info.icon;
            const StatusIcon = tc.success ? Check : X;
            const isToolExpanded = expandedTools.has(key);
            const hasDetails = tc.preview && tc.preview.length > 0;
            
            return (
              <div key={key} className="rounded" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                <button
                  onClick={() => hasDetails && toggleTool(key)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm ${hasDetails ? "cursor-pointer hover:bg-[var(--color-bg-hover)]" : "cursor-default"}`}
                  style={{ borderRadius: "4px" }}
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: tc.success
                        ? "var(--color-success-light)"
                        : "var(--color-error-light)",
                      color: tc.success
                        ? "var(--color-success)"
                        : "var(--color-error)",
                    }}
                  >
                    <StatusIcon size={12} />
                  </div>
                  <ToolIcon size={12} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                  <span className="flex-1 text-left" style={{ color: "var(--color-text-secondary)" }}>
                    {info.label}
                  </span>
                  {tc.preview && (
                    <span
                      className="text-xs truncate max-w-[150px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {tc.preview.length > 40 ? `${tc.preview.slice(0, 40)}...` : tc.preview}
                    </span>
                  )}
                  {hasDetails && (
                    isToolExpanded ? (
                      <ChevronDown size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    ) : (
                      <ChevronRight size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    )
                  )}
                </button>
                
                {/* Expanded result/error content - full content, no truncation */}
                {isToolExpanded && hasDetails && (
                  <div
                    className="mx-2 mb-2 rounded p-2 text-xs overflow-x-auto"
                    style={{
                      backgroundColor: tc.success ? "var(--color-bg-primary)" : "var(--color-error-light)",
                      color: tc.success ? "var(--color-text-secondary)" : "var(--color-error)",
                      maxHeight: "400px",
                      overflowY: "auto",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                        {tc.success ? "Result:" : "Error:"} ({tc.preview?.length ?? 0} chars)
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                      {tc.preview}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ToolProgress;
