/**
 * Export-related types
 */

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface Export {
  id: string;
  filename: string;
  title: string;
  format: ExportFormat;
  sourceNoteIds: string[];
  fileSize: number | null;
  path: string;
  createdAt: string;
}

export interface ExportResult {
  path: string;
  filename: string;
  fileSize: number;
  markdownLink: string;
}

export interface ExportNotesPdfInput {
  noteIds: string[];
  title: string;
  pageBreakBetweenNotes?: boolean;
}

export interface ExportNotesDocxInput {
  noteIds: string[];
  title: string;
  pageBreakBetweenNotes?: boolean;
}

export interface ExportContentXlsxInput {
  content: string;
  title: string;
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF Document',
  docx: 'Word Document',
  xlsx: 'Excel Spreadsheet',
  pptx: 'PowerPoint Presentation',
};

export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: '.pdf',
  docx: '.docx',
  xlsx: '.xlsx',
  pptx: '.pptx',
};

export const FORMAT_ICONS: Record<ExportFormat, string> = {
  pdf: '📄',
  docx: '📝',
  xlsx: '📊',
  pptx: '📑',
};

