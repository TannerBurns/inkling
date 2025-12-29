//! Google Calendar API client
//!
//! Fetches calendar events from Google Calendar and syncs them to the local database.

use chrono::{DateTime, Utc};
use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::db::calendar_events;
use crate::db::connection::DbPool;
use crate::models::{CalendarEvent, CreateCalendarEventInput};

use super::oauth::{refresh_token_if_needed_with_pool, urlencoding, GoogleAuthError};

const GOOGLE_CALENDAR_API: &str = "https://www.googleapis.com/calendar/v3";

#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum GoogleCalendarError {
    #[error("Auth error: {0}")]
    AuthError(#[from] GoogleAuthError),
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Database error: {0}")]
    DbError(String),
    #[error("API error: {0}")]
    ApiError(String),
}

/// Google Calendar creator/organizer info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventPerson {
    pub email: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    /// True if this is the authenticated user
    #[serde(rename = "self")]
    pub is_self: Option<bool>,
}

/// A Google Calendar event from the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarEvent {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub start: GoogleDateTime,
    pub end: Option<GoogleDateTime>,
    pub attendees: Option<Vec<GoogleAttendee>>,
    /// The creator of the event
    pub creator: Option<GoogleEventPerson>,
    /// The organizer of the event
    pub organizer: Option<GoogleEventPerson>,
    #[serde(rename = "hangoutLink")]
    pub hangout_link: Option<String>,
    #[serde(rename = "htmlLink")]
    pub html_link: Option<String>,
    pub recurrence: Option<Vec<String>>,
    pub status: Option<String>,
    /// Event type: "default", "outOfOffice", "focusTime", "workingLocation"
    #[serde(rename = "eventType")]
    pub event_type: Option<String>,
    /// Conference data (for Zoom, Teams, Meet, etc.)
    #[serde(rename = "conferenceData")]
    pub conference_data: Option<GoogleConferenceData>,
}

/// Google Calendar conference data (for video meetings)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleConferenceData {
    #[serde(rename = "entryPoints")]
    pub entry_points: Option<Vec<GoogleConferenceEntryPoint>>,
}

/// Conference entry point (video link, phone, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleConferenceEntryPoint {
    /// Type of entry point: "video", "phone", "sip", "more"
    #[serde(rename = "entryPointType")]
    pub entry_point_type: Option<String>,
    /// The URI to join (e.g., https://meet.google.com/xxx or https://zoom.us/j/xxx)
    pub uri: Option<String>,
    /// Label for the entry point
    pub label: Option<String>,
}

/// Google Calendar date/time representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDateTime {
    /// For timed events
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    /// For all-day events
    pub date: Option<String>,
    #[serde(rename = "timeZone")]
    pub time_zone: Option<String>,
}

/// Google Calendar attendee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAttendee {
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "responseStatus")]
    pub response_status: Option<String>,
    #[serde(rename = "self")]
    pub is_self: Option<bool>,
    pub organizer: Option<bool>,
}

/// Response from Google Calendar events list API
#[derive(Debug, Deserialize)]
struct EventsListResponse {
    items: Option<Vec<GoogleCalendarEvent>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

/// Sync result information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub events_synced: usize,
    pub events_added: usize,
    pub events_updated: usize,
    pub events_removed: usize,
}

impl GoogleDateTime {
    /// Parse into a DateTime<Utc>
    pub fn to_datetime(&self) -> Option<DateTime<Utc>> {
        if let Some(ref dt_str) = self.date_time {
            // Parse RFC3339 format
            DateTime::parse_from_rfc3339(dt_str)
                .map(|dt| dt.with_timezone(&Utc))
                .ok()
        } else if let Some(ref date_str) = self.date {
            // Parse date-only format (YYYY-MM-DD)
            chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .map(|naive| DateTime::from_naive_utc_and_offset(naive, Utc))
        } else {
            None
        }
    }
    
    /// Check if this is an all-day event
    pub fn is_all_day(&self) -> bool {
        self.date.is_some() && self.date_time.is_none()
    }
}

/// Fetch events from Google Calendar API (pool version)
pub async fn fetch_events_with_pool(
    pool: &DbPool,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<GoogleCalendarEvent>, GoogleCalendarError> {
    // Get a valid access token (refreshing if needed)
    let access_token = refresh_token_if_needed_with_pool(pool).await?;
    
    let client = Client::new();
    let mut all_events = Vec::new();
    let mut page_token: Option<String> = None;
    
    // Extend the query range by 1 day on each side to account for timezone differences
    // with all-day events. Google's Calendar API interprets all-day event dates in the
    // calendar's timezone, which may differ from UTC. By padding the range, we ensure
    // we capture all-day events that might otherwise be excluded due to timezone boundary issues.
    let padded_start = start - chrono::Duration::days(1);
    let padded_end = end + chrono::Duration::days(1);
    
    loop {
        // URL-encode the datetime values (they contain + and : which need encoding)
        let time_min = urlencoding::encode(&padded_start.to_rfc3339());
        let time_max = urlencoding::encode(&padded_end.to_rfc3339());
        
        let mut url = format!(
            "{}/calendars/primary/events?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime&maxResults=250",
            GOOGLE_CALENDAR_API,
            time_min,
            time_max,
        );
        
        if let Some(ref token) = page_token {
            url.push_str(&format!("&pageToken={}", token));
        }
        
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            
            // Check for insufficient scopes error (403 with ACCESS_TOKEN_SCOPE_INSUFFICIENT)
            // This happens when the token was obtained with different scopes than currently required.
            // The only fix is to re-authenticate with the correct scopes.
            if status.as_u16() == 403 && 
               (error_text.contains("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || 
                error_text.contains("insufficientPermissions") ||
                error_text.contains("insufficient authentication scopes")) {
                // Clear the account to force re-authentication with correct scopes
                if let Ok(conn) = pool.get() {
                    let _ = super::oauth::disconnect_account(&conn);
                    log::warn!("Google token has insufficient scopes - cleared account. User needs to reconnect.");
                }
                return Err(GoogleCalendarError::ApiError(
                    "Your Google Calendar permissions have changed. Please reconnect your Google account in Settings to restore sync.".to_string()
                ));
            }
            
            return Err(GoogleCalendarError::ApiError(format!(
                "Failed to fetch events: {}",
                error_text
            )));
        }
        
        let events_response: EventsListResponse = response.json().await?;
        
        if let Some(items) = events_response.items {
            // Filter out cancelled events
            let active_events: Vec<_> = items
                .into_iter()
                .filter(|e| e.status.as_deref() != Some("cancelled"))
                .collect();
            all_events.extend(active_events);
        }
        
        page_token = events_response.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    
    Ok(all_events)
}

/// Convert a Google Calendar event to our internal format
fn google_event_to_internal(event: &GoogleCalendarEvent) -> Option<CreateCalendarEventInput> {
    let start_time = event.start.to_datetime()?;
    let end_time = event.end.as_ref().and_then(|e| e.to_datetime());
    let all_day = event.start.is_all_day();
    
    // Keep original description only (don't embed attendees/links)
    let description = event.description.clone();
    
    // Determine response status
    // 1. First, check if we're in the attendees list (multi-person meetings)
    // 2. If no attendees or we're the creator/organizer, we implicitly accepted
    let mut response_status: Option<crate::models::EventResponseStatus> = None;
    
    // Check if we're the creator or organizer of this event
    let is_creator = event.creator.as_ref().map(|c| c.is_self == Some(true)).unwrap_or(false);
    let is_organizer = event.organizer.as_ref().map(|o| o.is_self == Some(true)).unwrap_or(false);
    
    // Build attendees list and find our response status
    let mut attendees_list: Vec<crate::models::EventAttendee> = Vec::new();
    
    if let Some(ref attendees) = event.attendees {
        for attendee in attendees {
            // Get response status for self
            if attendee.is_self == Some(true) {
                if let Some(ref status) = attendee.response_status {
                    response_status = Some(crate::models::EventResponseStatus::from_str(status));
                }
            }
            
            // Add all attendees (except self) to the list
            if attendee.is_self != Some(true) {
                attendees_list.push(crate::models::EventAttendee {
                    email: attendee.email.clone(),
                    name: attendee.display_name.clone(),
                    response_status: attendee.response_status.clone(),
                    is_organizer: attendee.organizer.unwrap_or(false),
                });
            }
        }
    }
    
    // If no explicit response status found, determine based on ownership
    if response_status.is_none() {
        let event_status = event.status.as_deref().unwrap_or("confirmed");
        
        // If we created or organize this event, or it's a confirmed event on our calendar
        // with no attendees, we've implicitly accepted it
        if event_status == "confirmed" && (is_creator || is_organizer || event.attendees.is_none()) {
            response_status = Some(crate::models::EventResponseStatus::Accepted);
        }
    }
    
    // Get meeting link - check hangoutLink first, then conferenceData entry points
    let meeting_link = event.hangout_link.clone().or_else(|| {
        // Look for a video entry point in conferenceData
        event.conference_data.as_ref().and_then(|conf| {
            conf.entry_points.as_ref().and_then(|entry_points| {
                // Find the first "video" entry point
                entry_points.iter()
                    .find(|ep| ep.entry_point_type.as_deref() == Some("video"))
                    .and_then(|ep| ep.uri.clone())
            })
        })
    });
    
    // Build recurrence rule
    let recurrence_rule = event.recurrence.as_ref().and_then(|rules| {
        rules.iter().find(|r| r.starts_with("RRULE:")).cloned()
    });
    
    // Get event type (default, outOfOffice, focusTime, workingLocation)
    let event_type = event.event_type.as_deref()
        .map(crate::models::CalendarEventType::from_str);
    
    // Only include attendees if there are any
    let attendees = if attendees_list.is_empty() {
        None
    } else {
        Some(attendees_list)
    };
    
    Some(CreateCalendarEventInput {
        title: event.summary.clone().unwrap_or_else(|| "(No title)".to_string()),
        description,
        start_time,
        end_time,
        all_day,
        recurrence_rule,
        linked_note_id: None,
        event_type,
        response_status,
        attendees,
        meeting_link,
    })
}

/// Sync Google Calendar events to the local database (pool version)
pub async fn sync_events_to_db_with_pool(
    pool: &DbPool,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<SyncResult, GoogleCalendarError> {
    // Fetch events from Google (async HTTP calls)
    let google_events = fetch_events_with_pool(pool, start, end).await?;
    
    // Now do all database operations synchronously
    let conn = pool.get().map_err(|e| GoogleCalendarError::DbError(e.to_string()))?;
    
    let mut result = SyncResult {
        events_synced: google_events.len(),
        events_added: 0,
        events_updated: 0,
        events_removed: 0,
    };
    
    // First, clean up any existing duplicate events from previous syncs
    let duplicates_removed = calendar_events::cleanup_duplicate_google_events(&conn)
        .map_err(|e| GoogleCalendarError::DbError(e.to_string()))?;
    if duplicates_removed > 0 {
        result.events_removed += duplicates_removed;
    }
    
    // Build a set of Google event IDs we receive from Google for this date range
    let mut google_event_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    
    // Upsert events from Google
    for google_event in &google_events {
        google_event_ids.insert(google_event.id.clone());
        
        if let Some(input) = google_event_to_internal(google_event) {
            // Check for existing event by external_id across ALL events (not just date range)
            // This prevents duplicates when all-day events have timezone edge cases
            let existing = calendar_events::get_event_by_external_id(&conn, &google_event.id)
                .map_err(|e| GoogleCalendarError::DbError(e.to_string()))?;
            
            if let Some(existing_event) = existing {
                // Update existing event
                let update = crate::models::UpdateCalendarEventInput {
                    title: Some(input.title),
                    description: input.description,
                    start_time: Some(input.start_time),
                    end_time: input.end_time,
                    all_day: Some(input.all_day),
                    recurrence_rule: input.recurrence_rule,
                    linked_note_id: None, // Preserve existing link
                    event_type: input.event_type,
                    response_status: input.response_status,
                    attendees: input.attendees,
                    meeting_link: input.meeting_link,
                };
                
                if calendar_events::update_event(&conn, &existing_event.id, update).is_ok() {
                    result.events_updated += 1;
                }
            } else {
                // Create new event
                if create_google_event(&conn, &google_event.id, input).is_ok() {
                    result.events_added += 1;
                }
            }
        }
    }
    
    // Remove Google events that are in our database but no longer exist in Google for this date range
    // We check ALL our Google events and remove ones whose start_time falls within the sync range
    // but were not returned by Google (meaning they were deleted or moved)
    //
    // IMPORTANT: For all-day events, we need to use date-based comparison rather than datetime-based
    // because all-day events are stored with midnight UTC times, but the sync range uses the user's
    // local timezone converted to UTC. This can cause misalignment where an all-day event's start_time
    // (midnight UTC) doesn't fall within the sync range (e.g., 08:00 UTC for a UTC-8 user).
    let all_our_google_events = calendar_events::get_all_google_events(&conn)
        .map_err(|e| GoogleCalendarError::DbError(e.to_string()))?;
    
    // Calculate date-only boundaries for comparing all-day events
    // We use the DATE portion only, treating the sync range as inclusive of any day it touches
    let start_date = start.date_naive();
    let end_date = end.date_naive();
    
    for event in all_our_google_events {
        // Determine if this event falls within the sync range
        let is_in_range = if event.all_day {
            // For all-day events, compare using dates only to avoid timezone issues
            // An all-day event is in range if its date falls within or overlaps the sync date range
            let event_date = event.start_time.date_naive();
            event_date >= start_date && event_date <= end_date
        } else {
            // For timed events, use the original datetime comparison
            event.start_time >= start && event.start_time < end
        };
        
        if is_in_range {
            if let Some(ref external_id) = event.external_id {
                // If this event wasn't returned by Google, it was deleted
                if !google_event_ids.contains(external_id)
                    && calendar_events::delete_event(&conn, &event.id).is_ok()
                {
                    result.events_removed += 1;
                }
            }
        }
    }
    
    Ok(result)
}

/// Create a new event from Google Calendar
fn create_google_event(
    conn: &Connection,
    external_id: &str,
    input: CreateCalendarEventInput,
) -> Result<CalendarEvent, GoogleCalendarError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let start_time = input.start_time.format("%Y-%m-%d %H:%M:%S").to_string();
    let end_time = input.end_time.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
    let event_type = input.event_type.as_ref().map(|t| t.as_str()).unwrap_or("default");
    let response_status = input.response_status.as_ref().map(|s| s.as_str());
    let attendees_json = input.attendees.as_ref().and_then(|a| serde_json::to_string(a).ok());
    
    conn.execute(
        "INSERT INTO calendar_events (id, title, description, start_time, end_time, all_day, recurrence_rule, source, external_id, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'google', ?8, NULL, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            id,
            input.title,
            input.description,
            start_time,
            end_time,
            input.all_day,
            input.recurrence_rule,
            external_id,
            event_type,
            response_status,
            attendees_json,
            input.meeting_link,
            now,
            now,
        ],
    ).map_err(|e| GoogleCalendarError::DbError(e.to_string()))?;
    
    calendar_events::get_event(conn, &id)
        .map_err(|e| GoogleCalendarError::DbError(e.to_string()))?
        .ok_or_else(|| GoogleCalendarError::DbError("Failed to retrieve created event".to_string()))
}

/// Get extended event info for meeting notes (attendees, meet link)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMeetingInfo {
    pub attendees: Vec<String>,
    pub meeting_link: Option<String>,
    pub original_description: Option<String>,
}

/// Parse meeting info from a Google event's description
/// (We embed this info when syncing)
pub fn parse_meeting_info(description: Option<&str>) -> EventMeetingInfo {
    let mut info = EventMeetingInfo {
        attendees: Vec::new(),
        meeting_link: None,
        original_description: None,
    };
    
    if let Some(desc) = description {
        // Extract attendees
        if let Some(attendees_start) = desc.find("**Attendees:**") {
            let after_label = &desc[attendees_start + 14..];
            if let Some(end) = after_label.find("\n\n") {
                let attendees_str = after_label[..end].trim();
                info.attendees = attendees_str
                    .split(", ")
                    .map(|s| s.trim().to_string())
                    .collect();
            } else {
                info.attendees = after_label
                    .trim()
                    .split(", ")
                    .map(|s| s.trim().to_string())
                    .collect();
            }
        }
        
        // Extract meeting link
        if let Some(link_start) = desc.find("**Meeting Link:**") {
            let after_label = &desc[link_start + 17..];
            if let Some(end) = after_label.find("\n") {
                info.meeting_link = Some(after_label[..end].trim().to_string());
            } else {
                info.meeting_link = Some(after_label.trim().to_string());
            }
        }
        
        // Extract original description (before our additions)
        if let Some(attendees_pos) = desc.find("\n\n**Attendees:**") {
            info.original_description = Some(desc[..attendees_pos].to_string());
        } else if let Some(link_pos) = desc.find("\n\n**Meeting Link:**") {
            info.original_description = Some(desc[..link_pos].to_string());
        } else {
            info.original_description = Some(desc.to_string());
        }
    }
    
    info
}

