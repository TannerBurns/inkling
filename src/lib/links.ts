/**
 * Typed wrappers for Link Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";

/** A backlink from another note */
export interface Backlink {
  sourceNoteId: string;
  sourceTitle: string;
  context: string | null;
}

/** Link statistics for a note */
export interface LinkStats {
  outgoingCount: number;
  incomingCount: number;
}

/** Input for syncing links */
export interface SyncLinkInput {
  targetNoteId: string;
  context: string | null;
}

/** Note summary for autocomplete */
export interface NoteSummary {
  id: string;
  title: string;
  folderId: string | null;
}

/** A note link */
export interface NoteLink {
  sourceNoteId: string;
  targetNoteId: string;
  context: string | null;
}

/**
 * Get all notes that link to a specific note (backlinks)
 */
export async function getBacklinks(noteId: string): Promise<Backlink[]> {
  return invoke<Backlink[]>("get_backlinks", { noteId });
}

/**
 * Get link statistics for a note
 */
export async function getLinkStats(noteId: string): Promise<LinkStats> {
  return invoke<LinkStats>("get_link_stats", { noteId });
}

/**
 * Sync all outgoing links for a note
 * Called after saving a note to update link tracking
 */
export async function syncNoteLinks(
  noteId: string,
  links: SyncLinkInput[]
): Promise<void> {
  return invoke("sync_note_links", { noteId, links });
}

/**
 * Search notes by title for wiki-link autocomplete
 */
export async function searchNotesForMention(
  query: string,
  excludeId?: string,
  limit?: number
): Promise<NoteSummary[]> {
  return invoke<NoteSummary[]>("search_notes_for_mention", {
    query,
    excludeId: excludeId ?? null,
    limit: limit ?? null,
  });
}

/**
 * Get outgoing links from a note
 */
export async function getOutgoingLinks(noteId: string): Promise<NoteLink[]> {
  return invoke<NoteLink[]>("get_outgoing_links", { noteId });
}

/**
 * Extract wiki links from HTML content
 * Parses the content to find all [[note]] references
 * Returns an array of link inputs to sync with the backend
 */
export function extractLinksFromHtml(
  html: string,
  noteId: string
): SyncLinkInput[] {
  // Create a temporary DOM element to parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Find all wiki-link elements (spans with data-wiki-link attribute)
  const wikiLinks = doc.querySelectorAll("span[data-wiki-link]");
  const links: SyncLinkInput[] = [];
  const seenIds = new Set<string>();

  wikiLinks.forEach((el) => {
    const targetId = el.getAttribute("data-note-id");
    if (targetId && targetId !== noteId && !seenIds.has(targetId)) {
      seenIds.add(targetId);
      
      // Get surrounding context (parent paragraph or nearby text)
      const parent = el.closest("p") ?? el.parentElement;
      const context = parent?.textContent?.slice(0, 100) ?? null;
      
      links.push({
        targetNoteId: targetId,
        context,
      });
    }
  });

  return links;
}
