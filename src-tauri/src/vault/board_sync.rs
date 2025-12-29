//! Filesystem sync for Kanban boards
//!
//! Syncs board data to/from .board.json files in folder directories.

use crate::db::boards;
use crate::db::connection::DbPool;
use crate::db::folders;
use crate::models::AddCardInput;
use crate::vault::config;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum BoardSyncError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Database error: {0}")]
    DbError(String),
    #[error("Pool error: {0}")]
    PoolError(#[from] r2d2::Error),
    #[error("Vault error: {0}")]
    VaultError(#[from] config::VaultError),
}

impl From<boards::BoardDbError> for BoardSyncError {
    fn from(e: boards::BoardDbError) -> Self {
        BoardSyncError::DbError(e.to_string())
    }
}

impl From<folders::FolderDbError> for BoardSyncError {
    fn from(e: folders::FolderDbError) -> Self {
        BoardSyncError::DbError(e.to_string())
    }
}

/// JSON structure for a lane in the board file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardFileLane {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub position: i32,
    pub card_note_ids: Vec<String>,
}

/// JSON structure for the .board.json file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardFile {
    pub id: String,
    pub name: String,
    pub lanes: Vec<BoardFileLane>,
}

/// Get the path to a folder's board file
fn get_board_file_path(conn: &rusqlite::Connection, folder_id: &str) -> Result<PathBuf, BoardSyncError> {
    let notes_dir = config::get_notes_dir()?;
    
    // Build folder path
    let folder_path = build_folder_path(conn, folder_id)?;
    
    Ok(notes_dir.join(&folder_path).join(".board.json"))
}

/// Build the full folder path by traversing the parent hierarchy
fn build_folder_path(conn: &rusqlite::Connection, folder_id: &str) -> Result<String, BoardSyncError> {
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
    
    Ok(path_parts.join("/"))
}

/// Sync a board from database to filesystem
pub fn sync_board_to_file(pool: &DbPool, board_id: &str) -> Result<PathBuf, BoardSyncError> {
    let conn = pool.get()?;
    
    let details = boards::get_board_with_details(&conn, board_id)?
        .ok_or_else(|| BoardSyncError::DbError(format!("Board not found: {}", board_id)))?;
    
    let board_file_path = get_board_file_path(&conn, &details.board.folder_id)?;
    
    // Group cards by lane
    let mut lanes: Vec<BoardFileLane> = details.lanes.iter().map(|lane| {
        let card_note_ids: Vec<String> = details.cards
            .iter()
            .filter(|c| c.lane_id == lane.id)
            .map(|c| c.note_id.clone())
            .collect();
        
        BoardFileLane {
            id: lane.id.clone(),
            name: lane.name.clone(),
            color: lane.color.clone(),
            position: lane.position,
            card_note_ids,
        }
    }).collect();
    
    // Sort lanes by position
    lanes.sort_by_key(|l| l.position);
    
    let board_file = BoardFile {
        id: details.board.id,
        name: details.board.name,
        lanes,
    };
    
    // Ensure parent directory exists
    if let Some(parent) = board_file_path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    // Write the board file
    let content = serde_json::to_string_pretty(&board_file)?;
    fs::write(&board_file_path, content)?;
    
    log::info!("Synced board to file: {:?}", board_file_path);
    
    Ok(board_file_path)
}

/// Sync a board from filesystem to database
pub fn sync_file_to_board(pool: &DbPool, file_path: &Path, folder_id: &str) -> Result<String, BoardSyncError> {
    let content = fs::read_to_string(file_path)?;
    let board_file: BoardFile = serde_json::from_str(&content)?;
    
    let conn = pool.get()?;
    
    // Check if board already exists
    if let Some(existing) = boards::get_board(&conn, &board_file.id)? {
        // Update existing board
        boards::update_board(
            &conn,
            &existing.id,
            crate::models::UpdateBoardInput {
                name: Some(board_file.name),
            },
        )?;
        
        // Sync lanes and cards
        sync_lanes_from_file(&conn, &existing.id, &board_file.lanes)?;
        
        Ok(existing.id)
    } else {
        // Create new board (without default lanes since we're importing)
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        conn.execute(
            "INSERT INTO boards (id, folder_id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, folder_id, board_file.name, now, now],
        ).map_err(|e| BoardSyncError::DbError(e.to_string()))?;
        
        // Create lanes from file
        for lane in &board_file.lanes {
            conn.execute(
                "INSERT INTO board_lanes (id, board_id, name, color, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![lane.id, id, lane.name, lane.color, lane.position],
            ).map_err(|e| BoardSyncError::DbError(e.to_string()))?;
            
            // Add cards
            for (position, note_id) in lane.card_note_ids.iter().enumerate() {
                let card_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO board_cards (id, board_id, lane_id, note_id, position)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![card_id, id, lane.id, note_id, position as i32],
                ).map_err(|e| BoardSyncError::DbError(e.to_string()))?;
            }
        }
        
        Ok(id)
    }
}

/// Sync lanes from file data to database
fn sync_lanes_from_file(
    conn: &rusqlite::Connection,
    board_id: &str,
    file_lanes: &[BoardFileLane],
) -> Result<(), BoardSyncError> {
    // Get existing lanes
    let existing_lanes = boards::get_lanes_for_board(conn, board_id)?;
    let existing_lane_ids: std::collections::HashSet<String> = existing_lanes.iter().map(|l| l.id.clone()).collect();
    let file_lane_ids: std::collections::HashSet<String> = file_lanes.iter().map(|l| l.id.clone()).collect();
    
    // Delete lanes that are no longer in the file
    for lane_id in existing_lane_ids.difference(&file_lane_ids) {
        boards::delete_lane(conn, lane_id)?;
    }
    
    // Update or create lanes
    for file_lane in file_lanes {
        if existing_lane_ids.contains(&file_lane.id) {
            // Update
            boards::update_lane(
                conn,
                &file_lane.id,
                crate::models::UpdateLaneInput {
                    name: Some(file_lane.name.clone()),
                    color: file_lane.color.clone(),
                },
            )?;
        } else {
            // Create with specific ID
            conn.execute(
                "INSERT INTO board_lanes (id, board_id, name, color, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![file_lane.id, board_id, file_lane.name, file_lane.color, file_lane.position],
            ).map_err(|e| BoardSyncError::DbError(e.to_string()))?;
        }
        
        // Sync cards for this lane
        sync_cards_for_lane(conn, board_id, &file_lane.id, &file_lane.card_note_ids)?;
    }
    
    // Reorder lanes
    let lane_ids: Vec<String> = file_lanes.iter().map(|l| l.id.clone()).collect();
    boards::reorder_lanes(conn, board_id, &lane_ids)?;
    
    Ok(())
}

/// Sync cards for a lane from file data
fn sync_cards_for_lane(
    conn: &rusqlite::Connection,
    board_id: &str,
    lane_id: &str,
    note_ids: &[String],
) -> Result<(), BoardSyncError> {
    // Get existing cards in this lane
    let existing_cards = boards::get_cards_in_lane(conn, lane_id)?;
    let existing_note_ids: std::collections::HashSet<String> = existing_cards.iter().map(|c| c.note_id.clone()).collect();
    let file_note_ids: std::collections::HashSet<String> = note_ids.iter().cloned().collect();
    
    // Remove cards no longer in file
    for card in &existing_cards {
        if !file_note_ids.contains(&card.note_id) {
            boards::remove_card(conn, &card.id)?;
        }
    }
    
    // Add new cards and update positions
    for (position, note_id) in note_ids.iter().enumerate() {
        if !existing_note_ids.contains(note_id) {
            // Check if note is already on this board in a different lane
            if !boards::is_note_on_board(conn, note_id, board_id)? {
                boards::add_card(
                    conn,
                    AddCardInput {
                        board_id: board_id.to_string(),
                        lane_id: lane_id.to_string(),
                        note_id: note_id.clone(),
                    },
                )?;
            }
        }
        
        // Update position for existing card
        conn.execute(
            "UPDATE board_cards SET position = ?1 WHERE lane_id = ?2 AND note_id = ?3",
            rusqlite::params![position as i32, lane_id, note_id],
        ).map_err(|e| BoardSyncError::DbError(e.to_string()))?;
    }
    
    Ok(())
}

/// Sync all boards to filesystem
pub fn sync_all_boards_to_files(pool: &DbPool) -> Result<usize, BoardSyncError> {
    let conn = pool.get()?;
    let all_boards = boards::get_all_boards(&conn)?;
    
    let mut count = 0;
    for board in all_boards {
        match sync_board_to_file(pool, &board.id) {
            Ok(_) => count += 1,
            Err(e) => log::warn!("Failed to sync board {}: {}", board.id, e),
        }
    }
    
    Ok(count)
}

/// Scan filesystem for board files and sync to database
pub fn scan_and_sync_boards_from_files(pool: &DbPool) -> Result<usize, BoardSyncError> {
    let notes_dir = config::get_notes_dir()?;
    
    if !notes_dir.exists() {
        return Ok(0);
    }
    
    let conn = pool.get()?;
    let mut count = 0;
    
    // Get all folders
    let folders = folders::get_all_folders(&conn)?;
    
    for folder in folders {
        let board_file_path = get_board_file_path(&conn, &folder.id)?;
        
        if board_file_path.exists() {
            match sync_file_to_board(pool, &board_file_path, &folder.id) {
                Ok(_) => count += 1,
                Err(e) => log::warn!("Failed to sync board file {:?}: {}", board_file_path, e),
            }
        }
    }
    
    Ok(count)
}
