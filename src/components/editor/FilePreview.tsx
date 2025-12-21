import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  File,
  Presentation,
  ExternalLink,
  Download,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import {
  type FileCategory,
  getCodeLanguage,
  getFileTypeDescription,
  formatFileSize,
  getFileExtension,
} from "../../lib/fileTypes";

interface FilePreviewProps {
  src: string;
  filename: string;
  fileType: FileCategory;
  fileSize?: number;
}

/**
 * Unified file preview component
 * Renders appropriate preview based on file type:
 * - PDF: Inline viewer
 * - Code: Syntax-highlighted preview
 * - Text/Markdown: Plain text preview
 * - Office: File card with open externally button
 */
export function FilePreview({ src, filename, fileType, fileSize }: FilePreviewProps) {
  switch (fileType) {
    case "pdf":
      return <PDFPreview src={src} filename={filename} fileSize={fileSize} />;
    case "code":
      return <CodePreview src={src} filename={filename} fileSize={fileSize} />;
    case "text":
      return <TextPreview src={src} filename={filename} fileSize={fileSize} />;
    case "office":
      return <OfficeFileCard src={src} filename={filename} fileSize={fileSize} />;
    default:
      return <GenericFileCard src={src} filename={filename} fileType={fileType} fileSize={fileSize} />;
  }
}

/**
 * PDF inline preview using browser's native viewer
 */
function PDFPreview({ src, filename, fileSize }: { src: string; filename: string; fileSize?: number }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <GenericFileCard
        src={src}
        filename={filename}
        fileType="pdf"
        fileSize={fileSize}
        errorMessage="PDF preview not available"
      />
    );
  }

  return (
    <div className="file-preview-container pdf-preview">
      <div className="file-preview-header">
        <div className="file-preview-info">
          <FileText size={20} className="file-icon pdf" />
          <div className="file-details">
            <span className="file-name">{filename}</span>
            <span className="file-meta">
              PDF Document{fileSize ? ` • ${formatFileSize(fileSize)}` : ""}
            </span>
          </div>
        </div>
        <div className="file-preview-actions">
          <a
            href={src}
            download={filename}
            className="file-action-btn"
            title="Download"
          >
            <Download size={16} />
          </a>
          <button
            className="file-action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="pdf-viewer-container">
          <object
            data={src}
            type="application/pdf"
            className="pdf-viewer"
            onError={() => setError(true)}
          >
            <p className="pdf-fallback">
              Unable to display PDF.{" "}
              <a href={src} download={filename}>
                Download instead
              </a>
            </p>
          </object>
        </div>
      )}
    </div>
  );
}

/**
 * Code file preview with syntax highlighting
 */
function CodePreview({ src, filename, fileSize }: { src: string; filename: string; fileSize?: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const language = getCodeLanguage(filename);
  const MAX_PREVIEW_LINES = 50;

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(src);
        if (!response.ok) throw new Error("Failed to fetch file");
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [src]);

  const lines = content?.split("\n") || [];
  const isTruncated = lines.length > MAX_PREVIEW_LINES;
  const displayLines = isTruncated ? lines.slice(0, MAX_PREVIEW_LINES) : lines;

  return (
    <div className="file-preview-container code-preview">
      <div className="file-preview-header">
        <div className="file-preview-info">
          <FileCode size={20} className="file-icon code" />
          <div className="file-details">
            <span className="file-name">{filename}</span>
            <span className="file-meta">
              {getFileTypeDescription("code", filename)}
              {fileSize ? ` • ${formatFileSize(fileSize)}` : ""}
              {lines.length > 0 ? ` • ${lines.length} lines` : ""}
            </span>
          </div>
        </div>
        <div className="file-preview-actions">
          <a
            href={src}
            download={filename}
            className="file-action-btn"
            title="Download"
          >
            <Download size={16} />
          </a>
          <button
            className="file-action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="code-viewer-container">
          {isLoading && <div className="code-loading">Loading...</div>}
          {error && <div className="code-error">{error}</div>}
          {content && (
            <>
              <pre className="code-content">
                <code className={`language-${language}`}>
                  {displayLines.map((line, i) => (
                    <div key={i} className="code-line">
                      <span className="line-number">{i + 1}</span>
                      <span className="line-content">{line}</span>
                    </div>
                  ))}
                </code>
              </pre>
              {isTruncated && (
                <div className="code-truncated">
                  ... {lines.length - MAX_PREVIEW_LINES} more lines
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Text/Markdown file preview
 */
function TextPreview({ src, filename, fileSize }: { src: string; filename: string; fileSize?: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMarkdown = getFileExtension(filename) === ".md" || getFileExtension(filename) === ".markdown";
  const MAX_PREVIEW_CHARS = 2000;

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(src);
        if (!response.ok) throw new Error("Failed to fetch file");
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [src]);

  const isTruncated = content && content.length > MAX_PREVIEW_CHARS;
  const displayContent = isTruncated ? content.slice(0, MAX_PREVIEW_CHARS) : content;

  return (
    <div className="file-preview-container text-preview">
      <div className="file-preview-header">
        <div className="file-preview-info">
          <FileText size={20} className="file-icon text" />
          <div className="file-details">
            <span className="file-name">{filename}</span>
            <span className="file-meta">
              {isMarkdown ? "Markdown" : "Text File"}
              {fileSize ? ` • ${formatFileSize(fileSize)}` : ""}
            </span>
          </div>
        </div>
        <div className="file-preview-actions">
          <a
            href={src}
            download={filename}
            className="file-action-btn"
            title="Download"
          >
            <Download size={16} />
          </a>
          <button
            className="file-action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="text-viewer-container">
          {isLoading && <div className="text-loading">Loading...</div>}
          {error && <div className="text-error">{error}</div>}
          {content && (
            <>
              <div className="text-content">
                {displayContent}
              </div>
              {isTruncated && (
                <div className="text-truncated">
                  ... content truncated. Download to view full file.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Office document card (Word, Excel, PowerPoint)
 */
function OfficeFileCard({ src, filename, fileSize }: { src: string; filename: string; fileSize?: number }) {
  const ext = getFileExtension(filename);
  
  const getIcon = () => {
    if (ext === ".doc" || ext === ".docx" || ext === ".odt" || ext === ".rtf") {
      return <FileText size={24} className="file-icon word" />;
    }
    if (ext === ".xls" || ext === ".xlsx" || ext === ".ods") {
      return <FileSpreadsheet size={24} className="file-icon excel" />;
    }
    if (ext === ".ppt" || ext === ".pptx" || ext === ".odp") {
      return <Presentation size={24} className="file-icon powerpoint" />;
    }
    return <File size={24} className="file-icon" />;
  };

  const handleOpenExternal = async () => {
    try {
      // Convert relative path to absolute if needed
      // The src might be a relative path like ../attachments/file.docx
      await open(src);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  return (
    <div className="file-preview-container office-card">
      <div className="file-card-content">
        {getIcon()}
        <div className="file-details">
          <span className="file-name">{filename}</span>
          <span className="file-meta">
            {getFileTypeDescription("office", filename)}
            {fileSize ? ` • ${formatFileSize(fileSize)}` : ""}
          </span>
        </div>
      </div>
      <div className="file-card-actions">
        <button
          className="file-open-btn"
          onClick={handleOpenExternal}
          title="Open in default application"
        >
          <ExternalLink size={16} />
          <span>Open</span>
        </button>
        <a
          href={src}
          download={filename}
          className="file-download-btn"
          title="Download"
        >
          <Download size={16} />
        </a>
      </div>
    </div>
  );
}

/**
 * Generic file card for unknown or unsupported file types
 */
function GenericFileCard({
  src,
  filename,
  fileType,
  fileSize,
  errorMessage,
}: {
  src: string;
  filename: string;
  fileType: FileCategory;
  fileSize?: number;
  errorMessage?: string;
}) {
  return (
    <div className="file-preview-container generic-card">
      <div className="file-card-content">
        <File size={24} className="file-icon" />
        <div className="file-details">
          <span className="file-name">{filename}</span>
          <span className="file-meta">
            {getFileTypeDescription(fileType, filename)}
            {fileSize ? ` • ${formatFileSize(fileSize)}` : ""}
          </span>
          {errorMessage && (
            <span className="file-error">
              <AlertCircle size={12} />
              {errorMessage}
            </span>
          )}
        </div>
      </div>
      <div className="file-card-actions">
        <a
          href={src}
          download={filename}
          className="file-download-btn primary"
          title="Download"
        >
          <Download size={16} />
          <span>Download</span>
        </a>
      </div>
    </div>
  );
}

export default FilePreview;
