use std::sync::Arc;

use tauri::State;

use crate::db::notes as db;
use crate::models::{CreateNoteInput, Note, UpdateNoteInput};
use crate::search::SearchIndex;
use crate::vault::sync as vault_sync;
use crate::{AppPool, AppSearchIndex};

/// Create a new note
#[tauri::command]
pub fn create_note(
    pool: State<AppPool>,
    search_index: State<AppSearchIndex>,
    title: String,
    content: Option<String>,
    content_html: Option<String>,
    folder_id: Option<String>,
) -> Result<Note, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    let input = CreateNoteInput {
        title: title.clone(),
        content: content.clone(),
        content_html,
        folder_id,
    };

    let note = db::create_note(&conn, input).map_err(|e| e.to_string())?;

    // Add to search index
    let search_guard = search_index.0.read().unwrap();
    if let Some(ref index) = *search_guard {
        if let Err(e) = index.add_note(&note.id, &note.title, note.content.as_deref()) {
            eprintln!("Warning: Failed to add note to search index: {}", e);
        }
    }
    
    // Sync to filesystem
    if let Err(e) = vault_sync::sync_note_to_file(pool_ref, &note.id) {
        log::warn!("Failed to sync note to filesystem: {}", e);
    }

    Ok(note)
}

/// Get a note by ID
#[tauri::command]
pub fn get_note(pool: State<AppPool>, id: String) -> Result<Option<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_note(&conn, &id).map_err(|e| e.to_string())
}

/// Get all non-deleted notes
#[tauri::command]
pub fn get_all_notes(pool: State<AppPool>) -> Result<Vec<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_all_notes(&conn).map_err(|e| e.to_string())
}

/// Get all notes in a specific folder (or root notes if folder_id is null)
#[tauri::command]
pub fn get_notes_in_folder(
    pool: State<AppPool>,
    folder_id: Option<String>,
) -> Result<Vec<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_notes_in_folder(&conn, folder_id.as_deref()).map_err(|e| e.to_string())
}

/// Update an existing note
#[tauri::command]
pub fn update_note(
    pool: State<AppPool>,
    search_index: State<AppSearchIndex>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    content_html: Option<String>,
    folder_id: Option<String>,
) -> Result<Note, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the old note to check for title/folder changes
    let old_note = db::get_note(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note not found: {}", id))?;
    
    let old_title = old_note.title.clone();
    let old_folder_id = old_note.folder_id.clone();
    
    let is_title_changing = title.as_ref().map_or(false, |t| t != &old_title);
    let is_folder_changing = folder_id != old_folder_id;

    let input = UpdateNoteInput {
        title,
        content,
        content_html,
        folder_id,
    };

    let note = db::update_note(&conn, &id, input).map_err(|e| e.to_string())?;

    // Update search index
    let search_guard = search_index.0.read().unwrap();
    if let Some(ref index) = *search_guard {
        if let Err(e) = index.update_note(&note.id, &note.title, note.content.as_deref()) {
            eprintln!("Warning: Failed to update note in search index: {}", e);
        }
    }
    
    // Handle filesystem sync
    if is_title_changing || is_folder_changing {
        // Title or folder changed - delete old file first, then sync new one
        // We need to manually construct the old path since the note in DB is already updated
        if let Err(e) = delete_old_note_file(pool_ref, &old_title, old_folder_id.as_deref()) {
            log::warn!("Failed to delete old note file: {}", e);
        }
    }
    
    // Sync to filesystem (creates the new file)
    if let Err(e) = vault_sync::sync_note_to_file(pool_ref, &note.id) {
        log::warn!("Failed to sync note to filesystem: {}", e);
    }

    Ok(note)
}

/// Helper to delete the old note file when title/folder changes
fn delete_old_note_file(
    pool: &crate::db::connection::DbPool,
    old_title: &str,
    old_folder_id: Option<&str>,
) -> Result<(), String> {
    use crate::db::folders;
    use crate::vault::{config as vault_config, markdown};
    
    let notes_dir = vault_config::get_notes_dir().map_err(|e| e.to_string())?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Build the old folder path
    let old_folder_path = if let Some(folder_id) = old_folder_id {
        Some(build_folder_path_for_note(&conn, folder_id)?)
    } else {
        None
    };
    
    let old_file_path = markdown::get_note_path(&notes_dir, old_title, old_folder_path.as_deref());
    
    if old_file_path.exists() {
        std::fs::remove_file(&old_file_path).map_err(|e| e.to_string())?;
        log::info!("Deleted old note file: {:?}", old_file_path);
    }
    
    Ok(())
}

/// Build the full folder path for a note by traversing parent hierarchy
fn build_folder_path_for_note(conn: &rusqlite::Connection, folder_id: &str) -> Result<String, String> {
    use crate::db::folders;
    
    let mut path_parts: Vec<String> = Vec::new();
    let mut current_id = Some(folder_id.to_string());
    
    while let Some(id) = current_id {
        if let Some(folder) = folders::get_folder(conn, &id).map_err(|e| e.to_string())? {
            path_parts.push(folder.name);
            current_id = folder.parent_id;
        } else {
            break;
        }
    }
    
    // Reverse to get root-to-leaf order
    path_parts.reverse();
    
    Ok(path_parts.join("/"))
}

/// Soft delete a note
#[tauri::command]
pub fn delete_note(
    pool: State<AppPool>,
    search_index: State<AppSearchIndex>,
    id: String,
) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;
    
    // Delete the file from filesystem before soft-deleting in DB
    // (we need the note data to find the file path)
    if let Err(e) = vault_sync::delete_note_file(pool_ref, &id) {
        log::warn!("Failed to delete note file: {}", e);
    }
    
    let result = db::delete_note(&conn, &id).map_err(|e| e.to_string())?;

    // Remove from search index
    if result {
        let search_guard = search_index.0.read().unwrap();
        if let Some(ref index) = *search_guard {
            if let Err(e) = index.delete_note(&id) {
                eprintln!("Warning: Failed to delete note from search index: {}", e);
            }
        }
    }

    Ok(result)
}

/// Move a note to a different folder (or to root/unfiled if folder_id is None)
/// This command explicitly handles the case of moving to root (null folder_id)
#[tauri::command]
pub fn move_note_to_folder(
    pool: State<AppPool>,
    note_id: String,
    folder_id: Option<String>,
) -> Result<Note, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the old note to find old folder for file deletion
    let old_note = db::get_note(&conn, &note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note not found: {}", note_id))?;
    
    let old_folder_id = old_note.folder_id.clone();
    let old_title = old_note.title.clone();
    
    // Check if folder is actually changing
    let is_folder_changing = folder_id != old_folder_id;

    // Update the note's folder_id directly in the database
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![folder_id, now, note_id],
    ).map_err(|e| format!("Failed to move note: {}", e))?;
    
    // Get the updated note
    let note = db::get_note(&conn, &note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note not found: {}", note_id))?;

    // Handle filesystem sync
    if is_folder_changing {
        // Delete old file first
        if let Err(e) = delete_old_note_file(pool_ref, &old_title, old_folder_id.as_deref()) {
            log::warn!("Failed to delete old note file: {}", e);
        }
    }
    
    // Sync to filesystem (creates the new file)
    if let Err(e) = vault_sync::sync_note_to_file(pool_ref, &note.id) {
        log::warn!("Failed to sync note to filesystem: {}", e);
    }

    Ok(note)
}

/// Search notes by title or content using Tantivy full-text search
#[tauri::command]
pub fn search_notes(
    pool: State<AppPool>,
    search_index: State<AppSearchIndex>,
    query: String,
) -> Result<Vec<Note>, String> {
    // Search using Tantivy for ranked results
    let search_guard = search_index.0.read().unwrap();
    let index = search_guard.as_ref().ok_or("Search index not initialized")?;
    let search_results = index.search(&query, 100).map_err(|e| e.to_string())?;

    if search_results.is_empty() {
        return Ok(vec![]);
    }

    // Fetch full notes from SQLite in the order of search results
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut notes = Vec::with_capacity(search_results.len());

    for result in search_results {
        if let Ok(Some(note)) = db::get_note(&conn, &result.id) {
            if !note.is_deleted {
                notes.push(note);
            }
        }
    }

    Ok(notes)
}
