import { useEffect, useState } from "react";
import {
  Tag,
  Link2,
  Bot,
  Search,
  Image,
  Sparkles,
  GitBranch,
  FileText,
  Loader2,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type {
  AgentConfig,
  WebSearchProvider,
  ImageProvider,
} from "../../types/agent";
import { DEFAULT_AGENT_CONFIG } from "../../types/agent";
import * as agentsApi from "../../lib/agents";

/**
 * Agent settings tab - configure background and inline AI agents
 */
export function AgentSettings() {
  const { agentSettings, setTaggingEnabled, setShowAgentActivity } =
    useSettingsStore();

  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loadedConfig = await agentsApi.getAgentConfig();
      setConfig(loadedConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setIsLoading(false);
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

  const toggleTool = (toolName: string, enabled: boolean) => {
    const newEnabledTools = enabled
      ? [...config.enabledTools, toolName]
      : config.enabledTools.filter((t) => t !== toolName);
    saveConfig({ ...config, enabledTools: newEnabledTools });
  };

  const isToolEnabled = (toolName: string) =>
    config.enabledTools.includes(toolName);

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

      {/* Inline Assistant Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4
              className="text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Inline Assistant
            </h4>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              AI assistant that helps you research, create content, and generate
              visuals within your notes.
            </p>
          </div>
          <ToggleSwitch
            enabled={config.enabled}
            onToggle={(enabled) => saveConfig({ ...config, enabled })}
            saving={isSaving}
          />
        </div>

        {config.enabled && (
          <>
            {/* Available Tools */}
            <div className="mb-4 space-y-2">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Available Tools
              </p>
              <div className="grid gap-2">
                <ToolToggle
                  icon={Search}
                  label="Search Notes"
                  description="Search your notes for relevant information"
                  enabled={isToolEnabled("search_notes")}
                  configured={true}
                  onToggle={(enabled) => toggleTool("search_notes", enabled)}
                />
                <ToolToggle
                  icon={FileText}
                  label="Write Content"
                  description="Generate markdown content"
                  enabled={true}
                  configured={true}
                  disabled={true}
                  onToggle={() => {}}
                />
                <ToolToggle
                  icon={GitBranch}
                  label="Mermaid Diagrams"
                  description="Create flowcharts, sequence diagrams, etc."
                  enabled={isToolEnabled("create_mermaid")}
                  configured={true}
                  onToggle={(enabled) => toggleTool("create_mermaid", enabled)}
                />
                <ToolToggle
                  icon={Sparkles}
                  label="Excalidraw Sketches"
                  description="Create hand-drawn style diagrams"
                  enabled={isToolEnabled("create_excalidraw")}
                  configured={true}
                  onToggle={(enabled) =>
                    toggleTool("create_excalidraw", enabled)
                  }
                />
              </div>
            </div>

            {/* Web Search Configuration */}
            <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search size={16} style={{ color: "var(--color-text-secondary)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Web Search
                  </span>
                </div>
                <ToggleSwitch
                  enabled={isToolEnabled("web_search")}
                  onToggle={(enabled) => toggleTool("web_search", enabled)}
                  saving={isSaving}
                />
              </div>
              
              {isToolEnabled("web_search") && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: "var(--color-text-secondary)" }}>
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
                      <label className="mb-1 block text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey.webSearch ? "text" : "password"}
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
                          onClick={() => setShowApiKey({ ...showApiKey, webSearch: !showApiKey.webSearch })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {showApiKey.webSearch ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Image Configuration */}
            <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image size={16} style={{ color: "var(--color-text-secondary)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Images
                  </span>
                </div>
                <ToggleSwitch
                  enabled={isToolEnabled("fetch_image") || isToolEnabled("generate_image")}
                  onToggle={(enabled) => {
                    if (enabled) {
                      toggleTool("fetch_image", true);
                    } else {
                      // Remove both tools in a single save to avoid race condition
                      const newEnabledTools = config.enabledTools.filter(
                        (t) => t !== "fetch_image" && t !== "generate_image"
                      );
                      saveConfig({ ...config, enabledTools: newEnabledTools });
                    }
                  }}
                  saving={isSaving}
                />
              </div>
              
              {(isToolEnabled("fetch_image") || isToolEnabled("generate_image")) && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      Image Source
                    </label>
                    <select
                      value={config.image.provider}
                      onChange={(e) =>
                        saveConfig({
                          ...config,
                          image: {
                            ...config.image,
                            provider: e.target.value as ImageProvider,
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
                      <option value="none">Select a source</option>
                      <option value="unsplash">Unsplash (stock photos)</option>
                      <option value="dallE">DALL-E (AI generation)</option>
                      <option value="stableDiffusion">Stable Diffusion</option>
                    </select>
                  </div>
                  
                  {config.image.provider === "unsplash" && (
                    <div>
                      <label className="mb-1 block text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        Unsplash Access Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey.unsplash ? "text" : "password"}
                          value={config.image.unsplashAccessKey || ""}
                          onChange={(e) =>
                            saveConfig({
                              ...config,
                              image: {
                                ...config.image,
                                unsplashAccessKey: e.target.value || undefined,
                              },
                            })
                          }
                          placeholder="Enter access key"
                          className="w-full rounded-lg border px-3 py-2 pr-10 text-sm"
                          style={{
                            backgroundColor: "var(--color-bg-secondary)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                        <button
                          onClick={() => setShowApiKey({ ...showApiKey, unsplash: !showApiKey.unsplash })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {showApiKey.unsplash ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.image.allowGeneration}
                      onChange={(e) =>
                        saveConfig({
                          ...config,
                          image: {
                            ...config.image,
                            allowGeneration: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 rounded"
                      style={{ accentColor: "var(--color-accent)" }}
                    />
                    <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                      Allow AI image generation
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Diagram Format */}
            <div className="mb-4">
              <label className="mb-1 block text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Default Diagram Format
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    saveConfig({
                      ...config,
                      diagram: { ...config.diagram, defaultFormat: "mermaid" },
                    })
                  }
                  className="flex-1 rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor:
                      config.diagram.defaultFormat === "mermaid"
                        ? "var(--color-accent-light)"
                        : "var(--color-bg-secondary)",
                    borderColor:
                      config.diagram.defaultFormat === "mermaid"
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    color:
                      config.diagram.defaultFormat === "mermaid"
                        ? "var(--color-accent)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  Mermaid
                </button>
                <button
                  onClick={() =>
                    saveConfig({
                      ...config,
                      diagram: { ...config.diagram, defaultFormat: "excalidraw" },
                    })
                  }
                  className="flex-1 rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor:
                      config.diagram.defaultFormat === "excalidraw"
                        ? "var(--color-accent-light)"
                        : "var(--color-bg-secondary)",
                    borderColor:
                      config.diagram.defaultFormat === "excalidraw"
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    color:
                      config.diagram.defaultFormat === "excalidraw"
                        ? "var(--color-accent)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  Excalidraw
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <hr style={{ borderColor: "var(--color-border)" }} />

      {/* Background Agents Section */}
      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Background Agents
        </h4>
        <p
          className="mb-4 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          These agents run automatically in the background to enhance your
          notes.
        </p>

        <div className="space-y-3">
          {/* Auto-Tagging Agent */}
          <AgentCard
            icon={Tag}
            title="Auto-Tagging Agent"
            description="Automatically analyzes notes and assigns relevant tags when you save changes."
            enabled={agentSettings.taggingEnabled}
            onToggle={setTaggingEnabled}
          />

          {/* Connection Agent - Coming Soon */}
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

      {/* Advanced Section */}
      <div>
        <h4
          className="mb-2 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Advanced
        </h4>

        <label className="flex cursor-pointer items-start gap-3 py-2">
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
              Display what tools agents used when processing your notes (useful
              for debugging)
            </p>
          </div>
        </label>
      </div>
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

interface ToolToggleProps {
  icon: typeof Bot;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

function ToolToggle({
  icon: Icon,
  label,
  description,
  enabled,
  configured,
  disabled,
  onToggle,
}: ToolToggleProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon
        size={16}
        style={{
          color: enabled ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {label}
          </span>
          {!configured && (
            <span
              className="rounded px-1 text-xs"
              style={{
                backgroundColor: "var(--color-warning-light)",
                color: "var(--color-warning)",
              }}
            >
              Not configured
            </span>
          )}
        </div>
        <p
          className="text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      </div>
      {!disabled && (
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded"
          style={{ accentColor: "var(--color-accent)" }}
        />
      )}
      {disabled && (
        <Check size={16} style={{ color: "var(--color-accent)" }} />
      )}
    </div>
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
