import { useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import { CalendarHeader } from "./CalendarHeader";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventModal } from "./EventModal";

/**
 * Main calendar view component
 * Container with header, view switcher, and calendar grid
 */
export function CalendarView() {
  const {
    viewType,
    isLoading,
    error,
    fetchEventsForCurrentView,
    clearError,
    selectedEvent,
    selectEvent,
  } = useCalendarStore();

  // Fetch events on mount
  useEffect(() => {
    fetchEventsForCurrentView();
  }, [fetchEventsForCurrentView]);

  // Loading state (initial load only)
  if (isLoading && !error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
        <p style={{ color: "var(--color-text-secondary)" }}>
          Loading calendar...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-8"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div
          className="rounded-full p-4"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        >
          <AlertCircle size={32} style={{ color: "#ef4444" }} />
        </div>
        <div className="text-center">
          <h2
            className="mb-2 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Failed to load calendar
          </h2>
          <p
            className="mb-4 max-w-sm text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {error}
          </p>
          <button
            onClick={() => {
              clearError();
              fetchEventsForCurrentView();
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Render the appropriate view
  const renderView = () => {
    switch (viewType) {
      case "day":
        return <DayView />;
      case "week":
        return <WeekView />;
      case "month":
      default:
        return <MonthView />;
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {/* Header with navigation and view toggle */}
      <CalendarHeader />

      {/* Calendar content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {renderView()}
      </div>

      {/* Event modal for editing */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => selectEvent(null)}
        />
      )}
    </div>
  );
}

