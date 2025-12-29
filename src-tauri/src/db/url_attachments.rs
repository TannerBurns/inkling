//! URL attachment storage and embedding operations
//!
//! Handles CRUD operations for URL attachments linked to notes,
//! as well as URL-specific embeddings for semantic search.

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum UrlAttachmentDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("URL attachment not found: {0}")]
    NotFound(String),
    #[error("Invalid embedding data")]
    InvalidData,
    #[error("Duplicate URL: {0}")]
    DuplicateUrl(String),
}

/// Status of URL content fetching
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum UrlStatus {
    Pending,
    Fetching,
    Indexed,
    Error,
}

impl UrlStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            UrlStatus::Pending => "pending",
            UrlStatus::Fetching => "fetching",
            UrlStatus::Indexed => "indexed",
            UrlStatus::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => UrlStatus::Pending,
            "fetching" => UrlStatus::Fetching,
            "indexed" => UrlStatus::Indexed,
            "error" => UrlStatus::Error,
            _ => UrlStatus::Pending,
        }
    }
}

/// A URL attachment linked to a note
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlAttachment {
    pub id: String,
    pub note_id: String,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub links: Option<String>, // JSON array of outbound links
    pub image_url: Option<String>,   // OG image for preview cards
    pub favicon_url: Option<String>, // Favicon for display
    pub site_name: Option<String>,   // Site name from og:site_name
    pub fetched_at: Option<DateTime<Utc>>,
    pub status: UrlStatus,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new URL attachment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUrlAttachmentInput {
    pub note_id: String,
    pub url: String,
}

/// Input for updating URL attachment content after fetching
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUrlContentInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub links: Option<String>,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
    pub site_name: Option<String>,
}

/// Result of a URL similarity search
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSimilarityResult {
    pub url_attachment_id: String,
    pub note_id: String,
    pub url: String,
    pub title: Option<String>,
    /// Similarity score (higher is more similar, 0-1 for cosine similarity)
    pub score: f32,
    /// Distance (lower is more similar)
    pub distance: f32,
}

/// Parse a datetime string from SQLite into a DateTime<Utc>
fn parse_datetime(s: &str) -> DateTime<Utc> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc);
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Utc.from_utc_datetime(&naive);
    }
    Utc::now()
}

/// Parse an optional datetime string
fn parse_optional_datetime(s: Option<String>) -> Option<DateTime<Utc>> {
    s.map(|s| parse_datetime(&s))
}

/// Map a database row to a UrlAttachment struct
/// Expected column order: id, note_id, url, title, description, content, links, 
///                        image_url, favicon_url, site_name, fetched_at, status, 
///                        error_message, created_at, updated_at
fn row_to_url_attachment(row: &Row) -> Result<UrlAttachment, rusqlite::Error> {
    let status_str: String = row.get(11)?;
    let created_at_str: String = row.get(13)?;
    let updated_at_str: String = row.get(14)?;
    let fetched_at_str: Option<String> = row.get(10)?;

    Ok(UrlAttachment {
        id: row.get(0)?,
        note_id: row.get(1)?,
        url: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        content: row.get(5)?,
        links: row.get(6)?,
        image_url: row.get(7)?,
        favicon_url: row.get(8)?,
        site_name: row.get(9)?,
        fetched_at: parse_optional_datetime(fetched_at_str),
        status: UrlStatus::from_str(&status_str),
        error_message: row.get(12)?,
        created_at: parse_datetime(&created_at_str),
        updated_at: parse_datetime(&updated_at_str),
    })
}

/// Create a new URL attachment
pub fn create_url_attachment(
    conn: &Connection,
    input: CreateUrlAttachmentInput,
) -> Result<UrlAttachment, UrlAttachmentDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Try to insert, handle unique constraint violation
    let result = conn.execute(
        "INSERT INTO url_attachments (id, note_id, url, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'pending', ?4, ?5)",
        params![id, input.note_id, input.url, now, now],
    );

    match result {
        Ok(_) => get_url_attachment(conn, &id)?.ok_or(UrlAttachmentDbError::NotFound(id)),
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            Err(UrlAttachmentDbError::DuplicateUrl(input.url))
        }
        Err(e) => Err(UrlAttachmentDbError::SqliteError(e)),
    }
}

/// Get a URL attachment by ID
pub fn get_url_attachment(
    conn: &Connection,
    id: &str,
) -> Result<Option<UrlAttachment>, UrlAttachmentDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments WHERE id = ?1",
    )?;

    let attachment = stmt.query_row([id], row_to_url_attachment).optional()?;
    Ok(attachment)
}

/// Get all URL attachments for a note
pub fn get_url_attachments_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<UrlAttachment>, UrlAttachmentDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments WHERE note_id = ?1 ORDER BY created_at DESC",
    )?;

    let attachments = stmt
        .query_map([note_id], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    Ok(attachments)
}

/// Normalize a URL for comparison by removing trailing slashes, 
/// lowercasing, and stripping common prefixes like www.
fn normalize_url_for_comparison(url: &str) -> String {
    let mut normalized = url.trim().to_lowercase();
    
    // Remove trailing slash
    while normalized.ends_with('/') {
        normalized.pop();
    }
    
    // Normalize www prefix by removing it for comparison
    normalized = normalized
        .replace("://www.", "://")
        .replace("http://", "https://"); // Treat http and https as equivalent
    
    normalized
}

/// Get URL attachments by URL (across all notes)
/// Uses flexible matching - first tries exact match, then normalized match,
/// then partial match as fallback.
pub fn get_url_attachments_by_url(
    conn: &Connection,
    url: &str,
) -> Result<Vec<UrlAttachment>, UrlAttachmentDbError> {
    // First, try exact match
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments WHERE url = ?1 AND status = 'indexed' ORDER BY created_at DESC",
    )?;

    let attachments: Vec<UrlAttachment> = stmt
        .query_map([url], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    if !attachments.is_empty() {
        return Ok(attachments);
    }

    // If no exact match, try to find URLs that match after normalization
    let normalized_query = normalize_url_for_comparison(url);
    
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments WHERE status = 'indexed' ORDER BY created_at DESC",
    )?;

    let all_indexed: Vec<UrlAttachment> = stmt
        .query_map([], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    // Find URLs that match after normalization
    let matching: Vec<UrlAttachment> = all_indexed
        .into_iter()
        .filter(|a| normalize_url_for_comparison(&a.url) == normalized_query)
        .collect();

    if !matching.is_empty() {
        return Ok(matching);
    }

    // Last resort: try partial match (URL contains or is contained by the query)
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments 
         WHERE status = 'indexed' 
         AND (url LIKE ?1 OR ?2 LIKE '%' || url || '%')
         ORDER BY created_at DESC",
    )?;

    let partial_pattern = format!("%{}%", url.trim_matches('/'));
    let attachments: Vec<UrlAttachment> = stmt
        .query_map([&partial_pattern, url], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    Ok(attachments)
}

/// Get all pending URL attachments (for background processing)
pub fn get_pending_url_attachments(
    conn: &Connection,
) -> Result<Vec<UrlAttachment>, UrlAttachmentDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments WHERE status = 'pending' ORDER BY created_at ASC",
    )?;

    let attachments = stmt
        .query_map([], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    Ok(attachments)
}

/// Update URL attachment status
pub fn update_url_attachment_status(
    conn: &Connection,
    id: &str,
    status: UrlStatus,
    error_message: Option<&str>,
) -> Result<(), UrlAttachmentDbError> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE url_attachments SET status = ?1, error_message = ?2, updated_at = ?3 WHERE id = ?4",
        params![status.as_str(), error_message, now, id],
    )?;

    Ok(())
}

/// Update URL attachment content after successful fetch
pub fn update_url_attachment_content(
    conn: &Connection,
    id: &str,
    input: UpdateUrlContentInput,
) -> Result<UrlAttachment, UrlAttachmentDbError> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE url_attachments 
         SET title = ?1, description = ?2, content = ?3, links = ?4, 
             image_url = ?5, favicon_url = ?6, site_name = ?7,
             status = 'indexed', fetched_at = ?8, updated_at = ?8, error_message = NULL
         WHERE id = ?9",
        params![
            input.title, input.description, input.content, input.links,
            input.image_url, input.favicon_url, input.site_name,
            now, id
        ],
    )?;

    get_url_attachment(conn, id)?.ok_or(UrlAttachmentDbError::NotFound(id.to_string()))
}

/// Delete a URL attachment
pub fn delete_url_attachment(conn: &Connection, id: &str) -> Result<bool, UrlAttachmentDbError> {
    let rows_affected = conn.execute("DELETE FROM url_attachments WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Delete all URL attachments for a note
#[allow(dead_code)]
pub fn delete_url_attachments_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<u32, UrlAttachmentDbError> {
    let rows_affected =
        conn.execute("DELETE FROM url_attachments WHERE note_id = ?1", [note_id])?;
    Ok(rows_affected as u32)
}

// ============================================================================
// URL Embedding Operations
// ============================================================================

/// Store an embedding for a URL attachment
pub fn store_url_embedding(
    conn: &Connection,
    url_attachment_id: &str,
    embedding: &[f32],
    model: &str,
) -> Result<(), UrlAttachmentDbError> {
    // Serialize embedding to bytes (little-endian f32 values)
    let embedding_bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

    conn.execute(
        "INSERT INTO url_embeddings (url_attachment_id, embedding, dimension, model, created_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(url_attachment_id) DO UPDATE SET
             embedding = excluded.embedding,
             dimension = excluded.dimension,
             model = excluded.model,
             created_at = datetime('now')",
        params![url_attachment_id, embedding_bytes, embedding.len() as i32, model],
    )?;

    Ok(())
}

/// Get the embedding for a URL attachment
#[allow(dead_code)]
pub fn get_url_embedding(
    conn: &Connection,
    url_attachment_id: &str,
) -> Result<Option<Vec<f32>>, UrlAttachmentDbError> {
    let result: Option<Vec<u8>> = conn
        .query_row(
            "SELECT embedding FROM url_embeddings WHERE url_attachment_id = ?1",
            [url_attachment_id],
            |row| row.get(0),
        )
        .optional()?;

    match result {
        Some(bytes) => Ok(Some(bytes_to_embedding(&bytes)?)),
        None => Ok(None),
    }
}

/// Search for similar URLs based on embedding
/// Searches both legacy single embeddings AND chunked embeddings, returning the best match per URL
pub fn search_similar_urls(
    conn: &Connection,
    query_embedding: &[f32],
    limit: usize,
    min_similarity: Option<f32>,
) -> Result<Vec<UrlSimilarityResult>, UrlAttachmentDbError> {
    use std::collections::HashMap;
    
    let query_dimension = query_embedding.len() as i32;

    // Serialize query embedding to bytes
    let query_bytes: Vec<u8> = query_embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    // Map to track best result per URL attachment (keep the one with lowest distance)
    let mut best_by_url: HashMap<String, UrlSimilarityResult> = HashMap::new();

    // Search legacy single embeddings
    {
        let mut stmt = conn.prepare(
            "SELECT 
                ue.url_attachment_id,
                ua.note_id,
                ua.url,
                ua.title,
                vec_distance_cosine(ue.embedding, ?1) as distance
             FROM url_embeddings ue
             JOIN url_attachments ua ON ua.id = ue.url_attachment_id
             WHERE ue.dimension = ?3
             ORDER BY distance ASC
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![&query_bytes, (limit * 2) as i64, query_dimension], |row| {
            let url_attachment_id: String = row.get(0)?;
            let note_id: String = row.get(1)?;
            let url: String = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let distance: Option<f64> = row.get(4)?;
            Ok((url_attachment_id, note_id, url, title, distance))
        })?;

        for row_result in rows {
            match row_result {
                Ok((url_attachment_id, note_id, url, title, Some(distance))) => {
                    let score = 1.0 - (distance as f32 / 2.0);

                    if let Some(min) = min_similarity {
                        if score < min {
                            continue;
                        }
                    }

                    let result = UrlSimilarityResult {
                        url_attachment_id: url_attachment_id.clone(),
                        note_id,
                        url,
                        title,
                        distance: distance as f32,
                        score,
                    };

                    // Keep best result per URL attachment
                    best_by_url.entry(url_attachment_id)
                        .and_modify(|existing| {
                            if result.distance < existing.distance {
                                *existing = result.clone();
                            }
                        })
                        .or_insert(result);
                }
                Ok((_, _, _, _, None)) => continue,
                Err(e) => {
                    log::warn!("[search_similar_urls] Legacy embedding row error: {}", e);
                }
            }
        }
    }

    // Search chunk embeddings
    {
        let mut stmt = conn.prepare(
            "SELECT 
                uec.url_attachment_id,
                ua.note_id,
                ua.url,
                ua.title,
                vec_distance_cosine(uec.embedding, ?1) as distance
             FROM url_embedding_chunks uec
             JOIN url_attachments ua ON ua.id = uec.url_attachment_id
             WHERE uec.dimension = ?3
             ORDER BY distance ASC
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![&query_bytes, (limit * 2) as i64, query_dimension], |row| {
            let url_attachment_id: String = row.get(0)?;
            let note_id: String = row.get(1)?;
            let url: String = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let distance: Option<f64> = row.get(4)?;
            Ok((url_attachment_id, note_id, url, title, distance))
        })?;

        for row_result in rows {
            match row_result {
                Ok((url_attachment_id, note_id, url, title, Some(distance))) => {
                    let score = 1.0 - (distance as f32 / 2.0);

                    if let Some(min) = min_similarity {
                        if score < min {
                            continue;
                        }
                    }

                    let result = UrlSimilarityResult {
                        url_attachment_id: url_attachment_id.clone(),
                        note_id,
                        url,
                        title,
                        distance: distance as f32,
                        score,
                    };

                    // Keep best result per URL attachment
                    best_by_url.entry(url_attachment_id)
                        .and_modify(|existing| {
                            if result.distance < existing.distance {
                                *existing = result.clone();
                            }
                        })
                        .or_insert(result);
                }
                Ok((_, _, _, _, None)) => continue,
                Err(e) => {
                    log::warn!("[search_similar_urls] Chunk embedding row error: {}", e);
                }
            }
        }
    }

    // Sort by distance and take top results
    let mut results: Vec<UrlSimilarityResult> = best_by_url.into_values().collect();
    results.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}

/// Get all indexed URL content for a specific note (for RAG context)
pub fn get_indexed_url_content_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<UrlAttachment>, UrlAttachmentDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at
         FROM url_attachments 
         WHERE note_id = ?1 AND status = 'indexed' AND content IS NOT NULL
         ORDER BY created_at DESC",
    )?;

    let attachments = stmt
        .query_map([note_id], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();

    Ok(attachments)
}

/// Get all indexed URL attachments (those with content, for re-embedding)
pub fn get_all_indexed_url_attachments(
    conn: &Connection,
) -> Result<Vec<UrlAttachment>, UrlAttachmentDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, url, title, description, content, links, 
                image_url, favicon_url, site_name, fetched_at, status, 
                error_message, created_at, updated_at 
         FROM url_attachments 
         WHERE status = 'indexed' AND content IS NOT NULL",
    )?;
    let attachments: Vec<UrlAttachment> = stmt
        .query_map([], row_to_url_attachment)?
        .filter_map(Result::ok)
        .collect();
    Ok(attachments)
}

/// Delete all URL embeddings (useful when changing models)
pub fn delete_all_url_embeddings(conn: &Connection) -> Result<u32, UrlAttachmentDbError> {
    let rows_affected = conn.execute("DELETE FROM url_embeddings", [])?;
    Ok(rows_affected as u32)
}

/// Delete URL embedding
pub fn delete_url_embedding(
    conn: &Connection,
    url_attachment_id: &str,
) -> Result<bool, UrlAttachmentDbError> {
    let rows_affected = conn.execute(
        "DELETE FROM url_embeddings WHERE url_attachment_id = ?1",
        [url_attachment_id],
    )?;
    Ok(rows_affected > 0)
}

// ============================================================================
// URL Embedding Chunk Operations
// ============================================================================

/// An embedding chunk for a URL attachment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlEmbeddingChunk {
    pub id: String,
    pub url_attachment_id: String,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub char_start: i32,
    pub char_end: i32,
    pub dimension: i32,
    pub model: String,
}

/// Result of a chunk similarity search
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlChunkSimilarityResult {
    pub url_attachment_id: String,
    pub chunk_id: String,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub note_id: String,
    pub url: String,
    pub title: Option<String>,
    /// Similarity score (higher is more similar, 0-1 for cosine similarity)
    pub score: f32,
    /// Distance (lower is more similar)
    pub distance: f32,
}

/// Store embedding chunks for a URL attachment
/// This replaces any existing chunks for the URL attachment
pub fn store_url_embedding_chunks(
    conn: &Connection,
    url_attachment_id: &str,
    chunks: &[(String, usize, usize, Vec<f32>)], // (chunk_text, char_start, char_end, embedding)
    model: &str,
) -> Result<usize, UrlAttachmentDbError> {
    // Delete existing chunks for this URL attachment
    conn.execute(
        "DELETE FROM url_embedding_chunks WHERE url_attachment_id = ?1",
        [url_attachment_id],
    )?;

    let mut stored = 0;
    for (chunk_index, (chunk_text, char_start, char_end, embedding)) in chunks.iter().enumerate() {
        let id = Uuid::new_v4().to_string();
        let embedding_bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        conn.execute(
            "INSERT INTO url_embedding_chunks 
             (id, url_attachment_id, chunk_index, chunk_text, char_start, char_end, 
              embedding, dimension, model, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            params![
                id,
                url_attachment_id,
                chunk_index as i32,
                chunk_text,
                *char_start as i32,
                *char_end as i32,
                embedding_bytes,
                embedding.len() as i32,
                model
            ],
        )?;
        stored += 1;
    }

    Ok(stored)
}

/// Search for similar URL chunks based on embedding
#[allow(dead_code)]
pub fn search_similar_url_chunks(
    conn: &Connection,
    query_embedding: &[f32],
    limit: usize,
    min_similarity: Option<f32>,
) -> Result<Vec<UrlChunkSimilarityResult>, UrlAttachmentDbError> {
    let query_dimension = query_embedding.len() as i32;

    // Serialize query embedding to bytes
    let query_bytes: Vec<u8> = query_embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    let mut stmt = conn.prepare(
        "SELECT 
            uec.url_attachment_id,
            uec.id as chunk_id,
            uec.chunk_index,
            uec.chunk_text,
            ua.note_id,
            ua.url,
            ua.title,
            vec_distance_cosine(uec.embedding, ?1) as distance
         FROM url_embedding_chunks uec
         JOIN url_attachments ua ON ua.id = uec.url_attachment_id
         WHERE uec.dimension = ?3
         ORDER BY distance ASC
         LIMIT ?2",
    )?;

    let mut results: Vec<UrlChunkSimilarityResult> = Vec::new();

    let rows = stmt.query_map(params![query_bytes, limit as i64, query_dimension], |row| {
        let url_attachment_id: String = row.get(0)?;
        let chunk_id: String = row.get(1)?;
        let chunk_index: i32 = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let note_id: String = row.get(4)?;
        let url: String = row.get(5)?;
        let title: Option<String> = row.get(6)?;
        let distance: Option<f64> = row.get(7)?;
        Ok((url_attachment_id, chunk_id, chunk_index, chunk_text, note_id, url, title, distance))
    })?;

    for row_result in rows {
        match row_result {
            Ok((url_attachment_id, chunk_id, chunk_index, chunk_text, note_id, url, title, Some(distance))) => {
                let score = 1.0 - (distance as f32 / 2.0);

                // Apply minimum similarity filter
                if let Some(min) = min_similarity {
                    if score < min {
                        continue;
                    }
                }

                results.push(UrlChunkSimilarityResult {
                    url_attachment_id,
                    chunk_id,
                    chunk_index,
                    chunk_text,
                    note_id,
                    url,
                    title,
                    distance: distance as f32,
                    score,
                });
            }
            Ok((_, _, _, _, _, _, _, None)) => {
                // NULL distance - dimension mismatch or other issue
                continue;
            }
            Err(e) => {
                log::warn!("[search_similar_url_chunks] Row error: {}", e);
            }
        }
    }

    Ok(results)
}

/// Delete all URL embedding chunks (useful when changing models)
#[allow(dead_code)]
pub fn delete_all_url_embedding_chunks(conn: &Connection) -> Result<u32, UrlAttachmentDbError> {
    let rows_affected = conn.execute("DELETE FROM url_embedding_chunks", [])?;
    Ok(rows_affected as u32)
}

/// Delete URL embedding chunks for a specific URL attachment
#[allow(dead_code)]
pub fn delete_url_embedding_chunks(
    conn: &Connection,
    url_attachment_id: &str,
) -> Result<bool, UrlAttachmentDbError> {
    let rows_affected = conn.execute(
        "DELETE FROM url_embedding_chunks WHERE url_attachment_id = ?1",
        [url_attachment_id],
    )?;
    Ok(rows_affected > 0)
}

/// Get chunk count for a URL attachment
#[allow(dead_code)]
pub fn get_url_embedding_chunk_count(
    conn: &Connection,
    url_attachment_id: &str,
) -> Result<u32, UrlAttachmentDbError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM url_embedding_chunks WHERE url_attachment_id = ?1",
        [url_attachment_id],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

/// Convert bytes back to embedding vector
fn bytes_to_embedding(bytes: &[u8]) -> Result<Vec<f32>, UrlAttachmentDbError> {
    if bytes.len() % 4 != 0 {
        return Err(UrlAttachmentDbError::InvalidData);
    }

    let embedding: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| {
            let arr: [u8; 4] = chunk.try_into().unwrap();
            f32::from_le_bytes(arr)
        })
        .collect();

    Ok(embedding)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    fn setup_test_note(conn: &Connection) -> String {
        let note_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES (?1, 'Test Note', 'Test content')",
            [&note_id],
        )
        .unwrap();
        note_id
    }

    #[test]
    fn test_create_and_get_url_attachment() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        let input = CreateUrlAttachmentInput {
            note_id: note_id.clone(),
            url: "https://example.com/article".to_string(),
        };

        let attachment = create_url_attachment(&conn, input).unwrap();
        assert_eq!(attachment.note_id, note_id);
        assert_eq!(attachment.url, "https://example.com/article");
        assert_eq!(attachment.status, UrlStatus::Pending);

        let fetched = get_url_attachment(&conn, &attachment.id).unwrap().unwrap();
        assert_eq!(fetched.id, attachment.id);
    }

    #[test]
    fn test_duplicate_url_prevention() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        let input = CreateUrlAttachmentInput {
            note_id: note_id.clone(),
            url: "https://example.com/duplicate".to_string(),
        };

        // First insert should succeed
        create_url_attachment(&conn, input.clone()).unwrap();

        // Second insert with same URL should fail
        let result = create_url_attachment(&conn, input);
        assert!(matches!(result, Err(UrlAttachmentDbError::DuplicateUrl(_))));
    }

    #[test]
    fn test_update_url_content() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        let input = CreateUrlAttachmentInput {
            note_id,
            url: "https://example.com/content".to_string(),
        };

        let attachment = create_url_attachment(&conn, input).unwrap();

        let update = UpdateUrlContentInput {
            title: Some("Example Article".to_string()),
            description: Some("An example article description".to_string()),
            content: Some("The full article content goes here...".to_string()),
            links: Some(r#"["https://example.com/link1", "https://example.com/link2"]"#.to_string()),
            image_url: Some("https://example.com/image.jpg".to_string()),
            favicon_url: Some("https://example.com/favicon.ico".to_string()),
            site_name: Some("Example Site".to_string()),
        };

        let updated = update_url_attachment_content(&conn, &attachment.id, update).unwrap();
        assert_eq!(updated.title, Some("Example Article".to_string()));
        assert_eq!(updated.status, UrlStatus::Indexed);
        assert!(updated.fetched_at.is_some());
    }

    #[test]
    fn test_store_and_get_url_embedding() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        let input = CreateUrlAttachmentInput {
            note_id,
            url: "https://example.com/embed".to_string(),
        };

        let attachment = create_url_attachment(&conn, input).unwrap();

        let embedding = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        store_url_embedding(&conn, &attachment.id, &embedding, "test-model").unwrap();

        let retrieved = get_url_embedding(&conn, &attachment.id).unwrap().unwrap();
        assert_eq!(embedding.len(), retrieved.len());
        for (a, b) in embedding.iter().zip(retrieved.iter()) {
            assert!((a - b).abs() < 0.0001);
        }
    }

    #[test]
    fn test_delete_url_attachment_cascades_embedding() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        let input = CreateUrlAttachmentInput {
            note_id,
            url: "https://example.com/cascade".to_string(),
        };

        let attachment = create_url_attachment(&conn, input).unwrap();
        let embedding = vec![0.1, 0.2, 0.3];
        store_url_embedding(&conn, &attachment.id, &embedding, "test-model").unwrap();

        // Delete attachment - should cascade to embedding
        delete_url_attachment(&conn, &attachment.id).unwrap();

        // Embedding should be gone
        let retrieved = get_url_embedding(&conn, &attachment.id).unwrap();
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_normalize_url_for_comparison() {
        // Test trailing slash removal
        assert_eq!(
            normalize_url_for_comparison("https://example.com/page/"),
            normalize_url_for_comparison("https://example.com/page")
        );
        
        // Test www normalization
        assert_eq!(
            normalize_url_for_comparison("https://www.example.com/page"),
            normalize_url_for_comparison("https://example.com/page")
        );
        
        // Test http/https equivalence
        assert_eq!(
            normalize_url_for_comparison("http://example.com/page"),
            normalize_url_for_comparison("https://example.com/page")
        );
        
        // Test case insensitivity
        assert_eq!(
            normalize_url_for_comparison("https://Example.COM/Page"),
            normalize_url_for_comparison("https://example.com/page")
        );
        
        // Test combined normalization
        assert_eq!(
            normalize_url_for_comparison("HTTP://WWW.Example.COM/Page/"),
            normalize_url_for_comparison("https://example.com/page")
        );
    }

    #[test]
    fn test_get_url_attachments_by_url_flexible_matching() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        let note_id = setup_test_note(&conn);

        // Create an attachment with a specific URL
        let input = CreateUrlAttachmentInput {
            note_id: note_id.clone(),
            url: "https://www.example.com/article/test".to_string(),
        };
        let attachment = create_url_attachment(&conn, input).unwrap();
        
        // Update to indexed status with content
        let update = UpdateUrlContentInput {
            title: Some("Test Article".to_string()),
            description: None,
            content: Some("Article content".to_string()),
            links: None,
            image_url: None,
            favicon_url: None,
            site_name: None,
        };
        update_url_attachment_content(&conn, &attachment.id, update).unwrap();

        // Test exact match
        let results = get_url_attachments_by_url(&conn, "https://www.example.com/article/test").unwrap();
        assert_eq!(results.len(), 1);

        // Test without www
        let results = get_url_attachments_by_url(&conn, "https://example.com/article/test").unwrap();
        assert_eq!(results.len(), 1);

        // Test with trailing slash
        let results = get_url_attachments_by_url(&conn, "https://www.example.com/article/test/").unwrap();
        assert_eq!(results.len(), 1);

        // Test with http instead of https
        let results = get_url_attachments_by_url(&conn, "http://www.example.com/article/test").unwrap();
        assert_eq!(results.len(), 1);
    }
}

