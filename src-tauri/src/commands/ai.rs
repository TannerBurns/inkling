//! Tauri commands for AI operations

use crate::ai::{
    detect_lmstudio, detect_ollama_models, load_ai_config, save_ai_config, test_provider_connection,
    AIConfig, AIProvider, ProviderTestResult, ProviderType,
};
use crate::AppPool;
use tauri::State;

// ============================================================================
// AI Configuration
// ============================================================================

/// Get the current AI configuration
#[tauri::command]
pub async fn get_ai_config(pool: State<'_, AppPool>) -> Result<AIConfig, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    load_ai_config(&conn)
}

/// Save AI configuration
#[tauri::command]
pub async fn save_ai_config_cmd(
    pool: State<'_, AppPool>,
    config: AIConfig,
) -> Result<(), String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    save_ai_config(&conn, &config)?;
    Ok(())
}

/// Update a single provider's configuration
#[tauri::command]
pub async fn update_provider(
    pool: State<'_, AppPool>,
    provider: AIProvider,
) -> Result<AIConfig, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let mut config = load_ai_config(&conn)?;

    // Find and update the provider
    if let Some(existing) = config.providers.iter_mut().find(|p| p.id == provider.id) {
        *existing = provider;
    } else {
        config.providers.push(provider);
    }

    save_ai_config(&conn, &config)?;
    Ok(config)
}

/// Set the default provider
#[tauri::command]
pub async fn set_default_provider(
    pool: State<'_, AppPool>,
    provider_id: String,
) -> Result<AIConfig, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let mut config = load_ai_config(&conn)?;

    // Verify the provider exists
    if !config.providers.iter().any(|p| p.id == provider_id) {
        return Err(format!("Provider '{}' not found", provider_id));
    }

    config.default_provider = Some(provider_id);
    save_ai_config(&conn, &config)?;
    Ok(config)
}

/// Apply AI configuration
#[tauri::command]
pub async fn apply_ai_config(
    pool: State<'_, AppPool>,
) -> Result<(), String> {
    // Configuration is applied directly when making LLM calls
    let pool_guard = pool.0.read().unwrap();
    let _pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    Ok(())
}

/// Initialize AI configuration
#[tauri::command]
pub async fn init_ai_config_cmd(pool: State<'_, AppPool>) -> Result<AIConfig, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    crate::ai::init_ai_config(&conn)
}

// ============================================================================
// Provider Testing
// ============================================================================

/// Test a provider's API connection
#[tauri::command]
pub async fn test_provider(provider: AIProvider) -> ProviderTestResult {
    test_provider_connection(&provider, "").await
}

// ============================================================================
// Local Model Detection
// ============================================================================

/// Detect available local models from Ollama and LM Studio
#[tauri::command]
pub async fn detect_local_models(
    pool: State<'_, AppPool>,
) -> Result<AIConfig, String> {
    // Get pool and load config (sync work before async)
    let (db_pool, mut config, ollama_url, lmstudio_url) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?.clone();
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        let config = load_ai_config(&conn)?;
        
        let ollama_url = config.providers.iter()
            .find(|p| p.id == "ollama")
            .and_then(|p| p.base_url.clone())
            .unwrap_or_else(|| "http://localhost:11434".to_string());
        
        let lmstudio_url = config.providers.iter()
            .find(|p| p.id == "lmstudio")
            .and_then(|p| p.base_url.clone())
            .unwrap_or_else(|| "http://localhost:1234/v1".to_string());
        
        (pool, config, ollama_url, lmstudio_url)
    };

    // Detect Ollama models (async)
    let ollama_result = detect_ollama_models(&ollama_url).await;
    if ollama_result.success {
        if let Some(models) = ollama_result.models {
            log::info!("Detected {} Ollama models", models.len());
            if let Some(ollama) = config.providers.iter_mut().find(|p| p.id == "ollama") {
                ollama.models = models;
            }
        }
    } else {
        log::warn!("Failed to detect Ollama models: {}", ollama_result.message);
    }

    // Detect LM Studio models (async)
    let lmstudio_result = detect_lmstudio(&lmstudio_url).await;
    if lmstudio_result.success {
        if let Some(models) = lmstudio_result.models {
            log::info!("Detected {} LM Studio models", models.len());
            if let Some(lmstudio) = config.providers.iter_mut().find(|p| p.id == "lmstudio") {
                lmstudio.models = models;
            }
        }
    } else {
        log::warn!("Failed to detect LM Studio models: {}", lmstudio_result.message);
    }

    // Save updated config (sync work after async)
    {
        let conn = db_pool.get().map_err(|e| format!("Database error: {}", e))?;
        save_ai_config(&conn, &config)?;
    }
    
    Ok(config)
}

/// Detect Ollama installation and models
#[tauri::command]
pub async fn detect_ollama(base_url: Option<String>) -> ProviderTestResult {
    let url = base_url.as_deref().unwrap_or("http://localhost:11434");
    detect_ollama_models(url).await
}

/// Detect LM Studio models
#[tauri::command]
pub async fn detect_lmstudio_cmd(base_url: Option<String>) -> ProviderTestResult {
    let url = base_url.as_deref().unwrap_or("http://localhost:1234/v1");
    detect_lmstudio(url).await
}

// ============================================================================
// Provider Info
// ============================================================================

/// Get default provider configurations for all supported providers
#[tauri::command]
pub fn get_default_providers() -> Vec<AIProvider> {
    AIConfig::new().providers
}

/// Get provider type display info
#[tauri::command]
pub fn get_provider_info(provider_type: ProviderType) -> ProviderInfo {
    match provider_type {
        ProviderType::OpenAI => ProviderInfo {
            name: "OpenAI".to_string(),
            requires_api_key: true,
            default_base_url: None,
            description: "GPT-4, GPT-4o, and other OpenAI models".to_string(),
        },
        ProviderType::Anthropic => ProviderInfo {
            name: "Anthropic".to_string(),
            requires_api_key: true,
            default_base_url: None,
            description: "Claude 3.5 Sonnet, Haiku, and Opus models".to_string(),
        },
        ProviderType::Google => ProviderInfo {
            name: "Google".to_string(),
            requires_api_key: true,
            default_base_url: None,
            description: "Gemini Pro and Gemini Flash models".to_string(),
        },
        ProviderType::Ollama => ProviderInfo {
            name: "Ollama".to_string(),
            requires_api_key: false,
            default_base_url: Some("http://localhost:11434".to_string()),
            description: "Run open-source models locally with Ollama".to_string(),
        },
        ProviderType::LMStudio => ProviderInfo {
            name: "LM Studio".to_string(),
            requires_api_key: false,
            default_base_url: Some("http://localhost:1234/v1".to_string()),
            description: "Run models locally with LM Studio".to_string(),
        },
        ProviderType::VLLM => ProviderInfo {
            name: "VLLM".to_string(),
            requires_api_key: false,
            default_base_url: Some("http://localhost:8000/v1".to_string()),
            description: "Run models locally with VLLM server".to_string(),
        },
        ProviderType::Custom => ProviderInfo {
            name: "Custom".to_string(),
            requires_api_key: true,
            default_base_url: None,
            description: "Custom OpenAI-compatible endpoint".to_string(),
        },
    }
}

/// Information about a provider type
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub name: String,
    pub requires_api_key: bool,
    pub default_base_url: Option<String>,
    pub description: String,
}
