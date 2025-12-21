use directories::ProjectDirs;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::OpenFlags;
use sqlite_vec::sqlite3_vec_init;
use std::fs;
use std::path::PathBuf;
use std::sync::Once;
use thiserror::Error;

use super::migrations::{self, MigrationError};

pub type DbPool = Pool<SqliteConnectionManager>;

static SQLITE_VEC_INIT: Once = Once::new();

/// Initialize sqlite-vec extension globally
fn init_sqlite_vec() {
    SQLITE_VEC_INIT.call_once(|| {
        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        }
        log::info!("sqlite-vec extension initialized");
    });
}

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Failed to get application data directory")]
    NoAppDataDir,
    #[error("Vault not configured")]
    VaultNotConfigured,
    #[error("Failed to create database directory: {0}")]
    CreateDirError(#[from] std::io::Error),
    #[error("Database connection error: {0}")]
    ConnectionError(#[from] r2d2::Error),
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Migration error: {0}")]
    MigrationError(#[from] MigrationError),
}

/// Get the path to the legacy application data directory
/// This is used for migration from older versions
pub fn get_legacy_app_data_dir() -> Result<PathBuf, DbError> {
    ProjectDirs::from("com", "inkling", "Inkling")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .ok_or(DbError::NoAppDataDir)
}

/// Get the path to the legacy SQLite database file
pub fn get_legacy_db_path() -> Result<PathBuf, DbError> {
    let data_dir = get_legacy_app_data_dir()?;
    Ok(data_dir.join("inkling.db"))
}

/// Get the path to the legacy search index directory
pub fn get_legacy_search_index_path() -> Result<PathBuf, DbError> {
    let data_dir = get_legacy_app_data_dir()?;
    Ok(data_dir.join("search_index"))
}

/// Get the path to the SQLite database file
/// Uses the vault path if configured, otherwise falls back to legacy path
pub fn get_db_path() -> Result<PathBuf, DbError> {
    // Try vault-based path first
    if let Some(vault_path) = crate::vault::get_current_vault_path() {
        let inkling_dir = vault_path.join(".inkling");
        fs::create_dir_all(&inkling_dir)?;
        return Ok(inkling_dir.join("inkling.db"));
    }
    
    // Fall back to legacy path for initial setup / migration
    get_legacy_db_path()
}

/// Get the path to the search index directory
/// Uses the vault path if configured, otherwise falls back to legacy path
pub fn get_search_index_path() -> Result<PathBuf, DbError> {
    // Try vault-based path first
    if let Some(vault_path) = crate::vault::get_current_vault_path() {
        let inkling_dir = vault_path.join(".inkling");
        fs::create_dir_all(&inkling_dir)?;
        return Ok(inkling_dir.join("search_index"));
    }
    
    // Fall back to legacy path
    get_legacy_search_index_path()
}

/// Initialize the database connection pool at a specific path
pub fn init_pool_at_path(db_path: &PathBuf) -> Result<DbPool, DbError> {
    // Initialize sqlite-vec extension before creating any connections
    init_sqlite_vec();

    // Ensure the directory exists
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Configure SQLite connection
    let manager = SqliteConnectionManager::file(db_path).with_flags(
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    );

    let pool = Pool::builder().max_size(10).build(manager)?;

    // Configure the database and run migrations
    {
        let conn = pool.get()?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;

        // Run migrations
        migrations::run_migrations(&conn)?;
    }

    Ok(pool)
}

/// Initialize the database connection pool
pub fn init_pool() -> Result<DbPool, DbError> {
    let db_path = get_db_path()?;
    init_pool_at_path(&db_path)
}

/// Initialize a pool at the vault location
pub fn init_vault_pool() -> Result<DbPool, DbError> {
    let vault_path = crate::vault::get_current_vault_path()
        .ok_or(DbError::VaultNotConfigured)?;
    
    let inkling_dir = vault_path.join(".inkling");
    fs::create_dir_all(&inkling_dir)?;
    
    let db_path = inkling_dir.join("inkling.db");
    init_pool_at_path(&db_path)
}

/// Initialize a pool at the legacy location (for migration)
pub fn init_legacy_pool() -> Result<DbPool, DbError> {
    let db_path = get_legacy_db_path()?;
    if !db_path.exists() {
        return Err(DbError::NoAppDataDir);
    }
    init_pool_at_path(&db_path)
}

/// Check if there's a legacy database to migrate
pub fn has_legacy_database() -> bool {
    get_legacy_db_path()
        .map(|p| p.exists())
        .unwrap_or(false)
}

#[cfg(test)]
pub fn init_test_pool() -> Result<DbPool, DbError> {
    // Initialize sqlite-vec extension
    init_sqlite_vec();

    // Use in-memory database for tests
    let manager = SqliteConnectionManager::memory();
    let pool = Pool::builder().max_size(1).build(manager)?;

    {
        let conn = pool.get()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        migrations::run_migrations(&conn)?;
    }

    Ok(pool)
}
