//! Tagging Agent implementation
//!
//! An AI agent that automatically analyzes notes and assigns appropriate tags.
//! Uses the agent infrastructure for multi-turn tool calling.

use async_trait::async_trait;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::{self, DbPool};
use crate::models::Tag;

use super::agent::{run_agent, AgentError, ToolDefinition, ToolExecutor};
use super::config::AIProvider;

/// System prompt for the tagging agent
pub const TAGGING_AGENT_SYSTEM_PROMPT: &str = r#"You are a tagging agent for a note-taking app. Your job is to analyze the given note and assign appropriate tags.

WORKFLOW:
1. First, get all existing tags to see what's available
2. Check what tags are already on this note
3. Assign relevant existing tags OR create new ones if needed
4. Only create a new tag if no existing tag fits the concept

GUIDELINES:
- Assign 1-5 relevant tags per note
- Prefer existing tags over creating new ones
- Tag names should be lowercase with hyphens (e.g., "machine-learning", "meeting-notes")
- Choose colors semantically:
  - red: urgent, important, warnings
  - orange: work, projects, tasks
  - yellow: ideas, highlights, starred
  - green: personal, health, nature
  - blue: technology, learning, reference
  - purple: creative, art, design
  - pink: relationships, social, events
  - gray: archive, misc, meta

When you're done tagging, respond with a brief summary of what you did."#;

/// Result of running the tagging agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaggingResult {
    /// Tags assigned to the note
    pub tags: Vec<Tag>,
    /// Summary from the agent
    pub summary: String,
    /// Number of iterations the agent took
    pub iterations: usize,
    /// Tool calls made by the agent
    pub tool_calls: Vec<super::agent::ToolCallRecord>,
}

/// The tagging agent that implements ToolExecutor
pub struct TaggingAgent {
    note_id: String,
    pool: DbPool,
}

impl TaggingAgent {
    /// Create a new tagging agent for a specific note
    pub fn new(note_id: String, pool: DbPool) -> Self {
        Self { note_id, pool }
    }

    /// Get all available tags
    fn get_all_tags(&self) -> Result<String, String> {
        debug!("[TaggingAgent] get_all_tags called for note_id={}", self.note_id);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let tags = db::get_all_tags(&conn).map_err(|e| {
            warn!("[TaggingAgent] Failed to get all tags: {}", e);
            e.to_string()
        })?;
        info!("[TaggingAgent] get_all_tags returned {} tags", tags.len());
        serde_json::to_string(&tags).map_err(|e| e.to_string())
    }

    /// Search tags by query
    fn search_tags(&self, args: Value) -> Result<String, String> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'query' argument")?;
        
        debug!("[TaggingAgent] search_tags called with query='{}' for note_id={}", query, self.note_id);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let tags = db::search_tags(&conn, query).map_err(|e| {
            warn!("[TaggingAgent] Failed to search tags: {}", e);
            e.to_string()
        })?;
        info!("[TaggingAgent] search_tags('{}') returned {} tags", query, tags.len());
        serde_json::to_string(&tags).map_err(|e| e.to_string())
    }

    /// Get tags currently on this note
    fn get_note_tags(&self) -> Result<String, String> {
        debug!("[TaggingAgent] get_note_tags called for note_id={}", self.note_id);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let tags = db::get_note_tags(&conn, &self.note_id).map_err(|e| {
            warn!("[TaggingAgent] Failed to get note tags: {}", e);
            e.to_string()
        })?;
        info!("[TaggingAgent] get_note_tags returned {} tags for note_id={}", tags.len(), self.note_id);
        serde_json::to_string(&tags).map_err(|e| e.to_string())
    }

    /// Create a new tag
    fn create_tag(&self, args: Value) -> Result<String, String> {
        let name = args
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'name' argument")?;

        let color = args.get("color").and_then(|v| v.as_str());
        
        info!("[TaggingAgent] create_tag called: name='{}', color={:?}", name, color);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let tag = db::create_tag(&conn, name, color).map_err(|e| {
            warn!("[TaggingAgent] Failed to create tag '{}': {}", name, e);
            e.to_string()
        })?;
        info!("[TaggingAgent] Successfully created tag: id={}, name='{}'", tag.id, tag.name);
        serde_json::to_string(&tag).map_err(|e| e.to_string())
    }

    /// Assign a tag to this note
    fn assign_tag(&self, args: Value) -> Result<String, String> {
        let tag_id = args
            .get("tag_id")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'tag_id' argument")?;

        info!("[TaggingAgent] assign_tag called: tag_id='{}' -> note_id='{}'", tag_id, self.note_id);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        db::add_tag_to_note(&conn, &self.note_id, tag_id).map_err(|e| {
            warn!("[TaggingAgent] Failed to assign tag '{}' to note '{}': {}", tag_id, self.note_id, e);
            e.to_string()
        })?;
        info!("[TaggingAgent] Successfully assigned tag '{}' to note '{}'", tag_id, self.note_id);
        Ok(json!({"success": true, "message": "Tag assigned successfully"}).to_string())
    }

    /// Remove a tag from this note
    fn remove_tag(&self, args: Value) -> Result<String, String> {
        let tag_id = args
            .get("tag_id")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'tag_id' argument")?;

        info!("[TaggingAgent] remove_tag called: tag_id='{}' from note_id='{}'", tag_id, self.note_id);
        let conn = self.pool.get().map_err(|e| {
            warn!("[TaggingAgent] Failed to get DB connection: {}", e);
            e.to_string()
        })?;
        let removed =
            db::remove_tag_from_note(&conn, &self.note_id, tag_id).map_err(|e| {
                warn!("[TaggingAgent] Failed to remove tag '{}' from note '{}': {}", tag_id, self.note_id, e);
                e.to_string()
            })?;
        info!("[TaggingAgent] remove_tag result: removed={}", removed);
        Ok(json!({"success": removed, "message": if removed { "Tag removed" } else { "Tag was not on note" }}).to_string())
    }
}

#[async_trait]
impl ToolExecutor for TaggingAgent {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        info!("[TaggingAgent] Executing tool '{}' with args: {}", name, args);
        let result = match name {
            "get_all_tags" => self.get_all_tags(),
            "search_tags" => self.search_tags(args),
            "get_note_tags" => self.get_note_tags(),
            "create_tag" => self.create_tag(args),
            "assign_tag" => self.assign_tag(args),
            "remove_tag" => self.remove_tag(args),
            _ => {
                warn!("[TaggingAgent] Unknown tool requested: {}", name);
                Err(format!("Unknown tool: {}", name))
            }
        };
        match &result {
            Ok(res) => debug!("[TaggingAgent] Tool '{}' succeeded with result: {}", name, res),
            Err(err) => warn!("[TaggingAgent] Tool '{}' failed with error: {}", name, err),
        }
        result
    }
}

/// Get the tool definitions for the tagging agent
pub fn get_tagging_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition::function(
            "get_all_tags",
            "Get all existing tags in the knowledge base. Use this to see what tags are available.",
            json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        ),
        ToolDefinition::function(
            "search_tags",
            "Search existing tags by name. Use this to find if a tag already exists before creating a new one.",
            json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (partial match, case-insensitive)"
                    }
                },
                "required": ["query"]
            }),
        ),
        ToolDefinition::function(
            "get_note_tags",
            "Get the tags currently assigned to this note.",
            json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        ),
        ToolDefinition::function(
            "create_tag",
            "Create a new tag. Only use if no existing tag fits. Choose a color that semantically matches the tag meaning.",
            json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Tag name (lowercase, words separated by hyphens)"
                    },
                    "color": {
                        "type": "string",
                        "enum": ["red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"],
                        "description": "Tag color - choose based on semantic meaning"
                    }
                },
                "required": ["name", "color"]
            }),
        ),
        ToolDefinition::function(
            "assign_tag",
            "Assign an existing tag to this note by its ID.",
            json!({
                "type": "object",
                "properties": {
                    "tag_id": {
                        "type": "string",
                        "description": "The ID of the tag to assign"
                    }
                },
                "required": ["tag_id"]
            }),
        ),
        ToolDefinition::function(
            "remove_tag",
            "Remove a tag from this note.",
            json!({
                "type": "object",
                "properties": {
                    "tag_id": {
                        "type": "string",
                        "description": "The ID of the tag to remove"
                    }
                },
                "required": ["tag_id"]
            }),
        ),
    ]
}

/// Run the tagging agent on a note
///
/// This function:
/// 1. Creates a tagging agent for the note
/// 2. Runs the agent loop with the note content
/// 3. Returns the final tags and summary
pub async fn run_tagging_agent(
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    note_id: &str,
    note_title: &str,
    note_content: &str,
) -> Result<TaggingResult, AgentError> {
    info!("[TaggingAgent] ========== Starting tagging agent ==========");
    info!("[TaggingAgent] Note ID: {}", note_id);
    info!("[TaggingAgent] Note title: '{}'", note_title);
    info!("[TaggingAgent] Note content length: {} chars", note_content.len());
    info!("[TaggingAgent] Using model: {}", model);
    debug!("[TaggingAgent] Note content preview: {}", 
        if note_content.len() > 200 { 
            format!("{}...", &note_content[..200]) 
        } else { 
            note_content.to_string() 
        }
    );
    
    let agent = TaggingAgent::new(note_id.to_string(), pool.clone());
    let tools = get_tagging_tools();
    info!("[TaggingAgent] Initialized with {} available tools", tools.len());

    // Build the initial message with note content
    let initial_message = format!(
        "Please analyze this note and assign appropriate tags.\n\n\
        **Title:** {}\n\n\
        **Content:**\n{}",
        note_title, note_content
    );

    // Run the agent
    info!("[TaggingAgent] Starting agent loop...");
    let result = run_agent(
        provider,
        model,
        TAGGING_AGENT_SYSTEM_PROMPT,
        &initial_message,
        tools,
        &agent,
        30, // Max 30 iterations
    )
    .await;
    
    match &result {
        Ok(res) => {
            info!("[TaggingAgent] Agent loop completed successfully");
            info!("[TaggingAgent] Iterations: {}", res.iterations);
            info!("[TaggingAgent] Tool calls made: {}", res.tool_calls_made.len());
            for (i, tc) in res.tool_calls_made.iter().enumerate() {
                info!("[TaggingAgent]   {}. {} -> {}", i + 1, tc.tool_name, 
                    if tc.result.len() > 100 { 
                        format!("{}...", &tc.result[..100]) 
                    } else { 
                        tc.result.clone() 
                    }
                );
            }
            info!("[TaggingAgent] Final response: {}", res.final_response);
        }
        Err(e) => {
            warn!("[TaggingAgent] Agent loop failed: {:?}", e);
        }
    }
    
    let result = result?;

    // Get the final tags on the note
    info!("[TaggingAgent] Fetching final tags from database...");
    let conn = pool
        .get()
        .map_err(|e| AgentError::ToolError(e.to_string()))?;
    let tags = db::get_note_tags(&conn, note_id).map_err(|e| AgentError::ToolError(e.to_string()))?;
    
    info!("[TaggingAgent] ========== Tagging agent complete ==========");
    info!("[TaggingAgent] Final tags on note: {:?}", tags.iter().map(|t| &t.name).collect::<Vec<_>>());

    Ok(TaggingResult {
        tags,
        summary: result.final_response,
        iterations: result.iterations,
        tool_calls: result.tool_calls_made,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_tagging_tools() {
        let tools = get_tagging_tools();
        assert_eq!(tools.len(), 6);

        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"get_all_tags"));
        assert!(tool_names.contains(&"search_tags"));
        assert!(tool_names.contains(&"get_note_tags"));
        assert!(tool_names.contains(&"create_tag"));
        assert!(tool_names.contains(&"assign_tag"));
        assert!(tool_names.contains(&"remove_tag"));
    }
}
