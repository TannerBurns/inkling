//! Vault configuration and path management
//!
//! Handles storing and retrieving the vault path, as well as creating
//! new vault structures.

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use thiserror::Error;

/// Global vault path storage (set on app startup)
static VAULT_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("No vault configured")]
    NotConfigured,
    #[error("Invalid vault path: {0}")]
    InvalidPath(String),
    #[error("Failed to create vault: {0}")]
    CreateError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Failed to get app data directory")]
    NoAppDataDir,
}

/// Information about a vault
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub path: String,
    pub notes_count: usize,
    pub has_existing_data: bool,
}

/// Status of the vault configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub is_configured: bool,
    pub path: Option<String>,
    pub is_valid: bool,
}

/// Vault configuration stored in app data directory
#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultConfig {
    vault_path: String,
}

/// Get the app config directory (outside vault, for storing vault path)
fn get_app_config_dir() -> Result<PathBuf, VaultError> {
    ProjectDirs::from("com", "inkling", "Inkling")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or(VaultError::NoAppDataDir)
}

/// Get the path to the vault config file
fn get_vault_config_path() -> Result<PathBuf, VaultError> {
    Ok(get_app_config_dir()?.join("vault.json"))
}

/// Get the old app data directory (for migration)
pub fn get_old_app_data_dir() -> Result<PathBuf, VaultError> {
    ProjectDirs::from("com", "inkling", "Inkling")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .ok_or(VaultError::NoAppDataDir)
}

/// Load vault path from config file
pub fn load_vault_path() -> Result<Option<PathBuf>, VaultError> {
    let config_path = get_vault_config_path()?;
    
    if !config_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&config_path)?;
    let config: VaultConfig = serde_json::from_str(&content)?;
    
    let path = PathBuf::from(&config.vault_path);
    if path.exists() {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

/// Save vault path to config file
pub fn save_vault_path(path: &Path) -> Result<(), VaultError> {
    let config_dir = get_app_config_dir()?;
    fs::create_dir_all(&config_dir)?;
    
    let config = VaultConfig {
        vault_path: path.to_string_lossy().to_string(),
    };
    
    let config_path = get_vault_config_path()?;
    let content = serde_json::to_string_pretty(&config)?;
    fs::write(config_path, content)?;
    
    Ok(())
}

/// Set the current vault path in memory
pub fn set_current_vault_path(path: Option<PathBuf>) {
    let mut vault = VAULT_PATH.write().unwrap();
    *vault = path;
}

/// Get the current vault path from memory
pub fn get_current_vault_path() -> Option<PathBuf> {
    VAULT_PATH.read().unwrap().clone()
}

/// Get the vault status
pub fn get_vault_status() -> VaultStatus {
    let path = get_current_vault_path();
    
    match path {
        Some(p) => VaultStatus {
            is_configured: true,
            path: Some(p.to_string_lossy().to_string()),
            is_valid: validate_vault_path(&p),
        },
        None => VaultStatus {
            is_configured: false,
            path: None,
            is_valid: false,
        },
    }
}

/// Check if a path is a valid vault
pub fn validate_vault_path(path: &Path) -> bool {
    if !path.exists() || !path.is_dir() {
        return false;
    }
    
    // A valid vault has the .inkling directory or notes directory
    let inkling_dir = path.join(".inkling");
    let notes_dir = path.join("notes");
    
    inkling_dir.exists() || notes_dir.exists()
}

/// Create a new vault at the specified path
pub fn create_vault(path: &Path) -> Result<VaultInfo, VaultError> {
    // Create the main vault directory
    fs::create_dir_all(path)?;
    
    // Create subdirectories
    fs::create_dir_all(path.join("notes"))?;
    fs::create_dir_all(path.join("attachments"))?;
    fs::create_dir_all(path.join(".inkling"))?;
    
    // Create a .gitignore for .inkling
    let gitignore_content = "# Inkling internal data\n.inkling/\n";
    fs::write(path.join(".gitignore"), gitignore_content)?;
    
    Ok(VaultInfo {
        path: path.to_string_lossy().to_string(),
        notes_count: 0,
        has_existing_data: false,
    })
}

/// Get vault info for an existing vault
pub fn get_vault_info(path: &Path) -> Result<Option<VaultInfo>, VaultError> {
    if !validate_vault_path(path) {
        return Ok(None);
    }
    
    let notes_dir = path.join("notes");
    let notes_count = if notes_dir.exists() {
        count_markdown_files(&notes_dir)?
    } else {
        0
    };
    
    Ok(Some(VaultInfo {
        path: path.to_string_lossy().to_string(),
        notes_count,
        has_existing_data: notes_count > 0,
    }))
}

/// Count markdown files in a directory recursively
fn count_markdown_files(dir: &Path) -> Result<usize, VaultError> {
    let mut count = 0;
    
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                count += count_markdown_files(&path)?;
            } else if path.extension().map_or(false, |ext| ext == "md") {
                count += 1;
            }
        }
    }
    
    Ok(count)
}

/// Check if there's existing data in the old app data directory
pub fn has_existing_data() -> bool {
    if let Ok(old_dir) = get_old_app_data_dir() {
        let db_path = old_dir.join("inkling.db");
        db_path.exists()
    } else {
        false
    }
}

/// Get paths for vault subdirectories
pub fn get_notes_dir() -> Result<PathBuf, VaultError> {
    let vault = get_current_vault_path().ok_or(VaultError::NotConfigured)?;
    Ok(vault.join("notes"))
}

pub fn get_attachments_dir() -> Result<PathBuf, VaultError> {
    let vault = get_current_vault_path().ok_or(VaultError::NotConfigured)?;
    Ok(vault.join("attachments"))
}

pub fn get_inkling_dir() -> Result<PathBuf, VaultError> {
    let vault = get_current_vault_path().ok_or(VaultError::NotConfigured)?;
    Ok(vault.join(".inkling"))
}

pub fn get_db_path_in_vault() -> Result<PathBuf, VaultError> {
    Ok(get_inkling_dir()?.join("inkling.db"))
}

pub fn get_search_index_path_in_vault() -> Result<PathBuf, VaultError> {
    Ok(get_inkling_dir()?.join("search_index"))
}
