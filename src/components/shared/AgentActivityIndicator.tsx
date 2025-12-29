import { useState, useEffect } from "react";
import {
  Bot,
  Tag,
  Brain,
  Sparkles,
  FileText,
  Search,
  X,
  Download,
  Sun,
  Database,
  Link,
  Clock,
  Check,
  AlertCircle,
  Trash2,
} from "lucide-react";
import {
  useAgentActivityStore,
  type AgentType,
  type PendingTaskInfo,
  type CompletedTask,
} from "../../stores/agentActivityStore";

function getAgentIcon(type: AgentType) {
  switch (type) {
    case "tagging":
      return Tag;
    case "embedding":
      return Brain;
    case "inline":
      return Sparkles;
    case "summarization":
      return FileText;
    case "research":
      return Search;
    case "export":
      return Download;
    case "assistant":
      return Sun;
    case "reindex":
      return Database;
    case "url_indexing":
      return Link;
    default:
      return Bot;
  }
}

function getAgentLabel(type: AgentType) {
  switch (type) {
    case "tagging":
      return "Auto-tagging";
    case "embedding":
      return "Embedding";
    case "inline":
      return "AI Assistant";
    case "summarization":
      return "Summarizing";
    case "research":
      return "Researching";
    case "export":
      return "Exporting";
    case "assistant":
      return "Daily Summary";
    case "reindex":
      return "Re-indexing";
    case "url_indexing":
      return "Indexing URL";
    default:
      return "Agent";
  }
}

function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatCompletedDuration(startedAt: number, completedAt: number): string {
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function AgentActivityIndicator() {
  const { runningAgents, getPendingTasks, getPendingCount, getCompletedTasks, clearCompletedTasks } =
    useAgentActivityStore();
  const [showPopover, setShowPopover] = useState(false);
  const [, setTick] = useState(0);

  const pendingTasks = getPendingTasks();
  const pendingCount = getPendingCount();
  const completedTasks = getCompletedTasks();
  const totalCount = runningAgents.length + pendingCount;

  // Update the timer display every second when popover is open
  useEffect(() => {
    if (!showPopover || runningAgents.length === 0) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [showPopover, runningAgents.length]);

  const isActive = totalCount > 0;

  return (
    <div className="relative">
      {/* Indicator Button - Always visible */}
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="relative flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
        title="Background Agents"
      >
        <Bot
          size={16}
          className={isActive ? "animate-pulse" : ""}
          style={{
            color: isActive
              ? "var(--color-accent)"
              : "var(--color-text-tertiary)",
          }}
        />
        {/* Badge - show total count (running + pending) */}
        {isActive && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {showPopover && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopover(false)}
          />

          {/* Content */}
          <div
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border shadow-lg"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Background Agents
              </span>
              <button
                onClick={() => setShowPopover(false)}
                className="rounded p-1 transition-colors hover:bg-black/10"
              >
                <X size={14} style={{ color: "var(--color-text-tertiary)" }} />
              </button>
            </div>

            {/* Agent List */}
            <div className="max-h-80 overflow-y-auto p-2">
              {totalCount === 0 && completedTasks.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-6 text-center"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  <Bot size={24} className="mb-2 opacity-50" />
                  <p className="text-sm">No agents running</p>
                  <p className="mt-1 text-xs">
                    Agents run automatically when you edit notes
                  </p>
                </div>
              ) : (
                <>
                  {/* Running agents */}
                  {runningAgents.map((agent) => {
                    const Icon = getAgentIcon(agent.type);
                    return (
                      <div
                        key={agent.id}
                        className="mb-1 flex items-start gap-3 rounded-lg p-2 last:mb-0"
                        style={{ backgroundColor: "var(--color-bg-secondary)" }}
                      >
                        <div
                          className="mt-0.5 rounded-lg p-1.5"
                          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                        >
                          <Icon
                            size={14}
                            className="animate-pulse"
                            style={{ color: "var(--color-accent)" }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {getAgentLabel(agent.type)}
                          </div>
                          {agent.description && (
                            <div
                              className="truncate text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {agent.description}
                            </div>
                          )}
                          {agent.noteTitle && !agent.description && (
                            <div
                              className="truncate text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {agent.noteTitle}
                            </div>
                          )}
                          <div
                            className="mt-1 text-xs"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            Running for {formatDuration(agent.startedAt)}
                          </div>
                        </div>
                        {/* Spinner */}
                        <div className="mt-1">
                          <div
                            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                            style={{
                              borderColor: "var(--color-accent)",
                              borderTopColor: "transparent",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Pending/Queued tasks */}
                  {pendingTasks.map((task: PendingTaskInfo) => {
                    const Icon = getAgentIcon(task.agent.type);
                    return (
                      <div
                        key={task.id}
                        className="mb-1 flex items-start gap-3 rounded-lg p-2 opacity-60 last:mb-0"
                        style={{ backgroundColor: "var(--color-bg-secondary)" }}
                      >
                        <div
                          className="mt-0.5 rounded-lg p-1.5"
                          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                        >
                          <Icon
                            size={14}
                            style={{ color: "var(--color-text-tertiary)" }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {getAgentLabel(task.agent.type)}
                          </div>
                          {task.agent.description && (
                            <div
                              className="truncate text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {task.agent.description}
                            </div>
                          )}
                          {task.agent.noteTitle && !task.agent.description && (
                            <div
                              className="truncate text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {task.agent.noteTitle}
                            </div>
                          )}
                          <div
                            className="mt-1 flex items-center gap-1 text-xs"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            <Clock size={10} />
                            Queued
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Completed tasks section */}
                  {completedTasks.length > 0 && (
                    <>
                      {/* Separator with header */}
                      <div
                        className="my-2 flex items-center justify-between border-t pt-2"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          Recent
                        </span>
                        <button
                          onClick={clearCompletedTasks}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-black/10"
                          style={{ color: "var(--color-text-tertiary)" }}
                          title="Clear history"
                        >
                          <Trash2 size={10} />
                          Clear
                        </button>
                      </div>

                      {/* Completed task list */}
                      {completedTasks.map((task: CompletedTask) => {
                        const Icon = getAgentIcon(task.type);
                        return (
                          <div
                            key={`${task.id}-${task.completedAt}`}
                            className="mb-1 flex items-start gap-3 rounded-lg p-2 opacity-50 last:mb-0"
                            style={{ backgroundColor: "var(--color-bg-secondary)" }}
                          >
                            <div
                              className="mt-0.5 rounded-lg p-1.5"
                              style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                            >
                              <Icon
                                size={14}
                                style={{ color: "var(--color-text-tertiary)" }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-sm font-medium"
                                style={{ color: "var(--color-text-primary)" }}
                              >
                                {getAgentLabel(task.type)}
                              </div>
                              {task.description && (
                                <div
                                  className="truncate text-xs"
                                  style={{ color: "var(--color-text-tertiary)" }}
                                >
                                  {task.description}
                                </div>
                              )}
                              {task.noteTitle && !task.description && (
                                <div
                                  className="truncate text-xs"
                                  style={{ color: "var(--color-text-tertiary)" }}
                                >
                                  {task.noteTitle}
                                </div>
                              )}
                              <div
                                className="mt-1 flex items-center gap-1 text-xs"
                                style={{ color: "var(--color-text-tertiary)" }}
                              >
                                {task.success ? (
                                  <>
                                    <Check size={10} style={{ color: "var(--color-success, #22c55e)" }} />
                                    Completed in {formatCompletedDuration(task.startedAt, task.completedAt)}
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle size={10} style={{ color: "var(--color-error, #ef4444)" }} />
                                    Failed
                                  </>
                                )}
                              </div>
                            </div>
                            {/* Status icon */}
                            <div className="mt-1">
                              {task.success ? (
                                <Check
                                  size={14}
                                  style={{ color: "var(--color-success, #22c55e)" }}
                                />
                              ) : (
                                <AlertCircle
                                  size={14}
                                  style={{ color: "var(--color-error, #ef4444)" }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
