import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

/** A node in the knowledge graph */
export interface GraphNode {
  id: string;
  title: string;
  folderId: string | null;
  linkCount: number;
  createdAt: string;
  updatedAt: string;
}

/** An edge in the knowledge graph */
export interface GraphEdge {
  source: string;
  target: string;
  edgeType: "link" | "similarity";
  weight: number | null;
}

/** Graph data from the backend */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Filter options for the graph */
export interface GraphFilters {
  folderIds: string[] | null; // null = all folders
  showLinkEdges: boolean;
  showSimilarityEdges: boolean;
  similarityThreshold: number;
  timeRange: "all" | "week" | "month" | "year";
}

interface GraphState {
  // Data
  nodes: GraphNode[];
  edges: GraphEdge[];
  isLoading: boolean;
  error: string | null;

  // Filters
  filters: GraphFilters;

  // UI State
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  focusedNodeId: string | null; // Node to center on

  // Actions
  fetchGraphData: () => Promise<void>;
  setFilters: (filters: Partial<GraphFilters>) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  focusNode: (id: string | null) => void;
  clearError: () => void;
}

const DEFAULT_FILTERS: GraphFilters = {
  folderIds: null,
  showLinkEdges: true,
  showSimilarityEdges: false,
  similarityThreshold: 0.7,
  timeRange: "all",
};

export const useGraphStore = create<GraphState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  isLoading: false,
  error: null,
  filters: DEFAULT_FILTERS,
  selectedNodeId: null,
  hoveredNodeId: null,
  focusedNodeId: null,

  // Fetch graph data from backend
  fetchGraphData: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters } = get();
      const data = await invoke<GraphData>("get_graph_data", {
        includeSimilarity: filters.showSimilarityEdges,
        similarityThreshold: filters.similarityThreshold,
      });

      // Apply filters
      let filteredNodes = data.nodes;
      let filteredEdges = data.edges;

      // Filter by folder
      if (filters.folderIds !== null && filters.folderIds.length > 0) {
        const folderSet = new Set(filters.folderIds);
        filteredNodes = filteredNodes.filter(
          (n) => n.folderId === null || folderSet.has(n.folderId)
        );
        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        filteredEdges = filteredEdges.filter(
          (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        );
      }

      // Filter by time range
      if (filters.timeRange !== "all") {
        const now = new Date();
        let cutoff: Date;
        switch (filters.timeRange) {
          case "week":
            cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "year":
            cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        }
        filteredNodes = filteredNodes.filter(
          (n) => new Date(n.updatedAt) >= cutoff
        );
        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        filteredEdges = filteredEdges.filter(
          (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        );
      }

      // Filter edges by type
      if (!filters.showLinkEdges) {
        filteredEdges = filteredEdges.filter((e) => e.edgeType !== "link");
      }
      if (!filters.showSimilarityEdges) {
        filteredEdges = filteredEdges.filter((e) => e.edgeType !== "similarity");
      }

      set({
        nodes: filteredNodes,
        edges: filteredEdges,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Update filters and refetch
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Refetch with new filters
    get().fetchGraphData();
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  hoverNode: (id) => set({ hoveredNodeId: id }),
  focusNode: (id) => set({ focusedNodeId: id }),
  clearError: () => set({ error: null }),
}));

