/**
 * Google integration API
 *
 * Provides functions for Google OAuth and Calendar sync.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  GoogleConnectionStatus,
  GoogleSyncResult,
  EventMeetingInfo,
  GoogleAccount,
} from "../types/google";

/**
 * Check if Google Client ID is configured
 */
export async function isGoogleConfigured(): Promise<boolean> {
  return invoke<boolean>("is_google_configured");
}

/**
 * Initiate Google OAuth flow
 * Opens the browser to Google's OAuth consent screen
 */
export async function initiateGoogleAuth(): Promise<GoogleAccount> {
  const result = await invoke<{
    id: string;
    email: string;
    connected_at: string;
  }>("initiate_google_auth");

  return {
    id: result.id,
    email: result.email,
    connectedAt: result.connected_at,
  };
}

/**
 * Get current Google connection status
 */
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const result = await invoke<{
    connected: boolean;
    email: string | null;
    connected_at: string | null;
  }>("get_google_connection_status");

  return {
    connected: result.connected,
    email: result.email,
    connectedAt: result.connected_at,
  };
}

/**
 * Disconnect Google account
 */
export async function disconnectGoogleAccount(): Promise<void> {
  return invoke("disconnect_google_account");
}

/**
 * Sync Google Calendar events for a date range
 */
export async function syncGoogleCalendar(
  start: Date,
  end: Date
): Promise<GoogleSyncResult> {
  const result = await invoke<{
    events_synced: number;
    events_added: number;
    events_updated: number;
    events_removed: number;
  }>("sync_google_calendar", {
    start: start.toISOString(),
    end: end.toISOString(),
  });

  return {
    eventsSynced: result.events_synced,
    eventsAdded: result.events_added,
    eventsUpdated: result.events_updated,
    eventsRemoved: result.events_removed,
  };
}

/**
 * Get meeting info for creating a note from a Google event
 */
export async function getEventMeetingInfo(
  eventId: string
): Promise<EventMeetingInfo | null> {
  const result = await invoke<{
    attendees: string[];
    meeting_link: string | null;
    original_description: string | null;
  } | null>("get_event_meeting_info", { eventId });

  if (!result) return null;

  return {
    attendees: result.attendees,
    meetingLink: result.meeting_link,
    originalDescription: result.original_description,
  };
}

/**
 * Save Google OAuth credentials to local storage
 * This allows users to set up their own Google Cloud project
 */
export async function saveGoogleCredentials(
  clientId: string,
  clientSecret: string
): Promise<void> {
  return invoke("save_google_credentials", { clientId, clientSecret });
}

/**
 * Clear saved Google OAuth credentials
 */
export async function clearGoogleCredentials(): Promise<void> {
  return invoke("clear_google_credentials");
}

/**
 * Credential source types
 */
export type CredentialSource = "database" | "environment" | "embedded" | "none";

/**
 * Get the source of the current Google credentials
 */
export async function getCredentialSource(): Promise<CredentialSource> {
  return invoke<CredentialSource>("get_google_credential_source");
}

/**
 * Current credential info (for displaying in UI)
 */
export interface CurrentCredentials {
  clientId: string | null;
  clientSecretSet: boolean;
  source: CredentialSource;
}

/**
 * Get the current credentials for display (client ID shown, secret is masked)
 */
export async function getCurrentCredentials(): Promise<CurrentCredentials> {
  const result = await invoke<{
    client_id: string | null;
    client_secret_set: boolean;
    source: string;
  }>("get_current_google_credentials");
  
  return {
    clientId: result.client_id,
    clientSecretSet: result.client_secret_set,
    source: result.source as CredentialSource,
  };
}

