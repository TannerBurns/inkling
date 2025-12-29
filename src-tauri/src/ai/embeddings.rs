//! Embedding generation for AI providers
//!
//! Supports both local (Ollama/LM Studio) and cloud (OpenAI) embeddings.
//!
//! NOTE: Contains utility functions for future embedding features.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EmbeddingError {
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Empty embedding returned")]
    EmptyEmbedding,
}

/// Request body for the embeddings API
#[derive(Debug, Serialize)]
struct EmbeddingRequest<'a> {
    model: &'a str,
    input: EmbeddingInput<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    encoding_format: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dimensions: Option<u32>,
}

/// Input can be a single string
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum EmbeddingInput<'a> {
    Single(&'a str),
}

/// Response from the embeddings API
#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
    model: String,
    usage: Option<EmbeddingUsage>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
    #[serde(rename = "index")]
    _index: usize,
}

#[derive(Debug, Deserialize)]
struct EmbeddingUsage {
    #[serde(rename = "prompt_tokens")]
    _prompt_tokens: u32,
    total_tokens: u32,
}

/// Result of generating an embedding
#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingResult {
    /// The embedding vector
    pub embedding: Vec<f32>,
    /// The model used
    pub model: String,
    /// Dimension of the embedding
    pub dimension: usize,
    /// Tokens used (if available)
    pub tokens_used: Option<u32>,
}

/// Generate an embedding directly using provider URL
/// 
/// The model parameter should be in "provider/model" format (e.g., "lmstudio/model-name").
/// The provider_url should be the base URL of the provider (e.g., "http://localhost:1234/v1").
/// The api_key is required for cloud providers like OpenAI.
pub async fn generate_embedding_direct(
    text: &str,
    model: &str,
    provider_url: Option<&str>,
    api_key: Option<&str>,
) -> Result<EmbeddingResult, EmbeddingError> {
    let client = reqwest::Client::new();
    
    // Determine URL and model name based on provider prefix
    let (url, model_name) = if let Some(base_url) = provider_url {
        let base = base_url.trim_end_matches('/');
        let model_name = if let Some(stripped) = model.strip_prefix("lmstudio/") {
            stripped
        } else if let Some(stripped) = model.strip_prefix("ollama/") {
            stripped
        } else if let Some(stripped) = model.strip_prefix("vllm/") {
            stripped
        } else if let Some(stripped) = model.strip_prefix("openai/") {
            stripped
        } else {
            model
        };
        
        let url = if base.ends_with("/v1") {
            format!("{}/embeddings", base)
        } else {
            format!("{}/v1/embeddings", base)
        };
        (url, model_name)
    } else {
        // No provider URL - try to extract from model prefix and use default ports
        if let Some(model_name) = model.strip_prefix("ollama/") {
            ("http://localhost:11434/v1/embeddings".to_string(), model_name)
        } else if let Some(model_name) = model.strip_prefix("lmstudio/") {
            ("http://localhost:1234/v1/embeddings".to_string(), model_name)
        } else if let Some(model_name) = model.strip_prefix("vllm/") {
            ("http://localhost:8000/v1/embeddings".to_string(), model_name)
        } else if let Some(model_name) = model.strip_prefix("openai/") {
            ("https://api.openai.com/v1/embeddings".to_string(), model_name)
        } else {
            return Err(EmbeddingError::ApiError(
                "No provider URL and unable to determine from model prefix".to_string()
            ));
        }
    };
    
    log::info!("[Embedding Direct] Sending request to: {} with model: {}", url, model_name);
    
    let request = EmbeddingRequest {
        model: model_name,
        input: EmbeddingInput::Single(text),
        encoding_format: Some("float"),
        dimensions: None,
    };
    
    // Build request with optional authorization header
    let mut req_builder = client.post(&url).json(&request);
    if let Some(key) = api_key {
        if !key.is_empty() {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
        }
    }
    
    let response = req_builder.send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::ApiError(format!(
            "Status {}: {}",
            status, error_text
        )));
    }

    let response: EmbeddingResponse = response.json().await?;
    
    let data = response
        .data
        .into_iter()
        .next()
        .ok_or(EmbeddingError::EmptyEmbedding)?;

    if data.embedding.is_empty() {
        return Err(EmbeddingError::EmptyEmbedding);
    }

    Ok(EmbeddingResult {
        dimension: data.embedding.len(),
        embedding: data.embedding,
        model: response.model,
        tokens_used: response.usage.map(|u| u.total_tokens),
    })
}

/// Known embedding models with their dimensions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingModelInfo {
    /// Model ID (without provider prefix, e.g., "nomic-embed-text")
    pub id: String,
    /// Display name for UI
    pub display_name: String,
    /// Known dimension (0 if unknown, will be auto-detected)
    pub dimension: u32,
    /// Provider ID (e.g., "ollama", "openai", "lmstudio")
    pub provider: String,
    /// Whether this is a local provider
    pub is_local: bool,
}

/// Known embedding model definitions with pre-defined dimensions
/// Key is "provider/model" format for lookup
struct KnownEmbeddingModel {
    model: &'static str,
    display_name: &'static str,
    dimension: u32,
    provider: &'static str,
    is_local: bool,
}

const KNOWN_EMBEDDING_MODELS: &[KnownEmbeddingModel] = &[
    // Ollama models
    KnownEmbeddingModel {
        model: "nomic-embed-text",
        display_name: "Nomic Embed Text",
        dimension: 768,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "nomic-embed-text:latest",
        display_name: "Nomic Embed Text",
        dimension: 768,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "mxbai-embed-large",
        display_name: "mxbai-embed-large",
        dimension: 1024,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "mxbai-embed-large:latest",
        display_name: "mxbai-embed-large",
        dimension: 1024,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "all-minilm",
        display_name: "all-MiniLM",
        dimension: 384,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "all-minilm:latest",
        display_name: "all-MiniLM",
        dimension: 384,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "snowflake-arctic-embed",
        display_name: "Snowflake Arctic Embed",
        dimension: 1024,
        provider: "ollama",
        is_local: true,
    },
    KnownEmbeddingModel {
        model: "bge-m3",
        display_name: "BGE-M3",
        dimension: 1024,
        provider: "ollama",
        is_local: true,
    },
    // OpenAI models
    KnownEmbeddingModel {
        model: "text-embedding-3-small",
        display_name: "text-embedding-3-small",
        dimension: 1536,
        provider: "openai",
        is_local: false,
    },
    KnownEmbeddingModel {
        model: "text-embedding-3-large",
        display_name: "text-embedding-3-large",
        dimension: 3072,
        provider: "openai",
        is_local: false,
    },
    KnownEmbeddingModel {
        model: "text-embedding-ada-002",
        display_name: "text-embedding-ada-002",
        dimension: 1536,
        provider: "openai",
        is_local: false,
    },
];

/// Get information about known embedding models (static list)
pub fn get_embedding_models() -> Vec<EmbeddingModelInfo> {
    KNOWN_EMBEDDING_MODELS
        .iter()
        .map(|m| EmbeddingModelInfo {
            id: m.model.to_string(),
            display_name: m.display_name.to_string(),
            dimension: m.dimension,
            provider: m.provider.to_string(),
            is_local: m.is_local,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_embedding_models() {
        let models = get_embedding_models();
        assert!(!models.is_empty());
        
        // Check that nomic-embed-text is included
        let nomic = models.iter().find(|m| m.id == "nomic-embed-text");
        assert!(nomic.is_some());
        assert_eq!(nomic.unwrap().dimension, 768);
    }
}
