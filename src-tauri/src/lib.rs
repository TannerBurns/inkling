mod ai;
mod commands;
mod db;
mod exports;
mod google;
mod models;
mod search;
mod sidecar;
mod vault;

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::sync::watch;

use ai::init_ai_config;
use db::connection::{self, DbPool};
use search::SearchIndex;

/// Wrapper for optional pool that can be initialized after vault setup
pub struct AppPool(pub RwLock<Option<DbPool>>);

/// Wrapper for optional search index
pub struct AppSearchIndex(pub RwLock<Option<Arc<SearchIndex>>>);

/// Active stream cancellation tokens, keyed by session ID
/// Used to stop generation when user requests it
pub struct ActiveStreams(pub RwLock<HashMap<String, watch::Sender<bool>>>);

// Re-export AgentExecutions for use in commands
pub use commands::agents::AgentExecutions;

/// Initialize the database and search index for a vault
fn initialize_for_vault() -> Result<(DbPool, Arc<SearchIndex>), String> {
    // Initialize the database connection pool
    let pool = connection::init_pool().map_err(|e| format!("Failed to initialize database: {}", e))?;

    // Initialize the search index
    let search_index_path = connection::get_search_index_path()
        .map_err(|e| format!("Failed to get search index path: {}", e))?;
    let search_index = Arc::new(
        SearchIndex::new(search_index_path).map_err(|e| format!("Failed to initialize search index: {}", e))?
    );

    // Rebuild index if empty (first run or index was deleted)
    if search_index.is_empty() {
        if let Ok(conn) = pool.get() {
            if let Ok(notes) = db::notes::get_all_notes(&conn) {
                let note_data: Vec<(String, String, Option<String>)> = notes
                    .into_iter()
                    .filter(|n| !n.is_deleted)
                    .map(|n| (n.id, n.title, n.content))
                    .collect();
                
                if !note_data.is_empty() {
                    let _ = search_index.rebuild(note_data);
                }
            }
        }
    }

    Ok((pool, search_index))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger - show info level and above for our crate, warn for others
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("inkling_lib=debug,warn")
    )
    .format_timestamp_secs()
    .init();

    // Try to load vault path from config
    if let Ok(Some(vault_path)) = vault::load_vault_path() {
        log::info!("Loaded vault path: {:?}", vault_path);
        vault::set_current_vault_path(Some(vault_path));
    }

    // Initialize pool and search index (will use vault path if set, otherwise legacy path)
    let (initial_pool, initial_search_index) = match initialize_for_vault() {
        Ok((pool, index)) => (Some(pool), Some(index)),
        Err(e) => {
            log::warn!("Failed to initialize database/search: {}", e);
            (None, None)
        }
    };

    // Wrap in RwLock for potential re-initialization after vault setup
    let app_pool = AppPool(RwLock::new(initial_pool.clone()));
    let app_search_index = AppSearchIndex(RwLock::new(initial_search_index.clone()));
    
    // Active streams for cancellation support
    let active_streams = ActiveStreams(RwLock::new(HashMap::new()));
    
    // Active agent executions for cancellation support
    let agent_executions = AgentExecutions(RwLock::new(HashMap::new()));

    // Initialize AI config from database and environment variables
    if let Some(ref pool) = initial_pool {
        if let Ok(conn) = pool.get() {
            match init_ai_config(&conn) {
                Ok(config) => {
                    log::info!("AI config initialized with {} providers", config.providers.len());
                }
                Err(e) => {
                    log::warn!("Failed to initialize AI config: {}", e);
                }
            }
            
            // Initialize Google credentials from environment variables
            // This persists env vars to database so they work when app is launched from Finder
            if google::oauth::init_google_credentials_from_env(&conn) {
                log::info!("Google credentials initialized from environment variables");
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_pool)
        .manage(app_search_index)
        .manage(active_streams)
        .manage(agent_executions)
        .invoke_handler(tauri::generate_handler![
            // Note commands
            commands::create_note,
            commands::get_note,
            commands::get_all_notes,
            commands::get_notes_in_folder,
            commands::update_note,
            commands::move_note_to_folder,
            commands::delete_note,
            commands::search_notes,
            // Folder commands
            commands::create_folder,
            commands::get_folder,
            commands::get_all_folders,
            commands::get_child_folders,
            commands::update_folder,
            commands::delete_folder,
            // Board commands
            commands::create_board,
            commands::get_board,
            commands::get_board_by_folder,
            commands::get_all_boards,
            commands::get_board_with_details,
            commands::update_board,
            commands::delete_board,
            // Board lane commands
            commands::create_lane,
            commands::get_lanes_for_board,
            commands::update_lane,
            commands::delete_lane,
            commands::reorder_lanes,
            // Board card commands
            commands::add_card,
            commands::get_cards_for_board,
            commands::get_cards_in_lane,
            commands::move_card,
            commands::remove_card,
            commands::get_boards_for_note,
            // AI commands
            commands::get_ai_config,
            commands::save_ai_config_cmd,
            commands::update_provider,
            commands::set_default_provider,
            commands::apply_ai_config,
            commands::init_ai_config_cmd,
            commands::test_provider,
            commands::detect_local_models,
            commands::detect_ollama,
            commands::detect_lmstudio_cmd,
            commands::get_default_providers,
            commands::get_provider_info,
            // Search commands
            commands::search_notes_unified,
            commands::get_related_notes,
            commands::get_embedding_stats,
            commands::get_embedding_models,
            commands::detect_embedding_dimension,
            commands::reindex_embeddings,
            commands::embed_note,
            commands::force_embed_note,
            commands::embed_notes_batch,
            // Link commands
            commands::get_backlinks,
            commands::get_link_stats,
            commands::sync_note_links,
            commands::search_notes_for_mention,
            commands::get_outgoing_links,
            // Chat commands
            commands::create_conversation,
            commands::get_conversation,
            commands::get_conversation_with_messages,
            commands::list_conversations,
            commands::list_conversation_previews,
            commands::update_conversation,
            commands::delete_conversation,
            commands::get_conversation_messages,
            commands::send_chat_message,
            commands::send_chat_message_sync,
            commands::edit_message_and_regenerate,
            commands::get_default_system_prompt,
            commands::stop_generation,
            // Vault commands
            commands::get_vault_path,
            commands::get_vault_status,
            commands::set_vault_path,
            commands::create_vault,
            commands::validate_vault,
            commands::has_existing_data,
            commands::migrate_to_vault,
            commands::save_attachment,
            // Data management commands
            commands::clear_chats,
            commands::clear_notes,
            commands::clear_ai_config,
            commands::factory_reset,
            commands::sync_vault_to_disk,
            commands::sync_disk_to_vault,
            // Tag commands
            commands::get_all_tags,
            commands::search_tags,
            commands::get_note_tags,
            commands::create_tag,
            commands::add_tag_to_note,
            commands::remove_tag_from_note,
            commands::delete_tag,
            commands::update_tag,
            commands::run_tagging_agent_cmd,
            // Daily Notes commands
            commands::get_or_create_daily_notes_folder,
            commands::get_daily_note,
            commands::create_daily_note,
            commands::get_adjacent_daily_note,
            commands::get_all_daily_notes,
            commands::is_daily_note,
            // Agent commands
            commands::get_agent_config,
            commands::save_agent_config,
            commands::execute_inline_agent,
            commands::cancel_agent_execution,
            commands::get_available_tools,
            commands::execute_summarization_agent,
            commands::execute_research_agent,
            commands::extract_attachment_text,
            // Graph commands
            commands::get_graph_data,
            // Calendar commands
            commands::create_calendar_event,
            commands::get_calendar_event,
            commands::get_calendar_event_with_note,
            commands::get_all_calendar_events,
            commands::get_calendar_events_in_range,
            commands::get_calendar_events_for_date,
            commands::update_calendar_event,
            commands::delete_calendar_event,
            commands::link_note_to_calendar_event,
            commands::unlink_note_from_calendar_event,
            // Google integration commands
            commands::is_google_configured,
            commands::initiate_google_auth,
            commands::get_google_connection_status,
            commands::disconnect_google_account,
            commands::sync_google_calendar,
            commands::get_event_meeting_info,
            commands::save_google_credentials,
            commands::clear_google_credentials,
            commands::get_google_credential_source,
            commands::get_current_google_credentials,
            // Export commands
            commands::list_exports,
            commands::list_exports_by_format,
            commands::get_export,
            commands::delete_export,
            commands::open_export,
            commands::get_exports_path,
            commands::reveal_exports_folder,
            commands::export_note_to_pdf,
            commands::export_note_to_docx,
            commands::export_notes_to_pdf,
            commands::export_notes_to_docx,
            commands::export_content_to_xlsx,
            commands::export_notes_to_pptx,
            commands::run_export_agent_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
