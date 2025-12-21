import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Link2 } from "lucide-react";

export interface GraphNodeData {
  label: string;
  linkCount: number;
  folderId: string | null;
  isSelected?: boolean;
  isHovered?: boolean;
}

/**
 * Custom node component for the knowledge graph
 * Displays note title with link count badge
 */
function GraphNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  const { label, linkCount, isSelected, isHovered } = nodeData;

  // Size based on link count (more connections = larger)
  const baseSize = 140;
  const sizeMultiplier = Math.min(1 + linkCount * 0.05, 1.5);
  const width = baseSize * sizeMultiplier;

  return (
    <>
      {/* Invisible target handles for edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !border-0 !w-full !h-2 !top-0 !transform-none !rounded-none"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !h-full !w-2 !left-0 !transform-none !rounded-none"
      />

      {/* Node content */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-150"
        style={{
          width,
          backgroundColor:
            isSelected || selected
              ? "var(--color-accent)"
              : isHovered
                ? "var(--color-bg-tertiary)"
                : "var(--color-bg-secondary)",
          borderColor:
            isSelected || selected
              ? "var(--color-accent)"
              : "var(--color-border)",
          boxShadow:
            isSelected || selected || isHovered
              ? "0 4px 12px rgba(0,0,0,0.15)"
              : "0 2px 4px rgba(0,0,0,0.05)",
          transform: isHovered ? "scale(1.02)" : "scale(1)",
        }}
      >
        <FileText
          size={14}
          style={{
            color:
              isSelected || selected
                ? "white"
                : "var(--color-text-secondary)",
            flexShrink: 0,
          }}
        />
        <span
          className="truncate text-sm font-medium"
          style={{
            color:
              isSelected || selected ? "white" : "var(--color-text-primary)",
          }}
        >
          {label}
        </span>
        {linkCount > 0 && (
          <span
            className="ml-auto flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs"
            style={{
              backgroundColor:
                isSelected || selected
                  ? "rgba(255,255,255,0.2)"
                  : "var(--color-bg-tertiary)",
              color:
                isSelected || selected
                  ? "white"
                  : "var(--color-text-secondary)",
              flexShrink: 0,
            }}
          >
            <Link2 size={10} />
            {linkCount}
          </span>
        )}
      </div>

      {/* Invisible source handles for edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-full !h-2 !bottom-0 !transform-none !rounded-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !h-full !w-2 !right-0 !transform-none !rounded-none"
      />
    </>
  );
}

export const GraphNode = memo(GraphNodeComponent);

