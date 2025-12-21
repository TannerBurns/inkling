//! Bidirectional sync between filesystem and SQLite
//!
//! Handles syncing notes between Markdown files and the SQLite database.

use crate::db::connection::DbPool;
use crate::db::{folders, notes};
use crate::models::{CreateNoteInput, Note, UpdateNoteInput};
use crate::vault::{config, markdown};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SyncError {
    #[error("Vault not configured")]
    VaultNotConfigured,
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Markdown error: {0}")]
    MarkdownError(#[from] markdown::MarkdownError),
    #[error("Database error: {0}")]
    DbError(String),
    #[error("Pool error: {0}")]
    PoolError(#[from] r2d2::Error),
    #[error("Vault error: {0}")]
    VaultError(#[from] config::VaultError),
}

impl From<notes::NoteDbError> for SyncError {
    fn from(e: notes::NoteDbError) -> Self {
        SyncError::DbError(e.to_string())
    }
}

impl From<folders::FolderDbError> for SyncError {
    fn from(e: folders::FolderDbError) -> Self {
        SyncError::DbError(e.to_string())
    }
}

/// Build the full folder path by traversing the parent hierarchy
/// Returns a path like "Customers/New Folder" for nested folders
fn build_folder_path(conn: &rusqlite::Connection, folder_id: &str) -> Result<String, SyncError> {
    let mut path_parts: Vec<String> = Vec::new();
    let mut current_id = Some(folder_id.to_string());
    
    while let Some(id) = current_id {
        if let Some(folder) = folders::get_folder(conn, &id)? {
            path_parts.push(folder.name);
            current_id = folder.parent_id;
        } else {
            break;
        }
    }
    
    // Reverse to get root-to-leaf order
    path_parts.reverse();
    
    // Join with path separator
    Ok(path_parts.join("/"))
}

/// Sync a note from database to filesystem
pub fn sync_note_to_file(pool: &DbPool, note_id: &str) -> Result<PathBuf, SyncError> {
    let notes_dir = config::get_notes_dir()?;
    let conn = pool.get()?;
    
    let note = notes::get_note(&conn, note_id)?
        .ok_or_else(|| SyncError::DbError(format!("Note not found: {}", note_id)))?;
    
    // Get full folder path if note is in a folder
    let folder_path = if let Some(ref folder_id) = note.folder_id {
        Some(build_folder_path(&conn, folder_id)?)
    } else {
        None
    };
    
    // Get just the folder name for frontmatter
    let folder_name = if let Some(ref folder_id) = note.folder_id {
        folders::get_folder(&conn, folder_id)?
            .map(|f| f.name)
    } else {
        None
    };
    
    // Determine file path using full folder path
    let file_path = markdown::get_note_path(
        &notes_dir,
        &note.title,
        folder_path.as_deref(),
    );
    
    // Write the file
    markdown::write_note_file(
        &file_path,
        &note.id,
        &note.title,
        note.content.as_deref(),
        note.folder_id.as_deref(),
        folder_name.as_deref(),
        note.created_at,
        note.updated_at,
    )?;
    
    Ok(file_path)
}

/// Sync a note from filesystem to database
pub fn sync_file_to_note(pool: &DbPool, file_path: &Path) -> Result<Note, SyncError> {
    let parsed = markdown::parse_markdown_file(file_path)?;
    let conn = pool.get()?;
    
    // Check if note exists by ID
    if let Some(existing) = notes::get_note(&conn, &parsed.frontmatter.id)? {
        // Update existing note
        let update = UpdateNoteInput {
            title: Some(parsed.title),
            content: Some(parsed.content),
            content_html: None,
            folder_id: parsed.frontmatter.folder_id,
        };
        
        let updated = notes::update_note(&conn, &existing.id, update)?;
        Ok(updated)
    } else {
        // Create new note
        let input = CreateNoteInput {
            title: parsed.title,
            content: Some(parsed.content),
            content_html: None,
            folder_id: parsed.frontmatter.folder_id,
        };
        
        // Note: We need a way to set the ID, this is a limitation
        // For now, create with a new ID
        let created = notes::create_note(&conn, input)?;
        Ok(created)
    }
}

/// Sync all notes from database to filesystem
pub fn sync_all_to_files(pool: &DbPool) -> Result<usize, SyncError> {
    let conn = pool.get()?;
    let all_notes = notes::get_all_notes(&conn)?;
    
    let mut count = 0;
    for note in all_notes {
        if !note.is_deleted {
            sync_note_to_file(pool, &note.id)?;
            count += 1;
        }
    }
    
    Ok(count)
}

/// Scan filesystem for notes and sync to database
pub fn scan_and_sync_from_files(pool: &DbPool) -> Result<usize, SyncError> {
    let notes_dir = config::get_notes_dir()?;
    
    if !notes_dir.exists() {
        return Ok(0);
    }
    
    let mut count = 0;
    let files = collect_markdown_files(&notes_dir)?;
    
    for file_path in files {
        match sync_file_to_note(pool, &file_path) {
            Ok(_) => count += 1,
            Err(e) => {
                log::warn!("Failed to sync file {:?}: {}", file_path, e);
            }
        }
    }
    
    Ok(count)
}

/// Collect all markdown files in a directory recursively
fn collect_markdown_files(dir: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut files = Vec::new();
    
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                files.extend(collect_markdown_files(&path)?);
            } else if path.extension().map_or(false, |ext| ext == "md") {
                files.push(path);
            }
        }
    }
    
    Ok(files)
}

/// Handle a file creation event
pub fn handle_file_created(pool: &DbPool, file_path: &Path) -> Result<Option<Note>, SyncError> {
    // Only process markdown files
    if file_path.extension().map_or(true, |ext| ext != "md") {
        return Ok(None);
    }
    
    let note = sync_file_to_note(pool, file_path)?;
    Ok(Some(note))
}

/// Handle a file modification event
pub fn handle_file_modified(pool: &DbPool, file_path: &Path) -> Result<Option<Note>, SyncError> {
    // Only process markdown files
    if file_path.extension().map_or(true, |ext| ext != "md") {
        return Ok(None);
    }
    
    let note = sync_file_to_note(pool, file_path)?;
    Ok(Some(note))
}

/// Handle a file deletion event
pub fn handle_file_deleted(pool: &DbPool, file_path: &Path) -> Result<bool, SyncError> {
    // We need to find the note by its file path
    // This requires reading the frontmatter before deletion, which we can't do
    // Instead, we'll need to maintain a mapping or use the title from the filename
    
    // For now, just log the deletion
    log::info!("File deleted: {:?}", file_path);
    
    // TODO: Implement proper deletion handling
    // This would require maintaining a path-to-id mapping
    
    Ok(false)
}

/// Delete a note's file from the filesystem
pub fn delete_note_file(pool: &DbPool, note_id: &str) -> Result<bool, SyncError> {
    let notes_dir = config::get_notes_dir()?;
    let conn = pool.get()?;
    
    // Get the note to find its file
    if let Some(note) = notes::get_note(&conn, note_id)? {
        // Get full folder path
        let folder_path = if let Some(ref folder_id) = note.folder_id {
            Some(build_folder_path(&conn, folder_id)?)
        } else {
            None
        };
        
        let file_path = markdown::get_note_path(
            &notes_dir,
            &note.title,
            folder_path.as_deref(),
        );
        
        if file_path.exists() {
            fs::remove_file(&file_path)?;
            return Ok(true);
        }
    }
    
    Ok(false)
}

/// Rename a note's file when the title changes
pub fn rename_note_file(
    pool: &DbPool,
    note_id: &str,
    old_title: &str,
    new_title: &str,
) -> Result<PathBuf, SyncError> {
    let notes_dir = config::get_notes_dir()?;
    let conn = pool.get()?;
    
    // Get folder info
    let note = notes::get_note(&conn, note_id)?
        .ok_or_else(|| SyncError::DbError(format!("Note not found: {}", note_id)))?;
    
    // Get full folder path
    let folder_path = if let Some(ref folder_id) = note.folder_id {
        Some(build_folder_path(&conn, folder_id)?)
    } else {
        None
    };
    
    let old_path = markdown::get_note_path(&notes_dir, old_title, folder_path.as_deref());
    let new_path = markdown::get_note_path(&notes_dir, new_title, folder_path.as_deref());
    
    if old_path.exists() && old_path != new_path {
        // Ensure parent directory exists
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)?;
        }
        
        fs::rename(&old_path, &new_path)?;
    }
    
    // Update the file content with new title
    sync_note_to_file(pool, note_id)?;
    
    Ok(new_path)
}
