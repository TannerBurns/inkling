//! Google OAuth configuration
//!
//! Credentials are injected at build time via environment variables.
//! This keeps secrets out of source control while still embedding them in the binary.
//!
//! To build with Google Calendar support:
//!   GOOGLE_CLIENT_ID="your-id" GOOGLE_CLIENT_SECRET="your-secret" npm run build
//!
//! For development, set these in your shell or .env file.

/// The Google OAuth Client ID, injected at compile time
/// 
/// Set GOOGLE_CLIENT_ID environment variable before building.
/// For development: export GOOGLE_CLIENT_ID="your-client-id"
pub const EMBEDDED_CLIENT_ID: Option<&str> = option_env!("GOOGLE_CLIENT_ID");

/// The Google OAuth Client Secret, injected at compile time
/// 
/// Set GOOGLE_CLIENT_SECRET environment variable before building.
/// For development: export GOOGLE_CLIENT_SECRET="your-client-secret"
/// 
/// Note: For desktop apps, this isn't truly secret (it's in the binary),
/// but Google's OAuth flow requires it. Security comes from PKCE.
pub const EMBEDDED_CLIENT_SECRET: Option<&str> = option_env!("GOOGLE_CLIENT_SECRET");
