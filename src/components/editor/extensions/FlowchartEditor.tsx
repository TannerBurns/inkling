/**
 * Visual Flowchart Editor
 * 
 * A React Flow-based visual editor for creating Mermaid flowcharts.
 * Provides drag-and-drop node creation, edge connections, and inline editing.
 */

import { useCallback, useMemo, useState, useRef, useEffect, memo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Handle,
  Position,
  type OnConnect,
  type Connection,
  type NodeProps,
  type EdgeProps,
  ReactFlowProvider,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Square,
  Circle,
  Diamond,
  RectangleHorizontal,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  type FlowchartNode,
  type FlowchartEdge,
  type FlowchartNodeShape,
  type FlowchartNodeData,
  type FlowchartDirection,
  createFlowchartNode,
  createFlowchartEdge,
  parseMermaidFlowchart,
  generateMermaidFlowchart,
  getDefaultFlowchartNodes,
  getDefaultFlowchartEdges,
} from "../../../lib/mermaidFlowchart";

// Shape icon mapping
const SHAPE_ICONS: Record<FlowchartNodeShape, React.ReactNode> = {
  rectangle: <Square size={14} />,
  rounded: <RectangleHorizontal size={14} />,
  diamond: <Diamond size={14} />,
  circle: <Circle size={14} />,
};

const SHAPE_LABELS: Record<FlowchartNodeShape, string> = {
  rectangle: "Process",
  rounded: "Start/End",
  diamond: "Decision",
  circle: "Connector",
};

// Custom Flowchart Node Component
interface FlowchartNodeComponentProps extends NodeProps {
  data: FlowchartNodeData;
}

function FlowchartNodeComponent({ id, data, selected }: FlowchartNodeComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setNodes, deleteElements } = useReactFlow();

  // Update edit value when data changes
  useEffect(() => {
    setEditValue(data.label);
  }, [data.label]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Handle save
  const handleSave = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: editValue } } : n
      )
    );
    setIsEditing(false);
  }, [id, editValue, setNodes]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        setEditValue(data.label);
        setIsEditing(false);
      }
    },
    [handleSave, data.label]
  );

  // Handle delete
  const handleDelete = useCallback(() => {
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);

  // Handle shape change
  const handleShapeChange = useCallback(
    (shape: FlowchartNodeShape) => {
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, shape } } : n
        )
      );
    },
    [id, setNodes]
  );

  // Get shape styles - more subtle selection styling
  const getShapeStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: "var(--color-bg-secondary)",
      borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
      color: "var(--color-text-primary)",
      boxShadow: selected ? "0 0 0 2px var(--color-accent-light)" : "0 1px 3px rgba(0,0,0,0.1)",
      transition: "all 0.15s ease",
    };

    switch (data.shape) {
      case "rounded":
        return { ...baseStyle, borderRadius: "9999px" };
      case "diamond":
        return {
          ...baseStyle,
          borderRadius: "4px",
          transform: "rotate(45deg)",
        };
      case "circle":
        return { ...baseStyle, borderRadius: "50%" };
      default:
        return { ...baseStyle, borderRadius: "8px" };
    }
  };

  const contentStyle = data.shape === "diamond" ? { transform: "rotate(-45deg)" } : {};

  return (
    <>
      {/* Handles - visible on hover */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white !opacity-0 hover:!opacity-100 transition-opacity"
        style={{ top: -6, backgroundColor: "var(--color-accent)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-white !opacity-0 hover:!opacity-100 transition-opacity"
        style={{ left: -6, backgroundColor: "var(--color-accent)" }}
      />

      {/* Node content */}
      <div
        className="relative flex items-center justify-center border-2"
        style={{
          ...getShapeStyle(),
          minWidth: data.shape === "diamond" ? 80 : data.shape === "circle" ? 70 : 100,
          minHeight: data.shape === "diamond" ? 80 : data.shape === "circle" ? 70 : 40,
          padding: data.shape === "diamond" || data.shape === "circle" ? "20px" : "8px 16px",
        }}
      >
        <div style={contentStyle} className="flex items-center gap-2">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full min-w-[60px] border-none bg-transparent text-center text-sm font-medium outline-none"
              style={{ color: "inherit" }}
            />
          ) : (
            <span
              className="cursor-text select-none text-center text-sm font-medium"
              onDoubleClick={() => setIsEditing(true)}
            >
              {data.label}
            </span>
          )}
        </div>

        {/* Node toolbar (visible when selected) */}
        {selected && !isEditing && (
          <div
            className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border px-2 py-1 shadow-lg"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
            }}
          >
            {/* Shape buttons */}
            {(Object.keys(SHAPE_ICONS) as FlowchartNodeShape[]).map((shape) => (
              <button
                key={shape}
                onClick={() => handleShapeChange(shape)}
                className="rounded p-1 transition-colors"
                style={{
                  backgroundColor: data.shape === shape ? "var(--color-accent)" : "transparent",
                  color: data.shape === shape ? "white" : "var(--color-text-secondary)",
                }}
                title={SHAPE_LABELS[shape]}
              >
                {SHAPE_ICONS[shape]}
              </button>
            ))}
            <div
              className="mx-1 h-4 w-px"
              style={{ backgroundColor: "var(--color-border)" }}
            />
            {/* Edit button */}
            <button
              onClick={() => setIsEditing(true)}
              className="rounded p-1 transition-colors hover:bg-black/10"
              style={{ color: "var(--color-text-secondary)" }}
              title="Edit text"
            >
              <Type size={14} />
            </button>
            {/* Delete button */}
            <button
              onClick={handleDelete}
              className="rounded p-1 transition-colors hover:bg-red-100"
              style={{ color: "var(--color-danger)" }}
              title="Delete node"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Source handles - visible on hover */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2 !border-white !opacity-0 hover:!opacity-100 transition-opacity"
        style={{ bottom: -6, backgroundColor: "var(--color-success, #22c55e)" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-white !opacity-0 hover:!opacity-100 transition-opacity"
        style={{ right: -6, backgroundColor: "var(--color-success, #22c55e)" }}
      />
    </>
  );
}

const FlowchartNodeMemo = memo(FlowchartNodeComponent);

// Custom Edge Component with better interaction
function FlowchartEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  label,
}: EdgeProps) {
  const { deleteElements, setEdges } = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(
    (data?.label as string) || (label as string) || ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Unique marker ID for this edge
  const markerId = `arrow-${id}`;

  // Get the smooth step path
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteElements({ edges: [{ id }] });
    },
    [id, deleteElements]
  );

  // Handle label edit
  const handleLabelDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingLabel(true);
  }, []);

  const handleLabelSave = useCallback(() => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, label: labelValue || undefined, data: { ...e.data, label: labelValue } }
          : e
      )
    );
    setIsEditingLabel(false);
  }, [id, labelValue, setEdges]);

  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        handleLabelSave();
      } else if (e.key === "Escape") {
        setLabelValue((data?.label as string) || (label as string) || "");
        setIsEditingLabel(false);
      }
    },
    [handleLabelSave, data?.label, label]
  );

  useEffect(() => {
    if (isEditingLabel && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingLabel]);

  // Update label value when data changes
  useEffect(() => {
    setLabelValue((data?.label as string) || (label as string) || "");
  }, [data?.label, label]);

  const displayLabel = labelValue || label;
  const showControls = selected || isHovered;

  // Determine the edge color based on state
  const edgeColor = selected 
    ? "#3b82f6" // Blue for selected state
    : isHovered 
      ? "#60a5fa" // Light blue for hover
      : "#94a3b8"; // Gray default

  return (
    <>
      {/* Define arrow marker with dynamic color */}
      <defs>
        <marker
          id={markerId}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M2,2 L10,6 L2,10 L4,6 Z"
            fill={edgeColor}
            style={{ transition: "fill 0.15s ease" }}
          />
        </marker>
      </defs>

      {/* Invisible wider path for easier selection - this is the clickable area */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={24}
        stroke="transparent"
        className="cursor-pointer react-flow__edge-interaction"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ pointerEvents: "stroke" }}
      />
      
      {/* Visible edge path */}
      <path
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={selected || isHovered ? 3 : 2}
        markerEnd={`url(#${markerId})`}
        className="react-flow__edge-path"
        style={{
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
          pointerEvents: "none",
        }}
      />

      {/* Edge label and controls */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isEditingLabel ? (
            <input
              ref={inputRef}
              type="text"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onBlur={handleLabelSave}
              placeholder="Label..."
              className="rounded border px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-accent)",
                color: "var(--color-text-primary)",
                minWidth: "60px",
              }}
            />
          ) : (
            <div className="flex items-center gap-1">
              {/* Label display - always clickable to edit */}
              <button
                onClick={handleLabelDoubleClick}
                className="rounded px-2 py-0.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: displayLabel 
                    ? "var(--color-bg-primary)" 
                    : showControls 
                      ? "var(--color-bg-secondary)" 
                      : "transparent",
                  color: "var(--color-text-secondary)",
                  border: displayLabel || showControls ? "1px solid var(--color-border)" : "none",
                  opacity: displayLabel || showControls ? 1 : 0,
                }}
                title="Click to add/edit label"
              >
                {displayLabel || (showControls ? "Add label" : "")}
              </button>

              {/* Delete button - show when selected or hovered */}
              {showControls && (
                <button
                  onClick={handleDelete}
                  className="rounded-full p-1 transition-colors"
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-danger)",
                  }}
                  title="Delete edge (or press Delete/Backspace)"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const FlowchartEdgeMemo = memo(FlowchartEdgeComponent);

// Node and edge types for React Flow
const nodeTypes = {
  flowchartNode: FlowchartNodeMemo,
};

const edgeTypes = {
  flowchartEdge: FlowchartEdgeMemo,
};

// Default edge options
const defaultEdgeOptions = {
  type: "flowchartEdge",
};

// Node Palette Component
interface NodePaletteProps {
  onAddNode: (shape: FlowchartNodeShape) => void;
}

function NodePalette({ onAddNode }: NodePaletteProps) {
  const shapes: FlowchartNodeShape[] = ["rectangle", "rounded", "diamond", "circle"];

  const handleClick = useCallback((e: React.MouseEvent, shape: FlowchartNodeShape) => {
    e.preventDefault();
    e.stopPropagation();
    onAddNode(shape);
  }, [onAddNode]);

  return (
    <div
      className="nodrag nopan absolute left-4 top-4 z-10 flex flex-col gap-2 rounded-lg border p-2 shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        className="px-2 text-xs font-medium"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Add Node
      </span>
      {shapes.map((shape) => (
        <button
          key={shape}
          onClick={(e) => handleClick(e, shape)}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            color: "var(--color-text-primary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
          }}
        >
          <span style={{ color: "var(--color-text-secondary)" }}>
            {SHAPE_ICONS[shape]}
          </span>
          {SHAPE_LABELS[shape]}
        </button>
      ))}
    </div>
  );
}

// Direction Selector Component
interface DirectionSelectorProps {
  direction: FlowchartDirection;
  onDirectionChange: (direction: FlowchartDirection) => void;
}

function DirectionSelector({ direction, onDirectionChange }: DirectionSelectorProps) {
  const directions: { value: FlowchartDirection; label: string }[] = [
    { value: "TD", label: "Top → Down" },
    { value: "LR", label: "Left → Right" },
    { value: "BT", label: "Bottom → Top" },
    { value: "RL", label: "Right → Left" },
  ];

  return (
    <div
      className="nodrag nopan absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        className="text-xs font-medium"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Direction:
      </span>
      <select
        value={direction}
        onChange={(e) => {
          e.stopPropagation();
          onDirectionChange(e.target.value as FlowchartDirection);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="rounded border px-2 py-1 text-sm"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      >
        {directions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Main Editor Props
interface FlowchartEditorProps {
  initialCode?: string;
  onCodeChange: (code: string) => void;
}

// Inner editor component (needs ReactFlowProvider context)
function FlowchartEditorInner({ initialCode, onCodeChange }: FlowchartEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  
  // Parse initial code or use defaults
  const initialData = useMemo(() => {
    if (initialCode?.trim()) {
      return parseMermaidFlowchart(initialCode);
    }
    return {
      nodes: getDefaultFlowchartNodes(),
      edges: getDefaultFlowchartEdges(),
      direction: "TD" as FlowchartDirection,
    };
  }, [initialCode]);

  // Add custom edge type to initial edges
  const initialEdges = useMemo(() => {
    return initialData.edges.map(e => ({ ...e, type: "flowchartEdge" }));
  }, [initialData.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [direction, setDirection] = useState<FlowchartDirection>(initialData.direction);

  // Fit view on mount
  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 100);
  }, [fitView]);

  // Stop Delete/Backspace from propagating to TipTap editor
  // This prevents the entire Mermaid block from being deleted
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Only stop propagation, let React Flow handle the actual deletion
        e.stopPropagation();
      }
    };

    wrapper.addEventListener("keydown", handleKeyDown, true);
    return () => {
      wrapper.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  // Generate and emit code on changes
  useEffect(() => {
    const code = generateMermaidFlowchart(
      nodes as FlowchartNode[],
      edges as FlowchartEdge[],
      direction
    );
    onCodeChange(code);
  }, [nodes, edges, direction, onCodeChange]);

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const newEdge = createFlowchartEdge(connection.source, connection.target);
        setEdges((eds) => addEdge({ ...newEdge, ...connection, type: "flowchartEdge" }, eds));
      }
    },
    [setEdges]
  );

  // Handle adding a new node
  const handleAddNode = useCallback(
    (shape: FlowchartNodeShape) => {
      // Get the center of the visible canvas
      const wrapperWidth = reactFlowWrapper.current?.clientWidth || 400;
      const wrapperHeight = reactFlowWrapper.current?.clientHeight || 300;
      
      // Add random offset so nodes don't stack exactly on top of each other
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetY = (Math.random() - 0.5) * 100;
      
      const position = screenToFlowPosition({
        x: wrapperWidth / 2 + offsetX,
        y: wrapperHeight / 2 + offsetY,
      });
      
      const newNode = createFlowchartNode(position, shape, SHAPE_LABELS[shape]);
      
      // Use functional update to ensure we get latest state
      setNodes((currentNodes) => {
        return [...currentNodes, newNode];
      });
    },
    [screenToFlowPosition, setNodes]
  );

  // Handle node drag to enable drag-and-drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const shape = event.dataTransfer.getData("application/flowchart-shape") as FlowchartNodeShape;
      if (!shape) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const newNode = createFlowchartNode(position, shape, SHAPE_LABELS[shape]);
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  // Click on pane to deselect
  const onPaneClick = useCallback(() => {
    // This naturally deselects nodes/edges in React Flow
  }, []);

  return (
    <div ref={reactFlowWrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
        selectionKeyCode={["Shift"]}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectNodesOnDrag={false}
        elementsSelectable={true}
        edgesFocusable={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="var(--color-border)"
        />
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
            borderRadius: "8px",
          }}
        />
      </ReactFlow>

      <NodePalette onAddNode={handleAddNode} />
      <DirectionSelector direction={direction} onDirectionChange={setDirection} />
      
      {/* Help text */}
      <div
        className="nodrag nopan absolute bottom-4 left-4 z-10 rounded-lg border px-3 py-2 text-xs"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-tertiary)",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <strong>Tips:</strong> Double-click nodes to edit text • Click edges to select • Press Delete to remove
      </div>
    </div>
  );
}

// Wrapper component with ReactFlowProvider
export function FlowchartEditor(props: FlowchartEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowchartEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default FlowchartEditor;
