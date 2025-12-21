import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Share2,
  Circle,
} from "lucide-react";
import type { LayoutType } from "../../lib/graphLayout";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  layoutType: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
}

/**
 * Control buttons for the graph canvas
 * Includes zoom, fit-view, and layout type selection
 */
export function GraphControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  layoutType,
  onLayoutChange,
}: GraphControlsProps) {
  const buttonClass =
    "flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]";

  const layoutButtons: { type: LayoutType; icon: React.ReactNode; title: string }[] = [
    { type: "dagre", icon: <LayoutGrid size={16} />, title: "Hierarchical layout" },
    { type: "force", icon: <Share2 size={16} />, title: "Force-directed layout" },
    { type: "radial", icon: <Circle size={16} />, title: "Radial layout" },
  ];

  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg border p-1"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Zoom controls */}
      <button
        onClick={onZoomIn}
        className={buttonClass}
        style={{ color: "var(--color-text-secondary)" }}
        title="Zoom in"
      >
        <ZoomIn size={16} />
      </button>
      <button
        onClick={onZoomOut}
        className={buttonClass}
        style={{ color: "var(--color-text-secondary)" }}
        title="Zoom out"
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={onFitView}
        className={buttonClass}
        style={{ color: "var(--color-text-secondary)" }}
        title="Fit to view"
      >
        <Maximize2 size={16} />
      </button>

      {/* Divider */}
      <div
        className="my-1 h-px"
        style={{ backgroundColor: "var(--color-border)" }}
      />

      {/* Layout controls */}
      {layoutButtons.map(({ type, icon, title }) => (
        <button
          key={type}
          onClick={() => onLayoutChange(type)}
          className={buttonClass}
          style={{
            color:
              layoutType === type
                ? "var(--color-accent)"
                : "var(--color-text-secondary)",
            backgroundColor:
              layoutType === type ? "var(--color-bg-tertiary)" : "transparent",
          }}
          title={title}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

