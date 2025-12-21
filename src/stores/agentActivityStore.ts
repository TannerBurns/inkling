import { create } from "zustand";

export interface RunningAgent {
  id: string;
  type: "tagging" | "inline" | "embedding" | "summarization" | "research";
  noteId?: string;
  noteTitle?: string;
  startedAt: number;
}

interface AgentActivityState {
  runningAgents: RunningAgent[];
  
  // Actions
  startAgent: (agent: Omit<RunningAgent, "startedAt">) => void;
  stopAgent: (id: string) => void;
  clearAll: () => void;
  
  // Selectors
  isAnyAgentRunning: () => boolean;
  getAgentsByType: (type: RunningAgent["type"]) => RunningAgent[];
}

export const useAgentActivityStore = create<AgentActivityState>((set, get) => ({
  runningAgents: [],

  startAgent: (agent) => {
    set((state) => ({
      runningAgents: [
        ...state.runningAgents,
        { ...agent, startedAt: Date.now() },
      ],
    }));
  },

  stopAgent: (id) => {
    set((state) => ({
      runningAgents: state.runningAgents.filter((a) => a.id !== id),
    }));
  },

  clearAll: () => {
    set({ runningAgents: [] });
  },

  isAnyAgentRunning: () => {
    return get().runningAgents.length > 0;
  },

  getAgentsByType: (type) => {
    return get().runningAgents.filter((a) => a.type === type);
  },
}));
