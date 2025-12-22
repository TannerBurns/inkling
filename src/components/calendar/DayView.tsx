import { useMemo, useEffect, useState } from "react";
import { FileText, Calendar, Check, X, HelpCircle, CircleDashed, Users } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useDailyNotesStore, formatDateToString } from "../../stores/dailyNotesStore";
import { getAllDailyNotes } from "../../lib/tauri";
import type { Note } from "../../types/note";
import type { CalendarEventWithNote, EventResponseStatus } from "../../types/calendar";
import { EventCard } from "./EventCard";

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

export function DayView() {
  const { currentDate, getEventsForDate, selectEvent, openContextMenu } = useCalendarStore();
  const { openDailyNote } = useDailyNotesStore();
  
  const [dailyNote, setDailyNote] = useState<Note | null>(null);
  const [dailyNotePreview, setDailyNotePreview] = useState<string>("");
  
  const dateStr = formatDateToString(currentDate);
  const events = getEventsForDate(currentDate);
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  
  // Fetch daily note for this day
  useEffect(() => {
    async function fetchDailyNote() {
      try {
        const notes = await getAllDailyNotes();
        const note = notes.find((n) => n.title === dateStr);
        if (note) {
          setDailyNote(note);
          // Get a preview of the content
          const content = note.content || "";
          const preview = content.slice(0, 200).replace(/\n/g, " ");
          setDailyNotePreview(preview + (content.length > 200 ? "..." : ""));
        } else {
          setDailyNote(null);
          setDailyNotePreview("");
        }
      } catch (error) {
        console.error("Failed to fetch daily note:", error);
      }
    }
    fetchDailyNote();
  }, [dateStr]);
  
  const handleOpenDailyNote = () => {
    openDailyNote(dateStr);
  };
  
  // Update current time for the indicator every minute
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);
  
  // Separate all-day events from timed events
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);
  
  // Calculate positions for overlapping events
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const eventPositions = useMemo(() => calculateEventPositions(events), [events]);
  
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Daily note section */}
      <div
        className="flex w-80 flex-shrink-0 flex-col border-r p-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2
          className="mb-3 text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Daily Note
        </h2>
        
        {dailyNote ? (
          <button
            onClick={handleOpenDailyNote}
            className="flex flex-col items-start rounded-lg border p-4 text-left transition-colors"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <FileText size={16} style={{ color: "var(--color-accent)" }} />
              <span
                className="font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {dateStr}
              </span>
            </div>
            {dailyNotePreview && (
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {dailyNotePreview}
              </p>
            )}
          </button>
        ) : (
          <button
            onClick={handleOpenDailyNote}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-tertiary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
          >
            <Calendar size={24} className="mb-2" />
            <span className="text-sm font-medium">Create daily note</span>
          </button>
        )}
        
        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div className="mt-6">
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              All-Day Events
            </h2>
            <div className="space-y-2">
              {allDayEvents.map((event) => {
                const isGoogleEvent = event.source === "google";
                const bgColor = isGoogleEvent
                  ? "rgba(66, 133, 244, 0.15)"
                  : "var(--color-accent-light)";
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
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: bgColor,
                      borderLeft: `4px solid ${borderColor}`,
                    }}
                    title={`${event.title}${event.attendees?.length ? ` • ${event.attendees.length} attendee${event.attendees.length > 1 ? "s" : ""}` : ""}`}
                  >
                    <span
                      className="flex-1 truncate text-sm font-medium"
                      style={{ color: textColor }}
                    >
                      {event.title}
                    </span>
                    {event.attendees && event.attendees.length > 0 && (
                      <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "inherit", opacity: 0.7 }}>
                        <Users size={12} />
                        <span className="text-xs">{event.attendees.length}</span>
                      </span>
                    )}
                    {getStatusIcon(event.responseStatus)}
                    {event.endTime && new Date(event.endTime).toDateString() !== new Date(event.startTime).toDateString() && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        Multi-day
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Event summary */}
        <div className="mt-6">
          <h2
            className="mb-3 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Events ({events.length})
          </h2>
          <div className="space-y-2">
            {events.length === 0 ? (
              <p
                className="text-sm italic"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                No events scheduled
              </p>
            ) : (
              events.map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Right: Time-based schedule */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          {/* Time labels */}
          <div className="w-20 flex-shrink-0">
            {timeSlots.map((slot, index) => (
              <div
                key={index}
                className="flex h-16 items-start justify-end pr-3 pt-1"
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
          
          {/* Schedule column */}
          <div className="relative flex-1 border-l" style={{ borderColor: "var(--color-border)" }}>
            {/* Out of Office background overlay */}
            {events.some((e) => e.eventType === "outOfOffice") && (
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
                className="h-16 border-b"
                style={{ borderColor: "var(--color-border)" }}
              />
            ))}
            
            {/* Current time indicator */}
            {formatDateToString(new Date()) === dateStr && (
              <div
                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                style={{
                  top: `${(currentTime.getHours() + currentTime.getMinutes() / 60) * 64}px`,
                }}
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: "#ef4444" }}
                />
                <div
                  className="h-0.5 flex-1"
                  style={{ backgroundColor: "#ef4444" }}
                />
              </div>
            )}
            
            {/* Timed events */}
            {timedEvents.map((event) => {
              const startTime = new Date(event.startTime);
              const endTime = event.endTime
                ? new Date(event.endTime)
                : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
              
              const startHour = startTime.getHours() + startTime.getMinutes() / 60;
              const endHour = endTime.getHours() + endTime.getMinutes() / 60;
              // Allow events to display their true duration - no artificial minimum
              const duration = endHour - startHour;
              
              const top = startHour * 64; // 64px per hour (h-16)
              // Calculate height based on actual duration, with a small minimum for clickability
              const height = Math.max(duration * 64, 20);
              
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
                  className="absolute overflow-hidden rounded-lg px-2 py-1 text-left transition-opacity hover:opacity-80"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(${position.left}% + 4px)`,
                    width: `calc(${position.width}% - 16px)`,
                    backgroundColor: colors.bg,
                    borderLeft: `4px solid ${colors.border}`,
                  }}
                  title={`${event.title} • ${startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${endTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                >
                  <div
                    className={`flex items-center gap-1 truncate font-medium ${height < 40 ? 'text-xs' : ''}`}
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    <span className="truncate">{event.title}</span>
                    {event.attendees && event.attendees.length > 0 && (
                      <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "var(--color-text-tertiary)" }}>
                        <Users size={height < 40 ? 9 : 11} />
                        <span className="text-[10px]">{event.attendees.length}</span>
                      </span>
                    )}
                    {getStatusIcon(event.responseStatus)}
                  </div>
                  {height > 40 && (
                    <>
                      <div
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - 
                        {endTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                      {/* Attendees list for taller events */}
                      {event.attendees && event.attendees.length > 0 && height > 80 && (
                        <div
                          className="mt-1 truncate text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {event.attendees.slice(0, 3).map(a => a.name || a.email.split("@")[0]).join(", ")}
                          {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                        </div>
                      )}
                      {event.description && height > 100 && !event.attendees?.length && (
                        <p
                          className="mt-1 truncate text-xs"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {event.description}
                        </p>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

