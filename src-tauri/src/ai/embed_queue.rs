//! Background embedding queue for processing notes asynchronously
//!
//! Handles queuing notes for embedding generation with debouncing
//! to avoid processing notes that are still being edited.
//!
//! NOTE: This module is planned for future use with async embedding updates.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::time::{sleep, Instant};

use super::embeddings::{generate_embedding, EmbeddingResult};

/// Debounce delay before processing an embedding (wait for user to stop typing)
const DEBOUNCE_DELAY_MS: u64 = 2000;

/// Maximum batch size for processing embeddings
const MAX_BATCH_SIZE: usize = 10;

/// Status of an embedding job
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EmbeddingJobStatus {
    Pending,
    Processing,
    Completed,
    Failed { error: String },
}

/// Event emitted when embedding status changes
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStatusEvent {
    pub note_id: String,
    pub status: EmbeddingJobStatus,
}

/// A job in the embedding queue
#[derive(Debug, Clone)]
struct EmbeddingJob {
    note_id: String,
    content: String,
    queued_at: Instant,
}

/// Message types for the embedding queue
#[derive(Debug)]
enum QueueMessage {
    /// Queue a note for embedding
    Enqueue {
        note_id: String,
        content: String,
    },
    /// Cancel pending embedding for a note (e.g., note deleted)
    Cancel {
        note_id: String,
    },
    /// Shutdown the queue processor
    Shutdown,
}

/// The embedding queue manager
pub struct EmbeddingQueue {
    /// Channel sender for queue messages
    tx: mpsc::Sender<QueueMessage>,
    /// Current status of each note's embedding
    status: Arc<RwLock<HashMap<String, EmbeddingJobStatus>>>,
    /// Whether the queue is running
    is_running: Arc<RwLock<bool>>,
}

impl EmbeddingQueue {
    /// Create a new embedding queue
    pub fn new() -> Self {
        let (tx, _rx) = mpsc::channel(1000);
        Self {
            tx,
            status: Arc::new(RwLock::new(HashMap::new())),
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the queue processor
    pub async fn start(
        &mut self,
        app: AppHandle,
        base_url: String,
        model: String,
        db_pool: crate::db::DbPool,
    ) {
        // Don't start if already running
        {
            let running = self.is_running.read().await;
            if *running {
                log::warn!("Embedding queue already running");
                return;
            }
        }

        let (tx, rx) = mpsc::channel(1000);
        self.tx = tx;

        *self.is_running.write().await = true;

        let status = self.status.clone();
        let is_running = self.is_running.clone();

        // Spawn the processor task
        tauri::async_runtime::spawn(async move {
            process_queue(rx, status, is_running, app, base_url, model, db_pool).await;
        });

        log::info!("Embedding queue started");
    }

    /// Queue a note for embedding
    pub async fn enqueue(&self, note_id: String, content: String) {
        // Update status to pending
        {
            let mut status = self.status.write().await;
            status.insert(note_id.clone(), EmbeddingJobStatus::Pending);
        }

        // Send to queue
        if let Err(e) = self.tx.send(QueueMessage::Enqueue { note_id, content }).await {
            log::error!("Failed to enqueue embedding: {}", e);
        }
    }

    /// Cancel a pending embedding (e.g., when note is deleted)
    pub async fn cancel(&self, note_id: String) {
        let _ = self.tx.send(QueueMessage::Cancel { note_id }).await;
    }

    /// Get the status of a note's embedding
    pub async fn get_status(&self, note_id: &str) -> Option<EmbeddingJobStatus> {
        let status = self.status.read().await;
        status.get(note_id).cloned()
    }

    /// Shutdown the queue processor
    pub async fn shutdown(&self) {
        let _ = self.tx.send(QueueMessage::Shutdown).await;
    }
}

impl Default for EmbeddingQueue {
    fn default() -> Self {
        Self::new()
    }
}

/// Process the embedding queue
async fn process_queue(
    mut rx: mpsc::Receiver<QueueMessage>,
    status: Arc<RwLock<HashMap<String, EmbeddingJobStatus>>>,
    is_running: Arc<RwLock<bool>>,
    app: AppHandle,
    base_url: String,
    model: String,
    db_pool: crate::db::DbPool,
) {
    // Pending jobs waiting for debounce
    let pending: Arc<Mutex<HashMap<String, EmbeddingJob>>> = Arc::new(Mutex::new(HashMap::new()));

    loop {
        tokio::select! {
            // Handle incoming messages
            msg = rx.recv() => {
                match msg {
                    Some(QueueMessage::Enqueue { note_id, content }) => {
                        let mut pending = pending.lock().await;
                        pending.insert(note_id.clone(), EmbeddingJob {
                            note_id,
                            content,
                            queued_at: Instant::now(),
                        });
                    }
                    Some(QueueMessage::Cancel { note_id }) => {
                        let mut pending = pending.lock().await;
                        pending.remove(&note_id);
                        
                        let mut status = status.write().await;
                        status.remove(&note_id);
                    }
                    Some(QueueMessage::Shutdown) | None => {
                        log::info!("Embedding queue shutting down");
                        *is_running.write().await = false;
                        break;
                    }
                }
            }
            // Check for ready jobs periodically
            _ = sleep(Duration::from_millis(500)) => {
                let now = Instant::now();
                let debounce_duration = Duration::from_millis(DEBOUNCE_DELAY_MS);
                
                // Find jobs that are ready (debounce time passed)
                let ready_jobs: Vec<EmbeddingJob> = {
                    let mut pending = pending.lock().await;
                    let ready: Vec<String> = pending
                        .iter()
                        .filter(|(_, job)| now.duration_since(job.queued_at) >= debounce_duration)
                        .map(|(id, _)| id.clone())
                        .take(MAX_BATCH_SIZE)
                        .collect();
                    
                    ready.into_iter()
                        .filter_map(|id| pending.remove(&id))
                        .collect()
                };

                // Process ready jobs
                for job in ready_jobs {
                    // Update status to processing
                    {
                        let mut status = status.write().await;
                        status.insert(job.note_id.clone(), EmbeddingJobStatus::Processing);
                    }
                    
                    // Emit status update
                    let _ = app.emit("embedding-status", EmbeddingStatusEvent {
                        note_id: job.note_id.clone(),
                        status: EmbeddingJobStatus::Processing,
                    });

                    // Generate embedding
                    match generate_embedding(&base_url, &job.content, &model).await {
                        Ok(result) => {
                            // Store in database
                            if let Err(e) = store_embedding(&db_pool, &job.note_id, &result, &model) {
                                log::error!("Failed to store embedding for {}: {}", job.note_id, e);
                                
                                let mut status = status.write().await;
                                status.insert(job.note_id.clone(), EmbeddingJobStatus::Failed {
                                    error: e.to_string(),
                                });
                                
                                let _ = app.emit("embedding-status", EmbeddingStatusEvent {
                                    note_id: job.note_id,
                                    status: EmbeddingJobStatus::Failed { error: e.to_string() },
                                });
                            } else {
                                let mut status = status.write().await;
                                status.insert(job.note_id.clone(), EmbeddingJobStatus::Completed);
                                
                                let _ = app.emit("embedding-status", EmbeddingStatusEvent {
                                    note_id: job.note_id,
                                    status: EmbeddingJobStatus::Completed,
                                });
                                
                                log::debug!("Embedding generated and stored successfully");
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to generate embedding for {}: {}", job.note_id, e);
                            
                            let mut status = status.write().await;
                            status.insert(job.note_id.clone(), EmbeddingJobStatus::Failed {
                                error: e.to_string(),
                            });
                            
                            let _ = app.emit("embedding-status", EmbeddingStatusEvent {
                                note_id: job.note_id,
                                status: EmbeddingJobStatus::Failed { error: e.to_string() },
                            });
                        }
                    }
                }
            }
        }
    }
}

/// Store an embedding in the database
fn store_embedding(
    db_pool: &crate::db::DbPool,
    note_id: &str,
    result: &EmbeddingResult,
    model: &str,
) -> Result<(), String> {
    let conn = db_pool.get().map_err(|e| e.to_string())?;
    
    // Serialize embedding to bytes
    let embedding_bytes: Vec<u8> = result
        .embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();
    
    conn.execute(
        "INSERT INTO note_embeddings (note_id, embedding, dimension, model, model_version, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(note_id) DO UPDATE SET
             embedding = excluded.embedding,
             dimension = excluded.dimension,
             model = excluded.model,
             model_version = excluded.model_version,
             updated_at = excluded.updated_at",
        rusqlite::params![
            note_id,
            embedding_bytes,
            result.dimension as i32,
            model,
            result.model,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
