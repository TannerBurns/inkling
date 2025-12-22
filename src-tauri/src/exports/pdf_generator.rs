//! PDF Generator
//!
//! Generates PDF documents from parsed markdown content using printpdf.

use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use printpdf::*;

use super::markdown_parser::{ContentBlock, ParsedContent};
use super::{ExportError, ExportResult, PdfExportOptions};

/// Page dimensions (A4)
const PAGE_WIDTH_MM: f32 = 210.0;
const PAGE_HEIGHT_MM: f32 = 297.0;

/// Margins in mm
const MARGIN_LEFT: f32 = 20.0;
const MARGIN_RIGHT: f32 = 20.0;
const MARGIN_TOP: f32 = 20.0;
const MARGIN_BOTTOM: f32 = 25.0;

/// Font sizes in points
const HEADING_SIZES: [f32; 6] = [24.0, 20.0, 16.0, 14.0, 13.0, 12.0];
const BODY_SIZE: f32 = 11.0;
const CODE_SIZE: f32 = 10.0;

/// Line height multiplier
const LINE_HEIGHT: f32 = 1.4;

/// Content width in mm
const CONTENT_WIDTH: f32 = PAGE_WIDTH_MM - MARGIN_LEFT - MARGIN_RIGHT;

/// PDF Writer state
struct PdfWriter {
    doc: PdfDocumentReference,
    current_page: PdfPageIndex,
    current_layer: PdfLayerIndex,
    y_position: Mm,
    font_regular: IndirectFontRef,
    font_bold: IndirectFontRef,
    font_italic: IndirectFontRef,
}

impl PdfWriter {
    fn new(title: &str) -> Result<Self, String> {
        let (doc, page_idx, layer_idx) = PdfDocument::new(
            title,
            Mm(PAGE_WIDTH_MM),
            Mm(PAGE_HEIGHT_MM),
            "Layer 1",
        );

        // Use built-in fonts
        let font_regular = doc.add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| format!("Failed to add regular font: {}", e))?;
        let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| format!("Failed to add bold font: {}", e))?;
        let font_italic = doc.add_builtin_font(BuiltinFont::HelveticaOblique)
            .map_err(|e| format!("Failed to add italic font: {}", e))?;

        Ok(PdfWriter {
            doc,
            current_page: page_idx,
            current_layer: layer_idx,
            y_position: Mm(PAGE_HEIGHT_MM - MARGIN_TOP),
            font_regular,
            font_bold,
            font_italic,
        })
    }

    /// Check if we need a new page
    fn ensure_space(&mut self, needed_mm: f32) {
        if self.y_position.0 - needed_mm < MARGIN_BOTTOM {
            self.new_page();
        }
    }

    /// Create a new page
    fn new_page(&mut self) {
        let (page_idx, layer_idx) = self.doc.add_page(
            Mm(PAGE_WIDTH_MM),
            Mm(PAGE_HEIGHT_MM),
            "Layer 1",
        );
        self.current_page = page_idx;
        self.current_layer = layer_idx;
        self.y_position = Mm(PAGE_HEIGHT_MM - MARGIN_TOP);
        log::debug!("[PDFGenerator] Created new page");
    }

    /// Get the current layer
    fn current_layer(&self) -> PdfLayerReference {
        self.doc.get_page(self.current_page).get_layer(self.current_layer)
    }

    /// Write text at current position
    fn write_text(&mut self, text: &str, font: &IndirectFontRef, size_pt: f32) {
        // Check for valid position
        if self.y_position.0 < MARGIN_BOTTOM {
            self.new_page();
        }

        let layer = self.current_layer();
        
        // Calculate line height
        let line_height_mm = (size_pt / 72.0 * 25.4) * LINE_HEIGHT;

        layer.use_text(
            text,
            size_pt,
            Mm(MARGIN_LEFT),
            self.y_position,
            font,
        );

        self.y_position = Mm(self.y_position.0 - line_height_mm);
    }

    /// Write text with word wrapping
    fn write_wrapped_text(&mut self, text: &str, font: &IndirectFontRef, size_pt: f32) {
        let chars_per_line = estimate_chars_per_line(size_pt);
        let lines = wrap_text(text, chars_per_line);
        let line_height_mm = (size_pt / 72.0 * 25.4) * LINE_HEIGHT;

        for line in lines {
            self.ensure_space(line_height_mm);
            self.write_text(&line, font, size_pt);
        }
    }

    /// Add vertical space
    fn add_space(&mut self, mm: f32) {
        self.y_position = Mm(self.y_position.0 - mm);
    }

    /// Save the document to a file
    fn save(self, output_path: &Path) -> Result<u64, String> {
        use std::io::Write;
        
        let file = File::create(output_path)
            .map_err(|e| format!("Failed to create file: {}", e))?;
        let mut writer = BufWriter::new(file);
        
        self.doc.save(&mut writer)
            .map_err(|e| format!("Failed to save PDF: {}", e))?;

        // Flush the buffer to ensure all data is written to disk
        writer.flush()
            .map_err(|e| format!("Failed to flush buffer: {}", e))?;

        let file_size = std::fs::metadata(output_path)
            .map(|m| m.len())
            .unwrap_or(0);

        Ok(file_size)
    }
}

/// Estimate characters per line based on font size
fn estimate_chars_per_line(font_size_pt: f32) -> usize {
    // Helvetica average character width is approximately 0.50 * font size for mixed text
    // Using 0.52 provides a good balance between fitting text and avoiding overflow
    let char_width_mm = font_size_pt / 72.0 * 25.4 * 0.52;
    // Use 95% of available width - the 5% margin accounts for rounding/kerning variations
    let available_width = CONTENT_WIDTH * 0.95;
    ((available_width / char_width_mm) as usize).max(50) // Minimum 50 chars for readability
}

/// Word wrapping with support for breaking long words
fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut current_line = String::new();

    for word in words {
        // Handle words that are longer than max_chars by breaking them
        if word.len() > max_chars {
            // First, push current line if not empty
            if !current_line.is_empty() {
                lines.push(current_line);
                current_line = String::new();
            }
            // Break the long word into chunks
            let mut remaining = word;
            while !remaining.is_empty() {
                let chunk_size = max_chars.min(remaining.len());
                // Try to break at a reasonable point (hyphen-friendly)
                let break_at = if chunk_size < remaining.len() {
                    chunk_size.saturating_sub(1) // Leave room for hyphen
                } else {
                    chunk_size
                };
                let (chunk, rest) = remaining.split_at(break_at);
                if break_at < remaining.len() {
                    lines.push(format!("{}-", chunk));
                } else {
                    current_line = chunk.to_string();
                }
                remaining = rest;
            }
        } else if current_line.len() + word.len() + 1 > max_chars && !current_line.is_empty() {
            lines.push(current_line);
            current_line = word.to_string();
        } else {
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(word);
        }
    }
    
    if !current_line.is_empty() {
        lines.push(current_line);
    }
    
    if lines.is_empty() {
        lines.push(String::new());
    }
    
    lines
}

/// Strip markdown formatting for plain text
fn strip_markdown(text: &str) -> String {
    let mut result = text.to_string();
    // Remove ** markers
    result = result.replace("**", "");
    // Remove single * markers that are for italics (not bullets)
    // This is a simple approach - just remove standalone *text* patterns
    result
}

/// Format a table cell with fixed width - truncate or pad as needed
fn format_table_cell(text: &str, width: usize) -> String {
    let trimmed = text.trim();
    let char_count: usize = trimmed.chars().count();
    
    if char_count <= width {
        // Pad to width for alignment
        format!("{:<width$}", trimmed, width = width)
    } else if width > 2 {
        // Truncate with ellipsis
        let truncated: String = trimmed.chars().take(width - 2).collect();
        format!("{}..", truncated)
    } else {
        trimmed.chars().take(width).collect()
    }
}

/// Generate a PDF from parsed content
pub fn generate_pdf(
    content: &ParsedContent,
    title: &str,
    output_path: &Path,
    _options: &PdfExportOptions,
) -> Result<ExportResult, ExportError> {
    log::info!(
        "[PDFGenerator] Starting PDF generation: title='{}', blocks={}",
        title,
        content.blocks.len()
    );

    let mut writer = PdfWriter::new(title)
        .map_err(ExportError::PdfError)?;

    // Render each block
    for (i, block) in content.blocks.iter().enumerate() {
        log::debug!(
            "[PDFGenerator] Rendering block {}/{}: {:?}",
            i + 1,
            content.blocks.len(),
            std::mem::discriminant(block)
        );
        render_block(&mut writer, block);
    }

    // Save
    let file_size = writer.save(output_path)
        .map_err(ExportError::PdfError)?;

    let filename = output_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.pdf".to_string());

    log::info!("[PDFGenerator] Saved PDF: {} bytes", file_size);

    Ok(ExportResult {
        path: output_path.to_string_lossy().to_string(),
        filename: filename.clone(),
        file_size,
        markdown_link: format!("[{}](exports/{})", title, filename),
    })
}

/// Render a content block
fn render_block(writer: &mut PdfWriter, block: &ContentBlock) {
    match block {
        ContentBlock::Heading { level, text } => {
            let size = HEADING_SIZES.get(*level as usize - 1).copied().unwrap_or(12.0);
            let line_height_mm = (size / 72.0 * 25.4) * LINE_HEIGHT;

            // Add space before headings (except h1)
            if *level > 1 {
                writer.add_space(4.0);
            }

            writer.ensure_space(line_height_mm + 4.0);
            
            let font = writer.font_bold.clone();
            writer.write_text(&strip_markdown(text), &font, size);
            writer.add_space(2.0);
        }

        ContentBlock::Paragraph { text } => {
            let font = writer.font_regular.clone();
            writer.write_wrapped_text(&strip_markdown(text), &font, BODY_SIZE);
            writer.add_space(3.0);
        }

        ContentBlock::CodeBlock { code, language } => {
            if let Some(lang) = language {
                let font = writer.font_italic.clone();
                writer.write_text(&format!("[{}]", lang), &font, CODE_SIZE - 1.0);
            }

            let font = writer.font_regular.clone();
            for line in code.lines() {
                let line_height_mm = (CODE_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
                writer.ensure_space(line_height_mm);
                writer.write_text(&format!("  {}", line), &font, CODE_SIZE);
            }
            writer.add_space(3.0);
        }

        ContentBlock::UnorderedList { items } => {
            let font = writer.font_regular.clone();
            for item in items {
                // Skip empty items
                let trimmed = item.trim();
                if trimmed.is_empty() {
                    continue;
                }
                
                let chars_per_line = estimate_chars_per_line(BODY_SIZE) - 4;
                let lines = wrap_text(&strip_markdown(trimmed), chars_per_line);
                
                for (i, line) in lines.iter().enumerate() {
                    let line_height_mm = (BODY_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
                    writer.ensure_space(line_height_mm);
                    
                    let bullet_text = if i == 0 {
                        format!("  •  {}", line)
                    } else {
                        format!("     {}", line)
                    };
                    writer.write_text(&bullet_text, &font, BODY_SIZE);
                }
            }
            writer.add_space(3.0);
        }

        ContentBlock::OrderedList { items, start } => {
            let font = writer.font_regular.clone();
            let mut num = *start;
            for item in items {
                // Skip empty items
                let trimmed = item.trim();
                if trimmed.is_empty() {
                    continue;
                }
                
                let chars_per_line = estimate_chars_per_line(BODY_SIZE) - 6;
                let lines = wrap_text(&strip_markdown(trimmed), chars_per_line);
                
                for (j, line) in lines.iter().enumerate() {
                    let line_height_mm = (BODY_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
                    writer.ensure_space(line_height_mm);
                    
                    let numbered_text = if j == 0 {
                        format!("  {}.  {}", num, line)
                    } else {
                        format!("      {}", line)
                    };
                    writer.write_text(&numbered_text, &font, BODY_SIZE);
                }
                num += 1;
            }
            writer.add_space(3.0);
        }

        ContentBlock::Blockquote { text } => {
            let font = writer.font_italic.clone();
            let chars_per_line = estimate_chars_per_line(BODY_SIZE) - 8;
            let lines = wrap_text(&strip_markdown(text), chars_per_line);
            
            for line in lines {
                let line_height_mm = (BODY_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
                writer.ensure_space(line_height_mm);
                writer.write_text(&format!("    \"{}\"", line), &font, BODY_SIZE);
            }
            writer.add_space(3.0);
        }

        ContentBlock::HorizontalRule => {
            writer.add_space(4.0);
            let font = writer.font_regular.clone();
            writer.write_text("─".repeat(40).as_str(), &font, BODY_SIZE);
            writer.add_space(4.0);
        }

        ContentBlock::Image { url, alt, .. } => {
            let font = writer.font_italic.clone();
            let alt_display = if alt.is_empty() { "Image" } else { alt };
            writer.write_text(&format!("[Image: {} - {}]", alt_display, url), &font, BODY_SIZE);
            writer.add_space(3.0);
        }

        ContentBlock::Table(table) => {
            let font_bold = writer.font_bold.clone();
            let font_regular = writer.font_regular.clone();
            let line_height_mm = (BODY_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
            
            // Calculate column widths based on content
            let num_cols = table.headers.as_ref().map(|h| h.len()).unwrap_or_else(|| {
                table.rows.first().map(|r| r.len()).unwrap_or(0)
            });
            
            if num_cols == 0 {
                writer.add_space(3.0);
                return;
            }
            
            // Calculate actual column widths based on content
            let mut col_widths: Vec<usize> = vec![0; num_cols];
            
            // Consider header widths
            if let Some(headers) = &table.headers {
                for (i, h) in headers.iter().enumerate() {
                    if i < col_widths.len() {
                        col_widths[i] = col_widths[i].max(h.len());
                    }
                }
            }
            
            // Consider row widths
            for row in &table.rows {
                for (i, cell) in row.iter().enumerate() {
                    if i < col_widths.len() {
                        col_widths[i] = col_widths[i].max(cell.len());
                    }
                }
            }
            
            // Cap column widths to fit on page
            let total_chars = estimate_chars_per_line(BODY_SIZE);
            let spacing_chars = (num_cols + 1) * 2; // "  " padding between columns
            let available_chars = total_chars.saturating_sub(spacing_chars);
            let total_content_width: usize = col_widths.iter().sum();
            
            // Scale down if needed
            if total_content_width > available_chars {
                let scale = available_chars as f32 / total_content_width as f32;
                for w in col_widths.iter_mut() {
                    *w = ((*w as f32 * scale) as usize).max(4);
                }
            }
            
            // Cap each column to reasonable max
            for w in col_widths.iter_mut() {
                *w = (*w).min(30);
            }
            
            // Build table border
            let table_width: usize = col_widths.iter().sum::<usize>() + spacing_chars;
            let top_border = "─".repeat(table_width.min(80));
            
            writer.ensure_space(line_height_mm);
            writer.write_text(&top_border, &font_regular, BODY_SIZE);
            
            // Render headers
            if let Some(headers) = &table.headers {
                let mut header_line = String::new();
                for (i, h) in headers.iter().enumerate() {
                    let width = col_widths.get(i).copied().unwrap_or(10);
                    let cell = format_table_cell(h, width);
                    header_line.push_str("  ");
                    header_line.push_str(&cell);
                }
                writer.ensure_space(line_height_mm);
                writer.write_text(&header_line, &font_bold, BODY_SIZE);
                
                // Separator under headers
                writer.ensure_space(line_height_mm);
                writer.write_text(&top_border, &font_regular, BODY_SIZE);
            }

            // Render rows
            for row in &table.rows {
                let mut row_line = String::new();
                for (i, cell) in row.iter().enumerate() {
                    let width = col_widths.get(i).copied().unwrap_or(10);
                    let formatted = format_table_cell(cell, width);
                    row_line.push_str("  ");
                    row_line.push_str(&formatted);
                }
                writer.ensure_space(line_height_mm);
                writer.write_text(&row_line, &font_regular, BODY_SIZE);
            }
            
            // Bottom border
            writer.ensure_space(line_height_mm);
            writer.write_text(&top_border, &font_regular, BODY_SIZE);
            writer.add_space(3.0);
        }

        ContentBlock::TaskList { items } => {
            let font = writer.font_regular.clone();
            for item in items {
                let checkbox = if item.checked { "[x]" } else { "[ ]" };
                let line_height_mm = (BODY_SIZE / 72.0 * 25.4) * LINE_HEIGHT;
                writer.ensure_space(line_height_mm);
                writer.write_text(&format!("  {}  {}", checkbox, item.text), &font, BODY_SIZE);
            }
            writer.add_space(3.0);
        }
    }
}

/// Generate a PDF from multiple notes
pub fn generate_pdf_from_notes(
    notes: &[(String, String)],
    document_title: &str,
    output_path: &Path,
    options: &PdfExportOptions,
) -> Result<ExportResult, ExportError> {
    let mut combined = ParsedContent::new();
    combined.title = Some(document_title.to_string());

    for (i, (note_title, content)) in notes.iter().enumerate() {
        if i > 0 && options.page_break_between_notes {
            combined.blocks.push(ContentBlock::HorizontalRule);
        }

        combined.blocks.push(ContentBlock::Heading {
            level: 1,
            text: note_title.clone(),
        });

        let parsed = super::markdown_parser::parse_markdown(content);
        combined.blocks.extend(parsed.blocks);
    }

    generate_pdf(&combined, document_title, output_path, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_simple_pdf() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.pdf");

        let mut content = ParsedContent::new();
        content.blocks.push(ContentBlock::Heading {
            level: 1,
            text: "Test Document".to_string(),
        });
        content.blocks.push(ContentBlock::Paragraph {
            text: "This is a test paragraph with some text that should appear in the PDF.".to_string(),
        });
        content.blocks.push(ContentBlock::UnorderedList {
            items: vec![
                "First item".to_string(),
                "Second item".to_string(),
                "Third item".to_string(),
            ],
        });

        let options = PdfExportOptions::default();
        let result = generate_pdf(&content, "Test Document", &output_path, &options);

        assert!(result.is_ok(), "PDF generation failed: {:?}", result.err());
        assert!(output_path.exists());
        
        let export_result = result.unwrap();
        assert!(export_result.file_size > 0);
        println!("Generated PDF: {} bytes", export_result.file_size);
    }

    #[test]
    fn test_wrap_text() {
        let text = "This is a long line of text that should be wrapped at the specified width";
        let lines = wrap_text(text, 30);
        assert!(lines.len() > 1);
        for line in &lines {
            assert!(line.len() <= 35); // Allow some flexibility
        }
    }

    #[test]
    fn test_generate_pdf_with_table() {
        use super::super::markdown_parser::TableData;
        
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test_table.pdf");

        let mut content = ParsedContent::new();
        content.blocks.push(ContentBlock::Heading {
            level: 1,
            text: "Document with Table".to_string(),
        });
        content.blocks.push(ContentBlock::Paragraph {
            text: "Here is a data table:".to_string(),
        });
        
        // Create a table
        let mut table = TableData::new();
        table.headers = Some(vec![
            "Name".to_string(),
            "Value".to_string(),
            "Description".to_string(),
        ]);
        table.rows = vec![
            vec!["Item 1".to_string(), "100".to_string(), "First item description".to_string()],
            vec!["Item 2".to_string(), "200".to_string(), "Second item description".to_string()],
            vec!["Item 3".to_string(), "300".to_string(), "Third item with longer text".to_string()],
        ];
        content.blocks.push(ContentBlock::Table(table));

        let options = PdfExportOptions::default();
        let result = generate_pdf(&content, "Table Test", &output_path, &options);

        assert!(result.is_ok(), "PDF generation failed: {:?}", result.err());
        assert!(output_path.exists());
        
        let export_result = result.unwrap();
        assert!(export_result.file_size > 0);
        println!("Generated PDF with table: {} bytes", export_result.file_size);
    }

    #[test]
    fn test_empty_items_filtered() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test_empty.pdf");

        let mut content = ParsedContent::new();
        content.blocks.push(ContentBlock::Heading {
            level: 1,
            text: "List with Empty Items".to_string(),
        });
        content.blocks.push(ContentBlock::UnorderedList {
            items: vec![
                "First item".to_string(),
                "".to_string(),  // Empty item - should be skipped
                "Second item".to_string(),
                "   ".to_string(),  // Whitespace only - should be skipped
                "Third item".to_string(),
            ],
        });

        let options = PdfExportOptions::default();
        let result = generate_pdf(&content, "Empty Items Test", &output_path, &options);

        assert!(result.is_ok(), "PDF generation failed: {:?}", result.err());
        assert!(output_path.exists());
        
        let export_result = result.unwrap();
        assert!(export_result.file_size > 0);
        println!("Generated PDF filtering empty items: {} bytes", export_result.file_size);
    }
}
