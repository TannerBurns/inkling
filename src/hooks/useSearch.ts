/**
 * useSearch - React hook for search operations
 *
 * Provides unified search functionality (fulltext, semantic, hybrid)
 * and related notes discovery.
 */

import { useState, useCallback } from "react";
import * as searchLib from "../lib/search";
import type { SearchMode, SearchResult, EmbeddingStats } from "../lib/search";

export type { SearchMode, SearchResult, EmbeddingStats };

/** Return type of useSearch hook */
export interface UseSearchResult {
  /** Current search results */
  results: SearchResult[];
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Current search query */
  query: string;
  /** Current search mode */
  mode: SearchMode;
  /** Execute a search */
  search: (query: string, mode?: SearchMode) => Promise<void>;
  /** Clear search results */
  clear: () => void;
  /** Get related notes for a specific note */
  getRelatedNotes: (noteId: string) => Promise<SearchResult[]>;
  /** Get embedding statistics */
  getStats: () => Promise<EmbeddingStats>;
}

/**
 * Hook for search operations
 */
export function useSearch(): UseSearchResult {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");

  /**
   * Execute a search
   */
  const search = useCallback(
    async (searchQuery: string, searchMode?: SearchMode) => {
      const effectiveMode = searchMode ?? mode;
      setQuery(searchQuery);
      setMode(effectiveMode);
      setError(null);

      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);

      try {
        const searchResults = await searchLib.searchNotes(
          searchQuery,
          effectiveMode
        );
        setResults(searchResults);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        setError(message);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [mode]
  );

  /**
   * Clear search results
   */
  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setError(null);
  }, []);

  /**
   * Get related notes for a specific note
   */
  const getRelatedNotes = useCallback(
    async (noteId: string): Promise<SearchResult[]> => {
      try {
        return await searchLib.getRelatedNotes(noteId);
      } catch (err) {
        console.error("Failed to get related notes:", err);
        return [];
      }
    },
    []
  );

  /**
   * Get embedding statistics
   */
  const getStats = useCallback(async (): Promise<EmbeddingStats> => {
    return searchLib.getEmbeddingStats();
  }, []);

  return {
    results,
    isLoading,
    error,
    query,
    mode,
    search,
    clear,
    getRelatedNotes,
    getStats,
  };
}

export default useSearch;
