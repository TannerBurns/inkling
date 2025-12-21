//! Research Agent
//!
//! An AI agent focused on deep research on a topic or content.
//! Gathers information from notes, web searches, and synthesizes findings
//! into comprehensive research notes streamed in real-time.

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
    execute_append_to_note, execute_search_notes, execute_web_search, format_results_for_agent,
    get_append_to_note_tool, get_search_notes_tool, get_web_search_tool, AgentConfig,
};
use crate::db::connection::DbPool;

/// System prompt for the research agent
pub const RESEARCH_AGENT_SYSTEM_PROMPT: &str = r##"You are a research agent for a note-taking app called Inkling.
Your job is to conduct thorough research on a topic and compile comprehensive notes.

AVAILABLE TOOLS:
- append_to_note: Write research findings to the note in real-time. Call this multiple times to stream your output.
- search_notes: Search existing notes for relevant information and context
- web_search: Search the web for current information (if enabled)

WORKFLOW:
1. Understand the research topic or question
2. Search existing notes for relevant background information
3. If web search is available, gather external sources
4. Synthesize findings into structured research notes
5. Use append_to_note to write your research progressively

OUTPUT FORMAT:
Structure your research with:
- An introduction to the topic
- Key findings organized by subtopics
- Important facts, data, or quotes (with sources when available)
- Connections to existing notes (use [[Note Title]] wiki-link format)
- A conclusion or summary of insights
- Further questions or areas to explore

GUIDELINES:
- Be thorough but organized
- Cite sources when using information from web search or notes
- Use markdown formatting for clarity (headings, bullets, bold, code blocks)
- If you find relevant existing notes, mention them with [[wiki-links]]
- Progress incrementally - append content as you research, don't wait until the end
- Call append_to_note with is_final=true for your last piece of content

Start your research with a level-2 heading like: Research: [Topic] (replace [Topic] with the actual topic)."##;

/// Result of running the research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    /// The final response from the agent
    pub final_response: String,
    /// Tools that were used
    pub tools_used: Vec<String>,
    /// Number of iterations
    pub iterations: usize,
    /// Content chunks appended
    pub chunks_appended: usize,
    /// Number of notes searched
    pub notes_searched: usize,
}

/// The research agent that implements ToolExecutor
pub struct ResearchAgent {
    app_handle: AppHandle,
    execution_id: String,
    pool: DbPool,
    provider: AIProvider,
    config: AgentConfig,
    vault_path: String,
    chunks_appended: Arc<std::sync::atomic::AtomicUsize>,
    notes_searched: Arc<std::sync::atomic::AtomicUsize>,
}

impl ResearchAgent {
    /// Create a new research agent
    pub fn new(
        app_handle: AppHandle,
        execution_id: String,
        pool: DbPool,
        provider: AIProvider,
        config: AgentConfig,
        vault_path: String,
    ) -> Self {
        Self {
            app_handle,
            execution_id,
            pool,
            provider,
            config,
            vault_path,
            chunks_appended: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            notes_searched: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        }
    }

    /// Get the number of chunks appended
    pub fn get_chunks_appended(&self) -> usize {
        self.chunks_appended.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Get the number of notes searched
    pub fn get_notes_searched(&self) -> usize {
        self.notes_searched.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Perform web search using the configured provider
    async fn web_search(&self, args: Value) -> Result<String, String> {
        if !self.config.is_tool_enabled("web_search") {
            return Err("Web search is not enabled".to_string());
        }

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' argument")?;

        log::info!("[ResearchAgent] Executing web search: {}", query);

        let results = execute_web_search(&self.config.web_search, query).await?;

        log::info!(
            "[ResearchAgent] Web search returned {} results",
            results.len()
        );

        Ok(format_results_for_agent(&results))
    }
}

#[async_trait]
impl ToolExecutor for ResearchAgent {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        log::info!("[ResearchAgent] Executing tool: {} with args: {}", name, args);
        
        match name {
            "append_to_note" => {
                let result = execute_append_to_note(&self.app_handle, &self.execution_id, args);
                if result.is_ok() {
                    self.chunks_appended.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
                result
            }
            "search_notes" => {
                let result = execute_search_notes(&self.pool, &self.provider, args).await;
                if result.is_ok() {
                    self.notes_searched.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
                result
            }
            "web_search" => {
                self.web_search(args).await
            }
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }
}

/// Get the tool definitions for the research agent
pub fn get_research_tools(config: &AgentConfig) -> Vec<ToolDefinition> {
    let mut tools = vec![get_append_to_note_tool(), get_search_notes_tool()];

    // Add web search if enabled
    if config.is_tool_enabled("web_search") {
        tools.push(get_web_search_tool());
    }

    tools
}

/// Run the research agent
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `execution_id` - Unique ID for this execution
/// * `pool` - Database connection pool
/// * `provider` - AI provider configuration
/// * `model` - Model identifier
/// * `topic` - The research topic or question
/// * `context` - Optional additional context
/// * `vault_path` - Path to the vault
/// * `config` - Agent configuration
/// * `cancellation_token` - Optional cancellation token
pub async fn run_research_agent(
    app_handle: &AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    topic: &str,
    context: Option<&str>,
    vault_path: &str,
    config: AgentConfig,
    cancellation_token: Option<&CancellationToken>,
) -> Result<ResearchResult, AgentError> {
    log::info!(
        "[ResearchAgent] Starting research: execution_id={}, topic_len={}, has_context={}",
        execution_id,
        topic.len(),
        context.is_some()
    );

    let agent = ResearchAgent::new(
        app_handle.clone(),
        execution_id.to_string(),
        pool.clone(),
        provider.clone(),
        config.clone(),
        vault_path.to_string(),
    );

    let tools = get_research_tools(&config);

    // Build the initial message
    let initial_message = if let Some(ctx) = context {
        format!(
            "Please research the following topic:\n\n**Topic:** {}\n\n**Context:**\n{}\n\nConduct thorough research and compile your findings.",
            topic, ctx
        )
    } else {
        format!(
            "Please research the following topic:\n\n**Topic:** {}\n\nConduct thorough research and compile your findings.",
            topic
        )
    };

    let result = run_agent_with_events(
        app_handle,
        execution_id,
        "Research",
        provider,
        model,
        RESEARCH_AGENT_SYSTEM_PROMPT,
        &initial_message,
        tools,
        &agent,
        100, // Max 100 iterations for research
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

    Ok(ResearchResult {
        final_response: result.final_response,
        tools_used,
        iterations: result.iterations,
        chunks_appended: agent.get_chunks_appended(),
        notes_searched: agent.get_notes_searched(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_research_tools_default() {
        let config = AgentConfig::default();
        let tools = get_research_tools(&config);
        
        // Default config doesn't have web_search enabled
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"append_to_note"));
        assert!(tool_names.contains(&"search_notes"));
    }

    #[test]
    fn test_system_prompt_contains_key_elements() {
        assert!(RESEARCH_AGENT_SYSTEM_PROMPT.contains("research"));
        assert!(RESEARCH_AGENT_SYSTEM_PROMPT.contains("append_to_note"));
        assert!(RESEARCH_AGENT_SYSTEM_PROMPT.contains("search_notes"));
        assert!(RESEARCH_AGENT_SYSTEM_PROMPT.contains("wiki-link"));
    }
}
