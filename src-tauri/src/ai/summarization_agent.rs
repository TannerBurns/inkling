//! Summarization Agent
//!
//! An AI agent focused on summarizing content from selected text or attachments.
//! Produces concise, structured summaries and streams them to the note in real-time.

#![allow(dead_code)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;

use super::agent::{
    run_agent_with_events, AgentError, CancellationToken, ToolDefinition, ToolExecutor,
};
use super::config::AIProvider;
use super::tools::{
    execute_append_to_note, execute_search_notes, get_append_to_note_tool, get_search_notes_tool,
};
use crate::db::connection::DbPool;

/// System prompt for the summarization agent
pub const SUMMARIZATION_AGENT_SYSTEM_PROMPT: &str = r##"You are a summarization agent for a note-taking app called Inkling.
Your job is to create clear, concise summaries of the provided content.

AVAILABLE TOOLS:
- append_to_note: Write summary content to the note in real-time. Call this multiple times to stream your output.
- search_notes: Search existing notes for related context (optional)

WORKFLOW:
1. Analyze the provided content thoroughly
2. Identify key points, main ideas, and important details
3. Use append_to_note to write a structured summary to the note
4. You may search for related notes to provide additional context

OUTPUT FORMAT:
Structure your summary with:
- A brief overview (1-2 sentences)
- Key points as bullet points
- Important details or takeaways
- Any relevant connections to other topics

GUIDELINES:
- Be concise but capture all essential information
- Use clear, simple language
- Maintain the original meaning without adding interpretation
- Use markdown formatting (headings, bullets, bold) for clarity
- If summarizing a document, mention its type (e.g., "This Excel spreadsheet contains...")
- Call append_to_note with is_final=true for your last piece of content

Start your summary with a level-2 heading titled Summary."##;

/// Result of running the summarization agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizationResult {
    /// The final response from the agent
    pub final_response: String,
    /// Tools that were used
    pub tools_used: Vec<String>,
    /// Number of iterations
    pub iterations: usize,
    /// Content chunks appended
    pub chunks_appended: usize,
}

/// The summarization agent that implements ToolExecutor
pub struct SummarizationAgent {
    app_handle: AppHandle,
    execution_id: String,
    pool: DbPool,
    provider: AIProvider,
    vault_path: String,
    chunks_appended: Arc<std::sync::atomic::AtomicUsize>,
}

impl SummarizationAgent {
    /// Create a new summarization agent
    pub fn new(
        app_handle: AppHandle,
        execution_id: String,
        pool: DbPool,
        provider: AIProvider,
        vault_path: String,
    ) -> Self {
        Self {
            app_handle,
            execution_id,
            pool,
            provider,
            vault_path,
            chunks_appended: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        }
    }

    /// Get the number of chunks appended
    pub fn get_chunks_appended(&self) -> usize {
        self.chunks_appended.load(std::sync::atomic::Ordering::SeqCst)
    }
}

#[async_trait]
impl ToolExecutor for SummarizationAgent {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        log::info!("[SummarizationAgent] Executing tool: {} with args: {}", name, args);
        
        match name {
            "append_to_note" => {
                let result = execute_append_to_note(&self.app_handle, &self.execution_id, args);
                if result.is_ok() {
                    self.chunks_appended.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
                result
            }
            "search_notes" => {
                execute_search_notes(&self.pool, &self.provider, args).await
            }
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }
}

/// Get the tool definitions for the summarization agent
pub fn get_summarization_tools() -> Vec<ToolDefinition> {
    vec![
        get_append_to_note_tool(),
        get_search_notes_tool(),
    ]
}

/// Run the summarization agent
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `execution_id` - Unique ID for this execution
/// * `pool` - Database connection pool
/// * `provider` - AI provider configuration
/// * `model` - Model identifier
/// * `content` - The content to summarize
/// * `content_type` - Type of content ("selection" or "attachment")
/// * `vault_path` - Path to the vault for resolving attachments
/// * `cancellation_token` - Optional cancellation token
pub async fn run_summarization_agent(
    app_handle: &AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    content: &str,
    content_type: &str,
    vault_path: &str,
    cancellation_token: Option<&CancellationToken>,
) -> Result<SummarizationResult, AgentError> {
    log::info!(
        "[SummarizationAgent] Starting summarization: execution_id={}, content_type={}, content_len={}",
        execution_id,
        content_type,
        content.len()
    );

    let agent = SummarizationAgent::new(
        app_handle.clone(),
        execution_id.to_string(),
        pool.clone(),
        provider.clone(),
        vault_path.to_string(),
    );

    let tools = get_summarization_tools();

    // Build the initial message based on content type
    let initial_message = match content_type {
        "attachment" => format!(
            "Please summarize the following document content:\n\n---\n\n{}",
            content
        ),
        _ => format!(
            "Please summarize the following selected text:\n\n---\n\n{}",
            content
        ),
    };

    let result = run_agent_with_events(
        app_handle,
        execution_id,
        "Summarization",
        provider,
        model,
        SUMMARIZATION_AGENT_SYSTEM_PROMPT,
        &initial_message,
        tools,
        &agent,
        30, // Max 30 iterations
        cancellation_token,
    )
    .await?;

    // Extract unique tool names used
    let tools_used: Vec<String> = result
        .tool_calls_made
        .iter()
        .map(|tc| tc.tool_name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    Ok(SummarizationResult {
        final_response: result.final_response,
        tools_used,
        iterations: result.iterations,
        chunks_appended: agent.get_chunks_appended(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_summarization_tools() {
        let tools = get_summarization_tools();
        assert_eq!(tools.len(), 2);

        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"append_to_note"));
        assert!(tool_names.contains(&"search_notes"));
    }

    #[test]
    fn test_system_prompt_contains_key_elements() {
        assert!(SUMMARIZATION_AGENT_SYSTEM_PROMPT.contains("summarization"));
        assert!(SUMMARIZATION_AGENT_SYSTEM_PROMPT.contains("append_to_note"));
        assert!(SUMMARIZATION_AGENT_SYSTEM_PROMPT.contains("Summary"));
    }
}
