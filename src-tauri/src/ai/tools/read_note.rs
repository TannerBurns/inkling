//! Read Note Tool
//!
//! Retrieves the full content of a note by ID or title.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// Result of reading a note
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadNoteResult {
    pub note_id: String,
    pub title: String,
    pub content: String,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Get the tool definition for read_note
pub fn get_read_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "read_note",
        "Get the full content of a specific note by its ID or title. Use this when you need to read the complete text of a note.",
        json!({
            "type": "object",
            "properties": {
                "note_id": {
                    "type": "string",
                    "description": "The unique ID of the note to read"
                },
                "title": {
                    "type": "string",
                    "description": "The title of the note to find (used if note_id is not provided)"
                }
            },
            "required": []
        }),
    )
}

/// Execute the read_note tool
pub fn execute_read_note(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Try to get note by ID first
    if let Some(note_id) = args.get("note_id").and_then(|v| v.as_str()) {
        if let Ok(Some(note)) = db::notes::get_note(&conn, note_id) {
            if note.is_deleted {
                return Err(format!("Note with ID '{}' has been deleted", note_id));
            }
            return Ok(json!({
                "success": true,
                "note": ReadNoteResult {
                    note_id: note.id,
                    title: note.title,
                    content: note.content.unwrap_or_default(),
                    folder_id: note.folder_id,
                    created_at: note.created_at.to_rfc3339(),
                    updated_at: note.updated_at.to_rfc3339(),
                }
            }).to_string());
        } else {
            return Err(format!("Note with ID '{}' not found", note_id));
        }
    }

    // Try to find by title (accept both "title" and "note_title" for consistency)
    let title_arg = args.get("title").and_then(|v| v.as_str())
        .or_else(|| args.get("note_title").and_then(|v| v.as_str()));
    if let Some(title) = title_arg {
        // Search for notes with matching title
        let notes = db::notes::get_all_notes(&conn)
            .map_err(|e| e.to_string())?;
        
        // Find exact match first, then partial match
        let matching_note = notes.iter()
            .find(|n| n.title.to_lowercase() == title.to_lowercase())
            .or_else(|| notes.iter().find(|n| n.title.to_lowercase().contains(&title.to_lowercase())));

        if let Some(note) = matching_note {
            return Ok(json!({
                "success": true,
                "note": ReadNoteResult {
                    note_id: note.id.clone(),
                    title: note.title.clone(),
                    content: note.content.clone().unwrap_or_default(),
                    folder_id: note.folder_id.clone(),
                    created_at: note.created_at.to_rfc3339(),
                    updated_at: note.updated_at.to_rfc3339(),
                }
            }).to_string());
        } else {
            return Err(format!("No note found with title matching '{}'", title));
        }
    }

    Err("Either 'note_id' or 'title' must be provided".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_read_note_tool() {
        let tool = get_read_note_tool();
        assert_eq!(tool.function.name, "read_note");
        assert!(tool.function.description.contains("content"));
    }
}

