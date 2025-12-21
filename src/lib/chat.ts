/**
 * Typed wrappers for Chat Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Conversation,
  Message,
  SendMessageInput,
  ChatResponse,
  CreateConversationInput,
  UpdateConversationInput,
  ConversationWithMessages,
  ConversationPreview,
  ChatStreamEvent,
} from "../types/chat";

// ============================================================================
// Conversation Management
// ============================================================================

/**
 * Create a new conversation
 */
export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  return invoke<Conversation>("create_conversation", { input });
}

/**
 * Get a conversation by ID
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  return invoke<Conversation | null>("get_conversation", { id });
}

/**
 * Get a conversation with all its messages
 */
export async function getConversationWithMessages(
  id: string
): Promise<ConversationWithMessages | null> {
  return invoke<ConversationWithMessages | null>("get_conversation_with_messages", { id });
}

/**
 * List all conversations
 */
export async function listConversations(): Promise<Conversation[]> {
  return invoke<Conversation[]>("list_conversations");
}

/**
 * List all conversation previews with message counts
 */
export async function listConversationPreviews(): Promise<ConversationPreview[]> {
  return invoke<ConversationPreview[]>("list_conversation_previews");
}

/**
 * Update a conversation (title or system prompt)
 */
export async function updateConversation(
  id: string,
  input: UpdateConversationInput
): Promise<Conversation> {
  return invoke<Conversation>("update_conversation", { id, input });
}

/**
 * Delete a conversation
 */
export async function deleteConversation(id: string): Promise<boolean> {
  return invoke<boolean>("delete_conversation", { id });
}

/**
 * Get messages for a conversation (paginated)
 */
export async function getConversationMessages(
  conversationId: string,
  limit?: number,
  offset?: number
): Promise<Message[]> {
  return invoke<Message[]>("get_conversation_messages", {
    conversationId,
    limit: limit ?? null,
    offset: offset ?? null,
  });
}

// ============================================================================
// Chat / Messaging
// ============================================================================

/**
 * Send a chat message with streaming response
 */
export async function sendMessage(input: SendMessageInput): Promise<ChatResponse> {
  return invoke<ChatResponse>("send_chat_message", { input });
}

/**
 * Send a chat message without streaming (simpler, for testing)
 */
export async function sendMessageSync(input: SendMessageInput): Promise<ChatResponse> {
  return invoke<ChatResponse>("send_chat_message_sync", { input });
}

/**
 * Edit a message and regenerate the response
 * This deletes all messages from the edited message onwards and regenerates
 */
export async function editMessageAndRegenerate(
  messageId: string,
  newContent: string
): Promise<ChatResponse> {
  return invoke<ChatResponse>("edit_message_and_regenerate", {
    messageId,
    newContent,
  });
}

/**
 * Stop an active generation stream
 * @param sessionId The session ID of the stream to stop
 * @returns true if a stream was found and stopped, false otherwise
 */
export async function stopGeneration(sessionId: string): Promise<boolean> {
  return invoke<boolean>("stop_generation", { sessionId });
}

/**
 * Get the default system prompt
 */
export async function getDefaultSystemPrompt(): Promise<string> {
  return invoke<string>("get_default_system_prompt");
}

// ============================================================================
// Streaming Support
// ============================================================================

/**
 * Listen to chat stream events for a conversation
 * Returns an unlisten function to stop listening
 */
export async function listenToStream(
  conversationId: string,
  callback: (event: ChatStreamEvent) => void
): Promise<UnlistenFn> {
  const eventName = `chat-stream-${conversationId}`;
  return listen<ChatStreamEvent>(eventName, (event) => {
    callback(event.payload);
  });
}

/**
 * Create a stream listener that auto-cleans up
 */
export function createStreamListener(
  conversationId: string,
  options: {
    onChunk?: (content: string) => void;
    onComplete?: (message: Message) => void;
    onError?: (error: string) => void;
  }
): { start: () => Promise<void>; stop: () => void } {
  let unlisten: UnlistenFn | null = null;

  return {
    start: async () => {
      unlisten = await listenToStream(conversationId, (event) => {
        switch (event.type) {
          case "chunk":
            options.onChunk?.(event.content);
            break;
          case "complete":
            options.onComplete?.(event.message);
            break;
          case "error":
            options.onError?.(event.message);
            break;
        }
      });
    },
    stop: () => {
      unlisten?.();
      unlisten = null;
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a message timestamp for display
 */
export function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a conversation timestamp for display (relative time)
 */
export function formatConversationTime(updatedAt: string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Truncate conversation title for display
 */
export function truncateTitle(title: string | null, maxLen = 40): string {
  if (!title) return "New Conversation";
  if (title.length <= maxLen) return title;
  return `${title.slice(0, maxLen - 3)}...`;
}
