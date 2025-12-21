//! Tauri commands for knowledge graph visualization

use crate::db;
use crate::AppPool;
use serde::{Deserialize, Serialize};
use tauri::State;

/// A node in the knowledge graph (represents a note)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub link_count: u32,
    pub created_at: String,
    pub updated_at: String,
}

/// An edge in the knowledge graph (represents a link between notes)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub edge_type: String, // "link" or "similarity"
    pub weight: Option<f32>,
}

/// Complete graph data for visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Get all graph data (nodes and edges) for knowledge graph visualization
#[tauri::command]
pub async fn get_graph_data(
    pool: State<'_, AppPool>,
    include_similarity: Option<bool>,
    similarity_threshold: Option<f32>,
) -> Result<GraphData, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    // Get all notes as nodes
    let notes = db::notes::get_all_notes(&conn)
        .map_err(|e| format!("Failed to get notes: {}", e))?;

    // Get all links
    let links = db::links::get_all_links(&conn)
        .map_err(|e| format!("Failed to get links: {}", e))?;

    // Build link count map
    let mut link_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for link in &links {
        *link_counts.entry(link.source_note_id.clone()).or_insert(0) += 1;
        *link_counts.entry(link.target_note_id.clone()).or_insert(0) += 1;
    }

    // Convert notes to graph nodes
    let nodes: Vec<GraphNode> = notes
        .into_iter()
        .filter(|n| !n.is_deleted)
        .map(|n| GraphNode {
            id: n.id.clone(),
            title: n.title,
            folder_id: n.folder_id,
            link_count: *link_counts.get(&n.id).unwrap_or(&0),
            created_at: n.created_at.to_rfc3339(),
            updated_at: n.updated_at.to_rfc3339(),
        })
        .collect();

    // Convert links to graph edges
    let mut edges: Vec<GraphEdge> = links
        .into_iter()
        .map(|l| GraphEdge {
            source: l.source_note_id,
            target: l.target_note_id,
            edge_type: "link".to_string(),
            weight: Some(1.0),
        })
        .collect();

    // Optionally add similarity edges
    if include_similarity.unwrap_or(false) {
        let threshold = similarity_threshold.unwrap_or(0.7);
        
        // Get similarity edges for notes that have embeddings
        if let Ok(similarity_edges) = get_similarity_edges(&conn, threshold) {
            edges.extend(similarity_edges);
        }
    }

    Ok(GraphData { nodes, edges })
}

/// Get similarity edges between notes based on embedding similarity
fn get_similarity_edges(
    conn: &rusqlite::Connection,
    threshold: f32,
) -> Result<Vec<GraphEdge>, String> {
    // Query to find note pairs with high similarity
    // This uses sqlite-vec to compute cosine similarity between all embedding pairs
    let mut stmt = conn
        .prepare(
            "SELECT 
                e1.note_id as source,
                e2.note_id as target,
                (1.0 - vec_distance_cosine(e1.embedding, e2.embedding) / 2.0) as similarity
             FROM note_embeddings e1
             JOIN note_embeddings e2 ON e1.note_id < e2.note_id
             JOIN notes n1 ON n1.id = e1.note_id
             JOIN notes n2 ON n2.id = e2.note_id
             WHERE n1.is_deleted = FALSE 
               AND n2.is_deleted = FALSE
               AND e1.dimension = e2.dimension
             HAVING similarity >= ?1
             ORDER BY similarity DESC
             LIMIT 500",
        )
        .map_err(|e| format!("Failed to prepare similarity query: {}", e))?;

    let edges: Vec<GraphEdge> = stmt
        .query_map([threshold as f64], |row| {
            let source: String = row.get(0)?;
            let target: String = row.get(1)?;
            let similarity: f64 = row.get(2)?;
            Ok(GraphEdge {
                source,
                target,
                edge_type: "similarity".to_string(),
                weight: Some(similarity as f32),
            })
        })
        .map_err(|e| format!("Failed to query similarities: {}", e))?
        .filter_map(Result::ok)
        .collect();

    Ok(edges)
}

