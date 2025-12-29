//! Note Tags Tools
//!
//! Tools for accessing tag information on notes and finding notes by tag.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// A tag result for the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagResult {
    pub name: String,
    pub color: Option<String>,
}

/// A note result with tag context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWithTagsResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
}

// ============================================================================
// get_note_tags Tool
// ============================================================================

/// Get the tool definition for get_note_tags
pub fn get_note_tags_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_note_tags",
        "Get all tags assigned to a specific note. Useful for understanding how a note is categorized.",
        json!({
            "type": "object",
            "properties": {
                "note_id": {
                    "type": "string",
                    "description": "The unique ID of the note"
                },
                "note_title": {
                    "type": "string",
                    "description": "The title of the note (used if note_id is not provided)"
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_note_tags tool
pub fn execute_get_note_tags(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Resolve note_id
    let note_id = if let Some(id) = args.get("note_id").and_then(|v| v.as_str()) {
        id.to_string()
    } else if let Some(title) = args.get("note_title").and_then(|v| v.as_str()) {
        // Find note by title
        let notes = db::notes::get_all_notes(&conn).map_err(|e| e.to_string())?;
        let note = notes.iter()
            .find(|n| n.title.to_lowercase() == title.to_lowercase())
            .or_else(|| notes.iter().find(|n| n.title.to_lowercase().contains(&title.to_lowercase())));
        
        match note {
            Some(n) => n.id.clone(),
            None => return Err(format!("No note found with title matching '{}'", title)),
        }
    } else {
        return Err("Either 'note_id' or 'note_title' must be provided".to_string());
    };

    // Get tags for the note
    let tags = db::tags::get_note_tags(&conn, &note_id)
        .map_err(|e| format!("Failed to get tags: {}", e))?;

    let tag_results: Vec<TagResult> = tags.iter()
        .map(|t| TagResult {
            name: t.name.clone(),
            color: t.color.clone(),
        })
        .collect();

    if tag_results.is_empty() {
        Ok(json!({
            "success": true,
            "note_id": note_id,
            "tags": [],
            "message": "This note has no tags"
        }).to_string())
    } else {
        Ok(json!({
            "success": true,
            "note_id": note_id,
            "tags": tag_results,
            "count": tag_results.len()
        }).to_string())
    }
}

// ============================================================================
// search_by_tag Tool
// ============================================================================

/// Get the tool definition for search_by_tag
pub fn get_search_by_tag_tool() -> ToolDefinition {
    ToolDefinition::function(
        "search_by_tag",
        "Find all notes that have a specific tag. Useful for discovering related content by category.",
        json!({
            "type": "object",
            "properties": {
                "tag_name": {
                    "type": "string",
                    "description": "The name of the tag to search for (case-insensitive)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of notes to return (default: 10, max: 20)",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 20
                }
            },
            "required": ["tag_name"]
        }),
    )
}

/// Execute the search_by_tag tool
pub fn execute_search_by_tag(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let tag_name = args
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'tag_name' argument")?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .min(20) as usize;

    // Find the tag by name (case-insensitive)
    let tag = db::tags::find_tag_by_name(&conn, tag_name)
        .map_err(|e| format!("Failed to find tag: {}", e))?;

    let tag = match tag {
        Some(t) => t,
        None => {
            // Try partial match
            let all_tags = db::tags::search_tags(&conn, tag_name)
                .map_err(|e| format!("Failed to search tags: {}", e))?;
            
            if all_tags.is_empty() {
                return Ok(json!({
                    "success": true,
                    "tag_name": tag_name,
                    "notes": [],
                    "message": format!("No tag found matching '{}'", tag_name)
                }).to_string());
            }
            
            // Use the first matching tag
            all_tags.into_iter().next().unwrap()
        }
    };

    // Get all notes with this tag using a direct query
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, n.content 
         FROM notes n
         INNER JOIN note_tags nt ON n.id = nt.note_id
         WHERE nt.tag_id = ?1 AND n.is_deleted = FALSE
         ORDER BY n.updated_at DESC
         LIMIT ?2"
    ).map_err(|e| format!("Query preparation failed: {}", e))?;

    let notes: Vec<NoteWithTagsResult> = stmt
        .query_map(rusqlite::params![tag.id, limit as i32], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let content: Option<String> = row.get(2)?;
            Ok((id, title, content))
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(id, title, content)| {
            let snippet = create_snippet(&content.unwrap_or_default(), 200);
            NoteWithTagsResult {
                note_id: id,
                title,
                snippet,
            }
        })
        .collect();

    Ok(json!({
        "success": true,
        "tag_name": tag.name,
        "tag_color": tag.color,
        "notes": notes,
        "count": notes.len()
    }).to_string())
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
    fn test_get_note_tags_tool() {
        let tool = get_note_tags_tool();
        assert_eq!(tool.function.name, "get_note_tags");
        assert!(tool.function.description.contains("tags"));
    }

    #[test]
    fn test_get_search_by_tag_tool() {
        let tool = get_search_by_tag_tool();
        assert_eq!(tool.function.name, "search_by_tag");
        assert!(tool.function.description.contains("tag"));
    }

    #[test]
    fn test_create_snippet() {
        let short = "Hello world";
        assert_eq!(create_snippet(short, 100), short);

        let long = "This is a long piece of content that should be truncated at a word boundary";
        let snippet = create_snippet(long, 40);
        assert!(snippet.ends_with("..."));
        assert!(snippet.len() <= 45);
    }
}

