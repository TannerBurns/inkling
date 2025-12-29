import { create } from "zustand";
import type {
  Conversation,
  ConversationPreview,
  Message,
  ContextItem,
  FolderContextItem,
  SendMessageInput,
  ChatResponse,
  ToolCallRecord,
} from "../types/chat";
import * as chatApi from "../lib/chat";
import { useNoteStore } from "./noteStore";
import { useEditorGroupStore } from "./editorGroupStore";
import { useFolderStore } from "./folderStore";

/** Mode for the right sidebar */
export type RightSidebarMode = "assistant" | "notes" | "chat";

interface ChatState {
  // Sidebar state
  rightSidebarMode: RightSidebarMode;
  isChatOpen: boolean;
  isLeftPanelVisible: boolean;
  isRightSidebarVisible: boolean;

  // Conversation state
  conversationPreviews: ConversationPreview[];
  currentConversationId: string | null;
  messages: Message[];
  
  // Tab state (decoupled from conversation history)
  openTabIds: string[];

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  thinkingContent: string;
  currentSessionId: string | null;
  
  // Tool execution state (for agentic chat)
  activeToolCalls: Array<{ tool: string; args: Record<string, unknown> }>;
  toolResults: ToolCallRecord[];
  /** Whether tools have been used in this streaming session (for routing chunks) */
  hasUsedTools: boolean;
  /** Whether we're in the final response phase (after all tools complete) */
  inFinalResponsePhase: boolean;

  // Context state
  attachedContext: ContextItem[];
  attachedFolders: FolderContextItem[];
  
  // Pending badge insertion (for programmatic badge insertion into ChatInput)
  pendingBadges: Array<{ type: "note" | "folder"; id: string; name: string; noteCount?: number }>;

  // Loading/error state
  isLoading: boolean;
  error: string | null;

  // Actions - Sidebar
  setRightSidebarMode: (mode: RightSidebarMode) => void;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  toggleLeftPanel: () => void;
  setLeftPanelVisible: (visible: boolean) => void;
  toggleRightSidebar: () => void;
  setRightSidebarVisible: (visible: boolean) => void;

  // Actions - Conversations
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  createConversation: (title?: string, systemPrompt?: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, title?: string, systemPrompt?: string) => Promise<void>;
  
  // Actions - Tabs (UI only, doesn't affect database)
  openTab: (id: string) => void;
  closeTab: (id: string) => void;

  // Actions - Messages
  sendMessage: (content: string) => Promise<ChatResponse | null>;
  sendMessageSync: (content: string) => Promise<ChatResponse | null>;
  editMessage: (messageId: string, newContent: string) => Promise<ChatResponse | null>;

  // Actions - Context
  addContext: (item: ContextItem, addBadge?: boolean) => void;
  removeContext: (noteId: string) => void;
  clearContext: () => void;
  setContext: (items: ContextItem[]) => void;
  
  // Actions - Folder Context
  addFolderContext: (item: FolderContextItem, addBadge?: boolean) => void;
  removeFolderContext: (folderId: string) => void;
  clearFolderContext: () => void;
  
  // Actions - Pending Badges (for programmatic insertion)
  clearPendingBadges: () => void;

  // Actions - Streaming
  appendStreamContent: (content: string) => void;
  clearStreamContent: () => void;
  appendThinkingContent: (content: string) => void;
  clearThinkingContent: () => void;
  setStreaming: (streaming: boolean) => void;
  stopGeneration: () => Promise<void>;
  
  // Actions - Tool execution
  addToolCall: (tool: string, args: Record<string, unknown>) => void;
  addToolResult: (tool: string, success: boolean, preview?: string) => void;
  clearToolState: () => void;

  // Actions - Utility
  clearError: () => void;
  startNewChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state - assistant is open by default, panels visible
  rightSidebarMode: "assistant",
  isChatOpen: false,
  isLeftPanelVisible: (() => {
    const saved = localStorage.getItem("inkling-left-panel-visible");
    return saved !== null ? saved === "true" : true; // Default to visible
  })(),
  isRightSidebarVisible: (() => {
    const saved = localStorage.getItem("inkling-right-sidebar-visible");
    return saved !== null ? saved === "true" : true; // Default to visible
  })(),
  conversationPreviews: [],
  currentConversationId: null,
  messages: [],
  openTabIds: [],
  isStreaming: false,
  streamingContent: "",
  thinkingContent: "",
  currentSessionId: null,
  activeToolCalls: [],
  toolResults: [],
  hasUsedTools: false,
  inFinalResponsePhase: true,
  attachedContext: [],
  attachedFolders: [],
  pendingBadges: [],
  isLoading: false,
  error: null,

  // Sidebar actions
  setRightSidebarMode: (mode) => {
    set({ rightSidebarMode: mode, isChatOpen: mode === "chat" });
  },

  toggleChat: () => {
    const { rightSidebarMode } = get();
    // Cycle through: assistant -> notes -> chat -> assistant
    const newMode = rightSidebarMode === "chat" ? "assistant" : rightSidebarMode === "assistant" ? "notes" : "chat";
    set({ rightSidebarMode: newMode, isChatOpen: newMode === "chat" });
  },

  openChat: () => {
    set({ rightSidebarMode: "chat", isChatOpen: true });
  },

  closeChat: () => {
    set({ rightSidebarMode: "notes", isChatOpen: false });
  },

  toggleLeftPanel: () => {
    const newVisible = !get().isLeftPanelVisible;
    localStorage.setItem("inkling-left-panel-visible", String(newVisible));
    set({ isLeftPanelVisible: newVisible });
  },

  setLeftPanelVisible: (visible) => {
    localStorage.setItem("inkling-left-panel-visible", String(visible));
    set({ isLeftPanelVisible: visible });
  },

  toggleRightSidebar: () => {
    const newVisible = !get().isRightSidebarVisible;
    localStorage.setItem("inkling-right-sidebar-visible", String(newVisible));
    set({ isRightSidebarVisible: newVisible });
  },

  setRightSidebarVisible: (visible) => {
    localStorage.setItem("inkling-right-sidebar-visible", String(visible));
    set({ isRightSidebarVisible: visible });
  },

  // Conversation actions
  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const previews = await chatApi.listConversationPreviews();
      set({ conversationPreviews: previews, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectConversation: async (id) => {
    if (!id) {
      set({ currentConversationId: null, messages: [] });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const result = await chatApi.getConversationWithMessages(id);
      if (result) {
        set((state) => ({
          currentConversationId: id,
          messages: result.messages,
          isLoading: false,
          // Add to open tabs if not already there
          openTabIds: state.openTabIds.includes(id) 
            ? state.openTabIds 
            : [...state.openTabIds, id],
        }));
      } else {
        set({ error: "Conversation not found", isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createConversation: async (title, systemPrompt) => {
    set({ isLoading: true, error: null });
    try {
      const conversation = await chatApi.createConversation({ title, systemPrompt });
      // Create a preview for the new conversation
      const newPreview = {
        conversation,
        messageCount: 0,
        firstMessagePreview: null,
      };
      set((state) => ({
        conversationPreviews: [newPreview, ...state.conversationPreviews],
        currentConversationId: conversation.id,
        messages: [],
        isLoading: false,
      }));
      return conversation;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  deleteConversation: async (id) => {
    set({ error: null });
    try {
      await chatApi.deleteConversation(id);
      const { currentConversationId } = get();
      set((state) => ({
        conversationPreviews: state.conversationPreviews.filter((p) => p.conversation.id !== id),
        currentConversationId: currentConversationId === id ? null : currentConversationId,
        messages: currentConversationId === id ? [] : state.messages,
        // Also remove from open tabs when deleted
        openTabIds: state.openTabIds.filter((tabId) => tabId !== id),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateConversation: async (id, title, systemPrompt) => {
    set({ error: null });
    try {
      const updated = await chatApi.updateConversation(id, { title, systemPrompt });
      set((state) => ({
        conversationPreviews: state.conversationPreviews.map((p) =>
          p.conversation.id === id ? { ...p, conversation: updated } : p
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // Tab actions (UI only - doesn't delete from database)
  openTab: (id) => {
    set((state) => {
      // Don't add duplicate
      if (state.openTabIds.includes(id)) return state;
      return { openTabIds: [...state.openTabIds, id] };
    });
  },

  closeTab: (id) => {
    const { currentConversationId, openTabIds } = get();
    
    // Remove from open tabs
    const newOpenTabIds = openTabIds.filter((tabId) => tabId !== id);
    
    // If we're closing the current tab, switch to another open tab or clear
    if (currentConversationId === id) {
      // Find another tab to switch to (prefer the one before, then after)
      const closedIndex = openTabIds.indexOf(id);
      const nextTabId = newOpenTabIds[Math.max(0, closedIndex - 1)] ?? null;
      
      if (nextTabId) {
        // Switch to the next tab
        get().selectConversation(nextTabId);
      } else {
        // No more tabs, start a new chat
        set({ currentConversationId: null, messages: [] });
      }
    }
    
    set({ openTabIds: newOpenTabIds });
  },

  // Message actions
  sendMessage: async (content) => {
    const { currentConversationId, messages, attachedContext, attachedFolders } = get();
    
    // Get open note tabs from editorGroupStore (the actual tabs, not noteStore.openNoteIds which is stale)
    const { groups } = useEditorGroupStore.getState();
    const openNoteIds: string[] = [];
    for (const group of groups) {
      for (const tab of group.tabs) {
        if (tab.type === "note" && !openNoteIds.includes(tab.id)) {
          openNoteIds.push(tab.id);
        }
      }
    }
    
    // Get note and folder details from stores
    const { notes } = useNoteStore.getState();
    const { folders } = useFolderStore.getState();
    
    // Expand folders to their notes
    const folderNoteContext: ContextItem[] = [];
    for (const folderCtx of attachedFolders) {
      // Find all notes in this folder (including nested folders)
      const folderNoteIds = getNotesInFolder(folderCtx.folderId, notes, folders);
      for (const noteId of folderNoteIds) {
        const note = notes.find((n) => n.id === noteId);
        if (note && !folderNoteContext.some((c) => c.noteId === note.id)) {
          folderNoteContext.push({
            noteId: note.id,
            noteTitle: note.title,
            isFullNote: true,
          });
        }
      }
    }
    
    const tabContext: ContextItem[] = openNoteIds
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map((note) => ({
        noteId: note.id,
        noteTitle: note.title,
        isFullNote: true,
      }));
    
    // Merge all context: @mentions + folder expansions + open tabs, avoiding duplicates
    const mergedContext = [...attachedContext, ...folderNoteContext];
    for (const item of tabContext) {
      if (!mergedContext.some((c) => c.noteId === item.noteId)) {
        mergedContext.push(item);
      }
    }

    // Create optimistic user message to show immediately
    const optimisticUserMessage = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversationId || "",
      role: "user" as const,
      content,
      metadata: null,
      createdAt: new Date().toISOString(),
    };

    // Generate a unique session ID for this request
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Immediately show the user message and start streaming state
    set({
      isStreaming: true,
      streamingContent: "",
      thinkingContent: "",
      currentSessionId: sessionId,
      error: null,
      messages: [...messages, optimisticUserMessage],
    });

    try {
      const input: SendMessageInput = {
        content,
        conversationId: currentConversationId ?? undefined,
        sessionId,
        context: mergedContext, // Use @mentions + open tabs as context
        autoRetrieveCount: 0, // Agent should use tools to access notes instead of auto-retrieve
      };
      
      // Clear attached context, folders, and tool state after sending
      // Start with inFinalResponsePhase: false - assume thinking mode until we know otherwise
      set({ attachedContext: [], attachedFolders: [], activeToolCalls: [], toolResults: [], hasUsedTools: false, inFinalResponsePhase: false });

      // Set up stream listener with session ID BEFORE sending
      const unlisten = await chatApi.listenToStream(sessionId, (event) => {
        if (event.type === "chunk") {
          // Route chunk based on tool phase:
          // - If we're in final response phase (after all tools complete), append to streamingContent
          // - Otherwise (before/during tools), append to thinkingContent
          const state = get();
          if (state.inFinalResponsePhase && state.hasUsedTools) {
            // Only route to streamingContent if we've used tools and they're all complete
            get().appendStreamContent(event.content);
          } else if (state.hasUsedTools) {
            // We're in tool phase, route to thinking
            get().appendThinkingContent(event.content);
          } else {
            // No tools used yet - content goes to thinking (will be displayed appropriately)
            get().appendThinkingContent(event.content);
          }
        } else if (event.type === "thinking") {
          // Native thinking from models with reasoning - always goes to thinkingContent
          get().appendThinkingContent(event.content);
        } else if (event.type === "tool_start") {
          // When a tool starts, we're in tool execution phase
          // Move any existing streamingContent to thinkingContent (content between tool rounds)
          const currentState = get();
          if (currentState.streamingContent) {
            set((s) => ({
              thinkingContent: s.thinkingContent + s.streamingContent,
              streamingContent: "",
            }));
          }
          set({ hasUsedTools: true, inFinalResponsePhase: false });
          get().addToolCall(event.tool, event.args);
        } else if (event.type === "tool_result") {
          get().addToolResult(event.tool, event.success, event.preview);
          // After processing the result, check if all tools are done
          // If so, we enter the final response phase
          const state = get();
          if (state.activeToolCalls.length === 0) {
            set({ inFinalResponsePhase: true });
          }
        } else if (event.type === "complete") {
          // Don't clear stream content yet - keep it visible until API returns
          // Just mark streaming as done so cursor stops blinking
          set({ isStreaming: false });
          unlisten(); // Clean up listener
        } else if (event.type === "error") {
          set({ error: event.message, isStreaming: false });
          unlisten(); // Clean up listener
        }
      });

      const response = await chatApi.sendMessage(input);

      // Replace optimistic message with real messages from server
      set((state) => {
        const isNewConversation = !currentConversationId;
        
        // Remove the optimistic message and add the real messages
        const messagesWithoutOptimistic = state.messages.filter(
          (m) => !m.id.startsWith("temp-")
        );
        const newMessages = [...messagesWithoutOptimistic, response.userMessage, response.assistantMessage];

        // Build updated preview
        const newPreview = {
          conversation: response.conversation,
          messageCount: newMessages.length,
          firstMessagePreview: response.userMessage.content.slice(0, 100),
        };

        // Add to open tabs if not already there
        const newOpenTabIds = !state.openTabIds.includes(response.conversation.id)
          ? [...state.openTabIds, response.conversation.id]
          : state.openTabIds;

        // Check if preview already exists (can happen due to race with fetchConversations)
        const existingPreviewIndex = state.conversationPreviews.findIndex(
          (p) => p.conversation.id === response.conversation.id
        );
        
        // Update existing preview or add new one
        let updatedPreviews: typeof state.conversationPreviews;
        if (existingPreviewIndex >= 0) {
          // Update the existing preview with the new data (including AI-generated title)
          updatedPreviews = state.conversationPreviews.map((p, i) =>
            i === existingPreviewIndex ? newPreview : p
          );
          // If it's a new conversation, move it to the front
          if (isNewConversation) {
            const updated = updatedPreviews[existingPreviewIndex];
            updatedPreviews = [
              updated,
              ...updatedPreviews.slice(0, existingPreviewIndex),
              ...updatedPreviews.slice(existingPreviewIndex + 1),
            ];
          }
        } else {
          // Add new preview at the front
          updatedPreviews = [newPreview, ...state.conversationPreviews];
        }

        // Only keep thinkingContent if tools were used (otherwise it's redundant with the message)
        const keepThinking = state.hasUsedTools;
        
        return {
          currentConversationId: response.conversation.id,
          messages: newMessages,
          isStreaming: false,
          streamingContent: "",
          thinkingContent: keepThinking ? state.thinkingContent : "",
          currentSessionId: null,
          hasUsedTools: false,
          inFinalResponsePhase: true,
          openTabIds: newOpenTabIds,
          conversationPreviews: updatedPreviews,
        };
      });

      return response;
    } catch (error) {
      // Remove optimistic message on error
      set((state) => ({
        messages: state.messages.filter((m) => !m.id.startsWith("temp-")),
        error: String(error),
        isStreaming: false,
        currentSessionId: null,
        hasUsedTools: false,
        inFinalResponsePhase: true,
      }));
      return null;
    }
  },

  sendMessageSync: async (content) => {
    const { currentConversationId, attachedContext, attachedFolders } = get();
    
    // Get open note tabs from editorGroupStore (the actual tabs, not noteStore.openNoteIds which is stale)
    const { groups } = useEditorGroupStore.getState();
    const openNoteIds: string[] = [];
    for (const group of groups) {
      for (const tab of group.tabs) {
        if (tab.type === "note" && !openNoteIds.includes(tab.id)) {
          openNoteIds.push(tab.id);
        }
      }
    }
    
    // Get note and folder details from stores
    const { notes } = useNoteStore.getState();
    const { folders } = useFolderStore.getState();
    
    // Expand folders to their notes
    const folderNoteContext: ContextItem[] = [];
    for (const folderCtx of attachedFolders) {
      const folderNoteIds = getNotesInFolder(folderCtx.folderId, notes, folders);
      for (const noteId of folderNoteIds) {
        const note = notes.find((n) => n.id === noteId);
        if (note && !folderNoteContext.some((c) => c.noteId === note.id)) {
          folderNoteContext.push({
            noteId: note.id,
            noteTitle: note.title,
            isFullNote: true,
          });
        }
      }
    }
    
    const tabContext: ContextItem[] = openNoteIds
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map((note) => ({
        noteId: note.id,
        noteTitle: note.title,
        isFullNote: true,
      }));
    
    // Merge all context: @mentions + folder expansions + open tabs, avoiding duplicates
    const mergedContext = [...attachedContext, ...folderNoteContext];
    for (const item of tabContext) {
      if (!mergedContext.some((c) => c.noteId === item.noteId)) {
        mergedContext.push(item);
      }
    }

    set({ isLoading: true, error: null, attachedContext: [], attachedFolders: [] });

    try {
      const input: SendMessageInput = {
        content,
        conversationId: currentConversationId ?? undefined,
        context: mergedContext, // Use @mentions + open tabs as context
        autoRetrieveCount: 0, // Disable auto-retrieve
      };

      const response = await chatApi.sendMessageSync(input);

      set((state) => {
        const isNewConversation = !currentConversationId;
        const newMessages = [...state.messages, response.userMessage, response.assistantMessage];

        // Build updated preview
        const newPreview = {
          conversation: response.conversation,
          messageCount: newMessages.length,
          firstMessagePreview: response.userMessage.content.slice(0, 100),
        };

        // Add to open tabs if not already there
        const newOpenTabIds = !state.openTabIds.includes(response.conversation.id)
          ? [...state.openTabIds, response.conversation.id]
          : state.openTabIds;

        // Check if preview already exists (can happen due to race with fetchConversations)
        const existingPreviewIndex = state.conversationPreviews.findIndex(
          (p) => p.conversation.id === response.conversation.id
        );
        
        // Update existing preview or add new one
        let updatedPreviews: typeof state.conversationPreviews;
        if (existingPreviewIndex >= 0) {
          // Update the existing preview with the new data (including AI-generated title)
          updatedPreviews = state.conversationPreviews.map((p, i) =>
            i === existingPreviewIndex ? newPreview : p
          );
          // If it's a new conversation, move it to the front
          if (isNewConversation) {
            const updated = updatedPreviews[existingPreviewIndex];
            updatedPreviews = [
              updated,
              ...updatedPreviews.slice(0, existingPreviewIndex),
              ...updatedPreviews.slice(existingPreviewIndex + 1),
            ];
          }
        } else {
          // Add new preview at the front
          updatedPreviews = [newPreview, ...state.conversationPreviews];
        }

        return {
          currentConversationId: response.conversation.id,
          messages: newMessages,
          isLoading: false,
          openTabIds: newOpenTabIds,
          conversationPreviews: updatedPreviews,
        };
      });

      return response;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return null;
    }
  },

  editMessage: async (messageId, newContent) => {
    const { currentConversationId, messages } = get();
    if (!currentConversationId) {
      set({ error: "No active conversation" });
      return null;
    }

    // Find the message being edited and its index
    const editIndex = messages.findIndex((m) => m.id === messageId);
    if (editIndex === -1) {
      set({ error: "Message not found" });
      return null;
    }

    // Create optimistic edited message
    const optimisticUserMessage = {
      id: `temp-edit-${Date.now()}`,
      conversationId: currentConversationId,
      role: "user" as const,
      content: newContent,
      metadata: null,
      createdAt: new Date().toISOString(),
    };

    // Immediately show the edited message (remove original and subsequent, add optimistic)
    // Also clear tool state for fresh tool progress display
    set({
      isStreaming: true,
      streamingContent: "",
      thinkingContent: "",
      error: null,
      messages: [...messages.slice(0, editIndex), optimisticUserMessage],
      activeToolCalls: [],
      toolResults: [],
      hasUsedTools: false,
      inFinalResponsePhase: false, // Start in thinking mode
    });

    try {
      // Set up stream listener with conversation ID
      const unlisten = await chatApi.listenToStream(currentConversationId, (event) => {
        if (event.type === "chunk") {
          // Route chunk based on tool phase
          const state = get();
          if (state.inFinalResponsePhase && state.hasUsedTools) {
            // Only route to streamingContent if we've used tools and they're all complete
            get().appendStreamContent(event.content);
          } else if (state.hasUsedTools) {
            // We're in tool phase, route to thinking
            get().appendThinkingContent(event.content);
          } else {
            // No tools used yet - content goes to thinking
            get().appendThinkingContent(event.content);
          }
        } else if (event.type === "thinking") {
          get().appendThinkingContent(event.content);
        } else if (event.type === "tool_start") {
          // When a tool starts, we're in tool execution phase
          // Move any existing streamingContent to thinkingContent (content between tool rounds)
          const currentState = get();
          if (currentState.streamingContent) {
            set((s) => ({
              thinkingContent: s.thinkingContent + s.streamingContent,
              streamingContent: "",
            }));
          }
          set({ hasUsedTools: true, inFinalResponsePhase: false });
          get().addToolCall(event.tool, event.args);
        } else if (event.type === "tool_result") {
          get().addToolResult(event.tool, event.success, event.preview);
          // Check if all tools are done
          const state = get();
          if (state.activeToolCalls.length === 0) {
            set({ inFinalResponsePhase: true });
          }
        } else if (event.type === "complete") {
          // Keep content visible until API returns
          set({ isStreaming: false });
          unlisten();
        } else if (event.type === "error") {
          set({ error: event.message, isStreaming: false });
          unlisten();
        }
      });

      const response = await chatApi.editMessageAndRegenerate(messageId, newContent);

      // Replace optimistic message with real messages
      const currentMessages = get().messages;
      const messagesWithoutOptimistic = currentMessages.filter(
        (m) => !m.id.startsWith("temp-")
      );
      const newMessages = [...messagesWithoutOptimistic, response.userMessage, response.assistantMessage];

      // Update preview
      const newPreview = {
        conversation: response.conversation,
        messageCount: newMessages.length,
        firstMessagePreview: newMessages.find((m) => m.role === "user")?.content.slice(0, 100) ?? null,
      };

      set((state) => {
        // Only keep thinkingContent if tools were used
        const keepThinking = state.hasUsedTools;
        
        return {
          messages: newMessages,
          isStreaming: false,
          streamingContent: "",
          thinkingContent: keepThinking ? state.thinkingContent : "",
          hasUsedTools: false,
          inFinalResponsePhase: true,
          conversationPreviews: state.conversationPreviews.map((p) =>
            p.conversation.id === response.conversation.id ? newPreview : p
          ),
        };
      });

      return response;
    } catch (error) {
      // Restore original messages on error
      set({
        messages,
        error: String(error),
        isStreaming: false,
        thinkingContent: "",
        hasUsedTools: false,
        inFinalResponsePhase: true,
      });
      return null;
    }
  },

  // Context actions
  addContext: (item, addBadge = false) => {
    set((state) => {
      // Don't add duplicates
      if (state.attachedContext.some((c) => c.noteId === item.noteId)) {
        return state;
      }
      const newState: Partial<typeof state> = { 
        attachedContext: [...state.attachedContext, item] 
      };
      // Add pending badge if requested (for programmatic insertion from right-click)
      if (addBadge) {
        newState.pendingBadges = [
          ...state.pendingBadges, 
          { type: "note", id: item.noteId, name: item.noteTitle }
        ];
      }
      return newState;
    });
  },

  removeContext: (noteId) => {
    set((state) => ({
      attachedContext: state.attachedContext.filter((c) => c.noteId !== noteId),
    }));
  },

  clearContext: () => {
    set({ attachedContext: [], attachedFolders: [] });
  },

  setContext: (items) => {
    set({ attachedContext: items });
  },

  // Folder context actions
  addFolderContext: (item, addBadge = false) => {
    set((state) => {
      // Don't add duplicates
      if (state.attachedFolders.some((f) => f.folderId === item.folderId)) {
        return state;
      }
      const newState: Partial<typeof state> = { 
        attachedFolders: [...state.attachedFolders, item] 
      };
      // Add pending badge if requested (for programmatic insertion from right-click)
      if (addBadge) {
        newState.pendingBadges = [
          ...state.pendingBadges, 
          { type: "folder", id: item.folderId, name: item.folderName, noteCount: item.noteCount }
        ];
      }
      return newState;
    });
  },

  removeFolderContext: (folderId) => {
    set((state) => ({
      attachedFolders: state.attachedFolders.filter((f) => f.folderId !== folderId),
    }));
  },

  clearFolderContext: () => {
    set({ attachedFolders: [] });
  },

  // Pending badge actions
  clearPendingBadges: () => {
    set({ pendingBadges: [] });
  },

  // Streaming actions
  appendStreamContent: (content) => {
    set((state) => ({
      streamingContent: state.streamingContent + content,
    }));
  },

  clearStreamContent: () => {
    set({ streamingContent: "" });
  },

  appendThinkingContent: (content) => {
    set((state) => ({
      thinkingContent: state.thinkingContent + content,
    }));
  },

  clearThinkingContent: () => {
    set({ thinkingContent: "" });
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  stopGeneration: async () => {
    const { currentSessionId, isStreaming } = get();
    if (!isStreaming || !currentSessionId) {
      return;
    }

    try {
      await chatApi.stopGeneration(currentSessionId);
      // The streaming will stop naturally and the backend will save the partial response
      // We just need to update our state
      set({ isStreaming: false, currentSessionId: null });
    } catch (error) {
      console.error("Failed to stop generation:", error);
      // Still reset streaming state even if the stop request fails
      set({ isStreaming: false, currentSessionId: null });
    }
  },

  // Tool execution actions
  addToolCall: (tool, args) => {
    set((state) => ({
      activeToolCalls: [...state.activeToolCalls, { tool, args }],
    }));
  },

  addToolResult: (tool, success, preview) => {
    set((state) => ({
      // Remove from active, add to results
      activeToolCalls: state.activeToolCalls.filter((tc) => tc.tool !== tool),
      toolResults: [...state.toolResults, { tool, success, preview }],
    }));
  },

  clearToolState: () => {
    set({ activeToolCalls: [], toolResults: [] });
  },

  // Utility actions
  clearError: () => {
    set({ error: null });
  },

  startNewChat: () => {
    set({
      currentConversationId: null,
      messages: [],
      attachedContext: [],
      attachedFolders: [],
      pendingBadges: [],
      streamingContent: "",
      thinkingContent: "",
      isStreaming: false,
      currentSessionId: null,
      activeToolCalls: [],
      toolResults: [],
      hasUsedTools: false,
      inFinalResponsePhase: true,
      error: null,
    });
  },
}));

// Helper to get all notes in a folder (including nested subfolders recursively)
import type { Note, Folder } from "../types/note";

function getNotesInFolder(folderId: string, notes: Note[], folders: Folder[]): string[] {
  const noteIds: string[] = [];
  
  // Get direct notes in this folder
  for (const note of notes) {
    if (note.folderId === folderId && !note.isDeleted) {
      noteIds.push(note.id);
    }
  }
  
  // Get notes from nested subfolders recursively
  const subfolders = folders.filter((f) => f.parentId === folderId);
  for (const subfolder of subfolders) {
    const subNotes = getNotesInFolder(subfolder.id, notes, folders);
    noteIds.push(...subNotes);
  }
  
  return noteIds;
}

// Selectors
export const useCurrentConversation = () => {
  const previews = useChatStore((state) => state.conversationPreviews);
  const currentId = useChatStore((state) => state.currentConversationId);
  const preview = previews.find((p) => p.conversation.id === currentId);
  return preview?.conversation ?? null;
};

export const useIsChatMode = () => {
  return useChatStore((state) => state.rightSidebarMode === "chat");
};

export const useHasAttachedContext = () => {
  return useChatStore((state) => state.attachedContext.length > 0);
};
