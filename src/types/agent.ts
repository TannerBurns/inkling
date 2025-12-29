/**
 * Agent-related types
 */

/** Web search provider options */
export type WebSearchProvider = "none" | "brave" | "serper" | "tavily";

/** Web search configuration */
export interface WebSearchConfig {
  provider: WebSearchProvider;
  apiKey?: string;
}

/** Read/Write permission for a data source */
export interface RWPermission {
  /** Can read/search this source */
  read: boolean;
  /** Can write/create/modify this source */
  write: boolean;
}

/** Configuration for data sources the agent can access */
export interface SourceConfig {
  // =========================================================================
  // Sources with read + write permissions
  // =========================================================================
  
  /** Notes: read (search, read, links, related, recent) / write (create_note, append_content_to_note) */
  notes: RWPermission;
  /** Tags: read (get tags, search by tag) / write (add/remove tags - future) */
  tags: RWPermission;
  /** Calendar: read (get events) / write (create events) */
  calendar: RWPermission;
  /** Daily Notes: read (get daily note) / write (create/modify - future) */
  dailyNotes: RWPermission;
  /** Folders: read (list, get notes) / write (create, move - future) */
  folders: RWPermission;
  
  // =========================================================================
  // Read-only sources
  // =========================================================================
  
  /** URL Attachments: search, read content (read-only) */
  urlAttachments: boolean;
  /** Web Search: search web (requires API key config) (read-only) */
  webSearch: boolean;
}

/** Configuration for agent capabilities (non-source-specific) */
export interface CapabilityConfig {
  /** Document Export: PDF, DOCX, XLSX, document builder */
  documentExport: boolean;
}

/** Full agent configuration stored in backend */
export interface AgentConfig {
  /** Whether agents are enabled globally */
  enabled: boolean;
  /** List of enabled tool names (kept for backwards compatibility) */
  enabledTools: string[];
  /** Web search configuration */
  webSearch: WebSearchConfig;
  /** Data source toggles */
  sources: SourceConfig;
  /** Capability toggles */
  capabilities: CapabilityConfig;
}

/** Information about an available tool */
export interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  requiresApiKey: boolean;
}

/** Progress event from agent execution */
export type AgentProgress =
  | { type: "started"; agentName: string; executionId: string }
  | { type: "toolCalling"; toolName: string; arguments: Record<string, unknown> }
  | { type: "toolResult"; toolName: string; success: boolean; preview?: string }
  | { type: "thinking"; message: string }
  | { type: "completed"; result: AgentResult }
  | { type: "error"; message: string }
  | { type: "cancelled" };

/** Result of running an agent */
export interface AgentResult {
  finalResponse: string;
  toolCallsMade: ToolCallRecord[];
  iterations: number;
}

/** Record of a tool call */
export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
}

/** Result of the inline assistant */
export interface InlineAssistantResult {
  content: string;
  toolsUsed: string[];
  iterations: number;
  toolCalls: ToolCallRecord[];
}

/** Result of the summarization agent */
export interface SummarizationResult {
  finalResponse: string;
  toolsUsed: string[];
  iterations: number;
  chunksAppended: number;
}

/** Result of the research agent */
export interface ResearchResult {
  finalResponse: string;
  toolsUsed: string[];
  iterations: number;
  chunksAppended: number;
  notesSearched: number;
}

/** Content event from agent streaming */
export interface AppendContentEvent {
  content: string;
  isFinal: boolean;
}

/** Agent type for tracking running agents */
export type AgentType = "tagging" | "inline" | "embedding" | "summarization" | "research";

/** Default RWPermission - full read/write access */
export const DEFAULT_RW_PERMISSION: RWPermission = {
  read: true,
  write: true,
};

/** Default source configuration - full access for RW sources, enabled for read-only */
export const DEFAULT_SOURCE_CONFIG: SourceConfig = {
  // Sources with read + write - default to full access
  notes: { read: true, write: true },
  tags: { read: true, write: true },
  calendar: { read: true, write: true },
  dailyNotes: { read: true, write: true },
  folders: { read: true, write: true },
  // Read-only sources
  urlAttachments: true,
  webSearch: false, // Requires API key configuration
};

/** Default capability configuration */
export const DEFAULT_CAPABILITY_CONFIG: CapabilityConfig = {
  documentExport: true,
};

/** Default agent configuration */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  enabledTools: ["search_notes", "append_content_to_note", "create_mermaid"],
  webSearch: {
    provider: "none",
  },
  sources: DEFAULT_SOURCE_CONFIG,
  capabilities: DEFAULT_CAPABILITY_CONFIG,
};
