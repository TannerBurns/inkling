//! Attachment text extraction for embeddings
//!
//! This module parses markdown content for attachment references and extracts
//! text content from those attachments, enabling them to be included in embeddings.

use crate::ai::tools::read_attachment::extract_text_from_attachment;
use crate::vault;
use regex::Regex;
use std::path::Path;

/// Represents a parsed attachment reference from markdown
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AttachmentReference {
    /// The relative path from the markdown (e.g., "../attachments/file.pdf")
    pub relative_path: String,
    /// The filename portion
    pub filename: String,
}

/// Parse markdown content for attachment references
///
/// Matches patterns like:
/// - `../attachments/file.pdf`
/// - `[text](../attachments/file.pdf)`
/// - `![alt](../attachments/image.png)`
///
/// Returns only document types that can have text extracted (excludes images)
pub fn parse_attachment_references(content: &str) -> Vec<AttachmentReference> {
    // Match ../attachments/ paths in markdown links and images
    // Pattern: ../attachments/ followed by any non-whitespace, non-closing chars
    let re = Regex::new(r#"\.\./attachments/([^\s\)\"\'\]]+)"#).unwrap();
    
    let mut references = Vec::new();
    let mut seen = std::collections::HashSet::new();
    
    for cap in re.captures_iter(content) {
        let filename = cap[1].to_string();
        
        // Skip if we've already seen this file
        if seen.contains(&filename) {
            continue;
        }
        seen.insert(filename.clone());
        
        // Skip image files (they can't be text-extracted)
        let ext = Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        
        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "ico" | "bmp") {
            continue;
        }
        
        references.push(AttachmentReference {
            relative_path: format!("../attachments/{}", filename),
            filename,
        });
    }
    
    references
}

/// Extract text content from all attachments referenced in markdown content
///
/// # Arguments
/// * `content` - The markdown content to parse for attachments
/// * `max_chars_per_attachment` - Maximum characters to extract per attachment (default 10000)
///
/// # Returns
/// Combined text from all attachments, with headers indicating the source file
pub fn extract_attachments_text(
    content: &Option<String>,
    max_chars_per_attachment: Option<usize>,
) -> String {
    let Some(content) = content else {
        return String::new();
    };
    
    let attachments = parse_attachment_references(content);
    if attachments.is_empty() {
        return String::new();
    }
    
    // Get the vault's attachments directory
    let attachments_dir = match vault::get_attachments_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("[AttachmentParser] Failed to get attachments dir: {}", e);
            return String::new();
        }
    };
    
    let max_chars = max_chars_per_attachment.unwrap_or(10000);
    let mut combined_text = Vec::new();
    
    for attachment in attachments {
        let file_path = attachments_dir.join(&attachment.filename);
        let path_str = file_path.to_string_lossy().to_string();
        
        match extract_text_from_attachment(&path_str, Some(max_chars)) {
            Ok(text) => {
                if !text.trim().is_empty() {
                    // Add a header to identify the source
                    combined_text.push(format!(
                        "--- Content from attachment: {} ---\n{}",
                        attachment.filename,
                        text
                    ));
                    log::debug!(
                        "[AttachmentParser] Extracted {} chars from {}",
                        text.len(),
                        attachment.filename
                    );
                }
            }
            Err(e) => {
                log::warn!(
                    "[AttachmentParser] Failed to extract text from {}: {}",
                    attachment.filename,
                    e
                );
                // Continue processing other attachments
            }
        }
    }
    
    combined_text.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_attachment_references() {
        let content = r#"
# My Note

Here's a PDF: [document](../attachments/report.pdf)

And an image: ![photo](../attachments/photo.jpg)

Another link: [spreadsheet](../attachments/data.xlsx)

Some text with inline path ../attachments/notes.docx mentioned.
        "#;
        
        let refs = parse_attachment_references(content);
        
        // Should find PDF, XLSX, DOCX but not JPG (image)
        assert_eq!(refs.len(), 3);
        assert!(refs.iter().any(|r| r.filename == "report.pdf"));
        assert!(refs.iter().any(|r| r.filename == "data.xlsx"));
        assert!(refs.iter().any(|r| r.filename == "notes.docx"));
        assert!(!refs.iter().any(|r| r.filename == "photo.jpg"));
    }
    
    #[test]
    fn test_parse_attachment_references_dedup() {
        let content = r#"
[doc](../attachments/file.pdf) and [same doc](../attachments/file.pdf)
        "#;
        
        let refs = parse_attachment_references(content);
        
        // Should deduplicate
        assert_eq!(refs.len(), 1);
    }
    
    #[test]
    fn test_parse_attachment_references_no_attachments() {
        let content = "Just some regular markdown without attachments";
        let refs = parse_attachment_references(content);
        assert!(refs.is_empty());
    }
}

