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
    get_url_attachment, store_url_embedding, store_url_embedding_chunks,
    update_url_attachment_content, update_url_attachment_status, 
    UpdateUrlContentInput, UrlStatus,
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

/// Generate and store embeddings for URL content
/// Uses chunking for long content to ensure all content is semantically searchable
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

    // Build the base text including title and description
    let header_text = build_header_text(scraped);
    
    if header_text.trim().is_empty() && scraped.content.trim().is_empty() {
        return Err("No content to embed".to_string());
    }

    // Decide whether to chunk based on content length
    let total_content_len = header_text.len() + scraped.content.len();
    
    if total_content_len <= MIN_CHUNK_THRESHOLD {
        // Short content: use single embedding (legacy approach for compatibility)
        let text_to_embed = build_embedding_text(scraped);
        
        log::info!(
            "[UrlIndexingAgent] Generating single embedding for {} chars",
            text_to_embed.len()
        );

        let result = generate_embedding_direct(
            &text_to_embed,
            &embedding_model,
            provider_url.as_deref(),
            api_key.as_deref(),
        )
        .await
        .map_err(|e| format!("Embedding error: {}", e))?;

        // Store as single embedding
        {
            let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
            store_url_embedding(&conn, url_attachment_id, &result.embedding, &embedding_model)
                .map_err(|e| format!("Failed to store embedding: {}", e))?;
        }

        Ok(result.dimension)
    } else {
        // Long content: chunk and embed each chunk
        let chunks = create_content_chunks(&header_text, &scraped.content);
        
        log::info!(
            "[UrlIndexingAgent] Generating {} chunk embeddings for {} chars",
            chunks.len(),
            total_content_len
        );

        let mut chunk_embeddings: Vec<(String, usize, usize, Vec<f32>)> = Vec::new();
        let mut dimension = 0;

        for (chunk_text, char_start, char_end) in &chunks {
            let result = generate_embedding_direct(
                chunk_text,
                &embedding_model,
                provider_url.as_deref(),
                api_key.as_deref(),
            )
            .await
            .map_err(|e| format!("Embedding error for chunk: {}", e))?;

            dimension = result.dimension;
            chunk_embeddings.push((
                chunk_text.clone(),
                *char_start,
                *char_end,
                result.embedding,
            ));
        }

        // Store all chunk embeddings
        {
            let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
            store_url_embedding_chunks(
                &conn,
                url_attachment_id,
                &chunk_embeddings,
                &embedding_model,
            )
            .map_err(|e| format!("Failed to store chunk embeddings: {}", e))?;
        }

        log::info!(
            "[UrlIndexingAgent] Stored {} chunk embeddings",
            chunk_embeddings.len()
        );

        Ok(dimension)
    }
}

/// Build header text (title + description) for embedding
fn build_header_text(scraped: &ScrapedContent) -> String {
    let mut parts = Vec::new();

    if let Some(ref title) = scraped.title {
        parts.push(title.clone());
    }

    if let Some(ref desc) = scraped.description {
        parts.push(desc.clone());
    }

    parts.join("\n\n")
}

/// Create content chunks with overlap for long content
/// Returns Vec of (chunk_text, char_start, char_end) where positions are relative to original content
fn create_content_chunks(header: &str, content: &str) -> Vec<(String, usize, usize)> {
    let mut chunks = Vec::new();
    
    if content.is_empty() {
        // Just the header
        if !header.is_empty() {
            chunks.push((header.to_string(), 0, 0));
        }
        return chunks;
    }

    // Calculate effective chunk size (accounting for header in first chunk)
    let header_len = header.len();
    let first_chunk_content_size = CHUNK_SIZE_CHARS.saturating_sub(header_len + 4); // +4 for "\n\n"
    
    let mut pos = 0;
    let content_len = content.len();
    
    while pos < content_len {
        let chunk_content_size = if chunks.is_empty() {
            first_chunk_content_size
        } else {
            CHUNK_SIZE_CHARS
        };
        
        let end_pos = (pos + chunk_content_size).min(content_len);
        
        // Ensure end_pos is at a valid UTF-8 char boundary
        let end_pos = find_char_boundary(content, end_pos);
        
        // Try to break at a word boundary
        let actual_end = if end_pos < content_len {
            find_word_boundary(content, end_pos)
        } else {
            end_pos
        };
        
        let chunk_content = &content[pos..actual_end];
        
        // Build the chunk text
        let chunk_text = if chunks.is_empty() && !header.is_empty() {
            format!("{}\n\n{}", header, chunk_content)
        } else {
            chunk_content.to_string()
        };
        
        chunks.push((chunk_text, pos, actual_end));
        
        // Move to next chunk with overlap
        let next_pos = if actual_end >= content_len {
            content_len
        } else {
            find_char_boundary(content, actual_end.saturating_sub(CHUNK_OVERLAP_CHARS))
        };
        
        // Ensure we make progress
        if next_pos <= pos {
            pos = actual_end;
        } else {
            pos = next_pos;
        }
    }
    
    chunks
}

/// Find the nearest valid UTF-8 character boundary at or before the given byte position
fn find_char_boundary(s: &str, pos: usize) -> usize {
    if pos >= s.len() {
        return s.len();
    }
    // Walk backwards to find a valid char boundary
    let mut p = pos;
    while p > 0 && !s.is_char_boundary(p) {
        p -= 1;
    }
    p
}

/// Find a word boundary near the target position
fn find_word_boundary(text: &str, target: usize) -> usize {
    // Ensure target is at a char boundary first
    let target = find_char_boundary(text, target);
    
    // Look backwards from target for whitespace
    let search_start = find_char_boundary(text, target.saturating_sub(100));
    if let Some(rel_pos) = text[search_start..target].rfind(char::is_whitespace) {
        return search_start + rel_pos + 1; // +1 to start after the whitespace
    }
    target
}

/// Maximum characters per chunk for embedding
/// Most embedding models have a limit of 8192 tokens. With ~4 chars per token on average,
/// 6000 chars per chunk is safe and allows overlap for context.
const CHUNK_SIZE_CHARS: usize = 6000;

/// Overlap between chunks to maintain context across chunk boundaries
const CHUNK_OVERLAP_CHARS: usize = 500;

/// Minimum content size to trigger chunking (below this, use single embedding)
const MIN_CHUNK_THRESHOLD: usize = 7000;

/// Build the text to embed from scraped content (for short content that fits in single embedding)
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

    #[test]
    fn test_build_header_text() {
        let scraped = ScrapedContent {
            url: "https://example.com".to_string(),
            title: Some("Test Title".to_string()),
            description: Some("A test description".to_string()),
            image_url: None,
            favicon_url: None,
            site_name: None,
            content: "Content".to_string(),
            links: vec![],
        };

        let header = build_header_text(&scraped);
        assert!(header.contains("Test Title"));
        assert!(header.contains("A test description"));
        assert!(!header.contains("Content")); // Content should not be in header
    }

    #[test]
    fn test_create_content_chunks_short_content() {
        let header = "Title";
        let content = "Short content";

        let chunks = create_content_chunks(header, content);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].0.contains("Title"));
        assert!(chunks[0].0.contains("Short content"));
    }

    #[test]
    fn test_create_content_chunks_long_content() {
        let header = "Title";
        // Create content that requires multiple chunks
        let content = "word ".repeat(2000); // ~10000 chars
        
        let chunks = create_content_chunks(header, &content);
        
        // Should have multiple chunks
        assert!(chunks.len() > 1, "Expected multiple chunks, got {}", chunks.len());
        
        // First chunk should include header
        assert!(chunks[0].0.contains("Title"));
        
        // All chunks should have reasonable size
        for (chunk_text, _, _) in &chunks {
            assert!(chunk_text.len() <= CHUNK_SIZE_CHARS + 500, 
                "Chunk too large: {} chars", chunk_text.len());
        }
        
        // Chunks should have overlap (start of later chunk should be before end of previous)
        if chunks.len() > 1 {
            for i in 1..chunks.len() {
                let (_, _, prev_end) = chunks[i - 1];
                let (_, curr_start, _) = chunks[i];
                assert!(curr_start < prev_end || curr_start == prev_end,
                    "Chunks should overlap or be contiguous");
            }
        }
    }

    #[test]
    fn test_create_content_chunks_empty_content() {
        let header = "Just a title";
        let content = "";

        let chunks = create_content_chunks(header, content);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].0, "Just a title");
    }

    #[test]
    fn test_find_word_boundary() {
        let text = "Hello world this is a test sentence";
        
        // Should find word boundary
        let boundary = find_word_boundary(text, 15);
        assert!(boundary <= 15);
        
        // Boundary should be at start of a word (after whitespace)
        if boundary > 0 && boundary < text.len() {
            let char_before = text.chars().nth(boundary - 1);
            assert!(char_before.map(|c| c.is_whitespace()).unwrap_or(true));
        }
    }

    #[test]
    fn test_find_char_boundary() {
        // Test with ASCII
        let ascii = "Hello world";
        assert_eq!(find_char_boundary(ascii, 5), 5);
        
        // Test with multi-byte UTF-8 characters
        // café: 'é' is 2 bytes (c3 a9), so "café" is 5 bytes total
        let utf8 = "café test";
        // c=0, a=1, f=2, é=3-4, space=5, t=6, etc.
        // Position 4 is inside 'é', should back up to 3
        assert_eq!(find_char_boundary(utf8, 3), 3); // Start of é
        assert_eq!(find_char_boundary(utf8, 4), 3); // Inside é, backs up to 3
        assert_eq!(find_char_boundary(utf8, 5), 5); // Space after é
        
        // Test with emoji (4 bytes)
        let emoji = "Hi 🎉 there";
        // H=0, i=1, space=2, 🎉=3-6, space=7, t=8...
        assert_eq!(find_char_boundary(emoji, 3), 3); // Start of emoji
        assert_eq!(find_char_boundary(emoji, 4), 3); // Inside emoji
        assert_eq!(find_char_boundary(emoji, 5), 3); // Inside emoji
        assert_eq!(find_char_boundary(emoji, 6), 3); // Inside emoji  
        assert_eq!(find_char_boundary(emoji, 7), 7); // Space after emoji
    }

    #[test]
    fn test_create_content_chunks_with_utf8() {
        let header = "Title";
        // Content with fancy quotes and other multi-byte chars
        let content = "Here's some content with 'fancy quotes' and émojis 🎉 repeated. ".repeat(200);
        
        let chunks = create_content_chunks(header, &content);
        
        // Should not panic and should create valid chunks
        assert!(!chunks.is_empty());
        
        // All chunks should be valid UTF-8 strings (this is implicit since they're Strings)
        for (chunk_text, start, end) in &chunks {
            assert!(!chunk_text.is_empty());
            // Verify the positions are valid char boundaries
            assert!(content.is_char_boundary(*start) || *start == 0);
            assert!(content.is_char_boundary(*end) || *end == content.len());
        }
    }
}

