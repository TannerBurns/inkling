//! Markdown file handling with YAML frontmatter
//!
//! Parses and serializes notes as Markdown files with YAML frontmatter for metadata.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MarkdownError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("YAML error: {0}")]
    YamlError(#[from] serde_yaml::Error),
    #[error("Invalid frontmatter")]
    InvalidFrontmatter,
    #[error("Missing frontmatter")]
    MissingFrontmatter,
}

/// Frontmatter metadata for a note
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFrontmatter {
    pub id: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub created: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub updated: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
}

/// A parsed markdown note with frontmatter and content
#[derive(Debug, Clone)]
pub struct ParsedNote {
    pub frontmatter: NoteFrontmatter,
    pub title: String,
    pub content: String,
}

/// Parse a markdown file with YAML frontmatter
pub fn parse_markdown_file(path: &Path) -> Result<ParsedNote, MarkdownError> {
    let content = fs::read_to_string(path)?;
    parse_markdown(&content)
}

/// Parse markdown content with YAML frontmatter
pub fn parse_markdown(content: &str) -> Result<ParsedNote, MarkdownError> {
    let content = content.trim();
    
    // Check for frontmatter delimiter
    if !content.starts_with("---") {
        return Err(MarkdownError::MissingFrontmatter);
    }
    
    // Find the end of frontmatter
    let rest = &content[3..];
    let end_pos = rest.find("\n---")
        .ok_or(MarkdownError::InvalidFrontmatter)?;
    
    let frontmatter_str = &rest[..end_pos].trim();
    let body = &rest[end_pos + 4..].trim();
    
    // Parse frontmatter
    let frontmatter: NoteFrontmatter = serde_yaml::from_str(frontmatter_str)?;
    
    // Extract title from first heading or use filename
    let (title, content) = extract_title_and_content(body);
    
    Ok(ParsedNote {
        frontmatter,
        title,
        content: content.to_string(),
    })
}

/// Extract title from first H1 heading and return remaining content
fn extract_title_and_content(body: &str) -> (String, String) {
    let lines: Vec<&str> = body.lines().collect();
    
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            let title = trimmed[2..].trim().to_string();
            let remaining: Vec<&str> = lines[i + 1..].to_vec();
            let content = remaining.join("\n").trim().to_string();
            return (title, content);
        }
        // Skip empty lines at the start
        if !trimmed.is_empty() && !trimmed.starts_with('#') {
            break;
        }
    }
    
    // No title found, use first line or "Untitled"
    let title = lines.first()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Untitled")
        .to_string();
    
    (title, body.to_string())
}

/// Serialize a note to markdown with YAML frontmatter
pub fn serialize_note(
    id: &str,
    title: &str,
    content: Option<&str>,
    folder_id: Option<&str>,
    folder_name: Option<&str>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
) -> Result<String, MarkdownError> {
    let frontmatter = NoteFrontmatter {
        id: id.to_string(),
        created: created_at,
        updated: updated_at,
        folder: folder_name.map(String::from),
        folder_id: folder_id.map(String::from),
    };
    
    let frontmatter_yaml = serde_yaml::to_string(&frontmatter)?;
    
    let content_body = content.unwrap_or("");
    
    Ok(format!(
        "---\n{}---\n\n# {}\n\n{}",
        frontmatter_yaml,
        title,
        content_body
    ))
}

/// Write a note to a markdown file
pub fn write_note_file(
    path: &Path,
    id: &str,
    title: &str,
    content: Option<&str>,
    folder_id: Option<&str>,
    folder_name: Option<&str>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
) -> Result<(), MarkdownError> {
    let markdown = serialize_note(id, title, content, folder_id, folder_name, created_at, updated_at)?;
    
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    fs::write(path, markdown)?;
    Ok(())
}

/// Generate a safe filename from a note title
pub fn title_to_filename(title: &str) -> String {
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
    
    // Collapse multiple underscores/spaces
    let mut result = String::new();
    let mut prev_was_separator = false;
    
    for c in safe.chars() {
        if c == ' ' || c == '_' {
            if !prev_was_separator {
                result.push(' ');
                prev_was_separator = true;
            }
        } else {
            result.push(c);
            prev_was_separator = false;
        }
    }
    
    let trimmed = result.trim().to_string();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        format!("{}.md", trimmed)
    }
}

/// Get the note file path for a given note
pub fn get_note_path(notes_dir: &Path, title: &str, folder_path: Option<&str>) -> std::path::PathBuf {
    let filename = title_to_filename(title);
    
    match folder_path {
        Some(folder) => notes_dir.join(folder).join(filename),
        None => notes_dir.join(filename),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_markdown() {
        let content = r#"---
id: "test-123"
created: 1700000000
updated: 1700001000
folder: "my-folder"
---

# My Test Note

This is the content of my note.

It has multiple paragraphs.
"#;
        
        let result = parse_markdown(content).unwrap();
        assert_eq!(result.frontmatter.id, "test-123");
        assert_eq!(result.title, "My Test Note");
        assert!(result.content.contains("multiple paragraphs"));
    }
    
    #[test]
    fn test_serialize_note() {
        let result = serialize_note(
            "test-456",
            "Test Title",
            Some("Content here"),
            None,
            None,
            Utc::now(),
            Utc::now(),
        ).unwrap();
        
        assert!(result.contains("id: test-456"));
        assert!(result.contains("# Test Title"));
        assert!(result.contains("Content here"));
    }
    
    #[test]
    fn test_title_to_filename() {
        assert_eq!(title_to_filename("My Note"), "My Note.md");
        // Special chars become underscores, then underscores/spaces collapse to single spaces
        assert_eq!(title_to_filename("Note: Important!"), "Note Important.md");
        assert_eq!(title_to_filename(""), "Untitled");
    }
}
