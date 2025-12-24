//! Embedding storage and vector similarity search using sqlite-vec
//!
//! Stores note embeddings as BLOBs and uses sqlite-vec functions
//! for efficient similarity search.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EmbeddingDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Embedding not found for note: {0}")]
    NotFound(String),
    #[error("Invalid embedding data")]
    InvalidData,
}

/// Stored embedding data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredEmbedding {
    pub note_id: String,
    pub dimension: u32,
    pub model: String,
    pub model_version: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Result of a similarity search
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarityResult {
    pub note_id: String,
    /// Similarity score (higher is more similar, 0-1 for cosine similarity)
    pub score: f32,
    /// Distance (lower is more similar)
    pub distance: f32,
}

/// Store an embedding for a note
pub fn store_embedding(
    conn: &Connection,
    note_id: &str,
    embedding: &[f32],
    model: &str,
    model_version: Option<&str>,
) -> Result<(), EmbeddingDbError> {
    // Serialize embedding to bytes (little-endian f32 values)
    let embedding_bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    conn.execute(
        "INSERT INTO note_embeddings (note_id, embedding, dimension, model, model_version, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(note_id) DO UPDATE SET
             embedding = excluded.embedding,
             dimension = excluded.dimension,
             model = excluded.model,
             model_version = excluded.model_version,
             updated_at = datetime('now')",
        params![
            note_id,
            embedding_bytes,
            embedding.len() as i32,
            model,
            model_version,
        ],
    )?;

    Ok(())
}

/// Get the embedding for a note
pub fn get_embedding(
    conn: &Connection,
    note_id: &str,
) -> Result<Option<Vec<f32>>, EmbeddingDbError> {
    let result: Option<Vec<u8>> = conn
        .query_row(
            "SELECT embedding FROM note_embeddings WHERE note_id = ?1",
            [note_id],
            |row| row.get(0),
        )
        .optional()?;

    match result {
        Some(bytes) => Ok(Some(bytes_to_embedding(&bytes)?)),
        None => Ok(None),
    }
}

/// Find notes similar to the given embedding using cosine similarity
pub fn search_similar(
    conn: &Connection,
    query_embedding: &[f32],
    limit: usize,
    min_similarity: Option<f32>,
) -> Result<Vec<SimilarityResult>, EmbeddingDbError> {
    let query_dimension = query_embedding.len() as i32;
    
    // Serialize query embedding to bytes
    let query_bytes: Vec<u8> = query_embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    // Log the query for debugging
    log::debug!(
        "[search_similar] Query dimension: {}, limit: {}, min_similarity: {:?}",
        query_dimension, limit, min_similarity
    );

    // Use sqlite-vec's vec_distance_cosine function for similarity search
    // Lower distance = more similar, so we calculate similarity as 1 - distance
    // IMPORTANT: Filter by dimension to avoid NULL results from vec_distance_cosine
    // when comparing vectors of different dimensions
    let mut stmt = conn.prepare(
        "SELECT 
            ne.note_id,
            vec_distance_cosine(ne.embedding, ?1) as distance
         FROM note_embeddings ne
         JOIN notes n ON n.id = ne.note_id
         WHERE n.is_deleted = FALSE
           AND ne.dimension = ?3
         ORDER BY distance ASC
         LIMIT ?2",
    )?;

    let mut results: Vec<SimilarityResult> = Vec::new();
    let mut error_count = 0;

    let rows = stmt.query_map(params![query_bytes, limit as i64, query_dimension], |row| {
        let note_id: String = row.get(0)?;
        // Handle potential NULL from vec_distance_cosine (shouldn't happen with dimension filter, but be safe)
        let distance: Option<f64> = row.get(1)?;
        Ok((note_id, distance))
    })?;

    for row_result in rows {
        match row_result {
            Ok((note_id, Some(distance))) => {
                let score = 1.0 - (distance as f32 / 2.0);
                
                // Apply minimum similarity filter
                if let Some(min) = min_similarity {
                    if score < min {
                        continue;
                    }
                }
                
                results.push(SimilarityResult {
                    note_id,
                    distance: distance as f32,
                    score,
                });
            }
            Ok((note_id, None)) => {
                // This shouldn't happen with dimension filtering, but log if it does
                log::warn!(
                    "[search_similar] NULL distance for note_id: {} - possible dimension mismatch",
                    note_id
                );
                error_count += 1;
            }
            Err(e) => {
                log::warn!("[search_similar] Row error: {}", e);
                error_count += 1;
            }
        }
    }

    if error_count > 0 {
        log::warn!(
            "[search_similar] {} errors/NULL distances encountered during search",
            error_count
        );
    }

    log::debug!("[search_similar] Returning {} results", results.len());
    Ok(results)
}

/// Find notes similar to a given note
pub fn search_similar_to_note(
    conn: &Connection,
    note_id: &str,
    limit: usize,
    min_similarity: Option<f32>,
) -> Result<Vec<SimilarityResult>, EmbeddingDbError> {
    log::debug!("[search_similar_to_note] Finding notes similar to: {}", note_id);
    
    // Get the note's embedding
    let embedding = get_embedding(conn, note_id)?
        .ok_or_else(|| {
            log::warn!("[search_similar_to_note] No embedding found for note: {}", note_id);
            EmbeddingDbError::NotFound(note_id.to_string())
        })?;

    log::debug!(
        "[search_similar_to_note] Found embedding with dimension: {}",
        embedding.len()
    );

    // Search for similar notes, excluding the source note
    let mut results = search_similar(conn, &embedding, limit + 1, min_similarity)?;
    
    // Remove the source note from results
    results.retain(|r| r.note_id != note_id);
    
    // Trim to requested limit
    results.truncate(limit);

    log::debug!(
        "[search_similar_to_note] Returning {} similar notes",
        results.len()
    );
    Ok(results)
}

/// Get embedding statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStats {
    pub total_notes: u32,
    pub embedded_notes: u32,
    pub pending_notes: u32,
    pub stale_notes: u32,
    pub current_model: Option<String>,
}

pub fn get_embedding_stats(
    conn: &Connection,
    _current_model: &str,
) -> Result<EmbeddingStats, EmbeddingDbError> {
    let total_notes: u32 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE is_deleted = FALSE",
        [],
        |row| row.get(0),
    )?;

    let embedded_notes: u32 = conn.query_row(
        "SELECT COUNT(*) FROM note_embeddings ne
         JOIN notes n ON n.id = ne.note_id
         WHERE n.is_deleted = FALSE",
        [],
        |row| row.get(0),
    )?;

    let stale_notes: u32 = conn.query_row(
        "SELECT COUNT(*) FROM notes n
         JOIN note_embeddings ne ON ne.note_id = n.id
         WHERE n.is_deleted = FALSE AND n.updated_at > ne.updated_at",
        [],
        |row| row.get(0),
    )?;

    let model_in_use: Option<String> = conn
        .query_row(
            "SELECT model FROM note_embeddings LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;

    Ok(EmbeddingStats {
        total_notes,
        embedded_notes,
        pending_notes: total_notes - embedded_notes + stale_notes,
        stale_notes,
        current_model: model_in_use,
    })
}

/// Delete all embeddings (useful when changing models)
pub fn delete_all_embeddings(conn: &Connection) -> Result<u32, EmbeddingDbError> {
    let rows_affected = conn.execute("DELETE FROM note_embeddings", [])?;
    Ok(rows_affected as u32)
}

/// Convert bytes back to embedding vector
fn bytes_to_embedding(bytes: &[u8]) -> Result<Vec<f32>, EmbeddingDbError> {
    if bytes.len() % 4 != 0 {
        return Err(EmbeddingDbError::InvalidData);
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

    #[test]
    fn test_store_and_get_embedding() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        // First create a note
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES ('note1', 'Test', 'Content')",
            [],
        )
        .unwrap();

        // Store embedding
        let embedding = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        store_embedding(&conn, "note1", &embedding, "test-model", Some("v1")).unwrap();

        // Get embedding
        let retrieved = get_embedding(&conn, "note1").unwrap().unwrap();
        assert_eq!(embedding.len(), retrieved.len());
        for (a, b) in embedding.iter().zip(retrieved.iter()) {
            assert!((a - b).abs() < 0.0001);
        }
    }

    #[test]
    fn test_bytes_to_embedding() {
        let original = vec![0.1f32, 0.2, 0.3, 0.4];
        let bytes: Vec<u8> = original.iter().flat_map(|f| f.to_le_bytes()).collect();
        
        let restored = bytes_to_embedding(&bytes).unwrap();
        assert_eq!(original.len(), restored.len());
        for (a, b) in original.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 0.0001);
        }
    }
}
