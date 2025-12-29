//! Fetch URL Tool
//!
//! Fetches and reads full content from any URL. Unlike read_url_content which
//! only reads from already-indexed URLs, this tool fetches fresh content from
//! any web URL - useful for deep research where you need to read pages
//! discovered during web search.

use serde_json::{json, Value};

use super::super::agent::ToolDefinition;
use super::super::url_scraper::{scrape_url, ScrapeError};

/// Maximum content length to return to the agent (to avoid context overflow)
const MAX_CONTENT_FOR_AGENT: usize = 50_000;

/// Get the tool definition for fetch_url
pub fn get_fetch_url_tool() -> ToolDefinition {
    ToolDefinition::function(
        "fetch_url",
        "Fetch and read the full content from any web URL. Use this to read complete articles, documentation, or web pages discovered through web_search. Returns the page title, main content, and important links found on the page.",
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL to fetch (must start with http:// or https://)"
                }
            },
            "required": ["url"]
        }),
    )
}

/// Execute the fetch_url tool
pub async fn execute_fetch_url(args: Value) -> Result<String, String> {
    let url = args
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'url' argument")?;

    log::info!("[FetchUrl] Fetching URL: {}", url);

    // Validate URL format
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    // Scrape the URL using existing infrastructure
    let scraped = scrape_url(url).await.map_err(|e| match e {
        ScrapeError::FetchError(msg) => format!("Failed to fetch URL: {}", msg),
        ScrapeError::NotHtml(content_type) => {
            format!("URL is not an HTML page (content-type: {})", content_type)
        }
        ScrapeError::TooLarge(size) => format!("Page is too large: {} bytes", size),
        ScrapeError::ParseError(msg) => format!("Failed to parse page: {}", msg),
        ScrapeError::InvalidUrl(msg) => format!("Invalid URL: {}", msg),
    })?;

    // Truncate content if too long
    let content = if scraped.content.len() > MAX_CONTENT_FOR_AGENT {
        format!(
            "{}...\n\n[Content truncated - showing first {} of {} characters]",
            &scraped.content[..MAX_CONTENT_FOR_AGENT],
            MAX_CONTENT_FOR_AGENT,
            scraped.content.len()
        )
    } else {
        scraped.content
    };

    // Take only the first 10 most relevant links
    let links: Vec<_> = scraped
        .links
        .into_iter()
        .take(10)
        .map(|link| {
            json!({
                "text": link.text,
                "url": link.url
            })
        })
        .collect();

    log::info!(
        "[FetchUrl] Successfully fetched: title={:?}, content_len={}, links={}",
        scraped.title,
        content.len(),
        links.len()
    );

    Ok(json!({
        "success": true,
        "url": url,
        "title": scraped.title,
        "description": scraped.description,
        "site_name": scraped.site_name,
        "content": content,
        "links": links
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_fetch_url_tool() {
        let tool = get_fetch_url_tool();
        assert_eq!(tool.function.name, "fetch_url");
        assert!(tool.function.description.contains("full content"));
    }

    #[tokio::test]
    async fn test_execute_fetch_url_invalid_url() {
        let result = execute_fetch_url(json!({"url": "not-a-url"})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must start with"));
    }

    #[tokio::test]
    async fn test_execute_fetch_url_missing_url() {
        let result = execute_fetch_url(json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing"));
    }
}

