/**
 * A note in the knowledge base
 */
export interface Note {
  id: string;
  title: string;
  content: string | null;
  contentHtml: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

/**
 * Input for creating a new note
 */
export interface CreateNoteInput {
  title: string;
  content?: string | null;
  contentHtml?: string | null;
  folderId?: string | null;
}

/**
 * Input for updating an existing note
 */
export interface UpdateNoteInput {
  title?: string | null;
  content?: string | null;
  contentHtml?: string | null;
  folderId?: string | null;
}

/**
 * A folder for organizing notes
 */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

/**
 * Input for creating a new folder
 */
export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
}

/**
 * Input for updating an existing folder
 */
export interface UpdateFolderInput {
  name?: string | null;
  parentId?: string | null;
}

/**
 * A tag for categorizing notes
 */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

/**
 * A link between two notes (wiki-style reference)
 */
export interface NoteLink {
  sourceNoteId: string;
  targetNoteId: string;
  context: string | null;
}
