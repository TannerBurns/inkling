import { useState, useMemo } from "react";
import { Calendar, RotateCcw, Info } from "lucide-react";
import {
  useSettingsStore,
  DEFAULT_DAILY_NOTE_TEMPLATE,
} from "../../stores/settingsStore";
import { formatDateToString } from "../../stores/dailyNotesStore";

/**
 * Daily Notes settings tab - configure templates and date formats
 */
export function DailyNotesSettings() {
  const {
    dailyNoteSettings,
    setDailyNoteTemplate,
    resetDailyNoteTemplate,
  } = useSettingsStore();

  const [showVariables, setShowVariables] = useState(false);

  // Generate preview of the template with current date
  const preview = useMemo(() => {
    const date = new Date();
    const template = dailyNoteSettings.template;
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = dayNames[date.getDay()];
    const monthName = monthNames[date.getMonth()];
    
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const time = `${hours}:${minutes}`;
    
    const fullDate = `${monthName} ${day}, ${year}`;
    const shortDate = formatDateToString(date);
    
    return template
      .replace(/\{\{date\}\}/g, fullDate)
      .replace(/\{\{date_short\}\}/g, shortDate)
      .replace(/\{\{day_of_week\}\}/g, dayOfWeek)
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{year\}\}/g, String(year))
      .replace(/\{\{month\}\}/g, String(month).padStart(2, "0"))
      .replace(/\{\{month_name\}\}/g, monthName)
      .replace(/\{\{day\}\}/g, String(day).padStart(2, "0"));
  }, [dailyNoteSettings.template]);

  const templateVariables = [
    { variable: "{{date}}", description: "Full date (e.g., December 20, 2025)" },
    { variable: "{{date_short}}", description: "Short date (e.g., 2025-12-20)" },
    { variable: "{{day_of_week}}", description: "Day name (e.g., Saturday)" },
    { variable: "{{time}}", description: "Current time (e.g., 14:30)" },
    { variable: "{{year}}", description: "Year (e.g., 2025)" },
    { variable: "{{month}}", description: "Month number (e.g., 12)" },
    { variable: "{{month_name}}", description: "Month name (e.g., December)" },
    { variable: "{{day}}", description: "Day number (e.g., 20)" },
  ];

  const hasCustomTemplate = dailyNoteSettings.template !== DEFAULT_DAILY_NOTE_TEMPLATE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--color-accent-light)" }}
        >
          <Calendar size={20} style={{ color: "var(--color-accent)" }} />
        </div>
        <div>
          <h4
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Daily Notes
          </h4>
          <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            Configure how your daily notes are created
          </p>
        </div>
      </div>

      {/* Template Section */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Daily Note Template
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVariables(!showVariables)}
              className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              style={{
                backgroundColor: showVariables
                  ? "var(--color-accent-light)"
                  : "var(--color-bg-secondary)",
                color: showVariables
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
              }}
            >
              <Info size={12} />
              Variables
            </button>
            {hasCustomTemplate && (
              <button
                onClick={resetDailyNoteTemplate}
                className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)")
                }
                title="Reset to default template"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Variables Reference */}
        {showVariables && (
          <div
            className="mb-3 rounded-lg border p-3"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            <p
              className="mb-2 text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Available Variables
            </p>
            <div className="grid grid-cols-2 gap-2">
              {templateVariables.map(({ variable, description }) => (
                <div key={variable} className="text-xs">
                  <code
                    className="rounded px-1 py-0.5"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {variable}
                  </code>
                  <span
                    className="ml-1"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Template Editor */}
        <textarea
          value={dailyNoteSettings.template}
          onChange={(e) => setDailyNoteTemplate(e.target.value)}
          placeholder="Enter your daily note template..."
          rows={8}
          className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            resize: "vertical",
          }}
        />
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          This template will be used when creating new daily notes. Use markdown
          formatting.
        </p>
      </div>

      {/* Preview Section */}
      <div>
        <label
          className="mb-2 block text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Preview (Today)
        </label>
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
        >
          <pre
            className="whitespace-pre-wrap font-mono text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            {preview || "(Empty template)"}
          </pre>
        </div>
      </div>

      {/* Tips */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <h5
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Tips
        </h5>
        <ul
          className="list-inside list-disc space-y-1 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <li>Click the calendar icon in the sidebar to open today&apos;s note</li>
          <li>Use the navigation arrows in the editor to move between daily notes</li>
          <li>Daily notes are stored in the &quot;Daily Notes&quot; folder</li>
          <li>The note title is automatically set to the date (YYYY-MM-DD)</li>
        </ul>
      </div>
    </div>
  );
}

