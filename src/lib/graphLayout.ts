import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

export type LayoutDirection = "TB" | "LR" | "BT" | "RL";
export type LayoutType = "dagre" | "force" | "radial";

interface LayoutOptions {
  direction?: LayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: "TB",
  nodeWidth: 172,
  nodeHeight: 36,
  rankSep: 50,
  nodeSep: 25,
};

/**
 * Apply dagre layout to React Flow nodes and edges
 * Returns nodes with calculated positions
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
  });

  // Add nodes to the graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  });

  // Add edges to the graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run the layout
  dagre.layout(dagreGraph);

  // Map back to React Flow nodes with positions
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) {
      return node;
    }

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - opts.nodeWidth / 2,
        y: nodeWithPosition.y - opts.nodeHeight / 2,
      },
    };
  });
}

/**
 * Apply force-directed layout using simple physics simulation
 * Good for organic clustering of related nodes
 */
export function applyForceLayout(
  nodes: Node[],
  edges: Edge[],
  iterations: number = 100
): Node[] {
  if (nodes.length === 0) return nodes;

  // Initialize positions in a circle if not set
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const radius = Math.max(200, nodes.length * 30);

  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    positions.set(node.id, {
      x: node.position?.x ?? Math.cos(angle) * radius + radius,
      y: node.position?.y ?? Math.sin(angle) * radius + radius,
      vx: 0,
      vy: 0,
    });
  });

  // Physics parameters
  const repulsion = 5000;
  const attraction = 0.01;
  const damping = 0.9;
  const minDistance = 50;

  // Run simulation
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion between all nodes
    for (const nodeA of nodes) {
      const posA = positions.get(nodeA.id)!;
      for (const nodeB of nodes) {
        if (nodeA.id === nodeB.id) continue;
        const posB = positions.get(nodeB.id)!;

        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), minDistance);
        const force = (repulsion * alpha) / (dist * dist);

        posA.vx += (dx / dist) * force;
        posA.vy += (dy / dist) * force;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const posA = positions.get(edge.source);
      const posB = positions.get(edge.target);
      if (!posA || !posB) continue;

      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const force = dist * attraction * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      posA.vx += fx;
      posA.vy += fy;
      posB.vx -= fx;
      posB.vy -= fy;
    }

    // Apply velocities and damping
    for (const [, pos] of positions) {
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.vx *= damping;
      pos.vy *= damping;
    }
  }

  // Map back to nodes
  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (!pos) return node;

    return {
      ...node,
      position: { x: pos.x, y: pos.y },
    };
  });
}

/**
 * Apply radial layout centered on a focus node
 * Good for exploring connections from a specific note
 */
export function applyRadialLayout(
  nodes: Node[],
  edges: Edge[],
  focusNodeId?: string
): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n.id, new Set()));

  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  // Find center node (most connected or specified focus)
  let centerId = focusNodeId;
  if (!centerId || !adjacency.has(centerId)) {
    let maxConnections = -1;
    for (const [id, connections] of adjacency) {
      if (connections.size > maxConnections) {
        maxConnections = connections.size;
        centerId = id;
      }
    }
  }

  if (!centerId) return nodes;

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [centerId];
  levels.set(centerId, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;
    const neighbors = adjacency.get(current) || new Set();

    for (const neighbor of neighbors) {
      if (!levels.has(neighbor)) {
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Handle disconnected nodes
  nodes.forEach((n) => {
    if (!levels.has(n.id)) {
      levels.set(n.id, Math.max(...Array.from(levels.values())) + 1);
    }
  });

  // Group nodes by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(id);
  }

  // Position nodes in concentric circles
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = 400;
  const centerY = 400;
  const levelSpacing = 150;

  for (const [level, nodeIds] of levelGroups) {
    const radius = level * levelSpacing;
    const angleStep = (2 * Math.PI) / nodeIds.length;

    nodeIds.forEach((id, i) => {
      if (level === 0) {
        positions.set(id, { x: centerX, y: centerY });
      } else {
        const angle = i * angleStep - Math.PI / 2;
        positions.set(id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      }
    });
  }

  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (!pos) return node;

    return {
      ...node,
      position: { x: pos.x - 86, y: pos.y - 18 }, // Center the node
    };
  });
}

/**
 * Apply the specified layout type
 */
export function applyLayout(
  nodes: Node[],
  edges: Edge[],
  layoutType: LayoutType,
  options?: LayoutOptions & { focusNodeId?: string }
): Node[] {
  switch (layoutType) {
    case "dagre":
      return applyDagreLayout(nodes, edges, options);
    case "force":
      return applyForceLayout(nodes, edges);
    case "radial":
      return applyRadialLayout(nodes, edges, options?.focusNodeId);
    default:
      return nodes;
  }
}

