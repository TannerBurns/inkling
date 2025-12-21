import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  ConnectionMode,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { GraphNode, type GraphNodeData } from "./GraphNode";
import { GraphNodePreview } from "./GraphNodePreview";
import { GraphControls } from "./GraphControls";
import { useGraphStore } from "../../stores/graphStore";
import { useNoteStore } from "../../stores/noteStore";
import { applyLayout, type LayoutType } from "../../lib/graphLayout";

// Custom node types
const nodeTypes = {
  graphNode: GraphNode,
};

interface GraphCanvasProps {
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

/**
 * Main canvas component for the knowledge graph
 * Renders nodes and edges using React Flow
 */
export function GraphCanvas({ onNodeClick, onNodeDoubleClick }: GraphCanvasProps) {
  const {
    nodes: graphNodes,
    edges: graphEdges,
    selectedNodeId,
    hoveredNodeId,
    focusedNodeId,
    selectNode,
    hoverNode,
    focusNode,
  } = useGraphStore();

  const { openNote } = useNoteStore();
  const { fitView, zoomIn, zoomOut, setCenter, getZoom } = useReactFlow();

  const [layoutType, setLayoutType] = useState<LayoutType>("force");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert graph data to React Flow nodes
  const flowNodes = useMemo(() => {
    return graphNodes.map((node) => ({
      id: node.id,
      type: "graphNode",
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        label: node.title,
        linkCount: node.linkCount,
        folderId: node.folderId,
        isSelected: node.id === selectedNodeId,
        isHovered: node.id === hoveredNodeId,
      } satisfies GraphNodeData,
    }));
  }, [graphNodes, selectedNodeId, hoveredNodeId]);

  // Convert graph edges to React Flow edges
  const flowEdges = useMemo(() => {
    return graphEdges.map((edge, idx) => ({
      id: `${edge.source}-${edge.target}-${idx}`,
      source: edge.source,
      target: edge.target,
      type: "default",
      animated: edge.edgeType === "similarity",
      style: {
        stroke:
          edge.edgeType === "similarity"
            ? "rgba(147, 51, 234, 0.5)" // Purple for similarity
            : "var(--color-border)",
        strokeWidth: edge.edgeType === "similarity" ? 1.5 : 1,
        opacity: edge.weight ? 0.3 + edge.weight * 0.7 : 0.6,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color:
          edge.edgeType === "similarity"
            ? "rgba(147, 51, 234, 0.5)"
            : "var(--color-border)",
      },
    }));
  }, [graphEdges]);

  // Apply layout when nodes/edges change or layout type changes
  useEffect(() => {
    if (flowNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const layoutedNodes = applyLayout(
      flowNodes as Node[],
      flowEdges as Edge[],
      layoutType,
      { focusNodeId: focusedNodeId || undefined }
    );

    setNodes(layoutedNodes);
    setEdges(flowEdges as Edge[]);

    // Fit view after layout
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [flowNodes, flowEdges, layoutType, focusedNodeId, setNodes, setEdges, fitView]);

  // Center on focused node
  useEffect(() => {
    if (focusedNodeId) {
      const node = nodes.find((n) => n.id === focusedNodeId);
      if (node) {
        const zoom = getZoom();
        setCenter(
          node.position.x + 86,
          node.position.y + 18,
          { zoom: Math.max(zoom, 1), duration: 500 }
        );
      }
      // Clear focus after animation
      setTimeout(() => focusNode(null), 500);
    }
  }, [focusedNodeId, nodes, setCenter, getZoom, focusNode]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      onNodeClick?.(node.id);
    },
    [selectNode, onNodeClick]
  );

  // Handle node double-click
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Open the note in editor
      openNote(node.id);
      onNodeDoubleClick?.(node.id);
    },
    [openNote, onNodeDoubleClick]
  );

  // Handle node hover
  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      hoverNode(node.id);
      // Set preview position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setPreviewPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    },
    [hoverNode]
  );

  const handleNodeMouseLeave = useCallback(() => {
    hoverNode(null);
    setPreviewPosition(null);
  }, [hoverNode]);

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle layout change
  const handleLayoutChange = useCallback((layout: LayoutType) => {
    setLayoutType(layout);
  }, []);

  // Empty connection handler (we don't allow creating connections)
  const onConnect: OnConnect = useCallback(() => {}, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border)"
        />
        <GraphControls
          onZoomIn={() => zoomIn({ duration: 200 })}
          onZoomOut={() => zoomOut({ duration: 200 })}
          onFitView={() => fitView({ padding: 0.2, duration: 300 })}
          layoutType={layoutType}
          onLayoutChange={handleLayoutChange}
        />
      </ReactFlow>

      {/* Node preview tooltip */}
      {hoveredNodeId && previewPosition && (
        <GraphNodePreview nodeId={hoveredNodeId} position={previewPosition} />
      )}
    </div>
  );
}

