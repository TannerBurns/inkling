//! Daily Notes Tool
//!
//! Tool for accessing daily journal notes by date.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// Daily note folder name constant
const DAILY_NOTES_FOLDER_NAME: &str = "Daily Notes";

/// A daily note result for the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteResult {
    pub note_id: String,
    pub date: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// get_daily_note Tool
// ============================================================================

/// Get the tool definition for get_daily_note
pub fn get_daily_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_daily_note",
        "Get the daily journal note for a specific date. Daily notes are dated entries in YYYY-MM-DD format.",
        json!({
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "The date in YYYY-MM-DD format. Defaults to today if not provided."
                }
            },
            "required": []
        }),
    )
}

/// Get today's date in YYYY-MM-DD format
fn get_today_date_string() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

/// Find the Daily Notes folder ID
fn get_daily_notes_folder_id(conn: &rusqlite::Connection) -> Option<String> {
    let folders = db::folders::get_all_folders(conn).ok()?;
    folders.iter()
        .find(|f| f.name == DAILY_NOTES_FOLDER_NAME && f.parent_id.is_none())
        .map(|f| f.id.clone())
}

/// Execute the get_daily_note tool
pub fn execute_get_daily_note(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let date = args
        .get("date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(get_today_date_string);

    // Validate date format
    if !is_valid_date_format(&date) {
        return Err(format!("Invalid date format: '{}'. Use YYYY-MM-DD format.", date));
    }

    // Find the Daily Notes folder
    let folder_id = match get_daily_notes_folder_id(&conn) {
        Some(id) => id,
        None => {
            return Ok(json!({
                "success": true,
                "date": date,
                "note": null,
                "message": "Daily Notes folder does not exist yet"
            }).to_string());
        }
    };

    // Find the note for this date in the Daily Notes folder
    let notes = db::notes::get_notes_in_folder(&conn, Some(&folder_id))
        .map_err(|e| format!("Failed to get notes: {}", e))?;

    let daily_note = notes.iter().find(|n| n.title == date);

    match daily_note {
        Some(note) => {
            Ok(json!({
                "success": true,
                "date": date,
                "note": DailyNoteResult {
                    note_id: note.id.clone(),
                    date: note.title.clone(),
                    content: note.content.clone().unwrap_or_default(),
                    created_at: note.created_at.to_rfc3339(),
                    updated_at: note.updated_at.to_rfc3339(),
                }
            }).to_string())
        }
        None => {
            Ok(json!({
                "success": true,
                "date": date,
                "note": null,
                "message": format!("No daily note exists for {}", date)
            }).to_string())
        }
    }
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
    
    if parts[0].len() != 4 || !parts[0].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    
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
    fn test_get_daily_note_tool() {
        let tool = get_daily_note_tool();
        assert_eq!(tool.function.name, "get_daily_note");
        assert!(tool.function.description.contains("daily"));
    }

    #[test]
    fn test_is_valid_date_format() {
        assert!(is_valid_date_format("2025-12-28"));
        assert!(is_valid_date_format("2025-01-01"));
        
        assert!(!is_valid_date_format("2025-13-01"));
        assert!(!is_valid_date_format("invalid"));
        assert!(!is_valid_date_format("2025/12/28"));
    }

    #[test]
    fn test_get_today_date_string() {
        let today = get_today_date_string();
        assert!(is_valid_date_format(&today));
    }
}

