//! Vault management commands

use std::path::PathBuf;

use crate::vault::{self, VaultInfo, VaultStatus};

/// Get the current vault path
#[tauri::command]
pub fn get_vault_path() -> Option<String> {
    vault::get_current_vault_path().map(|p| p.to_string_lossy().to_string())
}

/// Get the full vault status
#[tauri::command]
pub fn get_vault_status() -> VaultStatus {
    vault::get_vault_status()
}

/// Set the vault path and initialize it
#[tauri::command]
pub fn set_vault_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    
    // Validate the path
    if !vault::validate_vault_path(&path) {
        return Err("Invalid vault path".to_string());
    }
    
    // Save to config file
    vault::save_vault_path(&path).map_err(|e| e.to_string())?;
    
    // Set in memory
    vault::set_current_vault_path(Some(path));
    
    Ok(())
}

/// Create a new vault at the specified path
#[tauri::command]
pub fn create_vault(path: String) -> Result<VaultInfo, String> {
    let path = PathBuf::from(&path);
    vault::create_vault(&path).map_err(|e| e.to_string())
}

/// Validate if a path is a valid vault
#[tauri::command]
pub fn validate_vault(path: String) -> Result<Option<VaultInfo>, String> {
    let path = PathBuf::from(&path);
    vault::get_vault_info(&path).map_err(|e| e.to_string())
}

/// Check if there's existing data to migrate
#[tauri::command]
pub fn has_existing_data() -> bool {
    vault::has_existing_data()
}

/// Migrate existing data from the legacy location to the new vault
#[tauri::command]
pub fn migrate_to_vault(vault_path: String) -> Result<(), String> {
    use crate::db;
    use crate::vault::markdown;
    use std::fs;
    
    let vault_path = PathBuf::from(&vault_path);
    
    // Check for legacy database
    let legacy_db = db::connection::get_legacy_db_path()
        .map_err(|e| format!("Failed to get legacy path: {}", e))?;
    
    if !legacy_db.exists() {
        return Ok(()); // Nothing to migrate
    }
    
    // Initialize legacy pool
    let legacy_pool = db::connection::init_legacy_pool()
        .map_err(|e| format!("Failed to open legacy database: {}", e))?;
    
    // Get all notes from legacy database
    let conn = legacy_pool.get().map_err(|e| format!("Database error: {}", e))?;
    let notes = db::notes::get_all_notes(&conn)
        .map_err(|e| format!("Failed to get notes: {}", e))?;
    let folders = db::folders::get_all_folders(&conn)
        .map_err(|e| format!("Failed to get folders: {}", e))?;
    
    // Create folder name mapping
    let folder_map: std::collections::HashMap<String, String> = folders
        .iter()
        .map(|f| (f.id.clone(), f.name.clone()))
        .collect();
    
    // Ensure vault structure exists
    let notes_dir = vault_path.join("notes");
    let inkling_dir = vault_path.join(".inkling");
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes dir: {}", e))?;
    fs::create_dir_all(&inkling_dir).map_err(|e| format!("Failed to create .inkling dir: {}", e))?;
    
    // Create folder directories and export notes
    for folder in &folders {
        let folder_path = notes_dir.join(&folder.name);
        fs::create_dir_all(&folder_path)
            .map_err(|e| format!("Failed to create folder {}: {}", folder.name, e))?;
    }
    
    // Export notes as markdown files
    for note in notes {
        if note.is_deleted {
            continue;
        }
        
        let folder_name = note.folder_id.as_ref()
            .and_then(|id| folder_map.get(id))
            .cloned();
        
        let file_path = markdown::get_note_path(
            &notes_dir,
            &note.title,
            folder_name.as_deref(),
        );
        
        if let Err(e) = markdown::write_note_file(
            &file_path,
            &note.id,
            &note.title,
            note.content.as_deref(),
            note.folder_id.as_deref(),
            folder_name.as_deref(),
            note.created_at,
            note.updated_at,
        ) {
            log::warn!("Failed to export note {}: {}", note.title, e);
        }
    }
    
    // Copy the SQLite database to the new location for metadata
    let new_db_path = inkling_dir.join("inkling.db");
    if !new_db_path.exists() {
        fs::copy(&legacy_db, &new_db_path)
            .map_err(|e| format!("Failed to copy database: {}", e))?;
    }
    
    // Copy search index if it exists
    if let Ok(legacy_index) = db::connection::get_legacy_search_index_path() {
        if legacy_index.exists() {
            let new_index_path = inkling_dir.join("search_index");
            if !new_index_path.exists() {
                copy_dir_recursive(&legacy_index, &new_index_path)
                    .map_err(|e| format!("Failed to copy search index: {}", e))?;
            }
        }
    }
    
    log::info!("Migration completed successfully");
    Ok(())
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), std::io::Error> {
    use std::fs;
    
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        
        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)?;
        }
    }
    
    Ok(())
}

/// Clear all chat conversations
#[tauri::command]
pub fn clear_chats(pool: tauri::State<crate::AppPool>) -> Result<u32, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    
    // Get count of conversations before deletion
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Delete all messages first (due to foreign key constraints)
    conn.execute("DELETE FROM messages", [])
        .map_err(|e| format!("Failed to delete messages: {}", e))?;
    
    // Delete all message contexts
    conn.execute("DELETE FROM message_contexts", [])
        .map_err(|e| format!("Failed to delete message contexts: {}", e))?;
    
    // Delete all conversations
    conn.execute("DELETE FROM conversations", [])
        .map_err(|e| format!("Failed to delete conversations: {}", e))?;
    
    Ok(count)
}

/// Clear all notes
#[tauri::command]
pub fn clear_notes(pool: tauri::State<crate::AppPool>) -> Result<u32, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    
    // Get count of notes before deletion
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM notes WHERE is_deleted = 0", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Delete all note links first
    conn.execute("DELETE FROM note_links", [])
        .map_err(|e| format!("Failed to delete note links: {}", e))?;
    
    // Delete all embeddings
    conn.execute("DELETE FROM embeddings", [])
        .map_err(|e| format!("Failed to delete embeddings: {}", e))?;
    
    // Delete all notes
    conn.execute("DELETE FROM notes", [])
        .map_err(|e| format!("Failed to delete notes: {}", e))?;
    
    // Delete all folders
    conn.execute("DELETE FROM folders", [])
        .map_err(|e| format!("Failed to delete folders: {}", e))?;
    
    Ok(count)
}

/// Clear AI configuration (reset to defaults)
#[tauri::command]
pub fn clear_ai_config(pool: tauri::State<crate::AppPool>) -> Result<(), String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    
    // Delete AI config
    conn.execute("DELETE FROM ai_config", [])
        .map_err(|e| format!("Failed to delete AI config: {}", e))?;
    
    Ok(())
}

/// Factory reset - clear everything and reset vault path
#[tauri::command]
pub fn factory_reset(pool: tauri::State<crate::AppPool>) -> Result<(), String> {
    // Clear everything in the database
    {
        let pool_guard = pool.0.read().unwrap();
        if let Some(pool) = pool_guard.as_ref() {
            if let Ok(conn) = pool.get() {
                // Delete in order respecting foreign keys
                let _ = conn.execute("DELETE FROM message_contexts", []);
                let _ = conn.execute("DELETE FROM messages", []);
                let _ = conn.execute("DELETE FROM conversations", []);
                let _ = conn.execute("DELETE FROM note_links", []);
                let _ = conn.execute("DELETE FROM embeddings", []);
                let _ = conn.execute("DELETE FROM notes", []);
                let _ = conn.execute("DELETE FROM folders", []);
                let _ = conn.execute("DELETE FROM ai_config", []);
            }
        }
    }
    
    // Clear the vault path configuration
    if let Some(config_dir) = directories::ProjectDirs::from("com", "inkling", "Inkling")
        .map(|dirs| dirs.config_dir().to_path_buf())
    {
        let vault_config = config_dir.join("vault.json");
        if vault_config.exists() {
            let _ = std::fs::remove_file(vault_config);
        }
    }
    
    // Clear the in-memory vault path
    vault::set_current_vault_path(None);
    
    Ok(())
}

/// Save an attachment to the vault's attachments folder
#[tauri::command]
pub fn save_attachment(data: Vec<u8>, filename: String) -> Result<String, String> {
    use std::fs;
    use uuid::Uuid;
    
    let attachments_dir = vault::get_attachments_dir().map_err(|e| e.to_string())?;
    
    // Ensure attachments directory exists
    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    
    // Extract extension from filename
    let extension = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    
    // Generate unique filename
    let unique_name = format!("attachment-{}.{}", Uuid::new_v4(), extension);
    let file_path = attachments_dir.join(&unique_name);
    
    // Write the file
    fs::write(&file_path, &data).map_err(|e| e.to_string())?;
    
    // Return relative path for markdown
    Ok(format!("../attachments/{}", unique_name))
}

/// Result of syncing vault to filesystem
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub notes_synced: usize,
    pub folders_synced: usize,
    #[serde(default)]
    pub boards_synced: usize,
}

/// Sync all notes and folders from database to filesystem
#[tauri::command]
pub fn sync_vault_to_disk(pool: tauri::State<crate::AppPool>) -> Result<SyncResult, String> {
    use crate::db::folders;
    use crate::vault::sync as vault_sync;
    use std::fs;
    
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    
    let notes_dir = vault::get_notes_dir().map_err(|e| e.to_string())?;
    
    // Ensure notes directory exists
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes dir: {}", e))?;
    
    // Get all folders and create directories
    let all_folders = folders::get_all_folders(&conn).map_err(|e| e.to_string())?;
    let mut folders_synced = 0;
    
    // Create a map of folder id -> folder for path building
    let folder_map: std::collections::HashMap<String, crate::models::Folder> = all_folders
        .iter()
        .map(|f| (f.id.clone(), f.clone()))
        .collect();
    
    // Build folder paths and create directories
    for folder in &all_folders {
        let folder_path = build_folder_path(&notes_dir, folder, &folder_map);
        if !folder_path.exists() {
            if let Err(e) = fs::create_dir_all(&folder_path) {
                log::warn!("Failed to create folder {:?}: {}", folder_path, e);
            } else {
                log::info!("Created folder: {:?}", folder_path);
                folders_synced += 1;
            }
        }
    }
    
    // Sync all notes to files
    let notes_synced = vault_sync::sync_all_to_files(pool)
        .map_err(|e| format!("Failed to sync notes: {}", e))?;
    
    // Sync all boards to files
    let boards_synced = vault::sync_all_boards_to_files(pool)
        .map_err(|e| format!("Failed to sync boards: {}", e))?;
    
    log::info!("Synced {} notes, {} folders, and {} boards to disk", notes_synced, folders_synced, boards_synced);
    
    Ok(SyncResult {
        notes_synced,
        folders_synced,
        boards_synced,
    })
}

/// Helper to build folder path from folder hierarchy
fn build_folder_path(
    notes_dir: &std::path::Path,
    folder: &crate::models::Folder,
    folder_map: &std::collections::HashMap<String, crate::models::Folder>,
) -> std::path::PathBuf {
    let mut path_parts: Vec<String> = vec![folder.name.clone()];
    let mut current_parent = folder.parent_id.clone();
    
    while let Some(parent_id) = current_parent {
        if let Some(parent) = folder_map.get(&parent_id) {
            path_parts.push(parent.name.clone());
            current_parent = parent.parent_id.clone();
        } else {
            break;
        }
    }
    
    // Reverse to get root-to-leaf order
    path_parts.reverse();
    
    let mut folder_path = notes_dir.to_path_buf();
    for part in path_parts {
        folder_path = folder_path.join(part);
    }
    
    folder_path
}

/// Sync all notes and folders from filesystem to database
#[tauri::command]
pub fn sync_disk_to_vault(pool: tauri::State<crate::AppPool>) -> Result<SyncResult, String> {
    use crate::vault::sync as vault_sync;
    
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    
    let notes_synced = vault_sync::scan_and_sync_from_files(pool)
        .map_err(|e| format!("Failed to sync from disk: {}", e))?;
    
    // Sync boards from disk
    let boards_synced = vault::scan_and_sync_boards_from_files(pool)
        .map_err(|e| format!("Failed to sync boards from disk: {}", e))?;
    
    log::info!("Synced {} notes and {} boards from disk to database", notes_synced, boards_synced);
    
    Ok(SyncResult {
        notes_synced,
        folders_synced: 0, // Folders are inferred from note frontmatter
        boards_synced,
    })
}
