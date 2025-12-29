use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A note in the knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: Option<String>,
    pub content_html: Option<String>,
    pub folder_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_deleted: bool,
}

/// Input for creating a new note
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub title: String,
    pub content: Option<String>,
    pub content_html: Option<String>,
    pub folder_id: Option<String>,
}

/// Input for updating an existing note
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub content_html: Option<String>,
    pub folder_id: Option<String>,
}

/// A folder for organizing notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Input for creating a new folder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub name: String,
    pub parent_id: Option<String>,
}

/// Input for updating an existing folder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFolderInput {
    pub name: Option<String>,
    pub parent_id: Option<String>,
}

/// A tag for categorizing notes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

/// A link between two notes (wiki-style reference)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub source_note_id: String,
    pub target_note_id: String,
    pub context: Option<String>,
}

// ============================================================================
// Board Models (Kanban)
// ============================================================================

/// A Kanban board associated with a folder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub folder_id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new board
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBoardInput {
    pub folder_id: String,
    pub name: String,
}

/// Input for updating a board
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBoardInput {
    pub name: Option<String>,
}

/// A lane (column) in a Kanban board
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardLane {
    pub id: String,
    pub board_id: String,
    pub name: String,
    pub color: Option<String>,
    pub position: i32,
}

/// Input for creating a new lane
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLaneInput {
    pub board_id: String,
    pub name: String,
    pub color: Option<String>,
}

/// Input for updating a lane
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLaneInput {
    pub name: Option<String>,
    pub color: Option<String>,
}

/// A card (note reference) on a board
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardCard {
    pub id: String,
    pub board_id: String,
    pub lane_id: String,
    pub note_id: String,
    pub position: i32,
}

/// A card with note details for display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardCardWithNote {
    pub id: String,
    pub board_id: String,
    pub lane_id: String,
    pub note_id: String,
    pub position: i32,
    pub note_title: String,
    pub note_folder_path: Option<String>,
}

/// Input for adding a card to a lane
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCardInput {
    pub board_id: String,
    pub lane_id: String,
    pub note_id: String,
}

/// Input for moving a card
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCardInput {
    pub card_id: String,
    pub target_lane_id: String,
    pub target_position: i32,
}

/// A board with all its lanes and cards
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardWithDetails {
    pub board: Board,
    pub lanes: Vec<BoardLane>,
    pub cards: Vec<BoardCardWithNote>,
}

// ============================================================================
// Chat & Conversation Models
// ============================================================================

/// Role of a message sender
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl MessageRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "user" => Some(MessageRole::User),
            "assistant" => Some(MessageRole::Assistant),
            "system" => Some(MessageRole::System),
            _ => None,
        }
    }
}

/// A chat conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: Option<String>,
    pub system_prompt: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: MessageRole,
    pub content: String,
    pub metadata: Option<MessageMetadata>,
    pub created_at: DateTime<Utc>,
}

/// Metadata associated with a message (citations, token usage, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageMetadata {
    /// Notes cited in the response
    #[serde(default)]
    pub citations: Vec<Citation>,
    /// Model used for generation
    pub model: Option<String>,
    /// Token usage statistics
    pub usage: Option<TokenUsage>,
    /// Tool calls made during this response
    #[serde(default)]
    pub tool_calls: Vec<ToolCallRecord>,
    /// Thinking/reasoning content from the AI (for display in history)
    #[serde(default)]
    pub thinking_content: Option<String>,
}

/// A record of a tool call made during message generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    /// Name of the tool that was called
    pub tool: String,
    /// Whether the tool call succeeded
    pub success: bool,
    /// Optional preview/summary of the result
    pub preview: Option<String>,
}

/// A citation to a note in an AI response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub note_id: String,
    pub note_title: String,
    /// Relevance score (0-1)
    pub relevance: f32,
}

/// Token usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Context attached to a message (note reference)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageContext {
    pub id: String,
    pub message_id: String,
    pub note_id: String,
    pub content_snippet: Option<String>,
    pub is_full_note: bool,
}

/// A context item for chat requests (note or snippet to include)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextItem {
    pub note_id: String,
    pub note_title: String,
    /// Selected content if not the whole note
    pub content_snippet: Option<String>,
    pub is_full_note: bool,
}

/// Input for sending a chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    /// The message content
    pub content: String,
    /// Conversation ID (None to create a new conversation)
    pub conversation_id: Option<String>,
    /// Session ID for streaming events (frontend-generated)
    pub session_id: Option<String>,
    /// Explicitly attached context (notes/snippets)
    #[serde(default)]
    pub context: Vec<ContextItem>,
    /// Number of notes to auto-retrieve via RAG
    #[serde(default = "default_auto_retrieve_count")]
    pub auto_retrieve_count: usize,
}

fn default_auto_retrieve_count() -> usize {
    0 // Agent should use tools to access notes instead of auto-retrieve
}

/// Response from sending a chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    /// The conversation (created or existing)
    pub conversation: Conversation,
    /// The user message that was saved
    pub user_message: Message,
    /// The assistant response
    pub assistant_message: Message,
}

/// Input for creating a new conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationInput {
    pub title: Option<String>,
    pub system_prompt: Option<String>,
}

/// Input for updating a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConversationInput {
    pub title: Option<String>,
    pub system_prompt: Option<String>,
}

/// A conversation with its messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationWithMessages {
    pub conversation: Conversation,
    pub messages: Vec<Message>,
}

/// A conversation preview for the history list
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPreview {
    pub conversation: Conversation,
    /// Total number of messages
    pub message_count: u32,
    /// First user message content (preview)
    pub first_message_preview: Option<String>,
}

/// Stream event for chat responses
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum ChatStreamEvent {
    /// A chunk of reasoning/thinking content (shown in a special block)
    #[serde(rename = "thinking")]
    Thinking { content: String },
    /// A chunk of the response content
    #[serde(rename = "chunk")]
    Chunk { content: String },
    /// A tool call has started
    #[serde(rename = "tool_start")]
    ToolStart {
        tool: String,
        args: serde_json::Value,
    },
    /// A tool call has completed
    #[serde(rename = "tool_result")]
    ToolResult {
        tool: String,
        success: bool,
        preview: Option<String>,
    },
    /// The complete response with metadata
    #[serde(rename = "complete")]
    Complete { message: Message },
    /// An error occurred
    #[serde(rename = "error")]
    Error { message: String },
}

// ============================================================================
// Calendar Event Models
// ============================================================================

/// Source of a calendar event
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CalendarEventSource {
    Manual,
    Google,
}

impl CalendarEventSource {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "manual" => Some(CalendarEventSource::Manual),
            "google" => Some(CalendarEventSource::Google),
            _ => None,
        }
    }
}

/// Event type for Google Calendar events
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CalendarEventType {
    Default,
    OutOfOffice,
    FocusTime,
    WorkingLocation,
}

impl CalendarEventType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "outOfOffice" => CalendarEventType::OutOfOffice,
            "focusTime" => CalendarEventType::FocusTime,
            "workingLocation" => CalendarEventType::WorkingLocation,
            _ => CalendarEventType::Default,
        }
    }
    
    pub fn as_str(&self) -> &'static str {
        match self {
            CalendarEventType::Default => "default",
            CalendarEventType::OutOfOffice => "outOfOffice",
            CalendarEventType::FocusTime => "focusTime",
            CalendarEventType::WorkingLocation => "workingLocation",
        }
    }
}

/// Response status for calendar events (your RSVP status)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum EventResponseStatus {
    /// You haven't responded yet
    NeedsAction,
    /// You declined the invitation
    Declined,
    /// You tentatively accepted (maybe)
    Tentative,
    /// You accepted the invitation
    Accepted,
}

impl EventResponseStatus {
    pub fn from_str(s: &str) -> Self {
        match s {
            "declined" => EventResponseStatus::Declined,
            "tentative" => EventResponseStatus::Tentative,
            "accepted" => EventResponseStatus::Accepted,
            _ => EventResponseStatus::NeedsAction,
        }
    }
    
    pub fn as_str(&self) -> &'static str {
        match self {
            EventResponseStatus::NeedsAction => "needsAction",
            EventResponseStatus::Declined => "declined",
            EventResponseStatus::Tentative => "tentative",
            EventResponseStatus::Accepted => "accepted",
        }
    }
}

/// An attendee of a calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAttendee {
    pub email: String,
    pub name: Option<String>,
    pub response_status: Option<String>,
    pub is_organizer: bool,
}

/// A calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub all_day: bool,
    pub recurrence_rule: Option<String>,
    pub source: CalendarEventSource,
    pub external_id: Option<String>,
    pub linked_note_id: Option<String>,
    /// Event type (for Google events: default, outOfOffice, focusTime, workingLocation)
    pub event_type: CalendarEventType,
    /// Your response status (for Google events: accepted, declined, tentative, needsAction)
    pub response_status: Option<EventResponseStatus>,
    /// List of attendees (for Google events)
    pub attendees: Option<Vec<EventAttendee>>,
    /// Video call link (for Google events with Meet/Zoom/etc)
    pub meeting_link: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCalendarEventInput {
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub all_day: bool,
    pub recurrence_rule: Option<String>,
    pub linked_note_id: Option<String>,
    /// Event type (optional, defaults to Default)
    pub event_type: Option<CalendarEventType>,
    /// Response status (for Google events)
    pub response_status: Option<EventResponseStatus>,
    /// List of attendees
    pub attendees: Option<Vec<EventAttendee>>,
    /// Video call link
    pub meeting_link: Option<String>,
}

/// Input for updating a calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCalendarEventInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub all_day: Option<bool>,
    pub recurrence_rule: Option<String>,
    pub linked_note_id: Option<String>,
    /// Event type (for Google events)
    pub event_type: Option<CalendarEventType>,
    /// Response status (for Google events)
    pub response_status: Option<EventResponseStatus>,
    /// List of attendees
    pub attendees: Option<Vec<EventAttendee>>,
    /// Video call link
    pub meeting_link: Option<String>,
}

/// A calendar event with linked note details
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventWithNote {
    #[serde(flatten)]
    pub event: CalendarEvent,
    pub linked_note_title: Option<String>,
}
