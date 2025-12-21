import { useState, useEffect } from "react";
import { X, Calendar, Clock, FileText, Repeat, Link, Unlink } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useNoteStore } from "../../stores/noteStore";
import type {
  CalendarEventWithNote,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  RecurrenceFrequency,
} from "../../types/calendar";
import {
  generateRecurrenceRule,
  getFrequencyFromRule,
} from "../../types/calendar";

interface EventModalProps {
  event?: CalendarEventWithNote;
  defaultDate?: Date;
  onClose: () => void;
}

/**
 * Modal for creating or editing a calendar event
 */
export function EventModal({ event, defaultDate, onClose }: EventModalProps) {
  const { createEvent, updateEvent, unlinkNoteFromEvent } = useCalendarStore();
  const { notes, createNote, fetchAllNotes } = useNoteStore();
  
  const isEditing = !!event;
  
  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper to format time as HH:MM in local timezone
  const formatLocalTime = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  // Form state
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [startDate, setStartDate] = useState(() => {
    if (event) {
      return formatLocalDate(new Date(event.startTime));
    }
    if (defaultDate) {
      return formatLocalDate(defaultDate);
    }
    return formatLocalDate(new Date());
  });
  const [startTime, setStartTime] = useState(() => {
    if (event && !event.allDay) {
      return formatLocalTime(new Date(event.startTime));
    }
    return "09:00";
  });
  const [endDate, setEndDate] = useState(() => {
    if (event?.endTime) {
      return formatLocalDate(new Date(event.endTime));
    }
    return startDate;
  });
  const [endTime, setEndTime] = useState(() => {
    if (event?.endTime && !event.allDay) {
      return formatLocalTime(new Date(event.endTime));
    }
    return "10:00";
  });
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(() => {
    return getFrequencyFromRule(event?.recurrenceRule || null);
  });
  const [linkedNoteId, setLinkedNoteId] = useState<string | null>(event?.linkedNoteId || null);
  const [shouldCreateNote, setShouldCreateNote] = useState(false); // Flag to create note on submit
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch notes for linking
  useEffect(() => {
    fetchAllNotes();
  }, [fetchAllNotes]);
  
  // Filter notes based on search
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(noteSearchQuery.toLowerCase())
  );
  
  // Get the linked note title
  const linkedNoteTitle = linkedNoteId
    ? notes.find((n) => n.id === linkedNoteId)?.title || event?.linkedNoteTitle
    : null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Build start and end times
      const startDateTime = allDay
        ? new Date(`${startDate}T00:00:00`)
        : new Date(`${startDate}T${startTime}:00`);
      
      // For all-day events, set end time to end of the day (or end of end date for multi-day)
      const endDateTime = allDay
        ? new Date(`${endDate}T23:59:59`)
        : new Date(`${endDate}T${endTime}:00`);
      
      // Create a new note if requested (only when the event is saved)
      let noteIdToLink = linkedNoteId;
      if (shouldCreateNote && !linkedNoteId) {
        const noteTitle = `Notes: ${title.trim() || "Event"}`;
        const note = await createNote(noteTitle, null);
        if (note) {
          noteIdToLink = note.id;
        }
      }
      
      if (isEditing) {
        // Update existing event
        const input: UpdateCalendarEventInput = {
          title: title.trim(),
          description: description.trim() || null,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime?.toISOString() || null,
          allDay,
          recurrenceRule: generateRecurrenceRule(recurrence),
          linkedNoteId: noteIdToLink,
        };
        await updateEvent(event.id, input);
      } else {
        // Create new event
        const input: CreateCalendarEventInput = {
          title: title.trim(),
          description: description.trim() || null,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime?.toISOString(),
          allDay,
          recurrenceRule: generateRecurrenceRule(recurrence),
          linkedNoteId: noteIdToLink,
        };
        await createEvent(input);
      }
      
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCreateAndLinkNote = () => {
    // Just set the flag - actual note creation happens on submit
    setShouldCreateNote(true);
    // Clear any existing linked note since we're creating a new one
    setLinkedNoteId(null);
  };
  
  const handleCancelCreateNote = () => {
    setShouldCreateNote(false);
  };
  
  const handleUnlinkNote = async () => {
    if (isEditing && event) {
      await unlinkNoteFromEvent(event.id);
    }
    setLinkedNoteId(null);
  };
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border shadow-xl"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {isEditing ? "Edit Event" : "New Event"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Error */}
          {error && (
            <div
              className="mb-4 rounded-md px-4 py-2 text-sm"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}
          
          {/* Title */}
          <div className="mb-4">
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
          
          {/* All day toggle */}
          <div className="mb-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded"
                style={{ accentColor: "var(--color-accent)" }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                All day event
              </span>
            </label>
          </div>
          
          {/* Date & Time */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Calendar size={14} />
                Start
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              )}
            </div>
            
            <div>
              <label
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Clock size={14} />
                End
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              )}
            </div>
          </div>
          
          {/* Recurrence */}
          <div className="mb-4">
            <label
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <Repeat size={14} />
              Repeat
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as RecurrenceFrequency)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          
          {/* Description */}
          <div className="mb-4">
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={3}
              className="w-full resize-none rounded-md border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
          
          {/* Linked Note */}
          <div className="mb-6">
            <label
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <FileText size={14} />
              Linked Note
            </label>
            
            {linkedNoteId ? (
              <div
                className="flex items-center justify-between rounded-md border px-3 py-2"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {linkedNoteTitle}
                </span>
                <button
                  type="button"
                  onClick={handleUnlinkNote}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Unlink size={12} />
                  Unlink
                </button>
              </div>
            ) : shouldCreateNote ? (
              <div
                className="flex items-center justify-between rounded-md border px-3 py-2"
                style={{
                  backgroundColor: "var(--color-accent-light)",
                  borderColor: "var(--color-accent)",
                }}
              >
                <span
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <FileText size={14} style={{ color: "var(--color-accent)" }} />
                  Note will be created: &ldquo;Notes: {title.trim() || "Event"}&rdquo;
                </span>
                <button
                  type="button"
                  onClick={handleCancelCreateNote}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <X size={12} />
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNotePicker(!showNotePicker)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Link size={14} />
                  Link existing note
                </button>
                <button
                  type="button"
                  onClick={handleCreateAndLinkNote}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <FileText size={14} />
                  Create new note
                </button>
              </div>
            )}
            
            {/* Note picker dropdown */}
            {showNotePicker && !linkedNoteId && (
              <div
                className="mt-2 max-h-48 overflow-y-auto rounded-md border"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <input
                  type="text"
                  value={noteSearchQuery}
                  onChange={(e) => setNoteSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                  className="w-full border-b px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {filteredNotes.length === 0 ? (
                  <p
                    className="px-3 py-2 text-sm"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    No notes found
                  </p>
                ) : (
                  filteredNotes.slice(0, 10).map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setLinkedNoteId(note.id);
                        setShowNotePicker(false);
                        setNoteSearchQuery("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                      style={{ color: "var(--color-text-primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <FileText size={14} style={{ color: "var(--color-text-tertiary)" }} />
                      {note.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
                opacity: isSubmitting ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.opacity = "0.9";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.opacity = "1";
                }
              }}
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

