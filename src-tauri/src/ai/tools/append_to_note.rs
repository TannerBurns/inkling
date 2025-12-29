//! Append to Note Tool
//!
//! Two variants:
//! 1. append_to_note: For inline assistant - streams content via Tauri events to cursor position
//! 2. append_content_to_note: For chat agent - writes directly to file first, then syncs to DB

use chrono::Utc;
use serde_json::json;
use tauri::Emitter;

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool, folders};
use crate::vault::{config as vault_config, markdown, sync as vault_sync};

/// Get the tool definition for append_to_note
pub fn get_append_to_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "append_to_note",
        "Append content to the current note. Content will be inserted at the cursor position. Call this multiple times to stream content incrementally.",
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The markdown content to append to the note. Can include headings, lists, code blocks, etc."
                },
                "is_final": {
                    "type": "boolean",
                    "description": "Whether this is the final piece of content. Set to true when done writing.",
                    "default": false
                }
            },
            "required": ["content"]
        }),
    )
}

/// Content event payload for streaming to the frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendContentEvent {
    /// The content to append
    pub content: String,
    /// Whether this is the final chunk
    pub is_final: bool,
}

/// Execute the append_to_note tool
///
/// This function emits content via a Tauri event so the frontend can
/// insert it into the note at the current cursor position.
pub fn execute_append_to_note(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    args: serde_json::Value,
) -> Result<String, String> {
    // Parse arguments
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'content' argument")?;

    let is_final = args
        .get("is_final")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if content.is_empty() {
        return Err("Content cannot be empty".to_string());
    }

    // Emit the content event
    let event_name = format!("agent-content-{}", execution_id);
    let event_payload = AppendContentEvent {
        content: content.to_string(),
        is_final,
    };

    app_handle
        .emit(&event_name, &event_payload)
        .map_err(|e| format!("Failed to emit content event: {}", e))?;

    log::info!(
        "[AppendToNote] Emitted {} chars to {}, is_final={}",
        content.len(),
        event_name,
        is_final
    );

    Ok(json!({
        "success": true,
        "message": if is_final { "Content appended (final)" } else { "Content appended" },
        "chars_written": content.len()
    })
    .to_string())
}

// ============================================================================
// append_content_to_note Tool (for Chat Agent - writes to DB by note ID)
// ============================================================================

/// Get the tool definition for append_content_to_note
/// This tool is for the chat agent to write content to a specific note by ID
pub fn get_append_content_to_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "append_content_to_note",
        "Append or prepend content to an existing note. Use this to add information to a user's note. First use search_notes or read_note to find/verify the target note.",
        json!({
            "type": "object",
            "properties": {
                "note_id": {
                    "type": "string",
                    "description": "The ID of the note to append content to. Get this from search_notes or read_note."
                },
                "note_title": {
                    "type": "string",
                    "description": "Alternative: the title of the note to find and append to. Use note_id if available."
                },
                "content": {
                    "type": "string",
                    "description": "The markdown content to add to the note. Will be appended after existing content."
                },
                "position": {
                    "type": "string",
                    "enum": ["end", "beginning"],
                    "description": "Where to insert the content. Defaults to 'end' to append after existing content.",
                    "default": "end"
                }
            },
            "required": ["content"]
        }),
    )
}

/// Build the full folder path by traversing the parent hierarchy
fn build_folder_path(conn: &rusqlite::Connection, folder_id: &str) -> Result<String, String> {
    let mut path_parts: Vec<String> = Vec::new();
    let mut current_id = Some(folder_id.to_string());
    
    while let Some(id) = current_id {
        if let Some(folder) = folders::get_folder(conn, &id).map_err(|e| e.to_string())? {
            path_parts.push(folder.name);
            current_id = folder.parent_id;
        } else {
            break;
        }
    }
    
    path_parts.reverse();
    Ok(path_parts.join("/"))
}

/// Execute the append_content_to_note tool
/// 
/// This writes content directly to the markdown FILE first (source of truth),
/// then syncs from file to database. This prevents race conditions with the
/// frontend editor autosave.
pub fn execute_append_content_to_note(
    pool: &DbPool,
    args: serde_json::Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Get content (required)
    let new_content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'content' argument")?;

    if new_content.trim().is_empty() {
        return Err("Content cannot be empty".to_string());
    }

    // Get position (default to end)
    let position = args
        .get("position")
        .and_then(|v| v.as_str())
        .unwrap_or("end");

    // Find the note by ID or title (we need note metadata to find the file)
    let note = if let Some(note_id) = args.get("note_id").and_then(|v| v.as_str()) {
        if note_id.is_empty() {
            return Err("note_id cannot be empty".to_string());
        }
        db::notes::get_note(&conn, note_id)
            .map_err(|e| format!("Failed to get note: {}", e))?
            .ok_or_else(|| format!("Note with ID '{}' not found", note_id))?
    } else if let Some(title) = args.get("note_title").and_then(|v| v.as_str()) {
        let notes = db::notes::get_all_notes(&conn)
            .map_err(|e| format!("Failed to get notes: {}", e))?;
        
        let found = notes.iter()
            .find(|n| n.title.to_lowercase() == title.to_lowercase())
            .or_else(|| notes.iter().find(|n| n.title.to_lowercase().contains(&title.to_lowercase())))
            .cloned();
        
        found.ok_or_else(|| format!("No note found with title matching '{}'", title))?
    } else {
        return Err("Either 'note_id' or 'note_title' must be provided".to_string());
    };

    // Get the notes directory and build file path
    let notes_dir = vault_config::get_notes_dir().map_err(|e| e.to_string())?;
    
    let folder_path = if let Some(ref folder_id) = note.folder_id {
        Some(build_folder_path(&conn, folder_id)?)
    } else {
        None
    };
    
    let file_path = markdown::get_note_path(&notes_dir, &note.title, folder_path.as_deref());
    
    // Read current content from file (source of truth)
    let existing_content = if file_path.exists() {
        match markdown::parse_markdown_file(&file_path) {
            Ok(parsed) => parsed.content,
            Err(e) => {
                log::warn!("[AppendContentToNote] Could not parse file, using DB content: {}", e);
                note.content.clone().unwrap_or_default()
            }
        }
    } else {
        // File doesn't exist, use DB content as fallback
        note.content.clone().unwrap_or_default()
    };
    
    // Combine content based on position
    let combined_content = match position {
        "beginning" => {
            if existing_content.is_empty() {
                new_content.to_string()
            } else {
                format!("{}\n\n{}", new_content, existing_content)
            }
        }
        _ => {
            if existing_content.is_empty() {
                new_content.to_string()
            } else {
                format!("{}{}", existing_content, new_content)
            }
        }
    };

    // Get folder name for frontmatter
    let folder_name = if let Some(ref folder_id) = note.folder_id {
        folders::get_folder(&conn, folder_id)
            .map_err(|e| e.to_string())?
            .map(|f| f.name)
    } else {
        None
    };

    // Write directly to the file (this is the source of truth)
    markdown::write_note_file(
        &file_path,
        &note.id,
        &note.title,
        Some(&combined_content),
        note.folder_id.as_deref(),
        folder_name.as_deref(),
        note.created_at,
        Utc::now(), // Update the timestamp
    ).map_err(|e| format!("Failed to write to file: {}", e))?;
    
    log::info!(
        "[AppendContentToNote] Wrote {} chars to file: {:?}",
        new_content.len(),
        file_path
    );

    // Now sync from file to database (file is source of truth)
    let updated_note = vault_sync::sync_file_to_note(pool, &file_path)
        .map_err(|e| format!("Failed to sync file to database: {}", e))?;

    log::info!(
        "[AppendContentToNote] Added {} chars to note '{}' (ID: {}) at {} - file is source of truth",
        new_content.len(),
        note.title,
        note.id,
        position
    );

    Ok(json!({
        "success": true,
        "message": format!("Content added to note: {}", note.title),
        "note": {
            "id": updated_note.id,
            "title": updated_note.title,
            "position": position,
            "chars_added": new_content.len()
        }
    }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_append_to_note_tool() {
        let tool = get_append_to_note_tool();
        assert_eq!(tool.function.name, "append_to_note");
        assert!(tool.function.description.contains("Append"));
    }

    #[test]
    fn test_get_append_content_to_note_tool() {
        let tool = get_append_content_to_note_tool();
        assert_eq!(tool.function.name, "append_content_to_note");
        assert!(tool.function.description.contains("Append"));
        assert!(tool.function.description.contains("note"));
    }
}
