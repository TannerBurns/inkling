//! URL Content Scraper
//!
//! Fetches and parses web content from URLs, extracting:
//! - Page title
//! - Meta description
//! - Main article/page content
//! - Outbound links
//!
//! Uses a reader-mode approach to extract the main content while filtering
//! out navigation, ads, and other non-essential elements.

use reqwest::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;

/// User agent to use for requests (identifies as a bot for transparency)
const USER_AGENT: &str = "InklingBot/1.0 (Personal knowledge management; +https://github.com/inkling)";

/// Request timeout in seconds
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// Maximum content length to fetch (10MB)
const MAX_CONTENT_LENGTH: usize = 10 * 1024 * 1024;

/// Maximum text length to extract (for embedding efficiency)
const MAX_TEXT_LENGTH: usize = 100_000;

/// Result of scraping a URL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedContent {
    /// The original URL
    pub url: String,
    /// Page title (from <title> or og:title)
    pub title: Option<String>,
    /// Meta description (from meta description or og:description)
    pub description: Option<String>,
    /// OG image URL for preview cards
    pub image_url: Option<String>,
    /// Favicon URL
    pub favicon_url: Option<String>,
    /// Site name (from og:site_name)
    pub site_name: Option<String>,
    /// Main content extracted from the page
    pub content: String,
    /// Outbound links found in the content
    pub links: Vec<ScrapedLink>,
}

/// A link found in the page content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedLink {
    /// The URL
    pub url: String,
    /// The link text
    pub text: String,
}

/// Error types for URL scraping
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ScrapeError {
    /// Failed to fetch the URL
    FetchError(String),
    /// Content type is not HTML
    NotHtml(String),
    /// Content is too large
    TooLarge(usize),
    /// Failed to parse HTML
    ParseError(String),
    /// URL is invalid
    InvalidUrl(String),
}

impl std::fmt::Display for ScrapeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScrapeError::FetchError(msg) => write!(f, "Fetch error: {}", msg),
            ScrapeError::NotHtml(content_type) => {
                write!(f, "Not an HTML page (content-type: {})", content_type)
            }
            ScrapeError::TooLarge(size) => write!(f, "Content too large: {} bytes", size),
            ScrapeError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            ScrapeError::InvalidUrl(msg) => write!(f, "Invalid URL: {}", msg),
        }
    }
}

impl std::error::Error for ScrapeError {}

/// Scrape content from a URL
pub async fn scrape_url(url: &str) -> Result<ScrapedContent, ScrapeError> {
    log::info!("[UrlScraper] Fetching URL: {}", url);

    // Validate URL
    let parsed_url = reqwest::Url::parse(url).map_err(|e| ScrapeError::InvalidUrl(e.to_string()))?;

    // Only allow http and https
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(ScrapeError::InvalidUrl(format!(
            "Unsupported scheme: {}",
            parsed_url.scheme()
        )));
    }

    // Build HTTP client with timeout and user agent
    let client = Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| ScrapeError::FetchError(e.to_string()))?;

    // Make the request
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| ScrapeError::FetchError(e.to_string()))?;

    // Check status
    if !response.status().is_success() {
        return Err(ScrapeError::FetchError(format!(
            "HTTP {} {}",
            response.status().as_u16(),
            response.status().as_str()
        )));
    }

    // Check content type
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        return Err(ScrapeError::NotHtml(content_type.to_string()));
    }

    // Check content length if available
    if let Some(len) = response.content_length() {
        if len as usize > MAX_CONTENT_LENGTH {
            return Err(ScrapeError::TooLarge(len as usize));
        }
    }

    // Get the response body
    let html = response
        .text()
        .await
        .map_err(|e| ScrapeError::FetchError(e.to_string()))?;

    if html.len() > MAX_CONTENT_LENGTH {
        return Err(ScrapeError::TooLarge(html.len()));
    }

    log::info!(
        "[UrlScraper] Fetched {} bytes, parsing HTML",
        html.len()
    );

    // Parse and extract content
    parse_html(url, &html)
}

/// Parse HTML and extract content
fn parse_html(url: &str, html: &str) -> Result<ScrapedContent, ScrapeError> {
    let document = Html::parse_document(html);

    // Extract title
    let title = extract_title(&document);

    // Extract description
    let description = extract_description(&document);

    // Extract OG image
    let image_url = extract_og_image(&document, url);

    // Extract favicon
    let favicon_url = extract_favicon(&document, url);

    // Extract site name
    let site_name = extract_meta_content(&document, "og:site_name");

    // Extract main content
    let content = extract_main_content(&document);

    // Extract links
    let links = extract_links(&document, url);

    log::info!(
        "[UrlScraper] Extracted title: {:?}, image: {:?}, content length: {}, links: {}",
        title,
        image_url,
        content.len(),
        links.len()
    );

    Ok(ScrapedContent {
        url: url.to_string(),
        title,
        description,
        image_url,
        favicon_url,
        site_name,
        content,
        links,
    })
}

/// Extract the page title
fn extract_title(document: &Html) -> Option<String> {
    // Try og:title first
    if let Some(og_title) = extract_meta_content(document, "og:title") {
        return Some(og_title);
    }

    // Fall back to <title> tag
    let title_selector = Selector::parse("title").ok()?;
    document
        .select(&title_selector)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Extract the page description
fn extract_description(document: &Html) -> Option<String> {
    // Try og:description first
    if let Some(og_desc) = extract_meta_content(document, "og:description") {
        return Some(og_desc);
    }

    // Try meta description
    if let Ok(selector) = Selector::parse("meta[name='description']") {
        if let Some(el) = document.select(&selector).next() {
            if let Some(content) = el.value().attr("content") {
                let desc = content.trim().to_string();
                if !desc.is_empty() {
                    return Some(desc);
                }
            }
        }
    }

    None
}

/// Extract meta content by property name
fn extract_meta_content(document: &Html, property: &str) -> Option<String> {
    let selector_str = format!("meta[property='{}']", property);
    if let Ok(selector) = Selector::parse(&selector_str) {
        if let Some(el) = document.select(&selector).next() {
            if let Some(content) = el.value().attr("content") {
                let text = content.trim().to_string();
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
    }
    None
}

/// Extract OG image URL from the page
fn extract_og_image(document: &Html, base_url: &str) -> Option<String> {
    // Try og:image first
    if let Some(og_image) = extract_meta_content(document, "og:image") {
        return resolve_url(&og_image, base_url);
    }

    // Try twitter:image
    if let Ok(selector) = Selector::parse("meta[name='twitter:image']") {
        if let Some(el) = document.select(&selector).next() {
            if let Some(content) = el.value().attr("content") {
                let url = content.trim();
                if !url.is_empty() {
                    return resolve_url(url, base_url);
                }
            }
        }
    }

    // Try twitter:image:src
    if let Ok(selector) = Selector::parse("meta[name='twitter:image:src']") {
        if let Some(el) = document.select(&selector).next() {
            if let Some(content) = el.value().attr("content") {
                let url = content.trim();
                if !url.is_empty() {
                    return resolve_url(url, base_url);
                }
            }
        }
    }

    None
}

/// Extract favicon URL from the page
fn extract_favicon(document: &Html, base_url: &str) -> Option<String> {
    // Try various favicon link relations
    let favicon_selectors = [
        "link[rel='icon']",
        "link[rel='shortcut icon']",
        "link[rel='apple-touch-icon']",
        "link[rel='apple-touch-icon-precomposed']",
    ];

    for selector_str in favicon_selectors {
        if let Ok(selector) = Selector::parse(selector_str) {
            if let Some(el) = document.select(&selector).next() {
                if let Some(href) = el.value().attr("href") {
                    let url = href.trim();
                    if !url.is_empty() {
                        return resolve_url(url, base_url);
                    }
                }
            }
        }
    }

    // Default to /favicon.ico
    resolve_url("/favicon.ico", base_url)
}

/// Resolve a potentially relative URL against a base URL
fn resolve_url(url: &str, base_url: &str) -> Option<String> {
    // Already absolute
    if url.starts_with("http://") || url.starts_with("https://") {
        return Some(url.to_string());
    }

    // Data URLs - return as-is
    if url.starts_with("data:") {
        return Some(url.to_string());
    }

    // Resolve relative URLs
    if let Ok(base) = reqwest::Url::parse(base_url) {
        if let Ok(resolved) = base.join(url) {
            return Some(resolved.to_string());
        }
    }

    None
}

/// Extract the main content from the page
/// Uses a reader-mode approach to find the most relevant content
fn extract_main_content(document: &Html) -> String {
    // Priority order for content containers
    let content_selectors = [
        "article",
        "main",
        "[role='main']",
        ".post-content",
        ".article-content",
        ".entry-content",
        ".content",
        "#content",
        ".post",
        ".article",
    ];

    // Try each selector in order
    for selector_str in content_selectors {
        if let Ok(selector) = Selector::parse(selector_str) {
            if let Some(element) = document.select(&selector).next() {
                let text = extract_text_from_element(&element);
                if text.len() > 200 {
                    // Found substantial content
                    return truncate_text(&text, MAX_TEXT_LENGTH);
                }
            }
        }
    }

    // Fall back to body, excluding common non-content elements
    if let Ok(body_selector) = Selector::parse("body") {
        if let Some(body) = document.select(&body_selector).next() {
            let text = extract_text_from_element_filtered(&body);
            return truncate_text(&text, MAX_TEXT_LENGTH);
        }
    }

    String::new()
}

/// Extract text from an element, preserving some structure
fn extract_text_from_element(element: &scraper::ElementRef) -> String {
    let mut text = String::new();
    extract_text_recursive(element, &mut text, false);
    clean_text(&text)
}

/// Extract text from an element, filtering out navigation/non-content elements
fn extract_text_from_element_filtered(element: &scraper::ElementRef) -> String {
    let mut text = String::new();
    extract_text_recursive(element, &mut text, true);
    clean_text(&text)
}

/// Recursively extract text from an element
fn extract_text_recursive(element: &scraper::ElementRef, output: &mut String, filter: bool) {
    // Elements to skip entirely
    let skip_tags = [
        "script", "style", "noscript", "iframe", "svg", "path", "button", "input", "select",
        "textarea", "form",
    ];

    // Elements to skip when filtering (navigation, sidebars, etc.)
    let filter_tags = ["nav", "header", "footer", "aside"];
    let filter_classes = [
        "nav",
        "navigation",
        "menu",
        "sidebar",
        "footer",
        "header",
        "advertisement",
        "ad",
        "social",
        "share",
        "comments",
        "related",
    ];

    for child in element.children() {
        if let Some(el) = scraper::ElementRef::wrap(child) {
            let tag_name = el.value().name();

            // Skip certain tags entirely
            if skip_tags.contains(&tag_name) {
                continue;
            }

            // When filtering, skip navigation/sidebar elements
            if filter {
                if filter_tags.contains(&tag_name) {
                    continue;
                }

                // Check class names
                if let Some(class) = el.value().attr("class") {
                    let class_lower = class.to_lowercase();
                    if filter_classes.iter().any(|c| class_lower.contains(c)) {
                        continue;
                    }
                }

                // Check id
                if let Some(id) = el.value().attr("id") {
                    let id_lower = id.to_lowercase();
                    if filter_classes.iter().any(|c| id_lower.contains(c)) {
                        continue;
                    }
                }
            }

            // Add newlines for block elements
            if is_block_element(tag_name) && !output.is_empty() {
                output.push('\n');
            }

            extract_text_recursive(&el, output, filter);

            // Add newlines after block elements
            if is_block_element(tag_name) {
                output.push('\n');
            }
        } else if let Some(text) = child.value().as_text() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                if !output.is_empty() && !output.ends_with('\n') && !output.ends_with(' ') {
                    output.push(' ');
                }
                output.push_str(trimmed);
            }
        }
    }
}

/// Check if a tag is a block-level element
fn is_block_element(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "div"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "ul"
            | "ol"
            | "li"
            | "br"
            | "hr"
            | "blockquote"
            | "pre"
            | "table"
            | "tr"
            | "section"
            | "article"
    )
}

/// Extract links from the document
fn extract_links(document: &Html, base_url: &str) -> Vec<ScrapedLink> {
    let mut links = Vec::new();
    let mut seen_urls = HashSet::new();

    let base = reqwest::Url::parse(base_url).ok();

    if let Ok(selector) = Selector::parse("a[href]") {
        for element in document.select(&selector) {
            if let Some(href) = element.value().attr("href") {
                // Skip empty, javascript, and anchor-only links
                if href.is_empty()
                    || href.starts_with("javascript:")
                    || href.starts_with('#')
                    || href.starts_with("mailto:")
                    || href.starts_with("tel:")
                {
                    continue;
                }

                // Resolve relative URLs
                let resolved_url = if let Some(ref base) = base {
                    base.join(href)
                        .map(|u| u.to_string())
                        .unwrap_or_else(|_| href.to_string())
                } else {
                    href.to_string()
                };

                // Deduplicate
                if seen_urls.contains(&resolved_url) {
                    continue;
                }
                seen_urls.insert(resolved_url.clone());

                // Get link text
                let text: String = element.text().collect::<String>().trim().to_string();
                if text.is_empty() {
                    continue;
                }

                links.push(ScrapedLink {
                    url: resolved_url,
                    text,
                });

                // Limit number of links
                if links.len() >= 100 {
                    break;
                }
            }
        }
    }

    links
}

/// Clean up extracted text
fn clean_text(text: &str) -> String {
    // Replace multiple whitespace with single space
    let mut result = String::new();
    let mut last_was_whitespace = false;
    let mut last_was_newline = false;

    for ch in text.chars() {
        if ch == '\n' {
            if !last_was_newline {
                result.push('\n');
                last_was_newline = true;
                last_was_whitespace = true;
            }
        } else if ch.is_whitespace() {
            if !last_was_whitespace {
                result.push(' ');
                last_was_whitespace = true;
            }
        } else {
            result.push(ch);
            last_was_whitespace = false;
            last_was_newline = false;
        }
    }

    result.trim().to_string()
}

/// Truncate text to a maximum length, preserving word boundaries
fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }

    // Find a word boundary
    let truncated = &text[..max_len];
    if let Some(pos) = truncated.rfind(char::is_whitespace) {
        format!("{}...", &truncated[..pos])
    } else {
        format!("{}...", truncated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text() {
        let input = "Hello   world\n\n\nThis is    a test";
        let cleaned = clean_text(input);
        assert_eq!(cleaned, "Hello world\nThis is a test");
    }

    #[test]
    fn test_truncate_text() {
        let short = "Hello world";
        assert_eq!(truncate_text(short, 100), "Hello world");

        let long = "This is a very long piece of text that needs to be truncated";
        let truncated = truncate_text(long, 30);
        assert!(truncated.ends_with("..."));
        assert!(truncated.len() <= 35);
    }

    #[test]
    fn test_parse_html_basic() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Test Page</title>
                <meta name="description" content="A test page description">
            </head>
            <body>
                <article>
                    <h1>Main Article</h1>
                    <p>This is the main content of the article.</p>
                    <a href="https://example.com/link1">Link 1</a>
                    <a href="/relative/link">Link 2</a>
                </article>
            </body>
            </html>
        "#;

        let result = parse_html("https://example.com/page", html).unwrap();

        assert_eq!(result.title, Some("Test Page".to_string()));
        assert_eq!(
            result.description,
            Some("A test page description".to_string())
        );
        assert!(result.content.contains("Main Article"));
        assert!(result.content.contains("main content"));
        assert!(!result.links.is_empty());
    }

    #[test]
    fn test_is_block_element() {
        assert!(is_block_element("p"));
        assert!(is_block_element("div"));
        assert!(is_block_element("h1"));
        assert!(!is_block_element("span"));
        assert!(!is_block_element("a"));
    }
}

