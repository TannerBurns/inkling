//! Export Notes Tools
//!
//! Provides tools for exporting notes to various document formats (PDF, DOCX, XLSX).
//! These tools can be used by the inline assistant to generate documents from notes.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::connection::DbPool;
use crate::db::{exports, notes};
use crate::exports::{
    docx_generator, generate_dated_filename, pdf_generator, xlsx_generator,
    DocxExportOptions, PdfExportOptions, XlsxExportOptions,
};
use crate::vault::config::get_exports_dir;

/// Result returned by export tools
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportToolResult {
    pub success: bool,
    pub path: Option<String>,
    pub filename: Option<String>,
    pub markdown_link: Option<String>,
    pub error: Option<String>,
}

// ============================================================================
// Tool Definitions
// ============================================================================

/// Get the tool definition for export_notes_pdf
pub fn get_export_notes_pdf_tool() -> ToolDefinition {
    ToolDefinition::function(
        "export_notes_pdf",
        "Export one or more notes to a PDF document. Returns a path to the generated PDF file.",
        json!({
            "type": "object",
            "properties": {
                "note_ids": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Array of note IDs to include in the PDF"
                },
                "title": {
                    "type": "string",
                    "description": "Title for the PDF document"
                },
                "page_break_between_notes": {
                    "type": "boolean",
                    "description": "Whether to add page breaks between notes (default: true)",
                    "default": true
                }
            },
            "required": ["note_ids", "title"]
        }),
    )
}

/// Get the tool definition for export_notes_docx
pub fn get_export_notes_docx_tool() -> ToolDefinition {
    ToolDefinition::function(
        "export_notes_docx",
        "Export one or more notes to a Word document (DOCX). Returns a path to the generated file.",
        json!({
            "type": "object",
            "properties": {
                "note_ids": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Array of note IDs to include in the document"
                },
                "title": {
                    "type": "string",
                    "description": "Title for the Word document"
                },
                "page_break_between_notes": {
                    "type": "boolean",
                    "description": "Whether to add page breaks between notes (default: true)",
                    "default": true
                }
            },
            "required": ["note_ids", "title"]
        }),
    )
}

/// Get the tool definition for export_selection_xlsx
pub fn get_export_selection_xlsx_tool() -> ToolDefinition {
    ToolDefinition::function(
        "export_selection_xlsx",
        "Export a markdown table or tabular content to an Excel spreadsheet (XLSX). The content should be in markdown table format.",
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The markdown content containing the table to export"
                },
                "title": {
                    "type": "string",
                    "description": "Title for the Excel file"
                }
            },
            "required": ["content", "title"]
        }),
    )
}

// ============================================================================
// Tool Execution
// ============================================================================

/// Execute the export_notes_pdf tool
pub fn execute_export_notes_pdf(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    // Parse arguments
    let note_ids: Vec<String> = args
        .get("note_ids")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .ok_or("Missing or invalid 'note_ids' argument")?;

    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'title' argument")?;

    let page_break = args
        .get("page_break_between_notes")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if note_ids.is_empty() {
        return Err("note_ids cannot be empty".to_string());
    }

    // Get notes content
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut notes_data: Vec<(String, String)> = Vec::new();

    for note_id in &note_ids {
        let note = notes::get_note(&conn, note_id)
            .map_err(|e| format!("Failed to get note {}: {}", note_id, e))?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        
        notes_data.push((
            note.title,
            note.content.unwrap_or_default(),
        ));
    }

    // Get exports directory
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(title, "pdf");
    let output_path = exports_dir.join(&filename);

    // Generate PDF
    let options = PdfExportOptions {
        include_images: true,
        page_break_between_notes: page_break,
        paper_size: "a4".to_string(),
    };

    let result = pdf_generator::generate_pdf_from_notes(&notes_data, title, &output_path, &options)
        .map_err(|e| format!("PDF generation failed: {}", e))?;

    // Record export in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.to_string(),
        format: exports::ExportFormat::Pdf,
        source_note_ids: note_ids,
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input)
        .map_err(|e| format!("Failed to record export: {}", e))?;

    Ok(json!({
        "success": true,
        "path": result.path,
        "filename": result.filename,
        "markdown_link": result.markdown_link,
        "message": format!("PDF exported successfully: {}", result.filename)
    }).to_string())
}

/// Execute the export_notes_docx tool
pub fn execute_export_notes_docx(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    // Parse arguments
    let note_ids: Vec<String> = args
        .get("note_ids")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .ok_or("Missing or invalid 'note_ids' argument")?;

    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'title' argument")?;

    let page_break = args
        .get("page_break_between_notes")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if note_ids.is_empty() {
        return Err("note_ids cannot be empty".to_string());
    }

    // Get notes content
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut notes_data: Vec<(String, String)> = Vec::new();

    for note_id in &note_ids {
        let note = notes::get_note(&conn, note_id)
            .map_err(|e| format!("Failed to get note {}: {}", note_id, e))?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        
        notes_data.push((
            note.title,
            note.content.unwrap_or_default(),
        ));
    }

    // Get exports directory
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(title, "docx");
    let output_path = exports_dir.join(&filename);

    // Generate DOCX
    let options = DocxExportOptions {
        include_images: true,
        page_break_between_notes: page_break,
    };

    let result = docx_generator::generate_docx_from_notes(&notes_data, title, &output_path, &options)
        .map_err(|e| format!("DOCX generation failed: {}", e))?;

    // Record export in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.to_string(),
        format: exports::ExportFormat::Docx,
        source_note_ids: note_ids,
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input)
        .map_err(|e| format!("Failed to record export: {}", e))?;

    Ok(json!({
        "success": true,
        "path": result.path,
        "filename": result.filename,
        "markdown_link": result.markdown_link,
        "message": format!("Word document exported successfully: {}", result.filename)
    }).to_string())
}

/// Execute the export_selection_xlsx tool
pub fn execute_export_selection_xlsx(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    // Parse arguments
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'content' argument")?;

    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'title' argument")?;

    // Get exports directory
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(title, "xlsx");
    let output_path = exports_dir.join(&filename);

    // Generate XLSX
    let options = XlsxExportOptions::default();

    let result = xlsx_generator::generate_xlsx_from_selection(content, title, &output_path, &options)
        .map_err(|e| format!("XLSX generation failed: {}", e))?;

    // Record export in database
    let conn = pool.get().map_err(|e| e.to_string())?;
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.to_string(),
        format: exports::ExportFormat::Xlsx,
        source_note_ids: vec![], // Selection-based, no specific note IDs
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input)
        .map_err(|e| format!("Failed to record export: {}", e))?;

    Ok(json!({
        "success": true,
        "path": result.path,
        "filename": result.filename,
        "markdown_link": result.markdown_link,
        "message": format!("Excel spreadsheet exported successfully: {}", result.filename)
    }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_export_tools() {
        let pdf_tool = get_export_notes_pdf_tool();
        assert_eq!(pdf_tool.function.name, "export_notes_pdf");
        
        let docx_tool = get_export_notes_docx_tool();
        assert_eq!(docx_tool.function.name, "export_notes_docx");
        
        let xlsx_tool = get_export_selection_xlsx_tool();
        assert_eq!(xlsx_tool.function.name, "export_selection_xlsx");
    }
}

