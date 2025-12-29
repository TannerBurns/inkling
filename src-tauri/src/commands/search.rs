//! Tauri commands for search operations (fulltext, semantic, hybrid)

use crate::ai::{extract_attachments_text, generate_embedding_direct, load_ai_config, EmbeddingModelInfo};
use crate::db::{self, connection::DbPool, url_attachments};
use crate::search::SearchIndex;
use crate::{AppPool, AppSearchIndex};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::State;

/// Search mode
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    /// Full-text search using Tantivy
    #[default]
    Fulltext,
    /// Semantic search using embeddings
    Semantic,
    /// Hybrid search combining both
    Hybrid,
}

/// A search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub note_id: String,
    pub title: String,
    pub snippet: Option<String>,
    /// Relevance score (0-1, higher is better)
    pub score: f32,
    /// Which search mode produced this result
    pub mode: String,
}

/// Search notes using the specified mode
#[tauri::command]
pub async fn search_notes_unified(
    pool: State<'_, AppPool>,
    search_index: State<'_, AppSearchIndex>,
    query: String,
    mode: SearchMode,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let limit = limit.unwrap_or(20);

    // Clone pool and index before async work
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    
    let index_clone = {
        let search_guard = search_index.0.read().unwrap();
        search_guard.as_ref().ok_or("Search index not initialized")?.clone()
    };

    match mode {
        SearchMode::Fulltext => search_fulltext(&pool_clone, &index_clone, &query, limit),
        SearchMode::Semantic => {
            search_semantic(&pool_clone, &query, limit).await
        }
        SearchMode::Hybrid => {
            search_hybrid(&pool_clone, &index_clone, &query, limit).await
        }
    }
}

/// Full-text search using Tantivy
fn search_fulltext(
    pool: &DbPool,
    search_index: &Arc<SearchIndex>,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let results = search_index
        .search(query, limit)
        .map_err(|e| format!("Search error: {}", e))?;

    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let mut search_results = Vec::with_capacity(results.len());
    for result in results {
        if let Ok(Some(note)) = db::notes::get_note(&conn, &result.id) {
            let snippet = note.content.as_ref().map(|c| {
                // Create a snippet around potential matches
                create_snippet(c, query, 150)
            });

            search_results.push(SearchResult {
                note_id: note.id,
                title: note.title,
                snippet,
                score: result.score,
                mode: "fulltext".to_string(),
            });
        }
    }

    Ok(search_results)
}

/// Semantic search using embeddings
async fn search_semantic(
    pool: &DbPool,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    log::info!("[search_semantic] Starting semantic search for: '{}'", query);
    
    // Get embedding config
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let config = load_ai_config(&conn)?;
    let model = config.embedding.full_model_id();
    
    log::info!(
        "[search_semantic] Using embedding model: {}, provider: {}",
        model,
        config.embedding.provider
    );
    
    // Get the provider's base URL and API key for direct calls
    let embedding_provider = config.providers.iter()
        .find(|p| p.id == config.embedding.provider);
    let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
    let api_key = embedding_provider.and_then(|p| p.api_key.clone());

    log::info!("[search_semantic] Provider URL: {:?}, has API key: {}", provider_url, api_key.is_some());

    // Generate embedding for query using direct provider call
    let query_embedding = generate_embedding_direct(query, &model, provider_url.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| {
            log::error!("[search_semantic] Failed to generate query embedding: {}", e);
            format!("Failed to generate query embedding: {}", e)
        })?;

    log::info!(
        "[search_semantic] Query embedding generated, dimension: {}",
        query_embedding.dimension
    );

    // Check embedding stats to understand what's in the database
    let stats = db::embeddings::get_embedding_stats(&conn, &model);
    if let Ok(stats) = stats {
        log::info!(
            "[search_semantic] Embedding stats - total: {}, embedded: {}, pending: {}, model: {:?}",
            stats.total_notes,
            stats.embedded_notes,
            stats.pending_notes,
            stats.current_model
        );
    }

    // Search for similar notes
    let similar = db::embeddings::search_similar(&conn, &query_embedding.embedding, limit, None)
        .map_err(|e| {
            log::error!("[search_semantic] Similarity search error: {}", e);
            format!("Similarity search error: {}", e)
        })?;

    log::info!("[search_semantic] Found {} similar notes", similar.len());

    let mut search_results = Vec::with_capacity(similar.len());
    let mut seen_note_ids: HashSet<String> = HashSet::new();
    
    for result in similar {
        if let Ok(Some(note)) = db::notes::get_note(&conn, &result.note_id) {
            seen_note_ids.insert(note.id.clone());
            let snippet = note.content.as_ref().map(|c| {
                // For semantic search, just take the beginning
                truncate_content(c, 150)
            });

            search_results.push(SearchResult {
                note_id: note.id,
                title: note.title,
                snippet,
                score: result.score,
                mode: "semantic".to_string(),
            });
        }
    }

    // Also search URL embeddings and include their parent notes
    let url_similar = url_attachments::search_similar_urls(&conn, &query_embedding.embedding, limit, None)
        .unwrap_or_else(|e| {
            log::warn!("[search_semantic] URL similarity search error: {}", e);
            Vec::new()
        });

    log::info!("[search_semantic] Found {} similar URL attachments", url_similar.len());

    for url_result in url_similar {
        // Skip if we already have this note in results
        if seen_note_ids.contains(&url_result.note_id) {
            continue;
        }
        
        if let Ok(Some(note)) = db::notes::get_note(&conn, &url_result.note_id) {
            seen_note_ids.insert(note.id.clone());
            
            // Create snippet mentioning the matched URL
            let url_title = url_result.title.unwrap_or_else(|| url_result.url.clone());
            let snippet = Some(format!("Matched via linked URL: {}", url_title));

            search_results.push(SearchResult {
                note_id: note.id,
                title: note.title,
                snippet,
                score: url_result.score * 0.9, // Slightly lower score for URL matches
                mode: "semantic".to_string(),
            });
        }
    }

    // Re-sort by score after adding URL results
    search_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    search_results.truncate(limit);

    log::info!(
        "[search_semantic] Returning {} search results",
        search_results.len()
    );
    Ok(search_results)
}

/// Hybrid search combining fulltext and semantic
async fn search_hybrid(
    pool: &DbPool,
    search_index: &Arc<SearchIndex>,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    log::info!("[search_hybrid] Starting hybrid search for: '{}'", query);
    
    // Get results from both search methods
    let fulltext_results = search_fulltext(pool, search_index, query, limit)?;
    log::info!(
        "[search_hybrid] Fulltext returned {} results",
        fulltext_results.len()
    );
    
    let semantic_results = search_semantic(pool, query, limit).await?;
    log::info!(
        "[search_hybrid] Semantic returned {} results",
        semantic_results.len()
    );

    // Combine and deduplicate results using reciprocal rank fusion
    let mut combined = combine_results(fulltext_results, semantic_results, limit);
    
    // Update mode to hybrid for combined results
    for result in &mut combined {
        result.mode = "hybrid".to_string();
    }

    log::info!(
        "[search_hybrid] Combined and returning {} results",
        combined.len()
    );
    Ok(combined)
}

/// Combine results from multiple search methods using reciprocal rank fusion
fn combine_results(
    fulltext: Vec<SearchResult>,
    semantic: Vec<SearchResult>,
    limit: usize,
) -> Vec<SearchResult> {
    use std::collections::HashMap;

    const K: f32 = 60.0; // RRF constant

    // Calculate RRF scores
    let mut scores: HashMap<String, (f32, SearchResult)> = HashMap::new();

    for (rank, result) in fulltext.into_iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f32 + 1.0);
        scores
            .entry(result.note_id.clone())
            .or_insert((0.0, result.clone()))
            .0 += rrf_score;
    }

    for (rank, result) in semantic.into_iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f32 + 1.0);
        let entry = scores
            .entry(result.note_id.clone())
            .or_insert((0.0, result.clone()));
        entry.0 += rrf_score;
    }

    // Sort by combined score
    let mut results: Vec<(f32, SearchResult)> = scores.into_values().collect();
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Take top results and update scores
    results
        .into_iter()
        .take(limit)
        .map(|(score, mut result)| {
            result.score = score;
            result
        })
        .collect()
}

/// Get notes related to a specific note
#[tauri::command]
pub async fn get_related_notes(
    pool: State<'_, AppPool>,
    note_id: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let limit = limit.unwrap_or(5);
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    // Find similar notes based on embedding
    let similar = db::embeddings::search_similar_to_note(&conn, &note_id, limit, Some(0.3))
        .map_err(|e| format!("Similarity search error: {}", e))?;

    let mut search_results = Vec::with_capacity(similar.len());
    for result in similar {
        if let Ok(Some(note)) = db::notes::get_note(&conn, &result.note_id) {
            let snippet = note.content.as_ref().map(|c| truncate_content(c, 100));

            search_results.push(SearchResult {
                note_id: note.id,
                title: note.title,
                snippet,
                score: result.score,
                mode: "semantic".to_string(),
            });
        }
    }

    Ok(search_results)
}

/// Get embedding statistics
#[tauri::command]
pub async fn get_embedding_stats(
    pool: State<'_, AppPool>,
) -> Result<db::EmbeddingStats, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    let config = load_ai_config(&conn)?;
    
    db::embeddings::get_embedding_stats(&conn, &config.embedding.full_model_id())
        .map_err(|e| format!("Failed to get embedding stats: {}", e))
}

/// Get available embedding models
#[tauri::command]
pub fn get_embedding_models() -> Vec<EmbeddingModelInfo> {
    crate::ai::get_embedding_models()
}

/// Result of detecting embedding dimension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectDimensionResult {
    pub dimension: u32,
    pub model: String,
}

/// Detect the dimension of an embedding model by making a test call
#[tauri::command]
pub async fn detect_embedding_dimension(
    pool: State<'_, AppPool>,
    model: String,
) -> Result<DetectDimensionResult, String> {
    // Get provider URL and API key from config
    let (provider_url, api_key) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        let config = load_ai_config(&conn)?;
        let embedding_provider = config.providers.iter()
            .find(|p| p.id == config.embedding.provider);
        (
            embedding_provider.and_then(|p| p.base_url.clone()),
            embedding_provider.and_then(|p| p.api_key.clone())
        )
    };
    
    // Generate a test embedding with a simple text
    let result = generate_embedding_direct("test", &model, provider_url.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| format!("Failed to detect dimension: {}", e))?;
    
    Ok(DetectDimensionResult {
        dimension: result.dimension as u32,
        model: result.model,
    })
}

/// Result of reindexing embeddings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReindexResult {
    pub embedded_count: u32,
    pub total_notes: u32,
    pub url_embedded_count: u32,
    pub total_urls: u32,
    pub errors: Vec<String>,
}

/// Trigger re-embedding of all notes and URL attachments
#[tauri::command]
pub async fn reindex_embeddings(
    pool: State<'_, AppPool>,
) -> Result<ReindexResult, String> {
    // Clone pool for async work
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    
    // Do initial sync db work - get notes and URL attachments
    let (notes, indexed_urls, embedding_model, provider_url, api_key) = {
        let conn = pool_clone.get().map_err(|e| format!("Database error: {}", e))?;
        
        // Delete all existing note embeddings
        db::embeddings::delete_all_embeddings(&conn)
            .map_err(|e| format!("Failed to delete embeddings: {}", e))?;
        
        // Delete all existing URL embeddings
        url_attachments::delete_all_url_embeddings(&conn)
            .map_err(|e| format!("Failed to delete URL embeddings: {}", e))?;
        
        // Get all notes
        let notes = db::notes::get_all_notes(&conn)
            .map_err(|e| format!("Database error: {}", e))?;
        
        // Get all indexed URL attachments (those with content)
        let indexed_urls = url_attachments::get_all_indexed_url_attachments(&conn)
            .map_err(|e| format!("Database error: {}", e))?;
        
        // Get embedding config
        let config = load_ai_config(&conn)?;
        
        log::info!("[Reindex] Embedding provider: {}, model: {}, full_id: {}", 
            config.embedding.provider,
            config.embedding.model,
            config.embedding.full_model_id()
        );
        
        // Get the provider's base URL and API key for direct calls
        let embedding_provider = config.providers.iter()
            .find(|p| p.id == config.embedding.provider);
        let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
        let api_key = embedding_provider.and_then(|p| p.api_key.clone());
        
        (notes, indexed_urls, config.embedding.full_model_id(), provider_url, api_key)
    };
    
    let total_notes = notes.len() as u32;
    let total_urls = indexed_urls.len() as u32;
    log::info!("[Reindex] Using model: {}, provider_url: {:?}, has API key: {}", embedding_model, provider_url, api_key.is_some());
    log::info!("[Reindex] Processing {} notes and {} URL attachments", total_notes, total_urls);
    
    let mut embedded_count = 0u32;
    let mut url_embedded_count = 0u32;
    let mut errors: Vec<String> = Vec::new();
    
    // Embed notes
    for note in notes {
        // Extract text from attachments referenced in the note
        let attachment_text = extract_attachments_text(&note.content, Some(10000));
        
        // Prepare text to embed (title + content + attachment text)
        let base_content = note.content.unwrap_or_default();
        let text_to_embed = if attachment_text.is_empty() {
            format!("{}\n\n{}", note.title, base_content)
        } else {
            format!(
                "{}\n\n{}\n\n--- Attached Document Content ---\n{}",
                note.title, base_content, attachment_text
            )
        };
        
        if text_to_embed.trim().is_empty() {
            continue;
        }
        
        // Generate embedding using direct provider call
        match generate_embedding_direct(&text_to_embed, &embedding_model, provider_url.as_deref(), api_key.as_deref()).await {
            Ok(result) => {
                // Store embedding (sync db work)
                let conn = pool_clone.get().map_err(|e| format!("Database error: {}", e))?;
                if let Err(e) = db::embeddings::store_embedding(
                    &conn,
                    &note.id,
                    &result.embedding,
                    &embedding_model,
                    Some(&result.model),
                ) {
                    let err_msg = format!("Failed to store embedding: {}", e);
                    log::warn!("{}", err_msg);
                    if errors.len() < 5 {
                        errors.push(err_msg);
                    }
                } else {
                    embedded_count += 1;
                }
            }
            Err(e) => {
                let err_msg = format!("Embedding failed: {}", e);
                log::warn!("{}", err_msg);
                // Only keep first few errors to avoid huge response
                if errors.len() < 5 {
                    errors.push(err_msg);
                }
            }
        }
    }
    
    // Embed URL attachments
    for url_attachment in indexed_urls {
        let content = match url_attachment.content {
            Some(c) => c,
            None => continue,
        };
        
        // Build text to embed: title + description + content
        let mut parts = Vec::new();
        if let Some(ref title) = url_attachment.title {
            parts.push(title.clone());
        }
        if let Some(ref desc) = url_attachment.description {
            parts.push(desc.clone());
        }
        // Truncate content for embedding (max 8000 chars)
        let truncated_content = if content.len() > 8000 {
            content[..8000].to_string()
        } else {
            content
        };
        parts.push(truncated_content);
        
        let text_to_embed = parts.join("\n\n");
        
        if text_to_embed.trim().is_empty() {
            continue;
        }
        
        // Generate embedding
        match generate_embedding_direct(&text_to_embed, &embedding_model, provider_url.as_deref(), api_key.as_deref()).await {
            Ok(result) => {
                let conn = pool_clone.get().map_err(|e| format!("Database error: {}", e))?;
                if let Err(e) = url_attachments::store_url_embedding(
                    &conn,
                    &url_attachment.id,
                    &result.embedding,
                    &embedding_model,
                ) {
                    let err_msg = format!("Failed to store URL embedding: {}", e);
                    log::warn!("{}", err_msg);
                    if errors.len() < 5 {
                        errors.push(err_msg);
                    }
                } else {
                    url_embedded_count += 1;
                }
            }
            Err(e) => {
                let err_msg = format!("URL embedding failed for {}: {}", url_attachment.url, e);
                log::warn!("{}", err_msg);
                if errors.len() < 5 {
                    errors.push(err_msg);
                }
            }
        }
    }
    
    log::info!("[Reindex] Complete: {} notes, {} URLs embedded", embedded_count, url_embedded_count);
    
    Ok(ReindexResult {
        embedded_count,
        total_notes,
        url_embedded_count,
        total_urls,
        errors,
    })
}

/// Embed a single note (respects auto_embed setting)
#[tauri::command]
pub async fn embed_note(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<bool, String> {
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    // This command is called automatically when notes are saved,
    // so it respects the auto_embed setting
    embed_note_internal(&pool_clone, &note_id, true).await
}

/// Force embed a single note (ignores auto_embed setting)
#[tauri::command]
pub async fn force_embed_note(
    pool: State<'_, AppPool>,
    note_id: String,
) -> Result<bool, String> {
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    embed_note_internal(&pool_clone, &note_id, false).await
}

/// Embed multiple notes in batch
#[tauri::command]
pub async fn embed_notes_batch(
    pool: State<'_, AppPool>,
    note_ids: Vec<String>,
) -> Result<u32, String> {
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    let mut embedded_count = 0u32;
    
    for note_id in note_ids {
        // Force embed (don't check auto_embed setting)
        match embed_note_internal(&pool_clone, &note_id, false).await {
            Ok(true) => embedded_count += 1,
            Ok(false) => {}
            Err(e) => log::warn!("Failed to embed note {}: {}", note_id, e),
        }
    }
    
    Ok(embedded_count)
}

/// Internal helper for embedding a note
/// If check_auto_embed is true, respects the auto_embed config setting
async fn embed_note_internal(
    pool: &DbPool,
    note_id: &str,
    check_auto_embed: bool,
) -> Result<bool, String> {
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
    
    // Get the note
    let note = db::notes::get_note(&conn, note_id)
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Note not found: {}", note_id))?;
    
    // Get embedding config
    let config = load_ai_config(&conn)?;
    
    // Skip if auto-embed is disabled (only when check_auto_embed is true)
    if check_auto_embed && !config.embedding.auto_embed {
        return Ok(false);
    }
    
    // Extract text from attachments referenced in the note
    let attachment_text = extract_attachments_text(&note.content, Some(10000));
    
    // Prepare text to embed (title + content + attachment text)
    let base_content = note.content.unwrap_or_default();
    let text_to_embed = if attachment_text.is_empty() {
        format!("{}\n\n{}", note.title, base_content)
    } else {
        format!(
            "{}\n\n{}\n\n--- Attached Document Content ---\n{}",
            note.title, base_content, attachment_text
        )
    };
    
    if text_to_embed.trim().is_empty() {
        return Ok(false);
    }
    
    let full_model_id = config.embedding.full_model_id();
    
    // Get the provider's base URL and API key for direct calls
    let embedding_provider = config.providers.iter()
        .find(|p| p.id == config.embedding.provider);
    let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
    let api_key = embedding_provider.and_then(|p| p.api_key.clone());
    
    log::info!("[Embedding] Note: {}, Provider: {}, Model: {}, Full ID: {}, Provider URL: {:?}, has API key: {}", 
        note_id, 
        config.embedding.provider, 
        config.embedding.model, 
        full_model_id,
        provider_url,
        api_key.is_some()
    );
    
    // Generate embedding using direct provider call
    let result = generate_embedding_direct(&text_to_embed, &full_model_id, provider_url.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| {
            log::error!("[Embedding] Failed for note {}: {}", note_id, e);
            format!("Failed to generate embedding: {}", e)
        })?;
    
    // Store embedding
    db::embeddings::store_embedding(
        &conn,
        note_id,
        &result.embedding,
        &full_model_id,
        Some(&result.model),
    )
    .map_err(|e| format!("Failed to store embedding: {}", e))?;
    
    Ok(true)
}

/// Create a snippet around query terms
fn create_snippet(content: &str, query: &str, max_len: usize) -> String {
    let content_lower = content.to_lowercase();
    let query_lower = query.to_lowercase();
    
    // Try to find a query term in the content
    for term in query_lower.split_whitespace() {
        if let Some(pos) = content_lower.find(term) {
            // Calculate snippet boundaries
            let start = pos.saturating_sub(max_len / 4);
            let end = (pos + term.len() + max_len * 3 / 4).min(content.len());
            
            // Find word boundaries
            let start = content[..start]
                .rfind(char::is_whitespace)
                .map(|p| p + 1)
                .unwrap_or(start);
            let end = content[end..]
                .find(char::is_whitespace)
                .map(|p| end + p)
                .unwrap_or(end);
            
            let mut snippet = content[start..end].to_string();
            if start > 0 {
                snippet = format!("...{}", snippet);
            }
            if end < content.len() {
                snippet = format!("{}...", snippet);
            }
            return snippet;
        }
    }

    // Fallback: just truncate
    truncate_content(content, max_len)
}

/// Truncate content to a maximum length
fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        return content.to_string();
    }

    // Find a word boundary
    let truncated = &content[..max_len];
    if let Some(pos) = truncated.rfind(char::is_whitespace) {
        format!("{}...", &truncated[..pos])
    } else {
        format!("{}...", truncated)
    }
}
