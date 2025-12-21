/**
 * Source of a calendar event
 * - manual: Created by the user in Inkling
 * - google: Synced from Google Calendar (future)
 */
export type CalendarEventSource = "manual" | "google";

/**
 * A calendar event
 */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string; // ISO datetime string
  endTime: string | null; // ISO datetime string
  allDay: boolean;
  recurrenceRule: string | null; // RRULE format
  source: CalendarEventSource;
  externalId: string | null; // For future Google Calendar sync
  linkedNoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A calendar event with linked note details
 */
export interface CalendarEventWithNote extends CalendarEvent {
  linkedNoteTitle: string | null;
}

/**
 * Input for creating a new calendar event
 */
export interface CreateCalendarEventInput {
  title: string;
  description?: string | null;
  startTime: string; // ISO datetime string
  endTime?: string | null;
  allDay: boolean;
  recurrenceRule?: string | null;
  linkedNoteId?: string | null;
}

/**
 * Input for updating a calendar event
 */
export interface UpdateCalendarEventInput {
  title?: string | null;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean | null;
  recurrenceRule?: string | null;
  linkedNoteId?: string | null;
}

/**
 * Calendar view type
 */
export type CalendarViewType = "day" | "week" | "month";

/**
 * Recurrence frequency options
 */
export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

/**
 * Helper to parse recurrence rule into human-readable format
 */
export function parseRecurrenceRule(rule: string | null): string {
  if (!rule) return "Does not repeat";
  
  // Simple RRULE parsing
  if (rule.includes("FREQ=DAILY")) return "Daily";
  if (rule.includes("FREQ=WEEKLY")) return "Weekly";
  if (rule.includes("FREQ=MONTHLY")) return "Monthly";
  if (rule.includes("FREQ=YEARLY")) return "Yearly";
  
  return "Custom";
}

/**
 * Generate an RRULE string from frequency
 */
export function generateRecurrenceRule(frequency: RecurrenceFrequency): string | null {
  switch (frequency) {
    case "none":
      return null;
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "weekly":
      return "RRULE:FREQ=WEEKLY";
    case "monthly":
      return "RRULE:FREQ=MONTHLY";
    case "yearly":
      return "RRULE:FREQ=YEARLY";
    case "custom":
      // For now, treat custom as weekly (user would edit in future)
      return "RRULE:FREQ=WEEKLY";
    default:
      return null;
  }
}

/**
 * Get the frequency from an RRULE
 */
export function getFrequencyFromRule(rule: string | null): RecurrenceFrequency {
  if (!rule) return "none";
  
  if (rule.includes("FREQ=DAILY")) return "daily";
  if (rule.includes("FREQ=WEEKLY")) return "weekly";
  if (rule.includes("FREQ=MONTHLY")) return "monthly";
  if (rule.includes("FREQ=YEARLY")) return "yearly";
  
  return "custom";
}

