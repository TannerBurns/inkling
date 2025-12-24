//! Tauri commands for AI agents
//!
//! Provides commands for executing the inline assistant, summarization agent,
//! research agent, and managing agent configuration.

use std::collections::HashMap;

use tauri::{Emitter, State};

use crate::ai::{
    extract_text_from_attachment, load_ai_config, run_inline_assistant_with_events,
    run_research_agent, run_summarization_agent, AgentConfig, CancellationToken,
    InlineAssistantResult, ResearchResult, SummarizationResult,
};
use crate::db;
use crate::vault;
use crate::AppPool;

/// Storage for active agent cancellation tokens
pub struct AgentExecutions(pub std::sync::RwLock<HashMap<String, CancellationToken>>);

// ============================================================================
// Agent Configuration Commands
// ============================================================================

/// Get the current agent configuration
#[tauri::command]
pub fn get_agent_config(pool: State<AppPool>) -> Result<AgentConfig, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Try to load from settings, or return default
    match db::settings::get_setting(&conn, "agent_config") {
        Ok(Some(json_str)) => {
            serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse agent config: {}", e))
        }
        Ok(None) => Ok(AgentConfig::default()),
        Err(e) => Err(format!("Failed to load agent config: {}", e)),
    }
}

/// Save the agent configuration
#[tauri::command]
pub fn save_agent_config(pool: State<AppPool>, config: AgentConfig) -> Result<(), String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let json_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    db::settings::set_setting(&conn, "agent_config", &json_str).map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Inline Assistant Commands
// ============================================================================

/// Execute the inline assistant agent
///
/// This command runs the inline assistant with streaming progress updates.
/// The frontend should listen for `agent-progress-{execution_id}` events.
#[tauri::command]
pub async fn execute_inline_agent(
    app_handle: tauri::AppHandle,
    pool: State<'_, AppPool>,
    agent_executions: State<'_, AgentExecutions>,
    execution_id: String,
    request: String,
    note_context: Option<String>,
) -> Result<InlineAssistantResult, String> {
    log::info!("[Agent] Starting execute_inline_agent: {}", execution_id);
    log::info!("[Agent] Request: {}", request);
    
    // Get the pool
    let db_pool = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };

    // Get agent config
    let config = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        match db::settings::get_setting(&conn, "agent_config") {
            Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
            _ => AgentConfig::default(),
        }
    };
    log::info!("[Agent] Config enabled: {}", config.enabled);

    // Check if agents are enabled
    if !config.enabled {
        return Err("Inline assistant is disabled. Enable it in Settings.".to_string());
    }

    // Get the model and provider to use
    let (model, provider) = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        let ai_config = load_ai_config(&conn).map_err(|e| e)?;
        get_model_and_provider(&ai_config)?
    };
    log::info!("[Agent] Using model: {} via provider: {}", model, provider.name);

    // Create cancellation token
    let cancellation_token = CancellationToken::new();
    
    // Store the token for potential cancellation
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.insert(execution_id.clone(), cancellation_token.clone());
    }

    // Run the agent
    log::info!("[Agent] Running inline assistant...");
    let result = run_inline_assistant_with_events(
        &app_handle,
        &execution_id,
        &db_pool,
        &provider,
        &model,
        &request,
        config,
        note_context.as_deref(),
        Some(&cancellation_token),
    )
    .await;

    // Remove the token after completion
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.remove(&execution_id);
    }

    match &result {
        Ok(r) => log::info!("[Agent] Success! Response length: {}", r.content.len()),
        Err(e) => log::error!("[Agent] Error: {}", e),
    }

    result.map_err(|e| e.to_string())
}

/// Cancel an in-progress agent execution
#[tauri::command]
pub fn cancel_agent_execution(
    app_handle: tauri::AppHandle,
    agent_executions: State<AgentExecutions>,
    execution_id: String,
) -> Result<(), String> {
    let executions = agent_executions.0.read().unwrap();
    
    if let Some(token) = executions.get(&execution_id) {
        token.cancel();
        
        // Emit cancelled event
        let event_name = format!("agent-progress-{}", execution_id);
        let _ = app_handle.emit(&event_name, crate::ai::AgentProgress::Cancelled);
        
        Ok(())
    } else {
        Err(format!("No active execution found with ID: {}", execution_id))
    }
}

// ============================================================================
// Summarization Agent Commands
// ============================================================================

/// Execute the summarization agent
///
/// This command runs the summarization agent with streaming content output.
/// The frontend should listen for:
/// - `agent-progress-{execution_id}` events for progress updates
/// - `agent-content-{execution_id}` events for content to insert
#[tauri::command]
pub async fn execute_summarization_agent(
    app_handle: tauri::AppHandle,
    pool: State<'_, AppPool>,
    agent_executions: State<'_, AgentExecutions>,
    execution_id: String,
    content: String,
    content_type: String, // "selection" or "attachment"
    attachment_path: Option<String>, // Path to attachment if content_type is "attachment"
) -> Result<SummarizationResult, String> {
    log::info!(
        "[SummarizationAgent] Starting: execution_id={}, content_type={}, content_len={}",
        execution_id,
        content_type,
        content.len()
    );

    // Get the pool
    let db_pool = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };

    // Get vault path
    let vault_path = vault::get_current_vault_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Get agent config
    let config = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        match db::settings::get_setting(&conn, "agent_config") {
            Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
            _ => AgentConfig::default(),
        }
    };

    // Check if agents are enabled
    if !config.enabled {
        return Err("Agents are disabled. Enable them in Settings.".to_string());
    }

    // Get the model and provider
    let (model, provider) = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        let ai_config = load_ai_config(&conn).map_err(|e| e)?;
        get_model_and_provider(&ai_config)?
    };
    log::info!(
        "[SummarizationAgent] Using model: {} via provider: {}",
        model,
        provider.name
    );

    // If content_type is "attachment", extract text from the attachment
    let actual_content = if content_type == "attachment" {
        if let Some(ref path) = attachment_path {
            // Resolve path relative to vault
            let full_path = if path.starts_with('/') || path.contains(':') {
                path.clone()
            } else {
                format!("{}/{}", vault_path.trim_end_matches('/'), path.trim_start_matches('/'))
            };
            extract_text_from_attachment(&full_path, Some(50000))?
        } else {
            content.clone()
        }
    } else {
        content.clone()
    };

    // Create cancellation token
    let cancellation_token = CancellationToken::new();

    // Store the token
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.insert(execution_id.clone(), cancellation_token.clone());
    }

    // Run the agent
    let result = run_summarization_agent(
        &app_handle,
        &execution_id,
        &db_pool,
        &provider,
        &model,
        &actual_content,
        &content_type,
        &vault_path,
        Some(&cancellation_token),
    )
    .await;

    // Remove the token
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.remove(&execution_id);
    }

    match &result {
        Ok(r) => log::info!(
            "[SummarizationAgent] Success! Chunks appended: {}",
            r.chunks_appended
        ),
        Err(e) => log::error!("[SummarizationAgent] Error: {}", e),
    }

    result.map_err(|e| e.to_string())
}

// ============================================================================
// Research Agent Commands
// ============================================================================

/// Execute the research agent
///
/// This command runs the research agent with streaming content output.
/// The frontend should listen for:
/// - `agent-progress-{execution_id}` events for progress updates
/// - `agent-content-{execution_id}` events for content to insert
#[tauri::command]
pub async fn execute_research_agent(
    app_handle: tauri::AppHandle,
    pool: State<'_, AppPool>,
    agent_executions: State<'_, AgentExecutions>,
    execution_id: String,
    topic: String,
    context: Option<String>,
) -> Result<ResearchResult, String> {
    log::info!(
        "[ResearchAgent] Starting: execution_id={}, topic_len={}, has_context={}",
        execution_id,
        topic.len(),
        context.is_some()
    );

    // Get the pool
    let db_pool = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };

    // Get vault path
    let vault_path = vault::get_current_vault_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Get agent config
    let config: AgentConfig = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        match db::settings::get_setting(&conn, "agent_config") {
            Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
            _ => AgentConfig::default(),
        }
    };

    // Check if agents are enabled
    if !config.enabled {
        return Err("Agents are disabled. Enable them in Settings.".to_string());
    }

    // Get the model and provider
    let (model, provider) = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        let ai_config = load_ai_config(&conn).map_err(|e| e)?;
        get_model_and_provider(&ai_config)?
    };
    log::info!(
        "[ResearchAgent] Using model: {} via provider: {}",
        model,
        provider.name
    );

    // Create cancellation token
    let cancellation_token = CancellationToken::new();

    // Store the token
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.insert(execution_id.clone(), cancellation_token.clone());
    }

    // Run the agent
    let result = run_research_agent(
        &app_handle,
        &execution_id,
        &db_pool,
        &provider,
        &model,
        &topic,
        context.as_deref(),
        &vault_path,
        config,
        Some(&cancellation_token),
    )
    .await;

    // Remove the token
    {
        let mut executions = agent_executions.0.write().unwrap();
        executions.remove(&execution_id);
    }

    match &result {
        Ok(r) => log::info!(
            "[ResearchAgent] Success! Chunks: {}, Notes searched: {}",
            r.chunks_appended,
            r.notes_searched
        ),
        Err(e) => log::error!("[ResearchAgent] Error: {}", e),
    }

    result.map_err(|e| e.to_string())
}

/// Extract text from an attachment file
///
/// This command extracts text content from various document formats.
#[tauri::command]
pub fn extract_attachment_text(
    path: String,
    max_chars: Option<usize>,
) -> Result<String, String> {
    // Get vault path for resolving relative paths
    let vault_path = vault::get_current_vault_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Resolve path
    let full_path = if path.starts_with('/') || path.contains(':') {
        path
    } else {
        format!("{}/{}", vault_path.trim_end_matches('/'), path.trim_start_matches('/'))
    };

    extract_text_from_attachment(&full_path, max_chars)
}

/// Get available tools and their status
#[tauri::command]
pub fn get_available_tools(pool: State<AppPool>) -> Result<Vec<ToolInfo>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Get agent config
    let config: AgentConfig = match db::settings::get_setting(&conn, "agent_config") {
        Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
        _ => AgentConfig::default(),
    };

    // Build tool info list
    let tools = vec![
        ToolInfo {
            name: "search_notes".to_string(),
            description: "Search your notes for relevant information".to_string(),
            enabled: config.is_tool_enabled("search_notes"),
            configured: true, // Always configured
            requires_api_key: false,
        },
        ToolInfo {
            name: "web_search".to_string(),
            description: "Search the web for current information".to_string(),
            enabled: config.is_tool_enabled("web_search"),
            configured: config.web_search.is_configured(),
            requires_api_key: true,
        },
        ToolInfo {
            name: "fetch_image".to_string(),
            description: "Find images from Unsplash".to_string(),
            enabled: config.is_tool_enabled("fetch_image"),
            configured: config.image.is_configured(),
            requires_api_key: true,
        },
        ToolInfo {
            name: "generate_image".to_string(),
            description: "Generate images using AI".to_string(),
            enabled: config.is_tool_enabled("generate_image"),
            configured: config.image.allow_generation,
            requires_api_key: false, // Uses configured AI provider
        },
        ToolInfo {
            name: "create_mermaid".to_string(),
            description: "Create Mermaid diagrams".to_string(),
            enabled: config.is_tool_enabled("create_mermaid"),
            configured: true,
            requires_api_key: false,
        },
        ToolInfo {
            name: "create_excalidraw".to_string(),
            description: "Create Excalidraw sketches".to_string(),
            enabled: config.is_tool_enabled("create_excalidraw"),
            configured: true,
            requires_api_key: false,
        },
        ToolInfo {
            name: "write_content".to_string(),
            description: "Output markdown content".to_string(),
            enabled: true, // Always enabled
            configured: true,
            requires_api_key: false,
        },
    ];

    Ok(tools)
}

/// Information about an agent tool
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub configured: bool,
    pub requires_api_key: bool,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the chat model from AI config
#[allow(dead_code)]
fn get_chat_model(config: &crate::ai::AIConfig) -> Result<String, String> {
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = config.default_provider {
        config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider.ok_or_else(|| {
        "No AI provider configured. Please set up a provider in Settings.".to_string()
    })?;

    log::info!("[Agent] Selected provider: {} (type: {:?})", provider.name, provider.provider_type);

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    log::info!("[Agent] Model: {}", model);

    // Use the model name directly - cloud provider APIs expect just the model name
    // without any prefix. Local providers use OpenAI-compatible clients and also
    // don't need prefixes since routing is handled by provider_type.
    Ok(model)
}

/// Get the chat model and provider from AI config
fn get_model_and_provider(config: &crate::ai::AIConfig) -> Result<(String, crate::ai::AIProvider), String> {
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = config.default_provider {
        config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider.ok_or_else(|| {
        "No AI provider configured. Please set up a provider in Settings.".to_string()
    })?.clone();

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    // Use the model name directly as it comes from the provider
    Ok((model, provider))
}
