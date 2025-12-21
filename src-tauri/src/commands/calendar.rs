use chrono::{DateTime, Utc};
use tauri::State;

use crate::db::calendar_events;
use crate::models::{
    CalendarEvent, CalendarEventWithNote, CreateCalendarEventInput, UpdateCalendarEventInput,
};
use crate::AppPool;

/// Create a new calendar event
#[tauri::command]
pub async fn create_calendar_event(
    pool: State<'_, AppPool>,
    input: CreateCalendarEventInput,
) -> Result<CalendarEvent, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::create_event(&conn, input).map_err(|e| e.to_string())
}

/// Get a calendar event by ID
#[tauri::command]
pub async fn get_calendar_event(
    pool: State<'_, AppPool>,
    id: String,
) -> Result<Option<CalendarEvent>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::get_event(&conn, &id).map_err(|e| e.to_string())
}

/// Get a calendar event with linked note details
#[tauri::command]
pub async fn get_calendar_event_with_note(
    pool: State<'_, AppPool>,
    id: String,
) -> Result<Option<CalendarEventWithNote>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::get_event_with_note(&conn, &id).map_err(|e| e.to_string())
}

/// Get all calendar events
#[tauri::command]
pub async fn get_all_calendar_events(
    pool: State<'_, AppPool>,
) -> Result<Vec<CalendarEvent>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::get_all_events(&conn).map_err(|e| e.to_string())
}

/// Get calendar events within a date range
#[tauri::command]
pub async fn get_calendar_events_in_range(
    pool: State<'_, AppPool>,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<CalendarEventWithNote>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::get_events_in_range(&conn, start, end).map_err(|e| e.to_string())
}

/// Get calendar events for a specific date
#[tauri::command]
pub async fn get_calendar_events_for_date(
    pool: State<'_, AppPool>,
    date: String, // YYYY-MM-DD format
) -> Result<Vec<CalendarEventWithNote>, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::get_events_for_date(&conn, &date).map_err(|e| e.to_string())
}

/// Update a calendar event
#[tauri::command]
pub async fn update_calendar_event(
    pool: State<'_, AppPool>,
    id: String,
    input: UpdateCalendarEventInput,
) -> Result<CalendarEvent, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::update_event(&conn, &id, input).map_err(|e| e.to_string())
}

/// Delete a calendar event
#[tauri::command]
pub async fn delete_calendar_event(
    pool: State<'_, AppPool>,
    id: String,
) -> Result<bool, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::delete_event(&conn, &id).map_err(|e| e.to_string())
}

/// Link a note to a calendar event
#[tauri::command]
pub async fn link_note_to_calendar_event(
    pool: State<'_, AppPool>,
    event_id: String,
    note_id: String,
) -> Result<CalendarEvent, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::link_note_to_event(&conn, &event_id, &note_id).map_err(|e| e.to_string())
}

/// Unlink a note from a calendar event
#[tauri::command]
pub async fn unlink_note_from_calendar_event(
    pool: State<'_, AppPool>,
    event_id: String,
) -> Result<CalendarEvent, String> {
    let pool_guard = pool.0.read().map_err(|e| e.to_string())?;
    let pool = pool_guard.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    calendar_events::unlink_note_from_event(&conn, &event_id).map_err(|e| e.to_string())
}

