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
