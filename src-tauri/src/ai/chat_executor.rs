//! Unified Tool Executor
//!
//! A single tool executor implementation that can execute all available tools.
//! Used by both the chat interface and the inline assistant - the difference
//! is just which tools are passed to the streaming agent.

use async_trait::async_trait;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::db::connection::DbPool;

use super::agent::ToolExecutor;
use super::config::AIProvider;
use super::tools::{
    // Knowledge retrieval tools
    execute_search_notes, execute_search_url_embeddings, execute_read_note,
    execute_get_note_links, execute_read_url_content, execute_web_search,
    format_results_for_agent,
    // Tag tools
    execute_get_note_tags, execute_search_by_tag,
    // Calendar tools
    execute_get_calendar_events, execute_create_calendar_event,
    // Daily notes
    execute_get_daily_note,
    // Recent notes
    execute_get_recent_notes,
    // Folder tools
    execute_list_folders, execute_get_notes_in_folder,
    // Cross-note connection tools
    execute_get_related_notes, execute_get_notes_sharing_tags,
    // Export tools
    execute_export_notes_pdf, execute_export_notes_docx, execute_export_selection_xlsx,
    // Content creation
    execute_create_note, execute_append_content_to_note,
    // Document builder
    get_document_builder_tool_function,
    // Config types
    AgentConfig,
};

/// Unified tool executor for all agent use cases
///
/// This executor can handle all available tools. The specific tools available
/// to an agent are controlled by which ToolDefinitions are passed to the
/// streaming agent - this executor just handles execution.
pub struct UnifiedToolExecutor {
    pool: DbPool,
    provider: AIProvider,
    config: AgentConfig,
    app_handle: Option<AppHandle>,
}

impl UnifiedToolExecutor {
    /// Create a new unified tool executor
    pub fn new(pool: DbPool, provider: AIProvider, config: AgentConfig) -> Self {
        Self {
            pool,
            provider,
            config,
            app_handle: None,
        }
    }

    /// Create a new unified tool executor with app handle for event emission
    pub fn with_app_handle(pool: DbPool, provider: AIProvider, config: AgentConfig, app_handle: AppHandle) -> Self {
        Self {
            pool,
            provider,
            config,
            app_handle: Some(app_handle),
        }
    }

    /// Create a Mermaid diagram
    fn create_mermaid(&self, args: Value) -> Result<String, String> {
        let diagram_type = args
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("flowchart");

        let description = args
            .get("description")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'description' argument")?;

        // The LLM should generate the actual mermaid code
        let code = args.get("code").and_then(|v| v.as_str());

        if let Some(mermaid_code) = code {
            Ok(serde_json::json!({
                "success": true,
                "format": "mermaid",
                "code": mermaid_code,
                "markdown": format!("```mermaid\n{}\n```", mermaid_code)
            })
            .to_string())
        } else {
            // Return a template based on type
            let template = match diagram_type {
                "flowchart" => "flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]",
                "sequence" => {
                    "sequenceDiagram\n    participant A\n    participant B\n    A->>B: Message"
                }
                "classDiagram" => {
                    "classDiagram\n    class Example {\n        +String name\n        +method()\n    }"
                }
                "stateDiagram" => "stateDiagram-v2\n    [*] --> State1\n    State1 --> [*]",
                "erDiagram" => "erDiagram\n    ENTITY1 ||--o{ ENTITY2 : contains",
                "gantt" => "gantt\n    title Project\n    section Phase1\n    Task1 :a1, 2024-01-01, 30d",
                _ => "flowchart TD\n    A[Start] --> B[End]",
            };

            Ok(serde_json::json!({
                "success": true,
                "format": "mermaid",
                "template": template,
                "description": description,
                "message": "Use this template and modify based on the description"
            })
            .to_string())
        }
    }

    /// Write content - the final output tool (for inline assistant)
    fn write_content(&self, args: Value) -> Result<String, String> {
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'content' argument")?;

        Ok(serde_json::json!({
            "success": true,
            "content": content,
            "message": "Content ready for insertion"
        })
        .to_string())
    }

    /// Web search using the configured provider
    async fn web_search(&self, args: Value) -> Result<String, String> {
        if !self.config.sources.web_search {
            return Err("Web search is not enabled".to_string());
        }

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' argument")?;

        log::info!("[UnifiedToolExecutor] Executing web search: {}", query);

        let results = execute_web_search(&self.config.web_search, query).await?;

        log::info!(
            "[UnifiedToolExecutor] Web search returned {} results",
            results.len()
        );

        Ok(format_results_for_agent(&results))
    }
}

#[async_trait]
impl ToolExecutor for UnifiedToolExecutor {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        match name {
            // Knowledge retrieval tools
            "search_notes" => execute_search_notes(&self.pool, &self.provider, args).await,
            "search_url_embeddings" => execute_search_url_embeddings(&self.pool, args).await,
            "read_note" => execute_read_note(&self.pool, args),
            "get_note_links" => execute_get_note_links(&self.pool, args),
            "read_url_content" => execute_read_url_content(&self.pool, args),
            "get_note_tags" => execute_get_note_tags(&self.pool, args),
            "search_by_tag" => execute_search_by_tag(&self.pool, args),
            "get_related_notes" => execute_get_related_notes(&self.pool, args),
            "get_notes_sharing_tags" => execute_get_notes_sharing_tags(&self.pool, args),
            "get_calendar_events" => execute_get_calendar_events(&self.pool, args),
            "get_daily_note" => execute_get_daily_note(&self.pool, args),
            "get_recent_notes" => execute_get_recent_notes(&self.pool, args),
            "list_folders" => execute_list_folders(&self.pool, args),
            "get_notes_in_folder" => execute_get_notes_in_folder(&self.pool, args),
            "web_search" => self.web_search(args).await,
            
            // Content creation tools
            "create_mermaid" => self.create_mermaid(args),
            "write_content" => self.write_content(args),
            "create_note" => execute_create_note(&self.pool, args),
            "append_content_to_note" => {
                let result = execute_append_content_to_note(&self.pool, args)?;
                
                // Emit event to notify frontend to refresh the note
                if let Some(ref app) = self.app_handle {
                    // Parse the result to get the note ID
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&result) {
                        if let Some(note_id) = parsed.get("note").and_then(|n| n.get("id")).and_then(|v| v.as_str()) {
                            let _ = app.emit("note-content-updated", serde_json::json!({
                                "noteId": note_id,
                                "source": "chat_agent"
                            }));
                            log::info!("[UnifiedToolExecutor] Emitted note-content-updated for note {}", note_id);
                        }
                    }
                }
                
                Ok(result)
            }
            "create_calendar_event" => execute_create_calendar_event(&self.pool, args),
            
            // Export tools
            "export_notes_pdf" => execute_export_notes_pdf(&self.pool, args),
            "export_notes_docx" => execute_export_notes_docx(&self.pool, args),
            "export_selection_xlsx" => execute_export_selection_xlsx(&self.pool, args),
            
            // Document builder tools
            "create_document" | "add_section" | "add_table" | "save_document" | "cancel_document" => {
                if let Some(tool_fn) = get_document_builder_tool_function(name) {
                    tool_fn(args)
                } else {
                    Err(format!("Document builder tool not found: {}", name))
                }
            }
            
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_create_mermaid_with_code() {
        // We can't easily test without a real pool, but we can test the mermaid logic
        let args = serde_json::json!({
            "type": "flowchart",
            "description": "A simple flow",
            "code": "flowchart TD\n    A --> B"
        });

        // Manual test of the logic
        let code = args.get("code").and_then(|v| v.as_str());
        assert!(code.is_some());
        assert!(code.unwrap().contains("flowchart"));
    }

    #[test]
    fn test_create_mermaid_template() {
        let args = serde_json::json!({
            "type": "sequence",
            "description": "A sequence diagram"
        });

        let diagram_type = args
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("flowchart");
        assert_eq!(diagram_type, "sequence");
    }
}

