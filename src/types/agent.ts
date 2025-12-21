/**
 * Agent-related types
 */

/** Web search provider options */
export type WebSearchProvider = "none" | "brave" | "serper" | "tavily";

/** Image provider options */
export type ImageProvider = "none" | "unsplash" | "dallE" | "stableDiffusion";

/** Diagram format options */
export type DiagramFormat = "mermaid" | "excalidraw";

/** Web search configuration */
export interface WebSearchConfig {
  provider: WebSearchProvider;
  apiKey?: string;
}

/** Image configuration */
export interface ImageConfig {
  provider: ImageProvider;
  unsplashAccessKey?: string;
  allowGeneration: boolean;
}

/** Diagram configuration */
export interface DiagramConfig {
  defaultFormat: DiagramFormat;
}

/** Full agent configuration stored in backend */
export interface AgentConfig {
  /** Whether the inline assistant is enabled */
  enabled: boolean;
  /** List of enabled tool names */
  enabledTools: string[];
  /** Web search configuration */
  webSearch: WebSearchConfig;
  /** Image configuration */
  image: ImageConfig;
  /** Diagram configuration */
  diagram: DiagramConfig;
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

/** Default agent configuration */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  enabledTools: ["search_notes", "write_content", "create_mermaid"],
  webSearch: {
    provider: "none",
  },
  image: {
    provider: "none",
    allowGeneration: false,
  },
  diagram: {
    defaultFormat: "mermaid",
  },
};
