import { create } from "zustand";

/** All supported agent types */
export type AgentType =
  | "tagging"
  | "inline"
  | "embedding"
  | "summarization"
  | "deepResearch"
  | "export"
  | "url_indexing"
  | "assistant"
  | "reindex";

export interface RunningAgent {
  id: string;
  type: AgentType;
  noteId?: string;
  noteTitle?: string;
  /** For export agents, describes what's being exported */
  description?: string;
  startedAt: number;
}

/** A task waiting in the queue */
export interface QueuedTask {
  id: string;
  agent: Omit<RunningAgent, "startedAt">;
  executor: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** A pending task for display purposes (without internal promise handlers) */
export interface PendingTaskInfo {
  id: string;
  agent: Omit<RunningAgent, "startedAt">;
}

/** A completed task for history display */
export interface CompletedTask {
  id: string;
  type: AgentType;
  noteTitle?: string;
  description?: string;
  startedAt: number;
  completedAt: number;
  success: boolean;
  error?: string;
}

/** Maximum number of completed tasks to keep in history */
const MAX_COMPLETED_TASKS = 10;

interface AgentActivityState {
  /** Currently running agent (max 1 at a time with queue system) */
  runningAgents: RunningAgent[];
  /** Tasks waiting to run */
  pendingTasks: QueuedTask[];
  /** Recently completed tasks (most recent first) */
  completedTasks: CompletedTask[];

  // Queue-based actions (preferred)
  /**
   * Queue a task to run. If no task is running, it starts immediately.
   * Otherwise, it waits in the queue until previous tasks complete.
   * Returns a promise that resolves when the task completes.
   */
  queueTask: (
    agent: Omit<RunningAgent, "startedAt">,
    executor: () => Promise<void>
  ) => Promise<void>;

  // Legacy actions (kept for backward compatibility during migration)
  startAgent: (agent: Omit<RunningAgent, "startedAt">) => void;
  stopAgent: (id: string) => void;
  updateAgentDescription: (id: string, description: string) => void;
  clearAll: () => void;
  clearCompletedTasks: () => void;

  // Selectors
  isAnyAgentRunning: () => boolean;
  getAgentsByType: (type: AgentType) => RunningAgent[];
  getPendingTasks: () => PendingTaskInfo[];
  getPendingCount: () => number;
  getCompletedTasks: () => CompletedTask[];
  
  // Deduplication helpers
  hasPendingTaskForNote: (type: AgentType, noteId: string) => boolean;
  hasRunningTaskForNote: (type: AgentType, noteId: string) => boolean;
  removePendingTaskForNote: (type: AgentType, noteId: string) => void;
}

/** Internal function to process the next task in the queue */
function processNextTask(
  get: () => AgentActivityState,
  set: (partial: Partial<AgentActivityState> | ((state: AgentActivityState) => Partial<AgentActivityState>)) => void
) {
  const state = get();
  
  // If there's already a running agent, don't start another
  if (state.runningAgents.length > 0) {
    return;
  }

  // Get the next pending task
  const nextTask = state.pendingTasks[0];
  if (!nextTask) {
    return;
  }

  // Remove from pending and add to running
  const startedAt = Date.now();
  set((s) => ({
    pendingTasks: s.pendingTasks.slice(1),
    runningAgents: [
      ...s.runningAgents,
      { ...nextTask.agent, startedAt },
    ],
  }));

  // Track success/error for completed task recording
  let taskSuccess = true;
  let taskError: string | undefined;

  // Execute the task
  nextTask
    .executor()
    .then(() => {
      taskSuccess = true;
      nextTask.resolve();
    })
    .catch((error) => {
      taskSuccess = false;
      taskError = error instanceof Error ? error.message : String(error);
      nextTask.reject(error instanceof Error ? error : new Error(String(error)));
    })
    .finally(() => {
      const completedAt = Date.now();
      
      // Record the completed task and remove from running agents
      set((s) => {
        const runningAgent = s.runningAgents.find((a) => a.id === nextTask.id);
        const completedTask: CompletedTask = {
          id: nextTask.id,
          type: nextTask.agent.type,
          noteTitle: nextTask.agent.noteTitle,
          description: nextTask.agent.description,
          startedAt: runningAgent?.startedAt ?? startedAt,
          completedAt,
          success: taskSuccess,
          error: taskError,
        };
        
        return {
          runningAgents: s.runningAgents.filter((a) => a.id !== nextTask.id),
          // Add to front, keep only the last N
          completedTasks: [completedTask, ...s.completedTasks].slice(0, MAX_COMPLETED_TASKS),
        };
      });
      
      // Process next task
      processNextTask(get, set);
    });
}

export const useAgentActivityStore = create<AgentActivityState>((set, get) => ({
  runningAgents: [],
  pendingTasks: [],
  completedTasks: [],

  queueTask: (agent, executor) => {
    return new Promise<void>((resolve, reject) => {
      const task: QueuedTask = {
        id: agent.id,
        agent,
        executor,
        resolve,
        reject,
      };

      // Add to pending queue
      set((state) => ({
        pendingTasks: [...state.pendingTasks, task],
      }));

      // Try to process (will start if nothing is running)
      processNextTask(get, set);
    });
  },

  // Legacy: direct start (bypasses queue - use queueTask instead)
  startAgent: (agent) => {
    set((state) => ({
      runningAgents: [
        ...state.runningAgents,
        { ...agent, startedAt: Date.now() },
      ],
    }));
  },

  // Legacy: direct stop (use with startAgent only)
  stopAgent: (id) => {
    set((state) => ({
      runningAgents: state.runningAgents.filter((a) => a.id !== id),
    }));
  },

  updateAgentDescription: (id, description) => {
    set((state) => ({
      runningAgents: state.runningAgents.map((a) =>
        a.id === id ? { ...a, description } : a
      ),
    }));
  },

  clearAll: () => {
    // Reject all pending tasks
    const pending = get().pendingTasks;
    pending.forEach((task) => {
      task.reject(new Error("All tasks cleared"));
    });
    set({ runningAgents: [], pendingTasks: [] });
  },

  clearCompletedTasks: () => {
    set({ completedTasks: [] });
  },

  isAnyAgentRunning: () => {
    return get().runningAgents.length > 0;
  },

  getAgentsByType: (type) => {
    return get().runningAgents.filter((a) => a.type === type);
  },

  getPendingTasks: () => {
    return get().pendingTasks.map((t) => ({
      id: t.id,
      agent: t.agent,
    }));
  },

  getPendingCount: () => {
    return get().pendingTasks.length;
  },

  getCompletedTasks: () => {
    return get().completedTasks;
  },

  hasPendingTaskForNote: (type, noteId) => {
    return get().pendingTasks.some(
      (task) => task.agent.type === type && task.agent.noteId === noteId
    );
  },

  hasRunningTaskForNote: (type, noteId) => {
    return get().runningAgents.some(
      (agent) => agent.type === type && agent.noteId === noteId
    );
  },

  removePendingTaskForNote: (type, noteId) => {
    const state = get();
    const taskToRemove = state.pendingTasks.find(
      (task) => task.agent.type === type && task.agent.noteId === noteId
    );
    
    if (taskToRemove) {
      // Reject the task so the promise doesn't hang
      taskToRemove.reject(new Error("Task replaced by newer request"));
      set((s) => ({
        pendingTasks: s.pendingTasks.filter(
          (task) => !(task.agent.type === type && task.agent.noteId === noteId)
        ),
      }));
    }
  },
}));
