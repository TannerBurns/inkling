import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIConfig, AIProvider } from "../types/ai";
import * as aiLib from "../lib/ai";

export type Theme = "system" | "light" | "dark";

/** Settings tab in the modal */
export type SettingsTab = "appearance" | "ai-providers" | "agents" | "assistant" | "tags" | "daily-notes" | "google" | "data" | "about";

/** Agent settings */
export interface AgentSettings {
  /** Enable automatic tagging agent */
  taggingEnabled: boolean;
  /** Show agent activity (tool calls) in UI */
  showAgentActivity: boolean;
}

/** Daily note settings */
export interface DailyNoteSettings {
  /** Template content for new daily notes */
  template: string;
  /** Date format for the title (default: YYYY-MM-DD) */
  dateFormat: string;
}

/** Default daily note template */
export const DEFAULT_DAILY_NOTE_TEMPLATE = `# {{date}}

## Tasks
- [ ] 

## Notes

## Reflections
`;

interface SettingsState {
  // UI State
  theme: Theme;
  isSettingsOpen: boolean;
  activeSettingsTab: SettingsTab;
  isEditorToolbarVisible: boolean;

  // Agent Settings
  agentSettings: AgentSettings;

  // Daily Note Settings
  dailyNoteSettings: DailyNoteSettings;

  // AI State
  aiConfig: AIConfig | null;
  isLoadingAIConfig: boolean;
  aiConfigError: string | null;

  // UI Actions
  setTheme: (theme: Theme) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveSettingsTab: (tab: SettingsTab) => void;
  toggleEditorToolbar: () => void;
  setEditorToolbarVisible: (visible: boolean) => void;

  // Agent Actions
  setAgentSettings: (settings: Partial<AgentSettings>) => void;
  setTaggingEnabled: (enabled: boolean) => void;
  setShowAgentActivity: (show: boolean) => void;

  // Daily Note Actions
  setDailyNoteSettings: (settings: Partial<DailyNoteSettings>) => void;
  setDailyNoteTemplate: (template: string) => void;
  resetDailyNoteTemplate: () => void;

  // AI Actions
  loadAIConfig: () => Promise<void>;
  saveAIConfig: (config: AIConfig) => Promise<void>;
  updateProvider: (provider: AIProvider) => Promise<void>;
  setDefaultProvider: (providerId: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial UI state
      theme: "system",
      isSettingsOpen: false,
      activeSettingsTab: "appearance",
      isEditorToolbarVisible: true,

      // Initial Agent Settings
      agentSettings: {
        taggingEnabled: true,
        showAgentActivity: false,
      },

      // Initial Daily Note Settings
      dailyNoteSettings: {
        template: DEFAULT_DAILY_NOTE_TEMPLATE,
        dateFormat: "YYYY-MM-DD",
      },

      // Initial AI state
      aiConfig: null,
      isLoadingAIConfig: false,
      aiConfigError: null,

      // Set theme
      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },

      // Open settings modal
      openSettings: (tab?: SettingsTab) =>
        set({
          isSettingsOpen: true,
          activeSettingsTab: tab ?? get().activeSettingsTab,
        }),

      // Close settings modal
      closeSettings: () => set({ isSettingsOpen: false }),

      // Set active settings tab
      setActiveSettingsTab: (tab: SettingsTab) =>
        set({ activeSettingsTab: tab }),

      // Toggle editor toolbar visibility
      toggleEditorToolbar: () =>
        set((state) => ({ isEditorToolbarVisible: !state.isEditorToolbarVisible })),

      // Set editor toolbar visibility
      setEditorToolbarVisible: (visible: boolean) =>
        set({ isEditorToolbarVisible: visible }),

      // Agent settings actions
      setAgentSettings: (settings: Partial<AgentSettings>) =>
        set((state) => ({
          agentSettings: { ...state.agentSettings, ...settings },
        })),

      setTaggingEnabled: (enabled: boolean) =>
        set((state) => ({
          agentSettings: { ...state.agentSettings, taggingEnabled: enabled },
        })),

      setShowAgentActivity: (show: boolean) =>
        set((state) => ({
          agentSettings: { ...state.agentSettings, showAgentActivity: show },
        })),

      // Daily note settings actions
      setDailyNoteSettings: (settings: Partial<DailyNoteSettings>) =>
        set((state) => ({
          dailyNoteSettings: { ...state.dailyNoteSettings, ...settings },
        })),

      setDailyNoteTemplate: (template: string) =>
        set((state) => ({
          dailyNoteSettings: { ...state.dailyNoteSettings, template },
        })),

      resetDailyNoteTemplate: () =>
        set((state) => ({
          dailyNoteSettings: { ...state.dailyNoteSettings, template: DEFAULT_DAILY_NOTE_TEMPLATE },
        })),

      // Load AI configuration from backend
      loadAIConfig: async () => {
        set({ isLoadingAIConfig: true, aiConfigError: null });
        try {
          const config = await aiLib.getAIConfig();
          set({ aiConfig: config, isLoadingAIConfig: false });
        } catch (error) {
          set({
            aiConfigError:
              error instanceof Error ? error.message : "Failed to load AI config",
            isLoadingAIConfig: false,
          });
        }
      },

      // Save AI configuration to backend
      saveAIConfig: async (config: AIConfig) => {
        try {
          await aiLib.saveAIConfig(config);
          set({ aiConfig: config, aiConfigError: null });
        } catch (error) {
          set({
            aiConfigError:
              error instanceof Error ? error.message : "Failed to save AI config",
          });
          throw error;
        }
      },

      // Update a single provider
      updateProvider: async (provider: AIProvider) => {
        try {
          const updatedConfig = await aiLib.updateProvider(provider);
          set({ aiConfig: updatedConfig, aiConfigError: null });
        } catch (error) {
          set({
            aiConfigError:
              error instanceof Error
                ? error.message
                : "Failed to update provider",
          });
          throw error;
        }
      },

      // Set the default provider
      setDefaultProvider: async (providerId: string | null) => {
        try {
          const updatedConfig = await aiLib.setDefaultProvider(providerId);
          set({ aiConfig: updatedConfig, aiConfigError: null });
        } catch (error) {
          set({
            aiConfigError:
              error instanceof Error
                ? error.message
                : "Failed to set default provider",
          });
          throw error;
        }
      },
    }),
    {
      name: "inkling-settings",
      // Persist theme, agent settings, daily note settings, and editor toolbar visibility
      partialize: (state) => ({ 
        theme: state.theme,
        agentSettings: state.agentSettings,
        dailyNoteSettings: state.dailyNoteSettings,
        isEditorToolbarVisible: state.isEditorToolbarVisible,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply theme on app load
        if (state?.theme) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);

/**
 * Apply the theme to the document
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Remove existing theme classes
  root.classList.remove("light", "dark");

  if (theme === "system") {
    // Let the CSS media query handle it
    root.removeAttribute("data-theme");
  } else {
    // Manually set the theme
    root.setAttribute("data-theme", theme);
    root.classList.add(theme);
  }
}

// Initialize theme on module load
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("inkling-settings");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.state?.theme) {
        applyTheme(parsed.state.theme);
      }
    } catch {
      // Ignore parse errors
    }
  }
}
