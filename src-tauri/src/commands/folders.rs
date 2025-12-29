use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::db::connection::DbPool;
use crate::db::folders as db;
use crate::db::notes as notes_db;
use crate::models::{CreateFolderInput, Folder, UpdateFolderInput};
use crate::vault::config as vault_config;
use crate::vault::sync as vault_sync;
use crate::AppPool;

/// Get the filesystem path for a folder by ID
fn get_folder_path_by_id(conn: &rusqlite::Connection, folder_id: &str) -> Result<PathBuf, String> {
    let folder = db::get_folder(conn, folder_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    get_folder_path(conn, &folder)
}

/// Get the filesystem path for a folder
fn get_folder_path(conn: &rusqlite::Connection, folder: &Folder) -> Result<PathBuf, String> {
    let notes_dir = vault_config::get_notes_dir().map_err(|e| e.to_string())?;
    
    // Build folder path by traversing parent hierarchy
    let mut path_parts: Vec<String> = vec![folder.name.clone()];
    let mut current_parent = folder.parent_id.clone();
    
    while let Some(parent_id) = current_parent {
        if let Some(parent) = db::get_folder(conn, &parent_id).map_err(|e| e.to_string())? {
            path_parts.push(parent.name.clone());
            current_parent = parent.parent_id;
        } else {
            break;
        }
    }
    
    // Reverse to get root-to-leaf order
    path_parts.reverse();
    
    let mut folder_path = notes_dir;
    for part in path_parts {
        folder_path = folder_path.join(part);
    }
    
    Ok(folder_path)
}

/// Create a folder on the filesystem
fn create_folder_on_disk(conn: &rusqlite::Connection, folder: &Folder) -> Result<(), String> {
    let folder_path = get_folder_path(conn, folder)?;
    fs::create_dir_all(&folder_path).map_err(|e| format!("Failed to create folder on disk: {}", e))?;
    log::info!("Created folder on disk: {:?}", folder_path);
    Ok(())
}

/// Create a folder on the filesystem (public helper for other modules)
pub fn create_folder_on_disk_from_pool(pool: &DbPool, folder: &Folder) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    create_folder_on_disk(&conn, folder)
}

/// Rename a folder on the filesystem
fn rename_folder_on_disk(old_path: &PathBuf, new_path: &PathBuf) -> Result<(), String> {
    if old_path.exists() {
        // Ensure parent directory exists
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
        }
        fs::rename(old_path, new_path).map_err(|e| format!("Failed to rename folder on disk: {}", e))?;
        log::info!("Renamed folder on disk: {:?} -> {:?}", old_path, new_path);
    }
    Ok(())
}

/// Delete a folder from the filesystem (including all contents)
fn delete_folder_from_disk(folder_path: &PathBuf) -> Result<(), String> {
    if folder_path.exists() {
        fs::remove_dir_all(folder_path).map_err(|e| format!("Failed to delete folder from disk: {}", e))?;
        log::info!("Deleted folder from disk: {:?}", folder_path);
    }
    Ok(())
}

/// Get all descendant folder IDs (for recursive operations)
fn get_descendant_folder_ids(conn: &rusqlite::Connection, folder_id: &str) -> Result<Vec<String>, String> {
    let mut descendants = Vec::new();
    let mut to_process = vec![folder_id.to_string()];
    
    while let Some(current_id) = to_process.pop() {
        let children = db::get_child_folders(conn, Some(&current_id)).map_err(|e| e.to_string())?;
        for child in children {
            descendants.push(child.id.clone());
            to_process.push(child.id);
        }
    }
    
    Ok(descendants)
}

/// Create a new folder
#[tauri::command]
pub fn create_folder(
    pool: State<AppPool>,
    name: String,
    parent_id: Option<String>,
) -> Result<Folder, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = CreateFolderInput { name, parent_id };

    let folder = db::create_folder(&conn, input).map_err(|e| e.to_string())?;
    
    // Create the folder on the filesystem
    if let Err(e) = create_folder_on_disk(&conn, &folder) {
        log::warn!("Failed to sync folder to disk: {}", e);
    }
    
    Ok(folder)
}

/// Get a folder by ID
#[tauri::command]
pub fn get_folder(pool: State<AppPool>, id: String) -> Result<Option<Folder>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_folder(&conn, &id).map_err(|e| e.to_string())
}

/// Get all folders
#[tauri::command]
pub fn get_all_folders(pool: State<AppPool>) -> Result<Vec<Folder>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_all_folders(&conn).map_err(|e| e.to_string())
}

/// Get child folders of a parent (or root folders if parent_id is null)
#[tauri::command]
pub fn get_child_folders(
    pool: State<AppPool>,
    parent_id: Option<String>,
) -> Result<Vec<Folder>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_child_folders(&conn, parent_id.as_deref()).map_err(|e| e.to_string())
}

/// Update an existing folder
#[tauri::command]
pub fn update_folder(
    pool: State<AppPool>,
    id: String,
    name: Option<String>,
    parent_id: Option<String>,
) -> Result<Folder, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    // Get the old folder path before updating
    let old_path = get_folder_path_by_id(&conn, &id)?;
    
    // Check if we're actually changing the name or parent
    let old_folder = db::get_folder(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Folder not found: {}", id))?;
    
    let is_name_changing = name.as_ref().is_some_and(|n| n != &old_folder.name);
    let is_parent_changing = parent_id != old_folder.parent_id;
    
    let input = UpdateFolderInput { name, parent_id };
    let updated_folder = db::update_folder(&conn, &id, input).map_err(|e| e.to_string())?;

    // If name or parent changed, rename/move the folder on disk
    if is_name_changing || is_parent_changing {
        let new_path = get_folder_path(&conn, &updated_folder)?;
        
        if old_path != new_path {
            if let Err(e) = rename_folder_on_disk(&old_path, &new_path) {
                log::warn!("Failed to rename folder on disk: {}", e);
            }
        }
    }

    Ok(updated_folder)
}

/// Delete a folder and all its contents
#[tauri::command]
pub fn delete_folder(pool: State<AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;
    
    // Get the folder path before deleting from DB
    let folder_path = match get_folder_path_by_id(&conn, &id) {
        Ok(path) => Some(path),
        Err(e) => {
            log::warn!("Could not get folder path: {}", e);
            None
        }
    };
    
    // Get all notes in this folder and descendant folders to delete their files
    let mut all_folder_ids = vec![id.clone()];
    all_folder_ids.extend(get_descendant_folder_ids(&conn, &id)?);
    
    // Delete note files from disk for all notes in affected folders
    for folder_id in &all_folder_ids {
        let notes = notes_db::get_notes_in_folder(&conn, Some(folder_id)).map_err(|e| e.to_string())?;
        for note in notes {
            if let Err(e) = vault_sync::delete_note_file(pool_ref, &note.id) {
                log::warn!("Failed to delete note file for {}: {}", note.id, e);
            }
        }
    }
    
    // Delete from database (this should cascade to notes)
    let result = db::delete_folder(&conn, &id).map_err(|e| e.to_string())?;
    
    // Delete the folder from disk (this removes the entire directory tree)
    if let Some(path) = folder_path {
        if let Err(e) = delete_folder_from_disk(&path) {
            log::warn!("Failed to delete folder from disk: {}", e);
        }
    }
    
    Ok(result)
}
