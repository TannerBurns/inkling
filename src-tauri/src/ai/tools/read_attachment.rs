//! Read Attachment Tool
//!
//! Extracts text content from various document formats including:
//! - PDF documents
//! - Excel spreadsheets (xlsx, xls)
//! - Word documents (docx)
//! - PowerPoint presentations (pptx)
//! - Plain text and code files

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use calamine::{open_workbook_auto, DataType, Reader};
use quick_xml::events::Event;
use quick_xml::reader::Reader as XmlReader;
use zip::ZipArchive;

/// Extract text from an attachment based on file type
pub fn extract_text_from_attachment(path: &str, max_chars: Option<usize>) -> Result<String, String> {
    let max_chars = max_chars.unwrap_or(50000);
    let path_obj = Path::new(path);

    // Get the file extension
    let extension = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    log::info!("[ReadAttachment] Extracting text from {} (ext: {})", path, extension);

    let content = match extension.as_str() {
        "pdf" => extract_pdf_text(path)?,
        "xlsx" | "xls" | "xlsm" | "xlsb" => extract_excel_text(path)?,
        "docx" => extract_docx_text(path)?,
        "pptx" => extract_pptx_text(path)?,
        // Text and code files - read directly
        "txt" | "md" | "markdown" | "rst" | "log" | "ini" | "cfg" | "conf" | "env" |
        "js" | "jsx" | "ts" | "tsx" | "py" | "rs" | "go" | "java" | "c" | "cpp" | "h" | "hpp" |
        "cs" | "rb" | "php" | "swift" | "kt" | "scala" | "css" | "scss" | "sass" | "less" |
        "html" | "htm" | "xml" | "json" | "yaml" | "yml" | "toml" | "sql" | "sh" | "bash" => {
            read_text_file(path)?
        }
        _ => {
            // Try to read as text anyway
            read_text_file(path).unwrap_or_else(|_| {
                format!("Unable to extract text from file type: .{}", extension)
            })
        }
    };

    // Truncate if necessary
    let result = if content.len() > max_chars {
        format!(
            "{}\n\n[Content truncated - {} of {} characters shown]",
            &content[..max_chars],
            max_chars,
            content.len()
        )
    } else {
        content
    };

    log::info!("[ReadAttachment] Extracted {} characters", result.len());
    Ok(result)
}

/// Extract text from a PDF file
fn extract_pdf_text(path: &str) -> Result<String, String> {
    pdf_extract::extract_text(path)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))
}

/// Extract text from an Excel file
fn extract_excel_text(path: &str) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let mut all_text = String::new();
    let sheet_names = workbook.sheet_names().to_vec();

    for sheet_name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            all_text.push_str(&format!("## Sheet: {}\n\n", sheet_name));

            for row in range.rows() {
                let row_text: Vec<String> = row
                    .iter()
                    .map(|cell| {
                        // Use get_string/get_float etc. or convert to string representation
                        if cell.is_empty() {
                            String::new()
                        } else if let Some(s) = cell.get_string() {
                            s.to_string()
                        } else if let Some(f) = cell.get_float() {
                            f.to_string()
                        } else if let Some(i) = cell.get_int() {
                            i.to_string()
                        } else if let Some(b) = cell.get_bool() {
                            b.to_string()
                        } else {
                            // Fallback: try to format as string
                            format!("{:?}", cell)
                        }
                    })
                    .collect();

                // Only add non-empty rows
                if row_text.iter().any(|s| !s.is_empty()) {
                    all_text.push_str(&format!("| {} |\n", row_text.join(" | ")));
                }
            }
            all_text.push('\n');
        }
    }

    if all_text.is_empty() {
        return Err("No text content found in Excel file".to_string());
    }

    Ok(all_text)
}

/// Extract text from a Word document (docx)
fn extract_docx_text(path: &str) -> Result<String, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open DOCX file: {}", e))?;
    
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("Failed to read DOCX archive: {}", e))?;

    // Word documents store content in word/document.xml
    let mut xml_content = String::new();
    
    if let Ok(mut document) = archive.by_name("word/document.xml") {
        document
            .read_to_string(&mut xml_content)
            .map_err(|e| format!("Failed to read document.xml: {}", e))?;
    } else {
        return Err("Could not find document.xml in DOCX file".to_string());
    }

    // Parse XML and extract text from <w:t> elements
    extract_text_from_ooxml(&xml_content, "w:t")
}

/// Extract text from a PowerPoint presentation (pptx)
fn extract_pptx_text(path: &str) -> Result<String, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open PPTX file: {}", e))?;
    
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("Failed to read PPTX archive: {}", e))?;

    let mut all_text = String::new();
    
    // PowerPoint stores slides in ppt/slides/slide1.xml, slide2.xml, etc.
    let mut slide_num = 1;
    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_num);
        
        match archive.by_name(&slide_path) {
            Ok(mut slide) => {
                let mut xml_content = String::new();
                if slide.read_to_string(&mut xml_content).is_ok() {
                    // Extract text from <a:t> elements (text elements in PPTX)
                    if let Ok(slide_text) = extract_text_from_ooxml(&xml_content, "a:t") {
                        if !slide_text.trim().is_empty() {
                            all_text.push_str(&format!("## Slide {}\n\n{}\n\n", slide_num, slide_text));
                        }
                    }
                }
                slide_num += 1;
            }
            Err(_) => break, // No more slides
        }
    }

    if all_text.is_empty() {
        return Err("No text content found in PowerPoint file".to_string());
    }

    Ok(all_text)
}

/// Extract text content from Office Open XML format
fn extract_text_from_ooxml(xml: &str, text_tag: &str) -> Result<String, String> {
    let mut reader = XmlReader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut text_content = Vec::new();
    let mut in_text_element = false;
    let mut current_paragraph = String::new();
    
    // Get the local name part of the tag (after the colon)
    let target_local_name = text_tag.split(':').last().unwrap_or(text_tag);

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let local_name_bytes = e.local_name();
                let local_name = String::from_utf8_lossy(local_name_bytes.as_ref()).to_string();
                if local_name == target_local_name {
                    in_text_element = true;
                }
            }
            Ok(Event::Text(e)) => {
                if in_text_element {
                    if let Ok(text) = e.unescape() {
                        current_paragraph.push_str(&text);
                    }
                }
            }
            Ok(Event::End(e)) => {
                let local_name_bytes = e.local_name();
                let local_name = String::from_utf8_lossy(local_name_bytes.as_ref()).to_string();
                if local_name == target_local_name {
                    in_text_element = false;
                }
                // Check for paragraph end
                if local_name == "p" && !current_paragraph.is_empty() {
                    text_content.push(current_paragraph.clone());
                    current_paragraph.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                log::warn!("[ReadAttachment] XML parsing error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Don't forget the last paragraph
    if !current_paragraph.is_empty() {
        text_content.push(current_paragraph);
    }

    Ok(text_content.join("\n"))
}

/// Read a plain text file
fn read_text_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read text file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_text_from_ooxml() {
        let xml = r#"<document><w:p><w:t>Hello</w:t><w:t> World</w:t></w:p></document>"#;
        let result = extract_text_from_ooxml(xml, "w:t").unwrap();
        assert!(result.contains("Hello"));
        assert!(result.contains("World"));
    }
}
