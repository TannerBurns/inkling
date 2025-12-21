import { useState, useEffect, useRef } from "react";
import { getRelatedNotes, type SearchResult } from "../lib/search";

interface UseRelatedNotesResult {
  relatedNotes: SearchResult[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch semantically related notes for a given note ID
 * Debounces fetches to avoid rapid API calls when switching notes quickly
 */
export function useRelatedNotes(
  noteId: string | null,
  limit: number = 5,
  debounceMs: number = 300
): UseRelatedNotesResult {
  const [relatedNotes, setRelatedNotes] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRelatedNotes = async (id: string) => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const results = await getRelatedNotes(id, limit);
      // Only update if this request wasn't aborted
      if (!abortRef.current?.signal.aborted) {
        setRelatedNotes(results);
        setIsLoading(false);
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (!abortRef.current?.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
        setRelatedNotes([]);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Clear results if no note selected
    if (!noteId) {
      setRelatedNotes([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Debounce the fetch
    debounceRef.current = setTimeout(() => {
      fetchRelatedNotes(noteId);
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [noteId, limit, debounceMs]);

  const refetch = () => {
    if (noteId) {
      fetchRelatedNotes(noteId);
    }
  };

  return {
    relatedNotes,
    isLoading,
    error,
    refetch,
  };
}

export default useRelatedNotes;
