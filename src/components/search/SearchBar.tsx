import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Zap, FileText, Sparkles } from "lucide-react";

export type SearchMode = "fulltext" | "semantic" | "hybrid";

interface SearchBarProps {
  onSearch: (query: string, mode: SearchMode) => void;
  onClear: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

/**
 * Search bar with mode toggle (fulltext/semantic/hybrid)
 * Supports keyboard shortcut (Cmd+K) to focus
 */
export function SearchBar({
  onSearch,
  onClear,
  isLoading = false,
  placeholder = "Search notes...",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setQuery("");
        onClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClear]);

  // Debounced search
  const debouncedSearch = useCallback(
    (searchQuery: string, searchMode: SearchMode) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (searchQuery.trim()) {
          onSearch(searchQuery, searchMode);
        } else {
          onClear();
        }
      }, 300);
    },
    [onSearch, onClear]
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value, mode);
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (query.trim()) {
      onSearch(query, newMode);
    }
  };

  const handleClear = () => {
    setQuery("");
    onClear();
    inputRef.current?.focus();
  };

  const getModeIcon = (m: SearchMode) => {
    switch (m) {
      case "fulltext":
        return <FileText size={14} />;
      case "semantic":
        return <Sparkles size={14} />;
      case "hybrid":
        return <Zap size={14} />;
    }
  };

  const getModeLabel = (m: SearchMode) => {
    switch (m) {
      case "fulltext":
        return "Text";
      case "semantic":
        return "Semantic";
      case "hybrid":
        return "Hybrid";
    }
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: isOpen ? "var(--color-accent)" : "var(--color-border)",
        }}
      >
        <Search
          size={18}
          style={{ color: "var(--color-text-tertiary)" }}
          className={isLoading ? "animate-pulse" : ""}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--color-text-primary)" }}
        />
        {query && (
          <button
            onClick={handleClear}
            className="rounded p-0.5 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-text-tertiary)")
            }
          >
            <X size={16} />
          </button>
        )}
        <span
          className="hidden text-xs sm:inline"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          ⌘K
        </span>
      </div>

      {/* Mode Toggle */}
      {isOpen && (
        <div
          className="mt-2 flex gap-1 rounded-lg p-1"
          style={{ backgroundColor: "var(--color-bg-secondary)" }}
        >
          {(["fulltext", "semantic", "hybrid"] as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  mode === m ? "var(--color-bg-primary)" : "transparent",
                color:
                  mode === m
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                boxShadow: mode === m ? "var(--shadow-sm)" : "none",
              }}
              onMouseEnter={(e) => {
                if (mode !== m) {
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (mode !== m) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              {getModeIcon(m)}
              {getModeLabel(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
