//! XLSX Generator
//!
//! Generates Excel spreadsheets from markdown tables using rust_xlsxwriter.

use std::path::Path;

use rust_xlsxwriter::{Format, Workbook, Worksheet};

use super::markdown_parser::{extract_tables_from_markdown, TableData};
use super::{ExportError, ExportResult, XlsxExportOptions};

/// Generate an XLSX from table data
pub fn generate_xlsx(
    tables: &[TableData],
    title: &str,
    output_path: &Path,
    options: &XlsxExportOptions,
) -> Result<ExportResult, ExportError> {
    let mut workbook = Workbook::new();

    // Create formats
    let header_format = Format::new()
        .set_bold()
        .set_background_color(0xE0E0E0);

    let body_format = Format::new();

    // Add each table as a separate sheet
    for (i, table) in tables.iter().enumerate() {
        let sheet_name = if tables.len() == 1 {
            title.chars().take(31).collect::<String>() // Excel sheet name limit
        } else {
            format!("Table {}", i + 1)
        };

        let worksheet = workbook.add_worksheet();
        worksheet.set_name(&sheet_name)
            .map_err(|e| ExportError::XlsxError(e.to_string()))?;

        write_table_to_sheet(worksheet, table, options, &header_format, &body_format)?;
    }

    // If no tables, create an empty sheet with a message
    if tables.is_empty() {
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("Sheet1")
            .map_err(|e| ExportError::XlsxError(e.to_string()))?;
        worksheet.write_string(0, 0, "No table data found in the content.")
            .map_err(|e| ExportError::XlsxError(e.to_string()))?;
    }

    // Save the workbook
    workbook.save(output_path)
        .map_err(|e| ExportError::XlsxError(e.to_string()))?;

    // Get file size
    let metadata = std::fs::metadata(output_path)?;
    let file_size = metadata.len();

    let filename = output_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.xlsx".to_string());

    Ok(ExportResult {
        path: output_path.to_string_lossy().to_string(),
        filename: filename.clone(),
        file_size,
        markdown_link: format!("[{}](exports/{})", title, filename),
    })
}

/// Write a table to a worksheet
fn write_table_to_sheet(
    worksheet: &mut Worksheet,
    table: &TableData,
    options: &XlsxExportOptions,
    header_format: &Format,
    body_format: &Format,
) -> Result<(), ExportError> {
    let mut row_idx: u32 = 0;

    // Write headers if present and enabled
    if options.include_headers {
        if let Some(headers) = &table.headers {
            for (col_idx, header) in headers.iter().enumerate() {
                worksheet.write_string_with_format(row_idx, col_idx as u16, header, header_format)
                    .map_err(|e| ExportError::XlsxError(e.to_string()))?;
            }
            row_idx += 1;
        }
    }

    // Write data rows
    for data_row in &table.rows {
        for (col_idx, cell) in data_row.iter().enumerate() {
            // Try to parse as number first
            if let Ok(num) = cell.parse::<f64>() {
                worksheet.write_number_with_format(row_idx, col_idx as u16, num, body_format)
                    .map_err(|e| ExportError::XlsxError(e.to_string()))?;
            } else {
                worksheet.write_string_with_format(row_idx, col_idx as u16, cell, body_format)
                    .map_err(|e| ExportError::XlsxError(e.to_string()))?;
            }
        }
        row_idx += 1;
    }

    // Auto-fit columns if enabled
    if options.auto_fit_columns {
        let col_count = table.column_count();
        for col_idx in 0..col_count {
            // Calculate max width for this column
            let mut max_width: usize = 10; // minimum width

            if let Some(headers) = &table.headers {
                if let Some(header) = headers.get(col_idx) {
                    max_width = max_width.max(header.len());
                }
            }

            for row in &table.rows {
                if let Some(cell) = row.get(col_idx) {
                    max_width = max_width.max(cell.len());
                }
            }

            // Set column width (Excel uses character widths)
            let width = (max_width + 2).min(50) as f64;
            worksheet.set_column_width(col_idx as u16, width)
                .map_err(|e| ExportError::XlsxError(e.to_string()))?;
        }
    }

    Ok(())
}

/// Generate an XLSX from markdown content
pub fn generate_xlsx_from_markdown(
    content: &str,
    title: &str,
    output_path: &Path,
    options: &XlsxExportOptions,
) -> Result<ExportResult, ExportError> {
    let tables = extract_tables_from_markdown(content);
    generate_xlsx(&tables, title, output_path, options)
}

/// Generate an XLSX from a single table (for selection-based export)
pub fn generate_xlsx_from_selection(
    content: &str,
    title: &str,
    output_path: &Path,
    options: &XlsxExportOptions,
) -> Result<ExportResult, ExportError> {
    // Try to extract tables from the selection
    let tables = extract_tables_from_markdown(content);
    
    if tables.is_empty() {
        // If no markdown table found, try to parse as plain text table
        // (lines with | separators or tab-separated)
        let table = parse_plain_text_table(content);
        if table.is_empty() {
            return Err(ExportError::ParseError(
                "No table data found in selection".to_string()
            ));
        }
        generate_xlsx(&[table], title, output_path, options)
    } else {
        generate_xlsx(&tables, title, output_path, options)
    }
}

/// Parse a plain text table (| separated or tab separated)
fn parse_plain_text_table(content: &str) -> TableData {
    let mut table = TableData::new();
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();

    if lines.is_empty() {
        return table;
    }

    // Detect separator: pipe or tab
    let first_line = lines[0];
    let is_pipe_separated = first_line.contains('|');
    let is_tab_separated = first_line.contains('\t');

    for (i, line) in lines.iter().enumerate() {
        let cells: Vec<String> = if is_pipe_separated {
            line.split('|')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        } else if is_tab_separated {
            line.split('\t')
                .map(|s| s.trim().to_string())
                .collect()
        } else {
            // Try comma-separated
            line.split(',')
                .map(|s| s.trim().to_string())
                .collect()
        };

        if cells.is_empty() {
            continue;
        }

        // Skip markdown table separator lines (----)
        if cells.iter().all(|c| c.chars().all(|ch| ch == '-' || ch == ':')) {
            continue;
        }

        if i == 0 {
            table.headers = Some(cells);
        } else {
            table.rows.push(cells);
        }
    }

    table
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_xlsx_from_table() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.xlsx");

        let table = TableData {
            headers: Some(vec!["Name".to_string(), "Value".to_string()]),
            rows: vec![
                vec!["Item 1".to_string(), "100".to_string()],
                vec!["Item 2".to_string(), "200".to_string()],
            ],
        };

        let options = XlsxExportOptions::default();
        let result = generate_xlsx(&[table], "Test", &output_path, &options);

        assert!(result.is_ok());
        assert!(output_path.exists());
        
        let result = result.unwrap();
        assert!(result.file_size > 0);
    }

    #[test]
    fn test_generate_xlsx_from_markdown() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("md_test.xlsx");

        let markdown = r#"
| Name | Value |
|------|-------|
| A    | 1     |
| B    | 2     |
"#;

        let options = XlsxExportOptions::default();
        let result = generate_xlsx_from_markdown(markdown, "MD Test", &output_path, &options);

        assert!(result.is_ok());
        assert!(output_path.exists());
    }

    #[test]
    fn test_parse_plain_text_table() {
        let content = "Name\tValue\nItem 1\t100\nItem 2\t200";
        let table = parse_plain_text_table(content);

        assert!(table.headers.is_some());
        assert_eq!(table.rows.len(), 2);
    }

    #[test]
    fn test_generate_xlsx_with_numbers() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("numbers.xlsx");

        let table = TableData {
            headers: Some(vec!["Item".to_string(), "Price".to_string(), "Quantity".to_string()]),
            rows: vec![
                vec!["Widget".to_string(), "9.99".to_string(), "5".to_string()],
                vec!["Gadget".to_string(), "19.99".to_string(), "3".to_string()],
            ],
        };

        let options = XlsxExportOptions::default();
        let result = generate_xlsx(&[table], "Numbers Test", &output_path, &options);

        assert!(result.is_ok());
    }
}

