use tantivy::schema::{Schema, STORED, STRING, TEXT};

/// Field names for the search index
pub const FIELD_ID: &str = "id";
pub const FIELD_TITLE: &str = "title";
pub const FIELD_CONTENT: &str = "content";

/// Build the Tantivy schema for indexing notes
pub fn build_schema() -> Schema {
    let mut schema_builder = Schema::builder();

    // ID field: stored and indexed as a single token (not tokenized) for deletion and retrieval
    schema_builder.add_text_field(FIELD_ID, STRING | STORED);

    // Title field: stored and indexed with TEXT preset (includes tokenization)
    schema_builder.add_text_field(FIELD_TITLE, TEXT | STORED);

    // Content field: indexed with TEXT preset but not stored
    schema_builder.add_text_field(FIELD_CONTENT, TEXT);

    schema_builder.build()
}
