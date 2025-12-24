//! Tag database operations
//!
//! Provides CRUD operations for tags and note-tag associations.

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;
use uuid::Uuid;

use crate::models::Tag;

#[derive(Error, Debug)]
pub enum TagDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Tag not found: {0}")]
    NotFound(String),
    #[error("Tag already exists: {0}")]
    AlreadyExists(String),
}

/// Map a database row to a Tag struct
fn row_to_tag(row: &rusqlite::Row) -> Result<Tag, rusqlite::Error> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
    })
}

/// Get all tags in the database
pub fn get_all_tags(conn: &Connection) -> Result<Vec<Tag>, TagDbError> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")?;
    
    let tags = stmt
        .query_map([], row_to_tag)?
        .filter_map(Result::ok)
        .collect();
    
    Ok(tags)
}

/// Search tags by name (case-insensitive partial match)
pub fn search_tags(conn: &Connection, query: &str) -> Result<Vec<Tag>, TagDbError> {
    let search_pattern = format!("%{}%", query.to_lowercase());
    
    let mut stmt = conn.prepare(
        "SELECT id, name, color FROM tags WHERE LOWER(name) LIKE ?1 ORDER BY name"
    )?;
    
    let tags = stmt
        .query_map([search_pattern], row_to_tag)?
        .filter_map(Result::ok)
        .collect();
    
    Ok(tags)
}

/// Get a tag by ID
pub fn get_tag(conn: &Connection, id: &str) -> Result<Option<Tag>, TagDbError> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags WHERE id = ?1")?;
    let tag = stmt.query_row([id], row_to_tag).optional()?;
    Ok(tag)
}

/// Find a tag by exact name (case-insensitive)
pub fn find_tag_by_name(conn: &Connection, name: &str) -> Result<Option<Tag>, TagDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color FROM tags WHERE LOWER(name) = LOWER(?1)"
    )?;
    let tag = stmt.query_row([name], row_to_tag).optional()?;
    Ok(tag)
}

/// Create a new tag
pub fn create_tag(conn: &Connection, name: &str, color: Option<&str>) -> Result<Tag, TagDbError> {
    // Check if tag with this name already exists
    if let Some(existing) = find_tag_by_name(conn, name)? {
        return Err(TagDbError::AlreadyExists(existing.name));
    }
    
    let id = Uuid::new_v4().to_string();
    let normalized_name = name.to_lowercase().trim().to_string();
    
    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        params![id, normalized_name, color],
    )?;
    
    get_tag(conn, &id)?.ok_or(TagDbError::NotFound(id))
}

/// Find or create a tag by name
/// If a tag with the name exists, returns it. Otherwise creates a new one.
pub fn find_or_create_tag(conn: &Connection, name: &str, color: Option<&str>) -> Result<Tag, TagDbError> {
    if let Some(existing) = find_tag_by_name(conn, name)? {
        return Ok(existing);
    }
    create_tag(conn, name, color)
}

/// Update a tag
pub fn update_tag(conn: &Connection, id: &str, name: Option<&str>, color: Option<&str>) -> Result<Tag, TagDbError> {
    let existing = get_tag(conn, id)?.ok_or_else(|| TagDbError::NotFound(id.to_string()))?;
    
    let new_name = name.map(|n| n.to_lowercase().trim().to_string()).unwrap_or(existing.name);
    let new_color = color.map(|c| Some(c.to_string())).unwrap_or(existing.color);
    
    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![new_name, new_color, id],
    )?;
    
    get_tag(conn, id)?.ok_or(TagDbError::NotFound(id.to_string()))
}

/// Delete a tag (cascades to note_tags)
pub fn delete_tag(conn: &Connection, id: &str) -> Result<bool, TagDbError> {
    let rows_affected = conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Get all tags for a specific note
pub fn get_note_tags(conn: &Connection, note_id: &str) -> Result<Vec<Tag>, TagDbError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color 
         FROM tags t 
         INNER JOIN note_tags nt ON t.id = nt.tag_id 
         WHERE nt.note_id = ?1 
         ORDER BY t.name"
    )?;
    
    let tags = stmt
        .query_map([note_id], row_to_tag)?
        .filter_map(Result::ok)
        .collect();
    
    Ok(tags)
}

/// Add a tag to a note
pub fn add_tag_to_note(conn: &Connection, note_id: &str, tag_id: &str) -> Result<(), TagDbError> {
    // Check if already linked
    let exists: bool = conn.query_row(
        "SELECT 1 FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
        params![note_id, tag_id],
        |_| Ok(true),
    ).optional()?.unwrap_or(false);
    
    if !exists {
        conn.execute(
            "INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, tag_id],
        )?;
    }
    
    Ok(())
}

/// Remove a tag from a note
pub fn remove_tag_from_note(conn: &Connection, note_id: &str, tag_id: &str) -> Result<bool, TagDbError> {
    let rows_affected = conn.execute(
        "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
        params![note_id, tag_id],
    )?;
    Ok(rows_affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_create_and_get_tag() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let tag = create_tag(&conn, "Test Tag", Some("blue")).unwrap();
        assert_eq!(tag.name, "test tag"); // Should be normalized to lowercase
        assert_eq!(tag.color, Some("blue".to_string()));

        let fetched = get_tag(&conn, &tag.id).unwrap().unwrap();
        assert_eq!(fetched.id, tag.id);
    }

    #[test]
    fn test_find_tag_by_name_case_insensitive() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        create_tag(&conn, "machine-learning", Some("blue")).unwrap();
        
        let found = find_tag_by_name(&conn, "MACHINE-LEARNING").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "machine-learning");
    }

    #[test]
    fn test_search_tags() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        create_tag(&conn, "python", Some("blue")).unwrap();
        create_tag(&conn, "python-web", Some("green")).unwrap();
        create_tag(&conn, "rust", Some("orange")).unwrap();

        let results = search_tags(&conn, "python").unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_note_tags() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        // Create a test note first
        let note_id = "test-note-123";
        conn.execute(
            "INSERT INTO notes (id, title, is_deleted) VALUES (?1, ?2, FALSE)",
            params![note_id, "Test Note"],
        ).unwrap();

        let tag1 = create_tag(&conn, "tag1", Some("blue")).unwrap();
        let tag2 = create_tag(&conn, "tag2", Some("red")).unwrap();

        // Add tags to note
        add_tag_to_note(&conn, note_id, &tag1.id).unwrap();
        add_tag_to_note(&conn, note_id, &tag2.id).unwrap();

        let note_tags = get_note_tags(&conn, note_id).unwrap();
        assert_eq!(note_tags.len(), 2);

        // Remove one tag
        remove_tag_from_note(&conn, note_id, &tag1.id).unwrap();
        let note_tags = get_note_tags(&conn, note_id).unwrap();
        assert_eq!(note_tags.len(), 1);
        assert_eq!(note_tags[0].id, tag2.id);
    }

    #[test]
    fn test_find_or_create_tag() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let tag1 = find_or_create_tag(&conn, "new-tag", Some("purple")).unwrap();
        let tag2 = find_or_create_tag(&conn, "new-tag", Some("blue")).unwrap();
        
        // Should return the same tag
        assert_eq!(tag1.id, tag2.id);
        // Color should be from the first creation
        assert_eq!(tag2.color, Some("purple".to_string()));
    }
}
