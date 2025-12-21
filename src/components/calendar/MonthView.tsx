import { useMemo, useEffect, useState } from "react";
import { useCalendarStore } from "../../stores/calendarStore";
import { useDailyNotesStore, formatDateToString } from "../../stores/dailyNotesStore";
import { DayCell } from "./DayCell";
import { getAllDailyNotes } from "../../lib/tauri";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Generate calendar days for a month view
 * Includes days from previous/next months to fill the grid
 */
function generateMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Last day of the month
  const lastDay = new Date(year, month + 1, 0);
  
  const days: Date[] = [];
  
  // Add days from previous month to fill the first week
  const firstDayOfWeek = firstDay.getDay();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = new Date(year, month, -i);
    days.push(day);
  }
  
  // Add all days of the current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  
  // Add days from next month to complete the last week
  const remainingDays = 7 - (days.length % 7);
  if (remainingDays < 7) {
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }
  
  return days;
}

export function MonthView() {
  const { currentDate, getEventsForDate } = useCalendarStore();
  const { openDailyNote } = useDailyNotesStore();
  
  // Track which dates have daily notes
  const [dailyNoteDates, setDailyNoteDates] = useState<Set<string>>(new Set());
  
  // Fetch daily notes to show which days have notes
  useEffect(() => {
    async function fetchDailyNotes() {
      try {
        const notes = await getAllDailyNotes();
        const dates = new Set<string>();
        for (const note of notes) {
          // Daily notes have titles in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(note.title)) {
            dates.add(note.title);
          }
        }
        setDailyNoteDates(dates);
      } catch (error) {
        console.error("Failed to fetch daily notes:", error);
      }
    }
    fetchDailyNotes();
  }, []);
  
  const days = useMemo(() => generateMonthDays(currentDate), [currentDate]);
  
  const today = new Date();
  const todayStr = formatDateToString(today);
  const currentMonth = currentDate.getMonth();
  
  // Handle clicking on a day to open daily note
  const handleDayClick = (date: Date) => {
    const dateStr = formatDateToString(date);
    openDailyNote(dateStr);
  };
  
  return (
    <div className="flex h-full flex-col p-4">
      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAY_NAMES.map((name) => (
          <div
            key={name}
            className="py-2 text-center text-xs font-semibold uppercase"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {name}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-1">
        {days.map((day, index) => {
          const dateStr = formatDateToString(day);
          const isToday = dateStr === todayStr;
          const isCurrentMonth = day.getMonth() === currentMonth;
          const dayEvents = getEventsForDate(day);
          const hasDailyNote = dailyNoteDates.has(dateStr);
          
          return (
            <DayCell
              key={index}
              date={day}
              isToday={isToday}
              isCurrentMonth={isCurrentMonth}
              events={dayEvents}
              hasDailyNote={hasDailyNote}
              onClick={() => handleDayClick(day)}
              viewType="month"
            />
          );
        })}
      </div>
    </div>
  );
}

