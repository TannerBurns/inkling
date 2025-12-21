//! Append to Note Tool
//!
//! Allows agents to stream content to the current note in real-time.
//! Content is emitted via Tauri events for the frontend to insert.

use serde_json::json;
use tauri::Emitter;

use crate::ai::agent::ToolDefinition;

/// Get the tool definition for append_to_note
pub fn get_append_to_note_tool() -> ToolDefinition {
    ToolDefinition::function(
        "append_to_note",
        "Append content to the current note. Content will be inserted at the cursor position. Call this multiple times to stream content incrementally.",
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The markdown content to append to the note. Can include headings, lists, code blocks, etc."
                },
                "is_final": {
                    "type": "boolean",
                    "description": "Whether this is the final piece of content. Set to true when done writing.",
                    "default": false
                }
            },
            "required": ["content"]
        }),
    )
}

/// Content event payload for streaming to the frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendContentEvent {
    /// The content to append
    pub content: String,
    /// Whether this is the final chunk
    pub is_final: bool,
}

/// Execute the append_to_note tool
///
/// This function emits content via a Tauri event so the frontend can
/// insert it into the note at the current cursor position.
pub fn execute_append_to_note(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    args: serde_json::Value,
) -> Result<String, String> {
    // Parse arguments
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'content' argument")?;

    let is_final = args
        .get("is_final")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if content.is_empty() {
        return Err("Content cannot be empty".to_string());
    }

    // Emit the content event
    let event_name = format!("agent-content-{}", execution_id);
    let event_payload = AppendContentEvent {
        content: content.to_string(),
        is_final,
    };

    app_handle
        .emit(&event_name, &event_payload)
        .map_err(|e| format!("Failed to emit content event: {}", e))?;

    log::info!(
        "[AppendToNote] Emitted {} chars to {}, is_final={}",
        content.len(),
        event_name,
        is_final
    );

    Ok(json!({
        "success": true,
        "message": if is_final { "Content appended (final)" } else { "Content appended" },
        "chars_written": content.len()
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_append_to_note_tool() {
        let tool = get_append_to_note_tool();
        assert_eq!(tool.function.name, "append_to_note");
        assert!(tool.function.description.contains("Append"));
    }
}
