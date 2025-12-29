import { useEffect, useState } from "react";
import {
  Tag,
  Link2,
  Bot,
  Globe,
  FileText,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Calendar,
  Folder,
  Link,
  FileOutput,
  ChevronDown,
  ChevronUp,
  Bookmark,
  BookOpen,
  Pencil,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type {
  AgentConfig,
  WebSearchProvider,
  SourceConfig,
  RWPermission,
} from "../../types/agent";
import { DEFAULT_AGENT_CONFIG } from "../../types/agent";
import * as agentsApi from "../../lib/agents";
import { getDefaultSystemPrompt } from "../../lib/chat";

/**
 * Default system prompt value (fallback if fetch fails)
 */
const DEFAULT_PROMPT = `You are Inkling, an AI assistant for a personal knowledge management app. 
You help users explore connections in their notes, answer questions based on their knowledge base, and assist with writing and research.

When answering:
- Reference specific notes when relevant using [Note: Title] format
- Be concise but thorough
- If you're not sure about something based on the notes, say so
- Suggest related topics the user might want to explore

Context from user's notes will be provided below.`;

/**
 * Unified Agent settings tab - configure AI agents and their capabilities
 */
export function AgentSettings() {
  const { agentSettings, setTaggingEnabled, setShowAgentActivity } =
    useSettingsStore();

  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // System prompt state (moved from AssistantSettings)
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [savedPrompt, setSavedPrompt] = useState(DEFAULT_PROMPT);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(true);

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadPrompt();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loadedConfig = await agentsApi.getAgentConfig();
      // Ensure sources and capabilities have defaults if not present (backwards compat)
      setConfig({
        ...DEFAULT_AGENT_CONFIG,
        ...loadedConfig,
        sources: { ...DEFAULT_AGENT_CONFIG.sources, ...loadedConfig.sources },
        capabilities: { ...DEFAULT_AGENT_CONFIG.capabilities, ...loadedConfig.capabilities },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadPrompt = async () => {
    try {
      const prompt = await getDefaultSystemPrompt();
      setSystemPrompt(prompt);
      setSavedPrompt(prompt);
    } catch (error) {
      console.warn("Failed to load system prompt:", error);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const saveConfig = async (newConfig: AgentConfig) => {
    setIsSaving(true);
    setError(null);
    try {
      await agentsApi.saveAgentConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSources = (updates: Partial<SourceConfig>) => {
    saveConfig({
      ...config,
      sources: { ...config.sources, ...updates },
    });
  };

  const updateRWSource = (
    sourceKey: "notes" | "tags" | "calendar" | "dailyNotes" | "folders",
    permission: "read" | "write",
    value: boolean
  ) => {
    const currentPerm = config.sources[sourceKey] as RWPermission;
    saveConfig({
      ...config,
      sources: {
        ...config.sources,
        [sourceKey]: { ...currentPerm, [permission]: value },
      },
    });
  };

  const updateDocumentExport = (value: boolean) => {
    saveConfig({
      ...config,
      capabilities: { ...config.capabilities, documentExport: value },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2
          className="animate-spin"
          size={24}
          style={{ color: "var(--color-text-tertiary)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{
            backgroundColor: "var(--color-error-light)",
            color: "var(--color-error)",
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Master Toggle Section */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h4
              className="text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              AI Agents
            </h4>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Enable AI-powered features for both Chat and Inline Assistant
            </p>
          </div>
          <ToggleSwitch
            enabled={config.enabled}
            onToggle={(enabled) => saveConfig({ ...config, enabled })}
            saving={isSaving}
          />
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Divider */}
          <hr style={{ borderColor: "var(--color-border)" }} />

          {/* Data Sources Section */}
          <div>
            <h4
              className="mb-3 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Data Sources
            </h4>
            <p
              className="mb-4 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Control what data agents can access and modify
            </p>

            {/* Permission legend */}
            <div className="mb-3 flex items-center gap-4 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              <div className="flex items-center gap-1">
                <BookOpen size={12} />
                <span>Read</span>
              </div>
              <div className="flex items-center gap-1">
                <Pencil size={12} />
                <span>Write</span>
              </div>
            </div>

            <div className="grid gap-2">
              <RWSourceToggle
                icon={FileText}
                label="Notes"
                description="Search, read, create notes and diagrams"
                permission={config.sources.notes}
                onToggleRead={(enabled) => updateRWSource("notes", "read", enabled)}
                onToggleWrite={(enabled) => updateRWSource("notes", "write", enabled)}
              />
              <RWSourceToggle
                icon={Bookmark}
                label="Tags"
                description="Get tags and find notes by tag"
                permission={config.sources.tags}
                onToggleRead={(enabled) => updateRWSource("tags", "read", enabled)}
                onToggleWrite={(enabled) => updateRWSource("tags", "write", enabled)}
                writeDisabled
              />
              <RWSourceToggle
                icon={Calendar}
                label="Calendar"
                description="Read and create calendar events"
                permission={config.sources.calendar}
                onToggleRead={(enabled) => updateRWSource("calendar", "read", enabled)}
                onToggleWrite={(enabled) => updateRWSource("calendar", "write", enabled)}
              />
              <RWSourceToggle
                icon={FileText}
                label="Daily Notes"
                description="Access daily journal notes"
                permission={config.sources.dailyNotes}
                onToggleRead={(enabled) => updateRWSource("dailyNotes", "read", enabled)}
                onToggleWrite={(enabled) => updateRWSource("dailyNotes", "write", enabled)}
                writeDisabled
              />
              <RWSourceToggle
                icon={Folder}
                label="Folders"
                description="Browse folder structure"
                permission={config.sources.folders}
                onToggleRead={(enabled) => updateRWSource("folders", "read", enabled)}
                onToggleWrite={(enabled) => updateRWSource("folders", "write", enabled)}
                writeDisabled
              />
            </div>

            {/* Read-only sources */}
            <div className="mt-4">
              <p
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Read-only Sources
              </p>
              <div className="grid gap-2">
                <SourceToggle
                  icon={Link}
                  label="URL Attachments"
                  description="Search and read saved web pages"
                  enabled={config.sources.urlAttachments}
                  onToggle={(enabled) => updateSources({ urlAttachments: enabled })}
                />
              </div>
            </div>

            {/* Web Search - Special handling for API key */}
            <div
              className="mt-3 rounded-lg border p-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe
                    size={16}
                    style={{
                      color: config.sources.webSearch
                        ? "var(--color-accent)"
                        : "var(--color-text-tertiary)",
                    }}
                  />
                  <div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Web Search
                    </span>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      Search the web for current information
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  enabled={config.sources.webSearch}
                  onToggle={(enabled) => updateSources({ webSearch: enabled })}
                  saving={isSaving}
                />
              </div>

              {config.sources.webSearch && (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <div>
                    <label
                      className="mb-1 block text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Provider
                    </label>
                    <select
                      value={config.webSearch.provider}
                      onChange={(e) =>
                        saveConfig({
                          ...config,
                          webSearch: {
                            ...config.webSearch,
                            provider: e.target.value as WebSearchProvider,
                          },
                        })
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{
                        backgroundColor: "var(--color-bg-secondary)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <option value="none">Select a provider</option>
                      <option value="brave">Brave Search</option>
                      <option value="serper">Serper (Google)</option>
                      <option value="tavily">Tavily</option>
                    </select>
                  </div>

                  {config.webSearch.provider !== "none" && (
                    <div>
                      <label
                        className="mb-1 block text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={config.webSearch.apiKey || ""}
                          onChange={(e) =>
                            saveConfig({
                              ...config,
                              webSearch: {
                                ...config.webSearch,
                                apiKey: e.target.value || undefined,
                              },
                            })
                          }
                          placeholder="Enter API key"
                          className="w-full rounded-lg border px-3 py-2 pr-10 text-sm"
                          style={{
                            backgroundColor: "var(--color-bg-secondary)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <hr style={{ borderColor: "var(--color-border)" }} />

          {/* Capabilities Section */}
          <div>
            <h4
              className="mb-3 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Capabilities
            </h4>
            <p
              className="mb-4 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Additional actions agents can perform
            </p>

            <div className="grid gap-2">
              <SourceToggle
                icon={FileOutput}
                label="Document Export"
                description="Export to PDF, Word, and Excel"
                enabled={config.capabilities.documentExport}
                onToggle={(enabled) => updateDocumentExport(enabled)}
              />
            </div>
          </div>

          {/* Divider */}
          <hr style={{ borderColor: "var(--color-border)" }} />

          {/* AI Tagging Section */}
          <div>
            <h4
              className="mb-2 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              AI Tagging
            </h4>
            <p
              className="mb-4 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Analyze notes and assign tags using AI
            </p>

            <div className="space-y-3">
              <AgentCard
                icon={Tag}
                title="AI Tagging"
                description="Adds a 'Tag with AI' button to notes. Click it to analyze content and assign relevant tags."
                enabled={agentSettings.taggingEnabled}
                onToggle={setTaggingEnabled}
              />

              <AgentCard
                icon={Link2}
                title="Connection Agent"
                description="Suggests links between related notes based on content."
                enabled={false}
                onToggle={() => {}}
                comingSoon
              />
            </div>
          </div>

          {/* Divider */}
          <hr style={{ borderColor: "var(--color-border)" }} />

          {/* Advanced Section */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between py-1"
            >
              <h4
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Advanced
              </h4>
              {showAdvanced ? (
                <ChevronUp size={16} style={{ color: "var(--color-text-tertiary)" }} />
              ) : (
                <ChevronDown size={16} style={{ color: "var(--color-text-tertiary)" }} />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4">
                {/* Show agent activity toggle */}
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agentSettings.showAgentActivity}
                    onChange={(e) => setShowAgentActivity(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded"
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  <div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Show agent activity in notes
                    </span>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      Display what tools agents used (useful for debugging)
                    </p>
                  </div>
                </label>

                {/* System Prompt (moved from AssistantSettings) */}
                <div
                  className="border-t pt-4"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <h5
                    className="mb-2 text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Default System Prompt
                  </h5>
                  <p
                    className="mb-3 text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    This prompt guides how the AI assistant behaves in conversations.
                  </p>

                  {isLoadingPrompt ? (
                    <div
                      className="flex h-32 items-center justify-center rounded-lg border"
                      style={{
                        backgroundColor: "var(--color-bg-secondary)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      <Loader2
                        className="animate-spin"
                        size={20}
                        style={{ color: "var(--color-text-tertiary)" }}
                      />
                    </div>
                  ) : (
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      className="h-32 w-full resize-y rounded-lg border p-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                      style={{
                        backgroundColor: "var(--color-bg-secondary)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                      }}
                      placeholder="Enter the system prompt..."
                    />
                  )}

                  {systemPrompt !== savedPrompt && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setSystemPrompt(DEFAULT_PROMPT)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Reset to Default
                      </button>
                      <button
                        onClick={() => setSystemPrompt(savedPrompt)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Revert Changes
                      </button>
                    </div>
                  )}
                </div>

                {/* Keyboard Shortcuts */}
                <div
                  className="border-t pt-4"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <h5
                    className="mb-3 text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Keyboard Shortcuts
                  </h5>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        Toggle Chat Panel
                      </span>
                      <div className="flex gap-1">
                        <kbd
                          className="rounded px-2 py-0.5 text-xs font-mono"
                          style={{
                            backgroundColor: "var(--color-bg-tertiary)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          ⌘
                        </kbd>
                        <kbd
                          className="rounded px-2 py-0.5 text-xs font-mono"
                          style={{
                            backgroundColor: "var(--color-bg-tertiary)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          ⇧
                        </kbd>
                        <kbd
                          className="rounded px-2 py-0.5 text-xs font-mono"
                          style={{
                            backgroundColor: "var(--color-bg-tertiary)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          C
                        </kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        Add note to context
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        Type @ in chat
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  saving?: boolean;
}

function ToggleSwitch({ enabled, onToggle, saving }: ToggleSwitchProps) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={saving}
        className="peer sr-only"
      />
      <div
        className="h-6 w-11 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"
        style={{
          backgroundColor: enabled
            ? "var(--color-accent)"
            : "var(--color-bg-tertiary)",
          opacity: saving ? 0.6 : 1,
        }}
      />
    </label>
  );
}

interface SourceToggleProps {
  icon: typeof Bot;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function SourceToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
}: SourceToggleProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      <Icon
        size={16}
        style={{
          color: enabled ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      />
      <div className="flex-1">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </span>
        <p
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      </div>
      <ToggleSwitch enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

interface RWSourceToggleProps {
  icon: typeof Bot;
  label: string;
  description: string;
  permission: RWPermission;
  onToggleRead: (enabled: boolean) => void;
  onToggleWrite: (enabled: boolean) => void;
  writeDisabled?: boolean;
}

function RWSourceToggle({
  icon: Icon,
  label,
  description,
  permission,
  onToggleRead,
  onToggleWrite,
  writeDisabled,
}: RWSourceToggleProps) {
  const isActive = permission.read || permission.write;
  
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      <Icon
        size={16}
        style={{
          color: isActive ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      />
      <div className="flex-1 min-w-0">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </span>
        <p
          className="text-xs truncate"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* Read toggle */}
        <div className="flex items-center gap-1">
          <BookOpen
            size={12}
            style={{
              color: permission.read
                ? "var(--color-accent)"
                : "var(--color-text-tertiary)",
            }}
          />
          <MiniToggle
            enabled={permission.read}
            onToggle={onToggleRead}
          />
        </div>
        {/* Write toggle - only show if write is available */}
        {!writeDisabled && (
          <div className="flex items-center gap-1">
            <Pencil
              size={12}
              style={{
                color: permission.write
                  ? "var(--color-accent)"
                  : "var(--color-text-tertiary)",
              }}
            />
            <MiniToggle
              enabled={permission.write}
              onToggle={onToggleWrite}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface MiniToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

function MiniToggle({ enabled, onToggle, disabled }: MiniToggleProps) {
  return (
    <label 
      className="relative inline-flex cursor-pointer items-center"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <div
        className="h-4 w-7 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-3"
        style={{
          backgroundColor: enabled
            ? "var(--color-accent)"
            : "var(--color-bg-tertiary)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
    </label>
  );
}

interface AgentCardProps {
  icon: typeof Bot;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  comingSoon?: boolean;
}

function AgentCard({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  comingSoon,
}: AgentCardProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-4"
      style={{
        backgroundColor: comingSoon
          ? "var(--color-bg-secondary)"
          : "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
        opacity: comingSoon ? 0.6 : 1,
      }}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: enabled
            ? "var(--color-accent-light)"
            : "var(--color-bg-secondary)",
          color: enabled
            ? "var(--color-accent)"
            : "var(--color-text-tertiary)",
        }}
      >
        <Icon size={20} />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h5
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h5>
          {comingSoon && (
            <span
              className="rounded px-1.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Coming Soon
            </span>
          )}
        </div>
        <p
          className="mt-0.5 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      </div>

      {!comingSoon && (
        <ToggleSwitch enabled={enabled} onToggle={onToggle} />
      )}
    </div>
  );
}

export default AgentSettings;
