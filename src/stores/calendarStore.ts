import { create } from "zustand";
import type {
  CalendarEvent,
  CalendarEventWithNote,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarViewType,
} from "../types/calendar";

// API functions will be imported from lib/tauri.ts
import * as api from "../lib/tauri";

interface CalendarState {
  // State
  events: CalendarEventWithNote[];
  currentDate: Date; // The date currently being viewed
  viewType: CalendarViewType;
  selectedEvent: CalendarEventWithNote | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentDate: (date: Date) => void;
  setViewType: (type: CalendarViewType) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  navigateToToday: () => void;

  // Event actions
  fetchEventsForRange: (start: Date, end: Date) => Promise<void>;
  fetchEventsForCurrentView: () => Promise<void>;
  createEvent: (input: CreateCalendarEventInput) => Promise<CalendarEvent>;
  updateEvent: (id: string, input: UpdateCalendarEventInput) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  linkNoteToEvent: (eventId: string, noteId: string) => Promise<CalendarEvent>;
  unlinkNoteFromEvent: (eventId: string) => Promise<CalendarEvent>;

  // Selection
  selectEvent: (event: CalendarEventWithNote | null) => void;

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
  fetchEventsForRange: async (start: Date, end: Date) => {
    set({ isLoading: true, error: null });
    try {
      const events = await api.getCalendarEventsInRange(
        start.toISOString(),
        end.toISOString()
      );
      set({ events, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  // Fetch events for the current view
  fetchEventsForCurrentView: async () => {
    const { currentDate, viewType } = get();
    const { start, end } = getViewRange(currentDate, viewType);
    await get().fetchEventsForRange(start, end);
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

  // Select an event
  selectEvent: (event: CalendarEventWithNote | null) => {
    set({ selectedEvent: event });
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

