/**
 * Hooks barrel export
 */

export {
  useAI,
  default as useAIDefault,
} from "./useAI";

export type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelInfo,
  UseAIResult,
  StreamEventType,
  StreamEvent,
  StreamCallbacks,
  StreamController,
} from "./useAI";

export {
  useSearch,
  default as useSearchDefault,
} from "./useSearch";

export type {
  SearchMode,
  SearchResult,
  EmbeddingStats,
  UseSearchResult,
} from "./useSearch";

export {
  useRelatedNotes,
  default as useRelatedNotesDefault,
} from "./useRelatedNotes";

export {
  useBacklinks,
  default as useBacklinksDefault,
} from "./useBacklinks";
