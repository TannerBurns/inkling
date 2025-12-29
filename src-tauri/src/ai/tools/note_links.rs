//! Note Links Tool
//!
//! Retrieves backlinks and outgoing links for a note.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool, links};

/// Link information for tool results
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInfo {
    pub note_id: String,
    pub title: String,
    pub context: Option<String>,
}

/// Result of getting note links
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinksResult {
    pub note_id: String,
    pub note_title: String,
    pub backlinks: Vec<LinkInfo>,
    pub outgoing_links: Vec<LinkInfo>,
}

/// Get the tool definition for get_note_links
pub fn get_note_links_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_note_links",
        "Get all links to and from a specific note. Returns both backlinks (notes that link TO this note) and outgoing links (notes this note links TO).",
        json!({
            "type": "object",
            "properties": {
                "note_id": {
                    "type": "string",
                    "description": "The unique ID of the note to get links for"
                },
                "title": {
                    "type": "string",
                    "description": "The title of the note (used if note_id is not provided)"
                }
            },
            "required": []
        }),
    )
}

/// Execute the get_note_links tool
pub fn execute_get_note_links(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Resolve note ID
    let (note_id, note_title) = if let Some(id) = args.get("note_id").and_then(|v| v.as_str()) {
        let note = db::notes::get_note(&conn, id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Note with ID '{}' not found", id))?;
        (note.id, note.title)
    } else if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
        let notes = db::notes::get_all_notes(&conn).map_err(|e| e.to_string())?;
        let note = notes.iter()
            .find(|n| n.title.to_lowercase() == title.to_lowercase())
            .or_else(|| notes.iter().find(|n| n.title.to_lowercase().contains(&title.to_lowercase())))
            .ok_or_else(|| format!("No note found with title matching '{}'", title))?;
        (note.id.clone(), note.title.clone())
    } else {
        return Err("Either 'note_id' or 'title' must be provided".to_string());
    };

    // Get backlinks
    let backlinks_raw = links::get_backlinks(&conn, &note_id)
        .map_err(|e| e.to_string())?;
    
    let backlinks: Vec<LinkInfo> = backlinks_raw.into_iter().map(|bl| LinkInfo {
        note_id: bl.source_note_id,
        title: bl.source_title,
        context: bl.context,
    }).collect();

    // Get outgoing links
    let outgoing_raw = links::get_outgoing_links(&conn, &note_id)
        .map_err(|e| e.to_string())?;
    
    let mut outgoing_links: Vec<LinkInfo> = Vec::new();
    for link in outgoing_raw {
        // Get the target note's title
        if let Ok(Some(target_note)) = db::notes::get_note(&conn, &link.target_note_id) {
            if !target_note.is_deleted {
                outgoing_links.push(LinkInfo {
                    note_id: link.target_note_id,
                    title: target_note.title,
                    context: link.context,
                });
            }
        }
    }

    let result = NoteLinksResult {
        note_id,
        note_title,
        backlinks,
        outgoing_links,
    };

    Ok(json!({
        "success": true,
        "links": result,
        "backlink_count": result.backlinks.len(),
        "outgoing_link_count": result.outgoing_links.len()
    }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_note_links_tool() {
        let tool = get_note_links_tool();
        assert_eq!(tool.function.name, "get_note_links");
        assert!(tool.function.description.contains("backlinks"));
    }
}

