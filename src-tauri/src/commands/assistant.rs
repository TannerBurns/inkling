//! Tauri commands for the Assistant panel
//!
//! Provides AI-generated content for the personalized assistant panel,
//! including day summaries and motivational quotes.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{
    load_ai_config,
    llm::{ChatMessage as LlmChatMessage, ChatRequest},
    tools::{execute_web_search, AgentConfig, WebSearchConfig},
};
use crate::db;
use crate::AppPool;

// ============================================================================
// Types
// ============================================================================

/// Input for generating assistant content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantContentInput {
    /// Today's date in YYYY-MM-DD format
    pub date: String,
    /// Calendar events for today (JSON array of event summaries)
    pub events: Vec<CalendarEventSummary>,
}

/// Summary of a calendar event for the assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventSummary {
    pub title: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub event_type: Option<String>,
    pub meeting_link: Option<String>,
}

/// Response from the assistant content generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantContentResponse {
    /// Personalized greeting for the user
    pub greeting: String,
    /// Summary of the day's schedule
    pub day_summary: String,
    /// Motivational quote with author
    pub quote: String,
    /// Author of the quote
    pub quote_author: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get model and provider for assistant (reuses chat config)
fn get_model_and_provider(
    config: &crate::ai::AIConfig,
) -> Result<(String, crate::ai::AIProvider), String> {
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = config.default_provider {
        config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider
        .ok_or_else(|| {
            "No AI provider configured. Please set up a provider in Settings.".to_string()
        })?
        .clone();

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    Ok((model, provider))
}

/// Get agent config from database
fn get_agent_config(pool: &crate::db::connection::DbPool) -> AgentConfig {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return AgentConfig::default(),
    };
    
    match db::settings::get_setting(&conn, "agent_config") {
        Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
        _ => AgentConfig::default(),
    }
}

/// Build a greeting based on time of day
fn get_time_based_greeting() -> &'static str {
    use chrono::Local;
    let hour = Local::now().hour();
    
    match hour {
        5..=11 => "Good morning",
        12..=16 => "Good afternoon",
        17..=20 => "Good evening",
        _ => "Hello",
    }
}

use chrono::Timelike;

// ============================================================================
// Commands
// ============================================================================

/// Generate personalized assistant content including day summary and quote
#[tauri::command]
pub async fn generate_assistant_content(
    pool: State<'_, AppPool>,
    input: AssistantContentInput,
) -> Result<AssistantContentResponse, String> {
    log::info!("[Assistant] Generating content for date: {}", input.date);
    
    // Get database pool
    let db_pool = {
        let pool_guard = pool.0.read().unwrap();
        pool_guard.clone().ok_or("Database not initialized")?
    };
    
    // Get AI config
    let (model, provider) = {
        let conn = db_pool.get().map_err(|e| e.to_string())?;
        let ai_config = load_ai_config(&conn)?;
        get_model_and_provider(&ai_config)?
    };
    
    // Get agent config for web search
    let agent_config = get_agent_config(&db_pool);
    
    // Debug log the web search config
    log::info!(
        "[Assistant] Web search config - provider: {:?}, has_key: {}",
        agent_config.web_search.provider,
        agent_config.web_search.api_key.is_some()
    );
    
    // Try to get a quote via web search if configured
    let web_quote = if agent_config.web_search.is_configured() {
        log::info!("[Assistant] Web search is configured, fetching quote...");
        match fetch_daily_quote(&agent_config.web_search).await {
            Ok(quote) => {
                log::info!("[Assistant] Got quote from web search: {}", &quote[..quote.len().min(100)]);
                Some(quote)
            }
            Err(e) => {
                log::warn!("[Assistant] Web search for quote failed: {}", e);
                None
            }
        }
    } else {
        log::info!("[Assistant] Web search not configured, AI will generate quote");
        None
    };
    
    // Create LLM client
    let llm_client = crate::ai::llm::create_client(&provider)
        .map_err(|e| format!("Failed to create LLM client: {}", e))?;
    
    // Build the context for the AI
    let events_text = if input.events.is_empty() {
        "No events scheduled for today.".to_string()
    } else {
        input.events
            .iter()
            .map(|e| {
                if e.all_day {
                    format!("- {} (All day)", e.title)
                } else if let Some(end) = &e.end_time {
                    format!("- {} ({} - {})", e.title, e.start_time, end)
                } else {
                    format!("- {} ({})", e.title, e.start_time)
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    
    // Prepare the prompt
    let greeting = get_time_based_greeting();
    let system_prompt = r#"You are a helpful personal assistant for a note-taking app called Inkling. 
Generate a brief, warm, and encouraging response. Be concise but personable.
Respond in valid JSON format only, with no additional text."#;

    let user_prompt = format!(
        r#"Today is {date}. The user has the following events today:

{events}

{quote_context}

Generate a JSON response with these fields:
- "greeting": A personalized greeting (1 sentence, include time of day: "{greeting}")
- "day_summary": A brief summary of their day based on the events (1-2 sentences). If no events, say something encouraging about having a free day.
- "quote": An inspiring quote for the day
- "quote_author": The author of the quote

Respond with ONLY valid JSON, no markdown code blocks."#,
        date = input.date,
        events = events_text,
        greeting = greeting,
        quote_context = if let Some(ref q) = web_quote {
            format!("I found this inspiring quote you could use: \"{q}\"")
        } else {
            "Pick a motivational quote that fits the day.".to_string()
        }
    );
    
    let messages = vec![
        LlmChatMessage::system(system_prompt),
        LlmChatMessage::user(&user_prompt),
    ];
    
    let request = ChatRequest {
        model: model.clone(),
        messages,
        max_tokens: Some(500),
        temperature: Some(0.7),
        tools: None,
        tool_choice: None,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };
    
    // Make the request
    let response = llm_client
        .chat(request)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;
    
    // Parse the JSON response
    let content = response.content.trim();
    
    // Try to extract JSON from the response (handle markdown code blocks)
    let json_str = if content.starts_with("```") {
        // Extract JSON from markdown code block
        content
            .lines()
            .skip(1)
            .take_while(|line| !line.starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        content.to_string()
    };
    
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse AI response as JSON: {}. Response was: {}", e, content))?;
    
    Ok(AssistantContentResponse {
        greeting: parsed["greeting"]
            .as_str()
            .unwrap_or(&format!("{}, ready to make today great?", greeting))
            .to_string(),
        day_summary: parsed["day_summary"]
            .as_str()
            .unwrap_or("Your schedule is clear today!")
            .to_string(),
        quote: parsed["quote"]
            .as_str()
            .unwrap_or("The only way to do great work is to love what you do.")
            .to_string(),
        quote_author: parsed["quote_author"]
            .as_str()
            .unwrap_or("Steve Jobs")
            .to_string(),
    })
}

/// Fetch a daily quote using web search
async fn fetch_daily_quote(config: &WebSearchConfig) -> Result<String, String> {
    let query = "inspirational quote of the day motivation";
    let results = execute_web_search(config, query).await?;
    
    // Extract a quote from the search results
    if let Some(first_result) = results.first() {
        // The snippet might contain a quote
        let snippet = &first_result.snippet;
        // Try to extract text between quotes if present
        if let Some(start) = snippet.find('"') {
            if let Some(end) = snippet[start + 1..].find('"') {
                return Ok(snippet[start + 1..start + 1 + end].to_string());
            }
        }
        // Otherwise return the whole snippet
        Ok(snippet.clone())
    } else {
        Err("No search results".to_string())
    }
}

/// Get a fallback response without AI (for when AI is not configured)
#[tauri::command]
pub async fn get_assistant_fallback(
    input: AssistantContentInput,
) -> Result<AssistantContentResponse, String> {
    let greeting = get_time_based_greeting();
    
    let day_summary = if input.events.is_empty() {
        "You have a clear schedule today. Perfect for focusing on what matters most!".to_string()
    } else {
        format!(
            "You have {} event{} scheduled today.",
            input.events.len(),
            if input.events.len() == 1 { "" } else { "s" }
        )
    };
    
    // Curated fallback quotes
    let quotes = [
        ("The only way to do great work is to love what you do.", "Steve Jobs"),
        ("In the middle of difficulty lies opportunity.", "Albert Einstein"),
        ("What you get by achieving your goals is not as important as what you become.", "Zig Ziglar"),
        ("The future belongs to those who believe in the beauty of their dreams.", "Eleanor Roosevelt"),
        ("Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"),
        ("The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"),
        ("Your time is limited, don't waste it living someone else's life.", "Steve Jobs"),
        ("Believe you can and you're halfway there.", "Theodore Roosevelt"),
    ];
    
    // Pick a quote based on the date (deterministic so it's the same for the day)
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    input.date.hash(&mut hasher);
    let hash = hasher.finish() as usize;
    let (quote, author) = quotes[hash % quotes.len()];
    
    Ok(AssistantContentResponse {
        greeting: format!("{}! Ready to make today count?", greeting),
        day_summary,
        quote: quote.to_string(),
        quote_author: author.to_string(),
    })
}

