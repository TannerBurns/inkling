//! Shared types for LLM client implementations
//!
//! These types provide a unified interface across all LLM providers.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Errors that can occur during LLM operations
#[derive(Error, Debug)]
pub enum LlmError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    #[error("API error: {status} - {message}")]
    ApiError { status: u16, message: String },
    #[error("Missing API key")]
    MissingApiKey,
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
}

/// Role of a message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

impl MessageRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::System => "system",
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::Tool => "tool",
        }
    }
}

/// A message in a chat conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: Option<String>,
    /// Tool calls made by the assistant
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Tool call ID (for tool response messages)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn system(content: &str) -> Self {
        Self {
            role: MessageRole::System,
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn user(content: &str) -> Self {
        Self {
            role: MessageRole::User,
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn assistant(content: &str) -> Self {
        Self {
            role: MessageRole::Assistant,
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }
    }
}

/// A tool call requested by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
    /// Thought signature for Google Gemini API (required for thinking mode)
    /// This must be preserved and sent back when including function calls in history
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought_signature: Option<String>,
}

/// Function call details within a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// Tool definition for function calling
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


/// Request for a chat completion
#[derive(Debug, Clone, Default)]
pub struct ChatRequest {
    /// Model identifier (without provider prefix)
    pub model: String,
    /// Conversation messages
    pub messages: Vec<ChatMessage>,
    /// Available tools for function calling
    pub tools: Option<Vec<ToolDefinition>>,
    /// Tool choice: "auto", "none", or specific tool
    pub tool_choice: Option<String>,
    /// Maximum tokens to generate
    pub max_tokens: Option<u32>,
    /// Temperature for sampling
    pub temperature: Option<f32>,
    /// Enable reasoning/thinking mode if supported
    pub enable_reasoning: bool,
    /// Reasoning effort for OpenAI models (low, medium, high)
    pub reasoning_effort: Option<String>,
    /// Budget tokens for thinking (Anthropic)
    pub thinking_budget: Option<u32>,
}


/// Response from a chat completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    /// The generated content
    pub content: String,
    /// Reasoning/thinking content if available
    pub thinking: Option<String>,
    /// Tool calls made by the model
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Reason for completion
    pub finish_reason: String,
    /// Token usage
    pub usage: Option<TokenUsage>,
}

/// Token usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Streaming event from a chat completion
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Main content token
    Content { delta: String },
    /// Reasoning/thinking token (for UI thinking panel)
    Thinking { delta: String },
    /// Tool call being streamed (may come in parts)
    ToolCallStart {
        id: String,
        name: String,
        /// Thought signature for Google Gemini API (required for thinking mode)
        #[serde(skip_serializing_if = "Option::is_none")]
        thought_signature: Option<String>,
    },
    /// Tool call arguments delta
    ToolCallDelta {
        id: String,
        arguments_delta: String,
    },
    /// Token usage info
    Usage {
        prompt_tokens: u32,
        completion_tokens: u32,
    },
    /// Stream finished
    Done {
        finish_reason: String,
    },
    /// Error occurred
    Error {
        message: String,
    },
}
