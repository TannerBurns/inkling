//! Search Notes Tool
//!
//! Wraps the existing semantic search functionality to allow agents
//! to search through the user's notes.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::ai::config::AIProvider;
use crate::ai::{generate_embedding_direct, load_ai_config};
use crate::db::{self, connection::DbPool, embeddings::search_similar};

/// Result of searching notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
}

/// Get the tool definition for search_notes
pub fn get_search_notes_tool() -> ToolDefinition {
    ToolDefinition::function(
        "search_notes",
        "Search through the user's notes and their attached documents (PDFs, text files, Word docs, spreadsheets) using semantic search. Returns matching notes with titles and content snippets. This searches the full text content of notes AND any files attached to them.",
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query - describe what you're looking for in notes and attached documents"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default: 5, max: 10)",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 10
                }
            },
            "required": ["query"]
        }),
    )
}

/// Execute the search_notes tool
///
/// This function performs semantic search on the user's notes using embeddings.
pub async fn execute_search_notes(
    pool: &DbPool,
    _provider: &AIProvider,
    args: Value,
) -> Result<String, String> {
    // Parse arguments
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'query' argument")?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .min(10) as usize;

    if query.trim().is_empty() {
        return Err("Query cannot be empty".to_string());
    }

    // Get embedding model, provider URL, and API key from config
    let (embedding_model, provider_url, api_key) = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let config = load_ai_config(&conn)?;
        let embedding_provider = config.providers.iter()
            .find(|p| p.id == config.embedding.provider);
        let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
        let api_key = embedding_provider.and_then(|p| p.api_key.clone());
        (config.embedding.full_model_id(), provider_url, api_key)
    };

    // Generate embedding for the query using the provider URL directly
    let query_embedding = generate_embedding_direct(query, &embedding_model, provider_url.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| format!("Failed to generate embedding: {}", e))?;

    // Search for similar notes
    let conn = pool.get().map_err(|e| e.to_string())?;
    let similar_notes = search_similar(&conn, &query_embedding.embedding, limit, Some(0.3))
        .map_err(|e| format!("Search failed: {}", e))?;

    if similar_notes.is_empty() {
        return Ok(json!({
            "results": [],
            "message": "No matching notes found"
        })
        .to_string());
    }

    // Fetch note details and create results
    let mut results: Vec<NoteSearchResult> = Vec::new();

    for similar in similar_notes {
        if let Ok(Some(note)) = db::notes::get_note(&conn, &similar.note_id) {
            let content = note.content.unwrap_or_default();
            let snippet = create_snippet(&content, 300);

            results.push(NoteSearchResult {
                note_id: similar.note_id,
                title: note.title,
                snippet,
                score: similar.score,
            });
        }
    }

    Ok(json!({
        "results": results,
        "count": results.len(),
        "query": query
    })
    .to_string())
}

/// Create a snippet from content, preserving word boundaries
fn create_snippet(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        return content.to_string();
    }

    // Find a good break point
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
    fn test_get_search_notes_tool() {
        let tool = get_search_notes_tool();
        assert_eq!(tool.function.name, "search_notes");
        assert!(tool.function.description.contains("Search"));
    }

    #[test]
    fn test_create_snippet() {
        let short = "Hello world";
        assert_eq!(create_snippet(short, 100), short);

        let long = "This is a very long piece of content that should be truncated at a word boundary for readability";
        let snippet = create_snippet(long, 50);
        assert!(snippet.ends_with("..."));
        assert!(snippet.len() <= 55); // 50 + "..."
    }
}
