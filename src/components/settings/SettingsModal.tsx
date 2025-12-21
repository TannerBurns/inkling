import { X, Monitor, Sun, Moon, Cpu, Info, MessageCircle, Database, Bot, Tag, Calendar } from "lucide-react";
import {
  useSettingsStore,
  type Theme,
  type SettingsTab,
} from "../../stores/settingsStore";
import { AIProviders } from "./AIProviders";
import { AgentSettings } from "./AgentSettings";
import { AssistantSettings } from "./AssistantSettings";
import { TagsSettings } from "./TagsSettings";
import { DailyNotesSettings } from "./DailyNotesSettings";
import { DataManagement } from "./DataManagement";

/**
 * Settings modal with tabbed interface
 */
export function SettingsModal() {
  const {
    isSettingsOpen,
    closeSettings,
    theme,
    setTheme,
    activeSettingsTab,
    setActiveSettingsTab,
  } = useSettingsStore();

  if (!isSettingsOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: typeof Monitor }[] = [
    { id: "appearance", label: "Appearance", icon: Monitor },
    { id: "ai-providers", label: "AI Providers", icon: Cpu },
    { id: "agents", label: "Agents", icon: Bot },
    { id: "assistant", label: "Assistant", icon: MessageCircle },
    { id: "tags", label: "Tags", icon: Tag },
    { id: "daily-notes", label: "Daily Notes", icon: Calendar },
    { id: "data", label: "Data", icon: Database },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onClick={closeSettings}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 flex h-[500px] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl shadow-lg"
        style={{
          backgroundColor: "var(--color-bg-primary)",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Sidebar */}
        <div
          className="flex w-48 flex-col border-r"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="p-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Settings
            </h2>
          </div>

          <nav className="flex-1 px-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSettingsTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "var(--color-accent-light)"
                      : "transparent",
                    color: isActive
                      ? "var(--color-accent)"
                      : "var(--color-text-secondary)",
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between border-b px-6 py-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h3
              className="text-lg font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {tabs.find((t) => t.id === activeSettingsTab)?.label}
            </h3>
            <button
              onClick={closeSettings}
              className="cursor-pointer rounded-lg p-2 transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <X size={20} />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSettingsTab === "appearance" && (
              <AppearanceTab theme={theme} setTheme={setTheme} />
            )}
            {activeSettingsTab === "ai-providers" && <AIProviders />}
            {activeSettingsTab === "agents" && <AgentSettings />}
            {activeSettingsTab === "assistant" && <AssistantSettings />}
            {activeSettingsTab === "tags" && <TagsSettings />}
            {activeSettingsTab === "daily-notes" && <DailyNotesSettings />}
            {activeSettingsTab === "data" && <DataManagement />}
            {activeSettingsTab === "about" && <AboutTab />}
          </div>
        </div>
      </div>
    </>
  );
}

interface AppearanceTabProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function AppearanceTab({ theme, setTheme }: AppearanceTabProps) {
  const themeOptions: { value: Theme; label: string; icon: typeof Monitor }[] =
    [
      { value: "system", label: "System", icon: Monitor },
      { value: "light", label: "Light", icon: Sun },
      { value: "dark", label: "Dark", icon: Moon },
    ];

  return (
    <div>
      <h4
        className="mb-3 text-sm font-medium"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Theme
      </h4>

      <div className="flex gap-2">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = theme === option.value;

          return (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-colors"
              style={{
                backgroundColor: isSelected
                  ? "var(--color-accent-light)"
                  : "var(--color-bg-secondary)",
                borderColor: isSelected
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                color: isSelected
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor =
                    "var(--color-border-strong)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                }
              }}
            >
              <Icon size={24} />
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {theme === "system"
          ? "Theme will match your system preferences"
          : `Using ${theme} theme`}
      </p>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Version
        </h4>
        <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
          Inkling v0.1.0
        </p>
      </div>

      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Description
        </h4>
        <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          Inkling is an AI-powered note-taking application that helps you
          discover connections between your notes, surface relevant information,
          and engage in natural conversations with your knowledge base.
        </p>
      </div>

      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Technology
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            "Tauri",
            "React",
            "TypeScript",
            "Rust",
            "SQLite",
            "TipTap",
          ].map((tech) => (
            <span
              key={tech}
              className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
