import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useDailyNotesStore, parseDateString } from "../../stores/dailyNotesStore";

interface DailyNoteNavigationProps {
  noteId: string;
}

/**
 * Navigation component for daily notes
 * Displays prev/next arrows and a date picker when viewing a daily note
 */
export function DailyNoteNavigation({ noteId }: DailyNoteNavigationProps) {
  const { 
    currentDailyNote, 
    navigatePrevious, 
    navigateNext, 
    openDailyNote,
    checkIfDailyNote,
    isLoading 
  } = useDailyNotesStore();
  
  const [isDailyNote, setIsDailyNote] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Check if the current note is a daily note
  useEffect(() => {
    let isMounted = true;
    checkIfDailyNote(noteId).then((result) => {
      if (isMounted) {
        setIsDailyNote(result);
      }
    });
    return () => { isMounted = false; };
  }, [noteId, checkIfDailyNote]);

  // Don't render if not a daily note
  if (!isDailyNote) {
    return null;
  }

  const handlePrevious = async () => {
    try {
      await navigatePrevious();
    } catch (error) {
      console.error("Failed to navigate to previous daily note:", error);
    }
  };

  const handleNext = async () => {
    try {
      await navigateNext();
    } catch (error) {
      console.error("Failed to navigate to next daily note:", error);
    }
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value; // Already in YYYY-MM-DD format
    if (selectedDate) {
      try {
        await openDailyNote(selectedDate);
        setShowDatePicker(false);
      } catch (error) {
        console.error("Failed to open daily note for date:", error);
      }
    }
  };

  // Format the date for display
  const formatDisplayDate = (dateStr: string): string => {
    const date = parseDateString(dateStr);
    if (!date) return dateStr;
    
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString(undefined, options);
  };

  const currentDate = currentDailyNote?.title || "";

  return (
    <div 
      className="flex items-center gap-1 rounded-lg px-2 py-1"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      {/* Previous Day Button */}
      <button
        onClick={handlePrevious}
        disabled={isLoading}
        className="flex cursor-pointer items-center justify-center rounded p-1 transition-colors"
        style={{ 
          color: "var(--color-text-secondary)",
          opacity: isLoading ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        title="Previous daily note"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Date Display / Picker */}
      <div className="relative">
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm font-medium transition-colors"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Calendar size={14} style={{ color: "var(--color-accent)" }} />
          <span>{formatDisplayDate(currentDate)}</span>
        </button>

        {/* Date Picker Dropdown */}
        {showDatePicker && (
          <>
            {/* Backdrop to close picker */}
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setShowDatePicker(false)}
            />
            <div 
              className="absolute left-0 top-full z-50 mt-1 rounded-lg border p-2 shadow-lg"
              style={{ 
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <input
                type="date"
                value={currentDate}
                onChange={handleDateChange}
                className="rounded border px-2 py-1 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
                autoFocus
              />
            </div>
          </>
        )}
      </div>

      {/* Next Day Button */}
      <button
        onClick={handleNext}
        disabled={isLoading}
        className="flex cursor-pointer items-center justify-center rounded p-1 transition-colors"
        style={{ 
          color: "var(--color-text-secondary)",
          opacity: isLoading ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        title="Next daily note"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

