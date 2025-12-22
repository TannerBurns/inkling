//! Document Export Module
//!
//! Provides functionality for exporting notes to various document formats:
//! - PDF (via printpdf)
//! - DOCX (via docx-rs)
//! - XLSX (via rust_xlsxwriter)
//! - PPTX (via zip + quick-xml)

pub mod html_to_markdown;
pub mod markdown_parser;
pub mod pdf_generator;
pub mod docx_generator;
pub mod xlsx_generator;
pub mod pptx_generator;
pub mod document_builder;

// Re-export document builder types and functions
pub use document_builder::*;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExportError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("PDF generation error: {0}")]
    PdfError(String),
    #[error("DOCX generation error: {0}")]
    DocxError(String),
    #[error("XLSX generation error: {0}")]
    XlsxError(String),
    #[error("PPTX generation error: {0}")]
    PptxError(String),
    #[error("Parse error: {0}")]
    ParseError(String),
}

/// Options for PDF export
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportOptions {
    /// Whether to include images
    #[serde(default = "default_true")]
    pub include_images: bool,
    /// Whether to add page breaks between notes
    #[serde(default)]
    pub page_break_between_notes: bool,
    /// Paper size (a4, letter, etc.)
    #[serde(default = "default_paper_size")]
    pub paper_size: String,
}

/// Options for DOCX export
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocxExportOptions {
    /// Whether to include images
    #[serde(default = "default_true")]
    pub include_images: bool,
    /// Whether to add page breaks between notes
    #[serde(default)]
    pub page_break_between_notes: bool,
}

/// Options for XLSX export
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct XlsxExportOptions {
    /// Whether to include headers
    #[serde(default = "default_true")]
    pub include_headers: bool,
    /// Whether to auto-fit column widths
    #[serde(default = "default_true")]
    pub auto_fit_columns: bool,
}

fn default_true() -> bool {
    true
}

fn default_paper_size() -> String {
    "a4".to_string()
}

/// Result of an export operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    /// Path to the generated file
    pub path: String,
    /// Filename
    pub filename: String,
    /// File size in bytes
    pub file_size: u64,
    /// Markdown link to embed in notes
    pub markdown_link: String,
}

/// Generate a safe filename from a title
pub fn sanitize_filename(title: &str) -> String {
    let safe: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    
    // Trim and collapse multiple spaces/underscores
    let mut result = String::new();
    let mut last_was_space = false;
    
    for c in safe.trim().chars() {
        if c == ' ' || c == '_' {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(c);
            last_was_space = false;
        }
    }
    
    // Limit length
    if result.len() > 100 {
        result.truncate(100);
    }
    
    result.trim().to_string()
}

/// Generate a dated filename
pub fn generate_dated_filename(title: &str, extension: &str) -> String {
    let safe_title = sanitize_filename(title);
    let date = chrono::Local::now().format("%Y-%m-%d");
    format!("{}-{}.{}", safe_title, date, extension)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Hello World"), "Hello World");
        assert_eq!(sanitize_filename("Test/File:Name"), "Test_File_Name");
        assert_eq!(sanitize_filename("  Multiple   Spaces  "), "Multiple Spaces");
    }

    #[test]
    fn test_generate_dated_filename() {
        let filename = generate_dated_filename("Test Export", "pdf");
        assert!(filename.starts_with("Test Export-"));
        assert!(filename.ends_with(".pdf"));
    }
}

