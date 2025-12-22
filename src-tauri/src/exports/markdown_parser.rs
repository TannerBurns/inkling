//! Markdown Parser for Document Export
//!
//! Parses markdown content into structured blocks that can be converted
//! to various document formats (PDF, DOCX, XLSX, PPTX).

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};

/// A row of table data
pub type TableRow = Vec<String>;

/// Table data extracted from markdown
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableData {
    /// Header row (if present)
    pub headers: Option<TableRow>,
    /// Data rows
    pub rows: Vec<TableRow>,
}

impl TableData {
    pub fn new() -> Self {
        Self {
            headers: None,
            rows: Vec::new(),
        }
    }
    
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty() && self.headers.is_none()
    }
    
    pub fn column_count(&self) -> usize {
        self.headers
            .as_ref()
            .map(|h| h.len())
            .unwrap_or_else(|| self.rows.first().map(|r| r.len()).unwrap_or(0))
    }
}

impl Default for TableData {
    fn default() -> Self {
        Self::new()
    }
}

/// Types of content blocks extracted from markdown
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ContentBlock {
    /// A heading (h1-h6)
    Heading {
        level: u8,
        text: String,
    },
    /// A paragraph of text
    Paragraph {
        text: String,
    },
    /// A code block
    CodeBlock {
        language: Option<String>,
        code: String,
    },
    /// An unordered list
    UnorderedList {
        items: Vec<String>,
    },
    /// An ordered list
    OrderedList {
        items: Vec<String>,
        start: u64,
    },
    /// A blockquote
    Blockquote {
        text: String,
    },
    /// A horizontal rule
    HorizontalRule,
    /// An image
    Image {
        url: String,
        alt: String,
        title: Option<String>,
    },
    /// A table
    Table(TableData),
    /// A task list
    TaskList {
        items: Vec<TaskItem>,
    },
}

/// A task list item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub checked: bool,
    pub text: String,
}

/// Parsed markdown content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedContent {
    /// The document title (if extracted)
    pub title: Option<String>,
    /// Content blocks
    pub blocks: Vec<ContentBlock>,
}

impl ParsedContent {
    pub fn new() -> Self {
        Self {
            title: None,
            blocks: Vec::new(),
        }
    }
    
}

impl Default for ParsedContent {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse markdown content into structured blocks
pub fn parse_markdown(content: &str) -> ParsedContent {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(content, options);
    
    let mut result = ParsedContent::new();
    let mut current_text = String::new();
    let mut list_items: Vec<String> = Vec::new();
    let mut task_items: Vec<TaskItem> = Vec::new();
    let mut is_ordered_list = false;
    let mut list_start: u64 = 1;
    let mut in_list_item = false;
    let mut _in_heading = false;
    let mut heading_level: u8 = 1;
    let mut in_blockquote = false;
    let mut in_code_block = false;
    let mut code_language: Option<String> = None;
    let mut code_content = String::new();
    
    // Table parsing state
    let mut in_table = false;
    let mut in_table_head = false;
    let mut current_table = TableData::new();
    let mut current_table_row: TableRow = Vec::new();
    let mut current_cell_text = String::new();
    
    // Task list state
    let mut current_task_checked = false;
    let mut in_task_list = false;
    
    for event in parser {
        match event {
            // Headings
            Event::Start(Tag::Heading { level, .. }) => {
                _in_heading = true;
                heading_level = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    HeadingLevel::H5 => 5,
                    HeadingLevel::H6 => 6,
                };
                current_text.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                if !current_text.is_empty() {
                    // Extract first h1 as title if not set
                    if heading_level == 1 && result.title.is_none() {
                        result.title = Some(current_text.clone());
                    }
                    result.blocks.push(ContentBlock::Heading {
                        level: heading_level,
                        text: current_text.trim().to_string(),
                    });
                }
                _in_heading = false;
                current_text.clear();
            }
            
            // Paragraphs
            Event::Start(Tag::Paragraph) => {
                if !in_list_item && !in_blockquote {
                    current_text.clear();
                }
            }
            Event::End(TagEnd::Paragraph) => {
                if !in_list_item && !in_blockquote && !current_text.is_empty() {
                    result.blocks.push(ContentBlock::Paragraph {
                        text: current_text.trim().to_string(),
                    });
                    current_text.clear();
                }
            }
            
            // Lists
            Event::Start(Tag::List(start)) => {
                is_ordered_list = start.is_some();
                list_start = start.unwrap_or(1);
                list_items.clear();
                task_items.clear();
                in_task_list = false;
            }
            Event::End(TagEnd::List(_)) => {
                if in_task_list && !task_items.is_empty() {
                    result.blocks.push(ContentBlock::TaskList {
                        items: task_items.clone(),
                    });
                } else if !list_items.is_empty() {
                    if is_ordered_list {
                        result.blocks.push(ContentBlock::OrderedList {
                            items: list_items.clone(),
                            start: list_start,
                        });
                    } else {
                        result.blocks.push(ContentBlock::UnorderedList {
                            items: list_items.clone(),
                        });
                    }
                }
                list_items.clear();
                task_items.clear();
            }
            Event::Start(Tag::Item) => {
                in_list_item = true;
                current_text.clear();
            }
            Event::End(TagEnd::Item) => {
                if in_task_list {
                    task_items.push(TaskItem {
                        checked: current_task_checked,
                        text: current_text.trim().to_string(),
                    });
                } else {
                    list_items.push(current_text.trim().to_string());
                }
                in_list_item = false;
                current_text.clear();
            }
            
            // Task list checkboxes
            Event::TaskListMarker(checked) => {
                in_task_list = true;
                current_task_checked = checked;
            }
            
            // Blockquotes
            Event::Start(Tag::BlockQuote(_)) => {
                in_blockquote = true;
                current_text.clear();
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                if !current_text.is_empty() {
                    result.blocks.push(ContentBlock::Blockquote {
                        text: current_text.trim().to_string(),
                    });
                }
                in_blockquote = false;
                current_text.clear();
            }
            
            // Code blocks
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_content.clear();
                code_language = match kind {
                    pulldown_cmark::CodeBlockKind::Fenced(lang) => {
                        let l = lang.to_string();
                        if l.is_empty() { None } else { Some(l) }
                    }
                    pulldown_cmark::CodeBlockKind::Indented => None,
                };
            }
            Event::End(TagEnd::CodeBlock) => {
                result.blocks.push(ContentBlock::CodeBlock {
                    language: code_language.take(),
                    code: code_content.trim_end().to_string(),
                });
                in_code_block = false;
                code_content.clear();
            }
            
            // Tables
            Event::Start(Tag::Table(_)) => {
                in_table = true;
                current_table = TableData::new();
            }
            Event::End(TagEnd::Table) => {
                if !current_table.is_empty() {
                    result.blocks.push(ContentBlock::Table(current_table.clone()));
                }
                in_table = false;
                current_table = TableData::new();
            }
            Event::Start(Tag::TableHead) => {
                in_table_head = true;
                current_table_row.clear();
            }
            Event::End(TagEnd::TableHead) => {
                if !current_table_row.is_empty() {
                    current_table.headers = Some(current_table_row.clone());
                }
                in_table_head = false;
                current_table_row.clear();
            }
            Event::Start(Tag::TableRow) => {
                current_table_row.clear();
            }
            Event::End(TagEnd::TableRow) => {
                if !in_table_head && !current_table_row.is_empty() {
                    current_table.rows.push(current_table_row.clone());
                }
                current_table_row.clear();
            }
            Event::Start(Tag::TableCell) => {
                current_cell_text.clear();
            }
            Event::End(TagEnd::TableCell) => {
                current_table_row.push(current_cell_text.trim().to_string());
                current_cell_text.clear();
            }
            
            // Images
            Event::Start(Tag::Image { link_type: _, dest_url, title, id: _ }) => {
                let url = dest_url.to_string();
                let title_str = title.to_string();
                result.blocks.push(ContentBlock::Image {
                    url,
                    alt: String::new(), // Will be filled by text event
                    title: if title_str.is_empty() { None } else { Some(title_str) },
                });
            }
            
            // Horizontal rule
            Event::Rule => {
                result.blocks.push(ContentBlock::HorizontalRule);
            }
            
            // Text content
            Event::Text(text) => {
                if in_code_block {
                    code_content.push_str(&text);
                } else if in_table {
                    current_cell_text.push_str(&text);
                } else {
                    current_text.push_str(&text);
                }
            }
            Event::Code(code) => {
                current_text.push('`');
                current_text.push_str(&code);
                current_text.push('`');
            }
            Event::SoftBreak | Event::HardBreak => {
                if in_code_block {
                    code_content.push('\n');
                } else if !in_table {
                    current_text.push(' ');
                }
            }
            
            // Skip other events
            _ => {}
        }
    }
    
    result
}

/// Parse markdown and extract only tables (for XLSX export)
pub fn extract_tables_from_markdown(content: &str) -> Vec<TableData> {
    let parsed = parse_markdown(content);
    parsed
        .blocks
        .into_iter()
        .filter_map(|block| {
            if let ContentBlock::Table(table) = block {
                Some(table)
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heading() {
        let content = "# Hello World\n\nSome text.";
        let parsed = parse_markdown(content);
        
        assert_eq!(parsed.title, Some("Hello World".to_string()));
        assert!(!parsed.blocks.is_empty());
        
        if let ContentBlock::Heading { level, text } = &parsed.blocks[0] {
            assert_eq!(*level, 1);
            assert_eq!(text, "Hello World");
        } else {
            panic!("Expected heading block");
        }
    }

    #[test]
    fn test_parse_list() {
        let content = "- Item 1\n- Item 2\n- Item 3";
        let parsed = parse_markdown(content);
        
        if let ContentBlock::UnorderedList { items } = &parsed.blocks[0] {
            assert_eq!(items.len(), 3);
            assert_eq!(items[0], "Item 1");
        } else {
            panic!("Expected unordered list block");
        }
    }

    #[test]
    fn test_parse_table() {
        let content = "| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |";
        let parsed = parse_markdown(content);
        
        // Find the table in the blocks
        let table = parsed.blocks.iter().find_map(|block| {
            if let ContentBlock::Table(t) = block { Some(t) } else { None }
        }).expect("Should have a table");
        
        assert!(table.headers.is_some());
        assert_eq!(table.headers.as_ref().unwrap().len(), 2);
        assert_eq!(table.rows.len(), 1);
    }

    #[test]
    fn test_parse_code_block() {
        let content = "```rust\nfn main() {}\n```";
        let parsed = parse_markdown(content);
        
        if let ContentBlock::CodeBlock { language, code } = &parsed.blocks[0] {
            assert_eq!(language.as_deref(), Some("rust"));
            assert_eq!(code, "fn main() {}");
        } else {
            panic!("Expected code block");
        }
    }

    #[test]
    fn test_parse_task_list() {
        let content = "- [x] Done\n- [ ] Todo";
        let parsed = parse_markdown(content);
        
        if let ContentBlock::TaskList { items } = &parsed.blocks[0] {
            assert_eq!(items.len(), 2);
            assert!(items[0].checked);
            assert!(!items[1].checked);
        } else {
            panic!("Expected task list block");
        }
    }

}

