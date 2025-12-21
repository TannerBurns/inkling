/**
 * Chat and conversation types
 */

/** Role of a message sender */
export type MessageRole = "user" | "assistant" | "system";

/** A chat conversation */
export interface Conversation {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A message in a conversation */
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}

/** Metadata associated with a message */
export interface MessageMetadata {
  /** Notes cited in the response */
  citations: Citation[];
  /** Model used for generation */
  model: string | null;
  /** Token usage statistics */
  usage: TokenUsage | null;
}

/** A citation to a note in an AI response */
export interface Citation {
  noteId: string;
  noteTitle: string;
  /** Relevance score (0-1) */
  relevance: number;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Context item for chat requests (note or snippet to include) */
export interface ContextItem {
  noteId: string;
  noteTitle: string;
  /** Selected content if not the whole note */
  contentSnippet?: string;
  isFullNote: boolean;
}

/** Input for sending a chat message */
export interface SendMessageInput {
  /** The message content */
  content: string;
  /** Conversation ID (undefined to create a new conversation) */
  conversationId?: string;
  /** Session ID for streaming events (frontend-generated) */
  sessionId?: string;
  /** Explicitly attached context (notes/snippets) */
  context: ContextItem[];
  /** Number of notes to auto-retrieve via RAG */
  autoRetrieveCount?: number;
}

/** Response from sending a chat message */
export interface ChatResponse {
  /** The conversation (created or existing) */
  conversation: Conversation;
  /** The user message that was saved */
  userMessage: Message;
  /** The assistant response */
  assistantMessage: Message;
}

/** Input for creating a new conversation */
export interface CreateConversationInput {
  title?: string;
  systemPrompt?: string;
}

/** Input for updating a conversation */
export interface UpdateConversationInput {
  title?: string;
  systemPrompt?: string;
}

/** A conversation with its messages */
export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

/** A conversation preview for the history list */
export interface ConversationPreview {
  conversation: Conversation;
  /** Total number of messages */
  messageCount: number;
  /** First user message content (preview) */
  firstMessagePreview: string | null;
}

/** Stream event types for chat responses */
export type ChatStreamEvent =
  | { type: "chunk"; content: string }
  | { type: "complete"; message: Message }
  | { type: "error"; message: string };

/** Check if a stream event is a chunk */
export function isStreamChunk(
  event: ChatStreamEvent
): event is { type: "chunk"; content: string } {
  return event.type === "chunk";
}

/** Check if a stream event is complete */
export function isStreamComplete(
  event: ChatStreamEvent
): event is { type: "complete"; message: Message } {
  return event.type === "complete";
}

/** Check if a stream event is an error */
export function isStreamError(
  event: ChatStreamEvent
): event is { type: "error"; message: string } {
  return event.type === "error";
}

/** Default values for auto-retrieve count */
export const DEFAULT_AUTO_RETRIEVE_COUNT = 5;

/** Create an empty context item for a note */
export function createNoteContext(
  noteId: string,
  noteTitle: string,
  isFullNote = true,
  contentSnippet?: string
): ContextItem {
  return {
    noteId,
    noteTitle,
    isFullNote,
    contentSnippet,
  };
}
