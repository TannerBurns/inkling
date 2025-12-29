//! URL attachment commands
//!
//! Tauri commands for managing URL attachments on notes,
//! including adding, removing, refreshing, and listing URLs.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::ai::url_indexing_agent::run_url_indexing_agent;
use crate::ai::url_scraper::scrape_url;
use crate::db::url_attachments::{
    self as db, CreateUrlAttachmentInput, UrlAttachment, UrlStatus,
};
use crate::AppPool;

/// Lightweight URL metadata for preview cards (without full content)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlMetadata {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
    pub site_name: Option<String>,
}

/// Add a URL attachment to a note
///
/// Creates the URL attachment record and triggers background indexing.
/// Returns immediately with the attachment in "pending" status.
#[tauri::command]
pub async fn add_url_attachment(
    app_handle: AppHandle,
    pool: State<'_, AppPool>,
    note_id: String,
    url: String,
) -> Result<UrlAttachment, String> {
    log::info!(
        "[UrlCommands] Adding URL attachment: note={}, url={}",
        note_id,
        url
    );

    // Validate URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    // Create the attachment record
    let attachment = {
        let pool_guard = pool.0.read().unwrap();
        let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool_ref.get().map_err(|e| e.to_string())?;

        db::create_url_attachment(
            &conn,
            CreateUrlAttachmentInput {
                note_id: note_id.clone(),
                url: url.clone(),
            },
        )
        .map_err(|e| e.to_string())?
    };

    let attachment_id = attachment.id.clone();

    // Get pool clone for background task
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };

    // Spawn background indexing task
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        if let Err(e) = run_url_indexing_agent(&app_handle_clone, &pool_clone, &attachment_id).await
        {
            log::error!("[UrlCommands] Background indexing failed: {}", e);
        }
    });

    Ok(attachment)
}

/// Get all URL attachments for a note
#[tauri::command]
pub fn get_url_attachments(
    pool: State<AppPool>,
    note_id: String,
) -> Result<Vec<UrlAttachment>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    db::get_url_attachments_for_note(&conn, &note_id).map_err(|e| e.to_string())
}

/// Get a single URL attachment by ID
#[tauri::command]
pub fn get_url_attachment(
    pool: State<AppPool>,
    id: String,
) -> Result<Option<UrlAttachment>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    db::get_url_attachment(&conn, &id).map_err(|e| e.to_string())
}

/// Remove a URL attachment
#[tauri::command]
pub fn remove_url_attachment(pool: State<AppPool>, id: String) -> Result<bool, String> {
    log::info!("[UrlCommands] Removing URL attachment: {}", id);

    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    db::delete_url_attachment(&conn, &id).map_err(|e| e.to_string())
}

/// Refresh a URL attachment (re-fetch and re-index)
///
/// Resets the status to "pending" and triggers background re-indexing.
#[tauri::command]
pub async fn refresh_url_attachment(
    app_handle: AppHandle,
    pool: State<'_, AppPool>,
    id: String,
) -> Result<UrlAttachment, String> {
    log::info!("[UrlCommands] Refreshing URL attachment: {}", id);

    // Reset status to pending
    let attachment = {
        let pool_guard = pool.0.read().unwrap();
        let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool_ref.get().map_err(|e| e.to_string())?;

        // Get the attachment first
        let attachment = db::get_url_attachment(&conn, &id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("URL attachment not found: {}", id))?;

        // Reset status
        db::update_url_attachment_status(&conn, &id, UrlStatus::Pending, None)
            .map_err(|e| e.to_string())?;

        // Delete existing embedding
        let _ = db::delete_url_embedding(&conn, &id);

        attachment
    };

    let attachment_id = attachment.id.clone();

    // Get pool clone for background task
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };

    // Spawn background re-indexing task
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        if let Err(e) = run_url_indexing_agent(&app_handle_clone, &pool_clone, &attachment_id).await
        {
            log::error!("[UrlCommands] Background re-indexing failed: {}", e);
        }
    });

    // Return the attachment with pending status
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    db::get_url_attachment(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("URL attachment not found: {}", id))
}

/// Get all pending URL attachments (for debugging/admin purposes)
#[tauri::command]
pub fn get_pending_url_attachments(pool: State<AppPool>) -> Result<Vec<UrlAttachment>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool_ref.get().map_err(|e| e.to_string())?;

    db::get_pending_url_attachments(&conn).map_err(|e| e.to_string())
}

/// Fetch URL metadata for preview (lightweight, does not store or index)
///
/// This is useful for showing a preview card before the user decides to index the URL.
#[tauri::command]
pub async fn get_url_metadata(url: String) -> Result<UrlMetadata, String> {
    log::info!("[UrlCommands] Fetching metadata for: {}", url);

    // Validate URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    // Scrape the URL (this does the actual fetching)
    let scraped = scrape_url(&url).await.map_err(|e| e.to_string())?;

    Ok(UrlMetadata {
        url: scraped.url,
        title: scraped.title,
        description: scraped.description,
        image_url: scraped.image_url,
        favicon_url: scraped.favicon_url,
        site_name: scraped.site_name,
    })
}

/// Result of discovering and indexing URLs from notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverUrlsResult {
    /// Number of new URLs discovered and queued for indexing
    pub discovered_count: u32,
    /// Number of URLs that already existed
    pub existing_count: u32,
    /// Total notes scanned
    pub notes_scanned: u32,
    /// Any errors encountered
    pub errors: Vec<String>,
}

/// Discover and index all URLs embedded in notes
///
/// Scans all notes for URL embeds (data-url-embed patterns) and creates
/// URL attachments for any that don't already exist, then triggers indexing.
#[tauri::command]
pub async fn discover_and_index_urls(
    app_handle: AppHandle,
    pool: State<'_, AppPool>,
) -> Result<DiscoverUrlsResult, String> {
    use regex::Regex;
    use crate::db::notes;
    
    log::info!("[UrlCommands] Starting URL discovery from all notes");
    
    // Get all notes and existing URL attachments
    let (all_notes, existing_urls) = {
        let pool_guard = pool.0.read().unwrap();
        let pool_ref = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool_ref.get().map_err(|e| e.to_string())?;
        
        let notes = notes::get_all_notes(&conn).map_err(|e| e.to_string())?;
        
        // Get all existing URL attachments to avoid duplicates
        let mut stmt = conn.prepare(
            "SELECT note_id, url FROM url_attachments"
        ).map_err(|e| e.to_string())?;
        
        let existing: std::collections::HashSet<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        
        (notes, existing)
    };
    
    let notes_scanned = all_notes.len() as u32;
    let mut discovered_count = 0u32;
    let mut existing_count = 0u32;
    let mut errors: Vec<String> = Vec::new();
    
    // Regex to find URL embeds in note content
    // Matches: data-url="https://..." or data-url='https://...'
    let url_embed_regex = Regex::new(r#"data-url=["']([^"']+)["']"#)
        .map_err(|e| format!("Regex error: {}", e))?;
    
    // Also match markdown-style links and plain URLs
    let plain_url_regex = Regex::new(r#"https?://[^\s<>\[\]"'`)]+[^\s<>\[\]"'`.,;:!?)}\]]"#)
        .map_err(|e| format!("Regex error: {}", e))?;
    
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };
    
    for note in all_notes {
        let content = match note.content {
            Some(ref c) => c,
            None => continue,
        };
        
        // Find all URLs in the note
        let mut found_urls: std::collections::HashSet<String> = std::collections::HashSet::new();
        
        // Find URL embeds (data-url attributes)
        for cap in url_embed_regex.captures_iter(content) {
            if let Some(url_match) = cap.get(1) {
                let url = url_match.as_str().to_string();
                if url.starts_with("http://") || url.starts_with("https://") {
                    found_urls.insert(url);
                }
            }
        }
        
        // Also find plain URLs in content
        for url_match in plain_url_regex.find_iter(content) {
            let url = url_match.as_str().to_string();
            // Clean up any trailing punctuation that might have been captured
            let cleaned = url.trim_end_matches(['.', ',', ';', ':', '!', '?', ')', '}', ']']);
            if cleaned.starts_with("http://") || cleaned.starts_with("https://") {
                found_urls.insert(cleaned.to_string());
            }
        }
        
        // Process each URL found
        for url in found_urls {
            // Check if this URL already exists for this note
            if existing_urls.contains(&(note.id.clone(), url.clone())) {
                existing_count += 1;
                continue;
            }
            
            // Create the URL attachment
            let attachment_result = {
                let conn = pool_clone.get().map_err(|e| e.to_string())?;
                db::create_url_attachment(
                    &conn,
                    CreateUrlAttachmentInput {
                        note_id: note.id.clone(),
                        url: url.clone(),
                    },
                )
            };
            
            match attachment_result {
                Ok(attachment) => {
                    discovered_count += 1;
                    
                    // Spawn background indexing task
                    let app_handle_clone = app_handle.clone();
                    let pool_clone_inner = pool_clone.clone();
                    let attachment_id = attachment.id.clone();
                    
                    tokio::spawn(async move {
                        if let Err(e) = run_url_indexing_agent(&app_handle_clone, &pool_clone_inner, &attachment_id).await {
                            log::error!("[UrlCommands] Background indexing failed for {}: {}", attachment_id, e);
                        }
                    });
                }
                Err(e) => {
                    // DuplicateUrl is expected and not an error
                    let err_str = e.to_string();
                    if err_str.contains("Duplicate") {
                        existing_count += 1;
                    } else if errors.len() < 5 {
                        errors.push(format!("Failed to create attachment for {}: {}", url, err_str));
                    }
                }
            }
        }
    }
    
    log::info!(
        "[UrlCommands] URL discovery complete: discovered={}, existing={}, notes_scanned={}",
        discovered_count, existing_count, notes_scanned
    );
    
    Ok(DiscoverUrlsResult {
        discovered_count,
        existing_count,
        notes_scanned,
        errors,
    })
}

