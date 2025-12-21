//! Web Search Tool
//!
//! Provides web search functionality using various providers:
//! - Brave Search API
//! - Serper (Google Search)
//! - Tavily Search API

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{WebSearchConfig, WebSearchProvider};

/// Maximum number of results to return
const MAX_RESULTS: usize = 5;

/// Result from a web search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// Execute a web search using the configured provider
pub async fn execute_web_search(
    config: &WebSearchConfig,
    query: &str,
) -> Result<Vec<WebSearchResult>, String> {
    if !config.is_configured() {
        return Err("Web search is not configured. Please set up an API key in Settings.".to_string());
    }

    let api_key = config.api_key.as_ref().ok_or("Missing API key")?;

    match config.provider {
        WebSearchProvider::Brave => search_brave(api_key, query).await,
        WebSearchProvider::Serper => search_serper(api_key, query).await,
        WebSearchProvider::Tavily => search_tavily(api_key, query).await,
        WebSearchProvider::None => Err("No web search provider configured".to_string()),
    }
}

/// Format search results as a JSON string for the agent
pub fn format_results_for_agent(results: &[WebSearchResult]) -> String {
    json!({
        "success": true,
        "results": results,
        "count": results.len()
    })
    .to_string()
}

// ============================================================================
// Brave Search API
// ============================================================================

/// Brave Search API response
#[derive(Debug, Deserialize)]
struct BraveSearchResponse {
    web: Option<BraveWebResults>,
}

#[derive(Debug, Deserialize)]
struct BraveWebResults {
    results: Vec<BraveWebResult>,
}

#[derive(Debug, Deserialize)]
struct BraveWebResult {
    title: String,
    url: String,
    description: String,
}

async fn search_brave(api_key: &str, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let client = Client::new();

    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .query(&[("q", query), ("count", &MAX_RESULTS.to_string())])
        .send()
        .await
        .map_err(|e| format!("Brave Search request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Brave Search API error ({}): {}", status, body));
    }

    let data: BraveSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Brave Search response: {}", e))?;

    let results = data
        .web
        .map(|w| {
            w.results
                .into_iter()
                .take(MAX_RESULTS)
                .map(|r| WebSearchResult {
                    title: r.title,
                    url: r.url,
                    snippet: r.description,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}

// ============================================================================
// Serper (Google Search) API
// ============================================================================

/// Serper API response
#[derive(Debug, Deserialize)]
struct SerperSearchResponse {
    organic: Option<Vec<SerperOrganicResult>>,
}

#[derive(Debug, Deserialize)]
struct SerperOrganicResult {
    title: String,
    link: String,
    snippet: Option<String>,
}

async fn search_serper(api_key: &str, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let client = Client::new();

    let response = client
        .post("https://google.serper.dev/search")
        .header("X-API-KEY", api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "q": query,
            "num": MAX_RESULTS
        }))
        .send()
        .await
        .map_err(|e| format!("Serper request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Serper API error ({}): {}", status, body));
    }

    let data: SerperSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Serper response: {}", e))?;

    let results = data
        .organic
        .map(|organic| {
            organic
                .into_iter()
                .take(MAX_RESULTS)
                .map(|r| WebSearchResult {
                    title: r.title,
                    url: r.link,
                    snippet: r.snippet.unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}

// ============================================================================
// Tavily Search API
// ============================================================================

/// Tavily API response
#[derive(Debug, Deserialize)]
struct TavilySearchResponse {
    results: Option<Vec<TavilyResult>>,
}

#[derive(Debug, Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    content: String,
}

async fn search_tavily(api_key: &str, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let client = Client::new();

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "max_results": MAX_RESULTS,
            "include_answer": false,
            "include_raw_content": false
        }))
        .send()
        .await
        .map_err(|e| format!("Tavily request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Tavily API error ({}): {}", status, body));
    }

    let data: TavilySearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Tavily response: {}", e))?;

    let results = data
        .results
        .map(|results| {
            results
                .into_iter()
                .take(MAX_RESULTS)
                .map(|r| WebSearchResult {
                    title: r.title,
                    url: r.url,
                    snippet: r.content,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}

// ============================================================================
// Tool Definition
// ============================================================================

use super::super::agent::ToolDefinition;

/// Get the web search tool definition for agents
pub fn get_web_search_tool() -> ToolDefinition {
    ToolDefinition::function(
        "web_search",
        "Search the web for current information on a topic. Returns relevant results with titles, URLs, and snippets. Use this to find up-to-date information that may not be in the user's notes.",
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant information"
                }
            },
            "required": ["query"]
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_results() {
        let results = vec![
            WebSearchResult {
                title: "Test Title".to_string(),
                url: "https://example.com".to_string(),
                snippet: "Test snippet".to_string(),
            },
        ];

        let formatted = format_results_for_agent(&results);
        assert!(formatted.contains("success"));
        assert!(formatted.contains("Test Title"));
    }

    #[test]
    fn test_web_search_config_not_configured() {
        let config = WebSearchConfig::default();
        assert!(!config.is_configured());
    }

    #[test]
    fn test_web_search_config_configured() {
        let config = WebSearchConfig {
            provider: WebSearchProvider::Brave,
            api_key: Some("test-key".to_string()),
        };
        assert!(config.is_configured());
    }
}
