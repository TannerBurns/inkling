//! OpenAI-compatible LLM client
//!
//! This client works with:
//! - OpenAI API
//! - Ollama (with /v1 compatibility)
//! - LM Studio
//! - VLLM
//! - Any OpenAI-compatible endpoint

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::mpsc;

use super::{
    ChatMessage, ChatRequest, ChatResponse, EmbedInput, EmbedRequest, EmbedResponse, EmbedUsage,
    FunctionCall, LlmClient, LlmError, StreamEvent, TokenUsage, ToolCall, ToolDefinition,
};

/// OpenAI-compatible LLM client
pub struct OpenAIClient {
    base_url: String,
    api_key: Option<String>,
    client: Client,
}

impl OpenAIClient {
    /// Create a new OpenAI-compatible client
    pub fn new(base_url: &str, api_key: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300)) // 5 minute timeout for long generations
            .build()
            .expect("Failed to create HTTP client");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            client,
        }
    }

    /// Build request headers
    fn headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        if let Some(ref key) = self.api_key {
            headers.insert(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", key).parse().unwrap(),
            );
        }
        headers
    }

    /// Convert our ChatMessage to OpenAI API format
    fn convert_messages(&self, messages: &[ChatMessage]) -> Vec<OpenAIMessage> {
        messages
            .iter()
            .map(|m| OpenAIMessage {
                role: m.role.as_str().to_string(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.as_ref().map(|calls| {
                    calls
                        .iter()
                        .map(|c| OpenAIToolCall {
                            id: c.id.clone(),
                            r#type: c.call_type.clone(),
                            function: OpenAIFunctionCall {
                                name: c.function.name.clone(),
                                arguments: c.function.arguments.clone(),
                            },
                        })
                        .collect()
                }),
                tool_call_id: m.tool_call_id.clone(),
            })
            .collect()
    }

    /// Convert our ToolDefinition to OpenAI API format
    fn convert_tools(&self, tools: &[ToolDefinition]) -> Vec<OpenAITool> {
        tools
            .iter()
            .map(|t| OpenAITool {
                r#type: t.tool_type.clone(),
                function: OpenAIFunction {
                    name: t.function.name.clone(),
                    description: t.function.description.clone(),
                    parameters: t.function.parameters.clone(),
                },
            })
            .collect()
    }
}

#[async_trait]
impl LlmClient for OpenAIClient {
    fn provider_name(&self) -> &'static str {
        "OpenAI"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = format!("{}/chat/completions", self.base_url);

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": self.convert_messages(&request.messages),
            "stream": false,
        });

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
                body["tool_choice"] = serde_json::json!(request.tool_choice.as_deref().unwrap_or("auto"));
            }
        }

        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        if let Some(temperature) = request.temperature {
            body["temperature"] = serde_json::json!(temperature);
        }

        // OpenAI reasoning models use reasoning_effort
        if request.enable_reasoning {
            if let Some(ref effort) = request.reasoning_effort {
                body["reasoning_effort"] = serde_json::json!(effort);
            }
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
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

        let response_body: OpenAIChatResponse = response.json().await?;

        let choice = response_body
            .choices
            .first()
            .ok_or_else(|| LlmError::InvalidResponse("No choices in response".to_string()))?;

        let tool_calls = choice.message.tool_calls.as_ref().map(|calls| {
            calls
                .iter()
                .map(|c| ToolCall {
                    id: c.id.clone(),
                    call_type: c.r#type.clone(),
                    function: FunctionCall {
                        name: c.function.name.clone(),
                        arguments: c.function.arguments.clone(),
                    },
                })
                .collect()
        });

        Ok(ChatResponse {
            content: choice.message.content.clone().unwrap_or_default(),
            thinking: choice.message.reasoning_content.clone(),
            tool_calls,
            finish_reason: choice.finish_reason.clone().unwrap_or_default(),
            usage: response_body.usage.map(|u| TokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<mpsc::Receiver<StreamEvent>, LlmError> {
        let url = format!("{}/chat/completions", self.base_url);

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": self.convert_messages(&request.messages),
            "stream": true,
        });

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
                body["tool_choice"] = serde_json::json!(request.tool_choice.as_deref().unwrap_or("auto"));
            }
        }

        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        if let Some(temperature) = request.temperature {
            body["temperature"] = serde_json::json!(temperature);
        }

        if request.enable_reasoning {
            if let Some(ref effort) = request.reasoning_effort {
                body["reasoning_effort"] = serde_json::json!(effort);
            }
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
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

        // Spawn a task to process the stream
        let stream = response.bytes_stream();
        tokio::spawn(async move {
            let mut stream = stream;
            let mut buffer = String::new();
            // Track tool calls being built
            let mut tool_calls_in_progress: std::collections::HashMap<String, (String, String)> =
                std::collections::HashMap::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.push_str(&String::from_utf8_lossy(&chunk));

                        // Process complete lines
                        while let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer = buffer[newline_pos + 1..].to_string();

                            if line.is_empty() || line.starts_with(':') {
                                continue;
                            }

                            if line.starts_with("data: ") {
                                let data = &line[6..];
                                if data == "[DONE]" {
                                    let _ = tx
                                        .send(StreamEvent::Done {
                                            finish_reason: "stop".to_string(),
                                        })
                                        .await;
                                    return;
                                }

                                if let Ok(chunk) = serde_json::from_str::<OpenAIStreamChunk>(data) {
                                    for choice in chunk.choices {
                                        // Handle reasoning/thinking content
                                        if let Some(ref thinking) = choice.delta.reasoning_content {
                                            let _ = tx
                                                .send(StreamEvent::Thinking {
                                                    delta: thinking.clone(),
                                                })
                                                .await;
                                        }

                                        // Handle regular content
                                        if let Some(ref content) = choice.delta.content {
                                            let _ = tx
                                                .send(StreamEvent::Content {
                                                    delta: content.clone(),
                                                })
                                                .await;
                                        }

                                        // Handle tool calls
                                        if let Some(ref tool_calls) = choice.delta.tool_calls {
                                            for tc in tool_calls {
                                                let id = tc.id.clone().unwrap_or_else(|| {
                                                    // Use index as fallback ID
                                                    format!("call_{}", tc.index.unwrap_or(0))
                                                });

                                                if let Some(ref func) = tc.function {
                                                    if let Some(ref name) = func.name {
                                                        // New tool call
                                                        tool_calls_in_progress.insert(
                                                            id.clone(),
                                                            (name.clone(), String::new()),
                                                        );
                                                        let _ = tx
                                                            .send(StreamEvent::ToolCallStart {
                                                                id: id.clone(),
                                                                name: name.clone(),
                                                            })
                                                            .await;
                                                    }

                                                    if let Some(ref args) = func.arguments {
                                                        // Append arguments
                                                        if let Some((_name, ref mut existing_args)) =
                                                            tool_calls_in_progress.get_mut(&id)
                                                        {
                                                            existing_args.push_str(args);
                                                        }
                                                        let _ = tx
                                                            .send(StreamEvent::ToolCallDelta {
                                                                id: id.clone(),
                                                                arguments_delta: args.clone(),
                                                            })
                                                            .await;
                                                    }
                                                }
                                            }
                                        }

                                        // Handle finish reason
                                        if let Some(ref finish_reason) = choice.finish_reason {
                                            let _ = tx
                                                .send(StreamEvent::Done {
                                                    finish_reason: finish_reason.clone(),
                                                })
                                                .await;
                                        }
                                    }

                                    // Handle usage
                                    if let Some(ref usage) = chunk.usage {
                                        let _ = tx
                                            .send(StreamEvent::Usage {
                                                prompt_tokens: usage.prompt_tokens,
                                                completion_tokens: usage.completion_tokens,
                                            })
                                            .await;
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

    async fn embed(&self, request: EmbedRequest) -> Result<EmbedResponse, LlmError> {
        let url = format!("{}/embeddings", self.base_url);

        let input = match &request.input {
            EmbedInput::Single(text) => serde_json::json!(text),
            EmbedInput::Batch(texts) => serde_json::json!(texts),
        };

        let mut body = serde_json::json!({
            "model": request.model,
            "input": input,
        });

        if let Some(ref format) = request.encoding_format {
            body["encoding_format"] = serde_json::json!(format);
        }

        if let Some(dimensions) = request.dimensions {
            body["dimensions"] = serde_json::json!(dimensions);
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
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

        let response_body: OpenAIEmbeddingResponse = response.json().await?;

        let embeddings = response_body
            .data
            .into_iter()
            .map(|d| d.embedding)
            .collect();

        Ok(EmbedResponse {
            embeddings,
            model: response_body.model,
            usage: response_body.usage.map(|u| EmbedUsage {
                prompt_tokens: u.prompt_tokens,
                total_tokens: u.total_tokens,
            }),
        })
    }

    async fn health_check(&self) -> Result<bool, LlmError> {
        // Try to list models as a health check
        let url = format!("{}/models", self.base_url);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}

// ============================================================================
// OpenAI API Types
// ============================================================================

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIToolCall {
    id: String,
    r#type: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize)]
struct OpenAITool {
    r#type: String,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize)]
struct OpenAIFunction {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatResponse {
    choices: Vec<OpenAIChatChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatChoice {
    message: OpenAIChatMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatMessage {
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIStreamChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamChoice {
    delta: OpenAIStreamDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamDelta {
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<OpenAIStreamToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamToolCall {
    index: Option<u32>,
    id: Option<String>,
    function: Option<OpenAIStreamFunctionCall>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamFunctionCall {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIEmbeddingResponse {
    data: Vec<OpenAIEmbeddingData>,
    model: String,
    usage: Option<OpenAIEmbeddingUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIEmbeddingData {
    embedding: Vec<f32>,
    index: usize,
}

#[derive(Debug, Deserialize)]
struct OpenAIEmbeddingUsage {
    prompt_tokens: u32,
    total_tokens: u32,
}
