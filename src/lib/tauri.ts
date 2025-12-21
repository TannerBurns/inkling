/**
 * Typed wrappers for Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  Note,
  Folder,
  Tag,
  CreateNoteInput,
  UpdateNoteInput,
  CreateFolderInput,
  UpdateFolderInput,
} from "../types/note";

/**
 * Result of running the tagging agent
 */
export interface TaggingResult {
  tags: Tag[];
  summary: string;
  iterations: number;
  toolCalls: ToolCallRecord[];
}

/**
 * Record of a tool call made by an agent
 */
export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
}

// ============================================================================
// Note Commands
// ============================================================================

/**
 * Create a new note
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  return invoke<Note>("create_note", {
    title: input.title,
    content: input.content ?? null,
    contentHtml: input.contentHtml ?? null,
    folderId: input.folderId ?? null,
  });
}

/**
 * Get a note by ID
 */
export async function getNote(id: string): Promise<Note | null> {
  return invoke<Note | null>("get_note", { id });
}

/**
 * Get all non-deleted notes
 */
export async function getAllNotes(): Promise<Note[]> {
  return invoke<Note[]>("get_all_notes");
}

/**
 * Get notes in a specific folder (or root notes if folderId is null)
 */
export async function getNotesInFolder(
  folderId: string | null,
): Promise<Note[]> {
  return invoke<Note[]>("get_notes_in_folder", { folderId });
}

/**
 * Update an existing note
 */
export async function updateNote(
  id: string,
  input: UpdateNoteInput,
): Promise<Note> {
  return invoke<Note>("update_note", {
    id,
    title: input.title ?? null,
    content: input.content ?? null,
    contentHtml: input.contentHtml ?? null,
    folderId: input.folderId ?? null,
  });
}

/**
 * Move a note to a different folder (or to root/unfiled if folderId is null)
 */
export async function moveNoteToFolder(
  noteId: string,
  folderId: string | null,
): Promise<Note> {
  return invoke<Note>("move_note_to_folder", { noteId, folderId });
}

/**
 * Soft delete a note
 */
export async function deleteNote(id: string): Promise<boolean> {
  return invoke<boolean>("delete_note", { id });
}

/**
 * Search notes by title or content
 */
export async function searchNotes(query: string): Promise<Note[]> {
  return invoke<Note[]>("search_notes", { query });
}

// ============================================================================
// Folder Commands
// ============================================================================

/**
 * Create a new folder
 */
export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  return invoke<Folder>("create_folder", {
    name: input.name,
    parentId: input.parentId ?? null,
  });
}

/**
 * Get a folder by ID
 */
export async function getFolder(id: string): Promise<Folder | null> {
  return invoke<Folder | null>("get_folder", { id });
}

/**
 * Get all folders
 */
export async function getAllFolders(): Promise<Folder[]> {
  return invoke<Folder[]>("get_all_folders");
}

/**
 * Get child folders of a parent (or root folders if parentId is null)
 */
export async function getChildFolders(
  parentId: string | null,
): Promise<Folder[]> {
  return invoke<Folder[]>("get_child_folders", { parentId });
}

/**
 * Update an existing folder
 */
export async function updateFolder(
  id: string,
  input: UpdateFolderInput,
): Promise<Folder> {
  return invoke<Folder>("update_folder", {
    id,
    name: input.name ?? null,
    parentId: input.parentId ?? null,
  });
}

/**
 * Delete a folder
 */
export async function deleteFolder(id: string): Promise<boolean> {
  return invoke<boolean>("delete_folder", { id });
}

// ============================================================================
// Tag Commands
// ============================================================================

/**
 * Get all tags
 */
export async function getAllTags(): Promise<Tag[]> {
  return invoke<Tag[]>("get_all_tags");
}

/**
 * Search tags by name
 */
export async function searchTags(query: string): Promise<Tag[]> {
  return invoke<Tag[]>("search_tags", { query });
}

/**
 * Get tags for a specific note
 */
export async function getNoteTags(noteId: string): Promise<Tag[]> {
  return invoke<Tag[]>("get_note_tags", { noteId });
}

/**
 * Create a new tag
 */
export async function createTag(
  name: string,
  color?: string | null,
): Promise<Tag> {
  return invoke<Tag>("create_tag", { name, color: color ?? null });
}

/**
 * Add a tag to a note (creates the tag if it doesn't exist)
 */
export async function addTagToNote(
  noteId: string,
  tagName: string,
  color?: string | null,
): Promise<Tag> {
  return invoke<Tag>("add_tag_to_note", {
    noteId,
    tagName,
    color: color ?? null,
  });
}

/**
 * Remove a tag from a note
 */
export async function removeTagFromNote(
  noteId: string,
  tagId: string,
): Promise<boolean> {
  return invoke<boolean>("remove_tag_from_note", { noteId, tagId });
}

/**
 * Delete a tag entirely
 */
export async function deleteTag(tagId: string): Promise<boolean> {
  return invoke<boolean>("delete_tag", { tagId });
}

/**
 * Update a tag
 */
export async function updateTag(
  tagId: string,
  name?: string | null,
  color?: string | null,
): Promise<Tag> {
  return invoke<Tag>("update_tag", {
    tagId,
    name: name ?? null,
    color: color ?? null,
  });
}

// ============================================================================
// Tagging Agent Commands
// ============================================================================

/**
 * Run the tagging agent on a note
 *
 * This triggers the AI tagging agent to analyze the note content
 * and automatically assign appropriate tags.
 */
export async function runTaggingAgent(noteId: string): Promise<TaggingResult> {
  return invoke<TaggingResult>("run_tagging_agent_cmd", { noteId });
}

// ============================================================================
// Daily Notes Commands
// ============================================================================

/**
 * Get or create the Daily Notes system folder
 */
export async function getOrCreateDailyNotesFolder(): Promise<Folder> {
  return invoke<Folder>("get_or_create_daily_notes_folder");
}

/**
 * Get a daily note for a specific date
 * @param date - Date in YYYY-MM-DD format
 */
export async function getDailyNote(date: string): Promise<Note | null> {
  return invoke<Note | null>("get_daily_note", { date });
}

/**
 * Create a daily note for a specific date
 * @param date - Date in YYYY-MM-DD format
 * @param content - Optional initial content
 * @param contentHtml - Optional initial HTML content
 */
export async function createDailyNote(
  date: string,
  content?: string | null,
  contentHtml?: string | null,
): Promise<Note> {
  return invoke<Note>("create_daily_note", {
    date,
    content: content ?? null,
    contentHtml: contentHtml ?? null,
  });
}

/**
 * Get the adjacent daily note (previous or next)
 * @param date - Current date in YYYY-MM-DD format
 * @param direction - 'prev' or 'next'
 */
export async function getAdjacentDailyNote(
  date: string,
  direction: "prev" | "next",
): Promise<Note | null> {
  return invoke<Note | null>("get_adjacent_daily_note", { date, direction });
}

/**
 * Get all daily notes sorted by date (newest first)
 */
export async function getAllDailyNotes(): Promise<Note[]> {
  return invoke<Note[]>("get_all_daily_notes");
}

/**
 * Check if a note is a daily note (belongs to the Daily Notes folder)
 * @param noteId - The note ID to check
 */
export async function isDailyNote(noteId: string): Promise<boolean> {
  return invoke<boolean>("is_daily_note", { noteId });
}
