//! URL Indexing Agent
//!
//! Background agent that fetches, parses, and indexes URL content attached to notes.
//! Generates embeddings for the content so it can be included in semantic search
//! and chat context.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::url_scraper::{scrape_url, ScrapedContent};
use super::{generate_embedding_direct, load_ai_config};
use crate::db::connection::DbPool;
use crate::db::url_attachments::{
    get_url_attachment, store_url_embedding, update_url_attachment_content,
    update_url_attachment_status, UpdateUrlContentInput, UrlStatus,
};

/// Event name for URL indexing progress
pub const URL_INDEXING_EVENT: &str = "url-indexing-progress";

/// Progress events emitted during URL indexing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UrlIndexingProgress {
    /// Indexing has started
    Started {
        url_attachment_id: String,
        url: String,
        note_id: String,
    },
    /// Currently fetching the URL
    Fetching { url: String },
    /// URL content has been fetched, now parsing
    Parsing { url: String, content_length: usize },
    /// Generating embeddings for the content
    Embedding { url: String },
    /// Indexing completed successfully
    Completed {
        url_attachment_id: String,
        url: String,
        title: Option<String>,
        content_length: usize,
        links_count: usize,
    },
    /// Indexing failed with an error
    Error {
        url_attachment_id: String,
        url: String,
        error: String,
    },
}

/// Result of URL indexing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlIndexingResult {
    pub url_attachment_id: String,
    pub url: String,
    pub title: Option<String>,
    pub content_length: usize,
    pub links_count: usize,
    pub embedding_dimension: Option<usize>,
}

/// Run the URL indexing agent for a single URL attachment
///
/// This function:
/// 1. Updates status to "fetching"
/// 2. Scrapes the URL content
/// 3. Stores the content in the database
/// 4. Generates an embedding for the content
/// 5. Stores the embedding
/// 6. Updates status to "indexed"
///
/// Emits progress events throughout the process.
pub async fn run_url_indexing_agent(
    app_handle: &AppHandle,
    pool: &DbPool,
    url_attachment_id: &str,
) -> Result<UrlIndexingResult, String> {
    log::info!(
        "[UrlIndexingAgent] Starting indexing for attachment: {}",
        url_attachment_id
    );

    // Get the URL attachment
    let (url, note_id) = {
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        let attachment = get_url_attachment(&conn, url_attachment_id)
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| format!("URL attachment not found: {}", url_attachment_id))?;
        (attachment.url, attachment.note_id)
    };

    // Emit started event
    emit_progress(
        app_handle,
        UrlIndexingProgress::Started {
            url_attachment_id: url_attachment_id.to_string(),
            url: url.clone(),
            note_id: note_id.clone(),
        },
    );

    // Update status to fetching
    {
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        update_url_attachment_status(&conn, url_attachment_id, UrlStatus::Fetching, None)
            .map_err(|e| format!("Failed to update status: {}", e))?;
    }

    emit_progress(
        app_handle,
        UrlIndexingProgress::Fetching { url: url.clone() },
    );

    // Scrape the URL
    let scraped = match scrape_url(&url).await {
        Ok(content) => content,
        Err(e) => {
            let error_msg = e.to_string();
            log::error!("[UrlIndexingAgent] Scrape failed: {}", error_msg);

            // Update status to error
            {
                let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
                update_url_attachment_status(
                    &conn,
                    url_attachment_id,
                    UrlStatus::Error,
                    Some(&error_msg),
                )
                .map_err(|e| format!("Failed to update status: {}", e))?;
            }

            emit_progress(
                app_handle,
                UrlIndexingProgress::Error {
                    url_attachment_id: url_attachment_id.to_string(),
                    url: url.clone(),
                    error: error_msg.clone(),
                },
            );

            return Err(error_msg);
        }
    };

    emit_progress(
        app_handle,
        UrlIndexingProgress::Parsing {
            url: url.clone(),
            content_length: scraped.content.len(),
        },
    );

    // Store the scraped content
    let links_json = serde_json::to_string(&scraped.links).unwrap_or_else(|_| "[]".to_string());
    {
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        update_url_attachment_content(
            &conn,
            url_attachment_id,
            UpdateUrlContentInput {
                title: scraped.title.clone(),
                description: scraped.description.clone(),
                content: Some(scraped.content.clone()),
                links: Some(links_json),
                image_url: scraped.image_url.clone(),
                favicon_url: scraped.favicon_url.clone(),
                site_name: scraped.site_name.clone(),
            },
        )
        .map_err(|e| format!("Failed to store content: {}", e))?;
    }

    emit_progress(
        app_handle,
        UrlIndexingProgress::Embedding { url: url.clone() },
    );

    // Generate embedding for the content
    let embedding_dimension = match generate_url_embedding(pool, url_attachment_id, &scraped).await
    {
        Ok(dim) => Some(dim),
        Err(e) => {
            log::warn!(
                "[UrlIndexingAgent] Embedding generation failed (content still stored): {}",
                e
            );
            // Don't fail the whole operation - content is still useful without embedding
            None
        }
    };

    let result = UrlIndexingResult {
        url_attachment_id: url_attachment_id.to_string(),
        url: url.clone(),
        title: scraped.title.clone(),
        content_length: scraped.content.len(),
        links_count: scraped.links.len(),
        embedding_dimension,
    };

    emit_progress(
        app_handle,
        UrlIndexingProgress::Completed {
            url_attachment_id: url_attachment_id.to_string(),
            url,
            title: scraped.title,
            content_length: scraped.content.len(),
            links_count: scraped.links.len(),
        },
    );

    log::info!(
        "[UrlIndexingAgent] Indexing completed: {} - {} chars, {} links",
        url_attachment_id,
        result.content_length,
        result.links_count
    );

    Ok(result)
}

/// Generate and store embedding for URL content
async fn generate_url_embedding(
    pool: &DbPool,
    url_attachment_id: &str,
    scraped: &ScrapedContent,
) -> Result<usize, String> {
    // Get embedding configuration
    let (embedding_model, provider_url, api_key) = {
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        let config = load_ai_config(&conn)?;
        let embedding_provider = config
            .providers
            .iter()
            .find(|p| p.id == config.embedding.provider);
        let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
        let api_key = embedding_provider.and_then(|p| p.api_key.clone());
        (config.embedding.full_model_id(), provider_url, api_key)
    };

    // Build text to embed: title + description + content
    let text_to_embed = build_embedding_text(scraped);

    if text_to_embed.trim().is_empty() {
        return Err("No content to embed".to_string());
    }

    log::info!(
        "[UrlIndexingAgent] Generating embedding for {} chars",
        text_to_embed.len()
    );

    // Generate embedding
    let result = generate_embedding_direct(
        &text_to_embed,
        &embedding_model,
        provider_url.as_deref(),
        api_key.as_deref(),
    )
    .await
    .map_err(|e| format!("Embedding error: {}", e))?;

    // Store embedding
    {
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        store_url_embedding(&conn, url_attachment_id, &result.embedding, &embedding_model)
            .map_err(|e| format!("Failed to store embedding: {}", e))?;
    }

    Ok(result.dimension)
}

/// Build the text to embed from scraped content
fn build_embedding_text(scraped: &ScrapedContent) -> String {
    let mut parts = Vec::new();

    if let Some(ref title) = scraped.title {
        parts.push(title.clone());
    }

    if let Some(ref desc) = scraped.description {
        parts.push(desc.clone());
    }

    if !scraped.content.is_empty() {
        parts.push(scraped.content.clone());
    }

    // Include some link context (titles of linked pages)
    if !scraped.links.is_empty() {
        let link_texts: Vec<&str> = scraped
            .links
            .iter()
            .take(20) // Limit to first 20 links
            .map(|l| l.text.as_str())
            .collect();
        if !link_texts.is_empty() {
            parts.push(format!("Links: {}", link_texts.join(", ")));
        }
    }

    parts.join("\n\n")
}

/// Emit a progress event
fn emit_progress(app_handle: &AppHandle, progress: UrlIndexingProgress) {
    if let Err(e) = app_handle.emit(URL_INDEXING_EVENT, &progress) {
        log::warn!("[UrlIndexingAgent] Failed to emit progress event: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_embedding_text() {
        let scraped = ScrapedContent {
            url: "https://example.com".to_string(),
            title: Some("Test Title".to_string()),
            description: Some("A test description".to_string()),
            image_url: Some("https://example.com/image.jpg".to_string()),
            favicon_url: Some("https://example.com/favicon.ico".to_string()),
            site_name: Some("Example Site".to_string()),
            content: "Main content here".to_string(),
            links: vec![],
        };

        let text = build_embedding_text(&scraped);
        assert!(text.contains("Test Title"));
        assert!(text.contains("A test description"));
        assert!(text.contains("Main content here"));
    }

    #[test]
    fn test_build_embedding_text_with_links() {
        let scraped = ScrapedContent {
            url: "https://example.com".to_string(),
            title: Some("Test".to_string()),
            description: None,
            image_url: None,
            favicon_url: None,
            site_name: None,
            content: "Content".to_string(),
            links: vec![
                super::super::url_scraper::ScrapedLink {
                    url: "https://example.com/a".to_string(),
                    text: "Link A".to_string(),
                },
                super::super::url_scraper::ScrapedLink {
                    url: "https://example.com/b".to_string(),
                    text: "Link B".to_string(),
                },
            ],
        };

        let text = build_embedding_text(&scraped);
        assert!(text.contains("Links:"));
        assert!(text.contains("Link A"));
        assert!(text.contains("Link B"));
    }
}

