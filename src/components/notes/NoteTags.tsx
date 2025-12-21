import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import type { Tag } from "../../types/note";
import * as api from "../../lib/tauri";
import { TagBadge } from "./TagBadge";

interface NoteTagsProps {
  noteId: string;
}

/** Available tag colors */
const TAG_COLORS = [
  { name: "gray", label: "Gray" },
  { name: "red", label: "Red" },
  { name: "orange", label: "Orange" },
  { name: "yellow", label: "Yellow" },
  { name: "green", label: "Green" },
  { name: "blue", label: "Blue" },
  { name: "purple", label: "Purple" },
  { name: "pink", label: "Pink" },
] as const;

/** Color CSS values for the picker */
const colorValues: Record<string, string> = {
  gray: "rgb(107, 114, 128)",
  red: "rgb(239, 68, 68)",
  orange: "rgb(249, 115, 22)",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(34, 197, 94)",
  blue: "rgb(59, 130, 246)",
  purple: "rgb(168, 85, 247)",
  pink: "rgb(236, 72, 153)",
};

/**
 * Component for displaying and managing tags on a note
 */
export function NoteTags({ noteId }: NoteTagsProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch tags for this note
  const fetchTags = useCallback(async () => {
    try {
      const noteTags = await api.getNoteTags(noteId);
      setTags(noteTags);
    } catch (err) {
      console.warn("Failed to fetch note tags:", err);
    } finally {
      setIsLoading(false);
    }
  }, [noteId]);

  // Fetch all tags for autocomplete
  const fetchAllTags = useCallback(async () => {
    try {
      const all = await api.getAllTags();
      setAllTags(all);
    } catch (err) {
      console.warn("Failed to fetch all tags:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    fetchTags();
    fetchAllTags();
  }, [noteId, fetchTags, fetchAllTags]);

  // Update suggestions based on input
  useEffect(() => {
    // Reset color picker when input changes
    setShowColorPicker(false);
    
    if (!inputValue.trim()) {
      setSuggestions([]);
      return;
    }

    const query = inputValue.toLowerCase();
    const filtered = allTags
      .filter(
        (tag) =>
          tag.name.toLowerCase().includes(query) &&
          !tags.some((t) => t.id === tag.id)
      )
      .slice(0, 5);

    setSuggestions(filtered);
    setSelectedSuggestionIndex(0);
  }, [inputValue, allTags, tags]);

  // Handle clicking outside to close input
  useEffect(() => {
    if (!isAdding) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsAdding(false);
        setInputValue("");
        setShowColorPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isAdding]);

  // Focus input when adding
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Handle adding a tag (with optional color for new tags)
  const handleAddTag = async (tagName: string, color?: string) => {
    if (!tagName.trim()) return;

    try {
      // If adding an existing tag, don't pass color (use existing)
      // If creating new tag, use selectedColor
      const tag = await api.addTagToNote(noteId, tagName.trim(), color);
      setTags((prev) => [...prev, tag]);
      setInputValue("");
      setIsAdding(false);
      setShowColorPicker(false);
      // Refresh all tags in case a new one was created
      fetchAllTags();
    } catch (err) {
      console.warn("Failed to add tag:", err);
    }
  };

  // Handle removing a tag
  const handleRemoveTag = async (tagId: string) => {
    try {
      await api.removeTagFromNote(noteId, tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      console.warn("Failed to remove tag:", err);
    }
  };

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showColorPicker) {
        // Color picker is open - user needs to click a color
        // Do nothing on Enter
      } else if (suggestions.length > 0 && selectedSuggestionIndex < suggestions.length) {
        // Add existing tag
        handleAddTag(suggestions[selectedSuggestionIndex].name);
      } else if (inputValue.trim()) {
        // Show color picker for new tag
        setShowColorPicker(true);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        Math.min(prev + 1, suggestions.length)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      if (showColorPicker) {
        setShowColorPicker(false);
      } else {
        setIsAdding(false);
        setInputValue("");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          Loading tags...
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5 py-1">
      {/* Existing tags */}
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onRemove={() => handleRemoveTag(tag.id)}
          size="sm"
        />
      ))}

      {/* Add tag button/input */}
      {isAdding ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tag..."
            className="rounded-full border px-2 py-0.5 text-xs outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              width: "120px",
            }}
          />
          
          {/* Color picker dropdown */}
          {showColorPicker && inputValue.trim() && (
            <div
              className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border shadow-lg"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                <div className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Choose color for &quot;{inputValue.trim()}&quot;
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 p-3">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Directly create the tag with this color
                      handleAddTag(inputValue, color.name);
                    }}
                    className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg transition-all hover:scale-105 hover:ring-2 hover:ring-white/50"
                    style={{
                      backgroundColor: colorValues[color.name],
                    }}
                    title={`Create with ${color.label}`}
                  >
                    <span className="text-xs font-medium text-white drop-shadow-sm">
                      {color.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions dropdown */}
          {!showColorPicker && suggestions.length > 0 && (
            <div
              className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border shadow-lg"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              {suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    backgroundColor:
                      index === selectedSuggestionIndex
                        ? "var(--color-bg-hover)"
                        : "transparent",
                    color: "var(--color-text-primary)",
                  }}
                  onClick={() => handleAddTag(tag.name)}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                >
                  <TagBadge tag={tag} size="sm" />
                </button>
              ))}
              {inputValue.trim() && !suggestions.some(
                (s) => s.name.toLowerCase() === inputValue.trim().toLowerCase()
              ) && (
                <button
                  className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                    backgroundColor:
                      selectedSuggestionIndex === suggestions.length
                        ? "var(--color-bg-hover)"
                        : "transparent",
                  }}
                  onClick={() => setShowColorPicker(true)}
                  onMouseEnter={() => setSelectedSuggestionIndex(suggestions.length)}
                >
                  <Plus size={14} />
                  <span>Create &quot;{inputValue.trim()}&quot;</span>
                </button>
              )}
            </div>
          )}
          
          {/* Show create option when no suggestions match */}
          {!showColorPicker && suggestions.length === 0 && inputValue.trim() && (
            <div
              className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border shadow-lg"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-bg-hover)",
                }}
                onClick={() => setShowColorPicker(true)}
              >
                <Plus size={14} />
                <span>Create &quot;{inputValue.trim()}&quot;</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors hover:border-solid"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-tertiary)",
          }}
          title="Add tag"
        >
          <Plus size={12} />
          <span>Add tag</span>
        </button>
      )}
    </div>
  );
}

export default NoteTags;
