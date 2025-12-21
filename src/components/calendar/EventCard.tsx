import { Clock, FileText, Repeat, Trash2, Pencil, Chrome, Check, X, HelpCircle, CircleDashed, Users, Video } from "lucide-react";
import type { CalendarEventWithNote, EventResponseStatus } from "../../types/calendar";
import { parseRecurrenceRule } from "../../types/calendar";
import { useCalendarStore } from "../../stores/calendarStore";
import { useEditorGroupStore } from "../../stores/editorGroupStore";

/**
 * Get response status display info
 */
function getResponseStatusInfo(status: EventResponseStatus | null): { icon: React.ReactNode; label: string; color: string } | null {
  if (!status) return null;
  
  switch (status) {
    case "accepted":
      return { icon: <Check size={12} />, label: "Going", color: "#22c55e" };
    case "declined":
      return { icon: <X size={12} />, label: "Declined", color: "#ef4444" };
    case "tentative":
      return { icon: <HelpCircle size={12} />, label: "Maybe", color: "#f59e0b" };
    case "needsAction":
      return { icon: <CircleDashed size={12} />, label: "Not responded", color: "#6b7280" };
    default:
      return null;
  }
}

interface EventCardProps {
  event: CalendarEventWithNote;
  compact?: boolean;
}

/**
 * Display a calendar event as a card
 * Shows title, time, recurrence, and linked note
 */
export function EventCard({ event, compact = false }: EventCardProps) {
  const { selectEvent, deleteEvent, openContextMenu } = useCalendarStore();
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
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(event, { x: e.clientX, y: e.clientY });
        }}
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
          <div className="flex items-center gap-1.5">
            <div
              className="truncate font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {event.title}
            </div>
            {event.source === "google" && (
              <span title="Google Calendar">
                <Chrome size={12} className="flex-shrink-0" style={{ color: "#4285f4" }} />
              </span>
            )}
            {/* Response status indicator */}
            {(() => {
              const statusInfo = getResponseStatusInfo(event.responseStatus);
              if (!statusInfo) return null;
              return (
                <span
                  className="flex items-center gap-0.5 flex-shrink-0"
                  style={{ color: statusInfo.color }}
                  title={statusInfo.label}
                >
                  {statusInfo.icon}
                </span>
              );
            })()}
            {/* Attendees count */}
            {event.attendees && event.attendees.length > 0 && (
              <span
                className="flex items-center gap-0.5 flex-shrink-0"
                style={{ color: "var(--color-text-tertiary)" }}
                title={event.attendees.map(a => a.name || a.email).join(", ")}
              >
                <Users size={12} />
                <span className="text-[10px]">{event.attendees.length}</span>
              </span>
            )}
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
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(event, { x: e.clientX, y: e.clientY });
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {event.title}
            </h3>
            {event.source === "google" && (
              <span title="Google Calendar">
                <Chrome size={14} style={{ color: "#4285f4" }} />
              </span>
            )}
          </div>
          
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
          
          {/* Response status */}
          {(() => {
            const statusInfo = getResponseStatusInfo(event.responseStatus);
            if (!statusInfo) return null;
            return (
              <div
                className="mt-1 flex items-center gap-2 text-sm"
                style={{ color: statusInfo.color }}
              >
                {statusInfo.icon}
                <span>{statusInfo.label}</span>
              </div>
            );
          })()}
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
          {/* Don't show delete for Google events - they're read-only */}
          {event.source !== "google" && (
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
          )}
        </div>
      </div>
      
      {/* Attendees */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="mb-3">
          <div
            className="mb-1.5 flex items-center gap-2 text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Users size={14} />
            <span>Attendees ({event.attendees.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {event.attendees.slice(0, 5).map((attendee, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
                title={attendee.email}
              >
                {attendee.name || attendee.email.split("@")[0]}
                {attendee.isOrganizer && (
                  <span style={{ color: "var(--color-accent)" }}>★</span>
                )}
              </span>
            ))}
            {event.attendees.length > 5 && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                +{event.attendees.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Meeting link */}
      {event.meetingLink && (
        <a
          href={event.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: "rgba(66, 133, 244, 0.1)",
            color: "#4285f4",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(66, 133, 244, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(66, 133, 244, 0.1)";
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Video size={14} />
          <span>Join meeting</span>
        </a>
      )}
      
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

