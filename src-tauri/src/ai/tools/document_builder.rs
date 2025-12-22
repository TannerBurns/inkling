//! Document Builder AI Tools
//!
//! AI agent tools for building documents through multiple tool calls.
//! These tools allow the AI to create and populate documents incrementally.

use serde_json::{json, Value};

use crate::ai::tools::ToolFunction;
use crate::db::exports::ExportFormat;
use crate::exports::{
    create_document, add_document_section, add_document_table, 
    save_document, delete_document, SectionType
};

/// Get the create_document tool definition
pub fn get_create_document_tool() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "create_document",
            "description": "Create a new document draft that can be built incrementally. Returns a document ID that should be used in subsequent add_section and add_table calls. Call save_document when the document is complete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title of the document"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["pdf", "docx", "xlsx", "pptx"],
                        "description": "The output format for the document. Use 'pptx' for presentations."
                    }
                },
                "required": ["title", "format"]
            }
        }
    })
}

/// Get the add_section tool definition
pub fn get_add_section_tool() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "add_section",
            "description": "Add a section to a document draft. Use this to add headings, paragraphs, lists, code blocks, quotes, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The document ID returned from create_document"
                    },
                    "section_type": {
                        "type": "string",
                        "enum": ["heading", "paragraph", "bullet_list", "numbered_list", "code_block", "quote", "horizontal_rule"],
                        "description": "The type of section to add"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content of the section. For lists, each line becomes a list item."
                    },
                    "heading_level": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 6,
                        "description": "The heading level (1-6). Only required for heading sections."
                    }
                },
                "required": ["document_id", "section_type", "content"]
            }
        }
    })
}

/// Get the add_table tool definition
pub fn get_add_table_tool() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "add_table",
            "description": "Add a table to a document draft. Provide headers and rows as arrays.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The document ID returned from create_document"
                    },
                    "headers": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Array of column header strings"
                    },
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "description": "Array of rows, where each row is an array of cell values"
                    }
                },
                "required": ["document_id", "headers", "rows"]
            }
        }
    })
}

/// Get the save_document tool definition
pub fn get_save_document_tool() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "save_document",
            "description": "Save a completed document draft to a file. Returns the export information including the file path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The document ID returned from create_document"
                    }
                },
                "required": ["document_id"]
            }
        }
    })
}

/// Get the cancel_document tool definition
pub fn get_cancel_document_tool() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "cancel_document",
            "description": "Cancel and discard a document draft without saving it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The document ID to cancel"
                    }
                },
                "required": ["document_id"]
            }
        }
    })
}

/// Execute the create_document tool
pub fn execute_create_document(args: &Value) -> Result<String, String> {
    let title = args.get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing title argument")?;

    let format_str = args.get("format")
        .and_then(|v| v.as_str())
        .ok_or("Missing format argument")?;

    let format = match format_str.to_lowercase().as_str() {
        "pdf" => ExportFormat::Pdf,
        "docx" => ExportFormat::Docx,
        "xlsx" => ExportFormat::Xlsx,
        "pptx" => ExportFormat::Pptx,
        _ => return Err(format!("Unsupported format: {}", format_str)),
    };

    let document_id = create_document(title.to_string(), format)?;

    Ok(json!({
        "success": true,
        "document_id": document_id,
        "message": format!("Created document draft '{}' with ID {}. Use add_section and add_table to add content, then save_document to generate the file.", title, document_id)
    }).to_string())
}

/// Execute the add_section tool
pub fn execute_add_section(args: &Value) -> Result<String, String> {
    let document_id = args.get("document_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing document_id argument")?;

    let section_type_str = args.get("section_type")
        .and_then(|v| v.as_str())
        .ok_or("Missing section_type argument")?;

    let content = args.get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing content argument")?;

    let heading_level = args.get("heading_level")
        .and_then(|v| v.as_u64())
        .map(|v| v as u8);

    let section_type = match section_type_str.to_lowercase().as_str() {
        "heading" => SectionType::Heading,
        "paragraph" => SectionType::Paragraph,
        "bullet_list" => SectionType::BulletList,
        "numbered_list" => SectionType::NumberedList,
        "code_block" => SectionType::CodeBlock,
        "quote" => SectionType::Quote,
        "horizontal_rule" => SectionType::HorizontalRule,
        _ => return Err(format!("Unknown section type: {}", section_type_str)),
    };

    add_document_section(document_id, section_type, content.to_string(), heading_level)?;

    Ok(json!({
        "success": true,
        "message": format!("Added {} section to document", section_type_str)
    }).to_string())
}

/// Execute the add_table tool
pub fn execute_add_table(args: &Value) -> Result<String, String> {
    let document_id = args.get("document_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing document_id argument")?;

    let headers = args.get("headers")
        .and_then(|v| v.as_array())
        .ok_or("Missing headers argument")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>();

    let rows = args.get("rows")
        .and_then(|v| v.as_array())
        .ok_or("Missing rows argument")?
        .iter()
        .filter_map(|v| {
            v.as_array().map(|row| {
                row.iter()
                    .filter_map(|cell| cell.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
        })
        .collect::<Vec<_>>();

    add_document_table(document_id, headers.clone(), rows.clone())?;

    Ok(json!({
        "success": true,
        "message": format!("Added table with {} columns and {} rows", headers.len(), rows.len())
    }).to_string())
}

/// Execute the save_document tool
pub fn execute_save_document(args: &Value) -> Result<String, String> {
    let document_id = args.get("document_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing document_id argument")?;

    let export = save_document(document_id)?;

    Ok(json!({
        "success": true,
        "export": {
            "id": export.id,
            "filename": export.filename,
            "title": export.title,
            "format": export.format.to_string(),
            "path": export.path,
            "file_size": export.file_size
        },
        "message": format!("Document saved as {}", export.filename)
    }).to_string())
}

/// Execute the cancel_document tool
pub fn execute_cancel_document(args: &Value) -> Result<String, String> {
    let document_id = args.get("document_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing document_id argument")?;

    delete_document(document_id)?;

    Ok(json!({
        "success": true,
        "message": "Document draft cancelled and discarded"
    }).to_string())
}

/// Get the tool function for document builder tools
pub fn get_document_builder_tool_function(name: &str) -> Option<ToolFunction> {
    match name {
        "create_document" => Some(Box::new(|args| execute_create_document(&args))),
        "add_section" => Some(Box::new(|args| execute_add_section(&args))),
        "add_table" => Some(Box::new(|args| execute_add_table(&args))),
        "save_document" => Some(Box::new(|args| execute_save_document(&args))),
        "cancel_document" => Some(Box::new(|args| execute_cancel_document(&args))),
        _ => None,
    }
}

/// Get all document builder tools
pub fn get_all_document_builder_tools() -> Vec<Value> {
    vec![
        get_create_document_tool(),
        get_add_section_tool(),
        get_add_table_tool(),
        get_save_document_tool(),
        get_cancel_document_tool(),
    ]
}

