import { Link2, Sparkles, Filter, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useGraphStore, type GraphFilters as FilterType } from "../../stores/graphStore";
import { useFolderStore } from "../../stores/folderStore";

/**
 * Filter controls for the knowledge graph
 * Allows filtering by folder, edge type, and time range
 */
export function GraphFilters() {
  const { filters, setFilters } = useGraphStore();
  const { folders } = useFolderStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const timeRangeOptions: { value: FilterType["timeRange"]; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "week", label: "Past week" },
    { value: "month", label: "Past month" },
    { value: "year", label: "Past year" },
  ];

  return (
    <div
      className="absolute right-4 top-4 z-10 rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--color-bg-tertiary)]"
        style={{ color: "var(--color-text-primary)" }}
      >
        <Filter size={14} />
        <span className="text-sm font-medium">Filters</span>
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`}
          style={{ color: "var(--color-text-tertiary)" }}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="border-t p-3 space-y-4"
          style={{ borderColor: "var(--color-border)", minWidth: 220 }}
        >
          {/* Edge type toggles */}
          <div>
            <label
              className="mb-2 block text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Edge Types
            </label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.showLinkEdges}
                  onChange={(e) => setFilters({ showLinkEdges: e.target.checked })}
                  className="rounded border"
                  style={{
                    accentColor: "var(--color-accent)",
                  }}
                />
                <Link2 size={14} style={{ color: "var(--color-accent)" }} />
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Wiki links
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.showSimilarityEdges}
                  onChange={(e) =>
                    setFilters({ showSimilarityEdges: e.target.checked })
                  }
                  className="rounded border"
                  style={{
                    accentColor: "var(--color-accent)",
                  }}
                />
                <Sparkles size={14} style={{ color: "#9333ea" }} />
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Semantic similarity
                </span>
              </label>
            </div>
          </div>

          {/* Similarity threshold (only shown when similarity is enabled) */}
          {filters.showSimilarityEdges && (
            <div>
              <label
                className="mb-2 flex items-center justify-between text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span>Similarity threshold</span>
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  {Math.round(filters.similarityThreshold * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.05}
                value={filters.similarityThreshold}
                onChange={(e) =>
                  setFilters({ similarityThreshold: parseFloat(e.target.value) })
                }
                className="w-full"
                style={{ accentColor: "var(--color-accent)" }}
              />
            </div>
          )}

          {/* Time range */}
          <div>
            <label
              className="mb-2 block text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Time range
            </label>
            <select
              value={filters.timeRange}
              onChange={(e) =>
                setFilters({ timeRange: e.target.value as FilterType["timeRange"] })
              }
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {timeRangeOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Folder filter */}
          {folders.length > 0 && (
            <div>
              <label
                className="mb-2 block text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Folder
              </label>
              <select
                value={filters.folderIds?.[0] || ""}
                onChange={(e) =>
                  setFilters({
                    folderIds: e.target.value ? [e.target.value] : null,
                  })
                }
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                <option value="">All folders</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

