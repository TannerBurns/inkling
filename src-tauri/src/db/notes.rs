use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{CreateNoteInput, Note, UpdateNoteInput};

#[derive(Error, Debug)]
pub enum NoteDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Note not found: {0}")]
    NotFound(String),
}

/// Parse a datetime string from SQLite into a DateTime<Utc>
fn parse_datetime(s: &str) -> DateTime<Utc> {
    // SQLite stores datetimes as strings, try common formats
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc);
    }
    // Try SQLite's default format
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Utc.from_utc_datetime(&naive);
    }
    // Fallback to now if parsing fails
    Utc::now()
}

/// Map a database row to a Note struct
fn row_to_note(row: &Row) -> Result<Note, rusqlite::Error> {
    let created_at_str: String = row.get(5)?;
    let updated_at_str: String = row.get(6)?;

    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        content_html: row.get(3)?,
        folder_id: row.get(4)?,
        created_at: parse_datetime(&created_at_str),
        updated_at: parse_datetime(&updated_at_str),
        is_deleted: row.get(7)?,
    })
}

/// Create a new note
pub fn create_note(conn: &Connection, input: CreateNoteInput) -> Result<Note, NoteDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO notes (id, title, content, content_html, folder_id, created_at, updated_at, is_deleted)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, FALSE)",
        params![
            id,
            input.title,
            input.content,
            input.content_html,
            input.folder_id,
            now,
            now,
        ],
    )?;

    get_note(conn, &id)?.ok_or(NoteDbError::NotFound(id))
}

/// Get a note by ID
pub fn get_note(conn: &Connection, id: &str) -> Result<Option<Note>, NoteDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, content_html, folder_id, created_at, updated_at, is_deleted
         FROM notes WHERE id = ?1",
    )?;

    let note = stmt.query_row([id], row_to_note).optional()?;
    Ok(note)
}

/// Get all non-deleted notes
pub fn get_all_notes(conn: &Connection) -> Result<Vec<Note>, NoteDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, content_html, folder_id, created_at, updated_at, is_deleted
         FROM notes WHERE is_deleted = FALSE ORDER BY updated_at DESC",
    )?;

    let notes = stmt
        .query_map([], row_to_note)?
        .filter_map(Result::ok)
        .collect();

    Ok(notes)
}

/// Get all notes in a specific folder
pub fn get_notes_in_folder(
    conn: &Connection,
    folder_id: Option<&str>,
) -> Result<Vec<Note>, NoteDbError> {
    let mut stmt = if folder_id.is_some() {
        conn.prepare(
            "SELECT id, title, content, content_html, folder_id, created_at, updated_at, is_deleted
             FROM notes WHERE folder_id = ?1 AND is_deleted = FALSE ORDER BY updated_at DESC",
        )?
    } else {
        conn.prepare(
            "SELECT id, title, content, content_html, folder_id, created_at, updated_at, is_deleted
             FROM notes WHERE folder_id IS NULL AND is_deleted = FALSE ORDER BY updated_at DESC",
        )?
    };

    let notes = if let Some(fid) = folder_id {
        stmt.query_map([fid], row_to_note)?
            .filter_map(Result::ok)
            .collect()
    } else {
        stmt.query_map([], row_to_note)?
            .filter_map(Result::ok)
            .collect()
    };

    Ok(notes)
}

/// Update an existing note
pub fn update_note(
    conn: &Connection,
    id: &str,
    input: UpdateNoteInput,
) -> Result<Note, NoteDbError> {
    // First check if the note exists
    let existing = get_note(conn, id)?.ok_or_else(|| NoteDbError::NotFound(id.to_string()))?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let title = input.title.unwrap_or(existing.title);
    let content = input.content.or(existing.content);
    let content_html = input.content_html.or(existing.content_html);
    let folder_id = input.folder_id.or(existing.folder_id);

    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, content_html = ?3, folder_id = ?4, updated_at = ?5
         WHERE id = ?6",
        params![title, content, content_html, folder_id, now, id],
    )?;

    get_note(conn, id)?.ok_or(NoteDbError::NotFound(id.to_string()))
}

/// Soft delete a note (sets is_deleted to true)
pub fn delete_note(conn: &Connection, id: &str) -> Result<bool, NoteDbError> {
    let rows_affected = conn.execute(
        "UPDATE notes SET is_deleted = TRUE, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(), id],
    )?;

    Ok(rows_affected > 0)
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_create_and_get_note() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateNoteInput {
            title: "Test Note".to_string(),
            content: Some("Test content".to_string()),
            content_html: Some("<p>Test content</p>".to_string()),
            folder_id: None,
        };

        let note = create_note(&conn, input).unwrap();
        assert_eq!(note.title, "Test Note");
        assert_eq!(note.content, Some("Test content".to_string()));
        assert!(!note.is_deleted);

        let fetched = get_note(&conn, &note.id).unwrap().unwrap();
        assert_eq!(fetched.id, note.id);
    }

    #[test]
    fn test_update_note() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateNoteInput {
            title: "Original Title".to_string(),
            content: None,
            content_html: None,
            folder_id: None,
        };

        let note = create_note(&conn, input).unwrap();

        let update = UpdateNoteInput {
            title: Some("Updated Title".to_string()),
            content: Some("New content".to_string()),
            content_html: None,
            folder_id: None,
        };

        let updated = update_note(&conn, &note.id, update).unwrap();
        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.content, Some("New content".to_string()));
    }

    #[test]
    fn test_soft_delete() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateNoteInput {
            title: "To Delete".to_string(),
            content: None,
            content_html: None,
            folder_id: None,
        };

        let note = create_note(&conn, input).unwrap();
        assert!(delete_note(&conn, &note.id).unwrap());

        // Note still exists but is marked deleted
        let deleted = get_note(&conn, &note.id).unwrap().unwrap();
        assert!(deleted.is_deleted);

        // But doesn't appear in get_all_notes
        let all = get_all_notes(&conn).unwrap();
        assert!(all.iter().all(|n| n.id != note.id));
    }
}
