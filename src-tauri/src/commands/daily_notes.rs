#![allow(dead_code)]

use tauri::State;

use crate::db::folders as folders_db;
use crate::db::notes as notes_db;
use crate::models::{CreateFolderInput, CreateNoteInput, Folder, Note};
use crate::vault::sync as vault_sync;
use crate::{AppPool, AppSearchIndex};

/// The name of the system Daily Notes folder
pub const DAILY_NOTES_FOLDER_NAME: &str = "Daily Notes";

/// Date format used for daily note titles
pub const DAILY_NOTE_DATE_FORMAT: &str = "%Y-%m-%d";

/// Get the Daily Notes folder, creating it if it doesn't exist
#[tauri::command]
pub fn get_or_create_daily_notes_folder(pool: State<AppPool>) -> Result<Folder, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Check if the Daily Notes folder already exists
    let all_folders = folders_db::get_all_folders(&conn).map_err(|e| e.to_string())?;
    
    if let Some(folder) = all_folders.iter().find(|f| f.name == DAILY_NOTES_FOLDER_NAME && f.parent_id.is_none()) {
        return Ok(folder.clone());
    }

    // Create the Daily Notes folder
    let input = CreateFolderInput {
        name: DAILY_NOTES_FOLDER_NAME.to_string(),
        parent_id: None,
    };
    let folder = folders_db::create_folder(&conn, input).map_err(|e| e.to_string())?;
    
    // Create the folder on disk
    if let Err(e) = crate::commands::folders::create_folder_on_disk_from_pool(pool_ref, &folder) {
        log::warn!("Failed to create Daily Notes folder on disk: {}", e);
    }
    
    Ok(folder)
}

/// Get the Daily Notes folder ID (creates if doesn't exist)
fn get_daily_notes_folder_id(conn: &rusqlite::Connection) -> Result<String, String> {
    let all_folders = folders_db::get_all_folders(conn).map_err(|e| e.to_string())?;
    
    if let Some(folder) = all_folders.iter().find(|f| f.name == DAILY_NOTES_FOLDER_NAME && f.parent_id.is_none()) {
        return Ok(folder.id.clone());
    }

    // Create the Daily Notes folder
    let input = CreateFolderInput {
        name: DAILY_NOTES_FOLDER_NAME.to_string(),
        parent_id: None,
    };
    let folder = folders_db::create_folder(conn, input).map_err(|e| e.to_string())?;
    Ok(folder.id)
}

/// Get a daily note for a specific date (YYYY-MM-DD format)
#[tauri::command]
pub fn get_daily_note(pool: State<AppPool>, date: String) -> Result<Option<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the Daily Notes folder ID
    let folder_id = get_daily_notes_folder_id(&conn)?;
    
    // Find a note with this date as the title in the Daily Notes folder
    let notes = notes_db::get_notes_in_folder(&conn, Some(&folder_id)).map_err(|e| e.to_string())?;
    
    let daily_note = notes.into_iter().find(|n| n.title == date);
    Ok(daily_note)
}

/// Create a daily note for a specific date with initial content
#[tauri::command]
pub fn create_daily_note(
    pool: State<AppPool>,
    search_index: State<AppSearchIndex>,
    date: String,
    content: Option<String>,
    content_html: Option<String>,
) -> Result<Note, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get or create the Daily Notes folder
    let folder_id = get_daily_notes_folder_id(&conn)?;
    
    // Check if a note for this date already exists
    let existing_notes = notes_db::get_notes_in_folder(&conn, Some(&folder_id)).map_err(|e| e.to_string())?;
    if let Some(existing) = existing_notes.into_iter().find(|n| n.title == date) {
        return Ok(existing);
    }
    
    // Create the daily note
    let input = CreateNoteInput {
        title: date.clone(),
        content: content.clone(),
        content_html,
        folder_id: Some(folder_id),
    };
    
    let note = notes_db::create_note(&conn, input).map_err(|e| e.to_string())?;

    // Add to search index
    let search_guard = search_index.0.read().unwrap();
    if let Some(ref index) = *search_guard {
        if let Err(e) = index.add_note(&note.id, &note.title, note.content.as_deref()) {
            log::warn!("Failed to add daily note to search index: {}", e);
        }
    }
    
    // Sync to filesystem
    if let Err(e) = vault_sync::sync_note_to_file(pool_ref, &note.id) {
        log::warn!("Failed to sync daily note to filesystem: {}", e);
    }

    Ok(note)
}

/// Get the adjacent daily note (previous or next)
/// Returns the note if found, None if no adjacent note exists
#[tauri::command]
pub fn get_adjacent_daily_note(
    pool: State<AppPool>,
    date: String,
    direction: String,
) -> Result<Option<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the Daily Notes folder ID
    let folder_id = get_daily_notes_folder_id(&conn)?;
    
    // Get all notes in the Daily Notes folder
    let mut notes = notes_db::get_notes_in_folder(&conn, Some(&folder_id)).map_err(|e| e.to_string())?;
    
    // Filter to only valid date-formatted titles and sort
    notes.retain(|n| is_valid_date_format(&n.title));
    
    match direction.as_str() {
        "prev" => {
            // Sort descending and find the first note with a date before the current date
            notes.sort_by(|a, b| b.title.cmp(&a.title));
            Ok(notes.into_iter().find(|n| n.title < date))
        }
        "next" => {
            // Sort ascending and find the first note with a date after the current date
            notes.sort_by(|a, b| a.title.cmp(&b.title));
            Ok(notes.into_iter().find(|n| n.title > date))
        }
        _ => Err(format!("Invalid direction: {}. Use 'prev' or 'next'", direction)),
    }
}

/// Get all daily notes sorted by date (newest first)
#[tauri::command]
pub fn get_all_daily_notes(pool: State<AppPool>) -> Result<Vec<Note>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the Daily Notes folder ID
    let folder_id = get_daily_notes_folder_id(&conn)?;
    
    // Get all notes in the Daily Notes folder
    let mut notes = notes_db::get_notes_in_folder(&conn, Some(&folder_id)).map_err(|e| e.to_string())?;
    
    // Filter to only valid date-formatted titles and sort by date descending
    notes.retain(|n| is_valid_date_format(&n.title));
    notes.sort_by(|a, b| b.title.cmp(&a.title));
    
    Ok(notes)
}

/// Check if a note is a daily note (belongs to the Daily Notes folder)
#[tauri::command]
pub fn is_daily_note(pool: State<AppPool>, note_id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the note
    let note = notes_db::get_note(&conn, &note_id).map_err(|e| e.to_string())?;
    let note = match note {
        Some(n) => n,
        None => return Ok(false),
    };
    
    // Check if it belongs to the Daily Notes folder
    let folder_id = match note.folder_id {
        Some(id) => id,
        None => return Ok(false),
    };
    
    let folder = folders_db::get_folder(&conn, &folder_id).map_err(|e| e.to_string())?;
    let folder = match folder {
        Some(f) => f,
        None => return Ok(false),
    };
    
    Ok(folder.name == DAILY_NOTES_FOLDER_NAME && folder.parent_id.is_none())
}

/// Check if a string is a valid YYYY-MM-DD date format
fn is_valid_date_format(s: &str) -> bool {
    if s.len() != 10 {
        return false;
    }
    
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 3 {
        return false;
    }
    
    // Check year (4 digits)
    if parts[0].len() != 4 || !parts[0].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    
    // Check month (2 digits, 01-12)
    if parts[1].len() != 2 || !parts[1].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if let Ok(month) = parts[1].parse::<u32>() {
        if !(1..=12).contains(&month) {
            return false;
        }
    } else {
        return false;
    }
    
    // Check day (2 digits, 01-31)
    if parts[2].len() != 2 || !parts[2].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if let Ok(day) = parts[2].parse::<u32>() {
        if !(1..=31).contains(&day) {
            return false;
        }
    } else {
        return false;
    }
    
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_date_format() {
        assert!(is_valid_date_format("2025-12-20"));
        assert!(is_valid_date_format("2025-01-01"));
        assert!(is_valid_date_format("2025-12-31"));
        
        assert!(!is_valid_date_format("2025-13-01")); // Invalid month
        assert!(!is_valid_date_format("2025-00-01")); // Invalid month
        assert!(!is_valid_date_format("2025-12-32")); // Invalid day
        assert!(!is_valid_date_format("2025-12-00")); // Invalid day
        assert!(!is_valid_date_format("25-12-20")); // Short year
        assert!(!is_valid_date_format("2025/12/20")); // Wrong separator
        assert!(!is_valid_date_format("December 20, 2025")); // Wrong format
        assert!(!is_valid_date_format("")); // Empty
    }
}

