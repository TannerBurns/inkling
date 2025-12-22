//! Exports database operations
//!
//! Handles CRUD operations for document exports metadata.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExportDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Export not found: {0}")]
    NotFound(String),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// Export format types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Docx,
    Xlsx,
    Pptx,
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl ExportFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExportFormat::Pdf => "pdf",
            ExportFormat::Docx => "docx",
            ExportFormat::Xlsx => "xlsx",
            ExportFormat::Pptx => "pptx",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "pdf" => Some(ExportFormat::Pdf),
            "docx" => Some(ExportFormat::Docx),
            "xlsx" => Some(ExportFormat::Xlsx),
            "pptx" => Some(ExportFormat::Pptx),
            _ => None,
        }
    }

}

/// Export record from database
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub id: String,
    pub filename: String,
    pub title: String,
    pub format: ExportFormat,
    pub source_note_ids: Vec<String>,
    pub file_size: Option<i64>,
    pub path: String,
    pub created_at: String,
}

/// Input for creating a new export
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExportInput {
    pub filename: String,
    pub title: String,
    pub format: ExportFormat,
    pub source_note_ids: Vec<String>,
    pub file_size: Option<i64>,
    pub path: String,
}

/// Create a new export record
pub fn create_export(conn: &Connection, input: CreateExportInput) -> Result<Export, ExportDbError> {
    let id = uuid::Uuid::new_v4().to_string();
    let source_note_ids_json = serde_json::to_string(&input.source_note_ids)?;

    conn.execute(
        "INSERT INTO exports (id, filename, title, format, source_note_ids, file_size, path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            input.filename,
            input.title,
            input.format.as_str(),
            source_note_ids_json,
            input.file_size,
            input.path,
        ],
    )?;

    get_export(conn, &id)?.ok_or_else(|| ExportDbError::NotFound(id))
}

/// Get an export by ID
pub fn get_export(conn: &Connection, id: &str) -> Result<Option<Export>, ExportDbError> {
    let result = conn
        .query_row(
            "SELECT id, filename, title, format, source_note_ids, file_size, path, created_at
             FROM exports WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()?;

    if let Some((id, filename, title, format_str, source_note_ids_json, file_size, path, created_at)) = result {
        let format = ExportFormat::from_str(&format_str)
            .ok_or_else(|| ExportDbError::NotFound(format!("Invalid format: {}", format_str)))?;
        
        let source_note_ids: Vec<String> = source_note_ids_json
            .map(|json| serde_json::from_str(&json).unwrap_or_default())
            .unwrap_or_default();

        Ok(Some(Export {
            id,
            filename,
            title,
            format,
            source_note_ids,
            file_size,
            path,
            created_at,
        }))
    } else {
        Ok(None)
    }
}

/// Get all exports, ordered by creation date (newest first)
pub fn get_all_exports(conn: &Connection) -> Result<Vec<Export>, ExportDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, title, format, source_note_ids, file_size, path, created_at
         FROM exports ORDER BY created_at DESC",
    )?;

    let exports = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<i64>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
        ))
    })?;

    let mut result = Vec::new();
    for export in exports {
        let (id, filename, title, format_str, source_note_ids_json, file_size, path, created_at) = export?;
        
        if let Some(format) = ExportFormat::from_str(&format_str) {
            let source_note_ids: Vec<String> = source_note_ids_json
                .map(|json| serde_json::from_str(&json).unwrap_or_default())
                .unwrap_or_default();

            result.push(Export {
                id,
                filename,
                title,
                format,
                source_note_ids,
                file_size,
                path,
                created_at,
            });
        }
    }

    Ok(result)
}

/// Get exports by format
pub fn get_exports_by_format(conn: &Connection, format: &ExportFormat) -> Result<Vec<Export>, ExportDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, title, format, source_note_ids, file_size, path, created_at
         FROM exports WHERE format = ?1 ORDER BY created_at DESC",
    )?;

    let exports = stmt.query_map([format.as_str()], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<i64>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
        ))
    })?;

    let mut result = Vec::new();
    for export in exports {
        let (id, filename, title, format_str, source_note_ids_json, file_size, path, created_at) = export?;
        
        if let Some(fmt) = ExportFormat::from_str(&format_str) {
            let source_note_ids: Vec<String> = source_note_ids_json
                .map(|json| serde_json::from_str(&json).unwrap_or_default())
                .unwrap_or_default();

            result.push(Export {
                id,
                filename,
                title,
                format: fmt,
                source_note_ids,
                file_size,
                path,
                created_at,
            });
        }
    }

    Ok(result)
}

/// Delete an export record (does not delete the file)
pub fn delete_export(conn: &Connection, id: &str) -> Result<bool, ExportDbError> {
    let rows_affected = conn.execute("DELETE FROM exports WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_and_get_export() {
        let conn = setup_test_db();

        let input = CreateExportInput {
            filename: "test-export-2024-12-21.pdf".to_string(),
            title: "Test Export".to_string(),
            format: ExportFormat::Pdf,
            source_note_ids: vec!["note-1".to_string(), "note-2".to_string()],
            file_size: Some(12345),
            path: "/path/to/exports/test-export-2024-12-21.pdf".to_string(),
        };

        let export = create_export(&conn, input).unwrap();
        assert_eq!(export.title, "Test Export");
        assert_eq!(export.format, ExportFormat::Pdf);
        assert_eq!(export.source_note_ids.len(), 2);

        let retrieved = get_export(&conn, &export.id).unwrap().unwrap();
        assert_eq!(retrieved.id, export.id);
        assert_eq!(retrieved.filename, "test-export-2024-12-21.pdf");
    }

    #[test]
    fn test_get_all_exports() {
        let conn = setup_test_db();

        for i in 0..3 {
            let input = CreateExportInput {
                filename: format!("export-{}.pdf", i),
                title: format!("Export {}", i),
                format: ExportFormat::Pdf,
                source_note_ids: vec![],
                file_size: None,
                path: format!("/path/to/export-{}.pdf", i),
            };
            create_export(&conn, input).unwrap();
        }

        let exports = get_all_exports(&conn).unwrap();
        assert_eq!(exports.len(), 3);
    }

    #[test]
    fn test_delete_export() {
        let conn = setup_test_db();

        let input = CreateExportInput {
            filename: "to-delete.pdf".to_string(),
            title: "To Delete".to_string(),
            format: ExportFormat::Pdf,
            source_note_ids: vec![],
            file_size: None,
            path: "/path/to/to-delete.pdf".to_string(),
        };

        let export = create_export(&conn, input).unwrap();
        let deleted = delete_export(&conn, &export.id).unwrap();
        assert!(deleted);

        let retrieved = get_export(&conn, &export.id).unwrap();
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_export_format() {
        assert_eq!(ExportFormat::Pdf.as_str(), "pdf");
        assert_eq!(ExportFormat::Docx.as_str(), "docx");
        assert_eq!(ExportFormat::from_str("xlsx"), Some(ExportFormat::Xlsx));
    }
}

