use std::path::PathBuf;
use std::sync::RwLock;

use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::Value;
use tantivy::{Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term};
use thiserror::Error;

use super::schema::{build_schema, FIELD_CONTENT, FIELD_ID, FIELD_TITLE};

#[derive(Error, Debug)]
pub enum SearchError {
    #[error("Tantivy error: {0}")]
    TantivyError(#[from] tantivy::TantivyError),
    #[error("Query parse error: {0}")]
    QueryParseError(#[from] tantivy::query::QueryParserError),
    #[error("Index write error: {0}")]
    WriteError(String),
    #[error("Failed to create index directory: {0}")]
    DirectoryError(#[from] std::io::Error),
}

/// A search result with note ID and relevance score
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
}

/// Manages the Tantivy full-text search index
pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    writer: RwLock<IndexWriter>,
}

impl SearchIndex {
    /// Create or open a search index at the given path
    pub fn new(index_path: PathBuf) -> Result<Self, SearchError> {
        // Ensure the index directory exists
        std::fs::create_dir_all(&index_path)?;

        let schema = build_schema();

        // Try to open existing index, or create a new one
        let index = if index_path.join("meta.json").exists() {
            Index::open_in_dir(&index_path)?
        } else {
            Index::create_in_dir(&index_path, schema.clone())?
        };

        // Create a reader with automatic reloading
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        // Create a writer with 50MB heap
        let writer = index.writer(50_000_000)?;

        Ok(Self {
            index,
            reader,
            writer: RwLock::new(writer),
        })
    }

    /// Add a note to the search index
    pub fn add_note(&self, id: &str, title: &str, content: Option<&str>) -> Result<(), SearchError> {
        let schema = self.index.schema();
        let id_field = schema.get_field(FIELD_ID).unwrap();
        let title_field = schema.get_field(FIELD_TITLE).unwrap();
        let content_field = schema.get_field(FIELD_CONTENT).unwrap();

        let mut doc = TantivyDocument::new();
        doc.add_text(id_field, id);
        doc.add_text(title_field, title);
        if let Some(content) = content {
            doc.add_text(content_field, content);
        }

        let mut writer = self.writer.write().map_err(|e| SearchError::WriteError(e.to_string()))?;
        writer.add_document(doc)?;
        writer.commit()?;
        drop(writer);

        // Reload reader to see committed changes immediately
        self.reader.reload()?;

        Ok(())
    }

    /// Update a note in the search index (delete + re-add)
    pub fn update_note(&self, id: &str, title: &str, content: Option<&str>) -> Result<(), SearchError> {
        self.delete_note(id)?;
        self.add_note(id, title, content)
    }

    /// Delete a note from the search index
    pub fn delete_note(&self, id: &str) -> Result<(), SearchError> {
        let schema = self.index.schema();
        let id_field = schema.get_field(FIELD_ID).unwrap();
        let term = Term::from_field_text(id_field, id);

        let mut writer = self.writer.write().map_err(|e| SearchError::WriteError(e.to_string()))?;
        writer.delete_term(term);
        writer.commit()?;
        drop(writer);

        // Reload reader to see committed changes immediately
        self.reader.reload()?;

        Ok(())
    }

    /// Search for notes matching the query
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>, SearchError> {
        if query_str.trim().is_empty() {
            return Ok(vec![]);
        }

        let schema = self.index.schema();
        let title_field = schema.get_field(FIELD_TITLE).unwrap();
        let content_field = schema.get_field(FIELD_CONTENT).unwrap();
        let id_field = schema.get_field(FIELD_ID).unwrap();

        // Create a query parser that searches both title and content
        let mut query_parser = QueryParser::for_index(&self.index, vec![title_field, content_field]);
        query_parser.set_field_boost(title_field, 2.0);

        let query = query_parser.parse_query(query_str)?;

        let searcher = self.reader.searcher();
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::with_capacity(top_docs.len());
        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
            if let Some(id_value) = retrieved_doc.get_first(id_field) {
                if let Some(id) = id_value.as_str() {
                    results.push(SearchResult {
                        id: id.to_string(),
                        score,
                    });
                }
            }
        }

        Ok(results)
    }

    /// Rebuild the entire index from a list of notes
    pub fn rebuild(&self, notes: Vec<(String, String, Option<String>)>) -> Result<(), SearchError> {
        let schema = self.index.schema();
        let id_field = schema.get_field(FIELD_ID).unwrap();
        let title_field = schema.get_field(FIELD_TITLE).unwrap();
        let content_field = schema.get_field(FIELD_CONTENT).unwrap();

        let mut writer = self.writer.write().map_err(|e| SearchError::WriteError(e.to_string()))?;
        
        // Delete all existing documents
        writer.delete_all_documents()?;
        
        // Add all notes
        for (id, title, content) in notes {
            let mut doc = TantivyDocument::new();
            doc.add_text(id_field, &id);
            doc.add_text(title_field, &title);
            if let Some(ref content) = content {
                doc.add_text(content_field, content);
            }
            writer.add_document(doc)?;
        }
        
        writer.commit()?;
        drop(writer);

        // Reload reader to see committed changes immediately
        self.reader.reload()?;
        Ok(())
    }

    /// Check if the index is empty
    pub fn is_empty(&self) -> bool {
        let searcher = self.reader.searcher();
        searcher.num_docs() == 0
    }

    /// Get the number of documents in the index
    pub fn doc_count(&self) -> u64 {
        let searcher = self.reader.searcher();
        searcher.num_docs()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_index() -> (SearchIndex, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let index = SearchIndex::new(temp_dir.path().to_path_buf()).unwrap();
        (index, temp_dir)
    }

    #[test]
    fn test_add_and_search() {
        let (index, _dir) = create_test_index();
        
        index.add_note("1", "Meeting Notes", Some("Discussed project timeline")).unwrap();
        index.add_note("2", "Shopping List", Some("Milk, bread, eggs")).unwrap();
        
        let results = index.search("meeting", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
        
        let results = index.search("bread", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "2");
    }

    #[test]
    fn test_update_note() {
        let (index, _dir) = create_test_index();
        
        index.add_note("1", "Original Title", Some("Original content")).unwrap();
        
        let results = index.search("original", 10).unwrap();
        assert_eq!(results.len(), 1);
        
        index.update_note("1", "Updated Title", Some("Updated content")).unwrap();
        
        let results = index.search("original", 10).unwrap();
        assert_eq!(results.len(), 0);
        
        let results = index.search("updated", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_delete_note() {
        let (index, _dir) = create_test_index();
        
        index.add_note("1", "Test Note", Some("Test content")).unwrap();
        assert_eq!(index.doc_count(), 1);
        
        index.delete_note("1").unwrap();
        
        let results = index.search("test", 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_rebuild() {
        let (index, _dir) = create_test_index();
        
        index.add_note("old", "Old Note", Some("Old content")).unwrap();
        
        let notes = vec![
            ("1".to_string(), "First Note".to_string(), Some("Content one".to_string())),
            ("2".to_string(), "Second Note".to_string(), Some("Content two".to_string())),
        ];
        
        index.rebuild(notes).unwrap();
        
        // Old note should be gone
        let results = index.search("old", 10).unwrap();
        assert_eq!(results.len(), 0);
        
        // New notes should be searchable
        let results = index.search("first", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn test_empty_query() {
        let (index, _dir) = create_test_index();
        
        index.add_note("1", "Test Note", Some("Test content")).unwrap();
        
        let results = index.search("", 10).unwrap();
        assert_eq!(results.len(), 0);
        
        let results = index.search("   ", 10).unwrap();
        assert_eq!(results.len(), 0);
    }
}
