import { useMemo, useEffect, useState } from "react";
import { Check, X, HelpCircle, CircleDashed, Users } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useDailyNotesStore, formatDateToString } from "../../stores/dailyNotesStore";
import { getAllDailyNotes } from "../../lib/tauri";
import type { CalendarEventWithNote, EventResponseStatus } from "../../types/calendar";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Get response status icon for inline display
 */
function getStatusIcon(status: EventResponseStatus | null | undefined): React.ReactNode {
  if (!status) return null;
  switch (status) {
    case "accepted": return <Check size={10} className="flex-shrink-0" style={{ color: "#22c55e" }} />;
    case "declined": return <X size={10} className="flex-shrink-0" style={{ color: "#ef4444" }} />;
    case "tentative": return <HelpCircle size={10} className="flex-shrink-0" style={{ color: "#f59e0b" }} />;
    case "needsAction": return <CircleDashed size={10} className="flex-shrink-0" style={{ color: "#6b7280" }} />;
    default: return null;
  }
}

// Colors for different events (to distinguish overlapping events)
const EVENT_COLORS = [
  { bg: "var(--color-accent-light)", border: "var(--color-accent)" },
  { bg: "rgba(34, 197, 94, 0.15)", border: "#22c55e" },
  { bg: "rgba(249, 115, 22, 0.15)", border: "#f97316" },
  { bg: "rgba(139, 92, 246, 0.15)", border: "#8b5cf6" },
  { bg: "rgba(236, 72, 153, 0.15)", border: "#ec4899" },
  { bg: "rgba(20, 184, 166, 0.15)", border: "#14b8a6" },
];

/**
 * Calculate positions for overlapping events
 */
function calculateEventPositions(events: CalendarEventWithNote[]): Map<string, { left: number; width: number; colorIndex: number }> {
  const positions = new Map<string, { left: number; width: number; colorIndex: number }>();
  
  // Filter to timed events only and sort by start time
  const timedEvents = events
    .filter(e => !e.allDay)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  if (timedEvents.length === 0) return positions;
  
  // Group overlapping events
  const groups: CalendarEventWithNote[][] = [];
  let currentGroup: CalendarEventWithNote[] = [];
  let currentGroupEnd = 0;
  
  for (const event of timedEvents) {
    const startTime = new Date(event.startTime).getTime();
    const endTime = event.endTime 
      ? new Date(event.endTime).getTime()
      : startTime + 60 * 60 * 1000;
    
    if (currentGroup.length === 0 || startTime < currentGroupEnd) {
      // Overlaps with current group
      currentGroup.push(event);
      currentGroupEnd = Math.max(currentGroupEnd, endTime);
    } else {
      // Start new group
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [event];
      currentGroupEnd = endTime;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  // Assign positions within each group
  for (const group of groups) {
    const count = group.length;
    group.forEach((event, index) => {
      positions.set(event.id, {
        left: (index / count) * 100,
        width: 100 / count,
        colorIndex: index % EVENT_COLORS.length,
      });
    });
  }
  
  return positions;
}

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
  const { currentDate, getEventsForDate, selectEvent, openContextMenu } = useCalendarStore();
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
  
  // Collect all-day events and calculate their spans
  const { allDayEventRows, hasAnyAllDayEvents } = useMemo(() => {
    // Get unique all-day events for this week
    const seenEventIds = new Set<string>();
    const allDayEvents: CalendarEventWithNote[] = [];
    
    days.forEach((day) => {
      const dayEvents = getEventsForDate(day);
      dayEvents
        .filter((e) => e.allDay && !seenEventIds.has(e.id))
        .forEach((event) => {
          seenEventIds.add(event.id);
          allDayEvents.push(event);
        });
    });
    
    if (allDayEvents.length === 0) {
      return { allDayEventRows: [], hasAnyAllDayEvents: false };
    }
    
    // Calculate span for each event (which day columns it covers)
    const weekStart = days[0];
    const weekEnd = days[6];
    
    const eventSpans = allDayEvents.map((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = event.endTime ? new Date(event.endTime) : eventStart;
      
      // Clamp to week bounds
      const displayStart = eventStart < weekStart ? weekStart : eventStart;
      const displayEnd = eventEnd > weekEnd ? weekEnd : eventEnd;
      
      // Find column indices
      const startCol = days.findIndex((d) => formatDateToString(d) === formatDateToString(displayStart));
      const endCol = days.findIndex((d) => formatDateToString(d) === formatDateToString(displayEnd));
      
      return {
        event,
        startCol: Math.max(0, startCol),
        endCol: Math.min(6, endCol >= 0 ? endCol : startCol),
        span: Math.max(1, (endCol >= 0 ? endCol : startCol) - Math.max(0, startCol) + 1),
      };
    });
    
    // Sort by start column, then by span (longer events first)
    eventSpans.sort((a, b) => {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      return b.span - a.span;
    });
    
    // Arrange events into rows to avoid overlap
    const rows: Array<typeof eventSpans> = [];
    
    for (const eventSpan of eventSpans) {
      // Find a row where this event fits
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some((existing) => {
          return !(eventSpan.endCol < existing.startCol || eventSpan.startCol > existing.endCol);
        });
        if (!overlaps) {
          row.push(eventSpan);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([eventSpan]);
      }
    }
    
    return { allDayEventRows: rows, hasAnyAllDayEvents: true };
  }, [days, getEventsForDate]);
  
  const todayStr = formatDateToString(new Date());
  
  // Update current time for the indicator every minute
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);
  
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
        <div className="flex flex-shrink-0 flex-col border-b" style={{ borderColor: "var(--color-border)" }}>
          {allDayEventRows.map((row, rowIndex) => (
            <div key={rowIndex} className="relative flex h-7">
              {/* Time column spacer (only show label on first row) */}
              <div
                className="flex w-16 flex-shrink-0 items-center justify-center px-1"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {rowIndex === 0 && <span className="text-xs">All-day</span>}
              </div>
              
              {/* Grid for positioning events */}
              <div className="relative flex flex-1">
                {/* Column dividers */}
                {days.map((_, colIndex) => (
                  <div
                    key={colIndex}
                    className="flex-1 border-l"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                ))}
                
                {/* Events positioned absolutely */}
                {row.map(({ event, startCol, span }) => {
                  // Calculate color based on event source
                  const isGoogleEvent = event.source === "google";
                  const bgColor = isGoogleEvent
                    ? "rgba(66, 133, 244, 0.15)"
                    : "rgba(var(--color-accent-rgb, 59, 130, 246), 0.15)";
                  const borderColor = isGoogleEvent
                    ? "#4285f4"
                    : "var(--color-accent)";
                  const textColor = isGoogleEvent
                    ? "#1a73e8"
                    : "var(--color-accent)";
                  
                  return (
                    <button
                      key={event.id}
                      onClick={() => selectEvent(event)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(event, { x: e.clientX, y: e.clientY });
                      }}
                      className="absolute top-0.5 bottom-0.5 flex items-center gap-1 truncate rounded px-2 text-left text-xs font-medium transition-opacity hover:opacity-80"
                      style={{
                        left: `calc(${(startCol / 7) * 100}% + 2px)`,
                        width: `calc(${(span / 7) * 100}% - 4px)`,
                        backgroundColor: bgColor,
                        borderLeft: `3px solid ${borderColor}`,
                        color: textColor,
                      }}
                      title={`${event.title}${event.attendees?.length ? ` • ${event.attendees.length} attendee${event.attendees.length > 1 ? "s" : ""}` : ""}`}
                    >
                      <span className="truncate">{event.title}</span>
                      {event.attendees && event.attendees.length > 0 && (
                        <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "inherit", opacity: 0.7 }}>
                          <Users size={10} />
                          <span className="text-[9px]">{event.attendees.length}</span>
                        </span>
                      )}
                      {getStatusIcon(event.responseStatus)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
            const dateStr = formatDateToString(day);
            const isToday = dateStr === todayStr;
            const eventPositions = calculateEventPositions(dayEvents);
            // Check for out-of-office events (these get a background overlay)
            const hasOutOfOfficeEvent = dayEvents.some((e) => e.eventType === "outOfOffice");
            
            return (
              <div
                key={dayIndex}
                className="relative flex-1 border-l"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Out of Office background overlay */}
                {hasOutOfOfficeEvent && (
                  <div
                    className="pointer-events-none absolute inset-0 z-0"
                    style={{
                      backgroundColor: "rgba(66, 133, 244, 0.08)",
                    }}
                  />
                )}
                
                {/* Hour lines */}
                {timeSlots.map((_, hourIndex) => (
                  <div
                    key={hourIndex}
                    className="h-12 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                ))}
                
                {/* Current time indicator (only for today's column) */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                    style={{
                      top: `${(currentTime.getHours() + currentTime.getMinutes() / 60) * 48}px`,
                    }}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: "#ef4444" }}
                    />
                    <div
                      className="h-0.5 flex-1"
                      style={{ backgroundColor: "#ef4444" }}
                    />
                  </div>
                )}
                
                {/* Events positioned by time */}
                {dayEvents.map((event) => {
                  const startTime = new Date(event.startTime);
                  const endTime = event.endTime
                    ? new Date(event.endTime)
                    : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
                  
                  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                  const endHour = endTime.getHours() + endTime.getMinutes() / 60;
                  // Allow events to display their true duration - no artificial minimum
                  const duration = endHour - startHour;
                  
                  const top = startHour * 48; // 48px per hour (h-12 = 48px)
                  // Calculate height based on actual duration, with a small minimum for clickability
                  const height = Math.max(duration * 48, 16);
                  
                  if (event.allDay) {
                    return null; // All-day events shown in header
                  }
                  
                  // Get position for overlapping events
                  const position = eventPositions.get(event.id) || { left: 0, width: 100, colorIndex: 0 };
                  const colors = EVENT_COLORS[position.colorIndex];
                  
                  return (
                    <button
                      key={event.id}
                      onClick={() => selectEvent(event)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(event, { x: e.clientX, y: e.clientY });
                      }}
                      className="absolute overflow-hidden rounded px-1 py-0.5 text-left transition-opacity hover:opacity-80"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `calc(${position.left}% + 2px)`,
                        width: `calc(${position.width}% - 4px)`,
                        backgroundColor: colors.bg,
                        borderLeft: `3px solid ${colors.border}`,
                        color: "var(--color-text-primary)",
                        fontSize: height < 24 ? '10px' : '12px',
                      }}
                      title={`${event.title} • ${startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${endTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                    >
                      <div className="flex items-center gap-0.5 truncate font-medium leading-tight">
                        <span className="truncate">{event.title}</span>
                        {height >= 20 && event.attendees && event.attendees.length > 0 && (
                          <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "var(--color-text-tertiary)" }}>
                            <Users size={height < 24 ? 8 : 10} />
                            <span className="text-[9px]">{event.attendees.length}</span>
                          </span>
                        )}
                        {height >= 20 && getStatusIcon(event.responseStatus)}
                      </div>
                      {height > 24 && (
                        <div
                          className="truncate leading-tight"
                          style={{ color: "var(--color-text-secondary)", fontSize: height < 30 ? '9px' : '11px' }}
                        >
                          {startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                      )}
                    </button>
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

