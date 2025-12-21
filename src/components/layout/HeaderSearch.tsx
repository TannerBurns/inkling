import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Zap, FileText, Sparkles } from "lucide-react";
import { searchNotes, type SearchResult } from "../../lib/search";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

type SearchMode = "fulltext" | "semantic" | "hybrid";

interface HeaderSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Inline search bar with dropdown results
 */
export function HeaderSearch({ isOpen, onClose }: HeaderSearchProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { openTab } = useEditorGroupStore();

  // Focus input when opened via keyboard shortcut
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      if (query.trim()) {
        setShowDropdown(true);
      }
    }
  }, [isOpen, query]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        onClose();
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showDropdown) return;
      
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDropdown, results, selectedIndex, onClose]);

  // Debounced search
  const debouncedSearch = useCallback(
    async (searchQuery: string, searchMode: SearchMode) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!searchQuery.trim()) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      setShowDropdown(true);

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const searchResults = await searchNotes(searchQuery, searchMode);
          setResults(searchResults);
          setSelectedIndex(0);
        } catch (err) {
          console.error("Search failed:", err);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 200);
    },
    []
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value, mode);
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (query.trim()) {
      debouncedSearch(query, newMode);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    openTab({ type: "note", id: result.noteId });
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    onClose();
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (query.trim()) {
      setShowDropdown(true);
      debouncedSearch(query, mode);
    }
  };

  const getModeIcon = (m: SearchMode) => {
    switch (m) {
      case "fulltext":
        return <FileText size={12} />;
      case "semantic":
        return <Sparkles size={12} />;
      case "hybrid":
        return <Zap size={12} />;
    }
  };

  const getModeLabel = (m: SearchMode) => {
    switch (m) {
      case "fulltext":
        return "Text Search";
      case "semantic":
        return "AI Search";
      case "hybrid":
        return "Hybrid Search";
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Input Row */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: showDropdown ? "var(--color-accent)" : "var(--color-border)",
        }}
      >
        <Search
          size={16}
          style={{ color: "var(--color-text-tertiary)" }}
          className={isSearching ? "animate-pulse" : ""}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          placeholder="Search notes..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--color-text-primary)" }}
        />
        
        {/* Mode Toggle - inline with hover tooltips */}
        <div
          className="flex items-center gap-0.5 rounded-md p-0.5"
          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
        >
          {(["hybrid", "fulltext", "semantic"] as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange(m);
              }}
              className="group relative flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{
                backgroundColor:
                  mode === m ? "var(--color-bg-primary)" : "transparent",
                color:
                  mode === m
                    ? "var(--color-accent)"
                    : "var(--color-text-tertiary)",
              }}
            >
              {getModeIcon(m)}
              {/* Tooltip */}
              <span
                className="pointer-events-none absolute -bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {getModeLabel(m)}
              </span>
            </button>
          ))}
        </div>

        {query && (
          <button
            onClick={handleClear}
            className="rounded p-0.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={14} />
          </button>
        )}
        
        <span
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          ⌘K
        </span>
      </div>

      {/* Results Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {isSearching ? (
              <div
                className="flex items-center justify-center py-6"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <div
                  className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: "var(--color-accent)" }}
                />
                Searching...
              </div>
            ) : results.length === 0 && query.trim() ? (
              <div
                className="flex flex-col items-center justify-center py-6 text-center"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <FileText size={24} strokeWidth={1} />
                <p className="mt-2 text-sm">No results found</p>
              </div>
            ) : results.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-6 text-center"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <p className="text-sm">Type to search your notes</p>
              </div>
            ) : (
              results.map((result, index) => (
                <SearchResultItem
                  key={result.noteId}
                  result={result}
                  isSelected={index === selectedIndex}
                  onSelect={() => handleSelectResult(result)}
                  onHover={() => setSelectedIndex(index)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div
              className="flex items-center justify-between border-t px-3 py-1.5 text-xs"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-tertiary)",
              }}
            >
              <span>{results.length} results</span>
              <div className="flex items-center gap-2">
                <span>↑↓ navigate</span>
                <span>↵ select</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function SearchResultItem({ result, isSelected, onSelect, onHover }: SearchResultItemProps) {
  const scorePercent = Math.round(result.score * 100);

  const getModeColor = () => {
    switch (result.mode) {
      case "semantic":
        return "var(--color-accent)";
      case "hybrid":
        return "var(--color-success)";
      default:
        return "var(--color-text-tertiary)";
    }
  };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      className="cursor-pointer px-3 py-2 transition-colors"
      style={{
        backgroundColor: isSelected ? "var(--color-bg-hover)" : "transparent",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText
            size={14}
            style={{ color: "var(--color-text-tertiary)" }}
            className="flex-shrink-0"
          />
          <span
            className="truncate text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            {result.title}
          </span>
        </div>
        <span
          className="flex-shrink-0 text-xs"
          style={{ color: getModeColor() }}
        >
          {scorePercent}%
        </span>
      </div>
      {result.snippet && (
        <p
          className="mt-0.5 line-clamp-1 pl-5 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {result.snippet}
        </p>
      )}
    </div>
  );
}

export default HeaderSearch;
