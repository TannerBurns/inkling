//! Inline Assistant Agent
//!
//! An AI agent that helps users research, create content, and generate visuals
//! directly within their notes. Uses tools like web search, image fetching,
//! and diagram generation.
//!
//! Now uses the unified streaming agent for real-time streaming responses
//! with tool calling support.

use serde::{Deserialize, Serialize};

use crate::db::connection::DbPool;

use super::agent::{AgentError, CancellationToken, ToolCallRecord, ToolDefinition};
use super::chat_executor::UnifiedToolExecutor;
use super::config::AIProvider;
use super::llm::ChatMessage;
use super::streaming_agent::run_streaming_agent;
use super::tools::{get_unified_agent_tools, AgentConfig};

/// System prompt for the inline assistant
pub const INLINE_ASSISTANT_SYSTEM_PROMPT: &str = r#"You are an inline writing assistant for a note-taking app called Inkling.
The user will ask you to help with research, content creation, diagrams, or document exports.

AVAILABLE TOOLS:
Knowledge Retrieval:
- search_notes: Search the user's existing notes for relevant information
- search_url_embeddings: Search through indexed web pages and URL attachments
- read_note: Get the full content of a specific note by ID or title
- get_note_links: Get backlinks and outgoing links for a note
- read_url_content: Get the full scraped content from a URL attachment
- get_note_tags: Get all tags assigned to a note
- search_by_tag: Find notes with a specific tag
- get_related_notes: Find semantically similar notes to a given note
- get_notes_sharing_tags: Find notes that share tags with a given note
- get_calendar_events: Get calendar events within a date range
- get_daily_note: Get the daily journal note for a specific date
- get_recent_notes: Get recently modified notes
- list_folders: Browse the folder structure
- get_notes_in_folder: Get all notes in a specific folder
- web_search: Search the web for current information (if enabled)

Content Creation:
- create_mermaid: Create a Mermaid diagram (flowcharts, sequences, etc.)
- write_content: Output the final markdown content to be inserted
- create_note: Create a new note in the vault
- create_calendar_event: Schedule a new calendar event

Document Export:
- export_notes_pdf: Export notes to a PDF document
- export_notes_docx: Export notes to a Word document
- export_selection_xlsx: Export table content to an Excel spreadsheet

DOCUMENT BUILDER TOOLS (for creating documents incrementally):
- create_document: Start a new document draft (returns document_id)
- add_section: Add sections (headings, paragraphs, lists, etc.)
- add_table: Add tables with headers and rows
- save_document: Save the completed document to file
- cancel_document: Discard a document draft

WORKFLOW:
1. Analyze what the user is asking for
2. Use appropriate tools to gather information or create visuals
3. Use write_content to produce the final markdown output
4. Include proper attribution for sources

DOCUMENT EXPORT WORKFLOW:
Quick export (single action):
- Use export_notes_pdf or export_notes_docx to export existing notes directly
- Use export_selection_xlsx to export table content to Excel

Custom document building (multi-step):
1. Use create_document to start a new document
2. Use add_section multiple times to add content (headings, paragraphs, lists)
3. Use add_table to add tables
4. Use save_document to generate the final file
5. Use write_content to provide a link to the exported file

OUTPUT FORMAT:
Your final output should be well-formatted markdown that can be inserted into the note.
Use write_content as your final action to output the completed content.

GUIDELINES:
- Be concise but thorough
- Use headings, bullet points, and formatting for clarity
- For diagrams, use Mermaid for flowcharts, sequences, class diagrams, etc.
- Always cite sources when using information from web search or notes
- When exporting documents, always provide a descriptive title
- If you can't find relevant information, say so rather than making things up
- For complex documents, use the document builder tools for more control"#;

/// Result of running the inline assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineAssistantResult {
    /// The generated content (markdown)
    pub content: String,
    /// Tools that were used
    pub tools_used: Vec<String>,
    /// Number of iterations
    pub iterations: usize,
    /// All tool calls made
    pub tool_calls: Vec<ToolCallRecord>,
}

/// Get the tool definitions for the inline assistant
/// Uses the unified tool builder with write_content enabled (inline assistant inserts content)
pub fn get_inline_assistant_tools(config: &AgentConfig) -> Vec<ToolDefinition> {
    // Inline assistant needs write_content to output content for insertion into notes
    get_unified_agent_tools(config, true)
}

/// Maximum characters for note context in system prompt
/// This is generous (about 8000 tokens) to allow the full note to be included
/// while still leaving room for the system prompt and conversation
const MAX_NOTE_CONTEXT_CHARS: usize = 32000;

/// Extract content from write_content tool calls
/// 
/// The inline assistant uses write_content to output the final markdown content.
/// This function extracts the content from the most recent write_content call,
/// which should be used instead of the LLM's conversational response.
fn extract_write_content(tool_calls: &[ToolCallRecord]) -> Option<String> {
    // Find the last write_content tool call (in case there are multiple)
    tool_calls
        .iter()
        .rev()
        .find(|tc| tc.tool_name == "write_content")
        .and_then(|tc| {
            // The content is in the arguments, not the result
            tc.arguments.get("content").and_then(|v| v.as_str()).map(|s| s.to_string())
        })
}

/// Build the system prompt with optional note context
fn build_system_prompt(note_context: Option<&str>) -> String {
    let mut prompt = INLINE_ASSISTANT_SYSTEM_PROMPT.to_string();

    if let Some(context) = note_context {
        if !context.trim().is_empty() {
            prompt.push_str("\n\n---\n\n");
            prompt.push_str("CURRENT NOTE CONTEXT:\n");
            prompt.push_str("The user is currently editing a note with the following content. ");
            prompt.push_str("You have FULL access to this content - do NOT use search_notes to find information that is already provided here.\n\n");
            
            // Truncate if too long, trying to break at a paragraph boundary
            if context.len() > MAX_NOTE_CONTEXT_CHARS {
                // Try to find a paragraph break near the limit
                let truncation_point = context[..MAX_NOTE_CONTEXT_CHARS]
                    .rfind("\n\n")
                    .or_else(|| context[..MAX_NOTE_CONTEXT_CHARS].rfind('\n'))
                    .unwrap_or(MAX_NOTE_CONTEXT_CHARS);
                
                prompt.push_str(&context[..truncation_point]);
                prompt.push_str("\n\n... (note truncated, ");
                prompt.push_str(&format!("{} more characters not shown)", context.len() - truncation_point));
            } else {
                prompt.push_str(context);
            }
            
            prompt.push_str("\n\n---\n");
        }
    }

    prompt
}

/// Run the inline assistant with streaming support
///
/// This function uses the unified streaming agent for real-time streaming
/// of both content and tool calls. Events are emitted to the frontend
/// as they happen.
#[allow(clippy::too_many_arguments)]
pub async fn run_inline_assistant_with_events(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    request: &str,
    config: AgentConfig,
    note_context: Option<&str>,
    _cancellation_token: Option<&CancellationToken>,
) -> Result<InlineAssistantResult, AgentError> {
    // Build the system prompt with optional note context
    let system_prompt = build_system_prompt(note_context);
    
    // Build messages for the streaming agent (inline assistant is single-turn)
    let messages = vec![
        ChatMessage::system(&system_prompt),
        ChatMessage::user(request),
    ];
    
    // Get tools for inline assistant (includes write_content)
    let tools = get_inline_assistant_tools(&config);
    
    // Convert to LLM tool definitions
    let llm_tools: Vec<super::llm::ToolDefinition> = tools
        .iter()
        .map(|t| super::llm::ToolDefinition {
            tool_type: t.tool_type.clone(),
            function: super::llm::FunctionDefinition {
                name: t.function.name.clone(),
                description: t.function.description.clone(),
                parameters: t.function.parameters.clone(),
            },
        })
        .collect();
    
    // Create the unified tool executor
    let executor = UnifiedToolExecutor::new(pool.clone(), provider.clone(), config);
    
    log::info!(
        "[InlineAssistant] Running streaming agent with {} tools for execution {}",
        llm_tools.len(),
        execution_id
    );
    
    // Run the streaming agent (no cancellation support for inline assistant currently)
    let result = run_streaming_agent(
        app_handle,
        execution_id,
        provider,
        model,
        messages,
        llm_tools,
        &executor,
        30, // Max 30 iterations
        None, // No cancellation for inline assistant
    )
    .await
    .map_err(|e| AgentError::ToolError(e.to_string()))?;

    // Extract unique tool names used
    let tools_used: Vec<String> = result
        .tool_calls
        .iter()
        .map(|tc| tc.tool_name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Extract content from write_content tool calls if present
    // The write_content tool is the primary way for the inline assistant to output content
    // We should use its content instead of the LLM's final conversational response
    let final_content = extract_write_content(&result.tool_calls)
        .unwrap_or(result.content);

    Ok(InlineAssistantResult {
        content: final_content,
        tools_used,
        iterations: result.iterations,
        tool_calls: result.tool_calls,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_inline_assistant_tools() {
        let config = AgentConfig::default();
        let tools = get_inline_assistant_tools(&config);
        
        // Should have all tools including write_content
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"search_notes"));
        assert!(tool_names.contains(&"write_content"));
        assert!(tool_names.contains(&"create_mermaid"));
        assert!(tool_names.contains(&"create_note"));
        assert!(tool_names.contains(&"export_notes_pdf"));
    }

    #[test]
    fn test_build_system_prompt() {
        let prompt = build_system_prompt(None);
        assert!(prompt.contains("inline writing assistant"));

        let prompt_with_context = build_system_prompt(Some("Test note content"));
        assert!(prompt_with_context.contains("CURRENT NOTE CONTEXT"));
        assert!(prompt_with_context.contains("Test note content"));
    }

    #[test]
    fn test_extract_write_content() {
        // Test with write_content tool call
        let tool_calls = vec![
            ToolCallRecord {
                tool_name: "create_mermaid".to_string(),
                arguments: serde_json::json!({"type": "flowchart"}),
                result: "success".to_string(),
            },
            ToolCallRecord {
                tool_name: "write_content".to_string(),
                arguments: serde_json::json!({"content": "## My Heading\n\nSome content here"}),
                result: r#"{"success":true}"#.to_string(),
            },
        ];
        
        let content = extract_write_content(&tool_calls);
        assert_eq!(content, Some("## My Heading\n\nSome content here".to_string()));
    }

    #[test]
    fn test_extract_write_content_no_write_content() {
        // Test without write_content tool call - should return None
        let tool_calls = vec![
            ToolCallRecord {
                tool_name: "search_notes".to_string(),
                arguments: serde_json::json!({"query": "test"}),
                result: "found notes".to_string(),
            },
        ];
        
        let content = extract_write_content(&tool_calls);
        assert_eq!(content, None);
    }

    #[test]
    fn test_extract_write_content_multiple_calls() {
        // Test with multiple write_content calls - should return the last one
        let tool_calls = vec![
            ToolCallRecord {
                tool_name: "write_content".to_string(),
                arguments: serde_json::json!({"content": "First draft"}),
                result: r#"{"success":true}"#.to_string(),
            },
            ToolCallRecord {
                tool_name: "write_content".to_string(),
                arguments: serde_json::json!({"content": "Final version"}),
                result: r#"{"success":true}"#.to_string(),
            },
        ];
        
        let content = extract_write_content(&tool_calls);
        assert_eq!(content, Some("Final version".to_string()));
    }
}
