//! LLM Client abstraction layer
//!
//! Provides a unified interface for interacting with various LLM providers:
//! - OpenAI (and OpenAI-compatible: Ollama, LMStudio, VLLM)
//! - Anthropic
//! - Google (Gemini)
//!
//! All providers support:
//! - Streaming and non-streaming completions
//! - Native tool calling
//! - Reasoning/thinking token streaming

mod types;
mod openai;
mod anthropic;
mod google;

pub use types::*;
pub use openai::OpenAIClient;
pub use anthropic::AnthropicClient;
pub use google::GoogleClient;

use async_trait::async_trait;
use tokio::sync::mpsc;

use super::config::{AIProvider, ProviderType};

/// Trait for LLM client implementations
///
/// All provider clients implement this trait to provide a unified interface
/// for chat completions.
#[async_trait]
pub trait LlmClient: Send + Sync {
    /// Non-streaming chat completion
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError>;

    /// Streaming chat completion
    ///
    /// Returns a channel receiver that yields StreamEvents.
    /// The caller should consume events until receiving StreamEvent::Done or StreamEvent::Error.
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<mpsc::Receiver<StreamEvent>, LlmError>;
}

/// Create an LLM client for the given provider configuration
pub fn create_client(provider: &AIProvider) -> Result<Box<dyn LlmClient>, LlmError> {
    match provider.provider_type {
        ProviderType::OpenAI => {
            let api_key = provider.api_key.clone().ok_or(LlmError::MissingApiKey)?;
            Ok(Box::new(OpenAIClient::new(
                "https://api.openai.com/v1",
                Some(api_key),
            )))
        }
        ProviderType::Anthropic => {
            let api_key = provider.api_key.clone().ok_or(LlmError::MissingApiKey)?;
            Ok(Box::new(AnthropicClient::new(api_key)))
        }
        ProviderType::Google => {
            let api_key = provider.api_key.clone().ok_or(LlmError::MissingApiKey)?;
            Ok(Box::new(GoogleClient::new(api_key)))
        }
        ProviderType::Ollama => {
            let base_url = provider
                .base_url
                .as_deref()
                .unwrap_or("http://localhost:11434");
            // Ollama uses /v1 for OpenAI compatibility
            let url = if base_url.ends_with("/v1") {
                base_url.to_string()
            } else {
                format!("{}/v1", base_url.trim_end_matches('/'))
            };
            Ok(Box::new(OpenAIClient::new(&url, None)))
        }
        ProviderType::LMStudio => {
            let base_url = provider
                .base_url
                .as_deref()
                .unwrap_or("http://localhost:1234");
            let url = if base_url.ends_with("/v1") {
                base_url.to_string()
            } else {
                format!("{}/v1", base_url.trim_end_matches('/'))
            };
            // LMStudio doesn't support streaming + tools together, so use the special constructor
            Ok(Box::new(OpenAIClient::new_with_tool_streaming_disabled(&url, None)))
        }
        ProviderType::VLLM => {
            let base_url = provider
                .base_url
                .as_deref()
                .unwrap_or("http://localhost:8000");
            let url = if base_url.ends_with("/v1") {
                base_url.to_string()
            } else {
                format!("{}/v1", base_url.trim_end_matches('/'))
            };
            Ok(Box::new(OpenAIClient::new(&url, provider.api_key.clone())))
        }
        ProviderType::Custom => {
            // Custom providers are assumed to be OpenAI-compatible
            let base_url = provider
                .base_url
                .as_deref()
                .ok_or_else(|| LlmError::NotConfigured("Custom provider requires base_url".to_string()))?;
            Ok(Box::new(OpenAIClient::new(base_url, provider.api_key.clone())))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_client_openai() {
        let provider = AIProvider {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            provider_type: ProviderType::OpenAI,
            api_key: Some("test-key".to_string()),
            base_url: None,
            is_enabled: true,
            models: vec!["gpt-4o".to_string()],
            selected_model: Some("gpt-4o".to_string()),
            context_length: None,
        };

        let client = create_client(&provider);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_client_ollama() {
        let provider = AIProvider {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            provider_type: ProviderType::Ollama,
            api_key: None,
            base_url: Some("http://localhost:11434".to_string()),
            is_enabled: true,
            models: vec!["llama3".to_string()],
            selected_model: Some("llama3".to_string()),
            context_length: None,
        };

        let client = create_client(&provider);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_client_missing_key() {
        let provider = AIProvider {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            provider_type: ProviderType::OpenAI,
            api_key: None,
            base_url: None,
            is_enabled: true,
            models: Vec::new(),
            selected_model: None,
            context_length: None,
        };

        let result = create_client(&provider);
        assert!(result.is_err());
        match result {
            Err(LlmError::MissingApiKey) => (),
            Err(other) => panic!("Expected MissingApiKey error, got: {:?}", other),
            Ok(_) => panic!("Expected error, got Ok"),
        }
    }
}
