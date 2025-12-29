//! Tauri commands for the Assistant panel
//!
//! Provides AI-generated content for the personalized assistant panel,
//! including day summaries and motivational quotes.
//!
//! Uses multiple focused plain-text LLM calls instead of a single JSON response
//! for better compatibility with smaller language models.

use chrono::{Datelike, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{
    load_ai_config,
    llm::{ChatMessage as LlmChatMessage, ChatRequest, LlmClient},
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
    let hour = Local::now().hour();
    
    match hour {
        5..=11 => "Good morning",
        12..=16 => "Good afternoon",
        17..=20 => "Good evening",
        _ => "Hello",
    }
}

/// Get time of day as a descriptive string
fn get_time_of_day_description() -> &'static str {
    let hour = Local::now().hour();

    match hour {
        5..=11 => "morning",
        12..=16 => "afternoon",
        17..=20 => "evening",
        _ => "night",
    }
}

/// Format a date string (YYYY-MM-DD) into a human-readable format
/// e.g., "Thursday, December 26, 2025"
fn format_human_readable_date(date_str: &str) -> String {
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        let weekday = date.weekday();
        let month = date.format("%B").to_string();
        let day = date.day();
        let year = date.year();
        format!("{}, {} {}, {}", weekday, month, day, year)
    } else {
        // Fallback to the original string if parsing fails
        date_str.to_string()
    }
}

/// Format events into a readable list
fn format_events_list(events: &[CalendarEventSummary]) -> String {
    if events.is_empty() {
        "No events scheduled for today.".to_string()
    } else {
        events
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
    }
}

/// Parse a quote response in the format: "quote text" - Author Name
/// Returns (quote, author) tuple
fn parse_quote_response(response: &str) -> (String, String) {
    let trimmed = response.trim();

    // Try to find pattern: "quote" - Author or "quote" — Author
    // First, look for the quote in quotes
    if let Some(start_quote) = trimmed.find('"') {
        if let Some(end_quote) = trimmed[start_quote + 1..].find('"') {
            let quote = trimmed[start_quote + 1..start_quote + 1 + end_quote].to_string();

            // Look for author after the closing quote
            let after_quote = &trimmed[start_quote + 1 + end_quote + 1..];
            // Try different separators: " - ", " — ", " – "
            let author = if let Some(idx) = after_quote.find(" - ") {
                after_quote[idx + 3..].trim().to_string()
            } else if let Some(idx) = after_quote.find(" — ") {
                after_quote[idx + 4..].trim().to_string()
            } else if let Some(idx) = after_quote.find(" – ") {
                after_quote[idx + 4..].trim().to_string()
            } else if let Some(idx) = after_quote.find("- ") {
                after_quote[idx + 2..].trim().to_string()
            } else {
                // No separator found, take whatever is after the quote
                after_quote.trim().trim_start_matches(['-', '—', '–']).trim().to_string()
            };

            if !quote.is_empty() && !author.is_empty() {
                return (quote, author);
            } else if !quote.is_empty() {
                return (quote, "Unknown".to_string());
            }
        }
    }

    // Fallback: try splitting on " - " without quotes
    if let Some(idx) = trimmed.rfind(" - ") {
        let quote = trimmed[..idx].trim().trim_matches('"').to_string();
        let author = trimmed[idx + 3..].trim().to_string();
        if !quote.is_empty() && !author.is_empty() {
            return (quote, author);
        }
    }

    // Last resort: return the whole thing as the quote
    (trimmed.trim_matches('"').to_string(), "Unknown".to_string())
}

// ============================================================================
// Individual Content Generation Functions
// ============================================================================

/// Generate a personalized greeting using the LLM
async fn generate_greeting_text(
    client: &dyn LlmClient,
    model: &str,
    date_str: &str,
) -> Result<String, String> {
    let human_date = format_human_readable_date(date_str);
    let time_of_day = get_time_of_day_description();
    let base_greeting = get_time_based_greeting();

    let system_prompt = r#"You are a warm, friendly personal assistant for a note-taking app called Inkling. Your personality is encouraging, supportive, and genuinely interested in helping the user have a great day. You speak naturally, like a helpful friend.

IMPORTANT: Respond with ONLY the greeting text. Do not include any JSON, markdown, or extra formatting. Just write the greeting as plain text."#;

    let user_prompt = format!(
        r#"Today is {human_date}. It is currently {time_of_day}.

Write a warm, personal greeting for the user that:
- Starts with "{base_greeting}" or a similar time-appropriate greeting
- Is friendly and encouraging (like a supportive friend)
- Is 1 sentence only
- Feels natural and conversational, not robotic

Examples of good greetings:
- "Good morning! I hope you're feeling energized and ready for a productive day ahead."
- "Good afternoon! Looks like you're making great progress on your day."
- "Good evening! Time to wind down and reflect on all you've accomplished today."

Write ONLY the greeting, nothing else:"#,
        human_date = human_date,
        time_of_day = time_of_day,
        base_greeting = base_greeting,
    );

    let messages = vec![
        LlmChatMessage::system(system_prompt),
        LlmChatMessage::user(&user_prompt),
    ];

    let request = ChatRequest {
        model: model.to_string(),
        messages,
        max_tokens: None, // Don't limit - reasoning models need space for thinking tokens
        temperature: Some(0.8),
        tools: None,
        tool_choice: None,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    let response = client
        .chat(request)
        .await
        .map_err(|e| format!("Greeting generation failed: {}", e))?;

    let raw_content = &response.content;
    let content = raw_content.trim().to_string();
    log::info!("[Assistant] Raw greeting response (len={}): {:?}", raw_content.len(), &raw_content[..raw_content.len().min(200)]);
    
    // If the model returned an empty response, return an error so we use fallback
    if content.is_empty() {
        return Err("Model returned empty greeting".to_string());
    }
    
    Ok(content)
}

/// Generate a day summary based on calendar events
async fn generate_day_summary_text(
    client: &dyn LlmClient,
    model: &str,
    date_str: &str,
    events: &[CalendarEventSummary],
) -> Result<String, String> {
    let human_date = format_human_readable_date(date_str);
    let events_text = format_events_list(events);
    let event_count = events.len();

    let system_prompt = r#"You are a helpful personal assistant for a note-taking app called Inkling. You help users understand their day at a glance by providing brief, useful summaries of their schedule. Be encouraging and supportive.

IMPORTANT: Respond with ONLY the summary text. Do not include any JSON, markdown, or extra formatting. Just write the summary as plain text."#;

    let user_prompt = if event_count == 0 {
        format!(
            r#"Today is {human_date}. The user has no events scheduled.

Write an encouraging 1-2 sentence summary about having a free day. Mention:
- The benefit of having open time (for deep work, creativity, or rest)
- An encouraging note about making the most of it

Examples of good summaries for a free day:
- "Your schedule is wide open today! A perfect opportunity for deep focus work or exploring new ideas."
- "No meetings on the calendar today—great news for getting into a creative flow state."

Write ONLY the summary, nothing else:"#,
            human_date = human_date,
        )
    } else {
        format!(
            r#"Today is {human_date}. The user has the following events scheduled:

{events_text}

Write a helpful 1-2 sentence summary of their day that:
- References the specific event names (don't just say "you have events")
- Highlights key moments or busy periods
- Provides helpful context (e.g., "busy morning" or "quiet afternoon")

Examples of good summaries:
- "You have Team Standup this morning followed by a Project Review after lunch—looks like a productive day of collaboration ahead!"
- "Your day starts with the Client Demo at 10am, then you're free to focus until the Weekly Sync at 4pm."

Write ONLY the summary, nothing else:"#,
            human_date = human_date,
            events_text = events_text,
        )
    };

    let messages = vec![
        LlmChatMessage::system(system_prompt),
        LlmChatMessage::user(&user_prompt),
    ];

    let request = ChatRequest {
        model: model.to_string(),
        messages,
        max_tokens: None, // Don't limit - reasoning models need space for thinking tokens
        temperature: Some(0.7),
        tools: None,
        tool_choice: None,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    let response = client
        .chat(request)
        .await
        .map_err(|e| format!("Day summary generation failed: {}", e))?;

    let raw_content = &response.content;
    let content = raw_content.trim().to_string();
    log::info!("[Assistant] Raw summary response (len={}): {:?}", raw_content.len(), &raw_content[..raw_content.len().min(200)]);
    
    // If the model returned an empty response, return an error so we use fallback
    if content.is_empty() {
        return Err("Model returned empty summary".to_string());
    }
    
    Ok(content)
}

/// Generate an inspiring quote with author
async fn generate_quote_text(
    client: &dyn LlmClient,
    model: &str,
    web_quote: Option<&str>,
) -> Result<(String, String), String> {
    let system_prompt = r#"You are a helpful assistant that provides inspiring, motivational quotes. You know many famous quotes from philosophers, authors, leaders, and thinkers throughout history.

IMPORTANT: Respond with ONLY the quote in this exact format:
"Quote text here" - Author Name

Do not include any other text, explanation, or formatting."#;

    let user_prompt = if let Some(quote) = web_quote {
        format!(
            r#"I found this quote that might be good: "{}"

If this is a complete, well-known quote, format it properly with the author. If it's incomplete or unclear, provide a different inspiring quote instead.

Respond in EXACTLY this format:
"Quote text" - Author Name"#,
            quote
        )
    } else {
        r#"Provide an inspiring, motivational quote that would help someone start their day with a positive mindset. Choose from well-known quotes by philosophers, authors, leaders, or other notable figures.

Respond in EXACTLY this format:
"Quote text" - Author Name

Examples:
"The only way to do great work is to love what you do." - Steve Jobs
"In the middle of difficulty lies opportunity." - Albert Einstein"#
            .to_string()
    };

    let messages = vec![
        LlmChatMessage::system(system_prompt),
        LlmChatMessage::user(&user_prompt),
    ];

    let request = ChatRequest {
        model: model.to_string(),
        messages,
        max_tokens: None, // Don't limit - reasoning models need space for thinking tokens
        temperature: Some(0.9),
        tools: None,
        tool_choice: None,
        enable_reasoning: false,
        reasoning_effort: None,
        thinking_budget: None,
    };

    let response = client
        .chat(request)
        .await
        .map_err(|e| format!("Quote generation failed: {}", e))?;

    let raw_content = &response.content;
    let content = raw_content.trim().to_string();
    log::info!("[Assistant] Raw quote response (len={}): {:?}", raw_content.len(), &raw_content[..raw_content.len().min(200)]);
    
    // If the model returned an empty response, return an error so we use fallback
    if content.is_empty() {
        return Err("Model returned empty quote".to_string());
    }
    
    let (quote, author) = parse_quote_response(&content);
    
    // If parsing resulted in an empty quote, return error
    if quote.is_empty() {
        return Err("Failed to parse quote from response".to_string());
    }
    
    Ok((quote, author))
}

// ============================================================================
// Commands
// ============================================================================

/// Generate personalized assistant content including day summary and quote
/// Uses multiple parallel plain-text LLM calls for better compatibility with smaller models
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
                log::info!(
                    "[Assistant] Got quote from web search: {}",
                    &quote[..quote.len().min(100)]
                );
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
    
    // Log the model and provider details for debugging
    log::info!(
        "[Assistant] Using provider: {} (type: {:?}), model: {}, base_url: {:?}",
        provider.name,
        provider.provider_type,
        model,
        provider.base_url
    );

    // Run all three content generation calls in parallel for better performance
    log::info!("[Assistant] Running parallel content generation...");

    let (greeting_result, summary_result, quote_result) = tokio::join!(
        generate_greeting_text(llm_client.as_ref(), &model, &input.date),
        generate_day_summary_text(llm_client.as_ref(), &model, &input.date, &input.events),
        generate_quote_text(llm_client.as_ref(), &model, web_quote.as_deref())
    );

    // Extract results with fallbacks
    let greeting = match greeting_result {
        Ok(g) => {
            log::info!("[Assistant] Greeting generated: {}", &g[..g.len().min(50)]);
            g
        }
        Err(e) => {
            log::warn!("[Assistant] Greeting generation failed, using fallback: {}", e);
            format!("{}! Ready to make today great?", get_time_based_greeting())
        }
    };

    let day_summary = match summary_result {
        Ok(s) => {
            log::info!("[Assistant] Summary generated: {}", &s[..s.len().min(80)]);
            s
        }
        Err(e) => {
            log::warn!("[Assistant] Summary generation failed, using fallback: {}", e);
            if input.events.is_empty() {
                "Your schedule is clear today! Perfect for focusing on what matters most.".to_string()
        } else {
                format!(
                    "You have {} event{} scheduled today.",
                    input.events.len(),
                    if input.events.len() == 1 { "" } else { "s" }
                )
            }
        }
    };

    let (quote, quote_author) = match quote_result {
        Ok((q, a)) => {
            log::info!("[Assistant] Quote generated: \"{}\" - {}", &q[..q.len().min(50)], a);
            (q, a)
        }
        Err(e) => {
            log::warn!("[Assistant] Quote generation failed, using fallback: {}", e);
            (
                "The only way to do great work is to love what you do.".to_string(),
                "Steve Jobs".to_string(),
            )
        }
    };

    log::info!("[Assistant] Content generation complete");
    
    Ok(AssistantContentResponse {
        greeting,
        day_summary,
        quote,
        quote_author,
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

