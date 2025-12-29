//! Calendar Tools
//!
//! Tools for accessing calendar events and creating new events.

use chrono::{Duration, Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::agent::ToolDefinition;
use crate::db::{self, connection::DbPool};

/// A calendar event result for the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventResult {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub linked_note_id: Option<String>,
    pub linked_note_title: Option<String>,
    pub meeting_link: Option<String>,
    /// Your RSVP status: "accepted", "declined", "tentative", or "needsAction"
    pub response_status: Option<String>,
}

// ============================================================================
// get_calendar_events Tool
// ============================================================================

/// Get the tool definition for get_calendar_events
pub fn get_calendar_events_tool() -> ToolDefinition {
    ToolDefinition::function(
        "get_calendar_events",
        "Get calendar events within a date range. Useful for understanding the user's schedule or finding upcoming events.",
        json!({
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format (defaults to today)"
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (defaults to 7 days from start)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of events to return (default: 10, max: 50)",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 50
                }
            },
            "required": []
        }),
    )
}

/// Parse a date string in YYYY-MM-DD format to a DateTime
fn parse_date(date_str: &str) -> Option<chrono::DateTime<Utc>> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    
    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;
    
    chrono::NaiveDate::from_ymd_opt(year, month, day)
        .map(|d| d.and_hms_opt(0, 0, 0).unwrap())
        .map(|dt| chrono::DateTime::from_naive_utc_and_offset(dt, Utc))
}

/// Execute the get_calendar_events tool
pub fn execute_get_calendar_events(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .min(50) as usize;

    // Parse start date or use today
    let start = if let Some(start_str) = args.get("start_date").and_then(|v| v.as_str()) {
        parse_date(start_str)
            .ok_or_else(|| format!("Invalid start_date format: '{}'. Use YYYY-MM-DD", start_str))?
    } else {
        Utc::now().date_naive().and_hms_opt(0, 0, 0)
            .map(|dt| chrono::DateTime::from_naive_utc_and_offset(dt, Utc))
            .unwrap()
    };

    // Parse end date or use 7 days from start
    let end = if let Some(end_str) = args.get("end_date").and_then(|v| v.as_str()) {
        parse_date(end_str)
            .ok_or_else(|| format!("Invalid end_date format: '{}'. Use YYYY-MM-DD", end_str))?
            // Add 1 day to include the end date fully
            + Duration::days(1)
    } else {
        start + Duration::days(7)
    };

    // Extend the query range by 1 day on each side to account for timezone differences.
    // Users specify dates in their local timezone, but events are stored in UTC.
    // For example, a user in UTC-8 asking for "January 11" events might have events
    // that are stored as early January 11 UTC (late January 10 local) or as early
    // January 12 UTC (late January 11 local). By padding the range, we ensure all
    // events that could fall on the requested local date are captured.
    let query_start = start - Duration::days(1);
    let query_end = end + Duration::days(1);

    // Get events in range (with padded boundaries)
    let events = db::calendar_events::get_events_in_range(&conn, query_start, query_end)
        .map_err(|e| format!("Failed to get events: {}", e))?;

    // For debugging: get total count of all events in the database
    let all_events = db::calendar_events::get_all_events(&conn)
        .map_err(|e| format!("Failed to get all events: {}", e))?;
    let total_events_in_db = all_events.len();

    let event_results: Vec<CalendarEventResult> = events
        .into_iter()
        // Filter out events you've declined - these shouldn't show up as "your" events
        .filter(|e| {
            match &e.event.response_status {
                Some(status) => status.as_str() != "declined",
                None => true, // Include events without a response status (manual events)
            }
        })
        .take(limit)
        .map(|e| {
            // Convert UTC times to local timezone for display
            // This matches what the user sees in the calendar UI
            let local_start = e.event.start_time.with_timezone(&Local);
            let local_end = e.event.end_time.map(|t| t.with_timezone(&Local));
            
            // Format times in a human-readable way for the AI
            // For all-day events, just show the date
            // For timed events, show date and time in local timezone
            let start_time_str = if e.event.all_day {
                local_start.format("%Y-%m-%d (all day)").to_string()
            } else {
                local_start.format("%Y-%m-%d %I:%M %p").to_string()
            };
            
            let end_time_str = local_end.map(|t| {
                if e.event.all_day {
                    t.format("%Y-%m-%d").to_string()
                } else {
                    t.format("%Y-%m-%d %I:%M %p").to_string()
                }
            });
            
            // Get response status as string for the AI
            let response_status = e.event.response_status.as_ref().map(|s| s.as_str().to_string());
            
            CalendarEventResult {
                id: e.event.id,
                title: e.event.title,
                description: e.event.description,
                start_time: start_time_str,
                end_time: end_time_str,
                all_day: e.event.all_day,
                linked_note_id: e.event.linked_note_id,
                linked_note_title: e.linked_note_title,
                meeting_link: e.event.meeting_link,
                response_status,
            }
        })
        .collect();

    if event_results.is_empty() {
        // Include debugging info about total events in database
        let debug_info = if total_events_in_db > 0 {
            // Show some info about what events DO exist
            let sample_dates: Vec<String> = all_events.iter()
                .take(5)
                .map(|e| e.start_time.format("%Y-%m-%d").to_string())
                .collect();
            format!(
                "Database has {} total events. Sample dates: {}. Query range was {} to {} (padded: {} to {})",
                total_events_in_db,
                sample_dates.join(", "),
                start.format("%Y-%m-%d"),
                end.format("%Y-%m-%d"),
                query_start.format("%Y-%m-%d"),
                query_end.format("%Y-%m-%d")
            )
        } else {
            "Database has 0 total events. Events may not be synced from Google Calendar yet.".to_string()
        };
        
        Ok(json!({
            "success": true,
            "events": [],
            "message": format!("No events found between {} and {}", 
                start.format("%Y-%m-%d"), 
                end.format("%Y-%m-%d")),
            "debug": debug_info,
            "total_events_in_db": total_events_in_db
        }).to_string())
    } else {
        Ok(json!({
            "success": true,
            "events": event_results,
            "count": event_results.len(),
            "date_range": {
                "start": start.format("%Y-%m-%d").to_string(),
                "end": end.format("%Y-%m-%d").to_string()
            }
        }).to_string())
    }
}

// ============================================================================
// create_calendar_event Tool (Inline Assistant Only)
// ============================================================================

/// Get the tool definition for create_calendar_event
pub fn get_create_calendar_event_tool() -> ToolDefinition {
    ToolDefinition::function(
        "create_calendar_event",
        "Create a new calendar event. Use this to schedule meetings, reminders, or deadlines.",
        json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the event"
                },
                "description": {
                    "type": "string",
                    "description": "Optional description or notes for the event"
                },
                "start_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format"
                },
                "start_time": {
                    "type": "string",
                    "description": "Start time in HH:MM format (24-hour). Omit for all-day events."
                },
                "end_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (defaults to start_date)"
                },
                "end_time": {
                    "type": "string",
                    "description": "End time in HH:MM format (24-hour). Defaults to 1 hour after start."
                },
                "all_day": {
                    "type": "boolean",
                    "description": "Whether this is an all-day event (default: false)",
                    "default": false
                },
                "linked_note_id": {
                    "type": "string",
                    "description": "Optional note ID to link to this event"
                }
            },
            "required": ["title", "start_date"]
        }),
    )
}

/// Execute the create_calendar_event tool
pub fn execute_create_calendar_event(
    pool: &DbPool,
    args: Value,
) -> Result<String, String> {
    use crate::models::CreateCalendarEventInput;
    
    let conn = pool.get().map_err(|e| e.to_string())?;

    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'title' argument")?
        .to_string();

    let description = args.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());

    let start_date = args
        .get("start_date")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'start_date' argument")?;

    let all_day = args.get("all_day").and_then(|v| v.as_bool()).unwrap_or(false);

    // Parse start datetime
    let start_time_str = args.get("start_time").and_then(|v| v.as_str());
    let start_datetime = match (all_day, start_time_str) {
        (true, _) | (_, None) => {
            parse_date(start_date)
                .ok_or_else(|| format!("Invalid start_date: '{}'", start_date))?
        }
        (false, Some(time_str)) => {
            let datetime_str = format!("{}T{}:00Z", start_date, time_str);
            chrono::DateTime::parse_from_rfc3339(&datetime_str)
                .map_err(|_| format!("Invalid date/time: {} {}", start_date, time_str))?
                .with_timezone(&Utc)
        }
    };

    // Parse end datetime
    let end_date_str = args.get("end_date").and_then(|v| v.as_str()).unwrap_or(start_date);
    let end_time_str = args.get("end_time").and_then(|v| v.as_str());
    
    let end_datetime = if all_day {
        None
    } else if let Some(end_time) = end_time_str {
        let datetime_str = format!("{}T{}:00Z", end_date_str, end_time);
        Some(chrono::DateTime::parse_from_rfc3339(&datetime_str)
            .map_err(|_| format!("Invalid end date/time: {} {}", end_date_str, end_time))?
            .with_timezone(&Utc))
    } else if start_time_str.is_some() {
        // Default to 1 hour after start
        Some(start_datetime + Duration::hours(1))
    } else {
        None
    };

    let linked_note_id = args.get("linked_note_id").and_then(|v| v.as_str()).map(|s| s.to_string());

    let input = CreateCalendarEventInput {
        title: title.clone(),
        description,
        start_time: start_datetime,
        end_time: end_datetime,
        all_day,
        recurrence_rule: None,
        linked_note_id,
        event_type: None,
        response_status: None,
        attendees: None,
        meeting_link: None,
    };

    let event = db::calendar_events::create_event(&conn, input)
        .map_err(|e| format!("Failed to create event: {}", e))?;

    Ok(json!({
        "success": true,
        "message": format!("Created event: {}", title),
        "event": {
            "id": event.id,
            "title": event.title,
            "start_time": event.start_time.to_rfc3339(),
            "end_time": event.end_time.map(|t| t.to_rfc3339()),
            "all_day": event.all_day
        }
    }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_calendar_events_tool() {
        let tool = get_calendar_events_tool();
        assert_eq!(tool.function.name, "get_calendar_events");
        assert!(tool.function.description.contains("calendar"));
    }

    #[test]
    fn test_get_create_calendar_event_tool() {
        let tool = get_create_calendar_event_tool();
        assert_eq!(tool.function.name, "create_calendar_event");
        assert!(tool.function.description.contains("event"));
    }

    #[test]
    fn test_parse_date() {
        let date = parse_date("2025-12-28");
        assert!(date.is_some());
        
        let invalid = parse_date("invalid");
        assert!(invalid.is_none());
    }
}

