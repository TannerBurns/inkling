//! Document Builder State Manager
//!
//! Manages document building state across multiple AI tool calls.
//! Allows the AI to progressively build documents by:
//! 1. Creating a new document session
//! 2. Adding sections, tables, and other content
//! 3. Saving the final document

use std::collections::HashMap;
use std::sync::{Mutex, LazyLock};
use uuid::Uuid;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::db::exports::{Export, ExportFormat};
use crate::vault::get_exports_dir;

/// Represents a section of content in a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSection {
    pub section_type: SectionType,
    pub content: String,
    pub heading_level: Option<u8>,
}

/// Type of section in a document
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectionType {
    Heading,
    Paragraph,
    BulletList,
    NumberedList,
    Table,
    Image,
    CodeBlock,
    Quote,
    HorizontalRule,
}

/// Represents a table in a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentTable {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// A document being built
#[derive(Debug, Clone)]
pub struct DocumentDraft {
    pub id: String,
    pub title: String,
    pub format: ExportFormat,
    pub sections: Vec<DocumentSection>,
    pub tables: Vec<DocumentTable>,
}

impl DocumentDraft {
    pub fn new(title: String, format: ExportFormat) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            format,
            sections: Vec::new(),
            tables: Vec::new(),
        }
    }

    /// Add a section to the document
    pub fn add_section(&mut self, section: DocumentSection) {
        self.sections.push(section);
    }

    /// Add a table to the document
    pub fn add_table(&mut self, table: DocumentTable) {
        self.tables.push(table);
        // Also add as a section for rendering
        self.sections.push(DocumentSection {
            section_type: SectionType::Table,
            content: format!("table_{}", self.tables.len() - 1),
            heading_level: None,
        });
    }

    /// Convert sections to markdown for generation
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        for section in &self.sections {
            match section.section_type {
                SectionType::Heading => {
                    let level = section.heading_level.unwrap_or(1);
                    let hashes = "#".repeat(level as usize);
                    md.push_str(&format!("{} {}\n\n", hashes, section.content));
                }
                SectionType::Paragraph => {
                    md.push_str(&format!("{}\n\n", section.content));
                }
                SectionType::BulletList => {
                    for line in section.content.lines() {
                        let trimmed = line.trim();
                        // Skip empty lines to avoid empty bullet points
                        if !trimmed.is_empty() {
                            md.push_str(&format!("- {}\n", trimmed));
                        }
                    }
                    md.push('\n');
                }
                SectionType::NumberedList => {
                    let mut num = 1;
                    for line in section.content.lines() {
                        let trimmed = line.trim();
                        // Skip empty lines to avoid empty numbered items
                        if !trimmed.is_empty() {
                            md.push_str(&format!("{}. {}\n", num, trimmed));
                            num += 1;
                        }
                    }
                    md.push('\n');
                }
                SectionType::Table => {
                    // Reference to table by index
                    if let Some(idx) = section.content.strip_prefix("table_") {
                        if let Ok(table_idx) = idx.parse::<usize>() {
                            if let Some(table) = self.tables.get(table_idx) {
                                // Generate markdown table
                                if !table.headers.is_empty() {
                                    md.push_str("| ");
                                    md.push_str(&table.headers.join(" | "));
                                    md.push_str(" |\n");
                                    
                                    md.push_str("| ");
                                    md.push_str(&table.headers.iter().map(|_| "---").collect::<Vec<_>>().join(" | "));
                                    md.push_str(" |\n");
                                    
                                    for row in &table.rows {
                                        md.push_str("| ");
                                        md.push_str(&row.join(" | "));
                                        md.push_str(" |\n");
                                    }
                                    md.push('\n');
                                }
                            }
                        }
                    }
                }
                SectionType::Image => {
                    md.push_str(&format!("![Image]({})\n\n", section.content));
                }
                SectionType::CodeBlock => {
                    md.push_str(&format!("```\n{}\n```\n\n", section.content));
                }
                SectionType::Quote => {
                    for line in section.content.lines() {
                        md.push_str(&format!("> {}\n", line));
                    }
                    md.push('\n');
                }
                SectionType::HorizontalRule => {
                    md.push_str("---\n\n");
                }
            }
        }

        md
    }
}

/// Global storage for document drafts
static DOCUMENT_DRAFTS: LazyLock<Mutex<HashMap<String, DocumentDraft>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Create a new document draft
pub fn create_document(title: String, format: ExportFormat) -> Result<String, String> {
    let draft = DocumentDraft::new(title.clone(), format.clone());
    let id = draft.id.clone();

    log::info!("[DocumentBuilder] Creating document: id={}, title='{}', format={:?}", id, title, format);

    let mut drafts = DOCUMENT_DRAFTS
        .lock()
        .map_err(|e| format!("Failed to lock drafts: {}", e))?;

    drafts.insert(id.clone(), draft);
    log::info!("[DocumentBuilder] Total drafts in storage: {}", drafts.len());
    
    Ok(id)
}

/// Add a section to a document draft
pub fn add_document_section(
    document_id: &str,
    section_type: SectionType,
    content: String,
    heading_level: Option<u8>,
) -> Result<(), String> {
    log::debug!(
        "[DocumentBuilder] Adding section to {}: type={:?}, level={:?}, content_len={}",
        document_id,
        section_type,
        heading_level,
        content.len()
    );

    let mut drafts = DOCUMENT_DRAFTS
        .lock()
        .map_err(|e| format!("Failed to lock drafts: {}", e))?;

    let draft = drafts
        .get_mut(document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;

    draft.add_section(DocumentSection {
        section_type,
        content,
        heading_level,
    });

    log::debug!("[DocumentBuilder] Draft now has {} sections", draft.sections.len());

    Ok(())
}

/// Add a table to a document draft
pub fn add_document_table(
    document_id: &str,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    let mut drafts = DOCUMENT_DRAFTS
        .lock()
        .map_err(|e| format!("Failed to lock drafts: {}", e))?;

    let draft = drafts
        .get_mut(document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;

    draft.add_table(DocumentTable { headers, rows });

    Ok(())
}


/// Save a document draft to file
pub fn save_document(document_id: &str) -> Result<Export, String> {
    use std::fs;
    use crate::db::connection::init_vault_pool;
    use crate::db::exports::{create_export, CreateExportInput};
    use crate::exports::markdown_parser::{parse_markdown, extract_tables_from_markdown};
    use crate::exports::{PdfExportOptions, DocxExportOptions, XlsxExportOptions};

    log::info!("[DocumentBuilder] Saving document: {}", document_id);

    // Get and remove the draft
    let draft = {
        let mut drafts = DOCUMENT_DRAFTS
            .lock()
            .map_err(|e| format!("Failed to lock drafts: {}", e))?;

        log::info!("[DocumentBuilder] Current drafts in storage: {}", drafts.len());
        for (id, d) in drafts.iter() {
            log::info!("[DocumentBuilder] - Draft '{}': {} sections, {} tables", id, d.sections.len(), d.tables.len());
        }

        drafts
            .remove(document_id)
            .ok_or_else(|| format!("Document not found: {}", document_id))?
    };

    log::info!(
        "[DocumentBuilder] Retrieved draft: title='{}', format={:?}, sections={}, tables={}",
        draft.title,
        draft.format,
        draft.sections.len(),
        draft.tables.len()
    );

    // Get exports directory
    let exports_dir = get_exports_dir()
        .map_err(|e| format!("Failed to get exports directory: {}", e))?;

    // Create exports directory if needed
    fs::create_dir_all(&exports_dir)
        .map_err(|e| format!("Failed to create exports directory: {}", e))?;

    // Generate filename
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let safe_title = draft.title.replace(' ', "_").replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "");
    let extension = match draft.format {
        ExportFormat::Pdf => "pdf",
        ExportFormat::Docx => "docx",
        ExportFormat::Xlsx => "xlsx",
        ExportFormat::Pptx => "pptx",
    };
    let filename = format!("{}_{}.{}", safe_title, timestamp, extension);
    let file_path = exports_dir.join(&filename);

    // Convert to markdown and parse
    let markdown = draft.to_markdown();
    log::info!("[DocumentBuilder] Generated markdown ({} chars):\n{}", markdown.len(), markdown.chars().take(1000).collect::<String>());
    
    let parsed_content = parse_markdown(&markdown);
    log::info!("[DocumentBuilder] Parsed {} content blocks", parsed_content.blocks.len());

    // Generate the file based on format
    match draft.format {
        ExportFormat::Pdf => {
            let options = PdfExportOptions::default();
            crate::exports::pdf_generator::generate_pdf(&parsed_content, &draft.title, &file_path, &options)
                .map_err(|e| format!("PDF generation failed: {}", e))?;
        }
        ExportFormat::Docx => {
            let options = DocxExportOptions::default();
            crate::exports::docx_generator::generate_docx(&parsed_content, &draft.title, &file_path, &options)
                .map_err(|e| format!("DOCX generation failed: {}", e))?;
        }
        ExportFormat::Xlsx => {
            let options = XlsxExportOptions::default();
            // Extract tables from parsed content
            let tables = extract_tables_from_markdown(&markdown);
            crate::exports::xlsx_generator::generate_xlsx(&tables, &draft.title, &file_path, &options)
                .map_err(|e| format!("XLSX generation failed: {}", e))?;
        }
        ExportFormat::Pptx => {
            let options = crate::exports::pptx_generator::PptxExportOptions::default();
            crate::exports::pptx_generator::generate_pptx(&parsed_content, &draft.title, &file_path, &options)
                .map_err(|e| format!("PPTX generation failed: {}", e))?;
        }
    }

    // Get file size
    let file_size = fs::metadata(&file_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    // Get database connection
    let pool = init_vault_pool()
        .map_err(|e| format!("Failed to initialize database pool: {}", e))?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Create export record
    let input = CreateExportInput {
        filename: filename.clone(),
        title: draft.title.clone(),
        format: draft.format,
        source_note_ids: vec![], // No source note IDs for builder-created documents
        file_size: Some(file_size),
        path: file_path.to_string_lossy().to_string(),
    };

    let export = create_export(&conn, input)
        .map_err(|e| format!("Failed to create export record: {}", e))?;

    Ok(export)
}

/// Delete a document draft (cancel building)
pub fn delete_document(document_id: &str) -> Result<(), String> {
    let mut drafts = DOCUMENT_DRAFTS
        .lock()
        .map_err(|e| format!("Failed to lock drafts: {}", e))?;

    drafts
        .remove(document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_draft_to_markdown() {
        // Test the to_markdown method directly on a draft
        let mut draft = DocumentDraft::new("Test Document".to_string(), ExportFormat::Pdf);

        draft.add_section(DocumentSection {
            section_type: SectionType::Heading,
            content: "Introduction".to_string(),
            heading_level: Some(1),
        });

        draft.add_section(DocumentSection {
            section_type: SectionType::Paragraph,
            content: "This is the introduction paragraph.".to_string(),
            heading_level: None,
        });

        draft.add_table(DocumentTable {
            headers: vec!["Name".to_string(), "Value".to_string()],
            rows: vec![
                vec!["A".to_string(), "1".to_string()],
                vec!["B".to_string(), "2".to_string()],
            ],
        });

        assert_eq!(draft.title, "Test Document");
        assert_eq!(draft.sections.len(), 3); // Heading, Paragraph, Table
        assert_eq!(draft.tables.len(), 1);

        // Check markdown output
        let md = draft.to_markdown();
        assert!(md.contains("# Introduction"));
        assert!(md.contains("This is the introduction paragraph."));
        assert!(md.contains("| Name | Value |"));
    }
}

