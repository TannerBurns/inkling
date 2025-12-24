/**
 * Typed wrappers for Assistant Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of a calendar event for the assistant
 */
export interface CalendarEventSummary {
  title: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  eventType: string | null;
  meetingLink: string | null;
}

/**
 * Input for generating assistant content
 */
export interface AssistantContentInput {
  date: string;
  events: CalendarEventSummary[];
}

/**
 * Response from the assistant content generation
 */
export interface AssistantContentResponse {
  greeting: string;
  daySummary: string;
  quote: string;
  quoteAuthor: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Generate personalized assistant content using AI
 * Includes day summary based on calendar events and a motivational quote
 */
export async function generateAssistantContent(
  input: AssistantContentInput
): Promise<AssistantContentResponse> {
  return invoke<AssistantContentResponse>("generate_assistant_content", { input });
}

/**
 * Get fallback assistant content without AI
 * Used when AI is not configured or fails
 */
export async function getAssistantFallback(
  input: AssistantContentInput
): Promise<AssistantContentResponse> {
  return invoke<AssistantContentResponse>("get_assistant_fallback", { input });
}

