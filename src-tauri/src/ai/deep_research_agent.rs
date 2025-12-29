//! Deep Research Agent
//!
//! An advanced AI agent for conducting thorough, multi-phase research on complex topics.
//! Unlike the simple research agent, this agent:
//!
//! 1. **Plans** - Decomposes complex topics into specific sub-questions
//! 2. **Researches** - Iteratively gathers information with reflection on gaps
//! 3. **Synthesizes** - Compiles findings into structured output with citations
//!
//! Features:
//! - Query decomposition into sub-questions
//! - Iterative research with reflection loops
//! - Deep URL reading (full page content, not just snippets)
//! - Document parsing (PDFs, Excel, Word, PowerPoint)
//! - Structured output with citations
//! - Source tracking and citation management

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::agent::{
    run_agent_with_events, AgentError, CancellationToken, ToolDefinition, ToolExecutor,
};
use super::config::AIProvider;
use super::tools::{
    execute_append_to_note, execute_fetch_url, execute_read_document, execute_search_notes,
    execute_web_search, format_results_for_agent, get_append_to_note_tool, get_fetch_url_tool,
    get_read_document_tool, get_search_notes_tool, get_web_search_tool, AgentConfig,
};
use crate::db::connection::DbPool;

/// System prompt for the deep research agent - Phase 1 (Planning)
pub const PLANNING_SYSTEM_PROMPT: &str = r##"You are a research planning assistant. Your job is to analyze a research topic and break it down into specific, actionable sub-questions.

Given a research topic, output a JSON object with the following structure:
{
  "sub_questions": [
    "Specific question 1",
    "Specific question 2",
    ...
  ],
  "research_approach": "Brief description of how to approach this research"
}

Guidelines:
- Generate 3-7 focused sub-questions that together cover the topic comprehensively
- Each question should be specific and answerable
- Questions should progress logically (foundational → advanced)
- Consider different angles: definitions, mechanisms, examples, implications, comparisons
- Output ONLY the JSON object, no other text"##;

/// System prompt for the deep research agent - Phase 2 & 3 (Research & Synthesis)
pub const DEEP_RESEARCH_SYSTEM_PROMPT: &str = r##"You are a deep research agent for a note-taking app called Inkling.
Your job is to conduct thorough research on a topic and compile comprehensive findings with citations.

AVAILABLE TOOLS:
- append_to_note: Write research findings to the note in real-time. Call this multiple times to stream your output.
- search_notes: Search existing notes for relevant information and context
- web_search: Search the web for current information (if enabled)
- fetch_url: Read the full content of a web page (use after web_search to get complete articles)
- read_document: Extract text from PDF, Word, Excel, or PowerPoint documents

RESEARCH WORKFLOW:

You will be given:
1. The main research topic
2. A list of sub-questions to investigate
3. Any existing context

For each sub-question:
1. Search your notes first for existing knowledge
2. Search the web for current information
3. For promising web results, use fetch_url to read the complete content
4. If documents are referenced, use read_document to extract their content
5. REFLECT: What did I learn? What gaps remain? Do I need more specific searches?
6. If gaps exist, perform additional targeted searches

CITATION TRACKING:
- Assign each source a number like [1], [2], [3]
- Track sources as you use them:
  - Notes: [1] Note: "Note Title"
  - Web pages: [2] Web: "Page Title" - URL
  - Documents: [3] Document: filename.pdf
- Use inline citations when presenting information: "According to research [1], ..."

OUTPUT FORMAT:
Structure your research with these sections:

## Research: [Topic]

### Executive Summary
[2-3 paragraph high-level overview of key findings]

### Key Findings

#### [Sub-topic from first question]
[Detailed findings with inline citations [1], [2]]

#### [Sub-topic from second question]
[More findings with citations...]

[Continue for each sub-question...]

### Connections to Your Notes
- [[Related Note 1]] - [why it's relevant]
- [[Related Note 2]] - [connection explained]

### Sources
[1] Note: "Note Title"
[2] Web: "Article Title" - https://example.com/article
[3] Document: report.pdf

### Further Questions
- [Unanswered question or area needing more research]
- [Potential follow-up topic]

GUIDELINES:
- Be thorough but organized
- Always cite sources with [N] notation
- Use markdown formatting for clarity
- Reference existing notes with [[wiki-links]]
- Progress incrementally - append content as you research
- Call append_to_note with is_final=true ONLY for your absolute last piece of content
- Start your output with a level-2 heading: ## Research: [Topic]"##;

/// Progress events specific to deep research
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DeepResearchProgress {
    /// Planning phase - decomposing query
    Planning,
    /// Planning complete with sub-questions
    PlanningComplete {
        sub_questions: Vec<String>,
    },
    /// Researching a specific sub-question
    Researching {
        current_question: String,
        question_index: usize,
        total_questions: usize,
    },
    /// Reflecting on findings and gaps
    Reflecting {
        gaps_found: bool,
    },
    /// Synthesizing final output
    Synthesizing,
    /// Research completed
    Completed {
        sources_count: usize,
    },
}

/// Result of running the deep research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepResearchResult {
    /// The final response from the agent
    pub final_response: String,
    /// Tools that were used
    pub tools_used: Vec<String>,
    /// Number of iterations
    pub iterations: usize,
    /// Content chunks appended
    pub chunks_appended: usize,
    /// Number of notes searched
    pub notes_searched: usize,
    /// Number of web searches performed
    pub web_searches: usize,
    /// Number of URLs fetched
    pub urls_fetched: usize,
    /// Number of documents read
    pub documents_read: usize,
    /// Sub-questions that were researched
    pub sub_questions: Vec<String>,
}

/// Configuration for deep research behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepResearchConfig {
    /// Maximum research depth (iterations per sub-question)
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
    /// Maximum number of sub-questions to generate
    #[serde(default = "default_max_sub_questions")]
    pub max_sub_questions: usize,
    /// Whether to fetch full URL content
    #[serde(default = "default_true")]
    pub enable_web_deep_read: bool,
    /// Whether to enable document parsing
    #[serde(default = "default_true")]
    pub enable_documents: bool,
}

fn default_max_depth() -> usize {
    3
}

fn default_max_sub_questions() -> usize {
    7
}

fn default_true() -> bool {
    true
}

impl Default for DeepResearchConfig {
    fn default() -> Self {
        Self {
            max_depth: default_max_depth(),
            max_sub_questions: default_max_sub_questions(),
            enable_web_deep_read: true,
            enable_documents: true,
        }
    }
}

/// The deep research agent that implements ToolExecutor
pub struct DeepResearchAgent {
    app_handle: AppHandle,
    execution_id: String,
    pool: DbPool,
    provider: AIProvider,
    config: AgentConfig,
    deep_config: DeepResearchConfig,
    // Counters for tracking activity
    chunks_appended: Arc<AtomicUsize>,
    notes_searched: Arc<AtomicUsize>,
    web_searches: Arc<AtomicUsize>,
    urls_fetched: Arc<AtomicUsize>,
    documents_read: Arc<AtomicUsize>,
}

impl DeepResearchAgent {
    /// Create a new deep research agent
    pub fn new(
        app_handle: AppHandle,
        execution_id: String,
        pool: DbPool,
        provider: AIProvider,
        config: AgentConfig,
        deep_config: DeepResearchConfig,
    ) -> Self {
        Self {
            app_handle,
            execution_id,
            pool,
            provider,
            config,
            deep_config,
            chunks_appended: Arc::new(AtomicUsize::new(0)),
            notes_searched: Arc::new(AtomicUsize::new(0)),
            web_searches: Arc::new(AtomicUsize::new(0)),
            urls_fetched: Arc::new(AtomicUsize::new(0)),
            documents_read: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Get counters
    pub fn get_chunks_appended(&self) -> usize {
        self.chunks_appended.load(Ordering::SeqCst)
    }

    pub fn get_notes_searched(&self) -> usize {
        self.notes_searched.load(Ordering::SeqCst)
    }

    pub fn get_web_searches(&self) -> usize {
        self.web_searches.load(Ordering::SeqCst)
    }

    pub fn get_urls_fetched(&self) -> usize {
        self.urls_fetched.load(Ordering::SeqCst)
    }

    pub fn get_documents_read(&self) -> usize {
        self.documents_read.load(Ordering::SeqCst)
    }

    /// Perform web search using the configured provider
    async fn web_search(&self, args: Value) -> Result<String, String> {
        if !self.config.is_tool_enabled("web_search") {
            return Err("Web search is not enabled".to_string());
        }

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' argument")?;

        log::info!("[DeepResearchAgent] Executing web search: {}", query);

        let results = execute_web_search(&self.config.web_search, query).await?;

        self.web_searches.fetch_add(1, Ordering::SeqCst);

        log::info!(
            "[DeepResearchAgent] Web search returned {} results",
            results.len()
        );

        Ok(format_results_for_agent(&results))
    }

    /// Emit a deep research progress event
    fn emit_progress(&self, progress: DeepResearchProgress) {
        let event_name = format!("deep-research-progress-{}", self.execution_id);
        let _ = self.app_handle.emit(&event_name, &progress);
    }
}

#[async_trait]
impl ToolExecutor for DeepResearchAgent {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        log::info!(
            "[DeepResearchAgent] Executing tool: {} with args: {}",
            name,
            args
        );

        match name {
            "append_to_note" => {
                let result = execute_append_to_note(&self.app_handle, &self.execution_id, args);
                if result.is_ok() {
                    self.chunks_appended.fetch_add(1, Ordering::SeqCst);
                }
                result
            }
            "search_notes" => {
                let result = execute_search_notes(&self.pool, &self.provider, args).await;
                if result.is_ok() {
                    self.notes_searched.fetch_add(1, Ordering::SeqCst);
                }
                result
            }
            "web_search" => self.web_search(args).await,
            "fetch_url" => {
                if !self.deep_config.enable_web_deep_read {
                    return Err("Deep URL reading is not enabled".to_string());
                }
                let result = execute_fetch_url(args).await;
                if result.is_ok() {
                    self.urls_fetched.fetch_add(1, Ordering::SeqCst);
                }
                result
            }
            "read_document" => {
                if !self.deep_config.enable_documents {
                    return Err("Document reading is not enabled".to_string());
                }
                let result = execute_read_document(args);
                if result.is_ok() {
                    self.documents_read.fetch_add(1, Ordering::SeqCst);
                }
                result
            }
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }
}

/// Get the tool definitions for the deep research agent
pub fn get_deep_research_tools(config: &AgentConfig, deep_config: &DeepResearchConfig) -> Vec<ToolDefinition> {
    let mut tools = vec![
        get_append_to_note_tool(),
        get_search_notes_tool(),
    ];

    // Add web search if enabled
    if config.is_tool_enabled("web_search") {
        tools.push(get_web_search_tool());

        // Add fetch_url if deep reading is enabled
        if deep_config.enable_web_deep_read {
            tools.push(get_fetch_url_tool());
        }
    }

    // Add document reading if enabled
    if deep_config.enable_documents {
        tools.push(get_read_document_tool());
    }

    tools
}

/// Parse sub-questions from the planning phase response
fn parse_sub_questions(response: &str, max_questions: usize) -> Vec<String> {
    // Try to parse as JSON
    if let Ok(parsed) = serde_json::from_str::<Value>(response) {
        if let Some(questions) = parsed.get("sub_questions").and_then(|v| v.as_array()) {
            return questions
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .take(max_questions)
                .collect();
        }
    }

    // Try to extract JSON from the response (in case there's extra text)
    if let Some(start) = response.find('{') {
        if let Some(end) = response.rfind('}') {
            let json_str = &response[start..=end];
            if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                if let Some(questions) = parsed.get("sub_questions").and_then(|v| v.as_array()) {
                    return questions
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .take(max_questions)
                        .collect();
                }
            }
        }
    }

    // Fallback: treat the entire topic as a single question
    log::warn!("[DeepResearchAgent] Failed to parse sub-questions from planning response");
    vec![]
}

/// Run the deep research agent
///
/// This implements the three-phase research process:
/// 1. Planning - Decompose topic into sub-questions
/// 2. Research - Iteratively research each sub-question with reflection
/// 3. Synthesis - Compile findings into structured output
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `execution_id` - Unique ID for this execution
/// * `pool` - Database connection pool
/// * `provider` - AI provider configuration
/// * `model` - Model identifier
/// * `topic` - The research topic or question
/// * `context` - Optional additional context
/// * `vault_path` - Path to the vault
/// * `config` - Agent configuration
/// * `deep_config` - Deep research specific configuration
/// * `cancellation_token` - Optional cancellation token
#[allow(clippy::too_many_arguments)]
pub async fn run_deep_research_agent(
    app_handle: &AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    topic: &str,
    context: Option<&str>,
    _vault_path: &str,
    config: AgentConfig,
    deep_config: DeepResearchConfig,
    cancellation_token: Option<&CancellationToken>,
) -> Result<DeepResearchResult, AgentError> {
    log::info!(
        "[DeepResearchAgent] Starting deep research: execution_id={}, topic_len={}, has_context={}",
        execution_id,
        topic.len(),
        context.is_some()
    );

    // Create the agent for later use
    let agent = DeepResearchAgent::new(
        app_handle.clone(),
        execution_id.to_string(),
        pool.clone(),
        provider.clone(),
        config.clone(),
        deep_config.clone(),
    );

    // =========================================================================
    // Phase 1: Planning - Decompose topic into sub-questions
    // =========================================================================
    agent.emit_progress(DeepResearchProgress::Planning);
    log::info!("[DeepResearchAgent] Phase 1: Planning - decomposing topic");

    let planning_message = format!(
        "Research topic: {}\n\nDecompose this into specific sub-questions for thorough research.",
        topic
    );

    // Use a simple LLM call for planning (no tools needed)
    let planning_result = run_agent_with_events(
        app_handle,
        &format!("{}-planning", execution_id),
        "DeepResearch-Planning",
        provider,
        model,
        PLANNING_SYSTEM_PROMPT,
        &planning_message,
        vec![], // No tools for planning phase
        &agent,
        5, // Max 5 iterations for planning
        cancellation_token,
    )
    .await?;

    // Parse the sub-questions from the planning response
    let sub_questions = parse_sub_questions(
        &planning_result.final_response,
        deep_config.max_sub_questions,
    );

    let sub_questions = if sub_questions.is_empty() {
        // Fallback: use the original topic as a single question
        log::warn!("[DeepResearchAgent] No sub-questions parsed, using original topic");
        vec![topic.to_string()]
    } else {
        sub_questions
    };

    log::info!(
        "[DeepResearchAgent] Planning complete, {} sub-questions: {:?}",
        sub_questions.len(),
        sub_questions
    );

    agent.emit_progress(DeepResearchProgress::PlanningComplete {
        sub_questions: sub_questions.clone(),
    });

    // =========================================================================
    // Phase 2 & 3: Research and Synthesis
    // =========================================================================
    log::info!("[DeepResearchAgent] Phase 2 & 3: Research and Synthesis");

    let tools = get_deep_research_tools(&config, &deep_config);

    // Build the research message with sub-questions
    let sub_questions_list = sub_questions
        .iter()
        .enumerate()
        .map(|(i, q)| format!("{}. {}", i + 1, q))
        .collect::<Vec<_>>()
        .join("\n");

    let research_message = if let Some(ctx) = context {
        format!(
            "**Research Topic:** {}\n\n**Sub-questions to investigate:**\n{}\n\n**Additional Context:**\n{}\n\nConduct thorough research on each sub-question and compile your findings into a comprehensive report.",
            topic, sub_questions_list, ctx
        )
    } else {
        format!(
            "**Research Topic:** {}\n\n**Sub-questions to investigate:**\n{}\n\nConduct thorough research on each sub-question and compile your findings into a comprehensive report.",
            topic, sub_questions_list
        )
    };

    // Emit researching progress for first question
    if !sub_questions.is_empty() {
        agent.emit_progress(DeepResearchProgress::Researching {
            current_question: sub_questions[0].clone(),
            question_index: 0,
            total_questions: sub_questions.len(),
        });
    }

    agent.emit_progress(DeepResearchProgress::Synthesizing);

    let result = run_agent_with_events(
        app_handle,
        execution_id,
        "DeepResearch",
        provider,
        model,
        DEEP_RESEARCH_SYSTEM_PROMPT,
        &research_message,
        tools,
        &agent,
        150, // Higher iteration limit for deep research
        cancellation_token,
    )
    .await?;

    // Extract unique tool names used
    let tools_used: Vec<String> = result
        .tool_calls_made
        .iter()
        .map(|tc| tc.tool_name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let sources_count = agent.get_notes_searched()
        + agent.get_web_searches()
        + agent.get_urls_fetched()
        + agent.get_documents_read();

    agent.emit_progress(DeepResearchProgress::Completed { sources_count });

    log::info!(
        "[DeepResearchAgent] Research complete: {} iterations, {} chunks, {} notes, {} web searches, {} URLs, {} docs",
        result.iterations,
        agent.get_chunks_appended(),
        agent.get_notes_searched(),
        agent.get_web_searches(),
        agent.get_urls_fetched(),
        agent.get_documents_read()
    );

    Ok(DeepResearchResult {
        final_response: result.final_response,
        tools_used,
        iterations: result.iterations,
        chunks_appended: agent.get_chunks_appended(),
        notes_searched: agent.get_notes_searched(),
        web_searches: agent.get_web_searches(),
        urls_fetched: agent.get_urls_fetched(),
        documents_read: agent.get_documents_read(),
        sub_questions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sub_questions_valid_json() {
        let response = r#"{"sub_questions": ["What is X?", "How does Y work?", "Why is Z important?"], "research_approach": "Start with basics"}"#;
        let questions = parse_sub_questions(response, 10);
        assert_eq!(questions.len(), 3);
        assert_eq!(questions[0], "What is X?");
    }

    #[test]
    fn test_parse_sub_questions_with_extra_text() {
        let response = r#"Here's my analysis:
{"sub_questions": ["Question 1", "Question 2"], "research_approach": "Test"}
That's the plan."#;
        let questions = parse_sub_questions(response, 10);
        assert_eq!(questions.len(), 2);
    }

    #[test]
    fn test_parse_sub_questions_max_limit() {
        let response = r#"{"sub_questions": ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"]}"#;
        let questions = parse_sub_questions(response, 5);
        assert_eq!(questions.len(), 5);
    }

    #[test]
    fn test_parse_sub_questions_invalid() {
        let response = "This is not valid JSON";
        let questions = parse_sub_questions(response, 10);
        assert!(questions.is_empty());
    }

    #[test]
    fn test_get_deep_research_tools_default() {
        let config = AgentConfig::default();
        let deep_config = DeepResearchConfig::default();
        let tools = get_deep_research_tools(&config, &deep_config);

        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        
        // Should always have these
        assert!(tool_names.contains(&"append_to_note"));
        assert!(tool_names.contains(&"search_notes"));
        assert!(tool_names.contains(&"read_document"));
        
        // web_search not in default config tools
        assert!(!tool_names.contains(&"web_search"));
    }

    #[test]
    fn test_deep_research_config_default() {
        let config = DeepResearchConfig::default();
        assert_eq!(config.max_depth, 3);
        assert_eq!(config.max_sub_questions, 7);
        assert!(config.enable_web_deep_read);
        assert!(config.enable_documents);
    }

    #[test]
    fn test_deep_research_progress_serialization() {
        let progress = DeepResearchProgress::Researching {
            current_question: "What is X?".to_string(),
            question_index: 0,
            total_questions: 5,
        };
        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("researching"));
        assert!(json.contains("What is X?"));
    }
}

