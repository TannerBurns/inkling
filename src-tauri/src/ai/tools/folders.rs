//! Folder Tools
//!
//! Tools for browsing folder structure and getting notes in folders.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// A folder result for the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderResult {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub note_count: i32,
    pub subfolder_count: i32,
}

/// A note in folder result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInFolderResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub updated_at: String,
}

// ============================================================================
// list_folders Tool
// ============================================================================

/// Get the tool definition for list_folders
pub fn get_list_folders_tool() -> ToolDefinition {
    ToolDefinition::function(
        "list_folders",
        "List folders in the vault. Can list all folders or children of a specific folder. Useful for understanding how notes are organized.",
        json!({
            "type": "object",
            "properties": {
                "parent_id": {
                    "type": "string",
                    "description": "Optional parent folder ID. If not provided, lists root folders. Use 'all' to list all folders."
                },
                "include_counts": {
                    "type": "boolean",
                    "description": "Whether to include note and subfolder counts (default: true)",
                    "default": true
                }
            },
            "required": []
        }),
    )
}

/// Execute the list_folders tool
pub fn execute_list_folders(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let parent_id = args.get("parent_id").and_then(|v| v.as_str());
    let include_counts = args
        .get("include_counts")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let folders = if parent_id == Some("all") {
        // Get all folders
        db::folders::get_all_folders(&conn)
            .map_err(|e| format!("Failed to get folders: {}", e))?
    } else {
        // Get child folders (or root folders if parent_id is None)
        db::folders::get_child_folders(&conn, parent_id)
            .map_err(|e| format!("Failed to get folders: {}", e))?
    };

    let folder_results: Vec<FolderResult> = folders
        .iter()
        .map(|f| {
            let (note_count, subfolder_count) = if include_counts {
                let notes = db::notes::get_notes_in_folder(&conn, Some(&f.id))
                    .map(|n| n.len() as i32)
                    .unwrap_or(0);
                let subfolders = db::folders::get_child_folders(&conn, Some(&f.id))
                    .map(|s| s.len() as i32)
                    .unwrap_or(0);
                (notes, subfolders)
            } else {
                (0, 0)
            };

            FolderResult {
                id: f.id.clone(),
                name: f.name.clone(),
                parent_id: f.parent_id.clone(),
                note_count,
                subfolder_count,
            }
        })
        .collect();

    if folder_results.is_empty() {
        let message = match parent_id {
            Some("all") => "No folders exist in the vault",
            Some(_) => "No subfolders found in this folder",
            None => "No root folders found",
        };
        
        Ok(json!({
            "success": true,
            "folders": [],
            "message": message
        }).to_string())
    } else {
        Ok(json!({
            "success": true,
            "folders": folder_results,
            "count": folder_results.len()
        }).to_string())
    }
}

// ============================================================================
// get_notes_in_folder Tool
// ============================================================================

/// Get the tool definition for get_notes_in_folder
pub fn get_notes_in_folder_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_notes_in_folder",
        "Get all notes in a specific folder. Useful for browsing notes by their organization structure.",
        json!({
            "type": "object",
            "properties": {
                "folder_id": {
                    "type": "string",
                    "description": "The ID of the folder. Use null or omit to get unfiled (root) notes."
                },
                "folder_name": {
                    "type": "string",
                    "description": "The name of the folder to find (used if folder_id is not provided)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of notes to return (default: 20, max: 50)",
                    "default": 20,
                    "minimum": 1,
                    "maximum": 50
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_notes_in_folder tool
pub fn execute_get_notes_in_folder(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .min(50) as usize;

    // Resolve folder_id
    let folder_id = if let Some(id) = args.get("folder_id").and_then(|v| v.as_str()) {
        if id.is_empty() || id == "null" {
            None
        } else {
            Some(id.to_string())
        }
    } else if let Some(name) = args.get("folder_name").and_then(|v| v.as_str()) {
        // Find folder by name
        let folders = db::folders::get_all_folders(&conn)
            .map_err(|e| format!("Failed to get folders: {}", e))?;
        
        let folder = folders.iter()
            .find(|f| f.name.to_lowercase() == name.to_lowercase())
            .or_else(|| folders.iter().find(|f| f.name.to_lowercase().contains(&name.to_lowercase())));
        
        match folder {
            Some(f) => Some(f.id.clone()),
            None => return Err(format!("No folder found with name matching '{}'", name)),
        }
    } else {
        // Get unfiled notes
        None
    };

    // Get folder name for response
    let folder_name = if let Some(ref id) = folder_id {
        db::folders::get_folder(&conn, id)
            .ok()
            .flatten()
            .map(|f| f.name)
    } else {
        Some("Unfiled".to_string())
    };

    // Get notes in folder
    let notes = db::notes::get_notes_in_folder(&conn, folder_id.as_deref())
        .map_err(|e| format!("Failed to get notes: {}", e))?;

    let note_results: Vec<NoteInFolderResult> = notes
        .into_iter()
        .take(limit)
        .map(|n| {
            let snippet = create_snippet(&n.content.unwrap_or_default(), 200);
            NoteInFolderResult {
                note_id: n.id,
                title: n.title,
                snippet,
                updated_at: n.updated_at.to_rfc3339(),
            }
        })
        .collect();

    if note_results.is_empty() {
        Ok(json!({
            "success": true,
            "folder_name": folder_name,
            "folder_id": folder_id,
            "notes": [],
            "message": format!("No notes in folder '{}'", folder_name.unwrap_or_default())
        }).to_string())
    } else {
        Ok(json!({
            "success": true,
            "folder_name": folder_name,
            "folder_id": folder_id,
            "notes": note_results,
            "count": note_results.len()
        }).to_string())
    }
}

/// Create a snippet from content
fn create_snippet(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        return content.to_string();
    }

    let truncated = &content[..max_len];
    if let Some(pos) = truncated.rfind(|c: char| c.is_whitespace() || c == '.') {
        format!("{}...", &truncated[..pos].trim())
    } else {
        format!("{}...", truncated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_list_folders_tool() {
        let tool = get_list_folders_tool();
        assert_eq!(tool.function.name, "list_folders");
        assert!(tool.function.description.contains("folder"));
    }

    #[test]
    fn test_get_notes_in_folder_tool() {
        let tool = get_notes_in_folder_tool();
        assert_eq!(tool.function.name, "get_notes_in_folder");
        assert!(tool.function.description.contains("notes"));
    }

    #[test]
    fn test_create_snippet() {
        let short = "Hello world";
        assert_eq!(create_snippet(short, 100), short);

        let long = "This is a long piece of content that should be truncated";
        let snippet = create_snippet(long, 30);
        assert!(snippet.ends_with("..."));
    }
}

