//! Google Gemini API client
//!
//! Implements the Google Generative AI API with:
//! - Gemini 2.5+ thinking mode support
//! - Native function calling
//! - Streaming responses

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::mpsc;

use super::{
    ChatMessage, ChatRequest, ChatResponse, EmbedInput, EmbedRequest, EmbedResponse, EmbedUsage,
    FunctionCall, LlmClient, LlmError, MessageRole, StreamEvent, TokenUsage, ToolCall,
    ToolDefinition,
};

const GEMINI_API_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Google Gemini API client
pub struct GoogleClient {
    api_key: String,
    client: Client,
}

impl GoogleClient {
    /// Create a new Google Gemini client
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self { api_key, client }
    }

    /// Convert our messages to Gemini format
    fn convert_messages(&self, messages: &[ChatMessage]) -> (Option<String>, Vec<GeminiContent>) {
        let mut system_instruction = None;
        let mut contents = Vec::new();

        for msg in messages {
            match msg.role {
                MessageRole::System => {
                    if let Some(ref content) = msg.content {
                        system_instruction = Some(content.clone());
                    }
                }
                MessageRole::User => {
                    if let Some(ref content) = msg.content {
                        contents.push(GeminiContent {
                            role: "user".to_string(),
                            parts: vec![GeminiPart::Text { text: content.clone() }],
                        });
                    }
                }
                MessageRole::Assistant => {
                    let mut parts = Vec::new();

                    if let Some(ref content) = msg.content {
                        parts.push(GeminiPart::Text { text: content.clone() });
                    }

                    if let Some(ref tool_calls) = msg.tool_calls {
                        for tc in tool_calls {
                            parts.push(GeminiPart::FunctionCall {
                                function_call: GeminiFunctionCall {
                                    name: tc.function.name.clone(),
                                    args: serde_json::from_str(&tc.function.arguments)
                                        .unwrap_or(Value::Object(serde_json::Map::new())),
                                },
                            });
                        }
                    }

                    if !parts.is_empty() {
                        contents.push(GeminiContent {
                            role: "model".to_string(),
                            parts,
                        });
                    }
                }
                MessageRole::Tool => {
                    if let (Some(ref tool_call_id), Some(ref content)) =
                        (&msg.tool_call_id, &msg.content)
                    {
                        // In Gemini, function responses are from "user" role
                        contents.push(GeminiContent {
                            role: "user".to_string(),
                            parts: vec![GeminiPart::FunctionResponse {
                                function_response: GeminiFunctionResponse {
                                    name: tool_call_id.clone(),
                                    response: serde_json::from_str(content)
                                        .unwrap_or(serde_json::json!({"result": content})),
                                },
                            }],
                        });
                    }
                }
            }
        }

        (system_instruction, contents)
    }

    /// Convert our tools to Gemini format
    fn convert_tools(&self, tools: &[ToolDefinition]) -> Vec<GeminiTool> {
        let function_declarations: Vec<GeminiFunctionDeclaration> = tools
            .iter()
            .map(|t| GeminiFunctionDeclaration {
                name: t.function.name.clone(),
                description: t.function.description.clone(),
                parameters: t.function.parameters.clone(),
            })
            .collect();

        vec![GeminiTool {
            function_declarations,
        }]
    }
}

#[async_trait]
impl LlmClient for GoogleClient {
    fn provider_name(&self) -> &'static str {
        "Google"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_URL, request.model, self.api_key
        );

        let (system_instruction, contents) = self.convert_messages(&request.messages);

        let mut body = serde_json::json!({
            "contents": contents,
        });

        if let Some(system) = system_instruction {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{"text": system}]
            });
        }

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
            }
        }

        let mut generation_config = serde_json::json!({});

        if let Some(max_tokens) = request.max_tokens {
            generation_config["maxOutputTokens"] = serde_json::json!(max_tokens);
        }

        if let Some(temperature) = request.temperature {
            generation_config["temperature"] = serde_json::json!(temperature);
        }

        // Thinking mode for Gemini 2.5+
        if request.enable_reasoning {
            body["thinkingConfig"] = serde_json::json!({
                "thinkingMode": "ENABLED"
            });
        }

        if generation_config != serde_json::json!({}) {
            body["generationConfig"] = generation_config;
        }

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
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

        let response_body: GeminiResponse = response.json().await?;

        let candidate = response_body
            .candidates
            .first()
            .ok_or_else(|| LlmError::InvalidResponse("No candidates in response".to_string()))?;

        let mut content = String::new();
        let mut thinking = String::new();
        let mut tool_calls = Vec::new();

        for part in &candidate.content.parts {
            match part {
                GeminiPart::Text { text } => {
                    content.push_str(text);
                }
                GeminiPart::Thought { thought, text } => {
                    if *thought {
                        if let Some(t) = text {
                            thinking.push_str(t);
                        }
                    } else if let Some(t) = text {
                        content.push_str(t);
                    }
                }
                GeminiPart::FunctionCall { function_call } => {
                    tool_calls.push(ToolCall {
                        id: format!("call_{}", tool_calls.len()),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: function_call.name.clone(),
                            arguments: serde_json::to_string(&function_call.args)
                                .unwrap_or_default(),
                        },
                    });
                }
                _ => {}
            }
        }

        let finish_reason = candidate
            .finish_reason
            .clone()
            .unwrap_or_else(|| "STOP".to_string());

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
            finish_reason,
            usage: response_body.usage_metadata.map(|u| TokenUsage {
                prompt_tokens: u.prompt_token_count,
                completion_tokens: u.candidates_token_count,
                total_tokens: u.total_token_count,
            }),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<mpsc::Receiver<StreamEvent>, LlmError> {
        let url = format!(
            "{}/models/{}:streamGenerateContent?key={}&alt=sse",
            GEMINI_API_URL, request.model, self.api_key
        );

        let (system_instruction, contents) = self.convert_messages(&request.messages);

        let mut body = serde_json::json!({
            "contents": contents,
        });

        if let Some(system) = system_instruction {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{"text": system}]
            });
        }

        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::to_value(self.convert_tools(tools)).unwrap();
            }
        }

        let mut generation_config = serde_json::json!({});

        if let Some(max_tokens) = request.max_tokens {
            generation_config["maxOutputTokens"] = serde_json::json!(max_tokens);
        }

        if let Some(temperature) = request.temperature {
            generation_config["temperature"] = serde_json::json!(temperature);
        }

        if request.enable_reasoning {
            body["thinkingConfig"] = serde_json::json!({
                "thinkingMode": "ENABLED"
            });
        }

        if generation_config != serde_json::json!({}) {
            body["generationConfig"] = generation_config;
        }

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
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
            let mut tool_call_count = 0;

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

                                if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                                    for candidate in &response.candidates {
                                        for part in &candidate.content.parts {
                                            match part {
                                                GeminiPart::Text { text } => {
                                                    let _ = tx
                                                        .send(StreamEvent::Content {
                                                            delta: text.clone(),
                                                        })
                                                        .await;
                                                }
                                                GeminiPart::Thought { thought, text } => {
                                                    if *thought {
                                                        if let Some(t) = text {
                                                            let _ = tx
                                                                .send(StreamEvent::Thinking {
                                                                    delta: t.clone(),
                                                                })
                                                                .await;
                                                        }
                                                    } else if let Some(t) = text {
                                                        let _ = tx
                                                            .send(StreamEvent::Content {
                                                                delta: t.clone(),
                                                            })
                                                            .await;
                                                    }
                                                }
                                                GeminiPart::FunctionCall { function_call } => {
                                                    let id = format!("call_{}", tool_call_count);
                                                    tool_call_count += 1;

                                                    let _ = tx
                                                        .send(StreamEvent::ToolCallStart {
                                                            id: id.clone(),
                                                            name: function_call.name.clone(),
                                                        })
                                                        .await;

                                                    let args = serde_json::to_string(
                                                        &function_call.args,
                                                    )
                                                    .unwrap_or_default();

                                                    let _ = tx
                                                        .send(StreamEvent::ToolCallDelta {
                                                            id,
                                                            arguments_delta: args,
                                                        })
                                                        .await;
                                                }
                                                _ => {}
                                            }
                                        }

                                        if let Some(ref finish_reason) = candidate.finish_reason {
                                            let _ = tx
                                                .send(StreamEvent::Done {
                                                    finish_reason: finish_reason.clone(),
                                                })
                                                .await;
                                        }
                                    }

                                    if let Some(ref usage) = response.usage_metadata {
                                        let _ = tx
                                            .send(StreamEvent::Usage {
                                                prompt_tokens: usage.prompt_token_count,
                                                completion_tokens: usage.candidates_token_count,
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
        let url = format!(
            "{}/models/{}:embedContent?key={}",
            GEMINI_API_URL, request.model, self.api_key
        );

        let texts = match &request.input {
            EmbedInput::Single(text) => vec![text.clone()],
            EmbedInput::Batch(texts) => texts.clone(),
        };

        // Google's embedContent only supports single text, need to batch
        let mut all_embeddings = Vec::new();
        let mut total_tokens = 0u32;

        for text in &texts {
            let body = serde_json::json!({
                "content": {
                    "parts": [{"text": text}]
                }
            });

            let response = self
                .client
                .post(&url)
                .header("Content-Type", "application/json")
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

            let response_body: GeminiEmbedResponse = response.json().await?;
            all_embeddings.push(response_body.embedding.values);
            // Approximate token count
            total_tokens += (text.len() / 4) as u32;
        }

        Ok(EmbedResponse {
            embeddings: all_embeddings,
            model: request.model,
            usage: Some(EmbedUsage {
                prompt_tokens: total_tokens,
                total_tokens,
            }),
        })
    }

    async fn health_check(&self) -> Result<bool, LlmError> {
        let url = format!("{}/models?key={}", GEMINI_API_URL, self.api_key);

        let response = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}

// ============================================================================
// Gemini API Types
// ============================================================================

#[derive(Debug, Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    Text {
        text: String,
    },
    Thought {
        thought: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        text: Option<String>,
    },
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: GeminiFunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: GeminiFunctionResponse,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiFunctionResponse {
    name: String,
    response: Value,
}

#[derive(Debug, Serialize)]
struct GeminiTool {
    #[serde(rename = "functionDeclarations")]
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize)]
struct GeminiFunctionDeclaration {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiResponseContent,
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Deserialize)]
struct GeminiUsage {
    #[serde(rename = "promptTokenCount", default)]
    prompt_token_count: u32,
    #[serde(rename = "candidatesTokenCount", default)]
    candidates_token_count: u32,
    #[serde(rename = "totalTokenCount", default)]
    total_token_count: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiEmbedResponse {
    embedding: GeminiEmbedding,
}

#[derive(Debug, Deserialize)]
struct GeminiEmbedding {
    values: Vec<f32>,
}
