import { ChevronLeft, ChevronRight, Plus, Chrome } from "lucide-react";
import { useCalendarStore } from "../../stores/calendarStore";
import type { CalendarViewType } from "../../types/calendar";
import { useState, useEffect } from "react";
import { EventModal } from "./EventModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

/**
 * Format the header title based on view type and current date
 */
function formatHeaderTitle(date: Date, viewType: CalendarViewType): string {
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const day = date.getDate();
  const dayName = DAY_NAMES[date.getDay()];

  switch (viewType) {
    case "day":
      return `${dayName}, ${month} ${day}, ${year}`;
    case "week": {
      // Show the week range
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const startMonth = MONTH_NAMES[weekStart.getMonth()];
      const endMonth = MONTH_NAMES[weekEnd.getMonth()];
      
      if (startMonth === endMonth) {
        return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${year}`;
      } else if (weekStart.getFullYear() === weekEnd.getFullYear()) {
        return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${year}`;
      } else {
        return `${startMonth} ${weekStart.getDate()}, ${weekStart.getFullYear()} - ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
    }
    case "month":
    default:
      return `${month} ${year}`;
  }
}

interface ViewButtonProps {
  label: string;
  value: CalendarViewType;
  current: CalendarViewType;
  onClick: (type: CalendarViewType) => void;
}

function ViewButton({ label, value, current, onClick }: ViewButtonProps) {
  const isActive = current === value;
  
  return (
    <button
      onClick={() => onClick(value)}
      className="px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md"
      style={{
        backgroundColor: isActive ? "var(--color-accent)" : "transparent",
        color: isActive ? "white" : "var(--color-text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {label}
    </button>
  );
}

export function CalendarHeader() {
  const {
    currentDate,
    viewType,
    setViewType,
    navigatePrevious,
    navigateNext,
    navigateToToday,
    googleConnected,
    checkGoogleConnection,
  } = useCalendarStore();

  const [showNewEventModal, setShowNewEventModal] = useState(false);

  // Check Google connection on mount (this also starts auto-sync if connected)
  useEffect(() => {
    checkGoogleConnection();
  }, [checkGoogleConnection]);

  const title = formatHeaderTitle(currentDate, viewType);

  return (
    <div
      className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Left: Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={navigateToToday}
          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Today
        </button>
        
        <div className="flex items-center">
          <button
            onClick={navigatePrevious}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={navigateNext}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <h1
          className="ml-2 text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h1>
      </div>

      {/* Right: View toggle + Sync + New event */}
      <div className="flex items-center gap-3">
        {/* View toggle */}
        <div
          className="flex rounded-md border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <ViewButton label="Day" value="day" current={viewType} onClick={setViewType} />
          <ViewButton label="Week" value="week" current={viewType} onClick={setViewType} />
          <ViewButton label="Month" value="month" current={viewType} onClick={setViewType} />
        </div>

        {/* Google connection indicator */}
        {googleConnected && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{
              backgroundColor: "rgba(66, 133, 244, 0.1)",
            }}
            title="Google Calendar connected - syncing automatically"
          >
            <Chrome size={14} style={{ color: "#4285f4" }} />
            <span
              className="text-xs font-medium"
              style={{ color: "#4285f4" }}
            >
              Connected
            </span>
          </div>
        )}

        {/* New event button */}
        <button
          onClick={() => setShowNewEventModal(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          <Plus size={16} />
          New Event
        </button>
      </div>

      {/* New event modal */}
      {showNewEventModal && (
        <EventModal
          onClose={() => setShowNewEventModal(false)}
          defaultDate={currentDate}
        />
      )}
    </div>
  );
}

