//! RAG (Retrieval Augmented Generation) pipeline for chat
//!
//! Combines explicit user-attached context with auto-retrieved semantically similar notes
//! to build prompts for the LLM. Also includes URL attachment content for notes.
//!
//! NOTE: Contains utilities for future RAG enhancements.

use chrono;
use crate::db::{self, embeddings::search_similar, connection::DbPool, url_attachments};
use crate::models::{Citation, ContextItem};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

use super::load_ai_config;

/// Maximum number of URL attachments to include in auto-retrieved context
const MAX_AUTO_RETRIEVED_URLS: usize = 5;

#[derive(Error, Debug)]
pub enum RagError {
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("Embedding error: {0}")]
    EmbeddingError(String),
    #[error("Note not found: {0}")]
    NoteNotFound(String),
}

/// Default system prompt for the Inkling assistant
pub const DEFAULT_SYSTEM_PROMPT: &str = r#"You are Inkling, an AI assistant for a personal knowledge management app. 
You help users explore connections in their notes, answer questions based on their knowledge base, and assist with writing and research.

When answering:
- Reference specific notes when relevant using [Note: Title] format
- Be concise but thorough
- If you're not sure about something based on the notes, say so
- Suggest related topics the user might want to explore

Context from user's notes will be provided below."#;

/// Context retrieved for a RAG query
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagContext {
    /// Notes explicitly attached by the user
    pub explicit_context: Vec<NoteContext>,
    /// Notes auto-retrieved based on semantic similarity
    pub retrieved_context: Vec<NoteContext>,
    /// URL attachments from the context notes
    pub url_context: Vec<UrlContext>,
    /// All unique note IDs used in context
    pub all_note_ids: Vec<String>,
}

/// URL attachment content for context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlContext {
    /// The URL
    pub url: String,
    /// Page title
    pub title: Option<String>,
    /// Page description
    pub description: Option<String>,
    /// Extracted content (may be truncated)
    pub content: String,
    /// Note this URL is attached to
    pub note_id: String,
    /// Note title for reference
    pub note_title: String,
}

/// A note's content prepared for context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContext {
    pub note_id: String,
    pub title: String,
    /// The content (full or snippet)
    pub content: String,
    /// Whether this is the full note or a snippet
    pub is_full_note: bool,
    /// Relevance score (only for retrieved context)
    pub relevance: Option<f32>,
}

impl RagContext {
    /// Get all notes as citations
    pub fn as_citations(&self) -> Vec<Citation> {
        let mut citations = Vec::new();
        
        for ctx in &self.explicit_context {
            citations.push(Citation {
                note_id: ctx.note_id.clone(),
                note_title: ctx.title.clone(),
                relevance: 1.0, // Explicit context has max relevance
            });
        }
        
        for ctx in &self.retrieved_context {
            citations.push(Citation {
                note_id: ctx.note_id.clone(),
                note_title: ctx.title.clone(),
                relevance: ctx.relevance.unwrap_or(0.5),
            });
        }
        
        citations
    }
    
    /// Check if context is empty
    pub fn is_empty(&self) -> bool {
        self.explicit_context.is_empty() && self.retrieved_context.is_empty() && self.url_context.is_empty()
    }
}

/// Build context for a RAG query
///
/// Combines explicit user-attached context with auto-retrieved semantically similar notes.
/// Also includes URL attachments for context notes.
/// Deduplicates overlapping context.
pub async fn build_context(
    pool: &DbPool,
    query: &str,
    explicit_context: Vec<ContextItem>,
    auto_retrieve_count: usize,
) -> Result<RagContext, RagError> {
    let mut all_note_ids: HashSet<String> = HashSet::new();
    
    // 1. Process explicit context (sync db operations)
    let explicit_notes = {
        let conn = pool.get().map_err(|e| RagError::DatabaseError(e.to_string()))?;
        let mut notes = Vec::new();
        
        for ctx in explicit_context {
            all_note_ids.insert(ctx.note_id.clone());
            
            let content = if ctx.is_full_note {
                let note = db::notes::get_note(&conn, &ctx.note_id)
                    .map_err(|e| RagError::DatabaseError(e.to_string()))?
                    .ok_or_else(|| RagError::NoteNotFound(ctx.note_id.clone()))?;
                note.content.unwrap_or_default()
            } else {
                ctx.content_snippet.unwrap_or_default()
            };
            
            notes.push(NoteContext {
                note_id: ctx.note_id,
                title: ctx.note_title,
                content,
                is_full_note: ctx.is_full_note,
                relevance: None,
            });
        }
        notes
    };
    
    // 2. Fetch URL attachments for explicit context notes
    let url_context = {
        let conn = pool.get().map_err(|e| RagError::DatabaseError(e.to_string()))?;
        let mut urls = Vec::new();
        
        for note_ctx in &explicit_notes {
            if let Ok(attachments) = url_attachments::get_indexed_url_content_for_note(&conn, &note_ctx.note_id) {
                for attachment in attachments {
                    if let Some(content) = attachment.content {
                        // Truncate content to avoid overwhelming the context
                        let truncated_content = truncate_for_context(&content, 5000);
                        urls.push(UrlContext {
                            url: attachment.url,
                            title: attachment.title,
                            description: attachment.description,
                            content: truncated_content,
                            note_id: note_ctx.note_id.clone(),
                            note_title: note_ctx.title.clone(),
                        });
                    }
                }
            }
        }
        urls
    };
    
    // 3. Get embedding config and model (sync db operation)
    let (embedding_model, provider_url, api_key) = if auto_retrieve_count > 0 && !query.trim().is_empty() {
        let conn = pool.get().map_err(|e| RagError::DatabaseError(e.to_string()))?;
        let config = load_ai_config(&conn).map_err(RagError::DatabaseError)?;
        let embedding_provider = config.providers.iter()
            .find(|p| p.id == config.embedding.provider);
        let provider_url = embedding_provider.and_then(|p| p.base_url.clone());
        let api_key = embedding_provider.and_then(|p| p.api_key.clone());
        (Some(config.embedding.full_model_id()), provider_url, api_key)
    } else {
        (None, None, None)
    };
    
    // 4. Generate query embedding (async operation - no db reference held)
    let query_embedding = if let Some(ref model) = embedding_model {
        Some(
            super::generate_embedding_direct(query, model, provider_url.as_deref(), api_key.as_deref())
                .await
                .map_err(|e| RagError::EmbeddingError(e.to_string()))?
        )
    } else {
        None
    };
    
    // 5. Search for similar notes and fetch their content (sync db operations)
    let retrieved_notes = if let Some(ref embedding) = query_embedding {
        let conn = pool.get().map_err(|e| RagError::DatabaseError(e.to_string()))?;
        
        let similar = search_similar(
            &conn,
            &embedding.embedding,
            auto_retrieve_count + all_note_ids.len(),
            Some(0.3),
        )
        .map_err(|e| RagError::DatabaseError(e.to_string()))?;
        
        let mut notes = Vec::new();
        for result in similar {
            if all_note_ids.contains(&result.note_id) {
                continue;
            }
            if notes.len() >= auto_retrieve_count {
                break;
            }
            
            if let Ok(Some(note)) = db::notes::get_note(&conn, &result.note_id) {
                all_note_ids.insert(result.note_id.clone());
                notes.push(NoteContext {
                    note_id: result.note_id,
                    title: note.title,
                    content: note.content.unwrap_or_default(),
                    is_full_note: true,
                    relevance: Some(result.score),
                });
            }
        }
        notes
    } else {
        Vec::new()
    };
    
    // 6. Search for similar URLs and add to context (if auto-retrieve is enabled)
    let mut auto_retrieved_urls: Vec<UrlContext> = Vec::new();
    if let Some(ref embedding) = query_embedding {
        let conn = pool.get().map_err(|e| RagError::DatabaseError(e.to_string()))?;
        
        if let Ok(similar_urls) = url_attachments::search_similar_urls(
            &conn,
            &embedding.embedding,
            MAX_AUTO_RETRIEVED_URLS,
            Some(0.4), // Slightly higher threshold for URLs
        ) {
            for url_result in similar_urls {
                // Skip URLs from notes already in explicit context
                if url_context.iter().any(|u| u.url == url_result.url) {
                    continue;
                }
                
                // Get full URL attachment content
                if let Ok(Some(attachment)) = url_attachments::get_url_attachment(&conn, &url_result.url_attachment_id) {
                    if let Some(content) = attachment.content {
                        // Get note title for context
                        let note_title = db::notes::get_note(&conn, &url_result.note_id)
                            .ok()
                            .flatten()
                            .map(|n| n.title)
                            .unwrap_or_else(|| "Unknown Note".to_string());
                        
                        auto_retrieved_urls.push(UrlContext {
                            url: url_result.url,
                            title: url_result.title,
                            description: attachment.description,
                            content: truncate_for_context(&content, 3000),
                            note_id: url_result.note_id,
                            note_title,
                        });
                    }
                }
            }
        }
    }
    
    // Merge explicit URL context with auto-retrieved URLs
    let mut all_url_context = url_context;
    all_url_context.extend(auto_retrieved_urls);
    
    Ok(RagContext {
        explicit_context: explicit_notes,
        retrieved_context: retrieved_notes,
        url_context: all_url_context,
        all_note_ids: all_note_ids.into_iter().collect(),
    })
}

/// Format the system prompt with context
pub fn format_system_prompt(base_prompt: &str, context: &RagContext) -> String {
    let mut prompt = base_prompt.to_string();
    
    // Always include the current date so the AI knows what "today", "tomorrow" etc. mean
    let now = chrono::Local::now();
    let date_info = format!(
        "\n\n**Current Date:** {} ({})",
        now.format("%A, %B %d, %Y"),  // e.g., "Sunday, December 29, 2025"
        now.format("%Y-%m-%d")         // e.g., "2025-12-29" for tool calls
    );
    prompt.push_str(&date_info);
    
    if context.is_empty() {
        return prompt;
    }
    prompt.push_str("\n\n---\n\n");
    prompt.push_str("## Context from User's Notes\n\n");
    
    // Add explicit context first
    if !context.explicit_context.is_empty() {
        prompt.push_str("### Attached Notes:\n\n");
        for ctx in &context.explicit_context {
            prompt.push_str(&format!("**[Note: {}]**\n", ctx.title));
            if ctx.is_full_note {
                prompt.push_str(&format!("{}\n\n", ctx.content));
            } else {
                prompt.push_str(&format!("(Selected excerpt)\n{}\n\n", ctx.content));
            }
        }
    }
    
    // Add URL context (attached web pages)
    if !context.url_context.is_empty() {
        prompt.push_str("### Referenced Web Pages:\n\n");
        for url_ctx in &context.url_context {
            let title = url_ctx.title.as_deref().unwrap_or("Untitled Page");
            prompt.push_str(&format!(
                "**[URL: {}]** (from note: {})\n",
                title, url_ctx.note_title
            ));
            prompt.push_str(&format!("Source: {}\n", url_ctx.url));
            if let Some(ref desc) = url_ctx.description {
                prompt.push_str(&format!("Summary: {}\n", desc));
            }
            prompt.push_str(&format!("{}\n\n", url_ctx.content));
        }
    }
    
    // Add retrieved context
    if !context.retrieved_context.is_empty() {
        prompt.push_str("### Related Notes (auto-retrieved):\n\n");
        for ctx in &context.retrieved_context {
            let relevance_pct = ctx.relevance.map(|r| (r * 100.0) as u32).unwrap_or(0);
            prompt.push_str(&format!(
                "**[Note: {}]** ({}% relevant)\n",
                ctx.title, relevance_pct
            ));
            
            // Truncate long notes for auto-retrieved context
            let content = truncate_for_context(&ctx.content, 2000);
            prompt.push_str(&format!("{}\n\n", content));
        }
    }
    
    prompt.push_str("---\n\n");
    prompt
}

/// Truncate content for context, preserving word boundaries
fn truncate_for_context(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        return content.to_string();
    }
    
    // Find a word boundary
    let truncated = &content[..max_len];
    if let Some(pos) = truncated.rfind(char::is_whitespace) {
        format!("{}...", &truncated[..pos])
    } else {
        format!("{}...", truncated)
    }
}

/// Extract note references from AI response text
/// Looks for patterns like [Note: Title] and returns potential note titles
pub fn extract_note_references(content: &str) -> Vec<String> {
    let mut references = Vec::new();
    let re = regex::Regex::new(r"\[Note:\s*([^\]]+)\]").unwrap();
    
    for cap in re.captures_iter(content) {
        if let Some(title) = cap.get(1) {
            references.push(title.as_str().trim().to_string());
        }
    }
    
    references
}

/// Match extracted note references to actual note IDs from context
pub fn resolve_citations(references: &[String], context: &RagContext) -> Vec<Citation> {
    let mut citations = Vec::new();
    let mut added_ids: HashSet<String> = HashSet::new();
    
    // First, try to match referenced notes by title
    for ref_title in references {
        let ref_lower = ref_title.to_lowercase();
        
        // Check explicit context
        for ctx in &context.explicit_context {
            if (ctx.title.to_lowercase().contains(&ref_lower) 
                || ref_lower.contains(&ctx.title.to_lowercase()))
                && !added_ids.contains(&ctx.note_id)
            {
                added_ids.insert(ctx.note_id.clone());
                citations.push(Citation {
                    note_id: ctx.note_id.clone(),
                    note_title: ctx.title.clone(),
                    relevance: 1.0,
                });
            }
        }
        
        // Check retrieved context
        for ctx in &context.retrieved_context {
            if (ctx.title.to_lowercase().contains(&ref_lower)
                || ref_lower.contains(&ctx.title.to_lowercase()))
                && !added_ids.contains(&ctx.note_id)
            {
                added_ids.insert(ctx.note_id.clone());
                citations.push(Citation {
                    note_id: ctx.note_id.clone(),
                    note_title: ctx.title.clone(),
                    relevance: ctx.relevance.unwrap_or(0.5),
                });
            }
        }
    }
    
    // If no references were matched but context was provided, 
    // include all context notes as citations (they likely influenced the response)
    if citations.is_empty() && !context.is_empty() {
        return context.as_citations();
    }
    
    citations
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_note_references() {
        let content = "Based on [Note: Project Ideas] and [Note: Meeting Notes 2024], I can see that...";
        let refs = extract_note_references(content);
        
        assert_eq!(refs.len(), 2);
        assert!(refs.contains(&"Project Ideas".to_string()));
        assert!(refs.contains(&"Meeting Notes 2024".to_string()));
    }
    
    #[test]
    fn test_truncate_for_context() {
        let short = "Hello world";
        assert_eq!(truncate_for_context(short, 100), short);
        
        let long = "This is a very long piece of content that should be truncated at a word boundary";
        let truncated = truncate_for_context(long, 30);
        assert!(truncated.ends_with("..."));
        assert!(truncated.len() <= 35); // 30 + "..."
    }
    
    #[test]
    fn test_format_system_prompt_empty_context() {
        let context = RagContext {
            explicit_context: vec![],
            retrieved_context: vec![],
            url_context: vec![],
            all_note_ids: vec![],
        };
        
        let prompt = format_system_prompt("Base prompt", &context);
        // Should contain base prompt and current date, but no context section
        assert!(prompt.starts_with("Base prompt"));
        assert!(prompt.contains("**Current Date:**"));
        assert!(!prompt.contains("## Context from User's Notes"));
    }
    
    #[test]
    fn test_format_system_prompt_with_context() {
        let context = RagContext {
            explicit_context: vec![NoteContext {
                note_id: "1".to_string(),
                title: "Test Note".to_string(),
                content: "Note content here".to_string(),
                is_full_note: true,
                relevance: None,
            }],
            retrieved_context: vec![],
            url_context: vec![],
            all_note_ids: vec!["1".to_string()],
        };
        
        let prompt = format_system_prompt("Base prompt", &context);
        assert!(prompt.contains("Test Note"));
        assert!(prompt.contains("Note content here"));
    }
    
    #[test]
    fn test_format_system_prompt_with_url_context() {
        let context = RagContext {
            explicit_context: vec![NoteContext {
                note_id: "1".to_string(),
                title: "Research Note".to_string(),
                content: "Some research".to_string(),
                is_full_note: true,
                relevance: None,
            }],
            retrieved_context: vec![],
            url_context: vec![UrlContext {
                url: "https://example.com/article".to_string(),
                title: Some("Example Article".to_string()),
                description: Some("An example article".to_string()),
                content: "Article content here".to_string(),
                note_id: "1".to_string(),
                note_title: "Research Note".to_string(),
            }],
            all_note_ids: vec!["1".to_string()],
        };
        
        let prompt = format_system_prompt("Base prompt", &context);
        assert!(prompt.contains("Example Article"));
        assert!(prompt.contains("https://example.com/article"));
        assert!(prompt.contains("Article content here"));
        assert!(prompt.contains("Referenced Web Pages"));
    }
}
