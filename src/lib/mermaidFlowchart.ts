/**
 * Mermaid Flowchart <-> React Flow Converter
 * 
 * Provides bidirectional conversion between Mermaid flowchart syntax
 * and React Flow nodes/edges for the visual editor.
 */

import type { Node, Edge } from "@xyflow/react";

// Node shape types supported by the visual editor
export type FlowchartNodeShape = "rectangle" | "rounded" | "diamond" | "circle";

// Custom node data for flowchart nodes
export interface FlowchartNodeData {
  label: string;
  shape: FlowchartNodeShape;
  [key: string]: unknown;
}

// Custom edge data for flowchart edges
export interface FlowchartEdgeData {
  label?: string;
  [key: string]: unknown;
}

export type FlowchartNode = Node<FlowchartNodeData>;
export type FlowchartEdge = Edge<FlowchartEdgeData>;

// Direction of the flowchart
export type FlowchartDirection = "TD" | "TB" | "BT" | "LR" | "RL";

// Shape syntax mappings
const SHAPE_SYNTAX: Record<FlowchartNodeShape, { open: string; close: string }> = {
  rectangle: { open: "[", close: "]" },
  rounded: { open: "(", close: ")" },
  diamond: { open: "{", close: "}" },
  circle: { open: "((", close: "))" },
};

// Parse shape from Mermaid node definition
function parseNodeShape(definition: string): { id: string; label: string; shape: FlowchartNodeShape } {
  // Match patterns for different shapes
  // Circle: A((text))
  const circleMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)\(\((.+)\)\)$/);
  if (circleMatch) {
    return { id: circleMatch[1], label: circleMatch[2], shape: "circle" };
  }

  // Diamond: A{text}
  const diamondMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)\{(.+)\}$/);
  if (diamondMatch) {
    return { id: diamondMatch[1], label: diamondMatch[2], shape: "diamond" };
  }

  // Rounded: A(text)
  const roundedMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.+)\)$/);
  if (roundedMatch) {
    return { id: roundedMatch[1], label: roundedMatch[2], shape: "rounded" };
  }

  // Rectangle: A[text]
  const rectangleMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/);
  if (rectangleMatch) {
    return { id: rectangleMatch[1], label: rectangleMatch[2], shape: "rectangle" };
  }

  // Plain node ID (no shape)
  const plainMatch = definition.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (plainMatch) {
    return { id: plainMatch[1], label: plainMatch[1], shape: "rectangle" };
  }

  // Fallback
  return { id: definition, label: definition, shape: "rectangle" };
}


/**
 * Parse Mermaid flowchart syntax into React Flow nodes and edges
 */
export function parseMermaidFlowchart(code: string): {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  direction: FlowchartDirection;
} {
  const lines = code.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("%%"));
  const nodes: Map<string, FlowchartNode> = new Map();
  const edges: FlowchartEdge[] = [];
  let direction: FlowchartDirection = "TD";

  // Parse first line for direction
  const firstLine = lines[0] || "";
  const dirMatch = firstLine.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
  if (dirMatch) {
    direction = dirMatch[1].toUpperCase() as FlowchartDirection;
  }

  // Track node positions for layout
  let nodeIndex = 0;
  const getNodePosition = () => {
    const col = nodeIndex % 3;
    const row = Math.floor(nodeIndex / 3);
    nodeIndex++;
    return { x: 50 + col * 200, y: 50 + row * 150 };
  };

  // Helper to add a node if it doesn't exist
  const ensureNode = (definition: string) => {
    const { id, label, shape } = parseNodeShape(definition);
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        type: "flowchartNode",
        position: getNodePosition(),
        data: { label, shape },
      });
    } else {
      // Update label/shape if this definition is more specific
      const existing = nodes.get(id)!;
      if (label !== id && existing.data.label === id) {
        existing.data.label = label;
        existing.data.shape = shape;
      }
    }
    return id;
  };

  // Parse each line for node and edge definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip graph/flowchart declaration
    if (line.match(/^(?:graph|flowchart)\s+/i)) continue;
    
    // Skip subgraph declarations for now
    if (line.match(/^subgraph\s+/i) || line === "end") continue;

    // Match edge patterns: A --> B, A -->|label| B, A --- B, etc.
    // Support various arrow types: -->, --->, --, -.->
    const edgePattern = /^(.+?)\s*(-->|---->|---?|-.->|-.-|==>|===)\s*(?:\|(.+?)\|)?\s*(.+)$/;
    const edgeMatch = line.match(edgePattern);
    
    if (edgeMatch) {
      const [, sourceRaw, arrow, label, targetRaw] = edgeMatch;
      const sourceId = ensureNode(sourceRaw.trim());
      const targetId = ensureNode(targetRaw.trim());
      
      edges.push({
        id: `e${sourceId}-${targetId}-${edges.length}`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        data: label ? { label } : {},
        label: label || undefined,
        animated: arrow.includes("."),
        style: arrow.includes("=") ? { strokeWidth: 2 } : undefined,
      });
    } else {
      // Single node definition
      const nodeDef = line.trim();
      if (nodeDef && !nodeDef.startsWith("style") && !nodeDef.startsWith("class")) {
        ensureNode(nodeDef);
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    direction,
  };
}

/**
 * Generate Mermaid flowchart syntax from React Flow nodes and edges
 */
export function generateMermaidFlowchart(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  direction: FlowchartDirection = "TD"
): string {
  const lines: string[] = [`flowchart ${direction}`];
  
  // Track which nodes have been defined
  const definedNodes = new Set<string>();
  
  // Helper to generate node syntax
  const getNodeSyntax = (node: FlowchartNode): string => {
    const { open, close } = SHAPE_SYNTAX[node.data.shape];
    return `${node.id}${open}${node.data.label}${close}`;
  };
  
  // Generate edges and define nodes inline
  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) continue;
    
    // Build source part
    let sourcePart: string;
    if (definedNodes.has(sourceNode.id)) {
      sourcePart = sourceNode.id;
    } else {
      sourcePart = getNodeSyntax(sourceNode);
      definedNodes.add(sourceNode.id);
    }
    
    // Build target part
    let targetPart: string;
    if (definedNodes.has(targetNode.id)) {
      targetPart = targetNode.id;
    } else {
      targetPart = getNodeSyntax(targetNode);
      definedNodes.add(targetNode.id);
    }
    
    // Build arrow with optional label
    const label = edge.data?.label || edge.label;
    const arrow = label ? `-->|${label}|` : "-->";
    
    lines.push(`  ${sourcePart} ${arrow} ${targetPart}`);
  }
  
  // Add any orphan nodes (not connected to edges)
  for (const node of nodes) {
    if (!definedNodes.has(node.id)) {
      lines.push(`  ${getNodeSyntax(node)}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomChar = () => chars[Math.floor(Math.random() * chars.length)];
  return `${randomChar()}${randomChar()}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Create a new flowchart node
 */
export function createFlowchartNode(
  position: { x: number; y: number },
  shape: FlowchartNodeShape = "rectangle",
  label: string = "New Node"
): FlowchartNode {
  return {
    id: generateNodeId(),
    type: "flowchartNode",
    position,
    data: { label, shape },
  };
}

/**
 * Create a new flowchart edge
 */
export function createFlowchartEdge(
  source: string,
  target: string,
  label?: string
): FlowchartEdge {
  return {
    id: `e${source}-${target}-${Date.now()}`,
    source,
    target,
    type: "smoothstep",
    data: label ? { label } : {},
    label: label || undefined,
  };
}

/**
 * Get default nodes for a new flowchart
 */
export function getDefaultFlowchartNodes(): FlowchartNode[] {
  return [
    {
      id: "start",
      type: "flowchartNode",
      position: { x: 150, y: 50 },
      data: { label: "Start", shape: "rounded" },
    },
    {
      id: "process",
      type: "flowchartNode",
      position: { x: 150, y: 150 },
      data: { label: "Process", shape: "rectangle" },
    },
    {
      id: "end",
      type: "flowchartNode",
      position: { x: 150, y: 250 },
      data: { label: "End", shape: "rounded" },
    },
  ];
}

/**
 * Get default edges for a new flowchart
 */
export function getDefaultFlowchartEdges(): FlowchartEdge[] {
  return [
    {
      id: "e-start-process",
      source: "start",
      target: "process",
      type: "smoothstep",
      data: {},
    },
    {
      id: "e-process-end",
      source: "process",
      target: "end",
      type: "smoothstep",
      data: {},
    },
  ];
}

