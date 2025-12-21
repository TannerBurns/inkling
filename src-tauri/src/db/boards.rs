//! Database operations for Kanban boards

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{
    AddCardInput, Board, BoardCard, BoardCardWithNote, BoardLane, BoardWithDetails,
    CreateBoardInput, CreateLaneInput, MoveCardInput, UpdateBoardInput, UpdateLaneInput,
};

#[derive(Error, Debug)]
pub enum BoardDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Board not found: {0}")]
    BoardNotFound(String),
    #[error("Lane not found: {0}")]
    LaneNotFound(String),
    #[error("Card not found: {0}")]
    CardNotFound(String),
    #[error("Board already exists for folder: {0}")]
    BoardAlreadyExists(String),
}

/// Parse a datetime string from SQLite into a DateTime<Utc>
fn parse_datetime(s: &str) -> DateTime<Utc> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc);
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Utc.from_utc_datetime(&naive);
    }
    Utc::now()
}

/// Map a database row to a Board struct
fn row_to_board(row: &Row) -> Result<Board, rusqlite::Error> {
    let created_at_str: String = row.get(3)?;
    let updated_at_str: String = row.get(4)?;

    Ok(Board {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        name: row.get(2)?,
        created_at: parse_datetime(&created_at_str),
        updated_at: parse_datetime(&updated_at_str),
    })
}

/// Map a database row to a BoardLane struct
fn row_to_lane(row: &Row) -> Result<BoardLane, rusqlite::Error> {
    Ok(BoardLane {
        id: row.get(0)?,
        board_id: row.get(1)?,
        name: row.get(2)?,
        color: row.get(3)?,
        position: row.get(4)?,
    })
}

/// Map a database row to a BoardCard struct
fn row_to_card(row: &Row) -> Result<BoardCard, rusqlite::Error> {
    Ok(BoardCard {
        id: row.get(0)?,
        board_id: row.get(1)?,
        lane_id: row.get(2)?,
        note_id: row.get(3)?,
        position: row.get(4)?,
    })
}

/// Map a database row to a BoardCardWithNote struct
fn row_to_card_with_note(row: &Row) -> Result<BoardCardWithNote, rusqlite::Error> {
    Ok(BoardCardWithNote {
        id: row.get(0)?,
        board_id: row.get(1)?,
        lane_id: row.get(2)?,
        note_id: row.get(3)?,
        position: row.get(4)?,
        note_title: row.get(5)?,
        note_folder_path: row.get(6)?,
    })
}

// ============================================================================
// Board CRUD
// ============================================================================

/// Create a new board with default lanes
pub fn create_board(conn: &Connection, input: CreateBoardInput) -> Result<Board, BoardDbError> {
    // Check if board already exists for this folder
    if let Some(_) = get_board_by_folder(conn, &input.folder_id)? {
        return Err(BoardDbError::BoardAlreadyExists(input.folder_id));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO boards (id, folder_id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, input.folder_id, input.name, now, now],
    )?;

    // Create default lanes
    let default_lanes = vec![
        ("To Do", "#6b7280"),      // gray
        ("In Progress", "#3b82f6"), // blue
        ("Done", "#22c55e"),        // green
    ];

    for (position, (name, color)) in default_lanes.iter().enumerate() {
        create_lane(
            conn,
            CreateLaneInput {
                board_id: id.clone(),
                name: name.to_string(),
                color: Some(color.to_string()),
            },
            Some(position as i32),
        )?;
    }

    get_board(conn, &id)?.ok_or(BoardDbError::BoardNotFound(id))
}

/// Get a board by ID
pub fn get_board(conn: &Connection, id: &str) -> Result<Option<Board>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, name, created_at, updated_at FROM boards WHERE id = ?1",
    )?;

    let board = stmt.query_row([id], row_to_board).optional()?;
    Ok(board)
}

/// Get a board by folder ID
pub fn get_board_by_folder(conn: &Connection, folder_id: &str) -> Result<Option<Board>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, name, created_at, updated_at FROM boards WHERE folder_id = ?1",
    )?;

    let board = stmt.query_row([folder_id], row_to_board).optional()?;
    Ok(board)
}

/// Get all boards
pub fn get_all_boards(conn: &Connection) -> Result<Vec<Board>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, name, created_at, updated_at FROM boards ORDER BY updated_at DESC",
    )?;

    let boards = stmt
        .query_map([], row_to_board)?
        .filter_map(Result::ok)
        .collect();

    Ok(boards)
}

/// Update a board
pub fn update_board(
    conn: &Connection,
    id: &str,
    input: UpdateBoardInput,
) -> Result<Board, BoardDbError> {
    let existing = get_board(conn, id)?.ok_or_else(|| BoardDbError::BoardNotFound(id.to_string()))?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let name = input.name.unwrap_or(existing.name);

    conn.execute(
        "UPDATE boards SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, id],
    )?;

    get_board(conn, id)?.ok_or(BoardDbError::BoardNotFound(id.to_string()))
}

/// Delete a board (cascades to lanes and cards)
pub fn delete_board(conn: &Connection, id: &str) -> Result<bool, BoardDbError> {
    let rows_affected = conn.execute("DELETE FROM boards WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Get a board with all its lanes and cards
pub fn get_board_with_details(conn: &Connection, id: &str) -> Result<Option<BoardWithDetails>, BoardDbError> {
    let board = match get_board(conn, id)? {
        Some(b) => b,
        None => return Ok(None),
    };

    let lanes = get_lanes_for_board(conn, id)?;
    let cards = get_cards_for_board(conn, id)?;

    Ok(Some(BoardWithDetails { board, lanes, cards }))
}

// ============================================================================
// Lane CRUD
// ============================================================================

/// Create a new lane
pub fn create_lane(
    conn: &Connection,
    input: CreateLaneInput,
    position: Option<i32>,
) -> Result<BoardLane, BoardDbError> {
    let id = Uuid::new_v4().to_string();

    // If position not specified, add at the end
    let pos = match position {
        Some(p) => p,
        None => {
            let max_pos: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) FROM board_lanes WHERE board_id = ?1",
                    [&input.board_id],
                    |row| row.get(0),
                )
                .unwrap_or(-1);
            max_pos + 1
        }
    };

    conn.execute(
        "INSERT INTO board_lanes (id, board_id, name, color, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, input.board_id, input.name, input.color, pos],
    )?;

    // Update board's updated_at
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
        params![now, input.board_id],
    )?;

    get_lane(conn, &id)?.ok_or(BoardDbError::LaneNotFound(id))
}

/// Get a lane by ID
pub fn get_lane(conn: &Connection, id: &str) -> Result<Option<BoardLane>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, name, color, position FROM board_lanes WHERE id = ?1",
    )?;

    let lane = stmt.query_row([id], row_to_lane).optional()?;
    Ok(lane)
}

/// Get all lanes for a board, ordered by position
pub fn get_lanes_for_board(conn: &Connection, board_id: &str) -> Result<Vec<BoardLane>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, name, color, position FROM board_lanes 
         WHERE board_id = ?1 ORDER BY position",
    )?;

    let lanes = stmt
        .query_map([board_id], row_to_lane)?
        .filter_map(Result::ok)
        .collect();

    Ok(lanes)
}

/// Update a lane
pub fn update_lane(
    conn: &Connection,
    id: &str,
    input: UpdateLaneInput,
) -> Result<BoardLane, BoardDbError> {
    let existing = get_lane(conn, id)?.ok_or_else(|| BoardDbError::LaneNotFound(id.to_string()))?;

    let name = input.name.unwrap_or(existing.name);
    let color = input.color.or(existing.color);

    conn.execute(
        "UPDATE board_lanes SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    )?;

    // Update board's updated_at
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
        params![now, existing.board_id],
    )?;

    get_lane(conn, id)?.ok_or(BoardDbError::LaneNotFound(id.to_string()))
}

/// Delete a lane (cards in the lane are also deleted)
pub fn delete_lane(conn: &Connection, id: &str) -> Result<bool, BoardDbError> {
    let lane = get_lane(conn, id)?;
    
    let rows_affected = conn.execute("DELETE FROM board_lanes WHERE id = ?1", [id])?;

    // Update board's updated_at if lane existed
    if let Some(lane) = lane {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
            params![now, lane.board_id],
        )?;
    }

    Ok(rows_affected > 0)
}

/// Reorder lanes
pub fn reorder_lanes(conn: &Connection, board_id: &str, lane_ids: &[String]) -> Result<(), BoardDbError> {
    for (position, lane_id) in lane_ids.iter().enumerate() {
        conn.execute(
            "UPDATE board_lanes SET position = ?1 WHERE id = ?2 AND board_id = ?3",
            params![position as i32, lane_id, board_id],
        )?;
    }

    // Update board's updated_at
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
        params![now, board_id],
    )?;

    Ok(())
}

// ============================================================================
// Card CRUD
// ============================================================================

/// Add a card (note) to a lane
pub fn add_card(conn: &Connection, input: AddCardInput) -> Result<BoardCard, BoardDbError> {
    let id = Uuid::new_v4().to_string();

    // Get the next position in the lane
    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM board_cards WHERE lane_id = ?1",
            [&input.lane_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO board_cards (id, board_id, lane_id, note_id, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, input.board_id, input.lane_id, input.note_id, max_pos + 1],
    )?;

    // Update board's updated_at
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
        params![now, input.board_id],
    )?;

    get_card(conn, &id)?.ok_or(BoardDbError::CardNotFound(id))
}

/// Get a card by ID
pub fn get_card(conn: &Connection, id: &str) -> Result<Option<BoardCard>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, lane_id, note_id, position FROM board_cards WHERE id = ?1",
    )?;

    let card = stmt.query_row([id], row_to_card).optional()?;
    Ok(card)
}

/// Get all cards for a board with note details
pub fn get_cards_for_board(conn: &Connection, board_id: &str) -> Result<Vec<BoardCardWithNote>, BoardDbError> {
    // Build folder path using recursive CTE
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE folder_path(folder_id, path) AS (
            SELECT id, name FROM folders WHERE parent_id IS NULL
            UNION ALL
            SELECT f.id, fp.path || '/' || f.name
            FROM folders f
            JOIN folder_path fp ON f.parent_id = fp.folder_id
        )
        SELECT 
            bc.id, bc.board_id, bc.lane_id, bc.note_id, bc.position,
            n.title,
            fp.path
        FROM board_cards bc
        JOIN notes n ON bc.note_id = n.id
        LEFT JOIN folder_path fp ON n.folder_id = fp.folder_id
        WHERE bc.board_id = ?1
        ORDER BY bc.lane_id, bc.position
        "#,
    )?;

    let cards = stmt
        .query_map([board_id], row_to_card_with_note)?
        .filter_map(Result::ok)
        .collect();

    Ok(cards)
}

/// Get cards in a specific lane
pub fn get_cards_in_lane(conn: &Connection, lane_id: &str) -> Result<Vec<BoardCardWithNote>, BoardDbError> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE folder_path(folder_id, path) AS (
            SELECT id, name FROM folders WHERE parent_id IS NULL
            UNION ALL
            SELECT f.id, fp.path || '/' || f.name
            FROM folders f
            JOIN folder_path fp ON f.parent_id = fp.folder_id
        )
        SELECT 
            bc.id, bc.board_id, bc.lane_id, bc.note_id, bc.position,
            n.title,
            fp.path
        FROM board_cards bc
        JOIN notes n ON bc.note_id = n.id
        LEFT JOIN folder_path fp ON n.folder_id = fp.folder_id
        WHERE bc.lane_id = ?1
        ORDER BY bc.position
        "#,
    )?;

    let cards = stmt
        .query_map([lane_id], row_to_card_with_note)?
        .filter_map(Result::ok)
        .collect();

    Ok(cards)
}

/// Move a card to a different lane and/or position
pub fn move_card(conn: &Connection, input: MoveCardInput) -> Result<BoardCard, BoardDbError> {
    let card = get_card(conn, &input.card_id)?
        .ok_or_else(|| BoardDbError::CardNotFound(input.card_id.clone()))?;

    // If moving to a different lane, shift positions in both lanes
    if card.lane_id != input.target_lane_id {
        // Shift cards in old lane up
        conn.execute(
            "UPDATE board_cards SET position = position - 1 
             WHERE lane_id = ?1 AND position > ?2",
            params![card.lane_id, card.position],
        )?;

        // Shift cards in new lane down
        conn.execute(
            "UPDATE board_cards SET position = position + 1 
             WHERE lane_id = ?1 AND position >= ?2",
            params![input.target_lane_id, input.target_position],
        )?;
    } else {
        // Moving within the same lane
        if input.target_position > card.position {
            // Moving down - shift cards between old and new position up
            conn.execute(
                "UPDATE board_cards SET position = position - 1 
                 WHERE lane_id = ?1 AND position > ?2 AND position <= ?3",
                params![card.lane_id, card.position, input.target_position],
            )?;
        } else if input.target_position < card.position {
            // Moving up - shift cards between new and old position down
            conn.execute(
                "UPDATE board_cards SET position = position + 1 
                 WHERE lane_id = ?1 AND position >= ?2 AND position < ?3",
                params![card.lane_id, input.target_position, card.position],
            )?;
        }
    }

    // Update the card's lane and position
    conn.execute(
        "UPDATE board_cards SET lane_id = ?1, position = ?2 WHERE id = ?3",
        params![input.target_lane_id, input.target_position, input.card_id],
    )?;

    // Update board's updated_at
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
        params![now, card.board_id],
    )?;

    get_card(conn, &input.card_id)?.ok_or(BoardDbError::CardNotFound(input.card_id))
}

/// Remove a card from a board
pub fn remove_card(conn: &Connection, id: &str) -> Result<bool, BoardDbError> {
    let card = get_card(conn, id)?;

    let rows_affected = conn.execute("DELETE FROM board_cards WHERE id = ?1", [id])?;

    // Shift positions of remaining cards in the lane
    if let Some(card) = &card {
        conn.execute(
            "UPDATE board_cards SET position = position - 1 
             WHERE lane_id = ?1 AND position > ?2",
            params![card.lane_id, card.position],
        )?;

        // Update board's updated_at
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
            params![now, card.board_id],
        )?;
    }

    Ok(rows_affected > 0)
}

/// Check if a note is on a specific board
pub fn is_note_on_board(conn: &Connection, note_id: &str, board_id: &str) -> Result<bool, BoardDbError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM board_cards WHERE note_id = ?1 AND board_id = ?2",
        params![note_id, board_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Get all boards a note appears on
pub fn get_boards_for_note(conn: &Connection, note_id: &str) -> Result<Vec<Board>, BoardDbError> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT b.id, b.folder_id, b.name, b.created_at, b.updated_at
         FROM boards b
         JOIN board_cards bc ON b.id = bc.board_id
         WHERE bc.note_id = ?1
         ORDER BY b.updated_at DESC",
    )?;

    let boards = stmt
        .query_map([note_id], row_to_board)?
        .filter_map(Result::ok)
        .collect();

    Ok(boards)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;
    use crate::db::folders;
    use crate::db::notes;
    use crate::models::{CreateFolderInput, CreateNoteInput};

    fn setup_test_folder(conn: &Connection) -> String {
        let folder = folders::create_folder(
            conn,
            CreateFolderInput {
                name: "Test Folder".to_string(),
                parent_id: None,
            },
        )
        .unwrap();
        folder.id
    }

    fn setup_test_note(conn: &Connection, folder_id: &str) -> String {
        let note = notes::create_note(
            conn,
            CreateNoteInput {
                title: "Test Note".to_string(),
                content: Some("Test content".to_string()),
                content_html: None,
                folder_id: Some(folder_id.to_string()),
            },
        )
        .unwrap();
        note.id
    }

    #[test]
    fn test_create_board_with_default_lanes() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        
        let folder_id = setup_test_folder(&conn);

        let board = create_board(
            &conn,
            CreateBoardInput {
                folder_id: folder_id.clone(),
                name: "Project Board".to_string(),
            },
        )
        .unwrap();

        assert_eq!(board.name, "Project Board");
        assert_eq!(board.folder_id, folder_id);

        // Should have 3 default lanes
        let lanes = get_lanes_for_board(&conn, &board.id).unwrap();
        assert_eq!(lanes.len(), 3);
        assert_eq!(lanes[0].name, "To Do");
        assert_eq!(lanes[1].name, "In Progress");
        assert_eq!(lanes[2].name, "Done");
    }

    #[test]
    fn test_cannot_create_duplicate_board_for_folder() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        
        let folder_id = setup_test_folder(&conn);

        create_board(
            &conn,
            CreateBoardInput {
                folder_id: folder_id.clone(),
                name: "First Board".to_string(),
            },
        )
        .unwrap();

        let result = create_board(
            &conn,
            CreateBoardInput {
                folder_id: folder_id.clone(),
                name: "Second Board".to_string(),
            },
        );

        assert!(matches!(result, Err(BoardDbError::BoardAlreadyExists(_))));
    }

    #[test]
    fn test_add_and_move_card() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        
        let folder_id = setup_test_folder(&conn);
        let note_id = setup_test_note(&conn, &folder_id);

        let board = create_board(
            &conn,
            CreateBoardInput {
                folder_id,
                name: "Test Board".to_string(),
            },
        )
        .unwrap();

        let lanes = get_lanes_for_board(&conn, &board.id).unwrap();
        let todo_lane = &lanes[0];
        let done_lane = &lanes[2];

        // Add card to "To Do" lane
        let card = add_card(
            &conn,
            AddCardInput {
                board_id: board.id.clone(),
                lane_id: todo_lane.id.clone(),
                note_id: note_id.clone(),
            },
        )
        .unwrap();

        assert_eq!(card.lane_id, todo_lane.id);
        assert_eq!(card.position, 0);

        // Move card to "Done" lane
        let moved_card = move_card(
            &conn,
            MoveCardInput {
                card_id: card.id.clone(),
                target_lane_id: done_lane.id.clone(),
                target_position: 0,
            },
        )
        .unwrap();

        assert_eq!(moved_card.lane_id, done_lane.id);
        assert_eq!(moved_card.position, 0);
    }

    #[test]
    fn test_get_board_with_details() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        
        let folder_id = setup_test_folder(&conn);
        let note_id = setup_test_note(&conn, &folder_id);

        let board = create_board(
            &conn,
            CreateBoardInput {
                folder_id,
                name: "Test Board".to_string(),
            },
        )
        .unwrap();

        let lanes = get_lanes_for_board(&conn, &board.id).unwrap();

        add_card(
            &conn,
            AddCardInput {
                board_id: board.id.clone(),
                lane_id: lanes[0].id.clone(),
                note_id,
            },
        )
        .unwrap();

        let details = get_board_with_details(&conn, &board.id).unwrap().unwrap();
        assert_eq!(details.board.id, board.id);
        assert_eq!(details.lanes.len(), 3);
        assert_eq!(details.cards.len(), 1);
        assert_eq!(details.cards[0].note_title, "Test Note");
    }

    #[test]
    fn test_reorder_lanes() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        
        let folder_id = setup_test_folder(&conn);

        let board = create_board(
            &conn,
            CreateBoardInput {
                folder_id,
                name: "Test Board".to_string(),
            },
        )
        .unwrap();

        let lanes = get_lanes_for_board(&conn, &board.id).unwrap();
        
        // Reverse the order
        let new_order: Vec<String> = lanes.iter().rev().map(|l| l.id.clone()).collect();
        reorder_lanes(&conn, &board.id, &new_order).unwrap();

        let reordered = get_lanes_for_board(&conn, &board.id).unwrap();
        assert_eq!(reordered[0].name, "Done");
        assert_eq!(reordered[1].name, "In Progress");
        assert_eq!(reordered[2].name, "To Do");
    }
}
