//! Tauri commands for Kanban board operations

use tauri::State;

use crate::db::boards as db;
use crate::models::{
    AddCardInput, Board, BoardCard, BoardCardWithNote, BoardLane, BoardWithDetails,
    CreateBoardInput, CreateLaneInput, MoveCardInput, UpdateBoardInput, UpdateLaneInput,
};
use crate::AppPool;

// ============================================================================
// Board Commands
// ============================================================================

/// Create a new board for a folder
#[tauri::command]
pub fn create_board(
    pool: State<AppPool>,
    folder_id: String,
    name: String,
) -> Result<BoardWithDetails, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = CreateBoardInput { folder_id, name };
    let board = db::create_board(&conn, input).map_err(|e| e.to_string())?;

    // Return board with details
    db::get_board_with_details(&conn, &board.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to get created board".to_string())
}

/// Get a board by ID
#[tauri::command]
pub fn get_board(pool: State<AppPool>, id: String) -> Result<Option<Board>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_board(&conn, &id).map_err(|e| e.to_string())
}

/// Get a board by folder ID
#[tauri::command]
pub fn get_board_by_folder(pool: State<AppPool>, folder_id: String) -> Result<Option<Board>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_board_by_folder(&conn, &folder_id).map_err(|e| e.to_string())
}

/// Get all boards
#[tauri::command]
pub fn get_all_boards(pool: State<AppPool>) -> Result<Vec<Board>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_all_boards(&conn).map_err(|e| e.to_string())
}

/// Get a board with all its lanes and cards
#[tauri::command]
pub fn get_board_with_details(
    pool: State<AppPool>,
    id: String,
) -> Result<Option<BoardWithDetails>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_board_with_details(&conn, &id).map_err(|e| e.to_string())
}

/// Update a board
#[tauri::command]
pub fn update_board(
    pool: State<AppPool>,
    id: String,
    name: Option<String>,
) -> Result<Board, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = UpdateBoardInput { name };
    db::update_board(&conn, &id, input).map_err(|e| e.to_string())
}

/// Delete a board
#[tauri::command]
pub fn delete_board(pool: State<AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::delete_board(&conn, &id).map_err(|e| e.to_string())
}

// ============================================================================
// Lane Commands
// ============================================================================

/// Create a new lane
#[tauri::command]
pub fn create_lane(
    pool: State<AppPool>,
    board_id: String,
    name: String,
    color: Option<String>,
) -> Result<BoardLane, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = CreateLaneInput {
        board_id,
        name,
        color,
    };
    db::create_lane(&conn, input, None).map_err(|e| e.to_string())
}

/// Get all lanes for a board
#[tauri::command]
pub fn get_lanes_for_board(pool: State<AppPool>, board_id: String) -> Result<Vec<BoardLane>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_lanes_for_board(&conn, &board_id).map_err(|e| e.to_string())
}

/// Update a lane
#[tauri::command]
pub fn update_lane(
    pool: State<AppPool>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<BoardLane, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = UpdateLaneInput { name, color };
    db::update_lane(&conn, &id, input).map_err(|e| e.to_string())
}

/// Delete a lane
#[tauri::command]
pub fn delete_lane(pool: State<AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::delete_lane(&conn, &id).map_err(|e| e.to_string())
}

/// Reorder lanes
#[tauri::command]
pub fn reorder_lanes(
    pool: State<AppPool>,
    board_id: String,
    lane_ids: Vec<String>,
) -> Result<(), String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::reorder_lanes(&conn, &board_id, &lane_ids).map_err(|e| e.to_string())
}

// ============================================================================
// Card Commands
// ============================================================================

/// Add a card to a lane
#[tauri::command]
pub fn add_card(
    pool: State<AppPool>,
    board_id: String,
    lane_id: String,
    note_id: String,
) -> Result<BoardCard, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Check if note is already on this board
    if db::is_note_on_board(&conn, &note_id, &board_id).map_err(|e| e.to_string())? {
        return Err("Note is already on this board".to_string());
    }

    let input = AddCardInput {
        board_id,
        lane_id,
        note_id,
    };
    db::add_card(&conn, input).map_err(|e| e.to_string())
}

/// Get all cards for a board
#[tauri::command]
pub fn get_cards_for_board(
    pool: State<AppPool>,
    board_id: String,
) -> Result<Vec<BoardCardWithNote>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_cards_for_board(&conn, &board_id).map_err(|e| e.to_string())
}

/// Get cards in a specific lane
#[tauri::command]
pub fn get_cards_in_lane(
    pool: State<AppPool>,
    lane_id: String,
) -> Result<Vec<BoardCardWithNote>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_cards_in_lane(&conn, &lane_id).map_err(|e| e.to_string())
}

/// Move a card to a different lane and/or position
#[tauri::command]
pub fn move_card(
    pool: State<AppPool>,
    card_id: String,
    target_lane_id: String,
    target_position: i32,
) -> Result<BoardCard, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let input = MoveCardInput {
        card_id,
        target_lane_id,
        target_position,
    };
    db::move_card(&conn, input).map_err(|e| e.to_string())
}

/// Remove a card from a board
#[tauri::command]
pub fn remove_card(pool: State<AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::remove_card(&conn, &id).map_err(|e| e.to_string())
}

/// Get all boards that a note appears on
#[tauri::command]
pub fn get_boards_for_note(pool: State<AppPool>, note_id: String) -> Result<Vec<Board>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    db::get_boards_for_note(&conn, &note_id).map_err(|e| e.to_string())
}
