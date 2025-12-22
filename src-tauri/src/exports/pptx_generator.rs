//! PPTX Generator
//!
//! Generates PowerPoint presentations from markdown content using zip and quick-xml.
//! PPTX files are ZIP archives containing XML files following the OOXML standard.

use std::fs::File;
use std::io::{Write, Seek};
use std::path::Path;

use chrono::Utc;
use quick_xml::events::{Event, BytesDecl, BytesEnd, BytesStart};
use quick_xml::Writer;
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

use super::markdown_parser::{ParsedContent, ContentBlock};
use super::{ExportError, ExportResult, sanitize_filename};

/// Slide content representation
#[derive(Debug, Clone)]
pub struct Slide {
    pub title: String,
    pub content: Vec<String>,
}

impl Slide {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
            content: Vec::new(),
        }
    }

    pub fn add_bullet(&mut self, text: &str) {
        self.content.push(text.to_string());
    }
}

/// Options for PPTX export
#[derive(Debug, Clone, Default)]
pub struct PptxExportOptions {}

/// Generate a PPTX from parsed content
pub fn generate_pptx(
    content: &ParsedContent,
    title: &str,
    output_path: &Path,
    _options: &PptxExportOptions,
) -> Result<ExportResult, ExportError> {
    // Convert parsed content to slides
    let slides = content_to_slides(content, title);
    
    // Create the PPTX file
    let file = File::create(output_path)
        .map_err(|e| ExportError::PptxError(format!("Failed to create file: {}", e)))?;
    
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::<'_, ()>::default()
        .compression_method(CompressionMethod::Deflated);

    // Write [Content_Types].xml
    write_content_types(&mut zip, &options, slides.len())?;
    
    // Write _rels/.rels
    write_rels(&mut zip, &options)?;
    
    // Write docProps (required for valid PPTX)
    write_app_xml(&mut zip, &options, slides.len())?;
    write_core_xml(&mut zip, &options, title)?;
    
    // Write ppt/_rels/presentation.xml.rels
    write_presentation_rels(&mut zip, &options, slides.len())?;
    
    // Write ppt/presentation.xml
    write_presentation(&mut zip, &options, slides.len())?;
    
    // Write slides
    for (i, slide) in slides.iter().enumerate() {
        write_slide(&mut zip, &options, i + 1, slide)?;
        write_slide_rels(&mut zip, &options, i + 1)?;
    }
    
    // Write slide layouts and masters
    write_slide_layout(&mut zip, &options)?;
    write_slide_master(&mut zip, &options)?;
    write_layout_rels(&mut zip, &options)?;
    write_master_rels(&mut zip, &options)?;
    
    // Write theme
    write_theme(&mut zip, &options)?;
    
    // Properly finalize and flush the ZIP
    let mut file = zip.finish()
        .map_err(|e| ExportError::PptxError(format!("Failed to finalize PPTX: {}", e)))?;
    
    // Ensure all data is flushed to disk
    file.flush()
        .map_err(|e| ExportError::PptxError(format!("Failed to flush PPTX: {}", e)))?;

    let file_size = std::fs::metadata(output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(ExportResult {
        path: output_path.to_string_lossy().to_string(),
        filename: output_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "presentation.pptx".to_string()),
        file_size,
        markdown_link: format!("[{}](exports/{})", title, sanitize_filename(title)),
    })
}

/// Convert parsed content into slides
fn content_to_slides(content: &ParsedContent, title: &str) -> Vec<Slide> {
    let mut slides = Vec::new();
    
    // Title slide - only add the presentation title, no content
    // Content will be organized into proper slides based on headings
    let title_slide = Slide::new(title);
    slides.push(title_slide);
    
    // Create slides from headings
    let mut current_slide: Option<Slide> = None;
    
    for block in &content.blocks {
        match block {
            ContentBlock::Heading { level, text } => {
                // Save current slide if exists
                if let Some(slide) = current_slide.take() {
                    if !slide.content.is_empty() || !slide.title.is_empty() {
                        slides.push(slide);
                    }
                }
                
                // Start new slide for h1 or h2
                if *level <= 2 {
                    current_slide = Some(Slide::new(text));
                } else {
                    // For h3+, add as content to current slide
                    if let Some(ref mut slide) = current_slide {
                        slide.add_bullet(&format!("• {}", text));
                    } else {
                        current_slide = Some(Slide::new(text));
                    }
                }
            }
            ContentBlock::Paragraph { text } => {
                if let Some(ref mut slide) = current_slide {
                    // Don't add empty paragraphs
                    if !text.trim().is_empty() {
                        slide.add_bullet(text);
                    }
                }
            }
            ContentBlock::UnorderedList { items } => {
                if let Some(ref mut slide) = current_slide {
                    for item in items {
                        // Skip empty items
                        let trimmed = item.trim();
                        if !trimmed.is_empty() {
                            slide.add_bullet(&format!("• {}", trimmed));
                        }
                    }
                }
            }
            ContentBlock::OrderedList { items, start } => {
                if let Some(ref mut slide) = current_slide {
                    let mut num = *start;
                    for item in items {
                        // Skip empty items
                        let trimmed = item.trim();
                        if !trimmed.is_empty() {
                            slide.add_bullet(&format!("{}. {}", num, trimmed));
                            num += 1;
                        }
                    }
                }
            }
            ContentBlock::CodeBlock { code, language } => {
                if let Some(ref mut slide) = current_slide {
                    if let Some(lang) = language {
                        slide.add_bullet(&format!("Code ({})", lang));
                    }
                    // Add first few lines of code as preview
                    let lines: Vec<&str> = code.lines().take(5).collect();
                    for line in lines {
                        slide.add_bullet(&format!("  {}", line));
                    }
                    if code.lines().count() > 5 {
                        slide.add_bullet("  ...");
                    }
                }
            }
            ContentBlock::Blockquote { text } => {
                if let Some(ref mut slide) = current_slide {
                    slide.add_bullet(&format!("\"{}\"", text));
                }
            }
            ContentBlock::TaskList { items } => {
                if let Some(ref mut slide) = current_slide {
                    for item in items {
                        // Skip empty items
                        let trimmed = item.text.trim();
                        if !trimmed.is_empty() {
                            let checkbox = if item.checked { "☑" } else { "☐" };
                            slide.add_bullet(&format!("{} {}", checkbox, trimmed));
                        }
                    }
                }
            }
            ContentBlock::Table(table) => {
                if let Some(ref mut slide) = current_slide {
                    // Add table headers
                    if let Some(headers) = &table.headers {
                        slide.add_bullet(&format!("Table: {}", headers.join(" | ")));
                    }
                    // Add first few rows as preview
                    for row in table.rows.iter().take(3) {
                        slide.add_bullet(&format!("  {}", row.join(" | ")));
                    }
                    if table.rows.len() > 3 {
                        slide.add_bullet(&format!("  ... ({} more rows)", table.rows.len() - 3));
                    }
                }
            }
            ContentBlock::HorizontalRule => {
                // Page breaks between sections - save current slide and start fresh
                if let Some(slide) = current_slide.take() {
                    if !slide.content.is_empty() || !slide.title.is_empty() {
                        slides.push(slide);
                    }
                }
            }
            ContentBlock::Image { alt, .. } => {
                if let Some(ref mut slide) = current_slide {
                    let alt_display = if alt.is_empty() { "Image" } else { alt };
                    slide.add_bullet(&format!("[Image: {}]", alt_display));
                }
            }
        }
    }
    
    // Add final slide
    if let Some(slide) = current_slide {
        if !slide.content.is_empty() || !slide.title.is_empty() {
            slides.push(slide);
        }
    }
    
    slides
}

fn write_content_types<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_count: usize,
) -> Result<(), ExportError> {
    zip.start_file("[Content_Types].xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let mut writer = Writer::new(Vec::new());
    
    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), Some("yes"))))
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    let mut types = BytesStart::new("Types");
    types.push_attribute(("xmlns", "http://schemas.openxmlformats.org/package/2006/content-types"));
    writer.write_event(Event::Start(types)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    // Default content types
    let defaults = [
        ("rels", "application/vnd.openxmlformats-package.relationships+xml"),
        ("xml", "application/xml"),
    ];
    
    for (ext, ct) in defaults {
        let mut def = BytesStart::new("Default");
        def.push_attribute(("Extension", ext));
        def.push_attribute(("ContentType", ct));
        writer.write_event(Event::Empty(def)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    }
    
    // Override content types
    let mut overrides = vec![
        ("/ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
        ("/ppt/slideMasters/slideMaster1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"),
        ("/ppt/slideLayouts/slideLayout1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"),
        ("/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"),
        ("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"),
        ("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
    ];
    
    for i in 1..=slide_count {
        overrides.push((
            Box::leak(format!("/ppt/slides/slide{}.xml", i).into_boxed_str()),
            "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
        ));
    }
    
    for (part, ct) in overrides {
        let mut ovr = BytesStart::new("Override");
        ovr.push_attribute(("PartName", part));
        ovr.push_attribute(("ContentType", ct));
        writer.write_event(Event::Empty(ovr)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    }
    
    writer.write_event(Event::End(BytesEnd::new("Types"))).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    zip.write_all(writer.into_inner().as_slice())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_rels<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("_rels/.rels", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_presentation_rels<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_count: usize,
) -> Result<(), ExportError> {
    zip.start_file("ppt/_rels/presentation.xml.rels", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let mut writer = Writer::new(Vec::new());
    
    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), Some("yes"))))
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    let mut rels = BytesStart::new("Relationships");
    rels.push_attribute(("xmlns", "http://schemas.openxmlformats.org/package/2006/relationships"));
    writer.write_event(Event::Start(rels)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    // Slide master
    let mut rel = BytesStart::new("Relationship");
    rel.push_attribute(("Id", "rId1"));
    rel.push_attribute(("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"));
    rel.push_attribute(("Target", "slideMasters/slideMaster1.xml"));
    writer.write_event(Event::Empty(rel)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    // Theme
    let mut rel = BytesStart::new("Relationship");
    rel.push_attribute(("Id", "rId2"));
    rel.push_attribute(("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"));
    rel.push_attribute(("Target", "theme/theme1.xml"));
    writer.write_event(Event::Empty(rel)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    // Slides
    for i in 1..=slide_count {
        let mut rel = BytesStart::new("Relationship");
        rel.push_attribute(("Id", format!("rId{}", i + 2).as_str()));
        rel.push_attribute(("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"));
        rel.push_attribute(("Target", format!("slides/slide{}.xml", i).as_str()));
        writer.write_event(Event::Empty(rel)).map_err(|e| ExportError::PptxError(e.to_string()))?;
    }
    
    writer.write_event(Event::End(BytesEnd::new("Relationships"))).map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    zip.write_all(writer.into_inner().as_slice())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_presentation<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_count: usize,
) -> Result<(), ExportError> {
    zip.start_file("ppt/presentation.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let mut slide_id_list = String::new();
    for i in 1..=slide_count {
        slide_id_list.push_str(&format!(
            r#"<p:sldId id="{}" r:id="rId{}"/>"#,
            256 + i,
            i + 2
        ));
    }

    let content = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    {}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"#, slide_id_list);
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_slide<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_num: usize,
    slide: &Slide,
) -> Result<(), ExportError> {
    zip.start_file(format!("ppt/slides/slide{}.xml", slide_num), options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    // Build body text - ensure at least one paragraph for valid XML
    let mut body_paragraphs = String::new();
    if slide.content.is_empty() {
        body_paragraphs.push_str(r#"<a:p><a:endParaRPr lang="en-US"/></a:p>"#);
    } else {
        for line in &slide.content {
            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }
            let escaped = escape_xml(line);
            body_paragraphs.push_str(&format!(r#"<a:p><a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t>{}</a:t></a:r></a:p>"#, escaped));
        }
        // Ensure at least one paragraph even if all lines were empty
        if body_paragraphs.is_empty() {
            body_paragraphs.push_str(r#"<a:p><a:endParaRPr lang="en-US"/></a:p>"#);
        }
    }

    let escaped_title = escape_xml(&slide.title);
    let content = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="4400" b="1"/>
              <a:t>{}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1600200"/>
            <a:ext cx="8229600" cy="4525963"/>
          </a:xfrm>
          <a:prstGeom prst="rect"/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          {}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>"#, escaped_title, body_paragraphs);
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_slide_rels<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_num: usize,
) -> Result<(), ExportError> {
    zip.start_file(format!("ppt/slides/_rels/slide{}.xml.rels", slide_num), options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_slide_layout<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("ppt/slideLayouts/slideLayout1.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_slide_master<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("ppt/slideMasters/slideMaster1.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgRef idx="1001">
        <a:schemeClr val="bg1"/>
      </p:bgRef>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_layout_rels<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_master_rels<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("ppt/slideMasters/_rels/slideMaster1.xml.rels", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_theme<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
) -> Result<(), ExportError> {
    zip.start_file("ppt/theme/theme1.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    // A minimal theme with basic colors
    let content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>"#;
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_app_xml<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    slide_count: usize,
) -> Result<(), ExportError> {
    zip.start_file("docProps/app.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let content = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <TotalTime>0</TotalTime>
  <Words>0</Words>
  <Application>Inkling</Application>
  <PresentationFormat>On-screen Show (4:3)</PresentationFormat>
  <Paragraphs>0</Paragraphs>
  <Slides>{}</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>"#, slide_count);
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

fn write_core_xml<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    options: &FileOptions<'_, ()>,
    title: &str,
) -> Result<(), ExportError> {
    zip.start_file("docProps/core.xml", options.clone())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let escaped_title = escape_xml(title);
    
    let content = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{}</dc:title>
  <dc:creator>Inkling</dc:creator>
  <cp:lastModifiedBy>Inkling</cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">{}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{}</dcterms:modified>
</cp:coreProperties>"#, escaped_title, now, now);
    
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::PptxError(e.to_string()))?;
    
    Ok(())
}

/// Escape special XML characters
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("Hello & World"), "Hello &amp; World");
        assert_eq!(escape_xml("<test>"), "&lt;test&gt;");
    }
    
    #[test]
    fn test_content_to_slides() {
        let content = ParsedContent {
            title: Some("Test".to_string()),
            blocks: vec![
                ContentBlock::Heading { level: 1, text: "Title".to_string() },
                ContentBlock::Paragraph { text: "First paragraph".to_string() },
                ContentBlock::Heading { level: 2, text: "Section".to_string() },
                ContentBlock::UnorderedList { items: vec![
                    "Item 1".to_string(),
                    "Item 2".to_string(),
                ]},
            ],
        };
        
        let slides = content_to_slides(&content, "Test Presentation");
        
        // Should have: title slide, "Title" slide, "Section" slide
        assert!(slides.len() >= 3);
        assert_eq!(slides[0].title, "Test Presentation");
        assert_eq!(slides[1].title, "Title");
        assert!(slides[1].content.iter().any(|c| c.contains("First paragraph")));
        assert_eq!(slides[2].title, "Section");
        assert!(slides[2].content.iter().any(|c| c.contains("Item 1")));
    }
    
    #[test]
    fn test_no_duplicate_content() {
        let content = ParsedContent {
            title: Some("Test".to_string()),
            blocks: vec![
                ContentBlock::Heading { level: 1, text: "Main Section".to_string() },
                ContentBlock::Paragraph { text: "This is content".to_string() },
            ],
        };
        
        let slides = content_to_slides(&content, "Presentation Title");
        
        // Title slide should be empty (no duplicate content)
        assert_eq!(slides[0].title, "Presentation Title");
        assert!(slides[0].content.is_empty());
        
        // Content should only appear on the Main Section slide
        assert_eq!(slides[1].title, "Main Section");
        assert!(slides[1].content.iter().any(|c| c.contains("This is content")));
    }
    
    #[test]
    fn test_generate_pptx_file() {
        use tempfile::TempDir;
        
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.pptx");
        
        let content = ParsedContent {
            title: Some("Test Presentation".to_string()),
            blocks: vec![
                ContentBlock::Heading { level: 1, text: "Introduction".to_string() },
                ContentBlock::Paragraph { text: "Welcome to this presentation.".to_string() },
                ContentBlock::UnorderedList { items: vec![
                    "Point one".to_string(),
                    "Point two".to_string(),
                    "Point three".to_string(),
                ]},
                ContentBlock::Heading { level: 2, text: "Details".to_string() },
                ContentBlock::Paragraph { text: "Here are more details about the topic.".to_string() },
            ],
        };
        
        let options = PptxExportOptions::default();
        let result = generate_pptx(&content, "Test Presentation", &output_path, &options);
        
        assert!(result.is_ok(), "PPTX generation failed: {:?}", result.err());
        assert!(output_path.exists(), "PPTX file was not created");
        
        let export_result = result.unwrap();
        assert!(export_result.file_size > 0, "PPTX file is empty");
        println!("Generated PPTX: {} bytes", export_result.file_size);
        
        // Verify it's a valid ZIP file
        let file = File::open(&output_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        
        // Check for required files
        let required_files = [
            "[Content_Types].xml",
            "_rels/.rels",
            "docProps/app.xml",
            "docProps/core.xml",
            "ppt/presentation.xml",
            "ppt/slides/slide1.xml",
        ];
        
        for required in required_files {
            assert!(
                archive.by_name(required).is_ok(),
                "Missing required file: {}",
                required
            );
        }
    }
}

