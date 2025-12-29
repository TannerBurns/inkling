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
  /** Tool calls made during this response */
  toolCalls?: ToolCallRecord[];
  /** Thinking/reasoning content from the AI */
  thinkingContent?: string | null;
}

/** A record of a tool call made during message generation */
export interface ToolCallRecord {
  /** Name of the tool that was called */
  tool: string;
  /** Whether the tool call succeeded */
  success: boolean;
  /** Optional preview/summary of the result */
  preview?: string;
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

/** Folder context item for chat requests (includes all notes in folder) */
export interface FolderContextItem {
  folderId: string;
  folderName: string;
  /** Number of notes in this folder (for display) */
  noteCount: number;
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
  | { type: "thinking"; content: string }
  | { type: "tool_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; success: boolean; preview?: string }
  | { type: "complete"; message: Message }
  | { type: "error"; message: string };

/** Check if a stream event is a chunk */
export function isStreamChunk(
  event: ChatStreamEvent
): event is { type: "chunk"; content: string } {
  return event.type === "chunk";
}

/** Check if a stream event is a tool start event */
export function isStreamToolStart(
  event: ChatStreamEvent
): event is { type: "tool_start"; tool: string; args: Record<string, unknown> } {
  return event.type === "tool_start";
}

/** Check if a stream event is a tool result event */
export function isStreamToolResult(
  event: ChatStreamEvent
): event is { type: "tool_result"; tool: string; success: boolean; preview?: string } {
  return event.type === "tool_result";
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

/** Create a context item for a folder */
export function createFolderContext(
  folderId: string,
  folderName: string,
  noteCount: number
): FolderContextItem {
  return {
    folderId,
    folderName,
    noteCount,
  };
}
