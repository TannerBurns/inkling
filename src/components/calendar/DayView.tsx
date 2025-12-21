import { useMemo, useEffect, useState } from "react";
import { FileText, Calendar } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useDailyNotesStore, formatDateToString } from "../../stores/dailyNotesStore";
import { getAllDailyNotes } from "../../lib/tauri";
import type { Note } from "../../types/note";
import { EventCard } from "./EventCard";

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
  const { currentDate, getEventsForDate } = useCalendarStore();
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
  
  // Separate all-day events from timed events
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);
  
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
              {allDayEvents.map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))}
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
                className="absolute left-0 right-0 z-10 flex items-center"
                style={{
                  top: `${(new Date().getHours() + new Date().getMinutes() / 60) * 64}px`,
                }}
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: "var(--color-error, #ef4444)" }}
                />
                <div
                  className="h-0.5 flex-1"
                  style={{ backgroundColor: "var(--color-error, #ef4444)" }}
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
              const duration = Math.max(endHour - startHour, 0.5);
              
              const top = startHour * 64; // 64px per hour (h-16)
              const height = duration * 64;
              
              return (
                <div
                  key={event.id}
                  className="absolute left-1 right-4 overflow-hidden rounded-lg px-3 py-2"
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 32)}px`,
                    backgroundColor: "var(--color-accent-light)",
                    borderLeft: "4px solid var(--color-accent)",
                  }}
                >
                  <div
                    className="truncate font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {event.title}
                  </div>
                  {height > 50 && (
                    <>
                      <div
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - 
                        {endTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                      {event.description && height > 80 && (
                        <p
                          className="mt-1 truncate text-xs"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {event.description}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

