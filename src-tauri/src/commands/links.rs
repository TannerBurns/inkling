//! Tauri commands for wiki-style note links

use crate::db;
use crate::AppPool;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Get all notes that link to a specific note (backlinks)
#[tauri::command]
pub async fn get_backlinks(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<Vec<db::Backlink>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    db::links::get_backlinks(&conn, &note_id)
        .map_err(|e| format!("Failed to get backlinks: {}", e))
}

/// Get link statistics for a note
#[tauri::command]
pub async fn get_link_stats(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<db::LinkStats, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    db::links::get_link_stats(&conn, &note_id)
        .map_err(|e| format!("Failed to get link stats: {}", e))
}

/// Sync all outgoing links for a note
/// Called after saving a note to update link tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLinkInput {
    pub target_note_id: String,
    pub context: Option<String>,
}

#[tauri::command]
pub async fn sync_note_links(
    pool: State<'_, AppPool>,
    note_id: String,
    links: Vec<SyncLinkInput>,
) -> Result<(), String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let link_inputs: Vec<db::LinkInput> = links
        .into_iter()
        .map(|l| db::LinkInput {
            target_note_id: l.target_note_id,
            context: l.context,
        })
        .collect();

    db::links::sync_links(&conn, &note_id, &link_inputs)
        .map_err(|e| format!("Failed to sync links: {}", e))
}

/// Search notes by title for autocomplete in wiki-link mentions
#[tauri::command]
pub async fn search_notes_for_mention(
    pool: State<'_, AppPool>,
    query: String,
    exclude_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<db::NoteSummary>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let limit = limit.unwrap_or(10);

    db::links::search_notes_by_title(&conn, &query, exclude_id.as_deref(), limit)
        .map_err(|e| format!("Failed to search notes: {}", e))
}

/// Get outgoing links from a note
#[tauri::command]
pub async fn get_outgoing_links(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<Vec<db::NoteLink>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    db::links::get_outgoing_links(&conn, &note_id)
        .map_err(|e| format!("Failed to get outgoing links: {}", e))
}
