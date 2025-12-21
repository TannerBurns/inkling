//! Vault management module
//!
//! Handles vault path configuration, markdown file sync, and file watching.

pub mod board_sync;
pub mod config;
pub mod markdown;
pub mod sync;
pub mod watcher;

pub use board_sync::*;
pub use config::*;
pub use markdown::*;
pub use sync::*;
pub use watcher::*;
