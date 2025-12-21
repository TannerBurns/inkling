/**
 * Google integration types
 */

/**
 * Google account connection status
 */
export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}

/**
 * Result from syncing Google Calendar
 */
export interface GoogleSyncResult {
  eventsSynced: number;
  eventsAdded: number;
  eventsUpdated: number;
  eventsRemoved: number;
}

/**
 * Meeting info extracted from a Google event
 */
export interface EventMeetingInfo {
  attendees: string[];
  meetingLink: string | null;
  originalDescription: string | null;
}

/**
 * Google account info returned after authentication
 */
export interface GoogleAccount {
  id: string;
  email: string;
  connectedAt: string;
}

