/**
 * Agent API functions
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgentConfig,
  AgentProgress,
  AppendContentEvent,
  InlineAssistantResult,
  ResearchResult,
  SummarizationResult,
  ToolInfo,
} from "../types/agent";

/**
 * Get the current agent configuration
 */
export async function getAgentConfig(): Promise<AgentConfig> {
  return invoke<AgentConfig>("get_agent_config");
}

/**
 * Save the agent configuration
 */
export async function saveAgentConfig(config: AgentConfig): Promise<void> {
  return invoke("save_agent_config", { config });
}

/**
 * Get available tools and their status
 */
export async function getAvailableTools(): Promise<ToolInfo[]> {
  return invoke<ToolInfo[]>("get_available_tools");
}

/**
 * Execute the inline assistant agent
 * @param executionId - Unique ID for event correlation
 * @param request - User's request
 * @param noteContext - Optional current note content for context
 */
export async function executeInlineAgent(
  executionId: string,
  request: string,
  noteContext?: string
): Promise<InlineAssistantResult> {
  return invoke<InlineAssistantResult>("execute_inline_agent", {
    executionId,
    request,
    noteContext,
  });
}

/**
 * Cancel an in-progress agent execution
 * @param executionId - ID of the execution to cancel
 */
export async function cancelAgentExecution(executionId: string): Promise<void> {
  return invoke("cancel_agent_execution", { executionId });
}

/**
 * Listen for agent progress events
 * @param executionId - The execution ID to listen for
 * @param callback - Callback function for progress events
 * @returns Unlisten function
 */
export async function listenForAgentProgress(
  executionId: string,
  callback: (progress: AgentProgress) => void
): Promise<UnlistenFn> {
  return listen<AgentProgress>(`agent-progress-${executionId}`, (event) => {
    callback(event.payload);
  });
}

/**
 * Generate a unique execution ID
 */
export function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Execute the summarization agent
 * @param executionId - Unique ID for event correlation
 * @param content - The content to summarize
 * @param contentType - Type of content ("selection" or "attachment")
 * @param attachmentPath - Path to attachment if contentType is "attachment"
 */
export async function executeSummarizationAgent(
  executionId: string,
  content: string,
  contentType: "selection" | "attachment",
  attachmentPath?: string
): Promise<SummarizationResult> {
  return invoke<SummarizationResult>("execute_summarization_agent", {
    executionId,
    content,
    contentType,
    attachmentPath,
  });
}

/**
 * Execute the research agent
 * @param executionId - Unique ID for event correlation
 * @param topic - The research topic or question
 * @param context - Optional additional context
 */
export async function executeResearchAgent(
  executionId: string,
  topic: string,
  context?: string
): Promise<ResearchResult> {
  return invoke<ResearchResult>("execute_research_agent", {
    executionId,
    topic,
    context,
  });
}

/**
 * Extract text from an attachment file
 * @param path - Path to the attachment (relative to vault or absolute)
 * @param maxChars - Maximum characters to extract
 */
export async function extractAttachmentText(
  path: string,
  maxChars?: number
): Promise<string> {
  return invoke<string>("extract_attachment_text", { path, maxChars });
}

/**
 * Listen for agent content streaming events
 * @param executionId - The execution ID to listen for
 * @param callback - Callback function for content events
 * @returns Unlisten function
 */
export async function listenForAgentContent(
  executionId: string,
  callback: (event: AppendContentEvent) => void
): Promise<UnlistenFn> {
  return listen<AppendContentEvent>(`agent-content-${executionId}`, (event) => {
    callback(event.payload);
  });
}
