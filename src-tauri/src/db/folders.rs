use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{CreateFolderInput, Folder, UpdateFolderInput};

#[derive(Error, Debug)]
pub enum FolderDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Folder not found: {0}")]
    NotFound(String),
    #[error("Cannot delete folder with notes")]
    FolderHasNotes,
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

/// Map a database row to a Folder struct
fn row_to_folder(row: &Row) -> Result<Folder, rusqlite::Error> {
    let created_at_str: String = row.get(3)?;

    Ok(Folder {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        created_at: parse_datetime(&created_at_str),
    })
}

/// Create a new folder
pub fn create_folder(conn: &Connection, input: CreateFolderInput) -> Result<Folder, FolderDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, input.name, input.parent_id, now],
    )?;

    get_folder(conn, &id)?.ok_or(FolderDbError::NotFound(id))
}

/// Get a folder by ID
pub fn get_folder(conn: &Connection, id: &str) -> Result<Option<Folder>, FolderDbError> {
    let mut stmt = conn.prepare("SELECT id, name, parent_id, created_at FROM folders WHERE id = ?1")?;

    let folder = stmt.query_row([id], row_to_folder).optional()?;
    Ok(folder)
}

/// Get all folders
pub fn get_all_folders(conn: &Connection) -> Result<Vec<Folder>, FolderDbError> {
    let mut stmt = conn.prepare("SELECT id, name, parent_id, created_at FROM folders ORDER BY name")?;

    let folders = stmt
        .query_map([], row_to_folder)?
        .filter_map(Result::ok)
        .collect();

    Ok(folders)
}

/// Get child folders of a parent (or root folders if parent_id is None)
pub fn get_child_folders(
    conn: &Connection,
    parent_id: Option<&str>,
) -> Result<Vec<Folder>, FolderDbError> {
    let mut stmt = if parent_id.is_some() {
        conn.prepare(
            "SELECT id, name, parent_id, created_at FROM folders WHERE parent_id = ?1 ORDER BY name",
        )?
    } else {
        conn.prepare(
            "SELECT id, name, parent_id, created_at FROM folders WHERE parent_id IS NULL ORDER BY name",
        )?
    };

    let folders = if let Some(pid) = parent_id {
        stmt.query_map([pid], row_to_folder)?
            .filter_map(Result::ok)
            .collect()
    } else {
        stmt.query_map([], row_to_folder)?
            .filter_map(Result::ok)
            .collect()
    };

    Ok(folders)
}

/// Update an existing folder
pub fn update_folder(
    conn: &Connection,
    id: &str,
    input: UpdateFolderInput,
) -> Result<Folder, FolderDbError> {
    let existing = get_folder(conn, id)?.ok_or_else(|| FolderDbError::NotFound(id.to_string()))?;

    let name = input.name.unwrap_or(existing.name);
    let parent_id = input.parent_id.or(existing.parent_id);

    conn.execute(
        "UPDATE folders SET name = ?1, parent_id = ?2 WHERE id = ?3",
        params![name, parent_id, id],
    )?;

    get_folder(conn, id)?.ok_or(FolderDbError::NotFound(id.to_string()))
}

/// Delete a folder (will fail if folder contains notes due to foreign key)
pub fn delete_folder(conn: &Connection, id: &str) -> Result<bool, FolderDbError> {
    // Check if folder has notes
    let note_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE folder_id = ?1 AND is_deleted = FALSE",
        [id],
        |row| row.get(0),
    )?;

    if note_count > 0 {
        return Err(FolderDbError::FolderHasNotes);
    }

    // Update child folders to have no parent (move to root)
    conn.execute(
        "UPDATE folders SET parent_id = NULL WHERE parent_id = ?1",
        [id],
    )?;

    let rows_affected = conn.execute("DELETE FROM folders WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_create_and_get_folder() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateFolderInput {
            name: "Test Folder".to_string(),
            parent_id: None,
        };

        let folder = create_folder(&conn, input).unwrap();
        assert_eq!(folder.name, "Test Folder");
        assert!(folder.parent_id.is_none());

        let fetched = get_folder(&conn, &folder.id).unwrap().unwrap();
        assert_eq!(fetched.id, folder.id);
    }

    #[test]
    fn test_nested_folders() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let parent = create_folder(
            &conn,
            CreateFolderInput {
                name: "Parent".to_string(),
                parent_id: None,
            },
        )
        .unwrap();

        let child = create_folder(
            &conn,
            CreateFolderInput {
                name: "Child".to_string(),
                parent_id: Some(parent.id.clone()),
            },
        )
        .unwrap();

        assert_eq!(child.parent_id, Some(parent.id.clone()));

        let children = get_child_folders(&conn, Some(&parent.id)).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].id, child.id);
    }

    #[test]
    fn test_update_folder() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let folder = create_folder(
            &conn,
            CreateFolderInput {
                name: "Original".to_string(),
                parent_id: None,
            },
        )
        .unwrap();

        let updated = update_folder(
            &conn,
            &folder.id,
            UpdateFolderInput {
                name: Some("Renamed".to_string()),
                parent_id: None,
            },
        )
        .unwrap();

        assert_eq!(updated.name, "Renamed");
    }

    #[test]
    fn test_delete_folder() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let folder = create_folder(
            &conn,
            CreateFolderInput {
                name: "To Delete".to_string(),
                parent_id: None,
            },
        )
        .unwrap();

        assert!(delete_folder(&conn, &folder.id).unwrap());
        assert!(get_folder(&conn, &folder.id).unwrap().is_none());
    }
}
