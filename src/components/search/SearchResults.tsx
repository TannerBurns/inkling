import { FileText, Sparkles, Zap, ArrowRight } from "lucide-react";
import type { SearchResult } from "../../lib/search";

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
  onSelectNote: (noteId: string) => void;
}

/**
 * Display search results with relevance scores
 */
export function SearchResults({
  results,
  isLoading,
  query,
  onSelectNote,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div
        className="py-8 text-center text-sm"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <div className="mb-2 flex justify-center">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--color-accent)" }}
          />
        </div>
        Searching...
      </div>
    );
  }

  if (!query.trim()) {
    return null;
  }

  if (results.length === 0) {
    return (
      <div
        className="py-8 text-center text-sm"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        No results found for &quot;{query}&quot;
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        className="mb-2 px-1 text-xs font-medium"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>

      {results.map((result) => (
        <SearchResultItem
          key={result.noteId}
          result={result}
          query={query}
          onClick={() => onSelectNote(result.noteId)}
        />
      ))}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  onClick: () => void;
}

function SearchResultItem({ result, query, onClick }: SearchResultItemProps) {
  const getModeIcon = () => {
    switch (result.mode) {
      case "fulltext":
        return <FileText size={12} />;
      case "semantic":
        return <Sparkles size={12} />;
      case "hybrid":
        return <Zap size={12} />;
    }
  };

  const getModeColor = () => {
    switch (result.mode) {
      case "fulltext":
        return "var(--color-text-secondary)";
      case "semantic":
        return "var(--color-accent)";
      case "hybrid":
        return "var(--color-success)";
    }
  };

  // Format score as percentage
  const scorePercent = Math.round(result.score * 100);

  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors"
      style={{ backgroundColor: "transparent" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <FileText
          size={16}
          style={{ color: "var(--color-text-secondary)" }}
          className="flex-shrink-0"
        />
        <span
          className="flex-1 truncate font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {highlightMatches(result.title, query)}
        </span>
        <ArrowRight
          size={14}
          className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--color-text-tertiary)" }}
        />
      </div>

      {/* Snippet */}
      {result.snippet && (
        <p
          className="line-clamp-2 pl-6 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {highlightMatches(result.snippet, query)}
        </p>
      )}

      {/* Score and mode */}
      <div className="flex items-center gap-2 pl-6">
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: getModeColor() }}
        >
          {getModeIcon()}
          {result.mode}
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {scorePercent}% match
        </span>
      </div>
    </button>
  );
}

/**
 * Highlight query matches in text
 */
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;

  // Create a regex to match any of the terms
  const regex = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = terms.some(
          (term) => part.toLowerCase() === term.toLowerCase()
        );
        if (isMatch) {
          return (
            <mark
              key={i}
              style={{
                backgroundColor: "var(--color-accent-light)",
                color: "var(--color-accent)",
                borderRadius: "2px",
                padding: "0 2px",
              }}
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default SearchResults;
