//! Tauri commands for tag operations and the tagging agent

use tauri::State;

use crate::ai::{load_ai_config, run_tagging_agent, TaggingResult};
use crate::db::{self};
use crate::models::Tag;
use crate::AppPool;

// ============================================================================
// Tag CRUD Operations
// ============================================================================

/// Get all tags
#[tauri::command]
pub fn get_all_tags(pool: State<AppPool>) -> Result<Vec<Tag>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_all_tags(&conn).map_err(|e| e.to_string())
}

/// Search tags by name
#[tauri::command]
pub fn search_tags(pool: State<AppPool>, query: String) -> Result<Vec<Tag>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::search_tags(&conn, &query).map_err(|e| e.to_string())
}

/// Get tags for a specific note
#[tauri::command]
pub fn get_note_tags(pool: State<AppPool>, note_id: String) -> Result<Vec<Tag>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_note_tags(&conn, &note_id).map_err(|e| e.to_string())
}

/// Create a new tag
#[tauri::command]
pub fn create_tag(
    pool: State<AppPool>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::create_tag(&conn, &name, color.as_deref()).map_err(|e| e.to_string())
}

/// Add a tag to a note (creates the tag if it doesn't exist)
#[tauri::command]
pub fn add_tag_to_note(
    pool: State<AppPool>,
    note_id: String,
    tag_name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Find or create the tag
    let tag = db::find_or_create_tag(&conn, &tag_name, color.as_deref())
        .map_err(|e| e.to_string())?;
    
    // Add to note
    db::add_tag_to_note(&conn, &note_id, &tag.id).map_err(|e| e.to_string())?;
    
    Ok(tag)
}

/// Remove a tag from a note
#[tauri::command]
pub fn remove_tag_from_note(
    pool: State<AppPool>,
    note_id: String,
    tag_id: String,
) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::remove_tag_from_note(&conn, &note_id, &tag_id).map_err(|e| e.to_string())
}

/// Delete a tag entirely
#[tauri::command]
pub fn delete_tag(pool: State<AppPool>, tag_id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::delete_tag(&conn, &tag_id).map_err(|e| e.to_string())
}

/// Update a tag
#[tauri::command]
pub fn update_tag(
    pool: State<AppPool>,
    tag_id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<Tag, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::update_tag(&conn, &tag_id, name.as_deref(), color.as_deref()).map_err(|e| e.to_string())
}

// ============================================================================
// Tagging Agent
// ============================================================================

/// Run the tagging agent on a note
///
/// This command triggers the AI tagging agent to analyze the note content
/// and automatically assign appropriate tags.
#[tauri::command]
pub async fn run_tagging_agent_cmd(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<TaggingResult, String> {
    log::info!("[TaggingAgent] Starting tagging agent for note: {}", note_id);
    
    // Get the pool from the wrapper
    let db_pool = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or_else(|| {
            log::error!("[TaggingAgent] Database not initialized");
            "Database not initialized".to_string()
        })?
    };
    
    // Get the note content
    let (title, content) = {
        let conn = db_pool.get().map_err(|e| {
            log::error!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let note = db::notes::get_note(&conn, &note_id)
            .map_err(|e| {
                log::error!("[TaggingAgent] Failed to get note: {}", e);
                e.to_string()
            })?
            .ok_or_else(|| {
                log::error!("[TaggingAgent] Note not found: {}", note_id);
                format!("Note not found: {}", note_id)
            })?;
        
        log::info!("[TaggingAgent] Got note: '{}' (content len: {})", note.title, note.content.as_ref().map(|c| c.len()).unwrap_or(0));
        (note.title, note.content.unwrap_or_default())
    };
    
    // Skip if content is too short
    if content.len() < 10 && title.len() < 5 {
        log::warn!("[TaggingAgent] Note content too short, skipping");
        return Err("Note content is too short to analyze".to_string());
    }
    
    // Get the model and provider to use
    let (model, provider) = {
        let conn = db_pool.get().map_err(|e| {
            log::error!("[TaggingAgent] Failed to get DB connection for config: {}", e);
            e.to_string()
        })?;
        let config = load_ai_config(&conn).map_err(|e| {
            log::error!("[TaggingAgent] Failed to load AI config: {}", e);
            e.to_string()
        })?;
        log::info!("[TaggingAgent] Loaded AI config, default provider: {:?}", config.default_provider);
        get_tagging_model_and_provider(&config)?
    };
    
    log::info!("[TaggingAgent] Using model: {} via provider: {}", model, provider.name);
    
    // Run the tagging agent
    let result = run_tagging_agent(&db_pool, &provider, &model, &note_id, &title, &content)
        .await
        .map_err(|e| {
            log::error!("[TaggingAgent] Agent failed: {:?}", e);
            e.to_string()
        })?;
    
    log::info!("[TaggingAgent] Completed successfully. Tags: {:?}, Iterations: {}", 
        result.tags.iter().map(|t| &t.name).collect::<Vec<_>>(),
        result.iterations
    );
    
    Ok(result)
}

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

    log::info!("[TaggingAgent] Selected provider: {} (type: {:?})", provider.name, provider.provider_type);

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    log::info!("[TaggingAgent] Model: {}", model);

    // Use the model name directly - cloud provider APIs expect just the model name
    // without any prefix. Local providers use OpenAI-compatible clients and also
    // don't need prefixes since routing is handled by provider_type.
    Ok(model)
}

/// Get the chat model and provider from AI config
fn get_tagging_model_and_provider(config: &crate::ai::AIConfig) -> Result<(String, crate::ai::AIProvider), String> {
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
