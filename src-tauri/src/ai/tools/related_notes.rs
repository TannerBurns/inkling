//! Related Notes Tools
//!
//! Tools for discovering relationships between notes through semantic similarity
//! and shared categorization (tags).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// A related note result with similarity context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedNoteResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub similarity_score: f32,
}

/// A note result with shared tag context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWithSharedTagsResult {
    pub note_id: String,
    pub title: String,
    pub shared_tags: Vec<String>,
    pub snippet: String,
}

// ============================================================================
// get_related_notes Tool - Semantic Similarity
// ============================================================================

/// Get the tool definition for get_related_notes
pub fn get_related_notes_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_related_notes",
        "Find notes that are semantically similar to a given note. Uses embedding similarity to discover implicit connections.",
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
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of related notes to return (default: 5, max: 10)",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 10
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_related_notes tool
pub fn execute_get_related_notes(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Resolve note_id and get the source note
    let (note_id, source_title) = resolve_note(&conn, &args)?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .min(10) as usize;

    // Find semantically similar notes using embeddings
    let similar_notes = db::embeddings::search_similar_to_note(&conn, &note_id, limit, Some(0.3))
        .map_err(|e| format!("Similarity search failed: {}", e))?;

    if similar_notes.is_empty() {
        return Ok(json!({
            "success": true,
            "source_note": { "id": note_id, "title": source_title },
            "related_notes": [],
            "message": "No semantically similar notes found. The note may not have an embedding yet, or there are no sufficiently similar notes."
        }).to_string());
    }

    // Fetch note details for each similar note
    let mut results: Vec<RelatedNoteResult> = Vec::new();
    for similar in similar_notes {
        if let Ok(Some(note)) = db::notes::get_note(&conn, &similar.note_id) {
            let snippet = create_snippet(&note.content.unwrap_or_default(), 200);
            results.push(RelatedNoteResult {
                note_id: note.id,
                title: note.title,
                snippet,
                similarity_score: similar.score,
            });
        }
    }

    Ok(json!({
        "success": true,
        "source_note": { "id": note_id, "title": source_title },
        "related_notes": results,
        "count": results.len()
    }).to_string())
}

// ============================================================================
// get_notes_sharing_tags Tool - Shared Categorization
// ============================================================================

/// Get the tool definition for get_notes_sharing_tags
pub fn get_notes_sharing_tags_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_notes_sharing_tags",
        "Find notes that share one or more tags with a given note. Useful for discovering categorically related content.",
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
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of related notes to return (default: 10, max: 20)",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 20
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_notes_sharing_tags tool
pub fn execute_get_notes_sharing_tags(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Resolve note_id and get the source note
    let (note_id, source_title) = resolve_note(&conn, &args)?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .min(20) as i32;

    // Get the source note's tags first
    let source_tags = db::tags::get_note_tags(&conn, &note_id)
        .map_err(|e| format!("Failed to get note tags: {}", e))?;

    if source_tags.is_empty() {
        return Ok(json!({
            "success": true,
            "source_note": { "id": note_id, "title": source_title, "tags": [] },
            "related_notes": [],
            "message": "This note has no tags, so no categorically related notes can be found."
        }).to_string());
    }

    let source_tag_names: Vec<String> = source_tags.iter().map(|t| t.name.clone()).collect();

    // Find notes sharing tags with the source note
    // Uses a query that finds notes with overlapping tags, ordered by number of shared tags
    let mut stmt = conn.prepare(
        "SELECT DISTINCT n.id, n.title, n.content, 
                GROUP_CONCAT(t.name) as shared_tags
         FROM notes n
         INNER JOIN note_tags nt ON n.id = nt.note_id
         INNER JOIN tags t ON nt.tag_id = t.id
         WHERE nt.tag_id IN (
             SELECT tag_id FROM note_tags WHERE note_id = ?1
         )
         AND n.id != ?1
         AND n.is_deleted = FALSE
         GROUP BY n.id
         ORDER BY COUNT(nt.tag_id) DESC, n.updated_at DESC
         LIMIT ?2"
    ).map_err(|e| format!("Query preparation failed: {}", e))?;

    let notes: Vec<NoteWithSharedTagsResult> = stmt
        .query_map(rusqlite::params![note_id, limit], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let content: Option<String> = row.get(2)?;
            let shared_tags_str: Option<String> = row.get(3)?;
            Ok((id, title, content, shared_tags_str))
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(id, title, content, shared_tags_str)| {
            let snippet = create_snippet(&content.unwrap_or_default(), 200);
            let shared_tags: Vec<String> = shared_tags_str
                .unwrap_or_default()
                .split(',')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            NoteWithSharedTagsResult {
                note_id: id,
                title,
                shared_tags,
                snippet,
            }
        })
        .collect();

    if notes.is_empty() {
        return Ok(json!({
            "success": true,
            "source_note": { "id": note_id, "title": source_title, "tags": source_tag_names },
            "related_notes": [],
            "message": "No other notes share tags with this note."
        }).to_string());
    }

    Ok(json!({
        "success": true,
        "source_note": { "id": note_id, "title": source_title, "tags": source_tag_names },
        "related_notes": notes,
        "count": notes.len()
    }).to_string())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Resolve note_id from either note_id or note_title argument
/// Returns (note_id, note_title)
fn resolve_note(
    conn: &rusqlite::Connection,
    args: &Value,
) -> Result<(String, String), String> {
    if let Some(id) = args.get("note_id").and_then(|v| v.as_str()) {
        // Get the note to verify it exists and get the title
        let note = db::notes::get_note(conn, id)
            .map_err(|e| format!("Failed to get note: {}", e))?
            .ok_or_else(|| format!("No note found with id '{}'", id))?;
        Ok((note.id, note.title))
    } else if let Some(title) = args.get("note_title").and_then(|v| v.as_str()) {
        // Find note by title
        let notes = db::notes::get_all_notes(conn).map_err(|e| e.to_string())?;
        let note = notes.iter()
            .find(|n| n.title.to_lowercase() == title.to_lowercase())
            .or_else(|| notes.iter().find(|n| n.title.to_lowercase().contains(&title.to_lowercase())));
        
        match note {
            Some(n) => Ok((n.id.clone(), n.title.clone())),
            None => Err(format!("No note found with title matching '{}'", title)),
        }
    } else {
        Err("Either 'note_id' or 'note_title' must be provided".to_string())
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
    fn test_get_related_notes_tool() {
        let tool = get_related_notes_tool();
        assert_eq!(tool.function.name, "get_related_notes");
        assert!(tool.function.description.contains("semantically similar"));
    }

    #[test]
    fn test_get_notes_sharing_tags_tool() {
        let tool = get_notes_sharing_tags_tool();
        assert_eq!(tool.function.name, "get_notes_sharing_tags");
        assert!(tool.function.description.contains("share"));
        assert!(tool.function.description.contains("tags"));
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

