//! Google integration module
//!
//! Provides OAuth 2.0 authentication and Google Calendar API integration.

pub mod config;
pub mod oauth;
pub mod calendar;

pub use oauth::{
    GoogleAccount, get_connection_status, disconnect_account,
};

