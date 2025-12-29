use rusqlite::Connection;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MigrationError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
}

/// Run all database migrations
pub fn run_migrations(conn: &Connection) -> Result<(), MigrationError> {
    // Create migrations table if it doesn't exist
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    // Run each migration
    let migrations: Vec<(&str, &str)> = vec![
        ("001_initial_schema", MIGRATION_001_INITIAL_SCHEMA),
        ("002_indexes", MIGRATION_002_INDEXES),
        ("003_settings", MIGRATION_003_SETTINGS),
        ("004_embeddings", MIGRATION_004_EMBEDDINGS),
        ("005_conversations", MIGRATION_005_CONVERSATIONS),
        ("006_boards", MIGRATION_006_BOARDS),
        ("007_calendar_events", MIGRATION_007_CALENDAR_EVENTS),
        ("008_google_accounts", MIGRATION_008_GOOGLE_ACCOUNTS),
        ("009_calendar_event_type", MIGRATION_009_CALENDAR_EVENT_TYPE),
        ("010_calendar_response_status", MIGRATION_010_CALENDAR_RESPONSE_STATUS),
        ("011_calendar_attendees", MIGRATION_011_CALENDAR_ATTENDEES),
        ("012_exports", MIGRATION_012_EXPORTS),
        ("013_url_attachments", MIGRATION_013_URL_ATTACHMENTS),
        ("014_url_metadata", MIGRATION_014_URL_METADATA),
        ("015_url_embedding_chunks", MIGRATION_015_URL_EMBEDDING_CHUNKS),
    ];

    for (name, sql) in migrations {
        if !migration_applied(conn, name)? {
            conn.execute_batch(sql)?;
            mark_migration_applied(conn, name)?;
        }
    }

    Ok(())
}

fn migration_applied(conn: &Connection, name: &str) -> Result<bool, MigrationError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM _migrations WHERE name = ?1",
        [name],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn mark_migration_applied(conn: &Connection, name: &str) -> Result<(), MigrationError> {
    conn.execute("INSERT INTO _migrations (name) VALUES (?1)", [name])?;
    Ok(())
}

const MIGRATION_001_INITIAL_SCHEMA: &str = r#"
-- Folder organization (must be created before notes due to foreign key)
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Core note storage
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    content_html TEXT,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Tags for categorization
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

-- Note-Tag relationship
CREATE TABLE note_tags (
    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Note links (wiki-style [[note]] references)
CREATE TABLE note_links (
    source_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    context TEXT,
    PRIMARY KEY (source_note_id, target_note_id)
);
"#;

const MIGRATION_002_INDEXES: &str = r#"
-- Indexes for common queries
CREATE INDEX idx_notes_folder_id ON notes(folder_id);
CREATE INDEX idx_notes_is_deleted ON notes(is_deleted);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);
CREATE INDEX idx_notes_title ON notes(title);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
CREATE INDEX idx_note_links_source ON note_links(source_note_id);
CREATE INDEX idx_note_links_target ON note_links(target_note_id);
"#;

const MIGRATION_003_SETTINGS: &str = r#"
-- Settings table for app configuration (including AI provider settings)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

const MIGRATION_004_EMBEDDINGS: &str = r#"
-- Note embeddings for semantic search
-- This is a regular table; we use sqlite-vec functions for vector operations
CREATE TABLE note_embeddings (
    note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    model TEXT NOT NULL,
    model_version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for finding notes that need embedding updates
CREATE INDEX idx_note_embeddings_model ON note_embeddings(model);
CREATE INDEX idx_note_embeddings_updated_at ON note_embeddings(updated_at);
"#;

const MIGRATION_005_CONVERSATIONS: &str = r#"
-- Chat conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    system_prompt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata TEXT, -- JSON: citations, token usage, model, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Context attached to messages (notes referenced in the conversation)
CREATE TABLE message_context (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    content_snippet TEXT, -- Selected content if not whole note
    is_full_note BOOLEAN DEFAULT TRUE
);

-- Indexes for conversation queries
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_message_context_message ON message_context(message_id);
CREATE INDEX idx_message_context_note ON message_context(note_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at);
"#;

const MIGRATION_006_BOARDS: &str = r#"
-- Kanban boards (one per folder)
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    folder_id TEXT UNIQUE REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Board lanes (columns in the kanban)
CREATE TABLE board_lanes (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    position INTEGER NOT NULL DEFAULT 0
);

-- Board cards (notes placed on boards)
CREATE TABLE board_cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    lane_id TEXT NOT NULL REFERENCES board_lanes(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0
);

-- Indexes for board queries
CREATE INDEX idx_boards_folder_id ON boards(folder_id);
CREATE INDEX idx_board_lanes_board_id ON board_lanes(board_id);
CREATE INDEX idx_board_lanes_position ON board_lanes(board_id, position);
CREATE INDEX idx_board_cards_board_id ON board_cards(board_id);
CREATE INDEX idx_board_cards_lane_id ON board_cards(lane_id);
CREATE INDEX idx_board_cards_note_id ON board_cards(note_id);
CREATE INDEX idx_board_cards_position ON board_cards(lane_id, position);
"#;

const MIGRATION_007_CALENDAR_EVENTS: &str = r#"
-- Calendar events for scheduling and integration with notes
CREATE TABLE calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    all_day BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'google')),
    external_id TEXT,
    linked_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for calendar queries
CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_end_time ON calendar_events(end_time);
CREATE INDEX idx_calendar_events_source ON calendar_events(source);
CREATE INDEX idx_calendar_events_external_id ON calendar_events(external_id);
CREATE INDEX idx_calendar_events_linked_note ON calendar_events(linked_note_id);
CREATE INDEX idx_calendar_events_date_range ON calendar_events(start_time, end_time);
"#;

const MIGRATION_008_GOOGLE_ACCOUNTS: &str = r#"
-- Google OAuth account storage
CREATE TABLE google_accounts (
    id TEXT PRIMARY KEY DEFAULT 'default',
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at INTEGER,
    connected_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"#;

const MIGRATION_009_CALENDAR_EVENT_TYPE: &str = r#"
-- Add event_type column to calendar_events
-- Types: default, outOfOffice, focusTime, workingLocation
ALTER TABLE calendar_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'default';
"#;

const MIGRATION_010_CALENDAR_RESPONSE_STATUS: &str = r#"
-- Add response_status column to calendar_events
-- Values: needsAction, declined, tentative, accepted
-- NULL means no response tracking (e.g., for manual events or events you organized)
ALTER TABLE calendar_events ADD COLUMN response_status TEXT DEFAULT NULL;
"#;

const MIGRATION_011_CALENDAR_ATTENDEES: &str = r#"
-- Add attendees column to store event attendees as JSON array
-- Format: [{"email": "...", "name": "...", "responseStatus": "...", "isOrganizer": bool}]
ALTER TABLE calendar_events ADD COLUMN attendees TEXT DEFAULT NULL;

-- Add meeting_link column to store video call links
ALTER TABLE calendar_events ADD COLUMN meeting_link TEXT DEFAULT NULL;
"#;

const MIGRATION_012_EXPORTS: &str = r#"
-- Exports table for tracking generated document exports
CREATE TABLE exports (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    title TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('pdf', 'docx', 'xlsx', 'pptx')),
    source_note_ids TEXT,  -- JSON array of note IDs
    file_size INTEGER,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for export queries
CREATE INDEX idx_exports_format ON exports(format);
CREATE INDEX idx_exports_created_at ON exports(created_at);
"#;

const MIGRATION_013_URL_ATTACHMENTS: &str = r#"
-- URL attachments linked to notes
-- Stores fetched web content for embedding and chat context
CREATE TABLE url_attachments (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    content TEXT,              -- Extracted main content
    links TEXT,                -- JSON array of outbound links
    fetched_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'fetching', 'indexed', 'error')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(note_id, url)       -- Prevent duplicate URLs per note
);

-- Separate embeddings for URL content (enables URL-specific similarity search)
CREATE TABLE url_embeddings (
    url_attachment_id TEXT PRIMARY KEY REFERENCES url_attachments(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    model TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for URL attachment queries
CREATE INDEX idx_url_attachments_note_id ON url_attachments(note_id);
CREATE INDEX idx_url_attachments_status ON url_attachments(status);
CREATE INDEX idx_url_attachments_url ON url_attachments(url);
"#;

const MIGRATION_014_URL_METADATA: &str = r#"
-- Add metadata columns to url_attachments for preview cards
ALTER TABLE url_attachments ADD COLUMN image_url TEXT DEFAULT NULL;
ALTER TABLE url_attachments ADD COLUMN favicon_url TEXT DEFAULT NULL;
ALTER TABLE url_attachments ADD COLUMN site_name TEXT DEFAULT NULL;
"#;

const MIGRATION_015_URL_EMBEDDING_CHUNKS: &str = r#"
-- URL embedding chunks for long content
-- Instead of one embedding per URL, we split long content into chunks
-- Each chunk gets its own embedding for better semantic search coverage
CREATE TABLE url_embedding_chunks (
    id TEXT PRIMARY KEY,
    url_attachment_id TEXT NOT NULL REFERENCES url_attachments(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,           -- 0-based index of chunk
    chunk_text TEXT NOT NULL,               -- The actual text that was embedded
    char_start INTEGER NOT NULL,            -- Start position in original content
    char_end INTEGER NOT NULL,              -- End position in original content
    embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    model TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(url_attachment_id, chunk_index)
);

-- Index for efficient chunk lookups
CREATE INDEX idx_url_embedding_chunks_url_id ON url_embedding_chunks(url_attachment_id);
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations_run_successfully() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        
        run_migrations(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect();

        assert!(tables.contains(&"notes".to_string()));
        assert!(tables.contains(&"folders".to_string()));
        assert!(tables.contains(&"tags".to_string()));
        assert!(tables.contains(&"note_tags".to_string()));
        assert!(tables.contains(&"note_links".to_string()));
        assert!(tables.contains(&"conversations".to_string()));
        assert!(tables.contains(&"messages".to_string()));
        assert!(tables.contains(&"message_context".to_string()));
        assert!(tables.contains(&"boards".to_string()));
        assert!(tables.contains(&"board_lanes".to_string()));
        assert!(tables.contains(&"board_cards".to_string()));
        assert!(tables.contains(&"calendar_events".to_string()));
        assert!(tables.contains(&"exports".to_string()));
        assert!(tables.contains(&"url_attachments".to_string()));
        assert!(tables.contains(&"url_embeddings".to_string()));
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        
        // Run migrations twice - should not error
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }
}
