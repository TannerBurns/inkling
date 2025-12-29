import { create } from "zustand";
import type {
  CalendarEvent,
  CalendarEventWithNote,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarViewType,
} from "../types/calendar";
import type { GoogleSyncResult } from "../types/google";

// API functions will be imported from lib/tauri.ts
import * as api from "../lib/tauri";
import * as googleApi from "../lib/google";

interface CalendarState {
  // State
  events: CalendarEventWithNote[];
  currentDate: Date; // The date currently being viewed
  viewType: CalendarViewType;
  selectedEvent: CalendarEventWithNote | null;
  isLoading: boolean;
  error: string | null;

  // Context menu state
  contextMenuEvent: CalendarEventWithNote | null;
  contextMenuPosition: { x: number; y: number } | null;

  // Google sync state
  googleConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  lastSyncResult: GoogleSyncResult | null;
  syncIntervalId: ReturnType<typeof setInterval> | null;

  // Actions
  setCurrentDate: (date: Date) => void;
  setViewType: (type: CalendarViewType) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  navigateToToday: () => void;

  // Event actions
  fetchEventsForRange: (start: Date, end: Date, silent?: boolean) => Promise<void>;
  fetchEventsForCurrentView: (silent?: boolean) => Promise<void>;
  createEvent: (input: CreateCalendarEventInput) => Promise<CalendarEvent>;
  updateEvent: (id: string, input: UpdateCalendarEventInput) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  linkNoteToEvent: (eventId: string, noteId: string) => Promise<CalendarEvent>;
  unlinkNoteFromEvent: (eventId: string) => Promise<CalendarEvent>;

  // Google sync actions
  checkGoogleConnection: () => Promise<void>;
  syncGoogleCalendar: () => Promise<GoogleSyncResult>;
  startAutoSync: () => void;
  stopAutoSync: () => void;

  // Selection
  selectEvent: (event: CalendarEventWithNote | null) => void;

  // Context menu
  openContextMenu: (event: CalendarEventWithNote, position: { x: number; y: number }) => void;
  closeContextMenu: () => void;

  // Utilities
  clearError: () => void;
  getEventsForDate: (date: Date) => CalendarEventWithNote[];
}

/**
 * Get the start and end of a day
 */
function getDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get the start and end of a week (Sunday to Saturday)
 */
function getWeekRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay()); // Go to Sunday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get the start and end of a month
 */
function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get the range for the current view (includes padding for calendar grid)
 */
function getViewRange(date: Date, viewType: CalendarViewType): { start: Date; end: Date } {
  switch (viewType) {
    case "day":
      return getDayRange(date);
    case "week":
      return getWeekRange(date);
    case "month": {
      // For month view, include days from previous/next month that appear in the grid
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      // Start from the Sunday of the first week
      const start = new Date(monthStart);
      start.setDate(monthStart.getDate() - monthStart.getDay());
      start.setHours(0, 0, 0, 0);
      
      // End on the Saturday of the last week
      const end = new Date(monthEnd);
      end.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
      end.setHours(23, 59, 59, 999);
      
      return { start, end };
    }
    default:
      return getMonthRange(date);
  }
}

/**
 * Format date as YYYY-MM-DD for API calls
 */
function formatDateForApi(date: Date): string {
  return date.toISOString().split("T")[0];
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  // Initial state
  events: [],
  currentDate: new Date(),
  viewType: "month",
  selectedEvent: null,
  isLoading: false,
  error: null,

  // Context menu state
  contextMenuEvent: null,
  contextMenuPosition: null,

  // Google sync state
  googleConnected: false,
  isSyncing: false,
  lastSyncedAt: null,
  lastSyncResult: null,
  syncIntervalId: null,

  // Set the current date
  setCurrentDate: (date: Date) => {
    set({ currentDate: date });
    get().fetchEventsForCurrentView();
  },

  // Set the view type
  setViewType: (type: CalendarViewType) => {
    set({ viewType: type });
    get().fetchEventsForCurrentView();
  },

  // Navigate to the previous period
  navigatePrevious: () => {
    const { currentDate, viewType } = get();
    const newDate = new Date(currentDate);
    
    switch (viewType) {
      case "day":
        newDate.setDate(newDate.getDate() - 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() - 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() - 1);
        break;
    }
    
    set({ currentDate: newDate });
    get().fetchEventsForCurrentView();
  },

  // Navigate to the next period
  navigateNext: () => {
    const { currentDate, viewType } = get();
    const newDate = new Date(currentDate);
    
    switch (viewType) {
      case "day":
        newDate.setDate(newDate.getDate() + 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() + 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() + 1);
        break;
    }
    
    set({ currentDate: newDate });
    get().fetchEventsForCurrentView();
  },

  // Navigate to today
  navigateToToday: () => {
    set({ currentDate: new Date() });
    get().fetchEventsForCurrentView();
  },

  // Fetch events for a date range
  fetchEventsForRange: async (start: Date, end: Date, silent = false) => {
    if (!silent) {
      set({ isLoading: true, error: null });
    }
    try {
      const events = await api.getCalendarEventsInRange(
        start.toISOString(),
        end.toISOString()
      );
      set({ events, isLoading: false });
    } catch (error) {
      if (!silent) {
        set({ error: String(error), isLoading: false });
      }
    }
  },

  // Fetch events for the current view
  fetchEventsForCurrentView: async (silent = false) => {
    const { currentDate, viewType } = get();
    const { start, end } = getViewRange(currentDate, viewType);
    await get().fetchEventsForRange(start, end, silent);
  },

  // Create a new event
  createEvent: async (input: CreateCalendarEventInput) => {
    set({ isLoading: true, error: null });
    try {
      const event = await api.createCalendarEvent(input);
      // Refresh events for current view
      await get().fetchEventsForCurrentView();
      set({ isLoading: false });
      return event;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Update an event
  updateEvent: async (id: string, input: UpdateCalendarEventInput) => {
    set({ isLoading: true, error: null });
    try {
      const event = await api.updateCalendarEvent(id, input);
      // Refresh events for current view
      await get().fetchEventsForCurrentView();
      set({ isLoading: false });
      return event;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Delete an event
  deleteEvent: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteCalendarEvent(id);
      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
        selectedEvent: state.selectedEvent?.id === id ? null : state.selectedEvent,
        isLoading: false,
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  // Link a note to an event
  linkNoteToEvent: async (eventId: string, noteId: string) => {
    set({ error: null });
    try {
      const event = await api.linkNoteToCalendarEvent(eventId, noteId);
      // Refresh events for current view
      await get().fetchEventsForCurrentView();
      return event;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Unlink a note from an event
  unlinkNoteFromEvent: async (eventId: string) => {
    set({ error: null });
    try {
      const event = await api.unlinkNoteFromCalendarEvent(eventId);
      // Refresh events for current view
      await get().fetchEventsForCurrentView();
      return event;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Check Google connection status
  checkGoogleConnection: async () => {
    try {
      const status = await googleApi.getGoogleConnectionStatus();
      const wasConnected = get().googleConnected;
      set({ googleConnected: status.connected });
      
      // Start auto-sync if we just became connected
      if (status.connected && !wasConnected) {
        get().startAutoSync();
        // Do an initial sync
        get().syncGoogleCalendar().catch(console.error);
      } else if (!status.connected && wasConnected) {
        get().stopAutoSync();
      }
    } catch {
      set({ googleConnected: false });
      get().stopAutoSync();
    }
  },

  // Sync Google Calendar events for the current view (runs silently in background)
  syncGoogleCalendar: async (): Promise<GoogleSyncResult> => {
    const { currentDate, viewType, isSyncing, lastSyncResult } = get();
    
    // Skip if already syncing
    if (isSyncing) {
      return lastSyncResult || { eventsSynced: 0, eventsAdded: 0, eventsUpdated: 0, eventsRemoved: 0 };
    }
    
    const { start, end } = getViewRange(currentDate, viewType);
    
    // Don't set isSyncing to true to avoid UI flash - sync happens in background
    try {
      const result = await googleApi.syncGoogleCalendar(start, end);
      set({
        lastSyncedAt: new Date(),
        lastSyncResult: result,
      });
      
      // Only refresh events if there were actual changes
      const hasChanges = result.eventsAdded > 0 || result.eventsUpdated > 0 || result.eventsRemoved > 0;
      if (hasChanges) {
        // Silent refresh - no loading indicator
        await get().fetchEventsForCurrentView(true);
      }
      return result;
    } catch (error) {
      // Don't show error for background syncs - just log it
      console.error('Background sync failed:', error);
      
      // Check if the error indicates the account was disconnected (insufficient scopes, token revoked, etc.)
      // If so, refresh the connection status to update the UI
      const errorMessage = String(error);
      if (errorMessage.includes('reconnect') || 
          errorMessage.includes('permissions') || 
          errorMessage.includes('expired')) {
        // Refresh connection status - this will update googleConnected state
        get().checkGoogleConnection();
      }
      
      return lastSyncResult || { eventsSynced: 0, eventsAdded: 0, eventsUpdated: 0, eventsRemoved: 0 };
    }
  },

  // Start auto-sync at 15 second intervals for quick updates
  startAutoSync: () => {
    const { syncIntervalId } = get();
    
    // Don't start if already running
    if (syncIntervalId) return;
    
    const SYNC_INTERVAL = 30 * 1000; // 15 seconds
    
    const intervalId = setInterval(() => {
      const { googleConnected } = get();
      if (googleConnected) {
        get().syncGoogleCalendar().catch(console.error);
      }
    }, SYNC_INTERVAL);
    
    set({ syncIntervalId: intervalId });
  },

  // Stop auto-sync
  stopAutoSync: () => {
    const { syncIntervalId } = get();
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      set({ syncIntervalId: null });
    }
  },

  // Select an event
  selectEvent: (event: CalendarEventWithNote | null) => {
    set({ selectedEvent: event });
  },

  // Open context menu for an event
  openContextMenu: (event: CalendarEventWithNote, position: { x: number; y: number }) => {
    set({ contextMenuEvent: event, contextMenuPosition: position });
  },

  // Close context menu
  closeContextMenu: () => {
    set({ contextMenuEvent: null, contextMenuPosition: null });
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Get events for a specific date (includes multi-day events that span this date)
  getEventsForDate: (date: Date) => {
    const { events } = get();
    const { start: dayStart, end: dayEnd } = getDayRange(date);
    
    return events.filter((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = event.endTime ? new Date(event.endTime) : eventStart;
      
      // Event overlaps with this day if:
      // - Event starts before or during the day AND
      // - Event ends after or during the day
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });
  },
}));

// Selector for events grouped by date
export const useEventsGroupedByDate = () => {
  const events = useCalendarStore((state) => state.events);
  
  const grouped = new Map<string, CalendarEventWithNote[]>();
  
  for (const event of events) {
    const dateKey = formatDateForApi(new Date(event.startTime));
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  }
  
  return grouped;
};

// Selector for dates that have events
export const useDatesWithEvents = (): Set<string> => {
  const events = useCalendarStore((state) => state.events);
  const dates = new Set<string>();
  
  for (const event of events) {
    dates.add(formatDateForApi(new Date(event.startTime)));
  }
  
  return dates;
};

