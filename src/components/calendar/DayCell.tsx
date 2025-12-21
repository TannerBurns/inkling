import { FileText } from "lucide-react";
import type { CalendarEventWithNote, CalendarViewType } from "../../types/calendar";
import { useCalendarStore } from "../../stores/calendarStore";

interface DayCellProps {
  date: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  events: CalendarEventWithNote[];
  hasDailyNote: boolean;
  onClick: () => void;
  viewType: CalendarViewType;
}

/**
 * A single day cell in the calendar grid
 * Shows the day number, event count, and daily note indicator
 */
export function DayCell({
  date,
  isToday,
  isCurrentMonth,
  events,
  hasDailyNote,
  onClick,
  viewType,
}: DayCellProps) {
  const { selectEvent, openContextMenu } = useCalendarStore();
  
  const dayNumber = date.getDate();
  const maxEventsToShow = viewType === "month" ? 3 : 5;
  const visibleEvents = events.slice(0, maxEventsToShow);
  const hiddenCount = events.length - visibleEvents.length;
  
  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border p-1 transition-colors"
      style={{
        borderColor: isToday ? "var(--color-accent)" : "var(--color-border)",
        backgroundColor: isCurrentMonth ? "var(--color-bg-primary)" : "var(--color-bg-secondary)",
        opacity: isCurrentMonth ? 1 : 0.6,
      }}
    >
      {/* Day number and indicators */}
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          onClick={onClick}
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium transition-colors"
          style={{
            backgroundColor: isToday ? "var(--color-accent)" : "transparent",
            color: isToday ? "white" : isCurrentMonth ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
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
          title="Open daily note"
        >
          {dayNumber}
        </button>
        
        {/* Daily note indicator */}
        {hasDailyNote && (
          <div
            className="flex items-center gap-0.5"
            title="Has daily note"
          >
            <FileText
              size={12}
              style={{ color: "var(--color-accent)" }}
            />
          </div>
        )}
      </div>
      
      {/* Events list */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        {visibleEvents.map((event) => (
          <button
            key={event.id}
            onClick={(e) => {
              e.stopPropagation();
              selectEvent(event);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openContextMenu(event, { x: e.clientX, y: e.clientY });
            }}
            className="truncate rounded px-1 py-0.5 text-left text-xs transition-colors"
            style={{
              backgroundColor: event.allDay ? "var(--color-accent)" : "var(--color-accent-light)",
              color: event.allDay ? "white" : "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            title={event.title}
          >
            {!event.allDay && (
              <span style={{ color: "var(--color-accent)" }}>
                {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
              </span>
            )}
            {event.title}
          </button>
        ))}
        
        {/* More events indicator */}
        {hiddenCount > 0 && (
          <button
            className="rounded px-1 py-0.5 text-left text-xs transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}

