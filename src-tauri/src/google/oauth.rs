//! Google OAuth 2.0 with PKCE flow
//!
//! Implements secure OAuth authentication for desktop applications using the
//! authorization code flow with PKCE (Proof Key for Code Exchange).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tiny_http::{Response, Server};

use crate::db::connection::DbPool;

/// Google OAuth configuration
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

/// Ports to try for the callback server (in order)
const CALLBACK_PORTS: [u16; 5] = [8234, 8235, 8236, 8237, 8238];

/// Scopes required for calendar read access
const SCOPES: &str = "https://www.googleapis.com/auth/calendar.readonly email profile";

#[derive(Error, Debug)]
pub enum GoogleAuthError {
    #[error("No Google Client ID configured. Set GOOGLE_CLIENT_ID environment variable.")]
    NoClientId,
    #[error("No Google Client Secret configured. Set GOOGLE_CLIENT_SECRET environment variable.")]
    NoClientSecret,
    #[error("Failed to start callback server: {0}")]
    ServerError(String),
    #[error("OAuth callback timeout")]
    Timeout,
    #[error("OAuth error: {0}")]
    OAuthError(String),
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("Database error: {0}")]
    DbError(#[from] rusqlite::Error),
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("No account connected")]
    NotConnected,
    #[error("Token refresh failed: {0}")]
    RefreshFailed(String),
}

/// Google account information stored in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAccount {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub access_token: String,
    #[serde(skip_serializing)]
    pub refresh_token: String,
    pub token_expires_at: Option<i64>,
    pub connected_at: String,
}

/// OAuth token response from Google
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

/// User info response from Google
#[derive(Debug, Deserialize)]
struct UserInfoResponse {
    email: String,
}

/// Generate a cryptographically random code verifier for PKCE
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// Generate code challenge from verifier using S256 method (RFC 7636)
fn generate_code_challenge(verifier: &str) -> String {
    use sha2::{Sha256, Digest};
    
    // SHA256 hash of the verifier
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    
    // Base64url encode (no padding)
    URL_SAFE_NO_PAD.encode(digest)
}

/// Get the Google Client ID from environment or embedded configuration
/// 
/// Priority:
/// 1. GOOGLE_CLIENT_ID environment variable (for development/override)
/// 2. Embedded client ID in config.rs (for distribution)
pub fn get_client_id() -> Result<String, GoogleAuthError> {
    // First check environment variable (allows override)
    if let Ok(id) = std::env::var("GOOGLE_CLIENT_ID") {
        return Ok(id);
    }
    
    // Fall back to embedded client ID
    super::config::EMBEDDED_CLIENT_ID
        .map(|s| s.to_string())
        .ok_or(GoogleAuthError::NoClientId)
}

/// Get the Google Client Secret from environment or embedded configuration
pub fn get_client_secret() -> Result<String, GoogleAuthError> {
    // First check environment variable (allows override)
    if let Ok(secret) = std::env::var("GOOGLE_CLIENT_SECRET") {
        return Ok(secret);
    }
    
    // Fall back to embedded client secret
    super::config::EMBEDDED_CLIENT_SECRET
        .map(|s| s.to_string())
        .ok_or(GoogleAuthError::NoClientSecret)
}

/// Get the Google OAuth Client ID, checking database first for user-provided credentials
pub fn get_client_id_with_db(conn: &rusqlite::Connection) -> Result<String, GoogleAuthError> {
    // First check database for user-provided credentials
    if let Ok(Some(id)) = crate::db::settings::get_setting(conn, "google_client_id") {
        if !id.is_empty() {
            return Ok(id);
        }
    }
    
    // Fall back to compile-time/env var
    get_client_id()
}

/// Get the Google OAuth Client Secret, checking database first for user-provided credentials
pub fn get_client_secret_with_db(conn: &rusqlite::Connection) -> Result<String, GoogleAuthError> {
    // First check database for user-provided credentials
    if let Ok(Some(secret)) = crate::db::settings::get_setting(conn, "google_client_secret") {
        if !secret.is_empty() {
            return Ok(secret);
        }
    }
    
    // Fall back to compile-time/env var
    get_client_secret()
}

/// Initialize Google credentials from environment variables
/// 
/// This checks for GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables
/// and persists them to the database if found. This allows users to set env vars once
/// and have them work even when launching the app from Finder/Spotlight.
/// 
/// Returns true if credentials were found and saved.
pub fn init_google_credentials_from_env(conn: &rusqlite::Connection) -> bool {
    // Check if credentials are already in the database
    let db_has_credentials = crate::db::settings::get_setting(conn, "google_client_id")
        .ok()
        .flatten()
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    
    if db_has_credentials {
        // Database already has credentials, don't overwrite
        return false;
    }
    
    // Check environment variables
    let env_client_id = std::env::var("GOOGLE_CLIENT_ID").ok();
    let env_client_secret = std::env::var("GOOGLE_CLIENT_SECRET").ok();
    
    match (env_client_id, env_client_secret) {
        (Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => {
            // Save to database
            if let Err(e) = crate::db::settings::set_setting(conn, "google_client_id", &id) {
                log::warn!("Failed to save Google Client ID from env: {}", e);
                return false;
            }
            if let Err(e) = crate::db::settings::set_setting(conn, "google_client_secret", &secret) {
                log::warn!("Failed to save Google Client Secret from env: {}", e);
                return false;
            }
            log::info!("Google credentials loaded from environment variables and saved to database");
            true
        }
        _ => false,
    }
}

/// Build the OAuth authorization URL
fn build_auth_url(client_id: &str, code_challenge: &str, state: &str, port: u16) -> String {
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        GOOGLE_AUTH_URL,
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(code_challenge),
        urlencoding::encode(state),
    )
}

/// Get redirect URI for a given port
fn get_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{}/callback", port)
}

/// Start a temporary HTTP server to receive the OAuth callback
/// Returns the receiver and the port that was successfully bound
fn start_callback_server(expected_state: String) -> Result<(mpsc::Receiver<Result<String, String>>, u16), GoogleAuthError> {
    let (tx, rx) = mpsc::channel();
    
    // Try to find an available port
    let mut bound_port: Option<u16> = None;
    let mut last_error = String::new();
    
    for port in CALLBACK_PORTS {
        match Server::http(format!("127.0.0.1:{}", port)) {
            Ok(server) => {
                bound_port = Some(port);
                let tx_clone = tx.clone();
                let expected_state_clone = expected_state.clone();
                
                thread::spawn(move || {
                    run_callback_server(server, tx_clone, expected_state_clone);
                });
                break;
            }
            Err(e) => {
                last_error = e.to_string();
                log::warn!("Port {} unavailable: {}", port, e);
                continue;
            }
        }
    }
    
    match bound_port {
        Some(port) => Ok((rx, port)),
        None => Err(GoogleAuthError::ServerError(format!(
            "Could not bind to any callback port. Last error: {}. Try closing any previous Inkling windows.",
            last_error
        ))),
    }
}

/// Run the callback server (called in a thread)
fn run_callback_server(server: Server, tx: mpsc::Sender<Result<String, String>>, expected_state: String) {
    // Handle incoming request
    if let Some(request) = server.incoming_requests().next() {
        let url = request.url().to_string();
        
        // Parse the callback URL
        let response_html = if url.contains("error=") {
            let error = url
                .split("error=")
                .nth(1)
                .and_then(|s| s.split('&').next())
                .unwrap_or("unknown_error");
            let _ = tx.send(Err(error.to_string()));
            "<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>"
        } else if url.contains("code=") {
            // Extract the authorization code and state
            let code = url
                .split("code=")
                .nth(1)
                .and_then(|s| s.split('&').next())
                .map(|s| urlencoding::decode(s).unwrap_or_default().to_string());
            
            let state = url
                .split("state=")
                .nth(1)
                .and_then(|s| s.split('&').next())
                .map(|s| urlencoding::decode(s).unwrap_or_default().to_string());
            
            if let (Some(code), Some(state)) = (code, state) {
                if state == expected_state {
                    let _ = tx.send(Ok(code));
                    "<html><body><h1>Success!</h1><p>You can close this window and return to Inkling.</p></body></html>"
                } else {
                    log::error!("State mismatch: expected '{}', got '{}'", expected_state, state);
                    let _ = tx.send(Err("State mismatch".to_string()));
                    "<html><body><h1>Error</h1><p>State verification failed. Please try signing in again.</p></body></html>"
                }
            } else {
                let _ = tx.send(Err("Missing code or state".to_string()));
                "<html><body><h1>Error</h1><p>Invalid callback parameters.</p></body></html>"
            }
        } else {
            let _ = tx.send(Err("Invalid callback".to_string()));
            "<html><body><h1>Error</h1><p>Invalid callback.</p></body></html>"
        };
        
        let response = Response::from_string(response_html)
            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
        let _ = request.respond(response);
    }
}

/// Exchange authorization code for tokens
async fn exchange_code_for_tokens(
    client_id: &str,
    client_secret: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, GoogleAuthError> {
    let client = Client::new();
    
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("code_verifier", code_verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(GoogleAuthError::OAuthError(format!(
            "Token exchange failed: {}",
            error_text
        )));
    }
    
    let tokens: TokenResponse = response.json().await?;
    Ok(tokens)
}

/// Get user info using the access token
async fn get_user_info(access_token: &str) -> Result<UserInfoResponse, GoogleAuthError> {
    let client = Client::new();
    
    let response = client
        .get(GOOGLE_USERINFO_URL)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(GoogleAuthError::OAuthError("Failed to get user info".to_string()));
    }
    
    let user_info: UserInfoResponse = response.json().await?;
    Ok(user_info)
}

/// Initiate the Google OAuth flow using a connection pool
/// 
/// This version takes a DbPool and can be used across await points safely.
pub async fn initiate_auth_with_pool(pool: &DbPool) -> Result<GoogleAccount, GoogleAuthError> {
    // Get credentials (checking database first, then env vars, then compile-time)
    let (client_id, client_secret) = {
        let conn = pool.get().map_err(|e| GoogleAuthError::OAuthError(e.to_string()))?;
        let id = get_client_id_with_db(&conn)?;
        let secret = get_client_secret_with_db(&conn)?;
        (id, secret)
    };
    
    // Generate PKCE values
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_code_verifier(); // Use random value for state
    
    // Start callback server (tries multiple ports)
    let (rx, port) = start_callback_server(state.clone())?;
    log::info!("OAuth callback server started on port {}", port);
    
    // Build and open the auth URL with the correct redirect URI
    let auth_url = build_auth_url(&client_id, &code_challenge, &state, port);
    
    // Open the URL in the default browser
    if let Err(e) = open::that(&auth_url) {
        log::warn!("Failed to open browser: {}", e);
    }
    
    // Wait for the callback (with timeout) - this is blocking but runs in a thread
    let code = rx
        .recv_timeout(Duration::from_secs(300)) // 5 minute timeout
        .map_err(|_| GoogleAuthError::Timeout)?
        .map_err(GoogleAuthError::OAuthError)?;
    
    // Exchange code for tokens (async HTTP call)
    let redirect_uri = get_redirect_uri(port);
    let tokens = exchange_code_for_tokens(&client_id, &client_secret, &code, &code_verifier, &redirect_uri).await?;
    
    // Get user info (async HTTP call)
    let user_info = get_user_info(&tokens.access_token).await?;
    
    // Calculate token expiry
    let expires_at = tokens.expires_in.map(|secs| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + secs as i64
    });
    
    // Now get a connection to save to database
    let conn = pool.get().map_err(|e| GoogleAuthError::OAuthError(e.to_string()))?;
    let account = save_account(
        &conn,
        &user_info.email,
        &tokens.access_token,
        &tokens.refresh_token.unwrap_or_default(),
        expires_at,
    )?;
    
    Ok(account)
}

/// Save Google account to database
fn save_account(
    conn: &Connection,
    email: &str,
    access_token: &str,
    refresh_token: &str,
    expires_at: Option<i64>,
) -> Result<GoogleAccount, GoogleAuthError> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    conn.execute(
        "INSERT INTO google_accounts (id, email, access_token, refresh_token, token_expires_at, connected_at)
         VALUES ('default', ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
             email = excluded.email,
             access_token = excluded.access_token,
             refresh_token = CASE WHEN excluded.refresh_token = '' THEN google_accounts.refresh_token ELSE excluded.refresh_token END,
             token_expires_at = excluded.token_expires_at,
             connected_at = excluded.connected_at",
        rusqlite::params![email, access_token, refresh_token, expires_at, now],
    )?;
    
    get_connection_status(conn)?.ok_or(GoogleAuthError::NotConnected)
}

/// Get the current Google connection status
pub fn get_connection_status(conn: &Connection) -> Result<Option<GoogleAccount>, GoogleAuthError> {
    let mut stmt = conn.prepare(
        "SELECT id, email, access_token, refresh_token, token_expires_at, connected_at
         FROM google_accounts WHERE id = 'default'"
    )?;
    
    let account = stmt.query_row([], |row| {
        Ok(GoogleAccount {
            id: row.get(0)?,
            email: row.get(1)?,
            access_token: row.get(2)?,
            refresh_token: row.get(3)?,
            token_expires_at: row.get(4)?,
            connected_at: row.get(5)?,
        })
    }).optional()?;
    
    Ok(account)
}

/// Disconnect the Google account
pub fn disconnect_account(conn: &Connection) -> Result<(), GoogleAuthError> {
    // Delete the account from database
    conn.execute("DELETE FROM google_accounts WHERE id = 'default'", [])?;
    
    // Also delete any synced Google calendar events
    conn.execute("DELETE FROM calendar_events WHERE source = 'google'", [])?;
    
    Ok(())
}

/// Refresh the access token if it's expired or about to expire (pool version)
pub async fn refresh_token_if_needed_with_pool(pool: &DbPool) -> Result<String, GoogleAuthError> {
    // Get account info from database
    let (account, now) = {
        let conn = pool.get().map_err(|e| GoogleAuthError::OAuthError(e.to_string()))?;
        let account = get_connection_status(&conn)?.ok_or(GoogleAuthError::NotConnected)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        (account, now)
    };
    
    // Check if token is expired or will expire in the next 5 minutes
    let needs_refresh = account.token_expires_at
        .map(|exp| exp - 300 < now) // 5 minute buffer
        .unwrap_or(false);
    
    if !needs_refresh {
        return Ok(account.access_token);
    }
    
    // Refresh the token (async HTTP call)
    // Get client_id and client_secret from database or fallback
    let (client_id, client_secret) = {
        let conn = pool.get().map_err(|e| GoogleAuthError::OAuthError(e.to_string()))?;
        let id = get_client_id_with_db(&conn)?;
        let secret = get_client_secret_with_db(&conn)?;
        (id, secret)
    };
    let client = Client::new();
    
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("refresh_token", &account.refresh_token),
        ("grant_type", "refresh_token"),
    ];
    
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(GoogleAuthError::RefreshFailed(error_text));
    }
    
    let tokens: TokenResponse = response.json().await?;
    
    // Calculate new expiry
    let expires_at = tokens.expires_in.map(|secs| now + secs as i64);
    
    // Update database with new token
    {
        let conn = pool.get().map_err(|e| GoogleAuthError::OAuthError(e.to_string()))?;
        conn.execute(
            "UPDATE google_accounts SET access_token = ?1, token_expires_at = ?2 WHERE id = 'default'",
            rusqlite::params![tokens.access_token, expires_at],
        )?;
    }
    
    Ok(tokens.access_token)
}

// Add urlencoding as a simple inline implementation
pub mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut result = String::new();
        for c in s.chars() {
            match c {
                'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                    result.push(c);
                }
                _ => {
                    for b in c.to_string().as_bytes() {
                        result.push_str(&format!("%{:02X}", b));
                    }
                }
            }
        }
        result
    }
    
    pub fn decode(s: &str) -> Result<std::borrow::Cow<'_, str>, ()> {
        let mut result = String::new();
        let mut chars = s.chars().peekable();
        
        while let Some(c) = chars.next() {
            if c == '%' {
                let hex: String = chars.by_ref().take(2).collect();
                if hex.len() == 2 {
                    if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                        result.push(byte as char);
                        continue;
                    }
                }
                result.push('%');
                result.push_str(&hex);
            } else if c == '+' {
                result.push(' ');
            } else {
                result.push(c);
            }
        }
        
        Ok(std::borrow::Cow::Owned(result))
    }
}

// Add the open crate functionality inline
mod open {
    pub fn that(url: &str) -> Result<(), std::io::Error> {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").arg(url).spawn()?;
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", url])
                .spawn()?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open").arg(url).spawn()?;
        }
        Ok(())
    }
}

use rusqlite::OptionalExtension;

