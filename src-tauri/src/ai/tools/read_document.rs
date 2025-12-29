//! Read Document Tool
//!
//! Provides a tool for agents to extract text content from document attachments.
//! Wraps the existing read_attachment functionality for use by the deep research agent.
//!
//! Supported formats:
//! - PDF documents (.pdf)
//! - Excel spreadsheets (.xlsx, .xls, .xlsm, .xlsb)
//! - Word documents (.docx)
//! - PowerPoint presentations (.pptx)
//! - Plain text and code files

use serde_json::{json, Value};
use std::path::Path;

use super::super::agent::ToolDefinition;
use super::read_attachment::extract_text_from_attachment;
use crate::vault;

/// Maximum characters to extract from a document
const MAX_DOCUMENT_CHARS: usize = 50_000;

/// Get the tool definition for read_document
pub fn get_read_document_tool() -> ToolDefinition {
    ToolDefinition::function(
        "read_document",
        "Extract and read text content from a document attachment (PDF, Word, Excel, PowerPoint, or text files). Use this to analyze documents referenced in notes or provided by the user. Provide either the filename (for attachments) or a full file path.",
        json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "The filename of the attachment (e.g., 'report.pdf', 'data.xlsx'). The file should be in the vault's attachments folder."
                },
                "path": {
                    "type": "string",
                    "description": "Full file path if the document is outside the attachments folder"
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters to extract (default: 50000)"
                }
            },
            "required": []
        }),
    )
}

/// Execute the read_document tool
pub fn execute_read_document(args: Value) -> Result<String, String> {
    let max_chars = args
        .get("max_chars")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(MAX_DOCUMENT_CHARS);

    // Try to get the file path
    let file_path = if let Some(path) = args.get("path").and_then(|v| v.as_str()) {
        // Full path provided
        path.to_string()
    } else if let Some(filename) = args.get("filename").and_then(|v| v.as_str()) {
        // Filename only - resolve from attachments folder
        let attachments_dir = vault::get_attachments_dir()
            .map_err(|e| format!("Failed to get attachments directory: {}", e))?;
        
        let full_path = attachments_dir.join(filename);
        full_path.to_string_lossy().to_string()
    } else {
        return Err("Either 'filename' or 'path' must be provided".to_string());
    };

    log::info!("[ReadDocument] Extracting text from: {}", file_path);

    // Check if file exists
    if !Path::new(&file_path).exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Get file extension for metadata
    let extension = Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let filename = Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    // Extract text using existing functionality
    let content = extract_text_from_attachment(&file_path, Some(max_chars))?;

    let document_type = match extension.as_str() {
        "pdf" => "PDF Document",
        "xlsx" | "xls" | "xlsm" | "xlsb" => "Excel Spreadsheet",
        "docx" => "Word Document",
        "pptx" => "PowerPoint Presentation",
        "txt" | "md" | "markdown" => "Text Document",
        _ => "Document",
    };

    log::info!(
        "[ReadDocument] Successfully extracted {} characters from {} ({})",
        content.len(),
        filename,
        document_type
    );

    Ok(json!({
        "success": true,
        "filename": filename,
        "document_type": document_type,
        "extension": extension,
        "content": content,
        "characters_extracted": content.len(),
        "max_chars": max_chars
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_read_document_tool() {
        let tool = get_read_document_tool();
        assert_eq!(tool.function.name, "read_document");
        assert!(tool.function.description.contains("PDF"));
        assert!(tool.function.description.contains("Word"));
        assert!(tool.function.description.contains("Excel"));
    }

    #[test]
    fn test_execute_read_document_missing_args() {
        let result = execute_read_document(json!({}));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be provided"));
    }

    #[test]
    fn test_execute_read_document_file_not_found() {
        let result = execute_read_document(json!({"path": "/nonexistent/file.pdf"}));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}

