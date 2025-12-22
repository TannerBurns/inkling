//! Tauri commands for chat operations
//!
//! Provides conversation management and chat functionality with streaming support.

use crate::ai::{
    build_context, create_client, format_system_prompt, load_ai_config,
    resolve_citations, extract_note_references, DEFAULT_SYSTEM_PROMPT,
    llm::{ChatMessage as LlmChatMessage, ChatRequest, StreamEvent},
};
use crate::db::generate_title_from_message;
use crate::db::{self};
use crate::models::{
    ChatResponse, ChatStreamEvent, Conversation, ConversationWithMessages,
    CreateConversationInput, Message, MessageMetadata, MessageRole, SendMessageInput,
    TokenUsage, UpdateConversationInput,
};
use crate::{ActiveStreams, AppPool};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::watch;

// ============================================================================
// Conversation Management
// ============================================================================

/// Create a new conversation
#[tauri::command]
pub async fn create_conversation(
    pool: State<'_, AppPool>,
    input: CreateConversationInput,
) -> Result<Conversation, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::create_conversation(
        &conn,
        input.title.as_deref(),
        input.system_prompt.as_deref(),
    )
    .map_err(|e| format!("Failed to create conversation: {}", e))
}

/// Get a conversation by ID
#[tauri::command]
pub async fn get_conversation(
    pool: State<'_, AppPool>,
    id: String,
) -> Result<Option<Conversation>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::get_conversation(&conn, &id).map_err(|e| format!("Failed to get conversation: {}", e))
}

/// Get a conversation with all its messages
#[tauri::command]
pub async fn get_conversation_with_messages(
    pool: State<'_, AppPool>,
    id: String,
) -> Result<Option<ConversationWithMessages>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let conversation = db::get_conversation(&conn, &id)
        .map_err(|e| format!("Failed to get conversation: {}", e))?;

    match conversation {
        Some(conv) => {
            let messages = db::get_conversation_messages(&conn, &id)
                .map_err(|e| format!("Failed to get messages: {}", e))?;

            Ok(Some(ConversationWithMessages {
                conversation: conv,
                messages,
            }))
        }
        None => Ok(None),
    }
}

/// List all conversations
#[tauri::command]
pub async fn list_conversations(pool: State<'_, AppPool>) -> Result<Vec<Conversation>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::list_conversations(&conn).map_err(|e| format!("Failed to list conversations: {}", e))
}

/// List all conversation previews with message counts
#[tauri::command]
pub async fn list_conversation_previews(
    pool: State<'_, AppPool>,
) -> Result<Vec<crate::models::ConversationPreview>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::list_conversation_previews(&conn)
        .map_err(|e| format!("Failed to list conversation previews: {}", e))
}

/// Update a conversation (title or system prompt)
#[tauri::command]
pub async fn update_conversation(
    pool: State<'_, AppPool>,
    id: String,
    input: UpdateConversationInput,
) -> Result<Conversation, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::update_conversation(
        &conn,
        &id,
        input.title.as_deref(),
        input.system_prompt.as_deref(),
    )
    .map_err(|e| format!("Failed to update conversation: {}", e))
}

/// Delete a conversation
#[tauri::command]
pub async fn delete_conversation(pool: State<'_, AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    db::delete_conversation(&conn, &id)
        .map_err(|e| format!("Failed to delete conversation: {}", e))
}

/// Get messages for a conversation (paginated)
#[tauri::command]
pub async fn get_conversation_messages(
    pool: State<'_, AppPool>,
    conversation_id: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Message>, String> {
    let pool_guard = pool.0.read().unwrap();
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    db::get_conversation_messages_paginated(&conn, &conversation_id, limit, offset)
        .map_err(|e| format!("Failed to get messages: {}", e))
}

// ============================================================================
// Chat / Messaging - Legacy types (kept for potential fallback/migration)
// ============================================================================

#[allow(dead_code)]
#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessageBody>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
struct ChatMessageBody {
    role: String,
    content: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    id: String,
    choices: Vec<ChatChoice>,
    usage: Option<UsageInfo>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageContent,
    finish_reason: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ChatMessageContent {
    role: String,
    content: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct UsageInfo {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
    /// OpenAI reasoning content (o1, o3, etc.)
    #[serde(default)]
    reasoning_content: Option<String>,
    /// Anthropic thinking content (Claude 3.7+)
    #[serde(default)]
    thinking: Option<String>,
}

/// Send a chat message and get a response
///
/// This command:
/// 1. Creates or retrieves the conversation
/// 2. Builds RAG context from attached notes and semantic search
/// 3. Sends the message to the LLM via the configured provider
/// 4. Streams the response back to the frontend
/// 5. Saves both user and assistant messages to the database
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    pool: State<'_, AppPool>,
    active_streams: State<'_, ActiveStreams>,
    input: SendMessageInput,
) -> Result<ChatResponse, String> {
    // 1. Get or create conversation, save user message (sync db operations)
    let (conversation, user_message, history, system_prompt_base, model, provider, is_new_conversation) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let (conversation, is_new) = if let Some(ref conv_id) = input.conversation_id {
            let conv = db::get_conversation(&conn, conv_id)
                .map_err(|e| format!("Database error: {}", e))?
                .ok_or_else(|| format!("Conversation not found: {}", conv_id))?;
            (conv, false)
        } else {
            // Create with placeholder title, will be updated with AI-generated title later
            let conv = db::create_conversation(&conn, Some("New Chat"), None)
                .map_err(|e| format!("Failed to create conversation: {}", e))?;
            (conv, true)
        };

        let user_message = db::create_message(
            &conn,
            &conversation.id,
            MessageRole::User,
            &input.content,
            None,
        )
        .map_err(|e| format!("Failed to save user message: {}", e))?;

        for ctx in &input.context {
            let _ = db::add_message_context(
                &conn,
                &user_message.id,
                &ctx.note_id,
                ctx.content_snippet.as_deref(),
                ctx.is_full_note,
            );
        }

        let messages = db::get_conversation_messages(&conn, &conversation.id)
            .map_err(|e| format!("Failed to get conversation history: {}", e))?;

        let history: Vec<(String, String)> = messages
            .iter()
            .filter(|m| m.id != user_message.id)
            .map(|m| (m.role.as_str().to_string(), m.content.clone()))
            .collect();

        let system_prompt_base = conversation
            .system_prompt
            .clone()
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());

        let ai_config = load_ai_config(&conn)?;
        let (model, provider) = get_chat_model_and_provider(&ai_config)?;
        
        (conversation, user_message, history, system_prompt_base, model, provider, is_new)
    };

    // 2. Build RAG context (this does async embedding work internally)
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    let rag_context = build_context(
        &pool_clone,
        &input.content,
        input.context.clone(),
        input.auto_retrieve_count,
    )
    .await
    .map_err(|e| format!("Failed to build context: {}", e))?;

    // 3. Format system prompt with context
    let system_prompt = format_system_prompt(&system_prompt_base, &rag_context);

    // 4. Create LLM client for the provider
    let llm_client = create_client(&provider).map_err(|e| format!("Failed to create LLM client: {}", e))?;

    // 5. Build chat request with messages
    let mut llm_messages = vec![LlmChatMessage::system(&system_prompt)];

    for (role, content) in history {
        let msg = match role.as_str() {
            "assistant" => LlmChatMessage::assistant(&content),
            "system" => LlmChatMessage::system(&content),
            _ => LlmChatMessage::user(&content),
        };
        llm_messages.push(msg);
    }

    llm_messages.push(LlmChatMessage::user(&input.content));

    let chat_request = ChatRequest {
        model: model.clone(),
        messages: llm_messages,
        max_tokens: None, // Let the model decide, avoid compatibility issues
        temperature: None,
        tools: None,
        tool_choice: None,
        stream: true,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    // 6. Start streaming request
    let mut rx = llm_client.chat_stream(chat_request).await
        .map_err(|e| format!("Failed to start stream: {}", e))?;

    // 7. Process streaming response - use session_id if provided, fallback to conversation id
    let stream_key = input
        .session_id
        .clone()
        .unwrap_or_else(|| conversation.id.clone());
    let event_name = format!("chat-stream-{}", stream_key);
    let mut full_content = String::new();
    let mut was_cancelled = false;

    // Create cancellation channel and register in active streams
    let (cancel_tx, cancel_rx) = watch::channel(false);
    {
        let mut streams = active_streams.0.write().map_err(|e| format!("Lock error: {}", e))?;
        streams.insert(stream_key.clone(), cancel_tx);
    }

    // Process stream events from LlmClient
    while let Some(event) = rx.recv().await {
        // Check for cancellation
        if *cancel_rx.borrow() {
            log::info!("Stream cancelled by user for session: {}", stream_key);
            was_cancelled = true;
            break;
        }

        match event {
            StreamEvent::Content { delta } => {
                full_content.push_str(&delta);
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Chunk {
                        content: delta,
                    },
                );
            }
            StreamEvent::Thinking { delta } => {
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Thinking {
                        content: delta,
                    },
                );
            }
            StreamEvent::Error { message } => {
                log::warn!("Stream error: {}", message);
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Error {
                        message,
                    },
                );
            }
            StreamEvent::Done { .. } => {
                break;
            }
            _ => {} // Handle other events like ToolCallStart, ToolCallDelta if needed
        }
    }

    // Clean up active stream
    {
        let mut streams = active_streams.0.write().map_err(|e| format!("Lock error: {}", e))?;
        streams.remove(&stream_key);
    }

    // If cancelled and no content was generated, add a note
    if was_cancelled && full_content.is_empty() {
        full_content = "[Generation stopped by user]".to_string();
    } else if was_cancelled {
        full_content.push_str("\n\n[Generation stopped by user]");
    }

    // 10. Extract citations from response
    let references = extract_note_references(&full_content);
    let citations = resolve_citations(&references, &rag_context);

    // 11. Save assistant message with metadata (sync db operation)
    let (assistant_message, updated_conversation) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let metadata = MessageMetadata {
            citations: citations.clone(),
            model: Some(model.clone()),
            usage: None,
        };

        let assistant_message = db::create_message(
            &conn,
            &conversation.id,
            MessageRole::Assistant,
            &full_content,
            Some(&metadata),
        )
        .map_err(|e| format!("Failed to save assistant message: {}", e))?;

        let updated_conversation = db::get_conversation(&conn, &conversation.id)
            .map_err(|e| format!("Database error: {}", e))?
            .unwrap_or(conversation);
        
        (assistant_message, updated_conversation)
    };

    // Emit completion event
    let _ = app.emit(
        &event_name,
        ChatStreamEvent::Complete {
            message: assistant_message.clone(),
        },
    );

    // Generate AI title for new conversations (non-blocking, best effort)
    let final_conversation = if is_new_conversation {
        match generate_ai_title(&provider, &model, &user_message.content).await {
            Ok(title) => {
                // Update the conversation with the AI-generated title
                let pool_guard = pool.0.read().unwrap();
                if let Some(pool) = pool_guard.as_ref() {
                    if let Ok(conn) = pool.get() {
                        db::update_conversation(&conn, &updated_conversation.id, Some(&title), None)
                            .unwrap_or(updated_conversation.clone())
                    } else {
                        updated_conversation.clone()
                    }
                } else {
                    updated_conversation.clone()
                }
            }
            Err(e) => {
                log::warn!("Failed to generate AI title: {}", e);
                // Fall back to truncated message as title
                let fallback_title = generate_title_from_message(&user_message.content, 50);
                let pool_guard = pool.0.read().unwrap();
                if let Some(pool) = pool_guard.as_ref() {
                    if let Ok(conn) = pool.get() {
                        db::update_conversation(&conn, &updated_conversation.id, Some(&fallback_title), None)
                            .unwrap_or(updated_conversation.clone())
                    } else {
                        updated_conversation.clone()
                    }
                } else {
                    updated_conversation.clone()
                }
            }
        }
    } else {
        updated_conversation
    };

    Ok(ChatResponse {
        conversation: final_conversation,
        user_message,
        assistant_message,
    })
}

/// Send a chat message without streaming (simpler, for testing)
#[tauri::command]
pub async fn send_chat_message_sync(
    pool: State<'_, AppPool>,
    input: SendMessageInput,
) -> Result<ChatResponse, String> {
    // 1. Sync db operations before async work
    let (conversation, user_message, history, system_prompt_base, model, provider, is_new_conversation) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;

        let (conversation, is_new) = if let Some(ref conv_id) = input.conversation_id {
            let conv = db::get_conversation(&conn, conv_id)
                .map_err(|e| format!("Database error: {}", e))?
                .ok_or_else(|| format!("Conversation not found: {}", conv_id))?;
            (conv, false)
        } else {
            // Create with placeholder title, will be updated with AI-generated title later
            let conv = db::create_conversation(&conn, Some("New Chat"), None)
                .map_err(|e| format!("Failed to create conversation: {}", e))?;
            (conv, true)
        };

        let user_message = db::create_message(
            &conn,
            &conversation.id,
            MessageRole::User,
            &input.content,
            None,
        )
        .map_err(|e| format!("Failed to save user message: {}", e))?;

        let messages = db::get_conversation_messages(&conn, &conversation.id)
            .map_err(|e| format!("Failed to get conversation history: {}", e))?;

        let history: Vec<(String, String)> = messages
            .iter()
            .filter(|m| m.id != user_message.id)
            .map(|m| (m.role.as_str().to_string(), m.content.clone()))
            .collect();

        let system_prompt_base = conversation
            .system_prompt
            .clone()
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());

        let ai_config = load_ai_config(&conn)?;
        let (model, provider) = get_chat_model_and_provider(&ai_config)?;
        
        (conversation, user_message, history, system_prompt_base, model, provider, is_new)
    };

    // 2. Build RAG context (async)
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    let rag_context = build_context(
        &pool_clone,
        &input.content,
        input.context.clone(),
        input.auto_retrieve_count,
    )
    .await
    .map_err(|e| format!("Failed to build context: {}", e))?;

    // 3. Format system prompt with context
    let system_prompt = format_system_prompt(&system_prompt_base, &rag_context);

    // 4. Create LLM client
    let llm_client = create_client(&provider).map_err(|e| format!("Failed to create LLM client: {}", e))?;

    // 5. Build messages
    let mut llm_messages = vec![LlmChatMessage::system(&system_prompt)];

    for (role, content) in history {
        let msg = match role.as_str() {
            "assistant" => LlmChatMessage::assistant(&content),
            "system" => LlmChatMessage::system(&content),
            _ => LlmChatMessage::user(&content),
        };
        llm_messages.push(msg);
    }

    llm_messages.push(LlmChatMessage::user(&input.content));

    let chat_request = ChatRequest {
        model: model.clone(),
        messages: llm_messages,
        max_tokens: None, // Let the model decide, avoid compatibility issues
        temperature: None,
        tools: None,
        tool_choice: None,
        stream: false,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    // 6. Make non-streaming request
    let response = llm_client.chat(chat_request).await
        .map_err(|e| format!("Chat request failed: {}", e))?;

    let content = response.content;

    // Extract citations
    let references = extract_note_references(&content);
    let citations = resolve_citations(&references, &rag_context);

    // Build metadata
    let usage = response.usage.map(|u| TokenUsage {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: u.total_tokens,
    });

    let metadata = MessageMetadata {
        citations,
        model: Some(model.clone()),
        usage,
    };

    // Save assistant message (sync db operation)
    let (assistant_message, updated_conversation) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let assistant_message =
            db::create_message(&conn, &conversation.id, MessageRole::Assistant, &content, Some(&metadata))
                .map_err(|e| format!("Failed to save assistant message: {}", e))?;

        let updated_conversation = db::get_conversation(&conn, &conversation.id)
            .map_err(|e| format!("Database error: {}", e))?
            .unwrap_or(conversation);
        
        (assistant_message, updated_conversation)
    };

    // Generate AI title for new conversations (non-blocking, best effort)
    let final_conversation = if is_new_conversation {
        match generate_ai_title(&provider, &model, &user_message.content).await {
            Ok(title) => {
                let pool_guard = pool.0.read().unwrap();
                if let Some(pool) = pool_guard.as_ref() {
                    if let Ok(conn) = pool.get() {
                        db::update_conversation(&conn, &updated_conversation.id, Some(&title), None)
                            .unwrap_or(updated_conversation.clone())
                    } else {
                        updated_conversation.clone()
                    }
                } else {
                    updated_conversation.clone()
                }
            }
            Err(e) => {
                log::warn!("Failed to generate AI title: {}", e);
                let fallback_title = generate_title_from_message(&user_message.content, 50);
                let pool_guard = pool.0.read().unwrap();
                if let Some(pool) = pool_guard.as_ref() {
                    if let Ok(conn) = pool.get() {
                        db::update_conversation(&conn, &updated_conversation.id, Some(&fallback_title), None)
                            .unwrap_or(updated_conversation.clone())
                    } else {
                        updated_conversation.clone()
                    }
                } else {
                    updated_conversation.clone()
                }
            }
        }
    } else {
        updated_conversation
    };

    Ok(ChatResponse {
        conversation: final_conversation,
        user_message,
        assistant_message,
    })
}

/// Edit a message and regenerate the response
/// This deletes all messages from the edited message onwards and regenerates
#[tauri::command]
pub async fn edit_message_and_regenerate(
    app: AppHandle,
    pool: State<'_, AppPool>,
    active_streams: State<'_, ActiveStreams>,
    message_id: String,
    new_content: String,
) -> Result<ChatResponse, String> {
    // 1. Get the original message and verify it's a user message
    let (conversation, history_before) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let message = db::get_message(&conn, &message_id)
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| format!("Message not found: {}", message_id))?;
        
        if message.role != MessageRole::User {
            return Err("Can only edit user messages".to_string());
        }
        
        let conversation = db::get_conversation(&conn, &message.conversation_id)
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| format!("Conversation not found: {}", message.conversation_id))?;
        
        // Get messages before the edited message
        let all_messages = db::get_conversation_messages(&conn, &conversation.id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        
        let history_before: Vec<(String, String)> = all_messages
            .iter()
            .take_while(|m| m.id != message_id)
            .map(|m| (m.role.as_str().to_string(), m.content.clone()))
            .collect();
        
        // Delete the original message and all messages after it
        db::delete_messages_from(&conn, &conversation.id, &message_id)
            .map_err(|e| format!("Failed to delete messages: {}", e))?;
        
        (conversation, history_before)
    };

    // 2. Create the new user message
    let user_message = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        db::create_message(
            &conn,
            &conversation.id,
            MessageRole::User,
            &new_content,
            None,
        )
        .map_err(|e| format!("Failed to save user message: {}", e))?
    };

    // 3. Build RAG context for the new message
    let pool_clone = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.as_ref().ok_or("Database not initialized")?.clone()
    };
    let rag_context = build_context(
        &pool_clone,
        &new_content,
        vec![], // No explicit context for edited messages
        5,      // Auto-retrieve some context
    )
    .await
    .map_err(|e| format!("Failed to build context: {}", e))?;

    // 4. Get model, provider, and format system prompt
    let (system_prompt, model, provider) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let base_prompt = conversation
            .system_prompt
            .clone()
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());
        let system_prompt = format_system_prompt(&base_prompt, &rag_context);
        
        let ai_config = load_ai_config(&conn)?;
        let (model, provider) = get_chat_model_and_provider(&ai_config)?;
        
        (system_prompt, model, provider)
    };

    // 5. Create LLM client
    let llm_client = create_client(&provider).map_err(|e| format!("Failed to create LLM client: {}", e))?;

    // 6. Build messages
    let mut llm_messages = vec![LlmChatMessage::system(&system_prompt)];

    for (role, content) in history_before {
        let msg = match role.as_str() {
            "assistant" => LlmChatMessage::assistant(&content),
            "system" => LlmChatMessage::system(&content),
            _ => LlmChatMessage::user(&content),
        };
        llm_messages.push(msg);
    }

    llm_messages.push(LlmChatMessage::user(&new_content));

    let chat_request = ChatRequest {
        model: model.clone(),
        messages: llm_messages,
        max_tokens: None, // Let the model decide, avoid compatibility issues
        temperature: None,
        tools: None,
        tool_choice: None,
        stream: true,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    // 7. Start streaming request
    let mut rx = llm_client.chat_stream(chat_request).await
        .map_err(|e| format!("Failed to start stream: {}", e))?;

    // 8. Process streaming response
    let stream_key = conversation.id.clone();
    let event_name = format!("chat-stream-{}", stream_key);
    let mut full_content = String::new();
    let mut was_cancelled = false;

    // Create cancellation channel and register in active streams
    let (cancel_tx, cancel_rx) = watch::channel(false);
    {
        let mut streams = active_streams.0.write().map_err(|e| format!("Lock error: {}", e))?;
        streams.insert(stream_key.clone(), cancel_tx);
    }

    // Process stream events from LlmClient
    while let Some(event) = rx.recv().await {
        // Check for cancellation
        if *cancel_rx.borrow() {
            log::info!("Stream cancelled by user for session: {}", stream_key);
            was_cancelled = true;
            break;
        }

        match event {
            StreamEvent::Content { delta } => {
                full_content.push_str(&delta);
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Chunk {
                        content: delta,
                    },
                );
            }
            StreamEvent::Thinking { delta } => {
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Thinking {
                        content: delta,
                    },
                );
            }
            StreamEvent::Error { message } => {
                log::warn!("Stream error: {}", message);
                let _ = app.emit(
                    &event_name,
                    ChatStreamEvent::Error {
                        message,
                    },
                );
            }
            StreamEvent::Done { .. } => {
                break;
            }
            _ => {} // Handle other events like ToolCallStart, ToolCallDelta if needed
        }
    }

    // Clean up active stream
    {
        let mut streams = active_streams.0.write().map_err(|e| format!("Lock error: {}", e))?;
        streams.remove(&stream_key);
    }

    // If cancelled and no content was generated, add a note
    if was_cancelled && full_content.is_empty() {
        full_content = "[Generation stopped by user]".to_string();
    } else if was_cancelled {
        full_content.push_str("\n\n[Generation stopped by user]");
    }

    // 8. Extract citations and save assistant message
    let references = extract_note_references(&full_content);
    let citations = resolve_citations(&references, &rag_context);

    let (assistant_message, updated_conversation) = {
        let pool_guard = pool.0.read().unwrap();
        let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Database error: {}", e))?;
        
        let metadata = MessageMetadata {
            citations: citations.clone(),
            model: Some(model),
            usage: None,
        };

        let assistant_message = db::create_message(
            &conn,
            &conversation.id,
            MessageRole::Assistant,
            &full_content,
            Some(&metadata),
        )
        .map_err(|e| format!("Failed to save assistant message: {}", e))?;

        let updated_conversation = db::get_conversation(&conn, &conversation.id)
            .map_err(|e| format!("Database error: {}", e))?
            .unwrap_or(conversation);
        
        (assistant_message, updated_conversation)
    };

    // Emit completion event
    let _ = app.emit(
        &event_name,
        ChatStreamEvent::Complete {
            message: assistant_message.clone(),
        },
    );

    Ok(ChatResponse {
        conversation: updated_conversation,
        user_message,
        assistant_message,
    })
}

/// Get the default system prompt
#[tauri::command]
pub fn get_default_system_prompt() -> String {
    DEFAULT_SYSTEM_PROMPT.to_string()
}

/// Stop an active generation stream
/// 
/// This signals the streaming loop to stop processing chunks and return early.
/// The partial response (what was generated so far) will be saved.
#[tauri::command]
pub async fn stop_generation(
    active_streams: State<'_, ActiveStreams>,
    session_id: String,
) -> Result<bool, String> {
    let streams = active_streams.0.read().map_err(|e| format!("Lock error: {}", e))?;
    
    if let Some(cancel_tx) = streams.get(&session_id) {
        // Signal cancellation
        let _ = cancel_tx.send(true);
        log::info!("Sent stop signal for session: {}", session_id);
        Ok(true)
    } else {
        log::debug!("No active stream found for session: {}", session_id);
        Ok(false)
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the chat model from AI config
#[allow(dead_code)]
fn get_chat_model(config: &crate::ai::AIConfig) -> Result<String, String> {
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = config.default_provider {
        config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider.ok_or_else(|| {
        "No AI provider configured. Please set up a provider in Settings.".to_string()
    })?;

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    // For local providers (Ollama, LM Studio), the model name might contain "/"
    // as part of the actual model identifier (e.g., "openai/gpt-oss-120b" from LM Studio)
    // We need to preserve this and just prepend our routing prefix
    match provider.provider_type {
        crate::ai::ProviderType::Ollama => {
            // Ollama models: use ollama/model-name format
            // Model names from Ollama don't typically have prefixes
            if model.starts_with("ollama/") {
                Ok(model)
            } else {
                Ok(format!("ollama/{}", model))
            }
        }
        crate::ai::ProviderType::LMStudio => {
            // LM Studio uses OpenAI-compatible API
            if model.starts_with("lmstudio/") {
                Ok(model)
            } else {
                Ok(format!("lmstudio/{}", model))
            }
        }
        crate::ai::ProviderType::VLLM => {
            // VLLM uses OpenAI-compatible API
            if model.starts_with("vllm/") {
                Ok(model)
            } else {
                Ok(format!("vllm/{}", model))
            }
        }
        crate::ai::ProviderType::OpenAI => {
            // For OpenAI, strip any wrong prefix and use openai/
            let model_name = model.clone();
            Ok(format!("openai/{}", model_name))
        }
        crate::ai::ProviderType::Anthropic => {
            let model_name = model.clone();
            Ok(format!("anthropic/{}", model_name))
        }
        crate::ai::ProviderType::Google => {
            let model_name = model.clone();
            Ok(format!("google/{}", model_name))
        }
        crate::ai::ProviderType::Custom => {
            // Custom providers route through OpenAI
            if model.starts_with("openai/") {
                Ok(model)
            } else {
                Ok(format!("openai/{}", model))
            }
        }
    }
}

/// Get the chat model and provider from AI config
fn get_chat_model_and_provider(config: &crate::ai::AIConfig) -> Result<(String, crate::ai::AIProvider), String> {
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = config.default_provider {
        config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider.ok_or_else(|| {
        "No AI provider configured. Please set up a provider in Settings.".to_string()
    })?.clone();

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    // Format the model with provider prefix for routing
    let formatted_model = match provider.provider_type {
        crate::ai::ProviderType::Ollama => {
            if model.starts_with("ollama/") { model } else { format!("ollama/{}", model) }
        }
        crate::ai::ProviderType::LMStudio => {
            if model.starts_with("lmstudio/") { model } else { format!("lmstudio/{}", model) }
        }
        crate::ai::ProviderType::VLLM => {
            if model.starts_with("vllm/") { model } else { format!("vllm/{}", model) }
        }
        crate::ai::ProviderType::OpenAI => {
            let model_name = model.clone();
            format!("openai/{}", model_name)
        }
        crate::ai::ProviderType::Anthropic => {
            let model_name = model.clone();
            format!("anthropic/{}", model_name)
        }
        crate::ai::ProviderType::Google => {
            let model_name = model.clone();
            format!("google/{}", model_name)
        }
        crate::ai::ProviderType::Custom => {
            if model.starts_with("openai/") { model } else { format!("openai/{}", model) }
        }
    };

    Ok((formatted_model, provider))
}

/// Strip known provider prefixes from model name
/// Only strips if the prefix matches a known provider (openai/, anthropic/, google/, ollama/, lmstudio/, vllm/)
/// System prompt for title generation
const TITLE_SYSTEM_PROMPT: &str = r#"Generate a short title (3-6 words max) for the user's message. Output ONLY the title text - no quotes, no punctuation, no explanation. Just the title words."#;

/// Generate a conversation title using AI
async fn generate_ai_title(
    provider: &crate::ai::AIProvider,
    model: &str,
    user_message: &str,
) -> Result<String, String> {
    let llm_client = create_client(provider)
        .map_err(|e| format!("Failed to create LLM client: {}", e))?;
    
    let messages = vec![
        LlmChatMessage::system(TITLE_SYSTEM_PROMPT),
        LlmChatMessage::user(&format!("Generate a short title for this message:\n\n{}", user_message)),
    ];
    
    let request = ChatRequest {
        model: model.to_string(),
        messages,
        max_tokens: None,
        temperature: Some(0.7),
        tools: None,
        tool_choice: None,
        stream: false,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    let response = llm_client.chat(request).await
        .map_err(|e| format!("Title generation failed: {}", e))?;

    let title = response.content.trim().to_string();
    
    // Clean up the title - remove quotes if present
    let title = title.trim_matches('"').trim_matches('\'').to_string();
    
    if title.is_empty() { Ok("New Chat".to_string()) } else { Ok(title) }
}
