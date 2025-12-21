import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Network, Loader2, AlertCircle, FileText } from "lucide-react";
import { GraphCanvas } from "./GraphCanvas";
import { GraphFilters } from "./GraphFilters";
import { useGraphStore } from "../../stores/graphStore";
import { useNoteStore } from "../../stores/noteStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

/**
 * Main knowledge graph view component
 * Container with filters, canvas, and empty states
 */
export function GraphView() {
  const { nodes, edges, isLoading, error, fetchGraphData, clearError } =
    useGraphStore();
  const { openNote } = useNoteStore();
  const { openTab } = useEditorGroupStore();

  // Fetch graph data on mount
  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  // Handle opening a note from the graph
  const handleNodeClick = (_nodeId: string) => {
    // Could show details in a sidebar or do something else
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    // Open the note tab
    openTab({ type: "note", id: nodeId });
    openNote(nodeId);
  };

  // Empty state
  if (!isLoading && nodes.length === 0 && !error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-8"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div
          className="rounded-full p-4"
          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
        >
          <Network
            size={32}
            style={{ color: "var(--color-text-tertiary)" }}
          />
        </div>
        <div className="text-center">
          <h2
            className="mb-2 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            No connections yet
          </h2>
          <p
            className="max-w-sm text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Start creating notes and linking them with{" "}
            <code
              className="rounded px-1.5 py-0.5 text-xs"
              style={{ backgroundColor: "var(--color-bg-tertiary)" }}
            >
              [[note name]]
            </code>{" "}
            to see your knowledge graph come to life.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && nodes.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
        <p style={{ color: "var(--color-text-secondary)" }}>
          Loading graph data...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-8"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div
          className="rounded-full p-4"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        >
          <AlertCircle size={32} style={{ color: "#ef4444" }} />
        </div>
        <div className="text-center">
          <h2
            className="mb-2 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Failed to load graph
          </h2>
          <p
            className="mb-4 max-w-sm text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {error}
          </p>
          <button
            onClick={() => {
              clearError();
              fetchGraphData();
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {/* Stats bar */}
      <div
        className="absolute left-4 top-4 z-10 flex items-center gap-4 rounded-lg border px-3 py-2"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: "var(--color-text-tertiary)" }} />
          <span
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <strong style={{ color: "var(--color-text-primary)" }}>
              {nodes.length}
            </strong>{" "}
            notes
          </span>
        </div>
        <div
          className="h-4 w-px"
          style={{ backgroundColor: "var(--color-border)" }}
        />
        <div className="flex items-center gap-2">
          <Network size={14} style={{ color: "var(--color-text-tertiary)" }} />
          <span
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <strong style={{ color: "var(--color-text-primary)" }}>
              {edges.length}
            </strong>{" "}
            connections
          </span>
        </div>
      </div>

      {/* Filters */}
      <GraphFilters />

      {/* Canvas */}
      <ReactFlowProvider>
        <GraphCanvas
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
        />
      </ReactFlowProvider>

      {/* Loading overlay when refetching */}
      {isLoading && nodes.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
        </div>
      )}
    </div>
  );
}

