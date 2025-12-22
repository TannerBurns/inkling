//! Export Commands
//!
//! Tauri commands for managing document exports (listing, deleting, opening).

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::ai::export_agent::{run_export_agent, ExportAgentResult};
use crate::ai::{load_ai_config, CancellationToken};
use crate::db::exports::{self, Export, ExportFormat};
use crate::exports::{
    docx_generator, generate_dated_filename, html_to_markdown, markdown_parser, pdf_generator, pptx_generator, xlsx_generator,
    DocxExportOptions, ExportResult, PdfExportOptions, XlsxExportOptions,
};
use crate::vault::config::get_exports_dir;
use crate::{db, AgentExecutions, AppPool};

/// Get all exports
#[tauri::command]
pub fn list_exports(pool: State<AppPool>) -> Result<Vec<Export>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    exports::get_all_exports(&conn).map_err(|e| e.to_string())
}

/// Get exports by format
#[tauri::command]
pub fn list_exports_by_format(pool: State<AppPool>, format: String) -> Result<Vec<Export>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let format = ExportFormat::from_str(&format)
        .ok_or_else(|| format!("Invalid format: {}", format))?;

    exports::get_exports_by_format(&conn, &format).map_err(|e| e.to_string())
}

/// Get a single export by ID
#[tauri::command]
pub fn get_export(pool: State<AppPool>, id: String) -> Result<Option<Export>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    exports::get_export(&conn, &id).map_err(|e| e.to_string())
}

/// Delete an export (both file and database record)
#[tauri::command]
pub fn delete_export(pool: State<AppPool>, id: String) -> Result<bool, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Get the export to find the file path
    if let Some(export) = exports::get_export(&conn, &id).map_err(|e| e.to_string())? {
        // Delete the file if it exists
        let file_path = Path::new(&export.path);
        if file_path.exists() {
            fs::remove_file(file_path).map_err(|e| e.to_string())?;
        }

        // Delete the database record
        exports::delete_export(&conn, &id).map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}

/// Open an export file in the default system application
#[tauri::command]
pub fn open_export(id: String, pool: State<AppPool>) -> Result<(), String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let export = exports::get_export(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Export not found: {}", id))?;

    let file_path = Path::new(&export.path);
    if !file_path.exists() {
        return Err(format!("Export file not found: {}", export.path));
    }

    // Open with default application
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&export.path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &export.path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&export.path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Get the exports folder path
#[tauri::command]
pub fn get_exports_path() -> Result<String, String> {
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    Ok(exports_dir.to_string_lossy().to_string())
}

/// Reveal the exports folder in the file manager
#[tauri::command]
pub fn reveal_exports_folder() -> Result<(), String> {
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    
    if !exports_dir.exists() {
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&exports_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&exports_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&exports_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Export a single note to PDF
#[tauri::command]
pub fn export_note_to_pdf(
    pool: State<AppPool>,
    note_id: String,
    title: Option<String>,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Get the note
    let note = db::notes::get_note(&conn, &note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note not found: {}", note_id))?;

    let doc_title = title.unwrap_or_else(|| note.title.clone());
    
    // Convert HTML to markdown if available, otherwise use plain content
    let content = if let Some(html) = &note.content_html {
        html_to_markdown::html_to_markdown(html)
    } else {
        note.content.clone().unwrap_or_default()
    };

    // Parse markdown
    let parsed = markdown_parser::parse_markdown(&content);

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&doc_title, "pdf");
    let output_path = exports_dir.join(&filename);

    // Generate PDF
    let options = PdfExportOptions::default();
    let result = pdf_generator::generate_pdf(&parsed, &doc_title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: doc_title,
        format: ExportFormat::Pdf,
        source_note_ids: vec![note_id],
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export a single note to DOCX
#[tauri::command]
pub fn export_note_to_docx(
    pool: State<AppPool>,
    note_id: String,
    title: Option<String>,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Get the note
    let note = db::notes::get_note(&conn, &note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note not found: {}", note_id))?;

    let doc_title = title.unwrap_or_else(|| note.title.clone());
    
    // Convert HTML to markdown if available
    let content = if let Some(html) = &note.content_html {
        html_to_markdown::html_to_markdown(html)
    } else {
        note.content.clone().unwrap_or_default()
    };

    // Parse markdown
    let parsed = markdown_parser::parse_markdown(&content);

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&doc_title, "docx");
    let output_path = exports_dir.join(&filename);

    // Generate DOCX
    let options = DocxExportOptions::default();
    let result = docx_generator::generate_docx(&parsed, &doc_title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: doc_title,
        format: ExportFormat::Docx,
        source_note_ids: vec![note_id],
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export multiple notes to PDF
#[tauri::command]
pub fn export_notes_to_pdf(
    pool: State<AppPool>,
    note_ids: Vec<String>,
    title: String,
    page_break_between_notes: Option<bool>,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    if note_ids.is_empty() {
        return Err("No notes selected".to_string());
    }

    // Get notes content (convert HTML to markdown)
    let mut notes_data: Vec<(String, String)> = Vec::new();
    for note_id in &note_ids {
        let note = db::notes::get_note(&conn, note_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        let content = if let Some(html) = &note.content_html {
            html_to_markdown::html_to_markdown(html)
        } else {
            note.content.clone().unwrap_or_default()
        };
        notes_data.push((note.title, content));
    }

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&title, "pdf");
    let output_path = exports_dir.join(&filename);

    // Generate PDF
    let options = PdfExportOptions {
        page_break_between_notes: page_break_between_notes.unwrap_or(true),
        ..Default::default()
    };
    let result = pdf_generator::generate_pdf_from_notes(&notes_data, &title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.clone(),
        format: ExportFormat::Pdf,
        source_note_ids: note_ids,
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export multiple notes to DOCX
#[tauri::command]
pub fn export_notes_to_docx(
    pool: State<AppPool>,
    note_ids: Vec<String>,
    title: String,
    page_break_between_notes: Option<bool>,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    if note_ids.is_empty() {
        return Err("No notes selected".to_string());
    }

    // Get notes content (convert HTML to markdown)
    let mut notes_data: Vec<(String, String)> = Vec::new();
    for note_id in &note_ids {
        let note = db::notes::get_note(&conn, note_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        let content = if let Some(html) = &note.content_html {
            html_to_markdown::html_to_markdown(html)
        } else {
            note.content.clone().unwrap_or_default()
        };
        notes_data.push((note.title, content));
    }

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&title, "docx");
    let output_path = exports_dir.join(&filename);

    // Generate DOCX
    let options = DocxExportOptions {
        page_break_between_notes: page_break_between_notes.unwrap_or(true),
        ..Default::default()
    };
    let result = docx_generator::generate_docx_from_notes(&notes_data, &title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.clone(),
        format: ExportFormat::Docx,
        source_note_ids: note_ids,
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export content to XLSX (for table/selection export)
#[tauri::command]
pub fn export_content_to_xlsx(
    pool: State<AppPool>,
    content: String,
    title: String,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&title, "xlsx");
    let output_path = exports_dir.join(&filename);

    // Generate XLSX
    let options = XlsxExportOptions::default();
    let result = xlsx_generator::generate_xlsx_from_selection(&content, &title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.clone(),
        format: ExportFormat::Xlsx,
        source_note_ids: vec![],
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export multiple notes to PPTX (PowerPoint)
#[tauri::command]
pub fn export_notes_to_pptx(
    pool: State<AppPool>,
    note_ids: Vec<String>,
    title: String,
) -> Result<ExportResult, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    if note_ids.is_empty() {
        return Err("No notes selected".to_string());
    }

    // Combine all notes content (convert HTML to markdown)
    let mut combined_content = String::new();
    for note_id in &note_ids {
        let note = db::notes::get_note(&conn, note_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        
        // Add note title as a heading
        combined_content.push_str(&format!("# {}\n\n", note.title));
        
        let content = if let Some(html) = &note.content_html {
            html_to_markdown::html_to_markdown(html)
        } else {
            note.content.clone().unwrap_or_default()
        };
        combined_content.push_str(&content);
        combined_content.push_str("\n\n");
    }

    // Parse combined markdown
    let parsed = markdown_parser::parse_markdown(&combined_content);

    // Generate filename and path
    let exports_dir = get_exports_dir().map_err(|e| e.to_string())?;
    let filename = generate_dated_filename(&title, "pptx");
    let output_path = exports_dir.join(&filename);

    // Generate PPTX
    let options = pptx_generator::PptxExportOptions::default();
    let result = pptx_generator::generate_pptx(&parsed, &title, &output_path, &options)
        .map_err(|e| e.to_string())?;

    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.clone(),
        format: ExportFormat::Pptx,
        source_note_ids: note_ids,
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };

    exports::create_export(&conn, export_input).map_err(|e| e.to_string())?;

    Ok(result)
}

/// Input for the AI export agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunExportAgentInput {
    pub note_ids: Vec<String>,
    pub title: String,
    pub format: String,
    pub custom_instructions: Option<String>,
}

/// Run the AI export agent to create a document
/// 
/// This uses AI to intelligently structure the document based on note content,
/// rather than doing a direct mechanical conversion.
/// Falls back to mechanical export if the agent fails.
#[tauri::command]
pub async fn run_export_agent_cmd(
    app_handle: AppHandle,
    pool: State<'_, AppPool>,
    executions: State<'_, AgentExecutions>,
    input: RunExportAgentInput,
) -> Result<ExportAgentResult, String> {
    use uuid::Uuid;
    
    // Get the pool
    let db_pool = {
        let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
        pool_guard.clone().ok_or_else(|| "Database not initialized".to_string())?
    };
    
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    // Parse format
    let format = ExportFormat::from_str(&input.format)
        .ok_or_else(|| format!("Invalid format: {}", input.format))?;

    // Get AI config and find provider
    let ai_config_result = load_ai_config(&conn);
    
    // Check if we should use AI or fall back to mechanical
    let use_ai = match &ai_config_result {
        Ok(config) => {
            let has_provider = if let Some(ref default_id) = config.default_provider {
                config.providers.iter().any(|p| &p.id == default_id && p.is_enabled)
            } else {
                config.providers.iter().any(|p| p.is_enabled)
            };
            has_provider
        }
        Err(_) => false,
    };
    
    if !use_ai {
        return run_mechanical_export(&db_pool, &input.note_ids, &input.title, &format);
    }
    
    let ai_config = ai_config_result.unwrap();
    
    // Find the default provider or first enabled provider
    let provider = if let Some(ref default_id) = ai_config.default_provider {
        ai_config
            .providers
            .iter()
            .find(|p| &p.id == default_id && p.is_enabled)
    } else {
        ai_config.providers.iter().find(|p| p.is_enabled)
    };

    let provider = provider.ok_or_else(|| {
        "No AI provider configured. Please set up a provider in Settings.".to_string()
    })?.clone();

    // Get the selected model or first available
    let model = provider
        .selected_model
        .clone()
        .or_else(|| provider.models.first().cloned())
        .ok_or_else(|| format!("No model available for provider {}", provider.name))?;

    // Generate execution ID
    let execution_id = Uuid::new_v4().to_string();
    
    // Create cancellation token
    let cancellation_token = CancellationToken::new();
    
    // Store for potential cancellation
    {
        let mut execs = executions.0.write().map_err(|e| e.to_string())?;
        execs.insert(execution_id.clone(), cancellation_token.clone());
    }

    // Run the export agent
    let result = run_export_agent(
        &app_handle,
        &execution_id,
        &db_pool,
        &provider,
        &model,
        &input.note_ids,
        &input.title,
        format.clone(),
        input.custom_instructions.as_deref(),
        Some(&cancellation_token),
    )
    .await;

    // Remove from active executions
    {
        if let Ok(mut execs) = executions.0.write() {
            execs.remove(&execution_id);
        }
    }

    match result {
        Ok(agent_result) => Ok(agent_result),
        Err(e) => {
            log::error!("[ExportAgent] AI export failed: {}", e);
            
            // Fall back to mechanical export
            match run_mechanical_export(&db_pool, &input.note_ids, &input.title, &format) {
                Ok(fallback_result) => Ok(fallback_result),
                Err(fallback_err) => {
                    log::error!("[ExportAgent] Mechanical fallback also failed: {}", fallback_err);
                    Err(format!(
                        "AI export failed: {}. Mechanical fallback also failed: {}",
                        e, fallback_err
                    ))
                }
            }
        }
    }
}

/// Run mechanical (non-AI) export as a fallback
fn run_mechanical_export(
    pool: &crate::db::connection::DbPool,
    note_ids: &[String],
    title: &str,
    format: &ExportFormat,
) -> Result<ExportAgentResult, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Get exports directory
    let exports_dir = get_exports_dir()
        .map_err(|e| format!("Failed to get exports directory: {}", e))?;
    
    // Collect and parse content from all notes
    let mut combined_content = String::new();
    
    for note_id in note_ids {
        let note = db::notes::get_note(&conn, note_id)
            .map_err(|e| format!("Failed to get note {}: {}", note_id, e))?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;
        
        // Get markdown content
        let markdown = if let Some(ref html) = note.content_html {
            html_to_markdown::html_to_markdown(html)
        } else {
            note.content.clone().unwrap_or_default()
        };
        
        if !combined_content.is_empty() {
            combined_content.push_str("\n\n---\n\n");
        }
        combined_content.push_str(&format!("# {}\n\n", note.title));
        combined_content.push_str(&markdown);
    }
    
    // Parse markdown
    let parsed = markdown_parser::parse_markdown(&combined_content);
    
    // Generate file based on format
    let (result, db_format) = match format {
        ExportFormat::Pdf => {
            let filename = generate_dated_filename(title, "pdf");
            let output_path = exports_dir.join(&filename);
            let options = PdfExportOptions::default();
            let result = pdf_generator::generate_pdf(&parsed, title, &output_path, &options)
                .map_err(|e| e.to_string())?;
            (result, ExportFormat::Pdf)
        }
        ExportFormat::Docx => {
            let filename = generate_dated_filename(title, "docx");
            let output_path = exports_dir.join(&filename);
            let options = DocxExportOptions::default();
            let result = docx_generator::generate_docx(&parsed, title, &output_path, &options)
                .map_err(|e| e.to_string())?;
            (result, ExportFormat::Docx)
        }
        ExportFormat::Pptx => {
            let filename = generate_dated_filename(title, "pptx");
            let output_path = exports_dir.join(&filename);
            let options = pptx_generator::PptxExportOptions::default();
            let result = pptx_generator::generate_pptx(&parsed, title, &output_path, &options)
                .map_err(|e| e.to_string())?;
            (result, ExportFormat::Pptx)
        }
        ExportFormat::Xlsx => {
            let filename = generate_dated_filename(title, "xlsx");
            let output_path = exports_dir.join(&filename);
            let options = XlsxExportOptions::default();
            let result = xlsx_generator::generate_xlsx_from_markdown(&combined_content, title, &output_path, &options)
                .map_err(|e| e.to_string())?;
            (result, ExportFormat::Xlsx)
        }
    };
    
    // Record in database
    let export_input = exports::CreateExportInput {
        filename: result.filename.clone(),
        title: title.to_string(),
        format: db_format,
        source_note_ids: note_ids.to_vec(),
        file_size: Some(result.file_size as i64),
        path: result.path.clone(),
    };
    
    let export = exports::create_export(&conn, export_input)
        .map_err(|e| format!("Failed to record export: {}", e))?;
    
    Ok(ExportAgentResult {
        final_response: format!("Exported {} notes to {}", note_ids.len(), result.filename),
        export_id: Some(export.id),
        export_path: Some(result.path),
        export_filename: Some(result.filename),
        iterations: 0,
        tools_used: vec!["mechanical_export".to_string()],
    })
}

