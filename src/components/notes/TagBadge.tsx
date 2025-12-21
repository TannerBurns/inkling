import { X } from "lucide-react";
import type { Tag } from "../../types/note";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  onClick?: () => void;
  size?: "sm" | "md";
}

/**
 * Color mapping for tag colors to CSS values
 */
const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  red: {
    bg: "rgba(239, 68, 68, 0.15)",
    text: "rgb(220, 38, 38)",
    border: "rgba(239, 68, 68, 0.3)",
  },
  orange: {
    bg: "rgba(249, 115, 22, 0.15)",
    text: "rgb(234, 88, 12)",
    border: "rgba(249, 115, 22, 0.3)",
  },
  yellow: {
    bg: "rgba(234, 179, 8, 0.15)",
    text: "rgb(161, 98, 7)",
    border: "rgba(234, 179, 8, 0.3)",
  },
  green: {
    bg: "rgba(34, 197, 94, 0.15)",
    text: "rgb(22, 163, 74)",
    border: "rgba(34, 197, 94, 0.3)",
  },
  blue: {
    bg: "rgba(59, 130, 246, 0.15)",
    text: "rgb(37, 99, 235)",
    border: "rgba(59, 130, 246, 0.3)",
  },
  purple: {
    bg: "rgba(168, 85, 247, 0.15)",
    text: "rgb(147, 51, 234)",
    border: "rgba(168, 85, 247, 0.3)",
  },
  pink: {
    bg: "rgba(236, 72, 153, 0.15)",
    text: "rgb(219, 39, 119)",
    border: "rgba(236, 72, 153, 0.3)",
  },
  gray: {
    bg: "rgba(107, 114, 128, 0.15)",
    text: "rgb(75, 85, 99)",
    border: "rgba(107, 114, 128, 0.3)",
  },
};

/**
 * Get color styles for a tag
 */
function getColorStyles(color: string | null): { bg: string; text: string; border: string } {
  if (color && colorMap[color]) {
    return colorMap[color];
  }
  // Default to gray
  return colorMap.gray;
}

/**
 * A tag badge/pill component
 */
export function TagBadge({ tag, onRemove, onClick, size = "sm" }: TagBadgeProps) {
  const colors = getColorStyles(tag.color);
  const isClickable = !!onClick;
  const isRemovable = !!onRemove;

  const sizeClasses = size === "sm" 
    ? "text-xs px-2 py-0.5" 
    : "text-sm px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-colors ${sizeClasses} ${
        isClickable ? "cursor-pointer hover:opacity-80" : ""
      }`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
      onClick={onClick}
    >
      <span>{tag.name}</span>
      {isRemovable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10"
          title="Remove tag"
        >
          <X size={size === "sm" ? 10 : 12} />
        </button>
      )}
    </span>
  );
}

export default TagBadge;
