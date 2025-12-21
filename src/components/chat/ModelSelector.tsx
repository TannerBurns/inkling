import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "../../stores/settingsStore";
import { getProviderDisplayName, isLocalProvider } from "../../types/ai";
import { getModelsForProvider, findModelById, type ModelDefinition } from "../../types/models";

/** Strip known provider prefixes from model name (for cloud providers only) */
function stripKnownPrefix(model: string): string {
  const knownPrefixes = ["openai/", "anthropic/", "google/", "ollama/", "lmstudio/"];
  for (const prefix of knownPrefixes) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

/**
 * Compact dropdown for selecting AI provider and model in the chat header
 */
export function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const {
    aiConfig,
    loadAIConfig,
    updateProvider,
    setDefaultProvider,
  } = useSettingsStore();

  // Load AI config on mount
  useEffect(() => {
    if (!aiConfig) {
      loadAIConfig();
    }
  }, [aiConfig, loadAIConfig]);

  // Calculate dropdown position when opening
  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap below button
        right: window.innerWidth - rect.right, // Align to right edge of button
      });
    }
  }, []);

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!aiConfig) {
    return (
      <div
        className="rounded px-2 py-1 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Loading...
      </div>
    );
  }

  // Get enabled providers
  const enabledProviders = aiConfig.providers.filter((p) => p.isEnabled);

  // Get current provider and model
  const currentProvider = aiConfig.defaultProvider
    ? aiConfig.providers.find((p) => p.id === aiConfig.defaultProvider)
    : enabledProviders[0];

  const currentModel = currentProvider?.selectedModel || currentProvider?.models[0];

  // Get display name from curated models or fall back to raw model name
  const getDisplayName = (modelId: string): string => {
    const modelDef = findModelById(modelId);
    return modelDef?.displayName || modelId;
  };

  // Format display text
  const displayText = currentModel
    ? getDisplayName(currentModel)
    : currentProvider
      ? getProviderDisplayName(currentProvider.type)
      : "No AI";

  const handleSelectModel = async (providerId: string, model: string) => {
    const provider = aiConfig.providers.find((p) => p.id === providerId);
    if (!provider) return;

    // For local providers (Ollama, LM Studio), preserve the full model name
    // as it might contain "/" as part of the actual model identifier
    // For cloud providers, we can strip known provider prefixes
    const modelName = isLocalProvider(provider.type) ? model : stripKnownPrefix(model);

    // Update the provider's selected model
    await updateProvider({
      ...provider,
      selectedModel: modelName,
    });

    // Set as default provider if not already
    if (aiConfig.defaultProvider !== providerId) {
      await setDefaultProvider(providerId);
    }

    setIsOpen(false);
  };

  // Get models for a provider - use curated models for cloud providers, raw models for local
  const getModelsForProviderDisplay = (provider: typeof enabledProviders[0]): { id: string; displayName: string }[] => {
    if (isLocalProvider(provider.type)) {
      // For local providers (Ollama, LM Studio), use the detected models
      return provider.models.map((m) => ({ id: m, displayName: m }));
    }
    
    // For cloud providers, use curated models
    const curatedModels = getModelsForProvider(provider.type);
    if (curatedModels.length > 0) {
      return curatedModels.map((m: ModelDefinition) => ({ id: m.id, displayName: m.displayName }));
    }
    
    // Fallback to provider's models
    return provider.models.map((m) => ({ id: m, displayName: getDisplayName(m) }));
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="max-w-[120px] truncate">{displayText}</span>
        <svg
          className={`h-3 w-3 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu - rendered via portal to escape overflow clipping */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[220px] max-h-[350px] overflow-y-auto rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
            top: dropdownPosition.top,
            right: dropdownPosition.right,
          }}
        >
          {enabledProviders.length === 0 ? (
            <div
              className="p-3 text-xs text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No providers enabled.
              <br />
              Configure in Settings.
            </div>
          ) : (
            enabledProviders.map((provider) => {
              const models = getModelsForProviderDisplay(provider);
              
              return (
                <div key={provider.id}>
                  {/* Provider header */}
                  <div
                    className="sticky top-0 px-3 py-1.5 text-xs font-medium border-b"
                    style={{
                      color: "var(--color-text-tertiary)",
                      backgroundColor: "var(--color-bg-secondary)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    {provider.name}
                  </div>

                  {/* Models */}
                  {models.length > 0 ? (
                    models.map((model) => {
                      const isSelected =
                        currentProvider?.id === provider.id &&
                        (currentModel === model.id || (!currentModel && model.id === models[0]?.id));

                      return (
                        <button
                          key={model.id}
                          onClick={() => handleSelectModel(provider.id, model.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                        >
                          {/* Check mark */}
                          <span
                            className="w-4 flex-shrink-0"
                            style={{ color: "var(--color-accent)" }}
                          >
                            {isSelected && (
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </span>
                          <span
                            className="truncate"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {model.displayName}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      No models available
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default ModelSelector;
