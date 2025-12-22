//! AI provider configuration management
//!
//! Handles storage and retrieval of AI provider settings,
//! including API keys, endpoints, and model configurations.

#![allow(dead_code)]

use r2d2::PooledConnection;
use r2d2_sqlite::SqliteConnectionManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;

/// Type of AI provider
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Google,
    Ollama,
    LMStudio,
    VLLM,
    Custom,
}

/// Configuration for a single AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProvider {
    /// Unique identifier for this provider config
    pub id: String,
    /// Display name
    pub name: String,
    /// Provider type
    #[serde(rename = "type")]
    pub provider_type: ProviderType,
    /// API key (encrypted at rest in production)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Base URL for the provider API
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Whether this provider is enabled
    pub is_enabled: bool,
    /// List of available models for this provider
    #[serde(default)]
    pub models: Vec<String>,
    /// Currently selected model for this provider
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    /// Context window size in tokens (optional, uses provider defaults if not set)
    /// Primarily useful for local providers where context size may vary
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_length: Option<u32>,
}

/// Default context lengths by provider type (in tokens)
impl ProviderType {
    /// Get the default context length for this provider type
    pub fn default_context_length(&self) -> u32 {
        match self {
            ProviderType::OpenAI => 200_000,      // GPT-4o supports 128K, o1 supports 200K
            ProviderType::Anthropic => 200_000,   // Claude 3.5 supports 200K
            ProviderType::Google => 1_000_000,    // Gemini 1.5/2.0 supports 1M
            ProviderType::Ollama => 32_000,       // Default for most local models
            ProviderType::LMStudio => 32_000,     // Default for most local models
            ProviderType::VLLM => 32_000,         // Default for most local models
            ProviderType::Custom => 32_000,       // Conservative default
        }
    }
}

impl AIProvider {
    /// Get the effective context length for this provider
    /// Returns the configured value or the provider type's default
    pub fn effective_context_length(&self) -> u32 {
        self.context_length.unwrap_or_else(|| self.provider_type.default_context_length())
    }
}

impl Default for AIProvider {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            provider_type: ProviderType::Custom,
            api_key: None,
            base_url: None,
            is_enabled: false,
            models: Vec::new(),
            selected_model: None,
            context_length: None,
        }
    }
}

/// Configuration for embedding generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingConfig {
    /// The provider ID to use for embeddings (e.g., "ollama", "openai", "lmstudio")
    #[serde(default = "default_embedding_provider")]
    pub provider: String,
    /// The embedding model to use (e.g., "nomic-embed-text" for ollama)
    pub model: String,
    /// Dimension of the embedding vector (auto-detected from model if not set)
    #[serde(default)]
    pub dimension: u32,
    /// Whether to automatically embed notes on create/update
    #[serde(default = "default_auto_embed")]
    pub auto_embed: bool,
}

fn default_auto_embed() -> bool {
    true
}

fn default_embedding_provider() -> String {
    "ollama".to_string()
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            provider: "ollama".to_string(),
            model: "nomic-embed-text".to_string(),
            dimension: 768,
            auto_embed: true,
        }
    }
}

impl EmbeddingConfig {
    /// Get the full model ID for API calls (provider/model format)
    pub fn full_model_id(&self) -> String {
        format!("{}/{}", self.provider, self.model)
    }
}

/// Complete AI configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    /// List of configured providers
    pub providers: Vec<AIProvider>,
    /// ID of the default provider to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_provider: Option<String>,
    /// Embedding configuration
    #[serde(default)]
    pub embedding: EmbeddingConfig,
}

impl AIConfig {
    /// Create a new config with default providers and curated models
    pub fn new() -> Self {
        Self {
            providers: vec![
                AIProvider {
                    id: "openai".to_string(),
                    name: "OpenAI".to_string(),
                    provider_type: ProviderType::OpenAI,
                    api_key: None,
                    base_url: None,
                    is_enabled: false,
                    models: vec![
                        // GPT-5 series (reasoning)
                        "gpt-5.2".to_string(),
                        "gpt-5.1".to_string(),
                        "gpt-5".to_string(),
                        "gpt-5-mini".to_string(),
                        "gpt-5-nano".to_string(),
                        // GPT-4.1 series
                        "gpt-4.1".to_string(),
                        "gpt-4.1-mini".to_string(),
                        // GPT-4o series
                        "gpt-4o".to_string(),
                        "gpt-4o-mini".to_string(),
                    ],
                    selected_model: None,
                    context_length: None,
                },
                AIProvider {
                    id: "anthropic".to_string(),
                    name: "Anthropic".to_string(),
                    provider_type: ProviderType::Anthropic,
                    api_key: None,
                    base_url: None,
                    is_enabled: false,
                    models: vec![
                        // Claude 4 series (extended thinking)
                        "claude-sonnet-4-5".to_string(),
                        "claude-opus-4-5".to_string(),
                        "claude-haiku-4-5".to_string(),
                        "claude-sonnet-4".to_string(),
                        // Claude 3.7 (extended thinking)
                        "claude-3-7-sonnet".to_string(),
                        // Claude 3.5 series
                        "claude-3-5-sonnet-20241022".to_string(),
                        "claude-3-5-haiku-20241022".to_string(),
                    ],
                    selected_model: None,
                    context_length: None,
                },
                AIProvider {
                    id: "google".to_string(),
                    name: "Google".to_string(),
                    provider_type: ProviderType::Google,
                    api_key: None,
                    base_url: None,
                    is_enabled: false,
                    models: vec![
                        // Gemini 3 series
                        "gemini-3-pro-preview".to_string(),
                        "gemini-3-flash-preview".to_string(),
                        // Gemini 2.5 series
                        "gemini-2.5-pro".to_string(),
                        "gemini-2.5-flash".to_string(),
                        // Gemini 2.0/1.5
                        "gemini-2.0-flash".to_string(),
                        "gemini-1.5-pro".to_string(),
                        "gemini-1.5-flash".to_string(),
                    ],
                    selected_model: None,
                    context_length: None,
                },
                AIProvider {
                    id: "ollama".to_string(),
                    name: "Ollama (Local)".to_string(),
                    provider_type: ProviderType::Ollama,
                    api_key: None,
                    base_url: Some("http://localhost:11434".to_string()),
                    is_enabled: false,
                    models: Vec::new(), // Will be populated by detection
                    selected_model: None,
                    context_length: None,
                },
                AIProvider {
                    id: "lmstudio".to_string(),
                    name: "LM Studio (Local)".to_string(),
                    provider_type: ProviderType::LMStudio,
                    api_key: None,
                    base_url: Some("http://localhost:1234".to_string()),
                    is_enabled: false,
                    models: Vec::new(), // Will be populated by detection
                    selected_model: None,
                    context_length: None,
                },
                AIProvider {
                    id: "vllm".to_string(),
                    name: "VLLM (Local)".to_string(),
                    provider_type: ProviderType::VLLM,
                    api_key: None,
                    base_url: Some("http://localhost:8000".to_string()),
                    is_enabled: false,
                    models: Vec::new(), // Will be populated by detection
                    selected_model: None,
                    context_length: None,
                },
            ],
            default_provider: None,
            embedding: EmbeddingConfig::default(),
        }
    }
}

const AI_CONFIG_KEY: &str = "ai_config";

/// Environment variable names for API keys
pub const ENV_OPENAI_API_KEY: &str = "OPENAI_API_KEY";
pub const ENV_ANTHROPIC_API_KEY: &str = "ANTHROPIC_API_KEY";
pub const ENV_GOOGLE_API_KEY: &str = "GOOGLE_API_KEY";
/// Ollama URL for Ollama endpoints
pub const ENV_OLLAMA_URL: &str = "OLLAMA_URL";
/// LM Studio URL for LM Studio endpoints
pub const ENV_LMSTUDIO_URL: &str = "LMSTUDIO_URL";
/// VLLM URL for VLLM endpoints
pub const ENV_VLLM_URL: &str = "VLLM_URL";

impl AIConfig {
    /// Check environment variables and populate any missing API keys
    /// Returns true if any values were updated
    pub fn populate_from_env(&mut self) -> bool {
        let mut updated = false;

        for provider in &mut self.providers {
            match provider.provider_type {
                ProviderType::OpenAI => {
                    if provider.api_key.is_none() || provider.api_key.as_ref().map(|k| k.is_empty()).unwrap_or(true) {
                        if let Ok(key) = env::var(ENV_OPENAI_API_KEY) {
                            if !key.is_empty() {
                                provider.api_key = Some(key);
                                provider.is_enabled = true;
                                updated = true;
                                log::info!("Loaded OpenAI API key from environment");
                            }
                        }
                    }
                }
                ProviderType::Anthropic => {
                    if provider.api_key.is_none() || provider.api_key.as_ref().map(|k| k.is_empty()).unwrap_or(true) {
                        if let Ok(key) = env::var(ENV_ANTHROPIC_API_KEY) {
                            if !key.is_empty() {
                                provider.api_key = Some(key);
                                provider.is_enabled = true;
                                updated = true;
                                log::info!("Loaded Anthropic API key from environment");
                            }
                        }
                    }
                }
                ProviderType::Google => {
                    if provider.api_key.is_none() || provider.api_key.as_ref().map(|k| k.is_empty()).unwrap_or(true) {
                        if let Ok(key) = env::var(ENV_GOOGLE_API_KEY) {
                            if !key.is_empty() {
                                provider.api_key = Some(key);
                                provider.is_enabled = true;
                                updated = true;
                                log::info!("Loaded Google API key from environment");
                            }
                        }
                    }
                }
                ProviderType::Ollama => {
                    if provider.base_url.is_none() {
                        if let Ok(url) = env::var(ENV_OLLAMA_URL) {
                            if !url.is_empty() {
                                provider.base_url = Some(url);
                                updated = true;
                                log::info!("Loaded Ollama URL from environment");
                            }
                        }
                    }
                }
                ProviderType::LMStudio => {
                    if provider.base_url.is_none() {
                        if let Ok(url) = env::var(ENV_LMSTUDIO_URL) {
                            if !url.is_empty() {
                                provider.base_url = Some(url);
                                updated = true;
                                log::info!("Loaded LM Studio URL from environment");
                            }
                        }
                    }
                }
                ProviderType::VLLM => {
                    if provider.base_url.is_none() {
                        if let Ok(url) = env::var(ENV_VLLM_URL) {
                            if !url.is_empty() {
                                provider.base_url = Some(url);
                                updated = true;
                                log::info!("Loaded VLLM URL from environment");
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        updated
    }

    /// Get environment variables map for AI providers
    /// This extracts all configured API keys and endpoints
    pub fn get_env_vars(&self) -> HashMap<String, String> {
        let mut env_vars = HashMap::new();

        for provider in &self.providers {
            if !provider.is_enabled {
                continue;
            }

            match provider.provider_type {
                ProviderType::OpenAI => {
                    if let Some(ref key) = provider.api_key {
                        if !key.is_empty() {
                            env_vars.insert(ENV_OPENAI_API_KEY.to_string(), key.clone());
                        }
                    }
                }
                ProviderType::Anthropic => {
                    if let Some(ref key) = provider.api_key {
                        if !key.is_empty() {
                            env_vars.insert(ENV_ANTHROPIC_API_KEY.to_string(), key.clone());
                        }
                    }
                }
                ProviderType::Google => {
                    if let Some(ref key) = provider.api_key {
                        if !key.is_empty() {
                            env_vars.insert(ENV_GOOGLE_API_KEY.to_string(), key.clone());
                        }
                    }
                }
                ProviderType::Ollama => {
                    if let Some(ref url) = provider.base_url {
                        if !url.is_empty() {
                            env_vars.insert(ENV_OLLAMA_URL.to_string(), url.clone());
                        }
                    }
                }
                ProviderType::LMStudio => {
                    // LM Studio is configured via base_url in the provider config
                }
                _ => {}
            }
        }

        env_vars
    }

    /// Get custom provider configurations
    /// These are providers that need special configuration (like LM Studio)
    pub fn get_custom_providers(&self) -> Vec<CustomProviderInfo> {
        let mut custom_providers = Vec::new();

        for provider in &self.providers {
            if !provider.is_enabled {
                continue;
            }

            match provider.provider_type {
                ProviderType::LMStudio => {
                    if let Some(ref url) = provider.base_url {
                        if !url.is_empty() {
                            // Ensure base URL doesn't end with /v1 since we use request_path_overrides
                            let base_url = url.trim_end_matches('/').trim_end_matches("/v1").to_string();
                            
                            log::info!("[AIConfig] LMStudio provider raw models: {:?}", provider.models);
                            log::info!("[AIConfig] Embedding provider: {}, model: {}", self.embedding.provider, self.embedding.model);
                            
                            // For LM Studio, use wildcard to allow all models
                            // This is simpler than trying to maintain an exact list of allowed models
                            // since LM Studio models can have various naming conventions
                            let models = vec!["*".to_string()];
                            
                            log::info!("[AIConfig] LMStudio using wildcard (*) for all models");
                            
                            custom_providers.push(CustomProviderInfo {
                                name: "lmstudio".to_string(),
                                base_url,
                                models,
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        custom_providers
    }
}

/// Information about a custom provider that needs config file configuration
#[derive(Debug, Clone)]
pub struct CustomProviderInfo {
    pub name: String,
    pub base_url: String,
    pub models: Vec<String>,
}

/// Initialize AI config - load from DB and populate from environment
pub fn init_ai_config(
    conn: &PooledConnection<SqliteConnectionManager>,
) -> Result<AIConfig, String> {
    let mut config = load_ai_config(conn)?;
    
    // Check environment variables and update config if needed
    if config.populate_from_env() {
        // Save the updated config back to the database
        save_ai_config(conn, &config)?;
        log::info!("AI config updated from environment variables");
    }
    
    Ok(config)
}

/// Save AI configuration to the database
pub fn save_ai_config(
    conn: &PooledConnection<SqliteConnectionManager>,
    config: &AIConfig,
) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![AI_CONFIG_KEY, json],
    )
    .map_err(|e| format!("Failed to save AI config: {}", e))?;

    Ok(())
}

/// Load AI configuration from the database
pub fn load_ai_config(
    conn: &PooledConnection<SqliteConnectionManager>,
) -> Result<AIConfig, String> {
    let result: Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![AI_CONFIG_KEY],
        |row| row.get(0),
    );

    match result {
        Ok(json) => {
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse AI config: {}", e))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Return default config if none exists
            Ok(AIConfig::new())
        }
        Err(e) => Err(format!("Failed to load AI config: {}", e)),
    }
}

/// Result of testing a provider connection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
}

/// Detect local models available via Ollama
pub async fn detect_ollama_models(base_url: &str) -> ProviderTestResult {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));

    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            // Parse the response to get model names
            if let Ok(body) = response.json::<serde_json::Value>().await {
                if let Some(models) = body.get("models").and_then(|m| m.as_array()) {
                    let model_names: Vec<String> = models
                        .iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                        .map(|s| s.to_string())
                        .collect();

                    return ProviderTestResult {
                        success: true,
                        message: format!("Found {} models", model_names.len()),
                        models: Some(model_names),
                    };
                }
            }
            ProviderTestResult {
                success: true,
                message: "Ollama is running but couldn't list models".to_string(),
                models: None,
            }
        }
        Ok(response) => ProviderTestResult {
            success: false,
            message: format!("Ollama returned error: {}", response.status()),
            models: None,
        },
        Err(e) => ProviderTestResult {
            success: false,
            message: format!("Could not connect to Ollama: {}", e),
            models: None,
        },
    }
}

/// Detect if LM Studio is running
pub async fn detect_lmstudio(base_url: &str) -> ProviderTestResult {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    // LM Studio uses OpenAI-compatible API, so we need /v1/models
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{}/models", base)
    } else {
        format!("{}/v1/models", base)
    };

    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            // Parse OpenAI-compatible models response
            if let Ok(body) = response.json::<serde_json::Value>().await {
                if let Some(models) = body.get("data").and_then(|m| m.as_array()) {
                    let model_names: Vec<String> = models
                        .iter()
                        .filter_map(|m| m.get("id").and_then(|n| n.as_str()))
                        .map(|s| s.to_string())
                        .collect();

                    return ProviderTestResult {
                        success: true,
                        message: format!("Found {} models", model_names.len()),
                        models: Some(model_names),
                    };
                }
            }
            ProviderTestResult {
                success: true,
                message: "LM Studio is running".to_string(),
                models: None,
            }
        }
        Ok(response) => ProviderTestResult {
            success: false,
            message: format!("LM Studio returned error: {}", response.status()),
            models: None,
        },
        Err(e) => ProviderTestResult {
            success: false,
            message: format!("Could not connect to LM Studio: {}", e),
            models: None,
        },
    }
}

/// Test connection to a provider
pub async fn test_provider_connection(provider: &AIProvider, _base_url: &str) -> ProviderTestResult {
    // For local providers, test directly
    match provider.provider_type {
        ProviderType::Ollama => {
            let base_url = provider.base_url.as_deref().unwrap_or("http://localhost:11434");
            return detect_ollama_models(base_url).await;
        }
        ProviderType::LMStudio => {
            let base_url = provider.base_url.as_deref().unwrap_or("http://localhost:1234/v1");
            return detect_lmstudio(base_url).await;
        }
        ProviderType::VLLM => {
            let base_url = provider.base_url.as_deref().unwrap_or("http://localhost:8000/v1");
            return detect_lmstudio(base_url).await; // VLLM uses OpenAI-compatible API
        }
        _ => {}
    }

    // For cloud providers, verify API key is present
    if provider.api_key.is_none() || provider.api_key.as_ref().map(|k| k.is_empty()).unwrap_or(true) {
        return ProviderTestResult {
            success: false,
            message: "API key is required".to_string(),
            models: None,
        };
    }

    // For cloud providers, we can't easily test without making API calls
    // Just return success if API key is present - the LLM client will handle actual validation
    ProviderTestResult {
        success: true,
        message: "API key configured".to_string(),
        models: Some(provider.models.clone()),
    }
}
