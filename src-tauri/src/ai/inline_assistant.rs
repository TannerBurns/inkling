//! Inline Assistant Agent
//!
//! An AI agent that helps users research, create content, and generate visuals
//! directly within their notes. Uses tools like web search, image fetching,
//! and diagram generation.
//!
//! NOTE: This module is being integrated via the agent command system.

#![allow(dead_code)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::connection::DbPool;

use super::agent::{run_agent, run_agent_with_events, AgentError, CancellationToken, ToolDefinition, ToolExecutor};
use super::config::AIProvider;
use super::tools::{
    execute_search_notes, execute_web_search, format_results_for_agent, get_search_notes_tool,
    get_web_search_tool, AgentConfig,
};

/// System prompt for the inline assistant
pub const INLINE_ASSISTANT_SYSTEM_PROMPT: &str = r#"You are an inline writing assistant for a note-taking app called Inkling.
The user will ask you to help with research, content creation, diagrams, or images.

AVAILABLE TOOLS:
- search_notes: Search the user's existing notes for relevant information
- web_search: Search the web for current information (if enabled)
- fetch_image: Find a relevant image from Unsplash (if enabled)
- generate_image: Generate an image using AI (if enabled)
- create_mermaid: Create a Mermaid diagram (flowcharts, sequences, etc.)
- create_excalidraw: Create an Excalidraw sketch diagram
- write_content: Output the final markdown content to be inserted

WORKFLOW:
1. Analyze what the user is asking for
2. Use appropriate tools to gather information or create visuals
3. Use write_content to produce the final markdown output
4. Include proper attribution for images and sources

OUTPUT FORMAT:
Your final output should be well-formatted markdown that can be inserted into the note.
Use write_content as your final action to output the completed content.

GUIDELINES:
- Be concise but thorough
- Use headings, bullet points, and formatting for clarity
- For diagrams, prefer Mermaid for flowcharts/sequences, Excalidraw for sketches
- Always cite sources when using information from web search or notes
- If you can't find relevant information, say so rather than making things up"#;

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
    pub tool_calls: Vec<super::agent::ToolCallRecord>,
}

/// The inline assistant agent that implements ToolExecutor
pub struct InlineAssistant {
    pool: DbPool,
    provider: AIProvider,
    config: AgentConfig,
    /// Current note context (optional)
    note_context: Option<String>,
}

impl InlineAssistant {
    /// Create a new inline assistant
    pub fn new(
        pool: DbPool,
        provider: AIProvider,
        config: AgentConfig,
        note_context: Option<String>,
    ) -> Self {
        Self {
            pool,
            provider,
            config,
            note_context,
        }
    }

    /// Search notes using semantic search
    async fn search_notes(&self, args: Value) -> Result<String, String> {
        execute_search_notes(&self.pool, &self.provider, args).await
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

        log::info!("[InlineAssistant] Executing web search: {}", query);

        let results = execute_web_search(&self.config.web_search, query).await?;

        log::info!(
            "[InlineAssistant] Web search returned {} results",
            results.len()
        );

        Ok(format_results_for_agent(&results))
    }

    /// Fetch an image from Unsplash or other sources
    async fn fetch_image(&self, args: Value) -> Result<String, String> {
        if !self.config.is_tool_enabled("fetch_image") {
            return Err("Image fetching is not enabled".to_string());
        }

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' argument")?;

        if !self.config.image.is_configured() {
            return Err("Image provider is not configured. Please set up in Settings.".to_string());
        }

        // TODO: Implement actual image fetching
        Ok(json!({
            "error": "Image fetching not yet implemented",
            "query": query,
            "message": "Please configure an image provider in Settings"
        }).to_string())
    }

    /// Generate an image using AI
    async fn generate_image(&self, args: Value) -> Result<String, String> {
        if !self.config.is_tool_enabled("generate_image") {
            return Err("Image generation is not enabled".to_string());
        }

        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'prompt' argument")?;

        if !self.config.image.allow_generation {
            return Err("AI image generation is disabled in Settings.".to_string());
        }

        // TODO: Implement actual image generation via AI provider
        Ok(json!({
            "error": "Image generation not yet implemented",
            "prompt": prompt,
            "message": "AI image generation will use the configured provider"
        }).to_string())
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
        // This tool just validates and wraps the output
        let code = args
            .get("code")
            .and_then(|v| v.as_str());

        if let Some(mermaid_code) = code {
            // Return the mermaid code block
            Ok(json!({
                "success": true,
                "format": "mermaid",
                "code": mermaid_code,
                "markdown": format!("```mermaid\n{}\n```", mermaid_code)
            }).to_string())
        } else {
            // If no code provided, return a template based on type
            let template = match diagram_type {
                "flowchart" => "flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]",
                "sequence" => "sequenceDiagram\n    participant A\n    participant B\n    A->>B: Message",
                "classDiagram" => "classDiagram\n    class Example {\n        +String name\n        +method()\n    }",
                "stateDiagram" => "stateDiagram-v2\n    [*] --> State1\n    State1 --> [*]",
                "erDiagram" => "erDiagram\n    ENTITY1 ||--o{ ENTITY2 : contains",
                "gantt" => "gantt\n    title Project\n    section Phase1\n    Task1 :a1, 2024-01-01, 30d",
                _ => "flowchart TD\n    A[Start] --> B[End]",
            };

            Ok(json!({
                "success": true,
                "format": "mermaid",
                "template": template,
                "description": description,
                "message": "Use this template and modify based on the description"
            }).to_string())
        }
    }

    /// Create an Excalidraw diagram
    fn create_excalidraw(&self, args: Value) -> Result<String, String> {
        let description = args
            .get("description")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'description' argument")?;

        // Excalidraw diagrams are JSON-based
        // For now, return a placeholder structure
        // In the future, the LLM could generate actual Excalidraw JSON
        
        let elements = args
            .get("elements")
            .cloned()
            .unwrap_or(json!([]));

        Ok(json!({
            "success": true,
            "format": "excalidraw",
            "description": description,
            "elements": elements,
            "message": "Excalidraw diagram structure created"
        }).to_string())
    }

    /// Write content - the final output tool
    fn write_content(&self, args: Value) -> Result<String, String> {
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'content' argument")?;

        // This tool simply returns the content as the final output
        // The agent runner will use this as the final response
        Ok(json!({
            "success": true,
            "content": content,
            "message": "Content ready for insertion"
        }).to_string())
    }
}

#[async_trait]
impl ToolExecutor for InlineAssistant {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        match name {
            "search_notes" => self.search_notes(args).await,
            "web_search" => self.web_search(args).await,
            "fetch_image" => self.fetch_image(args).await,
            "generate_image" => self.generate_image(args).await,
            "create_mermaid" => self.create_mermaid(args),
            "create_excalidraw" => self.create_excalidraw(args),
            "write_content" => self.write_content(args),
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }
}

/// Get the tool definitions for the inline assistant
/// Only returns tools that are enabled in the config
pub fn get_inline_assistant_tools(config: &AgentConfig) -> Vec<ToolDefinition> {
    let mut tools = Vec::new();

    // Always include search_notes and write_content
    tools.push(get_search_notes_tool());
    
    // Web search
    if config.is_tool_enabled("web_search") {
        tools.push(get_web_search_tool());
    }

    // Image fetching
    if config.is_tool_enabled("fetch_image") {
        tools.push(ToolDefinition::function(
            "fetch_image",
            "Find a relevant image from Unsplash based on a query. Returns an image URL with attribution.",
            json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Description of the image to find"
                    }
                },
                "required": ["query"]
            }),
        ));
    }

    // Image generation
    if config.is_tool_enabled("generate_image") {
        tools.push(ToolDefinition::function(
            "generate_image",
            "Generate an image using AI based on a detailed prompt.",
            json!({
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Detailed description of the image to generate"
                    }
                },
                "required": ["prompt"]
            }),
        ));
    }

    // Mermaid diagrams
    if config.is_tool_enabled("create_mermaid") {
        tools.push(ToolDefinition::function(
            "create_mermaid",
            "Create a Mermaid diagram. Supports flowcharts, sequence diagrams, class diagrams, etc.",
            json!({
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["flowchart", "sequence", "classDiagram", "stateDiagram", "erDiagram", "gantt"],
                        "description": "Type of diagram to create"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description of what the diagram should show"
                    },
                    "code": {
                        "type": "string",
                        "description": "The actual Mermaid diagram code"
                    }
                },
                "required": ["description"]
            }),
        ));
    }

    // Excalidraw diagrams
    if config.is_tool_enabled("create_excalidraw") {
        tools.push(ToolDefinition::function(
            "create_excalidraw",
            "Create an Excalidraw sketch-style diagram.",
            json!({
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Description of what the diagram should show"
                    },
                    "elements": {
                        "type": "array",
                        "description": "Excalidraw elements (optional)"
                    }
                },
                "required": ["description"]
            }),
        ));
    }

    // Write content (always included)
    tools.push(ToolDefinition::function(
        "write_content",
        "Output the final markdown content to be inserted into the note. Use this as your final action.",
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The markdown content to insert"
                }
            },
            "required": ["content"]
        }),
    ));

    tools
}

/// Build the system prompt with optional note context
fn build_system_prompt(note_context: Option<&str>) -> String {
    let mut prompt = INLINE_ASSISTANT_SYSTEM_PROMPT.to_string();

    if let Some(context) = note_context {
        prompt.push_str("\n\n---\n\n");
        prompt.push_str("CURRENT NOTE CONTEXT:\n");
        prompt.push_str("The user is currently editing a note with the following content:\n\n");
        
        // Truncate if too long
        if context.len() > 2000 {
            prompt.push_str(&context[..2000]);
            prompt.push_str("\n... (truncated)");
        } else {
            prompt.push_str(context);
        }
    }

    prompt
}

/// Run the inline assistant agent
pub async fn run_inline_assistant(
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    request: &str,
    config: AgentConfig,
    note_context: Option<&str>,
) -> Result<InlineAssistantResult, AgentError> {
    let agent = InlineAssistant::new(
        pool.clone(),
        provider.clone(),
        config.clone(),
        note_context.map(String::from),
    );

    let tools = get_inline_assistant_tools(&config);
    let system_prompt = build_system_prompt(note_context);

    let result = run_agent(
        provider,
        model,
        &system_prompt,
        request,
        tools,
        &agent,
        30, // Max 30 iterations
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

    Ok(InlineAssistantResult {
        content: result.final_response,
        tools_used,
        iterations: result.iterations,
        tool_calls: result.tool_calls_made,
    })
}

/// Run the inline assistant with event streaming
pub async fn run_inline_assistant_with_events(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    request: &str,
    config: AgentConfig,
    note_context: Option<&str>,
    cancellation_token: Option<&CancellationToken>,
) -> Result<InlineAssistantResult, AgentError> {
    let agent = InlineAssistant::new(
        pool.clone(),
        provider.clone(),
        config.clone(),
        note_context.map(String::from),
    );

    let tools = get_inline_assistant_tools(&config);
    let system_prompt = build_system_prompt(note_context);

    let result = run_agent_with_events(
        app_handle,
        execution_id,
        "Inline Assistant",
        provider,
        model,
        &system_prompt,
        request,
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

    Ok(InlineAssistantResult {
        content: result.final_response,
        tools_used,
        iterations: result.iterations,
        tool_calls: result.tool_calls_made,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_inline_assistant_tools() {
        let config = AgentConfig::default();
        let tools = get_inline_assistant_tools(&config);
        
        // Should at least have search_notes, create_mermaid, and write_content
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"search_notes"));
        assert!(tool_names.contains(&"write_content"));
    }

    #[test]
    fn test_build_system_prompt() {
        let prompt = build_system_prompt(None);
        assert!(prompt.contains("inline writing assistant"));

        let prompt_with_context = build_system_prompt(Some("Test note content"));
        assert!(prompt_with_context.contains("CURRENT NOTE CONTEXT"));
        assert!(prompt_with_context.contains("Test note content"));
    }
}
