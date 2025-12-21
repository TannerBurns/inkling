//! Database operations for wiki-style note links
//!
//! Manages the `note_links` table that tracks connections between notes
//! created via `[[note]]` syntax.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LinkDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
}

/// A link between two notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub source_note_id: String,
    pub target_note_id: String,
    pub context: Option<String>,
}

/// A backlink with source note information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub source_note_id: String,
    pub source_title: String,
    pub context: Option<String>,
}

/// Input for creating/updating a link
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub target_note_id: String,
    pub context: Option<String>,
}

/// Create a link from source to target
pub fn create_link(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
    context: Option<&str>,
) -> Result<(), LinkDbError> {
    conn.execute(
        "INSERT OR REPLACE INTO note_links (source_note_id, target_note_id, context)
         VALUES (?1, ?2, ?3)",
        params![source_id, target_id, context],
    )?;
    Ok(())
}

/// Delete a specific link
pub fn delete_link(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<bool, LinkDbError> {
    let rows_affected = conn.execute(
        "DELETE FROM note_links WHERE source_note_id = ?1 AND target_note_id = ?2",
        params![source_id, target_id],
    )?;
    Ok(rows_affected > 0)
}

/// Delete all outgoing links from a note
pub fn delete_outgoing_links(conn: &Connection, source_id: &str) -> Result<u32, LinkDbError> {
    let rows_affected = conn.execute(
        "DELETE FROM note_links WHERE source_note_id = ?1",
        [source_id],
    )?;
    Ok(rows_affected as u32)
}

/// Get all outgoing links from a note
pub fn get_outgoing_links(conn: &Connection, source_id: &str) -> Result<Vec<NoteLink>, LinkDbError> {
    let mut stmt = conn.prepare(
        "SELECT source_note_id, target_note_id, context
         FROM note_links
         WHERE source_note_id = ?1",
    )?;

    let links = stmt
        .query_map([source_id], |row| {
            Ok(NoteLink {
                source_note_id: row.get(0)?,
                target_note_id: row.get(1)?,
                context: row.get(2)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(links)
}

/// Get all backlinks to a note (notes that link TO this note)
pub fn get_backlinks(conn: &Connection, target_id: &str) -> Result<Vec<Backlink>, LinkDbError> {
    let mut stmt = conn.prepare(
        "SELECT nl.source_note_id, n.title, nl.context
         FROM note_links nl
         JOIN notes n ON n.id = nl.source_note_id
         WHERE nl.target_note_id = ?1 AND n.is_deleted = FALSE
         ORDER BY n.updated_at DESC",
    )?;

    let backlinks = stmt
        .query_map([target_id], |row| {
            Ok(Backlink {
                source_note_id: row.get(0)?,
                source_title: row.get(1)?,
                context: row.get(2)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(backlinks)
}

/// Check if a specific link exists
pub fn link_exists(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<bool, LinkDbError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM note_links WHERE source_note_id = ?1 AND target_note_id = ?2",
        params![source_id, target_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Sync all outgoing links for a note
/// Replaces all existing links with the new set
pub fn sync_links(
    conn: &Connection,
    source_id: &str,
    links: &[LinkInput],
) -> Result<(), LinkDbError> {
    // Delete existing outgoing links
    delete_outgoing_links(conn, source_id)?;

    // Insert new links
    for link in links {
        create_link(conn, source_id, &link.target_note_id, link.context.as_deref())?;
    }

    Ok(())
}

/// Get link count for a note (both outgoing and incoming)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkStats {
    pub outgoing_count: u32,
    pub incoming_count: u32,
}

pub fn get_link_stats(conn: &Connection, note_id: &str) -> Result<LinkStats, LinkDbError> {
    let outgoing_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM note_links WHERE source_note_id = ?1",
        [note_id],
        |row| row.get(0),
    )?;

    let incoming_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM note_links WHERE target_note_id = ?1",
        [note_id],
        |row| row.get(0),
    )?;

    Ok(LinkStats {
        outgoing_count: outgoing_count as u32,
        incoming_count: incoming_count as u32,
    })
}

/// Search notes by title for autocomplete
/// Returns note ID and title for matching notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
}

pub fn search_notes_by_title(
    conn: &Connection,
    query: &str,
    exclude_id: Option<&str>,
    limit: usize,
) -> Result<Vec<NoteSummary>, LinkDbError> {
    let search_pattern = format!("%{}%", query);

    let mut stmt = if let Some(exclude) = exclude_id {
        let mut stmt = conn.prepare(
            "SELECT id, title, folder_id FROM notes
             WHERE title LIKE ?1 AND is_deleted = FALSE AND id != ?2
             ORDER BY updated_at DESC
             LIMIT ?3",
        )?;
        let results = stmt
            .query_map(params![search_pattern, exclude, limit as i64], |row| {
                Ok(NoteSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    folder_id: row.get(2)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();
        return Ok(results);
    } else {
        conn.prepare(
            "SELECT id, title, folder_id FROM notes
             WHERE title LIKE ?1 AND is_deleted = FALSE
             ORDER BY updated_at DESC
             LIMIT ?2",
        )?
    };

    let results = stmt
        .query_map(params![search_pattern, limit as i64], |row| {
            Ok(NoteSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                folder_id: row.get(2)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    fn setup_test_notes(conn: &Connection) {
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES ('note1', 'First Note', 'Content 1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES ('note2', 'Second Note', 'Content 2')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES ('note3', 'Third Note', 'Content 3')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn test_create_and_get_link() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        setup_test_notes(&conn);

        create_link(&conn, "note1", "note2", Some("linked in context")).unwrap();

        let links = get_outgoing_links(&conn, "note1").unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target_note_id, "note2");
        assert_eq!(links[0].context, Some("linked in context".to_string()));
    }

    #[test]
    fn test_get_backlinks() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        setup_test_notes(&conn);

        create_link(&conn, "note1", "note3", Some("context 1")).unwrap();
        create_link(&conn, "note2", "note3", Some("context 2")).unwrap();

        let backlinks = get_backlinks(&conn, "note3").unwrap();
        assert_eq!(backlinks.len(), 2);
    }

    #[test]
    fn test_sync_links() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        setup_test_notes(&conn);

        // Initial links
        create_link(&conn, "note1", "note2", None).unwrap();

        // Sync with new set
        sync_links(
            &conn,
            "note1",
            &[
                LinkInput {
                    target_note_id: "note3".to_string(),
                    context: Some("new link".to_string()),
                },
            ],
        )
        .unwrap();

        let links = get_outgoing_links(&conn, "note1").unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target_note_id, "note3");
    }

    #[test]
    fn test_delete_link() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        setup_test_notes(&conn);

        create_link(&conn, "note1", "note2", None).unwrap();
        assert!(link_exists(&conn, "note1", "note2").unwrap());

        delete_link(&conn, "note1", "note2").unwrap();
        assert!(!link_exists(&conn, "note1", "note2").unwrap());
    }

    #[test]
    fn test_search_notes_by_title() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();
        setup_test_notes(&conn);

        let results = search_notes_by_title(&conn, "Note", None, 10).unwrap();
        assert_eq!(results.len(), 3);

        let results = search_notes_by_title(&conn, "First", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "First Note");

        // Test exclusion
        let results = search_notes_by_title(&conn, "Note", Some("note1"), 10).unwrap();
        assert_eq!(results.len(), 2);
    }
}
