import { useState, useEffect, useCallback } from "react";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import type { Tag } from "../../types/note";
import * as api from "../../lib/tauri";
import { TagBadge } from "../notes/TagBadge";

/**
 * Tags settings tab - manage all tags in the vault
 */
export function TagsSettings() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all tags
  const fetchTags = useCallback(async () => {
    try {
      setError(null);
      const allTags = await api.getAllTags();
      setTags(allTags);
    } catch (err) {
      console.warn("Failed to fetch tags:", err);
      setError("Failed to load tags");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Delete a tag
  const handleDeleteTag = async (tagId: string, tagName: string) => {
    // Confirm deletion
    const confirmed = window.confirm(
      `Delete tag "${tagName}"?\n\nThis will remove the tag from all notes that use it.`
    );
    if (!confirmed) return;

    setDeletingTagId(tagId);
    try {
      await api.deleteTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      console.warn("Failed to delete tag:", err);
      setError("Failed to delete tag");
    } finally {
      setDeletingTagId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Manage your tags. Deleting a tag will remove it from all notes.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg border p-3"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderColor: "rgba(239, 68, 68, 0.3)",
            color: "rgb(239, 68, 68)",
          }}
        >
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Tags list */}
      <div
        className="rounded-lg border"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              size={24}
              className="animate-spin"
              style={{ color: "var(--color-text-tertiary)" }}
            />
          </div>
        ) : tags.length === 0 ? (
          <div className="py-8 text-center">
            <p
              className="text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No tags yet
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Tags will appear here as you create them on your notes
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <TagBadge tag={tag} size="md" />
                <button
                  onClick={() => handleDeleteTag(tag.id, tag.name)}
                  disabled={deletingTagId === tag.id}
                  className="rounded-lg p-2 transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                  style={{
                    color:
                      deletingTagId === tag.id
                        ? "var(--color-text-tertiary)"
                        : "rgb(239, 68, 68)",
                  }}
                  title="Delete tag"
                >
                  {deletingTagId === tag.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tag count */}
      {!isLoading && tags.length > 0 && (
        <p
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {tags.length} tag{tags.length !== 1 ? "s" : ""} total
        </p>
      )}
    </div>
  );
}

export default TagsSettings;
