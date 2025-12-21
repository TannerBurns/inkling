import { Clock, FileText, Repeat, Trash2, Pencil } from "lucide-react";
import type { CalendarEventWithNote } from "../../types/calendar";
import { parseRecurrenceRule } from "../../types/calendar";
import { useCalendarStore } from "../../stores/calendarStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

interface EventCardProps {
  event: CalendarEventWithNote;
  compact?: boolean;
}

/**
 * Display a calendar event as a card
 * Shows title, time, recurrence, and linked note
 */
export function EventCard({ event, compact = false }: EventCardProps) {
  const { selectEvent, deleteEvent } = useCalendarStore();
  const { openTab } = useEditorGroupStore();
  
  const startTime = new Date(event.startTime);
  const endTime = event.endTime ? new Date(event.endTime) : null;
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectEvent(event);
  };
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${event.title}"?`)) {
      await deleteEvent(event.id);
    }
  };
  
  const handleOpenNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (event.linkedNoteId) {
      openTab({ type: "note", id: event.linkedNoteId });
    }
  };
  
  if (compact) {
    return (
      <button
        onClick={handleEdit}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-primary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--color-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border)";
        }}
      >
        <div
          className="h-8 w-1 flex-shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {event.title}
          </div>
          <div
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {event.allDay ? (
              "All day"
            ) : (
              <>
                {formatTime(startTime)}
                {endTime && ` - ${formatTime(endTime)}`}
              </>
            )}
          </div>
        </div>
        
        {event.linkedNoteTitle && (
          <div
            className="flex items-center gap-1 rounded px-2 py-1 text-xs"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            <FileText size={12} />
            <span className="max-w-20 truncate">{event.linkedNoteTitle}</span>
          </div>
        )}
      </button>
    );
  }
  
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {event.title}
          </h3>
          
          {/* Time */}
          <div
            className="mt-1 flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Clock size={14} />
            {event.allDay ? (
              <span>All day</span>
            ) : (
              <span>
                {formatTime(startTime)}
                {endTime && ` - ${formatTime(endTime)}`}
              </span>
            )}
          </div>
          
          {/* Recurrence */}
          {event.recurrenceRule && (
            <div
              className="mt-1 flex items-center gap-2 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Repeat size={14} />
              <span>{parseRecurrenceRule(event.recurrenceRule)}</span>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleEdit}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
            title="Edit event"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
            title="Delete event"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      {/* Description */}
      {event.description && (
        <p
          className="mb-3 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {event.description}
        </p>
      )}
      
      {/* Linked note */}
      {event.linkedNoteTitle && (
        <button
          onClick={handleOpenNote}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
            e.currentTarget.style.color = "var(--color-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          <FileText size={14} />
          <span>{event.linkedNoteTitle}</span>
        </button>
      )}
    </div>
  );
}

