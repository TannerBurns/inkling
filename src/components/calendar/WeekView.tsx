import { useMemo, useEffect, useState } from "react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useDailyNotesStore, formatDateToString } from "../../stores/dailyNotesStore";
import { getAllDailyNotes } from "../../lib/tauri";
import type { CalendarEventWithNote } from "../../types/calendar";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Generate the 7 days of the week containing the given date
 */
function generateWeekDays(date: Date): Date[] {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay()); // Go to Sunday
  
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    days.push(day);
  }
  
  return days;
}

/**
 * Generate time slots for a day (hourly from 12am to 11pm)
 */
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    slots.push(`${displayHour}:00 ${ampm}`);
  }
  return slots;
}

export function WeekView() {
  const { currentDate, getEventsForDate, selectEvent } = useCalendarStore();
  const { openDailyNote } = useDailyNotesStore();
  
  // Track which dates have daily notes
  const [dailyNoteDates, setDailyNoteDates] = useState<Set<string>>(new Set());
  
  // Fetch daily notes
  useEffect(() => {
    async function fetchDailyNotes() {
      try {
        const notes = await getAllDailyNotes();
        const dates = new Set<string>();
        for (const note of notes) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(note.title)) {
            dates.add(note.title);
          }
        }
        setDailyNoteDates(dates);
      } catch (error) {
        console.error("Failed to fetch daily notes:", error);
      }
    }
    fetchDailyNotes();
  }, []);
  
  const days = useMemo(() => generateWeekDays(currentDate), [currentDate]);
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  
  // Collect all-day events for each day
  const allDayEventsByDay = useMemo(() => {
    const result: Map<string, CalendarEventWithNote[]> = new Map();
    days.forEach((day) => {
      const dateStr = formatDateToString(day);
      const dayEvents = getEventsForDate(day);
      const allDayEvents = dayEvents.filter((e) => e.allDay);
      if (allDayEvents.length > 0) {
        result.set(dateStr, allDayEvents);
      }
    });
    return result;
  }, [days, getEventsForDate]);
  
  // Check if we have any all-day events this week
  const hasAnyAllDayEvents = allDayEventsByDay.size > 0;
  
  const today = new Date();
  const todayStr = formatDateToString(today);
  
  const handleDayClick = (date: Date) => {
    const dateStr = formatDateToString(date);
    openDailyNote(dateStr);
  };
  
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        {/* Time column spacer */}
        <div className="w-16 flex-shrink-0" />
        
        {/* Day columns */}
        {days.map((day, index) => {
          const dateStr = formatDateToString(day);
          const isToday = dateStr === todayStr;
          const dayEvents = getEventsForDate(day);
          const hasDailyNote = dailyNoteDates.has(dateStr);
          
          return (
            <div
              key={index}
              className="flex flex-1 flex-col items-center border-l py-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {WEEKDAY_NAMES[day.getDay()].slice(0, 3).toUpperCase()}
              </span>
              <button
                onClick={() => handleDayClick(day)}
                className="mt-1 flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold transition-colors"
                style={{
                  backgroundColor: isToday ? "var(--color-accent)" : "transparent",
                  color: isToday ? "white" : "var(--color-text-primary)",
                }}
                onMouseEnter={(e) => {
                  if (!isToday) {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isToday) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {day.getDate()}
              </button>
              
              {/* Indicators */}
              <div className="mt-1 flex items-center gap-1">
                {hasDailyNote && (
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--color-accent)" }}
                    title="Has daily note"
                  />
                )}
                {dayEvents.length > 0 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {dayEvents.length} event{dayEvents.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* All-day events section */}
      {hasAnyAllDayEvents && (
        <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--color-border)" }}>
          {/* Time column with label */}
          <div
            className="flex w-16 flex-shrink-0 items-center justify-center px-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span className="text-xs">All-day</span>
          </div>
          
          {/* All-day events for each day */}
          {days.map((day, index) => {
            const dateStr = formatDateToString(day);
            const allDayEvents = allDayEventsByDay.get(dateStr) || [];
            
            return (
              <div
                key={index}
                className="flex min-h-[36px] flex-1 flex-col gap-1 border-l p-1"
                style={{ borderColor: "var(--color-border)" }}
              >
                {allDayEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => selectEvent(event)}
                    className="truncate rounded px-2 py-0.5 text-left text-xs font-medium transition-opacity"
                    style={{
                      backgroundColor: "var(--color-accent)",
                      color: "white",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.8";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Scrollable time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          {/* Time labels */}
          <div className="w-16 flex-shrink-0">
            {timeSlots.map((slot, index) => (
              <div
                key={index}
                className="flex h-12 items-start justify-end pr-2 pt-1"
              >
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {slot}
                </span>
              </div>
            ))}
          </div>
          
          {/* Day columns with events */}
          {days.map((day, dayIndex) => {
            const dayEvents = getEventsForDate(day);
            
            return (
              <div
                key={dayIndex}
                className="relative flex-1 border-l"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Hour lines */}
                {timeSlots.map((_, hourIndex) => (
                  <div
                    key={hourIndex}
                    className="h-12 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                ))}
                
                {/* Events positioned by time */}
                {dayEvents.map((event) => {
                  const startTime = new Date(event.startTime);
                  const endTime = event.endTime
                    ? new Date(event.endTime)
                    : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
                  
                  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                  const endHour = endTime.getHours() + endTime.getMinutes() / 60;
                  const duration = Math.max(endHour - startHour, 0.5); // Minimum 30 min display
                  
                  const top = startHour * 48; // 48px per hour (h-12 = 48px)
                  const height = duration * 48;
                  
                  if (event.allDay) {
                    return null; // All-day events shown in header
                  }
                  
                  return (
                    <div
                      key={event.id}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-xs"
                      style={{
                        top: `${top}px`,
                        height: `${Math.max(height, 20)}px`,
                        backgroundColor: "var(--color-accent-light)",
                        borderLeft: "3px solid var(--color-accent)",
                        color: "var(--color-text-primary)",
                      }}
                      title={event.title}
                    >
                      <div className="truncate font-medium">{event.title}</div>
                      {height > 30 && (
                        <div
                          className="truncate"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

