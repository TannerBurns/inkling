//! Read URL Content Tool
//!
//! Retrieves the full scraped content from a URL attachment.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{connection::DbPool, url_attachments};

/// Result of reading URL content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadUrlResult {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub site_name: Option<String>,
    pub note_id: String,
}

/// Get the tool definition for read_url_content
pub fn get_read_url_content_tool() -> ToolDefinition {
    ToolDefinition::function(
        "read_url_content",
        "Get the full scraped content from an indexed web page. Use search_url_embeddings first to find available URLs, then use the url_attachment_id from those results to read the full content. This returns the complete text content that was extracted from the web page when it was indexed.",
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to read content from (flexible matching with different formats)"
                },
                "url_attachment_id": {
                    "type": "string",
                    "description": "The ID of the URL attachment (preferred - get this from search_url_embeddings results)"
                }
            },
            "required": []
        }),
    )
}

/// Execute the read_url_content tool
pub fn execute_read_url_content(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Try to get by URL attachment ID first
    if let Some(attachment_id) = args.get("url_attachment_id").and_then(|v| v.as_str()) {
        if let Ok(Some(attachment)) = url_attachments::get_url_attachment(&conn, attachment_id) {
            let content = attachment.content.ok_or("URL has not been indexed yet")?;
            return Ok(json!({
                "success": true,
                "url_content": ReadUrlResult {
                    url: attachment.url,
                    title: attachment.title,
                    description: attachment.description,
                    content,
                    site_name: attachment.site_name,
                    note_id: attachment.note_id,
                }
            }).to_string());
        } else {
            return Err(format!("URL attachment with ID '{}' not found", attachment_id));
        }
    }

    // Try to find by URL
    if let Some(url) = args.get("url").and_then(|v| v.as_str()) {
        log::debug!("[read_url_content] Searching for URL: {}", url);
        
        match url_attachments::get_url_attachments_by_url(&conn, url) {
            Ok(attachments) => {
                if let Some(attachment) = attachments.first() {
                    log::debug!(
                        "[read_url_content] Found matching URL attachment: id={}, url={}",
                        attachment.id,
                        attachment.url
                    );
                    let content = attachment.content.clone().ok_or_else(|| {
                        format!(
                            "URL '{}' was found but has not been indexed yet (status: {:?})",
                            url,
                            attachment.status
                        )
                    })?;
                    return Ok(json!({
                        "success": true,
                        "url_content": ReadUrlResult {
                            url: attachment.url.clone(),
                            title: attachment.title.clone(),
                            description: attachment.description.clone(),
                            content,
                            site_name: attachment.site_name.clone(),
                            note_id: attachment.note_id.clone(),
                        }
                    }).to_string());
                }
                log::warn!(
                    "[read_url_content] No indexed URL found matching '{}'. Use search_url_embeddings first to find available URLs.",
                    url
                );
            }
            Err(e) => {
                log::error!("[read_url_content] Database error searching for URL '{}': {}", url, e);
                return Err(format!("Failed to search for URL '{}': {}", url, e));
            }
        }
        return Err(format!(
            "No indexed URL found matching '{}'. Tip: Use search_url_embeddings tool first to find available indexed URLs, then use the url_attachment_id from the results.",
            url
        ));
    }

    Err("Either 'url' or 'url_attachment_id' must be provided".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_read_url_content_tool() {
        let tool = get_read_url_content_tool();
        assert_eq!(tool.function.name, "read_url_content");
        assert!(tool.function.description.contains("scraped content"));
    }
}

