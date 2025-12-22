//! Export Agent
//!
//! An AI agent that intelligently exports notes to various document formats
//! (PDF, DOCX, PPTX) by understanding content context and using document
//! builder tools to create properly structured documents.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::agent::{
    run_agent_with_events, AgentError, CancellationToken, ToolDefinition, ToolExecutor,
};
use super::config::AIProvider;

/// Export-specific progress event
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ExportProgress {
    #[serde(rename = "started")]
    Started {
        title: String,
        format: String,
        #[serde(rename = "noteCount")]
        note_count: usize,
    },
    #[serde(rename = "readingNote")]
    ReadingNote {
        #[serde(rename = "noteId")]
        note_id: String,
    },
    #[serde(rename = "creatingDocument")]
    CreatingDocument { title: String },
    #[serde(rename = "addingContent")]
    AddingContent {
        #[serde(rename = "sectionType")]
        section_type: String,
        preview: String,
    },
    #[serde(rename = "addingTable")]
    AddingTable { rows: usize, cols: usize },
    #[serde(rename = "saving")]
    Saving,
    #[serde(rename = "completed")]
    Completed { filename: String, path: String },
}
use crate::db::connection::DbPool;
use crate::db::exports::ExportFormat;
use crate::exports::{
    add_document_section, add_document_table, create_document, save_document, SectionType,
};

// ============================================================================
// Format-Specific System Prompts
// ============================================================================

/// System prompt for PDF export
pub const PDF_EXPORT_SYSTEM_PROMPT: &str = r##"You are an export agent for Inkling, a note-taking app. Your job is to create well-structured PDF documents from note content.

CRITICAL: You MUST call save_document at the end. The export is not complete until save_document is called.

=== PHASE 1: PLANNING ===
After reading the note content, create a mental outline of the document structure:
- Identify all headings and their hierarchy (H1, H2, H3, etc.)
- Count the number of paragraphs, lists, tables, and code blocks
- Note the order of content from top to bottom
- Estimate how many add_section calls you'll need

=== PHASE 2: EXECUTION ===
Follow this workflow EXACTLY:
1. Call read_note_content for each note ID provided
2. Call create_document with format="pdf" and the title
3. Process content TOP TO BOTTOM in order:
   - For each heading: add_section(section_type="heading", content="...", heading_level=N)
   - For each paragraph: add_section(section_type="paragraph", content="...")
   - For each bullet list: add_section(section_type="bullet_list", content="item1\nitem2\n...")
   - For each numbered list: add_section(section_type="numbered_list", content="item1\nitem2\n...")
   - For each table: add_table(headers=[...], rows=[[...], [...]])
   - For horizontal rules: add_section(section_type="horizontal_rule", content="")
4. ALWAYS call save_document at the end

=== PHASE 3: REFLECTION (do this periodically) ===
Every 10-15 sections, ask yourself:
- Have I covered all the content so far?
- Am I still following the original note structure?
- What sections remain to be added?
Continue until ALL content is processed.

SECTION TYPES (use exact strings):
- "heading": For headings (MUST include heading_level 1-6)
- "paragraph": For text paragraphs
- "bullet_list": For unordered lists (each item on separate line)
- "numbered_list": For ordered lists
- "code_block": For code snippets
- "quote": For blockquotes
- "horizontal_rule": For section separators

CRITICAL RULES:
1. NEVER skip or summarize content - export EVERYTHING from the note
2. Process content in the EXACT ORDER it appears in the note
3. Headings REQUIRE heading_level (1-6)
4. You MUST call save_document when finished - the export fails without it
5. If the note is long, you may need 50+ add_section calls - that's expected"##;

/// System prompt for DOCX export
pub const DOCX_EXPORT_SYSTEM_PROMPT: &str = r##"You are an export agent for Inkling, a note-taking app. Your job is to create well-structured Word documents from note content.

CRITICAL: You MUST call save_document at the end. The export is not complete until save_document is called.

=== PHASE 1: PLANNING ===
After reading the note content, create a mental outline:
- Identify all headings and their hierarchy (H1, H2, H3, etc.)
- Count the number of paragraphs, lists, tables, and code blocks
- Note the order of content from top to bottom
- Estimate how many add_section calls you'll need

=== PHASE 2: EXECUTION ===
Follow this workflow EXACTLY:
1. Call read_note_content for each note ID provided
2. Call create_document with format="docx" and the title
3. Process content TOP TO BOTTOM in order:
   - For each heading: add_section(section_type="heading", content="...", heading_level=N)
   - For each paragraph: add_section(section_type="paragraph", content="...")
   - For each bullet list: add_section(section_type="bullet_list", content="item1\nitem2\n...")
   - For each numbered list: add_section(section_type="numbered_list", content="item1\nitem2\n...")
   - For each table: add_table(headers=[...], rows=[[...], [...]])
   - For horizontal rules: add_section(section_type="horizontal_rule", content="")
4. ALWAYS call save_document at the end

=== PHASE 3: REFLECTION (do this periodically) ===
Every 10-15 sections, ask yourself:
- Have I covered all the content so far?
- Am I still following the original note structure?
- What sections remain to be added?
Continue until ALL content is processed.

SECTION TYPES (use exact strings):
- "heading": For headings (MUST include heading_level 1-6) - becomes Word heading style
- "paragraph": For text paragraphs
- "bullet_list": For unordered lists
- "numbered_list": For ordered lists
- "code_block": For code snippets (monospace font)
- "quote": For blockquotes
- "horizontal_rule": For section separators

CRITICAL RULES:
1. NEVER skip or summarize content - export EVERYTHING from the note
2. Process content in the EXACT ORDER it appears in the note
3. Headings REQUIRE heading_level (1-6)
4. You MUST call save_document when finished - the export fails without it
5. If the note is long, you may need 50+ add_section calls - that's expected
6. Add horizontal_rule between different notes if exporting multiple"##;

/// System prompt for PPTX export
pub const PPTX_EXPORT_SYSTEM_PROMPT: &str = r###"You are an export agent for Inkling, a note-taking app. Your job is to create well-structured PowerPoint presentations from note content.

CRITICAL: You MUST call save_document at the end. The export is not complete until save_document is called.

=== PHASE 1: PLANNING ===
After reading the note content, plan the slide structure:
- Identify main sections that will become individual slides
- Each H1/H2 heading = new slide
- Count how many slides you'll need
- Plan content distribution (max 5-7 bullets per slide)

=== PHASE 2: EXECUTION ===
Follow this workflow EXACTLY:
1. Call read_note_content for each note ID provided
2. Call create_document with format="pptx" and the title
3. Create slides systematically:
   - add_section(section_type="heading", content="Title", heading_level=1) <- Title slide
   - For each major section: add_section(section_type="heading", content="...", heading_level=2) <- New slide
   - Add content: add_section(section_type="bullet_list", content="point1\npoint2\n...")
   - For tables: add_table(headers=[...], rows=[[...], [...]])
4. ALWAYS call save_document at the end

=== PHASE 3: REFLECTION (do this periodically) ===
Every 5-10 sections, ask yourself:
- Have I covered all major topics?
- Is each slide focused (not too many bullets)?
- What content remains to be added?
Continue until ALL content is processed.

SLIDE STRUCTURE:
- "heading" with level 1 or 2: Creates a NEW slide with this title
- "heading" with level 3+: Becomes a sub-point on current slide
- "paragraph": Becomes a bullet point on current slide
- "bullet_list": Each line becomes a bullet on current slide
- "numbered_list": Numbered points on current slide
- "code_block": Code shown on current slide (keep brief)
- "quote": Quoted text on current slide

CRITICAL RULES:
1. NEVER skip content - include ALL information from the note
2. Create new slides for major sections (H1/H2 headings)
3. Headings REQUIRE heading_level (1-6)
4. You MUST call save_document when finished
5. Keep slides focused: max 5-7 bullet points per slide
6. For long notes, you may need 20+ slides - that's expected"###;

/// Result of running the export agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAgentResult {
    /// The final response from the agent
    pub final_response: String,
    /// Export information if successful
    pub export_id: Option<String>,
    pub export_path: Option<String>,
    pub export_filename: Option<String>,
    /// Number of iterations
    pub iterations: usize,
    /// Tools that were used
    pub tools_used: Vec<String>,
}

/// The export agent that implements ToolExecutor and ProgressTracker
pub struct ExportAgent {
    pool: DbPool,
    app_handle: AppHandle,
    /// Current document ID being built
    pub current_document_id: std::sync::Mutex<Option<String>>,
    /// Export result after save
    export_result: std::sync::Mutex<Option<crate::db::exports::Export>>,
    /// Progress tracking: sections added
    sections_added: std::sync::atomic::AtomicUsize,
    /// Progress tracking: tables added  
    tables_added: std::sync::atomic::AtomicUsize,
    /// Progress tracking: notes processed
    notes_processed: std::sync::atomic::AtomicUsize,
    /// Last section type added (for summary)
    last_section_type: std::sync::Mutex<Option<String>>,
}

impl ExportAgent {
    /// Create a new export agent
    pub fn new(pool: DbPool, app_handle: AppHandle) -> Self {
        Self {
            pool,
            app_handle,
            current_document_id: std::sync::Mutex::new(None),
            export_result: std::sync::Mutex::new(None),
            sections_added: std::sync::atomic::AtomicUsize::new(0),
            tables_added: std::sync::atomic::AtomicUsize::new(0),
            notes_processed: std::sync::atomic::AtomicUsize::new(0),
            last_section_type: std::sync::Mutex::new(None),
        }
    }
    
    /// Increment sections added counter
    fn increment_sections(&self) {
        self.sections_added.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
    
    /// Increment tables added counter
    fn increment_tables(&self) {
        self.tables_added.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
    
    /// Increment notes processed counter
    fn increment_notes(&self) {
        self.notes_processed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
    
    /// Set the last section type
    fn set_last_section_type(&self, section_type: &str) {
        if let Ok(mut guard) = self.last_section_type.lock() {
            *guard = Some(section_type.to_string());
        }
    }
    
    /// Emit a progress event
    fn emit_progress(&self, progress: ExportProgress) {
        if let Err(e) = self.app_handle.emit("export-agent-progress", &progress) {
            log::warn!("[ExportAgent] Failed to emit progress event: {}", e);
        }
    }

    /// Get the export result if available
    pub fn get_export_result(&self) -> Option<crate::db::exports::Export> {
        self.export_result.lock().ok().and_then(|guard| guard.clone())
    }

    /// Execute read_note_content tool
    fn execute_read_note_content(&self, args: &Value) -> Result<String, String> {
        let note_id = args
            .get("note_id")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'note_id' argument")?;

        self.emit_progress(ExportProgress::ReadingNote { 
            note_id: note_id.to_string() 
        });

        let conn = self.pool.get().map_err(|e| e.to_string())?;
        let note = crate::db::notes::get_note(&conn, note_id)
            .map_err(|e| format!("Failed to get note: {}", e))?
            .ok_or_else(|| format!("Note not found: {}", note_id))?;

        // Get markdown content - prefer content_html converted to markdown, then raw content
        let content = if let Some(html) = &note.content_html {
            crate::exports::html_to_markdown::html_to_markdown(html)
        } else {
            note.content.clone().unwrap_or_default()
        };

        // Track progress
        self.increment_notes();

        Ok(serde_json::json!({
            "note_id": note.id,
            "title": note.title,
            "content": content,
            "created_at": note.created_at,
            "updated_at": note.updated_at
        })
        .to_string())
    }

    /// Execute create_document tool
    fn execute_create_document(&self, args: &Value) -> Result<String, String> {
        let title = args
            .get("title")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'title' argument")?;

        let format_str = args
            .get("format")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'format' argument")?;

        self.emit_progress(ExportProgress::CreatingDocument { 
            title: title.to_string() 
        });

        let format = match format_str.to_lowercase().as_str() {
            "pdf" => ExportFormat::Pdf,
            "docx" => ExportFormat::Docx,
            "xlsx" => ExportFormat::Xlsx,
            "pptx" => ExportFormat::Pptx,
            _ => return Err(format!("Unsupported format: {}", format_str)),
        };

        let document_id = create_document(title.to_string(), format)?;

        // Store the document ID
        if let Ok(mut guard) = self.current_document_id.lock() {
            *guard = Some(document_id.clone());
        }

        Ok(serde_json::json!({
            "success": true,
            "document_id": document_id,
            "message": format!("Created document draft. Use add_section and add_table to add content, then save_document to generate the file.")
        })
        .to_string())
    }

    /// Execute add_section tool
    fn execute_add_section(&self, args: &Value) -> Result<String, String> {
        // Get document_id from args, or fall back to stored current_document_id
        let document_id = args
            .get("document_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                self.current_document_id.lock().ok().and_then(|guard| guard.clone())
            })
            .ok_or("No document_id provided and no current document exists. Call create_document first.")?;

        let section_type_str = args
            .get("section_type")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'section_type' argument")?;

        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'content' argument")?;

        let heading_level = args
            .get("heading_level")
            .and_then(|v| v.as_u64())
            .map(|v| v as u8);

        let section_type = match section_type_str.to_lowercase().as_str() {
            "heading" => SectionType::Heading,
            "paragraph" => SectionType::Paragraph,
            "bullet_list" => SectionType::BulletList,
            "numbered_list" => SectionType::NumberedList,
            "code_block" => SectionType::CodeBlock,
            "quote" => SectionType::Quote,
            "horizontal_rule" => SectionType::HorizontalRule,
            "image" => SectionType::Image,
            "table" => SectionType::Table,
            _ => return Err(format!("Unknown section type: {}", section_type_str)),
        };

        // Emit progress with a preview
        let preview = if content.len() > 50 {
            format!("{}...", &content[..50])
        } else {
            content.to_string()
        };
        self.emit_progress(ExportProgress::AddingContent { 
            section_type: section_type_str.to_string(),
            preview: preview.clone(),
        });

        add_document_section(&document_id, section_type, content.to_string(), heading_level)?;

        // Track progress
        self.increment_sections();
        self.set_last_section_type(section_type_str);

        Ok(serde_json::json!({
            "success": true,
            "message": format!("Added {} section", section_type_str)
        })
        .to_string())
    }

    /// Execute add_table tool
    fn execute_add_table(&self, args: &Value) -> Result<String, String> {
        // Get document_id from args, or fall back to stored current_document_id
        let document_id = args
            .get("document_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                self.current_document_id.lock().ok().and_then(|guard| guard.clone())
            })
            .ok_or("No document_id provided and no current document exists. Call create_document first.")?;

        let headers = args
            .get("headers")
            .and_then(|v| v.as_array())
            .ok_or("Missing 'headers' argument")?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect::<Vec<_>>();

        let rows = args
            .get("rows")
            .and_then(|v| v.as_array())
            .ok_or("Missing 'rows' argument")?
            .iter()
            .filter_map(|v| {
                v.as_array().map(|row| {
                    row.iter()
                        .filter_map(|cell| cell.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>();

        self.emit_progress(ExportProgress::AddingTable { 
            rows: rows.len(),
            cols: headers.len(),
        });

        add_document_table(&document_id, headers.clone(), rows.clone())?;

        // Track progress
        self.increment_tables();

        Ok(serde_json::json!({
            "success": true,
            "message": format!("Added table with {} columns and {} rows", headers.len(), rows.len())
        })
        .to_string())
    }

    /// Execute save_document tool
    fn execute_save_document(&self, args: &Value) -> Result<String, String> {
        // Get document_id from args, or fall back to stored current_document_id
        let document_id = args
            .get("document_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                self.current_document_id.lock().ok().and_then(|guard| guard.clone())
            })
            .ok_or("No document_id provided and no current document exists. Call create_document first.")?;

        self.emit_progress(ExportProgress::Saving);

        let export = save_document(&document_id)?;

        // Store the result
        if let Ok(mut guard) = self.export_result.lock() {
            *guard = Some(export.clone());
        }

        self.emit_progress(ExportProgress::Completed { 
            filename: export.filename.clone(),
            path: export.path.clone(),
        });

        Ok(serde_json::json!({
            "success": true,
            "export": {
                "id": export.id,
                "filename": export.filename,
                "title": export.title,
                "format": export.format.to_string(),
                "path": export.path,
                "file_size": export.file_size
            },
            "message": format!("Document saved successfully as {}", export.filename)
        })
        .to_string())
    }
}

#[async_trait]
impl ToolExecutor for ExportAgent {
    async fn execute(&self, name: &str, args: Value) -> Result<String, String> {
        let result = match name {
            "read_note_content" => self.execute_read_note_content(&args),
            "create_document" => self.execute_create_document(&args),
            "add_section" => self.execute_add_section(&args),
            "add_table" => self.execute_add_table(&args),
            "save_document" => self.execute_save_document(&args),
            // Handle common AI mistakes - redirect to correct tools
            "add_bullet_list" | "add_numbered_list" | "add_paragraph" | "add_heading" | "add_code_block" | "add_quote" => {
                // Extract section_type from the tool name
                let section_type = match name {
                    "add_bullet_list" => "bullet_list",
                    "add_numbered_list" => "numbered_list",
                    "add_paragraph" => "paragraph",
                    "add_heading" => "heading",
                    "add_code_block" => "code_block",
                    "add_quote" => "quote",
                    _ => "paragraph",
                };
                // Merge section_type into args
                let mut modified_args = args.clone();
                if let Some(obj) = modified_args.as_object_mut() {
                    obj.insert("section_type".to_string(), serde_json::Value::String(section_type.to_string()));
                }
                self.execute_add_section(&modified_args)
            }
            _ => {
                log::error!("[ExportAgent] Unknown tool: {}", name);
                Err(format!("Unknown tool: {}. Available tools: read_note_content, create_document, add_section, add_table, save_document", name))
            }
        };
        
        if let Err(ref e) = result {
            log::error!("[ExportAgent] Tool {} failed: {}", name, e);
        }
        
        result
    }
}

/// Get tool definitions for the export agent
pub fn get_export_agent_tools() -> Vec<ToolDefinition> {
    vec![
        // read_note_content tool
        ToolDefinition::function(
            "read_note_content",
            "Read the content of a note by its ID. Returns the note title and markdown content.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "The ID of the note to read"
                    }
                },
                "required": ["note_id"]
            }),
        ),
        // create_document tool
        ToolDefinition::function(
            "create_document",
            "Create a new document draft. Returns a document_id to use with other tools.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title of the document"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["pdf", "docx", "pptx"],
                        "description": "The output format"
                    }
                },
                "required": ["title", "format"]
            }),
        ),
        // add_section tool
        ToolDefinition::function(
            "add_section",
            "Add a section to the current document. Call multiple times to build the document structure.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "section_type": {
                        "type": "string",
                        "enum": ["heading", "paragraph", "bullet_list", "numbered_list", "code_block", "quote", "horizontal_rule"],
                        "description": "The type of section to add"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content. For lists, put each item on a separate line."
                    },
                    "heading_level": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 6,
                        "description": "Heading level (1-6). Required only for heading sections."
                    }
                },
                "required": ["section_type", "content"]
            }),
        ),
        // add_table tool
        ToolDefinition::function(
            "add_table",
            "Add a table to the current document.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "headers": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Column headers"
                    },
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "description": "Table rows (array of arrays)"
                    }
                },
                "required": ["headers", "rows"]
            }),
        ),
        // save_document tool
        ToolDefinition::function(
            "save_document",
            "Save the current document to a file. Call this when you're done adding all content.",
            serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        ),
    ]
}

/// Get the appropriate system prompt for the export format
pub fn get_system_prompt_for_format(format: &ExportFormat) -> &'static str {
    match format {
        ExportFormat::Pdf => PDF_EXPORT_SYSTEM_PROMPT,
        ExportFormat::Docx => DOCX_EXPORT_SYSTEM_PROMPT,
        ExportFormat::Pptx => PPTX_EXPORT_SYSTEM_PROMPT,
        ExportFormat::Xlsx => PDF_EXPORT_SYSTEM_PROMPT, // XLSX uses PDF prompt as fallback
    }
}

/// Run the export agent
///
/// # Arguments
/// * `app_handle` - Tauri app handle for emitting events
/// * `execution_id` - Unique ID for this execution
/// * `pool` - Database connection pool
/// * `provider` - AI provider configuration
/// * `model` - Model identifier
/// * `note_ids` - IDs of notes to export
/// * `title` - Document title
/// * `format` - Export format (pdf, docx, pptx)
/// * `custom_instructions` - Optional custom instructions from user
/// * `cancellation_token` - Optional cancellation token
pub async fn run_export_agent(
    app_handle: &AppHandle,
    execution_id: &str,
    pool: &DbPool,
    provider: &AIProvider,
    model: &str,
    note_ids: &[String],
    title: &str,
    format: ExportFormat,
    custom_instructions: Option<&str>,
    cancellation_token: Option<&CancellationToken>,
) -> Result<ExportAgentResult, AgentError> {
    let agent = ExportAgent::new(pool.clone(), app_handle.clone());
    
    // Emit started event
    agent.emit_progress(ExportProgress::Started {
        title: title.to_string(),
        format: format!("{:?}", format),
        note_count: note_ids.len(),
    });
    let tools = get_export_agent_tools();
    let system_prompt = get_system_prompt_for_format(&format);

    // Build the initial message with note IDs and title
    let note_list = note_ids
        .iter()
        .map(|id| format!("- {}", id))
        .collect::<Vec<_>>()
        .join("\n");

    let format_name = match format {
        ExportFormat::Pdf => "PDF",
        ExportFormat::Docx => "Word document",
        ExportFormat::Pptx => "PowerPoint presentation",
        ExportFormat::Xlsx => "Excel spreadsheet",
    };

    let initial_message = if let Some(instructions) = custom_instructions {
        format!(
            r#"Create a {} titled "{}" from the following note(s):

NOTE IDS TO EXPORT:
{}

ADDITIONAL INSTRUCTIONS: {}

REMEMBER:
1. First, read ALL note content using read_note_content
2. Plan your document structure (identify all sections, paragraphs, lists, tables)
3. Create the document with create_document
4. Add EVERY piece of content in order using add_section (you may need 50+ calls for long notes)
5. ALWAYS call save_document at the end

Start by reading the note content, then systematically add all content to the document."#,
            format_name, title, note_list, instructions
        )
    } else {
        format!(
            r#"Create a {} titled "{}" from the following note(s):

NOTE IDS TO EXPORT:
{}

YOUR TASK:
1. First, read ALL note content using read_note_content
2. Plan your document structure (identify all sections, paragraphs, lists, tables)
3. Create the document with create_document
4. Add EVERY piece of content in order using add_section (you may need 50+ calls for long notes)
5. ALWAYS call save_document at the end

Start by reading the note content. After reading, identify all the content blocks (headings, paragraphs, lists, tables, etc.) and then systematically add each one to the document. Do not skip or summarize any content."#,
            format_name, title, note_list
        )
    };

    let result = run_agent_with_events(
        app_handle,
        execution_id,
        "Export",
        provider,
        model,
        system_prompt,
        &initial_message,
        tools,
        &agent,
        500, // Max 500 iterations for large documents
        cancellation_token,
    )
    .await;
    
    if let Err(ref e) = result {
        log::error!("[ExportAgent] Agent failed: {}", e);
    }
    
    let result = result?;

    // Extract unique tool names used
    let tools_used: Vec<String> = result
        .tool_calls_made
        .iter()
        .map(|tc| tc.tool_name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Get export result if available
    let mut export = agent.get_export_result();
    
    // If agent didn't call save_document but we have a document, auto-save it
    if export.is_none() {
        if let Ok(guard) = agent.current_document_id.lock() {
            if let Some(ref doc_id) = *guard {
                match save_document(doc_id) {
                    Ok(saved_export) => {
                        export = Some(saved_export);
                    }
                    Err(e) => {
                        log::error!("[ExportAgent] Auto-save failed: {}", e);
                    }
                }
            }
        }
    }
    
    if export.is_none() {
        log::error!("[ExportAgent] Export failed - no document was saved");
    }

    Ok(ExportAgentResult {
        final_response: result.final_response,
        export_id: export.as_ref().map(|e| e.id.clone()),
        export_path: export.as_ref().map(|e| e.path.clone()),
        export_filename: export.as_ref().map(|e| e.filename.clone()),
        iterations: result.iterations,
        tools_used,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_export_agent_tools() {
        let tools = get_export_agent_tools();
        assert_eq!(tools.len(), 5);

        let tool_names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        assert!(tool_names.contains(&"read_note_content"));
        assert!(tool_names.contains(&"create_document"));
        assert!(tool_names.contains(&"add_section"));
        assert!(tool_names.contains(&"add_table"));
        assert!(tool_names.contains(&"save_document"));
    }

    #[test]
    fn test_system_prompts_exist() {
        assert!(!PDF_EXPORT_SYSTEM_PROMPT.is_empty());
        assert!(!DOCX_EXPORT_SYSTEM_PROMPT.is_empty());
        assert!(!PPTX_EXPORT_SYSTEM_PROMPT.is_empty());
    }

    #[test]
    fn test_get_system_prompt_for_format() {
        assert!(get_system_prompt_for_format(&ExportFormat::Pdf).contains("PDF"));
        assert!(get_system_prompt_for_format(&ExportFormat::Docx).contains("Word"));
        assert!(get_system_prompt_for_format(&ExportFormat::Pptx).contains("PowerPoint"));
    }
}

