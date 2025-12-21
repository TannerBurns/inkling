import { useEffect, useRef, useState } from "react";
import { FileText, Link, ExternalLink, Unlink, PlusCircle } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useNoteStore } from "../../stores/noteStore";
import type { CalendarEventWithNote } from "../../types/calendar";
import * as googleApi from "../../lib/google";

interface EventContextMenuProps {
  event: CalendarEventWithNote;
  position: { x: number; y: number };
  onClose: () => void;
}

/**
 * Generate meeting note content from event info
 */
async function generateMeetingNoteContent(
  event: CalendarEventWithNote
): Promise<string> {
  const startTime = new Date(event.startTime);
  const endTime = event.endTime ? new Date(event.endTime) : null;
  
  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) + (event.allDay ? "" : ` at ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`);
  };

  let content = `# ${event.title}\n\n`;
  
  // Date and time
  content += `**Date:** ${formatDateTime(startTime)}`;
  if (endTime && !event.allDay) {
    content += ` - ${endTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  content += "\n";
  
  // Try to get meeting info from Google if it's a Google event
  if (event.source === "google") {
    try {
      const meetingInfo = await googleApi.getEventMeetingInfo(event.id);
      if (meetingInfo) {
        if (meetingInfo.attendees && meetingInfo.attendees.length > 0) {
          content += `**Attendees:** ${meetingInfo.attendees.join(", ")}\n`;
        }
        if (meetingInfo.meetingLink) {
          content += `**Meeting Link:** ${meetingInfo.meetingLink}\n`;
        }
        content += "\n";
        if (meetingInfo.originalDescription) {
          content += `## Agenda\n${meetingInfo.originalDescription}\n\n`;
        }
      }
    } catch {
      // Ignore error, just use basic content
    }
  } else if (event.description) {
    content += "\n";
    content += `## Description\n${event.description}\n\n`;
  }
  
  // Notes section
  content += `## Notes\n\n\n`;
  
  // Action items
  content += `## Action Items\n- [ ] \n`;
  
  return content;
}

export function EventContextMenu({ event, position, onClose }: EventContextMenuProps) {
  const { linkNoteToEvent, unlinkNoteFromEvent, selectEvent, fetchEventsForCurrentView } = useCalendarStore();
  const { notes, createNote, updateNote, fetchAllNotes } = useNoteStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  
  // Fetch notes for linking
  useEffect(() => {
    fetchAllNotes();
  }, [fetchAllNotes]);
  
  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);
  
  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 220),
    y: Math.min(position.y, window.innerHeight - 300),
  };
  
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(noteSearchQuery.toLowerCase())
  );
  
  const handleCreateAndLinkNote = async () => {
    setIsCreatingNote(true);
    try {
      const noteTitle = event.title;
      const note = await createNote(noteTitle, null);
      
      if (note) {
        // Generate content for the note
        const content = await generateMeetingNoteContent(event);
        await updateNote(note.id, { content });
        
        // Link the note to the event
        await linkNoteToEvent(event.id, note.id);
        await fetchEventsForCurrentView();
      }
      onClose();
    } catch (error) {
      console.error("Failed to create note:", error);
    } finally {
      setIsCreatingNote(false);
    }
  };
  
  const handleLinkNote = async (noteId: string) => {
    try {
      await linkNoteToEvent(event.id, noteId);
      await fetchEventsForCurrentView();
      onClose();
    } catch (error) {
      console.error("Failed to link note:", error);
    }
  };
  
  const handleUnlinkNote = async () => {
    try {
      await unlinkNoteFromEvent(event.id);
      await fetchEventsForCurrentView();
      onClose();
    } catch (error) {
      console.error("Failed to unlink note:", error);
    }
  };
  
  const handleViewDetails = () => {
    selectEvent(event);
    onClose();
  };
  
  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border shadow-lg"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Event title header */}
      <div
        className="truncate border-b px-3 py-2 text-sm font-medium"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      >
        {event.title}
      </div>
      
      <div className="py-1">
        {/* View details */}
        <button
          onClick={handleViewDetails}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <ExternalLink size={14} style={{ color: "var(--color-text-tertiary)" }} />
          View Details
        </button>
        
        {/* Divider */}
        <div
          className="my-1 border-t"
          style={{ borderColor: "var(--color-border)" }}
        />
        
        {event.linkedNoteId ? (
          // Has linked note - show unlink option
          <button
            onClick={handleUnlinkNote}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
            style={{ color: "var(--color-text-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Unlink size={14} style={{ color: "var(--color-text-tertiary)" }} />
            Unlink Note
          </button>
        ) : (
          <>
            {/* Create new note */}
            <button
              onClick={handleCreateAndLinkNote}
              disabled={isCreatingNote}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              style={{
                color: "var(--color-text-primary)",
                opacity: isCreatingNote ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCreatingNote) {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <PlusCircle size={14} style={{ color: "var(--color-accent)" }} />
              {isCreatingNote ? "Creating..." : "Create Note for Event"}
            </button>
            
            {/* Link existing note */}
            <button
              onClick={() => setShowNotePicker(!showNotePicker)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              style={{ color: "var(--color-text-primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Link size={14} style={{ color: "var(--color-text-tertiary)" }} />
              Link Existing Note
            </button>
            
            {/* Note picker */}
            {showNotePicker && (
              <div
                className="mx-2 mb-2 mt-1 max-h-48 overflow-y-auto rounded border"
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
                  autoFocus
                  className="w-full border-b px-2 py-1.5 text-xs"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {filteredNotes.length === 0 ? (
                  <p
                    className="px-2 py-2 text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    No notes found
                  </p>
                ) : (
                  filteredNotes.slice(0, 8).map((note) => (
                    <button
                      key={note.id}
                      onClick={() => handleLinkNote(note.id)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors"
                      style={{ color: "var(--color-text-primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <FileText size={12} style={{ color: "var(--color-text-tertiary)" }} />
                      <span className="truncate">{note.title}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

