//! Recent Notes Tool
//!
//! Tool for getting recently modified notes.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::connection::DbPool;

/// A recent note result for the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentNoteResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub updated_at: String,
    pub folder_id: Option<String>,
}

// ============================================================================
// get_recent_notes Tool
// ============================================================================

/// Get the tool definition for get_recent_notes
pub fn get_recent_notes_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_recent_notes",
        "Get recently modified notes. Useful for understanding what the user has been working on recently.",
        json!({
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of notes to return (default: 10, max: 25)",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 25
                },
                "days": {
                    "type": "integer",
                    "description": "Only include notes modified within the last N days (default: no limit)",
                    "minimum": 1
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_recent_notes tool
pub fn execute_get_recent_notes(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .min(25) as i32;

    let days = args.get("days").and_then(|v| v.as_u64()).map(|d| d as i32);

    // Build the query based on whether we have a days filter
    let query = if let Some(days_limit) = days {
        format!(
            "SELECT id, title, content, folder_id, updated_at 
             FROM notes 
             WHERE is_deleted = FALSE 
               AND updated_at >= datetime('now', '-{} days')
             ORDER BY updated_at DESC 
             LIMIT {}",
            days_limit, limit
        )
    } else {
        format!(
            "SELECT id, title, content, folder_id, updated_at 
             FROM notes 
             WHERE is_deleted = FALSE 
             ORDER BY updated_at DESC 
             LIMIT {}",
            limit
        )
    };

    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Query preparation failed: {}", e))?;

    let notes: Vec<RecentNoteResult> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let content: Option<String> = row.get(2)?;
            let folder_id: Option<String> = row.get(3)?;
            let updated_at: String = row.get(4)?;
            Ok((id, title, content, folder_id, updated_at))
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(id, title, content, folder_id, updated_at)| {
            let snippet = create_snippet(&content.unwrap_or_default(), 200);
            RecentNoteResult {
                note_id: id,
                title,
                snippet,
                updated_at,
                folder_id,
            }
        })
        .collect();

    if notes.is_empty() {
        let message = if let Some(d) = days {
            format!("No notes modified in the last {} days", d)
        } else {
            "No notes found".to_string()
        };
        
        Ok(json!({
            "success": true,
            "notes": [],
            "message": message
        }).to_string())
    } else {
        Ok(json!({
            "success": true,
            "notes": notes,
            "count": notes.len()
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
    fn test_get_recent_notes_tool() {
        let tool = get_recent_notes_tool();
        assert_eq!(tool.function.name, "get_recent_notes");
        assert!(tool.function.description.contains("recent"));
    }

    #[test]
    fn test_create_snippet() {
        let short = "Hello world";
        assert_eq!(create_snippet(short, 100), short);

        let long = "This is a long piece of content that should be truncated at a word boundary";
        let snippet = create_snippet(long, 40);
        assert!(snippet.ends_with("..."));
    }
}

