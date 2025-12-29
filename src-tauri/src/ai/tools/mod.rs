//! Shared tools for AI agents
//!
//! This module provides reusable tool implementations that can be used by
//! multiple agents (e.g., inline assistant, tagging agent).
//!
//! Tools follow the OpenAI function calling format and can be composed
//! into different agent configurations.

pub mod append_to_note;
pub mod calendar;
pub mod create_note;
pub mod daily_notes;
pub mod document_builder;
pub mod export_notes;
pub mod fetch_url;
pub mod folders;
pub mod note_links;
pub mod note_tags;
pub mod read_attachment;
pub mod read_document;
pub mod read_note;
pub mod read_url;
pub mod recent_notes;
pub mod related_notes;
pub mod search_notes;
pub mod search_urls;
pub mod web_search;

use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::ai::agent::ToolDefinition;

// Re-export tool implementations
pub use append_to_note::*;
pub use calendar::*;
pub use create_note::*;
pub use daily_notes::*;
pub use document_builder::*;
pub use export_notes::*;
pub use fetch_url::*;
pub use folders::*;
pub use note_links::*;
pub use note_tags::*;
pub use read_attachment::*;
pub use read_document::*;
pub use read_note::*;
pub use read_url::*;
pub use recent_notes::*;
pub use related_notes::*;
pub use search_notes::*;
pub use search_urls::*;
pub use web_search::*;

/// Type alias for tool execution functions
pub type ToolFunction = Box<dyn Fn(serde_json::Value) -> Result<String, String> + Send + Sync>;

// ============================================================================
// Agent Configuration
// ============================================================================

/// Read/Write permission for a data source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RWPermission {
    /// Can read/search this source
    #[serde(default = "default_true")]
    pub read: bool,
    
    /// Can write/create/modify this source
    #[serde(default = "default_true")]
    pub write: bool,
}

impl Default for RWPermission {
    fn default() -> Self {
        Self {
            read: true,
            write: true,
        }
    }
}

impl RWPermission {
    /// Create a full read-write permission
    pub fn full() -> Self {
        Self { read: true, write: true }
    }
}

/// Configuration for data sources the agent can access
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    // =========================================================================
    // Sources with read + write permissions
    // =========================================================================
    
    /// Notes: read (search_notes, read_note, get_note_links, get_related_notes, get_recent_notes)
    ///        write (create_note, write_content, append_to_note)
    #[serde(default)]
    pub notes: RWPermission,
    
    /// Tags: read (get_note_tags, search_by_tag, get_notes_sharing_tags)
    ///       write (add/remove tags - future)
    #[serde(default)]
    pub tags: RWPermission,
    
    /// Calendar: read (get_calendar_events)
    ///           write (create_calendar_event)
    #[serde(default)]
    pub calendar: RWPermission,
    
    /// Daily Notes: read (get_daily_note)
    ///              write (create/modify daily notes - future)
    #[serde(default)]
    pub daily_notes: RWPermission,
    
    /// Folders: read (list_folders, get_notes_in_folder)
    ///          write (create folders, move notes - future)
    #[serde(default)]
    pub folders: RWPermission,
    
    // =========================================================================
    // Read-only sources
    // =========================================================================
    
    /// URL Attachments: search_url_embeddings, read_url_content (read-only)
    #[serde(default = "default_true")]
    pub url_attachments: bool,
    
    /// Web Search: web_search (requires WebSearchConfig) (read-only)
    #[serde(default)]
    pub web_search: bool,
}

impl Default for SourceConfig {
    fn default() -> Self {
        Self {
            // Sources with read + write - default to full access
            notes: RWPermission::full(),
            tags: RWPermission::full(),
            calendar: RWPermission::full(),
            daily_notes: RWPermission::full(),
            folders: RWPermission::full(),
            // Read-only sources
            url_attachments: true,
            web_search: false, // Requires API key configuration
        }
    }
}

/// Configuration for agent capabilities (non-source-specific)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityConfig {
    /// Document Export: export_notes_pdf, export_notes_docx, export_selection_xlsx, document builder
    #[serde(default = "default_true")]
    pub document_export: bool,
}

impl Default for CapabilityConfig {
    fn default() -> Self {
        Self {
            document_export: true,
        }
    }
}

fn default_true() -> bool {
    true
}

/// Configuration for agent tools and behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    /// Whether the agents are enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    
    /// List of enabled tool names (kept for backwards compatibility)
    #[serde(default = "default_enabled_tools")]
    pub enabled_tools: Vec<String>,
    
    /// Web search provider configuration
    #[serde(default)]
    pub web_search: WebSearchConfig,
    
    /// Data source toggles
    #[serde(default)]
    pub sources: SourceConfig,
    
    /// Capability toggles
    #[serde(default)]
    pub capabilities: CapabilityConfig,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            enabled_tools: default_enabled_tools(),
            web_search: WebSearchConfig::default(),
            sources: SourceConfig::default(),
            capabilities: CapabilityConfig::default(),
        }
    }
}

fn default_enabled() -> bool {
    true
}

fn default_enabled_tools() -> Vec<String> {
    vec![
        "search_notes".to_string(),
        "append_content_to_note".to_string(),
        "create_mermaid".to_string(),
        "export_notes_pdf".to_string(),
        "export_notes_docx".to_string(),
        "export_selection_xlsx".to_string(),
        "create_document".to_string(),
        "add_section".to_string(),
        "add_table".to_string(),
        "save_document".to_string(),
        "cancel_document".to_string(),
    ]
}

impl AgentConfig {
    /// Check if a tool is enabled (legacy method for backwards compatibility)
    pub fn is_tool_enabled(&self, tool_name: &str) -> bool {
        self.enabled_tools.iter().any(|t| t == tool_name)
    }
}

// ============================================================================
// Web Search Configuration
// ============================================================================

/// Web search provider options
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WebSearchProvider {
    #[default]
    None,
    Brave,
    Serper,
    Tavily,
}

/// Configuration for web search tool
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchConfig {
    /// Selected provider
    #[serde(default)]
    pub provider: WebSearchProvider,
    
    /// API key for the provider
    #[serde(default)]
    pub api_key: Option<String>,
}

impl WebSearchConfig {
    pub fn is_configured(&self) -> bool {
        self.provider != WebSearchProvider::None && self.api_key.is_some()
    }
}

// ============================================================================
// Unified Tool Builder
// ============================================================================

/// Get the tool definition for create_mermaid
pub fn get_create_mermaid_tool() -> ToolDefinition {
    ToolDefinition::function(
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
    )
}

/// Get the tool definition for write_content
pub fn get_write_content_tool() -> ToolDefinition {
    ToolDefinition::function(
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
    )
}

/// Get all tools based on the unified agent configuration
/// 
/// # Arguments
/// * `config` - The agent configuration with source and capability toggles
/// * `include_write_content` - Whether to include the write_content tool (for inline assistant)
pub fn get_unified_agent_tools(config: &AgentConfig, include_write_content: bool) -> Vec<ToolDefinition> {
    let mut tools = Vec::new();
    
    // =========================================================================
    // Data Sources with Read/Write Permissions
    // =========================================================================
    
    // Notes: read (search, read, links, related, recent) / write (create_note, write_content)
    if config.sources.notes.read {
        tools.push(get_search_notes_tool());
        tools.push(get_read_note_tool());
        tools.push(get_note_links_tool());
        tools.push(get_related_notes_tool());
        tools.push(get_recent_notes_tool());
    }
    if config.sources.notes.write {
        tools.push(get_create_note_tool());
        tools.push(get_create_mermaid_tool());
        // append_content_to_note is for chat agent (writes to DB by note ID)
        // Only include when NOT using inline assistant (which uses write_content instead)
        if !include_write_content {
            tools.push(get_append_content_to_note_tool());
        }
        // write_content is only for inline assistant (outputs content to be inserted at cursor)
        if include_write_content {
            tools.push(get_write_content_tool());
        }
    }
    
    // Tags: read (get tags, search by tag, notes sharing tags) / write (future: add/remove tags)
    if config.sources.tags.read {
        tools.push(get_note_tags_tool());
        tools.push(get_search_by_tag_tool());
        tools.push(get_notes_sharing_tags_tool());
    }
    // Note: tags.write is reserved for future tag modification tools
    
    // Calendar: read (get events) / write (create events)
    if config.sources.calendar.read {
        tools.push(get_calendar_events_tool());
    }
    if config.sources.calendar.write {
        tools.push(get_create_calendar_event_tool());
    }
    
    // Daily Notes: read (get daily note) / write (future: create/modify)
    if config.sources.daily_notes.read {
        tools.push(get_daily_note_tool());
    }
    // Note: daily_notes.write is reserved for future daily note modification tools
    
    // Folders: read (list folders, get notes in folder) / write (future: create, move)
    if config.sources.folders.read {
        tools.push(get_list_folders_tool());
        tools.push(get_notes_in_folder_tool());
    }
    // Note: folders.write is reserved for future folder management tools
    
    // =========================================================================
    // Read-Only Data Sources
    // =========================================================================
    
    // URL Attachments: search, read content (read-only source)
    if config.sources.url_attachments {
        tools.push(get_search_url_embeddings_tool());
        tools.push(get_read_url_content_tool());
    }
    
    // Web Search (requires API key configuration) (read-only source)
    if config.sources.web_search && config.web_search.is_configured() {
        tools.push(get_web_search_tool());
    }
    
    // =========================================================================
    // Capabilities (non-source-specific)
    // =========================================================================
    
    // Document Export: PDF, DOCX, XLSX, document builder
    if config.capabilities.document_export {
        tools.push(get_export_notes_pdf_tool());
        tools.push(get_export_notes_docx_tool());
        tools.push(get_export_selection_xlsx_tool());
        
        // Document builder tools
        for tool_json in get_all_document_builder_tools() {
            if let Some(func) = tool_json.get("function") {
                let name = func.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let description = func.get("description").and_then(|v| v.as_str()).unwrap_or("");
                let parameters = func.get("parameters").cloned().unwrap_or(json!({}));
                tools.push(ToolDefinition::function(name, description, parameters));
            }
        }
    }
    
    tools
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_agent_config() {
        let config = AgentConfig::default();
        assert!(config.enabled);
        assert!(config.is_tool_enabled("search_notes"));
        assert!(config.is_tool_enabled("append_content_to_note"));
        assert!(!config.is_tool_enabled("web_search")); // Not in default list
    }

    #[test]
    fn test_web_search_config() {
        let config = WebSearchConfig::default();
        assert!(!config.is_configured());

        let configured = WebSearchConfig {
            provider: WebSearchProvider::Brave,
            api_key: Some("test-key".to_string()),
        };
        assert!(configured.is_configured());
    }
    
    #[test]
    fn test_rw_permission() {
        let default_perm = RWPermission::default();
        assert!(default_perm.read);
        assert!(default_perm.write);
        
        let read_only = RWPermission { read: true, write: false };
        assert!(read_only.read);
        assert!(!read_only.write);
        
        let full = RWPermission::full();
        assert!(full.read);
        assert!(full.write);
    }
    
    #[test]
    fn test_default_source_config() {
        let config = SourceConfig::default();
        // Sources with read + write
        assert!(config.notes.read);
        assert!(config.notes.write);
        assert!(config.tags.read);
        assert!(config.tags.write);
        assert!(config.calendar.read);
        assert!(config.calendar.write);
        assert!(config.daily_notes.read);
        assert!(config.daily_notes.write);
        assert!(config.folders.read);
        assert!(config.folders.write);
        // Read-only sources
        assert!(config.url_attachments);
        assert!(!config.web_search); // Disabled by default (requires API key)
    }
    
    #[test]
    fn test_default_capability_config() {
        let config = CapabilityConfig::default();
        assert!(config.document_export);
    }
    
    #[test]
    fn test_agent_config_with_sources_and_capabilities() {
        let config = AgentConfig::default();
        assert!(config.sources.notes.read);
        assert!(config.sources.notes.write);
        assert!(config.capabilities.document_export);
    }
    
    #[test]
    fn test_get_unified_agent_tools_default() {
        let config = AgentConfig::default();
        let tools = get_unified_agent_tools(&config, true);
        
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        
        // Should have note read tools
        assert!(tool_names.contains(&"search_notes"));
        assert!(tool_names.contains(&"read_note"));
        assert!(tool_names.contains(&"get_note_links"));
        
        // Should have note write tools (inline assistant mode)
        assert!(tool_names.contains(&"create_note"));
        assert!(tool_names.contains(&"create_mermaid"));
        assert!(tool_names.contains(&"write_content"));
        
        // Should NOT have append_content_to_note (that's for chat agent mode)
        assert!(!tool_names.contains(&"append_content_to_note"));
        
        // Should have calendar write tools
        assert!(tool_names.contains(&"create_calendar_event"));
        
        // Should have export tools
        assert!(tool_names.contains(&"export_notes_pdf"));
    }
    
    #[test]
    fn test_get_unified_agent_tools_without_write_content() {
        let config = AgentConfig::default();
        let tools = get_unified_agent_tools(&config, false);
        
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        
        // Should NOT have write_content (chat agent mode - no cursor to insert at)
        assert!(!tool_names.contains(&"write_content"));
        
        // Should have append_content_to_note (chat agent mode - writes to DB by note ID)
        assert!(tool_names.contains(&"append_content_to_note"));
        
        // Should still have other write tools
        assert!(tool_names.contains(&"create_note"));
        assert!(tool_names.contains(&"create_mermaid"));
    }
    
    #[test]
    fn test_get_unified_agent_tools_read_only_notes() {
        let mut config = AgentConfig::default();
        config.sources.notes = RWPermission { read: true, write: false };
        
        let tools = get_unified_agent_tools(&config, true);
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        
        // Should have note read tools
        assert!(tool_names.contains(&"search_notes"));
        assert!(tool_names.contains(&"read_note"));
        
        // Should NOT have note write tools
        assert!(!tool_names.contains(&"create_note"));
        assert!(!tool_names.contains(&"create_mermaid"));
        assert!(!tool_names.contains(&"write_content"));
        assert!(!tool_names.contains(&"append_content_to_note"));
    }
    
    #[test]
    fn test_get_unified_agent_tools_disabled_sources() {
        let mut config = AgentConfig::default();
        config.sources.notes.read = false;
        config.sources.notes.write = false;
        config.sources.calendar.read = false;
        config.sources.calendar.write = false;
        
        let tools = get_unified_agent_tools(&config, true);
        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        
        // Should NOT have note tools
        assert!(!tool_names.contains(&"search_notes"));
        assert!(!tool_names.contains(&"read_note"));
        assert!(!tool_names.contains(&"create_note"));
        
        // Should NOT have calendar tools
        assert!(!tool_names.contains(&"get_calendar_events"));
        assert!(!tool_names.contains(&"create_calendar_event"));
        
        // Should still have other sources
        assert!(tool_names.contains(&"search_url_embeddings"));
    }
}
