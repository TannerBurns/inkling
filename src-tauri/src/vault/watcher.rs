//! File system watcher for external changes
//!
//! Uses the `notify` crate to watch for file changes in the vault.

#![allow(dead_code)]

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, Debouncer};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use thiserror::Error;

use crate::db::connection::DbPool;
use crate::vault::{config, sync};

#[derive(Error, Debug)]
pub enum WatcherError {
    #[error("Watcher error: {0}")]
    NotifyError(#[from] notify::Error),
    #[error("Vault not configured")]
    VaultNotConfigured,
    #[error("Watcher already running")]
    AlreadyRunning,
    #[error("Watcher not running")]
    NotRunning,
}

/// File event types we care about
#[derive(Debug, Clone)]
pub enum FileEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
}

/// Manages the file system watcher
pub struct VaultWatcher {
    watcher: Option<Debouncer<RecommendedWatcher>>,
    receiver: Option<Receiver<Result<Vec<DebouncedEvent>, notify::Error>>>,
    is_running: Arc<RwLock<bool>>,
    notes_dir: Option<PathBuf>,
}

impl VaultWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            receiver: None,
            is_running: Arc::new(RwLock::new(false)),
            notes_dir: None,
        }
    }
    
    /// Start watching the vault's notes directory
    pub fn start(&mut self) -> Result<(), WatcherError> {
        if *self.is_running.read().unwrap() {
            return Err(WatcherError::AlreadyRunning);
        }
        
        let notes_dir = config::get_notes_dir()
            .map_err(|_| WatcherError::VaultNotConfigured)?;
        
        if !notes_dir.exists() {
            std::fs::create_dir_all(&notes_dir)
                .map_err(|e| WatcherError::NotifyError(notify::Error::io(e)))?;
        }
        
        let (tx, rx) = channel();
        
        // Create a debounced watcher with 300ms delay
        let mut debouncer = new_debouncer(Duration::from_millis(300), tx)?;
        
        // Watch the notes directory recursively
        debouncer.watcher().watch(&notes_dir, RecursiveMode::Recursive)?;
        
        self.watcher = Some(debouncer);
        self.receiver = Some(rx);
        self.notes_dir = Some(notes_dir);
        *self.is_running.write().unwrap() = true;
        
        log::info!("Vault watcher started");
        
        Ok(())
    }
    
    /// Stop watching
    pub fn stop(&mut self) -> Result<(), WatcherError> {
        if !*self.is_running.read().unwrap() {
            return Err(WatcherError::NotRunning);
        }
        
        // Drop the watcher to stop watching
        self.watcher = None;
        self.receiver = None;
        *self.is_running.write().unwrap() = false;
        
        log::info!("Vault watcher stopped");
        
        Ok(())
    }
    
    /// Check if the watcher is running
    pub fn is_running(&self) -> bool {
        *self.is_running.read().unwrap()
    }
    
    /// Process pending events (non-blocking)
    /// Returns a list of file events that occurred
    pub fn poll_events(&self) -> Vec<FileEvent> {
        let mut events = Vec::new();
        
        if let Some(ref rx) = self.receiver {
            // Non-blocking receive of all pending events
            while let Ok(result) = rx.try_recv() {
                match result {
                    Ok(debounced_events) => {
                        for event in debounced_events {
                            if let Some(file_event) = self.process_debounced_event(event) {
                                events.push(file_event);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Watcher error: {:?}", e);
                    }
                }
            }
        }
        
        events
    }
    
    /// Convert a debounced event to our FileEvent type
    fn process_debounced_event(&self, event: DebouncedEvent) -> Option<FileEvent> {
        let path = event.path;
        
        // Ignore non-markdown files
        if path.extension().map_or(true, |ext| ext != "md") {
            return None;
        }
        
        // Ignore files in .inkling directory
        if path.to_string_lossy().contains(".inkling") {
            return None;
        }
        
        // Ignore temporary files
        let filename = path.file_name()?.to_string_lossy();
        if filename.starts_with('.') || filename.ends_with('~') {
            return None;
        }
        
        // The debouncer gives us simplified events
        // We need to check if the file exists to determine if it was created/modified or deleted
        if path.exists() {
            // Could be created or modified, we treat both the same
            Some(FileEvent::Modified(path))
        } else {
            Some(FileEvent::Deleted(path))
        }
    }
}

impl Default for VaultWatcher {
    fn default() -> Self {
        Self::new()
    }
}

/// Process file events and sync with the database
pub fn process_events(pool: &DbPool, events: Vec<FileEvent>) {
    for event in events {
        match event {
            FileEvent::Created(path) | FileEvent::Modified(path) => {
                log::info!("File changed: {:?}", path);
                if let Err(e) = sync::handle_file_modified(pool, &path) {
                    log::error!("Failed to sync file {:?}: {}", path, e);
                }
            }
            FileEvent::Deleted(path) => {
                log::info!("File deleted: {:?}", path);
                if let Err(e) = sync::handle_file_deleted(pool, &path) {
                    log::error!("Failed to handle file deletion {:?}: {}", path, e);
                }
            }
            FileEvent::Renamed { from, to } => {
                log::info!("File renamed: {:?} -> {:?}", from, to);
                // Handle as delete old + create new
                if let Err(e) = sync::handle_file_deleted(pool, &from) {
                    log::error!("Failed to handle rename (delete) {:?}: {}", from, e);
                }
                if let Err(e) = sync::handle_file_modified(pool, &to) {
                    log::error!("Failed to handle rename (create) {:?}: {}", to, e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_watcher_new() {
        let watcher = VaultWatcher::new();
        assert!(!watcher.is_running());
    }
}
