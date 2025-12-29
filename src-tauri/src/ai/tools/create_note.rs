//! Create Note Tool
//!
//! Tool for creating new notes (inline assistant only).

use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};
use crate::models::CreateNoteInput;

// ============================================================================
// create_note Tool
// ============================================================================

/// Get the tool definition for create_note
pub fn get_create_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "create_note",
        "Create a new note in the vault. Use this to draft new content as a separate note.",
        json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the new note"
                },
                "content": {
                    "type": "string",
                    "description": "The markdown content of the note"
                },
                "folder_id": {
                    "type": "string",
                    "description": "Optional folder ID to place the note in. Leave empty for unfiled."
                },
                "folder_name": {
                    "type": "string",
                    "description": "Optional folder name to find and place the note in"
                }
            },
            "required": ["title"]
        }),
    )
}

/// Execute the create_note tool
pub fn execute_create_note(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'title' argument")?
        .to_string();

    if title.trim().is_empty() {
        return Err("Title cannot be empty".to_string());
    }

    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Resolve folder_id
    let folder_id = if let Some(id) = args.get("folder_id").and_then(|v| v.as_str()) {
        if id.is_empty() {
            None
        } else {
            // Verify folder exists
            match db::folders::get_folder(&conn, id) {
                Ok(Some(_)) => Some(id.to_string()),
                Ok(None) => return Err(format!("Folder with ID '{}' not found", id)),
                Err(e) => return Err(format!("Failed to verify folder: {}", e)),
            }
        }
    } else if let Some(name) = args.get("folder_name").and_then(|v| v.as_str()) {
        // Find folder by name
        let folders = db::folders::get_all_folders(&conn)
            .map_err(|e| format!("Failed to get folders: {}", e))?;
        
        let folder = folders.iter()
            .find(|f| f.name.to_lowercase() == name.to_lowercase())
            .or_else(|| folders.iter().find(|f| f.name.to_lowercase().contains(&name.to_lowercase())));
        
        folder.map(|f| f.id.clone())
    } else {
        None
    };

    // Check if a note with this title already exists
    let existing_notes = db::notes::get_all_notes(&conn)
        .map_err(|e| format!("Failed to check existing notes: {}", e))?;
    
    if existing_notes.iter().any(|n| n.title.to_lowercase() == title.to_lowercase()) {
        return Err(format!("A note with title '{}' already exists", title));
    }

    // Create the note
    let input = CreateNoteInput {
        title: title.clone(),
        content: content.clone(),
        content_html: None,
        folder_id: folder_id.clone(),
    };

    let note = db::notes::create_note(&conn, input)
        .map_err(|e| format!("Failed to create note: {}", e))?;

    // Get folder name for response
    let folder_name = if let Some(ref id) = folder_id {
        db::folders::get_folder(&conn, id)
            .ok()
            .flatten()
            .map(|f| f.name)
    } else {
        None
    };

    Ok(json!({
        "success": true,
        "message": format!("Created note: {}", title),
        "note": {
            "id": note.id,
            "title": note.title,
            "folder_id": note.folder_id,
            "folder_name": folder_name,
            "created_at": note.created_at.to_rfc3339()
        }
    }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_create_note_tool() {
        let tool = get_create_note_tool();
        assert_eq!(tool.function.name, "create_note");
        assert!(tool.function.description.contains("Create"));
    }
}

