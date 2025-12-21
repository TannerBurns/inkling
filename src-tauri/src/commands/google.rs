//! Tauri commands for Google integration
//!
//! Provides commands for Google OAuth authentication and Calendar sync.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::google::{self, GoogleAccount};
use crate::google::calendar::SyncResult;
use crate::AppPool;

/// Serializable Google account info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleConnectionStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub connected_at: Option<String>,
}

/// Check if Google Client ID is configured (from database, env var, or compile-time)
#[tauri::command]
pub async fn is_google_configured(pool: State<'_, AppPool>) -> Result<bool, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;
    
    Ok(google::oauth::get_client_id_with_db(&conn).is_ok())
}

/// Initiate Google OAuth flow
/// Opens the browser to Google's OAuth consent screen
#[tauri::command]
pub async fn initiate_google_auth(pool: State<'_, AppPool>) -> Result<GoogleAccount, String> {
    // Clone the pool Arc to use across await points
    let db_pool = {
        let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
        pool_guard.clone().ok_or("Database not initialized")?
    };

    google::oauth::initiate_auth_with_pool(&db_pool)
        .await
        .map_err(|e| e.to_string())
}

/// Get current Google connection status
#[tauri::command]
pub async fn get_google_connection_status(
    pool: State<'_, AppPool>,
) -> Result<GoogleConnectionStatus, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    match google::get_connection_status(&conn) {
        Ok(Some(account)) => Ok(GoogleConnectionStatus {
            connected: true,
            email: Some(account.email),
            connected_at: Some(account.connected_at),
        }),
        Ok(None) => Ok(GoogleConnectionStatus {
            connected: false,
            email: None,
            connected_at: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Disconnect Google account
#[tauri::command]
pub async fn disconnect_google_account(pool: State<'_, AppPool>) -> Result<(), String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    google::disconnect_account(&conn).map_err(|e| e.to_string())
}

/// Sync Google Calendar events for a date range
#[tauri::command]
pub async fn sync_google_calendar(
    pool: State<'_, AppPool>,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<SyncResult, String> {
    // Clone the pool Arc to use across await points
    let db_pool = {
        let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
        pool_guard.clone().ok_or("Database not initialized")?
    };

    google::calendar::sync_events_to_db_with_pool(&db_pool, start, end)
        .await
        .map_err(|e| e.to_string())
}

/// Get meeting info for creating a note from a Google event
#[tauri::command]
pub async fn get_event_meeting_info(
    pool: State<'_, AppPool>,
    event_id: String,
) -> Result<Option<crate::google::calendar::EventMeetingInfo>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    // Get the event
    let event = crate::db::calendar_events::get_event(&conn, &event_id)
        .map_err(|e| e.to_string())?;
    
    match event {
        Some(e) => {
            let info = google::calendar::parse_meeting_info(e.description.as_deref());
            Ok(Some(info))
        }
        None => Ok(None),
    }
}

/// Save Google OAuth credentials to settings
#[tauri::command]
pub async fn save_google_credentials(
    pool: State<'_, AppPool>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    // Save to settings table
    crate::db::settings::set_setting(&conn, "google_client_id", &client_id)
        .map_err(|e| e.to_string())?;
    crate::db::settings::set_setting(&conn, "google_client_secret", &client_secret)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear saved Google OAuth credentials
#[tauri::command]
pub async fn clear_google_credentials(pool: State<'_, AppPool>) -> Result<(), String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    // Delete from settings table
    crate::db::settings::delete_setting(&conn, "google_client_id")
        .map_err(|e| e.to_string())?;
    crate::db::settings::delete_setting(&conn, "google_client_secret")
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the source of Google credentials
/// Returns: "database", "environment", "embedded", or "none"
#[tauri::command]
pub async fn get_google_credential_source(pool: State<'_, AppPool>) -> Result<String, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let db_pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    // Check database first
    if let Ok(Some(id)) = crate::db::settings::get_setting(&conn, "google_client_id") {
        if !id.is_empty() {
            return Ok("database".to_string());
        }
    }

    // Check environment variable
    if std::env::var("GOOGLE_CLIENT_ID").is_ok() {
        return Ok("environment".to_string());
    }

    // Check embedded/compile-time
    if crate::google::config::EMBEDDED_CLIENT_ID.is_some() {
        return Ok("embedded".to_string());
    }

    Ok("none".to_string())
}

