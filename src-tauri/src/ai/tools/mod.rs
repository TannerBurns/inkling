//! Shared tools for AI agents
//!
//! This module provides reusable tool implementations that can be used by
//! multiple agents (e.g., inline assistant, tagging agent).
//!
//! Tools follow the OpenAI function calling format and can be composed
//! into different agent configurations.

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
#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            enabled_tools: default_enabled_tools(),
            web_search: WebSearchConfig::default(),
            image: ImageConfig::default(),
            diagram: DiagramConfig::default(),
        }
    }
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
}
