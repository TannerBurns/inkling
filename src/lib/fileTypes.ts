/**
 * File type detection and categorization utility
 */

export type FileCategory = 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'pdf' 
  | 'code' 
  | 'text' 
  | 'office' 
  | 'unknown';

/**
 * MIME type to category mapping
 */
const MIME_CATEGORIES: Record<string, FileCategory> = {
  // Images
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  
  // Videos
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'video/ogg': 'video',
  'video/x-msvideo': 'video',
  'video/x-matroska': 'video',
  
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/mp4': 'audio',
  'audio/webm': 'audio',
  'audio/aac': 'audio',
  'audio/flac': 'audio',
  
  // PDF
  'application/pdf': 'pdf',
  
  // Text
  'text/plain': 'text',
  'text/markdown': 'text',
  
  // Office documents
  'application/msword': 'office',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'office',
  'application/vnd.ms-excel': 'office',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'office',
  'application/vnd.ms-powerpoint': 'office',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'office',
};

/**
 * Extension to category mapping (for when MIME type is not available or generic)
 */
const EXTENSION_CATEGORIES: Record<string, FileCategory> = {
  // Images
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.bmp': 'image',
  '.tiff': 'image',
  '.ico': 'image',
  
  // Videos
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.ogv': 'video',
  '.m4v': 'video',
  
  // Audio
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.flac': 'audio',
  '.wma': 'audio',
  
  // PDF
  '.pdf': 'pdf',
  
  // Code files
  '.js': 'code',
  '.jsx': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.rs': 'code',
  '.go': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.cc': 'code',
  '.cxx': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.cs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.sass': 'code',
  '.less': 'code',
  '.html': 'code',
  '.htm': 'code',
  '.xml': 'code',
  '.json': 'code',
  '.yaml': 'code',
  '.yml': 'code',
  '.toml': 'code',
  '.sql': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.fish': 'code',
  '.ps1': 'code',
  '.bat': 'code',
  '.cmd': 'code',
  '.lua': 'code',
  '.r': 'code',
  '.pl': 'code',
  '.pm': 'code',
  '.ex': 'code',
  '.exs': 'code',
  '.erl': 'code',
  '.hs': 'code',
  '.ml': 'code',
  '.clj': 'code',
  '.vue': 'code',
  '.svelte': 'code',
  '.graphql': 'code',
  '.gql': 'code',
  '.dockerfile': 'code',
  '.makefile': 'code',
  
  // Text files
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.rst': 'text',
  '.log': 'text',
  '.ini': 'text',
  '.cfg': 'text',
  '.conf': 'text',
  '.env': 'text',
  
  // Office documents
  '.doc': 'office',
  '.docx': 'office',
  '.xls': 'office',
  '.xlsx': 'office',
  '.ppt': 'office',
  '.pptx': 'office',
  '.odt': 'office',
  '.ods': 'office',
  '.odp': 'office',
  '.rtf': 'office',
};

/**
 * Get the file extension from a filename (lowercase, with dot)
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Detect file category from MIME type and/or filename
 */
export function detectFileCategory(mimeType?: string, filename?: string): FileCategory {
  // Try MIME type first
  if (mimeType) {
    const normalizedMime = mimeType.toLowerCase();
    if (MIME_CATEGORIES[normalizedMime]) {
      return MIME_CATEGORIES[normalizedMime];
    }
    // Check for generic MIME type patterns
    if (normalizedMime.startsWith('image/')) return 'image';
    if (normalizedMime.startsWith('video/')) return 'video';
    if (normalizedMime.startsWith('audio/')) return 'audio';
    if (normalizedMime.startsWith('text/')) return 'text';
  }
  
  // Fall back to extension
  if (filename) {
    const ext = getFileExtension(filename);
    if (ext && EXTENSION_CATEGORIES[ext]) {
      return EXTENSION_CATEGORIES[ext];
    }
  }
  
  return 'unknown';
}

/**
 * Get the language identifier for syntax highlighting based on file extension
 */
export function getCodeLanguage(filename: string): string {
  const ext = getFileExtension(filename);
  
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.fish': 'bash',
    '.ps1': 'powershell',
    '.bat': 'batch',
    '.cmd': 'batch',
    '.lua': 'lua',
    '.r': 'r',
    '.pl': 'perl',
    '.pm': 'perl',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.ml': 'ocaml',
    '.clj': 'clojure',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.dockerfile': 'dockerfile',
    '.makefile': 'makefile',
    '.md': 'markdown',
    '.markdown': 'markdown',
  };
  
  return languageMap[ext] || 'plaintext';
}

/**
 * Get a human-readable file type description
 */
export function getFileTypeDescription(category: FileCategory, filename?: string): string {
  switch (category) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'pdf':
      return 'PDF Document';
    case 'code':
      if (filename) {
        const lang = getCodeLanguage(filename);
        return `${lang.charAt(0).toUpperCase() + lang.slice(1)} Code`;
      }
      return 'Code File';
    case 'text':
      if (filename) {
        const ext = getFileExtension(filename);
        if (ext === '.md' || ext === '.markdown') return 'Markdown';
      }
      return 'Text File';
    case 'office':
      if (filename) {
        const ext = getFileExtension(filename);
        if (ext === '.doc' || ext === '.docx' || ext === '.odt' || ext === '.rtf') return 'Word Document';
        if (ext === '.xls' || ext === '.xlsx' || ext === '.ods') return 'Spreadsheet';
        if (ext === '.ppt' || ext === '.pptx' || ext === '.odp') return 'Presentation';
      }
      return 'Office Document';
    default:
      return 'File';
  }
}

/**
 * Check if a file category supports inline preview
 */
export function supportsInlinePreview(category: FileCategory): boolean {
  return ['image', 'video', 'audio', 'pdf', 'code', 'text'].includes(category);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}
