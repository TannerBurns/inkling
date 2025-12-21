import { useState, useEffect, useRef } from "react";
import { getBacklinks, type Backlink } from "../lib/links";

interface UseBacklinksResult {
  backlinks: Backlink[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch backlinks for a given note ID
 * Shows notes that link TO this note
 */
export function useBacklinks(
  noteId: string | null,
  debounceMs: number = 300
): UseBacklinksResult {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBacklinks = async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await getBacklinks(id);
      setBacklinks(results);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBacklinks([]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Clear results if no note selected
    if (!noteId) {
      setBacklinks([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Debounce the fetch
    debounceRef.current = setTimeout(() => {
      fetchBacklinks(noteId);
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [noteId, debounceMs]);

  const refetch = () => {
    if (noteId) {
      fetchBacklinks(noteId);
    }
  };

  return {
    backlinks,
    isLoading,
    error,
    refetch,
  };
}

export default useBacklinks;
