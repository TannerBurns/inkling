use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{
    CalendarEvent, CalendarEventSource, CalendarEventType, CalendarEventWithNote, CreateCalendarEventInput,
    EventAttendee, EventResponseStatus, UpdateCalendarEventInput,
};

#[derive(Error, Debug)]
pub enum CalendarEventDbError {
    #[error("SQLite error: {0}")]
    SqliteError(#[from] rusqlite::Error),
    #[error("Calendar event not found: {0}")]
    NotFound(String),
}

/// Parse a datetime string from SQLite into a DateTime<Utc>
fn parse_datetime(s: &str) -> DateTime<Utc> {
    // Try RFC3339 format first
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc);
    }
    // Try SQLite's default format
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Utc.from_utc_datetime(&naive);
    }
    // Fallback to now if parsing fails
    Utc::now()
}

/// Parse an optional datetime string
fn parse_datetime_opt(s: Option<String>) -> Option<DateTime<Utc>> {
    s.map(|s| parse_datetime(&s))
}

/// Map a database row to a CalendarEvent struct
fn row_to_event(row: &Row) -> Result<CalendarEvent, rusqlite::Error> {
    let start_time_str: String = row.get(3)?;
    let end_time_str: Option<String> = row.get(4)?;
    let source_str: String = row.get(7)?;
    let event_type_str: String = row.get(10)?;
    let response_status_str: Option<String> = row.get(11)?;
    let attendees_json: Option<String> = row.get(12)?;
    let meeting_link: Option<String> = row.get(13)?;
    let created_at_str: String = row.get(14)?;
    let updated_at_str: String = row.get(15)?;

    let source = CalendarEventSource::from_str(&source_str).unwrap_or(CalendarEventSource::Manual);
    let event_type = CalendarEventType::from_str(&event_type_str);
    let response_status = response_status_str.map(|s| EventResponseStatus::from_str(&s));
    
    // Parse attendees from JSON
    let attendees: Option<Vec<EventAttendee>> = attendees_json.and_then(|json| {
        serde_json::from_str(&json).ok()
    });

    Ok(CalendarEvent {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        start_time: parse_datetime(&start_time_str),
        end_time: parse_datetime_opt(end_time_str),
        all_day: row.get(5)?,
        recurrence_rule: row.get(6)?,
        source,
        external_id: row.get(8)?,
        linked_note_id: row.get(9)?,
        event_type,
        response_status,
        attendees,
        meeting_link,
        created_at: parse_datetime(&created_at_str),
        updated_at: parse_datetime(&updated_at_str),
    })
}

/// Map a database row to a CalendarEventWithNote struct
fn row_to_event_with_note(row: &Row) -> Result<CalendarEventWithNote, rusqlite::Error> {
    let event = row_to_event(row)?;
    let linked_note_title: Option<String> = row.get(16)?;

    Ok(CalendarEventWithNote {
        event,
        linked_note_title,
    })
}

/// Create a new calendar event
pub fn create_event(
    conn: &Connection,
    input: CreateCalendarEventInput,
) -> Result<CalendarEvent, CalendarEventDbError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let start_time = input.start_time.format("%Y-%m-%d %H:%M:%S").to_string();
    let end_time = input
        .end_time
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
    
    // Convert new fields to their storage format
    let event_type_str = input.event_type.unwrap_or(CalendarEventType::Default).as_str();
    let response_status_str = input.response_status.as_ref().map(|s| s.as_str());
    let attendees_json = input.attendees.as_ref().and_then(|a| serde_json::to_string(a).ok());

    conn.execute(
        "INSERT INTO calendar_events (id, title, description, start_time, end_time, all_day, recurrence_rule, source, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual', ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            id,
            input.title,
            input.description,
            start_time,
            end_time,
            input.all_day,
            input.recurrence_rule,
            input.linked_note_id,
            event_type_str,
            response_status_str,
            attendees_json,
            input.meeting_link,
            now,
            now,
        ],
    )?;

    get_event(conn, &id)?.ok_or(CalendarEventDbError::NotFound(id))
}

/// Get a calendar event by ID
pub fn get_event(conn: &Connection, id: &str) -> Result<Option<CalendarEvent>, CalendarEventDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_time, end_time, all_day, recurrence_rule, source, external_id, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at
         FROM calendar_events WHERE id = ?1",
    )?;

    let event = stmt.query_row([id], row_to_event).optional()?;
    Ok(event)
}

/// Get a calendar event by ID with linked note details
pub fn get_event_with_note(
    conn: &Connection,
    id: &str,
) -> Result<Option<CalendarEventWithNote>, CalendarEventDbError> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.recurrence_rule, e.source, e.external_id, e.linked_note_id, e.event_type, e.response_status, e.attendees, e.meeting_link, e.created_at, e.updated_at, n.title as note_title
         FROM calendar_events e
         LEFT JOIN notes n ON e.linked_note_id = n.id
         WHERE e.id = ?1",
    )?;

    let event = stmt.query_row([id], row_to_event_with_note).optional()?;
    Ok(event)
}

/// Get all calendar events
pub fn get_all_events(conn: &Connection) -> Result<Vec<CalendarEvent>, CalendarEventDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_time, end_time, all_day, recurrence_rule, source, external_id, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at
         FROM calendar_events ORDER BY start_time ASC",
    )?;

    let events = stmt
        .query_map([], row_to_event)?
        .filter_map(Result::ok)
        .collect();

    Ok(events)
}

/// Get calendar events within a date range
pub fn get_events_in_range(
    conn: &Connection,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<CalendarEventWithNote>, CalendarEventDbError> {
    let start_str = start.format("%Y-%m-%d %H:%M:%S").to_string();
    let end_str = end.format("%Y-%m-%d %H:%M:%S").to_string();
    
    // For all-day events, we need to use date-based comparison because they're stored
    // at midnight UTC, but the query range uses the user's local timezone converted to UTC.
    // This can cause all-day events to be missed if the user's timezone offset pushes
    // midnight UTC outside the query range.
    //
    // We use the DATE portion for all-day events comparison:
    // - Extract just the date from start_time for all-day events
    // - Compare against the date range boundaries
    let start_date = start.format("%Y-%m-%d").to_string();
    let end_date = end.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare(
        "SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.recurrence_rule, e.source, e.external_id, e.linked_note_id, e.event_type, e.response_status, e.attendees, e.meeting_link, e.created_at, e.updated_at, n.title as note_title
         FROM calendar_events e
         LEFT JOIN notes n ON e.linked_note_id = n.id
         WHERE 
           CASE 
             WHEN e.all_day = 1 THEN 
               -- For all-day events, compare using date only
               date(e.start_time) >= date(?3) AND date(e.start_time) <= date(?4)
             ELSE 
               -- For timed events, use datetime comparison
               e.start_time >= ?1 AND e.start_time < ?2
           END
         ORDER BY e.start_time ASC",
    )?;

    let events = stmt
        .query_map(params![start_str, end_str, start_date, end_date], row_to_event_with_note)?
        .filter_map(Result::ok)
        .collect();

    Ok(events)
}

/// Get calendar events for a specific date (all events that occur on that day)
pub fn get_events_for_date(
    conn: &Connection,
    date: &str, // YYYY-MM-DD format
) -> Result<Vec<CalendarEventWithNote>, CalendarEventDbError> {
    let start_str = format!("{} 00:00:00", date);
    let end_str = format!("{} 23:59:59", date);

    let mut stmt = conn.prepare(
        "SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.all_day, e.recurrence_rule, e.source, e.external_id, e.linked_note_id, e.event_type, e.response_status, e.attendees, e.meeting_link, e.created_at, e.updated_at, n.title as note_title
         FROM calendar_events e
         LEFT JOIN notes n ON e.linked_note_id = n.id
         WHERE (e.start_time >= ?1 AND e.start_time <= ?2)
            OR (e.end_time >= ?1 AND e.end_time <= ?2)
            OR (e.start_time <= ?1 AND e.end_time >= ?2)
         ORDER BY e.start_time ASC",
    )?;

    let events = stmt
        .query_map(params![start_str, end_str], row_to_event_with_note)?
        .filter_map(Result::ok)
        .collect();

    Ok(events)
}

/// Update an existing calendar event
pub fn update_event(
    conn: &Connection,
    id: &str,
    input: UpdateCalendarEventInput,
) -> Result<CalendarEvent, CalendarEventDbError> {
    let existing = get_event(conn, id)?.ok_or_else(|| CalendarEventDbError::NotFound(id.to_string()))?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let title = input.title.unwrap_or(existing.title);
    let description = input.description.or(existing.description);
    let start_time = input.start_time.unwrap_or(existing.start_time);
    let end_time = input.end_time.or(existing.end_time);
    let all_day = input.all_day.unwrap_or(existing.all_day);
    let recurrence_rule = input.recurrence_rule.or(existing.recurrence_rule);
    let linked_note_id = input.linked_note_id.or(existing.linked_note_id);
    let event_type = input.event_type.unwrap_or(existing.event_type);
    let response_status = input.response_status.or(existing.response_status);
    let attendees = input.attendees.or(existing.attendees);
    let meeting_link = input.meeting_link.or(existing.meeting_link);

    let start_time_str = start_time.format("%Y-%m-%d %H:%M:%S").to_string();
    let end_time_str = end_time.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
    let event_type_str = event_type.as_str();
    let response_status_str = response_status.as_ref().map(|s| s.as_str());
    let attendees_json = attendees.as_ref().and_then(|a| serde_json::to_string(a).ok());

    conn.execute(
        "UPDATE calendar_events SET title = ?1, description = ?2, start_time = ?3, end_time = ?4, all_day = ?5, recurrence_rule = ?6, linked_note_id = ?7, event_type = ?8, response_status = ?9, attendees = ?10, meeting_link = ?11, updated_at = ?12
         WHERE id = ?13",
        params![
            title,
            description,
            start_time_str,
            end_time_str,
            all_day,
            recurrence_rule,
            linked_note_id,
            event_type_str,
            response_status_str,
            attendees_json,
            meeting_link,
            now,
            id
        ],
    )?;

    get_event(conn, id)?.ok_or(CalendarEventDbError::NotFound(id.to_string()))
}

/// Delete a calendar event
pub fn delete_event(conn: &Connection, id: &str) -> Result<bool, CalendarEventDbError> {
    let rows_affected = conn.execute("DELETE FROM calendar_events WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Get a calendar event by its external_id (for Google sync deduplication)
pub fn get_event_by_external_id(conn: &Connection, external_id: &str) -> Result<Option<CalendarEvent>, CalendarEventDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_time, end_time, all_day, recurrence_rule, source, external_id, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at
         FROM calendar_events WHERE external_id = ?1",
    )?;

    let event = stmt.query_row([external_id], row_to_event).optional()?;
    Ok(event)
}

/// Get all Google calendar events (for sync cleanup)
pub fn get_all_google_events(conn: &Connection) -> Result<Vec<CalendarEvent>, CalendarEventDbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_time, end_time, all_day, recurrence_rule, source, external_id, linked_note_id, event_type, response_status, attendees, meeting_link, created_at, updated_at
         FROM calendar_events WHERE source = 'google' ORDER BY start_time ASC",
    )?;

    let events = stmt
        .query_map([], row_to_event)?
        .filter_map(Result::ok)
        .collect();

    Ok(events)
}

/// Remove duplicate Google events, keeping the one with the most recent updated_at
/// Returns the number of duplicates removed
pub fn cleanup_duplicate_google_events(conn: &Connection) -> Result<usize, CalendarEventDbError> {
    // Find and delete duplicates, keeping the one with the newest updated_at (or first by id if same)
    let deleted = conn.execute(
        "DELETE FROM calendar_events 
         WHERE source = 'google' 
         AND id NOT IN (
             SELECT id FROM (
                 SELECT id, external_id,
                        ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY updated_at DESC, id) as rn
                 FROM calendar_events
                 WHERE source = 'google' AND external_id IS NOT NULL
             ) WHERE rn = 1
         )
         AND external_id IS NOT NULL",
        [],
    )?;
    
    Ok(deleted)
}

/// Link a note to a calendar event
pub fn link_note_to_event(
    conn: &Connection,
    event_id: &str,
    note_id: &str,
) -> Result<CalendarEvent, CalendarEventDbError> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE calendar_events SET linked_note_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![note_id, now, event_id],
    )?;

    get_event(conn, event_id)?.ok_or(CalendarEventDbError::NotFound(event_id.to_string()))
}

/// Unlink a note from a calendar event
pub fn unlink_note_from_event(
    conn: &Connection,
    event_id: &str,
) -> Result<CalendarEvent, CalendarEventDbError> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE calendar_events SET linked_note_id = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, event_id],
    )?;

    get_event(conn, event_id)?.ok_or(CalendarEventDbError::NotFound(event_id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::init_test_pool;

    #[test]
    fn test_create_and_get_event() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateCalendarEventInput {
            title: "Team Meeting".to_string(),
            description: Some("Weekly sync".to_string()),
            start_time: Utc::now(),
            end_time: None,
            all_day: false,
            recurrence_rule: None,
            linked_note_id: None,
            event_type: None,
            response_status: None,
            attendees: None,
            meeting_link: None,
        };

        let event = create_event(&conn, input).unwrap();
        assert_eq!(event.title, "Team Meeting");
        assert_eq!(event.description, Some("Weekly sync".to_string()));
        assert_eq!(event.source, CalendarEventSource::Manual);

        let fetched = get_event(&conn, &event.id).unwrap().unwrap();
        assert_eq!(fetched.id, event.id);
    }

    #[test]
    fn test_update_event() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateCalendarEventInput {
            title: "Original Event".to_string(),
            description: None,
            start_time: Utc::now(),
            end_time: None,
            all_day: false,
            recurrence_rule: None,
            linked_note_id: None,
            event_type: None,
            response_status: None,
            attendees: None,
            meeting_link: None,
        };

        let event = create_event(&conn, input).unwrap();

        let update = UpdateCalendarEventInput {
            title: Some("Updated Event".to_string()),
            description: Some("Added description".to_string()),
            start_time: None,
            end_time: None,
            all_day: Some(true),
            recurrence_rule: None,
            linked_note_id: None,
            event_type: None,
            response_status: None,
            attendees: None,
            meeting_link: None,
        };

        let updated = update_event(&conn, &event.id, update).unwrap();
        assert_eq!(updated.title, "Updated Event");
        assert_eq!(updated.description, Some("Added description".to_string()));
        assert!(updated.all_day);
    }

    #[test]
    fn test_delete_event() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        let input = CreateCalendarEventInput {
            title: "To Delete".to_string(),
            description: None,
            start_time: Utc::now(),
            end_time: None,
            all_day: false,
            recurrence_rule: None,
            linked_note_id: None,
            event_type: None,
            response_status: None,
            attendees: None,
            meeting_link: None,
        };

        let event = create_event(&conn, input).unwrap();
        assert!(delete_event(&conn, &event.id).unwrap());

        // Event should no longer exist
        let deleted = get_event(&conn, &event.id).unwrap();
        assert!(deleted.is_none());
    }

    #[test]
    fn test_get_all_events() {
        let pool = init_test_pool().unwrap();
        let conn = pool.get().unwrap();

        // Create a few events
        for i in 0..3 {
            create_event(
                &conn,
                CreateCalendarEventInput {
                    title: format!("Event {}", i),
                    description: None,
                    start_time: Utc::now(),
                    end_time: None,
                    all_day: false,
                    recurrence_rule: None,
                    linked_note_id: None,
                    event_type: None,
                    response_status: None,
                    attendees: None,
                    meeting_link: None,
                },
            )
            .unwrap();
        }

        let all = get_all_events(&conn).unwrap();
        assert!(all.len() >= 3);
    }
}

