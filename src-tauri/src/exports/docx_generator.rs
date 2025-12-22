//! DOCX Generator
//!
//! Generates Word documents from parsed markdown content using docx-rs.

use std::fs::File;
use std::path::Path;

use docx_rs::*;

use super::markdown_parser::{ContentBlock, ParsedContent};
use super::{DocxExportOptions, ExportError, ExportResult};

/// Heading sizes in half-points (Word uses half-points for font size)
const HEADING_SIZES: [usize; 6] = [48, 40, 32, 28, 26, 24]; // 24pt, 20pt, 16pt, 14pt, 13pt, 12pt
const BODY_SIZE: usize = 22; // 11pt
const CODE_SIZE: usize = 20; // 10pt

/// Generate a DOCX from parsed content
pub fn generate_docx(
    content: &ParsedContent,
    title: &str,
    output_path: &Path,
    _options: &DocxExportOptions,
) -> Result<ExportResult, ExportError> {
    let mut docx = Docx::new();

    // Add title if present
    if let Some(doc_title) = &content.title {
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(
                    Run::new()
                        .add_text(doc_title)
                        .size(HEADING_SIZES[0])
                        .bold()
                )
                .style("Heading1")
        );
    }

    // Render content blocks
    for block in &content.blocks {
        docx = render_block(docx, block)?;
    }

    // Write to file
    let file = File::create(output_path)?;
    docx.build()
        .pack(file)
        .map_err(|e| ExportError::DocxError(e.to_string()))?;

    // Get file size
    let metadata = std::fs::metadata(output_path)?;
    let file_size = metadata.len();

    let filename = output_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.docx".to_string());

    Ok(ExportResult {
        path: output_path.to_string_lossy().to_string(),
        filename: filename.clone(),
        file_size,
        markdown_link: format!("[{}](exports/{})", title, filename),
    })
}

/// Render a content block to the DOCX document
fn render_block(mut docx: Docx, block: &ContentBlock) -> Result<Docx, ExportError> {
    match block {
        ContentBlock::Heading { level, text } => {
            let size = HEADING_SIZES.get(*level as usize - 1).copied().unwrap_or(24);
            let style = format!("Heading{}", level);
            
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(
                        Run::new()
                            .add_text(text)
                            .size(size)
                            .bold()
                    )
                    .style(&style)
            );
        }

        ContentBlock::Paragraph { text } => {
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(
                        Run::new()
                            .add_text(text)
                            .size(BODY_SIZE)
                    )
            );
        }

        ContentBlock::CodeBlock { code, language } => {
            // Add language label if present
            if let Some(lang) = language {
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(
                            Run::new()
                                .add_text(lang)
                                .size(CODE_SIZE)
                                .italic()
                        )
                );
            }

            // Add code lines with monospace styling
            for line in code.lines() {
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(
                            Run::new()
                                .add_text(format!("  {}", line))
                                .size(CODE_SIZE)
                                .fonts(RunFonts::new().ascii("Courier New"))
                        )
                        .indent(Some(720), None, None, None) // 0.5 inch indent
                );
            }
        }

        ContentBlock::UnorderedList { items } => {
            for item in items {
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(
                            Run::new()
                                .add_text(format!("• {}", item))
                                .size(BODY_SIZE)
                        )
                        .indent(Some(720), None, None, None)
                );
            }
        }

        ContentBlock::OrderedList { items, start } => {
            for (i, item) in items.iter().enumerate() {
                let num = start + i as u64;
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(
                            Run::new()
                                .add_text(format!("{}. {}", num, item))
                                .size(BODY_SIZE)
                        )
                        .indent(Some(720), None, None, None)
                );
            }
        }

        ContentBlock::Blockquote { text } => {
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(
                        Run::new()
                            .add_text(format!("\"{}\"", text))
                            .size(BODY_SIZE)
                            .italic()
                    )
                    .indent(Some(720), None, None, None)
            );
        }

        ContentBlock::HorizontalRule => {
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(
                        Run::new()
                            .add_text("─".repeat(50))
                    )
                    .align(AlignmentType::Center)
            );
        }

        ContentBlock::Image { url, alt, .. } => {
            // Add placeholder text for images
            let alt_display = if alt.is_empty() { "Image" } else { alt };
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(
                        Run::new()
                            .add_text(format!("[Image: {} - {}]", alt_display, url))
                            .size(BODY_SIZE)
                            .italic()
                    )
            );
        }

        ContentBlock::Table(table) => {
            let col_count = table.column_count();
            if col_count == 0 {
                return Ok(docx);
            }

            // Create table rows
            let mut rows: Vec<TableRow> = vec![];

            // Add header row if present
            if let Some(headers) = &table.headers {
                let mut header_cells: Vec<TableCell> = vec![];
                for header in headers {
                    header_cells.push(
                        TableCell::new()
                            .add_paragraph(
                                Paragraph::new()
                                    .add_run(
                                        Run::new()
                                            .add_text(header)
                                            .size(BODY_SIZE)
                                            .bold()
                                    )
                            )
                    );
                }
                rows.push(TableRow::new(header_cells));
            }

            // Add data rows
            for data_row in &table.rows {
                let mut cells: Vec<TableCell> = vec![];
                for cell in data_row {
                    cells.push(
                        TableCell::new()
                            .add_paragraph(
                                Paragraph::new()
                                    .add_run(
                                        Run::new()
                                            .add_text(cell)
                                            .size(BODY_SIZE)
                                    )
                            )
                    );
                }
                rows.push(TableRow::new(cells));
            }

            docx = docx.add_table(Table::new(rows));
        }

        ContentBlock::TaskList { items } => {
            for item in items {
                let checkbox = if item.checked { "☑" } else { "☐" };
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(
                            Run::new()
                                .add_text(format!("{} {}", checkbox, item.text))
                                .size(BODY_SIZE)
                        )
                        .indent(Some(720), None, None, None)
                );
            }
        }
    }

    Ok(docx)
}

/// Generate a DOCX from multiple notes
pub fn generate_docx_from_notes(
    notes: &[(String, String)], // (title, content) pairs
    document_title: &str,
    output_path: &Path,
    options: &DocxExportOptions,
) -> Result<ExportResult, ExportError> {
    // Parse all notes and combine
    let mut combined = ParsedContent::new();
    combined.title = Some(document_title.to_string());

    for (i, (note_title, content)) in notes.iter().enumerate() {
        // Add page break between notes if requested
        if i > 0 && options.page_break_between_notes {
            combined.blocks.push(ContentBlock::HorizontalRule);
        }

        // Add note title as heading
        combined.blocks.push(ContentBlock::Heading {
            level: 1,
            text: note_title.clone(),
        });

        // Parse and add content
        let parsed = super::markdown_parser::parse_markdown(content);
        combined.blocks.extend(parsed.blocks);
    }

    generate_docx(&combined, document_title, output_path, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_simple_docx() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.docx");

        let mut content = ParsedContent::new();
        content.title = Some("Test Document".to_string());
        content.blocks.push(ContentBlock::Heading {
            level: 1,
            text: "Test Heading".to_string(),
        });
        content.blocks.push(ContentBlock::Paragraph {
            text: "This is a test paragraph.".to_string(),
        });

        let options = DocxExportOptions::default();
        let result = generate_docx(&content, "Test Document", &output_path, &options);

        assert!(result.is_ok());
        assert!(output_path.exists());
        
        let result = result.unwrap();
        assert!(result.file_size > 0);
        assert_eq!(result.filename, "test.docx");
    }

    #[test]
    fn test_generate_docx_with_table() {
        use super::super::markdown_parser::TableData;
        
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("table_test.docx");

        let mut content = ParsedContent::new();
        content.blocks.push(ContentBlock::Table(TableData {
            headers: Some(vec!["Col 1".to_string(), "Col 2".to_string()]),
            rows: vec![
                vec!["A1".to_string(), "B1".to_string()],
                vec!["A2".to_string(), "B2".to_string()],
            ],
        }));

        let options = DocxExportOptions::default();
        let result = generate_docx(&content, "Table Test", &output_path, &options);

        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}

