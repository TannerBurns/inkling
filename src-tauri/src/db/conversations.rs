//! Database operations for conversations and messages
//!
//! Handles CRUD operations for chat conversations, messages, and message context.

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{
    Conversation, ContextItem, Message, MessageContext, MessageMetadata, MessageRole,
};

#[derive(Error, Debug)]
pub enum ConversationDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Conversation not found: {0}")]
    NotFound(String),
    #[error("Invalid data: {0}")]
    InvalidData(String),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

// ============================================================================
// Conversation Operations
// ============================================================================

/// Create a new conversation
pub fn create_conversation(
    conn: &Connection,
    title: Option<&str>,
    system_prompt: Option<&str>,
) -> Result<Conversation, ConversationDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    conn.execute(
        "INSERT INTO conversations (id, title, system_prompt, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, title, system_prompt, now.to_rfc3339(), now.to_rfc3339()],
    )?;

    Ok(Conversation {
        id,
        title: title.map(String::from),
        system_prompt: system_prompt.map(String::from),
        created_at: now,
        updated_at: now,
    })
}

/// Get a conversation by ID
pub fn get_conversation(
    conn: &Connection,
    id: &str,
) -> Result<Option<Conversation>, ConversationDbError> {
    let result = conn
        .query_row(
            "SELECT id, title, system_prompt, created_at, updated_at
             FROM conversations WHERE id = ?1",
            [id],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    system_prompt: row.get(2)?,
                    created_at: parse_datetime(row.get::<_, String>(3)?),
                    updated_at: parse_datetime(row.get::<_, String>(4)?),
                })
            },
        )
        .optional()?;

    Ok(result)
}

/// List all conversations, ordered by updated_at descending
pub fn list_conversations(conn: &Connection) -> Result<Vec<Conversation>, ConversationDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, system_prompt, created_at, updated_at
         FROM conversations
         ORDER BY updated_at DESC",
    )?;

    let conversations = stmt
        .query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                system_prompt: row.get(2)?,
                created_at: parse_datetime(row.get::<_, String>(3)?),
                updated_at: parse_datetime(row.get::<_, String>(4)?),
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(conversations)
}

/// List all conversation previews with message count and first message
pub fn list_conversation_previews(
    conn: &Connection,
) -> Result<Vec<crate::models::ConversationPreview>, ConversationDbError> {
    use crate::models::ConversationPreview;
    
    let mut stmt = conn.prepare(
        "SELECT 
            c.id, c.title, c.system_prompt, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
            (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message
         FROM conversations c
         ORDER BY c.updated_at DESC",
    )?;

    let previews = stmt
        .query_map([], |row| {
            let conversation = Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                system_prompt: row.get(2)?,
                created_at: parse_datetime(row.get::<_, String>(3)?),
                updated_at: parse_datetime(row.get::<_, String>(4)?),
            };
            let message_count: i64 = row.get(5)?;
            let first_message: Option<String> = row.get(6)?;
            
            // Truncate first message for preview
            let first_message_preview = first_message.map(|m| {
                if m.len() > 100 {
                    format!("{}...", &m[..100])
                } else {
                    m
                }
            });
            
            Ok(ConversationPreview {
                conversation,
                message_count: message_count as u32,
                first_message_preview,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(previews)
}

/// Get the message count for a conversation
pub fn get_message_count(conn: &Connection, conversation_id: &str) -> Result<u32, ConversationDbError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
        [conversation_id],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

/// Update a conversation
pub fn update_conversation(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    system_prompt: Option<&str>,
) -> Result<Conversation, ConversationDbError> {
    let now = Utc::now();

    // Build dynamic update query
    let existing = get_conversation(conn, id)?
        .ok_or_else(|| ConversationDbError::NotFound(id.to_string()))?;

    let new_title = title.map(String::from).or(existing.title);
    let new_system_prompt = system_prompt.map(String::from).or(existing.system_prompt);

    conn.execute(
        "UPDATE conversations SET title = ?1, system_prompt = ?2, updated_at = ?3 WHERE id = ?4",
        params![new_title, new_system_prompt, now.to_rfc3339(), id],
    )?;

    Ok(Conversation {
        id: id.to_string(),
        title: new_title,
        system_prompt: new_system_prompt,
        created_at: existing.created_at,
        updated_at: now,
    })
}

/// Delete a conversation and all its messages
pub fn delete_conversation(conn: &Connection, id: &str) -> Result<bool, ConversationDbError> {
    let rows_affected = conn.execute("DELETE FROM conversations WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Touch conversation updated_at timestamp
pub fn touch_conversation(conn: &Connection, id: &str) -> Result<(), ConversationDbError> {
    let now = Utc::now();
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now.to_rfc3339(), id],
    )?;
    Ok(())
}

// ============================================================================
// Message Operations
// ============================================================================

/// Create a new message
pub fn create_message(
    conn: &Connection,
    conversation_id: &str,
    role: MessageRole,
    content: &str,
    metadata: Option<&MessageMetadata>,
) -> Result<Message, ConversationDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let metadata_json = metadata.map(|m| serde_json::to_string(m)).transpose()?;

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            conversation_id,
            role.as_str(),
            content,
            metadata_json,
            now.to_rfc3339()
        ],
    )?;

    // Update conversation's updated_at
    touch_conversation(conn, conversation_id)?;

    Ok(Message {
        id,
        conversation_id: conversation_id.to_string(),
        role,
        content: content.to_string(),
        metadata: metadata.cloned(),
        created_at: now,
    })
}

/// Get a message by ID
pub fn get_message(conn: &Connection, id: &str) -> Result<Option<Message>, ConversationDbError> {
    let result = conn
        .query_row(
            "SELECT id, conversation_id, role, content, metadata, created_at
             FROM messages WHERE id = ?1",
            [id],
            |row| {
                let role_str: String = row.get(2)?;
                let metadata_json: Option<String> = row.get(4)?;
                Ok((row.get(0)?, row.get(1)?, role_str, row.get(3)?, metadata_json, row.get::<_, String>(5)?))
            },
        )
        .optional()?;

    match result {
        Some((id, conversation_id, role_str, content, metadata_json, created_at)) => {
            let role = MessageRole::from_str(&role_str)
                .ok_or_else(|| ConversationDbError::InvalidData(format!("Invalid role: {}", role_str)))?;
            let metadata: Option<MessageMetadata> = metadata_json
                .map(|j| serde_json::from_str(&j))
                .transpose()?;

            Ok(Some(Message {
                id,
                conversation_id,
                role,
                content,
                metadata,
                created_at: parse_datetime(created_at),
            }))
        }
        None => Ok(None),
    }
}

/// Get all messages for a conversation, ordered by created_at
pub fn get_conversation_messages(
    conn: &Connection,
    conversation_id: &str,
) -> Result<Vec<Message>, ConversationDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, metadata, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC",
    )?;

    let messages = stmt
        .query_map([conversation_id], |row| {
            let role_str: String = row.get(2)?;
            let metadata_json: Option<String> = row.get(4)?;
            Ok((row.get(0)?, row.get(1)?, role_str, row.get(3)?, metadata_json, row.get::<_, String>(5)?))
        })?
        .filter_map(|r| r.ok())
        .filter_map(|(id, conv_id, role_str, content, metadata_json, created_at): (String, String, String, String, Option<String>, String)| {
            let role = MessageRole::from_str(&role_str)?;
            let metadata: Option<MessageMetadata> = metadata_json
                .and_then(|j| serde_json::from_str(&j).ok());

            Some(Message {
                id,
                conversation_id: conv_id,
                role,
                content,
                metadata,
                created_at: parse_datetime(created_at),
            })
        })
        .collect();

    Ok(messages)
}

/// Get paginated messages for a conversation
pub fn get_conversation_messages_paginated(
    conn: &Connection,
    conversation_id: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<Message>, ConversationDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, metadata, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC
         LIMIT ?2 OFFSET ?3",
    )?;

    let messages = stmt
        .query_map(params![conversation_id, limit as i64, offset as i64], |row| {
            let role_str: String = row.get(2)?;
            let metadata_json: Option<String> = row.get(4)?;
            Ok((row.get(0)?, row.get(1)?, role_str, row.get(3)?, metadata_json, row.get::<_, String>(5)?))
        })?
        .filter_map(|r| r.ok())
        .filter_map(|(id, conv_id, role_str, content, metadata_json, created_at): (String, String, String, String, Option<String>, String)| {
            let role = MessageRole::from_str(&role_str)?;
            let metadata: Option<MessageMetadata> = metadata_json
                .and_then(|j| serde_json::from_str(&j).ok());

            Some(Message {
                id,
                conversation_id: conv_id,
                role,
                content,
                metadata,
                created_at: parse_datetime(created_at),
            })
        })
        .collect();

    Ok(messages)
}

/// Update message metadata (e.g., add citations after streaming completes)
pub fn update_message_metadata(
    conn: &Connection,
    message_id: &str,
    metadata: &MessageMetadata,
) -> Result<(), ConversationDbError> {
    let metadata_json = serde_json::to_string(metadata)?;

    conn.execute(
        "UPDATE messages SET metadata = ?1 WHERE id = ?2",
        params![metadata_json, message_id],
    )?;

    Ok(())
}

/// Update message content
pub fn update_message_content(
    conn: &Connection,
    message_id: &str,
    content: &str,
) -> Result<(), ConversationDbError> {
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, message_id],
    )?;

    Ok(())
}

/// Delete all messages from a given message onwards (inclusive)
/// Used when editing a message - deletes the original and all subsequent messages
pub fn delete_messages_from(
    conn: &Connection,
    conversation_id: &str,
    message_id: &str,
) -> Result<usize, ConversationDbError> {
    // Get the message's created_at time
    let message = get_message(conn, message_id)?
        .ok_or_else(|| ConversationDbError::NotFound(message_id.to_string()))?;
    
    // Delete all messages with created_at >= the target message's created_at
    let rows_affected = conn.execute(
        "DELETE FROM messages 
         WHERE conversation_id = ?1 
         AND created_at >= ?2",
        params![conversation_id, message.created_at.to_rfc3339()],
    )?;

    Ok(rows_affected)
}

/// Delete a single message by ID
pub fn delete_message(conn: &Connection, id: &str) -> Result<bool, ConversationDbError> {
    let rows_affected = conn.execute("DELETE FROM messages WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

// ============================================================================
// Message Context Operations
// ============================================================================

/// Add context (note reference) to a message
pub fn add_message_context(
    conn: &Connection,
    message_id: &str,
    note_id: &str,
    content_snippet: Option<&str>,
    is_full_note: bool,
) -> Result<MessageContext, ConversationDbError> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO message_context (id, message_id, note_id, content_snippet, is_full_note)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, message_id, note_id, content_snippet, is_full_note],
    )?;

    Ok(MessageContext {
        id,
        message_id: message_id.to_string(),
        note_id: note_id.to_string(),
        content_snippet: content_snippet.map(String::from),
        is_full_note,
    })
}

/// Get all context items for a message
pub fn get_message_context(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<MessageContext>, ConversationDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, message_id, note_id, content_snippet, is_full_note
         FROM message_context
         WHERE message_id = ?1",
    )?;

    let contexts = stmt
        .query_map([message_id], |row| {
            Ok(MessageContext {
                id: row.get(0)?,
                message_id: row.get(1)?,
                note_id: row.get(2)?,
                content_snippet: row.get(3)?,
                is_full_note: row.get(4)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(contexts)
}

/// Get context items as ContextItem structs (with note titles)
pub fn get_message_context_items(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<ContextItem>, ConversationDbError> {
    let mut stmt = conn.prepare(
        "SELECT mc.note_id, n.title, mc.content_snippet, mc.is_full_note
         FROM message_context mc
         JOIN notes n ON n.id = mc.note_id
         WHERE mc.message_id = ?1",
    )?;

    let items = stmt
        .query_map([message_id], |row| {
            Ok(ContextItem {
                note_id: row.get(0)?,
                note_title: row.get(1)?,
                content_snippet: row.get(2)?,
                is_full_note: row.get(3)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    Ok(items)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse a datetime string to DateTime<Utc>
fn parse_datetime(s: String) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&s)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

/// Generate a conversation title from the first message
pub fn generate_title_from_message(content: &str, max_len: usize) -> String {
    let trimmed = content.trim();
    if trimmed.len() <= max_len {
        trimmed.to_string()
    } else {
        let mut title: String = trimmed.chars().take(max_len - 3).collect();
        title.push_str("...");
        title
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_create_and_get_conversation() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let conv = create_conversation(&conn, Some("Test Conversation"), None).unwrap();
        assert_eq!(conv.title, Some("Test Conversation".to_string()));

        let fetched = get_conversation(&conn, &conv.id).unwrap().unwrap();
        assert_eq!(fetched.id, conv.id);
        assert_eq!(fetched.title, conv.title);
    }

    #[test]
    fn test_create_and_get_messages() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let conv = create_conversation(&conn, Some("Test"), None).unwrap();

        let msg1 = create_message(&conn, &conv.id, MessageRole::User, "Hello", None).unwrap();
        let msg2 = create_message(&conn, &conv.id, MessageRole::Assistant, "Hi there!", None).unwrap();

        let messages = get_conversation_messages(&conn, &conv.id).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn test_delete_conversation_cascades() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let conv = create_conversation(&conn, Some("Test"), None).unwrap();
        create_message(&conn, &conv.id, MessageRole::User, "Hello", None).unwrap();

        delete_conversation(&conn, &conv.id).unwrap();

        let messages = get_conversation_messages(&conn, &conv.id).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_generate_title() {
        assert_eq!(generate_title_from_message("Hello", 10), "Hello");
        assert_eq!(
            generate_title_from_message("This is a very long message", 15),
            "This is a ve..."
        );
    }
}
