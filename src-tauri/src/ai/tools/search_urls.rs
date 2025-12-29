//! Search URL Embeddings Tool
//!
//! Semantic search across URL attachment content using embeddings.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::ai::{generate_embedding_direct, load_ai_config};
use crate::db::{connection::DbPool, url_attachments};

/// Result of searching URL attachments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSearchResult {
    pub url: String,
    pub title: Option<String>,
    pub note_id: String,
    pub note_title: String,
    pub snippet: String,
    pub score: f32,
}

/// Get the tool definition for search_url_embeddings
pub fn get_search_url_embeddings_tool() -> ToolDefinition {
    ToolDefinition::function(
        "search_url_embeddings",
        "Search through indexed web page content attached to notes. When users add URLs to their notes, the web page content is scraped and indexed for semantic search. Use this to find information from web sources the user has saved. Returns matching URLs with titles, snippets, and the note they're attached to. Use read_url_content to get the full content.",
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query - describe what you're looking for in web page content"
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

/// Execute the search_url_embeddings tool
pub async fn execute_search_url_embeddings(
    pool: &DbPool,
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

    // Get embedding model and config
    let (embedding_model, provider_url, api_key) = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let config = load_ai_config(&conn)?;
        let embedding_provider = config.providers.iter()
            .find(|p| p.id == config.embedding.provider);
        let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
        let api_key = embedding_provider.and_then(|p| p.api_key.clone());
        (config.embedding.full_model_id(), provider_url, api_key)
    };

    // Generate embedding for the query
    let query_embedding = generate_embedding_direct(query, &embedding_model, provider_url.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| format!("Failed to generate embedding: {}", e))?;

    // Search for similar URLs
    let conn = pool.get().map_err(|e| e.to_string())?;
    let similar_urls = url_attachments::search_similar_urls(&conn, &query_embedding.embedding, limit, Some(0.3))
        .map_err(|e| format!("Search failed: {}", e))?;

    if similar_urls.is_empty() {
        return Ok(json!({
            "results": [],
            "message": "No matching URL content found"
        })
        .to_string());
    }

    // Fetch URL details and create results
    let mut results: Vec<UrlSearchResult> = Vec::new();

    for similar in similar_urls {
        // Get the full URL attachment to access content
        if let Ok(Some(attachment)) = url_attachments::get_url_attachment(&conn, &similar.url_attachment_id) {
            // Get note title
            let note_title = crate::db::notes::get_note(&conn, &similar.note_id)
                .ok()
                .flatten()
                .map(|n| n.title)
                .unwrap_or_else(|| "Unknown Note".to_string());

            let content = attachment.content.unwrap_or_default();
            let snippet = create_snippet(&content, 300);

            results.push(UrlSearchResult {
                url: similar.url,
                title: similar.title,
                note_id: similar.note_id,
                note_title,
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
    fn test_get_search_url_embeddings_tool() {
        let tool = get_search_url_embeddings_tool();
        assert_eq!(tool.function.name, "search_url_embeddings");
        assert!(tool.function.description.contains("URL"));
    }
}

