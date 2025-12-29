//! Unified Streaming Agent
//!
//! A streaming agent loop with tool calling that can be used by both
//! the chat interface and the inline assistant. The only difference
//! between these use cases is the input messages and available tools.
//!
//! This module provides first-class streaming support, emitting events
//! for content chunks, tool calls, and tool results as they happen.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::watch;

use super::agent::{ToolCallRecord, ToolExecutor};
use super::config::AIProvider;
use super::llm::{
    create_client, ChatMessage, ChatRequest, LlmError, MessageRole, StreamEvent,
    ToolCall, ToolDefinition,
};

/// Errors that can occur during streaming agent execution
#[derive(Error, Debug)]
pub enum StreamingAgentError {
    #[error("LLM error: {0}")]
    LlmError(#[from] LlmError),
    #[error("Tool execution failed: {0}")]
    ToolError(String),
    #[error("Max iterations exceeded: {0}")]
    MaxIterationsExceeded(usize),
    #[error("Agent execution was cancelled")]
    Cancelled,
}

/// Result of running the streaming agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingAgentResult {
    /// The final text response from the agent
    pub content: String,
    /// Thinking/reasoning content accumulated during execution
    pub thinking_content: String,
    /// All tool calls made during execution
    pub tool_calls: Vec<ToolCallRecord>,
    /// Number of LLM iterations (including tool call rounds)
    pub iterations: usize,
}

/// Events emitted during streaming agent execution
/// These match the ChatStreamEvent format used by the frontend
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentStreamEvent {
    /// Content chunk from the LLM
    Chunk { content: String },
    /// Thinking/reasoning content from the LLM
    Thinking { content: String },
    /// Tool execution started
    ToolStart {
        tool: String,
        args: Value,
    },
    /// Tool execution completed
    ToolResult {
        tool: String,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        preview: Option<String>,
    },
    /// Error occurred
    Error { message: String },
}

/// A tool call being accumulated from stream deltas
#[derive(Debug, Clone)]
struct PendingToolCall {
    id: String,
    name: String,
    arguments: String,
}

/// Run a streaming agent with tool calling
///
/// This is the unified agent loop used by both chat and inline assistant.
/// It streams responses in real-time while handling tool calls iteratively.
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `event_key` - Event channel key (session_id for chat, execution_id for inline)
/// * `provider` - AI provider configuration
/// * `model` - Model identifier
/// * `initial_messages` - Starting messages (system + history + user message)
/// * `tools` - Available tools for the agent
/// * `executor` - Tool executor implementation
/// * `max_iterations` - Maximum number of LLM calls (including tool rounds)
/// * `cancel_rx` - Optional receiver for cancellation signals
///
/// # Returns
/// The final response content and all tool calls made
#[allow(clippy::too_many_arguments)]
pub async fn run_streaming_agent<E: ToolExecutor>(
    app_handle: &AppHandle,
    event_key: &str,
    provider: &AIProvider,
    model: &str,
    initial_messages: Vec<ChatMessage>,
    tools: Vec<ToolDefinition>,
    executor: &E,
    max_iterations: usize,
    cancel_rx: Option<watch::Receiver<bool>>,
) -> Result<StreamingAgentResult, StreamingAgentError> {
    let client = create_client(provider)?;
    let event_name = format!("chat-stream-{}", event_key);
    
    let mut messages = initial_messages;
    let mut all_tool_calls: Vec<ToolCallRecord> = Vec::new();
    let mut all_thinking_content = String::new();
    let mut iterations = 0;
    
    // Convert tool definitions to LLM format
    let llm_tools: Vec<super::llm::ToolDefinition> = tools
        .iter()
        .map(|t| super::llm::ToolDefinition {
            tool_type: t.tool_type.clone(),
            function: super::llm::FunctionDefinition {
                name: t.function.name.clone(),
                description: t.function.description.clone(),
                parameters: t.function.parameters.clone(),
            },
        })
        .collect();
    
    // Helper to check if cancelled
    let is_cancelled = || -> bool {
        if let Some(ref rx) = cancel_rx {
            *rx.borrow()
        } else {
            false
        }
    };
    
    loop {
        // Check for cancellation at the start of each iteration
        if is_cancelled() {
            log::info!("[StreamingAgent] Cancelled before iteration {}", iterations + 1);
            return Err(StreamingAgentError::Cancelled);
        }
        
        iterations += 1;
        if iterations > max_iterations {
            return Err(StreamingAgentError::MaxIterationsExceeded(max_iterations));
        }
        
        log::debug!(
            "[StreamingAgent] Iteration {} - {} messages, {} tools",
            iterations,
            messages.len(),
            llm_tools.len()
        );
        
        // Build chat request
        let request = ChatRequest {
            model: model.to_string(),
            messages: messages.clone(),
            tools: if llm_tools.is_empty() {
                None
            } else {
                Some(llm_tools.clone())
            },
            tool_choice: if llm_tools.is_empty() {
                None
            } else {
                Some("auto".to_string())
            },
            max_tokens: None,
            temperature: None,
            enable_reasoning: false,
            reasoning_effort: None,
            thinking_budget: None,
        };
        
        // Start streaming
        let mut rx = client.chat_stream(request).await?;
        
        // Track state during streaming
        let mut content_buffer = String::new();
        let mut thinking_buffer = String::new();
        let mut pending_tool_calls: HashMap<String, PendingToolCall> = HashMap::new();
        // finish_reason is captured but not currently used (different providers use different values)
        let mut _finish_reason = String::new();
        let mut was_cancelled = false;
        
        // Process stream events
        while let Some(event) = rx.recv().await {
            // Check for cancellation during streaming
            if is_cancelled() {
                log::info!("[StreamingAgent] Cancelled during streaming");
                was_cancelled = true;
                break;
            }
            match event {
                StreamEvent::Content { delta } => {
                    content_buffer.push_str(&delta);
                    // Emit content chunk to frontend
                    let _ = app_handle.emit(
                        &event_name,
                        AgentStreamEvent::Chunk { content: delta },
                    );
                }
                StreamEvent::Thinking { delta } => {
                    // Accumulate thinking content
                    thinking_buffer.push_str(&delta);
                    // Emit thinking content to frontend
                    let _ = app_handle.emit(
                        &event_name,
                        AgentStreamEvent::Thinking { content: delta },
                    );
                }
                StreamEvent::ToolCallStart { id, name } => {
                    log::info!("[StreamingAgent] Tool call started: {} ({})", name, id);
                    pending_tool_calls.insert(
                        id.clone(),
                        PendingToolCall {
                            id,
                            name,
                            arguments: String::new(),
                        },
                    );
                }
                StreamEvent::ToolCallDelta { id, arguments_delta } => {
                    if let Some(tc) = pending_tool_calls.get_mut(&id) {
                        tc.arguments.push_str(&arguments_delta);
                    }
                }
                StreamEvent::Done { finish_reason: reason } => {
                    _finish_reason = reason;
                    break;
                }
                StreamEvent::Error { message } => {
                    log::error!("[StreamingAgent] Stream error: {}", message);
                    let _ = app_handle.emit(
                        &event_name,
                        AgentStreamEvent::Error { message: message.clone() },
                    );
                    return Err(StreamingAgentError::ToolError(message));
                }
                StreamEvent::Usage { .. } => {
                    // Token usage - can be tracked if needed
                }
            }
        }
        
        // Merge thinking content from this iteration
        if !thinking_buffer.is_empty() {
            all_thinking_content.push_str(&thinking_buffer);
        }
        
        // If cancelled during streaming, return partial content
        if was_cancelled {
            log::info!(
                "[StreamingAgent] Returning partial content after cancellation: {} chars, {} tool calls",
                content_buffer.len(),
                all_tool_calls.len()
            );
            return Ok(StreamingAgentResult {
                content: content_buffer,
                thinking_content: all_thinking_content,
                tool_calls: all_tool_calls,
                iterations,
            });
        }
        
        // Check if we have tool calls to execute
        // If there are pending tool calls, execute them regardless of the specific finish_reason.
        // Different providers use different finish_reason values:
        // - OpenAI: "tool_calls" or "stop"
        // - Anthropic: "tool_use" or "end_turn"
        // - Google Gemini: "STOP" or other values
        // The key check is whether we accumulated tool calls during streaming.
        if !pending_tool_calls.is_empty() {
            log::info!(
                "[StreamingAgent] Processing {} tool calls",
                pending_tool_calls.len()
            );
            
            // Convert pending tool calls to the format needed for messages
            let tool_calls: Vec<ToolCall> = pending_tool_calls
                .values()
                .map(|tc| ToolCall {
                    id: tc.id.clone(),
                    call_type: "function".to_string(),
                    function: super::llm::FunctionCall {
                        name: tc.name.clone(),
                        arguments: tc.arguments.clone(),
                    },
                })
                .collect();
            
            // Add assistant message with tool calls
            messages.push(ChatMessage {
                role: MessageRole::Assistant,
                content: if content_buffer.is_empty() {
                    None
                } else {
                    Some(content_buffer.clone())
                },
                tool_calls: Some(tool_calls.clone()),
                tool_call_id: None,
            });
            
            // Execute each tool call
            for tc in tool_calls {
                // Check for cancellation before each tool execution
                if is_cancelled() {
                    log::info!("[StreamingAgent] Cancelled before tool execution: {}", tc.function.name);
                    return Ok(StreamingAgentResult {
                        content: content_buffer,
                        thinking_content: all_thinking_content,
                        tool_calls: all_tool_calls,
                        iterations,
                    });
                }
                
                let args: Value = serde_json::from_str(&tc.function.arguments)
                    .unwrap_or(Value::Object(serde_json::Map::new()));
                
                // Emit tool start event
                let _ = app_handle.emit(
                    &event_name,
                    AgentStreamEvent::ToolStart {
                        tool: tc.function.name.clone(),
                        args: args.clone(),
                    },
                );
                
                log::info!(
                    "[StreamingAgent] Executing tool: {} with args: {}",
                    tc.function.name,
                    args
                );
                
                // Execute the tool
                let result = executor.execute(&tc.function.name, args.clone()).await;
                
                let (result_str, success) = match &result {
                    Ok(s) => (s.clone(), true),
                    Err(e) => (format!("Error: {}", e), false),
                };
                
                log::info!(
                    "[StreamingAgent] Tool {} result (success={}): {}",
                    tc.function.name,
                    success,
                    if result_str.len() > 200 {
                        format!("{}...", &result_str[..200])
                    } else {
                        result_str.clone()
                    }
                );
                
                // Emit tool result event with full content (no truncation)
                let preview = Some(result_str.clone());
                
                let _ = app_handle.emit(
                    &event_name,
                    AgentStreamEvent::ToolResult {
                        tool: tc.function.name.clone(),
                        success,
                        preview,
                    },
                );
                
                // Record the tool call
                all_tool_calls.push(ToolCallRecord {
                    tool_name: tc.function.name.clone(),
                    arguments: args,
                    result: result_str.clone(),
                });
                
                // Add tool result message
                messages.push(ChatMessage {
                    role: MessageRole::Tool,
                    content: Some(result_str),
                    tool_calls: None,
                    tool_call_id: Some(tc.id.clone()),
                });
            }
            
            // Continue the loop to get the next response
            continue;
        }
        
        // No tool calls - this is the final response
        log::info!(
            "[StreamingAgent] Completed after {} iterations, {} tool calls",
            iterations,
            all_tool_calls.len()
        );
        
        return Ok(StreamingAgentResult {
            content: content_buffer,
            thinking_content: all_thinking_content,
            tool_calls: all_tool_calls,
            iterations,
        });
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_streaming_agent_result_serialization() {
        let result = StreamingAgentResult {
            content: "Hello".to_string(),
            thinking_content: String::new(),
            tool_calls: vec![],
            iterations: 1,
        };
        
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"content\":\"Hello\""));
        assert!(json.contains("\"iterations\":1"));
    }
    
    #[test]
    fn test_agent_stream_event_serialization() {
        let event = AgentStreamEvent::Chunk {
            content: "test".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"chunk\""));
        
        let tool_event = AgentStreamEvent::ToolStart {
            tool: "search_notes".to_string(),
            args: serde_json::json!({"query": "test"}),
        };
        let json = serde_json::to_string(&tool_event).unwrap();
        assert!(json.contains("\"type\":\"tool_start\""));
        assert!(json.contains("\"tool\":\"search_notes\""));
    }
}

