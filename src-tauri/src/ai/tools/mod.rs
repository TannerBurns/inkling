//! Shared tools for AI agents
//!
//! This module provides reusable tool implementations that can be used by
//! multiple agents (e.g., inline assistant, tagging agent).
//!
//! Tools follow the OpenAI function calling format and can be composed
//! into different agent configurations.

#![allow(dead_code)]

pub mod append_to_note;
pub mod document_builder;
pub mod export_notes;
pub mod read_attachment;
pub mod search_notes;
pub mod web_search;

use serde::{Deserialize, Serialize};

// Re-export tool implementations
pub use append_to_note::*;
pub use document_builder::*;
pub use export_notes::*;
pub use read_attachment::*;
pub use search_notes::*;
pub use web_search::*;

/// Type alias for tool execution functions
pub type ToolFunction = Box<dyn Fn(serde_json::Value) -> Result<String, String> + Send + Sync>;

// ============================================================================
// Agent Configuration
// ============================================================================

/// Configuration for agent tools and behavior
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    /// Whether the inline assistant is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    
    /// List of enabled tool names
    #[serde(default = "default_enabled_tools")]
    pub enabled_tools: Vec<String>,
    
    /// Web search provider configuration
    #[serde(default)]
    pub web_search: WebSearchConfig,
    
    /// Image provider configuration
    #[serde(default)]
    pub image: ImageConfig,
    
    /// Diagram configuration
    #[serde(default)]
    pub diagram: DiagramConfig,
}

fn default_enabled() -> bool {
    true
}

fn default_enabled_tools() -> Vec<String> {
    vec![
        "search_notes".to_string(),
        "write_content".to_string(),
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
    /// Check if a tool is enabled
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
// Image Configuration
// ============================================================================

/// Image provider options
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ImageProvider {
    #[default]
    None,
    Unsplash,
    DallE,
    StableDiffusion,
}

/// Configuration for image tool
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageConfig {
    /// Selected provider for fetching images
    #[serde(default)]
    pub provider: ImageProvider,
    
    /// Unsplash API access key
    #[serde(default)]
    pub unsplash_access_key: Option<String>,
    
    /// Whether to allow AI image generation
    #[serde(default)]
    pub allow_generation: bool,
}

impl ImageConfig {
    pub fn is_configured(&self) -> bool {
        match self.provider {
            ImageProvider::None => false,
            ImageProvider::Unsplash => self.unsplash_access_key.is_some(),
            ImageProvider::DallE => true, // Uses AI provider
            ImageProvider::StableDiffusion => true, // Uses AI provider
        }
    }
}

// ============================================================================
// Diagram Configuration
// ============================================================================

/// Default diagram format
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DiagramFormat {
    #[default]
    Mermaid,
    Excalidraw,
}

/// Configuration for diagram tools
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiagramConfig {
    /// Default diagram format
    #[serde(default)]
    pub default_format: DiagramFormat,
}

// ============================================================================
// Tool Helpers
// ============================================================================

/// Get the list of all available tool names
pub fn get_all_tool_names() -> Vec<&'static str> {
    vec![
        "search_notes",
        "web_search",
        "fetch_image",
        "generate_image",
        "create_mermaid",
        "create_excalidraw",
        "write_content",
        "append_to_note",
        "read_attachment",
        "export_notes_pdf",
        "export_notes_docx",
        "export_selection_xlsx",
        "create_document",
        "add_section",
        "add_table",
        "save_document",
        "cancel_document",
    ]
}

/// Get a human-readable description for a tool
pub fn get_tool_description(tool_name: &str) -> &'static str {
    match tool_name {
        "search_notes" => "Search your notes for relevant information",
        "web_search" => "Search the web for current information",
        "fetch_image" => "Find a relevant image from Unsplash",
        "generate_image" => "Generate an image using AI",
        "create_mermaid" => "Create a Mermaid diagram (flowcharts, sequences, etc.)",
        "create_excalidraw" => "Create an Excalidraw sketch diagram",
        "write_content" => "Output markdown content to be inserted",
        "append_to_note" => "Append content to the current note in real-time",
        "read_attachment" => "Extract text from attached documents (PDF, Word, Excel, etc.)",
        "export_notes_pdf" => "Export notes to a PDF document",
        "export_notes_docx" => "Export notes to a Word document",
        "export_selection_xlsx" => "Export table content to an Excel spreadsheet",
        "create_document" => "Create a new document draft for building incrementally",
        "add_section" => "Add a section to a document draft",
        "add_table" => "Add a table to a document draft",
        "save_document" => "Save a completed document draft to file",
        "cancel_document" => "Cancel and discard a document draft",
        _ => "Unknown tool",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_agent_config() {
        let config = AgentConfig::default();
        assert!(config.enabled);
        assert!(config.is_tool_enabled("search_notes"));
        assert!(config.is_tool_enabled("write_content"));
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
    fn test_get_all_tool_names() {
        let names = get_all_tool_names();
        assert!(names.contains(&"search_notes"));
        assert!(names.contains(&"web_search"));
        assert!(names.contains(&"create_mermaid"));
    }
}
