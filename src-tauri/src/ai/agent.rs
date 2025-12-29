//! Agent executor infrastructure for tool-calling AI agents
//!
//! Provides a reusable agent loop that handles multi-turn conversations
//! with function calling (tools). Agents implement the ToolExecutor trait
//! to provide their specific tools.
//!
//! This module now uses the LlmClient trait for all API calls, enabling
//! proper token usage tracking and context management.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use thiserror::Error;
use super::config::AIProvider;
use super::llm::{
    ChatMessage, ChatRequest, ChatResponse, LlmError, MessageRole,
    ToolCall as LlmToolCall, ToolDefinition as LlmToolDefinition, TokenUsage,
};

/// Convert agent tool definitions to LLM tool definitions
fn convert_tools_to_llm(tools: &[ToolDefinition]) -> Vec<LlmToolDefinition> {
    tools.iter().map(|t| LlmToolDefinition {
        tool_type: t.tool_type.clone(),
        function: super::llm::FunctionDefinition {
            name: t.function.name.clone(),
            description: t.function.description.clone(),
            parameters: t.function.parameters.clone(),
        },
    }).collect()
}

/// Convert agent messages to LLM chat messages
fn convert_messages_to_llm(messages: &[AgentMessage]) -> Vec<ChatMessage> {
    messages.iter().map(|m| {
        let role = match m.role.as_str() {
            "system" => MessageRole::System,
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "tool" => MessageRole::Tool,
            _ => MessageRole::User,
        };
        
        ChatMessage {
            role,
            content: m.content.clone(),
            tool_calls: m.tool_calls.as_ref().map(|calls| {
                calls.iter().map(|c| LlmToolCall {
                    id: c.id.clone(),
                    call_type: c.call_type.clone().unwrap_or_else(|| "function".to_string()),
                    function: super::llm::FunctionCall {
                        name: c.function.name.clone(),
                        arguments: c.function.arguments.clone(),
                    },
                }).collect()
            }),
            tool_call_id: m.tool_call_id.clone(),
        }
    }).collect()
}

/// Extract tool calls from LLM response
fn extract_tool_calls_from_response(response: &ChatResponse) -> Option<Vec<ToolCall>> {
    response.tool_calls.as_ref().map(|calls| {
        calls.iter().map(|c| ToolCall {
            id: c.id.clone(),
            function: FunctionCall {
                name: c.function.name.clone(),
                arguments: c.function.arguments.clone(),
            },
            call_type: Some(c.call_type.clone()),
        }).collect()
    })
}

/// Errors that can occur during agent execution
#[derive(Error, Debug)]
pub enum AgentError {
    #[error("HTTP request failed: {0}")]
    HttpError(String),
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    #[error("Tool execution failed: {0}")]
    ToolError(String),
    #[error("Max iterations exceeded: {0}")]
    MaxIterationsExceeded(usize),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Agent execution was cancelled")]
    Cancelled,
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
}

impl From<LlmError> for AgentError {
    fn from(err: LlmError) -> Self {
        match err {
            LlmError::HttpError(e) => AgentError::HttpError(e.to_string()),
            LlmError::ApiError { status, message } => {
                AgentError::ApiError(format!("HTTP {}: {}", status, message))
            }
            LlmError::MissingApiKey => AgentError::NotConfigured("Missing API key".to_string()),
            LlmError::InvalidResponse(msg) => AgentError::ParseError(msg),
            LlmError::NotConfigured(msg) => AgentError::NotConfigured(msg),
        }
    }
}

// ============================================================================
// Progress Events for Streaming
// ============================================================================

/// Progress events emitted during agent execution
/// These are sent via Tauri events for real-time UI updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentProgress {
    /// Agent execution has started
    Started {
        agent_name: String,
        execution_id: String,
    },
    /// Agent is calling a tool
    ToolCalling {
        tool_name: String,
        arguments: Value,
    },
    /// Tool execution completed
    ToolResult {
        tool_name: String,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        preview: Option<String>,
    },
    /// Agent is thinking/processing
    Thinking {
        message: String,
    },
    /// Agent completed successfully
    Completed {
        result: AgentResult,
    },
    /// Agent encountered an error
    Error {
        message: String,
    },
    /// Agent was cancelled
    Cancelled,
}

// ============================================================================
// Cancellation Support
// ============================================================================

/// Token for cancelling an agent execution
/// 
/// Clone this and pass to the agent runner, then call `cancel()` to stop execution.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    /// Create a new cancellation token
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Cancel the agent execution
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Check if cancellation has been requested
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

/// A tool definition in OpenAI function calling format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

/// Function definition within a tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

impl ToolDefinition {
    /// Create a new function tool definition
    pub fn function(name: &str, description: &str, parameters: Value) -> Self {
        Self {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: name.to_string(),
                description: description.to_string(),
                parameters,
            },
        }
    }
}

/// A tool call requested by the LLM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function: FunctionCall,
    #[serde(rename = "type")]
    pub call_type: Option<String>,
}

/// Function call details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// Result of executing a tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub content: String,
}

/// A message in the agent conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl AgentMessage {
    /// Create a system message
    pub fn system(content: &str) -> Self {
        Self {
            role: "system".to_string(),
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create a user message
    pub fn user(content: &str) -> Self {
        Self {
            role: "user".to_string(),
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create an assistant message with tool calls (no content)
    pub fn assistant_tool_calls(tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: None,
            tool_calls: Some(tool_calls),
            tool_call_id: None,
        }
    }

    /// Create a tool result message
    pub fn tool_result(tool_call_id: &str, content: &str) -> Self {
        Self {
            role: "tool".to_string(),
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.to_string()),
        }
    }
}

/// Cumulative token usage across all iterations
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeTokenUsage {
    /// Total prompt tokens across all requests
    pub total_prompt_tokens: u32,
    /// Total completion tokens across all requests
    pub total_completion_tokens: u32,
    /// Total tokens (prompt + completion)
    pub total_tokens: u32,
}

impl CumulativeTokenUsage {
    /// Add usage from a single response
    pub fn add(&mut self, usage: &TokenUsage) {
        self.total_prompt_tokens += usage.prompt_tokens;
        self.total_completion_tokens += usage.completion_tokens;
        self.total_tokens += usage.total_tokens;
    }
}

/// Result of running an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResult {
    /// The final text response from the agent
    pub final_response: String,
    /// All tool calls made during execution
    pub tool_calls_made: Vec<ToolCallRecord>,
    /// Number of LLM iterations
    pub iterations: usize,
    /// Cumulative token usage across all iterations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<CumulativeTokenUsage>,
}

/// Record of a tool call and its result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub tool_name: String,
    pub arguments: Value,
    pub result: String,
}

/// Trait for implementing tool execution
///
/// Agents implement this trait to provide their specific tools.
/// The executor calls `execute` for each tool the LLM wants to use.
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Execute a tool by name with the given arguments
    async fn execute(&self, name: &str, args: Value) -> Result<String, String>;
}

/// Run an agent with the given configuration
///
/// This function implements the core agent loop:
/// 1. Send messages + tools to LLM via LlmClient
/// 2. If response has tool_calls, execute each tool
/// 3. Add tool results as tool role messages
/// 4. Repeat until LLM responds with content only (no tool calls)
/// 5. Return final response + all tool calls made + token usage
pub async fn run_agent<E: ToolExecutor>(
    provider: &AIProvider,
    model: &str,
    system_prompt: &str,
    initial_message: &str,
    tools: Vec<ToolDefinition>,
    executor: &E,
    max_iterations: usize,
) -> Result<AgentResult, AgentError> {
    // Create LLM client from provider config
    let client = super::llm::create_client(provider)?;
    
    // Initialize message history
    let mut messages = vec![
        AgentMessage::system(system_prompt),
        AgentMessage::user(initial_message),
    ];
    
    let mut all_tool_calls: Vec<ToolCallRecord> = Vec::new();
    let mut cumulative_usage = CumulativeTokenUsage::default();
    let mut iterations = 0;
    
    // Convert tools once
    let llm_tools = convert_tools_to_llm(&tools);
    
    loop {
        iterations += 1;
        if iterations > max_iterations {
            return Err(AgentError::MaxIterationsExceeded(max_iterations));
        }
        
        // Build request using LlmClient types
        let request = ChatRequest {
            model: model.to_string(),
            messages: convert_messages_to_llm(&messages),
            tools: if llm_tools.is_empty() { None } else { Some(llm_tools.clone()) },
            tool_choice: if llm_tools.is_empty() { None } else { Some("auto".to_string()) },
            max_tokens: None,
            temperature: None,
            enable_reasoning: false,
            reasoning_effort: None,
            thinking_budget: None,
        };
        
        // Call via LlmClient - this handles all provider-specific formatting
        let response = client.chat(request).await?;
        
        // Track token usage
        if let Some(ref usage) = response.usage {
            cumulative_usage.add(usage);
        }
        
        // Check if there are tool calls
        if let Some(tool_calls) = extract_tool_calls_from_response(&response) {
            if !tool_calls.is_empty() {
                // Add the assistant message with tool calls to history
                messages.push(AgentMessage::assistant_tool_calls(tool_calls.clone()));
                
                // Execute each tool call
                for tool_call in &tool_calls {
                    let args: Value = serde_json::from_str(&tool_call.function.arguments)
                        .unwrap_or(Value::Object(serde_json::Map::new()));
                    
                    log::info!("Agent calling tool: {} with args: {}", tool_call.function.name, args);
                    
                    let result = executor.execute(&tool_call.function.name, args.clone()).await;
                    
                    let result_str = match &result {
                        Ok(s) => s.clone(),
                        Err(e) => format!("Error: {}", e),
                    };
                    
                    log::info!("Tool {} result: {}", tool_call.function.name, &result_str);
                    
                    // Record the tool call
                    all_tool_calls.push(ToolCallRecord {
                        tool_name: tool_call.function.name.clone(),
                        arguments: args,
                        result: result_str.clone(),
                    });
                    
                    // Add tool result to messages
                    messages.push(AgentMessage::tool_result(&tool_call.id, &result_str));
                }
                
                // Continue the loop to get the next response
                continue;
            }
        }
        
        // No tool calls - we have the final response
        let final_response = response.content;
        
        return Ok(AgentResult {
            final_response,
            tool_calls_made: all_tool_calls,
            iterations,
            token_usage: Some(cumulative_usage),
        });
    }
}

/// Run an agent with Tauri event streaming for real-time UI updates
///
/// This is similar to `run_agent` but emits AgentProgress events via Tauri
/// for each step of the execution, allowing the UI to show real-time progress.
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `execution_id` - Unique ID for this execution (used for event correlation)
/// * `agent_name` - Human-readable name of the agent (for UI display)
/// * `provider` - AI provider configuration
/// * `model` - Model identifier (e.g., "gpt-4")
/// * `system_prompt` - System prompt for the agent
/// * `initial_message` - User's initial message
/// * `tools` - Available tools for the agent
/// * `executor` - Tool executor implementation
/// * `max_iterations` - Maximum number of LLM iterations
/// * `cancellation_token` - Optional token for cancelling execution
#[allow(clippy::too_many_arguments)]
pub async fn run_agent_with_events<E: ToolExecutor>(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    agent_name: &str,
    provider: &AIProvider,
    model: &str,
    system_prompt: &str,
    initial_message: &str,
    tools: Vec<ToolDefinition>,
    executor: &E,
    max_iterations: usize,
    cancellation_token: Option<&CancellationToken>,
) -> Result<AgentResult, AgentError> {
    use tauri::Emitter;
    
    let event_name = format!("agent-progress-{}", execution_id);
    
    // Create LLM client from provider config
    let client = super::llm::create_client(provider).map_err(|e| {
        let error = AgentError::from(e);
        let _ = app_handle.emit(&event_name, &AgentProgress::Error {
            message: error.to_string(),
        });
        error
    })?;
    
    // Helper to emit progress events
    let emit_progress = |progress: AgentProgress| {
        let _ = app_handle.emit(&event_name, &progress);
    };
    
    // Check for cancellation
    let check_cancelled = || -> Result<(), AgentError> {
        if let Some(token) = cancellation_token {
            if token.is_cancelled() {
                return Err(AgentError::Cancelled);
            }
        }
        Ok(())
    };
    
    // Emit started event
    emit_progress(AgentProgress::Started {
        agent_name: agent_name.to_string(),
        execution_id: execution_id.to_string(),
    });
    
    // Initialize message history
    let mut messages = vec![
        AgentMessage::system(system_prompt),
        AgentMessage::user(initial_message),
    ];
    
    let mut all_tool_calls: Vec<ToolCallRecord> = Vec::new();
    let mut cumulative_usage = CumulativeTokenUsage::default();
    let mut iterations = 0;
    
    // Convert tools once
    let llm_tools = convert_tools_to_llm(&tools);
    
    loop {
        check_cancelled()?;
        
        iterations += 1;
        if iterations > max_iterations {
            let error = AgentError::MaxIterationsExceeded(max_iterations);
            emit_progress(AgentProgress::Error {
                message: error.to_string(),
            });
            return Err(error);
        }
        
        emit_progress(AgentProgress::Thinking {
            message: format!("Processing (iteration {})...", iterations),
        });
        
        // Build request using LlmClient types
        let request = ChatRequest {
            model: model.to_string(),
            messages: convert_messages_to_llm(&messages),
            tools: if llm_tools.is_empty() { None } else { Some(llm_tools.clone()) },
            tool_choice: if llm_tools.is_empty() { None } else { Some("auto".to_string()) },
            max_tokens: None,
            temperature: None,
            enable_reasoning: false,
            reasoning_effort: None,
            thinking_budget: None,
        };
        
        // Call via LlmClient
        let response = client.chat(request).await.map_err(|e| {
            let error = AgentError::from(e);
            emit_progress(AgentProgress::Error {
                message: error.to_string(),
            });
            error
        })?;
        
        check_cancelled()?;
        
        // Track token usage
        if let Some(ref usage) = response.usage {
            cumulative_usage.add(usage);
        }
        
        // Check if there are tool calls
        if let Some(tool_calls) = extract_tool_calls_from_response(&response) {
            if !tool_calls.is_empty() {
                // Add the assistant message with tool calls to history
                messages.push(AgentMessage::assistant_tool_calls(tool_calls.clone()));
                
                // Execute each tool call
                for tool_call in &tool_calls {
                    check_cancelled()?;
                    
                    let args: Value = serde_json::from_str(&tool_call.function.arguments)
                        .unwrap_or(Value::Object(serde_json::Map::new()));
                    
                    // Emit tool calling event
                    emit_progress(AgentProgress::ToolCalling {
                        tool_name: tool_call.function.name.clone(),
                        arguments: args.clone(),
                    });
                    
                    log::info!("Agent calling tool: {} with args: {}", tool_call.function.name, args);
                    
                    let result = executor.execute(&tool_call.function.name, args.clone()).await;
                    
                    let (result_str, success) = match &result {
                        Ok(s) => (s.clone(), true),
                        Err(e) => (format!("Error: {}", e), false),
                    };
                    
                    // Emit tool result event with full content (no truncation)
                    let preview = Some(result_str.clone());
                    
                    emit_progress(AgentProgress::ToolResult {
                        tool_name: tool_call.function.name.clone(),
                        success,
                        preview,
                    });
                    
                    log::info!("Tool {} result: {}", tool_call.function.name, &result_str);
                    
                    // Record the tool call
                    all_tool_calls.push(ToolCallRecord {
                        tool_name: tool_call.function.name.clone(),
                        arguments: args,
                        result: result_str.clone(),
                    });
                    
                    // Add tool result to messages
                    messages.push(AgentMessage::tool_result(&tool_call.id, &result_str));
                }
                
                // Continue the loop to get the next response
                continue;
            }
        }
        
        // No tool calls - we have the final response
        let final_response = response.content;
        
        let result = AgentResult {
            final_response,
            tool_calls_made: all_tool_calls,
            iterations,
            token_usage: Some(cumulative_usage),
        };
        
        // Emit completed event
        emit_progress(AgentProgress::Completed {
            result: result.clone(),
        });
        
        return Ok(result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_tool_definition_creation() {
        let tool = ToolDefinition::function(
            "test_tool",
            "A test tool",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "arg1": {"type": "string"}
                }
            }),
        );
        
        assert_eq!(tool.tool_type, "function");
        assert_eq!(tool.function.name, "test_tool");
    }
    
    #[test]
    fn test_agent_message_creation() {
        let system = AgentMessage::system("You are helpful");
        assert_eq!(system.role, "system");
        assert_eq!(system.content, Some("You are helpful".to_string()));
        
        let user = AgentMessage::user("Hello");
        assert_eq!(user.role, "user");
        
        let tool_result = AgentMessage::tool_result("call_123", "result data");
        assert_eq!(tool_result.role, "tool");
        assert_eq!(tool_result.tool_call_id, Some("call_123".to_string()));
    }
}
