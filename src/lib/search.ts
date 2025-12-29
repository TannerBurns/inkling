/**
 * Typed wrappers for Search Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";

/** Search mode */
export type SearchMode = "fulltext" | "semantic" | "hybrid";

/** A search result from the backend */
export interface SearchResult {
  noteId: string;
  title: string;
  snippet: string | null;
  /** Relevance score (0-1, higher is better) */
  score: number;
  /** Which search mode produced this result */
  mode: string;
}

/** Embedding statistics */
export interface EmbeddingStats {
  totalNotes: number;
  embeddedNotes: number;
  pendingNotes: number;
  staleNotes: number;
  currentModel: string | null;
}

/** Embedding model info */
export interface EmbeddingModelInfo {
  id: string;
  displayName: string;
  dimension: number;
  provider: string;
  isLocal: boolean;
}

/**
 * Search notes using the specified mode
 */
export async function searchNotes(
  query: string,
  mode: SearchMode = "hybrid",
  limit?: number
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_notes_unified", {
    query,
    mode,
    limit: limit ?? null,
  });
}

/**
 * Get notes related to a specific note (semantic similarity)
 */
export async function getRelatedNotes(
  noteId: string,
  limit?: number
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("get_related_notes", {
    noteId,
    limit: limit ?? null,
  });
}

/**
 * Get embedding statistics
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  return invoke<EmbeddingStats>("get_embedding_stats");
}

/**
 * Get available embedding models
 */
export async function getEmbeddingModels(): Promise<EmbeddingModelInfo[]> {
  return invoke<EmbeddingModelInfo[]>("get_embedding_models");
}

/** Result of reindexing embeddings */
export interface ReindexResult {
  embeddedCount: number;
  totalNotes: number;
  urlEmbeddedCount: number;
  totalUrls: number;
  errors: string[];
}

/** Result of discovering URLs from notes */
export interface DiscoverUrlsResult {
  discoveredCount: number;
  existingCount: number;
  notesScanned: number;
  errors: string[];
}

/**
 * Discover and index all URLs embedded in notes.
 * Scans all notes for URL embeds and creates URL attachments for any that don't exist.
 * @returns details about discovered URLs
 */
export async function discoverAndIndexUrls(): Promise<DiscoverUrlsResult> {
  return invoke<DiscoverUrlsResult>("discover_and_index_urls");
}

/**
 * Trigger re-indexing of all embeddings.
 * Deletes all existing embeddings and re-generates them for all notes and URL attachments.
 * @returns details about the reindex operation including any errors
 */
export async function reindexEmbeddings(): Promise<ReindexResult> {
  return invoke<ReindexResult>("reindex_embeddings");
}

/**
 * Embed a single note (respects auto_embed setting)
 * Called automatically when notes are created/updated.
 * @returns true if embedding was generated, false if skipped (e.g., auto_embed is off)
 */
export async function embedNote(noteId: string): Promise<boolean> {
  return invoke<boolean>("embed_note", { noteId });
}

/**
 * Force embed a single note (ignores auto_embed setting)
 * Use this for explicit user-initiated embedding.
 * @returns true if embedding was generated, false if skipped
 */
export async function forceEmbedNote(noteId: string): Promise<boolean> {
  return invoke<boolean>("force_embed_note", { noteId });
}

/**
 * Embed multiple notes in batch (ignores auto_embed setting)
 * @returns number of notes successfully embedded
 */
export async function embedNotesBatch(noteIds: string[]): Promise<number> {
  return invoke<number>("embed_notes_batch", { noteIds });
}

/** Result of detecting embedding dimension */
export interface DetectDimensionResult {
  dimension: number;
  model: string;
}

/**
 * Detect the dimension of an embedding model by making a test call.
 * This is useful when selecting a model whose dimension is not known.
 * @param model The full model ID (e.g., "ollama/nomic-embed-text")
 * @returns The detected dimension and actual model name used
 */
export async function detectEmbeddingDimension(
  model: string
): Promise<DetectDimensionResult> {
  return invoke<DetectDimensionResult>("detect_embedding_dimension", { model });
}
