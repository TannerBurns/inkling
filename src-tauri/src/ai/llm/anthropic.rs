//! Anthropic Claude API client
//!
//! Implements the Anthropic Messages API with:
//! - Extended thinking support (Claude 3.7+)
//! - Native tool calling
//! - Streaming with thinking and content blocks

#![allow(dead_code)]

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::mpsc;

use super::{
    ChatMessage, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse,
    FunctionCall, LlmClient, LlmError, MessageRole, StreamEvent, TokenUsage, ToolCall,
    ToolDefinition,
};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_BETA_THINKING: &str = "extended-thinking-2025-05-14";

/// Anthropic Claude API client
pub struct AnthropicClient {
    api_key: String,
    client: Client,
}

impl AnthropicClient {
    /// Create a new Anthropic client
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self { api_key, client }
    }

    /// Build request headers
    fn headers(&self, enable_thinking: bool) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        headers.insert("x-api-key", self.api_key.parse().unwrap());
        headers.insert("anthropic-version", ANTHROPIC_VERSION.parse().unwrap());

        if enable_thinking {
            headers.insert("anthropic-beta", ANTHROPIC_BETA_THINKING.parse().unwrap());
        }

        headers
    }

    /// Convert our messages to Anthropic format
    fn convert_messages(&self, messages: &[ChatMessage]) -> (Option<String>, Vec<AnthropicMessage>) {
        let mut system_prompt = None;
        let mut anthropic_messages = Vec::new();

        for msg in messages {
            match msg.role {
                MessageRole::System => {
                    // Anthropic uses a separate system parameter
                    if let Some(ref content) = msg.content {
                        system_prompt = Some(content.clone());
                    }
                }
                MessageRole::User => {
                    if let Some(ref content) = msg.content {
                        anthropic_messages.push(AnthropicMessage {
                            role: "user".to_string(),
                            content: AnthropicContent::Text(content.clone()),
                        });
                    }
                }
                MessageRole::Assistant => {
                    if let Some(ref content) = msg.content {
                        anthropic_messages.push(AnthropicMessage {
                            role: "assistant".to_string(),
                            content: AnthropicContent::Text(content.clone()),
                        });
                    } else if let Some(ref tool_calls) = msg.tool_calls {
                        // Assistant message with tool use
                        let blocks: Vec<AnthropicContentBlock> = tool_calls
                            .iter()
                            .map(|tc| AnthropicContentBlock::ToolUse {
                                id: tc.id.clone(),
                                name: tc.function.name.clone(),
                                input: serde_json::from_str(&tc.function.arguments)
                                    .unwrap_or(Value::Object(serde_json::Map::new())),
                            })
                            .collect();
                        anthropic_messages.push(AnthropicMessage {
                            role: "assistant".to_string(),
                            content: AnthropicContent::Blocks(blocks),
                        });
                    }
                }
                MessageRole::Tool => {
                    if let (Some(ref tool_call_id), Some(ref content)) =
                        (&msg.tool_call_id, &msg.content)
                    {
                        anthropic_messages.push(AnthropicMessage {
                            role: "user".to_string(),
                            content: AnthropicContent::Blocks(vec![AnthropicContentBlock::ToolResult {
                                tool_use_id: tool_call_id.clone(),
                                content: content.clone(),
                            }]),
                        });
                    }
                }
            }
        }

        (system_prompt, anthropic_messages)
    }

    /// Convert our tools to Anthropic format
    fn convert_tools(&self, tools: &[ToolDefinition]) -> Vec<AnthropicTool> {
        tools
            .iter()
            .map(|t| AnthropicTool {
                name: t.function.name.clone(),
                description: t.function.description.clone(),
                input_schema: t.function.parameters.clone(),
            })
            .collect()
    }
}

#[async_trait]
impl LlmClient for AnthropicClient {
    fn provider_name(&self) -> &'static str {
        "Anthropic"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = format!("{}/messages", ANTHROPIC_API_URL);
        let (system, messages) = self.convert_messages(&request.messages);

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
        });

        if let Some(system_prompt) = system {
            body["system"] = serde_json::json!(system_prompt);
        }

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
            }
        }

        if let Some(temperature) = request.temperature {
            body["temperature"] = serde_json::json!(temperature);
        }

        // Extended thinking support
        if request.enable_reasoning {
            body["thinking"] = serde_json::json!({
                "type": "enabled",
                "budget_tokens": request.thinking_budget.unwrap_or(10000)
            });
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers(request.enable_reasoning))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let error_text = response.text().await.unwrap_or_default();
            return Err(LlmError::ApiError {
                status,
                message: error_text,
            });
        }

        let response_body: AnthropicResponse = response.json().await?;

        // Extract content, thinking, and tool calls from content blocks
        let mut content = String::new();
        let mut thinking = String::new();
        let mut tool_calls = Vec::new();

        for block in &response_body.content {
            match block {
                AnthropicContentBlock::Text { text } => {
                    content.push_str(text);
                }
                AnthropicContentBlock::Thinking { thinking: think_text } => {
                    thinking.push_str(think_text);
                }
                AnthropicContentBlock::ToolUse { id, name, input } => {
                    tool_calls.push(ToolCall {
                        id: id.clone(),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: name.clone(),
                            arguments: serde_json::to_string(input).unwrap_or_default(),
                        },
                    });
                }
                _ => {}
            }
        }

        Ok(ChatResponse {
            content,
            thinking: if thinking.is_empty() {
                None
            } else {
                Some(thinking)
            },
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            finish_reason: response_body.stop_reason.unwrap_or_default(),
            usage: Some(TokenUsage {
                prompt_tokens: response_body.usage.input_tokens,
                completion_tokens: response_body.usage.output_tokens,
                total_tokens: response_body.usage.input_tokens + response_body.usage.output_tokens,
            }),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<mpsc::Receiver<StreamEvent>, LlmError> {
        let url = format!("{}/messages", ANTHROPIC_API_URL);
        let (system, messages) = self.convert_messages(&request.messages);

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "stream": true,
        });

        if let Some(system_prompt) = system {
            body["system"] = serde_json::json!(system_prompt);
        }

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
            }
        }

        if let Some(temperature) = request.temperature {
            body["temperature"] = serde_json::json!(temperature);
        }

        if request.enable_reasoning {
            body["thinking"] = serde_json::json!({
                "type": "enabled",
                "budget_tokens": request.thinking_budget.unwrap_or(10000)
            });
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers(request.enable_reasoning))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let error_text = response.text().await.unwrap_or_default();
            return Err(LlmError::ApiError {
                status,
                message: error_text,
            });
        }

        let (tx, rx) = mpsc::channel(100);

        let stream = response.bytes_stream();
        tokio::spawn(async move {
            let mut stream = stream;
            let mut buffer = String::new();
            let mut current_tool_id = String::new();
            let mut _current_tool_name = String::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.push_str(&String::from_utf8_lossy(&chunk));

                        while let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer = buffer[newline_pos + 1..].to_string();

                            if line.is_empty() || line.starts_with(':') {
                                continue;
                            }

                            if line.starts_with("data: ") {
                                let data = &line[6..];

                                if let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data)
                                {
                                    match event.r#type.as_str() {
                                        "content_block_start" => {
                                            if let Some(block) = event.content_block {
                                                match block {
                                                    AnthropicContentBlock::ToolUse {
                                                        id,
                                                        name,
                                                        ..
                                                    } => {
                                                        current_tool_id = id.clone();
                                                        _current_tool_name = name.clone();
                                                        let _ = tx
                                                            .send(StreamEvent::ToolCallStart {
                                                                id,
                                                                name,
                                                            })
                                                            .await;
                                                    }
                                                    _ => {}
                                                }
                                            }
                                        }
                                        "content_block_delta" => {
                                            if let Some(delta) = event.delta {
                                                match delta {
                                                    AnthropicDelta::TextDelta { text } => {
                                                        let _ = tx
                                                            .send(StreamEvent::Content {
                                                                delta: text,
                                                            })
                                                            .await;
                                                    }
                                                    AnthropicDelta::ThinkingDelta { thinking } => {
                                                        let _ = tx
                                                            .send(StreamEvent::Thinking {
                                                                delta: thinking,
                                                            })
                                                            .await;
                                                    }
                                                    AnthropicDelta::InputJsonDelta {
                                                        partial_json,
                                                    } => {
                                                        let _ = tx
                                                            .send(StreamEvent::ToolCallDelta {
                                                                id: current_tool_id.clone(),
                                                                arguments_delta: partial_json,
                                                            })
                                                            .await;
                                                    }
                                                    _ => {}
                                                }
                                            }
                                        }
                                        "message_delta" => {
                                            if let Some(delta) = event.delta {
                                                if let AnthropicDelta::MessageDelta {
                                                    stop_reason,
                                                } = delta
                                                {
                                                    if let Some(reason) = stop_reason {
                                                        let _ = tx
                                                            .send(StreamEvent::Done {
                                                                finish_reason: reason,
                                                            })
                                                            .await;
                                                    }
                                                }
                                            }
                                            if let Some(usage) = event.usage {
                                                let _ = tx
                                                    .send(StreamEvent::Usage {
                                                        prompt_tokens: usage.input_tokens,
                                                        completion_tokens: usage.output_tokens,
                                                    })
                                                    .await;
                                            }
                                        }
                                        "message_stop" => {
                                            // Stream ended
                                        }
                                        "error" => {
                                            if let Some(error) = event.error {
                                                let _ = tx
                                                    .send(StreamEvent::Error {
                                                        message: error.message,
                                                    })
                                                    .await;
                                                return;
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx
                            .send(StreamEvent::Error {
                                message: e.to_string(),
                            })
                            .await;
                        return;
                    }
                }
            }
        });

        Ok(rx)
    }

    async fn embed(&self, _request: EmbedRequest) -> Result<EmbedResponse, LlmError> {
        // Anthropic doesn't have an embeddings API
        Err(LlmError::Unsupported(
            "Anthropic does not support embeddings".to_string(),
        ))
    }

    async fn health_check(&self) -> Result<bool, LlmError> {
        // Try a minimal request to check if the API is reachable
        let url = format!("{}/messages", ANTHROPIC_API_URL);

        let body = serde_json::json!({
            "model": "claude-3-haiku-20240307",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
        });

        let response = self
            .client
            .post(&url)
            .headers(self.headers(false))
            .json(&body)
            .timeout(Duration::from_secs(10))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success() || resp.status().as_u16() == 400),
            Err(_) => Ok(false),
        }
    }
}

// ============================================================================
// Anthropic API Types
// ============================================================================

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
    },
}

#[derive(Debug, Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: Value,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
    stop_reason: Option<String>,
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    r#type: String,
    #[serde(default)]
    content_block: Option<AnthropicContentBlock>,
    #[serde(default)]
    delta: Option<AnthropicDelta>,
    #[serde(default)]
    usage: Option<AnthropicUsage>,
    #[serde(default)]
    error: Option<AnthropicError>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AnthropicDelta {
    TextDelta {
        text: String,
    },
    ThinkingDelta {
        thinking: String,
    },
    InputJsonDelta {
        partial_json: String,
    },
    MessageDelta {
        stop_reason: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    message: String,
}
