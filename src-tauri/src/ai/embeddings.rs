//! Embedding generation for AI providers
//!
//! Supports both local (Ollama/LM Studio) and cloud (OpenAI) embeddings.
//!
//! NOTE: Contains utility functions for future embedding features.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EmbeddingError {
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
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

/// Input can be a single string or array of strings
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum EmbeddingInput<'a> {
    Single(&'a str),
    Batch(Vec<&'a str>),
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
    index: usize,
}

#[derive(Debug, Deserialize)]
struct EmbeddingUsage {
    prompt_tokens: u32,
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

/// Generate an embedding for a single text
/// 
/// The model parameter should be in "provider/model" format (e.g., "lmstudio/model-name").
/// Uses the local_provider_url for local providers (Ollama, LM Studio).
pub async fn generate_embedding(
    base_url: &str,
    text: &str,
    model: &str,
) -> Result<EmbeddingResult, EmbeddingError> {
    generate_embedding_with_url(base_url, text, model, None).await
}

/// Generate an embedding with optional direct URL for local providers
pub async fn generate_embedding_with_url(
    base_url: &str,
    text: &str,
    model: &str,
    local_provider_url: Option<&str>,
) -> Result<EmbeddingResult, EmbeddingError> {
    let client = reqwest::Client::new();
    
    // Determine URL and model name based on provider
    let (url, model_name) = if let Some(provider_url) = local_provider_url {
        // Use the provided local URL directly
        if model.starts_with("lmstudio/") {
            let model_name = &model["lmstudio/".len()..];
            let base = provider_url.trim_end_matches('/');
            let url = if base.ends_with("/v1") {
                format!("{}/embeddings", base)
            } else {
                format!("{}/v1/embeddings", base)
            };
            log::info!("[Embedding] Calling LM Studio at {} with model: {}", url, model_name);
            (url, model_name)
        } else if model.starts_with("ollama/") {
            let model_name = &model["ollama/".len()..];
            let base = provider_url.trim_end_matches('/');
            let url = if base.ends_with("/v1") {
                format!("{}/embeddings", base)
            } else {
                format!("{}/v1/embeddings", base)
            };
            log::info!("[Embedding] Calling Ollama at {} with model: {}", url, model_name);
            (url, model_name)
        } else {
            log::info!("[Embedding] Using base URL with model: {}", model);
            (format!("{}/v1/embeddings", base_url), model)
        }
    } else {
        // No local URL provided, use base URL
        log::info!("[Embedding] Using base URL with model: {}", model);
        (format!("{}/v1/embeddings", base_url), model)
    };
    
    let request = EmbeddingRequest {
        model: model_name,
        input: EmbeddingInput::Single(text),
        encoding_format: Some("float"),
        dimensions: None, // Let the model use its default dimension
    };

    log::info!("[Embedding] Sending request to: {}", url);
    
    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await?;

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

/// Generate an embedding directly using provider URL
/// 
/// The model parameter should be in "provider/model" format (e.g., "lmstudio/model-name").
/// The provider_url should be the base URL of the provider (e.g., "http://localhost:1234/v1").
pub async fn generate_embedding_direct(
    text: &str,
    model: &str,
    provider_url: Option<&str>,
) -> Result<EmbeddingResult, EmbeddingError> {
    let client = reqwest::Client::new();
    
    // Determine URL and model name based on provider prefix
    let (url, model_name) = if let Some(base_url) = provider_url {
        let base = base_url.trim_end_matches('/');
        let model_name = if model.starts_with("lmstudio/") {
            &model["lmstudio/".len()..]
        } else if model.starts_with("ollama/") {
            &model["ollama/".len()..]
        } else if model.starts_with("vllm/") {
            &model["vllm/".len()..]
        } else if model.starts_with("openai/") {
            &model["openai/".len()..]
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
        if model.starts_with("ollama/") {
            let model_name = &model["ollama/".len()..];
            ("http://localhost:11434/v1/embeddings".to_string(), model_name)
        } else if model.starts_with("lmstudio/") {
            let model_name = &model["lmstudio/".len()..];
            ("http://localhost:1234/v1/embeddings".to_string(), model_name)
        } else if model.starts_with("vllm/") {
            let model_name = &model["vllm/".len()..];
            ("http://localhost:8000/v1/embeddings".to_string(), model_name)
        } else if model.starts_with("openai/") {
            let model_name = &model["openai/".len()..];
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
    
    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await?;

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

/// Generate embeddings for multiple texts in a batch
pub async fn generate_embeddings_batch(
    base_url: &str,
    texts: &[&str],
    model: &str,
) -> Result<Vec<EmbeddingResult>, EmbeddingError> {
    generate_embeddings_batch_with_url(base_url, texts, model, None).await
}

/// Generate embeddings for multiple texts in a batch with optional direct URL
pub async fn generate_embeddings_batch_with_url(
    base_url: &str,
    texts: &[&str],
    model: &str,
    local_provider_url: Option<&str>,
) -> Result<Vec<EmbeddingResult>, EmbeddingError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    
    // Determine URL and model name based on provider
    let (url, model_name) = if let Some(provider_url) = local_provider_url {
        if model.starts_with("lmstudio/") {
            let model_name = &model["lmstudio/".len()..];
            let base = provider_url.trim_end_matches('/');
            let url = if base.ends_with("/v1") {
                format!("{}/embeddings", base)
            } else {
                format!("{}/v1/embeddings", base)
            };
            (url, model_name)
        } else if model.starts_with("ollama/") {
            let model_name = &model["ollama/".len()..];
            let base = provider_url.trim_end_matches('/');
            let url = if base.ends_with("/v1") {
                format!("{}/embeddings", base)
            } else {
                format!("{}/v1/embeddings", base)
            };
            (url, model_name)
        } else {
            (format!("{}/v1/embeddings", base_url), model)
        }
    } else {
        (format!("{}/v1/embeddings", base_url), model)
    };
    
    let request = EmbeddingRequest {
        model: model_name,
        input: EmbeddingInput::Batch(texts.to_vec()),
        encoding_format: Some("float"),
        dimensions: None, // Let the model use its default dimension
    };

    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::ApiError(format!(
            "Status {}: {}",
            status, error_text
        )));
    }

    let response: EmbeddingResponse = response.json().await?;
    
    // Sort by index to maintain order
    let mut data: Vec<_> = response.data;
    data.sort_by_key(|d| d.index);

    let tokens_per_item = response.usage.map(|u| u.total_tokens / texts.len() as u32);

    Ok(data
        .into_iter()
        .map(|d| EmbeddingResult {
            dimension: d.embedding.len(),
            embedding: d.embedding,
            model: response.model.clone(),
            tokens_used: tokens_per_item,
        })
        .collect())
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

/// Get the known dimension for a model, or None if unknown
/// Accepts either "model" or "provider/model" format
pub fn get_model_dimension(model: &str) -> Option<u32> {
    // Try direct match first
    if let Some(known) = KNOWN_EMBEDDING_MODELS.iter().find(|m| m.model == model) {
        return Some(known.dimension);
    }
    
    // Try extracting model from "provider/model" format
    if let Some((_provider, model_name)) = model.split_once('/') {
        if let Some(known) = KNOWN_EMBEDDING_MODELS.iter().find(|m| m.model == model_name) {
            return Some(known.dimension);
        }
    }
    
    None
}

/// Get known model info for a specific model
/// Accepts either "model" or "provider/model" format
pub fn get_known_model_info(model: &str) -> Option<EmbeddingModelInfo> {
    // Try direct match first
    if let Some(known) = KNOWN_EMBEDDING_MODELS.iter().find(|m| m.model == model) {
        return Some(EmbeddingModelInfo {
            id: known.model.to_string(),
            display_name: known.display_name.to_string(),
            dimension: known.dimension,
            provider: known.provider.to_string(),
            is_local: known.is_local,
        });
    }
    
    // Try extracting model from "provider/model" format
    if let Some((_provider, model_name)) = model.split_once('/') {
        if let Some(known) = KNOWN_EMBEDDING_MODELS.iter().find(|m| m.model == model_name) {
            return Some(EmbeddingModelInfo {
                id: known.model.to_string(),
                display_name: known.display_name.to_string(),
                dimension: known.dimension,
                provider: known.provider.to_string(),
                is_local: known.is_local,
            });
        }
    }
    
    None
}

/// Create an EmbeddingModelInfo for a detected model
/// Uses known dimension if available, otherwise 0 (meaning auto-detect needed)
pub fn create_model_info(model: &str, provider: &str, is_local: bool) -> EmbeddingModelInfo {
    if let Some(known) = get_known_model_info(model) {
        EmbeddingModelInfo {
            id: model.to_string(),
            display_name: known.display_name,
            dimension: known.dimension,
            provider: provider.to_string(),
            is_local,
        }
    } else {
        EmbeddingModelInfo {
            id: model.to_string(),
            display_name: model.to_string(),
            dimension: 0, // Unknown - will need auto-detection
            provider: provider.to_string(),
            is_local,
        }
    }
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

    #[test]
    fn test_get_model_dimension() {
        // Direct model name
        assert_eq!(get_model_dimension("nomic-embed-text"), Some(768));
        assert_eq!(get_model_dimension("text-embedding-3-small"), Some(1536));
        
        // With provider prefix
        assert_eq!(get_model_dimension("ollama/nomic-embed-text"), Some(768));
        assert_eq!(get_model_dimension("openai/text-embedding-3-small"), Some(1536));
        
        // Unknown model
        assert_eq!(get_model_dimension("unknown-model"), None);
    }

    #[test]
    fn test_create_model_info() {
        // Known model
        let info = create_model_info("nomic-embed-text", "ollama", true);
        assert_eq!(info.dimension, 768);
        assert_eq!(info.display_name, "Nomic Embed Text");
        
        // Unknown model
        let info = create_model_info("custom-embed-model", "ollama", true);
        assert_eq!(info.dimension, 0); // Unknown
        assert_eq!(info.display_name, "custom-embed-model");
    }
}
