//! Settings storage
//!
//! Generic key-value settings storage using the settings table.

#![allow(dead_code)]

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SettingsError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
}

/// Get a setting value by key
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, SettingsError> {
    let result: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;

    Ok(result)
}

/// Set a setting value
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), SettingsError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;

    Ok(())
}

/// Delete a setting
pub fn delete_setting(conn: &Connection, key: &str) -> Result<bool, SettingsError> {
    let rows_affected = conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(rows_affected > 0)
}

/// Get all settings as key-value pairs
pub fn get_all_settings(conn: &Connection) -> Result<Vec<(String, String)>, SettingsError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    
    let settings: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(Result::ok)
        .collect();

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_get_set_setting() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        // Initially no setting
        assert!(get_setting(&conn, "test_key").unwrap().is_none());

        // Set a value
        set_setting(&conn, "test_key", "test_value").unwrap();
        assert_eq!(
            get_setting(&conn, "test_key").unwrap(),
            Some("test_value".to_string())
        );

        // Update the value
        set_setting(&conn, "test_key", "new_value").unwrap();
        assert_eq!(
            get_setting(&conn, "test_key").unwrap(),
            Some("new_value".to_string())
        );
    }

    #[test]
    fn test_delete_setting() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        set_setting(&conn, "delete_test", "value").unwrap();
        assert!(get_setting(&conn, "delete_test").unwrap().is_some());

        delete_setting(&conn, "delete_test").unwrap();
        assert!(get_setting(&conn, "delete_test").unwrap().is_none());
    }
}
